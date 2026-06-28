import type { CalloutPartPageInput, Region } from "./contracts"
import {
  isLikelyXGlyph,
  type GlyphComponent,
} from "./glyph-mask"
import type { QuantityCandidateAssemblyOptions } from "./quantity-candidate-assembly-types"
import type { QuantityCandidate } from "./quantity-candidate-types"
import {
  hasReadableLabelInk,
  isCandidateShape,
  isReadableConnectedCandidateShape,
} from "./quantity-label-shape"
import { readQuantityOcr } from "./quantity-ocr"

const MIN_CONNECTED_CANDIDATE_PIXELS = 40

export function createConnectedQuantityCandidates(
  page: CalloutPartPageInput,
  calloutRegion: Region,
  glyphs: readonly GlyphComponent[],
  options: QuantityCandidateAssemblyOptions,
): QuantityCandidate[] {
  return glyphs.flatMap((glyph) => createCandidateFromConnectedGlyph(page, calloutRegion, glyph, options))
}

function createCandidateFromConnectedGlyph(
  page: CalloutPartPageInput,
  calloutRegion: Region,
  glyph: GlyphComponent,
  options: QuantityCandidateAssemblyOptions,
): QuantityCandidate[] {
  if (
    isLikelyXGlyph(glyph) ||
    glyph.area < MIN_CONNECTED_CANDIDATE_PIXELS ||
    glyph.region.width / Math.max(1, glyph.region.height) < 1.15 ||
    !isReadableConnectedCandidateShape(glyph.region)
  ) {
    return []
  }

  const read = readQuantityOcr(page, [glyph])

  if (!read || !hasReadableLabelInk([glyph]) || !isCandidateShape(
    calloutRegion,
    glyph.region,
    read.text.length - 1,
    options,
  )) {
    return []
  }

  return [{
    confidence: Math.max(0, read.confidence - 0.06),
    glyphs: [glyph],
    region: glyph.region,
    text: read.text,
    value: read.value,
  }]
}
