import {
  matchBackgroundColor,
  type BackgroundModel,
} from "./background-model"
import type {
  CalloutPartAlphaMask,
  CalloutPartPageInput,
  Region,
} from "./contracts"
import { isSuppressedLabelPixel, type LabelSuppressionMask } from "./label-suppression"
import {
  createOwnedPixelMask,
  createPartSupportMask,
} from "./part-support-mask"
import {
  SUPPORT_TOP_FACE,
} from "./part-support-common"
import type { LowContrastFaceSupportMode } from "./part-support-types"
import { colorLuma, readAlpha, readPixel } from "./pixels"

const FOREGROUND_ALPHA_DISTANCE_MIN = 38
const WEAK_FOREGROUND_ALPHA = 96
const PROTECTED_TOP_FACE_LUMA_DROP_MIN = 2

export interface PartImagePoint {
  x: number
  y: number
}

export interface SupportPixelsAdded {
  bottom: number
  interior: number
  top: number
}

export interface PartAlphaMaskOwnership {
  allowLongShallowTopRecovery?: boolean
  enableLowContrastFaceSupport?: boolean
  enableTopSupport?: boolean
  foregroundPixels?: readonly PartImagePoint[]
  labelSuppressionMasks?: readonly LabelSuppressionMask[]
  lowContrastFaceSupportMode?: LowContrastFaceSupportMode
  ownedRegion?: Region
}

type PartSupportMask = ReturnType<typeof createPartSupportMask>

export function createPartAlphaMask(
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  ownership: PartAlphaMaskOwnership,
): {
  alphaMask: CalloutPartAlphaMask
  supportPixelsAdded: SupportPixelsAdded
} {
  const data = new Uint8ClampedArray(region.width * region.height)
  const backgroundLikeMask = new Uint8Array(region.width * region.height)
  const protectedSupportMask = new Uint8Array(region.width * region.height)
  const ownedPixelMask = ownership.foregroundPixels
    ? createOwnedPixelMask(region, ownership.foregroundPixels)
    : null
  const support = createOptionalPartSupportMask(page, region, background, ownership)

  writePartAlphaMaskPixels({
    background,
    backgroundLikeMask,
    data,
    ownedPixelMask,
    ownership,
    page,
    protectedSupportMask,
    region,
    support,
  })
  clearOutsideConnectedBackgroundAlpha(data, backgroundLikeMask, protectedSupportMask, region.width, region.height)

  return {
    alphaMask: {
      data,
      height: region.height,
      width: region.width,
    },
    supportPixelsAdded: readSupportPixelsAdded(support),
  }
}

function createOptionalPartSupportMask(
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  ownership: PartAlphaMaskOwnership,
): PartSupportMask | null {
  if (!ownership.foregroundPixels) {
    return null
  }

  return createPartSupportMask(page, region, background, ownership.foregroundPixels, {
    enableLongShallowTopRecovery: ownership.allowLongShallowTopRecovery,
    enableLowContrastFaceSupport: ownership.enableLowContrastFaceSupport,
    enableTopSupport: ownership.enableTopSupport,
    lowContrastFaceSupportMode: ownership.lowContrastFaceSupportMode,
    ownedRegion: ownership.ownedRegion,
  })
}

function writePartAlphaMaskPixels({
  background,
  backgroundLikeMask,
  data,
  ownedPixelMask,
  ownership,
  page,
  protectedSupportMask,
  region,
  support,
}: {
  background: BackgroundModel
  backgroundLikeMask: Uint8Array
  data: Uint8ClampedArray
  ownedPixelMask: Uint8Array | null
  ownership: PartAlphaMaskOwnership
  page: CalloutPartPageInput
  protectedSupportMask: Uint8Array
  region: Region
  support: PartSupportMask | null
}): void {
  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      writePartAlphaMaskPixel({
        background,
        backgroundLikeMask,
        data,
        ownedPixelMask,
        ownership,
        page,
        protectedSupportMask,
        region,
        support,
        x,
        y,
      })
    }
  }
}

function writePartAlphaMaskPixel({
  background,
  backgroundLikeMask,
  data,
  ownedPixelMask,
  ownership,
  page,
  protectedSupportMask,
  region,
  support,
  x,
  y,
}: {
  background: BackgroundModel
  backgroundLikeMask: Uint8Array
  data: Uint8ClampedArray
  ownedPixelMask: Uint8Array | null
  ownership: PartAlphaMaskOwnership
  page: CalloutPartPageInput
  protectedSupportMask: Uint8Array
  region: Region
  support: PartSupportMask | null
  x: number
  y: number
}): void {
  const pageX = region.x + x
  const pageY = region.y + y
  const maskIndex = y * region.width + x
  const owned = !ownedPixelMask || ownedPixelMask[maskIndex] > 0
  const supportKind = support?.data[maskIndex] ?? 0
  const supported = supportKind > 0

  if (shouldSkipMaskPixel(ownership, ownedPixelMask, { owned, pageX, pageY, supported })) {
    return
  }

  const sourceAlpha = readAlpha(page, pageX, pageY)
  const sourceColor = readPixel(page, pageX, pageY)
  const backgroundMatch = matchBackgroundColor(background, sourceColor)

  backgroundLikeMask[maskIndex] = backgroundMatch.isBackgroundLike ? 1 : 0
  protectedSupportMask[maskIndex] = shouldProtectOutsideConnectedSupport(
    sourceColor,
    backgroundMatch,
    supportKind,
    {
      preserveLowContrastTopFaceSupport: Boolean(ownership.enableLowContrastFaceSupport),
    },
  )
    ? 1
    : 0
  data[maskIndex] = readMaskAlpha(sourceAlpha, backgroundMatch, { owned, supported })
}

function readSupportPixelsAdded(support: PartSupportMask | null): SupportPixelsAdded {
  return support
    ? {
        bottom: support.diagnostics.bottom,
        interior: support.diagnostics.interior,
        top: support.diagnostics.top,
      }
    : { bottom: 0, interior: 0, top: 0 }
}

function shouldSkipMaskPixel(
  ownership: PartAlphaMaskOwnership,
  ownedPixelMask: Uint8Array | null,
  pixel: { owned: boolean; pageX: number; pageY: number; supported: boolean },
): boolean {
  return (isOutsideOwnedRegion(ownership.ownedRegion, pixel.pageX, pixel.pageY) && !pixel.supported) ||
    isOutsideSelectedForeground(ownedPixelMask, pixel.owned, pixel.supported) ||
    isSuppressedLabelPixel(ownership.labelSuppressionMasks ?? [], pixel.pageX, pixel.pageY)
}

function isOutsideOwnedRegion(region: Region | undefined, x: number, y: number): boolean {
  return Boolean(region && !isInsideRegion(region, x, y))
}

function isOutsideSelectedForeground(
  ownedPixelMask: Uint8Array | null,
  owned: boolean,
  supported: boolean,
): boolean {
  return Boolean(ownedPixelMask && !owned && !supported)
}

function isInsideRegion(region: Region, x: number, y: number): boolean {
  return x >= region.x &&
    y >= region.y &&
    x < region.x + region.width &&
    y < region.y + region.height
}

function readMaskAlpha(
  sourceAlpha: number,
  backgroundMatch: { distance: number; isBackgroundLike: boolean },
  ownership: { owned: boolean; supported: boolean } = {
    owned: false,
    supported: false,
  },
): number {
  if (sourceAlpha < 32) {
    return 0
  }

  if (ownership.owned || ownership.supported) {
    return sourceAlpha
  }

  if (backgroundMatch.isBackgroundLike) {
    return 0
  }

  if (backgroundMatch.distance >= FOREGROUND_ALPHA_DISTANCE_MIN) {
    return sourceAlpha
  }

  return Math.min(sourceAlpha, WEAK_FOREGROUND_ALPHA)
}

function shouldProtectOutsideConnectedSupport(
  sourceColor: ReturnType<typeof readPixel>,
  backgroundMatch: ReturnType<typeof matchBackgroundColor>,
  supportKind: number,
  options: {
    preserveLowContrastTopFaceSupport: boolean
  },
): boolean {
  if (supportKind !== SUPPORT_TOP_FACE || !backgroundMatch.isBackgroundLike) {
    return false
  }

  return options.preserveLowContrastTopFaceSupport ||
    colorLuma(sourceColor) <= colorLuma(backgroundMatch.nearest) - PROTECTED_TOP_FACE_LUMA_DROP_MIN
}

function clearOutsideConnectedBackgroundAlpha(
  alpha: Uint8ClampedArray,
  backgroundLikeMask: Uint8Array,
  protectedSupportMask: Uint8Array,
  width: number,
  height: number,
): void {
  const visited = new Uint8Array(width * height)
  const stack: number[] = []

  pushBorderFloodSeeds(stack, visited, alpha, backgroundLikeMask, protectedSupportMask, width, height)

  while (stack.length > 0) {
    const index = stack.pop()!

    if (alpha[index] > 0 && backgroundLikeMask[index] > 0) {
      alpha[index] = 0
    }

    visitFloodNeighbors(index, width, height, (nextIndex) => {
      if (
        visited[nextIndex] === 0 &&
        canFloodOutsideBackgroundAlpha(alpha, backgroundLikeMask, protectedSupportMask, nextIndex)
      ) {
        visited[nextIndex] = 1
        stack.push(nextIndex)
      }
    })
  }
}

function pushBorderFloodSeeds(
  stack: number[],
  visited: Uint8Array,
  alpha: Uint8ClampedArray,
  backgroundLikeMask: Uint8Array,
  protectedSupportMask: Uint8Array,
  width: number,
  height: number,
): void {
  for (let x = 0; x < width; x += 1) {
    pushFloodSeed(stack, visited, alpha, backgroundLikeMask, protectedSupportMask, x, 0, width)
    pushFloodSeed(stack, visited, alpha, backgroundLikeMask, protectedSupportMask, x, height - 1, width)
  }

  for (let y = 1; y < height - 1; y += 1) {
    pushFloodSeed(stack, visited, alpha, backgroundLikeMask, protectedSupportMask, 0, y, width)
    pushFloodSeed(stack, visited, alpha, backgroundLikeMask, protectedSupportMask, width - 1, y, width)
  }
}

function pushFloodSeed(
  stack: number[],
  visited: Uint8Array,
  alpha: Uint8ClampedArray,
  backgroundLikeMask: Uint8Array,
  protectedSupportMask: Uint8Array,
  x: number,
  y: number,
  width: number,
): void {
  const index = y * width + x

  if (
    visited[index] === 0 &&
    canFloodOutsideBackgroundAlpha(alpha, backgroundLikeMask, protectedSupportMask, index)
  ) {
    visited[index] = 1
    stack.push(index)
  }
}

function canFloodOutsideBackgroundAlpha(
  alpha: Uint8ClampedArray,
  backgroundLikeMask: Uint8Array,
  protectedSupportMask: Uint8Array,
  index: number,
): boolean {
  if (alpha[index] === 0) {
    return true
  }

  if (backgroundLikeMask[index] === 0) {
    return false
  }

  return protectedSupportMask[index] === 0
}

function visitFloodNeighbors(
  index: number,
  width: number,
  height: number,
  visit: (index: number) => void,
): void {
  const x = index % width
  const y = Math.floor(index / width)

  for (let nextY = Math.max(0, y - 1); nextY <= Math.min(height - 1, y + 1); nextY += 1) {
    for (let nextX = Math.max(0, x - 1); nextX <= Math.min(width - 1, x + 1); nextX += 1) {
      if (nextX !== x || nextY !== y) {
        visit(nextY * width + nextX)
      }
    }
  }
}
