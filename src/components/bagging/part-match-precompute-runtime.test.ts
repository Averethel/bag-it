import { afterEach, describe, expect, it, vi } from "vitest"
import {
  computePartMatchGroupsOffMainThread,
  createPartMaskAssetByItemId,
  createPartMatchGroupsByBag,
  createPartMatchRowInput,
  createPartMatchRowsKey,
  createPartMatchWorkerTransferPayload,
  partMatchPrecomputeErrorMessage,
} from "./part-match-precompute-runtime"
import type {
  PartMatchGroupRunResult,
  PartMatchRowInput,
} from "./part-match-group-progress"
import type { StepCalloutBagRow } from "@/features/bagging/step-callout-bagging"
import type { PartMaskPreviewAsset } from "@/features/steps/preview-assets"

describe("part match precompute runtime", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("creates stable rows keys from row identity and crop dimensions", () => {
    const rows = [
      createRow({ id: "row-1", partHeight: 12, partWidth: 10 }),
      createRow({ bagId: "bag-2", id: "row-2", partHeight: 9, partWidth: 8 }),
    ]

    expect(createPartMatchRowsKey(rows))
      .toBe("row-1:bag-1:callout-1:gray:10x12|row-2:bag-2:callout-2:gray:8x9")
  })

  it("creates matcher row input with rendered pixels from ready mask assets", () => {
    const row = createRow({
      alphaMask: {
        data: new Uint8ClampedArray([0, 255]),
        height: 1,
        width: 2,
      },
      id: "row-1",
    })
    const renderedPixels = {
      data: new Uint8ClampedArray([0, 1, 2, 3]),
      height: 1,
      width: 1,
    }
    const assets = createPartMaskAssetByItemId([
      createPartMaskAsset({ partItemId: row.itemId, renderedPixels }),
    ])

    expect(createPartMatchRowInput(row, assets)).toEqual({
      alphaMask: row.partImageAlphaMask,
      bagId: row.bagId,
      calloutId: row.calloutId,
      color: {
        family: "gray",
        key: "gray",
        manualClassId: null,
        manualClassTrusted: false,
        name: "Gray",
        status: "exact",
      },
      itemId: row.itemId,
      partRegion: row.partCrop?.region,
      renderedPixels,
      rowId: row.id,
    })
  })

  it("maps worker groups back to rows by bag and skips incomplete groups", () => {
    const rows = [
      createRow({ id: "row-1" }),
      createRow({ id: "row-2" }),
      createRow({ bagId: "bag-2", id: "row-3" }),
    ]
    const workerGroups: PartMatchGroupRunResult[] = [
      {
        group: {
          bagId: "bag-1",
          confidence: 0.94,
          groupId: "group-1",
          matchKind: "exact-digest",
          reasons: [],
          rowIds: ["row-1", "row-2"],
        },
        lane: "auto",
      },
      {
        group: {
          bagId: "bag-2",
          confidence: 0.6,
          groupId: "group-2",
          matchKind: "label-gated-near",
          reasons: [],
          rowIds: ["row-3", "missing-row"],
        },
        lane: "suggested",
      },
    ]

    const groupsByBag = createPartMatchGroupsByBag(rows, workerGroups)

    expect(groupsByBag.get("bag-1")).toEqual([
      {
        group: workerGroups[0]?.group,
        lane: "auto",
        rows: rows.slice(0, 2),
      },
    ])
    expect(groupsByBag.has("bag-2")).toBe(false)
  })

  it("clones transferable alpha mask and rendered pixel buffers", () => {
    const row = createPartMatchRowInput(
      createRow({
        alphaMask: {
          data: new Uint8ClampedArray([1, 2, 3, 4]),
          height: 2,
          width: 2,
        },
        id: "row-1",
      }),
      createPartMaskAssetByItemId([
        createPartMaskAsset({
          partItemId: "item-row-1",
          renderedPixels: {
            data: new Uint8ClampedArray([5, 6, 7, 8]),
            height: 1,
            width: 1,
          },
        }),
      ]),
    )

    const payload = createPartMatchWorkerTransferPayload([row])
    const clonedRow = payload.rows[0] as PartMatchRowInput

    expect(clonedRow.alphaMask?.data).toEqual(row.alphaMask?.data)
    expect(clonedRow.alphaMask?.data).not.toBe(row.alphaMask?.data)
    expect(clonedRow.renderedPixels?.data).toEqual(row.renderedPixels?.data)
    expect(clonedRow.renderedPixels?.data).not.toBe(row.renderedPixels?.data)
    expect(payload.transferList).toHaveLength(2)
  })

  it("formats unknown precompute errors", () => {
    expect(partMatchPrecomputeErrorMessage(new Error("Worker failed"))).toBe("Worker failed")
    expect(partMatchPrecomputeErrorMessage("bad")).toBe("Part grouping failed")
  })

  it("terminates sibling bucket workers when one bucket worker fails", async () => {
    vi.spyOn(navigator, "hardwareConcurrency", "get").mockReturnValue(4)
    const workers: FakePartMatchWorker[] = []
    class FakePartMatchWorker {
      onmessage: Worker["onmessage"] = null
      onmessageerror: Worker["onmessageerror"] = null
      onerror: Worker["onerror"] = null
      rows: PartMatchRowInput[] = []
      terminated = false

      constructor() {
        workers.push(this)
      }

      postMessage(message: { rows: PartMatchRowInput[] }): void {
        this.rows = message.rows

        if (message.rows[0]?.bagId !== "bag-1") {
          return
        }

        queueMicrotask(() => {
          if (this.terminated) {
            return
          }

          this.onmessage?.call(this as unknown as Worker, {
            data: {
              errorMessage: "first bucket failed",
              type: "error",
            },
          } as MessageEvent)
        })
      }

      terminate(): void {
        this.terminated = true
      }
    }
    vi.stubGlobal("Worker", FakePartMatchWorker as unknown as typeof Worker)

    const matcherRows = createMatcherRowsForBags([
      "bag-1",
      "bag-1",
      "bag-2",
      "bag-2",
    ])

    await expect(computePartMatchGroupsOffMainThread(matcherRows, vi.fn()))
      .rejects.toThrow("first bucket failed")

    const siblingWorker = workers.find((worker) => worker.rows[0]?.bagId === "bag-2")

    expect(workers).toHaveLength(2)
    expect(siblingWorker?.terminated).toBe(true)
  })
})

function createMatcherRowsForBags(bagIds: readonly string[]): PartMatchRowInput[] {
  const emptyAssets = createPartMaskAssetByItemId([])

  return bagIds.map((bagId, index) => createPartMatchRowInput(
    createRow({
      bagId,
      id: `row-${index + 1}`,
    }),
    emptyAssets,
  ))
}

function createPartMaskAsset({
  partItemId,
  renderedPixels = null,
}: {
  partItemId: string
  renderedPixels?: PartMaskPreviewAsset["renderedPixels"]
}): PartMaskPreviewAsset {
  return {
    height: 20,
    partItemId,
    renderedPixels,
    url: "blob:part-mask",
    width: 20,
  }
}

function createRow({
  alphaMask = null,
  bagId = "bag-1",
  colorKey = "gray",
  colorName = "Gray",
  id,
  partHeight = 12,
  partWidth = 10,
}: {
  alphaMask?: StepCalloutBagRow["partImageAlphaMask"]
  bagId?: string
  colorKey?: string
  colorName?: string
  id: string
  partHeight?: number
  partWidth?: number
}): StepCalloutBagRow {
  const rowNumber = Number(id.replace(/\D+/g, "")) || 1
  const region = {
    height: partHeight,
    width: partWidth,
    x: rowNumber,
    y: rowNumber,
  }

  return {
    anchor: {
      calloutRegion: region,
      itemIndexOnCallout: rowNumber,
      manualFingerprint: "manual",
      pageNumber: rowNumber,
      pageRenderHeight: 100,
      pageRenderWidth: 100,
      partRegion: region,
    },
    bagId,
    bagLabel: bagId === "bag-1" ? "Bag 1" : "Bag 2",
    bagNumber: bagId === "bag-1" ? 1 : 2,
    bagPageLabel: "Pages 1-1",
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
      status: "exact",
      swatchHex: "#6C6E68",
    },
    id,
    itemId: `item-${id}`,
    itemIndexOnCallout: rowNumber,
    pagePreview: null,
    partCrop: {
      region,
    },
    partImageAlphaMask: alphaMask,
    quantity: 1,
    quantityEstimated: false,
    quantityLabelCrop: null,
    quantityText: "1",
    sourcePageNumber: rowNumber,
    stepIndex: rowNumber,
  }
}
