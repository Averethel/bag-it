import { waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type {
  PreviewHydrationState,
  PreviewPageInputCacheEntry,
} from "./bagging-app-types"
import {
  createRuntimePreviewTaskController,
  type RuntimePreviewTaskControllerOptions,
} from "./runtime-preview-task-controller"
import {
  createPagePreviewKey,
  createPreviewAssetStore,
  type PagePreviewAsset,
  type PartMaskPreviewAsset,
} from "@/features/steps/preview-assets"
import type {
  DetectedStepCalloutPartItem,
  StepCalloutDetectionResult,
  StepSourceRegion,
} from "@/features/steps/step-detection-contracts"

describe("runtime preview task controller", () => {
  it("starts preview generation with critical pages before warm pages", async () => {
    const harness = createControllerHarness()
    const result = createDetectionResult({
      callouts: [createCallout(2, [createPartItem("part-1")])],
      pageNumbers: [1, 2],
    })

    harness.controller.startPreviewGeneration(
      createFile(),
      result,
      new AbortController(),
      1,
    )

    await waitFor(() => expect(harness.store.readReadyPageAssets()).toHaveLength(2))
    await waitFor(() => expect(harness.store.readReadyPartMaskAssets()).toHaveLength(1))
    expect(harness.pagePreviewCalls).toEqual([2, 1])
    expect(harness.partMaskCalls).toEqual(["2:part-1"])
  })

  it("uses cached page input before calling the page preview creator", async () => {
    const createCachedPagePreviewAsset = vi.fn(async (
      entry: PreviewPageInputCacheEntry,
    ) => fakePageAsset(entry.pageInput.pageNumber))
    const harness = createControllerHarness({ createCachedPagePreviewAsset })

    harness.controller.cachePreviewPageInput(createPreviewPageInputCacheEntry(1))
    harness.controller.startPreviewGeneration(
      createFile(),
      createDetectionResult({ pageNumbers: [1] }),
      new AbortController(),
      1,
      { preserveRuntimePreviews: true },
    )

    await waitFor(() => expect(harness.store.readReadyPageAssets()).toHaveLength(1))
    expect(createCachedPagePreviewAsset).toHaveBeenCalledTimes(1)
    expect(harness.pagePreviewCalls).toEqual([])
  })

  it("enqueues a priority page and its part masks after a deferred start", async () => {
    const harness = createControllerHarness()
    const result = createDetectionResult({
      callouts: [createCallout(2, [createPartItem("part-2")])],
      pageNumbers: [1, 2],
    })

    harness.controller.startPreviewGeneration(
      createFile(),
      result,
      new AbortController(),
      1,
      { deferPageEnqueue: true },
    )
    harness.controller.handleBuildStepPagePriorityChange(2, true, {
      partColorCalibrationVersion: "color-v1",
      partExtractorVersion: "parts-v1",
      stepDetectionState: { status: "ready", result },
    })

    await waitFor(() => expect(harness.pagePreviewCalls).toEqual([2]))
    await waitFor(() => expect(harness.store.readReadyPartMaskAssets()).toHaveLength(1))
    expect(harness.pagePreviewCalls).toEqual([2])
  })

  it("cancels the active scheduler before warm pages are enqueued", async () => {
    const harness = createControllerHarness()

    harness.controller.startPreviewGeneration(
      createFile(),
      createDetectionResult({ pageNumbers: [1] }),
      new AbortController(),
      1,
      { deferPageEnqueue: true },
    )
    harness.controller.cancelRuntimePreviewScheduler()
    harness.controller.enqueueWarmPreviewPages([1])
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0)
    })
    expect(harness.pagePreviewCalls).toEqual([])
  })

  it("ignores preview errors from stale jobs", async () => {
    const harness = createControllerHarness({
      createPagePreviewAsset: vi.fn(async () => {
        throw new Error("stale page failure")
      }),
      isCurrentJob: () => false,
    })

    harness.controller.startPreviewGeneration(
      createFile(),
      createDetectionResult({ pageNumbers: [1] }),
      new AbortController(),
      1,
    )

    await waitFor(() =>
      expect(harness.store.getSnapshot(createPagePreviewKey(1)).status).toBe("failed"),
    )
    expect(harness.notices).toEqual([])
    expect(harness.hydrationStates.some((state) => state.status === "failed")).toBe(false)
  })
})

function createControllerHarness({
  createCachedPagePreviewAsset,
  createCachedPartMaskPreviewAsset,
  createPagePreviewAsset,
  createPartMaskPreviewAsset,
  isCurrentJob = () => true,
}: Partial<Pick<
  RuntimePreviewTaskControllerOptions,
  | "createCachedPagePreviewAsset"
  | "createCachedPartMaskPreviewAsset"
  | "createPagePreviewAsset"
  | "createPartMaskPreviewAsset"
  | "isCurrentJob"
>> = {}) {
  const store = createPreviewAssetStore()
  const hydration = createHydrationRecorder()
  const notices: Array<string | null> = []
  const pagePreviewCalls: number[] = []
  const partMaskCalls: string[] = []
  const pagePreviewCreator: RuntimePreviewTaskControllerOptions["createPagePreviewAsset"] =
    createPagePreviewAsset ?? (async (_file, _result, pageNumber) => {
      pagePreviewCalls.push(pageNumber)
      return fakePageAsset(pageNumber)
    })
  const partMaskPreviewCreator: RuntimePreviewTaskControllerOptions["createPartMaskPreviewAsset"] =
    createPartMaskPreviewAsset ?? (async (pageAsset, partItem) => {
      partMaskCalls.push(`${pageAsset.pageNumber}:${partItem.id}`)
      return fakePartMaskAsset(partItem.id)
    })

  return {
    controller: createRuntimePreviewTaskController({
      createCachedPagePreviewAsset,
      createCachedPartMaskPreviewAsset,
      createPagePreviewAsset: pagePreviewCreator,
      createPartMaskPreviewAsset: partMaskPreviewCreator,
      isCurrentJob,
      previewAssetStore: store,
      setNotice: (notice) => {
        notices.push(notice)
      },
      setPreviewHydrationState: hydration.setState,
    }),
    hydrationStates: hydration.states,
    notices,
    pagePreviewCalls,
    partMaskCalls,
    store,
  }
}

function createHydrationRecorder(): {
  setState: RuntimePreviewTaskControllerOptions["setPreviewHydrationState"]
  states: PreviewHydrationState[]
} {
  let current: PreviewHydrationState = { status: "idle" }
  const states: PreviewHydrationState[] = []

  return {
    setState: (update) => {
      current = typeof update === "function" ? update(current) : update
      states.push(current)
    },
    states,
  }
}

function createDetectionResult({
  callouts = [],
  pageNumbers,
}: {
  callouts?: StepCalloutDetectionResult["callouts"]
  pageNumbers: number[]
}): StepCalloutDetectionResult {
  return {
    callouts,
    detectorVersion: "detector-v1",
    pageAttentionItems: [],
    pageCount: pageNumbers.length,
    pageLimit: null,
    pagePreviews: pageNumbers.map((pageNumber) => ({
      height: 1,
      pageNumber,
      width: 1,
    })),
    partColorCalibrationVersion: "color-v1",
    partExtractorVersion: "parts-v1",
    qualitySummary: {
      firstBuildStepPageNumber: null,
      inferredCalloutBackgrounds: [],
    },
    scannedPageNumbers: pageNumbers,
    skippedPageNumbers: [],
    status: callouts.length > 0 ? "detected" : "empty",
  }
}

function createCallout(
  pageNumber: number,
  partItems: DetectedStepCalloutPartItem[],
): StepCalloutDetectionResult["callouts"][number] {
  return {
    confidence: 1,
    crop: { region: createRegion() },
    id: `callout-${pageNumber}`,
    indexOnPage: 0,
    inferredBackground: {
      confidence: 1,
      hex: "#ffffff",
      rgb: { b: 255, g: 255, r: 255 },
    },
    pageNumber,
    partItems,
    sourceRegion: createRegion(),
    stepIndex: pageNumber,
  }
}

function createPartItem(id: string): DetectedStepCalloutPartItem {
  return {
    confidence: 1,
    id,
    indexOnCallout: 0,
    partImage: {
      alphaMask: {
        data: new Uint8ClampedArray([255]),
        height: 1,
        width: 1,
      },
      region: createRegion(),
    },
    partRegion: createRegion(),
    quantity: {
      confidence: 1,
      text: "1",
      value: 1,
    },
    quantityLabel: {
      region: createRegion(),
    },
    sourceRegion: createRegion(),
  }
}

function createPreviewPageInputCacheEntry(pageNumber: number): PreviewPageInputCacheEntry {
  return {
    baseBounds: {
      height: 100,
      width: 100,
    } as PreviewPageInputCacheEntry["baseBounds"],
    pageInput: {
      pageNumber,
    } as PreviewPageInputCacheEntry["pageInput"],
  }
}

function fakePageAsset(pageNumber: number): PagePreviewAsset {
  return {
    baseHeight: 140,
    baseWidth: 100,
    naturalHeight: 2240,
    naturalWidth: 1600,
    pageNumber,
    url: `data:image/gif;base64,${pageNumber}`,
  }
}

function fakePartMaskAsset(partItemId: string): PartMaskPreviewAsset {
  return {
    height: 1,
    partItemId,
    url: `data:image/png;base64,${partItemId}`,
    width: 1,
  }
}

function createRegion(): StepSourceRegion {
  return {
    height: 10,
    width: 10,
    x: 0,
    y: 0,
  }
}

function createFile(): File {
  return new File(["%PDF-1.7"], "manual.pdf", { type: "application/pdf" })
}
