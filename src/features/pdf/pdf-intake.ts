export const DEFAULT_MAX_PDF_BYTES = 2 * 100 * 1024 * 1024

export type PdfIntakeErrorCode =
  | "missing-file"
  | "invalid-type"
  | "empty-file"
  | "too-large"
  | "corrupt"
  | "encrypted"
  | "cancelled"
  | "expired"
  | "unknown"

export type PdfMetadata = {
  fileName: string
  sizeBytes: number
  pageCount: number
  title: string | null
  author: string | null
}

export type PdfFileValidation =
  | {
      ok: true
      fileName: string
      sizeBytes: number
    }
  | {
      ok: false
      error: PdfIntakeError
    }

export class PdfIntakeError extends Error {
  readonly code: PdfIntakeErrorCode

  constructor(code: PdfIntakeErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "PdfIntakeError"
    this.code = code
  }
}

export function validatePdfFile(
  file: File | null,
  options: { maxBytes?: number } = {},
): PdfFileValidation {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_PDF_BYTES

  if (!file) {
    return failure("missing-file", "Choose a PDF manual to continue.")
  }

  if (!isPdfFile(file)) {
    return failure("invalid-type", "Choose a PDF manual to continue.")
  }

  if (file.size === 0) {
    return failure("empty-file", "The selected PDF is empty. Choose another manual.")
  }

  if (file.size > maxBytes) {
    return failure(
      "too-large",
      `The selected PDF is ${formatBytes(file.size)}. Maximum supported size is ${formatBytes(maxBytes)}.`,
    )
  }

  return {
    ok: true,
    fileName: file.name,
    sizeBytes: file.size,
  }
}

export function normalizePdfIntakeError(error: unknown): PdfIntakeError {
  if (error instanceof PdfIntakeError) {
    return error
  }

  if (isAbortError(error)) {
    return new PdfIntakeError("cancelled", "PDF intake cancelled. Selected manual kept.", {
      cause: error,
    })
  }

  if (hasErrorName(error, "PasswordException")) {
    return new PdfIntakeError(
      "encrypted",
      "Encrypted PDFs are not supported yet. Choose an unlocked manual.",
      { cause: error },
    )
  }

  if (hasErrorName(error, "InvalidPDFException") || hasErrorName(error, "MissingPDFException")) {
    return new PdfIntakeError(
      "corrupt",
      "PDF could not be read. Choose another file or retry.",
      { cause: error },
    )
  }

  return new PdfIntakeError("unknown", "PDF intake failed. Retry or choose another manual.", {
    cause: error,
  })
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B"
  }

  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const precision = unitIndex === 0 || value >= 10 ? 0 : 1
  return `${value.toFixed(precision)} ${units[unitIndex]}`
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
}

function failure(code: PdfIntakeErrorCode, message: string): PdfFileValidation {
  return {
    ok: false,
    error: new PdfIntakeError(code, message),
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || hasErrorName(error, "AbortException")
}

function hasErrorName(error: unknown, name: string): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === name
}
