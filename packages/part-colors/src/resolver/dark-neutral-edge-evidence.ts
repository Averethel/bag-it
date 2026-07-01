import type { PartColorSampleChip } from "../contracts"
import type { PartColorFeature } from "./types"

const BACKGROUND_RATIO_MAX = 0.16
const BACKGROUND_RATIO_MIN = 0.11
const EDGE_RATIO_MIN = 0.3
const LIGHT_NEUTRAL_COVERAGE_MAX = 0.08
const MID_NEUTRAL_COVERAGE_MIN = 0.38
const NEAR_BLACK_COVERAGE_MAX = 0.25
const PIXEL_COUNT_MAX = 260
const PIXEL_COUNT_MIN = 60

export interface DarkNeutralEdgeEvidence {
  backgroundRatio: number
  edgeRatio: number
  lightNeutralCoverage: number
  midNeutralCoverage: number
  nearBlackCoverage: number
  pixelCount: number
}

export function readDarkNeutralEdgeEvidence(
  feature: PartColorFeature,
  currentName: string,
): DarkNeutralEdgeEvidence | null {
  if (normalizeName(currentName) !== "black") {
    return null
  }

  const totalPixelCount = feature.sample.pixelCount + feature.sample.rejectedPixelCount
  const backgroundRatio = totalPixelCount > 0
    ? (feature.sample.rejectionCounts.background ?? 0) / totalPixelCount
    : 0
  const edgeRatio = totalPixelCount > 0
    ? (feature.sample.rejectionCounts.edge ?? 0) / totalPixelCount
    : 0
  const evidence = {
    backgroundRatio,
    edgeRatio,
    lightNeutralCoverage: sumCoverage(feature.sample.chips.filter(isLightNeutralChip)),
    midNeutralCoverage: sumCoverage(feature.sample.chips.filter(isMidNeutralChip)),
    nearBlackCoverage: sumCoverage(feature.sample.chips.filter(isNearBlackChip)),
    pixelCount: feature.sample.pixelCount,
  }

  return hasDarkNeutralEdgeEvidence(evidence) ? evidence : null
}

function hasDarkNeutralEdgeEvidence(evidence: DarkNeutralEdgeEvidence): boolean {
  return evidence.pixelCount >= PIXEL_COUNT_MIN &&
    evidence.pixelCount <= PIXEL_COUNT_MAX &&
    evidence.backgroundRatio >= BACKGROUND_RATIO_MIN &&
    evidence.backgroundRatio <= BACKGROUND_RATIO_MAX &&
    evidence.edgeRatio >= EDGE_RATIO_MIN &&
    evidence.midNeutralCoverage >= MID_NEUTRAL_COVERAGE_MIN &&
    evidence.lightNeutralCoverage <= LIGHT_NEUTRAL_COVERAGE_MAX &&
    evidence.nearBlackCoverage <= NEAR_BLACK_COVERAGE_MAX
}

function isLightNeutralChip(chip: PartColorSampleChip): boolean {
  return neutralChroma(chip.rgb) <= 12 && colorLuma(chip.rgb) >= 120
}

function isMidNeutralChip(chip: PartColorSampleChip): boolean {
  const luma = colorLuma(chip.rgb)

  return luma >= 70 && luma < 150 && neutralChroma(chip.rgb) <= 16
}

function isNearBlackChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) <= 36
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
