import type { CalloutPartPageInput, Region, RgbColor } from "./contracts"
import { assembleQuantityCandidates } from "./quantity-candidate-assembly"
import type { QuantityCandidate } from "./quantity-candidate-types"
import { rejectTinyOutlierCandidates, suppressOverlappingCandidates } from "./quantity-overlap-suppression"
import { rejectPartArtCandidates } from "./quantity-part-art-rejection"
import { recoverPostRejectionQuantityCandidates, recoverQuantityCandidates } from "./quantity-recovery"

export type { QuantityCandidate } from "./quantity-candidate-types"

export interface QuantityCandidateSets {
  emitted: QuantityCandidate[]
  suppression: QuantityCandidate[]
}

export function findQuantityCandidates(
  page: CalloutPartPageInput,
  calloutRegion: Region,
  background: RgbColor,
): QuantityCandidate[] {
  return findQuantityCandidateSets(page, calloutRegion, background).emitted
}

export function findQuantityCandidateSets(
  page: CalloutPartPageInput,
  calloutRegion: Region,
  background: RgbColor,
): QuantityCandidateSets {
  const initialCandidates = assembleQuantityCandidates(page, calloutRegion, background)
  const candidates = recoverQuantityCandidates(page, calloutRegion, background, initialCandidates)
  const foregroundCandidates = rejectPartArtCandidates(page, background, candidates)
  const postRejectionCandidates = recoverPostRejectionQuantityCandidates(page, calloutRegion, background, foregroundCandidates)
  const recoveredForegroundCandidates = postRejectionCandidates.length === foregroundCandidates.length
    ? foregroundCandidates
    : rejectPartArtCandidates(page, background, postRejectionCandidates)
  const scaledCandidates = rejectTinyOutlierCandidates(recoveredForegroundCandidates)
  const initialEmitted = suppressOverlappingCandidates(scaledCandidates)
  const postEmitCandidates = recoverPostRejectionQuantityCandidates(page, calloutRegion, background, initialEmitted)
  const emitted = postEmitCandidates.length === initialEmitted.length
    ? initialEmitted
    : suppressOverlappingCandidates(rejectTinyOutlierCandidates(rejectPartArtCandidates(page, background, postEmitCandidates)))
  pushCandidateDebugEntry({
    calloutRegion,
    emitted: emitted.map(readCandidateDebugEntry),
    foreground: foregroundCandidates.map(readCandidateDebugEntry),
    initial: initialCandidates.map(readCandidateDebugEntry),
    initialEmitted: initialEmitted.map(readCandidateDebugEntry),
    postEmitRecovered: postEmitCandidates.map(readCandidateDebugEntry),
    postRejectionRecovered: postRejectionCandidates.map(readCandidateDebugEntry),
    recoveredForeground: recoveredForegroundCandidates.map(readCandidateDebugEntry),
    recovered: candidates.map(readCandidateDebugEntry),
    scaled: scaledCandidates.map(readCandidateDebugEntry),
  })

  return {
    emitted,
    suppression: createSuppressionCandidates(candidates, emitted),
  }
}

interface CalloutPartsDebugState {
  enabled?: boolean
  quantityCandidateEntries?: unknown[]
}

function pushCandidateDebugEntry(entry: unknown): void {
  const state = (globalThis as { __bagItCalloutPartsDebug?: CalloutPartsDebugState }).__bagItCalloutPartsDebug

  if (!state?.enabled) {
    return
  }

  if (!state.quantityCandidateEntries) {
    state.quantityCandidateEntries = []
  }

  state.quantityCandidateEntries.push(entry)
}

function readCandidateDebugEntry(candidate: QuantityCandidate): unknown {
  return {
    confidence: candidate.confidence,
    glyphCount: candidate.glyphs.length,
    recoveryKind: candidate.recoveryKind,
    region: candidate.region,
    text: candidate.text,
    value: candidate.value,
  }
}

function createSuppressionCandidates(
  candidates: readonly QuantityCandidate[],
  emitted: readonly QuantityCandidate[],
): QuantityCandidate[] {
  const suppression = new Map<string, QuantityCandidate>()

  for (const candidate of [...emitted, ...candidates.filter(isReadableSuppressionCandidate)]) {
    suppression.set(createCandidateMaskKey(candidate), candidate)
  }

  return sortCandidates([...suppression.values()])
}

function isReadableSuppressionCandidate(candidate: QuantityCandidate): boolean {
  return candidate.glyphs.length > 0 &&
    (candidate.recoveryKind === "attached-baseline" || candidate.recoveryKind === "connected-top-cap")
}

function createCandidateMaskKey(candidate: QuantityCandidate): string {
  const region = candidate.region

  return [candidate.text, region.x, region.y, region.width, region.height].join(":")
}

function sortCandidates(candidates: readonly QuantityCandidate[]): QuantityCandidate[] {
  return [...candidates].sort((left, right) => left.region.y - right.region.y || left.region.x - right.region.x)
}
