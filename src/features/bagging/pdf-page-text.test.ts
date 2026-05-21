import { describe, expect, it, vi } from "vitest"
import {
  extractPdfPageTexts,
  PdfPageTextExtractionCancelledError,
} from "./pdf-page-text"
import type { PdfReadableDocument } from "./pdf-intake"

describe("extractPdfPageTexts", () => {
  it("extracts normalized native text from selected pages", async () => {
    const cleanup = vi.fn()
    const document: PdfReadableDocument = {
      getPage: vi.fn(async (pageNumber: number) => ({
        cleanup,
        getTextContent: vi.fn(async () => ({
          items: [
            { str: `${pageNumber} x 3001` },
            { str: "Black" },
            { str: "" },
          ],
        })),
        getViewport: () => ({ height: 100, width: 100 }),
        pageNumber,
      })),
      numPages: 5,
    }

    await expect(extractPdfPageTexts(document, [5, 3, 3, 99, 0])).resolves.toEqual([
      { pageNumber: 5, sourceKind: "native_text", text: "5 x 3001 Black" },
      { pageNumber: 3, sourceKind: "native_text", text: "3 x 3001 Black" },
    ])
    expect(document.getPage).toHaveBeenCalledTimes(2)
    expect(cleanup).toHaveBeenCalledTimes(2)
  })

  it("preserves positioned native text reading order when it differs from PDF item order", async () => {
    const document: PdfReadableDocument = {
      getPage: vi.fn(async (pageNumber: number) => ({
        getTextContent: vi.fn(async () => ({
          items: [
            { str: "Black", transform: [1, 0, 0, 10, 120, 700], width: 30, height: 10 },
            { str: "3001", transform: [1, 0, 0, 10, 72, 700], width: 34, height: 10 },
            { str: `${pageNumber} x`, transform: [1, 0, 0, 10, 24, 700], width: 24, height: 10 },
            { str: "Light Bluish Gray", transform: [1, 0, 0, 10, 120, 680], width: 80, height: 10 },
            { str: "3024", transform: [1, 0, 0, 10, 72, 680], width: 34, height: 10 },
            { str: "2 x", transform: [1, 0, 0, 10, 24, 680], width: 24, height: 10 },
          ],
        })),
        getViewport: () => ({ height: 100, width: 100 }),
        pageNumber,
      })),
      numPages: 1,
    }

    await expect(extractPdfPageTexts(document, [1])).resolves.toEqual([
      {
        pageNumber: 1,
        sourceKind: "native_text",
        text: [
          "Black 3001 1 x Light Bluish Gray 3024 2 x",
          "1 x 3001 Black",
          "2 x 3024 Light Bluish Gray",
        ].join("\n"),
      },
    ])
  })

  it("returns empty text when native text extraction is unavailable", async () => {
    const document: PdfReadableDocument = {
      getPage: vi.fn(async (pageNumber: number) => ({
        getViewport: () => ({ height: 100, width: 100 }),
        pageNumber,
      })),
      numPages: 1,
    }

    await expect(extractPdfPageTexts(document, [1])).resolves.toEqual([
      { pageNumber: 1, sourceKind: "native_text", text: "" },
    ])
  })

  it("returns empty page text references when pages are unavailable", async () => {
    const document: PdfReadableDocument = {
      numPages: 2,
    }

    await expect(extractPdfPageTexts(document, [1, 2])).resolves.toEqual([
      { pageNumber: 1, sourceKind: "native_text", text: "" },
      { pageNumber: 2, sourceKind: "native_text", text: "" },
    ])
  })

  it("stops when extraction is cancelled", async () => {
    const controller = new AbortController()
    controller.abort()

    const document: PdfReadableDocument = {
      getPage: vi.fn(),
      numPages: 1,
    }

    await expect(extractPdfPageTexts(document, [1], { signal: controller.signal })).rejects.toBeInstanceOf(
      PdfPageTextExtractionCancelledError,
    )
    expect(document.getPage).not.toHaveBeenCalled()
  })
})
