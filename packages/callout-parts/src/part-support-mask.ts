import type { BackgroundModel } from "./background-model"
import type { CalloutPartPageInput, Region } from "./contracts"
import { fillBottomEdgeSupport } from "./part-support-bottom"
import {
  readMaskValueBounds,
  SUPPORT_BOTTOM_EDGE,
  SUPPORT_INTERIOR,
  SUPPORT_OWNED,
  SUPPORT_TOP_FACE,
} from "./part-support-common"
import { fillHorizontalInterior, fillVerticalInterior } from "./part-support-interior"
import { fillTopFaceSupport, fillTopGapBridgeSupport } from "./part-support-top"
import { isVeryLongShallowTopRecoveryCandidate } from "./part-support-top-geometry"
import type { LowContrastFaceSupportMode } from "./part-support-types"

export interface PartSupportPoint {
  x: number
  y: number
}

export interface PartSupportMask {
  data: Uint8Array
  diagnostics: {
    bottom: number
    compactTopSupport: boolean
    interior: number
    ownedBounds?: Region
    top: number
  }
}

export interface PartSupportMaskOptions {
  enableLongShallowTopRecovery?: boolean
  enableLowContrastFaceSupport?: boolean
  enableTopSupport?: boolean
  lowContrastFaceSupportMode?: LowContrastFaceSupportMode
  ownedRegion?: Region
}

export function createOwnedPixelMask(region: Region, pixels: readonly PartSupportPoint[]): Uint8Array {
  const mask = new Uint8Array(region.width * region.height)

  for (const pixel of pixels) {
    const x = pixel.x - region.x
    const y = pixel.y - region.y

    if (x < 0 || y < 0 || x >= region.width || y >= region.height) {
      continue
    }

    mask[y * region.width + x] = SUPPORT_OWNED
  }

  return mask
}

export function createPartSupportMask(
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  pixels: readonly PartSupportPoint[],
  options: PartSupportMaskOptions = {},
): PartSupportMask {
  const ownedMask = createOwnedPixelMask(region, pixels)
  const ownedBounds = readMaskValueBounds(ownedMask, region.width, region.height)
  const mask = ownedMask.slice()
  const enableTopSupport = options.enableTopSupport ?? true

  fillHorizontalInterior(mask, region)
  fillVerticalInterior(mask, region)
  const interiorMask = mask.slice()
  if (enableTopSupport) {
    const compactTopSupport = Boolean(ownedBounds && isCompactOwnedComponent(ownedBounds))

    fillTopFaceSupport(mask, ownedMask, interiorMask, page, region, background)
    if (!compactTopSupport) {
      fillTopGapBridgeSupport(
        mask,
        page,
        region,
        background,
        options.ownedRegion,
        options.enableLowContrastFaceSupport,
        options.lowContrastFaceSupportMode,
        options.enableLongShallowTopRecovery ? ownedBounds : undefined,
      )
    }
    removeDetachedTopSupport(mask, ownedMask, region.width, region.height, options.enableLongShallowTopRecovery)
    removeExcessCompactTopSupport(mask, ownedMask, ownedBounds, region.width, region.height)
  }
  fillBottomEdgeSupport(mask, ownedMask, interiorMask, page, region, background)
  removeExcessCompactTopSupport(mask, ownedMask, ownedBounds, region.width, region.height)

  return {
    data: mask,
    diagnostics: {
      bottom: countSupportPixels(mask, ownedMask, SUPPORT_BOTTOM_EDGE),
      compactTopSupport: Boolean(ownedBounds && isCompactOwnedComponent(ownedBounds)),
      interior: countSupportPixels(mask, ownedMask, SUPPORT_INTERIOR),
      ownedBounds,
      top: countSupportPixels(mask, ownedMask, SUPPORT_TOP_FACE),
    },
  }
}

function countSupportPixels(mask: Uint8Array, ownedMask: Uint8Array, value: number): number {
  let count = 0

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === value && ownedMask[index] === 0) {
      count += 1
    }
  }

  return count
}

function removeDetachedTopSupport(
  mask: Uint8Array,
  ownedMask: Uint8Array,
  width: number,
  height: number,
  preserveLongShallowProjection = false,
): void {
  const reachable = findReachableSupport(mask, ownedMask, width, height)
  const ownedBounds = readLocalMaskBounds(ownedMask, width, height)

  for (let index = 0; index < mask.length; index += 1) {
    if (shouldRemoveDetachedTopSupport(mask, reachable, index, width, height, ownedBounds, preserveLongShallowProjection)) {
      mask[index] = 0
    }
  }
}

function removeExcessCompactTopSupport(
  mask: Uint8Array,
  ownedMask: Uint8Array,
  ownedBounds: Region | undefined,
  width: number,
  height: number,
): void {
  if (!ownedBounds || !isCompactOwnedComponent(ownedBounds)) {
    return
  }

  const topLimit = Math.max(0, ownedBounds.y - readCompactTopLift(ownedBounds))

  for (let y = 0; y < Math.min(topLimit, height); y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x

      if (ownedMask[index] === 0) {
        mask[index] = 0
      }
    }
  }
}

function isCompactOwnedComponent(bounds: Region): boolean {
  return bounds.width <= 30 &&
    bounds.height <= 24 &&
    bounds.width <= bounds.height * 2.6
}

function readCompactTopLift(bounds: Region): number {
  const liftRatio = bounds.width >= bounds.height * 1.35 ? 1.15 : 0.58

  return Math.max(2, Math.min(24, Math.round(bounds.height * liftRatio)))
}

function findReachableSupport(mask: Uint8Array, ownedMask: Uint8Array, width: number, height: number): Uint8Array {
  const reachable = seedReachableOwnedPixels(ownedMask)
  const stack: number[] = []

  for (let index = 0; index < ownedMask.length; index += 1) {
    if (ownedMask[index] > 0) {
      stack.push(index)
    }
  }

  while (stack.length > 0) {
    visitNeighborIndexes(stack.pop()!, width, height, (nextIndex) => {
      addReachableSupportIndex(mask, reachable, stack, nextIndex)
    })
  }

  return reachable
}

function seedReachableOwnedPixels(ownedMask: Uint8Array): Uint8Array {
  const reachable = new Uint8Array(ownedMask.length)

  for (let index = 0; index < ownedMask.length; index += 1) {
    if (ownedMask[index] > 0) {
      reachable[index] = 1
    }
  }

  return reachable
}

function visitNeighborIndexes(index: number, width: number, height: number, visit: (index: number) => void): void {
  const x = index % width
  const y = Math.floor(index / width)

  for (let nextY = Math.max(0, y - 1); nextY <= Math.min(height - 1, y + 1); nextY += 1) {
    for (let nextX = Math.max(0, x - 1); nextX <= Math.min(width - 1, x + 1); nextX += 1) {
      visit(nextY * width + nextX)
    }
  }
}

function addReachableSupportIndex(
  mask: Uint8Array,
  reachable: Uint8Array,
  stack: number[],
  index: number,
): void {
  if (reachable[index] > 0 || mask[index] === 0) {
    return
  }

  reachable[index] = 1
  stack.push(index)
}

function shouldRemoveDetachedTopSupport(
  mask: Uint8Array,
  reachable: Uint8Array,
  index: number,
  width: number,
  height: number,
  ownedBounds: Region | undefined,
  preserveLongShallowProjection: boolean,
): boolean {
  return mask[index] === SUPPORT_TOP_FACE &&
    reachable[index] === 0 &&
    !isAboveOwnedHorizontalSpan(index, width, ownedBounds) &&
    (!preserveLongShallowProjection || !isWithinVeryLongShallowTopProjection(index, width, height, ownedBounds))
}

function isAboveOwnedHorizontalSpan(index: number, width: number, ownedBounds: Region | undefined): boolean {
  if (!ownedBounds) {
    return false
  }

  const x = index % width
  const tolerance = 2

  return x >= ownedBounds.x - tolerance && x < ownedBounds.x + ownedBounds.width + tolerance
}

function isWithinVeryLongShallowTopProjection(
  index: number,
  width: number,
  height: number,
  ownedBounds: Region | undefined,
): boolean {
  if (!ownedBounds || !isVeryLongShallowTopRecoveryCandidate({ height, width, x: 0, y: 0 }, ownedBounds)) {
    return false
  }

  const x = index % width
  const y = Math.floor(index / width)

  if (y >= ownedBounds.y) {
    return false
  }

  const lift = ownedBounds.y - y
  const left = Math.max(0, ownedBounds.x - Math.max(2, Math.round(ownedBounds.height * 0.18)))
  const right = Math.min(
    width - 1,
    ownedBounds.x + ownedBounds.width - 1 + Math.ceil(lift * 1.25) + Math.round(ownedBounds.width * 0.1),
  )

  return x >= left && x <= right
}

function readLocalMaskBounds(mask: Uint8Array, width: number, height: number): Region | undefined {
  let left = width
  let right = -1
  let top = height
  let bottom = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] === 0) {
        continue
      }

      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }

  return right < left || bottom < top
    ? undefined
    : { height: bottom - top + 1, width: right - left + 1, x: left, y: top }
}
