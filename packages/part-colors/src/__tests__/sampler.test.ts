import { describe, expect, it } from "vitest"
import { samplePartColor } from "../sampler"
import type { PartColorPageImage, PartColorRegion, RgbColor } from "../contracts"

const TEST_BACKGROUND = { b: 248, g: 248, r: 248 }
const TEST_BLACK = { b: 28, g: 27, r: 25 }
const TEST_GREEN = { b: 74, g: 159, r: 75 }
const TEST_RED = { b: 9, g: 26, r: 201 }

describe("samplePartColor", () => {
  it("samples part body color instead of dark outline pixels", () => {
    const page = createPage()
    const region = { height: 24, width: 24, x: 4, y: 4 }

    paintRegion(page, region, TEST_BLACK)
    paintRegion(page, inset(region, 3), TEST_RED)

    const sample = samplePartColor({
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.status).toBe("stable")
    expect(sample?.hex).toBe("#c91a09")
  })

  it("keeps black filled parts detectable", () => {
    const page = createPage()
    const region = { height: 22, width: 22, x: 4, y: 4 }

    paintRegion(page, region, TEST_BLACK)
    paintRegion(page, { height: 3, width: 6, x: 10, y: 8 }, { b: 56, g: 56, r: 56 })

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.status).toBe("stable")
    expect(sample?.hex).toBe("#191b1c")
  })

  it("selects neutral body pixels instead of medium-dark shadow pixels", () => {
    const page = createPage()
    const region = { height: 24, width: 24, x: 4, y: 4 }

    paintRegion(page, region, { b: 64, g: 66, r: 64 })
    paintRegion(page, { height: 8, width: 8, x: 6, y: 6 }, { b: 39, g: 41, r: 39 })
    paintRegion(page, { height: 8, width: 8, x: 16, y: 6 }, { b: 107, g: 111, r: 108 })
    paintRegion(page, { height: 6, width: 8, x: 6, y: 16 }, { b: 91, g: 94, r: 90 })

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.hex).toBe("#6c6f6b")
    expect(sample?.status).toBe("review")
  })

  it("keeps tiny black parts from selecting light highlight pixels", () => {
    const page = createPage()
    const region = { height: 12, width: 12, x: 4, y: 4 }

    paintRegion(page, region, { b: 89, g: 82, r: 75 })
    paintRegion(page, inset(region, 3), { b: 22, g: 14, r: 11 })
    paintRegion(page, { height: 2, width: 3, x: 8, y: 8 }, { b: 174, g: 168, r: 162 })

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.hex).toBe("#0b0e16")
    expect(sample?.status).not.toBe("unknown")
  })

  it("keeps renderer-drifted tiny black parts from selecting gray highlight pixels", () => {
    const page = createPage()
    const region = { height: 12, width: 12, x: 4, y: 4 }

    paintRegion(page, region, { b: 136, g: 131, r: 132 })
    paintInteriorPixels(page, region, { b: 64, g: 58, r: 51 }, 0, 18)
    paintInteriorPixels(page, region, { b: 121, g: 114, r: 107 }, 18, 14)
    paintInteriorPixels(page, region, { b: 31, g: 24, r: 20 }, 32, 13)
    paintInteriorPixels(page, region, { b: 89, g: 81, r: 74 }, 45, 11)
    paintInteriorPixels(page, region, { b: 136, g: 131, r: 132 }, 56, 8)
    paintInteriorPixels(page, region, { b: 165, g: 159, r: 151 }, 64, 6)

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.hex).toBe("#14181f")
    expect(sample?.status).toBe("review")
  })

  it("excludes quantity labels from sampled pixels", () => {
    const page = createPage()
    const region = { height: 24, width: 24, x: 4, y: 4 }
    const labelRegion = { height: 6, width: 10, x: 11, y: 18 }

    paintRegion(page, region, TEST_GREEN)
    paintRegion(page, labelRegion, TEST_BLACK)

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      excludedRegions: [labelRegion],
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.status).toBe("stable")
    expect(sample?.hex).toBe("#4b9f4a")
  })

  it("ignores background-like pixels and crop borders", () => {
    const page = createPage()
    const region = { height: 24, width: 24, x: 4, y: 4 }

    paintRegion(page, region, TEST_BACKGROUND)
    paintRegion(page, inset(region, 1), TEST_BLACK)
    paintRegion(page, inset(region, 3), TEST_GREEN)

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.status).toBe("stable")
    expect(sample?.hex).toBe("#4b9f4a")
  })

  it("keeps alpha-filled white body pixels when they look like page background", () => {
    const page = createPage()
    const region = { height: 24, width: 24, x: 4, y: 4 }

    paintRegion(page, region, { b: 245, g: 245, r: 245 })
    paintRegion(page, inset(region, 3), { b: 164, g: 167, r: 165 })
    paintRegion(page, inset(region, 6), { b: 245, g: 245, r: 245 })

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.hex).toBe("#f5f5f5")
    expect(sample?.rejectionCounts.background).toBe(0)
    expect(sample?.status).not.toBe("unknown")
  })

  it("keeps interior white body pixels when dark outline support is high", () => {
    const page = createPage()
    const region = { height: 24, width: 24, x: 4, y: 4 }

    paintRegion(page, region, TEST_BLACK)
    paintRegion(page, inset(region, 5), { b: 245, g: 245, r: 245 })
    paintRegion(page, { height: 3, width: 8, x: 12, y: 12 }, { b: 105, g: 105, r: 105 })

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.hex).toBe("#f5f5f5")
    expect(sample?.rejectionCounts.background).toBe(0)
    expect(sample?.status).not.toBe("unknown")
  })

  it("does not rescue white background-like pixels over a dark neutral body", () => {
    const page = createPage()
    const region = { height: 24, width: 24, x: 4, y: 4 }

    paintRegion(page, region, { b: 245, g: 245, r: 245 })
    paintRegion(page, inset(region, 3), { b: 90, g: 88, r: 86 })
    paintRegion(page, inset(region, 6), { b: 40, g: 36, r: 32 })

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.hex).toBe("#202428")
    expect(sample?.rejectionCounts.background).toBeGreaterThan(0)
  })

  it("selects small dark neutral body pixels over light highlight pixels", () => {
    const page = createPage()
    const region = { height: 14, width: 14, x: 4, y: 4 }

    paintRegion(page, region, { b: 93, g: 95, r: 92 })
    paintInteriorPixels(page, region, { b: 93, g: 95, r: 92 }, 0, 36)
    paintInteriorPixels(page, region, { b: 49, g: 51, r: 47 }, 36, 30)
    paintInteriorPixels(page, region, { b: 113, g: 115, r: 113 }, 66, 18)
    paintInteriorPixels(page, region, { b: 156, g: 166, r: 169 }, 84, 12)

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.hex).toBe("#5c5f5d")
  })

  it("selects light neutral body pixels over dark outline evidence", () => {
    const page = createPage()
    const region = { height: 20, width: 20, x: 4, y: 4 }

    paintRegion(page, region, { b: 36, g: 33, r: 31 })
    paintInteriorPixels(page, region, { b: 36, g: 33, r: 31 }, 0, 60)
    paintInteriorPixels(page, region, { b: 72, g: 69, r: 66 }, 60, 55)
    paintInteriorPixels(page, region, { b: 167, g: 162, r: 157 }, 115, 100)
    paintInteriorPixels(page, region, { b: 128, g: 124, r: 118 }, 215, 55)
    paintInteriorPixels(page, region, { b: 101, g: 98, r: 94 }, 270, 54)

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.hex).toBe("#9da2a7")
  })

  it("selects medium neutral body pixels over neutral dark outline evidence", () => {
    const page = createPage()
    const region = { height: 20, width: 20, x: 4, y: 4 }

    paintRegion(page, region, { b: 39, g: 36, r: 34 })
    paintInteriorPixels(page, region, { b: 39, g: 36, r: 34 }, 0, 45)
    paintInteriorPixels(page, region, { b: 66, g: 63, r: 61 }, 45, 45)
    paintInteriorPixels(page, region, { b: 130, g: 130, r: 131 }, 90, 82)
    paintInteriorPixels(page, region, { b: 112, g: 102, r: 85 }, 172, 45)
    paintInteriorPixels(page, region, { b: 92, g: 82, r: 76 }, 217, 107)

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.hex).toBe("#838282")
  })

  it("keeps blue-biased near-black neutral parts black", () => {
    const page = createPage()
    const region = { height: 20, width: 20, x: 4, y: 4 }

    paintRegion(page, region, { b: 24, g: 16, r: 10 })
    paintInteriorPixels(page, region, { b: 24, g: 16, r: 10 }, 0, 110)
    paintInteriorPixels(page, region, { b: 64, g: 57, r: 49 }, 110, 62)
    paintInteriorPixels(page, region, { b: 110, g: 103, r: 95 }, 172, 40)
    paintInteriorPixels(page, region, { b: 151, g: 144, r: 137 }, 212, 40)
    paintInteriorPixels(page, region, { b: 86, g: 80, r: 74 }, 252, 72)

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.hex).toBe("#0a1018")
  })

  it("selects strong near-black body evidence before medium gray support", () => {
    const page = createPage()
    const region = { height: 20, width: 20, x: 4, y: 4 }

    paintRegion(page, region, { b: 120, g: 113, r: 103 })
    paintRegion(page, inset(region, 5), { b: 33, g: 23, r: 9 })
    paintRegion(page, { height: 4, width: 8, x: 10, y: 7 }, { b: 57, g: 49, r: 37 })

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.hex).toBe("#091721")
    expect(sample?.status).not.toBe("unknown")
  })

  it("selects bright warm metallic body chips before dark brown shadow chips", () => {
    const page = createPage()
    const region = { height: 20, width: 20, x: 4, y: 4 }

    paintRegion(page, region, { b: 13, g: 63, r: 104 })
    paintInteriorPixels(page, region, { b: 13, g: 63, r: 104 }, 0, 34)
    paintInteriorPixels(page, region, { b: 43, g: 145, r: 180 }, 34, 64)
    paintInteriorPixels(page, region, { b: 48, g: 148, r: 204 }, 98, 36)
    paintInteriorPixels(page, region, { b: 40, g: 116, r: 144 }, 134, 36)

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.hex).toBe("#cc9430")
  })

  it("marks tiny samples as weak but classifiable", () => {
    const page = createPage()
    const region = { height: 4, width: 4, x: 4, y: 4 }

    paintRegion(page, region, TEST_GREEN)

    const sample = samplePartColor({
      page,
      partImage: {
        alphaMask: createMask(region, [{ x: 1, y: 1 }, { x: 2, y: 1 }]),
        region,
      },
    })

    expect(sample?.status).toBe("weak-classifiable")
  })

  it("marks mixed samples for review", () => {
    const page = createPage()
    const region = { height: 24, width: 24, x: 4, y: 4 }

    paintRegion(page, { ...region, width: 12 }, TEST_GREEN)
    paintRegion(page, { ...region, x: 16, width: 12 }, TEST_RED)

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.status).toBe("review")
  })

  it("prefers saturated body color when white highlight pixels dominate", () => {
    const page = createPage()
    const region = { height: 24, width: 24, x: 4, y: 4 }

    paintRegion(page, region, { b: 245, g: 245, r: 245 })
    paintRegion(page, { height: 8, width: 18, x: 7, y: 13 }, TEST_GREEN)

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.hex).toBe("#4b9f4a")
    expect(sample?.status).not.toBe("unknown")
    expect(sample?.chips.some((chip) => chip.hex === "#4b9f4a")).toBe(true)
  })

  it("selects warm brown body chips over neutral tan shadow chips", () => {
    const page = createPage()
    const region = { height: 20, width: 20, x: 4, y: 4 }

    paintRegion(page, region, { b: 111, g: 140, r: 155 })
    paintInteriorPixels(page, region, { b: 111, g: 140, r: 155 }, 0, 80)
    paintInteriorPixels(page, region, { b: 35, g: 52, r: 78 }, 80, 42)
    paintInteriorPixels(page, region, { b: 15, g: 34, r: 65 }, 122, 42)
    paintInteriorPixels(page, region, { b: 93, g: 113, r: 129 }, 164, 60)

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.hex).toBe("#482c1a")
  })

  it("does not let dark border pixels turn tiny light bluish gray parts black", () => {
    const page = createPage()
    const region = { height: 14, width: 14, x: 4, y: 4 }

    paintRegion(page, region, { b: 22, g: 20, r: 18 })
    paintRegion(page, inset(region, 3), { b: 169, g: 165, r: 160 })

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.hex).toBe("#a0a5a9")
    expect(sample?.rejectionCounts.edge).toBeGreaterThan(0)
  })

  it("keeps thin part sampling alive when there is no deep mask core", () => {
    const page = createPage()
    const region = { height: 16, width: 16, x: 4, y: 4 }
    const opaquePixels = []

    for (let x = 3; x < 13; x += 1) {
      opaquePixels.push({ x, y: 7 }, { x, y: 8 })
      paintRegion(page, { height: 2, width: 1, x: region.x + x, y: region.y + 7 }, TEST_GREEN)
    }

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      page,
      partImage: {
        alphaMask: createMask(region, opaquePixels),
        region,
      },
    })

    expect(sample?.hex).toBe("#4b9f4a")
    expect(sample?.status).not.toBe("unknown")
  })

  it("keeps accepted and rejected sample counts for report evidence", () => {
    const page = createPage()
    const region = { height: 16, width: 16, x: 4, y: 4 }
    const labelRegion = { height: 4, width: 4, x: 10, y: 10 }

    paintRegion(page, region, TEST_GREEN)

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      excludedRegions: [labelRegion],
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.pixelCount).toBeGreaterThan(0)
    expect(sample?.edgeChips?.length).toBeGreaterThan(0)
    expect(sample?.rejectedPixelCount).toBeGreaterThan(0)
    expect(sample?.rejectionCounts.excludedRegion).toBeGreaterThan(0)
  })

  it("uses high-resolution fallback for tiny edge-heavy samples", () => {
    const page = createPage()
    const highResolutionPage = createPage(72, 72)
    const region = { height: 12, width: 12, x: 4, y: 4 }
    const highResolutionRegion = scaleRegion(region, 2)

    paintRegion(page, region, TEST_BLACK)
    paintRegion(page, inset(region, 4), TEST_GREEN)
    paintRegion(highResolutionPage, highResolutionRegion, TEST_BLACK)
    paintRegion(highResolutionPage, inset(highResolutionRegion, 5), TEST_GREEN)

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      highResolution: {
        page: highResolutionPage,
        scaleX: 2,
        scaleY: 2,
      },
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.hex).toBe("#4b9f4a")
    expect(sample?.sampleScale).toBe(2)
    expect(sample?.basePixelCount).toBeGreaterThan(0)
  })

  it("does not use high-resolution fallback for unambiguous large samples", () => {
    const page = createPage(96, 96)
    const highResolutionPage = createPage(192, 192)
    const region = { height: 36, width: 36, x: 12, y: 12 }
    const highResolutionRegion = scaleRegion(region, 2)

    paintRegion(page, region, TEST_GREEN)
    paintRegion(highResolutionPage, highResolutionRegion, TEST_RED)

    const sample = samplePartColor({
      background: TEST_BACKGROUND,
      highResolution: {
        page: highResolutionPage,
        scaleX: 2,
        scaleY: 2,
      },
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.hex).toBe("#4b9f4a")
    expect(sample?.sampleScale).toBeUndefined()
  })

  it("samples large masks without spreading candidates into the call stack", () => {
    const page = createPage(540, 540)
    const region = { height: 512, width: 512, x: 14, y: 14 }

    paintRegion(page, region, TEST_GREEN)

    const sample = samplePartColor({
      page,
      partImage: {
        alphaMask: createMask(region),
        region,
      },
    })

    expect(sample?.hex).toBe("#4b9f4a")
  })
})

function createPage(width = 36, height = 36): PartColorPageImage {
  const data = new Uint8ClampedArray(width * height * 4)

  for (let index = 0; index < data.length; index += 4) {
    data[index] = TEST_BACKGROUND.r
    data[index + 1] = TEST_BACKGROUND.g
    data[index + 2] = TEST_BACKGROUND.b
    data[index + 3] = 255
  }

  return { data, height, width }
}

function paintRegion(page: PartColorPageImage, region: PartColorRegion, color: RgbColor): void {
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const offset = (y * page.width + x) * 4

      page.data[offset] = color.r
      page.data[offset + 1] = color.g
      page.data[offset + 2] = color.b
      page.data[offset + 3] = 255
    }
  }
}

function paintInteriorPixels(
  page: PartColorPageImage,
  region: PartColorRegion,
  color: RgbColor,
  startIndex: number,
  count: number,
): void {
  const interior = inset(region, 1)
  let painted = 0
  let visited = 0

  for (let y = interior.y; y < interior.y + interior.height; y += 1) {
    for (let x = interior.x; x < interior.x + interior.width; x += 1) {
      if (visited >= startIndex && painted < count) {
        paintRegion(page, { height: 1, width: 1, x, y }, color)
        painted += 1
      }

      visited += 1
    }
  }
}

function createMask(
  region: PartColorRegion,
  opaquePixels?: Array<{ x: number; y: number }>,
) {
  const data = new Uint8ClampedArray(region.width * region.height)

  if (!opaquePixels) {
    data.fill(255)
    return { data, height: region.height, width: region.width }
  }

  for (const pixel of opaquePixels) {
    data[pixel.y * region.width + pixel.x] = 255
  }

  return { data, height: region.height, width: region.width }
}

function inset(region: PartColorRegion, amount: number): PartColorRegion {
  return {
    height: region.height - amount * 2,
    width: region.width - amount * 2,
    x: region.x + amount,
    y: region.y + amount,
  }
}

function scaleRegion(region: PartColorRegion, scale: number): PartColorRegion {
  return {
    height: region.height * scale,
    width: region.width * scale,
    x: region.x * scale,
    y: region.y * scale,
  }
}
