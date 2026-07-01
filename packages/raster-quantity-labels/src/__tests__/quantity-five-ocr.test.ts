import { describe, expect, it } from "vitest"
import { createGlyphFromPixels } from "../glyph-mask"
import { readQuantityOcr } from "../quantity-ocr"
import { createSyntheticPage } from "./synthetic-page"

describe("quantity five OCR", () => {
  it("reads high-scale printed five labels before the six classifier", () => {
    const digit = createGlyphFromPattern(HIGH_SCALE_PRINTED_FIVE, 0, 0)
    const x = createGlyphFromPattern(HIGH_SCALE_X, 23, 7)
    const read = readQuantityOcr(createSyntheticPage(), [digit, x])

    expect(read?.text).toBe("5x")
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

const HIGH_SCALE_PRINTED_FIVE = [
  ".....###############.",
  "...#################.",
  "...#################.",
  "...#################.",
  "...################..",
  "...################..",
  "...#####.............",
  "..#####..............",
  "..#####..............",
  "..#####..............",
  "..###############....",
  "..#################..",
  "..#################..",
  "..#################..",
  "..######......######.",
  "..######......######.",
  "..###...........####.",
  "................#####",
  "................#####",
  "................#####",
  "..#.............#####",
  "..#.............#####",
  "#####...........#####",
  "#######.........####.",
  "#######.........####.",
  "########......######.",
  "..#################..",
  "..#################..",
  "...##############....",
  "...##############....",
  ".....###########.....",
  "........##...........",
]

const HIGH_SCALE_X = [
  "..#####........####..",
  "..#####........####..",
  "..#####........#####.",
  "..######......######.",
  "..######......######.",
  "...######...#######..",
  ".....####..######....",
  ".....####..######....",
  ".....############....",
  ".......########......",
  ".......########......",
  "........######.......",
  "........######.......",
  "........######.......",
  ".......########......",
  ".....############....",
  ".....############....",
  "...######...#######..",
  "...######...#######..",
  "...######...#######..",
  "..######......######.",
  "#######........######",
  "#######........######",
  "#######........######",
]
