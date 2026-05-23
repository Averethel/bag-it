"use client"

import { Box, Stack } from "@chakra-ui/react"
import { Boxes, PackageCheck, Search } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { BaggingOverview } from "@/components/bagging/bagging-overview"
import { BaggingPageFrame } from "@/components/bagging/bagging-page-frame"
import { ExtractedPartsPanel, NormalizationAttentionList } from "@/components/bagging/extracted-parts-panel"
import { ManualFlowCard } from "@/components/bagging/manual-flow-card"
import { OutputTabs } from "@/components/bagging/output-tabs"
import { PartsListDebugPanel } from "@/components/bagging/parts-list-debug-panel"
import { PendingOutputPanel } from "@/components/bagging/pending-output-panel"
import { ProcessingStatusCard, type ProcessingStatusStep } from "@/components/bagging/processing-status-card"
import { SessionControlsCard } from "@/components/bagging/session-controls-card"
import { StepCalloutDebugPanel, StepCalloutMatchingDebugPanel, StepCalloutsPanel } from "@/components/bagging/step-callouts-panel"
import {
  fetchPartsListCatalogueColors,
  fetchPartsListNormalization,
  fetchPartsListPartPreviews,
  getPartsListPartPreviewKey,
  preloadPartsListCatalogue,
  type PartsListPartPreview,
  type PartsListPartPreviewRequest,
} from "@/features/bagging/browser-catalogue"
import { parseBrowserPdfDocument } from "@/features/bagging/browser-pdf-parser"
import { mockOverviewContent } from "@/features/bagging/mock-data"
import {
  disposePreloadedPartsListOcrWorker,
  extractPartsListFromPdfDocument,
  partsListExtractorVersion,
  preloadPartsListOcrWorker,
  type PartsListPdfExtractionOptions,
  type PartsListPdfExtractionProgress,
  type PartsListPdfExtractionResult,
} from "@/features/bagging/parts-list-pdf-extraction"
import {
  createPartsListProgressTransfer,
  type PartsListProgressTransferResult,
  type PartsListProgressTransferSource,
} from "@/features/bagging/parts-list-progress-transfer"
import { getPartsListRowId } from "@/features/bagging/parts-list-row-id"
import {
  createExpiredJobSnapshot,
  createQueuedPdfJobSnapshot,
  formatFileSize,
  getPdfJobProgress,
  getPdfJobStateLabel,
  renderPdfPages,
  runPrivatePdfProcessingJob,
  sourceByteRetentionMs,
  type PdfIntakeJobState,
  type PdfIntakeJobSnapshot,
  type PdfIntakeMetadata,
  type PdfPrivatePageRender,
} from "@/features/bagging/pdf-intake"
import {
  createBaggingSessionFile,
  getBaggingSessionDownloadName,
  isRestoredAnalysisCurrent,
  isRestoredStepAnalysisCurrent,
  restoreBaggingSessionFile,
} from "@/features/bagging/session-file"
import {
  defaultStepCalloutPageLimit,
  detectStepCalloutsFromPdfDocument,
  getInitialStepCalloutPageNumbers,
  stepCalloutDetectorVersion,
  type StepCalloutDetectionProgress,
  type StepCalloutDetectionResult,
} from "@/features/bagging/step-callout-detection"
import type { StepCalloutMultiplierMap } from "@/features/bagging/step-callout-bagging"

type PartsAnalysisProgress = Pick<PartsListPdfExtractionProgress, "message" | "progress"> &
  Partial<
    Pick<
      PartsListPdfExtractionProgress,
      | "currentPage"
      | "detectedPageCount"
      | "pageCount"
      | "phase"
      | "previewReadyPageNumbers"
      | "rowCount"
      | "scannedPageCount"
    >
  > & {
  updatedAt: number
}
type CatalogueReconciliationProgress = {
  message: string
  progress: number
  readyCount: number
  totalCount: number
}
type StepAnalysisProgress = Pick<
  StepCalloutDetectionProgress,
  "currentPage" | "detectedCalloutCount" | "message" | "pageCount" | "progress" | "scannedPageCount" | "targetPageCount"
> & {
  updatedAt: number
}
type SessionRecoveryNotice = {
  kind: "error" | "progress_transfer" | "step_version_mismatch" | "version_mismatch"
  recoveryText: string
  tone?: "error" | "success" | "warning"
  statusText: string
} | null
type PartsListPublicationTransfer = {
  pending: PartsListProgressTransferResult | null
  visible: PartsListProgressTransferResult | null
}
const catalogueLoadingMessage = "Loading local catalogue data."
const catalogueLoadingWatchdogMs = 12_000

export function BaggingPage() {
  const [selectedManualFile, setSelectedManualFile] = useState<File | null>(null)
  const [manualDisplayName, setManualDisplayName] = useState<string | null>(null)
  const [jobSnapshot, setJobSnapshot] = useState<PdfIntakeJobSnapshot | null>(null)
  const [metadata, setMetadata] = useState<PdfIntakeMetadata | null>(null)
  const [partsAnalysisProgress, setPartsAnalysisProgress] = useState<PartsAnalysisProgress | null>(null)
  const [partsListResult, setPartsListResult] = useState<PartsListPdfExtractionResult | null>(null)
  const [stepAnalysisProgress, setStepAnalysisProgress] = useState<StepAnalysisProgress | null>(null)
  const [stepCalloutResult, setStepCalloutResult] = useState<StepCalloutDetectionResult | null>(null)
  const [stepCalloutMultipliers, setStepCalloutMultipliers] = useState<StepCalloutMultiplierMap>({})
  const [partPreviewByKey, setPartPreviewByKey] = useState<ReadonlyMap<string, PartsListPartPreview>>(
    new Map(),
  )
  const [attemptedPartPreviewKeys, setAttemptedPartPreviewKeys] = useState<ReadonlySet<string>>(new Set())
  const [previewReadyPageNumbers, setPreviewReadyPageNumbers] = useState<ReadonlySet<number>>(new Set())
  const [checkedPartRowIds, setCheckedPartRowIds] = useState<ReadonlySet<string>>(new Set())
  const [sessionRecoveryNotice, setSessionRecoveryNotice] = useState<SessionRecoveryNotice>(null)
  const [analysisHeartbeat, setAnalysisHeartbeat] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const activeJobIdRef = useRef<string | null>(null)
  const checkedPartRowIdsRef = useRef<ReadonlySet<string>>(new Set())
  const inFlightPartPreviewKeysRef = useRef<Set<string>>(new Set())
  const normalizationPublicationIdRef = useRef(0)
  const attemptedPartPreviewKeysRef = useRef<ReadonlySet<string>>(new Set())
  const partPreviewByKeyRef = useRef<ReadonlyMap<string, PartsListPartPreview>>(new Map())
  const partPreviewControllersRef = useRef<Set<AbortController>>(new Set())
  const partPreviewRunIdRef = useRef(0)
  const partsListResultRef = useRef<PartsListPdfExtractionResult | null>(null)
  const pendingProgressTransferRef = useRef<PartsListProgressTransferSource | null>(null)
  const sessionImportControllerRef = useRef<AbortController | null>(null)
  const sessionImportRunIdRef = useRef(0)
  const stepCalloutResultRef = useRef<StepCalloutDetectionResult | null>(null)
  const selectedManualName =
    selectedManualFile?.name ?? metadata?.fileName ?? jobSnapshot?.metadata?.fileName ?? manualDisplayName
  const jobState = jobSnapshot?.state ?? "queued"
  const canFetchPreviews = canFetchPartPreviews(jobState, partsAnalysisProgress, previewReadyPageNumbers)
  const catalogueReconciliationProgress = getCatalogueReconciliationProgress(
    partsListResult,
    partPreviewByKey,
    attemptedPartPreviewKeys,
    canFetchPreviews,
    isProcessing ? previewReadyPageNumbers : null,
  )
  const hasCurrentPartsAnalysis = hasCurrentPartsListAnalysis(partsListResult)
  const hasCurrentStepCalloutAnalysis = hasCurrentStepCalloutResult(stepCalloutResult)
  const visibleStepCalloutResult = hasCurrentStepCalloutAnalysis ? stepCalloutResult : null
  const inventoryPartCount = getPartsListTotalQuantity(partsListResult)
  const hasStaleStepCalloutAnalysis = Boolean(stepCalloutResult && !hasCurrentStepCalloutAnalysis)
  const canRunStepOnlyAnalysis = Boolean(
    selectedManualFile &&
    jobSnapshot &&
    hasCurrentPartsAnalysis &&
    !hasCurrentStepCalloutAnalysis,
  )
  const processingProgressSteps = getProcessingProgressSteps({
    analysisHeartbeat,
    hasCurrentPartsAnalysis,
    isProcessing,
    jobState,
    metadata,
    partsAnalysisProgress,
    partsListResult,
    previewReadyPageNumbers,
    stepAnalysisProgress,
    stepCalloutResult: visibleStepCalloutResult,
  })
  const metadataSummary = metadata ? `${metadata.pageCount} pages read from a ${formatFileSize(metadata.sizeBytes)} PDF.` : null
  const statusText = getManualStatusText(jobSnapshot, partsListResult, catalogueReconciliationProgress)
  const canPurge = Boolean(selectedManualFile || manualDisplayName || metadata || jobSnapshot?.metadata || isProcessing)
  const canDownloadSession = Boolean(selectedManualFile && jobSnapshot) && !isProcessing
  const hasStartedAnalysis = hasAnalysisStarted({ isProcessing, jobSnapshot, metadata, partsListResult })
  const startLabel = sessionRecoveryNotice?.kind === "version_mismatch"
    ? "Recalculate analysis"
    : canRunStepOnlyAnalysis
      ? "Find steps"
      : "Bag it!"
  const updateStepCalloutMultiplier = useCallback((calloutId: string, multiplier: number) => {
    setStepCalloutMultipliers((current) => setStepCalloutMultiplier(current, calloutId, multiplier))
  }, [])
  const loadStepDebugPageRenders = useCallback(async (pageNumbers: readonly number[]): Promise<readonly PdfPrivatePageRender[]> => {
    if (!selectedManualFile || pageNumbers.length === 0 || !canUseBrowserPdfParser()) {
      return []
    }

    const uniquePageNumbers = [...new Set(pageNumbers)].sort((left, right) => left - right)
    let document: Awaited<ReturnType<typeof parseBrowserPdfDocument>> | null = null

    try {
      const sourceBytes = new Uint8Array(await selectedManualFile.arrayBuffer())
      document = await parseBrowserPdfDocument(sourceBytes)

      return await renderPdfPages(document, {
        onPageRendered: () => undefined,
        pageNumbers: uniquePageNumbers,
      })
    } catch {
      return []
    } finally {
      await document?.destroy?.()
    }
  }, [selectedManualFile])

  function abortPartPreviewLookups() {
    normalizationPublicationIdRef.current += 1
    partPreviewRunIdRef.current += 1
    for (const controller of partPreviewControllersRef.current) {
      controller.abort()
    }
    partPreviewControllersRef.current.clear()
    inFlightPartPreviewKeysRef.current.clear()
  }

  function abortSessionImport() {
    sessionImportRunIdRef.current += 1
    sessionImportControllerRef.current?.abort()
    sessionImportControllerRef.current = null
  }

  function beginSessionImport() {
    abortSessionImport()
    const controller = new AbortController()
    sessionImportControllerRef.current = controller

    return {
      controller,
      runId: sessionImportRunIdRef.current,
    }
  }

  function isCurrentSessionImport(controller: AbortController, runId: number) {
    return !controller.signal.aborted &&
      sessionImportControllerRef.current === controller &&
      sessionImportRunIdRef.current === runId
  }

  function commitPartsListResult(result: PartsListPdfExtractionResult | null) {
    partsListResultRef.current = result
    setPartsListResult(result)
  }

  function commitStepCalloutResult(result: StepCalloutDetectionResult | null) {
    stepCalloutResultRef.current = result
    setStepCalloutResult(result)
    setStepCalloutMultipliers((current) => pruneStepCalloutMultipliers(current, result))
  }

  function commitPartPreviewByKey(previews: ReadonlyMap<string, PartsListPartPreview>) {
    partPreviewByKeyRef.current = previews
    setPartPreviewByKey(previews)
  }

  function commitAttemptedPartPreviewKeys(keys: ReadonlySet<string>) {
    const nextKeys = new Set(keys)
    attemptedPartPreviewKeysRef.current = nextKeys
    setAttemptedPartPreviewKeys(nextKeys)
  }

  function addAttemptedPartPreviewKeys(keys: readonly string[]) {
    if (keys.length === 0) {
      return
    }

    const nextKeys = new Set(attemptedPartPreviewKeysRef.current)
    const previousSize = nextKeys.size
    for (const key of keys) {
      nextKeys.add(key)
    }

    if (nextKeys.size !== previousSize) {
      commitAttemptedPartPreviewKeys(nextKeys)
    }
  }

  function commitCheckedPartRowIds(rowIds: ReadonlySet<string>) {
    const nextRowIds = new Set(rowIds)
    checkedPartRowIdsRef.current = nextRowIds
    setCheckedPartRowIds(nextRowIds)
  }

  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(null, "", window.location.pathname)
    }
  }, [])

  useEffect(() => {
    if (
      !partsListResult ||
      isProcessing ||
      (partsListResult.extractorVersion === partsListExtractorVersion && partsListResult.normalization)
    ) {
      return
    }

    let isCancelled = false
    queueMicrotask(() => {
      if (isCancelled) {
        return
      }

      const staleExtractorVersion = partsListResult.normalization
        ? partsListResult.extractorVersion
        : `${partsListResult.extractorVersion} without normalization data`
      const pendingProgressTransfer = createPendingProgressTransfer(partsListResult, checkedPartRowIds)
      pendingProgressTransferRef.current = pendingProgressTransfer
      abortPartPreviewLookups()
      if (selectedManualFile) {
        const queuedSnapshot = createQueuedPdfJobSnapshot(selectedManualFile.name)
        activeJobIdRef.current = queuedSnapshot.id
        setJobSnapshot(queuedSnapshot)
      }

      commitPartsListResult(null)
      commitStepCalloutResult(null)
      setStepAnalysisProgress(null)
      commitPartPreviewByKey(new Map())
      commitAttemptedPartPreviewKeys(new Set())
      setPreviewReadyPageNumbers(new Set())
      commitCheckedPartRowIds(pendingProgressTransfer?.checkedRowIds ?? new Set())
      setSessionRecoveryNotice({
        kind: "version_mismatch",
        recoveryText: `Visible analysis used ${staleExtractorVersion}. Current extractor is ${partsListExtractorVersion}. Recalculate before continuing.`,
        tone: "error",
        statusText: "Recalculate required",
      })
    })

    return () => {
      isCancelled = true
    }
  }, [checkedPartRowIds, isProcessing, partsListResult, selectedManualFile])

  useEffect(() => {
    if (
      !selectedManualFile ||
      !jobSnapshot ||
      jobSnapshot.state === "complete" ||
      isProcessing ||
      !hasCurrentPartsAnalysis ||
      !partsListResult
    ) {
      return
    }

    let isCancelled = false
    queueMicrotask(() => {
      if (isCancelled) {
        return
      }

      setJobSnapshot(
        createRestoredCurrentAnalysisJobSnapshot({
          manualFile: selectedManualFile,
          metadata,
          partsListResult,
          restoredJobSnapshot: jobSnapshot,
        }),
      )
    })

    return () => {
      isCancelled = true
    }
  }, [hasCurrentPartsAnalysis, isProcessing, jobSnapshot, metadata, partsListResult, selectedManualFile])

  useEffect(() => {
    if (!canUseBrowserPdfParser()) {
      return
    }

    void preloadPartsListCatalogue()
    void preloadPartsListOcrWorker()

    return () => {
      abortControllerRef.current?.abort()
      abortSessionImport()
      abortControllerRef.current = null
      activeJobIdRef.current = null
      void disposePreloadedPartsListOcrWorker()
    }
  }, [])

  useEffect(() => {
    if (!isProcessing) {
      return
    }

    const intervalId = window.setInterval(() => setAnalysisHeartbeat(Date.now()), 1_000)

    return () => window.clearInterval(intervalId)
  }, [isProcessing])

  useEffect(() => {
    if (!selectedManualFile || !jobSnapshot || jobSnapshot.state !== "queued") {
      return
    }

    const expiresIn = Math.max(0, sourceByteRetentionMs - (Date.now() - jobSnapshot.startedAt))
    const stagedJobId = jobSnapshot.id
    const timeoutId = window.setTimeout(() => {
      setSelectedManualFile(null)
      setMetadata(null)
      setIsProcessing(false)
      setJobSnapshot((current) => {
        if (!current || current.id !== stagedJobId || current.state !== "queued") {
          return current
        }

        return createExpiredJobSnapshot(current)
      })
    }, expiresIn)

    return () => window.clearTimeout(timeoutId)
  }, [jobSnapshot, selectedManualFile])

  useEffect(() => {
    if (!isProcessing || partsAnalysisProgress?.message !== catalogueLoadingMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      abortControllerRef.current?.abort()
      abortPartPreviewLookups()
      abortControllerRef.current = null
      activeJobIdRef.current = null
      setIsProcessing(false)
      setPartsAnalysisProgress(null)
      commitPartsListResult(null)
      setPreviewReadyPageNumbers(new Set())
      setJobSnapshot((current) => {
        if (
          !current ||
          current.state === "complete" ||
          current.state === "failed" ||
          current.state === "expired" ||
          current.state === "purged"
        ) {
          return current
        }

        return {
          ...current,
          errorMessage: selectedManualFile
            ? "Catalogue loading stalled. Click Bag it! to retry."
            : "Catalogue loading stalled. Remove and upload the manual again.",
          progress: getPdfJobProgress("failed"),
          state: "failed",
          updatedAt: Date.now(),
        }
      })
    }, catalogueLoadingWatchdogMs)

    return () => window.clearTimeout(timeoutId)
  }, [isProcessing, partsAnalysisProgress?.message, selectedManualFile])

  useEffect(() => {
    if (!partsListResult || !canFetchPreviews) {
      return
    }

    const readyPageNumbers = isProcessing ? previewReadyPageNumbers : getPartsListSourcePageNumbers(partsListResult)
    const previewGroups = getPartPreviewRequestGroupsByPage(partsListResult, readyPageNumbers)
    for (const group of previewGroups) {
      const missingPreviews = getUnresolvedPreviewRequests(
        group.requests,
        partPreviewByKey,
        attemptedPartPreviewKeysRef.current,
        inFlightPartPreviewKeysRef.current,
      )
      if (missingPreviews.length === 0) {
        continue
      }

      const missingPreviewKeys = missingPreviews.map((request) => getPartsListPartPreviewKey(request))
      for (const key of missingPreviewKeys) {
        inFlightPartPreviewKeysRef.current.add(key)
      }

      const controller = new AbortController()
      const runId = partPreviewRunIdRef.current
      const catalogueSnapshotId = partsListResult.normalization?.catalogueSnapshotId ?? null
      partPreviewControllersRef.current.add(controller)
      void fetchPartsListPartPreviews(missingPreviews, {
        signal: controller.signal,
        snapshotId: catalogueSnapshotId,
      }).then((previews) => {
        if (controller.signal.aborted || runId !== partPreviewRunIdRef.current) {
          return
        }

        addAttemptedPartPreviewKeys(missingPreviewKeys)

        if (previews.size > 0) {
          setPartPreviewByKey((current) => {
            const next = new Map(current)
            for (const [key, preview] of previews) {
              next.set(key, preview)
            }

            partPreviewByKeyRef.current = next
            return next
          })
        }
      }).finally(() => {
        partPreviewControllersRef.current.delete(controller)
        for (const key of missingPreviewKeys) {
          inFlightPartPreviewKeysRef.current.delete(key)
        }
      })
    }
  }, [canFetchPreviews, isProcessing, partPreviewByKey, partsListResult, previewReadyPageNumbers])

  async function startAnalysis() {
    if (!selectedManualFile || !jobSnapshot || isProcessing) {
      return
    }

    if (canRunStepOnlyAnalysis && partsListResultRef.current) {
      await startStepOnlyAnalysis(partsListResultRef.current)
      return
    }

    const file = selectedManualFile
    const controller = new AbortController()
    const jobId = jobSnapshot.id
    const pendingProgressTransfer =
      pendingProgressTransferRef.current ??
      createPendingProgressTransfer(partsListResultRef.current, checkedPartRowIdsRef.current)
    pendingProgressTransferRef.current = pendingProgressTransfer
    abortControllerRef.current?.abort()
    abortSessionImport()
    abortPartPreviewLookups()
    abortControllerRef.current = controller
    activeJobIdRef.current = jobId ?? null
    setMetadata(null)
    setPartsAnalysisProgress(createPartsAnalysisProgress(catalogueLoadingMessage, 10))
    setStepAnalysisProgress(null)
    commitPartsListResult(null)
    commitStepCalloutResult(null)
    commitPartPreviewByKey(new Map())
    commitAttemptedPartPreviewKeys(new Set())
    setPreviewReadyPageNumbers(new Set())
    commitCheckedPartRowIds(pendingProgressTransfer?.checkedRowIds ?? new Set())
    setSessionRecoveryNotice(null)
    setAnalysisHeartbeat(0)
    setIsProcessing(true)
    const parseDocument = canUseBrowserPdfParser() ? parseBrowserPdfDocument : undefined

    const result = await runPrivatePdfProcessingJob(file, {
      analyzeDocument: async (document, { signal }) => {
        const { colors, snapshot: catalogueSnapshot } = await fetchPartsListCatalogueColors({
          forceRefresh: true,
          signal,
        })
        const catalogueSnapshotId = catalogueSnapshot?.id ?? null
        if (!controller.signal.aborted) {
          setPartsAnalysisProgress(createPartsAnalysisProgress("Catalogue data ready. Reading inventory pages.", 20))
        }
        const partsList = await extractPartsListFromPdfDocument(document, {
          colors,
          ...getLocalValidationOcrOptions(),
          onProgress: (progress) => {
            if (controller.signal.aborted) {
              return
            }

            setPartsAnalysisProgress(createPartsAnalysisProgress(progress.message, progress.progress, progress))
            if (progress.previewReadyPageNumbers && progress.previewReadyPageNumbers.length > 0) {
              setPreviewReadyPageNumbers((current) => {
                const next = new Set(current)
                const previousSize = next.size
                for (const pageNumber of progress.previewReadyPageNumbers ?? []) {
                  next.add(pageNumber)
                }

                return next.size === previousSize ? current : next
              })
            }
            if (progress.partialResult && progress.partialResult.rows.length > 0) {
              void publishPartsListResult(
                progress.partialResult,
                catalogueSnapshotId,
                controller.signal,
              )
            }
          },
          signal,
        })
        const finalPublicationId = normalizationPublicationIdRef.current + 1
        normalizationPublicationIdRef.current = finalPublicationId
        const normalizedPartsList = await normalizePartsListResult(partsList, catalogueSnapshotId, controller.signal)
        if (controller.signal.aborted || finalPublicationId !== normalizationPublicationIdRef.current) {
          return {
            pageNumbersToRender: [],
          }
        }
        const publicationTransfer = publishNormalizedPartsListResult(normalizedPartsList, { isFinal: true })
        const stepExcludedPageNumbers = getPartsListStepScanExcludedPageNumbers(normalizedPartsList)
        const stepTargetPageCount = getStepCalloutTargetPageCount(document.numPages, stepExcludedPageNumbers)
        setPartsAnalysisProgress(createPartsAnalysisProgress("Parts list extraction complete.", 100))
        setSessionRecoveryNotice(createPublicationTransferNotice(publicationTransfer, true))
        setStepAnalysisProgress(createStepAnalysisProgress({
          currentPage: null,
          detectedCalloutCount: 0,
          message: "Preparing step callout scan.",
          pageCount: document.numPages,
          progress: 5,
          scannedPageCount: 0,
          targetPageCount: stepTargetPageCount,
        }))
        setStepAnalysisProgress(createStepAnalysisProgress({
          currentPage: null,
          detectedCalloutCount: 0,
          message: "Finding step callouts across the non-inventory pages.",
          pageCount: document.numPages,
          progress: 5,
          scannedPageCount: 0,
          targetPageCount: stepTargetPageCount,
        }))
        const stepResult = await detectStepCalloutsFromPdfDocument(document, {
          excludedPageNumbers: stepExcludedPageNumbers,
          maxPages: defaultStepCalloutPageLimit,
          onProgress: (progress) => {
            if (!controller.signal.aborted) {
              setStepAnalysisProgress(createStepAnalysisProgress(progress))
            }
          },
          signal,
        })
        if (controller.signal.aborted) {
          return {
            pageNumbersToRender: [],
          }
        }
        commitStepCalloutResult(stepResult)
        setStepAnalysisProgress(createStepAnalysisProgress({
          currentPage: null,
          detectedCalloutCount: stepResult.callouts.length,
          message: "Step callout detection complete.",
          pageCount: document.numPages,
          progress: 100,
          scannedPageCount: stepResult.scannedPageNumbers.length,
          targetPageCount: stepResult.scannedPageNumbers.length,
        }))

        return {
          pageNumbersToRender: getPartsListDebugPageNumbers(normalizedPartsList),
        }
      },
      id: jobId,
      onUpdate: (snapshot) => {
        if (snapshot.id !== activeJobIdRef.current) {
          return
        }

        activeJobIdRef.current = snapshot.id
        setJobSnapshot(snapshot)
        if (snapshot.metadata) {
          setMetadata(snapshot.metadata)
        }
      },
      parseDocument,
      signal: controller.signal,
    })

    if (abortControllerRef.current === controller) {
      abortControllerRef.current = null
      activeJobIdRef.current = null
      setIsProcessing(false)
      if (result.state === "complete") {
        setSelectedManualFile(file)
      } else {
        if (result.sourceBytesPurged) {
          setSelectedManualFile(null)
        }
        setMetadata(null)
        setPartsAnalysisProgress(null)
        commitPartsListResult(null)
        setStepAnalysisProgress(null)
        commitStepCalloutResult(null)
        setPreviewReadyPageNumbers(new Set())
      }
    }
  }

  async function startStepOnlyAnalysis(currentPartsListResult: PartsListPdfExtractionResult) {
    if (!selectedManualFile || !jobSnapshot || isProcessing) {
      return
    }

    const file = selectedManualFile
    const controller = new AbortController()
    const jobId = jobSnapshot.id
    abortControllerRef.current?.abort()
    abortSessionImport()
    abortControllerRef.current = controller
    activeJobIdRef.current = jobId ?? null
    const stepExcludedPageNumbers = getPartsListStepScanExcludedPageNumbers(currentPartsListResult)
    const initialStepTargetPageCount = getStepCalloutTargetPageCount(
      metadata?.pageCount ?? jobSnapshot.metadata?.pageCount ?? currentPartsListResult.nativeTextPageCount,
      stepExcludedPageNumbers,
    )
    setStepAnalysisProgress(createStepAnalysisProgress({
      currentPage: null,
      detectedCalloutCount: 0,
      message: "Preparing step callout scan.",
      pageCount: metadata?.pageCount ?? jobSnapshot.metadata?.pageCount ?? currentPartsListResult.nativeTextPageCount,
      progress: 5,
      scannedPageCount: 0,
      targetPageCount: initialStepTargetPageCount,
    }))
    commitStepCalloutResult(null)
    setSessionRecoveryNotice(null)
    setAnalysisHeartbeat(0)
    setIsProcessing(true)
    const parseDocument = canUseBrowserPdfParser() ? parseBrowserPdfDocument : undefined
    const completedStepDetection: { current: StepCalloutDetectionResult | null } = { current: null }

    const result = await runPrivatePdfProcessingJob(file, {
      analyzeDocument: async (document, { metadata, signal }) => {
        const stepTargetPageCount = getStepCalloutTargetPageCount(metadata.pageCount, stepExcludedPageNumbers)
        setStepAnalysisProgress(createStepAnalysisProgress({
          currentPage: null,
          detectedCalloutCount: 0,
          message: "Finding step callouts across the non-inventory pages.",
          pageCount: metadata.pageCount,
          progress: 5,
          scannedPageCount: 0,
          targetPageCount: stepTargetPageCount,
        }))
        const stepResult = await detectStepCalloutsFromPdfDocument(document, {
          excludedPageNumbers: stepExcludedPageNumbers,
          maxPages: defaultStepCalloutPageLimit,
          onProgress: (progress) => {
            if (!controller.signal.aborted) {
              setStepAnalysisProgress(createStepAnalysisProgress(progress))
            }
          },
          signal,
        })
        if (!controller.signal.aborted) {
          completedStepDetection.current = stepResult
          commitStepCalloutResult(stepResult)
          setStepAnalysisProgress(createStepAnalysisProgress({
            currentPage: null,
            detectedCalloutCount: stepResult.callouts.length,
            message: "Step callout detection complete.",
            pageCount: metadata.pageCount,
            progress: 100,
            scannedPageCount: stepResult.scannedPageNumbers.length,
            targetPageCount: stepResult.scannedPageNumbers.length,
          }))
        }

        return {
          pageNumbersToRender: [],
        }
      },
      id: jobId,
      onUpdate: (snapshot) => {
        if (snapshot.id !== activeJobIdRef.current) {
          return
        }

        if (snapshot.state === "failed" && completedStepDetection.current) {
          return
        }

        activeJobIdRef.current = snapshot.id
        setJobSnapshot(snapshot)
        if (snapshot.metadata) {
          setMetadata(snapshot.metadata)
        }
      },
      parseDocument,
      signal: controller.signal,
    })

    if (abortControllerRef.current === controller) {
      abortControllerRef.current = null
      activeJobIdRef.current = null
      setIsProcessing(false)
      const detectedStepResult = completedStepDetection.current
      if (result.state === "complete" || detectedStepResult) {
        setSelectedManualFile(file)
        if (detectedStepResult) {
          commitStepCalloutResult(detectedStepResult)
          setStepAnalysisProgress(createStepAnalysisProgress({
            currentPage: null,
            detectedCalloutCount: detectedStepResult.callouts.length,
            message: "Step callout detection complete.",
            pageCount: detectedStepResult.pageCount,
            progress: 100,
            scannedPageCount: detectedStepResult.scannedPageNumbers.length,
            targetPageCount: detectedStepResult.scannedPageNumbers.length,
          }))
        }
        if (result.state !== "complete") {
          setJobSnapshot(
            createRestoredCurrentAnalysisJobSnapshot({
              manualFile: file,
              metadata: result.metadata ?? metadata,
              partsListResult: currentPartsListResult,
              restoredJobSnapshot: result,
            }),
          )
        }
      } else {
        setStepAnalysisProgress(null)
        commitStepCalloutResult(null)
      }
    }
  }

  useEffect(() => {
    if (!stepCalloutResult || isProcessing || stepCalloutResult.detectorVersion === stepCalloutDetectorVersion) {
      return
    }

    const staleDetectorVersion = stepCalloutResult.detectorVersion
    let isCancelled = false
    queueMicrotask(() => {
      if (isCancelled) {
        return
      }

      const currentPartsListResult = partsListResultRef.current
      commitStepCalloutResult(null)
      setStepAnalysisProgress(null)
      if (currentPartsListResult && hasCurrentPartsListAnalysis(currentPartsListResult)) {
        if (selectedManualFile && jobSnapshot) {
          setSessionRecoveryNotice({
            kind: "step_version_mismatch",
            recoveryText: `Visible step analysis used ${staleDetectorVersion}. Current detector is ${stepCalloutDetectorVersion}. Refreshing step detection while keeping the current parts list.`,
            tone: "warning",
            statusText: "Refreshing step detection",
          })
          void startStepOnlyAnalysis(currentPartsListResult)
          return
        }

        setSessionRecoveryNotice({
          kind: "step_version_mismatch",
          recoveryText: `Saved step analysis used ${staleDetectorVersion}. Current detector is ${stepCalloutDetectorVersion}. Find steps before continuing.`,
          tone: "warning",
          statusText: "Step detection required",
        })
      }
    })

    return () => {
      isCancelled = true
    }
  }, [isProcessing, jobSnapshot, selectedManualFile, stepCalloutResult])

  function selectManual(file: File) {
    abortControllerRef.current?.abort()
    abortSessionImport()
    abortPartPreviewLookups()
    abortControllerRef.current = null
    pendingProgressTransferRef.current = null
    const queuedSnapshot = createQueuedPdfJobSnapshot(file.name)
    activeJobIdRef.current = queuedSnapshot.id
    void preloadPartsListOcrWorker()
    setSelectedManualFile(file)
    setManualDisplayName(file.name)
    setMetadata(null)
    setPartsAnalysisProgress(null)
    setStepAnalysisProgress(null)
    commitPartsListResult(null)
    commitStepCalloutResult(null)
    commitPartPreviewByKey(new Map())
    commitAttemptedPartPreviewKeys(new Set())
    setPreviewReadyPageNumbers(new Set())
    commitCheckedPartRowIds(new Set())
    setSessionRecoveryNotice(null)
    setJobSnapshot(queuedSnapshot)
    setIsProcessing(false)
  }

  async function downloadSession() {
    if (!selectedManualFile || !jobSnapshot) {
      return
    }

    try {
      const sessionFile = await createBaggingSessionFile({
        attemptedPartPreviewKeys,
        checkedRowIds: checkedPartRowIds,
        currentExtractorVersion: partsListExtractorVersion,
        jobSnapshot,
        manualFile: selectedManualFile,
        metadata,
        partPreviewByKey,
        partsListResult,
        stepCalloutMultipliers,
        stepCalloutResult,
      })

      downloadJsonFile(sessionFile, getBaggingSessionDownloadName(selectedManualName))
      setSessionRecoveryNotice(null)
    } catch {
      setSessionRecoveryNotice({
        kind: "error",
        recoveryText: "The session could not be downloaded. Try again after the current browser task finishes.",
        tone: "error",
        statusText: "Session save failed",
      })
    }
  }

  async function importSession(file: File) {
    const sessionImport = beginSessionImport()
    abortControllerRef.current?.abort()
    abortPartPreviewLookups()
    abortControllerRef.current = null
    activeJobIdRef.current = null
    setIsProcessing(false)
    setPartsAnalysisProgress(null)
    setStepAnalysisProgress(null)
    setPreviewReadyPageNumbers(new Set())

    try {
      const restoredSession = await restoreBaggingSessionFile(file)
      if (!isCurrentSessionImport(sessionImport.controller, sessionImport.runId)) {
        return
      }

      const restoredManualFile = restoredSession.manualFile
      const isCurrentAnalysis = isRestoredAnalysisCurrent(restoredSession, partsListExtractorVersion)
      const isCurrentStepAnalysis = isRestoredStepAnalysisCurrent(restoredSession, stepCalloutDetectorVersion)
      const restoredStepCalloutResult = isCurrentStepAnalysis ? restoredSession.stepCalloutResult : null
      const restoredJobSnapshot = restoredSession.jobSnapshot ?? createQueuedPdfJobSnapshot(restoredManualFile.name)
      const nextJobSnapshot = isCurrentAnalysis
        ? createRestoredCurrentAnalysisJobSnapshot({
            manualFile: restoredManualFile,
            metadata: restoredSession.metadata,
            partsListResult: restoredSession.partsListResult,
            restoredJobSnapshot,
          })
        : createQueuedPdfJobSnapshot(restoredManualFile.name)
      const pendingProgressTransfer = createPendingProgressTransfer(restoredSession.partsListResult, restoredSession.checkedRowIds)

      setSelectedManualFile(restoredManualFile)
      setManualDisplayName(restoredManualFile.name)
      setMetadata(restoredSession.metadata)
      setJobSnapshot(nextJobSnapshot)
      activeJobIdRef.current = nextJobSnapshot.id
      commitCheckedPartRowIds(restoredSession.checkedRowIds)

      if (isCurrentAnalysis) {
        pendingProgressTransferRef.current = null
        const rehydratedResult = restoredSession.partsListResult
          ? await normalizePartsListResult(
              restoredSession.partsListResult,
              restoredSession.partsListResult.normalization?.catalogueSnapshotId ?? null,
              sessionImport.controller.signal,
            )
          : restoredSession.partsListResult
        if (!isCurrentSessionImport(sessionImport.controller, sessionImport.runId)) {
          return
        }

        commitPartPreviewByKey(restoredSession.partPreviewByKey)
        commitAttemptedPartPreviewKeys(restoredSession.attemptedPartPreviewKeys)
        commitPartsListResult(rehydratedResult)
        commitStepCalloutResult(restoredStepCalloutResult)
        setStepCalloutMultipliers(
          pruneStepCalloutMultipliers(restoredSession.stepCalloutMultipliers, restoredStepCalloutResult),
        )
        setPreviewReadyPageNumbers(new Set())
        setSessionRecoveryNotice(
          restoredSession.savedStepCalloutDetectorVersion && !isCurrentStepAnalysis
            ? {
                kind: "step_version_mismatch",
                recoveryText: `Saved step analysis used ${restoredSession.savedStepCalloutDetectorVersion ?? "an unknown detector"}. Current detector is ${stepCalloutDetectorVersion}. Find steps before continuing.`,
                tone: "warning",
                statusText: "Step detection required",
              }
            : null,
        )
        return
      }

      pendingProgressTransferRef.current = pendingProgressTransfer
      commitPartsListResult(null)
      commitStepCalloutResult(null)
      commitPartPreviewByKey(new Map())
      commitAttemptedPartPreviewKeys(new Set())
      setPreviewReadyPageNumbers(new Set())
      setSessionRecoveryNotice({
        kind: "version_mismatch",
        recoveryText: `Saved analysis used ${restoredSession.savedExtractorVersion ?? "an unknown extractor"}. Current extractor is ${partsListExtractorVersion}. Recalculate before continuing.`,
        tone: "error",
        statusText: "Recalculate required",
      })
    } catch {
      if (!isCurrentSessionImport(sessionImport.controller, sessionImport.runId)) {
        return
      }

      pendingProgressTransferRef.current = null
      commitStepCalloutResult(null)
      setSessionRecoveryNotice({
        kind: "error",
        recoveryText: "Choose a valid Bag It session file.",
        tone: "error",
        statusText: "Session import failed",
      })
    } finally {
      if (sessionImportControllerRef.current === sessionImport.controller) {
        sessionImportControllerRef.current = null
      }
    }
  }

  async function purgePrivateArtifacts() {
    abortControllerRef.current?.abort()
    abortSessionImport()
    abortPartPreviewLookups()
    abortControllerRef.current = null
    pendingProgressTransferRef.current = null

    setJobSnapshot(null)
    activeJobIdRef.current = null
    setMetadata(null)
    setPartsAnalysisProgress(null)
    setStepAnalysisProgress(null)
    commitPartsListResult(null)
    commitStepCalloutResult(null)
    commitPartPreviewByKey(new Map())
    commitAttemptedPartPreviewKeys(new Set())
    setPreviewReadyPageNumbers(new Set())
    commitCheckedPartRowIds(new Set())
    setSessionRecoveryNotice(null)
    setManualDisplayName(null)
    setSelectedManualFile(null)
    setIsProcessing(false)
  }

  async function normalizePartsListResult(
    result: PartsListPdfExtractionResult,
    catalogueSnapshotId: string | null,
    signal?: AbortSignal,
  ): Promise<PartsListPdfExtractionResult> {
    const normalization = await fetchPartsListNormalization(result.rows, { signal, snapshotId: catalogueSnapshotId })

    return normalization ? { ...result, normalization } : result
  }

  function publishNormalizedPartsListResult(
    normalizedResult: PartsListPdfExtractionResult,
    { isFinal }: { isFinal: boolean },
  ): PartsListPublicationTransfer {
    const currentResult = partsListResultRef.current
    const currentCheckedRowIds = checkedPartRowIdsRef.current
    const pendingProgressTransfer = pendingProgressTransferRef.current
    const normalizedRowIds = new Set(normalizedResult.rows.map((row) => getPartsListRowId(row)))
    const nextCheckedRowIds = new Set<string>()
    let visibleTransfer: PartsListProgressTransferResult | null = null
    let pendingTransfer: PartsListProgressTransferResult | null = null

    if (currentResult && currentCheckedRowIds.size > 0) {
      visibleTransfer = createPartsListProgressTransfer({
        nextResult: normalizedResult,
        previous: {
          checkedRowIds: currentCheckedRowIds,
          result: currentResult,
        },
      })
      addCheckedRowIds(nextCheckedRowIds, visibleTransfer.checkedRowIds)

      if (!isFinal) {
        for (const droppedRow of visibleTransfer.droppedRows) {
          nextCheckedRowIds.add(droppedRow.previousRowId)
        }
      }
    } else if (!pendingProgressTransfer) {
      addCheckedRowIds(nextCheckedRowIds, currentCheckedRowIds)
    }

    if (pendingProgressTransfer && pendingProgressTransfer.checkedRowIds.size > 0) {
      pendingTransfer = createPartsListProgressTransfer({
        nextResult: normalizedResult,
        previous: pendingProgressTransfer,
      })
      addCheckedRowIds(nextCheckedRowIds, pendingTransfer.checkedRowIds)

      const remainingPendingRowIds = new Set(pendingTransfer.droppedRows.map((row) => row.previousRowId))
      for (const previousRowId of pendingProgressTransfer.checkedRowIds) {
        if (!remainingPendingRowIds.has(previousRowId) && !normalizedRowIds.has(previousRowId)) {
          nextCheckedRowIds.delete(previousRowId)
        }
      }

      if (isFinal || remainingPendingRowIds.size === 0) {
        pendingProgressTransferRef.current = null
      } else {
        pendingProgressTransferRef.current = {
          checkedRowIds: remainingPendingRowIds,
          result: pendingProgressTransfer.result,
        }
        addCheckedRowIds(nextCheckedRowIds, remainingPendingRowIds)
      }
    } else if (isFinal) {
      pendingProgressTransferRef.current = null
    }

    commitPartsListResult(normalizedResult)
    commitCheckedPartRowIds(nextCheckedRowIds)

    return {
      pending: pendingTransfer,
      visible: visibleTransfer,
    }
  }

  async function publishPartsListResult(
    result: PartsListPdfExtractionResult,
    catalogueSnapshotId: string | null,
    signal?: AbortSignal,
  ) {
    const publicationId = normalizationPublicationIdRef.current + 1
    normalizationPublicationIdRef.current = publicationId
    const normalizedResult = await normalizePartsListResult(result, catalogueSnapshotId, signal)
    if (signal?.aborted || publicationId !== normalizationPublicationIdRef.current) {
      return
    }

    const publicationTransfer = publishNormalizedPartsListResult(normalizedResult, { isFinal: false })
    const progressTransferNotice = createPublicationTransferNotice(publicationTransfer, false)
    if (progressTransferNotice) {
      setSessionRecoveryNotice(progressTransferNotice)
    }
  }

  return (
    <BaggingPageFrame>
      {!hasStartedAnalysis ? (
        <BaggingOverview
          badge={mockOverviewContent.badge}
          description={mockOverviewContent.description}
          items={mockOverviewContent.items}
          title={mockOverviewContent.title}
        />
      ) : null}

      <Stack
        direction={{ base: "column", lg: "row" }}
        gap={{ base: "5", lg: "6" }}
        align="stretch"
        flex="1"
        minH={{ lg: "bagging.zero" }}
      >
        <Stack
          gap="4"
          w={{ lg: "bagging.sidebar" }}
          flexShrink={0}
          maxH={{ lg: "full" }}
          minH={{ lg: "bagging.zero" }}
          overflowY={{ base: "visible", lg: "auto" }}
          pr={{ lg: "1" }}
        >
          <ManualFlowCard
            canPurge={canPurge}
            canStart={Boolean(selectedManualFile && jobSnapshot) && !isProcessing}
            isRunning={isProcessing}
            manualName={selectedManualName}
            onManualSelected={selectManual}
            onPurge={purgePrivateArtifacts}
            onStart={startAnalysis}
            recoveryText={sessionRecoveryNotice?.recoveryText ?? getRecoveryText(jobSnapshot, Boolean(selectedManualFile))}
            recoveryTone={sessionRecoveryNotice?.tone}
            startLabel={startLabel}
            statusText={sessionRecoveryNotice?.statusText ?? statusText}
          />
          <ProcessingStatusCard
            steps={processingProgressSteps}
          />
          <SessionControlsCard
            canDownloadSession={canDownloadSession}
            isRunning={isProcessing}
            onDownloadSession={downloadSession}
            onSessionSelected={importSession}
          />
          {partsListResult?.normalization?.attentionRows.length ? (
            <NormalizationAttentionList rows={partsListResult.normalization.attentionRows} />
          ) : null}
        </Stack>

        <Box display="flex" flex="1" minW="bagging.zero" minH={{ lg: "bagging.zero" }}>
          <OutputTabs
            parts={
              partsListResult ? (
                <ExtractedPartsPanel
                  checkedRowIds={checkedPartRowIds}
                  isPartial={isProcessing && jobState !== "complete"}
                  onCheckedRowIdsChange={commitCheckedPartRowIds}
                  partPreviewByKey={partPreviewByKey}
                  result={partsListResult}
                />
              ) : (
                <PendingOutputPanel
                  icon={<Boxes size={18} />}
                  message={metadataSummary ?? "Part rows will appear after parts list extraction is available."}
                />
              )
            }
            bags={
              visibleStepCalloutResult ? (
                <StepCalloutsPanel
                  calloutMultipliers={stepCalloutMultipliers}
                  inventoryPartCount={inventoryPartCount}
                  result={visibleStepCalloutResult}
                />
              ) : (
                <PendingOutputPanel
                  icon={<PackageCheck size={18} />}
                  message={
                    hasStaleStepCalloutAnalysis
                      ? "Step callout analysis is stale. Find steps to rerun step analysis before draft bags can be shown."
                      : partsListResult
                      ? "Draft bags will appear after step callout analysis is available."
                      : "Bag assignments and packing checklists will appear after recognition and bagging are available."
                  }
                />
              )
            }
            debug={partsListResult || visibleStepCalloutResult ? (
              <Stack gap="4" flex="1" minW="bagging.zero" maxW="full" overflowY={{ base: "visible", lg: "auto" }}>
                {visibleStepCalloutResult ? (
                  <StepCalloutDebugPanel
                    calloutMultipliers={stepCalloutMultipliers}
                    inventoryPartCount={inventoryPartCount}
                    result={visibleStepCalloutResult}
                  />
                ) : null}
                {partsListResult ? (
                  <PartsListDebugPanel
                    pageRenders={jobSnapshot?.pageRenders ?? []}
                    result={partsListResult}
                  />
                ) : null}
              </Stack>
            ) : undefined}
            matchingDebug={
              visibleStepCalloutResult ? (
                <StepCalloutMatchingDebugPanel
                  calloutMultipliers={stepCalloutMultipliers}
                  inventoryPartCount={inventoryPartCount}
                  loadPageRenders={loadStepDebugPageRenders}
                  onCalloutMultiplierChange={updateStepCalloutMultiplier}
                  pageRenders={jobSnapshot?.pageRenders ?? []}
                  result={visibleStepCalloutResult}
                />
              ) : (
                <PendingOutputPanel
                  icon={<Search size={18} />}
                  message={
                    hasStaleStepCalloutAnalysis
                      ? "Step callout analysis is stale. Find steps to rerun step analysis before build steps can be shown."
                      : partsListResult
                        ? "Build steps will appear after step callout analysis is available."
                        : "Build steps will appear after recognition is available."
                  }
                />
              )
            }
          />
        </Box>
      </Stack>
    </BaggingPageFrame>
  )
}

function getPartsListDebugPageNumbers(result: PartsListPdfExtractionResult) {
  const pageNumbers = new Set<number>()
  const attentionPageNumbers = new Set([
    ...result.lowConfidenceRows.map((row) => row.sourcePage),
    ...result.rows.filter((row) => !row.color || !row.part).map((row) => row.sourcePage),
  ])

  for (const pageNumber of attentionPageNumbers) {
    pageNumbers.add(pageNumber)
  }

  for (const candidate of sortCandidatesBySourcePage(result.candidates)) {
    pageNumbers.add(candidate.pageNumber)
  }

  return [...pageNumbers].sort((left, right) => left - right)
}

function sortCandidatesBySourcePage(candidates: PartsListPdfExtractionResult["candidates"]) {
  return [...candidates].sort((left, right) => left.pageNumber - right.pageNumber)
}

type LocalValidationOcrOptions = Pick<
  PartsListPdfExtractionOptions,
  "ocrConcurrency" | "ocrSplitCandidateProcessing"
>

function getLocalValidationOcrOptions(): Partial<LocalValidationOcrOptions> {
  if (typeof window === "undefined") {
    return {}
  }

  const searchProfile = getLocalValidationOcrProfile(new URLSearchParams(window.location.search).get("bagItOcrProfile"))
  if (searchProfile) {
    window.sessionStorage.setItem("bagItOcrProfile", searchProfile)
  }

  const profile = searchProfile ?? getLocalValidationOcrProfile(window.sessionStorage.getItem("bagItOcrProfile"))
  switch (profile) {
    case "baseline":
      return {
        ocrConcurrency: 1,
        ocrSplitCandidateProcessing: false,
      }
    case "split3":
      return {
        ocrConcurrency: 3,
        ocrSplitCandidateProcessing: true,
      }
    case "split4":
      return {
        ocrConcurrency: 4,
        ocrSplitCandidateProcessing: true,
      }
    default:
      return {}
  }
}

function getLocalValidationOcrProfile(profile: string | null) {
  return profile === "baseline" || profile === "split3" || profile === "split4" ? profile : null
}

function downloadJsonFile(contents: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(contents)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function getPartPreviewRequests(
  result: PartsListPdfExtractionResult,
  readyPageNumbers: ReadonlySet<number> | null = null,
) {
  return getPartPreviewRequestGroupsByPage(result, readyPageNumbers).flatMap((group) => group.requests)
}

function getPartPreviewRequestGroupsByPage(
  result: PartsListPdfExtractionResult,
  readyPageNumbers: ReadonlySet<number> | null = null,
) {
  const normalizedRowById = new Map(result.normalization?.rows.map((row) => [row.rowId, row] as const) ?? [])
  const previewsByPageNumber = new Map<number, Map<string, PartsListPartPreviewRequest>>()

  for (const row of result.rows) {
    if (readyPageNumbers && !readyPageNumbers.has(row.sourcePage)) {
      continue
    }

    const normalizedRow = normalizedRowById.get(getPartsListRowId(row))
    const color = normalizedRow?.color ?? row.color
    const previews = previewsByPageNumber.get(row.sourcePage) ?? new Map<string, PartsListPartPreviewRequest>()
    previewsByPageNumber.set(row.sourcePage, previews)

    for (const partNumber of getPartPreviewPartNumbers(row, normalizedRow?.part ?? null)) {
      if (color?.id) {
        const colorRequest = {
          colorId: color.id,
          partNumber,
        }
        previews.set(getPartsListPartPreviewKey(colorRequest), colorRequest)
      }

      const genericRequest = { partNumber }
      previews.set(getPartsListPartPreviewKey(genericRequest), genericRequest)
    }
  }

  return [...previewsByPageNumber.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([sourcePage, previews]) => ({
      requests: [...previews.values()],
      sourcePage,
    }))
    .filter((group) => group.requests.length > 0)
}

function getPartsListSourcePageNumbers(result: PartsListPdfExtractionResult) {
  return new Set(result.rows.map((row) => row.sourcePage))
}

function getPartsListStepScanExcludedPageNumbers(result: PartsListPdfExtractionResult) {
  return new Set([
    ...result.rows.map((row) => row.sourcePage),
    ...result.candidates.map((candidate) => candidate.pageNumber),
  ])
}

function getStepCalloutTargetPageCount(pageCount: number, excludedPageNumbers: ReadonlySet<number>) {
  return getInitialStepCalloutPageNumbers(pageCount, excludedPageNumbers, defaultStepCalloutPageLimit).length
}

function getPartPreviewPartNumbers(
  row: PartsListPdfExtractionResult["rows"][number],
  normalizedPart: PartsListPdfExtractionResult["rows"][number]["part"],
) {
  const partNumbers = new Set<string>()
  if (shouldPreferManualPrintedPartPreview(row, normalizedPart)) {
    partNumbers.add(row.partNumber)
  }
  if (normalizedPart?.cataloguePartNumber) {
    partNumbers.add(normalizedPart.cataloguePartNumber)
  }
  if (row.part?.cataloguePartNumber) {
    partNumbers.add(row.part.cataloguePartNumber)
  }
  partNumbers.add(row.partNumber)

  return [...partNumbers]
}

function shouldPreferManualPrintedPartPreview(
  row: PartsListPdfExtractionResult["rows"][number],
  normalizedPart: PartsListPdfExtractionResult["rows"][number]["part"],
) {
  return row.partNumber !== (normalizedPart?.cataloguePartNumber ?? row.part?.cataloguePartNumber) &&
    isPrintedPartNumber(row.partNumber)
}

function isPrintedPartNumber(partNumber: string) {
  return /^\d+(?:[a-z]|c\d{2})?(?:p|pb|pr|px)\d+$/i.test(partNumber.trim())
}

function getUnresolvedPreviewRequests(
  previewRequests: readonly PartsListPartPreviewRequest[],
  partPreviewByKey: ReadonlyMap<string, PartsListPartPreview>,
  attemptedPartPreviewKeys: ReadonlySet<string>,
  inFlightPartPreviewKeys: ReadonlySet<string> = new Set(),
) {
  return previewRequests.filter((request) => {
    const key = getPartsListPartPreviewKey(request)

    return !partPreviewByKey.has(key) && !attemptedPartPreviewKeys.has(key) && !inFlightPartPreviewKeys.has(key)
  })
}

function getReadyPreviewRequestCount(
  previewRequests: readonly PartsListPartPreviewRequest[],
  partPreviewByKey: ReadonlyMap<string, PartsListPartPreview>,
) {
  return previewRequests.filter((request) => partPreviewByKey.has(getPartsListPartPreviewKey(request))).length
}

function getCatalogueReconciliationProgress(
  partsListResult: PartsListPdfExtractionResult | null,
  partPreviewByKey: ReadonlyMap<string, PartsListPartPreview>,
  attemptedPartPreviewKeys: ReadonlySet<string>,
  canFetchPreviews: boolean,
  readyPageNumbers: ReadonlySet<number> | null = null,
) {
  if (!partsListResult) {
    return null
  }

  const normalization = partsListResult.normalization
  const allPreviewRequests = getPartPreviewRequests(partsListResult)
  const fetchablePreviewRequests = readyPageNumbers
    ? getPartPreviewRequests(partsListResult, readyPageNumbers)
    : allPreviewRequests
  const previewRequests = readyPageNumbers
    ? fetchablePreviewRequests
    : allPreviewRequests
  const totalCount = previewRequests.length
  if (totalCount === 0) {
    if (allPreviewRequests.length > 0) {
      return createCatalogueReconciliationProgress(
        normalization
          ? `${formatNormalizationCoverage(normalization)} Waiting for page-ready thumbnails.`
          : `Waiting for page-ready thumbnails.`,
        normalization ? getNormalizationProgress(normalization) : 0,
        0,
        0,
      )
    }

    return createCatalogueReconciliationProgress(getNormalizationOnlyMessage(partsListResult), 100, 0, 0)
  }

  const readyCount = getReadyPreviewRequestCount(previewRequests, partPreviewByKey)
  if (!canFetchPreviews) {
    return createCatalogueReconciliationProgress(
      normalization
        ? `${formatNormalizationCoverage(normalization)} Waiting for thumbnails.`
        : `Waiting for parts extraction before reconciling ${formatCatalogueRecordCount(totalCount)}.`,
      normalization ? getNormalizationProgress(normalization) : 0,
      readyCount,
      totalCount,
    )
  }

  const unresolvedPreviews = getUnresolvedPreviewRequests(previewRequests, partPreviewByKey, attemptedPartPreviewKeys)
  if (unresolvedPreviews.length === 0) {
    return createCatalogueReconciliationProgress(
      normalization
        ? `${formatNormalizationCoverage(normalization)} ${readyCount} of ${totalCount} thumbnails ready.`
        : `Catalogue reconciliation complete: ${readyCount} of ${totalCount} records ready.`,
      100,
      readyCount,
      totalCount,
    )
  }

  return createCatalogueReconciliationProgress(
    normalization
      ? `${formatNormalizationCoverage(normalization)} Loading ${formatCatalogueRecordCount(unresolvedPreviews.length)}.`
      : `Reconciling ${formatCatalogueRecordCount(unresolvedPreviews.length)}.`,
    normalization
      ? getCatalogueReconciliationInFlightProgress(readyCount, totalCount, getNormalizationProgress(normalization))
      : getCatalogueReconciliationInFlightProgress(readyCount, totalCount),
    readyCount,
    totalCount,
  )
}

function createPartsAnalysisProgress(
  message: string,
  progress: number,
  source?: PartsListPdfExtractionProgress,
): PartsAnalysisProgress {
  return {
    ...(source
      ? {
          currentPage: source.currentPage,
          detectedPageCount: source.detectedPageCount,
          pageCount: source.pageCount,
          phase: source.phase,
          previewReadyPageNumbers: source.previewReadyPageNumbers,
          rowCount: source.rowCount,
          scannedPageCount: source.scannedPageCount,
        }
      : {}),
    message,
    progress,
    updatedAt: Date.now(),
  }
}

function createStepAnalysisProgress(source: StepCalloutDetectionProgress): StepAnalysisProgress {
  return {
    currentPage: source.currentPage,
    detectedCalloutCount: source.detectedCalloutCount,
    message: source.message,
    pageCount: source.pageCount,
    progress: source.progress,
    scannedPageCount: source.scannedPageCount,
    targetPageCount: source.targetPageCount,
    updatedAt: Date.now(),
  }
}

function createCatalogueReconciliationProgress(
  message: string,
  progress: number,
  readyCount: number,
  totalCount: number,
): CatalogueReconciliationProgress {
  return {
    message,
    progress,
    readyCount,
    totalCount,
  }
}

function getCatalogueReconciliationInFlightProgress(
  readyCount: number,
  totalCount: number,
  baseProgress = 10,
) {
  if (totalCount === 0) {
    return 100
  }

  return Math.max(baseProgress, Math.min(95, baseProgress + Math.round((readyCount / totalCount) * (95 - baseProgress))))
}

function getNormalizationOnlyMessage(result: PartsListPdfExtractionResult) {
  if (result.normalization) {
    return formatNormalizationCoverage(result.normalization)
  }

  return "No catalogue records to reconcile."
}

function getPartsListTotalQuantity(result: PartsListPdfExtractionResult | null) {
  if (!result) {
    return null
  }

  return result.normalization?.totalQuantity ?? result.rows.reduce((sum, row) => sum + row.quantity, 0)
}

function setStepCalloutMultiplier(
  current: StepCalloutMultiplierMap,
  calloutId: string,
  multiplier: number,
): StepCalloutMultiplierMap {
  const nextMultiplier = normalizeStepCalloutMultiplier(multiplier)
  const currentMultiplier = normalizeStepCalloutMultiplier(current[calloutId])
  if (nextMultiplier === currentMultiplier) {
    return current
  }

  const next = { ...current }
  if (nextMultiplier <= 1) {
    delete next[calloutId]
  } else {
    next[calloutId] = nextMultiplier
  }

  return next
}

function pruneStepCalloutMultipliers(
  current: StepCalloutMultiplierMap,
  result: StepCalloutDetectionResult | null,
): StepCalloutMultiplierMap {
  const entries = Object.entries(current)
  if (entries.length === 0) {
    return current
  }
  if (!result) {
    return {}
  }

  const calloutIds = new Set(result.callouts.map((callout) => callout.id))
  const next: Record<string, number> = {}
  let changed = false

  for (const [calloutId, multiplier] of entries) {
    const normalizedMultiplier = normalizeStepCalloutMultiplier(multiplier)
    if (!calloutIds.has(calloutId) || normalizedMultiplier <= 1) {
      changed = true
      continue
    }

    next[calloutId] = normalizedMultiplier
    if (normalizedMultiplier !== multiplier) {
      changed = true
    }
  }

  return changed || Object.keys(next).length !== entries.length ? next : current
}

function normalizeStepCalloutMultiplier(multiplier: number | undefined) {
  if (multiplier == null || !Number.isFinite(multiplier)) {
    return 1
  }

  return Math.max(1, Math.floor(multiplier))
}

function getNormalizationProgress(normalization: NonNullable<PartsListPdfExtractionResult["normalization"]>) {
  if (normalization.totalQuantity <= 0) {
    return 100
  }

  return Math.max(10, Math.min(90, Math.round((normalization.resolvedQuantity / normalization.totalQuantity) * 90)))
}

function formatNormalizationCoverage(normalization: NonNullable<PartsListPdfExtractionResult["normalization"]>) {
  if (normalization.totalQuantity <= 0) {
    return "No normalized catalogue quantity."
  }

  const percent = Math.round((normalization.resolvedQuantity / normalization.totalQuantity) * 100)
  const attentionText = normalization.attentionRows.length > 0
    ? ` ${normalization.attentionRows.length} rows need attention.`
    : ""

  return `${percent}% of extracted quantity normalized.${attentionText}`
}

function formatCatalogueRecordCount(count: number) {
  return `${count} catalogue ${count === 1 ? "record" : "records"}`
}

function canFetchPartPreviews(
  jobState: PdfIntakeJobState,
  partsAnalysisProgress: PartsAnalysisProgress | null,
  previewReadyPageNumbers: ReadonlySet<number>,
) {
  return (
    previewReadyPageNumbers.size > 0 ||
    jobState === "complete" ||
    jobState === "rendering_pages" ||
    (partsAnalysisProgress?.progress ?? 0) >= 100
  )
}

function canUseBrowserPdfParser() {
  return typeof Worker !== "undefined" && !navigator.userAgent.toLowerCase().includes("jsdom")
}

function hasCurrentPartsListAnalysis(result: PartsListPdfExtractionResult | null) {
  return Boolean(
    result &&
      result.extractorVersion === partsListExtractorVersion &&
      result.normalization,
  )
}

function hasCurrentStepCalloutResult(result: StepCalloutDetectionResult | null) {
  return result?.detectorVersion === stepCalloutDetectorVersion
}

function createRestoredCurrentAnalysisJobSnapshot({
  manualFile,
  metadata,
  partsListResult,
  restoredJobSnapshot,
}: {
  manualFile: File
  metadata: PdfIntakeMetadata | null
  partsListResult: PartsListPdfExtractionResult | null
  restoredJobSnapshot: PdfIntakeJobSnapshot
}): PdfIntakeJobSnapshot {
  if (restoredJobSnapshot.state === "complete") {
    return restoredJobSnapshot
  }

  const timestamp = restoredJobSnapshot.updatedAt || Date.now()
  const fallbackSnapshot = createQueuedPdfJobSnapshot(manualFile.name, () => timestamp)
  const restoredMetadata =
    metadata ??
    restoredJobSnapshot.metadata ??
    createRestoredCurrentAnalysisMetadata(manualFile, partsListResult)

  return {
    ...fallbackSnapshot,
    errorMessage: null,
    id: restoredJobSnapshot.id || fallbackSnapshot.id,
    metadata: restoredMetadata,
    pageRenderProgress: 100,
    pageRenders: restoredJobSnapshot.pageRenders,
    progress: getPdfJobProgress("complete"),
    sourceBytesPurged: restoredJobSnapshot.sourceBytesPurged,
    startedAt: restoredJobSnapshot.startedAt || timestamp,
    state: "complete",
    updatedAt: timestamp,
  }
}

function createRestoredCurrentAnalysisMetadata(
  manualFile: File,
  partsListResult: PartsListPdfExtractionResult | null,
): PdfIntakeMetadata {
  const pageCountFromInventory = partsListResult
    ? Math.max(
        0,
        ...partsListResult.candidates.map((candidate) => candidate.pageNumber),
        ...partsListResult.rows.map((row) => row.sourcePage),
      )
    : 0

  return {
    fileName: manualFile.name,
    fingerprint: "",
    pageCount: pageCountFromInventory,
    readMode: "fallback",
    sizeBytes: manualFile.size,
  }
}

function hasAnalysisStarted({
  isProcessing,
  jobSnapshot,
  metadata,
  partsListResult,
}: {
  isProcessing: boolean
  jobSnapshot: PdfIntakeJobSnapshot | null
  metadata: PdfIntakeMetadata | null
  partsListResult: PartsListPdfExtractionResult | null
}) {
  return (
    isProcessing ||
    Boolean(metadata) ||
    Boolean(partsListResult) ||
    (jobSnapshot != null && jobSnapshot.state !== "queued" && jobSnapshot.state !== "expired" && jobSnapshot.state !== "purged")
  )
}

function getProcessingProgressSteps({
  analysisHeartbeat,
  hasCurrentPartsAnalysis,
  isProcessing,
  jobState,
  metadata,
  partsAnalysisProgress,
  partsListResult,
  previewReadyPageNumbers,
  stepAnalysisProgress,
  stepCalloutResult,
}: {
  analysisHeartbeat: number
  hasCurrentPartsAnalysis: boolean
  isProcessing: boolean
  jobState: PdfIntakeJobState
  metadata: PdfIntakeMetadata | null
  partsAnalysisProgress: PartsAnalysisProgress | null
  partsListResult: PartsListPdfExtractionResult | null
  previewReadyPageNumbers: ReadonlySet<number>
  stepAnalysisProgress: StepAnalysisProgress | null
  stepCalloutResult: StepCalloutDetectionResult | null
}): ProcessingStatusStep[] {
  return [
    ...getInventoryProgressSteps({
      analysisHeartbeat,
      isProcessing,
      jobState,
      metadata,
      partsAnalysisProgress,
      partsListResult,
      previewReadyPageNumbers,
    }),
    getStepCalloutProgressStep({
      hasCurrentPartsAnalysis,
      isProcessing,
      stepAnalysisProgress,
      stepCalloutResult,
    }),
  ]
}

function getInventoryProgressSteps({
  analysisHeartbeat,
  isProcessing,
  jobState,
  metadata,
  partsAnalysisProgress,
  partsListResult,
  previewReadyPageNumbers,
}: {
  analysisHeartbeat: number
  isProcessing: boolean
  jobState: PdfIntakeJobState
  metadata: PdfIntakeMetadata | null
  partsAnalysisProgress: PartsAnalysisProgress | null
  partsListResult: PartsListPdfExtractionResult | null
  previewReadyPageNumbers: ReadonlySet<number>
}): ProcessingStatusStep[] {
  const findingProgress = getFindingInventoryProgress(jobState, partsAnalysisProgress, partsListResult)
  const analyzedPageCount = getAnalyzedInventoryPageCount(
    jobState,
    partsAnalysisProgress,
    partsListResult,
    previewReadyPageNumbers,
  )
  const inventoryPageCount = getInventoryPageCount(partsAnalysisProgress, partsListResult, analyzedPageCount)
  const analysisProgress = getInventoryPageAnalysisProgress(jobState, analyzedPageCount, inventoryPageCount)

  return [
    {
      detail: getFindingInventoryDetail(jobState, metadata, partsAnalysisProgress, partsListResult),
      label: "Finding inventory pages",
      progress: findingProgress,
      state: getFindingInventoryState(jobState, findingProgress),
    },
    {
      activity: getInventoryAnalysisActivity(jobState, partsAnalysisProgress, isProcessing, analysisHeartbeat),
      detail: getInventoryAnalysisDetail(
        jobState,
        partsAnalysisProgress,
        partsListResult,
        analyzedPageCount,
        inventoryPageCount,
      ),
      label: "Analysis per page",
      progress: analysisProgress,
      state: getInventoryAnalysisState(jobState, findingProgress, analysisProgress, isProcessing),
    },
  ]
}

function getStepCalloutProgressStep({
  hasCurrentPartsAnalysis,
  isProcessing,
  stepAnalysisProgress,
  stepCalloutResult,
}: {
  hasCurrentPartsAnalysis: boolean
  isProcessing: boolean
  stepAnalysisProgress: StepAnalysisProgress | null
  stepCalloutResult: StepCalloutDetectionResult | null
}): ProcessingStatusStep {
  if (stepCalloutResult) {
    const partTypeCount = stepCalloutResult.callouts.reduce((sum, callout) => sum + callout.partItems.length, 0)
    return {
      detail: `${stepCalloutResult.callouts.length} callouts and ${partTypeCount} part types from ${stepCalloutResult.scannedPageNumbers.length} pages.`,
      label: "Step callouts",
      progress: 100,
      state: "complete",
    }
  }

  if (stepAnalysisProgress && isProcessing) {
    return {
      activity: stepAnalysisProgress.currentPage
        ? `Scanning page ${stepAnalysisProgress.currentPage}.`
        : stepAnalysisProgress.message,
      detail: `${stepAnalysisProgress.detectedCalloutCount} callouts detected across ${stepAnalysisProgress.scannedPageCount} of ${stepAnalysisProgress.targetPageCount} pages.`,
      label: "Step callouts",
      progress: stepAnalysisProgress.progress,
      state: "active",
    }
  }

  return {
    detail: hasCurrentPartsAnalysis
      ? "Ready to scan the non-inventory manual pages."
      : "Waiting for current part analysis.",
    label: "Step callouts",
    progress: 0,
    state: "pending",
  }
}

function getManualStatusText(
  snapshot: PdfIntakeJobSnapshot | null,
  partsListResult: PartsListPdfExtractionResult | null,
  catalogueReconciliationProgress: CatalogueReconciliationProgress | null,
) {
  if (!snapshot) {
    return null
  }

  if (
    snapshot.state === "complete" &&
    partsListResult?.rows.length &&
    (!catalogueReconciliationProgress || catalogueReconciliationProgress.progress < 100)
  ) {
    return "Reconciling catalogue"
  }

  return getPdfJobStateLabel(snapshot.state, snapshot.errorMessage)
}

function getFindingInventoryProgress(
  jobState: PdfIntakeJobState,
  partsAnalysisProgress: PartsAnalysisProgress | null,
  partsListResult: PartsListPdfExtractionResult | null,
) {
  if (isFailedProcessingState(jobState)) {
    return 0
  }

  if (
    jobState === "complete" ||
    jobState === "rendering_pages" ||
    partsListResult?.candidates.length ||
    ((partsAnalysisProgress?.detectedPageCount ?? 0) > 0 && (partsAnalysisProgress?.progress ?? 0) >= 70)
  ) {
    return 100
  }

  if (jobState === "validating") {
    return 10
  }

  if (!partsAnalysisProgress) {
    return 0
  }

  if (partsAnalysisProgress.message === catalogueLoadingMessage) {
    return 5
  }

  if (partsAnalysisProgress.phase === "native_text") {
    return 20
  }

  if (partsAnalysisProgress.pageCount && partsAnalysisProgress.scannedPageCount) {
    return Math.min(
      95,
      Math.max(25, Math.round((partsAnalysisProgress.scannedPageCount / partsAnalysisProgress.pageCount) * 100)),
    )
  }

  if (jobState === "extracting_metadata") {
    return 25
  }

  return 0
}

function getFindingInventoryState(
  jobState: PdfIntakeJobState,
  progress: number,
): ProcessingStatusStep["state"] {
  if (jobState === "failed") {
    return "failed"
  }

  if (progress >= 100) {
    return "complete"
  }

  if (jobState === "validating" || jobState === "extracting_metadata") {
    return "active"
  }

  return "pending"
}

function getFindingInventoryDetail(
  jobState: PdfIntakeJobState,
  metadata: PdfIntakeMetadata | null,
  partsAnalysisProgress: PartsAnalysisProgress | null,
  partsListResult: PartsListPdfExtractionResult | null,
) {
  const detectedPageCount = partsListResult?.candidates.length ?? partsAnalysisProgress?.detectedPageCount ?? 0
  if (detectedPageCount > 0) {
    if (!partsListResult?.candidates.length && (partsAnalysisProgress?.progress ?? 0) < 70) {
      return `Found at least ${formatPageCount(detectedPageCount)}; still scanning for the first inventory page.`
    }

    return `Found ${formatPageCount(detectedPageCount)}.`
  }

  if (partsAnalysisProgress?.message === catalogueLoadingMessage) {
    return "Preparing local catalogue data."
  }

  if (jobState === "validating") {
    return "Checking the uploaded PDF."
  }

  if (jobState === "extracting_metadata") {
    return metadata ? `Reading ${metadata.pageCount} pages for inventory evidence.` : "Reading manual metadata."
  }

  return null
}

function getAnalyzedInventoryPageCount(
  jobState: PdfIntakeJobState,
  partsAnalysisProgress: PartsAnalysisProgress | null,
  partsListResult: PartsListPdfExtractionResult | null,
  previewReadyPageNumbers: ReadonlySet<number>,
) {
  if ((jobState === "complete" || jobState === "rendering_pages" || !partsAnalysisProgress) && partsListResult) {
    return getPartsListSourcePageNumbers(partsListResult).size
  }

  return previewReadyPageNumbers.size
}

function getInventoryPageCount(
  partsAnalysisProgress: PartsAnalysisProgress | null,
  partsListResult: PartsListPdfExtractionResult | null,
  analyzedPageCount: number,
) {
  return Math.max(
    analyzedPageCount,
    partsListResult?.candidates.length ?? 0,
    partsAnalysisProgress?.detectedPageCount ?? 0,
  )
}

function getInventoryPageAnalysisProgress(
  jobState: PdfIntakeJobState,
  analyzedPageCount: number,
  inventoryPageCount: number,
) {
  if (isFailedProcessingState(jobState) || inventoryPageCount <= 0) {
    return 0
  }

  if (jobState === "complete" || jobState === "rendering_pages") {
    return 100
  }

  return Math.min(100, Math.round((analyzedPageCount / inventoryPageCount) * 100))
}

function getInventoryAnalysisState(
  jobState: PdfIntakeJobState,
  findingProgress: number,
  analysisProgress: number,
  isProcessing: boolean,
): ProcessingStatusStep["state"] {
  if (jobState === "failed") {
    return "failed"
  }

  if (analysisProgress >= 100) {
    return "complete"
  }

  if (isProcessing && findingProgress >= 100) {
    return "active"
  }

  return "pending"
}

function getInventoryAnalysisDetail(
  jobState: PdfIntakeJobState,
  partsAnalysisProgress: PartsAnalysisProgress | null,
  partsListResult: PartsListPdfExtractionResult | null,
  analyzedPageCount: number,
  inventoryPageCount: number,
) {
  if ((jobState === "complete" || jobState === "rendering_pages") && partsListResult) {
    const sourcePageCount = getPartsListSourcePageNumbers(partsListResult).size

    return `${formatPageCount(sourcePageCount)} analyzed.`
  }

  if (inventoryPageCount > 0) {
    const currentPageText = partsAnalysisProgress?.currentPage
      ? ` Analyzing page ${partsAnalysisProgress.currentPage}.`
      : ""

    return `${analyzedPageCount} of ${inventoryPageCount} inventory pages complete.${currentPageText}`
  }

  return "Waiting for inventory pages."
}

function getInventoryAnalysisActivity(
  jobState: PdfIntakeJobState,
  partsAnalysisProgress: PartsAnalysisProgress | null,
  isProcessing: boolean,
  analysisHeartbeat: number,
) {
  if (!isProcessing || !partsAnalysisProgress || jobState !== "extracting_metadata") {
    return null
  }

  const idleMs = analysisHeartbeat - partsAnalysisProgress.updatedAt
  if (idleMs < 3_000) {
    return null
  }

  return `Still working; last update ${formatElapsedSeconds(idleMs)} ago.`
}

function isFailedProcessingState(jobState: PdfIntakeJobState) {
  return jobState === "failed" || jobState === "expired" || jobState === "purged"
}

function formatPageCount(count: number) {
  return `${count} inventory ${count === 1 ? "page" : "pages"}`
}

function formatElapsedSeconds(durationMs: number) {
  return `${Math.max(1, Math.floor(durationMs / 1_000))}s`
}

function createPendingProgressTransfer(
  result: PartsListPdfExtractionResult | null,
  checkedRowIds: ReadonlySet<string>,
): PartsListProgressTransferSource | null {
  if (!result || checkedRowIds.size === 0) {
    return null
  }

  return {
    checkedRowIds: new Set(checkedRowIds),
    result,
  }
}

function createPublicationTransferNotice(
  transfer: PartsListPublicationTransfer,
  isFinal: boolean,
): SessionRecoveryNotice {
  if (isFinal) {
    return (
      createProgressTransferNotice(transfer.pending, "recalculation") ??
      createProgressTransferNotice(transfer.visible, "analysis_update")
    )
  }

  return createProgressTransferNotice(transfer.visible, "analysis_update")
}

function createProgressTransferNotice(
  transfer: PartsListProgressTransferResult | null,
  reason: "analysis_update" | "recalculation",
): SessionRecoveryNotice {
  if (!transfer || transfer.previousCheckedCount === 0) {
    return null
  }

  if (transfer.changedRows.length === 0 && transfer.droppedRows.length === 0) {
    if (reason === "analysis_update") {
      return null
    }

    return {
      kind: "progress_transfer",
      recoveryText: `Restored ${formatRowCount(transfer.transferredCount)} after recalculation.`,
      statusText: "Checklist restored",
      tone: "success",
    }
  }

  return {
    kind: "progress_transfer",
    recoveryText: [
      `Transferred ${transfer.transferredCount} of ${transfer.previousCheckedCount} checked rows ${formatTransferReason(reason)}.`,
      transfer.changedRows.length > 0
        ? `${formatRowCount(transfer.changedRows.length)} changed ${formatTransferChangeFields(transfer)}.`
        : null,
      transfer.droppedRows.length > 0
        ? `${formatRowCount(transfer.droppedRows.length)} could not be matched.`
        : null,
      "Review the checked parts before continuing.",
    ].filter(Boolean).join(" "),
    statusText: "Checklist changed",
    tone: "warning",
  }
}

function addCheckedRowIds(target: Set<string>, source: ReadonlySet<string>) {
  for (const rowId of source) {
    target.add(rowId)
  }
}

function formatTransferReason(reason: "analysis_update" | "recalculation") {
  return reason === "recalculation" ? "after recalculation" : "as analysis updated"
}

function formatRowCount(count: number) {
  return `${count} ${count === 1 ? "row" : "rows"}`
}

function formatTransferChangeFields(transfer: PartsListProgressTransferResult) {
  const fields = new Set(transfer.changedRows.flatMap((row) => row.changes))
  const labels = [
    fields.has("quantity") ? "quantity" : null,
    fields.has("part_number") || fields.has("catalogue_part") ? "part number" : null,
    fields.has("color") ? "color" : null,
  ].filter(Boolean)

  return labels.length > 0 ? `(${labels.join(", ")})` : ""
}

function getRecoveryText(snapshot: PdfIntakeJobSnapshot | null, canRetryCurrentManual = false) {
  if (!snapshot) {
    return null
  }

  if (snapshot.state === "failed") {
    if (canRetryCurrentManual) {
      return "Click Bag it! to retry with the selected manual, or drop a replacement PDF."
    }

    return "Click this area or drop a replacement PDF to try again. If this is the right file, re-export it from your PDF app first."
  }

  if (snapshot.state === "expired") {
    return "Click this area or drop the PDF again to restart processing."
  }

  return null
}
