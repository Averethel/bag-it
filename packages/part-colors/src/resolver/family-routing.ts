import type { LchColor } from "../color-space"
import type { ResolverColorFamily } from "./types"

const NEUTRAL_CHROMA = 8

export function routeColorFamily(lch: LchColor): ResolverColorFamily {
  if (lch.c < NEUTRAL_CHROMA) {
    return "neutral"
  }

  if (isWarmHue(lch.h)) {
    return "warm"
  }

  if (isTanGoldHue(lch.h)) {
    return "tan-gold"
  }

  if (isCoolHue(lch.h)) {
    return "cool"
  }

  return "fallback"
}

function isWarmHue(hue: number): boolean {
  return hue < 40 || hue >= 330
}

function isTanGoldHue(hue: number): boolean {
  return hue >= 40 && hue < 105
}

function isCoolHue(hue: number): boolean {
  return hue >= 105 && hue < 285
}
