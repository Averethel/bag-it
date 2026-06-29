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
import { colorDistance, readAlpha, readPixel } from "./pixels"

export const RECOVERY_ASSEMBLY_OPTIONS: QuantityCandidateAssemblyOptions = {
  minVerticalRatio: 0.06,
}

export const COMPACT_MISSING_LOWER_PEER_RECOVERY_KIND: QuantityRecoveryKind = "compact-missing-lower-peer"
export const COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND: QuantityRecoveryKind =
  "compact-missing-same-row-trailing-peer"
export const COMPACT_MISSING_UPPER_PEER_ROW_RECOVERY_KIND: QuantityRecoveryKind =
  "compact-missing-upper-peer-row"

interface CompactMissingLowerPeerLayout {
  lower: QuantityCandidate
  upper: readonly [QuantityCandidate, QuantityCandidate]
}

interface CompactMissingSameRowTrailingPeerLayout {
  anchor: QuantityCandidate
}

interface CompactMissingUpperPeerRowLayout {
  lowerRow: readonly [QuantityCandidate, QuantityCandidate]
  upperRow: readonly QuantityCandidate[]
}

export function createQuantityRetryRecoveryPlans(
  candidates: readonly QuantityCandidate[],
  calloutRegion: Region,
): QuantityRecoveryPlan[] {
  const plans = [
    createCompactMissingLowerPeerRecoveryPlan(candidates, calloutRegion),
    createCompactMissingSameRowTrailingPeerRecoveryPlan(candidates, calloutRegion),
    createCompactMissingUpperPeerRowRecoveryPlan(candidates, calloutRegion),
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

function createCompactMissingSameRowTrailingPeerRecoveryPlan(
  candidates: readonly QuantityCandidate[],
  calloutRegion: Region,
): QuantityRecoveryPlan | null {
  const layout = findCompactMissingSameRowTrailingPeerLayout(candidates, calloutRegion)

  return layout
    ? createPlan(
      COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND,
      readSameRowTrailingPeerBand(layout.anchor, calloutRegion),
    )
    : null
}

function createCompactMissingUpperPeerRowRecoveryPlan(
  candidates: readonly QuantityCandidate[],
  calloutRegion: Region,
): QuantityRecoveryPlan | null {
  const layout = findCompactMissingUpperPeerRowLayout(candidates, calloutRegion)

  return layout
    ? createPlan(COMPACT_MISSING_UPPER_PEER_ROW_RECOVERY_KIND, readUpperPeerRowBand(layout.lowerRow, calloutRegion))
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

export function recoverCompactMissingSameRowTrailingPeerCandidates(
  page: Parameters<typeof assembleQuantityCandidates>[0],
  calloutRegion: Region,
  background: Parameters<typeof assembleQuantityCandidates>[2],
  candidates: readonly QuantityCandidate[],
  plan: QuantityRecoveryPlan,
): QuantityCandidate[] {
  const layout = findCompactMissingSameRowTrailingPeerLayout(candidates, calloutRegion)

  if (!layout) {
    return []
  }

  const parsed = assembleQuantityCandidates(page, calloutRegion, background, RECOVERY_ASSEMBLY_OPTIONS)
    .filter((candidate) => isCandidateInRecoveryBand(candidate, plan.targetBand))
    .filter((candidate) => isSameRowTrailingPeerCandidate(layout.anchor, candidate, calloutRegion))
    .map((candidate) => ({
      ...candidate,
      confidence: Math.min(0.78, layout.anchor.confidence, candidate.confidence),
      recoveryKind: COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND,
    }))
    .sort((left, right) =>
      readSameRowTrailingPeerScore(layout.anchor, left) -
      readSameRowTrailingPeerScore(layout.anchor, right)
    )[0]
  const recovered = parsed ?? inferSameRowTrailingPeerCandidate(layout.anchor, calloutRegion, plan.targetBand)

  if (!recovered) {
    return []
  }

  const hasBroadPartAbove = hasBroadTrailingPartAbove(page, background, calloutRegion, recovered)
  const hasReadableLabelDensity = hasPrintedLabelLikeForegroundDensity(page, background, recovered)

  return hasInferredLabelForeground(page, background, recovered.region) &&
    (hasReadableLabelDensity || hasBroadPartAbove) &&
    (hasPrintedBaselinePartAbove(page, background, [layout.anchor, recovered], recovered) || hasBroadPartAbove)
    ? [recovered]
    : []
}

export function recoverCompactMissingUpperPeerRowCandidates(
  page: Parameters<typeof assembleQuantityCandidates>[0],
  calloutRegion: Region,
  background: Parameters<typeof assembleQuantityCandidates>[2],
  candidates: readonly QuantityCandidate[],
  plan: QuantityRecoveryPlan,
): QuantityCandidate[] {
  const layout = findCompactMissingUpperPeerRowLayout(candidates, calloutRegion)

  if (!layout) {
    return []
  }

  return layout.lowerRow.flatMap((lower) => {
    const recovered = inferUpperPeerCandidate(lower, calloutRegion, layout.upperRow)

    if (
      !recovered ||
      !isCandidateInRecoveryBand(recovered, plan.targetBand) ||
      !hasInferredLabelForeground(page, background, recovered.region) ||
      !hasInferredLabelPartAbove(page, background, recovered.region)
    ) {
      return []
    }

    return [recovered]
  })
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

function findCompactMissingSameRowTrailingPeerLayout(
  candidates: readonly QuantityCandidate[],
  calloutRegion: Region,
): CompactMissingSameRowTrailingPeerLayout | null {
  if (
    candidates.length !== 1 ||
    !isCompactMissingPeerCalloutSize(candidates, calloutRegion) ||
    calloutRegion.height > calloutRegion.width * 0.95
  ) {
    return null
  }

  const anchor = candidates[0]
  const centerXRatio = (regionCenterX(anchor.region) - calloutRegion.x) / Math.max(1, calloutRegion.width)
  const centerYRatio = (regionCenterY(anchor.region) - calloutRegion.y) / Math.max(1, calloutRegion.height)
  const trailingRoom = calloutRegion.x + calloutRegion.width - (anchor.region.x + anchor.region.width)

  if (
    anchor.value < 3 ||
    centerXRatio > 0.42 ||
    centerYRatio < 0.52 ||
    centerYRatio > 0.88 ||
    trailingRoom < Math.max(44, anchor.region.width * 3)
  ) {
    return null
  }

  return { anchor }
}

function findCompactMissingUpperPeerRowLayout(
  candidates: readonly QuantityCandidate[],
  calloutRegion: Region,
): CompactMissingUpperPeerRowLayout | null {
  if (
    (candidates.length !== 2 && candidates.length !== 3) ||
    !isCompactMissingPeerCalloutSize(candidates, calloutRegion) ||
    calloutRegion.height < calloutRegion.width * 1.1
  ) {
    return null
  }

  const rows = clusterQuantityRows(candidates)
  const lowerRowCandidates = rows[rows.length - 1] ?? []
  const upperRows = rows.slice(0, -1)

  if (lowerRowCandidates.length !== 2 || upperRows.some((row) => row.length > 1)) {
    return null
  }

  const lowerRow = [...lowerRowCandidates].sort((left, right) => left.region.x - right.region.x) as [
    QuantityCandidate,
    QuantityCandidate,
  ]
  const upperRow = upperRows.flat()
  const [left, right] = lowerRow
  const rowCenterRatio = readRowCenterRatio(lowerRow, calloutRegion)
  const upperRowCenterRatio = upperRow.length === 0 ? null : readRowCenterRatio(upperRow, calloutRegion)
  const horizontalGap = Math.abs(regionCenterX(right.region) - regionCenterX(left.region))

  if (
    candidates.some((candidate) => candidate.value !== 1) ||
    !labelsShareLocalRow(left.region, right.region) ||
    !labelsHaveComparableSize(left.region, right.region) ||
    rowCenterRatio < 0.58 ||
    rowCenterRatio > 0.9 ||
    (upperRowCenterRatio !== null && (
      upperRowCenterRatio < 0.18 ||
      upperRowCenterRatio > 0.48 ||
      rowCenterRatio - upperRowCenterRatio < 0.22 ||
      rowCenterRatio - upperRowCenterRatio > 0.62
    )) ||
    upperRow.some((upper) => !labelsHaveComparableSize(upper.region, left.region)) ||
    upperRow.some((upper) =>
      lowerRow.every((lower) =>
        Math.abs(regionCenterX(upper.region) - regionCenterX(lower.region)) > Math.max(8, lower.region.width * 0.8)
      )
    ) ||
    horizontalGap < Math.max(18, left.region.width * 1.35) ||
    horizontalGap > Math.max(48, calloutRegion.width * 0.55)
  ) {
    return null
  }

  return { lowerRow, upperRow }
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

function readSameRowTrailingPeerBand(
  anchor: QuantityCandidate,
  calloutRegion: Region,
): Region {
  const verticalPadding = Math.max(4, Math.round(anchor.region.height * 1.25))
  const left = Math.max(
    calloutRegion.x,
    anchor.region.x + Math.max(anchor.region.width + 10, Math.round(anchor.region.width * 1.8)),
  )
  const right = calloutRegion.x + calloutRegion.width
  const top = Math.max(calloutRegion.y, anchor.region.y - verticalPadding)
  const bottom = Math.min(calloutRegion.y + calloutRegion.height, anchor.region.y + anchor.region.height + verticalPadding)

  return {
    height: Math.max(1, bottom - top),
    width: Math.max(1, right - left),
    x: left,
    y: top,
  }
}

function readUpperPeerRowBand(
  lowerRow: readonly [QuantityCandidate, QuantityCandidate],
  calloutRegion: Region,
): Region {
  const top = calloutRegion.y
  const lowerTop = Math.min(...lowerRow.map((candidate) => candidate.region.y))
  const referenceHeight = readMedian(lowerRow.map((candidate) => candidate.region.height))
  const bottom = Math.max(top + 1, lowerTop - Math.max(6, Math.round(referenceHeight * 0.6)))

  return {
    height: Math.max(1, bottom - top),
    width: calloutRegion.width,
    x: calloutRegion.x,
    y: top,
  }
}

function isSameRowTrailingPeerCandidate(
  anchor: QuantityCandidate,
  candidate: QuantityCandidate,
  calloutRegion: Region,
): boolean {
  const centerDeltaX = regionCenterX(candidate.region) - regionCenterX(anchor.region)
  const centerDeltaY = Math.abs(regionCenterY(candidate.region) - regionCenterY(anchor.region))
  const minDeltaX = Math.max(28, anchor.region.width * 1.8)
  const maxDeltaX = Math.max(78, calloutRegion.width * 0.68)

  return candidate.value === 1 &&
    candidate.region.width >= anchor.region.width * 0.55 &&
    candidate.region.width <= anchor.region.width * 1.35 &&
    candidate.region.height >= anchor.region.height * 0.55 &&
    candidate.region.height <= anchor.region.height * 1.35 &&
    centerDeltaX >= minDeltaX &&
    centerDeltaX <= maxDeltaX &&
    centerDeltaY <= Math.max(5, anchor.region.height * 0.65)
}

function readSameRowTrailingPeerScore(anchor: QuantityCandidate, candidate: QuantityCandidate): number {
  const expectedCenterDeltaX = anchor.region.width * 3.25

  return Math.abs(regionCenterX(candidate.region) - regionCenterX(anchor.region) - expectedCenterDeltaX) +
    Math.abs(regionCenterY(candidate.region) - regionCenterY(anchor.region)) * 2
}

function inferSameRowTrailingPeerCandidate(
  anchor: QuantityCandidate,
  calloutRegion: Region,
  targetBand: Region,
): QuantityCandidate | null {
  const region = {
    height: anchor.region.height,
    width: anchor.region.width,
    x: anchor.region.x + Math.round(anchor.region.width * 3.25),
    y: anchor.region.y,
  }
  const candidate: QuantityCandidate = {
    confidence: Math.min(0.74, anchor.confidence),
    glyphs: [],
    recoveryKind: COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND,
    region,
    text: "1x",
    value: 1,
  }

  return region.x + region.width <= calloutRegion.x + calloutRegion.width - 2 &&
    isCandidateInRecoveryBand(candidate, targetBand)
    ? candidate
    : null
}

function inferUpperPeerCandidate(
  lower: QuantityCandidate,
  calloutRegion: Region,
  existingUpperRow: readonly QuantityCandidate[] = [],
): QuantityCandidate | null {
  if (
    existingUpperRow.some((upper) =>
      Math.abs(regionCenterX(upper.region) - regionCenterX(lower.region)) <= Math.max(8, lower.region.width * 0.8)
    )
  ) {
    return null
  }

  const y = existingUpperRow.length > 0
    ? Math.round(readMedian(existingUpperRow.map((upper) => upper.region.y)))
    : calloutRegion.y + Math.round(calloutRegion.height * 0.29)

  if (lower.region.y - y < Math.max(20, lower.region.height * 1.8)) {
    return null
  }

  return {
    confidence: Math.min(0.76, lower.confidence),
    glyphs: [],
    recoveryKind: COMPACT_MISSING_UPPER_PEER_ROW_RECOVERY_KIND,
    region: {
      height: lower.region.height,
      width: lower.region.width,
      x: lower.region.x,
      y,
    },
    text: lower.text,
    value: lower.value,
  }
}

function hasInferredLabelForeground(
  page: Parameters<typeof assembleQuantityCandidates>[0],
  background: Parameters<typeof assembleQuantityCandidates>[2],
  region: Region,
): boolean {
  let darkLabelPixels = 0

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const pixel = readPixel(page, x, y)

      if (
        readAlpha(page, x, y) >= 32 &&
        colorDistance(pixel, background) >= 30 &&
        pixel.r + pixel.g + pixel.b <= 180
      ) {
        darkLabelPixels += 1
      }
    }
  }

  return darkLabelPixels >= Math.max(3, Math.round(region.width * region.height * 0.02))
}

function hasInferredLabelPartAbove(
  page: Parameters<typeof assembleQuantityCandidates>[0],
  background: Parameters<typeof assembleQuantityCandidates>[2],
  region: Region,
): boolean {
  const padding = Math.max(2, Math.round(region.height * 0.35))
  const top = Math.max(0, region.y - Math.max(8, Math.round(region.height * 1.9)))
  let foregroundPixels = 0
  const foregroundRows = new Set<number>()

  for (let y = top; y < region.y; y += 1) {
    for (let x = Math.max(0, region.x - padding); x < Math.min(page.width, region.x + region.width + padding); x += 1) {
      if (readAlpha(page, x, y) >= 32 && colorDistance(readPixel(page, x, y), background) >= 30) {
        foregroundPixels += 1
        foregroundRows.add(y)
      }
    }
  }

  return foregroundPixels >= Math.max(4, Math.round(region.width * 0.25)) &&
    foregroundRows.size >= Math.max(3, Math.round(region.height * 0.25))
}

function hasBroadTrailingPartAbove(
  page: Parameters<typeof assembleQuantityCandidates>[0],
  background: Parameters<typeof assembleQuantityCandidates>[2],
  calloutRegion: Region,
  candidate: QuantityCandidate,
): boolean {
  const left = Math.max(calloutRegion.x, candidate.region.x - Math.max(8, Math.round(candidate.region.width * 0.9)))
  const right = Math.min(
    page.width,
    calloutRegion.x + calloutRegion.width - Math.max(2, Math.round(candidate.region.width * 0.2)),
  )
  const top = Math.max(calloutRegion.y, candidate.region.y - Math.max(38, Math.round(candidate.region.height * 4.3)))
  const bottom = candidate.region.y
  let foregroundPixels = 0
  const foregroundRows = new Set<number>()

  if (right <= left || bottom <= top) {
    return false
  }

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (readAlpha(page, x, y) >= 32 && colorDistance(readPixel(page, x, y), background) >= 18) {
        foregroundPixels += 1
        foregroundRows.add(y)
      }
    }
  }

  return foregroundPixels >= Math.max(14, Math.round(candidate.region.width * 1.2)) &&
    foregroundRows.size >= Math.max(4, Math.round(candidate.region.height * 0.35))
}

function labelsHaveComparableSize(left: Region, right: Region): boolean {
  return Math.abs(left.width - right.width) <= Math.max(3, Math.round(Math.max(left.width, right.width) * 0.25)) &&
    Math.abs(left.height - right.height) <= Math.max(3, Math.round(Math.max(left.height, right.height) * 0.25))
}

function labelsShareLocalRow(left: Region, right: Region): boolean {
  return Math.abs(regionCenterY(left) - regionCenterY(right)) <= Math.max(8, Math.max(left.height, right.height) * 1.1)
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
