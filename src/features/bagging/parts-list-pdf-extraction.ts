import {
  extractPartsListFromPageTexts,
  getExpandedTailCandidatePageNumbers,
  getTailCandidatePageNumbers,
  type PartsListColor,
  type PartsListPartCatalogue,
  type PartsListFromPageTextResult,
  type PartsListPageText,
} from "./parts-list-extraction"
import {
  disposePreloadedPartsListOcrWorker,
  extractPdfPageTextsWithOcr,
  type PdfPageOcrOptions,
} from "./parts-list-ocr"
import { extractPdfPageTexts } from "./pdf-page-text"
import type { PdfReadableDocument } from "./pdf-intake"

export const partsListExtractorVersion = "parts-list-extraction-v30"
const minInitialOcrInventoryRows = 5
const minDenseOcrInventoryRows = 8
const minDenseOcrContinuationRows = 3
const minDenseRetryLowConfidenceRows = 8
const minDenseRetryRowsOnPage = 12
const defaultOcrMaxPageWidth = 3_200
const defaultOcrDetectionMaxPageWidth = 2_400
const defaultOcrCandidateConcurrency = 3
const defaultOcrManyPageCandidateConcurrency = 3
const manyPageCandidateConcurrencyThreshold = 12
const minSplitOcrDocumentPages = 40
export {
  disposePreloadedPartsListOcrWorker,
  preloadPartsListOcrWorker,
} from "./parts-list-ocr"

export type PartsListPdfExtractionOptions = {
  colors: readonly PartsListColor[]
  expandedTailRatio?: number
  extractOcrPageTexts?: typeof extractPdfPageTextsWithOcr
  onProgress?: (progress: PartsListPdfExtractionProgress) => void
  ocrConcurrency?: number
  ocrDeadlineMs?: number | null
  ocrDetectionMaxPageWidth?: number
  ocrDenseCropRetries?: boolean
  ocrMaxPageWidth?: number
  ocrEngineFactory?: PdfPageOcrOptions["createWorker"]
  ocrSplitCandidateProcessing?: boolean | "auto"
  partCatalogue?: PartsListPartCatalogue | null
  signal?: AbortSignal
  tailPageCount?: number
}

export type PartsListPdfExtractionResult = PartsListFromPageTextResult & {
  extractionMethod: "native_text" | "ocr" | "none"
  extractionTimings?: PartsListPdfExtractionTimings
  extractorVersion: typeof partsListExtractorVersion
  nativeTextPageCount: number
  ocrPageCount: number
}

export type PartsListPdfExtractionTimings = {
  nativeTextMs: number
  ocrDetectionMs: number
  ocrCandidateProcessingMs: number
  ocrResultParseMs: number
  ocrRefinementMs: number
  sourceOrderedProgressMs: number
  totalMs: number
}

export type PartsListPdfExtractionProgress = {
  currentPage: number | null
  detectedPageCount: number
  message: string
  pageCount: number
  partialResult?: PartsListPdfExtractionResult
  phase: "native_text" | "ocr" | "complete"
  previewReadyPageNumbers?: readonly number[]
  progress: number
  rowCount: number
  scannedPageCount: number
}

export async function extractPartsListFromPdfDocument(
  document: PdfReadableDocument,
  {
    colors,
    expandedTailRatio = 0.2,
    extractOcrPageTexts = extractPdfPageTextsWithOcr,
    onProgress,
    ocrConcurrency,
    ocrDeadlineMs = null,
    ocrDetectionMaxPageWidth = defaultOcrDetectionMaxPageWidth,
    ocrDenseCropRetries = true,
    ocrMaxPageWidth = defaultOcrMaxPageWidth,
    ocrEngineFactory,
    ocrSplitCandidateProcessing = "auto",
    partCatalogue,
    signal,
    tailPageCount = 12,
  }: PartsListPdfExtractionOptions,
): Promise<PartsListPdfExtractionResult> {
  const pageTexts = new Map<number, PartsListPageText>()
  const ocrPageTexts = new Map<number, PartsListPageText>()
  const detectedOcrPageNumbers = new Set<number>()
  const extractionStartedAt = getNowMs()
  const extractionTimings = createEmptyExtractionTimings()
  let foundOcrCandidatePage = false

  onProgress?.({
    currentPage: null,
    detectedPageCount: 0,
    message: "Checking native PDF text for inventory pages.",
    pageCount: document.numPages,
    phase: "native_text",
    progress: 20,
    rowCount: 0,
    scannedPageCount: 0,
  })

  const nativeStartedAt = getNowMs()
  await extractAndStorePageTexts({
    document,
    pageNumbers: getTailCandidatePageNumbers(document.numPages, tailPageCount),
    pageTexts,
    signal,
  })

  const tailResult = extractFromStoredPageTexts({ colors, document, pageTexts, partCatalogue, tailPageCount })
  if (canUseNativeTextResult(tailResult, pageTexts)) {
    const completeNativeResult = await expandNativeTextInventorySpan({
      colors,
      document,
      initialResult: tailResult,
      pageTexts,
      partCatalogue,
      signal,
    })
    extractionTimings.nativeTextMs += getElapsedMs(nativeStartedAt)
    return withExtractionMetadata(
      completeNativeResult,
      "native_text",
      ocrPageTexts.size,
      createExtractionTimings(extractionTimings, extractionStartedAt),
    )
  }

  await extractAndStorePageTexts({
    document,
    pageNumbers: getExpandedTailCandidatePageNumbers(document.numPages, {
      minimumPages: tailPageCount,
      tailRatio: expandedTailRatio,
    }),
    pageTexts,
    signal,
  })

  const expandedResult = extractFromStoredPageTexts({ colors, document, pageTexts, partCatalogue, tailPageCount })
  if (canUseNativeTextResult(expandedResult, pageTexts)) {
    const completeNativeResult = await expandNativeTextInventorySpan({
      colors,
      document,
      initialResult: expandedResult,
      pageTexts,
      partCatalogue,
      signal,
    })
    extractionTimings.nativeTextMs += getElapsedMs(nativeStartedAt)
    return withExtractionMetadata(
      completeNativeResult,
      "native_text",
      ocrPageTexts.size,
      createExtractionTimings(extractionTimings, extractionStartedAt),
    )
  }
  extractionTimings.nativeTextMs += getElapsedMs(nativeStartedAt)

  const ocrDetectionStartedAt = getNowMs()
  const useSplitOcrCandidateProcessing = shouldSplitOcrCandidateProcessing({
    pageCount: document.numPages,
    splitCandidateProcessing: ocrSplitCandidateProcessing,
  })
  await extractAndStoreOcrPageTexts({
    document,
    extractOcrPageTexts,
    ocrPageTexts,
    pageNumbers: getBackwardsPageNumbers(document.numPages),
    options: {
      concurrency: useSplitOcrCandidateProcessing ? 1 : getSinglePassOcrConcurrency(ocrConcurrency),
      createWorker: ocrEngineFactory,
      deadlineMs: ocrDeadlineMs,
      denseCropRetries: useSplitOcrCandidateProcessing ? false : ocrDenseCropRetries,
      maxPageWidth: useSplitOcrCandidateProcessing ? ocrDetectionMaxPageWidth : ocrMaxPageWidth,
      onPageStart: (pageNumber, pageTexts) => {
        const scanProgress = Math.min(65, 35 + Math.round((pageTexts.length / Math.max(1, document.numPages)) * 30))
        const detectedScanProgress = Math.min(
          69,
          45 + Math.round((pageTexts.length / Math.max(1, document.numPages)) * 20),
        )
        onProgress?.({
          currentPage: pageNumber,
          detectedPageCount: detectedOcrPageNumbers.size,
          message:
            detectedOcrPageNumbers.size > 0
              ? `Inventory evidence found; scanning backward for the first inventory page (${pageNumber} of ${document.numPages}).`
              : `Detecting inventory pages from the back; reading page ${pageNumber} of ${document.numPages}.`,
          pageCount: document.numPages,
          phase: "ocr",
          progress: detectedOcrPageNumbers.size > 0 ? detectedScanProgress : scanProgress,
          rowCount: 0,
          scannedPageCount: pageTexts.length,
        })
      },
      onPageText: (pageText) => {
        ocrPageTexts.set(pageText.pageNumber, pageText)
      },
      retainDefaultWorkerAfterUse: true,
      shouldStop: (ocrScanPageTexts) => {
        const shouldStop = shouldStopOcrAfterLatestPage({
          colors,
          foundCandidatePage: foundOcrCandidatePage,
          latestPageText: ocrScanPageTexts.at(-1) ?? null,
          pageCount: document.numPages,
          partCatalogue,
          tailPageCount,
          updateFoundCandidatePage: (pageNumber) => {
            detectedOcrPageNumbers.add(pageNumber)
            foundOcrCandidatePage = true
          },
        })
        return shouldStop
      },
      signal,
    },
  })
  extractionTimings.ocrDetectionMs += getElapsedMs(ocrDetectionStartedAt)

  if (!foundOcrCandidatePage) {
    if (!ocrEngineFactory) {
      await disposePreloadedPartsListOcrWorker()
    }

    const noOcrInventorySpanResult = extractFromStoredPageTexts({
      colors,
      document,
      nativeTextPageCount: pageTexts.size,
      pageTexts: new Map(),
      partCatalogue,
      tailPageCount: document.numPages,
    })

    return withExtractionMetadata(
      noOcrInventorySpanResult,
      "none",
      ocrPageTexts.size,
      createExtractionTimings(extractionTimings, extractionStartedAt),
    )
  }

  const candidatePageNumbers = getDetectedOcrCandidatePageNumbers(detectedOcrPageNumbers)
  let splitPreviewReadyPageNumbers: readonly number[] = []
  if (useSplitOcrCandidateProcessing && candidatePageNumbers.length > 0) {
    const ocrCandidateProcessingStartedAt = getNowMs()
    splitPreviewReadyPageNumbers = await processSplitOcrCandidatePages({
      candidatePageNumbers,
      colors,
      document,
      extractOcrPageTexts,
      extractionStartedAt,
      extractionTimings,
      nativeTextPageCount: pageTexts.size,
      ocrDeadlineMs,
      ocrDenseCropRetries,
      ocrEngineFactory,
      ocrMaxPageWidth,
      ocrPageTexts,
      onProgress,
      partCatalogue,
      signal,
    })
    extractionTimings.ocrCandidateProcessingMs += getElapsedMs(ocrCandidateProcessingStartedAt)
  }

  const ocrResultParseStartedAt = getNowMs()
  const ocrResult = extractFromStoredPageTexts({
    colors,
    document,
    nativeTextPageCount: pageTexts.size,
    pageTexts: ocrPageTexts,
    partCatalogue,
    tailPageCount: document.numPages,
  })
  extractionTimings.ocrResultParseMs += getElapsedMs(ocrResultParseStartedAt)
  if (ocrResult.status !== "unsupported") {
    const initialOcrResult = withExtractionMetadata(
      ocrResult,
      "ocr",
      ocrPageTexts.size,
      createExtractionTimings(extractionTimings, extractionStartedAt),
    )
    let refinedOcrResult = ocrResult
    if (useSplitOcrCandidateProcessing) {
      onProgress?.({
        currentPage: null,
        detectedPageCount: initialOcrResult.candidates.length,
        message: `Inventory pages processed; finalizing ${initialOcrResult.candidates.length} pages.`,
        pageCount: document.numPages,
        partialResult: initialOcrResult,
        phase: "ocr",
        previewReadyPageNumbers: splitPreviewReadyPageNumbers,
        progress: 96,
        rowCount: initialOcrResult.rows.length,
        scannedPageCount: ocrPageTexts.size,
      })
      await yieldToBrowser()

      const ocrRefinementStartedAt = getNowMs()
      refinedOcrResult = await refineLowConfidenceOcrPages({
        colors,
        document,
        extractOcrPageTexts,
        initialResult: ocrResult,
        nativeTextPageCount: pageTexts.size,
        ocrConcurrency,
        ocrDeadlineMs,
        ocrEngineFactory,
        ocrMaxPageWidth,
        ocrPageTexts,
        onProgress,
        partCatalogue,
        signal,
      })
      extractionTimings.ocrRefinementMs += getElapsedMs(ocrRefinementStartedAt)
    } else {
      onProgress?.({
        currentPage: null,
        detectedPageCount: initialOcrResult.candidates.length,
        message: `Initial inventory found on ${initialOcrResult.candidates.length} pages; refining OCR confidence.`,
        pageCount: document.numPages,
        partialResult: initialOcrResult,
        phase: "ocr",
        previewReadyPageNumbers: [],
        progress: 70,
        rowCount: initialOcrResult.rows.length,
        scannedPageCount: ocrPageTexts.size,
      })
      await yieldToBrowser()

      const ocrRefinementStartedAt = getNowMs()
      refinedOcrResult = await refineLowConfidenceOcrPages({
        colors,
        document,
        extractOcrPageTexts,
        initialResult: ocrResult,
        nativeTextPageCount: pageTexts.size,
        ocrConcurrency,
        ocrDeadlineMs,
        ocrEngineFactory,
        ocrMaxPageWidth,
        ocrPageTexts,
        onProgress,
        partCatalogue,
        signal,
      })
      extractionTimings.ocrRefinementMs += getElapsedMs(ocrRefinementStartedAt)
    }
    const finalOcrResult = withExtractionMetadata(
      refinedOcrResult,
      "ocr",
      ocrPageTexts.size,
      createExtractionTimings(extractionTimings, extractionStartedAt),
    )
    const sourceOrderedProgressStartedAt = getNowMs()
    await yieldToBrowser()
    extractionTimings.sourceOrderedProgressMs += getElapsedMs(sourceOrderedProgressStartedAt)
    finalOcrResult.extractionTimings = createExtractionTimings(extractionTimings, extractionStartedAt)
    onProgress?.({
      currentPage: null,
      detectedPageCount: finalOcrResult.candidates.length,
      message: `Finished reading ${finalOcrResult.candidates.length} inventory pages.`,
      pageCount: document.numPages,
      partialResult: finalOcrResult,
      phase: "complete",
      previewReadyPageNumbers: getPreviewReadyPageNumbersFromResult(finalOcrResult),
      progress: 100,
      rowCount: finalOcrResult.rows.length,
      scannedPageCount: ocrPageTexts.size,
    })
    return finalOcrResult
  }

  if (!ocrEngineFactory) {
    await disposePreloadedPartsListOcrWorker()
  }

  return withExtractionMetadata(
    ocrResult,
    "none",
    ocrPageTexts.size,
    createExtractionTimings(extractionTimings, extractionStartedAt),
  )
}

function canUseNativeTextResult(
  result: PartsListPdfExtractionResult,
  pageTexts: ReadonlyMap<number, PartsListPageText>,
) {
  if (result.status !== "supported") {
    return false
  }

  return result.candidates.some((candidate) => {
    const pageText = pageTexts.get(candidate.pageNumber)
    return Boolean(pageText && hasInitialInventoryPageEvidence(candidate.rowCount, pageText))
  })
}

async function expandNativeTextInventorySpan({
  colors,
  document,
  initialResult,
  pageTexts,
  partCatalogue,
  signal,
}: {
  colors: readonly PartsListColor[]
  document: PdfReadableDocument
  initialResult: PartsListPdfExtractionResult
  pageTexts: Map<number, PartsListPageText>
  partCatalogue?: PartsListPartCatalogue | null
  signal?: AbortSignal
}) {
  const earliestInventoryPage = Math.min(
    ...initialResult.candidates
      .filter((candidate) => candidate.rowCount > 0)
      .map((candidate) => candidate.pageNumber),
  )
  if (!Number.isFinite(earliestInventoryPage)) {
    return initialResult
  }

  for (let pageNumber = earliestInventoryPage - 1; pageNumber >= 1; pageNumber -= 1) {
    await extractAndStorePageTexts({
      document,
      pageNumbers: [pageNumber],
      pageTexts,
      signal,
    })

    const pageText = pageTexts.get(pageNumber) ?? null
    if (!pageText) {
      break
    }

    const pageResult = extractPartsListFromPageTexts({
      colors,
      minimumRowCount: 1,
      pageCount: document.numPages,
      pageTexts: [pageText],
      partCatalogue,
      tailPageCount: document.numPages,
    })
    if (!hasContinuationInventoryPageEvidence(pageResult, pageText)) {
      break
    }
  }

  return extractFromStoredPageTexts({
    colors,
    document,
    pageTexts,
    partCatalogue,
    tailPageCount: document.numPages,
  })
}

async function refineLowConfidenceOcrPages({
  colors,
  document,
  extractOcrPageTexts,
  initialResult,
  nativeTextPageCount,
  ocrConcurrency,
  ocrDeadlineMs,
  ocrEngineFactory,
  ocrMaxPageWidth,
  ocrPageTexts,
  onProgress,
  partCatalogue,
  signal,
}: {
  colors: readonly PartsListColor[]
  document: PdfReadableDocument
  extractOcrPageTexts: typeof extractPdfPageTextsWithOcr
  initialResult: PartsListPdfExtractionResult
  nativeTextPageCount: number
  ocrConcurrency?: number
  ocrDeadlineMs: number | null | undefined
  ocrEngineFactory?: PdfPageOcrOptions["createWorker"]
  ocrMaxPageWidth: number
  ocrPageTexts: Map<number, PartsListPageText>
  onProgress?: (progress: PartsListPdfExtractionProgress) => void
  partCatalogue?: PartsListPartCatalogue | null
  signal?: AbortSignal
}) {
  const retryPageNumbers = getDenseRetryPageNumbers(initialResult)
  if (retryPageNumbers.length === 0) {
    return initialResult
  }

  const retryPageTexts = new Map<number, PartsListPageText>()
  await extractAndStoreOcrPageTexts({
    document,
    extractOcrPageTexts,
    ocrPageTexts: retryPageTexts,
    pageNumbers: retryPageNumbers,
    options: {
      basePageTextsByPageNumber: ocrPageTexts,
      concurrency: getOcrCandidateProcessingConcurrency({
        candidatePageCount: retryPageNumbers.length,
        requestedConcurrency: ocrConcurrency,
      }),
      createWorker: ocrEngineFactory,
      deadlineMs: ocrDeadlineMs,
      denseCropRetries: true,
      maxPageWidth: ocrMaxPageWidth,
      onPageStart: (pageNumber, pageTexts) => {
        onProgress?.({
          currentPage: pageNumber,
          detectedPageCount: retryPageNumbers.length,
          message: `Refining inventory page ${pageNumber} with focused OCR retries.`,
          pageCount: document.numPages,
          phase: "ocr",
          progress: Math.min(95, 70 + Math.round((pageTexts.length / Math.max(1, retryPageNumbers.length)) * 20)),
          rowCount: initialResult.rows.length,
          scannedPageCount: ocrPageTexts.size,
        })
      },
      signal,
    },
  })

  if (retryPageTexts.size === 0) {
    return initialResult
  }

  for (const [pageNumber, pageText] of retryPageTexts) {
    ocrPageTexts.set(pageNumber, pageText)
  }

  const refinedResult = extractFromStoredPageTexts({
    colors,
    document,
    nativeTextPageCount,
    pageTexts: ocrPageTexts,
    partCatalogue,
    tailPageCount: document.numPages,
  })

  return refinedResult.status === "unsupported" ? initialResult : refinedResult
}

async function processSplitOcrCandidatePages({
  candidatePageNumbers,
  colors,
  document,
  extractOcrPageTexts,
  extractionStartedAt,
  extractionTimings,
  nativeTextPageCount,
  ocrDeadlineMs,
  ocrDenseCropRetries,
  ocrEngineFactory,
  ocrMaxPageWidth,
  ocrPageTexts,
  onProgress,
  partCatalogue,
  signal,
}: {
  candidatePageNumbers: readonly number[]
  colors: readonly PartsListColor[]
  document: PdfReadableDocument
  extractOcrPageTexts: typeof extractPdfPageTextsWithOcr
  extractionStartedAt: number
  extractionTimings: Omit<PartsListPdfExtractionTimings, "totalMs">
  nativeTextPageCount: number
  ocrDeadlineMs: number | null | undefined
  ocrDenseCropRetries: boolean
  ocrEngineFactory?: PdfPageOcrOptions["createWorker"]
  ocrMaxPageWidth: number
  ocrPageTexts: Map<number, PartsListPageText>
  onProgress?: (progress: PartsListPdfExtractionProgress) => void
  partCatalogue?: PartsListPartCatalogue | null
  signal?: AbortSignal
}) {
  const finalizedPageTexts = new Map<number, PartsListPageText>()
  const previewReadyPageNumbers: number[] = []

  for (const [index, pageNumber] of candidatePageNumbers.entries()) {
    const pageTextsForCurrentPage = new Map<number, PartsListPageText>()
    await extractAndStoreOcrPageTexts({
      document,
      extractOcrPageTexts,
      ocrPageTexts: pageTextsForCurrentPage,
      pageNumbers: [pageNumber],
      options: {
        concurrency: 1,
        createWorker: ocrEngineFactory,
        deadlineMs: ocrDeadlineMs,
        denseCropRetries: ocrDenseCropRetries,
        maxPageWidth: ocrMaxPageWidth,
        onPageStart: () => {
          onProgress?.({
            currentPage: pageNumber,
            detectedPageCount: candidatePageNumbers.length,
            message: `Inventory span detected; finishing page ${pageNumber} with full OCR.`,
            pageCount: document.numPages,
            phase: "ocr",
            progress: getSplitCandidatePageProgress(index, candidatePageNumbers.length, 0),
            rowCount: getCandidatePageRowCount(finalizedPageTexts, colors, document, partCatalogue),
            scannedPageCount: ocrPageTexts.size,
          })
        },
        retainDefaultWorkerAfterUse: true,
        signal,
      },
    })

    const pageText = pageTextsForCurrentPage.get(pageNumber)
    if (!pageText) {
      continue
    }

    ocrPageTexts.set(pageNumber, pageText)
    finalizedPageTexts.set(pageNumber, pageText)

    await refineSplitOcrCandidatePageIfNeeded({
      colors,
      document,
      extractOcrPageTexts,
      finalizedPageTexts,
      nativeTextPageCount,
      ocrDeadlineMs,
      ocrEngineFactory,
      ocrMaxPageWidth,
      ocrPageTexts,
      pageNumber,
      partCatalogue,
      signal,
    })

    const partialResult = extractFromCandidatePageTexts({
      colors,
      document,
      nativeTextPageCount,
      pageTexts: finalizedPageTexts,
      partCatalogue,
    })
    if (partialResult.status === "unsupported" || partialResult.rows.length === 0) {
      continue
    }

    previewReadyPageNumbers.push(pageNumber)
    const resultWithMetadata = withExtractionMetadata(
      partialResult,
      "ocr",
      ocrPageTexts.size,
      createExtractionTimings(extractionTimings, extractionStartedAt),
    )
    onProgress?.({
      currentPage: pageNumber,
      detectedPageCount: candidatePageNumbers.length,
      message: `Finished inventory page ${pageNumber}; ${previewReadyPageNumbers.length} pages ready.`,
      pageCount: document.numPages,
      partialResult: resultWithMetadata,
      phase: "ocr",
      previewReadyPageNumbers: [...previewReadyPageNumbers],
      progress: getSplitCandidatePageProgress(index, candidatePageNumbers.length, 1),
      rowCount: resultWithMetadata.rows.length,
      scannedPageCount: ocrPageTexts.size,
    })
    await yieldToBrowser()
  }

  return previewReadyPageNumbers
}

async function refineSplitOcrCandidatePageIfNeeded({
  colors,
  document,
  extractOcrPageTexts,
  finalizedPageTexts,
  nativeTextPageCount,
  ocrDeadlineMs,
  ocrEngineFactory,
  ocrMaxPageWidth,
  ocrPageTexts,
  pageNumber,
  partCatalogue,
  signal,
}: {
  colors: readonly PartsListColor[]
  document: PdfReadableDocument
  extractOcrPageTexts: typeof extractPdfPageTextsWithOcr
  finalizedPageTexts: Map<number, PartsListPageText>
  nativeTextPageCount: number
  ocrDeadlineMs: number | null | undefined
  ocrEngineFactory?: PdfPageOcrOptions["createWorker"]
  ocrMaxPageWidth: number
  ocrPageTexts: Map<number, PartsListPageText>
  pageNumber: number
  partCatalogue?: PartsListPartCatalogue | null
  signal?: AbortSignal
}) {
  const pageText = finalizedPageTexts.get(pageNumber)
  if (!pageText) {
    return
  }

  const pageResult = extractFromCandidatePageTexts({
    colors,
    document,
    nativeTextPageCount,
    pageTexts: new Map([[pageNumber, pageText]]),
    partCatalogue,
  })
  if (!shouldRetryFinalizedOcrPage(pageResult, pageNumber)) {
    return
  }

  const retryPageTexts = new Map<number, PartsListPageText>()
  await extractAndStoreOcrPageTexts({
    document,
    extractOcrPageTexts,
    ocrPageTexts: retryPageTexts,
    pageNumbers: [pageNumber],
    options: {
      basePageTextsByPageNumber: ocrPageTexts,
      concurrency: 1,
      createWorker: ocrEngineFactory,
      deadlineMs: ocrDeadlineMs,
      denseCropRetries: true,
      maxPageWidth: ocrMaxPageWidth,
      signal,
    },
  })

  const refinedPageText = retryPageTexts.get(pageNumber)
  if (!refinedPageText) {
    return
  }

  finalizedPageTexts.set(pageNumber, refinedPageText)
  ocrPageTexts.set(pageNumber, refinedPageText)
}

function extractFromCandidatePageTexts({
  colors,
  document,
  nativeTextPageCount,
  pageTexts,
  partCatalogue,
}: {
  colors: readonly PartsListColor[]
  document: PdfReadableDocument
  nativeTextPageCount: number
  pageTexts: ReadonlyMap<number, PartsListPageText>
  partCatalogue?: PartsListPartCatalogue | null
}): PartsListPdfExtractionResult {
  const orderedPageTexts = [...pageTexts.values()].sort((left, right) => left.pageNumber - right.pageNumber)
  const result = extractPartsListFromPageTexts({
    colors,
    minimumRowCount: 1,
    pageCount: document.numPages,
    pageTexts: orderedPageTexts,
    partCatalogue,
    tailPageCount: document.numPages,
  })

  return {
    ...result,
    extractionMethod: "none",
    extractorVersion: partsListExtractorVersion,
    nativeTextPageCount,
    ocrPageCount: 0,
  }
}

function getCandidatePageRowCount(
  pageTexts: ReadonlyMap<number, PartsListPageText>,
  colors: readonly PartsListColor[],
  document: PdfReadableDocument,
  partCatalogue?: PartsListPartCatalogue | null,
) {
  if (pageTexts.size === 0) {
    return 0
  }

  return extractFromCandidatePageTexts({
    colors,
    document,
    nativeTextPageCount: 0,
    pageTexts,
    partCatalogue,
  }).rows.length
}

function getSplitCandidatePageProgress(pageIndex: number, pageCount: number, completedPageWeight: 0 | 1) {
  return Math.min(95, 70 + Math.round(((pageIndex + completedPageWeight) / Math.max(1, pageCount)) * 25))
}

function getPreviewReadyPageNumbersFromResult(result: Pick<PartsListPdfExtractionResult, "rows">) {
  return [...new Set(result.rows.map((row) => row.sourcePage))].sort((left, right) => left - right)
}

function shouldRetryFinalizedOcrPage(result: PartsListFromPageTextResult, pageNumber: number) {
  const rowCountByPageNumber = getParsedRowCountByPageNumber(result)
  const rowCount = rowCountByPageNumber.get(pageNumber) ?? 0
  if (rowCount < minDenseRetryRowsOnPage) {
    return false
  }

  if (getDenseRetryPageNumbers(result).includes(pageNumber)) {
    return true
  }

  if (result.lowConfidenceRows.some((row) => row.sourcePage === pageNumber)) {
    return true
  }

  const pageText = result.debugPageTexts?.find((debugPageText) => debugPageText.pageNumber === pageNumber)
  return Boolean(pageText && pageText.rowSourceCount > rowCount)
}

function getDenseRetryPageNumbers(result: PartsListFromPageTextResult) {
  const pageNumbers = new Set<number>()
  const rowCountByPageNumber = getParsedRowCountByPageNumber(result)

  if (result.lowConfidenceRows.length >= minDenseRetryLowConfidenceRows) {
    const retryPageNumber = getWorstLowConfidencePageNumber(result, rowCountByPageNumber)
    return retryPageNumber ? [retryPageNumber] : []
  }

  if (result.status !== "supported") {
    return []
  }

  for (const pageText of result.debugPageTexts ?? []) {
    const rowCount = rowCountByPageNumber.get(pageText.pageNumber) ?? 0
    if (
      rowCount >= minDenseRetryRowsOnPage &&
      pageText.rowSourceCount > rowCount
    ) {
      pageNumbers.add(pageText.pageNumber)
    }
  }

  return [...pageNumbers].sort((left, right) => left - right)
}

function getWorstLowConfidencePageNumber(
  result: PartsListFromPageTextResult,
  rowCountByPageNumber: ReadonlyMap<number, number>,
) {
  const lowConfidenceCountByPageNumber = new Map<number, number>()
  for (const row of result.lowConfidenceRows) {
    lowConfidenceCountByPageNumber.set(
      row.sourcePage,
      (lowConfidenceCountByPageNumber.get(row.sourcePage) ?? 0) + 1,
    )
  }

  return [...lowConfidenceCountByPageNumber.entries()]
    .filter(([pageNumber]) => (rowCountByPageNumber.get(pageNumber) ?? 0) >= minDenseRetryRowsOnPage)
    .sort((left, right) =>
      right[1] - left[1] ||
      (rowCountByPageNumber.get(right[0]) ?? 0) - (rowCountByPageNumber.get(left[0]) ?? 0) ||
      left[0] - right[0],
    )[0]?.[0] ?? null
}

function getParsedRowCountByPageNumber(result: PartsListFromPageTextResult) {
  const rowCountByPageNumber = new Map<number, number>()
  for (const row of result.rows) {
    rowCountByPageNumber.set(row.sourcePage, (rowCountByPageNumber.get(row.sourcePage) ?? 0) + 1)
  }

  return rowCountByPageNumber
}

async function yieldToBrowser() {
  if (typeof window === "undefined") {
    return
  }

  await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
}

function getBackwardsPageNumbers(pageCount: number) {
  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    return []
  }

  return Array.from({ length: pageCount }, (_, index) => pageCount - index)
}

function getDetectedOcrCandidatePageNumbers(pageNumbers: ReadonlySet<number>) {
  return [...pageNumbers].sort((left, right) => left - right)
}

function shouldSplitOcrCandidateProcessing({
  pageCount,
  splitCandidateProcessing,
}: {
  pageCount: number
  splitCandidateProcessing: boolean | "auto"
}) {
  if (splitCandidateProcessing !== "auto") {
    return splitCandidateProcessing
  }

  return pageCount >= minSplitOcrDocumentPages
}

function getOcrCandidateProcessingConcurrency({
  candidatePageCount,
  requestedConcurrency,
}: {
  candidatePageCount: number
  requestedConcurrency?: number
}) {
  const requested = getPositiveInteger(requestedConcurrency)
  const targetConcurrency = requested ?? Math.min(
    candidatePageCount >= manyPageCandidateConcurrencyThreshold
      ? defaultOcrManyPageCandidateConcurrency
      : defaultOcrCandidateConcurrency,
    getHardwareOcrConcurrencyLimit(),
  )

  return Math.max(1, Math.min(candidatePageCount, targetConcurrency))
}

function getSinglePassOcrConcurrency(requestedConcurrency: number | undefined) {
  return getPositiveInteger(requestedConcurrency) ?? 1
}

function getHardwareOcrConcurrencyLimit() {
  const hardwareConcurrency = typeof navigator === "undefined" ? 0 : navigator.hardwareConcurrency
  if (!Number.isFinite(hardwareConcurrency) || hardwareConcurrency <= 0) {
    return defaultOcrCandidateConcurrency
  }

  if (hardwareConcurrency >= 10) {
    return defaultOcrManyPageCandidateConcurrency
  }

  if (hardwareConcurrency >= 6) {
    return defaultOcrCandidateConcurrency
  }

  if (hardwareConcurrency >= 4) {
    return 2
  }

  return 1
}

function getPositiveInteger(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : null
}

function shouldStopOcrAfterLatestPage({
  colors,
  foundCandidatePage,
  latestPageText,
  pageCount,
  partCatalogue,
  tailPageCount,
  updateFoundCandidatePage,
}: {
  colors: readonly PartsListColor[]
  foundCandidatePage: boolean
  latestPageText: PartsListPageText | null
  pageCount: number
  partCatalogue?: PartsListPartCatalogue | null
  tailPageCount: number
  updateFoundCandidatePage: (pageNumber: number) => void
}) {
  if (!latestPageText) {
    return false
  }

  const latestPageResult = extractPartsListFromPageTexts({
    colors,
    minimumRowCount: 1,
    pageCount,
    pageTexts: [latestPageText],
    partCatalogue,
    tailPageCount,
  })

  if (foundCandidatePage && hasContinuationInventoryPageEvidence(latestPageResult, latestPageText)) {
    updateFoundCandidatePage(latestPageText.pageNumber)
    return false
  }

  if (!foundCandidatePage) {
    if (hasInitialOcrInventorySpanEvidence(latestPageResult, latestPageText)) {
      updateFoundCandidatePage(latestPageText.pageNumber)
      return false
    }

    return !isLikelyTrailingDecorativeOcrPage(latestPageText)
  }

  return true
}

function hasInitialOcrInventorySpanEvidence(result: PartsListFromPageTextResult, pageText: PartsListPageText) {
  if (result.status === "unsupported") {
    return false
  }

  if (!hasInitialInventoryPageEvidence(result.rows.length, pageText)) {
    return false
  }

  return result.candidates.some((candidate) => hasInitialInventoryPageEvidence(candidate.rowCount, pageText))
}

function hasInitialInventoryPageEvidence(rowCount: number, pageText: PartsListPageText) {
  if (hasInventoryHeadingText(pageText.text)) {
    return rowCount >= 2
  }

  if (hasDenseOcrInventoryEvidence(rowCount, pageText, minDenseOcrInventoryRows)) {
    return true
  }

  return rowCount >= minInitialOcrInventoryRows && hasStudioGridInventoryEvidence(pageText)
}

function hasContinuationInventoryPageEvidence(
  result: PartsListFromPageTextResult,
  pageText: PartsListPageText,
) {
  if (result.status === "unsupported") {
    return false
  }

  if (hasInventoryHeadingText(pageText.text)) {
    return result.rows.length >= 1
  }

  if (hasDenseOcrInventoryEvidence(result.rows.length, pageText, minDenseOcrContinuationRows)) {
    return true
  }

  return result.rows.length >= 1 && hasStudioGridInventoryEvidence(pageText, 1)
}

function hasDenseOcrInventoryEvidence(rowCount: number, pageText: PartsListPageText, minimumRows: number) {
  return pageText.sourceKind === "ocr" && rowCount >= minimumRows && !hasStepLocalPartsHeadingText(pageText.text)
}

function hasStudioGridInventoryEvidence(pageText: PartsListPageText, minimumRows = minInitialOcrInventoryRows) {
  const gridRowCount =
    pageText.rowSources?.filter((rowSource) =>
      rowSource.rawTokens.some((token) => /^studio-(?:grid|thumbnail)$/.test(token)),
    ).length ?? 0

  return gridRowCount >= minimumRows
}

function hasInventoryHeadingText(text: string) {
  return /\b(?:bill\s+of\s+materials|inventory|parts\s+list)\b/i.test(text)
}

function hasStepLocalPartsHeadingText(text: string) {
  return /\bparts\s+needed\b/i.test(text)
}

function isLikelyTrailingDecorativeOcrPage(pageText: PartsListPageText) {
  const text = pageText.text.trim()
  if (!text) {
    return true
  }

  if (/(^|[^a-z0-9])\d{1,3}\s*(?:x|\u00d7)(?=$|[^a-z0-9])/i.test(text)) {
    return false
  }

  const compactText = text.replace(/\s+/g, "")
  return compactText.length <= 16 && /^[a-z0-9_-]+$/i.test(compactText)
}

async function extractAndStorePageTexts({
  document,
  pageNumbers,
  pageTexts,
  signal,
}: {
  document: PdfReadableDocument
  pageNumbers: readonly number[]
  pageTexts: Map<number, PartsListPageText>
  signal?: AbortSignal
}) {
  const missingPageNumbers = pageNumbers.filter((pageNumber) => !pageTexts.has(pageNumber))
  const extractedPageTexts = await extractPdfPageTexts(document, missingPageNumbers, { signal })

  for (const pageText of extractedPageTexts) {
    pageTexts.set(pageText.pageNumber, pageText)
  }
}

async function extractAndStoreOcrPageTexts({
  document,
  extractOcrPageTexts,
  ocrPageTexts,
  options,
  pageNumbers,
}: {
  document: PdfReadableDocument
  extractOcrPageTexts: typeof extractPdfPageTextsWithOcr
  ocrPageTexts: Map<number, PartsListPageText>
  options: PdfPageOcrOptions
  pageNumbers: readonly number[]
}) {
  const missingPageNumbers = pageNumbers.filter((pageNumber) => !ocrPageTexts.has(pageNumber))
  if (missingPageNumbers.length === 0) {
    return
  }

  try {
    const extractedPageTexts = await extractOcrPageTexts(document, missingPageNumbers, options)

    for (const pageText of extractedPageTexts) {
      ocrPageTexts.set(pageText.pageNumber, pageText)
    }
  } catch (error) {
    if (options.signal?.aborted) {
      throw error
    }

    return
  }
}

function extractFromStoredPageTexts({
  colors,
  document,
  nativeTextPageCount,
  pageTexts,
  partCatalogue,
  tailPageCount,
}: {
  colors: readonly PartsListColor[]
  document: PdfReadableDocument
  nativeTextPageCount?: number
  pageTexts: ReadonlyMap<number, PartsListPageText>
  partCatalogue?: PartsListPartCatalogue | null
  tailPageCount: number
}): PartsListPdfExtractionResult {
  const inventoryPageTexts = selectInventoryEvidencePageTexts({
    colors,
    document,
    pageTexts,
    partCatalogue,
    tailPageCount,
  })
  const result = extractPartsListFromPageTexts({
    colors,
    pageCount: document.numPages,
    pageTexts: inventoryPageTexts,
    partCatalogue,
    tailPageCount,
  })
  const status = hasAmbiguousNativeTextContinuationPages({
    colors,
    document,
    pageTexts: [...pageTexts.values()],
    partCatalogue,
    selectedPageTexts: inventoryPageTexts,
    tailPageCount,
  })
    ? "needs_attention"
    : result.status

  return {
    ...result,
    extractionMethod: "none",
    extractorVersion: partsListExtractorVersion,
    nativeTextPageCount: nativeTextPageCount ?? pageTexts.size,
    ocrPageCount: 0,
    status,
  }
}

function selectInventoryEvidencePageTexts({
  colors,
  document,
  pageTexts,
  partCatalogue,
  tailPageCount,
}: {
  colors: readonly PartsListColor[]
  document: PdfReadableDocument
  pageTexts: ReadonlyMap<number, PartsListPageText>
  partCatalogue?: PartsListPartCatalogue | null
  tailPageCount: number
}) {
  const orderedPageTexts = [...pageTexts.values()].sort((left, right) => left.pageNumber - right.pageNumber)
  const pageTextByNumber = new Map(orderedPageTexts.map((pageText) => [pageText.pageNumber, pageText]))
  const resultByPageNumber = new Map(
    orderedPageTexts.map((pageText) => [
      pageText.pageNumber,
      extractPartsListFromPageTexts({
        colors,
        minimumRowCount: 1,
        pageCount: document.numPages,
        pageTexts: [pageText],
        partCatalogue,
        tailPageCount,
      }),
    ]),
  )
  const selectedPageNumbers = new Set<number>()
  const anchorPageNumbers = orderedPageTexts
    .filter((pageText) => {
      const result = resultByPageNumber.get(pageText.pageNumber)
      return Boolean(result && hasInitialOcrInventorySpanEvidence(result, pageText))
    })
    .map((pageText) => pageText.pageNumber)

  for (const pageNumber of anchorPageNumbers) {
    selectedPageNumbers.add(pageNumber)
    expandSelectedInventoryPageTexts({
      direction: -1,
      pageTextByNumber,
      resultByPageNumber,
      selectedPageNumbers,
      startPageNumber: pageNumber,
    })
    expandSelectedInventoryPageTexts({
      direction: 1,
      pageTextByNumber,
      resultByPageNumber,
      selectedPageNumbers,
      startPageNumber: pageNumber,
    })
  }

  return orderedPageTexts.filter((pageText) => selectedPageNumbers.has(pageText.pageNumber))
}

function expandSelectedInventoryPageTexts({
  direction,
  pageTextByNumber,
  resultByPageNumber,
  selectedPageNumbers,
  startPageNumber,
}: {
  direction: -1 | 1
  pageTextByNumber: ReadonlyMap<number, PartsListPageText>
  resultByPageNumber: ReadonlyMap<number, PartsListFromPageTextResult>
  selectedPageNumbers: Set<number>
  startPageNumber: number
}) {
  for (let pageNumber = startPageNumber + direction; ; pageNumber += direction) {
    const pageText = pageTextByNumber.get(pageNumber)
    const result = resultByPageNumber.get(pageNumber)
    if (!pageText || !result || !hasContinuationInventoryPageEvidence(result, pageText)) {
      return
    }

    selectedPageNumbers.add(pageNumber)
  }
}

function hasAmbiguousNativeTextContinuationPages({
  colors,
  document,
  pageTexts,
  partCatalogue,
  selectedPageTexts,
  tailPageCount,
}: {
  colors: readonly PartsListColor[]
  document: PdfReadableDocument
  pageTexts: readonly PartsListPageText[]
  partCatalogue?: PartsListPartCatalogue | null
  selectedPageTexts: readonly PartsListPageText[]
  tailPageCount: number
}) {
  if (selectedPageTexts.length === 0) {
    return false
  }

  const selectedPageNumbers = new Set(selectedPageTexts.map((pageText) => pageText.pageNumber))
  const firstSelectedPage = Math.min(...selectedPageNumbers)
  const lastSelectedPage = Math.max(...selectedPageNumbers)

  return pageTexts.some((pageText) => {
    if (
      pageText.sourceKind !== "native_text" ||
      selectedPageNumbers.has(pageText.pageNumber) ||
      hasInventoryHeadingText(pageText.text) ||
      hasStepLocalPartsHeadingText(pageText.text) ||
      (pageText.pageNumber !== firstSelectedPage - 1 && pageText.pageNumber !== lastSelectedPage + 1)
    ) {
      return false
    }

    const result = extractPartsListFromPageTexts({
      colors,
      minimumRowCount: 1,
      pageCount: document.numPages,
      pageTexts: [pageText],
      partCatalogue,
      tailPageCount,
    })

    return result.rows.length > 0
  })
}

function withExtractionMetadata(
  result: PartsListPdfExtractionResult,
  extractionMethod: PartsListPdfExtractionResult["extractionMethod"],
  ocrPageCount: number,
  extractionTimings?: PartsListPdfExtractionTimings,
): PartsListPdfExtractionResult {
  return {
    ...result,
    extractionMethod,
    ...(extractionTimings ? { extractionTimings } : {}),
    ocrPageCount,
  }
}

function createEmptyExtractionTimings(): Omit<PartsListPdfExtractionTimings, "totalMs"> {
  return {
    nativeTextMs: 0,
    ocrDetectionMs: 0,
    ocrCandidateProcessingMs: 0,
    ocrResultParseMs: 0,
    ocrRefinementMs: 0,
    sourceOrderedProgressMs: 0,
  }
}

function createExtractionTimings(
  timings: Omit<PartsListPdfExtractionTimings, "totalMs">,
  startedAt: number,
): PartsListPdfExtractionTimings {
  return {
    nativeTextMs: Math.round(timings.nativeTextMs),
    ocrDetectionMs: Math.round(timings.ocrDetectionMs),
    ocrCandidateProcessingMs: Math.round(timings.ocrCandidateProcessingMs),
    ocrResultParseMs: Math.round(timings.ocrResultParseMs),
    ocrRefinementMs: Math.round(timings.ocrRefinementMs),
    sourceOrderedProgressMs: Math.round(timings.sourceOrderedProgressMs),
    totalMs: Math.round(getNowMs() - startedAt),
  }
}

function getElapsedMs(startedAt: number) {
  return getNowMs() - startedAt
}

function getNowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now()
}
