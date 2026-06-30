import { useCallback, useEffect, useMemo, useReducer, useRef } from "react"
import {
  analysisJobStateReducer,
  createInitialAnalysisJobState,
  formatErrorDetail,
} from "./analysis-job-state"
import type { BuildStepAnalysisProgress } from "./output-tabs"
import type { StatusRow } from "./processing-status-card"
import {
  countDetectedPartItems,
  formatStalePartExtractionNotice,
  formatStalePartExtractionResultError,
  isCurrentPartExtractionResult,
  isCurrentStepDetectionResult,
  normalizePartExtractionError,
  readPartExtractionFreshnessDetail,
} from "./bagging-analysis-result"
import {
  createAnalysisProgressRows,
  createBuildStepPartExtractionProgress,
  createBuildStepScanProgress,
  readProcessingPhase,
} from "./bagging-app-progress"
import {
  type CreatePagePreviewAsset,
  type CreatePartMaskPreviewAsset,
  type PartExtractionState,
  type PdfIntakeState,
  type PendingBagCompletionRestore,
  type PreviewHydrationState,
  type PreviewPageInputCacheEntry,
  type ReadPdfMetadata,
  type RestoreSessionFile,
  type ScanStepCallouts,
  type ScanStepParts,
  type StepDetectionState,
} from "./bagging-app-types"
import {
  createManualFingerprint,
  readMetadata,
} from "./bagging-app-view-model"
import { usePreviewGeneration } from "./use-preview-generation"
import {
  createPdfIntakeSessionFile,
  getSessionDownloadName,
} from "@/features/bagging/session-file"
import type { StepCalloutBagCompletionAnchor } from "@/features/bagging/bag-completion-anchors"
import type { StepCalloutPageAdvisoryDiagnostic } from "@bag-it/step-callouts"
import {
  createStepCalloutBagRows,
  createStepCalloutBaggingPlan,
} from "@/features/bagging/step-callout-bagging"
import type { PdfMetadata } from "@/features/pdf/pdf-intake"
import {
  formatBytes,
  normalizePdfIntakeError,
  validatePdfFile,
} from "@/features/pdf/pdf-intake"
import {
  stripRuntimePreviewObjectUrls,
} from "@/features/steps/preview-object-urls"
import type {
  PagePreviewAsset,
  PartMaskPreviewAsset,
} from "@/features/steps/preview-assets"
import type { StepCalloutDetectionResult } from "@/features/steps/step-detection-contracts"
import { COUNT_LABELS, formatCount } from "@/lib/count-format"

declare global {
  interface Window {
    __bagItEnableAdvisoryDiagnostics?: boolean
    __bagItValidationState?: {
      calloutCount: number
      currentDetectorVersion: string
      currentPartColorCalibrationVersion: string
      currentPartExtractorVersion: string
      detectorVersion: string | null
      error: string | null
      errorDetail: string | null
      intakeStatus: PdfIntakeState["status"]
      isProcessing: boolean
      notice: string | null
      partCount: number
      partColorCalibrationVersion: string | null
      partExtractorVersion: string | null
      processingPhase: string | null
      partStatus: PartExtractionState["status"]
      previewStatus: PreviewHydrationState["status"]
      previewTiming: StepCalloutDetectionResult["previewTiming"] | null
      stepStatus: StepDetectionState["status"]
      timing: StepCalloutDetectionResult["timing"] | null
    }
    __bagItE2EState?: {
      result: StepCalloutDetectionResult | null
      pageAssets: PagePreviewAsset[]
      pageAdvisoryDiagnostics?: StepCalloutPageAdvisoryDiagnostic[]
      partMaskAssets: PartMaskPreviewAsset[]
      previewStatus: PreviewHydrationState["status"]
    }
  }
}

export type BagCompletionActions = {
  resetBagCompletions: () => void
  setPendingBagCompletionRestore: (restore: PendingBagCompletionRestore) => void
}

type StepScanRunOptions = {
  parallelPageDetection?: boolean
}

export function useStepAnalysisJob({
  createPagePreviewAsset,
  createPartMaskPreviewAsset,
  detectorVersion,
  partColorCalibrationVersion,
  partExtractorVersion,
  readPdfMetadata,
  restoreSessionFile,
  scanStepCallouts,
  scanStepParts,
}: {
  createPagePreviewAsset: CreatePagePreviewAsset
  createPartMaskPreviewAsset: CreatePartMaskPreviewAsset
  detectorVersion: string
  partColorCalibrationVersion: string
  partExtractorVersion: string
  readPdfMetadata: ReadPdfMetadata
  restoreSessionFile: RestoreSessionFile
  scanStepCallouts: ScanStepCallouts
  scanStepParts: ScanStepParts
}) {
  const [analysisState, dispatchAnalysisState] = useReducer(
    analysisJobStateReducer,
    createInitialAnalysisJobState(),
  )
  const {
    calloutMultipliers,
    error,
    errorDetail,
    intakeState,
    manualFile,
    notice,
    partExtractionState,
    scanClockNow,
    scanStartedAt,
    staleRerunDetectorVersion,
    staleRerunPartExtractorVersion,
    stepDetectionState,
  } = analysisState
  const abortControllerRef = useRef<AbortController | null>(null)
  const jobIdRef = useRef(0)
  const pageAdvisoryDiagnosticsRef = useRef<StepCalloutPageAdvisoryDiagnostic[]>([])
  const isCurrentJob = useCallback((jobId: number) => jobIdRef.current === jobId, [])
  const setNotice = useCallback((nextNotice: string | null) => {
    dispatchAnalysisState({ type: "notice-set", notice: nextNotice })
  }, [])
  const metadata = readMetadata(intakeState)
  const staleStepDetectionResult =
    stepDetectionState.status === "ready" &&
    !isCurrentStepDetectionResult(stepDetectionState.result, detectorVersion)
      ? stepDetectionState.result
      : null
  const stepDetectionResult =
    stepDetectionState.status === "ready" &&
    isCurrentStepDetectionResult(stepDetectionState.result, detectorVersion)
      ? stepDetectionState.result
      : null
  const baggableStepDetectionResult =
    stepDetectionResult &&
    isCurrentPartExtractionResult(stepDetectionResult, partExtractorVersion, partColorCalibrationVersion)
      ? stepDetectionResult
      : null
  const manualFingerprint = useMemo(
    () => (manualFile ? createManualFingerprint(manualFile) : null),
    [manualFile],
  )
  const baggingPlan = useMemo(
    () =>
      baggableStepDetectionResult
        ? createStepCalloutBaggingPlan(baggableStepDetectionResult, {
            calloutMultipliers,
          })
        : null,
    [baggableStepDetectionResult, calloutMultipliers],
  )
  const bagRows = useMemo(
    () =>
      baggingPlan && manualFingerprint
        ? createStepCalloutBagRows(baggingPlan, {
            manualFingerprint,
            pagePreviews: baggableStepDetectionResult?.pagePreviews,
          })
        : [],
    [baggableStepDetectionResult?.pagePreviews, baggingPlan, manualFingerprint],
  )
  const previewGeneration = usePreviewGeneration({
    bagRows,
    createPagePreviewAsset,
    createPartMaskPreviewAsset,
    detectorVersion,
    isCurrentJob,
    partColorCalibrationVersion,
    partExtractorVersion,
    setNotice,
    stepDetectionState,
  })
  const { previewHydrationState } = previewGeneration
  const hasQueuedPartExtraction =
    partExtractionState.status === "idle" &&
    stepDetectionState.status === "ready" &&
    isCurrentStepDetectionResult(stepDetectionState.result, detectorVersion) &&
    !isCurrentPartExtractionResult(stepDetectionState.result, partExtractorVersion, partColorCalibrationVersion)
  const hasActiveProcessing =
    intakeState.status === "processing" ||
    stepDetectionState.status === "processing" ||
    partExtractionState.status === "processing" ||
    previewHydrationState.status === "processing"
  const isProcessing = hasActiveProcessing || hasQueuedPartExtraction
  const canDownloadSession = Boolean(manualFile && metadata && !isProcessing)
  const metadataSummary = metadata
    ? `Read ${formatCount(metadata.pageCount, COUNT_LABELS.page)} · ${formatBytes(metadata.sizeBytes)}`
    : null
  const scanElapsedSeconds =
    stepDetectionState.status === "processing" && scanStartedAt !== null
      ? Math.max(0, Math.floor((scanClockNow - scanStartedAt) / 1000))
      : null
  const buildStepAnalysisProgress = useMemo<BuildStepAnalysisProgress | null>(() => {
    if (stepDetectionState.status !== "processing") {
      if (
        stepDetectionState.status === "ready" &&
        isCurrentStepDetectionResult(stepDetectionState.result, detectorVersion) &&
        !isCurrentPartExtractionResult(stepDetectionState.result, partExtractorVersion, partColorCalibrationVersion) &&
        (
          partExtractionState.status === "idle" ||
          partExtractionState.status === "processing" ||
          partExtractionState.status === "failed"
        )
      ) {
        return createBuildStepPartExtractionProgress(
          stepDetectionState.result,
          partExtractionState.status === "processing" ? partExtractionState.progress : null,
          metadata?.pageCount ?? null,
          partExtractionState.status === "failed"
            ? {
                activePageValue: "Failed",
                phaseLabel: "Parts failed",
                progress: 100,
                statusText: partExtractionState.error.message,
              }
            : undefined,
        )
      }

      return null
    }

    return createBuildStepScanProgress(
      stepDetectionState.progress,
      metadata?.pageCount ?? null,
      scanElapsedSeconds,
    )
  }, [
    detectorVersion,
    metadata?.pageCount,
    partExtractionState,
    partColorCalibrationVersion,
    partExtractorVersion,
    scanElapsedSeconds,
    stepDetectionState,
  ])
  const stepScanProgress =
    stepDetectionState.status === "processing" ? buildStepAnalysisProgress : null
  const statusRows = useMemo<StatusRow[]>(() =>
    createAnalysisProgressRows({
      detectorVersion,
      metadataPageCount: metadata?.pageCount ?? null,
      partColorCalibrationVersion,
      partExtractorVersion,
      partExtractionState,
      previewHydrationState,
      stepDetectionState,
      stepScanProgress,
    }), [
      detectorVersion,
      metadata?.pageCount,
      partColorCalibrationVersion,
      partExtractorVersion,
      partExtractionState,
      previewHydrationState,
      stepDetectionState,
      stepScanProgress,
    ])

  useEffect(() => {
    window.__bagItValidationState = {
      calloutCount: stepDetectionState.status === "ready"
        ? stepDetectionState.result.callouts.length
        : 0,
      currentDetectorVersion: detectorVersion,
      currentPartColorCalibrationVersion: partColorCalibrationVersion,
      currentPartExtractorVersion: partExtractorVersion,
      detectorVersion: stepDetectionState.status === "ready"
        ? stepDetectionState.result.detectorVersion
        : null,
      error,
      errorDetail,
      intakeStatus: intakeState.status,
      isProcessing,
      notice,
      partCount: stepDetectionState.status === "ready"
        ? countDetectedPartItems(stepDetectionState.result)
        : 0,
      partColorCalibrationVersion: stepDetectionState.status === "ready"
        ? stepDetectionState.result.partColorCalibrationVersion ?? null
        : null,
      partExtractorVersion: stepDetectionState.status === "ready"
        ? stepDetectionState.result.partExtractorVersion ?? null
        : null,
      processingPhase: readProcessingPhase(stepDetectionState, partExtractionState, previewHydrationState),
      partStatus: partExtractionState.status,
      previewStatus: previewHydrationState.status,
      previewTiming: stepDetectionState.status === "ready"
        ? stepDetectionState.result.previewTiming ?? null
        : null,
      stepStatus: stepDetectionState.status,
      timing: stepDetectionState.status === "ready"
        ? stepDetectionState.result.timing ?? null
        : null,
    }
    window.__bagItE2EState = {
      result: stepDetectionState.status === "ready" ? stepDetectionState.result : null,
      pageAssets: previewGeneration.previewAssetStore.readReadyPageAssets(),
      pageAdvisoryDiagnostics: window.__bagItEnableAdvisoryDiagnostics
        ? pageAdvisoryDiagnosticsRef.current
        : undefined,
      partMaskAssets: previewGeneration.previewAssetStore.readReadyPartMaskAssets(),
      previewStatus: previewHydrationState.status,
    }
  }, [
    detectorVersion,
    error,
    errorDetail,
    intakeState.status,
    isProcessing,
    notice,
    partExtractionState,
    partColorCalibrationVersion,
    partExtractorVersion,
    previewGeneration.previewAssetStore,
    previewHydrationState,
    stepDetectionState,
  ])

  useEffect(() => {
    if (stepDetectionState.status !== "processing") {
      return
    }

    const interval = window.setInterval(() => {
      dispatchAnalysisState({ type: "scan-clock-ticked", now: Date.now() })
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [stepDetectionState.status])

  const startPreviewScan = useCallback((entry: PreviewPageInputCacheEntry) => {
    previewGeneration.cachePreviewPageInput(entry)
    previewGeneration.enqueueWarmPreviewPages([entry.pageInput.pageNumber])
  }, [previewGeneration])

  const startStepScan = useCallback(
    async (
      file: File,
      nextMetadata: PdfMetadata,
      controller: AbortController,
      jobId: number,
      options: StepScanRunOptions = {},
    ) => {
      const scanStartTime = Date.now()

      previewGeneration.revokeRememberedPreviewObjectUrls()
      previewGeneration.purgeRuntimePreviewAssets()
      pageAdvisoryDiagnosticsRef.current = []
      dispatchAnalysisState({ type: "step-scan-started", startedAt: scanStartTime })
      previewGeneration.setPreviewHydrationState({ status: "idle" })
      previewGeneration.startScanPreviewGeneration(file, nextMetadata.pageCount, controller, jobId)

      try {
        const result = await scanStepCallouts(file, {
          eagerPreviewImages: false,
          onPreviewPageInput: (pageInput, baseBounds) => {
            if (!isCurrentJob(jobId)) {
              return
            }

            startPreviewScan({ baseBounds, pageInput })
          },
          pageCount: nextMetadata.pageCount,
          parallelPageDetection: options.parallelPageDetection ?? true,
          signal: controller.signal,
          onPageAdvisoryDiagnostics: window.__bagItEnableAdvisoryDiagnostics
            ? (diagnostics) => {
                pageAdvisoryDiagnosticsRef.current = diagnostics
              }
            : undefined,
          onProgress: (progress) => {
            if (isCurrentJob(jobId)) {
              dispatchAnalysisState({ type: "step-scan-progressed", progress })
            }
          },
        })

        if (!isCurrentJob(jobId)) {
          return
        }

        const isCurrentDetectorResult = isCurrentStepDetectionResult(result, detectorVersion)
        const hasCurrentPartExtraction = isCurrentPartExtractionResult(
          result,
          partExtractorVersion,
          partColorCalibrationVersion,
        )
        const noticeText = result.callouts.length > 0
          ? `${formatCount(result.callouts.length, COUNT_LABELS.stepCallout)} found across ${formatCount(
              result.scannedPageNumbers.length,
              COUNT_LABELS.scannedPage,
            )}.`
          : `${formatCount(result.scannedPageNumbers.length, COUNT_LABELS.page)} scanned. No step callouts detected.`

        previewGeneration.rememberPreviewObjectUrls(result)
        dispatchAnalysisState({
          type: "step-scan-succeeded",
          hasCurrentPartExtraction,
          isCurrentDetectorResult,
          notice: noticeText,
          result,
        })
        if (hasCurrentPartExtraction) {
          previewGeneration.startPreviewGeneration(file, result, controller, jobId, { preserveRuntimePreviews: true })
        }
      } catch (caughtError) {
        if (!isCurrentJob(jobId)) {
          return
        }

        const scanError = normalizePdfIntakeError(caughtError)

        if (scanError.code === "cancelled") {
          dispatchAnalysisState({ type: "step-scan-cancelled" })
          return
        }

        dispatchAnalysisState({
          type: "step-scan-failed",
          error: scanError,
          errorDetail: formatErrorDetail(caughtError),
        })
      }
    },
    [
      detectorVersion,
      isCurrentJob,
      partColorCalibrationVersion,
      partExtractorVersion,
      previewGeneration,
      scanStepCallouts,
      startPreviewScan,
    ],
  )

  const startPartExtraction = useCallback(
    async (
      file: File,
      result: StepCalloutDetectionResult,
      controller: AbortController,
      jobId: number,
      options: { preserveRuntimePreviews?: boolean } = {},
    ) => {
      const previewlessResult = stripRuntimePreviewObjectUrls(result)

      if (!options.preserveRuntimePreviews) {
        previewGeneration.revokeRememberedPreviewObjectUrls()
        previewGeneration.purgeRuntimePreviewAssets()
      }
      dispatchAnalysisState({
        type: "part-extraction-started",
        previewlessResult,
      })
      if (!options.preserveRuntimePreviews) {
        previewGeneration.setPreviewHydrationState({ status: "idle" })
      }

      try {
        const nextResult = await scanStepParts(file, previewlessResult, {
          eagerPreviewImages: false,
          onPreviewPageInput: (pageInput, baseBounds) => {
            if (!isCurrentJob(jobId)) {
              return
            }

            startPreviewScan({ baseBounds, pageInput })
          },
          signal: controller.signal,
          onProgress: (progress) => {
            if (isCurrentJob(jobId)) {
              dispatchAnalysisState({ type: "part-extraction-progressed", progress })
            }
          },
        })

        if (!isCurrentJob(jobId)) {
          return
        }

        if (!isCurrentPartExtractionResult(nextResult, partExtractorVersion, partColorCalibrationVersion)) {
          throw new Error(formatStalePartExtractionResultError(nextResult, partExtractorVersion, partColorCalibrationVersion))
        }

        const noticeText =
          `${formatCount(countDetectedPartItems(nextResult), COUNT_LABELS.partRow)} detected across ${formatCount(
            nextResult.callouts.length,
            COUNT_LABELS.callout,
          )}.`

        previewGeneration.rememberPreviewObjectUrls(nextResult)
        dispatchAnalysisState({
          type: "part-extraction-succeeded",
          notice: noticeText,
          result: nextResult,
        })
        previewGeneration.startPreviewGeneration(
          file,
          nextResult,
          controller,
          jobId,
          { preserveRuntimePreviews: options.preserveRuntimePreviews === true },
        )
      } catch (caughtError) {
        if (!isCurrentJob(jobId)) {
          return
        }

        const partError = normalizePartExtractionError(caughtError)

        if (partError.code === "cancelled") {
          dispatchAnalysisState({ type: "part-extraction-cancelled" })
          return
        }

        dispatchAnalysisState({
          type: "part-extraction-failed",
          error: partError,
          errorDetail: formatErrorDetail(caughtError),
        })
      }
    },
    [
      isCurrentJob,
      partColorCalibrationVersion,
      partExtractorVersion,
      previewGeneration,
      scanStepParts,
      startPreviewScan,
    ],
  )

  const abortActiveJob = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    previewGeneration.cancelRuntimePreviewScheduler()
    dispatchAnalysisState({ type: "active-job-aborted" })
  }, [previewGeneration])

  const resetFreshAnalysisState = useCallback((completionActions: Pick<BagCompletionActions, "resetBagCompletions">) => {
    dispatchAnalysisState({ type: "fresh-analysis-reset" })
    completionActions.resetBagCompletions()
  }, [])

  const startPdfIntake = useCallback(async (
    file: File,
    completionActions: Pick<BagCompletionActions, "resetBagCompletions">,
  ) => {
    const validation = validatePdfFile(file)
    if (!validation.ok) {
      dispatchAnalysisState({
        type: "manual-invalid",
        error: validation.error,
        errorDetail: formatErrorDetail(validation.error),
      })
      return
    }

    abortActiveJob()
    previewGeneration.revokeRememberedPreviewObjectUrls()
    previewGeneration.purgeRuntimePreviewAssets()
    const controller = new AbortController()
    abortControllerRef.current = controller
    const jobId = jobIdRef.current + 1
    jobIdRef.current = jobId

    dispatchAnalysisState({ type: "pdf-intake-started" })
    previewGeneration.setPreviewHydrationState({ status: "idle" })
    completionActions.resetBagCompletions()

    try {
      const nextMetadata = await readPdfMetadata(file, {
        signal: controller.signal,
      })

      if (!isCurrentJob(jobId)) {
        return
      }

      dispatchAnalysisState({ type: "pdf-intake-ready", metadata: nextMetadata })
      await startStepScan(file, nextMetadata, controller, jobId)
    } catch (caughtError) {
      if (!isCurrentJob(jobId)) {
        return
      }

      const intakeError = normalizePdfIntakeError(caughtError)
      dispatchAnalysisState({
        type: "pdf-intake-failed",
        error: intakeError,
        errorDetail: formatErrorDetail(caughtError),
      })
      previewGeneration.setPreviewHydrationState({ status: "idle" })
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    }
  }, [
    abortActiveJob,
    isCurrentJob,
    previewGeneration,
    readPdfMetadata,
    startStepScan,
  ])

  const handleFileChange = useCallback((
    file: File | null,
    completionActions: Pick<BagCompletionActions, "resetBagCompletions">,
  ) => {
    abortActiveJob()
    previewGeneration.revokeRememberedPreviewObjectUrls()
    previewGeneration.purgeRuntimePreviewAssets()
    jobIdRef.current += 1
    resetFreshAnalysisState(completionActions)

    if (!file) {
      dispatchAnalysisState({ type: "manual-cleared" })
      previewGeneration.setPreviewHydrationState({ status: "idle" })
      return
    }

    const validation = validatePdfFile(file)
    if (!validation.ok) {
      dispatchAnalysisState({
        type: "manual-invalid",
        error: validation.error,
        errorDetail: formatErrorDetail(validation.error),
      })
      previewGeneration.setPreviewHydrationState({ status: "idle" })
      return
    }

    dispatchAnalysisState({ type: "manual-selected", file })
    previewGeneration.setPreviewHydrationState({ status: "idle" })
    void startPdfIntake(file, completionActions)
  }, [
    abortActiveJob,
    previewGeneration,
    resetFreshAnalysisState,
    startPdfIntake,
  ])

  const handlePurge = useCallback((
    completionActions: Pick<BagCompletionActions, "resetBagCompletions">,
  ) => {
    abortActiveJob()
    previewGeneration.revokeRememberedPreviewObjectUrls()
    previewGeneration.purgeRuntimePreviewAssets()
    jobIdRef.current += 1
    resetFreshAnalysisState(completionActions)
    dispatchAnalysisState({ type: "purged" })
    previewGeneration.setPreviewHydrationState({ status: "idle" })
  }, [
    abortActiveJob,
    previewGeneration,
    resetFreshAnalysisState,
  ])

  const handlePrimaryAction = useCallback(async (
    completionActions: Pick<BagCompletionActions, "resetBagCompletions">,
  ) => {
    if (!manualFile) {
      return
    }

    await startPdfIntake(manualFile, completionActions)
  }, [manualFile, startPdfIntake])

  const handleDownloadSession = useCallback(async (
    checkedBagCompletions: Record<string, StepCalloutBagCompletionAnchor>,
  ) => {
    if (!manualFile || !metadata) {
      return
    }

    try {
      const sessionBlob = await createPdfIntakeSessionFile({
        calloutMultipliers,
        checkedBagCompletionAnchors: Object.values(checkedBagCompletions),
        checkedBagRowIds: Object.keys(checkedBagCompletions),
        manualFile,
        metadata,
        stepDetectionResult,
      })
      const url = URL.createObjectURL(sessionBlob)
      const link = document.createElement("a")

      link.href = url
      link.download = getSessionDownloadName(manualFile.name)
      link.click()
      URL.revokeObjectURL(url)
      dispatchAnalysisState({ type: "download-session-succeeded" })
    } catch (caughtError) {
      const intakeError = normalizePdfIntakeError(caughtError)
      dispatchAnalysisState({
        type: "download-session-failed",
        error: intakeError,
        errorDetail: formatErrorDetail(caughtError),
      })
    }
  }, [calloutMultipliers, manualFile, metadata, stepDetectionResult])

  const handleContinueSession = useCallback(async (
    file: File | null,
    completionActions: BagCompletionActions,
  ) => {
    if (!file) {
      return
    }

    abortActiveJob()
    previewGeneration.revokeRememberedPreviewObjectUrls()
    previewGeneration.purgeRuntimePreviewAssets()
    jobIdRef.current += 1
    dispatchAnalysisState({ type: "session-restore-started" })
    previewGeneration.setPreviewHydrationState({ status: "idle" })
    completionActions.resetBagCompletions()

    try {
      const restored = await restoreSessionFile(file)
      const controller = new AbortController()
      const jobId = jobIdRef.current + 1

      abortControllerRef.current = controller
      jobIdRef.current = jobId
      dispatchAnalysisState({
        type: "session-restore-hydrated",
        calloutMultipliers: restored.calloutMultipliers,
        manualFile: restored.manualFile,
        metadata: restored.metadata,
        stepDetectionResult: restored.stepDetectionResult,
      })
      completionActions.setPendingBagCompletionRestore({
        checkedBagCompletionAnchors: restored.checkedBagCompletionAnchors,
        checkedBagRowIds: restored.checkedBagRowIds,
        transferByAnchor:
          !restored.stepDetectionResult ||
          !isCurrentStepDetectionResult(restored.stepDetectionResult, detectorVersion),
      })

      if (
        restored.stepDetectionResult &&
        isCurrentStepDetectionResult(restored.stepDetectionResult, detectorVersion)
      ) {
        previewGeneration.rememberPreviewObjectUrls(restored.stepDetectionResult)

        if (
          isCurrentPartExtractionResult(
            restored.stepDetectionResult,
            partExtractorVersion,
            partColorCalibrationVersion,
          )
        ) {
          dispatchAnalysisState({
            type: "session-current-result-restored",
            hasCurrentPartExtraction: true,
            notice: `${formatCount(
              restored.stepDetectionResult.callouts.length,
              COUNT_LABELS.stepCallout,
            )} restored from saved session.`,
            result: restored.stepDetectionResult,
          })
          previewGeneration.startPreviewGeneration(restored.manualFile, restored.stepDetectionResult, controller, jobId)
        } else {
          dispatchAnalysisState({
            type: "session-current-result-restored",
            hasCurrentPartExtraction: false,
            notice: formatStalePartExtractionNotice(
              readPartExtractionFreshnessDetail(restored.stepDetectionResult),
              partExtractorVersion,
            ),
            result: restored.stepDetectionResult,
          })
          await startPartExtraction(
            restored.manualFile,
            restored.stepDetectionResult,
            controller,
            jobId,
            { preserveRuntimePreviews: true },
          )
        }
      } else {
        await startStepScan(restored.manualFile, restored.metadata, controller, jobId, {
          parallelPageDetection: restored.stepDetectionResult
            ? isCurrentStepDetectionResult(restored.stepDetectionResult, detectorVersion)
            : undefined,
        })
      }

      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    } catch (caughtError) {
      const intakeError = normalizePdfIntakeError(caughtError)
      dispatchAnalysisState({
        type: "session-restore-failed",
        error: intakeError,
        errorDetail: formatErrorDetail(caughtError),
      })
      previewGeneration.setPreviewHydrationState({ status: "idle" })
      completionActions.resetBagCompletions()
    }
  }, [
    abortActiveJob,
    detectorVersion,
    partColorCalibrationVersion,
    partExtractorVersion,
    previewGeneration,
    restoreSessionFile,
    startPartExtraction,
    startStepScan,
  ])

  const handleCalloutMultiplierChange = useCallback(
    (calloutId: string, multiplier: number) => {
      dispatchAnalysisState({
        type: "callout-multiplier-changed",
        calloutId,
        multiplier,
      })
    },
    [],
  )

  useEffect(() => {
    const staleDetectorVersion = staleStepDetectionResult?.detectorVersion ?? null

    if (!staleDetectorVersion || !manualFile || !metadata || hasActiveProcessing) {
      return
    }

    if (staleRerunDetectorVersion === staleDetectorVersion) {
      return
    }

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    const jobId = jobIdRef.current + 1

    abortControllerRef.current = controller
    jobIdRef.current = jobId
    dispatchAnalysisState({
      type: "stale-detector-rerun-started",
      notice: "Detector changed. Recalculating step callouts.",
      staleDetectorVersion,
    })

    void startStepScan(manualFile, metadata, controller, jobId, { parallelPageDetection: false }).finally(() => {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    })
  }, [
    detectorVersion,
    hasActiveProcessing,
    manualFile,
    metadata,
    staleStepDetectionResult?.detectorVersion,
    staleRerunDetectorVersion,
    startStepScan,
  ])

  useEffect(() => {
    if (
      !manualFile ||
      !metadata ||
      hasActiveProcessing ||
      stepDetectionState.status !== "ready" ||
      !isCurrentStepDetectionResult(stepDetectionState.result, detectorVersion) ||
      isCurrentPartExtractionResult(stepDetectionState.result, partExtractorVersion, partColorCalibrationVersion)
    ) {
      return
    }

    const stalePartExtraction = readPartExtractionFreshnessDetail(stepDetectionState.result)

    if (staleRerunPartExtractorVersion === stalePartExtraction.key) {
      return
    }

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    const jobId = jobIdRef.current + 1

    abortControllerRef.current = controller
    jobIdRef.current = jobId
    dispatchAnalysisState({
      type: "stale-part-extraction-rerun-started",
      notice: formatStalePartExtractionNotice(stalePartExtraction, partExtractorVersion),
      stalePartExtractionKey: stalePartExtraction.key,
    })

    void startPartExtraction(
      manualFile,
      stepDetectionState.result,
      controller,
      jobId,
      { preserveRuntimePreviews: true },
    ).finally(() => {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    })
  }, [
    detectorVersion,
    hasActiveProcessing,
    manualFile,
    metadata,
    partColorCalibrationVersion,
    partExtractorVersion,
    startPartExtraction,
    staleRerunPartExtractorVersion,
    stepDetectionState,
  ])

  return {
    bagRows,
    baggableStepDetectionResult,
    baggingPlan,
    buildStepAnalysisProgress,
    calloutMultipliers,
    canDownloadSession,
    error,
    errorDetail,
    handleBuildStepPagePriorityChange: previewGeneration.handleBuildStepPagePriorityChange,
    handleCalloutMultiplierChange,
    handleContinueSession,
    handleDownloadSession,
    handleFileChange,
    handlePrimaryAction,
    handlePurge,
    hasManual: Boolean(manualFile),
    intakeState,
    isProcessing,
    manualFile,
    manualFingerprint,
    metadata,
    metadataSummary,
    notice,
    partExtractionState,
    partMaskPreviewAssets: previewGeneration.partMaskPreviewAssets,
    partMaskPreviewsComplete: previewGeneration.partMaskPreviewsComplete,
    previewAssetStore: previewGeneration.previewAssetStore,
    previewHydrationState,
    setNotice,
    staleStepDetectionResult,
    statusRows,
    stepDetectionResult,
    stepDetectionState,
  }
}
