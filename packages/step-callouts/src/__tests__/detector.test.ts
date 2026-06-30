import { describe, expect, it } from "vitest"
import {
  detectStepCalloutPageCandidates,
  detectStepCallouts,
  inferStepCalloutEvidenceManualStyle,
  resolveStepCalloutsFromPageEvidence,
  scoreStepCalloutPageEvidence,
} from "../detector"
import type {
  StepCalloutCandidate,
  StepCalloutCandidateEvidence,
  StepCalloutEvidenceScore,
  StepCalloutRegion,
  StepCalloutRgbColor,
} from "../contracts"
import { createStepCalloutPageInput } from "../page-input"
import {
  createSyntheticStepCalloutPage,
  paintBorder,
  paintConnectedScaledRasterQuantityLabel,
  paintRasterQuantityLabel,
  paintRegion,
  paintSeparatedScaledRasterQuantityLabel,
  TEST_BLACK,
  TEST_BLUE_PANEL,
} from "./helpers/synthetic-page-test-helper"

const ACCEPTED_REGION = { height: 24, width: 36, x: 10, y: 8 }
const REPEAT_PANEL_REGION = { height: 40, width: 36, x: 72, y: 12 }
const REPEAT_PANEL_BACKGROUND = { a: 255, b: 230, g: 242, r: 248 }
const MODEL_ART_BACKGROUND = { a: 255, b: 108, g: 133, r: 145 }

describe("detectStepCallouts", () => {
  it("matches the staged page-local detector flow", () => {
    const pages = [
      createBlankPage(1),
      createBlankPage(2),
    ]
    const candidates = pages.flatMap(detectStepCalloutPageCandidates)
    const manualStyle = inferStepCalloutEvidenceManualStyle(pages, candidates)
    const evidence = pages.flatMap((page) =>
      scoreStepCalloutPageEvidence(
        page,
        candidates.filter((candidate) => candidate.pageNumber === page.pageNumber),
        manualStyle,
      ),
    )

    expect(resolveStepCalloutsFromPageEvidence(pages, candidates, evidence))
      .toEqual(detectStepCallouts(pages))
  })

  it("emits raster page advisories for off-style panels with outside multipliers", () => {
    const page = createRepeatPanelPage("2x")
    const report = resolveStepCalloutsFromPageEvidence(
      [page],
      [
        createCandidate("accepted", ACCEPTED_REGION, "fill-panel"),
        createCandidate("repeat", REPEAT_PANEL_REGION, "border"),
      ],
      [
        createEvidence("accepted", ACCEPTED_REGION, TEST_BLUE_PANEL, {
          background: { reasons: ["manual-style-background:3"], value: 0.92 },
          border: { reasons: ["dark-edge-coverage"], value: 0.8 },
          quantity: { reasons: ["raster-lower-row-quantity-label"], value: 1 },
        }),
        createEvidence("repeat", REPEAT_PANEL_REGION, REPEAT_PANEL_BACKGROUND, {
          background: { reasons: ["off-manual-style-background:3"], value: 0.1 },
          border: { reasons: ["dark-edge-coverage"], value: 0.82 },
          quantity: { reasons: ["no-raster-quantity-label"], value: 0 },
        }),
      ],
    )

    expect(report.pageAdvisories).toEqual([
      expect.objectContaining({
        kind: "possible-step-multiplier",
        pageNumber: 1,
        source: "raster",
        text: "2x",
        value: 2,
      }),
    ])
    expect(report.pageAdvisories[0].sourceRegion).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    })
  })

  it("emits page advisories for repeat-only pages inside the build span", () => {
    const stepPage = createStepPage(1)
    const repeatPage = createRepeatPanelPage("2x", { includeAccepted: false, pageNumber: 2 })
    const report = resolveStepCalloutsFromPageEvidence(
      [stepPage, repeatPage],
      [
        createCandidate("accepted", ACCEPTED_REGION, "fill-panel", 1),
        createCandidate("repeat", REPEAT_PANEL_REGION, "border", 2),
      ],
      [
        createEvidence("accepted", ACCEPTED_REGION, TEST_BLUE_PANEL, {
          background: { reasons: ["manual-style-background:3"], value: 0.92 },
          border: { reasons: ["dark-edge-coverage"], value: 0.8 },
          quantity: { reasons: ["raster-lower-row-quantity-label"], value: 1 },
        }, { pageNumber: 1 }),
        createEvidence("repeat", REPEAT_PANEL_REGION, REPEAT_PANEL_BACKGROUND, {
          background: { reasons: ["off-manual-style-background:3"], value: 0.1 },
          border: { reasons: ["dark-edge-coverage"], value: 0.82 },
          quantity: { reasons: ["no-raster-quantity-label"], value: 0 },
        }, { pageNumber: 2 }),
      ],
    )

    expect(report.pageAdvisories).toEqual([
      expect.objectContaining({
        pageNumber: 2,
        text: "2x",
        value: 2,
      }),
    ])
  })

  it("emits page advisories for high-value repeat multipliers", () => {
    const page = createRepeatPanelPage("8x")
    const report = resolveStepCalloutsFromPageEvidence(
      [page],
      [
        createCandidate("accepted", ACCEPTED_REGION, "fill-panel"),
        createCandidate("repeat", REPEAT_PANEL_REGION, "border"),
      ],
      [
        createEvidence("accepted", ACCEPTED_REGION, TEST_BLUE_PANEL, {
          background: { reasons: ["manual-style-background:3"], value: 0.92 },
          border: { reasons: ["dark-edge-coverage"], value: 0.8 },
          quantity: { reasons: ["raster-lower-row-quantity-label"], value: 1 },
        }),
        createEvidence("repeat", REPEAT_PANEL_REGION, REPEAT_PANEL_BACKGROUND, {
          background: { reasons: ["off-manual-style-background:3"], value: 0.1 },
          border: { reasons: ["dark-edge-coverage"], value: 0.82 },
          quantity: { reasons: ["no-raster-quantity-label"], value: 0 },
        }),
      ],
    )

    expect(report.pageAdvisories).toEqual([
      expect.objectContaining({
        text: "8x",
        value: 8,
      }),
    ])
  })

  it("emits page advisories for lower-center repeat labels", () => {
    const page = createRepeatPanelPage("2x", { labelX: 92, labelY: 59 })
    const report = resolveStepCalloutsFromPageEvidence(
      [page],
      [
        createCandidate("accepted", ACCEPTED_REGION, "fill-panel"),
        createCandidate("repeat", REPEAT_PANEL_REGION, "border"),
      ],
      [
        createEvidence("accepted", ACCEPTED_REGION, TEST_BLUE_PANEL, {
          background: { reasons: ["manual-style-background:3"], value: 0.92 },
          border: { reasons: ["dark-edge-coverage"], value: 0.8 },
          quantity: { reasons: ["raster-lower-row-quantity-label"], value: 1 },
        }),
        createEvidence("repeat", REPEAT_PANEL_REGION, REPEAT_PANEL_BACKGROUND, {
          background: { reasons: ["off-manual-style-background:3"], value: 0.1 },
          border: { reasons: ["dark-edge-coverage"], value: 0.82 },
          quantity: { reasons: ["no-raster-quantity-label"], value: 0 },
        }),
      ],
    )

    expect(report.pageAdvisories).toEqual([
      expect.objectContaining({
        text: "2x",
        value: 2,
      }),
    ])
  })

  it("emits page advisories for labels near the panel bottom edge", () => {
    const page = createRepeatPanelPage("2x", { labelX: 78, labelY: 56 })
    const report = resolveStepCalloutsFromPageEvidence(
      [page],
      [
        createCandidate("accepted", ACCEPTED_REGION, "fill-panel"),
        createCandidate("repeat", REPEAT_PANEL_REGION, "border"),
      ],
      [
        createEvidence("accepted", ACCEPTED_REGION, TEST_BLUE_PANEL, {
          background: { reasons: ["manual-style-background:3"], value: 0.92 },
          border: { reasons: ["dark-edge-coverage"], value: 0.8 },
          quantity: { reasons: ["raster-lower-row-quantity-label"], value: 1 },
        }),
        createEvidence("repeat", REPEAT_PANEL_REGION, REPEAT_PANEL_BACKGROUND, {
          background: { reasons: ["off-manual-style-background:3"], value: 0.1 },
          border: { reasons: ["dark-edge-coverage"], value: 0.82 },
          quantity: { reasons: ["no-raster-quantity-label"], value: 0 },
        }),
      ],
    )

    expect(report.pageAdvisories).toEqual([
      expect.objectContaining({
        text: "2x",
        value: 2,
      }),
    ])
  })

  it("emits page advisories for fill-panel repeat boxes", () => {
    const page = createRepeatPanelPage("2x")
    const report = resolveStepCalloutsFromPageEvidence(
      [page],
      [
        createCandidate("accepted", ACCEPTED_REGION, "fill-panel"),
        createCandidate("repeat", REPEAT_PANEL_REGION, "fill-panel"),
      ],
      [
        createEvidence("accepted", ACCEPTED_REGION, TEST_BLUE_PANEL, {
          background: { reasons: ["manual-style-background:3"], value: 0.92 },
          border: { reasons: ["dark-edge-coverage"], value: 0.8 },
          quantity: { reasons: ["raster-lower-row-quantity-label"], value: 1 },
        }),
        createEvidence("repeat", REPEAT_PANEL_REGION, REPEAT_PANEL_BACKGROUND, {
          background: { reasons: ["off-manual-style-background:3"], value: 0.1 },
          border: { reasons: ["dark-edge-coverage"], value: 0.82 },
          quantity: { reasons: ["no-raster-quantity-label"], value: 0 },
        }, { source: "fill-panel" }),
      ],
    )

    expect(report.pageAdvisories).toEqual([
      expect.objectContaining({
        text: "2x",
        value: 2,
      }),
    ])
  })

  it("emits page advisories for repeat panels with weak inside-candidate OCR noise", () => {
    const page = createRepeatPanelPage("2x")
    const report = resolveStepCalloutsFromPageEvidence(
      [page],
      [
        createCandidate("accepted", ACCEPTED_REGION, "fill-panel"),
        createCandidate("repeat", REPEAT_PANEL_REGION, "line-rectangle"),
      ],
      [
        createEvidence("accepted", ACCEPTED_REGION, TEST_BLUE_PANEL, {
          background: { reasons: ["manual-style-background:3"], value: 0.92 },
          border: { reasons: ["dark-edge-coverage"], value: 0.8 },
          quantity: { reasons: ["raster-lower-row-quantity-label"], value: 1 },
        }),
        createEvidence("repeat", REPEAT_PANEL_REGION, REPEAT_PANEL_BACKGROUND, {
          background: { reasons: ["off-manual-style-background:3"], value: 0.1 },
          border: { reasons: ["dark-edge-coverage"], value: 0.82 },
          quantity: { reasons: ["raster-quantity-label-inside-candidate"], value: 0.25 },
        }, { source: "line-rectangle" }),
      ],
    )

    expect(report.pageAdvisories).toEqual([
      expect.objectContaining({
        text: "2x",
        value: 2,
      }),
    ])
  })

  it("does not emit page advisories for gray model-art rectangles", () => {
    const page = createRepeatPanelPage("2x", { repeatBackground: MODEL_ART_BACKGROUND })
    const report = resolveStepCalloutsFromPageEvidence(
      [page],
      [
        createCandidate("accepted", ACCEPTED_REGION, "fill-panel"),
        createCandidate("model-art", REPEAT_PANEL_REGION, "line-rectangle"),
      ],
      [
        createEvidence("accepted", ACCEPTED_REGION, TEST_BLUE_PANEL, {
          background: { reasons: ["manual-style-background:3"], value: 0.92 },
          border: { reasons: ["dark-edge-coverage"], value: 0.8 },
          quantity: { reasons: ["raster-lower-row-quantity-label"], value: 1 },
        }),
        createEvidence("model-art", REPEAT_PANEL_REGION, MODEL_ART_BACKGROUND, {
          background: { reasons: ["off-manual-style-background:3"], value: 0.1 },
          border: { reasons: ["dark-edge-coverage"], value: 0.82 },
          quantity: { reasons: ["no-raster-quantity-label"], value: 0 },
        }, { source: "line-rectangle" }),
      ],
    )

    expect(report.pageAdvisories).toEqual([])
  })

  it("does not emit page advisories for manual-style callout panels", () => {
    const page = createRepeatPanelPage("2x")
    const report = resolveStepCalloutsFromPageEvidence(
      [page],
      [
        createCandidate("accepted", ACCEPTED_REGION, "fill-panel"),
        createCandidate("manual-style", REPEAT_PANEL_REGION, "line-rectangle"),
      ],
      [
        createEvidence("accepted", ACCEPTED_REGION, TEST_BLUE_PANEL, {
          background: { reasons: ["manual-style-background:3"], value: 0.92 },
          border: { reasons: ["dark-edge-coverage"], value: 0.8 },
          quantity: { reasons: ["raster-lower-row-quantity-label"], value: 1 },
        }),
        createEvidence("manual-style", REPEAT_PANEL_REGION, REPEAT_PANEL_BACKGROUND, {
          background: { reasons: ["manual-style-background:3"], value: 1 },
          border: { reasons: ["dark-edge-coverage"], value: 0.82 },
          quantity: { reasons: ["no-raster-quantity-label"], value: 0 },
        }, { source: "line-rectangle" }),
      ],
    )

    expect(report.pageAdvisories).toEqual([])
  })

  it("does not emit page advisories before the build section starts", () => {
    const page = createRepeatPanelPage("2x", { includeAccepted: false })
    const report = resolveStepCalloutsFromPageEvidence(
      [page],
      [createCandidate("repeat", REPEAT_PANEL_REGION, "border")],
      [
        createEvidence("repeat", REPEAT_PANEL_REGION, REPEAT_PANEL_BACKGROUND, {
          background: { reasons: ["off-manual-style-background:3"], value: 0.1 },
          border: { reasons: ["dark-edge-coverage"], value: 0.82 },
          quantity: { reasons: ["no-raster-quantity-label"], value: 0 },
        }),
      ],
    )

    expect(report.pageAdvisories).toEqual([])
  })

  it("does not emit page advisories for dense BOM-like table pages", () => {
    const stepPage = createStepPage(1)
    const bomPage = createBomTablePage(2)
    const bomCellRegions = createBomCellRegions()
    const report = resolveStepCalloutsFromPageEvidence(
      [stepPage, bomPage],
      [
        createCandidate("accepted", ACCEPTED_REGION, "fill-panel", 1),
        createCandidate("repeat", REPEAT_PANEL_REGION, "border", 2),
        ...bomCellRegions.map((region, index) =>
          createCandidate(`bom-cell-${index}`, region, "border", 2),
        ),
      ],
      [
        createEvidence("accepted", ACCEPTED_REGION, TEST_BLUE_PANEL, {
          background: { reasons: ["manual-style-background:3"], value: 0.92 },
          border: { reasons: ["dark-edge-coverage"], value: 0.8 },
          quantity: { reasons: ["raster-lower-row-quantity-label"], value: 1 },
        }, { pageNumber: 1 }),
        createEvidence("repeat", REPEAT_PANEL_REGION, REPEAT_PANEL_BACKGROUND, {
          background: { reasons: ["off-manual-style-background:3"], value: 0.1 },
          border: { reasons: ["dark-edge-coverage"], value: 0.82 },
          quantity: { reasons: ["no-raster-quantity-label"], value: 0 },
        }, { pageNumber: 2 }),
        ...bomCellRegions.map((region, index) =>
          createEvidence(`bom-cell-${index}`, region, TEST_BLUE_PANEL, {
            background: { reasons: ["manual-style-background:3"], value: 0.05 },
            border: { reasons: ["weak-cell-border"], value: 0.1 },
            quantity: { reasons: ["no-raster-quantity-label"], value: 0 },
          }, { pageNumber: 2 }),
        ),
      ],
    )

    expect(report.pageAdvisories).toEqual([])
  })

  it("does not emit page advisories for non-actionable outside labels", () => {
    const page = createRepeatPanelPage("1x")
    const report = resolveStepCalloutsFromPageEvidence(
      [page],
      [
        createCandidate("accepted", ACCEPTED_REGION, "fill-panel"),
        createCandidate("repeat", REPEAT_PANEL_REGION, "border"),
      ],
      [
        createEvidence("accepted", ACCEPTED_REGION, TEST_BLUE_PANEL, {
          background: { reasons: ["manual-style-background:3"], value: 0.92 },
          border: { reasons: ["dark-edge-coverage"], value: 0.8 },
          quantity: { reasons: ["raster-lower-row-quantity-label"], value: 1 },
        }),
        createEvidence("repeat", REPEAT_PANEL_REGION, REPEAT_PANEL_BACKGROUND, {
          background: { reasons: ["off-manual-style-background:3"], value: 0.1 },
          border: { reasons: ["dark-edge-coverage"], value: 0.82 },
          quantity: { reasons: ["no-raster-quantity-label"], value: 0 },
        }),
      ],
    )

    expect(report.pageAdvisories).toEqual([])
  })

  it("does not emit page advisories for panels with internal quantity labels", () => {
    const page = createRepeatPanelPage("2x", { repeatLabelInsidePanel: true })
    const report = resolveStepCalloutsFromPageEvidence(
      [page],
      [
        createCandidate("accepted", ACCEPTED_REGION, "fill-panel"),
        createCandidate("repeat", REPEAT_PANEL_REGION, "border"),
      ],
      [
        createEvidence("accepted", ACCEPTED_REGION, TEST_BLUE_PANEL, {
          background: { reasons: ["manual-style-background:3"], value: 0.92 },
          border: { reasons: ["dark-edge-coverage"], value: 0.8 },
          quantity: { reasons: ["raster-lower-row-quantity-label"], value: 1 },
        }),
        createEvidence("repeat", REPEAT_PANEL_REGION, REPEAT_PANEL_BACKGROUND, {
          background: { reasons: ["off-manual-style-background:3"], value: 0.1 },
          border: { reasons: ["dark-edge-coverage"], value: 0.82 },
          quantity: { reasons: ["raster-quantity-label-inside-candidate"], value: 1 },
        }),
      ],
    )

    expect(report.pageAdvisories).toEqual([])
  })

  it("recovers large connected repeat labels attached to squarish panel corners", () => {
    const stepPage = createStepPage(1)
    const repeatPage = createRepeatPanelPage("2x", {
      connectedCornerLabel: true,
      includeAccepted: false,
      pageNumber: 2,
    })
    const report = resolveStepCalloutsFromPageEvidence(
      [stepPage, repeatPage],
      [
        createCandidate("accepted", ACCEPTED_REGION, "fill-panel", 1),
        createCandidate("repeat", REPEAT_PANEL_REGION, "border", 2),
      ],
      [
        createEvidence("accepted", ACCEPTED_REGION, TEST_BLUE_PANEL, {
          background: { reasons: ["manual-style-background:3"], value: 0.92 },
          border: { reasons: ["dark-edge-coverage"], value: 0.8 },
          quantity: { reasons: ["raster-lower-row-quantity-label"], value: 1 },
        }, { pageNumber: 1 }),
        createEvidence("repeat", REPEAT_PANEL_REGION, REPEAT_PANEL_BACKGROUND, {
          background: { reasons: ["off-manual-style-background:3"], value: 0.1 },
          border: { reasons: ["dark-edge-coverage"], value: 0.82 },
          quantity: { reasons: ["no-raster-quantity-label"], value: 0 },
        }, { pageNumber: 2 }),
      ],
      { includePageAdvisoryDiagnostics: true },
    )

    expect(report.pageAdvisories).toEqual([
      expect.objectContaining({
        pageNumber: 2,
        text: "2x",
        value: 2,
      }),
    ])
    expect(report.pageAdvisoryDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        decision: "accepted",
        labels: expect.arrayContaining([
          expect.objectContaining({
            accepted: true,
            text: "2x",
            value: 2,
          }),
        ]),
        pageNumber: 2,
      }),
    ]))
  })

  it("recovers separated bold repeat labels attached to panel corners", () => {
    const stepPage = createStepPage(1)
    const repeatPage = createRepeatPanelPage("2x", {
      includeAccepted: false,
      pageNumber: 2,
      separatedCornerLabel: true,
    })
    const report = resolveStepCalloutsFromPageEvidence(
      [stepPage, repeatPage],
      [
        createCandidate("accepted", ACCEPTED_REGION, "fill-panel", 1),
        createCandidate("repeat", REPEAT_PANEL_REGION, "border", 2),
      ],
      [
        createEvidence("accepted", ACCEPTED_REGION, TEST_BLUE_PANEL, {
          background: { reasons: ["manual-style-background:3"], value: 0.92 },
          border: { reasons: ["dark-edge-coverage"], value: 0.8 },
          quantity: { reasons: ["raster-lower-row-quantity-label"], value: 1 },
        }, { pageNumber: 1 }),
        createEvidence("repeat", REPEAT_PANEL_REGION, REPEAT_PANEL_BACKGROUND, {
          background: { reasons: ["off-manual-style-background:3"], value: 0.1 },
          border: { reasons: ["dark-edge-coverage"], value: 0.82 },
          quantity: { reasons: ["no-raster-quantity-label"], value: 0 },
        }, { pageNumber: 2 }),
      ],
    )

    expect(report.pageAdvisories).toEqual([
      expect.objectContaining({
        pageNumber: 2,
        text: "2x",
        value: 2,
      }),
    ])
  })

  it("recovers separated repeat labels connected to the panel border", () => {
    const stepPage = createStepPage(1)
    const repeatPage = createRepeatPanelPage("2x", {
      includeAccepted: false,
      pageNumber: 2,
      separatedBorderTouchingLabel: true,
    })
    const report = resolveStepCalloutsFromPageEvidence(
      [stepPage, repeatPage],
      [
        createCandidate("accepted", ACCEPTED_REGION, "fill-panel", 1),
        createCandidate("repeat", REPEAT_PANEL_REGION, "border", 2),
      ],
      [
        createEvidence("accepted", ACCEPTED_REGION, TEST_BLUE_PANEL, {
          background: { reasons: ["manual-style-background:3"], value: 0.92 },
          border: { reasons: ["dark-edge-coverage"], value: 0.8 },
          quantity: { reasons: ["raster-lower-row-quantity-label"], value: 1 },
        }, { pageNumber: 1 }),
        createEvidence("repeat", REPEAT_PANEL_REGION, REPEAT_PANEL_BACKGROUND, {
          background: { reasons: ["off-manual-style-background:3"], value: 0.1 },
          border: { reasons: ["dark-edge-coverage"], value: 0.82 },
          quantity: { reasons: ["no-raster-quantity-label"], value: 0 },
        }, { pageNumber: 2 }),
      ],
    )

    expect(report.pageAdvisories).toEqual([
      expect.objectContaining({
        pageNumber: 2,
        text: "2x",
        value: 2,
      }),
    ])
  })

})

function createStepPage(pageNumber: number) {
  return withPageNumber(createSyntheticStepCalloutPage((data) => {
    paintRegion(data, ACCEPTED_REGION, TEST_BLUE_PANEL)
    paintBorder(data, ACCEPTED_REGION, TEST_BLACK)
    paintRasterQuantityLabel(data, "1x", 22, 24)
  }), pageNumber)
}

function createRepeatPanelPage(
  labelText: string,
  {
    connectedCornerLabel = false,
    includeAccepted = true,
    labelX,
    labelY,
    pageNumber = 1,
    repeatLabelInsidePanel = false,
    repeatBackground = REPEAT_PANEL_BACKGROUND,
    separatedBorderTouchingLabel = false,
    separatedCornerLabel = false,
  }: {
    connectedCornerLabel?: boolean
    includeAccepted?: boolean
    labelX?: number
    labelY?: number
    pageNumber?: number
    repeatLabelInsidePanel?: boolean
    repeatBackground?: typeof REPEAT_PANEL_BACKGROUND
    separatedBorderTouchingLabel?: boolean
    separatedCornerLabel?: boolean
  } = {},
) {
  return withPageNumber(createSyntheticStepCalloutPage((data) => {
    if (includeAccepted) {
      paintRegion(data, ACCEPTED_REGION, TEST_BLUE_PANEL)
      paintBorder(data, ACCEPTED_REGION, TEST_BLACK)
      paintRasterQuantityLabel(data, "1x", 22, 24)
    }

    paintRegion(data, REPEAT_PANEL_REGION, repeatBackground)
    paintBorder(data, REPEAT_PANEL_REGION, TEST_BLACK)
    if (connectedCornerLabel) {
      paintConnectedScaledRasterQuantityLabel(
        data,
        labelText,
        REPEAT_PANEL_REGION.x - 26,
        REPEAT_PANEL_REGION.y + REPEAT_PANEL_REGION.height + 2,
        4,
        2,
      )
    } else if (separatedCornerLabel) {
      paintSeparatedScaledRasterQuantityLabel(
        data,
        labelText,
        REPEAT_PANEL_REGION.x - 25,
        REPEAT_PANEL_REGION.y + REPEAT_PANEL_REGION.height + 1,
        3,
        2,
      )
    } else if (separatedBorderTouchingLabel) {
      paintSeparatedScaledRasterQuantityLabel(
        data,
        labelText,
        REPEAT_PANEL_REGION.x - 25,
        REPEAT_PANEL_REGION.y + REPEAT_PANEL_REGION.height - 9,
        3,
        2,
      )
    } else {
      paintRasterQuantityLabel(
        data,
        labelText,
        labelX ?? (repeatLabelInsidePanel ? REPEAT_PANEL_REGION.x + 6 : 58),
        labelY ?? (repeatLabelInsidePanel ? REPEAT_PANEL_REGION.y + REPEAT_PANEL_REGION.height - 12 : 45),
      )
    }
  }), pageNumber)
}

function createBomTablePage(pageNumber: number) {
  return withPageNumber(createSyntheticStepCalloutPage((data) => {
    paintRegion(data, REPEAT_PANEL_REGION, REPEAT_PANEL_BACKGROUND)
    paintBorder(data, REPEAT_PANEL_REGION, TEST_BLACK)
    paintRasterQuantityLabel(data, "2x", 58, 45)

    for (const region of createBomCellRegions()) {
      paintRegion(data, region, TEST_BLUE_PANEL)
      paintBorder(data, region, TEST_BLACK)
    }
  }), pageNumber)
}

function createBomCellRegions(): StepCalloutRegion[] {
  return [
    { height: 12, width: 12, x: 8, y: 58 },
    { height: 12, width: 12, x: 24, y: 58 },
    { height: 12, width: 12, x: 40, y: 58 },
    { height: 12, width: 12, x: 56, y: 58 },
    { height: 12, width: 12, x: 72, y: 58 },
    { height: 12, width: 12, x: 88, y: 58 },
    { height: 12, width: 12, x: 104, y: 58 },
    { height: 12, width: 12, x: 8, y: 42 },
  ]
}

function createCandidate(
  id: string,
  region: StepCalloutRegion,
  source: StepCalloutCandidate["source"],
  pageNumber = 1,
): StepCalloutCandidate {
  return {
    id,
    pageNumber,
    region,
    source,
  }
}

function createEvidence(
  candidateId: string,
  region: StepCalloutRegion,
  background: StepCalloutRgbColor,
  signals: Record<StepCalloutEvidenceScore["signal"], Omit<StepCalloutEvidenceScore, "signal">>,
  {
    pageNumber = 1,
    source = "border",
  }: {
    pageNumber?: number
    source?: StepCalloutCandidate["source"]
  } = {},
): StepCalloutCandidateEvidence {
  return {
    background,
    candidate: createCandidate(candidateId, region, source, pageNumber),
    scores: (["background", "border", "quantity"] as const).map((signal) => ({
      ...signals[signal],
      signal,
    })),
    totalScore: signals.background.value + signals.border.value + signals.quantity.value,
  }
}

function createBlankPage(pageNumber: number) {
  const width = 64
  const height = 48
  const data = new Uint8ClampedArray(width * height * 4)

  for (let index = 0; index < data.length; index += 4) {
    data[index] = 255
    data[index + 1] = 255
    data[index + 2] = 255
    data[index + 3] = 255
  }

  return createStepCalloutPageInput({
    data,
    height,
    pageNumber,
    width,
  })
}

function withPageNumber<T extends { pageNumber: number }>(page: T, pageNumber: number): T {
  return {
    ...page,
    pageNumber,
  }
}
