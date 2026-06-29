import {
  COMPACT_MISSING_LOWER_PEER_RECOVERY_KIND,
  createQuantityRetryRecoveryPlans,
  findRasterQuantityLabelSets,
  recoverCompactMissingLowerPeerCandidates,
  type QuantityCandidate,
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
import { compareRegions, insetRegion, unionRegions } from "./regions"

export { suppressDuplicateOwnedPartRows } from "./part-duplicate-owners"

const CALLOUT_BORDER_INSET = 3

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
  const recoveredFinalItems = recoverCompactMissingLowerPeerItems(page, callout, background, backgroundModel, transferredFinalItems)
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
