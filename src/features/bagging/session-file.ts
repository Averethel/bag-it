import type { PartsListPartPreview } from "./browser-catalogue"
import type { PartsListPdfExtractionResult } from "./parts-list-pdf-extraction"
import type { PdfIntakeJobSnapshot, PdfIntakeMetadata } from "./pdf-intake"
import type { StepCalloutDetectionResult } from "./step-callout-detection"

export const baggingSessionFileKind = "bag-it-session"
export const baggingSessionFileVersion = 1

export type BaggingSessionFileInput = {
  attemptedPartPreviewKeys: ReadonlySet<string>
  checkedRowIds: ReadonlySet<string>
  currentExtractorVersion: string
  jobSnapshot: PdfIntakeJobSnapshot | null
  manualFile: File
  metadata: PdfIntakeMetadata | null
  partPreviewByKey: ReadonlyMap<string, PartsListPartPreview>
  partsListResult: PartsListPdfExtractionResult | null
  stepCalloutResult?: StepCalloutDetectionResult | null
}

export type RestoredBaggingSession = {
  attemptedPartPreviewKeys: ReadonlySet<string>
  checkedRowIds: ReadonlySet<string>
  jobSnapshot: PdfIntakeJobSnapshot | null
  manualFile: File
  metadata: PdfIntakeMetadata | null
  partPreviewByKey: ReadonlyMap<string, PartsListPartPreview>
  partsListResult: PartsListPdfExtractionResult | null
  savedExtractorVersion: string | null
  savedStepCalloutDetectorVersion: string | null
  stepCalloutResult: StepCalloutDetectionResult | null
}

type BaggingSessionFile = {
  analysis: {
    attemptedPartPreviewKeys: string[]
    extractorVersion: string | null
    jobSnapshot: PdfIntakeJobSnapshot | null
    metadata: PdfIntakeMetadata | null
    partPreviewEntries: [string, PartsListPartPreview][]
    partsListResult: PartsListPdfExtractionResult | null
    stepCalloutDetectorVersion?: string | null
    stepCalloutResult?: StepCalloutDetectionResult | null
  }
  createdAt: string
  currentExtractorVersion: string
  kind: typeof baggingSessionFileKind
  manual: {
    dataBase64: string
    fileName: string
    lastModified: number
    sizeBytes: number
    type: string
  }
  partCompletion: {
    checkedRowIds: string[]
  }
  version: typeof baggingSessionFileVersion
}

export async function createBaggingSessionFile({
  attemptedPartPreviewKeys,
  checkedRowIds,
  currentExtractorVersion,
  jobSnapshot,
  manualFile,
  metadata,
  partPreviewByKey,
  partsListResult,
  stepCalloutResult = null,
}: BaggingSessionFileInput) {
  return {
    analysis: {
      attemptedPartPreviewKeys: [...attemptedPartPreviewKeys],
      extractorVersion: partsListResult?.extractorVersion ?? null,
      jobSnapshot,
      metadata,
      partPreviewEntries: [...partPreviewByKey.entries()],
      partsListResult,
      stepCalloutDetectorVersion: stepCalloutResult?.detectorVersion ?? null,
      stepCalloutResult,
    },
    createdAt: new Date().toISOString(),
    currentExtractorVersion,
    kind: baggingSessionFileKind,
    manual: {
      dataBase64: encodeBytesToBase64(new Uint8Array(await manualFile.arrayBuffer())),
      fileName: manualFile.name,
      lastModified: manualFile.lastModified,
      sizeBytes: manualFile.size,
      type: manualFile.type || "application/pdf",
    },
    partCompletion: {
      checkedRowIds: [...checkedRowIds],
    },
    version: baggingSessionFileVersion,
  } satisfies BaggingSessionFile
}

export async function restoreBaggingSessionFile(file: File): Promise<RestoredBaggingSession> {
  const parsed = JSON.parse(await file.text()) as unknown
  assertBaggingSessionFile(parsed)

  const manualBytes = decodeBase64ToBytes(parsed.manual.dataBase64)
  const manualFile = new File([manualBytes], parsed.manual.fileName, {
    lastModified: parsed.manual.lastModified,
    type: parsed.manual.type || "application/pdf",
  })

  return {
    attemptedPartPreviewKeys: new Set(parsed.analysis.attemptedPartPreviewKeys),
    checkedRowIds: new Set(parsed.partCompletion.checkedRowIds),
    jobSnapshot: parsed.analysis.jobSnapshot,
    manualFile,
    metadata: parsed.analysis.metadata,
    partPreviewByKey: new Map(parsed.analysis.partPreviewEntries),
    partsListResult: parsed.analysis.partsListResult,
    savedExtractorVersion: parsed.analysis.extractorVersion,
    savedStepCalloutDetectorVersion: parsed.analysis.stepCalloutDetectorVersion ?? null,
    stepCalloutResult: getRestorableStepCalloutResult(parsed.analysis.stepCalloutResult ?? null),
  }
}

export function isRestoredAnalysisCurrent(
  session: Pick<RestoredBaggingSession, "partsListResult" | "savedExtractorVersion">,
  currentExtractorVersion: string,
) {
  return (
    !session.partsListResult ||
    (
      session.savedExtractorVersion === currentExtractorVersion &&
      Boolean(session.partsListResult.normalization)
    )
  )
}

export function isRestoredStepAnalysisCurrent(
  session: Pick<RestoredBaggingSession, "savedStepCalloutDetectorVersion" | "stepCalloutResult">,
  currentStepCalloutDetectorVersion: string,
) {
  return Boolean(
    isRestorableStepCalloutResult(session.stepCalloutResult) &&
      session.stepCalloutResult.detectorVersion === currentStepCalloutDetectorVersion &&
      session.savedStepCalloutDetectorVersion === currentStepCalloutDetectorVersion,
  )
}

export function getBaggingSessionDownloadName(manualName: string | null | undefined) {
  const baseName = (manualName || "bag-it-session")
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)

  return `${baseName || "bag-it-session"}.bagit.json`
}

function assertBaggingSessionFile(value: unknown): asserts value is BaggingSessionFile {
  if (!value || typeof value !== "object") {
    throw new Error("Choose a valid Bag It session file.")
  }

  const session = value as Partial<BaggingSessionFile>
  if (
    session.kind !== baggingSessionFileKind ||
    session.version !== baggingSessionFileVersion ||
    !session.manual ||
    typeof session.manual.dataBase64 !== "string" ||
    typeof session.manual.fileName !== "string" ||
    !session.analysis ||
    !Array.isArray(session.analysis.attemptedPartPreviewKeys) ||
    !Array.isArray(session.analysis.partPreviewEntries) ||
    !session.partCompletion ||
    !Array.isArray(session.partCompletion.checkedRowIds)
  ) {
    throw new Error("Choose a valid Bag It session file.")
  }
}

function getRestorableStepCalloutResult(value: unknown): StepCalloutDetectionResult | null {
  return isRestorableStepCalloutResult(value) ? value : null
}

function isRestorableStepCalloutResult(value: unknown): value is StepCalloutDetectionResult {
  if (!value || typeof value !== "object") {
    return false
  }

  const result = value as Partial<StepCalloutDetectionResult>
  return (
    typeof result.detectorVersion === "string" &&
    typeof result.pageCount === "number" &&
    (typeof result.pageLimit === "number" || result.pageLimit === null) &&
    Array.isArray(result.scannedPageNumbers) &&
    Array.isArray(result.skippedBomPageNumbers) &&
    (result.status === "detected" || result.status === "empty") &&
    Array.isArray(result.callouts) &&
    result.callouts.every(isRestorableStepCallout)
  )
}

function isRestorableStepCallout(value: unknown) {
  if (!value || typeof value !== "object") {
    return false
  }

  const callout = value as Partial<StepCalloutDetectionResult["callouts"][number]>
  return (
    typeof callout.id === "string" &&
    typeof callout.stepIndex === "number" &&
    Number.isFinite(callout.stepIndex) &&
    typeof callout.pageNumber === "number" &&
    typeof callout.indexOnPage === "number" &&
    isSessionCrop(callout.crop) &&
    isSessionStepRegion(callout.sourceRegion) &&
    isSessionStepImage(callout.sourceImage) &&
    Array.isArray(callout.partItems) &&
    callout.partItems.every(isRestorableStepCalloutPartItem)
  )
}

function isRestorableStepCalloutPartItem(value: unknown) {
  if (!value || typeof value !== "object") {
    return false
  }

  const item = value as Partial<StepCalloutDetectionResult["callouts"][number]["partItems"][number]>
  return (
    typeof item.id === "string" &&
    typeof item.indexOnCallout === "number" &&
    isSessionCrop(item.partCrop) &&
    isSessionStepRegion(item.partRegion) &&
    isSessionStepRegion(item.sourceRegion) &&
    Boolean(item.detectedColor) &&
    typeof item.detectedColor?.name === "string" &&
    typeof item.detectedColor?.hex === "string" &&
    typeof item.detectedColor?.confidence === "number" &&
    Boolean(item.quantity) &&
    typeof item.quantity?.confidence === "number" &&
    (typeof item.quantity?.value === "number" || item.quantity?.value === null) &&
    Boolean(item.quantityLabel) &&
    isSessionCrop(item.quantityLabel?.crop) &&
    isSessionStepRegion(item.quantityLabel?.region)
  )
}

function isSessionCrop(value: unknown) {
  if (!value || typeof value !== "object") {
    return false
  }

  const crop = value as { dataUrl?: unknown; height?: unknown; width?: unknown }
  return typeof crop.dataUrl === "string" && typeof crop.height === "number" && typeof crop.width === "number"
}

function isSessionStepRegion(value: unknown) {
  if (!value || typeof value !== "object") {
    return false
  }

  const region = value as { height?: unknown; unit?: unknown; width?: unknown; x?: unknown; y?: unknown }
  return (
    region.unit === "step_pixel" &&
    typeof region.height === "number" &&
    typeof region.width === "number" &&
    typeof region.x === "number" &&
    typeof region.y === "number"
  )
}

function isSessionStepImage(value: unknown) {
  if (!value || typeof value !== "object") {
    return false
  }

  const image = value as { height?: unknown; unit?: unknown; width?: unknown }
  return image.unit === "step_pixel" && typeof image.height === "number" && typeof image.width === "number"
}

function encodeBytesToBase64(bytes: Uint8Array) {
  let binary = ""
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  return btoa(binary)
}

function decodeBase64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}
