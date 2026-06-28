import { describe, expect, it } from "vitest"
import { scoreStepCalloutBorderEvidence } from "../evidence-border"
import {
  createSyntheticStepCalloutPage,
  paintBorder,
  paintRegion,
  TEST_BLACK,
  TEST_BLUE_PANEL,
} from "./helpers/synthetic-page-test-helper"

const BORDERED_PANEL = { height: 42, width: 72, x: 12, y: 10 }
const FILL_INTERIOR = { height: 38, width: 68, x: 14, y: 12 }
const TEST_GREEN_BORDER = { a: 255, b: 70, g: 190, r: 90 }
const TEST_GREEN_PANEL = { a: 255, b: 150, g: 255, r: 165 }

describe("stepCallout border evidence", () => {
  it("searches a tight outer edge for fill-panel candidates", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintRegion(data, BORDERED_PANEL, TEST_BLUE_PANEL)
      paintBorder(data, BORDERED_PANEL, TEST_BLACK)
    })

    expect(
      scoreStepCalloutBorderEvidence(page, {
        id: "fill-panel",
        pageNumber: 1,
        region: FILL_INTERIOR,
        source: "fill-panel",
      }),
    ).toMatchObject({
      reasons: expect.arrayContaining(["expanded-edge-search", "dark-edge-coverage"]),
      signal: "border",
      value: expect.any(Number),
    })
  })

  it("scores non-dark raster edge contrast against fill-panel background", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintRegion(data, BORDERED_PANEL, TEST_GREEN_PANEL)
      paintBorder(data, BORDERED_PANEL, TEST_GREEN_BORDER)
    })

    expect(
      scoreStepCalloutBorderEvidence(
        page,
        {
          id: "fill-panel",
          pageNumber: 1,
          region: FILL_INTERIOR,
          source: "fill-panel",
        },
        TEST_GREEN_PANEL,
      ),
    ).toMatchObject({
      reasons: expect.arrayContaining(["expanded-edge-search", "edge-contrast-coverage"]),
      signal: "border",
      value: expect.closeTo(0.35, 2),
    })
  })
})
