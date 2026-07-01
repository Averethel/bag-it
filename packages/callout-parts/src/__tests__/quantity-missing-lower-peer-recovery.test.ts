import { describe, expect, it } from "vitest"
import {
  createQuantityRetryRecoveryPlans,
  recoverCompactMissingLowerPeerCandidates,
  recoverPostRejectionQuantityCandidates,
  type QuantityCandidate,
} from "@bag-it/raster-quantity-labels"
import { createFlatBackgroundModel } from "../background-model"
import type { CalloutPartItem, CalloutPartPageInput, Region, RgbColor } from "../contracts"
import { recoverCompactMissingLowerPeerItems } from "../extractor"

const BACKGROUND: RgbColor = { b: 254, g: 238, r: 215 }
const BLACK: RgbColor = { b: 0, g: 0, r: 0 }
const PART: RgbColor = { b: 42, g: 42, r: 42 }

describe("compact missing lower-peer quantity recovery", () => {
  it("recovers the Hall Tower lower-right label from printed ink and a part above", () => {
    const calloutRegion = { height: 120, width: 102, x: 422, y: 114 }
    const initial = [
      createCandidate({ height: 11, width: 14, x: 441, y: 154 }),
      createCandidate({ height: 11, width: 14, x: 475, y: 154 }),
      createCandidate({ height: 11, width: 14, x: 441, y: 200 }),
    ]
    const page = createPage(620, 260, (data, width) => {
      paintRegion(data, width, calloutRegion, BACKGROUND)
      paintRegion(data, width, { height: 18, width: 28, x: 476, y: 174 }, PART)
      paintRasterQuantityLabel(data, width, "1x", 484, 196)
    })
    const plan = createQuantityRetryRecoveryPlans(initial, calloutRegion)
      .find((candidatePlan) => candidatePlan.kind === "compact-missing-lower-peer")

    expect(plan).toBeDefined()

    const [recovered] = recoverCompactMissingLowerPeerCandidates(page, calloutRegion, BACKGROUND, initial, plan!)

    expect(recovered).toMatchObject({
      recoveryKind: "compact-missing-lower-peer",
      region: { height: 11, width: 14, x: 483, y: 194 },
      text: "1x",
      value: 1,
    })
  })

  it("runs after part-art rejection exposes a compact 2x2 layout", () => {
    const calloutRegion = { height: 120, width: 102, x: 422, y: 114 }
    const candidates = [
      createCandidate({ height: 11, width: 14, x: 441, y: 154 }),
      createCandidate({ height: 11, width: 14, x: 475, y: 154 }),
      createCandidate({ height: 11, width: 14, x: 441, y: 200 }),
    ]
    const page = createPage(620, 260, (data, width) => {
      paintRegion(data, width, calloutRegion, BACKGROUND)
      paintRegion(data, width, { height: 18, width: 28, x: 476, y: 174 }, PART)
      paintRasterQuantityLabel(data, width, "1x", 484, 196)
    })

    const recovered = recoverPostRejectionQuantityCandidates(page, calloutRegion, BACKGROUND, candidates)

    expect(recovered.map((candidate) => candidate.region)).toContainEqual({ height: 11, width: 14, x: 483, y: 194 })
  })

  it("recovers from the compact 2x2 subset when an extra candidate is still present", () => {
    const calloutRegion = { height: 120, width: 102, x: 422, y: 114 }
    const candidates = [
      createCandidate({ height: 11, width: 14, x: 441, y: 154 }),
      createCandidate({ height: 11, width: 14, x: 475, y: 154 }),
      createCandidate({ height: 11, width: 14, x: 506, y: 154 }),
      createCandidate({ height: 11, width: 14, x: 441, y: 200 }),
    ]
    const page = createPage(620, 260, (data, width) => {
      paintRegion(data, width, calloutRegion, BACKGROUND)
      paintRegion(data, width, { height: 18, width: 28, x: 476, y: 174 }, PART)
      paintRasterQuantityLabel(data, width, "1x", 484, 196)
    })
    const plan = createQuantityRetryRecoveryPlans(candidates, calloutRegion)
      .find((candidatePlan) => candidatePlan.kind === "compact-missing-lower-peer")

    expect(plan).toBeDefined()

    const [recovered] = recoverCompactMissingLowerPeerCandidates(page, calloutRegion, BACKGROUND, candidates, plan!)

    expect(recovered).toMatchObject({
      recoveryKind: "compact-missing-lower-peer",
      region: { height: 11, width: 14, x: 483, y: 194 },
      text: "1x",
      value: 1,
    })
  })

  it("reads recovered label text instead of copying the lower peer quantity", () => {
    const calloutRegion = { height: 120, width: 102, x: 422, y: 114 }
    const initial = [
      createCandidate({ height: 11, width: 14, x: 441, y: 154 }),
      createCandidate({ height: 11, width: 14, x: 475, y: 154 }),
      createCandidate({ height: 11, width: 14, x: 441, y: 200 }),
    ]
    const page = createPage(620, 260, (data, width) => {
      paintRegion(data, width, calloutRegion, BACKGROUND)
      paintRegion(data, width, { height: 18, width: 28, x: 476, y: 174 }, PART)
      paintRasterQuantityLabel(data, width, "2x", 484, 196)
    })
    const plan = createQuantityRetryRecoveryPlans(initial, calloutRegion)
      .find((candidatePlan) => candidatePlan.kind === "compact-missing-lower-peer")

    expect(plan).toBeDefined()

    const [recovered] = recoverCompactMissingLowerPeerCandidates(page, calloutRegion, BACKGROUND, initial, plan!)

    expect(recovered).toMatchObject({
      recoveryKind: "compact-missing-lower-peer",
      region: { height: 11, width: 14, x: 483, y: 194 },
      text: "2x",
      value: 2,
    })
  })

  it("allows compact recovery in high-resolution render coordinates", () => {
    const calloutRegion = { height: 240, width: 204, x: 844, y: 228 }
    const candidates = [
      createCandidate({ height: 22, width: 28, x: 882, y: 308 }),
      createCandidate({ height: 22, width: 28, x: 950, y: 308 }),
      createCandidate({ height: 22, width: 28, x: 882, y: 400 }),
    ]
    const page = createPage(1240, 520, (data, width) => {
      paintRegion(data, width, calloutRegion, BACKGROUND)
      paintRegion(data, width, { height: 36, width: 56, x: 952, y: 348 }, PART)
      paintRasterQuantityLabel(data, width, "1x", 968, 392, 2)
    })
    const plan = createQuantityRetryRecoveryPlans(candidates, calloutRegion)
      .find((candidatePlan) => candidatePlan.kind === "compact-missing-lower-peer")

    expect(plan).toBeDefined()

    const [recovered] = recoverCompactMissingLowerPeerCandidates(page, calloutRegion, BACKGROUND, candidates, plan!)

    expect(recovered).toMatchObject({
      recoveryKind: "compact-missing-lower-peer",
      region: { height: 22, width: 28, x: 965, y: 388 },
      text: "1x",
      value: 1,
    })
  })

  it("emits a recovered compact lower-peer part row after normal crop extraction", () => {
    const calloutRegion = { height: 120, width: 102, x: 422, y: 114 }
    const page = createPage(620, 260, (data, width) => {
      paintRegion(data, width, calloutRegion, BACKGROUND)
      paintRegion(data, width, { height: 18, width: 28, x: 476, y: 174 }, PART)
      paintRasterQuantityLabel(data, width, "1x", 484, 196)
    })
    const callout = { background: BACKGROUND, id: "compact-missing-peer", pageNumber: 1, region: calloutRegion }
    const items = [
      createPartItem(0, { height: 11, width: 14, x: 441, y: 154 }, { height: 29, width: 42, x: 431, y: 129 }),
      createPartItem(1, { height: 11, width: 14, x: 475, y: 154 }, { height: 31, width: 42, x: 461, y: 128 }),
      createPartItem(2, { height: 11, width: 14, x: 441, y: 200 }, { height: 35, width: 52, x: 431, y: 171 }),
    ]

    const recoveredItems = recoverCompactMissingLowerPeerItems(
      page,
      callout,
      BACKGROUND,
      createFlatBackgroundModel(BACKGROUND),
      items,
    )
    const recovered = recoveredItems.find((item) => item.quantityLabel.recoveryKind === "compact-missing-lower-peer")

    expect(recoveredItems).toHaveLength(4)
    expect(recovered?.quantityLabel.region).toEqual({ height: 11, width: 14, x: 483, y: 194 })
    expect(recovered?.partImage.region.x).toBeGreaterThanOrEqual(450)
  })

  it("does not recover a lower peer when the inferred label box has no ink", () => {
    const calloutRegion = { height: 120, width: 102, x: 422, y: 114 }
    const initial = [
      createCandidate({ height: 11, width: 14, x: 441, y: 154 }),
      createCandidate({ height: 11, width: 14, x: 475, y: 154 }),
      createCandidate({ height: 11, width: 14, x: 441, y: 200 }),
    ]
    const page = createPage(620, 260, (data, width) => {
      paintRegion(data, width, calloutRegion, BACKGROUND)
      paintRegion(data, width, { height: 18, width: 28, x: 476, y: 174 }, PART)
    })
    const plan = createQuantityRetryRecoveryPlans(initial, calloutRegion)
      .find((candidatePlan) => candidatePlan.kind === "compact-missing-lower-peer")

    expect(plan).toBeDefined()
    expect(recoverCompactMissingLowerPeerCandidates(page, calloutRegion, BACKGROUND, initial, plan!)).toEqual([])
  })
})

function createCandidate(region: Region): QuantityCandidate {
  return {
    confidence: 0.86,
    glyphs: [],
    region,
    text: "1x",
    value: 1,
  }
}

function createPartItem(index: number, quantityRegion: Region, partRegion: Region): CalloutPartItem {
  return {
    calloutId: "compact-missing-peer",
    confidence: 0.86,
    id: `item-${index}`,
    indexOnCallout: index,
    partImage: {
      alphaMask: {
        data: new Uint8ClampedArray(partRegion.width * partRegion.height).fill(255),
        height: partRegion.height,
        width: partRegion.width,
      },
      region: partRegion,
    },
    quantityLabel: {
      confidence: 0.86,
      glyphs: [],
      region: quantityRegion,
      text: "1x",
      value: 1,
    },
    sourceRegion: partRegion,
  }
}

function createPage(
  width: number,
  height: number,
  paint: (data: Uint8ClampedArray, width: number) => void,
): CalloutPartPageInput {
  const data = new Uint8ClampedArray(width * height * 4)

  paintRegion(data, width, { height, width, x: 0, y: 0 }, { b: 255, g: 255, r: 255 })
  paint(data, width)

  return {
    data,
    height,
    pageNumber: 1,
    width,
  }
}

function paintRegion(
  data: Uint8ClampedArray,
  pageWidth: number,
  region: Region,
  color: RgbColor,
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

function paintSparseLabelInk(
  data: Uint8ClampedArray,
  pageWidth: number,
  region: Region,
): void {
  const points = [
    [2, 1],
    [6, 1],
    [10, 1],
    [4, 2],
    [8, 2],
    [12, 2],
    [3, 4],
    [7, 4],
    [11, 4],
    [5, 6],
    [9, 6],
    [4, 8],
    [8, 8],
  ]

  for (const [x, y] of points) {
    paintRegion(data, pageWidth, { height: 1, width: 1, x: region.x + x, y: region.y + y }, BLACK)
  }
}

function paintRasterQuantityLabel(
  data: Uint8ClampedArray,
  pageWidth: number,
  text: string,
  x: number,
  y: number,
  scale = 1,
): void {
  let cursorX = x

  for (const char of text) {
    const glyph = RASTER_GLYPHS[char]

    if (!glyph) {
      cursorX += 4
      continue
    }

    glyph.forEach((row, rowIndex) => {
      [...row].forEach((cell, columnIndex) => {
        if (cell !== "1") {
          return
        }

        paintRegion(
          data,
          pageWidth,
          {
            height: scale,
            width: scale,
            x: cursorX + columnIndex * scale,
            y: y + rowIndex * scale,
          },
          BLACK,
        )
      })
    })
    cursorX += (glyph[0]!.length + 1) * scale
  }
}

const RASTER_GLYPHS: Record<string, readonly string[]> = {
  "1": [
    "00100",
    "01100",
    "00100",
    "00100",
    "00100",
    "00100",
    "01110",
  ],
  "2": [
    "01110",
    "10001",
    "00001",
    "00010",
    "00100",
    "01000",
    "11111",
  ],
  x: [
    "10001",
    "01010",
    "00100",
    "01010",
    "10001",
  ],
}
