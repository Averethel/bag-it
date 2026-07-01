import { rgbToLch } from "../color-space"
import type { PartColorSampleChip } from "../contracts"
import type { PartColorFeature } from "./types"

const BACKGROUND_RATIO_MIN = 0.12
const BRIGHT_YELLOW_COVERAGE_MIN = 0.75
const DARK_COVERAGE_MAX = 0.08
const EDGE_RATIO_MIN = 0.5
const ORANGE_COVERAGE_MAX = 0.02
const PIXEL_COUNT_MAX = 60
const TAN_BACKGROUND_RATIO_MIN = 0.18
const TAN_DARK_COVERAGE_MAX = 0.2
const TAN_EDGE_RATIO_MIN = 0.5
const TAN_PIXEL_COUNT_MAX = 70
const TAN_YELLOW_COVERAGE_MIN = 0.75
const TAN_YELLOW_EDGE_COVERAGE_MIN = 0.5
const YELLOW_COVERAGE_MIN = 0.75

export interface TransparentYellowEvidence {
  backgroundRatio: number
  brightYellowCoverage: number
  darkCoverage: number
  edgeRatio: number
  orangeCoverage: number
  pixelCount: number
  sourceName: "Tan" | "Yellow"
  yellowCoverage: number
  yellowEdgeCoverage: number
}

export function readTransparentYellowEvidence(
  feature: PartColorFeature,
  currentName: string,
): TransparentYellowEvidence | null {
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
  const evidence: TransparentYellowEvidence = {
    backgroundRatio,
    brightYellowCoverage: sumCoverage(feature.sample.chips.filter(isBrightYellowChip)),
    darkCoverage: sumCoverage(feature.sample.chips.filter(isDarkChip)),
    edgeRatio,
    orangeCoverage: sumCoverage(feature.sample.chips.filter(isOrangeChip)),
    pixelCount: feature.sample.pixelCount,
    sourceName,
    yellowCoverage: sumCoverage(feature.sample.chips.filter(isYellowChip)),
    yellowEdgeCoverage: sumCoverage((feature.sample.edgeChips ?? []).filter(isYellowChip)),
  }

  return hasTransparentYellowEvidence(evidence) ? evidence : null
}

function hasTransparentYellowEvidence(evidence: TransparentYellowEvidence): boolean {
  if (evidence.sourceName === "Tan") {
    return evidence.pixelCount <= TAN_PIXEL_COUNT_MAX &&
      evidence.backgroundRatio >= TAN_BACKGROUND_RATIO_MIN &&
      evidence.edgeRatio >= TAN_EDGE_RATIO_MIN &&
      evidence.yellowCoverage >= TAN_YELLOW_COVERAGE_MIN &&
      evidence.yellowEdgeCoverage >= TAN_YELLOW_EDGE_COVERAGE_MIN &&
      evidence.darkCoverage <= TAN_DARK_COVERAGE_MAX
  }

  return evidence.pixelCount <= PIXEL_COUNT_MAX &&
    evidence.backgroundRatio >= BACKGROUND_RATIO_MIN &&
    evidence.edgeRatio >= EDGE_RATIO_MIN &&
    evidence.yellowCoverage >= YELLOW_COVERAGE_MIN &&
    evidence.brightYellowCoverage >= BRIGHT_YELLOW_COVERAGE_MIN &&
    evidence.darkCoverage <= DARK_COVERAGE_MAX &&
    evidence.orangeCoverage <= ORANGE_COVERAGE_MAX
}

function readSourceName(currentName: string): TransparentYellowEvidence["sourceName"] | null {
  switch (normalizeName(currentName)) {
    case "tan":
      return "Tan"
    case "yellow":
      return "Yellow"
    default:
      return null
  }
}

function isYellowChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.h >= 80 &&
    lch.h <= 115 &&
    lch.c >= 18
}

function isBrightYellowChip(chip: PartColorSampleChip): boolean {
  return isYellowChip(chip) && rgbToLch(chip.rgb).l >= 55
}

function isOrangeChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.h >= 35 &&
    lch.h < 80 &&
    lch.c >= 18
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
