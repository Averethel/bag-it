import { describe, expect, it } from "vitest"
import { createGlyphFromPixels } from "../glyph-mask"
import { readQuantityOcr } from "../quantity-ocr"
import { createSyntheticPage } from "./synthetic-page"

describe("quantity eight OCR", () => {
  it("reads compact eight labels with a lower-right raster gap before the nine classifier", () => {
    const digit = createGlyphFromPattern(COMPACT_EIGHT_WITH_LOWER_RIGHT_GAP, 0, 0)
    const x = createGlyphFromPattern(COMPACT_X, 10, 2)
    const read = readQuantityOcr(createSyntheticPage(), [digit, x])

    expect(read?.text).toBe("8x")
  })

  it("reads compact eight labels with one lower-right edge row", () => {
    const digit = createGlyphFromPattern(COMPACT_EIGHT_WITH_SINGLE_LOWER_RIGHT_EDGE, 0, 0)
    const x = createGlyphFromPattern(COMPACT_X, 10, 2)
    const read = readQuantityOcr(createSyntheticPage(), [digit, x])

    expect(read?.text).toBe("8x")
  })
})

function createGlyphFromPattern(pattern: readonly string[], x: number, y: number) {
  const pixels = pattern.flatMap((row, rowIndex) =>
    [...row].flatMap((cell, columnIndex) =>
      cell === "1" || cell === "#"
        ? [{ x: x + columnIndex, y: y + rowIndex }]
        : [],
    ),
  )
  const glyph = createGlyphFromPixels(pixels)

  if (!glyph) {
    throw new Error("glyph pattern must contain pixels")
  }

  return glyph
}

const COMPACT_EIGHT_WITH_LOWER_RIGHT_GAP = [
  ".#####.",
  "##...##",
  "##...##",
  ".#####.",
  "##...##",
  "##....#",
  ".####..",
]

const COMPACT_EIGHT_WITH_SINGLE_LOWER_RIGHT_EDGE = [
  ".#####.",
  "##...##",
  "##...##",
  ".#####.",
  "##...##",
  "##.....",
  ".#####.",
]

const COMPACT_X = [
  "#...#",
  ".#.#.",
  "..#..",
  ".#.#.",
  "#...#",
]
