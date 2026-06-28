import { describe, expect, it } from "vitest"
import type { StepCalloutCandidate, StepCalloutRegion } from "../contracts"
import { scoreStepCalloutBackgroundEvidence } from "../evidence-background"
import {
  inferStepCalloutManualCalloutStyle,
  scoreStepCalloutManualStyleCompatibility,
} from "../manual-style"
import type { StepCalloutRgbColor } from "../pixels"
import {
  createSyntheticStepCalloutPage,
  paintRasterQuantityLabel,
  paintRegion,
  TEST_BLUE_PANEL,
  type TestStepCalloutColor,
} from "./helpers/synthetic-page-test-helper"

const TAN_PANEL = { a: 255, b: 174, g: 218, r: 230 }
const STYLE_REGION_1 = { height: 20, width: 24, x: 8, y: 8 }
const STYLE_REGION_2 = { height: 20, width: 24, x: 48, y: 8 }
const STYLE_REGION_3 = { height: 20, width: 24, x: 88, y: 8 }
const OFF_STYLE_REGION = { height: 20, width: 24, x: 8, y: 48 }
const TEST_LIGHT_BLUE_STYLE = { b: 254, g: 238, r: 215 }
const TEST_NEAR_WHITE_BUILD_WALL = { b: 254, g: 254, r: 254 }
const TEST_GRAY_BUILD_ART = { a: 255, b: 183, g: 179, r: 174 }

describe("stepCallout manual callout style", () => {
  it("infers repeated fill-panel color without using an off-style border panel", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintRegion(data, STYLE_REGION_1, TAN_PANEL)
      paintRegion(data, STYLE_REGION_2, TAN_PANEL)
      paintRegion(data, STYLE_REGION_3, TAN_PANEL)
      paintRegion(data, OFF_STYLE_REGION, TEST_BLUE_PANEL)
    })

    const style = inferStepCalloutManualCalloutStyle(
      [page],
      [
        createCandidate("style-1", STYLE_REGION_1, "fill-panel"),
        createCandidate("style-2", STYLE_REGION_2, "fill-panel"),
        createCandidate("style-3", STYLE_REGION_3, "fill-panel"),
        createCandidate("off-style", OFF_STYLE_REGION, "border"),
      ],
    )

    expect(style).toEqual({
      background: toRgb(TAN_PANEL),
      sampleCount: 3,
    })
  })

  it("does not infer a manual style from one fill panel", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintRegion(data, STYLE_REGION_1, TAN_PANEL)
    })

    expect(
      inferStepCalloutManualCalloutStyle([page], [createCandidate("single", STYLE_REGION_1, "fill-panel")]),
    ).toBeNull()
  })

  it("ignores same-background no-quantity candidates when quantity-labeled panel style is present", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintRegion(data, STYLE_REGION_1, TAN_PANEL)
      paintRegion(data, STYLE_REGION_2, TAN_PANEL)
      paintRegion(data, STYLE_REGION_3, TAN_PANEL)
      paintRasterQuantityLabel(data, "4x", 12, 20)
      paintRasterQuantityLabel(data, "4x", 52, 20)
      paintRasterQuantityLabel(data, "4x", 92, 20)
    })
    const sameBackgroundCandidates = [
      createCandidate("blank-1", { height: 20, width: 24, x: 8, y: 48 }, "fill-panel"),
      createCandidate("blank-2", { height: 20, width: 24, x: 48, y: 48 }, "fill-panel"),
      createCandidate("blank-3", { height: 20, width: 24, x: 88, y: 48 }, "fill-panel"),
    ]

    const style = inferStepCalloutManualCalloutStyle(
      [page],
      [
        createCandidate("style-1", STYLE_REGION_1, "fill-panel"),
        createCandidate("style-2", STYLE_REGION_2, "fill-panel"),
        createCandidate("style-3", STYLE_REGION_3, "fill-panel"),
        ...sameBackgroundCandidates,
      ],
    )

    expect(style).toEqual({
      background: toRgb(TAN_PANEL),
      sampleCount: 3,
    })
  })

  it("prefers quantity-labeled panel style over more numerous unlabeled build-art fills", () => {
    const quantityRegions = [
      { height: 20, width: 24, x: 8, y: 8 },
      { height: 20, width: 24, x: 48, y: 8 },
      { height: 20, width: 24, x: 88, y: 8 },
    ]
    const buildArtRegions = [
      { height: 20, width: 24, x: 8, y: 48 },
      { height: 20, width: 24, x: 36, y: 48 },
      { height: 20, width: 24, x: 64, y: 48 },
      { height: 20, width: 24, x: 92, y: 48 },
    ]
    const page = createSyntheticStepCalloutPage((data) => {
      for (const region of quantityRegions) {
        paintRegion(data, region, TEST_BLUE_PANEL)
      }
      for (const region of buildArtRegions) {
        paintRegion(data, region, TEST_GRAY_BUILD_ART)
      }
      paintRasterQuantityLabel(data, "4x", 12, 20)
      paintRasterQuantityLabel(data, "4x", 52, 20)
      paintRasterQuantityLabel(data, "4x", 92, 20)
    })

    const style = inferStepCalloutManualCalloutStyle(
      [page],
      [
        ...quantityRegions.map((region, index) =>
          createCandidate(`quantity-style-${index}`, region, "fill-panel")
        ),
        ...buildArtRegions.map((region, index) =>
          createCandidate(`build-art-${index}`, region, "fill-panel")
        ),
      ],
    )

    expect(style).toEqual({
      background: toRgb(TEST_BLUE_PANEL),
      sampleCount: 3,
    })
  })

  it("uses manual style by default but allows page-local contrast when quantity anchors it", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintRegion(data, STYLE_REGION_1, TAN_PANEL)
      paintRegion(data, OFF_STYLE_REGION, TEST_BLUE_PANEL)
    })
    const style = {
      background: toRgb(TAN_PANEL),
      sampleCount: 3,
    }

    expect(scoreStepCalloutBackgroundEvidence(
      page,
      createCandidate("style", STYLE_REGION_1, "border"),
      toRgb(TAN_PANEL),
      style,
    ))
      .toEqual({
        reasons: ["manual-style-background:3"],
        signal: "background",
        value: 1,
      })
    expect(
      scoreStepCalloutBackgroundEvidence(
        page,
        createCandidate("off-style", OFF_STYLE_REGION, "border"),
        toRgb(TEST_BLUE_PANEL),
        style,
      ),
    ).toMatchObject({
      reasons: ["off-manual-style-background:3"],
      signal: "background",
      value: scoreStepCalloutManualStyleCompatibility(toRgb(TEST_BLUE_PANEL), style),
    })
    expect(
      scoreStepCalloutBackgroundEvidence(
        page,
        createCandidate("off-style", OFF_STYLE_REGION, "border"),
        toRgb(TEST_BLUE_PANEL),
        style,
        { allowPageLocalFallback: true },
      ),
    ).toMatchObject({
      reasons: [
        "differs-from-page-background",
        "light-panel-background",
        "page-local-background-over-manual-style:3",
      ],
      signal: "background",
      value: 1,
    })
  })

  it("keeps very stable manual style from being overridden by page-local contrast", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintRegion(data, OFF_STYLE_REGION, TEST_BLUE_PANEL)
    })
    const stableStyle = {
      background: toRgb(TAN_PANEL),
      sampleCount: 97,
    }

    expect(
      scoreStepCalloutBackgroundEvidence(
        page,
        createCandidate("off-style", OFF_STYLE_REGION, "border"),
        toRgb(TEST_BLUE_PANEL),
        stableStyle,
        { allowPageLocalFallback: true },
      ),
    ).toMatchObject({
      reasons: ["off-manual-style-background:97"],
      signal: "background",
      value: scoreStepCalloutManualStyleCompatibility(toRgb(TEST_BLUE_PANEL), stableStyle),
    })
  })

  it("allows explicit compact-panel page-local contrast over stable manual style", () => {
    const page = createSyntheticStepCalloutPage((data) => {
      paintRegion(data, OFF_STYLE_REGION, TEST_BLUE_PANEL)
    })
    const stableStyle = {
      background: toRgb(TAN_PANEL),
      sampleCount: 130,
    }

    expect(
      scoreStepCalloutBackgroundEvidence(
        page,
        createCandidate("compact-top-off-style", OFF_STYLE_REGION, "fill-panel"),
        toRgb(TEST_BLUE_PANEL),
        stableStyle,
        { allowPageLocalFallback: true, forcePageLocalFallback: true },
      ),
    ).toMatchObject({
      reasons: [
        "candidate-source-fill-panel",
        "differs-from-page-background",
        "light-panel-background",
        "page-local-background-over-manual-style:130",
      ],
      signal: "background",
      value: 1,
    })
  })

  it("does not score near-white build fragments as matching a light-blue manual style", () => {
    const style = {
      background: TEST_LIGHT_BLUE_STYLE,
      sampleCount: 4,
    }

    expect(scoreStepCalloutManualStyleCompatibility(TEST_NEAR_WHITE_BUILD_WALL, style))
      .toBeLessThan(0.6)
  })
})

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

function toRgb(color: TestStepCalloutColor): StepCalloutRgbColor {
  return {
    b: color.b,
    g: color.g,
    r: color.r,
  }
}
