import {
  createPagePreviewKey,
  createPartMaskPreviewKey,
  type PagePreviewAsset,
  type PartMaskPreviewAsset,
  type PreviewAssetStore,
} from "./preview-assets"
import type { DetectedStepCalloutPartItem } from "./step-detection-contracts"

export type PreviewGenerationProgress = {
  activePage: number | null
  hydratedMaskCount: number
  hydratedPreviewPageCount: number
  message: string
  percentage: number
  phase: "preview-hydration"
  targetMaskCount: number
  targetPreviewPageCount: number
}

export type PreviewMaskRequest = {
  pageNumber: number
  partItem: DetectedStepCalloutPartItem
}

export type PreviewSchedulerOptions = {
  createPageAsset: (pageNumber: number, signal: AbortSignal | undefined) => Promise<PagePreviewAsset>
  createPartMaskAsset?: (
    pageAsset: PagePreviewAsset,
    partItem: DetectedStepCalloutPartItem,
    signal: AbortSignal | undefined,
  ) => Promise<PartMaskPreviewAsset | null>
  deferMaskTasksUntilPagesReady?: boolean
  maxConcurrentMaskTasks?: number
  maxConcurrentPageTasks?: number
  onError?: (error: unknown) => void
  onPageAssetReady?: (pageNumber: number) => void
  onProgress?: (progress: PreviewGenerationProgress) => void
  pageNumbers: readonly number[]
  signal?: AbortSignal
  store: PreviewAssetStore
}

export function createPreviewScheduler(options: PreviewSchedulerOptions): PreviewScheduler {
  return new PreviewScheduler(options)
}

export class PreviewScheduler {
  private readonly allPageNumbers: number[]
  private readonly criticalPageQueue: number[] = []
  private readonly warmPageQueue: number[] = []
  private readonly queuedCriticalPageNumbers = new Set<number>()
  private readonly queuedWarmPageNumbers = new Set<number>()
  private readonly maskQueue: PreviewMaskRequest[] = []
  private readonly queuedMaskIds = new Set<string>()
  private readonly requestedMaskIds = new Set<string>()
  private readonly maxConcurrentMaskTasks: number
  private readonly maxConcurrentPageTasks: number
  private activeMaskTaskCount = 0
  private activePageTaskCount = 0
  private isCancelled = false

  constructor(private readonly options: PreviewSchedulerOptions) {
    this.allPageNumbers = [...new Set(options.pageNumbers)].sort((left, right) => left - right)
    this.maxConcurrentPageTasks = normalizeConcurrency(options.maxConcurrentPageTasks, 2)
    this.maxConcurrentMaskTasks = normalizeConcurrency(
      options.maxConcurrentMaskTasks,
      resolveDefaultMaskConcurrency(),
    )
    this.publishProgress(null)
  }

  cancel(): void {
    this.isCancelled = true
    this.criticalPageQueue.length = 0
    this.warmPageQueue.length = 0
    this.maskQueue.length = 0
    this.queuedCriticalPageNumbers.clear()
    this.queuedWarmPageNumbers.clear()
    this.queuedMaskIds.clear()
    this.requestedMaskIds.clear()
  }

  enqueueCriticalPages(pageNumbers: readonly number[]): void {
    this.enqueuePages(pageNumbers, this.criticalPageQueue, this.queuedCriticalPageNumbers)
    this.startPagePump()
  }

  enqueueWarmPages(pageNumbers: readonly number[]): void {
    this.enqueuePages(pageNumbers, this.warmPageQueue, this.queuedWarmPageNumbers)
    this.startPagePump()
  }

  enqueuePartMasks(requests: readonly PreviewMaskRequest[]): void {
    for (const request of requests) {
      if (this.isCancelled || !this.options.createPartMaskAsset) {
        return
      }

      if (this.options.store.getSnapshot(createPartMaskPreviewKey(request.partItem.id)).status === "ready") {
        continue
      }

      if (this.queuedMaskIds.has(request.partItem.id)) {
        continue
      }

      this.queuedMaskIds.add(request.partItem.id)
      this.requestedMaskIds.add(request.partItem.id)
      this.maskQueue.push(request)
      this.options.store.setPending(createPartMaskPreviewKey(request.partItem.id))
    }

    this.publishProgress(null)
    this.startMaskPump()
  }

  private enqueuePages(
    pageNumbers: readonly number[],
    queue: number[],
    queuedPageNumbers: Set<number>,
  ): void {
    for (const pageNumber of pageNumbers) {
      if (this.isCancelled || !this.allPageNumbers.includes(pageNumber)) {
        continue
      }

      if (this.options.store.getSnapshot(createPagePreviewKey(pageNumber)).status === "ready") {
        continue
      }

      if (this.queuedCriticalPageNumbers.has(pageNumber) || this.queuedWarmPageNumbers.has(pageNumber)) {
        continue
      }

      queuedPageNumbers.add(pageNumber)
      queue.push(pageNumber)
      this.options.store.setPending(createPagePreviewKey(pageNumber))
    }

    this.publishProgress(null)
  }

  private startPagePump(): void {
    while (
      !this.isCancelled &&
      !this.options.signal?.aborted &&
      this.activePageTaskCount < this.maxConcurrentPageTasks
    ) {
      const pageNumber = this.nextPageNumber()

      if (!pageNumber) {
        break
      }

      if (this.options.store.getSnapshot(createPagePreviewKey(pageNumber)).status === "ready") {
        continue
      }

      this.activePageTaskCount += 1
      void this.runPageTask(pageNumber).finally(() => {
        this.activePageTaskCount = Math.max(0, this.activePageTaskCount - 1)
        this.publishProgress(null)
        this.startPagePump()
      })
    }
  }

  private async runPageTask(pageNumber: number): Promise<void> {
    this.publishProgress(pageNumber)

    try {
      const asset = await this.options.createPageAsset(pageNumber, this.options.signal)

      if (this.isCancelled || this.options.signal?.aborted) {
        revokeUnstoredAsset(asset)
        return
      }

      this.options.store.setPageAsset(pageNumber, asset)
      this.options.onPageAssetReady?.(pageNumber)
      this.startMaskPump()
    } catch (error) {
      if (this.isCancelled || this.options.signal?.aborted) {
        return
      }

      this.options.store.setFailed(createPagePreviewKey(pageNumber), formatError(error))
      this.options.onError?.(error)
    }

    this.publishProgress(pageNumber)
    await yieldToBrowser()
  }

  private startMaskPump(): void {
    if (!this.options.createPartMaskAsset) {
      return
    }

    if (this.options.deferMaskTasksUntilPagesReady && !this.areAllPagesReady()) {
      return
    }

    let inspectedRequestCount = 0
    const initialQueueLength = this.maskQueue.length

    while (
      !this.isCancelled &&
      !this.options.signal?.aborted &&
      this.activeMaskTaskCount < this.maxConcurrentMaskTasks &&
      inspectedRequestCount < initialQueueLength
    ) {
      const request = this.maskQueue.shift()

      if (!request) {
        break
      }

      inspectedRequestCount += 1
      this.queuedMaskIds.delete(request.partItem.id)

      if (this.options.store.getSnapshot(createPartMaskPreviewKey(request.partItem.id)).status === "ready") {
        continue
      }

      const pageState = this.options.store.getSnapshot(createPagePreviewKey(request.pageNumber))

      if (pageState.status !== "ready") {
        this.requeuePartMask(request)
        continue
      }

      this.activeMaskTaskCount += 1
      void this.runMaskTask(request, pageState.asset as PagePreviewAsset).finally(() => {
        this.activeMaskTaskCount = Math.max(0, this.activeMaskTaskCount - 1)
        this.publishProgress(null)
        this.startMaskPump()
      })
    }
  }

  private async runMaskTask(
    request: PreviewMaskRequest,
    pageAsset: PagePreviewAsset,
  ): Promise<void> {
    if (!this.options.createPartMaskAsset) {
      return
    }

    try {
      const asset = await this.options.createPartMaskAsset(
        pageAsset,
        request.partItem,
        this.options.signal,
      )

      if (this.isCancelled || this.options.signal?.aborted) {
        if (asset) {
          revokeUnstoredAsset(asset)
        }
        return
      }

      if (asset) {
        this.options.store.setPartMaskAsset(request.partItem.id, asset)
      }
    } catch (error) {
      if (this.isCancelled || this.options.signal?.aborted) {
        return
      }

      this.options.store.setFailed(createPartMaskPreviewKey(request.partItem.id), formatError(error))
      this.options.onError?.(error)
    }

    this.publishProgress(request.pageNumber)
    await yieldToBrowser()
  }

  private requeuePartMask(request: PreviewMaskRequest): void {
    if (this.queuedMaskIds.has(request.partItem.id)) {
      return
    }

    this.queuedMaskIds.add(request.partItem.id)
    this.maskQueue.push(request)
  }

  private nextPageNumber(): number | null {
    const criticalPage = this.criticalPageQueue.shift()

    if (criticalPage) {
      this.queuedCriticalPageNumbers.delete(criticalPage)
      return criticalPage
    }

    const warmPage = this.warmPageQueue.shift()

    if (warmPage) {
      this.queuedWarmPageNumbers.delete(warmPage)
      return warmPage
    }

    return null
  }

  private publishProgress(activePage: number | null): void {
    const targetPreviewPageCount = this.allPageNumbers.length
    const hydratedPreviewPageCount = this.allPageNumbers.filter((pageNumber) =>
      this.options.store.getSnapshot(createPagePreviewKey(pageNumber)).status === "ready"
    ).length
    const maskStates = [...this.requestedMaskIds].map((partItemId) =>
      this.options.store.getSnapshot(createPartMaskPreviewKey(partItemId)),
    )
    const targetMaskCount = this.requestedMaskIds.size
    const hydratedMaskCount = maskStates.filter((state) => state.status === "ready").length
    const percentage = targetPreviewPageCount > 0
      ? Math.round((hydratedPreviewPageCount / targetPreviewPageCount) * 100)
      : 100

    this.options.onProgress?.({
      activePage,
      hydratedMaskCount,
      hydratedPreviewPageCount,
      message: activePage
        ? `Generating previews for page ${activePage}.`
        : hydratedPreviewPageCount >= targetPreviewPageCount
          ? "Preview generation complete."
          : "Preparing previews.",
      percentage,
      phase: "preview-hydration",
      targetMaskCount,
      targetPreviewPageCount,
    })
  }

  private areAllPagesReady(): boolean {
    return this.allPageNumbers.every((pageNumber) =>
      this.options.store.getSnapshot(createPagePreviewKey(pageNumber)).status === "ready"
    )
  }
}

function revokeUnstoredAsset(asset: PagePreviewAsset | PartMaskPreviewAsset): void {
  if (asset.url.startsWith("blob:") && typeof URL !== "undefined") {
    URL.revokeObjectURL(asset.url)
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

function normalizeConcurrency(value: number | undefined, fallback: number): number {
  const candidate = value ?? fallback

  if (!Number.isFinite(candidate)) {
    return Math.max(1, Math.floor(fallback))
  }

  return Math.max(1, Math.floor(candidate))
}

function resolveDefaultMaskConcurrency(): number {
  if (typeof navigator === "undefined" || !Number.isFinite(navigator.hardwareConcurrency)) {
    return 2
  }

  return Math.min(4, Math.max(1, Math.floor(navigator.hardwareConcurrency) - 2))
}
