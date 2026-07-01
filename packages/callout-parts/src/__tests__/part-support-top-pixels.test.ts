import { describe, expect, it } from "vitest"
import { createFlatBackgroundModel } from "../background-model"
import {
  isConnectedLongShallowEndCapPixel,
  isLongShallowHighlightPixel,
  isTopGapBridgePixel,
} from "../part-support-top-pixels"
import {
  TEST_BLUE_PANEL,
  createSyntheticPage,
  paintRegion,
} from "./synthetic-page"

const BACKGROUND = createFlatBackgroundModel(TEST_BLUE_PANEL)
const REGION = { height: 24, width: 40, x: 20, y: 20 }
const BACKGROUND_LIKE_BUT_DARK = { b: 247, g: 221, r: 192 }
const END_CAP_DARK_SUPPORT = { b: 238, g: 212, r: 180 }

describe("top support pixel policy", () => {
  it("rejects exact background in top-gap bridge support", () => {
    const page = createSyntheticPage((data) => {
      paintRegion(data, REGION, TEST_BLUE_PANEL)
    })

    expect(isTopGapBridgePixel(page, REGION.x + 12, REGION.y + 4, BACKGROUND)).toBe(false)
  })

  it("keeps dark near-background top-gap pixels explicit", () => {
    const page = createSyntheticPage((data) => {
      paintRegion(data, REGION, TEST_BLUE_PANEL)
      paintRegion(data, { height: 1, width: 1, x: REGION.x + 12, y: REGION.y + 4 }, BACKGROUND_LIKE_BUT_DARK)
    })

    expect(isTopGapBridgePixel(page, REGION.x + 12, REGION.y + 4, BACKGROUND)).toBe(true)
  })

  it("requires dark-luma support for background-like long-shallow highlights", () => {
    const exactBackgroundPage = createSyntheticPage((data) => {
      paintRegion(data, REGION, TEST_BLUE_PANEL)
    })
    const darkSupportPage = createSyntheticPage((data) => {
      paintRegion(data, REGION, TEST_BLUE_PANEL)
      paintRegion(data, { height: 1, width: 1, x: REGION.x + 12, y: REGION.y + 4 }, BACKGROUND_LIKE_BUT_DARK)
    })

    expect(isLongShallowHighlightPixel(exactBackgroundPage, REGION, BACKGROUND, 12, 4)).toBe(false)
    expect(isLongShallowHighlightPixel(darkSupportPage, REGION, BACKGROUND, 12, 4)).toBe(true)
  })

  it("requires distance and dark luma for connected end-cap support", () => {
    const exactBackgroundPage = createSyntheticPage((data) => {
      paintRegion(data, REGION, TEST_BLUE_PANEL)
    })
    const darkSupportPage = createSyntheticPage((data) => {
      paintRegion(data, REGION, TEST_BLUE_PANEL)
      paintRegion(data, { height: 1, width: 1, x: REGION.x + 12, y: REGION.y + 4 }, END_CAP_DARK_SUPPORT)
    })

    expect(isConnectedLongShallowEndCapPixel(exactBackgroundPage, REGION, BACKGROUND, 12, 4)).toBe(false)
    expect(isConnectedLongShallowEndCapPixel(darkSupportPage, REGION, BACKGROUND, 12, 4)).toBe(true)
  })
})
