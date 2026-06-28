import { rgbToLch } from "../color-space"
import type { PartColorSampleChip } from "../contracts"
import type { PartColorFeature } from "./types"

const DARK_GREEN_BACKGROUND_RATIO_MIN = 0.12
const DARK_GREEN_DARK_COVERAGE_MAX = 0.35
const DARK_GREEN_EDGE_RATIO_MIN = 0.5
const DARK_GREEN_GREEN_COVERAGE_MIN = 0.9
const DARK_GREEN_GREEN_EDGE_COVERAGE_MIN = 0.4
const DARK_GREEN_LIGHT_GREEN_COVERAGE_MAX = 0.35
const DARK_GREEN_PIXEL_COUNT_MAX = 45
const GREEN_BACKGROUND_RATIO_MIN = 0.12
const GREEN_EDGE_RATIO_MIN = 0.58
const GREEN_GREEN_COVERAGE_MIN = 0.65
const GREEN_LIGHT_GREEN_COVERAGE_MAX = 0.2
const GREEN_PIXEL_COUNT_MAX = 45

export interface TransparentGreenEvidence {
  backgroundRatio: number
  darkCoverage: number
  edgeRatio: number
  greenCoverage: number
  greenEdgeCoverage: number
  lightGreenCoverage: number
  pixelCount: number
  sourceName: "Dark Green" | "Green"
}

export function readTransparentGreenEvidence(
  feature: PartColorFeature,
  currentName: string,
): TransparentGreenEvidence | null {
  const sourceName = readSourceName(currentName)

  if (!sourceName) {
    return null
  }

  const rejectedPixelCount = feature.sample.rejectedPixelCount
  const totalPixelCount = feature.sample.pixelCount + rejectedPixelCount
  const backgroundRatio = totalPixelCount > 0
    ? feature.sample.rejectionCounts.background / totalPixelCount
    : 0
  const edgeRatio = totalPixelCount > 0
    ? (feature.sample.rejectionCounts.edge ?? 0) / totalPixelCount
    : 0
  const evidence: TransparentGreenEvidence = {
    backgroundRatio,
    darkCoverage: sumCoverage(feature.sample.chips.filter(isDarkChip)),
    edgeRatio,
    greenCoverage: sumCoverage(feature.sample.chips.filter(isGreenChip)),
    greenEdgeCoverage: sumCoverage((feature.sample.edgeChips ?? []).filter(isGreenChip)),
    lightGreenCoverage: sumCoverage(feature.sample.chips.filter(isLightGreenChip)),
    pixelCount: feature.sample.pixelCount,
    sourceName,
  }

  return hasTransparentGreenEvidence(evidence) ? evidence : null
}

function hasTransparentGreenEvidence(evidence: TransparentGreenEvidence): boolean {
  if (evidence.sourceName === "Green") {
    return evidence.pixelCount <= GREEN_PIXEL_COUNT_MAX &&
      evidence.backgroundRatio >= GREEN_BACKGROUND_RATIO_MIN &&
      evidence.edgeRatio >= GREEN_EDGE_RATIO_MIN &&
      evidence.greenCoverage >= GREEN_GREEN_COVERAGE_MIN &&
      evidence.lightGreenCoverage <= GREEN_LIGHT_GREEN_COVERAGE_MAX
  }

  return evidence.pixelCount <= DARK_GREEN_PIXEL_COUNT_MAX &&
    evidence.backgroundRatio >= DARK_GREEN_BACKGROUND_RATIO_MIN &&
    evidence.edgeRatio >= DARK_GREEN_EDGE_RATIO_MIN &&
    evidence.greenCoverage >= DARK_GREEN_GREEN_COVERAGE_MIN &&
    evidence.greenEdgeCoverage >= DARK_GREEN_GREEN_EDGE_COVERAGE_MIN &&
    evidence.lightGreenCoverage <= DARK_GREEN_LIGHT_GREEN_COVERAGE_MAX &&
    evidence.darkCoverage <= DARK_GREEN_DARK_COVERAGE_MAX
}

function readSourceName(currentName: string): TransparentGreenEvidence["sourceName"] | null {
  switch (normalizeName(currentName)) {
    case "dark green":
      return "Dark Green"
    case "green":
      return "Green"
    default:
      return null
  }
}

function isGreenChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.h >= 125 &&
    lch.h <= 170 &&
    lch.c >= 10
}

function isLightGreenChip(chip: PartColorSampleChip): boolean {
  return isGreenChip(chip) && rgbToLch(chip.rgb).l >= 45
}

function isDarkChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) <= 55
}

function colorLuma(rgb: { b: number, g: number, r: number }): number {
  return rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722
}

function sumCoverage(chips: readonly PartColorSampleChip[]): number {
  return chips.reduce((total, chip) => total + chip.coverage, 0)
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
