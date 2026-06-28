import {
  visitStepDetectorV2PageInputsFromFile,
} from "./browser-page-input"
import type { StepDetectorV2PageInput } from "./contracts"
import {
  attachV2CropPreviewImages,
  attachV2PagePreviewImages,
  attachV2PreviewImages,
  type StepDetectorV2PreviewHydratableResult,
} from "./preview-images"
import {
  createPagePreviewAssetFromPageInput,
  type CreatePagePreviewAssetOptions,
} from "./runtime-preview-assets"
import type { StepDetectorV2PageBounds } from "./render-widths"
import type { PagePreviewAsset } from "../preview-assets"
import type {
  StepPreviewHydrationProgress,
  StepProcessingTimingSummary,
} from "../step-detection-contracts"

const DEFAULT_PAGE_PREVIEW_HYDRATION_RENDER_MAX_WIDTH = 520
const DEFAULT_PAGE_PREVIEW_HYDRATION_BATCH_SIZE = 3
const DEFAULT_CROP_PREVIEW_HYDRATION_BATCH_SIZE = 2
const DEFAULT_RUNTIME_PAGE_PREVIEW_RENDER_MAX_WIDTH = 2200

interface StepDetectorV2ReusablePreviewResult {
  pageCount: number
  pageLimit: number | null
  pagePreviews?: Array<{
    height: number
    imageDataUrl?: string
    pageNumber: number
    width: number
  }>
}

export interface StepDetectorV2PagePreviewAssetOptions
  extends CreatePagePreviewAssetOptions {
  maxPages?: number
  renderMaxWidth?: number
  signal?: AbortSignal
}

export interface StepDetectorV2PreviewHydrationOptions<
  T extends StepDetectorV2PreviewHydratableResult,
> {
  batchSize?: number
  getPriorityPageNumbers?: () => readonly number[]
  includeCropPreviews?: boolean
  includePagePreviews?: boolean
  lowResolutionBatchSize?: number
  maxPages?: number
  onPageHydrated?: (update: StepDetectorV2PreviewHydrationUpdate<T>) => void
  onProgress?: (progress: StepPreviewHydrationProgress) => void
  onTiming?: (timing: StepProcessingTimingSummary) => void
  pageNumbers?: readonly number[]
  pagePreviewRenderMaxWidth?: number
  renderMaxWidth?: number
  signal?: AbortSignal
}

export interface StepDetectorV2PreviewHydrationUpdate<
  T extends StepDetectorV2PreviewHydratableResult,
> {
  pageNumber: number
  result: T
}

export async function createPdfPagePreviewAssetV2FromFile<
  T extends StepDetectorV2ReusablePreviewResult,
>(
  file: File,
  result: T,
  pageNumber: number,
  options: StepDetectorV2PagePreviewAssetOptions = {},
): Promise<PagePreviewAsset> {
  const baseBounds = readBasePageBoundsForPreviewAsset(result, pageNumber)
  let pageAsset: PagePreviewAsset | null = null

  await visitStepDetectorV2PageInputsFromFile(file, async (pageInput) => {
    pageAsset = await createPagePreviewAssetFromPageInput(pageInput, baseBounds, {
      targetWidth: options.targetWidth,
    })
  }, {
    allowUpscale: true,
    batchSize: 1,
    maxPages: hydrationPageLimit(result, options.maxPages),
    pageNumbers: [pageNumber],
    renderMaxWidth: options.renderMaxWidth ?? options.targetWidth ?? DEFAULT_RUNTIME_PAGE_PREVIEW_RENDER_MAX_WIDTH,
    signal: options.signal,
  })

  if (!pageAsset) {
    throw new Error(`Page ${pageNumber} preview asset could not be generated.`)
  }

  return pageAsset
}

export async function hydratePdfStepPreviewImagesV2FromFile<
  T extends StepDetectorV2ReusablePreviewResult & StepDetectorV2PreviewHydratableResult,
>(
  file: File,
  result: T,
  options: StepDetectorV2PreviewHydrationOptions<T> = {},
): Promise<T> {
  const startedAt = readPerformanceNow()
  let hydratedResult = result
  const requestedPageNumbers = options.pageNumbers ? new Set(options.pageNumbers) : null
  const includePagePreviews = options.includePagePreviews !== false
  const includeCropPreviews = options.includeCropPreviews !== false
  let pagePreviewPageNumbers = readRequestedPagePreviewPageNumbers(result, options, requestedPageNumbers)
  let cropPreviewPageNumbers = readRequestedCropPreviewPageNumbers(hydratedResult, options, requestedPageNumbers)
  const targetPreviewPageCount = mergePageNumbers(pagePreviewPageNumbers, cropPreviewPageNumbers).length
  const hydratedPreviewPageNumbers = new Set<number>()

  publishPreviewProgress(options, null, hydratedPreviewPageNumbers.size, targetPreviewPageCount)

  while (pagePreviewPageNumbers.length > 0 || cropPreviewPageNumbers.length > 0) {
    const pendingPageNumbers = mergePageNumbers(pagePreviewPageNumbers, cropPreviewPageNumbers)
    const cyclePageNumbers = selectNextPreviewHydrationPageNumbers(
      pendingPageNumbers,
      options.getPriorityPageNumbers,
      previewHydrationBatchSize(options, includePagePreviews, includeCropPreviews),
    )

    if (includePagePreviews && includeCropPreviews) {
      await hydrateV2CompletePreviewBatch(
        file,
        hydratedResult,
        cyclePageNumbers,
        options,
        (pageInput, nextResult) => {
          hydratedResult = nextResult
          hydratedPreviewPageNumbers.add(pageInput.pageNumber)
          publishPreviewHydration(options, pageInput.pageNumber, hydratedResult)
          publishPreviewProgress(options, pageInput.pageNumber, hydratedPreviewPageNumbers.size, targetPreviewPageCount)
        },
      )
      pagePreviewPageNumbers = readRequestedPagePreviewPageNumbers(
        hydratedResult,
        options,
        requestedPageNumbers,
      )
      cropPreviewPageNumbers = readRequestedCropPreviewPageNumbers(
        hydratedResult,
        options,
        requestedPageNumbers,
      )
      continue
    }

    const pagePreviewBatch = cyclePageNumbers.filter((pageNumber) =>
      pagePreviewPageNumbers.includes(pageNumber)
    )
    const cropPreviewBatch = cyclePageNumbers.filter((pageNumber) =>
      cropPreviewPageNumbers.includes(pageNumber)
    )

    if (pagePreviewBatch.length > 0) {
      await hydrateV2PagePreviewBatch(
        file,
        hydratedResult,
        pagePreviewBatch,
        options,
        (pageInput, nextResult) => {
          hydratedResult = nextResult
          hydratedPreviewPageNumbers.add(pageInput.pageNumber)
          publishPreviewHydration(options, pageInput.pageNumber, hydratedResult)
          publishPreviewProgress(options, pageInput.pageNumber, hydratedPreviewPageNumbers.size, targetPreviewPageCount)
        },
      )
      pagePreviewPageNumbers = pagePreviewPageNumbers.filter((pageNumber) =>
        !pagePreviewBatch.includes(pageNumber)
      )
    }

    if (cropPreviewBatch.length > 0) {
      await hydrateV2CropPreviewBatch(
        file,
        hydratedResult,
        cropPreviewBatch,
        options,
        (pageInput, nextResult) => {
          hydratedResult = nextResult
          hydratedPreviewPageNumbers.add(pageInput.pageNumber)
          publishPreviewHydration(options, pageInput.pageNumber, hydratedResult)
          publishPreviewProgress(options, pageInput.pageNumber, hydratedPreviewPageNumbers.size, targetPreviewPageCount)
        },
      )
      cropPreviewPageNumbers = readRequestedCropPreviewPageNumbers(
        hydratedResult,
        options,
        requestedPageNumbers,
      )
    }
  }

  publishPreviewProgress(options, null, targetPreviewPageCount, targetPreviewPageCount)
  const finishedAt = readPerformanceNow()
  const timing = {
    counts: {
      previewPages: targetPreviewPageCount,
    },
    label: "V2 preview hydration",
    phaseMs: {
      "preview-hydration": Math.max(0, finishedAt - startedAt),
    },
    totalMs: Math.max(0, finishedAt - startedAt),
  }

  options.onTiming?.(timing)

  return {
    ...hydratedResult,
    previewTiming: timing,
  }
}

async function hydrateV2CompletePreviewBatch<
  T extends StepDetectorV2ReusablePreviewResult & StepDetectorV2PreviewHydratableResult,
>(
  file: File,
  result: T,
  pageNumbers: readonly number[],
  options: StepDetectorV2PreviewHydrationOptions<T>,
  onHydrated: (pageInput: StepDetectorV2PageInput, result: T) => void,
): Promise<void> {
  let hydratedResult = result

  await visitStepDetectorV2PageInputsFromFile(file, async (pageInput) => {
    hydratedResult = await attachV2PreviewImages(hydratedResult, [pageInput], {
      includeCropPreviews: true,
      includePagePreviews: true,
      pagePreviewMaxWidth: options.pagePreviewRenderMaxWidth
        ?? DEFAULT_PAGE_PREVIEW_HYDRATION_RENDER_MAX_WIDTH,
    })
    onHydrated(pageInput, hydratedResult)
    await yieldAfterPreviewHydration(options.signal)
  }, {
    allowUpscale: true,
    batchSize: options.batchSize ?? DEFAULT_CROP_PREVIEW_HYDRATION_BATCH_SIZE,
    maxPages: hydrationPageLimit(result, options.maxPages),
    pageNumbers,
    pickNextPageNumbers: options.getPriorityPageNumbers,
    renderMaxWidth: options.renderMaxWidth ?? readResultRenderMaxWidth(result),
    signal: options.signal,
  })
}

async function hydrateV2PagePreviewBatch<
  T extends StepDetectorV2ReusablePreviewResult & StepDetectorV2PreviewHydratableResult,
>(
  file: File,
  result: T,
  pageNumbers: readonly number[],
  options: StepDetectorV2PreviewHydrationOptions<T>,
  onHydrated: (pageInput: StepDetectorV2PageInput, result: T) => void,
): Promise<void> {
  let hydratedResult = result

  await visitStepDetectorV2PageInputsFromFile(file, async (pageInput) => {
    hydratedResult = await attachV2PagePreviewImages(hydratedResult, [pageInput])
    onHydrated(pageInput, hydratedResult)
    await yieldAfterPreviewHydration(options.signal)
  }, {
    batchSize: options.lowResolutionBatchSize ?? DEFAULT_PAGE_PREVIEW_HYDRATION_BATCH_SIZE,
    maxPages: hydrationPageLimit(result, options.maxPages),
    pageNumbers,
    pickNextPageNumbers: options.getPriorityPageNumbers,
    renderMaxWidth: options.pagePreviewRenderMaxWidth ?? DEFAULT_PAGE_PREVIEW_HYDRATION_RENDER_MAX_WIDTH,
    signal: options.signal,
  })
}

async function hydrateV2CropPreviewBatch<
  T extends StepDetectorV2ReusablePreviewResult & StepDetectorV2PreviewHydratableResult,
>(
  file: File,
  result: T,
  pageNumbers: readonly number[],
  options: StepDetectorV2PreviewHydrationOptions<T>,
  onHydrated: (pageInput: StepDetectorV2PageInput, result: T) => void,
): Promise<void> {
  let hydratedResult = result

  await visitStepDetectorV2PageInputsFromFile(file, async (pageInput) => {
    hydratedResult = await attachV2CropPreviewImages(hydratedResult, [pageInput])
    onHydrated(pageInput, hydratedResult)
    await yieldAfterPreviewHydration(options.signal)
  }, {
    batchSize: options.batchSize ?? DEFAULT_CROP_PREVIEW_HYDRATION_BATCH_SIZE,
    maxPages: hydrationPageLimit(result, options.maxPages),
    pageNumbers,
    pickNextPageNumbers: options.getPriorityPageNumbers,
    renderMaxWidth: options.renderMaxWidth ?? readResultRenderMaxWidth(result),
    signal: options.signal,
  })
}

function previewHydrationBatchSize<T extends StepDetectorV2PreviewHydratableResult>(
  options: StepDetectorV2PreviewHydrationOptions<T>,
  includePagePreviews: boolean,
  includeCropPreviews: boolean,
): number {
  if (includePagePreviews && !includeCropPreviews) {
    return options.lowResolutionBatchSize ?? DEFAULT_PAGE_PREVIEW_HYDRATION_BATCH_SIZE
  }

  return options.batchSize ?? DEFAULT_CROP_PREVIEW_HYDRATION_BATCH_SIZE
}

function publishPreviewHydration<
  T extends StepDetectorV2PreviewHydratableResult,
>(
  options: StepDetectorV2PreviewHydrationOptions<T>,
  pageNumber: number,
  result: T,
): void {
  options.onPageHydrated?.({
    pageNumber,
    result,
  })
}

function publishPreviewProgress<T extends StepDetectorV2PreviewHydratableResult>(
  options: StepDetectorV2PreviewHydrationOptions<T>,
  activePage: number | null,
  hydratedPreviewPageCount: number,
  targetPreviewPageCount: number,
): void {
  options.onProgress?.({
    activePage,
    hydratedPreviewPageCount,
    message: previewProgressMessage(activePage, hydratedPreviewPageCount, targetPreviewPageCount),
    percentage: progressPercentage(hydratedPreviewPageCount, targetPreviewPageCount),
    phase: "preview-hydration",
    targetPreviewPageCount,
  })
}

function previewProgressMessage(
  activePage: number | null,
  hydratedPreviewPageCount: number,
  targetPreviewPageCount: number,
): string {
  if (activePage) {
    return `Generating previews for page ${activePage}.`
  }

  if (hydratedPreviewPageCount >= targetPreviewPageCount) {
    return "Preview generation complete."
  }

  return "Preparing previews."
}

function pagePreviewHydrationPageNumbers(
  result: StepDetectorV2ReusablePreviewResult & StepDetectorV2PreviewHydratableResult,
  maxPages: number | undefined,
): number[] {
  return result.pagePreviews
    .filter((preview) => !preview.imageDataUrl)
    .map((preview) => preview.pageNumber)
    .filter((pageNumber) => isWithinHydrationLimit(pageNumber, result, maxPages))
}

function cropPreviewHydrationPageNumbers(
  result: StepDetectorV2ReusablePreviewResult & StepDetectorV2PreviewHydratableResult,
  maxPages: number | undefined,
): number[] {
  const pageNumbers = result.callouts
    .filter(needsCalloutCropPreviewHydration)
    .map((callout) => callout.pageNumber)
    .filter((pageNumber) => isWithinHydrationLimit(pageNumber, result, maxPages))

  return [...new Set(pageNumbers)].sort((left, right) => left - right)
}

function readRequestedPagePreviewPageNumbers<T extends StepDetectorV2PreviewHydratableResult>(
  result: StepDetectorV2ReusablePreviewResult & T,
  options: StepDetectorV2PreviewHydrationOptions<T>,
  requestedPageNumbers: ReadonlySet<number> | null,
): number[] {
  if (options.includePagePreviews === false) {
    return []
  }

  return filterRequestedPreviewPageNumbers(
    pagePreviewHydrationPageNumbers(result, options.maxPages),
    requestedPageNumbers,
  )
}

function readRequestedCropPreviewPageNumbers<T extends StepDetectorV2PreviewHydratableResult>(
  result: StepDetectorV2ReusablePreviewResult & T,
  options: StepDetectorV2PreviewHydrationOptions<T>,
  requestedPageNumbers: ReadonlySet<number> | null,
): number[] {
  if (options.includeCropPreviews === false) {
    return []
  }

  return filterRequestedPreviewPageNumbers(
    cropPreviewHydrationPageNumbers(result, options.maxPages),
    requestedPageNumbers,
  )
}

function filterRequestedPreviewPageNumbers(
  pageNumbers: readonly number[],
  requestedPageNumbers: ReadonlySet<number> | null,
): number[] {
  if (!requestedPageNumbers) {
    return [...pageNumbers]
  }

  return pageNumbers.filter((pageNumber) => requestedPageNumbers.has(pageNumber))
}

function needsCalloutCropPreviewHydration(
  callout: StepDetectorV2PreviewHydratableResult["callouts"][number],
): boolean {
  return (
    !callout.crop.imageDataUrl ||
    (callout.partItems ?? []).some((partItem) =>
      !partItem.partImage?.imageDataUrl ||
      !partItem.quantityLabel.crop?.imageDataUrl
    )
  )
}

function isWithinHydrationLimit(
  pageNumber: number,
  result: StepDetectorV2ReusablePreviewResult,
  maxPages: number | undefined,
): boolean {
  const pageLimit = hydrationPageLimit(result, maxPages) ?? result.pageCount

  return pageNumber >= 1 && pageNumber <= pageLimit
}

function selectNextPreviewHydrationPageNumbers(
  pendingPageNumbers: readonly number[],
  readPriorityPageNumbers: (() => readonly number[]) | undefined,
  batchSize: number,
): number[] {
  const pending = new Set(pendingPageNumbers)
  const priority = readPriorityPageNumbers
    ? uniquePageNumbers(
        readPriorityPageNumbers().filter((pageNumber) => pending.has(pageNumber)),
      )
    : []

  if (priority.length > 0) {
    return priority.slice(0, normalizePreviewHydrationBatchSize(batchSize))
  }

  return pendingPageNumbers.slice(0, normalizePreviewHydrationBatchSize(batchSize))
}

function mergePageNumbers(
  left: readonly number[],
  right: readonly number[],
): number[] {
  return uniquePageNumbers([...left, ...right]).sort((a, b) => a - b)
}

function uniquePageNumbers(pageNumbers: readonly number[]): number[] {
  return [...new Set(pageNumbers)]
}

function normalizePreviewHydrationBatchSize(batchSize: number): number {
  if (!Number.isFinite(batchSize)) {
    return 1
  }

  return Math.max(1, Math.floor(batchSize))
}

function readBasePageBoundsForPreviewAsset(
  result: StepDetectorV2ReusablePreviewResult,
  pageNumber: number,
): StepDetectorV2PageBounds {
  const preview = result.pagePreviews?.find((candidate) => candidate.pageNumber === pageNumber)

  return preview
    ? { height: preview.height, width: preview.width }
    : { height: 1, width: 1 }
}

async function yieldAfterPreviewHydration(signal: AbortSignal | undefined): Promise<void> {
  throwIfAborted(signal)
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
  throwIfAborted(signal)
}

function hydrationPageLimit(
  result: StepDetectorV2ReusablePreviewResult,
  maxPages: number | undefined,
): number | undefined {
  if (maxPages) {
    return maxPages
  }

  return result.pageLimit ?? undefined
}

function readResultRenderMaxWidth(result: StepDetectorV2ReusablePreviewResult): number | undefined {
  const widths = result.pagePreviews
    ?.map((preview) => preview.width)
    .filter((width) => Number.isFinite(width) && width > 0) ?? []

  if (widths.length === 0) {
    return undefined
  }

  return Math.max(...widths)
}

function progressPercentage(scannedPageCount: number, targetPageCount: number): number {
  if (targetPageCount === 0) {
    return 100
  }

  return Math.min(100, Math.round((scannedPageCount / targetPageCount) * 100))
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Operation cancelled.", "AbortError")
  }
}

function readPerformanceNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now()
}
