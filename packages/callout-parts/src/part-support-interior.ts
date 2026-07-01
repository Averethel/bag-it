import type { Region } from "./contracts"
import { SUPPORT_INTERIOR, writeSupportPixel } from "./part-support-common"

export function fillHorizontalInterior(mask: Uint8Array, region: Region): void {
  for (let y = 0; y < region.height; y += 1) {
    let left = -1
    let right = -1

    for (let x = 0; x < region.width; x += 1) {
      if (mask[y * region.width + x] === 0) {
        continue
      }

      if (left < 0) {
        left = x
      }

      right = x
    }

    fillMaskRun(mask, region.width, y, left, right)
  }
}

export function fillVerticalInterior(mask: Uint8Array, region: Region): void {
  for (let x = 0; x < region.width; x += 1) {
    let top = -1
    let bottom = -1

    for (let y = 0; y < region.height; y += 1) {
      if (mask[y * region.width + x] === 0) {
        continue
      }

      if (top < 0) {
        top = y
      }

      bottom = y
    }

    fillMaskColumn(mask, region.width, x, top, bottom)
  }
}

function fillMaskRun(
  mask: Uint8Array,
  width: number,
  y: number,
  left: number,
  right: number,
): void {
  if (left < 0 || right - left < 2) {
    return
  }

  for (let x = left; x <= right; x += 1) {
    writeSupportPixel(mask, width, x, y, SUPPORT_INTERIOR)
  }
}

function fillMaskColumn(mask: Uint8Array, width: number, x: number, top: number, bottom: number): void {
  if (top < 0 || bottom - top < 2) {
    return
  }

  for (let y = top; y <= bottom; y += 1) {
    writeSupportPixel(mask, width, x, y, SUPPORT_INTERIOR)
  }
}
