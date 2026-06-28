import type { PartColorSampleChip } from "../contracts"
import type { PartColorFeature } from "./types"

const BACKGROUND_RATIO_MAX = 0.2
const BACKGROUND_RATIO_MIN = 0.13
const BLUEISH_COVERAGE_MAX = 0.08
const DARK_NEUTRAL_COVERAGE_MIN = 0.29
const DOMINANT_COVERAGE_MIN = 0.38
const EDGE_RATIO_MIN = 0.6
const METAL_DARK_COVERAGE_MIN = 0.82
const PIXEL_COUNT_MIN = 50

export interface PearlDarkGrayMetalEvidence {
  backgroundRatio: number
  blueishCoverage: number
  darkNeutralCoverage: number
  dominantCoverage: number
  edgeRatio: number
  metalDarkCoverage: number
  pixelCount: number
}

export function readPearlDarkGrayMetalEvidence(
  feature: PartColorFeature,
  currentName: string,
): PearlDarkGrayMetalEvidence | null {
  if (normalizeName(currentName) !== "dark bluish gray") {
    return null
  }

  const totalPixelCount = feature.sample.pixelCount + feature.sample.rejectedPixelCount
  const safeTotalPixelCount = Math.max(1, totalPixelCount)
  const evidence = {
    backgroundRatio: (feature.sample.rejectionCounts.background ?? 0) / safeTotalPixelCount,
    blueishCoverage: sumCoverage(feature.sample.chips.filter(isBlueishNeutralChip)),
    darkNeutralCoverage: sumCoverage(feature.sample.chips.filter(isDarkNeutralChip)),
    dominantCoverage: feature.sample.dominantCoverage,
    edgeRatio: (feature.sample.rejectionCounts.edge ?? 0) / safeTotalPixelCount,
    metalDarkCoverage: sumCoverage(feature.sample.chips.filter(isPearlDarkGrayMetalChip)),
    pixelCount: feature.sample.pixelCount,
  }

  return hasPearlDarkGrayMetalEvidence(evidence) ? evidence : null
}

function hasPearlDarkGrayMetalEvidence(evidence: PearlDarkGrayMetalEvidence): boolean {
  return evidence.pixelCount >= PIXEL_COUNT_MIN &&
    evidence.backgroundRatio >= BACKGROUND_RATIO_MIN &&
    evidence.backgroundRatio <= BACKGROUND_RATIO_MAX &&
    evidence.edgeRatio >= EDGE_RATIO_MIN &&
    evidence.metalDarkCoverage >= METAL_DARK_COVERAGE_MIN &&
    evidence.darkNeutralCoverage >= DARK_NEUTRAL_COVERAGE_MIN &&
    evidence.blueishCoverage <= BLUEISH_COVERAGE_MAX &&
    evidence.dominantCoverage >= DOMINANT_COVERAGE_MIN
}

function isPearlDarkGrayMetalChip(chip: PartColorSampleChip): boolean {
  const luma = colorLuma(chip.rgb)

  return luma >= 32 &&
    luma <= 90 &&
    neutralChroma(chip.rgb) <= 8
}

function isDarkNeutralChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) <= 62 && neutralChroma(chip.rgb) <= 10
}

function isBlueishNeutralChip(chip: PartColorSampleChip): boolean {
  return chip.rgb.b >= chip.rgb.r + 6 && neutralChroma(chip.rgb) <= 24
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
