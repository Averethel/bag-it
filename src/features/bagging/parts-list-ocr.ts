import {
  isLikelyManualPartNumber,
  type PartsListPageDiagnostics,
  type PartsListPageRowSource,
  type PartsListPageText,
  type PartsListPrivateCropReference,
  type PartsListSourceImage,
  type PartsListSourceRegion,
  type PartsListTextRange,
} from "./parts-list-extraction"
import {
  getPaddleOcrModelAssetUrl,
  paddleOcrModelAssetFiles,
  type PaddleOcrModelAssetFile,
  paddleOcrTextDetectionModelName,
  paddleOcrTextRecognitionModelName,
} from "./paddle-ocr-assets"
import type { PdfReadableDocument, PdfReadablePage } from "./pdf-intake"
import { getSupportedStudioColorCodeAlias } from "./rebrickable-catalogue"

type OcrBbox = {
  x0: number
  x1: number
  y0: number
  y1: number
}

type OcrLine = {
  bbox?: OcrBbox
  sourceRank?: number
  text?: string
}

type OcrBlock = {
  bbox?: OcrBbox
  paragraphs?: readonly {
      lines?: readonly OcrLine[]
    }[]
  sourceRank?: number
  text?: string
}

type OcrData = {
  blocks?: readonly OcrBlock[] | null
  text?: string
  textVariants?: readonly string[]
}

type OcrInputVariantKind = "canvas" | "dense_part_label_crops"

type OcrInputVariant = {
  coordinateOffsetX?: number
  coordinateOffsetY?: number
  crops?: readonly PartImageAnchorCrop[]
  image: HTMLCanvasElement
  inputKind: OcrInputVariantKind
  sourceRank?: number
}

type PositionedOcrLine = {
  bbox: OcrBbox
  centerX: number
  centerY: number
  normalizedText: string
  sourceRank: number
}

type PartLineMatch = {
  colorText: string
  line: PositionedOcrLine
  partNumber: string
}

type GridQuantityCandidate = {
  line: PositionedOcrLine
  quantity: number
  source: "bare" | "explicit" | "glyph_slip"
}

type PartColorAnchor = {
  colorId: string
  line: PositionedOcrLine
  matchEnd: number
  matchStart: number
  partNumber: string
  quantity: number | null
}

type PartColorAnchorQuantityPair = {
  anchor: PartColorAnchor
  quantity: number
  quantityLine: PositionedOcrLine | null
  score: number
}

type PartImageAnchor = {
  region: OcrBbox
}

type PartImageAnchorCrop = {
  scale: number
  sheetRegion: OcrBbox
  sourceRegion: OcrBbox
}

type PartImageAnchorCropSheet = {
  canvas: HTMLCanvasElement
  crops: PartImageAnchorCrop[]
}

type StudioGridCell = {
  anchor: PartImageAnchor
  region: OcrBbox
}

type StudioGridCellRowCandidate = {
  partColor: PartColorAnchor
  quantityCandidate: GridQuantityCandidate | null
  score: number
}

type AlignedQuantityToken = {
  quantity: number
  start: number
}

type AlignedPartColorToken = {
  colorId: string
  partNumber: string
  start: number
}

type AlignedPartNumberToken = {
  end: number
  partNumber: string
  start: number
}

type SequentialQuantityToken = AlignedQuantityToken & {
  fused?: boolean
  lineIndex: number
}

type SequentialPartToken = AlignedPartNumberToken & {
  colorText?: string
  lineIndex: number
}

type OcrRowParts = {
  colorText: string
  partNumber: string
  quantity: number
}

type OcrReconstructedRow = {
  partThumbnailRegion: PartsListSourceRegion | null
  rawTokens: string[]
  rowRegion: PartsListSourceRegion | null
  sourceRank: number
  text: string
}

type PaddleOcrResult = {
  image: {
    height: number
    width: number
  }
  items: readonly {
    poly: readonly [number, number][]
    score: number
    text: string
  }[]
  metrics?: {
    totalMs?: number
  }
}

type PaddleOcrRunner = {
  dispose?: () => Promise<unknown>
  getInitializationSummary?: () => unknown
  predict: (
    image: HTMLCanvasElement,
    params?: Record<string, unknown>,
  ) => Promise<readonly PaddleOcrResult[]>
}

type PartsListOcrEngine = {
  recognize: (
    image: HTMLCanvasElement,
    options?: OcrRecognizeOptions,
    output?: { blocks?: boolean; text?: boolean },
  ) => Promise<{ data: OcrData }>
  terminate?: () => Promise<unknown>
}

type OcrRecognizeOptions = Record<string, never>

export type PartsListOcrEngineFactory = (options: {
  remainingMs: () => number
  signal?: AbortSignal
}) => Promise<PartsListOcrEngine>

export type PdfPageOcrOptions = {
  basePageTextsByPageNumber?: ReadonlyMap<number, PartsListPageText>
  concurrency?: number
  createWorker?: PartsListOcrEngineFactory
  deadlineMs?: number | null
  denseCropRetries?: boolean
  maxPageWidth?: number
  maxPixels?: number
  onPageStart?: (pageNumber: number, pageTexts: readonly PartsListPageText[]) => void
  onPageText?: (pageText: PartsListPageText, pageTexts: readonly PartsListPageText[]) => void
  retainDefaultWorkerAfterUse?: boolean
  shouldSkipPage?: (pageNumber: number, pageTexts: readonly PartsListPageText[]) => boolean
  shouldStop?: (pageTexts: readonly PartsListPageText[]) => boolean
  signal?: AbortSignal
}

const defaultOcrDeadlineMs: number | null = null
const defaultOcrWorkerAcquisitionDeadlineMs = 30_000
const defaultOcrMaxPageWidth = 3_200
const defaultOcrMaxPixels = 10_000_000
const defaultOcrConcurrency = 1
const defaultDenseCropSheetMaxPixels = 5_000_000
const defaultDenseCropSheetTotalPixels = 24_000_000
const minDensePartLabelCropAnchors = 2
const paddleOcrPipelineName = "PP-OCRv5"
const paddleOcrWasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/"
const paddleOcrPredictParams = {
  textDetLimitSideLen: defaultOcrMaxPageWidth,
  textDetLimitType: "max",
  textDetMaxSideLimit: 4_096,
  textRecScoreThresh: 0,
}
let preloadedPaddleOcrEngine: PartsListOcrEngine | null = null
let preloadedPaddleOcrEnginePromise: Promise<PartsListOcrEngine> | null = null

export function preloadPartsListOcrWorker({
  createWorker = createDefaultPaddleOcrEngine,
  deadlineMs = defaultOcrWorkerAcquisitionDeadlineMs,
  signal,
}: {
  createWorker?: PartsListOcrEngineFactory
  deadlineMs?: number | null
  signal?: AbortSignal
} = {}) {
  if (typeof window === "undefined") {
    return Promise.resolve(false)
  }

  if (preloadedPaddleOcrEngine) {
    return Promise.resolve(true)
  }

  if (preloadedPaddleOcrEnginePromise) {
    return waitForPreloadedOcrWorkerReadiness(preloadedPaddleOcrEnginePromise, deadlineMs, signal)
  }

  const workerPromise = Promise.resolve()
    .then(() => createWorker({ remainingMs: () => Number.POSITIVE_INFINITY, signal }))
    .then((worker) => {
      if (signal?.aborted) {
        void worker.terminate?.().catch(() => undefined)
        throw new PartsListOcrCancelledError()
      }

      preloadedPaddleOcrEngine = worker
      return worker
    })
    .catch((error: unknown) => {
      if (preloadedPaddleOcrEnginePromise === workerPromise) {
        preloadedPaddleOcrEnginePromise = null
      }

      throw error
    })

  preloadedPaddleOcrEnginePromise = workerPromise

  return waitForPreloadedOcrWorkerReadiness(workerPromise, deadlineMs, signal)
}

function waitForPreloadedOcrWorkerReadiness(
  workerPromise: Promise<PartsListOcrEngine>,
  deadlineMs: number | null | undefined,
  signal?: AbortSignal,
) {
  if (signal?.aborted) {
    return Promise.resolve(false)
  }

  if (deadlineMs == null) {
    return workerPromise.then(() => true).catch(() => false)
  }

  return new Promise<boolean>((resolve) => {
    let isSettled = false
    const settle = (value: boolean) => {
      if (isSettled) {
        return
      }

      isSettled = true
      cleanup()
      resolve(value)
    }
    const timeoutId = window.setTimeout(() => settle(false), Math.max(1, deadlineMs))
    const abort = () => settle(false)
    const cleanup = () => {
      window.clearTimeout(timeoutId)
      signal?.removeEventListener("abort", abort)
    }

    signal?.addEventListener("abort", abort, { once: true })
    workerPromise.then(
      () => settle(true),
      () => settle(false),
    )
  })
}

export async function disposePreloadedPartsListOcrWorker() {
  const worker = preloadedPaddleOcrEngine
  const workerPromise = preloadedPaddleOcrEnginePromise
  preloadedPaddleOcrEngine = null
  preloadedPaddleOcrEnginePromise = null

  if (worker) {
    await worker.terminate?.().catch(() => undefined)
    return
  }

  await workerPromise
    ?.then((pendingWorker) => pendingWorker.terminate?.().catch(() => undefined))
    .catch(() => undefined)
}

export async function extractPdfPageTextsWithOcr(
  document: PdfReadableDocument,
  pageNumbers: readonly number[],
  {
    concurrency = defaultOcrConcurrency,
    basePageTextsByPageNumber,
    createWorker = acquireDefaultPaddleOcrEngine,
    deadlineMs = defaultOcrDeadlineMs,
    denseCropRetries = true,
    maxPageWidth = defaultOcrMaxPageWidth,
    maxPixels = defaultOcrMaxPixels,
    onPageStart,
    onPageText,
    retainDefaultWorkerAfterUse = false,
    shouldSkipPage,
    shouldStop,
    signal,
  }: PdfPageOcrOptions = {},
): Promise<PartsListPageText[]> {
  if (!document.getPage || typeof window === "undefined") {
    return []
  }

  let deadlineAt = createOcrDeadlineAt(deadlineMs)
  const remainingMs = () => getRemainingOcrMs(deadlineAt)
  const boundedPageNumbers = getBoundedPageNumbers(pageNumbers, document.numPages)
  if (boundedPageNumbers.length === 0) {
    return []
  }

  const workers = await createOcrWorkerPool({
    createWorker,
    remainingMs,
    signal,
    workerCount: Math.min(getOcrConcurrency(concurrency), boundedPageNumbers.length),
  })
  deadlineAt = createOcrDeadlineAt(deadlineMs)
  const pageTexts: PartsListPageText[] = []

  try {
    for (let index = 0; index < boundedPageNumbers.length; index += workers.length) {
      assertOcrCanContinue(remainingMs, signal)
      const nextPageNumber = boundedPageNumbers[index]
      if (nextPageNumber && shouldSkipPage?.(nextPageNumber, pageTexts)) {
        break
      }

      const chunkPageNumbers = boundedPageNumbers.slice(index, index + workers.length)
      const chunkResults = await Promise.all(
        chunkPageNumbers.map((pageNumber, workerIndex) => {
          onPageStart?.(pageNumber, pageTexts)

          return extractPdfPageTextWithOcrWorker({
            document,
            basePageText: basePageTextsByPageNumber?.get(pageNumber) ?? null,
            denseCropRetries,
            maxPageWidth,
            maxPixels,
            pageNumber,
            remainingMs,
            signal,
            worker: workers[workerIndex]!,
          })
        }),
      )

      let shouldBreak = false
      for (const result of chunkResults) {
        if (result.deadlineExceeded) {
          shouldBreak = true
          break
        }

        if (!result.pageText) {
          continue
        }

        pageTexts.push(result.pageText)
        onPageText?.(result.pageText, pageTexts)

        if (shouldStop?.(pageTexts)) {
          shouldBreak = true
          break
        }
      }

      if (shouldBreak) {
        break
      }
    }
  } finally {
    await releaseOcrWorkerPool({
      createWorker,
      retainDefaultWorkerAfterUse,
      signal,
      workers,
    })
  }

  return pageTexts
}

async function releaseOcrWorkerPool({
  createWorker,
  retainDefaultWorkerAfterUse,
  signal,
  workers,
}: {
  createWorker: PartsListOcrEngineFactory
  retainDefaultWorkerAfterUse: boolean
  signal?: AbortSignal
  workers: readonly PartsListOcrEngine[]
}) {
  const [retainedWorker] = workers
  const shouldRetain =
    retainDefaultWorkerAfterUse &&
    createWorker === acquireDefaultPaddleOcrEngine &&
    retainedWorker &&
    !signal?.aborted

  if (shouldRetain) {
    if (preloadedPaddleOcrEngine && preloadedPaddleOcrEngine !== retainedWorker) {
      await preloadedPaddleOcrEngine.terminate?.().catch(() => undefined)
    }
    preloadedPaddleOcrEngine = retainedWorker
    preloadedPaddleOcrEnginePromise = null
    await Promise.all(workers.slice(1).map((worker) => worker.terminate?.().catch(() => undefined)))
    return
  }

  await Promise.all(workers.map((worker) => worker.terminate?.().catch(() => undefined)))
}

async function createOcrWorkerPool({
  createWorker,
  remainingMs,
  signal,
  workerCount,
}: {
  createWorker: PartsListOcrEngineFactory
  remainingMs: () => number
  signal?: AbortSignal
  workerCount: number
}) {
  const targetWorkerCount = Math.max(1, workerCount)
  const workerResults = await Promise.all(
    Array.from({ length: targetWorkerCount }, async () => {
      try {
        return { ok: true as const, worker: await createOcrWorkerWithDeadline({ createWorker, remainingMs, signal }) }
      } catch (error) {
        return { error, ok: false as const }
      }
    }),
  )
  const workers: PartsListOcrEngine[] = []
  let firstError: unknown = null
  for (const result of workerResults) {
    if (result.ok) {
      workers.push(result.worker)
    } else {
      firstError ??= result.error
    }
  }
  if (workers.length === 0) {
    throw firstError ?? new Error("Unable to create OCR worker")
  }

  return workers
}

async function createOcrWorkerWithDeadline({
  createWorker,
  remainingMs,
  signal,
}: {
  createWorker: PartsListOcrEngineFactory
  remainingMs: () => number
  signal?: AbortSignal
}) {
  const workerPromise = Promise.resolve().then(() => createWorker({ remainingMs, signal }))

  try {
    return await runWithOcrDeadline(workerPromise, remainingMs, signal)
  } catch (error) {
    if (error instanceof PartsListOcrDeadlineExceededError || error instanceof PartsListOcrCancelledError) {
      void workerPromise
        .then((worker) => worker.terminate?.().catch(() => undefined))
        .catch(() => undefined)
    }

    throw error
  }
}

function getOcrConcurrency(concurrency: number) {
  return Number.isFinite(concurrency) ? Math.max(1, Math.floor(concurrency)) : defaultOcrConcurrency
}

async function extractPdfPageTextWithOcrWorker({
  document,
  basePageText,
  denseCropRetries,
  maxPageWidth,
  maxPixels,
  pageNumber,
  remainingMs,
  signal,
  worker,
}: {
  document: PdfReadableDocument
  basePageText: PartsListPageText | null
  denseCropRetries: boolean
  maxPageWidth: number
  maxPixels: number
  pageNumber: number
  remainingMs: () => number
  signal?: AbortSignal
  worker: PartsListOcrEngine
}): Promise<{ deadlineExceeded: boolean; pageText: PartsListPageText | null }> {
  let page: PdfReadablePage | null = null

  try {
    if (!document.getPage) {
      return {
        deadlineExceeded: false,
        pageText: null,
      }
    }

    page = await runWithOcrDeadline(document.getPage(pageNumber), remainingMs, signal)
    const pageOcrResult = await extractPdfPageTextWithOcrScale({
      basePageText,
      maxPageWidth,
      maxPixels,
      page,
      pageNumber,
      denseCropRetries,
      remainingMs,
      signal,
      worker,
    })

    return {
      deadlineExceeded: false,
      pageText: pageOcrResult?.pageText ?? null,
    }
  } catch (error) {
    if (error instanceof PartsListOcrCancelledError) {
      throw error
    }

    return {
      deadlineExceeded: error instanceof PartsListOcrDeadlineExceededError,
      pageText: null,
    }
  } finally {
    page?.cleanup?.()
  }
}

async function extractPdfPageTextWithOcrScale({
  basePageText,
  denseCropRetries,
  maxPageWidth,
  maxPixels,
  page,
  pageNumber,
  remainingMs,
  signal,
  worker,
}: {
  basePageText: PartsListPageText | null
  denseCropRetries: boolean
  maxPageWidth: number
  maxPixels: number
  page: PdfReadablePage
  pageNumber: number
  remainingMs: () => number
  signal?: AbortSignal
  worker: PartsListOcrEngine
}) {
  const canvas = renderableCanvasFromPage(page, { maxPageWidth, maxPixels })
  if (!canvas) {
    return null
  }

  const renderStartedAt = performance.now()
  await renderPageToCanvas(page, canvas, remainingMs, signal)
  const renderMs = Math.round(performance.now() - renderStartedAt)
  const { studioGridAnchors, studioThumbnailAnchors } = detectPartImageAnchorSets(canvas)
  const inputKind: NonNullable<PartsListPageDiagnostics["ocr"]>["inputKind"] = "canvas"

  if (basePageText && denseCropRetries) {
    return refinePdfPageTextWithDenseOcrScale({
      basePageText,
      canvas,
      inputKind,
      maxPageWidth,
      maxPixels,
      pageNumber,
      remainingMs,
      renderMs,
      signal,
      studioGridAnchors,
      studioThumbnailAnchors,
      worker,
    })
  }

  const recognizeStartedAt = performance.now()
  const fullPageRecognizeStartedAt = performance.now()
  const data = await recognizeOcrInputImages(
    worker,
    [{ image: canvas, inputKind: "canvas" }],
    remainingMs,
    signal,
  )
  const fullPageRecognizeMs = Math.round(performance.now() - fullPageRecognizeStartedAt)
  const sourceImage = {
    height: canvas.height,
    unit: "ocr_pixel" as const,
    width: canvas.width,
  }
  const initialPageText = createOcrPageText(pageNumber, data, sourceImage, undefined, {
    studioGridAnchors,
    studioThumbnailAnchors,
  })
  const denseCropRecognizeStartedAt = performance.now()
  const densePartLabelResult = denseCropRetries
    ? await recognizeDensePartLabelOcrData({
        anchors: mergePartImageAnchorSets(studioGridAnchors, studioThumbnailAnchors),
        basePageText: initialPageText,
        canvas,
        fullPageData: data,
        remainingMs,
        signal,
        worker,
      })
    : null
  const densePartLabelData = densePartLabelResult?.data ?? null
  const denseCropImageCount = densePartLabelResult?.imageCount ?? 0
  const denseCropRecognizeMs = denseCropImageCount > 0
    ? Math.round(performance.now() - denseCropRecognizeStartedAt)
    : 0

  const recognizeMs = Math.round(performance.now() - recognizeStartedAt)
  const pageTextWithDiagnostics = {
    ...initialPageText,
    diagnostics: createOcrDiagnostics({
      denseCropImageCount,
      denseCropRecognizeMs,
      fullPageRecognizeMs,
      inputKind,
      maxPageWidth,
      maxPixels,
      recognizeCallCount: 1 + denseCropImageCount,
      recognizeMs,
      renderMs,
      renderedHeight: canvas.height,
      renderedWidth: canvas.width,
    }),
  }
  const pageText = densePartLabelData
    ? mergePartImageAnchorPageText(
        pageTextWithDiagnostics,
        createOcrPageText(
          pageNumber,
          mergeOcrData([data, densePartLabelData]),
          sourceImage,
          undefined,
          {
            studioGridAnchors,
            studioThumbnailAnchors,
          },
        ),
      )
    : pageTextWithDiagnostics

  return {
    inputKind,
    pageText,
  }
}

async function refinePdfPageTextWithDenseOcrScale({
  basePageText,
  canvas,
  inputKind,
  maxPageWidth,
  maxPixels,
  pageNumber,
  remainingMs,
  renderMs,
  signal,
  studioGridAnchors,
  studioThumbnailAnchors,
  worker,
}: {
  basePageText: PartsListPageText
  canvas: HTMLCanvasElement
  inputKind: NonNullable<PartsListPageDiagnostics["ocr"]>["inputKind"]
  maxPageWidth: number
  maxPixels: number
  pageNumber: number
  remainingMs: () => number
  renderMs: number
  signal?: AbortSignal
  studioGridAnchors: readonly PartImageAnchor[]
  studioThumbnailAnchors: readonly PartImageAnchor[]
  worker: PartsListOcrEngine
}) {
  const denseCropRecognizeStartedAt = performance.now()
  const densePartLabelResult = await recognizeDensePartLabelOcrData({
    anchors: mergePartImageAnchorSets(studioGridAnchors, studioThumbnailAnchors),
    basePageText,
    canvas,
    fullPageData: null,
    remainingMs,
    signal,
    worker,
  })
  const densePartLabelData = densePartLabelResult?.data ?? null
  const denseCropImageCount = densePartLabelResult?.imageCount ?? 0
  const denseCropRecognizeMs = denseCropImageCount > 0
    ? Math.round(performance.now() - denseCropRecognizeStartedAt)
    : 0
  const sourceImage = {
    height: canvas.height,
    unit: "ocr_pixel" as const,
    width: canvas.width,
  }
  const pageTextWithDiagnostics = {
    ...basePageText,
    diagnostics: mergeDenseOnlyOcrDiagnostics(basePageText.diagnostics, {
      denseCropImageCount,
      denseCropRecognizeMs,
      inputKind,
      maxPageWidth,
      maxPixels,
      renderMs,
      renderedHeight: canvas.height,
      renderedWidth: canvas.width,
    }),
  }
  const pageText = densePartLabelData
    ? mergePartImageAnchorPageText(
        pageTextWithDiagnostics,
        createOcrPageText(pageNumber, densePartLabelData, sourceImage, undefined, {
          studioGridAnchors,
          studioThumbnailAnchors,
        }),
      )
    : pageTextWithDiagnostics

  return {
    inputKind,
    pageText,
  }
}

function createOcrDiagnostics({
  denseCropImageCount,
  denseCropRecognizeMs,
  fullPageRecognizeMs,
  inputKind,
  maxPageWidth,
  maxPixels,
  recognizeCallCount,
  recognizeMs,
  renderMs,
  renderedHeight,
  renderedWidth,
}: {
  denseCropImageCount: number
  denseCropRecognizeMs: number
  fullPageRecognizeMs: number
  inputKind: NonNullable<PartsListPageDiagnostics["ocr"]>["inputKind"]
  maxPageWidth: number
  maxPixels: number
  recognizeCallCount: number
  recognizeMs: number
  renderMs: number
  renderedHeight: number
  renderedWidth: number
}): PartsListPageDiagnostics {
  return {
    ocr: {
      engine: "paddleocr.js",
      denseCropImageCount,
      denseCropRecognizeMs,
      fullPageRecognizeMs,
      inputKind,
      maxPageWidth,
      maxPixels,
      pipeline: paddleOcrPipelineName,
      recognizeCallCount,
      recognizeMs,
      renderMs,
      renderedHeight,
      renderedWidth,
    },
  }
}

function mergeDenseOnlyOcrDiagnostics(
  baseDiagnostics: PartsListPageDiagnostics | undefined,
  {
    denseCropImageCount,
    denseCropRecognizeMs,
    inputKind,
    maxPageWidth,
    maxPixels,
    renderMs,
    renderedHeight,
    renderedWidth,
  }: {
    denseCropImageCount: number
    denseCropRecognizeMs: number
    inputKind: NonNullable<PartsListPageDiagnostics["ocr"]>["inputKind"]
    maxPageWidth: number
    maxPixels: number
    renderMs: number
    renderedHeight: number
    renderedWidth: number
  },
): PartsListPageDiagnostics {
  const baseOcr = baseDiagnostics?.ocr
  const baseRecognizeMs = baseOcr?.recognizeMs ?? baseOcr?.fullPageRecognizeMs ?? 0
  const baseRecognizeCallCount = baseOcr?.recognizeCallCount ?? (baseOcr ? 1 : 0)

  return createOcrDiagnostics({
    denseCropImageCount,
    denseCropRecognizeMs,
    fullPageRecognizeMs: baseOcr?.fullPageRecognizeMs ?? 0,
    inputKind,
    maxPageWidth,
    maxPixels,
    recognizeCallCount: baseRecognizeCallCount + denseCropImageCount,
    recognizeMs: baseRecognizeMs + denseCropRecognizeMs,
    renderMs: (baseOcr?.renderMs ?? 0) + renderMs,
    renderedHeight,
    renderedWidth,
  })
}

async function recognizeOcrInputImages(
  worker: PartsListOcrEngine,
  images: readonly OcrInputVariant[],
  remainingMs: () => number,
  signal?: AbortSignal,
) {
  const results: OcrData[] = []

  for (const { coordinateOffsetX = 0, coordinateOffsetY = 0, crops, image, inputKind, sourceRank = 0 } of images) {
    try {
      const result = await runWithOcrDeadline(
        worker.recognize(image),
        remainingMs,
        signal,
      )
      results.push(
        crops
          ? mapPartImageAnchorOcrDataToSource(result.data, crops, sourceRank)
          : offsetOcrDataCoordinates(result.data, coordinateOffsetX, coordinateOffsetY, sourceRank),
      )
    } finally {
      if (inputKind === "dense_part_label_crops") {
        releaseOcrInputCanvas(image)
      }
    }
  }

  return mergeOcrData(results)
}

function releaseOcrInputCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0
  canvas.height = 0
}

function createDensePartLabelOcrInputImages(
  canvas: HTMLCanvasElement,
  anchors: readonly PartImageAnchor[],
  fullPageData: OcrData | null,
  basePageText: PartsListPageText,
): OcrInputVariant[] {
  const cropAnchors = mergePartImageAnchorSets(
    anchors,
    getFallbackDensePartLabelAnchorsFromPageText(basePageText, canvas),
  )
  const contextSheets = cropAnchors.length >= minDensePartLabelCropAnchors
    ? createDensePartLabelCropSheets(
        canvas,
        cropAnchors,
        "context",
        defaultDenseCropSheetTotalPixels,
      )
    : []
  const remainingPixels = Math.max(
    0,
    defaultDenseCropSheetTotalPixels - getCropSheetPixelCount(contextSheets),
  )
  const broadRowSheets = remainingPixels > 0
    ? createDenseBroadRowLabelCropInputImages(canvas, basePageText, remainingPixels)
    : []
  const remainingAfterBroadRows = Math.max(
    0,
    remainingPixels - getCropSheetPixelCount(broadRowSheets),
  )
  const quantitySheets =
    fullPageData && remainingAfterBroadRows > 0
      ? createDenseQuantityLabelCropInputImages(canvas, fullPageData, basePageText, remainingAfterBroadRows)
      : []

  return [
    ...contextSheets,
    ...broadRowSheets,
    ...quantitySheets,
  ]
    .map((sheet) => ({
      crops: sheet.crops,
      image: sheet.canvas,
      inputKind: "dense_part_label_crops",
      sourceRank: 2,
    }))
}

function getFallbackDensePartLabelAnchorsFromPageText(
  pageText: PartsListPageText,
  canvas: HTMLCanvasElement,
): PartImageAnchor[] {
  const anchors: PartImageAnchor[] = []
  for (const rowSource of pageText.rowSources ?? []) {
    const region = rowSource.partThumbnailRegion
    if (!region || region.unit !== "ocr_pixel") {
      continue
    }

    const bbox = {
      x0: clamp(region.x, 0, canvas.width - 1),
      x1: clamp(region.x + region.width, 1, canvas.width),
      y0: clamp(region.y, 0, canvas.height - 1),
      y1: clamp(region.y + region.height, 1, canvas.height),
    }
    const width = bbox.x1 - bbox.x0
    const height = bbox.y1 - bbox.y0
    if (
      width < 90 ||
      height < 90 ||
      width > canvas.width * 0.5 ||
      height > canvas.height * 0.5 ||
      anchors.some((anchor) => getOcrBboxIntersectionRatio(anchor.region, bbox) >= 0.82)
    ) {
      continue
    }

    anchors.push({ region: bbox })
  }

  return anchors.slice(0, 72)
}

function mergePartImageAnchorSets(
  left: readonly PartImageAnchor[],
  right: readonly PartImageAnchor[],
) {
  const anchors: PartImageAnchor[] = []

  for (const anchor of [...left, ...right]) {
    if (anchors.some((candidate) => getOcrBboxIntersectionRatio(candidate.region, anchor.region) >= 0.75)) {
      continue
    }

    anchors.push(anchor)
  }

  return anchors.sort((a, b) => a.region.y0 - b.region.y0 || a.region.x0 - b.region.x0).slice(0, 72)
}

async function recognizeDensePartLabelOcrData({
  anchors,
  basePageText,
  canvas,
  fullPageData,
  remainingMs,
  signal,
  worker,
}: {
  anchors: readonly PartImageAnchor[]
  basePageText: PartsListPageText
  canvas: HTMLCanvasElement
  fullPageData: OcrData | null
  remainingMs: () => number
  signal?: AbortSignal
  worker: PartsListOcrEngine
}) {
  const images = createDensePartLabelOcrInputImages(canvas, anchors, fullPageData, basePageText)
  if (images.length === 0) {
    return null
  }

  const data = await recognizeOcrInputImages(worker, images, remainingMs, signal)
  const hasText = Boolean(data.blocks?.length || data.textVariants?.some((variant) => /\S/.test(variant)))
  return {
    data: hasText ? data : null,
    imageCount: images.length,
  }
}

function mergePartImageAnchorPageText(
  basePageText: PartsListPageText,
  partImageAnchorPageText: PartsListPageText,
): PartsListPageText {
  const rows = [...(basePageText.rowSources ?? [])]
  const dominantColor = getDominantNamedColorFromPageText(basePageText)
  const alignedFallbackText = [basePageText.rawText, basePageText.text].filter(Boolean).join("\n")
  let changed = false

  for (const rawCandidate of partImageAnchorPageText.rowSources ?? []) {
    const candidate = applyDominantColorToPartImageAnchorRow(rawCandidate, rows, dominantColor)

    const alignedFallbackRow = findAlignedFallbackForBroadPartImageAnchorRow(
      candidate,
      alignedFallbackText,
      rows,
    )
    if (alignedFallbackRow) {
      rows.push(alignedFallbackRow)
      changed = true
      continue
    }

    const replacementIndex = findReplaceablePartImageAnchorRow(candidate, rows)
    if (replacementIndex >= 0) {
      rows[replacementIndex] = candidate
      changed = true
      continue
    }

    if (!isUsefulPartImageAnchorRow(candidate, rows)) {
      continue
    }

    rows.push(candidate)
    changed = true
  }

  return changed ? replacePageTextRows(basePageText, rows) : basePageText
}

function findAlignedFallbackForBroadPartImageAnchorRow(
  candidate: PartsListPageRowSource,
  rawPageText: string,
  existingRows: readonly PartsListPageRowSource[],
) {
  const candidateParts = parseOcrRowParts(candidate.rawText)
  if (
    !candidateParts ||
    !rawPageText ||
    (!isLikelyBroadSwallowedTrailingPartImageAnchorRow(candidate, candidateParts) &&
      !isLikelyNoisyTrailingColorPartImageAnchorRow(candidate, candidateParts))
  ) {
    return null
  }

  const alignedFallback = buildPartsListRowsFromAlignedOcrText(rawPageText).find((row) => {
    const parts = parseOcrRowParts(row.text)
    return Boolean(
      parts &&
        parts.partNumber === candidateParts.partNumber &&
        parts.quantity !== candidateParts.quantity &&
        areCompatibleOcrColors(parts.colorText, candidateParts.colorText) &&
        hasTextOnlyQuantityBeforePart(row, parts),
    )
  })
  if (!alignedFallback || existingRows.some((row) => row.rawText === alignedFallback.text)) {
    return null
  }

  return {
    cropReferences: [],
    partThumbnailRegion: null,
    rawText: alignedFallback.text,
    rawTokens: alignedFallback.rawTokens,
    rowRegion: null,
    sourceImage: candidate.sourceImage,
    textRange: { end: 0, start: 0 },
  }
}

function replacePageTextRows(
  pageText: PartsListPageText,
  rows: readonly PartsListPageRowSource[],
): PartsListPageText {
  const text = rows.map((row) => row.rawText).join("\n")
  let offset = 0
  const rowSources = rows.map((row) => {
    const textRange = {
      end: offset + row.rawText.length + (row === rows.at(-1) ? 0 : 1),
      start: offset,
    }
    offset = textRange.end

    return { ...row, textRange }
  })

  return {
    ...pageText,
    rowSources,
    text,
  }
}

function findReplaceablePartImageAnchorRow(
  candidate: PartsListPageRowSource,
  existingRows: readonly PartsListPageRowSource[],
) {
  if (!candidate.rowRegion || !hasExplicitOcrQuantityToken(candidate)) {
    return -1
  }

  const candidateParts = parseOcrRowParts(candidate.rawText)
  if (!candidateParts || !hasResolvableOcrColorText(candidateParts.colorText)) {
    return -1
  }

  return existingRows.findIndex((existingRow) => {
    if (existingRow.rawText === candidate.rawText) {
      return false
    }

    const existingParts = parseOcrRowParts(existingRow.rawText)
    if (!existingParts) {
      return false
    }

    if (!existingRow.rowRegion) {
      return isReplaceableTextOnlyPartImageAnchorRow(existingRow, candidate, existingParts, candidateParts)
    }

    if (getRegionIntersectionRatio(existingRow.rowRegion, candidate.rowRegion!) < 0.2) {
      return false
    }

    if (!areCompatibleOcrColors(existingParts.colorText, candidateParts.colorText)) {
      return false
    }

    if (
      existingParts.quantity === candidateParts.quantity &&
      isLikelyShortPartNumberFragmentReplacement(candidateParts.partNumber, existingParts.partNumber)
    ) {
      return true
    }

    if (!hasExplicitOcrQuantityToken(existingRow) && candidateParts.partNumber.length >= 4) {
      return true
    }

    return (
      existingParts.partNumber === candidateParts.partNumber &&
      existingParts.quantity !== candidateParts.quantity &&
      isMoreCompactPartImageAnchorRow(candidate, existingRow)
    )
  })
}

function isReplaceableTextOnlyPartImageAnchorRow(
  existingRow: PartsListPageRowSource,
  candidate: PartsListPageRowSource,
  existingParts: OcrRowParts,
  candidateParts: OcrRowParts,
) {
  if (
    existingParts.partNumber !== candidateParts.partNumber ||
    !hasExplicitOcrQuantityToken(candidate) ||
    isLikelyBroadSwallowedTrailingPartImageAnchorRow(candidate, candidateParts)
  ) {
    return false
  }

  if (
    existingParts.quantity !== candidateParts.quantity &&
    areCompatibleOcrColors(existingParts.colorText, candidateParts.colorText)
  ) {
    return true
  }

  const candidateColor = getSequentialColorText(candidateParts.colorText)
  return Boolean(
    existingParts.quantity === candidateParts.quantity &&
      candidateColor &&
      isOcrRowSourceColorBackedByRawTokens(candidate, candidateColor),
  )
}

function isMoreCompactPartImageAnchorRow(
  candidate: PartsListPageRowSource,
  existingRow: PartsListPageRowSource,
) {
  if (!candidate.rowRegion || !existingRow.rowRegion) {
    return false
  }

  const candidateArea = candidate.rowRegion.width * candidate.rowRegion.height
  const existingArea = existingRow.rowRegion.width * existingRow.rowRegion.height
  const existingAspect = existingRow.rowRegion.width / Math.max(1, existingRow.rowRegion.height)

  return (
    candidateArea <= existingArea * 0.75 ||
    (existingAspect >= 4.5 && candidate.rowRegion.width <= existingRow.rowRegion.width * 0.75)
  )
}

function isUsefulPartImageAnchorRow(
  candidate: PartsListPageRowSource,
  existingRows: readonly PartsListPageRowSource[],
) {
  if (!candidate.rowRegion) {
    return false
  }

  const candidateParts = parseOcrRowParts(candidate.rawText)
  if (!candidateParts || candidateParts.partNumber.length < 4 || !hasResolvableOcrColorText(candidateParts.colorText)) {
    return false
  }

  if (!hasExplicitOcrQuantityToken(candidate) && !hasGlyphSlipOcrQuantityToken(candidate)) {
    return false
  }

  for (const existingRow of existingRows) {
    const existingParts = parseOcrRowParts(existingRow.rawText)
    if (!existingParts) {
      continue
    }

    if (hasBetterExistingBackedColorPartImageAnchorRow(existingRow, candidate, existingParts, candidateParts)) {
      return false
    }

    if (
      existingParts.partNumber === candidateParts.partNumber &&
      existingParts.quantity === candidateParts.quantity &&
      (existingParts.colorText === candidateParts.colorText ||
        isLikelyLessSpecificOcrColorDuplicate(existingParts.colorText, candidateParts.colorText))
    ) {
      return false
    }

    if (
      existingParts.colorText === candidateParts.colorText &&
      candidateParts.partNumber.length < existingParts.partNumber.length &&
      existingParts.partNumber.startsWith(candidateParts.partNumber)
    ) {
      return false
    }

    if (
      existingRow.rowRegion &&
      getRegionIntersectionRatio(existingRow.rowRegion, candidate.rowRegion) >= 0.25 &&
      existingRow.rawText !== candidate.rawText
    ) {
      if (isAdjacentDensePartLabelRow(existingRow, candidate, existingParts, candidateParts)) {
        continue
      }

      if (isOverlappingDensePartLabelRow(existingRow, candidate, existingParts, candidateParts)) {
        continue
      }

      if (isWeakStudioCodeDuplicateOfNamedColorRow(existingRow, candidate, existingParts, candidateParts)) {
        return false
      }

      if (isBroadAmbiguousPartImageAnchorRow(existingRow, candidate)) {
        continue
      }

      if (isBroadAmbiguousPartImageAnchorRow(candidate, existingRow)) {
        return false
      }

      return false
    }

    if (
      !existingRow.rowRegion &&
      existingParts.partNumber === candidateParts.partNumber &&
      existingParts.quantity !== candidateParts.quantity &&
      areCompatibleOcrColors(existingParts.colorText, candidateParts.colorText) &&
      (isLikelyBroadSwallowedTrailingPartImageAnchorRow(candidate, candidateParts) ||
        isLikelyNoisyTrailingColorPartImageAnchorRow(candidate, candidateParts))
    ) {
      return false
    }
  }

  return true
}

function hasBetterExistingBackedColorPartImageAnchorRow(
  existingRow: PartsListPageRowSource,
  candidate: PartsListPageRowSource,
  existingParts: OcrRowParts,
  candidateParts: OcrRowParts,
) {
  if (
    existingParts.partNumber !== candidateParts.partNumber ||
    existingParts.quantity !== candidateParts.quantity ||
    getSequentialColorText(existingParts.colorText) === getSequentialColorText(candidateParts.colorText)
  ) {
    return false
  }

  const existingColor = getSequentialColorText(existingParts.colorText)
  const candidateColor = getSequentialColorText(candidateParts.colorText)
  return Boolean(
    existingColor &&
      candidateColor &&
      isOcrRowSourceColorBackedByRawTokens(existingRow, existingColor) &&
      !isOcrRowSourceColorBackedByRawTokens(candidate, candidateColor),
  )
}

function isWeakStudioCodeDuplicateOfNamedColorRow(
  existingRow: PartsListPageRowSource,
  candidate: PartsListPageRowSource,
  existingParts: OcrRowParts,
  candidateParts: OcrRowParts,
) {
  const candidateStudioColorCode = getStudioColorCode(candidateParts.colorText)
  if (
    !candidateStudioColorCode ||
    !getSequentialColorText(existingParts.colorText) ||
    existingParts.partNumber !== candidateParts.partNumber ||
    existingParts.quantity !== candidateParts.quantity ||
    !existingRow.rowRegion ||
    !candidate.rowRegion ||
    getRegionIntersectionRatio(existingRow.rowRegion, candidate.rowRegion) < 0.5
  ) {
    return false
  }

  return !hasDelimitedStudioColorCodeEvidence(candidate, candidateParts.partNumber, candidateStudioColorCode)
}

function hasDelimitedStudioColorCodeEvidence(
  row: Pick<PartsListPageRowSource, "rawTokens">,
  partNumber: string,
  studioColorCode: string,
) {
  const escapedPartNumber = partNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const rawTokenText = row.rawTokens.join(" ")
  const delimitedStudioColorPattern = new RegExp(
    `(?:^|[^a-z0-9])${escapedPartNumber}\\s*[,.;:]\\s*${studioColorCode}(?=$|[^a-z0-9])`,
    "i",
  )

  return delimitedStudioColorPattern.test(rawTokenText)
}

function hasAnyDelimitedStudioColorCodeEvidence(
  row: Pick<PartsListPageRowSource, "rawTokens">,
) {
  return /(?:^|[^a-z0-9])\d[a-z0-9cpbrat]{2,}\s*[,.;:]\s*\d{1,3}(?=$|[^a-z0-9])/i.test(
    row.rawTokens.join(" "),
  )
}

function isAdjacentDensePartLabelRow(
  existingRow: PartsListPageRowSource,
  candidate: PartsListPageRowSource,
  existingParts: OcrRowParts,
  candidateParts: OcrRowParts,
) {
  if (
    !existingRow.rowRegion ||
    !candidate.rowRegion ||
    existingParts.partNumber === candidateParts.partNumber ||
    !hasExplicitOcrQuantityToken(existingRow) ||
    !hasExplicitOcrQuantityToken(candidate) ||
    !areCompatibleOcrColors(existingParts.colorText, candidateParts.colorText)
  ) {
    return false
  }

  const existingCenterX = existingRow.rowRegion.x + existingRow.rowRegion.width / 2
  const candidateCenterX = candidate.rowRegion.x + candidate.rowRegion.width / 2
  const existingCenterY = existingRow.rowRegion.y + existingRow.rowRegion.height / 2
  const candidateCenterY = candidate.rowRegion.y + candidate.rowRegion.height / 2
  const minWidth = Math.min(existingRow.rowRegion.width, candidate.rowRegion.width)
  const maxHeight = Math.max(existingRow.rowRegion.height, candidate.rowRegion.height)

  return (
    Math.abs(existingCenterY - candidateCenterY) <= maxHeight * 0.45 &&
    Math.abs(existingCenterX - candidateCenterX) >= Math.max(42, minWidth * 0.8)
  )
}

function isOverlappingDensePartLabelRow(
  existingRow: PartsListPageRowSource,
  candidate: PartsListPageRowSource,
  existingParts: OcrRowParts,
  candidateParts: OcrRowParts,
) {
  if (
    !existingRow.rowRegion ||
    !candidate.rowRegion ||
    existingParts.partNumber === candidateParts.partNumber ||
    !hasExplicitOcrQuantityToken(existingRow) ||
    !hasExplicitOcrQuantityToken(candidate) ||
    !areCompatibleOcrColors(existingParts.colorText, candidateParts.colorText) ||
    !hasRawPartEvidence(existingRow, existingParts.partNumber) ||
    !hasRawPartEvidence(candidate, candidateParts.partNumber)
  ) {
    return false
  }

  const existingCenterX = existingRow.rowRegion.x + existingRow.rowRegion.width / 2
  const candidateCenterX = candidate.rowRegion.x + candidate.rowRegion.width / 2
  const existingCenterY = existingRow.rowRegion.y + existingRow.rowRegion.height / 2
  const candidateCenterY = candidate.rowRegion.y + candidate.rowRegion.height / 2
  const maxWidth = Math.max(existingRow.rowRegion.width, candidate.rowRegion.width)
  const maxHeight = Math.max(existingRow.rowRegion.height, candidate.rowRegion.height)

  return (
    Math.abs(existingCenterX - candidateCenterX) <= maxWidth * 0.2 &&
    Math.abs(existingCenterY - candidateCenterY) <= maxHeight * 0.75
  )
}

function hasRawPartEvidence(row: Pick<PartsListPageRowSource, "rawTokens">, partNumber: string) {
  return row.rawTokens.some((token) => {
    const compactToken = normalizeOcrComparableText(token).replace(/\s+/g, "")

    return compactToken === partNumber || compactToken.endsWith(partNumber)
  })
}

function applyDominantColorToPartImageAnchorRow(
  candidate: PartsListPageRowSource,
  existingRows: readonly PartsListPageRowSource[],
  dominantColor: string | null,
) {
  const parts = parseOcrRowParts(candidate.rawText)
  if (
    !dominantColor ||
    !parts ||
    !shouldApplyDominantColorToCropCandidate(candidate, parts.colorText, dominantColor)
  ) {
    return candidate
  }

  if (
    existingRows.some(
      (row) =>
        row.rowRegion &&
        candidate.rowRegion &&
        getRegionIntersectionRatio(row.rowRegion, candidate.rowRegion) >= 0.15 &&
        !isBroadAmbiguousPartImageAnchorRow(row, candidate),
    )
  ) {
    const candidateNamedColor = getSequentialColorText(parts.colorText)
    if (!candidateNamedColor || isOcrRowSourceColorBackedByRawTokens(candidate, candidateNamedColor)) {
      return candidate
    }
  }

  return {
    ...candidate,
    rawText: `${parts.quantity} x ${parts.partNumber} ${dominantColor}`,
  }
}

function shouldApplyDominantColorToCropCandidate(
  candidate: PartsListPageRowSource,
  colorText: string,
  dominantColor: string,
) {
  const normalizedColorText = normalizeOcrColorText(colorText)
  const candidateNamedColor = getSequentialColorText(normalizedColorText)
  const dominantNamedColor = getSequentialColorText(dominantColor)
  if (!dominantNamedColor || candidateNamedColor === dominantNamedColor) {
    return false
  }

  return (
    /^studio-\d{1,3}$/.test(normalizedColorText) ||
    (candidateNamedColor === "Red" && dominantNamedColor === "Reddish Brown") ||
    Boolean(candidateNamedColor && !isOcrRowSourceColorBackedByRawTokens(candidate, candidateNamedColor))
  )
}

function getDominantNamedColorFromPageText(pageText: PartsListPageText) {
  return getDominantNamedColor(
    (pageText.rowSources ?? []).map((rowSource) => ({
      partThumbnailRegion: rowSource.partThumbnailRegion,
      rawTokens: [...rowSource.rawTokens],
      rowRegion: rowSource.rowRegion,
      sourceRank: 0,
      text: rowSource.rawText,
    })),
  )
}

function isBroadAmbiguousPartImageAnchorRow(
  rowSource: PartsListPageRowSource,
  candidate: PartsListPageRowSource,
) {
  const region = rowSource.rowRegion
  const candidateRegion = candidate.rowRegion
  if (!region || !candidateRegion) {
    return false
  }

  const aspect = region.width / Math.max(1, region.height)
  const area = region.width * region.height

  return (
    region.height >= 210 ||
    area >= 180_000 ||
    aspect >= 6 ||
    (aspect >= 4.5 && region.width >= candidateRegion.width * 1.6)
  )
}

function isLikelyBroadSwallowedTrailingPartImageAnchorRow(
  rowSource: PartsListPageRowSource,
  parts: OcrRowParts,
) {
  const region = rowSource.rowRegion
  if (!region) {
    return false
  }

  const aspect = region.width / Math.max(1, region.height)
  if (aspect < 6) {
    return false
  }

  return rowSource.rawTokens.some((token) => {
    const trailingPart = getTrailingFusedPartNumberAfterColorPhrase(token)
    return Boolean(trailingPart && trailingPart.partNumber !== parts.partNumber)
  })
}

function isLikelyNoisyTrailingColorPartImageAnchorRow(
  rowSource: PartsListPageRowSource,
  parts: OcrRowParts,
) {
  const region = rowSource.rowRegion
  if (!region) {
    return false
  }

  const aspect = region.width / Math.max(1, region.height)
  if (aspect < 4) {
    return false
  }

  if (!getSequentialColorText(parts.colorText)) {
    return false
  }

  return rowSource.rawTokens.some((token) => {
    return /\bgr[ae]y\s*\d{1,3}\s*$/i.test(normalizeOcrComparableText(token))
  })
}

function isLikelyBroadSwallowedTrailingOcrRow(
  row: OcrReconstructedRow,
  parts: OcrRowParts,
) {
  const region = row.rowRegion
  if (!region) {
    return false
  }

  const aspect = region.width / Math.max(1, region.height)
  if (aspect < 6) {
    return false
  }

  return row.rawTokens.some((token) => {
    const trailingPart = getTrailingFusedPartNumberAfterColorPhrase(token)
    return Boolean(trailingPart && trailingPart.partNumber !== parts.partNumber)
  })
}

function isOcrRowSourceColorBackedByRawTokens(row: PartsListPageRowSource, color: string) {
  return isOcrRowColorBackedByRawTokens(
    {
      partThumbnailRegion: row.partThumbnailRegion,
      rawTokens: [...row.rawTokens],
      rowRegion: row.rowRegion,
      sourceRank: 0,
      text: row.rawText,
    },
    color,
  )
}

function createDensePartLabelCropSheets(
  canvas: HTMLCanvasElement,
  anchors: readonly PartImageAnchor[],
  mode: "context" | "tight",
  maxTotalPixels = defaultDenseCropSheetTotalPixels,
): PartImageAnchorCropSheet[] {
  const crops = anchors
    .map((anchor) => createDensePartLabelCropRegion(canvas, anchor.region, mode))
    .filter((crop): crop is OcrBbox => Boolean(crop))
    .filter((crop, index, allCrops) =>
      allCrops.findIndex((candidate) => areRedundantDensePartLabelCrops(candidate, crop)) === index,
    )
    .slice(0, 72)
  if (crops.length === 0) {
    return []
  }

  return createMappedCropSheets(canvas, crops, {
    columnCount: 3,
    gap: 36,
    maxRows: 4,
    maxTotalPixels,
    scale: 2,
  })
}

function createDenseQuantityLabelCropInputImages(
  canvas: HTMLCanvasElement,
  data: OcrData,
  basePageText: PartsListPageText,
  maxTotalPixels = defaultDenseCropSheetTotalPixels,
): PartImageAnchorCropSheet[] {
  const quantityLines = getPositionedOcrLines(data.blocks ?? [])
    .filter((line) => getQuantityFromOcrLine(line.normalizedText, { allowGlyphSlips: true }))
    .filter((line) => !isQuantityLineConsumedByPageRows(line, basePageText.rowSources ?? []))
  if (quantityLines.length === 0) {
    return []
  }

  const crops = quantityLines
    .flatMap((line) => [
      createDenseQuantityLabelCropRegion(canvas, line, "context"),
      createDenseQuantityLabelCropRegion(canvas, line, "tight"),
    ])
    .filter((crop): crop is OcrBbox => Boolean(crop))
    .filter((crop, index, allCrops) =>
      allCrops.findIndex((candidate) => areRedundantDensePartLabelCrops(candidate, crop)) === index,
    )
    .slice(0, 72)

  return createMappedCropSheets(canvas, crops, {
    columnCount: 3,
    gap: 36,
    maxRows: 4,
    maxTotalPixels,
    preferScale: true,
    scale: 4,
  })
}

function createDenseBroadRowLabelCropInputImages(
  canvas: HTMLCanvasElement,
  basePageText: PartsListPageText,
  maxTotalPixels = defaultDenseCropSheetTotalPixels,
): PartImageAnchorCropSheet[] {
  const crops = (basePageText.rowSources ?? [])
    .filter(isDenseBroadRowLabelRetryCandidate)
    .map((rowSource) => createDenseBroadRowLabelCropRegion(canvas, rowSource))
    .filter((crop): crop is OcrBbox => Boolean(crop))
    .filter((crop, index, allCrops) =>
      allCrops.findIndex((candidate) => areRedundantDensePartLabelCrops(candidate, crop)) === index,
    )
    .slice(0, 24)
  if (crops.length === 0) {
    return []
  }

  return createMappedCropSheets(canvas, crops, {
    columnCount: 2,
    gap: 36,
    maxRows: 2,
    maxTotalPixels: Math.min(maxTotalPixels, defaultDenseCropSheetMaxPixels * 2),
    preferScale: true,
    scale: 4,
  })
}

function isDenseBroadRowLabelRetryCandidate(rowSource: PartsListPageRowSource) {
  const region = rowSource.rowRegion
  if (!region || region.unit !== "ocr_pixel") {
    return false
  }

  const aspect = region.width / Math.max(1, region.height)
  const rawEvidence = `${rowSource.rawText} ${rowSource.rawTokens.join(" ")}`

  return (
    region.width >= 520 &&
    region.height >= 80 &&
    region.height <= 220 &&
    aspect >= 3.4 &&
    hasRepeatedOcrColorEvidence(rawEvidence)
  )
}

function createDenseBroadRowLabelCropRegion(
  canvas: HTMLCanvasElement,
  rowSource: PartsListPageRowSource,
) {
  const region = rowSource.rowRegion
  if (!region || region.unit !== "ocr_pixel") {
    return null
  }

  const leftPadding = clamp(Math.round(Math.max(150, region.width * 0.36)), 140, 300)
  const rightPadding = clamp(Math.round(Math.max(300, region.width * 0.5)), 300, 430)
  const topPadding = clamp(Math.round(region.height * 0.55), 42, 96)
  const bottomPadding = clamp(Math.round(region.height * 0.85), 76, 160)
  const crop = {
    x0: clamp(Math.round(region.x - leftPadding), 0, canvas.width - 1),
    x1: clamp(Math.round(region.x + rightPadding), 1, canvas.width),
    y0: clamp(Math.round(region.y - topPadding), 0, canvas.height - 1),
    y1: clamp(Math.round(region.y + region.height + bottomPadding), 1, canvas.height),
  }

  return crop.x1 > crop.x0 && crop.y1 > crop.y0 ? crop : null
}

function getCropSheetPixelCount(sheets: readonly PartImageAnchorCropSheet[]) {
  return sheets.reduce((total, sheet) => total + sheet.canvas.width * sheet.canvas.height, 0)
}

function isQuantityLineConsumedByPageRows(
  line: PositionedOcrLine,
  rowSources: readonly PartsListPageRowSource[],
) {
  return rowSources.some((rowSource) => {
    const rowRegion = rowSource.rowRegion
    if (!rowRegion) {
      return false
    }

    const lineInsideRow =
      line.centerX >= rowRegion.x - 12 &&
      line.centerX <= rowRegion.x + rowRegion.width + 12 &&
      line.centerY >= rowRegion.y - 12 &&
      line.centerY <= rowRegion.y + rowRegion.height + 12
    if (!lineInsideRow) {
      return false
    }

    return rowSource.rawTokens.some((token) => normalizeOcrText(token) === line.normalizedText)
  })
}

function createDenseQuantityLabelCropRegion(
  canvas: HTMLCanvasElement,
  quantityLine: PositionedOcrLine,
  mode: "context" | "tight",
) {
  const lineHeight = Math.max(1, quantityLine.bbox.y1 - quantityLine.bbox.y0)
  const horizontalPadding = mode === "tight"
    ? clamp(Math.round(lineHeight * 1.25), 18, 54)
    : clamp(Math.round(lineHeight * 2.2), 40, 95)
  const rightPadding = mode === "tight"
    ? clamp(Math.round(Math.max(260, lineHeight * 11)), 230, 390)
    : clamp(Math.round(Math.max(360, lineHeight * 18)), 300, 560)
  const topPadding = mode === "tight"
    ? clamp(Math.round(lineHeight * 0.55), 8, 24)
    : clamp(Math.round(lineHeight * 0.9), 12, 42)
  const bottomPadding = mode === "tight"
    ? clamp(Math.round(Math.max(150, lineHeight * 6)), 130, 230)
    : clamp(Math.round(Math.max(190, lineHeight * 8)), 170, 300)
  const crop = {
    x0: clamp(Math.round(quantityLine.bbox.x0 - horizontalPadding), 0, canvas.width - 1),
    x1: clamp(Math.round(quantityLine.bbox.x1 + rightPadding), 1, canvas.width),
    y0: clamp(Math.round(quantityLine.bbox.y0 - topPadding), 0, canvas.height - 1),
    y1: clamp(Math.round(quantityLine.bbox.y1 + bottomPadding), 1, canvas.height),
  }

  return crop.x1 > crop.x0 && crop.y1 > crop.y0 ? crop : null
}

function createMappedCropSheets(
  canvas: HTMLCanvasElement,
  crops: readonly OcrBbox[],
  {
    columnCount,
    gap,
    maxRows,
    maxTotalPixels,
    preferScale = false,
    scale,
  }: {
    columnCount: number
    gap: number
    maxRows: number
    maxTotalPixels?: number
    preferScale?: boolean
    scale: number
  },
): PartImageAnchorCropSheet[] {
  const maxCropsPerSheet = Math.max(1, columnCount * maxRows)
  const sheets: PartImageAnchorCropSheet[] = []
  let totalPixels = 0
  const totalPixelBudget = Math.min(
    defaultDenseCropSheetTotalPixels,
    Math.max(0, maxTotalPixels ?? defaultDenseCropSheetTotalPixels),
  )

  for (let start = 0; start < crops.length && totalPixels < totalPixelBudget;) {
    const remainingTotalPixels = totalPixelBudget - totalPixels
    const batch = fitMappedCropSheetBatch(crops.slice(start, start + maxCropsPerSheet), {
      columnCount,
      gap,
      maxPixels: Math.min(defaultDenseCropSheetMaxPixels, remainingTotalPixels),
      preferScale,
      scale,
    })
    if (!batch) {
      break
    }

    const sheet = createMappedCropSheet(canvas, batch.crops, {
      columnCount,
      gap,
      scale: batch.scale,
    })
    if (sheet) {
      sheets.push(sheet)
      totalPixels += sheet.canvas.width * sheet.canvas.height
    }
    start += batch.crops.length
  }

  return sheets
}

function fitMappedCropSheetBatch(
  crops: readonly OcrBbox[],
  {
    columnCount,
    gap,
    maxPixels,
    preferScale,
    scale,
  }: {
    columnCount: number
    gap: number
    maxPixels: number
    preferScale: boolean
    scale: number
  },
) {
  if (preferScale) {
    for (let candidateScale = scale; candidateScale >= 1; candidateScale /= 2) {
      const fittedScale = Math.max(1, candidateScale)
      for (let cropCount = crops.length; cropCount >= 1; cropCount -= 1) {
        const batchCrops = crops.slice(0, cropCount)
        const { height, width } = getMappedCropSheetSize(batchCrops, {
          columnCount,
          gap,
          scale: fittedScale,
        })

        if (width * height <= maxPixels) {
          return {
            crops: batchCrops,
            scale: fittedScale,
          }
        }
      }

      if (fittedScale === 1) {
        break
      }
    }

    return null
  }

  for (let cropCount = crops.length; cropCount >= 1; cropCount = Math.floor(cropCount / 2)) {
    const batchCrops = crops.slice(0, cropCount)
    for (let candidateScale = scale; candidateScale >= 1; candidateScale /= 2) {
      const fittedScale = Math.max(1, candidateScale)
      const { height, width } = getMappedCropSheetSize(batchCrops, {
        columnCount,
        gap,
        scale: fittedScale,
      })

      if (width * height <= maxPixels) {
        return {
          crops: batchCrops,
          scale: fittedScale,
        }
      }

      if (fittedScale === 1) {
        break
      }
    }

    if (cropCount === 1) {
      break
    }
  }

  return null
}

function createMappedCropSheet(
  canvas: HTMLCanvasElement,
  crops: readonly OcrBbox[],
  {
    columnCount,
    gap,
    scale,
  }: {
    columnCount: number
    gap: number
    scale: number
  },
): PartImageAnchorCropSheet | null {
  const { maxCropHeight, maxCropWidth, width, height } = getMappedCropSheetSize(crops, {
    columnCount,
    gap,
    scale,
  })
  const actualColumnCount = Math.min(columnCount, crops.length)
  const sheetCanvas = document.createElement("canvas")
  sheetCanvas.width = width
  sheetCanvas.height = height
  const sheetContext = sheetCanvas.getContext("2d", { alpha: false })
  if (!sheetContext) {
    return null
  }

  sheetContext.fillStyle = "#ffffff"
  sheetContext.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height)

  const mappedCrops = crops.map((crop, index): PartImageAnchorCrop => {
    const column = index % actualColumnCount
    const row = Math.floor(index / actualColumnCount)
    const cropWidth = Math.round(crop.x1 - crop.x0)
    const cropHeight = Math.round(crop.y1 - crop.y0)
    const sheetX = Math.round(gap + column * (maxCropWidth * scale + gap))
    const sheetY = Math.round(gap + row * (maxCropHeight * scale + gap))

    sheetContext.drawImage(
      canvas,
      crop.x0,
      crop.y0,
      cropWidth,
      cropHeight,
      sheetX,
      sheetY,
      cropWidth * scale,
      cropHeight * scale,
    )

    return {
      scale,
      sheetRegion: {
        x0: sheetX,
        x1: sheetX + cropWidth * scale,
        y0: sheetY,
        y1: sheetY + cropHeight * scale,
      },
      sourceRegion: crop,
    }
  })

  return {
    canvas: sheetCanvas,
    crops: mappedCrops,
  }
}

function getMappedCropSheetSize(
  crops: readonly OcrBbox[],
  {
    columnCount,
    gap,
    scale,
  }: {
    columnCount: number
    gap: number
    scale: number
  },
) {
  const maxCropWidth = Math.ceil(Math.max(...crops.map((crop) => crop.x1 - crop.x0)))
  const maxCropHeight = Math.ceil(Math.max(...crops.map((crop) => crop.y1 - crop.y0)))
  const actualColumnCount = Math.min(columnCount, crops.length)
  const rowCount = Math.ceil(crops.length / actualColumnCount)

  return {
    height: Math.ceil(rowCount * maxCropHeight * scale + (rowCount + 1) * gap),
    maxCropHeight,
    maxCropWidth,
    rowCount,
    width: Math.ceil(actualColumnCount * maxCropWidth * scale + (actualColumnCount + 1) * gap),
  }
}

function createDensePartLabelCropRegion(
  canvas: HTMLCanvasElement,
  anchor: OcrBbox,
  mode: "context" | "tight",
) {
  const width = anchor.x1 - anchor.x0
  const height = anchor.y1 - anchor.y0
  const horizontalPadding =
    mode === "tight"
      ? clamp(Math.round(Math.max(60, width * 0.22)), 50, 135)
      : clamp(Math.round(Math.max(115, width * 0.32)), 90, 230)
  const topPadding = clamp(Math.round(height * 0.04), 0, 24)
  const bottomPadding = clamp(Math.round(Math.max(230, height * 0.9)), 200, 360)

  const crop = {
    x0: clamp(Math.round(anchor.x0 - horizontalPadding), 0, canvas.width - 1),
    x1: clamp(Math.round(anchor.x1 + horizontalPadding), 1, canvas.width),
    y0: clamp(Math.round(anchor.y1 - topPadding), 0, canvas.height - 1),
    y1: clamp(Math.round(anchor.y1 + bottomPadding), 1, canvas.height),
  }

  return crop.x1 > crop.x0 && crop.y1 > crop.y0 ? crop : null
}

function areRedundantDensePartLabelCrops(left: OcrBbox, right: OcrBbox) {
  if (getOcrBboxIntersectionRatio(left, right) < 0.85) {
    return false
  }

  const leftArea = getBboxArea(left)
  const rightArea = getBboxArea(right)
  const areaRatio = Math.min(leftArea, rightArea) / Math.max(1, Math.max(leftArea, rightArea))

  return areaRatio >= 0.8
}

function getOcrBboxIntersectionRatio(left: OcrBbox, right: OcrBbox) {
  const overlapLeft = Math.max(left.x0, right.x0)
  const overlapTop = Math.max(left.y0, right.y0)
  const overlapRight = Math.min(left.x1, right.x1)
  const overlapBottom = Math.min(left.y1, right.y1)
  const overlapWidth = Math.max(0, overlapRight - overlapLeft)
  const overlapHeight = Math.max(0, overlapBottom - overlapTop)
  const overlapArea = overlapWidth * overlapHeight
  const smallerArea = Math.min(getBboxArea(left), getBboxArea(right))

  return smallerArea > 0 ? overlapArea / smallerArea : 0
}

function mapPartImageAnchorOcrDataToSource(
  data: OcrData,
  crops: readonly PartImageAnchorCrop[],
  sourceRank: number,
): OcrData {
  const transformedLines = getPositionedOcrLines(data.blocks ?? [])
    .map((line) => mapPartImageAnchorLineToSource(line, crops, sourceRank))
    .filter((line): line is PositionedOcrLine => Boolean(line))

  return {
    blocks: transformedLines.map((line): OcrBlock => ({
      bbox: line.bbox,
      paragraphs: [
        {
          lines: [
            {
              bbox: line.bbox,
              sourceRank,
              text: line.normalizedText,
            },
          ],
        },
      ],
      sourceRank,
      text: line.normalizedText,
    })),
    text: "",
    textVariants: [],
  }
}

function mapPartImageAnchorLineToSource(
  line: PositionedOcrLine,
  crops: readonly PartImageAnchorCrop[],
  sourceRank: number,
) {
  const crop = crops.find(
    (candidate) =>
      line.centerX >= candidate.sheetRegion.x0 &&
      line.centerX <= candidate.sheetRegion.x1 &&
      line.centerY >= candidate.sheetRegion.y0 &&
      line.centerY <= candidate.sheetRegion.y1,
  )
  if (!crop) {
    return null
  }

  const bbox = {
    x0: crop.sourceRegion.x0 + (line.bbox.x0 - crop.sheetRegion.x0) / crop.scale,
    x1: crop.sourceRegion.x0 + (line.bbox.x1 - crop.sheetRegion.x0) / crop.scale,
    y0: crop.sourceRegion.y0 + (line.bbox.y0 - crop.sheetRegion.y0) / crop.scale,
    y1: crop.sourceRegion.y0 + (line.bbox.y1 - crop.sheetRegion.y0) / crop.scale,
  }

  return {
    bbox,
    centerX: (bbox.x0 + bbox.x1) / 2,
    centerY: (bbox.y0 + bbox.y1) / 2,
    normalizedText: line.normalizedText,
    sourceRank,
  }
}

function offsetOcrDataCoordinates(
  data: OcrData,
  coordinateOffsetX: number,
  coordinateOffsetY: number,
  sourceRank: number,
): OcrData {
  if (!coordinateOffsetX && !coordinateOffsetY && !sourceRank) {
    return data
  }

  return {
    ...data,
    text: sourceRank > 0 ? "" : data.text,
    blocks: data.blocks?.map((block) => ({
      ...block,
      bbox: offsetOcrBbox(block.bbox, coordinateOffsetX, coordinateOffsetY),
      paragraphs: block.paragraphs?.map((paragraph) => ({
        ...paragraph,
        lines: paragraph.lines?.map((line) => ({
          ...line,
          bbox: offsetOcrBbox(line.bbox, coordinateOffsetX, coordinateOffsetY),
          sourceRank,
        })),
      })),
      sourceRank,
    })),
  }
}

function offsetOcrBbox(
  bbox: OcrBbox | undefined,
  coordinateOffsetX: number,
  coordinateOffsetY: number,
) {
  return bbox
    ? {
        ...bbox,
        x0: bbox.x0 + coordinateOffsetX,
        x1: bbox.x1 + coordinateOffsetX,
        y0: bbox.y0 + coordinateOffsetY,
        y1: bbox.y1 + coordinateOffsetY,
      }
    : undefined
}

function mergeOcrData(results: readonly OcrData[]): OcrData {
  if (results.length === 1) {
    return results[0] ?? {}
  }

  const bestTextData = selectBestOcrData(results)
  const textVariants = results
    .map((result) => result.text ?? "")
    .filter((text) => text.trim().length > 0)

  return {
    blocks: results.flatMap((result) => result.blocks ?? []),
    text: bestTextData.text ?? "",
    textVariants,
  }
}

function selectBestOcrData(results: readonly OcrData[]) {
  return [...results]
    .sort((left, right) => scoreOcrData(right) - scoreOcrData(left))[0] ?? {}
}

function scoreOcrData(data: OcrData) {
  const normalized = normalizeOcrPageData(data)

  return normalized.rowSources.reduce((score, rowSource) => {
    const colorScore = getSequentialColorText(rowSource.rawText) ? 2 : 0
    const regionScore = rowSource.rowRegion ? 2 : 0

    return score + 1 + colorScore + regionScore
  }, 0)
}

function detectPartImageAnchorSets(canvas: HTMLCanvasElement) {
  const imageData = getCanvasImageData(canvas)
  if (!imageData) {
    return {
      studioGridAnchors: [],
      studioThumbnailAnchors: [],
    }
  }

  const components = detectPartImageAnchorComponents(imageData)
  const studioGridAnchors = components
    .filter((region) => isLikelyDensePartImageLabelAnchor(region))
    .sort((left, right) => left.y0 - right.y0 || left.x0 - right.x0)
    .slice(0, 72)
    .map((region) => ({ region }))
  const studioThumbnailAnchors = mergeNearbyPartImageAnchorComponents(components)
    .filter((region) => isLikelyPartImageAnchorComponent(region, getBboxArea(region), imageData))
    .sort((left, right) => left.y0 - right.y0 || left.x0 - right.x0)
    .slice(0, 60)
    .map((region) => ({ region }))

  return {
    studioGridAnchors,
    studioThumbnailAnchors,
  }
}

function detectPartImageAnchorComponents(imageData: ImageData) {
  const background = estimateCanvasBackground(imageData)
  const stride = Math.max(3, Math.round(Math.sqrt((imageData.width * imageData.height) / 450_000)))
  const gridWidth = Math.ceil(imageData.width / stride)
  const gridHeight = Math.ceil(imageData.height / stride)
  const mask = new Uint8Array(gridWidth * gridHeight)

  for (let gridY = 0; gridY < gridHeight; gridY += 1) {
    for (let gridX = 0; gridX < gridWidth; gridX += 1) {
      const sourceX = Math.min(imageData.width - 1, gridX * stride)
      const sourceY = Math.min(imageData.height - 1, gridY * stride)
      const sourceIndex = (sourceY * imageData.width + sourceX) * 4
      if (
        isPartImageAnchorForegroundPixel(
          imageData.data[sourceIndex] ?? 0,
          imageData.data[sourceIndex + 1] ?? 0,
          imageData.data[sourceIndex + 2] ?? 0,
          background,
        )
      ) {
        mask[gridY * gridWidth + gridX] = 1
      }
    }
  }

  const components: OcrBbox[] = []
  const queue = new Int32Array(mask.length)

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) {
      continue
    }

    let queueStart = 0
    let queueEnd = 0
    let area = 0
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = 0
    let maxY = 0
    mask[index] = 0
    queue[queueEnd] = index
    queueEnd += 1

    while (queueStart < queueEnd) {
      const current = queue[queueStart] ?? 0
      queueStart += 1
      const x = current % gridWidth
      const y = Math.floor(current / gridWidth)
      area += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)

      const neighbors = [
        x > 0 ? current - 1 : -1,
        x < gridWidth - 1 ? current + 1 : -1,
        y > 0 ? current - gridWidth : -1,
        y < gridHeight - 1 ? current + gridWidth : -1,
      ]
      for (const neighbor of neighbors) {
        if (neighbor >= 0 && mask[neighbor]) {
          mask[neighbor] = 0
          queue[queueEnd] = neighbor
          queueEnd += 1
        }
      }
    }

    const bbox = {
      x0: Math.max(0, minX * stride),
      x1: Math.min(imageData.width, (maxX + 1) * stride),
      y0: Math.max(0, minY * stride),
      y1: Math.min(imageData.height, (maxY + 1) * stride),
    }
    if (isLikelyPartImageAnchorComponent(bbox, area * stride * stride, imageData)) {
      components.push(bbox)
    }
  }

  return components
}

function estimateCanvasBackground(imageData: ImageData) {
  const sampleStep = Math.max(16, Math.floor(Math.sqrt((imageData.width * imageData.height) / 8_000)))
  let red = 0
  let green = 0
  let blue = 0
  let samples = 0

  for (let x = 0; x < imageData.width; x += sampleStep) {
    const topIndex = x * 4
    const bottomIndex = ((imageData.height - 1) * imageData.width + x) * 4
    red += (imageData.data[topIndex] ?? 0) + (imageData.data[bottomIndex] ?? 0)
    green += (imageData.data[topIndex + 1] ?? 0) + (imageData.data[bottomIndex + 1] ?? 0)
    blue += (imageData.data[topIndex + 2] ?? 0) + (imageData.data[bottomIndex + 2] ?? 0)
    samples += 2
  }

  for (let y = 0; y < imageData.height; y += sampleStep) {
    const leftIndex = y * imageData.width * 4
    const rightIndex = (y * imageData.width + imageData.width - 1) * 4
    red += (imageData.data[leftIndex] ?? 0) + (imageData.data[rightIndex] ?? 0)
    green += (imageData.data[leftIndex + 1] ?? 0) + (imageData.data[rightIndex + 1] ?? 0)
    blue += (imageData.data[leftIndex + 2] ?? 0) + (imageData.data[rightIndex + 2] ?? 0)
    samples += 2
  }

  return {
    blue: samples > 0 ? blue / samples : 255,
    green: samples > 0 ? green / samples : 255,
    luminance: getLuminance(
      samples > 0 ? red / samples : 255,
      samples > 0 ? green / samples : 255,
      samples > 0 ? blue / samples : 255,
    ),
    red: samples > 0 ? red / samples : 255,
  }
}

function isPartImageAnchorForegroundPixel(
  red: number,
  green: number,
  blue: number,
  background: { blue: number; green: number; luminance: number; red: number },
) {
  const colorDelta = Math.sqrt(
    (red - background.red) ** 2 +
      (green - background.green) ** 2 +
      (blue - background.blue) ** 2,
  )
  const luminance = getLuminance(red, green, blue)

  return colorDelta >= 34 && Math.abs(luminance - background.luminance) >= 18
}

function isLikelyPartImageAnchorComponent(bbox: OcrBbox, area: number, imageData: ImageData) {
  const width = bbox.x1 - bbox.x0
  const height = bbox.y1 - bbox.y0
  const bboxArea = width * height
  if (
    area < 1_400 ||
    width < 34 ||
    height < 22 ||
    width > imageData.width * 0.28 ||
    height > imageData.height * 0.28
  ) {
    return false
  }

  const fillRatio = area / Math.max(1, bboxArea)
  const aspectRatio = Math.max(width / Math.max(1, height), height / Math.max(1, width))

  return fillRatio >= 0.08 && aspectRatio <= 11
}

function isLikelyDensePartImageLabelAnchor(bbox: OcrBbox) {
  const width = bbox.x1 - bbox.x0
  const height = bbox.y1 - bbox.y0
  const area = getBboxArea(bbox)
  const aspectRatio = Math.max(width / Math.max(1, height), height / Math.max(1, width))

  return area >= 8_000 && width >= 80 && height >= 70 && aspectRatio <= 7
}

function mergeNearbyPartImageAnchorComponents(components: readonly OcrBbox[]) {
  const merged: OcrBbox[] = []
  const proximity = 22

  for (const component of components) {
    const existingIndex = merged.findIndex((candidate) =>
      expandedBboxesIntersect(candidate, component, proximity),
    )
    if (existingIndex < 0) {
      merged.push({ ...component })
      continue
    }

    merged[existingIndex] = mergeOcrBboxes([merged[existingIndex]!, component])
  }

  let changed = true
  while (changed) {
    changed = false
    for (let index = 0; index < merged.length; index += 1) {
      const component = merged[index]
      if (!component) {
        continue
      }

      const matchIndex = merged.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex > index && expandedBboxesIntersect(component, candidate, proximity),
      )
      if (matchIndex >= 0) {
        merged[index] = mergeOcrBboxes([component, merged[matchIndex]!])
        merged.splice(matchIndex, 1)
        changed = true
        break
      }
    }
  }

  return merged
}

function expandedBboxesIntersect(left: OcrBbox, right: OcrBbox, padding: number) {
  return !(
    left.x1 + padding < right.x0 ||
    right.x1 + padding < left.x0 ||
    left.y1 + padding < right.y0 ||
    right.y1 + padding < left.y0
  )
}

function getBboxArea(bbox: OcrBbox) {
  return Math.max(0, bbox.x1 - bbox.x0) * Math.max(0, bbox.y1 - bbox.y0)
}

function mergeOcrBboxes(bboxes: readonly OcrBbox[]): OcrBbox {
  return {
    x0: Math.min(...bboxes.map((bbox) => bbox.x0)),
    x1: Math.max(...bboxes.map((bbox) => bbox.x1)),
    y0: Math.min(...bboxes.map((bbox) => bbox.y0)),
    y1: Math.max(...bboxes.map((bbox) => bbox.y1)),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getCanvasImageData(canvas: HTMLCanvasElement) {
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true }) ?? canvas.getContext("2d")
    return context?.getImageData(0, 0, canvas.width, canvas.height) ?? null
  } catch {
    return null
  }
}

function getLuminance(red: number, green: number, blue: number) {
  return Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722)
}

async function createDefaultPaddleOcrEngine({
  remainingMs,
  signal,
}: {
  remainingMs: () => number
  signal?: AbortSignal
}) {
  const paddle = await runWithOcrDeadline(import("@paddleocr/paddleocr-js"), remainingMs, signal)
  const runner = await runWithOcrDeadline(
    paddle.PaddleOCR.create({
      initialize: true,
      lang: "en",
      ocrVersion: paddleOcrPipelineName,
      ortOptions: {
        backend: "wasm",
        numThreads: 1,
        simd: true,
        wasmPaths: paddleOcrWasmPaths,
      },
      textDetectionModelAsset: {
        url: getBrowserPaddleOcrModelAssetUrl(paddleOcrModelAssetFiles.detection),
      },
      textDetectionModelName: paddleOcrTextDetectionModelName,
      textRecognitionModelAsset: {
        url: getBrowserPaddleOcrModelAssetUrl(paddleOcrModelAssetFiles.recognition),
      },
      textRecognitionModelName: paddleOcrTextRecognitionModelName,
      worker: true,
    }) as Promise<PaddleOcrRunner>,
    remainingMs,
    signal,
  )

  return createPaddleOcrEngine(runner)
}

function getBrowserPaddleOcrModelAssetUrl(asset: PaddleOcrModelAssetFile) {
  return getPaddleOcrModelAssetUrl(asset, typeof window === "undefined" ? undefined : window.location.origin)
}

async function acquireDefaultPaddleOcrEngine({
  remainingMs,
  signal,
}: {
  remainingMs: () => number
  signal?: AbortSignal
}) {
  const preloadedWorker = await claimPreloadedPaddleOcrEngine({ remainingMs, signal })

  return preloadedWorker ?? createDefaultPaddleOcrEngine({ remainingMs, signal })
}

async function claimPreloadedPaddleOcrEngine({
  remainingMs,
  signal,
}: {
  remainingMs: () => number
  signal?: AbortSignal
}) {
  if (preloadedPaddleOcrEngine) {
    const worker = preloadedPaddleOcrEngine
    preloadedPaddleOcrEngine = null
    preloadedPaddleOcrEnginePromise = null

    return worker
  }

  const workerPromise = preloadedPaddleOcrEnginePromise
  if (!workerPromise) {
    return null
  }
  preloadedPaddleOcrEnginePromise = null

  try {
    const worker = await runWithOcrDeadline(workerPromise, remainingMs, signal)
    if (preloadedPaddleOcrEngine === worker) {
      preloadedPaddleOcrEngine = null
    }

    return worker
  } catch {
    void workerPromise
      .then((worker) => worker.terminate?.().catch(() => undefined))
      .catch(() => undefined)

    return null
  }
}

function createPaddleOcrEngine(runner: PaddleOcrRunner): PartsListOcrEngine {
  return {
    async recognize(image) {
      const [result] = await runner.predict(image, paddleOcrPredictParams)

      return {
        data: paddleOcrResultToOcrData(result),
      }
    },
    terminate: () => runner.dispose?.() ?? Promise.resolve(),
  }
}

function paddleOcrResultToOcrData(result: PaddleOcrResult | undefined): OcrData {
  const items = result?.items ?? []
  const blocks = items.map((item) => {
    const bbox = paddlePolyToOcrBbox(item.poly)

    return {
      bbox,
      paragraphs: [
        {
          lines: [
            {
              bbox,
              sourceRank: 0,
              text: item.text,
            },
          ],
        },
      ],
      sourceRank: 0,
      text: item.text,
    }
  })
  const text = items.map((item) => item.text).join("\n")

  return {
    blocks,
    text,
    textVariants: text ? [text] : [],
  }
}

function paddlePolyToOcrBbox(poly: readonly [number, number][]): OcrBbox {
  if (poly.length === 0) {
    return { x0: 0, x1: 0, y0: 0, y1: 0 }
  }

  const xs = poly.map((point) => point[0])
  const ys = poly.map((point) => point[1])

  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
  }
}

function renderableCanvasFromPage(
  page: PdfReadablePage,
  { maxPageWidth, maxPixels }: { maxPageWidth: number; maxPixels: number },
) {
  if (typeof document === "undefined" || !page.render) {
    return null
  }

  const viewport = page.getViewport({ scale: 1 })
  const widthScale = maxPageWidth / viewport.width
  const pixelScale = Math.sqrt(maxPixels / Math.max(1, viewport.width * viewport.height))
  const scaleCandidate = Math.min(widthScale, pixelScale)
  const scale = Number.isFinite(scaleCandidate) && scaleCandidate > 0 ? scaleCandidate : 1
  const scaledViewport = page.getViewport({ scale })
  const canvas = document.createElement("canvas")
  canvas.width = Math.ceil(scaledViewport.width)
  canvas.height = Math.ceil(scaledViewport.height)

  return canvas
}

async function renderPageToCanvas(
  page: PdfReadablePage,
  canvas: HTMLCanvasElement,
  remainingMs: () => number,
  signal?: AbortSignal,
) {
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true })
  if (!context) {
    return
  }

  const scale = canvas.width / page.getViewport({ scale: 1 }).width
  const viewport = page.getViewport({ scale })
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)

  const renderTask = page.render?.({
    canvas,
    canvasContext: context,
    viewport,
  })

  if (!renderTask) {
    return
  }

  const cancelRender = () => renderTask.cancel?.()
  await runWithOcrDeadline(renderTask.promise, remainingMs, signal, {
    onCancel: cancelRender,
    onDeadline: cancelRender,
  })
}

function getBoundedPageNumbers(pageNumbers: readonly number[], pageCount: number) {
  const seen = new Set<number>()

  return pageNumbers.filter((pageNumber) => {
    if (
      seen.has(pageNumber) ||
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > pageCount
    ) {
      return false
    }

    seen.add(pageNumber)
    return true
  })
}

export function createOcrPageText(
  pageNumber: number,
  data: OcrData,
  sourceImage: PartsListSourceImage | null = null,
  diagnostics?: PartsListPageDiagnostics,
  options: {
    studioGridAnchors?: readonly PartImageAnchor[]
    studioThumbnailAnchors?: readonly PartImageAnchor[]
  } = {},
): PartsListPageText {
  const normalized = normalizeOcrPageData(data, sourceImage, options)

  return {
    diagnostics,
    pageNumber,
    rawText: getRawOcrPageText(data),
    rowSources: normalized.rowSources.map((rowSource) => ({
      ...rowSource,
      cropReferences: createCropReferences({
        pageNumber,
        partThumbnailRegion: rowSource.partThumbnailRegion,
        rowRegion: rowSource.rowRegion,
      }),
    })),
    sourceKind: "ocr",
    text: normalized.text,
  }
}

function getRawOcrPageText(data: OcrData) {
  const blockText = getPositionedOcrLines(data.blocks ?? [])
    .map((line) => line.normalizedText)
    .join("\n")
  if (blockText) {
    return blockText
  }

  return normalizeOcrText(data.text ?? "")
}

export function normalizeOcrPageText(
  data: OcrData,
  options: {
    studioGridAnchors?: readonly PartImageAnchor[]
    studioThumbnailAnchors?: readonly PartImageAnchor[]
  } = {},
) {
  return normalizeOcrPageData(data, null, options).text
}

export function normalizeOcrPageData(
  data: OcrData,
  sourceImage: PartsListSourceImage | null = null,
  {
    studioGridAnchors = [],
    studioThumbnailAnchors = [],
  }: {
    studioGridAnchors?: readonly PartImageAnchor[]
    studioThumbnailAnchors?: readonly PartImageAnchor[]
  } = {},
): { rowSources: PartsListPageRowSource[]; text: string } {
  const structuredRows = buildPartsListRowsFromOcrBlocks(
    data.blocks ?? [],
    studioGridAnchors,
    studioThumbnailAnchors,
  )
  const alignedRows = buildPartsListRowsFromOcrTextVariants(getOcrTextVariants(data))
  const rows = filterUnexpectedStudioColorCodeRows(deduplicateOcrRows(repairLikelyTruncatedDominantStudioColorRows(
    repairUnbackedMinorityNamedColorRows(repairDominantNamedColorRows(
      filterLowQualityRetryOcrRows(mergeStructuredAndAlignedOcrRows(structuredRows, alignedRows)),
    )),
  )))
  if (rows.length > 0) {
    return createOcrTextData(rows, sourceImage)
  }

  return {
    rowSources: [],
    text: normalizeOcrText(data.text ?? ""),
  }
}

function filterUnexpectedStudioColorCodeRows(
  rows: readonly OcrReconstructedRow[],
): OcrReconstructedRow[] {
  if (rows.some(hasAnyDelimitedStudioColorCodeEvidence)) {
    return [...rows]
  }

  return rows.filter((row) => {
    const parts = parseOcrRowParts(row.text)
    const studioColorCode = parts ? getStudioColorCode(parts.colorText) : null
    if (!parts || !studioColorCode) {
      return true
    }

    return hasDelimitedStudioColorCodeEvidence(row, parts.partNumber, studioColorCode)
  })
}

function repairLikelyTruncatedDominantStudioColorRows(
  rows: readonly OcrReconstructedRow[],
): OcrReconstructedRow[] {
  const studioColorCodeCounts = getStudioColorCodeCounts(rows)
  const dominantStudioColorCode = getDominantStudioColorCode(rows, studioColorCodeCounts)
  if (!dominantStudioColorCode || dominantStudioColorCode.length < 2) {
    return [...rows]
  }

  return rows.map((row) => {
    const parts = parseOcrRowParts(row.text)
    const studioColorCode = parts ? getStudioColorCode(parts.colorText) : null
    if (
      !parts ||
      !studioColorCode ||
      studioColorCode === dominantStudioColorCode ||
      isRepeatedAmbiguousDominantStudioColorPrefix({
        count: studioColorCodeCounts.get(studioColorCode) ?? 0,
        dominantStudioColorCode,
        studioColorCode,
      }) ||
      !dominantStudioColorCode.startsWith(studioColorCode)
    ) {
      return row
    }

    return {
      ...row,
      text: `${parts.quantity} x ${parts.partNumber} studio-${dominantStudioColorCode}`,
    }
  })
}

function getDominantStudioColorCode(
  rows: readonly OcrReconstructedRow[],
  counts = getStudioColorCodeCounts(rows),
) {
  const sortedCounts = [...counts.entries()].sort((left, right) => right[1] - left[1])
  const [dominantColorCode, dominantCount = 0] = sortedCounts[0] ?? []
  if (!dominantColorCode || dominantCount < 12 || dominantCount < rows.length * 0.65) {
    return null
  }

  return dominantColorCode
}

function getStudioColorCodeCounts(rows: readonly OcrReconstructedRow[]) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const parts = parseOcrRowParts(row.text)
    const studioColorCode = parts ? getStudioColorCode(parts.colorText) : null
    if (!studioColorCode) {
      continue
    }

    counts.set(studioColorCode, (counts.get(studioColorCode) ?? 0) + 1)
  }

  return counts
}

function isRepeatedAmbiguousDominantStudioColorPrefix({
  count,
  dominantStudioColorCode,
  studioColorCode,
}: {
  count: number
  dominantStudioColorCode: string
  studioColorCode: string
}) {
  return count > 1 && studioColorCode === "8" && dominantStudioColorCode === "88"
}

function getStudioColorCode(colorText: string) {
  return colorText.match(/^studio-(\d{1,3})$/i)?.[1] ?? null
}

function repairDominantNamedColorRows(rows: readonly OcrReconstructedRow[]): OcrReconstructedRow[] {
  const dominantColor = getDominantNamedColor(rows)
  if (!dominantColor) {
    return [...rows]
  }

  return rows.map((row) => {
    const parts = parseOcrRowParts(row.text)
    if (!parts || hasResolvableOcrColorText(parts.colorText)) {
      return row
    }

    return {
      ...row,
      text: `${parts.quantity} x ${parts.partNumber} ${dominantColor}`,
    }
  })
}

function getDominantNamedColor(rows: readonly OcrReconstructedRow[]) {
  const counts = new Map<string, number>()
  let unresolvedCount = 0

  for (const row of rows) {
    const parts = parseOcrRowParts(row.text)
    if (!parts) {
      continue
    }

    const color = getSequentialColorText(parts.colorText)
    if (!color) {
      if (!hasResolvableOcrColorText(parts.colorText)) {
        unresolvedCount += 1
      }
      continue
    }

    counts.set(color, (counts.get(color) ?? 0) + 1)
  }

  const sortedCounts = [...counts.entries()].sort((left, right) => right[1] - left[1])
  const [dominantColor, dominantCount = 0] = sortedCounts[0] ?? []
  const resolvedCount = [...counts.values()].reduce((total, count) => total + count, 0)
  if (
    !dominantColor ||
    unresolvedCount === 0 ||
    dominantCount < 8 ||
    dominantCount < resolvedCount * 0.72
  ) {
    return null
  }

  return dominantColor
}

function repairUnbackedMinorityNamedColorRows(rows: readonly OcrReconstructedRow[]): OcrReconstructedRow[] {
  const dominantColor = getStrongDominantNamedColor(rows)
  if (!dominantColor) {
    return [...rows]
  }

  return rows.map((row) => {
    const parts = parseOcrRowParts(row.text)
    const rowColor = parts ? getSequentialColorText(parts.colorText) : null
    if (
      !parts ||
      !row.rowRegion ||
      !rowColor ||
      rowColor === dominantColor ||
      isOcrRowColorBackedByRawTokens(row, rowColor)
    ) {
      return row
    }

    return {
      ...row,
      text: `${parts.quantity} x ${parts.partNumber} ${dominantColor}`,
    }
  })
}

function getStrongDominantNamedColor(rows: readonly OcrReconstructedRow[]) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const parts = parseOcrRowParts(row.text)
    const color = parts ? getSequentialColorText(parts.colorText) : null
    if (!color) {
      continue
    }

    counts.set(color, (counts.get(color) ?? 0) + 1)
  }

  const sortedCounts = [...counts.entries()].sort((left, right) => right[1] - left[1])
  const [dominantColor, dominantCount = 0] = sortedCounts[0] ?? []
  const resolvedCount = [...counts.values()].reduce((total, count) => total + count, 0)
  if (
    !dominantColor ||
    dominantCount < 8 ||
    dominantCount < resolvedCount * 0.72
  ) {
    return null
  }

  return dominantColor
}

function isOcrRowColorBackedByRawTokens(row: OcrReconstructedRow, color: string) {
  return row.rawTokens.some((token) => {
    if (getSequentialColorText(token) !== color) {
      return false
    }

    if (color === "Light Bluish Gray") {
      return /\b(?:light|ligh|ignt)\s+b[li]uish\s+gr[ae]y/i.test(token)
    }

    if (color === "Dark Bluish Gray") {
      return /\b(?:dark|park)\s+b[li]uish\s+gr[ae]y/i.test(token) || /\bdark\s+sis\s+gr[ae]y/i.test(token)
    }

    return true
  })
}

export function buildPartsListTextFromOcrBlocks(
  blocks: readonly OcrBlock[],
  studioGridAnchors: readonly PartImageAnchor[] = [],
  studioThumbnailAnchors: readonly PartImageAnchor[] = [],
) {
  return buildPartsListRowsFromOcrBlocks(blocks, studioGridAnchors, studioThumbnailAnchors)
    .map((row) => row.text)
    .join("\n")
}

function getOcrTextVariants(data: OcrData) {
  return data.textVariants?.length ? data.textVariants : [data.text ?? ""]
}

function filterLowQualityRetryOcrRows(rows: readonly OcrReconstructedRow[]) {
  return rows.filter((row) => {
    if (row.sourceRank <= 0) {
      return true
    }

    const parts = parseOcrRowParts(row.text)
    return !parts || hasResolvableOcrColorText(parts.colorText)
  })
}

function buildPartsListRowsFromOcrBlocks(
  blocks: readonly OcrBlock[],
  studioGridAnchors: readonly PartImageAnchor[] = [],
  studioThumbnailAnchors: readonly PartImageAnchor[] = [],
) {
  const lines = getPositionedOcrLines(blocks)
  const rows: OcrReconstructedRow[] = []

  for (const quantityLine of lines) {
    const quantity = getQuantityFromOcrLine(quantityLine.normalizedText, { allowGlyphSlips: true })
    if (!quantity) {
      continue
    }

    const partLine = findPartLineForQuantity(quantityLine, lines)
    if (!partLine) {
      continue
    }

    const colorLine = partLine.colorText ? null : findColorLineForPart(partLine.line, lines)
    const sourceLines = colorLine
      ? [quantityLine, partLine.line, colorLine]
      : [quantityLine, partLine.line]
    const colorText = normalizeOcrColorTextForPartLine({
      colorLine,
      colorText: colorLine?.normalizedText ?? partLine.colorText,
      partLine: partLine.line,
    })
    addOcrRow(
      rows,
      createOcrRow({
        sourceLines,
        text: `${quantity} x ${partLine.partNumber} ${colorText}`.trim(),
      }),
    )
  }

  for (const partColorRow of buildPartColorAnchorRows(lines)) {
    addOcrRow(rows, partColorRow)
  }

  for (const inlinePartColorLine of lines) {
    const inlineRows = getInlinePartColorRowsFromOcrLine(inlinePartColorLine.normalizedText)
    for (const inlineRow of inlineRows) {
      addOcrRow(
        rows,
        createOcrRow({
          sourceLines: [
            createSyntheticPositionedLine({
              end: inlineRow.end,
              line: inlinePartColorLine,
              start: inlineRow.start,
              text: inlineRow.rawText,
            }),
          ],
          text: `${inlineRow.quantity} x ${inlineRow.partNumber} ${normalizeOcrColorText(
            inlineRow.colorText,
          )}`.trim(),
        }),
      )
    }
  }

  for (const gridRow of buildPartsListRowsFromOcrGrid(lines)) {
    addOcrRow(rows, gridRow)
  }

  return mergeStudioGridRows(
    rows,
    [
      ...buildPartsListRowsFromStudioVisualGrid(lines, studioGridAnchors),
      ...buildPartsListRowsFromStudioThumbnailOwnership(lines, studioThumbnailAnchors),
    ],
  ).sort(compareOcrRowsByRegion)
}

function compareOcrRowsByRegion(left: OcrReconstructedRow, right: OcrReconstructedRow) {
  if (!left.rowRegion || !right.rowRegion) {
    return left.rowRegion ? -1 : right.rowRegion ? 1 : 0
  }

  return left.rowRegion.y - right.rowRegion.y || left.rowRegion.x - right.rowRegion.x
}

function buildPartsListRowsFromStudioVisualGrid(
  lines: readonly PositionedOcrLine[],
  anchors: readonly PartImageAnchor[],
) {
  if (anchors.length < 2) {
    return []
  }

  const partColorAnchors = getPartColorAnchors(lines)
  if (partColorAnchors.length < 2) {
    return []
  }

  const cells = createStudioGridCells(anchors, lines)
  const quantityCandidates = getGridQuantityCandidates(lines)
  const rows: OcrReconstructedRow[] = []

  for (const cell of cells) {
    const [candidate] = selectStudioGridCellRowCandidates(
      cell,
      partColorAnchors,
      quantityCandidates,
    )
    if (candidate) {
      addOcrRow(rows, createStudioGridCellRow(cell, candidate.partColor, candidate.quantityCandidate))
    }
  }

  return rows
}

function buildPartsListRowsFromStudioThumbnailOwnership(
  lines: readonly PositionedOcrLine[],
  anchors: readonly PartImageAnchor[],
) {
  if (anchors.length < 2) {
    return []
  }

  const partColorAnchors = getPartColorAnchors(lines)
  if (partColorAnchors.length < 2) {
    return []
  }

  const cells = createStudioThumbnailOwnershipCells(anchors, lines)
  const quantityCandidates = getGridQuantityCandidates(lines)
  const rows: OcrReconstructedRow[] = []

  for (const cell of cells) {
    const [candidate] = selectStudioThumbnailCellRowCandidates(
      cell,
      cells,
      partColorAnchors,
      quantityCandidates,
    )
    if (candidate) {
      addOcrRow(
        rows,
        createStudioGridCellRow(cell, candidate.partColor, candidate.quantityCandidate, "studio-thumbnail"),
      )
    }
  }

  return rows
}

function mergeStudioGridRows(
  rows: readonly OcrReconstructedRow[],
  studioGridRows: readonly OcrReconstructedRow[],
) {
  if (rows.length === 0) {
    return [...studioGridRows]
  }

  if (studioGridRows.length < 4) {
    return rows.length === 0 ? [...studioGridRows] : [...rows]
  }

  const existingKeys = new Set(rows.map(getStudioGridReplacementKey).filter((key): key is string => Boolean(key)))
  const mergedRows: OcrReconstructedRow[] = [...rows]

  for (const studioGridRow of studioGridRows) {
    const key = getStudioGridReplacementKey(studioGridRow)
    if (!key || existingKeys.has(key) || hasExistingRowForStudioGridCell(studioGridRow, rows)) {
      continue
    }

    addOcrRow(mergedRows, studioGridRow)
    existingKeys.add(key)
  }

  return mergedRows
}

function getStudioGridReplacementKey(row: OcrReconstructedRow) {
  const parts = parseOcrRowParts(row.text)
  const colorText = parts ? normalizeOcrColorText(parts.colorText) : ""
  return parts && /^studio-\d{1,3}$/.test(colorText) ? `${parts.partNumber}|${colorText}` : null
}

function hasExistingRowForStudioGridCell(
  studioGridRow: OcrReconstructedRow,
  existingRows: readonly OcrReconstructedRow[],
) {
  const thumbnailRegion = studioGridRow.partThumbnailRegion
  if (!thumbnailRegion) {
    return false
  }

  return existingRows.some((row) => {
    if (row.partThumbnailRegion && getRegionIntersectionRatio(row.partThumbnailRegion, thumbnailRegion) >= 0.1) {
      return true
    }

    return Boolean(row.rowRegion && isRowRegionNearStudioGridThumbnail(row.rowRegion, thumbnailRegion))
  })
}

function isRowRegionNearStudioGridThumbnail(
  rowRegion: PartsListSourceRegion,
  thumbnailRegion: PartsListSourceRegion,
) {
  const rowCenterX = rowRegion.x + rowRegion.width / 2
  const rowCenterY = rowRegion.y + rowRegion.height / 2
  const thumbnailCenterX = thumbnailRegion.x + thumbnailRegion.width / 2
  const thumbnailCenterY = thumbnailRegion.y + thumbnailRegion.height / 2
  const maxHorizontalDistance = Math.max(90, thumbnailRegion.width * 0.9)
  const maxVerticalDistance = Math.max(140, thumbnailRegion.height * 1.25)

  return (
    Math.abs(rowCenterX - thumbnailCenterX) <= maxHorizontalDistance &&
    Math.abs(rowCenterY - thumbnailCenterY) <= maxVerticalDistance
  )
}

function createStudioGridCells(
  anchors: readonly PartImageAnchor[],
  lines: readonly PositionedOcrLine[],
): StudioGridCell[] {
  const anchorRows = groupStudioGridAnchorRows(anchors)
  const maxLineX = Math.max(...lines.map((line) => line.bbox.x1), ...anchors.map((anchor) => anchor.region.x1), 0)
  const maxLineY = Math.max(...lines.map((line) => line.bbox.y1), ...anchors.map((anchor) => anchor.region.y1), 0)
  const cells: StudioGridCell[] = []

  for (let rowIndex = 0; rowIndex < anchorRows.length; rowIndex += 1) {
    const row = [...anchorRows[rowIndex]!].sort(
      (left, right) => getBboxCenterX(left.region) - getBboxCenterX(right.region),
    )
    const previousRow = anchorRows[rowIndex - 1]
    const nextRow = anchorRows[rowIndex + 1]
    const rowCenterY = getAverageAnchorCenterY(row)
    const y0 = previousRow
      ? midpoint(getAverageAnchorCenterY(previousRow), rowCenterY)
      : Math.max(0, Math.min(...row.map((anchor) => anchor.region.y0)) - 260)
    const y1 = nextRow
      ? midpoint(rowCenterY, getAverageAnchorCenterY(nextRow))
      : Math.max(maxLineY + 40, Math.max(...row.map((anchor) => anchor.region.y1)) + 300)

    for (let index = 0; index < row.length; index += 1) {
      const anchor = row[index]!
      const previousAnchor = row[index - 1]
      const nextAnchor = row[index + 1]
      const centerX = getBboxCenterX(anchor.region)
      const x0 = previousAnchor
        ? midpoint(getBboxCenterX(previousAnchor.region), centerX)
        : Math.max(0, anchor.region.x0 - 320)
      const x1 = nextAnchor
        ? midpoint(centerX, getBboxCenterX(nextAnchor.region))
        : Math.max(maxLineX + 40, anchor.region.x1 + 320)

      cells.push({
        anchor,
        region: {
          x0,
          x1,
          y0,
          y1,
        },
      })
    }
  }

  return cells
}

function createStudioThumbnailOwnershipCells(
  anchors: readonly PartImageAnchor[],
  lines: readonly PositionedOcrLine[],
): StudioGridCell[] {
  const maxLineX = Math.max(...lines.map((line) => line.bbox.x1), ...anchors.map((anchor) => anchor.region.x1), 0)
  const maxLineY = Math.max(...lines.map((line) => line.bbox.y1), ...anchors.map((anchor) => anchor.region.y1), 0)

  return anchors.map((anchor) => {
    const width = anchor.region.x1 - anchor.region.x0
    const height = anchor.region.y1 - anchor.region.y0
    const horizontalPadding = clamp(Math.round(Math.max(120, width * 0.95)), 90, 320)
    const topPadding = clamp(Math.round(Math.max(80, height * 0.7)), 60, 220)
    const bottomPadding = clamp(Math.round(Math.max(150, height * 1.35)), 110, 360)

    return {
      anchor,
      region: {
        x0: Math.max(0, anchor.region.x0 - horizontalPadding),
        x1: Math.max(anchor.region.x1, Math.min(maxLineX + 40, anchor.region.x1 + horizontalPadding)),
        y0: Math.max(0, anchor.region.y0 - topPadding),
        y1: Math.max(anchor.region.y1, Math.min(maxLineY + 40, anchor.region.y1 + bottomPadding)),
      },
    }
  })
}

function groupStudioGridAnchorRows(anchors: readonly PartImageAnchor[]) {
  const rows: PartImageAnchor[][] = []
  const anchorHeights = anchors.map((anchor) => anchor.region.y1 - anchor.region.y0).sort((left, right) => left - right)
  const medianHeight = anchorHeights[Math.floor(anchorHeights.length / 2)] ?? 120
  const maxRowDistance = clamp(Math.round(medianHeight * 0.8), 80, 180)

  for (const anchor of [...anchors].sort((left, right) => getBboxCenterY(left.region) - getBboxCenterY(right.region))) {
    const row = rows.find(
      (candidateRow) => Math.abs(getAverageAnchorCenterY(candidateRow) - getBboxCenterY(anchor.region)) <= maxRowDistance,
    )
    if (row) {
      row.push(anchor)
    } else {
      rows.push([anchor])
    }
  }

  return rows.sort((left, right) => getAverageAnchorCenterY(left) - getAverageAnchorCenterY(right))
}

function getAverageAnchorCenterY(anchors: readonly PartImageAnchor[]) {
  return anchors.reduce((total, anchor) => total + getBboxCenterY(anchor.region), 0) / Math.max(1, anchors.length)
}

function selectStudioGridCellRowCandidates(
  cell: StudioGridCell,
  partColorAnchors: readonly PartColorAnchor[],
  quantityCandidates: readonly GridQuantityCandidate[],
): StudioGridCellRowCandidate[] {
  const candidates = partColorAnchors
    .filter((anchor) => isLineInStudioGridCell(anchor.line, cell))
    .filter((anchor) => !isLikelyFusedStudioGridColorDigit(anchor))
    .map((partColor): StudioGridCellRowCandidate | null => {
      const quantityCandidate = partColor.quantity
        ? null
        : selectStudioGridCellQuantity(cell, partColor, quantityCandidates)
      if (!partColor.quantity && !quantityCandidate) {
        return null
      }

      return {
        partColor,
        quantityCandidate,
        score:
          scoreStudioGridPartColor(cell, partColor) +
          (quantityCandidate ? scoreStudioGridQuantityCandidate(cell, partColor, quantityCandidate) : -35),
      }
    })
    .filter((candidate): candidate is StudioGridCellRowCandidate => Boolean(candidate))
    .sort((left, right) => left.score - right.score)
  const bestScore = candidates[0]?.score
  if (bestScore === undefined) {
    return []
  }

  return candidates.filter((candidate) => candidate.score <= bestScore + 220).slice(0, 3)
}

function selectStudioThumbnailCellRowCandidates(
  cell: StudioGridCell,
  cells: readonly StudioGridCell[],
  partColorAnchors: readonly PartColorAnchor[],
  quantityCandidates: readonly GridQuantityCandidate[],
): StudioGridCellRowCandidate[] {
  const candidates = partColorAnchors
    .filter((anchor) => isLineOwnedByStudioThumbnailCell(anchor.line, cell, cells))
    .filter((anchor) => !isLikelyFusedStudioGridColorDigit(anchor))
    .map((partColor): StudioGridCellRowCandidate | null => {
      const quantityCandidate = partColor.quantity
        ? null
        : selectStudioThumbnailCellQuantity(cell, cells, partColor, quantityCandidates)
      if (!partColor.quantity && !quantityCandidate) {
        return null
      }

      return {
        partColor,
        quantityCandidate,
        score:
          scoreStudioThumbnailPartColor(cell, partColor) +
          (quantityCandidate ? scoreStudioThumbnailQuantityCandidate(cell, partColor, quantityCandidate) : -35),
      }
    })
    .filter((candidate): candidate is StudioGridCellRowCandidate => Boolean(candidate))
    .sort((left, right) => left.score - right.score)
  const bestScore = candidates[0]?.score
  if (bestScore === undefined) {
    return []
  }

  return candidates.filter((candidate) => candidate.score <= bestScore + 120).slice(0, 2)
}

function selectStudioThumbnailCellQuantity(
  cell: StudioGridCell,
  cells: readonly StudioGridCell[],
  partColor: PartColorAnchor,
  quantityCandidates: readonly GridQuantityCandidate[],
) {
  return quantityCandidates
    .filter((candidate) => candidate.line !== partColor.line)
    .filter((candidate) => isLineOwnedByStudioThumbnailCell(candidate.line, cell, cells))
    .filter((candidate) => getAlignedPartColorTokens(candidate.line.normalizedText).length === 0)
    .sort(
      (left, right) =>
        scoreStudioThumbnailQuantityCandidate(cell, partColor, left) -
        scoreStudioThumbnailQuantityCandidate(cell, partColor, right),
    )[0] ?? null
}

function isLineOwnedByStudioThumbnailCell(
  line: PositionedOcrLine,
  cell: StudioGridCell,
  cells: readonly StudioGridCell[],
) {
  if (!isLineInStudioGridCell(line, cell)) {
    return false
  }

  const owner = cells
    .filter((candidate) => isLineInStudioGridCell(line, candidate))
    .sort(
      (left, right) =>
        scoreStudioThumbnailLineOwnership(line, left) -
        scoreStudioThumbnailLineOwnership(line, right),
    )[0]

  return owner === cell
}

function scoreStudioThumbnailPartColor(cell: StudioGridCell, anchor: PartColorAnchor) {
  return scoreStudioThumbnailLineOwnership(anchor.line, cell)
}

function scoreStudioThumbnailQuantityCandidate(
  cell: StudioGridCell,
  partColor: PartColorAnchor,
  quantity: GridQuantityCandidate,
) {
  const sourcePenalty = quantity.source === "explicit" ? 0 : quantity.source === "glyph_slip" ? 32 : 72
  const belowPartColorPenalty = quantity.line.centerY > partColor.line.centerY ? 34 : 0

  return (
    sourcePenalty +
    belowPartColorPenalty +
    scoreStudioThumbnailLineOwnership(quantity.line, cell) * 0.55 +
    Math.abs(quantity.line.centerX - partColor.line.centerX) * 0.55 +
    Math.abs(quantity.line.centerY - partColor.line.centerY) * 0.25
  )
}

function scoreStudioThumbnailLineOwnership(line: PositionedOcrLine, cell: StudioGridCell) {
  const anchor = cell.anchor.region
  const horizontalDistance =
    line.centerX < anchor.x0 ? anchor.x0 - line.centerX : line.centerX > anchor.x1 ? line.centerX - anchor.x1 : 0
  const verticalDistance =
    line.centerY < anchor.y0 ? anchor.y0 - line.centerY : line.centerY > anchor.y1 ? line.centerY - anchor.y1 : 0
  const centerDistance = Math.abs(line.centerX - getBboxCenterX(anchor)) * 0.35
  const farAbovePenalty = line.centerY < anchor.y0 - Math.max(90, (anchor.y1 - anchor.y0) * 0.65) ? 80 : 0

  return horizontalDistance * 0.9 + verticalDistance + centerDistance + farAbovePenalty
}

function isLikelyFusedStudioGridColorDigit(anchor: PartColorAnchor) {
  return (
    /^\d{6,}$/.test(anchor.partNumber) &&
    /^\d$/.test(anchor.colorId) &&
    anchor.partNumber.endsWith(anchor.colorId)
  )
}

function scoreStudioGridPartColor(cell: StudioGridCell, anchor: PartColorAnchor) {
  const anchorCenterX = getBboxCenterX(cell.anchor.region)
  const verticalDistance = Math.min(
    Math.abs(anchor.line.centerY - cell.anchor.region.y0),
    Math.abs(anchor.line.centerY - cell.anchor.region.y1),
  )
  const highAbovePenalty = anchor.line.centerY < cell.anchor.region.y0 - 150 ? 180 : 0

  return Math.abs(anchor.line.centerX - anchorCenterX) * 1.3 + verticalDistance + highAbovePenalty
}

function selectStudioGridCellQuantity(
  cell: StudioGridCell,
  partColor: PartColorAnchor,
  quantityCandidates: readonly GridQuantityCandidate[],
) {
  return quantityCandidates
    .filter((candidate) => candidate.line !== partColor.line)
    .filter((candidate) => isLineInStudioGridCell(candidate.line, cell))
    .filter((candidate) => getAlignedPartColorTokens(candidate.line.normalizedText).length === 0)
    .sort(
      (left, right) =>
        scoreStudioGridQuantityCandidate(cell, partColor, left) -
        scoreStudioGridQuantityCandidate(cell, partColor, right),
    )[0] ?? null
}

function scoreStudioGridQuantityCandidate(
  cell: StudioGridCell,
  partColor: PartColorAnchor,
  quantity: GridQuantityCandidate,
) {
  const sourcePenalty = quantity.source === "explicit" ? 0 : quantity.source === "glyph_slip" ? 28 : 62
  const belowPartColorPenalty = quantity.line.centerY > partColor.line.centerY ? 26 : 0
  const anchorCenterX = getBboxCenterX(cell.anchor.region)

  return (
    sourcePenalty +
    belowPartColorPenalty +
    Math.abs(quantity.line.centerX - partColor.line.centerX) * 0.9 +
    Math.abs(quantity.line.centerX - anchorCenterX) * 0.45 +
    Math.abs(quantity.line.centerY - partColor.line.centerY) * 0.35
  )
}

function createStudioGridCellRow(
  cell: StudioGridCell,
  partColor: PartColorAnchor,
  quantityCandidate: GridQuantityCandidate | null,
  sourceToken = "studio-grid",
) {
  const partColorLine = createPartColorAnchorLine(partColor)
  const quantity = partColor.quantity ?? quantityCandidate?.quantity ?? 0
  const row = createOcrRow({
    sourceLines: quantityCandidate ? [quantityCandidate.line, partColorLine] : [partColorLine],
    text: `${quantity} x ${partColor.partNumber} ${normalizeOcrColorText(partColor.colorId)}`,
  })

  return {
    ...row,
    partThumbnailRegion: createSourceRegionFromOcrBbox(cell.anchor.region),
    rawTokens: [sourceToken, ...row.rawTokens],
    sourceRank: -1,
  }
}

function isLineInStudioGridCell(line: PositionedOcrLine, cell: StudioGridCell) {
  return (
    line.centerX >= cell.region.x0 &&
    line.centerX <= cell.region.x1 &&
    line.centerY >= cell.region.y0 &&
    line.centerY <= cell.region.y1
  )
}

function createSourceRegionFromOcrBbox(bbox: OcrBbox): PartsListSourceRegion {
  return {
    height: Math.max(1, Math.round(bbox.y1 - bbox.y0)),
    unit: "ocr_pixel",
    width: Math.max(1, Math.round(bbox.x1 - bbox.x0)),
    x: Math.max(0, Math.round(bbox.x0)),
    y: Math.max(0, Math.round(bbox.y0)),
  }
}

function getBboxCenterX(bbox: OcrBbox) {
  return (bbox.x0 + bbox.x1) / 2
}

function getBboxCenterY(bbox: OcrBbox) {
  return (bbox.y0 + bbox.y1) / 2
}

function buildPartsListRowsFromOcrGrid(lines: readonly PositionedOcrLine[]) {
  const quantityRows = groupGridQuantityRows(getGridQuantityCandidates(lines))
  const rows: OcrReconstructedRow[] = []

  for (let rowIndex = 0; rowIndex < quantityRows.length; rowIndex += 1) {
    const quantityRow = quantityRows[rowIndex]
    const nextQuantityRow = quantityRows[rowIndex + 1]
    const yStart = Math.min(...quantityRow.map((candidate) => candidate.line.bbox.y0)) - 24
    const yEnd = nextQuantityRow
      ? Math.min(...nextQuantityRow.map((candidate) => candidate.line.bbox.y0)) - 18
      : Math.max(...quantityRow.map((candidate) => candidate.line.bbox.y1)) + 150
    const sortedQuantityRow = [...quantityRow].sort((left, right) => left.line.centerX - right.line.centerX)

    for (let index = 0; index < sortedQuantityRow.length; index += 1) {
      const quantity = sortedQuantityRow[index]
      const previousQuantity = sortedQuantityRow[index - 1]
      const nextQuantity = sortedQuantityRow[index + 1]
      const xStart = previousQuantity
        ? midpoint(previousQuantity.line.centerX, quantity.line.centerX)
        : quantity.line.centerX - 300
      const xEnd = nextQuantity
        ? midpoint(quantity.line.centerX, nextQuantity.line.centerX)
        : quantity.line.centerX + 300
      const cellLines = lines.filter(
        (line) =>
          line.centerY >= yStart &&
          line.centerY <= yEnd &&
          lineOverlapsCellX(line, xStart, xEnd),
      )
      const row = createRowFromOcrGridCell(quantity, cellLines)

      if (row) {
        addOcrRow(rows, row)
      }
    }
  }

  return rows
}

function getGridQuantityCandidates(lines: readonly PositionedOcrLine[]): GridQuantityCandidate[] {
  return lines.flatMap((line): GridQuantityCandidate[] => {
    const explicitQuantity = getQuantityFromOcrLine(line.normalizedText, { allowGlyphSlips: true })
    if (explicitQuantity) {
      return [
        {
          line,
          quantity: explicitQuantity,
          source: isOcrQuantityGlyphSlip(line.normalizedText) ? "glyph_slip" : "explicit",
        },
      ]
    }

    const bareQuantity = getQuantityFromOcrLine(line.normalizedText, { allowBareNumber: true })
    if (bareQuantity && bareQuantity <= 9 && line.normalizedText.length <= 2) {
      return [{ line, quantity: bareQuantity, source: "bare" as const }]
    }

    return []
  })
}

function groupGridQuantityRows(quantityCandidates: readonly GridQuantityCandidate[]) {
  const rows: GridQuantityCandidate[][] = []

  for (const quantityCandidate of [...quantityCandidates].sort((left, right) => left.line.centerY - right.line.centerY)) {
    const row = rows.find(
      (candidateRow) =>
        Math.abs(getAverageGridRowCenterY(candidateRow) - quantityCandidate.line.centerY) <= 70,
    )

    if (row) {
      row.push(quantityCandidate)
    } else {
      rows.push([quantityCandidate])
    }
  }

  return rows
}

function getAverageGridRowCenterY(row: readonly GridQuantityCandidate[]) {
  return row.reduce((total, candidate) => total + candidate.line.centerY, 0) / Math.max(1, row.length)
}

function midpoint(left: number, right: number) {
  return (left + right) / 2
}

function lineOverlapsCellX(line: PositionedOcrLine, xStart: number, xEnd: number) {
  return line.centerX >= xStart && line.centerX <= xEnd
}

function createRowFromOcrGridCell(
  quantity: GridQuantityCandidate,
  cellLines: readonly PositionedOcrLine[],
) {
  const partLine = findGridPartLine(quantity.line, cellLines)
  if (!partLine) {
    return null
  }

  const colorLine = partLine.colorText ? null : findGridColorLine(partLine.line, cellLines)
  const colorText = normalizeOcrColorTextForPartLine({
    colorLine,
    colorText: colorLine?.normalizedText ?? partLine.colorText,
    partLine: partLine.line,
  })

  if (!colorText) {
    return null
  }

  const sourceLines = colorLine
    ? [quantity.line, partLine.line, colorLine]
    : [quantity.line, partLine.line]

  return createOcrRow({
    sourceLines,
    text: `${quantity.quantity} x ${partLine.partNumber} ${colorText}`.trim(),
  })
}

function findGridPartLine(
  quantityLine: PositionedOcrLine,
  cellLines: readonly PositionedOcrLine[],
): PartLineMatch | null {
  return cellLines
    .map((line): PartLineMatch | null => {
      if (line === quantityLine || line.centerY < quantityLine.centerY - 24) {
        return null
      }

      if (getQuantityFromOcrLine(line.normalizedText)) {
        return null
      }

      const partNumber = getPartNumberFromOcrLine(line.normalizedText)
      if (!partNumber) {
        return null
      }
      const colorText = removePartNumberFromOcrLine(line.normalizedText, partNumber)

      return {
        colorText,
        line,
        partNumber,
      }
    })
    .filter((line): line is PartLineMatch => Boolean(line))
    .sort((left, right) => {
      const leftColorScore = hasOcrColorWord(left.colorText) ? 0 : 1
      const rightColorScore = hasOcrColorWord(right.colorText) ? 0 : 1

      return (
        leftColorScore - rightColorScore ||
        Math.abs(left.line.centerY - quantityLine.centerY) - Math.abs(right.line.centerY - quantityLine.centerY) ||
        Math.abs(left.line.centerX - quantityLine.centerX) - Math.abs(right.line.centerX - quantityLine.centerX)
      )
    })[0] ?? null
}

function findGridColorLine(
  partLine: PositionedOcrLine,
  cellLines: readonly PositionedOcrLine[],
) {
  return cellLines
    .filter((line) => {
      if (line === partLine || getQuantityFromOcrLine(line.normalizedText)) {
        return false
      }

      return Boolean(getSequentialColorText(line.normalizedText) ?? hasOcrColorWord(line.normalizedText))
    })
    .sort(
      (left, right) =>
        Math.abs(left.centerY - partLine.centerY) - Math.abs(right.centerY - partLine.centerY) ||
        Math.abs(left.centerX - partLine.centerX) - Math.abs(right.centerX - partLine.centerX),
    )[0]
}

export function buildPartsListTextFromAlignedOcrText(text: string) {
  return buildPartsListRowsFromAlignedOcrText(text).map((row) => row.text).join("\n")
}

function buildPartsListRowsFromOcrTextVariants(textVariants: readonly string[]) {
  const rows: OcrReconstructedRow[] = []

  for (const textVariant of textVariants) {
    for (const row of buildPartsListRowsFromAlignedOcrText(textVariant)) {
      addOcrRow(rows, row)
    }
  }

  return rows
}

function buildPartsListRowsFromAlignedOcrText(text: string) {
  const rows: OcrReconstructedRow[] = []
  const lines = text
    .replace(/\u00d7/g, "x")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)

  addSequentialSparseRows(rows, lines)
  addPreviousFusedQuantityPartFirstRows(rows, lines)
  addSequentialPartFirstRows(rows, lines)
  addFusedColorPartRows(rows, lines)
  addRepeatedQuantityFusedColorPartRows(rows, lines)

  for (const line of lines) {
    for (const row of getGroupedInlinePartColorRowsFromOcrLine(line)) {
      addOcrRow(
        rows,
        createTextOnlyOcrRow({
          rawTokens: [line],
          text: `${row.quantity} x ${row.partNumber} ${normalizeOcrColorText(row.colorText)}`.trim(),
        }),
      )
    }
  }

  for (let index = 0; index < lines.length - 1; index += 1) {
    const quantityTokens = getAlignedQuantityTokens(lines[index])
    const studioQuantityTokens =
      quantityTokens.length > 0
        ? quantityTokens
        : getAlignedStudioQuantityGlyphSlipTokens(lines[index] ?? "")
    if (studioQuantityTokens.length === 0) {
      continue
    }

    let matchedPartColorLine = false
    for (let partLineIndex = index + 1; partLineIndex < Math.min(lines.length, index + 3); partLineIndex += 1) {
      const partColorTokens = getAlignedPartColorTokens(lines[partLineIndex])
      if (partColorTokens.length === 0) {
        continue
      }

      matchedPartColorLine = true
      for (const { partColorToken, quantityToken } of pairAlignedTokens(partColorTokens, studioQuantityTokens)) {
        addOcrRow(
          rows,
          createTextOnlyOcrRow({
            rawTokens: [lines[index] ?? "", lines[partLineIndex] ?? ""],
            text: `${quantityToken.quantity} x ${partColorToken.partNumber} ${normalizeOcrColorText(
              partColorToken.colorId,
            )}`,
          }),
        )
      }

      break
    }

    if (!matchedPartColorLine && quantityTokens.length > 0) {
      addAlignedNamedColorRows(rows, lines, index, quantityTokens)
    }
  }

  return [...rows.values()]
}

function getPositionedOcrLines(blocks: readonly OcrBlock[]) {
  const lines = blocks
    .flatMap((block) => {
      const paragraphLines = block.paragraphs?.flatMap((paragraph) => paragraph.lines ?? []) ?? []
      const sourceRank = block.sourceRank ?? 0

      return paragraphLines.length > 0
        ? paragraphLines.map((line) => ({ ...line, sourceRank: line.sourceRank ?? sourceRank }))
        : [{ ...block, sourceRank }]
    })
    .map((line): PositionedOcrLine | null => {
      const bbox = line.bbox
      const normalizedText = normalizeOcrText(line.text ?? "").replace(/\s+/g, " ")

      if (!bbox || !normalizedText || bbox.x1 <= bbox.x0 || bbox.y1 <= bbox.y0) {
        return null
      }

      return {
        bbox,
        centerX: (bbox.x0 + bbox.x1) / 2,
        centerY: (bbox.y0 + bbox.y1) / 2,
        normalizedText,
        sourceRank: line.sourceRank ?? 0,
      }
    })
    .filter((line): line is PositionedOcrLine => Boolean(line))

  return expandFusedQuantityLines(lines)
    .sort((left, right) => left.bbox.y0 - right.bbox.y0 || left.bbox.x0 - right.bbox.x0)
}

function expandFusedQuantityLines(lines: readonly PositionedOcrLine[]) {
  return lines.flatMap((line) => {
    const fusedQuantity = getTrailingFusedQuantity(line.normalizedText)
    if (!fusedQuantity) {
      return [line]
    }

    return [
      line,
      createSyntheticPositionedLine({
        end: fusedQuantity.end,
        line,
        start: fusedQuantity.start,
        text: `${fusedQuantity.quantity}x`,
      }),
    ]
  })
}

function getTrailingFusedQuantity(text: string) {
  if (!hasOcrColorWord(text)) {
    return null
  }

  const match = text.match(/(\d{1,5})\s*x$/i)
  const quantity = match ? Number(match[1]) : null
  if (!match || !quantity || !Number.isInteger(quantity) || quantity <= 0 || match.index === undefined) {
    return null
  }

  return {
    end: match.index + match[0].length,
    quantity,
    start: match.index,
  }
}

function createSyntheticPositionedLine({
  end,
  line,
  start,
  text,
}: {
  end: number
  line: PositionedOcrLine
  start: number
  text: string
}): PositionedOcrLine {
  const textLength = Math.max(1, line.normalizedText.length)
  const width = line.bbox.x1 - line.bbox.x0
  const x0 = line.bbox.x0 + width * (start / textLength)
  const x1 = line.bbox.x0 + width * (end / textLength)

  return {
    bbox: {
      x0,
      x1,
      y0: line.bbox.y0,
      y1: line.bbox.y1,
    },
    centerX: (x0 + x1) / 2,
    centerY: line.centerY,
    normalizedText: text,
    sourceRank: line.sourceRank,
  }
}

function findPartLineForQuantity(
  quantityLine: PositionedOcrLine,
  lines: readonly PositionedOcrLine[],
): PartLineMatch | undefined {
  const strictMatches = findPartLineMatchesForQuantity(quantityLine, lines, 95)
  if (strictMatches.length > 0) {
    return strictMatches[0]
  }

  return findPartLineMatchesForQuantity(quantityLine, lines, 140)
    .filter((line) => line.colorText.length > 0)[0]
}

function findPartLineMatchesForQuantity(
  quantityLine: PositionedOcrLine,
  lines: readonly PositionedOcrLine[],
  maxColumnDistance: number,
) {
  const maxVerticalDistance = Math.max(95, getLineHeight(quantityLine) * 5)

  return lines
    .map((line): PartLineMatch | null => {
      if (
        line.bbox.y0 <= quantityLine.bbox.y0 ||
        line.bbox.y0 - quantityLine.bbox.y0 > maxVerticalDistance
      ) {
        return null
      }

      if (!isSameLabelColumn(quantityLine, line, maxColumnDistance)) {
        return null
      }

      const partNumber = getPartNumberFromOcrLine(line.normalizedText)
      if (!partNumber) {
        return null
      }
      const colorText = removePartNumberFromOcrLine(line.normalizedText, partNumber)
      if (hasOcrColorWord(colorText) && hasInterveningQuantityLine(quantityLine, line, lines, maxColumnDistance)) {
        return null
      }

      return {
        colorText,
        line,
        partNumber,
      }
    })
    .filter((line): line is PartLineMatch => Boolean(line))
    .sort(
      (left, right) =>
        scoreLineProximity(quantityLine, left.line) - scoreLineProximity(quantityLine, right.line),
    )
}

function hasInterveningQuantityLine(
  quantityLine: PositionedOcrLine,
  partLine: PositionedOcrLine,
  lines: readonly PositionedOcrLine[],
  maxColumnDistance: number,
) {
  return lines.some((line) => {
    if (
      line === quantityLine ||
      line === partLine ||
      line.bbox.y0 <= quantityLine.bbox.y0 ||
      line.bbox.y0 >= partLine.bbox.y0
    ) {
      return false
    }

    const quantity = getQuantityFromOcrLine(line.normalizedText, { allowGlyphSlips: true })
    if (!quantity) {
      return false
    }

    return isSameLabelColumn(partLine, line, maxColumnDistance)
  })
}

function findColorLineForPart(partLine: PositionedOcrLine, lines: readonly PositionedOcrLine[]) {
  const maxVerticalDistance = Math.max(75, getLineHeight(partLine) * 4)

  return lines
    .filter((line) => {
      if (line.bbox.y0 <= partLine.bbox.y0 || line.bbox.y0 - partLine.bbox.y0 > maxVerticalDistance) {
        return false
      }

      if (!isSameLabelColumn(partLine, line, 115)) {
        return false
      }

      if (getQuantityFromOcrLine(line.normalizedText)) {
        return false
      }

      return !isLikelyManualPartNumber(normalizeOcrPartNumber(line.normalizedText))
    })
    .sort((left, right) => scoreLineProximity(partLine, left) - scoreLineProximity(partLine, right))[0]
}

function buildPartColorAnchorRows(lines: readonly PositionedOcrLine[]) {
  const anchors = getPartColorAnchors(lines)
  const anchorCountByLine = getPartColorAnchorCountByLine(anchors)
  const assignedAnchors = new Set<PartColorAnchor>()
  const assignedQuantityLines = new Set<PositionedOcrLine>()
  const rows: OcrReconstructedRow[] = []

  for (const anchor of anchors) {
    if (!anchor.quantity) {
      continue
    }

    assignedAnchors.add(anchor)
    addOcrRow(rows, createPartColorAnchorRow(anchor, anchor.quantity, null))
  }

  const pairs = anchors
    .filter((anchor) => !assignedAnchors.has(anchor))
    .flatMap((anchor) => getPartColorAnchorQuantityPairs(anchor, lines))
    .sort((left, right) => left.score - right.score)

  for (const pair of pairs) {
    if (assignedAnchors.has(pair.anchor) || !pair.quantityLine || assignedQuantityLines.has(pair.quantityLine)) {
      continue
    }

    assignedAnchors.add(pair.anchor)
    assignedQuantityLines.add(pair.quantityLine)
    addOcrRow(rows, createPartColorAnchorRow(pair.anchor, pair.quantity, pair.quantityLine))
  }

  for (const anchor of anchors) {
    if (assignedAnchors.has(anchor) || anchorCountByLine.get(anchor.line) !== 1) {
      continue
    }

    const trailingQuantity = getTrailingQuantityFromPartColorLine(anchor.line.normalizedText, anchor)
    if (!trailingQuantity) {
      continue
    }

    assignedAnchors.add(anchor)
    addOcrRow(rows, createPartColorAnchorRow(anchor, trailingQuantity, null))
  }

  return rows
}

function getPartColorAnchors(lines: readonly PositionedOcrLine[]) {
  return lines.flatMap((line) =>
    getPartColorsFromOcrLine(line.normalizedText).map((partColor) => ({
      ...partColor,
      line,
    })),
  )
}

function getPartColorAnchorCountByLine(anchors: readonly PartColorAnchor[]) {
  const countByLine = new Map<PositionedOcrLine, number>()
  for (const anchor of anchors) {
    countByLine.set(anchor.line, (countByLine.get(anchor.line) ?? 0) + 1)
  }

  return countByLine
}

function getPartColorAnchorQuantityPairs(anchor: PartColorAnchor, lines: readonly PositionedOcrLine[]) {
  const partLabelX = getPartColorAnchorPartLabelX(anchor)
  const maxVerticalDistance = Math.max(55, getLineHeight(anchor.line) * 3)

  return lines
    .map((line): PartColorAnchorQuantityPair | null => {
      if (
        line.bbox.y0 >= anchor.line.bbox.y0 ||
        anchor.line.bbox.y0 - line.bbox.y0 > maxVerticalDistance
      ) {
        return null
      }

      if (!isSamePartColorAnchorColumn(partLabelX, anchor.line, line, 95)) {
        return null
      }

      const explicitQuantity = getQuantityFromOcrLine(line.normalizedText, {
        allowGlyphSlips: true,
        weQuantity: 4,
      })
      const bareQuantityCandidate = explicitQuantity
        ? null
        : getQuantityFromOcrLine(line.normalizedText, { allowBareNumber: true })
      const bareQuantity =
        bareQuantityCandidate && bareQuantityCandidate <= 9 ? bareQuantityCandidate : null
      const quantity = explicitQuantity ?? bareQuantity
      if (!quantity) {
        return null
      }

      const sourcePenalty = explicitQuantity ? 0 : 120
      const verticalDistance = anchor.line.bbox.y0 - line.bbox.y0
      const horizontalDistance = Math.min(
        Math.abs(line.bbox.x0 - anchor.line.bbox.x0),
        Math.abs(line.centerX - anchor.line.centerX),
        Math.abs(line.bbox.x0 - partLabelX),
        Math.abs(line.centerX - partLabelX),
      )

      return {
        anchor,
        quantity,
        quantityLine: line,
        score: sourcePenalty + verticalDistance + horizontalDistance * 1.6,
      }
    })
    .filter((pair): pair is PartColorAnchorQuantityPair => Boolean(pair))
}

function createPartColorAnchorRow(
  anchor: PartColorAnchor,
  quantity: number,
  quantityLine: PositionedOcrLine | null,
) {
  const anchorLine = createPartColorAnchorLine(anchor)

  return createOcrRow({
    sourceLines: quantityLine ? [quantityLine, anchorLine] : [anchorLine],
    text: `${quantity} x ${anchor.partNumber} ${normalizeOcrColorText(anchor.colorId)}`,
  })
}

function createPartColorAnchorLine(anchor: PartColorAnchor) {
  return createSyntheticPositionedLine({
    end: anchor.matchEnd,
    line: anchor.line,
    start: anchor.matchStart,
    text: anchor.line.normalizedText.slice(anchor.matchStart, anchor.matchEnd),
  })
}

function getPartColorAnchorPartLabelX(anchor: PartColorAnchor) {
  const textLength = Math.max(1, anchor.line.normalizedText.length)
  const width = anchor.line.bbox.x1 - anchor.line.bbox.x0

  return anchor.line.bbox.x0 + width * (anchor.matchStart / textLength)
}

function isSamePartColorAnchorColumn(
  partLabelX: number,
  anchorLine: PositionedOcrLine,
  quantityLine: PositionedOcrLine,
  maxDistance: number,
) {
  return (
    isSameLabelColumn(anchorLine, quantityLine, maxDistance) ||
    Math.abs(quantityLine.bbox.x0 - partLabelX) <= maxDistance ||
    Math.abs(quantityLine.centerX - partLabelX) <= maxDistance
  )
}

function getPartColorsFromOcrLine(text: string) {
  const normalizedText = normalizeOcrComparableText(text)
  const partColors: { colorId: string; matchEnd: number; matchStart: number; partNumber: string; quantity: number | null }[] =
    []
  const partColorPattern =
    /(^|[^a-z0-9])(?:(\d{1,5})\s*(?:x|X)\s*)?(\d[a-z0-9cpbrat\s]{2,}?)\s*[,.;:]\s*(\d{1,3})(?=$|[^a-z0-9])/g

  let match: RegExpExecArray | null
  while ((match = partColorPattern.exec(normalizedText))) {
    const partNumber = normalizeOcrPartNumber(match[3] ?? "")
    if (!isLikelyOcrPartNumber(partNumber)) {
      continue
    }

    const quantity = match[2] ? Number(match[2]) : null
    const matchStart = match.index + (match[1]?.length ?? 0)
    partColors.push({
      colorId: match[4] ?? "",
      matchEnd: match.index + match[0].length,
      matchStart,
      partNumber,
      quantity: quantity && Number.isInteger(quantity) && quantity > 0 ? quantity : null,
    })
  }

  return partColors.map(({ colorId, matchEnd, matchStart, partNumber, quantity }) => ({
    colorId,
    matchEnd,
    matchStart,
    partNumber,
    quantity,
  }))
}

function getTrailingQuantityFromPartColorLine(
  text: string,
  partColor: { matchEnd?: number; quantity: number | null },
) {
  if (partColor.quantity || partColor.matchEnd === undefined) {
    return null
  }

  const normalizedText = text.toLowerCase().replace(/[¢©]/g, "c")
  const trailingQuantity = normalizedText
    .slice(partColor.matchEnd)
    .match(/^\s+(\d{1,5})\s*(?:x|X)(?=$|[^a-z0-9])/)
  const quantity = trailingQuantity ? Number(trailingQuantity[1]) : null

  return quantity && Number.isInteger(quantity) && quantity > 0 ? quantity : null
}

function getInlinePartColorRowsFromOcrLine(text: string) {
  const rows: {
    colorText: string
    end: number
    partNumber: string
    quantity: number
    rawText: string
    start: number
  }[] = []
  const normalizedText = text
    .replace(/[¢©]/g, "c")
    .replace(/([a-z])(\d{1,5}\s*x\s*\d)/gi, "$1 $2")
  const inlinePartColorPattern =
    /(^|[^a-z0-9])(\d{1,5})\s*x\s*(\d[a-z0-9cpbrat]{2,})\s+([a-z][a-z\s]{2,}?)(?=\s*\d{1,5}\s*x\s*\d|$)/gi

  let match: RegExpExecArray | null
  while ((match = inlinePartColorPattern.exec(normalizedText))) {
    const leadingSeparator = match[1] ?? ""
    const quantity = Number(match[2])
    const partNumber = normalizeOcrPartNumber(match[3] ?? "")
    const colorText = (match[4] ?? "").replace(/\s+/g, " ").trim()

    if (!Number.isInteger(quantity) || quantity <= 0 || !isLikelyManualPartNumber(partNumber)) {
      continue
    }

    if (!hasOcrColorWord(colorText)) {
      continue
    }

    const start = match.index + leadingSeparator.length
    const rawText = normalizedText.slice(start, match.index + match[0].length).trim()
    rows.push({
      colorText,
      end: start + rawText.length,
      partNumber,
      quantity,
      rawText,
      start,
    })
  }

  return rows
}

function getGroupedInlinePartColorRowsFromOcrLine(text: string) {
  const quantityTokens = getAlignedQuantityTokens(text)
  const partNumberTokens = getAlignedPartNumberTokens(text)
  const colorTokens = getOcrColorPhraseTokens(text)
  const tokenCount = quantityTokens.length

  if (
    tokenCount < 2 ||
    partNumberTokens.length !== tokenCount ||
    colorTokens.length !== tokenCount
  ) {
    return []
  }

  const firstPartStart = partNumberTokens[0]?.start ?? 0
  const firstColorStart = colorTokens[0]?.start ?? 0
  if (firstPartStart <= quantityTokens.at(-1)!.start || firstColorStart <= firstPartStart) {
    return []
  }

  return quantityTokens.map((quantityToken, index) => ({
    colorText: colorTokens[index]!.text,
    partNumber: partNumberTokens[index]!.partNumber,
    quantity: quantityToken.quantity,
  }))
}

function getOcrColorPhraseTokens(text: string) {
  const tokens: { start: number; text: string }[] = []
  const colorPhrasePattern =
    /\b(?:dark\s+bluish\s+gr[ae]y|dark\s+sis\s+gr[ae]y|light\s+bluish\s+gr[ae]y|trans[-\s]+dark\s+blue|trans[-\s]+medium\s+blue|trans[-\s]+light\s+blue|trans[-\s]+neon\s+orange|trans[-\s]+orange|trans[-\s]+yellow|trans[-\s]+brown|trans[-\s]+clear|trans[-\s]+red|glowing\s+neon\s+yellow|glowing\s+neon\s+red|pearl\s+dark\s+gr[ae]y|pearl\s+gold|reddish\s+brown|medium\s+nougat|bright\s+light\s+orange|bright\s+light\s+yellow|bright\s+light\s+blue|bright\s+green|dark\s+turquoise|dark\s+purple|dark\s+orange|dark\s+azure|dark\s+brown|dark\s+gray|dark\s+tan|light\s+gray|flat\s+silver|black|brown|blue|green|magenta|orange|tan|red|white|yellow)\b/gi

  let match: RegExpExecArray | null
  while ((match = colorPhrasePattern.exec(text))) {
    tokens.push({
      start: match.index,
      text: match[0].replace(/\s+/g, " ").trim(),
    })
  }

  return tokens
}

function addAlignedNamedColorRows(
  rows: OcrReconstructedRow[],
  lines: readonly string[],
  quantityLineIndex: number,
  quantityTokens: readonly AlignedQuantityToken[],
) {
  for (
    let partLineIndex = quantityLineIndex + 1;
    partLineIndex < Math.min(lines.length, quantityLineIndex + 3);
    partLineIndex += 1
  ) {
    if (hasBareNumericSequentialInterruption(lines, quantityLineIndex + 1, partLineIndex)) {
      continue
    }

    const partNumberTokens = getAlignedPartNumberTokens(lines[partLineIndex])
    if (partNumberTokens.length === 0 || getAlignedQuantityTokens(lines[partLineIndex]).length > 0) {
      continue
    }

    const pairedTokens = pairAlignedTokens(partNumberTokens, quantityTokens)
    if (pairedTokens.length === 0) {
      continue
    }

    for (
      let colorLineIndex = partLineIndex;
      colorLineIndex < Math.min(lines.length, partLineIndex + 3);
      colorLineIndex += 1
    ) {
      const colorRows = createAlignedNamedColorRows({
        colorLine: lines[colorLineIndex] ?? "",
        partLine: lines[partLineIndex] ?? "",
        partNumberTokens,
        pairedTokens,
        sameLine: colorLineIndex === partLineIndex,
      })

      if (colorRows.length === 0) {
        continue
      }

      for (const colorRow of colorRows) {
        addOcrRow(
          rows,
          createTextOnlyOcrRow({
            rawTokens: lines.slice(quantityLineIndex, colorLineIndex + 1),
            text: `${colorRow.quantity} x ${colorRow.partNumber} ${normalizeOcrColorText(
              colorRow.colorText,
            )}`.trim(),
          }),
        )
      }

      return
    }
  }
}

function createAlignedNamedColorRows({
  colorLine,
  partLine,
  partNumberTokens,
  pairedTokens,
  sameLine,
}: {
  colorLine: string
  partLine: string
  partNumberTokens: readonly AlignedPartNumberToken[]
  pairedTokens: readonly {
    partColorToken: AlignedPartNumberToken
    quantityToken: AlignedQuantityToken
  }[]
  sameLine: boolean
}) {
  const rows: { colorText: string; partNumber: string; quantity: number }[] = []

  for (const { partColorToken, quantityToken } of pairedTokens) {
    const tokenIndex = partNumberTokens.indexOf(partColorToken)
    const nextToken = partNumberTokens[tokenIndex + 1]
    const cellStart = sameLine ? partColorToken.end : Math.max(0, partColorToken.start - 3)
    const cellEnd = nextToken ? Math.max(cellStart, nextToken.start) : colorLine.length
    const colorText = trimOcrColorText(
      colorLine
        .slice(cellStart, cellEnd)
        .replace(partLine.slice(partColorToken.start, partColorToken.end), ""),
    )

    if (!hasOcrColorWord(colorText)) {
      continue
    }

    rows.push({
      colorText,
      partNumber: partColorToken.partNumber,
      quantity: quantityToken.quantity,
    })
  }

  return rows
}

function addRepeatedQuantityFusedColorPartRows(rows: OcrReconstructedRow[], lines: readonly string[]) {
  for (let quantityLineIndex = 0; quantityLineIndex < lines.length - 2; quantityLineIndex += 1) {
    const quantityLine = lines[quantityLineIndex] ?? ""
    const quantityTokens = getSequentialQuantityTokens(quantityLine, quantityLineIndex)
    if (
      quantityTokens.length !== 1 ||
      getAlignedPartNumberTokens(quantityLine).length > 0 ||
      hasOcrColorWord(quantityLine)
    ) {
      continue
    }

    const fusedPartCluster = getRepeatedQuantityFusedColorPartCluster(lines, quantityLineIndex)
    if (!fusedPartCluster) {
      continue
    }

    for (const part of fusedPartCluster.parts) {
      addOcrRow(
        rows,
        createTextOnlyOcrRow({
          rawTokens: lines.slice(quantityLineIndex, fusedPartCluster.endLineIndex + 1),
          text: `${quantityTokens[0]!.quantity} x ${part.partNumber} ${normalizeOcrColorText(
            fusedPartCluster.colorText,
          )}`.trim(),
        }),
      )
    }
  }
}

function addFusedColorPartRows(rows: OcrReconstructedRow[], lines: readonly string[]) {
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? ""
    const trailingPartNumber = getTrailingFusedPartNumberAfterColorPhrase(line)
    if (!trailingPartNumber) {
      continue
    }

    const quantityToken = findQuantityForFusedColorPartLine(lines, lineIndex)
    if (!quantityToken) {
      continue
    }

    addOcrRow(
      rows,
      createTextOnlyOcrRow({
        rawTokens: [lines[quantityToken.lineIndex] ?? "", line],
        text: `${quantityToken.quantity} x ${trailingPartNumber.partNumber} ${normalizeOcrColorText(
          trailingPartNumber.colorText,
        )}`.trim(),
      }),
    )
  }
}

function findQuantityForFusedColorPartLine(lines: readonly string[], lineIndex: number) {
  const previousQuantityTokens: SequentialQuantityToken[] = []

  for (let candidateIndex = Math.max(0, lineIndex - 3); candidateIndex < lineIndex; candidateIndex += 1) {
    const line = lines[candidateIndex] ?? ""
    if (getAlignedPartNumberTokens(line).length > 0 || getSequentialColorText(line)) {
      previousQuantityTokens.length = 0
      continue
    }

    const quantityTokens = getSequentialQuantityTokens(line, candidateIndex)
    if (quantityTokens.length === 1) {
      previousQuantityTokens.push(quantityTokens[0]!)
    }
  }

  if (previousQuantityTokens.length === 0) {
    return null
  }

  const previousLine = lines[lineIndex - 1] ?? ""
  const previousPartLine = lines[lineIndex - 2] ?? ""
  const quantityBeforePreviousPart = lines[lineIndex - 3] ?? ""
  if (
    getSequentialQuantityTokens(previousLine, lineIndex - 1).length === 1 &&
    !getSequentialColorText(previousPartLine) &&
    getSequentialPartTokens(previousPartLine, lineIndex - 2).length === 1
  ) {
    const earlierQuantity = getSequentialQuantityTokens(quantityBeforePreviousPart, lineIndex - 3)[0]
    if (earlierQuantity) {
      return earlierQuantity
    }
  }

  const nextLine = lines[lineIndex + 1] ?? ""
  if (previousQuantityTokens.length >= 2 && getSequentialPartTokens(nextLine, lineIndex + 1).length === 1) {
    return previousQuantityTokens.at(-2) ?? null
  }

  return previousQuantityTokens.at(-1) ?? null
}

function getRepeatedQuantityFusedColorPartCluster(
  lines: readonly string[],
  quantityLineIndex: number,
) {
  const parts: { lineIndex: number; partNumber: string }[] = []

  for (
    let lineIndex = quantityLineIndex + 1;
    lineIndex < Math.min(lines.length, quantityLineIndex + 7);
    lineIndex += 1
  ) {
    const line = lines[lineIndex] ?? ""
    if (getAlignedQuantityTokens(line).length > 0) {
      return null
    }

    const trailingPartNumber = getTrailingFusedPartNumberAfterColorPhrase(line)
    if (trailingPartNumber) {
      parts.push({ lineIndex, partNumber: trailingPartNumber.partNumber })

      return parts.length >= 2
        ? extendRepeatedQuantityFusedColorPartCluster({
            colorText: trailingPartNumber.colorText,
            endLineIndex: lineIndex,
            lines,
            parts,
            quantityLineIndex,
          })
        : null
    }

    if (getSequentialColorText(line)) {
      if (parts.length > 0) {
        continue
      }

      return null
    }

    const partTokens = getAlignedPartNumberTokens(line)
    if (partTokens.length === 1) {
      parts.push({ lineIndex, partNumber: partTokens[0]!.partNumber })
      continue
    }

    if (partTokens.length > 1 || /\S/.test(line)) {
      return null
    }
  }

  return null
}

function extendRepeatedQuantityFusedColorPartCluster({
  colorText,
  endLineIndex,
  lines,
  parts,
  quantityLineIndex,
}: {
  colorText: string
  endLineIndex: number
  lines: readonly string[]
  parts: { lineIndex: number; partNumber: string }[]
  quantityLineIndex: number
}) {
  const normalizedColorText = getSequentialColorText(colorText)
  if (!normalizedColorText) {
    return {
      colorText,
      endLineIndex,
      parts,
    }
  }

  let scanLineIndex = endLineIndex + 1
  while (scanLineIndex < Math.min(lines.length, quantityLineIndex + 9)) {
    const line = lines[scanLineIndex] ?? ""
    if (getAlignedQuantityTokens(line).length > 0) {
      break
    }

    const lineColorText = getSequentialColorText(line)
    if (lineColorText) {
      if (lineColorText !== normalizedColorText) {
        break
      }

      endLineIndex = scanLineIndex
      scanLineIndex += 1
      continue
    }

    const partTokens = getAlignedPartNumberTokens(line)
    if (partTokens.length !== 1) {
      break
    }

    const colorLineIndex = findFollowingRepeatedQuantityClusterColorLine(
      lines,
      scanLineIndex,
      normalizedColorText,
    )
    if (colorLineIndex < 0) {
      break
    }

    parts.push({ lineIndex: scanLineIndex, partNumber: partTokens[0]!.partNumber })
    endLineIndex = colorLineIndex
    scanLineIndex = colorLineIndex + 1
  }

  return {
    colorText,
    endLineIndex,
    parts,
  }
}

function findFollowingRepeatedQuantityClusterColorLine(
  lines: readonly string[],
  partLineIndex: number,
  expectedColorText: string,
) {
  for (
    let lineIndex = partLineIndex + 1;
    lineIndex < Math.min(lines.length, partLineIndex + 3);
    lineIndex += 1
  ) {
    const line = lines[lineIndex] ?? ""
    if (getAlignedQuantityTokens(line).length > 0 || getAlignedPartNumberTokens(line).length > 0) {
      return -1
    }

    const colorText = getSequentialColorText(line)
    if (colorText) {
      return colorText === expectedColorText ? lineIndex : -1
    }
  }

  return -1
}

function addSequentialSparseRows(rows: OcrReconstructedRow[], lines: readonly string[]) {
  const pendingQuantities: SequentialQuantityToken[] = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? ""
    const quantityTokens = getSequentialQuantityTokens(line, lineIndex)
    if (quantityTokens.length > 1) {
      continue
    }

    pendingQuantities.push(...quantityTokens)
    pruneStaleSequentialQuantities(pendingQuantities, lineIndex)

    const partTokens = getSequentialPartTokens(line, lineIndex)
    if (partTokens.length > 1) {
      continue
    }

    for (const partToken of partTokens) {
      const eligibleQuantityTokens = pendingQuantities
        .map((quantityToken, index) => ({
          fused: Boolean(quantityToken.fused),
          index,
          lineDistance: lineIndex - quantityToken.lineIndex,
          xDistance: Math.abs(quantityToken.start - partToken.start),
        }))
        .filter(({ lineDistance }) => lineDistance >= 0 && lineDistance <= 6)
      const quantityIndex = selectSequentialQuantityIndex({
        eligibleQuantityTokens,
        lines,
        partToken,
      })
      if (quantityIndex < 0) {
        continue
      }

      const quantityToken = pendingQuantities[quantityIndex]
      if (
        quantityToken &&
        hasBareNumericSequentialInterruption(lines, quantityToken.lineIndex + 1, partToken.lineIndex)
      ) {
        continue
      }

      const colorText = findSequentialColorText(lines, partToken)
      if (!colorText) {
        continue
      }

      const [assignedQuantityToken] = pendingQuantities.splice(quantityIndex, 1)
      if (!assignedQuantityToken) {
        continue
      }

      addOcrRow(
        rows,
        createTextOnlyOcrRow({
          rawTokens: lines.slice(assignedQuantityToken.lineIndex, Math.min(lines.length, partToken.lineIndex + 7)),
          text: `${assignedQuantityToken.quantity} x ${partToken.partNumber} ${normalizeOcrColorText(
            colorText,
          )}`.trim(),
        }),
      )
    }
  }
}

function selectSequentialQuantityIndex({
  eligibleQuantityTokens,
  lines,
  partToken,
}: {
  eligibleQuantityTokens: {
    fused: boolean
    index: number
    lineDistance: number
    xDistance: number
  }[]
  lines: readonly string[]
  partToken: SequentialPartToken
}) {
  const trailingColorPart = Boolean(partToken.colorText)
  const previousLine = lines[partToken.lineIndex - 1] ?? ""
  const nextLine = lines[partToken.lineIndex + 1] ?? ""
  if (
    trailingColorPart &&
    eligibleQuantityTokens.length >= 2 &&
    getSequentialColorText(previousLine) &&
    getSequentialPartTokens(nextLine, partToken.lineIndex + 1).length === 1
  ) {
    return eligibleQuantityTokens
      .sort((left, right) => right.lineDistance - left.lineDistance || left.xDistance - right.xDistance)[0]?.index ?? -1
  }

  const previousQuantityTokens = getSequentialQuantityTokens(previousLine, partToken.lineIndex - 1)
  const previousPartLine = lines[partToken.lineIndex - 2] ?? ""
  const quantityBeforePreviousPart = lines[partToken.lineIndex - 3] ?? ""
  if (
    trailingColorPart &&
    previousQuantityTokens.length === 1 &&
    !getSequentialColorText(previousPartLine) &&
    getSequentialPartTokens(previousPartLine, partToken.lineIndex - 2).length === 1
  ) {
    const earlierQuantity = getSequentialQuantityTokens(quantityBeforePreviousPart, partToken.lineIndex - 3)[0]
    const earlierIndex = earlierQuantity
      ? eligibleQuantityTokens.find(({ lineDistance }) => lineDistance === partToken.lineIndex - earlierQuantity.lineIndex)?.index
      : undefined
    if (earlierIndex !== undefined) {
      return earlierIndex
    }
  }

  return (
    eligibleQuantityTokens
      .filter(({ fused }) => fused)
      .sort((left, right) => left.lineDistance - right.lineDistance || left.xDistance - right.xDistance)[0]?.index ??
    eligibleQuantityTokens.sort(
      (left, right) => left.lineDistance - right.lineDistance || left.xDistance - right.xDistance,
    )[0]?.index ??
    -1
  )
}

function hasBareNumericSequentialInterruption(
  lines: readonly string[],
  startLineIndex: number,
  endLineIndex: number,
) {
  for (let lineIndex = startLineIndex; lineIndex < endLineIndex; lineIndex += 1) {
    if (/^\s*\d{1,3}\s*$/.test(lines[lineIndex] ?? "")) {
      return true
    }
  }

  return false
}

function addPreviousFusedQuantityPartFirstRows(rows: OcrReconstructedRow[], lines: readonly string[]) {
  for (let lineIndex = 0; lineIndex < lines.length - 1; lineIndex += 1) {
    const line = lines[lineIndex] ?? ""
    const partNumber = normalizeOcrPartNumber(line.trim())
    if (!isLikelyOcrPartNumber(partNumber)) {
      continue
    }

    const colorLine = lines[lineIndex + 1] ?? ""
    const colorText = getSequentialColorText(colorLine)
    if (!colorText || getSequentialQuantityTokens(colorLine, lineIndex + 1).length === 0) {
      continue
    }

    const quantityToken = findPreviousFusedSequentialQuantity(lines, lineIndex)
    if (!quantityToken) {
      continue
    }

    addOcrRow(
      rows,
      createTextOnlyOcrRow({
        rawTokens: lines.slice(quantityToken.lineIndex, lineIndex + 2),
        text: `${quantityToken.quantity} x ${partNumber} ${normalizeOcrColorText(
          colorText,
        )}`.trim(),
      }),
    )
  }
}

function findPreviousFusedSequentialQuantity(lines: readonly string[], partLineIndex: number) {
  for (let lineIndex = partLineIndex - 1; lineIndex >= Math.max(0, partLineIndex - 4); lineIndex -= 1) {
    const line = lines[lineIndex] ?? ""
    const fusedQuantity = getTrailingFusedQuantity(line) ?? getTrailingQuantityAfterColorPrefix(line)
    if (fusedQuantity) {
      return {
        fused: true,
        lineIndex,
        quantity: fusedQuantity.quantity,
        start: fusedQuantity.start,
      }
    }

    if (getAlignedPartNumberTokens(line).length > 0) {
      continue
    }
  }

  return null
}

function getTrailingQuantityAfterColorPrefix(line: string) {
  const match = line.match(/(\d{1,5})\s*x$/i)
  const quantity = match ? Number(match[1]) : null
  if (!match || !quantity || !Number.isInteger(quantity) || quantity <= 0 || match.index === undefined) {
    return null
  }

  const colorPrefix = line.slice(0, match.index)
  if (!getSequentialColorText(colorPrefix)) {
    return null
  }

  return {
    end: match.index + match[0].length,
    quantity,
    start: match.index,
  }
}

function addSequentialPartFirstRows(rows: OcrReconstructedRow[], lines: readonly string[]) {
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? ""
    const partTokens = getSequentialPartTokens(line, lineIndex)
    if (partTokens.length !== 1) {
      continue
    }

    const [partToken] = partTokens
    if (!partToken) {
      continue
    }

    const quantityThenColorMatch = hasImmediateSequentialQuantityBeforePart(lines, partToken)
      ? null
      : findPartFirstSequentialQuantityThenColor(lines, partToken)
    if (quantityThenColorMatch) {
      addOcrRow(
        rows,
        createTextOnlyOcrRow({
          rawTokens: lines.slice(
            partToken.lineIndex,
            Math.min(lines.length, quantityThenColorMatch.colorLineIndex + 1),
          ),
          text: `${quantityThenColorMatch.quantityToken.quantity} x ${partToken.partNumber} ${normalizeOcrColorText(
            quantityThenColorMatch.colorText,
          )}`.trim(),
        }),
      )
      continue
    }

    if (!isPartFirstSequentialCandidate(partToken.partNumber)) {
      continue
    }

    const colorMatch = findPartFirstSequentialColor(lines, partToken)
    if (!colorMatch) {
      continue
    }

    const quantityToken = findPartFirstSequentialQuantity(lines, partToken.lineIndex, colorMatch.lineIndex)
    if (!quantityToken) {
      continue
    }

    addOcrRow(
      rows,
      createTextOnlyOcrRow({
        rawTokens: lines.slice(partToken.lineIndex, Math.min(lines.length, quantityToken.lineIndex + 1)),
        text: `${quantityToken.quantity} x ${partToken.partNumber} ${normalizeOcrColorText(
          colorMatch.text,
        )}`.trim(),
      }),
    )
  }
}

function isPartFirstSequentialCandidate(partNumber: string) {
  return /c\d{2}p/i.test(partNumber)
}

function hasImmediateSequentialQuantityBeforePart(lines: readonly string[], partToken: SequentialPartToken) {
  const previousLineIndex = partToken.lineIndex - 1
  if (previousLineIndex < 0) {
    return false
  }

  return getSequentialQuantityTokens(lines[previousLineIndex] ?? "", previousLineIndex).length > 0
}

function findPartFirstSequentialQuantityThenColor(lines: readonly string[], partToken: SequentialPartToken) {
  for (
    let quantityLineIndex = partToken.lineIndex + 1;
    quantityLineIndex < Math.min(lines.length, partToken.lineIndex + 5);
    quantityLineIndex += 1
  ) {
    const quantityLine = lines[quantityLineIndex] ?? ""
    if (getAlignedPartNumberTokens(quantityLine).length > 0) {
      return null
    }

    const quantityTokens = getSequentialQuantityTokens(quantityLine, quantityLineIndex)
    if (quantityTokens.length !== 1) {
      continue
    }

    for (
      let colorLineIndex = quantityLineIndex + 1;
      colorLineIndex < Math.min(lines.length, partToken.lineIndex + 7);
      colorLineIndex += 1
    ) {
      const colorLine = lines[colorLineIndex] ?? ""
      if (
        getAlignedPartNumberTokens(colorLine).length > 0 ||
        getAlignedQuantityTokens(colorLine).length > 0
      ) {
        break
      }

      const colorText = getSequentialColorText(colorLine)
      if (!colorText) {
        continue
      }

      if (hasAmbiguousSequentialColorAfter(lines, colorLineIndex)) {
        return null
      }

      return {
        colorLineIndex,
        colorText,
        quantityToken: quantityTokens[0]!,
      }
    }
  }

  return null
}

function hasAmbiguousSequentialColorAfter(lines: readonly string[], colorLineIndex: number) {
  for (
    let lineIndex = colorLineIndex + 1;
    lineIndex < Math.min(lines.length, colorLineIndex + 4);
    lineIndex += 1
  ) {
    const line = lines[lineIndex] ?? ""
    if (getAlignedPartNumberTokens(line).length > 0 || getAlignedQuantityTokens(line).length > 0) {
      return false
    }

    if (getSequentialColorText(line)) {
      return true
    }
  }

  return false
}

function findPartFirstSequentialColor(lines: readonly string[], partToken: SequentialPartToken) {
  const candidates: { lineIndex: number; text: string }[] = []

  for (
    let lineIndex = partToken.lineIndex;
    lineIndex < Math.min(lines.length, partToken.lineIndex + 6);
    lineIndex += 1
  ) {
    const line =
      lineIndex === partToken.lineIndex
        ? lines[lineIndex]?.slice(partToken.end) ?? ""
        : lines[lineIndex] ?? ""

    if (lineIndex > partToken.lineIndex) {
      if (
        getAlignedQuantityTokens(line).length > 0 ||
        getAlignedPartNumberTokens(line).length > 0
      ) {
        break
      }
    }

    const colorText = getSequentialColorText(line)
    if (colorText) {
      candidates.push({ lineIndex, text: colorText })
    }
  }

  return candidates.sort(
    (left, right) =>
      scoreOcrColorSpecificity(right.text) - scoreOcrColorSpecificity(left.text) ||
      left.lineIndex - right.lineIndex,
  )[0] ?? null
}

function findPartFirstSequentialQuantity(
  lines: readonly string[],
  partLineIndex: number,
  colorLineIndex: number,
) {
  for (
    let lineIndex = colorLineIndex + 1;
    lineIndex < Math.min(lines.length, partLineIndex + 8);
    lineIndex += 1
  ) {
    const line = lines[lineIndex] ?? ""
    if (getAlignedPartNumberTokens(line).length > 0) {
      return null
    }

    const quantityTokens = getSequentialQuantityTokens(line, lineIndex)
    if (quantityTokens.length === 1) {
      return quantityTokens[0]
    }
  }

  return null
}

function getSequentialQuantityTokens(line: string, lineIndex: number): SequentialQuantityToken[] {
  const tokens: SequentialQuantityToken[] = getAlignedQuantityTokens(line).map((token) => ({
    ...token,
    lineIndex,
  }))
  const fusedQuantity = getTrailingFusedQuantity(line)

  if (fusedQuantity && !tokens.some((token) => token.start === fusedQuantity.start)) {
    tokens.push({
      fused: true,
      lineIndex,
      quantity: fusedQuantity.quantity,
      start: fusedQuantity.start,
    })
  }

  return tokens
}

function pruneStaleSequentialQuantities(
  pendingQuantities: SequentialQuantityToken[],
  lineIndex: number,
) {
  while (pendingQuantities.length > 0 && lineIndex - pendingQuantities[0].lineIndex > 8) {
    pendingQuantities.shift()
  }
}

function getSequentialPartTokens(line: string, lineIndex: number): SequentialPartToken[] {
  const trailingPartNumber = getTrailingFusedPartNumber(line)
  if (trailingPartNumber) {
    return [
      {
        colorText: trailingPartNumber.colorText,
        end: trailingPartNumber.end,
        lineIndex,
        partNumber: trailingPartNumber.partNumber,
        start: trailingPartNumber.start,
      },
    ]
  }

  if (getSequentialColorText(line)) {
    return []
  }

  return getAlignedPartNumberTokens(line).map((token) => ({
    ...token,
    lineIndex,
  }))
}

function findSequentialColorText(lines: readonly string[], partToken: SequentialPartToken) {
  if (partToken.colorText) {
    return getSequentialColorText(partToken.colorText)
  }

  const sameLineText = lines[partToken.lineIndex]?.slice(partToken.end) ?? ""
  const sameLineColor = getSequentialColorText(sameLineText)
  if (sameLineColor) {
    return sameLineColor
  }

  for (
    let lineIndex = partToken.lineIndex + 1;
    lineIndex < Math.min(lines.length, partToken.lineIndex + 7);
    lineIndex += 1
  ) {
    const line = lines[lineIndex] ?? ""
    const trailingPartNumber = getTrailingFusedPartNumber(line)
    if (trailingPartNumber) {
      const colorText = getSequentialColorText(trailingPartNumber.colorText)
      if (colorText) {
        return colorText
      }
    }

    if (
      getAlignedQuantityTokens(line).length > 0 ||
      getAlignedPartNumberTokens(line).length > 0
    ) {
      continue
    }

    const colorText = getSequentialColorText(line)
    if (colorText) {
      return colorText
    }
  }

  return null
}

function getTrailingFusedPartNumber(text: string) {
  if (!hasOcrColorWord(text)) {
    return null
  }

  return getTrailingFusedPartNumberAfterColor(text)
}

function getTrailingFusedPartNumberAfterColorPhrase(text: string) {
  if (!getSequentialColorText(text)) {
    return null
  }

  return getTrailingFusedPartNumberAfterColor(text)
}

function getTrailingFusedPartNumberAfterColor(text: string) {
  const normalizedText = text.replace(/[¢©]/g, "c").toLowerCase()
  const match = normalizedText.match(/([gp]?[po0]?\d[a-z0-9cpbrat]{2,})\s*$/)
  if (!match || match.index === undefined) {
    return null
  }

  const partNumber = normalizeOcrPartNumber(match[1] ?? "")
  if (!isLikelyManualPartNumber(partNumber)) {
    return null
  }

  return {
    colorText: text.slice(0, match.index),
    end: match.index + match[0].length,
    partNumber,
    start: match.index,
  }
}

function getAlignedQuantityTokens(line: string): AlignedQuantityToken[] {
  const tokens: AlignedQuantityToken[] = []
  const quantityPattern = /(^|[^a-z0-9])(\d{1,5})\s*x(?=$|[^a-z0-9])/gi

  let match: RegExpExecArray | null
  while ((match = quantityPattern.exec(line))) {
    const quantity = Number(match[2])
    if (!Number.isInteger(quantity) || quantity <= 0) {
      continue
    }

    tokens.push({
      quantity,
      start: match.index + (match[1]?.length ?? 0),
    })
  }

  return tokens
}

function getAlignedStudioQuantityGlyphSlipTokens(line: string): AlignedQuantityToken[] {
  const quantity = getQuantityFromOcrLine(line, { allowGlyphSlips: true, weQuantity: 4 })
  if (!quantity || !isOcrQuantityGlyphSlip(line)) {
    return []
  }

  const start = line.search(/\S/)
  return [
    {
      quantity,
      start: start >= 0 ? start : 0,
    },
  ]
}

function getAlignedPartColorTokens(line: string): AlignedPartColorToken[] {
  const tokens: AlignedPartColorToken[] = []
  const normalizedLine = normalizeOcrComparableText(line)
  const partColorPattern = /(^|[^a-z0-9])(\d[a-z0-9cpbrat]{2,})\s*[,.;:]\s*(\d{1,3})(?=$|[^a-z0-9])/g

  let match: RegExpExecArray | null
  while ((match = partColorPattern.exec(normalizedLine))) {
    const partNumber = normalizeOcrPartNumber(match[2] ?? "")
    if (!isLikelyOcrPartNumber(partNumber)) {
      continue
    }

    tokens.push({
      colorId: match[3] ?? "",
      partNumber,
      start: match.index + (match[1]?.length ?? 0),
    })
  }

  return tokens
}

function getAlignedPartNumberTokens(line: string): AlignedPartNumberToken[] {
  const tokens: AlignedPartNumberToken[] = []
  const normalizedLine = normalizeOcrComparableText(line)
  const wholeLinePartNumber = normalizeOcrPartNumber(line)
  if (/^\s*\d{3,}\s+\d{1,2}\s*$/.test(line) && isLikelyManualPartNumber(wholeLinePartNumber)) {
    const start = line.search(/\S/)
    return [
      {
        end: line.trimEnd().length,
        partNumber: wholeLinePartNumber,
        start: start >= 0 ? start : 0,
      },
    ]
  }

  if (/\bp/i.test(line) && isLikelyManualPartNumber(wholeLinePartNumber)) {
    const start = line.search(/\S/)
    return [
      {
        end: line.trimEnd().length,
        partNumber: wholeLinePartNumber,
        start: start >= 0 ? start : 0,
      },
    ]
  }

  const partNumberPattern = /(^|[^a-z0-9])(\d[a-z0-9cpbrat]{2,})(?=$|[^a-z0-9])/g

  let match: RegExpExecArray | null
  while ((match = partNumberPattern.exec(normalizedLine))) {
    const leadingSeparator = match[1] ?? ""
    const partNumber = normalizeOcrPartNumber(match[2] ?? "")
    if (normalizedLine.slice(0, match.index).trim() === "" && /^[,.;:]$/.test(leadingSeparator)) {
      continue
    }

    if (!isLikelyOcrPartNumber(partNumber) || /^\d{1,5}x$/i.test(partNumber)) {
      continue
    }

    const start = match.index + leadingSeparator.length
    tokens.push({
      end: start + (match[2]?.length ?? 0),
      partNumber,
      start,
    })
  }

  return tokens
}

function pairAlignedTokens<T extends AlignedPartColorToken | AlignedPartNumberToken>(
  partColorTokens: readonly T[],
  quantityTokens: readonly AlignedQuantityToken[],
) {
  const availableQuantityTokens = [...quantityTokens]
  const pairs: {
    partColorToken: T
    quantityToken: AlignedQuantityToken
  }[] = []

  for (const partColorToken of partColorTokens) {
    const nearest = availableQuantityTokens
      .map((quantityToken, index) => ({
        distance: Math.abs(quantityToken.start - partColorToken.start),
        index,
        quantityToken,
      }))
      .filter(({ distance }) => distance <= 44)
      .sort((left, right) => left.distance - right.distance)[0]

    if (!nearest) {
      continue
    }

    pairs.push({ partColorToken, quantityToken: nearest.quantityToken })
    availableQuantityTokens.splice(nearest.index, 1)
  }

  return pairs
}

function getQuantityFromOcrLine(
  text: string,
  {
    allowBareNumber = false,
    allowGlyphSlips = false,
    weQuantity = 5,
  }: { allowBareNumber?: boolean; allowGlyphSlips?: boolean; weQuantity?: 4 | 5 } = {},
) {
  const normalizedText = text.trim()
  if (/^ax$/i.test(normalizedText)) {
    return 4
  }

  if (allowGlyphSlips) {
    if (/^sf$/i.test(normalizedText)) {
      return 1
    }

    if (/^e[o0]$/i.test(normalizedText)) {
      return 2
    }

    if (/^we$/i.test(normalizedText)) {
      return weQuantity
    }

    if (/^z[f7]$/i.test(normalizedText)) {
      return 4
    }
  }

  if (allowBareNumber && /^\d{1,5}$/.test(normalizedText)) {
    const quantity = Number(normalizedText)
    return Number.isInteger(quantity) && quantity > 0 ? quantity : null
  }

  const match = normalizedText.match(/^(\d{1,5})\s*(?:x|X|\u00d7)$/)
  if (!match) {
    return null
  }

  const quantity = Number(match[1])
  return Number.isInteger(quantity) && quantity > 0 ? quantity : null
}

function isOcrQuantityGlyphSlip(text: string) {
  return /^(?:sf|e[o0]|we|z[f7])$/i.test(text.trim())
}

function isSameLabelColumn(
  anchorLine: PositionedOcrLine,
  candidateLine: PositionedOcrLine,
  maxDistance: number,
) {
  return (
    Math.abs(anchorLine.bbox.x0 - candidateLine.bbox.x0) <= maxDistance ||
    Math.abs(anchorLine.centerX - candidateLine.centerX) <= maxDistance
  )
}

function scoreLineProximity(anchorLine: PositionedOcrLine, candidateLine: PositionedOcrLine) {
  return (
    Math.abs(anchorLine.bbox.x0 - candidateLine.bbox.x0) * 1.4 +
    Math.max(0, candidateLine.bbox.y0 - anchorLine.bbox.y0)
  )
}

function getLineHeight(line: PositionedOcrLine) {
  return Math.max(1, line.bbox.y1 - line.bbox.y0)
}

function normalizeOcrPartNumber(text: string) {
  const compactText = normalizeOcrComparableText(text)
    .replace(/\s+/g, "")

  const assemblyPrint = compactText.match(/^(\d{5})0?1p(b\d{1,4})$/)
  if (assemblyPrint) {
    return `${assemblyPrint[1]}c01p${assemblyPrint[2]}`
  }

  const splitPrintedPart = compactText.match(/^(\d{3,})0b(\d{1,4})$/)
  if (splitPrintedPart) {
    return `${splitPrintedPart[1]}pb${splitPrintedPart[2]}`
  }

  if (/^\d{3,}[a-z]?p\d{1,4}$/.test(compactText)) {
    return compactText
  }

  return compactText
    .replace(/^g(?=[po0]?\d)/, "6")
    .replace(/(\d)p(?=\d)/g, "$10")
    .replace(/(\d)g(?=[o0]?\d)/g, "$16")
    .replace(/(\d)o(?=\d)/g, "$12")
    .replace(/(\d)p$/g, "$1b")
}

function getPartNumberFromOcrLine(text: string) {
  const normalizedText = normalizeOcrComparableText(text)
  if (!hasOcrColorWord(normalizedText)) {
    const normalizedPartLine = normalizeOcrPartNumber(text)
    return isLikelyOcrPartNumber(normalizedPartLine) ? normalizedPartLine : null
  }

  const trailingPartNumber = normalizeOcrPartNumber(
    normalizedText.match(/([gp]?[po0]?\d[a-z0-9]*)\s*$/)?.[1] ?? "",
  )
  if (!isLikelyOcrPartNumber(trailingPartNumber)) {
    return null
  }

  const colorPrefix = removePartNumberFromOcrLine(text, trailingPartNumber)
  return hasRepeatedOcrColorEvidence(colorPrefix) ? null : trailingPartNumber
}

function removePartNumberFromOcrLine(text: string, partNumber: string) {
  if (normalizeOcrPartNumber(text) === partNumber) {
    return ""
  }

  const escapedPartNumber = partNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return text
    .replace(new RegExp(`${escapedPartNumber}\\s*$`, "i"), "")
    .replace(/\s+/g, " ")
    .trim()
}

function isLikelyOcrPartNumber(partNumber: string) {
  return isLikelyManualPartNumber(partNumber) && !isLikelyRepeatedDigitOcrArtifact(partNumber)
}

function isLikelyRepeatedDigitOcrArtifact(partNumber: string) {
  const eightCount = [...partNumber].filter((character) => character === "8").length

  return (
    /^\d(\d)\1{5,}$/.test(partNumber) ||
    /^(\d)\1{6,}$/.test(partNumber) ||
    (/^\d{8,}$/.test(partNumber) && /8{4,}/.test(partNumber) && eightCount / partNumber.length >= 0.65)
  )
}

const ocrColorWordPattern =
  /\b(?:black|blue|bluish|brown|clear|dark|flat|gold|gray|green|grey|light|nougat|orange|purple|red|silver|tan|trans|turquoise|white|yellow)\b/i

function hasOcrColorWord(text: string) {
  return ocrColorWordPattern.test(text)
}

function trimOcrColorText(text: string) {
  const trimmedText = text.replace(/\s+/g, " ").trim()
  const colorWord = trimmedText.match(ocrColorWordPattern)

  return colorWord?.index ? trimmedText.slice(colorWord.index).trim() : trimmedText
}

function hasRepeatedOcrColorEvidence(text: string) {
  const normalizedText = text
    .toLowerCase()
    .replace(/\bgrey\b/g, "gray")
    .replace(/[^a-z0-9]+/g, " ")

  return ["bluish", "brown", "gray", "green", "orange", "red", "tan", "white", "yellow"].some(
    (word) => (normalizedText.match(new RegExp(`\\b${word}`, "g")) ?? []).length > 1,
  )
}

function normalizeOcrColorText(text: string) {
  const fusedQuantity = getTrailingFusedQuantity(text)
  const normalized = (fusedQuantity ? text.slice(0, fusedQuantity.start) : text).trim()
  const sequentialColorText = getSequentialColorText(normalized)
  if (sequentialColorText) {
    return sequentialColorText
  }

  return /^\d{1,3}$/.test(normalized) ? getSupportedStudioColorCodeAlias(normalized) : normalized
}

function normalizeOcrColorTextForPartLine({
  colorLine,
  colorText,
  partLine,
}: {
  colorLine: PositionedOcrLine | null
  colorText: string
  partLine: PositionedOcrLine
}) {
  return normalizeOcrColorText(selectSpatialColorPhraseForPartLine(colorLine, partLine) ?? colorText)
}

function selectSpatialColorPhraseForPartLine(
  colorLine: PositionedOcrLine | null,
  partLine: PositionedOcrLine,
) {
  if (!colorLine) {
    return null
  }

  const colorTokens = getApproximateOcrColorPhraseTokens(colorLine.normalizedText)
  if (colorTokens.length < 2) {
    return null
  }

  const colorTexts: string[] = []
  for (const token of colorTokens) {
    const colorText = getSequentialColorText(token.text)
    if (colorText) {
      colorTexts.push(colorText)
    }
  }
  const colorFamilies = new Set(colorTexts.map(getOcrColorBaseFamily))
  if (colorTexts.length === colorTokens.length && colorFamilies.size === 1) {
    return [...colorTexts].sort(
      (left, right) => scoreOcrColorSpecificity(right) - scoreOcrColorSpecificity(left),
    )[0] ?? null
  }

  const lineWidth = Math.max(1, colorLine.bbox.x1 - colorLine.bbox.x0)
  const textLength = Math.max(1, colorLine.normalizedText.length)
  const partCenterX = partLine.centerX

  return [...colorTokens].sort((left, right) => {
    const leftCenterX = colorLine.bbox.x0 + ((left.start + left.text.length / 2) / textLength) * lineWidth
    const rightCenterX = colorLine.bbox.x0 + ((right.start + right.text.length / 2) / textLength) * lineWidth

    return Math.abs(leftCenterX - partCenterX) - Math.abs(rightCenterX - partCenterX)
  })[0]?.text ?? null
}

function getApproximateOcrColorPhraseTokens(text: string) {
  return getOcrColorPhraseTokens(text.replace(/([a-z])([A-Z])/g, "$1 $2"))
}

function getSequentialColorText(text: string) {
  const normalizedText = normalizeOcrComparableText(text)
    .replace(/\bgrey\b/g, "gray")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

  if (/(?:dark|park)\s+b[li]uish\s+gra[a-z0-9]*/.test(normalizedText)) {
    return "Dark Bluish Gray"
  }

  if (/\b(?:light|ligh|ignt)?\s*b[li]uish\s+gra[a-z0-9]*/.test(normalizedText)) {
    return "Light Bluish Gray"
  }

  if (/(?:dark|park)\s+bluish\s+gra[a-z0-9]*/.test(normalizedText)) {
    return "Dark Bluish Gray"
  }

  if (/\bdark\s+sis\s+gra[a-z0-9]*/.test(normalizedText)) {
    return "Dark Bluish Gray"
  }

  if (/\b(?:light|ligh|ignt)?\s*bluish\s+gra[a-z0-9]*/.test(normalizedText)) {
    return "Light Bluish Gray"
  }

  if (/\btrans\s+neon\s+orange\b/.test(normalizedText)) {
    return "Trans-Neon Orange"
  }

  if (/\btrans\s+orange\b/.test(normalizedText)) {
    return "Trans-Orange"
  }

  if (/\btrans\s+medium\s+blue\b/.test(normalizedText)) {
    return "Trans-Medium Blue"
  }

  if (/\btrans\s+dark\s+blue\b/.test(normalizedText)) {
    return "Trans-Dark Blue"
  }

  if (/\btrans\s+light\s+blue\b/.test(normalizedText)) {
    return "Trans-Light Blue"
  }

  if (/\btrans\s+brown\b/.test(normalizedText)) {
    return "Trans-Brown"
  }

  if (/\btrans\s+clear\b/.test(normalizedText)) {
    return "Trans-Clear"
  }

  if (/\btrans\s+green\b/.test(normalizedText)) {
    return "Trans-Green"
  }

  if (/\btrans\s+red\b/.test(normalizedText)) {
    return "Trans-Red"
  }

  if (/\btrans\s+yellow\b/.test(normalizedText)) {
    return "Trans-Yellow"
  }

  if (/\bglowing\s+neon\s+red\b/.test(normalizedText)) {
    return "Glowing Neon Red"
  }

  if (/\bglowing\s+neon\s+yellow\b/.test(normalizedText)) {
    return "Glowing Neon Yellow"
  }

  if (/\bpearl\s+dark\s+gray\b/.test(normalizedText)) {
    return "Pearl Dark Gray"
  }

  if (/\bpearl\s+gold\b/.test(normalizedText)) {
    return "Pearl Gold"
  }

  if (/(?:r[a-z]?a?d{1,2}ish|peddish)\s+brown[a-z0-9]*/.test(normalizedText)) {
    return "Reddish Brown"
  }

  if (/\bmedium\s+nougat\b/.test(normalizedText)) {
    return "Medium Nougat"
  }

  if (/\bnougat\b/.test(normalizedText)) {
    return "Medium Nougat"
  }

  if (/\bbright\s+light\s+yellow\b/.test(normalizedText)) {
    return "Bright Light Yellow"
  }

  if (/\bbright\s+light\s+orange\b/.test(normalizedText)) {
    return "Bright Light Orange"
  }

  if (/\bbright\s+light\s+blue\b/.test(normalizedText)) {
    return "Bright Light Blue"
  }

  if (/\bdark\s+orange\b/.test(normalizedText)) {
    return "Dark Orange"
  }

  if (/\bdark\s+brown\b/.test(normalizedText)) {
    return "Dark Brown"
  }

  if (/\bdark\s+tan\b/.test(normalizedText)) {
    return "Dark Tan"
  }

  if (/\bmagenta\b/.test(normalizedText)) {
    return "Magenta"
  }

  if (/\bflat\s+silver\b/.test(normalizedText)) {
    return "Flat Silver"
  }

  if (/\bdark\s+azure\b/.test(normalizedText)) {
    return "Dark Azure"
  }

  if (/\bdark\s+turquoise\b/.test(normalizedText)) {
    return "Dark Turquoise"
  }

  if (/\bdark\s+purple\b/.test(normalizedText)) {
    return "Dark Purple"
  }

  if (/\bdark\s+blue\b/.test(normalizedText)) {
    return "Dark Blue"
  }

  if (/\bdark\s+red\b/.test(normalizedText)) {
    return "Dark Red"
  }

  if (/\bdark\s+green\b/.test(normalizedText)) {
    return "Dark Green"
  }

  if (/\bbright\s+green\b/.test(normalizedText)) {
    return "Bright Green"
  }

  if (/\bdark\s+gray\b/.test(normalizedText)) {
    return "Dark Gray"
  }

  if (/\blight\s+gray\b/.test(normalizedText)) {
    return "Light Gray"
  }

  if (/\bblack\b/.test(normalizedText)) {
    return "Black"
  }

  if (/\bbrown\b/.test(normalizedText)) {
    return "Brown"
  }

  if (/\bblue\b/.test(normalizedText)) {
    return "Blue"
  }

  if (/\bgreen\b/.test(normalizedText)) {
    return "Green"
  }

  if (/\borange\b/.test(normalizedText)) {
    return "Orange"
  }

  if (/\btan\b/.test(normalizedText)) {
    return "Tan"
  }

  if (/\bred\b/.test(normalizedText)) {
    return "Red"
  }

  if (/\bwhite\b/.test(normalizedText)) {
    return "White"
  }

  if (/\byellow\b/.test(normalizedText)) {
    return "Yellow"
  }

  return null
}

function normalizeOcrText(text: string) {
  return text.replace(/\u00d7/g, "x").replace(/[ \t]+\n/g, "\n").trim()
}

function normalizeOcrComparableText(text: string) {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[¢©]/g, "c")
    .toLowerCase()
    .replace(/ρ/g, "p")
}

function mergeStructuredAndAlignedOcrRows(
  structuredRows: readonly OcrReconstructedRow[],
  alignedRows: readonly OcrReconstructedRow[],
) {
  if (structuredRows.length === 0) {
    return alignedRows
  }

  if (alignedRows.length === 0) {
    return structuredRows
  }

  const filteredAlignedRows = filterConflictingAlignedRows(structuredRows, alignedRows)
  const structuredRowSet = new Set(structuredRows.map((row) => row.text))
  const hasOverlap = filteredAlignedRows.some((row) => structuredRowSet.has(row.text))
  // Require agreement before merging aligned rows; standalone aligned OCR can pick up build-step fragments.
  if (!hasOverlap) {
    const hasCompatibleOverlap = hasCompatibleOcrRowAnchorOverlap(structuredRows, filteredAlignedRows)
    if (
      !hasCompatibleOverlap ||
      (filteredAlignedRows.length <= structuredRows.length &&
        !hasBetterAlignedRowForStructuredAnchor(structuredRows, filteredAlignedRows))
    ) {
      return structuredRows
    }

    return mergeAlignedRowsWithStructuredAnchors(structuredRows, filteredAlignedRows)
  }

  const rows: OcrReconstructedRow[] = []
  for (const row of [...structuredRows, ...filteredAlignedRows]) {
    if (!row.rowRegion && rows.some((candidate) => candidate.text === row.text)) {
      continue
    }

    addOcrRow(rows, row)
  }

  return rows
}

function filterConflictingAlignedRows(
  structuredRows: readonly OcrReconstructedRow[],
  alignedRows: readonly OcrReconstructedRow[],
) {
  if (structuredRows.length < 4) {
    return alignedRows
  }

  const structuredRowsByPart = new Map<string, OcrReconstructedRow[]>()
  for (const structuredRow of structuredRows) {
    const parts = parseOcrRowParts(structuredRow.text)
    if (!parts) {
      continue
    }

    const rows = structuredRowsByPart.get(parts.partNumber) ?? []
    rows.push(structuredRow)
    structuredRowsByPart.set(parts.partNumber, rows)
  }

  return alignedRows.filter((row) => {
    if (row.rowRegion) {
      return true
    }

    const parts = parseOcrRowParts(row.text)
    const structuredRowsForPart = parts ? structuredRowsByPart.get(parts.partNumber) : undefined
    if (!parts || !structuredRowsForPart?.length) {
      return true
    }

    const hasExactStructuredMatch = structuredRowsForPart.some((structuredRow) => {
      const structuredPart = parseOcrRowParts(structuredRow.text)
      return Boolean(
        structuredPart &&
        structuredPart.quantity === parts.quantity &&
        areCompatibleOcrColors(structuredPart.colorText, parts.colorText),
      )
    })
    if (hasExactStructuredMatch) {
      return true
    }

    if (
      structuredRowsForPart.some((structuredRow) => {
        const structuredPart = parseOcrRowParts(structuredRow.text)
        return Boolean(
          structuredPart &&
            structuredPart.quantity !== parts.quantity &&
            areCompatibleOcrColors(structuredPart.colorText, parts.colorText) &&
            isLikelyBroadSwallowedTrailingOcrRow(structuredRow, structuredPart),
        )
      })
    ) {
      return true
    }

    return (
      hasExplicitOcrQuantityToken(row) &&
      structuredRowsForPart.every((structuredRow) => {
        const structuredPart = parseOcrRowParts(structuredRow.text)
        return (
          structuredPart &&
          !hasExplicitOcrQuantityToken(structuredRow) &&
          areCompatibleOcrColors(structuredPart.colorText, parts.colorText)
        )
      })
    )
  })
}

function hasBetterAlignedRowForStructuredAnchor(
  structuredRows: readonly OcrReconstructedRow[],
  alignedRows: readonly OcrReconstructedRow[],
) {
  const structuredRowByKey = new Map(
    structuredRows.flatMap((structuredRow) => {
      const key = getOcrRowAnchorKey(structuredRow)
      return key ? [[key, structuredRow] as const] : []
    }),
  )

  return alignedRows.some((alignedRow) => {
    const key = getOcrRowAnchorKey(alignedRow)
    const structuredRow = key ? structuredRowByKey.get(key) : undefined

    return structuredRow ? scoreOcrRowText(alignedRow.text) > scoreOcrRowText(structuredRow.text) : false
  })
}

function hasCompatibleOcrRowAnchorOverlap(
  structuredRows: readonly OcrReconstructedRow[],
  alignedRows: readonly OcrReconstructedRow[],
) {
  const structuredKeys = new Set(
    structuredRows.map(getOcrRowAnchorKey).filter((key): key is string => Boolean(key)),
  )

  return alignedRows.some((row) => {
    const key = getOcrRowAnchorKey(row)
    return key ? structuredKeys.has(key) : false
  })
}

function mergeAlignedRowsWithStructuredAnchors(
  structuredRows: readonly OcrReconstructedRow[],
  alignedRows: readonly OcrReconstructedRow[],
) {
  const structuredRowsByKey = new Map<string, OcrReconstructedRow[]>()
  const rows: OcrReconstructedRow[] = []

  for (const structuredRow of structuredRows) {
    const key = getOcrRowAnchorKey(structuredRow)
    if (!key) {
      addOcrRow(rows, structuredRow)
      continue
    }

    const keyedRows = structuredRowsByKey.get(key) ?? []
    keyedRows.push(structuredRow)
    structuredRowsByKey.set(key, keyedRows)
  }

  for (const alignedRow of alignedRows) {
    const key = getOcrRowAnchorKey(alignedRow)
    const structuredRow = key ? structuredRowsByKey.get(key)?.shift() : undefined
    addOcrRow(rows, selectBetterOcrRow(structuredRow, alignedRow))
  }

  for (const keyedRows of structuredRowsByKey.values()) {
    for (const structuredRow of keyedRows) {
      addOcrRow(rows, structuredRow)
    }
  }

  return rows
}

function selectBetterOcrRow(
  structuredRow: OcrReconstructedRow | undefined,
  alignedRow: OcrReconstructedRow,
) {
  if (!structuredRow) {
    return alignedRow
  }

  const structuredScore = scoreOcrRowText(structuredRow.text)
  const alignedScore = scoreOcrRowText(alignedRow.text)

  return alignedScore > structuredScore ? alignedRow : structuredRow
}

function scoreOcrRowText(text: string) {
  const parts = parseOcrRowParts(text)
  if (!parts) {
    return 0
  }

  return 1 + (getSequentialColorText(parts.colorText) ? 2 : parts.colorText.length > 0 ? 1 : 0)
}

function hasResolvableOcrColorText(colorText: string) {
  const normalizedColorText = normalizeOcrColorText(colorText)

  return Boolean(getSequentialColorText(normalizedColorText) || /^studio-\d{1,3}$/.test(normalizedColorText))
}

function getOcrRowAnchorKey(row: OcrReconstructedRow) {
  const parts = parseOcrRowParts(row.text)
  return parts ? `${parts.quantity}:${parts.partNumber}` : null
}

function parseOcrRowParts(text: string): OcrRowParts | null {
  const match = text.match(/^(\d{1,5})\s+x\s+(\S+)(?:\s+(.+))?$/i)
  const quantity = match ? Number(match[1]) : null
  const partNumber = normalizeOcrPartNumber(match?.[2] ?? "")

  if (!quantity || !Number.isInteger(quantity) || quantity <= 0 || !isLikelyManualPartNumber(partNumber)) {
    return null
  }

  return {
    colorText: match?.[3]?.trim() ?? "",
    partNumber,
    quantity,
  }
}

function createOcrTextData(
  rows: readonly OcrReconstructedRow[],
  sourceImage: PartsListSourceImage | null,
) {
  let offset = 0
  const rowSources: PartsListPageRowSource[] = []
  const text = rows.map((row) => row.text).join("\n")

  for (const row of rows) {
    const textRange: PartsListTextRange = {
      end: offset + row.text.length + (row === rows.at(-1) ? 0 : 1),
      start: offset,
    }
    rowSources.push({
      cropReferences: [],
      partThumbnailRegion: row.partThumbnailRegion,
      rawText: row.text,
      rawTokens: row.rawTokens,
      rowRegion: row.rowRegion,
      sourceImage,
      textRange,
    })
    offset = textRange.end
  }

  return { rowSources, text }
}

function createOcrRow({
  sourceLines,
  text,
}: {
  sourceLines: readonly PositionedOcrLine[]
  text: string
}): OcrReconstructedRow {
  const rowRegion = createRegionFromLines(sourceLines)

  return {
    partThumbnailRegion: rowRegion ? inferPartThumbnailCandidateRegion(rowRegion) : null,
    rawTokens: sourceLines.map((line) => line.normalizedText),
    rowRegion,
    sourceRank: getOcrRowSourceRank(sourceLines),
    text,
  }
}

function getOcrRowSourceRank(sourceLines: readonly PositionedOcrLine[]) {
  if (sourceLines.length === 0) {
    return 0
  }

  const sourceRanks = sourceLines.map((line) => line.sourceRank)
  const bestSourceRank = Math.min(...sourceRanks)

  return bestSourceRank < 0 ? bestSourceRank : Math.max(0, ...sourceRanks)
}

function createTextOnlyOcrRow({
  rawTokens,
  text,
}: {
  rawTokens: readonly string[]
  text: string
}): OcrReconstructedRow {
  return {
    partThumbnailRegion: null,
    rawTokens: [...rawTokens],
    rowRegion: null,
    sourceRank: 0,
    text,
  }
}

function createRegionFromLines(lines: readonly PositionedOcrLine[]): PartsListSourceRegion | null {
  if (lines.length === 0) {
    return null
  }

  const x0 = Math.min(...lines.map((line) => line.bbox.x0))
  const y0 = Math.min(...lines.map((line) => line.bbox.y0))
  const x1 = Math.max(...lines.map((line) => line.bbox.x1))
  const y1 = Math.max(...lines.map((line) => line.bbox.y1))

  return {
    height: Math.max(1, Math.round(y1 - y0)),
    unit: "ocr_pixel",
    width: Math.max(1, Math.round(x1 - x0)),
    x: Math.round(x0),
    y: Math.round(y0),
  }
}

function inferPartThumbnailCandidateRegion(rowRegion: PartsListSourceRegion): PartsListSourceRegion {
  const horizontalPadding = Math.max(24, Math.round(rowRegion.height * 0.8))
  const candidateSize = Math.max(
    rowRegion.width + horizontalPadding * 2,
    Math.round(rowRegion.height * 2.2),
    96,
  )
  const gap = Math.max(6, Math.round(rowRegion.height * 0.15))
  const centerX = rowRegion.x + rowRegion.width / 2

  return {
    height: candidateSize,
    unit: "ocr_pixel",
    width: candidateSize,
    x: Math.max(0, Math.round(centerX - candidateSize / 2)),
    y: Math.max(0, Math.round(rowRegion.y - candidateSize - gap)),
  }
}

function createCropReferences({
  pageNumber,
  partThumbnailRegion,
  rowRegion,
}: {
  pageNumber: number
  partThumbnailRegion: PartsListSourceRegion | null
  rowRegion: PartsListSourceRegion | null
}): PartsListPrivateCropReference[] {
  const references: PartsListPrivateCropReference[] = []
  if (rowRegion) {
    references.push({
      id: createCropReferenceId("row", pageNumber, rowRegion),
      kind: "row",
      pageNumber,
      region: rowRegion,
    })
  }

  if (partThumbnailRegion) {
    references.push({
      id: createCropReferenceId("part-thumbnail-candidate", pageNumber, partThumbnailRegion),
      kind: "part_thumbnail_candidate",
      pageNumber,
      region: partThumbnailRegion,
    })
  }

  return references
}

function createCropReferenceId(kind: string, pageNumber: number, region: PartsListSourceRegion) {
  return `${kind}:p${pageNumber}:x${region.x}:y${region.y}:w${region.width}:h${region.height}`
}

function addOcrRow(rows: OcrReconstructedRow[], row: OcrReconstructedRow) {
  const duplicateIndex = rows.findIndex((candidate) => isDuplicateOcrRow(candidate, row))
  if (duplicateIndex >= 0) {
    rows[duplicateIndex] = selectBetterDuplicateOcrRow(rows[duplicateIndex], row)
    return
  }

  rows.push(row)
}

function deduplicateOcrRows(rows: readonly OcrReconstructedRow[]) {
  const dedupedRows: OcrReconstructedRow[] = []
  for (const row of rows) {
    addOcrRow(dedupedRows, row)
  }

  return dedupedRows
}

function isDuplicateOcrRow(left: OcrReconstructedRow, right: OcrReconstructedRow) {
  if (left.text !== right.text) {
    return isDuplicateOcrRowAnchor(left, right)
  }

  if (!left.rowRegion || !right.rowRegion) {
    return true
  }

  return getRegionIntersectionRatio(left.rowRegion, right.rowRegion) >= 0.2
}

function isDuplicateOcrRowAnchor(left: OcrReconstructedRow, right: OcrReconstructedRow) {
  const leftParts = parseOcrRowParts(left.text)
  const rightParts = parseOcrRowParts(right.text)
  if (!leftParts || !rightParts) {
    return false
  }

  if (isLikelySameRegionOcrReadDuplicate(left, right, leftParts, rightParts)) {
    return true
  }

  if (isLikelyExplicitQuantityReplacementDuplicate(left, right, leftParts, rightParts)) {
    return true
  }

  if (isLikelyShortPartNumberFragmentDuplicate(left, right, leftParts, rightParts)) {
    return true
  }

  if (isLikelyBroadOverlappingQuantityReuseDuplicate(left, right, leftParts, rightParts)) {
    return true
  }

  if (isLikelyBackedColorConflictDuplicate(left, right, leftParts, rightParts)) {
    return true
  }

  if (isLikelyBroadOverlappingSamePartQuantityConflictDuplicate(left, right, leftParts, rightParts)) {
    return true
  }

  if (
    hasSingleRegionBackedOcrRow(left, right) &&
    leftParts.partNumber === rightParts.partNumber &&
    leftParts.quantity === rightParts.quantity &&
    hasReliableSingleRegionBackedOcrRow(left, right)
  ) {
    return true
  }

  if (
    hasSingleRegionBackedOcrRow(left, right) &&
    areCompatibleOcrColors(leftParts.colorText, rightParts.colorText) &&
    isLikelyNoisySingleRegionPartNumberReplacement(leftParts.partNumber, rightParts.partNumber)
  ) {
    return true
  }

  const isLikelySamePartNumber = isLikelySameOcrPartNumber(leftParts.partNumber, rightParts.partNumber)
  const isNoisyPartNumberReplacement = isNoisySingleRegionBackedPartNumberReplacement(
    left,
    right,
    leftParts,
    rightParts,
  )
  const isCroppedPartNumberPrefix = isCroppedOcrPartNumberPrefixDuplicate(left, right, leftParts, rightParts)
  if (!isLikelySamePartNumber && !isNoisyPartNumberReplacement && !isCroppedPartNumberPrefix) {
    return false
  }

  if (left.rowRegion && right.rowRegion) {
    const overlapRatio = getRegionIntersectionRatio(left.rowRegion, right.rowRegion)
    if (isCroppedPartNumberPrefix) {
      return overlapRatio >= 0.75
    }

    if (
      leftParts.quantity === rightParts.quantity &&
      isLikelyLessSpecificOcrColorDuplicate(leftParts.colorText, rightParts.colorText)
    ) {
      return overlapRatio >= 0.1
    }

    if (areCompatibleOcrColors(leftParts.colorText, rightParts.colorText)) {
      return overlapRatio >= 0.2
    }

    return isLikelyBroadOverlappingQuantityReuseDuplicate(left, right, leftParts, rightParts)
  }

  if (hasSingleRegionBackedOcrRow(left, right)) {
    return (
      leftParts.quantity === rightParts.quantity ||
      getSequentialColorText(leftParts.colorText) === getSequentialColorText(rightParts.colorText)
    )
  }

  if (
    !left.rowRegion &&
    !right.rowRegion &&
    leftParts.partNumber === rightParts.partNumber &&
    (areCompatibleOcrColors(leftParts.colorText, rightParts.colorText) ||
      (leftParts.quantity === rightParts.quantity && hasTextOnlyOcrEvidence(left, right)))
  ) {
    return true
  }

  if (leftParts.quantity !== rightParts.quantity) {
    return false
  }

  return areCompatibleOcrColors(leftParts.colorText, rightParts.colorText)
}

function isLikelySameRegionOcrReadDuplicate(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  if (
    !left.rowRegion ||
    !right.rowRegion ||
    leftParts.quantity !== rightParts.quantity ||
    !areSameSpecificOcrColors(leftParts.colorText, rightParts.colorText) ||
    getRegionIntersectionRatio(left.rowRegion, right.rowRegion) < 0.8
  ) {
    return false
  }

  return isLikelySameRegionOcrPartNumberReplacement(leftParts.partNumber, rightParts.partNumber)
}

function isLikelySameRegionOcrPartNumberReplacement(left: string, right: string) {
  if (left === right) {
    return true
  }

  if (Math.min(left.length, right.length) < 4 || Math.abs(left.length - right.length) > 2) {
    return false
  }

  if (getOcrPartNumberEditDistance(left, right) <= 1) {
    return true
  }

  return getCommonPrefixLength(left, right) >= 3
}

function getCommonPrefixLength(left: string, right: string) {
  const maxLength = Math.min(left.length, right.length)
  let length = 0
  while (length < maxLength && left[length] === right[length]) {
    length += 1
  }

  return length
}

function hasReliableSingleRegionBackedOcrRow(left: OcrReconstructedRow, right: OcrReconstructedRow) {
  const regionBackedRow = left.rowRegion ? left : right
  const regionBackedParts = parseOcrRowParts(regionBackedRow.text)
  const regionColor = regionBackedParts ? getSequentialColorText(regionBackedParts.colorText) : null

  return Boolean(
    regionBackedParts &&
      hasExplicitOcrQuantityToken(regionBackedRow) &&
      (!regionColor || isOcrRowColorBackedByRawTokens(regionBackedRow, regionColor)),
  )
}

function hasTextOnlyOcrEvidence(left: OcrReconstructedRow, right: OcrReconstructedRow) {
  return left.rawTokens.length > 0 || right.rawTokens.length > 0
}

function isLikelySameOcrPartNumber(left: string, right: string) {
  return (
    left === right ||
    (Math.abs(left.length - right.length) <= 2 && (left.endsWith(right) || right.endsWith(left))) ||
    (Math.min(left.length, right.length) >= 5 && (left.includes(right) || right.includes(left))) ||
    (Math.min(left.length, right.length) >= 4 && isLikelyOcrPartNumberSubstitution(left, right))
  )
}

function isCroppedOcrPartNumberPrefixDuplicate(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  return Boolean(getCroppedOcrPartNumberPrefixReplacementCandidate(left, right, leftParts, rightParts))
}

function getCroppedOcrPartNumberPrefixReplacementCandidate(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  if (
    !left.rowRegion ||
    !right.rowRegion ||
    leftParts.quantity !== rightParts.quantity ||
    !isLikelyCroppedOcrPartNumberPrefix(leftParts.partNumber, rightParts.partNumber)
  ) {
    return null
  }

  const leftIsShorter = leftParts.partNumber.length < rightParts.partNumber.length
  const shorterRow = leftIsShorter ? left : right
  const longerRow = leftIsShorter ? right : left
  const leftStudioColorCode = getStudioColorCode(leftParts.colorText)
  const rightStudioColorCode = getStudioColorCode(rightParts.colorText)
  if (
    leftStudioColorCode &&
    rightStudioColorCode &&
    leftStudioColorCode !== rightStudioColorCode
  ) {
    return null
  }

  if (!areSameSpecificOcrColors(leftParts.colorText, rightParts.colorText)) {
    const shorterRegion = shorterRow.rowRegion
    const longerRegion = longerRow.rowRegion
    if (!shorterRegion || !longerRegion) {
      return null
    }

    const sameOrigin =
      Math.abs(shorterRegion.x - longerRegion.x) <= 12 &&
      Math.abs(shorterRegion.y - longerRegion.y) <= 12

    return sameOrigin && getRegionIntersectionRatio(shorterRegion, longerRegion) >= 0.8
      ? longerRow
      : null
  }

  const leftWidth = left.rowRegion.width
  const rightWidth = right.rowRegion.width
  const widthRatio = Math.min(leftWidth, rightWidth) / Math.max(leftWidth, rightWidth)
  const maxHorizontalOffset = Math.max(12, Math.min(left.rowRegion.height, right.rowRegion.height) * 0.25)
  const maxVerticalOffset = Math.max(12, Math.min(left.rowRegion.height, right.rowRegion.height) * 0.25)

  return (
    widthRatio <= 0.9 &&
    Math.abs(left.rowRegion.x - right.rowRegion.x) <= maxHorizontalOffset &&
    Math.abs(left.rowRegion.y - right.rowRegion.y) <= maxVerticalOffset
  )
    ? longerRow
    : null
}

function isLikelyCroppedOcrPartNumberPrefix(left: string, right: string) {
  const shorter = left.length <= right.length ? left : right
  const longer = left.length <= right.length ? right : left
  if (shorter.length < 3 || longer.length <= shorter.length) {
    return false
  }

  if (longer.startsWith(shorter)) {
    return true
  }

  const shorterDigitStem = shorter.replace(/[a-z]+$/i, "")
  return shorterDigitStem.length >= 3 && longer.startsWith(shorterDigitStem)
}

function isLikelyExplicitQuantityReplacementDuplicate(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  const replacement = getExplicitQuantityReplacementCandidate(left, right, leftParts, rightParts)
  return Boolean(replacement)
}

function getExplicitQuantityReplacementCandidate(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  if (
    !left.rowRegion ||
    !right.rowRegion ||
    leftParts.quantity !== rightParts.quantity ||
    !areSameSpecificOcrColors(leftParts.colorText, rightParts.colorText) ||
    getRegionIntersectionRatio(left.rowRegion, right.rowRegion) < 0.15
  ) {
    return null
  }

  const leftExplicit = hasExplicitOcrQuantityToken(left)
  const rightExplicit = hasExplicitOcrQuantityToken(right)
  if (leftExplicit === rightExplicit) {
    return null
  }

  const explicitRow = leftExplicit ? left : right
  const explicitParts = leftExplicit ? leftParts : rightParts
  const inferredRow = leftExplicit ? right : left
  const inferredParts = leftExplicit ? rightParts : leftParts
  if (explicitParts.partNumber.length < 4 || !hasGlyphSlipOcrQuantityToken(inferredRow)) {
    return null
  }

  if (inferredParts.partNumber.length < explicitParts.partNumber.length) {
    return explicitRow
  }

  return scoreOcrPartNumberCandidate(explicitParts.partNumber) >=
    scoreOcrPartNumberCandidate(inferredParts.partNumber)
    ? explicitRow
    : null
}

function isLikelyShortPartNumberFragmentDuplicate(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  return Boolean(getShortPartNumberFragmentReplacementCandidate(left, right, leftParts, rightParts))
}

function isLikelyBroadOverlappingQuantityReuseDuplicate(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  if (
    !left.rowRegion ||
    !right.rowRegion ||
    leftParts.quantity !== rightParts.quantity ||
    !hasExplicitOcrQuantityToken(left) ||
    !hasExplicitOcrQuantityToken(right) ||
    getRegionIntersectionRatio(left.rowRegion, right.rowRegion) < 0.2
  ) {
    return false
  }

  return Boolean(selectLessBroadQuantityReuseOcrRow(left, right))
}

function isLikelyBackedColorConflictDuplicate(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  return Boolean(
    leftParts.partNumber === rightParts.partNumber &&
      leftParts.quantity === rightParts.quantity &&
      getSequentialColorText(leftParts.colorText) !== getSequentialColorText(rightParts.colorText) &&
      selectBetterBackedColorOcrRow(left, right, leftParts, rightParts),
  )
}

function isLikelyBroadOverlappingSamePartQuantityConflictDuplicate(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  if (
    !left.rowRegion ||
    !right.rowRegion ||
    leftParts.partNumber !== rightParts.partNumber ||
    leftParts.quantity === rightParts.quantity ||
    !areCompatibleOcrColors(leftParts.colorText, rightParts.colorText) ||
    getRegionIntersectionRatio(left.rowRegion, right.rowRegion) < 0.15
  ) {
    return false
  }

  return Boolean(selectLessBroadOverlappingOcrRow(left, right, leftParts, rightParts))
}

function getShortPartNumberFragmentReplacementCandidate(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  if (
    !left.rowRegion ||
    !right.rowRegion ||
    leftParts.quantity !== rightParts.quantity ||
    !areSameSpecificOcrColors(leftParts.colorText, rightParts.colorText) ||
    getRegionIntersectionRatio(left.rowRegion, right.rowRegion) < 0.15
  ) {
    return null
  }

  if (isLikelyShortPartNumberFragmentReplacement(leftParts.partNumber, rightParts.partNumber)) {
    return left
  }

  if (isLikelyShortPartNumberFragmentReplacement(rightParts.partNumber, leftParts.partNumber)) {
    return right
  }

  return null
}

function isLikelyShortPartNumberFragmentReplacement(candidatePart: string, existingPart: string) {
  return existingPart.length <= 3 && candidatePart.length >= existingPart.length + 2
}

function areSameSpecificOcrColors(left: string, right: string) {
  const leftColor = normalizeOcrColorText(left)
  const rightColor = normalizeOcrColorText(right)
  if (!leftColor || !rightColor) {
    return false
  }

  if (/^studio-\d{1,3}$/.test(leftColor) || /^studio-\d{1,3}$/.test(rightColor)) {
    return leftColor === rightColor
  }

  const leftSequentialColor = getSequentialColorText(leftColor)
  const rightSequentialColor = getSequentialColorText(rightColor)

  return Boolean(leftSequentialColor && rightSequentialColor && leftSequentialColor === rightSequentialColor)
}

function isLikelyOcrPartNumberSubstitution(left: string, right: string) {
  const differenceIndex = getOcrPartNumberSingleDifferenceIndex(left, right)
  if (differenceIndex < 0) {
    return false
  }

  const leftCharacter = left[differenceIndex] ?? ""
  const rightCharacter = right[differenceIndex] ?? ""

  return (
    (differenceIndex === 0 && Math.min(left.length, right.length) >= 5) ||
    isLikelyPrintedPartBaseDigitSlip(left, right) ||
    /\D/.test(leftCharacter) ||
    /\D/.test(rightCharacter)
  )
}

function isLikelyPrintedPartBaseDigitSlip(left: string, right: string) {
  const leftPrint = left.match(/^(\d{3,})(p(?:b|r)?\d{1,4})$/)
  const rightPrint = right.match(/^(\d{3,})(p(?:b|r)?\d{1,4})$/)
  if (!leftPrint || !rightPrint || leftPrint[2] !== rightPrint[2]) {
    return false
  }

  return getOcrPartNumberEditDistance(leftPrint[1] ?? "", rightPrint[1] ?? "") === 1
}

function getOcrPartNumberSingleDifferenceIndex(left: string, right: string) {
  if (left.length !== right.length || getOcrPartNumberEditDistance(left, right) !== 1) {
    return -1
  }

  return Array.from({ length: left.length }).findIndex((_, index) => left[index] !== right[index])
}

function hasSingleRegionBackedOcrRow(left: OcrReconstructedRow, right: OcrReconstructedRow) {
  return Boolean(left.rowRegion) !== Boolean(right.rowRegion)
}

function isNoisySingleRegionBackedPartNumberReplacement(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  if (
    !hasSingleRegionBackedOcrRow(left, right) ||
    leftParts.quantity !== rightParts.quantity ||
    !areCompatibleOcrColors(leftParts.colorText, rightParts.colorText) ||
    !isLikelyNoisySingleRegionPartNumberReplacement(leftParts.partNumber, rightParts.partNumber)
  ) {
    return false
  }

  const regionBackedRow = left.rowRegion ? left : right
  return hasNoisyOcrColorToken(regionBackedRow)
}

function isLikelyNoisySingleRegionPartNumberReplacement(left: string, right: string) {
  const differenceIndex = getOcrPartNumberSingleDifferenceIndex(left, right)
  if (differenceIndex < 0) {
    return false
  }

  const leftCharacter = left[differenceIndex] ?? ""
  const rightCharacter = right[differenceIndex] ?? ""

  return differenceIndex === 0 || /\D/.test(leftCharacter) || /\D/.test(rightCharacter)
}

function hasNoisyOcrColorToken(row: OcrReconstructedRow) {
  return row.rawTokens.some((token) => {
    if (/\b(?:gray|grey|black)[a-z0-9]+/i.test(token)) {
      return true
    }

    const colorText = getSequentialColorText(token)
    if (!colorText) {
      return false
    }

    const residue = token
      .toLowerCase()
      .replace(/\bdark\s+bluish\s+gray/g, "")
      .replace(/\bdark\s+sis\s+gray/g, "")
      .replace(/\b(?:light|ligh|ignt)?\s*bluish\s+gray/g, "")
      .replace(/\btrans\s+neon\s+orange/g, "")
      .replace(/\btrans\s+yellow/g, "")
      .replace(/\btrans\s+red/g, "")
      .replace(/\bglowing\s+neon\s+yellow/g, "")
      .replace(/\bglowing\s+neon\s+red/g, "")
      .replace(/\bpearl\s+dark\s+gray/g, "")
      .replace(/\bpearl\s+gold/g, "")
      .replace(/\breddish\s+brown/g, "")
      .replace(/\bmedium\s+nougat/g, "")
      .replace(/\bdark\s+brown/g, "")
      .replace(/\bdark\s+purple/g, "")
      .replace(/\bdark\s+turquoise/g, "")
      .replace(/\bdark\s+tan/g, "")
      .replace(/\bflat\s+silver/g, "")
      .replace(/\btrans\s+orange/g, "")
      .replace(/\bblack\b/g, "")
      .replace(/\bblue\b/g, "")
      .replace(/\bred\b/g, "")
      .replace(/\byellow\b/g, "")
      .replace(/[^a-z0-9]+/g, "")

    return residue.length > 0
  })
}

function areCompatibleOcrColors(left: string, right: string) {
  const leftColor = getSequentialColorText(left)
  const rightColor = getSequentialColorText(right)

  return !leftColor || !rightColor || leftColor === rightColor
}

function selectBetterDuplicateOcrRow(left: OcrReconstructedRow, right: OcrReconstructedRow) {
  const mergedSingleRegionDuplicate = mergeSingleRegionBackedDuplicateOcrRow(left, right)
  if (mergedSingleRegionDuplicate) {
    return mergedSingleRegionDuplicate
  }

  const selectedByConflict = selectBetterConflictingOcrRow(left, right)
  if (selectedByConflict) {
    return selectedByConflict
  }

  return scoreDuplicateOcrRow(right) > scoreDuplicateOcrRow(left) ? right : left
}

function mergeSingleRegionBackedDuplicateOcrRow(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
) {
  if (!hasSingleRegionBackedOcrRow(left, right)) {
    return null
  }

  const leftParts = parseOcrRowParts(left.text)
  const rightParts = parseOcrRowParts(right.text)
  if (!leftParts || !rightParts) {
    return null
  }

  if (
    (!isLikelySameOcrPartNumber(leftParts.partNumber, rightParts.partNumber) &&
      !isLikelyNoisySingleRegionPartNumberReplacement(leftParts.partNumber, rightParts.partNumber) &&
      leftParts.partNumber !== rightParts.partNumber) ||
    (!areCompatibleOcrColors(leftParts.colorText, rightParts.colorText) &&
      (leftParts.partNumber !== rightParts.partNumber ||
        leftParts.quantity !== rightParts.quantity ||
        !hasReliableSingleRegionBackedOcrRow(left, right)))
  ) {
    return null
  }

  if (
    leftParts.quantity !== rightParts.quantity &&
    getSequentialColorText(leftParts.colorText) !== getSequentialColorText(rightParts.colorText)
  ) {
    return null
  }

  const regionBackedRow = left.rowRegion ? left : right
  const textCandidate = selectBetterSingleRegionDuplicateText(left, right, leftParts, rightParts)

  return {
    ...regionBackedRow,
    text: textCandidate.text,
  }
}

function selectBetterSingleRegionDuplicateText(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  if (isNoisySingleRegionBackedPartNumberReplacement(left, right, leftParts, rightParts)) {
    return left.rowRegion ? right : left
  }

  if (
    leftParts.quantity === rightParts.quantity &&
    areCompatibleOcrColors(leftParts.colorText, rightParts.colorText) &&
    isLikelyNoisySingleRegionPartNumberReplacement(leftParts.partNumber, rightParts.partNumber)
  ) {
    return left.rowRegion ? right : left
  }

  if (
    leftParts.partNumber === rightParts.partNumber &&
    leftParts.quantity === rightParts.quantity &&
    !areCompatibleOcrColors(leftParts.colorText, rightParts.colorText)
  ) {
    const selectedBackedColor = selectBetterBackedColorOcrRow(left, right, leftParts, rightParts)
    if (selectedBackedColor) {
      return selectedBackedColor
    }
  }

  if (
    leftParts.partNumber === rightParts.partNumber &&
    leftParts.quantity === rightParts.quantity &&
    hasReliableSingleRegionBackedOcrRow(left, right)
  ) {
    return left.rowRegion ? left : right
  }

  if (leftParts.partNumber === rightParts.partNumber && leftParts.quantity !== rightParts.quantity) {
    const textOnlyAgainstBroadRegion = selectTextOnlyAgainstBroadRegionQuantityReuseRow(
      left,
      right,
      leftParts,
      rightParts,
    )
    if (textOnlyAgainstBroadRegion) {
      return textOnlyAgainstBroadRegion
    }

    const explicitRegionBackedRow = selectExplicitSingleRegionBackedOcrRow(left, right)
    if (explicitRegionBackedRow) {
      return explicitRegionBackedRow
    }

    const explicitQuantityRow = selectExplicitQuantityOcrRow(left, right)
    if (explicitQuantityRow) {
      return explicitQuantityRow
    }

    if (left.sourceRank !== right.sourceRank) {
      return left.sourceRank < right.sourceRank ? left : right
    }

    return rightParts.quantity > leftParts.quantity ? right : left
  }

  return scoreDuplicateOcrRow(right) > scoreDuplicateOcrRow(left) ? right : left
}

function selectExplicitQuantityOcrRow(left: OcrReconstructedRow, right: OcrReconstructedRow) {
  const leftExplicit = hasExplicitOcrQuantityToken(left)
  const rightExplicit = hasExplicitOcrQuantityToken(right)

  return leftExplicit === rightExplicit ? null : leftExplicit ? left : right
}

function selectExplicitSingleRegionBackedOcrRow(left: OcrReconstructedRow, right: OcrReconstructedRow) {
  if (!hasSingleRegionBackedOcrRow(left, right)) {
    return null
  }

  const regionBackedRow = left.rowRegion ? left : right
  return hasExplicitOcrQuantityToken(regionBackedRow) ? regionBackedRow : null
}

function selectTextOnlyAgainstBroadRegionQuantityReuseRow(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  if (!hasSingleRegionBackedOcrRow(left, right)) {
    return null
  }

  const regionBackedRow = left.rowRegion ? left : right
  const textOnlyRow = left.rowRegion ? right : left
  const regionBackedParts = left.rowRegion ? leftParts : rightParts
  const textOnlyParts = left.rowRegion ? rightParts : leftParts

  return (
    isLikelyBroadSwallowedTrailingOcrRow(regionBackedRow, regionBackedParts) &&
      hasTextOnlyQuantityBeforePart(textOnlyRow, textOnlyParts)
  )
    ? textOnlyRow
    : null
}

function selectBetterConflictingOcrRow(left: OcrReconstructedRow, right: OcrReconstructedRow) {
  const leftParts = parseOcrRowParts(left.text)
  const rightParts = parseOcrRowParts(right.text)
  if (!leftParts || !rightParts) {
    return null
  }

  const selectedSameRegionRead = selectBetterSameRegionOcrReadDuplicate(left, right, leftParts, rightParts)
  if (selectedSameRegionRead) {
    return selectedSameRegionRead
  }

  const selectedExplicitQuantityReplacement = getExplicitQuantityReplacementCandidate(
    left,
    right,
    leftParts,
    rightParts,
  )
  if (selectedExplicitQuantityReplacement) {
    return selectedExplicitQuantityReplacement
  }

  const selectedShortPartNumberFragment = getShortPartNumberFragmentReplacementCandidate(
    left,
    right,
    leftParts,
    rightParts,
  )
  if (selectedShortPartNumberFragment) {
    return selectedShortPartNumberFragment
  }

  const selectedCroppedPartNumberPrefix = getCroppedOcrPartNumberPrefixReplacementCandidate(
    left,
    right,
    leftParts,
    rightParts,
  )
  if (selectedCroppedPartNumberPrefix) {
    return selectedCroppedPartNumberPrefix
  }

  const selectedBackedColor = selectBetterBackedColorOcrRow(left, right, leftParts, rightParts)
  if (selectedBackedColor) {
    return selectedBackedColor
  }

  if (!areCompatibleOcrColors(leftParts.colorText, rightParts.colorText)) {
    const selectedSpecificColor = selectMoreSpecificOverlappingOcrColorRow(left, right, leftParts, rightParts)
    if (selectedSpecificColor) {
      return selectedSpecificColor
    }

    const selectedQuantityReuse = selectLessBroadQuantityReuseOcrRow(left, right)
    if (selectedQuantityReuse) {
      return selectedQuantityReuse
    }

    return selectLessBroadOverlappingOcrRow(left, right, leftParts, rightParts)
  }

  if (!left.rowRegion && !right.rowRegion && leftParts.partNumber === rightParts.partNumber) {
    const selectedTextOrder = selectBetterTextOnlyQuantityOrderOcrRow(left, right, leftParts, rightParts)
    if (selectedTextOrder) {
      return selectedTextOrder
    }

    return rightParts.quantity > leftParts.quantity ? right : left
  }

  if (
    left.rowRegion &&
    right.rowRegion &&
    leftParts.partNumber === rightParts.partNumber &&
    getRegionIntersectionRatio(left.rowRegion, right.rowRegion) >= 0.2
  ) {
    if (leftParts.quantity !== rightParts.quantity) {
      if (left.sourceRank !== right.sourceRank) {
        return left.sourceRank < right.sourceRank ? left : right
      }

      return rightParts.quantity > leftParts.quantity ? right : left
    }

    const selectedLessBroad = selectLessBroadOverlappingOcrRow(left, right, leftParts, rightParts)
    if (selectedLessBroad) {
      return selectedLessBroad
    }
  }

  if (leftParts.quantity !== rightParts.quantity || leftParts.partNumber === rightParts.partNumber) {
    return null
  }

  const selectedFirstDigitCorrection = selectBetterFirstDigitOcrRow(left, right, leftParts, rightParts)
  if (selectedFirstDigitCorrection) {
    return selectedFirstDigitCorrection
  }

  const selectedRawPartEvidence = selectBetterRawPartEvidenceOcrRow(left, right, leftParts, rightParts)
  if (selectedRawPartEvidence) {
    return selectedRawPartEvidence
  }

  const leftPartNumberScore = scoreOcrPartNumberCandidate(leftParts.partNumber)
  const rightPartNumberScore = scoreOcrPartNumberCandidate(rightParts.partNumber)
  if (leftPartNumberScore !== rightPartNumberScore) {
    return rightPartNumberScore > leftPartNumberScore ? right : left
  }

  if (!left.rowRegion && right.rowRegion) {
    return left
  }

  if (left.rowRegion && !right.rowRegion) {
    return right
  }

  return null
}

function selectBetterTextOnlyQuantityOrderOcrRow(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  const leftHasQuantityBeforePart = hasTextOnlyQuantityBeforePart(left, leftParts)
  const rightHasQuantityBeforePart = hasTextOnlyQuantityBeforePart(right, rightParts)

  return leftHasQuantityBeforePart === rightHasQuantityBeforePart
    ? null
    : rightHasQuantityBeforePart ? right : left
}

function selectBetterBackedColorOcrRow(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  if (
    leftParts.partNumber !== rightParts.partNumber ||
    leftParts.quantity !== rightParts.quantity ||
    getSequentialColorText(leftParts.colorText) === getSequentialColorText(rightParts.colorText)
  ) {
    return null
  }

  const leftColor = getSequentialColorText(leftParts.colorText)
  const rightColor = getSequentialColorText(rightParts.colorText)
  const leftBacked = Boolean(leftColor && isOcrRowColorBackedByRawTokens(left, leftColor))
  const rightBacked = Boolean(rightColor && isOcrRowColorBackedByRawTokens(right, rightColor))

  return leftBacked === rightBacked ? null : leftBacked ? left : right
}

function hasTextOnlyQuantityBeforePart(row: OcrReconstructedRow, parts: OcrRowParts) {
  const partTokenIndex = row.rawTokens.findIndex((token) => isExactOcrPartToken(token, parts.partNumber))
  if (partTokenIndex < 0) {
    return false
  }

  const quantityTokenIndex = row.rawTokens.findIndex((token) => {
    const quantities = getSequentialQuantityTokens(token, 0)
    return quantities.some((quantity) => quantity.quantity === parts.quantity)
  })

  return quantityTokenIndex >= 0 && quantityTokenIndex <= partTokenIndex
}

function isExactOcrPartToken(token: string, partNumber: string) {
  return normalizeOcrPartNumber(token.trim()) === partNumber
}

function selectBetterSameRegionOcrReadDuplicate(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  if (!isLikelySameRegionOcrReadDuplicate(left, right, leftParts, rightParts)) {
    return null
  }

  if (left.sourceRank !== right.sourceRank) {
    return left.sourceRank < right.sourceRank ? left : right
  }

  const leftScore = scoreOcrPartNumberCandidate(leftParts.partNumber)
  const rightScore = scoreOcrPartNumberCandidate(rightParts.partNumber)
  if (leftScore !== rightScore) {
    return rightScore > leftScore ? right : left
  }

  return left
}

function selectBetterRawPartEvidenceOcrRow(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  const leftHasExactRawPart = hasExactRawPartToken(left, leftParts.partNumber)
  const rightHasExactRawPart = hasExactRawPartToken(right, rightParts.partNumber)

  return leftHasExactRawPart === rightHasExactRawPart ? null : rightHasExactRawPart ? right : left
}

function hasExactRawPartToken(row: OcrReconstructedRow, partNumber: string) {
  return row.rawTokens.some((token) => {
    const compactToken = token
      .replace(/[¢©]/g, "c")
      .replace(/\s+/g, "")
      .toLowerCase()

    return compactToken === partNumber
  })
}

function hasExplicitOcrQuantityToken(row: OcrReconstructedRow | PartsListPageRowSource) {
  return row.rawTokens.some((token) => /(?:^|[^a-z0-9])\d{1,3}\s*x(?:[^a-z0-9]|$)/i.test(token))
}

function hasGlyphSlipOcrQuantityToken(row: OcrReconstructedRow | PartsListPageRowSource) {
  return row.rawTokens.some((token) => isOcrQuantityGlyphSlip(token))
}

function selectLessBroadQuantityReuseOcrRow(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
) {
  if (!left.rowRegion || !right.rowRegion) {
    return null
  }

  const leftAspect = getOcrRegionAspectRatio(left)
  const rightAspect = getOcrRegionAspectRatio(right)
  const leftArea = getOcrRegionArea(left)
  const rightArea = getOcrRegionArea(right)
  let selectedCompactRow: OcrReconstructedRow | null = null
  if (leftAspect >= 6 && leftAspect >= rightAspect * 1.5) {
    selectedCompactRow = right
  }

  if (!selectedCompactRow && rightAspect >= 6 && rightAspect >= leftAspect * 1.5) {
    selectedCompactRow = left
  }

  if (!selectedCompactRow && leftArea >= rightArea * 3 && leftAspect >= 4.5) {
    selectedCompactRow = right
  }

  if (!selectedCompactRow && rightArea >= leftArea * 3 && rightAspect >= 4.5) {
    selectedCompactRow = left
  }

  if (!selectedCompactRow) {
    return null
  }

  const broadRow = selectedCompactRow === left ? right : left
  return isLikelySwallowedCompactQuantityReuseRow(broadRow, selectedCompactRow)
    ? selectedCompactRow
    : null
}

function isLikelySwallowedCompactQuantityReuseRow(
  broadRow: OcrReconstructedRow,
  compactRow: OcrReconstructedRow,
) {
  if (!broadRow.rowRegion || !compactRow.rowRegion) {
    return false
  }

  const broadRegion = broadRow.rowRegion
  const compactRegion = compactRow.rowRegion
  const compactCenterX = compactRegion.x + compactRegion.width / 2
  const compactCenterY = compactRegion.y + compactRegion.height / 2
  const broadCenterY = broadRegion.y + broadRegion.height / 2
  const horizontalMargin = Math.max(12, compactRegion.width * 0.4)
  const verticalMargin = Math.max(8, Math.max(broadRegion.height, compactRegion.height) * 0.55)

  return (
    getRegionIntersectionRatio(broadRegion, compactRegion) >= 0.55 &&
    compactRegion.width <= broadRegion.width * 0.45 &&
    compactCenterX >= broadRegion.x - horizontalMargin &&
    compactCenterX <= broadRegion.x + broadRegion.width + horizontalMargin &&
    Math.abs(compactCenterY - broadCenterY) <= verticalMargin
  )
}

function selectLessBroadOverlappingOcrRow(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  if (
    !left.rowRegion ||
    !right.rowRegion ||
    leftParts.partNumber !== rightParts.partNumber ||
    getRegionIntersectionRatio(left.rowRegion, right.rowRegion) < 0.15
  ) {
    return null
  }

  const leftAspect = getOcrRegionAspectRatio(left)
  const rightAspect = getOcrRegionAspectRatio(right)
  const leftArea = getOcrRegionArea(left)
  const rightArea = getOcrRegionArea(right)
  if (leftAspect >= 5 && leftAspect >= rightAspect * 1.5) {
    return right
  }

  if (rightAspect >= 5 && rightAspect >= leftAspect * 1.5) {
    return left
  }

  if (leftArea >= rightArea * 4) {
    return right
  }

  if (rightArea >= leftArea * 4) {
    return left
  }

  return null
}

function selectMoreSpecificOverlappingOcrColorRow(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  if (
    !left.rowRegion ||
    !right.rowRegion ||
    leftParts.partNumber !== rightParts.partNumber ||
    leftParts.quantity !== rightParts.quantity ||
    getRegionIntersectionRatio(left.rowRegion, right.rowRegion) < 0.1 ||
    !isLikelyLessSpecificOcrColorDuplicate(leftParts.colorText, rightParts.colorText)
  ) {
    return null
  }

  return scoreOcrColorSpecificity(rightParts.colorText) > scoreOcrColorSpecificity(leftParts.colorText)
    ? right
    : left
}

function isLikelyLessSpecificOcrColorDuplicate(left: string, right: string) {
  const leftColor = getSequentialColorText(left)
  const rightColor = getSequentialColorText(right)
  if (!leftColor || !rightColor || leftColor === rightColor) {
    return false
  }

  if (
    (leftColor === "Red" && rightColor === "Reddish Brown") ||
    (leftColor === "Reddish Brown" && rightColor === "Red")
  ) {
    return true
  }

  return (
    getOcrColorBaseFamily(leftColor) === getOcrColorBaseFamily(rightColor) &&
    scoreOcrColorSpecificity(leftColor) !== scoreOcrColorSpecificity(rightColor)
  )
}

function getOcrColorBaseFamily(colorText: string) {
  const color = getSequentialColorText(colorText) ?? colorText
  return color
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/\b(?:bluish|bright|dark|flat|glowing|light|medium|neon|pearl|reddish|trans|transparent)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function scoreOcrColorSpecificity(colorText: string) {
  const color = getSequentialColorText(colorText) ?? colorText
  return color.replace(/-/g, " ").split(/\s+/).filter(Boolean).length
}

function getOcrRegionAspectRatio(row: OcrReconstructedRow) {
  if (!row.rowRegion) {
    return 0
  }

  return row.rowRegion.width / Math.max(1, row.rowRegion.height)
}

function getOcrRegionArea(row: OcrReconstructedRow) {
  return row.rowRegion ? row.rowRegion.width * row.rowRegion.height : 0
}

function selectBetterFirstDigitOcrRow(
  left: OcrReconstructedRow,
  right: OcrReconstructedRow,
  leftParts: OcrRowParts,
  rightParts: OcrRowParts,
) {
  const leftSuffix = leftParts.partNumber.slice(1)
  const rightSuffix = rightParts.partNumber.slice(1)
  if (leftSuffix !== rightSuffix) {
    return null
  }

  if (leftParts.partNumber.startsWith("8") && rightParts.partNumber.startsWith("3")) {
    return left
  }

  if (leftParts.partNumber.startsWith("3") && rightParts.partNumber.startsWith("8")) {
    return right
  }

  return null
}

function scoreOcrPartNumberCandidate(partNumber: string) {
  let score = partNumber.length
  if (/p(?:b|r)\d/i.test(partNumber)) {
    score += 2
  }
  if (/ph\d/i.test(partNumber)) {
    score -= 2
  }

  return score
}

function scoreDuplicateOcrRow(row: OcrReconstructedRow) {
  const rowRegionArea = row.rowRegion ? row.rowRegion.width * row.rowRegion.height : 500_000
  const compactnessScore = row.rowRegion ? Math.max(0, 3 - rowRegionArea / 45_000) : 0
  const textEvidenceScore = !row.rowRegion && row.rawTokens.length > 0 ? 1 : 0

  return scoreOcrRowText(row.text) * 10 + compactnessScore + textEvidenceScore
}

function getRegionIntersectionRatio(left: PartsListSourceRegion, right: PartsListSourceRegion) {
  const overlapLeft = Math.max(left.x, right.x)
  const overlapTop = Math.max(left.y, right.y)
  const overlapRight = Math.min(left.x + left.width, right.x + right.width)
  const overlapBottom = Math.min(left.y + left.height, right.y + right.height)
  const overlapWidth = Math.max(0, overlapRight - overlapLeft)
  const overlapHeight = Math.max(0, overlapBottom - overlapTop)
  const overlapArea = overlapWidth * overlapHeight
  const smallerArea = Math.min(left.width * left.height, right.width * right.height)

  return smallerArea > 0 ? overlapArea / smallerArea : 0
}

function getOcrPartNumberEditDistance(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) {
    return 2
  }

  if (left.length === right.length) {
    let substitutions = 0
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        substitutions += 1
      }
    }

    return substitutions
  }

  const shorter = left.length < right.length ? left : right
  const longer = left.length < right.length ? right : left
  let edits = 0
  let shortIndex = 0
  let longIndex = 0

  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1
      longIndex += 1
      continue
    }

    edits += 1
    longIndex += 1
  }

  return edits + (longer.length - longIndex)
}

function createOcrDeadlineAt(deadlineMs: number | null | undefined) {
  return deadlineMs == null ? null : performance.now() + deadlineMs
}

function getRemainingOcrMs(deadlineAt: number | null) {
  return deadlineAt === null ? Number.POSITIVE_INFINITY : deadlineAt - performance.now()
}

function runWithOcrDeadline<T>(
  promise: Promise<T>,
  remainingMs: () => number,
  signal?: AbortSignal,
  {
    onCancel,
    onDeadline,
  }: {
    onCancel?: () => void
    onDeadline?: () => void
  } = {},
): Promise<T> {
  try {
    assertOcrCanContinue(remainingMs, signal)
  } catch (error) {
    if (error instanceof PartsListOcrCancelledError) {
      onCancel?.()
    } else if (error instanceof PartsListOcrDeadlineExceededError) {
      onDeadline?.()
    }

    throw error
  }

  return new Promise<T>((resolve, reject) => {
    const remaining = remainingMs()
    const timeoutId = Number.isFinite(remaining)
      ? window.setTimeout(() => {
          onDeadline?.()
          cleanup()
          reject(new PartsListOcrDeadlineExceededError())
        }, Math.max(1, remaining))
      : null

    const abort = () => {
      onCancel?.()
      cleanup()
      reject(new PartsListOcrCancelledError())
    }

    const cleanup = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      signal?.removeEventListener("abort", abort)
    }

    signal?.addEventListener("abort", abort, { once: true })

    promise.then(
      (result) => {
        cleanup()
        resolve(result)
      },
      (error: unknown) => {
        cleanup()
        reject(error)
      },
    )
  })
}

function assertOcrCanContinue(remainingMs: () => number, signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new PartsListOcrCancelledError()
  }

  const remaining = remainingMs()
  if (Number.isFinite(remaining) && remaining <= 0) {
    throw new PartsListOcrDeadlineExceededError()
  }
}

export class PartsListOcrDeadlineExceededError extends Error {
  constructor() {
    super("Parts list OCR exceeded the extraction deadline.")
    this.name = "PartsListOcrDeadlineExceededError"
  }
}

export class PartsListOcrCancelledError extends Error {
  constructor() {
    super("Parts list OCR was cancelled.")
    this.name = "PartsListOcrCancelledError"
  }
}
