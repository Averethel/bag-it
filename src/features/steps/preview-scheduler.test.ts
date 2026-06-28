import { waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { createPreviewAssetStore, type PagePreviewAsset } from "./preview-assets"
import { createPreviewScheduler } from "./preview-scheduler"
import type { DetectedStepCalloutPartItem } from "./step-detection-contracts"

describe("PreviewScheduler", () => {
  it("runs critical pages before warm backlog and skips duplicates", async () => {
    const store = createPreviewAssetStore()
    const calls: number[] = []
    const scheduler = createPreviewScheduler({
      createPageAsset: async (pageNumber) => {
        calls.push(pageNumber)
        return fakePageAsset(pageNumber)
      },
      maxConcurrentPageTasks: 1,
      pageNumbers: [1, 2, 3, 4, 5],
      store,
    })

    scheduler.enqueueCriticalPages([5, 2])
    scheduler.enqueueWarmPages([1, 2, 3, 4, 5])

    await waitFor(() => expect(calls).toHaveLength(5))
    expect(calls).toEqual([5, 2, 1, 3, 4])
  })

  it("continues the warm queue without additional scroll events", async () => {
    const store = createPreviewAssetStore()
    const onProgress = vi.fn()
    const scheduler = createPreviewScheduler({
      createPageAsset: async (pageNumber) => fakePageAsset(pageNumber),
      maxConcurrentPageTasks: 1,
      onProgress,
      pageNumbers: [1, 2, 3],
      store,
    })

    scheduler.enqueueWarmPages([1, 2, 3])

    await waitFor(() =>
      expect(onProgress).toHaveBeenLastCalledWith(
        expect.objectContaining({
          hydratedPreviewPageCount: 3,
          percentage: 100,
          targetPreviewPageCount: 3,
        }),
      ),
    )
  })

  it("runs page previews with bounded parallelism", async () => {
    const store = createPreviewAssetStore()
    let activeCount = 0
    let maxActiveCount = 0
    const resolvers = new Map<number, () => void>()
    const scheduler = createPreviewScheduler({
      createPageAsset: async (pageNumber) => {
        activeCount += 1
        maxActiveCount = Math.max(maxActiveCount, activeCount)

        await new Promise<void>((resolve) => {
          resolvers.set(pageNumber, resolve)
        })

        activeCount -= 1
        return fakePageAsset(pageNumber)
      },
      maxConcurrentPageTasks: 2,
      pageNumbers: [1, 2, 3],
      store,
    })

    scheduler.enqueueWarmPages([1, 2, 3])

    await waitFor(() => expect(resolvers.size).toBe(2))
    expect(maxActiveCount).toBe(2)
    resolvers.get(1)?.()
    await waitFor(() => expect(resolvers.has(3)).toBe(true))
    resolvers.get(2)?.()
    resolvers.get(3)?.()
    await waitFor(() => expect(store.readReadyPageAssets()).toHaveLength(3))
  })

  it("defers part mask work until page previews are ready when requested", async () => {
    const store = createPreviewAssetStore()
    const createPartMaskAsset = vi.fn(async (_pageAsset: PagePreviewAsset, partItem: DetectedStepCalloutPartItem) => ({
      height: 1,
      partItemId: partItem.id,
      url: `data:image/png;base64,${partItem.id}`,
      width: 1,
    }))
    const scheduler = createPreviewScheduler({
      createPageAsset: async (pageNumber) => fakePageAsset(pageNumber),
      createPartMaskAsset,
      deferMaskTasksUntilPagesReady: true,
      maxConcurrentPageTasks: 1,
      pageNumbers: [1, 2],
      store,
    })

    scheduler.enqueuePartMasks([{ pageNumber: 1, partItem: fakePartItem("part-1") }])
    scheduler.enqueueWarmPages([1])

    await waitFor(() => expect(store.readReadyPageAssets()).toHaveLength(1))
    expect(createPartMaskAsset).not.toHaveBeenCalled()

    scheduler.enqueueWarmPages([2])

    await waitFor(() => expect(createPartMaskAsset).toHaveBeenCalledTimes(1))
  })

  it("runs masks for ready pages without waiting for every page", async () => {
    const store = createPreviewAssetStore()
    let resolvePageTwo!: () => void
    const pageTwoReady = new Promise<void>((resolve) => {
      resolvePageTwo = resolve
    })
    const maskCalls: string[] = []
    const createPartMaskAsset = vi.fn(async (pageAsset: PagePreviewAsset, partItem: DetectedStepCalloutPartItem) => {
      maskCalls.push(`${pageAsset.pageNumber}:${partItem.id}`)
      return fakePartMaskAsset(partItem)
    })
    const scheduler = createPreviewScheduler({
      createPageAsset: async (pageNumber) => {
        if (pageNumber === 2) {
          await pageTwoReady
        }

        return fakePageAsset(pageNumber)
      },
      createPartMaskAsset,
      maxConcurrentMaskTasks: 1,
      maxConcurrentPageTasks: 2,
      pageNumbers: [1, 2],
      store,
    })

    scheduler.enqueuePartMasks([
      { pageNumber: 2, partItem: fakePartItem("part-2") },
      { pageNumber: 1, partItem: fakePartItem("part-1") },
    ])
    scheduler.enqueueWarmPages([1, 2])

    await waitFor(() => expect(maskCalls).toEqual(["1:part-1"]))
    expect(createPartMaskAsset).toHaveBeenCalledTimes(1)

    resolvePageTwo()

    await waitFor(() => expect(maskCalls).toEqual(["1:part-1", "2:part-2"]))
  })
})

function fakePageAsset(pageNumber: number): PagePreviewAsset {
  return {
    baseHeight: 140,
    baseWidth: 100,
    naturalHeight: 2240,
    naturalWidth: 1600,
    pageNumber,
    url: `data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=`,
  }
}

function fakePartItem(id: string): DetectedStepCalloutPartItem {
  return { id } as DetectedStepCalloutPartItem
}

function fakePartMaskAsset(partItem: DetectedStepCalloutPartItem) {
  return {
    height: 1,
    partItemId: partItem.id,
    url: `data:image/png;base64,${partItem.id}`,
    width: 1,
  }
}
