import { rgbToLch } from "../color-space"
import type { PartColorSampleChip } from "../contracts"
import type { PartColorFeature } from "./types"

const BACKGROUND_RATIO_MIN = 0.12
const BRIGHT_GREEN_COVERAGE_MIN = 0.35
const DARK_GREEN_COVERAGE_MAX = 0.5
const EDGE_RATIO_MIN = 0.58
const PIXEL_COUNT_MAX = 50

export interface BrightGreenEvidence {
  backgroundRatio: number
  brightGreenCoverage: number
  darkGreenCoverage: number
  edgeRatio: number
  pixelCount: number
  sourceName: "Green"
}

export function readBrightGreenEvidence(
  feature: PartColorFeature,
  currentName: string,
): BrightGreenEvidence | null {
  if (normalizeName(currentName) !== "green") {
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
  const evidence: BrightGreenEvidence = {
    backgroundRatio,
    brightGreenCoverage: sumCoverage(feature.sample.chips.filter(isBrightGreenChip)),
    darkGreenCoverage: sumCoverage(feature.sample.chips.filter(isDarkGreenChip)),
    edgeRatio,
    pixelCount: feature.sample.pixelCount,
    sourceName: "Green",
  }

  return hasBrightGreenEvidence(evidence) ? evidence : null
}

function hasBrightGreenEvidence(evidence: BrightGreenEvidence): boolean {
  return evidence.pixelCount <= PIXEL_COUNT_MAX &&
    evidence.backgroundRatio >= BACKGROUND_RATIO_MIN &&
    evidence.edgeRatio >= EDGE_RATIO_MIN &&
    evidence.brightGreenCoverage >= BRIGHT_GREEN_COVERAGE_MIN &&
    evidence.darkGreenCoverage <= DARK_GREEN_COVERAGE_MAX
}

function isBrightGreenChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return isGreenChip(chip) &&
    lch.l >= 38 &&
    lch.c >= 25
}

function isDarkGreenChip(chip: PartColorSampleChip): boolean {
  return isGreenChip(chip) && rgbToLch(chip.rgb).l <= 34
}

function isGreenChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.h >= 125 &&
    lch.h <= 170 &&
    lch.c >= 10
}

function sumCoverage(chips: readonly PartColorSampleChip[]): number {
  return chips.reduce((total, chip) => total + chip.coverage, 0)
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
