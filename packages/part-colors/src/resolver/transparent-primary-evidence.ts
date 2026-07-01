import type { PartColorSampleChip } from "../contracts"
import { rgbToLch } from "../color-space"
import type { PartColorFeature } from "./types"

const BLUE_ACCEPTED_COVERAGE_MIN = 0.9
const BLUE_EDGE_COVERAGE_MIN = 0.85
const BLUE_SOURCE_BACKGROUND_RATIO_MIN = 0.12
const BLUE_SOURCE_DARK_BODY_COVERAGE_MIN = 0.65
const BLUE_SOURCE_EDGE_RATIO_MIN = 0.45
const BLUE_SOURCE_PIXEL_COUNT_MAX = 60

const DARK_PURPLE_BACKGROUND_RATIO_MIN = 0.1
const DARK_PURPLE_DARK_BODY_COVERAGE_MIN = 0.6
const DARK_PURPLE_EDGE_RATIO_MIN = 0.4
const DARK_PURPLE_PIXEL_COUNT_MAX = 80

const DARK_RED_BACKGROUND_RATIO_MIN = 0.14
const DARK_RED_EDGE_RED_COVERAGE_MIN = 0.42
const DARK_RED_EDGE_RATIO_MIN = 0.52
const DARK_RED_LIGHT_RED_COVERAGE_MIN = 0.3
const DARK_RED_PIXEL_COUNT_MAX = 65
const DARK_RED_RED_COVERAGE_MIN = 0.75

const RED_ACCEPTED_COVERAGE_MIN = 0.9
const RED_BACKGROUND_RATIO_MIN = 0.14
const RED_EDGE_COVERAGE_MIN = 0.5
const RED_EDGE_RATIO_MIN = 0.5
const RED_PIXEL_COUNT_MAX = 65
const RED_TINY_ACCEPTED_COVERAGE_MIN = 0.9
const RED_TINY_BACKGROUND_RATIO_MIN = 0.16
const RED_TINY_EDGE_RATIO_MIN = 0.48
const RED_TINY_LIGHT_RED_COVERAGE_MIN = 0.58
const RED_TINY_PIXEL_COUNT_MAX = 50

const REDDISH_BROWN_BACKGROUND_RATIO_MIN = 0.16
const REDDISH_BROWN_EDGE_RATIO_MIN = 0.42
const REDDISH_BROWN_LIGHT_RED_COVERAGE_MIN = 0.08
const REDDISH_BROWN_PIXEL_COUNT_MAX = 50
const REDDISH_BROWN_RED_COVERAGE_MIN = 0.55

export interface TransparentPrimaryEvidence {
  acceptedColorCoverage: number
  backgroundRatio: number
  darkBodyCoverage: number
  edgeColorCoverage: number
  edgeRatio: number
  lightColorCoverage: number
  pixelCount: number
  sourceName: "Blue" | "Dark Purple" | "Dark Red" | "Red" | "Reddish Brown"
  targetName: "Trans-Dark Blue" | "Trans-Red"
}

export function readTransparentPrimaryEvidence(
  feature: PartColorFeature,
  currentName: string,
): TransparentPrimaryEvidence | null {
  const sourceName = normalizeEvidenceSourceName(currentName)

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
  const evidence = createEvidence(feature, sourceName, backgroundRatio, edgeRatio)

  return hasTransparentEvidence(evidence) ? evidence : null
}

function createEvidence(
  feature: PartColorFeature,
  sourceName: TransparentPrimaryEvidence["sourceName"],
  backgroundRatio: number,
  edgeRatio: number,
): TransparentPrimaryEvidence {
  if (sourceName === "Dark Red" || sourceName === "Red" || sourceName === "Reddish Brown") {
    return {
      acceptedColorCoverage: sumCoverage(feature.sample.chips.filter(isRedChip)),
      backgroundRatio,
      darkBodyCoverage: sumCoverage(feature.sample.chips.filter(isDarkRedChip)),
      edgeColorCoverage: sumCoverage((feature.sample.edgeChips ?? []).filter(isRedChip)),
      edgeRatio,
      lightColorCoverage: sumCoverage(feature.sample.chips.filter(isLightRedChip)),
      pixelCount: feature.sample.pixelCount,
      sourceName,
      targetName: "Trans-Red",
    }
  }

  return {
    acceptedColorCoverage: sumCoverage(feature.sample.chips.filter(isBlueChip)),
    backgroundRatio,
    darkBodyCoverage: sumCoverage(feature.sample.chips.filter(isDarkBlueChip)),
    edgeColorCoverage: sumCoverage((feature.sample.edgeChips ?? []).filter(isBlueChip)),
    edgeRatio,
    lightColorCoverage: 0,
    pixelCount: feature.sample.pixelCount,
    sourceName,
    targetName: "Trans-Dark Blue",
  }
}

function hasTransparentEvidence(evidence: TransparentPrimaryEvidence): boolean {
  switch (evidence.sourceName) {
    case "Red":
      return hasTransparentRedEdgeEvidence(evidence) ||
        hasTinyTransparentRedBodyEvidence(evidence)
    case "Dark Red":
      return evidence.pixelCount <= DARK_RED_PIXEL_COUNT_MAX &&
        evidence.backgroundRatio >= DARK_RED_BACKGROUND_RATIO_MIN &&
        evidence.edgeRatio >= DARK_RED_EDGE_RATIO_MIN &&
        evidence.acceptedColorCoverage >= DARK_RED_RED_COVERAGE_MIN &&
        evidence.lightColorCoverage >= DARK_RED_LIGHT_RED_COVERAGE_MIN &&
        evidence.edgeColorCoverage >= DARK_RED_EDGE_RED_COVERAGE_MIN
    case "Reddish Brown":
      return evidence.pixelCount <= REDDISH_BROWN_PIXEL_COUNT_MAX &&
        evidence.backgroundRatio >= REDDISH_BROWN_BACKGROUND_RATIO_MIN &&
        evidence.edgeRatio >= REDDISH_BROWN_EDGE_RATIO_MIN &&
        evidence.acceptedColorCoverage >= REDDISH_BROWN_RED_COVERAGE_MIN &&
        evidence.lightColorCoverage >= REDDISH_BROWN_LIGHT_RED_COVERAGE_MIN
    case "Blue":
      return hasTransparentDarkBlueEvidence(evidence, {
        backgroundRatioMin: BLUE_SOURCE_BACKGROUND_RATIO_MIN,
        darkBodyCoverageMin: BLUE_SOURCE_DARK_BODY_COVERAGE_MIN,
        edgeRatioMin: BLUE_SOURCE_EDGE_RATIO_MIN,
        pixelCountMax: BLUE_SOURCE_PIXEL_COUNT_MAX,
      })
    case "Dark Purple":
      return hasTransparentDarkBlueEvidence(evidence, {
        backgroundRatioMin: DARK_PURPLE_BACKGROUND_RATIO_MIN,
        darkBodyCoverageMin: DARK_PURPLE_DARK_BODY_COVERAGE_MIN,
        edgeRatioMin: DARK_PURPLE_EDGE_RATIO_MIN,
        pixelCountMax: DARK_PURPLE_PIXEL_COUNT_MAX,
      })
  }
}

function hasTransparentRedEdgeEvidence(evidence: TransparentPrimaryEvidence): boolean {
  return evidence.pixelCount <= RED_PIXEL_COUNT_MAX &&
    evidence.backgroundRatio >= RED_BACKGROUND_RATIO_MIN &&
    evidence.edgeRatio >= RED_EDGE_RATIO_MIN &&
    evidence.acceptedColorCoverage >= RED_ACCEPTED_COVERAGE_MIN &&
    evidence.edgeColorCoverage >= RED_EDGE_COVERAGE_MIN
}

function hasTinyTransparentRedBodyEvidence(evidence: TransparentPrimaryEvidence): boolean {
  return evidence.pixelCount <= RED_TINY_PIXEL_COUNT_MAX &&
    evidence.backgroundRatio >= RED_TINY_BACKGROUND_RATIO_MIN &&
    evidence.edgeRatio >= RED_TINY_EDGE_RATIO_MIN &&
    evidence.acceptedColorCoverage >= RED_TINY_ACCEPTED_COVERAGE_MIN &&
    evidence.lightColorCoverage >= RED_TINY_LIGHT_RED_COVERAGE_MIN
}

function hasTransparentDarkBlueEvidence(
  evidence: TransparentPrimaryEvidence,
  guard: {
    backgroundRatioMin: number
    darkBodyCoverageMin: number
    edgeRatioMin: number
    pixelCountMax: number
  },
): boolean {
  return evidence.pixelCount <= guard.pixelCountMax &&
    evidence.backgroundRatio >= guard.backgroundRatioMin &&
    evidence.edgeRatio >= guard.edgeRatioMin &&
    evidence.acceptedColorCoverage >= BLUE_ACCEPTED_COVERAGE_MIN &&
    evidence.edgeColorCoverage >= BLUE_EDGE_COVERAGE_MIN &&
    evidence.darkBodyCoverage >= guard.darkBodyCoverageMin
}

function normalizeEvidenceSourceName(currentName: string): TransparentPrimaryEvidence["sourceName"] | null {
  switch (normalizeName(currentName)) {
    case "blue":
      return "Blue"
    case "dark purple":
      return "Dark Purple"
    case "dark red":
      return "Dark Red"
    case "red":
      return "Red"
    case "reddish brown":
      return "Reddish Brown"
    default:
      return null
  }
}

function isBlueChip(chip: PartColorSampleChip): boolean {
  return chip.rgb.b > chip.rgb.r + 20 &&
    chip.rgb.b > chip.rgb.g + 5
}

function isDarkBlueChip(chip: PartColorSampleChip): boolean {
  return isBlueChip(chip) && colorLuma(chip.rgb) < 95
}

function isRedChip(chip: PartColorSampleChip): boolean {
  return chip.rgb.r > chip.rgb.g + 20 &&
    chip.rgb.r > chip.rgb.b + 20
}

function isDarkRedChip(chip: PartColorSampleChip): boolean {
  return isRedChip(chip) && colorLuma(chip.rgb) < 105
}

function isLightRedChip(chip: PartColorSampleChip): boolean {
  return isRedChip(chip) && rgbToLch(chip.rgb).l >= 36
}

function sumCoverage(chips: readonly PartColorSampleChip[]): number {
  return chips.reduce((total, chip) => total + chip.coverage, 0)
}

function colorLuma(rgb: { b: number, g: number, r: number }): number {
  return rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
