import type {
  PagePreviewAsset,
  PartMaskPreviewAsset,
} from "@/features/steps/preview-assets"
import type {
  DetectedStepCalloutPartItem,
  StepSourceRegion,
} from "../step-detection-contracts"
import {
  createBrowserWorkerPool,
  type BrowserWorkerPool,
} from "./browser-worker-pool"
import type { StepDetectorV2PageInput } from "./contracts"

const DEFAULT_PAGE_PREVIEW_TARGET_WIDTH = 2200
const PART_MASK_PREVIEW_MAX_SOURCE_SIZE = 128
const PAGE_PREVIEW_MIME_TYPE = "image/webp"
const PAGE_PREVIEW_QUALITY = 0.92
const PNG_MIME_TYPE = "image/png"
const pagePreviewImageByAsset = new WeakMap<PagePreviewAsset, Promise<HTMLImageElement>>()
let runtimePreviewWorkerPool: BrowserWorkerPool<
  RuntimePreviewWorkerRequest,
  RuntimePreviewWorkerResponse
> | null = null
let runtimePreviewWorkerFailed = false

export interface PagePreviewBaseBounds {
  height: number
  width: number
}

export interface CreatePagePreviewAssetOptions {
  targetWidth?: number
}

export async function createPagePreviewAssetFromPageInput(
  page: StepDetectorV2PageInput,
  baseBounds: PagePreviewBaseBounds,
  options: CreatePagePreviewAssetOptions = {},
): Promise<PagePreviewAsset> {
  const workerAsset = await tryCreatePagePreviewAssetWithWorker(page, baseBounds, options)

  if (workerAsset) {
    return workerAsset
  }

  const sourceCanvas = createCanvasFromPageInput(page)
  const previewCanvas = scaleCanvasToMaxWidth(
    sourceCanvas,
    options.targetWidth ?? DEFAULT_PAGE_PREVIEW_TARGET_WIDTH,
  )
  const url = await createCanvasObjectUrl(previewCanvas, PAGE_PREVIEW_MIME_TYPE, PAGE_PREVIEW_QUALITY)

  return {
    baseHeight: normalizeDimension(baseBounds.height),
    baseWidth: normalizeDimension(baseBounds.width),
    naturalHeight: previewCanvas.height,
    naturalWidth: previewCanvas.width,
    pageNumber: page.pageNumber,
    url,
  }
}

export async function createPartMaskPreviewAssetFromPageInput(
  _page: StepDetectorV2PageInput,
  pageAsset: PagePreviewAsset,
  partItem: DetectedStepCalloutPartItem,
): Promise<PartMaskPreviewAsset | null> {
  return createPartMaskPreviewAssetFromPageAsset(pageAsset, partItem)
}

export async function createPartMaskPreviewAssetFromPageAsset(
  pageAsset: PagePreviewAsset,
  partItem: DetectedStepCalloutPartItem,
): Promise<PartMaskPreviewAsset | null> {
  const partImage = partItem.partImage

  if (!partImage?.alphaMask) {
    return null
  }

  const cropRegion = scaleBaseRegionToNaturalImage(partImage.region, pageAsset)

  if (!cropRegion) {
    return null
  }

  const image = await loadPagePreviewImage(pageAsset)
  const outputSize = scaleCropToMaxSize(cropRegion, PART_MASK_PREVIEW_MAX_SOURCE_SIZE)
  const canvas = window.document.createElement("canvas")
  const context = canvas.getContext("2d", { willReadFrequently: true })

  if (!context) {
    return null
  }

  canvas.width = outputSize.width
  canvas.height = outputSize.height
  context.drawImage(
    image,
    cropRegion.x,
    cropRegion.y,
    cropRegion.width,
    cropRegion.height,
    0,
    0,
    outputSize.width,
    outputSize.height,
  )

  const imageData = context.getImageData(0, 0, outputSize.width, outputSize.height)
  const scaleX = pageAsset.naturalWidth / pageAsset.baseWidth
  const scaleY = pageAsset.naturalHeight / pageAsset.baseHeight
  const cropPixelScaleX = cropRegion.width / outputSize.width
  const cropPixelScaleY = cropRegion.height / outputSize.height

  for (let y = 0; y < outputSize.height; y += 1) {
    for (let x = 0; x < outputSize.width; x += 1) {
      const pixelIndex = (y * outputSize.width + x) * 4
      const baseX = (cropRegion.x + (x + 0.5) * cropPixelScaleX) / scaleX
      const baseY = (cropRegion.y + (y + 0.5) * cropPixelScaleY) / scaleY
      const alpha = readAlphaMask(partImage, baseX, baseY)

      imageData.data[pixelIndex + 3] = Math.round(imageData.data[pixelIndex + 3] * (alpha / 255))
    }
  }

  context.putImageData(imageData, 0, 0)

  return {
    height: canvas.height,
    partItemId: partItem.id,
    renderedPixels: {
      data: imageData.data,
      height: canvas.height,
      width: canvas.width,
    },
    url: await createCanvasObjectUrl(canvas, PNG_MIME_TYPE),
    width: canvas.width,
  }
}

function loadPagePreviewImage(pageAsset: PagePreviewAsset): Promise<HTMLImageElement> {
  const cachedImage = pagePreviewImageByAsset.get(pageAsset)

  if (cachedImage) {
    return cachedImage
  }

  const image = loadImage(pageAsset.url)

  pagePreviewImageByAsset.set(pageAsset, image)
  return image
}

async function tryCreatePagePreviewAssetWithWorker(
  page: StepDetectorV2PageInput,
  baseBounds: PagePreviewBaseBounds,
  options: CreatePagePreviewAssetOptions,
): Promise<PagePreviewAsset | null> {
  const pool = readRuntimePreviewWorkerPool()

  if (!pool) {
    return null
  }

  const requestPage = cloneStepDetectorV2PageInput(page)

  try {
    const response = await pool.run({
      baseBounds,
      id: 0,
      page: requestPage,
      targetWidth: options.targetWidth ?? DEFAULT_PAGE_PREVIEW_TARGET_WIDTH,
      type: "page",
    }, [requestPage.data.buffer as ArrayBuffer], undefined)

    if ("error" in response || response.type !== "page") {
      runtimePreviewWorkerFailed = true
      return null
    }

    return {
      baseHeight: response.baseHeight,
      baseWidth: response.baseWidth,
      naturalHeight: response.naturalHeight,
      naturalWidth: response.naturalWidth,
      pageNumber: response.pageNumber,
      url: createObjectUrl(response.blob),
    }
  } catch {
    runtimePreviewWorkerFailed = true
    return null
  }
}

function readRuntimePreviewWorkerPool(): BrowserWorkerPool<
  RuntimePreviewWorkerRequest,
  RuntimePreviewWorkerResponse
> | null {
  if (
    runtimePreviewWorkerFailed ||
    typeof Worker === "undefined" ||
    typeof OffscreenCanvas === "undefined"
  ) {
    return null
  }

  runtimePreviewWorkerPool ??= createBrowserWorkerPool<
    RuntimePreviewWorkerRequest,
    RuntimePreviewWorkerResponse
  >(
    () => new Worker(new URL("./runtime-preview.worker.ts", import.meta.url), { type: "module" }),
    resolveRuntimePreviewWorkerCount(),
  )

  return runtimePreviewWorkerPool
}

function resolveRuntimePreviewWorkerCount(): number {
  if (typeof navigator === "undefined" || !Number.isFinite(navigator.hardwareConcurrency)) {
    return 2
  }

  return Math.min(4, Math.max(1, Math.floor(navigator.hardwareConcurrency) - 2))
}

function cloneStepDetectorV2PageInput(page: StepDetectorV2PageInput): StepDetectorV2PageInput {
  return {
    ...page,
    data: new Uint8ClampedArray(page.data),
  }
}

function createCanvasFromPageInput(page: StepDetectorV2PageInput): HTMLCanvasElement {
  const canvas = window.document.createElement("canvas")
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("Canvas rendering is unavailable in this browser.")
  }

  canvas.width = page.width
  canvas.height = page.height
  context.putImageData(
    new ImageData(new Uint8ClampedArray(page.data), page.width, page.height),
    0,
    0,
  )

  return canvas
}

function scaleCanvasToMaxWidth(
  sourceCanvas: HTMLCanvasElement,
  maxWidth: number,
): HTMLCanvasElement {
  const normalizedMaxWidth = normalizeDimension(maxWidth)
  const scale = Math.min(1, normalizedMaxWidth / sourceCanvas.width)

  if (scale === 1) {
    return sourceCanvas
  }

  const canvas = window.document.createElement("canvas")
  const context = canvas.getContext("2d")

  if (!context) {
    return sourceCanvas
  }

  canvas.width = Math.max(1, Math.round(sourceCanvas.width * scale))
  canvas.height = Math.max(1, Math.round(sourceCanvas.height * scale))
  context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height)

  return canvas
}

function scaleBaseRegionToNaturalImage(
  region: StepSourceRegion,
  pageAsset: PagePreviewAsset,
): StepSourceRegion | null {
  const baseLeft = clamp(region.x, 0, pageAsset.baseWidth)
  const baseTop = clamp(region.y, 0, pageAsset.baseHeight)
  const baseRight = clamp(region.x + region.width, 0, pageAsset.baseWidth)
  const baseBottom = clamp(region.y + region.height, 0, pageAsset.baseHeight)

  if (baseRight <= baseLeft || baseBottom <= baseTop) {
    return null
  }

  const scaleX = pageAsset.naturalWidth / pageAsset.baseWidth
  const scaleY = pageAsset.naturalHeight / pageAsset.baseHeight
  const x = Math.floor(baseLeft * scaleX)
  const y = Math.floor(baseTop * scaleY)
  const right = Math.ceil(baseRight * scaleX)
  const bottom = Math.ceil(baseBottom * scaleY)

  return {
    height: Math.max(1, bottom - y),
    width: Math.max(1, right - x),
    x,
    y,
  }
}

function scaleCropToMaxSize(
  cropRegion: StepSourceRegion,
  maxSize: number,
): { height: number; width: number } {
  const normalizedMaxSize = normalizeDimension(maxSize)
  const maxDimension = Math.max(cropRegion.width, cropRegion.height)
  const scale = maxDimension > normalizedMaxSize
    ? normalizedMaxSize / maxDimension
    : 1

  return {
    height: Math.max(1, Math.round(cropRegion.height * scale)),
    width: Math.max(1, Math.round(cropRegion.width * scale)),
  }
}

function readAlphaMask(
  partImage: NonNullable<DetectedStepCalloutPartItem["partImage"]>,
  basePageX: number,
  basePageY: number,
): number {
  const alphaMask = partImage.alphaMask

  if (!alphaMask) {
    return 255
  }

  const maskX = Math.floor(basePageX - partImage.region.x)
  const maskY = Math.floor(basePageY - partImage.region.y)

  if (
    maskX < 0 ||
    maskY < 0 ||
    maskX >= alphaMask.width ||
    maskY >= alphaMask.height
  ) {
    return 0
  }

  return alphaMask.data[maskY * alphaMask.width + maskX] ?? 0
}

function createCanvasObjectUrl(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<string> {
  if (
    typeof canvas.toBlob !== "function" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    throw new Error("Blob preview generation is unavailable in this browser.")
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(URL.createObjectURL(blob))
        return
      }

      if (mimeType === PNG_MIME_TYPE) {
        reject(new Error("Preview image could not be encoded."))
        return
      }

      canvas.toBlob((pngBlob) => {
        if (pngBlob) {
          resolve(URL.createObjectURL(pngBlob))
          return
        }

        reject(new Error("Preview image could not be encoded."))
      }, PNG_MIME_TYPE)
    }, mimeType, quality)
  })
}

function createObjectUrl(blob: Blob): string {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("Blob preview generation is unavailable in this browser.")
  }

  return URL.createObjectURL(blob)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image()

    image.decoding = "async"
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Preview image could not be loaded."))
    image.src = url
  })
}

function normalizeDimension(value: number): number {
  return Math.max(1, Math.round(Number.isFinite(value) ? value : 1))
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

type RuntimePreviewWorkerRequest = {
  id: number
  baseBounds: PagePreviewBaseBounds
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
