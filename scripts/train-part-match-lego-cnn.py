#!/usr/bin/env python3
"""Private LEGO-specific CNN embedding spike.

This trainer is intentionally lab-only. It trains a supervised classifier on
known LEGO part ids, then evaluates the penultimate CNN feature space as a
same-part embedding under the project rule: choose thresholds from negatives,
never by allowing false positives.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import torch
import torch.nn as nn
from PIL import Image, ImageOps
from torch.utils.data import DataLoader, Dataset
from torchvision import models
from torchvision.transforms import functional as TF
from tqdm import tqdm


VERSION = "0.1.1"
DEFAULT_OUTPUT_ROOT = Path(".bag-it/private/part-match-reports/embedding-experiments")
THRESHOLD_EPSILON = 1e-6
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
DEFAULT_MODEL_NAME = "mobilenet_v3_small"
MODEL_NAMES = ("mobilenet_v3_small", "mobilenet_v3_large")


@dataclass(frozen=True)
class Example:
    example_id: str
    image_path: Path
    part_id: str
    source: str
    fold: int
    view: str | None = None
    trainable: bool = True


@dataclass(frozen=True)
class Pair:
    left_example_id: str
    right_example_id: str
    target: int
    split: str
    kind: str


class LegoImageDataset(Dataset[tuple[torch.Tensor, int]]):
    def __init__(
        self,
        examples: list[Example],
        class_to_index: dict[str, int],
        image_size: int,
        training: bool,
    ) -> None:
        self.examples = examples
        self.class_to_index = class_to_index
        self.image_size = image_size
        self.training = training

    def __len__(self) -> int:
        return len(self.examples)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, int]:
        example = self.examples[index]
        tensor = image_to_model_tensor(example.image_path, self.image_size, self.training)
        return tensor, self.class_to_index[example.part_id]


class LegoPairDataset(Dataset[tuple[torch.Tensor, torch.Tensor, torch.Tensor]]):
    def __init__(
        self,
        pairs: list[Pair],
        examples_by_id: dict[str, Example],
        image_size: int,
        training: bool,
    ) -> None:
        self.pairs = pairs
        self.examples_by_id = examples_by_id
        self.image_size = image_size
        self.training = training

    def __len__(self) -> int:
        return len(self.pairs)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        pair = self.pairs[index]
        left = self.examples_by_id[pair.left_example_id]
        right = self.examples_by_id[pair.right_example_id]
        target = torch.tensor(float(pair.target), dtype=torch.float32)
        return (
            image_to_model_tensor(left.image_path, self.image_size, self.training),
            image_to_model_tensor(right.image_path, self.image_size, self.training),
            target,
        )


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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train private LEGO-specific CNN embedding scorer.")
    parser.add_argument("--lego-training-dir", type=Path, help="Existing lab:part-match-lego-training-data output dir.")
    parser.add_argument("--eval-lego-training-dir", type=Path, help="Additional lab:part-match-lego-training-data dir used for scoring only.")
    parser.add_argument("--external-root", type=Path, help="Extracted MostWiedzy/B200-style dataset root.")
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--checkpoint", type=Path, help="Previously saved model.pt to evaluate or continue from.")
    parser.add_argument("--model", choices=MODEL_NAMES, default=None)
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--metric-epochs", type=int, default=0)
    parser.add_argument("--batch-size", type=int, default=48)
    parser.add_argument("--metric-batch-size", type=int, default=32)
    parser.add_argument("--embedding-batch-size", type=int, default=64)
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument("--image-size", type=int, default=128)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--metric-learning-rate", type=float, default=5e-5)
    parser.add_argument("--metric-negative-margin", type=float, default=0.45)
    parser.add_argument("--metric-max-train-pairs", type=int, default=0)
    parser.add_argument("--pair-head-epochs", type=int, default=0)
    parser.add_argument("--pair-head-batch-size", type=int, default=512)
    parser.add_argument("--pair-head-learning-rate", type=float, default=3e-4)
    parser.add_argument("--pair-head-hidden-size", type=int, default=256)
    parser.add_argument("--pair-head-max-train-pairs", type=int, default=0)
    parser.add_argument(
        "--pair-head-hard-negative-score-dir",
        type=Path,
        help="Previous score dir whose high-scoring false pairs should be replayed.",
    )
    parser.add_argument("--pair-head-hard-negative-min-score", type=float, default=0.0)
    parser.add_argument("--pair-head-hard-negative-repeat", type=int, default=0)
    parser.add_argument("--auto-threshold-floor", type=float, default=0.0)
    parser.add_argument("--suggested-train-error-budget", type=float, default=0.001)
    parser.add_argument("--suggested-error-budget", type=float, default=0.005)
    parser.add_argument("--max-examples-per-class", type=int, default=80)
    parser.add_argument("--max-classes", type=int, default=0)
    parser.add_argument("--validation-fold", type=int, default=0)
    parser.add_argument("--fold-count", type=int, default=5)
    parser.add_argument("--max-pairs-per-split", type=int, default=50000)
    parser.add_argument("--device", choices=["auto", "cpu", "mps", "cuda"], default="auto")
    parser.add_argument("--no-pretrained", action="store_true")
    parser.add_argument("--seed", type=int, default=20260625)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    random.seed(args.seed)
    torch.manual_seed(args.seed)

    if not args.lego_training_dir and not args.eval_lego_training_dir and not args.external_root:
        raise SystemExit("Provide --lego-training-dir, --eval-lego-training-dir, or --external-root.")

    started_at = time.time()
    output_dir = args.output_dir or DEFAULT_OUTPUT_ROOT / f"{timestamp_for_path()}-lego-cnn"
    output_dir.mkdir(parents=True, exist_ok=True)

    examples: list[Example] = []
    pairs: list[Pair] = []
    if args.external_root:
        external_examples = read_external_examples(
            args.external_root,
            fold_count=args.fold_count,
            max_examples_per_class=args.max_examples_per_class,
            max_classes=args.max_classes,
        )
        examples.extend(external_examples)
        pairs.extend(build_pairs_from_examples(
            external_examples,
            validation_fold=args.validation_fold,
            max_pairs_per_split=args.max_pairs_per_split,
            kind_prefix="external",
        ))

    if args.lego_training_dir:
        lego_examples, lego_pairs = read_lego_training_examples(
            args.lego_training_dir,
            source="lego-training-data",
            trainable=True,
            split_override=None,
        )
        examples.extend(lego_examples)
        pairs.extend(lego_pairs)

    if args.eval_lego_training_dir:
        eval_examples, eval_pairs = read_lego_training_examples(
            args.eval_lego_training_dir,
            source="lego-eval-data",
            trainable=False,
            split_override="validation",
        )
        examples.extend(eval_examples)
        pairs.extend(eval_pairs)

    if not examples:
        raise SystemExit("No examples found.")
    if not pairs:
        raise SystemExit("No pairs found.")

    checkpoint_data = None
    if args.checkpoint:
        checkpoint_data = torch.load(args.checkpoint, map_location="cpu", weights_only=False)
    model_name = args.model or checkpoint_model_name(checkpoint_data) or DEFAULT_MODEL_NAME

    train_examples = [
        example for example in examples
        if example.trainable and example.fold != args.validation_fold
    ]
    validation_examples = [example for example in examples if example.fold == args.validation_fold]
    if checkpoint_data:
        class_to_index = checkpoint_data["classToIndex"]
    else:
        class_to_index = {part_id: index for index, part_id in enumerate(sorted({example.part_id for example in train_examples}))}
    train_examples = [example for example in train_examples if example.part_id in class_to_index]
    if len(class_to_index) < 2:
        raise SystemExit("Need at least two train classes.")

    device = choose_device(args.device)
    model = create_model(len(class_to_index), pretrained=not args.no_pretrained, model_name=model_name).to(device)
    if checkpoint_data:
        model.load_state_dict(checkpoint_data["modelStateDict"])
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate, weight_decay=1e-4)
    criterion = nn.CrossEntropyLoss()
    loader = None
    if train_examples:
        loader = DataLoader(
            LegoImageDataset(train_examples, class_to_index, args.image_size, training=True),
            batch_size=args.batch_size,
            shuffle=True,
            num_workers=args.num_workers,
            pin_memory=device.type == "cuda",
        )

    epoch_summaries = []
    for epoch in range(args.epochs):
        if loader is None:
            break
        model.train()
        total_loss = 0.0
        correct = 0
        total = 0
        progress = tqdm(loader, desc=f"epoch {epoch + 1}/{args.epochs}", leave=False)
        for images, labels in progress:
            images = images.to(device, non_blocking=device.type == "cuda")
            labels = labels.to(device, non_blocking=device.type == "cuda")
            optimizer.zero_grad(set_to_none=True)
            logits = model(images)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()
            total_loss += float(loss.item()) * images.size(0)
            total += images.size(0)
            correct += int((logits.argmax(dim=1) == labels).sum().item())
            progress.set_postfix(loss=total_loss / max(1, total), acc=correct / max(1, total))
        epoch_summaries.append({
            "epoch": epoch + 1,
            "loss": total_loss / max(1, total),
            "trainAccuracy": correct / max(1, total),
        })

    examples_by_id = {example.example_id: example for example in examples}
    metric_pairs = select_metric_training_pairs(
        pairs,
        examples_by_id,
        max_pairs=args.metric_max_train_pairs,
        seed=args.seed,
    )
    metric_epoch_summaries = train_metric_model(
        model,
        metric_pairs,
        examples_by_id,
        image_size=args.image_size,
        batch_size=args.metric_batch_size,
        epochs=args.metric_epochs,
        learning_rate=args.metric_learning_rate,
        negative_margin=args.metric_negative_margin,
        device=device,
        num_workers=args.num_workers,
    )

    feature_examples = sorted(examples, key=lambda example: example.example_id)
    embeddings = embed_examples(
        model,
        feature_examples,
        args.image_size,
        device,
        batch_size=args.embedding_batch_size,
        num_workers=args.num_workers,
    )
    pair_head = None
    pair_head_hidden_size = args.pair_head_hidden_size
    pair_head_initialized_from_checkpoint = False
    pair_head_epoch_summaries: list[dict[str, float | int]] = []
    scorer_kind = "cosine"
    if args.pair_head_epochs > 0:
        feature_size = next(iter(embeddings.values())).numel()
        hard_negative_pair_keys = read_hard_negative_pair_keys(
            args.pair_head_hard_negative_score_dir,
            args.pair_head_hard_negative_min_score,
        )
        pair_head_hidden_size = checkpoint_pair_head_hidden_size(
            checkpoint_data,
            args.pair_head_hidden_size,
        )
        pair_head = PairHead(feature_size, pair_head_hidden_size).to(device)
        checkpoint_pair_head = checkpoint_pair_head_state_dict(checkpoint_data)
        if checkpoint_pair_head:
            pair_head.load_state_dict(checkpoint_pair_head)
            pair_head_initialized_from_checkpoint = True
        pair_head_epoch_summaries = train_pair_head(
            pair_head,
            pairs,
            embeddings,
            batch_size=args.pair_head_batch_size,
            epochs=args.pair_head_epochs,
            learning_rate=args.pair_head_learning_rate,
            max_pairs=args.pair_head_max_train_pairs,
            hard_negative_pair_keys=hard_negative_pair_keys,
            hard_negative_repeat=args.pair_head_hard_negative_repeat,
            device=device,
            seed=args.seed,
        )
        scored_pairs = score_pairs_with_pair_head(
            pairs,
            embeddings,
            pair_head,
            device,
            batch_size=args.pair_head_batch_size,
        )
        scorer_kind = "pair-head"
    elif checkpoint_pair_head_state_dict(checkpoint_data):
        feature_size = next(iter(embeddings.values())).numel()
        pair_head_hidden_size = checkpoint_pair_head_hidden_size(
            checkpoint_data,
            args.pair_head_hidden_size,
        )
        pair_head = PairHead(feature_size, pair_head_hidden_size).to(device)
        pair_head.load_state_dict(checkpoint_pair_head_state_dict(checkpoint_data))
        pair_head_initialized_from_checkpoint = True
        scored_pairs = score_pairs_with_pair_head(
            pairs,
            embeddings,
            pair_head,
            device,
            batch_size=args.pair_head_batch_size,
        )
        scorer_kind = "pair-head-checkpoint"
    else:
        scored_pairs = score_pairs(pairs, embeddings)
    train_scored = [pair for pair in scored_pairs if pair["split"] == "train"]
    validation_scored = [pair for pair in scored_pairs if pair["split"] != "train"]
    raw_threshold = checkpoint_threshold(checkpoint_data) if checkpoint_data and not train_scored else choose_zero_false_positive_threshold(train_scored)
    threshold = max(raw_threshold, args.auto_threshold_floor)
    checkpoint_suggested = checkpoint_suggested_threshold(checkpoint_data) if checkpoint_data and not train_scored else None
    suggested_threshold = checkpoint_suggested if checkpoint_suggested is not None else choose_suggested_threshold(
        train_scored,
        threshold,
        args.suggested_train_error_budget,
    )
    train_totals = summarize_scored_pairs(train_scored, threshold)
    validation_totals = summarize_scored_pairs(validation_scored, threshold)
    train_lane_totals = summarize_two_lane_scored_pairs(train_scored, threshold, suggested_threshold)
    validation_lane_totals = summarize_two_lane_scored_pairs(validation_scored, threshold, suggested_threshold)
    verdict = create_verdict(
        train_totals,
        validation_totals,
        validation_lane_totals,
        suggested_error_budget=args.suggested_error_budget,
    )

    summary = {
        "version": VERSION,
        "generatedAt": iso_now(),
        "durationMs": int((time.time() - started_at) * 1000),
        "device": str(device),
        "model": model_name,
        "pretrained": not args.no_pretrained,
        "options": {
            "legoTrainingDir": str(args.lego_training_dir) if args.lego_training_dir else None,
            "evalLegoTrainingDir": str(args.eval_lego_training_dir) if args.eval_lego_training_dir else None,
            "externalRoot": str(args.external_root) if args.external_root else None,
            "checkpoint": str(args.checkpoint) if args.checkpoint else None,
            "model": model_name,
            "epochs": args.epochs,
            "metricEpochs": args.metric_epochs,
            "batchSize": args.batch_size,
            "metricBatchSize": args.metric_batch_size,
            "embeddingBatchSize": args.embedding_batch_size,
            "numWorkers": args.num_workers,
            "imageSize": args.image_size,
            "learningRate": args.learning_rate,
            "metricLearningRate": args.metric_learning_rate,
            "metricNegativeMargin": args.metric_negative_margin,
            "metricMaxTrainPairs": args.metric_max_train_pairs,
            "pairHeadEpochs": args.pair_head_epochs,
            "pairHeadBatchSize": args.pair_head_batch_size,
            "pairHeadLearningRate": args.pair_head_learning_rate,
            "pairHeadHiddenSize": pair_head_hidden_size,
            "pairHeadHardNegativeMinScore": args.pair_head_hard_negative_min_score,
            "pairHeadHardNegativeRepeat": args.pair_head_hard_negative_repeat,
            "pairHeadHardNegativeScoreDir": (
                str(args.pair_head_hard_negative_score_dir)
                if args.pair_head_hard_negative_score_dir
                else None
            ),
            "pairHeadInitializedFromCheckpoint": pair_head_initialized_from_checkpoint,
            "pairHeadMaxTrainPairs": args.pair_head_max_train_pairs,
            "autoThresholdFloor": args.auto_threshold_floor,
            "suggestedTrainErrorBudget": args.suggested_train_error_budget,
            "suggestedErrorBudget": args.suggested_error_budget,
            "maxExamplesPerClass": args.max_examples_per_class,
            "maxClasses": args.max_classes,
            "validationFold": args.validation_fold,
            "foldCount": args.fold_count,
            "maxPairsPerSplit": args.max_pairs_per_split,
        },
        "examples": {
            "total": len(examples),
            "train": len(train_examples),
            "validation": len(validation_examples),
            "classesTotal": len({example.part_id for example in examples}),
            "classesTrain": len(class_to_index),
        },
        "pairs": {
            "total": len(scored_pairs),
            "train": len(train_scored),
            "validation": len(validation_scored),
        },
        "rawThreshold": raw_threshold,
        "threshold": threshold,
        "suggestedThreshold": suggested_threshold,
        "scorer": scorer_kind,
        "epochs": epoch_summaries,
        "metricEpochs": metric_epoch_summaries,
        "pairHeadEpochs": pair_head_epoch_summaries,
        "metricTrainingPairs": len(metric_pairs),
        "trainScore": train_totals,
        "validationScore": validation_totals,
        "trainLaneScore": train_lane_totals,
        "validationLaneScore": validation_lane_totals,
        "verdict": verdict,
    }

    write_json(output_dir / "summary.json", summary)
    write_json(output_dir / "pairs.json", scored_pairs)
    write_json(output_dir / "model-classes.json", {
        "classes": sorted(class_to_index, key=lambda key: class_to_index[key]),
        "version": VERSION,
    })
    torch.save({
        "classToIndex": class_to_index,
        "modelName": model_name,
        "modelStateDict": model.state_dict(),
        "pairHeadStateDict": pair_head.state_dict() if pair_head else None,
        "summary": summary,
    }, output_dir / "model.pt")
    (output_dir / "index.html").write_text(render_index_html(summary, scored_pairs), encoding="utf-8")
    print(json.dumps({
        "outputDir": str(output_dir),
        "rawThreshold": raw_threshold,
        "threshold": threshold,
        "suggestedThreshold": suggested_threshold,
        "scorer": scorer_kind,
        "train": train_totals,
        "validation": validation_totals,
        "trainLanes": train_lane_totals,
        "validationLanes": validation_lane_totals,
        "verdict": verdict,
    }, indent=2))


def read_lego_training_examples(
    root: Path,
    source: str,
    trainable: bool,
    split_override: str | None,
) -> tuple[list[Example], list[Pair]]:
    examples_data = read_json(root / "examples.json")
    pairs_data = read_json(root / "pairs.json")
    examples = [
        Example(
            example_id=row["exampleId"],
            image_path=root / row["imagePath"],
            part_id=str(row["partId"]),
            source=source,
            fold=int(row["fold"]),
            view=row.get("view"),
            trainable=trainable,
        )
        for row in examples_data.get("examples", [])
    ]
    pairs = [
        Pair(
            left_example_id=row["leftExampleId"],
            right_example_id=row["rightExampleId"],
            target=int(row["target"]),
            split=split_override or row.get("split", "train"),
            kind=f"{source}:{row.get('kind', 'lego-training-pair')}",
        )
        for row in pairs_data.get("pairs", [])
    ]
    return examples, pairs


def read_external_examples(
    root: Path,
    fold_count: int,
    max_examples_per_class: int,
    max_classes: int,
) -> list[Example]:
    nested_roots = [base for base in (root / "photos", root / "renders") if base.exists()]
    candidate_roots = nested_roots or [root]
    examples: list[Example] = []
    selected_classes: set[str] = set()
    by_part: dict[str, list[tuple[Path, str]]] = {}
    for base in candidate_roots:
        if not base.exists():
            continue
        for class_dir in sorted(path for path in base.iterdir() if path.is_dir()):
            part_id = class_dir.name
            if part_id not in selected_classes and max_classes > 0 and len(selected_classes) >= max_classes:
                break
            image_paths = [
                path for path in sorted(class_dir.rglob("*"))
                if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
            ]
            if not image_paths:
                continue
            selected_classes.add(part_id)
            by_part.setdefault(part_id, []).extend((path, base.name) for path in image_paths)

    for part_id in sorted(by_part):
        image_rows = by_part[part_id][:max_examples_per_class]
        if len(image_rows) < 2:
            continue
        for index, (image_path, source_name) in enumerate(image_rows):
            examples.append(Example(
                example_id=f"external:{part_id}:{index}",
                image_path=image_path,
                part_id=part_id,
                source=f"external:{source_name}",
                fold=stable_fold(part_id, fold_count),
                trainable=True,
            ))
    return examples


def build_pairs_from_examples(
    examples: list[Example],
    validation_fold: int,
    max_pairs_per_split: int,
    kind_prefix: str,
) -> list[Pair]:
    by_part: dict[str, list[Example]] = {}
    for example in examples:
        by_part.setdefault(example.part_id, []).append(example)

    positives: list[Pair] = []
    negatives: list[Pair] = []
    parts = sorted(by_part)
    for part_id, group in by_part.items():
        for left, right in zip(group[::2], group[1::2], strict=False):
            positives.append(Pair(
                left_example_id=left.example_id,
                right_example_id=right.example_id,
                target=1,
                split="validation" if left.fold == validation_fold else "train",
                kind=f"{kind_prefix}-same-class",
            ))
    for index, part_id in enumerate(parts):
        for offset in (1, 2, 3, 5, 8):
            other_id = parts[(index + offset) % len(parts)]
            for left, right in zip(by_part[part_id][:10], by_part[other_id][:10], strict=False):
                negatives.append(Pair(
                    left_example_id=left.example_id,
                    right_example_id=right.example_id,
                    target=0,
                    split="validation" if left.fold == validation_fold else "train",
                    kind=f"{kind_prefix}-different-class",
                ))

    return balanced_limit(positives, max_pairs_per_split) + balanced_limit(negatives, max_pairs_per_split)


def load_rgb_image(path: Path) -> Image.Image:
    image = Image.open(path)
    if image.mode == "RGBA":
        background = Image.new("RGBA", image.size, (245, 245, 242, 255))
        background.alpha_composite(image)
        return background.convert("RGB")
    return image.convert("RGB")


def image_to_model_tensor(path: Path, image_size: int, training: bool) -> torch.Tensor:
    image = load_rgb_image(path)
    if training:
        image = augment_image(image)
    image = ImageOps.contain(image, (image_size, image_size), Image.Resampling.BICUBIC)
    canvas = Image.new("RGB", (image_size, image_size), (245, 245, 242))
    offset = ((image_size - image.width) // 2, (image_size - image.height) // 2)
    canvas.paste(image, offset)
    tensor = TF.to_tensor(canvas)
    return TF.normalize(tensor, mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])


def augment_image(image: Image.Image) -> Image.Image:
    if random.random() < 0.5:
        image = TF.hflip(image)
    angle = random.uniform(-7, 7)
    translate = (random.uniform(-3, 3), random.uniform(-3, 3))
    scale = random.uniform(0.92, 1.08)
    image = TF.affine(image, angle=angle, translate=translate, scale=scale, shear=[0.0, 0.0], fill=(245, 245, 242))
    if random.random() < 0.6:
        image = TF.adjust_brightness(image, random.uniform(0.88, 1.12))
        image = TF.adjust_contrast(image, random.uniform(0.88, 1.12))
    return image


def create_model(class_count: int, pretrained: bool, model_name: str) -> nn.Module:
    if model_name == "mobilenet_v3_large":
        weights = models.MobileNet_V3_Large_Weights.DEFAULT if pretrained else None
        model = models.mobilenet_v3_large(weights=weights)
    elif model_name == "mobilenet_v3_small":
        weights = models.MobileNet_V3_Small_Weights.DEFAULT if pretrained else None
        model = models.mobilenet_v3_small(weights=weights)
    else:
        raise SystemExit(f"Unsupported model: {model_name}")
    input_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(input_features, class_count)
    return model


def extract_features(model: nn.Module, images: torch.Tensor) -> torch.Tensor:
    features = model.features(images)
    features = model.avgpool(features)
    features = torch.flatten(features, 1)
    return nn.functional.normalize(features, dim=1)


def select_metric_training_pairs(
    pairs: list[Pair],
    examples_by_id: dict[str, Example],
    max_pairs: int,
    seed: int,
) -> list[Pair]:
    train_pairs = [
        pair for pair in pairs
        if pair.split == "train"
        and pair.left_example_id in examples_by_id
        and pair.right_example_id in examples_by_id
        and examples_by_id[pair.left_example_id].trainable
        and examples_by_id[pair.right_example_id].trainable
    ]
    positives = [pair for pair in train_pairs if pair.target == 1]
    negatives = [pair for pair in train_pairs if pair.target == 0]
    if max_pairs <= 0 or len(train_pairs) <= max_pairs:
        return train_pairs
    rng = random.Random(seed)
    rng.shuffle(positives)
    rng.shuffle(negatives)
    positive_limit = min(len(positives), max_pairs // 2)
    negative_limit = min(len(negatives), max_pairs - positive_limit)
    selected = positives[:positive_limit] + negatives[:negative_limit]
    rng.shuffle(selected)
    return selected


def train_metric_model(
    model: nn.Module,
    pairs: list[Pair],
    examples_by_id: dict[str, Example],
    image_size: int,
    batch_size: int,
    epochs: int,
    learning_rate: float,
    negative_margin: float,
    device: torch.device,
    num_workers: int,
) -> list[dict[str, float | int]]:
    if epochs <= 0 or not pairs:
        return []
    dataset = LegoPairDataset(pairs, examples_by_id, image_size, training=True)
    loader = DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=device.type == "cuda",
    )
    optimizer = torch.optim.AdamW(model.features.parameters(), lr=learning_rate, weight_decay=1e-5)
    epoch_summaries: list[dict[str, float | int]] = []
    for epoch in range(epochs):
        model.train()
        total_loss = 0.0
        total = 0
        positive_similarity_sum = 0.0
        positive_count = 0
        negative_similarity_sum = 0.0
        negative_count = 0
        progress = tqdm(loader, desc=f"metric {epoch + 1}/{epochs}", leave=False)
        for left_images, right_images, targets in progress:
            left_images = left_images.to(device, non_blocking=device.type == "cuda")
            right_images = right_images.to(device, non_blocking=device.type == "cuda")
            targets = targets.to(device, non_blocking=device.type == "cuda")
            optimizer.zero_grad(set_to_none=True)
            features = extract_features(model, torch.cat([left_images, right_images], dim=0))
            left_features, right_features = features.chunk(2, dim=0)
            similarities = torch.sum(left_features * right_features, dim=1)
            positive_loss = targets * torch.square(1.0 - similarities)
            negative_loss = (1.0 - targets) * torch.square(torch.relu(similarities - negative_margin))
            loss = (positive_loss + negative_loss).mean()
            loss.backward()
            optimizer.step()

            batch_size_actual = int(targets.numel())
            total += batch_size_actual
            total_loss += float(loss.item()) * batch_size_actual
            positive_mask = targets >= 0.5
            negative_mask = targets < 0.5
            if torch.any(positive_mask):
                positive_similarity_sum += float(similarities[positive_mask].sum().item())
                positive_count += int(positive_mask.sum().item())
            if torch.any(negative_mask):
                negative_similarity_sum += float(similarities[negative_mask].sum().item())
                negative_count += int(negative_mask.sum().item())
            progress.set_postfix(loss=total_loss / max(1, total))
        epoch_summaries.append({
            "epoch": epoch + 1,
            "loss": total_loss / max(1, total),
            "positiveMeanSimilarity": positive_similarity_sum / max(1, positive_count),
            "negativeMeanSimilarity": negative_similarity_sum / max(1, negative_count),
            "pairs": total,
        })
    return epoch_summaries


def train_pair_head(
    pair_head: PairHead,
    pairs: list[Pair],
    embeddings: dict[str, torch.Tensor],
    batch_size: int,
    epochs: int,
    learning_rate: float,
    max_pairs: int,
    hard_negative_pair_keys: set[str],
    hard_negative_repeat: int,
    device: torch.device,
    seed: int,
) -> list[dict[str, float | int]]:
    available_train_pairs = [
        pair for pair in pairs
        if pair.split == "train"
        and pair.left_example_id in embeddings
        and pair.right_example_id in embeddings
    ]
    train_pairs = select_balanced_pair_head_pairs(
        available_train_pairs,
        max_pairs=max_pairs,
        seed=seed,
    )
    hard_negative_pairs = [
        pair
        for pair in available_train_pairs
        if pair.target == 0
        and pair_key(pair.left_example_id, pair.right_example_id) in hard_negative_pair_keys
    ]
    if hard_negative_repeat > 0 and hard_negative_pairs:
        train_pairs = train_pairs + hard_negative_pairs * hard_negative_repeat
    if epochs <= 0 or not train_pairs:
        return []
    positives = sum(1 for pair in train_pairs if pair.target == 1)
    negatives = len(train_pairs) - positives
    pos_weight_value = negatives / max(1, positives)
    criterion = nn.BCEWithLogitsLoss(pos_weight=torch.tensor(pos_weight_value, device=device))
    optimizer = torch.optim.AdamW(pair_head.parameters(), lr=learning_rate, weight_decay=1e-4)
    rng = random.Random(seed)
    epoch_summaries: list[dict[str, float | int]] = []
    for epoch in range(epochs):
        rng.shuffle(train_pairs)
        pair_head.train()
        total_loss = 0.0
        total = 0
        positive_score_sum = 0.0
        positive_count = 0
        negative_score_sum = 0.0
        negative_count = 0
        progress = tqdm(range(0, len(train_pairs), batch_size), desc=f"pair-head {epoch + 1}/{epochs}", leave=False)
        for start in progress:
            batch = train_pairs[start:start + batch_size]
            left_features, right_features, targets = pair_feature_batch(batch, embeddings, device)
            optimizer.zero_grad(set_to_none=True)
            logits = pair_head(left_features, right_features)
            loss = criterion(logits, targets)
            loss.backward()
            optimizer.step()

            scores = torch.sigmoid(logits.detach())
            batch_size_actual = int(targets.numel())
            total += batch_size_actual
            total_loss += float(loss.item()) * batch_size_actual
            positive_mask = targets >= 0.5
            negative_mask = targets < 0.5
            if torch.any(positive_mask):
                positive_score_sum += float(scores[positive_mask].sum().item())
                positive_count += int(positive_mask.sum().item())
            if torch.any(negative_mask):
                negative_score_sum += float(scores[negative_mask].sum().item())
                negative_count += int(negative_mask.sum().item())
            progress.set_postfix(loss=total_loss / max(1, total))
        epoch_summaries.append({
            "epoch": epoch + 1,
            "loss": total_loss / max(1, total),
            "positiveMeanScore": positive_score_sum / max(1, positive_count),
            "negativeMeanScore": negative_score_sum / max(1, negative_count),
            "pairs": total,
            "positivePairs": positive_count,
            "negativePairs": negative_count,
            "hardNegativeReplayPairs": len(hard_negative_pairs) * max(0, hard_negative_repeat),
        })
    return epoch_summaries


def select_balanced_pair_head_pairs(
    pairs: list[Pair],
    max_pairs: int,
    seed: int,
) -> list[Pair]:
    if max_pairs <= 0 or len(pairs) <= max_pairs:
        return list(pairs)

    positives = [pair for pair in pairs if pair.target == 1]
    negatives = [pair for pair in pairs if pair.target == 0]
    rng = random.Random(seed)
    rng.shuffle(positives)
    rng.shuffle(negatives)
    positive_limit = min(len(positives), max_pairs // 2)
    negative_limit = min(len(negatives), max_pairs - positive_limit)
    selected = positives[:positive_limit] + negatives[:negative_limit]
    rng.shuffle(selected)
    return selected


def pair_feature_batch(
    pairs: list[Pair],
    embeddings: dict[str, torch.Tensor],
    device: torch.device,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    left_features = torch.stack([
        embeddings[pair.left_example_id] for pair in pairs
    ]).to(device)
    right_features = torch.stack([
        embeddings[pair.right_example_id] for pair in pairs
    ]).to(device)
    targets = torch.tensor([float(pair.target) for pair in pairs], dtype=torch.float32, device=device)
    return left_features, right_features, targets


@torch.no_grad()
def embed_examples(
    model: nn.Module,
    examples: list[Example],
    image_size: int,
    device: torch.device,
    batch_size: int,
    num_workers: int,
) -> dict[str, torch.Tensor]:
    model.eval()
    dummy_labels = {example.part_id: 0 for example in examples}
    dataset = LegoImageDataset(examples, dummy_labels, image_size, training=False)
    loader = DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=device.type == "cuda",
    )
    embeddings: dict[str, torch.Tensor] = {}
    offset = 0
    for images, _labels in tqdm(loader, desc="embedding", leave=False):
        features = extract_features(model, images.to(device, non_blocking=device.type == "cuda")).cpu()
        for row_index in range(features.size(0)):
            embeddings[examples[offset + row_index].example_id] = features[row_index]
        offset += features.size(0)
    return embeddings


def score_pairs(pairs: Iterable[Pair], embeddings: dict[str, torch.Tensor]) -> list[dict[str, object]]:
    scored: list[dict[str, object]] = []
    for pair in pairs:
        left = embeddings.get(pair.left_example_id)
        right = embeddings.get(pair.right_example_id)
        if left is None or right is None:
            continue
        score = max(-1.0, min(1.0, float(torch.dot(left, right).item())))
        scored.append({
            "kind": pair.kind,
            "leftExampleId": pair.left_example_id,
            "rightExampleId": pair.right_example_id,
            "score": score,
            "split": pair.split,
            "target": pair.target,
        })
    return scored


@torch.no_grad()
def score_pairs_with_pair_head(
    pairs: Iterable[Pair],
    embeddings: dict[str, torch.Tensor],
    pair_head: PairHead,
    device: torch.device,
    batch_size: int,
) -> list[dict[str, object]]:
    pair_head.eval()
    scored: list[dict[str, object]] = []
    valid_pairs = [
        pair for pair in pairs
        if pair.left_example_id in embeddings and pair.right_example_id in embeddings
    ]
    for start in tqdm(range(0, len(valid_pairs), batch_size), desc="pair-head scoring", leave=False):
        batch = valid_pairs[start:start + batch_size]
        left_features, right_features, _targets = pair_feature_batch(batch, embeddings, device)
        scores = torch.sigmoid(pair_head(left_features, right_features)).cpu()
        for index, pair in enumerate(batch):
            scored.append({
                "kind": pair.kind,
                "leftExampleId": pair.left_example_id,
                "rightExampleId": pair.right_example_id,
                "score": float(scores[index].item()),
                "split": pair.split,
                "target": pair.target,
            })
    return scored


def choose_zero_false_positive_threshold(scored_pairs: list[dict[str, object]]) -> float:
    negative_scores = [float(pair["score"]) for pair in scored_pairs if pair["target"] == 0]
    if not negative_scores:
        return 1.0
    return max(negative_scores) + THRESHOLD_EPSILON


def choose_suggested_threshold(scored_pairs: list[dict[str, object]], auto_threshold: float, error_budget: float) -> float:
    lane_candidates = sorted(
        [pair for pair in scored_pairs if float(pair["score"]) < auto_threshold],
        key=lambda pair: float(pair["score"]),
        reverse=True,
    )
    if not lane_candidates:
        return auto_threshold
    positives = 0
    negatives = 0
    best_threshold: float | None = None
    for pair in lane_candidates:
        if int(pair["target"]) == 1:
            positives += 1
        else:
            negatives += 1
        accepted = positives + negatives
        if accepted > 0 and negatives / accepted <= error_budget:
            best_threshold = float(pair["score"])
    return best_threshold if best_threshold is not None else auto_threshold


def checkpoint_threshold(checkpoint_data: dict[str, object]) -> float:
    summary = checkpoint_data.get("summary")
    if isinstance(summary, dict) and isinstance(summary.get("threshold"), (float, int)):
        return float(summary["threshold"])
    return 1.0


def checkpoint_suggested_threshold(checkpoint_data: dict[str, object]) -> float | None:
    summary = checkpoint_data.get("summary")
    if isinstance(summary, dict) and isinstance(summary.get("suggestedThreshold"), (float, int)):
        return float(summary["suggestedThreshold"])
    return None


def checkpoint_pair_head_hidden_size(checkpoint_data: dict[str, object] | None, default: int) -> int:
    if not checkpoint_data:
        return default
    summary = checkpoint_data.get("summary")
    if not isinstance(summary, dict):
        return default
    options = summary.get("options")
    if isinstance(options, dict) and isinstance(options.get("pairHeadHiddenSize"), int):
        return int(options["pairHeadHiddenSize"])
    return default


def checkpoint_pair_head_state_dict(checkpoint_data: dict[str, object] | None) -> dict[str, object] | None:
    if not checkpoint_data:
        return None
    state_dict = checkpoint_data.get("pairHeadStateDict")
    return state_dict if isinstance(state_dict, dict) else None


def checkpoint_model_name(checkpoint_data: dict[str, object] | None) -> str | None:
    if not checkpoint_data:
        return None
    model_name = checkpoint_data.get("modelName")
    if isinstance(model_name, str) and model_name in MODEL_NAMES:
        return model_name
    summary = checkpoint_data.get("summary")
    if not isinstance(summary, dict):
        return None
    summary_model = summary.get("model")
    if summary_model == "torchvision.mobilenet_v3_small":
        return "mobilenet_v3_small"
    if isinstance(summary_model, str) and summary_model in MODEL_NAMES:
        return summary_model
    return None


def summarize_scored_pairs(scored_pairs: list[dict[str, object]], threshold: float) -> dict[str, object]:
    positives = [pair for pair in scored_pairs if pair["target"] == 1]
    negatives = [pair for pair in scored_pairs if pair["target"] == 0]
    matched = [pair for pair in positives if float(pair["score"]) >= threshold]
    false_positives = [pair for pair in negatives if float(pair["score"]) >= threshold]
    return {
        "scoredPairs": len(scored_pairs),
        "positivePairs": len(positives),
        "negativePairs": len(negatives),
        "matchedPositivePairs": len(matched),
        "missedPositivePairs": len(positives) - len(matched),
        "falsePositivePairs": len(false_positives),
        "recall": len(matched) / len(positives) if positives else 0,
        "negativeMax": max((float(pair["score"]) for pair in negatives), default=None),
        "positiveMax": max((float(pair["score"]) for pair in positives), default=None),
        "positiveMedian": median([float(pair["score"]) for pair in positives]),
        "negativeMedian": median([float(pair["score"]) for pair in negatives]),
    }


def summarize_two_lane_scored_pairs(
    scored_pairs: list[dict[str, object]],
    auto_threshold: float,
    suggested_threshold: float,
) -> dict[str, object]:
    positives = [pair for pair in scored_pairs if pair["target"] == 1]
    auto_pairs = [pair for pair in scored_pairs if float(pair["score"]) >= auto_threshold]
    suggested_pairs = [
        pair for pair in scored_pairs
        if suggested_threshold <= float(pair["score"]) < auto_threshold
    ]
    auto_positive = sum(1 for pair in auto_pairs if pair["target"] == 1)
    auto_false_positive = len(auto_pairs) - auto_positive
    suggested_positive = sum(1 for pair in suggested_pairs if pair["target"] == 1)
    suggested_false_positive = len(suggested_pairs) - suggested_positive
    suggested_total = len(suggested_pairs)
    accepted_positive = auto_positive + suggested_positive
    return {
        "autoThreshold": auto_threshold,
        "suggestedThreshold": suggested_threshold,
        "positivePairs": len(positives),
        "autoPairs": len(auto_pairs),
        "autoPositivePairs": auto_positive,
        "autoFalsePositivePairs": auto_false_positive,
        "suggestedPairs": suggested_total,
        "suggestedPositivePairs": suggested_positive,
        "suggestedFalsePositivePairs": suggested_false_positive,
        "suggestedCorrectionRate": suggested_false_positive / suggested_total if suggested_total else 0,
        "acceptedPositivePairs": accepted_positive,
        "acceptedRecall": accepted_positive / len(positives) if positives else 0,
    }


def create_verdict(
    train_totals: dict[str, object],
    validation_totals: dict[str, object],
    validation_lane_totals: dict[str, object],
    suggested_error_budget: float,
) -> dict[str, str]:
    if int(validation_totals["falsePositivePairs"]) > 0:
        return {"status": "blocked", "reason": "auto lane has validation false positives"}
    if float(validation_lane_totals["suggestedCorrectionRate"]) > suggested_error_budget:
        return {"status": "blocked", "reason": "suggested lane exceeds correction budget"}
    if int(train_totals["matchedPositivePairs"]) == 0 and int(validation_lane_totals["acceptedPositivePairs"]) == 0:
        return {"status": "blocked", "reason": "auto plus suggested lanes have no useful recall"}
    if float(validation_lane_totals["acceptedRecall"]) < 0.25:
        return {"status": "inconclusive", "reason": "safe but weak accepted validation recall"}
    return {"status": "promising", "reason": "auto lane is clean and suggested lane stays within correction budget"}


def render_index_html(summary: dict[str, object], scored_pairs: list[dict[str, object]]) -> str:
    missed = [
        pair for pair in scored_pairs
        if pair["target"] == 1 and float(pair["score"]) < float(summary["threshold"])
    ][:80]
    dangerous = sorted(
        [pair for pair in scored_pairs if pair["target"] == 0],
        key=lambda pair: float(pair["score"]),
        reverse=True,
    )[:80]
    return f"""<!doctype html>
<meta charset="utf-8">
<title>LEGO CNN scorer</title>
<style>
body {{ font-family: system-ui, sans-serif; margin: 24px; color: #172033; }}
pre {{ background: #f4f6f8; padding: 16px; overflow: auto; }}
table {{ border-collapse: collapse; width: 100%; margin: 20px 0; }}
td, th {{ border: 1px solid #d7dde5; padding: 6px 8px; text-align: left; }}
th {{ background: #eef2f6; }}
</style>
<h1>LEGO CNN scorer</h1>
<pre>{escape_html(json.dumps(summary, indent=2))}</pre>
<h2>Closest negatives</h2>
{render_pair_table(dangerous)}
<h2>Missed positives</h2>
{render_pair_table(missed)}
"""


def render_pair_table(pairs: list[dict[str, object]]) -> str:
    rows = "\n".join(
        "<tr>"
        f"<td>{escape_html(str(pair['split']))}</td>"
        f"<td>{escape_html(str(pair['kind']))}</td>"
        f"<td>{float(pair['score']):.6f}</td>"
        f"<td>{escape_html(str(pair['leftExampleId']))}</td>"
        f"<td>{escape_html(str(pair['rightExampleId']))}</td>"
        "</tr>"
        for pair in pairs
    )
    return f"<table><thead><tr><th>Split</th><th>Kind</th><th>Score</th><th>Left</th><th>Right</th></tr></thead><tbody>{rows}</tbody></table>"


def balanced_limit(items: list[Pair], limit: int) -> list[Pair]:
    if limit <= 0 or len(items) <= limit:
        return items
    return items[:limit]


def choose_device(name: str) -> torch.device:
    if name == "cuda":
        if not torch.cuda.is_available():
            raise SystemExit("CUDA requested, but torch.cuda.is_available() is false.")
        return torch.device("cuda")
    if name == "mps":
        if not torch.backends.mps.is_available():
            raise SystemExit("MPS requested, but torch.backends.mps.is_available() is false.")
        return torch.device("mps")
    if name == "auto" and torch.cuda.is_available():
        return torch.device("cuda")
    if name == "auto" and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def stable_fold(value: str, fold_count: int) -> int:
    total = 0
    for byte in value.encode("utf-8"):
        total = (total * 131 + byte) % 2_147_483_647
    return total % fold_count


def median(values: list[float]) -> float | None:
    if not values:
        return None
    values = sorted(values)
    middle = len(values) // 2
    if len(values) % 2:
        return values[middle]
    return (values[middle - 1] + values[middle]) / 2


def read_hard_negative_pair_keys(score_dir: Path | None, min_score: float) -> set[str]:
    if score_dir is None:
        return set()

    pairs_path = score_dir / "pairs.json"
    with pairs_path.open("r", encoding="utf-8") as handle:
        parsed = json.load(handle)
    pairs = parsed if isinstance(parsed, list) else parsed.get("pairs", [])
    keys: set[str] = set()

    for pair in pairs:
        if not isinstance(pair, dict):
            continue
        if pair.get("target") != 0:
            continue
        score = pair.get("score")
        left_id = pair.get("leftExampleId")
        right_id = pair.get("rightExampleId")

        if not isinstance(left_id, str) or not isinstance(right_id, str):
            continue
        if not isinstance(score, (int, float)) or not math.isfinite(score) or score < min_score:
            continue

        keys.add(pair_key(left_id, right_id))

    return keys


def pair_key(left_id: str, right_id: str) -> str:
    return "\0".join(sorted((left_id, right_id)))


def read_json(path: Path) -> dict[str, object]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")


def timestamp_for_path() -> str:
    return time.strftime("%Y-%m-%dT%H-%M-%S")


def iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def escape_html(value: str) -> str:
    return (
        value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


if __name__ == "__main__":
    main()
