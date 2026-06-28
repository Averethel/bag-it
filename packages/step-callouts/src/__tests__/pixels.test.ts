import { describe, expect, it } from "vitest"
import { estimateStepCalloutPageBackground } from "../pixels"
import {
  createSyntheticStepCalloutPage,
  paintRegion,
  TEST_BLACK,
} from "./helpers/synthetic-page-test-helper"

const PALE_GREEN_PAGE = { a: 255, b: 166, g: 254, r: 179 }

describe("stepCallout pixels", () => {
  it("estimates page background from dominant edge samples instead of fragile corners", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintRegion(data, { height: 82, width: 128, x: 0, y: 0 }, PALE_GREEN_PAGE)
      paintRegion(data, { height: 4, width: 4, x: 0, y: 0 }, TEST_BLACK)
      paintRegion(data, { height: 4, width: 4, x: 124, y: 78 }, TEST_BLACK)
    })

    expect(estimateStepCalloutPageBackground(page)).toEqual({
      b: PALE_GREEN_PAGE.b,
      g: PALE_GREEN_PAGE.g,
      r: PALE_GREEN_PAGE.r,
    })
  })
})
