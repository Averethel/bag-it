import type { CalloutPartPageInput, Region } from "./contracts"
import { matchBackgroundColor, type BackgroundModel } from "./background-model"
import type { GlyphComponent } from "@bag-it/raster-quantity-labels"
import { isSuppressedLabelPixel, type LabelSuppressionMask } from "./label-suppression"
import { readAlpha, readPixel } from "./pixels"
import { regionContainsPoint, unionRegions } from "./regions"

export function findForegroundComponents(
  page: CalloutPartPageInput,
  searchRegion: Region,
  background: BackgroundModel,
  labelSuppressionMasks: readonly LabelSuppressionMask[],
): GlyphComponent[] {
  const visited = new Uint8Array(page.width * page.height)
  const components: GlyphComponent[] = []

  for (let y = searchRegion.y; y < searchRegion.y + searchRegion.height; y += 1) {
    for (let x = searchRegion.x; x < searchRegion.x + searchRegion.width; x += 1) {
      const index = y * page.width + x

      if (!visited[index] && isForegroundPixel(page, x, y, background, labelSuppressionMasks)) {
        components.push(floodFillForeground(page, visited, searchRegion, background, labelSuppressionMasks, x, y))
      }
    }
  }

  return components
}

function floodFillForeground(
  page: CalloutPartPageInput,
  visited: Uint8Array,
  searchRegion: Region,
  background: BackgroundModel,
  labelSuppressionMasks: readonly LabelSuppressionMask[],
  startX: number,
  startY: number,
): GlyphComponent {
  const stack = [{ x: startX, y: startY }]
  const pixels: Array<{ x: number; y: number }> = []

  visited[startY * page.width + startX] = 1

  while (stack.length > 0) {
    const point = stack.pop()!

    pixels.push(point)
    pushNeighbor(page, visited, stack, searchRegion, background, labelSuppressionMasks, point.x + 1, point.y)
    pushNeighbor(page, visited, stack, searchRegion, background, labelSuppressionMasks, point.x - 1, point.y)
    pushNeighbor(page, visited, stack, searchRegion, background, labelSuppressionMasks, point.x, point.y + 1)
    pushNeighbor(page, visited, stack, searchRegion, background, labelSuppressionMasks, point.x, point.y - 1)
    pushNeighbor(page, visited, stack, searchRegion, background, labelSuppressionMasks, point.x + 1, point.y + 1)
    pushNeighbor(page, visited, stack, searchRegion, background, labelSuppressionMasks, point.x + 1, point.y - 1)
    pushNeighbor(page, visited, stack, searchRegion, background, labelSuppressionMasks, point.x - 1, point.y + 1)
    pushNeighbor(page, visited, stack, searchRegion, background, labelSuppressionMasks, point.x - 1, point.y - 1)
  }

  const region = unionRegions(pixels.map((pixel) => ({ height: 1, width: 1, x: pixel.x, y: pixel.y })))

  return {
    area: pixels.length,
    pixels,
    region,
  }
}

function pushNeighbor(
  page: CalloutPartPageInput,
  visited: Uint8Array,
  stack: Array<{ x: number; y: number }>,
  searchRegion: Region,
  background: BackgroundModel,
  labelSuppressionMasks: readonly LabelSuppressionMask[],
  x: number,
  y: number,
): void {
  if (
    x < 0 ||
    y < 0 ||
    x >= page.width ||
    y >= page.height ||
    !regionContainsPoint(searchRegion, x, y)
  ) {
    return
  }

  const index = y * page.width + x

  if (!visited[index] && isForegroundPixel(page, x, y, background, labelSuppressionMasks)) {
    visited[index] = 1
    stack.push({ x, y })
  }
}

function isForegroundPixel(
  page: CalloutPartPageInput,
  x: number,
  y: number,
  background: BackgroundModel,
  labelSuppressionMasks: readonly LabelSuppressionMask[],
): boolean {
  if (readAlpha(page, x, y) < 32 || isSuppressedLabelPixel(labelSuppressionMasks, x, y)) {
    return false
  }

  return !matchBackgroundColor(background, readPixel(page, x, y)).isBackgroundLike
}
