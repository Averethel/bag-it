import { describe, expect, it } from "vitest"
import { createFlatBackgroundModel } from "../background-model"
import { fillLongShallowWeakFaceSupport } from "../part-support-long-shallow"
import { createPartSupportMask } from "../part-support-mask"
import { SUPPORT_OWNED, SUPPORT_TOP_FACE } from "../part-support-common"
import {
  TEST_BLUE_PANEL,
  TEST_GRAY_PART,
  createSyntheticPage,
  paintRegion,
} from "./synthetic-page"

describe("long shallow part support", () => {
  it("recovers very long shallow weak top faces above the selected foreground", () => {
    const region = { height: 75, width: 119, x: 20, y: 10 }
    const foreground = { height: 24, width: 59, x: 17, y: 34 }
    const mask = createMask(region.width, region.height, foreground, SUPPORT_OWNED)
    const page = createSyntheticPage((data) => {
      paintRegion(data, region, TEST_BLUE_PANEL)
      paintRegion(data, localToPageRegion(region, foreground), TEST_GRAY_PART)
      paintRegion(data, { height: 2, width: 62, x: region.x + 17, y: region.y + 3 }, TEST_GRAY_PART)
    })

    fillLongShallowWeakFaceSupport(
      mask,
      page,
      region,
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      foreground,
      true,
    )

    expect(mask[3 * region.width + 20]).toBe(SUPPORT_TOP_FACE)
  })

  it("recovers the far top-right ridge on very long shallow plates", () => {
    const region = { height: 148, width: 239, x: 20, y: 10 }
    const foreground = { height: 47, width: 117, x: 34, y: 67 }
    const ridge = { height: 5, width: 26, x: region.x + 190, y: region.y + 14 }
    const page = createSyntheticPage((data) => {
      paintRegion(data, region, TEST_BLUE_PANEL)
      paintRegion(data, localToPageRegion(region, foreground), TEST_GRAY_PART)
      paintRegion(data, ridge, TEST_GRAY_PART)
    })
    const support = createPartSupportMask(
      page,
      region,
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      pointsInLocalRegion(foreground, region),
      {
        enableLongShallowTopRecovery: true,
        enableTopSupport: true,
        ownedRegion: localToPageRegion(region, { ...region, x: 0, y: 0 }),
      },
    )

    expect(support.data[14 * region.width + 206]).toBe(SUPPORT_TOP_FACE)
  })

  it("recovers rounded-down very long shallow top ridges", () => {
    const region = { height: 76, width: 118, x: 20, y: 10 }
    const foreground = { height: 23, width: 57, x: 18, y: 35 }
    const ridge = { height: 3, width: 10, x: region.x + 102, y: region.y + 8 }
    const page = createSyntheticPage((data) => {
      paintRegion(data, region, TEST_BLUE_PANEL)
      paintRegion(data, localToPageRegion(region, foreground), TEST_GRAY_PART)
      paintRegion(data, ridge, TEST_GRAY_PART)
    })
    const support = createPartSupportMask(
      page,
      region,
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      pointsInLocalRegion(foreground, region),
      {
        enableLongShallowTopRecovery: true,
        enableTopSupport: true,
        ownedRegion: localToPageRegion(region, { ...region, x: 0, y: 0 }),
      },
    )

    expect(support.data[8 * region.width + 103]).toBe(SUPPORT_TOP_FACE)
  })

  it("scales very-long top lift for high-resolution extraction renders", () => {
    const region = { height: 225, width: 360, x: 60, y: 30 }
    const foreground = { height: 72, width: 177, x: 51, y: 102 }
    const ridge = { height: 9, width: 18, x: region.x + 306, y: region.y + 24 }
    const page = createSizedSyntheticPage(460, 300, (data, width) => {
      paintSizedRegion(data, width, region, TEST_BLUE_PANEL)
      paintSizedRegion(data, width, localToPageRegion(region, foreground), TEST_GRAY_PART)
      paintSizedRegion(data, width, ridge, TEST_GRAY_PART)
    })
    const support = createPartSupportMask(
      page,
      region,
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      pointsInLocalRegion(foreground, region),
      {
        enableLongShallowTopRecovery: true,
        enableTopSupport: true,
        ownedRegion: localToPageRegion(region, { ...region, x: 0, y: 0 }),
      },
    )

    expect(support.data[24 * region.width + 312]).toBe(SUPPORT_TOP_FACE)
  })

  it("does not apply very-long top lift to shorter shallow crops", () => {
    const region = { height: 61, width: 102, x: 20, y: 10 }
    const foreground = { height: 30, width: 56, x: 17, y: 34 }
    const mask = createMask(region.width, region.height, foreground, SUPPORT_OWNED)
    const page = createSyntheticPage((data) => {
      paintRegion(data, region, TEST_BLUE_PANEL)
      paintRegion(data, localToPageRegion(region, foreground), TEST_GRAY_PART)
      paintRegion(data, { height: 2, width: 56, x: region.x + 17, y: region.y + 3 }, TEST_GRAY_PART)
    })

    fillLongShallowWeakFaceSupport(
      mask,
      page,
      region,
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      foreground,
    )

    expect(mask[3 * region.width + 20]).toBe(0)
  })
})

function createMask(width: number, height: number, region: { height: number; width: number; x: number; y: number }, value: number): Uint8Array {
  const mask = new Uint8Array(width * height)

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      mask[y * width + x] = value
    }
  }

  return mask
}

function localToPageRegion(
  pageRegion: { x: number; y: number },
  localRegion: { height: number; width: number; x: number; y: number },
) {
  return {
    ...localRegion,
    x: pageRegion.x + localRegion.x,
    y: pageRegion.y + localRegion.y,
  }
}

function pointsInLocalRegion(
  region: { height: number; width: number; x: number; y: number },
  pageRegion: { x: number; y: number },
) {
  const points: Array<{ x: number; y: number }> = []

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      points.push({ x: pageRegion.x + x, y: pageRegion.y + y })
    }
  }

  return points
}

function createSizedSyntheticPage(
  width: number,
  height: number,
  paint: (data: Uint8ClampedArray, width: number) => void,
) {
  const data = new Uint8ClampedArray(width * height * 4)

  paintSizedRegion(data, width, { height, width, x: 0, y: 0 }, { b: 255, g: 255, r: 255 })
  paint(data, width)

  return {
    data,
    height,
    pageNumber: 1,
    width,
  }
}

function paintSizedRegion(
  data: Uint8ClampedArray,
  pageWidth: number,
  region: { height: number; width: number; x: number; y: number },
  color: { b: number; g: number; r: number },
): void {
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const index = (y * pageWidth + x) * 4

      data[index] = color.r
      data[index + 1] = color.g
      data[index + 2] = color.b
      data[index + 3] = 255
    }
  }
}
