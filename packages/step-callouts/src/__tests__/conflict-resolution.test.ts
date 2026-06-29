import { describe, expect, it } from "vitest"
import { resolveStepCalloutConflicts } from "../conflict-resolution"
import type {
  StepCalloutCandidateEvidence,
  StepCalloutCandidateSource,
  StepCalloutEvidenceSignal,
  StepCalloutRegion,
  StepCalloutResolvedCallout,
} from "../contracts"
import { createStepCalloutPageInput } from "../page-input"
import type { StepCalloutRgbColor } from "../pixels"

const CALLOUT_REGION = { height: 30, width: 42, x: 12, y: 10 }
const DIAGNOSTIC_REGION = { height: 60, width: 70, x: 12, y: 10 }
const TEXT_BANNER_PAGE = { height: 1080, width: 1080 }
const TEXT_BANNER_REGION = { height: 269, width: 935, x: 73, y: 406 }
const TEST_EVIDENCE_BACKGROUND = { b: 250, g: 226, r: 198 }

describe("stepCallout conflict resolution", () => {
  it("accepts candidates only when all evidence signals are strong", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("strong", CALLOUT_REGION, "border", {
        background: 0.8,
        border: 0.9,
        quantity: 1,
      }),
    ])

    expect(result.resolvedCallouts).toEqual([
      {
        candidateId: "strong",
        pageNumber: 1,
        region: CALLOUT_REGION,
        status: "accepted",
      },
    ])
    expect(result.snapshot.counts).toEqual({
      accepted: 1,
      rejected: 0,
      total: 1,
    })
  })

  it("accepts raster-quantity fill panels with weak but visible border evidence", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const fillPanel = { height: 80, width: 80, x: 12, y: 10 }
    const result = resolveStepCalloutConflicts([
      createEvidence("raster-fill-panel", fillPanel, "fill-panel", {
        background: 1,
        border: 0.16,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "raster-fill-panel",
      status: "accepted",
    })
  })

  it("rejects large raster-quantity text-banner fill panels with weak border evidence", () => {
    const page = createRasterNumberedPage([], TEXT_BANNER_PAGE)
    const result = resolveStepCalloutConflicts([
      createEvidence("text-banner", TEXT_BANNER_REGION, "fill-panel", {
        background: 1,
        border: 0.16,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "text-banner",
      status: "rejected",
    })
  })

  it("rejects weak-border fill panels when quantity came from recovered glyphs", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createManualStyleQuantityReasonEvidence(
        "build-art-glyph-panel",
        { height: 117, width: 203, x: 599, y: 247 },
        "fill-panel",
        {
          background: 1,
          border: 0.35,
          quantity: 1,
        },
        "raster-lower-row-quantity-glyphs",
      ),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "build-art-glyph-panel",
      status: "rejected",
    })
  })

  it("accepts page-scale raster-quantity panels when strong border evidence confirms a callout", () => {
    const page = createRasterNumberedPage([], TEXT_BANNER_PAGE)
    const result = resolveStepCalloutConflicts([
      createEvidence("strong-text-banner-shape", TEXT_BANNER_REGION, "fill-panel", {
        background: 1,
        border: 1,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "strong-text-banner-shape",
      status: "accepted",
    })
  })

  it("rejects page-scale border banners whose raster text looks like lower-row quantity", () => {
    const page = createRasterNumberedPage([], TEXT_BANNER_PAGE)
    const result = resolveStepCalloutConflicts([
      createManualStyleQuantityReasonEvidence(
        "text-banner-border",
        TEXT_BANNER_REGION,
        "border",
        {
          background: 1,
          border: 1,
          quantity: 1,
        },
        "raster-lower-row-quantity-label",
      ),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "text-banner-border",
      status: "rejected",
    })
  })

  it("rejects large text-banner diagnostics when raster quantity came from paragraph text", () => {
    const page = createRasterNumberedPage([], TEXT_BANNER_PAGE)
    const result = resolveStepCalloutConflicts([
      createQuantityReasonEvidence(
        "text-fragment-banner",
        TEXT_BANNER_REGION,
        "border",
        {
          background: 1,
          border: 1,
          quantity: 0,
        },
        "raster-quantity-label-rejected-as-text-fragment",
      ),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "text-fragment-banner",
      status: "rejected",
    })
  })

  it("does not accept small strong manual-style panels when raster quantity was rejected as text", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createManualStyleQuantityReasonEvidence(
        "small-text-fragment-quantity-panel",
        { height: 88, width: 54, x: 49, y: 380 },
        "fill-panel",
        {
          background: 1,
          border: 1,
          quantity: 0,
        },
        "raster-quantity-label-rejected-as-text-fragment",
      ),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "small-text-fragment-quantity-panel",
      status: "diagnostic",
    })
  })

  it("rejects tiny manual-style fragments with rejected text-fragment quantity", () => {
    const page = createRasterNumberedPage([], { height: 1080, width: 1080 })
    const result = resolveStepCalloutConflicts([
      createManualStyleQuantityReasonEvidence(
        "tiny-text-fragment-quantity-panel",
        { height: 19, width: 22, x: 564, y: 437 },
        "fill-panel",
        {
          background: 1,
          border: 0.9,
          quantity: 0,
        },
        "raster-quantity-label-rejected-as-text-fragment",
      ),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "tiny-text-fragment-quantity-panel",
      status: "rejected",
    })
  })

  it("keeps strong-border large non-banner raster-quantity fill panels accepted", () => {
    const page = createRasterNumberedPage([], TEXT_BANNER_PAGE)
    const result = resolveStepCalloutConflicts([
      createEvidence("strong-large-panel", { height: 220, width: 640, x: 73, y: 406 }, "fill-panel", {
        background: 1,
        border: 0.9,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "strong-large-panel",
      status: "accepted",
    })
  })

  it("rejects fill panels with only page-local background fallback", () => {
    const page = createRasterNumberedPage([], TEXT_BANNER_PAGE)
    const result = resolveStepCalloutConflicts([
      createPageLocalBackgroundEvidence("page-local-panel", { height: 140, width: 300, x: 96, y: 408 }, "fill-panel", {
        background: 0.12,
        border: 1,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "page-local-panel",
      status: "rejected",
    })
  })

  it("accepts strong page-local fill panels with lower-row raster quantity labels", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createPageLocalQuantityReasonEvidence("pale-page-local-panel", { height: 100, width: 304, x: 49, y: 447 }, "fill-panel", {
        background: 0.72,
        border: 1,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "pale-page-local-panel",
      status: "accepted",
    })
  })

  it("accepts compact top page-local fill panels with lower-row raster quantity labels", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createPageLocalQuantityReasonEvidence("compact-top-page-local-panel", { height: 84, width: 70, x: 120, y: 41 }, "fill-panel", {
        background: 0.72,
        border: 1,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "compact-top-page-local-panel",
      status: "accepted",
    })
  })

  it("rejects weak-border compact top page-local build-art strips", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createPageLocalQuantityReasonEvidence("weak-border-top-build-art-strip", { height: 148, width: 46, x: 704, y: 58 }, "fill-panel", {
        background: 1,
        border: 0.31,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "weak-border-top-build-art-strip",
      status: "rejected",
    })
  })

  it("prefers padded compact page-local fill panels over tight inner duplicates", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createPageLocalQuantityReasonEvidence("tight-inner-panel", { height: 68, width: 54, x: 128, y: 49 }, "fill-panel", {
        background: 0.72,
        border: 1,
        quantity: 1,
      }),
      createPageLocalQuantityReasonEvidence("padded-panel", { height: 84, width: 70, x: 120, y: 41 }, "fill-panel", {
        background: 0.72,
        border: 1,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(statusByCandidateId(result.resolvedCallouts)).toMatchObject({
      "padded-panel": "accepted",
      "tight-inner-panel": "rejected",
    })
  })

  it("prefers padded compact manual-style fill panels over tight inner duplicates", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createManualStyleQuantityReasonEvidence(
        "tight-inner-manual-style-panel",
        { height: 68, width: 54, x: 128, y: 49 },
        "fill-panel",
        {
          background: 1,
          border: 1,
          quantity: 1,
        },
        "raster-lower-row-quantity-label",
      ),
      createManualStyleQuantityReasonEvidence(
        "padded-manual-style-panel",
        { height: 84, width: 70, x: 120, y: 41 },
        "fill-panel",
        {
          background: 1,
          border: 0.35,
          quantity: 1,
        },
        "raster-lower-row-quantity-label",
      ),
    ], { pages: [page] })

    expect(statusByCandidateId(result.resolvedCallouts)).toMatchObject({
      "padded-manual-style-panel": "accepted",
      "tight-inner-manual-style-panel": "rejected",
    })
  })

  it("rejects narrower overlapping fill-panel fragments beside the preferred panel", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createManualStyleQuantityReasonEvidence(
        "left-shifted-fragment",
        { height: 102, width: 135, x: 462, y: 39 },
        "fill-panel",
        {
          background: 1,
          border: 0.9,
          quantity: 1,
        },
        "raster-lower-row-quantity-label",
      ),
      createManualStyleQuantityReasonEvidence(
        "preferred-wide-panel",
        { height: 86, width: 167, x: 502, y: 41 },
        "fill-panel",
        {
          background: 1,
          border: 0.9,
          quantity: 1,
        },
        "raster-lower-row-quantity-label",
      ),
    ], { pages: [page] })

    expect(statusByCandidateId(result.resolvedCallouts)).toMatchObject({
      "left-shifted-fragment": "rejected",
      "preferred-wide-panel": "accepted",
    })
  })

  it("rejects lower-score shifted fill-panel fragments even when they are wider", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createManualStyleQuantityReasonEvidence(
        "preferred-scored-panel",
        { height: 70, width: 151, x: 544, y: 49 },
        "fill-panel",
        {
          background: 1,
          border: 0.9,
          quantity: 1,
        },
        "raster-lower-row-quantity-label",
      ),
      createManualStyleQuantityReasonEvidence(
        "right-shifted-fragment",
        { height: 78, width: 195, x: 607, y: 39 },
        "fill-panel",
        {
          background: 0.8,
          border: 0.8,
          quantity: 1,
        },
        "raster-lower-row-quantity-label",
      ),
    ], { pages: [page] })

    expect(statusByCandidateId(result.resolvedCallouts)).toMatchObject({
      "preferred-scored-panel": "accepted",
      "right-shifted-fragment": "rejected",
    })
  })

  it("prefers padded compact manual-style fill panels over tight strong-border duplicates", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createManualStyleQuantityReasonEvidence(
        "tight-border-panel",
        { height: 90, width: 56, x: 739, y: 47 },
        "border",
        {
          background: 1,
          border: 1,
          quantity: 1,
        },
        "raster-lower-row-quantity-label",
      ),
      createManualStyleQuantityReasonEvidence(
        "padded-fill-panel",
        { height: 102, width: 68, x: 733, y: 41 },
        "fill-panel",
        {
          background: 1,
          border: 0.35,
          quantity: 1,
        },
        "raster-lower-row-quantity-label",
      ),
    ], { pages: [page] })

    expect(statusByCandidateId(result.resolvedCallouts)).toMatchObject({
      "padded-fill-panel": "accepted",
      "tight-border-panel": "rejected",
    })
  })

  it("accepts thin-border page-local border panels with lower-row raster quantity labels", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createPageLocalQuantityReasonEvidence("thin-page-local-border", { height: 91, width: 118, x: 83, y: 47 }, "border", {
        background: 0.72,
        border: 0.24,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "thin-page-local-border",
      status: "accepted",
    })
  })

  it("rejects high-contrast thin-border build-art fragments", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createPageLocalQuantityReasonEvidence("build-art-thin-border", { height: 96, width: 185, x: 189, y: 437 }, "border", {
        background: 1,
        border: 0.24,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "build-art-thin-border",
      status: "rejected",
    })
  })

  it("keeps weak page-local fill-panel contrast out of accepted callouts", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createPageLocalQuantityReasonEvidence("weak-page-local-panel", { height: 100, width: 304, x: 49, y: 447 }, "fill-panel", {
        background: 0.63,
        border: 1,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "weak-page-local-panel",
      status: "diagnostic",
    })
  })

  it("accepts large strong raster-quantity border candidates with page-local background fallback", () => {
    const page = createRasterNumberedPage([], TEXT_BANNER_PAGE)
    const result = resolveStepCalloutConflicts([
      createPageLocalQuantityReasonEvidence("page-local-border", { height: 100, width: 280, x: 96, y: 408 }, "border", {
        background: 0.72,
        border: 1,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "page-local-border",
      status: "accepted",
    })
  })

  it("rejects lower-contrast page-local strong-border instruction panels", () => {
    const page = createRasterNumberedPage([], TEXT_BANNER_PAGE)
    const result = resolveStepCalloutConflicts([
      createPageLocalQuantityReasonEvidence("numbered-instruction-panel", { height: 93, width: 229, x: 459, y: 456 }, "border", {
        background: 0.63,
        border: 1,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "numbered-instruction-panel",
      status: "diagnostic",
    })
  })

  it("accepts page-local line rectangles when the candidate contains dark foreground ink", () => {
    const page = createRasterNumberedPage([], TEXT_BANNER_PAGE)
    paintBlackRegion(page.data, page.width, { height: 60, width: 60, x: 120, y: 432 })
    const result = resolveStepCalloutConflicts([
      createPageLocalQuantityReasonEvidence("inked-page-local-line", { height: 100, width: 280, x: 96, y: 408 }, "line-rectangle", {
        background: 0.72,
        border: 1,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "inked-page-local-line",
      status: "accepted",
    })
  })

  it("accepts strong line rectangles with low but real page-local background contrast", () => {
    const page = createRasterNumberedPage([], { height: 1080, width: 1080 })
    paintBlackRegion(page.data, page.width, { height: 38, width: 55, x: 650, y: 568 })
    const result = resolveStepCalloutConflicts([
      createPageLocalQuantityReasonEvidence("low-contrast-line-callout", { height: 91, width: 299, x: 619, y: 547 }, "line-rectangle", {
        background: 0.29,
        border: 1,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "low-contrast-line-callout",
      status: "accepted",
    })
  })

  it("keeps sparse page-local line rectangles with only a lower-row raster label diagnostic", () => {
    const page = createRasterNumberedPage([], TEXT_BANNER_PAGE)
    const result = resolveStepCalloutConflicts([
      createPageLocalQuantityReasonEvidence("sparse-page-local-line", { height: 100, width: 280, x: 96, y: 408 }, "line-rectangle", {
        background: 0.72,
        border: 1,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "sparse-page-local-line",
      status: "diagnostic",
    })
  })

  it("rejects page-local line rectangles dominated by build-art ink", () => {
    const page = createRasterNumberedPage([], TEXT_BANNER_PAGE)
    paintBlackRegion(page.data, page.width, { height: 70, width: 70, x: 120, y: 420 })
    const result = resolveStepCalloutConflicts([
      createPageLocalQuantityReasonEvidence("dense-page-local-line", { height: 100, width: 280, x: 96, y: 408 }, "line-rectangle", {
        background: 1,
        border: 1,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "dense-page-local-line",
      status: "diagnostic",
    })
  })

  it("accepts top-row weak-border raster-quantity panels with page-local background fallback", () => {
    const page = createRasterNumberedPage([], TEXT_BANNER_PAGE)
    paintBlackRegion(page.data, page.width, { height: 48, width: 48, x: 128, y: 48 })
    const result = resolveStepCalloutConflicts([
      createPageLocalQuantityReasonEvidence("top-page-local-panel", { height: 100, width: 240, x: 96, y: 26 }, "fill-panel", {
        background: 0.1,
        border: 0.35,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "top-page-local-panel",
      status: "accepted",
    })
  })

  it("accepts wider top manual-style fill panels with raster quantity and visible weak border", () => {
    const page = createRasterNumberedPage([], { height: 1080, width: 1080 })
    const result = resolveStepCalloutConflicts([
      createManualStyleQuantityReasonEvidence(
        "top-manual-style-fill-panel",
        { height: 89, width: 283, x: 64, y: 26 },
        "fill-panel",
        {
          background: 0.64,
          border: 0.37,
          quantity: 1,
        },
        "raster-lower-row-quantity-label",
      ),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "top-manual-style-fill-panel",
      status: "accepted",
    })
  })

  it("accepts top strong-border panels when raster quantity and near-style background agree", () => {
    const page = createRasterNumberedPage([], { height: 1080, width: 1080 })
    const result = resolveStepCalloutConflicts([
      createQuantityReasonEvidence(
        "top-strong-border-panel",
        { height: 113, width: 191, x: 69, y: 27 },
        "line-rectangle",
        {
          background: 0.589,
          border: 1,
          quantity: 1,
        },
        "raster-lower-row-quantity-label",
      ),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "top-strong-border-panel",
      status: "accepted",
    })
  })

  it("accepts transparent top-row panels with strong border and lower-row raster quantity", () => {
    const page = createRasterNumberedPage([], TEXT_BANNER_PAGE)
    paintBlackRegion(page.data, page.width, { height: 24, width: 24, x: 424, y: 40 })
    paintBlackRegion(page.data, page.width, { height: 32, width: 32, x: 580, y: 40 })
    paintBlackRegion(page.data, page.width, { height: 16, width: 16, x: 764, y: 40 })
    paintBlackRegion(page.data, page.width, { height: 52, width: 52, x: 640, y: 570 })
    const result = resolveStepCalloutConflicts([
      createPageLocalQuantityReasonEvidence("transparent-top-border", { height: 76, width: 68, x: 414, y: 29 }, "border", {
        background: 0.11,
        border: 1,
        quantity: 1,
      }),
      createPageLocalQuantityReasonEvidence("transparent-top-fill", { height: 74, width: 130, x: 560, y: 29 }, "fill-panel", {
        background: 0.11,
        border: 1,
        quantity: 1,
      }),
      createPageLocalQuantityReasonEvidence("transparent-compact-top", { height: 58, width: 44, x: 760, y: 29 }, "fill-panel", {
        background: 0.089,
        border: 1,
        quantity: 1,
      }),
      createPageLocalQuantityReasonEvidence("transparent-bottom-border", { height: 102, width: 243, x: 615, y: 547 }, "border", {
        background: 0.28,
        border: 1,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(statusByCandidateId(result.resolvedCallouts)).toEqual({
      "transparent-bottom-border": "accepted",
      "transparent-compact-top": "accepted",
      "transparent-top-border": "accepted",
      "transparent-top-fill": "accepted",
    })
  })

  it("rejects mid-page transparent raster-quantity panels without background support", () => {
    const page = createRasterNumberedPage([], TEXT_BANNER_PAGE)
    const result = resolveStepCalloutConflicts([
      createPageLocalQuantityReasonEvidence("mid-transparent-panel", { height: 76, width: 68, x: 414, y: 320 }, "border", {
        background: 0.11,
        border: 1,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "mid-transparent-panel",
      status: "rejected",
    })
  })

  it("rejects transparent raster-quantity panels dominated by build-art ink", () => {
    const page = createRasterNumberedPage([], TEXT_BANNER_PAGE)
    paintBlackRegion(page.data, page.width, { height: 100, width: 280, x: 96, y: 40 })
    const result = resolveStepCalloutConflicts([
      createPageLocalQuantityReasonEvidence("dense-transparent-panel", { height: 100, width: 280, x: 96, y: 40 }, "border", {
        background: 0.2,
        border: 1,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "dense-transparent-panel",
      status: "rejected",
    })
  })

  it("keeps mid-page weak-border page-local quantity panels diagnostic", () => {
    const page = createRasterNumberedPage([], TEXT_BANNER_PAGE)
    const result = resolveStepCalloutConflicts([
      createPageLocalBackgroundEvidence("mid-page-local-panel", { height: 64, width: 84, x: 220, y: 320 }, "fill-panel", {
        background: 1,
        border: 0.72,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "mid-page-local-panel",
      status: "diagnostic",
    })
  })

  it("rejects tiny raster-quantity fragments with only page-local background fallback", () => {
    const page = createRasterNumberedPage([], TEXT_BANNER_PAGE)
    const result = resolveStepCalloutConflicts([
      createPageLocalBackgroundEvidence("page-local-fragment", { height: 20, width: 30, x: 96, y: 408 }, "fill-panel", {
        background: 1,
        border: 1,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "page-local-fragment",
      status: "rejected",
    })
  })

  it("rejects oversized weak-border manual-style fill panels with raster quantity", () => {
    const page = createRasterNumberedPage([], { height: 1080, width: 1080 })
    const result = resolveStepCalloutConflicts([
      createManualStyleEvidence("parts-list-column", { height: 394, width: 422, x: 658, y: 0 }, {
        background: 1,
        border: 0.35,
        quantity: 1,
      }, "fill-panel"),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "parts-list-column",
      status: "rejected",
    })
  })

  it("rejects weak-border fill panels without raster quantity evidence", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("no-quantity-fill-panel", CALLOUT_REGION, "fill-panel", {
        background: 1,
        border: 0.16,
        quantity: 0,
      }),
    ])

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "no-quantity-fill-panel",
      status: "rejected",
    })
  })

  it("rejects weak-background label-like fragments", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("label-like-fragment", CALLOUT_REGION, "fill-panel", {
        background: 0.2,
        border: 0.16,
        quantity: 1,
      }),
    ])

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "label-like-fragment",
      status: "rejected",
    })
  })

  it("keeps visible non-quantity candidates as diagnostics", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("diagnostic", DIAGNOSTIC_REGION, "fill-panel", {
        background: 0.8,
        border: 0.5,
        quantity: 0,
      }),
    ])

    expect(result.resolvedCallouts[0].status).toBe("diagnostic")
    expect(result.snapshot.counts.accepted).toBe(0)
    expect(result.snapshot.counts.rejected).toBe(0)
  })

  it("keeps small substantial visual panels as diagnostics", () => {
    const smallPanel = { height: 53, width: 42, x: 114, y: 32 }
    const result = resolveStepCalloutConflicts([
      createEvidence("small-panel", smallPanel, "border", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
    ])

    expect(result.resolvedCallouts[0].status).toBe("diagnostic")
  })

  it("keeps small strong manual-style fill panels as diagnostics", () => {
    const smallPanel = { height: 54, width: 39, x: 163, y: 307 }
    const result = resolveStepCalloutConflicts([
      createEvidence("small-fill-panel", smallPanel, "fill-panel", {
        background: 1,
        border: 1,
        quantity: 0,
      }),
    ])

    expect(result.resolvedCallouts[0].status).toBe("diagnostic")
  })

  it("keeps large occluded top fill panels with moderate background evidence", () => {
    const page = createSyntheticPage()
    const largePanel = { height: 36, width: 84, x: 20, y: 6 }
    const result = resolveStepCalloutConflicts([
      createEvidence("large-occluded-panel", largePanel, "fill-panel", {
        background: 0.45,
        border: 0.75,
        quantity: 0,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0].status).toBe("diagnostic")
  })

  it("keeps long bottom manual-style border strips with sparse border evidence", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const longBottomCallout = { height: 90, width: 714, x: 47, y: 460 }
    const result = resolveStepCalloutConflicts([
      createManualStyleEvidence("long-bottom-callout", longBottomCallout, {
        background: 1,
        border: 0.12,
        quantity: 0,
      }, "border"),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0].status).toBe("diagnostic")
  })

  it("rejects long bottom border strips without manual-style background", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const longBottomStrip = { height: 90, width: 714, x: 47, y: 460 }
    const result = resolveStepCalloutConflicts([
      createEvidence("long-bottom-strip", longBottomStrip, "border", {
        background: 1,
        border: 0.12,
        quantity: 0,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0].status).toBe("rejected")
  })

  it("rejects floating visual panels on raster-numbered pages", () => {
    const page = createRasterNumberedPage([
      { height: 32, width: 16, x: 8, y: 10 },
      { height: 32, width: 16, x: 8, y: 92 },
    ])
    const result = resolveStepCalloutConflicts([
      createEvidence("top-numbered", { height: 56, width: 72, x: 36, y: 10 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("bottom-numbered", { height: 56, width: 72, x: 36, y: 92 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("floating-panel", { height: 56, width: 72, x: 188, y: 10 }, "fill-panel", {
        background: 0.8,
        border: 0.55,
        quantity: 0,
      }),
    ], { pages: [page] })

    expect(statusByCandidateId(result.resolvedCallouts)).toEqual({
      "bottom-numbered": "diagnostic",
      "floating-panel": "rejected",
      "top-numbered": "diagnostic",
    })
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(1)
  })

  it("keeps panels with raster step numbers above the callout", () => {
    const page = createRasterNumberedPage([
      { height: 32, width: 44, x: 36, y: 10 },
      { height: 32, width: 44, x: 188, y: 10 },
    ])
    const result = resolveStepCalloutConflicts([
      createEvidence("left-above-numbered", { height: 56, width: 72, x: 36, y: 62 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("right-above-numbered", { height: 56, width: 72, x: 188, y: 62 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("floating-panel", { height: 56, width: 72, x: 116, y: 62 }, "fill-panel", {
        background: 0.8,
        border: 0.55,
        quantity: 0,
      }),
    ], { pages: [page] })

    expect(statusByCandidateId(result.resolvedCallouts)).toEqual({
      "floating-panel": "rejected",
      "left-above-numbered": "diagnostic",
      "right-above-numbered": "diagnostic",
    })
  })

  it("keeps same-row top panels when raster step numbers are merged into build art", () => {
    const page = createRasterNumberedPage([
      { height: 32, width: 16, x: 8, y: 220 },
      { height: 32, width: 16, x: 160, y: 220 },
    ], { height: 320, width: 900 })
    const result = resolveStepCalloutConflicts([
      createEvidence("top-left", { height: 100, width: 190, x: 300, y: 10 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("top-right", { height: 100, width: 210, x: 560, y: 22 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("top-right-inner-fragment", { height: 56, width: 40, x: 650, y: 46 }, "fill-panel", {
        background: 0.8,
        border: 0.95,
        quantity: 0,
      }),
      createEvidence("lower-left-numbered", { height: 56, width: 72, x: 36, y: 220 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("lower-right-numbered", { height: 56, width: 72, x: 188, y: 220 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
    ], { pages: [page] })

    expect(statusByCandidateId(result.resolvedCallouts)).toEqual({
      "lower-left-numbered": "diagnostic",
      "lower-right-numbered": "diagnostic",
      "top-left": "diagnostic",
      "top-right": "diagnostic",
      "top-right-inner-fragment": "rejected",
    })
  })

  it("keeps native-scale top band panels when the browser does not upscale pages", () => {
    const page = createRasterNumberedPage([
      { height: 28, width: 18, x: 8, y: 320 },
      { height: 28, width: 18, x: 172, y: 320 },
    ], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createEvidence("top-left", { height: 56, width: 114, x: 163, y: 49 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("top-center", { height: 133, width: 80, x: 414, y: 49 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("top-right", { height: 65, width: 118, x: 666, y: 49 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("top-tall-shifted", { height: 189, width: 86, x: 553, y: 122 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("top-inner-fragment", { height: 50, width: 44, x: 590, y: 140 }, "fill-panel", {
        background: 0.8,
        border: 0.95,
        quantity: 0,
      }),
      createEvidence("lower-left-numbered", { height: 56, width: 72, x: 36, y: 320 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("lower-right-numbered", { height: 56, width: 72, x: 200, y: 320 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
    ], { pages: [page] })

    expect(statusByCandidateId(result.resolvedCallouts)).toEqual({
      "lower-left-numbered": "diagnostic",
      "lower-right-numbered": "diagnostic",
      "top-center": "diagnostic",
      "top-inner-fragment": "rejected",
      "top-left": "diagnostic",
      "top-right": "diagnostic",
      "top-tall-shifted": "diagnostic",
    })
  })

  it("keeps right-side column callouts aligned to a supported top row", () => {
    const page = createRasterNumberedPage([
      { height: 28, width: 18, x: 120, y: 49 },
      { height: 28, width: 18, x: 120, y: 307 },
    ], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createEvidence("top-left", { height: 80, width: 129, x: 163, y: 49 }, "fill-panel", {
        background: 1,
        border: 1,
        quantity: 0,
      }),
      createEvidence("top-right", { height: 190, width: 74, x: 719, y: 49 }, "fill-panel", {
        background: 1,
        border: 1,
        quantity: 0,
      }),
      createEvidence("bottom-left", { height: 62, width: 125, x: 163, y: 307 }, "fill-panel", {
        background: 1,
        border: 1,
        quantity: 0,
      }),
      createEvidence("bottom-right", { height: 62, width: 90, x: 703, y: 307 }, "fill-panel", {
        background: 1,
        border: 1,
        quantity: 0,
      }),
    ], { pages: [page] })

    expect(statusByCandidateId(result.resolvedCallouts)).toEqual({
      "bottom-left": "diagnostic",
      "bottom-right": "diagnostic",
      "top-left": "diagnostic",
      "top-right": "diagnostic",
    })
  })

  it("does not require raster number anchors on unproven numbered pages", () => {
    const page = createRasterNumberedPage([{ height: 32, width: 16, x: 8, y: 10 }])
    const result = resolveStepCalloutConflicts([
      createEvidence("numbered", { height: 56, width: 72, x: 36, y: 10 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("single-floating", { height: 56, width: 72, x: 188, y: 10 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "diagnostic",
      "diagnostic",
    ])
  })

  it("rejects off-style no-quantity panels after same-page style is established", () => {
    const blueStyle = { b: 254, g: 238, r: 215 }
    const leftCallout = { height: 56, width: 72, x: 36, y: 10 }
    const rightCallout = { height: 56, width: 72, x: 188, y: 10 }
    const rotateIconPanel = { height: 56, width: 72, x: 112, y: 92 }
    const page = createStyledPage([
      { color: blueStyle, region: leftCallout },
      { color: blueStyle, region: rightCallout },
    ])
    const result = resolveStepCalloutConflicts([
      createEvidence("left-callout", leftCallout, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("right-callout", rightCallout, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("rotate-icon-panel", rotateIconPanel, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
    ], { pages: [page] })

    expect(statusByCandidateId(result.resolvedCallouts)).toEqual({
      "left-callout": "diagnostic",
      "right-callout": "diagnostic",
      "rotate-icon-panel": "rejected",
    })
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(1)
  })

  it("keeps off-style diagnostics with substantial dark foreground ink", () => {
    const blueStyle = { b: 254, g: 238, r: 215 }
    const leftCallout = { height: 56, width: 72, x: 36, y: 10 }
    const rightCallout = { height: 56, width: 72, x: 188, y: 10 }
    const whiteCallout = { height: 56, width: 72, x: 112, y: 92 }
    const page = createStyledPage([
      { color: blueStyle, region: leftCallout },
      { color: blueStyle, region: rightCallout },
    ])

    paintBlackRegion(page.data, page.width, { height: 20, width: 20, x: 128, y: 108 })

    const result = resolveStepCalloutConflicts([
      createEvidence("left-callout", leftCallout, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("right-callout", rightCallout, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("white-callout", whiteCallout, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
    ], { pages: [page] })

    expect(statusByCandidateId(result.resolvedCallouts)).toEqual({
      "left-callout": "diagnostic",
      "right-callout": "diagnostic",
      "white-callout": "diagnostic",
    })
  })

  it("keeps unanchored panels aligned to an anchored callout column", () => {
    const page = createRasterNumberedPage([
      { height: 32, width: 16, x: 8, y: 10 },
      { height: 32, width: 16, x: 160, y: 10 },
    ])
    const result = resolveStepCalloutConflicts([
      createEvidence("left-numbered", { height: 56, width: 72, x: 36, y: 10 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("right-numbered", { height: 56, width: 72, x: 188, y: 10 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("left-stacked", { height: 56, width: 72, x: 36, y: 92 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
    ], { pages: [page] })

    expect(statusByCandidateId(result.resolvedCallouts)).toEqual({
      "left-numbered": "diagnostic",
      "left-stacked": "diagnostic",
      "right-numbered": "diagnostic",
    })
  })

  it("keeps wider unanchored panels centered under an anchored callout column", () => {
    const page = createRasterNumberedPage([
      { height: 32, width: 16, x: 8, y: 10 },
      { height: 32, width: 16, x: 160, y: 10 },
    ])
    const result = resolveStepCalloutConflicts([
      createEvidence("left-numbered", { height: 56, width: 72, x: 36, y: 10 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("right-numbered", { height: 56, width: 72, x: 188, y: 10 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("right-wide-stacked", { height: 56, width: 160, x: 144, y: 92 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
    ], { pages: [page] })

    expect(statusByCandidateId(result.resolvedCallouts)).toEqual({
      "left-numbered": "diagnostic",
      "right-numbered": "diagnostic",
      "right-wide-stacked": "diagnostic",
    })
  })

  it("keeps strong manual-style panels when raster step anchors are missing", () => {
    const page = createRasterNumberedPage([
      { height: 32, width: 16, x: 8, y: 10 },
      { height: 32, width: 16, x: 160, y: 10 },
    ], { height: 220, width: 500 })
    const result = resolveStepCalloutConflicts([
      createEvidence("left-numbered", { height: 56, width: 72, x: 36, y: 10 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("right-numbered", { height: 56, width: 72, x: 188, y: 10 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createManualStyleEvidence("manual-style-unanchored", { height: 80, width: 120, x: 330, y: 92 }, {
        background: 1,
        border: 1,
        quantity: 0,
      }),
      createEvidence("floating", { height: 56, width: 72, x: 260, y: 92 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
    ], { pages: [page] })

    expect(statusByCandidateId(result.resolvedCallouts)).toEqual({
      "floating": "diagnostic",
      "left-numbered": "diagnostic",
      "manual-style-unanchored": "diagnostic",
      "right-numbered": "diagnostic",
    })
  })

  it("rejects unsupported leading-page diagnostics when later layout exists", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("title-art", DIAGNOSTIC_REGION, "fill-panel", {
        background: 0.8,
        border: 0.5,
        quantity: 0,
      }),
      createEvidence("page-2", { height: 60, width: 70, x: 172, y: 44 }, "fill-panel", {
        background: 0.8,
        border: 0.5,
        quantity: 0,
      }, 2),
    ])

    expect(result.resolvedCallouts[0].status).toBe("rejected")
    expect(result.resolvedCallouts[1].status).toBe("diagnostic")
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(1)
  })

  it("uses the first visible draft for unsupported leading-page rejection", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("page-1-weak", CALLOUT_REGION, "fill-panel", {
        background: 0,
        border: 0,
        quantity: 0,
      }),
      createEvidence("page-2-notice", DIAGNOSTIC_REGION, "fill-panel", {
        background: 0.8,
        border: 0.5,
        quantity: 0,
      }, 2),
      createEvidence("page-3-callout", { height: 70, width: 90, x: 90, y: 90 }, "fill-panel", {
        background: 0.8,
        border: 0.5,
        quantity: 0,
      }, 3),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "rejected",
      "rejected",
      "diagnostic",
    ])
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(2)
  })

  it("keeps leading-page diagnostics when later pages repeat the layout", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("page-1", DIAGNOSTIC_REGION, "fill-panel", {
        background: 0.8,
        border: 0.5,
        quantity: 0,
      }),
      createEvidence("page-2", { ...DIAGNOSTIC_REGION, width: 64 }, "fill-panel", {
        background: 0.8,
        border: 0.5,
        quantity: 0,
      }, 2),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "diagnostic",
      "diagnostic",
    ])
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(0)
  })

  it("keeps a strong manual-style leading callout when later layout shifts", () => {
    const result = resolveStepCalloutConflicts([
      createManualStyleEvidence("page-1-bottom-right", { height: 162, width: 204, x: 589, y: 385 }, {
        background: 1,
        border: 1,
        quantity: 0,
      }),
      createEvidence("page-2-right", { height: 357, width: 184, x: 609, y: 192 }, "fill-panel", {
        background: 1,
        border: 1,
        quantity: 0,
      }, 2),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "diagnostic",
      "diagnostic",
    ])
  })

  it("rejects strong manual-style leading panels without later column support", () => {
    const result = resolveStepCalloutConflicts([
      createManualStyleEvidence("page-1-notice", { height: 270, width: 934, x: 73, y: 405 }, {
        background: 1,
        border: 1,
        quantity: 0,
      }),
      createEvidence("page-2-callout", { height: 120, width: 204, x: 589, y: 385 }, "fill-panel", {
        background: 1,
        border: 1,
        quantity: 0,
      }, 2),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "rejected",
      "diagnostic",
    ])
  })

  it("keeps single-callout leading pages in a vertical flow layout", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("page-1", { height: 595, width: 306, x: 1013, y: 319 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("page-2", { height: 518, width: 276, x: 1043, y: 82 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }, 2),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "diagnostic",
      "diagnostic",
    ])
  })

  it("rejects leading vertical-flow candidates when size support is weak", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("page-1-build-image", { height: 270, width: 339, x: 980, y: 640 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("page-2-callout", { height: 595, width: 306, x: 1013, y: 319 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }, 2),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "rejected",
      "diagnostic",
    ])
  })

  it("does not use distant later pages as leading layout support", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("page-1-build-image", { height: 64, width: 66, x: 561, y: 107 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("page-2-callout", { height: 120, width: 200, x: 100, y: 100 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }, 2),
      createEvidence("page-3-callout", { height: 120, width: 190, x: 120, y: 400 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }, 3),
      createEvidence("page-9-similar", { height: 66, width: 68, x: 562, y: 500 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }, 9),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "rejected",
      "diagnostic",
      "diagnostic",
      "diagnostic",
    ])
  })

  it("does not support leading-page diagnostics with tiny same-position fragments", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("notice-text-fragment", { height: 24, width: 24, x: 100, y: 100 }, "border", {
        background: 0.8,
        border: 0.8,
        quantity: 0,
      }),
      createEvidence("later-callout", { height: 80, width: 120, x: 104, y: 104 }, "fill-panel", {
        background: 0.8,
        border: 0.8,
        quantity: 0,
      }, 2),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "rejected",
      "diagnostic",
    ])
  })

  it("does not support leading-page diagnostics with small repeated fragments", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("notice-fragment", { height: 48, width: 48, x: 100, y: 100 }, "border", {
        background: 0.8,
        border: 0.9,
        quantity: 0,
      }),
      createEvidence("later-callout", { height: 80, width: 90, x: 104, y: 104 }, "fill-panel", {
        background: 0.8,
        border: 0.9,
        quantity: 0,
      }, 2),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "rejected",
      "diagnostic",
    ])
  })

  it("continues filtering when rejecting one leading page exposes another", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("page-1-intro-panel", DIAGNOSTIC_REGION, "fill-panel", {
        background: 0.8,
        border: 0.5,
        quantity: 0,
      }),
      createEvidence("page-2-text-fragment", { height: 34, width: 27, x: 584, y: 548 }, "border", {
        background: 0.8,
        border: 0.61,
        quantity: 0,
      }, 2),
      createEvidence("page-3-callout", { height: 158, width: 277, x: 985, y: 35 }, "fill-panel", {
        background: 1,
        border: 1,
        quantity: 0,
      }, 3),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "rejected",
      "rejected",
      "diagnostic",
    ])
  })

  it("keeps a first real page with multiple substantial diagnostics", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("page-1-intro-panel", DIAGNOSTIC_REGION, "fill-panel", {
        background: 0.8,
        border: 0.5,
        quantity: 0,
      }),
      createEvidence("page-2-left-callout", { height: 108, width: 361, x: 86, y: 38 }, "fill-panel", {
        background: 1,
        border: 1,
        quantity: 0,
      }, 2),
      createEvidence("page-2-right-callout", { height: 158, width: 277, x: 985, y: 35 }, "border", {
        background: 1,
        border: 1,
        quantity: 0,
      }, 2),
      createEvidence("page-3-callout", { height: 95, width: 169, x: 539, y: 38 }, "fill-panel", {
        background: 1,
        border: 1,
        quantity: 0,
      }, 3),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "rejected",
      "diagnostic",
      "diagnostic",
      "diagnostic",
    ])
  })

  it("does not treat duplicate producer views as leading-page support", () => {
    const sharedRegion = { height: 270, width: 339, x: 980, y: 640 }
    const result = resolveStepCalloutConflicts([
      createEvidence("border-view", sharedRegion, "border", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("fill-view", { ...sharedRegion, height: 264 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("later-callout", { height: 160, width: 240, x: 400, y: 80 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }, 2),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "rejected",
      "rejected",
      "diagnostic",
    ])
  })

  it("does not support weak leading-page border-only fragments", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("notice-text-fragment", { height: 50, width: 50, x: 100, y: 100 }, "border", {
        background: 0.8,
        border: 0.6,
        quantity: 0,
      }),
      createEvidence("later-small-callout", { height: 60, width: 60, x: 104, y: 104 }, "fill-panel", {
        background: 0.8,
        border: 0.8,
        quantity: 0,
      }, 2),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "rejected",
      "diagnostic",
    ])
  })

  it("rejects non-quantity candidates without measured visual evidence", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("source-only", CALLOUT_REGION, "fill-panel", {
        background: 0.8,
        border: 0.1,
        quantity: 0.4,
      }),
    ])

    expect(result.resolvedCallouts[0].status).toBe("rejected")
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(1)
  })

  it("rejects tiny no-quantity visual fragments", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("tiny", { height: 18, width: 16, x: 20, y: 20 }, "fill-panel", {
        background: 0.8,
        border: 0.8,
        quantity: 0,
      }),
    ])

    expect(result.resolvedCallouts[0].status).toBe("rejected")
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(1)
  })

  it("rejects tiny raster-quantity fill fragments that are not panel-sized", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createEvidence("tiny-quantity-fragment", { height: 29, width: 43, x: 695, y: 115 }, "fill-panel", {
        background: 1,
        border: 0.55,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0].status).toBe("rejected")
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(1)
  })

  it("accepts small raster-quantity fill panels when stable manual style confirms the panel", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createManualStyleQuantityReasonEvidence(
        "small-manual-style-quantity-panel",
        { height: 58, width: 44, x: 7, y: 7 },
        "fill-panel",
        {
          background: 1,
          border: 1,
          quantity: 1,
        },
        "raster-lower-row-quantity-label",
      ),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0].status).toBe("accepted")
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(0)
  })

  it("accepts compact mid-page manual-style fill panels with lower-row raster quantity labels", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createManualStyleQuantityReasonEvidence(
        "mid-compact-manual-style-panel",
        { height: 76, width: 50, x: 428, y: 305 },
        "fill-panel",
        {
          background: 1,
          border: 0.35,
          quantity: 1,
        },
        "raster-lower-row-quantity-label",
      ),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0]).toMatchObject({
      candidateId: "mid-compact-manual-style-panel",
      status: "accepted",
    })
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(0)
  })

  it("accepts compact top-row manual-style fill panels with lower-row raster quantity labels", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createManualStyleQuantityReasonEvidence(
        "top-compact-manual-style-panel",
        { height: 58, width: 44, x: 7, y: 7 },
        "fill-panel",
        {
          background: 1,
          border: 0.35,
          quantity: 1,
        },
        "raster-lower-row-quantity-label",
      ),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0].status).toBe("accepted")
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(0)
  })

  it("accepts small manual-style panels on 1080px rendered pages", () => {
    const page = createRasterNumberedPage([], { height: 1080, width: 1080 })
    const result = resolveStepCalloutConflicts([
      createManualStyleQuantityReasonEvidence(
        "small-1080-manual-style-panel",
        { height: 68, width: 44, x: 779, y: 549 },
        "fill-panel",
        {
          background: 0.98,
          border: 1,
          quantity: 1,
        },
        "raster-lower-row-quantity-label",
      ),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0].status).toBe("accepted")
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(0)
  })

  it("keeps narrow top-row manual-style build-art fragments diagnostic", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createManualStyleQuantityReasonEvidence(
        "narrow-manual-style-fragment",
        { height: 80, width: 29, x: 604, y: 60 },
        "fill-panel",
        {
          background: 1,
          border: 0.5,
          quantity: 1,
        },
        "raster-lower-row-quantity-label",
      ),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0].status).toBe("diagnostic")
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(0)
  })

  it("rejects low-border mid-page small manual-style fragments", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createManualStyleEvidence("small-manual-style-fragment", { height: 58, width: 44, x: 300, y: 260 }, {
        background: 1,
        border: 0.35,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0].status).toBe("rejected")
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(1)
  })

  it("rejects small raster-quantity fill panels without stable manual-style background", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createEvidence("small-page-local-quantity-panel", { height: 58, width: 44, x: 7, y: 7 }, "fill-panel", {
        background: 1,
        border: 0.35,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0].status).toBe("rejected")
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(1)
  })

  it("rejects strong-border raster-quantity fill fragments that are not panel-sized", () => {
    const page = createRasterNumberedPage([], { height: 596, width: 842 })
    const result = resolveStepCalloutConflicts([
      createEvidence("strong-tiny-quantity-fragment", { height: 19, width: 45, x: 529, y: 382 }, "fill-panel", {
        background: 1,
        border: 0.8,
        quantity: 1,
      }),
    ], { pages: [page] })

    expect(result.resolvedCallouts[0].status).toBe("rejected")
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(1)
  })

  it("rejects small standalone visual fragments without layout support", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("bom-fragment", { height: 34, width: 49, x: 142, y: 276 }, "border", {
        background: 1,
        border: 0.52,
        quantity: 0,
      }),
    ])

    expect(result.resolvedCallouts[0].status).toBe("rejected")
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(1)
  })

  it("recovers strong bordered diagnostics aligned to a visual row", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("row-left", { height: 60, width: 120, x: 80, y: 40 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("row-middle", { height: 60, width: 120, x: 260, y: 42 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("row-right-shifted-background", { height: 60, width: 120, x: 440, y: 44 }, "border", {
        background: 0.02,
        border: 1,
        quantity: 0,
      }),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "diagnostic",
      "diagnostic",
      "diagnostic",
    ])
  })

  it("does not recover low-background fill-panel fragments from visual row support", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("row-left", { height: 60, width: 120, x: 80, y: 40 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("row-right", { height: 60, width: 120, x: 260, y: 42 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("rotate-icon-fragment", { height: 48, width: 48, x: 440, y: 44 }, "fill-panel", {
        background: 0.04,
        border: 0.96,
        quantity: 0,
      }),
    ])

    expect(statusByCandidateId(result.resolvedCallouts)).toEqual({
      "rotate-icon-fragment": "rejected",
      "row-left": "diagnostic",
      "row-right": "diagnostic",
    })
  })

  it("does not recover zero-background candidates from row support alone", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("row-left", { height: 60, width: 120, x: 80, y: 40 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("row-middle", { height: 60, width: 120, x: 260, y: 42 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("row-only-zero-background", { height: 60, width: 120, x: 440, y: 44 }, "border", {
        background: 0,
        border: 1,
        quantity: 0,
      }),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "diagnostic",
      "diagnostic",
      "rejected",
    ])
  })

  it("does not recover zero-background narrow strips from grid support", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("top-left", { height: 60, width: 120, x: 80, y: 40 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("top-right", { height: 60, width: 120, x: 360, y: 42 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("bottom-right", { height: 60, width: 120, x: 364, y: 300 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("narrow-step-number-strip", { height: 50, width: 18, x: 84, y: 302 }, "border", {
        background: 0,
        border: 1,
        quantity: 0,
      }),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "diagnostic",
      "diagnostic",
      "diagnostic",
      "rejected",
    ])
  })

  it("recovers strong bordered diagnostics from orthogonal grid support", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("top-left", { height: 60, width: 120, x: 80, y: 40 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("top-right", { height: 60, width: 120, x: 360, y: 42 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("bottom-right", { height: 60, width: 120, x: 364, y: 300 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("bottom-left-shifted-background", { height: 60, width: 120, x: 84, y: 302 }, "border", {
        background: 0,
        border: 1,
        quantity: 0,
      }),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "diagnostic",
      "diagnostic",
      "diagnostic",
      "diagnostic",
    ])
  })

  it("does not recover off-style border panels from orthogonal grid support", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("top-left", { height: 60, width: 120, x: 80, y: 40 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("top-right", { height: 60, width: 120, x: 360, y: 42 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("bottom-right", { height: 60, width: 120, x: 364, y: 300 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createOffManualStyleEvidence("bottom-left-subassembly", { height: 60, width: 120, x: 84, y: 302 }, {
        background: 0,
        border: 1,
        quantity: 0,
      }),
    ])

    expect(statusByCandidateId(result.resolvedCallouts)).toEqual({
      "bottom-left-subassembly": "rejected",
      "bottom-right": "diagnostic",
      "top-left": "diagnostic",
      "top-right": "diagnostic",
    })
  })

  it("rejects weak border-only diagnostics outside established visual rows", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("row-left", { height: 60, width: 120, x: 80, y: 40 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("row-right", { height: 60, width: 120, x: 260, y: 42 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("build-fragment", { height: 70, width: 110, x: 220, y: 260 }, "border", {
        background: 0.9,
        border: 0.6,
        quantity: 0,
      }),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "diagnostic",
      "diagnostic",
      "rejected",
    ])
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(1)
  })

  it("rejects narrow visual fragments outside established visual rows", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("row-left", { height: 60, width: 120, x: 80, y: 40 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("row-right", { height: 60, width: 120, x: 260, y: 42 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("vertical-build-fragment", { height: 160, width: 60, x: 230, y: 240 }, "fill-panel", {
        background: 0.8,
        border: 0.95,
        quantity: 0,
      }),
    ])

    expect(result.resolvedCallouts.map((callout) => callout.status)).toEqual([
      "diagnostic",
      "diagnostic",
      "rejected",
    ])
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(1)
  })

  it("keeps tall complete panels outside established visual rows", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("row-left", { height: 60, width: 120, x: 80, y: 40 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("row-right", { height: 60, width: 120, x: 260, y: 42 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
      createEvidence("tall-side-panel", { height: 160, width: 78, x: 80, y: 240 }, "fill-panel", {
        background: 0.8,
        border: 1,
        quantity: 0,
      }),
    ])

    expect(statusByCandidateId(result.resolvedCallouts)).toEqual({
      "row-left": "diagnostic",
      "row-right": "diagnostic",
      "tall-side-panel": "diagnostic",
    })
  })

  it("rejects weak evidence candidates with false-positive taxonomy", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("weak", CALLOUT_REGION, "fill-panel", {
        background: 0.2,
        border: 0.1,
        quantity: 0,
      }),
    ])

    expect(result.resolvedCallouts[0].status).toBe("rejected")
    expect(result.snapshot.failures["false-positive-candidate"]).toBe(1)
  })

  it("rejects overlapping weaker duplicates after keeping preferred candidate", () => {
    const largerRegion = { height: 34, width: 46, x: 10, y: 8 }
    const result = resolveStepCalloutConflicts([
      createEvidence("larger", largerRegion, "fill-panel", strongSignals()),
      createEvidence("smaller", CALLOUT_REGION, "border", strongSignals()),
    ])

    expect(result.resolvedCallouts).toEqual([
      {
        candidateId: "larger",
        pageNumber: 1,
        region: largerRegion,
        status: "rejected",
      },
      {
        candidateId: "smaller",
        pageNumber: 1,
        region: CALLOUT_REGION,
        status: "accepted",
      },
    ])
    expect(result.snapshot.failures.duplicate).toBe(1)
  })

  it("rejects weak fill-panel fragments that overlap a stronger accepted fill panel", () => {
    const strongPanel = { height: 74, width: 217, x: 129, y: 49 }
    const weakFragment = { height: 104, width: 135, x: 81, y: 39 }
    const result = resolveStepCalloutConflicts([
      createManualStyleEvidence("strong-panel", strongPanel, {
        background: 1,
        border: 1,
        quantity: 1,
      }),
      createManualStyleEvidence("weak-overlapping-fragment", weakFragment, {
        background: 1,
        border: 0.31,
        quantity: 1,
      }),
    ])

    expect(statusByCandidateId(result.resolvedCallouts)).toEqual({
      "strong-panel": "accepted",
      "weak-overlapping-fragment": "rejected",
    })
    expect(result.snapshot.failures.duplicate).toBe(1)
  })

  it("rejects line-rectangle fragments that overlap an accepted fill panel", () => {
    const fillPanel = { height: 92, width: 193, x: 93, y: 549 }
    const lineFragment = { height: 138, width: 98, x: 190, y: 547 }
    const result = resolveStepCalloutConflicts([
      createManualStyleEvidence("fill-panel", fillPanel, {
        background: 1,
        border: 1,
        quantity: 1,
      }, "fill-panel"),
      createManualStyleEvidence("line-fragment", lineFragment, {
        background: 1,
        border: 0.67,
        quantity: 1,
      }, "line-rectangle"),
    ])

    expect(statusByCandidateId(result.resolvedCallouts)).toEqual({
      "fill-panel": "accepted",
      "line-fragment": "rejected",
    })
    expect(result.snapshot.failures.duplicate).toBe(1)
  })

  it("does not reject same-position callouts on different pages as duplicates", () => {
    const result = resolveStepCalloutConflicts([
      createEvidence("page-1", CALLOUT_REGION, "border", strongSignals(), 1),
      createEvidence("page-2", CALLOUT_REGION, "border", strongSignals(), 2),
    ])

    expect(result.resolvedCallouts).toEqual([
      {
        candidateId: "page-1",
        pageNumber: 1,
        region: CALLOUT_REGION,
        status: "accepted",
      },
      {
        candidateId: "page-2",
        pageNumber: 2,
        region: CALLOUT_REGION,
        status: "accepted",
      },
    ])
    expect(result.snapshot.failures.duplicate).toBe(0)
  })
})

function createEvidence(
  candidateId: string,
  region: StepCalloutRegion,
  source: StepCalloutCandidateSource,
  signals: Record<StepCalloutEvidenceSignal, number>,
  pageNumber = 1,
): StepCalloutCandidateEvidence {
  return {
    background: TEST_EVIDENCE_BACKGROUND,
    candidate: {
      id: candidateId,
      pageNumber,
      region,
      source,
    },
    scores: Object.entries(signals).map(([signal, value]) => ({
      reasons: [`${signal}-test-reason`],
      signal: signal as StepCalloutEvidenceSignal,
      value,
    })),
    totalScore: signals.background + signals.border + signals.quantity,
  }
}

function createManualStyleEvidence(
  candidateId: string,
  region: StepCalloutRegion,
  signals: Record<StepCalloutEvidenceSignal, number>,
  source: StepCalloutCandidateSource = "fill-panel",
): StepCalloutCandidateEvidence {
  const evidence = createEvidence(candidateId, region, source, signals)

  return {
    ...evidence,
    scores: evidence.scores.map((score) =>
      score.signal === "background"
        ? { ...score, reasons: ["manual-style-background:42"] }
        : score,
    ),
  }
}

function createPageLocalBackgroundEvidence(
  candidateId: string,
  region: StepCalloutRegion,
  source: StepCalloutCandidateSource,
  signals: Record<StepCalloutEvidenceSignal, number>,
): StepCalloutCandidateEvidence {
  const evidence = createEvidence(candidateId, region, source, signals)

  return {
    ...evidence,
    scores: evidence.scores.map((score) =>
      score.signal === "background"
        ? { ...score, reasons: ["page-local-background-over-manual-style:42"] }
        : score,
    ),
  }
}

function createPageLocalQuantityReasonEvidence(
  candidateId: string,
  region: StepCalloutRegion,
  source: StepCalloutCandidateSource,
  signals: Record<StepCalloutEvidenceSignal, number>,
): StepCalloutCandidateEvidence {
  const evidence = createPageLocalBackgroundEvidence(candidateId, region, source, signals)

  return {
    ...evidence,
    scores: evidence.scores.map((score) =>
      score.signal === "quantity"
        ? { ...score, reasons: ["raster-lower-row-quantity-label"] }
        : score,
    ),
  }
}

function createQuantityReasonEvidence(
  candidateId: string,
  region: StepCalloutRegion,
  source: StepCalloutCandidateSource,
  signals: Record<StepCalloutEvidenceSignal, number>,
  reason: string,
): StepCalloutCandidateEvidence {
  const evidence = createEvidence(candidateId, region, source, signals)

  return {
    ...evidence,
    scores: evidence.scores.map((score) =>
      score.signal === "quantity"
        ? { ...score, reasons: [reason] }
        : score,
    ),
  }
}

function createManualStyleQuantityReasonEvidence(
  candidateId: string,
  region: StepCalloutRegion,
  source: StepCalloutCandidateSource,
  signals: Record<StepCalloutEvidenceSignal, number>,
  reason: string,
): StepCalloutCandidateEvidence {
  const evidence = createQuantityReasonEvidence(candidateId, region, source, signals, reason)

  return {
    ...evidence,
    scores: evidence.scores.map((score) =>
      score.signal === "background"
        ? { ...score, reasons: ["manual-style-background:42"] }
        : score,
    ),
  }
}

function createOffManualStyleEvidence(
  candidateId: string,
  region: StepCalloutRegion,
  signals: Record<StepCalloutEvidenceSignal, number>,
): StepCalloutCandidateEvidence {
  const evidence = createEvidence(candidateId, region, "border", signals)

  return {
    ...evidence,
    scores: evidence.scores.map((score) =>
      score.signal === "background"
        ? { ...score, reasons: ["off-manual-style-background:42"] }
        : score,
    ),
  }
}

function strongSignals(): Record<StepCalloutEvidenceSignal, number> {
  return {
    background: 0.8,
    border: 0.9,
    quantity: 1,
  }
}

function statusByCandidateId(
  callouts: readonly StepCalloutResolvedCallout[],
): Record<string, string> {
  return Object.fromEntries(callouts.map((callout) => [callout.candidateId, callout.status]))
}

function createRasterNumberedPage(
  stepNumbers: readonly StepCalloutRegion[],
  size = { height: 180, width: 300 },
) {
  const { height, width } = size
  const data = new Uint8ClampedArray(width * height * 4)

  fillPageWhite(data)
  paintBlackRegions(data, width, stepNumbers)

  return createStepCalloutPageInput({
    data,
    height,
    pageNumber: 1,
    width,
  })
}

function createSyntheticPage() {
  const width = 128
  const height = 82
  const data = new Uint8ClampedArray(width * height * 4)

  fillPageWhite(data)

  return createStepCalloutPageInput({
    data,
    height,
    pageNumber: 1,
    width,
  })
}

function createStyledPage(
  regions: ReadonlyArray<{ color: StepCalloutRgbColor; region: StepCalloutRegion }>,
) {
  const width = 300
  const height = 180
  const data = new Uint8ClampedArray(width * height * 4)

  fillPageWhite(data)

  for (const { color, region } of regions) {
    paintColorRegion(data, width, region, color)
  }

  return createStepCalloutPageInput({
    data,
    height,
    pageNumber: 1,
    width,
  })
}

function fillPageWhite(data: Uint8ClampedArray): void {
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 255
    data[offset + 1] = 255
    data[offset + 2] = 255
    data[offset + 3] = 255
  }
}

function paintColorRegion(
  data: Uint8ClampedArray,
  pageWidth: number,
  region: StepCalloutRegion,
  color: StepCalloutRgbColor,
): void {
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      paintColorPixel(data, y * pageWidth + x, color)
    }
  }
}

function paintColorPixel(
  data: Uint8ClampedArray,
  pixelIndex: number,
  color: StepCalloutRgbColor,
): void {
  const offset = pixelIndex * 4

  data[offset] = color.r
  data[offset + 1] = color.g
  data[offset + 2] = color.b
  data[offset + 3] = 255
}

function paintBlackRegions(
  data: Uint8ClampedArray,
  pageWidth: number,
  regions: readonly StepCalloutRegion[],
): void {
  for (const region of regions) {
    paintBlackRegion(data, pageWidth, region)
  }
}

function paintBlackRegion(
  data: Uint8ClampedArray,
  pageWidth: number,
  region: StepCalloutRegion,
): void {
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      paintBlackPixel(data, y * pageWidth + x)
    }
  }
}

function paintBlackPixel(data: Uint8ClampedArray, pixelIndex: number): void {
  const offset = pixelIndex * 4

  data[offset] = 0
  data[offset + 1] = 0
  data[offset + 2] = 0
  data[offset + 3] = 255
}
