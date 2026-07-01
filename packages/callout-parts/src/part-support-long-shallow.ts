import type { BackgroundModel } from "./background-model"
import type { CalloutPartPageInput, Region } from "./contracts"
import {
  readMaskRuns,
  SUPPORT_TOP_FACE,
  writeSupportPixel,
} from "./part-support-common"
import {
  isConnectedLongShallowEndCapPixel,
  isLongShallowContinuationPixel,
  isLongShallowFaceSupportPixel,
  isLongShallowHighlightPixel,
} from "./part-support-top-pixels"
import {
  hasNearbySupportPixel,
  isLongShallowEndCapCandidate,
  isLongShallowWeakFaceCandidate,
  isVeryLongShallowTopRecoveryCandidate,
  LONG_SHALLOW_END_CAP_CONNECT_RADIUS,
  visitLocalRect,
} from "./part-support-top-geometry"
import { readAlpha } from "./pixels"

const LONG_SHALLOW_CONTINUATION_GAP_MAX = 5
const LONG_SHALLOW_CONTINUATION_MIN_PIXELS = 3
const LONG_SHALLOW_END_CAP_PASSES = 4

export function fillLongShallowLocalWeakFaceSupport(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  bounds: Region,
  enableScaledVeryLongTopLift = false,
): void {
  if (!isLongShallowWeakFaceCandidate(region, bounds)) {
    return
  }

  const maxLift = readLongShallowWeakFaceMaxLift(region, bounds, 28, 0.75, 8, enableScaledVeryLongTopLift)
  const top = Math.max(0, bounds.y - maxLift)
  const bottom = bounds.y - 1
  const left = Math.max(0, bounds.x - Math.max(2, Math.round(bounds.height * 0.18)))
  const right = Math.min(region.width - 1, bounds.x + bounds.width - 1 + Math.max(2, Math.round(bounds.height * 0.22)))

  if (top > bottom) {
    return
  }

  for (let y = top; y <= bottom; y += 1) {
    fillLongShallowFaceSupportRun(mask, page, region, background, y, left, right, SUPPORT_TOP_FACE)
  }
}

export function fillLongShallowWeakFaceSupport(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  bounds: Region,
  enableScaledVeryLongTopLift = false,
): void {
  if (!isLongShallowWeakFaceCandidate(region, bounds)) {
    return
  }

  const maxLift = readLongShallowWeakFaceMaxLift(region, bounds, 32, 0.9, 12, enableScaledVeryLongTopLift)
  const top = Math.max(0, bounds.y - maxLift)
  const bottom = bounds.y - 1
  const baseLeft = bounds.x
  const baseRight = bounds.x + bounds.width - 1
  const maxRight = Math.min(region.width - 1, baseRight + Math.max(14, Math.round(bounds.width * 0.9)))

  if (top > bottom) {
    return
  }

  for (let y = top; y <= bottom; y += 1) {
    const lift = Math.max(0, bounds.y - y)
    const left = baseLeft
    const right = Math.min(maxRight, baseRight + Math.ceil(lift * 1.25) + Math.round(bounds.width * 0.1))

    fillLongShallowFaceSupportRun(
      mask,
      page,
      region,
      background,
      y,
      left,
      right,
      SUPPORT_TOP_FACE,
    )
  }
}

export function fillLongShallowFaceSupportRun(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  y: number,
  left: number,
  right: number,
  value: number,
): void {
  if (left < 0 || right - left < 2) {
    return
  }

  for (let x = left; x <= right; x += 1) {
    if (isLongShallowFaceSupportPixel(page, region, background, x, y)) {
      writeSupportPixel(mask, region.width, x, y, value)
    }
  }
}

export function fillLongShallowHorizontalContinuationSupport(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  bounds: Region,
): void {
  if (!isLongShallowWeakFaceCandidate(region, bounds)) {
    return
  }

  const maxRight = Math.min(region.width - 1, bounds.x + bounds.width - 1 + Math.max(18, Math.round(bounds.width * 0.9)))
  const bottom = Math.min(region.height - 1, bounds.y + bounds.height - 1)

  for (let y = bounds.y; y <= bottom; y += 1) {
    const runs = readMaskRuns(mask, region.width, y)
      .filter((run) => run.right >= bounds.x && run.left <= bounds.x + bounds.width - 1)
    const rightmost = runs.at(-1)

    if (!rightmost || rightmost.right >= maxRight) {
      continue
    }

    fillRightwardContinuationRun(mask, page, region, background, y, rightmost.right + 1, maxRight)
  }
}

export function fillLongShallowHighlightInteriorSupport(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  bounds: Region,
): void {
  if (!isLongShallowWeakFaceCandidate(region, bounds)) {
    return
  }

  const top = Math.max(0, bounds.y - Math.max(6, Math.round(bounds.height * 0.18)))
  const bottom = Math.min(region.height - 1, bounds.y + Math.max(8, Math.round(bounds.height * 0.35)))
  const minRunWidth = Math.max(16, Math.round(bounds.width * 0.35))

  for (let y = top; y <= bottom; y += 1) {
    const runs = readMaskRuns(mask, region.width, y)
      .filter((run) => run.right >= bounds.x && run.left <= bounds.x + bounds.width - 1)

    if (runs.length === 0) {
      continue
    }

    const left = Math.min(...runs.map((run) => run.left))
    const right = Math.max(...runs.map((run) => run.right))

    if (right - left + 1 < minRunWidth) {
      continue
    }

    fillLongShallowHighlightRun(mask, page, region, background, y, left, right)
  }
}

export function fillLongShallowConnectedEndCapSupport(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  bounds: Region,
  enableScaledVeryLongTopLift = false,
): void {
  if (!isLongShallowEndCapCandidate(region, bounds)) {
    return
  }

  const maxLift = readLongShallowWeakFaceMaxLift(region, bounds, 32, 0.9, 12, enableScaledVeryLongTopLift)
  const top = Math.max(0, bounds.y - maxLift)
  const bottom = Math.min(region.height - 1, bounds.y + Math.max(4, Math.round(bounds.height * 0.35)))
  const left = Math.max(0, bounds.x + Math.round(bounds.width * 0.55))
  const right = Math.min(region.width - 1, bounds.x + bounds.width - 1 + Math.max(14, Math.round(bounds.width * 0.5)))

  for (let pass = 0; pass < LONG_SHALLOW_END_CAP_PASSES; pass += 1) {
    if (growLongShallowEndCapPass(mask, page, region, background, { bottom, left, right, top }) === 0) {
      return
    }
  }
}

export function fillLongShallowEndCapSupportHoles(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  bounds: Region,
  enableScaledVeryLongTopLift = false,
): void {
  if (!isLongShallowEndCapCandidate(region, bounds) || !isVeryLongShallowTopRecoveryCandidate(region, bounds)) {
    return
  }

  const search = {
    bottom: Math.min(region.height - 1, bounds.y + Math.max(4, Math.round(bounds.height * 0.35))),
    left: Math.max(0, bounds.x + Math.round(bounds.width * 0.55)),
    right: Math.min(region.width - 1, bounds.x + bounds.width - 1 + Math.max(14, Math.round(bounds.width * 0.5))),
    top: Math.max(0, bounds.y - readLongShallowWeakFaceMaxLift(region, bounds, 32, 0.9, 12, enableScaledVeryLongTopLift)),
  }
  const sourceMask = mask.slice()

  visitLocalRect(search, (x, y) => {
    if (!shouldFillLongShallowEndCapHole(sourceMask, page, region, x, y)) {
      return
    }

    writeSupportPixel(mask, region.width, x, y, SUPPORT_TOP_FACE)
  })
}

function readLongShallowWeakFaceMaxLift(
  region: Region,
  bounds: Region,
  defaultMax: number,
  defaultRatio: number,
  defaultMin: number,
  enableScaledVeryLongTopLift: boolean,
): number {
  if (enableScaledVeryLongTopLift && isVeryLongShallowTopRecoveryCandidate(region, bounds)) {
    return Math.min(
      readVeryLongShallowLiftCap(region),
      Math.max(28, Math.round(bounds.height * 1.45)),
    )
  }

  return Math.min(defaultMax, Math.max(defaultMin, Math.round(bounds.height * defaultRatio)))
}

function readVeryLongShallowLiftCap(region: Region): number {
  return Math.max(60, Math.round(region.height * 0.8))
}

function fillRightwardContinuationRun(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  y: number,
  left: number,
  right: number,
): void {
  const pixels: number[] = []
  let gap = 0

  for (let x = left; x <= right; x += 1) {
    if (isLongShallowContinuationPixel(page, region, background, x, y)) {
      pixels.push(x)
      gap = 0
      continue
    }

    if (pixels.length > 0) {
      gap += 1
    }

    if (gap > LONG_SHALLOW_CONTINUATION_GAP_MAX) {
      break
    }
  }

  if (pixels.length < LONG_SHALLOW_CONTINUATION_MIN_PIXELS) {
    return
  }

  for (const x of pixels) {
    writeSupportPixel(mask, region.width, x, y, SUPPORT_TOP_FACE)
  }
}

function fillLongShallowHighlightRun(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  y: number,
  left: number,
  right: number,
): void {
  for (let x = left; x <= right; x += 1) {
    if (mask[y * region.width + x] > 0 || isLongShallowHighlightPixel(page, region, background, x, y)) {
      writeSupportPixel(mask, region.width, x, y, SUPPORT_TOP_FACE)
    }
  }
}

function growLongShallowEndCapPass(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  search: { bottom: number; left: number; right: number; top: number },
): number {
  const sourceMask = mask.slice()
  let added = 0

  visitLocalRect(search, (x, y) => {
    if (!shouldAddLongShallowEndCapPixel(sourceMask, page, region, background, x, y)) {
      return
    }

    writeSupportPixel(mask, region.width, x, y, SUPPORT_TOP_FACE)
    added += 1
  })

  return added
}

function shouldAddLongShallowEndCapPixel(
  sourceMask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  x: number,
  y: number,
): boolean {
  return sourceMask[y * region.width + x] === 0 &&
    hasNearbySupportPixel(sourceMask, region.width, region.height, x, y, LONG_SHALLOW_END_CAP_CONNECT_RADIUS) &&
    (
      isLongShallowFaceSupportPixel(page, region, background, x, y) ||
      isConnectedLongShallowEndCapPixel(page, region, background, x, y)
    )
}

function shouldFillLongShallowEndCapHole(
  sourceMask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  x: number,
  y: number,
): boolean {
  return sourceMask[y * region.width + x] === 0 &&
    readAlpha(page, region.x + x, region.y + y) >= 32 &&
    countNearbySupportPixels(sourceMask, region.width, region.height, x, y, 2) >= 5
}

function countNearbySupportPixels(
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): number {
  let count = 0
  const top = Math.max(0, y - radius)
  const bottom = Math.min(height - 1, y + radius)
  const left = Math.max(0, x - radius)
  const right = Math.min(width - 1, x + radius)

  for (let candidateY = top; candidateY <= bottom; candidateY += 1) {
    for (let candidateX = left; candidateX <= right; candidateX += 1) {
      if (candidateX === x && candidateY === y) {
        continue
      }

      if (mask[candidateY * width + candidateX] > 0) {
        count += 1
      }
    }
  }

  return count
}
