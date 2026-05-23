import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderWithProvider } from "@/test/render"
import { createTestPdf } from "@/test/pdf"
import { createBaggingSessionFile } from "@/features/bagging/session-file"
import { getPartsListRowId } from "@/features/bagging/parts-list-row-id"
import type { PartsListPdfExtractionResult } from "@/features/bagging/parts-list-pdf-extraction"

const catalogueMock = vi.hoisted(() => {
  type PreviewInput = { colorId?: string | null; partNumber: string } | string

  function getPreviewKey(
    partOrRequest: { colorId?: string | null; partNumber: string } | string,
    colorId?: string | null,
  ) {
    const partNumber =
      typeof partOrRequest === "string"
        ? partOrRequest.trim().toLowerCase()
        : partOrRequest.partNumber.trim().toLowerCase()
    const resolvedColorId =
      typeof partOrRequest === "string" ? colorId?.trim() || "" : partOrRequest.colorId?.trim() || ""

    return `${partNumber}:${resolvedColorId || "any"}`
  }

  function createPreviewMap(parts: readonly PreviewInput[]) {
    return new Map(
      parts.map((part) => {
        const partNumber =
          typeof part === "string" ? part.trim().toLowerCase() : part.partNumber.trim().toLowerCase()
        const colorId = typeof part === "string" ? "" : part.colorId?.trim() || ""
        const key = getPreviewKey(part)

        return [
          key,
          {
            ...(colorId ? { colorId } : {}),
            imageUrl: `https://cdn.rebrickable.com/media/parts/elements/${partNumber}.jpg`,
            key,
            name: `Part ${partNumber}`,
            partNumber,
          },
        ] as const
      }),
    )
  }

  function createNormalization(rows: readonly {
    color?: { id: string; matchedText: string; name: string } | null
    part?: { cataloguePartNumber: string; matchKind: "exact"; name?: string } | null
    partNumber: string
    quantity: number
    sourcePage: number
    sourceTextRange: { start: number }
  }[]) {
    const normalizedRows = rows.map((row) => {
      const part = row.part ?? { cataloguePartNumber: row.partNumber, matchKind: "exact" as const }
      const namedPart = { ...part, name: part.name ?? `Catalogue Part ${part.cataloguePartNumber}` }

      return {
        color: row.color ?? null,
        issues: [],
        part: namedPart,
        partCandidates: [
          {
            matchKind: namedPart.matchKind,
            partNumber: namedPart.cataloguePartNumber,
            rank: 100,
            selected: true,
          },
        ],
        partNumber: row.partNumber,
        quantity: row.quantity,
        rowId: `${row.sourcePage}-${row.sourceTextRange.start}-${row.quantity}-${row.partNumber}-${row.color?.id ?? "unresolved"}`,
        sourcePage: row.sourcePage,
        status: "resolved" as const,
      }
    })
    const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0)

    return {
      ambiguousQuantity: 0,
      attentionRows: [],
      catalogueSnapshotId: "test-snapshot",
      coverageThreshold: 0.9,
      resolvedQuantity: totalQuantity,
      rows: normalizedRows,
      status: "ready" as const,
      totalQuantity,
      unresolvedQuantity: 0,
    }
  }

  return {
    createPreviewMap,
    createNormalization,
    fetchPartsListCatalogueColors: vi.fn(async () => ({
      colors: [{ id: "0", name: "Black" }],
      snapshot: { id: "test-snapshot" },
    })),
    fetchPartsListColors: vi.fn(async () => [{ id: "0", name: "Black" }]),
    fetchPartsListNormalization: vi.fn(async (rows) => createNormalization(rows)),
    fetchPartsListPartPreviews: vi.fn(async (parts: readonly PreviewInput[], options?: unknown) => {
      void options

      return createPreviewMap(parts)
    }),
    getPartsListPartPreviewKey: vi.fn(
      (partOrRequest: { colorId?: string | null; partNumber: string } | string, colorId?: string | null) =>
        getPreviewKey(partOrRequest, colorId),
    ),
    preloadPartsListCatalogue: vi.fn(async () => true),
  }
})

const extractionMock = vi.hoisted(() => {
  const createSupportedPartsListResult = () => {
    const row = {
      color: { id: "0", matchedText: "Black", name: "Black" },
      confidence: 1,
      cropReferences: [
        {
          id: "row:p2:x10:y20:w50:h60",
          kind: "row" as const,
          pageNumber: 2,
          region: { height: 60, unit: "ocr_pixel" as const, width: 50, x: 10, y: 20 },
        },
      ],
      parserVersion: "parts-list-v1",
      part: { cataloguePartNumber: "3005", matchKind: "exact" as const },
      partNumber: "3005",
      partNumberKind: "numeric" as const,
      partThumbnailRegion: { height: 90, unit: "ocr_pixel" as const, width: 90, x: 0, y: 0 },
      quantity: 14,
      rawText: "14 x 3005 Black",
      sourceKind: "ocr" as const,
      sourceImage: { height: 2400, unit: "ocr_pixel" as const, width: 1800 },
      sourcePage: 2,
      sourceRegion: { height: 60, unit: "ocr_pixel" as const, width: 50, x: 10, y: 20 },
      sourceTextRange: { end: 16, start: 0 },
      sourceTokens: ["14x", "3005", "Black"],
    }

    return {
      candidates: [
        {
          anchorCount: 1,
          highConfidenceRowCount: 1,
          pageNumber: 2,
          rowCount: 1,
          score: 1,
          searchTier: "tail" as const,
        },
      ],
      confidence: 1,
      lowConfidenceRows: [],
      reason: null,
      rows: [row],
      normalization: {
        ambiguousQuantity: 0,
        attentionRows: [],
        catalogueSnapshotId: "test-snapshot",
        coverageThreshold: 0.9,
        resolvedQuantity: 14,
        rows: [
          {
            color: row.color,
            issues: [],
            part: row.part,
            partCandidates: [
              {
                matchKind: "exact" as const,
                partNumber: "3005",
                rank: 100,
                selected: true,
              },
            ],
            partNumber: "3005",
            quantity: 14,
            rowId: "2-0-14-3005-0",
            sourcePage: 2,
            status: "resolved" as const,
          },
        ],
        status: "ready" as const,
        totalQuantity: 14,
        unresolvedQuantity: 0,
      },
      extractionMethod: "ocr" as const,
      extractorVersion: "test-parts-list-extractor-v1" as string,
      nativeTextPageCount: 2,
      ocrPageCount: 1,
      status: "supported" as const,
    }
  }

  return {
    createSupportedPartsListResult,
    disposePreloadedPartsListOcrWorker: vi.fn(async () => undefined),
    extractPartsListFromPdfDocument: vi.fn(async (...args: [unknown, { onProgress?: (progress: unknown) => void }?]) => {
      void args

      return createSupportedPartsListResult()
    }),
    preloadPartsListOcrWorker: vi.fn(async () => true),
  }
})

const pdfIntakeMock = vi.hoisted(() => ({
  runPrivatePdfProcessingJob: vi.fn(),
}))

const stepCalloutMock = vi.hoisted(() => {
  const stepCalloutDetectorVersion = "test-step-callout-detector-v8"
  const createStepCalloutResult = () => ({
    callouts: [
      {
        confidence: 0.82,
        crop: {
          dataUrl: "data:image/png;base64,step-callout",
          height: 120,
          width: 180,
        },
        id: "step-callout:p1:r1",
        indexOnPage: 1,
        pageNumber: 1,
        partItems: [
          {
            confidence: 0.73,
            detectedColor: {
              confidence: 0.82,
              hex: "#237823",
              name: "Green",
              rgb: {
                b: 35,
                g: 120,
                r: 35,
              },
            },
            id: "step-callout:p1:r1:item1",
            indexOnCallout: 1,
            localImageMatch: null,
            partCrop: {
              dataUrl: "data:image/png;base64,step-part",
              height: 56,
              width: 64,
            },
            partRegion: {
              height: 56,
              unit: "step_pixel" as const,
              width: 64,
              x: 30,
              y: 42,
            },
            quantityLabel: {
              crop: {
                dataUrl: "data:image/png;base64,step-quantity",
                height: 14,
                width: 28,
              },
              region: {
                height: 14,
                unit: "step_pixel" as const,
                width: 28,
                x: 48,
                y: 104,
              },
            },
            quantity: {
              confidence: 0.86,
              text: "1",
              value: 1,
            },
            sourceRegion: {
              height: 88,
              unit: "step_pixel" as const,
              width: 80,
              x: 24,
              y: 36,
            },
          },
        ],
        sourceImage: {
          height: 900,
          unit: "step_pixel" as const,
          width: 700,
        },
        sourceRegion: {
          height: 120,
          unit: "step_pixel" as const,
          width: 180,
          x: 20,
          y: 30,
        },
        stepIndex: 1,
      },
    ],
    detectorVersion: stepCalloutDetectorVersion,
    pageCount: 2,
    pageLimit: null,
    scannedPageNumbers: [1],
    skippedBomPageNumbers: [2],
    status: "detected" as const,
  })

  return {
    createStepCalloutResult,
    defaultStepCalloutPageLimit: null,
    detectStepCalloutsFromPdfDocument: vi.fn(async (_document: unknown, options?: {
      onProgress?: (progress: unknown) => void
    }) => {
      options?.onProgress?.({
        currentPage: 1,
        detectedCalloutCount: 1,
        message: "Finished page 1; 1 step callouts detected so far.",
        pageCount: 2,
        progress: 100,
        scannedPageCount: 1,
        targetPageCount: 1,
      })

      return createStepCalloutResult()
    }),
    stepCalloutDetectorVersion,
  }
})

vi.mock("@/features/bagging/browser-catalogue", () => ({
  fetchPartsListCatalogueColors: catalogueMock.fetchPartsListCatalogueColors,
  fetchPartsListColors: catalogueMock.fetchPartsListColors,
  fetchPartsListNormalization: catalogueMock.fetchPartsListNormalization,
  fetchPartsListPartPreviews: catalogueMock.fetchPartsListPartPreviews,
  getPartsListPartPreviewKey: catalogueMock.getPartsListPartPreviewKey,
  preloadPartsListCatalogue: catalogueMock.preloadPartsListCatalogue,
}))

vi.mock("@/features/bagging/parts-list-pdf-extraction", () => ({
  disposePreloadedPartsListOcrWorker: extractionMock.disposePreloadedPartsListOcrWorker,
  extractPartsListFromPdfDocument: extractionMock.extractPartsListFromPdfDocument,
  partsListExtractorVersion: "test-parts-list-extractor-v1",
  preloadPartsListOcrWorker: extractionMock.preloadPartsListOcrWorker,
}))

vi.mock("@/features/bagging/step-callout-detection", () => ({
  defaultStepCalloutPageLimit: stepCalloutMock.defaultStepCalloutPageLimit,
  detectStepCalloutsFromPdfDocument: stepCalloutMock.detectStepCalloutsFromPdfDocument,
  getInitialStepCalloutPageNumbers: (pageCount: number, excludedPageNumbers: ReadonlySet<number>, maxPages: number | null) => {
    const pageNumbers: number[] = []
    const pageLimit = maxPages == null ? pageCount : maxPages
    for (let pageNumber = 1; pageNumber <= pageCount && pageNumbers.length < pageLimit; pageNumber += 1) {
      if (!excludedPageNumbers.has(pageNumber)) {
        pageNumbers.push(pageNumber)
      }
    }

    return pageNumbers
  },
  stepCalloutDetectorVersion: stepCalloutMock.stepCalloutDetectorVersion,
}))

vi.mock("@/features/bagging/pdf-intake", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/bagging/pdf-intake")>()

  return {
    ...actual,
    runPrivatePdfProcessingJob: pdfIntakeMock.runPrivatePdfProcessingJob,
  }
})

import { BaggingPage } from "./bagging-page"

describe("BaggingPage parts list extraction", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows extracted part rows after analysis completes", async () => {
    stepCalloutMock.detectStepCalloutsFromPdfDocument.mockClear()
    pdfIntakeMock.runPrivatePdfProcessingJob.mockImplementation(async (file: File, options) => {
      const now = Date.now()
      const metadata = {
        fileName: file.name,
        fingerprint: "test-fingerprint",
        pageCount: 2,
        readMode: "fallback" as const,
        sizeBytes: file.size,
      }
      const analysisResult = await options.analyzeDocument?.({ numPages: 2 }, { metadata, signal: options.signal })
      const pageNumbersToRender: readonly number[] = analysisResult?.pageNumbersToRender ?? []
      const snapshot = {
        errorMessage: null,
        id: options.id ?? "test-job",
        metadata,
        pageRenderProgress: 100,
        pageRenders: pageNumbersToRender.map((pageNumber) => ({
          dataUrl: "data:image/png;base64,test",
          height: 426,
          pageNumber,
          renderKind: "canvas" as const,
          width: 320,
        })),
        progress: 100,
        sourceBytesPurged: true,
        startedAt: now,
        state: "complete" as const,
        updatedAt: now,
      }

      options.onUpdate?.(snapshot)

      return snapshot
    })

    const user = userEvent.setup()
    renderWithProvider(<BaggingPage />)

    await user.upload(
      screen.getByLabelText("Upload PDF manual"),
      new File([createTestPdf(2)], "castle.pdf", { type: "application/pdf" }),
    )
    await user.click(screen.getByRole("button", { name: "Bag it!" }))

    await waitFor(() => expect(screen.getByText("Supported")).toBeVisible(), { timeout: 3000 })
    expect(extractionMock.extractPartsListFromPdfDocument).toHaveBeenCalled()
    const [, extractionOptions] = extractionMock.extractPartsListFromPdfDocument.mock.calls.at(-1) as unknown as [
      unknown,
      Record<string, unknown>,
    ]
    expect(extractionOptions).not.toHaveProperty("ocrDeadlineMs")
    expect(extractionOptions).not.toHaveProperty("partCatalogue")
    expect(screen.getByText("3005")).toBeVisible()
    expect(screen.getAllByText("Black")[0]).toBeVisible()
    expect(screen.getAllByText("14")[0]).toBeVisible()
    await waitFor(() => expect(screen.getByRole("img", { name: "3005 Black Part 3005" })).toBeVisible())
    expect(screen.getByText("1 inventory page analyzed.")).toBeVisible()
    expect(screen.getByText("100% normalized")).toBeVisible()
    expect(screen.getByText("Analysis complete")).toBeVisible()
    expect(screen.queryByRole("heading", { name: "Turn a MOC manual into builder-ready bags" })).not.toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Debug" })).toBeVisible()

    await user.click(screen.getByRole("tab", { name: "Debug" }))
    expect(screen.getByTestId("step-local-match-debug")).toBeVisible()
    expect(screen.getByText("0 grouped matches · 1 single item")).toBeVisible()
    const diagnosticsPanel = screen.getByTestId("parts-list-extraction-performance")
    expect(diagnosticsPanel).toHaveAttribute("data-placement", "main")
    expect(screen.getByText("Extraction diagnostics")).toBeVisible()
    await user.click(screen.getByRole("button", { name: /Page 2/ }))
    expect(screen.getByAltText("Manual page 2 preview")).toBeVisible()
    expect(screen.getAllByTestId("debug-row-region-overlay")[0]).toHaveAttribute("data-part-number", "3005")
    expect(screen.getByTestId("debug-row-region-preview")).toHaveAttribute("data-part-number", "3005")
    expect(screen.getByText("14 x 3005 Black")).toBeVisible()
    expect(screen.getByText("x10 y20 w50 h60 ocr_pixel")).toBeVisible()
    const [, stepOptions] = stepCalloutMock.detectStepCalloutsFromPdfDocument.mock.calls.at(-1) as [
      unknown,
      {
        excludedPageNumbers: ReadonlySet<number>
        maxPages: number | null
      },
    ]
    expect([...stepOptions.excludedPageNumbers]).toEqual([2])
    expect(stepOptions).not.toHaveProperty("inventoryRows")
    expect(stepOptions.maxPages).toBeNull()
  })

  it("excludes detected BOM candidate pages and parsed row pages from a fresh step callout scan", async () => {
    stepCalloutMock.detectStepCalloutsFromPdfDocument.mockClear()
    const baseResult = extractionMock.createSupportedPartsListResult()
    const shiftedRow = {
      ...baseResult.rows[0],
      sourcePage: 3,
      sourceTextRange: { end: 16, start: 0 },
    }
    extractionMock.extractPartsListFromPdfDocument.mockResolvedValueOnce({
      ...baseResult,
      candidates: [
        {
          anchorCount: 1,
          highConfidenceRowCount: 0,
          pageNumber: 2,
          rowCount: 0,
          score: 0.8,
          searchTier: "tail" as const,
        },
        {
          anchorCount: 1,
          highConfidenceRowCount: 1,
          pageNumber: 3,
          rowCount: 1,
          score: 1,
          searchTier: "tail" as const,
        },
      ],
      normalization: catalogueMock.createNormalization([shiftedRow]),
      rows: [shiftedRow],
    } as unknown as ReturnType<typeof extractionMock.createSupportedPartsListResult>)
    pdfIntakeMock.runPrivatePdfProcessingJob.mockImplementationOnce(async (file: File, options) => {
      const now = Date.now()
      const metadata = {
        fileName: file.name,
        fingerprint: "test-fingerprint",
        pageCount: 6,
        readMode: "fallback" as const,
        sizeBytes: file.size,
      }
      await options.analyzeDocument?.({ numPages: 6 }, { metadata, signal: options.signal })
      const snapshot = {
        errorMessage: null,
        id: options.id ?? "test-job",
        metadata,
        pageRenderProgress: 100,
        pageRenders: [],
        progress: 100,
        sourceBytesPurged: true,
        startedAt: now,
        state: "complete" as const,
        updatedAt: now,
      }

      options.onUpdate?.(snapshot)

      return snapshot
    })

    const user = userEvent.setup()
    renderWithProvider(<BaggingPage />)

    await user.upload(
      screen.getByLabelText("Upload PDF manual"),
      new File([createTestPdf(6)], "castle.pdf", { type: "application/pdf" }),
    )
    await user.click(screen.getByRole("button", { name: "Bag it!" }))

    await waitFor(() => expect(stepCalloutMock.detectStepCalloutsFromPdfDocument).toHaveBeenCalled(), {
      timeout: 3000,
    })
    const [, stepOptions] = stepCalloutMock.detectStepCalloutsFromPdfDocument.mock.calls.at(-1) as [
      unknown,
      {
        excludedPageNumbers: ReadonlySet<number>
        maxPages: number | null
      },
    ]
    expect([...stepOptions.excludedPageNumbers].sort((left, right) => left - right)).toEqual([2, 3])
    expect(stepOptions).not.toHaveProperty("inventoryRows")
    expect(stepOptions.maxPages).toBeNull()
  })

  it("requires recalculation before showing active analysis from an older extractor", async () => {
    extractionMock.extractPartsListFromPdfDocument.mockResolvedValueOnce({
      ...extractionMock.createSupportedPartsListResult(),
      extractorVersion: "test-parts-list-extractor-v0",
    })
    pdfIntakeMock.runPrivatePdfProcessingJob.mockImplementationOnce(async (file: File, options) => {
      const now = Date.now()
      const metadata = {
        fileName: file.name,
        fingerprint: "test-fingerprint",
        pageCount: 2,
        readMode: "fallback" as const,
        sizeBytes: file.size,
      }
      const analysisResult = await options.analyzeDocument?.({ numPages: 2 }, { metadata, signal: options.signal })
      const pageNumbersToRender: readonly number[] = analysisResult?.pageNumbersToRender ?? []
      const snapshot = {
        errorMessage: null,
        id: options.id ?? "test-job",
        metadata,
        pageRenderProgress: 100,
        pageRenders: pageNumbersToRender.map((pageNumber) => ({
          dataUrl: "data:image/png;base64,test",
          height: 426,
          pageNumber,
          renderKind: "canvas" as const,
          width: 320,
        })),
        progress: 100,
        sourceBytesPurged: true,
        startedAt: now,
        state: "complete" as const,
        updatedAt: now,
      }

      options.onUpdate?.(snapshot)

      return snapshot
    })

    const user = userEvent.setup()
    renderWithProvider(<BaggingPage />)

    await user.upload(
      screen.getByLabelText("Upload PDF manual"),
      new File([createTestPdf(2)], "castle.pdf", { type: "application/pdf" }),
    )
    await user.click(screen.getByRole("button", { name: "Bag it!" }))

    await waitFor(() => expect(screen.getByText("Recalculate required")).toBeVisible(), { timeout: 3000 })
    expect(screen.getByText(/Visible analysis used test-parts-list-extractor-v0/)).toBeVisible()
    expect(screen.getByRole("button", { name: "Recalculate analysis" })).toBeEnabled()
    expect(screen.queryByText("3005")).not.toBeInTheDocument()
  })

  it("starts step grouping without waiting for part preview loading", async () => {
    stepCalloutMock.detectStepCalloutsFromPdfDocument.mockClear()
    catalogueMock.fetchPartsListPartPreviews.mockClear()
    pdfIntakeMock.runPrivatePdfProcessingJob.mockImplementationOnce(async (file: File, options) => {
      const now = Date.now()
      const metadata = {
        fileName: file.name,
        fingerprint: "test-fingerprint",
        pageCount: 2,
        readMode: "fallback" as const,
        sizeBytes: file.size,
      }
      await options.analyzeDocument?.({ numPages: 2 }, { metadata, signal: options.signal })
      const snapshot = {
        errorMessage: null,
        id: options.id ?? "test-job",
        metadata,
        pageRenderProgress: 100,
        pageRenders: [],
        progress: 100,
        sourceBytesPurged: true,
        startedAt: now,
        state: "complete" as const,
        updatedAt: now,
      }

      options.onUpdate?.(snapshot)

      return snapshot
    })

    const user = userEvent.setup()
    renderWithProvider(<BaggingPage />)

    await user.upload(
      screen.getByLabelText("Upload PDF manual"),
      new File([createTestPdf(2)], "castle.pdf", { type: "application/pdf" }),
    )
    await user.click(screen.getByRole("button", { name: "Bag it!" }))

    await waitFor(() => expect(stepCalloutMock.detectStepCalloutsFromPdfDocument).toHaveBeenCalled(), {
      timeout: 3000,
    })
    await waitFor(() => expect(screen.getByText("Analysis complete")).toBeVisible())
  })

  it("omits inventory parts from a fresh step callout scan", async () => {
    stepCalloutMock.detectStepCalloutsFromPdfDocument.mockClear()
    catalogueMock.fetchPartsListPartPreviews.mockClear()
    const baseResult = extractionMock.createSupportedPartsListResult()
    const rows = Array.from({ length: 4 }, (_, index) => ({
      ...baseResult.rows[0],
      part: { cataloguePartNumber: `${3005 + index}`, matchKind: "exact" as const },
      partNumber: `${3005 + index}`,
      quantity: 1,
      rawText: `1 x ${3005 + index} Black`,
      sourcePage: index + 1,
      sourceTextRange: { end: 16, start: index * 20 },
      sourceTokens: ["1x", `${3005 + index}`, "Black"],
    }))
    extractionMock.extractPartsListFromPdfDocument.mockResolvedValueOnce({
      ...baseResult,
      candidates: rows.map((row) => ({
        anchorCount: 1,
        highConfidenceRowCount: 1,
        pageNumber: row.sourcePage,
        rowCount: 1,
        score: 1,
        searchTier: "tail" as const,
      })),
      normalization: catalogueMock.createNormalization(rows),
      rows,
    } as unknown as ReturnType<typeof extractionMock.createSupportedPartsListResult>)
    pdfIntakeMock.runPrivatePdfProcessingJob.mockImplementationOnce(async (file: File, options) => {
      const now = Date.now()
      const metadata = {
        fileName: file.name,
        fingerprint: "test-fingerprint",
        pageCount: 4,
        readMode: "fallback" as const,
        sizeBytes: file.size,
      }
      await options.analyzeDocument?.({ numPages: 4 }, { metadata, signal: options.signal })
      const snapshot = {
        errorMessage: null,
        id: options.id ?? "test-job",
        metadata,
        pageRenderProgress: 100,
        pageRenders: [],
        progress: 100,
        sourceBytesPurged: true,
        startedAt: now,
        state: "complete" as const,
        updatedAt: now,
      }

      options.onUpdate?.(snapshot)

      return snapshot
    })

    const user = userEvent.setup()
    renderWithProvider(<BaggingPage />)

    await user.upload(
      screen.getByLabelText("Upload PDF manual"),
      new File([createTestPdf(4)], "castle.pdf", { type: "application/pdf" }),
    )
    await user.click(screen.getByRole("button", { name: "Bag it!" }))

    await waitFor(() => expect(stepCalloutMock.detectStepCalloutsFromPdfDocument).toHaveBeenCalled(), { timeout: 3000 })
    const [, stepOptions] = stepCalloutMock.detectStepCalloutsFromPdfDocument.mock.calls.at(-1) as [
      unknown,
      Record<string, unknown>,
    ]
    expect(stepOptions).not.toHaveProperty("inventoryRows")
  })

  it("streams partial part rows while page extraction is still running", async () => {
    catalogueMock.fetchPartsListPartPreviews.mockClear()
    let finishExtraction: () => void = () => undefined
    const extractionCanFinish = new Promise<void>((resolve) => {
      finishExtraction = resolve
    })
    let markPageReady: () => void = () => undefined
    const pageCanBeMarkedReady = new Promise<void>((resolve) => {
      markPageReady = resolve
    })
    const streamedResult = extractionMock.createSupportedPartsListResult()

    extractionMock.extractPartsListFromPdfDocument.mockImplementationOnce(async (
      _document: unknown,
      options?: { onProgress?: (progress: unknown) => void },
    ) => {
      options?.onProgress?.({
        currentPage: 2,
        detectedPageCount: 1,
        message: "Reading inventory page 2 of 2; 1 rows found so far.",
        pageCount: 2,
        partialResult: streamedResult,
        phase: "ocr",
        progress: 82,
        rowCount: 1,
        scannedPageCount: 1,
      })

      await pageCanBeMarkedReady
      options?.onProgress?.({
        currentPage: 2,
        detectedPageCount: 1,
        message: "Finished inventory page 2; 1 pages ready.",
        pageCount: 2,
        partialResult: streamedResult,
        phase: "ocr",
        previewReadyPageNumbers: [2],
        progress: 90,
        rowCount: 1,
        scannedPageCount: 1,
      })

      await extractionCanFinish

      return streamedResult
    })
    pdfIntakeMock.runPrivatePdfProcessingJob.mockImplementationOnce(async (file: File, options) => {
      const now = Date.now()
      const metadata = {
        fileName: file.name,
        fingerprint: "test-fingerprint",
        pageCount: 2,
        readMode: "fallback" as const,
        sizeBytes: file.size,
      }
      const extractingSnapshot = {
        errorMessage: null,
        id: options.id ?? "test-job",
        metadata,
        pageRenderProgress: 0,
        pageRenders: [],
        progress: 45,
        sourceBytesPurged: false,
        startedAt: now,
        state: "extracting_metadata" as const,
        updatedAt: now,
      }
      const completeSnapshot = {
        ...extractingSnapshot,
        pageRenderProgress: 100,
        pageRenders: [],
        progress: 100,
        sourceBytesPurged: true,
        state: "complete" as const,
        updatedAt: now + 1,
      }

      options.onUpdate?.(extractingSnapshot)
      await options.analyzeDocument?.({ numPages: 2 }, { metadata, signal: options.signal })
      options.onUpdate?.(completeSnapshot)

      return completeSnapshot
    })

    const user = userEvent.setup()
    renderWithProvider(<BaggingPage />)

    await user.upload(
      screen.getByLabelText("Upload PDF manual"),
      new File([createTestPdf(2)], "castle.pdf", { type: "application/pdf" }),
    )
    await user.click(screen.getByRole("button", { name: "Bag it!" }))

    await waitFor(() => expect(screen.getByText("Updating")).toBeVisible(), { timeout: 3000 })
    expect(screen.getByText("Found 1 inventory page.")).toBeVisible()
    expect(screen.getByText("0 of 1 inventory pages complete. Analyzing page 2.")).toBeVisible()
    expect(screen.getByText("3005")).toBeVisible()
    expect(screen.getAllByText("Black")[0]).toBeVisible()
    expect(catalogueMock.fetchPartsListPartPreviews).not.toHaveBeenCalled()
    expect(screen.getByText("100% normalized")).toBeVisible()

    await act(async () => {
      markPageReady()
      await Promise.resolve()
    })

    await waitFor(() => expect(catalogueMock.fetchPartsListPartPreviews).toHaveBeenCalledTimes(1))
    expect(catalogueMock.fetchPartsListPartPreviews).toHaveBeenCalledWith(
      [{ colorId: "0", partNumber: "3005" }, { partNumber: "3005" }],
      expect.objectContaining({ snapshotId: "test-snapshot" }),
    )

    await user.click(screen.getByRole("checkbox", { name: "Mark 3005 as found" }))
    expect(screen.getByText("100% checked")).toBeVisible()

    finishExtraction()

    await waitFor(() => expect(screen.getByText("Supported")).toBeVisible(), { timeout: 3000 })
    await waitFor(() => expect(screen.getByText("1 inventory page analyzed.")).toBeVisible())
    expect(screen.getByText("100% checked")).toBeVisible()
    expect(screen.getByText("Analysis complete")).toBeVisible()
  })

  it("keeps checked rows when later partial results add pages and row ids drift", async () => {
    let addSecondPage: () => void = () => undefined
    const secondPageCanBeAdded = new Promise<void>((resolve) => {
      addSecondPage = resolve
    })
    let finishExtraction: () => void = () => undefined
    const extractionCanFinish = new Promise<void>((resolve) => {
      finishExtraction = resolve
    })
    const baseResult = extractionMock.createSupportedPartsListResult()
    const shiftedFirstRow = {
      ...baseResult.rows[0],
      sourceTextRange: { end: 17, start: 1 },
    }
    const secondRow = {
      ...baseResult.rows[0],
      part: { cataloguePartNumber: "3020", matchKind: "exact" as const },
      partNumber: "3020",
      quantity: 1,
      rawText: "1 x 3020 Black",
      sourcePage: 3,
      sourceTextRange: { end: 36, start: 20 },
      sourceTokens: ["1x", "3020", "Black"],
    }
    const secondPageResult = {
      ...baseResult,
      candidates: [
        ...baseResult.candidates,
        {
          anchorCount: 1,
          highConfidenceRowCount: 1,
          pageNumber: 3,
          rowCount: 1,
          score: 1,
          searchTier: "tail" as const,
        },
      ],
      rows: [shiftedFirstRow, secondRow],
    }

    extractionMock.extractPartsListFromPdfDocument.mockImplementationOnce(async (
      _document: unknown,
      options?: { onProgress?: (progress: unknown) => void },
    ) => {
      options?.onProgress?.({
        currentPage: 2,
        detectedPageCount: 1,
        message: "Finished inventory page 2; 1 pages ready.",
        pageCount: 3,
        partialResult: baseResult,
        phase: "ocr",
        previewReadyPageNumbers: [2],
        progress: 80,
        rowCount: 1,
        scannedPageCount: 1,
      })

      await secondPageCanBeAdded

      options?.onProgress?.({
        currentPage: 3,
        detectedPageCount: 2,
        message: "Finished inventory page 3; 2 pages ready.",
        pageCount: 3,
        partialResult: secondPageResult,
        phase: "ocr",
        previewReadyPageNumbers: [2, 3],
        progress: 92,
        rowCount: 2,
        scannedPageCount: 2,
      })

      await extractionCanFinish

      return secondPageResult
    })
    pdfIntakeMock.runPrivatePdfProcessingJob.mockImplementationOnce(async (file: File, options) => {
      const now = Date.now()
      const metadata = {
        fileName: file.name,
        fingerprint: "test-fingerprint",
        pageCount: 3,
        readMode: "fallback" as const,
        sizeBytes: file.size,
      }
      const extractingSnapshot = {
        errorMessage: null,
        id: options.id ?? "test-job",
        metadata,
        pageRenderProgress: 0,
        pageRenders: [],
        progress: 45,
        sourceBytesPurged: false,
        startedAt: now,
        state: "extracting_metadata" as const,
        updatedAt: now,
      }
      const completeSnapshot = {
        ...extractingSnapshot,
        pageRenderProgress: 100,
        progress: 100,
        sourceBytesPurged: true,
        state: "complete" as const,
        updatedAt: now + 1,
      }

      options.onUpdate?.(extractingSnapshot)
      await options.analyzeDocument?.({ numPages: 3 }, { metadata, signal: options.signal })
      options.onUpdate?.(completeSnapshot)

      return completeSnapshot
    })

    const user = userEvent.setup()
    renderWithProvider(<BaggingPage />)

    await user.upload(
      screen.getByLabelText("Upload PDF manual"),
      new File([createTestPdf(3)], "castle.pdf", { type: "application/pdf" }),
    )
    await user.click(screen.getByRole("button", { name: "Bag it!" }))

    await waitFor(() => expect(screen.getByText("3005")).toBeVisible(), { timeout: 3000 })
    await user.click(screen.getByRole("checkbox", { name: "Mark 3005 as found" }))
    expect(screen.getByText("100% checked")).toBeVisible()

    await act(async () => {
      addSecondPage()
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByText("3020")).toBeVisible())
    expect(screen.getByRole("checkbox", { name: "Mark 3005 as found" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByText("93% checked")).toBeVisible()
    expect(screen.getByText("14 of 15 parts checked")).toBeVisible()

    await act(async () => {
      finishExtraction()
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByText("Supported")).toBeVisible(), { timeout: 3000 })
    expect(screen.getByRole("checkbox", { name: "Mark 3005 as found" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByText("93% checked")).toBeVisible()
  })

  it("counts catalogue progress only for preview-ready partial pages", async () => {
    catalogueMock.fetchPartsListPartPreviews.mockClear()
    let resolvePreviews: (() => void) | null = null
    catalogueMock.fetchPartsListPartPreviews.mockImplementationOnce(
      (parts) =>
        new Promise((resolve) => {
          resolvePreviews = () => resolve(catalogueMock.createPreviewMap(parts))
        }),
    )
    let finishExtraction: () => void = () => undefined
    const extractionCanFinish = new Promise<void>((resolve) => {
      finishExtraction = resolve
    })
    const baseResult = extractionMock.createSupportedPartsListResult()
    const secondRow = {
      ...baseResult.rows[0],
      part: { cataloguePartNumber: "3020", matchKind: "exact" as const },
      partNumber: "3020",
      quantity: 1,
      rawText: "1 x 3020 Black",
      sourcePage: 3,
      sourceTokens: ["1x", "3020", "Black"],
    }
    const streamedResult = {
      ...baseResult,
      candidates: [
        ...baseResult.candidates,
        {
          anchorCount: 1,
          highConfidenceRowCount: 1,
          pageNumber: 3,
          rowCount: 1,
          score: 1,
          searchTier: "tail" as const,
        },
      ],
      normalization: {
        ...baseResult.normalization,
        resolvedQuantity: 15,
        rows: [
          ...baseResult.normalization.rows,
          {
            color: secondRow.color,
            issues: [],
            part: secondRow.part,
            partCandidates: [
              {
                matchKind: "exact" as const,
                partNumber: "3020",
                rank: 100,
                selected: true,
              },
            ],
            partNumber: "3020",
            quantity: 1,
            rowId: "3-0-1-3020-0",
            sourcePage: 3,
            status: "resolved" as const,
          },
        ],
        totalQuantity: 15,
      },
      rows: [...baseResult.rows, secondRow],
    }

    extractionMock.extractPartsListFromPdfDocument.mockImplementationOnce(async (
      _document: unknown,
      options?: { onProgress?: (progress: unknown) => void },
    ) => {
      options?.onProgress?.({
        currentPage: 2,
        detectedPageCount: 2,
        message: "Finished inventory page 2; 1 pages ready.",
        pageCount: 3,
        partialResult: streamedResult,
        phase: "ocr",
        previewReadyPageNumbers: [2],
        progress: 88,
        rowCount: 2,
        scannedPageCount: 2,
      })

      await extractionCanFinish

      return streamedResult
    })
    pdfIntakeMock.runPrivatePdfProcessingJob.mockImplementationOnce(async (file: File, options) => {
      const now = Date.now()
      const metadata = {
        fileName: file.name,
        fingerprint: "test-fingerprint",
        pageCount: 3,
        readMode: "fallback" as const,
        sizeBytes: file.size,
      }
      const extractingSnapshot = {
        errorMessage: null,
        id: options.id ?? "test-job",
        metadata,
        pageRenderProgress: 0,
        pageRenders: [],
        progress: 45,
        sourceBytesPurged: false,
        startedAt: now,
        state: "extracting_metadata" as const,
        updatedAt: now,
      }
      const completeSnapshot = {
        ...extractingSnapshot,
        pageRenderProgress: 100,
        progress: 100,
        sourceBytesPurged: true,
        state: "complete" as const,
        updatedAt: now + 1,
      }

      options.onUpdate?.(extractingSnapshot)
      await options.analyzeDocument?.({ numPages: 3 }, { metadata, signal: options.signal })
      options.onUpdate?.(completeSnapshot)

      return completeSnapshot
    })

    const user = userEvent.setup()
    renderWithProvider(<BaggingPage />)

    await user.upload(
      screen.getByLabelText("Upload PDF manual"),
      new File([createTestPdf(3)], "castle.pdf", { type: "application/pdf" }),
    )
    await user.click(screen.getByRole("button", { name: "Bag it!" }))

    await waitFor(() => expect(catalogueMock.fetchPartsListPartPreviews).toHaveBeenCalledTimes(1))
    expect(catalogueMock.fetchPartsListPartPreviews).toHaveBeenCalledWith(
      [{ colorId: "0", partNumber: "3005" }, { partNumber: "3005" }],
      expect.objectContaining({ snapshotId: "test-snapshot" }),
    )
    expect(screen.getByText("1 of 2 inventory pages complete. Analyzing page 2.")).toBeVisible()
    expect(screen.getByText("100% normalized")).toBeVisible()

    await act(async () => {
      resolvePreviews?.()
      finishExtraction()
      await Promise.resolve()
    })

    await waitFor(() =>
      expect(screen.getByText("2 inventory pages analyzed.")).toBeVisible(),
      { timeout: 3000 },
    )
  })

  it("starts the PDF job before catalogue colors are loaded", async () => {
    catalogueMock.fetchPartsListCatalogueColors.mockClear()
    catalogueMock.fetchPartsListNormalization.mockClear()
    pdfIntakeMock.runPrivatePdfProcessingJob.mockClear()
    catalogueMock.fetchPartsListCatalogueColors.mockImplementationOnce(
      () => new Promise(() => undefined),
    )
    pdfIntakeMock.runPrivatePdfProcessingJob.mockImplementation(async (file: File, options) => {
      const now = Date.now()
      const snapshot = {
        errorMessage: null,
        id: options.id ?? "test-job",
        metadata: {
          fileName: file.name,
          fingerprint: "test-fingerprint",
          pageCount: 2,
          readMode: "fallback" as const,
          sizeBytes: file.size,
        },
        pageRenderProgress: 0,
        pageRenders: [],
        progress: 20,
        sourceBytesPurged: false,
        startedAt: now,
        state: "validating" as const,
        updatedAt: now,
      }

      options.onUpdate?.(snapshot)

      return snapshot
    })

    const user = userEvent.setup()
    renderWithProvider(<BaggingPage />)

    await user.upload(
      screen.getByLabelText("Upload PDF manual"),
      new File([createTestPdf(2)], "castle.pdf", { type: "application/pdf" }),
    )
    await user.click(screen.getByRole("button", { name: "Bag it!" }))

    await waitFor(() => expect(pdfIntakeMock.runPrivatePdfProcessingJob).toHaveBeenCalled())
    expect(catalogueMock.fetchPartsListCatalogueColors).not.toHaveBeenCalled()
    expect(catalogueMock.fetchPartsListNormalization).not.toHaveBeenCalled()
    expect(screen.getByText("Validating PDF")).toBeVisible()
  })

  it("recovers the UI when catalogue loading stalls in an active tab", async () => {
    vi.useFakeTimers()
    catalogueMock.fetchPartsListCatalogueColors.mockImplementationOnce(() => new Promise(() => undefined))
    pdfIntakeMock.runPrivatePdfProcessingJob.mockImplementationOnce(async (file: File, options) => {
      const now = Date.now()
      const metadata = {
        fileName: file.name,
        fingerprint: "test-fingerprint",
        pageCount: 2,
        readMode: "fallback" as const,
        sizeBytes: file.size,
      }
      options.onUpdate?.({
        errorMessage: null,
        id: options.id ?? "test-job",
        metadata,
        pageRenderProgress: 0,
        pageRenders: [],
        progress: 20,
        sourceBytesPurged: false,
        startedAt: now,
        state: "validating" as const,
        updatedAt: now,
      })

      await options.analyzeDocument?.({ numPages: 2 }, { metadata, signal: options.signal })

      return {
        errorMessage: null,
        id: options.id ?? "test-job",
        metadata,
        pageRenderProgress: 0,
        pageRenders: [],
        progress: 20,
        sourceBytesPurged: false,
        startedAt: now,
        state: "validating" as const,
        updatedAt: now,
      }
    })

    renderWithProvider(<BaggingPage />)

    fireEvent.change(screen.getByLabelText("Upload PDF manual"), {
      target: {
        files: [new File([createTestPdf(2)], "castle.pdf", { type: "application/pdf" })],
      },
    })
    await act(async () => undefined)

    fireEvent.click(screen.getByRole("button", { name: "Bag it!" }))
    await act(async () => undefined)

    expect(screen.getByText("Preparing local catalogue data.")).toBeVisible()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000)
    })

    expect(screen.getByText("Catalogue loading stalled. Click Bag it! to retry.")).toBeVisible()
    expect(screen.getByText("Click Bag it! to retry with the selected manual, or drop a replacement PDF.")).toBeVisible()
    expect(screen.getByRole("button", { name: "Bag it!" })).toBeEnabled()
  })

  it("restores a current saved session with checked part progress", async () => {
    extractionMock.extractPartsListFromPdfDocument.mockClear()
    catalogueMock.fetchPartsListNormalization.mockClear()
    const manualFile = new File([createTestPdf(2)], "castle.pdf", { type: "application/pdf" })
    const partsListResult = {
      ...extractionMock.createSupportedPartsListResult(),
      normalization: catalogueMock.createNormalization(
        extractionMock.createSupportedPartsListResult().rows.map((row) => ({
          ...row,
          part: { cataloguePartNumber: row.partNumber, matchKind: "exact" as const },
        })),
      ),
    } as unknown as PartsListPdfExtractionResult
    partsListResult.normalization?.rows.forEach((row) => {
      if (row.part) {
        delete row.part.name
      }
    })
    const stepCalloutResult = stepCalloutMock.createStepCalloutResult() as unknown as NonNullable<
      Parameters<typeof createBaggingSessionFile>[0]["stepCalloutResult"]
    >
    const metadata = createSessionMetadata(manualFile)
    const session = await createBaggingSessionFile({
      attemptedPartPreviewKeys: new Set(),
      checkedRowIds: new Set(["2-0-14-3005-0"]),
      currentExtractorVersion: "test-parts-list-extractor-v1",
      jobSnapshot: createSessionJobSnapshot(metadata),
      manualFile,
      metadata,
      partPreviewByKey: catalogueMock.createPreviewMap([{ colorId: "0", partNumber: "3005" }]),
      partsListResult,
      stepCalloutMultipliers: { "step-callout:p1:r1": 3 },
      stepCalloutResult,
    })
    const user = userEvent.setup()
    renderWithProvider(<BaggingPage />)

    await user.upload(
      screen.getByLabelText("Upload Bag It session"),
      new File([JSON.stringify(session)], "castle.bagit.json", { type: "application/json" }),
    )

    await waitFor(() => expect(screen.getByText("Supported")).toBeVisible(), { timeout: 3000 })
    await waitFor(() => expect(screen.getAllByText("Part 3005")[0]).toBeVisible(), { timeout: 3000 })
    expect(screen.getByText("castle.pdf")).toBeVisible()
    expect(screen.getByText("100% checked")).toBeVisible()
    expect(screen.getByText("14 of 14 parts checked")).toBeVisible()
    expect(screen.getByText("Analysis complete")).toBeVisible()
    expect(catalogueMock.fetchPartsListNormalization).toHaveBeenCalled()
    expect(extractionMock.extractPartsListFromPdfDocument).not.toHaveBeenCalled()

    await user.click(screen.getByRole("tab", { name: "Build steps" }))
    expect(await screen.findByTestId("step-callout-multiplier-value")).toHaveTextContent("x3")
    expect(screen.getByTestId("step-callout-quantity-diagnostics")).toHaveAttribute("data-detected-part-count", "3")

    await user.click(screen.getByRole("tab", { name: "Bags" }))
    expect(await screen.findByTestId("step-bag-part-row")).toHaveAttribute("data-quantity", "3")
  })

  it("does not restore a failed upload state when the saved part analysis is current", async () => {
    extractionMock.extractPartsListFromPdfDocument.mockClear()
    const manualFile = new File([createTestPdf(2)], "castle.pdf", { type: "application/pdf" })
    const partsListResult = {
      ...extractionMock.createSupportedPartsListResult(),
      normalization: catalogueMock.createNormalization(
        extractionMock.createSupportedPartsListResult().rows.map((row) => ({
          ...row,
          part: { cataloguePartNumber: row.partNumber, matchKind: "exact" as const },
        })),
      ),
    } as unknown as PartsListPdfExtractionResult
    const metadata = createSessionMetadata(manualFile)
    const failedJobSnapshot = {
      ...createSessionJobSnapshot(metadata),
      errorMessage: "The PDF could not be read.",
      progress: 0,
      state: "failed" as const,
    }
    const session = await createBaggingSessionFile({
      attemptedPartPreviewKeys: new Set(),
      checkedRowIds: new Set(),
      currentExtractorVersion: "test-parts-list-extractor-v1",
      jobSnapshot: failedJobSnapshot,
      manualFile,
      metadata,
      partPreviewByKey: new Map(),
      partsListResult,
    })
    const user = userEvent.setup()
    renderWithProvider(<BaggingPage />)

    await user.upload(
      screen.getByLabelText("Upload Bag It session"),
      new File([JSON.stringify(session)], "castle.bagit.json", { type: "application/json" }),
    )

    await waitFor(() => expect(screen.getByText("Supported")).toBeVisible(), { timeout: 3000 })
    expect(screen.getByText("Analysis complete")).toBeVisible()
    expect(screen.queryByText("The PDF could not be read.")).not.toBeInTheDocument()
    expect(screen.queryByText("Click Bag it! to retry with the selected manual, or drop a replacement PDF.")).not.toBeInTheDocument()
    expect(extractionMock.extractPartsListFromPdfDocument).not.toHaveBeenCalled()
  })

  it("runs only step callout analysis when saved part analysis is current", async () => {
    extractionMock.extractPartsListFromPdfDocument.mockClear()
    stepCalloutMock.detectStepCalloutsFromPdfDocument.mockClear()
    catalogueMock.fetchPartsListCatalogueColors.mockClear()
    const manualFile = new File([createTestPdf(2)], "castle.pdf", { type: "application/pdf" })
    const partsListResult = extractionMock.createSupportedPartsListResult() as unknown as PartsListPdfExtractionResult
    const metadata = createSessionMetadata(manualFile)
    const session = await createBaggingSessionFile({
      attemptedPartPreviewKeys: new Set(),
      checkedRowIds: new Set(["2-0-14-3005-0"]),
      currentExtractorVersion: "test-parts-list-extractor-v1",
      jobSnapshot: createSessionJobSnapshot(metadata),
      manualFile,
      metadata,
      partPreviewByKey: catalogueMock.createPreviewMap([{ colorId: "0", partNumber: "3005" }]),
      partsListResult,
    })
    pdfIntakeMock.runPrivatePdfProcessingJob.mockImplementationOnce(async (file: File, options) => {
      const now = Date.now()
      const nextMetadata = createSessionMetadata(file)
      const analysisResult = await options.analyzeDocument?.({ numPages: 2 }, {
        metadata: nextMetadata,
        signal: options.signal,
      })
      const pageNumbersToRender: readonly number[] = analysisResult?.pageNumbersToRender ?? []
      const snapshot = {
        ...createSessionJobSnapshot(nextMetadata, now),
        id: options.id ?? "test-job",
        pageRenders: pageNumbersToRender.map((pageNumber) => ({
          dataUrl: "data:image/png;base64,test",
          height: 426,
          pageNumber,
          renderKind: "canvas" as const,
          width: 320,
        })),
      }
      options.onUpdate?.(snapshot)

      return snapshot
    })
    const user = userEvent.setup()
    renderWithProvider(<BaggingPage />)

    await user.upload(
      screen.getByLabelText("Upload Bag It session"),
      new File([JSON.stringify(session)], "castle.bagit.json", { type: "application/json" }),
    )

    await waitFor(() => expect(screen.getByText("Supported")).toBeVisible(), { timeout: 3000 })
    expect(screen.getByRole("button", { name: "Find steps" })).toBeEnabled()

    await user.click(screen.getByRole("button", { name: "Find steps" }))

    await waitFor(() => expect(stepCalloutMock.detectStepCalloutsFromPdfDocument).toHaveBeenCalled(), {
      timeout: 3000,
    })
    expect(extractionMock.extractPartsListFromPdfDocument).not.toHaveBeenCalled()
    expect(catalogueMock.fetchPartsListCatalogueColors).not.toHaveBeenCalled()
    const [, stepOptions] = stepCalloutMock.detectStepCalloutsFromPdfDocument.mock.calls.at(-1) as [
      unknown,
      {
        excludedPageNumbers: ReadonlySet<number>
        maxPages: number | null
      },
    ]
    expect([...stepOptions.excludedPageNumbers]).toEqual([2])
    expect(stepOptions).not.toHaveProperty("inventoryRows")
    expect(stepOptions.maxPages).toBeNull()

    const sidebarDiagnostics = await screen.findByTestId("step-callout-quantity-sidebar-diagnostics")
    expect(sidebarDiagnostics).toHaveAttribute("data-bom-part-count", "14")
    expect(sidebarDiagnostics).toHaveAttribute("data-detected-part-count", "1")
    expect(sidebarDiagnostics).toHaveAttribute("data-missing-part-count", "13")

    await user.click(screen.getByRole("tab", { name: "Build steps" }))
    const stepDiagnostics = await screen.findByTestId("step-callout-quantity-diagnostics")
    expect(stepDiagnostics).toHaveAttribute("data-bom-part-count", "14")
    expect(stepDiagnostics).toHaveAttribute("data-detected-part-count", "1")
    expect(stepDiagnostics).toHaveAttribute("data-missing-part-count", "13")
    await user.click(screen.getByRole("button", { name: "Increase step 1 multiplier" }))
    await waitFor(() =>
      expect(screen.getByTestId("step-callout-quantity-diagnostics")).toHaveAttribute(
        "data-detected-part-count",
        "2",
      ),
    )
    expect(screen.getByTestId("step-callout-quantity-sidebar-diagnostics")).toHaveAttribute(
      "data-missing-part-count",
      "12",
    )

    await user.click(screen.getByRole("tab", { name: "Bags" }))
    const bagPanel = await screen.findByTestId("step-callouts-panel")
    expect(await within(bagPanel).findByRole("img", { name: "Detected part crop for Bag 1 step 1 item 1" })).toBeVisible()
    expect(within(bagPanel).getByTestId("step-bag-part-row")).toHaveAttribute("data-color-name", "Green")
    expect(within(bagPanel).getByTestId("step-bag-part-row")).toHaveAttribute("data-quantity", "2")
    expect(within(bagPanel).getByTestId("step-callout-quantity-diagnostics")).toHaveAttribute(
      "data-missing-part-count",
      "12",
    )
  })

  it("keeps completed step-only detection when the resumed PDF job fails after scanning", async () => {
    extractionMock.extractPartsListFromPdfDocument.mockClear()
    stepCalloutMock.detectStepCalloutsFromPdfDocument.mockClear()
    const manualFile = new File([createTestPdf(2)], "castle.pdf", { type: "application/pdf" })
    const partsListResult = extractionMock.createSupportedPartsListResult() as unknown as PartsListPdfExtractionResult
    const metadata = createSessionMetadata(manualFile)
    const session = await createBaggingSessionFile({
      attemptedPartPreviewKeys: new Set(),
      checkedRowIds: new Set(),
      currentExtractorVersion: "test-parts-list-extractor-v1",
      jobSnapshot: createSessionJobSnapshot(metadata),
      manualFile,
      metadata,
      partPreviewByKey: new Map(),
      partsListResult,
    })
    pdfIntakeMock.runPrivatePdfProcessingJob.mockImplementationOnce(async (file: File, options) => {
      const now = Date.now()
      const nextMetadata = createSessionMetadata(file)
      await options.analyzeDocument?.({ numPages: 2 }, {
        metadata: nextMetadata,
        signal: options.signal,
      })
      const failedSnapshot = {
        ...createSessionJobSnapshot(nextMetadata, now),
        errorMessage: "The PDF could not be read.",
        id: options.id ?? "test-job",
        progress: 0,
        state: "failed" as const,
      }
      options.onUpdate?.(failedSnapshot)

      return failedSnapshot
    })
    const user = userEvent.setup()
    renderWithProvider(<BaggingPage />)

    await user.upload(
      screen.getByLabelText("Upload Bag It session"),
      new File([JSON.stringify(session)], "castle.bagit.json", { type: "application/json" }),
    )

    await waitFor(() => expect(screen.getByText("Supported")).toBeVisible(), { timeout: 3000 })
    await user.click(screen.getByRole("button", { name: "Find steps" }))

    await waitFor(() => expect(stepCalloutMock.detectStepCalloutsFromPdfDocument).toHaveBeenCalled(), {
      timeout: 3000,
    })
    expect(screen.queryByText("The PDF could not be read.")).not.toBeInTheDocument()
    expect(screen.queryByText("Click Bag it! to retry with the selected manual, or drop a replacement PDF.")).not.toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: "Bags" }))
    expect(await screen.findByRole("img", { name: "Detected part crop for Bag 1 step 1 item 1" })).toBeVisible()
    expect(screen.getByTestId("step-bag-part-row")).toHaveAttribute("data-color-name", "Green")
  })

  it("drops stale saved step callouts and reruns only step analysis", async () => {
    extractionMock.extractPartsListFromPdfDocument.mockClear()
    stepCalloutMock.detectStepCalloutsFromPdfDocument.mockClear()
    const manualFile = new File([createTestPdf(2)], "castle.pdf", { type: "application/pdf" })
    const partsListResult = extractionMock.createSupportedPartsListResult() as unknown as PartsListPdfExtractionResult
    const metadata = createSessionMetadata(manualFile)
    const staleStepCalloutResult = {
      ...stepCalloutMock.createStepCalloutResult(),
      detectorVersion: "test-step-callout-detector-v1",
    } as unknown as NonNullable<Parameters<typeof createBaggingSessionFile>[0]["stepCalloutResult"]>
    delete (staleStepCalloutResult.callouts[0] as Partial<{ stepIndex: number }>).stepIndex
    const session = await createBaggingSessionFile({
      attemptedPartPreviewKeys: new Set(),
      checkedRowIds: new Set(),
      currentExtractorVersion: "test-parts-list-extractor-v1",
      jobSnapshot: createSessionJobSnapshot(metadata),
      manualFile,
      metadata,
      partPreviewByKey: new Map(),
      partsListResult,
      stepCalloutResult: staleStepCalloutResult,
    })
    pdfIntakeMock.runPrivatePdfProcessingJob.mockImplementationOnce(async (file: File, options) => {
      const now = Date.now()
      const nextMetadata = createSessionMetadata(file)
      const analysisResult = await options.analyzeDocument?.({ numPages: 2 }, {
        metadata: nextMetadata,
        signal: options.signal,
      })
      const pageNumbersToRender: readonly number[] = analysisResult?.pageNumbersToRender ?? []
      const snapshot = {
        ...createSessionJobSnapshot(nextMetadata, now),
        id: options.id ?? "test-job",
        pageRenders: pageNumbersToRender.map((pageNumber) => ({
          dataUrl: "data:image/png;base64,test",
          height: 426,
          pageNumber,
          renderKind: "canvas" as const,
          width: 320,
        })),
      }
      options.onUpdate?.(snapshot)

      return snapshot
    })
    const user = userEvent.setup()
    renderWithProvider(<BaggingPage />)

    await user.upload(
      screen.getByLabelText("Upload Bag It session"),
      new File([JSON.stringify(session)], "castle.bagit.json", { type: "application/json" }),
    )

    await waitFor(() => expect(screen.getByText("Step detection required")).toBeVisible(), { timeout: 3000 })
    await user.click(screen.getByRole("tab", { name: "Bags" }))
    expect(screen.queryByTestId("step-bag-part-row")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Find steps" }))

    await waitFor(() => expect(stepCalloutMock.detectStepCalloutsFromPdfDocument).toHaveBeenCalled(), {
      timeout: 3000,
    })
    expect(extractionMock.extractPartsListFromPdfDocument).not.toHaveBeenCalled()
    expect(await screen.findByRole("img", { name: "Detected part crop for Bag 1 step 1 item 1" })).toBeVisible()
    expect(screen.getByTestId("step-bag-part-row")).toHaveAttribute("data-color-name", "Green")
  })

  it("ignores stale current-session normalization after another manual is selected", async () => {
    extractionMock.extractPartsListFromPdfDocument.mockClear()
    catalogueMock.fetchPartsListNormalization.mockClear()
    const manualFile = new File([createTestPdf(2)], "castle.pdf", { type: "application/pdf" })
    const partsListResult = extractionMock.createSupportedPartsListResult() as unknown as PartsListPdfExtractionResult
    const metadata = createSessionMetadata(manualFile)
    const session = await createBaggingSessionFile({
      attemptedPartPreviewKeys: new Set(),
      checkedRowIds: new Set(["2-0-14-3005-0"]),
      currentExtractorVersion: "test-parts-list-extractor-v1",
      jobSnapshot: createSessionJobSnapshot(metadata),
      manualFile,
      metadata,
      partPreviewByKey: new Map(),
      partsListResult,
    })
    let normalizationSignal: AbortSignal | undefined
    let resolveNormalization: (() => void) | undefined
    catalogueMock.fetchPartsListNormalization.mockImplementationOnce((rows, options?: { signal?: AbortSignal }) => {
      normalizationSignal = options?.signal

      return new Promise<ReturnType<typeof catalogueMock.createNormalization>>((resolve) => {
        resolveNormalization = () => resolve(catalogueMock.createNormalization(rows))
        options?.signal?.addEventListener("abort", () => resolve(catalogueMock.createNormalization(rows)), { once: true })
      })
    })
    const user = userEvent.setup()
    renderWithProvider(<BaggingPage />)

    await user.upload(
      screen.getByLabelText("Upload Bag It session"),
      new File([JSON.stringify(session)], "castle.bagit.json", { type: "application/json" }),
    )
    await waitFor(() => expect(catalogueMock.fetchPartsListNormalization).toHaveBeenCalledTimes(1))

    await user.upload(
      screen.getByLabelText("Upload PDF manual"),
      new File([createTestPdf(2)], "replacement.pdf", { type: "application/pdf" }),
    )
    await act(async () => {
      resolveNormalization?.()
    })

    expect(normalizationSignal?.aborted).toBe(true)
    expect(screen.getByText("replacement.pdf")).toBeVisible()
    expect(screen.getByText("Queued")).toBeVisible()
    expect(screen.queryByText("Supported")).not.toBeInTheDocument()
    expect(screen.queryByText("Catalogue Part 3005")).not.toBeInTheDocument()
    expect(extractionMock.extractPartsListFromPdfDocument).not.toHaveBeenCalled()
  })

  it("requires recalculation before using an older saved analysis", async () => {
    extractionMock.extractPartsListFromPdfDocument.mockClear()
    catalogueMock.fetchPartsListCatalogueColors.mockReset()
    catalogueMock.fetchPartsListNormalization.mockReset()
    catalogueMock.fetchPartsListPartPreviews.mockReset()
    catalogueMock.fetchPartsListCatalogueColors.mockResolvedValue({
      colors: [{ id: "0", name: "Black" }],
      snapshot: { id: "test-snapshot" },
    })
    catalogueMock.fetchPartsListNormalization.mockImplementation(async (rows) => catalogueMock.createNormalization(rows))
    catalogueMock.fetchPartsListPartPreviews.mockImplementation(async (parts) => catalogueMock.createPreviewMap(parts))
    const manualFile = new File([createTestPdf(2)], "castle.pdf", { type: "application/pdf" })
    const partsListResult = {
      ...extractionMock.createSupportedPartsListResult(),
      extractorVersion: "test-parts-list-extractor-v0" as const,
    } as unknown as PartsListPdfExtractionResult
    partsListResult.rows[0] = {
      ...partsListResult.rows[0],
      quantity: 12,
    }
    const metadata = createSessionMetadata(manualFile)
    const session = await createBaggingSessionFile({
      attemptedPartPreviewKeys: new Set(["3005:0"]),
      checkedRowIds: new Set([getPartsListRowId(partsListResult.rows[0])]),
      currentExtractorVersion: "test-parts-list-extractor-v0",
      jobSnapshot: createSessionJobSnapshot(metadata),
      manualFile,
      metadata,
      partPreviewByKey: catalogueMock.createPreviewMap([{ colorId: "0", partNumber: "3005" }]),
      partsListResult,
    })
    pdfIntakeMock.runPrivatePdfProcessingJob.mockImplementationOnce(async (file: File, options) => {
      const now = Date.now()
      const nextMetadata = createSessionMetadata(file)
      await options.analyzeDocument?.({ numPages: 2 }, { metadata: nextMetadata, signal: options.signal })
      const snapshot = {
        ...createSessionJobSnapshot(nextMetadata, now),
        id: options.id ?? "test-job",
      }
      options.onUpdate?.(snapshot)

      return snapshot
    })
    const user = userEvent.setup()
    renderWithProvider(<BaggingPage />)

    await user.upload(
      screen.getByLabelText("Upload Bag It session"),
      new File([JSON.stringify(session)], "castle.bagit.json", { type: "application/json" }),
    )

    await waitFor(() => expect(screen.getByText("Recalculate required")).toBeVisible(), { timeout: 3000 })
    expect(screen.getByText(/Saved analysis used test-parts-list-extractor-v0/)).toBeVisible()
    expect(screen.queryByText("Supported")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Recalculate analysis" }))

    await waitFor(() => expect(screen.getByText("Supported")).toBeVisible(), { timeout: 3000 })
    expect(screen.getByText("Checklist changed")).toBeVisible()
    expect(screen.getByText(/Transferred 1 of 1 checked rows after recalculation/)).toBeVisible()
    expect(screen.getByText(/1 row changed \(quantity\)/)).toBeVisible()
    expect(screen.getByText("100% checked")).toBeVisible()
    expect(screen.getByText("14 of 14 parts checked")).toBeVisible()
    expect(extractionMock.extractPartsListFromPdfDocument).toHaveBeenCalled()
  })

  it("keeps user changes authoritative while stale session progress transfers across streamed pages", async () => {
    extractionMock.extractPartsListFromPdfDocument.mockClear()
    const manualFile = new File([createTestPdf(3)], "castle.pdf", { type: "application/pdf" })
    const baseResult = extractionMock.createSupportedPartsListResult()
    const secondRow = {
      ...baseResult.rows[0],
      part: { cataloguePartNumber: "3020", matchKind: "exact" as const },
      partNumber: "3020",
      quantity: 1,
      rawText: "1 x 3020 Black",
      sourcePage: 3,
      sourceTextRange: { end: 36, start: 20 },
      sourceTokens: ["1x", "3020", "Black"],
    }
    const previousResult = {
      ...baseResult,
      candidates: [
        ...baseResult.candidates,
        {
          anchorCount: 1,
          highConfidenceRowCount: 1,
          pageNumber: 3,
          rowCount: 1,
          score: 1,
          searchTier: "tail" as const,
        },
      ],
      extractorVersion: "test-parts-list-extractor-v0" as const,
      normalization: catalogueMock.createNormalization([...baseResult.rows, secondRow]),
      rows: [...baseResult.rows, secondRow],
    } as unknown as PartsListPdfExtractionResult
    const session = await createBaggingSessionFile({
      attemptedPartPreviewKeys: new Set(["3005:0", "3020:0"]),
      checkedRowIds: new Set(previousResult.rows.map((row) => getPartsListRowId(row))),
      currentExtractorVersion: "test-parts-list-extractor-v0",
      jobSnapshot: createSessionJobSnapshot(createSessionMetadata(manualFile)),
      manualFile,
      metadata: createSessionMetadata(manualFile),
      partPreviewByKey: catalogueMock.createPreviewMap([
        { colorId: "0", partNumber: "3005" },
        { colorId: "0", partNumber: "3020" },
      ]),
      partsListResult: previousResult,
    })
    let addSecondPage: () => void = () => undefined
    const secondPageCanBeAdded = new Promise<void>((resolve) => {
      addSecondPage = resolve
    })
    let finishExtraction: () => void = () => undefined
    const extractionCanFinish = new Promise<void>((resolve) => {
      finishExtraction = resolve
    })
    const secondPageResult = {
      ...baseResult,
      candidates: [
        ...baseResult.candidates,
        {
          anchorCount: 1,
          highConfidenceRowCount: 1,
          pageNumber: 3,
          rowCount: 1,
          score: 1,
          searchTier: "tail" as const,
        },
      ],
      rows: [...baseResult.rows, secondRow],
    }

    extractionMock.extractPartsListFromPdfDocument.mockImplementationOnce(async (
      _document: unknown,
      options?: { onProgress?: (progress: unknown) => void },
    ) => {
      options?.onProgress?.({
        currentPage: 2,
        detectedPageCount: 2,
        message: "Finished inventory page 2; 1 pages ready.",
        pageCount: 3,
        partialResult: baseResult,
        phase: "ocr",
        previewReadyPageNumbers: [2],
        progress: 82,
        rowCount: 1,
        scannedPageCount: 1,
      })

      await secondPageCanBeAdded

      options?.onProgress?.({
        currentPage: 3,
        detectedPageCount: 2,
        message: "Finished inventory page 3; 2 pages ready.",
        pageCount: 3,
        partialResult: secondPageResult,
        phase: "ocr",
        previewReadyPageNumbers: [2, 3],
        progress: 92,
        rowCount: 2,
        scannedPageCount: 2,
      })

      await extractionCanFinish

      return secondPageResult
    })
    pdfIntakeMock.runPrivatePdfProcessingJob.mockImplementationOnce(async (file: File, options) => {
      const now = Date.now()
      const metadata = createSessionMetadata(file)
      const extractingSnapshot = {
        ...createSessionJobSnapshot(metadata, now),
        id: options.id ?? "test-job",
        pageRenderProgress: 0,
        pageRenders: [],
        progress: 45,
        sourceBytesPurged: false,
        state: "extracting_metadata" as const,
      }
      const completeSnapshot = {
        ...extractingSnapshot,
        pageRenderProgress: 100,
        progress: 100,
        sourceBytesPurged: true,
        state: "complete" as const,
        updatedAt: now + 1,
      }

      options.onUpdate?.(extractingSnapshot)
      await options.analyzeDocument?.({ numPages: 3 }, { metadata, signal: options.signal })
      options.onUpdate?.(completeSnapshot)

      return completeSnapshot
    })

    const user = userEvent.setup()
    renderWithProvider(<BaggingPage />)

    await user.upload(
      screen.getByLabelText("Upload Bag It session"),
      new File([JSON.stringify(session)], "castle.bagit.json", { type: "application/json" }),
    )

    await waitFor(() => expect(screen.getByText("Recalculate required")).toBeVisible(), { timeout: 3000 })
    await user.click(screen.getByRole("button", { name: "Recalculate analysis" }))

    await waitFor(() => expect(screen.getByText("3005")).toBeVisible(), { timeout: 3000 })
    expect(screen.getByRole("checkbox", { name: "Mark 3005 as found" })).toHaveAttribute("aria-checked", "true")
    await user.click(screen.getByRole("checkbox", { name: "Mark 3005 as found" }))
    expect(screen.getByRole("checkbox", { name: "Mark 3005 as found" })).toHaveAttribute("aria-checked", "false")

    await act(async () => {
      addSecondPage()
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByText("3020")).toBeVisible())
    expect(screen.getByRole("checkbox", { name: "Mark 3005 as found" })).toHaveAttribute("aria-checked", "false")
    expect(screen.getByRole("checkbox", { name: "Mark 3020 as found" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByText("7% checked")).toBeVisible()
    expect(screen.getByText("1 of 15 parts checked")).toBeVisible()

    await act(async () => {
      finishExtraction()
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByText("Supported")).toBeVisible(), { timeout: 3000 })
    expect(screen.getByRole("checkbox", { name: "Mark 3005 as found" })).toHaveAttribute("aria-checked", "false")
    expect(screen.getByRole("checkbox", { name: "Mark 3020 as found" })).toHaveAttribute("aria-checked", "true")
  })
})

function createSessionMetadata(file: File) {
  return {
    fileName: file.name,
    fingerprint: "test-fingerprint",
    pageCount: 2,
    readMode: "fallback" as const,
    sizeBytes: file.size,
  }
}

function createSessionJobSnapshot(metadata: ReturnType<typeof createSessionMetadata>, now = Date.now()) {
  return {
    errorMessage: null,
    id: "test-job",
    metadata,
    pageRenderProgress: 100,
    pageRenders: [
      {
        dataUrl: "data:image/png;base64,test",
        height: 426,
        pageNumber: 2,
        renderKind: "canvas" as const,
        width: 320,
      },
    ],
    progress: 100,
    sourceBytesPurged: true,
    startedAt: now,
    state: "complete" as const,
    updatedAt: now,
  }
}
