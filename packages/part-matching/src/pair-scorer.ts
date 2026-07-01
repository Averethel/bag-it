import type {
  PartPairEvidenceCondition,
  PartPairEvidenceRule,
  PartPairScorerConfig,
  PartPairScorerTreeNode,
  PartVisualFeatures,
} from "./contracts"
import { DEFAULT_PART_PAIR_SCORER_CONFIG } from "./default-scorer-config"
import { compareNearFeatures } from "./near-match"

export const PART_PAIR_SCORER_CONFIG_VERSION = "0.1.0-alpha.10"

export const PART_PAIR_SCORE_FEATURE_NAMES = [
  "alignedAlpha8Distance",
  "alignedAlpha8Overlap",
  "alignedEdge8Distance",
  "alignedLuma8Distance",
  "alignmentScaleDelta",
  "alignmentShiftDistance",
  "alphaChamferDistance",
  "alphaChamferShiftDistance",
  "alphaChamferShiftRatio",
  "alpha32Distance",
  "alpha32ShiftDistance",
  "alpha32ShiftRatio",
  "alphaDistance",
  "alphaEdgeDistance",
  "alphaEdge32Distance",
  "alphaOrientationDistance",
  "alphaShiftDistance",
  "alphaShiftRatio",
  "baseMatched",
  "baseProbability",
  "alphaCorrelation",
  "areaRatio",
  "aspectRatio",
  "centerDistance",
  "coverageDelta",
  "hasLuma",
  "leftProfileDistance",
  "lowerProfileDistance",
  "lowerSegmentDelta",
  "lumaCorrelation",
  "lumaDistance",
  "luma32Distance",
  "luma32ShiftDistance",
  "luma32ShiftRatio",
  "lumaEdgeCorrelation",
  "lumaEdgeDistance",
  "lumaEdgeShiftDistance",
  "lumaOrientationDistance",
  "lumaShiftDistance",
  "lumaShiftRatio",
  "nearConfidence",
  "profileMaxDistance",
  "projectionDistance",
  "rightProfileDistance",
  "silhouetteDistance",
  "silhouetteShiftDistance",
  "silhouetteShiftRatio",
  "tightAlpha32Distance",
  "tightAlpha32ShiftDistance",
  "tightAlpha32ShiftRatio",
  "tightAlphaChamferDistance",
  "tightAlphaChamferShiftDistance",
  "tightAlphaChamferShiftRatio",
  "tightAlphaEdge32Distance",
  "tightLuma32Distance",
  "tightLuma32ShiftDistance",
  "tightLuma32ShiftRatio",
  "topPeakDelta",
  "topProfileDistance",
  "wideAlpha32ShiftDistance",
  "wideAlpha32ShiftRatio",
  "wideLuma32ShiftDistance",
  "wideLuma32ShiftRatio",
  "wideSilhouetteShiftDistance",
  "wideSilhouetteShiftRatio",
] as const

export type PartPairScoreFeatureName = typeof PART_PAIR_SCORE_FEATURE_NAMES[number]
export type PartPairScoreFeatures = Record<PartPairScoreFeatureName, number>

interface ExtractPartPairScoreFeaturesOptions {
  featureNames?: readonly string[] | null
}

export interface PartPairScoreResult {
  features: PartPairScoreFeatures
  matched: boolean
  probability: number
}

interface WeightedGridPoint {
  weight: number
  x: number
  y: number
}

const STRONG_LUMA_DISTANCE = 7.667
const STRONG_LUMA_EDGE_DISTANCE = 10.421
const STRONG_LUMA_EDGE_CORRELATION = 0.8722
const STRONG_LUMA_CORRELATION = 0.718
const STRONG_ALPHA_CORRELATION = 0.9766
const STRONG_RIGHT_PROFILE_DISTANCE = 0.0208
const STRONG_LEFT_PROFILE_DISTANCE = 0.0165
const STRONG_PROFILE_MAX_DISTANCE = 0.0208
const STRONG_PROJECTION_DISTANCE = 0.0149
const STRONG_COVERAGE_DELTA = 0.00025
const STRONG_TOP_PROFILE_DISTANCE = 0.0124
const SHIFT_GRID_SIZE = 16
const SHIFT_RADIUS = 2
const WIDE_SHIFT_RADIUS = 5
const ALIGNMENT_GRID_SIZE = 8
const ALIGNMENT_SCALES = [0.875, 1, 1.125] as const
const ALIGNMENT_SHIFT_RADIUS = 3

const DEFAULT_STRONG_VISUAL_EVIDENCE_RULES: PartPairEvidenceRule[] = [
  ltRule("lumaDistance", STRONG_LUMA_DISTANCE),
  ltRule("lumaEdgeDistance", STRONG_LUMA_EDGE_DISTANCE),
  gtRule("lumaEdgeCorrelation", STRONG_LUMA_EDGE_CORRELATION),
  gtRule("lumaCorrelation", STRONG_LUMA_CORRELATION),
  gtRule("alphaCorrelation", STRONG_ALPHA_CORRELATION),
  ltRule("rightProfileDistance", STRONG_RIGHT_PROFILE_DISTANCE),
  ltRule("leftProfileDistance", STRONG_LEFT_PROFILE_DISTANCE),
  ltRule("profileMaxDistance", STRONG_PROFILE_MAX_DISTANCE),
  ltRule("projectionDistance", STRONG_PROJECTION_DISTANCE),
  ltRule("coverageDelta", STRONG_COVERAGE_DELTA),
  ltRule("topProfileDistance", STRONG_TOP_PROFILE_DISTANCE),
]

export function extractPartPairScoreFeatures(
  left: PartVisualFeatures,
  right: PartVisualFeatures,
  options: ExtractPartPairScoreFeaturesOptions = {},
): PartPairScoreFeatures {
  const requestedFeatureNames = options.featureNames
    ? new Set(options.featureNames)
    : null
  const topProfileDistance = meanAbsoluteDifference(left.topProfile, right.topProfile)
  const lowerProfileDistance = meanAbsoluteDifference(left.lowerProfile, right.lowerProfile)
  const leftProfileDistance = meanAbsoluteDifference(left.leftProfile, right.leftProfile)
  const rightProfileDistance = meanAbsoluteDifference(left.rightProfile, right.rightProfile)
  const lumaFeatures = extractLumaPairScoreFeatures(left, right)
  const leftAlpha32 = left.normalizedAlpha32 ?? left.normalizedAlpha
  const rightAlpha32 = right.normalizedAlpha32 ?? right.normalizedAlpha
  const leftEdge32 = left.edgeAlpha32 ?? left.edgeAlpha
  const rightEdge32 = right.edgeAlpha32 ?? right.edgeAlpha
  const leftSilhouette = left.alphaSignedDistanceGrid32 ?? leftAlpha32
  const rightSilhouette = right.alphaSignedDistanceGrid32 ?? rightAlpha32
  const leftTightAlpha32 = left.tightAlpha32 ?? leftAlpha32
  const rightTightAlpha32 = right.tightAlpha32 ?? rightAlpha32
  const leftTightAlphaEdge32 = left.tightAlphaEdge32 ?? leftEdge32
  const rightTightAlphaEdge32 = right.tightAlphaEdge32 ?? rightEdge32
  const needsAlphaChamfer = featureRequested(requestedFeatureNames, [
    "alphaChamferDistance",
    "alphaChamferShiftDistance",
    "alphaChamferShiftRatio",
  ])
  const needsTightAlphaChamfer = featureRequested(requestedFeatureNames, [
    "tightAlphaChamferDistance",
    "tightAlphaChamferShiftDistance",
    "tightAlphaChamferShiftRatio",
  ])
  const alignment = alignPartGrids(left, right)
  const alphaChamfer = needsAlphaChamfer
    ? extractChamferPairScoreFeatures({
      leftBoundary: leftEdge32,
      leftDistance: leftSilhouette,
      rightBoundary: rightEdge32,
      rightDistance: rightSilhouette,
    })
    : defaultChamferPairScoreFeatures()
  const tightAlphaChamfer = needsTightAlphaChamfer
    ? extractChamferPairScoreFeatures({
      leftBoundary: leftTightAlphaEdge32,
      leftDistance: left.tightAlphaSignedDistanceGrid32 ?? leftTightAlpha32,
      rightBoundary: rightTightAlphaEdge32,
      rightDistance: right.tightAlphaSignedDistanceGrid32 ?? rightTightAlpha32,
    })
    : defaultChamferPairScoreFeatures()
  const alpha32Distance = meanAbsoluteDifference(leftAlpha32, rightAlpha32)
  const alpha32ShiftDistance = shiftedMeanAbsoluteDifference(leftAlpha32, rightAlpha32, {
    fallback: 0,
    radius: SHIFT_RADIUS,
    width: 32,
  })
  const wideAlpha32ShiftDistance = shiftedMeanAbsoluteDifference(leftAlpha32, rightAlpha32, {
    fallback: 0,
    radius: WIDE_SHIFT_RADIUS,
    width: 32,
  })
  const tightAlpha32Distance = meanAbsoluteDifference(leftTightAlpha32, rightTightAlpha32)
  const tightAlpha32ShiftDistance = shiftedMeanAbsoluteDifference(leftTightAlpha32, rightTightAlpha32, {
    fallback: 0,
    radius: SHIFT_RADIUS,
    width: 32,
  })
  const alphaDistance = meanAbsoluteDifference(left.normalizedAlpha, right.normalizedAlpha)
  const alphaShiftDistance = shiftedMeanAbsoluteDifference(left.normalizedAlpha, right.normalizedAlpha, {
    fallback: 0,
    radius: SHIFT_RADIUS,
    width: SHIFT_GRID_SIZE,
  })
  const silhouetteDistance = meanAbsoluteDifference(leftSilhouette, rightSilhouette)
  const silhouetteShiftDistance = shiftedMeanAbsoluteDifference(leftSilhouette, rightSilhouette, {
    fallback: 0,
    radius: SHIFT_RADIUS,
    width: 32,
  })
  const wideSilhouetteShiftDistance = shiftedMeanAbsoluteDifference(leftSilhouette, rightSilhouette, {
    fallback: 0,
    radius: WIDE_SHIFT_RADIUS,
    width: 32,
  })

  const features: PartPairScoreFeatures = {
    alignedAlpha8Distance: alignment.alphaDistance,
    alignedAlpha8Overlap: alignment.alphaOverlap,
    alignedEdge8Distance: alignment.edgeDistance,
    alignedLuma8Distance: alignment.lumaDistance,
    alignmentScaleDelta: Math.abs(1 - alignment.scale),
    alignmentShiftDistance: Math.hypot(alignment.xShift, alignment.yShift) / ALIGNMENT_GRID_SIZE,
    alphaChamferDistance: alphaChamfer.distance,
    alphaChamferShiftDistance: alphaChamfer.shiftDistance,
    alphaChamferShiftRatio: alphaChamfer.shiftRatio,
    alpha32Distance,
    alpha32ShiftDistance,
    alpha32ShiftRatio: shiftedDistanceRatio(alpha32Distance, alpha32ShiftDistance),
    alphaDistance,
    alphaEdgeDistance: meanAbsoluteDifference(left.edgeAlpha, right.edgeAlpha),
    alphaEdge32Distance: meanAbsoluteDifference(leftEdge32, rightEdge32),
    alphaOrientationDistance: meanAbsoluteDifference(
      left.alphaOrientationHistogram ?? [],
      right.alphaOrientationHistogram ?? [],
    ),
    alphaShiftDistance,
    alphaShiftRatio: shiftedDistanceRatio(alphaDistance, alphaShiftDistance),
    baseMatched: 0,
    baseProbability: 0,
    alphaCorrelation: correlation(left.normalizedAlpha, right.normalizedAlpha),
    areaRatio: ratioOf(left.area, right.area),
    aspectRatio: ratioOf(left.aspectRatio, right.aspectRatio),
    centerDistance: Math.hypot(left.centerX - right.centerX, left.centerY - right.centerY),
    coverageDelta: Math.abs(left.opaqueCoverage - right.opaqueCoverage),
    hasLuma: left.lumaGrid && right.lumaGrid ? 1 : 0,
    leftProfileDistance,
    lowerProfileDistance,
    lowerSegmentDelta: Math.abs(left.lowerSegmentCount - right.lowerSegmentCount),
    ...lumaFeatures,
    nearConfidence: compareNearFeatures(left, right).confidence,
    profileMaxDistance: Math.max(
      topProfileDistance,
      lowerProfileDistance,
      leftProfileDistance,
      rightProfileDistance,
    ),
    projectionDistance: Math.max(
      meanAbsoluteDifference(left.projectionX, right.projectionX),
      meanAbsoluteDifference(left.projectionY, right.projectionY),
    ),
    rightProfileDistance,
    silhouetteDistance,
    silhouetteShiftDistance,
    silhouetteShiftRatio: shiftedDistanceRatio(silhouetteDistance, silhouetteShiftDistance),
    tightAlpha32Distance,
    tightAlpha32ShiftDistance,
    tightAlpha32ShiftRatio: shiftedDistanceRatio(tightAlpha32Distance, tightAlpha32ShiftDistance),
    tightAlphaChamferDistance: tightAlphaChamfer.distance,
    tightAlphaChamferShiftDistance: tightAlphaChamfer.shiftDistance,
    tightAlphaChamferShiftRatio: tightAlphaChamfer.shiftRatio,
    tightAlphaEdge32Distance: meanAbsoluteDifference(leftTightAlphaEdge32, rightTightAlphaEdge32),
    topPeakDelta: Math.abs(left.topPeakCount - right.topPeakCount),
    topProfileDistance,
    wideAlpha32ShiftDistance,
    wideAlpha32ShiftRatio: shiftedDistanceRatio(alpha32Distance, wideAlpha32ShiftDistance),
    wideLuma32ShiftDistance: lumaFeatures.wideLuma32ShiftDistance,
    wideLuma32ShiftRatio: lumaFeatures.wideLuma32ShiftRatio,
    wideSilhouetteShiftDistance,
    wideSilhouetteShiftRatio: shiftedDistanceRatio(silhouetteDistance, wideSilhouetteShiftDistance),
  }

  if (featureRequested(requestedFeatureNames, ["baseMatched", "baseProbability"])) {
    const rawBaseProbability = scoreFeatureVector(features, DEFAULT_PART_PAIR_SCORER_CONFIG)
    const baseMatched = partPairScoreFeaturesMatch(features, DEFAULT_PART_PAIR_SCORER_CONFIG)

    features.baseMatched = baseMatched ? 1 : 0
    features.baseProbability = baseMatched
      ? Math.max(rawBaseProbability, DEFAULT_PART_PAIR_SCORER_CONFIG.threshold)
      : rawBaseProbability
  }

  return features
}

function extractLumaPairScoreFeatures(
  left: PartVisualFeatures,
  right: PartVisualFeatures,
): Pick<PartPairScoreFeatures,
  "lumaCorrelation" |
  "lumaDistance" |
  "luma32Distance" |
  "luma32ShiftDistance" |
  "luma32ShiftRatio" |
  "lumaEdgeCorrelation" |
  "lumaEdgeDistance" |
  "lumaEdgeShiftDistance" |
  "lumaOrientationDistance" |
  "lumaShiftDistance" |
  "lumaShiftRatio" |
  "tightLuma32Distance" |
  "tightLuma32ShiftDistance" |
  "tightLuma32ShiftRatio" |
  "wideLuma32ShiftDistance" |
  "wideLuma32ShiftRatio"
> {
  if (!left.lumaGrid || !right.lumaGrid) {
    return {
      lumaCorrelation: 0,
      lumaDistance: 255,
      luma32Distance: 255,
      luma32ShiftDistance: 255,
      luma32ShiftRatio: 1,
      lumaEdgeCorrelation: 0,
      lumaEdgeDistance: 255,
      lumaEdgeShiftDistance: 255,
      lumaOrientationDistance: 1,
      lumaShiftDistance: 255,
      lumaShiftRatio: 1,
      tightLuma32Distance: 255,
      tightLuma32ShiftDistance: 255,
      tightLuma32ShiftRatio: 1,
      wideLuma32ShiftDistance: 255,
      wideLuma32ShiftRatio: 1,
    }
  }

  const lumaEdgeLeft = createEdgeGrid(left.lumaGrid, 16)
  const lumaEdgeRight = createEdgeGrid(right.lumaGrid, 16)
  const leftLuma32 = left.lumaGrid32 ?? left.lumaGrid
  const rightLuma32 = right.lumaGrid32 ?? right.lumaGrid
  const lumaDistance = meanAbsoluteDifference(left.lumaGrid, right.lumaGrid)
  const lumaShiftDistance = shiftedMeanAbsoluteDifference(left.lumaGrid, right.lumaGrid, {
    fallback: 128,
    radius: SHIFT_RADIUS,
    width: 16,
  })
  const luma32Distance = meanAbsoluteDifference(leftLuma32, rightLuma32)
  const luma32ShiftDistance = shiftedMeanAbsoluteDifference(leftLuma32, rightLuma32, {
    fallback: 128,
    radius: SHIFT_RADIUS,
    width: 32,
  })
  const wideLuma32ShiftDistance = shiftedMeanAbsoluteDifference(leftLuma32, rightLuma32, {
    fallback: 128,
    radius: WIDE_SHIFT_RADIUS,
    width: 32,
  })
  const leftTightLuma32 = left.tightLumaGrid32 ?? leftLuma32
  const rightTightLuma32 = right.tightLumaGrid32 ?? rightLuma32
  const tightLuma32Distance = meanAbsoluteDifference(leftTightLuma32, rightTightLuma32)
  const tightLuma32ShiftDistance = shiftedMeanAbsoluteDifference(leftTightLuma32, rightTightLuma32, {
    fallback: 128,
    radius: SHIFT_RADIUS,
    width: 32,
  })

  return {
    lumaCorrelation: correlation(left.lumaGrid, right.lumaGrid),
    lumaDistance,
    luma32Distance,
    luma32ShiftDistance,
    luma32ShiftRatio: shiftedDistanceRatio(luma32Distance, luma32ShiftDistance),
    lumaEdgeCorrelation: correlation(lumaEdgeLeft, lumaEdgeRight),
    lumaEdgeDistance: meanAbsoluteDifference(lumaEdgeLeft, lumaEdgeRight),
    lumaEdgeShiftDistance: shiftedMeanAbsoluteDifference(lumaEdgeLeft, lumaEdgeRight, {
      fallback: 0,
      radius: SHIFT_RADIUS,
      width: 16,
    }),
    lumaOrientationDistance: meanAbsoluteDifference(
      left.lumaOrientationHistogram ?? [],
      right.lumaOrientationHistogram ?? [],
    ),
    lumaShiftDistance,
    lumaShiftRatio: shiftedDistanceRatio(lumaDistance, lumaShiftDistance),
    tightLuma32Distance,
    tightLuma32ShiftDistance,
    tightLuma32ShiftRatio: shiftedDistanceRatio(tightLuma32Distance, tightLuma32ShiftDistance),
    wideLuma32ShiftDistance,
    wideLuma32ShiftRatio: shiftedDistanceRatio(luma32Distance, wideLuma32ShiftDistance),
  }
}

function featureRequested(
  requestedFeatureNames: ReadonlySet<string> | null,
  featureNames: readonly PartPairScoreFeatureName[],
): boolean {
  return !requestedFeatureNames || featureNames.some((featureName) => requestedFeatureNames.has(featureName))
}

function defaultChamferPairScoreFeatures(): {
  distance: number
  shiftDistance: number
  shiftRatio: number
} {
  return {
    distance: 255,
    shiftDistance: 255,
    shiftRatio: 1,
  }
}

function extractChamferPairScoreFeatures({
  leftBoundary,
  leftDistance,
  rightBoundary,
  rightDistance,
}: {
  leftBoundary: readonly number[]
  leftDistance: readonly number[]
  rightBoundary: readonly number[]
  rightDistance: readonly number[]
}): {
  distance: number
  shiftDistance: number
  shiftRatio: number
} {
  const distance = symmetricChamferDistance({
    leftBoundary,
    leftDistance,
    rightBoundary,
    rightDistance,
    width: 32,
  })
  const shiftDistance = shiftedSymmetricChamferDistance({
    leftBoundary,
    leftDistance,
    radius: SHIFT_RADIUS,
    rightBoundary,
    rightDistance,
    width: 32,
  })

  return {
    distance,
    shiftDistance,
    shiftRatio: shiftedDistanceRatio(distance, shiftDistance),
  }
}

function alignPartGrids(
  left: PartVisualFeatures,
  right: PartVisualFeatures,
): {
  alphaDistance: number
  alphaOverlap: number
  edgeDistance: number
  lumaDistance: number
  scale: number
  xShift: number
  yShift: number
} {
  const leftAlpha = downsampleGrid(left.normalizedAlpha, 16, ALIGNMENT_GRID_SIZE)
  const rightAlpha = downsampleGrid(right.normalizedAlpha, 16, ALIGNMENT_GRID_SIZE)
  const transform = findBestAlignmentTransform(leftAlpha, rightAlpha)
  const leftEdge = downsampleGrid(left.edgeAlpha, 16, ALIGNMENT_GRID_SIZE)
  const rightEdge = downsampleGrid(right.edgeAlpha, 16, ALIGNMENT_GRID_SIZE)
  const lumaDistance = left.lumaGrid && right.lumaGrid
    ? transformedMeanAbsoluteDifference(
      downsampleGrid(left.lumaGrid, 16, ALIGNMENT_GRID_SIZE),
      downsampleGrid(right.lumaGrid, 16, ALIGNMENT_GRID_SIZE),
      {
        ...transform,
        fallback: 128,
        width: ALIGNMENT_GRID_SIZE,
      },
    )
    : 255

  return {
    alphaDistance: transform.distance,
    alphaOverlap: transform.overlap,
    edgeDistance: transformedMeanAbsoluteDifference(leftEdge, rightEdge, {
      ...transform,
      fallback: 0,
      width: ALIGNMENT_GRID_SIZE,
    }),
    lumaDistance,
    scale: transform.scale,
    xShift: transform.xShift,
    yShift: transform.yShift,
  }
}

function findBestAlignmentTransform(
  left: readonly number[],
  right: readonly number[],
): {
  distance: number
  overlap: number
  scale: number
  xShift: number
  yShift: number
} {
  let best = {
    distance: Number.POSITIVE_INFINITY,
    overlap: 0,
    scale: 1,
    xShift: 0,
    yShift: 0,
  }

  for (const transform of alignmentTransformCandidates()) {
    const candidate = scoreAlignmentTransform(left, right, transform)

    best = betterAlignment(candidate, best)
  }

  return best
}

function alignmentTransformCandidates(): Array<{
  scale: number
  xShift: number
  yShift: number
}> {
  return ALIGNMENT_SCALES.flatMap((scale) =>
    alignmentShiftValues().flatMap((yShift) =>
      alignmentShiftValues().map((xShift) => ({
        scale,
        xShift,
        yShift,
      }))
    )
  )
}

function alignmentShiftValues(): number[] {
  return Array.from(
    { length: ALIGNMENT_SHIFT_RADIUS * 2 + 1 },
    (_value, index) => index - ALIGNMENT_SHIFT_RADIUS,
  )
}

function scoreAlignmentTransform(
  left: readonly number[],
  right: readonly number[],
  transform: {
    scale: number
    xShift: number
    yShift: number
  },
): {
  distance: number
  overlap: number
  scale: number
  xShift: number
  yShift: number
} {
  return {
    ...transform,
    distance: transformedMeanAbsoluteDifference(left, right, {
      ...transform,
      fallback: 0,
      width: ALIGNMENT_GRID_SIZE,
    }),
    overlap: transformedSoftOverlap(left, right, {
      ...transform,
      width: ALIGNMENT_GRID_SIZE,
    }),
  }
}

function betterAlignment<T extends {
  distance: number
  overlap: number
}>(candidate: T, current: T): T {
  return candidate.distance < current.distance ||
    (candidate.distance === current.distance && candidate.overlap > current.overlap)
    ? candidate
    : current
}

function transformedMeanAbsoluteDifference(
  left: readonly number[],
  right: readonly number[],
  {
    fallback,
    scale,
    width,
    xShift,
    yShift,
  }: {
    fallback: number
    scale: number
    width: number
    xShift: number
    yShift: number
  },
): number {
  let total = 0
  let count = 0

  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      total += Math.abs(
        (left[y * width + x] ?? fallback) -
        readAlignedGridValue(right, {
          fallback,
          scale,
          width,
          x,
          xShift,
          y,
          yShift,
        }),
      )
      count += 1
    }
  }

  return count === 0 ? Number.POSITIVE_INFINITY : total / count
}

function transformedSoftOverlap(
  left: readonly number[],
  right: readonly number[],
  {
    scale,
    width,
    xShift,
    yShift,
  }: {
    scale: number
    width: number
    xShift: number
    yShift: number
  },
): number {
  let intersection = 0
  let union = 0

  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const leftValue = Math.max(0, left[y * width + x] ?? 0)
      const rightValue = Math.max(0, readAlignedGridValue(right, {
        fallback: 0,
        scale,
        width,
        x,
        xShift,
        y,
        yShift,
      }))

      intersection += Math.min(leftValue, rightValue)
      union += Math.max(leftValue, rightValue)
    }
  }

  return union <= 0 ? 0 : intersection / union
}

function readAlignedGridValue(
  values: readonly number[],
  {
    fallback,
    scale,
    width,
    x,
    xShift,
    y,
    yShift,
  }: {
    fallback: number
    scale: number
    width: number
    x: number
    xShift: number
    y: number
    yShift: number
  },
): number {
  const center = (width - 1) / 2
  const sourceX = Math.round((x - center - xShift) / scale + center)
  const sourceY = Math.round((y - center - yShift) / scale + center)

  if (sourceX < 0 || sourceY < 0 || sourceX >= width || sourceY >= width) {
    return fallback
  }

  return values[sourceY * width + sourceX] ?? fallback
}

function downsampleGrid(
  values: readonly number[],
  sourceWidth: number,
  targetWidth: number,
): number[] {
  if (values.length === 0 || sourceWidth <= 0 || targetWidth <= 0) {
    return []
  }

  const result: number[] = []
  const sourceHeight = Math.ceil(values.length / sourceWidth)
  const yScale = sourceHeight / targetWidth
  const xScale = sourceWidth / targetWidth

  for (let y = 0; y < targetWidth; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      result.push(downsampleCell(values, {
        sourceWidth,
        x,
        xScale,
        y,
        yScale,
      }))
    }
  }

  return result
}

function downsampleCell(
  values: readonly number[],
  {
    sourceWidth,
    x,
    xScale,
    y,
    yScale,
  }: {
    sourceWidth: number
    x: number
    xScale: number
    y: number
    yScale: number
  },
): number {
  const xStart = Math.floor(x * xScale)
  const xEnd = Math.max(xStart + 1, Math.floor((x + 1) * xScale))
  const yStart = Math.floor(y * yScale)
  const yEnd = Math.max(yStart + 1, Math.floor((y + 1) * yScale))
  let total = 0
  let count = 0

  for (let sourceY = yStart; sourceY < yEnd; sourceY += 1) {
    for (let sourceX = xStart; sourceX < xEnd; sourceX += 1) {
      total += values[sourceY * sourceWidth + sourceX] ?? 0
      count += 1
    }
  }

  return count === 0 ? 0 : total / count
}

export function scorePartPair(
  left: PartVisualFeatures,
  right: PartVisualFeatures,
  config: PartPairScorerConfig,
): PartPairScoreResult {
  const features = extractPartPairScoreFeatures(left, right, {
    featureNames: collectPartPairScorerFeatureNames(config),
  })
  const rawProbability = scoreFeatureVector(features, config)
  const matched = partPairScoreFeaturesMatch(features, config)

  return {
    features,
    matched,
    probability: matched ? Math.max(rawProbability, config.threshold) : rawProbability,
  }
}

export function collectPartPairScorerFeatureNames(config: PartPairScorerConfig): string[] {
  const featureNames = new Set<string>(config.featureNames)

  collectTreeFeatureNames(featureNames, config.tree)

  for (const rule of [
    ...(config.evidenceRules ?? []),
    ...(config.modelGatedSupplementalRules ?? []),
    ...(config.supplementalRules ?? []),
    ...(config.vetoRules ?? []),
  ]) {
    for (const condition of rule.conditions) {
      featureNames.add(condition.featureName)
    }
  }

  return [...featureNames]
}

function collectTreeFeatureNames(
  featureNames: Set<string>,
  node: PartPairScorerTreeNode | undefined,
): void {
  if (!node || !("featureName" in node)) {
    return
  }

  featureNames.add(node.featureName)
  collectTreeFeatureNames(featureNames, node.left)
  collectTreeFeatureNames(featureNames, node.right)
}

export function partPairScoreFeaturesMatch(
  features: PartPairScoreFeatures,
  config: PartPairScorerConfig,
): boolean {
  if (hasVetoEvidence(features, config.vetoRules)) {
    return false
  }

  const modelMatched = scoreFeatureVector(features, config) >= config.threshold
  const visualMatched = hasVisualEvidence(features, config.evidenceRules)
  const supplementalMatched = hasConfiguredVisualEvidence(features, config.supplementalRules)
  const modelGatedSupplementalMatched = hasConfiguredVisualEvidence(features, config.modelGatedSupplementalRules)

  if (config.supplementalMode === "model-gated") {
    return modelMatched && (visualMatched || supplementalMatched)
  }

  return (modelMatched && (visualMatched || modelGatedSupplementalMatched)) || supplementalMatched
}

function hasVisualEvidence(
  features: PartPairScoreFeatures,
  evidenceRules: readonly PartPairEvidenceRule[] | undefined,
): boolean {
  const rules = evidenceRules?.length
    ? evidenceRules
    : DEFAULT_STRONG_VISUAL_EVIDENCE_RULES

  return rules.some((rule) => evidenceRuleMatches(features, rule))
}

function hasConfiguredVisualEvidence(
  features: PartPairScoreFeatures,
  evidenceRules: readonly PartPairEvidenceRule[] | undefined,
): boolean {
  return Boolean(evidenceRules?.some((rule) => evidenceRuleMatches(features, rule)))
}

function hasVetoEvidence(
  features: PartPairScoreFeatures,
  vetoRules: readonly PartPairEvidenceRule[] | undefined,
): boolean {
  return Boolean(vetoRules?.some((rule) => evidenceRuleMatches(features, rule)))
}

function evidenceRuleMatches(
  features: PartPairScoreFeatures,
  rule: PartPairEvidenceRule,
): boolean {
  return rule.conditions.length > 0 &&
    rule.conditions.every((condition) => evidenceConditionMatches(features, condition))
}

function evidenceConditionMatches(
  features: PartPairScoreFeatures,
  condition: PartPairEvidenceCondition,
): boolean {
  const value = readFeature(features, condition.featureName)

  return condition.operator === "lt"
    ? value < condition.threshold
    : value > condition.threshold
}

function ltRule(featureName: PartPairScoreFeatureName, threshold: number): PartPairEvidenceRule {
  return {
    conditions: [{ featureName, operator: "lt", threshold }],
  }
}

function gtRule(featureName: PartPairScoreFeatureName, threshold: number): PartPairEvidenceRule {
  return {
    conditions: [{ featureName, operator: "gt", threshold }],
  }
}

export function scoreFeatureVector(
  features: PartPairScoreFeatures,
  config: PartPairScorerConfig,
): number {
  if (config.kind === "decision-tree" && config.tree) {
    return scoreTree(features, config.tree)
  }

  const logit = config.featureNames.reduce((total, featureName) => {
    const rawValue = readFeature(features, featureName)
    const normalized = normalizeFeature(rawValue, config.normalization[featureName])

    return total + (config.weights[featureName] ?? 0) * normalized
  }, config.intercept)

  return sigmoid(logit)
}

function scoreTree(features: PartPairScoreFeatures, node: PartPairScorerTreeNode): number {
  if (!("featureName" in node)) {
    return node.probability
  }

  return readFeature(features, node.featureName) <= node.threshold
    ? scoreTree(features, node.left)
    : scoreTree(features, node.right)
}

function readFeature(features: PartPairScoreFeatures, featureName: string): number {
  return features[featureName as PartPairScoreFeatureName] ?? 0
}

function normalizeFeature(
  value: number,
  normalization: { mean: number, std: number } | undefined,
): number {
  if (!normalization || normalization.std <= 0) {
    return value
  }

  return (value - normalization.mean) / normalization.std
}

function sigmoid(value: number): number {
  if (value <= -35) {
    return 0
  }

  if (value >= 35) {
    return 1
  }

  return 1 / (1 + Math.exp(-value))
}

function createEdgeGrid(values: readonly number[], size: number): number[] {
  const result: number[] = []

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = readGridValue(values, size, x, y)
      const horizontalEdge = Math.abs(value - readGridValue(values, size, x + 1, y))
      const verticalEdge = Math.abs(value - readGridValue(values, size, x, y + 1))

      result.push(Math.max(horizontalEdge, verticalEdge))
    }
  }

  return result
}

function readGridValue(values: readonly number[], size: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return 0
  }

  return values[y * size + x] ?? 0
}

function correlation(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length)

  if (length === 0) {
    return 0
  }

  const leftMean = mean(left, length)
  const rightMean = mean(right, length)
  let numerator = 0
  let leftVariance = 0
  let rightVariance = 0

  for (let index = 0; index < length; index += 1) {
    const leftDelta = (left[index] ?? 0) - leftMean
    const rightDelta = (right[index] ?? 0) - rightMean

    numerator += leftDelta * rightDelta
    leftVariance += leftDelta * leftDelta
    rightVariance += rightDelta * rightDelta
  }

  if (leftVariance <= 0 || rightVariance <= 0) {
    return 0
  }

  return numerator / Math.sqrt(leftVariance * rightVariance)
}

function mean(values: readonly number[], length: number): number {
  let total = 0

  for (let index = 0; index < length; index += 1) {
    total += values[index] ?? 0
  }

  return total / length
}

function meanAbsoluteDifference(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length)

  if (length === 0) {
    return Number.POSITIVE_INFINITY
  }

  let total = 0

  for (let index = 0; index < length; index += 1) {
    total += Math.abs((left[index] ?? 0) - (right[index] ?? 0))
  }

  return total / length
}

function shiftedMeanAbsoluteDifference(
  left: readonly number[],
  right: readonly number[],
  {
    fallback,
    radius,
    width,
  }: {
    fallback: number
    radius: number
    width: number
  },
): number {
  if (left.length === 0 || right.length === 0 || width <= 0) {
    return Number.POSITIVE_INFINITY
  }

  let best = Number.POSITIVE_INFINITY

  for (let yShift = -radius; yShift <= radius; yShift += 1) {
    for (let xShift = -radius; xShift <= radius; xShift += 1) {
      best = Math.min(best, shiftedDistanceAt(left, right, {
        fallback,
        width,
        xShift,
        yShift,
      }))
    }
  }

  return best
}

function shiftedDistanceRatio(distance: number, shiftedDistance: number): number {
  if (!Number.isFinite(distance) || !Number.isFinite(shiftedDistance)) {
    return 1
  }

  const baseline = Math.max(0.0001, distance)

  return Math.min(1, shiftedDistance / baseline)
}

function symmetricChamferDistance({
  leftBoundary,
  leftDistance,
  rightBoundary,
  rightDistance,
  width,
}: {
  leftBoundary: readonly number[]
  leftDistance: readonly number[]
  rightBoundary: readonly number[]
  rightDistance: readonly number[]
  width: number
}): number {
  const leftBoundaryPoints = createWeightedBoundaryPoints(leftBoundary, width)
  const rightBoundaryPoints = createWeightedBoundaryPoints(rightBoundary, width)
  const leftToRight = oneWayChamferDistance({
    distance: rightDistance,
    fallback: 255,
    points: leftBoundaryPoints,
    width,
    xShift: 0,
    yShift: 0,
  })
  const rightToLeft = oneWayChamferDistance({
    distance: leftDistance,
    fallback: 255,
    points: rightBoundaryPoints,
    width,
    xShift: 0,
    yShift: 0,
  })

  return meanFiniteDistances(leftToRight, rightToLeft)
}

function shiftedSymmetricChamferDistance({
  leftBoundary,
  leftDistance,
  radius,
  rightBoundary,
  rightDistance,
  width,
}: {
  leftBoundary: readonly number[]
  leftDistance: readonly number[]
  radius: number
  rightBoundary: readonly number[]
  rightDistance: readonly number[]
  width: number
}): number {
  const leftBoundaryPoints = createWeightedBoundaryPoints(leftBoundary, width)
  const rightBoundaryPoints = createWeightedBoundaryPoints(rightBoundary, width)

  if (leftBoundaryPoints.length === 0 || rightBoundaryPoints.length === 0 || width <= 0) {
    return Number.POSITIVE_INFINITY
  }

  let best = Number.POSITIVE_INFINITY

  for (let yShift = -radius; yShift <= radius; yShift += 1) {
    for (let xShift = -radius; xShift <= radius; xShift += 1) {
      const distance = meanFiniteDistances(
        oneWayChamferDistance({
          distance: rightDistance,
          fallback: 255,
          points: leftBoundaryPoints,
          width,
          xShift,
          yShift,
        }),
        oneWayChamferDistance({
          distance: leftDistance,
          fallback: 255,
          points: rightBoundaryPoints,
          width,
          xShift: -xShift,
          yShift: -yShift,
        }),
      )

      best = Math.min(best, distance)
    }
  }

  return best
}

function createWeightedBoundaryPoints(
  boundary: readonly number[],
  width: number,
): WeightedGridPoint[] {
  const points: WeightedGridPoint[] = []

  if (width <= 0) {
    return points
  }

  for (let index = 0; index < boundary.length; index += 1) {
    const weight = Math.max(0, boundary[index] ?? 0)

    if (weight <= 0) {
      continue
    }

    points.push({
      weight,
      x: index % width,
      y: Math.floor(index / width),
    })
  }

  return points
}

function oneWayChamferDistance({
  distance,
  fallback,
  points,
  width,
  xShift,
  yShift,
}: {
  distance: readonly number[]
  fallback: number
  points: readonly WeightedGridPoint[]
  width: number
  xShift: number
  yShift: number
}): number {
  let total = 0
  let weightTotal = 0

  for (const point of points) {
    total += point.weight * Math.abs(
      readShiftGridValue(distance, width, point.x + xShift, point.y + yShift, fallback),
    )
    weightTotal += point.weight
  }

  return weightTotal <= 0 ? Number.POSITIVE_INFINITY : total / weightTotal
}

function meanFiniteDistances(left: number, right: number): number {
  if (Number.isFinite(left) && Number.isFinite(right)) {
    return (left + right) / 2
  }

  if (Number.isFinite(left)) {
    return left
  }

  if (Number.isFinite(right)) {
    return right
  }

  return Number.POSITIVE_INFINITY
}

function shiftedDistanceAt(
  left: readonly number[],
  right: readonly number[],
  {
    fallback,
    width,
    xShift,
    yShift,
  }: {
    fallback: number
    width: number
    xShift: number
    yShift: number
  },
): number {
  const height = Math.max(
    Math.ceil(left.length / width),
    Math.ceil(right.length / width),
  )
  let total = 0
  let count = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      total += Math.abs(
        readShiftGridValue(left, width, x, y, fallback) -
        readShiftGridValue(right, width, x + xShift, y + yShift, fallback),
      )
      count += 1
    }
  }

  return count === 0 ? Number.POSITIVE_INFINITY : total / count
}

function readShiftGridValue(
  values: readonly number[],
  width: number,
  x: number,
  y: number,
  fallback: number,
): number {
  if (x < 0 || y < 0 || x >= width) {
    return fallback
  }

  return values[y * width + x] ?? fallback
}

function ratioOf(left: number, right: number): number {
  const min = Math.max(0.0001, Math.min(left, right))
  const max = Math.max(left, right)

  return max / min
}
