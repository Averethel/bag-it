import type { Region } from "./contracts"
import type { QuantityCandidate } from "./quantity-candidate-types"
import { regionCenter } from "./regions"

export function readQuantityReferenceHeight(candidates: readonly QuantityCandidate[]): number {
  return Math.max(6, Math.round(readMedian(candidates.map((candidate) => candidate.region.height))))
}

export function readRecoveryCandidateHeights(referenceHeight: number, componentHeight: number): number[] {
  const candidateHeights = [
    referenceHeight,
    referenceHeight + 1,
    referenceHeight - 1,
    referenceHeight + 2,
    referenceHeight - 2,
  ]

  return candidateHeights
    .filter((height) => height >= 6 && height < componentHeight)
    .filter((height, index, heights) => heights.indexOf(height) === index)
}

export function isCandidateInRecoveryBand(candidate: QuantityCandidate, band: Region): boolean {
  const center = regionCenter(candidate.region)

  return center.y >= band.y &&
    center.y <= band.y + band.height &&
    center.x >= band.x &&
    center.x <= band.x + band.width
}

export function mergeQuantityCandidates(
  initialCandidates: readonly QuantityCandidate[],
  recoveredCandidates: readonly QuantityCandidate[],
): QuantityCandidate[] {
  const merged = [...initialCandidates]
  const keys = new Set(initialCandidates.map(createQuantityCandidateKey))

  for (const candidate of recoveredCandidates) {
    const key = createQuantityCandidateKey(candidate)

    if (!keys.has(key)) {
      keys.add(key)
      merged.push(candidate)
    } else {
      const existingIndex = merged.findIndex((entry) => createQuantityCandidateKey(entry) === key)

      if (
        existingIndex >= 0 &&
        candidate.recoveryKind === "tall-sparse-top" &&
        !merged[existingIndex].recoveryKind
      ) {
        merged[existingIndex] = {
          ...merged[existingIndex],
          recoveryKind: candidate.recoveryKind,
        }
      }
    }
  }

  return merged
}

export function readMedian(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function createQuantityCandidateKey(candidate: QuantityCandidate): string {
  const region = candidate.region

  return [
    candidate.text,
    region.x,
    region.y,
    region.width,
    region.height,
  ].join(":")
}
