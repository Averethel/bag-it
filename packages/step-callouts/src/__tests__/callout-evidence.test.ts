import { describe, expect, it } from "vitest"
import {
  scoreCandidateEvidence,
  scoreStepCalloutEvidence,
} from "../callout-evidence"
import type {
  StepCalloutCandidate,
  StepCalloutEvidenceScore,
  StepCalloutEvidenceSignal,
  StepCalloutRegion,
} from "../contracts"
import { createStepCalloutPageInput } from "../page-input"
import {
  createSyntheticStepCalloutPage,
  paintBorder,
  paintRasterQuantityLabel,
  paintRegion,
  TEST_BLACK,
  TEST_BLUE_PANEL,
  TEST_WHITE,
} from "./helpers/synthetic-page-test-helper"

const CALLOUT_REGION = { height: 30, width: 42, x: 12, y: 10 }

describe("stepCallout callout evidence", () => {
  it("scores border, background, and lower-row quantity evidence independently", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintRegion(data, CALLOUT_REGION, TEST_BLUE_PANEL)
      paintBorder(data, CALLOUT_REGION, TEST_BLACK)
      paintRasterQuantityLabel(data, "2x", 22, 28)
    })

    const evidence = scoreCandidateEvidence(page, createCandidate("border"))

    expect(readScore(evidence.scores, "border")).toMatchObject({
      reasons: expect.arrayContaining(["candidate-source-border", "dark-edge-coverage"]),
      value: expect.any(Number),
    })
    expect(readScore(evidence.scores, "background").reasons).toContain(
      "differs-from-page-background",
    )
    expect(readScore(evidence.scores, "quantity")).toEqual({
      reasons: ["raster-lower-row-quantity-label"],
      signal: "quantity",
      value: 1,
    })
    expect(evidence.background).toEqual({
      b: TEST_BLUE_PANEL.b,
      g: TEST_BLUE_PANEL.g,
      r: TEST_BLUE_PANEL.r,
    })
    expect(evidence.totalScore).toBeGreaterThan(2)
  })

  it("does not treat candidate source as border proof", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintRegion(data, { height: 8, width: 8, x: 28, y: 20 }, TEST_BLACK)
    })
    const evidence = scoreCandidateEvidence(page, createCandidate("border"))

    expect(readScore(evidence.scores, "border")).toMatchObject({
      reasons: ["candidate-source-border"],
      value: 0,
    })
  })

  it("keeps weak quantity evidence explicit instead of hiding it", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintBorder(data, CALLOUT_REGION, TEST_BLACK)
    })

    expect(readScore(scoreCandidateEvidence(page, createCandidate("border")).scores, "quantity"))
      .toEqual({
        reasons: ["no-raster-quantity-label"],
        signal: "quantity",
        value: 0,
      })
  })

  it("rejects label-like raster text fragments with loose glyph spacing", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintRegion(data, CALLOUT_REGION, TEST_BLUE_PANEL)
      paintLooseQuantityFragment(data, 22, 24)
    })

    expect(readScore(scoreCandidateEvidence(page, createCandidate("fill-panel")).scores, "quantity"))
      .toEqual({
        reasons: ["raster-quantity-label-rejected-as-text-fragment"],
        signal: "quantity",
        value: 0,
      })
  })

  it("accepts repeated lower-row quantity labels with wider printed glyph spacing", () => {
    const compactRegion = { height: 56, width: 137, x: 20, y: 20 }
    const page = createCustomStepCalloutPage(512, 512, (data, width) => {
      paintCustomRegion(data, width, compactRegion, TEST_BLUE_PANEL)
      paintLooseQuantityFragment(data, 30, 54, width)
      paintLooseQuantityFragment(data, 72, 54, width)
      paintLooseQuantityFragment(data, 114, 54, width)
    })

    expect(readScore(scoreCandidateEvidence(page, createCandidate("fill-panel", compactRegion)).scores, "quantity"))
      .toEqual({
        reasons: ["raster-lower-row-quantity-label"],
        signal: "quantity",
        value: 1,
      })
  })

  it("rejects oversized raster labels that are likely build art", () => {
    const oversizedLabelRegion = { height: 90, width: 140, x: 20, y: 20 }
    const page = createCustomStepCalloutPage(220, 150, (data, width) => {
      paintCustomRegion(data, width, oversizedLabelRegion, TEST_BLUE_PANEL)
      paintHugeQuantityFragment(data, width, 42, 54)
    })
    const quantity = readScore(
      scoreCandidateEvidence(page, createCandidate("fill-panel", oversizedLabelRegion)).scores,
      "quantity",
    )

    expect(quantity.value).toBe(0)
    expect(quantity.reasons).not.toContain("raster-lower-row-quantity-label")
  })

  it("uses glyph-row quantity fallback for compact candidates", () => {
    const compactRegion = { height: 60, width: 120, x: 20, y: 20 }
    const page = createCustomStepCalloutPage(512, 512, (data, width) => {
      paintCustomRegion(data, width, compactRegion, TEST_BLUE_PANEL)
      paintFallbackGlyphRow(data, width, 44, 62)
    })

    expect(readScore(scoreCandidateEvidence(page, createCandidate("fill-panel", compactRegion)).scores, "quantity"))
      .toEqual({
        reasons: ["raster-lower-row-quantity-glyphs"],
        signal: "quantity",
        value: 1,
      })
  })

  it("does not use glyph-row quantity fallback for oversized fill panels", () => {
    const oversizedRegion = { height: 80, width: 300, x: 20, y: 20 }
    const page = createCustomStepCalloutPage(512, 512, (data, width) => {
      paintCustomRegion(data, width, oversizedRegion, TEST_BLUE_PANEL)
      paintFallbackGlyphRow(data, width, 44, 74)
    })

    expect(readScore(scoreCandidateEvidence(page, createCandidate("fill-panel", oversizedRegion)).scores, "quantity"))
      .toEqual({
        reasons: ["no-raster-quantity-label"],
        signal: "quantity",
        value: 0,
      })
  })

  it("emits evidence stage snapshot without resolver decisions", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintBorder(data, CALLOUT_REGION, TEST_BLACK)
    })

    expect(scoreStepCalloutEvidence([page], [createCandidate("border")]).snapshot).toMatchObject({
      counts: {
        accepted: 1,
        rejected: 0,
        total: 1,
      },
      stageId: "callout-evidence",
    })
  })
})

function createCandidate(
  source: StepCalloutCandidate["source"],
  region: StepCalloutRegion = CALLOUT_REGION,
): StepCalloutCandidate {
  return {
    id: `candidate-${source}`,
    pageNumber: 1,
    region,
    source,
  }
}

function readScore(
  scores: readonly StepCalloutEvidenceScore[],
  signal: StepCalloutEvidenceSignal,
): StepCalloutEvidenceScore {
  const score = scores.find((item) => item.signal === signal)

  if (!score) {
    throw new Error(`missing ${signal} evidence score`)
  }

  return score
}

function paintLooseQuantityFragment(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  pageWidth?: number,
): void {
  const scale = 2
  const looseGap = 6
  const oneGlyph = [
    "00100",
    "01100",
    "00100",
    "00100",
    "00100",
    "00100",
    "01110",
  ]
  const xGlyph = [
    "10001",
    "01010",
    "00100",
    "01010",
    "10001",
  ]

  if (pageWidth === undefined) {
    paintScaledRasterGlyph(data, oneGlyph, x, y, scale)
    paintScaledRasterGlyph(data, xGlyph, x + oneGlyph[0].length * scale + looseGap, y + 4, scale)
    return
  }

  paintScaledCustomRasterGlyph(data, pageWidth, oneGlyph, x, y, scale)
  paintScaledCustomRasterGlyph(data, pageWidth, xGlyph, x + oneGlyph[0].length * scale + looseGap, y + 4, scale)
}

function paintScaledRasterGlyph(
  data: Uint8ClampedArray,
  glyph: readonly string[],
  x: number,
  y: number,
  scale: number,
): void {
  for (let row = 0; row < glyph.length; row += 1) {
    for (let column = 0; column < glyph[row].length; column += 1) {
      if (glyph[row][column] !== "1") {
        continue
      }

      paintRegion(data, {
        height: scale,
        width: scale,
        x: x + column * scale,
        y: y + row * scale,
      }, TEST_BLACK)
    }
  }
}

function createCustomStepCalloutPage(
  width: number,
  height: number,
  draw: (data: Uint8ClampedArray, width: number, height: number) => void,
) {
  const data = new Uint8ClampedArray(width * height * 4)

  paintCustomRegion(data, width, { height, width, x: 0, y: 0 }, TEST_WHITE)
  draw(data, width, height)

  return createStepCalloutPageInput({
    data,
    height,
    pageNumber: 1,
    width,
  })
}

function paintCustomRegion(
  data: Uint8ClampedArray,
  pageWidth: number,
  region: StepCalloutRegion,
  color: typeof TEST_BLACK,
): void {
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const offset = (y * pageWidth + x) * 4

      data[offset] = color.r
      data[offset + 1] = color.g
      data[offset + 2] = color.b
      data[offset + 3] = color.a
    }
  }
}

function paintFallbackGlyphRow(
  data: Uint8ClampedArray,
  pageWidth: number,
  x: number,
  y: number,
): void {
  const oneGlyph = [
    "00100",
    "01100",
    "00100",
    "00100",
    "00100",
    "00100",
    "01110",
  ]

  for (let index = 0; index < 3; index += 1) {
    paintCustomRasterGlyph(data, pageWidth, oneGlyph, x + index * 10, y)
  }
}

function paintHugeQuantityFragment(
  data: Uint8ClampedArray,
  pageWidth: number,
  x: number,
  y: number,
): void {
  const scale = 6
  const eightGlyph = [
    "01110",
    "10001",
    "10001",
    "01110",
    "10001",
    "10001",
    "01110",
  ]
  const xGlyph = [
    "10001",
    "01010",
    "00100",
    "01010",
    "10001",
  ]

  paintScaledCustomRasterGlyph(data, pageWidth, eightGlyph, x, y, scale)
  paintScaledCustomRasterGlyph(data, pageWidth, xGlyph, x + eightGlyph[0].length * scale + 6, y + 8, scale)
}

function paintScaledCustomRasterGlyph(
  data: Uint8ClampedArray,
  pageWidth: number,
  glyph: readonly string[],
  x: number,
  y: number,
  scale: number,
): void {
  for (let row = 0; row < glyph.length; row += 1) {
    for (let column = 0; column < glyph[row].length; column += 1) {
      if (glyph[row][column] !== "1") {
        continue
      }

      paintCustomRegion(data, pageWidth, {
        height: scale,
        width: scale,
        x: x + column * scale,
        y: y + row * scale,
      }, TEST_BLACK)
    }
  }
}

function paintCustomRasterGlyph(
  data: Uint8ClampedArray,
  pageWidth: number,
  glyph: readonly string[],
  x: number,
  y: number,
): void {
  for (let row = 0; row < glyph.length; row += 1) {
    for (let column = 0; column < glyph[row].length; column += 1) {
      if (glyph[row][column] !== "1") {
        continue
      }

      paintCustomRegion(data, pageWidth, {
        height: 1,
        width: 1,
        x: x + column,
        y: y + row,
      }, TEST_BLACK)
    }
  }
}
