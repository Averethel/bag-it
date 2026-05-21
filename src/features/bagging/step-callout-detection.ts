import type { PdfReadableDocument, PdfReadablePage, PdfTextContentItem } from "./pdf-intake"

export const stepCalloutDetectorVersion = "step-callout-detection-v65"
export const defaultStepCalloutPageLimit: number | null = null

const defaultRenderMaxWidth = 1_400
const cropPaddingPixels = 6
const itemCropPaddingPixels = 4
const stepCalloutGroupingSize = 5
const stepPartFeatureGridSize = 28
const stepPartEmbeddingGridSize = 14
const stepPartEmbeddingProjectionBinCount = 16
const stepPartEmbeddingPolarAngleBinCount = 12
const stepPartEmbeddingPolarRadiusBinCount = 4
const stepLocalImageMatchThreshold = 0.78
const stepBomImageMatchThreshold = 0.82
const stepPartCanonicalGridPadding = 2
const stepLocalImageMutualBestTolerance = 0.005
const stepBomImageBestMatchTolerance = 0.02

export type StepCalloutSourceRegion = {
  height: number
  unit: "step_pixel"
  width: number
  x: number
  y: number
}

export type StepCalloutSourceImage = {
  height: number
  unit: "step_pixel"
  width: number
}

export type DetectedStepCallout = {
  confidence: number
  crop: {
    dataUrl: string
    height: number
    width: number
  }
  id: string
  indexOnPage: number
  pageNumber: number
  partItems: DetectedStepCalloutPartItem[]
  sourceImage: StepCalloutSourceImage
  sourceRegion: StepCalloutSourceRegion
  stepIndex: number
}

export type DetectedStepCalloutPartItem = {
  bomImageMatch?: DetectedStepCalloutBomImageMatch | null
  confidence: number
  detectedColor: {
    confidence: number
    hex: string
    name: string
    rgb: {
      b: number
      g: number
      r: number
    }
  }
  id: string
  imageSignature?: DetectedStepCalloutPartImageSignature | null
  indexOnCallout: number
  localImageMatch: DetectedStepCalloutLocalImageMatch | null
  localImageRejectedMatches?: DetectedStepCalloutLocalImageRejectedMatch[]
  partCrop: {
    dataUrl: string
    height: number
    width: number
  }
  partRegion: StepCalloutSourceRegion
  quantityLabel: {
    crop: {
      dataUrl: string
      height: number
      width: number
    }
    region: StepCalloutSourceRegion
  }
  quantity: {
    confidence: number
    text: string | null
    value: number | null
  }
  sourceRegion: StepCalloutSourceRegion
}

export type DetectedStepCalloutPartImageSignature = {
  aspectRatio: number
  bottomProfile?: string
  boundsHeight?: number
  boundsWidth?: number
  compactness: number
  coverage: number
  detailGrid: string
  edgeGrid?: string
  grid: string
  pixelCount?: number
  surfaceHex: string
  topProfile?: string
}

export type DetectedStepCalloutLocalImageMatch = {
  confidence: number
  groupId: string
  groupIndex: number
  itemCount: number
  stepGroupIndex: number
  stepGroupRange: {
    end: number
    start: number
  }
}

export type DetectedStepCalloutLocalImageRejectedMatch = {
  aspectScore: number
  candidateColorHex: string
  candidateColorName: string
  candidateCrop: {
    dataUrl: string
    height: number
    width: number
  }
  candidateItemId: string
  candidateItemIndex: number
  candidateStepIndex: number
  colorScore: number
  compactnessScore: number
  coverageScore: number
  detailScore: number
  edgeScore: number
  embeddingScore: number
  reason: string
  score: number
  shapeScore: number
  source: "local_callout"
  stepGroupRange: {
    end: number
    start: number
  }
  structureScore: number
  visualScore: number
}

export type DetectedStepCalloutBomImageMatch = {
  cataloguePartNumber: string | null
  colorId: string | null
  colorName: string | null
  colorScore: number
  confidence: number
  fallbackPreviewImageUrl: string | null
  partName: string | null
  partNumber: string
  previewImageUrl: string | null
  quantity: number
  rowId: string
  sourcePage: number
  visualScore: number
}

export type StepCalloutDetectionResult = {
  callouts: DetectedStepCallout[]
  detectorVersion: typeof stepCalloutDetectorVersion
  pageCount: number
  pageLimit: number | null
  scannedPageNumbers: number[]
  skippedBomPageNumbers: number[]
  status: "detected" | "empty"
}

export type StepCalloutDetectionProgress = {
  currentPage: number | null
  detectedCalloutCount: number
  message: string
  pageCount: number
  progress: number
  scannedPageCount: number
  targetPageCount: number
}

export type StepCalloutDetectionOptions = {
  excludedPageNumbers?: ReadonlySet<number> | readonly number[]
  inventoryRows?: readonly StepCalloutInventoryMatchRow[]
  maxPages?: number | null
  onProgress?: (progress: StepCalloutDetectionProgress) => void
  renderMaxWidth?: number
  signal?: AbortSignal
}

export type StepCalloutInventoryMatchRow = {
  cataloguePartNumber?: string | null
  colorId?: string | null
  colorName?: string | null
  colorRgb?: string | null
  partNumber: string
  partName?: string | null
  partThumbnailRegion?: {
    height: number
    unit: "ocr_pixel"
    width: number
    x: number
    y: number
  } | null
  previewImageUrl?: string | null
  fallbackPreviewImageUrl?: string | null
  quantity: number
  rowId: string
  sourceImage?: {
    height: number
    unit: "ocr_pixel"
    width: number
  } | null
  sourcePage: number
  sourceRegion?: {
    height: number
    unit: "ocr_pixel"
    width: number
    x: number
    y: number
  } | null
}

type DetectionImageData = Pick<ImageData, "data" | "height" | "width">

type ColorSample = {
  b: number
  g: number
  r: number
}

type DetectedColorEstimate = DetectedStepCalloutPartItem["detectedColor"]

type QuantityEstimate = DetectedStepCalloutPartItem["quantity"]

type StepQuantityRead = {
  quantity: QuantityEstimate
  sourceRegion: StepCalloutSourceRegion | null
}

type StepPartSurfaceSample = ColorSample & {
  weight: number
}

type StepPartImageFeature = {
  aspectRatio: number
  boundsHeight: number
  boundsWidth: number
  compactness: number
  coverage: number
  detailGrid: number[]
  edgeGrid: number[]
  embedding: number[]
  grid: number[]
  pixelCount: number
  structureGrid: number[]
  surfaceRgb: ColorSample
}

type StepPartFeaturePixel = {
  color: ColorSample
  x: number
  y: number
}

type StepPartVisualScore = {
  aspectScore: number
  compactnessScore: number
  coverageScore: number
  detailScore: number
  edgeScore: number
  embeddingScore: number
  shapeScore: number
  source: "catalogue_preview" | "local_callout" | "manual_thumbnail"
  structureScore: number
  visualScore: number
}

type StepLocalPartImageScore = StepPartVisualScore & {
  colorScore: number
  score: number
}

type StepBomPartImageScore = StepPartVisualScore & {
  colorCompatibilityScore: number
  colorScore: number
  score: number
}

type PixelRegion = {
  height: number
  width: number
  x: number
  y: number
}

type DarkComponent = PixelRegion & { count: number }

type RegionCandidate = PixelRegion & {
  borderScore: number
  confidence: number
  fillRatio: number
}

type StepCalloutPartItemRegion = {
  confidence: number
  itemRegion: PixelRegion
  partRegion: PixelRegion
  quantityRegion: PixelRegion
}

type StepCalloutPartItemFeatureEntry = {
  calloutIndex: number
  feature: StepPartImageFeature | null
  itemId: string
  stepIndex: number
}

type StepCalloutInventoryFeatureEntry = StepCalloutInventoryMatchRow & {
  catalogueFeature: StepPartImageFeature | null
  feature: StepPartImageFeature
  manualFeatureReliability: StepBomManualFeatureReliability
}

type StepBomManualFeatureReliability = "high" | "low"

type StepPageTextItem = PixelRegion & {
  text: string
}

type QuantityGlyphClassification = {
  char: `${number}` | "x"
  confidence: number
}

type PixelMatcher = (imageData: DetectionImageData, x: number, y: number) => boolean

export async function detectStepCalloutsFromPdfDocument(
  document: PdfReadableDocument,
  {
    excludedPageNumbers = [],
    inventoryRows = [],
    maxPages = defaultStepCalloutPageLimit,
    onProgress,
    renderMaxWidth = defaultRenderMaxWidth,
    signal,
  }: StepCalloutDetectionOptions = {},
): Promise<StepCalloutDetectionResult> {
  const excludedPages = new Set(excludedPageNumbers)
  const pageNumbers = getInitialStepCalloutPageNumbers(document.numPages, excludedPages, maxPages)
  const callouts: DetectedStepCallout[] = []
  const partFeatureEntries: StepCalloutPartItemFeatureEntry[] = []

  onProgress?.({
    currentPage: null,
    detectedCalloutCount: 0,
    message: `Preparing step callout scan for ${pageNumbers.length} pages.`,
    pageCount: document.numPages,
    progress: pageNumbers.length === 0 ? 100 : 5,
    scannedPageCount: 0,
    targetPageCount: pageNumbers.length,
  })

  if (!document.getPage || typeof globalThis.document === "undefined") {
    return createStepCalloutDetectionResult({
      callouts,
      document,
      excludedPages,
      maxPages,
      pageNumbers,
    })
  }

  for (const [pageIndex, pageNumber] of pageNumbers.entries()) {
    assertStepCalloutDetectionCanContinue(signal)
    onProgress?.({
      currentPage: pageNumber,
      detectedCalloutCount: callouts.length,
      message: `Scanning page ${pageNumber} for step callouts.`,
      pageCount: document.numPages,
      progress: getStepCalloutProgress(pageIndex, pageNumbers.length, 0.15),
      scannedPageCount: pageIndex,
      targetPageCount: pageNumbers.length,
    })

    const page = await document.getPage!(pageNumber)
    try {
      const renderedPage = await renderPdfPageForStepCallouts(page, { renderMaxWidth, signal })
      if (!renderedPage) {
        continue
      }

      const nativeTextItems = await extractStepPageTextItems(page, {
        scale: renderedPage.scale,
        viewportHeight: renderedPage.viewportHeight,
      })
      const regions = detectStepCalloutRegionsFromImageData(renderedPage.imageData)
      const pageCallouts = regions.map((region, index) => {
        const paddedRegion = padRegion(region, renderedPage.canvas.width, renderedPage.canvas.height, cropPaddingPixels)
        const calloutCanvas = cropCanvasRegionToCanvas(renderedPage.canvas, paddedRegion)
        const calloutCrop = createCanvasCrop(calloutCanvas)
        const calloutIndex = callouts.length + index
        const stepIndex = calloutIndex + 1
        const partItems = detectStepCalloutPartItemsFromCanvas(calloutCanvas, {
          calloutIdPrefix: `step-callout:p${pageNumber}:r${index + 1}`,
          calloutIndex,
          nativeTextItems,
          pageOffsetX: paddedRegion.x,
          pageOffsetY: paddedRegion.y,
          partFeatureEntries,
          stepIndex,
        })

        return {
          confidence: region.confidence,
          crop: calloutCrop,
          id: `step-callout:p${pageNumber}:r${index + 1}:x${paddedRegion.x}:y${paddedRegion.y}:w${paddedRegion.width}:h${paddedRegion.height}`,
          indexOnPage: index + 1,
          pageNumber,
          partItems,
          sourceImage: {
            height: renderedPage.canvas.height,
            unit: "step_pixel" as const,
            width: renderedPage.canvas.width,
          },
          sourceRegion: {
            height: paddedRegion.height,
            unit: "step_pixel" as const,
            width: paddedRegion.width,
            x: paddedRegion.x,
            y: paddedRegion.y,
          },
          stepIndex,
        }
      })
      callouts.push(...pageCallouts)
    } finally {
      page.cleanup?.()
    }

    onProgress?.({
      currentPage: pageNumber,
      detectedCalloutCount: callouts.length,
      message: `Finished page ${pageNumber}; ${callouts.length} step callouts detected so far.`,
      pageCount: document.numPages,
      progress: getStepCalloutProgress(pageIndex + 1, pageNumbers.length, 1),
      scannedPageCount: pageIndex + 1,
      targetPageCount: pageNumbers.length,
    })
  }

  const groupedCallouts = groupStepCalloutPartItemsByLocalImageMatch(callouts, partFeatureEntries)
  const inventoryMatchedCallouts = await matchStepCalloutPartItemsToBomRows(document, groupedCallouts, partFeatureEntries, {
    inventoryRows,
    signal,
  })

  return createStepCalloutDetectionResult({
    callouts: inventoryMatchedCallouts,
    document,
    excludedPages,
    maxPages,
    pageNumbers,
  })
}

export function getInitialStepCalloutPageNumbers(
  pageCount: number,
  excludedPageNumbers: ReadonlySet<number> | readonly number[] = [],
  maxPages = defaultStepCalloutPageLimit,
) {
  const excludedPages = excludedPageNumbers instanceof Set ? excludedPageNumbers : new Set(excludedPageNumbers)
  const pageNumbers: number[] = []
  const pageLimit = maxPages == null ? pageCount : maxPages

  for (let pageNumber = 1; pageNumber <= pageCount && pageNumbers.length < pageLimit; pageNumber += 1) {
    if (!excludedPages.has(pageNumber)) {
      pageNumbers.push(pageNumber)
    }
  }

  return pageNumbers
}

export function detectStepCalloutRegionsFromImageData(imageData: DetectionImageData): RegionCandidate[] {
  const background = samplePageBackground(imageData)
  const fillMask = createCalloutFillMask(imageData, background)
  const visited = new Uint8Array(imageData.width * imageData.height)
  const candidates: RegionCandidate[] = []

  for (let pixelIndex = 0; pixelIndex < fillMask.length; pixelIndex += 1) {
    if (!fillMask[pixelIndex] || visited[pixelIndex]) {
      continue
    }

    const component = collectFillComponent(fillMask, visited, imageData.width, imageData.height, pixelIndex)
    const candidate = createRegionCandidate(imageData, component)
    if (candidate) {
      candidates.push(candidate)
    }
  }

  return suppressOverlappingCandidates(candidates)
    .sort((left, right) => left.y - right.y || left.x - right.x)
}

export function detectStepCalloutPartItemRegionsFromImageData(imageData: DetectionImageData): StepCalloutPartItemRegion[] {
  const background = sampleCalloutBackground(imageData)
  const foregroundMask = createCalloutItemForegroundMask(imageData, background)
  const interiorMargin = getCalloutInteriorMargin(imageData)
  clearMaskOutsideInterior(foregroundMask, imageData.width, imageData.height, interiorMargin)

  const rowBands = getProjectionBands(getVerticalProjection(foregroundMask, imageData.width, imageData.height), {
    gapTolerance: Math.max(8, Math.round(imageData.height * 0.035)),
    minCount: Math.max(3, Math.round(imageData.width * 0.014)),
    minSize: Math.max(22, Math.round(imageData.height * 0.08)),
  })
  const regions: StepCalloutPartItemRegion[] = []

  for (const rowBand of rowBands) {
    const xBands = getProjectionBands(getHorizontalProjection(foregroundMask, imageData.width, rowBand), {
      gapTolerance: Math.max(8, Math.round(imageData.width * 0.025)),
      minCount: Math.max(2, Math.round((rowBand.end - rowBand.start + 1) * 0.025)),
      minSize: Math.max(16, Math.round(imageData.width * 0.035)),
    })

    for (const xBand of xBands) {
      const itemRegion = trimRegionToForeground(
        foregroundMask,
        imageData.width,
        imageData.height,
        {
          height: rowBand.end - rowBand.start + 1,
          width: xBand.end - xBand.start + 1,
          x: xBand.start,
          y: rowBand.start,
        },
      )
      if (!itemRegion || !isLikelyCalloutPartItemRegion(imageData, itemRegion)) {
        continue
      }

      const quantityRegion = detectQuantityLabelRegion(imageData, itemRegion)
      const fullItemRegion = normalizeRegion(
        unionRegions([itemRegion, quantityRegion]) ?? itemRegion,
        imageData.width,
        imageData.height,
      )
      const partRegion = getPartImageRegionForItem(
        imageData,
        foregroundMask,
        fullItemRegion,
        quantityRegion,
      )
      regions.push({
        confidence: scorePartItemRegion(imageData, fullItemRegion, quantityRegion, partRegion),
        itemRegion: fullItemRegion,
        partRegion,
        quantityRegion,
      })
    }
  }

  return sortPartItemRegions(suppressOverlappingPartItemRegions(regions))
}

function createStepCalloutDetectionResult({
  callouts,
  document,
  excludedPages,
  maxPages,
  pageNumbers,
}: {
  callouts: DetectedStepCallout[]
  document: PdfReadableDocument
  excludedPages: ReadonlySet<number>
  maxPages: number | null
  pageNumbers: readonly number[]
}): StepCalloutDetectionResult {
  return {
    callouts,
    detectorVersion: stepCalloutDetectorVersion,
    pageCount: document.numPages,
    pageLimit: maxPages,
    scannedPageNumbers: [...pageNumbers],
    skippedBomPageNumbers: [...excludedPages].filter((pageNumber) => pageNumber >= 1 && pageNumber <= document.numPages)
      .sort((left, right) => left - right),
    status: callouts.length > 0 ? "detected" : "empty",
  }
}

async function renderPdfPageForStepCallouts(
  page: PdfReadablePage,
  {
    renderMaxWidth,
    signal,
  }: {
    renderMaxWidth: number
    signal?: AbortSignal
  },
) {
  assertStepCalloutDetectionCanContinue(signal)
  const viewport = page.getViewport({ scale: 1 })
  const scale = Math.min(3, renderMaxWidth / viewport.width)
  const scaledViewport = page.getViewport({ scale })
  const width = Math.ceil(scaledViewport.width)
  const height = Math.ceil(scaledViewport.height)
  const canvas = globalThis.document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) {
    return null
  }

  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, width, height)

  const renderTask = page.render?.({
    canvas,
    canvasContext: context,
    viewport: scaledViewport,
  })
  if (!renderTask) {
    return null
  }

  const abortRender = () => renderTask.cancel?.()
  signal?.addEventListener("abort", abortRender, { once: true })
  try {
    await renderTask.promise
    assertStepCalloutDetectionCanContinue(signal)
  } finally {
    signal?.removeEventListener("abort", abortRender)
  }

  return {
    canvas,
    imageData: context.getImageData(0, 0, width, height),
    scale,
    viewportHeight: viewport.height,
  }
}

function createCalloutFillMask(imageData: DetectionImageData, background: ColorSample) {
  const mask = new Uint8Array(imageData.width * imageData.height)

  for (let pixelIndex = 0; pixelIndex < mask.length; pixelIndex += 1) {
    const dataIndex = pixelIndex * 4
    if (
      isLikelyCalloutFillPixel(
        imageData.data[dataIndex] ?? 0,
        imageData.data[dataIndex + 1] ?? 0,
        imageData.data[dataIndex + 2] ?? 0,
        imageData.data[dataIndex + 3] ?? 255,
        background,
      )
    ) {
      mask[pixelIndex] = 1
    }
  }

  return mask
}

function collectFillComponent(
  fillMask: Uint8Array,
  visited: Uint8Array,
  width: number,
  height: number,
  startIndex: number,
) {
  const stack = [startIndex]
  let count = 0
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  visited[startIndex] = 1

  while (stack.length > 0) {
    const pixelIndex = stack.pop() ?? 0
    const x = pixelIndex % width
    const y = Math.floor(pixelIndex / width)
    count += 1
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)

    addFillNeighbor(fillMask, visited, stack, pixelIndex - 1, x > 0)
    addFillNeighbor(fillMask, visited, stack, pixelIndex + 1, x < width - 1)
    addFillNeighbor(fillMask, visited, stack, pixelIndex - width, y > 0)
    addFillNeighbor(fillMask, visited, stack, pixelIndex + width, y < height - 1)
  }

  return {
    count,
    height: maxY - minY + 1,
    width: maxX - minX + 1,
    x: minX,
    y: minY,
  }
}

function addFillNeighbor(
  fillMask: Uint8Array,
  visited: Uint8Array,
  stack: number[],
  pixelIndex: number,
  isInBounds: boolean,
) {
  if (!isInBounds || visited[pixelIndex] || !fillMask[pixelIndex]) {
    return
  }

  visited[pixelIndex] = 1
  stack.push(pixelIndex)
}

function createRegionCandidate(
  imageData: DetectionImageData,
  component: PixelRegion & { count: number },
): RegionCandidate | null {
  const imageArea = imageData.width * imageData.height
  const minWidth = Math.max(48, imageData.width * 0.08)
  const minHeight = Math.max(36, imageData.height * 0.05)
  const maxWidth = imageData.width * 0.92
  const maxHeight = imageData.height * 0.45
  const rawArea = component.width * component.height

  if (
    component.count < imageArea * 0.003 ||
    component.width < minWidth ||
    component.height < minHeight ||
    component.width > maxWidth ||
    component.height > maxHeight ||
    rawArea <= 0
  ) {
    return null
  }

  const fillRatio = component.count / rawArea
  if (fillRatio < 0.16) {
    return null
  }

  const borderSearchRadius = Math.max(4, Math.round(Math.min(imageData.width, imageData.height) * 0.008))
  const borderedRegion = snapRegionToDarkBorder(imageData, expandRegion(component, imageData, borderSearchRadius), borderSearchRadius)
  const borderScore = getRegionBorderScore(imageData, borderedRegion)
  if (borderScore < 0.22) {
    return null
  }

  const confidence = clamp((fillRatio * 0.4) + (borderScore * 0.6), 0, 1)

  return {
    ...borderedRegion,
    borderScore,
    confidence,
    fillRatio,
  }
}

function snapRegionToDarkBorder(imageData: DetectionImageData, region: PixelRegion, searchRadius: number): PixelRegion {
  const left = findBestVerticalBorder(imageData, region, region.x - searchRadius, region.x + searchRadius)
  const right = findBestVerticalBorder(
    imageData,
    region,
    region.x + region.width - 1 - searchRadius,
    region.x + region.width - 1 + searchRadius,
  )
  const top = findBestHorizontalBorder(imageData, region, region.y - searchRadius, region.y + searchRadius)
  const bottom = findBestHorizontalBorder(
    imageData,
    region,
    region.y + region.height - 1 - searchRadius,
    region.y + region.height - 1 + searchRadius,
  )
  const x = left ?? region.x
  const y = top ?? region.y
  const rightEdge = right ?? (region.x + region.width - 1)
  const bottomEdge = bottom ?? (region.y + region.height - 1)

  return normalizeRegion({
    height: bottomEdge - y + 1,
    width: rightEdge - x + 1,
    x,
    y,
  }, imageData.width, imageData.height)
}

function findBestVerticalBorder(
  imageData: DetectionImageData,
  region: PixelRegion,
  startX: number,
  endX: number,
) {
  let bestCoverage = 0
  let bestX: number | null = null

  for (let x = Math.max(0, startX); x <= Math.min(imageData.width - 1, endX); x += 1) {
    const coverage = getVerticalDarkCoverage(imageData, x, region.y, region.y + region.height - 1)
    if (coverage > bestCoverage) {
      bestCoverage = coverage
      bestX = x
    }
  }

  return bestCoverage >= 0.28 ? bestX : null
}

function findBestHorizontalBorder(
  imageData: DetectionImageData,
  region: PixelRegion,
  startY: number,
  endY: number,
) {
  let bestCoverage = 0
  let bestY: number | null = null

  for (let y = Math.max(0, startY); y <= Math.min(imageData.height - 1, endY); y += 1) {
    const coverage = getHorizontalDarkCoverage(imageData, y, region.x, region.x + region.width - 1)
    if (coverage > bestCoverage) {
      bestCoverage = coverage
      bestY = y
    }
  }

  return bestCoverage >= 0.28 ? bestY : null
}

function getRegionBorderScore(imageData: DetectionImageData, region: PixelRegion) {
  const left = getVerticalDarkCoverage(imageData, region.x, region.y, region.y + region.height - 1)
  const right = getVerticalDarkCoverage(imageData, region.x + region.width - 1, region.y, region.y + region.height - 1)
  const top = getHorizontalDarkCoverage(imageData, region.y, region.x, region.x + region.width - 1)
  const bottom = getHorizontalDarkCoverage(
    imageData,
    region.y + region.height - 1,
    region.x,
    region.x + region.width - 1,
  )

  return (left + right + top + bottom) / 4
}

function getVerticalDarkCoverage(imageData: DetectionImageData, x: number, startY: number, endY: number) {
  let darkPixels = 0
  let totalPixels = 0
  const boundedStartY = Math.max(0, Math.floor(startY))
  const boundedEndY = Math.min(imageData.height - 1, Math.ceil(endY))

  for (let y = boundedStartY; y <= boundedEndY; y += 1) {
    totalPixels += 1
    if (isDarkPixel(imageData, x, y)) {
      darkPixels += 1
    }
  }

  return totalPixels === 0 ? 0 : darkPixels / totalPixels
}

function getHorizontalDarkCoverage(imageData: DetectionImageData, y: number, startX: number, endX: number) {
  let darkPixels = 0
  let totalPixels = 0
  const boundedStartX = Math.max(0, Math.floor(startX))
  const boundedEndX = Math.min(imageData.width - 1, Math.ceil(endX))

  for (let x = boundedStartX; x <= boundedEndX; x += 1) {
    totalPixels += 1
    if (isDarkPixel(imageData, x, y)) {
      darkPixels += 1
    }
  }

  return totalPixels === 0 ? 0 : darkPixels / totalPixels
}

function isDarkPixel(imageData: DetectionImageData, x: number, y: number) {
  const dataIndex = ((Math.floor(y) * imageData.width) + Math.floor(x)) * 4
  const alpha = imageData.data[dataIndex + 3] ?? 255
  if (alpha < 32) {
    return false
  }

  const r = imageData.data[dataIndex] ?? 0
  const g = imageData.data[dataIndex + 1] ?? 0
  const b = imageData.data[dataIndex + 2] ?? 0

  return (r + g + b) / 3 < 90
}

function isQuantityTextPixel(imageData: DetectionImageData, x: number, y: number) {
  const dataIndex = ((Math.floor(y) * imageData.width) + Math.floor(x)) * 4
  const alpha = imageData.data[dataIndex + 3] ?? 255
  if (alpha < 32) {
    return false
  }

  const r = imageData.data[dataIndex] ?? 0
  const g = imageData.data[dataIndex + 1] ?? 0
  const b = imageData.data[dataIndex + 2] ?? 0
  const brightness = (r + g + b) / 3
  const chroma = Math.max(r, g, b) - Math.min(r, g, b)

  return brightness < 115 && chroma <= 45
}

function isLikelyCalloutFillPixel(r: number, g: number, b: number, alpha: number, background: ColorSample) {
  if (alpha < 32) {
    return false
  }

  const brightness = (r + g + b) / 3
  const chroma = Math.max(r, g, b) - Math.min(r, g, b)
  const distanceFromBackground = getColorDistance({ b, g, r }, background)
  const isWarmModelPanel = brightness > 185 && r > b + 18 && g > b + 8

  return (
    !isWarmModelPanel &&
    brightness >= 185 &&
    brightness <= 252 &&
    distanceFromBackground >= 14 &&
    (chroma >= 8 || distanceFromBackground >= 22)
  )
}

function samplePageBackground(imageData: DetectionImageData): ColorSample {
  const samples: ColorSample[] = []
  const sampleWidth = Math.max(4, Math.round(imageData.width * 0.04))
  const sampleHeight = Math.max(4, Math.round(imageData.height * 0.04))
  const stepX = Math.max(1, Math.floor(sampleWidth / 8))
  const stepY = Math.max(1, Math.floor(sampleHeight / 8))

  for (const originY of [0, imageData.height - sampleHeight]) {
    for (const originX of [0, imageData.width - sampleWidth]) {
      for (let y = Math.max(0, originY); y < Math.min(imageData.height, originY + sampleHeight); y += stepY) {
        for (let x = Math.max(0, originX); x < Math.min(imageData.width, originX + sampleWidth); x += stepX) {
          const dataIndex = ((y * imageData.width) + x) * 4
          samples.push({
            b: imageData.data[dataIndex + 2] ?? 255,
            g: imageData.data[dataIndex + 1] ?? 255,
            r: imageData.data[dataIndex] ?? 255,
          })
        }
      }
    }
  }

  return {
    b: median(samples.map((sample) => sample.b)) ?? 255,
    g: median(samples.map((sample) => sample.g)) ?? 255,
    r: median(samples.map((sample) => sample.r)) ?? 255,
  }
}

function suppressOverlappingCandidates(candidates: readonly RegionCandidate[]) {
  const selected: RegionCandidate[] = []
  for (const candidate of [...candidates].sort((left, right) => right.confidence - left.confidence)) {
    if (selected.some((existing) => getIntersectionOverUnion(existing, candidate) > 0.65)) {
      continue
    }

    selected.push(candidate)
  }

  return selected
}

function getIntersectionOverUnion(left: PixelRegion, right: PixelRegion) {
  const xOverlap = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
  const yOverlap = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y))
  const intersection = xOverlap * yOverlap
  const union = (left.width * left.height) + (right.width * right.height) - intersection

  return union <= 0 ? 0 : intersection / union
}

function detectStepCalloutPartItemsFromCanvas(
  canvas: HTMLCanvasElement,
  {
    calloutIdPrefix,
    calloutIndex,
    nativeTextItems,
    pageOffsetX,
    pageOffsetY,
    partFeatureEntries,
    stepIndex,
  }: {
    calloutIdPrefix: string
    calloutIndex: number
    nativeTextItems?: readonly StepPageTextItem[]
    pageOffsetX: number
    pageOffsetY: number
    partFeatureEntries: StepCalloutPartItemFeatureEntry[]
    stepIndex: number
  },
): DetectedStepCalloutPartItem[] {
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) {
    return []
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const background = sampleCalloutBackground(imageData)

  return detectStepCalloutPartItemRegionsFromImageData(imageData).map((region, index) => {
    const itemRegion = padRegion(region.itemRegion, canvas.width, canvas.height, itemCropPaddingPixels)
    const partRegion = padPartRegion(
      region.partRegion,
      canvas.width,
      canvas.height,
      itemCropPaddingPixels,
    )
    const detectedQuantityRegion = padRegion(region.quantityRegion, canvas.width, canvas.height, 2)
    const itemSourceRegion = toPageSourceRegion(itemRegion, pageOffsetX, pageOffsetY)
    const partSourceRegion = toPageSourceRegion(partRegion, pageOffsetX, pageOffsetY)
    const detectedQuantitySourceRegion = toPageSourceRegion(detectedQuantityRegion, pageOffsetX, pageOffsetY)
    const quantityRead = readQuantityFromNativeTextItems(nativeTextItems ?? [], detectedQuantitySourceRegion) ??
      readQuantityFromNativeTextItems(nativeTextItems ?? [], itemSourceRegion) ?? {
        quantity: readQuantityFromImageData(imageData, detectedQuantityRegion),
        sourceRegion: detectedQuantitySourceRegion,
      }
    const quantity = quantityRead.quantity
    const quantityTextSourceRegion = quantityRead.sourceRegion ?? detectedQuantitySourceRegion
    const rawQuantityRegion = padRegion(
      toLocalPixelRegion(quantityTextSourceRegion, pageOffsetX, pageOffsetY),
      canvas.width,
      canvas.height,
      2,
    )
    const quantityRegion = getQuantityDisplayRegion(imageData, rawQuantityRegion, quantity) ?? rawQuantityRegion
    const quantitySourceRegion = toPageSourceRegion(quantityRegion, pageOffsetX, pageOffsetY)
    const quantityExclusionRegions = getTrustedQuantityTextExclusionRegions(imageData, quantityRegion, quantity)
    const detectedColor = detectPartColorFromImageData(
      imageData,
      partRegion,
      background,
      quantityExclusionRegions,
    )
    const feature = createStepPartImageFeature(imageData, partRegion, quantityExclusionRegions)
    const itemId = `${calloutIdPrefix}:item${index + 1}:x${itemSourceRegion.x}:y${itemSourceRegion.y}:w${itemSourceRegion.width}:h${itemSourceRegion.height}`
    partFeatureEntries.push({
      calloutIndex,
      feature,
      itemId,
      stepIndex,
    })

    return {
      bomImageMatch: null,
      confidence: region.confidence,
      detectedColor,
      id: itemId,
      imageSignature: createStepPartImageSignature(feature),
      indexOnCallout: index + 1,
      localImageMatch: null,
      localImageRejectedMatches: [],
      partCrop: cropCanvasRegionRemovingBackground(canvas, imageData, itemRegion, background),
      partRegion: partSourceRegion,
      quantityLabel: {
        crop: cropCanvasRegion(canvas, quantityRegion),
        region: quantitySourceRegion,
      },
      quantity,
      sourceRegion: itemSourceRegion,
    }
  })
}

function groupStepCalloutPartItemsByLocalImageMatch(
  callouts: readonly DetectedStepCallout[],
  partFeatureEntries: readonly StepCalloutPartItemFeatureEntry[],
): DetectedStepCallout[] {
  if (callouts.length === 0 || partFeatureEntries.length === 0) {
    return [...callouts]
  }

  const featureByItemId = new Map(partFeatureEntries.map((entry) => [entry.itemId, entry.feature] as const))
  const localMatchByItemId = new Map<string, DetectedStepCalloutLocalImageMatch>()
  const localRejectedMatchesByItemId = new Map<string, DetectedStepCalloutLocalImageRejectedMatch[]>()
  const maxStepIndex = Math.max(...callouts.map((callout) => callout.stepIndex))

  for (let windowStart = 1; windowStart <= maxStepIndex; windowStart += stepCalloutGroupingSize) {
    const windowEnd = windowStart + stepCalloutGroupingSize - 1
    const stepGroupRange = {
      end: windowEnd,
      start: windowStart,
    }
    const windowCallouts = callouts.filter((callout) =>
      callout.stepIndex >= windowStart && callout.stepIndex <= windowEnd
    )
    const windowItems = windowCallouts.flatMap((callout) =>
      callout.partItems.map((item) => ({
        feature: featureByItemId.get(item.id) ?? null,
        item,
        stepIndex: callout.stepIndex,
      }))
    )
    const matchEvaluation = evaluateStepLocalImagePairMatches(windowItems, stepGroupRange)
    for (const [itemId, rejectedMatches] of matchEvaluation.rejectedMatchesByItemId.entries()) {
      localRejectedMatchesByItemId.set(itemId, [
        ...(localRejectedMatchesByItemId.get(itemId) ?? []),
        ...rejectedMatches,
      ])
    }
    const clusters = createStepLocalImageClusters(
      windowItems,
      matchEvaluation.acceptedMatches,
    )

    clusters.forEach((cluster, clusterIndex) => {
      const confidence = cluster.confidenceScores.length > 0
        ? cluster.confidenceScores.reduce((sum, score) => sum + score, 0) / cluster.confidenceScores.length
        : 1
      const localImageMatch: DetectedStepCalloutLocalImageMatch = {
        confidence: clamp(confidence, 0, 1),
        groupId: `step-local-image:g${Math.floor((windowStart - 1) / stepCalloutGroupingSize) + 1}:m${clusterIndex + 1}`,
        groupIndex: clusterIndex + 1,
        itemCount: cluster.itemIndexes.length,
        stepGroupIndex: Math.floor((windowStart - 1) / stepCalloutGroupingSize) + 1,
        stepGroupRange,
      }
      for (const itemIndex of cluster.itemIndexes) {
        const item = windowItems[itemIndex]?.item
        if (item) {
          localMatchByItemId.set(item.id, localImageMatch)
        }
      }
    })
  }

  return callouts.map((callout) => ({
    ...callout,
    partItems: callout.partItems.map((item) => ({
      ...item,
      localImageMatch: localMatchByItemId.get(item.id) ?? null,
      localImageRejectedMatches: trimStepLocalImageRejectedMatches(localRejectedMatchesByItemId.get(item.id) ?? []),
    })),
  }))
}

async function matchStepCalloutPartItemsToBomRows(
  document: PdfReadableDocument,
  callouts: readonly DetectedStepCallout[],
  partFeatureEntries: readonly StepCalloutPartItemFeatureEntry[],
  {
    inventoryRows,
    signal,
  }: {
    inventoryRows: readonly StepCalloutInventoryMatchRow[]
    signal?: AbortSignal
  },
): Promise<DetectedStepCallout[]> {
  if (callouts.length === 0 || partFeatureEntries.length === 0 || inventoryRows.length === 0) {
    return [...callouts]
  }
  if (!document.getPage || typeof globalThis.document === "undefined") {
    return [...callouts]
  }

  const inventoryFeatures = await createStepCalloutInventoryFeatureEntries(document, inventoryRows, signal)
  if (inventoryFeatures.length === 0) {
    return [...callouts]
  }

  const featureByItemId = new Map(partFeatureEntries.map((entry) => [entry.itemId, entry.feature] as const))
  const localImageGroupQuantityById = getStepLocalImageGroupQuantityById(callouts)
  const rowRemainingQuantity = new Map(inventoryFeatures.map((entry) => [entry.rowId, entry.quantity] as const))
  const itemCandidates: StepBomImageMatchItemCandidate[] = callouts.flatMap((callout) =>
    callout.partItems.map((item) => {
      const feature = featureByItemId.get(item.id) ?? null
      const quantity = getStepItemMatchQuantity(item)
      const localImageGroupQuantity = item.localImageMatch
        ? localImageGroupQuantityById.get(item.localImageMatch.groupId) ?? quantity
        : quantity
      const allCandidates = filterStepBomCandidatesByLocalImageGroup(
        getStepBomImageMatchCandidates(
          item,
          feature,
          inventoryFeatures,
        ),
        item,
        localImageGroupQuantity,
      )

      return {
        allCandidates,
        callout,
        candidates: allCandidates.filter((candidate) =>
          isAcceptedStepBomPartImageMatch(candidate.score) &&
          isStepBomCandidateSupportedByRepeatedLocalEvidence(item, candidate.score)
        ),
        item,
        quantity,
      }
    })
  )
  const matchByItemId = new Map<string, DetectedStepCalloutBomImageMatch>()
  publishStepBomDebug({
    inventoryFeatureCount: inventoryFeatures.length,
    itemCandidateSummaries: itemCandidates.map((candidate) => ({
      acceptedCandidateCount: candidate.candidates.length,
      rawBest: candidate.allCandidates[0]
        ? {
            colorId: candidate.allCandidates[0].row.colorId,
            colorName: candidate.allCandidates[0].row.colorName,
            manualFeatureReliability: candidate.allCandidates[0].row.manualFeatureReliability,
            partNumber: candidate.allCandidates[0].row.partNumber,
            rowId: candidate.allCandidates[0].row.rowId,
            score: candidate.allCandidates[0].score,
          }
        : null,
      topCandidates: candidate.allCandidates.slice(0, 16).map((topCandidate) => ({
        colorId: topCandidate.row.colorId,
        colorName: topCandidate.row.colorName,
        manualFeatureReliability: topCandidate.row.manualFeatureReliability,
        partNumber: topCandidate.row.partNumber,
        quantity: topCandidate.row.quantity,
        rowId: topCandidate.row.rowId,
        score: topCandidate.score,
      })),
      best: candidate.candidates[0]?.score ?? null,
      itemId: candidate.item.id,
      localImageGroupId: candidate.item.localImageMatch?.groupId ?? null,
      localImageGroupItemCount: candidate.item.localImageMatch?.itemCount ?? 0,
      localImageGroupQuantity: candidate.item.localImageMatch
        ? localImageGroupQuantityById.get(candidate.item.localImageMatch.groupId) ?? candidate.quantity
        : candidate.quantity,
      quantity: candidate.quantity,
      stepIndex: candidate.callout.stepIndex,
    })),
    itemCount: itemCandidates.length,
  })

  for (const itemCandidate of [...itemCandidates].sort((left, right) =>
    (right.candidates[0]?.score.score ?? 0) - (left.candidates[0]?.score.score ?? 0) ||
    left.callout.stepIndex - right.callout.stepIndex ||
    left.item.indexOnCallout - right.item.indexOnCallout
  )) {
    const selectedCandidate = getAssignableStepBomImageMatchCandidate(
      itemCandidate.candidates,
      rowRemainingQuantity,
      itemCandidate.quantity,
    )
    if (!selectedCandidate) {
      continue
    }

    const remainingQuantity = rowRemainingQuantity.get(selectedCandidate.row.rowId) ?? 0
    if (remainingQuantity >= itemCandidate.quantity) {
      rowRemainingQuantity.set(selectedCandidate.row.rowId, remainingQuantity - itemCandidate.quantity)
      matchByItemId.set(
        itemCandidate.item.id,
        createDetectedStepCalloutBomImageMatch(selectedCandidate.row, selectedCandidate.score),
      )
    }
  }

  return callouts.map((callout) => ({
    ...callout,
    partItems: callout.partItems.map((item) => ({
      ...item,
      bomImageMatch: matchByItemId.get(item.id) ?? null,
    })),
  }))
}

function getStepLocalImageGroupQuantityById(callouts: readonly DetectedStepCallout[]) {
  const quantityByGroupId = new Map<string, number>()

  for (const callout of callouts) {
    for (const item of callout.partItems) {
      const groupId = item.localImageMatch?.groupId
      if (!groupId) {
        continue
      }

      quantityByGroupId.set(groupId, (quantityByGroupId.get(groupId) ?? 0) + getStepItemMatchQuantity(item))
    }
  }

  return quantityByGroupId
}

function filterStepBomCandidatesByLocalImageGroup(
  candidates: readonly StepBomImageMatchCandidate[],
  _item: DetectedStepCalloutPartItem,
  _localImageGroupQuantity: number,
) {
  return [...candidates]
}

function completeRemainingStepBomCoverage(
  itemCandidates: readonly StepBomImageMatchItemCandidate[],
  rowRemainingQuantity: Map<string, number>,
  matchByItemId: Map<string, DetectedStepCalloutBomImageMatch>,
) {
  const remainingQuantity = [...rowRemainingQuantity.values()].reduce((sum, quantity) => sum + Math.max(0, quantity), 0)
  if (remainingQuantity <= 0) {
    return
  }

  const unmatchedItems = itemCandidates.filter((candidate) => !matchByItemId.has(candidate.item.id))
  const unmatchedQuantity = unmatchedItems.reduce((sum, candidate) => sum + candidate.quantity, 0)
  if (unmatchedQuantity < remainingQuantity) {
    return
  }

  const assignableItems = unmatchedItems
    .map((candidate) => ({
      candidate,
      options: getStepBomCoverageCompletionCandidates(candidate, rowRemainingQuantity),
    }))
    .filter((entry) => entry.options.length > 0)
    .sort((left, right) =>
      left.options.length - right.options.length ||
      right.candidate.quantity - left.candidate.quantity ||
      left.candidate.callout.stepIndex - right.candidate.callout.stepIndex ||
      left.candidate.item.indexOnCallout - right.candidate.item.indexOnCallout
    )
  const assignableQuantity = assignableItems.reduce((sum, entry) => sum + entry.candidate.quantity, 0)
  publishStepBomDebug({
    assignableItems: assignableItems.map((entry) => ({
      itemId: entry.candidate.item.id,
      options: entry.options.map((option) => ({
        colorName: option.row.colorName,
        partNumber: option.row.partNumber,
        quantity: option.row.quantity,
        remainingQuantity: rowRemainingQuantity.get(option.row.rowId) ?? 0,
        rowId: option.row.rowId,
        score: option.score,
      })),
      quantity: entry.candidate.quantity,
      stepIndex: entry.candidate.callout.stepIndex,
    })),
    assignableQuantity,
    kind: "coverage_completion",
    remainingQuantity,
    remainingRows: [...rowRemainingQuantity.entries()]
      .filter(([, quantity]) => quantity > 0)
      .map(([rowId, quantity]) => ({ quantity, rowId })),
    unmatchedQuantity,
  })
  if (assignableQuantity < remainingQuantity) {
    return
  }

  const assignment = findBestStepBomCoverageCompletion(assignableItems, rowRemainingQuantity)
  if (!assignment) {
    return
  }

  for (const { candidate, selected } of assignment.selected) {
    const remaining = rowRemainingQuantity.get(selected.row.rowId) ?? 0
    if (remaining < candidate.quantity) {
      return
    }

    rowRemainingQuantity.set(selected.row.rowId, remaining - candidate.quantity)
    matchByItemId.set(
      candidate.item.id,
      createDetectedStepCalloutBomImageMatch(selected.row, selected.score),
    )
  }
}

function getStepBomCoverageCompletionCandidates(
  itemCandidate: StepBomImageMatchItemCandidate,
  rowRemainingQuantity: ReadonlyMap<string, number>,
) {
  return itemCandidate.allCandidates
    .filter((candidate) =>
      (rowRemainingQuantity.get(candidate.row.rowId) ?? 0) >= itemCandidate.quantity &&
      isCoverageCompletionStepBomImageMatch(candidate.score)
    )
    .sort((left, right) =>
      getStepBomCoverageCompletionScore(right, itemCandidate.quantity, rowRemainingQuantity) -
        getStepBomCoverageCompletionScore(left, itemCandidate.quantity, rowRemainingQuantity) ||
      right.score.score - left.score.score ||
      left.row.rowId.localeCompare(right.row.rowId)
    )
    .slice(0, 8)
}

function findBestStepBomCoverageCompletion(
  assignableItems: readonly {
    candidate: StepBomImageMatchItemCandidate
    options: readonly StepBomImageMatchCandidate[]
  }[],
  initialRemainingQuantity: ReadonlyMap<string, number>,
) {
  type AssignmentResult = {
    score: number
    selected: Array<{
      candidate: StepBomImageMatchItemCandidate
      selected: StepBomImageMatchCandidate
    }>
  }

  const rowIds = [...initialRemainingQuantity.entries()]
    .filter(([, quantity]) => quantity > 0)
    .map(([rowId]) => rowId)
    .sort()
  const memo = new Map<string, AssignmentResult | null>()

  const search = (
    itemIndex: number,
    remainingByRowId: ReadonlyMap<string, number>,
  ): AssignmentResult | null => {
    const remainingTotal = rowIds.reduce((sum, rowId) => sum + Math.max(0, remainingByRowId.get(rowId) ?? 0), 0)
    if (remainingTotal === 0) {
      return {
        score: 0,
        selected: [],
      }
    }
    if (itemIndex >= assignableItems.length) {
      return null
    }

    const remainingItemQuantity = assignableItems
      .slice(itemIndex)
      .reduce((sum, entry) => sum + entry.candidate.quantity, 0)
    if (remainingItemQuantity < remainingTotal) {
      return null
    }

    const memoKey = `${itemIndex}|${rowIds.map((rowId) => `${rowId}:${remainingByRowId.get(rowId) ?? 0}`).join(",")}`
    if (memo.has(memoKey)) {
      return memo.get(memoKey) ?? null
    }

    const entry = assignableItems[itemIndex]
    if (!entry) {
      return null
    }

    let bestResult = search(itemIndex + 1, remainingByRowId)
    if (bestResult) {
      bestResult = {
        score: bestResult.score - getStepBomCoverageSkipPenalty(entry.candidate),
        selected: bestResult.selected,
      }
    }

    for (const option of entry.options) {
      const remaining = remainingByRowId.get(option.row.rowId) ?? 0
      if (remaining < entry.candidate.quantity) {
        continue
      }

      const nextRemaining = new Map(remainingByRowId)
      nextRemaining.set(option.row.rowId, remaining - entry.candidate.quantity)
      const nextResult = search(itemIndex + 1, nextRemaining)
      if (!nextResult) {
        continue
      }

      const score = nextResult.score +
        getStepBomCoverageCompletionScore(option, entry.candidate.quantity, remainingByRowId)
      if (!bestResult || score > bestResult.score) {
        bestResult = {
          score,
          selected: [
            {
              candidate: entry.candidate,
              selected: option,
            },
            ...nextResult.selected,
          ],
        }
      }
    }

    memo.set(memoKey, bestResult)
    return bestResult
  }

  return search(0, initialRemainingQuantity)
}

function getStepBomCoverageCompletionScore(
  candidate: StepBomImageMatchCandidate,
  itemQuantity: number,
  rowRemainingQuantity: ReadonlyMap<string, number>,
) {
  const remainingQuantity = rowRemainingQuantity.get(candidate.row.rowId) ?? 0
  const exactItemQuantityBonus = candidate.row.quantity === itemQuantity ? 0.1 : 0
  const exactRemainingQuantityBonus = remainingQuantity === itemQuantity ? 0.08 : 0

  return (
    (candidate.score.score * 1.4) +
    (candidate.score.visualScore * 0.35) +
    (candidate.score.shapeScore * 0.25) +
    (candidate.score.structureScore * 0.2) +
    (candidate.score.aspectScore * 0.08) +
    (candidate.score.colorCompatibilityScore * 0.12) +
    exactItemQuantityBonus +
    exactRemainingQuantityBonus
  )
}

function getStepBomCoverageSkipPenalty(candidate: StepBomImageMatchItemCandidate) {
  return 0.2 + candidate.quantity * 0.02
}

type StepBomExactCoverageRow = {
  remainingQuantity: number
  targetQuantity?: number
  row: StepCalloutInventoryMatchRow
}

type StepBomExactCoverageCandidate = {
  assignmentScore: number
  colorCompatibilityScore: number
  colorScore: number
  confidence: number
  row: StepCalloutInventoryMatchRow
  source: StepPartVisualScore["source"] | "coverage_fallback"
  visualScore: number
}

function completeExactStepBomCoverageFromInventoryRows(
  itemCandidates: readonly StepBomImageMatchItemCandidate[],
  inventoryRows: readonly StepCalloutInventoryMatchRow[],
  matchByItemId: Map<string, DetectedStepCalloutBomImageMatch>,
) {
  const remainingRows = getRemainingStepBomInventoryRows(itemCandidates, inventoryRows, matchByItemId)
  const remainingQuantity = remainingRows.reduce((sum, entry) => sum + entry.remainingQuantity, 0)
  const unmatchedItems = itemCandidates.filter((candidate) => !matchByItemId.has(candidate.item.id))
  const unmatchedQuantity = unmatchedItems.reduce((sum, candidate) => sum + candidate.quantity, 0)
  publishStepBomDebug({
    inventoryRowCount: inventoryRows.length,
    kind: "exact_coverage_probe",
    remainingQuantity,
    remainingRows: remainingRows.map((entry) => ({
      colorName: entry.row.colorName,
      hasPreview: Boolean(entry.row.previewImageUrl),
      partNumber: entry.row.partNumber,
      quantity: entry.remainingQuantity,
      rowId: entry.row.rowId,
    })),
    unmatchedItemCount: unmatchedItems.length,
    unmatchedQuantity,
  })
  if (remainingQuantity <= 0) {
    return
  }

  if (unmatchedQuantity !== remainingQuantity) {
    return
  }

  const assignableItems = unmatchedItems
    .map((candidate) => ({
      candidate,
      options: getStepBomExactCoverageCandidates(candidate, remainingRows),
    }))
    .filter((entry) => entry.options.length > 0)
    .sort((left, right) =>
      left.options.length - right.options.length ||
      right.candidate.quantity - left.candidate.quantity ||
      left.candidate.callout.stepIndex - right.candidate.callout.stepIndex ||
      left.candidate.item.indexOnCallout - right.candidate.item.indexOnCallout
    )
  const assignableQuantity = assignableItems.reduce((sum, entry) => sum + entry.candidate.quantity, 0)

  publishStepBomDebug({
    assignableItems: assignableItems.map((entry) => ({
      itemId: entry.candidate.item.id,
      options: entry.options.map((option) => ({
        assignmentScore: option.assignmentScore,
        colorCompatibilityScore: option.colorCompatibilityScore,
        colorName: option.row.colorName,
        partNumber: option.row.partNumber,
        quantity: option.row.quantity,
        rowId: option.row.rowId,
        source: option.source,
        visualScore: option.visualScore,
      })),
      quantity: entry.candidate.quantity,
      stepIndex: entry.candidate.callout.stepIndex,
    })),
    assignableQuantity,
    kind: "exact_coverage_completion",
    remainingQuantity,
    remainingRows: remainingRows.map((entry) => ({
      partNumber: entry.row.partNumber,
      quantity: entry.remainingQuantity,
      rowId: entry.row.rowId,
    })),
    unmatchedQuantity,
  })

  if (assignableQuantity < remainingQuantity) {
    return
  }

  const assignment = findBestStepBomExactCoverageCompletion(assignableItems, remainingRows)
  if (!assignment) {
    return
  }

  const remainingByRowId = new Map(remainingRows.map((entry) => [entry.row.rowId, entry.remainingQuantity] as const))
  for (const { candidate, selected } of assignment.selected) {
    const remaining = remainingByRowId.get(selected.row.rowId) ?? 0
    if (remaining < candidate.quantity) {
      return
    }

    remainingByRowId.set(selected.row.rowId, remaining - candidate.quantity)
    matchByItemId.set(
      candidate.item.id,
      createDetectedStepCalloutBomInventoryMatch(selected.row, selected),
    )
  }
}

function rebalanceExactStepBomCoverageForRemainingRows(
  itemCandidates: readonly StepBomImageMatchItemCandidate[],
  inventoryRows: readonly StepCalloutInventoryMatchRow[],
  matchByItemId: Map<string, DetectedStepCalloutBomImageMatch>,
) {
  const remainingRows = getRemainingStepBomInventoryRows(itemCandidates, inventoryRows, matchByItemId)
  const remainingQuantity = remainingRows.reduce((sum, entry) => sum + entry.remainingQuantity, 0)
  if (remainingQuantity <= 0) {
    return
  }

  const unmatchedItems = itemCandidates.filter((candidate) => !matchByItemId.has(candidate.item.id))
  const unmatchedQuantity = unmatchedItems.reduce((sum, candidate) => sum + candidate.quantity, 0)
  if (unmatchedQuantity !== remainingQuantity) {
    return
  }

  const remainingRowIds = new Set(remainingRows.map((entry) => entry.row.rowId))
  const affectedItems = itemCandidates.filter((candidate) => {
    const match = matchByItemId.get(candidate.item.id)

    return !match || remainingRowIds.has(match.rowId)
  })
  const affectedQuantity = affectedItems.reduce((sum, candidate) => sum + candidate.quantity, 0)
  const targetRows = remainingRows.map((entry): StepBomExactCoverageRow => ({
    ...entry,
    targetQuantity: entry.row.quantity,
  }))
  const targetQuantity = targetRows.reduce((sum, entry) => sum + getStepBomExactCoverageTargetQuantity(entry), 0)
  publishStepBomDebug({
    affectedItemCount: affectedItems.length,
    affectedQuantity,
    kind: "exact_coverage_rebalance_probe",
    remainingQuantity,
    targetQuantity,
    targetRows: targetRows.map((entry) => ({
      colorName: entry.row.colorName,
      partNumber: entry.row.partNumber,
      remainingQuantity: entry.remainingQuantity,
      rowId: entry.row.rowId,
      targetQuantity: getStepBomExactCoverageTargetQuantity(entry),
    })),
    unmatchedQuantity,
  })
  if (affectedQuantity !== targetQuantity) {
    return
  }

  const affectedOptionEntries = affectedItems
    .map((candidate) => ({
      candidate,
      options: getStepBomExactCoverageCandidates(candidate, targetRows),
    }))
  const assignableItems = affectedOptionEntries
    .filter((entry) => entry.options.length > 0)
    .sort((left, right) =>
      left.options.length - right.options.length ||
      right.candidate.quantity - left.candidate.quantity ||
      left.candidate.callout.stepIndex - right.candidate.callout.stepIndex ||
      left.candidate.item.indexOnCallout - right.candidate.item.indexOnCallout
    )
  const assignableQuantity = assignableItems.reduce((sum, entry) => sum + entry.candidate.quantity, 0)
  publishStepBomDebug({
    assignableItems: assignableItems.map((entry) => ({
      itemId: entry.candidate.item.id,
      options: entry.options.map((option) => ({
        assignmentScore: option.assignmentScore,
        colorCompatibilityScore: option.colorCompatibilityScore,
        colorName: option.row.colorName,
        partNumber: option.row.partNumber,
        quantity: option.row.quantity,
        rowId: option.row.rowId,
        source: option.source,
        visualScore: option.visualScore,
      })),
      quantity: entry.candidate.quantity,
      stepIndex: entry.candidate.callout.stepIndex,
    })),
    assignableQuantity,
    kind: "exact_coverage_rebalance",
    targetQuantity,
    targetRows: targetRows.map((entry) => ({
      partNumber: entry.row.partNumber,
      remainingQuantity: entry.remainingQuantity,
      rowId: entry.row.rowId,
      targetQuantity: getStepBomExactCoverageTargetQuantity(entry),
    })),
    unassignableItems: affectedOptionEntries
      .filter((entry) => entry.options.length === 0)
      .map((entry) => ({
        itemId: entry.candidate.item.id,
        quantity: entry.candidate.quantity,
        stepIndex: entry.candidate.callout.stepIndex,
        topCandidates: entry.candidate.allCandidates.slice(0, 16).map((candidate) => ({
          colorName: candidate.row.colorName,
          partNumber: candidate.row.partNumber,
          quantity: candidate.row.quantity,
          rowId: candidate.row.rowId,
          score: candidate.score,
        })),
      })),
  })
  if (assignableQuantity < targetQuantity) {
    return
  }

  const assignment = findBestStepBomExactCoverageCompletion(assignableItems, targetRows)
  if (!assignment) {
    return
  }

  for (const candidate of affectedItems) {
    matchByItemId.delete(candidate.item.id)
  }
  for (const { candidate, selected } of assignment.selected) {
    matchByItemId.set(
      candidate.item.id,
      createDetectedStepCalloutBomInventoryMatch(selected.row, selected),
    )
  }
}

function getRemainingStepBomInventoryRows(
  itemCandidates: readonly StepBomImageMatchItemCandidate[],
  inventoryRows: readonly StepCalloutInventoryMatchRow[],
  matchByItemId: ReadonlyMap<string, DetectedStepCalloutBomImageMatch>,
) {
  const matchedQuantityByRowId = new Map<string, number>()
  for (const itemCandidate of itemCandidates) {
    const match = matchByItemId.get(itemCandidate.item.id)
    if (!match) {
      continue
    }

    matchedQuantityByRowId.set(match.rowId, (matchedQuantityByRowId.get(match.rowId) ?? 0) + itemCandidate.quantity)
  }

  return inventoryRows
    .map((row): StepBomExactCoverageRow | null => {
      const remainingQuantity = row.quantity - (matchedQuantityByRowId.get(row.rowId) ?? 0)
      return remainingQuantity > 0 ? { remainingQuantity, row } : null
    })
    .filter((entry): entry is StepBomExactCoverageRow => entry != null)
}

function getStepBomExactCoverageCandidates(
  itemCandidate: StepBomImageMatchItemCandidate,
  remainingRows: readonly StepBomExactCoverageRow[],
) {
  const candidates = remainingRows
    .filter((entry) => getStepBomExactCoverageTargetQuantity(entry) >= itemCandidate.quantity)
    .map((entry) => createStepBomExactCoverageCandidate(itemCandidate, entry.row))
    .filter((candidate): candidate is StepBomExactCoverageCandidate => candidate != null)
    .sort((left, right) =>
      right.assignmentScore - left.assignmentScore ||
      right.confidence - left.confidence ||
      left.row.rowId.localeCompare(right.row.rowId)
    )
  const bestScore = candidates[0]?.assignmentScore ?? 0

  return candidates
    .filter((candidate) =>
      candidate.assignmentScore >= bestScore - 0.4 ||
      (
        candidate.visualScore >= 0.74 &&
        candidate.colorCompatibilityScore >= 0.92
      )
    )
    .slice(0, 16)
}

function getStepBomExactCoverageTargetQuantity(entry: StepBomExactCoverageRow) {
  return entry.targetQuantity ?? entry.remainingQuantity
}

function createStepBomExactCoverageCandidate(
  itemCandidate: StepBomImageMatchItemCandidate,
  row: StepCalloutInventoryMatchRow,
): StepBomExactCoverageCandidate | null {
  const visualCandidate = itemCandidate.allCandidates.find((candidate) => candidate.row.rowId === row.rowId) ?? null
  const visualScore = visualCandidate?.score ?? null
  const colorCompatibilityScore = visualScore?.colorCompatibilityScore ??
    scoreStepBomColorCompatibility(itemCandidate.item.detectedColor, row.colorName ?? null)
  if (colorCompatibilityScore < 0.72) {
    return null
  }
  if (!visualScore || !isRelaxedExactCoverageStepBomImageMatch(visualScore)) {
    return null
  }

  const confidence = visualScore.score
  const assignmentScore = (
    (confidence * 1.2) +
    (visualScore.visualScore * 0.32) +
    (visualScore.shapeScore * 0.18) +
    (visualScore.structureScore * 0.14) +
    (colorCompatibilityScore * 0.18) +
    (row.quantity === itemCandidate.quantity ? 0.1 : 0)
  )

  return {
    assignmentScore,
    colorCompatibilityScore,
    colorScore: visualScore.colorScore,
    confidence,
    row,
    source: visualScore.source,
    visualScore: visualScore.visualScore,
  }
}

function isRelaxedExactCoverageStepBomImageMatch(score: StepBomPartImageScore) {
  const hasStrongColorShapeFallback = (
    score.colorCompatibilityScore >= 0.92 &&
    score.shapeScore >= 0.58 &&
    score.structureScore >= 0.58
  )

  return (
    score.colorCompatibilityScore >= 0.72 &&
    (score.colorScore >= 0.42 || score.colorCompatibilityScore >= 0.74) &&
    score.visualScore >= 0.42 &&
    score.shapeScore >= 0.42 &&
    score.structureScore >= 0.4 &&
    (score.aspectScore >= 0.18 || hasStrongColorShapeFallback) &&
    score.coverageScore >= 0.1 &&
    (
      score.edgeScore >= 0.04 ||
      score.shapeScore >= 0.5 ||
      score.structureScore >= 0.55 ||
      score.embeddingScore >= 0.62
    )
  )
}

function findBestStepBomExactCoverageCompletion(
  assignableItems: readonly {
    candidate: StepBomImageMatchItemCandidate
    options: readonly StepBomExactCoverageCandidate[]
  }[],
  remainingRows: readonly StepBomExactCoverageRow[],
) {
  type AssignmentResult = {
    score: number
    selected: Array<{
      candidate: StepBomImageMatchItemCandidate
      selected: StepBomExactCoverageCandidate
    }>
  }

  const initialRemaining = new Map(remainingRows.map((entry) => [
    entry.row.rowId,
    getStepBomExactCoverageTargetQuantity(entry),
  ] as const))
  const components = getStepBomExactCoverageAssignmentComponents(assignableItems, initialRemaining)
  if (!components) {
    return null
  }

  const selected: AssignmentResult["selected"] = []
  let score = 0
  for (const component of components) {
    const componentRemaining = new Map(component.rowIds.map((rowId) => [rowId, initialRemaining.get(rowId) ?? 0] as const))
    const itemQuantity = component.items.reduce((sum, entry) => sum + entry.candidate.quantity, 0)
    const rowQuantity = component.rowIds.reduce((sum, rowId) => sum + Math.max(0, initialRemaining.get(rowId) ?? 0), 0)
    if (itemQuantity !== rowQuantity) {
      return null
    }

    const result = findBestStepBomExactCoverageComponentCompletion(
      component.items,
      component.rowIds,
      componentRemaining,
    )
    if (!result) {
      return null
    }

    selected.push(...result.selected)
    score += result.score
  }

  return { score, selected }
}

function getStepBomExactCoverageAssignmentComponents(
  assignableItems: readonly {
    candidate: StepBomImageMatchItemCandidate
    options: readonly StepBomExactCoverageCandidate[]
  }[],
  initialRemaining: ReadonlyMap<string, number>,
) {
  const targetRowIds = [...initialRemaining.entries()]
    .filter(([, quantity]) => quantity > 0)
    .map(([rowId]) => rowId)
  const rowToItemIndexes = new Map<string, number[]>()
  for (const [itemIndex, entry] of assignableItems.entries()) {
    for (const option of entry.options) {
      if ((initialRemaining.get(option.row.rowId) ?? 0) <= 0) {
        continue
      }

      const itemIndexes = rowToItemIndexes.get(option.row.rowId) ?? []
      itemIndexes.push(itemIndex)
      rowToItemIndexes.set(option.row.rowId, itemIndexes)
    }
  }
  if (targetRowIds.some((rowId) => !rowToItemIndexes.has(rowId))) {
    return null
  }

  const components: Array<{
    items: typeof assignableItems
    rowIds: string[]
  }> = []
  const visitedItems = new Set<number>()
  const visitedRows = new Set<string>()

  for (const itemIndex of assignableItems.keys()) {
    if (visitedItems.has(itemIndex)) {
      continue
    }

    const componentItemIndexes = new Set<number>()
    const componentRowIds = new Set<string>()
    const itemQueue = [itemIndex]
    const rowQueue: string[] = []

    while (itemQueue.length > 0 || rowQueue.length > 0) {
      const nextItemIndex = itemQueue.pop()
      if (nextItemIndex != null && !visitedItems.has(nextItemIndex)) {
        visitedItems.add(nextItemIndex)
        componentItemIndexes.add(nextItemIndex)
        for (const option of assignableItems[nextItemIndex]?.options ?? []) {
          const rowId = option.row.rowId
          if ((initialRemaining.get(rowId) ?? 0) > 0 && !visitedRows.has(rowId)) {
            rowQueue.push(rowId)
          }
        }
      }

      const nextRowId = rowQueue.pop()
      if (nextRowId && !visitedRows.has(nextRowId)) {
        visitedRows.add(nextRowId)
        componentRowIds.add(nextRowId)
        for (const linkedItemIndex of rowToItemIndexes.get(nextRowId) ?? []) {
          if (!visitedItems.has(linkedItemIndex)) {
            itemQueue.push(linkedItemIndex)
          }
        }
      }
    }

    components.push({
      items: [...componentItemIndexes]
        .sort((left, right) => left - right)
        .map((index) => assignableItems[index])
        .filter((entry): entry is (typeof assignableItems)[number] => Boolean(entry)),
      rowIds: [...componentRowIds].sort(),
    })
  }

  if (targetRowIds.some((rowId) => !visitedRows.has(rowId))) {
    return null
  }

  return components
}

function findBestStepBomExactCoverageComponentCompletion(
  assignableItems: readonly {
    candidate: StepBomImageMatchItemCandidate
    options: readonly StepBomExactCoverageCandidate[]
  }[],
  rowIds: readonly string[],
  initialRemaining: ReadonlyMap<string, number>,
) {
  type AssignmentResult = {
    score: number
    selected: Array<{
      candidate: StepBomImageMatchItemCandidate
      selected: StepBomExactCoverageCandidate
    }>
  }

  const memo = new Map<string, AssignmentResult | null>()
  const maxMemoStates = 120_000

  const search = (
    itemIndex: number,
    remainingByRowId: ReadonlyMap<string, number>,
  ): AssignmentResult | null => {
    if (memo.size > maxMemoStates) {
      return null
    }

    const remainingTotal = rowIds.reduce((sum, rowId) => sum + Math.max(0, remainingByRowId.get(rowId) ?? 0), 0)
    if (remainingTotal === 0) {
      return {
        score: 0,
        selected: [],
      }
    }
    if (itemIndex >= assignableItems.length) {
      return null
    }

    const remainingItemQuantity = assignableItems
      .slice(itemIndex)
      .reduce((sum, entry) => sum + entry.candidate.quantity, 0)
    if (remainingItemQuantity < remainingTotal) {
      return null
    }

    const memoKey = `${itemIndex}|${rowIds.map((rowId) => `${rowId}:${remainingByRowId.get(rowId) ?? 0}`).join(",")}`
    if (memo.has(memoKey)) {
      return memo.get(memoKey) ?? null
    }

    const entry = assignableItems[itemIndex]
    if (!entry) {
      return null
    }

    let bestResult: AssignmentResult | null = null
    for (const option of entry.options) {
      const remaining = remainingByRowId.get(option.row.rowId) ?? 0
      if (remaining < entry.candidate.quantity) {
        continue
      }

      const nextRemaining = new Map(remainingByRowId)
      nextRemaining.set(option.row.rowId, remaining - entry.candidate.quantity)
      const nextResult = search(itemIndex + 1, nextRemaining)
      if (!nextResult) {
        continue
      }

      const score = nextResult.score + option.assignmentScore
      if (!bestResult || score > bestResult.score) {
        bestResult = {
          score,
          selected: [
            {
              candidate: entry.candidate,
              selected: option,
            },
            ...nextResult.selected,
          ],
        }
      }
    }

    memo.set(memoKey, bestResult)
    return bestResult
  }

  return search(0, initialRemaining)
}

function createDetectedStepCalloutBomInventoryMatch(
  row: StepCalloutInventoryMatchRow,
  score: StepBomExactCoverageCandidate,
): DetectedStepCalloutBomImageMatch {
  return {
    cataloguePartNumber: row.cataloguePartNumber ?? null,
    colorId: row.colorId ?? null,
    colorName: row.colorName ?? null,
    colorScore: score.colorScore,
    confidence: score.confidence,
    fallbackPreviewImageUrl: row.fallbackPreviewImageUrl ?? null,
    partName: row.partName ?? null,
    partNumber: row.partNumber,
    previewImageUrl: row.previewImageUrl ?? null,
    quantity: row.quantity,
    rowId: row.rowId,
    sourcePage: row.sourcePage,
    visualScore: score.visualScore,
  }
}

function getAssignableStepBomImageMatchCandidate(
  candidates: readonly StepBomImageMatchCandidate[],
  rowRemainingQuantity: ReadonlyMap<string, number>,
  quantity: number,
) {
  const availableCandidates = candidates.filter((candidate) =>
    (rowRemainingQuantity.get(candidate.row.rowId) ?? 0) >= quantity
  )

  for (const [candidateIndex, candidate] of availableCandidates.entries()) {
    const secondCandidate = availableCandidates[candidateIndex + 1] ?? null
    if (
      isDistinctBestStepBomImageMatch(candidate.score, secondCandidate?.score ?? null) ||
      isStrongStepBomImageMatch(candidate.score, secondCandidate?.score ?? null) ||
      isSupportedStepBomImageMatch(candidate.score, secondCandidate?.score ?? null)
    ) {
      return candidate
    }
  }

  return null
}

function publishStepBomDebug(payload: unknown) {
  const debugTarget = globalThis as typeof globalThis & {
    __bagItStepBomDebug?: unknown[]
  }
  if (Array.isArray(debugTarget.__bagItStepBomDebug)) {
    debugTarget.__bagItStepBomDebug.push(payload)
  }
}

async function createStepCalloutInventoryFeatureEntries(
  document: PdfReadableDocument,
  inventoryRows: readonly StepCalloutInventoryMatchRow[],
  signal?: AbortSignal,
) {
  const rowsByPage = new Map<number, StepCalloutInventoryMatchRow[]>()
  const catalogueOnlyRows: StepCalloutInventoryMatchRow[] = []
  const previewFeatureByUrl = new Map<string, Promise<StepPartImageFeature | null>>()

  for (const row of inventoryRows) {
    if (row.quantity <= 0) {
      continue
    }

    if (!row.partThumbnailRegion || !row.sourceImage) {
      if (row.previewImageUrl) {
        catalogueOnlyRows.push(row)
      }
      continue
    }

    const pageRows = rowsByPage.get(row.sourcePage) ?? []
    pageRows.push(row)
    rowsByPage.set(row.sourcePage, pageRows)
  }

  const entries: StepCalloutInventoryFeatureEntry[] = []
  for (const [pageNumber, pageRows] of [...rowsByPage.entries()].sort((left, right) => left[0] - right[0])) {
    assertStepCalloutDetectionCanContinue(signal)
    const sourceImage = pageRows.find((row) => row.sourceImage)?.sourceImage
    if (!sourceImage || sourceImage.width <= 0 || sourceImage.height <= 0) {
      continue
    }

    const page = await document.getPage!(pageNumber)
    try {
      const renderedPage = await renderPdfPageForStepInventoryRows(page, sourceImage, signal)
      if (!renderedPage) {
        continue
      }

      for (const row of pageRows) {
        if (!row.partThumbnailRegion || !row.sourceImage) {
          continue
        }

        const thumbnailRegion = scaleOcrRegionToRenderedPage(
          row.partThumbnailRegion,
          row.sourceImage,
          renderedPage.imageData,
        )
        const textRegion = row.sourceRegion
          ? scaleOcrRegionToRenderedPage(row.sourceRegion, row.sourceImage, renderedPage.imageData)
          : null
        const featureRegion = getBomPartFeatureRegion(renderedPage.imageData, thumbnailRegion, textRegion)
        const manualFeature = createStepPartImageFeature(
          renderedPage.imageData,
          padRegion(featureRegion, renderedPage.imageData.width, renderedPage.imageData.height, 2),
        )
        const catalogueFeature = row.previewImageUrl
          ? await getCachedStepPartPreviewFeature(row.previewImageUrl, previewFeatureByUrl, signal)
          : null
        const fallbackCatalogueFeature = !catalogueFeature && row.fallbackPreviewImageUrl
          ? await getCachedStepPartPreviewFeature(row.fallbackPreviewImageUrl, previewFeatureByUrl, signal)
          : null
        const resolvedCatalogueFeature = catalogueFeature ?? fallbackCatalogueFeature
        const feature = manualFeature ?? resolvedCatalogueFeature
        if (!feature) {
          continue
        }

        entries.push({
          ...row,
          catalogueFeature: resolvedCatalogueFeature,
          feature,
          manualFeatureReliability: manualFeature
            ? getBomManualFeatureReliability(
                renderedPage.imageData,
                thumbnailRegion,
                textRegion,
                featureRegion,
              )
            : "low",
        })
      }
    } finally {
      page.cleanup?.()
    }
  }

  for (const row of catalogueOnlyRows) {
    assertStepCalloutDetectionCanContinue(signal)
    const catalogueFeature = row.previewImageUrl
      ? await getCachedStepPartPreviewFeature(row.previewImageUrl, previewFeatureByUrl, signal)
      : null
    const fallbackCatalogueFeature = !catalogueFeature && row.fallbackPreviewImageUrl
      ? await getCachedStepPartPreviewFeature(row.fallbackPreviewImageUrl, previewFeatureByUrl, signal)
      : null
    const resolvedCatalogueFeature = catalogueFeature ?? fallbackCatalogueFeature
    if (!resolvedCatalogueFeature) {
      continue
    }

    entries.push({
      ...row,
      catalogueFeature: resolvedCatalogueFeature,
      feature: resolvedCatalogueFeature,
      manualFeatureReliability: "low",
    })
  }

  return entries
}

function getCachedStepPartPreviewFeature(
  imageUrl: string,
  previewFeatureByUrl: Map<string, Promise<StepPartImageFeature | null>>,
  signal?: AbortSignal,
) {
  const cached = previewFeatureByUrl.get(imageUrl)
  if (cached) {
    return cached
  }

  const promise = createStepPartImageFeatureFromPreviewUrl(imageUrl, signal)
  previewFeatureByUrl.set(imageUrl, promise)

  return promise
}

async function createStepPartImageFeatureFromPreviewUrl(
  imageUrl: string,
  signal?: AbortSignal,
): Promise<StepPartImageFeature | null> {
  if (typeof globalThis.document === "undefined" || typeof Image === "undefined") {
    return null
  }

  const image = new Image()
  const imageSource = typeof window === "undefined"
    ? imageUrl
    : `/api/catalogue/part-preview-image?url=${encodeURIComponent(imageUrl)}`
  const loaded = await loadStepPartPreviewImage(image, imageSource, signal)
  if (!loaded || signal?.aborted) {
    return null
  }

  const naturalWidth = image.naturalWidth || image.width
  const naturalHeight = image.naturalHeight || image.height
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return null
  }

  const scale = Math.min(1, 240 / Math.max(naturalWidth, naturalHeight))
  const width = Math.max(1, Math.round(naturalWidth * scale))
  const height = Math.max(1, Math.round(naturalHeight * scale))
  const canvas = globalThis.document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) {
    return null
  }

  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  return createStepPartImageFeature(
    context.getImageData(0, 0, width, height),
    { height, width, x: 0, y: 0 },
  )
}

function loadStepPartPreviewImage(image: HTMLImageElement, url: string, signal?: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    let settled = false
    const complete = (loaded: boolean) => {
      if (settled) {
        return
      }

      settled = true
      globalThis.clearTimeout(timeoutId)
      signal?.removeEventListener("abort", abort)
      image.onload = null
      image.onerror = null
      resolve(loaded)
    }
    const abort = () => complete(false)
    const timeoutId = globalThis.setTimeout(() => complete(false), 8_000)

    if (signal?.aborted) {
      complete(false)
      return
    }

    signal?.addEventListener("abort", abort, { once: true })
    image.onload = () => complete(true)
    image.onerror = () => complete(false)
    image.src = url
  })
}

async function renderPdfPageForStepInventoryRows(
  page: PdfReadablePage,
  sourceImage: NonNullable<StepCalloutInventoryMatchRow["sourceImage"]>,
  signal?: AbortSignal,
) {
  assertStepCalloutDetectionCanContinue(signal)
  const viewport = page.getViewport({ scale: 1 })
  const scale = sourceImage.width / viewport.width
  const scaledViewport = page.getViewport({ scale })
  const width = Math.max(1, Math.round(sourceImage.width))
  const height = Math.max(1, Math.round(sourceImage.height))
  const canvas = globalThis.document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) {
    return null
  }

  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, width, height)

  const renderTask = page.render?.({
    canvas,
    canvasContext: context,
    viewport: scaledViewport,
  })
  if (!renderTask) {
    return null
  }

  const abortRender = () => renderTask.cancel?.()
  signal?.addEventListener("abort", abortRender, { once: true })
  try {
    await renderTask.promise
    assertStepCalloutDetectionCanContinue(signal)
  } finally {
    signal?.removeEventListener("abort", abortRender)
  }

  return {
    imageData: context.getImageData(0, 0, width, height),
  }
}

function scaleOcrRegionToRenderedPage(
  region: NonNullable<StepCalloutInventoryMatchRow["partThumbnailRegion"]>,
  sourceImage: NonNullable<StepCalloutInventoryMatchRow["sourceImage"]>,
  imageData: DetectionImageData,
): PixelRegion {
  const scaleX = imageData.width / Math.max(1, sourceImage.width)
  const scaleY = imageData.height / Math.max(1, sourceImage.height)

  return normalizeRegion({
    height: Math.round(region.height * scaleY),
    width: Math.round(region.width * scaleX),
    x: Math.round(region.x * scaleX),
    y: Math.round(region.y * scaleY),
  }, imageData.width, imageData.height)
}

function getBomPartFeatureRegion(
  imageData: DetectionImageData,
  thumbnailRegion: PixelRegion,
  textRegion: PixelRegion | null,
) {
  const partOnlyRegion = textRegion
    ? getBomPartTextAnchoredSearchRegion(textRegion, imageData)
    : thumbnailRegion
  const foregroundRegion = getBomPartForegroundRegion(imageData, partOnlyRegion, textRegion)

  return foregroundRegion ?? partOnlyRegion
}

function getBomManualFeatureReliability(
  imageData: DetectionImageData,
  thumbnailRegion: PixelRegion,
  textRegion: PixelRegion | null,
  featureRegion: PixelRegion,
): StepBomManualFeatureReliability {
  const textRegionWidth = textRegion?.width ?? 0
  const textRegionHeight = textRegion?.height ?? 0
  const hasBroadTextAnchor = textRegion
    ? textRegionWidth > Math.max(340, textRegionHeight * 3.4)
    : false
  const hasBroadThumbnail = thumbnailRegion.width > imageData.width * 0.18 ||
    thumbnailRegion.height > imageData.height * 0.32
  const hasFocusedFeature = (
    featureRegion.width <= Math.max(360, imageData.width * 0.16) &&
    featureRegion.height <= Math.max(280, imageData.height * 0.18) &&
    featureRegion.width * featureRegion.height <= thumbnailRegion.width * thumbnailRegion.height * 0.55
  )
  const featureTouchesThumbnailEdge = (
    featureRegion.x <= thumbnailRegion.x + 2 ||
    featureRegion.y <= thumbnailRegion.y + 2 ||
    featureRegion.x + featureRegion.width >= thumbnailRegion.x + thumbnailRegion.width - 2 ||
    featureRegion.y + featureRegion.height >= thumbnailRegion.y + thumbnailRegion.height - 2
  )

  return ((hasBroadTextAnchor || hasBroadThumbnail) && !hasFocusedFeature) || featureTouchesThumbnailEdge
    ? "low"
    : "high"
}

function getBomPartTextAnchoredSearchRegion(
  textRegion: PixelRegion,
  imageData: DetectionImageData,
) {
  const textAnchorX = getBomPartTextCenterAnchorX(textRegion)
  const width = clamp(
    Math.round(Math.max(240, Math.min(textRegion.width * 1.15, textRegion.height * 3.2))),
    180,
    Math.min(920, imageData.width),
  )
  const height = clamp(
    Math.round(Math.max(160, Math.min(textRegion.height * 1.75, width * 0.48))),
    120,
    Math.min(420, imageData.height),
  )
  const x = clamp(
    Math.round(textAnchorX - width / 2),
    0,
    Math.max(0, imageData.width - width),
  )
  const y = clamp(
    Math.round(textRegion.y - height - Math.max(2, textRegion.height * 0.06)),
    0,
    Math.max(0, imageData.height - height),
  )

  return normalizeRegion({
    height: Math.round(height),
    width: Math.round(width),
    x,
    y,
  }, imageData.width, imageData.height)
}

function getBomPartTextCenterAnchorX(textRegion: PixelRegion) {
  return textRegion.x + textRegion.width / 2
}

function getBomPartForegroundRegion(
  imageData: DetectionImageData,
  searchRegion: PixelRegion,
  textRegion: PixelRegion | null,
) {
  const background = sampleRegionBackground(imageData, searchRegion)
  const targetX = textRegion
    ? clamp(getBomPartTextCenterAnchorX(textRegion), searchRegion.x, searchRegion.x + searchRegion.width)
    : searchRegion.x + searchRegion.width / 2
  const components = collectDarkComponents(
    imageData,
    searchRegion,
    (_, x, y) => isLikelyBomPartFeaturePixel(imageData, x, y, background),
  )
      .filter((component) => isLikelyBomPartComponent(component, searchRegion))
      .map((component) => ({
        component,
        score: scoreBomPartComponent(component, searchRegion, targetX),
      }))
    .sort((left, right) =>
      right.score - left.score ||
      Math.abs(getRegionCenterX(left.component) - targetX) - Math.abs(getRegionCenterX(right.component) - targetX)
    )

  const primary = components[0]?.component
  if (!primary) {
    return null
  }

  const primaryCenterX = getRegionCenterX(primary)
  const primaryCenterY = getRegionCenterY(primary)
  const relatedComponents = components
    .map((entry) => entry.component)
    .filter((component) => {
      if (component === primary) {
        return true
      }

      return (
        Math.abs(getRegionCenterX(component) - primaryCenterX) <= Math.max(primary.width * 0.9, searchRegion.width * 0.28) &&
        Math.abs(getRegionCenterY(component) - primaryCenterY) <= Math.max(primary.height * 0.9, searchRegion.height * 0.32) &&
        component.count >= Math.max(8, primary.count * 0.08)
      )
    })
  const foregroundRegion = unionRegions(relatedComponents)
  if (!foregroundRegion) {
    return null
  }

  return normalizeRegion(foregroundRegion, imageData.width, imageData.height)
}

function isLikelyBomPartFeaturePixel(
  imageData: DetectionImageData,
  x: number,
  y: number,
  background: ColorSample,
) {
  const color = getPartColorPixel(imageData, x, y)
  if (!color) {
    return false
  }

  const brightness = (color.r + color.g + color.b) / 3
  return getColorDistance(color, background) >= 18 || brightness < 225
}

function isLikelyBomPartComponent(component: DarkComponent, searchRegion: PixelRegion) {
  const area = component.width * component.height
  const looksLikeTextGlyph = (
    component.height <= Math.max(18, searchRegion.height * 0.16) &&
    component.width <= Math.max(24, searchRegion.width * 0.18) &&
    area <= searchRegion.width * searchRegion.height * 0.025
  )

  return (
    component.count >= 8 &&
    component.width >= 3 &&
    component.height >= 3 &&
    area >= Math.max(10, searchRegion.width * searchRegion.height * 0.004) &&
    !looksLikeTextGlyph
  )
}

function scoreBomPartComponent(component: DarkComponent, searchRegion: PixelRegion, targetX: number) {
  const centerDistance = Math.abs(getRegionCenterX(component) - targetX) / Math.max(1, searchRegion.width / 2)
  const proximityScore = clamp(1 - centerDistance, 0, 1)
  const areaScore = clamp(Math.sqrt(component.count) / Math.max(4, Math.sqrt(searchRegion.width * searchRegion.height) * 0.35), 0, 1)
  const widthScore = clamp(component.width / Math.max(1, searchRegion.width * 0.55), 0, 1)
  const heightScore = clamp(component.height / Math.max(1, searchRegion.height * 0.55), 0, 1)
  const textLikePenalty = component.height <= 6 && component.width <= searchRegion.width * 0.35 ? 0.3 : 0

  return (proximityScore * 1.1) + (areaScore * 1.4) + (widthScore * 0.45) + (heightScore * 0.45) - textLikePenalty
}

type StepBomImageMatchCandidate = {
  row: StepCalloutInventoryFeatureEntry
  score: StepBomPartImageScore
}

type StepBomImageMatchItemCandidate = {
  allCandidates: StepBomImageMatchCandidate[]
  callout: DetectedStepCallout
  candidates: StepBomImageMatchCandidate[]
  item: DetectedStepCalloutPartItem
  quantity: number
}

function getStepBomImageMatchCandidates(
  item: DetectedStepCalloutPartItem,
  feature: StepPartImageFeature | null,
  inventoryFeatures: readonly StepCalloutInventoryFeatureEntry[],
): StepBomImageMatchCandidate[] {
  if (!feature) {
    return []
  }

  return inventoryFeatures
    .map((row) => ({
      row,
      score: scoreStepBomPartImageMatch(feature, row, item.detectedColor),
    }))
    .sort((left, right) =>
      right.score.score - left.score.score ||
      right.score.visualScore - left.score.visualScore ||
      left.row.sourcePage - right.row.sourcePage ||
      left.row.rowId.localeCompare(right.row.rowId)
    )
}

function scoreStepBomPartImageMatch(
  stepFeature: StepPartImageFeature,
  row: StepCalloutInventoryFeatureEntry,
  stepColor: DetectedColorEstimate,
): StepBomPartImageScore {
  const manualVisualScore = scoreStepPartVisualSimilarity(stepFeature, row.feature, "manual_thumbnail")
  const catalogueVisualScore = row.catalogueFeature
    ? scoreStepPartVisualSimilarity(stepFeature, row.catalogueFeature, "catalogue_preview")
    : null
  const rowSurfaceSamples = [
    row.feature.surfaceRgb,
    ...(row.catalogueFeature ? [row.catalogueFeature.surfaceRgb] : []),
  ]
  const manualScore = createStepBomPartImageScoreForVisual({
    row,
    rowSurfaceSamples,
    stepColor,
    stepFeature,
    visualScore: manualVisualScore,
  })
  const catalogueScore = catalogueVisualScore
    ? createStepBomPartImageScoreForVisual({
        row,
        rowSurfaceSamples,
        stepColor,
        stepFeature,
        visualScore: catalogueVisualScore,
      })
    : null

  return selectStepBomPartImageScore(manualScore, catalogueScore, row.manualFeatureReliability)
}

function createStepBomPartImageScoreForVisual({
  row,
  rowSurfaceSamples,
  stepColor,
  stepFeature,
  visualScore,
}: {
  row: StepCalloutInventoryFeatureEntry
  rowSurfaceSamples: readonly ColorSample[]
  stepColor: DetectedColorEstimate
  stepFeature: StepPartImageFeature
  visualScore: StepPartVisualScore
}): StepBomPartImageScore {
  const surfaceColorScore = Math.max(
    ...rowSurfaceSamples.map((surfaceRgb) => scoreColorDistance(stepFeature.surfaceRgb, surfaceRgb, 150)),
  )
  const detectedColorScore = Math.max(
    ...rowSurfaceSamples.map((surfaceRgb) => scoreColorDistance(stepColor.rgb, surfaceRgb, 170)),
  )
  const rowRgbColorScore = row.colorRgb
    ? scoreColorDistance(stepFeature.surfaceRgb, parseHexColorSample(row.colorRgb), 145)
    : 0
  const rowColorScore = scoreStepColorNameMatch(stepColor.name, row.colorName ?? null)
  const colorCompatibilityScore = scoreStepBomColorCompatibility(stepColor, row.colorName ?? null)
  const colorScore = Math.max(
    surfaceColorScore * 0.94,
    detectedColorScore * 0.9,
    rowRgbColorScore,
    rowColorScore,
  )
  const visualCap = getStepPartVisualMismatchConfidenceCap(visualScore)
  const colorCap = Math.min(
    colorScore >= 0.78 ? 1 : Math.max(0.45, colorScore),
    getStepBomColorCompatibilityConfidenceCap(colorCompatibilityScore),
  )
  const score = clamp(
    (visualScore.visualScore * 0.40) +
    (visualScore.shapeScore * 0.18) +
    (visualScore.edgeScore * 0.16) +
    (visualScore.structureScore * 0.08) +
    (visualScore.detailScore * 0.08) +
    (visualScore.embeddingScore * 0.03) +
    (visualScore.aspectScore * 0.03) +
    (colorScore * 0.08),
    0,
    Math.min(
      visualCap,
      colorCap,
      getStepBomManualReliabilityConfidenceCap(row, visualScore),
    ),
  )

  return {
    ...visualScore,
    colorCompatibilityScore,
    colorScore,
    score,
  }
}

function selectStepBomPartImageScore(
  manualScore: StepBomPartImageScore,
  _catalogueScore: StepBomPartImageScore | null,
  _manualFeatureReliability: StepBomManualFeatureReliability,
) {
  return manualScore
}

function getStepBomManualReliabilityConfidenceCap(
  row: StepCalloutInventoryFeatureEntry,
  visualScore: StepPartVisualScore,
) {
  if (row.manualFeatureReliability === "low" && visualScore.source === "manual_thumbnail") {
    return 0.62
  }

  return 1
}

function isAcceptedStepBomPartImageMatch(score: StepBomPartImageScore) {
  return (
    score.score >= stepBomImageMatchThreshold &&
    score.visualScore >= 0.62 &&
    score.shapeScore >= 0.66 &&
    score.edgeScore >= 0.22 &&
    score.structureScore >= 0.6 &&
    score.detailScore >= 0.52 &&
    score.aspectScore >= 0.5 &&
    score.coverageScore >= 0.35 &&
    score.colorCompatibilityScore >= 0.72 &&
    score.colorScore >= 0.62 &&
    countStrongStepBomImageSignals(score) >= 1
  )
}

function countStrongStepBomImageSignals(score: StepBomPartImageScore) {
  return [
    score.shapeScore >= 0.78,
    score.detailScore >= 0.82,
    score.edgeScore >= 0.72,
    score.structureScore >= 0.74,
    score.embeddingScore >= 0.82,
  ].filter(Boolean).length
}

function isCoverageCompletionStepBomImageMatch(score: StepBomPartImageScore) {
  return (
    isAcceptedStepBomPartImageMatch(score) &&
    score.score >= 0.68 &&
    score.visualScore >= 0.64 &&
    score.shapeScore >= 0.7 &&
    (score.edgeScore >= 0.48 || countStrongStepBomImageSignals(score) >= 2)
  )
}

function isStepBomCandidateSupportedByRepeatedLocalEvidence(
  item: DetectedStepCalloutPartItem,
  score: StepBomPartImageScore,
) {
  return (
    (item.localImageMatch?.itemCount ?? 0) >= 2 &&
    score.score >= stepBomImageMatchThreshold &&
    score.visualScore >= 0.8 &&
    score.shapeScore >= 0.88 &&
    score.structureScore >= 0.8 &&
    score.detailScore >= 0.72
  )
}

function isDistinctBestStepBomImageMatch(
  bestScore: StepBomPartImageScore,
  secondScore: StepBomPartImageScore | null,
) {
  const hasHighPrecisionVisualProfile = (
    bestScore.score >= 0.84 &&
    bestScore.visualScore >= 0.78 &&
    bestScore.shapeScore >= 0.86 &&
    bestScore.edgeScore >= 0.58 &&
    bestScore.structureScore >= 0.78 &&
    bestScore.detailScore >= 0.7 &&
    bestScore.aspectScore >= 0.72 &&
    bestScore.coverageScore >= 0.72
  )
  if (!hasHighPrecisionVisualProfile) {
    return false
  }

  if (!secondScore) {
    return true
  }

  return (
    bestScore.score >= secondScore.score + Math.max(stepBomImageBestMatchTolerance, 0.1) &&
    bestScore.visualScore >= secondScore.visualScore + 0.06
  )
}

function isStrongStepBomImageMatch(
  bestScore: StepBomPartImageScore,
  secondScore: StepBomPartImageScore | null,
) {
  if (bestScore.colorScore < 0.78) {
    return false
  }

  const hasStrongVisualProfile = (
    bestScore.visualScore >= 0.78 &&
    bestScore.shapeScore >= 0.86 &&
    bestScore.structureScore >= 0.78 &&
    bestScore.detailScore >= 0.7 &&
    bestScore.aspectScore >= 0.72 &&
    bestScore.coverageScore >= 0.72
  )
  if (!hasStrongVisualProfile) {
    return false
  }

  return (
    bestScore.score >= 0.9 &&
    bestScore.score >= (secondScore?.score ?? 0) + 0.08 &&
    bestScore.visualScore >= (secondScore?.visualScore ?? 0) + 0.04
  )
}

function isSupportedStepBomImageMatch(
  bestScore: StepBomPartImageScore,
  secondScore: StepBomPartImageScore | null,
) {
  if (
    bestScore.score >= 0.86 &&
    bestScore.visualScore >= 0.8 &&
    bestScore.shapeScore >= 0.88 &&
    bestScore.structureScore >= 0.8 &&
    bestScore.detailScore >= 0.72 &&
    bestScore.edgeScore >= 0.62 &&
    bestScore.score >= (secondScore?.score ?? 0) + 0.08 &&
    bestScore.visualScore >= (secondScore?.visualScore ?? 0) + 0.04
  ) {
    return true
  }

  if (
    bestScore.colorScore >= 0.95 &&
    bestScore.score >= 0.88 &&
    bestScore.visualScore >= 0.82 &&
    bestScore.shapeScore >= 0.9 &&
    bestScore.structureScore >= 0.82 &&
    bestScore.detailScore >= 0.72 &&
    bestScore.edgeScore >= 0.58 &&
    bestScore.score >= (secondScore?.score ?? 0) + 0.1 &&
    bestScore.visualScore >= (secondScore?.visualScore ?? 0) + 0.05
  ) {
    return true
  }

  return (
    bestScore.score >= 0.9 &&
    bestScore.visualScore >= 0.86 &&
    bestScore.shapeScore >= 0.92 &&
    bestScore.structureScore >= 0.86 &&
    bestScore.detailScore >= 0.76 &&
    bestScore.edgeScore >= 0.72 &&
    bestScore.score >= (secondScore?.score ?? 0) + 0.08
  )
}

function parseHexColorSample(hex: string): ColorSample {
  const normalized = hex.trim().replace(/^#/, "")
  const match = /^([0-9a-f]{6})$/i.exec(normalized)
  if (!match) {
    return { b: 0, g: 0, r: 0 }
  }

  const value = Number.parseInt(match[1] ?? "0", 16)
  return {
    b: value & 0xff,
    g: (value >> 8) & 0xff,
    r: (value >> 16) & 0xff,
  }
}

function createDetectedStepCalloutBomImageMatch(
  row: StepCalloutInventoryFeatureEntry,
  score: StepBomPartImageScore,
): DetectedStepCalloutBomImageMatch {
  return {
    cataloguePartNumber: row.cataloguePartNumber ?? null,
    colorId: row.colorId ?? null,
    colorName: row.colorName ?? null,
    colorScore: score.colorScore,
    confidence: score.score,
    fallbackPreviewImageUrl: row.fallbackPreviewImageUrl ?? null,
    partName: row.partName ?? null,
    partNumber: row.partNumber,
    previewImageUrl: row.previewImageUrl ?? null,
    quantity: row.quantity,
    rowId: row.rowId,
    sourcePage: row.sourcePage,
    visualScore: score.visualScore,
  }
}

function getStepItemMatchQuantity(item: DetectedStepCalloutPartItem) {
  const quantity = item.quantity.value

  return quantity != null && Number.isFinite(quantity) && quantity > 0 ? quantity : 1
}

type StepWindowLocalImageItem = {
  feature: StepPartImageFeature | null
  item: DetectedStepCalloutPartItem
  stepIndex: number
}

type StepLocalImagePairMatch = {
  leftIndex: number
  rightIndex: number
  score: number
}

type StepLocalImagePairEvaluation = {
  leftIndex: number
  rejectionReason: string | null
  rightIndex: number
  score: StepLocalPartImageScore
}

function evaluateStepLocalImagePairMatches(
  windowItems: readonly StepWindowLocalImageItem[],
  stepGroupRange: { end: number; start: number },
): {
  acceptedMatches: StepLocalImagePairMatch[]
  rejectedMatchesByItemId: Map<string, DetectedStepCalloutLocalImageRejectedMatch[]>
} {
  const evaluations: StepLocalImagePairEvaluation[] = []
  const bestScoreByItemIndex = new Map<number, number>()

  for (let leftIndex = 0; leftIndex < windowItems.length; leftIndex += 1) {
    const left = windowItems[leftIndex]
    if (!left?.feature) {
      continue
    }

    for (let rightIndex = leftIndex + 1; rightIndex < windowItems.length; rightIndex += 1) {
      const right = windowItems[rightIndex]
      if (!right?.feature || left.stepIndex === right.stepIndex) {
        continue
      }
      if (!canCompareStepLocalImagesByDetectedColor(left.item.detectedColor, right.item.detectedColor)) {
        continue
      }

      const score = scoreStepLocalPartImageMatch(
        left.feature,
        right.feature,
        left.item.detectedColor,
        right.item.detectedColor,
      )
      const rejectionReason = isExactStepLocalPartImageMatch(score, left.item.detectedColor, right.item.detectedColor)
        ? null
        : getStepLocalImageRejectionReason(score, left.item.detectedColor, right.item.detectedColor)

      evaluations.push({
        leftIndex,
        rejectionReason,
        rightIndex,
        score,
      })
      if (!rejectionReason) {
        bestScoreByItemIndex.set(leftIndex, Math.max(bestScoreByItemIndex.get(leftIndex) ?? 0, score.score))
        bestScoreByItemIndex.set(rightIndex, Math.max(bestScoreByItemIndex.get(rightIndex) ?? 0, score.score))
      }
    }
  }

  const acceptedMatches = evaluations
    .filter((match) =>
      !match.rejectionReason &&
      match.score.score >= (bestScoreByItemIndex.get(match.leftIndex) ?? 0) - stepLocalImageMutualBestTolerance &&
      match.score.score >= (bestScoreByItemIndex.get(match.rightIndex) ?? 0) - stepLocalImageMutualBestTolerance
    )
    .map((match) => ({
      leftIndex: match.leftIndex,
      rightIndex: match.rightIndex,
      score: match.score.score,
    }))
    .sort((left, right) => right.score - left.score || left.leftIndex - right.leftIndex)
  const acceptedPairKeys = new Set(acceptedMatches.map((match) => getStepLocalImagePairKey(match.leftIndex, match.rightIndex)))
  const rejectedMatchesByItemId = new Map<string, DetectedStepCalloutLocalImageRejectedMatch[]>()

  for (const evaluation of evaluations) {
    if (acceptedPairKeys.has(getStepLocalImagePairKey(evaluation.leftIndex, evaluation.rightIndex))) {
      continue
    }

    const left = windowItems[evaluation.leftIndex]
    const right = windowItems[evaluation.rightIndex]
    if (!left || !right) {
      continue
    }

    const reason = evaluation.rejectionReason ?? "weaker than the mutual-best candidate"
    addStepLocalImageRejectedMatch(rejectedMatchesByItemId, left.item.id, right, evaluation.score, reason, stepGroupRange)
    addStepLocalImageRejectedMatch(rejectedMatchesByItemId, right.item.id, left, evaluation.score, reason, stepGroupRange)
  }

  return {
    acceptedMatches,
    rejectedMatchesByItemId,
  }
}

function getStepLocalImagePairKey(leftIndex: number, rightIndex: number) {
  return leftIndex < rightIndex ? `${leftIndex}:${rightIndex}` : `${rightIndex}:${leftIndex}`
}

function canCompareStepLocalImagesByDetectedColor(
  leftColor: DetectedColorEstimate,
  rightColor: DetectedColorEstimate,
) {
  const leftName = normalizeStepColorName(leftColor.name)
  const rightName = normalizeStepColorName(rightColor.name)

  return leftName === rightName && leftName !== "unknowncolor"
}

function addStepLocalImageRejectedMatch(
  rejectedMatchesByItemId: Map<string, DetectedStepCalloutLocalImageRejectedMatch[]>,
  itemId: string,
  candidate: StepWindowLocalImageItem,
  score: StepLocalPartImageScore,
  reason: string,
  stepGroupRange: { end: number; start: number },
) {
  const matches = rejectedMatchesByItemId.get(itemId) ?? []
  matches.push(createDetectedStepCalloutLocalImageRejectedMatch(candidate, score, reason, stepGroupRange))
  rejectedMatchesByItemId.set(itemId, matches)
}

function createDetectedStepCalloutLocalImageRejectedMatch(
  candidate: StepWindowLocalImageItem,
  score: StepLocalPartImageScore,
  reason: string,
  stepGroupRange: { end: number; start: number },
): DetectedStepCalloutLocalImageRejectedMatch {
  return {
    aspectScore: score.aspectScore,
    candidateColorHex: candidate.item.detectedColor.hex,
    candidateColorName: candidate.item.detectedColor.name,
    candidateCrop: candidate.item.partCrop,
    candidateItemId: candidate.item.id,
    candidateItemIndex: candidate.item.indexOnCallout,
    candidateStepIndex: candidate.stepIndex,
    colorScore: score.colorScore,
    compactnessScore: score.compactnessScore,
    coverageScore: score.coverageScore,
    detailScore: score.detailScore,
    edgeScore: score.edgeScore,
    embeddingScore: score.embeddingScore,
    reason,
    score: score.score,
    shapeScore: score.shapeScore,
    source: "local_callout",
    stepGroupRange,
    structureScore: score.structureScore,
    visualScore: score.visualScore,
  }
}

function trimStepLocalImageRejectedMatches(
  matches: readonly DetectedStepCalloutLocalImageRejectedMatch[],
) {
  return [...matches]
    .sort((left, right) =>
      right.score - left.score ||
      left.candidateStepIndex - right.candidateStepIndex ||
      left.candidateItemIndex - right.candidateItemIndex
    )
    .slice(0, 4)
}

function createStepLocalImageClusters(
  windowItems: readonly StepWindowLocalImageItem[],
  pairMatches: readonly StepLocalImagePairMatch[],
) {
  const parents = windowItems.map((_, index) => index)
  const stepSets = windowItems.map((item) => new Set([item.stepIndex]))
  const confidenceScores = windowItems.map((): number[] => [])

  const findRoot = (index: number): number => {
    const parent = parents[index] ?? index
    if (parent === index) {
      return index
    }

    const root = findRoot(parent)
    parents[index] = root
    return root
  }

  for (const pair of pairMatches) {
    let leftRoot = findRoot(pair.leftIndex)
    let rightRoot = findRoot(pair.rightIndex)
    if (leftRoot === rightRoot) {
      continue
    }

    const leftSteps = stepSets[leftRoot] ?? new Set<number>()
    const rightSteps = stepSets[rightRoot] ?? new Set<number>()
    if ([...leftSteps].some((stepIndex) => rightSteps.has(stepIndex))) {
      continue
    }

    if (rightRoot < leftRoot) {
      const swapRoot = leftRoot
      leftRoot = rightRoot
      rightRoot = swapRoot
    }

    parents[rightRoot] = leftRoot
    stepSets[leftRoot] = new Set([...leftSteps, ...rightSteps])
    confidenceScores[leftRoot] = [
      ...(confidenceScores[leftRoot] ?? []),
      ...(confidenceScores[rightRoot] ?? []),
      pair.score,
    ]
  }

  const clustersByRoot = new Map<number, {
    confidenceScores: number[]
    itemIndexes: number[]
  }>()
  for (let itemIndex = 0; itemIndex < windowItems.length; itemIndex += 1) {
    const root = findRoot(itemIndex)
    const cluster = clustersByRoot.get(root) ?? {
      confidenceScores: confidenceScores[root] ?? [],
      itemIndexes: [],
    }

    cluster.itemIndexes.push(itemIndex)
    clustersByRoot.set(root, cluster)
  }

  return [...clustersByRoot.values()].sort((left, right) =>
    (left.itemIndexes[0] ?? 0) - (right.itemIndexes[0] ?? 0)
  )
}

function scoreStepLocalPartImageMatch(
  left: StepPartImageFeature,
  right: StepPartImageFeature,
  leftColor: DetectedColorEstimate,
  rightColor: DetectedColorEstimate,
): StepLocalPartImageScore {
  const visualScore = scoreStepPartVisualSimilarity(left, right, "local_callout")
  const surfaceColorScore = scoreColorDistance(left.surfaceRgb, right.surfaceRgb, 120)
  const detectedColorScore = scoreColorDistance(leftColor.rgb, rightColor.rgb, 150)
  const colorNameScore = scoreStepColorNameMatch(leftColor.name, rightColor.name)
  const colorScore = Math.max(surfaceColorScore, detectedColorScore, colorNameScore)
  const visualCap = getStepPartVisualMismatchConfidenceCap(visualScore)
  const colorCap = getStepLocalImageColorMismatchConfidenceCap(leftColor, rightColor, colorScore)
  const score = clamp(
    (visualScore.visualScore * 0.68) +
    (visualScore.shapeScore * 0.12) +
    (visualScore.structureScore * 0.06) +
    (visualScore.detailScore * 0.06) +
    (visualScore.embeddingScore * 0.04) +
    (visualScore.aspectScore * 0.02) +
    (colorScore * 0.02),
    0,
    Math.min(visualCap, colorCap),
  )

  return {
    ...visualScore,
    colorScore,
    score,
  }
}

function isExactStepLocalPartImageMatch(
  score: StepLocalPartImageScore,
  leftColor: DetectedColorEstimate,
  rightColor: DetectedColorEstimate,
) {
  return (
    canCompareStepLocalImagesByDetectedColor(leftColor, rightColor) &&
    score.score >= stepLocalImageMatchThreshold &&
    score.visualScore >= 0.78 &&
    score.shapeScore >= 0.74 &&
    score.structureScore >= 0.74 &&
    score.detailScore >= 0.68 &&
    score.aspectScore >= 0.82 &&
    score.coverageScore >= 0.68 &&
    score.compactnessScore >= 0.58 &&
    score.colorScore >= 0.94 &&
    countStrongStepLocalImageSignals(score) >= 2
  )
}

function getStepLocalImageRejectionReason(
  score: StepLocalPartImageScore,
  leftColor: DetectedColorEstimate,
  rightColor: DetectedColorEstimate,
) {
  if (!canCompareStepLocalImagesByDetectedColor(leftColor, rightColor)) {
    return "detected color mismatch"
  }
  if (score.colorScore < 0.94) {
    return "color score below 94%"
  }
  if (score.score < stepLocalImageMatchThreshold) {
    return `overall score below ${Math.round(stepLocalImageMatchThreshold * 100)}%`
  }
  if (score.visualScore < 0.78) {
    return "visual score below 78%"
  }
  if (score.shapeScore < 0.74) {
    return "foreground shape below 74%"
  }
  if (score.structureScore < 0.74) {
    return "structure score below 74%"
  }
  if (score.detailScore < 0.68) {
    return "surface detail below 68%"
  }
  if (score.aspectScore < 0.82) {
    return "aspect ratio below 82%"
  }
  if (score.coverageScore < 0.68) {
    return "foreground coverage below 68%"
  }
  if (score.compactnessScore < 0.58) {
    return "foreground compactness below 58%"
  }
  if (countStrongStepLocalImageSignals(score) < 2) {
    return "fewer than 2 strong shape signals"
  }

  return "below strict local-image gates"
}

function countStrongStepLocalImageSignals(score: StepLocalPartImageScore) {
  return [
    score.shapeScore >= 0.74,
    score.detailScore >= 0.62,
    score.structureScore >= 0.74,
    score.embeddingScore >= 0.82,
  ].filter(Boolean).length
}

function getStepLocalImageColorMismatchConfidenceCap(
  leftColor: DetectedColorEstimate,
  rightColor: DetectedColorEstimate,
  colorScore: number,
) {
  const leftName = normalizeStepColorName(leftColor.name)
  const rightName = normalizeStepColorName(rightColor.name)
  const hasReliableDifferentNames = (
    leftName !== rightName &&
    leftName !== "unknowncolor" &&
    rightName !== "unknowncolor" &&
    Math.min(leftColor.confidence, rightColor.confidence) >= 0.5
  )

  if (colorScore >= 0.9 && !hasReliableDifferentNames) {
    return 1
  }
  if (colorScore >= 0.86 && leftName === rightName) {
    return 1
  }
  if (hasReliableDifferentNames) {
    return colorScore >= 0.86 ? 0.88 : 0.72
  }
  if (colorScore < 0.72) {
    return 0.8
  }

  return 0.92
}

function createStepPartImageFeature(
  imageData: DetectionImageData,
  partRegion: PixelRegion,
  excludedRegions: readonly PixelRegion[] = [],
): StepPartImageFeature | null {
  const boundedRegion = normalizeRegion(partRegion, imageData.width, imageData.height)
  const background = sampleRegionBackground(imageData, boundedRegion)
  let foregroundPixels = collectStepPartFeaturePixels(
    imageData,
    boundedRegion,
    (color) => getColorDistance(color, background) >= 26,
    excludedRegions,
  )

  if (foregroundPixels.length < 8) {
    foregroundPixels = collectStepPartFeaturePixels(
      imageData,
      boundedRegion,
      isLikelyNonBackgroundStepPartFeaturePixel,
      excludedRegions,
    )
  }

  if (foregroundPixels.length < 8) {
    return null
  }

  let minX = imageData.width
  let minY = imageData.height
  let maxX = 0
  let maxY = 0
  for (const pixel of foregroundPixels) {
    minX = Math.min(minX, pixel.x)
    minY = Math.min(minY, pixel.y)
    maxX = Math.max(maxX, pixel.x)
    maxY = Math.max(maxY, pixel.y)
  }
  const foregroundBounds = normalizeRegion({
    height: maxY - minY + 1,
    width: maxX - minX + 1,
    x: minX,
    y: minY,
  }, imageData.width, imageData.height)
  const surfaceRgb = getStepPartFeatureSurfaceRgb(foregroundPixels)
  const grid = createStepPartFeatureGrid(foregroundPixels, foregroundBounds)
  const detailGrid = createStepPartFeatureDetailGrid(foregroundPixels, foregroundBounds, surfaceRgb)
  const edgeGrid = createStepPartFeatureEdgeGrid(grid)
  const embedding = createStepPartFeatureEmbedding(foregroundPixels, foregroundBounds)
  const structureGrid = createStepPartFeatureStructureGrid(foregroundPixels, foregroundBounds)
  const compactness = getStepPartFeatureCompactness(grid)

  return {
    aspectRatio: foregroundBounds.width / Math.max(1, foregroundBounds.height),
    boundsHeight: foregroundBounds.height,
    boundsWidth: foregroundBounds.width,
    compactness,
    coverage: foregroundPixels.length / Math.max(1, foregroundBounds.width * foregroundBounds.height),
    detailGrid,
    edgeGrid,
    embedding,
    grid,
    pixelCount: foregroundPixels.length,
    structureGrid,
    surfaceRgb,
  }
}

function collectStepPartFeaturePixels(
  imageData: DetectionImageData,
  boundedRegion: PixelRegion,
  isForeground: (color: ColorSample) => boolean,
  excludedRegions: readonly PixelRegion[],
) {
  const foregroundPixels: StepPartFeaturePixel[] = []

  for (let y = boundedRegion.y; y < boundedRegion.y + boundedRegion.height; y += 1) {
    for (let x = boundedRegion.x; x < boundedRegion.x + boundedRegion.width; x += 1) {
      if (isPointInsideAnyRegion(x, y, excludedRegions)) {
        continue
      }

      const color = getPartColorPixel(imageData, x, y)
      if (color && isForeground(color)) {
        foregroundPixels.push({ color, x, y })
      }
    }
  }

  return foregroundPixels
}

function isLikelyNonBackgroundStepPartFeaturePixel(color: ColorSample) {
  return (color.r + color.g + color.b) / 3 < 245
}

function sampleRegionBackground(imageData: DetectionImageData, region: PixelRegion): ColorSample {
  const samples: ColorSample[] = []
  const pageBackgroundSamples = collectStepPartPageBackgroundSamples(imageData, region)
  if (pageBackgroundSamples.length >= 4) {
    return getMedianColorSample(pageBackgroundSamples)
  }

  const sampleWidth = Math.max(2, Math.round(region.width * 0.18))
  const sampleHeight = Math.max(2, Math.round(region.height * 0.18))
  const sampleRects = [
    { height: sampleHeight, width: sampleWidth, x: region.x, y: region.y },
    { height: sampleHeight, width: sampleWidth, x: region.x + region.width - sampleWidth, y: region.y },
    { height: sampleHeight, width: sampleWidth, x: region.x, y: region.y + region.height - sampleHeight },
    {
      height: sampleHeight,
      width: sampleWidth,
      x: region.x + region.width - sampleWidth,
      y: region.y + region.height - sampleHeight,
    },
  ]

  for (const sampleRect of sampleRects) {
    for (let y = sampleRect.y; y < sampleRect.y + sampleRect.height; y += 1) {
      for (let x = sampleRect.x; x < sampleRect.x + sampleRect.width; x += 1) {
        const color = getPartColorPixel(imageData, x, y)
        if (color) {
          samples.push(color)
        }
      }
    }
  }

  return getMedianColorSample(samples)
}

function collectStepPartPageBackgroundSamples(imageData: DetectionImageData, region: PixelRegion) {
  const samples: ColorSample[] = []
  const stepX = Math.max(1, Math.floor(region.width / 24))
  const stepY = Math.max(1, Math.floor(region.height / 24))

  for (let y = region.y; y < region.y + region.height; y += stepY) {
    for (let x = region.x; x < region.x + region.width; x += stepX) {
      const color = getPartColorPixel(imageData, x, y)
      if (color && isLikelyStepPartPageBackgroundPixel(color)) {
        samples.push(color)
      }
    }
  }

  return samples
}

function isLikelyStepPartPageBackgroundPixel(color: ColorSample) {
  const brightness = (color.r + color.g + color.b) / 3
  const chroma = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b)

  return brightness >= 232 && chroma <= 28
}

function getMedianColorSample(samples: readonly ColorSample[]): ColorSample {
  return {
    b: median(samples.map((sample) => sample.b)) ?? 255,
    g: median(samples.map((sample) => sample.g)) ?? 255,
    r: median(samples.map((sample) => sample.r)) ?? 255,
  }
}

function createStepPartFeatureGrid(
  foregroundPixels: ReadonlyArray<{ x: number; y: number }>,
  bounds: PixelRegion,
) {
  const gridSize = stepPartFeatureGridSize
  const grid = new Array<number>(gridSize * gridSize).fill(0)

  for (const pixel of foregroundPixels) {
    const { x: gridX, y: gridY } = mapStepPartPixelToCanonicalGrid(pixel, bounds, gridSize)
    grid[(gridY * gridSize) + gridX] = 1
  }

  return grid
}

function createStepPartFeatureStructureGrid(
  foregroundPixels: ReadonlyArray<{ color: ColorSample; x: number; y: number }>,
  bounds: PixelRegion,
) {
  const gridSize = stepPartFeatureGridSize
  const sums = new Array<number>(gridSize * gridSize).fill(0)
  const counts = new Array<number>(gridSize * gridSize).fill(0)

  for (const pixel of foregroundPixels) {
    const { x: gridX, y: gridY } = mapStepPartPixelToCanonicalGrid(pixel, bounds, gridSize)
    const index = (gridY * gridSize) + gridX
    sums[index] += getStepPartStructureIntensity(pixel.color)
    counts[index] += 1
  }

  return sums.map((sum, index) => counts[index] ? sum / counts[index]! : 0)
}

function createStepPartFeatureDetailGrid(
  foregroundPixels: ReadonlyArray<{ color: ColorSample; x: number; y: number }>,
  bounds: PixelRegion,
  surfaceRgb: ColorSample,
) {
  const gridSize = stepPartFeatureGridSize
  const details = new Array<number>(gridSize * gridSize).fill(0)

  for (const pixel of foregroundPixels) {
    const intensity = getStepPartDetailIntensity(pixel.color, surfaceRgb)
    if (intensity <= 0) {
      continue
    }

    const { x: gridX, y: gridY } = mapStepPartPixelToCanonicalGrid(pixel, bounds, gridSize)
    const index = (gridY * gridSize) + gridX
    details[index] = Math.max(details[index] ?? 0, intensity)
  }

  return details
}

function getStepPartDetailIntensity(color: ColorSample, surfaceRgb: ColorSample) {
  const luminance = getStepPartLuminance(color)
  const surfaceLuminance = getStepPartLuminance(surfaceRgb)
  const darknessContrast = clamp((surfaceLuminance - luminance - 0.045) / 0.34, 0, 1)
  const colorContrast = clamp((getColorDistance(color, surfaceRgb) - 18) / 92, 0, 1)
  const absoluteDarkness = clamp((0.66 - luminance) / 0.58, 0, 1)

  return clamp(Math.max(darknessContrast, colorContrast * 0.74) * absoluteDarkness, 0, 1)
}

function getStepPartLuminance(color: ColorSample) {
  return ((0.299 * color.r) + (0.587 * color.g) + (0.114 * color.b)) / 255
}

function createStepPartFeatureEdgeGrid(grid: readonly number[]) {
  const gridSize = Math.round(Math.sqrt(grid.length))
  if (gridSize <= 0 || gridSize * gridSize !== grid.length) {
    return new Array<number>(grid.length).fill(0)
  }

  const edgeGrid = new Array<number>(grid.length).fill(0)
  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const index = (y * gridSize) + x
      if ((grid[index] ?? 0) <= 0) {
        continue
      }

      const touchesBackground = [
        { x: x - 1, y },
        { x: x + 1, y },
        { x, y: y - 1 },
        { x, y: y + 1 },
      ].some((neighbor) =>
        neighbor.x < 0 ||
        neighbor.x >= gridSize ||
        neighbor.y < 0 ||
        neighbor.y >= gridSize ||
        (grid[(neighbor.y * gridSize) + neighbor.x] ?? 0) <= 0
      )

      if (touchesBackground) {
        edgeGrid[index] = 1
      }
    }
  }

  return edgeGrid
}

function mapStepPartPixelToCanonicalGrid(
  pixel: { x: number; y: number },
  bounds: PixelRegion,
  gridSize: number,
) {
  const scale = (gridSize - (stepPartCanonicalGridPadding * 2)) / Math.max(1, bounds.width, bounds.height)
  const renderedWidth = bounds.width * scale
  const renderedHeight = bounds.height * scale
  const offsetX = (gridSize - renderedWidth) / 2
  const offsetY = (gridSize - renderedHeight) / 2

  return {
    x: clamp(Math.floor(offsetX + ((pixel.x - bounds.x + 0.5) * scale)), 0, gridSize - 1),
    y: clamp(Math.floor(offsetY + ((pixel.y - bounds.y + 0.5) * scale)), 0, gridSize - 1),
  }
}

function getStepPartStructureIntensity(color: ColorSample) {
  const luminance = ((0.299 * color.r) + (0.587 * color.g) + (0.114 * color.b)) / 255

  return clamp(1 - luminance, 0, 1)
}

function getStepPartFeatureCompactness(grid: readonly number[]) {
  const gridSize = Math.round(Math.sqrt(grid.length))
  if (gridSize <= 0 || gridSize * gridSize !== grid.length) {
    return 0
  }

  let area = 0
  let exposedEdges = 0
  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const index = (y * gridSize) + x
      if ((grid[index] ?? 0) <= 0) {
        continue
      }

      area += 1
      const neighbors = [
        { x: x - 1, y },
        { x: x + 1, y },
        { x, y: y - 1 },
        { x, y: y + 1 },
      ]
      for (const neighbor of neighbors) {
        if (
          neighbor.x < 0 ||
          neighbor.x >= gridSize ||
          neighbor.y < 0 ||
          neighbor.y >= gridSize ||
          (grid[(neighbor.y * gridSize) + neighbor.x] ?? 0) <= 0
        ) {
          exposedEdges += 1
        }
      }
    }
  }

  if (area === 0 || exposedEdges === 0) {
    return 0
  }

  return clamp((4 * Math.PI * area) / (exposedEdges * exposedEdges), 0, 1)
}

function createStepPartFeatureEmbedding(
  foregroundPixels: ReadonlyArray<{ x: number; y: number }>,
  bounds: PixelRegion,
) {
  const grid = new Array<number>(stepPartEmbeddingGridSize * stepPartEmbeddingGridSize).fill(0)
  const xProjection = new Array<number>(stepPartEmbeddingProjectionBinCount).fill(0)
  const yProjection = new Array<number>(stepPartEmbeddingProjectionBinCount).fill(0)
  const polar = new Array<number>(
    stepPartEmbeddingPolarAngleBinCount * stepPartEmbeddingPolarRadiusBinCount,
  ).fill(0)
  const normalizedPoints: Array<{ x: number; y: number }> = []
  let centroidX = 0
  let centroidY = 0

  for (const pixel of foregroundPixels) {
    const normalizedX = clamp((pixel.x - bounds.x + 0.5) / Math.max(1, bounds.width), 0, 1)
    const normalizedY = clamp((pixel.y - bounds.y + 0.5) / Math.max(1, bounds.height), 0, 1)
    normalizedPoints.push({ x: normalizedX, y: normalizedY })
    centroidX += normalizedX
    centroidY += normalizedY

    const gridX = clamp(Math.floor(normalizedX * stepPartEmbeddingGridSize), 0, stepPartEmbeddingGridSize - 1)
    const gridY = clamp(Math.floor(normalizedY * stepPartEmbeddingGridSize), 0, stepPartEmbeddingGridSize - 1)
    grid[(gridY * stepPartEmbeddingGridSize) + gridX] += 1

    xProjection[clamp(
      Math.floor(normalizedX * stepPartEmbeddingProjectionBinCount),
      0,
      stepPartEmbeddingProjectionBinCount - 1,
    )] += 1
    yProjection[clamp(
      Math.floor(normalizedY * stepPartEmbeddingProjectionBinCount),
      0,
      stepPartEmbeddingProjectionBinCount - 1,
    )] += 1
  }

  const pointCount = Math.max(1, normalizedPoints.length)
  centroidX /= pointCount
  centroidY /= pointCount
  let maxRadius = 0.001
  for (const point of normalizedPoints) {
    maxRadius = Math.max(maxRadius, Math.hypot(point.x - centroidX, point.y - centroidY))
  }

  for (const point of normalizedPoints) {
    const dx = point.x - centroidX
    const dy = point.y - centroidY
    const radiusBin = clamp(
      Math.floor((Math.hypot(dx, dy) / maxRadius) * stepPartEmbeddingPolarRadiusBinCount),
      0,
      stepPartEmbeddingPolarRadiusBinCount - 1,
    )
    const angleBin = clamp(
      Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * stepPartEmbeddingPolarAngleBinCount),
      0,
      stepPartEmbeddingPolarAngleBinCount - 1,
    )
    polar[(radiusBin * stepPartEmbeddingPolarAngleBinCount) + angleBin] += 1
  }

  const coverage = foregroundPixels.length / Math.max(1, bounds.width * bounds.height)
  const aspect = clamp(Math.log(Math.max(0.001, bounds.width / Math.max(1, bounds.height))) / Math.log(5), -1, 1)
  const vector = [
    ...grid.map((count) => Math.sqrt(count / pointCount) * 1.2),
    ...xProjection.map((count) => Math.sqrt(count / pointCount) * 0.65),
    ...yProjection.map((count) => Math.sqrt(count / pointCount) * 0.65),
    ...polar.map((count) => Math.sqrt(count / pointCount) * 0.85),
    Math.max(0, aspect) * 0.32,
    Math.max(0, -aspect) * 0.32,
    clamp(coverage, 0, 1) * 0.38,
  ]

  return normalizeStepPartEmbedding(vector)
}

function getStepPartFeatureSurfaceRgb(
  foregroundPixels: ReadonlyArray<{ color: ColorSample; x: number; y: number }>,
): ColorSample {
  const foregroundByCoordinate = new Map(foregroundPixels.map((pixel) => [`${pixel.x}:${pixel.y}`, pixel.color]))
  const surfacePixels = foregroundPixels.filter((pixel) => {
    let similarNeighbors = 0
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) {
          continue
        }

        const neighbor = foregroundByCoordinate.get(`${pixel.x + offsetX}:${pixel.y + offsetY}`)
        if (neighbor && getColorDistance(pixel.color, neighbor) <= 34) {
          similarNeighbors += 1
        }
      }
    }

    return similarNeighbors >= 3
  })
  const pixels = surfacePixels.length >= Math.max(4, foregroundPixels.length * 0.08)
    ? surfacePixels
    : foregroundPixels

  return {
    b: Math.round(pixels.reduce((sum, pixel) => sum + pixel.color.b, 0) / pixels.length),
    g: Math.round(pixels.reduce((sum, pixel) => sum + pixel.color.g, 0) / pixels.length),
    r: Math.round(pixels.reduce((sum, pixel) => sum + pixel.color.r, 0) / pixels.length),
  }
}

function createStepPartImageSignature(
  feature: StepPartImageFeature | null,
): DetectedStepCalloutPartImageSignature | null {
  if (!feature) {
    return null
  }

  return {
    aspectRatio: roundSignatureMetric(feature.aspectRatio),
    bottomProfile: createStepPartSignatureProfile(feature.grid, "bottom"),
    boundsHeight: feature.boundsHeight,
    boundsWidth: feature.boundsWidth,
    compactness: roundSignatureMetric(feature.compactness),
    coverage: roundSignatureMetric(feature.coverage),
    detailGrid: feature.detailGrid.map((value) => value >= 0.18 ? "1" : "0").join(""),
    edgeGrid: feature.edgeGrid.map((value) => value > 0 ? "1" : "0").join(""),
    grid: feature.grid.map((value) => value > 0 ? "1" : "0").join(""),
    pixelCount: feature.pixelCount,
    surfaceHex: rgbToHex(feature.surfaceRgb),
    topProfile: createStepPartSignatureProfile(feature.grid, "top"),
  }
}

function createStepPartSignatureProfile(
  grid: readonly number[],
  edge: "bottom" | "top",
) {
  const gridSize = Math.round(Math.sqrt(grid.length))
  if (gridSize <= 0 || gridSize * gridSize !== grid.length) {
    return ""
  }

  let profile = ""
  for (let x = 0; x < gridSize; x += 1) {
    let value = -1
    if (edge === "top") {
      for (let y = 0; y < gridSize; y += 1) {
        if ((grid[(y * gridSize) + x] ?? 0) > 0) {
          value = y
          break
        }
      }
    } else {
      for (let y = gridSize - 1; y >= 0; y -= 1) {
        if ((grid[(y * gridSize) + x] ?? 0) > 0) {
          value = y
          break
        }
      }
    }

    profile += encodeStepPartSignatureProfileValue(value)
  }

  return profile
}

function encodeStepPartSignatureProfileValue(value: number) {
  if (value < 0) {
    return "-"
  }

  return value.toString(36)
}

function roundSignatureMetric(value: number) {
  return Math.round(value * 1_000) / 1_000
}

function scoreStepPartVisualSimilarity(
  left: StepPartImageFeature,
  right: StepPartImageFeature,
  source: StepPartVisualScore["source"] = "manual_thumbnail",
): StepPartVisualScore {
  const shapeScore = scoreStepPartFeatureGrid(left, right)
  const edgeScore = scoreStepPartFeatureGrid({
    ...left,
    grid: left.edgeGrid,
  }, {
    ...right,
    grid: right.edgeGrid,
  })
  const structureScore = scoreStepPartStructureGrid(left, right)
  const detailScore = scoreStepPartDetailGrid(left, right)
  const embeddingScore = scoreStepPartEmbedding(left, right)
  const aspectScore = scoreStepPartAspectRatio(left.aspectRatio, right.aspectRatio)
  const coverageScore = scoreStepPartCoverage(left.coverage, right.coverage)
  const compactnessScore = scoreStepPartCompactness(left.compactness, right.compactness)
  const visualScore = source === "local_callout"
    ? clamp(
        (shapeScore * 0.40) +
        (structureScore * 0.22) +
        (detailScore * 0.18) +
        (embeddingScore * 0.08) +
        (aspectScore * 0.08) +
        (coverageScore * 0.03) +
        (compactnessScore * 0.01),
        0,
        1,
      )
    : clamp(
        (shapeScore * 0.30) +
        (edgeScore * 0.24) +
        (structureScore * 0.16) +
        (detailScore * 0.14) +
        (embeddingScore * 0.07) +
        (aspectScore * 0.06) +
        (coverageScore * 0.02) +
        (compactnessScore * 0.01),
        0,
        1,
      )

  return {
    aspectScore,
    compactnessScore,
    coverageScore,
    detailScore,
    edgeScore,
    embeddingScore,
    shapeScore,
    source,
    structureScore,
    visualScore,
  }
}

function getStepPartVisualMismatchConfidenceCap(score: StepPartVisualScore) {
  let confidenceCap = 1
  const hasStrongShapeStructure = (
    score.shapeScore >= 0.86 &&
    score.structureScore >= 0.78 &&
    score.detailScore >= 0.72 &&
    score.aspectScore >= 0.72 &&
    score.coverageScore >= 0.72
  )

  if (score.visualScore < 0.62) {
    confidenceCap = Math.min(confidenceCap, 0.54)
  } else if (score.visualScore < 0.74) {
    confidenceCap = Math.min(confidenceCap, 0.82)
  }
  if (score.shapeScore < 0.58) {
    confidenceCap = Math.min(confidenceCap, 0.52)
  } else if (score.shapeScore < 0.72) {
    confidenceCap = Math.min(confidenceCap, 0.78)
  }
  if (score.source !== "local_callout" && score.edgeScore < 0.58 && !hasStrongShapeStructure) {
    confidenceCap = Math.min(confidenceCap, 0.58)
  } else if (score.source !== "local_callout" && score.edgeScore < 0.76 && !hasStrongShapeStructure) {
    confidenceCap = Math.min(confidenceCap, 0.86)
  }
  if (score.structureScore < 0.64) {
    confidenceCap = Math.min(confidenceCap, 0.66)
  } else if (score.structureScore < 0.8) {
    confidenceCap = Math.min(confidenceCap, 0.9)
  }
  if (score.detailScore < 0.48) {
    confidenceCap = Math.min(confidenceCap, 0.56)
  } else if (score.detailScore < 0.66) {
    confidenceCap = Math.min(confidenceCap, 0.82)
  }
  if (score.embeddingScore < 0.62) {
    confidenceCap = Math.min(confidenceCap, 0.62)
  } else if (score.embeddingScore < 0.78) {
    confidenceCap = Math.min(confidenceCap, 0.86)
  }
  if (score.aspectScore < 0.55) {
    confidenceCap = Math.min(confidenceCap, 0.54)
  } else if (score.aspectScore < 0.72) {
    confidenceCap = Math.min(confidenceCap, 0.84)
  }
  if (score.coverageScore < 0.5) {
    confidenceCap = Math.min(confidenceCap, 0.62)
  } else if (score.coverageScore < 0.68) {
    confidenceCap = Math.min(confidenceCap, 0.86)
  }
  if (score.compactnessScore < 0.45) {
    confidenceCap = Math.min(confidenceCap, 0.72)
  }

  return confidenceCap
}

function scoreStepPartEmbedding(left: StepPartImageFeature, right: StepPartImageFeature) {
  if (left.embedding.length === 0 || left.embedding.length !== right.embedding.length) {
    return 0
  }

  let dotProduct = 0
  for (let index = 0; index < left.embedding.length; index += 1) {
    dotProduct += (left.embedding[index] ?? 0) * (right.embedding[index] ?? 0)
  }

  return clamp(dotProduct, 0, 1)
}

function scoreStepPartCoverage(left: number, right: number) {
  const ratio = Math.max(left, right) / Math.max(0.001, Math.min(left, right))

  return clamp(1 - Math.log(ratio) / Math.log(4.2), 0, 1)
}

function scoreStepPartCompactness(left: number, right: number) {
  const ratio = Math.max(left, right) / Math.max(0.001, Math.min(left, right))

  return clamp(1 - Math.log(ratio) / Math.log(4.8), 0, 1)
}

function normalizeStepPartEmbedding(vector: readonly number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0))
  if (magnitude <= 0) {
    return [...vector]
  }

  return vector.map((value) => value / magnitude)
}

function scoreStepPartFeatureGrid(left: StepPartImageFeature, right: StepPartImageFeature) {
  const gridSize = Math.round(Math.sqrt(left.grid.length))
  if (gridSize <= 0 || gridSize * gridSize !== left.grid.length || left.grid.length !== right.grid.length) {
    return 0
  }

  const leftCount = countStepPartGridCells(left.grid)
  const rightCount = countStepPartGridCells(right.grid)
  if (leftCount === 0 || rightCount === 0) {
    return 0
  }

  let bestScore = 0

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const shiftedRight = shiftStepPartGrid(right.grid, gridSize, offsetX, offsetY)
      const diceScore = scoreStepPartGridDice(left.grid, shiftedRight)
      const overlapScore = scoreStepPartGridJaccard(left.grid, shiftedRight)
      bestScore = Math.max(bestScore, (diceScore * 0.72) + (overlapScore * 0.28))
    }
  }

  return bestScore
}

function scoreStepPartStructureGrid(left: StepPartImageFeature, right: StepPartImageFeature) {
  const gridSize = Math.round(Math.sqrt(left.structureGrid.length))
  if (
    gridSize <= 0 ||
    gridSize * gridSize !== left.structureGrid.length ||
    left.structureGrid.length !== right.structureGrid.length ||
    left.grid.length !== right.grid.length
  ) {
    return 0
  }

  let bestScore = 0
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const shiftedRightMask = shiftStepPartGrid(right.grid, gridSize, offsetX, offsetY)
      const shiftedRightStructure = shiftStepPartValueGrid(right.structureGrid, gridSize, offsetX, offsetY)
      let difference = 0
      let comparedCells = 0

      for (let index = 0; index < left.structureGrid.length; index += 1) {
        if ((left.grid[index] ?? 0) <= 0 && (shiftedRightMask[index] ?? 0) <= 0) {
          continue
        }

        difference += Math.abs((left.structureGrid[index] ?? 0) - (shiftedRightStructure[index] ?? 0))
        comparedCells += 1
      }

      if (comparedCells > 0) {
        bestScore = Math.max(bestScore, clamp(1 - difference / comparedCells, 0, 1))
      }
    }
  }

  return bestScore
}

function scoreStepPartDetailGrid(left: StepPartImageFeature, right: StepPartImageFeature) {
  const gridSize = Math.round(Math.sqrt(left.detailGrid.length))
  if (
    gridSize <= 0 ||
    gridSize * gridSize !== left.detailGrid.length ||
    left.detailGrid.length !== right.detailGrid.length ||
    left.grid.length !== right.grid.length
  ) {
    return 0
  }

  const leftMass = sumStepPartValueGrid(left.detailGrid)
  const rightMass = sumStepPartValueGrid(right.detailGrid)
  if (leftMass < 0.25 && rightMass < 0.25) {
    return 1
  }

  const massRatio = Math.max(leftMass, rightMass) / Math.max(0.25, Math.min(leftMass, rightMass))
  const massScore = clamp(1 - Math.log(massRatio) / Math.log(5.2), 0, 1)
  let bestAlignmentScore = 0

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const shiftedRightMask = shiftStepPartGrid(right.grid, gridSize, offsetX, offsetY)
      const shiftedRightDetail = shiftStepPartValueGrid(right.detailGrid, gridSize, offsetX, offsetY)
      let difference = 0
      let comparedCells = 0

      for (let index = 0; index < left.detailGrid.length; index += 1) {
        if ((left.grid[index] ?? 0) <= 0 && (shiftedRightMask[index] ?? 0) <= 0) {
          continue
        }

        difference += Math.abs((left.detailGrid[index] ?? 0) - (shiftedRightDetail[index] ?? 0))
        comparedCells += 1
      }

      if (comparedCells > 0) {
        bestAlignmentScore = Math.max(bestAlignmentScore, clamp(1 - difference / comparedCells, 0, 1))
      }
    }
  }

  return (bestAlignmentScore * 0.72) + (massScore * 0.28)
}

function countStepPartGridCells(grid: readonly number[]) {
  return grid.reduce((sum, value) => sum + (value > 0 ? 1 : 0), 0)
}

function sumStepPartValueGrid(grid: readonly number[]) {
  return grid.reduce((sum, value) => sum + Math.max(0, value), 0)
}

function scoreStepPartGridDice(left: readonly number[], right: readonly number[]) {
  let intersection = 0
  let leftCount = 0
  let rightCount = 0

  for (let index = 0; index < left.length; index += 1) {
    const hasLeft = (left[index] ?? 0) > 0
    const hasRight = (right[index] ?? 0) > 0
    if (hasLeft) {
      leftCount += 1
    }
    if (hasRight) {
      rightCount += 1
    }
    if (hasLeft && hasRight) {
      intersection += 1
    }
  }

  return leftCount + rightCount === 0 ? 0 : (2 * intersection) / (leftCount + rightCount)
}

function scoreStepPartGridJaccard(left: readonly number[], right: readonly number[]) {
  let intersection = 0
  let union = 0

  for (let index = 0; index < left.length; index += 1) {
    const hasLeft = (left[index] ?? 0) > 0
    const hasRight = (right[index] ?? 0) > 0
    if (hasLeft || hasRight) {
      union += 1
    }
    if (hasLeft && hasRight) {
      intersection += 1
    }
  }

  return union === 0 ? 0 : intersection / union
}

function shiftStepPartGrid(grid: readonly number[], gridSize: number, offsetX: number, offsetY: number) {
  if (offsetX === 0 && offsetY === 0) {
    return grid
  }

  const shifted = new Array<number>(grid.length).fill(0)
  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const value = grid[(y * gridSize) + x] ?? 0
      if (value <= 0) {
        continue
      }

      const shiftedX = x + offsetX
      const shiftedY = y + offsetY
      if (shiftedX < 0 || shiftedX >= gridSize || shiftedY < 0 || shiftedY >= gridSize) {
        continue
      }

      shifted[(shiftedY * gridSize) + shiftedX] = 1
    }
  }

  return shifted
}

function shiftStepPartValueGrid(grid: readonly number[], gridSize: number, offsetX: number, offsetY: number) {
  if (offsetX === 0 && offsetY === 0) {
    return grid
  }

  const shifted = new Array<number>(grid.length).fill(0)
  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const shiftedX = x + offsetX
      const shiftedY = y + offsetY
      if (shiftedX < 0 || shiftedX >= gridSize || shiftedY < 0 || shiftedY >= gridSize) {
        continue
      }

      shifted[(shiftedY * gridSize) + shiftedX] = grid[(y * gridSize) + x] ?? 0
    }
  }

  return shifted
}

function scoreStepPartAspectRatio(left: number, right: number) {
  const ratio = Math.max(left, right) / Math.max(0.001, Math.min(left, right))

  return clamp(1 - Math.log(ratio) / Math.log(3.2), 0, 1)
}

function scoreStepColorNameMatch(leftName: string, rightName: string | null) {
  if (!rightName) {
    return 0
  }

  const left = normalizeStepColorName(leftName)
  const right = normalizeStepColorName(rightName)
  if (left === right) {
    return 1
  }
  if (left.includes(right) || right.includes(left)) {
    return 0.76
  }

  return 0
}

function scoreStepBomColorCompatibility(
  stepColor: DetectedColorEstimate,
  rowName: string | null,
) {
  if (!rowName) {
    return 0.55
  }

  const stepName = normalizeStepColorName(stepColor.name)
  const bomName = normalizeStepColorName(rowName)
  if (stepName === bomName) {
    return 1
  }
  if (stepName === "unknowncolor") {
    return 0.7
  }

  const stepFamily = getStepColorFamily(stepName)
  const bomFamily = getStepColorFamily(bomName)
  if (stepFamily && stepFamily === bomFamily) {
    if (stepFamily === "gray" || stepFamily === "brown" || stepFamily === "blue") {
      return 0.42
    }

    return 0.82
  }
  if (
    (stepFamily === "brown" && bomFamily === "orange") ||
    (stepFamily === "orange" && bomFamily === "brown")
  ) {
    return 0.74
  }

  if (stepName.includes(bomName) || bomName.includes(stepName)) {
    return 0.76
  }

  return 0
}

function getStepBomColorCompatibilityConfidenceCap(colorCompatibilityScore: number) {
  if (colorCompatibilityScore >= 0.72) {
    return 1
  }
  if (colorCompatibilityScore >= 0.55) {
    return 0.53
  }

  return 0.45
}

function getStepColorFamily(normalizedColorName: string) {
  if (normalizedColorName.includes("gray")) {
    return "gray"
  }
  if (normalizedColorName.includes("green")) {
    return "green"
  }
  if (normalizedColorName.includes("brown") || normalizedColorName.includes("tan")) {
    return "brown"
  }
  if (normalizedColorName.includes("azure") || normalizedColorName.includes("blue")) {
    return "blue"
  }
  if (normalizedColorName.includes("orange")) {
    return "orange"
  }
  if (normalizedColorName.includes("black")) {
    return "black"
  }

  return null
}

function normalizeStepColorName(name: string) {
  return name.toLowerCase().replace(/grey/g, "gray").replace(/[^a-z0-9]+/g, "")
}

function scoreColorDistance(left: ColorSample, right: ColorSample, maxDistance: number) {
  return clamp(1 - getColorDistance(left, right) / maxDistance, 0, 1)
}

function readQuantityFromNativeTextItems(
  nativeTextItems: readonly StepPageTextItem[],
  quantitySourceRegion: StepCalloutSourceRegion,
): StepQuantityRead | null {
  if (nativeTextItems.length === 0) {
    return null
  }

  const searchRegion = {
    height: quantitySourceRegion.height + 12,
    width: quantitySourceRegion.width + 16,
    x: quantitySourceRegion.x - 8,
    y: quantitySourceRegion.y - 6,
  }
  const matchingItems = nativeTextItems
    .filter((item) => isTextItemInsideRegion(item, searchRegion))
    .sort((left, right) => left.y - right.y || left.x - right.x)
  if (matchingItems.length === 0) {
    return null
  }

  const text = matchingItems
    .map((item) => item.text)
    .join("")
    .replace(/\s+/g, "")
  const match = /^(\d{1,3})x$/i.exec(text)
  if (!match) {
    return null
  }

  const value = Number(match[1])
  return {
    quantity: {
      confidence: 0.96,
      text: match[1] ?? null,
      value: Number.isInteger(value) && value > 0 ? value : null,
    },
    sourceRegion: toNativeTextSourceRegion(matchingItems),
  }
}

function toNativeTextSourceRegion(items: readonly StepPageTextItem[]): StepCalloutSourceRegion | null {
  const region = unionRegions(items)
  if (!region) {
    return null
  }

  return {
    height: Math.ceil(region.height),
    unit: "step_pixel",
    width: Math.ceil(region.width),
    x: Math.floor(region.x),
    y: Math.floor(region.y),
  }
}

function isTextItemInsideRegion(item: StepPageTextItem, region: PixelRegion) {
  const centerX = item.x + item.width / 2
  const centerY = item.y + item.height / 2

  return (
    centerX >= region.x &&
    centerX <= region.x + region.width &&
    centerY >= region.y &&
    centerY <= region.y + region.height
  )
}

function readQuantityFromImageData(imageData: DetectionImageData, quantityRegion: PixelRegion): QuantityEstimate {
  const textRegion = trimRegionToQuantityText(imageData, quantityRegion)
  if (textRegion && !isLikelyQuantityLabelSurface(imageData, expandRegion(textRegion, imageData, 2))) {
    return {
      confidence: 0,
      text: null,
      value: null,
    }
  }

  const digitRunRegion = getQuantityDigitRunRegion(imageData, quantityRegion)
  const glyphs = getQuantityGlyphRegions(imageData, digitRunRegion)
  const glyphQuantity = readQuantityFromGlyphRegions(imageData, glyphs)
  const selectedQuantity = glyphQuantity

  if (!selectedQuantity.value) {
    const fallbackQuantity = readFallbackFourQuantityFromTextRegion(imageData, textRegion)
    if (fallbackQuantity) {
      return fallbackQuantity
    }

    return {
      confidence: 0,
      text: null,
      value: null,
    }
  }

  const { confidence, text, value } = selectedQuantity

  if (
    value === 4 &&
    confidence < 0.68 &&
    textRegion
  ) {
    const mergedOneQuantity = readMergedOneQuantityFromTextRegion(imageData, textRegion, confidence)
    if (mergedOneQuantity) {
      return mergedOneQuantity
    }

    if (textRegion.width <= textRegion.height * 1.42) {
      return {
        confidence: Math.max(confidence, 0.78),
        text: "1",
        value: 1,
      }
    }
  }

  return {
    confidence,
    text,
    value: Number.isInteger(value) && value > 0 ? value : null,
  }
}

function readQuantityFromGlyphRegions(
  imageData: DetectionImageData,
  glyphs: readonly PixelRegion[],
): QuantityEstimate {
  const digits: string[] = []
  const confidences: number[] = []

  for (const glyph of glyphs) {
    const classification = classifyQuantityGlyph(imageData, glyph)
    if (!classification) {
      continue
    }

    if (classification.char === "x") {
      if (digits.length > 0) {
        break
      }
      continue
    }

    if (digits.length > 0 && classification.confidence < 0.68) {
      break
    }

    digits.push(classification.char)
    confidences.push(classification.confidence)
    if (digits.length >= 3) {
      break
    }
  }

  const text = digits.join("")
  const value = Number(text)
  const confidence = confidences.reduce((sum, confidence) => sum + confidence, 0) / Math.max(1, confidences.length)

  return {
    confidence,
    text: text || null,
    value: Number.isInteger(value) && value > 0 ? value : null,
  }
}

function readMergedOneQuantityFromTextRegion(
  imageData: DetectionImageData,
  textRegion: PixelRegion,
  confidence: number,
): QuantityEstimate | null {
  const components = collectDarkComponents(imageData, textRegion, isQuantityTextPixel)
    .filter((component) =>
      component.height >= Math.max(6, textRegion.height * 0.45) &&
      component.width >= 1 &&
      component.count >= 4
    )
    .sort((left, right) => left.x - right.x || left.y - right.y)
  const first = components[0]
  const markerComponents = components.slice(1)
  const markerRegion = markerComponents.length > 0 ? unionRegions(markerComponents) : null
  const markerCount = markerComponents.reduce((sum, component) => sum + component.count, 0)
  if (!first || !markerRegion) {
    return null
  }

  const gap = markerRegion.x - (first.x + first.width)
  const firstAspectRatio = first.width / Math.max(1, first.height)
  const markerAspectRatio = markerRegion.width / Math.max(1, markerRegion.height)
  if (
    gap >= 1 &&
    firstAspectRatio <= 0.42 &&
    markerAspectRatio >= 0.48 &&
    first.count <= markerCount * 0.82
  ) {
    return {
      confidence: Math.max(confidence, 0.8),
      text: "1",
      value: 1,
    }
  }

  return null
}

function isLikelyQuantityLabelSurface(imageData: DetectionImageData, region: PixelRegion) {
  const boundedRegion = normalizeRegion(region, imageData.width, imageData.height)
  let coloredSurfacePixels = 0
  let sampledPixels = 0

  for (let y = boundedRegion.y; y < boundedRegion.y + boundedRegion.height; y += 1) {
    for (let x = boundedRegion.x; x < boundedRegion.x + boundedRegion.width; x += 1) {
      const dataIndex = ((y * imageData.width) + x) * 4
      const alpha = imageData.data[dataIndex + 3] ?? 255
      if (alpha < 32) {
        continue
      }

      const r = imageData.data[dataIndex] ?? 0
      const g = imageData.data[dataIndex + 1] ?? 0
      const b = imageData.data[dataIndex + 2] ?? 0
      const brightness = (r + g + b) / 3
      const chroma = Math.max(r, g, b) - Math.min(r, g, b)
      sampledPixels += 1

      if (brightness < 190 && chroma > 55) {
        coloredSurfacePixels += 1
      }
    }
  }

  return sampledPixels === 0 || coloredSurfacePixels / sampledPixels <= 0.18
}

function readFallbackFourQuantityFromTextRegion(
  imageData: DetectionImageData,
  textRegion: PixelRegion | null,
): QuantityEstimate | null {
  if (!textRegion || textRegion.width < textRegion.height * 1.12) {
    return null
  }

  const digitRegion = trimRegionToQuantityText(imageData, {
    height: textRegion.height,
    width: Math.ceil(textRegion.width * 0.56),
    x: textRegion.x,
    y: textRegion.y,
  })
  if (!digitRegion || !isLikelyFourQuantityGlyph(imageData, digitRegion)) {
    return null
  }

  return {
    confidence: 0.78,
    text: "4",
    value: 4,
  }
}

function isLikelyFourQuantityGlyph(imageData: DetectionImageData, glyphRegion: PixelRegion) {
  const densities = getQuantityGlyphDensities(imageData, glyphRegion)
  const middle = getQuantityGridAreaDensity(densities, 0, 3, 5, 1)
  const bottom = getQuantityGridAreaDensity(densities, 0, 5, 5, 2)
  const upperLeft = getQuantityGridAreaDensity(densities, 0, 1, 2, 2)
  const upperRight = getQuantityGridAreaDensity(densities, 3, 1, 2, 2)
  const lowerLeft = getQuantityGridAreaDensity(densities, 0, 4, 2, 2)
  const lowerRight = getQuantityGridAreaDensity(densities, 3, 4, 2, 2)

  return (
    upperLeft > 0.06 &&
    upperRight > 0.06 &&
    middle > 0.09 &&
    lowerRight > 0.06 &&
    lowerLeft < Math.max(0.1, upperLeft * 0.9) &&
    bottom < 0.28
  )
}

function getTrustedQuantityTextExclusionRegions(
  imageData: DetectionImageData,
  quantityRegion: PixelRegion,
  quantity: QuantityEstimate,
) {
  if (!quantity.value || quantity.confidence < 0.72) {
    return []
  }

  const textRegion = trimRegionToQuantityText(imageData, quantityRegion)
  if (!textRegion) {
    return [expandRegion(quantityRegion, imageData, 1)]
  }

  const glyphs = getQuantityGlyphRegions(imageData, textRegion)
  const textPadding = Math.max(2, Math.round(textRegion.height * 0.12))
  const textExclusion = expandRegion(textRegion, imageData, textPadding)

  return glyphs.length > 0
    ? [
        textExclusion,
        ...glyphs.map((glyph) => expandRegion(glyph, imageData, 1)),
      ]
    : [textExclusion]
}

function getQuantityDigitRunRegion(imageData: DetectionImageData, quantityRegion: PixelRegion) {
  const textRegion = trimRegionToQuantityText(imageData, quantityRegion)
  if (!textRegion) {
    return normalizeRegion(quantityRegion, imageData.width, imageData.height)
  }

  const glyphs = getQuantityGlyphRegions(imageData, textRegion)
  const digitGlyphs = glyphs.length >= 2 ? glyphs.slice(0, -1) : []
  const markerGlyph = glyphs.length >= 2 ? glyphs.at(-1) : null
  const digitGlyphRegion = digitGlyphs.length > 0 ? unionRegions(digitGlyphs) : null
  if (
    markerGlyph &&
    digitGlyphRegion &&
    markerGlyph.x >= digitGlyphRegion.x + digitGlyphRegion.width &&
    markerGlyph.width <= Math.max(4, textRegion.height * 1.2)
  ) {
    return trimRegionToQuantityText(imageData, digitGlyphRegion) ?? digitGlyphRegion
  }

  const separatorX = findQuantityMarkerSeparatorX(imageData, textRegion)
  if (!separatorX) {
    return textRegion
  }

  return trimRegionToQuantityText(imageData, {
    height: textRegion.height,
    width: separatorX - textRegion.x,
    x: textRegion.x,
    y: textRegion.y,
  }) ?? textRegion
}

function findQuantityMarkerSeparatorX(imageData: DetectionImageData, textRegion: PixelRegion) {
  const boundedRegion = normalizeRegion(textRegion, imageData.width, imageData.height)
  if (boundedRegion.width < 8) {
    return null
  }

  const componentSeparatorX = findQuantityMarkerSeparatorFromComponents(imageData, boundedRegion)
  if (componentSeparatorX) {
    return componentSeparatorX
  }

  const columns: number[] = []
  for (let x = boundedRegion.x; x < boundedRegion.x + boundedRegion.width; x += 1) {
    let count = 0
    for (let y = boundedRegion.y; y < boundedRegion.y + boundedRegion.height; y += 1) {
      if (isQuantityTextPixel(imageData, x, y)) {
        count += 1
      }
    }
    columns.push(count)
  }

  const totalInk = columns.reduce((sum, count) => sum + count, 0)
  if (totalInk < 8) {
    return null
  }

  const prefixInk: number[] = [0]
  for (const count of columns) {
    prefixInk.push((prefixInk.at(-1) ?? 0) + count)
  }

  const minSideInk = Math.max(4, totalInk * 0.12)
  const searchStart = Math.max(2, Math.floor(boundedRegion.width * 0.22))
  const searchEnd = Math.min(boundedRegion.width - 3, Math.ceil(boundedRegion.width * 0.84))
  let bestIndex: number | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (let index = searchStart; index <= searchEnd; index += 1) {
    const leftInk = prefixInk[index] ?? 0
    const rightInk = totalInk - leftInk
    const leftInkRatio = leftInk / totalInk
    const rightInkRatio = rightInk / totalInk
    if (
      leftInk < minSideInk ||
      rightInk < minSideInk ||
      leftInkRatio < 0.35 ||
      rightInkRatio < 0.15 ||
      rightInkRatio > 0.55
    ) {
      continue
    }

    const windowInk = (columns[index - 1] ?? 0) + (columns[index] ?? 0) + (columns[index + 1] ?? 0)
    const score = windowInk + Math.abs(rightInkRatio - 0.38) * 4
    if (score < bestScore) {
      bestIndex = index
      bestScore = score
    }
  }

  if (bestIndex == null) {
    return null
  }

  const bestWindowInk = (columns[bestIndex - 1] ?? 0) + (columns[bestIndex] ?? 0) + (columns[bestIndex + 1] ?? 0)
  return bestWindowInk <= Math.max(2, boundedRegion.height * 0.72) ? boundedRegion.x + bestIndex : null
}

function findQuantityMarkerSeparatorFromComponents(imageData: DetectionImageData, textRegion: PixelRegion) {
  const components = collectDarkComponents(imageData, textRegion, isQuantityTextPixel)
    .filter((component) => component.count >= 4)
    .sort((left, right) => left.x - right.x)
  if (components.length < 2) {
    return null
  }

  const totalInk = components.reduce((sum, component) => sum + component.count, 0)
  let leftInk = components[0]?.count ?? 0
  let bestSeparatorX: number | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (let index = 1; index < components.length; index += 1) {
    const previous = components[index - 1]
    const current = components[index]
    if (!previous || !current) {
      continue
    }

    const gap = current.x - (previous.x + previous.width)
    const rightInk = totalInk - leftInk
    const leftInkRatio = leftInk / Math.max(1, totalInk)
    const rightInkRatio = rightInk / Math.max(1, totalInk)
    const rightComponentCount = components.length - index

    if (
      gap >= 1 &&
      leftInkRatio >= 0.18 &&
      rightInkRatio >= 0.15 &&
      rightInkRatio <= 0.72 &&
      !(leftInkRatio < 0.35 && rightComponentCount > 1)
    ) {
      const targetRightInkRatio = leftInkRatio < 0.35 ? 0.58 : 0.38
      const score = Math.abs(rightInkRatio - targetRightInkRatio) - gap * 0.02
      if (score < bestScore) {
        bestScore = score
        bestSeparatorX = previous.x + previous.width + Math.floor(gap / 2)
      }
    }

    leftInk += current.count
  }

  return bestSeparatorX
}

function getQuantityGlyphRegions(imageData: DetectionImageData, quantityRegion: PixelRegion) {
  const boundedRegion = normalizeRegion(quantityRegion, imageData.width, imageData.height)
  const minHeight = Math.max(6, boundedRegion.height * 0.3)

  return splitWideQuantityGlyphs(
    imageData,
    collectDarkComponents(imageData, boundedRegion, isQuantityTextPixel)
      .filter((component) =>
        component.height >= minHeight &&
        component.width >= 2 &&
        component.count >= 5
      )
      .sort((left, right) => left.x - right.x || left.y - right.y),
  )
}

function splitWideQuantityGlyphs(imageData: DetectionImageData, components: readonly DarkComponent[]) {
  const glyphs = mergeNearbyQuantityGlyphs(components)
  const splitGlyphs: DarkComponent[] = []

  for (const glyph of glyphs) {
    if (glyph.width <= glyph.height * 0.78) {
      splitGlyphs.push(glyph)
      continue
    }

    const splitX = findQuantityGlyphSplitX(imageData, glyph)
    if (!splitX) {
      splitGlyphs.push(glyph)
      continue
    }

    const leftGlyph = trimRegionToQuantityText(imageData, {
      height: glyph.height,
      width: splitX - glyph.x,
      x: glyph.x,
      y: glyph.y,
    })
    const rightGlyph = trimRegionToQuantityText(imageData, {
      height: glyph.height,
      width: glyph.x + glyph.width - splitX,
      x: splitX,
      y: glyph.y,
    })

    if (leftGlyph) {
      splitGlyphs.push(leftGlyph)
    }
    if (rightGlyph) {
      splitGlyphs.push(rightGlyph)
    }
  }

  return splitGlyphs
}

function mergeNearbyQuantityGlyphs(components: readonly DarkComponent[]) {
  const glyphs: DarkComponent[] = []

  for (const component of components) {
    const previous = glyphs.at(-1)
    if (
      previous &&
      component.x - (previous.x + previous.width) <= Math.max(1, Math.min(previous.height, component.height) * 0.08) &&
      getVerticalOverlapRatio(previous, component) >= 0.45
    ) {
      const merged = unionRegions([previous, component])
      glyphs[glyphs.length - 1] = {
        count: previous.count + component.count,
        height: merged?.height ?? previous.height,
        width: merged?.width ?? previous.width,
        x: merged?.x ?? previous.x,
        y: merged?.y ?? previous.y,
      }
      continue
    }

    glyphs.push(component)
  }

  return glyphs
}

function findQuantityGlyphSplitX(imageData: DetectionImageData, glyph: DarkComponent) {
  let bestX: number | null = null
  let bestCount = Number.POSITIVE_INFINITY
  const startX = glyph.x + Math.round(glyph.width * 0.34)
  const endX = glyph.x + Math.round(glyph.width * 0.66)

  for (let x = startX; x <= endX; x += 1) {
    let count = 0
    for (let y = glyph.y; y < glyph.y + glyph.height; y += 1) {
      if (isQuantityTextPixel(imageData, x, y)) {
        count += 1
      }
    }

    if (count < bestCount) {
      bestCount = count
      bestX = x
    }
  }

  return bestX && bestCount <= Math.max(1, glyph.height * 0.18) ? bestX : null
}

function trimRegionToQuantityText(imageData: DetectionImageData, region: PixelRegion): DarkComponent | null {
  const boundedRegion = normalizeRegion(region, imageData.width, imageData.height)
  let count = 0
  let minX = imageData.width
  let minY = imageData.height
  let maxX = 0
  let maxY = 0

  for (let y = boundedRegion.y; y < boundedRegion.y + boundedRegion.height; y += 1) {
    for (let x = boundedRegion.x; x < boundedRegion.x + boundedRegion.width; x += 1) {
      if (!isQuantityTextPixel(imageData, x, y)) {
        continue
      }

      count += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (count < 4) {
    return null
  }

  return {
    count,
    height: maxY - minY + 1,
    width: maxX - minX + 1,
    x: minX,
    y: minY,
  }
}

function getQuantityDisplayRegion(
  imageData: DetectionImageData,
  quantityRegion: PixelRegion,
  quantity: QuantityEstimate,
) {
  if (!quantity.value) {
    return null
  }

  const textRegion = trimRegionToQuantityDisplayText(imageData, quantityRegion)
  if (!textRegion) {
    return null
  }

  return padRegion(textRegion, imageData.width, imageData.height, 2)
}

function trimRegionToQuantityDisplayText(imageData: DetectionImageData, region: PixelRegion): DarkComponent | null {
  const boundedRegion = normalizeRegion(region, imageData.width, imageData.height)
  const components = collectDarkComponents(imageData, boundedRegion, isQuantityTextPixel)
    .filter((component) => isLikelyQuantityDisplayTextComponent(component, boundedRegion))
  const textRegion = unionRegions(components)
  const count = components.reduce((sum, component) => sum + component.count, 0)

  if (!textRegion || count < 4) {
    return null
  }

  return {
    count,
    height: textRegion.height,
    width: textRegion.width,
    x: textRegion.x,
    y: textRegion.y,
  }
}

function isLikelyQuantityDisplayTextComponent(component: DarkComponent, searchRegion: PixelRegion) {
  const minHeight = Math.max(3, Math.min(10, Math.round(searchRegion.height * 0.09)))
  const maxWidth = Math.max(8, Math.round(searchRegion.height * 2.1))
  const maxHeight = Math.max(8, Math.round(searchRegion.height * 0.92))
  const density = component.count / Math.max(1, component.width * component.height)

  return (
    component.height >= minHeight &&
    component.height <= maxHeight &&
    component.width <= maxWidth &&
    density <= 0.78
  )
}

function classifyQuantityGlyph(
  imageData: DetectionImageData,
  glyphRegion: PixelRegion,
): QuantityGlyphClassification | null {
  const aspectRatio = glyphRegion.width / Math.max(1, glyphRegion.height)
  const densities = getQuantityGlyphDensities(imageData, glyphRegion)
  const templateScores = quantityGlyphTemplates.map((template) => ({
    char: template.char,
    confidence: scoreQuantityGlyphTemplate(densities, template.pattern),
  }))
  const bestTemplate = templateScores.sort((left, right) => right.confidence - left.confidence)[0]
  if (!bestTemplate) {
    return null
  }

  const featureClassification = classifyQuantityGlyphByFeatures(densities, aspectRatio)
  if (
    featureClassification &&
    featureClassification.char !== "1" &&
    (featureClassification.char === "x" || aspectRatio >= 0.45) &&
    featureClassification.confidence >= bestTemplate.confidence - 0.14
  ) {
    return featureClassification
  }

  if (aspectRatio < 0.38 && bestTemplate.char !== "x" && featureClassification?.char !== "x") {
    return {
      char: "1",
      confidence: Math.max(bestTemplate.confidence, 0.78),
    }
  }

  const oneTemplate = templateScores.find((template) => template.char === "1")
  if (
    aspectRatio < 0.52 &&
    bestTemplate.char !== "x" &&
    oneTemplate &&
    oneTemplate.confidence >= bestTemplate.confidence - 0.12 &&
    featureClassification?.char !== "2" &&
    featureClassification?.char !== "3" &&
    featureClassification?.char !== "4"
  ) {
    return {
      char: "1",
      confidence: Math.max(oneTemplate.confidence, 0.78),
    }
  }

  if (
    featureClassification &&
    featureClassification.confidence >= bestTemplate.confidence - 0.08
  ) {
    return featureClassification
  }

  if (
    bestTemplate.char === "7" &&
    (
      bestTemplate.confidence < 0.78 ||
      (oneTemplate && oneTemplate.confidence >= bestTemplate.confidence - 0.22)
    )
  ) {
    return {
      char: "1",
      confidence: Math.max(oneTemplate?.confidence ?? 0, 0.74),
    }
  }

  if (bestTemplate.confidence < 0.52) {
    return null
  }

  return {
    char: bestTemplate.char,
    confidence: bestTemplate.confidence,
  }
}

function classifyQuantityGlyphByFeatures(
  densities: readonly number[],
  aspectRatio: number,
): QuantityGlyphClassification | null {
  const top = getQuantityGridAreaDensity(densities, 0, 0, 5, 2)
  const middle = getQuantityGridAreaDensity(densities, 0, 3, 5, 1)
  const bottom = getQuantityGridAreaDensity(densities, 0, 5, 5, 2)
  const upperLeft = getQuantityGridAreaDensity(densities, 0, 1, 2, 2)
  const upperRight = getQuantityGridAreaDensity(densities, 3, 1, 2, 2)
  const lowerLeft = getQuantityGridAreaDensity(densities, 0, 4, 2, 2)
  const lowerRight = getQuantityGridAreaDensity(densities, 3, 4, 2, 2)
  const center = getQuantityGridAreaDensity(densities, 2, 2, 1, 3)

  if (aspectRatio < 0.42) {
    return { char: "1", confidence: 0.78 }
  }

  if (
    Math.min(upperLeft, upperRight, lowerLeft, lowerRight) > 0.07 &&
    center > 0.08 &&
    top < 0.34 &&
    bottom < 0.34
  ) {
    return { char: "x", confidence: 0.76 }
  }

  if (
    aspectRatio >= 0.45 &&
    top > 0.16 &&
    middle > 0.12 &&
    bottom > 0.16 &&
    upperLeft > 0.08 &&
    lowerLeft > 0.08 &&
    lowerRight > 0.08 &&
    upperRight < upperLeft + 0.04
  ) {
    return { char: "6", confidence: 0.75 }
  }

  if (
    aspectRatio >= 0.45 &&
    top > 0.16 &&
    middle > 0.12 &&
    bottom > 0.16 &&
    upperRight > upperLeft + 0.03
  ) {
    if (lowerLeft > lowerRight + 0.04) {
      return { char: "2", confidence: 0.74 }
    }
    if (lowerRight > lowerLeft + 0.04) {
      return { char: "3", confidence: 0.74 }
    }
  }

  if (
    aspectRatio >= 0.58 &&
    upperLeft > 0.08 &&
    upperRight > 0.08 &&
    middle > 0.11 &&
    lowerRight > 0.08 &&
    lowerLeft < Math.max(0.09, upperLeft * 0.85) &&
    bottom < 0.22 &&
    top < 0.3
  ) {
    return { char: "4", confidence: 0.78 }
  }

  return null
}

function getQuantityGridAreaDensity(
  densities: readonly number[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  let total = 0
  let count = 0

  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      total += densities[(row * 5) + column] ?? 0
      count += 1
    }
  }

  return count === 0 ? 0 : total / count
}

const quantityGlyphTemplates: Array<{ char: QuantityGlyphClassification["char"]; pattern: string }> = [
  {
    char: "0",
    pattern: [
      "11111",
      "10001",
      "10011",
      "10101",
      "11001",
      "10001",
      "11111",
    ].join(""),
  },
  {
    char: "1",
    pattern: [
      "00100",
      "01100",
      "00100",
      "00100",
      "00100",
      "00100",
      "11111",
    ].join(""),
  },
  {
    char: "2",
    pattern: [
      "11111",
      "00001",
      "00001",
      "11111",
      "10000",
      "10000",
      "11111",
    ].join(""),
  },
  {
    char: "3",
    pattern: [
      "11111",
      "00001",
      "00001",
      "11111",
      "00001",
      "00001",
      "11111",
    ].join(""),
  },
  {
    char: "4",
    pattern: [
      "10001",
      "10001",
      "10001",
      "11111",
      "00001",
      "00001",
      "00001",
    ].join(""),
  },
  {
    char: "5",
    pattern: [
      "11111",
      "10000",
      "10000",
      "11111",
      "00001",
      "00001",
      "11111",
    ].join(""),
  },
  {
    char: "6",
    pattern: [
      "11111",
      "10000",
      "10000",
      "11111",
      "10001",
      "10001",
      "11111",
    ].join(""),
  },
  {
    char: "7",
    pattern: [
      "11111",
      "00001",
      "00010",
      "00010",
      "00100",
      "00100",
      "00100",
    ].join(""),
  },
  {
    char: "8",
    pattern: [
      "11111",
      "10001",
      "10001",
      "11111",
      "10001",
      "10001",
      "11111",
    ].join(""),
  },
  {
    char: "9",
    pattern: [
      "11111",
      "10001",
      "10001",
      "11111",
      "00001",
      "00001",
      "11111",
    ].join(""),
  },
  {
    char: "x",
    pattern: [
      "10001",
      "01010",
      "00100",
      "00100",
      "00100",
      "01010",
      "10001",
    ].join(""),
  },
]

function getQuantityGlyphDensities(imageData: DetectionImageData, glyphRegion: PixelRegion) {
  const gridWidth = 5
  const gridHeight = 7
  const densities: number[] = []

  for (let gridY = 0; gridY < gridHeight; gridY += 1) {
    for (let gridX = 0; gridX < gridWidth; gridX += 1) {
      const startX = glyphRegion.x + Math.floor((glyphRegion.width * gridX) / gridWidth)
      const endX = glyphRegion.x + Math.ceil((glyphRegion.width * (gridX + 1)) / gridWidth)
      const startY = glyphRegion.y + Math.floor((glyphRegion.height * gridY) / gridHeight)
      const endY = glyphRegion.y + Math.ceil((glyphRegion.height * (gridY + 1)) / gridHeight)
      let darkPixels = 0
      let totalPixels = 0

      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          totalPixels += 1
          if (isQuantityTextPixel(imageData, x, y)) {
            darkPixels += 1
          }
        }
      }

      densities.push(totalPixels === 0 ? 0 : darkPixels / totalPixels)
    }
  }

  return densities
}

function scoreQuantityGlyphTemplate(densities: readonly number[], template: string) {
  let score = 0

  for (let index = 0; index < template.length; index += 1) {
    const density = densities[index] ?? 0
    score += template[index] === "1" ? density : 1 - density
  }

  return score / Math.max(1, template.length)
}

function detectPartColorFromImageData(
  imageData: DetectionImageData,
  partRegion: PixelRegion,
  background: ColorSample,
  excludedRegions: readonly PixelRegion[] = [],
): DetectedColorEstimate {
  const samples = collectPartColorSurfaceSamples(imageData, partRegion, background, excludedRegions)
  if (samples.length === 0) {
    return createUnknownColorEstimate()
  }

  const colorScores = new Map<string, {
    b: number
    color: { name: string; rgb: ColorSample }
    g: number
    r: number
    sampleCount: number
    score: number
  }>()
  let totalScore = 0

  for (const sample of samples) {
    const nearestColor = getNearestStepPartColor(sample)
    const score = colorScores.get(nearestColor.name) ?? {
      b: 0,
      color: nearestColor,
      g: 0,
      r: 0,
      sampleCount: 0,
      score: 0,
    }
    score.b += sample.b * sample.weight
    score.g += sample.g * sample.weight
    score.r += sample.r * sample.weight
    score.sampleCount += 1
    score.score += sample.weight
    totalScore += sample.weight
    colorScores.set(nearestColor.name, score)
  }

  const dominantColor = [...colorScores.values()].sort((left, right) => right.score - left.score)[0]
  if (!dominantColor || totalScore === 0) {
    return createUnknownColorEstimate()
  }
  const transparentOrangeEstimate = detectTransparentOrangeColorEstimate(
    imageData,
    partRegion,
    background,
    excludedRegions,
    dominantColor.color.name,
  )
  if (transparentOrangeEstimate) {
    return transparentOrangeEstimate
  }

  const rgb = {
    b: Math.round(dominantColor.b / dominantColor.score),
    g: Math.round(dominantColor.g / dominantColor.score),
    r: Math.round(dominantColor.r / dominantColor.score),
  }
  const nearestDistance = getColorDistance(rgb, dominantColor.color.rgb)

  return {
    confidence: clamp((dominantColor.score / totalScore) * 1.15 + Math.max(0, 0.35 - nearestDistance / 220), 0, 1),
    hex: rgbToHex(rgb),
    name: dominantColor.color.name,
    rgb,
  }
}

function detectTransparentOrangeColorEstimate(
  imageData: DetectionImageData,
  partRegion: PixelRegion,
  background: ColorSample,
  excludedRegions: readonly PixelRegion[],
  dominantColorName: string,
): DetectedColorEstimate | null {
  if (!["Brown", "Dark Orange", "Dark Tan", "Reddish Brown", "Tan"].includes(dominantColorName)) {
    return null
  }

  const boundedRegion = normalizeRegion(partRegion, imageData.width, imageData.height)
  const aspectRatio = boundedRegion.width / Math.max(1, boundedRegion.height)
  let darkOpaquePixels = 0
  let foregroundPixels = 0
  let warmTintPixels = 0

  for (let y = boundedRegion.y; y < boundedRegion.y + boundedRegion.height; y += 1) {
    for (let x = boundedRegion.x; x < boundedRegion.x + boundedRegion.width; x += 1) {
      if (isPointInsideAnyRegion(x, y, excludedRegions)) {
        continue
      }

      const sample = getPartColorPixel(imageData, x, y)
      if (!sample) {
        continue
      }

      const brightness = getColorBrightness(sample)
      const chroma = Math.max(sample.r, sample.g, sample.b) - Math.min(sample.r, sample.g, sample.b)
      const distanceFromBackground = getColorDistance(sample, background)
      if (distanceFromBackground < 10) {
        continue
      }

      foregroundPixels += 1
      if (distanceFromBackground >= 70 && brightness < 105) {
        darkOpaquePixels += 1
      }
      if (
        distanceFromBackground >= 18 &&
        distanceFromBackground <= 145 &&
        brightness > 95 &&
        chroma <= 105 &&
        sample.r >= sample.g * 0.9 &&
        sample.g >= sample.b * 0.78
      ) {
        warmTintPixels += 1
      }
    }
  }

  const tintToDarkRatio = warmTintPixels / Math.max(1, darkOpaquePixels)
  const tintToForegroundRatio = warmTintPixels / Math.max(1, foregroundPixels)
  if (
    warmTintPixels < 8 ||
    aspectRatio > 0.72 ||
    tintToDarkRatio < 0.16 ||
    tintToForegroundRatio < 0.035
  ) {
    return null
  }

  const transOrange = getStepPartColorByName("Trans-Orange")
  return {
    confidence: clamp(0.72 + tintToDarkRatio * 0.7 + tintToForegroundRatio * 1.8, 0, 0.94),
    hex: rgbToHex(transOrange.rgb),
    name: transOrange.name,
    rgb: transOrange.rgb,
  }
}

function collectPartColorSurfaceSamples(
  imageData: DetectionImageData,
  partRegion: PixelRegion,
  background: ColorSample,
  excludedRegions: readonly PixelRegion[] = [],
) {
  const boundedRegion = normalizeRegion(partRegion, imageData.width, imageData.height)
  const foregroundSamples: StepPartSurfaceSample[] = []
  const surfaceSamples: StepPartSurfaceSample[] = []

  for (let y = boundedRegion.y; y < boundedRegion.y + boundedRegion.height; y += 1) {
    for (let x = boundedRegion.x; x < boundedRegion.x + boundedRegion.width; x += 1) {
      if (isPointInsideAnyRegion(x, y, excludedRegions)) {
        continue
      }

      const sample = getPartColorPixel(imageData, x, y)
      if (!sample || !isPartColorForegroundPixel(sample, background)) {
        continue
      }

      const support = getPartColorSurfaceSupport(imageData, boundedRegion, x, y, sample, background)
      const brightness = getColorBrightness(sample)
      const weight = 1 + support.sameColorRatio
      foregroundSamples.push({ ...sample, weight })

      if (
        support.similarNeighborCount >= 4 &&
        support.sameColorRatio >= 0.42 &&
        !(brightness < 55 && support.similarNeighborCount < 5)
      ) {
        surfaceSamples.push({ ...sample, weight: weight + 0.35 })
      }
    }
  }

  return surfaceSamples.length >= Math.max(6, foregroundSamples.length * 0.08)
    ? surfaceSamples
    : foregroundSamples
}

function getPartColorPixel(imageData: DetectionImageData, x: number, y: number) {
  const dataIndex = ((y * imageData.width) + x) * 4
  const alpha = imageData.data[dataIndex + 3] ?? 255
  if (alpha < 32) {
    return null
  }

  return {
    b: imageData.data[dataIndex + 2] ?? 0,
    g: imageData.data[dataIndex + 1] ?? 0,
    r: imageData.data[dataIndex] ?? 0,
  }
}

function isPartColorForegroundPixel(sample: ColorSample, background: ColorSample) {
  return getColorDistance(sample, background) >= 28
}

function getPartColorSurfaceSupport(
  imageData: DetectionImageData,
  bounds: PixelRegion,
  x: number,
  y: number,
  sample: ColorSample,
  background: ColorSample,
) {
  let foregroundNeighborCount = 0
  let similarNeighborCount = 0

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) {
        continue
      }

      const neighborX = x + offsetX
      const neighborY = y + offsetY
      if (
        neighborX < bounds.x ||
        neighborY < bounds.y ||
        neighborX >= bounds.x + bounds.width ||
        neighborY >= bounds.y + bounds.height
      ) {
        continue
      }

      const neighbor = getPartColorPixel(imageData, neighborX, neighborY)
      if (!neighbor || !isPartColorForegroundPixel(neighbor, background)) {
        continue
      }

      foregroundNeighborCount += 1
      if (getColorDistance(sample, neighbor) <= 34) {
        similarNeighborCount += 1
      }
    }
  }

  return {
    foregroundNeighborCount,
    sameColorRatio: similarNeighborCount / Math.max(1, foregroundNeighborCount),
    similarNeighborCount,
  }
}

function getColorBrightness({ b, g, r }: ColorSample) {
  return (r + g + b) / 3
}

function createUnknownColorEstimate(): DetectedColorEstimate {
  return {
    confidence: 0,
    hex: "#808080",
    name: "Unknown",
    rgb: { b: 128, g: 128, r: 128 },
  }
}

const stepPartColorPalette: Array<{ name: string; rgb: ColorSample }> = [
  { name: "Black", rgb: { b: 18, g: 18, r: 18 } },
  { name: "White", rgb: { b: 242, g: 242, r: 242 } },
  { name: "Light Bluish Gray", rgb: { b: 169, g: 165, r: 160 } },
  { name: "Dark Bluish Gray", rgb: { b: 104, g: 110, r: 108 } },
  { name: "Blue", rgb: { b: 191, g: 85, r: 0 } },
  { name: "Dark Azure", rgb: { b: 189, g: 155, r: 51 } },
  { name: "Red", rgb: { b: 9, g: 26, r: 201 } },
  { name: "Green", rgb: { b: 65, g: 120, r: 35 } },
  { name: "Bright Green", rgb: { b: 74, g: 159, r: 75 } },
  { name: "Dark Green", rgb: { b: 30, g: 70, r: 24 } },
  { name: "Yellow", rgb: { b: 55, g: 205, r: 242 } },
  { name: "Dark Orange", rgb: { b: 11, g: 83, r: 169 } },
  { name: "Trans-Orange", rgb: { b: 28, g: 143, r: 240 } },
  { name: "Reddish Brown", rgb: { b: 18, g: 42, r: 88 } },
  { name: "Brown", rgb: { b: 20, g: 85, r: 124 } },
  { name: "Tan", rgb: { b: 158, g: 205, r: 228 } },
  { name: "Dark Tan", rgb: { b: 116, g: 151, r: 149 } },
  { name: "Flat Silver", rgb: { b: 140, g: 140, r: 137 } },
  { name: "Pearl Gold", rgb: { b: 43, g: 142, r: 170 } },
]

function getNearestStepPartColor(rgb: ColorSample) {
  return stepPartColorPalette
    .map((color) => ({
      ...color,
      distance: getColorDistance(rgb, color.rgb),
    }))
    .sort((left, right) => left.distance - right.distance)[0] ?? stepPartColorPalette[0]
}

function getStepPartColorByName(name: string) {
  return stepPartColorPalette.find((color) => color.name === name) ?? stepPartColorPalette[0]
}

function rgbToHex({ b, g, r }: ColorSample) {
  return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("")}`
}

function createCalloutItemForegroundMask(imageData: DetectionImageData, background: ColorSample) {
  const mask = new Uint8Array(imageData.width * imageData.height)

  for (let pixelIndex = 0; pixelIndex < mask.length; pixelIndex += 1) {
    const dataIndex = pixelIndex * 4
    const alpha = imageData.data[dataIndex + 3] ?? 255
    if (alpha < 32) {
      continue
    }

    const r = imageData.data[dataIndex] ?? 0
    const g = imageData.data[dataIndex + 1] ?? 0
    const b = imageData.data[dataIndex + 2] ?? 0
    const brightness = (r + g + b) / 3
    const distanceFromBackground = getColorDistance({ b, g, r }, background)
    if (distanceFromBackground >= 28 || brightness < 115) {
      mask[pixelIndex] = 1
    }
  }

  return mask
}

async function extractStepPageTextItems(
  page: PdfReadablePage,
  {
    scale,
    viewportHeight,
  }: {
    scale: number
    viewportHeight: number
  },
) {
  if (!page.getTextContent) {
    return []
  }

  const textContent = await page.getTextContent()
  return textContent.items
    .map((item) => getStepPageTextItem(item, { scale, viewportHeight }))
    .filter((item): item is StepPageTextItem => Boolean(item))
}

function getStepPageTextItem(
  item: PdfTextContentItem,
  {
    scale,
    viewportHeight,
  }: {
    scale: number
    viewportHeight: number
  },
): StepPageTextItem | null {
  const text = typeof item.str === "string" ? item.str.trim() : ""
  const transform = item.transform
  if (!text || !Array.isArray(transform)) {
    return null
  }

  const x = getFiniteNumber(transform[4])
  const y = getFiniteNumber(transform[5])
  if (x == null || y == null) {
    return null
  }

  const width = getFiniteNumber(item.width) ?? 0
  const height = getFiniteNumber(item.height) ?? getFiniteNumber(transform[3]) ?? getFiniteNumber(transform[0]) ?? 1
  const boundedHeight = Math.max(1, Math.abs(height))

  return {
    height: boundedHeight * scale,
    text,
    width: Math.max(1, Math.abs(width) * scale),
    x: x * scale,
    y: (viewportHeight - y - boundedHeight) * scale,
  }
}

function sampleCalloutBackground(imageData: DetectionImageData): ColorSample {
  const margin = getCalloutInteriorMargin(imageData)
  const samples: ColorSample[] = []
  const step = Math.max(3, Math.round(Math.min(imageData.width, imageData.height) * 0.025))

  for (let y = margin; y < imageData.height - margin; y += step) {
    for (let x = margin; x < imageData.width - margin; x += step) {
      const dataIndex = ((y * imageData.width) + x) * 4
      const r = imageData.data[dataIndex] ?? 255
      const g = imageData.data[dataIndex + 1] ?? 255
      const b = imageData.data[dataIndex + 2] ?? 255
      const brightness = (r + g + b) / 3
      const chroma = Math.max(r, g, b) - Math.min(r, g, b)
      if (brightness >= 170 && brightness <= 252 && chroma >= 5) {
        samples.push({ b, g, r })
      }
    }
  }

  if (samples.length === 0) {
    return samplePageBackground(imageData)
  }

  return {
    b: median(samples.map((sample) => sample.b)) ?? 235,
    g: median(samples.map((sample) => sample.g)) ?? 240,
    r: median(samples.map((sample) => sample.r)) ?? 220,
  }
}

function getCalloutInteriorMargin(imageData: DetectionImageData) {
  return Math.max(8, Math.round(Math.min(imageData.width, imageData.height) * 0.03))
}

function clearMaskOutsideInterior(mask: Uint8Array, width: number, height: number, margin: number) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x < margin || y < margin || x >= width - margin || y >= height - margin) {
        mask[(y * width) + x] = 0
      }
    }
  }
}

type ProjectionBand = {
  end: number
  start: number
}

function getVerticalProjection(mask: Uint8Array, width: number, height: number) {
  const projection = new Array<number>(height).fill(0)
  for (let y = 0; y < height; y += 1) {
    let count = 0
    for (let x = 0; x < width; x += 1) {
      count += mask[(y * width) + x] ?? 0
    }
    projection[y] = count
  }

  return projection
}

function getHorizontalProjection(mask: Uint8Array, width: number, yBand: ProjectionBand) {
  const projection = new Array<number>(width).fill(0)
  for (let x = 0; x < width; x += 1) {
    let count = 0
    for (let y = yBand.start; y <= yBand.end; y += 1) {
      count += mask[(y * width) + x] ?? 0
    }
    projection[x] = count
  }

  return projection
}

function getProjectionBands(
  projection: readonly number[],
  {
    gapTolerance,
    minCount,
    minSize,
  }: {
    gapTolerance: number
    minCount: number
    minSize: number
  },
) {
  const bands: ProjectionBand[] = []
  let start: number | null = null
  let latestHit: number | null = null

  for (let index = 0; index < projection.length; index += 1) {
    const isHit = (projection[index] ?? 0) >= minCount
    if (isHit) {
      start ??= index
      latestHit = index
      continue
    }

    if (start == null || latestHit == null || index - latestHit <= gapTolerance) {
      continue
    }

    if (latestHit - start + 1 >= minSize) {
      bands.push({ end: latestHit, start })
    }
    start = null
    latestHit = null
  }

  if (start != null && latestHit != null && latestHit - start + 1 >= minSize) {
    bands.push({ end: latestHit, start })
  }

  return bands
}

function trimRegionToForeground(
  mask: Uint8Array,
  width: number,
  height: number,
  region: PixelRegion,
): PixelRegion | null {
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  let count = 0
  const boundedRegion = normalizeRegion(region, width, height)

  for (let y = boundedRegion.y; y < boundedRegion.y + boundedRegion.height; y += 1) {
    for (let x = boundedRegion.x; x < boundedRegion.x + boundedRegion.width; x += 1) {
      if (!mask[(y * width) + x]) {
        continue
      }

      count += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (count === 0) {
    return null
  }

  return normalizeRegion({
    height: maxY - minY + 1,
    width: maxX - minX + 1,
    x: minX,
    y: minY,
  }, width, height)
}

function isLikelyCalloutPartItemRegion(imageData: DetectionImageData, region: PixelRegion) {
  const area = region.width * region.height
  return (
    area >= imageData.width * imageData.height * 0.008 &&
    region.width >= Math.max(18, imageData.width * 0.035) &&
    region.height >= Math.max(20, imageData.height * 0.09) &&
    region.width <= imageData.width * 0.92 &&
    region.height <= imageData.height * 0.82
  )
}

function detectQuantityLabelRegion(imageData: DetectionImageData, itemRegion: PixelRegion): PixelRegion {
  const fallbackRegion = getFallbackQuantityRegion(imageData, itemRegion)
  const searchRegion = normalizeRegion({
    height: Math.max(54, itemRegion.height * 1.8),
    width: itemRegion.width + 8,
    x: itemRegion.x - 4,
    y: itemRegion.y + (itemRegion.height * 0.55),
  }, imageData.width, imageData.height)
  const minComponentHeight = Math.max(5, itemRegion.height * 0.08)
  const components = collectDarkComponents(imageData, searchRegion, isQuantityTextPixel)
    .filter((component) => {
      const centerY = component.y + component.height / 2
      return (
        centerY >= itemRegion.y + itemRegion.height * 0.65 &&
        component.height >= minComponentHeight &&
        component.height <= Math.max(42, itemRegion.height * 0.7) &&
        component.width <= itemRegion.width * 0.95 &&
        component.x + component.width / 2 >= itemRegion.x - 2 &&
        component.x + component.width / 2 <= itemRegion.x + itemRegion.width + 2
      )
    })

  if (components.length === 0) {
    return fallbackRegion
  }

  const candidateRegions = [
    ...getQuantityLabelLineCandidates(components, itemRegion).map((candidate) => candidate.region),
    fallbackRegion,
  ]
  const quantityRegion = selectQuantityLabelLine(imageData, candidateRegions, itemRegion)

  return quantityRegion
    ? normalizeRegion(quantityRegion, imageData.width, imageData.height)
    : fallbackRegion
}

function collectDarkComponents(
  imageData: DetectionImageData,
  region: PixelRegion,
  isMatchingPixel: PixelMatcher = isDarkPixel,
) {
  const boundedRegion = normalizeRegion(region, imageData.width, imageData.height)
  const width = imageData.width
  const visited = new Uint8Array(imageData.width * imageData.height)
  const components: DarkComponent[] = []

  for (let y = boundedRegion.y; y < boundedRegion.y + boundedRegion.height; y += 1) {
    for (let x = boundedRegion.x; x < boundedRegion.x + boundedRegion.width; x += 1) {
      const pixelIndex = (y * width) + x
      if (visited[pixelIndex] || !isMatchingPixel(imageData, x, y)) {
        continue
      }

      components.push(collectDarkComponent(imageData, visited, boundedRegion, pixelIndex, isMatchingPixel))
    }
  }

  return components.filter((component) => component.count >= 4)
}

function getQuantityLabelLineCandidates(components: readonly DarkComponent[], itemRegion: PixelRegion) {
  const lineTolerance = Math.max(6, itemRegion.height * 0.08)
  const lines: DarkComponent[][] = []

  for (const component of [...components].sort((left, right) => getRegionCenterY(left) - getRegionCenterY(right))) {
    const line = lines.find((candidateLine) =>
      Math.abs(getRegionCenterY(candidateLine[0] ?? component) - getRegionCenterY(component)) <= lineTolerance
    )
    if (line) {
      line.push(component)
    } else {
      lines.push([component])
    }
  }

  return lines
    .map((line) => ({
      componentCount: line.length,
      region: unionRegions(line),
    }))
    .filter((candidate): candidate is { componentCount: number; region: PixelRegion } => {
      if (!candidate.region) {
        return false
      }

      const isMultiGlyphLabel = candidate.componentCount >= 2
      const isCompactConnectedLabel = candidate.region.width <= candidate.region.height * 3.2

      return (
        (isMultiGlyphLabel || isCompactConnectedLabel) &&
        candidate.componentCount <= 6 &&
        candidate.region.width >= Math.max(6, itemRegion.width * 0.04) &&
        candidate.region.width <= Math.max(84, itemRegion.width * 0.55) &&
        candidate.region.height <= Math.max(42, itemRegion.height * 0.42)
      )
    })
}

function selectQuantityLabelLine(
  imageData: DetectionImageData,
  candidateRegions: readonly PixelRegion[],
  itemRegion: PixelRegion,
) {
  if (candidateRegions.length === 0) {
    return null
  }

  return candidateRegions
    .map((region) => {
      const normalizedRegion = normalizeRegion(region, imageData.width, imageData.height)
      const readableRegion = expandRegion(normalizedRegion, imageData, 2)
      const quantity = readQuantityFromImageData(imageData, readableRegion)
      const textRegion = trimRegionToQuantityText(imageData, readableRegion)
      const displayRegion = textRegion
        ? normalizeRegion(textRegion, imageData.width, imageData.height)
        : normalizedRegion
      const leftOffsetScore = clamp(
        1 - Math.max(0, displayRegion.x - itemRegion.x) / Math.max(1, itemRegion.width * 0.45),
        0,
        1,
      )
      const lowerDetailPenalty = clamp(
        (displayRegion.y - (itemRegion.y + itemRegion.height * 0.84)) / Math.max(1, itemRegion.height * 0.24),
        0,
        1,
      )
      const compactScore = clamp(
        1 - Math.abs((displayRegion.width / Math.max(1, displayRegion.height)) - 1.8) / 3,
        0,
        1,
      )
      const inkScore = textRegion ? clamp(textRegion.count / Math.max(8, displayRegion.width * 0.9), 0, 1) : 0
      const parseScore = quantity.value ? 5 + quantity.confidence : 0

      return {
        region: displayRegion,
        score: parseScore + leftOffsetScore * 1.15 + compactScore * 0.2 + inkScore * 0.2 - lowerDetailPenalty * 0.9,
      }
    })
    .sort((left, right) =>
      right.score - left.score ||
      left.region.y - right.region.y ||
      left.region.x - right.region.x
    )[0]?.region ?? null
}

function getRegionCenterY(region: PixelRegion) {
  return region.y + (region.height / 2)
}

function getRegionCenterX(region: PixelRegion) {
  return region.x + (region.width / 2)
}

function collectDarkComponent(
  imageData: DetectionImageData,
  visited: Uint8Array,
  bounds: PixelRegion,
  startIndex: number,
  isMatchingPixel: PixelMatcher,
) {
  const stack = [startIndex]
  let count = 0
  let minX = imageData.width
  let minY = imageData.height
  let maxX = 0
  let maxY = 0
  visited[startIndex] = 1

  while (stack.length > 0) {
    const pixelIndex = stack.pop() ?? 0
    const x = pixelIndex % imageData.width
    const y = Math.floor(pixelIndex / imageData.width)
    count += 1
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)

    addDarkNeighbor(imageData, visited, stack, pixelIndex - 1, x > bounds.x, isMatchingPixel)
    addDarkNeighbor(imageData, visited, stack, pixelIndex + 1, x < bounds.x + bounds.width - 1, isMatchingPixel)
    addDarkNeighbor(imageData, visited, stack, pixelIndex - imageData.width, y > bounds.y, isMatchingPixel)
    addDarkNeighbor(imageData, visited, stack, pixelIndex + imageData.width, y < bounds.y + bounds.height - 1, isMatchingPixel)
  }

  return {
    count,
    height: maxY - minY + 1,
    width: maxX - minX + 1,
    x: minX,
    y: minY,
  }
}

function addDarkNeighbor(
  imageData: DetectionImageData,
  visited: Uint8Array,
  stack: number[],
  pixelIndex: number,
  isInBounds: boolean,
  isMatchingPixel: PixelMatcher,
) {
  if (!isInBounds || visited[pixelIndex]) {
    return
  }

  const x = pixelIndex % imageData.width
  const y = Math.floor(pixelIndex / imageData.width)
  if (!isMatchingPixel(imageData, x, y)) {
    return
  }

  visited[pixelIndex] = 1
  stack.push(pixelIndex)
}

function getFallbackQuantityRegion(imageData: DetectionImageData, itemRegion: PixelRegion) {
  return normalizeRegion({
    height: Math.max(16, itemRegion.height * 0.55),
    width: itemRegion.width + 8,
    x: itemRegion.x - 4,
    y: itemRegion.y + itemRegion.height * 0.92,
  }, imageData.width, imageData.height)
}

function getPartImageRegionForItem(
  imageData: DetectionImageData,
  foregroundMask: Uint8Array,
  itemRegion: PixelRegion,
  quantityRegion: PixelRegion,
) {
  const partRegion = trimPartImageRegionToForeground(imageData, foregroundMask, itemRegion, quantityRegion) ??
    getFallbackPartImageRegion(imageData, itemRegion, quantityRegion)

  if (partRegion.height >= Math.max(6, itemRegion.height * 0.12)) {
    return partRegion
  }

  return getFallbackPartImageRegion(imageData, itemRegion, quantityRegion)
}

function getFallbackPartImageRegion(
  imageData: DetectionImageData,
  itemRegion: PixelRegion,
  quantityRegion: PixelRegion,
) {
  const boundedItemRegion = normalizeRegion(itemRegion, imageData.width, imageData.height)
  const partBottom = clamp(
    Math.floor(quantityRegion.y - Math.max(2, quantityRegion.height * 0.08)),
    boundedItemRegion.y + Math.max(6, Math.round(boundedItemRegion.height * 0.18)),
    boundedItemRegion.y + boundedItemRegion.height,
  )

  return normalizeRegion({
    height: partBottom - boundedItemRegion.y,
    width: boundedItemRegion.width,
    x: boundedItemRegion.x,
    y: boundedItemRegion.y,
  }, imageData.width, imageData.height)
}

function trimPartImageRegionToForeground(
  imageData: DetectionImageData,
  foregroundMask: Uint8Array,
  itemRegion: PixelRegion,
  quantityRegion: PixelRegion,
) {
  const boundedItemRegion = normalizeRegion(itemRegion, imageData.width, imageData.height)
  const boundedQuantityRegion = expandRegion(
    quantityRegion,
    imageData,
    Math.max(2, Math.round(quantityRegion.height * 0.35)),
  )
  let minX = imageData.width
  let minY = imageData.height
  let maxX = 0
  let maxY = 0
  let count = 0

  for (let y = boundedItemRegion.y; y < boundedItemRegion.y + boundedItemRegion.height; y += 1) {
    for (let x = boundedItemRegion.x; x < boundedItemRegion.x + boundedItemRegion.width; x += 1) {
      if (!foregroundMask[(y * imageData.width) + x]) {
        continue
      }
      if (isPixelInsideRegion(x, y, boundedQuantityRegion) && isQuantityTextPixel(imageData, x, y)) {
        continue
      }

      count += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (count === 0) {
    return null
  }

  return normalizeRegion({
    height: maxY - minY + 1,
    width: maxX - minX + 1,
    x: minX,
    y: minY,
  }, imageData.width, imageData.height)
}

function isPixelInsideRegion(x: number, y: number, region: PixelRegion) {
  return (
    x >= region.x &&
    x < region.x + region.width &&
    y >= region.y &&
    y < region.y + region.height
  )
}

function scorePartItemRegion(
  imageData: DetectionImageData,
  itemRegion: PixelRegion,
  quantityRegion: PixelRegion,
  partRegion: PixelRegion,
) {
  const sizeScore = clamp((itemRegion.width * itemRegion.height) / Math.max(1, imageData.width * imageData.height * 0.08), 0, 1)
  const quantityScore = clamp(quantityRegion.width / Math.max(1, itemRegion.width * 0.28), 0, 1)
  const partScore = clamp(partRegion.height / Math.max(1, itemRegion.height * 0.6), 0, 1)

  return clamp((sizeScore * 0.25) + (quantityScore * 0.35) + (partScore * 0.4), 0, 1)
}

function suppressOverlappingPartItemRegions(regions: readonly StepCalloutPartItemRegion[]) {
  const selected: StepCalloutPartItemRegion[] = []
  for (const region of [...regions].sort((left, right) => right.confidence - left.confidence)) {
    if (selected.some((existing) => getIntersectionOverUnion(existing.itemRegion, region.itemRegion) > 0.5)) {
      continue
    }

    selected.push(region)
  }

  return selected
}

function sortPartItemRegions(regions: readonly StepCalloutPartItemRegion[]) {
  return [...regions].sort((left, right) => {
    const rowTolerance = Math.max(
      8,
      Math.round(Math.min(left.itemRegion.height, right.itemRegion.height) * 0.25),
    )
    if (
      Math.abs(left.itemRegion.y - right.itemRegion.y) <= rowTolerance ||
      getVerticalOverlapRatio(left.itemRegion, right.itemRegion) >= 0.45
    ) {
      return left.itemRegion.x - right.itemRegion.x
    }

    return left.itemRegion.y - right.itemRegion.y || left.itemRegion.x - right.itemRegion.x
  })
}

function getVerticalOverlapRatio(left: PixelRegion, right: PixelRegion) {
  const overlap = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y))

  return overlap / Math.max(1, Math.min(left.height, right.height))
}

function unionRegions(regions: readonly PixelRegion[]) {
  if (regions.length === 0) {
    return null
  }

  const minX = Math.min(...regions.map((region) => region.x))
  const minY = Math.min(...regions.map((region) => region.y))
  const maxX = Math.max(...regions.map((region) => region.x + region.width))
  const maxY = Math.max(...regions.map((region) => region.y + region.height))

  return {
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY,
  }
}

function toPageSourceRegion(region: PixelRegion, pageOffsetX: number, pageOffsetY: number): StepCalloutSourceRegion {
  return {
    height: region.height,
    unit: "step_pixel",
    width: region.width,
    x: pageOffsetX + region.x,
    y: pageOffsetY + region.y,
  }
}

function toLocalPixelRegion(region: StepCalloutSourceRegion, pageOffsetX: number, pageOffsetY: number): PixelRegion {
  return {
    height: region.height,
    width: region.width,
    x: region.x - pageOffsetX,
    y: region.y - pageOffsetY,
  }
}

function cropCanvasRegion(canvas: HTMLCanvasElement, region: PixelRegion) {
  return createCanvasCrop(cropCanvasRegionToCanvas(canvas, region))
}

function cropCanvasRegionRemovingBackground(
  canvas: HTMLCanvasElement,
  imageData: DetectionImageData,
  region: PixelRegion,
  background: ColorSample,
) {
  const boundedRegion = normalizeRegion(region, imageData.width, imageData.height)
  const cropCanvas = globalThis.document.createElement("canvas")
  cropCanvas.width = boundedRegion.width
  cropCanvas.height = boundedRegion.height
  const context = cropCanvas.getContext("2d", { willReadFrequently: true })
  if (!context) {
    return cropCanvasRegion(canvas, boundedRegion)
  }

  const output = context.createImageData(boundedRegion.width, boundedRegion.height)
  let copiedPixelCount = 0

  for (let y = 0; y < boundedRegion.height; y += 1) {
    for (let x = 0; x < boundedRegion.width; x += 1) {
      const sourceX = boundedRegion.x + x
      const sourceY = boundedRegion.y + y
      const sourceIndex = ((sourceY * imageData.width) + sourceX) * 4
      const alpha = imageData.data[sourceIndex + 3] ?? 255
      if (alpha < 32) {
        continue
      }

      const color = {
        b: imageData.data[sourceIndex + 2] ?? 0,
        g: imageData.data[sourceIndex + 1] ?? 0,
        r: imageData.data[sourceIndex] ?? 0,
      }
      if (!isCalloutItemPreviewForegroundPixel(color, background)) {
        continue
      }

      const targetIndex = ((y * boundedRegion.width) + x) * 4
      output.data[targetIndex] = color.r
      output.data[targetIndex + 1] = color.g
      output.data[targetIndex + 2] = color.b
      output.data[targetIndex + 3] = alpha
      copiedPixelCount += 1
    }
  }

  if (copiedPixelCount < 4) {
    return cropCanvasRegion(canvas, boundedRegion)
  }

  context.putImageData(output, 0, 0)

  return createCanvasCrop(cropCanvas)
}

function isCalloutItemPreviewForegroundPixel(color: ColorSample, background: ColorSample) {
  const brightness = getColorBrightness(color)
  const chroma = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b)
  const distanceFromBackground = getColorDistance(color, background)

  return distanceFromBackground >= 28 || brightness < 128 || (chroma >= 28 && distanceFromBackground >= 18)
}

function cropCanvasRegionToCanvas(canvas: HTMLCanvasElement, region: PixelRegion) {
  const cropCanvas = globalThis.document.createElement("canvas")
  cropCanvas.width = region.width
  cropCanvas.height = region.height
  const context = cropCanvas.getContext("2d")
  context?.drawImage(canvas, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height)

  return cropCanvas
}

function createCanvasCrop(canvas: HTMLCanvasElement) {
  return {
    dataUrl: canvas.toDataURL("image/png"),
    height: canvas.height,
    width: canvas.width,
  }
}

function isPointInsideAnyRegion(x: number, y: number, regions: readonly PixelRegion[]) {
  return regions.some((region) =>
    x >= region.x &&
      x < region.x + region.width &&
      y >= region.y &&
      y < region.y + region.height
  )
}

function padRegion(region: PixelRegion, imageWidth: number, imageHeight: number, padding: number) {
  return normalizeRegion({
    height: region.height + (padding * 2),
    width: region.width + (padding * 2),
    x: region.x - padding,
    y: region.y - padding,
  }, imageWidth, imageHeight)
}

function padPartRegion(
  partRegion: PixelRegion,
  imageWidth: number,
  imageHeight: number,
  padding: number,
) {
  const x = partRegion.x - padding
  const y = partRegion.y - padding
  const right = partRegion.x + partRegion.width + padding
  const bottom = partRegion.y + partRegion.height + padding

  return normalizeRegion({
    height: bottom - y,
    width: right - x,
    x,
    y,
  }, imageWidth, imageHeight)
}

function expandRegion(region: PixelRegion, imageData: DetectionImageData, padding: number) {
  return normalizeRegion({
    height: region.height + (padding * 2),
    width: region.width + (padding * 2),
    x: region.x - padding,
    y: region.y - padding,
  }, imageData.width, imageData.height)
}

function normalizeRegion(region: PixelRegion, imageWidth: number, imageHeight: number): PixelRegion {
  const x = Math.max(0, Math.floor(region.x))
  const y = Math.max(0, Math.floor(region.y))
  const right = Math.min(imageWidth, Math.ceil(region.x + region.width))
  const bottom = Math.min(imageHeight, Math.ceil(region.y + region.height))

  return {
    height: Math.max(1, bottom - y),
    width: Math.max(1, right - x),
    x,
    y,
  }
}

function getColorDistance(left: ColorSample, right: ColorSample) {
  return Math.sqrt(
    ((left.r - right.r) ** 2) +
    ((left.g - right.g) ** 2) +
    ((left.b - right.b) ** 2),
  )
}

function median(values: readonly number[]) {
  const sortedValues = [...values].filter(Number.isFinite).sort((left, right) => left - right)
  if (sortedValues.length === 0) {
    return null
  }

  return sortedValues[Math.floor(sortedValues.length / 2)] ?? null
}

function getFiniteNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function getStepCalloutProgress(pageIndex: number, pageCount: number, withinPageProgress: number) {
  if (pageCount === 0) {
    return 100
  }

  return Math.min(98, Math.round(10 + (((pageIndex + withinPageProgress) / pageCount) * 85)))
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function assertStepCalloutDetectionCanContinue(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new StepCalloutDetectionCancelledError()
  }
}

export class StepCalloutDetectionCancelledError extends Error {
  constructor() {
    super("Step callout detection was cancelled.")
    this.name = "StepCalloutDetectionCancelledError"
  }
}
