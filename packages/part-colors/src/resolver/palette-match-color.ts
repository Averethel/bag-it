import { colorDistanceCiede2000 } from "../color-space"
import type {
  DetectedFallbackColor,
  FallbackLegoColor,
} from "../contracts"
import { FALLBACK_LEGO_PALETTE } from "../palette"
import type { PartColorFeature } from "./types"

export interface PaletteOverrideDetectedColorInput {
  confidence: number
  currentColor: DetectedFallbackColor
  distance?: number
  feature: PartColorFeature
  targetName: string
}

export function createPaletteOverrideDetectedColor({
  confidence,
  currentColor,
  distance,
  feature,
  targetName,
}: PaletteOverrideDetectedColorInput): DetectedFallbackColor {
  const paletteColor = findPaletteColorByName(targetName)

  return {
    ...(paletteColor ?? currentColor),
    alternatives: readPaletteOverrideAlternatives(currentColor, targetName),
    confidence: Math.min(
      currentColor.confidence,
      feature.quality.confidence,
      clamp(confidence),
    ),
    distance: distance ?? readPaletteDistance(feature, currentColor, paletteColor),
    name: targetName,
    observedHex: feature.hex,
    observedRgb: feature.rgb,
    status: "review",
    swatchHex: paletteColor?.hex ?? currentColor.swatchHex,
  }
}

export function findPaletteColorByName(name: string): FallbackLegoColor | undefined {
  const key = normalizeName(name)

  return FALLBACK_LEGO_PALETTE.find((color) => normalizeName(color.name) === key)
}

export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const name of names) {
    const key = normalizeName(name)

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(name)
  }

  return result
}

export function roundScore(value: number): number {
  if (!Number.isFinite(value)) {
    return value
  }

  return Math.round(value * 1_000_000) / 1_000_000
}

export function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

export function paletteSourceId(name: string): string {
  return `palette-${normalizeName(name).replaceAll(" ", "-")}`
}

function readPaletteOverrideAlternatives(
  currentColor: DetectedFallbackColor,
  targetName: string,
): string[] {
  const targetKey = normalizeName(targetName)

  return uniqueNames([
    currentColor.name,
    ...currentColor.alternatives,
  ]).filter((name) => normalizeName(name) !== targetKey).slice(0, 3)
}

function readPaletteDistance(
  feature: PartColorFeature,
  currentColor: DetectedFallbackColor,
  paletteColor: FallbackLegoColor | undefined,
): number {
  return paletteColor
    ? colorDistanceCiede2000(feature.rgb, paletteColor.rgb)
    : currentColor.distance
}
