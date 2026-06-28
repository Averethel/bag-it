import { colorDistanceCiede2000, rgbToLch } from "../color-space"
import type { PartColorSampleChip, RgbColor } from "../contracts"
import type { PartColorFeature } from "./types"

const GREEN_BODY_CHROMA_MIN = 16
const GREEN_BODY_COVERAGE_MIN = 0.15
const GREEN_BODY_HUE_MAX = 165
const GREEN_BODY_HUE_MIN = 120
const GREEN_BODY_LUMA_MAX = 48
const GREEN_BODY_TOTAL_COVERAGE_MIN = 0.3
const NEAR_BLACK_LUMA_MAX = 36
const NEAR_BLACK_MARGIN = -0.06

export interface GreenBodyEvidence {
  chip: PartColorSampleChip
  distance: number
  greenCoverage: number
  nearBlackCoverage: number
}

export function readGreenBodyEvidence(
  feature: PartColorFeature,
  currentName: string,
  greenPaletteRgb: RgbColor | null,
): GreenBodyEvidence | null {
  if (normalizeName(currentName) !== "black" || colorLuma(feature.rgb) > NEAR_BLACK_LUMA_MAX) {
    return null
  }

  const greenChips = feature.topChips.filter(isGreenBodyChip)
  const chip = greenChips.sort(compareGreenBodyPriority)[0]

  if (!chip || chip.coverage < GREEN_BODY_COVERAGE_MIN) {
    return null
  }

  const greenCoverage = sumCoverage(greenChips)
  const nearBlackCoverage = sumCoverage(feature.topChips.filter(isNearBlackChip))

  if (
    greenCoverage < GREEN_BODY_TOTAL_COVERAGE_MIN ||
    greenCoverage < nearBlackCoverage + NEAR_BLACK_MARGIN
  ) {
    return null
  }

  return {
    chip,
    distance: greenPaletteRgb ? colorDistanceCiede2000(chip.rgb, greenPaletteRgb) : 0,
    greenCoverage,
    nearBlackCoverage,
  }
}

function isGreenBodyChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.l <= GREEN_BODY_LUMA_MAX &&
    lch.c >= GREEN_BODY_CHROMA_MIN &&
    lch.h >= GREEN_BODY_HUE_MIN &&
    lch.h <= GREEN_BODY_HUE_MAX
}

function compareGreenBodyPriority(left: PartColorSampleChip, right: PartColorSampleChip): number {
  return right.coverage - left.coverage ||
    colorLuma(right.rgb) - colorLuma(left.rgb)
}

function isNearBlackChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) <= NEAR_BLACK_LUMA_MAX
}

function sumCoverage(chips: readonly PartColorSampleChip[]): number {
  return chips.reduce((total, chip) => total + chip.coverage, 0)
}

function colorLuma(rgb: RgbColor): number {
  return rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
