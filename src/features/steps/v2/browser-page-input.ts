import {
  PdfIntakeError,
  normalizePdfIntakeError,
  validatePdfFile,
} from "@/features/pdf/pdf-intake"
import {
  createPageInputStageSnapshot,
  createStepCalloutPageInput,
  type StepCalloutPageInput as StepDetectorV2PageInput,
} from "@bag-it/step-callouts"
import { STEP_DETECTOR_V2_DEFAULT_RENDER_MAX_WIDTH } from "./render-widths"

const PDF_RENDER_ANALYSIS_DEVICE_PIXEL_RATIO = 1

interface PdfDocument {
  destroy: () => Promise<void>
  getPage: (pageNumber: number) => Promise<PdfPage>
  numPages: number
}

interface PdfPage {
  cleanup?: () => void
  getViewport: (params: { scale: number }) => PdfViewport
  render: (params: {
    canvasContext: CanvasRenderingContext2D
    viewport: PdfViewport
  }) => PdfRenderTask
}

interface PdfRenderTask {
  cancel: () => void
  promise: Promise<void>
}

interface PdfViewport {
  height: number
  transform: number[]
  width: number
}

interface DetectionViewport {
  scale: number
  viewport: PdfViewport
}

interface LoadedPdfDocument {
  document: PdfDocument
}

interface RenderedPagePixels {
  data: Uint8ClampedArray
  height: number
  width: number
}

interface RenderV2PageOptions {
  allowUpscale: boolean
  renderMaxWidth: number
  signal?: AbortSignal
}

export interface ReadStepDetectorV2PageInputsOptions {
  allowUpscale?: boolean
  maxPages?: number
  onPageInput?: (pageInput: StepDetectorV2PageInput) => void
  pageNumbers?: readonly number[]
  renderMaxWidth?: number
  signal?: AbortSignal
}

export interface ReadStepDetectorV2PageInputsResult {
  pageCount: number
  pages: StepDetectorV2PageInput[]
  snapshot: ReturnType<typeof createPageInputStageSnapshot>
}

export type VisitStepDetectorV2PageInput = (
  pageInput: StepDetectorV2PageInput,
) => Promise<void> | void

export interface VisitStepDetectorV2PageInputsOptions {
  allowUpscale?: boolean
  batchSize?: number
  maxPages?: number
  pageNumbers?: readonly number[]
  pickNextPageNumbers?: (remainingPageNumbers: readonly number[]) => readonly number[]
  renderMaxWidth?: number
  signal?: AbortSignal
}

export interface VisitStepDetectorV2PageInputsResult {
  pageCount: number
  processedPageCount: number
}

let workerConfigured = false

export async function readStepDetectorV2PageInputsFromFile(
  file: File,
  options: ReadStepDetectorV2PageInputsOptions = {},
): Promise<ReadStepDetectorV2PageInputsResult> {
  const validation = validatePdfFile(file)

  if (!validation.ok) {
    throw validation.error
  }

  const loaded = await loadPdfDocument(file, options.signal)

  try {
    const pages = await readPageInputs(loaded, options)

    return {
      pageCount: loaded.document.numPages,
      pages,
      snapshot: createPageInputStageSnapshot(pages),
    }
  } catch (error) {
    throw normalizePdfIntakeError(error)
  } finally {
    await loaded.document.destroy()
  }
}

export async function visitStepDetectorV2PageInputsFromFile(
  file: File,
  visitPageInput: VisitStepDetectorV2PageInput,
  options: VisitStepDetectorV2PageInputsOptions = {},
): Promise<VisitStepDetectorV2PageInputsResult> {
  const validation = validatePdfFile(file)

  if (!validation.ok) {
    throw validation.error
  }

  const loaded = await loadPdfDocument(file, options.signal)

  try {
    const processedPageCount = await visitPageInputs(loaded, options, visitPageInput)

    return {
      pageCount: loaded.document.numPages,
      processedPageCount,
    }
  } catch (error) {
    throw normalizePdfIntakeError(error)
  } finally {
    await loaded.document.destroy()
  }
}

async function readPageInputs(
  loaded: LoadedPdfDocument,
  options: ReadStepDetectorV2PageInputsOptions,
): Promise<StepDetectorV2PageInput[]> {
  const pageInputs: StepDetectorV2PageInput[] = []

  await visitPageInputs(loaded, options, (pageInput) => {
    pageInputs.push(pageInput)
    options.onPageInput?.(pageInput)
  })

  return pageInputs
}

async function visitPageInputs(
  loaded: LoadedPdfDocument,
  options: VisitStepDetectorV2PageInputsOptions,
  visitPageInput: VisitStepDetectorV2PageInput,
): Promise<number> {
  let processedPageCount = 0
  const pendingPageNumbers = resolvePageNumbers(loaded.document.numPages, options.maxPages, options.pageNumbers)
  const renderOptions = createRenderOptions(options)
  const batchSize = normalizeBatchSize(options.batchSize)

  while (pendingPageNumbers.length > 0) {
    throwIfAborted(options.signal)
    const batch = selectNextPageBatch(pendingPageNumbers, batchSize, options.pickNextPageNumbers)
    const pages = await Promise.all(
      batch.map((pageNumber) =>
        renderStepDetectorV2PageInput(
          loaded.document,
          pageNumber,
          renderOptions,
        ),
      ),
    )

    removePageNumbers(pendingPageNumbers, batch)

    for (const pageInput of pages) {
      await visitPageInput(pageInput)
      processedPageCount += 1
    }
  }

  return processedPageCount
}

function normalizeBatchSize(batchSize: number | undefined): number {
  if (!batchSize || !Number.isFinite(batchSize)) {
    return 1
  }

  return Math.max(1, Math.floor(batchSize))
}

function selectNextPageBatch(
  pendingPageNumbers: readonly number[],
  batchSize: number,
  pickNextPageNumbers: VisitStepDetectorV2PageInputsOptions["pickNextPageNumbers"],
): number[] {
  const pickedPageNumbers = pickNextPageNumbers?.(pendingPageNumbers) ?? pendingPageNumbers
  const pending = new Set(pendingPageNumbers)
  const picked = pickedPageNumbers.filter((pageNumber) => pending.has(pageNumber))
  const orderedPageNumbers = picked.length > 0
    ? [...new Set([...picked, ...pendingPageNumbers])]
    : pendingPageNumbers

  return orderedPageNumbers.slice(0, batchSize)
}

function removePageNumbers(
  pendingPageNumbers: number[],
  pageNumbersToRemove: readonly number[],
): void {
  const remove = new Set(pageNumbersToRemove)

  for (let index = pendingPageNumbers.length - 1; index >= 0; index -= 1) {
    if (remove.has(pendingPageNumbers[index])) {
      pendingPageNumbers.splice(index, 1)
    }
  }
}

async function renderStepDetectorV2PageInput(
  document: PdfDocument,
  pageNumber: number,
  options: RenderV2PageOptions,
): Promise<StepDetectorV2PageInput> {
  const page = await document.getPage(pageNumber)

  try {
    const detectionViewport = createDetectionViewport(page, options.renderMaxWidth, options.allowUpscale)
    const pixels = await withDeterministicPdfRenderPixelRatio(() =>
      renderPagePixels(page, detectionViewport.viewport, options.signal)
    )
    return createStepCalloutPageInput({
      ...pixels,
      pageNumber,
    })
  } finally {
    page.cleanup?.()
  }
}

let devicePixelRatioOverrideDepth = 0
let originalDevicePixelRatioDescriptor: PropertyDescriptor | undefined
let hasOwnDevicePixelRatio = false

async function withDeterministicPdfRenderPixelRatio<T>(run: () => Promise<T>): Promise<T> {
  const restoredByThisCall = pushPdfRenderPixelRatioOverride()

  try {
    return await run()
  } finally {
    if (restoredByThisCall) {
      popPdfRenderPixelRatioOverride()
    }
  }
}

function pushPdfRenderPixelRatioOverride(): boolean {
  if (devicePixelRatioOverrideDepth === 0) {
    hasOwnDevicePixelRatio = Object.hasOwn(globalThis, "devicePixelRatio")
    originalDevicePixelRatioDescriptor = Object.getOwnPropertyDescriptor(globalThis, "devicePixelRatio")
  }

  devicePixelRatioOverrideDepth += 1

  try {
    Object.defineProperty(globalThis, "devicePixelRatio", {
      configurable: true,
      get: () => PDF_RENDER_ANALYSIS_DEVICE_PIXEL_RATIO,
    })
    return true
  } catch {
    devicePixelRatioOverrideDepth -= 1
    return false
  }
}

function popPdfRenderPixelRatioOverride(): void {
  devicePixelRatioOverrideDepth = Math.max(0, devicePixelRatioOverrideDepth - 1)

  if (devicePixelRatioOverrideDepth > 0) {
    return
  }

  if (hasOwnDevicePixelRatio && originalDevicePixelRatioDescriptor) {
    Object.defineProperty(globalThis, "devicePixelRatio", originalDevicePixelRatioDescriptor)
  } else {
    delete (globalThis as { devicePixelRatio?: number }).devicePixelRatio
  }

  originalDevicePixelRatioDescriptor = undefined
  hasOwnDevicePixelRatio = false
}

async function renderPagePixels(
  page: PdfPage,
  viewport: PdfViewport,
  signal: AbortSignal | undefined,
): Promise<RenderedPagePixels> {
  const canvas = window.document.createElement("canvas")
  const context = canvas.getContext("2d", { willReadFrequently: true })

  if (!context) {
    throw new PdfIntakeError("unknown", "Canvas rendering is unavailable in this browser.")
  }

  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)

  await renderToCanvas(page, context, viewport, signal)

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)

  return {
    data: new Uint8ClampedArray(imageData.data),
    height: canvas.height,
    width: canvas.width,
  }
}

async function renderToCanvas(
  page: PdfPage,
  context: CanvasRenderingContext2D,
  viewport: PdfViewport,
  signal: AbortSignal | undefined,
): Promise<void> {
  const renderTask = page.render({
    canvasContext: context,
    viewport,
  })
  const abortRender = () => renderTask.cancel()
  signal?.addEventListener("abort", abortRender, { once: true })

  try {
    await renderTask.promise
    throwIfAborted(signal)
  } finally {
    signal?.removeEventListener("abort", abortRender)
  }
}

async function loadPdfDocument(
  file: File,
  signal: AbortSignal | undefined,
): Promise<LoadedPdfDocument> {
  throwIfAborted(signal)

  const pdfjs = await loadPdfJs()
  const bytes = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    disableFontFace: true,
    isEvalSupported: false,
    stopAtErrors: true,
    useSystemFonts: false,
  })
  const abortLoad = () => {
    loadingTask.destroy()
  }
  signal?.addEventListener("abort", abortLoad, { once: true })

  try {
    const document = (await loadingTask.promise) as unknown as PdfDocument
    throwIfAborted(signal)

  return {
    document,
  }
  } catch (error) {
    throw normalizePdfIntakeError(error)
  } finally {
    signal?.removeEventListener("abort", abortLoad)
  }
}

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist")

  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString()
    workerConfigured = true
  }

  return pdfjs
}

function createDetectionViewport(page: PdfPage, renderMaxWidth: number, allowUpscale: boolean): DetectionViewport {
  const nativeViewport = page.getViewport({ scale: 1 })
  const scale = allowUpscale
    ? renderMaxWidth / nativeViewport.width
    : Math.min(1, renderMaxWidth / nativeViewport.width)

  return {
    scale,
    viewport: page.getViewport({ scale }),
  }
}

function createRenderOptions(
  options: ReadStepDetectorV2PageInputsOptions,
): RenderV2PageOptions {
  return {
    allowUpscale: options.allowUpscale === true,
    renderMaxWidth: options.renderMaxWidth ?? STEP_DETECTOR_V2_DEFAULT_RENDER_MAX_WIDTH,
    signal: options.signal,
  }
}

function resolvePageNumbers(
  pageCount: number,
  maxPages: number | undefined,
  pageNumbers: readonly number[] | undefined,
): number[] {
  const pageLimit = resolvePageLimit(pageCount, maxPages)

  if (!pageNumbers) {
    return Array.from({ length: pageLimit }, (_, index) => index + 1)
  }

  return [...new Set(pageNumbers)]
    .filter((pageNumber) => Number.isInteger(pageNumber))
    .filter((pageNumber) => pageNumber >= 1 && pageNumber <= pageLimit)
    .sort((left, right) => left - right)
}

function resolvePageLimit(pageCount: number, maxPages: number | undefined): number {
  if (maxPages === undefined) {
    return pageCount
  }

  return Math.min(pageCount, Math.max(0, Math.floor(maxPages)))
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("PDF intake aborted.", "AbortError")
  }
}
