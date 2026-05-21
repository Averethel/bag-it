import { describe, expect, it, vi } from "vitest"
import { createTestPdf } from "@/test/pdf"
import {
  formatFileSize,
  inspectPdfFile,
  runPrivatePdfProcessingJob,
  type PdfDocumentParser,
  type PdfPageRenderer,
} from "./pdf-intake"

function pdfFile(body: string, name = "manual.pdf") {
  return new File([body], name, { type: "application/pdf" })
}

function stubParser(pageCount = 1): PdfDocumentParser {
  return vi.fn(async () => ({
    destroy: vi.fn(async () => undefined),
    getPage: vi.fn(async (pageNumber: number) => ({
      cleanup: vi.fn(),
      getViewport: ({ scale }: { scale: number }) => ({
        height: 792 * scale,
        width: 612 * scale,
      }),
      pageNumber,
    })),
    numPages: pageCount,
  }))
}

function stubRenderer(): PdfPageRenderer {
  return vi.fn(async (document, { onPageRendered }) => {
    const pages = []

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      pages.push({
        dataUrl: `data:image/png;base64,page-${pageNumber}`,
        height: 160,
        pageNumber,
        renderKind: "canvas" as const,
        width: 120,
      })
      onPageRendered(pageNumber, document.numPages)
    }

    return pages
  })
}

describe("inspectPdfFile", () => {
  it("extracts private intake metadata without running full analysis", async () => {
    const result = await inspectPdfFile(pdfFile(createTestPdf(2), "castle.pdf"))

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.metadata).toMatchObject({
      fileName: "castle.pdf",
      pageCount: 2,
      readMode: "fallback",
    })
    expect(result.metadata.fingerprint.length).toBeGreaterThan(0)
    expect(result.metadata.sizeBytes).toBeGreaterThan(0)
  })

  it("rejects files above the configured size limit", async () => {
    const result = await inspectPdfFile(pdfFile(createTestPdf(1)), { maxSize: 8 })

    expect(result).toMatchObject({
      ok: false,
      code: "too_large",
      message: "Choose a PDF up to 1 KB.",
    })
  })

  it("rejects files without a PDF signature", async () => {
    const result = await inspectPdfFile(pdfFile("not a pdf"))

    expect(result).toMatchObject({
      ok: false,
      code: "not_pdf",
    })
  })

  it("rejects encrypted PDFs through the private intake metadata scan", async () => {
    const result = await inspectPdfFile(pdfFile(createTestPdf(1, { encrypted: true })))

    expect(result).toMatchObject({
      ok: false,
      code: "encrypted",
    })
  })

  it("rejects corrupt PDFs after signature validation", async () => {
    const result = await inspectPdfFile(pdfFile("%PDF-1.7\nbroken"))

    expect(result).toMatchObject({
      ok: false,
      code: "corrupt",
    })
  })

  it("rejects truncated PDFs even when page markers are present", async () => {
    const truncatedPdf = createTestPdf(2).replace(/startxref[\s\S]*$/, "")

    const result = await inspectPdfFile(pdfFile(truncatedPdf))

    expect(result).toMatchObject({
      ok: false,
      code: "corrupt",
    })
  })

  it("purges source bytes even when parser document teardown fails", async () => {
    let parserBytes: Uint8Array | null = null
    const parseDocument: PdfDocumentParser = vi.fn(async (bytes) => {
      parserBytes = bytes

      return {
        destroy: vi.fn(async () => {
          throw new Error("destroy failed")
        }),
        numPages: 1,
      }
    })

    const result = await inspectPdfFile(pdfFile(createTestPdf(1)), { parseDocument })

    expect(result.ok).toBe(true)
    expect(parserBytes).not.toBeNull()
    expect(Array.from(parserBytes ?? []).every((byte) => byte === 0)).toBe(true)
  })
})

describe("runPrivatePdfProcessingJob", () => {
  it("validates, renders derived page references, and purges source bytes", async () => {
    const states: string[] = []

    const result = await runPrivatePdfProcessingJob(pdfFile(createTestPdf(2), "castle.pdf"), {
      onUpdate: (snapshot) => states.push(snapshot.state),
    })

    expect(result.state).toBe("complete")
    expect(result.metadata).toMatchObject({ fileName: "castle.pdf", pageCount: 2, readMode: "fallback" })
    expect(result.pageRenders).toHaveLength(2)
    expect(result.sourceBytesPurged).toBe(true)
    expect(states).toEqual(
      expect.arrayContaining(["queued", "validating", "extracting_metadata", "rendering_pages", "complete"]),
    )
  })

  it("renders private page references for each processing run", async () => {
    const file = pdfFile(createTestPdf(1), "castle.pdf")
    const renderPages = stubRenderer()

    const firstRun = await runPrivatePdfProcessingJob(file, {
      parseDocument: stubParser(1),
      renderPages,
    })
    const secondRun = await runPrivatePdfProcessingJob(file, {
      parseDocument: stubParser(1),
      renderPages,
    })

    expect(renderPages).toHaveBeenCalledTimes(2)
    expect(secondRun.pageRenders).toEqual(firstRun.pageRenders)
  })

  it("can use an injected parser and renderer for later analysis work", async () => {
    const parseDocument = stubParser(2)
    const renderPages = stubRenderer()

    const result = await runPrivatePdfProcessingJob(pdfFile(createTestPdf(2)), {
      parseDocument,
      renderPages,
    })

    expect(result.state).toBe("complete")
    expect(result.metadata).toMatchObject({
      pageCount: 2,
      readMode: "parser",
    })
    expect(result.pageRenders).toEqual([
      { dataUrl: "data:image/png;base64,page-1", height: 160, pageNumber: 1, renderKind: "canvas", width: 120 },
      { dataUrl: "data:image/png;base64,page-2", height: 160, pageNumber: 2, renderKind: "canvas", width: 120 },
    ])
    expect(parseDocument).toHaveBeenCalledTimes(1)
    expect(renderPages).toHaveBeenCalledTimes(1)
  })

  it("renders only pages requested by document analysis", async () => {
    const renderPages: PdfPageRenderer = vi.fn(async (_document, { onPageRendered, pageNumbers = [] }) => {
      onPageRendered(1, pageNumbers.length)
      onPageRendered(2, pageNumbers.length)

      return pageNumbers.map((pageNumber: number) => ({
        dataUrl: `data:image/png;base64,page-${pageNumber}`,
        height: 160,
        pageNumber,
        renderKind: "canvas" as const,
        width: 120,
      }))
    })

    const result = await runPrivatePdfProcessingJob(pdfFile(createTestPdf(5)), {
      analyzeDocument: vi.fn(async () => ({
        pageNumbersToRender: [5, 3, 3, 9, 0],
      })),
      parseDocument: stubParser(5),
      renderPages,
    })

    expect(result.state).toBe("complete")
    expect(result.pageRenders.map((page) => page.pageNumber)).toEqual([3, 5])
    expect(renderPages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ pageNumbers: [3, 5] }),
    )
  })

  it("runs injected document analysis before rendering pages", async () => {
    const file = pdfFile(createTestPdf(1))
    const analyzeDocument = vi.fn(async () => undefined)
    const renderPages = stubRenderer()

    await runPrivatePdfProcessingJob(file, {
      analyzeDocument,
      parseDocument: stubParser(1),
      renderPages,
    })
    await runPrivatePdfProcessingJob(file, {
      analyzeDocument,
      parseDocument: stubParser(1),
      renderPages,
    })

    expect(analyzeDocument).toHaveBeenCalledTimes(2)
    expect(renderPages).toHaveBeenCalledTimes(2)
  })

  it("accepts parser-limited PDFs when fallback page metadata is available", async () => {
    const renderPages = stubRenderer()
    const parserLimited: PdfDocumentParser = vi.fn(async () => {
      throw new Error("PDF parser could not render this file")
    })

    const result = await runPrivatePdfProcessingJob(pdfFile(createTestPdf(2)), {
      parseDocument: parserLimited,
      renderPages,
    })

    expect(result.state).toBe("complete")
    expect(result.metadata).toMatchObject({
      pageCount: 2,
      readMode: "fallback",
    })
    expect(result.pageRenders).toEqual([
      { dataUrl: null, height: 582, pageNumber: 1, renderKind: "viewport", width: 450 },
      { dataUrl: null, height: 582, pageNumber: 2, renderKind: "viewport", width: 450 },
    ])
    expect(renderPages).not.toHaveBeenCalled()
  })

  it("cancels parser-backed processing instead of falling back after an abort", async () => {
    const controller = new AbortController()
    let parserSignal: AbortSignal | undefined
    const parseDocument: PdfDocumentParser = vi.fn(async (_bytes, options) => {
      parserSignal = options?.signal
      window.setTimeout(() => controller.abort(), 0)
      return new Promise<never>(() => undefined)
    })
    const renderPages = stubRenderer()

    const result = await runPrivatePdfProcessingJob(pdfFile(createTestPdf(1)), {
      parseDocument,
      renderPages,
      signal: controller.signal,
    })

    expect(parserSignal).toBe(controller.signal)
    expect(result.state).toBe("purged")
    expect(renderPages).not.toHaveBeenCalled()
  })

  it("uses fallback page references when rendering fails after parsing succeeds", async () => {
    const renderPages: PdfPageRenderer = vi.fn(async () => {
      throw new Error("render failed")
    })

    const result = await runPrivatePdfProcessingJob(pdfFile(createTestPdf(2)), {
      parseDocument: stubParser(2),
      renderPages,
    })

    expect(result.state).toBe("complete")
    expect(result.metadata).toMatchObject({
      pageCount: 2,
      readMode: "parser",
    })
    expect(result.pageRenders).toEqual([
      { dataUrl: null, height: 582, pageNumber: 1, renderKind: "viewport", width: 450 },
      { dataUrl: null, height: 582, pageNumber: 2, renderKind: "viewport", width: 450 },
    ])
  })

  it("cancels an in-flight parser render when the job is aborted", async () => {
    const controller = new AbortController()
    const cancel = vi.fn()
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D)
    const parseDocument: PdfDocumentParser = vi.fn(async () => ({
      destroy: vi.fn(async () => undefined),
      getPage: vi.fn(async (pageNumber: number) => ({
        cleanup: vi.fn(),
        getViewport: ({ scale }: { scale: number }) => ({
          height: 100 * scale,
          width: 100 * scale,
        }),
        pageNumber,
        render: () => {
          window.setTimeout(() => controller.abort(), 0)

          return {
            cancel,
            promise: new Promise((resolve) => window.setTimeout(resolve, 20)),
          }
        },
      })),
      numPages: 1,
    }))

    try {
      const result = await runPrivatePdfProcessingJob(pdfFile(createTestPdf(1)), {
        parseDocument,
        signal: controller.signal,
      })

      expect(result.state).toBe("purged")
      expect(cancel).toHaveBeenCalledTimes(1)
    } finally {
      getContext.mockRestore()
    }
  })

  it("settles and purges source bytes when parser document teardown fails", async () => {
    let parserBytes: Uint8Array | null = null
    const parseDocument: PdfDocumentParser = vi.fn(async (bytes) => {
      parserBytes = bytes

      return {
        destroy: vi.fn(async () => {
          throw new Error("destroy failed")
        }),
        numPages: 1,
      }
    })

    const result = await runPrivatePdfProcessingJob(pdfFile(createTestPdf(1)), {
      parseDocument,
      renderPages: stubRenderer(),
    })

    expect(result.state).toBe("complete")
    expect(result.sourceBytesPurged).toBe(true)
    expect(parserBytes).not.toBeNull()
    expect(Array.from(parserBytes ?? []).every((byte) => byte === 0)).toBe(true)
  })

  it("expires jobs that exceed the source byte retention window", async () => {
    const slowRenderer: PdfPageRenderer = async () =>
      new Promise((resolve) => {
        window.setTimeout(() => resolve([]), 20)
      })

    const result = await runPrivatePdfProcessingJob(pdfFile(createTestPdf(1)), {
      parseDocument: stubParser(1),
      renderPages: slowRenderer,
      sourceRetentionMs: 1,
    })

    expect(result.state).toBe("expired")
    expect(result.sourceBytesPurged).toBe(true)
  })
})

describe("formatFileSize", () => {
  it("formats byte counts for validation messages", () => {
    expect(formatFileSize(512)).toBe("1 KB")
    expect(formatFileSize(100 * 1024 * 1024)).toBe("100 MB")
  })
})
