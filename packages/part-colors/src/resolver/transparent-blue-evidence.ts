import type { PartColorSampleChip, RgbColor } from "../contracts"
import type { ColorPrototype, PartColorFeature } from "./types"

const COOL_GLASS_BODY_COVERAGE_MIN = 0.35
const COOL_GLASS_DOMINANT_COVERAGE_MIN = 0.58
const COOL_GLASS_LIGHT_COVERAGE_MIN = 0.12
const OPAQUE_BLUE_BODY_COVERAGE_MAX = 0.42

const TRANSPARENT_BLUE_NAMES = new Set([
  "trans-blue",
  "trans-light blue",
  "transparent blue",
  "transparent light blue",
])

export function hasTransparentBlueEvidence(feature: PartColorFeature): boolean {
  const coolGlassCoverage = readCoverage(feature.topChips, isCoolGlassBlueChip)
  const lightCoolCoverage = readCoverage(feature.topChips, isLightCoolGlassBlueChip)
  const opaqueBlueCoverage = readCoverage(feature.topChips, isOpaqueBlueBodyChip)

  if (opaqueBlueCoverage > OPAQUE_BLUE_BODY_COVERAGE_MAX) {
    return false
  }

  return coolGlassCoverage >= COOL_GLASS_BODY_COVERAGE_MIN &&
    (
      lightCoolCoverage >= COOL_GLASS_LIGHT_COVERAGE_MIN ||
      feature.sample.dominantCoverage >= COOL_GLASS_DOMINANT_COVERAGE_MIN
    )
}

export function isTransparentBluePrototype(prototype: ColorPrototype): boolean {
  return TRANSPARENT_BLUE_NAMES.has(normalizeName(prototype.expectedName))
}

function isCoolGlassBlueChip(chip: PartColorSampleChip): boolean {
  const saturation = colorSaturation(chip.rgb)
  const luma = colorLuma(chip.rgb)

  return blueBias(chip.rgb) >= 4 &&
    saturation <= 55 &&
    luma >= 55 &&
    luma <= 205
}

function isLightCoolGlassBlueChip(chip: PartColorSampleChip): boolean {
  const saturation = colorSaturation(chip.rgb)
  const luma = colorLuma(chip.rgb)

  return blueBias(chip.rgb) >= 2 &&
    saturation <= 42 &&
    luma >= 170 &&
    luma <= 218
}

function isOpaqueBlueBodyChip(chip: PartColorSampleChip): boolean {
  const saturation = colorSaturation(chip.rgb)
  const luma = colorLuma(chip.rgb)

  return blueBias(chip.rgb) >= 15 &&
    saturation >= 45 &&
    luma >= 72 &&
    luma <= 190
}

function readCoverage(
  chips: readonly PartColorSampleChip[],
  predicate: (chip: PartColorSampleChip) => boolean,
): number {
  return chips
    .filter(predicate)
    .reduce((total, chip) => total + chip.coverage, 0)
}

function blueBias(rgb: RgbColor): number {
  return rgb.b - Math.max(rgb.r, rgb.g)
}

function colorSaturation(rgb: RgbColor): number {
  return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b)
}

function colorLuma(rgb: RgbColor): number {
  return rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
