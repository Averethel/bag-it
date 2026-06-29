import type { CalloutPartPageInput, RgbColor } from "./contracts"
import type { QuantityCandidate } from "./quantity-candidate-types"
import { rejectOversizedRaisedRows } from "./quantity-row-clustering"
import { isRejectedPartArtCandidate } from "./quantity-part-art-decisions"
import { hasPrintedLabelLikeForegroundDensity, hasPrintedBaselinePartAbove } from "./quantity-part-art-foreground"
import {
  createCompetingPartArtCandidates,
  createPartArtRejectionLayout,
  hasOffsetCloseLowerBaselineOwner,
} from "./quantity-part-art-layout"

export function rejectPartArtCandidates(
  page: CalloutPartPageInput,
  background: RgbColor,
  candidates: readonly QuantityCandidate[],
): QuantityCandidate[] {
  const rowFilteredCandidates = rejectOversizedRaisedRows(candidates)
  const layout = createPartArtRejectionLayout(rowFilteredCandidates)

  return rowFilteredCandidates.filter((candidate) => {
    if (isRecoveredCandidateWithoutGlyphEvidence(candidate)) {
      return shouldKeepRecoveredCandidateWithoutGlyphEvidence(page, background, rowFilteredCandidates, candidate)
    }

    if (isSoleRecoveredRetry(rowFilteredCandidates, candidates, candidate)) {
      return false
    }

    return !isRejectedPartArtCandidate({
      background,
      candidate,
      candidates: rowFilteredCandidates,
      competingCandidates: createCompetingPartArtCandidates(rowFilteredCandidates, candidate),
      layout,
      page,
    })
  })
}

function isRecoveredCandidateWithoutGlyphEvidence(candidate: QuantityCandidate): boolean {
  return Boolean(candidate.recoveryKind) && candidate.glyphs.length === 0
}

function shouldKeepRecoveredCandidateWithoutGlyphEvidence(
  page: CalloutPartPageInput,
  background: RgbColor,
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): boolean {
  return hasPrintedLabelLikeForegroundDensity(page, background, candidate) &&
    hasPrintedBaselinePartAbove(page, background, candidates, candidate) &&
    !hasOffsetCloseLowerBaselineOwner(candidates, candidate)
}

function isSoleRecoveredRetry(
  rowFilteredCandidates: readonly QuantityCandidate[],
  allCandidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): boolean {
  return rowFilteredCandidates.length === 1 &&
    allCandidates.length > 1 &&
    rowFilteredCandidates[0] === candidate &&
    Boolean(candidate.recoveryKind)
}
