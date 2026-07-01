import { describe, expect, it } from "vitest"
import { createGlyphFromPixels } from "../glyph-mask"
import { readQuantityOcr } from "../quantity-ocr"
import { createSyntheticPage } from "./synthetic-page"

describe("quantity seven OCR", () => {
  it("keeps dense top-bar seven labels out of the four classifier", () => {
    const digit = createGlyphFromPattern(TOP_BAR_SEVEN_WITH_MIDDLE_STROKE, 0, 0)
    const x = createGlyphFromPattern(DENSE_X, 13, 4)
    const read = readQuantityOcr(createSyntheticPage(), [digit, x])

    expect(read?.text).toBe("7x")
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

const TOP_BAR_SEVEN_WITH_MIDDLE_STROKE = [
  "##########",
  "##########",
  "......###.",
  ".....###..",
  ".....###..",
  "....###...",
  "...####...",
  "..#####...",
  "..###.....",
  ".###......",
  ".###......",
  "###.......",
]

const DENSE_X = [
  ".#...#.",
  ".##.##.",
  "..###..",
  "..###..",
  "..###..",
  ".##.##.",
  "##...##",
]
