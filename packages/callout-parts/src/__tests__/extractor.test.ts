import { describe, expect, it } from "vitest"
import {
  createGlyphFromPixels,
  createQuantityRecoveryPlans,
  findRasterQuantityLabels,
  readQuantityOcr,
  rejectTinyOutlierCandidates,
  type QuantityCandidate,
} from "@bag-it/raster-quantity-labels"
import { createBackgroundModel, createFlatBackgroundModel } from "../background-model"
import { extractCalloutPartsForPage, suppressDuplicateOwnedPartRows } from "../extractor"
import { applyDuplicatePartImageTransfers, resolveDuplicateOwnedPartRows } from "../part-duplicate-owners"
import { scrubPartImageBackground } from "../part-image-background-scrub"
import { unionRegions } from "../regions"
import { clipScaledPartImageByDiagnostics, extractCalloutPartsForScaledPage } from "../scaled-extractor"
import { fillTopGapBridgeSupport } from "../part-support-top"
import { createPartImageForLabel } from "../part-foreground"
import { createPartImage } from "../part-image"
import type { CalloutPartCalloutInput, CalloutPartItem, CalloutQuantityLabel, Region } from "../contracts"
import {
  TEST_BLACK,
  TEST_BLUE_PANEL,
  TEST_GRAY_PART,
  TEST_LOW_CONTRAST_PART,
  createSyntheticPage,
  paintBorder,
  paintRasterGlyph,
  paintRasterQuantityLabel,
  paintRegion,
  scaleGlyph,
} from "./synthetic-page"

const CALLOUT_REGION = { height: 62, width: 122, x: 12, y: 10 }
const TEST_LIGHT_PART = { b: 210, g: 210, r: 210 }
const TEST_LIGHT_FILL_VARIATION = { b: 232, g: 232, r: 220 }
const TEST_BROWN_PART = { b: 26, g: 68, r: 120 }
const TEST_GREEN_PART = { b: 42, g: 122, r: 35 }

describe("callout part extractor", () => {
  it("reads exact one- and multi-digit quantity labels", () => {
    const labels = ["1x", "2x", "3x", "4x", "5x", "6x", "8x", "10x", "12x"]
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      labels.forEach((label, index) => {
        const x = 18 + (index % 3) * 38
        const y = 26 + Math.floor(index / 3) * 18
        paintRegion(data, { height: 6, width: 10, x: x + 2, y: y - 8 }, TEST_GRAY_PART)
        paintRasterQuantityLabel(data, label, x, y)
      })
    })

    expect(extractTexts(page)).toEqual(labels)
  })

  it("reads dense open four glyphs before closed-loop template fallback", () => {
    const digit = createGlyphFromPattern(DENSE_OPEN_FOUR, 0, 0)
    const x = createGlyphFromPattern(SMALL_X, 9, 3)
    const read = readQuantityOcr(createSyntheticPage(), [digit, x])

    expect(read?.text).toBe("4x")
  })

  it("reads dense nine glyphs before closed-loop template fallback", () => {
    const digit = createGlyphFromPattern(DENSE_NINE, 0, 0)
    const x = createGlyphFromPattern(SMALL_X, 9, 3)
    const read = readQuantityOcr(createSyntheticPage(), [digit, x])

    expect(read?.text).toBe("9x")
  })

  it("reads dense five glyphs before closed-loop six or nine fallback", () => {
    const digit = createGlyphFromPattern(DENSE_FIVE, 0, 0)
    const x = createGlyphFromPattern(SMALL_X, 9, 3)
    const read = readQuantityOcr(createSyntheticPage(), [digit, x])

    expect(read?.text).toBe("5x")
  })

  it("reads open-left three glyphs before closed-loop eight fallback", () => {
    const digit = createGlyphFromPattern(OPEN_LEFT_THREE, 0, 0)
    const x = createGlyphFromPattern(DENSE_X, 12, 4)
    const read = readQuantityOcr(createSyntheticPage(), [digit, x])

    expect(read?.text).toBe("3x")
  })

  it("reads open-bottom four glyphs before closed-loop eight fallback", () => {
    const digit = createGlyphFromPattern(OPEN_BOTTOM_FOUR_WITH_ROUND_RESIDUE, 0, 0)
    const x = createGlyphFromPattern(DENSE_X, 12, 4)
    const read = readQuantityOcr(createSyntheticPage(), [digit, x])

    expect(read?.text).toBe("4x")
  })

  it("reads a two glyph even when a crossing part stroke contaminates the source pixels", () => {
    const digit = createGlyphFromPattern(CROSSED_TWO, 0, 0)
    const x = createGlyphFromPattern(TALL_DENSE_X, 25, 9)
    const read = readQuantityOcr(createSyntheticPage(), [digit, x])

    expect(read?.text).toBe("2x")
  })

  it("reads diagonal seven glyphs before source two fallback", () => {
    const digit = createGlyphFromPattern(DIAGONAL_SEVEN, 0, 0)
    const x = createGlyphFromPattern(DENSE_X, 12, 4)
    const read = readQuantityOcr(createSyntheticPage(), [digit, x])

    expect(read?.text).toBe("7x")
  })

  it("reads high-scale diagonal seven glyphs before source two fallback", () => {
    const digit = createGlyphFromPattern(HIGH_SCALE_SEVEN, 0, 0)
    const x = createGlyphFromPattern(HIGH_SCALE_X, 13, 4)
    const read = readQuantityOcr(createSyntheticPage(), [digit, x])

    expect(read?.text).toBe("7x")
  })

  it("reads narrow high-scale diagonal seven glyphs before source two fallback", () => {
    const digit = createGlyphFromPattern(NARROW_HIGH_SCALE_SEVEN, 0, 0)
    const x = createGlyphFromPattern(HIGH_SCALE_X, 13, 4)
    const read = readQuantityOcr(createSyntheticPage(), [digit, x])

    expect(read?.text).toBe("7x")
  })

  it("reads wide printed five glyphs with lower-left antialias residue", () => {
    const digit = createGlyphFromPattern(WIDE_PRINTED_FIVE, 0, 0)
    const x = createGlyphFromPattern(WIDE_PRINTED_X, 18, 6)
    const read = readQuantityOcr(createSyntheticPage(), [digit, x])

    expect(read?.text).toBe("5x")
  })

  it("reads connected closed eight labels before source nine fallback", () => {
    const glyph = createGlyphFromPattern(CONNECTED_EIGHT_X, 0, 0)
    const read = readQuantityOcr(createSyntheticPage(), [glyph])

    expect(read?.text).toBe("8x")
  })

  it("reads high-scale closed eight labels before source nine fallback", () => {
    const digit = createGlyphFromPattern(HIGH_SCALE_CLOSED_EIGHT, 0, 0)
    const x = createGlyphFromPattern(HIGH_SCALE_X, 22, 8)
    const read = readQuantityOcr(createSyntheticPage(), [digit, x])

    expect(read?.text).toBe("8x")
  })

  it("keeps high-scale lower-left gap nine labels out of the closed-eight rule", () => {
    const digit = createGlyphFromPattern(HIGH_SCALE_NINE_WITH_LOWER_LEFT_GAP, 0, 0)
    const x = createGlyphFromPattern(HIGH_SCALE_NINE_X, 23, 9)
    const read = readQuantityOcr(createSyntheticPage(), [digit, x])

    expect(read?.text).toBe("9x")
  })

  it("reads dense six glyphs before source nine fallback", () => {
    const digit = createGlyphFromPattern(DENSE_SIX, 0, 0)
    const x = createGlyphFromPattern(DENSE_X, 8, 3)
    const read = readQuantityOcr(createSyntheticPage(), [digit, x])

    expect(read?.text).toBe("6x")
  })

  it("creates a glyph component for large connected foreground without spreading pixels", () => {
    const pixels = Array.from({ length: 160_000 }, (_, index) => ({
      x: 10 + (index % 400),
      y: 20 + Math.floor(index / 400),
    }))

    expect(createGlyphFromPixels(pixels)?.region).toEqual({
      height: 400,
      width: 400,
      x: 10,
      y: 20,
    })
  })

  it("unions many foreground regions without spreading", () => {
    const regions = Array.from({ length: 160_000 }, (_, index) => ({
      height: 1,
      width: 1,
      x: index % 400,
      y: Math.floor(index / 400),
    }))

    expect(unionRegions(regions)).toEqual({
      height: 400,
      width: 400,
      x: 0,
      y: 0,
    })
  })

  it("rejects fake labels from part-shaped marks when real baseline labels exist", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRasterGlyph(data, scaleGlyph(PART_TOP_FRAGMENT, 2), 18, 22)
      paintRegion(data, { height: 8, width: 10, x: 58, y: 34 }, TEST_GRAY_PART)
      paintRegion(data, { height: 8, width: 10, x: 88, y: 34 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 58, 52)
      paintRasterQuantityLabel(data, "6x", 88, 52)
    })

    expect(extractTexts(page)).toEqual(["1x", "6x"])
  })

  it("rejects close raised quantity-shaped part art above a real label row", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRasterGlyph(data, scaleGlyph(RAISED_FALSE_SIX, 2), 18, 23)
      paintRasterGlyph(data, scaleGlyph(RAISED_FALSE_X, 2), 32, 27)
      paintRegion(data, { height: 8, width: 10, x: 24, y: 28 }, TEST_GRAY_PART)
      paintRegion(data, { height: 8, width: 10, x: 56, y: 28 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 24, 38)
      paintRasterQuantityLabel(data, "2x", 56, 38)
    })

    expect(extractTexts(page)).toEqual(["1x", "2x"])
  })

  it("rejects compact quantity-shaped art embedded in a larger part", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 16, width: 30, x: 22, y: 28 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "4x", 27, 28)
      paintRegion(data, { height: 8, width: 12, x: 82, y: 32 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 84, 48)
    })

    expect(extractTexts(page)).toEqual(["1x"])
  })

  it("rejects compact stud-like part details that read as high-value quantities", () => {
    const callout = { height: 150, width: 150, x: 12, y: 10 }
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, callout, TEST_BLACK)
      paintLargeRegion(data, width, { height: 12, width: 16, x: 34, y: 32 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 12, width: 16, x: 72, y: 32 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 12, width: 16, x: 110, y: 32 }, TEST_GRAY_PART)
      paintLargeRasterQuantityLabel(data, width, "1x", 34, 58)
      paintLargeRasterQuantityLabel(data, width, "2x", 72, 58)
      paintLargeRasterQuantityLabel(data, width, "1x", 110, 58)
      paintLargeRegion(data, width, { height: 28, width: 36, x: 42, y: 86 }, TEST_GRAY_PART)
      paintLargeRasterQuantityLabel(data, width, "4x", 48, 92)
      paintLargeRasterQuantityLabel(data, width, "1x", 44, 126)
    })
    const items = extractCalloutPartsForPage({
      callouts: [{ background: TEST_BLUE_PANEL, id: "stud-art", pageNumber: 1, region: callout }],
      page,
    }).items

    expect(items.map((item) => item.quantityLabel.text)).toEqual(["1x", "2x", "1x", "1x"])
  })

  it("rejects same-row compact part art that reads as a high quantity", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRasterGlyph(data, scaleGlyph(PART_TOP_FRAGMENT, 2), 26, 27)
      paintRasterGlyph(data, scaleGlyph(RAISED_FALSE_X, 2), 45, 31)
      paintRegion(data, { height: 10, width: 14, x: 24, y: 28 }, TEST_GRAY_PART)
      paintRegion(data, { height: 10, width: 14, x: 70, y: 28 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 26, 48)
      paintRasterQuantityLabel(data, "4x", 72, 48)
    })

    expect(extractTexts(page)).toEqual(["1x", "4x"])
  })

  it("keeps sparse high-value printed labels paired with lower-offset same-row labels", () => {
    const callout = { height: 190, width: 86, x: 12, y: 10 }
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, callout, TEST_BLACK)
      paintLargeRegion(data, width, { height: 20, width: 22, x: 22, y: 30 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 20, width: 22, x: 52, y: 30 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 26, width: 24, x: 22, y: 88 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 26, width: 24, x: 58, y: 92 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 26, width: 24, x: 22, y: 150 }, TEST_GRAY_PART)
      paintLargeRasterQuantityLabel(data, width, "4x", 22, 58)
      paintLargeRasterQuantityLabel(data, width, "1x", 52, 58)
      paintLargeRasterQuantityLabel(data, width, "4x", 22, 118)
      paintLargeRasterQuantityLabel(data, width, "1x", 58, 122)
      paintLargeRasterQuantityLabel(data, width, "1x", 22, 176)
    })

    const items = extractCalloutPartsForPage({
      callouts: [{ background: TEST_BLUE_PANEL, id: "offset-sparse-high-value", pageNumber: 1, region: callout }],
      page,
    }).items

    expect(items.map((item) => item.quantityLabel.text))
      .toEqual(expect.arrayContaining(["4x", "4x"]))
  })

  it("drops a duplicate owner row when a fake label selects an already-owned part", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 12, width: 18, x: 26, y: 28 }, TEST_GRAY_PART)
      paintRegion(data, { height: 12, width: 18, x: 70, y: 28 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 28, 48)
      paintRasterQuantityLabel(data, "4x", 72, 48)
      paintRasterQuantityLabel(data, "8x", 74, 31)
    })
    const items = extractItems(page)

    expect(items.map((item) => item.quantityLabel.text)).toEqual(["1x", "4x"])
    expect(readOpaquePixelsInRegion(items[0], { height: 12, width: 18, x: 70, y: 28 })).toBe(0)
    expect(readOpaquePixelsInRegion(items[1], { height: 12, width: 18, x: 70, y: 28 })).toBeGreaterThan(0)
  })

  it("drops a near-row duplicate owner even when the fake label is not high value", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 12, width: 20, x: 52, y: 30 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "2x", 54, 31)
      paintRasterQuantityLabel(data, "1x", 56, 50)
    })
    const items = extractItems(page)

    expect(items.map((item) => item.quantityLabel.text)).toEqual(["1x"])
    expect(readOpaquePixelsInRegion(items[0], { height: 12, width: 20, x: 52, y: 30 })).toBeGreaterThan(0)
  })

  it("keeps rejected readable labels masked after duplicate-owner reruns", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 12, width: 20, x: 52, y: 44 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "2x", 54, 31)
      paintRasterQuantityLabel(data, "1x", 56, 64)
    })
    const items = extractItems(page)

    expect(items.map((item) => item.quantityLabel.text)).toEqual(["1x"])
    expect(readOpaquePixelsInRegion(items[0], { height: 12, width: 20, x: 52, y: 44 })).toBeGreaterThan(0)
    expect(readOpaquePixelsInRegion(items[0], { height: 13, width: 18, x: 54, y: 31 })).toBe(0)
  })

  it("drops isolated upper duplicates after scaled readability filtering removes their peers", () => {
    const sharedPart = { height: 47, width: 63, x: 264, y: 51 }
    const kept = suppressDuplicateOwnedPartRows([
      createDuplicateTestItem("2x", { height: 10, width: 13, x: 293, y: 65 }, sharedPart),
      createDuplicateTestItem("1x", { height: 11, width: 13, x: 174, y: 92 }, { height: 35, width: 36, x: 164, y: 63 }),
      createDuplicateTestItem("1x", { height: 11, width: 13, x: 202, y: 92 }, { height: 39, width: 48, x: 188, y: 59 }),
      createDuplicateTestItem("1x", { height: 11, width: 13, x: 236, y: 92 }, { height: 43, width: 56, x: 220, y: 55 }),
      createDuplicateTestItem("1x", { height: 11, width: 13, x: 278, y: 92 }, sharedPart),
    ])

    expect(kept.map((item) => item.quantityLabel.region)).toEqual([
      { height: 11, width: 13, x: 174, y: 92 },
      { height: 11, width: 13, x: 202, y: 92 },
      { height: 11, width: 13, x: 236, y: 92 },
      { height: 11, width: 13, x: 278, y: 92 },
    ])
  })

  it("drops upper part-art duplicates that select a lower printed-row part", () => {
    const lowerPart = { height: 99, width: 88, x: 625, y: 51 }
    const kept = suppressDuplicateOwnedPartRows([
      createDuplicateTestItem("1x", { height: 13, width: 17, x: 667, y: 66 }, { height: 93, width: 59, x: 653, y: 51 }),
      createDuplicateTestItem("1x", { height: 12, width: 17, x: 653, y: 73 }, { height: 83, width: 50, x: 625, y: 67 }),
      createDuplicateTestItem("1x", { height: 11, width: 16, x: 519, y: 146 }, { height: 55, width: 48, x: 511, y: 97 }),
      createDuplicateTestItem("1x", { height: 11, width: 14, x: 554, y: 146 }, { height: 71, width: 57, x: 534, y: 80 }),
      createDuplicateTestItem("1x", { height: 11, width: 15, x: 589, y: 146 }, { height: 73, width: 68, x: 570, y: 80 }),
      createDuplicateTestItem("1x", { height: 11, width: 13, x: 639, y: 146 }, lowerPart),
    ])

    expect(kept.map((item) => item.quantityLabel.region.y)).toEqual([146, 146, 146, 146])
  })

  it("drops high-value upper same-crop duplicates above nearby printed baseline labels", () => {
    const sharedPart = { height: 32, width: 44, x: 76, y: 135 }
    const kept = suppressDuplicateOwnedPartRows([
      createDuplicateTestItem("4x", { height: 13, width: 16, x: 61, y: 146 }, sharedPart),
      createDuplicateTestItem("1x", { height: 11, width: 14, x: 60, y: 160 }, { height: 24, width: 35, x: 50, y: 140 }),
      createDuplicateTestItem("1x", { height: 11, width: 14, x: 88, y: 160 }, sharedPart),
      createDuplicateTestItem("1x", { height: 11, width: 14, x: 122, y: 160 }, { height: 33, width: 50, x: 110, y: 131 }),
    ])

    expect(kept.map((item) => item.quantityLabel.text)).toEqual(["1x", "1x", "1x"])
    expect(kept.map((item) => item.quantityLabel.region)).toEqual([
      { height: 11, width: 14, x: 60, y: 160 },
      { height: 11, width: 14, x: 88, y: 160 },
      { height: 11, width: 14, x: 122, y: 160 },
    ])
  })

  it("drops low-value near-empty part-art rows after crop extraction", () => {
    const realPart = { height: 26, width: 36, x: 84, y: 72 }
    const fakePart = { height: 34, width: 28, x: 88, y: 50 }
    const kept = suppressDuplicateOwnedPartRows([
      createDuplicateTestItem("1x", { height: 11, width: 14, x: 42, y: 70 }, { height: 22, width: 30, x: 36, y: 42 }),
      createDuplicateTestItem("2x", { height: 11, width: 15, x: 90, y: 76 }, fakePart, 0),
      createDuplicateTestItem("1x", { height: 11, width: 14, x: 92, y: 112 }, realPart),
    ])

    expect(kept.map((item) => item.quantityLabel.text)).toEqual(["1x", "1x"])
    expect(kept.map((item) => item.partImage.region)).toEqual([
      { height: 22, width: 30, x: 36, y: 42 },
      realPart,
    ])
  })

  it("drops embedded low-value part-art rows that split a lower printed part", () => {
    const largePart = { height: 72, width: 105, x: 135, y: 109 }
    const clippedLeftPart = { height: 31, width: 29, x: 130, y: 131 }
    const kept = suppressDuplicateOwnedPartRows([
      createDuplicateTestItem("2x", { height: 11, width: 15, x: 139, y: 94 }, { height: 33, width: 35, x: 130, y: 67 }),
      createDuplicateTestItem("2x", { height: 11, width: 15, x: 167, y: 94 }, { height: 37, width: 64, x: 152, y: 63 }),
      createDuplicateTestItem("1x", { height: 11, width: 14, x: 218, y: 94 }, { height: 46, width: 80, x: 204, y: 55 }),
      createDuplicateTestItem("1x", { height: 11, width: 15, x: 175, y: 173 }, largePart),
      createDuplicateTestItem("1x", { height: 11, width: 14, x: 140, y: 178 }, clippedLeftPart),
    ])

    expect(kept.map((item) => item.quantityLabel.region)).toEqual([
      { height: 11, width: 15, x: 139, y: 94 },
      { height: 11, width: 15, x: 167, y: 94 },
      { height: 11, width: 14, x: 218, y: 94 },
      { height: 11, width: 14, x: 140, y: 178 },
    ])
  })

  it("transfers a better embedded part-art crop to the kept lower printed label", () => {
    const fakePartArtCrop = { height: 42, width: 73, x: 56, y: 443 }
    const clippedPrintedCrop = { height: 27, width: 28, x: 50, y: 452 }
    const upperRows = [
      createDuplicateTestItem("1x", { height: 11, width: 14, x: 60, y: 424 }, { height: 27, width: 35, x: 50, y: 403 }),
      createDuplicateTestItem("1x", { height: 11, width: 14, x: 88, y: 424 }, { height: 40, width: 52, x: 75, y: 391 }),
      createDuplicateTestItem("1x", { height: 11, width: 14, x: 128, y: 424 }, { height: 46, width: 63, x: 114, y: 383 }),
    ]
    const fakePartArtLabel = createDuplicateTestItem("1x", { height: 11, width: 14, x: 95, y: 474 }, fakePartArtCrop)
    const keptPrintedLabel = createDuplicateTestItem("1x", { height: 11, width: 14, x: 60, y: 480 }, clippedPrintedCrop)
    const rightPrintedLabel = createDuplicateTestItem("1x", { height: 11, width: 14, x: 130, y: 498 }, { height: 67, width: 52, x: 116, y: 437 })
    const initialItems = [...upperRows, fakePartArtLabel, keptPrintedLabel, rightPrintedLabel]

    const resolution = resolveDuplicateOwnedPartRows(
      initialItems.map((item) => item.quantityLabel),
      initialItems,
    )
    const transferred = applyDuplicatePartImageTransfers([keptPrintedLabel], resolution.partImageTransfers)
    const postRecoveryResolution = resolveDuplicateOwnedPartRows(
      initialItems.map((item) => item.quantityLabel),
      [...upperRows, fakePartArtLabel, transferred[0], rightPrintedLabel],
      { allowTransferredEmbeddedPartMatch: true },
    )

    expect(resolution.keptItems).not.toContain(fakePartArtLabel)
    expect(transferred[0].partImage.region).toEqual(fakePartArtCrop)
    expect(transferred[0].quantityLabel.region).toEqual(keptPrintedLabel.quantityLabel.region)
    expect(postRecoveryResolution.keptItems).not.toContain(fakePartArtLabel)
  })

  it("drops a recovered embedded part-art row after the real label owns the transferred crop", () => {
    const upperRows = [
      createDuplicateTestItem("1x", { height: 11, width: 14, x: 60, y: 424 }, { height: 27, width: 35, x: 50, y: 403 }),
      createDuplicateTestItem("1x", { height: 11, width: 14, x: 88, y: 424 }, { height: 40, width: 52, x: 75, y: 391 }),
      createDuplicateTestItem("1x", { height: 11, width: 14, x: 128, y: 424 }, { height: 46, width: 63, x: 114, y: 383 }),
    ]
    const fakePartArtLabel = createDuplicateTestItem("1x", { height: 11, width: 14, x: 95, y: 474 }, { height: 42, width: 73, x: 56, y: 443 })
    const keptPrintedLabel = createDuplicateTestItem("1x", { height: 11, width: 14, x: 60, y: 480 }, { height: 42, width: 79, x: 50, y: 443 })
    const rightPrintedLabel = createDuplicateTestItem("1x", { height: 11, width: 14, x: 130, y: 498 }, { height: 67, width: 52, x: 116, y: 437 })
    const recoveredItems = [...upperRows, fakePartArtLabel, keptPrintedLabel, rightPrintedLabel]

    const resolution = resolveDuplicateOwnedPartRows(
      recoveredItems.map((item) => item.quantityLabel),
      recoveredItems,
      { allowTransferredEmbeddedPartMatch: true },
    )

    expect(resolution.keptItems).not.toContain(fakePartArtLabel)
    expect(resolution.keptItems.map((item) => item.quantityLabel.region)).toEqual([
      { height: 11, width: 14, x: 60, y: 424 },
      { height: 11, width: 14, x: 88, y: 424 },
      { height: 11, width: 14, x: 128, y: 424 },
      { height: 11, width: 14, x: 60, y: 480 },
      { height: 11, width: 14, x: 130, y: 498 },
    ])
  })

  it("keeps the printed upper row when lower part art steals its crop", () => {
    const upperPart = { height: 30, width: 35, x: 667, y: 52 }
    const lowerPartArt = { height: 20, width: 27, x: 670, y: 62 }
    const kept = suppressDuplicateOwnedPartRows([
      createDuplicateTestItem("6x", { height: 11, width: 15, x: 676, y: 74 }, upperPart),
      createDuplicateTestItem("2x", { height: 11, width: 15, x: 704, y: 74 }, { height: 24, width: 39, x: 692, y: 56 }),
      createDuplicateTestItem("7x", { height: 11, width: 15, x: 732, y: 74 }, { height: 27, width: 40, x: 720, y: 54 }),
      createDuplicateTestItem("2x", { height: 11, width: 15, x: 760, y: 74 }, { height: 26, width: 37, x: 748, y: 56 }),
      createDuplicateTestItem("5x", { height: 13, width: 17, x: 677, y: 99 }, lowerPartArt),
      createDuplicateTestItem("3x", { height: 11, width: 14, x: 676, y: 112 }, { height: 25, width: 34, x: 667, y: 92 }),
      createDuplicateTestItem("4x", { height: 11, width: 15, x: 703, y: 112 }, { height: 26, width: 38, x: 692, y: 92 }),
    ])

    expect(kept.map((item) => item.quantityLabel.text)).toEqual(["6x", "2x", "7x", "2x", "3x", "4x"])
  })

  it("keeps low-value rows with visible extracted crops", () => {
    const visiblePart = { height: 18, width: 24, x: 42, y: 72 }
    const kept = suppressDuplicateOwnedPartRows([
      createDuplicateTestItem("2x", { height: 11, width: 15, x: 42, y: 94 }, visiblePart),
      createDuplicateTestItem("1x", { height: 11, width: 14, x: 84, y: 94 }, { height: 18, width: 24, x: 84, y: 72 }),
      createDuplicateTestItem("1x", { height: 11, width: 14, x: 42, y: 132 }, { height: 20, width: 30, x: 42, y: 108 }),
    ])

    expect(kept.map((item) => item.quantityLabel.text)).toEqual(["2x", "1x", "1x"])
  })

  it("keeps tiny high-value labels on the bottom printed row", () => {
    const candidates = [
      createQuantityCandidate("7x", 424, 82, 15, 12),
      createQuantityCandidate("7x", 452, 82, 15, 12),
      createQuantityCandidate("1x", 495, 82, 14, 12),
      createQuantityCandidate("6x", 424, 128, 15, 8),
    ]

    expect(rejectTinyOutlierCandidates(candidates).map((candidate) => candidate.text)).toEqual([
      "7x",
      "7x",
      "1x",
      "6x",
    ])
  })

  it("keeps low-value printed same-row labels in sparse two-row callouts", () => {
    const callout = { height: 112, width: 124, x: 12, y: 10 }
    const lowerPart = { height: 12, width: 20, x: 34, y: 72 }
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, callout, TEST_BLACK)
      paintLargeRegion(data, width, { height: 9, width: 12, x: 34, y: 32 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 9, width: 18, x: 62, y: 32 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 12, width: 18, x: 92, y: 29 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, lowerPart, TEST_GRAY_PART)
      paintLargeRasterQuantityLabel(data, width, "2x", 34, 50)
      paintLargeRasterQuantityLabel(data, width, "3x", 62, 50)
      paintLargeRasterQuantityLabel(data, width, "1x", 94, 50)
      paintLargeRasterQuantityLabel(data, width, "1x", 34, 90)
    })
    const items = extractCalloutPartsForPage({
      callouts: [{ background: TEST_BLUE_PANEL, id: "sparse-low-value-row", pageNumber: 1, region: callout }],
      page,
    }).items

    expect(items.map((item) => item.quantityLabel.text)).toEqual(["2x", "3x", "1x", "1x"])
    expect(readOpaquePixelsInRegion(items[3], lowerPart)).toBeGreaterThan(0)
    expect(readOpaquePixelsInRegion(items[3], { height: 13, width: 18, x: 34, y: 50 })).toBe(0)
  })

  it("keeps a printed same-row label touching its compact part", () => {
    const callout = { height: 112, width: 124, x: 12, y: 10 }
    const topLeftPart = { height: 16, width: 14, x: 34, y: 34 }
    const lowerPart = { height: 12, width: 20, x: 34, y: 72 }
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, callout, TEST_BLACK)
      paintLargeRegion(data, width, topLeftPart, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 9, width: 18, x: 62, y: 32 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 12, width: 18, x: 92, y: 29 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, lowerPart, TEST_GRAY_PART)
      paintLargeRasterQuantityLabel(data, width, "2x", 34, 50)
      paintLargeRasterQuantityLabel(data, width, "3x", 62, 50)
      paintLargeRasterQuantityLabel(data, width, "1x", 94, 50)
      paintLargeRasterQuantityLabel(data, width, "1x", 34, 90)
    })
    const items = extractCalloutPartsForPage({
      callouts: [{ background: TEST_BLUE_PANEL, id: "touching-same-row-label", pageNumber: 1, region: callout }],
      page,
    }).items

    expect(items.map((item) => item.quantityLabel.text)).toEqual(["2x", "3x", "1x", "1x"])
    expect(readOpaquePixelsInRegion(items[0], topLeftPart)).toBeGreaterThan(0)
    expect(readOpaquePixelsInRegion(items[3], topLeftPart)).toBe(0)
    expect(readOpaquePixelsInRegion(items[3], { height: 13, width: 18, x: 34, y: 50 })).toBe(0)
  })

  it("rejects raised oversized two-shaped part art above real baseline labels", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRasterGlyph(data, scaleGlyph(CONNECTED_TWO_X, 3), 26, 22)
      paintRegion(data, { height: 8, width: 12, x: 30, y: 34 }, TEST_GRAY_PART)
      paintRegion(data, { height: 8, width: 12, x: 76, y: 34 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 31, 52)
      paintRasterQuantityLabel(data, "2x", 77, 52)
    })

    expect(extractTexts(page)).toEqual(["1x", "2x"])
  })

  it("keeps lone compact high-value quantity labels with visible small parts", () => {
    for (const label of ["4x", "6x", "9x", "12x"]) {
      const page = createSyntheticPage((data) => {
        paintCallout(data)
        paintRegion(data, { height: 6, width: 8, x: 54, y: 28 }, TEST_GRAY_PART)
        paintRasterQuantityLabel(data, label, 52, 44)
      })
      const items = extractItems(page)

      expect(items.map((item) => item.quantityLabel.text), label).toEqual([label])
      expect(readOpaquePixelsInRegion(items[0], { height: 6, width: 8, x: 54, y: 28 }), label).toBeGreaterThan(0)
    }
  })

  it("keeps dense same-row crops from borrowing separated neighbor parts", () => {
    const callout = { height: 210, width: 190, x: 12, y: 10 }
    const leftPart = { height: 14, width: 26, x: 36, y: 48 }
    const rightPart = { height: 14, width: 22, x: 76, y: 48 }
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, callout, TEST_BLACK)
      paintLargeRegion(data, width, leftPart, TEST_GRAY_PART)
      paintLargeRegion(data, width, rightPart, TEST_GRAY_PART)

      const labels = [
        ["1x", 40, 70],
        ["2x", 80, 70],
        ["3x", 124, 70],
        ["1x", 40, 120],
        ["2x", 80, 120],
        ["3x", 124, 120],
        ["1x", 40, 168],
        ["2x", 80, 168],
        ["3x", 124, 168],
        ["1x", 158, 168],
      ] as const

      for (const [text, x, y] of labels) {
        paintLargeRegion(data, width, { height: 12, width: 18, x: x - 2, y: y - 18 }, TEST_GRAY_PART)
        paintLargeRasterQuantityLabel(data, width, text, x, y)
      }
    })
    const items = extractCalloutPartsForPage({
      callouts: [{ background: TEST_BLUE_PANEL, id: "dense-neighbor", pageNumber: 1, region: callout }],
      page,
    }).items

    expect(items).toHaveLength(10)
    expect(readOpaquePixelsInRegion(items[0], rightPart)).toBe(0)
    expect(readOpaquePixelsInRegion(items[1], leftPart)).toBe(0)
  })

  it("keeps weak top pixels on wide shallow parts in dense callouts", () => {
    const callout = { height: 210, width: 190, x: 12, y: 10 }
    const weakTop = { height: 10, width: 46, x: 82, y: 110 }
    const strongBase = { height: 16, width: 50, x: 76, y: 132 }
    const backgroundLikeTop = { b: 247, g: 221, r: 192 }
    const labels = [
      createTestQuantityLabel("1x", 34, 56),
      createTestQuantityLabel("2x", 72, 56),
      createTestQuantityLabel("3x", 110, 56),
      createTestQuantityLabel("1x", 148, 56),
      createTestQuantityLabel("1x", 34, 108),
      createTestQuantityLabel("2x", 148, 108),
      createTestQuantityLabel("4x", 90, 158),
      createTestQuantityLabel("1x", 34, 188),
      createTestQuantityLabel("2x", 92, 188),
      createTestQuantityLabel("3x", 150, 188),
    ]
    const targetLabel = labels[6]
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, callout, TEST_BLACK)
      paintLargeRegion(data, width, weakTop, backgroundLikeTop)
      paintLargeRegion(data, width, strongBase, TEST_GRAY_PART)

      for (const label of labels) {
        paintLargeRegion(data, width, {
          height: 10,
          width: 14,
          x: label.region.x - 2,
          y: label.region.y - 24,
        }, TEST_GRAY_PART)
        paintLargeRasterQuantityLabel(data, width, label.text, label.region.x, label.region.y)
      }
    })
    const item = createPartImageForLabel(
      page,
      { background: TEST_BLUE_PANEL, id: "dense-top-support", pageNumber: 1, region: callout },
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      labels,
      labels,
      targetLabel,
    )

    expect(item).toBeDefined()
    expect(readMaskAlpha(item!.alphaMask, { x: 108, y: 113 }, item!.region)).toBe(255)
  })

  it("keeps near-background body pixels on wide shallow parts in dense callouts", () => {
    const callout = { height: 210, width: 190, x: 12, y: 10 }
    const topFace = { height: 12, width: 46, x: 82, y: 110 }
    const bodyFace = { height: 18, width: 62, x: 74, y: 122 }
    const outline = { height: 3, width: 58, x: 78, y: 128 }
    const backgroundLikeBody = { b: 248, g: 224, r: 192 }
    const labels = [
      createTestQuantityLabel("1x", 34, 56),
      createTestQuantityLabel("2x", 72, 56),
      createTestQuantityLabel("3x", 110, 56),
      createTestQuantityLabel("1x", 148, 56),
      createTestQuantityLabel("1x", 34, 108),
      createTestQuantityLabel("2x", 148, 108),
      createTestQuantityLabel("4x", 90, 158),
      createTestQuantityLabel("1x", 34, 188),
      createTestQuantityLabel("2x", 92, 188),
      createTestQuantityLabel("3x", 150, 188),
    ]
    const targetLabel = labels[6]
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, callout, TEST_BLACK)
      paintLargeRegion(data, width, bodyFace, backgroundLikeBody)
      paintLargeRegion(data, width, topFace, TEST_GRAY_PART)
      paintLargeRegion(data, width, outline, TEST_GRAY_PART)

      for (const label of labels) {
        paintLargeRegion(data, width, {
          height: 10,
          width: 14,
          x: label.region.x - 2,
          y: label.region.y - 24,
        }, TEST_GRAY_PART)
        paintLargeRasterQuantityLabel(data, width, label.text, label.region.x, label.region.y)
      }
    })
    const item = createPartImageForLabel(
      page,
      { background: TEST_BLUE_PANEL, id: "dense-wide-body-support", pageNumber: 1, region: callout },
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      labels,
      labels,
      targetLabel,
    )

    expect(item).toBeDefined()
    expect(readMaskAlpha(item!.alphaMask, { x: 96, y: 135 }, item!.region)).toBe(255)
    expect(readMaskAlpha(item!.alphaMask, { x: targetLabel.region.x + 2, y: targetLabel.region.y + 2 }, item!.region)).toBe(0)
  })

  it("trims connected build art below dense quantity labels", () => {
    const callout = { height: 210, width: 190, x: 12, y: 10 }
    const realPart = { height: 12, width: 70, x: 78, y: 48 }
    const connector = { height: 28, width: 4, x: 138, y: 60 }
    const lowerBuildArt = { height: 24, width: 72, x: 126, y: 91 }
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, callout, TEST_BLACK)
      paintLargeRegion(data, width, realPart, TEST_BROWN_PART)
      paintLargeRegion(data, width, connector, TEST_BROWN_PART)
      paintLargeRegion(data, width, lowerBuildArt, TEST_GREEN_PART)

      const labels = [
        ["1x", 38, 70],
        ["2x", 82, 70],
        ["3x", 126, 70],
        ["1x", 160, 70],
        ["1x", 38, 120],
        ["2x", 82, 120],
        ["3x", 126, 120],
        ["1x", 160, 120],
        ["1x", 38, 168],
        ["2x", 82, 168],
      ] as const

      for (const [text, x, y] of labels) {
        paintLargeRegion(data, width, { height: 10, width: 14, x: x - 2, y: y - 22 }, TEST_GRAY_PART)
        paintLargeRasterQuantityLabel(data, width, text, x, y)
      }
    })
    const items = extractCalloutPartsForPage({
      callouts: [{ background: TEST_BLUE_PANEL, id: "dense-connected-build", pageNumber: 1, region: callout }],
      page,
    }).items

    expect(items).toHaveLength(10)
    expect(readOpaquePixelsInRegion(items[2], realPart)).toBeGreaterThan(0)
    expect(readOpaquePixelsInRegion(items[2], lowerBuildArt)).toBe(0)
  })

  it("keeps readable top-row labels in large dense callouts", () => {
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)

      const labels = [
        ["1x", 34, 46],
        ["2x", 68, 46],
        ["3x", 102, 46],
        ["4x", 136, 46],
        ["1x", 34, 104],
        ["2x", 68, 104],
        ["3x", 102, 104],
        ["4x", 136, 104],
        ["1x", 34, 164],
        ["2x", 68, 164],
        ["3x", 102, 164],
        ["4x", 136, 164],
      ] as const

      for (const [text, x, y] of labels) {
        paintLargeRegion(data, width, { height: 10, width: 14, x: x - 2, y: y - 22 }, TEST_GRAY_PART)
        paintLargeRasterQuantityLabel(data, width, text, x, y)
      }
    })
    const items = extractCalloutPartsForPage({
      callouts: [createLargeCallout()],
      page,
    }).items

    expect(items.map((item) => item.quantityLabel.region.y)).toContain(46)
    expect(items.map((item) => item.quantityLabel.text)).toEqual([
      "1x",
      "2x",
      "3x",
      "4x",
      "1x",
      "2x",
      "3x",
      "4x",
      "1x",
      "2x",
      "3x",
      "4x",
    ])
  })

  it("scopes lower-threshold recovery candidates to the target row band", () => {
    const candidates = [46, 104, 164].flatMap((y) =>
      Array.from({ length: 8 }, (_, index) =>
        createQuantityCandidate(`${(index % 4) + 1}x`, 24 + index * 22, y, 12),
      ),
    )
    const largeDensePlan = createQuantityRecoveryPlans(candidates, LARGE_CALLOUT_REGION)
      .find((plan) => plan.kind === "large-dense-top")

    expect(largeDensePlan?.targetBand).toEqual({
      height: 39,
      width: LARGE_CALLOUT_REGION.width,
      x: LARGE_CALLOUT_REGION.x,
      y: 32,
    })
    expect(isCandidateCenterInBand(createQuantityCandidate("1x", 30, 46, 12), largeDensePlan!.targetBand))
      .toBe(true)
    expect(isCandidateCenterInBand(createQuantityCandidate("1x", 30, 104, 12), largeDensePlan!.targetBand))
      .toBe(false)
  })

  it("recovers tall sparse top rows when first detected row sits near one-third down", () => {
    const callout = { height: 296, width: 130, x: 100, y: 100 }
    const candidates = [
      createQuantityCandidate("2x", 120, 195, 15, 10),
      createQuantityCandidate("1x", 170, 205, 14, 10),
      createQuantityCandidate("2x", 120, 275, 15, 10),
      createQuantityCandidate("1x", 120, 355, 14, 10),
    ]

    const tallSparsePlan = createQuantityRecoveryPlans(candidates, callout)
      .find((plan) => plan.kind === "tall-sparse-top")

    expect(tallSparsePlan?.targetBand).toEqual({
      height: 95,
      width: 130,
      x: 100,
      y: 100,
    })
  })

  it("keeps compact top-row labels in tall multirow callouts", () => {
    const callout = { height: 220, width: 160, x: 12, y: 10 }
    const labels = [
      ["1x", 34, 36],
      ["1x", 86, 36],
      ["1x", 138, 36],
      ["1x", 34, 88],
      ["1x", 86, 110],
      ["1x", 34, 132],
      ["1x", 86, 154],
      ["1x", 34, 176],
      ["1x", 86, 198],
      ["1x", 34, 220],
    ] as const
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, callout, TEST_BLACK)

      for (const [text, x, y] of labels) {
        paintLargeRegion(data, width, { height: 10, width: 14, x: x - 2, y: y - 22 }, TEST_GRAY_PART)
        paintLargeRasterQuantityLabel(data, width, text, x, y)
      }
    })
    const items = extractCalloutPartsForPage({
      callouts: [{ background: TEST_BLUE_PANEL, id: "tall-multirow", pageNumber: 1, region: callout }],
      page,
    }).items

    expect(items).toHaveLength(10)
    expect(items.slice(0, 3).map((item) => item.quantityLabel.region.y)).toEqual([36, 36, 36])
  })

  it("keeps tiny top-row labels in tall sparse callouts with lower rows", () => {
    const callout = { height: 210, width: 110, x: 12, y: 10 }
    const topParts = [
      { height: 8, width: 10, x: 28, y: 26 },
      { height: 8, width: 12, x: 58, y: 26 },
      { height: 10, width: 12, x: 88, y: 24 },
    ]
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, callout, TEST_BLACK)

      for (const part of topParts) {
        paintLargeRegion(data, width, part, TEST_GRAY_PART)
      }

      paintLargeRegion(data, width, { height: 12, width: 72, x: 28, y: 78 }, TEST_BROWN_PART)
      paintLargeRegion(data, width, { height: 12, width: 72, x: 28, y: 144 }, TEST_BROWN_PART)

      paintLargeRasterQuantityLabel(data, width, "2x", 26, 36)
      paintLargeRasterQuantityLabel(data, width, "2x", 56, 36)
      paintLargeRasterQuantityLabel(data, width, "1x", 86, 36)
      paintLargeRasterQuantityLabel(data, width, "2x", 28, 112)
      paintLargeRasterQuantityLabel(data, width, "2x", 28, 178)
    })
    const items = extractCalloutPartsForPage({
      callouts: [{ background: TEST_BLUE_PANEL, id: "tall-sparse-top", pageNumber: 1, region: callout }],
      page,
    }).items

    expect(items.map((item) => item.quantityLabel.text)).toEqual(["2x", "2x", "1x", "2x", "2x"])
    expect(items.slice(0, 3).map((item) => item.quantityLabel.region.y)).toEqual([36, 36, 36])
    expect(readOpaquePixelsInRegion(items[0], topParts[0])).toBeGreaterThan(0)
    expect(readOpaquePixelsInRegion(items[1], topParts[1])).toBeGreaterThan(0)
    expect(readOpaquePixelsInRegion(items[2], topParts[2])).toBeGreaterThan(0)
  })

  it("recovers lower labels fused with outside step-number text", () => {
    const callout = { height: 136, width: 102, x: 12, y: 10 }
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, callout, TEST_BLACK)
      paintLargeRegion(data, width, { height: 12, width: 38, x: 28, y: 26 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 12, width: 16, x: 78, y: 26 }, TEST_GRAY_PART)
      paintLargeScaledRasterQuantityLabel(data, width, "1x", 30, 54, 2)
      paintLargeScaledRasterQuantityLabel(data, width, "2x", 76, 54, 2)
      paintLargeRegion(data, width, { height: 14, width: 44, x: 28, y: 86 }, TEST_GRAY_PART)
      paintLargeScaledRasterQuantityLabel(data, width, "1x", 30, 112, 2)
      paintLargeRegion(data, width, { height: 26, width: 5, x: 22, y: 126 }, TEST_BLACK)
      paintLargeRegion(data, width, { height: 5, width: 26, x: 22, y: 126 }, TEST_BLACK)
      paintLargeRegion(data, width, { height: 16, width: 5, x: 43, y: 132 }, TEST_BLACK)
      paintLargeRegion(data, width, { height: 5, width: 26, x: 22, y: 146 }, TEST_BLACK)
    })

    const labels = findRasterQuantityLabels(page, callout, TEST_BLUE_PANEL)

    expect(labels.map((label) => label.text)).toEqual(["1x", "2x", "1x"])
  })

  it("keeps lower connected-cap labels through scaled extraction", () => {
    const callout = { height: 136, width: 102, x: 12, y: 10 }
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, callout, TEST_BLACK)
      paintLargeRegion(data, width, { height: 12, width: 38, x: 28, y: 26 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 12, width: 16, x: 78, y: 26 }, TEST_GRAY_PART)
      paintLargeScaledRasterQuantityLabel(data, width, "1x", 30, 54, 2)
      paintLargeScaledRasterQuantityLabel(data, width, "2x", 76, 54, 2)
      paintLargeRegion(data, width, { height: 14, width: 44, x: 28, y: 86 }, TEST_GRAY_PART)
      paintLargeScaledRasterQuantityLabel(data, width, "1x", 30, 112, 2)
      paintLargeRegion(data, width, { height: 26, width: 5, x: 22, y: 126 }, TEST_BLACK)
      paintLargeRegion(data, width, { height: 5, width: 26, x: 22, y: 126 }, TEST_BLACK)
      paintLargeRegion(data, width, { height: 16, width: 5, x: 43, y: 132 }, TEST_BLACK)
      paintLargeRegion(data, width, { height: 5, width: 26, x: 22, y: 146 }, TEST_BLACK)
    })

    const result = extractCalloutPartsForScaledPage({
      basePageBounds: { height: page.height / 2, width: page.width / 2 },
      callouts: [{
        background: TEST_BLUE_PANEL,
        id: "scaled-connected-cap",
        pageNumber: 1,
        region: {
          height: callout.height / 2,
          width: callout.width / 2,
          x: callout.x / 2,
          y: callout.y / 2,
        },
      }],
      page,
    })

    expect(result.items.map((item) => item.quantityLabel.text)).toEqual(["1x", "2x", "1x"])
    expect(result.items).toHaveLength(3)
    for (const item of result.items) {
      expect(countOpaqueMaskPixels(item.partImage.alphaMask.data)).toBeGreaterThan(0)
    }
  })

  it("keeps a lone visible compact row after scaled extraction downsizes the label", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 6, width: 8, x: 54, y: 28 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "4x", 52, 44)
    })
    const result = extractCalloutPartsForScaledPage({
      basePageBounds: { height: page.height / 2, width: page.width / 2 },
      callouts: [{
        ...createCallout(),
        region: {
          height: CALLOUT_REGION.height / 2,
          width: CALLOUT_REGION.width / 2,
          x: CALLOUT_REGION.x / 2,
          y: CALLOUT_REGION.y / 2,
        },
      }],
      page,
    })

    expect(result.items.map((item) => item.quantityLabel.text)).toEqual(["4x"])
    expect(result.items[0].quantityLabel.region.height).toBeLessThan(5)
    expect(countOpaqueMaskPixels(result.items[0].partImage.alphaMask.data)).toBeGreaterThan(0)
  })

  it("reads a quantity label beside nearby vertical part art", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 14, width: 3, x: 28, y: 32 }, TEST_BLACK)
      paintRasterQuantityLabel(data, "1x", 30, 46)
    })

    expect(extractTexts(page)).toEqual(["1x"])
  })

  it("ignores labels and foreground outside the callout", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 8, width: 10, x: 24, y: 28 }, TEST_GRAY_PART)
      paintRegion(data, { height: 8, width: 10, x: 142, y: 28 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 25, 44)
      paintRasterQuantityLabel(data, "2x", 140, 44)
    })

    expect(extractTexts(page)).toEqual(["1x"])
  })

  it("does not create rows without readable labels", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 8, width: 10, x: 24, y: 28 }, TEST_GRAY_PART)
    })

    const result = extractCalloutPartsForPage({
      callouts: [createCallout()],
      page,
    })

    expect(result.items).toEqual([])
    expect(result.failures).toMatchObject({
      "part-crop-missing": 0,
      "quantity-missing": 1,
    })
    expect(result.stageSnapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({
        counts: expect.objectContaining({ accepted: 0, rejected: 1, total: 1 }),
        failures: expect.objectContaining({ "quantity-missing": 1 }),
        stageId: "quantity-labels",
      }),
    ]))
  })

  it("reports accepted labels whose part crop cannot be created", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRasterQuantityLabel(data, "1x", 25, 44)
    })
    const result = extractCalloutPartsForPage({
      callouts: [createCallout()],
      page,
    })

    expect(result.items).toEqual([])
    expect(result.failures).toMatchObject({
      "part-crop-missing": 1,
      "quantity-missing": 0,
    })
    expect(result.stageSnapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({
        counts: expect.objectContaining({ accepted: 0, rejected: 1, total: 1 }),
        failures: expect.objectContaining({ "part-crop-missing": 1 }),
        stageId: "part-extraction",
      }),
    ]))
  })

  it("keeps long parts crossing a neighboring label midpoint without borrowing neighbor parts", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 8, width: 38, x: 24, y: 28 }, TEST_GRAY_PART)
      paintRegion(data, { height: 8, width: 10, x: 78, y: 28 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 28, 46)
      paintRasterQuantityLabel(data, "2x", 72, 46)
    })
    const items = extractItems(page)

    expect(items).toHaveLength(2)
    expect(items[0].partImage.region.x + items[0].partImage.region.width).toBeGreaterThanOrEqual(62)
    expect(readOpaquePixelsInRegion(items[1], { height: 8, width: 38, x: 24, y: 28 })).toBe(0)
  })

  it("keeps same-row parts that extend far left of their quantity label", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 9, width: 8, x: 20, y: 30 }, TEST_GRAY_PART)
      paintRegion(data, { height: 10, width: 50, x: 34, y: 29 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 20, 50)
      paintRasterQuantityLabel(data, "2x", 86, 50)
    })
    const items = extractItems(page)

    expect(items).toHaveLength(2)
    expect(items[1].partImage.region.x).toBeLessThanOrEqual(34)
    expect(items[1].partImage.region.x + items[1].partImage.region.width).toBeGreaterThanOrEqual(84)
  })

  it("keeps a long same-row part that extends far beyond its label zone", () => {
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, { height: 12, width: 126, x: 34, y: 64 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 12, width: 20, x: 168, y: 64 }, TEST_GRAY_PART)
      paintLargeRasterQuantityLabel(data, width, "1x", 38, 92)
      paintLargeRasterQuantityLabel(data, width, "1x", 172, 92)
    })
    const items = extractCalloutPartsForPage({
      callouts: [createLargeCallout()],
      page,
    }).items

    expect(items).toHaveLength(2)
    expect(items[0].partImage.region.x + items[0].partImage.region.width).toBeGreaterThanOrEqual(160)
    expect(readOpaquePixelsInRegion(items[1], { height: 12, width: 126, x: 34, y: 64 })).toBe(0)
  })

  it("keeps tight trailing fragments attached to a part even near the next label", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 9, width: 20, x: 58, y: 29 }, TEST_GRAY_PART)
      paintRegion(data, { height: 9, width: 5, x: 82, y: 29 }, TEST_GRAY_PART)
      paintRegion(data, { height: 9, width: 11, x: 98, y: 29 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 56, 46)
      paintRasterQuantityLabel(data, "2x", 88, 46)
    })
    const items = extractItems(page)

    expect(items).toHaveLength(2)
    expect(readOpaquePixelsInRegion(items[0], { height: 9, width: 5, x: 82, y: 29 })).toBeGreaterThan(0)
    expect(readOpaquePixelsInRegion(items[0], { height: 9, width: 11, x: 98, y: 29 })).toBe(0)
  })

  it("does not treat a tight side fragment as related when it belongs to the next same-row part", () => {
    const bridge = { height: 14, width: 3, x: 84, y: 26 }
    const nextPart = { height: 10, width: 24, x: 91, y: 28 }
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 9, width: 20, x: 58, y: 29 }, TEST_GRAY_PART)
      paintRegion(data, bridge, TEST_GRAY_PART)
      paintRegion(data, nextPart, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 56, 46)
      paintRasterQuantityLabel(data, "2x", 88, 46)
    })
    const items = extractItems(page)

    expect(items).toHaveLength(2)
    expect(readOpaquePixelsInRegion(items[0], bridge)).toBe(0)
    expect(readOpaquePixelsInRegion(items[0], nextPart)).toBe(0)
    expect(readOpaquePixelsInRegion(items[1], nextPart)).toBeGreaterThan(0)
  })

  it("does not borrow a full same-row neighbor as a tight continuation fragment", () => {
    const leftPart = { height: 28, width: 52, x: 42, y: 80 }
    const rightPart = { height: 28, width: 54, x: 100, y: 80 }
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, leftPart, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 1, width: 6, x: 94, y: 92 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, rightPart, TEST_GRAY_PART)
      paintLargeRasterQuantityLabel(data, width, "1x", 62, 122)
      paintLargeRasterQuantityLabel(data, width, "1x", 112, 134)
    })
    const items = extractCalloutPartsForPage({
      callouts: [createLargeCallout()],
      page,
    }).items

    expect(items).toHaveLength(2)
    expect(readOpaquePixelsInRegion(items[1], rightPart)).toBeGreaterThan(0)
    expect(readOpaquePixelsInRegion(items[1], leftPart)).toBe(0)
  })

  it("does not borrow a row-separated component that another label owns better", () => {
    const upperPart = { height: 28, width: 50, x: 84, y: 70 }
    const lowerPart = { height: 30, width: 70, x: 82, y: 118 }
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, upperPart, TEST_GRAY_PART)
      paintLargeRegion(data, width, lowerPart, TEST_GRAY_PART)
      paintLargeRasterQuantityLabel(data, width, "1x", 98, 106)
      paintLargeRasterQuantityLabel(data, width, "2x", 102, 152)
    })
    const items = extractCalloutPartsForPage({
      callouts: [createLargeCallout()],
      page,
    }).items

    expect(items.map((item) => item.quantityLabel.text)).toEqual(["1x", "2x"])
    expect(readOpaquePixelsInRegion(items[1], lowerPart)).toBeGreaterThan(0)
    expect(readOpaquePixelsInRegion(items[1], upperPart)).toBe(0)
  })

  it("keeps lower-row tall parts above their quantity label within the row band", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 8, width: 12, x: 26, y: 28 }, TEST_GRAY_PART)
      paintRegion(data, { height: 8, width: 14, x: 82, y: 52 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 26, 42)
      paintRasterQuantityLabel(data, "2x", 84, 62)
    })
    const items = extractItems(page)

    expect(items).toHaveLength(2)
    expect(items[1].partImage.region.y).toBeLessThanOrEqual(52)
    expect(items[1].partImage.region.y + items[1].partImage.region.height).toBeGreaterThanOrEqual(60)
  })

  it("keeps same-row tall parts that start far above their quantity label", () => {
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, { height: 112, width: 34, x: 140, y: 58 }, TEST_GRAY_PART)
      paintLargeRasterQuantityLabel(data, width, "1x", 146, 178)
    })
    const [item] = extractCalloutPartsForPage({
      callouts: [createLargeCallout()],
      page,
    }).items

    expect(item.partImage.region.y).toBeLessThanOrEqual(58)
    expect(item.partImage.region.y + item.partImage.region.height).toBeGreaterThanOrEqual(170)
  })

  it("keeps lower-row tall parts across the full owned row band", () => {
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, { height: 16, width: 24, x: 46, y: 42 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 20, width: 32, x: 60, y: 102 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 98, width: 28, x: 142, y: 66 }, TEST_GRAY_PART)
      paintLargeRasterQuantityLabel(data, width, "1x", 50, 62)
      paintLargeRasterQuantityLabel(data, width, "1x", 62, 128)
      paintLargeRasterQuantityLabel(data, width, "1x", 180, 140)
    })
    const items = extractCalloutPartsForPage({
      callouts: [createLargeCallout()],
      page,
    }).items

    expect(items).toHaveLength(3)
    expect(items[2].partImage.region.y).toBeLessThanOrEqual(66)
    expect(items[2].partImage.region.y + items[2].partImage.region.height).toBeGreaterThanOrEqual(164)
  })

  it("keeps tall lower-row parts that span above the previous label row", () => {
    const rowSpanningPart = { height: 108, width: 34, x: 142, y: 68 }
    const upperRowPart = { height: 22, width: 42, x: 52, y: 92 }
    const lowerRowPart = { height: 28, width: 70, x: 52, y: 152 }
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, upperRowPart, TEST_GRAY_PART)
      paintLargeRegion(data, width, lowerRowPart, TEST_GRAY_PART)
      paintLargeRegion(data, width, rowSpanningPart, TEST_GRAY_PART)
      paintLargeRasterQuantityLabel(data, width, "1x", 58, 122)
      paintLargeRasterQuantityLabel(data, width, "1x", 58, 188)
      paintLargeRasterQuantityLabel(data, width, "2x", 150, 188)
    })
    const items = extractCalloutPartsForPage({
      callouts: [createLargeCallout()],
      page,
    }).items

    expect(items).toHaveLength(3)
    expect(items[2].quantityLabel.text).toBe("2x")
    expect(items[2].partImage.region.y).toBeLessThanOrEqual(rowSpanningPart.y)
    expect(readOpaquePixelsInRegion(items[2], {
      height: 20,
      width: rowSpanningPart.width,
      x: rowSpanningPart.x,
      y: rowSpanningPart.y,
    })).toBeGreaterThan(0)
    expect(readOpaquePixelsInRegion(items[2], upperRowPart)).toBe(0)
    expect(readOpaquePixelsInRegion(items[2], lowerRowPart)).toBe(0)
  })

  it("does not lift lower-row ownership through an occupied upper label column", () => {
    const upperLeftPart = { height: 22, width: 30, x: 58, y: 92 }
    const upperRightPart = { height: 26, width: 42, x: 102, y: 88 }
    const lowerLeftPart = { height: 24, width: 36, x: 58, y: 154 }
    const lowerRightPart = { height: 34, width: 48, x: 102, y: 150 }
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, upperLeftPart, TEST_GRAY_PART)
      paintLargeRegion(data, width, upperRightPart, TEST_GRAY_PART)
      paintLargeRegion(data, width, lowerLeftPart, TEST_GRAY_PART)
      paintLargeRegion(data, width, lowerRightPart, TEST_GRAY_PART)
      paintLargeRasterQuantityLabel(data, width, "2x", 62, 122)
      paintLargeRasterQuantityLabel(data, width, "1x", 110, 122)
      paintLargeRasterQuantityLabel(data, width, "1x", 62, 188)
      paintLargeRasterQuantityLabel(data, width, "1x", 114, 198)
    })
    const items = extractCalloutPartsForPage({
      callouts: [createLargeCallout()],
      page,
    }).items

    expect(items).toHaveLength(4)
    expect(items.map((item) => item.quantityLabel.text)).toEqual(["2x", "1x", "1x", "1x"])
    expect(readOpaquePixelsInRegion(items[2], lowerLeftPart)).toBeGreaterThan(0)
    expect(readOpaquePixelsInRegion(items[2], upperLeftPart)).toBe(0)
  })

  it("does not recover lower-row top support through a close upper-row label owner", () => {
    const upperLeftPart = { height: 24, width: 36, x: 88, y: 70 }
    const upperRightPart = { height: 24, width: 36, x: 126, y: 70 }
    const lowerLeftPart = { height: 32, width: 52, x: 86, y: 112 }
    const lowerRightPart = { height: 31, width: 45, x: 144, y: 112 }
    const labels = [
      createTestQuantityLabel("1x", 88, 100),
      createTestQuantityLabel("1x", 130, 100),
      createTestQuantityLabel("1x", 88, 148),
      createTestQuantityLabel("2x", 146, 142),
    ]
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, upperLeftPart, TEST_GRAY_PART)
      paintLargeRegion(data, width, upperRightPart, TEST_GRAY_PART)
      paintLargeRegion(data, width, lowerLeftPart, TEST_GRAY_PART)
      paintLargeRegion(data, width, lowerRightPart, TEST_GRAY_PART)
    })
    const partImage = createPartImageForLabel(
      page,
      createLargeCallout(),
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      labels,
      labels,
      labels[3],
    )

    expect(partImage).not.toBeNull()
    expect(readMaskAlpha(partImage!.alphaMask, { x: lowerRightPart.x + 12, y: lowerRightPart.y + 10 }, partImage!.region))
      .toBeGreaterThan(0)
    expect(readMaskAlpha(partImage!.alphaMask, { x: upperRightPart.x + 14, y: upperRightPart.y + 12 }, partImage!.region))
      .toBe(0)
  })

  it("keeps final lower-row crop clipped after selected-envelope recovery", () => {
    const upperRightPart = { height: 26, width: 42, x: 52, y: 60 }
    const lowerRightPart = { height: 28, width: 44, x: 72, y: 108 }
    const labels = [
      createTestQuantityLabel("1x", 24, 86),
      createTestQuantityLabel("1x", 53, 86),
      createTestQuantityLabel("1x", 25, 136),
      createTestQuantityLabel("1x", 75, 136),
      createTestQuantityLabel("1x", 25, 190),
    ]
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, { height: 15, width: 20, x: 24, y: 72 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, upperRightPart, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 30, width: 43, x: 24, y: 108 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, lowerRightPart, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 30, width: 52, x: 24, y: 160 }, TEST_GRAY_PART)
    })
    const partImage = createPartImageForLabel(
      page,
      createLargeCallout(),
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      labels,
      labels,
      labels[3],
    )

    expect(partImage).not.toBeNull()
    expect(partImage!.region.y).toBeGreaterThanOrEqual(labels[1].region.y + labels[1].region.height)
    expect(readMaskAlpha(partImage!.alphaMask, { x: lowerRightPart.x + 12, y: lowerRightPart.y + 10 }, partImage!.region))
      .toBeGreaterThan(0)
    expect(readMaskAlpha(partImage!.alphaMask, { x: upperRightPart.x + 12, y: upperRightPart.y + 10 }, partImage!.region))
      .toBe(0)
  })

  it("keeps scaled final lower-row crop clipped after selected-envelope recovery", () => {
    const alphaMask = new Uint8ClampedArray(64 * 71)

    alphaMask[(80 - 71) * 64 + (486 - 460)] = 255
    alphaMask[(118 - 71) * 64 + (486 - 460)] = 255

    const partImage = clipScaledPartImageByDiagnostics({
      alphaMask: { data: alphaMask, height: 71, width: 64 },
      diagnostics: {
        alphaBounds: { height: 66, width: 45, x: 471, y: 71 },
        excludedLabelRegions: [
          { height: 16, width: 19, x: 422, y: 84 },
          { height: 16, width: 18, x: 451, y: 84 },
          { height: 16, width: 18, x: 423, y: 134 },
          { height: 16, width: 18, x: 473, y: 134 },
        ],
        imageRegionBeforeAlphaTrim: { height: 82, width: 70, x: 455, y: 71 },
        ownedRegion: { height: 82, width: 60, x: 464, y: 71 },
        rawForegroundBounds: { height: 28, width: 44, x: 472, y: 108 },
        rawForegroundPixelCount: 44 * 28,
      },
      region: { height: 71, width: 64, x: 460, y: 71 },
    })

    expect(partImage.region.y).toBe(100)
    expect(readMaskAlpha(partImage.alphaMask, { x: 486, y: 118 }, partImage.region))
      .toBeGreaterThan(0)
    expect(readMaskAlpha(partImage.alphaMask, { x: 486, y: 80 }, partImage.region))
      .toBe(0)
  })

  it("clips scaled dense top-edge alpha before final comparison", () => {
    const alphaMask = new Uint8ClampedArray(65 * 65)

    for (let x = 12; x < 57; x += 1) {
      alphaMask[x] = 255
    }
    for (let y = 30; y < 60; y += 1) {
      for (let x = 13; x < 56; x += 1) {
        alphaMask[y * 65 + x] = 255
      }
    }

    const partImage = clipScaledPartImageByDiagnostics({
      alphaMask: { data: alphaMask, height: 65, width: 65 },
      diagnostics: {
        alphaBounds: { height: 60, width: 45, x: 491, y: 28 },
        excludedLabelRegions: [],
        imageRegionBeforeAlphaTrim: { height: 77, width: 92, x: 475, y: 28 },
        ownedRegion: { height: 87, width: 59, x: 484, y: 18 },
        rawForegroundBounds: { height: 30, width: 43, x: 492, y: 58 },
        rawForegroundPixelCount: 43 * 30,
      },
      region: { height: 65, width: 65, x: 479, y: 28 },
    })

    expect(partImage.region).toEqual({ height: 39, width: 65, x: 479, y: 54 })
    expect(readMaskAlpha(partImage.alphaMask, { x: 524, y: 28 }, partImage.region))
      .toBe(0)
    expect(readMaskAlpha(partImage.alphaMask, { x: 524, y: 58 }, partImage.region))
      .toBe(255)
  })

  it("keeps a trailing tall-row part when its label sits lower than row peers", () => {
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, { height: 20, width: 42, x: 36, y: 112 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 24, width: 48, x: 84, y: 116 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 64, width: 36, x: 142, y: 92 }, TEST_GRAY_PART)
      paintLargeRasterQuantityLabel(data, width, "1x", 48, 146)
      paintLargeRasterQuantityLabel(data, width, "1x", 102, 154)
      paintLargeRasterQuantityLabel(data, width, "1x", 150, 174)
    })
    const items = extractCalloutPartsForPage({
      callouts: [createLargeCallout()],
      page,
    }).items

    expect(items).toHaveLength(3)
    expect(items[2].partImage.region.y).toBeLessThanOrEqual(92)
    expect(items[2].partImage.region.y + items[2].partImage.region.height).toBeGreaterThanOrEqual(156)
  })

  it("keeps a weak upper-row part in a mixed 4x, 1x, 3x callout", () => {
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, { height: 20, width: 22, x: 50, y: 60 }, TEST_WEAK_FOREGROUND_PART)
      paintLargeRegion(data, width, { height: 26, width: 28, x: 92, y: 54 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 30, width: 54, x: 52, y: 120 }, TEST_GRAY_PART)
      paintLargeRasterQuantityLabel(data, width, "4x", 52, 88)
      paintLargeRasterQuantityLabel(data, width, "1x", 98, 88)
      paintLargeRasterQuantityLabel(data, width, "3x", 54, 164)
    })
    const items = extractCalloutPartsForPage({
      callouts: [createLargeCallout()],
      page,
    }).items

    expect(items.map((item) => item.quantityLabel.text)).toEqual(["4x", "1x", "3x"])
    expect(items[0].partImage.alphaMask.data.some((alpha) => alpha > 0)).toBe(true)
    expect(items[2].partImage.region.y).toBeGreaterThanOrEqual(112)
  })

  it("keeps high-scale wide single-digit labels in narrow callouts", () => {
    const callout = { height: 160, width: 150, x: 12, y: 10 }
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, callout, TEST_BLACK)
      paintLargeRegion(data, width, { height: 18, width: 22, x: 36, y: 54 }, TEST_GRAY_PART)
      paintLargeGlyph(data, width, scaleGlyph(CONNECTED_TWO_X, 4), 36, 82)
    })
    const items = extractCalloutPartsForPage({
      callouts: [{ background: TEST_BLUE_PANEL, id: "narrow-callout-1", pageNumber: 1, region: callout }],
      page,
    }).items

    expect(items.map((item) => item.quantityLabel.text)).toEqual(["2x"])
  })

  it("keeps high-scale compact lower labels in narrow single-part callouts", () => {
    const examples = [
      { callout: { height: 150, width: 162, x: 12, y: 10 }, label: "12x", labelX: 58 },
      { callout: { height: 150, width: 110, x: 12, y: 10 }, label: "4x", labelX: 44 },
    ] as const

    for (const example of examples) {
      const page = createLargeSyntheticPage((data, width) => {
        paintLargeRegion(data, width, example.callout, TEST_BLUE_PANEL)
        paintLargeBorder(data, width, example.callout, TEST_BLACK)
        paintLargeRegion(data, width, { height: 18, width: 22, x: example.labelX + 10, y: 56 }, TEST_GRAY_PART)
        paintLargeScaledRasterQuantityLabel(data, width, example.label, example.labelX, 96, 4)
      })
      const items = extractCalloutPartsForPage({
        callouts: [{
          background: TEST_BLUE_PANEL,
          id: `compact-${example.label}`,
          pageNumber: 1,
          region: example.callout,
        }],
        page,
      }).items

      expect(items.map((item) => item.quantityLabel.text), example.label).toEqual([example.label])
      expect(readOpaquePixelsInRegion(items[0], { height: 18, width: 22, x: example.labelX + 10, y: 56 }), example.label)
        .toBeGreaterThan(0)
    }
  })

  it("recovers an inferred trailing compact peer when Chrome drops its readable label ink", () => {
    const trailingPart = { height: 28, width: 44, x: 68, y: 14 }
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 10, width: 14, x: 34, y: 34 }, TEST_GRAY_PART)
      paintRegion(data, trailingPart, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "6x", 34, 52)
    })
    const items = extractCalloutPartsForPage({
      callouts: [{ background: TEST_BLUE_PANEL, id: "compact-trailing-peer", pageNumber: 1, region: CALLOUT_REGION }],
      page,
    }).items

    expect(items.map((item) => item.quantityLabel.text)).toEqual(["6x", "1x"])
    expect(items[1].quantityLabel.recoveryKind).toBe("compact-missing-same-row-trailing-peer")
    expect(readOpaquePixelsInRegion(items[1], trailingPart)).toBeGreaterThan(0)
  })

  it("does not infer a trailing compact peer from broad foreground in multi-row callouts", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 14, width: 20, x: 20, y: 20 }, TEST_GRAY_PART)
      paintRegion(data, { height: 28, width: 44, x: 68, y: 14 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 22, 36)
      paintRasterQuantityLabel(data, "3x", 34, 52)
    })
    const items = extractCalloutPartsForPage({
      callouts: [{ background: TEST_BLUE_PANEL, id: "compact-dense-callout", pageNumber: 1, region: CALLOUT_REGION }],
      page,
    }).items

    expect(items.map((item) => item.quantityLabel.text)).toEqual(["1x", "3x"])
  })

  it("keeps quantity labels transparent in part image masks and stays inside callout borders", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 14, width: 10, x: 24, y: 28 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 25, 44)
    })
    const [item] = extractItems(page)

    expect(contains(inset(CALLOUT_REGION, 3), item.partImage.region)).toBe(true)
    expect(readOpaquePixelsInRegion(item, item.quantityLabel.region)).toBe(0)
  })

  it("emits alpha mask matching the part image region", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 8, width: 10, x: 24, y: 28 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 25, 44)
    })
    const [item] = extractItems(page)

    expect(item.partImage.alphaMask).toMatchObject({
      height: item.partImage.region.height,
      width: item.partImage.region.width,
    })
    expect([...item.partImage.alphaMask.data].some((alpha) => alpha > 0)).toBe(true)
  })

  it("trims stored part image region to alpha bounds with padding", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 8, width: 10, x: 24, y: 28 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 25, 44)
    })
    const [item] = extractItems(page)

    expect(item.partImage.region.x).toBeLessThanOrEqual(24)
    expect(item.partImage.region.x + item.partImage.region.width).toBeGreaterThanOrEqual(34)
    expect(item.partImage.region.width).toBeLessThan(50)
  })

  it("keeps right-side breathing room after alpha-bound trimming", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 8, width: 10, x: 24, y: 28 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 25, 44)
    })
    const [item] = extractItems(page)

    expect(item.partImage.region.x + item.partImage.region.width).toBeGreaterThanOrEqual(48)
  })

  it("keeps extra bottom breathing room after alpha-bound trimming", () => {
    const part = { height: 5, width: 7, x: 38, y: 28 }
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, part, TEST_GRAY_PART)
      paintRegion(data, { height: 1, width: part.width, x: part.x, y: part.y + part.height - 1 }, TEST_BLACK)
      paintRasterQuantityLabel(data, "1x", 39, 48)
    })
    const [item] = extractItems(page)

    expect(item.partImage.region.y + item.partImage.region.height).toBeGreaterThanOrEqual(
      part.y + part.height + 12,
    )
  })

  it("marks low-contrast part image pixels with weak alpha", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 9, width: 12, x: 26, y: 27 }, TEST_LOW_CONTRAST_PART)
      paintRegion(data, { height: 3, width: 12, x: 26, y: 34 }, TEST_BLACK)
      paintRasterQuantityLabel(data, "1x", 28, 46)
    })
    const [item] = extractItems(page)

    expect([...item.partImage.alphaMask.data].some((alpha) => alpha > 0)).toBe(true)
  })

  it("keeps faint right edges inside the stored part image mask", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 8, width: 10, x: 24, y: 28 }, TEST_GRAY_PART)
      paintRegion(data, { height: 8, width: 4, x: 34, y: 28 }, TEST_WEAK_EDGE_PART)
      paintRasterQuantityLabel(data, "1x", 25, 46)
    })
    const [item] = extractItems(page)
    const weakEdgeX = 36 - item.partImage.region.x
    const weakEdgeY = 31 - item.partImage.region.y

    expect(item.partImage.region.x + item.partImage.region.width).toBeGreaterThanOrEqual(38)
    expect(item.partImage.alphaMask.data[weakEdgeY * item.partImage.alphaMask.width + weakEdgeX]).toBeGreaterThan(0)
  })

  it("keeps faint left, top, and bottom edges inside the stored part image mask", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 8, width: 10, x: 26, y: 28 }, TEST_GRAY_PART)
      paintRegion(data, { height: 8, width: 4, x: 22, y: 28 }, TEST_WEAK_EDGE_PART)
      paintRegion(data, { height: 4, width: 10, x: 26, y: 24 }, TEST_WEAK_EDGE_PART)
      paintRegion(data, { height: 4, width: 10, x: 26, y: 36 }, TEST_WEAK_EDGE_PART)
      paintRasterQuantityLabel(data, "1x", 27, 48)
    })
    const [item] = extractItems(page)
    const weakPoints = [
      { x: 23, y: 31 },
      { x: 30, y: 25 },
      { x: 30, y: 37 },
    ]

    for (const point of weakPoints) {
      const maskX = point.x - item.partImage.region.x
      const maskY = point.y - item.partImage.region.y

      expect(item.partImage.alphaMask.data[maskY * item.partImage.alphaMask.width + maskX]).toBeGreaterThan(0)
    }
  })

  it("keeps unowned neighbor pixels transparent inside side padding", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 8, width: 10, x: 24, y: 28 }, TEST_GRAY_PART)
      paintRegion(data, { height: 8, width: 2, x: 41, y: 28 }, TEST_GRAY_PART)
      paintRegion(data, { height: 8, width: 10, x: 72, y: 28 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 25, 46)
      paintRasterQuantityLabel(data, "2x", 72, 46)
    })
    const [item] = extractItems(page)

    expect(readOpaquePixelsInRegion(item, { height: 8, width: 2, x: 41, y: 28 })).toBe(0)
  })

  it("keeps callout fill gradients transparent in part image masks", () => {
    const gradientBand = { height: 14, width: 86, x: 18, y: 24 }
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, gradientBand, { b: 224, g: 232, r: 232 })
      paintRegion(data, { height: 9, width: 14, x: 28, y: 29 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 30, 48)
    })
    const [item] = extractItems(page)

    expect(readOpaquePixelsInRegion(item, { height: 8, width: 34, x: 66, y: 26 })).toBe(0)
  })

  it("classifies flat callout backgrounds without gradient buckets", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRasterQuantityLabel(data, "1x", 30, 48)
    })
    const model = createBackgroundModel(page, inset(CALLOUT_REGION, 3), TEST_BLUE_PANEL)

    expect(model.kind).toBe("flat")
    expect(model.colors).toHaveLength(1)
  })

  it("classifies spatially broad fill variations as gradients", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 28, width: 92, x: 22, y: 22 }, TEST_LIGHT_FILL_VARIATION)
      paintRasterQuantityLabel(data, "1x", 30, 48)
    })
    const model = createBackgroundModel(page, inset(CALLOUT_REGION, 3), TEST_BLUE_PANEL)

    expect(model.kind).toBe("gradient")
    expect(model.colors.length).toBeGreaterThan(1)
  })

  it("preserves compact light part faces while removing broad gradient fill", () => {
    const gradientBand = { height: 28, width: 92, x: 22, y: 22 }
    const lightFace = { height: 8, width: 16, x: 30, y: 30 }
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, gradientBand, TEST_LIGHT_FILL_VARIATION)
      paintRegion(data, lightFace, TEST_LIGHT_PART)
      paintRegion(data, { height: 2, width: 16, x: 30, y: 37 }, TEST_BLACK)
      paintRasterQuantityLabel(data, "1x", 32, 48)
    })
    const [item] = extractItems(page)

    expect(readOpaquePixelsInRegion(item, lightFace)).toBeGreaterThan(0)
    expect(readOpaquePixelsInRegion(item, { height: 8, width: 38, x: 68, y: 30 })).toBe(0)
  })

  it("preserves enclosed light part faces that match accepted gradient fill", () => {
    const whiteFill = { b: 255, g: 255, r: 255 }
    const lightFace = { height: 10, width: 16, x: 30, y: 28 }
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 28, width: 92, x: 22, y: 22 }, whiteFill)
      paintRegion(data, lightFace, whiteFill)
      paintRegion(data, { height: 2, width: 16, x: 30, y: 28 }, TEST_BLACK)
      paintRegion(data, { height: 2, width: 16, x: 30, y: 36 }, TEST_BLACK)
      paintRegion(data, { height: 10, width: 2, x: 30, y: 28 }, TEST_BLACK)
      paintRegion(data, { height: 10, width: 2, x: 44, y: 28 }, TEST_BLACK)
      paintRasterQuantityLabel(data, "1x", 32, 48)
    })
    const [item] = extractItems(page)

    expect(readOpaquePixelsInRegion(item, { height: 6, width: 12, x: 32, y: 30 })).toBeGreaterThan(0)
    expect(readOpaquePixelsInRegion(item, { height: 8, width: 38, x: 68, y: 30 })).toBe(0)
  })

  it("keeps supported near-background part faces fully opaque", () => {
    const lightFace = { height: 12, width: 18, x: 30, y: 28 }
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, lightFace, TEST_LOW_CONTRAST_PART)
      paintRegion(data, { height: 2, width: lightFace.width, x: lightFace.x, y: lightFace.y }, TEST_BLACK)
      paintRegion(data, {
        height: 2,
        width: lightFace.width,
        x: lightFace.x,
        y: lightFace.y + lightFace.height - 2,
      }, TEST_BLACK)
      paintRegion(data, { height: lightFace.height, width: 2, x: lightFace.x, y: lightFace.y }, TEST_BLACK)
      paintRegion(data, {
        height: lightFace.height,
        width: 2,
        x: lightFace.x + lightFace.width - 2,
        y: lightFace.y,
      }, TEST_BLACK)
      paintRasterQuantityLabel(data, "1x", 34, 48)
    })
    const [item] = extractItems(page)

    expect(readMaskAlpha(item.partImage.alphaMask, { x: 38, y: 34 }, item.partImage.region)).toBe(255)
  })

  it("keeps background-like top projection pixels transparent", () => {
    const backgroundLikeProjection = { height: 4, width: 20, x: 30, y: 26 }
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, backgroundLikeProjection, TEST_LOW_CONTRAST_PART)
      paintRegion(data, { height: 8, width: 2, x: 30, y: 30 }, TEST_BLACK)
      paintRegion(data, { height: 8, width: 2, x: 48, y: 30 }, TEST_BLACK)
      paintRegion(data, { height: 2, width: 20, x: 30, y: 36 }, TEST_BLACK)
      paintRasterQuantityLabel(data, "1x", 34, 48)
    })
    const [item] = extractItems(page)

    expect(readOpaquePixelsInRegion(item, backgroundLikeProjection)).toBe(0)
    expect(readMaskAlpha(item.partImage.alphaMask, { x: 38, y: 27 }, item.partImage.region)).toBe(0)
  })

  it("does not bridge exact callout background through the top support gap", () => {
    const exactBackgroundProjection = { height: 4, width: 20, x: 30, y: 26 }
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, exactBackgroundProjection, TEST_BLUE_PANEL)
      paintRegion(data, { height: 8, width: 2, x: 30, y: 30 }, TEST_BLACK)
      paintRegion(data, { height: 8, width: 2, x: 48, y: 30 }, TEST_BLACK)
      paintRegion(data, { height: 2, width: 20, x: 30, y: 36 }, TEST_BLACK)
      paintRasterQuantityLabel(data, "1x", 34, 48)
    })
    const [item] = extractItems(page)

    expect(readOpaquePixelsInRegion(item, exactBackgroundProjection)).toBe(0)
    expect(readMaskAlpha(item.partImage.alphaMask, { x: 38, y: 27 }, item.partImage.region)).toBe(0)
  })

  it("bridges deeper weak top pixels for wide shallow support runs", () => {
    const region = { height: 48, width: 72, x: 22, y: 14 }
    const mask = new Uint8Array(region.width * region.height)
    const firstSupportY = 23
    const supportLeft = 28
    const supportRight = 45
    const wideSupportLeft = 15
    const wideSupportRight = 56
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 12, width: 42, x: region.x + supportLeft, y: region.y + 4 }, TEST_WEAK_EDGE_PART)
    })
    const background = createFlatBackgroundModel(TEST_BLUE_PANEL)

    for (let x = supportLeft; x <= supportRight; x += 1) {
      mask[firstSupportY * region.width + x] = 1
    }
    for (let x = wideSupportLeft; x <= wideSupportRight; x += 1) {
      mask[(firstSupportY + 1) * region.width + x] = 1
    }

    fillTopGapBridgeSupport(mask, page, region, background)

    expect(mask[4 * region.width + 34]).toBeGreaterThan(0)
    expect(mask[4 * region.width + 48]).toBeGreaterThan(0)
  })

  it("bridges local weak top pixels when a long shallow part has little right-side slack", () => {
    const region = { height: 48, width: 72, x: 22, y: 14 }
    const mask = new Uint8Array(region.width * region.height)
    const bodyTop = 24
    const bodyBottom = 39
    const bodyLeft = 22
    const bodyRight = 65
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 14, width: 46, x: region.x + bodyLeft, y: region.y + 10 }, TEST_WEAK_EDGE_PART)
    })
    const background = createFlatBackgroundModel(TEST_BLUE_PANEL)

    for (let y = bodyTop; y <= bodyBottom; y += 1) {
      for (let x = bodyLeft; x <= bodyRight; x += 1) {
        mask[y * region.width + x] = 1
      }
    }

    fillTopGapBridgeSupport(mask, page, region, background)

    expect(mask[12 * region.width + 64]).toBeGreaterThan(0)
  })

  it("does not bridge exact background through a deeper wide shallow gap", () => {
    const region = { height: 48, width: 72, x: 22, y: 14 }
    const mask = new Uint8Array(region.width * region.height)
    const firstSupportY = 23
    const supportLeft = 28
    const supportRight = 45
    const wideSupportLeft = 15
    const wideSupportRight = 56
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 12, width: 42, x: region.x + supportLeft, y: region.y + 4 }, TEST_BLUE_PANEL)
    })
    const background = createFlatBackgroundModel(TEST_BLUE_PANEL)

    for (let x = supportLeft; x <= supportRight; x += 1) {
      mask[firstSupportY * region.width + x] = 1
    }
    for (let x = wideSupportLeft; x <= wideSupportRight; x += 1) {
      mask[(firstSupportY + 1) * region.width + x] = 1
    }

    fillTopGapBridgeSupport(mask, page, region, background)

    expect(mask[4 * region.width + 34]).toBe(0)
    expect(mask[4 * region.width + 48]).toBe(0)
  })

  it("keeps deeper weak top face pixels on long parts opaque", () => {
    const topFace = { height: 10, width: 34, x: 30, y: 20 }
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, topFace, TEST_WEAK_EDGE_PART)
      paintRegion(data, { height: 18, width: 2, x: 30, y: 30 }, TEST_BLACK)
      paintRegion(data, { height: 18, width: 2, x: 62, y: 30 }, TEST_BLACK)
      paintRegion(data, { height: 2, width: 34, x: 30, y: 46 }, TEST_BLACK)
      paintRasterQuantityLabel(data, "1x", 36, 52)
    })
    const [item] = extractItems(page)

    expect(readMaskAlpha(item.partImage.alphaMask, { x: 45, y: 21 }, item.partImage.region)).toBe(255)
    expect(readOpaquePixelsInRegion(item, { height: 4, width: 18, x: 82, y: 22 })).toBe(0)
  })

  it("keeps connected near-background end-cap pixels on long shallow parts", () => {
    const region = { height: 52, width: 96, x: 22, y: 14 }
    const mask = new Uint8Array(region.width * region.height)
    const bodyTop = 12
    const bodyBottom = 30
    const bodyLeft = 18
    const bodyRight = 70
    const weakEndCap = TEST_WEAK_EDGE_PART
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, {
        height: bodyBottom - bodyTop + 1,
        width: bodyRight - bodyLeft + 1,
        x: region.x + bodyLeft,
        y: region.y + bodyTop,
      }, TEST_GRAY_PART)
      paintRegion(data, { height: 5, width: 7, x: region.x + 72, y: region.y + 14 }, weakEndCap)
    })
    const background = createFlatBackgroundModel(TEST_BLUE_PANEL)

    for (let y = bodyTop; y <= bodyBottom; y += 1) {
      for (let x = bodyLeft; x <= bodyRight; x += 1) {
        mask[y * region.width + x] = 1
      }
    }

    fillTopGapBridgeSupport(mask, page, region, background)

    expect(mask[15 * region.width + 74]).toBeGreaterThan(0)
    expect(mask[15 * region.width + 86]).toBe(0)
  })

  it("does not let top support outside the owned envelope pull in neighboring parts", () => {
    const region = { height: 56, width: 96, x: 20, y: 14 }
    const ownedRegion = { height: 42, width: 48, x: 26, y: 18 }
    const strongBody = { height: 18, width: 32, x: 34, y: 34 }
    const weakTop = { height: 12, width: 34, x: 34, y: 22 }
    const neighbor = { height: 20, width: 24, x: 78, y: 24 }
    const foregroundPixels = pointsInRegion(strongBody)
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, weakTop, TEST_LIGHT_PART)
      paintRegion(data, strongBody, TEST_GRAY_PART)
      paintRegion(data, neighbor, TEST_LIGHT_PART)
    })
    const item = createPartImage(
      page,
      region,
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      ownedRegion,
      [],
      foregroundPixels,
      [],
      { enableTopSupport: true },
    )

    expect(readMaskAlpha(item.alphaMask, { x: 48, y: 25 }, item.region)).toBeGreaterThan(0)
    expect(readMaskAlpha(item.alphaMask, { x: 84, y: 28 }, item.region)).toBe(0)
  })

  it("keeps severe weak top pixels inside the selected owned envelope opaque", () => {
    const region = { height: 56, width: 96, x: 20, y: 14 }
    const ownedRegion = { height: 48, width: 66, x: 30, y: 18 }
    const strongBody = { height: 18, width: 46, x: 42, y: 44 }
    const weakTop = { height: 22, width: 58, x: 34, y: 22 }
    const neighbor = { height: 16, width: 16, x: 106, y: 24 }
    const foregroundPixels = pointsInRegion(strongBody)
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, weakTop, TEST_WEAK_EDGE_PART)
      paintRegion(data, strongBody, TEST_GRAY_PART)
      paintRegion(data, neighbor, TEST_WEAK_EDGE_PART)
    })
    const item = createPartImage(
      page,
      region,
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      ownedRegion,
      [],
      foregroundPixels,
      [],
      { enableTopSupport: true },
    )

    expect(readMaskAlpha(item.alphaMask, { x: 82, y: 25 }, item.region)).toBeGreaterThan(0)
    expect(readMaskAlpha(item.alphaMask, { x: 112, y: 28 }, item.region)).toBe(0)
  })

  it("keeps low-contrast top face pixels inside a long owned envelope", () => {
    const region = { height: 54, width: 68, x: 339, y: 56 }
    const ownedRegion = { height: 54, width: 48, x: 348, y: 56 }
    const topFace = { height: 10, width: 38, x: 356, y: 60 }
    const strongBody = { height: 25, width: 37, x: 356, y: 68 }
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, topFace, TEST_BLUE_PANEL)
      paintRegion(data, strongBody, TEST_GRAY_PART)
    })
    const item = createPartImage(
      page,
      region,
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      ownedRegion,
      [],
      pointsInRegion(strongBody),
      [],
      { enableLowContrastFaceSupport: true, enableTopSupport: true },
    )

    expect(readMaskAlpha(item.alphaMask, { x: 356, y: 60 }, item.region)).toBe(255)
    expect(item.region.y).toBeLessThanOrEqual(56)
  })

  it("keeps low-contrast left face pixels inside a long owned envelope", () => {
    const region = { height: 51, width: 97, x: 20, y: 20 }
    const ownedRegion = { height: 65, width: 87, x: 29, y: 6 }
    const leftFace = { height: 24, width: 5, x: 31, y: 29 }
    const strongBody = { height: 25, width: 72, x: 36, y: 29 }
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, leftFace, TEST_BLUE_PANEL)
      paintRegion(data, strongBody, TEST_GRAY_PART)
    })
    const item = createPartImage(
      page,
      region,
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      ownedRegion,
      [],
      pointsInRegion(strongBody),
      [],
      { enableLowContrastFaceSupport: true, enableTopSupport: true },
    )

    expect(readMaskAlpha(item.alphaMask, { x: 32, y: 33 }, item.region)).toBe(255)
    expect(item.region.x).toBeLessThanOrEqual(20)
  })

  it("recovers a low-contrast left face for the rightmost part in a label row", () => {
    const callout = { height: 88, width: 236, x: 12, y: 10 }
    const labels = [
      createTestQuantityLabel("3x", 28, 55),
      createTestQuantityLabel("3x", 94, 55),
    ]
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, callout, TEST_BLACK)
      paintLargeRegion(data, width, { height: 25, width: 6, x: 95, y: 28 }, TEST_BLUE_PANEL)
      paintLargeRegion(data, width, { height: 25, width: 110, x: 104, y: 28 }, TEST_GRAY_PART)
      paintLargeRasterQuantityLabel(data, width, "3x", labels[0].region.x, labels[0].region.y)
      paintLargeRasterQuantityLabel(data, width, "3x", labels[1].region.x, labels[1].region.y)
    })
    const item = createPartImageForLabel(
      page,
      { background: TEST_BLUE_PANEL, id: "low-contrast-row-left", pageNumber: 1, region: callout },
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      labels,
      labels,
      labels[1],
    )

    expect(item).toBeDefined()
    expect(readMaskAlpha(item!.alphaMask, { x: 96, y: 32 }, item!.region)).toBe(255)
    expect(item!.region.x).toBeLessThanOrEqual(95)
  })

  it("ignores tiny false labels to the right when recovering a low-contrast row end", () => {
    const callout = { height: 86, width: 261, x: 12, y: 10 }
    const labels = [
      createTestQuantityLabel("2x", 27, 59),
      createTestQuantityLabel("2x", 61, 59),
      createTestQuantityLabel("1x", 90, 59),
      createTestQuantityLabel("1x", 118, 59),
      createTestQuantityLabel("2x", 151, 59),
      createTestQuantityLabel("1x", 212, 59),
      {
        confidence: 0.55,
        region: { height: 5, width: 9, x: 240, y: 47 },
        text: "1x",
        value: 1,
      },
    ]
    const page = createWideSyntheticPage(300, 140, (data, width) => {
      paintLargeRegion(data, width, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, callout, TEST_BLACK)
      paintLargeRegion(data, width, { height: 18, width: 38, x: 213, y: 29 }, TEST_BLUE_PANEL)
      paintLargeRegion(data, width, { height: 15, width: 32, x: 213, y: 47 }, TEST_GRAY_PART)
      for (const label of labels.slice(0, 6)) {
        paintLargeRasterQuantityLabel(data, width, label.text, label.region.x, label.region.y)
      }
    })
    const item = createPartImageForLabel(
      page,
      { background: TEST_BLUE_PANEL, id: "low-contrast-row-top", pageNumber: 1, region: callout },
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      labels,
      labels,
      labels[5],
    )

    expect(item).toBeDefined()
    expect(readMaskAlpha(item!.alphaMask, { x: 214, y: 31 }, item!.region)).toBe(255)
    expect(item!.region.y).toBeLessThanOrEqual(29)
  })

  it("recovers sparse low-contrast top faces when tiny false labels would shrink the crop zone", () => {
    const callout = { height: 100, width: 122, x: 12, y: 10 }
    const sparseWeakFace = { b: 245, g: 220, r: 190 }
    const targetLabel = createTestQuantityLabel("1x", 36, 78)
    const labels = [
      targetLabel,
      { confidence: 0.55, region: { height: 5, width: 8, x: 96, y: 65 }, text: "1x", value: 1 },
      { confidence: 0.55, region: { height: 5, width: 8, x: 104, y: 68 }, text: "1x", value: 1 },
    ]
    const page = createSyntheticPage((data) => {
      paintLargeRegion(data, 160, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, 160, callout, TEST_BLACK)
      paintLargeRegion(data, 160, { height: 32, width: 96, x: 24, y: 24 }, sparseWeakFace)
      paintLargeRegion(data, 160, { height: 18, width: 8, x: 42, y: 56 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", targetLabel.region.x, targetLabel.region.y)
    })
    const item = createPartImageForLabel(
      page,
      { background: TEST_BLUE_PANEL, id: "sparse-low-contrast-single", pageNumber: 1, region: callout },
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      labels,
      labels,
      targetLabel,
    )

    expect(item).toBeDefined()
    expect(readMaskAlpha(item!.alphaMask, { x: 112, y: 30 }, item!.region)).toBeGreaterThan(0)
    expect(item!.region.y).toBeLessThanOrEqual(30)
    expect(item!.region.x + item!.region.width).toBeGreaterThanOrEqual(112)
  })

  it("recovers sparse low-contrast top faces for right-side two-label rows without borrowing the left part", () => {
    const callout = { height: 104, width: 186, x: 20, y: 10 }
    const sparseWeakFace = { b: 245, g: 220, r: 190 }
    const labels = [
      createTestQuantityLabel("1x", 42, 82),
      createTestQuantityLabel("1x", 98, 82),
      { confidence: 0.55, region: { height: 6, width: 10, x: 146, y: 64 }, text: "1x", value: 1 },
    ]
    const page = createWideSyntheticPage(240, 150, (data, width) => {
      paintLargeRegion(data, width, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, callout, TEST_BLACK)
      paintLargeRegion(data, width, { height: 18, width: 46, x: 42, y: 58 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 28, width: 100, x: 102, y: 30 }, sparseWeakFace)
      paintLargeRegion(data, width, { height: 18, width: 52, x: 106, y: 58 }, TEST_GRAY_PART)
      paintLargeRasterQuantityLabel(data, width, "1x", labels[0].region.x, labels[0].region.y)
      paintLargeRasterQuantityLabel(data, width, "1x", labels[1].region.x, labels[1].region.y)
    })
    const item = createPartImageForLabel(
      page,
      { background: TEST_BLUE_PANEL, id: "sparse-low-contrast-row", pageNumber: 1, region: callout },
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      labels,
      labels,
      labels[1],
    )

    expect(item).toBeDefined()
    expect(readMaskAlpha(item!.alphaMask, { x: 194, y: 36 }, item!.region)).toBeGreaterThan(0)
    expect(readMaskAlpha(item!.alphaMask, { x: 58, y: 64 }, item!.region)).toBe(0)
    expect(item!.region.x + item!.region.width).toBeGreaterThanOrEqual(194)
  })

  it("keeps near-background bottom edge pixels below the strong outline opaque", () => {
    const bottomEdge = { height: 4, width: 20, x: 30, y: 37 }
    const exactBackgroundBelow = { height: 3, width: 20, x: 30, y: 42 }
    const darkerLowContrastEdge = { b: 230, g: 208, r: 198 }
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, bottomEdge, darkerLowContrastEdge)
      paintRegion(data, { height: 2, width: 20, x: 30, y: 30 }, TEST_BLACK)
      paintRegion(data, { height: 7, width: 2, x: 30, y: 30 }, TEST_BLACK)
      paintRegion(data, { height: 7, width: 2, x: 48, y: 30 }, TEST_BLACK)
      paintRasterQuantityLabel(data, "1x", 34, 48)
    })
    const [item] = extractItems(page)

    expect(readOpaquePixelsInRegion(item, bottomEdge)).toBeGreaterThan(0)
    expect(readMaskAlpha(item.partImage.alphaMask, { x: 38, y: 38 }, item.partImage.region)).toBe(255)
    expect(readOpaquePixelsInRegion(item, exactBackgroundBelow)).toBe(0)
  })

  it("does not let close label suppression remove the supported lower part edge", () => {
    const bottomEdge = { height: 4, width: 20, x: 30, y: 38 }
    const darkerLowContrastEdge = { b: 230, g: 208, r: 198 }
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, bottomEdge, darkerLowContrastEdge)
      paintRegion(data, { height: 2, width: 20, x: 30, y: 30 }, TEST_BLACK)
      paintRegion(data, { height: 8, width: 2, x: 30, y: 30 }, TEST_BLACK)
      paintRegion(data, { height: 8, width: 2, x: 48, y: 30 }, TEST_BLACK)
      paintRasterQuantityLabel(data, "1x", 34, 42)
    })
    const [item] = extractItems(page)

    expect(item.quantityLabel.text).toBe("1x")
    expect(readMaskAlpha(item.partImage.alphaMask, { x: 46, y: 40 }, item.partImage.region)).toBe(255)
  })

  it("keeps rejected quantity-like part details opaque inside the selected part", () => {
    let detailRegion: Region | null = null
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 16, width: 30, x: 28, y: 28 }, TEST_LOW_CONTRAST_PART)
      paintBorder(data, { height: 16, width: 30, x: 28, y: 28 }, TEST_BLACK)
      detailRegion = paintRasterQuantityLabel(data, "4x", 34, 32)
      paintRasterQuantityLabel(data, "1x", 36, 60)
    })
    const items = extractItems(page)

    expect(items.map((item) => item.quantityLabel.text)).toEqual(["1x"])
    expect(readOpaquePixelsInRegion(items[0], detailRegion!)).toBeGreaterThan(0)
  })

  it("classifies compact high-luma part colors as mixed instead of gradient", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 20, width: 44, x: 42, y: 26 }, TEST_LIGHT_PART)
      paintRasterQuantityLabel(data, "1x", 50, 48)
    })
    const model = createBackgroundModel(page, inset(CALLOUT_REGION, 3), TEST_BLUE_PANEL)

    expect(model.kind).toBe("mixed")
    expect(model.colors).toHaveLength(1)
  })

  it("keeps near-background fill variations transparent after ownership selection", () => {
    const fillVariation = { height: 3, width: 3, x: 37, y: 30 }
    const callout = { height: 62, width: 122, x: 12, y: 10 }
    const background = { b: 82, g: 202, r: 248 }
    const page = createSyntheticPage((data) => {
      paintRegion(data, callout, background)
      paintBorder(data, callout, TEST_BLACK)
      paintRegion(data, { height: 9, width: 14, x: 26, y: 30 }, TEST_GRAY_PART)
      paintRegion(data, fillVariation, { b: 86, g: 210, r: 232 })
      paintRasterQuantityLabel(data, "1x", 28, 48)
    })
    const [item] = extractCalloutPartsForPage({
      callouts: [{ background, id: "yellow-callout", pageNumber: 1, region: callout }],
      page,
    }).items

    expect(readOpaquePixelsInRegion(item, { height: 9, width: 14, x: 26, y: 30 })).toBeGreaterThan(0)
    expect(readOpaquePixelsInRegion(item, fillVariation)).toBe(0)
  })

  it("clears outside-connected background pixels from selected alpha", () => {
    const region = { height: 48, width: 72, x: 20, y: 20 }
    const part = { height: 16, width: 24, x: 52, y: 42 }
    const edgeFill = { height: 14, width: 18, x: 20, y: 28 }
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, part, TEST_GRAY_PART)
      paintRegion(data, edgeFill, TEST_BLUE_PANEL)
    })
    const item = createPartImage(
      page,
      region,
      createFlatBackgroundModel(TEST_BLUE_PANEL),
      region,
      [],
      [...pointsInRegion(part), ...pointsInRegion(edgeFill)],
      [],
    )

    expect(readOpaqueImagePixelsInRegion(item, part)).toBeGreaterThan(0)
    expect(readOpaqueImagePixelsInRegion(item, edgeFill)).toBe(0)
  })

  it("scrubs base-page background pixels from a scaled part alpha mask", () => {
    const background = { b: 82, g: 202, r: 248 }
    const part = { height: 9, width: 14, x: 26, y: 30 }
    const page = createSyntheticPage((data) => {
      paintRegion(data, CALLOUT_REGION, background)
      paintRegion(data, part, TEST_BLACK)
    })
    const scrubbed = scrubPartImageBackground(page, {
      alphaMask: {
        data: new Uint8ClampedArray(30 * 20).fill(255),
        height: 20,
        width: 30,
      },
      region: { height: 20, width: 30, x: 20, y: 25 },
    }, background)

    expect(readMaskAlpha(scrubbed.alphaMask, { x: 21, y: 26 }, scrubbed.region)).toBe(0)
    expect(readMaskAlpha(scrubbed.alphaMask, { x: 30, y: 34 }, scrubbed.region)).toBe(255)
  })

  it("does not connect same-row parts through saturated background fill variation", () => {
    const callout = { height: 62, width: 122, x: 12, y: 10 }
    const background = { b: 82, g: 202, r: 248 }
    const bridge = { b: 86, g: 210, r: 232 }
    const leftPart = { height: 9, width: 14, x: 26, y: 30 }
    const rightPart = { height: 9, width: 14, x: 72, y: 30 }
    const page = createSyntheticPage((data) => {
      paintRegion(data, callout, background)
      paintBorder(data, callout, TEST_BLACK)
      paintRegion(data, leftPart, TEST_BLACK)
      paintRegion(data, { height: 9, width: 32, x: 40, y: 30 }, bridge)
      paintRegion(data, rightPart, TEST_BLACK)
      paintRasterQuantityLabel(data, "1x", 28, 48)
      paintRasterQuantityLabel(data, "1x", 74, 48)
    })
    const items = extractCalloutPartsForPage({
      callouts: [{ background, id: "yellow-callout", pageNumber: 1, region: callout }],
      page,
    }).items

    expect(items).toHaveLength(2)
    expect(readOpaquePixelsInRegion(items[0], leftPart)).toBeGreaterThan(0)
    expect(readOpaquePixelsInRegion(items[0], rightPart)).toBe(0)
    expect(readOpaquePixelsInRegion(items[1], leftPart)).toBe(0)
    expect(readOpaquePixelsInRegion(items[1], rightPart)).toBeGreaterThan(0)
  })

  it("does not connect same-row neighbor parts through a background gradient band", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 18, width: 100, x: 18, y: 24 }, { b: 220, g: 231, r: 232 })
      paintRegion(data, { height: 8, width: 12, x: 24, y: 30 }, TEST_GRAY_PART)
      paintRegion(data, { height: 8, width: 28, x: 58, y: 30 }, TEST_GRAY_PART)
      paintRegion(data, { height: 8, width: 16, x: 96, y: 30 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 26, 48)
      paintRasterQuantityLabel(data, "1x", 66, 48)
      paintRasterQuantityLabel(data, "1x", 100, 48)
    })
    const items = extractItems(page)

    expect(items).toHaveLength(3)
    expect(readOpaquePixelsInRegion(items[0], { height: 8, width: 28, x: 58, y: 30 })).toBe(0)
    expect(readOpaquePixelsInRegion(items[1], { height: 8, width: 16, x: 96, y: 30 })).toBe(0)
  })

  it("does not let quantity-label halo residue steal part ownership", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 9, width: 22, x: 62, y: 30 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 66, 48)
      paintRegion(data, { height: 3, width: 4, x: 80, y: 51 }, TEST_BLACK)
    })
    const [item] = extractItems(page)

    expect(readOpaquePixelsInRegion(item, { height: 9, width: 22, x: 62, y: 30 })).toBeGreaterThan(0)
    expect(readOpaquePixelsInRegion(item, { height: 3, width: 4, x: 80, y: 51 })).toBe(0)
    expect(item.partImage.region.y).toBeLessThanOrEqual(30)
  })

  it("does not select callout border fragments as the label-owned part", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 3, width: 74, x: 15, y: 13 }, TEST_BLACK)
      paintRegion(data, { height: 42, width: 3, x: 15, y: 13 }, TEST_BLACK)
      paintRegion(data, { height: 9, width: 13, x: 31, y: 31 }, TEST_GRAY_PART)
      paintRasterQuantityLabel(data, "1x", 32, 47)
    })
    const [item] = extractItems(page)

    expect(readOpaquePixelsInRegion(item, { height: 42, width: 3, x: 15, y: 13 })).toBe(0)
  })
})

function extractTexts(page: ReturnType<typeof createSyntheticPage>): string[] {
  return extractItems(page).map((item) => item.quantityLabel.text)
}

function extractItems(page: ReturnType<typeof createSyntheticPage>) {
  return extractCalloutPartsForPage({
    callouts: [createCallout()],
    page,
  }).items
}

function createDuplicateTestItem(
  text: string,
  labelRegion: Region,
  partRegion: Region,
  alpha = 255,
): CalloutPartItem {
  return {
    calloutId: "callout-1",
    confidence: 0.86,
    id: `item-${labelRegion.x}-${labelRegion.y}`,
    indexOnCallout: 0,
    partImage: {
      alphaMask: {
        data: new Uint8ClampedArray(partRegion.width * partRegion.height).fill(alpha),
        height: partRegion.height,
        width: partRegion.width,
      },
      region: partRegion,
    },
    quantityLabel: {
      confidence: 0.9,
      region: labelRegion,
      text,
      value: Number.parseInt(text, 10),
    },
    sourceRegion: partRegion,
  }
}

function createCallout(): CalloutPartCalloutInput {
  return {
    background: TEST_BLUE_PANEL,
    id: "callout-1",
    pageNumber: 1,
    region: CALLOUT_REGION,
  }
}

function paintCallout(data: Uint8ClampedArray): void {
  paintRegion(data, CALLOUT_REGION, TEST_BLUE_PANEL)
  paintBorder(data, CALLOUT_REGION, TEST_BLACK)
}

function readOpaquePixelsInRegion(
  item: ReturnType<typeof extractItems>[number],
  region: Region,
): number {
  return readOpaqueImagePixelsInRegion(item.partImage, region)
}

function readOpaqueImagePixelsInRegion(
  image: { alphaMask: { data: Uint8ClampedArray; height: number; width: number }; region: Region },
  region: Region,
): number {
  let count = 0

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const maskX = x - image.region.x
      const maskY = y - image.region.y

      if (
        maskX >= 0 &&
        maskY >= 0 &&
        maskX < image.alphaMask.width &&
        maskY < image.alphaMask.height &&
        image.alphaMask.data[maskY * image.alphaMask.width + maskX] > 0
      ) {
        count += 1
      }
    }
  }

  return count
}

function countOpaqueMaskPixels(mask: Uint8ClampedArray): number {
  let count = 0

  for (const alpha of mask) {
    if (alpha > 0) {
      count += 1
    }
  }

  return count
}

function readMaskAlpha(
  mask: { data: Uint8ClampedArray; height: number; width: number },
  point: { x: number; y: number },
  region: Region,
): number {
  const maskX = point.x - region.x
  const maskY = point.y - region.y

  if (maskX < 0 || maskY < 0 || maskX >= mask.width || maskY >= mask.height) {
    return 0
  }

  return mask.data[maskY * mask.width + maskX] ?? 0
}

function pointsInRegion(region: Region): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      points.push({ x, y })
    }
  }

  return points
}

function contains(container: Region, child: Region): boolean {
  return child.x >= container.x &&
    child.y >= container.y &&
    child.x + child.width <= container.x + container.width &&
    child.y + child.height <= container.y + container.height
}

function inset(region: Region, insetSize: number): Region {
  return {
    height: region.height - insetSize * 2,
    width: region.width - insetSize * 2,
    x: region.x + insetSize,
    y: region.y + insetSize,
  }
}

function createGlyphFromPattern(pattern: readonly string[], x: number, y: number) {
  const pixels = pattern.flatMap((row, rowIndex) =>
    [...row].flatMap((cell, columnIndex) =>
      cell === "1" || cell === "#"
        ? [{ x: x + columnIndex, y: y + rowIndex }]
        : [],
    ),
  )

  const glyph = createGlyphFromPixels(pixels)

  if (!glyph) {
    throw new Error("glyph pattern must contain pixels")
  }

  return glyph
}

const CONNECTED_TWO_X = [
  "111100000",
  "000010101",
  "000010010",
  "111100010",
  "100000101",
  "100000000",
  "111110000",
]

const DENSE_OPEN_FOUR = [
  "....##.",
  "....##.",
  "...###.",
  "..####.",
  ".##.##.",
  ".#..##.",
  "#######",
  "#######",
  "....##.",
  "....##.",
]

const DENSE_NINE = [
  ".#####.",
  "##...##",
  "##...##",
  "##...##",
  ".######",
  "....##.",
  "....##.",
  "...###.",
  "..####.",
  ".####..",
]

const DENSE_FIVE = [
  ".######",
  "##.....",
  "##.....",
  "######.",
  "######.",
  "....##.",
  "....##.",
  "....##.",
  "##..##.",
  ".####..",
]

const WIDE_PRINTED_FIVE = [
  "...###########..",
  "..#############.",
  "..#############.",
  "..############..",
  "..####..........",
  "..###...........",
  ".####...........",
  ".####...........",
  ".###########....",
  ".############...",
  ".#############..",
  "#######..######.",
  ".####......####.",
  ".##........####.",
  "............####",
  "............####",
  "............####",
  "###.........####",
  "####.......####.",
  "####.......####.",
  "#####.....#####.",
  ".#############..",
  "..###########...",
  "...#########....",
  ".....#####......",
]

const CONNECTED_EIGHT_X = [
  "...##..........",
  ".#####.........",
  ".##..##........",
  ".##..##.##...##",
  ".######.###.##.",
  ".#####...#####.",
  ".##.###...###..",
  "##...###..###..",
  "##...###.####..",
  "###.###.###.##.",
  ".#####..##..###",
]

const HIGH_SCALE_CLOSED_EIGHT = [
  "00000011111111000000",
  "00000111111111100000",
  "00001111111111111000",
  "00011111111111111100",
  "00111111000011111100",
  "00111110000000111110",
  "00111100000000111110",
  "00111100000000011110",
  "00111100000000011110",
  "00111100000000011110",
  "00111100000000111110",
  "00111111000001111100",
  "00011111111111111100",
  "00011111111111111000",
  "00001111111111111000",
  "00011111111111111100",
  "00111111000011111110",
  "01111100000000111110",
  "01111100000000011111",
  "11111000000000001111",
  "11111000000000001111",
  "11111000000000001111",
  "11111000000000001111",
  "11111000000000001111",
  "11111000000000001111",
  "01111100000000011111",
  "00111110000000111110",
  "00111111100111111110",
  "00011111111111111100",
  "00001111111111110000",
  "00000011111111100000",
]

const HIGH_SCALE_X = [
  "01111000000000001110",
  "01111100000000011111",
  "01111110000000111110",
  "00111110000001111110",
  "00011111000011111100",
  "00011111100011111000",
  "00001111100111110000",
  "00000111111111100000",
  "00000011111111100000",
  "00000001111110000000",
  "00000001111110000000",
  "00000001111110000000",
  "00000011111111000000",
  "00000011111111100000",
  "00000111111111100000",
  "00001111100111110000",
  "00001111100011111000",
  "00011111000011111100",
  "00011110000001111100",
  "00111110000001111110",
  "01111100000000111110",
  "11111100000000011111",
  "11111000000000011111",
]

const WIDE_PRINTED_X = [
  ".###.......###.",
  "#####......####",
  ".####.....####.",
  ".#####...#####.",
  "..#####.#####..",
  "...#########...",
  "....#######....",
  "....#######....",
  ".....#####.....",
  ".....#####.....",
  "....#######....",
  "....########...",
  "...#########...",
  "..#####..####..",
  ".#####...#####.",
  ".####.....#####",
  "#####......####",
  "####.......####",
]

const HIGH_SCALE_NINE_WITH_LOWER_LEFT_GAP = [
  "00000000111100000000",
  "00000111111111100000",
  "00011111111111110000",
  "00111111111111111000",
  "00111111111111111100",
  "01111110000001111100",
  "01111100000000111110",
  "11111000000000011110",
  "11111000000000011111",
  "11111000000000011111",
  "11111000000000011111",
  "11111000000000011111",
  "11111000000000011111",
  "11111000000000011111",
  "11111000000000011111",
  "11111100000000111111",
  "01111111000011111111",
  "01111111111111111111",
  "00111111111111111111",
  "00011111111111111111",
  "00000111111110001111",
  "00000000111000011111",
  "00000000000000011111",
  "00110000000000011111",
  "01111000000000111110",
  "01111000000000111110",
  "01111100000001111100",
  "01111111000111111100",
  "00111111111111111000",
  "00011111111111110000",
  "00011111111111100000",
  "00000111111111000000",
]

const HIGH_SCALE_NINE_X = [
  "01111100000000111110",
  "01111100000000111110",
  "01111110000001111110",
  "00111111000011111100",
  "00111111000111111000",
  "00011111100111110000",
  "00001111111111110000",
  "00000111111111100000",
  "00000111111111000000",
  "00000011111111000000",
  "00000001111110000000",
  "00000001111110000000",
  "00000011111111000000",
  "00000111111111100000",
  "00000111111111100000",
  "00001111111111110000",
  "00011111100111111000",
  "00111111000011111100",
  "00111110000001111100",
  "01111110000001111110",
  "11111100000000111111",
  "11111000000000111111",
  "01110000000000001110",
]

const DENSE_SIX = [
  "..####.",
  ".######",
  ".##..##",
  "##.....",
  "######.",
  "###..##",
  "##....#",
  "##....#",
  ".##..##",
  ".#####.",
  "...##..",
]

const OPEN_LEFT_THREE = [
  "..######.",
  ".########",
  "......###",
  ".....###.",
  "..######.",
  "......###",
  "......###",
  "###...###",
  ".#######.",
]

const OPEN_BOTTOM_FOUR_WITH_ROUND_RESIDUE = [
  "##....##.",
  "##....##.",
  "##....##.",
  "########.",
  "......##.",
  "......##.",
  "......##.",
  "......##.",
  "....####.",
]

const CROSSED_TWO = [
  "..........#######......",
  "..........#######......",
  ".........########......",
  ".........#######.......",
  "........############...",
  "........#############..",
  "........##############.",
  ".......#########....###",
  ".......########.....###",
  "......#########.....###",
  "......########......###",
  "......#######.......###",
  ".....########......###.",
  ".....########.....###..",
  ".....#######.....####..",
  "....########...####....",
  "....#######...####.....",
  "....#######..####......",
  "...########..###.......",
  "...########.###########",
  "..########..###########",
  "..########..###########",
  "..#######..............",
  ".########..............",
  ".########..............",
  "########...............",
  "########...............",
]

const DIAGONAL_SEVEN = [
  "########",
  "########",
  ".....###",
  "....###.",
  "...###..",
  "..###...",
  ".###....",
  ".###....",
]

const HIGH_SCALE_SEVEN = [
  "##########.",
  "###########",
  "##########.",
  ".......###.",
  "......###..",
  ".....###...",
  ".....###...",
  ".....##....",
  "....###....",
  "....##.....",
  "...###.....",
  "...###.....",
  "...##......",
  "..###......",
  "..###......",
  "..###......",
]

const NARROW_HIGH_SCALE_SEVEN = [
  "###########",
  "###########",
  "...#####...",
  "......###..",
  "......###..",
  ".....###...",
  ".....##....",
  "....###....",
  "....###....",
  "....##.....",
  "...###.....",
  "...###.....",
  "...##......",
  "..###......",
  "..###......",
  "..###......",
]

const DENSE_X = [
  ".#...#.",
  ".##.##.",
  "..###..",
  "..###..",
  "..###..",
  ".##.##.",
  "##...##",
]

const TALL_DENSE_X = [
  "###.....##.",
  ".###...###.",
  ".###..####.",
  "..#######..",
  "...#####...",
  "...####....",
  "....###....",
  "...#####...",
  "..#######..",
  ".####.###..",
  ".###...###.",
  "###.....###",
  "###.....##.",
]

const SMALL_X = [
  "#...#",
  ".#.#.",
  "..#..",
  ".#.#.",
  "#...#",
]

const PART_TOP_FRAGMENT = [
  "00111100",
  "01111110",
  "11000011",
  "11000011",
  "01111110",
  "00111100",
]

const RAISED_FALSE_SIX = [
  "01111",
  "10000",
  "10000",
  "11110",
  "10001",
  "10001",
  "01110",
]

const RAISED_FALSE_X = [
  "10001",
  "01010",
  "00100",
  "01010",
  "10001",
]

const TEST_WEAK_EDGE_PART = { b: 235, g: 216, r: 218 }
const TEST_WEAK_FOREGROUND_PART = { b: 244, g: 216, r: 210 }

const LARGE_PAGE_WIDTH = 220
const LARGE_PAGE_HEIGHT = 240
const LARGE_CALLOUT_REGION = { height: 210, width: 190, x: 12, y: 10 }
const LARGE_GLYPHS: Record<string, readonly string[]> = {
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["11110", "00001", "00001", "11110", "10000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["10010", "10010", "10010", "11111", "00010", "00010", "00010"],
  "x": ["10001", "01010", "00100", "01010", "10001"],
}

function createLargeCallout(): CalloutPartCalloutInput {
  return {
    background: TEST_BLUE_PANEL,
    id: "large-callout-1",
    pageNumber: 1,
    region: LARGE_CALLOUT_REGION,
  }
}

function createQuantityCandidate(
  text: string,
  x: number,
  y: number,
  width: number,
  height = 11,
): QuantityCandidate {
  return {
    confidence: 0.82,
    glyphs: [],
    region: {
      height,
      width,
      x,
      y,
    },
    text,
    value: Number.parseInt(text, 10),
  }
}

function createTestQuantityLabel(text: string, x: number, y: number): CalloutQuantityLabel {
  return {
    confidence: 0.9,
    region: {
      height: 11,
      width: Math.max(12, text.length * 6),
      x,
      y,
    },
    text,
    value: Number.parseInt(text, 10),
  }
}

function isCandidateCenterInBand(candidate: QuantityCandidate, band: Region): boolean {
  const centerX = candidate.region.x + candidate.region.width / 2
  const centerY = candidate.region.y + candidate.region.height / 2

  return centerX >= band.x &&
    centerX <= band.x + band.width &&
    centerY >= band.y &&
    centerY <= band.y + band.height
}

function createLargeSyntheticPage(
  paint: (data: Uint8ClampedArray, width: number) => void,
) {
  const data = new Uint8ClampedArray(LARGE_PAGE_WIDTH * LARGE_PAGE_HEIGHT * 4)

  paintLargeRegion(data, LARGE_PAGE_WIDTH, { height: LARGE_PAGE_HEIGHT, width: LARGE_PAGE_WIDTH, x: 0, y: 0 }, { b: 255, g: 255, r: 255 })
  paint(data, LARGE_PAGE_WIDTH)

  return {
    data,
    height: LARGE_PAGE_HEIGHT,
    pageNumber: 1,
    width: LARGE_PAGE_WIDTH,
  }
}

function createWideSyntheticPage(
  width: number,
  height: number,
  paint: (data: Uint8ClampedArray, width: number) => void,
) {
  const data = new Uint8ClampedArray(width * height * 4)

  paintLargeRegion(data, width, { height, width, x: 0, y: 0 }, { b: 255, g: 255, r: 255 })
  paint(data, width)

  return {
    data,
    height,
    pageNumber: 1,
    width,
  }
}

function paintLargeBorder(
  data: Uint8ClampedArray,
  width: number,
  region: Region,
  color: typeof TEST_BLACK,
): void {
  paintLargeRegion(data, width, { height: 2, width: region.width, x: region.x, y: region.y }, color)
  paintLargeRegion(data, width, { height: 2, width: region.width, x: region.x, y: region.y + region.height - 2 }, color)
  paintLargeRegion(data, width, { height: region.height, width: 2, x: region.x, y: region.y }, color)
  paintLargeRegion(data, width, { height: region.height, width: 2, x: region.x + region.width - 2, y: region.y }, color)
}

function paintLargeRegion(
  data: Uint8ClampedArray,
  width: number,
  region: Region,
  color: typeof TEST_BLACK,
): void {
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const index = (y * width + x) * 4

      data[index] = color.r
      data[index + 1] = color.g
      data[index + 2] = color.b
      data[index + 3] = 255
    }
  }
}

function paintLargeRasterQuantityLabel(
  data: Uint8ClampedArray,
  width: number,
  text: string,
  x: number,
  y: number,
): void {
  let cursor = x

  for (const character of text.toLowerCase()) {
    const glyph = LARGE_GLYPHS[character]

    if (!glyph) {
      cursor += 4
      continue
    }

    paintLargeGlyph(data, width, glyph, cursor, y)
    cursor += glyph[0].length + 1
  }
}

function paintLargeScaledRasterQuantityLabel(
  data: Uint8ClampedArray,
  width: number,
  text: string,
  x: number,
  y: number,
  scale: number,
): void {
  let cursor = x

  for (const character of text.toLowerCase()) {
    const sourceGlyph = LARGE_GLYPHS[character]

    if (!sourceGlyph) {
      cursor += 4
      continue
    }

    const glyph = scaleGlyph(sourceGlyph, scale)

    paintLargeGlyph(data, width, glyph, cursor, y)
    cursor += glyph[0].length + 2
  }
}

function paintLargeGlyph(
  data: Uint8ClampedArray,
  width: number,
  glyph: readonly string[],
  x: number,
  y: number,
): void {
  for (let row = 0; row < glyph.length; row += 1) {
    for (let column = 0; column < glyph[row].length; column += 1) {
      if (glyph[row][column] !== "1") {
        continue
      }

      const index = ((y + row) * width + x + column) * 4

      data[index] = TEST_BLACK.r
      data[index + 1] = TEST_BLACK.g
      data[index + 2] = TEST_BLACK.b
      data[index + 3] = 255
    }
  }
}
