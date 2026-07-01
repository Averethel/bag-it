import { describe, expect, it } from "vitest"
import {
  DEFAULT_MAX_PDF_BYTES,
  PdfIntakeError,
  formatBytes,
  normalizePdfIntakeError,
  validatePdfFile,
} from "./pdf-intake"

describe("pdf-intake", () => {
  it("accepts PDF files by MIME type or extension", () => {
    const typedPdf = new File(["%PDF-1.7"], "manual.bin", {
      type: "application/pdf",
    })
    const namedPdf = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/octet-stream",
    })

    expect(validatePdfFile(typedPdf).ok).toBe(true)
    expect(validatePdfFile(namedPdf).ok).toBe(true)
  })

  it("rejects missing, non-PDF, empty, and too-large files", () => {
    const textFile = new File(["notes"], "notes.txt", {
      type: "text/plain",
    })
    const emptyPdf = new File([], "empty.pdf", {
      type: "application/pdf",
    })
    const largePdf = new File(["123456"], "large.pdf", {
      type: "application/pdf",
    })

    expect(validatePdfFile(null).ok).toBe(false)
    expect(validatePdfFile(textFile).ok).toBe(false)
    expect(validatePdfFile(emptyPdf).ok).toBe(false)
    expect(validatePdfFile(largePdf, { maxBytes: 4 }).ok).toBe(false)
  })

  it("normalizes parser errors into intake errors", () => {
    const passwordError = { name: "PasswordException" }
    const invalidPdfError = { name: "InvalidPDFException" }
    const abortError = new DOMException("Aborted", "AbortError")

    expect(normalizePdfIntakeError(passwordError).code).toBe("encrypted")
    expect(normalizePdfIntakeError(invalidPdfError).code).toBe("corrupt")
    expect(normalizePdfIntakeError(abortError).code).toBe("cancelled")

    const original = new PdfIntakeError("expired", "Expired.")
    expect(normalizePdfIntakeError(original)).toBe(original)
  })

  it("formats byte sizes for UI copy", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(1536)).toBe("1.5 KB")
    expect(formatBytes(DEFAULT_MAX_PDF_BYTES)).toBe("200 MB")
  })
})
