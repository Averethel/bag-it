import type { CalloutPartPageInput, Region } from "./contracts"

export function insetRegion(region: Region, inset: number): Region {
  return {
    height: Math.max(0, region.height - inset * 2),
    width: Math.max(0, region.width - inset * 2),
    x: region.x + inset,
    y: region.y + inset,
  }
}

export function clampRegionToPage(
  region: Region,
  page: Pick<CalloutPartPageInput, "height" | "width">,
): Region | null {
  const x = Math.max(0, Math.min(page.width, Math.floor(region.x)))
  const y = Math.max(0, Math.min(page.height, Math.floor(region.y)))
  const right = Math.max(x, Math.min(page.width, Math.ceil(region.x + region.width)))
  const bottom = Math.max(y, Math.min(page.height, Math.ceil(region.y + region.height)))
  const width = right - x
  const height = bottom - y

  return width > 0 && height > 0 ? { height, width, x, y } : null
}

export function intersectRegions(left: Region, right: Region): Region | null {
  const x = Math.max(left.x, right.x)
  const y = Math.max(left.y, right.y)
  const rightX = Math.min(left.x + left.width, right.x + right.width)
  const bottomY = Math.min(left.y + left.height, right.y + right.height)

  return rightX > x && bottomY > y
    ? { height: bottomY - y, width: rightX - x, x, y }
    : null
}

export function unionRegions(regions: readonly Region[]): Region {
  let x = Number.POSITIVE_INFINITY
  let y = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY

  for (const region of regions) {
    x = Math.min(x, region.x)
    y = Math.min(y, region.y)
    right = Math.max(right, region.x + region.width)
    bottom = Math.max(bottom, region.y + region.height)
  }

  return {
    height: bottom - y,
    width: right - x,
    x,
    y,
  }
}

export function regionArea(region: Region): number {
  return region.width * region.height
}

export function regionCenter(region: Region): { x: number; y: number } {
  return {
    x: region.x + region.width / 2,
    y: region.y + region.height / 2,
  }
}

export function regionContainsRegion(container: Region, contained: Region): boolean {
  return contained.x >= container.x &&
    contained.y >= container.y &&
    contained.x + contained.width <= container.x + container.width &&
    contained.y + contained.height <= container.y + container.height
}

export function regionContainsPoint(region: Region, x: number, y: number): boolean {
  return x >= region.x &&
    y >= region.y &&
    x < region.x + region.width &&
    y < region.y + region.height
}

export function regionsOverlap(left: Region, right: Region): boolean {
  return Boolean(intersectRegions(left, right))
}

export function overlapRatio(left: Region, right: Region): number {
  const intersection = intersectRegions(left, right)

  if (!intersection) {
    return 0
  }

  return regionArea(intersection) / Math.max(1, Math.min(regionArea(left), regionArea(right)))
}

export function horizontalOverlapRatio(left: Region, right: Region): number {
  const overlap = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  )

  return overlap / Math.max(1, Math.min(left.width, right.width))
}

export function compareRegions(left: Region, right: Region): number {
  return left.y - right.y || left.x - right.x || left.height - right.height || left.width - right.width
}
