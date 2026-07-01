import { rgbToLch } from "../color-space"
import type { PartColorSampleChip } from "../contracts"
import type { PartColorFeature } from "./types"

const BACKGROUND_RATIO_MIN = 0.08
const DARK_COVERAGE_MAX = 0.2
const EDGE_RATIO_MIN = 0.42
const LIGHT_ORANGE_COVERAGE_MIN = 0.16
const MEDIUM_NOUGAT_BACKGROUND_RATIO_MIN = 0.2
const MEDIUM_NOUGAT_DARK_COVERAGE_MAX = 0.4
const MEDIUM_NOUGAT_EDGE_ORANGE_COVERAGE_MAX = 0.3
const MEDIUM_NOUGAT_LIGHT_ORANGE_COVERAGE_MIN = 0.2
const MEDIUM_NOUGAT_ORANGE_COVERAGE_MIN = 0.45
const MEDIUM_NOUGAT_PIXEL_COUNT_MAX = 65
const ORANGE_COVERAGE_MIN = 0.75
const PIXEL_COUNT_MAX = 260
const RED_COVERAGE_MAX = 0.03
const TINY_PEARL_GOLD_BACKGROUND_RATIO_MIN = 0.22
const TINY_PEARL_GOLD_DARK_COVERAGE_MIN = 0.09
const TINY_PEARL_GOLD_EDGE_ORANGE_COVERAGE_MIN = 0.09
const TINY_PEARL_GOLD_EDGE_RATIO_MIN = 0.45
const TINY_PEARL_GOLD_ORANGE_COVERAGE_MIN = 0.1
const TINY_PEARL_GOLD_PIXEL_COUNT_MAX = 35
const REDDISH_BROWN_BACKGROUND_RATIO_MIN = 0.2
const REDDISH_BROWN_DARK_COVERAGE_MAX = 0.35
const REDDISH_BROWN_EDGE_RATIO_MIN = 0.25
const REDDISH_BROWN_LIGHT_ORANGE_COVERAGE_MIN = 0.08
const REDDISH_BROWN_ORANGE_COVERAGE_MIN = 0.6
const REDDISH_BROWN_PIXEL_COUNT_MAX = 120

export interface TransparentOrangeEvidence {
  backgroundRatio: number
  darkCoverage: number
  edgeRatio: number
  lightOrangeCoverage: number
  orangeCoverage: number
  orangeEdgeCoverage: number
  pixelCount: number
  redCoverage: number
  sourceName: "Medium Nougat" | "Pearl Gold" | "Reddish Brown"
}

export function readTransparentOrangeEvidence(
  feature: PartColorFeature,
  currentName: string,
): TransparentOrangeEvidence | null {
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
  const evidence: TransparentOrangeEvidence = {
    backgroundRatio,
    darkCoverage: sumCoverage(feature.sample.chips.filter(isDarkChip)),
    edgeRatio,
    lightOrangeCoverage: sumCoverage(feature.sample.chips.filter(isLightOrangeChip)),
    orangeCoverage: sumCoverage(feature.sample.chips.filter(isOrangeChip)),
    orangeEdgeCoverage: sumCoverage((feature.sample.edgeChips ?? []).filter(isOrangeChip)),
    pixelCount: feature.sample.pixelCount,
    redCoverage: sumCoverage(feature.sample.chips.filter(isRedChip)),
    sourceName,
  }

  return hasTransparentOrangeEvidence(evidence) ? evidence : null
}

function hasTransparentOrangeEvidence(evidence: TransparentOrangeEvidence): boolean {
  if (evidence.sourceName === "Reddish Brown") {
    return evidence.pixelCount <= REDDISH_BROWN_PIXEL_COUNT_MAX &&
      evidence.backgroundRatio >= REDDISH_BROWN_BACKGROUND_RATIO_MIN &&
      evidence.edgeRatio >= REDDISH_BROWN_EDGE_RATIO_MIN &&
      evidence.orangeCoverage >= REDDISH_BROWN_ORANGE_COVERAGE_MIN &&
      evidence.lightOrangeCoverage >= REDDISH_BROWN_LIGHT_ORANGE_COVERAGE_MIN &&
      evidence.darkCoverage <= REDDISH_BROWN_DARK_COVERAGE_MAX &&
      evidence.redCoverage <= RED_COVERAGE_MAX
  }

  if (evidence.sourceName === "Medium Nougat") {
    return evidence.pixelCount <= MEDIUM_NOUGAT_PIXEL_COUNT_MAX &&
      evidence.backgroundRatio >= MEDIUM_NOUGAT_BACKGROUND_RATIO_MIN &&
      evidence.orangeCoverage >= MEDIUM_NOUGAT_ORANGE_COVERAGE_MIN &&
      evidence.lightOrangeCoverage >= MEDIUM_NOUGAT_LIGHT_ORANGE_COVERAGE_MIN &&
      evidence.orangeEdgeCoverage <= MEDIUM_NOUGAT_EDGE_ORANGE_COVERAGE_MAX &&
      evidence.darkCoverage <= MEDIUM_NOUGAT_DARK_COVERAGE_MAX &&
      evidence.redCoverage <= RED_COVERAGE_MAX
  }

  if (hasTinyPearlGoldTransparentOrangeEvidence(evidence)) {
    return true
  }

  return evidence.pixelCount <= PIXEL_COUNT_MAX &&
    evidence.backgroundRatio >= BACKGROUND_RATIO_MIN &&
    evidence.edgeRatio >= EDGE_RATIO_MIN &&
    evidence.orangeCoverage >= ORANGE_COVERAGE_MIN &&
    evidence.lightOrangeCoverage >= LIGHT_ORANGE_COVERAGE_MIN &&
    evidence.darkCoverage <= DARK_COVERAGE_MAX &&
    evidence.redCoverage <= RED_COVERAGE_MAX
}

function readSourceName(currentName: string): TransparentOrangeEvidence["sourceName"] | null {
  switch (normalizeName(currentName)) {
    case "medium nougat":
      return "Medium Nougat"
    case "pearl gold":
      return "Pearl Gold"
    case "reddish brown":
      return "Reddish Brown"
    default:
      return null
  }
}

function hasTinyPearlGoldTransparentOrangeEvidence(evidence: TransparentOrangeEvidence): boolean {
  return evidence.pixelCount <= TINY_PEARL_GOLD_PIXEL_COUNT_MAX &&
    evidence.backgroundRatio >= TINY_PEARL_GOLD_BACKGROUND_RATIO_MIN &&
    evidence.edgeRatio >= TINY_PEARL_GOLD_EDGE_RATIO_MIN &&
    evidence.orangeCoverage >= TINY_PEARL_GOLD_ORANGE_COVERAGE_MIN &&
    evidence.orangeEdgeCoverage >= TINY_PEARL_GOLD_EDGE_ORANGE_COVERAGE_MIN &&
    evidence.darkCoverage >= TINY_PEARL_GOLD_DARK_COVERAGE_MIN &&
    evidence.redCoverage <= RED_COVERAGE_MAX
}

function isOrangeChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.h >= 35 &&
    lch.h <= 80 &&
    lch.c >= 18
}

function isLightOrangeChip(chip: PartColorSampleChip): boolean {
  return isOrangeChip(chip) && rgbToLch(chip.rgb).l >= 35
}

function isRedChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.h >= 10 &&
    lch.h < 35 &&
    lch.c >= 20
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
