"use client"

import { useCallback, useMemo } from "react"
import { BaggingAppLayout } from "./bagging-app-layout"
import {
  type CreatePagePreviewAsset,
  type CreatePartMaskPreviewAsset,
  type HydrateStepPreviews,
  type ReadPdfMetadata,
  type RestoreSessionFile,
  type ScanStepCallouts,
  type ScanStepParts,
} from "./bagging-app-types"
import {
  createAttentionIssues,
  createUploadMessage,
} from "./bagging-app-view-model"
import { useBagCompletionState } from "./use-bag-completion-state"
import {
  type BagCompletionActions,
  useStepAnalysisJob,
} from "./use-step-analysis-job"
import {
  createDefaultPagePreviewAsset,
  createDefaultPartMaskPreviewAsset,
  DEFAULT_STEP_CALLOUT_DETECTOR_VERSION,
  DEFAULT_STEP_PART_COLOR_CALIBRATION_VERSION,
  DEFAULT_STEP_PART_EXTRACTOR_VERSION,
  hydrateDefaultStepPreviews,
  readDefaultPdfMetadata,
  restoreDefaultSessionFile,
  scanDefaultStepCallouts,
  scanDefaultStepParts,
} from "./detector-client-boundary"

export function BaggingApp({
  detectorVersion = DEFAULT_STEP_CALLOUT_DETECTOR_VERSION,
  createPagePreviewAsset = createDefaultPagePreviewAsset,
  createPartMaskPreviewAsset = createDefaultPartMaskPreviewAsset,
  partExtractorVersion = DEFAULT_STEP_PART_EXTRACTOR_VERSION,
  partColorCalibrationVersion = DEFAULT_STEP_PART_COLOR_CALIBRATION_VERSION,
  readPdfMetadata = readDefaultPdfMetadata,
  restoreSessionFile = restoreDefaultSessionFile,
  scanStepCallouts = scanDefaultStepCallouts,
  scanStepParts = scanDefaultStepParts,
  hydrateStepPreviews: legacyHydrateStepPreviews = hydrateDefaultStepPreviews,
}: {
  createPagePreviewAsset?: CreatePagePreviewAsset
  createPartMaskPreviewAsset?: CreatePartMaskPreviewAsset
  detectorVersion?: string
  hydrateStepPreviews?: HydrateStepPreviews
  partExtractorVersion?: string
  partColorCalibrationVersion?: string
  readPdfMetadata?: ReadPdfMetadata
  restoreSessionFile?: RestoreSessionFile
  scanStepCallouts?: ScanStepCallouts
  scanStepParts?: ScanStepParts
} = {}) {
  void legacyHydrateStepPreviews
  const analysisJob = useStepAnalysisJob({
    createPagePreviewAsset,
    createPartMaskPreviewAsset,
    detectorVersion,
    partColorCalibrationVersion,
    partExtractorVersion,
    readPdfMetadata,
    restoreSessionFile,
    scanStepCallouts,
    scanStepParts,
  })
  const {
    checkedBagCompletions,
    checkedBagRowIds,
    handleBagRowCheckedChange,
    resetBagCompletions,
    setPendingBagCompletionRestore,
  } = useBagCompletionState({
    bagRows: analysisJob.bagRows,
    baggingPlan: analysisJob.baggingPlan,
    manualFingerprint: analysisJob.manualFingerprint,
    setNotice: analysisJob.setNotice,
  })
  const completionActions = useMemo<BagCompletionActions>(() => ({
    resetBagCompletions,
    setPendingBagCompletionRestore,
  }), [resetBagCompletions, setPendingBagCompletionRestore])
  const uploadMessage = createUploadMessage({
    error: analysisJob.error,
    notice: analysisJob.notice,
    partExtractionState: analysisJob.partExtractionState,
    staleStepDetectionResult: analysisJob.staleStepDetectionResult,
  })
  const attentionIssues = createAttentionIssues({
    baggingPlan: analysisJob.baggingPlan,
    staleStepDetectionResult: analysisJob.staleStepDetectionResult,
    stepDetectionResult: analysisJob.stepDetectionResult,
  })
  const {
    handleContinueSession: runContinueSession,
    handleDownloadSession: runDownloadSession,
    handleFileChange: runFileChange,
    handlePrimaryAction: runPrimaryAction,
    handlePurge: runPurge,
  } = analysisJob
  const handleFileChange = useCallback((file: File | null) => {
    runFileChange(file, completionActions)
  }, [completionActions, runFileChange])
  const handlePurge = useCallback(() => {
    runPurge(completionActions)
  }, [completionActions, runPurge])
  const handlePrimaryAction = useCallback(() => {
    void runPrimaryAction(completionActions)
  }, [completionActions, runPrimaryAction])
  const handleDownloadSession = useCallback(() => {
    void runDownloadSession(checkedBagCompletions)
  }, [checkedBagCompletions, runDownloadSession])
  const handleContinueSession = useCallback((file: File | null) => {
    void runContinueSession(file, completionActions)
  }, [completionActions, runContinueSession])

  return (
    <BaggingAppLayout
      analysisProgress={analysisJob.buildStepAnalysisProgress}
      attentionIssues={attentionIssues}
      bagRows={analysisJob.bagRows}
      baggingPlan={analysisJob.baggingPlan}
      calloutMultipliers={analysisJob.calloutMultipliers}
      canDownloadSession={analysisJob.canDownloadSession}
      checkedBagRowIds={checkedBagRowIds}
      detectionResult={analysisJob.baggableStepDetectionResult}
      fileName={analysisJob.manualFile?.name ?? null}
      hasManual={analysisJob.hasManual}
      isProcessing={analysisJob.isProcessing}
      metadataSummary={analysisJob.metadataSummary}
      pageCount={analysisJob.metadata?.pageCount ?? null}
      partMaskPreviewAssets={analysisJob.partMaskPreviewAssets}
      partMaskPreviewsComplete={analysisJob.partMaskPreviewsComplete}
      previewAssetStore={analysisJob.previewAssetStore}
      statusRows={analysisJob.statusRows}
      uploadMessage={uploadMessage}
      onBagRowCheckedChange={handleBagRowCheckedChange}
      onBuildStepPagePriorityChange={analysisJob.handleBuildStepPagePriorityChange}
      onCalloutMultiplierChange={analysisJob.handleCalloutMultiplierChange}
      onContinueSession={handleContinueSession}
      onDownloadSession={handleDownloadSession}
      onFileChange={handleFileChange}
      onPrimaryAction={handlePrimaryAction}
      onPurge={handlePurge}
    />
  )
}
