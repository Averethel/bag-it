import { describe, expect, it } from "vitest"
import { createFlatBackgroundModel } from "../background-model"
import { CALLOUT_PART_EXTRACTOR_VERSION } from "../contracts"
import { createPartImage } from "../part-image"
import {
  TEST_BLUE_PANEL,
  TEST_GRAY_PART,
  createSyntheticPage,
  paintRegion,
} from "./synthetic-page"

const STABLE_DIAGNOSTIC_KEYS = [
  "alphaBounds",
  "excludedLabelRegions",
  "finalCropBounds",
  "imageRegionBeforeAlphaTrim",
  "ownedRegion",
  "rawForegroundBounds",
  "rawForegroundPixelCount",
]

describe("part image diagnostics", () => {
  it("uses the alpha167 extractor version", () => {
    expect(CALLOUT_PART_EXTRACTOR_VERSION).toBe("2.0.0-alpha.167")
  })

  it("exposes stable geometry diagnostics without tuning internals", () => {
    const region = { height: 36, width: 42, x: 24, y: 20 }
    const ownedRegion = { height: 18, width: 22, x: 34, y: 28 }
    const excludedRegion = { height: 7, width: 9, x: 30, y: 45 }
    const partRegion = { height: 8, width: 12, x: 38, y: 32 }
    const foregroundPixels = pointsInRegion(partRegion)
    const page = createSyntheticPage((data) => {
      paintRegion(data, region, TEST_BLUE_PANEL)
      paintRegion(data, partRegion, TEST_GRAY_PART)
    })
    const image = createPartImage(
      page,
      region,
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      ownedRegion,
      [excludedRegion],
      foregroundPixels,
    )

    expect(Object.keys(image.diagnostics ?? {}).sort()).toEqual(STABLE_DIAGNOSTIC_KEYS)
    expect(image.diagnostics).toMatchObject({
      excludedLabelRegions: [excludedRegion],
      imageRegionBeforeAlphaTrim: region,
      ownedRegion,
      rawForegroundBounds: partRegion,
      rawForegroundPixelCount: partRegion.width * partRegion.height,
    })
    expect(image.diagnostics).not.toHaveProperty("supportPixelsAdded")
    expect(image.diagnostics).not.toHaveProperty("supportBounds")
    expect(image.diagnostics).not.toHaveProperty("topSupportEnabled")
    expect(image.diagnostics).not.toHaveProperty("alphaCoordinateScale")
    expect(image.diagnostics).not.toHaveProperty("alphaTrimPadding")
    expect(image.diagnostics).not.toHaveProperty("componentCandidates")
  })

  it("clips recovered top context below a close excluded upper label", () => {
    const imageRegion = { height: 78, width: 70, x: 45, y: 10 }
    const ownedRegion = { height: 78, width: 60, x: 54, y: 10 }
    const excludedUpperLabel = { height: 16, width: 18, x: 41, y: 28 }
    const upperPart = { height: 22, width: 42, x: 52, y: 20 }
    const lowerPart = { height: 24, width: 44, x: 62, y: 48 }
    const page = createSyntheticPage((data) => {
      paintRegion(data, imageRegion, TEST_BLUE_PANEL)
      paintRegion(data, upperPart, TEST_GRAY_PART)
      paintRegion(data, lowerPart, TEST_GRAY_PART)
    })
    const image = createPartImage(
      page,
      imageRegion,
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      ownedRegion,
      [excludedUpperLabel],
      pointsInRegion(lowerPart),
    )

    const expectedTop = excludedUpperLabel.y + excludedUpperLabel.height

    expect(image.diagnostics?.imageRegionBeforeAlphaTrim?.y).toBeGreaterThanOrEqual(expectedTop)
    expect(image.diagnostics?.ownedRegion?.y).toBeGreaterThanOrEqual(expectedTop)
    expect(image.region.y).toBeGreaterThanOrEqual(expectedTop)
    expect(readAlphaAt(image, { x: lowerPart.x + 12, y: lowerPart.y + 10 })).toBeGreaterThan(0)
    expect(readAlphaAt(image, { x: upperPart.x + 12, y: upperPart.y + 10 })).toBe(0)
  })
})

function pointsInRegion(region: { height: number; width: number; x: number; y: number }): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      points.push({ x, y })
    }
  }

  return points
}

function readAlphaAt(
  image: ReturnType<typeof createPartImage>,
  point: { x: number; y: number },
): number {
  const x = point.x - image.region.x
  const y = point.y - image.region.y

  if (x < 0 || y < 0 || x >= image.region.width || y >= image.region.height) {
    return 0
  }

  return image.alphaMask.data[y * image.region.width + x] ?? 0
}
