import { rgbToLch } from "../color-space"
import type { PartColorSampleChip } from "../contracts"
import type { PartColorFeature } from "./types"

const BACKGROUND_REJECTION_RATIO_MAX = 0.18
const BRIGHT_RED_COVERAGE_MIN = 0.25
const DARK_RED_COVERAGE_MAX = 0.7
const EDGE_RED_COVERAGE_MIN = 0.55
const EDGE_REJECTION_RATIO_MIN = 0.4
const LOW_NEAR_BLACK_BACKGROUND_REJECTION_RATIO_MAX = 0.3
const LOW_NEAR_BLACK_BRIGHT_RED_COVERAGE_MIN = 0.1
const LOW_NEAR_BLACK_DARK_RED_COVERAGE_MAX = 0.8
const LOW_NEAR_BLACK_EDGE_RED_COVERAGE_MIN = 0.5
const LOW_NEAR_BLACK_MAX = 0.05
const LOW_NEAR_BLACK_PIXEL_COUNT_MIN = 120
const LOW_NEAR_BLACK_RED_BODY_COVERAGE_MIN = 0.5
const NEAR_BLACK_LUMA_MAX = 36
const PIXEL_COUNT_MIN = 160
const RED_BODY_COVERAGE_MIN = 0.7

export interface RedBodyEvidence {
  backgroundRatio: number
  brightRedCoverage: number
  darkRedCoverage: number
  edgeRatio: number
  edgeRedCoverage: number
  nearBlackCoverage: number
  pixelCount: number
  redBodyCoverage: number
}

export function readRedBodyEvidence(
  feature: PartColorFeature,
  currentName: string,
): RedBodyEvidence | null {
  if (normalizeName(currentName) !== "dark red") {
    return null
  }

  const totalPixelCount = feature.sample.pixelCount + feature.sample.rejectedPixelCount
  const safeTotalPixelCount = Math.max(1, totalPixelCount)
  const backgroundRatio = (feature.sample.rejectionCounts.background ?? 0) / safeTotalPixelCount
  const edgeRatio = (feature.sample.rejectionCounts.edge ?? 0) / safeTotalPixelCount
  const redBodyCoverage = sumCoverage(feature.sample.chips.filter(isRedBodyChip))
  const brightRedCoverage = sumCoverage(feature.sample.chips.filter(isBrightRedChip))
  const darkRedCoverage = sumCoverage(feature.sample.chips.filter(isDarkRedChip))
  const edgeRedCoverage = sumCoverage((feature.sample.edgeChips ?? []).filter(isRedBodyChip))
  const nearBlackCoverage = sumCoverage(feature.sample.chips.filter(isNearBlackChip))
  const evidence = {
    backgroundRatio,
    brightRedCoverage,
    darkRedCoverage,
    edgeRatio,
    edgeRedCoverage,
    nearBlackCoverage,
    pixelCount: feature.sample.pixelCount,
    redBodyCoverage,
  }

  return hasRedBodyEvidence(evidence) ? evidence : null
}

function hasRedBodyEvidence(evidence: RedBodyEvidence): boolean {
  return hasStrongRedBodyEvidence(evidence) || hasLowNearBlackShadowRedEvidence(evidence)
}

function hasStrongRedBodyEvidence(evidence: RedBodyEvidence): boolean {
  return evidence.pixelCount >= PIXEL_COUNT_MIN &&
    evidence.backgroundRatio <= BACKGROUND_REJECTION_RATIO_MAX &&
    evidence.edgeRatio >= EDGE_REJECTION_RATIO_MIN &&
    evidence.redBodyCoverage >= RED_BODY_COVERAGE_MIN &&
    evidence.brightRedCoverage >= BRIGHT_RED_COVERAGE_MIN &&
    evidence.darkRedCoverage <= DARK_RED_COVERAGE_MAX &&
    evidence.edgeRedCoverage >= EDGE_RED_COVERAGE_MIN
}

function hasLowNearBlackShadowRedEvidence(evidence: RedBodyEvidence): boolean {
  return evidence.pixelCount >= LOW_NEAR_BLACK_PIXEL_COUNT_MIN &&
    evidence.backgroundRatio <= LOW_NEAR_BLACK_BACKGROUND_REJECTION_RATIO_MAX &&
    evidence.edgeRatio >= EDGE_REJECTION_RATIO_MIN &&
    evidence.redBodyCoverage >= LOW_NEAR_BLACK_RED_BODY_COVERAGE_MIN &&
    evidence.brightRedCoverage >= LOW_NEAR_BLACK_BRIGHT_RED_COVERAGE_MIN &&
    evidence.darkRedCoverage <= LOW_NEAR_BLACK_DARK_RED_COVERAGE_MAX &&
    evidence.edgeRedCoverage >= LOW_NEAR_BLACK_EDGE_RED_COVERAGE_MIN &&
    evidence.nearBlackCoverage <= LOW_NEAR_BLACK_MAX
}

function isRedBodyChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.h >= 20 &&
    lch.h <= 45 &&
    lch.c >= 35 &&
    lch.l >= 25 &&
    lch.l <= 55
}

function isBrightRedChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.h >= 30 &&
    lch.h <= 48 &&
    lch.c >= 50 &&
    lch.l >= 38
}

function isDarkRedChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.h >= 15 &&
    lch.h <= 45 &&
    lch.c >= 25 &&
    lch.l < 38
}

function isNearBlackChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) <= NEAR_BLACK_LUMA_MAX
}

function sumCoverage(chips: readonly PartColorSampleChip[]): number {
  return chips.reduce((total, chip) => total + chip.coverage, 0)
}

function colorLuma(rgb: PartColorSampleChip["rgb"]): number {
  return rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
