import { describe, expect, it } from "vitest"
import type { Region } from "../contracts"
import type { GlyphComponent } from "../glyph-mask"
import type { QuantityCandidate } from "../quantity-candidate-types"
import { rejectPartArtCandidates } from "../quantity-part-art-rejection"
import { createQuantityRecoveryPlans } from "../quantity-recovery"
import {
  TEST_BLACK,
  TEST_BLUE_PANEL,
  createSyntheticPage,
  paintBorder,
  paintRasterQuantityLabel,
  paintRegion,
} from "./synthetic-page"

const CALLOUT_REGION = { height: 62, width: 122, x: 12, y: 10 }
const LARGE_CALLOUT_REGION = { height: 210, width: 180, x: 20, y: 20 }

describe("quantity recovery plans", () => {
  it("scopes lower-threshold recovery candidates to the target row band", () => {
    const candidates = [46, 104, 164].flatMap((y) =>
      Array.from({ length: 8 }, (_, index) =>
        createQuantityCandidate(`${(index % 4) + 1}x`, 24 + index * 22, y, 12, 12),
      ),
    )
    const largeDensePlan = createQuantityRecoveryPlans(candidates, LARGE_CALLOUT_REGION)
      .find((plan) => plan.kind === "large-dense-top")

    expect(largeDensePlan).toMatchObject({
      kind: "large-dense-top",
      source: "lower-threshold",
      targetBand: {
        height: 44,
        width: LARGE_CALLOUT_REGION.width,
        x: LARGE_CALLOUT_REGION.x,
        y: 30,
      },
    })
    expect(isCandidateCenterInBand(createQuantityCandidate("1x", 30, 46, 12, 12), largeDensePlan!.targetBand))
      .toBe(true)
    expect(isCandidateCenterInBand(createQuantityCandidate("1x", 30, 104, 12, 12), largeDensePlan!.targetBand))
      .toBe(false)
  })

  it("scopes connected top-cap recovery to the lower callout band", () => {
    const plans = createQuantityRecoveryPlans([
      createQuantityCandidate("1x", 34, 52, 12),
      createQuantityCandidate("2x", 78, 52, 12),
    ], CALLOUT_REGION)
    const connectedTopCapPlan = plans.find((plan) => plan.kind === "connected-top-cap")

    expect(connectedTopCapPlan).toEqual({
      kind: "connected-top-cap",
      source: "connected-top-cap",
      targetBand: {
        height: 21,
        width: CALLOUT_REGION.width,
        x: CALLOUT_REGION.x,
        y: 51,
      },
    })
  })

  it("scopes attached-baseline recovery to printed peer rows", () => {
    const plans = createQuantityRecoveryPlans([
      createQuantityCandidate("1x", 34, 52, 12, 10, 2),
      createQuantityCandidate("2x", 78, 52, 12, 10, 2),
      createQuantityCandidate("3x", 34, 86, 12, 10, 2),
    ], { height: 110, width: 122, x: 12, y: 10 })
    const attachedBaselinePlan = plans.find((plan) => plan.kind === "attached-baseline")

    expect(attachedBaselinePlan).toMatchObject({
      kind: "attached-baseline",
      source: "attached-baseline",
      targetBand: {
        width: 122,
        x: 12,
      },
    })
    expect(isCandidateCenterInBand(createQuantityCandidate("1x", 34, 52, 12), attachedBaselinePlan!.targetBand))
      .toBe(true)
    expect(isCandidateCenterInBand(createQuantityCandidate("1x", 34, 100, 12), attachedBaselinePlan!.targetBand))
      .toBe(false)
  })

  it("rejects recovery-tagged fake labels through normal part-art filters", () => {
    const page = createSyntheticPage((data) => {
      paintCallout(data)
      paintRegion(data, { height: 12, width: 22, x: 18, y: 24 }, TEST_BLACK)
      paintRasterQuantityLabel(data, "1x", 58, 52)
      paintRasterQuantityLabel(data, "6x", 88, 52)
    })
    const fakeRecoveredCandidate = {
      ...createQuantityCandidate("6x", 18, 24, 22, 12),
      recoveryKind: "large-dense-top" as const,
    }
    const candidates = [
      fakeRecoveredCandidate,
      createQuantityCandidate("1x", 58, 52, 10),
      createQuantityCandidate("6x", 88, 52, 10),
    ]

    expect(rejectPartArtCandidates(page, TEST_BLUE_PANEL, candidates))
      .not.toContain(fakeRecoveredCandidate)
  })
})

function createQuantityCandidate(
  text: string,
  x: number,
  y: number,
  width: number,
  height = 7,
  glyphCount = 0,
): QuantityCandidate {
  return {
    confidence: 0.92,
    glyphs: Array.from({ length: glyphCount }, (_, index) => createGlyph({ height, width: 4, x: x + index * 6, y })),
    region: { height, width, x, y },
    text,
    value: Number.parseInt(text, 10),
  }
}

function createGlyph(region: Region): GlyphComponent {
  return {
    area: region.width * region.height,
    pixels: [{ x: region.x, y: region.y }],
    region,
  }
}

function isCandidateCenterInBand(candidate: QuantityCandidate, band: Region): boolean {
  const centerY = candidate.region.y + candidate.region.height / 2

  return centerY >= band.y && centerY <= band.y + band.height
}

function paintCallout(data: Uint8ClampedArray): void {
  paintRegion(data, CALLOUT_REGION, TEST_BLUE_PANEL)
  paintBorder(data, CALLOUT_REGION, TEST_BLACK)
}
