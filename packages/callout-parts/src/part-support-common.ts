import { matchBackgroundColor, type BackgroundModel } from "./background-model"
import type { CalloutPartPageInput, Region } from "./contracts"
import { colorLuma, readAlpha, readPixel } from "./pixels"

export const SUPPORT_OWNED = 1
export const SUPPORT_INTERIOR = 2
export const SUPPORT_TOP_FACE = 3
export const SUPPORT_BOTTOM_EDGE = 4

export const SUPPORT_ALPHA_DISTANCE_MIN = 3
export const SUPPORT_TOP_ALPHA_DISTANCE_LOOSE_MIN = 1
export const SUPPORT_TOP_ALPHA_DISTANCE_MIN = 18
export const SUPPORT_DARK_BACKGROUND_LUMA_DROP_MIN = 12
export const SUPPORT_TOP_DARK_BACKGROUND_LUMA_DROP_MIN = 4

export interface MaskRun {
  left: number
  right: number
}

export interface SupportPixelOptions {
  allowDarkBackgroundLike: boolean
  lumaDropMin: number
  nearBackgroundDistanceMin: number
}

export function readRowSeedDensity(
  mask: Uint8Array,
  width: number,
  y: number,
  left: number,
  right: number,
): number {
  let count = 0

  for (let x = left; x <= right; x += 1) {
    count += mask[y * width + x] > 0 ? 1 : 0
  }

  return count / Math.max(1, right - left + 1)
}

export function hasSeedInRow(
  mask: Uint8Array,
  width: number,
  y: number,
  left: number,
  right: number,
): boolean {
  for (let x = left; x <= right; x += 1) {
    if (mask[y * width + x] > 0) {
      return true
    }
  }

  return false
}

export function readMaskRuns(mask: Uint8Array, width: number, y: number): MaskRun[] {
  const runs: MaskRun[] = []
  let left = -1

  for (let x = 0; x < width; x += 1) {
    if (mask[y * width + x] > 0) {
      if (left < 0) {
        left = x
      }
      continue
    }

    if (left >= 0) {
      runs.push({ left, right: x - 1 })
      left = -1
    }
  }

  if (left >= 0) {
    runs.push({ left, right: width - 1 })
  }

  return runs
}

export function fillPotentialPartSupportRun(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  y: number,
  left: number,
  right: number,
  value: number,
  minDistance: number,
  options: SupportPixelOptions,
): void {
  if (left < 0 || right - left < 2) {
    return
  }

  for (let x = left; x <= right; x += 1) {
    if (isPotentialPartSupportPixel(page, region.x + x, region.y + y, background, minDistance, options)) {
      writeSupportPixel(mask, region.width, x, y, value)
    }
  }
}

export function isPotentialPartSupportPixel(
  page: CalloutPartPageInput,
  x: number,
  y: number,
  background: BackgroundModel,
  minDistance: number,
  options: SupportPixelOptions,
): boolean {
  if (readAlpha(page, x, y) < 32) {
    return false
  }

  const color = readPixel(page, x, y)
  const backgroundMatch = matchBackgroundColor(background, color)

  if (backgroundMatch.distance <= minDistance) {
    return isSupportedDarkBackgroundLikePixel(color, backgroundMatch.nearest, backgroundMatch.distance, options)
  }

  if (!backgroundMatch.isBackgroundLike) {
    return true
  }

  return options.allowDarkBackgroundLike &&
    isDarkBackgroundLikePixel(color, backgroundMatch.nearest)
}

export function writeSupportPixel(
  mask: Uint8Array,
  width: number,
  x: number,
  y: number,
  value: number,
): void {
  const index = y * width + x

  if (mask[index] === 0) {
    mask[index] = value
  }
}

export function readMaskValueBounds(
  mask: Uint8Array,
  width: number,
  height: number,
): Region | undefined {
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

function isSupportedDarkBackgroundLikePixel(
  color: ReturnType<typeof readPixel>,
  background: ReturnType<typeof readPixel>,
  distance: number,
  options: SupportPixelOptions,
): boolean {
  return options.allowDarkBackgroundLike &&
    distance >= options.nearBackgroundDistanceMin &&
    isDarkBackgroundLikePixel(color, background, options.lumaDropMin)
}

function isDarkBackgroundLikePixel(
  color: ReturnType<typeof readPixel>,
  background: ReturnType<typeof readPixel>,
  lumaDropMin = SUPPORT_DARK_BACKGROUND_LUMA_DROP_MIN,
): boolean {
  return colorLuma(color) <= colorLuma(background) - lumaDropMin
}
