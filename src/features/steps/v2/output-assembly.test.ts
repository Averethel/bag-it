import { describe, expect, it } from "vitest"
import type { CalloutPartItem } from "@bag-it/callout-parts"
import { assembleV2BuildStepsResult } from "./output-assembly"
import type {
  StepDetectorV2CandidateEvidence,
  StepDetectorV2ResolvedCallout,
} from "./contracts"
import {
  createSyntheticV2Page,
  paintRegion,
  TEST_BLUE_PANEL,
  TEST_PAGE_HEIGHT,
  TEST_PAGE_WIDTH,
} from "./synthetic-page-test-helper"

const ACCEPTED_REGION = { height: 30, width: 42, x: 12, y: 10 }
const DIAGNOSTIC_REGION = { height: 22, width: 36, x: 68, y: 22 }

describe("v2 output assembly", () => {
  it("maps accepted callouts to Build steps and leaves diagnostics out of app output", () => {
    const result = assembleV2BuildStepsResult(
      [
        createSyntheticV2Page((data) => {
          paintRegion(data, ACCEPTED_REGION, TEST_BLUE_PANEL)
          paintRegion(data, DIAGNOSTIC_REGION, TEST_BLUE_PANEL)
        }),
      ],
      [
        createResolvedCallout("accepted", ACCEPTED_REGION, "accepted"),
        createResolvedCallout("diagnostic", DIAGNOSTIC_REGION, "diagnostic"),
        createResolvedCallout("rejected", { height: 10, width: 10, x: 1, y: 1 }, "rejected"),
      ],
      [
        createEvidence("accepted", ACCEPTED_REGION, 2.7, 0.9),
        createEvidence("diagnostic", DIAGNOSTIC_REGION, 1.4, 0.7),
      ],
      {
        detectorVersion: "v2-test",
        pageCount: 1,
        pageLimit: null,
        partItems: [createPartItem()],
        partExtractorVersion: "v2-disabled-test",
      },
    )

    expect(result).toMatchObject({
      detectorVersion: "v2-test",
      pageCount: 1,
      pageLimit: null,
      partExtractorVersion: "v2-disabled-test",
      scannedPageNumbers: [1],
      status: "detected",
    })
    expect(result.pagePreviews).toEqual([
      {
        height: TEST_PAGE_HEIGHT,
        pageNumber: 1,
        width: TEST_PAGE_WIDTH,
      },
    ])
    expect(result.callouts.map((callout) => callout.id)).toEqual([
      "v2-accepted",
    ])
    expect(result.callouts.map((callout) => ({
      crop: callout.crop.region,
      source: callout.sourceRegion,
    }))).toEqual([
      {
        crop: { height: 46, width: 58, x: 4, y: 2 },
        source: ACCEPTED_REGION,
      },
    ])
    expect(result.callouts[0].partItems).toMatchObject([
      {
        id: "v2-accepted-part-0",
        indexOnCallout: 0,
        partImage: {
          alphaMask: {
            data: expect.any(Uint8ClampedArray),
            height: 8,
            width: 14,
          },
          region: { height: 8, width: 14, x: 20, y: 18 },
        },
        partRegion: { height: 8, width: 14, x: 20, y: 18 },
        quantity: {
          text: "1x",
          value: 1,
        },
        quantityLabel: {
          crop: {
            region: { height: 5, width: 8, x: 24, y: 34 },
          },
          region: { height: 5, width: 8, x: 24, y: 34 },
        },
      },
    ])
    expect("partCrop" in result.callouts[0].partItems[0]).toBe(false)
    expect(result.callouts.map((callout) => callout.inferredBackground)).toEqual([
      {
        confidence: 0.9,
        hex: "#c6e2fa",
        rgb: {
          b: 250,
          g: 226,
          r: 198,
        },
      },
    ])
  })

  it("reports empty status when all resolved callouts are rejected", () => {
    const result = assembleV2BuildStepsResult(
      [createSyntheticV2Page()],
      [createResolvedCallout("rejected", ACCEPTED_REGION, "rejected")],
      [createEvidence("rejected", ACCEPTED_REGION, 0.3)],
      {
        detectorVersion: "v2-test",
        pageCount: 1,
        pageLimit: 1,
      },
    )

    expect(result.status).toBe("empty")
    expect(result.callouts).toEqual([])
    expect(result.sectionBoundaryHints).toEqual([])
  })

  it("reports empty status when resolved callouts are diagnostic-only", () => {
    const result = assembleV2BuildStepsResult(
      [createSyntheticV2Page()],
      [createResolvedCallout("diagnostic", DIAGNOSTIC_REGION, "diagnostic")],
      [createEvidence("diagnostic", DIAGNOSTIC_REGION, 1.4, 0.7)],
      {
        detectorVersion: "v2-test",
        pageCount: 1,
        pageLimit: null,
      },
    )

    expect(result.status).toBe("empty")
    expect(result.callouts).toEqual([])
  })

  it("maps page advisories to Build steps page attention items", () => {
    const sourceRegion = { height: 30, width: 42, x: 60, y: 16 }
    const result = assembleV2BuildStepsResult(
      [createSyntheticV2Page()],
      [createResolvedCallout("accepted", ACCEPTED_REGION, "accepted")],
      [createEvidence("accepted", ACCEPTED_REGION, 2.7, 0.9)],
      {
        detectorVersion: "v2-test",
        pageAdvisories: [
          {
            confidence: 0.91,
            id: "possible-step-multiplier-repeat-2x",
            kind: "possible-step-multiplier",
            pageNumber: 1,
            source: "raster",
            sourceRegion,
            text: "2x",
            value: 2,
          },
        ],
        pageCount: 1,
        pageLimit: null,
      },
    )

    expect(result.pageAttentionItems).toEqual([
      {
        confidence: 0.91,
        id: "possible-step-multiplier-repeat-2x",
        kind: "possible-step-multiplier",
        pageNumber: 1,
        source: "raster",
        sourceRegion,
        text: "2x",
        value: 2,
      },
    ])
  })

  it("emits section boundary hints for off-style rejected callouts near the first visible callout band", () => {
    const offStyleRegion = { height: 22, width: 36, x: 68, y: 12 }
    const result = assembleV2BuildStepsResult(
      [createSyntheticV2Page()],
      [
        createResolvedCallout("accepted", ACCEPTED_REGION, "accepted"),
        createResolvedCallout("off-style", offStyleRegion, "rejected"),
      ],
      [
        createEvidence("accepted", ACCEPTED_REGION, 2.7, 0.9),
        createEvidence("off-style", offStyleRegion, 1.2, 0.82, [
          "off-manual-style-background:2",
        ]),
      ],
      {
        detectorVersion: "v2-test",
        pageCount: 1,
        pageLimit: null,
      },
    )

    expect(result.sectionBoundaryHints).toEqual([
      {
        confidence: 0.82,
        id: "section-boundary-off-style",
        kind: "off-style-rejected-callout",
        pageNumber: 1,
        position: "before-page",
        sourceRegion: offStyleRegion,
      },
    ])
  })

  it("uses overlapping top line rectangles only for weak fill-panel crop bounds", () => {
    const fillPanelRegion = { height: 30, width: 60, x: 10, y: 5 }
    const lineRectangleRegion = { height: 26, width: 56, x: 12, y: 7 }
    const result = assembleV2BuildStepsResult(
      [createSyntheticV2Page()],
      [createResolvedCallout("top-fill-panel", fillPanelRegion, "accepted")],
      [
        createScoredEvidence("top-fill-panel", fillPanelRegion, "fill-panel", {
          background: {
            reasons: ["page-local-background-over-manual-style:4"],
            value: 0.1,
          },
          border: {
            reasons: ["edge-contrast-coverage"],
            value: 0.35,
          },
          quantity: {
            reasons: ["raster-lower-row-quantity-label"],
            value: 1,
          },
        }),
        createScoredEvidence("top-line-rectangle", lineRectangleRegion, "line-rectangle", {
          background: {
            reasons: ["page-local-background-over-manual-style:4"],
            value: 0.11,
          },
          border: {
            reasons: ["candidate-source-line-rectangle"],
            value: 1,
          },
          quantity: {
            reasons: ["raster-lower-row-quantity-label"],
            value: 1,
          },
        }),
      ],
      {
        detectorVersion: "v2-test",
        pageCount: 1,
        pageLimit: null,
      },
    )

    expect(result.callouts[0]).toMatchObject({
      crop: {
        region: { height: 41, width: 72, x: 4, y: 0 },
      },
      detectorCandidateId: "top-fill-panel",
      sourceRegion: fillPanelRegion,
    })
  })

  it("does not double-pad compact top manual-style fill-panel crops", () => {
    const fillPanelRegion = { height: 40, width: 70, x: 40, y: 5 }
    const tightPanelRegion = { height: 24, width: 54, x: 48, y: 13 }
    const result = assembleV2BuildStepsResult(
      [createSyntheticV2Page()],
      [createResolvedCallout("compact-top-fill-panel", fillPanelRegion, "accepted")],
      [
        createScoredEvidence("compact-top-fill-panel", fillPanelRegion, "fill-panel", {
          background: {
            reasons: ["manual-style-background:12"],
            value: 1,
          },
          border: {
            reasons: ["dark-edge-coverage"],
            value: 1,
          },
          quantity: {
            reasons: ["raster-lower-row-quantity-label"],
            value: 1,
          },
        }),
        createScoredEvidence("tight-fill-panel", tightPanelRegion, "fill-panel", {
          background: {
            reasons: ["manual-style-background:12"],
            value: 1,
          },
          border: {
            reasons: ["dark-edge-coverage"],
            value: 1,
          },
          quantity: {
            reasons: ["raster-lower-row-quantity-label"],
            value: 1,
          },
        }),
      ],
      {
        detectorVersion: "v2-test",
        pageCount: 1,
        pageLimit: null,
      },
    )

    expect(result.callouts[0]).toMatchObject({
      crop: {
        region: fillPanelRegion,
      },
      partExtractionRegion: tightPanelRegion,
      sourceRegion: fillPanelRegion,
    })
  })

  it("uses overlapping manual-style fill panels as the source for line-rectangle duplicates", () => {
    const lineRegion = { height: 71, width: 108, x: 47, y: 18 }
    const fillRegion = { height: 68, width: 104, x: 49, y: 20 }
    const result = assembleV2BuildStepsResult(
      [createSyntheticV2Page()],
      [createResolvedCallout("line-rectangle", lineRegion, "accepted")],
      [
        createScoredEvidence("line-rectangle", lineRegion, "line-rectangle", {
          background: {
            reasons: ["manual-style-background:12"],
            value: 1,
          },
          border: {
            reasons: ["candidate-source-line-rectangle"],
            value: 1,
          },
          quantity: {
            reasons: ["raster-lower-row-quantity-label"],
            value: 1,
          },
        }, { a: 255, b: 253, g: 238, r: 215 }),
        createScoredEvidence("fill-panel", fillRegion, "fill-panel", {
          background: {
            reasons: ["manual-style-background:12"],
            value: 1,
          },
          border: {
            reasons: ["dark-edge-coverage"],
            value: 1,
          },
          quantity: {
            reasons: ["raster-lower-row-quantity-label"],
            value: 1,
          },
        }, { a: 255, b: 254, g: 238, r: 215 }),
      ],
      {
        detectorVersion: "v2-test",
        pageCount: 1,
        pageLimit: null,
      },
    )

    expect(result.callouts[0]).toMatchObject({
      crop: {
        region: { height: 70, width: 87, x: 41, y: 12 },
      },
      detectorCandidateId: "fill-panel",
      inferredBackground: {
        hex: "#d7eefe",
        rgb: { b: 254, g: 238, r: 215 },
      },
      sourceRegion: fillRegion,
    })
  })

  it("uses overlapping fill-panel background for weak-background line rectangles", () => {
    const lineRegion = { height: 99, width: 231, x: 10, y: 5 }
    const fillRegion = { height: 101, width: 233, x: 9, y: 4 }
    const fillBackground = { a: 255, b: 137, g: 225, r: 250 }
    const result = assembleV2BuildStepsResult(
      [createSyntheticV2Page()],
      [createResolvedCallout("top-line-rectangle", lineRegion, "accepted")],
      [
        createScoredEvidence("top-line-rectangle", lineRegion, "line-rectangle", {
          background: {
            reasons: ["off-manual-style-background:14"],
            value: 0.59,
          },
          border: {
            reasons: ["candidate-source-line-rectangle"],
            value: 1,
          },
          quantity: {
            reasons: ["raster-lower-row-quantity-label"],
            value: 1,
          },
        }, { a: 255, b: 81, g: 202, r: 248 }),
        createScoredEvidence("top-fill-panel", fillRegion, "fill-panel", {
          background: {
            reasons: ["manual-style-background:14"],
            value: 0.64,
          },
          border: {
            reasons: ["weak-border-evidence"],
            value: 0.35,
          },
          quantity: {
            reasons: ["raster-lower-row-quantity-label"],
            value: 1,
          },
        }, fillBackground),
      ],
      {
        detectorVersion: "v2-test",
        pageCount: 1,
        pageLimit: null,
      },
    )

    expect(result.callouts[0].inferredBackground).toEqual({
      confidence: 0.64,
      hex: "#fae189",
      rgb: { b: 137, g: 225, r: 250 },
    })
  })

  it("orders same-row callouts left-to-right despite small vertical drift", () => {
    const leftRegion = { height: 92, width: 193, x: 93, y: 549 }
    const rightRegion = { height: 101, width: 243, x: 615, y: 547 }
    const result = assembleV2BuildStepsResult(
      [createSyntheticV2Page()],
      [
        createResolvedCallout("right", rightRegion, "accepted"),
        createResolvedCallout("left", leftRegion, "accepted"),
      ],
      [
        createEvidence("right", rightRegion, 2.7, 0.9),
        createEvidence("left", leftRegion, 2.7, 0.9),
      ],
      {
        detectorVersion: "v2-test",
        pageCount: 1,
        pageLimit: null,
      },
    )

    expect(result.callouts.map((callout) => callout.detectorCandidateId)).toEqual(["left", "right"])
  })

  it("does not emit section boundary hints for duplicate or weak rejected callouts", () => {
    const duplicateRegion = { height: 20, width: 24, x: 14, y: 12 }
    const weakRegion = { height: 12, width: 18, x: 80, y: 12 }
    const result = assembleV2BuildStepsResult(
      [createSyntheticV2Page()],
      [
        createResolvedCallout("accepted", ACCEPTED_REGION, "accepted"),
        createResolvedCallout("duplicate", duplicateRegion, "rejected"),
        createResolvedCallout("weak", weakRegion, "rejected"),
      ],
      [
        createEvidence("accepted", ACCEPTED_REGION, 2.7, 0.9),
        createEvidence("duplicate", duplicateRegion, 2.2, 0.9, [
          "manual-style-background:2",
        ]),
        createEvidence("weak", weakRegion, 0.3, 0.1, ["weak-background-evidence"]),
      ],
      {
        detectorVersion: "v2-test",
        pageCount: 1,
        pageLimit: null,
      },
    )

    expect(result.sectionBoundaryHints).toEqual([])
  })
})

function createResolvedCallout(
  candidateId: string,
  region: StepDetectorV2ResolvedCallout["region"],
  status: StepDetectorV2ResolvedCallout["status"],
): StepDetectorV2ResolvedCallout {
  return {
    candidateId,
    pageNumber: 1,
    region,
    status,
  }
}

function createPartItem(): CalloutPartItem {
  return {
    calloutId: "accepted",
    confidence: 0.72,
    id: "accepted:part-0",
    indexOnCallout: 0,
    partImage: {
      alphaMask: {
        data: new Uint8ClampedArray(14 * 8).fill(255),
        height: 8,
        width: 14,
      },
      region: { height: 8, width: 14, x: 20, y: 18 },
    },
    quantityLabel: {
      confidence: 0.95,
      region: { height: 5, width: 8, x: 24, y: 34 },
      text: "1x",
      value: 1,
    },
    sourceRegion: { height: 21, width: 14, x: 20, y: 18 },
  }
}

function createEvidence(
  candidateId: string,
  region: StepDetectorV2CandidateEvidence["candidate"]["region"],
  totalScore: number,
  backgroundScore = 0,
  backgroundReasons = ["background-test"],
): StepDetectorV2CandidateEvidence {
  return {
    background: {
      b: TEST_BLUE_PANEL.b,
      g: TEST_BLUE_PANEL.g,
      r: TEST_BLUE_PANEL.r,
    },
    candidate: {
      id: candidateId,
      pageNumber: 1,
      region,
      source: "border",
    },
    scores: [
      {
        reasons: backgroundReasons,
        signal: "background",
        value: backgroundScore,
      },
    ],
    totalScore,
  }
}

function createScoredEvidence(
  candidateId: string,
  region: StepDetectorV2CandidateEvidence["candidate"]["region"],
  source: StepDetectorV2CandidateEvidence["candidate"]["source"],
  scores: Record<"background" | "border" | "quantity", { reasons: string[]; value: number }>,
  background = TEST_BLUE_PANEL,
): StepDetectorV2CandidateEvidence {
  return {
    background: {
      b: background.b,
      g: background.g,
      r: background.r,
    },
    candidate: {
      id: candidateId,
      pageNumber: 1,
      region,
      source,
    },
    scores: [
      {
        signal: "background",
        ...scores.background,
      },
      {
        signal: "border",
        ...scores.border,
      },
      {
        signal: "quantity",
        ...scores.quantity,
      },
    ],
    totalScore: scores.background.value + scores.border.value + scores.quantity.value,
  }
}
