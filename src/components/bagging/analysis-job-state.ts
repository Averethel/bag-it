import {
  isSameAnalysisResult,
} from "./bagging-analysis-result"
import type {
  PartExtractionState,
  PdfIntakeState,
  StepDetectionState,
} from "./bagging-app-types"
import {
  pruneCalloutMultipliers,
  setCalloutMultiplier,
  type StepCalloutMultiplierMap,
} from "@/features/bagging/step-callout-multipliers"
import type { PdfIntakeError, PdfMetadata } from "@/features/pdf/pdf-intake"
import type {
  StepCalloutDetectionResult,
  StepCalloutDetectionProgress,
  StepPartExtractionProgress,
} from "@/features/steps/step-detection-contracts"

export type AnalysisJobState = {
  calloutMultipliers: StepCalloutMultiplierMap
  error: string | null
  errorDetail: string | null
  intakeState: PdfIntakeState
  manualFile: File | null
  notice: string | null
  partExtractionState: PartExtractionState
  scanClockNow: number
  scanStartedAt: number | null
  staleRerunDetectorVersion: string | null
  staleRerunPartExtractorVersion: string | null
  stepDetectionState: StepDetectionState
}

export type AnalysisJobAction =
  | { type: "active-job-aborted" }
  | { type: "callout-multiplier-changed"; calloutId: string; multiplier: number }
  | { type: "download-session-failed"; error: PdfIntakeError; errorDetail: string }
  | { type: "download-session-succeeded" }
  | { type: "fresh-analysis-reset" }
  | { type: "manual-cleared" }
  | { type: "manual-invalid"; error: PdfIntakeError; errorDetail: string }
  | { type: "manual-selected"; file: File }
  | { type: "notice-set"; notice: string | null }
  | { type: "part-extraction-cancelled" }
  | { type: "part-extraction-failed"; error: PdfIntakeError; errorDetail: string }
  | { type: "part-extraction-progressed"; progress: StepPartExtractionProgress }
  | { type: "part-extraction-started"; previewlessResult: StepCalloutDetectionResult }
  | { type: "part-extraction-succeeded"; notice: string; result: StepCalloutDetectionResult }
  | { type: "pdf-intake-failed"; error: PdfIntakeError; errorDetail: string }
  | { type: "pdf-intake-ready"; metadata: PdfMetadata }
  | { type: "pdf-intake-started" }
  | { type: "purged" }
  | { type: "scan-clock-ticked"; now: number }
  | { type: "session-current-result-restored"; hasCurrentPartExtraction: boolean; notice: string; result: StepCalloutDetectionResult }
  | { type: "session-restore-failed"; error: PdfIntakeError; errorDetail: string }
  | {
      type: "session-restore-hydrated"
      calloutMultipliers: StepCalloutMultiplierMap
      manualFile: File
      metadata: PdfMetadata
      stepDetectionResult: StepCalloutDetectionResult | null
    }
  | { type: "session-restore-started" }
  | { type: "stale-detector-rerun-started"; notice: string; staleDetectorVersion: string }
  | { type: "stale-part-extraction-rerun-started"; notice: string; stalePartExtractionKey: string }
  | { type: "step-scan-cancelled" }
  | { type: "step-scan-failed"; error: PdfIntakeError; errorDetail: string }
  | { type: "step-scan-progressed"; progress: StepCalloutDetectionProgress }
  | {
      type: "step-scan-succeeded"
      hasCurrentPartExtraction: boolean
      isCurrentDetectorResult: boolean
      notice: string
      result: StepCalloutDetectionResult
    }
  | { type: "step-scan-started"; startedAt: number }

export function createInitialAnalysisJobState(scanClockNow = Date.now()): AnalysisJobState {
  return {
    calloutMultipliers: {},
    error: null,
    errorDetail: null,
    intakeState: { status: "idle" },
    manualFile: null,
    notice: null,
    partExtractionState: { status: "idle" },
    scanClockNow,
    scanStartedAt: null,
    staleRerunDetectorVersion: null,
    staleRerunPartExtractorVersion: null,
    stepDetectionState: { status: "idle" },
  }
}

export function analysisJobStateReducer(
  state: AnalysisJobState,
  action: AnalysisJobAction,
): AnalysisJobState {
  switch (action.type) {
    case "active-job-aborted":
      return {
        ...state,
        scanStartedAt: null,
      }

    case "callout-multiplier-changed":
      return {
        ...state,
        calloutMultipliers: setCalloutMultiplier(
          state.calloutMultipliers,
          action.calloutId,
          action.multiplier,
        ),
      }

    case "download-session-failed":
      return {
        ...state,
        error: action.error.message,
        errorDetail: action.errorDetail,
        notice: null,
      }

    case "download-session-succeeded":
      return {
        ...state,
        error: null,
        errorDetail: null,
        notice: "Session downloaded. Keep it private; it contains the manual PDF.",
      }

    case "fresh-analysis-reset":
      return {
        ...state,
        calloutMultipliers: {},
        error: null,
        errorDetail: null,
        notice: null,
        staleRerunDetectorVersion: null,
        staleRerunPartExtractorVersion: null,
      }

    case "manual-cleared":
      return {
        ...state,
        intakeState: { status: "idle" },
        manualFile: null,
        partExtractionState: { status: "idle" },
        stepDetectionState: { status: "idle" },
      }

    case "manual-invalid":
      return {
        ...state,
        error: action.error.message,
        errorDetail: action.errorDetail,
        intakeState: { status: "failed", error: action.error },
        manualFile: null,
        partExtractionState: { status: "idle" },
        stepDetectionState: { status: "idle" },
      }

    case "manual-selected":
      return {
        ...state,
        intakeState: { status: "selected" },
        manualFile: action.file,
        partExtractionState: { status: "idle" },
        stepDetectionState: { status: "idle" },
      }

    case "notice-set":
      return {
        ...state,
        notice: action.notice,
      }

    case "part-extraction-cancelled":
      return {
        ...state,
        notice: "Part detection cancelled. Step callouts kept.",
        partExtractionState: { status: "cancelled" },
      }

    case "part-extraction-failed":
      return {
        ...state,
        error: action.error.message,
        errorDetail: action.errorDetail,
        notice: null,
        partExtractionState: { status: "failed", error: action.error },
      }

    case "part-extraction-progressed":
      return {
        ...state,
        partExtractionState: { status: "processing", progress: action.progress },
      }

    case "part-extraction-started":
      return {
        ...state,
        partExtractionState: { status: "processing", progress: null },
        stepDetectionState:
          state.stepDetectionState.status === "ready" &&
          isSameAnalysisResult(state.stepDetectionState.result, action.previewlessResult)
            ? { status: "ready", result: action.previewlessResult }
            : state.stepDetectionState,
      }

    case "part-extraction-succeeded":
      return {
        ...state,
        calloutMultipliers: pruneCalloutMultipliers(
          state.calloutMultipliers,
          action.result,
        ),
        error: null,
        errorDetail: null,
        notice: action.notice,
        partExtractionState: { status: "ready" },
        staleRerunPartExtractorVersion: null,
        stepDetectionState: { status: "ready", result: action.result },
      }

    case "pdf-intake-failed":
      return {
        ...state,
        error: action.error.message,
        errorDetail: action.errorDetail,
        intakeState: { status: "failed", error: action.error },
        notice: null,
        partExtractionState: { status: "idle" },
        stepDetectionState: { status: "idle" },
      }

    case "pdf-intake-ready":
      return {
        ...state,
        intakeState: { status: "ready", metadata: action.metadata },
      }

    case "pdf-intake-started":
      return {
        ...state,
        calloutMultipliers: {},
        error: null,
        errorDetail: null,
        intakeState: { status: "processing" },
        notice: null,
        partExtractionState: { status: "idle" },
        staleRerunDetectorVersion: null,
        staleRerunPartExtractorVersion: null,
        stepDetectionState: { status: "idle" },
      }

    case "purged":
      return {
        ...state,
        calloutMultipliers: {},
        error: null,
        errorDetail: null,
        intakeState: { status: "purged" },
        manualFile: null,
        notice: "Manual removed. Private source bytes cleared from app state.",
        partExtractionState: { status: "idle" },
        scanStartedAt: null,
        staleRerunDetectorVersion: null,
        staleRerunPartExtractorVersion: null,
        stepDetectionState: { status: "idle" },
      }

    case "scan-clock-ticked":
      return {
        ...state,
        scanClockNow: action.now,
      }

    case "session-current-result-restored":
      return {
        ...state,
        notice: action.notice,
        partExtractionState: action.hasCurrentPartExtraction
          ? { status: "ready" }
          : { status: "idle" },
        scanStartedAt: null,
        stepDetectionState: { status: "ready", result: action.result },
      }

    case "session-restore-failed":
      return {
        ...state,
        calloutMultipliers: {},
        error: action.error.message,
        errorDetail: action.errorDetail,
        intakeState: { status: "failed", error: action.error },
        manualFile: null,
        notice: null,
        partExtractionState: { status: "idle" },
        stepDetectionState: { status: "idle" },
      }

    case "session-restore-hydrated":
      return {
        ...state,
        calloutMultipliers: pruneCalloutMultipliers(
          action.calloutMultipliers,
          action.stepDetectionResult,
        ),
        intakeState: { status: "ready", metadata: action.metadata },
        manualFile: action.manualFile,
      }

    case "session-restore-started":
      return {
        ...state,
        calloutMultipliers: {},
        error: null,
        errorDetail: null,
        notice: null,
        partExtractionState: { status: "idle" },
        staleRerunDetectorVersion: null,
        staleRerunPartExtractorVersion: null,
      }

    case "stale-detector-rerun-started":
      return {
        ...state,
        error: null,
        errorDetail: null,
        notice: action.notice,
        staleRerunDetectorVersion: action.staleDetectorVersion,
      }

    case "stale-part-extraction-rerun-started":
      return {
        ...state,
        error: null,
        errorDetail: null,
        notice: action.notice,
        staleRerunPartExtractorVersion: action.stalePartExtractionKey,
      }

    case "step-scan-cancelled":
      return {
        ...state,
        notice: "Step scan cancelled. Selected manual kept.",
        scanStartedAt: null,
        stepDetectionState: { status: "cancelled" },
      }

    case "step-scan-failed":
      return {
        ...state,
        error: action.error.message,
        errorDetail: action.errorDetail,
        notice: null,
        scanStartedAt: null,
        stepDetectionState: { status: "failed", error: action.error },
      }

    case "step-scan-progressed":
      return {
        ...state,
        stepDetectionState: { status: "processing", progress: action.progress },
      }

    case "step-scan-succeeded":
      return {
        ...state,
        calloutMultipliers: pruneCalloutMultipliers(
          state.calloutMultipliers,
          action.result,
        ),
        error: null,
        errorDetail: null,
        notice: action.notice,
        partExtractionState: action.hasCurrentPartExtraction
          ? { status: "ready" }
          : { status: "idle" },
        scanStartedAt: null,
        staleRerunDetectorVersion: action.isCurrentDetectorResult
          ? null
          : state.staleRerunDetectorVersion,
        staleRerunPartExtractorVersion: action.hasCurrentPartExtraction
          ? null
          : state.staleRerunPartExtractorVersion,
        stepDetectionState: { status: "ready", result: action.result },
      }

    case "step-scan-started":
      return {
        ...state,
        partExtractionState: { status: "idle" },
        scanClockNow: action.startedAt,
        scanStartedAt: action.startedAt,
        stepDetectionState: { status: "processing", progress: null },
      }
  }
}

export function formatErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    const cause = "cause" in error ? error.cause : null
    const causeDetail = cause ? `; caused by ${formatErrorDetail(cause)}` : ""
    const stack = error.stack ? `; stack ${error.stack}` : ""

    return `${error.name}: ${error.message}${causeDetail}${stack}`
  }

  return String(error)
}
