import { rgbToLch } from "../color-space"
import type { PartColorSampleChip } from "../contracts"
import type { PartColorFeature } from "./types"

const DARK_BROWN_BRIGHT_GOLD_COVERAGE_MIN = 0.08
const DARK_BROWN_DARK_COVERAGE_MAX = 0.45
const DARK_BROWN_GOLD_COVERAGE_MIN = 0.18
const DARK_BROWN_RED_COVERAGE_MAX = 0.12

const DARK_ORANGE_BRIGHT_GOLD_COVERAGE_MIN = 0.2
const DARK_ORANGE_DARK_COVERAGE_MAX = 0.2
const DARK_ORANGE_GOLD_COVERAGE_MIN = 0.46
const DARK_ORANGE_RED_COVERAGE_MAX = 0.06
const REDDISH_BROWN_BRIGHT_GOLD_COVERAGE_MIN = 0.25
const REDDISH_BROWN_DARK_COVERAGE_MAX = 0.45
const REDDISH_BROWN_GOLD_COVERAGE_MIN = 0.25
const REDDISH_BROWN_RED_COVERAGE_MAX = 0.12

export interface PearlGoldBodyEvidence {
  brightGoldCoverage: number
  darkCoverage: number
  goldCoverage: number
  redCoverage: number
  sourceName: "Dark Brown" | "Dark Orange" | "Reddish Brown"
}

export function readPearlGoldBodyEvidence(
  feature: PartColorFeature,
  currentName: string,
): PearlGoldBodyEvidence | null {
  const sourceName = normalizeSourceName(currentName)

  if (!sourceName) {
    return null
  }

  const goldCoverage = sumCoverage(feature.sample.chips.filter(isGoldChip))
  const brightGoldCoverage = sumCoverage(feature.sample.chips.filter(isBrightGoldChip))
  const darkCoverage = sumCoverage(feature.sample.chips.filter(isDarkChip))
  const redCoverage = sumCoverage(feature.sample.chips.filter(isRedChip))

  if (!hasSourceEvidence(sourceName, {
    brightGoldCoverage,
    darkCoverage,
    goldCoverage,
    redCoverage,
  })) {
    return null
  }

  return {
    brightGoldCoverage,
    darkCoverage,
    goldCoverage,
    redCoverage,
    sourceName,
  }
}

function hasSourceEvidence(
  sourceName: PearlGoldBodyEvidence["sourceName"],
  evidence: Omit<PearlGoldBodyEvidence, "sourceName">,
): boolean {
  switch (sourceName) {
    case "Dark Brown":
      return evidence.goldCoverage >= DARK_BROWN_GOLD_COVERAGE_MIN &&
        evidence.brightGoldCoverage >= DARK_BROWN_BRIGHT_GOLD_COVERAGE_MIN &&
        evidence.darkCoverage <= DARK_BROWN_DARK_COVERAGE_MAX &&
        evidence.redCoverage <= DARK_BROWN_RED_COVERAGE_MAX
    case "Dark Orange":
      return evidence.goldCoverage >= DARK_ORANGE_GOLD_COVERAGE_MIN &&
        evidence.brightGoldCoverage >= DARK_ORANGE_BRIGHT_GOLD_COVERAGE_MIN &&
        evidence.darkCoverage <= DARK_ORANGE_DARK_COVERAGE_MAX &&
        evidence.redCoverage <= DARK_ORANGE_RED_COVERAGE_MAX
    case "Reddish Brown":
      return evidence.goldCoverage >= REDDISH_BROWN_GOLD_COVERAGE_MIN &&
        evidence.brightGoldCoverage >= REDDISH_BROWN_BRIGHT_GOLD_COVERAGE_MIN &&
        evidence.darkCoverage <= REDDISH_BROWN_DARK_COVERAGE_MAX &&
        evidence.redCoverage <= REDDISH_BROWN_RED_COVERAGE_MAX
  }
}

function isGoldChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.h >= 68 &&
    lch.h <= 98 &&
    lch.c >= 18 &&
    lch.l >= 32 &&
    lch.l <= 72
}

function isBrightGoldChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return isGoldChip(chip) && lch.l >= 45 && lch.c >= 24
}

function isDarkChip(chip: PartColorSampleChip): boolean {
  return colorLuma(chip.rgb) <= 50
}

function isRedChip(chip: PartColorSampleChip): boolean {
  const lch = rgbToLch(chip.rgb)

  return lch.h >= 15 && lch.h <= 45 && lch.c >= 22
}

function colorLuma(rgb: { b: number, g: number, r: number }): number {
  return rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722
}

function sumCoverage(chips: readonly PartColorSampleChip[]): number {
  return chips.reduce((total, chip) => total + chip.coverage, 0)
}

function normalizeSourceName(name: string): PearlGoldBodyEvidence["sourceName"] | null {
  switch (normalizeName(name)) {
    case "dark brown":
      return "Dark Brown"
    case "dark orange":
      return "Dark Orange"
    case "reddish brown":
      return "Reddish Brown"
    default:
      return null
  }
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
