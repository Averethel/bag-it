import { rgbToLch } from "../color-space"
import type { PartColorSampleChip } from "../contracts"
import type { PartColorFeature } from "./types"

const DARK_BLUE_BACKGROUND_RATIO_MIN = 0.12
const DARK_BLUE_BLUE_COVERAGE_MIN = 0.4
const DARK_BLUE_DARK_BLUE_COVERAGE_MIN = 0.28
const DARK_BLUE_DARK_COVERAGE_MIN = 0.7
const DARK_BLUE_EDGE_BLUE_COVERAGE_MIN = 0.8
const DARK_BLUE_EDGE_DARK_BLUE_COVERAGE_MIN = 0.48
const DARK_BLUE_EDGE_RATIO_MIN = 0.4
const DARK_BLUE_PIXEL_COUNT_MAX = 100

const SAND_BLUE_BACKGROUND_RATIO_MIN = 0.16
const SAND_BLUE_BLUE_COVERAGE_MIN = 0.65
const SAND_BLUE_DARK_BLUE_COVERAGE_MIN = 0.55
const SAND_BLUE_DARK_COVERAGE_MIN = 0.55
const SAND_BLUE_EDGE_BLUE_COVERAGE_MIN = 0.85
const SAND_BLUE_EDGE_RATIO_MIN = 0.28
const SAND_BLUE_PIXEL_COUNT_MAX = 100

export interface TransparentDarkBlueEvidence {
  backgroundRatio: number
  blueCoverage: number
  darkBlueCoverage: number
  darkCoverage: number
  edgeBlueCoverage: number
  edgeDarkBlueCoverage: number
  edgeRatio: number
  pixelCount: number
  sourceName: "Dark Blue" | "Sand Blue"
}

export function readTransparentDarkBlueEvidence(
  feature: PartColorFeature,
  currentName: string,
): TransparentDarkBlueEvidence | null {
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
  const evidence: TransparentDarkBlueEvidence = {
    backgroundRatio,
    blueCoverage: sumCoverage(feature.sample.chips.filter(isBlueChip)),
    darkBlueCoverage: sumCoverage(feature.sample.chips.filter(isDarkBlueChip)),
    darkCoverage: sumCoverage(feature.sample.chips.filter(isDarkChip)),
    edgeBlueCoverage: sumCoverage((feature.sample.edgeChips ?? []).filter(isBlueChip)),
    edgeDarkBlueCoverage: sumCoverage((feature.sample.edgeChips ?? []).filter(isDarkBlueChip)),
    edgeRatio,
    pixelCount: feature.sample.pixelCount,
    sourceName,
  }

  return hasTransparentDarkBlueEvidence(evidence) ? evidence : null
}

function hasTransparentDarkBlueEvidence(evidence: TransparentDarkBlueEvidence): boolean {
  if (evidence.sourceName === "Sand Blue") {
    return evidence.pixelCount <= SAND_BLUE_PIXEL_COUNT_MAX &&
      evidence.backgroundRatio >= SAND_BLUE_BACKGROUND_RATIO_MIN &&
      evidence.edgeRatio >= SAND_BLUE_EDGE_RATIO_MIN &&
      evidence.blueCoverage >= SAND_BLUE_BLUE_COVERAGE_MIN &&
      evidence.darkBlueCoverage >= SAND_BLUE_DARK_BLUE_COVERAGE_MIN &&
      evidence.darkCoverage >= SAND_BLUE_DARK_COVERAGE_MIN &&
      evidence.edgeBlueCoverage >= SAND_BLUE_EDGE_BLUE_COVERAGE_MIN
  }

  return evidence.pixelCount <= DARK_BLUE_PIXEL_COUNT_MAX &&
    evidence.backgroundRatio >= DARK_BLUE_BACKGROUND_RATIO_MIN &&
    evidence.edgeRatio >= DARK_BLUE_EDGE_RATIO_MIN &&
    evidence.blueCoverage >= DARK_BLUE_BLUE_COVERAGE_MIN &&
    evidence.darkBlueCoverage >= DARK_BLUE_DARK_BLUE_COVERAGE_MIN &&
    evidence.darkCoverage >= DARK_BLUE_DARK_COVERAGE_MIN &&
    evidence.edgeBlueCoverage >= DARK_BLUE_EDGE_BLUE_COVERAGE_MIN &&
    evidence.edgeDarkBlueCoverage >= DARK_BLUE_EDGE_DARK_BLUE_COVERAGE_MIN
}

function readSourceName(currentName: string): TransparentDarkBlueEvidence["sourceName"] | null {
  switch (normalizeName(currentName)) {
    case "dark blue":
      return "Dark Blue"
    case "sand blue":
      return "Sand Blue"
    default:
      return null
  }
}

function isBlueChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.h >= 235 &&
    lch.h <= 305 &&
    lch.c >= 6 &&
    lch.l >= 28 &&
    lch.l <= 82
}

function isDarkBlueChip(chip: PartColorSampleChip): boolean {
  return isBlueChip(chip) && rgbToLch(chip.rgb).l <= 48
}

function isDarkChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) <= 82
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
