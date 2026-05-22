import { describe, expect, it, vi } from "vitest"
import { extractPartsListFromPdfDocument, partsListExtractorVersion } from "./parts-list-pdf-extraction"
import type { PartsListColor } from "./parts-list-extraction"
import type { PdfReadableDocument } from "./pdf-intake"

const colors: PartsListColor[] = [
  { id: "0", name: "Black" },
  { id: "15", name: "White" },
  { id: "71", name: "Light Bluish Gray" },
]
const initialOcrBomText = [
  "Parts list",
  "2 x 3068b Light Bluish Gray",
  "14 x 3005 Black",
  "1 x 3020 White",
  "3 x 3021 Light Bluish Gray",
  "4 x 3022 Black",
].join("\n")
const stepLikeFiveRows = [
  "1 x 4070 Black",
  "2 x 3023 White",
  "3 x 3024 Light Bluish Gray",
  "1 x 3005 Black",
  "2 x 3020 White",
].join("\n")
const stepLikeEightRows = [
  stepLikeFiveRows,
  "1 x 3021 Black",
  "2 x 3022 White",
  "3 x 3023 Light Bluish Gray",
].join("\n")
const denseUnheadedBomText = [
  "2 x 3068b Light Bluish Gray",
  "14 x 3005 Black",
  "1 x 3020 White",
  "3 x 3021 Light Bluish Gray",
  "4 x 3022 Black",
  "2 x 3023 White",
  "6 x 3024 Black",
  "1 x 4070 Black",
].join("\n")

describe("extractPartsListFromPdfDocument", () => {
  it("extracts from strong tail-page native text and stops at the preceding no-parts page", async () => {
    const document = createTextDocument(20, {
      20: initialOcrBomText,
    })

    const result = await extractPartsListFromPdfDocument(document, { colors, tailPageCount: 3 })

    expect(result).toMatchObject({
      extractionMethod: "native_text",
      extractorVersion: partsListExtractorVersion,
      nativeTextPageCount: 3,
      ocrPageCount: 0,
      status: "supported",
    })
    expect(result.rows).toMatchObject([
      { partNumber: "3068b", sourcePage: 20 },
      { partNumber: "3005", sourcePage: 20 },
      { partNumber: "3020", sourcePage: 20 },
      { partNumber: "3021", sourcePage: 20 },
      { partNumber: "3022", sourcePage: 20 },
    ])
    expect(document.getPage).toHaveBeenCalledWith(18)
    expect(document.getPage).toHaveBeenCalledWith(19)
    expect(document.getPage).toHaveBeenCalledWith(20)
    expect(document.getPage).toHaveBeenCalledTimes(3)
  })

  it("keeps walking native text backwards beyond the initial tail until the parts span ends", async () => {
    const document = createTextDocument(30, {
      25: "Parts list\n1 x 3001 Black",
      26: "Parts list\n1 x 3002 Black",
      27: "Parts list\n1 x 3003 Black",
      28: "Parts list\n1 x 3004 Black",
      29: "Parts list\n1 x 3005 Black",
      30: initialOcrBomText,
    })

    const result = await extractPartsListFromPdfDocument(document, { colors, tailPageCount: 3 })

    expect(result).toMatchObject({
      extractionMethod: "native_text",
      nativeTextPageCount: 7,
      ocrPageCount: 0,
      status: "supported",
    })
    expect(result.rows.map((row) => [row.sourcePage, row.partNumber])).toEqual([
      [25, "3001"],
      [26, "3002"],
      [27, "3003"],
      [28, "3004"],
      [29, "3005"],
      [30, "3068b"],
      [30, "3005"],
      [30, "3020"],
      [30, "3021"],
      [30, "3022"],
    ])
    expect(document.getPage).toHaveBeenCalledWith(25)
    expect(document.getPage).toHaveBeenCalledWith(24)
    expect(document.getPage).not.toHaveBeenCalledWith(23)
  })

  it("expands native text extraction when the final pages are weak", async () => {
    const document = createTextDocument(20, {
      17: "Parts list\n2 x 3068b Light Bluish Gray\n14 x 3005 Black",
    })

    const result = await extractPartsListFromPdfDocument(document, { colors, tailPageCount: 3 })

    expect(result).toMatchObject({
      extractionMethod: "native_text",
      status: "supported",
    })
    expect(result.rows[0]).toMatchObject({ sourcePage: 17 })
    expect(document.getPage).toHaveBeenCalledWith(17)
    expect(document.getPage).not.toHaveBeenCalledWith(1)
  })

  it("falls back to OCR on likely tail pages before scanning the full native text", async () => {
    const document = createTextDocument(20, {})
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const pageText = {
          pageNumber,
          text: pageNumber === 20 ? initialOcrBomText : "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "ocr",
      nativeTextPageCount: 4,
      ocrPageCount: 2,
      status: "supported",
    })
    expect(result.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ partNumber: "3068b", sourcePage: 20 }),
      expect.objectContaining({ partNumber: "3005", sourcePage: 20 }),
      expect.objectContaining({ partNumber: "3020", sourcePage: 20 }),
    ]))
    expect(extractOcrPageTexts).toHaveBeenCalledWith(
      document,
      getBackwardsPageNumbers(20),
      expect.objectContaining({ concurrency: 1 }),
    )
    expect(document.getPage).not.toHaveBeenCalledWith(1)
  })

  it("does not promote short native step callouts into a supported bill of materials", async () => {
    const document = createTextDocument(20, {
      20: "1 x 4070 Black\n2 x 3023 White\n3 x 3024 Light Bluish Gray",
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts: async () => [],
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "none",
      reason: "no_candidate_pages",
      status: "unsupported",
    })
  })

  it("does not promote native step callouts by row count alone", async () => {
    const document = createTextDocument(20, {
      20: stepLikeEightRows,
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts: async () => [],
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "none",
      reason: "no_candidate_pages",
      status: "unsupported",
    })
  })

  it("does not treat step-local parts-needed text as bill of materials evidence", async () => {
    const document = createTextDocument(20, {
      20: "Parts needed\n1 x 4070 Black\n2 x 3023 White",
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts: async () => [],
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "none",
      reason: "no_candidate_pages",
      status: "unsupported",
    })
  })

  it("does not include weak native step rows adjacent to a valid bill of materials page", async () => {
    const document = createTextDocument(20, {
      19: "Parts needed\n1 x 4070 Black",
      20: "Parts list\n2 x 3068b Light Bluish Gray\n14 x 3005 Black",
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts: async () => [],
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "native_text",
      status: "supported",
    })
    expect(result.rows.map((row) => [row.sourcePage, row.partNumber])).toEqual([
      [20, "3068b"],
      [20, "3005"],
    ])
  })

  it("falls through to OCR for unheaded native BOM continuation pages", async () => {
    const document = createTextDocument(20, {
      19: "Parts list\n2 x 3068b Light Bluish Gray\n14 x 3005 Black",
      20: [
        "1 x 3020 White",
        "3 x 3021 Light Bluish Gray",
        "4 x 3022 Black",
        "2 x 3023 White",
        "6 x 3024 Black",
      ].join("\n"),
    })
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const pageText = {
          pageNumber,
          rowSources: pageNumber === 20 ? createRowSources(5, { studioGrid: true }) : [],
          text:
            pageNumber === 19
              ? "Parts list\n2 x 3068b Light Bluish Gray\n14 x 3005 Black"
              : pageNumber === 20
                ? [
                    "1 x 3020 White",
                    "3 x 3021 Light Bluish Gray",
                    "4 x 3022 Black",
                    "2 x 3023 White",
                    "6 x 3024 Black",
                  ].join("\n")
                : "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "ocr",
      status: "supported",
    })
    expect(result.rows.map((row) => [row.sourcePage, row.partNumber])).toEqual([
      [19, "3068b"],
      [19, "3005"],
      [20, "3020"],
      [20, "3021"],
      [20, "3022"],
      [20, "3023"],
      [20, "3024"],
    ])
  })

  it("does not accept forward unheaded native step rows by row count alone", async () => {
    const document = createTextDocument(20, {
      19: "Parts list\n2 x 3068b Light Bluish Gray\n14 x 3005 Black",
      20: stepLikeFiveRows,
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts: async () => [],
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "none",
      reason: "no_candidate_pages",
      status: "unsupported",
    })
  })

  it("falls through to OCR for ambiguous unheaded native step rows before a bill of materials page", async () => {
    const document = createTextDocument(20, {
      19: "1 x 4070 Black\n2 x 3023 White\n3 x 3024 Light Bluish Gray",
      20: "Parts list\n2 x 3068b Light Bluish Gray\n14 x 3005 Black",
    })
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const pageText = {
          pageNumber,
          text: pageNumber === 20 ? initialOcrBomText : "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "ocr",
      status: "supported",
    })
    expect(result.rows.map((row) => [row.sourcePage, row.partNumber])).toEqual([
      [20, "3068b"],
      [20, "3005"],
      [20, "3020"],
      [20, "3021"],
      [20, "3022"],
    ])
  })

  it("falls through to OCR when native text rows are low confidence", async () => {
    const document = createTextDocument(20, {
      20: [
        "1 x 3020 OCR Color Fragment",
        "1 x 3021 OCR Color Fragment",
        "1 x 3022 OCR Color Fragment",
        "1 x 3023 OCR Color Fragment",
        "1 x 3024 OCR Color Fragment",
      ].join("\n"),
    })
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const pageText = {
          pageNumber,
          text: pageNumber === 20 ? initialOcrBomText : "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "ocr",
      status: "supported",
    })
    expect(extractOcrPageTexts).toHaveBeenCalled()
  })

  it("fails closed when the backward OCR scan reaches weak non-inventory evidence before any inventory span", async () => {
    const document = createTextDocument(20, {})
    const textByPageNumber: Record<number, string> = {
      19: "1x",
      20: "LEGO FAN",
    }
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const pageText = {
          pageNumber,
          text: textByPageNumber[pageNumber] ?? "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "none",
      ocrPageCount: 2,
      reason: "no_candidate_pages",
      status: "unsupported",
    })
    expect(extractOcrPageTexts).toHaveBeenCalledWith(
      document,
      getBackwardsPageNumbers(20),
      expect.any(Object),
    )
  })

  it("continues past one terminal non-inventory page to find the tail BOM span", async () => {
    const document = createTextDocument(20, {})
    const textByPageNumber: Record<number, string> = {
      19: initialOcrBomText,
      20: "LEGO FAN",
    }
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const pageText = {
          pageNumber,
          text: textByPageNumber[pageNumber] ?? "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "ocr",
      ocrPageCount: 3,
      status: "supported",
    })
    expect(result.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ partNumber: "3068b", sourcePage: 19 }),
      expect.objectContaining({ partNumber: "3005", sourcePage: 19 }),
      expect.objectContaining({ partNumber: "3020", sourcePage: 19 }),
    ]))
  })

  it("continues past multiple blank terminal pages to find the tail BOM span", async () => {
    const document = createTextDocument(21, {})
    const textByPageNumber: Record<number, string> = {
      19: initialOcrBomText,
      20: "",
      21: "",
    }
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const pageText = {
          pageNumber,
          text: textByPageNumber[pageNumber] ?? "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "ocr",
      ocrPageCount: 4,
      status: "supported",
    })
    expect(result.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ partNumber: "3068b", sourcePage: 19 }),
      expect.objectContaining({ partNumber: "3005", sourcePage: 19 }),
      expect.objectContaining({ partNumber: "3020", sourcePage: 19 }),
    ]))
  })

  it("does not start the OCR inventory span from three step-like rows", async () => {
    const document = createTextDocument(20, {})
    const textByPageNumber: Record<number, string> = {
      19: "1 x 4070 Black\n2 x 3023 White\n3 x 3024 Light Bluish Gray",
      20: "LEGO FAN",
    }
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const pageText = {
          pageNumber,
          text: textByPageNumber[pageNumber] ?? "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "none",
      ocrPageCount: 2,
      reason: "no_candidate_pages",
      status: "unsupported",
    })
  })

  it("does not start the OCR inventory span from native-like step callouts by row count alone", async () => {
    const document = createTextDocument(20, {})
    const textByPageNumber: Record<number, string> = {
      19: stepLikeEightRows,
      20: "LEGO FAN",
    }
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const pageText = {
          pageNumber,
          text: textByPageNumber[pageNumber] ?? "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "none",
      ocrPageCount: 2,
      reason: "no_candidate_pages",
      status: "unsupported",
    })
  })

  it("starts the OCR inventory span from dense unheaded BOM rows", async () => {
    const document = createTextDocument(20, {})
    const textByPageNumber: Record<number, string> = {
      20: denseUnheadedBomText,
    }
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const pageText = {
          pageNumber,
          sourceKind: "ocr" as const,
          text: textByPageNumber[pageNumber] ?? "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "ocr",
      status: "supported",
    })
    expect(result.rows.map((row) => [row.sourcePage, row.partNumber])).toEqual([
      [20, "3068b"],
      [20, "3005"],
      [20, "3020"],
      [20, "3021"],
      [20, "3022"],
      [20, "3023"],
      [20, "3024"],
      [20, "4070"],
    ])
  })

  it("does not use step-local parts-needed text as dense OCR BOM evidence", async () => {
    const document = createTextDocument(20, {})
    const textByPageNumber: Record<number, string> = {
      20: `Parts needed\n${denseUnheadedBomText}`,
    }
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const pageText = {
          pageNumber,
          sourceKind: "ocr" as const,
          text: textByPageNumber[pageNumber] ?? "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "none",
      reason: "no_candidate_pages",
      status: "unsupported",
    })
  })

  it("keeps parsed OCR rows unpublished until backward page detection completes", async () => {
    const document = createTextDocument(20, {})
    const onProgress = vi.fn()
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const pageText = {
          pageNumber,
          text: pageNumber === 20 ? initialOcrBomText : "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      onProgress,
      tailPageCount: 3,
    })

    const progressEvents = onProgress.mock.calls.map(([progress]) => progress)
    const detectionPartialIndex = progressEvents.findIndex(
      (progress) =>
        progress.phase === "ocr" &&
        progress.currentPage === 20 &&
        progress.partialResult?.rows.some((row: { partNumber: string }) => row.partNumber === "3068b") &&
        progress.message.includes("continuing backward"),
    )
    const postDetectionPartialIndex = progressEvents.findIndex(
      (progress) =>
        progress.phase === "ocr" &&
        progress.currentPage === null &&
        progress.partialResult &&
        progress.message.includes("Initial inventory"),
    )

    expect(detectionPartialIndex).toBe(-1)
    expect(postDetectionPartialIndex).toBeGreaterThanOrEqual(0)
    expect(progressEvents[postDetectionPartialIndex]).toMatchObject({
      previewReadyPageNumbers: [],
    })
  })

  it("stops OCR on a weak step row before the detected tail span", async () => {
    const document = createTextDocument(20, {})
    const textByPageNumber: Record<number, string> = {
      19: "1 x 4070 Black",
      20: initialOcrBomText,
    }
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const pageText = {
          pageNumber,
          text: textByPageNumber[pageNumber] ?? "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "ocr",
      ocrPageCount: 2,
      status: "supported",
    })
    expect(result.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ partNumber: "3068b", sourcePage: 20 }),
      expect.objectContaining({ partNumber: "3005", sourcePage: 20 }),
      expect.objectContaining({ partNumber: "3020", sourcePage: 20 }),
    ]))
    expect(result.rows).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ partNumber: "4070", sourcePage: 19 }),
    ]))
  })

  it("passes first-pass OCR text into focused refinement", async () => {
    const document = createTextDocument(55, {})
    const initialText = [
      ...Array.from({ length: 8 }, (_, index) => `${index + 1} x ${3000 + index} Not A Catalogue Color`),
      ...Array.from({ length: 4 }, (_, index) => `${index + 9} x ${3008 + index} Black`),
    ].join("\n")
    const refinedText = Array.from({ length: 12 }, (_, index) => `${index + 1} x ${3000 + index} Black`).join("\n")
    let refinementBaseText: string | undefined
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const basePageText = options.basePageTextsByPageNumber?.get(pageNumber)
        const hasBaseText = Boolean(basePageText)
        refinementBaseText = refinementBaseText ?? basePageText?.text
        const pageText = {
          pageNumber,
          rowSources: pageNumber === 20 ? createRowSources(13, { studioGrid: true }) : [],
          text: pageNumber === 20 ? (hasBaseText ? refinedText : initialText) : "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "ocr",
      status: "supported",
    })
    expect(result.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ color: expect.objectContaining({ name: "Black" }), partNumber: "3001" }),
    ]))
    expect(extractOcrPageTexts).toHaveBeenCalledTimes(3)
    expect(extractOcrPageTexts).toHaveBeenNthCalledWith(
      1,
      document,
      getBackwardsPageNumbers(55),
      expect.objectContaining({
        concurrency: 1,
        denseCropRetries: false,
        maxPageWidth: 2_400,
      }),
    )
    expect(extractOcrPageTexts).toHaveBeenNthCalledWith(
      2,
      document,
      [20],
      expect.objectContaining({
        denseCropRetries: true,
        maxPageWidth: 3_200,
      }),
    )
    expect(refinementBaseText).toBe(initialText)
  })

  it("can disable split candidate processing for OCR profile validation", async () => {
    const document = createTextDocument(55, {})
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const pageText = {
          pageNumber,
          text: pageNumber === 55 ? initialOcrBomText : "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      ocrSplitCandidateProcessing: false,
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "ocr",
      status: "supported",
    })
    expect(extractOcrPageTexts).toHaveBeenCalledTimes(1)
    expect(extractOcrPageTexts).toHaveBeenCalledWith(
      document,
      getBackwardsPageNumbers(55),
      expect.objectContaining({
        concurrency: 1,
        denseCropRetries: true,
        maxPageWidth: 3_200,
      }),
    )
  })

  it("finishes split candidate pages one page at a time", async () => {
    const document = createTextDocument(80, {})
    const candidatePages = new Set(Array.from({ length: 16 }, (_, index) => 40 + index))
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const isCandidatePage = candidatePages.has(pageNumber)
        const pageText = {
          pageNumber,
          rowSources: isCandidatePage ? createRowSources(12, { studioGrid: true }) : [],
          text: isCandidatePage ? initialOcrBomText : "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "ocr",
      status: "supported",
    })
    const sortedCandidatePages = Array.from(candidatePages).sort((left, right) => left - right)
    expect(extractOcrPageTexts).toHaveBeenCalledTimes(1 + sortedCandidatePages.length)
    expect(extractOcrPageTexts).toHaveBeenNthCalledWith(
      2,
      document,
      [sortedCandidatePages[0]],
      expect.objectContaining({
        concurrency: 1,
        denseCropRetries: true,
        maxPageWidth: 3_200,
      }),
    )
    expect(extractOcrPageTexts).toHaveBeenNthCalledWith(
      1 + sortedCandidatePages.length,
      document,
      [sortedCandidatePages.at(-1)],
      expect.objectContaining({
        concurrency: 1,
        denseCropRetries: true,
        maxPageWidth: 3_200,
      }),
    )
  })

  it("runs split focused retry before marking a low-confidence candidate page ready", async () => {
    const document = createTextDocument(80, {})
    const onProgress = vi.fn()
    const candidatePages = new Set([40, 41])
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []
      const isFocusedRetry = Boolean(options.basePageTextsByPageNumber)

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const isCandidatePage = candidatePages.has(pageNumber)
        const pageText = {
          pageNumber,
          rowSources: isCandidatePage ? createRowSources(12, { studioGrid: true }) : [],
          text: isCandidatePage
            ? createTwelveRowBomText(3000 + (pageNumber - 40) * 100, {
                lowConfidenceTailRows: isFocusedRetry ? 0 : 4,
              })
            : "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      onProgress,
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "ocr",
      status: "supported",
    })
    expect(extractOcrPageTexts.mock.calls[1]?.[1]).toEqual([40])
    expect(extractOcrPageTexts.mock.calls[2]?.[1]).toEqual([40])
    expect(extractOcrPageTexts.mock.calls[2]?.[2]).toEqual(
      expect.objectContaining({
        basePageTextsByPageNumber: expect.any(Map),
        concurrency: 1,
      }),
    )
    expect(extractOcrPageTexts.mock.calls[3]?.[1]).toEqual([41])

    const firstReadyProgress = onProgress.mock.calls
      .map(([progress]) => progress)
      .find(
        (progress) =>
          progress.phase === "ocr" &&
          progress.currentPage === 40 &&
          progress.partialResult &&
          progress.message.includes("Finished inventory page 40"),
      )
    expect(firstReadyProgress).toMatchObject({
      previewReadyPageNumbers: [40],
    })
    expect(firstReadyProgress?.partialResult.lowConfidenceRows).toEqual([])
  })

  it("stops before earlier inventory pages separated by no-parts OCR pages", async () => {
    const document = createTextDocument(55, {})
    const textByPageNumber: Record<number, string> = {
      51: "1 x 6129c01 Black\n2 x 3023 Light Bluish Gray",
      52: "2 x 4073 Light Bluish Gray\n4 x 30136 Light Bluish Gray",
      53: "unstructured ocr fragments",
      54: "more noisy image labels",
      55: [
        "Parts list",
        "2 x 3024 Light Bluish Gray",
        "4 x 30137 Light Bluish Gray",
        "1 x 3020 White",
        "2 x 3021 Light Bluish Gray",
        "3 x 3022 Black",
      ].join("\n"),
    }
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const pageText = {
          pageNumber,
          rowSources:
            pageNumber >= 530 && pageNumber <= 550
              ? createRowSources(1, { studioGrid: true })
              : [],
          text: textByPageNumber[pageNumber] ?? "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      tailPageCount: 12,
    })

    expect(result).toMatchObject({
      extractionMethod: "ocr",
      ocrPageCount: 2,
      status: "supported",
    })
    expect(result.rows.map((row) => [row.sourcePage, row.partNumber])).toEqual([
      [55, "3024"],
      [55, "30137"],
      [55, "3020"],
      [55, "3021"],
      [55, "3022"],
    ])
    expect(extractOcrPageTexts).toHaveBeenCalledWith(
      document,
      getBackwardsPageNumbers(55),
      expect.any(Object),
    )
  })

  it("keeps walking OCR backwards beyond the initial tail when the parts span is long", async () => {
    const document = createTextDocument(551, {})
    const onProgress = vi.fn()
    const textByPageNumber = Object.fromEntries(
      Array.from({ length: 22 }, (_, index) => {
        const pageNumber = 530 + index
        return [
          pageNumber,
          pageNumber === 551
            ? [
                "Parts list",
                "1 x 3020 Light Bluish Gray",
                "1 x 3021 Light Bluish Gray",
                "1 x 3022 Light Bluish Gray",
                "1 x 3023 Light Bluish Gray",
                "1 x 3024 Light Bluish Gray",
              ].join("\n")
            : `1 x ${3000 + index} Light Bluish Gray`,
        ]
      }),
    )
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const pageText = {
          pageNumber,
          rowSources:
            pageNumber >= 530 && pageNumber <= 550
              ? createRowSources(1, { studioGrid: true })
              : [],
          text: textByPageNumber[pageNumber] ?? "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      onProgress,
      tailPageCount: 12,
    })

    expect(result).toMatchObject({
      extractionMethod: "ocr",
      ocrPageCount: 23,
      status: "supported",
    })
    expect(result.rows.map((row) => row.sourcePage)).toEqual(
      [...Array.from({ length: 21 }, (_, index) => 530 + index), 551, 551, 551, 551, 551],
    )
    expect(extractOcrPageTexts).toHaveBeenCalledWith(document, getBackwardsPageNumbers(551), expect.any(Object))
    const firstReadyProgress = onProgress.mock.calls
      .map(([progress]) => progress)
      .find(
        (progress) =>
          progress.phase === "ocr" &&
          progress.currentPage === 530 &&
          progress.partialResult &&
          progress.message.includes("Finished inventory page 530"),
      )
    expect(firstReadyProgress).toMatchObject({
      currentPage: 530,
      partialResult: {
        extractionMethod: "ocr",
        rows: [expect.objectContaining({ sourcePage: 530 })],
      },
      phase: "ocr",
      previewReadyPageNumbers: [530],
    })

    const finalReadyProgress = onProgress.mock.calls
      .map(([progress]) => progress)
      .find(
        (progress) =>
          progress.phase === "ocr" &&
          progress.currentPage === 551 &&
          progress.partialResult &&
          progress.message.includes("Finished inventory page 551"),
      )
    const expectedPartialRows = [
      ...Array.from({ length: 21 }, (_, index) => expect.objectContaining({ sourcePage: 530 + index })),
      expect.objectContaining({ sourcePage: 551 }),
      expect.objectContaining({ sourcePage: 551 }),
      expect.objectContaining({ sourcePage: 551 }),
      expect.objectContaining({ sourcePage: 551 }),
      expect.objectContaining({ sourcePage: 551 }),
    ]
    expect(finalReadyProgress).toMatchObject({
      currentPage: 551,
      partialResult: {
        extractionMethod: "ocr",
        rows: expectedPartialRows,
      },
      phase: "ocr",
      previewReadyPageNumbers: Array.from({ length: 22 }, (_, index) => 530 + index),
    })
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        detectedPageCount: 22,
        message: "Finished reading 22 inventory pages.",
        phase: "complete",
        previewReadyPageNumbers: Array.from({ length: 22 }, (_, index) => 530 + index),
        progress: 100,
        rowCount: 26,
      }),
    )
  })

  it("attempts a ten-page parts-only tail span without a default OCR deadline", async () => {
    const document = createTextDocument(55, {})
    const textByPageNumber = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => {
        const pageNumber = 46 + index
        return [
          pageNumber,
          pageNumber === 55
            ? [
                "Parts list",
                "1 x 3020 Light Bluish Gray",
                "1 x 3021 Light Bluish Gray",
                "1 x 3022 Light Bluish Gray",
                "1 x 3023 Light Bluish Gray",
                "1 x 3024 Light Bluish Gray",
              ].join("\n")
            : `1 x ${3000 + index} Light Bluish Gray`,
        ]
      }),
    )
    const extractOcrPageTexts = vi.fn(async (_document, pageNumbers, options) => {
      const pageTexts = []

      for (const pageNumber of pageNumbers) {
        options.onPageStart?.(pageNumber, pageTexts)
        const pageText = {
          pageNumber,
          rowSources:
            pageNumber >= 46 && pageNumber <= 54
              ? createRowSources(1, { studioGrid: true })
              : [],
          text: textByPageNumber[pageNumber] ?? "",
        }
        pageTexts.push(pageText)
        options.onPageText?.(pageText, pageTexts)

        if (options.shouldStop?.(pageTexts)) {
          break
        }
      }

      return pageTexts
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts,
      tailPageCount: 12,
    })

    expect(result).toMatchObject({
      extractionMethod: "ocr",
      ocrPageCount: 11,
      status: "supported",
    })
    expect(result.rows.map((row) => row.sourcePage)).toEqual([46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 55, 55, 55, 55])
    expect(extractOcrPageTexts).toHaveBeenCalledWith(
      document,
      getBackwardsPageNumbers(55),
      expect.objectContaining({
        deadlineMs: null,
      }),
    )
  })

  it("does not infer a full-document native text inventory when tail windows and OCR are weak", async () => {
    const document = createTextDocument(20, {
      2: "2 x 3068b Light Bluish Gray\n14 x 3005 Black",
    })

    const result = await extractPartsListFromPdfDocument(document, {
      colors,
      extractOcrPageTexts: async () => [],
      tailPageCount: 3,
    })

    expect(result).toMatchObject({
      extractionMethod: "none",
      reason: "no_candidate_pages",
      status: "unsupported",
    })
    expect(document.getPage).not.toHaveBeenCalledWith(1)
    expect(document.getPage).not.toHaveBeenCalledWith(2)
  })

  it("propagates OCR cancellation instead of converting it into an unsupported result", async () => {
    const controller = new AbortController()
    const document = createTextDocument(20, {})
    const extractOcrPageTexts = vi.fn(async () => {
      controller.abort()
      throw new Error("cancelled")
    })

    await expect(
      extractPartsListFromPdfDocument(document, {
        colors,
        extractOcrPageTexts,
        signal: controller.signal,
        tailPageCount: 3,
      }),
    ).rejects.toThrow("cancelled")
  })
})

function createTextDocument(pageCount: number, textByPageNumber: Record<number, string>): PdfReadableDocument {
  return {
    getPage: vi.fn(async (pageNumber: number) => ({
      cleanup: vi.fn(),
      getTextContent: vi.fn(async () => ({
        items: [{ str: textByPageNumber[pageNumber] ?? "" }],
      })),
      getViewport: () => ({ height: 100, width: 100 }),
      pageNumber,
    })),
    numPages: pageCount,
  }
}

function getBackwardsPageNumbers(pageCount: number) {
  return Array.from({ length: pageCount }, (_, index) => pageCount - index)
}

function createRowSources(count: number, { studioGrid = false }: { studioGrid?: boolean } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    cropReferences: [],
    partThumbnailRegion: null,
    rawText: `${index + 1} x 3000 Black`,
    rawTokens: studioGrid ? ["studio-grid"] : [],
    rowRegion: null,
    textRange: { end: index + 1, start: index },
  }))
}

function createTwelveRowBomText(
  startPartNumber: number,
  { lowConfidenceTailRows = 0 }: { lowConfidenceTailRows?: number } = {},
) {
  return [
    "Parts list",
    ...Array.from({ length: 12 }, (_, index) => {
      const color = index >= 12 - lowConfidenceTailRows ? "Mystery Color" : "Light Bluish Gray"
      return `1 x ${startPartNumber + index} ${color}`
    }),
  ].join("\n")
}
