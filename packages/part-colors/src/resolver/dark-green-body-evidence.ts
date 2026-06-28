import { colorDistanceCiede2000, rgbToLch } from "../color-space"
import type { PartColorSampleChip, RgbColor } from "../contracts"
import type { PartColorFeature } from "./types"

const BRIGHT_GREEN_COVERAGE_MAX = 0.1
const DARK_GREEN_CHROMA_MIN = 14
const DARK_GREEN_EDGE_COVERAGE_MIN = 0.3
const DARK_GREEN_HUE_MAX = 170
const DARK_GREEN_HUE_MIN = 100
const DARK_GREEN_LUMA_MAX = 72
const DARK_GREEN_TOTAL_COVERAGE_MIN = 0.8
const GREEN_LUMA_MIN = 35

export interface DarkGreenBodyEvidence {
  brightGreenCoverage: number
  darkGreenCoverage: number
  darkGreenEdgeCoverage: number
  distance: number
}

export function readDarkGreenBodyEvidence(
  feature: PartColorFeature,
  currentName: string,
  darkGreenPaletteRgb: RgbColor | null,
): DarkGreenBodyEvidence | null {
  if (normalizeName(currentName) !== "green") {
    return null
  }

  const darkGreenChips = feature.sample.chips.filter(isDarkGreenChip)
  const brightGreenChips = feature.sample.chips.filter(isBrightGreenChip)
  const darkGreenEdgeChips = (feature.sample.edgeChips ?? []).filter(isDarkGreenChip)
  const darkGreenCoverage = sumCoverage(darkGreenChips)
  const brightGreenCoverage = sumCoverage(brightGreenChips)
  const darkGreenEdgeCoverage = sumCoverage(darkGreenEdgeChips)

  if (
    darkGreenCoverage < DARK_GREEN_TOTAL_COVERAGE_MIN ||
    brightGreenCoverage > BRIGHT_GREEN_COVERAGE_MAX ||
    darkGreenEdgeCoverage < DARK_GREEN_EDGE_COVERAGE_MIN
  ) {
    return null
  }

  return {
    brightGreenCoverage,
    darkGreenCoverage,
    darkGreenEdgeCoverage,
    distance: darkGreenPaletteRgb ? colorDistanceCiede2000(feature.rgb, darkGreenPaletteRgb) : 0,
  }
}

function isDarkGreenChip(chip: PartColorSampleChip): boolean {
  return isGreenChip(chip) && colorLuma(chip.rgb) <= DARK_GREEN_LUMA_MAX
}

function isBrightGreenChip(chip: PartColorSampleChip): boolean {
  return isGreenChip(chip) && colorLuma(chip.rgb) > DARK_GREEN_LUMA_MAX
}

function isGreenChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)
  const luma = colorLuma(chip.rgb)

  return luma >= GREEN_LUMA_MIN &&
    lch.c >= DARK_GREEN_CHROMA_MIN &&
    lch.h >= DARK_GREEN_HUE_MIN &&
    lch.h <= DARK_GREEN_HUE_MAX
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
