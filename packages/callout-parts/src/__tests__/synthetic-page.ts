import type { CalloutPartPageInput, Region, RgbColor } from "../contracts"

export const TEST_PAGE_WIDTH = 160
export const TEST_PAGE_HEIGHT = 100
export const TEST_BLACK: RgbColor = { b: 0, g: 0, r: 0 }
export const TEST_BLUE_PANEL: RgbColor = { b: 250, g: 226, r: 198 }
export const TEST_GRAY_PART: RgbColor = { b: 104, g: 105, r: 104 }
export const TEST_LOW_CONTRAST_PART: RgbColor = { b: 246, g: 224, r: 202 }

export function createSyntheticPage(
  paint?: (data: Uint8ClampedArray) => void,
): CalloutPartPageInput {
  const data = new Uint8ClampedArray(TEST_PAGE_WIDTH * TEST_PAGE_HEIGHT * 4)

  paintRegion(data, { height: TEST_PAGE_HEIGHT, width: TEST_PAGE_WIDTH, x: 0, y: 0 }, { b: 255, g: 255, r: 255 })
  paint?.(data)

  return {
    data,
    height: TEST_PAGE_HEIGHT,
    pageNumber: 1,
    width: TEST_PAGE_WIDTH,
  }
}

export function paintRegion(
  data: Uint8ClampedArray,
  region: Region,
  color: RgbColor,
): void {
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      paintPixel(data, x, y, color)
    }
  }
}

export function paintBorder(
  data: Uint8ClampedArray,
  region: Region,
  color: RgbColor,
): void {
  paintRegion(data, { height: 2, width: region.width, x: region.x, y: region.y }, color)
  paintRegion(
    data,
    { height: 2, width: region.width, x: region.x, y: region.y + region.height - 2 },
    color,
  )
  paintRegion(data, { height: region.height, width: 2, x: region.x, y: region.y }, color)
  paintRegion(
    data,
    { height: region.height, width: 2, x: region.x + region.width - 2, y: region.y },
    color,
  )
}

export function paintRasterQuantityLabel(
  data: Uint8ClampedArray,
  text: string,
  x: number,
  y: number,
): Region {
  let cursor = x
  const regions: Region[] = []

  for (const character of text.toLowerCase()) {
    const glyph = GLYPHS[character]

    if (!glyph) {
      cursor += 4
      continue
    }

    regions.push(paintRasterGlyph(data, glyph, cursor, y))
    cursor += glyph[0].length + 1
  }

  const left = Math.min(...regions.map((region) => region.x))
  const top = Math.min(...regions.map((region) => region.y))
  const right = Math.max(...regions.map((region) => region.x + region.width))
  const bottom = Math.max(...regions.map((region) => region.y + region.height))

  return { height: bottom - top, width: right - left, x: left, y: top }
}

export function paintRasterGlyph(
  data: Uint8ClampedArray,
  glyph: readonly string[],
  x: number,
  y: number,
): Region {
  for (let row = 0; row < glyph.length; row += 1) {
    for (let column = 0; column < glyph[row].length; column += 1) {
      if (glyph[row][column] === "1") {
        paintPixel(data, x + column, y + row, TEST_BLACK)
      }
    }
  }

  return {
    height: glyph.length,
    width: glyph[0]?.length ?? 0,
    x,
    y,
  }
}

export function scaleGlyph(glyph: readonly string[], scale: number): string[] {
  return glyph.flatMap((row) => {
    const scaledRow = [...row].map((cell) => cell.repeat(scale)).join("")
    return Array.from({ length: scale }, () => scaledRow)
  })
}

function paintPixel(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  color: RgbColor,
): void {
  const index = (y * TEST_PAGE_WIDTH + x) * 4
  data[index] = color.r
  data[index + 1] = color.g
  data[index + 2] = color.b
  data[index + 3] = 255
}

const GLYPHS: Record<string, readonly string[]> = {
  "0": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["11110", "00001", "00001", "11110", "10000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["10010", "10010", "10010", "11111", "00010", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01111", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "11110"],
  "x": ["10001", "01010", "00100", "01010", "10001"],
}

