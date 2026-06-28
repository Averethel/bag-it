import {
  PdfIntakeError,
  type PdfMetadata,
  normalizePdfIntakeError,
  validatePdfFile,
} from "@/features/pdf/pdf-intake"
import type { StepCalloutDetectionResult } from "@/features/steps/step-detection-contracts"
import { stripRuntimePreviewObjectUrls } from "@/features/steps/preview-object-urls"
import {
  sanitizeBagCompletionAnchors,
  type StepCalloutBagCompletionAnchor,
} from "./bag-completion-anchors"
import { isStepCalloutDetectionResult } from "./step-detection-session-validation"
import {
  sanitizeCheckedBagRowIds,
} from "./step-callout-bagging"
import {
  hasCalloutMultipliers,
  sanitizeCalloutMultipliers,
  type StepCalloutMultiplierMap,
} from "./step-callout-multipliers"

const SESSION_KIND = "bag-it-session"
const SESSION_VERSION = 1

type PdfIntakeSessionFile = {
  kind: typeof SESSION_KIND
  version: typeof SESSION_VERSION
  savedAt: string
  manual: {
    fileName: string
    mimeType: string
    sizeBytes: number
    lastModified: number
    dataBase64: string
  }
  metadata: PdfMetadata
  stepDetectionResult?: StepCalloutDetectionResult
  calloutMultipliers?: StepCalloutMultiplierMap
  checkedBagRowIds?: string[]
  checkedBagCompletionAnchors?: StepCalloutBagCompletionAnchor[]
}

export type RestoredPdfIntakeSession = {
  manualFile: File
  metadata: PdfMetadata
  savedAt: string
  stepDetectionResult: StepCalloutDetectionResult | null
  calloutMultipliers: StepCalloutMultiplierMap
  checkedBagRowIds: string[]
  checkedBagCompletionAnchors: StepCalloutBagCompletionAnchor[]
}

export async function createPdfIntakeSessionFile({
  calloutMultipliers,
  checkedBagCompletionAnchors,
  checkedBagRowIds,
  manualFile,
  metadata,
  stepDetectionResult,
}: {
  calloutMultipliers?: StepCalloutMultiplierMap | null
  checkedBagCompletionAnchors?: StepCalloutBagCompletionAnchor[] | null
  checkedBagRowIds?: string[] | null
  manualFile: File
  metadata: PdfMetadata
  stepDetectionResult?: StepCalloutDetectionResult | null
}): Promise<Blob> {
  const validation = validatePdfFile(manualFile)
  if (!validation.ok) {
    throw validation.error
  }
  const normalizedMultipliers = sanitizeCalloutMultipliers(calloutMultipliers)
  const normalizedCheckedRowIds = sanitizeCheckedBagRowIds(checkedBagRowIds)
  const normalizedCompletionAnchors = sanitizeBagCompletionAnchors(
    checkedBagCompletionAnchors,
  )

  const session: PdfIntakeSessionFile = {
    kind: SESSION_KIND,
    version: SESSION_VERSION,
    savedAt: new Date().toISOString(),
    manual: {
      fileName: manualFile.name,
      mimeType: manualFile.type || "application/pdf",
      sizeBytes: manualFile.size,
      lastModified: manualFile.lastModified,
      dataBase64: arrayBufferToBase64(await readFileAsArrayBuffer(manualFile)),
    },
    metadata,
    ...(stepDetectionResult
      ? { stepDetectionResult: stripRuntimePreviewObjectUrls(stepDetectionResult) }
      : {}),
    ...(hasCalloutMultipliers(normalizedMultipliers)
      ? { calloutMultipliers: normalizedMultipliers }
      : {}),
    ...(normalizedCheckedRowIds.length > 0
      ? { checkedBagRowIds: normalizedCheckedRowIds }
      : {}),
    ...(normalizedCompletionAnchors.length > 0
      ? { checkedBagCompletionAnchors: normalizedCompletionAnchors }
      : {}),
  }

  return new Blob([JSON.stringify(session, null, 2)], {
    type: "application/json",
  })
}

export async function restorePdfIntakeSessionFile(
  sessionFile: File,
): Promise<RestoredPdfIntakeSession> {
  try {
    const parsed = JSON.parse(await readFileAsText(sessionFile)) as unknown
    const session = parseSession(parsed)
    const manualBytes = base64ToBytes(session.manual.dataBase64)
    const manualBuffer = manualBytes.buffer.slice(
      manualBytes.byteOffset,
      manualBytes.byteOffset + manualBytes.byteLength,
    ) as ArrayBuffer
    const manualBlob = new Blob([manualBuffer], {
      type: session.manual.mimeType || "application/pdf",
    })
    const manualFile = new File([manualBlob], session.manual.fileName, {
      type: session.manual.mimeType || "application/pdf",
      lastModified: session.manual.lastModified,
    })
    const validation = validatePdfFile(manualFile)

    if (!validation.ok) {
      throw validation.error
    }

    return {
      manualFile,
      metadata: session.metadata,
      savedAt: session.savedAt,
      stepDetectionResult: session.stepDetectionResult ?? null,
      calloutMultipliers: session.calloutMultipliers ?? {},
      checkedBagRowIds: session.checkedBagRowIds ?? [],
      checkedBagCompletionAnchors: session.checkedBagCompletionAnchors ?? [],
    }
  } catch (error) {
    throw normalizeSessionError(error)
  }
}

export function getSessionDownloadName(fileName: string): string {
  const baseName = fileName
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)

  return `${baseName || "manual"}.bagit-session.json`
}

function parseSession(value: unknown): PdfIntakeSessionFile {
  if (!isRecord(value)) {
    throw malformedSession()
  }

  if (value.kind !== SESSION_KIND || value.version !== SESSION_VERSION) {
    throw malformedSession()
  }

  if (
    typeof value.savedAt !== "string" ||
    !isRecord(value.manual) ||
    !isRecord(value.metadata)
  ) {
    throw malformedSession()
  }

  const manual = value.manual
  const metadata = value.metadata

  if (
    typeof manual.fileName !== "string" ||
    typeof manual.mimeType !== "string" ||
    typeof manual.sizeBytes !== "number" ||
    typeof manual.lastModified !== "number" ||
    typeof manual.dataBase64 !== "string" ||
    typeof metadata.fileName !== "string" ||
    typeof metadata.sizeBytes !== "number" ||
    typeof metadata.pageCount !== "number" ||
    (metadata.title !== null && typeof metadata.title !== "string") ||
    (metadata.author !== null && typeof metadata.author !== "string")
  ) {
    throw malformedSession()
  }

  let stepDetectionResult: StepCalloutDetectionResult | undefined
  const hasStepDetectionResult = Object.prototype.hasOwnProperty.call(value, "stepDetectionResult")

  if (hasStepDetectionResult) {
    if (!isStepCalloutDetectionResult(value.stepDetectionResult)) {
      throw malformedSession()
    }

    stepDetectionResult = value.stepDetectionResult
  }

  return {
    kind: SESSION_KIND,
    version: SESSION_VERSION,
    savedAt: value.savedAt,
    manual: {
      fileName: manual.fileName,
      mimeType: manual.mimeType,
      sizeBytes: manual.sizeBytes,
      lastModified: manual.lastModified,
      dataBase64: manual.dataBase64,
    },
    metadata: {
      fileName: metadata.fileName,
      sizeBytes: metadata.sizeBytes,
      pageCount: metadata.pageCount,
      title: metadata.title,
      author: metadata.author,
    },
    ...(stepDetectionResult
      ? { stepDetectionResult }
      : {}),
    calloutMultipliers: sanitizeCalloutMultipliers(value.calloutMultipliers),
    checkedBagRowIds: sanitizeCheckedBagRowIds(value.checkedBagRowIds),
    checkedBagCompletionAnchors: sanitizeBagCompletionAnchors(
      value.checkedBagCompletionAnchors,
    ),
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 8192
  let binary = ""

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return btoa(binary)
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer()
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.addEventListener("load", () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result)
        return
      }

      reject(malformedSession())
    })
    reader.addEventListener("error", () => reject(reader.error ?? malformedSession()))
    reader.readAsArrayBuffer(file)
  })
}

function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text()
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }

      reject(malformedSession())
    })
    reader.addEventListener("error", () => reject(reader.error ?? malformedSession()))
    reader.readAsText(file)
  })
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function malformedSession(): PdfIntakeError {
  return new PdfIntakeError(
    "unknown",
    "Session file could not be read. Choose a Bag It session file.",
  )
}

function normalizeSessionError(error: unknown): PdfIntakeError {
  if (error instanceof SyntaxError) {
    return malformedSession()
  }

  return normalizePdfIntakeError(error)
}
