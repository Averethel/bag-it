import type { PartColorSampleChip } from "../contracts"
import type { PartColorFeature } from "./types"

const BACKGROUND_RATIO_MAX = 0.18
const DARK_EDGE_COVERAGE_MIN = 0.35
const DARK_NEUTRAL_COVERAGE_MIN = 0.64
const DARK_NEUTRAL_LOW_BLACK_COVERAGE_MIN = 0.55
const DARK_NEUTRAL_LOW_BLACK_EDGE_COVERAGE_MIN = 0.5
const DARK_NEUTRAL_LOW_BLACK_PIXEL_COUNT_MAX = 120
const DARK_NEUTRAL_LOW_BLACK_NEAR_BLACK_COVERAGE_MAX = 0.1
const EDGE_RATIO_MIN = 0.45
const LIGHT_NEUTRAL_COVERAGE_MAX = 0.02
const NEAR_BLACK_COVERAGE_MIN = 0.25
const PIXEL_COUNT_MAX = 90

export interface DarkNeutralBodyEvidence {
  backgroundRatio: number
  darkEdgeCoverage: number
  darkNeutralCoverage: number
  edgeRatio: number
  lightNeutralCoverage: number
  nearBlackCoverage: number
  pixelCount: number
}

export function readDarkNeutralBodyEvidence(
  feature: PartColorFeature,
  currentName: string,
): DarkNeutralBodyEvidence | null {
  if (normalizeName(currentName) !== "light bluish gray") {
    return null
  }

  const totalPixelCount = feature.sample.pixelCount + feature.sample.rejectedPixelCount
  const backgroundRatio = totalPixelCount > 0
    ? (feature.sample.rejectionCounts.background ?? 0) / totalPixelCount
    : 0
  const edgeRatio = totalPixelCount > 0
    ? (feature.sample.rejectionCounts.edge ?? 0) / totalPixelCount
    : 0
  const darkEdgeCoverage = sumCoverage((feature.sample.edgeChips ?? []).filter(isDarkNeutralEdgeChip))
  const darkNeutralCoverage = sumCoverage(feature.sample.chips.filter(isDarkNeutralChip))
  const lightNeutralCoverage = sumCoverage(feature.sample.chips.filter(isLightNeutralChip))
  const nearBlackCoverage = sumCoverage(feature.sample.chips.filter(isNearBlackChip))
  const evidence = {
    backgroundRatio,
    darkEdgeCoverage,
    darkNeutralCoverage,
    edgeRatio,
    lightNeutralCoverage,
    nearBlackCoverage,
    pixelCount: feature.sample.pixelCount,
  }

  return hasDarkNeutralBodyEvidence(evidence) ? evidence : null
}

function hasDarkNeutralBodyEvidence(evidence: DarkNeutralBodyEvidence): boolean {
  const hasNearBlackBodyEvidence = evidence.pixelCount <= PIXEL_COUNT_MAX &&
    evidence.backgroundRatio <= BACKGROUND_RATIO_MAX &&
    evidence.edgeRatio >= EDGE_RATIO_MIN &&
    evidence.darkNeutralCoverage >= DARK_NEUTRAL_COVERAGE_MIN &&
    evidence.nearBlackCoverage >= NEAR_BLACK_COVERAGE_MIN &&
    evidence.lightNeutralCoverage <= LIGHT_NEUTRAL_COVERAGE_MAX &&
    evidence.darkEdgeCoverage >= DARK_EDGE_COVERAGE_MIN

  if (hasNearBlackBodyEvidence) {
    return true
  }

  return evidence.pixelCount <= DARK_NEUTRAL_LOW_BLACK_PIXEL_COUNT_MAX &&
    evidence.backgroundRatio <= BACKGROUND_RATIO_MAX &&
    evidence.edgeRatio >= EDGE_RATIO_MIN &&
    evidence.darkNeutralCoverage >= DARK_NEUTRAL_LOW_BLACK_COVERAGE_MIN &&
    evidence.nearBlackCoverage <= DARK_NEUTRAL_LOW_BLACK_NEAR_BLACK_COVERAGE_MAX &&
    evidence.lightNeutralCoverage <= LIGHT_NEUTRAL_COVERAGE_MAX &&
    evidence.darkEdgeCoverage >= DARK_NEUTRAL_LOW_BLACK_EDGE_COVERAGE_MIN
}

function isDarkNeutralChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) <= 72 && neutralChroma(chip.rgb) <= 22
}

function isLightNeutralChip(chip: PartColorSampleChip): boolean {
  const luma = colorLuma(chip.rgb)

  return luma >= 130 &&
    luma <= 190 &&
    neutralChroma(chip.rgb) <= 28 &&
    chip.rgb.b >= chip.rgb.r - 8
}

function isNearBlackChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) < 36
}

function isDarkNeutralEdgeChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) <= 78 && neutralChroma(chip.rgb) <= 34
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
