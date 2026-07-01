import {
  isLikelyXGlyph,
  isPlausibleGlyph,
  type GlyphComponent,
} from "./glyph-mask"
import { readDigit } from "./quantity-ocr-read"
import type { QuantityCandidate } from "./quantity-candidate-types"
import type { Region } from "./contracts"

interface CalloutPartsDebugState {
  enabled?: boolean
  quantityAssemblyEntries?: unknown[]
}

export function pushQuantityAssemblyDebugEntry(
  calloutRegion: Region,
  rawGlyphs: readonly GlyphComponent[],
  glyphs: readonly GlyphComponent[],
  candidates: readonly QuantityCandidate[],
): void {
  pushAssemblyDebugEntry({
    candidates: candidates.map((candidate) => ({
      confidence: candidate.confidence,
      glyphCount: candidate.glyphs.length,
      region: candidate.region,
      text: candidate.text,
      value: candidate.value,
    })),
    calloutRegion,
    glyphs: glyphs.map((glyph) => ({
      area: glyph.area,
      digitRead: readDigitDebug(glyph),
      isLikelyX: isLikelyXGlyph(glyph),
      region: glyph.region,
    })),
    rawGlyphs: rawGlyphs.map((glyph) => ({
      area: glyph.area,
      isPlausible: isPlausibleGlyph(glyph),
      region: glyph.region,
    })),
  })
}

function pushAssemblyDebugEntry(entry: unknown): void {
  const state = (globalThis as { __bagItCalloutPartsDebug?: CalloutPartsDebugState }).__bagItCalloutPartsDebug

  if (!state?.enabled) {
    return
  }

  if (!state.quantityAssemblyEntries) {
    state.quantityAssemblyEntries = []
  }

  state.quantityAssemblyEntries.push(entry)
}

function readDigitDebug(glyph: GlyphComponent): { confidence: number; digit: string } | null {
  const read = readDigit(glyph)

  return read ? { confidence: read.confidence, digit: read.digit } : null
}
