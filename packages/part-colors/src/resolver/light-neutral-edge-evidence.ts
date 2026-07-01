import type { PartColorSampleChip } from "../contracts"
import type { PartColorFeature } from "./types"

const DARK_NEUTRAL_COVERAGE_MAX = 0.3
const DOMINANT_COVERAGE_MAX = 0.5
const EDGE_REJECTION_MIN = 60
const TINY_EDGE_REJECTION_RATIO_MIN = 0.3
const EDGE_HEAVY_SAMPLE_PIXEL_COUNT_MAX = 90
const EDGE_HEAVY_LIGHT_NEUTRAL_EDGE_COVERAGE_MIN = 0.45
const EDGE_HEAVY_LIGHT_NEUTRAL_TOP_COVERAGE_MIN = 0.16
const EDGE_HEAVY_MEDIUM_NEUTRAL_TOP_COVERAGE_MIN = 0.45
const EDGE_HEAVY_DARK_NEUTRAL_COVERAGE_MAX = 0.32
const EDGE_HEAVY_NEAR_BLACK_COVERAGE_MAX = 0.02
const HIGH_EDGE_BACKGROUND_RATIO_MAX = 0.18
const HIGH_EDGE_DARK_NEUTRAL_COVERAGE_MAX = 0.55
const HIGH_EDGE_EDGE_RATIO_MIN = 0.58
const HIGH_EDGE_LIGHT_NEUTRAL_TOP_COVERAGE_MIN = 0.08
const HIGH_EDGE_MEDIUM_NEUTRAL_TOP_COVERAGE_MIN = 0.18
const HIGH_EDGE_NEAR_BLACK_COVERAGE_MAX = 0.02
const HIGH_EDGE_SAMPLE_PIXEL_COUNT_MAX = 65
const LIGHT_NEUTRAL_EDGE_COVERAGE_MIN = 0.5
const COOL_EDGE_BACKGROUND_RATIO_MAX = 0.15
const COOL_EDGE_DARK_NEUTRAL_COVERAGE_MAX = 0.35
const COOL_EDGE_EDGE_RATIO_MIN = 0.5
const COOL_EDGE_LIGHT_NEUTRAL_EDGE_COVERAGE_MIN = 0.1
const COOL_EDGE_LIGHT_NEUTRAL_TOP_COVERAGE_MIN = 0.08
const COOL_EDGE_MEDIUM_NEUTRAL_TOP_COVERAGE_MIN = 0.5
const COOL_EDGE_NEAR_BLACK_COVERAGE_MAX = 0.1
const COOL_EDGE_SAMPLE_PIXEL_COUNT_MAX = 120
const COOL_EDGE_TOP_COVERAGE_MIN = 0.5
const TINY_LIGHT_NEUTRAL_EDGE_COVERAGE_MIN = 0.48
const LIGHT_NEUTRAL_TOP_COVERAGE_MIN = 0.08
const TINY_LIGHT_NEUTRAL_TOP_COVERAGE_MIN = 0.06
const MEDIUM_NEUTRAL_TOP_COVERAGE_MIN = 0.5
const NEAR_BLACK_COVERAGE_MAX = 0.1
const REGULAR_SAMPLE_PIXEL_COUNT_MAX = 90
const SAMPLE_PIXEL_COUNT_MAX = 60
const TINY_SAMPLE_PIXEL_COUNT_MAX = 50
const ABSOLUTE_SAMPLE_PIXEL_COUNT_MAX = Math.max(
  SAMPLE_PIXEL_COUNT_MAX,
  EDGE_HEAVY_SAMPLE_PIXEL_COUNT_MAX,
  HIGH_EDGE_SAMPLE_PIXEL_COUNT_MAX,
  COOL_EDGE_SAMPLE_PIXEL_COUNT_MAX,
)

export interface LightNeutralEdgeEvidence {
  backgroundRatio: number
  coolNeutralTopCoverage: number
  darkNeutralCoverage: number
  dominantCoverage: number
  edgeRejectionCount: number
  lightNeutralEdgeCoverage: number
  lightNeutralTopCoverage: number
  mediumNeutralTopCoverage: number
  nearBlackCoverage: number
  pixelCount: number
}

export function readLightNeutralEdgeEvidence(
  feature: PartColorFeature,
  currentName: string,
): LightNeutralEdgeEvidence | null {
  if (normalizeName(currentName) !== "dark bluish gray") {
    return null
  }

  const lightNeutralEdgeCoverage = sumCoverage(
    (feature.sample.edgeChips ?? []).filter(isLightBluishGrayChip),
  )
  const sampleChips = feature.sample.chips
  const lightNeutralTopCoverage = sumCoverage(sampleChips.filter(isLightBluishGrayChip))
  const mediumNeutralTopCoverage = sumCoverage(sampleChips.filter(isMediumNeutralChip))
  const coolNeutralTopCoverage = sumCoverage(sampleChips.filter(isCoolNeutralChip))
  const darkNeutralCoverage = sumCoverage(sampleChips.filter(isDarkNeutralChip))
  const nearBlackCoverage = sumCoverage(sampleChips.filter(isNearBlackChip))
  const edgeRejectionCount = feature.sample.rejectionCounts.edge ?? 0
  const totalPixelCount = feature.sample.pixelCount + feature.sample.rejectedPixelCount
  const edgeRatio = totalPixelCount > 0 ? edgeRejectionCount / totalPixelCount : 0
  const backgroundRatio = totalPixelCount > 0
    ? (feature.sample.rejectionCounts.background ?? 0) / totalPixelCount
    : 0
  const dominantCoverage = feature.sample.dominantCoverage
  const pixelCount = feature.sample.pixelCount

  if (
    !hasLightNeutralEdgeEvidence({
      backgroundRatio,
      coolNeutralTopCoverage,
      darkNeutralCoverage,
      dominantCoverage,
      edgeRatio,
      edgeRejectionCount,
      lightNeutralEdgeCoverage,
      lightNeutralTopCoverage,
      mediumNeutralTopCoverage,
      nearBlackCoverage,
      pixelCount,
    })
  ) {
    return null
  }

  return {
    backgroundRatio,
    coolNeutralTopCoverage,
    darkNeutralCoverage,
    dominantCoverage,
    edgeRejectionCount,
    lightNeutralEdgeCoverage,
    lightNeutralTopCoverage,
    mediumNeutralTopCoverage,
    nearBlackCoverage,
    pixelCount,
  }
}

function hasLightNeutralEdgeEvidence(evidence: LightNeutralEdgeEvidence & { edgeRatio: number }): boolean {
  if (evidence.dominantCoverage > DOMINANT_COVERAGE_MAX ||
    evidence.pixelCount > ABSOLUTE_SAMPLE_PIXEL_COUNT_MAX) {
    return false
  }

  const hasRegularEvidence =
    evidence.pixelCount <= REGULAR_SAMPLE_PIXEL_COUNT_MAX &&
    evidence.mediumNeutralTopCoverage >= MEDIUM_NEUTRAL_TOP_COVERAGE_MIN &&
    evidence.darkNeutralCoverage <= DARK_NEUTRAL_COVERAGE_MAX &&
    evidence.nearBlackCoverage <= NEAR_BLACK_COVERAGE_MAX &&
    evidence.lightNeutralEdgeCoverage >= LIGHT_NEUTRAL_EDGE_COVERAGE_MIN &&
    evidence.lightNeutralTopCoverage >= LIGHT_NEUTRAL_TOP_COVERAGE_MIN &&
    evidence.edgeRejectionCount >= EDGE_REJECTION_MIN

  if (hasRegularEvidence) {
    return true
  }

  const hasEdgeHeavyEvidence =
    evidence.pixelCount <= EDGE_HEAVY_SAMPLE_PIXEL_COUNT_MAX &&
    evidence.edgeRatio >= TINY_EDGE_REJECTION_RATIO_MIN &&
    evidence.lightNeutralEdgeCoverage >= EDGE_HEAVY_LIGHT_NEUTRAL_EDGE_COVERAGE_MIN &&
    evidence.lightNeutralTopCoverage >= EDGE_HEAVY_LIGHT_NEUTRAL_TOP_COVERAGE_MIN &&
    evidence.mediumNeutralTopCoverage >= EDGE_HEAVY_MEDIUM_NEUTRAL_TOP_COVERAGE_MIN &&
    evidence.darkNeutralCoverage <= EDGE_HEAVY_DARK_NEUTRAL_COVERAGE_MAX &&
    evidence.nearBlackCoverage <= EDGE_HEAVY_NEAR_BLACK_COVERAGE_MAX

  if (hasEdgeHeavyEvidence) {
    return true
  }

  const hasHighEdgeTopChipEvidence =
    evidence.pixelCount <= HIGH_EDGE_SAMPLE_PIXEL_COUNT_MAX &&
    evidence.backgroundRatio <= HIGH_EDGE_BACKGROUND_RATIO_MAX &&
    evidence.edgeRatio >= HIGH_EDGE_EDGE_RATIO_MIN &&
    evidence.lightNeutralTopCoverage >= HIGH_EDGE_LIGHT_NEUTRAL_TOP_COVERAGE_MIN &&
    evidence.mediumNeutralTopCoverage >= HIGH_EDGE_MEDIUM_NEUTRAL_TOP_COVERAGE_MIN &&
    evidence.darkNeutralCoverage <= HIGH_EDGE_DARK_NEUTRAL_COVERAGE_MAX &&
    evidence.nearBlackCoverage <= HIGH_EDGE_NEAR_BLACK_COVERAGE_MAX

  if (hasHighEdgeTopChipEvidence) {
    return true
  }

  const hasCoolEdgeBodyEvidence =
    evidence.pixelCount <= COOL_EDGE_SAMPLE_PIXEL_COUNT_MAX &&
    evidence.backgroundRatio <= COOL_EDGE_BACKGROUND_RATIO_MAX &&
    evidence.edgeRatio >= COOL_EDGE_EDGE_RATIO_MIN &&
    evidence.lightNeutralEdgeCoverage >= COOL_EDGE_LIGHT_NEUTRAL_EDGE_COVERAGE_MIN &&
    evidence.lightNeutralTopCoverage >= COOL_EDGE_LIGHT_NEUTRAL_TOP_COVERAGE_MIN &&
    evidence.mediumNeutralTopCoverage >= COOL_EDGE_MEDIUM_NEUTRAL_TOP_COVERAGE_MIN &&
    evidence.coolNeutralTopCoverage >= COOL_EDGE_TOP_COVERAGE_MIN &&
    evidence.darkNeutralCoverage <= COOL_EDGE_DARK_NEUTRAL_COVERAGE_MAX &&
    evidence.nearBlackCoverage <= COOL_EDGE_NEAR_BLACK_COVERAGE_MAX

  if (hasCoolEdgeBodyEvidence) {
    return true
  }

  return evidence.pixelCount <= TINY_SAMPLE_PIXEL_COUNT_MAX &&
    evidence.mediumNeutralTopCoverage >= MEDIUM_NEUTRAL_TOP_COVERAGE_MIN &&
    evidence.darkNeutralCoverage <= DARK_NEUTRAL_COVERAGE_MAX &&
    evidence.nearBlackCoverage <= NEAR_BLACK_COVERAGE_MAX &&
    evidence.edgeRatio >= TINY_EDGE_REJECTION_RATIO_MIN &&
    evidence.lightNeutralEdgeCoverage >= TINY_LIGHT_NEUTRAL_EDGE_COVERAGE_MIN &&
    evidence.lightNeutralTopCoverage >= TINY_LIGHT_NEUTRAL_TOP_COVERAGE_MIN
}

function isLightBluishGrayChip(chip: PartColorSampleChip): boolean {
  const luma = colorLuma(chip.rgb)

  return luma >= 130 &&
    luma <= 190 &&
    neutralChroma(chip.rgb) <= 22 &&
    chip.rgb.b >= chip.rgb.r - 8
}

function isMediumNeutralChip(chip: PartColorSampleChip): boolean {
  const luma = colorLuma(chip.rgb)

  return luma >= 72 &&
    luma <= 145 &&
    neutralChroma(chip.rgb) <= 22
}

function isDarkNeutralChip(chip: PartColorSampleChip): boolean {
  const luma = colorLuma(chip.rgb)

  return luma >= 36 &&
    luma < 72 &&
    neutralChroma(chip.rgb) <= 22
}

function isCoolNeutralChip(chip: PartColorSampleChip): boolean {
  const luma = colorLuma(chip.rgb)

  return luma >= 72 &&
    luma <= 190 &&
    neutralChroma(chip.rgb) <= 30 &&
    chip.rgb.b >= chip.rgb.r + 2
}

function isNearBlackChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) < 36
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
