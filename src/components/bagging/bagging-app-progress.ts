import type { BuildStepAnalysisProgress } from "./output-tabs"
import type { StatusRow } from "./processing-status-card"
import {
  countDetectedPartItems,
  formatStalePartExtractionStatusDetail,
  isCurrentPartExtractionResult,
  isCurrentStepDetectionResult,
  readPartExtractionFreshnessDetail,
} from "./bagging-analysis-result"
import { createPreviewGenerationProgress, readPreviewGenerationPageNumbers } from "./bagging-preview-runtime"
import type {
  PartExtractionState,
  PreviewHydrationState,
  StepDetectionState,
} from "./bagging-app-types"
import type {
  StepCalloutDetectionProgress,
  StepCalloutDetectionResult,
  StepPartExtractionProgress,
} from "@/features/steps/step-detection-contracts"
import type { PreviewGenerationProgress } from "@/features/steps/preview-scheduler"
import { COUNT_LABELS, formatCount, formatCountRatio } from "@/lib/count-format"

const pendingRows: StatusRow[] = [
  {
    label: "Scanning pages",
    detail: "Waiting for manual",
    state: "pending",
    progress: 0,
  },
  {
    label: "Extracting parts",
    detail: "Waiting for page scan",
    state: "pending",
    progress: 0,
  },
  {
    label: "Generating previews",
    detail: "Waiting for part extraction",
    state: "pending",
    progress: 0,
  },
]

export function createAnalysisProgressRows({
  detectorVersion,
  metadataPageCount,
  partColorCalibrationVersion,
  partExtractorVersion,
  partExtractionState,
  previewHydrationState,
  stepDetectionState,
  stepScanProgress,
}: {
  detectorVersion: string
  metadataPageCount: number | null
  partColorCalibrationVersion: string
  partExtractorVersion: string
  partExtractionState: PartExtractionState
  previewHydrationState: PreviewHydrationState
  stepDetectionState: StepDetectionState
  stepScanProgress: BuildStepAnalysisProgress | null
}): StatusRow[] {
  let rows = pendingRows

  if (stepDetectionState.status === "processing") {
    rows = updateRow(rows, 0, {
      detail: stepScanProgress ? formatStepScanStatusDetail(stepScanProgress) : "Preparing page scanner",
      state: "active",
      progress: stepScanProgress?.progress ?? 5,
    })
    return rows
  }

  if (stepDetectionState.status === "failed") {
    return updateRow(rows, 0, {
      detail: "Scan failed",
      state: "failed",
      progress: 100,
    })
  }

  if (stepDetectionState.status === "cancelled") {
    return updateRow(rows, 0, {
      detail: "Cancelled",
      state: "pending",
      progress: 0,
    })
  }

  if (stepDetectionState.status !== "ready") {
    return rows
  }

  if (!isCurrentStepDetectionResult(stepDetectionState.result, detectorVersion)) {
    return updateRow(rows, 0, {
      detail: "Detector changed",
      state: "active",
      progress: 10,
    })
  }

  rows = updateRow(rows, 0, {
    detail: formatCompletedScanStatusDetail(stepDetectionState.result, metadataPageCount),
    state: "complete",
    progress: 100,
  })

  if (partExtractionState.status === "processing") {
    return updateRow(rows, 1, {
      detail: partExtractionState.progress
        ? formatPartExtractionStatusDetail(
            stepDetectionState.result,
            partExtractionState.progress,
            metadataPageCount,
          )
        : "Preparing part detector",
      state: "active",
      progress: partExtractionState.progress?.percentage ?? 5,
    })
  }

  if (partExtractionState.status === "failed") {
    return updateRow(rows, 1, {
      detail: partExtractionState.error.message,
      state: "failed",
      progress: 100,
    })
  }

  if (partExtractionState.status === "cancelled") {
    return updateRow(rows, 1, {
      detail: "Part detection cancelled",
      state: "pending",
      progress: 0,
    })
  }

  if (!isCurrentPartExtractionResult(stepDetectionState.result, partExtractorVersion, partColorCalibrationVersion)) {
    const freshness = readPartExtractionFreshnessDetail(stepDetectionState.result)

    return updateRow(rows, 1, {
      detail: formatStalePartExtractionStatusDetail(freshness, partExtractorVersion),
      state: stepDetectionState.result.callouts.length > 0 ? "active" : "pending",
      progress: stepDetectionState.result.callouts.length > 0 ? 10 : 0,
    })
  }

  rows = updateRow(rows, 1, {
    detail: formatCompletedPartExtractionStatusDetail(stepDetectionState.result),
    state: "complete",
    progress: 100,
  })

  if (previewHydrationState.status === "processing" || previewHydrationState.status === "background") {
    return updateRow(rows, 2, {
      detail: previewHydrationState.progress
        ? formatPreviewHydrationStatusDetail(previewHydrationState.progress)
        : "Preparing previews",
      state: "active",
      progress: previewHydrationState.progress?.percentage ?? 5,
    })
  }

  if (previewHydrationState.status === "failed") {
    return updateRow(rows, 2, {
      detail: previewHydrationState.error.message,
      state: "failed",
      progress: 100,
    })
  }

  if (previewHydrationState.status === "cancelled") {
    return updateRow(rows, 2, {
      detail: "Preview generation cancelled",
      state: "pending",
      progress: 0,
    })
  }

  if (previewHydrationState.status === "ready") {
    return updateRow(rows, 2, {
      detail: "Previews ready",
      state: "complete",
      progress: 100,
    })
  }

  if (previewHydrationState.status === "deferred") {
    const progress = previewHydrationState.progress
      ?? createPreviewGenerationProgress(
        stepDetectionState.result,
        null,
        0,
        readPreviewGenerationPageNumbers(stepDetectionState.result).length,
      )

    return updateRow(rows, 2, {
      detail: formatPreviewHydrationStatusDetail(progress),
      state: "active",
      progress: progress.percentage,
    })
  }

  return updateRow(rows, 2, {
    detail: "Waiting for part extraction",
    state: "pending",
    progress: 0,
  })
}

export function readProcessingPhase(
  stepDetectionState: StepDetectionState,
  partExtractionState: PartExtractionState,
  previewHydrationState: PreviewHydrationState,
): string | null {
  if (stepDetectionState.status === "processing") {
    return stepDetectionState.progress?.phase ?? "page-scan"
  }

  if (partExtractionState.status === "processing") {
    return partExtractionState.progress?.phase ?? "part-extraction"
  }

  if (previewHydrationState.status === "processing" || previewHydrationState.status === "background") {
    return previewHydrationState.progress?.phase ?? "preview-hydration"
  }

  return null
}

export function createBuildStepScanProgress(
  progress: StepCalloutDetectionProgress | null,
  pageCount: number | null,
  elapsedSeconds: number | null,
): BuildStepAnalysisProgress {
  const scannedPageCount = progress?.scannedPageCount ?? 0
  const targetPageCount = progress?.targetPageCount ?? pageCount ?? 0
  const detectedCalloutCount = progress?.detectedCalloutCount
  const detectedPartItemCount = progress?.detectedPartItemCount ?? 0
  const phase = progress?.phase ?? "page-scan"
  const activePage = progress?.activePage ?? nextActivePage(scannedPageCount, targetPageCount)
  const activePageValue =
    activePage === null
      ? targetPageCount > 0 && scannedPageCount >= targetPageCount
        ? "Finalizing"
        : "Preparing"
      : `Page ${activePage}`
  const statusText = [
    progress?.message ?? "Preparing browser scanner",
    elapsedSeconds === null ? null : `Working ${formatElapsedSeconds(elapsedSeconds)}`,
  ]
    .filter(Boolean)
    .join(". ")

  return {
    activePageValue,
    scannedPagesValue:
      targetPageCount > 0 ? `${scannedPageCount}/${targetPageCount}` : `${scannedPageCount}`,
    detectedCalloutsValue: detectedCalloutCount === undefined ? "Resolving" : `${detectedCalloutCount}`,
    detectedPartItemsValue: `${detectedPartItemCount}`,
    phaseLabel: formatProcessingPhase(phase),
    progress: clampProgress(progress?.percentage ?? (targetPageCount > 0 ? 4 : 2)),
    statusText,
  }
}

export function createBuildStepPartExtractionProgress(
  result: StepCalloutDetectionResult,
  progress: StepPartExtractionProgress | null,
  pageCount: number | null,
  overrides: Partial<BuildStepAnalysisProgress> = {},
): BuildStepAnalysisProgress {
  const scannedPagesValue = pageCount && pageCount > 0
    ? `${result.scannedPageNumbers.length}/${pageCount}`
    : `${result.scannedPageNumbers.length}`
  const activePageValue = progress?.activePage ? `Page ${progress.activePage}` : "Preparing"
  const detectedPartItemCount = progress?.detectedPartItemCount ?? countDetectedPartItems(result)

  return {
    activePageValue,
    scannedPagesValue,
    detectedCalloutsValue: `${result.callouts.length}`,
    detectedPartItemsValue: `${detectedPartItemCount}`,
    phaseLabel: "Extracting parts",
    progress: clampProgress(progress?.percentage ?? 5),
    statusText: progress?.message ?? "Preparing part detector",
    ...overrides,
  }
}

function formatStepScanStatusDetail(progress: BuildStepAnalysisProgress): string {
  const detectedCalloutCount = Number(progress.detectedCalloutsValue)

  return formatScanCounterStatusDetail(
    progress.scannedPagesValue,
    Number.isFinite(detectedCalloutCount) ? detectedCalloutCount : null,
    Number(progress.detectedPartItemsValue),
  )
}

function formatCompletedScanStatusDetail(
  result: StepCalloutDetectionResult,
  pageCount: number | null,
): string {
  const scannedPagesValue =
    pageCount && pageCount > 0
      ? `${result.scannedPageNumbers.length}/${pageCount}`
      : `${result.scannedPageNumbers.length}`

  return formatScanCounterStatusDetail(
    scannedPagesValue,
    result.callouts.length,
    countDetectedPartItems(result),
  )
}

function formatPartExtractionStatusDetail(
  result: StepCalloutDetectionResult,
  progress: StepPartExtractionProgress,
  pageCount: number | null,
): string {
  const activePageValue = progress.activePage ? `Page ${progress.activePage}; ` : ""
  const pageValue = pageCount && pageCount > 0
    ? `${result.scannedPageNumbers.length}/${pageCount}`
    : `${result.scannedPageNumbers.length}`

  return `${activePageValue}Pages: ${pageValue}; ${formatCountRatio(
    progress.processedCalloutCount,
    progress.targetCalloutCount,
    COUNT_LABELS.callout,
  )}; ${formatCount(progress.detectedPartItemCount, COUNT_LABELS.partRow)}`
}

function formatScanCounterStatusDetail(
  scannedPagesValue: string,
  calloutsValue: number | null,
  partsValue: number,
): string {
  const calloutsLabel = calloutsValue === null
    ? "callouts resolving"
    : formatCount(calloutsValue, COUNT_LABELS.callout)

  return `Pages: ${scannedPagesValue}; ${calloutsLabel}; ${formatCount(partsValue, COUNT_LABELS.part)}`
}

function formatCompletedPartExtractionStatusDetail(result: StepCalloutDetectionResult): string {
  return `${formatCount(countDetectedPartItems(result), COUNT_LABELS.partRow)} across ${formatCount(
    result.callouts.length,
    COUNT_LABELS.callout,
  )}`
}

function formatPreviewHydrationStatusDetail(progress: PreviewGenerationProgress): string {
  const previewPagesValue = progress.targetPreviewPageCount > 0
    ? `${progress.hydratedPreviewPageCount}/${progress.targetPreviewPageCount}`
    : `${progress.hydratedPreviewPageCount}`

  return `Preview pages: ${previewPagesValue}`
}

function updateRow(rows: StatusRow[], index: number, nextRow: Partial<StatusRow>): StatusRow[] {
  return rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...nextRow } : row))
}

function formatProcessingPhase(phase: string): string {
  switch (phase) {
    case "finalizing":
      return "Resolving callouts"
    case "part-extraction":
      return "Extracting parts"
    case "preview-hydration":
      return "Rendering previews"
    case "page-scan":
    default:
      return "Scanning pages"
  }
}

function nextActivePage(scannedPageCount: number, targetPageCount: number): number | null {
  if (targetPageCount <= 0 || scannedPageCount >= targetPageCount) {
    return null
  }

  return Math.max(1, scannedPageCount + 1)
}

function clampProgress(progress: number): number {
  return Math.max(0, Math.min(100, progress))
}

function formatElapsedSeconds(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`
}
