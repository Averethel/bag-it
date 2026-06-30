import type {
  RestoredPdfIntakeSession,
  restorePdfIntakeSessionFile,
} from "@/features/bagging/session-file"
import type { StepCalloutPageAdvisoryDiagnostic } from "@bag-it/step-callouts"
import type { StepCalloutBagCompletionAnchor } from "@/features/bagging/bag-completion-anchors"
import type { readPdfMetadataFromFile } from "@/features/pdf/browser-pdf-parser"
import type { PdfIntakeError, PdfMetadata } from "@/features/pdf/pdf-intake"
import type {
  StepCalloutDetectionProgress,
  StepCalloutDetectionResult,
  StepPartExtractionProgress,
  StepPreviewHydrationProgress,
} from "@/features/steps/step-detection-contracts"
import type {
  PagePreviewAsset,
  PartMaskPreviewAsset,
} from "@/features/steps/preview-assets"
import type { PreviewGenerationProgress } from "@/features/steps/preview-scheduler"
import type { PagePreviewBaseBounds } from "@/features/steps/v2/runtime-preview-assets"
import type { StepDetectorV2PageInput } from "@/features/steps/v2/contracts"

export type ReadPdfMetadata = typeof readPdfMetadataFromFile
export type RestoreSessionFile = typeof restorePdfIntakeSessionFile

export type ScanStepCallouts = (
  file: File,
  options?: {
    eagerPreviewImages?: boolean
    maxPages?: number
    onPageAdvisoryDiagnostics?: (diagnostics: StepCalloutPageAdvisoryDiagnostic[]) => void
    onPreviewPageInput?: (pageInput: StepDetectorV2PageInput, baseBounds: PagePreviewBaseBounds) => void
    pageCount?: number
    parallelPageDetection?: boolean
    signal?: AbortSignal
    onProgress?: (progress: StepCalloutDetectionProgress) => void
  },
) => Promise<StepCalloutDetectionResult>

export type ScanStepParts = (
  file: File,
  result: StepCalloutDetectionResult,
  options?: {
    eagerPreviewImages?: boolean
    onPreviewPageInput?: (pageInput: StepDetectorV2PageInput, baseBounds: PagePreviewBaseBounds) => void
    signal?: AbortSignal
    onProgress?: (progress: StepPartExtractionProgress) => void
  },
) => Promise<StepCalloutDetectionResult>

export type HydrateStepPreviews = (
  file: File,
  result: StepCalloutDetectionResult,
  options?: {
    batchSize?: number
    getPriorityPageNumbers?: () => readonly number[]
    includeCropPreviews?: boolean
    includePagePreviews?: boolean
    lowResolutionBatchSize?: number
    maxPages?: number
    onPageHydrated?: (update: { pageNumber: number; result: StepCalloutDetectionResult }) => void
    onProgress?: (progress: StepPreviewHydrationProgress) => void
    onTiming?: (timing: NonNullable<StepCalloutDetectionResult["previewTiming"]>) => void
    pageNumbers?: readonly number[]
    pagePreviewRenderMaxWidth?: number
    renderMaxWidth?: number
    signal?: AbortSignal
  },
) => Promise<StepCalloutDetectionResult>

export type CreatePagePreviewAsset = (
  file: File,
  result: StepCalloutDetectionResult,
  pageNumber: number,
  options?: {
    renderMaxWidth?: number
    signal?: AbortSignal
    targetWidth?: number
  },
) => Promise<PagePreviewAsset>

export type CreatePartMaskPreviewAsset = (
  pageAsset: PagePreviewAsset,
  partItem: StepCalloutDetectionResult["callouts"][number]["partItems"][number],
  signal?: AbortSignal,
) => Promise<PartMaskPreviewAsset | null>

export type PdfIntakeState =
  | { status: "idle" }
  | { status: "selected" }
  | { status: "processing" }
  | { status: "ready"; metadata: PdfMetadata }
  | { status: "failed"; error: PdfIntakeError }
  | { status: "cancelled" }
  | { status: "purged" }

export type StepDetectionState =
  | { status: "idle" }
  | { status: "processing"; progress: StepCalloutDetectionProgress | null }
  | { status: "ready"; result: StepCalloutDetectionResult }
  | { status: "failed"; error: PdfIntakeError }
  | { status: "cancelled" }

export type PartExtractionState =
  | { status: "idle" }
  | { status: "processing"; progress: StepPartExtractionProgress | null }
  | { status: "ready" }
  | { status: "failed"; error: PdfIntakeError }
  | { status: "cancelled" }

export type PreviewHydrationState =
  | { status: "idle" }
  | { status: "processing"; progress: PreviewGenerationProgress | null }
  | { status: "background"; progress: PreviewGenerationProgress | null }
  | { status: "ready" }
  | { status: "deferred"; progress: PreviewGenerationProgress | null }
  | { status: "failed"; error: PdfIntakeError }
  | { status: "cancelled" }

export type PendingBagCompletionRestore = {
  checkedBagCompletionAnchors: StepCalloutBagCompletionAnchor[]
  checkedBagRowIds: string[]
  transferByAnchor: boolean
}

export type PreviewPageInputCacheEntry = {
  baseBounds: PagePreviewBaseBounds
  pageInput: StepDetectorV2PageInput
}

export type RestoredSession = RestoredPdfIntakeSession
