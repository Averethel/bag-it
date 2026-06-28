import { describe, expect, it } from "vitest"
import {
  createStepCalloutBagRows,
  createStepCalloutBaggingPlan,
  restoreCheckedBagRowsById,
} from "./step-callout-bagging"
import { transferCheckedBagRowsByAnchor } from "./bag-completion-anchors"
import {
  STEP_CALLOUT_DETECTOR_V2_VERSION as STEP_CALLOUT_DETECTOR_VERSION,
  STEP_PART_COLOR_CALIBRATION_V2_VERSION as STEP_PART_COLOR_CALIBRATION_VERSION,
  STEP_PART_EXTRACTOR_V2_VERSION as STEP_PART_EXTRACTOR_VERSION,
} from "@/features/steps/v2/browser-step-detector-adapter"
import type {
  DetectedStepCallout,
  DetectedStepCalloutPartItem,
  StepCalloutDetectionResult,
  StepSectionBoundaryHint,
} from "@/features/steps/step-detection-contracts"

describe("step-callout-bagging", () => {
  it("uses detected callout quantity for policy size when inventory is absent", () => {
    const result = resultWithCallouts([
      callout({ id: "c1", pageNumber: 1, quantity: 60 }),
      callout({ id: "c2", pageNumber: 2, quantity: 60 }),
      callout({ id: "c3", pageNumber: 3, quantity: 60 }),
    ])

    const plan = createStepCalloutBaggingPlan(result)

    expect(plan.setPieceCount).toBe(180)
    expect(plan.policy.source).toBe("detected-callout-quantity")
    expect(plan.policy.band).toBe("small")
    expect(plan.policy.targetParts).toBe(105)
  })

  it("keeps one manual page inside one bag even when the page is oversized", () => {
    const result = resultWithCallouts([
      callout({ id: "c1", pageNumber: 1, quantity: 90 }),
      callout({ id: "c2", pageNumber: 1, quantity: 90 }),
      callout({ id: "c3", pageNumber: 2, quantity: 80 }),
    ])

    const plan = createStepCalloutBaggingPlan(result)

    expect(plan.bags[0].pageRange.pages).toEqual([1])
    expect(plan.bags[0].partCount).toBe(180)
    expect(plan.bags[0].status).toBe("draft")
    expect(plan.bags[0].reviewReasons).toEqual([])
  })

  it("merges small neighbor bags within the overfill tolerance", () => {
    const result = resultWithCallouts([
      callout({ id: "c1", pageNumber: 1, quantity: 120 }),
      callout({ id: "c2", pageNumber: 2, quantity: 45 }),
      callout({ id: "c3", pageNumber: 3, quantity: 130 }),
    ])

    const plan = createStepCalloutBaggingPlan(result)

    expect(plan.bags.map((bag) => bag.partCount)).toEqual([165, 130])
    expect(plan.bags[0].status).toBe("draft")
    expect(plan.bags[0].reviewReasons).toEqual([])
  })

  it("carries across a no-baggable scanned page when the active bag is still small", () => {
    const result = resultWithCallouts([
      callout({ id: "c1", pageNumber: 1, quantity: 60 }),
      callout({ id: "c2", pageNumber: 3, quantity: 40 }),
    ], {
      scannedPageNumbers: [1, 2, 3],
    })

    const plan = createStepCalloutBaggingPlan(result)

    expect(plan.bags.map((bag) => bag.pageRange.pages)).toEqual([[1, 3]])
    expect(plan.bags.map((bag) => bag.partCount)).toEqual([100])
  })

  it("carries across a zero-part callout page when the active bag is still small", () => {
    const result = resultWithCallouts([
      callout({ id: "c1", pageNumber: 1, quantity: 60 }),
      emptyCallout({ id: "zero", pageNumber: 2 }),
      callout({ id: "c2", pageNumber: 3, quantity: 40 }),
    ], {
      scannedPageNumbers: [1, 2, 3],
    })

    const plan = createStepCalloutBaggingPlan(result)

    expect(plan.bags.map((bag) => bag.pageRange.pages)).toEqual([[1, 3]])
  })

  it("closes before a new-section hint when the active bag has useful fill", () => {
    const result = resultWithCallouts([
      callout({ id: "c1", pageNumber: 1, quantity: 90 }),
      callout({ id: "c2", pageNumber: 2, quantity: 10 }),
      callout({ id: "c3", pageNumber: 3, quantity: 50 }),
    ], {
      sectionBoundaryHints: [sectionBoundaryHint(2)],
    })

    const plan = createStepCalloutBaggingPlan(result)

    expect(plan.bags.map((bag) => bag.pageRange.pages)).toEqual([[1], [2, 3]])
    expect(plan.bags.map((bag) => bag.partCount)).toEqual([90, 60])
  })

  it("does not merge undersized bags across a useful section boundary hint", () => {
    const result = resultWithCallouts([
      callout({ id: "c1", pageNumber: 1, quantity: 120 }),
      callout({ id: "c2", pageNumber: 3, quantity: 45 }),
    ], {
      scannedPageNumbers: [1, 3],
      sectionBoundaryHints: [sectionBoundaryHint(3)],
    })

    const plan = createStepCalloutBaggingPlan(result)

    expect(plan.bags.map((bag) => bag.partCount)).toEqual([120, 45])
  })

  it("merges an abnormally small bag across a useful section boundary", () => {
    const result = resultWithCallouts([
      callout({ id: "c1", pageNumber: 1, quantity: 120 }),
      callout({ id: "c2", pageNumber: 3, quantity: 16 }),
    ], {
      scannedPageNumbers: [1, 3],
      sectionBoundaryHints: [sectionBoundaryHint(3)],
    })

    const plan = createStepCalloutBaggingPlan(result)

    expect(plan.bags.map((bag) => bag.pageRange.pages)).toEqual([[1, 3]])
    expect(plan.bags.map((bag) => bag.partCount)).toEqual([136])
  })

  it("keeps a section-ending page when it completes a nearly full bag", () => {
    const result = resultWithCallouts([
      callout({ id: "c1", pageNumber: 1, quantity: 90 }),
      callout({ id: "c2", pageNumber: 2, quantity: 35 }),
      callout({ id: "c3", pageNumber: 4, quantity: 50 }),
    ], {
      scannedPageNumbers: [1, 2, 3, 4],
    })

    const plan = createStepCalloutBaggingPlan(result)

    expect(plan.bags.map((bag) => bag.pageRange.pages)).toEqual([[1, 2], [4]])
    expect(plan.bags.map((bag) => bag.partCount)).toEqual([125, 50])
  })

  it("still uses target sizing when no section anchor exists", () => {
    const result = resultWithCallouts([
      callout({ id: "c1", pageNumber: 1, quantity: 120 }),
      callout({ id: "c2", pageNumber: 2, quantity: 45 }),
    ])

    const plan = createStepCalloutBaggingPlan(result)

    expect(plan.bags.map((bag) => bag.partCount)).toEqual([165])
  })

  it("does not let step count alone create tiny low-part bags", () => {
    const result = resultWithCallouts([
      ...Array.from({ length: 10 }, (_value, index) =>
        callout({ id: `p1-c${index}`, pageNumber: 1, quantity: 1, x: 10 + index }),
      ),
      ...Array.from({ length: 10 }, (_value, index) =>
        callout({ id: `p2-c${index}`, pageNumber: 2, quantity: 1, x: 10 + index }),
      ),
    ])

    const plan = createStepCalloutBaggingPlan(result)

    expect(plan.policy.targetSteps).toBe(18)
    expect(plan.bags).toHaveLength(1)
    expect(plan.bags[0].partCount).toBe(20)
  })

  it("keeps section-aware bags under the soft hard cap when pages allow it", () => {
    const result = resultWithCallouts([
      callout({ id: "c1", pageNumber: 1, quantity: 150 }),
      callout({ id: "c2", pageNumber: 2, quantity: 20 }),
    ], {
      scannedPageNumbers: [1, 2, 3],
    })

    const plan = createStepCalloutBaggingPlan(result)

    expect(plan.policy.maxParts + plan.policy.overfillToleranceParts).toBe(166)
    expect(plan.bags.map((bag) => bag.partCount)).toEqual([150, 20])
  })

  it("recalculates row ids and quantities when a callout multiplier changes", () => {
    const result = resultWithCallouts([
      callout({ id: "c1", pageNumber: 1, quantity: 4 }),
    ])
    const firstPlan = createStepCalloutBaggingPlan(result)
    const firstRows = createStepCalloutBagRows(firstPlan, {
      manualFingerprint: "manual:1",
      pagePreviews: result.pagePreviews,
    })
    const secondPlan = createStepCalloutBaggingPlan(result, {
      calloutMultipliers: { c1: 3 },
    })
    const secondRows = createStepCalloutBagRows(secondPlan, {
      manualFingerprint: "manual:1",
      pagePreviews: result.pagePreviews,
    })

    expect(firstRows[0].quantity).toBe(4)
    expect(firstRows[0].calloutBackgroundHex).toBe("#eef5ff")
    expect(secondRows[0].quantity).toBe(12)
    expect(secondRows[0].id).not.toBe(firstRows[0].id)
  })

  it("restores checked rows by id for current plans", () => {
    const result = resultWithCallouts([
      callout({ id: "c1", pageNumber: 1, quantity: 2 }),
      callout({ id: "c2", pageNumber: 2, quantity: 2 }),
    ])
    const rows = createStepCalloutBagRows(createStepCalloutBaggingPlan(result), {
      manualFingerprint: "manual:1",
      pagePreviews: result.pagePreviews,
    })

    expect(Object.keys(restoreCheckedBagRowsById([rows[0].id, "missing"], rows))).toEqual([
      rows[0].id,
    ])
  })

  it("transfers checked rows through coordinate anchors when exactly one row matches", () => {
    const original = resultWithCallouts([
      callout({ id: "old-c1", pageNumber: 1, quantity: 2, x: 10 }),
    ])
    const next = resultWithCallouts([
      callout({ id: "new-c1", pageNumber: 1, quantity: 2, x: 11 }),
    ])
    const originalRows = createStepCalloutBagRows(createStepCalloutBaggingPlan(original), {
      manualFingerprint: "manual:1",
      pagePreviews: original.pagePreviews,
    })
    const nextRows = createStepCalloutBagRows(createStepCalloutBaggingPlan(next), {
      manualFingerprint: "manual:1",
      pagePreviews: next.pagePreviews,
    })

    const transferred = transferCheckedBagRowsByAnchor(
      [originalRows[0].anchor],
      nextRows,
      "manual:1",
    )

    expect(transferred.restoredCount).toBe(1)
    expect(Object.keys(transferred.checkedRows)).toEqual([nextRows[0].id])
  })

  it("drops ambiguous anchor transfers", () => {
    const original = resultWithCallouts([
      callout({ id: "old-c1", pageNumber: 1, quantity: 2, x: 10 }),
    ])
    const next = resultWithCallouts([
      callout({ id: "new-c1", pageNumber: 1, quantity: 2, x: 10 }),
      callout({ id: "new-c2", pageNumber: 1, quantity: 2, x: 10 }),
    ])
    const originalRows = createStepCalloutBagRows(createStepCalloutBaggingPlan(original), {
      manualFingerprint: "manual:1",
      pagePreviews: original.pagePreviews,
    })
    const nextRows = createStepCalloutBagRows(createStepCalloutBaggingPlan(next), {
      manualFingerprint: "manual:1",
      pagePreviews: next.pagePreviews,
    })

    const transferred = transferCheckedBagRowsByAnchor(
      [originalRows[0].anchor],
      nextRows,
      "manual:1",
    )

    expect(transferred.restoredCount).toBe(0)
    expect(transferred.droppedCount).toBe(1)
  })
})

function resultWithCallouts(
  callouts: DetectedStepCallout[],
  options: {
    scannedPageNumbers?: number[]
    sectionBoundaryHints?: StepSectionBoundaryHint[]
  } = {},
): StepCalloutDetectionResult {
  const scannedPageNumbers = options.scannedPageNumbers ?? [
    ...new Set(callouts.map((callout) => callout.pageNumber)),
  ]

  return {
    detectorVersion: STEP_CALLOUT_DETECTOR_VERSION,
    partColorCalibrationVersion: STEP_PART_COLOR_CALIBRATION_VERSION,
    partExtractorVersion: STEP_PART_EXTRACTOR_VERSION,
    pageCount: scannedPageNumbers.length,
    pageLimit: null,
    scannedPageNumbers,
    skippedPageNumbers: [],
    status: callouts.length > 0 ? "detected" : "empty",
    pagePreviews: scannedPageNumbers.map((pageNumber) => ({
      pageNumber,
      width: 200,
      height: 300,
    })),
    pageAttentionItems: [],
    sectionBoundaryHints: options.sectionBoundaryHints,
    callouts,
  }
}
function callout({
  id,
  pageNumber,
  quantity,
  x = 10,
}: {
  id: string
  pageNumber: number
  quantity: number
  x?: number
}): DetectedStepCallout {
  return {
    id,
    pageNumber,
    indexOnPage: 0,
    stepIndex: pageNumber,
    confidence: 0.9,
    sourceRegion: { x, y: pageNumber * 20, width: 80, height: 40 },
    crop: {
      region: { x, y: pageNumber * 20, width: 80, height: 40 },
    },
    inferredBackground: {
      hex: "#eef5ff",
      rgb: { r: 238, g: 245, b: 255 },
      confidence: 0.8,
    },
    partItems: [
      partItem({
        id: `${id}-item`,
        quantity,
        x: x + 10,
      }),
    ],
  }
}

function emptyCallout({
  id,
  pageNumber,
  x = 10,
}: {
  id: string
  pageNumber: number
  x?: number
}): DetectedStepCallout {
  return {
    ...callout({ id, pageNumber, quantity: 1, x }),
    partItems: [],
  }
}

function sectionBoundaryHint(pageNumber: number): StepSectionBoundaryHint {
  return {
    confidence: 0.8,
    id: `section-boundary-page-${pageNumber}`,
    kind: "off-style-rejected-callout",
    pageNumber,
    position: "before-page",
    sourceRegion: { height: 40, width: 80, x: 10, y: pageNumber * 20 },
  }
}

function calloutWithPartItems({
  id,
  items,
  pageNumber,
  x = 10,
}: {
  id: string
  items: Array<{
    colorName?: "Bright Green" | "Dark Bluish Gray" | "Dark Green" | "Green" | "Light Bluish Gray"
    imageDataUrl: string
    manualClassId?: string
    manualClassTrusted?: boolean
    quantity: number
    rawManualClassId?: string
    size?: {
      height: number
      width: number
    }
  }>
  pageNumber: number
  x?: number
}): DetectedStepCallout {
  return {
    ...callout({ id, pageNumber, quantity: 1, x }),
    partItems: items.map((item, index) =>
      partItem({
        colorName: item.colorName,
        id: `${id}-item-${index}`,
        imageDataUrl: item.imageDataUrl,
        indexOnCallout: index,
        manualClassId: item.manualClassId,
        manualClassTrusted: item.manualClassTrusted,
        quantity: item.quantity,
        rawManualClassId: item.rawManualClassId,
        size: item.size,
        x: x + index * 40,
      }),
    ),
  }
}

function partItem({
  colorName,
  id,
  imageDataUrl,
  indexOnCallout = 0,
  manualClassId,
  manualClassTrusted,
  quantity,
  rawManualClassId,
  size = { height: 14, width: 24 },
  x,
}: {
  colorName?: "Bright Green" | "Dark Bluish Gray" | "Dark Green" | "Green" | "Light Bluish Gray"
  id: string
  imageDataUrl?: string
  indexOnCallout?: number
  manualClassId?: string
  manualClassTrusted?: boolean
  quantity: number
  rawManualClassId?: string
  size?: {
    height: number
    width: number
  }
  x: number
}): DetectedStepCalloutPartItem {
  return {
    id,
    indexOnCallout,
    confidence: 0.9,
    sourceRegion: { x, y: 10, width: 32, height: 18 },
    detectedColor: colorName ? testDetectedColor(colorName, { manualClassId, manualClassTrusted, rawManualClassId }) : undefined,
    partRegion: { x: x + 8, y: 10, width: size.width, height: size.height },
    quantityLabel: {
      region: { x, y: 20, width: 8, height: 8 },
      crop: {
        region: { x, y: 20, width: 8, height: 8 },
      },
    },
    quantity: {
      value: quantity,
      text: `${quantity}x`,
      confidence: 0.9,
    },
    partCrop: {
      imageDataUrl,
      region: { x: x + 8, y: 10, width: size.width, height: size.height },
    },
  }
}

function testDetectedColor(
  colorName: "Bright Green" | "Dark Bluish Gray" | "Dark Green" | "Green" | "Light Bluish Gray",
  options: {
    manualClassId?: string
    manualClassTrusted?: boolean
    rawManualClassId?: string
  } = {},
) {
  const hex = colorName === "Dark Bluish Gray"
    ? "#6c6e68"
    : colorName === "Dark Green"
      ? "#184632"
    : colorName === "Green"
      ? "#237841"
      : colorName === "Bright Green"
        ? "#4b9f4a"
        : "#a0a5a9"

  return {
    alternatives: [],
    confidence: 0.8,
    distance: 0,
    family: colorName === "Green" || colorName === "Bright Green" || colorName === "Dark Green" ? "green" : "gray",
    hex,
    ...(options.manualClassId
      ? {
          manualClassConfidence: 0.8,
          manualClassHex: hex,
          manualClassId: options.manualClassId,
          manualClassRgb: { r: 160, g: 165, b: 169 },
          manualClassTrusted: options.manualClassTrusted ?? true,
          rawManualClassId: options.rawManualClassId ?? options.manualClassId,
        }
      : {}),
    name: colorName,
    ...(options.manualClassId ? { nameSource: "palette-match" } : {}),
    observedHex: hex,
    observedRgb: { r: 160, g: 165, b: 169 },
    rarityTier: "common",
    rgb: { r: 160, g: 165, b: 169 },
    status: "review",
    swatchHex: hex,
  } as DetectedStepCalloutPartItem["detectedColor"]
}
