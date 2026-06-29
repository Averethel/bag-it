import { describe, expect, it } from "vitest"
import {
  COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND,
  COMPACT_MISSING_UPPER_PEER_ROW_RECOVERY_KIND,
  createQuantityRetryRecoveryPlans,
  recoverCompactMissingLowerPeerCandidates,
  recoverCompactMissingSameRowTrailingPeerCandidates,
  recoverCompactMissingUpperPeerRowCandidates,
  recoverPostRejectionQuantityCandidates,
  type QuantityCandidate,
} from "@bag-it/raster-quantity-labels"
import { createFlatBackgroundModel } from "../background-model"
import type { CalloutPartItem, CalloutPartPageInput, Region, RgbColor } from "../contracts"
import { extractCalloutPartsForPage, recoverCompactMissingLowerPeerItems } from "../extractor"

const BACKGROUND: RgbColor = { b: 254, g: 238, r: 215 }
const BLACK: RgbColor = { b: 0, g: 0, r: 0 }
const PART: RgbColor = { b: 42, g: 42, r: 42 }
const LOW_CONTRAST_PART: RgbColor = { b: 252, g: 252, r: 252 }

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

  it("recovers a compact same-row trailing 1x label from printed ink and a part above", () => {
    const calloutRegion = { height: 80, width: 135, x: 510, y: 49 }
    const initial = [
      createCandidate(
        { height: 11, width: 15, x: 520, y: 102 },
        { text: "6x", value: 6 },
      ),
    ]
    const page = createPage(700, 160, (data, width) => {
      paintRegion(data, width, calloutRegion, BACKGROUND)
      paintRegion(data, width, { height: 41, width: 57, x: 511, y: 66 }, PART)
      paintRegion(data, width, { height: 45, width: 87, x: 556, y: 54 }, PART)
      paintRasterQuantityLabel(data, width, "6x", 520, 102)
      paintRasterQuantityLabel(data, width, "1x", 569, 102)
    })
    const plan = createQuantityRetryRecoveryPlans(initial, calloutRegion)
      .find((candidatePlan) => candidatePlan.kind === COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND)

    expect(plan).toBeDefined()

    const [recovered] = recoverCompactMissingSameRowTrailingPeerCandidates(
      page,
      calloutRegion,
      BACKGROUND,
      initial,
      plan!,
    )

    expect(recovered).toMatchObject({
      recoveryKind: "compact-missing-same-row-trailing-peer",
      region: { height: 7, width: 10, x: 570, y: 102 },
      text: "1x",
      value: 1,
    })
  })

  it("emits a recovered compact same-row trailing item for a low-contrast row-end part", () => {
    const calloutRegion = { height: 80, width: 135, x: 510, y: 49 }
    const page = createPage(700, 160, (data, width) => {
      paintRegion(data, width, calloutRegion, BACKGROUND)
      paintRegion(data, width, { height: 35, width: 57, x: 511, y: 66 }, PART)
      paintRegion(data, width, { height: 48, width: 100, x: 543, y: 54 }, LOW_CONTRAST_PART)
      paintRasterQuantityLabel(data, width, "6x", 520, 102)
      paintSparseLabelInk(data, width, { height: 11, width: 15, x: 556, y: 102 })
    })

    const result = extractCalloutPartsForPage({
      callouts: [{ background: BACKGROUND, id: "low-contrast-trailing", pageNumber: 1, region: calloutRegion }],
      page,
    })
    const items = result.callouts[0]!.items

    expect(items.map((item) => item.quantityLabel.text)).toEqual(["6x", "1x"])
    expect(items[1]!.quantityLabel.recoveryKind).toBe("compact-missing-same-row-trailing-peer")
    expect(items[1]!.partImage.region.x).toBeLessThanOrEqual(545)
    expect(items[1]!.partImage.region.width).toBeGreaterThanOrEqual(84)
  })

  it("recovers a compact same-row trailing item from sparse baseline ink over a broad part", () => {
    const calloutRegion = { height: 80, width: 135, x: 510, y: 49 }
    const initial = [
      createCandidate(
        { height: 11, width: 15, x: 520, y: 102 },
        { text: "6x", value: 6 },
      ),
    ]
    const page = createPage(700, 160, (data, width) => {
      paintRegion(data, width, calloutRegion, BACKGROUND)
      paintRegion(data, width, { height: 41, width: 57, x: 511, y: 66 }, PART)
      paintRegion(data, width, { height: 53, width: 87, x: 556, y: 54 }, LOW_CONTRAST_PART)
      paintRasterQuantityLabel(data, width, "6x", 520, 102)
      paintSparseLowDensityLabelInk(data, width, { height: 11, width: 15, x: 569, y: 102 })
    })
    const plan = createQuantityRetryRecoveryPlans(initial, calloutRegion)
      .find((candidatePlan) => candidatePlan.kind === COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND)

    expect(plan).toBeDefined()

    const [recovered] = recoverCompactMissingSameRowTrailingPeerCandidates(
      page,
      calloutRegion,
      BACKGROUND,
      initial,
      plan!,
    )

    expect(recovered).toMatchObject({
      recoveryKind: "compact-missing-same-row-trailing-peer",
      region: { height: 11, width: 15, x: 569, y: 102 },
      text: "1x",
      value: 1,
    })
  })

  it("uses trailing peer crop fallback when the compact same-row label was parsed natively", () => {
    const calloutRegion = { height: 80, width: 135, x: 510, y: 49 }
    const page = createPage(700, 160, (data, width) => {
      paintRegion(data, width, calloutRegion, BACKGROUND)
      paintRegion(data, width, { height: 35, width: 57, x: 511, y: 66 }, PART)
      paintRegion(data, width, { height: 48, width: 100, x: 543, y: 54 }, LOW_CONTRAST_PART)
      paintRasterQuantityLabel(data, width, "4x", 575, 83)
      paintRasterQuantityLabel(data, width, "6x", 520, 102)
      paintRasterQuantityLabel(data, width, "1x", 569, 102)
    })

    const result = extractCalloutPartsForPage({
      callouts: [{ background: BACKGROUND, id: "native-trailing", pageNumber: 1, region: calloutRegion }],
      page,
    })
    const items = result.callouts[0]!.items

    expect(items.map((item) => item.quantityLabel.text)).toEqual(["6x", "1x"])
    expect(items[1]!.quantityLabel.recoveryKind).toBeUndefined()
    expect(items[1]!.partImage.region.x).toBeLessThanOrEqual(556)
    expect(items[1]!.partImage.region.width).toBeGreaterThanOrEqual(84)
  })

  it("does not recover a compact same-row trailing peer without label ink", () => {
    const calloutRegion = { height: 80, width: 135, x: 510, y: 49 }
    const initial = [
      createCandidate(
        { height: 11, width: 15, x: 520, y: 102 },
        { text: "6x", value: 6 },
      ),
    ]
    const page = createPage(700, 160, (data, width) => {
      paintRegion(data, width, calloutRegion, BACKGROUND)
      paintRegion(data, width, { height: 41, width: 57, x: 511, y: 66 }, PART)
      paintRegion(data, width, { height: 45, width: 87, x: 556, y: 54 }, PART)
      paintRasterQuantityLabel(data, width, "6x", 520, 102)
    })
    const plan = createQuantityRetryRecoveryPlans(initial, calloutRegion)
      .find((candidatePlan) => candidatePlan.kind === COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND)

    expect(plan).toBeDefined()
    expect(recoverCompactMissingSameRowTrailingPeerCandidates(page, calloutRegion, BACKGROUND, initial, plan!)).toEqual([])
  })

  it("recovers a compact missing upper peer row from printed ink and parts above", () => {
    const calloutRegion = { height: 124, width: 88, x: 41, y: 372 }
    const initial = [
      createCandidate({ height: 11, width: 14, x: 60, y: 456 }),
      createCandidate({ height: 11, width: 14, x: 88, y: 462 }),
    ]
    const page = createPage(180, 520, (data, width) => {
      paintRegion(data, width, calloutRegion, BACKGROUND)
      paintRegion(data, width, { height: 24, width: 35, x: 50, y: 384 }, PART)
      paintRegion(data, width, { height: 26, width: 43, x: 75, y: 382 }, PART)
      paintRegion(data, width, { height: 28, width: 37, x: 50, y: 427 }, PART)
      paintRegion(data, width, { height: 31, width: 38, x: 76, y: 427 }, PART)
      paintRasterQuantityLabel(data, width, "1x", 60, 408)
      paintRasterQuantityLabel(data, width, "1x", 88, 408)
      paintRasterQuantityLabel(data, width, "1x", 60, 456)
      paintRasterQuantityLabel(data, width, "1x", 88, 462)
    })
    const plan = createQuantityRetryRecoveryPlans(initial, calloutRegion)
      .find((candidatePlan) => candidatePlan.kind === COMPACT_MISSING_UPPER_PEER_ROW_RECOVERY_KIND)

    expect(plan).toBeDefined()

    const recovered = recoverCompactMissingUpperPeerRowCandidates(page, calloutRegion, BACKGROUND, initial, plan!)

    expect(recovered).toHaveLength(2)
    expect(recovered.map((candidate) => candidate.region)).toEqual([
      { height: 11, width: 14, x: 60, y: 408 },
      { height: 11, width: 14, x: 88, y: 408 },
    ])
    expect(recovered.map((candidate) => candidate.text)).toEqual(["1x", "1x"])
  })

  it("recovers a single missing compact upper peer when the other upper label was detected", () => {
    const calloutRegion = { height: 108, width: 72, x: 49, y: 380 }
    const initial = [
      createCandidate({ height: 11, width: 14, x: 88, y: 411 }),
      createCandidate({ height: 11, width: 14, x: 60, y: 456 }),
      createCandidate({ height: 11, width: 14, x: 88, y: 462 }),
    ]
    const page = createPage(180, 520, (data, width) => {
      paintRegion(data, width, calloutRegion, BACKGROUND)
      paintRegion(data, width, { height: 24, width: 35, x: 50, y: 388 }, PART)
      paintRegion(data, width, { height: 26, width: 43, x: 75, y: 385 }, PART)
      paintRegion(data, width, { height: 35, width: 37, x: 50, y: 427 }, PART)
      paintRegion(data, width, { height: 41, width: 38, x: 76, y: 426 }, PART)
      paintRasterQuantityLabel(data, width, "1x", 60, 411)
      paintRasterQuantityLabel(data, width, "1x", 88, 411)
      paintRasterQuantityLabel(data, width, "1x", 60, 456)
      paintRasterQuantityLabel(data, width, "1x", 88, 462)
    })
    const plan = createQuantityRetryRecoveryPlans(initial, calloutRegion)
      .find((candidatePlan) => candidatePlan.kind === COMPACT_MISSING_UPPER_PEER_ROW_RECOVERY_KIND)

    expect(plan).toBeDefined()

    const recovered = recoverCompactMissingUpperPeerRowCandidates(page, calloutRegion, BACKGROUND, initial, plan!)

    expect(recovered.map((candidate) => candidate.region)).toEqual([
      { height: 11, width: 14, x: 60, y: 411 },
    ])
  })

  it("does not recover a compact upper peer row without printed label ink", () => {
    const calloutRegion = { height: 124, width: 88, x: 41, y: 372 }
    const initial = [
      createCandidate({ height: 11, width: 14, x: 60, y: 456 }),
      createCandidate({ height: 11, width: 14, x: 88, y: 462 }),
    ]
    const page = createPage(180, 520, (data, width) => {
      paintRegion(data, width, calloutRegion, BACKGROUND)
      paintRegion(data, width, { height: 22, width: 35, x: 50, y: 384 }, PART)
      paintRegion(data, width, { height: 24, width: 43, x: 75, y: 382 }, PART)
      paintRegion(data, width, { height: 28, width: 37, x: 50, y: 427 }, PART)
      paintRegion(data, width, { height: 31, width: 38, x: 76, y: 427 }, PART)
      paintRasterQuantityLabel(data, width, "1x", 60, 456)
      paintRasterQuantityLabel(data, width, "1x", 88, 462)
    })
    const plan = createQuantityRetryRecoveryPlans(initial, calloutRegion)
      .find((candidatePlan) => candidatePlan.kind === COMPACT_MISSING_UPPER_PEER_ROW_RECOVERY_KIND)

    expect(plan).toBeDefined()
    expect(recoverCompactMissingUpperPeerRowCandidates(page, calloutRegion, BACKGROUND, initial, plan!)).toEqual([])
  })
})

function createCandidate(
  region: Region,
  {
    text = "1x",
    value = 1,
  }: {
    text?: string
    value?: number
  } = {},
): QuantityCandidate {
  return {
    confidence: 0.86,
    glyphs: [],
    region,
    text,
    value,
  }
}

function createPartItem(
  index: number,
  quantityRegion: Region,
  partRegion: Region,
  {
    text = "1x",
    value = 1,
  }: {
    text?: string
    value?: number
  } = {},
): CalloutPartItem {
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
      text,
      value,
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

function paintSparseLowDensityLabelInk(
  data: Uint8ClampedArray,
  pageWidth: number,
  region: Region,
): void {
  const points = [
    [2, 1],
    [9, 1],
    [5, 4],
    [11, 5],
    [7, 8],
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
  "4": [
    "10010",
    "10010",
    "10010",
    "11111",
    "00010",
    "00010",
    "00010",
  ],
  "6": [
    "01111",
    "10000",
    "10000",
    "11110",
    "10001",
    "10001",
    "01110",
  ],
  x: [
    "10001",
    "01010",
    "00100",
    "01010",
    "10001",
  ],
}
