import { describe, expect, it } from "vitest"
import {
  analysisJobStateReducer,
  createInitialAnalysisJobState,
} from "./analysis-job-state"
import { PdfIntakeError, type PdfMetadata } from "@/features/pdf/pdf-intake"
import type {
  DetectedStepCallout,
  DetectedStepCalloutPartItem,
  StepCalloutDetectionResult,
} from "@/features/steps/step-detection-contracts"

describe("analysisJobStateReducer", () => {
  it("rejects an invalid selected file", () => {
    const error = new PdfIntakeError("invalid-type", "Choose a PDF manual to continue.")

    const state = analysisJobStateReducer(createInitialAnalysisJobState(100), {
      type: "manual-invalid",
      error,
      errorDetail: "invalid type",
    })

    expect(state.manualFile).toBeNull()
    expect(state.intakeState).toEqual({ status: "failed", error })
    expect(state.stepDetectionState).toEqual({ status: "idle" })
    expect(state.partExtractionState).toEqual({ status: "idle" })
    expect(state.error).toBe(error.message)
    expect(state.errorDetail).toBe("invalid type")
  })

  it("resets analysis-owned state for a fresh upload", () => {
    const state = analysisJobStateReducer({
      ...createInitialAnalysisJobState(100),
      calloutMultipliers: { old: 2 },
      error: "previous error",
      errorDetail: "previous detail",
      notice: "previous notice",
      staleRerunDetectorVersion: "old-detector",
      staleRerunPartExtractorVersion: "old-parts",
      stepDetectionState: { status: "ready", result: resultWithCallouts(["old"]) },
    }, {
      type: "pdf-intake-started",
    })

    expect(state.calloutMultipliers).toEqual({})
    expect(state.error).toBeNull()
    expect(state.errorDetail).toBeNull()
    expect(state.notice).toBeNull()
    expect(state.intakeState).toEqual({ status: "processing" })
    expect(state.stepDetectionState).toEqual({ status: "idle" })
    expect(state.partExtractionState).toEqual({ status: "idle" })
    expect(state.staleRerunDetectorVersion).toBeNull()
    expect(state.staleRerunPartExtractorVersion).toBeNull()
  })

  it("purges private manual state", () => {
    const manualFile = pdfFile()
    const state = analysisJobStateReducer({
      ...createInitialAnalysisJobState(100),
      calloutMultipliers: { callout: 3 },
      error: "old error",
      errorDetail: "old detail",
      intakeState: { status: "ready", metadata: metadataFor(manualFile) },
      manualFile,
      notice: "old notice",
      scanStartedAt: 100,
      stepDetectionState: { status: "ready", result: resultWithCallouts(["callout"]) },
    }, {
      type: "purged",
    })

    expect(state.manualFile).toBeNull()
    expect(state.intakeState).toEqual({ status: "purged" })
    expect(state.stepDetectionState).toEqual({ status: "idle" })
    expect(state.partExtractionState).toEqual({ status: "idle" })
    expect(state.calloutMultipliers).toEqual({})
    expect(state.scanStartedAt).toBeNull()
    expect(state.error).toBeNull()
    expect(state.errorDetail).toBeNull()
    expect(state.notice).toBe("Manual removed. Private source bytes cleared from app state.")
  })

  it("records scan success and prunes stale multipliers", () => {
    const result = resultWithCallouts(["kept"])
    const processing = analysisJobStateReducer({
      ...createInitialAnalysisJobState(100),
      calloutMultipliers: { kept: 2, stale: 4 },
      error: "old error",
      errorDetail: "old detail",
      staleRerunDetectorVersion: "detector-old",
      staleRerunPartExtractorVersion: "parts-old",
    }, {
      type: "step-scan-started",
      startedAt: 200,
    })

    const state = analysisJobStateReducer(processing, {
      type: "step-scan-succeeded",
      hasCurrentPartExtraction: true,
      isCurrentDetectorResult: true,
      notice: "1 callout found.",
      result,
    })

    expect(state.stepDetectionState).toEqual({ status: "ready", result })
    expect(state.partExtractionState).toEqual({ status: "ready" })
    expect(state.calloutMultipliers).toEqual({ kept: 2 })
    expect(state.scanStartedAt).toBeNull()
    expect(state.error).toBeNull()
    expect(state.errorDetail).toBeNull()
    expect(state.notice).toBe("1 callout found.")
    expect(state.staleRerunDetectorVersion).toBeNull()
    expect(state.staleRerunPartExtractorVersion).toBeNull()
  })

  it("records scan cancellation", () => {
    const processing = analysisJobStateReducer(createInitialAnalysisJobState(100), {
      type: "step-scan-started",
      startedAt: 200,
    })

    const state = analysisJobStateReducer(processing, { type: "step-scan-cancelled" })

    expect(state.stepDetectionState).toEqual({ status: "cancelled" })
    expect(state.scanStartedAt).toBeNull()
    expect(state.notice).toBe("Step scan cancelled. Selected manual kept.")
  })

  it("records scan failure", () => {
    const error = new PdfIntakeError("unknown", "PDF intake failed. Retry or choose another manual.")
    const processing = analysisJobStateReducer(createInitialAnalysisJobState(100), {
      type: "step-scan-started",
      startedAt: 200,
    })

    const state = analysisJobStateReducer(processing, {
      type: "step-scan-failed",
      error,
      errorDetail: "stack",
    })

    expect(state.stepDetectionState).toEqual({ status: "failed", error })
    expect(state.scanStartedAt).toBeNull()
    expect(state.notice).toBeNull()
    expect(state.error).toBe(error.message)
    expect(state.errorDetail).toBe("stack")
  })

  it("records part extraction success and prunes multipliers", () => {
    const staleResult = resultWithCallouts(["kept"], { partExtractorVersion: undefined })
    const previewlessResult = { ...staleResult, pagePreviews: [] }
    const freshResult = resultWithCallouts(["kept"], { partItemsPerCallout: 1 })
    const ready = {
      ...createInitialAnalysisJobState(100),
      calloutMultipliers: { kept: 2, stale: 3 },
      staleRerunPartExtractorVersion: "missing|part-color-v1",
      stepDetectionState: { status: "ready", result: staleResult } as const,
    }

    const processing = analysisJobStateReducer(ready, {
      type: "part-extraction-started",
      previewlessResult,
    })
    const state = analysisJobStateReducer(processing, {
      type: "part-extraction-succeeded",
      notice: "1 part row detected.",
      result: freshResult,
    })

    expect(processing.stepDetectionState).toEqual({ status: "ready", result: previewlessResult })
    expect(state.stepDetectionState).toEqual({ status: "ready", result: freshResult })
    expect(state.partExtractionState).toEqual({ status: "ready" })
    expect(state.calloutMultipliers).toEqual({ kept: 2 })
    expect(state.staleRerunPartExtractorVersion).toBeNull()
    expect(state.notice).toBe("1 part row detected.")
  })

  it("records part extraction failure", () => {
    const error = new PdfIntakeError("unknown", "Part extraction failed. Retry or choose another manual.")
    const state = analysisJobStateReducer(createInitialAnalysisJobState(100), {
      type: "part-extraction-failed",
      error,
      errorDetail: "stack",
    })

    expect(state.partExtractionState).toEqual({ status: "failed", error })
    expect(state.notice).toBeNull()
    expect(state.error).toBe(error.message)
    expect(state.errorDetail).toBe("stack")
  })

  it("restores a current session result", () => {
    const manualFile = pdfFile()
    const result = resultWithCallouts(["kept"])
    const hydrated = analysisJobStateReducer(
      analysisJobStateReducer(createInitialAnalysisJobState(100), {
        type: "session-restore-started",
      }),
      {
        type: "session-restore-hydrated",
        calloutMultipliers: { kept: 2, stale: 3 },
        manualFile,
        metadata: metadataFor(manualFile),
        stepDetectionResult: result,
      },
    )

    const state = analysisJobStateReducer(hydrated, {
      type: "session-current-result-restored",
      hasCurrentPartExtraction: true,
      notice: "1 callout restored from saved session.",
      result,
    })

    expect(state.manualFile).toBe(manualFile)
    expect(state.intakeState).toEqual({ status: "ready", metadata: metadataFor(manualFile) })
    expect(state.calloutMultipliers).toEqual({ kept: 2 })
    expect(state.stepDetectionState).toEqual({ status: "ready", result })
    expect(state.partExtractionState).toEqual({ status: "ready" })
    expect(state.notice).toBe("1 callout restored from saved session.")
  })

  it("hydrates stale restored sessions before rerun", () => {
    const manualFile = pdfFile()
    const staleResult = resultWithCallouts(["kept"], { detectorVersion: "detector-old" })
    const hydrated = analysisJobStateReducer(createInitialAnalysisJobState(100), {
      type: "session-restore-hydrated",
      calloutMultipliers: { kept: 2 },
      manualFile,
      metadata: metadataFor(manualFile),
      stepDetectionResult: staleResult,
    })

    const state = analysisJobStateReducer(hydrated, {
      type: "step-scan-started",
      startedAt: 250,
    })

    expect(state.manualFile).toBe(manualFile)
    expect(state.intakeState).toEqual({ status: "ready", metadata: metadataFor(manualFile) })
    expect(state.calloutMultipliers).toEqual({ kept: 2 })
    expect(state.stepDetectionState).toEqual({ status: "processing", progress: null })
    expect(state.scanStartedAt).toBe(250)
  })
})

function pdfFile(): File {
  return new File(["%PDF-1.7"], "manual.pdf", { type: "application/pdf" })
}

function metadataFor(file: File): PdfMetadata {
  return {
    author: null,
    fileName: file.name,
    pageCount: 1,
    sizeBytes: file.size,
    title: null,
  }
}

function resultWithCallouts(
  calloutIds: string[],
  options: {
    detectorVersion?: string
    partExtractorVersion?: string
    partItemsPerCallout?: number
  } = {},
): StepCalloutDetectionResult {
  const {
    detectorVersion = "detector-v1",
    partExtractorVersion = "part-extractor-v1",
    partItemsPerCallout = 0,
  } = options

  return {
    callouts: calloutIds.map((id, index) => callout(id, index, partItemsPerCallout)),
    detectorVersion,
    pageAttentionItems: [],
    pageCount: 1,
    pageLimit: null,
    pagePreviews: [{ height: 140, pageNumber: 1, width: 100 }],
    partColorCalibrationVersion: "part-color-v1",
    partExtractorVersion,
    qualitySummary: {
      firstBuildStepPageNumber: 1,
      inferredCalloutBackgrounds: [],
    },
    scannedPageNumbers: [1],
    skippedPageNumbers: [],
    status: calloutIds.length > 0 ? "detected" : "empty",
  }
}

function callout(id: string, indexOnPage: number, partItemsPerCallout: number): DetectedStepCallout {
  return {
    confidence: 1,
    crop: { region: region() },
    id,
    indexOnPage,
    inferredBackground: {
      confidence: 1,
      hex: "#ffffff",
      rgb: { b: 255, g: 255, r: 255 },
    },
    pageNumber: 1,
    partItems: Array.from({ length: partItemsPerCallout }, (_value, index) =>
      partItem(`${id}-part-${index + 1}`, index),
    ),
    sourceRegion: region(),
    stepIndex: indexOnPage + 1,
  }
}

function partItem(id: string, indexOnCallout: number): DetectedStepCalloutPartItem {
  return {
    confidence: 1,
    id,
    indexOnCallout,
    partRegion: region(),
    quantity: {
      confidence: 1,
      text: "1x",
      value: 1,
    },
    quantityLabel: {
      region: region(),
    },
    sourceRegion: region(),
  }
}

function region() {
  return {
    height: 10,
    width: 10,
    x: 0,
    y: 0,
  }
}
