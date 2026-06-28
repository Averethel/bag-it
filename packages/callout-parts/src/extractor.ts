import {
  COMPACT_MISSING_LOWER_PEER_RECOVERY_KIND,
  createQuantityRetryRecoveryPlans,
  findRasterQuantityLabelSets,
  recoverCompactMissingLowerPeerCandidates,
  type QuantityCandidate,
  type QuantityRecoveryKind,
} from "@bag-it/raster-quantity-labels"
import type {
  CalloutPartCalloutInput,
  CalloutPartCalloutResult,
  CalloutPartExtractionResult,
  CalloutPartItem,
  CalloutPartPageInput,
  CalloutQuantityLabel,
  Region,
} from "./contracts"
import { createBackgroundModel, type BackgroundKind, type BackgroundModel } from "./background-model"
import { createStageSnapshot, mergeFailures } from "./diagnostics"
import {
  applyDuplicatePartImageTransfers,
  resolveDuplicateOwnedPartRows,
} from "./part-duplicate-owners"
import { readCalloutBackground } from "./pixels"
import { createPartImageForLabel } from "./part-foreground"
import { compareRegions, insetRegion, overlapRatio, regionCenter, unionRegions } from "./regions"

export { suppressDuplicateOwnedPartRows } from "./part-duplicate-owners"

const CALLOUT_BORDER_INSET = 3
const COMPACT_MISSING_SAME_ROW_LEADING_PEER_KIND: QuantityRecoveryKind = "compact-missing-same-row-leading-peer"

interface ExtractedCalloutParts {
  backgroundKind: BackgroundKind
  labelCount: number
  partCropMissingCount: number
  result: CalloutPartCalloutResult
}

interface ExtractedItemsForLabels {
  items: CalloutPartItem[]
  missingPartCropCount: number
}

export function extractCalloutPartsForPage({
  callouts,
  page,
}: {
  callouts: readonly CalloutPartCalloutInput[]
  page: CalloutPartPageInput
}): CalloutPartExtractionResult {
  const extractedCallouts = callouts.map((callout) => extractCalloutParts(page, callout))
  const calloutResults = extractedCallouts.map((callout) => callout.result)
  const items = calloutResults.flatMap((result) => result.items)
  const totalLabels = extractedCallouts.reduce((total, callout) => total + callout.labelCount, 0)
  const zeroLabelCallouts = extractedCallouts.filter((callout) => callout.labelCount === 0).length
  const missingPartCrops = extractedCallouts.reduce((total, callout) => total + callout.partCropMissingCount, 0)
  const quantitySnapshot = createStageSnapshot({
    accepted: totalLabels,
    failures: { "quantity-missing": zeroLabelCallouts },
    rejected: zeroLabelCallouts,
    stageId: "quantity-labels",
    total: callouts.length,
  })
  const partSnapshot = createStageSnapshot({
    accepted: items.length,
    failures: { "part-crop-missing": missingPartCrops },
    notes: [formatBackgroundKindNote(extractedCallouts.map((callout) => callout.backgroundKind))],
    rejected: missingPartCrops,
    stageId: "part-extraction",
    total: totalLabels,
  })
  const stageSnapshots = [quantitySnapshot, partSnapshot]

  return {
    callouts: calloutResults,
    failures: mergeFailures(stageSnapshots),
    items,
    stageSnapshots,
  }
}

function extractCalloutParts(
  page: CalloutPartPageInput,
  callout: CalloutPartCalloutInput,
): ExtractedCalloutParts {
  assertCalloutPage(page, callout)

  const background = readCalloutBackground(page, callout.region, callout.background)
  const labelSets = findRasterQuantityLabelSets(page, callout.region, background)
  const labels = labelSets.emitted
  const suppressionLabels = labelSets.suppression
  const backgroundModel = createBackgroundModel(
    page,
    insetRegion(callout.region, CALLOUT_BORDER_INSET),
    background,
    { excludedRegions: suppressionLabels.map((label) => label.region) },
  )
  const extractedItems = extractItemsForLabels(page, callout, backgroundModel, labels, suppressionLabels)
  const duplicateResolution = resolveDuplicateOwnedPartRows(suppressionLabels, extractedItems.items)
  const keptItems = duplicateResolution.keptItems
  const finalItems = keptItems.length === extractedItems.items.length
    ? keptItems
    : extractItemsForLabels(
      page,
      callout,
      backgroundModel,
      labels.filter((label) => keptItems.some((item) => item.quantityLabel === label)),
      duplicateResolution.rerunSuppressionLabels,
    ).items
  const transferredFinalItems = applyDuplicatePartImageTransfers(finalItems, duplicateResolution.partImageTransfers)
  const sameRowRecoveredItems = recoverCompactMissingSameRowLeadingPeerItems(
    page,
    callout,
    backgroundModel,
    transferredFinalItems,
  )
  const recoveredFinalItems = recoverCompactMissingLowerPeerItems(page, callout, background, backgroundModel, sameRowRecoveredItems)
  const cleanedFinalItems = recoveredFinalItems.length === transferredFinalItems.length
    ? recoveredFinalItems
    : cleanRecoveredDuplicateItems(duplicateResolution.rerunSuppressionLabels, recoveredFinalItems)
  pushDebugEntry({
    calloutId: callout.id,
    emitted: labels.map(readLabelDebugEntry),
    finalItems: cleanedFinalItems.map((item) => readLabelDebugEntry(item.quantityLabel)),
    keptItems: keptItems.map((item) => readLabelDebugEntry(item.quantityLabel)),
    pageNumber: page.pageNumber,
    region: callout.region,
    suppression: suppressionLabels.map(readLabelDebugEntry),
  })
  const items = reindexPartItems(callout.id, cleanedFinalItems)
  const labelCount = Math.max(labels.length, items.length)

  return {
    backgroundKind: backgroundModel.kind,
    labelCount,
    partCropMissingCount: Math.max(0, labelCount - items.length),
    result: {
      calloutId: callout.id,
      items,
      pageNumber: page.pageNumber,
    },
  }
}

function cleanRecoveredDuplicateItems(
  suppressionLabels: readonly CalloutQuantityLabel[],
  items: readonly CalloutPartItem[],
): CalloutPartItem[] {
  const resolution = resolveDuplicateOwnedPartRows(
    suppressionLabels,
    items,
    { allowTransferredEmbeddedPartMatch: true },
  )

  return applyDuplicatePartImageTransfers(resolution.keptItems, resolution.partImageTransfers)
}

function recoverCompactMissingSameRowLeadingPeerItems(
  page: CalloutPartPageInput,
  callout: CalloutPartCalloutInput,
  backgroundModel: BackgroundModel,
  items: readonly CalloutPartItem[],
): CalloutPartItem[] {
  const labels = items.map((item) => item.quantityLabel)
  const recoveredItems: CalloutPartItem[] = []

  for (const row of clusterLocalItemRows(items)) {
    if (row.length !== items.length) {
      continue
    }

    recoveredItems.push(...recoverLeadingPeerForRow(
      page,
      callout,
      backgroundModel,
      labels,
      row,
      items.length + recoveredItems.length,
    ))
  }

  if (recoveredItems.length === 0) {
    return [...items]
  }

  return [...items, ...recoveredItems]
    .sort((left, right) => compareRegions(left.quantityLabel.region, right.quantityLabel.region))
}

function recoverLeadingPeerForRow(
  page: CalloutPartPageInput,
  callout: CalloutPartCalloutInput,
  backgroundModel: BackgroundModel,
  labels: readonly CalloutQuantityLabel[],
  row: readonly CalloutPartItem[],
  nextIndex: number,
): CalloutPartItem[] {
  const peers = [...row]
    .filter((item) => item.quantityLabel.value <= 2)
    .sort((left, right) => left.quantityLabel.region.x - right.quantityLabel.region.x)

  if (peers.length < 2) {
    return []
  }

  const [leftPeer, rightPeer] = peers
  const inferredLabel = inferMissingLeadingPeerLabel(callout.region, leftPeer.quantityLabel, rightPeer.quantityLabel)

  if (
    !inferredLabel ||
    labels.some((label) => labelsOverlap(label.region, inferredLabel.region)) ||
    peers.some((item) => overlapRatio(item.partImage.region, inferredLabel.region) > 0)
  ) {
    return []
  }

  const ownershipLabels = [inferredLabel, ...labels]
  const partImage = createPartImageForLabel(page, callout, backgroundModel, ownershipLabels, ownershipLabels, inferredLabel)

  if (!partImage || !isRecoveredLeadingPeerPartImage(partImage, inferredLabel, leftPeer)) {
    return []
  }

  return [{
    calloutId: callout.id,
    confidence: Math.min(0.86, 0.58 + inferredLabel.confidence * 0.2),
    id: createPartItemId(callout.id, nextIndex, partImage.region),
    indexOnCallout: nextIndex,
    partImage,
    quantityLabel: inferredLabel,
    sourceRegion: unionRegions([partImage.region, inferredLabel.region]),
  }]
}

function inferMissingLeadingPeerLabel(
  calloutRegion: Region,
  leftPeer: CalloutQuantityLabel,
  rightPeer: CalloutQuantityLabel,
): CalloutQuantityLabel | null {
  if (
    leftPeer.text !== rightPeer.text ||
    leftPeer.value !== rightPeer.value ||
    !labelsHaveComparableSize(leftPeer.region, rightPeer.region) ||
    !labelsShareLocalRow(leftPeer.region, rightPeer.region)
  ) {
    return null
  }

  const spacing = rightPeer.region.x - leftPeer.region.x

  if (
    spacing < Math.max(14, leftPeer.region.width * 1.4) ||
    spacing > Math.max(54, leftPeer.region.width * 4)
  ) {
    return null
  }

  const region = {
    height: Math.round((leftPeer.region.height + rightPeer.region.height) / 2),
    width: Math.round((leftPeer.region.width + rightPeer.region.width) / 2),
    x: leftPeer.region.x - spacing,
    y: Math.round((leftPeer.region.y + rightPeer.region.y) / 2),
  }

  if (!regionInsideCalloutInterior(region, calloutRegion)) {
    return null
  }

  return {
    confidence: Math.min(leftPeer.confidence, rightPeer.confidence, 0.78),
    glyphs: [],
    recoveryKind: COMPACT_MISSING_SAME_ROW_LEADING_PEER_KIND,
    region,
    text: leftPeer.text,
    value: leftPeer.value,
  }
}

function isRecoveredLeadingPeerPartImage(
  partImage: CalloutPartItem["partImage"],
  label: CalloutQuantityLabel,
  leftPeer: CalloutPartItem,
): boolean {
  const labelCenter = regionCenter(label.region)
  const imageCenter = regionCenter(partImage.region)
  const leftPeerCenter = regionCenter(leftPeer.partImage.region)
  const opaquePixels = countOpaquePixels(partImage.alphaMask.data)
  const partAboveLabel = partImage.region.y + partImage.region.height <= label.region.y + Math.max(8, label.region.height)
  const separatedFromPeer = imageCenter.x < leftPeerCenter.x - Math.max(6, label.region.width * 0.45)

  return opaquePixels >= Math.max(12, Math.ceil(label.region.width * label.region.height * 0.45)) &&
    partAboveLabel &&
    separatedFromPeer &&
    Math.abs(imageCenter.x - labelCenter.x) <= Math.max(26, label.region.width * 1.9)
}

function clusterLocalItemRows(items: readonly CalloutPartItem[]): CalloutPartItem[][] {
  const rows: CalloutPartItem[][] = []

  for (const item of [...items].sort((left, right) => left.quantityLabel.region.y - right.quantityLabel.region.y)) {
    const row = rows.find((candidateRow) => itemBelongsToRow(item, candidateRow))

    if (row) {
      row.push(item)
    } else {
      rows.push([item])
    }
  }

  return rows
}

function itemBelongsToRow(item: CalloutPartItem, row: readonly CalloutPartItem[]): boolean {
  const centerY = row.reduce((sum, entry) => sum + regionCenter(entry.quantityLabel.region).y, 0) / row.length
  const label = item.quantityLabel.region

  return Math.abs(regionCenter(label).y - centerY) <= Math.max(8, label.height * 1.1)
}

function labelsHaveComparableSize(left: Region, right: Region): boolean {
  return Math.abs(left.width - right.width) <= Math.max(3, Math.round(Math.max(left.width, right.width) * 0.25)) &&
    Math.abs(left.height - right.height) <= Math.max(3, Math.round(Math.max(left.height, right.height) * 0.25))
}

function labelsShareLocalRow(left: Region, right: Region): boolean {
  return Math.abs(regionCenter(left).y - regionCenter(right).y) <= Math.max(8, Math.max(left.height, right.height) * 1.1)
}

function regionInsideCalloutInterior(region: Region, calloutRegion: Region): boolean {
  const inset = CALLOUT_BORDER_INSET

  return region.x >= calloutRegion.x + inset &&
    region.y >= calloutRegion.y + inset &&
    region.x + region.width <= calloutRegion.x + calloutRegion.width - inset &&
    region.y + region.height <= calloutRegion.y + calloutRegion.height - inset
}

function labelsOverlap(left: Region, right: Region): boolean {
  return overlapRatio(left, right) > 0 || overlapRatio(right, left) > 0
}

function countOpaquePixels(data: Uint8ClampedArray): number {
  let count = 0

  for (const alpha of data) {
    if (alpha > 0) {
      count += 1
    }
  }

  return count
}

export function recoverCompactMissingLowerPeerItems(
  page: CalloutPartPageInput,
  callout: CalloutPartCalloutInput,
  background: ReturnType<typeof readCalloutBackground>,
  backgroundModel: BackgroundModel,
  items: readonly CalloutPartItem[],
): CalloutPartItem[] {
  const candidates = items.map(createQuantityCandidateFromItem)
  const plan = createQuantityRetryRecoveryPlans(candidates, callout.region)
    .find((candidatePlan) => candidatePlan.kind === COMPACT_MISSING_LOWER_PEER_RECOVERY_KIND)

  if (!plan) {
    return [...items]
  }

  const recoveredLabels = recoverCompactMissingLowerPeerCandidates(page, callout.region, background, candidates, plan)
    .map(createQuantityLabelFromCandidate)

  if (recoveredLabels.length === 0) {
    return [...items]
  }

  const ownershipLabels = [...items.map((item) => item.quantityLabel), ...recoveredLabels]
  const recoveredItems = recoveredLabels.flatMap((label, index) => {
    const partImage = createPartImageForLabel(page, callout, backgroundModel, ownershipLabels, ownershipLabels, label)

    if (!partImage) {
      return []
    }

    return [{
      calloutId: callout.id,
      confidence: Math.min(0.92, 0.68 + label.confidence * 0.22),
      id: createPartItemId(callout.id, items.length + index, partImage.region),
      indexOnCallout: items.length + index,
      partImage,
      quantityLabel: label,
      sourceRegion: unionRegions([partImage.region, label.region]),
    }]
  })

  return [...items, ...recoveredItems]
    .sort((left, right) => compareRegions(left.quantityLabel.region, right.quantityLabel.region))
}

function extractItemsForLabels(
  page: CalloutPartPageInput,
  callout: CalloutPartCalloutInput,
  backgroundModel: BackgroundModel,
  ownershipLabels: readonly CalloutQuantityLabel[],
  suppressionLabels: readonly CalloutQuantityLabel[] = ownershipLabels,
): ExtractedItemsForLabels {
  let missingPartCropCount = 0
  const items = ownershipLabels.flatMap((label, index) => {
    const partImage = createPartImageForLabel(page, callout, backgroundModel, ownershipLabels, suppressionLabels, label)

    if (!partImage) {
      missingPartCropCount += 1
      return []
    }

    const item: CalloutPartItem = {
      calloutId: callout.id,
      confidence: Math.min(0.92, 0.68 + label.confidence * 0.22),
      id: createPartItemId(callout.id, index, partImage.region),
      indexOnCallout: index,
      partImage,
      quantityLabel: label,
      sourceRegion: unionRegions([partImage.region, label.region]),
    }

    return [item]
  })

  return {
    items,
    missingPartCropCount,
  }
}

function createQuantityCandidateFromItem(item: CalloutPartItem): QuantityCandidate {
  return {
    confidence: item.quantityLabel.confidence,
    glyphs: [],
    recoveryKind: item.quantityLabel.recoveryKind,
    region: item.quantityLabel.region,
    text: item.quantityLabel.text,
    value: item.quantityLabel.value,
  }
}

function createQuantityLabelFromCandidate(candidate: QuantityCandidate): CalloutQuantityLabel {
  return {
    confidence: candidate.confidence,
    glyphs: candidate.glyphs,
    recoveryKind: candidate.recoveryKind,
    region: candidate.region,
    text: candidate.text,
    value: candidate.value,
  }
}

interface CalloutPartsDebugState {
  enabled?: boolean
  entries?: unknown[]
}

function pushDebugEntry(entry: unknown): void {
  const state = (globalThis as { __bagItCalloutPartsDebug?: CalloutPartsDebugState }).__bagItCalloutPartsDebug

  if (!state?.enabled) {
    return
  }

  if (!state.entries) {
    state.entries = []
  }

  state.entries.push(entry)
}

function readLabelDebugEntry(label: CalloutQuantityLabel): unknown {
  return {
    confidence: label.confidence,
    recoveryKind: label.recoveryKind,
    region: label.region,
    text: label.text,
    value: label.value,
  }
}

function reindexPartItems(calloutId: string, items: readonly CalloutPartItem[]): CalloutPartItem[] {
  return items.map((item, index) => ({
    ...item,
    id: createPartItemId(calloutId, index, item.partImage.region),
    indexOnCallout: index,
  }))
}

function assertCalloutPage(page: CalloutPartPageInput, callout: CalloutPartCalloutInput): void {
  if (page.pageNumber !== callout.pageNumber) {
    throw new RangeError(`callout page ${callout.pageNumber} does not match page ${page.pageNumber}.`)
  }
}

function createPartItemId(calloutId: string, index: number, region: Region): string {
  return `${calloutId}:part-${index}:${region.x},${region.y},${region.width},${region.height}`
}

function formatBackgroundKindNote(backgroundKinds: readonly BackgroundKind[]): string {
  const counts = {
    flat: 0,
    gradient: 0,
    mixed: 0,
  }

  for (const kind of backgroundKinds) {
    counts[kind] += 1
  }

  return `backgrounds flat=${counts.flat} gradient=${counts.gradient} mixed=${counts.mixed}`
}
