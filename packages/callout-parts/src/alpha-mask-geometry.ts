import type {
  CalloutPartAlphaMask,
  Region,
} from "./contracts"

export interface AlphaMaskPadding {
  bottom: number
  left: number
  right: number
  top: number
}

export function readAlphaBounds(mask: CalloutPartAlphaMask): Region | null {
  let left = mask.width
  let right = -1
  let top = mask.height
  let bottom = -1

  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.data[y * mask.width + x] === 0) {
        continue
      }

      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }

  return right < left || bottom < top
    ? null
    : { height: bottom - top + 1, width: right - left + 1, x: left, y: top }
}

export function padMaskRegion(
  region: Region,
  mask: CalloutPartAlphaMask,
  padding: AlphaMaskPadding,
): Region {
  const left = Math.max(0, region.x - padding.left)
  const top = Math.max(0, region.y - padding.top)
  const right = Math.min(mask.width, region.x + region.width + padding.right)
  const bottom = Math.min(mask.height, region.y + region.height + padding.bottom)

  return {
    height: Math.max(0, bottom - top),
    width: Math.max(0, right - left),
    x: left,
    y: top,
  }
}

export function cropAlphaMask(mask: CalloutPartAlphaMask, region: Region): CalloutPartAlphaMask {
  const data = new Uint8ClampedArray(region.width * region.height)

  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      data[y * region.width + x] = mask.data[(region.y + y) * mask.width + region.x + x]
    }
  }

  return {
    data,
    height: region.height,
    width: region.width,
  }
}

export function cropAlphaMaskRight(
  alphaMask: CalloutPartAlphaMask,
  width: number,
): CalloutPartAlphaMask {
  if (width >= alphaMask.width) {
    return alphaMask
  }

  const data = new Uint8ClampedArray(width * alphaMask.height)

  for (let y = 0; y < alphaMask.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = alphaMask.data[y * alphaMask.width + x] ?? 0
    }
  }

  return {
    data,
    height: alphaMask.height,
    width,
  }
}

export function clearAlphaMaskRightOf(
  alphaMask: CalloutPartAlphaMask,
  rightExclusive: number,
): CalloutPartAlphaMask {
  const cutoff = Math.max(0, Math.min(alphaMask.width, rightExclusive))

  if (cutoff >= alphaMask.width) {
    return alphaMask
  }

  const data = new Uint8ClampedArray(alphaMask.data)

  for (let y = 0; y < alphaMask.height; y += 1) {
    for (let x = cutoff; x < alphaMask.width; x += 1) {
      data[y * alphaMask.width + x] = 0
    }
  }

  return {
    ...alphaMask,
    data,
  }
}

export function clearAlphaRowsBefore(
  alphaMask: CalloutPartAlphaMask,
  topLimit: number,
): { data: Uint8ClampedArray; removedPixels: number } {
  const data = alphaMask.data.slice()
  let removedPixels = 0

  for (let y = 0; y < Math.min(topLimit, alphaMask.height); y += 1) {
    removedPixels += clearAlphaRow(data, alphaMask.width, y)
  }

  return { data, removedPixels }
}

export function countOpaqueAlphaInRow(
  alphaMask: CalloutPartAlphaMask,
  alphaBounds: Region,
  y: number,
): number {
  let count = 0

  for (let x = alphaBounds.x; x < alphaBounds.x + alphaBounds.width; x += 1) {
    if (alphaMask.data[y * alphaMask.width + x] >= 16) {
      count += 1
    }
  }

  return count
}

function clearAlphaRow(data: Uint8ClampedArray, width: number, y: number): number {
  let removedPixels = 0

  for (let x = 0; x < width; x += 1) {
    const index = y * width + x

    if (data[index] === 0) {
      continue
    }

    data[index] = 0
    removedPixels += 1
  }

  return removedPixels
}
