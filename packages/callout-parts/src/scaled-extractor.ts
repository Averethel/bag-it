import type {
  CalloutPartAlphaMask,
  CalloutPartCalloutInput,
  CalloutPartCalloutResult,
  CalloutPartImage,
  CalloutPartImageDiagnostics,
  CalloutPartItem,
  CalloutPartPageInput,
  CalloutQuantityLabel,
  Region,
} from "./contracts"
import { createBackgroundModel } from "./background-model"
import { extractCalloutPartsForPage, recoverCompactMissingLowerPeerItems, suppressDuplicateOwnedPartRows } from "./extractor"
import { applyDuplicatePartImageTransfers, resolveDuplicateOwnedPartRows } from "./part-duplicate-owners"
import { clipRegionTop, readExcludedUpperLabelClipTop } from "./part-crop-top-recovery"
import { colorDistance, readAlpha, readCalloutBackground, readPixel } from "./pixels"
import { compareRegions, insetRegion, overlapRatio, regionCenter, unionRegions } from "./regions"

export interface CalloutPartPageBounds {
  height: number
  width: number
}

export interface ScaledCalloutPartExtractionResult {
  callouts: CalloutPartCalloutResult[]
  items: CalloutPartItem[]
}

const MIN_CANONICAL_QUANTITY_LABEL_HEIGHT = 5
const MIN_CANONICAL_QUANTITY_LABEL_WIDTH = 6
const CALLOUT_BORDER_INSET = 3
const COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND = "compact-missing-same-row-trailing-peer"

export function extractCalloutPartsForScaledPage({
  basePageBounds,
  callouts,
  page,
}: {
  basePageBounds: CalloutPartPageBounds
  callouts: readonly CalloutPartCalloutInput[]
  page: CalloutPartPageInput
}): ScaledCalloutPartExtractionResult {
  const resolvedBaseBounds = resolveBasePageBounds(basePageBounds, page)
  const scaleX = page.width / resolvedBaseBounds.width
  const scaleY = page.height / resolvedBaseBounds.height
  const scaledCallouts = callouts.map((callout) => scaleCallout(callout, scaleX, scaleY))
  const extracted = extractCalloutPartsForPage({
    callouts: scaledCallouts,
    page,
  })
  const baseCalloutById = new Map(callouts.map((callout) => [callout.id, callout]))
  const scaledCalloutById = new Map(scaledCallouts.map((callout) => [callout.id, callout]))
  const calloutResults = extracted.callouts.map((callout) => {
    const scaledReadableItems = createScaledReadableItems(callout.items, scaleX, scaleY)
    const sourceReadableItems = recoverScaledReadableSuppressedFragmentTrailingPeerItems({
      baseCallout: baseCalloutById.get(callout.calloutId),
      page,
      pairs: scaledReadableItems,
      scaleX,
      scaleY,
      scaledCallout: scaledCalloutById.get(callout.calloutId),
    })
    const recoveredSourceItems = recoverScaledReadableCompactMissingLowerPeerItems(
      page,
      scaledCalloutById.get(callout.calloutId),
      sourceReadableItems,
    )
    const baseItems = recoveredSourceItems.map((partItem) => scalePartItem(partItem, 1 / scaleX, 1 / scaleY))
    const readableBaseItems = filterReadableScaledItems(baseItems)

    return {
      ...callout,
      items: cleanScaledReadableItems(
        readableBaseItems,
        recoveredSourceItems.length > sourceReadableItems.length,
      ),
    }
  })

  return {
    callouts: calloutResults,
    items: calloutResults.flatMap((callout) => callout.items),
  }
}

function cleanScaledReadableItems(
  items: readonly CalloutPartItem[],
  recoveredRows: boolean,
): CalloutPartItem[] {
  if (!recoveredRows) {
    return suppressDuplicateOwnedPartRows(items)
  }

  const resolution = resolveDuplicateOwnedPartRows(
    items.map((item) => item.quantityLabel),
    items,
    { allowTransferredEmbeddedPartMatch: true },
  )

  return applyDuplicatePartImageTransfers(resolution.keptItems, resolution.partImageTransfers)
}

function createScaledReadableItems(
  sourceItems: readonly CalloutPartItem[],
  scaleX: number,
  scaleY: number,
): Array<{ scaled: CalloutPartItem; source: CalloutPartItem }> {
  const pairs = sourceItems.map((source) => ({
    scaled: scalePartItem(source, 1 / scaleX, 1 / scaleY),
    source,
  }))
  const readableItems = new Set(filterReadableScaledItems(pairs.map((pair) => pair.scaled)))

  return pairs.filter((pair) => readableItems.has(pair.scaled))
}

export function recoverScaledReadableSuppressedFragmentTrailingPeerItems({
  baseCallout,
  page,
  pairs,
  scaleX,
  scaleY,
  scaledCallout,
}: {
  baseCallout: CalloutPartCalloutInput | undefined
  page: CalloutPartPageInput
  pairs: ReadonlyArray<{ scaled: CalloutPartItem; source: CalloutPartItem }>
  scaleX: number
  scaleY: number
  scaledCallout: CalloutPartCalloutInput | undefined
}): CalloutPartItem[] {
  const sourceItems = pairs.map((pair) => pair.source)

  if (!baseCallout || !scaledCallout) {
    return sourceItems
  }

  const baseItems = pairs.map((pair) => pair.scaled)
  const sourceBackground = readCalloutBackground(page, scaledCallout.region, scaledCallout.background)
  const recoveredItems: CalloutPartItem[] = []

  for (const pair of pairs) {
    const anchor = pair.scaled

    if (!isSuppressedFragmentTrailingPeerAnchor(baseCallout, baseItems, anchor)) {
      continue
    }

    const baseLabel = inferSuppressedFragmentTrailingPeerLabel(baseCallout, anchor)

    if (
      !baseLabel ||
      baseItems.some((item) => labelsOverlap(item.quantityLabel.region, baseLabel.region)) ||
      recoveredItems.some((item) => labelsOverlap(scaleRegion(item.quantityLabel.region, 1 / scaleX, 1 / scaleY), baseLabel.region)) ||
      !readTrailingPeerSuppressedFragment(anchor, baseLabel)
    ) {
      continue
    }

    const sourceLabel = {
      ...baseLabel,
      region: scaleRegion(baseLabel.region, scaleX, scaleY),
    }
    const partImage = createTrailingPeerGeometryPartImage(
      page,
      scaledCallout,
      sourceBackground,
      sourceLabel,
      pair.source,
    )

    if (!partImage) {
      continue
    }

    recoveredItems.push({
      calloutId: scaledCallout.id,
      confidence: Math.min(0.86, 0.62 + anchor.quantityLabel.confidence * 0.2),
      id: `item-${scaledCallout.id}-${sourceItems.length + recoveredItems.length}`,
      indexOnCallout: sourceItems.length + recoveredItems.length,
      partImage,
      quantityLabel: sourceLabel,
      sourceRegion: unionRegions([partImage.region, sourceLabel.region]),
    })
  }

  return recoveredItems.length === 0
    ? sourceItems
    : [...sourceItems, ...recoveredItems]
      .sort((left, right) => compareRegions(left.quantityLabel.region, right.quantityLabel.region))
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

  return label.value !== null &&
    label.value >= 3 &&
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

  const region = { height: bottom - top, width: right - left, x: left, y: top }
  const alphaMask = createGeometryAlphaMask(page, background, region, [previous.quantityLabel, label])

  return {
    alphaMask,
    diagnostics: {
      excludedLabelRegions: [previous.quantityLabel.region, label.region],
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

function recoverScaledReadableCompactMissingLowerPeerItems(
  page: CalloutPartPageInput,
  callout: CalloutPartCalloutInput | undefined,
  items: readonly CalloutPartItem[],
): CalloutPartItem[] {
  if (!callout) {
    return [...items]
  }

  const background = readCalloutBackground(page, callout.region, callout.background)
  const backgroundModel = createBackgroundModel(
    page,
    insetRegion(callout.region, 3),
    background,
    { excludedRegions: items.map((item) => item.quantityLabel.region) },
  )

  return recoverCompactMissingLowerPeerItems(page, callout, background, backgroundModel, items)
}

function resolveBasePageBounds(
  basePageBounds: CalloutPartPageBounds,
  page: CalloutPartPageInput,
): CalloutPartPageBounds {
  if (
    Number.isFinite(basePageBounds.width) &&
    Number.isFinite(basePageBounds.height) &&
    basePageBounds.width > 0 &&
    basePageBounds.height > 0
  ) {
    return basePageBounds
  }

  return {
    height: page.height,
    width: page.width,
  }
}

function scaleCallout(
  callout: CalloutPartCalloutInput,
  scaleX: number,
  scaleY: number,
): CalloutPartCalloutInput {
  return {
    ...callout,
    region: scaleRegion(callout.region, scaleX, scaleY),
  }
}

function scalePartItem(
  partItem: CalloutPartItem,
  scaleX: number,
  scaleY: number,
): CalloutPartItem {
  const partImageRegion = scaleRegion(partItem.partImage.region, scaleX, scaleY)
  const quantityLabel = {
    ...partItem.quantityLabel,
    region: scaleRegion(partItem.quantityLabel.region, scaleX, scaleY),
  }
  const partImage = clipScaledPartImageByDiagnostics({
    ...partItem.partImage,
    alphaMask: scaleAlphaMask(
      partItem.partImage.alphaMask,
      partItem.partImage.region,
      partImageRegion,
      scaleX,
      scaleY,
    ),
    diagnostics: scalePartImageDiagnostics(partItem.partImage.diagnostics, scaleX, scaleY),
    region: partImageRegion,
  })

  return {
    ...partItem,
    partImage,
    quantityLabel,
    sourceRegion: unionRegions([partImage.region, quantityLabel.region]),
  }
}

export function clipScaledPartImageByDiagnostics(partImage: CalloutPartImage): CalloutPartImage {
  const diagnostics = partImage.diagnostics

  if (!diagnostics) {
    return partImage
  }

  const upperLabelClipTop = readExcludedUpperLabelClipTop(
    diagnostics.excludedLabelRegions,
    diagnostics.rawForegroundBounds,
  )
  const denseTopEdgeClipTop = readDenseTopEdgeAlphaClipTop(partImage)
  const clipTop = maxDefined(upperLabelClipTop, denseTopEdgeClipTop)
  const clippedRegion = clipRegionTop(partImage.region, clipTop)

  if (clippedRegion.y === partImage.region.y && clippedRegion.height === partImage.region.height) {
    return partImage
  }

  return {
    ...partImage,
    alphaMask: cropAlphaMaskTop(partImage.alphaMask, partImage.region, clippedRegion),
    diagnostics: {
      ...diagnostics,
      alphaBounds: clipOptionalRegionTop(diagnostics.alphaBounds, upperLabelClipTop),
      finalCropBounds: clippedRegion,
      imageRegionBeforeAlphaTrim: clipOptionalRegionTop(diagnostics.imageRegionBeforeAlphaTrim, upperLabelClipTop),
      ownedRegion: clipOptionalRegionTop(diagnostics.ownedRegion, upperLabelClipTop),
    },
    region: clippedRegion,
  }
}

function maxDefined(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) {
    return right
  }

  if (right === undefined) {
    return left
  }

  return Math.max(left, right)
}

function readDenseTopEdgeAlphaClipTop(partImage: CalloutPartImage): number | undefined {
  const diagnostics = partImage.diagnostics

  if (!diagnostics?.alphaBounds || !diagnostics.rawForegroundBounds) {
    return undefined
  }

  const alphaBounds = diagnostics.alphaBounds
  const rawBounds = diagnostics.rawForegroundBounds
  const edgeTolerance = 2
  const topLift = rawBounds.y - alphaBounds.y

  if (
    alphaBounds.y > partImage.region.y + edgeTolerance ||
    topLift < Math.max(18, rawBounds.height * 0.72) ||
    !hasDenseTopEdgeLine(partImage.alphaMask, partImage.region, alphaBounds)
  ) {
    return undefined
  }

  return Math.max(partImage.region.y, rawBounds.y - readScaledTopEdgePadding(rawBounds))
}

function hasDenseTopEdgeLine(
  alphaMask: CalloutPartAlphaMask,
  imageRegion: Region,
  alphaBounds: Region,
): boolean {
  const localAlphaBounds = {
    height: alphaBounds.height,
    width: alphaBounds.width,
    x: alphaBounds.x - imageRegion.x,
    y: alphaBounds.y - imageRegion.y,
  }
  const topCount = countOpaqueAlphaInRow(alphaMask, localAlphaBounds, localAlphaBounds.y)
  const nextRowLimit = Math.min(localAlphaBounds.y + 2, alphaMask.height - 1)
  let nextRowPeak = 0

  for (let y = localAlphaBounds.y + 1; y <= nextRowLimit; y += 1) {
    nextRowPeak = Math.max(nextRowPeak, countOpaqueAlphaInRow(alphaMask, localAlphaBounds, y))
  }

  return topCount >= localAlphaBounds.width * 0.72 &&
    nextRowPeak <= localAlphaBounds.width * 0.24
}

function countOpaqueAlphaInRow(alphaMask: CalloutPartAlphaMask, alphaBounds: Region, y: number): number {
  let count = 0

  for (let x = alphaBounds.x; x < alphaBounds.x + alphaBounds.width; x += 1) {
    if (alphaMask.data[y * alphaMask.width + x] >= 16) {
      count += 1
    }
  }

  return count
}

function readScaledTopEdgePadding(bounds: Region): number {
  return Math.max(3, Math.min(8, Math.round(bounds.height * 0.12)))
}

function clipOptionalRegionTop(region: Region | undefined, top: number | undefined): Region | undefined {
  return region ? clipRegionTop(region, top) : undefined
}

function cropAlphaMaskTop(
  alphaMask: CalloutPartAlphaMask,
  originalRegion: Region,
  clippedRegion: Region,
): CalloutPartAlphaMask {
  const offsetY = clippedRegion.y - originalRegion.y

  if (offsetY <= 0) {
    return alphaMask
  }

  const data = new Uint8ClampedArray(clippedRegion.width * clippedRegion.height)

  for (let y = 0; y < clippedRegion.height; y += 1) {
    for (let x = 0; x < clippedRegion.width; x += 1) {
      data[y * clippedRegion.width + x] =
        alphaMask.data[(y + offsetY) * alphaMask.width + x] ?? 0
    }
  }

  return {
    data,
    height: clippedRegion.height,
    width: clippedRegion.width,
  }
}

function scalePartImageDiagnostics(
  diagnostics: CalloutPartImageDiagnostics | undefined,
  scaleX: number,
  scaleY: number,
): CalloutPartImageDiagnostics | undefined {
  if (!diagnostics) {
    return undefined
  }

  return {
    ...diagnostics,
    alphaBounds: scaleOptionalRegion(diagnostics.alphaBounds, scaleX, scaleY),
    excludedLabelRegions: diagnostics.excludedLabelRegions.map((region) => scaleRegion(region, scaleX, scaleY)),
    finalCropBounds: scaleOptionalRegion(diagnostics.finalCropBounds, scaleX, scaleY),
    imageRegionBeforeAlphaTrim: scaleOptionalRegion(diagnostics.imageRegionBeforeAlphaTrim, scaleX, scaleY),
    ownedRegion: scaleOptionalRegion(diagnostics.ownedRegion, scaleX, scaleY),
    rawForegroundBounds: scaleOptionalRegion(diagnostics.rawForegroundBounds, scaleX, scaleY),
  }
}

function scaleOptionalRegion(
  region: Region | undefined,
  scaleX: number,
  scaleY: number,
): Region | undefined {
  return region ? scaleRegion(region, scaleX, scaleY) : undefined
}

function filterReadableScaledItems(items: readonly CalloutPartItem[]): CalloutPartItem[] {
  return items.filter((partItem) =>
    hasReadableCanonicalQuantityLabel(partItem) ||
    isSingleVisibleCompactItem(partItem, items),
  )
}

function hasReadableCanonicalQuantityLabel(partItem: CalloutPartItem): boolean {
  const { height, width } = partItem.quantityLabel.region

  return height >= MIN_CANONICAL_QUANTITY_LABEL_HEIGHT &&
    width >= MIN_CANONICAL_QUANTITY_LABEL_WIDTH
}

function isSingleVisibleCompactItem(
  partItem: CalloutPartItem,
  items: readonly CalloutPartItem[],
): boolean {
  const { height, width } = partItem.quantityLabel.region

  return items.length === 1 &&
    height >= 3 &&
    width >= 3 &&
    countOpaquePixels(partItem.partImage.alphaMask.data) >= Math.max(6, Math.ceil(width * height * 0.35))
}

function countOpaquePixels(alphaMask: Uint8ClampedArray): number {
  let count = 0

  for (const alpha of alphaMask) {
    if (alpha >= 16) {
      count += 1
    }
  }

  return count
}

function scaleAlphaMask(
  alphaMask: CalloutPartAlphaMask,
  sourceRegion: Region,
  targetRegion: Region,
  scaleX: number,
  scaleY: number,
): CalloutPartAlphaMask {
  const targetWidth = targetRegion.width
  const targetHeight = targetRegion.height
  const data = new Uint8ClampedArray(targetWidth * targetHeight)

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = readSourceMaskCoordinate(targetRegion.x + x, sourceRegion.x, scaleX, alphaMask.width)
      const sourceY = readSourceMaskCoordinate(targetRegion.y + y, sourceRegion.y, scaleY, alphaMask.height)

      data[y * targetWidth + x] = alphaMask.data[sourceY * alphaMask.width + sourceX] ?? 0
    }
  }

  return {
    data,
    height: targetHeight,
    width: targetWidth,
  }
}

function readSourceMaskCoordinate(
  targetCoordinate: number,
  sourceRegionCoordinate: number,
  scale: number,
  sourceLimit: number,
): number {
  const sourceCoordinate = (targetCoordinate + 0.5) / scale - sourceRegionCoordinate

  return Math.max(0, Math.min(sourceLimit - 1, Math.floor(sourceCoordinate)))
}

function scaleRegion(region: Region, scaleX: number, scaleY: number): Region {
  const left = Math.floor(region.x * scaleX)
  const top = Math.floor(region.y * scaleY)
  const right = Math.ceil((region.x + region.width) * scaleX)
  const bottom = Math.ceil((region.y + region.height) * scaleY)

  return {
    height: Math.max(1, bottom - top),
    width: Math.max(1, right - left),
    x: left,
    y: top,
  }
}
