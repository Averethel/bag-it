import { rgbToLch } from "../color-space"
import type { PartColorSampleChip } from "../contracts"
import type { PartColorFeature } from "./types"

const BACKGROUND_REJECTION_RATIO_MAX = 0.2
const DARK_BROWN_BACKGROUND_REJECTION_RATIO_MAX = 0.22
const DARK_BROWN_EDGE_REJECTION_RATIO_MIN = 0.35
const DARK_BROWN_PIXEL_COUNT_MAX = 160
const DARK_BROWN_SATURATED_WARM_COVERAGE_MAX = 0.08
const DARK_BROWN_TAN_COVERAGE_MIN = 0.25
const DARK_TAN_BACKGROUND_REJECTION_RATIO_MAX = 0.22
const DARK_TAN_EDGE_REJECTION_RATIO_MIN = 0.35
const DARK_TAN_LIGHT_TAN_COVERAGE_MIN = 0.08
const DARK_TAN_PIXEL_COUNT_MAX = 60
const DARK_TAN_SATURATED_WARM_COVERAGE_MAX = 0.08
const DARK_TAN_TAN_COVERAGE_MIN = 0.25
const EDGE_REJECTION_RATIO_MIN = 0.45
const LIGHT_TAN_COVERAGE_MIN = 0.08
const PIXEL_COUNT_MAX = 600
const SATURATED_WARM_COVERAGE_MAX = 0.08
const TAN_COVERAGE_MIN = 0.6

export interface TanBodyEvidence {
  backgroundRatio: number
  edgeRatio: number
  lightTanCoverage: number
  pixelCount: number
  saturatedWarmCoverage: number
  sourceName: "Dark Bluish Gray" | "Dark Brown" | "Dark Tan"
  tanCoverage: number
}

export function readTanBodyEvidence(
  feature: PartColorFeature,
  currentName: string,
): TanBodyEvidence | null {
  const sourceName = normalizeSourceName(currentName)

  if (!sourceName) {
    return null
  }

  const totalPixelCount = feature.sample.pixelCount + feature.sample.rejectedPixelCount
  const safeTotalPixelCount = Math.max(1, totalPixelCount)
  const bodyChips = sourceName === "Dark Bluish Gray" ? feature.topChips : feature.sample.chips
  const evidence = {
    backgroundRatio: (feature.sample.rejectionCounts.background ?? 0) / safeTotalPixelCount,
    edgeRatio: (feature.sample.rejectionCounts.edge ?? 0) / safeTotalPixelCount,
    lightTanCoverage: sumCoverage(bodyChips.filter(isLightTanChip)),
    pixelCount: feature.sample.pixelCount,
    saturatedWarmCoverage: sumCoverage(bodyChips.filter(isSaturatedWarmChip)),
    sourceName,
    tanCoverage: sumCoverage(bodyChips.filter(isTanChip)),
  }

  if (!hasTanBodyEvidence(evidence)) {
    return null
  }

  return evidence
}

function hasTanBodyEvidence(evidence: TanBodyEvidence): boolean {
  switch (evidence.sourceName) {
    case "Dark Bluish Gray":
      return evidence.pixelCount <= PIXEL_COUNT_MAX &&
        evidence.backgroundRatio <= BACKGROUND_REJECTION_RATIO_MAX &&
        evidence.edgeRatio >= EDGE_REJECTION_RATIO_MIN &&
        evidence.tanCoverage >= TAN_COVERAGE_MIN &&
        evidence.lightTanCoverage >= LIGHT_TAN_COVERAGE_MIN &&
        evidence.saturatedWarmCoverage <= SATURATED_WARM_COVERAGE_MAX
    case "Dark Brown":
      return evidence.pixelCount <= DARK_BROWN_PIXEL_COUNT_MAX &&
        evidence.backgroundRatio <= DARK_BROWN_BACKGROUND_REJECTION_RATIO_MAX &&
        evidence.edgeRatio >= DARK_BROWN_EDGE_REJECTION_RATIO_MIN &&
        evidence.tanCoverage >= DARK_BROWN_TAN_COVERAGE_MIN &&
        evidence.saturatedWarmCoverage <= DARK_BROWN_SATURATED_WARM_COVERAGE_MAX
    case "Dark Tan":
      return evidence.pixelCount <= DARK_TAN_PIXEL_COUNT_MAX &&
        evidence.backgroundRatio <= DARK_TAN_BACKGROUND_REJECTION_RATIO_MAX &&
        evidence.edgeRatio >= DARK_TAN_EDGE_REJECTION_RATIO_MIN &&
        evidence.tanCoverage >= DARK_TAN_TAN_COVERAGE_MIN &&
        evidence.lightTanCoverage >= DARK_TAN_LIGHT_TAN_COVERAGE_MIN &&
        evidence.saturatedWarmCoverage <= DARK_TAN_SATURATED_WARM_COVERAGE_MAX
  }
}

function isTanChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.h >= 75 &&
    lch.h <= 105 &&
    lch.c >= 8 &&
    lch.c <= 28 &&
    lch.l >= 42
}

function isLightTanChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return isTanChip(chip) && lch.l >= 58
}

function isSaturatedWarmChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.h >= 35 &&
    lch.h <= 85 &&
    lch.c > 28
}

function sumCoverage(chips: readonly PartColorSampleChip[]): number {
  return chips.reduce((total, chip) => total + chip.coverage, 0)
}

function normalizeSourceName(name: string): TanBodyEvidence["sourceName"] | null {
  switch (normalizeName(name)) {
    case "dark bluish gray":
      return "Dark Bluish Gray"
    case "dark brown":
      return "Dark Brown"
    case "dark tan":
      return "Dark Tan"
    default:
      return null
  }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
