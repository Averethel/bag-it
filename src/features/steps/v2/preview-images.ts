import type { RgbColor } from "@bag-it/callout-parts"
import { clampStepCalloutRegionToPage } from "@bag-it/step-callouts"
import type { StepDetectorV2PageInput, StepDetectorV2Region } from "./contracts"

const CALLOUT_PREVIEW_MAX_WIDTH = 620
const PAGE_PREVIEW_MAX_WIDTH = 360
const PREVIEW_BLOB_MIME_TYPE = "image/png"
const PREVIEW_PART_ITEM_YIELD_INTERVAL = 12

export interface StepDetectorV2PreviewHydratableCallout {
  crop: {
    imageDataUrl?: string
    region: StepDetectorV2Region
  }
  inferredBackground?: {
    rgb: RgbColor
  }
  pageNumber: number
  partItems?: StepDetectorV2PreviewHydratablePartItem[]
}

export interface StepDetectorV2PreviewHydratablePartItem {
  partImage?: {
    alphaMask?: {
      data: Uint8ClampedArray
      height: number
      width: number
    }
    imageDataUrl?: string
    region: StepDetectorV2Region
  }
  quantityLabel: {
    crop?: {
      imageDataUrl?: string
      region: StepDetectorV2Region
    }
    imageDataUrl?: string
    region: StepDetectorV2Region
  }
}

export interface StepDetectorV2PreviewHydratablePagePreview {
  height: number
  imageDataUrl?: string
  pageNumber: number
  width: number
}

export interface StepDetectorV2PreviewHydratableResult {
  callouts: StepDetectorV2PreviewHydratableCallout[]
  pagePreviews: StepDetectorV2PreviewHydratablePagePreview[]
}

interface CanvasPage {
  canvas: HTMLCanvasElement
  page: StepDetectorV2PageInput
}

interface PagePreviewBounds {
  height: number
  width: number
}

interface AttachV2PreviewImagesOptions {
  includeCropPreviews?: boolean
  includePagePreviews?: boolean
  pagePreviewMaxWidth?: number
}

export async function attachV2PreviewImages<T extends StepDetectorV2PreviewHydratableResult>(
  result: T,
  pages: readonly StepDetectorV2PageInput[],
  options: AttachV2PreviewImagesOptions = {},
): Promise<T> {
  const previewBoundsByPage = createPagePreviewBoundsMap(result.pagePreviews)
  const canvasPages = createCanvasPageMap(pages, previewBoundsByPage)
  const includeCropPreviews = options.includeCropPreviews ?? true
  const includePagePreviews = options.includePagePreviews ?? true

  return {
    ...result,
    callouts: includeCropPreviews
      ? await Promise.all(result.callouts.map((callout) =>
        attachCalloutPreview(callout, canvasPages),
      ))
      : result.callouts,
    pagePreviews: includePagePreviews
      ? await Promise.all(result.pagePreviews.map((preview) =>
        attachPagePreview(preview, canvasPages, options.pagePreviewMaxWidth),
      ))
      : result.pagePreviews,
  }
}

export function attachV2PagePreviewImages<T extends StepDetectorV2PreviewHydratableResult>(
  result: T,
  pages: readonly StepDetectorV2PageInput[],
  options: Pick<AttachV2PreviewImagesOptions, "pagePreviewMaxWidth"> = {},
): Promise<T> {
  return attachV2PreviewImages(result, pages, {
    includeCropPreviews: false,
    includePagePreviews: true,
    pagePreviewMaxWidth: options.pagePreviewMaxWidth,
  })
}

export function attachV2CropPreviewImages<T extends StepDetectorV2PreviewHydratableResult>(
  result: T,
  pages: readonly StepDetectorV2PageInput[],
): Promise<T> {
  return attachV2PreviewImages(result, pages, {
    includeCropPreviews: true,
    includePagePreviews: false,
  })
}

function createCanvasPageMap(
  pages: readonly StepDetectorV2PageInput[],
  previewBoundsByPage: ReadonlyMap<number, PagePreviewBounds>,
): ReadonlyMap<number, CanvasPage> {
  return new Map(
    pages.flatMap((page) => {
      const canvas = createPageCanvas(page)
      const canvasPage = canvas
        ? createCanvasPageAtPreviewScale(canvas, page, previewBoundsByPage.get(page.pageNumber))
        : null

      return canvasPage ? [[page.pageNumber, canvasPage]] : []
    }),
  )
}

function createPagePreviewBoundsMap(
  pagePreviews: readonly StepDetectorV2PreviewHydratablePagePreview[],
): ReadonlyMap<number, PagePreviewBounds> {
  return new Map(
    pagePreviews.map((preview) => [
      preview.pageNumber,
      { height: preview.height, width: preview.width },
    ]),
  )
}

async function attachPagePreview<T extends StepDetectorV2PreviewHydratablePagePreview>(
  preview: T,
  canvasPages: ReadonlyMap<number, CanvasPage>,
  maxWidth = PAGE_PREVIEW_MAX_WIDTH,
): Promise<T> {
  if (preview.imageDataUrl) {
    return preview
  }

  const canvasPage = canvasPages.get(preview.pageNumber)

  if (!canvasPage) {
    return preview
  }

  return {
    ...preview,
    imageDataUrl: await createScaledCanvasObjectUrl(canvasPage.canvas, maxWidth)
      ?? preview.imageDataUrl,
  }
}

async function attachCalloutPreview<T extends StepDetectorV2PreviewHydratableCallout>(
  callout: T,
  canvasPages: ReadonlyMap<number, CanvasPage>,
): Promise<T> {
  const canvasPage = canvasPages.get(callout.pageNumber)

  if (!canvasPage) {
    return callout
  }

  return {
    ...callout,
    crop: {
      ...callout.crop,
      imageDataUrl: callout.crop.imageDataUrl
        ?? await createCropObjectUrl(canvasPage, callout.crop.region)
        ?? callout.crop.imageDataUrl,
    },
    partItems: callout.partItems
      ? await attachPartItemPreviews(callout.partItems, canvasPage)
      : [],
  }
}

async function attachPartItemPreviews<T extends StepDetectorV2PreviewHydratablePartItem>(
  partItems: readonly T[],
  canvasPage: CanvasPage,
): Promise<T[]> {
  const attachedPartItems: T[] = []

  for (let index = 0; index < partItems.length; index += 1) {
    attachedPartItems.push(await attachPartItemPreview(partItems[index], canvasPage))

    if ((index + 1) % PREVIEW_PART_ITEM_YIELD_INTERVAL === 0) {
      await yieldToBrowser()
    }
  }

  return attachedPartItems
}

async function attachPartItemPreview<T extends StepDetectorV2PreviewHydratablePartItem>(
  partItem: T,
  canvasPage: CanvasPage,
): Promise<T> {
  const sourcePartImage = partItem.partImage
  const partImage = sourcePartImage
    ? {
      ...sourcePartImage,
      imageDataUrl: sourcePartImage.imageDataUrl
        ?? await createPartImageObjectUrl(canvasPage, sourcePartImage)
        ?? sourcePartImage.imageDataUrl,
    }
    : sourcePartImage

  const quantityCropRegion = partItem.quantityLabel.crop?.region ?? partItem.quantityLabel.region
  const quantityCropImageDataUrl = partItem.quantityLabel.crop?.imageDataUrl
    ?? await createCropObjectUrl(canvasPage, quantityCropRegion)

  return {
    ...partItem,
    partImage,
    quantityLabel: {
      ...partItem.quantityLabel,
      crop: {
        ...(partItem.quantityLabel.crop ?? { region: partItem.quantityLabel.region }),
        imageDataUrl: quantityCropImageDataUrl ?? partItem.quantityLabel.crop?.imageDataUrl,
      },
      imageDataUrl: partItem.quantityLabel.imageDataUrl,
    },
  }
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

function createPageCanvas(page: StepDetectorV2PageInput): HTMLCanvasElement | null {
  const canvas = window.document.createElement("canvas")
  const context = canvas.getContext("2d")

  if (!context) {
    return null
  }

  canvas.width = page.width
  canvas.height = page.height
  context.putImageData(new ImageData(new Uint8ClampedArray(page.data), page.width, page.height), 0, 0)

  return canvas
}

function createCanvasPageAtPreviewScale(
  sourceCanvas: HTMLCanvasElement,
  page: StepDetectorV2PageInput,
  previewBounds: PagePreviewBounds | undefined,
): CanvasPage | null {
  if (!previewBounds || pageMatchesPreviewBounds(page, previewBounds)) {
    return { canvas: sourceCanvas, page }
  }

  if (!isValidPagePreviewBounds(previewBounds)) {
    return null
  }

  const canvas = window.document.createElement("canvas")
  const context = canvas.getContext("2d")

  if (!context) {
    return null
  }

  canvas.width = previewBounds.width
  canvas.height = previewBounds.height
  context.drawImage(sourceCanvas, 0, 0, previewBounds.width, previewBounds.height)

  return {
    canvas,
    page: {
      ...page,
      data: new Uint8ClampedArray(0),
      height: previewBounds.height,
      width: previewBounds.width,
    },
  }
}

function pageMatchesPreviewBounds(
  page: StepDetectorV2PageInput,
  previewBounds: PagePreviewBounds,
): boolean {
  return page.width === previewBounds.width && page.height === previewBounds.height
}

function isValidPagePreviewBounds(previewBounds: PagePreviewBounds): boolean {
  return Number.isFinite(previewBounds.width) &&
    Number.isFinite(previewBounds.height) &&
    previewBounds.width > 0 &&
    previewBounds.height > 0
}

async function createCropObjectUrl(
  canvasPage: CanvasPage,
  region: StepDetectorV2Region,
): Promise<string | undefined> {
  const cropRegion = clampStepCalloutRegionToPage(region, canvasPage.page)

  if (!cropRegion) {
    return undefined
  }

  const canvas = window.document.createElement("canvas")
  const context = canvas.getContext("2d")

  if (!context) {
    return undefined
  }

  canvas.width = cropRegion.width
  canvas.height = cropRegion.height
  context.drawImage(
    canvasPage.canvas,
    cropRegion.x,
    cropRegion.y,
    cropRegion.width,
    cropRegion.height,
    0,
    0,
    cropRegion.width,
    cropRegion.height,
  )

  return createScaledCanvasObjectUrl(canvas, CALLOUT_PREVIEW_MAX_WIDTH)
}

function createPartImageObjectUrl(
  canvasPage: CanvasPage,
  partImage: NonNullable<StepDetectorV2PreviewHydratablePartItem["partImage"]>,
): Promise<string | undefined> {
  if (!partImage.alphaMask) {
    return createCropObjectUrl(canvasPage, partImage.region)
  }

  return createMaskedPartImageObjectUrl(canvasPage, {
    alphaMask: partImage.alphaMask,
    region: partImage.region,
  })
}

async function createMaskedPartImageObjectUrl(
  canvasPage: CanvasPage,
  partImage: MaskedPartImage,
): Promise<string | undefined> {
  const cropRegion = clampStepCalloutRegionToPage(partImage.region, canvasPage.page)

  if (!cropRegion) {
    return undefined
  }

  const canvas = window.document.createElement("canvas")
  const context = canvas.getContext("2d")

  if (!context) {
    return undefined
  }

  canvas.width = cropRegion.width
  canvas.height = cropRegion.height
  context.drawImage(
    canvasPage.canvas,
    cropRegion.x,
    cropRegion.y,
    cropRegion.width,
    cropRegion.height,
    0,
    0,
    cropRegion.width,
    cropRegion.height,
  )
  const imageData = context.getImageData(0, 0, cropRegion.width, cropRegion.height)

  for (let y = 0; y < cropRegion.height; y += 1) {
    for (let x = 0; x < cropRegion.width; x += 1) {
      const pixelIndex = (y * cropRegion.width + x) * 4
      const alpha = readPartImageMaskAlpha(partImage, cropRegion.x + x, cropRegion.y + y)

      imageData.data[pixelIndex + 3] = Math.round(imageData.data[pixelIndex + 3] * (alpha / 255))
    }
  }

  context.putImageData(imageData, 0, 0)

  return createScaledCanvasObjectUrl(canvas, CALLOUT_PREVIEW_MAX_WIDTH)
}

function readPartImageMaskAlpha(
  partImage: MaskedPartImage,
  pageX: number,
  pageY: number,
): number {
  const maskX = pageX - partImage.region.x
  const maskY = pageY - partImage.region.y

  if (
    maskX < 0 ||
    maskY < 0 ||
    maskX >= partImage.alphaMask.width ||
    maskY >= partImage.alphaMask.height
  ) {
    return 0
  }

  return partImage.alphaMask.data[maskY * partImage.alphaMask.width + maskX] ?? 0
}

interface MaskedPartImage {
  alphaMask: {
    data: Uint8ClampedArray
    height: number
    width: number
  }
  region: StepDetectorV2Region
}

async function createScaledCanvasObjectUrl(
  sourceCanvas: HTMLCanvasElement,
  maxWidth: number,
): Promise<string | undefined> {
  const scale = Math.min(1, maxWidth / sourceCanvas.width)

  if (scale === 1) {
    return createCanvasObjectUrl(sourceCanvas)
  }

  const previewCanvas = window.document.createElement("canvas")
  const previewContext = previewCanvas.getContext("2d")

  if (!previewContext) {
    return createCanvasObjectUrl(sourceCanvas)
  }

  previewCanvas.width = Math.max(1, Math.round(sourceCanvas.width * scale))
  previewCanvas.height = Math.max(1, Math.round(sourceCanvas.height * scale))
  previewContext.drawImage(sourceCanvas, 0, 0, previewCanvas.width, previewCanvas.height)

  return createCanvasObjectUrl(previewCanvas)
}

function createCanvasObjectUrl(canvas: HTMLCanvasElement): Promise<string | undefined> {
  if (
    typeof canvas.toBlob !== "function" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return Promise.resolve(undefined)
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? URL.createObjectURL(blob) : undefined)
    }, PREVIEW_BLOB_MIME_TYPE)
  })
}
