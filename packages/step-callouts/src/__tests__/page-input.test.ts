import { describe, expect, it } from "vitest"
import {
  clampStepCalloutRegionToPage,
  createPageInputStageSnapshot,
  createStepCalloutPageInput,
} from "../page-input"

const PAGE_HEIGHT = 3
const PAGE_NUMBER = 1
const PAGE_WIDTH = 4
const PIXEL_CHANNELS = 4

describe("stepCallout detector page input", () => {
  it("copies pixels", () => {
    const pixels = createPixels()

    const pageInput = createStepCalloutPageInput({
      data: pixels,
      height: PAGE_HEIGHT,
      pageNumber: PAGE_NUMBER,
      width: PAGE_WIDTH,
    })

    pixels[0] = 255

    expect(pageInput.data[0]).toBe(0)
  })

  it("rejects page input with impossible dimensions or buffer length", () => {
    const validPixels = createPixels()

    expect(() =>
      createStepCalloutPageInput({
        data: validPixels,
        height: 0,
        pageNumber: PAGE_NUMBER,
        width: PAGE_WIDTH,
      }),
    ).toThrow("height must be a positive integer")

    expect(() =>
      createStepCalloutPageInput({
        data: new Uint8ClampedArray(1),
        height: PAGE_HEIGHT,
        pageNumber: PAGE_NUMBER,
        width: PAGE_WIDTH,
      }),
    ).toThrow("page input data length must match")
  })

  it("clamps regions and drops zero-area results", () => {
    expect(
      clampStepCalloutRegionToPage(
        { height: 1.8, width: 3.2, x: 2.4, y: -1 },
        { height: PAGE_HEIGHT, width: PAGE_WIDTH },
      ),
    ).toEqual({ height: 1, width: 2, x: 2, y: 0 })

    expect(
      clampStepCalloutRegionToPage(
        { height: 1, width: 1, x: -5, y: -5 },
        { height: PAGE_HEIGHT, width: PAGE_WIDTH },
      ),
    ).toBeNull()
  })

  it("creates page-input stage snapshot without detector failures", () => {
    const pageInput = createStepCalloutPageInput({
      data: createPixels(),
      height: PAGE_HEIGHT,
      pageNumber: PAGE_NUMBER,
      width: PAGE_WIDTH,
    })

    expect(createPageInputStageSnapshot([pageInput])).toMatchObject({
      counts: {
        accepted: 1,
        rejected: 0,
        total: 1,
      },
      stageId: "page-input",
    })
  })
})

function createPixels(): Uint8ClampedArray {
  return new Uint8ClampedArray(PAGE_WIDTH * PAGE_HEIGHT * PIXEL_CHANNELS)
}
