import type * as PdfJs from "pdfjs-dist"
import {
  PdfIntakeError,
  type PdfMetadata,
  normalizePdfIntakeError,
  validatePdfFile,
} from "./pdf-intake"

type PdfDocument = {
  numPages: number
  getMetadata: () => Promise<{ info: Record<string, unknown> }>
  getPage: (pageNumber: number) => Promise<PdfPage>
  destroy: () => Promise<void>
}

type PdfPage = {
  getViewport: (params: { scale: number }) => { width: number; height: number }
  render: (params: {
    canvasContext: CanvasRenderingContext2D
    viewport: { width: number; height: number }
  }) => { promise: Promise<void>; cancel: () => void }
}

export type PdfPageRenderResult = {
  canvas: HTMLCanvasElement
  width: number
  height: number
  scale: number
}

let workerConfigured = false

export async function readPdfMetadataFromFile(
  file: File,
  options: { signal?: AbortSignal } = {},
): Promise<PdfMetadata> {
  const validation = validatePdfFile(file)
  if (!validation.ok) {
    throw validation.error
  }

  return withPdfDocument(file, options.signal, async (document) => {
    const metadata = await document.getMetadata()
    throwIfAborted(options.signal)

    return {
      fileName: file.name,
      sizeBytes: file.size,
      pageCount: document.numPages,
      title: readStringMetadata(metadata.info, "Title"),
      author: readStringMetadata(metadata.info, "Author"),
    }
  })
}

export async function renderPdfPageToCanvas(
  file: File,
  pageNumber: number,
  options: { maxWidth?: number; signal?: AbortSignal } = {},
): Promise<PdfPageRenderResult> {
  const maxWidth = options.maxWidth ?? 1400

  return withPdfDocument(file, options.signal, async (document) => {
    if (pageNumber < 1 || pageNumber > document.numPages) {
      throw new PdfIntakeError(
        "unknown",
        `Page ${pageNumber} is outside the PDF page range.`,
      )
    }

    const page = await document.getPage(pageNumber)
    throwIfAborted(options.signal)

    const nativeViewport = page.getViewport({ scale: 1 })
    const scale = Math.min(1, maxWidth / nativeViewport.width)
    const viewport = page.getViewport({ scale })
    const canvas = window.document.createElement("canvas")
    const context = canvas.getContext("2d")

    if (!context) {
      throw new PdfIntakeError("unknown", "Canvas rendering is unavailable in this browser.")
    }

    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)

    const renderTask = page.render({
      canvasContext: context,
      viewport,
    })
    const abortRender = () => renderTask.cancel()
    options.signal?.addEventListener("abort", abortRender, { once: true })

    try {
      await renderTask.promise
      throwIfAborted(options.signal)

      return {
        canvas,
        width: canvas.width,
        height: canvas.height,
        scale,
      }
    } catch (error) {
      throw normalizePdfIntakeError(error)
    } finally {
      options.signal?.removeEventListener("abort", abortRender)
    }
  })
}

async function withPdfDocument<T>(
  file: File,
  signal: AbortSignal | undefined,
  read: (document: PdfDocument) => Promise<T>,
): Promise<T> {
  throwIfAborted(signal)

  try {
    const pdfjs = await loadPdfJs()
    const bytes = new Uint8Array(await file.arrayBuffer())
    throwIfAborted(signal)

    const loadingTask = pdfjs.getDocument({
      data: bytes,
      disableFontFace: true,
      isEvalSupported: false,
      stopAtErrors: true,
      useSystemFonts: false,
    })
    const abortLoad = () => {
      void loadingTask.destroy()
    }
    signal?.addEventListener("abort", abortLoad, { once: true })

    try {
      const document = (await loadingTask.promise) as unknown as PdfDocument
      throwIfAborted(signal)

      try {
        return await read(document)
      } finally {
        await document.destroy()
      }
    } finally {
      signal?.removeEventListener("abort", abortLoad)
    }
  } catch (error) {
    throw normalizePdfIntakeError(error)
  }
}

async function loadPdfJs(): Promise<typeof PdfJs> {
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

function readStringMetadata(info: Record<string, unknown>, key: string): string | null {
  const value = info[key]

  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("PDF intake aborted.", "AbortError")
  }
}
