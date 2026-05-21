export const maxPdfSizeBytes = 100 * 1024 * 1024
export const sourceByteRetentionMs = 60 * 60 * 1000

const renderMaxWidth = 450
const fallbackPageAspectRatio = 414 / 320

type PdfPageViewport = {
  height: number
  width: number
}

type PdfPageRenderTask = {
  cancel?: () => void
  promise: Promise<unknown>
}

export type PdfReadablePage = {
  cleanup?: () => void
  getViewport: (options: { scale: number }) => PdfPageViewport
  getTextContent?: () => Promise<{ items: readonly PdfTextContentItem[] }>
  pageNumber: number
  render?: (options: {
    canvas: HTMLCanvasElement
    canvasContext: CanvasRenderingContext2D
    viewport: PdfPageViewport
  }) => PdfPageRenderTask
}

export type PdfTextContentItem = {
  height?: unknown
  str?: unknown
  transform?: readonly unknown[]
  width?: unknown
}

export type PdfReadableDocument = {
  destroy?: () => Promise<void> | void
  getPage?: (pageNumber: number) => Promise<PdfReadablePage>
  numPages: number
}

export type PdfIntakeJobState =
  | "queued"
  | "validating"
  | "extracting_metadata"
  | "rendering_pages"
  | "complete"
  | "failed"
  | "purged"
  | "expired"

export type PdfValidationErrorCode =
  | "too_large"
  | "not_pdf"
  | "encrypted"
  | "corrupt"
  | "page_count_unavailable"
  | "read_failed"
  | "expired"
  | "cancelled"

export type PdfIntakeMetadata = {
  fileName: string
  fingerprint: string
  pageCount: number
  readMode: "fallback" | "parser"
  sizeBytes: number
}

export type PdfPrivatePageRender = {
  dataUrl: string | null
  height: number
  pageNumber: number
  renderKind: "canvas" | "viewport"
  width: number
}

export type PdfIntakeResult =
  | { ok: true; metadata: PdfIntakeMetadata }
  | { ok: false; code: PdfValidationErrorCode; message: string }

export type PdfIntakeJobSnapshot = {
  errorMessage: string | null
  id: string
  metadata: PdfIntakeMetadata | null
  pageRenderProgress: number
  pageRenders: PdfPrivatePageRender[]
  progress: number
  sourceBytesPurged: boolean
  startedAt: number
  state: PdfIntakeJobState
  updatedAt: number
}

export type PdfIntakeJobOptions = {
  analyzeDocument?: PdfDocumentAnalyzer
  id?: string
  now?: () => number
  onUpdate?: (snapshot: PdfIntakeJobSnapshot) => void
  parseDocument?: PdfDocumentParser
  renderPages?: PdfPageRenderer
  signal?: AbortSignal
  sourceRetentionMs?: number
}

export type PdfInspectOptions = {
  maxSize?: number
  parseDocument?: PdfDocumentParser
}

export type PdfDocumentParser = (
  bytes: Uint8Array,
  options?: { signal?: AbortSignal },
) => Promise<PdfReadableDocument>

export type PdfDocumentAnalysisResult = {
  pageNumbersToRender?: readonly number[]
}

export type PdfDocumentAnalyzer = (
  document: PdfReadableDocument,
  options: {
    metadata: PdfIntakeMetadata
    signal?: AbortSignal
  },
) => Promise<PdfDocumentAnalysisResult | void>

export type PdfPageRenderer = (
  document: PdfReadableDocument,
  options: {
    onPageRendered: (pageNumber: number, pageCount: number) => void
    pageNumbers?: readonly number[]
    signal?: AbortSignal
  },
) => Promise<PdfPrivatePageRender[]>

export async function inspectPdfFile(
  file: File,
  { maxSize = maxPdfSizeBytes, parseDocument }: PdfInspectOptions = {},
): Promise<PdfIntakeResult> {
  if (file.size > maxSize) {
    return {
      ok: false,
      code: "too_large",
      message: `Choose a PDF up to ${formatFileSize(maxSize)}.`,
    }
  }

  let bytes: Uint8Array | null = null
  let document: PdfReadableDocument | null = null

  try {
    bytes = new Uint8Array(await file.arrayBuffer())
    const signatureError = validatePdfSignature(bytes)
    if (signatureError) {
      return signatureError
    }

    const readablePdf = await readPdfDocument(bytes, parseDocument)
    document = readablePdf.document
    if (readablePdf.pageCount === 0) {
      return {
        ok: false,
        code: "page_count_unavailable",
        message: "The page count could not be read from this PDF.",
      }
    }

    return {
      ok: true,
      metadata: {
        fileName: file.name,
        fingerprint: await createSourceFingerprint(bytes),
        pageCount: readablePdf.pageCount,
        readMode: readablePdf.readMode,
        sizeBytes: file.size,
      },
    }
  } catch (error) {
    return pdfErrorResult(error)
  } finally {
    purgeSourceBytes(bytes)
    await destroyReadableDocument(document)
  }
}

export async function runPrivatePdfProcessingJob(
  file: File,
  {
    analyzeDocument,
    id = createPdfJobId(),
    now = Date.now,
    onUpdate,
    parseDocument,
    renderPages = renderPdfPages,
    signal,
    sourceRetentionMs = sourceByteRetentionMs,
  }: PdfIntakeJobOptions = {},
) {
  const startedAt = now()
  let bytes: Uint8Array | null = null
  let document: PdfReadableDocument | null = null
  let pageCount = 0
  let pageNumbersToRender: readonly number[] | null = null
  let sourceBytesPurged = false
  let snapshot = createJobSnapshot({
    id,
    startedAt,
    state: "queued",
    updatedAt: startedAt,
  })

  const publish = (patch: Partial<PdfIntakeJobSnapshot>) => {
    if (snapshot.state === "complete" || snapshot.state === "failed" || snapshot.state === "purged" || snapshot.state === "expired") {
      return
    }

    snapshot = {
      ...snapshot,
      ...patch,
      updatedAt: now(),
    }
    onUpdate?.(snapshot)
  }

  const assertCanContinue = () => {
    if (signal?.aborted) {
      throw new PdfJobCancelledError()
    }

    if (now() - startedAt > sourceRetentionMs) {
      throw new PdfJobExpiredError()
    }
  }

  const runStep = async <T>(operation: () => Promise<T>) => {
    assertCanContinue()
    const result = await withDeadline(operation(), sourceRetentionMs - (now() - startedAt), signal)
    assertCanContinue()
    return result
  }

  try {
    publish({ progress: getPdfJobProgress("queued"), state: "queued" })

    if (file.size > maxPdfSizeBytes) {
      throw new PdfValidationError("too_large", `Choose a PDF up to ${formatFileSize(maxPdfSizeBytes)}.`)
    }

    publish({ progress: getPdfJobProgress("validating"), state: "validating" })
    bytes = await runStep(async () => new Uint8Array(await file.arrayBuffer()))
    const signatureError = validatePdfSignature(bytes)
    if (signatureError) {
      throw new PdfValidationError(signatureError.code, signatureError.message)
    }

    const readablePdf = await runStep(() => readPdfDocument(bytes as Uint8Array, parseDocument, signal))
    document = readablePdf.document
    pageCount = readablePdf.pageCount
    if (pageCount === 0) {
      throw new PdfValidationError("page_count_unavailable", "The page count could not be read from this PDF.")
    }

    const metadata: PdfIntakeMetadata = {
      fileName: file.name,
      fingerprint: await runStep(() => createSourceFingerprint(bytes as Uint8Array)),
      pageCount,
      readMode: readablePdf.readMode,
      sizeBytes: file.size,
    }

    publish({
      metadata,
      progress: getPdfJobProgress("extracting_metadata"),
      state: "extracting_metadata",
    })
    await yieldToEventLoop()

    if (analyzeDocument && document) {
      const analysisDocument = document
      const analysisResult = await runStep(() => analyzeDocument(analysisDocument, { metadata, signal }))
      pageNumbersToRender = normalizeRenderPageNumbers(analysisResult?.pageNumbersToRender, pageCount)
    }

    publish({
      pageRenderProgress: 0,
      progress: getPdfJobProgress("rendering_pages"),
      state: "rendering_pages",
    })

    const parsedDocument = document
    const pageRenders = parsedDocument
      ? await runStep(() =>
          renderPdfPagesWithFallback(
            parsedDocument,
            {
              onPageRendered: (pageNumber, renderedPageCount) => {
                assertCanContinue()
                publish({
                  pageRenderProgress: Math.round((pageNumber / renderedPageCount) * 100),
                  state: "rendering_pages",
                })
              },
              pageNumbers: pageNumbersToRender ?? undefined,
              signal,
            },
            renderPages,
            pageCount,
            pageNumbersToRender,
          ),
        )
      : createFallbackPageRenders(pageCount, pageNumbersToRender)

    publish({
      pageRenderProgress: 100,
      pageRenders,
    })

    purgeSourceBytes(bytes)
    sourceBytesPurged = true
    await destroyReadableDocument(document)
    document = null

    publish({
      progress: getPdfJobProgress("complete"),
      sourceBytesPurged,
      state: "complete",
    })

    return snapshot
  } catch (error) {
    purgeSourceBytes(bytes)
    sourceBytesPurged = true
    await destroyReadableDocument(document)
    document = null

    if (error instanceof PdfJobExpiredError) {
      publish({
        errorMessage: "Processing expired before the upload could be settled.",
        progress: getPdfJobProgress("expired"),
        sourceBytesPurged,
        state: "expired",
      })
      return snapshot
    }

    if (error instanceof PdfJobCancelledError) {
      publish({
        errorMessage: "Processing was cancelled.",
        progress: getPdfJobProgress("purged"),
        sourceBytesPurged,
        state: "purged",
      })
      return snapshot
    }

    const result = pdfErrorResult(error)
    publish({
      errorMessage: result.message,
      progress: getPdfJobProgress("failed"),
      sourceBytesPurged,
      state: "failed",
    })

    return snapshot
  }
}

export function createPurgedJobSnapshot(snapshot: PdfIntakeJobSnapshot): PdfIntakeJobSnapshot {
  return {
    ...snapshot,
    errorMessage: null,
    metadata: null,
    pageRenderProgress: 0,
    pageRenders: [],
    progress: getPdfJobProgress("purged"),
    sourceBytesPurged: true,
    state: "purged",
    updatedAt: Date.now(),
  }
}

export function createExpiredJobSnapshot(snapshot: PdfIntakeJobSnapshot): PdfIntakeJobSnapshot {
  return {
    ...snapshot,
    errorMessage: null,
    pageRenderProgress: 0,
    pageRenders: [],
    progress: getPdfJobProgress("expired"),
    sourceBytesPurged: true,
    state: "expired",
    updatedAt: Date.now(),
  }
}

export function createQueuedPdfJobSnapshot(fileName: string, now = Date.now): PdfIntakeJobSnapshot {
  const timestamp = now()

  return createJobSnapshot({
    id: createPdfJobId(),
    metadata: {
      fileName,
      fingerprint: "",
      pageCount: 0,
      readMode: "fallback",
      sizeBytes: 0,
    },
    startedAt: timestamp,
    state: "queued",
    updatedAt: timestamp,
  })
}

export function getPdfJobStateLabel(state: PdfIntakeJobState, errorMessage: string | null) {
  if (state === "failed" || state === "expired") {
    return errorMessage ?? pdfJobStateLabels[state]
  }

  return pdfJobStateLabels[state]
}

export function getPdfJobProgress(state: PdfIntakeJobState) {
  return pdfJobStateProgress[state]
}

export function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`
  }

  return `${Math.round(sizeBytes / (1024 * 1024))} MB`
}

export function createPdfJobId() {
  return globalThis.crypto?.randomUUID?.() ?? `job-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function readPdfDocument(bytes: Uint8Array, parseDocument?: PdfDocumentParser, signal?: AbortSignal) {
  rejectEncryptedPdfMarker(bytes)

  if (!parseDocument) {
    return readFallbackPdfDocument(bytes)
  }

  try {
    const document = await parseDocument(bytes, { signal })
    return {
      document,
      pageCount: document.numPages,
      readMode: "parser" as const,
    }
  } catch (error) {
    if (signal?.aborted) {
      throw new PdfJobCancelledError()
    }

    if (isPdfPasswordError(error) || isPdfInvalidError(error)) {
      throw error
    }

    return readFallbackPdfDocument(bytes)
  }
}

function readFallbackPdfDocument(bytes: Uint8Array) {
  const text = decodePdfText(bytes)
  validateFallbackPdfStructure(text, bytes.byteLength)
  const pageCount = countFallbackPdfPages(text)
  if (pageCount === 0) {
    throw new PdfValidationError("corrupt", "Choose a readable PDF file.")
  }

  return {
    document: null,
    pageCount,
    readMode: "fallback" as const,
  }
}

export async function renderPdfPages(
  document: PdfReadableDocument,
  { onPageRendered, pageNumbers, signal }: Parameters<PdfPageRenderer>[1],
) {
  const pages: PdfPrivatePageRender[] = []

  if (!document.getPage) {
    throw new Error("Parsed PDF document does not expose pages.")
  }

  const renderPageNumbers = normalizeRenderPageNumbers(pageNumbers, document.numPages) ?? createPageRange(document.numPages)

  for (const [index, pageNumber] of renderPageNumbers.entries()) {
    if (signal?.aborted) {
      throw new PdfJobCancelledError()
    }

    const page = await document.getPage(pageNumber)
    try {
      pages.push(await renderPdfPage(page, signal))
    } finally {
      page.cleanup?.()
    }
    onPageRendered(index + 1, renderPageNumbers.length)
  }

  return pages
}

async function renderPdfPagesWithFallback(
  document: PdfReadableDocument,
  options: Parameters<PdfPageRenderer>[1],
  renderPages: PdfPageRenderer,
  pageCount: number,
  pageNumbersToRender: readonly number[] | null,
) {
  try {
    return await renderPages(document, options)
  } catch (error) {
    if (error instanceof PdfJobExpiredError || error instanceof PdfJobCancelledError) {
      throw error
    }

    return createFallbackPageRenders(pageCount, pageNumbersToRender)
  }
}

function createFallbackPageRenders(pageCount: number, pageNumbers?: readonly number[] | null) {
  const renderPageNumbers = normalizeRenderPageNumbers(pageNumbers, pageCount) ?? createPageRange(pageCount)

  return renderPageNumbers.map((pageNumber) => ({
    dataUrl: null,
    height: Math.round(renderMaxWidth * fallbackPageAspectRatio),
    pageNumber,
    renderKind: "viewport" as const,
    width: renderMaxWidth,
  }))
}

async function renderPdfPage(page: PdfReadablePage, signal?: AbortSignal): Promise<PdfPrivatePageRender> {
  if (signal?.aborted) {
    throw new PdfJobCancelledError()
  }

  const viewport = page.getViewport({ scale: 1 })
  const scale = Math.min(1, renderMaxWidth / viewport.width)
  const scaledViewport = page.getViewport({ scale })
  const width = Math.ceil(scaledViewport.width)
  const height = Math.ceil(scaledViewport.height)

  if (typeof document === "undefined") {
    return {
      dataUrl: null,
      height,
      pageNumber: page.pageNumber,
      renderKind: "viewport",
      width,
    }
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  try {
    const context = canvas.getContext("2d")
    if (!context) {
      return {
        dataUrl: null,
        height,
        pageNumber: page.pageNumber,
        renderKind: "viewport",
        width,
      }
    }

    const renderTask = page.render?.({
      canvas,
      canvasContext: context,
      viewport: scaledViewport,
    })

    if (!renderTask) {
      return {
        dataUrl: null,
        height,
        pageNumber: page.pageNumber,
        renderKind: "viewport",
        width,
      }
    }

    const abortRender = () => renderTask.cancel?.()
    signal?.addEventListener("abort", abortRender, { once: true })
    try {
      await renderTask.promise
      if (signal?.aborted) {
        throw new PdfJobCancelledError()
      }
    } finally {
      signal?.removeEventListener("abort", abortRender)
    }

    return {
      dataUrl: canvas.toDataURL("image/png"),
      height,
      pageNumber: page.pageNumber,
      renderKind: "canvas",
      width,
    }
  } catch (error) {
    if (signal?.aborted || error instanceof PdfJobCancelledError) {
      throw new PdfJobCancelledError()
    }

    return {
      dataUrl: null,
      height,
      pageNumber: page.pageNumber,
      renderKind: "viewport",
      width,
    }
  }
}

function normalizeRenderPageNumbers(pageNumbers: readonly number[] | null | undefined, pageCount: number) {
  if (!pageNumbers) {
    return null
  }

  const seen = new Set<number>()

  return pageNumbers
    .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= pageCount)
    .filter((pageNumber) => {
      if (seen.has(pageNumber)) {
        return false
      }

      seen.add(pageNumber)
      return true
    })
    .sort((left, right) => left - right)
}

function createPageRange(pageCount: number) {
  return Array.from({ length: pageCount }, (_, index) => index + 1)
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0)
  })
}

function validatePdfSignature(bytes: Uint8Array): Extract<PdfIntakeResult, { ok: false }> | null {
  const header = new TextDecoder("latin1").decode(bytes.slice(0, 8))
  if (!header.startsWith("%PDF-")) {
    return {
      ok: false,
      code: "not_pdf",
      message: "Choose a valid PDF file.",
    }
  }

  return null
}

function rejectEncryptedPdfMarker(bytes: Uint8Array) {
  const text = decodePdfText(bytes)
  if (/\/Encrypt\b/.test(text)) {
    throw new PdfValidationError("encrypted", "Password-protected PDFs are not supported yet.")
  }
}

function validateFallbackPdfStructure(text: string, byteLength: number) {
  const eofIndex = text.lastIndexOf("%%EOF")
  const startXrefMatch = /startxref\s+(\d+)/g
  let latestStartXref: RegExpExecArray | null = null
  let match: RegExpExecArray | null

  while ((match = startXrefMatch.exec(text))) {
    latestStartXref = match
  }

  const startXrefIndex = latestStartXref?.index ?? -1
  const xrefOffset = latestStartXref ? Number(latestStartXref[1]) : Number.NaN

  if (
    eofIndex < 0 ||
    startXrefIndex < 0 ||
    startXrefIndex > eofIndex ||
    !Number.isInteger(xrefOffset) ||
    xrefOffset <= 0 ||
    xrefOffset >= byteLength ||
    !/\b\d+\s+\d+\s+obj\b/.test(text) ||
    !/\/Root\s+\d+\s+\d+\s+R\b/.test(text)
  ) {
    throw new PdfValidationError("corrupt", "Choose a readable PDF file.")
  }
}

function countFallbackPdfPages(text: string) {
  const pageObjects = text.match(/\/Type\s*\/Page\b/g)?.length ?? 0
  if (pageObjects > 0) {
    return pageObjects
  }

  const counts = Array.from(text.matchAll(/\/Count\s+(\d+)/g), (match) => Number(match[1]))
    .filter((count) => Number.isInteger(count) && count > 0)

  return counts.length > 0 ? Math.max(...counts) : 0
}

function decodePdfText(bytes: Uint8Array) {
  return new TextDecoder("latin1").decode(bytes)
}

async function createSourceFingerprint(bytes: Uint8Array) {
  const digest = await digestSha256(bytes)
  if (digest) {
    return digest
  }

  return createFallbackFingerprint(bytes)
}

async function digestSha256(bytes: Uint8Array) {
  if (!globalThis.crypto?.subtle) {
    return null
  }

  const digestInput = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const digest = await globalThis.crypto.subtle.digest("SHA-256", digestInput)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function createFallbackFingerprint(bytes: Uint8Array) {
  let hash = 2166136261

  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 16777619)
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`
}

function purgeSourceBytes(bytes: Uint8Array | null) {
  bytes?.fill(0)
}

async function destroyReadableDocument(document: PdfReadableDocument | null) {
  try {
    await document?.destroy?.()
  } catch {
    return
  }
}

function pdfErrorResult(error: unknown): Extract<PdfIntakeResult, { ok: false }> {
  if (error instanceof PdfValidationError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
    }
  }

  if (isPdfPasswordError(error)) {
    return {
      ok: false,
      code: "encrypted",
      message: "Password-protected PDFs are not supported yet.",
    }
  }

  if (isPdfInvalidError(error)) {
    return {
      ok: false,
      code: "corrupt",
      message: "Choose a readable PDF file.",
    }
  }

  if (error instanceof PdfJobExpiredError) {
    return {
      ok: false,
      code: "expired",
      message: "Processing expired before the upload could be settled.",
    }
  }

  if (error instanceof PdfJobCancelledError) {
    return {
      ok: false,
      code: "cancelled",
      message: "Processing was cancelled.",
    }
  }

  return {
    ok: false,
    code: "read_failed",
    message: "The PDF could not be read.",
  }
}

function isPdfPasswordError(error: unknown) {
  return getErrorName(error) === "PasswordException" || getErrorMessage(error).toLowerCase().includes("password")
}

function isPdfInvalidError(error: unknown) {
  return getErrorName(error) === "InvalidPDFException" || getErrorMessage(error).toLowerCase().includes("invalid pdf")
}

function getErrorName(error: unknown) {
  return typeof error === "object" && error && "name" in error ? String(error.name) : ""
}

function getErrorMessage(error: unknown) {
  return typeof error === "object" && error && "message" in error ? String(error.message) : ""
}

function createJobSnapshot({
  id,
  metadata = null,
  startedAt,
  state,
  updatedAt,
}: {
  id: string
  metadata?: PdfIntakeMetadata | null
  startedAt: number
  state: PdfIntakeJobState
  updatedAt: number
}): PdfIntakeJobSnapshot {
  return {
    errorMessage: null,
    id,
    metadata,
    pageRenderProgress: 0,
    pageRenders: [],
    progress: getPdfJobProgress(state),
    sourceBytesPurged: false,
    startedAt,
    state,
    updatedAt,
  }
}

function withDeadline<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal) {
  if (signal?.aborted) {
    return Promise.reject(new PdfJobCancelledError())
  }

  if (timeoutMs <= 0) {
    return Promise.reject(new PdfJobExpiredError())
  }

  return new Promise<T>((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      cleanup()
      reject(new PdfJobExpiredError())
    }, timeoutMs)

    const abort = () => {
      cleanup()
      reject(new PdfJobCancelledError())
    }

    const cleanup = () => {
      globalThis.clearTimeout(timeoutId)
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

class PdfValidationError extends Error {
  constructor(
    readonly code: PdfValidationErrorCode,
    message: string,
  ) {
    super(message)
  }
}

class PdfJobExpiredError extends Error {}

class PdfJobCancelledError extends Error {}

const pdfJobStateLabels = {
  queued: "Queued",
  validating: "Validating PDF",
  extracting_metadata: "Reading metadata",
  rendering_pages: "Preparing pages",
  complete: "Analysis complete",
  failed: "Processing failed",
  purged: "Cleared",
  expired: "Processing expired",
} satisfies Record<PdfIntakeJobState, string>

const pdfJobStateProgress = {
  queued: 0,
  validating: 20,
  extracting_metadata: 55,
  rendering_pages: 80,
  complete: 100,
  failed: 100,
  purged: 0,
  expired: 0,
} satisfies Record<PdfIntakeJobState, number>
