import { describe, expect, it } from "vitest"
import { createGlyphFromPixels } from "../glyph-mask"
import type { QuantityCandidate } from "../quantity-candidate-types"
import { rejectPartArtCandidates } from "../quantity-part-art-rejection"
import { rejectOversizedRaisedRows } from "../quantity-row-clustering"
import type { Region } from "../contracts"
import {
  TEST_BLACK,
  TEST_BLUE_PANEL,
  TEST_GRAY_PART,
  createSyntheticPage,
} from "./synthetic-page"

const LARGE_PAGE_WIDTH = 220
const LARGE_PAGE_HEIGHT = 240
const LARGE_CALLOUT_REGION = { height: 210, width: 190, x: 12, y: 10 }

describe("quantity part-art rejection", () => {
  it("counts overlapping retry candidates once when rejecting sparse high-value part art", () => {
    const page = createSyntheticPage()
    const candidates = [
      createQuantityCandidate("4x", 59, 190, 15),
      createQuantityCandidate("4x", 59, 190, 15),
      createQuantityCandidate("1x", 100, 196, 14),
      createQuantityCandidate("1x", 140, 198, 14),
      createQuantityCandidate("1x", 60, 246, 14),
    ]

    expect(rejectPartArtCandidates(page, TEST_BLUE_PANEL, candidates).map((candidate) => candidate.region.x))
      .not.toContain(59)
  })

  it("rejects oversized upper-row retry part art against real printed labels", () => {
    const page = createSyntheticPage()
    const candidates = [
      createQuantityCandidate("8x", 207, 71, 53, 23),
      createQuantityCandidate("1x", 140, 94, 14),
      createQuantityCandidate("4x", 172, 94, 16),
      createQuantityCandidate("4x", 206, 94, 16),
      createQuantityCandidate("1x", 236, 94, 14),
      createQuantityCandidate("2x", 269, 94, 15),
      createQuantityCandidate("2x", 303, 94, 15),
      createQuantityCandidate("1x", 212, 160, 14),
    ]

    expect(rejectPartArtCandidates(page, TEST_BLUE_PANEL, candidates).map((candidate) => candidate.region.x))
      .not.toContain(207)
  })

  it("rejects dense raised part-art rows above real printed baseline labels", () => {
    const fakeRow = [
      createQuantityCandidate("4x", 42, 52, 17, 13),
      createQuantityCandidate("4x", 72, 52, 17, 13),
      createQuantityCandidate("4x", 102, 52, 17, 13),
      createQuantityCandidate("4x", 132, 52, 17, 13),
    ]
    const realRows = [
      createQuantityCandidate("6x", 42, 76, 15),
      createQuantityCandidate("2x", 72, 76, 15),
      createQuantityCandidate("4x", 102, 76, 16),
      createQuantityCandidate("4x", 132, 76, 16),
      createQuantityCandidate("2x", 42, 120, 14),
    ]
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)

      for (const candidate of fakeRow) {
        paintLargeRegion(data, width, candidate.region, TEST_GRAY_PART)
      }
    })

    expect(rejectPartArtCandidates(page, TEST_BLUE_PANEL, [...fakeRow, ...realRows]))
      .toEqual(realRows)
  })

  it("keeps glyph-backed raised rows out of the coarse row-level part-art filter", () => {
    const printedUpperRow = [
      createQuantityCandidateWithGlyphs("1x", 42, 52, 14, 13),
      createQuantityCandidateWithGlyphs("3x", 72, 52, 15, 13),
      createQuantityCandidateWithGlyphs("4x", 102, 52, 16, 13),
      createQuantityCandidateWithGlyphs("2x", 132, 52, 15, 13),
    ]
    const lowerRow = [
      createQuantityCandidateWithGlyphs("1x", 42, 76, 14),
      createQuantityCandidateWithGlyphs("2x", 72, 76, 15),
      createQuantityCandidateWithGlyphs("2x", 102, 76, 15),
      createQuantityCandidateWithGlyphs("2x", 132, 76, 15),
      createQuantityCandidateWithGlyphs("4x", 162, 76, 16),
    ]
    const result = rejectOversizedRaisedRows([...printedUpperRow, ...lowerRow])

    for (const candidate of printedUpperRow) {
      expect(result).toContain(candidate)
    }
  })

  it("rejects glyph-backed raised rows when they are much taller than lower labels", () => {
    const oversizedUpperRow = [
      createQuantityCandidateWithGlyphs("9x", 42, 52, 18, 16),
    ]
    const lowerRow = [
      createQuantityCandidateWithGlyphs("1x", 42, 70, 14),
      createQuantityCandidateWithGlyphs("1x", 72, 70, 14),
      createQuantityCandidateWithGlyphs("1x", 102, 70, 14),
    ]
    const result = rejectOversizedRaisedRows([...oversizedUpperRow, ...lowerRow])

    expect(result).not.toContain(oversizedUpperRow[0])
  })

  it("rejects orphan upper one labels even when unrelated candidates are present", () => {
    const upperPartArt = createQuantityCandidateWithGlyphs("1x", 82, 54, 14)
    const lowerRow = [
      createQuantityCandidateWithGlyphs("1x", 52, 88, 14),
      createQuantityCandidateWithGlyphs("1x", 82, 88, 14),
    ]
    const unrelated = createQuantityCandidateWithGlyphs("4x", 132, 88, 16)
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, { height: 16, width: 24, x: 82, y: 54 }, TEST_GRAY_PART)
      for (const candidate of lowerRow) {
        paintLargeRegion(data, width, candidate.region, TEST_BLACK)
      }
    })
    const result = rejectPartArtCandidates(page, TEST_BLUE_PANEL, [upperPartArt, ...lowerRow, unrelated])

    expect(result).not.toContain(upperPartArt)
    expect(result).toEqual(expect.arrayContaining([...lowerRow, unrelated]))
  })

  it("keeps high-value printed labels without a close lower competing row", () => {
    const realLabel = createQuantityCandidate("6x", 42, 76, 15)
    const sameRow = [
      createQuantityCandidate("2x", 72, 76, 15),
      createQuantityCandidate("7x", 102, 76, 15),
    ]
    const lowerRow = [
      createQuantityCandidate("3x", 42, 138, 14),
      createQuantityCandidate("4x", 72, 138, 15),
    ]
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, { height: 8, width: 18, x: 42, y: 58 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, realLabel.region, TEST_BLACK)
    })

    expect(rejectPartArtCandidates(page, TEST_BLUE_PANEL, [realLabel, ...sameRow, ...lowerRow]))
      .toContain(realLabel)
  })

  it("keeps bottom-row high-value printed labels with a part directly above", () => {
    const callout = { height: 132, width: 148, x: 12, y: 10 }
    const bottomLabel = createQuantityCandidateWithGlyphs("6x", 34, 112, 15)
    const candidates = [
      createQuantityCandidateWithGlyphs("7x", 34, 70, 15),
      createQuantityCandidateWithGlyphs("7x", 64, 70, 15),
      createQuantityCandidateWithGlyphs("1x", 112, 70, 14),
      bottomLabel,
    ]
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, callout, TEST_BLACK)
      paintLargeRegion(data, width, { height: 18, width: 22, x: 34, y: 48 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 20, width: 36, x: 64, y: 44 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 18, width: 26, x: 112, y: 48 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 24, width: 30, x: 34, y: 88 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 3, width: 8, x: 34, y: 116 }, TEST_GRAY_PART)
    })
    const result = rejectPartArtCandidates(page, TEST_BLUE_PANEL, candidates)

    expect(result).toContain(bottomLabel)
  })

  it("keeps bottom-row high-value printed labels when the part overlaps below the label", () => {
    const callout = { height: 132, width: 148, x: 12, y: 10 }
    const bottomLabel = createQuantityCandidateWithGlyphs("4x", 70, 112, 15)
    const candidates = [
      createQuantityCandidateWithGlyphs("4x", 34, 112, 15),
      createQuantityCandidateWithGlyphs("1x", 52, 112, 14),
      bottomLabel,
      createQuantityCandidateWithGlyphs("2x", 92, 112, 15),
      createQuantityCandidateWithGlyphs("4x", 116, 112, 15),
    ]
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, callout, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, callout, TEST_BLACK)
      paintLargeRegion(data, width, { height: 34, width: 32, x: 68, y: 84 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 4, width: 10, x: 72, y: 118 }, TEST_GRAY_PART)
    })
    const result = rejectPartArtCandidates(page, TEST_BLUE_PANEL, candidates)

    expect(result).toContain(bottomLabel)
  })

  it("keeps a glyph-backed four label with a same-row peer when part ink overlaps the label box", () => {
    const printedFour = createQuantityCandidateWithGlyphs("4x", 42, 76, 45, 31)
    const printedPeer = createQuantityCandidateWithGlyphs("1x", 132, 76, 41, 31)
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, { height: 34, width: 38, x: 42, y: 36 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 28, width: 82, x: 128, y: 42 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, printedFour.region, TEST_BLACK)
      paintLargeRegion(data, width, printedPeer.region, TEST_BLACK)
    })
    const result = rejectPartArtCandidates(page, TEST_BLUE_PANEL, [printedFour, printedPeer])

    expect(result).toContain(printedFour)
    expect(result).toContain(printedPeer)
  })

  it("leaves low-value embedded candidates for post-extraction row quality checks", () => {
    const embeddedCandidate = createQuantityCandidateWithGlyphs("2x", 42, 76, 15)
    const realLabels = [
      createQuantityCandidateWithGlyphs("1x", 42, 104, 14),
      createQuantityCandidateWithGlyphs("1x", 82, 104, 14),
    ]
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, { height: 24, width: 34, x: 38, y: 70 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 18, width: 24, x: 42, y: 84 }, TEST_GRAY_PART)
    })

    expect(rejectPartArtCandidates(page, TEST_BLUE_PANEL, [embeddedCandidate, ...realLabels]))
      .toContain(embeddedCandidate)
  })

  it("keeps low-value printed labels with same-row printed peers", () => {
    const realLabel = createQuantityCandidateWithGlyphs("2x", 42, 76, 15)
    const candidates = [
      realLabel,
      createQuantityCandidateWithGlyphs("3x", 76, 76, 15),
      createQuantityCandidateWithGlyphs("1x", 112, 76, 14),
      createQuantityCandidateWithGlyphs("1x", 42, 122, 14),
    ]
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, { height: 16, width: 20, x: 42, y: 54 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 14, width: 24, x: 76, y: 56 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 16, width: 22, x: 112, y: 52 }, TEST_GRAY_PART)
    })

    expect(rejectPartArtCandidates(page, TEST_BLUE_PANEL, candidates))
      .toContain(realLabel)
  })

  it("keeps low-value printed labels on staggered rows when a part sits above", () => {
    const staggeredLabel = createQuantityCandidateWithGlyphs("1x", 42, 104, 14)
    const candidates = [
      createQuantityCandidateWithGlyphs("2x", 38, 60, 15),
      createQuantityCandidateWithGlyphs("1x", 74, 60, 14),
      staggeredLabel,
      createQuantityCandidateWithGlyphs("1x", 86, 116, 14),
      createQuantityCandidateWithGlyphs("1x", 124, 118, 14),
    ]
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, { height: 28, width: 42, x: 38, y: 74 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 34, width: 50, x: 84, y: 76 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, { height: 34, width: 52, x: 122, y: 78 }, TEST_GRAY_PART)
    })

    expect(rejectPartArtCandidates(page, TEST_BLUE_PANEL, candidates))
      .toContain(staggeredLabel)
  })

  it("rejects orphan upper one-shaped part art above a complete lower peer row", () => {
    const orphanUpper = createQuantityCandidateWithGlyphs("1x", 70, 52, 14)
    const lowerRow = [
      createQuantityCandidateWithGlyphs("1x", 42, 90, 14),
      createQuantityCandidateWithGlyphs("1x", 70, 90, 14),
    ]
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, { height: 21, width: 26, x: 64, y: 34 }, TEST_GRAY_PART)
    })

    expect(rejectPartArtCandidates(page, TEST_BLUE_PANEL, [orphanUpper, ...lowerRow]))
      .not.toContain(orphanUpper)
  })

  it("keeps a detected upper peer when the missing upper peer has printed ink", () => {
    const detectedUpper = createQuantityCandidateWithGlyphs("1x", 70, 52, 14)
    const lowerRow = [
      createQuantityCandidateWithGlyphs("1x", 42, 90, 14),
      createQuantityCandidateWithGlyphs("1x", 70, 90, 14),
    ]
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, { height: 20, width: 28, x: 38, y: 30 }, TEST_GRAY_PART)
      paintSparseLargeLabelInk(data, width, { height: 11, width: 14, x: 42, y: 52 })
    })

    expect(rejectPartArtCandidates(page, TEST_BLUE_PANEL, [detectedUpper, ...lowerRow]))
      .toContain(detectedUpper)
  })

  it("rejects sparse high-value part art even when foreground sits above it", () => {
    const fakeLabel = createQuantityCandidate("4x", 42, 76, 15)
    const closeLowerRow = [
      createQuantityCandidate("1x", 72, 82, 14),
      createQuantityCandidate("1x", 102, 84, 14),
      createQuantityCandidate("1x", 42, 122, 14),
    ]
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, { height: 9, width: 18, x: 42, y: 59 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, fakeLabel.region, TEST_BLACK)
    })

    expect(rejectPartArtCandidates(page, TEST_BLUE_PANEL, [fakeLabel, ...closeLowerRow]))
      .not.toContain(fakeLabel)
  })

  it("rejects glyph-backed sparse four art above a close lower row", () => {
    const fakeLabel = createQuantityCandidateWithGlyphs("4x", 42, 76, 15)
    const closeLowerRow = [
      createQuantityCandidateWithGlyphs("1x", 72, 82, 14),
      createQuantityCandidateWithGlyphs("1x", 102, 84, 14),
      createQuantityCandidateWithGlyphs("1x", 42, 122, 14),
    ]
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      paintLargeRegion(data, width, { height: 11, width: 28, x: 42, y: 58 }, TEST_GRAY_PART)
      paintLargeRegion(data, width, fakeLabel.region, TEST_BLACK)
    })

    expect(rejectPartArtCandidates(page, TEST_BLUE_PANEL, [fakeLabel, ...closeLowerRow]))
      .not.toContain(fakeLabel)
  })

  it("keeps printed baseline labels supported by raised same-column part art", () => {
    const raisedPartArt = [
      createQuantityCandidate("4x", 42, 60, 17, 13),
      createQuantityCandidate("4x", 72, 60, 17, 13),
      createQuantityCandidate("4x", 102, 60, 17, 13),
    ]
    const realLabel = createQuantityCandidate("6x", 42, 76, 15)
    const sameRow = [
      createQuantityCandidate("2x", 72, 76, 15),
      createQuantityCandidate("7x", 102, 76, 15),
    ]
    const lowerRow = [
      createQuantityCandidate("3x", 42, 120, 14),
      createQuantityCandidate("4x", 72, 120, 15),
    ]
    const page = createLargeSyntheticPage((data, width) => {
      paintLargeRegion(data, width, LARGE_CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLargeBorder(data, width, LARGE_CALLOUT_REGION, TEST_BLACK)
      for (const candidate of raisedPartArt) {
        paintLargeRegion(data, width, candidate.region, TEST_GRAY_PART)
      }
      paintLargeRegion(data, width, realLabel.region, TEST_BLACK)
      paintLargeRegion(data, width, { height: 4, width: 8, x: realLabel.region.x, y: realLabel.region.y + realLabel.region.height }, TEST_GRAY_PART)
    })
    const result = rejectPartArtCandidates(page, TEST_BLUE_PANEL, [...raisedPartArt, realLabel, ...sameRow, ...lowerRow])

    expect(result).toContain(realLabel)
    for (const candidate of raisedPartArt) {
      expect(result).not.toContain(candidate)
    }
  })
})

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

function createQuantityCandidateWithGlyphs(
  text: string,
  x: number,
  y: number,
  width: number,
  height = 11,
): QuantityCandidate {
  const candidate = createQuantityCandidate(text, x, y, width, height)
  const digitGlyph = createTestGlyph({ height: Math.max(4, height - 2), width: Math.max(3, Math.floor(width * 0.42)), x, y })
  const xGlyph = createTestGlyph({
    height: Math.max(4, height - 2),
    width: Math.max(3, Math.floor(width * 0.35)),
    x: x + Math.max(5, Math.floor(width * 0.55)),
    y,
  })

  return {
    ...candidate,
    glyphs: [digitGlyph, xGlyph],
  }
}

function createTestGlyph(region: Region): NonNullable<QuantityCandidate["glyphs"][number]> {
  const pixels = []

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      pixels.push({ x, y })
    }
  }

  const glyph = createGlyphFromPixels(pixels)

  if (!glyph) {
    throw new Error("Expected test glyph.")
  }

  return glyph
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

function paintSparseLargeLabelInk(
  data: Uint8ClampedArray,
  width: number,
  region: Region,
): void {
  const points = [
    [3, 1],
    [6, 1],
    [8, 1],
    [11, 1],
    [4, 3],
    [7, 3],
    [10, 3],
    [12, 3],
    [5, 5],
    [8, 5],
    [11, 5],
    [4, 7],
    [9, 7],
  ]

  for (const [x, y] of points) {
    paintLargeRegion(data, width, { height: 1, width: 1, x: region.x + x, y: region.y + y }, TEST_BLACK)
  }
}
