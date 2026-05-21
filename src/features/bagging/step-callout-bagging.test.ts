import { describe, expect, it } from "vitest"
import {
  stepCalloutDetectorVersion,
  type DetectedStepCallout,
  type DetectedStepCalloutPartImageSignature,
  type DetectedStepCalloutPartItem,
  type StepCalloutDetectionResult,
} from "./step-callout-detection"
import { createStepCalloutBaggingPlan, getStepCalloutBaggingPolicy } from "./step-callout-bagging"

describe("step callout bagging heuristics", () => {
  it("uses inventory size when available to pick the set-size policy", () => {
    const policy = getStepCalloutBaggingPolicy({
      detectedPartCount: 40,
      detectedStepCount: 8,
      inventoryPartCount: 1_500,
    })

    expect(policy).toMatchObject({
      maxParts: 140,
      minParts: 90,
      setSizeBand: "large",
      setSizeSource: "inventory",
      targetParts: 115,
    })
  })

  it("groups contiguous callouts into bags without splitting a step", () => {
    const plan = createStepCalloutBaggingPlan(createResult([
      createCallout(1, 1, [20]),
      createCallout(2, 1, [20]),
      createCallout(3, 1, [20]),
      createCallout(4, 2, [20]),
      createCallout(5, 2, [20]),
      createCallout(6, 2, [20]),
    ]), { inventoryPartCount: 480 })

    expect(plan.policy).toMatchObject({
      maxParts: 75,
      minParts: 45,
      setSizeBand: "small",
      targetParts: 60,
    })
    expect(plan.bags).toHaveLength(2)
    expect(plan.bags[0]).toMatchObject({
      partCount: 60,
      stepRange: { end: 3, start: 1 },
    })
    expect(plan.bags[1]).toMatchObject({
      partCount: 60,
      stepRange: { end: 6, start: 4 },
    })
  })

  it("keeps an oversized step intact and marks the bag for review", () => {
    const plan = createStepCalloutBaggingPlan(createResult([
      createCallout(1, 1, [90]),
      createCallout(2, 1, [10]),
    ]), { inventoryPartCount: 400 })

    expect(plan.bags[0]).toMatchObject({
      partCount: 90,
      status: "review",
      stepRange: { end: 1, start: 1 },
    })
    expect(plan.bags[0].reviewReasons).toContain("over 75 part target")
  })

  it("closes a draft bag before exceeding the hard part target even if the current bag is small", () => {
    const plan = createStepCalloutBaggingPlan(createResult([
      createCallout(1, 1, [40]),
      createCallout(2, 1, [40]),
    ]), { inventoryPartCount: 480 })

    expect(plan.bags).toHaveLength(2)
    expect(plan.bags.map((bag) => bag.partCount)).toEqual([40, 40])
    expect(plan.bags.map((bag) => bag.status)).toEqual(["draft", "draft"])
  })

  it("keeps unmatched parts separate instead of collapsing them by detected color", () => {
    const plan = createStepCalloutBaggingPlan(createResult([
      createCallout(1, 1, [2], "step-local-image:g1:m1"),
      createCallout(2, 1, [3], "step-local-image:g1:m9"),
    ]), { inventoryPartCount: 200 })

    expect(plan.bags).toHaveLength(1)
    expect(plan.bags[0].partGroups).toHaveLength(2)
    expect(plan.bags[0].partGroups.map((group) => group.matchStatus)).toEqual(["unmatched", "unmatched"])
    expect(plan.bags[0].partGroups.map((group) => group.quantity)).toEqual([2, 3])
  })

  it("aggregates unmatched parts by local image group and color", () => {
    const plan = createStepCalloutBaggingPlan(createResult([
      createCallout(1, 1, [2], "step-local-image:g1:m1", "Green", "#237823"),
      createCallout(2, 1, [3], "step-local-image:g1:m1", "Green", "#2a842a"),
    ]), { inventoryPartCount: 200 })

    expect(plan.bags).toHaveLength(1)
    expect(plan.bags[0].partGroups).toHaveLength(1)
    expect(plan.bags[0].partGroups[0]).toMatchObject({
      colorName: "Green",
      itemCount: 2,
      matchStatus: "unmatched",
      partNumber: null,
      quantity: 5,
      quantityIsEstimated: false,
      rowId: null,
      stepIndexes: [1, 2],
    })
  })

  it("keeps same local image groups separate when color differs", () => {
    const plan = createStepCalloutBaggingPlan(createResult([
      createCallout(1, 1, [2], "step-local-image:g1:m1", "Green", "#237823"),
      createCallout(2, 1, [3], "step-local-image:g1:m1", "Dark Green", "#184632"),
    ]), { inventoryPartCount: 200 })

    expect(plan.bags[0].partGroups).toHaveLength(2)
    expect(plan.bags[0].partGroups.map((group) => group.colorName)).toEqual(["Dark Green", "Green"])
    expect(plan.bags[0].partGroups.map((group) => group.quantity)).toEqual([3, 2])
  })

  it("aggregates unmatched parts by image signature and color when local grouping is missing", () => {
    const plan = createStepCalloutBaggingPlan(createResult([
      createCallout(1, 1, [2], undefined, "Green", "#237823", undefined, "plate"),
      createCallout(2, 1, [3], undefined, "Green", "#2a842a", undefined, "plate"),
    ]), { inventoryPartCount: 200 })

    expect(plan.bags[0].partGroups).toHaveLength(1)
    expect(plan.bags[0].partGroups[0]).toMatchObject({
      itemCount: 2,
      matchStatus: "unmatched",
      quantity: 5,
      stepIndexes: [1, 2],
    })
  })

  it("does not aggregate legacy image signatures without outline and size evidence", () => {
    const plan = createStepCalloutBaggingPlan(createResult([
      createCallout(1, 1, [2], undefined, "Green", "#237823", undefined, "legacyPlate"),
      createCallout(2, 1, [3], undefined, "Green", "#2a842a", undefined, "legacyPlate"),
    ]), { inventoryPartCount: 200 })

    expect(plan.bags[0].partGroups).toHaveLength(2)
    expect(plan.bags[0].partGroups.map((group) => group.quantity)).toEqual([2, 3])
  })

  it("does not override local image separation inside one step window", () => {
    const plan = createStepCalloutBaggingPlan(createResult([
      createCallout(1, 1, [2], "step-local-image:g1:m1", "Green", "#237823", undefined, "plate"),
      createCallout(2, 1, [3], "step-local-image:g1:m2", "Green", "#2a842a", undefined, "plate"),
    ]), { inventoryPartCount: 200 })

    expect(plan.bags[0].partGroups).toHaveLength(2)
    expect(plan.bags[0].partGroups.map((group) => group.quantity)).toEqual([2, 3])
  })

  it("does not aggregate image signatures from the same step", () => {
    const plan = createStepCalloutBaggingPlan(createResult([
      createCallout(1, 1, [2, 3], undefined, "Green", "#237823", undefined, "plate"),
    ]), { inventoryPartCount: 200 })

    expect(plan.bags[0].partGroups).toHaveLength(2)
    expect(plan.bags[0].partGroups.map((group) => group.quantity)).toEqual([2, 3])
  })

  it("keeps different unmatched image signatures separate", () => {
    const plan = createStepCalloutBaggingPlan(createResult([
      createCallout(1, 1, [2], undefined, "Green", "#237823", undefined, "plate"),
      createCallout(2, 1, [3], undefined, "Green", "#237823", undefined, "brick"),
    ]), { inventoryPartCount: 200 })

    expect(plan.bags[0].partGroups).toHaveLength(2)
    expect(plan.bags[0].partGroups.map((group) => group.quantity)).toEqual([2, 3])
  })

  it("ignores BOM row matches without local visual evidence", () => {
    const plan = createStepCalloutBaggingPlan(createResult([
      createCallout(1, 1, [2], "step-local-image:g1:m1", "Green", "#237823", "row-green-plate"),
      createCallout(2, 1, [3], "step-local-image:g1:m9", "Green", "#2a842a", "row-green-plate"),
    ]), { inventoryPartCount: 200 })

    expect(plan.bags).toHaveLength(1)
    expect(plan.bags[0].partGroups).toHaveLength(2)
    expect(plan.bags[0].partGroups.map((group) => group.matchStatus)).toEqual(["unmatched", "unmatched"])
    expect(plan.bags[0].partGroups.map((group) => group.rowId)).toEqual([null, null])
    expect(plan.bags[0].partGroups.map((group) => group.quantity)).toEqual([2, 3])
  })

  it("aggregates visually matching rows without exposing BOM identity", () => {
    const plan = createStepCalloutBaggingPlan(createResult([
      createCallout(1, 1, [2], undefined, "Green", "#237823", "row-green-plate", "plate"),
      createCallout(2, 1, [3], undefined, "Green", "#2a842a", "row-green-plate", "plate"),
    ]), { inventoryPartCount: 200 })

    expect(plan.bags[0].partGroups).toHaveLength(1)
    expect(plan.bags[0].partGroups[0]).toMatchObject({
      itemCount: 2,
      matchStatus: "unmatched",
      partNumber: null,
      quantity: 5,
      rowId: null,
      stepIndexes: [1, 2],
    })
  })

  it("aggregates visually matching rows even when stale BOM data is present", () => {
    const plan = createStepCalloutBaggingPlan(createResult([
      createCallout(1, 1, [2], undefined, "Green", "#237823", undefined, "plate"),
      createCallout(2, 1, [3], undefined, "Green", "#237823", "row-green-plate", "plate"),
    ]), { inventoryPartCount: 200 })

    expect(plan.bags[0].partGroups).toHaveLength(1)
    expect(plan.bags[0].partGroups[0]).toMatchObject({
      itemCount: 2,
      matchStatus: "unmatched",
      partNumber: null,
      quantity: 5,
      rowId: null,
      stepIndexes: [1, 2],
    })
  })

  it("keeps visually matching rows local when stale BOM assignments conflict", () => {
    const plan = createStepCalloutBaggingPlan(createResult([
      createCallout(1, 1, [2], undefined, "Green", "#237823", "row-green-plate", "plate"),
      createCallout(2, 1, [3], undefined, "Green", "#237823", "row-green-brick", "plate"),
    ]), { inventoryPartCount: 200 })

    expect(plan.bags[0].partGroups).toHaveLength(1)
    expect(plan.bags[0].partGroups[0]).toMatchObject({
      itemCount: 2,
      matchStatus: "unmatched",
      partNumber: null,
      quantity: 5,
      rowId: null,
      stepIndexes: [1, 2],
    })
  })

  it("does not merge unmatched same-color items when sampled hex differs", () => {
    const plan = createStepCalloutBaggingPlan(createResult([
      createCallout(1, 1, [2], undefined, "Green", "#237823"),
      createCallout(2, 1, [3], undefined, "Green", "#2a842a"),
    ]), { inventoryPartCount: 200 })

    expect(plan.bags[0].partGroups).toHaveLength(2)
    expect(plan.bags[0].partGroups.map((group) => group.colorName)).toEqual(["Green", "Green"])
    expect(plan.bags[0].partGroups.map((group) => group.quantity)).toEqual([2, 3])
  })

  it("sorts bag part groups by detected color", () => {
    const plan = createStepCalloutBaggingPlan(createResult([
      createCallout(1, 1, [1], undefined, "Blue"),
      createCallout(2, 1, [1], undefined, "Black"),
      createCallout(3, 1, [1], undefined, "Green"),
    ]), { inventoryPartCount: 200 })

    expect(plan.bags[0].partGroups.map((group) => group.colorName)).toEqual([
      "Black",
      "Green",
      "Blue",
    ])
  })
})

function createResult(callouts: readonly DetectedStepCallout[]): StepCalloutDetectionResult {
  return {
    callouts: [...callouts],
    detectorVersion: stepCalloutDetectorVersion,
    pageCount: 2,
    pageLimit: null,
    scannedPageNumbers: [1, 2],
    skippedBomPageNumbers: [],
    status: callouts.length > 0 ? "detected" : "empty",
  } as StepCalloutDetectionResult
}

function createCallout(
  stepIndex: number,
  pageNumber: number,
  quantities: readonly number[],
  groupId?: string,
  colorName = "Green",
  colorHex = "#237823",
  bomRowId?: string,
  signatureKind?: "brick" | "legacyPlate" | "plate",
): DetectedStepCallout {
  return {
    confidence: 0.84,
    crop: {
      dataUrl: `data:image/png;base64,callout-${stepIndex}`,
      height: 140,
      width: 200,
    },
    id: `step-callout:p${pageNumber}:s${stepIndex}`,
    indexOnPage: stepIndex,
    pageNumber,
    partItems: quantities.map((quantity, index) =>
      createPartItem(stepIndex, index + 1, quantity, groupId, colorName, colorHex, bomRowId, signatureKind),
    ),
    sourceImage: {
      height: 900,
      unit: "step_pixel",
      width: 700,
    },
    sourceRegion: {
      height: 140,
      unit: "step_pixel",
      width: 200,
      x: 10,
      y: 20,
    },
    stepIndex,
  }
}

function createPartItem(
  stepIndex: number,
  index: number,
  quantity: number,
  groupId?: string,
  colorName = "Green",
  colorHex = "#237823",
  bomRowId?: string,
  signatureKind?: "brick" | "legacyPlate" | "plate",
): DetectedStepCalloutPartItem {
  return {
    bomImageMatch: bomRowId
      ? {
          cataloguePartNumber: "3005",
          colorId: "6",
          colorName,
          colorScore: 0.98,
          confidence: 0.96,
          fallbackPreviewImageUrl: "https://example.test/parts/3005-fallback.png",
          partName: "Brick 1 x 1",
          partNumber: "3005",
          previewImageUrl: "https://example.test/parts/3005.png",
          quantity: 5,
          rowId: bomRowId,
          sourcePage: 12,
          visualScore: 0.94,
        }
      : null,
    confidence: 0.7,
    detectedColor: {
      confidence: 0.82,
      hex: colorHex,
      name: colorName,
      rgb: { b: 35, g: 120, r: 35 },
    },
    id: `step-callout:s${stepIndex}:item${index}`,
    imageSignature: signatureKind ? createImageSignature(signatureKind) : null,
    indexOnCallout: index,
    localImageMatch: groupId
      ? {
          confidence: 0.92,
          groupId,
          groupIndex: 1,
          itemCount: 2,
          stepGroupIndex: 1,
          stepGroupRange: {
            end: 5,
            start: 1,
          },
        }
      : null,
    partCrop: {
      dataUrl: `data:image/png;base64,part-${stepIndex}-${index}`,
      height: 36,
      width: 44,
    },
    partRegion: {
      height: 36,
      unit: "step_pixel",
      width: 44,
      x: 24,
      y: 42,
    },
    quantity: {
      confidence: 0.86,
      text: `${quantity}`,
      value: quantity,
    },
    quantityLabel: {
      crop: {
        dataUrl: `data:image/png;base64,quantity-${stepIndex}-${index}`,
        height: 12,
        width: 26,
      },
      region: {
        height: 12,
        unit: "step_pixel",
        width: 26,
        x: 32,
        y: 86,
      },
    },
    sourceRegion: {
      height: 58,
      unit: "step_pixel",
      width: 44,
      x: 24,
      y: 42,
    },
  }
}

function createImageSignature(kind: "brick" | "legacyPlate" | "plate"): DetectedStepCalloutPartImageSignature {
  if (kind === "legacyPlate") {
    return {
      aspectRatio: 1.46,
      compactness: 0.86,
      coverage: 0.78,
      detailGrid: [
        "1001",
        "0110",
        "0110",
        "1001",
      ].join(""),
      grid: [
        "1111",
        "1111",
        "1111",
        "1111",
      ].join(""),
      surfaceHex: "#237823",
    }
  }

  if (kind === "brick") {
    return {
      aspectRatio: 0.72,
      bottomProfile: "3333",
      boundsHeight: 42,
      boundsWidth: 30,
      compactness: 0.62,
      coverage: 0.66,
      detailGrid: [
        "1100",
        "1100",
        "1100",
        "1100",
      ].join(""),
      edgeGrid: [
        "1100",
        "1000",
        "1000",
        "1100",
      ].join(""),
      grid: [
        "1100",
        "1100",
        "1100",
        "1100",
      ].join(""),
      pixelCount: 90,
      surfaceHex: "#237823",
      topProfile: "0000",
    }
  }

  return {
    aspectRatio: 1.46,
    bottomProfile: "3333",
    boundsHeight: 30,
    boundsWidth: 44,
    compactness: 0.86,
    coverage: 0.78,
    detailGrid: [
      "1001",
      "0110",
      "0110",
      "1001",
    ].join(""),
    edgeGrid: [
      "1111",
      "1001",
      "1001",
      "1111",
    ].join(""),
    grid: [
      "1111",
      "1111",
      "1111",
      "1111",
    ].join(""),
    pixelCount: 140,
    surfaceHex: "#237823",
    topProfile: "0000",
  }
}
