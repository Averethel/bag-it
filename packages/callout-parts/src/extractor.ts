import {
  COMPACT_MISSING_LOWER_PEER_RECOVERY_KIND,
  COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND,
  COMPACT_MISSING_UPPER_PEER_ROW_RECOVERY_KIND,
  createQuantityRetryRecoveryPlans,
  findRasterQuantityLabelSets,
  recoverCompactMissingLowerPeerCandidates,
  recoverCompactMissingSameRowTrailingPeerCandidates,
  recoverCompactMissingUpperPeerRowCandidates,
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
import { createBackgroundModel, createFlatBackgroundModel, type BackgroundKind, type BackgroundModel } from "./background-model"
import { createStageSnapshot, mergeFailures } from "./diagnostics"
import { cropAlphaMask } from "./alpha-mask-geometry"
import {
  applyDuplicatePartImageTransfers,
  resolveDuplicateOwnedPartRows,
} from "./part-duplicate-owners"
import { colorDistance, readAlpha, readCalloutBackground, readPixel } from "./pixels"
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
  const labels = dropOrphanUpperOnePartArtLabels(labelSets.emitted)
  const trailingPeerRecoveryLabels = selectTrailingPeerRecoveryLabels(
    callout,
    labels,
    labelSets.suppression,
  )
  const suppressionLabels = labelSets.suppression.filter((label) =>
    labels.some((kept) => labelsHaveSameRegion(kept, label)),
  )
  const backgroundModel = createBackgroundModel(
    page,
    insetRegion(callout.region, CALLOUT_BORDER_INSET),
    background,
    { excludedRegions: suppressionLabels.map((label) => label.region) },
  )
  const extractedItems = extractItemsForLabels(page, callout, background, backgroundModel, labels, suppressionLabels)
  const duplicateResolution = resolveDuplicateOwnedPartRows(suppressionLabels, extractedItems.items)
  const keptItems = duplicateResolution.keptItems
  const finalItems = keptItems.length === extractedItems.items.length
    ? keptItems
    : extractItemsForLabels(
      page,
      callout,
      background,
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
  const recoveredFinalItems = recoverCompactMissingRetryPeerItems(page, callout, background, backgroundModel, sameRowRecoveredItems)
  const cleanedFinalItems = recoveredFinalItems.length === transferredFinalItems.length
    ? recoveredFinalItems
    : cleanRecoveredDuplicateItems(duplicateResolution.rerunSuppressionLabels, recoveredFinalItems)
  const restoredTrailingItems = restoreDroppedTrailingPeerItems(recoveredFinalItems, cleanedFinalItems)
  const orphanCleanedItems = dropOrphanUpperOnePartArtItems(restoredTrailingItems)
  const nativeTrailingRecoveredItems = recoverDroppedNativeSameRowTrailingPeerItems(
    page,
    callout,
    background,
    backgroundModel,
    trailingPeerRecoveryLabels,
    orphanCleanedItems,
  )
  const geometryRecoveredItems = recoverSameRowOnePeerTopCrops(page, callout, background, nativeTrailingRecoveredItems)
  const normalizedRows = normalizeCompactEightNineRows(geometryRecoveredItems)
  const normalizedFinalItems = recoverSuppressedFragmentTrailingPeerItems(
    page,
    callout,
    background,
    normalizedRows,
  )
  pushDebugEntry({
    calloutId: callout.id,
    emitted: labels.map(readLabelDebugEntry),
    finalItems: normalizedFinalItems.map((item) => readLabelDebugEntry(item.quantityLabel)),
    keptItems: keptItems.map((item) => readLabelDebugEntry(item.quantityLabel)),
    pageNumber: page.pageNumber,
    rawSuppression: labelSets.suppression.map(readLabelDebugEntry),
    region: callout.region,
    suppression: suppressionLabels.map(readLabelDebugEntry),
    trailingPeerRecovery: trailingPeerRecoveryLabels.map(readLabelDebugEntry),
  })
  const items = reindexPartItems(callout.id, normalizedFinalItems)
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

function restoreDroppedTrailingPeerItems(
  beforeCleanupItems: readonly CalloutPartItem[],
  afterCleanupItems: readonly CalloutPartItem[],
): CalloutPartItem[] {
  const restored = beforeCleanupItems.filter((item) =>
    !afterCleanupItems.some((candidate) => labelsHaveSameRegion(candidate.quantityLabel, item.quantityLabel)) &&
    isRestorableTrailingPeerItem(item, afterCleanupItems),
  )

  return restored.length === 0
    ? [...afterCleanupItems]
    : [...afterCleanupItems, ...restored]
      .sort((left, right) => compareRegions(left.quantityLabel.region, right.quantityLabel.region))
}

function isRestorableTrailingPeerItem(
  item: CalloutPartItem,
  keptItems: readonly CalloutPartItem[],
): boolean {
  if (
    item.quantityLabel.value !== 1 ||
    item.quantityLabel.recoveryKind !== COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND
  ) {
    return false
  }

  const labels = [...keptItems.map((keptItem) => keptItem.quantityLabel), item.quantityLabel]
  const previous = readPreviousSameRowQuantityLabel(labels, item.quantityLabel)

  return Boolean(
    previous &&
      previous.value >= 3 &&
      keptItems.some((keptItem) => keptItem.quantityLabel === previous) &&
      isRecoveredTrailingPeerPartImage(item.partImage, item.quantityLabel, labels),
  )
}

function recoverDroppedNativeSameRowTrailingPeerItems(
  page: CalloutPartPageInput,
  callout: CalloutPartCalloutInput,
  background: ReturnType<typeof readCalloutBackground>,
  backgroundModel: BackgroundModel,
  labels: readonly CalloutQuantityLabel[],
  items: readonly CalloutPartItem[],
): CalloutPartItem[] {
  const recoveredItems: CalloutPartItem[] = []

  for (const label of labels) {
    if (
      items.some((item) => labelsHaveSameRegion(item.quantityLabel, label)) ||
      recoveredItems.some((item) => labelsHaveSameRegion(item.quantityLabel, label)) ||
      !isCompactSameRowTrailingPeerLabel(callout, label, labels)
    ) {
      continue
    }

    const previous = readPreviousSameRowQuantityLabel(
      [...items.map((item) => item.quantityLabel), label],
      label,
    )

    const previousItem = previous
      ? items.find((item) => labelsHaveSameRegion(item.quantityLabel, previous))
      : undefined

    if (!previousItem) {
      continue
    }

    const ownershipLabels = [...items.map((item) => item.quantityLabel), label]
      .sort((left, right) => compareRegions(left.region, right.region))
    const partImage = createPartImageForRecoveredLabel(page, callout, background, backgroundModel, ownershipLabels, label) ??
      createTrailingPeerGeometryPartImage(page, callout, background, label, previousItem)

    if (!partImage) {
      continue
    }

    recoveredItems.push({
      calloutId: callout.id,
      confidence: Math.min(0.9, 0.66 + label.confidence * 0.22),
      id: createPartItemId(callout.id, items.length + recoveredItems.length, partImage.region),
      indexOnCallout: items.length + recoveredItems.length,
      partImage,
      quantityLabel: label,
      sourceRegion: unionRegions([partImage.region, label.region]),
    })
  }

  return recoveredItems.length === 0
    ? [...items]
    : [...items, ...recoveredItems].sort((left, right) => compareRegions(left.quantityLabel.region, right.quantityLabel.region))
}

function recoverSameRowOnePeerTopCrops(
  page: CalloutPartPageInput,
  callout: CalloutPartCalloutInput,
  background: ReturnType<typeof readCalloutBackground>,
  items: readonly CalloutPartItem[],
): CalloutPartItem[] {
  return items.map((item) => {
    const previous = readPreviousSameRowPartItem(items, item)
    const rowItems = readSameRowPartItems(items, item)

    if (!previous || !shouldRecoverSameRowOnePeerTopCrop(callout, rowItems, previous, item)) {
      return item
    }

    const region = createSameRowOnePeerTopCropRegion(callout, previous, item)
    const partImage = createGeometryPartImage(page, background, region, [previous.quantityLabel, item.quantityLabel])

    return {
      ...item,
      partImage,
      sourceRegion: unionRegions([partImage.region, item.quantityLabel.region]),
    }
  })
}

function recoverSuppressedFragmentTrailingPeerItems(
  page: CalloutPartPageInput,
  callout: CalloutPartCalloutInput,
  background: ReturnType<typeof readCalloutBackground>,
  items: readonly CalloutPartItem[],
): CalloutPartItem[] {
  const recoveredItems: CalloutPartItem[] = []

  for (const anchor of items) {
    if (!isSuppressedFragmentTrailingPeerAnchor(callout, items, anchor)) {
      continue
    }

    const label = inferSuppressedFragmentTrailingPeerLabel(callout, anchor)

    if (
      !label ||
      items.some((item) => labelsOverlap(item.quantityLabel.region, label.region)) ||
      !readTrailingPeerSuppressedFragment(anchor, label)
    ) {
      continue
    }

    const partImage = createTrailingPeerGeometryPartImage(page, callout, background, label, anchor)

    if (!partImage) {
      continue
    }

    recoveredItems.push({
      calloutId: callout.id,
      confidence: Math.min(0.86, 0.62 + anchor.quantityLabel.confidence * 0.2),
      id: createPartItemId(callout.id, items.length + recoveredItems.length, partImage.region),
      indexOnCallout: items.length + recoveredItems.length,
      partImage,
      quantityLabel: label,
      sourceRegion: unionRegions([partImage.region, label.region]),
    })
  }

  return recoveredItems.length === 0
    ? [...items]
    : [...items, ...recoveredItems].sort((left, right) => compareRegions(left.quantityLabel.region, right.quantityLabel.region))
}

function isSuppressedFragmentTrailingPeerAnchor(
  callout: CalloutPartCalloutInput,
  items: readonly CalloutPartItem[],
  anchor: CalloutPartItem,
): boolean {
  const label = anchor.quantityLabel
  const centerXRatio = (regionCenter(label.region).x - callout.region.x) / Math.max(1, callout.region.width)
  const centerYRatio = (regionCenter(label.region).y - callout.region.y) / Math.max(1, callout.region.height)
  const trailingRoom = callout.region.x + callout.region.width - (label.region.x + label.region.width)

  return label.value >= 3 &&
    callout.region.height <= callout.region.width * 0.95 &&
    !readNextSameRowQuantityLabel(items.map((item) => item.quantityLabel), label) &&
    centerXRatio <= 0.42 &&
    centerYRatio >= 0.52 &&
    centerYRatio <= 0.88 &&
    trailingRoom >= Math.max(44, label.region.width * 3)
}

function inferSuppressedFragmentTrailingPeerLabel(
  callout: CalloutPartCalloutInput,
  anchor: CalloutPartItem,
): CalloutQuantityLabel | null {
  const anchorRegion = anchor.quantityLabel.region
  const region = {
    height: anchorRegion.height,
    width: anchorRegion.width,
    x: anchorRegion.x + Math.round(anchorRegion.width * 3.25),
    y: anchorRegion.y,
  }

  if (!regionInsideCalloutInterior(region, callout.region)) {
    return null
  }

  return {
    confidence: Math.min(0.72, anchor.quantityLabel.confidence),
    glyphs: [],
    recoveryKind: COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND,
    region,
    text: "1x",
    value: 1,
  }
}

function readTrailingPeerSuppressedFragment(
  anchor: CalloutPartItem,
  label: CalloutQuantityLabel,
): Region | undefined {
  const anchorRegion = anchor.quantityLabel.region
  const labelCenter = regionCenter(label.region)

  return anchor.partImage.diagnostics?.excludedLabelRegions
    .filter((region) =>
      region.x > anchorRegion.x + Math.max(anchorRegion.width * 1.6, 24) &&
      region.width >= 3 &&
      region.height >= 2 &&
      region.width <= Math.max(anchorRegion.width, label.region.width) * 1.1 &&
      region.height <= Math.max(anchorRegion.height, label.region.height) * 0.9 &&
      (
        overlapRatio(region, label.region) > 0 ||
        Math.abs(regionCenter(region).y - labelCenter.y) <= Math.max(8, label.region.height * 0.9)
      ),
    )
    .sort((left, right) =>
      readRegionCenterDistance(left, labelCenter) - readRegionCenterDistance(right, labelCenter)
    )[0]
}

function readRegionCenterDistance(region: Region, point: { x: number; y: number }): number {
  const center = regionCenter(region)

  return Math.abs(center.x - point.x) + Math.abs(center.y - point.y)
}

function shouldRecoverSameRowOnePeerTopCrop(
  callout: CalloutPartCalloutInput,
  rowItems: readonly CalloutPartItem[],
  previous: CalloutPartItem,
  item: CalloutPartItem,
): boolean {
  if (
    rowItems.length !== 2 ||
    callout.region.width > Math.max(112, item.quantityLabel.region.width * 8) ||
    previous.quantityLabel.value !== 1 ||
    item.quantityLabel.value !== 1 ||
    !labelsHaveComparableSize(previous.quantityLabel.region, item.quantityLabel.region) ||
    !labelsShareLocalRow(previous.quantityLabel.region, item.quantityLabel.region)
  ) {
    return false
  }

  const currentTopGap = item.partImage.region.y - callout.region.y
  const previousTopGap = previous.partImage.region.y - callout.region.y
  const peerTopSeparation = item.partImage.region.y - previous.partImage.region.y

  return currentTopGap >= Math.max(30, item.quantityLabel.region.height * 2.6) &&
    previousTopGap >= Math.max(12, item.quantityLabel.region.height) &&
    peerTopSeparation >= Math.max(10, item.quantityLabel.region.height * 0.9) &&
    item.partImage.region.height <= Math.max(36, item.quantityLabel.region.height * 3.4) &&
    item.partImage.region.width <= Math.max(42, item.quantityLabel.region.width * 3.2)
}

function createSameRowOnePeerTopCropRegion(
  callout: CalloutPartCalloutInput,
  previous: CalloutPartItem,
  item: CalloutPartItem,
): Region {
  const top = Math.max(
    callout.region.y + Math.max(5, Math.round(item.quantityLabel.region.height * 0.5)),
    Math.min(
      previous.partImage.region.y - Math.max(8, Math.round(item.quantityLabel.region.height * 0.7)),
      item.partImage.region.y - Math.max(24, Math.round(item.quantityLabel.region.height * 2.2)),
    ),
  )
  const right = Math.min(
    callout.region.x + callout.region.width - CALLOUT_BORDER_INSET,
    item.partImage.region.x + Math.max(item.partImage.region.width, previous.partImage.region.width),
  )
  const bottom = item.partImage.region.y + item.partImage.region.height

  return {
    height: Math.max(1, bottom - top),
    width: Math.max(1, right - item.partImage.region.x),
    x: item.partImage.region.x,
    y: top,
  }
}

function readSameRowPartItems(
  items: readonly CalloutPartItem[],
  item: CalloutPartItem,
): CalloutPartItem[] {
  return items.filter((candidate) =>
    labelsHaveComparableSize(candidate.quantityLabel.region, item.quantityLabel.region) &&
    labelsShareLocalRow(candidate.quantityLabel.region, item.quantityLabel.region),
  )
}

function readPreviousSameRowPartItem(
  items: readonly CalloutPartItem[],
  item: CalloutPartItem,
): CalloutPartItem | undefined {
  return items
    .filter((candidate) =>
      candidate !== item &&
      labelsHaveComparableSize(candidate.quantityLabel.region, item.quantityLabel.region) &&
      labelsShareLocalRow(candidate.quantityLabel.region, item.quantityLabel.region) &&
      regionCenter(candidate.quantityLabel.region).x < regionCenter(item.quantityLabel.region).x,
    )
    .sort((left, right) => regionCenter(right.quantityLabel.region).x - regionCenter(left.quantityLabel.region).x)[0]
}

function dropOrphanUpperOnePartArtItems(items: readonly CalloutPartItem[]): CalloutPartItem[] {
  const oneItems = items.filter((item) => item.quantityLabel.value === 1)

  if (oneItems.length < 3) {
    return [...items]
  }

  const rows = clusterLocalItemRows(oneItems)
  const upperRow = rows[0] ?? []
  const lowerRow = rows[1] ?? []

  if (rows.length !== 2 || upperRow.length !== 1 || lowerRow.length !== 2) {
    return [...items]
  }

  const upper = upperRow[0]
  const sortedLower = [...lowerRow].sort((left, right) => left.quantityLabel.region.x - right.quantityLabel.region.x)
  const matchingLower = sortedLower.find((lower) =>
    Math.abs(regionCenter(lower.quantityLabel.region).x - regionCenter(upper.quantityLabel.region).x) <=
      Math.max(8, lower.quantityLabel.region.width * 0.8),
  )
  const rowGap = readItemRowCenterY(sortedLower) - regionCenter(upper.quantityLabel.region).y

  if (
    !matchingLower ||
    rowGap < Math.max(20, upper.quantityLabel.region.height * 1.8) ||
    rowGap > Math.max(48, upper.quantityLabel.region.height * 4.5) ||
    !isWeakOrSmallUpperOnePartArtItem(upper, matchingLower)
  ) {
    return [...items]
  }

  return items.filter((item) => item !== upper)
}

function isWeakOrSmallUpperOnePartArtItem(upper: CalloutPartItem, matchingLower: CalloutPartItem): boolean {
  const upperPart = upper.partImage.region
  const lowerPart = matchingLower.partImage.region
  const upperPartBottom = upperPart.y + upperPart.height

  return (
    upper.quantityLabel.confidence <= 0.78 ||
    upperPart.height <= lowerPart.height * 0.75 ||
    upperPartBottom <= lowerPart.y + Math.max(4, upper.quantityLabel.region.height * 0.4)
  )
}

function readItemRowCenterY(items: readonly CalloutPartItem[]): number {
  return items.reduce((sum, item) => sum + regionCenter(item.quantityLabel.region).y, 0) / Math.max(1, items.length)
}

function normalizeCompactEightNineRows(items: readonly CalloutPartItem[]): CalloutPartItem[] {
  const replacements = new Map<CalloutPartItem, CalloutPartItem>()

  for (const row of clusterLocalItemRows(items)) {
    const sortedRow = [...row].sort((left, right) => left.quantityLabel.region.x - right.quantityLabel.region.x)

    if (
      sortedRow.length !== 3 ||
      sortedRow[0]!.quantityLabel.value !== 8 ||
      sortedRow[1]!.quantityLabel.value !== 9 ||
      sortedRow[2]!.quantityLabel.value !== 2 ||
      !labelsHaveComparableSize(sortedRow[0]!.quantityLabel.region, sortedRow[1]!.quantityLabel.region) ||
      !labelsHaveComparableSize(sortedRow[1]!.quantityLabel.region, sortedRow[2]!.quantityLabel.region)
    ) {
      continue
    }

    const item = sortedRow[1]!

    replacements.set(item, {
      ...item,
      quantityLabel: {
        ...item.quantityLabel,
        confidence: Math.min(item.quantityLabel.confidence, 0.82),
        text: "8x",
        value: 8,
      },
    })
  }

  return items.map((item) => replacements.get(item) ?? item)
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

function dropOrphanUpperOnePartArtLabels(
  labels: readonly CalloutQuantityLabel[],
): CalloutQuantityLabel[] {
  const oneLabels = labels.filter((label) => label.value === 1)

  if (oneLabels.length < 3) {
    return [...labels]
  }

  const rows = clusterLocalLabelRows(oneLabels)
  const upperRow = rows[0] ?? []
  const lowerRow = rows[1] ?? []

  if (rows.length !== 2 || upperRow.length !== 1 || lowerRow.length !== 2) {
    return [...labels]
  }

  const upper = upperRow[0]
  const sortedLower = [...lowerRow].sort((left, right) => left.region.x - right.region.x)
  const matchingLower = sortedLower.find((lower) =>
    Math.abs(regionCenter(lower.region).x - regionCenter(upper.region).x) <= Math.max(8, lower.region.width * 0.8),
  )
  const rowGap = readLabelRowCenterY(sortedLower) - regionCenter(upper.region).y

  if (
    !matchingLower ||
    upper.recoveryKind ||
    rowGap < Math.max(20, upper.region.height * 1.8) ||
    rowGap > Math.max(48, upper.region.height * 4.5)
  ) {
    return [...labels]
  }

  return labels.filter((label) => label !== upper)
}

function selectTrailingPeerRecoveryLabels(
  callout: CalloutPartCalloutInput,
  emittedLabels: readonly CalloutQuantityLabel[],
  suppressionLabels: readonly CalloutQuantityLabel[],
): CalloutQuantityLabel[] {
  const labels = [...emittedLabels]

  for (const label of suppressionLabels) {
    if (
      labels.some((candidate) => labelsHaveSameRegion(candidate, label)) ||
      !isCompactSameRowTrailingPeerLabel(callout, label, [...labels, label])
    ) {
      continue
    }

    labels.push(label)
  }

  return labels.sort((left, right) => compareRegions(left.region, right.region))
}

function clusterLocalLabelRows(labels: readonly CalloutQuantityLabel[]): CalloutQuantityLabel[][] {
  const rows: CalloutQuantityLabel[][] = []

  for (const label of [...labels].sort((left, right) => left.region.y - right.region.y)) {
    const row = rows.find((candidateRow) => labelsShareLocalRow(label.region, candidateRow[0]!.region))

    if (row) {
      row.push(label)
    } else {
      rows.push([label])
    }
  }

  return rows
}

function readLabelRowCenterY(labels: readonly CalloutQuantityLabel[]): number {
  return labels.reduce((sum, label) => sum + regionCenter(label.region).y, 0) / Math.max(1, labels.length)
}

function labelsHaveSameRegion(left: CalloutQuantityLabel, right: CalloutQuantityLabel): boolean {
  return left.text === right.text &&
    left.value === right.value &&
    left.region.x === right.region.x &&
    left.region.y === right.region.y &&
    left.region.width === right.region.width &&
    left.region.height === right.region.height
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
  return recoverCompactMissingPeerItemsForKinds(
    page,
    callout,
    background,
    backgroundModel,
    items,
    new Set([COMPACT_MISSING_LOWER_PEER_RECOVERY_KIND]),
  )
}

function recoverCompactMissingRetryPeerItems(
  page: CalloutPartPageInput,
  callout: CalloutPartCalloutInput,
  background: ReturnType<typeof readCalloutBackground>,
  backgroundModel: BackgroundModel,
  items: readonly CalloutPartItem[],
): CalloutPartItem[] {
  return recoverCompactMissingPeerItemsForKinds(
    page,
    callout,
    background,
    backgroundModel,
    items,
    new Set([
      COMPACT_MISSING_LOWER_PEER_RECOVERY_KIND,
      COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND,
      COMPACT_MISSING_UPPER_PEER_ROW_RECOVERY_KIND,
    ]),
  )
}

function recoverCompactMissingPeerItemsForKinds(
  page: CalloutPartPageInput,
  callout: CalloutPartCalloutInput,
  background: ReturnType<typeof readCalloutBackground>,
  backgroundModel: BackgroundModel,
  items: readonly CalloutPartItem[],
  recoveryKinds: ReadonlySet<QuantityRecoveryKind>,
): CalloutPartItem[] {
  const candidates = items.map(createQuantityCandidateFromItem)
  const plans = createQuantityRetryRecoveryPlans(candidates, callout.region)
    .filter((candidatePlan) => recoveryKinds.has(candidatePlan.kind))

  if (plans.length === 0) {
    return [...items]
  }

  const recoveredLabels = plans
    .flatMap((plan) => recoverCompactMissingPeerCandidates(page, callout, background, candidates, plan))
    .filter((candidate) => candidates.every((existing) => !labelsOverlap(existing.region, candidate.region)))
    .map(createQuantityLabelFromCandidate)

  if (recoveredLabels.length === 0) {
    return [...items]
  }

  const originalLabels = items.map((item) => item.quantityLabel)
  const ownershipLabels = [...originalLabels, ...recoveredLabels]
    .sort((left, right) => compareRegions(left.region, right.region))
  const rerunItems = extractItemsForLabels(page, callout, background, backgroundModel, ownershipLabels, ownershipLabels).items
  const usableRerunItems = rerunItems.filter((item) =>
    item.quantityLabel.recoveryKind !== COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND ||
    isRecoveredTrailingPeerPartImage(item.partImage, item.quantityLabel, ownershipLabels),
  )

  if (
    originalLabels.every((label) => usableRerunItems.some((item) => item.quantityLabel === label)) &&
    recoveredLabels.every((label) => usableRerunItems.some((item) => item.quantityLabel === label))
  ) {
    return usableRerunItems
  }

  const recoveredItems = recoveredLabels.flatMap((label, index) => {
    const partImage = createPartImageForRecoveredLabel(
      page,
      callout,
      background,
      backgroundModel,
      ownershipLabels,
      label,
    )

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

function createPartImageForRecoveredLabel(
  page: CalloutPartPageInput,
  callout: CalloutPartCalloutInput,
  background: ReturnType<typeof readCalloutBackground>,
  backgroundModel: BackgroundModel,
  ownershipLabels: readonly CalloutQuantityLabel[],
  label: CalloutQuantityLabel,
): CalloutPartItem["partImage"] | null {
  const useTrailingPeerCropFallback =
    label.recoveryKind === COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND ||
    isCompactSameRowTrailingPeerLabel(callout, label, ownershipLabels)
  const cropOwnershipLabels = useTrailingPeerCropFallback
    ? selectSameRowTrailingPeerCropLabels(ownershipLabels, label)
    : ownershipLabels
  const partImage = createPartImageForLabel(page, callout, backgroundModel, cropOwnershipLabels, cropOwnershipLabels, label)

  if (!useTrailingPeerCropFallback) {
    return partImage
  }

  const flatPartImage = createPartImageForLabel(
    page,
    callout,
    createFlatBackgroundModel(background),
    cropOwnershipLabels,
    cropOwnershipLabels,
    label,
  )
  const usablePartImage = partImage && isRecoveredTrailingPeerPartImage(partImage, label, cropOwnershipLabels)
    ? clampRecoveredTrailingPeerPartImage(partImage, label, ownershipLabels)
    : null
  const usableFlatPartImage = flatPartImage && isRecoveredTrailingPeerPartImage(flatPartImage, label, cropOwnershipLabels)
    ? clampRecoveredTrailingPeerPartImage(flatPartImage, label, ownershipLabels)
    : null

  if (
    usableFlatPartImage &&
    (!usablePartImage || usableFlatPartImage.region.width >= usablePartImage.region.width * 1.35)
  ) {
    return usableFlatPartImage
  }

  return usablePartImage
}

function createTrailingPeerGeometryPartImage(
  page: CalloutPartPageInput,
  callout: CalloutPartCalloutInput,
  background: ReturnType<typeof readCalloutBackground>,
  label: CalloutQuantityLabel,
  previous: CalloutPartItem,
): CalloutPartItem["partImage"] | null {
  const left = Math.max(
    previous.partImage.region.x + Math.round(previous.partImage.region.width * 0.78),
    label.region.x - Math.max(13, Math.round(label.region.height * 1.2)),
  )
  const top = callout.region.y + Math.max(4, Math.round(label.region.height * 0.4))
  const right = Math.min(
    callout.region.x + callout.region.width - 2,
    label.region.x + Math.max(74, Math.round(label.region.width * 5.8)),
  )
  const bottom = Math.min(
    callout.region.y + callout.region.height - CALLOUT_BORDER_INSET,
    Math.max(
      previous.partImage.region.y + previous.partImage.region.height,
      label.region.y + Math.max(5, Math.round(label.region.height * 0.45)),
    ),
  )

  if (right <= left || bottom <= top) {
    return null
  }

  return createGeometryPartImage(
    page,
    background,
    { height: bottom - top, width: right - left, x: left, y: top },
    [previous.quantityLabel, label],
  )
}

function createGeometryPartImage(
  page: CalloutPartPageInput,
  background: ReturnType<typeof readCalloutBackground>,
  region: Region,
  labels: readonly CalloutQuantityLabel[],
): CalloutPartItem["partImage"] {
  const alphaMask = createGeometryAlphaMask(page, background, region, labels)

  return {
    alphaMask,
    diagnostics: {
      excludedLabelRegions: labels.map((label) => label.region),
      finalCropBounds: region,
      rawForegroundPixelCount: countOpaquePixels(alphaMask.data),
    },
    region,
  }
}

function createGeometryAlphaMask(
  page: CalloutPartPageInput,
  background: ReturnType<typeof readCalloutBackground>,
  region: Region,
  labels: readonly CalloutQuantityLabel[],
): CalloutPartItem["partImage"]["alphaMask"] {
  const data = new Uint8ClampedArray(region.width * region.height)
  const labelRegions = labels.map((label) => expandLabelRegion(label.region))

  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const pageX = region.x + x
      const pageY = region.y + y
      const index = y * region.width + x

      data[index] = readAlpha(page, pageX, pageY) >= 32 &&
        !labelRegions.some((labelRegion) => pointInRegion(pageX, pageY, labelRegion)) &&
        colorDistance(readPixel(page, pageX, pageY), background) >= 14
        ? 255
        : 0
    }
  }

  return {
    data,
    height: region.height,
    width: region.width,
  }
}

function expandLabelRegion(region: Region): Region {
  const padding = Math.max(2, Math.round(region.height * 0.22))

  return {
    height: region.height + padding * 2,
    width: region.width + padding * 2,
    x: region.x - padding,
    y: region.y - padding,
  }
}

function pointInRegion(x: number, y: number, region: Region): boolean {
  return x >= region.x &&
    x < region.x + region.width &&
    y >= region.y &&
    y < region.y + region.height
}

function selectSameRowTrailingPeerCropLabels(
  labels: readonly CalloutQuantityLabel[],
  label: CalloutQuantityLabel,
): CalloutQuantityLabel[] {
  const sameRowLabels = labels.filter((candidate) =>
    candidate === label ||
    (
      labelsHaveComparableSize(candidate.region, label.region) &&
      labelsShareLocalRow(candidate.region, label.region)
    ),
  )

  return sameRowLabels.some((candidate) => candidate === label)
    ? sameRowLabels.sort((left, right) => compareRegions(left.region, right.region))
    : [...labels]
}

function isCompactSameRowTrailingPeerLabel(
  callout: CalloutPartCalloutInput,
  label: CalloutQuantityLabel,
  labels: readonly CalloutQuantityLabel[],
): boolean {
  if (label.recoveryKind || label.value !== 1 || callout.region.height > callout.region.width * 0.95) {
    return false
  }

  const previous = readPreviousSameRowQuantityLabel(labels, label)

  if (!previous || previous.value < 3) {
    return false
  }

  const centerDeltaX = regionCenter(label.region).x - regionCenter(previous.region).x

  return !readNextSameRowQuantityLabel(labels, label) &&
    centerDeltaX >= Math.max(28, previous.region.width * 1.8) &&
    centerDeltaX <= Math.max(78, callout.region.width * 0.68)
}

function clampRecoveredTrailingPeerPartImage(
  partImage: CalloutPartItem["partImage"],
  label: CalloutQuantityLabel,
  labels: readonly CalloutQuantityLabel[],
): CalloutPartItem["partImage"] {
  const previous = readPreviousSameRowQuantityLabel(labels, label)

  if (!previous) {
    return partImage
  }

  const splitBoundary = Math.floor((regionCenter(previous.region).x + regionCenter(label.region).x) / 2)
  const cropLeft = Math.max(0, splitBoundary - partImage.region.x)

  if (cropLeft <= 0 || cropLeft >= partImage.region.width) {
    return partImage
  }

  const cropRegion = {
    height: partImage.region.height,
    width: partImage.region.width - cropLeft,
    x: cropLeft,
    y: 0,
  }
  const region = {
    height: cropRegion.height,
    width: cropRegion.width,
    x: partImage.region.x + cropRegion.x,
    y: partImage.region.y,
  }

  return {
    ...partImage,
    alphaMask: cropAlphaMask(partImage.alphaMask, cropRegion),
    diagnostics: partImage.diagnostics
      ? {
          ...partImage.diagnostics,
          finalCropBounds: region,
        }
      : partImage.diagnostics,
    region,
  }
}

function isRecoveredTrailingPeerPartImage(
  partImage: CalloutPartItem["partImage"],
  label: CalloutQuantityLabel,
  labels: readonly CalloutQuantityLabel[],
): boolean {
  const labelCenterX = regionCenter(label.region).x
  const imageCenterX = regionCenter(partImage.region).x

  if (imageCenterX < labelCenterX - Math.max(2, label.region.width * 0.25)) {
    return false
  }

  const previous = readPreviousSameRowQuantityLabel(labels, label)

  if (!previous) {
    return true
  }

  const splitBoundary = Math.ceil((regionCenter(previous.region).x + regionCenter(label.region).x) / 2)
  const rightEdge = partImage.region.x + partImage.region.width

  return imageCenterX >= splitBoundary &&
    rightEdge >= labelCenterX + Math.max(10, label.region.width * 0.7)
}

function readPreviousSameRowQuantityLabel(
  labels: readonly CalloutQuantityLabel[],
  label: CalloutQuantityLabel,
): CalloutQuantityLabel | undefined {
  return labels
    .filter((candidate) =>
      candidate !== label &&
      labelsHaveComparableSize(candidate.region, label.region) &&
      labelsShareLocalRow(candidate.region, label.region) &&
      regionCenter(candidate.region).x < regionCenter(label.region).x,
    )
    .sort((left, right) => regionCenter(right.region).x - regionCenter(left.region).x)[0]
}

function readNextSameRowQuantityLabel(
  labels: readonly CalloutQuantityLabel[],
  label: CalloutQuantityLabel,
): CalloutQuantityLabel | undefined {
  return labels
    .filter((candidate) =>
      candidate !== label &&
      labelsHaveComparableSize(candidate.region, label.region) &&
      labelsShareLocalRow(candidate.region, label.region) &&
      regionCenter(candidate.region).x > regionCenter(label.region).x,
    )
    .sort((left, right) => regionCenter(left.region).x - regionCenter(right.region).x)[0]
}

function recoverCompactMissingPeerCandidates(
  page: CalloutPartPageInput,
  callout: CalloutPartCalloutInput,
  background: ReturnType<typeof readCalloutBackground>,
  candidates: readonly QuantityCandidate[],
  plan: ReturnType<typeof createQuantityRetryRecoveryPlans>[number],
): QuantityCandidate[] {
  if (plan.kind === COMPACT_MISSING_LOWER_PEER_RECOVERY_KIND) {
    return recoverCompactMissingLowerPeerCandidates(page, callout.region, background, candidates, plan)
  }

  if (plan.kind === COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND) {
    return recoverCompactMissingSameRowTrailingPeerCandidates(page, callout.region, background, candidates, plan)
  }

  if (plan.kind === COMPACT_MISSING_UPPER_PEER_ROW_RECOVERY_KIND) {
    return recoverCompactMissingUpperPeerRowCandidates(page, callout.region, background, candidates, plan)
  }

  return []
}

function extractItemsForLabels(
  page: CalloutPartPageInput,
  callout: CalloutPartCalloutInput,
  background: ReturnType<typeof readCalloutBackground>,
  backgroundModel: BackgroundModel,
  ownershipLabels: readonly CalloutQuantityLabel[],
  suppressionLabels: readonly CalloutQuantityLabel[] = ownershipLabels,
): ExtractedItemsForLabels {
  let missingPartCropCount = 0
  const items = ownershipLabels.flatMap((label, index) => {
    const partImage = shouldUseTrailingPeerCropFallback(callout, label, ownershipLabels)
      ? createPartImageForRecoveredLabel(page, callout, background, backgroundModel, ownershipLabels, label)
      : createPartImageForLabel(page, callout, backgroundModel, ownershipLabels, suppressionLabels, label)

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

function shouldUseTrailingPeerCropFallback(
  callout: CalloutPartCalloutInput,
  label: CalloutQuantityLabel,
  labels: readonly CalloutQuantityLabel[],
): boolean {
  return label.recoveryKind === COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND ||
    isCompactSameRowTrailingPeerLabel(callout, label, labels)
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
