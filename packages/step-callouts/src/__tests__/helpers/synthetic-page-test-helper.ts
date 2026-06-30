import type { StepCalloutRegion } from "../../contracts"
import { createStepCalloutPageInput } from "../../page-input"

export const TEST_PAGE_HEIGHT = 82
export const TEST_PAGE_NUMBER = 1
export const TEST_PAGE_WIDTH = 128

const RGBA_CHANNEL_COUNT = 4

export interface TestStepCalloutColor {
  a: number
  b: number
  g: number
  r: number
}

export const TEST_BLACK = { a: 255, b: 0, g: 0, r: 0 }
export const TEST_BLUE_PANEL = { a: 255, b: 250, g: 226, r: 198 }
export const TEST_WHITE = { a: 255, b: 255, g: 255, r: 255 }

export function createSyntheticStepCalloutPage(
  draw?: (data: Uint8ClampedArray) => void,
) {
  const data = createBlankPixels()
  draw?.(data)

  return createStepCalloutPageInput({
    data,
    height: TEST_PAGE_HEIGHT,
    pageNumber: TEST_PAGE_NUMBER,
    width: TEST_PAGE_WIDTH,
  })
}

export function paintBorder(
  data: Uint8ClampedArray,
  region: StepCalloutRegion,
  color: TestStepCalloutColor,
): void {
  paintRegion(data, { ...region, height: 2 }, color)
  paintRegion(data, { ...region, y: region.y + region.height - 2, height: 2 }, color)
  paintRegion(data, { ...region, width: 2 }, color)
  paintRegion(data, { ...region, x: region.x + region.width - 2, width: 2 }, color)
}

export function paintRegion(
  data: Uint8ClampedArray,
  region: StepCalloutRegion,
  color: TestStepCalloutColor,
): void {
  for (let pixelIndex = 0; pixelIndex < TEST_PAGE_WIDTH * TEST_PAGE_HEIGHT; pixelIndex += 1) {
    paintPixelIfInsideRegion(data, pixelIndex, region, color)
  }
}

export function paintRasterQuantityLabel(
  data: Uint8ClampedArray,
  text: string,
  x: number,
  y: number,
  color: TestStepCalloutColor = TEST_BLACK,
): StepCalloutRegion {
  let cursorX = x
  let bottom = y

  for (const character of text.toLowerCase()) {
    const glyph = TEST_RASTER_GLYPHS[character]

    if (!glyph) {
      continue
    }

    paintRasterGlyph(data, glyph, cursorX, y, color)
    cursorX += glyph[0].length + 1
    bottom = Math.max(bottom, y + glyph.length)
  }

  return {
    height: bottom - y,
    width: Math.max(1, cursorX - x - 1),
    x,
    y,
  }
}

export function paintConnectedScaledRasterQuantityLabel(
  data: Uint8ClampedArray,
  text: string,
  x: number,
  y: number,
  scaleX: number,
  scaleY = scaleX,
  color: TestStepCalloutColor = TEST_BLACK,
): StepCalloutRegion {
  let cursorX = x
  let bottom = y

  for (const character of text.toLowerCase()) {
    const glyph = TEST_RASTER_GLYPHS[character]

    if (!glyph) {
      continue
    }

    paintScaledRasterGlyph(data, glyph, cursorX, y, scaleX, scaleY, color)
    cursorX += glyph[0].length * scaleX
    bottom = Math.max(bottom, y + glyph.length * scaleY)
  }

  return {
    height: bottom - y,
    width: Math.max(1, cursorX - x),
    x,
    y,
  }
}

export function paintSeparatedScaledRasterQuantityLabel(
  data: Uint8ClampedArray,
  text: string,
  x: number,
  y: number,
  scaleX: number,
  scaleY = scaleX,
  color: TestStepCalloutColor = TEST_BLACK,
): StepCalloutRegion {
  let cursorX = x
  let bottom = y
  const gap = Math.max(2, scaleX * 2)

  for (const character of text.toLowerCase()) {
    const glyph = TEST_RASTER_GLYPHS[character]

    if (!glyph) {
      continue
    }

    paintScaledRasterGlyph(data, glyph, cursorX, y, scaleX, scaleY, color)
    cursorX += glyph[0].length * scaleX + gap
    bottom = Math.max(bottom, y + glyph.length * scaleY)
  }

  return {
    height: bottom - y,
    width: Math.max(1, cursorX - x - gap),
    x,
    y,
  }
}

function createBlankPixels(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(TEST_PAGE_WIDTH * TEST_PAGE_HEIGHT * RGBA_CHANNEL_COUNT)
  paintRegion(data, { height: TEST_PAGE_HEIGHT, width: TEST_PAGE_WIDTH, x: 0, y: 0 }, TEST_WHITE)
  return data
}

function paintPixelIfInsideRegion(
  data: Uint8ClampedArray,
  pixelIndex: number,
  region: StepCalloutRegion,
  color: TestStepCalloutColor,
): void {
  const x = pixelIndex % TEST_PAGE_WIDTH
  const y = Math.floor(pixelIndex / TEST_PAGE_WIDTH)

  if (!containsPixel(region, x, y)) {
    return
  }

  writePixel(data, pixelIndex, color)
}

function containsPixel(region: StepCalloutRegion, x: number, y: number): boolean {
  return x >= region.x && y >= region.y && x < region.x + region.width && y < region.y + region.height
}

function writePixel(data: Uint8ClampedArray, pixelIndex: number, color: TestStepCalloutColor): void {
  const offset = pixelIndex * RGBA_CHANNEL_COUNT

  data[offset] = color.r
  data[offset + 1] = color.g
  data[offset + 2] = color.b
  data[offset + 3] = color.a
}

export function paintRasterGlyph(
  data: Uint8ClampedArray,
  glyph: readonly string[],
  x: number,
  y: number,
  color: TestStepCalloutColor = TEST_BLACK,
): void {
  for (let row = 0; row < glyph.length; row += 1) {
    for (let column = 0; column < glyph[row].length; column += 1) {
      if (glyph[row][column] !== "1") {
        continue
      }

      writePixel(data, (y + row) * TEST_PAGE_WIDTH + x + column, color)
    }
  }
}

function paintScaledRasterGlyph(
  data: Uint8ClampedArray,
  glyph: readonly string[],
  x: number,
  y: number,
  scaleX: number,
  scaleY: number,
  color: TestStepCalloutColor,
): void {
  for (let row = 0; row < glyph.length; row += 1) {
    for (let column = 0; column < glyph[row].length; column += 1) {
      if (glyph[row][column] !== "1") {
        continue
      }

      paintRegion(data, {
        height: scaleY,
        width: scaleX,
        x: x + column * scaleX,
        y: y + row * scaleY,
      }, color)
    }
  }
}

const TEST_RASTER_GLYPHS: Record<string, readonly string[]> = {
  "0": [
    "11111",
    "10001",
    "10001",
    "10001",
    "10001",
    "10001",
    "11111",
  ],
  "1": [
    "00100",
    "01100",
    "00100",
    "00100",
    "00100",
    "00100",
    "01110",
  ],
  "2": [
    "11110",
    "00001",
    "00001",
    "11110",
    "10000",
    "10000",
    "11111",
  ],
  "3": [
    "11110",
    "00001",
    "00001",
    "01110",
    "00001",
    "00001",
    "11110",
  ],
  "4": [
    "10010",
    "10010",
    "10010",
    "11111",
    "00010",
    "00010",
    "00010",
  ],
  "5": [
    "11111",
    "10000",
    "10000",
    "11110",
    "00001",
    "00001",
    "11110",
  ],
  "6": [
    "01111",
    "10000",
    "10000",
    "11110",
    "10001",
    "10001",
    "01110",
  ],
  "7": [
    "11111",
    "00001",
    "00010",
    "00100",
    "01000",
    "01000",
    "01000",
  ],
  "8": [
    "01110",
    "10001",
    "10001",
    "01110",
    "10001",
    "10001",
    "01110",
  ],
  "9": [
    "01110",
    "10001",
    "10001",
    "01111",
    "00001",
    "00001",
    "11110",
  ],
  "x": [
    "10001",
    "01010",
    "00100",
    "01010",
    "10001",
  ],
}
