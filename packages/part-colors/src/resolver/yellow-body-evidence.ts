import { rgbToLch } from "../color-space"
import type { PartColorSampleChip } from "../contracts"
import type { PartColorFeature } from "./types"

const BACKGROUND_RATIO_MIN = 0.05
const DARK_COVERAGE_MAX = 0.6
const EDGE_RATIO_MIN = 0.25
const PIXEL_COUNT_MAX = 100
const TRANS_YELLOW_BACKGROUND_RATIO_MIN = 0.25
const TRANS_YELLOW_BRIGHT_YELLOW_COVERAGE_MAX = 0.22
const TRANS_YELLOW_DARK_COVERAGE_MIN = 0.25
const TRANS_YELLOW_PIXEL_COUNT_MAX = 40
const TRANS_YELLOW_SHADOW_YELLOW_COVERAGE_MAX = 0.65
const TRANS_YELLOW_SHADOW_YELLOW_COVERAGE_MIN = 0.25
const YELLOW_COVERAGE_MIN = 0.2

export interface YellowBodyEvidence {
  backgroundRatio: number
  brightYellowCoverage: number
  darkCoverage: number
  edgeRatio: number
  pixelCount: number
  shadowYellowCoverage: number
  sourceName: "Dark Bluish Gray" | "Dark Orange" | "Trans-Yellow"
  yellowCoverage: number
}

export function readYellowBodyEvidence(
  feature: PartColorFeature,
  currentName: string,
): YellowBodyEvidence | null {
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
  const evidence: YellowBodyEvidence = {
    backgroundRatio,
    brightYellowCoverage: sumCoverage(feature.sample.chips.filter(isBrightYellowChip)),
    darkCoverage: sumCoverage(feature.sample.chips.filter(isDarkChip)),
    edgeRatio,
    pixelCount: feature.sample.pixelCount,
    shadowYellowCoverage: sumCoverage(feature.sample.chips.filter(isShadowYellowChip)),
    sourceName,
    yellowCoverage: sumCoverage(feature.sample.chips.filter(isYellowChip)),
  }

  return hasYellowBodyEvidence(evidence) ? evidence : null
}

function hasYellowBodyEvidence(evidence: YellowBodyEvidence): boolean {
  if (evidence.sourceName === "Trans-Yellow") {
    return evidence.pixelCount <= TRANS_YELLOW_PIXEL_COUNT_MAX &&
      evidence.backgroundRatio >= TRANS_YELLOW_BACKGROUND_RATIO_MIN &&
      evidence.shadowYellowCoverage >= TRANS_YELLOW_SHADOW_YELLOW_COVERAGE_MIN &&
      evidence.shadowYellowCoverage <= TRANS_YELLOW_SHADOW_YELLOW_COVERAGE_MAX &&
      evidence.brightYellowCoverage <= TRANS_YELLOW_BRIGHT_YELLOW_COVERAGE_MAX &&
      evidence.darkCoverage >= TRANS_YELLOW_DARK_COVERAGE_MIN
  }

  return evidence.pixelCount <= PIXEL_COUNT_MAX &&
    evidence.backgroundRatio >= BACKGROUND_RATIO_MIN &&
    evidence.edgeRatio >= EDGE_RATIO_MIN &&
    evidence.yellowCoverage >= YELLOW_COVERAGE_MIN &&
    evidence.darkCoverage <= DARK_COVERAGE_MAX
}

function readSourceName(currentName: string): YellowBodyEvidence["sourceName"] | null {
  switch (normalizeName(currentName)) {
    case "dark bluish gray":
      return "Dark Bluish Gray"
    case "dark orange":
      return "Dark Orange"
    case "trans-yellow":
      return "Trans-Yellow"
    default:
      return null
  }
}

function isYellowChip(chip: PartColorSampleChip): boolean {
  const { b, g, r } = chip.rgb

  return r >= 120 &&
    g >= 100 &&
    b <= 90 &&
    Math.abs(r - g) <= 80 &&
    r - b >= 50 &&
    g - b >= 45 &&
    colorSaturation(chip.rgb) >= 60
}

function isBrightYellowChip(chip: PartColorSampleChip): boolean {
  return isYellowChip(chip) && colorLuma(chip.rgb) >= 145
}

function isShadowYellowChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.h >= 78 &&
    lch.h <= 112 &&
    lch.c >= 18
}

function isDarkChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) <= 60
}

function colorSaturation(rgb: { b: number, g: number, r: number }): number {
  return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b)
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
