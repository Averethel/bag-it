import { rgbToLch } from "../color-space"
import type { PartColorSampleChip } from "../contracts"
import type { PartColorFeature } from "./types"

const BACKGROUND_REJECTION_RATIO_MAX = 0.06
const DARK_ORANGE_BACKGROUND_REJECTION_RATIO_MAX = 0.22
const DARK_ORANGE_DOMINANT_COVERAGE_MAX = 0.35
const DARK_ORANGE_EDGE_REJECTION_RATIO_MIN = 0.44
const DARK_ORANGE_MUTED_WARM_COVERAGE_MIN = 0.12
const DARK_ORANGE_PIXEL_COUNT_MAX = 220
const DARK_COVERAGE_MAX = 0.36
const EDGE_REJECTION_RATIO_MIN = 0.55
const MUTED_WARM_COVERAGE_MIN = 0.1
const SATURATED_WARM_COVERAGE_MAX = 0.7
const TRANS_ORANGE_BACKGROUND_REJECTION_RATIO_MAX = 0.2
const TRANS_ORANGE_BACKGROUND_REJECTION_RATIO_MIN = 0.08
const TRANS_ORANGE_DARK_COVERAGE_MAX = 0.25
const TRANS_ORANGE_EDGE_ORANGE_COVERAGE_MIN = 0.6
const TRANS_ORANGE_EDGE_REJECTION_RATIO_MIN = 0.42
const TRANS_ORANGE_MUTED_WARM_COVERAGE_MIN = 0.25
const TRANS_ORANGE_PIXEL_COUNT_MAX = 230
const TRANS_ORANGE_PIXEL_COUNT_MIN = 140
const TRANS_ORANGE_SATURATED_WARM_COVERAGE_MAX = 0.85

const ELIGIBLE_SOURCE_NAMES = new Set([
  "dark orange",
  "orange",
  "trans-orange",
])

export interface MediumNougatEdgeEvidence {
  backgroundRatio: number
  darkCoverage: number
  dominantCoverage: number
  edgeRatio: number
  mutedWarmCoverage: number
  orangeEdgeCoverage: number
  saturatedWarmCoverage: number
}

export function readMediumNougatEdgeEvidence(
  feature: PartColorFeature,
  currentName: string,
): MediumNougatEdgeEvidence | null {
  if (!ELIGIBLE_SOURCE_NAMES.has(normalizeName(currentName))) {
    return null
  }

  const totalPixelCount = feature.sample.pixelCount + feature.sample.rejectedPixelCount
  const safeTotalPixelCount = Math.max(1, totalPixelCount)
  const backgroundRatio = (feature.sample.rejectionCounts.background ?? 0) / safeTotalPixelCount
  const edgeRatio = (feature.sample.rejectionCounts.edge ?? 0) / safeTotalPixelCount
  const mutedWarmCoverage = sumCoverage(feature.topChips.filter(isMutedWarmChip))
  const saturatedWarmCoverage = sumCoverage(feature.topChips.filter(isSaturatedWarmChip))
  const darkCoverage = sumCoverage(feature.topChips.filter(isDarkChip))
  const evidence = {
    backgroundRatio,
    darkCoverage,
    dominantCoverage: feature.sample.dominantCoverage,
    edgeRatio,
    mutedWarmCoverage,
    orangeEdgeCoverage: sumCoverage((feature.sample.edgeChips ?? []).filter(isOrangeChip)),
    saturatedWarmCoverage,
  }

  if (!hasMediumNougatEdgeEvidence(evidence, currentName, feature.sample.pixelCount)) {
    return null
  }

  return evidence
}

function hasMediumNougatEdgeEvidence(
  evidence: MediumNougatEdgeEvidence,
  currentName: string,
  pixelCount: number,
): boolean {
  const sourceName = normalizeName(currentName)

  if (
    evidence.darkCoverage > DARK_COVERAGE_MAX ||
    evidence.mutedWarmCoverage < MUTED_WARM_COVERAGE_MIN
  ) {
    return false
  }

  if (
    sourceName !== "trans-orange" &&
    evidence.saturatedWarmCoverage > SATURATED_WARM_COVERAGE_MAX
  ) {
    return false
  }

  if (
    evidence.backgroundRatio <= BACKGROUND_REJECTION_RATIO_MAX &&
    evidence.edgeRatio >= EDGE_REJECTION_RATIO_MIN
  ) {
    return true
  }

  return sourceName === "dark orange" &&
    pixelCount <= DARK_ORANGE_PIXEL_COUNT_MAX &&
    evidence.backgroundRatio <= DARK_ORANGE_BACKGROUND_REJECTION_RATIO_MAX &&
    evidence.dominantCoverage <= DARK_ORANGE_DOMINANT_COVERAGE_MAX &&
    evidence.edgeRatio >= DARK_ORANGE_EDGE_REJECTION_RATIO_MIN &&
    evidence.mutedWarmCoverage >= DARK_ORANGE_MUTED_WARM_COVERAGE_MIN
    || sourceName === "trans-orange" &&
    pixelCount >= TRANS_ORANGE_PIXEL_COUNT_MIN &&
    pixelCount <= TRANS_ORANGE_PIXEL_COUNT_MAX &&
    evidence.backgroundRatio >= TRANS_ORANGE_BACKGROUND_REJECTION_RATIO_MIN &&
    evidence.backgroundRatio <= TRANS_ORANGE_BACKGROUND_REJECTION_RATIO_MAX &&
    evidence.darkCoverage <= TRANS_ORANGE_DARK_COVERAGE_MAX &&
    evidence.edgeRatio >= TRANS_ORANGE_EDGE_REJECTION_RATIO_MIN &&
    evidence.mutedWarmCoverage >= TRANS_ORANGE_MUTED_WARM_COVERAGE_MIN &&
    evidence.orangeEdgeCoverage >= TRANS_ORANGE_EDGE_ORANGE_COVERAGE_MIN &&
    evidence.saturatedWarmCoverage <= TRANS_ORANGE_SATURATED_WARM_COVERAGE_MAX
}

function isMutedWarmChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.h >= 38 &&
    lch.h <= 82 &&
    lch.c >= 18 &&
    lch.c <= 55 &&
    lch.l >= 30 &&
    lch.l <= 78
}

function isSaturatedWarmChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.h >= 28 &&
    lch.h <= 72 &&
    lch.c > 55 &&
    lch.l >= 35
}

function isOrangeChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.h >= 35 &&
    lch.h <= 80 &&
    lch.c >= 18
}

function isDarkChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) <= 50
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
