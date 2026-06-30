import type {
  CalloutPartAlphaMask,
  Region,
} from "./contracts"
import {
  clearAlphaMaskRightOf,
  clearAlphaRowsBefore,
  countOpaqueAlphaInRow,
  cropAlphaMask,
  cropAlphaMaskRight,
  padMaskRegion,
  readAlphaBounds,
  type AlphaMaskPadding,
} from "./alpha-mask-geometry"
import type { SupportPixelsAdded } from "./part-alpha-mask"
import { isVeryLongShallowTopRecoveryCandidate } from "./part-support-top-geometry"

const PART_IMAGE_ALPHA_PADDING = 8
const PART_IMAGE_BOTTOM_ALPHA_PADDING = 14
const PART_IMAGE_LEFT_ALPHA_PADDING = 34
const PART_IMAGE_RIGHT_ALPHA_PADDING = 22
const PART_IMAGE_REFERENCE_REGION_SIZE = 54

interface AlphaTopClampResult {
  alphaMask: CalloutPartAlphaMask
  applied: boolean
  removedPixels: number
  topPaddingOverride?: number
  topLimit?: number
}

export interface PartAlphaTrimResult {
  alphaBounds?: Region
  alphaMask: CalloutPartAlphaMask
  region: Region
}

export function trimPartAlphaMask({
  allowLongShallowTopRecovery = false,
  allowTopCropContext = false,
  alphaMask,
  foregroundBounds,
  foregroundPixelCount,
  ownedRegion,
  preserveSparseLowContrastTopSupport = false,
  region,
  supportPixelsAdded,
}: {
  allowLongShallowTopRecovery?: boolean
  allowTopCropContext?: boolean
  alphaMask: CalloutPartAlphaMask
  foregroundBounds?: Region
  foregroundPixelCount?: number
  ownedRegion?: Region
  preserveSparseLowContrastTopSupport?: boolean
  region: Region
  supportPixelsAdded: SupportPixelsAdded
}): PartAlphaTrimResult {
  const coordinateScale = readPartImageCoordinateScale(region)
  const veryCompactTopClamp = clampEscapedVeryCompactTopAlpha(
    alphaMask,
    region,
    foregroundBounds,
    supportPixelsAdded,
    coordinateScale,
  )
  const componentCleanedAlphaMask = removeDetachedUpperAlphaNoise(
    veryCompactTopClamp.alphaMask,
    region,
    foregroundBounds,
    coordinateScale,
  )
  const shallowTopCleanedAlphaMask = removeSparseShallowLowerLabelTopAlpha(
    componentCleanedAlphaMask,
    region,
    foregroundBounds,
    foregroundPixelCount,
    coordinateScale,
  )
  const alphaTopClamp = preserveSparseLowContrastTopSupport
    ? { alphaMask: shallowTopCleanedAlphaMask, applied: false, removedPixels: 0 }
    : clampEscapedTopEdgeAlpha(
      shallowTopCleanedAlphaMask,
      region,
      foregroundBounds,
      coordinateScale,
    )
  const alphaBounds = readAlphaBounds(alphaTopClamp.alphaMask)
  const compactAlphaTrim = shouldUseTightAlphaPadding(
    alphaBounds ?? undefined,
    foregroundBounds,
    supportPixelsAdded,
    coordinateScale,
  )
  const padding = readAlphaTrimPadding(
    region,
    alphaBounds ?? undefined,
    ownedRegion,
    foregroundBounds,
    foregroundPixelCount,
    allowLongShallowTopRecovery,
    compactAlphaTrim,
    allowTopCropContext,
    alphaTopClamp.topPaddingOverride,
  )

  const trimmed = recoverShallowLowerLabelBottomAlpha(
    trimPartImageToAlphaBounds(alphaTopClamp.alphaMask, region, padding, alphaBounds ?? undefined),
    region,
    alphaBounds ?? undefined,
    foregroundBounds,
    foregroundPixelCount,
    coordinateScale,
  )

  return clampEscapedRightSupportToOwnedRegion(
    trimmed,
    region,
    trimmed.alphaBounds,
    ownedRegion,
    foregroundBounds,
    allowLongShallowTopRecovery,
  )
}

export function isVeryCompactForegroundBounds(bounds: Region, coordinateScale = 1): boolean {
  return bounds.width <= 30 * coordinateScale &&
    bounds.height <= 24 * coordinateScale &&
    bounds.width <= bounds.height * 2.6
}

function readTopAlphaPadding(
  region: Region,
  alphaBounds: Region | undefined,
  ownedRegion: Region | undefined,
  foregroundBounds: Region | undefined,
  allowLongShallowTopRecovery = false,
  allowTopCropContext = false,
): number {
  const basePadding = Math.max(PART_IMAGE_ALPHA_PADDING, Math.min(36, Math.round(region.height * 0.08)))

  if (
    allowLongShallowTopRecovery &&
    alphaBounds &&
    foregroundBounds &&
    shouldUseVeryLongShallowTopPadding(region, foregroundBounds)
  ) {
    return basePadding + readVeryLongShallowTopPaddingBoost(region)
  }

  if (!allowTopCropContext || !alphaBounds || !ownedRegion || !foregroundBounds) {
    return basePadding
  }

  const localOwnedTop = ownedRegion.y - region.y
  const topGap = alphaBounds.y - localOwnedTop

  if (!shouldKeepLongShallowTopContext(region, alphaBounds, foregroundBounds, topGap)) {
    return basePadding
  }

  return Math.max(basePadding, Math.min(28, topGap))
}

function shouldUseVeryLongShallowTopPadding(region: Region, foregroundBounds: Region): boolean {
  return isVeryLongShallowTopRecoveryCandidate(
    { height: region.height, width: region.width, x: 0, y: 0 },
    {
      height: foregroundBounds.height,
      width: foregroundBounds.width,
      x: foregroundBounds.x - region.x,
      y: foregroundBounds.y - region.y,
    },
  )
}

function readVeryLongShallowTopPaddingBoost(region: Region): number {
  return Math.max(1, Math.round(readPartImageCoordinateScale(region) * 0.75))
}

function readAlphaTrimPadding(
  region: Region,
  alphaBounds: Region | undefined,
  ownedRegion: Region | undefined,
  foregroundBounds: Region | undefined,
  foregroundPixelCount: number | undefined,
  allowLongShallowTopRecovery: boolean,
  compactAlphaTrim: boolean,
  allowTopCropContext = false,
  topPaddingOverride?: number,
): AlphaMaskPadding {
  const coordinateScale = readPartImageCoordinateScale(region)
  const top = topPaddingOverride ??
    readTopAlphaPadding(
      region,
      alphaBounds,
      ownedRegion,
      foregroundBounds,
      allowLongShallowTopRecovery,
      allowTopCropContext,
    )

  if (compactAlphaTrim && alphaBounds) {
    if (shouldUseDenseLowerLabelPlatePadding(region, alphaBounds, foregroundBounds, foregroundPixelCount)) {
      return readDenseLowerLabelPlatePadding(foregroundBounds)
    }

    if (shouldUseShallowLowerLabelCropPadding(
      region,
      alphaBounds,
      foregroundBounds,
      foregroundPixelCount,
      coordinateScale,
    )) {
      return {
        bottom: readShallowLowerLabelBottomPadding(foregroundBounds, coordinateScale),
        left: PART_IMAGE_LEFT_ALPHA_PADDING,
        right: PART_IMAGE_RIGHT_ALPHA_PADDING,
        top: coordinateScale,
      }
    }

    return {
      bottom: 0,
      left: 1,
      right: Math.max(2, Math.round(alphaBounds.height * 0.12)),
      top: readCompactAlphaTopPadding(alphaBounds),
    }
  }

  if (shouldUseDenseLowerLabelPlatePadding(region, alphaBounds, foregroundBounds, foregroundPixelCount)) {
    return readDenseLowerLabelPlatePadding(foregroundBounds)
  }

  if (shouldUseShallowLowerLabelCropPadding(
    region,
    alphaBounds,
    foregroundBounds,
    foregroundPixelCount,
    coordinateScale,
  )) {
    return {
      bottom: readShallowLowerLabelBottomPadding(foregroundBounds!, coordinateScale),
      left: PART_IMAGE_LEFT_ALPHA_PADDING,
      right: PART_IMAGE_RIGHT_ALPHA_PADDING,
      top: coordinateScale,
    }
  }

  return {
    bottom: allowLongShallowTopRecovery && shouldUseTightLongShallowBottomPadding(alphaBounds, foregroundBounds)
      ? 0
      : PART_IMAGE_BOTTOM_ALPHA_PADDING,
    left: PART_IMAGE_LEFT_ALPHA_PADDING,
    right: PART_IMAGE_RIGHT_ALPHA_PADDING,
    top,
  }
}

function shouldUseShallowLowerLabelCropPadding(
  region: Region,
  alphaBounds: Region | undefined,
  foregroundBounds: Region | undefined,
  foregroundPixelCount: number | undefined,
  coordinateScale: number,
): foregroundBounds is Region {
  if (!alphaBounds || !foregroundBounds) {
    return false
  }

  const localForegroundTop = foregroundBounds.y - region.y
  const topLift = localForegroundTop - alphaBounds.y

  return foregroundBounds.width >= 56 * coordinateScale &&
    region.height <= 56 * coordinateScale &&
    foregroundBounds.width >= foregroundBounds.height * 2.35 &&
    foregroundBounds.height >= 22 * coordinateScale &&
    foregroundBounds.height <= 36 * coordinateScale &&
    alphaBounds.height <= foregroundBounds.height + 8 * coordinateScale &&
    alphaBounds.width >= foregroundBounds.width * 0.9 &&
    hasSparseShallowLowerLabelForeground(foregroundBounds, foregroundPixelCount) &&
    topLift >= -2 * coordinateScale &&
    topLift <= 6 * coordinateScale
}

function hasSparseShallowLowerLabelForeground(
  foregroundBounds: Region,
  foregroundPixelCount: number | undefined,
): boolean {
  if (foregroundPixelCount === undefined) {
    return true
  }

  return foregroundPixelCount <= foregroundBounds.width * foregroundBounds.height * 4.2
}

function shouldUseDenseLowerLabelPlatePadding(
  region: Region,
  alphaBounds: Region | undefined,
  foregroundBounds: Region | undefined,
  foregroundPixelCount: number | undefined,
): foregroundBounds is Region {
  if (!alphaBounds || !foregroundBounds || foregroundPixelCount === undefined) {
    return false
  }

  const localForegroundTop = foregroundBounds.y - region.y
  const topLift = localForegroundTop - alphaBounds.y

  return foregroundBounds.width <= 110 &&
    foregroundBounds.width >= 56 &&
    foregroundBounds.width >= foregroundBounds.height * 2.2 &&
    foregroundBounds.height >= 32 &&
    foregroundBounds.height <= 44 &&
    alphaBounds.width >= foregroundBounds.width * 0.9 &&
    alphaBounds.height <= foregroundBounds.height + 8 &&
    !hasSparseShallowLowerLabelForeground(foregroundBounds, foregroundPixelCount) &&
    topLift >= -2 &&
    topLift <= 6
}

function readDenseLowerLabelPlatePadding(foregroundBounds: Region): AlphaMaskPadding {
  return {
    bottom: Math.max(3, Math.round(foregroundBounds.height * 0.1)),
    left: PART_IMAGE_LEFT_ALPHA_PADDING,
    right: PART_IMAGE_RIGHT_ALPHA_PADDING,
    top: Math.max(4, Math.round(foregroundBounds.height * 0.16)),
  }
}

function readShallowLowerLabelBottomPadding(foregroundBounds: Region, coordinateScale: number): number {
  return Math.max(8 * coordinateScale, Math.round(foregroundBounds.height * 0.35))
}

function removeSparseShallowLowerLabelTopAlpha(
  alphaMask: CalloutPartAlphaMask,
  region: Region,
  foregroundBounds: Region | undefined,
  foregroundPixelCount: number | undefined,
  coordinateScale: number,
): CalloutPartAlphaMask {
  const alphaBounds = readAlphaBounds(alphaMask)

  if (!shouldUseShallowLowerLabelCropPadding(
    region,
    alphaBounds ?? undefined,
    foregroundBounds,
    foregroundPixelCount,
    coordinateScale,
  )) {
    return alphaMask
  }

  const denseTop = findFirstDenseShallowAlphaRow(alphaMask, alphaBounds!, foregroundBounds, coordinateScale)

  if (denseTop === null) {
    return alphaMask
  }

  const sparseRows = denseTop - alphaBounds!.y
  const localForegroundTop = foregroundBounds.y - region.y

  if (
    sparseRows < 3 * coordinateScale ||
    sparseRows > 6 * coordinateScale ||
    denseTop > localForegroundTop + 4 * coordinateScale
  ) {
    return alphaMask
  }

  const cleared = clearAlphaRowsBefore(alphaMask, denseTop)

  return cleared.removedPixels > 0
    ? {
        ...alphaMask,
        data: cleared.data,
      }
    : alphaMask
}

function findFirstDenseShallowAlphaRow(
  alphaMask: CalloutPartAlphaMask,
  alphaBounds: Region,
  foregroundBounds: Region,
  coordinateScale: number,
): number | null {
  const denseThreshold = Math.max(20 * coordinateScale, Math.round(alphaBounds.width * 0.34))

  for (let y = alphaBounds.y; y < alphaBounds.y + alphaBounds.height; y += 1) {
    const rowCount = countOpaqueAlphaInRow(alphaMask, alphaBounds, y)

    if (rowCount >= denseThreshold && rowCount >= Math.round(foregroundBounds.width * 0.38)) {
      return y
    }
  }

  return null
}

function recoverShallowLowerLabelBottomAlpha(
  trimmed: PartAlphaTrimResult,
  originalRegion: Region,
  originalAlphaBounds: Region | undefined,
  foregroundBounds: Region | undefined,
  foregroundPixelCount: number | undefined,
  coordinateScale: number,
): PartAlphaTrimResult {
  if (!shouldUseShallowLowerLabelCropPadding(
    originalRegion,
    originalAlphaBounds,
    foregroundBounds,
    foregroundPixelCount,
    coordinateScale,
  )) {
    return trimmed
  }

  const alphaBounds = readAlphaBounds(trimmed.alphaMask)

  if (!alphaBounds) {
    return trimmed
  }

  const alphaBottom = trimmed.region.y + alphaBounds.y + alphaBounds.height - 1
  const foregroundBottom = foregroundBounds.y + foregroundBounds.height - 1
  const rowRoom = trimmed.alphaMask.height - (alphaBounds.y + alphaBounds.height)
  const extensionRows = Math.min(
    Math.max(2 * coordinateScale, Math.round(foregroundBounds.height * 0.16)),
    4 * coordinateScale,
    rowRoom,
  )

  if (alphaBottom > foregroundBottom || extensionRows < 2 * coordinateScale) {
    return trimmed
  }

  const recoveredMask = extendLowerAlphaEdge(trimmed.alphaMask, alphaBounds, extensionRows)
  const recoveredBounds = readAlphaBounds(recoveredMask)

  return {
    ...trimmed,
    alphaBounds: recoveredBounds
      ? {
          ...recoveredBounds,
          x: recoveredBounds.x + trimmed.region.x - originalRegion.x,
          y: recoveredBounds.y + trimmed.region.y - originalRegion.y,
        }
      : undefined,
    alphaMask: recoveredMask,
  }
}

function extendLowerAlphaEdge(
  alphaMask: CalloutPartAlphaMask,
  alphaBounds: Region,
  extensionRows: number,
): CalloutPartAlphaMask {
  const data = new Uint8ClampedArray(alphaMask.data)
  const sourceY = alphaBounds.y + alphaBounds.height - 1

  for (let offset = 1; offset <= extensionRows; offset += 1) {
    const targetY = sourceY + offset

    if (targetY >= alphaMask.height) {
      break
    }

    copyTaperedAlphaRow(data, alphaMask.width, sourceY, targetY, offset)
  }

  return {
    ...alphaMask,
    data,
  }
}

function copyTaperedAlphaRow(
  data: Uint8ClampedArray,
  width: number,
  sourceY: number,
  targetY: number,
  offset: number,
): void {
  const bounds = readOpaqueRowBounds(data, width, sourceY)

  if (!bounds) {
    return
  }

  const inset = Math.min(Math.floor((offset - 1) * 1.5), Math.floor((bounds.right - bounds.left) / 3))

  for (let x = bounds.left + inset; x <= bounds.right - inset; x += 1) {
    if (data[sourceY * width + x] > 0) {
      data[targetY * width + x] = data[sourceY * width + x]
    }
  }
}

function readOpaqueRowBounds(
  data: Uint8ClampedArray,
  width: number,
  y: number,
): { left: number; right: number } | null {
  let left = width
  let right = -1

  for (let x = 0; x < width; x += 1) {
    if (data[y * width + x] === 0) {
      continue
    }

    left = Math.min(left, x)
    right = Math.max(right, x)
  }

  return right < left ? null : { left, right }
}

function shouldUseTightLongShallowBottomPadding(
  alphaBounds: Region | undefined,
  foregroundBounds: Region | undefined,
): boolean {
  return Boolean(
    alphaBounds &&
      foregroundBounds &&
      foregroundBounds.width >= 56 &&
      foregroundBounds.width >= foregroundBounds.height * 2.2 &&
      alphaBounds.width >= foregroundBounds.width + 20 &&
      alphaBounds.height >= foregroundBounds.height * 1.6,
  )
}

function shouldUseTightAlphaPadding(
  alphaBounds: Region | undefined,
  foregroundBounds: Region | undefined,
  supportPixelsAdded: SupportPixelsAdded,
  coordinateScale = 1,
): alphaBounds is Region {
  if (!alphaBounds || !foregroundBounds) {
    return false
  }

  if (isVeryCompactForegroundBounds(foregroundBounds, coordinateScale)) {
    return false
  }

  if (supportPixelsAdded.top === 0 && supportPixelsAdded.bottom === 0 && supportPixelsAdded.interior === 0) {
    return false
  }

  if (foregroundBounds.width < 48 && foregroundBounds.height < 48) {
    return false
  }

  return foregroundBounds.width <= 72 &&
    foregroundBounds.height <= 44 &&
    alphaBounds.width <= 76 &&
    alphaBounds.height <= 48 &&
    isCompactForegroundBounds(foregroundBounds, coordinateScale) &&
    (alphaBounds.width > foregroundBounds.width || alphaBounds.height > foregroundBounds.height)
}

function readCompactAlphaTopPadding(alphaBounds: Region): number {
  if (alphaBounds.height >= 32) {
    return 2
  }

  return alphaBounds.height >= 20 ? 1 : 0
}

function isCompactForegroundBounds(bounds: Region, coordinateScale = 1): boolean {
  return bounds.width <= 48 * coordinateScale &&
    bounds.height <= 44 * coordinateScale &&
    bounds.width <= bounds.height * 2.8
}

function clampEscapedVeryCompactTopAlpha(
  alphaMask: CalloutPartAlphaMask,
  region: Region,
  foregroundBounds: Region | undefined,
  supportPixelsAdded: SupportPixelsAdded,
  coordinateScale: number,
): AlphaTopClampResult {
  if (
    !foregroundBounds ||
    !isVeryCompactForegroundBounds(foregroundBounds, coordinateScale) ||
    !hasUpperSupportPixels(supportPixelsAdded)
  ) {
    return { alphaMask, applied: false, removedPixels: 0 }
  }

  const alphaBounds = readAlphaBounds(alphaMask)

  if (!alphaBounds) {
    return { alphaMask, applied: false, removedPixels: 0 }
  }

  const edgeTolerance = Math.max(2 * coordinateScale, 3)
  if (alphaBounds.y > edgeTolerance) {
    return { alphaMask, applied: false, removedPixels: 0 }
  }

  const foregroundTop = foregroundBounds.y - region.y
  const topLimit = Math.max(0, foregroundTop - readVeryCompactTopLift(foregroundBounds, coordinateScale))
  const escapedRows = topLimit - alphaBounds.y

  if (topLimit <= 0 || escapedRows < 4 * coordinateScale) {
    return { alphaMask, applied: false, removedPixels: 0 }
  }

  const cleared = clearAlphaRowsBefore(alphaMask, topLimit)

  return cleared.removedPixels > 0
    ? {
        alphaMask: {
          ...alphaMask,
          data: cleared.data,
        },
        applied: true,
        removedPixels: cleared.removedPixels,
        topLimit,
      }
    : { alphaMask, applied: false, removedPixels: 0 }
}

function clampEscapedTopEdgeAlpha(
  alphaMask: CalloutPartAlphaMask,
  region: Region,
  foregroundBounds: Region | undefined,
  coordinateScale: number,
): AlphaTopClampResult {
  if (
    !foregroundBounds ||
    isVeryCompactForegroundBounds(foregroundBounds, coordinateScale)
  ) {
    return { alphaMask, applied: false, removedPixels: 0 }
  }

  const alphaBounds = readAlphaBounds(alphaMask)

  if (
    !alphaBounds ||
    !isEscapedTopEdgeAlpha(
      region,
      alphaBounds,
      foregroundBounds,
      coordinateScale,
      hasDenseTopEdgeLine(alphaMask, alphaBounds, coordinateScale),
    )
  ) {
    return { alphaMask, applied: false, removedPixels: 0 }
  }

  const topLimit = Math.max(0, foregroundBounds.y - region.y)
  const cleared = clearAlphaRowsBefore(alphaMask, topLimit)

  return cleared.removedPixels > 0
    ? {
        alphaMask: {
          ...alphaMask,
          data: cleared.data,
        },
        applied: true,
        removedPixels: cleared.removedPixels,
        topLimit,
        topPaddingOverride: readEscapedTopEdgePadding(foregroundBounds, coordinateScale),
      }
    : { alphaMask, applied: false, removedPixels: 0 }
}

function isEscapedTopEdgeAlpha(
  region: Region,
  alphaBounds: Region,
  foregroundBounds: Region,
  coordinateScale: number,
  useDenseTopEdgeRelaxation: boolean,
): boolean {
  const foregroundTop = foregroundBounds.y - region.y
  const topLift = foregroundTop - alphaBounds.y
  const edgeTolerance = Math.max(2 * coordinateScale, 3)
  const scaledLiftThreshold = useDenseTopEdgeRelaxation ? 18 * coordinateScale : 24 * coordinateScale
  const relativeLiftThreshold = foregroundBounds.height * (useDenseTopEdgeRelaxation ? 0.72 : 0.82)

  if (alphaBounds.y > edgeTolerance) {
    return false
  }

  return topLift >= Math.max(scaledLiftThreshold, relativeLiftThreshold) &&
    alphaBounds.height >= foregroundBounds.height + Math.max(18 * coordinateScale, foregroundBounds.height * 0.48)
}

function hasDenseTopEdgeLine(
  alphaMask: CalloutPartAlphaMask,
  alphaBounds: Region,
  coordinateScale: number,
): boolean {
  const topCount = countOpaqueAlphaInRow(alphaMask, alphaBounds, alphaBounds.y)
  const nextRows = Math.min(alphaBounds.y + Math.max(2, coordinateScale), alphaMask.height - 1)
  let nextRowPeak = 0

  for (let y = alphaBounds.y + 1; y <= nextRows; y += 1) {
    nextRowPeak = Math.max(nextRowPeak, countOpaqueAlphaInRow(alphaMask, alphaBounds, y))
  }

  return topCount >= alphaBounds.width * 0.72 &&
    nextRowPeak <= alphaBounds.width * 0.24
}

function readEscapedTopEdgePadding(bounds: Region, coordinateScale: number): number {
  const scaledPadding = Math.round(bounds.height * 0.12)

  return Math.max(3 * coordinateScale, Math.min(8 * coordinateScale, scaledPadding))
}

function hasUpperSupportPixels(supportPixelsAdded: SupportPixelsAdded): boolean {
  return supportPixelsAdded.top > 0 || supportPixelsAdded.interior > 0
}

function readVeryCompactTopLift(bounds: Region, coordinateScale = 1): number {
  if (bounds.width <= 24 * coordinateScale && bounds.height <= 20 * coordinateScale) {
    return coordinateScale
  }

  const shallowLift = bounds.width >= bounds.height * 1.35
    ? Math.round(bounds.height * 0.1)
    : Math.round(bounds.height * 0.14)

  return Math.max(coordinateScale, Math.min(3 * coordinateScale, shallowLift))
}

function removeDetachedUpperAlphaNoise(
  alphaMask: CalloutPartAlphaMask,
  region: Region,
  foregroundBounds: Region | undefined,
  coordinateScale: number,
): CalloutPartAlphaMask {
  if (!foregroundBounds || !isCompactDetachedUpperNoiseCandidate(foregroundBounds, coordinateScale)) {
    return alphaMask
  }

  const components = readAlphaComponents(alphaMask)

  if (components.length < 2) {
    return alphaMask
  }

  const lower = findLowerPartAlphaComponent(components, alphaMask.height, coordinateScale)

  if (!lower) {
    return alphaMask
  }

  const primaryUpperNoise = components.filter((component) =>
    component !== lower &&
    shouldDropDetachedUpperAlphaComponent(component, lower, region, foregroundBounds, coordinateScale, false),
  )

  if (primaryUpperNoise.length === 0) {
    return alphaMask
  }

  const upperNoise = components.filter((component) =>
    component !== lower &&
    shouldDropDetachedUpperAlphaComponent(component, lower, region, foregroundBounds, coordinateScale, true),
  )

  return {
    ...alphaMask,
    data: clearAlphaComponents(alphaMask, upperNoise),
  }
}

function isCompactDetachedUpperNoiseCandidate(foregroundBounds: Region, coordinateScale: number): boolean {
  return foregroundBounds.width <= 38 * coordinateScale &&
    foregroundBounds.height >= 28 * coordinateScale &&
    foregroundBounds.height <= 56 * coordinateScale
}

interface AlphaComponent {
  bottom: number
  count: number
  indices: number[]
  left: number
  right: number
  top: number
}

function readAlphaComponents(alphaMask: CalloutPartAlphaMask): AlphaComponent[] {
  const visited = new Uint8Array(alphaMask.width * alphaMask.height)
  const components: AlphaComponent[] = []

  for (let index = 0; index < alphaMask.data.length; index += 1) {
    if (alphaMask.data[index] === 0 || visited[index] > 0) {
      continue
    }

    components.push(floodAlphaComponent(alphaMask, visited, index))
  }

  return components.sort((left, right) => right.count - left.count)
}

function floodAlphaComponent(
  alphaMask: CalloutPartAlphaMask,
  visited: Uint8Array,
  startIndex: number,
): AlphaComponent {
  const stack = [startIndex]
  const component: AlphaComponent = {
    bottom: -1,
    count: 0,
    indices: [],
    left: alphaMask.width,
    right: -1,
    top: alphaMask.height,
  }

  visited[startIndex] = 1

  while (stack.length > 0) {
    const index = stack.pop()!
    const x = index % alphaMask.width
    const y = Math.floor(index / alphaMask.width)

    component.count += 1
    component.indices.push(index)
    component.left = Math.min(component.left, x)
    component.right = Math.max(component.right, x)
    component.top = Math.min(component.top, y)
    component.bottom = Math.max(component.bottom, y)
    pushAlphaNeighbors(alphaMask, visited, stack, x, y)
  }

  return component
}

function pushAlphaNeighbors(
  alphaMask: CalloutPartAlphaMask,
  visited: Uint8Array,
  stack: number[],
  x: number,
  y: number,
): void {
  for (let nextY = Math.max(0, y - 1); nextY <= Math.min(alphaMask.height - 1, y + 1); nextY += 1) {
    for (let nextX = Math.max(0, x - 1); nextX <= Math.min(alphaMask.width - 1, x + 1); nextX += 1) {
      const index = nextY * alphaMask.width + nextX

      if (visited[index] === 0 && alphaMask.data[index] > 0) {
        visited[index] = 1
        stack.push(index)
      }
    }
  }
}

function findLowerPartAlphaComponent(
  components: readonly AlphaComponent[],
  height: number,
  coordinateScale: number,
): AlphaComponent | undefined {
  const lowerBandTop = Math.max(0, height - 24 * coordinateScale)
  const viable = components.filter((component) =>
    component.count >= 24 * coordinateScale &&
    component.bottom >= lowerBandTop,
  )

  return viable.sort((left, right) =>
    readAlphaComponentCenterY(right) - readAlphaComponentCenterY(left) ||
    right.count - left.count,
  )[0]
}

function shouldDropDetachedUpperAlphaComponent(
  component: AlphaComponent,
  lower: AlphaComponent,
  region: Region,
  foregroundBounds: Region,
  coordinateScale: number,
  allowTinyResidue: boolean,
): boolean {
  const verticalGap = lower.top - component.bottom - 1
  const componentHeight = component.bottom - component.top + 1
  const componentWidth = component.right - component.left + 1
  const localForegroundTop = foregroundBounds.y - region.y
  const topEdgeTolerance = 4 * coordinateScale

  return component.top <= localForegroundTop + topEdgeTolerance &&
    verticalGap >= 6 * coordinateScale &&
    component.bottom < lower.top &&
    (
      componentWidth >= lower.right - lower.left + 1 ||
      (
        allowTinyResidue &&
        component.count <= readTinyDetachedTopNoiseLimit(lower, coordinateScale)
      )
    ) &&
    componentHeight <= Math.max(18 * coordinateScale, foregroundBounds.height * 0.55)
}

function readTinyDetachedTopNoiseLimit(lower: AlphaComponent, coordinateScale: number): number {
  return Math.max(8 * coordinateScale, Math.round(lower.count * 0.08))
}

function readAlphaComponentCenterY(component: AlphaComponent): number {
  return (component.top + component.bottom) / 2
}

function clearAlphaComponents(
  alphaMask: CalloutPartAlphaMask,
  components: readonly AlphaComponent[],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(alphaMask.data)

  for (const component of components) {
    for (const index of component.indices) {
      data[index] = 0
    }
  }

  return data
}

function readPartImageCoordinateScale(region: Region): number {
  const scale = Math.round(Math.min(region.width, region.height) / PART_IMAGE_REFERENCE_REGION_SIZE)

  return Math.max(1, Math.min(4, scale))
}

function shouldKeepLongShallowTopContext(
  region: Region,
  alphaBounds: Region,
  foregroundBounds: Region,
  topGap: number,
): boolean {
  return topGap >= 18 &&
    alphaBounds.width >= alphaBounds.height * 1.35 &&
    foregroundBounds.width >= foregroundBounds.height * 1.35 &&
    region.width <= region.height * 1.25
}

function trimPartImageToAlphaBounds(
  alphaMask: CalloutPartAlphaMask,
  region: Region,
  padding: AlphaMaskPadding,
  alphaBounds: Region | undefined,
): PartAlphaTrimResult {
  if (!alphaBounds) {
    return {
      alphaMask,
      region,
    }
  }

  const crop = padMaskRegion(alphaBounds, alphaMask, padding)

  return {
    alphaBounds,
    alphaMask: cropAlphaMask(alphaMask, crop),
    region: {
      height: crop.height,
      width: crop.width,
      x: region.x + crop.x,
      y: region.y + crop.y,
    },
  }
}

function clampEscapedRightSupportToOwnedRegion(
  trimmed: PartAlphaTrimResult,
  originalRegion: Region,
  alphaBounds: Region | undefined,
  ownedRegion: Region | undefined,
  foregroundBounds: Region | undefined,
  allowLongShallowTopRecovery: boolean,
): PartAlphaTrimResult {
  if (!alphaBounds || !ownedRegion || !foregroundBounds) {
    return trimmed
  }

  const ownedRight = ownedRegion.x + ownedRegion.width
  const foregroundRight = foregroundBounds.x + foregroundBounds.width
  const alphaRight = originalRegion.x + alphaBounds.x + alphaBounds.width
  const overflow = alphaRight - ownedRight

  if (
    shouldKeepLongShallowRightSupport(
      originalRegion,
      alphaBounds,
      ownedRegion,
      foregroundBounds,
      overflow,
      allowLongShallowTopRecovery,
    ) ||
    overflow <= Math.max(10, Math.round(foregroundBounds.height * 0.55)) ||
    foregroundRight > ownedRight ||
    trimmed.region.x + trimmed.region.width <= ownedRight
  ) {
    return trimmed
  }

  const nextWidth = ownedRight - trimmed.region.x

  if (nextWidth < Math.max(1, Math.round(trimmed.region.width * 0.45))) {
    return trimmed
  }

  const alphaMask = cropAlphaMaskRight(trimmed.alphaMask, nextWidth)

  return {
    ...trimmed,
    alphaMask: clearAlphaMaskRightOf(alphaMask, foregroundRight - trimmed.region.x),
    region: {
      ...trimmed.region,
      width: nextWidth,
    },
  }
}

function shouldKeepLongShallowRightSupport(
  originalRegion: Region,
  alphaBounds: Region,
  ownedRegion: Region,
  foregroundBounds: Region,
  overflow: number,
  allowLongShallowTopRecovery: boolean,
): boolean {
  if (!allowLongShallowTopRecovery) {
    return false
  }

  const shallowForeground = foregroundBounds.width >= 56 &&
    foregroundBounds.width >= foregroundBounds.height * 2.2
  const extendedAlpha = alphaBounds.width >= foregroundBounds.width + 20
  const supportWidthSlack = Math.max(2, readPartImageCoordinateScale(originalRegion) * 2)
  const boundedSupportWidth = alphaBounds.width <= Math.max(
    Math.round(foregroundBounds.width * 1.6),
    foregroundBounds.width + 36,
  ) + supportWidthSlack
  const ownedEnvelopeTracksPart = ownedRegion.width >= foregroundBounds.width + 12
  const boundedOverflow = overflow <= Math.max(34, Math.round(foregroundBounds.width * 0.6))

  return shallowForeground &&
    extendedAlpha &&
    boundedSupportWidth &&
    ownedEnvelopeTracksPart &&
    boundedOverflow &&
    originalRegion.width >= foregroundBounds.width + 40
}
