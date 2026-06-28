import { rgbToLch } from "../color-space"
import type { PartColorSample, PartColorSampleChip, RgbColor } from "../contracts"

const DARK_SUPPORT_LUMA_MAX = 72
const DOMINANT_NEUTRAL_BODY_COVERAGE_MIN = 0.34
const DOMINANT_NEUTRAL_NEAR_BLACK_COVERAGE_MAX = 0.38
const NEAR_BLACK_BLUE_BIAS_MIN = 7
const NEAR_BLACK_LUMA_MAX = 36
const NEUTRAL_BODY_CHROMA_MAX = 12
const NEUTRAL_BODY_COVERAGE_MIN = 0.24
const NEUTRAL_BODY_DARK_LUMA_MIN = 54
const NEUTRAL_BODY_LUMA_MAX = 190
const NEUTRAL_BODY_MARGIN_MIN = 0.06
const STRONG_NEAR_BLACK_COVERAGE_MIN = 0.12
const WARM_BODY_CHROMA_MIN = 14
const WARM_BODY_COVERAGE_MIN = 0.34
const WARM_BODY_LUMA_MAX = 78
const WARM_BODY_LUMA_MIN = 28
const WARM_BODY_MARGIN_MIN = 0.16
const WARM_BODY_SINGLE_CHIP_COVERAGE_MIN = 0.36

export interface RepresentativeColor {
  rgb: RgbColor
  source: "neutral-body-chip" | "sample" | "warm-body-chip"
}

export function selectRepresentativeSampleColor(sample: PartColorSample): RepresentativeColor {
  if (colorLuma(sample.rgb) > NEAR_BLACK_LUMA_MAX) {
    return { rgb: sample.rgb, source: "sample" }
  }

  const warmBodyChip = selectWarmBodyChip(sample.chips)

  if (warmBodyChip && hasStrongWarmBodyEvidence(sample.chips)) {
    return { rgb: warmBodyChip.rgb, source: "warm-body-chip" }
  }

  const bodyChip = selectNeutralBodyChip(sample.chips)

  if (!bodyChip || hasStrongBlueBiasedNearBlack(sample.chips)) {
    return { rgb: sample.rgb, source: "sample" }
  }

  const nearBlackCoverage = readCoverageAtOrBelowLuma(sample.chips, NEAR_BLACK_LUMA_MAX)

  if (hasDominantNeutralBodyEvidence(bodyChip, nearBlackCoverage)) {
    return { rgb: bodyChip.rgb, source: "neutral-body-chip" }
  }

  const neutralBodyCoverage = readNeutralBodyCoverage(sample.chips)
  const darkSupportCoverage = readCoverageAtOrBelowLuma(sample.chips, DARK_SUPPORT_LUMA_MAX)

  if (
    neutralBodyCoverage < NEUTRAL_BODY_COVERAGE_MIN ||
    neutralBodyCoverage < nearBlackCoverage + NEUTRAL_BODY_MARGIN_MIN ||
    neutralBodyCoverage < darkSupportCoverage
  ) {
    return { rgb: sample.rgb, source: "sample" }
  }

  return { rgb: bodyChip.rgb, source: "neutral-body-chip" }
}

function selectWarmBodyChip(chips: readonly PartColorSampleChip[]): PartColorSampleChip | null {
  return chips
    .filter(isWarmBodyChip)
    .sort(compareWarmBodyPriority)[0] ?? null
}

function isWarmBodyChip(chip: PartColorSampleChip): boolean {
  const luma = colorLuma(chip.rgb)
  const lch = rgbToLch(chip.rgb)

  return luma >= WARM_BODY_LUMA_MIN &&
    luma <= WARM_BODY_LUMA_MAX &&
    lch.c >= WARM_BODY_CHROMA_MIN &&
    (isWarmHue(lch.h) || isTanGoldHue(lch.h))
}

function compareWarmBodyPriority(left: PartColorSampleChip, right: PartColorSampleChip): number {
  return right.coverage - left.coverage ||
    colorLuma(right.rgb) - colorLuma(left.rgb)
}

function hasStrongWarmBodyEvidence(chips: readonly PartColorSampleChip[]): boolean {
  const warmBodyChip = selectWarmBodyChip(chips)
  const warmBodyCoverage = readWarmBodyCoverage(chips)
  const nearBlackCoverage = readCoverageAtOrBelowLuma(chips, NEAR_BLACK_LUMA_MAX)

  return warmBodyCoverage >= WARM_BODY_COVERAGE_MIN &&
    (
      warmBodyCoverage >= nearBlackCoverage + WARM_BODY_MARGIN_MIN ||
      (warmBodyChip?.coverage ?? 0) >= WARM_BODY_SINGLE_CHIP_COVERAGE_MIN
    )
}

function readWarmBodyCoverage(chips: readonly PartColorSampleChip[]): number {
  return chips
    .filter(isWarmBodyChip)
    .reduce((total, chip) => total + chip.coverage, 0)
}

function selectNeutralBodyChip(chips: readonly PartColorSampleChip[]): PartColorSampleChip | null {
  return chips
    .filter(isNeutralBodyChip)
    .sort(compareNeutralBodyPriority)[0] ?? null
}

function isNeutralBodyChip(chip: PartColorSampleChip): boolean {
  const luma = colorLuma(chip.rgb)

  return luma >= NEUTRAL_BODY_DARK_LUMA_MIN &&
    luma <= NEUTRAL_BODY_LUMA_MAX &&
    rgbToLch(chip.rgb).c <= NEUTRAL_BODY_CHROMA_MAX
}

function compareNeutralBodyPriority(left: PartColorSampleChip, right: PartColorSampleChip): number {
  const leftLuma = colorLuma(left.rgb)
  const rightLuma = colorLuma(right.rgb)

  return right.coverage * rightLuma * rightLuma - left.coverage * leftLuma * leftLuma ||
    right.coverage - left.coverage
}

function readNeutralBodyCoverage(chips: readonly PartColorSampleChip[]): number {
  return chips
    .filter(isNeutralBodyChip)
    .reduce((total, chip) => total + chip.coverage, 0)
}

function hasDominantNeutralBodyEvidence(
  bodyChip: PartColorSampleChip,
  nearBlackCoverage: number,
): boolean {
  return bodyChip.coverage >= DOMINANT_NEUTRAL_BODY_COVERAGE_MIN &&
    nearBlackCoverage <= DOMINANT_NEUTRAL_NEAR_BLACK_COVERAGE_MAX
}

function readCoverageAtOrBelowLuma(chips: readonly PartColorSampleChip[], maxLuma: number): number {
  return chips
    .filter((chip) => colorLuma(chip.rgb) <= maxLuma)
    .reduce((total, chip) => total + chip.coverage, 0)
}

function hasStrongBlueBiasedNearBlack(chips: readonly PartColorSampleChip[]): boolean {
  return chips.some((chip) =>
    chip.coverage >= STRONG_NEAR_BLACK_COVERAGE_MIN &&
    colorLuma(chip.rgb) <= NEAR_BLACK_LUMA_MAX &&
    chip.rgb.b - chip.rgb.r >= NEAR_BLACK_BLUE_BIAS_MIN
  )
}

function isWarmHue(hue: number): boolean {
  return hue < 40 || hue >= 330
}

function isTanGoldHue(hue: number): boolean {
  return hue >= 40 && hue < 105
}

function colorLuma(rgb: RgbColor): number {
  return rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722
}
