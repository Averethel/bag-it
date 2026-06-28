import { describe, expect, it } from "vitest"
import {
  detectStepCalloutCandidates,
  detectStepCalloutCandidatesForPage,
} from "../callout-candidates"
import type {
  StepCalloutCandidate,
  StepCalloutCandidateSource,
  StepCalloutRegion,
} from "../contracts"
import { stepCalloutRegionOverlapRatio } from "../regions"
import {
  createSyntheticStepCalloutPage,
  paintBorder,
  paintRegion,
  TEST_BLACK,
  TEST_BLUE_PANEL,
} from "./helpers/synthetic-page-test-helper"

const BORDERED_CALLOUT = { height: 30, width: 42, x: 12, y: 10 }
const FILL_PANEL_CALLOUT = { height: 28, width: 36, x: 68, y: 22 }
const TEST_LIGHT_OUTLINE = { a: 255, b: 168, g: 168, r: 168 }

describe("stepCallout callout candidates", () => {
  it("emits broad border and fill-panel candidates with stable ids", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintBorder(data, BORDERED_CALLOUT, TEST_BLACK)
      paintRegion(data, FILL_PANEL_CALLOUT, TEST_BLUE_PANEL)
    })

    const candidates = detectStepCalloutCandidatesForPage(page)

    expect(hasCandidate(candidates, "border", BORDERED_CALLOUT)).toBe(true)
    expect(hasCandidate(candidates, "fill-panel", FILL_PANEL_CALLOUT)).toBe(true)
    expect(candidates.map((candidate) => candidate.id)).toEqual([
      "p1-border-001",
      "p1-fill-panel-001",
    ])
  })

  it("emits stage snapshot counts without final acceptance decisions", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintBorder(data, BORDERED_CALLOUT, TEST_BLACK)
    })

    expect(detectStepCalloutCandidates([page]).snapshot).toMatchObject({
      counts: {
        accepted: 1,
        rejected: 0,
        total: 1,
      },
      stageId: "callout-candidates",
    })
  })

  it("does not emit candidates for blank page input", () => {
    expect(detectStepCalloutCandidatesForPage(createSyntheticStepCalloutPage()).length).toBe(0)
  })

  it("emits fill-panel candidates when foreground art occludes panel fill", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintRegion(data, FILL_PANEL_CALLOUT, TEST_BLUE_PANEL)
      paintRegion(data, { height: 16, width: 24, x: 74, y: 28 }, TEST_BLACK)
    })

    const candidates = detectStepCalloutCandidatesForPage(page)

    expect(hasCandidate(candidates, "fill-panel", FILL_PANEL_CALLOUT)).toBe(true)
  })

  it("emits same-background fill-panel candidates from light raster outlines", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintBorder(data, FILL_PANEL_CALLOUT, TEST_LIGHT_OUTLINE)
    })

    const candidates = detectStepCalloutCandidatesForPage(page)

    expect(hasCandidate(candidates, "fill-panel", FILL_PANEL_CALLOUT)).toBe(true)
  })

  it("emits broad top fill-panel candidates below the page-scale cap", () => {
    const broadPanel = { height: 30, width: 80, x: 16, y: 20 }
    const page = createSyntheticStepCalloutPage((data) => {
      paintRegion(data, broadPanel, TEST_BLUE_PANEL)
    })

    const candidates = detectStepCalloutCandidatesForPage(page)

    expect(hasCandidate(candidates, "fill-panel", broadPanel)).toBe(true)
  })

  it("emits broad top border candidates below the page-scale cap", () => {
    const broadBorder = { height: 30, width: 80, x: 16, y: 20 }
    const page = createSyntheticStepCalloutPage((data) => {
      paintBorder(data, broadBorder, TEST_BLACK)
    })

    const candidates = detectStepCalloutCandidatesForPage(page)

    expect(hasCandidate(candidates, "border", broadBorder)).toBe(true)
  })

  it("emits border candidates when an outline is connected to larger dark build art", () => {
    const mergedOutline = { height: 30, width: 84, x: 20, y: 10 }
    const page = createSyntheticStepCalloutPage((data) => {
      paintBorder(data, mergedOutline, TEST_BLACK)
      paintRegion(data, { height: 42, width: 24, x: 50, y: 38 }, TEST_BLACK)
    })

    const candidates = detectStepCalloutCandidatesForPage(page)

    expect(hasCandidate(candidates, "line-rectangle", mergedOutline)).toBe(true)
  })

  it("does not emit line-rectangle candidates for loose parallel dark lines", () => {
    const looseLines = { height: 30, width: 84, x: 20, y: 10 }
    const page = createSyntheticStepCalloutPage((data) => {
      paintRegion(data, { height: 2, width: looseLines.width, x: looseLines.x, y: looseLines.y }, TEST_BLACK)
      paintRegion(data, {
        height: 2,
        width: looseLines.width,
        x: looseLines.x,
        y: looseLines.y + looseLines.height - 2,
      }, TEST_BLACK)
    })

    const candidates = detectStepCalloutCandidatesForPage(page)

    expect(hasCandidate(candidates, "line-rectangle", looseLines)).toBe(false)
  })

  it("does not emit line-rectangle candidates for dense dark build-art blocks", () => {
    const denseArt = { height: 30, width: 84, x: 20, y: 10 }
    const page = createSyntheticStepCalloutPage((data) => {
      paintRegion(data, denseArt, TEST_BLACK)
    })

    const candidates = detectStepCalloutCandidatesForPage(page)

    expect(hasCandidate(candidates, "line-rectangle", denseArt)).toBe(false)
  })

  it("does not emit fill-panel candidates for oversized page regions", () => {
    const oversizedPanel = { height: 60, width: 90, x: 16, y: 12 }
    const page = createSyntheticStepCalloutPage((data) => {
      paintRegion(data, oversizedPanel, TEST_BLUE_PANEL)
    })

    const candidates = detectStepCalloutCandidatesForPage(page)

    expect(hasCandidate(candidates, "fill-panel", oversizedPanel)).toBe(false)
  })

  it("does not emit border candidates for oversized page regions", () => {
    const oversizedBorder = { height: 40, width: 80, x: 16, y: 20 }
    const page = createSyntheticStepCalloutPage((data) => {
      paintBorder(data, oversizedBorder, TEST_BLACK)
    })

    const candidates = detectStepCalloutCandidatesForPage(page)

    expect(hasCandidate(candidates, "border", oversizedBorder)).toBe(false)
  })
})

function hasCandidate(
  candidates: readonly StepCalloutCandidate[],
  source: StepCalloutCandidateSource,
  expectedRegion: StepCalloutRegion,
): boolean {
  return candidates.some(
    (candidate) =>
      candidate.source === source && stepCalloutRegionOverlapRatio(expectedRegion, candidate.region) >= 0.9,
  )
}
