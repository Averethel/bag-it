import type { PartColorSampleChip } from "../contracts"
import type { PartColorFeature } from "./types"

const BACKGROUND_RATIO_MIN = 0.18
const COOL_BLUE_COVERAGE_MAX = 0.03
const CYAN_EDGE_COVERAGE_MIN = 0.45
const DARK_COVERAGE_MAX = 0.35
const EDGE_RATIO_MIN = 0.42
const NEUTRAL_COVERAGE_MIN = 0.65
const PIXEL_COUNT_MAX = 120

export interface TransparentBrownEvidence {
  backgroundRatio: number
  coolBlueCoverage: number
  cyanEdgeCoverage: number
  darkCoverage: number
  edgeRatio: number
  neutralCoverage: number
  pixelCount: number
  sourceName: "Flat Silver"
}

export function readTransparentBrownEvidence(
  feature: PartColorFeature,
  currentName: string,
): TransparentBrownEvidence | null {
  if (normalizeName(currentName) !== "flat silver") {
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
  const evidence: TransparentBrownEvidence = {
    backgroundRatio,
    coolBlueCoverage: sumCoverage(feature.sample.chips.filter(isCoolBlueChip)),
    cyanEdgeCoverage: sumCoverage((feature.sample.edgeChips ?? []).filter(isCyanGlassChip)),
    darkCoverage: sumCoverage(feature.sample.chips.filter(isDarkChip)),
    edgeRatio,
    neutralCoverage: sumCoverage(feature.sample.chips.filter(isNeutralChip)),
    pixelCount: feature.sample.pixelCount,
    sourceName: "Flat Silver",
  }

  return hasTransparentBrownEvidence(evidence) ? evidence : null
}

function hasTransparentBrownEvidence(evidence: TransparentBrownEvidence): boolean {
  return evidence.pixelCount <= PIXEL_COUNT_MAX &&
    evidence.backgroundRatio >= BACKGROUND_RATIO_MIN &&
    evidence.edgeRatio >= EDGE_RATIO_MIN &&
    evidence.neutralCoverage >= NEUTRAL_COVERAGE_MIN &&
    evidence.cyanEdgeCoverage >= CYAN_EDGE_COVERAGE_MIN &&
    evidence.darkCoverage <= DARK_COVERAGE_MAX &&
    evidence.coolBlueCoverage <= COOL_BLUE_COVERAGE_MAX
}

function isCyanGlassChip(chip: PartColorSampleChip): boolean {
  const { b, g, r } = chip.rgb
  const saturation = colorSaturation(chip.rgb)
  const luma = colorLuma(chip.rgb)

  return b >= g &&
    g >= r &&
    b - r >= 8 &&
    saturation <= 75 &&
    luma >= 45 &&
    luma <= 185
}

function isCoolBlueChip(chip: PartColorSampleChip): boolean {
  const { b, g, r } = chip.rgb

  return b > r + 18 && b > g + 4
}

function isDarkChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) <= 82
}

function isNeutralChip(chip: PartColorSampleChip): boolean {
  const saturation = colorSaturation(chip.rgb)
  const luma = colorLuma(chip.rgb)

  return saturation <= 22 && luma >= 70 && luma < 155
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
