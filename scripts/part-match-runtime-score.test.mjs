import { describe, expect, it } from "vitest"
import {
  extractPartVisualFeatures,
} from "../packages/part-matching/src/index"
import {
  scorePartMatchPairsWithRuntimeScorer,
} from "./part-match-runtime-score.ts"

describe("part-match-runtime-score", () => {
  it("scores pairs with a package scorer config and reports skipped rows", () => {
    const leftFeatures = extractPartVisualFeatures({
      alphaMask: squareMask(8, 0, 0),
      partRegion: { x: 0, y: 0, width: 8, height: 8 },
    })
    const rightFeatures = extractPartVisualFeatures({
      alphaMask: squareMask(8, 1, 0),
      partRegion: { x: 0, y: 0, width: 8, height: 8 },
    })
    const result = scorePartMatchPairsWithRuntimeScorer({
      examples: [
        example("left-example", "manual-a", "left-item"),
        example("right-example", "manual-a", "right-item"),
        example("missing-example", "manual-a", "missing-item"),
      ],
      featureEntries: [
        featureEntry("manual-a", "left-item", leftFeatures),
        featureEntry("manual-a", "right-item", rightFeatures),
      ],
      pairs: [
        {
          leftExampleId: "left-example",
          rightExampleId: "right-example",
          score: 0.1,
          scores: { previous: 0.1 },
          target: 1,
        },
        {
          leftExampleId: "left-example",
          rightExampleId: "missing-example",
          target: 0,
        },
        {
          rightExampleId: "right-example",
          target: 0,
        },
      ],
      scoreField: "runtimeExportedScorer",
      scorerConfig: {
        featureNames: ["centerDistance"],
        intercept: 1,
        kind: "linear",
        normalization: {},
        threshold: 0.5,
        version: "test",
        weights: {
          centerDistance: -5,
        },
      },
    })

    expect(result.scoredPairs).toHaveLength(1)
    expect(result.scoredPairs[0].score).toBeGreaterThan(0)
    expect(result.scoredPairs[0].scores).toEqual({
      previous: 0.1,
      runtimeExportedScorer: result.scoredPairs[0].score,
    })
    expect(result.skipped).toEqual({
      "invalid-pair": 1,
      "missing-feature": 1,
    })
  })

  it("can zero pairs rejected by package match rules", () => {
    const leftFeatures = extractPartVisualFeatures({
      alphaMask: squareMask(8, 0, 0),
      partRegion: { x: 0, y: 0, width: 8, height: 8 },
    })
    const rightFeatures = extractPartVisualFeatures({
      alphaMask: squareMask(8, 1, 0),
      partRegion: { x: 0, y: 0, width: 8, height: 8 },
    })
    const result = scorePartMatchPairsWithRuntimeScorer({
      examples: [
        example("left-example", "manual-a", "left-item"),
        example("right-example", "manual-a", "right-item"),
      ],
      featureEntries: [
        featureEntry("manual-a", "left-item", leftFeatures),
        featureEntry("manual-a", "right-item", rightFeatures),
      ],
      pairs: [{
        leftExampleId: "left-example",
        rightExampleId: "right-example",
        target: 1,
      }],
      scorerConfig: {
        evidenceRules: [{
          conditions: [{
            featureName: "nearConfidence",
            operator: "gt",
            threshold: -1,
          }],
        }],
        featureNames: [],
        intercept: 10,
        kind: "linear",
        normalization: {},
        threshold: 0.5,
        version: "test",
        vetoRules: [{
          conditions: [{
            featureName: "centerDistance",
            operator: "gt",
            threshold: -1,
          }],
        }],
        weights: {},
      },
      zeroUnmatched: true,
    })

    expect(result.scoredPairs[0].score).toBe(0)
  })
})

function example(exampleId, manualId, itemId) {
  return {
    exampleId,
    itemId,
    manualId,
  }
}

function featureEntry(manualId, itemId, features) {
  return {
    features,
    itemId,
    manualId,
  }
}

function squareMask(size, xOffset, yOffset) {
  const data = Array(size * size).fill(0)

  for (let y = 2 + yOffset; y < 6 + yOffset; y += 1) {
    for (let x = 2 + xOffset; x < 6 + xOffset; x += 1) {
      if (x >= 0 && x < size && y >= 0 && y < size) {
        data[y * size + x] = 255
      }
    }
  }

  return {
    data,
    height: size,
    width: size,
  }
}
