import type { CalloutPartPageInput, RgbColor } from "./contracts"
import type { QuantityCandidate } from "./quantity-candidate-types"
import { clusterQuantityRows, rejectOversizedRaisedRows } from "./quantity-row-clustering"
import { isRejectedPartArtCandidate } from "./quantity-part-art-decisions"
import { hasPrintedLabelLikeForegroundDensity, hasPrintedBaselinePartAbove } from "./quantity-part-art-foreground"
import {
  createCompetingPartArtCandidates,
  createPartArtRejectionLayout,
  hasOffsetCloseLowerBaselineOwner,
} from "./quantity-part-art-layout"
import { regionCenter } from "./regions"

export function rejectPartArtCandidates(
  page: CalloutPartPageInput,
  background: RgbColor,
  candidates: readonly QuantityCandidate[],
): QuantityCandidate[] {
  const rowFilteredCandidates = rejectOversizedRaisedRows(candidates)
  const layout = createPartArtRejectionLayout(rowFilteredCandidates)
  const orphanUpperPartArt = findOrphanCompactUpperPeerPartArtCandidates(page, background, rowFilteredCandidates)

  return rowFilteredCandidates.filter((candidate) => {
    if (orphanUpperPartArt.has(candidate)) {
      return false
    }

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

function findOrphanCompactUpperPeerPartArtCandidates(
  page: CalloutPartPageInput,
  background: RgbColor,
  candidates: readonly QuantityCandidate[],
): ReadonlySet<QuantityCandidate> {
  const oneCandidates = candidates.filter((candidate) => candidate.value === 1)

  if (oneCandidates.length < 3) {
    return new Set()
  }

  const rows = clusterQuantityRows(oneCandidates)
  const upperRow = rows[0] ?? []
  const lowerRow = rows[1] ?? []

  if (rows.length !== 2 || upperRow.length !== 1 || lowerRow.length !== 2) {
    return new Set()
  }

  const upper = upperRow[0]
  const sortedLower = [...lowerRow].sort((left, right) => left.region.x - right.region.x) as [
    QuantityCandidate,
    QuantityCandidate,
  ]

  if (
    !labelsHaveComparableSize(upper.region, sortedLower[0].region) ||
    !labelsHaveComparableSize(upper.region, sortedLower[1].region)
  ) {
    return new Set()
  }

  const matchingLower = sortedLower.find((lower) =>
    Math.abs(regionCenter(lower.region).x - regionCenter(upper.region).x) <= Math.max(8, lower.region.width * 0.8),
  )
  const missingPeerLower = sortedLower.find((lower) => lower !== matchingLower)
  const rowGap = readRowCenterY(sortedLower) - regionCenter(upper.region).y

  if (
    !matchingLower ||
    !missingPeerLower ||
    rowGap < Math.max(20, upper.region.height * 1.8) ||
    rowGap > Math.max(48, upper.region.height * 4.5)
  ) {
    return new Set()
  }

  const inferredPeer = {
    ...upper,
    confidence: Math.min(upper.confidence, 0.76),
    glyphs: [],
    region: {
      height: upper.region.height,
      width: upper.region.width,
      x: missingPeerLower.region.x,
      y: upper.region.y,
    },
  } satisfies QuantityCandidate

  return hasPrintedLabelLikeForegroundDensity(page, background, inferredPeer) &&
    hasPrintedBaselinePartAbove(page, background, candidates, inferredPeer)
    ? new Set()
    : new Set([upper])
}

function labelsHaveComparableSize(left: QuantityCandidate["region"], right: QuantityCandidate["region"]): boolean {
  return Math.abs(left.width - right.width) <= Math.max(3, Math.round(Math.max(left.width, right.width) * 0.25)) &&
    Math.abs(left.height - right.height) <= Math.max(3, Math.round(Math.max(left.height, right.height) * 0.25))
}

function readRowCenterY(row: readonly QuantityCandidate[]): number {
  return row.reduce((sum, candidate) => sum + regionCenter(candidate.region).y, 0) / Math.max(1, row.length)
}
