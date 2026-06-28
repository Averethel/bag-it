import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  type CreatePagePreviewAsset,
  type CreatePartMaskPreviewAsset,
  type PreviewHydrationState,
  type StepDetectionState,
} from "./bagging-app-types"
import { DEFAULT_STEP_CALLOUT_DETECTOR_VERSION } from "./detector-client-boundary"
import { createRuntimePreviewTaskController } from "./runtime-preview-task-controller"
import type { StepCalloutBagRow } from "@/features/bagging/step-callout-bagging"
import {
  collectStepDetectionPreviewObjectUrls,
  revokePreviewObjectUrls,
} from "@/features/steps/preview-object-urls"
import {
  createPartMaskPreviewKey,
  createPreviewAssetStore,
  type PartMaskPreviewAsset,
  type PreviewAssetStore,
} from "@/features/steps/preview-assets"
import type { StepCalloutDetectionResult } from "@/features/steps/step-detection-contracts"

export type PreviewGenerationController = ReturnType<typeof usePreviewGeneration>

export function usePreviewGeneration({
  bagRows,
  createPagePreviewAsset,
  createPartMaskPreviewAsset,
  detectorVersion,
  isCurrentJob,
  partColorCalibrationVersion,
  partExtractorVersion,
  setNotice,
  stepDetectionState,
}: {
  bagRows: StepCalloutBagRow[]
  createPagePreviewAsset: CreatePagePreviewAsset
  createPartMaskPreviewAsset: CreatePartMaskPreviewAsset
  detectorVersion?: string
  isCurrentJob: (jobId: number) => boolean
  partColorCalibrationVersion: string
  partExtractorVersion: string
  setNotice: (notice: string | null) => void
  stepDetectionState: StepDetectionState
}) {
  const [previewHydrationState, setPreviewHydrationState] = useState<PreviewHydrationState>({
    status: "idle",
  })
  const [partMaskPreviewAssets, setPartMaskPreviewAssets] = useState<PartMaskPreviewAsset[]>([])
  const [previewAssetStore] = useState<PreviewAssetStore>(() => createPreviewAssetStore())
  const previewObjectUrlsRef = useRef<Set<string>>(new Set())
  const runtimePreviewController = useMemo(() => createRuntimePreviewTaskController({
    createPagePreviewAsset,
    createPartMaskPreviewAsset,
    isCurrentJob,
    previewAssetStore,
    setNotice,
    setPreviewHydrationState,
  }), [
    createPagePreviewAsset,
    createPartMaskPreviewAsset,
    isCurrentJob,
    previewAssetStore,
    setNotice,
  ])
  const partMaskPreviewAssetIds = useMemo(
    () => new Set(partMaskPreviewAssets.map((asset) => asset.partItemId)),
    [partMaskPreviewAssets],
  )
  const expectedPartMaskPreviewCount = bagRows.filter((row) => Boolean(row.partImageAlphaMask)).length
  const readyPartMaskPreviewCount = bagRows.filter((row) =>
    Boolean(row.partImageAlphaMask && partMaskPreviewAssetIds.has(row.itemId))
  ).length
  const partMaskPreviewsComplete =
    expectedPartMaskPreviewCount === 0 ||
    readyPartMaskPreviewCount >= expectedPartMaskPreviewCount ||
    previewHydrationState.status === "failed" ||
    previewHydrationState.status === "cancelled"
  const partMaskPreviewItemIdsKey = useMemo(
    () => bagRows
      .filter((row) => Boolean(row.partImageAlphaMask))
      .map((row) => row.itemId)
      .sort()
      .join("\0"),
    [bagRows],
  )

  const rememberPreviewObjectUrls = useCallback((result: StepCalloutDetectionResult) => {
    for (const url of collectStepDetectionPreviewObjectUrls(result)) {
      previewObjectUrlsRef.current.add(url)
    }
  }, [])

  const revokeRememberedPreviewObjectUrls = useCallback(() => {
    revokePreviewObjectUrls(previewObjectUrlsRef.current)
    previewObjectUrlsRef.current.clear()
  }, [])

  useEffect(() => () => {
    runtimePreviewController.purgeRuntimePreviewAssets()
    revokeRememberedPreviewObjectUrls()
  }, [runtimePreviewController, revokeRememberedPreviewObjectUrls])

  useEffect(() => {
    const partMaskPreviewItemIds = partMaskPreviewItemIdsKey
      ? [...new Set(partMaskPreviewItemIdsKey.split("\0"))]
      : []
    let refreshTimer: number | null = null
    const refreshPartMaskAssets = () => {
      refreshTimer = null
      setPartMaskPreviewAssets(
        partMaskPreviewItemIds.length > 0
          ? previewAssetStore.readReadyPartMaskAssets()
          : [],
      )
    }
    const schedulePartMaskAssetRefresh = () => {
      if (refreshTimer !== null) {
        return
      }

      refreshTimer = window.setTimeout(refreshPartMaskAssets, 50)
    }

    schedulePartMaskAssetRefresh()

    if (partMaskPreviewItemIds.length === 0) {
      return () => {
        if (refreshTimer !== null) {
          window.clearTimeout(refreshTimer)
        }
      }
    }

    const unsubscribe = partMaskPreviewItemIds.map((itemId) =>
      previewAssetStore.subscribe(createPartMaskPreviewKey(itemId), schedulePartMaskAssetRefresh),
    )

    return () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer)
      }
      for (const stop of unsubscribe) {
        stop()
      }
    }
  }, [partMaskPreviewItemIdsKey, previewAssetStore])

  const startPreviewGeneration = useCallback(
    (
      file: File,
      result: StepCalloutDetectionResult,
      controller: AbortController,
      jobId: number,
      options: { deferPageEnqueue?: boolean; preserveRuntimePreviews?: boolean } = {},
    ) => {
      runtimePreviewController.startPreviewGeneration(file, result, controller, jobId, options)
    },
    [runtimePreviewController],
  )

  const startScanPreviewGeneration = useCallback(
    (
      file: File,
      pageCount: number,
      controller: AbortController,
      jobId: number,
    ) => {
      if (pageCount <= 0) {
        setPreviewHydrationState({ status: "ready" })
        return
      }

      startPreviewGeneration(
        file,
        createPreviewShellResult(pageCount, {
          detectorVersion,
          partColorCalibrationVersion,
          partExtractorVersion,
        }),
        controller,
        jobId,
        { deferPageEnqueue: true, preserveRuntimePreviews: true },
      )
      runtimePreviewController.clearPreviewResult()
    },
    [
      detectorVersion,
      partColorCalibrationVersion,
      partExtractorVersion,
      runtimePreviewController,
      startPreviewGeneration,
    ],
  )

  const handleBuildStepPagePriorityChange = useCallback((pageNumber: number, isPriority: boolean) => {
    runtimePreviewController.handleBuildStepPagePriorityChange(pageNumber, isPriority, {
      partColorCalibrationVersion,
      partExtractorVersion,
      stepDetectionState,
    })
  }, [
    partColorCalibrationVersion,
    partExtractorVersion,
    runtimePreviewController,
    stepDetectionState,
  ])

  return {
    cachePreviewPageInput: runtimePreviewController.cachePreviewPageInput,
    cancelRuntimePreviewScheduler: runtimePreviewController.cancelRuntimePreviewScheduler,
    enqueueWarmPreviewPages: runtimePreviewController.enqueueWarmPreviewPages,
    handleBuildStepPagePriorityChange,
    partMaskPreviewAssets,
    partMaskPreviewsComplete,
    previewAssetStore,
    previewHydrationState,
    purgeRuntimePreviewAssets: runtimePreviewController.purgeRuntimePreviewAssets,
    rememberPreviewObjectUrls,
    revokeRememberedPreviewObjectUrls,
    setPreviewHydrationState,
    startPreviewGeneration,
    startScanPreviewGeneration,
  }
}

function createPreviewShellResult(
  pageCount: number,
  versions: {
    detectorVersion?: string
    partColorCalibrationVersion: string
    partExtractorVersion: string
  },
): StepCalloutDetectionResult {
  const scannedPageNumbers = Array.from({ length: pageCount }, (_value, index) => index + 1)

  return {
    callouts: [],
    detectorVersion: versions.detectorVersion ?? DEFAULT_STEP_CALLOUT_DETECTOR_VERSION,
    pageAttentionItems: [],
    pageCount,
    pageLimit: null,
    pagePreviews: scannedPageNumbers.map((pageNumber) => ({
      height: 1,
      pageNumber,
      width: 1,
    })),
    partColorCalibrationVersion: versions.partColorCalibrationVersion,
    partExtractorVersion: versions.partExtractorVersion,
    qualitySummary: {
      firstBuildStepPageNumber: null,
      inferredCalloutBackgrounds: [],
    },
    scannedPageNumbers,
    skippedPageNumbers: [],
    status: "empty",
  }
}
