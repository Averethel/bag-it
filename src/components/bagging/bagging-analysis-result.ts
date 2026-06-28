import { PdfIntakeError, normalizePdfIntakeError } from "@/features/pdf/pdf-intake"
import type { StepCalloutDetectionResult } from "@/features/steps/step-detection-contracts"

export type PartExtractionFreshnessDetail = {
  key: string
  savedPartColorCalibrationVersion: string
  savedPartExtractorVersion: string
}

export function isCurrentStepDetectionResult(
  result: StepCalloutDetectionResult,
  detectorVersion: string,
): boolean {
  return result.detectorVersion === detectorVersion
}

export function isCurrentPartExtractionResult(
  result: StepCalloutDetectionResult,
  partExtractorVersion: string,
  partColorCalibrationVersion: string,
): boolean {
  return (
    result.partExtractorVersion === partExtractorVersion &&
    result.partColorCalibrationVersion === partColorCalibrationVersion
  )
}

export function readPartExtractionFreshnessDetail(
  result: StepCalloutDetectionResult,
): PartExtractionFreshnessDetail {
  const savedPartExtractorVersion = result.partExtractorVersion ?? "missing"
  const savedPartColorCalibrationVersion = result.partColorCalibrationVersion ?? "missing"

  return {
    key: `${savedPartExtractorVersion}|${savedPartColorCalibrationVersion}`,
    savedPartColorCalibrationVersion,
    savedPartExtractorVersion,
  }
}

export function formatStalePartExtractionNotice(
  detail: PartExtractionFreshnessDetail,
  expectedPartExtractorVersion: string,
): string {
  if (detail.savedPartExtractorVersion === "missing") {
    return "Extracting part rows from detected callouts."
  }

  if (detail.savedPartColorCalibrationVersion === "missing") {
    return "Part color calibration changed. Extracting part rows from restored callouts."
  }

  if (detail.savedPartExtractorVersion !== expectedPartExtractorVersion) {
    return "Part detector changed. Extracting part rows from restored callouts."
  }

  return "Part color calibration changed. Extracting part rows from restored callouts."
}

export function formatStalePartExtractionStatusDetail(
  detail: PartExtractionFreshnessDetail,
  expectedPartExtractorVersion: string,
): string {
  if (detail.savedPartExtractorVersion === "missing") {
    return "Queued part extraction"
  }

  if (detail.savedPartExtractorVersion !== expectedPartExtractorVersion) {
    return "Part detector changed"
  }

  return "Part color calibration changed"
}

export function formatStalePartExtractionResultError(
  result: StepCalloutDetectionResult,
  expectedPartExtractorVersion: string,
  expectedPartColorCalibrationVersion: string,
): string {
  return [
    "Part extraction returned stale versions.",
    `partExtractor=${result.partExtractorVersion ?? "missing"}/${expectedPartExtractorVersion}`,
    `partColor=${result.partColorCalibrationVersion ?? "missing"}/${expectedPartColorCalibrationVersion}`,
  ].join(" ")
}

export function countDetectedPartItems(result: StepCalloutDetectionResult): number {
  return result.callouts.reduce((total, callout) => total + callout.partItems.length, 0)
}

export function isSameAnalysisResult(
  current: StepCalloutDetectionResult,
  original: StepCalloutDetectionResult,
): boolean {
  return (
    current.detectorVersion === original.detectorVersion &&
    current.partExtractorVersion === original.partExtractorVersion &&
    current.partColorCalibrationVersion === original.partColorCalibrationVersion &&
    current.pageCount === original.pageCount &&
    current.callouts.length === original.callouts.length &&
    current.scannedPageNumbers.length === original.scannedPageNumbers.length
  )
}

export function normalizePartExtractionError(error: unknown): PdfIntakeError {
  const normalized = normalizePdfIntakeError(error)

  if (normalized.code !== "unknown") {
    return normalized
  }

  return new PdfIntakeError(
    "unknown",
    "Part extraction failed. Retry or choose another manual.",
    { cause: error },
  )
}
