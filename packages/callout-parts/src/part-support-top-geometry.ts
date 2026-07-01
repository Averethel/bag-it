import type { Region } from "./contracts"

export const LONG_SHALLOW_END_CAP_CONNECT_RADIUS = 2

export function isWideShallowSupport(region: Region, bounds: Region): boolean {
  return bounds.width >= bounds.height * 1.35 &&
    bounds.width >= region.width * 0.45 &&
    bounds.height <= region.height * 0.55
}

export function isLongShallowWeakFaceCandidate(region: Region, bounds: Region): boolean {
  return isWideShallowSupport(region, bounds) &&
    hasRecoverableLongShallowTop(region, bounds) &&
    region.width - (bounds.x + bounds.width) >= Math.max(10, Math.round(bounds.width * 0.2))
}

export function isLongShallowEndCapCandidate(region: Region, bounds: Region): boolean {
  return region.width >= region.height * 1.25 &&
    isWideShallowSupport(region, bounds) &&
    bounds.y >= Math.max(10, Math.round(region.height * 0.18)) &&
    region.width - (bounds.x + bounds.width) >= Math.max(10, Math.round(bounds.width * 0.2))
}

export function isVeryLongShallowTopRecoveryCandidate(region: Region, bounds: Region): boolean {
  return region.width >= 80 &&
    bounds.width >= 56 &&
    bounds.width >= bounds.height * 1.6 &&
    bounds.y >= Math.max(8, Math.round(region.height * 0.12))
}

export function hasNearbySupportPixel(
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): boolean {
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
        return true
      }
    }
  }

  return false
}

export function visitLocalRect(
  search: { bottom: number; left: number; right: number; top: number },
  visit: (x: number, y: number) => void,
): void {
  for (let y = search.top; y <= search.bottom; y += 1) {
    for (let x = search.left; x <= search.right; x += 1) {
      visit(x, y)
    }
  }
}

function hasRecoverableLongShallowTop(region: Region, bounds: Region): boolean {
  return hasSevereMissingTop(region, bounds) || isVeryLongShallowTopRecoveryCandidate(region, bounds)
}

function hasSevereMissingTop(region: Region, bounds: Region): boolean {
  return bounds.y >= Math.max(20, Math.round(region.height * 0.35))
}
