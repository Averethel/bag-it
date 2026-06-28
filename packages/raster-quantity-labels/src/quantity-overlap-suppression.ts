import type { QuantityCandidate } from "./quantity-candidate-types"
import { overlapRatio } from "./regions"

export function rejectTinyOutlierCandidates(candidates: readonly QuantityCandidate[]): QuantityCandidate[] {
  if (candidates.length < 3) {
    return [...candidates]
  }

  const medianHeight = readMedian(candidates.map((candidate) => candidate.region.height))
  const tinyHighValueHeight = Math.max(5, medianHeight * 0.82)

  return candidates.filter((candidate) =>
    candidate.value < 5 ||
    candidate.region.height >= tinyHighValueHeight ||
    isBottomRowCandidate(candidate, candidates),
  )
}

function isBottomRowCandidate(
  candidate: QuantityCandidate,
  candidates: readonly QuantityCandidate[],
): boolean {
  const centerY = candidate.region.y + candidate.region.height / 2
  const lowerRowGap = Math.max(8, Math.round(candidate.region.height * 1.2))

  return !candidates.some((other) =>
    other !== candidate &&
    other.region.y + other.region.height / 2 > centerY + lowerRowGap,
  )
}

export function suppressOverlappingCandidates(
  candidates: readonly QuantityCandidate[],
): QuantityCandidate[] {
  const accepted: QuantityCandidate[] = []

  for (const candidate of [...candidates].sort((left, right) => right.confidence - left.confidence)) {
    const overlapsExisting = accepted.some((current) => overlapRatio(current.region, candidate.region) > 0.62)

    if (!overlapsExisting) {
      accepted.push(candidate)
    }
  }

  return accepted.sort((left, right) => left.region.y - right.region.y || left.region.x - right.region.x)
}

function readMedian(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}
