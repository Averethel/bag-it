import { isCurrentPartExtractionResult } from "./bagging-analysis-result"
import {
  type CreatePagePreviewAsset,
  type CreatePartMaskPreviewAsset,
  type PreviewHydrationState,
  type PreviewPageInputCacheEntry,
  type StepDetectionState,
} from "./bagging-app-types"
import {
  RUNTIME_PREVIEW_TARGET_WIDTH,
  createPreviewGenerationProgress,
  readCriticalPreviewPageNumbers,
  readPartMaskRequestsForPages,
  readPreviewGenerationPageNumbers,
  throwIfPreviewAborted,
} from "./bagging-preview-runtime"
import {
  createCachedPagePreviewAsset as createDefaultCachedPagePreviewAsset,
  createCachedPartMaskPreviewAsset as createDefaultCachedPartMaskPreviewAsset,
} from "./detector-client-boundary"
import { normalizePdfIntakeError } from "@/features/pdf/pdf-intake"
import {
  type PreviewAssetStore,
  type PagePreviewAsset,
  type PartMaskPreviewAsset,
} from "@/features/steps/preview-assets"
import {
  createPreviewScheduler,
  type PreviewScheduler,
} from "@/features/steps/preview-scheduler"
import type { StepCalloutDetectionResult } from "@/features/steps/step-detection-contracts"

type PreviewHydrationStateUpdate =
  | PreviewHydrationState
  | ((current: PreviewHydrationState) => PreviewHydrationState)

type CachedPagePreviewAssetFactory = (
  cachedPageInput: PreviewPageInputCacheEntry,
  signal: AbortSignal | undefined,
) => Promise<PagePreviewAsset>

type CachedPartMaskPreviewAssetFactory = (
  cachedPageInput: PreviewPageInputCacheEntry,
  pageAsset: PagePreviewAsset,
  partItem: Parameters<CreatePartMaskPreviewAsset>[1],
  signal: AbortSignal | undefined,
) => Promise<PartMaskPreviewAsset | null>

export type RuntimePreviewTaskController = {
  cachePreviewPageInput: (entry: PreviewPageInputCacheEntry) => void
  cancelRuntimePreviewScheduler: () => void
  clearPreviewResult: () => void
  enqueueWarmPreviewPages: (pageNumbers: readonly number[]) => void
  handleBuildStepPagePriorityChange: (
    pageNumber: number,
    isPriority: boolean,
    context: {
      partColorCalibrationVersion: string
      partExtractorVersion: string
      stepDetectionState: StepDetectionState
    },
  ) => void
  purgeRuntimePreviewAssets: () => void
  startPreviewGeneration: (
    file: File,
    result: StepCalloutDetectionResult,
    controller: AbortController,
    jobId: number,
    options?: { deferPageEnqueue?: boolean; preserveRuntimePreviews?: boolean },
  ) => void
}

export type RuntimePreviewTaskControllerOptions = {
  createCachedPagePreviewAsset?: CachedPagePreviewAssetFactory
  createCachedPartMaskPreviewAsset?: CachedPartMaskPreviewAssetFactory
  createPagePreviewAsset: CreatePagePreviewAsset
  createPartMaskPreviewAsset: CreatePartMaskPreviewAsset
  createScheduler?: typeof createPreviewScheduler
  isCurrentJob: (jobId: number) => boolean
  previewAssetStore: PreviewAssetStore
  setNotice: (notice: string | null) => void
  setPreviewHydrationState: (update: PreviewHydrationStateUpdate) => void
}

export function createRuntimePreviewTaskController({
  createCachedPagePreviewAsset = createDefaultCachedPagePreviewAsset,
  createCachedPartMaskPreviewAsset = createDefaultCachedPartMaskPreviewAsset,
  createPagePreviewAsset,
  createPartMaskPreviewAsset,
  createScheduler = createPreviewScheduler,
  isCurrentJob,
  previewAssetStore,
  setNotice,
  setPreviewHydrationState,
}: RuntimePreviewTaskControllerOptions): RuntimePreviewTaskController {
  let previewScheduler: PreviewScheduler | null = null
  let previewSchedulerPageKey: string | null = null
  const previewPageInputCache = new Map<number, PreviewPageInputCacheEntry>()
  let previewResult: StepCalloutDetectionResult | null = null

  const cancelRuntimePreviewScheduler = () => {
    previewScheduler?.cancel()
    previewScheduler = null
    previewSchedulerPageKey = null
  }

  const purgeRuntimePreviewAssets = () => {
    cancelRuntimePreviewScheduler()
    previewResult = null
    previewPageInputCache.clear()
    previewAssetStore.purge()
  }

  const startPreviewGeneration: RuntimePreviewTaskController["startPreviewGeneration"] = (
    file,
    result,
    controller,
    jobId,
    options = {},
  ) => {
    previewResult = result

    if (!options.preserveRuntimePreviews) {
      cancelRuntimePreviewScheduler()
      previewPageInputCache.clear()
      previewAssetStore.purge()
    }

    const pageNumbers = readPreviewGenerationPageNumbers(result)

    if (pageNumbers.length === 0) {
      setPreviewHydrationState({ status: "ready" })
      return
    }

    let scheduler = previewScheduler
    const schedulerPageKey = createPreviewSchedulerPageKey(pageNumbers)

    if (scheduler && previewSchedulerPageKey !== schedulerPageKey) {
      scheduler.cancel()
      previewScheduler = null
      previewSchedulerPageKey = null
      scheduler = null
    }

    if (!scheduler) {
      scheduler = createScheduler({
        createPageAsset: async (pageNumber, signal) => {
          const cachedPageInput = previewPageInputCache.get(pageNumber)

          if (cachedPageInput) {
            return createCachedPagePreviewAsset(cachedPageInput, signal)
          }

          if (!previewResult) {
            throw new Error(`Page ${pageNumber} input is not ready for preview generation.`)
          }

          return createPagePreviewAsset(file, previewResult, pageNumber, {
            renderMaxWidth: RUNTIME_PREVIEW_TARGET_WIDTH,
            signal,
            targetWidth: RUNTIME_PREVIEW_TARGET_WIDTH,
          })
        },
        createPartMaskAsset: async (pageAsset, partItem, signal) => {
          throwIfPreviewAborted(signal)
          const cachedPageInput = previewPageInputCache.get(pageAsset.pageNumber)
          const asset = cachedPageInput
            ? await createCachedPartMaskPreviewAsset(cachedPageInput, pageAsset, partItem, signal)
            : await createPartMaskPreviewAsset(pageAsset, partItem, signal)

          throwIfPreviewAborted(signal)
          return asset
        },
        onError: (caughtError) => {
          if (!isCurrentJob(jobId)) {
            return
          }
          const previewError = normalizePdfIntakeError(caughtError)
          setNotice("Some step previews are unavailable. Detection results are still usable.")
          setPreviewHydrationState({ status: "failed", error: previewError })
        },
        onPageAssetReady: (pageNumber) => {
          if (!previewResult) {
            return
          }

          scheduler?.enqueuePartMasks(readPartMaskRequestsForPages(previewResult, [pageNumber]))
        },
        onProgress: (progress) => {
          if (!isCurrentJob(jobId)) {
            return
          }
          const previewPagesReady =
            progress.hydratedPreviewPageCount >= progress.targetPreviewPageCount

          setPreviewHydrationState((current) => {
            if (previewPagesReady && current.status === "ready") {
              return current
            }

            return previewPagesReady
              ? { status: "ready" }
              : { status: "background", progress }
          })
        },
        pageNumbers,
        signal: controller.signal,
        store: previewAssetStore,
      })

      previewScheduler = scheduler
      previewSchedulerPageKey = schedulerPageKey
    }

    const criticalPageNumbers = readCriticalPreviewPageNumbers(result)
    const readyPageNumbers = readReadyPreviewPageNumbers(previewAssetStore, pageNumbers)
    const initialProgress = createPreviewGenerationProgress(
      result,
      null,
      readyPageNumbers.length,
      pageNumbers.length,
    )

    setPreviewHydrationState(
      readyPageNumbers.length >= pageNumbers.length
        ? { status: "ready" }
        : { status: "background", progress: initialProgress },
    )

    if (options.deferPageEnqueue) {
      return
    }

    scheduler.enqueuePartMasks(readPartMaskRequestsForPages(result, readyPageNumbers))
    scheduler.enqueueCriticalPages(criticalPageNumbers)
    scheduler.enqueuePartMasks(readPartMaskRequestsForPages(result, criticalPageNumbers))
    scheduler.enqueueWarmPages(
      pageNumbers.filter((pageNumber) => !criticalPageNumbers.includes(pageNumber)),
    )
  }

  return {
    cachePreviewPageInput: (entry) => {
      previewPageInputCache.set(entry.pageInput.pageNumber, entry)
    },
    cancelRuntimePreviewScheduler,
    clearPreviewResult: () => {
      previewResult = null
    },
    enqueueWarmPreviewPages: (pageNumbers) => {
      previewScheduler?.enqueueWarmPages(pageNumbers)
    },
    handleBuildStepPagePriorityChange: (
      pageNumber,
      isPriority,
      {
        partColorCalibrationVersion,
        partExtractorVersion,
        stepDetectionState,
      },
    ) => {
      if (!isPriority) {
        return
      }

      if (
        stepDetectionState.status !== "ready" ||
        !isCurrentPartExtractionResult(
          stepDetectionState.result,
          partExtractorVersion,
          partColorCalibrationVersion,
        )
      ) {
        return
      }

      previewScheduler?.enqueueCriticalPages([pageNumber])
      previewScheduler?.enqueuePartMasks(
        readPartMaskRequestsForPages(stepDetectionState.result, [pageNumber]),
      )
    },
    purgeRuntimePreviewAssets,
    startPreviewGeneration,
  }
}

function createPreviewSchedulerPageKey(pageNumbers: readonly number[]): string {
  return pageNumbers.join(",")
}

function readReadyPreviewPageNumbers(
  previewAssetStore: PreviewAssetStore,
  pageNumbers: readonly number[],
): number[] {
  const targetPageNumbers = new Set(pageNumbers)

  return previewAssetStore
    .readReadyPageAssets()
    .filter((asset) => targetPageNumbers.has(asset.pageNumber))
    .map((asset) => asset.pageNumber)
}
