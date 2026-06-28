import { describe, expect, it } from "vitest"
import {
  BAG_CHECKLIST_DEFAULT_SORT,
  createBagChecklistGroups,
  createPartGroupedTableItems,
  partGroupRowKey,
  sortBagRows,
  type BagChecklistPartGroup,
} from "./bag-checklist-table-model"
import type {
  StepCalloutBagRow,
  StepCalloutBaggingPlan,
} from "@/features/bagging/step-callout-bagging"

describe("bag checklist table model", () => {
  it("groups rows by bag plan order", () => {
    const rows = [
      createRow({ bagId: "bag-2", bagLabel: "Bag 2", bagNumber: 2, id: "row-2" }),
      createRow({ bagId: "bag-1", bagLabel: "Bag 1", bagNumber: 1, id: "row-1" }),
    ]

    const groups = createBagChecklistGroups(createPlan(rows), rows, "bag")

    expect(groups.map((group) => ({
      id: group.id,
      rowIds: group.rows.map((row) => row.id),
      title: group.title,
    }))).toEqual([
      { id: "bag-1", rowIds: ["row-1"], title: "Bag 1 · Pages 1-1" },
      { id: "bag-2", rowIds: ["row-2"], title: "Bag 2 · Pages 2-2" },
    ])
  })

  it("groups rows by color with review state for advisory colors", () => {
    const rows = [
      createRow({ colorKey: "red", colorName: "Red", id: "row-1", quantity: 2 }),
      createRow({
        colorKey: "black",
        colorName: "Black",
        colorStatus: "review",
        id: "row-2",
        quantity: 1,
      }),
      createRow({
        colorKey: "red",
        colorName: "Red",
        colorStatus: "review",
        id: "row-3",
        quantity: 3,
      }),
    ]

    const groups = createBagChecklistGroups(createPlan(rows), rows, "color")

    expect(groups.map((group) => ({
      badge: group.badge,
      id: group.id,
      reviewReasons: group.reviewReasons,
      rowIds: group.rows.map((row) => row.id),
      status: group.status,
      title: group.title,
    }))).toEqual([
      {
        badge: "1 part",
        id: "color-black",
        reviewReasons: ["advisory color"],
        rowIds: ["row-2"],
        status: "review",
        title: "Black",
      },
      {
        badge: "5 parts",
        id: "color-red",
        reviewReasons: [],
        rowIds: ["row-1", "row-3"],
        status: "draft",
        title: "Red",
      },
    ])
  })

  it("keeps row sorting stable when compared values match", () => {
    const rows = [
      createRow({ id: "row-1", quantity: 2 }),
      createRow({ id: "row-2", quantity: 2 }),
      createRow({ id: "row-3", quantity: 1 }),
    ]

    expect(sortBagRows(rows, null, { column: "quantity", direction: "asc" })
      .map((row) => row.id)).toEqual(["row-3", "row-1", "row-2"])
  })

  it("sorts checked rows when checked sort is active", () => {
    const rows = [
      createRow({ id: "row-1" }),
      createRow({ id: "row-2" }),
      createRow({ id: "row-3" }),
    ]

    expect(sortBagRows(rows, new Set(["row-2"]), {
      column: "checked",
      direction: "desc",
    }).map((row) => row.id)).toEqual(["row-2", "row-1", "row-3"])
  })

  it("adds expanded part group header and nested rows", () => {
    const rows = [
      createRow({ id: "row-1" }),
      createRow({ id: "row-2" }),
      createRow({ id: "row-3" }),
    ]
    const partGroups = [createPartGroup("group-1", rows.slice(0, 2))]

    const items = createPartGroupedTableItems(
      rows,
      partGroups,
      BAG_CHECKLIST_DEFAULT_SORT,
      null,
      new Set(["group-1"]),
      new Set(),
      new Set(),
    )

    expect(items.map((item) => item.kind === "part-group"
      ? `group:${item.group.group.groupId}`
      : `row:${item.row.id}:${item.nestedPartGroupId ?? "raw"}`,
    )).toEqual([
      "group:group-1",
      "row:row-1:group-1",
      "row:row-2:group-1",
      "row:row-3:raw",
    ])
  })

  it("falls back to raw rows when a part group is rejected", () => {
    const rows = [
      createRow({ id: "row-1" }),
      createRow({ id: "row-2" }),
    ]

    expect(createPartGroupedTableItems(
      rows,
      [createPartGroup("group-1", rows)],
      BAG_CHECKLIST_DEFAULT_SORT,
      null,
      new Set(["group-1"]),
      new Set(["group-1"]),
      new Set(),
    ).map((item) => item.kind === "row" ? item.row.id : item.group.group.groupId))
      .toEqual(["row-1", "row-2"])
  })

  it("falls back to raw rows when removing a suggested part leaves no group", () => {
    const rows = [
      createRow({ id: "row-1" }),
      createRow({ id: "row-2" }),
    ]

    expect(createPartGroupedTableItems(
      rows,
      [createPartGroup("group-1", rows, "suggested")],
      BAG_CHECKLIST_DEFAULT_SORT,
      null,
      new Set(["group-1"]),
      new Set(),
      new Set([partGroupRowKey("group-1", "row-1")]),
    ).map((item) => item.kind === "row" ? item.row.id : item.group.group.groupId))
      .toEqual(["row-1", "row-2"])
  })
})

function createPartGroup(
  groupId: string,
  rows: StepCalloutBagRow[],
  lane: BagChecklistPartGroup["lane"] = "auto",
): BagChecklistPartGroup {
  return {
    group: {
      bagId: rows[0]?.bagId ?? "bag-1",
      confidence: 0.92,
      groupId,
      matchKind: "exact-digest",
      reasons: [],
      rowIds: rows.map((row) => row.id),
    },
    lane,
    rows,
  }
}

function createPlan(rows: StepCalloutBagRow[]): StepCalloutBaggingPlan {
  return {
    bags: [
      createPlanBag("bag-1", "Bag 1", 1, rows.filter((row) => row.bagId === "bag-1").length),
      createPlanBag("bag-2", "Bag 2", 2, rows.filter((row) => row.bagId === "bag-2").length),
    ],
    detectedPartCount: rows.length,
    detectedStepCount: rows.length,
    heuristicVersion: "step-callout-bagging-v6",
    policy: {
      band: "small",
      maxParts: 100,
      maxTargetSteps: 10,
      minParts: 1,
      overfillToleranceParts: 0,
      source: "detected-callout-quantity",
      targetParts: 50,
      targetSteps: 5,
      tinyBagThreshold: 1,
    },
    rawPartRowCount: rows.length,
    setPieceCount: rows.length,
  }
}

function createPlanBag(
  id: string,
  label: string,
  number: number,
  partCount: number,
): StepCalloutBaggingPlan["bags"][number] {
  return {
    callouts: [],
    id,
    label,
    number,
    pageRange: {
      end: number,
      label: `Pages ${number}-${number}`,
      pages: [number],
      start: number,
    },
    partCount,
    reviewReasons: [],
    status: "draft",
    stepRange: {
      end: number,
      start: number,
    },
    unknownQuantityCount: 0,
  }
}

function createRow({
  bagId = "bag-1",
  bagLabel = "Bag 1",
  bagNumber = 1,
  colorKey = "gray",
  colorName = "Gray",
  colorStatus = "exact",
  id,
  quantity = 1,
}: {
  bagId?: string
  bagLabel?: string
  bagNumber?: number
  colorKey?: string
  colorName?: string
  colorStatus?: StepCalloutBagRow["color"]["status"]
  id: string
  quantity?: number
}): StepCalloutBagRow {
  const rowNumber = Number(id.replace(/\D+/g, "")) || 1
  const region = {
    height: 10,
    width: 10,
    x: rowNumber,
    y: rowNumber,
  }

  return {
    anchor: {
      calloutRegion: region,
      itemIndexOnCallout: rowNumber,
      manualFingerprint: "manual",
      pageNumber: bagNumber,
      pageRenderHeight: 100,
      pageRenderWidth: 100,
      partRegion: region,
    },
    bagId,
    bagLabel,
    bagNumber,
    bagPageLabel: `Pages ${bagNumber}-${bagNumber}`,
    calloutBackgroundHex: "#ffffff",
    calloutCrop: null,
    calloutId: `callout-${rowNumber}`,
    calloutIndexOnPage: 0,
    color: {
      confidence: 1,
      family: colorKey,
      key: colorKey,
      manualClassId: null,
      manualClassTrusted: false,
      name: colorName,
      status: colorStatus,
      swatchHex: "#6C6E68",
    },
    id,
    itemId: `item-${id}`,
    itemIndexOnCallout: rowNumber,
    pagePreview: null,
    partCrop: null,
    partImageAlphaMask: null,
    quantity,
    quantityEstimated: false,
    quantityLabelCrop: null,
    quantityText: String(quantity),
    sourcePageNumber: bagNumber,
    stepIndex: bagNumber,
  }
}
