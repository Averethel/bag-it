#!/usr/bin/env python3
"""Export a trained LEGO manual-crop pair scorer to browser ONNX artifacts."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import torch
import torch.nn as nn
from torchvision import models


DEFAULT_THRESHOLD = 0.9961420893669128
DEFAULT_MODEL_ID = "manual-crop-cnn-hardneg-v4-closure-fixed-v1"
MODEL_NAMES = ("mobilenet_v3_small", "mobilenet_v3_large")


class PairHead(nn.Module):
    def __init__(self, feature_size: int, hidden_size: int) -> None:
        super().__init__()
        self.layers = nn.Sequential(
            nn.Linear(feature_size * 4, hidden_size),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_size, hidden_size // 2),
            nn.ReLU(),
            nn.Linear(hidden_size // 2, 1),
        )

    def forward(self, left: torch.Tensor, right: torch.Tensor) -> torch.Tensor:
        features = torch.cat([left, right, torch.abs(left - right), left * right], dim=1)
        return self.layers(features).squeeze(1)


class FeatureExtractor(nn.Module):
    def __init__(self, model: nn.Module) -> None:
        super().__init__()
        self.features = model.features
        self.avgpool = model.avgpool

    def forward(self, images: torch.Tensor) -> torch.Tensor:
        features = self.features(images)
        features = self.avgpool(features)
        features = torch.flatten(features, 1)
        return nn.functional.normalize(features, dim=1)


class PairHeadWithSigmoid(nn.Module):
    def __init__(self, pair_head: PairHead) -> None:
        super().__init__()
        self.pair_head = pair_head

    def forward(self, left_features: torch.Tensor, right_features: torch.Tensor) -> torch.Tensor:
        return torch.sigmoid(self.pair_head(left_features, right_features))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD)
    parser.add_argument("--model-id", default=DEFAULT_MODEL_ID)
    parser.add_argument("--opset", type=int, default=17)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    checkpoint = torch.load(args.checkpoint, map_location="cpu", weights_only=False)
    summary = checkpoint.get("summary") or {}
    options = summary.get("options") or {}
    class_to_index = checkpoint["classToIndex"]
    model_name = checkpoint.get("modelName") or summary.get("model") or "mobilenet_v3_large"

    if model_name not in MODEL_NAMES:
        raise SystemExit(f"Unsupported model name: {model_name}")

    image_size = int(options.get("imageSize") or 160)
    hidden_size = int(options.get("pairHeadHiddenSize") or 1024)
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    model = create_model(len(class_to_index), model_name)
    model.load_state_dict(checkpoint["modelStateDict"])
    feature_extractor = FeatureExtractor(model).eval()

    with torch.no_grad():
        sample_image = torch.zeros(1, 3, image_size, image_size, dtype=torch.float32)
        sample_embedding = feature_extractor(sample_image)
        feature_size = int(sample_embedding.shape[1])

    pair_head_state = checkpoint.get("pairHeadStateDict")
    if not pair_head_state:
        raise SystemExit("Checkpoint does not contain a pair head.")

    pair_head = PairHead(feature_size, hidden_size)
    pair_head.load_state_dict(pair_head_state)
    pair_model = PairHeadWithSigmoid(pair_head).eval()

    export_feature_extractor(feature_extractor, output_dir / "feature-extractor.onnx", image_size, args.opset)
    export_pair_head(pair_model, output_dir / "pair-head.onnx", feature_size, args.opset)
    write_metadata(
        output_dir,
        args.model_id,
        args.threshold,
        image_size,
        feature_size,
        hidden_size,
        model_name,
        summary,
    )

    classes_path = args.checkpoint.with_name("model-classes.json")
    if classes_path.exists():
        shutil.copyfile(classes_path, output_dir / "model-classes.json")


def create_model(class_count: int, model_name: str) -> nn.Module:
    if model_name == "mobilenet_v3_large":
        model = models.mobilenet_v3_large(weights=None)
    elif model_name == "mobilenet_v3_small":
        model = models.mobilenet_v3_small(weights=None)
    else:
        raise SystemExit(f"Unsupported model: {model_name}")

    input_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(input_features, class_count)
    return model


def export_feature_extractor(
    feature_extractor: nn.Module,
    output_path: Path,
    image_size: int,
    opset: int,
) -> None:
    sample_image = torch.zeros(1, 3, image_size, image_size, dtype=torch.float32)
    torch.onnx.export(
        feature_extractor,
        sample_image,
        output_path,
        dynamo=False,
        input_names=["images"],
        output_names=["embeddings"],
        dynamic_axes={
            "images": {0: "batch"},
            "embeddings": {0: "batch"},
        },
        opset_version=opset,
    )


def export_pair_head(
    pair_model: nn.Module,
    output_path: Path,
    feature_size: int,
    opset: int,
) -> None:
    sample_features = torch.zeros(1, feature_size, dtype=torch.float32)
    torch.onnx.export(
        pair_model,
        (sample_features, sample_features),
        output_path,
        dynamo=False,
        input_names=["leftFeatures", "rightFeatures"],
        output_names=["scores"],
        dynamic_axes={
            "leftFeatures": {0: "batch"},
            "rightFeatures": {0: "batch"},
            "scores": {0: "batch"},
        },
        opset_version=opset,
    )


def write_metadata(
    output_dir: Path,
    model_id: str,
    threshold: float,
    image_size: int,
    feature_size: int,
    hidden_size: int,
    model_name: str,
    summary: dict[str, object],
) -> None:
    metadata = {
        "featureName": "cachedPairScore",
        "featureSize": feature_size,
        "imageSize": image_size,
        "mean": [0.485, 0.456, 0.406],
        "model": model_name,
        "modelId": model_id,
        "pairHeadHiddenSize": hidden_size,
        "scorer": summary.get("scorer"),
        "std": [0.229, 0.224, 0.225],
        "threshold": threshold,
        "trainingSummary": {
            "generatedAt": summary.get("generatedAt"),
            "sourceThreshold": summary.get("threshold"),
            "sourceSuggestedThreshold": summary.get("suggestedThreshold"),
        },
    }
    (output_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
