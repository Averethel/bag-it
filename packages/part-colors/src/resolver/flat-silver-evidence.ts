import type { PartColorFeature } from "./types"

const FLAT_SILVER_LUMA_MIN = 48
const FLAT_SILVER_LUMA_MAX = 58
const FLAT_SILVER_CHROMA_MAX = 4
const FLAT_SILVER_WARM_HUE_MAX = 90
const FLAT_SILVER_WARM_HUE_MIN = 330

export function hasFlatSilverEvidence(
  feature: PartColorFeature,
  currentName: string,
): boolean {
  return normalizeName(currentName) === "light bluish gray" &&
    feature.lch.l >= FLAT_SILVER_LUMA_MIN &&
    feature.lch.l <= FLAT_SILVER_LUMA_MAX &&
    feature.lch.c <= FLAT_SILVER_CHROMA_MAX &&
    isWarmNeutralHue(feature.lch.h)
}

function isWarmNeutralHue(hue: number): boolean {
  return hue <= FLAT_SILVER_WARM_HUE_MAX || hue >= FLAT_SILVER_WARM_HUE_MIN
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
