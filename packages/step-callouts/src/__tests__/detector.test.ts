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
  paintRasterQuantityLabel,
  paintRegion,
  TEST_BLACK,
  TEST_BLUE_PANEL,
} from "./helpers/synthetic-page-test-helper"

const ACCEPTED_REGION = { height: 24, width: 36, x: 10, y: 8 }
const REPEAT_PANEL_REGION = { height: 40, width: 36, x: 72, y: 12 }
const REPEAT_PANEL_BACKGROUND = { a: 255, b: 230, g: 242, r: 248 }

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

  it("does not emit page advisories for non-actionable outside labels", () => {
    const page = createRepeatPanelPage("1x")
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
})

function createRepeatPanelPage(labelText: string) {
  return createSyntheticStepCalloutPage((data) => {
    paintRegion(data, ACCEPTED_REGION, TEST_BLUE_PANEL)
    paintBorder(data, ACCEPTED_REGION, TEST_BLACK)
    paintRasterQuantityLabel(data, "1x", 22, 24)
    paintRegion(data, REPEAT_PANEL_REGION, REPEAT_PANEL_BACKGROUND)
    paintBorder(data, REPEAT_PANEL_REGION, TEST_BLACK)
    paintRasterQuantityLabel(data, labelText, 58, 45)
  })
}

function createCandidate(
  id: string,
  region: StepCalloutRegion,
  source: StepCalloutCandidate["source"],
): StepCalloutCandidate {
  return {
    id,
    pageNumber: 1,
    region,
    source,
  }
}

function createEvidence(
  candidateId: string,
  region: StepCalloutRegion,
  background: StepCalloutRgbColor,
  signals: Record<StepCalloutEvidenceScore["signal"], Omit<StepCalloutEvidenceScore, "signal">>,
): StepCalloutCandidateEvidence {
  return {
    background,
    candidate: createCandidate(candidateId, region, "border"),
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
