import type { CalloutPartPageInput, Region, RgbColor } from "./contracts"
import {
  createGlyphMask,
  findGlyphComponents,
  isPlausibleGlyph,
} from "./glyph-mask"
import { CALLOUT_BORDER_INSET } from "./quantity-label-shape"
import { createConnectedQuantityCandidates } from "./quantity-connected-candidate-assembly"
import { pushQuantityAssemblyDebugEntry } from "./quantity-candidate-assembly-debug"
import type { QuantityCandidateAssemblyOptions } from "./quantity-candidate-assembly-types"
import type { QuantityCandidate } from "./quantity-candidate-types"
import { createSeparatedQuantityCandidates } from "./quantity-separated-candidate-assembly"
import { insetRegion } from "./regions"

export type { QuantityCandidateAssemblyOptions } from "./quantity-candidate-assembly-types"

export function assembleQuantityCandidates(
  page: CalloutPartPageInput,
  calloutRegion: Region,
  background: RgbColor,
  options: QuantityCandidateAssemblyOptions = {},
): QuantityCandidate[] {
  const searchRegion = insetRegion(calloutRegion, CALLOUT_BORDER_INSET)
  const mask = createGlyphMask(page, searchRegion, background)
  const rawGlyphs = findGlyphComponents(page, mask, searchRegion)
  const glyphs = rawGlyphs.filter(isPlausibleGlyph)
  const separatedCandidates = createSeparatedQuantityCandidates(page, calloutRegion, mask, glyphs, options)
  const connectedCandidates = createConnectedQuantityCandidates(page, calloutRegion, glyphs, options)

  const candidates = [...separatedCandidates, ...connectedCandidates]

  pushQuantityAssemblyDebugEntry(calloutRegion, rawGlyphs, glyphs, candidates)

  return candidates
}
