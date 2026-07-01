import { describe, expect, it } from "vitest"
import { findQuantityGlyphRows } from "../quantity-glyph-rows"
import {
  createSyntheticPage,
  paintRasterQuantityLabel,
  paintRegion,
  TEST_BLUE_PANEL,
} from "./synthetic-page"

const CALLOUT = { height: 80, width: 120, x: 10, y: 10 }

describe("quantity glyph rows", () => {
  it("finds tight lower-row quantity glyphs", () => {
    const page = createSyntheticPage((data) => {
      paintRegion(data, CALLOUT, TEST_BLUE_PANEL)
      paintRasterQuantityLabel(data, "2x", 24, 70)
    })

    expect(findQuantityGlyphRows(page, CALLOUT, TEST_BLUE_PANEL)).toHaveLength(1)
  })

  it("rejects loose lower-row text fragments", () => {
    const page = createSyntheticPage((data) => {
      paintRegion(data, CALLOUT, TEST_BLUE_PANEL)
      paintRasterQuantityLabel(data, "1", 24, 70)
      paintRasterQuantityLabel(data, "x", 36, 74)
    })

    expect(findQuantityGlyphRows(page, CALLOUT, TEST_BLUE_PANEL)).toHaveLength(0)
  })

  it("keeps multi-digit lower-row evidence when a compact x is separated", () => {
    const page = createSyntheticPage((data) => {
      paintRegion(data, CALLOUT, TEST_BLUE_PANEL)
      paintRasterQuantityLabel(data, "12", 24, 70)
      paintRasterQuantityLabel(data, "x", 70, 70)
    })

    expect(findQuantityGlyphRows(page, CALLOUT, TEST_BLUE_PANEL)).toHaveLength(1)
  })

  it("keeps a single compact bottom digit when the x glyph is lost", () => {
    const page = createSyntheticPage((data) => {
      paintRegion(data, CALLOUT, TEST_BLUE_PANEL)
      paintRasterQuantityLabel(data, "3", 24, 76)
    })

    expect(findQuantityGlyphRows(page, CALLOUT, TEST_BLUE_PANEL)).toHaveLength(1)
  })
})
