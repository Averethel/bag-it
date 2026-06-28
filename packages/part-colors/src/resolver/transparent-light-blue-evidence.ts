import type { PartColorSampleChip } from "../contracts"
import type { PartColorFeature } from "./types"

const BLACK_BACKGROUND_RATIO_MIN = 0.35
const BLACK_CYAN_GLASS_COVERAGE_MIN = 0.06
const BLACK_DARK_COVERAGE_MAX = 0.85
const BLACK_DARK_COVERAGE_MIN = 0.6
const BLACK_EDGE_RATIO_MIN = 0.25
const BLACK_PIXEL_COUNT_MAX = 60
const DARK_BLUISH_GRAY_BACKGROUND_RATIO_MIN = 0.4
const DARK_BLUISH_GRAY_CYAN_GLASS_COVERAGE_MIN = 0.72
const DARK_BLUISH_GRAY_DARK_COVERAGE_MAX = 0.22
const DARK_BLUISH_GRAY_EDGE_RATIO_MIN = 0.35
const DARK_BLUISH_GRAY_PIXEL_COUNT_MAX = 35
const LIGHT_BLUISH_GRAY_BACKGROUND_RATIO_MIN = 0.65
const LIGHT_BLUISH_GRAY_CYAN_GLASS_COVERAGE_MIN = 0.7
const LIGHT_BLUISH_GRAY_DARK_COVERAGE_MAX = 0.4
const LIGHT_BLUISH_GRAY_EDGE_RATIO_MIN = 0.22
const LIGHT_BLUISH_GRAY_PIXEL_COUNT_MAX = 80

export interface TransparentLightBlueEvidence {
  backgroundRatio: number
  cyanGlassCoverage: number
  darkCoverage: number
  edgeRatio: number
  pixelCount: number
  sourceName: "Black" | "Dark Bluish Gray" | "Light Bluish Gray"
}

export function readTransparentLightBlueEvidence(
  feature: PartColorFeature,
  currentName: string,
): TransparentLightBlueEvidence | null {
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
  const evidence: TransparentLightBlueEvidence = {
    backgroundRatio,
    cyanGlassCoverage: sumCoverage(feature.sample.chips.filter(isCyanGlassChip)),
    darkCoverage: sumCoverage(feature.sample.chips.filter(isDarkChip)),
    edgeRatio,
    pixelCount: feature.sample.pixelCount,
    sourceName,
  }

  return hasTransparentLightBlueEvidence(evidence) ? evidence : null
}

function hasTransparentLightBlueEvidence(evidence: TransparentLightBlueEvidence): boolean {
  if (evidence.sourceName === "Black") {
    return evidence.pixelCount <= BLACK_PIXEL_COUNT_MAX &&
      evidence.backgroundRatio >= BLACK_BACKGROUND_RATIO_MIN &&
      evidence.edgeRatio >= BLACK_EDGE_RATIO_MIN &&
      evidence.cyanGlassCoverage >= BLACK_CYAN_GLASS_COVERAGE_MIN &&
      evidence.darkCoverage >= BLACK_DARK_COVERAGE_MIN &&
      evidence.darkCoverage <= BLACK_DARK_COVERAGE_MAX
  }

  if (evidence.sourceName === "Light Bluish Gray") {
    return evidence.pixelCount <= LIGHT_BLUISH_GRAY_PIXEL_COUNT_MAX &&
      evidence.backgroundRatio >= LIGHT_BLUISH_GRAY_BACKGROUND_RATIO_MIN &&
      evidence.edgeRatio >= LIGHT_BLUISH_GRAY_EDGE_RATIO_MIN &&
      evidence.cyanGlassCoverage >= LIGHT_BLUISH_GRAY_CYAN_GLASS_COVERAGE_MIN &&
      evidence.darkCoverage <= LIGHT_BLUISH_GRAY_DARK_COVERAGE_MAX
  }

  return evidence.pixelCount <= DARK_BLUISH_GRAY_PIXEL_COUNT_MAX &&
    evidence.backgroundRatio >= DARK_BLUISH_GRAY_BACKGROUND_RATIO_MIN &&
    evidence.edgeRatio >= DARK_BLUISH_GRAY_EDGE_RATIO_MIN &&
    evidence.cyanGlassCoverage >= DARK_BLUISH_GRAY_CYAN_GLASS_COVERAGE_MIN &&
    evidence.darkCoverage <= DARK_BLUISH_GRAY_DARK_COVERAGE_MAX
}

function readSourceName(currentName: string): TransparentLightBlueEvidence["sourceName"] | null {
  switch (normalizeName(currentName)) {
    case "black":
      return "Black"
    case "dark bluish gray":
      return "Dark Bluish Gray"
    case "light bluish gray":
      return "Light Bluish Gray"
    default:
      return null
  }
}

function isCyanGlassChip(chip: PartColorSampleChip): boolean {
  const { b, g, r } = chip.rgb
  const saturation = colorSaturation(chip.rgb)
  const luma = colorLuma(chip.rgb)

  return b >= g &&
    g >= r &&
    b - r >= 8 &&
    saturation <= 70 &&
    luma >= 45 &&
    luma <= 185
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
