import type { PartColorSampleChip } from "../contracts"
import type { PartColorFeature } from "./types"

const BACKGROUND_COUNT_MIN = 40

const BLACK_BACKGROUND_RATIO_MIN = 0.32
const BLACK_BRIGHT_NEUTRAL_EDGE_COVERAGE_MIN = 0.08

const DARK_BLUISH_GRAY_BACKGROUND_RATIO_MIN = 0.35
const DARK_BLUISH_GRAY_DARK_COVERAGE_MIN = 0.45
const DARK_BLUISH_GRAY_MAX_EDGE_LUMA_MIN = 168

const FLAT_SILVER_BACKGROUND_RATIO_MIN = 0.23
const LIGHT_BLUISH_GRAY_BACKGROUND_RATIO_MIN = 0.44
const LIGHT_BLUISH_GRAY_BRIGHT_EDGE_COVERAGE_MIN = 0.1
const LIGHT_BLUISH_GRAY_LIGHT_EDGE_BACKGROUND_RATIO_MIN = 0.45
const LIGHT_BLUISH_GRAY_LIGHT_EDGE_BRIGHT_COVERAGE_MAX = 0.06
const LIGHT_BLUISH_GRAY_LIGHT_EDGE_COVERAGE_MIN = 0.45
const LIGHT_BLUISH_GRAY_LIGHT_EDGE_PIXEL_COUNT_MAX = 60
const LIGHT_BLUISH_GRAY_TINY_WHITE_BACKGROUND_RATIO_MIN = 0.47
const LIGHT_BLUISH_GRAY_TINY_WHITE_DARK_COVERAGE_MAX = 0.06
const LIGHT_BLUISH_GRAY_TINY_WHITE_EDGE_RATIO_MIN = 0.35
const LIGHT_BLUISH_GRAY_TINY_WHITE_LIGHT_EDGE_COVERAGE_MIN = 0.47
const LIGHT_BLUISH_GRAY_TINY_WHITE_MAX_EDGE_LUMA_MIN = 190
const LIGHT_BLUISH_GRAY_TINY_WHITE_PIXEL_COUNT_MAX = 20
const LIGHT_BLUISH_GRAY_SMALL_WHITE_BACKGROUND_COUNT_MIN = 30
const LIGHT_BLUISH_GRAY_SMALL_WHITE_BACKGROUND_RATIO_MAX = 0.33
const LIGHT_BLUISH_GRAY_SMALL_WHITE_BACKGROUND_RATIO_MIN = 0.26
const LIGHT_BLUISH_GRAY_SMALL_WHITE_DARK_COVERAGE_MAX = 0.2
const LIGHT_BLUISH_GRAY_SMALL_WHITE_EDGE_RATIO_MIN = 0.35
const LIGHT_BLUISH_GRAY_SMALL_WHITE_LIGHT_EDGE_COVERAGE_MIN = 0.3
const LIGHT_BLUISH_GRAY_SMALL_WHITE_PIXEL_COUNT_MAX = 40
const LIGHT_BLUISH_GRAY_DARK_COVERAGE_MIN = 0.4
const LIGHT_BLUISH_GRAY_DARK_BODY_BACKGROUND_RATIO_MIN = 0.35
const LIGHT_BLUISH_GRAY_DARK_BODY_BRIGHT_EDGE_COVERAGE_MAX = 0.08
const LIGHT_BLUISH_GRAY_DARK_BODY_COVERAGE_MIN = 0.25
const LIGHT_BLUISH_GRAY_DARK_BODY_PIXEL_COUNT_MAX = 130
const LIGHT_BLUISH_GRAY_EDGE_RATIO_MIN = 0.35
const LIGHT_BLUISH_GRAY_MODERATE_WHITE_BACKGROUND_RATIO_MAX = 0.33
const LIGHT_BLUISH_GRAY_MODERATE_WHITE_BACKGROUND_RATIO_MIN = 0.25
const LIGHT_BLUISH_GRAY_MODERATE_WHITE_BRIGHT_EDGE_COVERAGE_MAX = 0.32
const LIGHT_BLUISH_GRAY_MODERATE_WHITE_DARK_COVERAGE_MIN = 0.25
const LIGHT_BLUISH_GRAY_MODERATE_WHITE_DOMINANT_COVERAGE_MAX = 0.42
const LIGHT_BLUISH_GRAY_MODERATE_WHITE_EDGE_RATIO_MIN = 0.35
const LIGHT_BLUISH_GRAY_MODERATE_WHITE_LIGHT_EDGE_COVERAGE_MAX = 0.46
const LIGHT_BLUISH_GRAY_MODERATE_WHITE_PIXEL_COUNT_MAX = 150
const LIGHT_BLUISH_GRAY_PIXEL_COUNT_MAX = 80
const LIGHT_BLUISH_GRAY_TINY_BACKGROUND_RATIO_MIN = 0.42
const LIGHT_BLUISH_GRAY_TINY_BRIGHT_EDGE_COVERAGE_MIN = 0.12
const LIGHT_BLUISH_GRAY_TINY_DARK_COVERAGE_MIN = 0.25

const BRIGHT_NEUTRAL_EDGE_LUMA_MIN = 170
const BRIGHT_NEUTRAL_EDGE_CHROMA_MAX = 22
const DARK_CHIP_LUMA_MAX = 72
const LIGHT_NEUTRAL_EDGE_CHROMA_MAX = 28
const LIGHT_NEUTRAL_EDGE_LUMA_MAX = 190
const LIGHT_NEUTRAL_EDGE_LUMA_MIN = 130
const LIGHT_NEUTRAL_EDGE_RED_BIAS_TOLERANCE = 8

export interface WhiteBackgroundEvidence {
  backgroundCount: number
  backgroundRatio: number
  brightNeutralEdgeCoverage: number
  darkCoverage: number
  dominantCoverage: number
  edgeRatio: number
  lightNeutralEdgeCoverage: number
  maxEdgeLuma: number
  pixelCount: number
  sourceName: "Black" | "Dark Bluish Gray" | "Flat Silver" | "Light Bluish Gray"
}

export function readWhiteBackgroundEvidence(
  feature: PartColorFeature,
  currentName: string,
): WhiteBackgroundEvidence | null {
  const sourceName = normalizeEvidenceSourceName(currentName)

  if (!sourceName) {
    return null
  }

  const backgroundCount = feature.sample.rejectionCounts.background
  const rejectedPixelCount = feature.sample.rejectedPixelCount
  const totalPixelCount = feature.sample.pixelCount + rejectedPixelCount
  const backgroundRatio = totalPixelCount > 0 ? backgroundCount / totalPixelCount : 0
  const edgeRatio = totalPixelCount > 0 ? (feature.sample.rejectionCounts.edge ?? 0) / totalPixelCount : 0
  const brightNeutralEdgeCoverage = sumCoverage(
    (feature.sample.edgeChips ?? []).filter(isBrightNeutralEdgeChip),
  )
  const lightNeutralEdgeCoverage = sumCoverage(
    (feature.sample.edgeChips ?? []).filter(isLightNeutralEdgeChip),
  )
  const darkCoverage = sumCoverage(feature.sample.chips.filter(isDarkChip))
  const maxEdgeLuma = readMaxEdgeLuma(feature.sample.edgeChips ?? [])
  const evidence = {
    backgroundCount,
    backgroundRatio,
    brightNeutralEdgeCoverage,
    darkCoverage,
    dominantCoverage: feature.sample.dominantCoverage,
    edgeRatio,
    lightNeutralEdgeCoverage,
    maxEdgeLuma,
    pixelCount: feature.sample.pixelCount,
    sourceName,
  }

  return hasSourceEvidence(evidence) ? evidence : null
}

function hasSourceEvidence(evidence: WhiteBackgroundEvidence): boolean {
  switch (evidence.sourceName) {
    case "Black":
      return evidence.backgroundCount >= BACKGROUND_COUNT_MIN &&
        evidence.backgroundRatio > BLACK_BACKGROUND_RATIO_MIN &&
        evidence.brightNeutralEdgeCoverage >= BLACK_BRIGHT_NEUTRAL_EDGE_COVERAGE_MIN
    case "Dark Bluish Gray":
      return evidence.backgroundCount >= BACKGROUND_COUNT_MIN &&
        evidence.backgroundRatio > DARK_BLUISH_GRAY_BACKGROUND_RATIO_MIN &&
        evidence.darkCoverage >= DARK_BLUISH_GRAY_DARK_COVERAGE_MIN &&
        evidence.maxEdgeLuma >= DARK_BLUISH_GRAY_MAX_EDGE_LUMA_MIN
    case "Flat Silver":
      return evidence.backgroundCount >= BACKGROUND_COUNT_MIN &&
        evidence.backgroundRatio > FLAT_SILVER_BACKGROUND_RATIO_MIN
    case "Light Bluish Gray":
      return hasLightBluishGrayWhiteBodyEvidence(evidence)
  }
}

function hasLightBluishGrayWhiteBodyEvidence(evidence: WhiteBackgroundEvidence): boolean {
  if (hasModerateLightBluishGrayWhiteBodyEvidence(evidence)) {
    return true
  }

  if (hasSmallLightBluishGrayWhiteBodyEvidence(evidence)) {
    return true
  }

  if (evidence.backgroundCount < BACKGROUND_COUNT_MIN) {
    return false
  }

  return hasStrongLightBluishGrayEdgeEvidence(evidence) ||
    hasLightBluishGrayLightEdgeEvidence(evidence) ||
    hasTinyLightBluishGrayWhiteBodyEvidence(evidence) ||
    hasLightBluishGrayDarkBodyEvidence(evidence) ||
    hasTinyLightBluishGrayBackgroundEvidence(evidence)
}

function hasModerateLightBluishGrayWhiteBodyEvidence(evidence: WhiteBackgroundEvidence): boolean {
  return evidence.backgroundRatio >= LIGHT_BLUISH_GRAY_MODERATE_WHITE_BACKGROUND_RATIO_MIN &&
    evidence.backgroundRatio <= LIGHT_BLUISH_GRAY_MODERATE_WHITE_BACKGROUND_RATIO_MAX &&
    evidence.brightNeutralEdgeCoverage <= LIGHT_BLUISH_GRAY_MODERATE_WHITE_BRIGHT_EDGE_COVERAGE_MAX &&
    evidence.darkCoverage >= LIGHT_BLUISH_GRAY_MODERATE_WHITE_DARK_COVERAGE_MIN &&
    evidence.dominantCoverage <= LIGHT_BLUISH_GRAY_MODERATE_WHITE_DOMINANT_COVERAGE_MAX &&
    evidence.edgeRatio >= LIGHT_BLUISH_GRAY_MODERATE_WHITE_EDGE_RATIO_MIN &&
    evidence.lightNeutralEdgeCoverage <= LIGHT_BLUISH_GRAY_MODERATE_WHITE_LIGHT_EDGE_COVERAGE_MAX &&
    evidence.pixelCount <= LIGHT_BLUISH_GRAY_MODERATE_WHITE_PIXEL_COUNT_MAX
}

function hasStrongLightBluishGrayEdgeEvidence(evidence: WhiteBackgroundEvidence): boolean {
  return evidence.backgroundRatio > LIGHT_BLUISH_GRAY_BACKGROUND_RATIO_MIN &&
    evidence.edgeRatio > LIGHT_BLUISH_GRAY_EDGE_RATIO_MIN &&
    evidence.brightNeutralEdgeCoverage >= LIGHT_BLUISH_GRAY_BRIGHT_EDGE_COVERAGE_MIN &&
    evidence.darkCoverage >= LIGHT_BLUISH_GRAY_DARK_COVERAGE_MIN &&
    evidence.pixelCount <= LIGHT_BLUISH_GRAY_PIXEL_COUNT_MAX
}

function hasLightBluishGrayLightEdgeEvidence(evidence: WhiteBackgroundEvidence): boolean {
  return evidence.backgroundRatio >= LIGHT_BLUISH_GRAY_LIGHT_EDGE_BACKGROUND_RATIO_MIN &&
    evidence.edgeRatio > LIGHT_BLUISH_GRAY_EDGE_RATIO_MIN &&
    evidence.brightNeutralEdgeCoverage <= LIGHT_BLUISH_GRAY_LIGHT_EDGE_BRIGHT_COVERAGE_MAX &&
    evidence.lightNeutralEdgeCoverage >= LIGHT_BLUISH_GRAY_LIGHT_EDGE_COVERAGE_MIN &&
    evidence.pixelCount <= LIGHT_BLUISH_GRAY_LIGHT_EDGE_PIXEL_COUNT_MAX
}

function hasTinyLightBluishGrayWhiteBodyEvidence(evidence: WhiteBackgroundEvidence): boolean {
  return evidence.backgroundRatio >= LIGHT_BLUISH_GRAY_TINY_WHITE_BACKGROUND_RATIO_MIN &&
    evidence.darkCoverage <= LIGHT_BLUISH_GRAY_TINY_WHITE_DARK_COVERAGE_MAX &&
    evidence.edgeRatio >= LIGHT_BLUISH_GRAY_TINY_WHITE_EDGE_RATIO_MIN &&
    evidence.lightNeutralEdgeCoverage >= LIGHT_BLUISH_GRAY_TINY_WHITE_LIGHT_EDGE_COVERAGE_MIN &&
    evidence.maxEdgeLuma >= LIGHT_BLUISH_GRAY_TINY_WHITE_MAX_EDGE_LUMA_MIN &&
    evidence.pixelCount <= LIGHT_BLUISH_GRAY_TINY_WHITE_PIXEL_COUNT_MAX
}

function hasSmallLightBluishGrayWhiteBodyEvidence(evidence: WhiteBackgroundEvidence): boolean {
  return evidence.backgroundCount >= LIGHT_BLUISH_GRAY_SMALL_WHITE_BACKGROUND_COUNT_MIN &&
    evidence.backgroundRatio >= LIGHT_BLUISH_GRAY_SMALL_WHITE_BACKGROUND_RATIO_MIN &&
    evidence.backgroundRatio <= LIGHT_BLUISH_GRAY_SMALL_WHITE_BACKGROUND_RATIO_MAX &&
    evidence.darkCoverage <= LIGHT_BLUISH_GRAY_SMALL_WHITE_DARK_COVERAGE_MAX &&
    evidence.edgeRatio >= LIGHT_BLUISH_GRAY_SMALL_WHITE_EDGE_RATIO_MIN &&
    evidence.lightNeutralEdgeCoverage >= LIGHT_BLUISH_GRAY_SMALL_WHITE_LIGHT_EDGE_COVERAGE_MIN &&
    evidence.pixelCount <= LIGHT_BLUISH_GRAY_SMALL_WHITE_PIXEL_COUNT_MAX
}

function hasLightBluishGrayDarkBodyEvidence(evidence: WhiteBackgroundEvidence): boolean {
  return evidence.backgroundRatio >= LIGHT_BLUISH_GRAY_DARK_BODY_BACKGROUND_RATIO_MIN &&
    evidence.brightNeutralEdgeCoverage <= LIGHT_BLUISH_GRAY_DARK_BODY_BRIGHT_EDGE_COVERAGE_MAX &&
    evidence.darkCoverage >= LIGHT_BLUISH_GRAY_DARK_BODY_COVERAGE_MIN &&
    evidence.pixelCount <= LIGHT_BLUISH_GRAY_DARK_BODY_PIXEL_COUNT_MAX
}

function hasTinyLightBluishGrayBackgroundEvidence(evidence: WhiteBackgroundEvidence): boolean {
  return evidence.backgroundRatio > LIGHT_BLUISH_GRAY_TINY_BACKGROUND_RATIO_MIN &&
    evidence.darkCoverage >= LIGHT_BLUISH_GRAY_TINY_DARK_COVERAGE_MIN &&
    evidence.pixelCount <= LIGHT_BLUISH_GRAY_PIXEL_COUNT_MAX &&
    (
      evidence.edgeRatio > LIGHT_BLUISH_GRAY_EDGE_RATIO_MIN ||
      evidence.brightNeutralEdgeCoverage >= LIGHT_BLUISH_GRAY_TINY_BRIGHT_EDGE_COVERAGE_MIN
    )
}

function normalizeEvidenceSourceName(currentName: string): WhiteBackgroundEvidence["sourceName"] | null {
  switch (normalizeName(currentName)) {
    case "black":
      return "Black"
    case "dark bluish gray":
      return "Dark Bluish Gray"
    case "flat silver":
      return "Flat Silver"
    case "light bluish gray":
      return "Light Bluish Gray"
    default:
      return null
  }
}

function isBrightNeutralEdgeChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) >= BRIGHT_NEUTRAL_EDGE_LUMA_MIN &&
    neutralChroma(chip.rgb) <= BRIGHT_NEUTRAL_EDGE_CHROMA_MAX
}

function isLightNeutralEdgeChip(chip: PartColorSampleChip): boolean {
  const luma = colorLuma(chip.rgb)

  return luma >= LIGHT_NEUTRAL_EDGE_LUMA_MIN &&
    luma <= LIGHT_NEUTRAL_EDGE_LUMA_MAX &&
    neutralChroma(chip.rgb) <= LIGHT_NEUTRAL_EDGE_CHROMA_MAX &&
    chip.rgb.b >= chip.rgb.r - LIGHT_NEUTRAL_EDGE_RED_BIAS_TOLERANCE
}

function isDarkChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) <= DARK_CHIP_LUMA_MAX
}

function readMaxEdgeLuma(edgeChips: readonly PartColorSampleChip[]): number {
  return edgeChips.reduce(
    (maxLuma, chip) => Math.max(maxLuma, colorLuma(chip.rgb)),
    0,
  )
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
