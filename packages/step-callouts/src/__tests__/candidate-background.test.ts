import { describe, expect, it } from "vitest"
import { readStepCalloutCandidateBackground } from "../candidate-background"
import {
  createSyntheticStepCalloutPage,
  paintRegion,
  TEST_BLACK,
  TEST_BLUE_PANEL,
} from "./helpers/synthetic-page-test-helper"

const CALLOUT_REGION = { height: 42, width: 72, x: 12, y: 10 }
const DARK_PART_REGION = { height: 16, width: 18, x: 18, y: 16 }
const LIGHT_PART_REGION = { height: 16, width: 18, x: 42, y: 24 }
const TEST_GRAY_PART = { a: 255, b: 160, g: 160, r: 160 }

describe("stepCallout candidate background", () => {
  it("reads the dominant panel fill without averaging foreground parts into it", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintRegion(data, CALLOUT_REGION, TEST_BLUE_PANEL)
      paintRegion(data, DARK_PART_REGION, TEST_BLACK)
      paintRegion(data, LIGHT_PART_REGION, TEST_GRAY_PART)
    })

    expect(readStepCalloutCandidateBackground(page, CALLOUT_REGION)).toEqual({
      b: TEST_BLUE_PANEL.b,
      g: TEST_BLUE_PANEL.g,
      r: TEST_BLUE_PANEL.r,
    })
  })
})
