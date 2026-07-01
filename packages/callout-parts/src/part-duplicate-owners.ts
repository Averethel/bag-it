import type { CalloutPartImage, CalloutPartItem, CalloutQuantityLabel, Region } from "./contracts"
import { overlapRatio, regionCenter, regionContainsPoint, unionRegions } from "./regions"

export interface DuplicateOwnedPartRowResolution {
  keptItems: CalloutPartItem[]
  partImageTransfers: DuplicatePartImageTransfer[]
  rerunSuppressionLabels: CalloutQuantityLabel[]
}

export interface DuplicatePartImageTransfer {
  partImage: CalloutPartImage
  quantityLabel: CalloutQuantityLabel
}

interface DuplicateResolutionOptions {
  allowTransferredEmbeddedPartMatch?: boolean
}

export function resolveDuplicateOwnedPartRows(
  suppressionLabels: readonly CalloutQuantityLabel[],
  items: readonly CalloutPartItem[],
  options: DuplicateResolutionOptions = {},
): DuplicateOwnedPartRowResolution {
  const keptItems = suppressDuplicateOwnedPartRows(items, options)

  return {
    keptItems,
    partImageTransfers: createEmbeddedPartArtImageTransfers(items, keptItems),
    rerunSuppressionLabels: createRerunSuppressionLabels(suppressionLabels, items, keptItems, options),
  }
}

export function applyDuplicatePartImageTransfers(
  items: readonly CalloutPartItem[],
  transfers: readonly DuplicatePartImageTransfer[],
): CalloutPartItem[] {
  return items.map((item) => {
    const transfer = transfers.find((candidate) => candidate.quantityLabel === item.quantityLabel)

    if (!transfer || !isBetterTransferredPartImage(transfer.partImage, item.partImage)) {
      return item
    }

    return {
      ...item,
      partImage: transfer.partImage,
      sourceRegion: unionRegions([transfer.partImage.region, item.quantityLabel.region]),
    }
  })
}

export function suppressDuplicateOwnedPartRows(
  items: readonly CalloutPartItem[],
  options: DuplicateResolutionOptions = {},
): CalloutPartItem[] {
  const rejected = new Set<CalloutPartItem>()

  for (const item of items) {
    if (isLowValueNearEmptyPartArtRow(item, items)) {
      rejected.add(item)
      continue
    }

    const duplicate = items.find((candidate) => isDuplicateOwner(item, candidate, items, options))

    if (duplicate) {
      rejected.add(item)
    }
  }

  return items.filter((item) => !rejected.has(item))
}

function createEmbeddedPartArtImageTransfers(
  items: readonly CalloutPartItem[],
  keptItems: readonly CalloutPartItem[],
): DuplicatePartImageTransfer[] {
  const droppedItems = items.filter((item) => !keptItems.includes(item))

  return keptItems.flatMap((keptItem) => {
    const source = droppedItems
      .filter((droppedItem) => isEmbeddedSameRowPartArtOwner(droppedItem, keptItem))
      .filter((droppedItem) => isTransferableEmbeddedPartArtCrop(droppedItem, keptItem))
      .sort((left, right) => regionArea(right.partImage.region) - regionArea(left.partImage.region))[0]

    return source
      ? [{
          partImage: source.partImage,
          quantityLabel: keptItem.quantityLabel,
        }]
      : []
  })
}

function createRerunSuppressionLabels(
  suppressionLabels: readonly CalloutQuantityLabel[],
  items: readonly CalloutPartItem[],
  keptItems: readonly CalloutPartItem[],
  options: DuplicateResolutionOptions,
): CalloutQuantityLabel[] {
  const droppedItems = items.filter((item) => !keptItems.includes(item))

  return suppressionLabels.filter((label) => {
    const droppedItem = droppedItems.find((item) => labelsMatch(item.quantityLabel, label))

    return !droppedItem || shouldKeepDroppedLabelForSuppression(droppedItem, keptItems, items, options)
  })
}

function shouldKeepDroppedLabelForSuppression(
  droppedItem: CalloutPartItem,
  keptItems: readonly CalloutPartItem[],
  allItems: readonly CalloutPartItem[],
  options: DuplicateResolutionOptions,
): boolean {
  if (isLowValueNearEmptyPartArtRow(droppedItem, allItems)) {
    return false
  }

  if (keptItems.some((keptItem) =>
    isEmbeddedSameRowPartArtOwner(droppedItem, keptItem, options) ||
    isLowerInterRowPartArtDuplicate(droppedItem, keptItem, allItems),
  )) {
    return false
  }

  return !keptItems.some((keptItem) =>
    isHighValueUpperSameCropDuplicate(droppedItem, keptItem, allItems),
  )
}

function labelsMatch(left: CalloutQuantityLabel, right: CalloutQuantityLabel): boolean {
  return left.text === right.text &&
    left.value === right.value &&
    left.region.x === right.region.x &&
    left.region.y === right.region.y &&
    left.region.width === right.region.width &&
    left.region.height === right.region.height
}

function isDuplicateOwner(
  item: CalloutPartItem,
  other: CalloutPartItem,
  items: readonly CalloutPartItem[],
  options: DuplicateResolutionOptions,
): boolean {
  return isLowerDuplicateOwner(item, other, items) ||
    isIsolatedUpperLabelDuplicate(item, other, items) ||
    isUpperPartArtDuplicate(item, other, items) ||
    isEmbeddedSameRowPartArtOwner(item, other, options) ||
    isLowerInterRowPartArtDuplicate(item, other, items) ||
    isHighValueUpperSameCropDuplicate(item, other, items) ||
    isNearRowDuplicateOwner(item, other)
}

function isLowValueNearEmptyPartArtRow(
  item: CalloutPartItem,
  items: readonly CalloutPartItem[],
): boolean {
  if (item.quantityLabel.value > 2 || items.length < 3 || !hasNearbyPrintedRowSupport(item, items)) {
    return false
  }

  return isNearEmptyPartCrop(item)
}

function hasNearbyPrintedRowSupport(item: CalloutPartItem, items: readonly CalloutPartItem[]): boolean {
  const label = item.quantityLabel.region
  const center = regionCenter(label)

  return items.some((candidate) => {
    if (candidate === item) {
      return false
    }

    const candidateLabel = candidate.quantityLabel.region
    const candidateCenter = regionCenter(candidateLabel)
    const verticalDistance = Math.abs(candidateCenter.y - center.y)
    const horizontalDistance = Math.abs(candidateCenter.x - center.x)

    return verticalDistance <= Math.max(28, label.height * 2.5) ||
      (
        verticalDistance <= Math.max(72, label.height * 6.5) &&
        horizontalDistance <= Math.max(72, Math.max(label.width, candidateLabel.width) * 5)
      )
  })
}

function isNearEmptyPartCrop(item: CalloutPartItem): boolean {
  const mask = item.partImage.alphaMask
  const opaquePixels = countOpaquePixels(mask.data)
  const area = Math.max(1, mask.width * mask.height)

  return opaquePixels <= Math.max(8, area * 0.01)
}

function isTransferableEmbeddedPartArtCrop(
  droppedItem: CalloutPartItem,
  keptItem: CalloutPartItem,
): boolean {
  if (droppedItem.quantityLabel.value !== keptItem.quantityLabel.value) {
    return false
  }

  return isBetterTransferredPartImage(droppedItem.partImage, keptItem.partImage)
}

function isBetterTransferredPartImage(source: CalloutPartImage, target: CalloutPartImage): boolean {
  const sourceArea = regionArea(source.region)
  const targetArea = regionArea(target.region)

  return sourceArea >= targetArea * 1.6 &&
    (
      source.region.width >= target.region.width * 1.35 ||
      source.region.height >= target.region.height * 1.35
    )
}

function regionArea(region: Region): number {
  return region.width * region.height
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

function isLowerDuplicateOwner(
  upper: CalloutPartItem,
  lower: CalloutPartItem,
  items: readonly CalloutPartItem[],
): boolean {
  if (upper === lower) {
    return false
  }

  const upperLabel = upper.quantityLabel.region
  const lowerLabel = lower.quantityLabel.region
  const verticalSeparation = regionCenter(lowerLabel).y - regionCenter(upperLabel).y

  return !hasSameRowPeer(upper, items) &&
    verticalSeparation >= Math.max(24, upperLabel.height * 2) &&
    overlapRatio(upper.partImage.region, lower.partImage.region) >= 0.72
}

function hasSameRowPeer(
  item: CalloutPartItem,
  items: readonly CalloutPartItem[],
): boolean {
  const label = item.quantityLabel.region
  const centerY = regionCenter(label).y

  return items.some((candidate) => {
    if (candidate === item) {
      return false
    }

    const candidateLabel = candidate.quantityLabel.region

    return Math.abs(regionCenter(candidateLabel).y - centerY) <= Math.max(8, label.height * 1.1)
  })
}

function isIsolatedUpperLabelDuplicate(
  upper: CalloutPartItem,
  lower: CalloutPartItem,
  items: readonly CalloutPartItem[],
): boolean {
  if (upper === lower || hasSameRowPeer(upper, items) || !hasSameRowPeer(lower, items)) {
    return false
  }

  const upperLabel = upper.quantityLabel.region
  const lowerLabel = lower.quantityLabel.region
  const verticalSeparation = regionCenter(lowerLabel).y - regionCenter(upperLabel).y

  if (
    verticalSeparation < Math.max(15, upperLabel.height * 1.2) ||
    verticalSeparation > Math.max(34, upperLabel.height * 3.4) ||
    !labelsAreLooselyColumnAligned(upperLabel, lowerLabel)
  ) {
    return false
  }

  return overlapRatio(upper.partImage.region, lower.partImage.region) >= 0.18 ||
    overlapRatio(upper.sourceRegion, lower.sourceRegion) >= 0.18
}

function labelsAreLooselyColumnAligned(left: Region, right: Region): boolean {
  const centerDistance = Math.abs(regionCenter(left).x - regionCenter(right).x)

  return centerDistance <= Math.max(18, Math.max(left.width, right.width) * 1.4)
}

function isUpperPartArtDuplicate(
  upper: CalloutPartItem,
  lower: CalloutPartItem,
  items: readonly CalloutPartItem[],
): boolean {
  if (upper === lower || !hasSameRowPeer(lower, items)) {
    return false
  }

  const upperLabel = upper.quantityLabel.region
  const lowerLabel = lower.quantityLabel.region
  const verticalSeparation = regionCenter(lowerLabel).y - regionCenter(upperLabel).y

  if (
    verticalSeparation <= Math.max(24, upperLabel.height * 2) ||
    verticalSeparation > Math.max(120, upperLabel.height * 10)
  ) {
    return false
  }

  const lowerPart = lower.partImage.region
  const upperLabelCenter = regionCenter(upperLabel)
  const upperLabelSitsOverLowerPart = upperLabelCenter.y >= lowerPart.y &&
    upperLabelCenter.y <= lowerLabel.y

  if (isLowerInterRowPartArtDuplicate(lower, upper, items)) {
    return false
  }

  return upperLabelSitsOverLowerPart &&
    (
      overlapRatio(upper.partImage.region, lower.partImage.region) >= 0.72 ||
      overlapRatio(upper.sourceRegion, lower.sourceRegion) >= 0.72
    )
}

function isHighValueUpperSameCropDuplicate(
  upper: CalloutPartItem,
  lower: CalloutPartItem,
  items: readonly CalloutPartItem[],
): boolean {
  if (
    upper === lower ||
    upper.quantityLabel.value < 4 ||
    !hasSameRowPeer(lower, items) ||
    overlapRatio(upper.partImage.region, lower.partImage.region) < 0.92
  ) {
    return false
  }

  const upperLabel = upper.quantityLabel.region
  const lowerLabel = lower.quantityLabel.region
  const verticalSeparation = regionCenter(lowerLabel).y - regionCenter(upperLabel).y

  if (isLowerInterRowPartArtDuplicate(lower, upper, items)) {
    return false
  }

  return verticalSeparation >= Math.max(4, upperLabel.height * 0.3) &&
    verticalSeparation <= Math.max(26, upperLabel.height * 2.2)
}

function isEmbeddedSameRowPartArtOwner(
  item: CalloutPartItem,
  other: CalloutPartItem,
  options: DuplicateResolutionOptions = {},
): boolean {
  if (item === other || item.quantityLabel.value > 2) {
    return false
  }

  const label = item.quantityLabel.region
  const otherLabel = other.quantityLabel.region
  const center = regionCenter(label)
  const otherCenter = regionCenter(otherLabel)
  const verticalSeparation = otherCenter.y - center.y

  if (
    verticalSeparation < 0 ||
    verticalSeparation > Math.max(12, label.height * 1.2) ||
    Math.abs(otherCenter.x - center.x) > Math.max(48, label.width * 3.4)
  ) {
    return false
  }

  const itemArea = item.partImage.region.width * item.partImage.region.height
  const otherArea = other.partImage.region.width * other.partImage.region.height
  const partOverlap = overlapRatio(item.partImage.region, other.partImage.region)
  const itemLabelInsideItemPart = regionContainsPoint(item.partImage.region, center.x, center.y)
  const itemLabelInsideOtherPart = regionContainsPoint(other.partImage.region, center.x, center.y)

  return itemLabelInsideItemPart &&
    partOverlap >= 0.72 &&
    (
      otherArea <= itemArea * 0.48 ||
      (
        options.allowTransferredEmbeddedPartMatch === true &&
        itemLabelInsideOtherPart &&
        itemArea <= otherArea * 1.1
      )
    )
}

function isLowerInterRowPartArtDuplicate(
  lower: CalloutPartItem,
  upper: CalloutPartItem,
  items: readonly CalloutPartItem[],
): boolean {
  if (
    lower === upper ||
    lower.quantityLabel.value < 4 ||
    countSameRowLabels(upper, items) < 4 ||
    overlapRatio(lower.partImage.region, upper.partImage.region) < 0.72
  ) {
    return false
  }

  const lowerLabel = lower.quantityLabel.region
  const upperLabel = upper.quantityLabel.region
  const verticalSeparation = regionCenter(lowerLabel).y - regionCenter(upperLabel).y

  if (
    verticalSeparation < Math.max(16, upperLabel.height * 1.2) ||
    verticalSeparation > Math.max(34, upperLabel.height * 2.8)
  ) {
    return false
  }

  return countOpaquePixels(lower.partImage.alphaMask.data) <= Math.max(
    96,
    Math.round(countOpaquePixels(upper.partImage.alphaMask.data) * 0.55),
  )
}

function isNearRowDuplicateOwner(item: CalloutPartItem, other: CalloutPartItem): boolean {
  if (item === other || overlapRatio(item.partImage.region, other.partImage.region) < 0.72) {
    return false
  }

  const label = item.quantityLabel.region
  const otherLabel = other.quantityLabel.region
  const verticalSeparation = regionCenter(otherLabel).y - regionCenter(label).y

  if (
    verticalSeparation >= Math.max(6, label.height * 0.45) &&
    verticalSeparation <= Math.max(24, label.height * 2.1) &&
    labelsAreHorizontallyCoLocated(label, otherLabel)
  ) {
    return true
  }

  if (
    Math.abs(verticalSeparation) <= Math.max(4, Math.min(label.height, otherLabel.height) * 0.35) &&
    labelsAreHorizontallyCoLocated(label, otherLabel)
  ) {
    return item.quantityLabel.value > other.quantityLabel.value
  }

  return false
}

function labelsAreHorizontallyCoLocated(left: Region, right: Region): boolean {
  const overlap = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  )
  const minWidth = Math.max(1, Math.min(left.width, right.width))
  const centerDistance = Math.abs(regionCenter(left).x - regionCenter(right).x)

  return overlap / minWidth >= 0.5 || centerDistance <= Math.max(20, Math.max(left.width, right.width) * 0.85)
}

function countSameRowLabels(
  item: CalloutPartItem,
  items: readonly CalloutPartItem[],
): number {
  const label = item.quantityLabel.region
  const centerY = regionCenter(label).y

  return items.filter((candidate) =>
    Math.abs(regionCenter(candidate.quantityLabel.region).y - centerY) <= Math.max(8, label.height * 1.1),
  ).length
}
