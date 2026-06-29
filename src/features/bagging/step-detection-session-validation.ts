import type { StepCalloutDetectionResult } from "@/features/steps/step-detection-contracts"

export function isStepCalloutDetectionResult(value: unknown): value is StepCalloutDetectionResult {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.detectorVersion === "string" &&
    isOptionalString(value.partExtractorVersion) &&
    isOptionalString(value.partColorCalibrationVersion) &&
    isFiniteNumber(value.pageCount) &&
    (value.pageLimit === null || isFiniteNumber(value.pageLimit)) &&
    isNumberArray(value.scannedPageNumbers) &&
    isNumberArray(value.skippedPageNumbers) &&
    (value.status === "detected" || value.status === "empty") &&
    Array.isArray(value.pagePreviews) &&
    value.pagePreviews.every(isStepPagePreview) &&
    Array.isArray(value.pageAttentionItems) &&
    value.pageAttentionItems.every(isStepPageAttentionItem) &&
    (
      value.sectionBoundaryHints === undefined ||
      (
        Array.isArray(value.sectionBoundaryHints) &&
        value.sectionBoundaryHints.every(isStepSectionBoundaryHint)
      )
    ) &&
    Array.isArray(value.callouts) &&
    value.callouts.every(isDetectedStepCallout) &&
    isOptionalTiming(value.timing) &&
    isOptionalTiming(value.previewTiming) &&
    isOptionalQualitySummary(value.qualitySummary)
  )
}

function isStepPagePreview(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.pageNumber) &&
    isStepImagePreview(value)
  )
}

function isStepImagePreview(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height) &&
    isOptionalString(value.imageDataUrl)
  )
}

function isStepPageAttentionItem(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isFiniteNumber(value.pageNumber) &&
    value.kind === "possible-step-multiplier" &&
    value.source === "raster" &&
    typeof value.text === "string" &&
    isFiniteNumber(value.value) &&
    isFiniteNumber(value.confidence) &&
    isSourceRegion(value.sourceRegion)
  )
}

function isStepSectionBoundaryHint(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isFiniteNumber(value.pageNumber) &&
    value.position === "before-page" &&
    value.kind === "off-style-rejected-callout" &&
    isFiniteNumber(value.confidence) &&
    (
      value.sourceRegion === undefined ||
      isSourceRegion(value.sourceRegion)
    )
  )
}

function isDetectedStepCallout(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isFiniteNumber(value.pageNumber) &&
    isFiniteNumber(value.indexOnPage) &&
    isFiniteNumber(value.stepIndex) &&
    isFiniteNumber(value.confidence) &&
    isSourceRegion(value.sourceRegion) &&
    isImageCrop(value.crop) &&
    isInferredCalloutBackground(value.inferredBackground) &&
    Array.isArray(value.partItems) &&
    value.partItems.every(isDetectedStepCalloutPartItem)
  )
}

function isDetectedStepCalloutPartItem(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isFiniteNumber(value.indexOnCallout) &&
    isFiniteNumber(value.confidence) &&
    (
      value.detectedColor === undefined ||
      isDetectedPartColor(value.detectedColor)
    ) &&
    isSourceRegion(value.sourceRegion) &&
    isSourceRegion(value.partRegion) &&
    (
      value.partCrop === undefined ||
      isImageCrop(value.partCrop)
    ) &&
    (
      value.partImage === undefined ||
      isPartImage(value.partImage)
    ) &&
    isQuantityLabel(value.quantityLabel) &&
    isQuantity(value.quantity)
  )
}

function isDetectedPartColor(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.family === "string" &&
    typeof value.name === "string" &&
    (value.status === "exact" || value.status === "family" || value.status === "review") &&
    isFiniteNumber(value.confidence) &&
    isOptionalString(value.manualClassId) &&
    isOptionalBoolean(value.manualClassTrusted) &&
    isOptionalString(value.swatchHex)
  )
}

function isPartImage(value: unknown): boolean {
  return (
    isRecord(value) &&
    isSourceRegion(value.region) &&
    isOptionalString(value.imageDataUrl) &&
    (
      value.alphaMask === undefined ||
      isAlphaMask(value.alphaMask)
    )
  )
}

function isAlphaMask(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.height) &&
    isFiniteNumber(value.width) &&
    isAlphaData(value.data)
  )
}

function isAlphaData(value: unknown): boolean {
  if (value instanceof Uint8ClampedArray) {
    return true
  }

  if (Array.isArray(value)) {
    return value.every(isFiniteNumber)
  }

  return isNumberRecord(value)
}

function isQuantityLabel(value: unknown): boolean {
  return (
    isRecord(value) &&
    isSourceRegion(value.region) &&
    isOptionalString(value.imageDataUrl) &&
    (
      value.crop === undefined ||
      isImageCrop(value.crop)
    )
  )
}

function isQuantity(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.value === null || isFiniteNumber(value.value)) &&
    typeof value.text === "string" &&
    isFiniteNumber(value.confidence)
  )
}

function isImageCrop(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOptionalString(value.imageDataUrl) &&
    isSourceRegion(value.region)
  )
}

function isSourceRegion(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height)
  )
}

function isInferredCalloutBackground(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRgbColor(value.rgb) &&
    typeof value.hex === "string" &&
    isFiniteNumber(value.confidence)
  )
}

function isRgbColor(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.r) &&
    isFiniteNumber(value.g) &&
    isFiniteNumber(value.b)
  )
}

function isOptionalTiming(value: unknown): boolean {
  return value === undefined || isStepProcessingTimingSummary(value)
}

function isStepProcessingTimingSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    isFiniteNumber(value.totalMs) &&
    isNumberRecord(value.phaseMs) &&
    isNumberRecord(value.counts)
  )
}

function isOptionalQualitySummary(value: unknown): boolean {
  if (value === undefined) {
    return true
  }

  return (
    isRecord(value) &&
    (
      value.firstBuildStepPageNumber === null ||
      isFiniteNumber(value.firstBuildStepPageNumber)
    ) &&
    Array.isArray(value.inferredCalloutBackgrounds) &&
    value.inferredCalloutBackgrounds.every(isInferredCalloutBackground)
  )
}

function isNumberArray(value: unknown): boolean {
  return Array.isArray(value) && value.every(isFiniteNumber)
}

function isNumberRecord(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every(isFiniteNumber)
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string"
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean"
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
