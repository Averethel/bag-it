import type { CalloutPartPageInput, Region, RgbColor } from "./contracts"
import { colorDistance, colorLuma, readAlpha, readPixel } from "./pixels"
import { regionContainsPoint } from "./regions"

const GLYPH_ALPHA_MIN = 32
const GLYPH_BACKGROUND_DISTANCE_MIN = 48
const GLYPH_LUMA_MAX = 170

export interface GlyphComponent {
  area: number
  pixels: Array<{ x: number; y: number }>
  region: Region
}

export function createGlyphMask(
  page: CalloutPartPageInput,
  searchRegion: Region,
  background: RgbColor,
): Uint8Array {
  const mask = new Uint8Array(page.width * page.height)

  for (let y = searchRegion.y; y < searchRegion.y + searchRegion.height; y += 1) {
    for (let x = searchRegion.x; x < searchRegion.x + searchRegion.width; x += 1) {
      if (isGlyphPixel(page, x, y, background)) {
        mask[y * page.width + x] = 1
      }
    }
  }

  return mask
}

export function findGlyphComponents(
  page: CalloutPartPageInput,
  mask: Uint8Array,
  searchRegion: Region,
): GlyphComponent[] {
  const visited = new Uint8Array(page.width * page.height)
  const components: GlyphComponent[] = []

  for (let y = searchRegion.y; y < searchRegion.y + searchRegion.height; y += 1) {
    for (let x = searchRegion.x; x < searchRegion.x + searchRegion.width; x += 1) {
      const index = y * page.width + x

      if (!visited[index] && mask[index]) {
        components.push(floodFillGlyph(page, mask, visited, searchRegion, x, y))
      }
    }
  }

  return components
}

export function createGlyphFromPixels(
  pixels: readonly { x: number; y: number }[],
): GlyphComponent | null {
  if (pixels.length === 0) {
    return null
  }

  let x = Number.POSITIVE_INFINITY
  let y = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY

  for (const pixel of pixels) {
    x = Math.min(x, pixel.x)
    y = Math.min(y, pixel.y)
    right = Math.max(right, pixel.x)
    bottom = Math.max(bottom, pixel.y)
  }

  return {
    area: pixels.length,
    pixels: [...pixels],
    region: {
      height: bottom - y + 1,
      width: right - x + 1,
      x,
      y,
    },
  }
}

export function isPlausibleGlyph(component: GlyphComponent): boolean {
  const { height, width } = component.region
  const density = component.area / Math.max(1, width * height)

  return (
    component.area >= 3 &&
    width >= 2 &&
    height >= 4 &&
    width <= 72 &&
    height <= 72 &&
    width / Math.max(1, height) <= 2.4 &&
    height / Math.max(1, width) <= 8 &&
    density >= 0.08 &&
    density <= 0.9
  )
}

export function isLikelyXGlyph(component: GlyphComponent): boolean {
  const { height, width } = component.region
  const aspect = width / Math.max(1, height)

  if (width < 3 || height < 4 || aspect < 0.45 || aspect > 1.65) {
    return false
  }

  const denseRows = countDenseHorizontalRows(component)
  const mainDiagonal = countDiagonalPixels(component, "main")
  const crossDiagonal = countDiagonalPixels(component, "cross")
  const diagonalRatio = (mainDiagonal + crossDiagonal) / Math.max(1, component.area)
  const minimumDiagonalRatio = Math.min(mainDiagonal, crossDiagonal) / Math.max(1, component.area)
  const cornerHits = countCornerHits(component)

  if (isLikelySmallPrintedXGlyph(component, denseRows, diagonalRatio, minimumDiagonalRatio, cornerHits)) {
    return true
  }

  return (
    diagonalRatio >= 0.3 &&
    minimumDiagonalRatio >= 0.06 &&
    cornerHits >= 3 &&
    isAllowedXDenseRowCount(component, denseRows, diagonalRatio, minimumDiagonalRatio, cornerHits)
  )
}

function isAllowedXDenseRowCount(
  component: GlyphComponent,
  denseRows: number,
  diagonalRatio: number,
  minimumDiagonalRatio: number,
  cornerHits: number,
): boolean {
  const { height, width } = component.region
  const standardLimit = width <= 3 ? 2 : 1

  if (denseRows <= standardLimit) {
    return true
  }

  const compactPrintedX = width <= 36 &&
    height <= 54 &&
    cornerHits === 4 &&
    diagonalRatio >= 0.9 &&
    minimumDiagonalRatio >= 0.45

  return compactPrintedX && denseRows <= Math.ceil(height * 0.72)
}

function isLikelySmallPrintedXGlyph(
  component: GlyphComponent,
  denseRows: number,
  diagonalRatio: number,
  minimumDiagonalRatio: number,
  cornerHits: number,
): boolean {
  const { height, width } = component.region
  const aspect = width / Math.max(1, height)

  return (
    width >= 4 &&
    width <= 7 &&
    height >= 6 &&
    height <= 12 &&
    aspect >= 0.45 &&
    aspect <= 1.05 &&
    cornerHits >= 3 &&
    diagonalRatio >= 0.62 &&
    minimumDiagonalRatio >= 0.22 &&
    denseRows <= Math.ceil(height * 0.86)
  )
}

function isGlyphPixel(
  page: CalloutPartPageInput,
  x: number,
  y: number,
  background: RgbColor,
): boolean {
  if (readAlpha(page, x, y) < GLYPH_ALPHA_MIN) {
    return false
  }

  const color = readPixel(page, x, y)

  return (
    colorLuma(color) <= GLYPH_LUMA_MAX &&
    colorDistance(color, background) >= GLYPH_BACKGROUND_DISTANCE_MIN
  )
}

function floodFillGlyph(
  page: CalloutPartPageInput,
  mask: Uint8Array,
  visited: Uint8Array,
  searchRegion: Region,
  startX: number,
  startY: number,
): GlyphComponent {
  const stack = [{ x: startX, y: startY }]
  const pixels: Array<{ x: number; y: number }> = []

  visited[startY * page.width + startX] = 1

  while (stack.length > 0) {
    const point = stack.pop()!

    pixels.push(point)
    pushNeighbor(page, mask, visited, stack, searchRegion, point.x + 1, point.y)
    pushNeighbor(page, mask, visited, stack, searchRegion, point.x - 1, point.y)
    pushNeighbor(page, mask, visited, stack, searchRegion, point.x, point.y + 1)
    pushNeighbor(page, mask, visited, stack, searchRegion, point.x, point.y - 1)
    pushNeighbor(page, mask, visited, stack, searchRegion, point.x + 1, point.y + 1)
    pushNeighbor(page, mask, visited, stack, searchRegion, point.x + 1, point.y - 1)
    pushNeighbor(page, mask, visited, stack, searchRegion, point.x - 1, point.y + 1)
    pushNeighbor(page, mask, visited, stack, searchRegion, point.x - 1, point.y - 1)
  }

  return createGlyphFromPixels(pixels)!
}

function pushNeighbor(
  page: CalloutPartPageInput,
  mask: Uint8Array,
  visited: Uint8Array,
  stack: Array<{ x: number; y: number }>,
  searchRegion: Region,
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

  if (!visited[index] && mask[index]) {
    visited[index] = 1
    stack.push({ x, y })
  }
}

function countDiagonalPixels(component: GlyphComponent, diagonal: "cross" | "main"): number {
  return component.pixels.filter((pixel) => {
    const localX = (pixel.x - component.region.x) / Math.max(1, component.region.width - 1)
    const localY = (pixel.y - component.region.y) / Math.max(1, component.region.height - 1)
    const expectedY = diagonal === "main" ? localX : 1 - localX

    return Math.abs(localY - expectedY) <= 0.28
  }).length
}

function countDenseHorizontalRows(component: GlyphComponent): number {
  const rows = Array.from({ length: component.region.height }, () => 0)

  for (const pixel of component.pixels) {
    rows[pixel.y - component.region.y] += 1
  }

  return rows.filter((row) => row / Math.max(1, component.region.width) >= 0.6).length
}

function countCornerHits(component: GlyphComponent): number {
  const corners = new Set<string>()

  for (const pixel of component.pixels) {
    const x = pixel.x - component.region.x
    const y = pixel.y - component.region.y
    const horizontal = readHorizontalCorner(x, component.region.width)
    const vertical = readVerticalCorner(y, component.region.height)

    if (horizontal && vertical) {
      corners.add(`${vertical}:${horizontal}`)
    }
  }

  return corners.size
}

function readHorizontalCorner(x: number, width: number): "left" | "right" | null {
  if (x <= Math.max(1, width * 0.28)) {
    return "left"
  }

  if (x >= width - Math.max(2, width * 0.28)) {
    return "right"
  }

  return null
}

function readVerticalCorner(y: number, height: number): "bottom" | "top" | null {
  if (y <= Math.max(1, height * 0.28)) {
    return "top"
  }

  if (y >= height - Math.max(2, height * 0.28)) {
    return "bottom"
  }

  return null
}
