import { describe, expect, it } from "vitest"
import {
  AUTO_PART_PAIR_SCORER_CONFIG,
  DEFAULT_PART_PAIR_SCORER_CONFIG,
  SUGGESTED_PART_PAIR_SCORER_CONFIG,
  STATIC_SUGGESTED_PART_PAIR_SCORER_CONFIG,
  createPartMatchGroups,
  extractPartPairScoreFeatures,
  extractPartVisualFeatures,
  scorePartPair,
  type PartMatchAlphaMask,
  type PartMatchRowInput,
  type PartPairScorerConfig,
} from "../index"
import { compareNearFeatures } from "../near-match"

describe("part matching", () => {
  it("exports a sanitized default near-match scorer config", () => {
    const serializedConfig = JSON.stringify(DEFAULT_PART_PAIR_SCORER_CONFIG)

    expect(DEFAULT_PART_PAIR_SCORER_CONFIG).toMatchObject({
      kind: "decision-tree",
      version: "0.1.0-alpha.10",
    })
    expect(DEFAULT_PART_PAIR_SCORER_CONFIG.threshold).toBeGreaterThan(0.9)
    expect(DEFAULT_PART_PAIR_SCORER_CONFIG.vetoRules?.length).toBeGreaterThan(0)
    expect(serializedConfig).not.toContain(".bag-it")
    expect(serializedConfig).not.toContain("fill-panel")
  })

  it("exports sanitized two-lane app scorer configs", () => {
    const autoConfig = JSON.stringify(AUTO_PART_PAIR_SCORER_CONFIG)
    const suggestedConfig = JSON.stringify(SUGGESTED_PART_PAIR_SCORER_CONFIG)

    expect(AUTO_PART_PAIR_SCORER_CONFIG).toMatchObject({
      kind: "linear",
      metadata: {
        lane: "auto",
        falseGroups: 0,
        wrongRowMemberships: 0,
      },
    })
    expect(SUGGESTED_PART_PAIR_SCORER_CONFIG).toMatchObject({
      metadata: {
        correctionBurden: expect.any(Number),
        lane: "suggested",
      },
    })
    expect(["decision-tree", "linear"]).toContain(SUGGESTED_PART_PAIR_SCORER_CONFIG.kind)
    expect(SUGGESTED_PART_PAIR_SCORER_CONFIG.metadata?.correctionBurden as number)
      .toBeLessThan(0.005)
    expect(autoConfig).not.toContain(".bag-it")
    expect(suggestedConfig).not.toContain(".bag-it")
    expect(autoConfig).not.toContain("fill-panel")
    expect(suggestedConfig).not.toContain("fill-panel")
  })

  it("exports the static suggested scorer through the package boundary", () => {
    const staticConfig = JSON.stringify(STATIC_SUGGESTED_PART_PAIR_SCORER_CONFIG)

    expect(STATIC_SUGGESTED_PART_PAIR_SCORER_CONFIG).toMatchObject({
      metadata: {
        lane: "suggested",
      },
    })
    expect(staticConfig).not.toContain(".bag-it")
    expect(staticConfig).not.toContain("fill-panel")
  })

  it("groups exact duplicate masks across callouts in the same bag", () => {
    const mask = plateMask(3, 2)
    const groups = createPartMatchGroups({
      rows: [
        row("row-1", "bag-1", "callout-1", mask),
        row("row-2", "bag-1", "callout-2", mask),
      ],
    })

    expect(groups).toMatchObject([
      {
        bagId: "bag-1",
        confidence: 1,
        matchKind: "exact-digest",
        rowIds: ["row-1", "row-2"],
      },
    ])
  })

  it("keeps rows from the same callout separate", () => {
    const mask = plateMask(3, 2)
    const groups = createPartMatchGroups({
      rows: [
        row("row-1", "bag-1", "callout-1", mask),
        row("row-2", "bag-1", "callout-1", mask),
      ],
    })

    expect(groups).toEqual([])
  })

  it("keeps exact matches inside the same bag", () => {
    const mask = plateMask(3, 2)
    const groups = createPartMatchGroups({
      rows: [
        row("row-1", "bag-1", "callout-1", mask),
        row("row-2", "bag-2", "callout-2", mask),
      ],
    })

    expect(groups).toEqual([])
  })

  it("requires compatible part color for exact matches", () => {
    const mask = plateMask(3, 2)
    const groups = createPartMatchGroups({
      rows: [
        row("row-1", "bag-1", "callout-1", mask, { colorKey: "manual:green" }),
        row("row-2", "bag-1", "callout-2", mask, { colorKey: "manual:gray" }),
      ],
    })

    expect(groups).toEqual([])
  })

  it("allows untrusted review color keys when the canonical color name matches", () => {
    const mask = plateMask(3, 2)
    const groups = createPartMatchGroups({
      rows: [
        row("row-1", "bag-1", "callout-1", mask, {
          color: reviewColor("manual-color-006", "gray", "Light Bluish Gray"),
        }),
        row("row-2", "bag-1", "callout-2", mask, {
          color: reviewColor("manual-color-011", "gray", "Light Bluish Gray"),
        }),
      ],
    })

    expect(groups).toMatchObject([{
      matchKind: "exact-digest",
      rowIds: ["row-1", "row-2"],
    }])
  })

  it("blocks trusted manual color conflicts even when names match", () => {
    const mask = plateMask(3, 2)
    const groups = createPartMatchGroups({
      rows: [
        row("row-1", "bag-1", "callout-1", mask, {
          color: trustedColor("manual-green-a", "green", "Green"),
        }),
        row("row-2", "bag-1", "callout-2", mask, {
          color: trustedColor("manual-green-b", "green", "Green"),
        }),
      ],
    })

    expect(groups).toEqual([])
  })

  it("does not use quantity when deciding identity", () => {
    const mask = plateMask(3, 2)
    const groups = createPartMatchGroups({
      rows: [
        row("row-1", "bag-1", "callout-1", mask),
        row("row-2", "bag-1", "callout-2", mask),
      ],
    })

    expect(groups[0].rowIds).toEqual(["row-1", "row-2"])
  })

  it("matches scaled shapes only when label-gated near matches are enabled", () => {
    const small = plateMask(3, 2, 12)
    const large = plateMask(3, 2, 24)
    const rows = [
      row("row-1", "bag-1", "callout-1", small),
      row("row-2", "bag-1", "callout-2", large),
    ]

    expect(createPartMatchGroups({ rows })).toEqual([])
    expect(createPartMatchGroups({ rows, enableLabelGatedNearMatches: true }))
      .toMatchObject([
        {
          matchKind: "label-gated-near",
          rowIds: ["row-1", "row-2"],
        },
      ])
  })

  it("uses near groups to connect exact duplicates with scaled matches", () => {
    const small = plateMask(3, 2, 12)
    const large = plateMask(3, 2, 24)
    const rows = [
      row("row-1", "bag-1", "callout-1", small),
      row("row-2", "bag-1", "callout-2", small),
      row("row-3", "bag-1", "callout-3", large),
    ]

    expect(createPartMatchGroups({ rows })).toMatchObject([{
      matchKind: "exact-digest",
      rowIds: ["row-1", "row-2"],
    }])
    expect(createPartMatchGroups({ rows, enableLabelGatedNearMatches: true }))
      .toMatchObject([{
        matchKind: "label-gated-near",
        rowIds: ["row-1", "row-2", "row-3"],
      }])
  })

  it("splits similar plate lengths under gated near matching", () => {
    const groups = createPartMatchGroups({
      enableLabelGatedNearMatches: true,
      rows: [
        row("row-1", "bag-1", "callout-1", plateMask(3, 1)),
        row("row-2", "bag-1", "callout-2", plateMask(4, 1)),
      ],
    })

    expect(groups).toEqual([])
  })

  it("extracts structural features that distinguish stud counts", () => {
    const threeStuds = extractPartVisualFeatures({
      alphaMask: plateMask(3, 1),
      partRegion: { x: 0, y: 0, width: 36, height: 12 },
    })
    const fourStuds = extractPartVisualFeatures({
      alphaMask: plateMask(4, 1),
      partRegion: { x: 0, y: 0, width: 48, height: 12 },
    })

    expect(threeStuds.topPeakCount).toBe(3)
    expect(fourStuds.topPeakCount).toBe(4)
  })

  it("extracts high-resolution silhouette and orientation features", () => {
    const features = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })

    expect(features.normalizedAlpha32).toHaveLength(32 * 32)
    expect(features.edgeAlpha32).toHaveLength(32 * 32)
    expect(features.alphaSignedDistanceGrid32).toHaveLength(32 * 32)
    expect(features.tightAlphaSignedDistanceGrid32).toHaveLength(32 * 32)
    expect(features.alphaOrientationHistogram).toHaveLength(8)
    expect(features.alphaOrientationHistogram.reduce((total, value) => total + value, 0))
      .toBeCloseTo(1)
  })

  it("rejects same-silhouette pairs with ambiguous surface detail drift", () => {
    const base = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const left = {
      ...base,
      lumaGrid: Array.from({ length: 256 }, () => 128),
    }
    const right = {
      ...base,
      lumaGrid: Array.from({ length: 256 }, () => 133),
      opaqueCoverage: base.opaqueCoverage - 0.011,
    }

    const result = compareNearFeatures(left, right)

    expect(result).toMatchObject({
      matched: false,
      reasons: ["ambiguous surface detail differs"],
    })
  })

  it("rejects tight silhouettes with high-luma detail conflicts", () => {
    const base = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const left = {
      ...base,
      lumaGrid: Array.from({ length: 256 }, () => 128),
    }
    const right = {
      ...base,
      area: base.area * 1.1,
      aspectRatio: base.aspectRatio * 1.07,
      lumaGrid: Array.from({ length: 256 }, () => 136.5),
      opaqueCoverage: base.opaqueCoverage - 0.008,
    }

    const result = compareNearFeatures(left, right)

    expect(result).toMatchObject({
      matched: false,
      reasons: ["ambiguous surface detail differs"],
    })
  })

  it("allows low-confidence matches when coverage and detail drift stay bounded", () => {
    const base = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const left = {
      ...base,
      lumaGrid: Array.from({ length: 256 }, () => 128),
    }
    const right = {
      ...base,
      aspectRatio: base.aspectRatio * 1.05,
      centerX: base.centerX + 0.02,
      edgeAlpha: base.edgeAlpha.map((value) => value + 18),
      leftProfile: base.leftProfile.map((value) => value + 0.04),
      lowerProfile: base.lowerProfile.map((value) => value + 0.04),
      lumaGrid: Array.from({ length: 256 }, () => 135),
      normalizedAlpha: base.normalizedAlpha.map((value) => value + 10),
      opaqueCoverage: base.opaqueCoverage - 0.003,
      projectionX: base.projectionX.map((value) => value + 0.03),
      projectionY: base.projectionY,
      rightProfile: base.rightProfile.map((value) => value + 0.04),
      topProfile: base.topProfile.map((value) => value + 0.04),
    }

    const result = compareNearFeatures(left, right)

    expect(result).toMatchObject({
      matched: true,
      reasons: ["label-gated visual features match"],
    })
    expect(result.confidence).toBeLessThan(0.76)
  })

  it("extracts and scores trained pair features", () => {
    const left = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const right = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const features = extractPartPairScoreFeatures(left, right)
    const score = scorePartPair(left, right, alwaysMatchScorerConfig())

    expect(features.alphaDistance).toBeGreaterThanOrEqual(0)
    expect(features.alpha32Distance).toBeGreaterThanOrEqual(0)
    expect(features.nearConfidence).toBeCloseTo(compareNearFeatures(left, right).confidence)
    expect(features.alphaChamferDistance).toBeGreaterThanOrEqual(0)
    expect(features.silhouetteDistance).toBeGreaterThanOrEqual(0)
    expect(features.tightAlphaChamferDistance).toBeGreaterThanOrEqual(0)
    expect(features.alphaOrientationDistance).toBeGreaterThanOrEqual(0)
    expect(features.aspectRatio).toBeCloseTo(1)
    expect(score).toMatchObject({
      matched: true,
      probability: expect.any(Number),
    })
  })

  it("extracts shift-ratio pair features for translated visual grids", () => {
    const base = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const left = {
      ...base,
      lumaGrid: base.normalizedAlpha,
      lumaGrid32: base.normalizedAlpha32,
    }
    const right = {
      ...base,
      alphaSignedDistanceGrid32: shiftGrid(base.alphaSignedDistanceGrid32 ?? [], 32, 2, 0),
      lumaGrid: shiftGrid(base.normalizedAlpha, 16, 1, 0),
      lumaGrid32: shiftGrid(base.normalizedAlpha32 ?? [], 32, 2, 0),
      normalizedAlpha: shiftGrid(base.normalizedAlpha, 16, 1, 0),
      normalizedAlpha32: shiftGrid(base.normalizedAlpha32 ?? [], 32, 2, 0),
    }
    const features = extractPartPairScoreFeatures(left, right)

    expect(features.alphaShiftRatio).toBeLessThan(0.8)
    expect(features.alpha32ShiftRatio).toBeLessThan(0.8)
    expect(features.lumaShiftRatio).toBeLessThan(0.8)
    expect(features.luma32ShiftRatio).toBeLessThan(0.8)
    expect(features.silhouetteShiftRatio).toBeLessThan(0.8)
  })

  it("extracts chamfer pair features for translated contours", () => {
    const left = extractPartVisualFeatures({
      alphaMask: translatedPlateMask(3, 2, 12, 0),
      partRegion: { x: 0, y: 0, width: 44, height: 32 },
    })
    const right = extractPartVisualFeatures({
      alphaMask: translatedPlateMask(3, 2, 12, 2),
      partRegion: { x: 0, y: 0, width: 44, height: 32 },
    })
    const features = extractPartPairScoreFeatures(left, right)

    expect(features.alphaChamferShiftDistance).toBeLessThan(features.alphaChamferDistance * 0.8)
    expect(features.alphaChamferShiftRatio).toBeLessThan(0.8)
    expect(features.tightAlphaChamferDistance).toBeLessThan(features.alphaChamferDistance)
  })

  it("extracts wide shift-ratio pair features for larger translated grids", () => {
    const base = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const left = {
      ...base,
      lumaGrid: base.normalizedAlpha,
      lumaGrid32: base.normalizedAlpha32,
    }
    const right = {
      ...base,
      alphaSignedDistanceGrid32: shiftGrid(base.alphaSignedDistanceGrid32 ?? [], 32, 4, 0),
      lumaGrid: shiftGrid(base.normalizedAlpha, 16, 2, 0),
      lumaGrid32: shiftGrid(base.normalizedAlpha32 ?? [], 32, 4, 0),
      normalizedAlpha: shiftGrid(base.normalizedAlpha, 16, 2, 0),
      normalizedAlpha32: shiftGrid(base.normalizedAlpha32 ?? [], 32, 4, 0),
    }
    const features = extractPartPairScoreFeatures(left, right)

    expect(features.wideAlpha32ShiftRatio).toBeLessThan(features.alpha32ShiftRatio * 0.8)
    expect(features.wideLuma32ShiftRatio).toBeLessThan(features.luma32ShiftRatio * 0.8)
    expect(features.wideSilhouetteShiftRatio).toBeLessThan(features.silhouetteShiftRatio * 0.8)
    expect(features.alignedAlpha8Distance).toBeLessThan(features.alphaDistance)
    expect(features.alignedAlpha8Overlap).toBeGreaterThan(0.7)
    expect(features.alignmentShiftDistance).toBeGreaterThan(0)
  })

  it("exposes default scorer match and probability as derived features", () => {
    const left = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const right = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const baseScore = scorePartPair(left, right, DEFAULT_PART_PAIR_SCORER_CONFIG)
    const features = extractPartPairScoreFeatures(left, right, {
      featureNames: ["baseMatched", "baseProbability"],
    })

    expect(features.baseMatched).toBe(baseScore.matched ? 1 : 0)
    expect(features.baseProbability).toBeCloseTo(baseScore.probability)
  })

  it("vetoes trained scorer matches without strong visual evidence", () => {
    const left = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const right = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2, 14),
      partRegion: { x: 0, y: 0, width: 42, height: 28 },
    })

    expect(scorePartPair(left, right, alwaysMatchScorerConfig())).toMatchObject({
      matched: false,
      probability: expect.any(Number),
    })
  })

  it("uses scorer config evidence rules when they are present", () => {
    const left = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const right = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2, 14),
      partRegion: { x: 0, y: 0, width: 42, height: 28 },
    })
    const features = extractPartPairScoreFeatures(left, right)

    expect(scorePartPair(left, right, {
      ...alwaysMatchScorerConfig(),
      evidenceRules: [{
        conditions: [{
          featureName: "aspectRatio",
          operator: "lt",
          threshold: features.aspectRatio + 0.001,
        }],
      }],
    })).toMatchObject({
      matched: true,
      probability: expect.any(Number),
    })
    expect(scorePartPair(left, right, {
      ...alwaysMatchScorerConfig(),
      evidenceRules: [{
        conditions: [{
          featureName: "aspectRatio",
          operator: "lt",
          threshold: features.aspectRatio - 0.001,
        }],
      }],
    })).toMatchObject({
      matched: false,
      probability: expect.any(Number),
    })
  })

  it("uses scorer config veto rules to reject learned hard negatives", () => {
    const left = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const right = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2, 14),
      partRegion: { x: 0, y: 0, width: 42, height: 28 },
    })
    const features = extractPartPairScoreFeatures(left, right)
    const config = {
      ...alwaysMatchScorerConfig(),
      evidenceRules: [{
        conditions: [{
          featureName: "aspectRatio",
          operator: "lt",
          threshold: features.aspectRatio + 0.001,
        }],
      }],
    } satisfies PartPairScorerConfig

    expect(scorePartPair(left, right, config)).toMatchObject({
      matched: true,
      probability: expect.any(Number),
    })
    expect(scorePartPair(left, right, {
      ...config,
      vetoRules: [{
        conditions: [{
          featureName: "aspectRatio",
          operator: "lt",
          threshold: features.aspectRatio + 0.001,
        }],
      }],
    })).toMatchObject({
      matched: false,
      probability: expect.any(Number),
    })
  })

  it("uses supplemental rules to recover raw scorer misses", () => {
    const left = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const right = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2, 14),
      partRegion: { x: 0, y: 0, width: 42, height: 28 },
    })
    const features = extractPartPairScoreFeatures(left, right)
    const config = {
      ...neverMatchScorerConfig(),
      supplementalRules: [{
        conditions: [{
          featureName: "aspectRatio",
          operator: "lt",
          threshold: features.aspectRatio + 0.001,
        }],
      }],
    } satisfies PartPairScorerConfig

    expect(scorePartPair(left, right, config)).toMatchObject({
      matched: true,
      probability: config.threshold,
    })
    expect(scorePartPair(left, right, {
      ...config,
      vetoRules: [{
        conditions: [{
          featureName: "aspectRatio",
          operator: "lt",
          threshold: features.aspectRatio + 0.001,
        }],
      }],
    })).toMatchObject({
      matched: false,
      probability: expect.any(Number),
    })
  })

  it("can require model score before applying supplemental evidence", () => {
    const left = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const right = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2, 14),
      partRegion: { x: 0, y: 0, width: 42, height: 28 },
    })
    const features = extractPartPairScoreFeatures(left, right)
    const supplementalRules = [{
      conditions: [{
        featureName: "tightAlpha32ShiftDistance",
        operator: "lt",
        threshold: features.tightAlpha32ShiftDistance + 0.001,
      }],
    }] satisfies PartPairScorerConfig["modelGatedSupplementalRules"]

    expect(scorePartPair(left, right, {
      ...neverMatchScorerConfig(),
      modelGatedSupplementalRules: supplementalRules,
    })).toMatchObject({
      matched: false,
      probability: expect.any(Number),
    })
    expect(scorePartPair(left, right, {
      ...alwaysMatchScorerConfig(),
      evidenceRules: [{
        conditions: [{
          featureName: "tightAlpha32ShiftDistance",
          operator: "lt",
          threshold: features.tightAlpha32ShiftDistance - 0.001,
        }],
      }],
      modelGatedSupplementalRules: supplementalRules,
    })).toMatchObject({
      matched: true,
      probability: expect.any(Number),
    })
  })

  it("uses optional trained scorer only after gated near rules fail", () => {
    const base = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const leftFeatures = {
      ...base,
      alphaDigest: "left-alpha",
      detailDigest: "left-detail",
      lumaGrid: Array.from({ length: 256 }, () => 128),
    }
    const rightFeatures = {
      ...base,
      alphaDigest: "right-alpha",
      detailDigest: "right-detail",
      lumaGrid: Array.from({ length: 256 }, () => 150),
    }
    const rows: PartMatchRowInput[] = [
      {
        ...row("row-1", "bag-1", "callout-1", plateMask(3, 2)),
        features: leftFeatures,
      },
      {
        ...row("row-2", "bag-1", "callout-2", plateMask(3, 2)),
        features: rightFeatures,
      },
    ]

    expect(createPartMatchGroups({ enableLabelGatedNearMatches: true, rows }))
      .toEqual([])
    expect(createPartMatchGroups({
      enableLabelGatedNearMatches: true,
      pairScorerConfig: alwaysMatchScorerConfig(),
      rows,
    })).toMatchObject([{
      confidence: expect.any(Number),
      matchKind: "label-gated-near",
      reasons: ["label-gated visual features match"],
      rowIds: ["row-1", "row-2"],
    }])
  })

  it("can use cached pair features for scorer-backed groups", () => {
    const base = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const cachedFeatures = extractPartPairScoreFeatures(base, base)
    const mutatedRight = {
      ...base,
      alphaDigest: "mutated-right",
      aspectRatio: base.aspectRatio * 1.3,
      centerX: base.centerX + 0.2,
      detailDigest: "mutated-right-detail",
    }
    const config = {
      ...alwaysMatchScorerConfig(),
      evidenceRules: [{
        conditions: [{
          featureName: "aspectRatio",
          operator: "lt",
          threshold: cachedFeatures.aspectRatio + 0.001,
        }],
      }],
    } satisfies PartPairScorerConfig
    const rows: PartMatchRowInput[] = [
      {
        ...row("row-1", "bag-1", "callout-1", plateMask(3, 2)),
        features: { ...base, alphaDigest: "cached-left", detailDigest: "cached-left-detail" },
      },
      {
        ...row("row-2", "bag-1", "callout-2", plateMask(3, 2)),
        features: mutatedRight,
      },
    ]

    expect(createPartMatchGroups({
      enableLabelGatedNearMatches: true,
      pairScorerConfig: config,
      rows,
    })).toEqual([])
    expect(createPartMatchGroups({
      enableLabelGatedNearMatches: true,
      pairScoreFeaturesByKey: new Map([["row-1\0row-2", cachedFeatures]]),
      pairScorerConfig: config,
      rows,
    })).toMatchObject([{
      matchKind: "label-gated-near",
      rowIds: ["row-1", "row-2"],
    }])
  })

  it("fills only the explicit writable scorer feature cache", () => {
    const rows: PartMatchRowInput[] = [
      row("row-1", "bag-1", "callout-1", plateMask(3, 2)),
      row("row-2", "bag-1", "callout-2", plateMask(3, 2)),
    ]
    const readOnlyFeatureLookup = new Map<string, Record<string, number>>()
    const writableFeatureCache = new Map<string, Record<string, number>>()

    expect(createPartMatchGroups({
      enableLabelGatedNearMatches: true,
      pairScoreFeaturesByKey: readOnlyFeatureLookup,
      pairScorerConfig: alwaysMatchScorerConfig(),
      rows,
    })).toHaveLength(1)
    expect(readOnlyFeatureLookup.size).toBe(0)

    expect(createPartMatchGroups({
      enableLabelGatedNearMatches: true,
      pairScorerConfig: alwaysMatchScorerConfig(),
      rows,
      writablePairScoreFeatureCache: writableFeatureCache,
    })).toHaveLength(1)
    expect(writableFeatureCache.size).toBe(1)
    expect(writableFeatureCache.has("row-1\0row-2")).toBe(true)
  })

  it("requires scorer-backed groups to be pairwise consistent", () => {
    const base = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const rows: PartMatchRowInput[] = [
      {
        ...row("row-1", "bag-1", "callout-1", plateMask(3, 2)),
        features: { ...base, alphaDigest: "row-1", centerX: 0 },
      },
      {
        ...row("row-2", "bag-1", "callout-2", plateMask(3, 2)),
        features: { ...base, alphaDigest: "row-2", centerX: 0.4 },
      },
      {
        ...row("row-3", "bag-1", "callout-3", plateMask(3, 2)),
        features: { ...base, alphaDigest: "row-3", centerX: 0.8 },
      },
      {
        ...row("row-4", "bag-1", "callout-1", plateMask(3, 2)),
        features: { ...base, alphaDigest: "row-4", centerX: 0.4 },
      },
    ]

    const groups = createPartMatchGroups({
      enableLabelGatedNearMatches: true,
      pairScorerConfig: closeCenterScorerConfig(),
      rows,
    })

    expect(groups).toMatchObject([{
      matchKind: "label-gated-near",
      rowIds: expect.arrayContaining(["row-2", "row-4"]),
    }])
    expect(groups[0]?.rowIds).not.toEqual(expect.arrayContaining(["row-1", "row-3"]))
  })

  it("can use connected scorer components for review-suggested groups", () => {
    const base = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const rows: PartMatchRowInput[] = [
      {
        ...row("row-1", "bag-1", "callout-1", plateMask(3, 2)),
        features: { ...base, alphaDigest: "row-1", centerX: 0 },
      },
      {
        ...row("row-2", "bag-1", "callout-2", plateMask(3, 2)),
        features: { ...base, alphaDigest: "row-2", centerX: 0.4 },
      },
      {
        ...row("row-3", "bag-1", "callout-3", plateMask(3, 2)),
        features: { ...base, alphaDigest: "row-3", centerX: 0.8 },
      },
    ]

    const cliqueGroups = createPartMatchGroups({
      enableLabelGatedNearMatches: true,
      pairScorerConfig: closeCenterScorerConfig(),
      rows,
    })
    const connectedGroups = createPartMatchGroups({
      enableLabelGatedNearMatches: true,
      pairScorerConfig: {
        ...closeCenterScorerConfig(),
        groupingStrategy: "connected-components",
      },
      rows,
    })

    expect(cliqueGroups[0]?.rowIds).not.toEqual(["row-1", "row-2", "row-3"])
    expect(connectedGroups).toMatchObject([{
      matchKind: "label-gated-near",
      reasons: ["label-gated visual scorer connected component"],
      rowIds: expect.arrayContaining(["row-1", "row-2", "row-3"]),
    }])
    expect(connectedGroups[0]?.rowIds).toHaveLength(3)
  })

  it("prefers the strongest scorer clique over row-order greedy groups", () => {
    const base = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const rows: PartMatchRowInput[] = [
      {
        ...row("row-noisy", "bag-1", "callout-5", plateMask(3, 2)),
        features: { ...base, alphaDigest: "row-noisy", centerX: -0.4, centerY: 0.5 },
      },
      {
        ...row("row-1", "bag-1", "callout-1", plateMask(3, 2)),
        features: { ...base, alphaDigest: "row-1", centerX: 0, centerY: 0.5 },
      },
      {
        ...row("row-2", "bag-1", "callout-2", plateMask(3, 2)),
        features: { ...base, alphaDigest: "row-2", centerX: 0, centerY: 0.5 },
      },
      {
        ...row("row-3", "bag-1", "callout-3", plateMask(3, 2)),
        features: { ...base, alphaDigest: "row-3", centerX: 0, centerY: 0.5 },
      },
      {
        ...row("row-4", "bag-1", "callout-4", plateMask(3, 2)),
        features: { ...base, alphaDigest: "row-4", centerX: 0.2, centerY: 0.5 },
      },
    ]

    const groups = createPartMatchGroups({
      enableLabelGatedNearMatches: true,
      pairScorerConfig: closeCenterScorerConfig(),
      rows,
    })

    expect(groups).toMatchObject([{
      matchKind: "label-gated-near",
      rowIds: ["row-1", "row-2", "row-3", "row-4"],
    }])
  })

  it("lets the trained scorer veto generic near matches", () => {
    const base = extractPartVisualFeatures({
      alphaMask: plateMask(3, 2),
      partRegion: { x: 0, y: 0, width: 36, height: 24 },
    })
    const rows: PartMatchRowInput[] = [
      {
        ...row("row-1", "bag-1", "callout-1", plateMask(3, 2)),
        features: {
          ...base,
          alphaDigest: "left-alpha",
          detailDigest: "left-detail",
        },
      },
      {
        ...row("row-2", "bag-1", "callout-2", plateMask(3, 2)),
        features: {
          ...base,
          alphaDigest: "right-alpha",
          detailDigest: "right-detail",
        },
      },
    ]

    expect(createPartMatchGroups({ enableLabelGatedNearMatches: true, rows }))
      .toHaveLength(1)
    expect(createPartMatchGroups({
      enableLabelGatedNearMatches: true,
      pairScorerConfig: neverMatchScorerConfig(),
      rows,
    })).toEqual([])
  })
})

function alwaysMatchScorerConfig(): PartPairScorerConfig {
  return {
    featureNames: [],
    intercept: 10,
    normalization: {},
    threshold: 0.99,
    version: "test",
    weights: {},
  }
}

function neverMatchScorerConfig(): PartPairScorerConfig {
  return {
    featureNames: [],
    intercept: -10,
    normalization: {},
    threshold: 0.01,
    version: "test",
    weights: {},
  }
}

function closeCenterScorerConfig(): PartPairScorerConfig {
  return {
    featureNames: ["centerDistance"],
    intercept: 10,
    kind: "linear",
    normalization: {},
    threshold: 0.5,
    version: "test",
    weights: {
      centerDistance: -20,
    },
  }
}

function row(
  rowId: string,
  bagId: string,
  calloutId: string,
  alphaMask: PartMatchAlphaMask,
  options: {
    color?: PartMatchRowInput["color"]
    colorKey?: string
  } = {},
): PartMatchRowInput {
  return {
    alphaMask,
    bagId,
    calloutId,
    color: options.color ?? {
      family: "green",
      key: options.colorKey ?? "manual:green",
      manualClassId: options.colorKey ?? "manual:green",
      manualClassTrusted: true,
      name: "Green",
      status: "exact",
    },
    itemId: rowId.replace("row", "item"),
    partRegion: {
      height: alphaMask.height,
      width: alphaMask.width,
      x: 0,
      y: 0,
    },
    rowId,
  }
}

function reviewColor(
  key: string,
  family: string,
  name: string,
): PartMatchRowInput["color"] {
  return {
    family,
    key,
    manualClassTrusted: false,
    name,
    status: "review",
  }
}

function trustedColor(
  manualClassId: string,
  family: string,
  name: string,
): PartMatchRowInput["color"] {
  return {
    family,
    key: manualClassId,
    manualClassId,
    manualClassTrusted: true,
    name,
    status: "exact",
  }
}

function plateMask(studs: number, rows: number, unit = 12): PartMatchAlphaMask {
  const width = studs * unit
  const height = rows * unit
  const data = new Uint8ClampedArray(width * height)
  const baseTop = Math.floor(unit * 0.45)

  paintRegion(data, width, {
    height: height - baseTop,
    width,
    x: 0,
    y: baseTop,
  })

  for (let stud = 0; stud < studs; stud += 1) {
    paintRegion(data, width, {
      height: Math.max(2, Math.floor(unit * 0.32)),
      width: Math.max(2, Math.floor(unit * 0.5)),
      x: stud * unit + Math.floor(unit * 0.25),
      y: 0,
    })
  }

  return { data, height, width }
}

function translatedPlateMask(
  studs: number,
  rows: number,
  unit = 12,
  xOffset = 0,
): PartMatchAlphaMask {
  const width = studs * unit + 8
  const height = rows * unit + 8
  const data = new Uint8ClampedArray(width * height)
  const baseTop = Math.floor(unit * 0.45)
  const originX = 4 + xOffset
  const originY = 4

  paintRegion(data, width, {
    height: rows * unit - baseTop,
    width: studs * unit,
    x: originX,
    y: originY + baseTop,
  })

  for (let stud = 0; stud < studs; stud += 1) {
    paintRegion(data, width, {
      height: Math.max(2, Math.floor(unit * 0.32)),
      width: Math.max(2, Math.floor(unit * 0.5)),
      x: originX + stud * unit + Math.floor(unit * 0.25),
      y: originY,
    })
  }

  return { data, height, width }
}

function paintRegion(
  data: Uint8ClampedArray,
  width: number,
  region: {
    height: number
    width: number
    x: number
    y: number
  },
): void {
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      data[y * width + x] = 255
    }
  }
}

function shiftGrid(
  values: readonly number[],
  width: number,
  xShift: number,
  yShift: number,
): number[] {
  return values.map((_value, index) => {
    const x = index % width
    const y = Math.floor(index / width)
    const sourceX = x - xShift
    const sourceY = y - yShift

    if (sourceX < 0 || sourceY < 0 || sourceX >= width) {
      return 0
    }

    return values[sourceY * width + sourceX] ?? 0
  })
}
