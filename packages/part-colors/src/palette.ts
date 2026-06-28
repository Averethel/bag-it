import type {
  DetectedFallbackColor,
  DetectedPartColorStatus,
  FallbackLegoColor,
  LegoColorRarityTier,
  RgbColor,
} from "./contracts"
import { colorDistanceCiede2000, rgbToHex } from "./color-space"

export const FALLBACK_LEGO_PALETTE: FallbackLegoColor[] = [
  color("Black", "#1b1c1e", "black", "common"),
  color("Dark Bluish Gray", "#6c6e68", "gray", "common"),
  color("Light Bluish Gray", "#a0a5a9", "gray", "common"),
  color("White", "#ffffff", "white", "common"),
  color("Flat Silver", "#898788", "gray", "uncommon"),
  color("Red", "#c91a09", "red", "common"),
  color("Dark Red", "#720e0f", "red", "common"),
  color("Blue", "#0055bf", "blue", "common"),
  color("Dark Blue", "#0a3463", "blue", "common"),
  color("Medium Blue", "#5a93db", "blue", "common"),
  color("Dark Azure", "#078bc9", "blue", "common"),
  color("Bright Light Blue", "#9fc3e9", "blue", "common"),
  color("Sand Blue", "#6074a1", "blue", "common"),
  color("Yellow", "#f2cd37", "yellow", "common"),
  color("Bright Light Yellow", "#fff03a", "yellow", "common"),
  color("Lime", "#bbd500", "green", "common"),
  color("Green", "#237841", "green", "common"),
  color("Bright Green", "#4b9f4a", "green", "common"),
  color("Dark Green", "#184632", "green", "common"),
  color("Olive Green", "#9b9a5a", "green", "common"),
  color("Reddish Brown", "#582a12", "brown", "common"),
  color("Dark Brown", "#352100", "brown", "common"),
  color("Tan", "#dec69c", "tan", "common"),
  color("Dark Tan", "#958a73", "tan", "common"),
  color("Light Nougat", "#f6d7b3", "tan", "common"),
  color("Medium Nougat", "#aa7d55", "tan", "common"),
  color("Orange", "#fe8a18", "orange", "common"),
  color("Trans-Orange", "#f08f1c", "orange", "uncommon"),
  color("Dark Orange", "#a95500", "orange", "common"),
  color("Dark Pink", "#c870a0", "pink", "common"),
  color("Bright Pink", "#e4adc8", "pink", "common"),
  color("Magenta", "#923978", "purple", "uncommon"),
  color("Lavender", "#cda4de", "purple", "common"),
  color("Medium Lavender", "#ac78ba", "purple", "common"),
  color("Dark Purple", "#3f3691", "purple", "uncommon"),
  color("Teal", "#008f9b", "green", "common"),
  color("Sand Green", "#708e7c", "green", "common"),
  color("Pearl Gold", "#aa7f2e", "yellow", "uncommon"),
]

export function detectFallbackLegoColor(
  rgb: RgbColor,
  options: { includeRare?: boolean } = {},
): DetectedFallbackColor {
  const ranked = rankFallbackColors(rgb, options)
  const best = ranked[0]
  const second = ranked[1]

  if (!best) {
    throw new Error("Fallback LEGO palette must contain at least one usable color.")
  }

  const margin = second ? second.distance - best.distance : 34
  const confidence = readPaletteConfidence(best.candidate, best.distance, margin)

  return {
    ...best.candidate,
    alternatives: ranked.slice(1, 3).map((entry) => entry.candidate.name),
    confidence,
    distance: best.distance,
    observedHex: rgbToHex(rgb),
    observedRgb: rgb,
    status: classifyColorStatus(best.distance, margin, confidence),
    swatchHex: best.candidate.hex,
  }
}

function rankFallbackColors(rgb: RgbColor, options: { includeRare?: boolean }) {
  return FALLBACK_LEGO_PALETTE
    .filter((candidate) => options.includeRare || (candidate.rarityTier !== "rare" && candidate.rarityTier !== "special"))
    .map((candidate) => ({
      candidate,
      distance: colorDistanceCiede2000(rgb, candidate.rgb),
    }))
    .sort((left, right) => left.distance - right.distance)
}

function readPaletteConfidence(candidate: FallbackLegoColor, distance: number, margin: number): number {
  const distanceConfidence = clamp(1 - distance / 34)
  const marginConfidence = clamp(margin / 12)
  const rarityPenalty = candidate.rarityTier === "uncommon" ? 0.06 : 0

  return clamp(distanceConfidence * 0.78 + marginConfidence * 0.22 - rarityPenalty)
}

function color(
  name: string,
  hex: string,
  family: string,
  rarityTier: LegoColorRarityTier,
): FallbackLegoColor {
  return {
    family,
    hex,
    name,
    rarityTier,
    rgb: hexToRgb(hex),
  }
}

function hexToRgb(hex: string): RgbColor {
  const normalized = hex.replace("#", "")

  return {
    b: Number.parseInt(normalized.slice(4, 6), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    r: Number.parseInt(normalized.slice(0, 2), 16),
  }
}

function classifyColorStatus(
  distance: number,
  margin: number,
  confidence: number,
): DetectedPartColorStatus {
  if (distance <= 8 && margin >= 2.8 && confidence >= 0.72) {
    return "exact"
  }

  if (distance <= 18 && confidence >= 0.48) {
    return "review"
  }

  return "family"
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}
