import type {
  CalloutPartAlphaMask,
  CalloutPartCalloutInput,
  CalloutPartCalloutResult,
  CalloutPartImage,
  CalloutPartImageDiagnostics,
  CalloutPartItem,
  CalloutPartPageInput,
  Region,
} from "./contracts"
import { createBackgroundModel } from "./background-model"
import { extractCalloutPartsForPage, recoverReadableCompactMissingPeerItems, suppressDuplicateOwnedPartRows } from "./extractor"
import { applyDuplicatePartImageTransfers, resolveDuplicateOwnedPartRows } from "./part-duplicate-owners"
import { clipRegionTop, readExcludedUpperLabelClipTop } from "./part-crop-top-recovery"
import { readCalloutBackground } from "./pixels"
import { insetRegion, unionRegions } from "./regions"

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
  const scaledCalloutById = new Map(scaledCallouts.map((callout) => [callout.id, callout]))
  const calloutResults = extracted.callouts.map((callout) => {
    const scaledReadableItems = createScaledReadableItems(callout.items, scaleX, scaleY)
    const sourceReadableItems = scaledReadableItems.map((entry) => entry.source)
    const recoveredSourceItems = recoverScaledReadableCompactMissingPeerItems(
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

function recoverScaledReadableCompactMissingPeerItems(
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

  return recoverReadableCompactMissingPeerItems(page, callout, background, backgroundModel, items)
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
