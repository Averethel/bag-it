import type { StepDetectorV2PageInput } from "./contracts"
import type { PagePreviewBaseBounds } from "./runtime-preview-assets"

type RuntimePreviewWorkerRequest = {
  baseBounds: PagePreviewBaseBounds
  id: number
  page: StepDetectorV2PageInput
  targetWidth: number
  type: "page"
}

type RuntimePreviewWorkerResponse =
  | {
      baseHeight: number
      baseWidth: number
      blob: Blob
      id: number
      naturalHeight: number
      naturalWidth: number
      pageNumber: number
      type: "page"
    }
  | {
      error: string
      id: number
    }

const PAGE_PREVIEW_MIME_TYPE = "image/webp"
const PAGE_PREVIEW_QUALITY = 0.92

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<RuntimePreviewWorkerRequest>) => void) | null
  postMessage: (message: RuntimePreviewWorkerResponse) => void
}

workerScope.onmessage = (event) => {
  void handleRequest(event.data)
}

async function handleRequest(request: RuntimePreviewWorkerRequest): Promise<void> {
  try {
    const asset = await createPageAsset(request.page, request.baseBounds, request.targetWidth)

    workerScope.postMessage({
      ...asset,
      id: request.id,
      pageNumber: request.page.pageNumber,
      type: "page",
    })
  } catch (error) {
    workerScope.postMessage({
      error: error instanceof Error ? error.message : "Runtime preview worker failed.",
      id: request.id,
    })
  }
}

async function createPageAsset(
  page: StepDetectorV2PageInput,
  baseBounds: PagePreviewBaseBounds,
  targetWidth: number,
) {
  const sourceCanvas = createCanvasFromPageInput(page)
  const previewCanvas = scaleCanvasToMaxWidth(sourceCanvas, targetWidth)
  const blob = await previewCanvas.convertToBlob({
    quality: PAGE_PREVIEW_QUALITY,
    type: PAGE_PREVIEW_MIME_TYPE,
  })

  return {
    baseHeight: normalizeDimension(baseBounds.height),
    baseWidth: normalizeDimension(baseBounds.width),
    blob,
    naturalHeight: previewCanvas.height,
    naturalWidth: previewCanvas.width,
  }
}

function createCanvasFromPageInput(page: StepDetectorV2PageInput): OffscreenCanvas {
  const canvas = new OffscreenCanvas(page.width, page.height)
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("Canvas rendering is unavailable in the preview worker.")
  }

  context.putImageData(
    new ImageData(new Uint8ClampedArray(page.data), page.width, page.height),
    0,
    0,
  )

  return canvas
}

function scaleCanvasToMaxWidth(
  sourceCanvas: OffscreenCanvas,
  maxWidth: number,
): OffscreenCanvas {
  const normalizedMaxWidth = normalizeDimension(maxWidth)
  const scale = Math.min(1, normalizedMaxWidth / sourceCanvas.width)

  if (scale === 1) {
    return sourceCanvas
  }

  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(sourceCanvas.width * scale)),
    Math.max(1, Math.round(sourceCanvas.height * scale)),
  )
  const context = canvas.getContext("2d")

  if (!context) {
    return sourceCanvas
  }

  context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height)

  return canvas
}

function normalizeDimension(value: number): number {
  return Math.max(1, Math.round(Number.isFinite(value) ? value : 1))
}
