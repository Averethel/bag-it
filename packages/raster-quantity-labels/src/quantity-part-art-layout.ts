import type { QuantityCandidate } from "./quantity-candidate-types"
import { clusterQuantityRows } from "./quantity-row-clustering"
import { regionCenter } from "./regions"

export interface PartArtRejectionLayout {
  largeDenseQuantityLayout: boolean
}

export function createPartArtRejectionLayout(candidates: readonly QuantityCandidate[]): PartArtRejectionLayout {
  return {
    largeDenseQuantityLayout: isLargeDenseQuantityLayout(candidates),
  }
}

export function createCompetingPartArtCandidates(
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): readonly QuantityCandidate[] {
  return candidate.recoveryKind === "connected-top-cap"
    ? candidates
    : candidates.filter((other) => other.recoveryKind !== "connected-top-cap")
}

export function hasPrintedSameRowPeer(
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): boolean {
  return candidate.glyphs.length > 0 && countSameRowPeers(candidates, candidate) >= 2
}

export function isSparseHighValueMultirowCandidate(
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): boolean {
  return candidate.value >= 4 &&
    countSameRowPeers(candidates, candidate) < 4 &&
    hasCloseLowerQuantityRow(candidates, candidate)
}

export function hasOffsetCloseLowerBaselineOwner(
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): boolean {
  return candidates.some((other) =>
    isOffsetCloseLowerBaselineCandidate(candidates, candidate, other),
  )
}

export function hasPrintedBottomRowPeers(
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): boolean {
  return candidate.glyphs.length > 0 &&
    !hasLowerQuantityRow(candidates, candidate) &&
    countSameRowPeers(candidates, candidate) >= 3
}

export function hasPrintedUpperMultirowSupport(
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): boolean {
  if (countSameRowPeers(candidates, candidate) < 3) {
    return false
  }

  if (isOversizedAgainstOverlappingRow(candidates, candidate)) {
    return false
  }

  const centerY = regionCenter(candidate.region).y
  const distantLowerRowGap = Math.max(26, candidate.region.height * 2.4)

  return clusterQuantityRows(candidates)
    .some((row) =>
      row.some((other) =>
        other !== candidate &&
        regionCenter(other.region).y - centerY >= distantLowerRowGap,
      ),
    )
}

export function hasRaisedOversizedPartShape(
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): boolean {
  const lowerCandidates = findNearbyLowerCandidates(candidates, candidate)

  if (lowerCandidates.length < 2) {
    return false
  }

  const medianHeight = readMedian(lowerCandidates.map((entry) => entry.region.height))
  const medianWidth = readMedian(lowerCandidates.map((entry) => entry.region.width))

  return candidate.region.height >= medianHeight * 1.45 ||
    candidate.region.width >= medianWidth * 2.1
}

export function isOnlyReadableCandidate(
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): boolean {
  return candidates.length === 1 && candidates[0] === candidate && !candidate.recoveryKind
}

export function hasLowerQuantityRow(candidates: readonly QuantityCandidate[], candidate: QuantityCandidate): boolean {
  const centerY = regionCenter(candidate.region).y

  return candidates.some((other) =>
    other !== candidate &&
    regionCenter(other.region).y > centerY + Math.max(28, candidate.region.height * 2.4),
  )
}

export function hasNearbyLowerQuantityRow(candidates: readonly QuantityCandidate[], candidate: QuantityCandidate): boolean {
  return findNearbyLowerCandidates(candidates, candidate).length > 0
}

export function hasQuantityShapedPartCandidateAbove(
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): boolean {
  if (countSameRowPeers(candidates, candidate) < 3) {
    return false
  }

  const candidateCenter = regionCenter(candidate.region)

  return candidates.some((other) => {
    if (other === candidate) {
      return false
    }

    const otherCenter = regionCenter(other.region)
    const verticalGap = candidate.region.y - (other.region.y + other.region.height)
    const maxVerticalGap = Math.max(8, candidate.region.height * 0.65)
    const horizontalDistance = Math.abs(otherCenter.x - candidateCenter.x)
    const maxHorizontalDistance = Math.max(candidate.region.width * 0.7, candidate.region.height * 0.85)
    const raisedCandidateLooksPartLike = other.region.height >= candidate.region.height * 1.15 ||
      other.region.width >= candidate.region.width * 1.08

    return otherCenter.y < candidateCenter.y &&
      verticalGap >= -candidate.region.height * 0.35 &&
      verticalGap <= maxVerticalGap &&
      horizontalDistance <= maxHorizontalDistance &&
      raisedCandidateLooksPartLike
  })
}

function isOffsetCloseLowerBaselineCandidate(
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
  other: QuantityCandidate,
): boolean {
  if (candidate === other || countSameRowPeers(candidates, other) < 4) {
    return false
  }

  const lowerGap = other.region.y - (candidate.region.y + candidate.region.height)

  if (lowerGap < 0 || lowerGap > Math.max(12, candidate.region.height * 1.3)) {
    return false
  }

  const centerDistance = Math.abs(regionCenter(other.region).x - regionCenter(candidate.region).x)
  const offsetThreshold = Math.max(12, candidate.region.width * 1.15)

  return centerDistance >= offsetThreshold
}

function countSameRowPeers(
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): number {
  const centerY = regionCenter(candidate.region).y
  const rowCandidates = candidates.filter((other) =>
    Math.abs(regionCenter(other.region).y - centerY) <= Math.max(6, candidate.region.height * 0.85),
  )
  const distinctCenters: number[] = []

  for (const rowCandidate of rowCandidates.sort((left, right) => regionCenter(left.region).x - regionCenter(right.region).x)) {
    const centerX = regionCenter(rowCandidate.region).x
    const duplicateTolerance = Math.max(4, Math.min(candidate.region.width, rowCandidate.region.width) * 0.55)

    if (!distinctCenters.some((entry) => Math.abs(entry - centerX) <= duplicateTolerance)) {
      distinctCenters.push(centerX)
    }
  }

  return distinctCenters.length
}

function hasCloseLowerQuantityRow(candidates: readonly QuantityCandidate[], candidate: QuantityCandidate): boolean {
  const centerY = regionCenter(candidate.region).y
  const lowerRowGapMin = Math.max(7, candidate.region.height * 0.6)

  return candidates.some((other) => {
    const lowerDistance = regionCenter(other.region).y - centerY

    return other !== candidate &&
      lowerDistance >= lowerRowGapMin &&
      lowerDistance <= Math.max(12, candidate.region.height * 1.15)
  })
}

function findNearbyLowerCandidates(
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): QuantityCandidate[] {
  const centerY = regionCenter(candidate.region).y

  return candidates.filter((other) => {
    const lowerDistance = regionCenter(other.region).y - centerY

    return other !== candidate &&
      lowerDistance >= Math.max(6, candidate.region.height * 0.45) &&
      lowerDistance <= Math.max(34, candidate.region.height * 2.6)
  })
}

function isOversizedAgainstOverlappingRow(
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): boolean {
  const centerY = regionCenter(candidate.region).y
  const rowPeers = candidates.filter((other) =>
    other !== candidate &&
    Math.abs(regionCenter(other.region).y - centerY) <= Math.max(6, candidate.region.height * 0.85),
  )

  if (rowPeers.length < 3) {
    return false
  }

  const medianHeight = readMedian(rowPeers.map((entry) => entry.region.height))
  const medianWidth = readMedian(rowPeers.map((entry) => entry.region.width))

  return candidate.region.height >= medianHeight * 1.45 ||
    candidate.region.width >= medianWidth * 2.1
}

function isLargeDenseQuantityLayout(candidates: readonly QuantityCandidate[]): boolean {
  if (candidates.length < 20) {
    return false
  }

  const rows = clusterQuantityRows(candidates)

  return rows.length >= 3 && rows.some((row) => row.length >= 6)
}

function readMedian(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}
