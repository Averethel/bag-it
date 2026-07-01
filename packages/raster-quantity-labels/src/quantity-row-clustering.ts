import type { QuantityCandidate } from "./quantity-candidate-types"
import { regionCenter, unionRegions } from "./regions"

export function rejectOversizedRaisedRows(candidates: readonly QuantityCandidate[]): QuantityCandidate[] {
  const rows = clusterQuantityRows(candidates)
  const rejected = new Set<QuantityCandidate>()

  for (const row of rows) {
    const lowerRow = findLowerEvidenceRow(rows, row)

    if (!lowerRow || !shouldRejectRaisedRow(row, lowerRow)) {
      continue
    }

    for (const candidate of row) {
      rejected.add(candidate)
    }
  }

  return candidates.filter((candidate) => !rejected.has(candidate))
}

function findLowerEvidenceRow(
  rows: readonly QuantityCandidate[][],
  row: readonly QuantityCandidate[],
): QuantityCandidate[] | undefined {
  const rowCenterY = regionCenter(rowRegion(row)).y

  return rows.find((candidateRow) =>
    candidateRow !== row &&
    candidateRow.length >= 2 &&
    regionCenter(rowRegion(candidateRow)).y > rowCenterY + 8,
  )
}

function shouldRejectRaisedRow(
  row: readonly QuantityCandidate[],
  lowerRow: readonly QuantityCandidate[],
): boolean {
  if (row.length >= lowerRow.length) {
    return false
  }

  const raisedRegion = rowRegion(row)
  const lowerRegion = rowRegion(lowerRow)
  const closeToLowerRow = lowerRegion.y - raisedRegion.y <= Math.max(18, lowerRegion.height * 1.7)
  const tallerThanLowerText = hasGlyphEvidence(row)
    ? raisedRegion.height > lowerRegion.height * 1.22
    : raisedRegion.height > lowerRegion.height * 1.08

  return closeToLowerRow && tallerThanLowerText
}

function hasGlyphEvidence(row: readonly QuantityCandidate[]): boolean {
  return row.some((candidate) => candidate.glyphs.length > 0)
}

function rowRegion(row: readonly QuantityCandidate[]) {
  return unionRegions(row.map((candidate) => candidate.region))
}

export function clusterQuantityRows(candidates: readonly QuantityCandidate[]): QuantityCandidate[][] {
  const rows: QuantityCandidate[][] = []

  for (const candidate of [...candidates].sort((left, right) => regionCenter(left.region).y - regionCenter(right.region).y)) {
    const row = rows.find((candidateRow) => {
      const rowRegion = unionRegions(candidateRow.map((entry) => entry.region))
      return Math.abs(regionCenter(candidate.region).y - regionCenter(rowRegion).y) <=
        Math.max(6, Math.min(candidate.region.height, rowRegion.height) * 0.85)
    })

    if (row) {
      row.push(candidate)
    } else {
      rows.push([candidate])
    }
  }

  return rows
}
