import { describe, expect, it } from "vitest"
import { assembleQuantityCandidates } from "../quantity-candidate-assembly"
import {
  TEST_BLUE_PANEL,
  TEST_GRAY_PART,
  createSyntheticPage,
  paintBorder,
  paintRasterGlyph,
  paintRasterQuantityLabel,
  paintRegion,
  scaleGlyph,
} from "./synthetic-page"

const CALLOUT_REGION = { height: 62, width: 122, x: 12, y: 10 }

describe("quantity candidate assembly", () => {
  it("keeps adjacent labels separate and row-major", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 8, width: 10, x: 24, y: 26 }, TEST_GRAY_PART)
      paintRegion(data, { height: 8, width: 10, x: 44, y: 26 }, TEST_GRAY_PART)
      paintRegion(data, { height: 8, width: 10, x: 28, y: 48 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 25, 40)
      paintRasterQuantityLabel(data, "2x", 45, 40)
      paintRasterQuantityLabel(data, "3x", 29, 60)
    })

    const candidates = assembleQuantityCandidates(page, CALLOUT_REGION, TEST_BLUE_PANEL)

    expect(candidates.map((candidate) => candidate.text)).toEqual(["1x", "2x", "3x"])
  })

  it("recovers a leading digit on the same baseline before a readable Nx label", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 10, width: 14, x: 36, y: 28 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "3", 22, 46)
      paintRasterQuantityLabel(data, "5x", 40, 46)
    })

    const candidates = assembleQuantityCandidates(page, CALLOUT_REGION, TEST_BLUE_PANEL)

    expect(candidates.map((candidate) => candidate.text)).toEqual(["35x"])
  })

  it("assembles connected digit and x blobs", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 9, width: 12, x: 28, y: 28 }, TEST_GRAY_PART)
      paintRasterGlyph(data, scaleGlyph(CONNECTED_TWO_X, 2), 30, 44)
    })

    const candidates = assembleQuantityCandidates(page, CALLOUT_REGION, TEST_BLUE_PANEL)

    expect(candidates.map((candidate) => candidate.text)).toEqual(["2x"])
  })

  it("rejects short connected build-art diagonals as fused quantity labels", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRasterGlyph(data, SHORT_CONNECTED_DIAGONAL, 90, 52)
    })

    const candidates = assembleQuantityCandidates(page, CALLOUT_REGION, TEST_BLUE_PANEL)

    expect(candidates).toEqual([])
  })

  it("assembles compact Animals-style one and narrow x glyphs", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 27, width: 38, x: 36, y: 24 }, TEST_GRAY_PART)
      paintRasterGlyph(data, ANIMALS_TINY_ONE, 40, 54)
      paintRasterGlyph(data, ANIMALS_TINY_X, 47, 57)
    })

    const candidates = assembleQuantityCandidates(page, CALLOUT_REGION, TEST_BLUE_PANEL)

    expect(candidates.map((candidate) => candidate.text)).toEqual(["1x"])
  })
})

function paintCallout(data: Uint8ClampedArray): void {
  paintRegion(data, CALLOUT_REGION, TEST_BLUE_PANEL)
  paintBorder(data, CALLOUT_REGION, { b: 0, g: 0, r: 0 })
}

const CONNECTED_TWO_X = [
  "1111000101",
  "0000101010",
  "0000100100",
  "1111001010",
  "1000000101",
  "1000000000",
  "1111100000",
]

const SHORT_CONNECTED_DIAGONAL = [
  "000000000000001",
  "000000000000111",
  "000000000011111",
  "000000001111100",
  "000000111110000",
  "000011111000000",
  "001111100000000",
  "111111000000000",
]

const ANIMALS_TINY_ONE = [
  "0100",
  "1100",
  "0100",
  "0100",
  "0100",
  "0100",
  "0100",
  "0100",
  "0100",
  "0100",
  "1111",
]

const ANIMALS_TINY_X = [
  "100001",
  "110011",
  "011110",
  "001100",
  "001100",
  "011110",
  "110011",
  "100001",
]
