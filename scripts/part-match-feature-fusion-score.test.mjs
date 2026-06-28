import { describe, expect, it } from "vitest"
import {
  combineFeatureFusionScores,
  fitFeatureFusionModel,
  scoreFeatureFusion,
} from "./part-match-feature-fusion-score"

describe("part-match-feature-fusion-score", () => {
  it("learns to rank positive feature maps above negatives", () => {
    const model = fitFeatureFusionModel([
      candidate({ "score:cnn": 0.9, "struct:matched": 1 }, 1),
      candidate({ "score:cnn": 0.85, "struct:matched": 1 }, 1),
      candidate({ "score:cnn": 0.2, "struct:matched": 0 }, 0),
      candidate({ "score:cnn": 0.1, "struct:matched": 0 }, 0),
    ])

    expect(scoreFeatureFusion(model, {
      "score:cnn": 0.88,
      "struct:matched": 1,
    })).toBeGreaterThan(scoreFeatureFusion(model, {
      "score:cnn": 0.12,
      "struct:matched": 0,
    }))
  })

  it("requires both positive and negative training candidates", () => {
    expect(() => fitFeatureFusionModel([
      candidate({ "score:cnn": 0.9 }, 1),
    ])).toThrow(/negative/)
    expect(() => fitFeatureFusionModel([
      candidate({ "score:cnn": 0.1 }, 0),
    ])).toThrow(/positive/)
  })

  it("falls back to pure fusion when the structural CNN gate is missing", () => {
    expect(combineFeatureFusionScores(0.81, {}).featureFusionProduct).toBeCloseTo(0.81)
    expect(combineFeatureFusionScores(0.81, { cnnIfStructuralMatch: 0 }).featureFusionProduct).toBe(0)
  })
})

function candidate(featureMap, target) {
  return {
    featureMap,
    pair: {
      split: "train",
    },
    target,
  }
}
