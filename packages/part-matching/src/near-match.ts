import type { PartVisualFeatures } from "./contracts"

const ASPECT_RATIO_MAX = 1.12
const AMBIGUOUS_DETAIL_ALPHA_MAX = 4.2
const AMBIGUOUS_DETAIL_COVERAGE_MIN = 0.0095
const AMBIGUOUS_DETAIL_EDGE_MAX = 7
const AMBIGUOUS_DETAIL_LUMA_MAX = 5.4
const AMBIGUOUS_DETAIL_LUMA_MIN = 4.7
const AMBIGUOUS_DETAIL_PROFILE_MAX = 0.02
const AMBIGUOUS_DETAIL_PROJECTION_MAX = 0.0145
const AREA_RATIO_MAX = 4
const CENTER_DISTANCE_MAX = 0.095
const COVERAGE_DELTA_MAX = 0.085
const EDGE_ALPHA_DISTANCE_MAX = 40.5
const HIGH_LUMA_DETAIL_ALPHA_MAX = 6.2
const HIGH_LUMA_DETAIL_AREA_RATIO_MIN = 1.08
const HIGH_LUMA_DETAIL_COVERAGE_MAX = 0.01
const HIGH_LUMA_DETAIL_COVERAGE_MIN = 0.006
const HIGH_LUMA_DETAIL_EDGE_MAX = 11
const HIGH_LUMA_DETAIL_LUMA_MAX = 9
const HIGH_LUMA_DETAIL_LUMA_MIN = 8.2
const HIGH_LUMA_DETAIL_PROFILE_MAX = 0.015
const HIGH_LUMA_DETAIL_PROJECTION_MAX = 0.023
const LOWER_PROFILE_DISTANCE_MAX = 0.17
const LUMA_GRID_DISTANCE_MAX = 8.8
const MIN_NEAR_CONFIDENCE_WITH_LUMA = 0.86
const MIN_NEAR_CONFIDENCE_WITHOUT_LUMA = 0.79
const NORMALIZED_ALPHA_DISTANCE_MAX = 32
const PROJECTION_DISTANCE_MAX = 0.1
const SIDE_PROFILE_DISTANCE_MAX = 0.16
const TIGHT_LUMA_COVERAGE_MAX = 0.025
const TIGHT_LUMA_EDGE_MAX = 16
const TIGHT_LUMA_GRID_DISTANCE_MAX = 8.9
const TIGHT_LUMA_MIN_CONFIDENCE = 0.76
const TIGHT_LUMA_NORMALIZED_ALPHA_MAX = 8
const TIGHT_LUMA_PROFILE_MAX = 0.1
const TIGHT_LUMA_PROJECTION_MAX = 0.025
const TOP_PROFILE_DISTANCE_MAX = 0.15
const TINY_COVERAGE_ALPHA_MAX = 12
const TINY_COVERAGE_ASPECT_RATIO_MAX = 1.1
const TINY_COVERAGE_DELTA_MAX = 0.004
const TINY_COVERAGE_EDGE_MAX = 22
const TINY_COVERAGE_LUMA_MAX = 7.82
const TINY_COVERAGE_MIN_CONFIDENCE = 0.65
const TINY_COVERAGE_PROFILE_MAX = 0.075
const TINY_COVERAGE_PROJECTION_MAX = 0.045
const VERY_TIGHT_LUMA_COVERAGE_MAX = 0.015
const VERY_TIGHT_LUMA_MIN_CONFIDENCE = 0.76
const VERY_TIGHT_LUMA_PROFILE_MAX = 0.075
const VERY_TIGHT_LUMA_PROJECTION_MAX = 0.02

export interface NearMatchResult {
  confidence: number
  matched: boolean
  reasons: string[]
}

export function compareNearFeatures(
  left: PartVisualFeatures,
  right: PartVisualFeatures,
): NearMatchResult {
  const checks = [
    aspectRatioCheck(left, right),
    areaRatioCheck(left, right),
    coverageCheck(left, right),
    centerCheck(left, right),
    alphaCheck(left, right),
    edgeCheck(left, right),
    lumaCheck(left, right),
    ambiguousSurfaceDetailCheck(left, right),
    projectionCheck(left, right),
    topProfileCheck(left, right),
    lowerProfileCheck(left, right),
    sideProfileCheck(left, right),
    structureCheck(left, right),
  ]
  const failed = checks.filter((check) => !check.ok)

  if (failed.length > 0) {
    return {
      confidence: 0,
      matched: false,
      reasons: failed.map((check) => check.reason),
    }
  }

  const penalty = checks.reduce((total, check) => total + check.penalty, 0)
  const confidence = Math.max(0, Math.min(0.98, 1 - penalty / checks.length))

  const minConfidence = confidenceMinimumFor(left, right)

  if (confidence < minConfidence) {
    return {
      confidence,
      matched: false,
      reasons: ["combined visual distance too high"],
    }
  }

  return {
    confidence,
    matched: true,
    reasons: ["label-gated visual features match"],
  }
}

function hasLumaDetail(left: PartVisualFeatures, right: PartVisualFeatures): boolean {
  return Boolean(left.lumaGrid && right.lumaGrid)
}

function confidenceMinimumFor(left: PartVisualFeatures, right: PartVisualFeatures): number {
  if (!hasLumaDetail(left, right)) {
    return MIN_NEAR_CONFIDENCE_WITHOUT_LUMA
  }

  if (veryTightLumaGeometryMatch(left, right)) {
    return VERY_TIGHT_LUMA_MIN_CONFIDENCE
  }

  if (tinyCoverageDetailMatch(left, right)) {
    return TINY_COVERAGE_MIN_CONFIDENCE
  }

  if (tightLumaGeometryMatch(left, right)) {
    return TIGHT_LUMA_MIN_CONFIDENCE
  }

  return MIN_NEAR_CONFIDENCE_WITH_LUMA
}

interface FeatureCheck {
  ok: boolean
  penalty: number
  reason: string
}

function aspectRatioCheck(left: PartVisualFeatures, right: PartVisualFeatures): FeatureCheck {
  const ratio = ratioOf(left.aspectRatio, right.aspectRatio)

  return {
    ok: ratio <= ASPECT_RATIO_MAX,
    penalty: Math.min(1, (ratio - 1) / (ASPECT_RATIO_MAX - 1)),
    reason: "aspect ratio differs",
  }
}

function areaRatioCheck(left: PartVisualFeatures, right: PartVisualFeatures): FeatureCheck {
  const ratio = ratioOf(left.area, right.area)

  return {
    ok: ratio <= AREA_RATIO_MAX,
    penalty: Math.min(1, (ratio - 1) / (AREA_RATIO_MAX - 1)),
    reason: "scale ratio too large",
  }
}

function coverageCheck(left: PartVisualFeatures, right: PartVisualFeatures): FeatureCheck {
  const delta = Math.abs(left.opaqueCoverage - right.opaqueCoverage)

  return {
    ok: delta <= COVERAGE_DELTA_MAX,
    penalty: delta / COVERAGE_DELTA_MAX,
    reason: "opaque coverage differs",
  }
}

function centerCheck(left: PartVisualFeatures, right: PartVisualFeatures): FeatureCheck {
  const distance = Math.hypot(left.centerX - right.centerX, left.centerY - right.centerY)

  return {
    ok: distance <= CENTER_DISTANCE_MAX,
    penalty: distance / CENTER_DISTANCE_MAX,
    reason: "visual center differs",
  }
}

function alphaCheck(left: PartVisualFeatures, right: PartVisualFeatures): FeatureCheck {
  const distance = meanAbsoluteDifference(left.normalizedAlpha, right.normalizedAlpha)

  return {
    ok: distance <= NORMALIZED_ALPHA_DISTANCE_MAX,
    penalty: distance / NORMALIZED_ALPHA_DISTANCE_MAX,
    reason: "normalized alpha differs",
  }
}

function edgeCheck(left: PartVisualFeatures, right: PartVisualFeatures): FeatureCheck {
  const distance = meanAbsoluteDifference(left.edgeAlpha, right.edgeAlpha)

  return {
    ok: distance <= EDGE_ALPHA_DISTANCE_MAX,
    penalty: distance / EDGE_ALPHA_DISTANCE_MAX,
    reason: "edge signature differs",
  }
}

function lumaCheck(left: PartVisualFeatures, right: PartVisualFeatures): FeatureCheck {
  if (!left.lumaGrid || !right.lumaGrid) {
    return {
      ok: true,
      penalty: 0,
      reason: "luma detail unavailable",
    }
  }

  const distance = meanAbsoluteDifference(left.lumaGrid, right.lumaGrid)
  const maxDistance = lumaGridDistanceMaxFor(left, right)

  return {
    ok: distance <= maxDistance,
    penalty: distance / maxDistance,
    reason: "luma detail differs",
  }
}

function ambiguousSurfaceDetailCheck(left: PartVisualFeatures, right: PartVisualFeatures): FeatureCheck {
  if (!left.lumaGrid || !right.lumaGrid) {
    return {
      ok: true,
      penalty: 0,
      reason: "rendered detail unavailable",
    }
  }

  const alphaDistance = meanAbsoluteDifference(left.normalizedAlpha, right.normalizedAlpha)
  const edgeDistance = meanAbsoluteDifference(left.edgeAlpha, right.edgeAlpha)
  const lumaDistance = meanAbsoluteDifference(left.lumaGrid, right.lumaGrid)
  const projectionDistance = projectionDistanceBetween(left, right)
  const profileDistance = profileDistanceBetween(left, right)
  const coverageDelta = Math.abs(left.opaqueCoverage - right.opaqueCoverage)
  const lowLumaAmbiguous = alphaDistance <= AMBIGUOUS_DETAIL_ALPHA_MAX &&
    edgeDistance <= AMBIGUOUS_DETAIL_EDGE_MAX &&
    projectionDistance <= AMBIGUOUS_DETAIL_PROJECTION_MAX &&
    profileDistance <= AMBIGUOUS_DETAIL_PROFILE_MAX &&
    coverageDelta >= AMBIGUOUS_DETAIL_COVERAGE_MIN &&
    lumaDistance >= AMBIGUOUS_DETAIL_LUMA_MIN &&
    lumaDistance <= AMBIGUOUS_DETAIL_LUMA_MAX
  const highLumaDetailConflict = alphaDistance <= HIGH_LUMA_DETAIL_ALPHA_MAX &&
    edgeDistance <= HIGH_LUMA_DETAIL_EDGE_MAX &&
    projectionDistance <= HIGH_LUMA_DETAIL_PROJECTION_MAX &&
    profileDistance <= HIGH_LUMA_DETAIL_PROFILE_MAX &&
    coverageDelta >= HIGH_LUMA_DETAIL_COVERAGE_MIN &&
    coverageDelta <= HIGH_LUMA_DETAIL_COVERAGE_MAX &&
    lumaDistance >= HIGH_LUMA_DETAIL_LUMA_MIN &&
    lumaDistance <= HIGH_LUMA_DETAIL_LUMA_MAX &&
    ratioOf(left.area, right.area) >= HIGH_LUMA_DETAIL_AREA_RATIO_MIN
  const ambiguous = lowLumaAmbiguous || highLumaDetailConflict

  return {
    ok: !ambiguous,
    penalty: ambiguous ? 1 : 0,
    reason: "ambiguous surface detail differs",
  }
}

function lumaGridDistanceMaxFor(left: PartVisualFeatures, right: PartVisualFeatures): number {
  return tightLumaGeometryMatch(left, right)
    ? TIGHT_LUMA_GRID_DISTANCE_MAX
    : LUMA_GRID_DISTANCE_MAX
}

function tightLumaGeometryMatch(left: PartVisualFeatures, right: PartVisualFeatures): boolean {
  const alphaDistance = meanAbsoluteDifference(left.normalizedAlpha, right.normalizedAlpha)
  const edgeDistance = meanAbsoluteDifference(left.edgeAlpha, right.edgeAlpha)
  const projectionDistance = projectionDistanceBetween(left, right)
  const profileDistance = profileDistanceBetween(left, right)
  const coverageDelta = Math.abs(left.opaqueCoverage - right.opaqueCoverage)

  return alphaDistance <= TIGHT_LUMA_NORMALIZED_ALPHA_MAX &&
    edgeDistance <= TIGHT_LUMA_EDGE_MAX &&
    projectionDistance <= TIGHT_LUMA_PROJECTION_MAX &&
    profileDistance <= TIGHT_LUMA_PROFILE_MAX &&
    coverageDelta <= TIGHT_LUMA_COVERAGE_MAX
}

function veryTightLumaGeometryMatch(left: PartVisualFeatures, right: PartVisualFeatures): boolean {
  const alphaDistance = meanAbsoluteDifference(left.normalizedAlpha, right.normalizedAlpha)
  const edgeDistance = meanAbsoluteDifference(left.edgeAlpha, right.edgeAlpha)
  const projectionDistance = projectionDistanceBetween(left, right)
  const profileDistance = profileDistanceBetween(left, right)
  const coverageDelta = Math.abs(left.opaqueCoverage - right.opaqueCoverage)

  return alphaDistance <= TIGHT_LUMA_NORMALIZED_ALPHA_MAX &&
    edgeDistance <= TIGHT_LUMA_EDGE_MAX &&
    projectionDistance <= VERY_TIGHT_LUMA_PROJECTION_MAX &&
    profileDistance <= VERY_TIGHT_LUMA_PROFILE_MAX &&
    coverageDelta <= VERY_TIGHT_LUMA_COVERAGE_MAX
}

function tinyCoverageDetailMatch(left: PartVisualFeatures, right: PartVisualFeatures): boolean {
  if (!left.lumaGrid || !right.lumaGrid) {
    return false
  }

  const alphaDistance = meanAbsoluteDifference(left.normalizedAlpha, right.normalizedAlpha)
  const edgeDistance = meanAbsoluteDifference(left.edgeAlpha, right.edgeAlpha)
  const lumaDistance = meanAbsoluteDifference(left.lumaGrid, right.lumaGrid)
  const projectionDistance = projectionDistanceBetween(left, right)
  const profileDistance = profileDistanceBetween(left, right)
  const coverageDelta = Math.abs(left.opaqueCoverage - right.opaqueCoverage)

  return coverageDelta <= TINY_COVERAGE_DELTA_MAX &&
    lumaDistance <= TINY_COVERAGE_LUMA_MAX &&
    alphaDistance <= TINY_COVERAGE_ALPHA_MAX &&
    edgeDistance <= TINY_COVERAGE_EDGE_MAX &&
    projectionDistance <= TINY_COVERAGE_PROJECTION_MAX &&
    profileDistance <= TINY_COVERAGE_PROFILE_MAX &&
    ratioOf(left.aspectRatio, right.aspectRatio) <= TINY_COVERAGE_ASPECT_RATIO_MAX
}

function projectionCheck(left: PartVisualFeatures, right: PartVisualFeatures): FeatureCheck {
  const distance = projectionDistanceBetween(left, right)

  return {
    ok: distance <= PROJECTION_DISTANCE_MAX,
    penalty: distance / PROJECTION_DISTANCE_MAX,
    reason: "projection profile differs",
  }
}

function lowerProfileCheck(left: PartVisualFeatures, right: PartVisualFeatures): FeatureCheck {
  const distance = meanAbsoluteDifference(left.lowerProfile, right.lowerProfile)

  return {
    ok: distance <= LOWER_PROFILE_DISTANCE_MAX,
    penalty: distance / LOWER_PROFILE_DISTANCE_MAX,
    reason: "lower silhouette differs",
  }
}

function topProfileCheck(left: PartVisualFeatures, right: PartVisualFeatures): FeatureCheck {
  const distance = meanAbsoluteDifference(left.topProfile, right.topProfile)

  return {
    ok: distance <= TOP_PROFILE_DISTANCE_MAX,
    penalty: distance / TOP_PROFILE_DISTANCE_MAX,
    reason: "top silhouette differs",
  }
}

function sideProfileCheck(left: PartVisualFeatures, right: PartVisualFeatures): FeatureCheck {
  const distance = Math.max(
    meanAbsoluteDifference(left.leftProfile, right.leftProfile),
    meanAbsoluteDifference(left.rightProfile, right.rightProfile),
  )

  return {
    ok: distance <= SIDE_PROFILE_DISTANCE_MAX,
    penalty: distance / SIDE_PROFILE_DISTANCE_MAX,
    reason: "side silhouette differs",
  }
}

function projectionDistanceBetween(left: PartVisualFeatures, right: PartVisualFeatures): number {
  return Math.max(
    meanAbsoluteDifference(left.projectionX, right.projectionX),
    meanAbsoluteDifference(left.projectionY, right.projectionY),
  )
}

function profileDistanceBetween(left: PartVisualFeatures, right: PartVisualFeatures): number {
  return Math.max(
    meanAbsoluteDifference(left.topProfile, right.topProfile),
    meanAbsoluteDifference(left.lowerProfile, right.lowerProfile),
    meanAbsoluteDifference(left.leftProfile, right.leftProfile),
    meanAbsoluteDifference(left.rightProfile, right.rightProfile),
  )
}

function structureCheck(left: PartVisualFeatures, right: PartVisualFeatures): FeatureCheck {
  const peakOk = left.topPeakCount === right.topPeakCount ||
    (left.topPeakCount <= 1 && right.topPeakCount <= 1)
  const ok = peakOk

  return {
    ok,
    penalty: left.lowerSegmentCount === right.lowerSegmentCount ? 0 : 0.2,
    reason: "stud/detail structure differs",
  }
}

function ratioOf(left: number, right: number): number {
  const min = Math.max(0.0001, Math.min(left, right))
  const max = Math.max(left, right)

  return max / min
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
