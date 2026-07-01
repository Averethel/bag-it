import { colorDistanceCiede2000, rgbToLch } from "../color-space"
import type { PartColorSampleChip, RgbColor } from "../contracts"
import type { PartColorFeature } from "./types"

const BODY_COVERAGE_MIN = 0.64
const CORE_CHIP_COUNT_MIN = 1
const CORE_COVERAGE_MIN = 0.15
const DARK_TAN_CORE_DISTANCE_MAX = 12
const DARK_TAN_ANCHOR_DISTANCE_MAX = 4
const DARK_BROWN_SOURCE_BACKGROUND_RATIO_MAX = 0.16
const DARK_BROWN_SOURCE_BODY_COVERAGE_MIN = 0.47
const DARK_BROWN_SOURCE_CORE_COVERAGE_MIN = 0.3
const DARK_BROWN_SOURCE_LIGHT_TAN_COVERAGE_MAX = 0.05
const DARK_BROWN_SOURCE_PIXEL_COUNT_MIN = 120
const LIGHT_TAN_COVERAGE_MAX = 0.08
const OLIVE_GRAY_COVERAGE_MAX = 0.08
const SATURATED_WARM_COVERAGE_MAX = 0.03

export interface DarkTanBodyEvidence {
  backgroundRatio: number
  bodyCoverage: number
  coreCoverage: number
  coreDistance: number
  lightTanCoverage: number
  oliveGrayCoverage: number
  pixelCount: number
  saturatedWarmCoverage: number
  sourceName: "Dark Bluish Gray" | "Dark Brown"
}

export function readDarkTanBodyEvidence(
  feature: PartColorFeature,
  currentName: string,
  darkTanPaletteRgb: RgbColor | null,
): DarkTanBodyEvidence | null {
  const sourceName = normalizeSourceName(currentName)

  if (!sourceName || !darkTanPaletteRgb) {
    return null
  }

  const coreChips = feature.topChips.filter((chip) => isDarkTanCoreChip(chip, darkTanPaletteRgb))
  const bodyChips = feature.topChips.filter(isDarkTanBodyChip)
  const coreCoverage = sumCoverage(coreChips)
  const bodyCoverage = sumCoverage(bodyChips)
  const saturatedWarmCoverage = sumCoverage(feature.topChips.filter(isSaturatedWarmChip))
  const oliveGrayCoverage = sumCoverage(feature.topChips.filter(isOliveGrayChip))
  const lightTanCoverage = sumCoverage(feature.topChips.filter(isLightTanChip))
  const coreDistance = Math.min(
    ...coreChips.map((chip) => colorDistanceCiede2000(chip.rgb, darkTanPaletteRgb)),
  )
  const totalPixelCount = feature.sample.pixelCount + feature.sample.rejectedPixelCount
  const backgroundRatio = totalPixelCount > 0
    ? feature.sample.rejectionCounts.background / totalPixelCount
    : 0
  const evidence = {
    backgroundRatio,
    bodyCoverage,
    coreCoverage,
    coreDistance,
    lightTanCoverage,
    oliveGrayCoverage,
    pixelCount: feature.sample.pixelCount,
    saturatedWarmCoverage,
    sourceName,
  }

  if (coreChips.length < CORE_CHIP_COUNT_MIN || !hasSourceEvidence(evidence)) {
    return null
  }

  return evidence
}

function hasSourceEvidence(evidence: DarkTanBodyEvidence): boolean {
  if (
    evidence.coreDistance > DARK_TAN_ANCHOR_DISTANCE_MAX ||
    evidence.saturatedWarmCoverage > SATURATED_WARM_COVERAGE_MAX ||
    evidence.oliveGrayCoverage >= OLIVE_GRAY_COVERAGE_MAX ||
    !Number.isFinite(evidence.coreDistance)
  ) {
    return false
  }

  switch (evidence.sourceName) {
    case "Dark Bluish Gray":
      return evidence.coreCoverage >= CORE_COVERAGE_MIN &&
        evidence.bodyCoverage >= BODY_COVERAGE_MIN &&
        evidence.lightTanCoverage < LIGHT_TAN_COVERAGE_MAX
    case "Dark Brown":
      return evidence.pixelCount >= DARK_BROWN_SOURCE_PIXEL_COUNT_MIN &&
        evidence.backgroundRatio <= DARK_BROWN_SOURCE_BACKGROUND_RATIO_MAX &&
        evidence.coreCoverage >= DARK_BROWN_SOURCE_CORE_COVERAGE_MIN &&
        evidence.bodyCoverage >= DARK_BROWN_SOURCE_BODY_COVERAGE_MIN &&
        evidence.lightTanCoverage <= DARK_BROWN_SOURCE_LIGHT_TAN_COVERAGE_MAX
  }
}

function isDarkTanCoreChip(chip: PartColorSampleChip, darkTanPaletteRgb: RgbColor): boolean {
  return isDarkTanBodyChip(chip) &&
    colorDistanceCiede2000(chip.rgb, darkTanPaletteRgb) <= DARK_TAN_CORE_DISTANCE_MAX
}

function isDarkTanBodyChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.l >= 30 &&
    lch.l <= 61 &&
    lch.c >= 8 &&
    lch.c <= 16.5 &&
    lch.h >= 78 &&
    lch.h <= 103
}

function isSaturatedWarmChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.c > 16.5 && lch.h >= 60 && lch.h <= 115
}

function isOliveGrayChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.c >= 8 && lch.h > 103 && lch.h <= 125
}

function isLightTanChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.l >= 62 && lch.c >= 12 && lch.h >= 75 && lch.h <= 105
}

function sumCoverage(chips: readonly PartColorSampleChip[]): number {
  return chips.reduce((total, chip) => total + chip.coverage, 0)
}

function normalizeSourceName(name: string): DarkTanBodyEvidence["sourceName"] | null {
  switch (normalizeName(name)) {
    case "dark bluish gray":
      return "Dark Bluish Gray"
    case "dark brown":
      return "Dark Brown"
    default:
      return null
  }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
