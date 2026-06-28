import { REBRICKABLE_LEGO_COLOR_CATALOG } from "@/features/steps/fallback-lego-palette"

const LEGO_CATALOG_COLOR_HEX_BY_NAME = new Map(
  REBRICKABLE_LEGO_COLOR_CATALOG.map((color) => [
    normalizeLegoColorName(color.name),
    color.hex,
  ]),
)

export function displayColorSwatchHex(colorName: string, fallbackHex: string | null) {
  return LEGO_CATALOG_COLOR_HEX_BY_NAME.get(normalizeLegoColorName(colorName)) ?? fallbackHex
}

function normalizeLegoColorName(colorName: string) {
  return colorName.trim().toLowerCase().replace(/\s+/g, " ")
}

export function colorConfidenceLabel(confidence: number | null) {
  return confidence === null ? "confidence n/a" : `${Math.round(confidence * 100)}% confidence`
}

export function confidenceBadgePalette(confidence: number | null) {
  if (confidence === null) {
    return "gray"
  }

  if (confidence >= 0.72) {
    return "green"
  }

  if (confidence >= 0.48) {
    return "orange"
  }

  return "red"
}
