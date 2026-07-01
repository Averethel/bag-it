import { rgbToLch } from "../color-space"
import type { PartColorSampleChip, RgbColor } from "../contracts"
import type { ColorPrototype, PartColorFeature } from "./types"

const BRIGHT_NEUTRAL_BODY_COVERAGE_MIN = 0.18
const BRIGHT_NEUTRAL_BODY_WITH_EDGE_COVERAGE_MIN = 0.10
const BRIGHT_NEUTRAL_CHROMA_MAX = 12
const BRIGHT_NEUTRAL_EDGE_COVERAGE_MIN = 0.22
const BRIGHT_NEUTRAL_LUMA_MAX = 190
const BRIGHT_NEUTRAL_LUMA_MIN = 72
const NEAR_BLACK_COVERAGE_MAX = 0.55
const SHADOW_PROTOTYPE_LUMA_MAX = 36

const BRIGHT_NEUTRAL_NAMES = new Set([
  "flat silver",
  "light bluish gray",
  "metallic silver",
  "pearl silver",
  "silver metallic",
  "white",
])

export function hasBrightNeutralShadowEvidence(feature: PartColorFeature): boolean {
  const bodyCoverage = readBrightNeutralCoverage(feature.topChips)
  const nearBlackCoverage = readNearBlackCoverage(feature.topChips)

  if (nearBlackCoverage > NEAR_BLACK_COVERAGE_MAX) {
    return false
  }

  return bodyCoverage >= BRIGHT_NEUTRAL_BODY_COVERAGE_MIN ||
    (
      bodyCoverage >= BRIGHT_NEUTRAL_BODY_WITH_EDGE_COVERAGE_MIN &&
      readBrightNeutralCoverage(feature.sample.edgeChips ?? []) >= BRIGHT_NEUTRAL_EDGE_COVERAGE_MIN
    )
}

export function isShadowedBrightNeutralPrototype(prototype: ColorPrototype): boolean {
  return BRIGHT_NEUTRAL_NAMES.has(normalizeName(prototype.expectedName)) &&
    colorLuma(prototype.rgb) <= SHADOW_PROTOTYPE_LUMA_MAX
}

function readBrightNeutralCoverage(chips: readonly PartColorSampleChip[]): number {
  return chips
    .filter(isBrightNeutralBodyChip)
    .reduce((total, chip) => total + chip.coverage, 0)
}

function isBrightNeutralBodyChip(chip: PartColorSampleChip): boolean {
  const luma = colorLuma(chip.rgb)

  return luma >= BRIGHT_NEUTRAL_LUMA_MIN &&
    luma <= BRIGHT_NEUTRAL_LUMA_MAX &&
    rgbToLch(chip.rgb).c <= BRIGHT_NEUTRAL_CHROMA_MAX
}

function readNearBlackCoverage(chips: readonly PartColorSampleChip[]): number {
  return chips
    .filter((chip) => colorLuma(chip.rgb) <= SHADOW_PROTOTYPE_LUMA_MAX)
    .reduce((total, chip) => total + chip.coverage, 0)
}

function colorLuma(rgb: RgbColor): number {
  return rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
