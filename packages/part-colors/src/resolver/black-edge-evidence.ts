import type { PartColorSampleChip } from "../contracts"
import type { PartColorFeature } from "./types"

const ACCEPTED_BRIGHT_NEUTRAL_COVERAGE_MAX = 0.18
const ACCEPTED_MID_NEUTRAL_COVERAGE_MIN = 0.45
const ACCEPTED_NEAR_BLACK_BRIGHT_NEUTRAL_COVERAGE_MAX = 0.22
const ACCEPTED_NEAR_BLACK_COVERAGE_MIN = 0.3
const ACCEPTED_NEAR_BLACK_EDGE_RATIO_MIN = 0.3
const ACCEPTED_NEAR_BLACK_DARK_EDGE_COVERAGE_MIN = 0.4
const ACCEPTED_NEAR_BLACK_EDGE_COVERAGE_MIN = 0.18
const DARK_EDGE_COVERAGE_MIN = 0.5
const EDGE_REJECTION_MIN = 38
const MAX_SAMPLE_PIXEL_COUNT = 180
const NEAR_BLACK_EDGE_COVERAGE_MIN = 0.25
const TINY_BLACK_ACCEPTED_NEAR_BLACK_COVERAGE_MIN = 0.06
const TINY_BLACK_DARK_EDGE_COVERAGE_MIN = 0.42
const TINY_BLACK_EDGE_RATIO_MIN = 0.54
const TINY_BLACK_PIXEL_COUNT_MAX = 35

const ELIGIBLE_SOURCE_NAMES = new Set([
  "light bluish gray",
])

export interface BlackEdgeEvidence {
  acceptedBrightNeutralCoverage: number
  acceptedMidNeutralCoverage: number
  acceptedNearBlackCoverage: number
  darkEdgeCoverage: number
  edgeRejectionCount: number
  edgeRatio: number
  nearBlackEdgeCoverage: number
  pixelCount: number
}

export function readBlackEdgeEvidence(
  feature: PartColorFeature,
  currentName: string,
): BlackEdgeEvidence | null {
  if (!ELIGIBLE_SOURCE_NAMES.has(normalizeName(currentName))) {
    return null
  }

  const edgeRejectionCount = feature.sample.rejectionCounts.edge ?? 0
  const pixelCount = feature.sample.pixelCount
  const totalPixelCount = pixelCount + feature.sample.rejectedPixelCount
  const edgeRatio = totalPixelCount > 0 ? edgeRejectionCount / totalPixelCount : 0
  const acceptedBrightNeutralCoverage = sumCoverage(feature.topChips.filter(isBrightNeutralChip))
  const acceptedMidNeutralCoverage = sumCoverage(feature.topChips.filter(isMidNeutralChip))
  const acceptedNearBlackCoverage = sumCoverage(feature.topChips.filter(isAcceptedNearBlackChip))
  const darkEdgeCoverage = sumCoverage((feature.sample.edgeChips ?? []).filter(isDarkEdgeChip))
  const nearBlackEdgeCoverage = sumCoverage((feature.sample.edgeChips ?? []).filter(isNearBlackEdgeChip))

  if (
    !hasEdgeEvidence({
      acceptedBrightNeutralCoverage,
      acceptedMidNeutralCoverage,
      acceptedNearBlackCoverage,
      darkEdgeCoverage,
      edgeRejectionCount,
      edgeRatio,
      nearBlackEdgeCoverage,
      pixelCount,
    })
  ) {
    return null
  }

  return {
    acceptedBrightNeutralCoverage,
    acceptedMidNeutralCoverage,
    acceptedNearBlackCoverage,
    darkEdgeCoverage,
    edgeRejectionCount,
    edgeRatio,
    nearBlackEdgeCoverage,
    pixelCount,
  }
}

function hasEdgeEvidence(evidence: BlackEdgeEvidence): boolean {
  if (
    evidence.edgeRejectionCount < EDGE_REJECTION_MIN ||
    evidence.pixelCount > MAX_SAMPLE_PIXEL_COUNT
  ) {
    return false
  }

  const hasNearBlackAcceptedEvidence =
    evidence.acceptedBrightNeutralCoverage <= ACCEPTED_NEAR_BLACK_BRIGHT_NEUTRAL_COVERAGE_MAX &&
    evidence.acceptedNearBlackCoverage >= ACCEPTED_NEAR_BLACK_COVERAGE_MIN &&
    evidence.edgeRatio >= ACCEPTED_NEAR_BLACK_EDGE_RATIO_MIN &&
    evidence.darkEdgeCoverage >= ACCEPTED_NEAR_BLACK_DARK_EDGE_COVERAGE_MIN &&
    evidence.nearBlackEdgeCoverage >= ACCEPTED_NEAR_BLACK_EDGE_COVERAGE_MIN

  if (hasNearBlackAcceptedEvidence) {
    return true
  }

  const hasTinyBlackEdgeEvidence =
    evidence.pixelCount <= TINY_BLACK_PIXEL_COUNT_MAX &&
    evidence.edgeRatio >= TINY_BLACK_EDGE_RATIO_MIN &&
    evidence.acceptedNearBlackCoverage >= TINY_BLACK_ACCEPTED_NEAR_BLACK_COVERAGE_MIN &&
    evidence.darkEdgeCoverage >= TINY_BLACK_DARK_EDGE_COVERAGE_MIN

  if (hasTinyBlackEdgeEvidence) {
    return true
  }

  return evidence.acceptedBrightNeutralCoverage <= ACCEPTED_BRIGHT_NEUTRAL_COVERAGE_MAX &&
    evidence.acceptedMidNeutralCoverage >= ACCEPTED_MID_NEUTRAL_COVERAGE_MIN &&
    evidence.darkEdgeCoverage >= DARK_EDGE_COVERAGE_MIN &&
    evidence.nearBlackEdgeCoverage >= NEAR_BLACK_EDGE_COVERAGE_MIN
}

function isBrightNeutralChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) >= 145 && neutralChroma(chip.rgb) <= 24
}

function isMidNeutralChip(chip: PartColorSampleChip): boolean {
  const luma = colorLuma(chip.rgb)

  return luma >= 48 && luma <= 150 && neutralChroma(chip.rgb) <= 28
}

function isAcceptedNearBlackChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) <= 55 && neutralChroma(chip.rgb) <= 34
}

function isDarkEdgeChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) <= 78 && neutralChroma(chip.rgb) <= 34
}

function isNearBlackEdgeChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) <= 38
}

function sumCoverage(chips: readonly PartColorSampleChip[]): number {
  return chips.reduce((total, chip) => total + chip.coverage, 0)
}

function colorLuma(rgb: { b: number, g: number, r: number }): number {
  return rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722
}

function neutralChroma(rgb: { b: number, g: number, r: number }): number {
  return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b)
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
