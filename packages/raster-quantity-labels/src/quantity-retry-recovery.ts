import type { Region } from "./contracts"
import {
  assembleQuantityCandidates,
  type QuantityCandidateAssemblyOptions,
} from "./quantity-candidate-assembly"
import type { QuantityCandidate, QuantityRecoveryKind } from "./quantity-candidate-types"
import { hasPrintedBaselinePartAbove, hasPrintedLabelLikeForegroundDensity } from "./quantity-part-art-foreground"
import { clusterQuantityRows } from "./quantity-row-clustering"
import type { QuantityRecoveryPlan } from "./quantity-recovery-types"
import {
  isCandidateInRecoveryBand,
  readMedian,
} from "./quantity-recovery-utils"

export const RECOVERY_ASSEMBLY_OPTIONS: QuantityCandidateAssemblyOptions = {
  minVerticalRatio: 0.06,
}

export const COMPACT_MISSING_LOWER_PEER_RECOVERY_KIND: QuantityRecoveryKind = "compact-missing-lower-peer"

interface CompactMissingLowerPeerLayout {
  lower: QuantityCandidate
  upper: readonly [QuantityCandidate, QuantityCandidate]
}

export function createQuantityRetryRecoveryPlans(
  candidates: readonly QuantityCandidate[],
  calloutRegion: Region,
): QuantityRecoveryPlan[] {
  const plans = [
    createCompactMissingLowerPeerRecoveryPlan(candidates, calloutRegion),
    createLargeDenseTopRecoveryPlan(candidates, calloutRegion),
    createCompactUpperMultirowRecoveryPlan(candidates, calloutRegion),
    createTallSparseTopRecoveryPlan(candidates, calloutRegion),
    createTallMultirowTopRecoveryPlan(candidates, calloutRegion),
  ]

  return plans.filter((plan): plan is QuantityRecoveryPlan => plan !== null)
}

function createCompactMissingLowerPeerRecoveryPlan(
  candidates: readonly QuantityCandidate[],
  calloutRegion: Region,
): QuantityRecoveryPlan | null {
  const layout = findCompactMissingLowerPeerLayout(candidates, calloutRegion)

  return layout
    ? createPlan(COMPACT_MISSING_LOWER_PEER_RECOVERY_KIND, readRowExpansionBand([layout.lower], calloutRegion))
    : null
}

export function recoverQuantityRetryCandidates(
  page: Parameters<typeof assembleQuantityCandidates>[0],
  calloutRegion: Region,
  background: Parameters<typeof assembleQuantityCandidates>[2],
  plan: QuantityRecoveryPlan,
): QuantityCandidate[] {
  return assembleQuantityCandidates(page, calloutRegion, background, plan.assemblyOptions ?? RECOVERY_ASSEMBLY_OPTIONS)
    .filter((candidate) => isCandidateInRecoveryBand(candidate, plan.targetBand))
    .map((candidate) => ({
      ...candidate,
      recoveryKind: plan.kind,
    }))
}

export function recoverCompactMissingLowerPeerCandidates(
  page: Parameters<typeof assembleQuantityCandidates>[0],
  calloutRegion: Region,
  background: Parameters<typeof assembleQuantityCandidates>[2],
  candidates: readonly QuantityCandidate[],
  plan: QuantityRecoveryPlan,
): QuantityCandidate[] {
  const layout = findCompactMissingLowerPeerLayout(candidates, calloutRegion)

  if (!layout) {
    return []
  }

  const lower = layout.lower
  const nearestUpper = layout.upper
    .map((candidate) => ({
      candidate,
      distance: Math.abs(regionCenterX(candidate.region) - regionCenterX(lower.region)),
    }))
    .sort((left, right) => left.distance - right.distance)[0]!.candidate
  const missingUpper = layout.upper.find((candidate) => candidate !== nearestUpper)!
  const region = inferCompactMissingPeerRegion(calloutRegion, lower.region, nearestUpper.region, missingUpper.region)
  const candidate = readCompactMissingPeerCandidate(page, calloutRegion, background, region, lower)

  if (!candidate) {
    return []
  }

  return isCandidateInRecoveryBand(candidate, plan.targetBand) &&
    hasPrintedLabelLikeForegroundDensity(page, background, candidate) &&
    hasPrintedBaselinePartAbove(page, background, candidates, candidate)
    ? [candidate]
    : []
}

function readCompactMissingPeerCandidate(
  page: Parameters<typeof assembleQuantityCandidates>[0],
  calloutRegion: Region,
  background: Parameters<typeof assembleQuantityCandidates>[2],
  region: Region,
  lower: QuantityCandidate,
): QuantityCandidate | null {
  const parsed = assembleQuantityCandidates(page, calloutRegion, background, RECOVERY_ASSEMBLY_OPTIONS)
    .filter((candidate) => isCandidateForInferredRegion(candidate, region))
    .sort((left, right) => readInferredRegionDistance(left.region, region) - readInferredRegionDistance(right.region, region))[0]

  return parsed
    ? {
        ...parsed,
        confidence: Math.min(0.78, lower.confidence, parsed.confidence),
        recoveryKind: COMPACT_MISSING_LOWER_PEER_RECOVERY_KIND,
        region,
      }
    : null
}

function isCandidateForInferredRegion(candidate: QuantityCandidate, region: Region): boolean {
  const xTolerance = Math.max(3, Math.round(region.width * 0.35))
  const yTolerance = Math.max(3, Math.round(region.height * 0.35))
  const centerX = regionCenterX(candidate.region)
  const centerY = regionCenterY(candidate.region)

  return centerX >= region.x - xTolerance &&
    centerX <= region.x + region.width + xTolerance &&
    centerY >= region.y - yTolerance &&
    centerY <= region.y + region.height + yTolerance
}

function readInferredRegionDistance(candidateRegion: Region, inferredRegion: Region): number {
  return Math.abs(regionCenterX(candidateRegion) - regionCenterX(inferredRegion)) +
    Math.abs(regionCenterY(candidateRegion) - regionCenterY(inferredRegion))
}

function findCompactMissingLowerPeerLayout(
  candidates: readonly QuantityCandidate[],
  calloutRegion: Region,
): CompactMissingLowerPeerLayout | null {
  if (
    candidates.length < 3 ||
    !isCompactMissingPeerCalloutSize(candidates, calloutRegion) ||
    calloutRegion.height < calloutRegion.width * 0.9
  ) {
    return null
  }

  const rows = clusterQuantityRows(candidates)
  let best: { layout: CompactMissingLowerPeerLayout; score: number } | null = null

  for (let upperIndex = 0; upperIndex < rows.length - 1; upperIndex += 1) {
    const upperRow = rows[upperIndex]
    const lowerRow = rows[upperIndex + 1]

    if (upperRow.length < 2 || lowerRow.length !== 1) {
      continue
    }

    const rowGapRatio = readRowCenterRatio(lowerRow, calloutRegion) - readRowCenterRatio(upperRow, calloutRegion)

    if (rowGapRatio < 0.22 || rowGapRatio > 0.62) {
      continue
    }

    const lower = lowerRow[0]
    const upper = selectCompactUpperPeerPair(upperRow, lower, calloutRegion)

    if (!upper) {
      continue
    }

    const horizontalGap = Math.abs(regionCenterX(upper[1].region) - regionCenterX(upper[0].region))
    const lowerAlignment = Math.min(
      Math.abs(regionCenterX(upper[0].region) - regionCenterX(lower.region)),
      Math.abs(regionCenterX(upper[1].region) - regionCenterX(lower.region)),
    )
    const score = lowerAlignment +
      Math.abs(horizontalGap - lower.region.width * 2.4) * 0.35 +
      Math.abs(rowGapRatio - 0.38) * 12

    if (!best || score < best.score) {
      best = {
        layout: { lower, upper },
        score,
      }
    }
  }

  return best?.layout ?? null
}

function isCompactMissingPeerCalloutSize(
  candidates: readonly QuantityCandidate[],
  calloutRegion: Region,
): boolean {
  const medianLabelHeight = readMedian(candidates.map((candidate) => candidate.region.height))
  const medianLabelWidth = readMedian(candidates.map((candidate) => candidate.region.width))
  const renderScale = Math.max(1, medianLabelHeight / 11, medianLabelWidth / 14)

  return calloutRegion.width <= 180 * renderScale && calloutRegion.height <= 180 * renderScale
}

function selectCompactUpperPeerPair(
  upperRow: readonly QuantityCandidate[],
  lower: QuantityCandidate,
  calloutRegion: Region,
): readonly [QuantityCandidate, QuantityCandidate] | null {
  let best: { pair: readonly [QuantityCandidate, QuantityCandidate]; score: number } | null = null
  const lowerCenterX = regionCenterX(lower.region)

  for (let leftIndex = 0; leftIndex < upperRow.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < upperRow.length; rightIndex += 1) {
      const left = upperRow[leftIndex]
      const right = upperRow[rightIndex]
      const pair = [left, right]
        .sort((leftCandidate, rightCandidate) => leftCandidate.region.x - rightCandidate.region.x) as [
          QuantityCandidate,
          QuantityCandidate,
        ]
      const score = readCompactUpperPeerPairScore(pair, lower, lowerCenterX, calloutRegion)

      if (score === null) {
        continue
      }

      if (!best || score < best.score) {
        best = {
          pair,
          score,
        }
      }
    }
  }

  return best?.pair ?? null
}

function readCompactUpperPeerPairScore(
  pair: readonly [QuantityCandidate, QuantityCandidate],
  lower: QuantityCandidate,
  lowerCenterX: number,
  calloutRegion: Region,
): number | null {
  const horizontalGap = Math.abs(regionCenterX(pair[1].region) - regionCenterX(pair[0].region))
  const minGap = Math.max(18, lower.region.width * 1.35)
  const maxGap = Math.max(minGap, calloutRegion.width * 0.62)

  if (horizontalGap < minGap || horizontalGap > maxGap) {
    return null
  }

  const lowerAlignment = Math.min(
    Math.abs(regionCenterX(pair[0].region) - lowerCenterX),
    Math.abs(regionCenterX(pair[1].region) - lowerCenterX),
  )

  if (lowerAlignment > Math.max(18, lower.region.width * 1.4)) {
    return null
  }

  return lowerAlignment + Math.abs(horizontalGap - lower.region.width * 2.4) * 0.4
}

function createLargeDenseTopRecoveryPlan(
  candidates: readonly QuantityCandidate[],
  calloutRegion: Region,
): QuantityRecoveryPlan | null {
  if (candidates.length < 20) {
    return null
  }

  const rows = clusterQuantityRows(candidates)

  if (rows.length < 3 || !rows.some((row) => row.length >= 6)) {
    return null
  }

  return createPlan("large-dense-top", readRowExpansionBand(rows[0], calloutRegion))
}

function createCompactUpperMultirowRecoveryPlan(
  candidates: readonly QuantityCandidate[],
  calloutRegion: Region,
): QuantityRecoveryPlan | null {
  if (candidates.length < 4) {
    return null
  }

  const rows = clusterQuantityRows(candidates)

  if (rows.length < 2) {
    return null
  }

  const upperRows = rows.filter((row) => readRowCenterRatio(row, calloutRegion) <= 0.46)
  const upperRow = upperRows[0]

  if (!upperRow) {
    return null
  }

  const hasDistantLowerRow = rows.some((row) =>
    row !== upperRow &&
    readRowCenterRatio(row, calloutRegion) - readRowCenterRatio(upperRow, calloutRegion) >= 0.22,
  )

  return hasDistantLowerRow
    ? createPlan("compact-upper-multirow", readRowExpansionBand(upperRow, calloutRegion))
    : null
}

function createTallMultirowTopRecoveryPlan(
  candidates: readonly QuantityCandidate[],
  calloutRegion: Region,
): QuantityRecoveryPlan | null {
  if (candidates.length < 4 || calloutRegion.height < calloutRegion.width * 1.25) {
    return null
  }

  const rows = clusterQuantityRows(candidates)

  if (rows.length < 4) {
    return null
  }

  const firstLabelTop = Math.min(...candidates.map((candidate) => candidate.region.y))
  const topGapRatio = (firstLabelTop - calloutRegion.y) / Math.max(1, calloutRegion.height)

  if (topGapRatio < 0.16) {
    return null
  }

  const height = Math.max(1, firstLabelTop - calloutRegion.y)

  return createPlan("tall-multirow-top", {
    height,
    width: calloutRegion.width,
    x: calloutRegion.x,
    y: calloutRegion.y,
  })
}

function createTallSparseTopRecoveryPlan(
  candidates: readonly QuantityCandidate[],
  calloutRegion: Region,
): QuantityRecoveryPlan | null {
  if (
    candidates.length < 2 ||
    candidates.length > 8 ||
    calloutRegion.height < calloutRegion.width * 1.35
  ) {
    return null
  }

  const rows = clusterQuantityRows(candidates)

  if (rows.length < 2) {
    return null
  }

  const firstLabelTop = Math.min(...candidates.map((candidate) => candidate.region.y))
  const firstLabelCenterRatio = (
    firstLabelTop +
    readMedian(candidates.map((candidate) => candidate.region.height)) / 2 -
    calloutRegion.y
  ) / Math.max(1, calloutRegion.height)

  if (firstLabelCenterRatio < 0.3) {
    return null
  }

  const height = Math.max(1, firstLabelTop - calloutRegion.y)

  return createPlan("tall-sparse-top", {
    height,
    width: calloutRegion.width,
    x: calloutRegion.x,
    y: calloutRegion.y,
  })
}

function createPlan(kind: QuantityRecoveryKind, targetBand: Region): QuantityRecoveryPlan {
  return {
    assemblyOptions: RECOVERY_ASSEMBLY_OPTIONS,
    kind,
    source: "lower-threshold",
    targetBand,
  }
}

function readRowExpansionBand(
  row: readonly QuantityCandidate[],
  calloutRegion: Region,
): Region {
  const top = Math.min(...row.map((candidate) => candidate.region.y))
  const bottom = Math.max(...row.map((candidate) => candidate.region.y + candidate.region.height))
  const medianHeight = readMedian(row.map((candidate) => candidate.region.height))
  const verticalPadding = Math.max(4, Math.round(medianHeight * 1.3))
  const bandTop = Math.max(calloutRegion.y, top - verticalPadding)
  const bandBottom = Math.min(calloutRegion.y + calloutRegion.height, bottom + verticalPadding)

  return {
    height: Math.max(1, bandBottom - bandTop),
    width: calloutRegion.width,
    x: calloutRegion.x,
    y: bandTop,
  }
}

function readRowCenterRatio(row: readonly QuantityCandidate[], calloutRegion: Region): number {
  const minY = Math.min(...row.map((candidate) => candidate.region.y))
  const maxY = Math.max(...row.map((candidate) => candidate.region.y + candidate.region.height))

  return ((minY + maxY) / 2 - calloutRegion.y) / Math.max(1, calloutRegion.height)
}

function inferCompactMissingPeerRegion(
  calloutRegion: Region,
  lowerRegion: Region,
  nearestUpperRegion: Region,
  missingUpperRegion: Region,
): Region {
  const direction = Math.sign(regionCenterX(missingUpperRegion) - regionCenterX(nearestUpperRegion)) || 1
  const horizontalOffset = missingUpperRegion.x - nearestUpperRegion.x
  const staggerOffset = direction * Math.round(lowerRegion.width * 0.55)
  const verticalLift = Math.round(lowerRegion.height * 0.55)
  const minX = calloutRegion.x + 2
  const maxX = calloutRegion.x + calloutRegion.width - 2 - lowerRegion.width
  const minY = calloutRegion.y + 2
  const maxY = calloutRegion.y + calloutRegion.height - 2 - lowerRegion.height

  return {
    height: lowerRegion.height,
    width: lowerRegion.width,
    x: Math.max(minX, Math.min(maxX, lowerRegion.x + horizontalOffset + staggerOffset)),
    y: Math.max(minY, Math.min(maxY, lowerRegion.y - verticalLift)),
  }
}

function regionCenterX(region: Region): number {
  return region.x + region.width / 2
}

function regionCenterY(region: Region): number {
  return region.y + region.height / 2
}
