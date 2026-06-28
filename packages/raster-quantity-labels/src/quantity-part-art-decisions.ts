import type { CalloutPartPageInput, RgbColor } from "./contracts"
import type { QuantityCandidate } from "./quantity-candidate-types"
import {
  hasEmbeddedPartForeground,
  hasPrintedBaselinePartAbove,
  hasPrintedBottomRowPartAbove,
  hasRaisedPartForegroundContinuation,
  hasRaisedPartForegroundHalo,
  hasSubstantialNonGlyphForeground,
} from "./quantity-part-art-foreground"
import {
  hasOffsetCloseLowerBaselineOwner,
  hasPrintedBottomRowPeers,
  hasPrintedSameRowPeer,
  hasPrintedUpperMultirowSupport,
  hasRaisedOversizedPartShape,
  isOnlyReadableCandidate,
  isSparseHighValueMultirowCandidate,
  type PartArtRejectionLayout,
} from "./quantity-part-art-layout"

interface PartArtRejectionInput {
  background: RgbColor
  candidate: QuantityCandidate
  candidates: readonly QuantityCandidate[]
  competingCandidates: readonly QuantityCandidate[]
  layout: PartArtRejectionLayout
  page: CalloutPartPageInput
}

type PartArtDecision = "allow" | "reject"

export function isRejectedPartArtCandidate(input: PartArtRejectionInput): boolean {
  return readSparseHighValueMultirowDecision(input) === "reject" ||
    readRaisedOversizedPartShapeDecision(input) === "reject" ||
    readOffsetLowerBaselineOwnerDecision(input) === "reject" ||
    readEmbeddedPartForegroundDecision(input) === "reject" ||
    readForegroundArtifactDecision(input) === "reject"
}

function readSparseHighValueMultirowDecision(input: PartArtRejectionInput): PartArtDecision {
  if (!isSparseHighValueMultirowCandidate(input.competingCandidates, input.candidate)) {
    return "allow"
  }

  return hasSparseHighValueMultirowProtection(input)
    ? "allow"
    : "reject"
}

function readRaisedOversizedPartShapeDecision(input: PartArtRejectionInput): PartArtDecision {
  if (!hasRaisedOversizedPartShape(input.competingCandidates, input.candidate)) {
    return "allow"
  }

  return hasRaisedOversizedPartShapeProtection(input)
    ? "allow"
    : "reject"
}

function readOffsetLowerBaselineOwnerDecision(input: PartArtRejectionInput): PartArtDecision {
  if (!hasOffsetCloseLowerBaselineOwner(input.competingCandidates, input.candidate)) {
    return "allow"
  }

  return hasOffsetLowerBaselineOwnerProtection(input)
    ? "allow"
    : "reject"
}

function readEmbeddedPartForegroundDecision(input: PartArtRejectionInput): PartArtDecision {
  if (!hasEmbeddedPartForeground(input.page, input.background, input.candidate)) {
    return "allow"
  }

  return hasEmbeddedPartForegroundProtection(input)
    ? "allow"
    : "reject"
}

function readForegroundArtifactDecision(input: PartArtRejectionInput): PartArtDecision {
  if (!hasForegroundArtifact(input)) {
    return "allow"
  }

  return hasForegroundArtifactProtection(input)
    ? "allow"
    : "reject"
}

function hasForegroundArtifact(input: PartArtRejectionInput): boolean {
  return hasSubstantialNonGlyphForeground(input.page, input.background, input.competingCandidates, input.candidate) ||
    hasRaisedPartForegroundHalo(input.page, input.background, input.competingCandidates, input.candidate) ||
    hasRaisedPartForegroundContinuation(input.page, input.background, input.competingCandidates, input.candidate)
}

function hasSparseHighValueMultirowProtection(input: PartArtRejectionInput): boolean {
  return hasProtectedSparsePrintedBaselineLabel(input) ||
    hasProtectedGlyphSameRowPrintedLabel(input)
}

function hasProtectedSparsePrintedBaselineLabel(input: PartArtRejectionInput): boolean {
  return input.candidate.value !== 4 &&
    hasGlyphEvidence(input.candidate) &&
    hasPrintedBaselinePartAbove(input.page, input.background, input.competingCandidates, input.candidate)
}

function hasRaisedOversizedPartShapeProtection(input: PartArtRejectionInput): boolean {
  return hasProtectedUpperMultirowLabel(input) ||
    hasPrintedBaselinePartAbove(input.page, input.background, input.competingCandidates, input.candidate)
}

function hasOffsetLowerBaselineOwnerProtection(input: PartArtRejectionInput): boolean {
  return input.layout.largeDenseQuantityLayout ||
    hasProtectedUpperMultirowLabel(input)
}

function hasEmbeddedPartForegroundProtection(input: PartArtRejectionInput): boolean {
  return isOnlyReadableCandidate(input.candidates, input.candidate) ||
    hasProtectedUpperMultirowLabel(input) ||
    hasProtectedGlyphSameRowPrintedLabel(input) ||
    hasProtectedFourSameRowPrintedLabel(input) ||
    hasPrintedBaselinePartAbove(input.page, input.background, input.competingCandidates, input.candidate) ||
    hasPrintedBottomRowPartAbove(input.page, input.background, input.competingCandidates, input.candidate) ||
    hasPrintedBottomRowPeers(input.competingCandidates, input.candidate)
}

function hasForegroundArtifactProtection(input: PartArtRejectionInput): boolean {
  return input.layout.largeDenseQuantityLayout ||
    hasProtectedUpperMultirowLabel(input) ||
    hasProtectedSameRowPrintedLabel(input) ||
    hasProtectedSparseSameRowLabel(input) ||
    hasPrintedBaselinePartAbove(input.page, input.background, input.competingCandidates, input.candidate) ||
    hasPrintedBottomRowPartAbove(input.page, input.background, input.competingCandidates, input.candidate) ||
    hasPrintedBottomRowPeers(input.competingCandidates, input.candidate)
}

function hasProtectedUpperMultirowLabel(input: PartArtRejectionInput): boolean {
  return hasPrintedUpperMultirowSupport(input.competingCandidates, input.candidate) &&
    hasPrintedBaselinePartAbove(input.page, input.background, input.competingCandidates, input.candidate)
}

function hasProtectedSameRowPrintedLabel(input: PartArtRejectionInput): boolean {
  return input.candidate.value !== 4 &&
    hasPrintedSameRowPeer(input.competingCandidates, input.candidate)
}

function hasProtectedSparseSameRowLabel(input: PartArtRejectionInput): boolean {
  return hasProtectedGlyphSameRowPrintedLabel(input) &&
    isSparseHighValueMultirowCandidate(input.competingCandidates, input.candidate)
}

function hasProtectedGlyphSameRowPrintedLabel(input: PartArtRejectionInput): boolean {
  return input.candidate.value >= 5 &&
    hasGlyphEvidence(input.candidate) &&
    hasProtectedSameRowPrintedLabel(input)
}

function hasProtectedFourSameRowPrintedLabel(input: PartArtRejectionInput): boolean {
  return input.candidate.value === 4 &&
    hasGlyphEvidence(input.candidate) &&
    hasPrintedSameRowPeer(input.competingCandidates, input.candidate) &&
    !isSparseHighValueMultirowCandidate(input.competingCandidates, input.candidate)
}

function hasGlyphEvidence(candidate: QuantityCandidate): boolean {
  return candidate.glyphs.length > 0
}
