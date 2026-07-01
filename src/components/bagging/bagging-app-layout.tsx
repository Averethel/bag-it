import { useMemo } from "react"
import { AppFrame } from "./app-frame"
import { AttentionCard } from "./attention-card"
import {
  OutputTabs,
  usePrecomputedPartMatchGroups,
  type BuildStepAnalysisProgress,
} from "./output-tabs"
import { appendPartGroupingStatusRow } from "./part-grouping-status"
import { ProcessingStatusCard, type StatusRow } from "./processing-status-card"
import { SessionControls } from "./session-controls"
import { UploadCard, type UploadMessage } from "./upload-card"
import type {
  StepCalloutBagRow,
  StepCalloutBaggingPlan,
} from "@/features/bagging/step-callout-bagging"
import type { StepCalloutMultiplierMap } from "@/features/bagging/step-callout-multipliers"
import type { StepCalloutDetectionResult } from "@/features/steps/step-detection-contracts"
import type {
  PartMaskPreviewAsset,
  PreviewAssetStore,
} from "@/features/steps/preview-assets"

export function BaggingAppLayout({
  analysisProgress,
  attentionIssues,
  bagRows,
  baggingPlan,
  calloutMultipliers,
  canDownloadSession,
  checkedBagRowIds,
  detectionResult,
  fileName,
  hasManual,
  isProcessing,
  metadataSummary,
  pageCount,
  partMaskPreviewAssets,
  partMaskPreviewsComplete,
  previewAssetStore,
  statusRows,
  uploadMessage,
  onBagRowCheckedChange,
  onBuildStepPagePriorityChange,
  onCalloutMultiplierChange,
  onContinueSession,
  onDownloadSession,
  onFileChange,
  onPrimaryAction,
  onPurge,
}: {
  analysisProgress: BuildStepAnalysisProgress | null
  attentionIssues: string[]
  bagRows: StepCalloutBagRow[]
  baggingPlan: StepCalloutBaggingPlan | null
  calloutMultipliers: StepCalloutMultiplierMap
  canDownloadSession: boolean
  checkedBagRowIds: ReadonlySet<string>
  detectionResult: StepCalloutDetectionResult | null
  fileName: string | null
  hasManual: boolean
  isProcessing: boolean
  metadataSummary: string | null
  pageCount: number | null
  partMaskPreviewAssets: PartMaskPreviewAsset[]
  partMaskPreviewsComplete: boolean
  previewAssetStore: PreviewAssetStore
  statusRows: StatusRow[]
  uploadMessage: UploadMessage | null
  onBagRowCheckedChange: (rowId: string, checked: boolean) => void
  onBuildStepPagePriorityChange: (pageNumber: number, isPriority: boolean) => void
  onCalloutMultiplierChange: (calloutId: string, multiplier: number) => void
  onContinueSession: (file: File | null) => void
  onDownloadSession: () => void
  onFileChange: (file: File | null) => void
  onPrimaryAction: () => void
  onPurge: () => void
}) {
  const partMatchPrecompute = usePrecomputedPartMatchGroups({
    partMaskAssets: partMaskPreviewAssets,
    partMaskPreviewsComplete,
    rows: bagRows,
  })
  const processingStatusRows = useMemo(
    () => appendPartGroupingStatusRow(statusRows, bagRows, partMatchPrecompute),
    [bagRows, partMatchPrecompute, statusRows],
  )

  return (
    <AppFrame
      sidebar={
        <>
          <UploadCard
            message={uploadMessage}
            fileName={fileName}
            metadataSummary={metadataSummary}
            isProcessing={isProcessing}
            onFileChange={onFileChange}
            onPrimaryAction={onPrimaryAction}
            onPurge={onPurge}
          />
          <ProcessingStatusCard rows={processingStatusRows} />
          <SessionControls
            canDownload={canDownloadSession}
            isProcessing={isProcessing}
            onContinueSession={onContinueSession}
            onDownloadSession={onDownloadSession}
          />
          <AttentionCard issues={attentionIssues} />
        </>
      }
    >
      <OutputTabs
        bagRows={bagRows}
        baggingPlan={baggingPlan}
        calloutMultipliers={calloutMultipliers}
        checkedBagRowIds={checkedBagRowIds}
        detectionResult={detectionResult}
        hasManual={hasManual}
        isProcessing={isProcessing}
        onBagRowCheckedChange={onBagRowCheckedChange}
        onBuildStepPagePriorityChange={onBuildStepPagePriorityChange}
        onCalloutMultiplierChange={onCalloutMultiplierChange}
        analysisProgress={analysisProgress}
        pageCount={pageCount}
        partMatchPrecompute={partMatchPrecompute}
        previewAssetStore={previewAssetStore}
      />
    </AppFrame>
  )
}
