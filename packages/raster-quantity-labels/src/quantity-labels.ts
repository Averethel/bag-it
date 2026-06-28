import type { CalloutPartPageInput, CalloutQuantityLabel, Region, RgbColor } from "./contracts"
import { findQuantityCandidateSets, findQuantityCandidates } from "./quantity-candidates"
import type { QuantityCandidate } from "./quantity-candidate-types"
import { compareRegions } from "./regions"

export interface QuantityLabelSets {
  emitted: CalloutQuantityLabel[]
  suppression: CalloutQuantityLabel[]
}

export function findQuantityLabels(
  page: CalloutPartPageInput,
  calloutRegion: Region,
  background: RgbColor,
): CalloutQuantityLabel[] {
  return findQuantityCandidates(page, calloutRegion, background)
    .map(createQuantityLabel)
    .sort((left, right) => compareRegions(left.region, right.region))
}

export function findQuantityLabelSets(
  page: CalloutPartPageInput,
  calloutRegion: Region,
  background: RgbColor,
): QuantityLabelSets {
  const candidates = findQuantityCandidateSets(page, calloutRegion, background)

  return {
    emitted: candidates.emitted.map(createQuantityLabel).sort((left, right) => compareRegions(left.region, right.region)),
    suppression: candidates.suppression.map(createQuantityLabel).sort((left, right) => compareRegions(left.region, right.region)),
  }
}

function createQuantityLabel(candidate: QuantityCandidate): CalloutQuantityLabel {
  return {
    confidence: candidate.confidence,
    glyphs: candidate.glyphs,
    recoveryKind: candidate.recoveryKind,
    region: candidate.region,
    text: candidate.text,
    value: candidate.value,
  }
}
