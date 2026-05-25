import type { PartsListColor } from "./parts-list-extraction"
import type { PdfReadableDocument, PdfReadablePage, PdfTextContentItem } from "./pdf-intake"

export const stepCalloutDetectorVersion = "step-callout-detection-v118"
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
const stepCalloutProgressMinDelta = 1
const stepCalloutProgressMinIntervalMs = 200

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

export type DetectedStepNumberLabel = {
  confidence: number
  crop: {
    dataUrl: string
    height: number
    width: number
  }
  id: string
  indexOnPage: number
  pageNumber: number
  rawValue?: number
  sourceRegion: StepCalloutSourceRegion
  value: number
  valueSource: "ocr" | "sequence"
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
  stepLabel?: DetectedStepNumberLabel | null
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
  stepLabels?: DetectedStepNumberLabel[]
  timings?: StepCalloutDetectionTimings
}

export type StepCalloutDetectionPageTiming = {
  calloutCount: number
  calloutExtractionMs: number
  pageLoadMs: number
  pageNumber: number
  regionDetectionMs: number
  renderMs: number
  stepLabelCount: number
  stepLabelDetectionMs: number
  textLayerMs: number
  totalMs: number
}

export type StepCalloutDetectionTimings = {
  averagePageMs: number | null
  bomMatchMs: number
  calloutExtractionMs: number
  localImageMatchMs: number
  pageLoadMs: number
  pageScanMs: number
  pages: StepCalloutDetectionPageTiming[]
  regionDetectionMs: number
  renderMs: number
  stepLabelDetectionMs: number
  textLayerMs: number
  totalMs: number
}

export type StepCalloutDetectionProgress = {
  averagePageMs?: number | null
  currentPage: number | null
  currentPageElapsedMs?: number
  detectedCalloutCount: number
  elapsedMs?: number
  estimatedRemainingMs?: number | null
  lastPageTiming?: StepCalloutDetectionPageTiming
  message: string
  pageCount: number
  progress: number
  scannedPageCount: number
  targetPageCount: number
}

export type StepCalloutDetectionOptions = {
  colors?: readonly PartsListColor[]
  excludedPageNumbers?: ReadonlySet<number> | readonly number[]
  inventoryRows?: readonly StepCalloutInventoryMatchRow[]
  maxPages?: number | null
  onProgress?: (progress: StepCalloutDetectionProgress) => void
  renderMaxWidth?: number
  signal?: AbortSignal
  useNativeTextLayer?: boolean
  useStepNumberLabels?: boolean
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

type StepPartColorPaletteEntry = {
  id?: string
  isTransparent?: boolean
  name: string
  rgb: ColorSample
}

type StepPartColorCandidateScore = {
  color: StepPartColorPaletteEntry
  distanceScore: number
  score: number
}

type StepPartColorSampleStats = {
  chroma: number
  highRgb: ColorSample
  lowRgb: ColorSample
  meanRgb: ColorSample
  sampleCount: number
  totalWeight: number
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

type DarkComponent = PixelRegion & { count: number; pixels?: number[] }

type RegionCandidate = PixelRegion & {
  borderScore: number
  confidence: number
  fillRatio: number
}

type StepCalloutPartItemRegion = {
  confidence: number
  itemRegion: PixelRegion
  partRegion: PixelRegion
  quantity: QuantityEstimate
  quantityRegion: PixelRegion
}

type StepCalloutPartItemFeatureEntry = {
  calloutIndex: number
  feature: StepPartImageFeature | null
  itemId: string
  stepIndex: number
}

type OwnedPartContentForeground = {
  componentRegions: PixelRegion[]
  foregroundMask: Uint8Array
  region: PixelRegion
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

type QuantityLabelCandidate = {
  componentCount: number
  region: PixelRegion
}

type QuantityLabelAnchor = QuantityLabelCandidate & {
  maxBackgroundForegroundRatio: number
  quantity: QuantityEstimate
  score: number
}

type QuantityLabelAnchorZone = {
  anchor: QuantityLabelAnchor
  region: PixelRegion
}

type QuantityAnchorPartRegionResult = {
  expandedPartRegion?: PixelRegion
  ownedPartRegion?: PixelRegion
  partRegion: PixelRegion | null
  rawPartRegion?: PixelRegion
  reason?: string
  searchRegion?: PixelRegion
}

type StepNumberLabel = {
  confidence: number
  rawValue?: number
  region: PixelRegion
  value: number
  valueSource?: "ocr" | "sequence"
}

type StepAnchoredCalloutRegion = {
  region: RegionCandidate
  stepLabel?: StepNumberLabel
  stepIndex: number
}

type HorizontalBorderSegment = PixelRegion & {
  darkRatio: number
}

export async function detectStepCalloutsFromPdfDocument(
  document: PdfReadableDocument,
  {
    colors,
    excludedPageNumbers = [],
    inventoryRows = [],
    maxPages = defaultStepCalloutPageLimit,
    onProgress,
    renderMaxWidth = defaultRenderMaxWidth,
    signal,
    useNativeTextLayer = false,
    useStepNumberLabels = false,
  }: StepCalloutDetectionOptions = {},
): Promise<StepCalloutDetectionResult> {
  const detectionStartedAt = getNowMs()
  const excludedPages = new Set(excludedPageNumbers)
  const pageNumbers = getInitialStepCalloutPageNumbers(document.numPages, excludedPages, maxPages)
  const colorPalette = createStepPartColorPalette(colors)
  const callouts: DetectedStepCallout[] = []
  const partFeatureEntries: StepCalloutPartItemFeatureEntry[] = []
  const pageTimings: StepCalloutDetectionPageTiming[] = []
  const publishProgress = createStepCalloutProgressPublisher(onProgress)
  const stepLabels: DetectedStepNumberLabel[] = []
  let nextFallbackStepIndex = 1
  let localImageMatchMs = 0
  let bomMatchMs = 0

  publishProgress({
    currentPage: null,
    detectedCalloutCount: 0,
    elapsedMs: 0,
    estimatedRemainingMs: null,
    message: `Preparing step callout scan for ${pageNumbers.length} pages.`,
    pageCount: document.numPages,
    progress: pageNumbers.length === 0 ? 100 : 5,
    scannedPageCount: 0,
    targetPageCount: pageNumbers.length,
  }, { force: true })

  if (!document.getPage || typeof globalThis.document === "undefined") {
    return createStepCalloutDetectionResult({
      callouts,
      document,
      excludedPages,
      maxPages,
      pageNumbers,
      stepLabels,
      timings: createStepCalloutDetectionTimings({
        bomMatchMs,
        detectionStartedAt,
        localImageMatchMs,
        pageTimings,
      }),
    })
  }

  for (const [pageIndex, pageNumber] of pageNumbers.entries()) {
    assertStepCalloutDetectionCanContinue(signal)
    const pageStartedAt = getNowMs()
    const pageTiming = createEmptyStepCalloutDetectionPageTiming(pageNumber)

    publishProgress({
      currentPage: pageNumber,
      currentPageElapsedMs: 0,
      detectedCalloutCount: callouts.length,
      ...createStepCalloutProgressTimingFields({
        detectionStartedAt,
        pageTimings,
        scannedPageCount: pageIndex,
        targetPageCount: pageNumbers.length,
      }),
      message: `Scanning page ${pageNumber} for step callouts.`,
      pageCount: document.numPages,
      progress: getStepCalloutProgress(pageIndex, pageNumbers.length, 0.15),
      scannedPageCount: pageIndex,
      targetPageCount: pageNumbers.length,
    })

    let page: PdfReadablePage | null = null
    try {
      const pageLoadStartedAt = getNowMs()
      page = await document.getPage!(pageNumber)
      pageTiming.pageLoadMs += getElapsedMs(pageLoadStartedAt)

      try {
        const renderStartedAt = getNowMs()
        const renderedPage = await renderPdfPageForStepCallouts(page, { renderMaxWidth, signal })
        pageTiming.renderMs += getElapsedMs(renderStartedAt)
        if (renderedPage) {
          const regionDetectionStartedAt = getNowMs()
          const fillRegions = detectStepCalloutRegionsFromImageData(renderedPage.imageData)
          pageTiming.regionDetectionMs += getElapsedMs(regionDetectionStartedAt)

          let regions = mergeStepCalloutRegionCandidates(fillRegions)
          let stepNumberLabels: StepNumberLabel[] = []
          if (useStepNumberLabels) {
            const stepLabelDetectionStartedAt = getNowMs()
            const rawStepNumberLabels = detectStepNumberLabelsFromImageData(renderedPage.imageData)
            const candidateStepNumberLabels = selectSequenceStepNumberLabels(
              stabilizeConsecutiveStepNumberLabelRun(
                normalizeStepNumberLabelsForSequence(
                  rejectStepNumberLabelsInsideCalloutRegions(rawStepNumberLabels, fillRegions, renderedPage.imageData),
                  nextFallbackStepIndex,
                ),
                nextFallbackStepIndex,
              ),
              nextFallbackStepIndex,
            )
            const labelRegions = detectStepLabelAnchoredCalloutRegionsFromImageData(
              renderedPage.imageData,
              candidateStepNumberLabels,
              fillRegions,
            )
            regions = mergeStepCalloutRegionCandidates([...fillRegions, ...labelRegions])
            stepNumberLabels = selectSequenceStepNumberLabels(
              stabilizeConsecutiveStepNumberLabelRun(
                normalizeStepNumberLabelsForSequence(
                  rejectStepNumberLabelsInsideCalloutRegions(rawStepNumberLabels, regions, renderedPage.imageData),
                  nextFallbackStepIndex,
                ),
                nextFallbackStepIndex,
              ),
              nextFallbackStepIndex,
            )
            pageTiming.stepLabelDetectionMs += getElapsedMs(stepLabelDetectionStartedAt)
          }

          const textLayerStartedAt = getNowMs()
          const nativeTextItems = useNativeTextLayer
            ? await extractStepPageTextItems(page, {
                scale: renderedPage.scale,
                viewportHeight: renderedPage.viewportHeight,
              })
            : []
          pageTiming.textLayerMs += getElapsedMs(textLayerStartedAt)

          const calloutExtractionStartedAt = getNowMs()
          const detectedStepLabelBySource = new Map<StepNumberLabel, DetectedStepNumberLabel>()
          const pageStepLabels = stepNumberLabels.map((label, labelIndex) => {
            const detectedLabel = createDetectedStepNumberLabel(renderedPage.canvas, pageNumber, label, labelIndex + 1)
            detectedStepLabelBySource.set(label, detectedLabel)
            return detectedLabel
          })
          stepLabels.push(...pageStepLabels)
          pageTiming.stepLabelCount = pageStepLabels.length
          const anchoredRegions = assignCalloutRegionsFromStepNumberLabels(
            regions,
            stepNumberLabels,
            nextFallbackStepIndex,
          )
          const unavailablePageStepIndexes = new Set(stepNumberLabels.map((label) => label.value))
          let nextPageFallbackStepIndex = nextFallbackStepIndex
          const pageCallouts: DetectedStepCallout[] = []
          for (const [index, { region, stepIndex: anchoredStepIndex, stepLabel }] of anchoredRegions.entries()) {
            let stepIndex = anchoredStepIndex
            if (!stepLabel) {
              while (unavailablePageStepIndexes.has(nextPageFallbackStepIndex)) {
                nextPageFallbackStepIndex += 1
              }
              stepIndex = nextPageFallbackStepIndex
            }
            const paddedRegion = padRegion(region, renderedPage.canvas.width, renderedPage.canvas.height, cropPaddingPixels)
            const calloutCanvas = cropCanvasRegionToCanvas(renderedPage.canvas, paddedRegion)
            const calloutCrop = createCanvasCrop(calloutCanvas)
            const calloutIndex = callouts.length + pageCallouts.length
            const partItems = detectStepCalloutPartItemsFromCanvas(calloutCanvas, {
              calloutIdPrefix: `step-callout:p${pageNumber}:r${index + 1}`,
              calloutIndex,
              colorPalette,
              nativeTextItems,
              pageOffsetX: paddedRegion.x,
              pageOffsetY: paddedRegion.y,
              partFeatureEntries,
              stepIndex,
            })

            if (partItems.length === 0) {
              continue
            }

            const indexOnPage = pageCallouts.length + 1
            if (!stepLabel) {
              unavailablePageStepIndexes.add(stepIndex)
              nextPageFallbackStepIndex = stepIndex + 1
            }

            pageCallouts.push({
              confidence: region.confidence,
              crop: calloutCrop,
              id: `step-callout:p${pageNumber}:r${indexOnPage}:x${paddedRegion.x}:y${paddedRegion.y}:w${paddedRegion.width}:h${paddedRegion.height}`,
              indexOnPage,
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
              stepLabel: stepLabel ? detectedStepLabelBySource.get(stepLabel) ?? null : null,
            })
          }
          pageTiming.calloutExtractionMs += getElapsedMs(calloutExtractionStartedAt)
          pageTiming.calloutCount = pageCallouts.length
          callouts.push(...pageCallouts)
          nextFallbackStepIndex = getNextFallbackStepIndex(nextFallbackStepIndex, stepNumberLabels, pageCallouts)
        }
      } finally {
        page.cleanup?.()
      }
    } finally {
      pageTiming.totalMs = getElapsedMs(pageStartedAt)
      pageTimings.push(roundStepCalloutDetectionPageTiming(pageTiming))
    }

    const lastPageTiming = pageTimings.at(-1)
    publishProgress({
      currentPage: pageNumber,
      currentPageElapsedMs: lastPageTiming?.totalMs,
      detectedCalloutCount: callouts.length,
      lastPageTiming,
      ...createStepCalloutProgressTimingFields({
        detectionStartedAt,
        pageTimings,
        scannedPageCount: pageIndex + 1,
        targetPageCount: pageNumbers.length,
      }),
      message: `Finished page ${pageNumber}; ${callouts.length} step callouts detected so far.`,
      pageCount: document.numPages,
      progress: getStepCalloutProgress(pageIndex + 1, pageNumbers.length, 1),
      scannedPageCount: pageIndex + 1,
      targetPageCount: pageNumbers.length,
    }, { force: pageIndex === pageNumbers.length - 1 })

    if (pageIndex < pageNumbers.length - 1) {
      await yieldStepCalloutPageScan(signal)
    }
  }

  const localImageMatchStartedAt = getNowMs()
  const groupedCallouts = groupStepCalloutPartItemsByLocalImageMatch(callouts, partFeatureEntries)
  localImageMatchMs += getElapsedMs(localImageMatchStartedAt)
  const bomMatchStartedAt = getNowMs()
  const inventoryMatchedCallouts = await matchStepCalloutPartItemsToBomRows(document, groupedCallouts, partFeatureEntries, {
    inventoryRows,
    signal,
  })
  bomMatchMs += getElapsedMs(bomMatchStartedAt)

  return createStepCalloutDetectionResult({
    callouts: inventoryMatchedCallouts,
    document,
    excludedPages,
    maxPages,
    pageNumbers,
    stepLabels,
    timings: createStepCalloutDetectionTimings({
      bomMatchMs,
      detectionStartedAt,
      localImageMatchMs,
      pageTimings,
    }),
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
  const nativeCandidates = detectNativeStepCalloutRegionsFromImageData(imageData)
  const scaledCandidates = detectDownscaledStepCalloutRegionsFromImageData(imageData)

  return suppressOverlappingCandidates([...nativeCandidates, ...scaledCandidates])
    .filter((candidate) => !isImplausiblyWideShallowStepCalloutRegion(imageData, candidate))
    .sort((left, right) => left.y - right.y || left.x - right.x)
}

function detectNativeStepCalloutRegionsFromImageData(imageData: DetectionImageData): RegionCandidate[] {
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

  const smallBorderedCandidates = detectSmallBorderedStepCalloutRegionsFromImageData(imageData)

  return suppressOverlappingCandidates([...candidates, ...smallBorderedCandidates])
    .sort((left, right) => left.y - right.y || left.x - right.x)
}

function detectDownscaledStepCalloutRegionsFromImageData(imageData: DetectionImageData): RegionCandidate[] {
  const targetWidth = 450
  if (imageData.width <= targetWidth * 1.45) {
    return []
  }

  const scale = targetWidth / imageData.width
  const downscaledImageData = downscaleDetectionImageData(imageData, scale)
  const downscaledCandidates = detectNativeStepCalloutRegionsFromImageData(downscaledImageData)
  const standardMinWidth = getMinimumStepCalloutRegionWidth(imageData)
  const standardMinHeight = getMinimumStepCalloutRegionHeight(imageData)

  return downscaledCandidates
    .map((candidate) => createDownscaledStepCalloutRegionCandidate(imageData, candidate, scale))
    .filter((candidate): candidate is RegionCandidate => Boolean(candidate))
    .filter((candidate) => candidate.width < standardMinWidth || candidate.height < standardMinHeight)
}

function downscaleDetectionImageData(imageData: DetectionImageData, scale: number): DetectionImageData {
  const width = Math.max(1, Math.round(imageData.width * scale))
  const height = Math.max(1, Math.round(imageData.height * scale))
  const data = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    const sourceYStart = Math.max(0, Math.floor(y / scale))
    const sourceYEnd = Math.min(imageData.height, Math.max(sourceYStart + 1, Math.ceil((y + 1) / scale)))

    for (let x = 0; x < width; x += 1) {
      const sourceXStart = Math.max(0, Math.floor(x / scale))
      const sourceXEnd = Math.min(imageData.width, Math.max(sourceXStart + 1, Math.ceil((x + 1) / scale)))
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let count = 0

      for (let sourceY = sourceYStart; sourceY < sourceYEnd; sourceY += 1) {
        for (let sourceX = sourceXStart; sourceX < sourceXEnd; sourceX += 1) {
          const sourceIndex = ((sourceY * imageData.width) + sourceX) * 4
          r += imageData.data[sourceIndex] ?? 0
          g += imageData.data[sourceIndex + 1] ?? 0
          b += imageData.data[sourceIndex + 2] ?? 0
          a += imageData.data[sourceIndex + 3] ?? 255
          count += 1
        }
      }

      const targetIndex = ((y * width) + x) * 4
      data[targetIndex] = Math.round(r / Math.max(1, count))
      data[targetIndex + 1] = Math.round(g / Math.max(1, count))
      data[targetIndex + 2] = Math.round(b / Math.max(1, count))
      data[targetIndex + 3] = Math.round(a / Math.max(1, count))
    }
  }

  return { data, height, width }
}

function createDownscaledStepCalloutRegionCandidate(
  imageData: DetectionImageData,
  downscaledCandidate: RegionCandidate,
  scale: number,
): RegionCandidate | null {
  const minWidth = getMinimumSmallStepCalloutRegionWidth(imageData)
  const minHeight = getMinimumSmallStepCalloutRegionHeight(imageData)
  const standardMinWidth = getMinimumStepCalloutRegionWidth(imageData)
  const standardMinHeight = getMinimumStepCalloutRegionHeight(imageData)
  const maxWidth = Math.max(standardMinWidth * 1.35, minWidth * 3.2)
  const maxHeight = Math.max(standardMinHeight * 1.35, minHeight * 3.2)
  const rawRegion = normalizeRegion({
    height: Math.ceil(downscaledCandidate.height / scale) + 4,
    width: Math.ceil(downscaledCandidate.width / scale) + 4,
    x: Math.floor(downscaledCandidate.x / scale) - 2,
    y: Math.floor(downscaledCandidate.y / scale) - 2,
  }, imageData.width, imageData.height)
  const searchRadius = Math.max(3, Math.round(Math.min(imageData.width, imageData.height) * 0.005))
  const region = snapRegionToDarkBorder(imageData, rawRegion, searchRadius)
  const isSmallRegion = region.width < standardMinWidth || region.height < standardMinHeight

  if (
    !isSmallRegion ||
    region.width < minWidth ||
    region.height < minHeight ||
    region.width > maxWidth ||
    region.height > maxHeight
  ) {
    return null
  }

  const borderScore = getRegionBorderScore(imageData, region, isSoftStepCalloutBorderPixel)
  const fillRatio = getCalloutInteriorFillEvidenceRatio(imageData, region)
  if (!hasSmallStepCalloutBlueFillEvidence(imageData, region)) {
    return null
  }
  if (borderScore < 0.26 || fillRatio < 0.1 || !hasSmallStepCalloutAcceptanceEvidence(imageData, region)) {
    return null
  }

  return {
    ...region,
    borderScore,
    confidence: clamp(0.16 + (downscaledCandidate.confidence * 0.18) + (fillRatio * 0.22) + (borderScore * 0.44), 0, 1),
    fillRatio,
  }
}

function detectSmallBorderedStepCalloutRegionsFromImageData(imageData: DetectionImageData): RegionCandidate[] {
  const minWidth = getMinimumSmallStepCalloutRegionWidth(imageData)
  const minHeight = getMinimumSmallStepCalloutRegionHeight(imageData)
  const standardMinWidth = getMinimumStepCalloutRegionWidth(imageData)
  const standardMinHeight = getMinimumStepCalloutRegionHeight(imageData)
  const maxWidth = Math.max(standardMinWidth * 1.35, minWidth * 3.2)
  const maxHeight = Math.max(standardMinHeight * 1.35, minHeight * 3.2)
  const segments = collectHorizontalBorderSegments(
    imageData,
    Math.max(14, Math.round(minWidth * 0.68)),
    {
      minDarkRatio: 0.52,
      pixelMatcher: isSoftStepCalloutBorderPixel,
    },
  )
    .filter((segment) => segment.width >= minWidth && segment.width <= maxWidth)
  const candidates: RegionCandidate[] = []

  for (let topIndex = 0; topIndex < segments.length; topIndex += 1) {
    const topSegment = segments[topIndex]
    if (!topSegment) {
      continue
    }

    for (let bottomIndex = topIndex + 1; bottomIndex < segments.length; bottomIndex += 1) {
      const bottomSegment = segments[bottomIndex]
      if (!bottomSegment) {
        continue
      }

      const height = bottomSegment.y - topSegment.y + bottomSegment.height
      if (height > maxHeight) {
        break
      }
      if (height < minHeight || getHorizontalOverlapRatio(topSegment, bottomSegment) < 0.72) {
        continue
      }

      const rawRegion = createRegionFromBorderSegments(topSegment, bottomSegment, imageData)
      const candidate = createSmallBorderedStepCalloutRegionCandidate(imageData, rawRegion, maxWidth, maxHeight)
      if (candidate) {
        candidates.push(candidate)
      }
    }
  }

  return mergeStackedSmallBorderedRegionFragments(imageData, candidates, maxWidth, maxHeight)
    .filter((candidate) => hasSmallStepCalloutPartItemRegionEvidence(imageData, candidate))
}

function mergeStackedSmallBorderedRegionFragments(
  imageData: DetectionImageData,
  candidates: readonly RegionCandidate[],
  maxWidth: number,
  maxHeight: number,
) {
  const merged: RegionCandidate[] = []

  for (const candidate of [...candidates].sort((left, right) => left.y - right.y || left.x - right.x)) {
    const previous = merged.at(-1)
    if (!previous || !areStackedSmallBorderedRegionFragments(previous, candidate)) {
      merged.push(candidate)
      continue
    }

    const mergedCandidate = createMergedStackedSmallBorderedRegionCandidate(
      imageData,
      previous,
      candidate,
      maxWidth,
      maxHeight,
    )

    merged[merged.length - 1] = mergedCandidate ?? (
      isBetterDuplicateRegionCandidate(candidate, previous) ? candidate : previous
    )
  }

  return merged
}

function createMergedStackedSmallBorderedRegionCandidate(
  imageData: DetectionImageData,
  first: RegionCandidate,
  second: RegionCandidate,
  maxWidth: number,
  maxHeight: number,
): RegionCandidate | null {
  const region = unionRegions([first, second])
  if (!region || region.width > maxWidth || region.height > maxHeight) {
    return null
  }

  const fillRatio = getCalloutInteriorFillEvidenceRatio(imageData, region)
  if (fillRatio < 0.12) {
    return null
  }

  return {
    ...region,
    borderScore: Math.max(first.borderScore, second.borderScore),
    confidence: Math.max(first.confidence, second.confidence),
    fillRatio,
  }
}

function areStackedSmallBorderedRegionFragments(left: PixelRegion, right: PixelRegion) {
  if (getHorizontalOverlapRatio(left, right) < 0.82) {
    return false
  }

  const verticalGap = Math.max(0, Math.max(left.y, right.y) - Math.min(left.y + left.height, right.y + right.height))

  return verticalGap <= Math.max(3, Math.round(Math.min(left.height, right.height) * 0.24))
}

function detectStepLabelAnchoredCalloutRegionsFromImageData(
  imageData: DetectionImageData,
  stepNumberLabels: readonly StepNumberLabel[],
  existingRegions: readonly RegionCandidate[] = [],
) {
  const labelsNeedingAnchoredSearch = stepNumberLabels.filter((label) =>
    !existingRegions.some((region) => getStepNumberLabelCalloutScore(label, region) <= 1.15)
  )
  if (labelsNeedingAnchoredSearch.length === 0) {
    return []
  }

  const minWidth = getMinimumStepLabelAnchoredCalloutRegionWidth(imageData)
  const horizontalSegments = collectHorizontalBorderSegments(imageData, minWidth)
  const candidates = labelsNeedingAnchoredSearch.flatMap((label) =>
    createStepLabelAnchoredCalloutRegionCandidates(imageData, label, horizontalSegments)
  )

  return suppressOverlappingCandidates(candidates)
    .sort((left, right) => left.y - right.y || left.x - right.x)
}

function mergeStepCalloutRegionCandidates(candidates: readonly RegionCandidate[]) {
  return suppressOverlappingCandidates(candidates)
    .sort((left, right) => left.y - right.y || left.x - right.x)
}

function detectStepNumberLabelsFromImageData(
  imageData: DetectionImageData,
  calloutRegions: readonly PixelRegion[] = [],
): StepNumberLabel[] {
  const pageRegion = {
    height: imageData.height,
    width: imageData.width,
    x: 0,
    y: 0,
  }
  const excludedRegions = calloutRegions.map((region) =>
    padRegion(region, imageData.width, imageData.height, 4)
  )
  const digitComponents = collectStepNumberTextComponents(imageData, pageRegion, excludedRegions)
    .filter((component) => isLikelyStepNumberDigitComponent(imageData, component))
    .map((component) => ({
      classification: classifyStepNumberGlyph(imageData, component),
      component,
    }))
    .filter((entry): entry is { classification: QuantityGlyphClassification; component: DarkComponent } => {
      const classification = entry.classification
      if (!classification) {
        return false
      }

      return classification.char !== "x" && classification.confidence >= 0.52
    })
    .sort((left, right) =>
      getRegionCenterY(left.component) - getRegionCenterY(right.component) ||
      left.component.x - right.component.x
    )

  if (digitComponents.length === 0) {
    return []
  }

  const medianHeight = median(digitComponents.map((entry) => entry.component.height)) ?? 48
  const lineTolerance = Math.max(16, Math.round(medianHeight * 0.36))
  const lines: Array<typeof digitComponents> = []
  for (const digit of digitComponents) {
    const line = lines.find((candidateLine) =>
      Math.abs(getRegionCenterY(candidateLine[0]?.component ?? digit.component) - getRegionCenterY(digit.component)) <=
        lineTolerance
    )
    if (line) {
      line.push(digit)
    } else {
      lines.push([digit])
    }
  }

  const labels: StepNumberLabel[] = []
  for (const line of lines) {
    const sortedLine = [...line].sort((left, right) => left.component.x - right.component.x)
    const maxDigitGap = Math.max(14, Math.round(medianHeight * 0.32))
    let group: typeof sortedLine = []
    for (const digit of sortedLine) {
      const previous = group.at(-1)
      if (previous && digit.component.x - (previous.component.x + previous.component.width) > maxDigitGap) {
        addStepNumberLabel(labels, group)
        group = []
      }
      group.push(digit)
    }
    addStepNumberLabel(labels, group)
  }

  return suppressOverlappingStepNumberLabels(labels)
    .sort((left, right) => left.region.y - right.region.y || left.region.x - right.region.x)
}

export function debugDetectStepNumberLabelsFromImageData(
  imageData: DetectionImageData,
  calloutRegions: readonly PixelRegion[] = [],
) {
  return detectStepNumberLabelsFromImageData(imageData, calloutRegions)
}

export function debugDetectStepNumberGlyphsFromImageData(
  imageData: DetectionImageData,
  calloutRegions: readonly PixelRegion[] = [],
) {
  const pageRegion = {
    height: imageData.height,
    width: imageData.width,
    x: 0,
    y: 0,
  }
  const excludedRegions = calloutRegions.map((region) =>
    padRegion(region, imageData.width, imageData.height, 4)
  )

  return collectStepNumberTextComponents(imageData, pageRegion, excludedRegions)
    .filter((component) => isLikelyStepNumberDigitComponent(imageData, component))
    .map((component) => {
      const densities = getQuantityGlyphDensities(imageData, component)
      const templateScores = quantityGlyphTemplates
        .filter((template) => template.char !== "x")
        .map((template) => ({
          char: template.char,
          confidence: scoreQuantityGlyphTemplate(densities, template.pattern),
        }))
        .sort((left, right) => right.confidence - left.confidence)

      return {
        aspectRatio: component.width / Math.max(1, component.height),
        classification: classifyStepNumberGlyph(imageData, component),
        component,
        densities,
        templateScores,
      }
    })
}

export function debugClassifyStepNumberGlyphDensities(
  densities: readonly number[],
  aspectRatio: number,
) {
  return classifyStepNumberGlyphDensities(densities, aspectRatio)
}

function addStepNumberLabel(
  labels: StepNumberLabel[],
  digits: Array<{ classification: QuantityGlyphClassification; component: DarkComponent }>,
) {
  if (digits.length === 0 || digits.length > 4) {
    return
  }
  const text = digits.map((digit) => digit.classification.char).join("")
  const value = Number.parseInt(text, 10)
  const region = unionRegions(digits.map((digit) => digit.component))
  if (!region || !Number.isFinite(value) || value <= 0) {
    return
  }

  labels.push({
    confidence: digits.reduce((sum, digit) => sum + digit.classification.confidence, 0) / digits.length,
    region,
    value,
    valueSource: "ocr",
  })
}

function classifyStepNumberGlyph(
  imageData: DetectionImageData,
  glyphRegion: PixelRegion,
): QuantityGlyphClassification | null {
  const aspectRatio = glyphRegion.width / Math.max(1, glyphRegion.height)
  const densities = getQuantityGlyphDensities(imageData, glyphRegion)

  return classifyStepNumberGlyphDensities(densities, aspectRatio)
}

function classifyStepNumberGlyphDensities(
  densities: readonly number[],
  aspectRatio: number,
): QuantityGlyphClassification | null {
  const featureClassification = classifyLargeStepNumberGlyphByFeatures(densities, aspectRatio)
  if (featureClassification) {
    return featureClassification
  }

  if (aspectRatio < 0.52) {
    return { char: "1", confidence: 0.78 }
  }

  const bestTemplate = quantityGlyphTemplates
    .filter((template) => template.char !== "x")
    .map((template) => ({
      char: template.char,
      confidence: scoreQuantityGlyphTemplate(densities, template.pattern),
    }))
    .sort((left, right) => right.confidence - left.confidence)[0]
  if (!bestTemplate || bestTemplate.confidence < 0.5) {
    return null
  }

  return bestTemplate
}

function classifyLargeStepNumberGlyphByFeatures(
  densities: readonly number[],
  aspectRatio: number,
): QuantityGlyphClassification | null {
  const top = getQuantityGridAreaDensity(densities, 0, 0, 5, 2)
  const middle = getQuantityGridAreaDensity(densities, 0, 3, 5, 2)
  const bottom = getQuantityGridAreaDensity(densities, 0, 5, 5, 2)
  const upperLeftCorner = getQuantityGridAreaDensity(densities, 0, 0, 2, 2)
  const rightStem = getQuantityGridAreaDensity(densities, 3, 0, 1, 7)
  const upperRightStem = getQuantityGridAreaDensity(densities, 3, 0, 1, 4)
  const lowerRightStem = getQuantityGridAreaDensity(densities, 3, 3, 1, 4)
  const lowerCrossbar = getQuantityGridAreaDensity(densities, 0, 4, 5, 2)
  const lowerLeftMiddle = getQuantityGridAreaDensity(densities, 0, 3, 2, 3)

  if (
    aspectRatio >= 0.5 &&
    aspectRatio <= 0.95 &&
    rightStem > 0.76 &&
    upperRightStem > 0.76 &&
    lowerRightStem > 0.76 &&
    lowerCrossbar > 0.5 &&
    lowerLeftMiddle > 0.36 &&
    upperLeftCorner < 0.28 &&
    bottom < 0.6
  ) {
    return { char: "4", confidence: 0.84 }
  }

  const rightUpper = getQuantityGridAreaDensity(densities, 2, 1, 3, 2)
  const lowerLeft = getQuantityGridAreaDensity(densities, 0, 4, 3, 3)
  const lowerRight = getQuantityGridAreaDensity(densities, 3, 4, 2, 3)
  const center = getQuantityGridAreaDensity(densities, 2, 0, 1, 7)

  if (
    aspectRatio >= 0.72 &&
    aspectRatio <= 1.25 &&
    top > 0.34 &&
    middle > 0.3 &&
    bottom > 0.4 &&
    rightUpper > 0.32 &&
    lowerLeft > lowerRight + 0.08 &&
    center > 0.46
  ) {
    return { char: "2", confidence: 0.82 }
  }

  return null
}

function isStepNumberTextPixel(imageData: DetectionImageData, x: number, y: number) {
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

  return brightness < 118 && chroma <= 48
}

function collectStepNumberTextComponents(
  imageData: DetectionImageData,
  region: PixelRegion,
  excludedRegions: readonly PixelRegion[] = [],
) {
  const boundedRegion = normalizeRegion(region, imageData.width, imageData.height)
  const width = imageData.width
  const visited = new Uint8Array(imageData.width * imageData.height)
  const components: DarkComponent[] = []

  for (let y = boundedRegion.y; y < boundedRegion.y + boundedRegion.height; y += 1) {
    for (let x = boundedRegion.x; x < boundedRegion.x + boundedRegion.width; x += 1) {
      const pixelIndex = (y * width) + x
      if (
        visited[pixelIndex] ||
        isPointInsideAnyRegion(x, y, excludedRegions) ||
        !isStepNumberTextPixel(imageData, x, y)
      ) {
        continue
      }

      const component = collectStepNumberTextComponent(imageData, visited, boundedRegion, pixelIndex, excludedRegions)
      if (component.count >= 4) {
        components.push(component)
      }
    }
  }

  return components
}

function collectStepNumberTextComponent(
  imageData: DetectionImageData,
  visited: Uint8Array,
  bounds: PixelRegion,
  startIndex: number,
  excludedRegions: readonly PixelRegion[],
): DarkComponent {
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

    addStepNumberTextNeighbor(imageData, visited, stack, pixelIndex - 1, x > bounds.x, excludedRegions)
    addStepNumberTextNeighbor(imageData, visited, stack, pixelIndex + 1, x < bounds.x + bounds.width - 1, excludedRegions)
    addStepNumberTextNeighbor(imageData, visited, stack, pixelIndex - imageData.width, y > bounds.y, excludedRegions)
    addStepNumberTextNeighbor(imageData, visited, stack, pixelIndex + imageData.width, y < bounds.y + bounds.height - 1, excludedRegions)
    addStepNumberTextNeighbor(
      imageData,
      visited,
      stack,
      pixelIndex - imageData.width - 1,
      x > bounds.x && y > bounds.y,
      excludedRegions,
    )
    addStepNumberTextNeighbor(
      imageData,
      visited,
      stack,
      pixelIndex - imageData.width + 1,
      x < bounds.x + bounds.width - 1 && y > bounds.y,
      excludedRegions,
    )
    addStepNumberTextNeighbor(
      imageData,
      visited,
      stack,
      pixelIndex + imageData.width - 1,
      x > bounds.x && y < bounds.y + bounds.height - 1,
      excludedRegions,
    )
    addStepNumberTextNeighbor(
      imageData,
      visited,
      stack,
      pixelIndex + imageData.width + 1,
      x < bounds.x + bounds.width - 1 && y < bounds.y + bounds.height - 1,
      excludedRegions,
    )
  }

  return {
    count,
    height: maxY - minY + 1,
    width: maxX - minX + 1,
    x: minX,
    y: minY,
  }
}

function addStepNumberTextNeighbor(
  imageData: DetectionImageData,
  visited: Uint8Array,
  stack: number[],
  pixelIndex: number,
  isInBounds: boolean,
  excludedRegions: readonly PixelRegion[],
) {
  if (!isInBounds || visited[pixelIndex]) {
    return
  }

  const x = pixelIndex % imageData.width
  const y = Math.floor(pixelIndex / imageData.width)
  if (isPointInsideAnyRegion(x, y, excludedRegions) || !isStepNumberTextPixel(imageData, x, y)) {
    return
  }

  visited[pixelIndex] = 1
  stack.push(pixelIndex)
}

function isLikelyStepNumberDigitComponent(imageData: DetectionImageData, component: DarkComponent) {
  const density = component.count / Math.max(1, component.width * component.height)
  const minHeight = Math.max(36, Math.round(imageData.height * 0.04))
  const maxHeight = Math.max(minHeight + 1, Math.round(imageData.height * 0.16))
  const minWidth = Math.max(9, Math.round(imageData.width * 0.006))
  const maxWidth = Math.max(minWidth + 1, Math.round(imageData.width * 0.12))

  return (
    component.height >= minHeight &&
    component.height <= maxHeight &&
    component.width >= minWidth &&
    component.width <= maxWidth &&
    component.count >= 120 &&
    density >= 0.18 &&
    density <= 0.88
  )
}

function suppressOverlappingStepNumberLabels(labels: readonly StepNumberLabel[]) {
  const selected: StepNumberLabel[] = []
  for (const label of [...labels].sort((left, right) =>
    right.confidence - left.confidence ||
    String(right.value).length - String(left.value).length ||
    left.region.y - right.region.y ||
    left.region.x - right.region.x
  )) {
    if (selected.some((existing) => getIntersectionOverUnion(existing.region, label.region) > 0.6)) {
      continue
    }
    selected.push(label)
  }

  return selected
}

function rejectStepNumberLabelsInsideCalloutRegions(
  labels: readonly StepNumberLabel[],
  calloutRegions: readonly PixelRegion[],
  imageData: DetectionImageData,
) {
  return labels.filter((label) =>
    !calloutRegions.some((region) =>
      isStepNumberLabelInsideCalloutRegion(label, padRegion(region, imageData.width, imageData.height, 2)) &&
      !isStepNumberLabelInCalloutHeader(label, region)
    )
  )
}

function isStepNumberLabelInsideCalloutRegion(label: StepNumberLabel, calloutRegion: PixelRegion) {
  const centerX = getRegionCenterX(label.region)
  const centerY = getRegionCenterY(label.region)
  if (isPointInsideRegion(centerX, centerY, calloutRegion)) {
    return true
  }

  const intersection = intersectRegions(label.region, calloutRegion)
  if (!intersection) {
    return false
  }

  const labelArea = label.region.width * label.region.height
  const intersectionArea = intersection.width * intersection.height

  return intersectionArea / Math.max(1, labelArea) >= 0.35
}

function isStepNumberLabelInCalloutHeader(label: StepNumberLabel, calloutRegion: PixelRegion) {
  return (
    isStepNumberLabelNearCalloutRegion(label, calloutRegion) &&
    label.region.x <= calloutRegion.x + Math.max(label.region.width * 1.2, calloutRegion.width * 0.18) &&
    label.region.y <= calloutRegion.y + Math.max(label.region.height * 1.4, calloutRegion.height * 0.28)
  )
}

function createStepLabelAnchoredCalloutRegionCandidates(
  imageData: DetectionImageData,
  label: StepNumberLabel,
  horizontalSegments: readonly HorizontalBorderSegment[],
) {
  const minWidth = getMinimumStepLabelAnchoredCalloutRegionWidth(imageData)
  const minHeight = getMinimumStepCalloutRegionHeight(imageData)
  const maxHeight = getMaximumStepCalloutRegionHeight(imageData)
  const searchTop = label.region.y - Math.max(label.region.height * 1.4, imageData.height * 0.06)
  const searchBottom = label.region.y + label.region.height + maxHeight
  const searchLeft = Math.max(0, label.region.x - Math.max(label.region.width * 2.2, imageData.width * 0.04))
  const searchRight = imageData.width - Math.max(8, imageData.width * 0.02)
  const nearbySegments = horizontalSegments.filter((segment) =>
    segment.y >= searchTop &&
    segment.y <= searchBottom &&
    segment.x + segment.width >= label.region.x + label.region.width &&
    segment.x <= searchRight &&
    segment.x + segment.width >= searchLeft + minWidth
  )
  const candidates: RegionCandidate[] = []

  for (const topSegment of nearbySegments) {
    if (topSegment.y > getRegionCenterY(label.region) + label.region.height * 1.25) {
      continue
    }

    for (const bottomSegment of nearbySegments) {
      const height = bottomSegment.y - topSegment.y + bottomSegment.height
      if (height < minHeight || height > maxHeight) {
        continue
      }

      const overlap = getHorizontalOverlapRatio(topSegment, bottomSegment)
      if (overlap < 0.7) {
        continue
      }

      const rawRegion = createRegionFromBorderSegments(topSegment, bottomSegment, imageData)
      const candidate = createStepLabelAnchoredRegionCandidate(imageData, label, rawRegion)
      if (candidate) {
        candidates.push(candidate)
      }
    }
  }

  return candidates
}

function createRegionFromBorderSegments(
  topSegment: HorizontalBorderSegment,
  bottomSegment: HorizontalBorderSegment,
  imageData: DetectionImageData,
) {
  const x = Math.min(topSegment.x, bottomSegment.x)
  const y = Math.min(topSegment.y, bottomSegment.y)
  const right = Math.max(topSegment.x + topSegment.width, bottomSegment.x + bottomSegment.width)
  const bottom = Math.max(topSegment.y + topSegment.height, bottomSegment.y + bottomSegment.height)

  return normalizeRegion({
    height: bottom - y,
    width: right - x,
    x,
    y,
  }, imageData.width, imageData.height)
}

function createStepLabelAnchoredRegionCandidate(
  imageData: DetectionImageData,
  label: StepNumberLabel,
  rawRegion: PixelRegion,
): RegionCandidate | null {
  const minWidth = getMinimumStepLabelAnchoredCalloutRegionWidth(imageData)
  const minHeight = getMinimumStepCalloutRegionHeight(imageData)
  const maxWidth = getMaximumStepCalloutRegionWidth(imageData)
  const maxHeight = getMaximumStepCalloutRegionHeight(imageData)
  if (
    rawRegion.width < minWidth ||
    rawRegion.height < minHeight ||
    rawRegion.width > maxWidth ||
    rawRegion.height > maxHeight
  ) {
    return null
  }

  const searchRadius = Math.max(4, Math.round(Math.min(imageData.width, imageData.height) * 0.008))
  const region = snapRegionToDarkBorder(imageData, rawRegion, searchRadius)
  if (!isStepNumberLabelNearCalloutRegion(label, region)) {
    return null
  }

  const labelScore = getStepNumberLabelCalloutScore(label, region)
  if (labelScore > 1.35) {
    return null
  }

  const borderScore = getRegionBorderScore(imageData, region)
  if (borderScore < 0.2 || !hasStepLabelAnchoredRectangleEvidence(imageData, region)) {
    return null
  }

  if (!hasStepLabelAnchoredInteriorEvidence(imageData, region, label.region)) {
    return null
  }

  if (!hasStepLabelAnchoredPartItemEvidence(imageData, region)) {
    return null
  }

  const confidence = clamp(0.26 + (borderScore * 0.36) + (label.confidence * 0.14) - (labelScore * 0.05), 0.18, 0.5)

  return {
    ...region,
    borderScore,
    confidence,
    fillRatio: 0,
  }
}

function isStepNumberLabelNearCalloutRegion(label: StepNumberLabel, region: PixelRegion) {
  const labelCenterX = getRegionCenterX(label.region)
  const labelCenterY = getRegionCenterY(label.region)
  const verticalSlack = Math.max(label.region.height * 1.35, region.height * 0.18)
  const horizontallyNearLeftSide = label.region.x <= region.x + region.width * 0.36
  const verticallyNearRegion =
    labelCenterY >= region.y - verticalSlack &&
    labelCenterY <= region.y + region.height + verticalSlack
  const notFarRight = labelCenterX <= region.x + region.width * 0.48

  return horizontallyNearLeftSide && verticallyNearRegion && notFarRight
}

function hasStepLabelAnchoredRectangleEvidence(
  imageData: DetectionImageData,
  region: PixelRegion,
  pixelMatcher: PixelMatcher = isDarkPixel,
) {
  const left = getVerticalDarkCoverage(imageData, region.x, region.y, region.y + region.height - 1, pixelMatcher)
  const right = getVerticalDarkCoverage(
    imageData,
    region.x + region.width - 1,
    region.y,
    region.y + region.height - 1,
    pixelMatcher,
  )
  const top = getHorizontalDarkCoverage(imageData, region.y, region.x, region.x + region.width - 1, pixelMatcher)
  const bottom = getHorizontalDarkCoverage(
    imageData,
    region.y + region.height - 1,
    region.x,
    region.x + region.width - 1,
    pixelMatcher,
  )

  return (
    top >= 0.24 &&
    bottom >= 0.24 &&
    left + right >= 0.26 &&
    Math.max(left, right) >= 0.16
  )
}

function hasStepLabelAnchoredInteriorEvidence(
  imageData: DetectionImageData,
  region: PixelRegion,
  labelRegion: PixelRegion,
) {
  const inset = Math.max(4, Math.round(Math.min(region.width, region.height) * 0.035))
  const interior = normalizeRegion({
    height: region.height - inset * 2,
    width: region.width - inset * 2,
    x: region.x + inset,
    y: region.y + inset,
  }, imageData.width, imageData.height)
  let darkPixels = 0
  let sampledPixels = 0
  const step = Math.max(1, Math.round(Math.min(region.width, region.height) * 0.018))

  for (let y = interior.y; y < interior.y + interior.height; y += step) {
    for (let x = interior.x; x < interior.x + interior.width; x += step) {
      if (isPointInsideRegion(x, y, labelRegion)) {
        continue
      }
      sampledPixels += 1
      if (isDarkPixel(imageData, x, y)) {
        darkPixels += 1
      }
    }
  }

  return (
    darkPixels >= 4 &&
    darkPixels / Math.max(1, sampledPixels) >= 0.002 &&
    hasStepLabelAnchoredQuantityEvidence(imageData, interior)
  )
}

function hasStepLabelAnchoredQuantityEvidence(imageData: DetectionImageData, region: PixelRegion) {
  return getReadableQuantityEvidenceRegions(imageData, region).length > 0
}

function getReadableQuantityEvidenceRegions(
  imageData: DetectionImageData,
  region: PixelRegion,
  minConfidence = 0.58,
) {
  return collectDarkComponents(imageData, region, isQuantityTextPixel)
    .filter((component) => isLikelyQuantityLabelComponent(imageData, component))
    .flatMap((component) => {
      const readableRegion = expandRegion(component, imageData, Math.max(6, component.height))
      const quantity = readQuantityFromImageData(imageData, readableRegion)

      return quantity.value && quantity.confidence >= minConfidence ? [readableRegion] : []
    })
}

function hasStepLabelAnchoredPartItemEvidence(imageData: DetectionImageData, region: PixelRegion) {
  return hasStepCalloutPartItemDetectionEvidence(cropDetectionImageDataRegion(imageData, region))
}

function cropDetectionImageDataRegion(imageData: DetectionImageData, region: PixelRegion): DetectionImageData {
  const boundedRegion = normalizeRegion(region, imageData.width, imageData.height)
  const data = new Uint8ClampedArray(boundedRegion.width * boundedRegion.height * 4)

  for (let y = 0; y < boundedRegion.height; y += 1) {
    for (let x = 0; x < boundedRegion.width; x += 1) {
      const sourceIndex = (((boundedRegion.y + y) * imageData.width) + boundedRegion.x + x) * 4
      const targetIndex = ((y * boundedRegion.width) + x) * 4
      data[targetIndex] = imageData.data[sourceIndex] ?? 0
      data[targetIndex + 1] = imageData.data[sourceIndex + 1] ?? 0
      data[targetIndex + 2] = imageData.data[sourceIndex + 2] ?? 0
      data[targetIndex + 3] = imageData.data[sourceIndex + 3] ?? 255
    }
  }

  return {
    data,
    height: boundedRegion.height,
    width: boundedRegion.width,
  }
}

function collectHorizontalBorderSegments(
  imageData: DetectionImageData,
  minWidth: number,
  {
    maxGap = 2,
    minDarkRatio = 0.58,
    pixelMatcher = isDarkPixel,
  }: {
    maxGap?: number
    minDarkRatio?: number
    pixelMatcher?: PixelMatcher
  } = {},
) {
  const rawSegments: HorizontalBorderSegment[] = []

  for (let y = 0; y < imageData.height; y += 1) {
    let runStart: number | null = null
    let darkPixels = 0
    let gap = 0

    for (let x = 0; x < imageData.width; x += 1) {
      if (pixelMatcher(imageData, x, y)) {
        runStart ??= x
        darkPixels += 1
        gap = 0
        continue
      }

      if (runStart !== null && gap < maxGap) {
        gap += 1
        continue
      }

      if (runStart !== null) {
        addHorizontalBorderSegment(rawSegments, runStart, y, x - runStart - gap, darkPixels, minWidth, minDarkRatio)
      }
      runStart = null
      darkPixels = 0
      gap = 0
    }

    if (runStart !== null) {
      addHorizontalBorderSegment(
        rawSegments,
        runStart,
        y,
        imageData.width - runStart - gap,
        darkPixels,
        minWidth,
        minDarkRatio,
      )
    }
  }

  return mergeNearbyHorizontalBorderSegments(rawSegments)
}

function addHorizontalBorderSegment(
  segments: HorizontalBorderSegment[],
  x: number,
  y: number,
  width: number,
  darkPixels: number,
  minWidth: number,
  minDarkRatio = 0.58,
) {
  if (width < minWidth || darkPixels / Math.max(1, width) < minDarkRatio) {
    return
  }

  segments.push({
    darkRatio: darkPixels / Math.max(1, width),
    height: 1,
    width,
    x,
    y,
  })
}

function mergeNearbyHorizontalBorderSegments(segments: readonly HorizontalBorderSegment[]) {
  const merged: HorizontalBorderSegment[] = []

  for (const segment of [...segments].sort((left, right) => left.y - right.y || left.x - right.x)) {
    const existing = merged.find((candidate) =>
      Math.abs(candidate.y + candidate.height - segment.y) <= 2 &&
      getHorizontalOverlapRatio(candidate, segment) >= 0.86
    )
    if (!existing) {
      merged.push({ ...segment })
      continue
    }

    const x = Math.min(existing.x, segment.x)
    const right = Math.max(existing.x + existing.width, segment.x + segment.width)
    const y = Math.min(existing.y, segment.y)
    const bottom = Math.max(existing.y + existing.height, segment.y + segment.height)
    existing.darkRatio = Math.max(existing.darkRatio, segment.darkRatio)
    existing.height = bottom - y
    existing.width = right - x
    existing.x = x
    existing.y = y
  }

  return merged
}

function getMinimumStepCalloutRegionWidth(imageData: DetectionImageData) {
  return Math.max(48, imageData.width * 0.08)
}

function getMinimumSmallStepCalloutRegionWidth(imageData: DetectionImageData) {
  return Math.max(18, imageData.width * 0.01)
}

function getMinimumStepLabelAnchoredCalloutRegionWidth(imageData: DetectionImageData) {
  return Math.max(120, imageData.width * 0.12)
}

function getMinimumStepCalloutRegionHeight(imageData: DetectionImageData) {
  return Math.max(36, imageData.height * 0.05)
}

function getMinimumSmallStepCalloutRegionHeight(imageData: DetectionImageData) {
  return Math.max(18, imageData.height * 0.01)
}

function getMaximumStepCalloutRegionWidth(imageData: DetectionImageData) {
  return imageData.width * 0.92
}

function getMaximumStepCalloutRegionHeight(imageData: DetectionImageData) {
  return imageData.height * 0.58
}

function isTallNarrowStepCalloutRegionCandidate(imageData: DetectionImageData, region: PixelRegion) {
  const aspectRatio = region.width / Math.max(1, region.height)

  return (
    region.height <= imageData.height * 0.94 &&
    region.height >= imageData.height * 0.45 &&
    region.width <= imageData.width * 0.34 &&
    aspectRatio <= 0.62
  )
}

function isImplausiblyWideShallowStepCalloutRegion(imageData: DetectionImageData, region: RegionCandidate) {
  const aspectRatio = region.width / Math.max(1, region.height)
  const maxShallowHeight = Math.max(72, imageData.height * 0.112)
  const isLowCompactModelFragment =
    aspectRatio >= 1.65 &&
    region.y > imageData.height * 0.72 &&
    region.width <= imageData.width * 0.22 &&
    region.height <= imageData.height * 0.12

  if (isLowCompactModelFragment) {
    return !hasLowCompactStepCalloutEvidence(imageData, region)
  }

  const isWideShallowRegion =
    aspectRatio >= 3.4 &&
    region.height <= maxShallowHeight &&
    region.width >= imageData.width * 0.16

  return isWideShallowRegion && !hasWideShallowStepCalloutEvidence(imageData, region)
}

function hasLowCompactStepCalloutEvidence(imageData: DetectionImageData, region: RegionCandidate) {
  if (region.borderScore < 0.72 || region.fillRatio < 0.62 || !hasNearbyStepNumberGlyphEvidence(imageData, region)) {
    return false
  }

  const paddedRegion = padRegion(region, imageData.width, imageData.height, cropPaddingPixels)
  const partItems = detectStepCalloutPartItemRegionsFromImageData(cropDetectionImageDataRegion(imageData, paddedRegion))

  return partItems.length >= 2
}

function hasWideShallowStepCalloutEvidence(imageData: DetectionImageData, region: RegionCandidate) {
  if (region.borderScore < 0.72 || region.fillRatio < 0.62) {
    return false
  }

  const paddedRegion = padRegion(region, imageData.width, imageData.height, cropPaddingPixels)
  const partItems = detectStepCalloutPartItemRegionsFromImageData(cropDetectionImageDataRegion(imageData, paddedRegion))

  return partItems.length >= 2 || (partItems.length === 1 && hasNearbyStepNumberGlyphEvidence(imageData, region))
}

function normalizeStepNumberLabelsForSequence(
  labels: readonly StepNumberLabel[],
  fallbackStart: number,
) {
  void fallbackStart

  return [...labels].sort((left, right) => left.region.y - right.region.y || left.region.x - right.region.x)
}

export function debugNormalizeStepNumberLabelValuesForSequence(values: readonly number[], fallbackStart: number) {
  return normalizeStepNumberLabelsForSequence(
    values.map((value, index) => ({
      confidence: 0.9,
      region: {
        height: 40,
        width: 30,
        x: index * 48,
        y: index * 64,
      },
      value,
      valueSource: "ocr" as const,
    })),
    fallbackStart,
  ).map((label) => ({
    rawValue: label.rawValue,
    value: label.value,
    valueSource: label.valueSource ?? "ocr",
  }))
}

export function debugSelectStepNumberLabelValuesForSequence(values: readonly number[], fallbackStart: number) {
  const labels = values.map((value, index) => ({
    confidence: 0.9,
    region: {
      height: 40,
      width: 30,
      x: index * 48,
      y: index * 64,
    },
    value,
    valueSource: "ocr" as const,
  }))
  return selectSequenceStepNumberLabels(
    stabilizeConsecutiveStepNumberLabelRun(
      normalizeStepNumberLabelsForSequence(labels, fallbackStart),
      fallbackStart,
    ),
    fallbackStart,
  ).map((label) => ({
    rawValue: label.rawValue,
    value: label.value,
    valueSource: label.valueSource ?? "ocr",
  }))
}

function stabilizeConsecutiveStepNumberLabelRun(
  labels: readonly StepNumberLabel[],
  fallbackStart: number,
) {
  const rawValues = labels
    .map((label) => label.rawValue ?? label.value)
    .filter((value) => Number.isFinite(value))
  const rawRun = getConsecutiveNumberRun(rawValues)
  if (!rawRun || rawRun.length < 3 || rawRun[0] !== fallbackStart - 1) {
    return labels
  }

  const rawRunValues = new Set(rawRun)
  return labels.map((label) => {
    const rawValue = label.rawValue ?? label.value
    if (!rawRunValues.has(rawValue)) {
      return label
    }

    const { rawValue: ignoredRawValue, ...rest } = label
    void ignoredRawValue
    return {
      ...rest,
      value: rawValue,
      valueSource: "ocr" as const,
    }
  })
}

function getConsecutiveNumberRun(values: readonly number[]) {
  const sortedValues = [...new Set(values)].sort((left, right) => left - right)
  let bestRun: number[] = []
  let currentRun: number[] = []

  for (const value of sortedValues) {
    const previousValue = currentRun.at(-1)
    if (previousValue === undefined || value === previousValue + 1) {
      currentRun.push(value)
    } else {
      if (currentRun.length > bestRun.length) {
        bestRun = currentRun
      }
      currentRun = [value]
    }
  }

  return currentRun.length > bestRun.length ? currentRun : bestRun
}

function selectSequenceStepNumberLabels(
  labels: readonly StepNumberLabel[],
  fallbackStart: number,
) {
  void fallbackStart

  return [...labels].sort((left, right) => left.region.y - right.region.y || left.region.x - right.region.x)
}

function assignCalloutRegionsFromStepNumberLabels(
  regions: readonly RegionCandidate[],
  stepNumberLabels: readonly StepNumberLabel[],
  fallbackStart: number,
) {
  const assignedStepIndexes = new Map<number, number>()
  const assignedStepLabels = new Map<number, StepNumberLabel>()
  const usedRegionIndexes = new Set<number>()
  const labelsByPosition = [...stepNumberLabels].sort((left, right) =>
    left.region.y - right.region.y ||
    left.region.x - right.region.x
  )

  for (const label of labelsByPosition) {
    const regionIndex = getBestCalloutRegionIndexForStepNumberLabel(label, regions, usedRegionIndexes)
    if (regionIndex !== null) {
      usedRegionIndexes.add(regionIndex)
      assignedStepIndexes.set(regionIndex, label.value)
      assignedStepLabels.set(regionIndex, label)
    }
  }

  const anchoredStepIndexes = new Set(assignedStepIndexes.values())
  let nextFallbackStepIndex = fallbackStart
  return regions.map((region, regionIndex): StepAnchoredCalloutRegion => {
    const assignedStepIndex = assignedStepIndexes.get(regionIndex)
    if (assignedStepIndex !== undefined) {
      return {
        region,
        stepLabel: assignedStepLabels.get(regionIndex),
        stepIndex: assignedStepIndex,
      }
    }

    while (anchoredStepIndexes.has(nextFallbackStepIndex)) {
      nextFallbackStepIndex += 1
    }
    const stepIndex = nextFallbackStepIndex
    nextFallbackStepIndex += 1

    return {
      region,
      stepIndex,
    }
  })
}

function getBestCalloutRegionIndexForStepNumberLabel(
  label: StepNumberLabel,
  regions: readonly PixelRegion[],
  usedRegionIndexes: ReadonlySet<number>,
) {
  let bestIndex: number | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const [index, region] of regions.entries()) {
    if (usedRegionIndexes.has(index)) {
      continue
    }
    const score = getStepNumberLabelCalloutScore(label, region)
    if (score < bestScore) {
      bestScore = score
      bestIndex = index
    }
  }

  return bestScore <= 1.15 ? bestIndex : null
}

function getStepNumberLabelCalloutScore(label: StepNumberLabel, region: PixelRegion) {
  const xDistance = Math.abs(getRegionCenterX(label.region) - getRegionCenterX(region)) / Math.max(1, region.width)
  const yDistance = Math.abs(getRegionCenterY(label.region) - getRegionCenterY(region)) / Math.max(1, region.height)
  const verticalOverlap = getAxisOverlap(
    label.region.y,
    label.region.y + label.region.height,
    region.y,
    region.y + region.height,
  ) / Math.max(1, Math.min(label.region.height, region.height))
  const isLeftAligned = label.region.x + label.region.width <= region.x + Math.max(24, region.width * 0.18)
  const isNearTop = label.region.y <= region.y + region.height * 0.28

  return (
    (xDistance * 0.52) +
    (yDistance * 0.78) -
    (verticalOverlap * 0.55) -
    (isLeftAligned ? 0.24 : 0) -
    (isNearTop ? 0.18 : 0) -
    (label.confidence * 0.18)
  )
}

function getAxisOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number) {
  return Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart))
}

function getNextFallbackStepIndex(
  currentFallbackStepIndex: number,
  stepNumberLabels: readonly StepNumberLabel[],
  pageCallouts: readonly DetectedStepCallout[],
) {
  const maxPageStepIndex = Math.max(
    currentFallbackStepIndex - 1,
    ...stepNumberLabels.map((label) => label.value),
    ...pageCallouts.map((callout) => callout.stepIndex),
  )

  return maxPageStepIndex + 1
}

function createDetectedStepNumberLabel(
  canvas: HTMLCanvasElement,
  pageNumber: number,
  label: StepNumberLabel,
  indexOnPage: number,
): DetectedStepNumberLabel {
  const paddedRegion = padRegion(label.region, canvas.width, canvas.height, cropPaddingPixels)

  return {
    confidence: label.confidence,
    crop: cropCanvasRegion(canvas, paddedRegion),
    id: `step-label:p${pageNumber}:r${indexOnPage}:x${paddedRegion.x}:y${paddedRegion.y}:w${paddedRegion.width}:h${paddedRegion.height}:v${label.value}`,
    indexOnPage,
    pageNumber,
    rawValue: label.rawValue,
    sourceRegion: {
      height: paddedRegion.height,
      unit: "step_pixel",
      width: paddedRegion.width,
      x: paddedRegion.x,
      y: paddedRegion.y,
    },
    value: label.value,
    valueSource: label.valueSource ?? "ocr",
  }
}

export function detectStepCalloutPartItemRegionsFromImageData(imageData: DetectionImageData): StepCalloutPartItemRegion[] {
  return sortPartItemRegions(suppressOverlappingPartItemRegions(createStepCalloutPartItemRegionCandidates(imageData).regions))
}

export function debugDetectStepCalloutPartItemRegionsFromImageData(imageData: DetectionImageData) {
  const debugState = createStepCalloutPartItemRegionCandidates(imageData)

  return {
    anchorCandidates: debugState.quantityAnchorCandidates.map((anchor) => ({
      componentCount: anchor.componentCount,
      quantity: anchor.quantity,
      region: anchor.region,
      score: anchor.score,
    })),
    anchors: debugState.quantityAnchors.map((anchor) => ({
      componentCount: anchor.componentCount,
      quantity: anchor.quantity,
      region: anchor.region,
      score: anchor.score,
    })),
    components: debugState.quantityComponents,
    likelyComponents: debugState.likelyQuantityComponents,
    rawRegions: debugState.regions,
    regions: sortPartItemRegions(suppressOverlappingPartItemRegions(debugState.regions)),
    zoneResults: debugState.zoneResults.map((zoneResult) => ({
      anchor: {
        componentCount: zoneResult.anchor.componentCount,
        quantity: zoneResult.anchor.quantity,
        region: zoneResult.anchor.region,
        score: zoneResult.anchor.score,
      },
      expandedPartRegion: zoneResult.expandedPartRegion,
      ownedPartRegion: zoneResult.ownedPartRegion,
      partRegion: zoneResult.partRegion,
      rawPartRegion: zoneResult.rawPartRegion,
      reason: zoneResult.reason,
      region: zoneResult.region,
      searchRegion: zoneResult.searchRegion,
    })),
    zones: debugState.zones.map((zone) => ({
      anchor: {
        componentCount: zone.anchor.componentCount,
        quantity: zone.anchor.quantity,
        region: zone.anchor.region,
        score: zone.anchor.score,
      },
      region: zone.region,
    })),
  }
}

export function debugReadStepCalloutQuantityFromImageData(imageData: DetectionImageData, region: PixelRegion) {
  return readQuantityFromImageData(imageData, region)
}

export function debugReadStepCalloutQuantityGlyphsFromImageData(imageData: DetectionImageData, region: PixelRegion) {
  const textRegion = trimRegionToQuantityText(imageData, region)
  const digitRunRegion = getQuantityDigitRunRegion(imageData, region)
  const glyphs = digitRunRegion ? getQuantityGlyphRegions(imageData, digitRunRegion) : []
  const textGlyphs = textRegion ? getQuantityGlyphRegions(imageData, textRegion) : []

  return {
    digitRunRegion,
    glyphs: glyphs.map((glyph) => ({
      classification: classifyQuantityGlyph(imageData, glyph),
      densities: getQuantityGlyphDensities(imageData, glyph),
      region: glyph,
    })),
    quantity: readQuantityFromImageData(imageData, region),
    textRegion,
    textGlyphs: textGlyphs.map((glyph) => ({
      classification: classifyQuantityGlyph(imageData, glyph),
      isMarker: isLikelyQuantityMarkerRegion(imageData, glyph),
      region: glyph,
    })),
  }
}

function createStepCalloutPartItemRegionCandidates(imageData: DetectionImageData) {
  if (!hasStepCalloutPartItemDetectionEvidence(imageData)) {
    return {
      likelyQuantityComponents: [],
      quantityAnchorCandidates: [],
      quantityAnchors: [],
      quantityComponents: [],
      regions: [],
      zoneResults: [],
      zones: [],
    }
  }

  const background = sampleCalloutBackground(imageData)
  const foregroundMask = createCalloutItemForegroundMask(imageData, background)
  const interiorRegion = getCalloutInteriorRegion(imageData)
  clearMaskOutsideRegion(foregroundMask, imageData.width, imageData.height, interiorRegion)
  const quantityComponents = collectDarkComponents(imageData, interiorRegion, isQuantityTextPixel)
  const likelyQuantityComponents = quantityComponents
    .filter((component) => isLikelyQuantityLabelComponent(imageData, component))
  const quantityAnchorCandidates = likelyQuantityComponents.length === 0
    ? []
    : createQuantityLabelAnchorCandidates(imageData, likelyQuantityComponents, interiorRegion, foregroundMask)
  const quantityAnchors = suppressOverlappingQuantityLabelAnchors(quantityAnchorCandidates)
  if (quantityAnchors.length === 0) {
    return {
      likelyQuantityComponents,
      quantityAnchorCandidates,
      quantityAnchors,
      quantityComponents,
      regions: [],
      zoneResults: [],
      zones: [],
    }
  }

  const regions: StepCalloutPartItemRegion[] = []
  const zones = createQuantityLabelAnchorZones(quantityAnchors, interiorRegion)
  const zoneResults: Array<QuantityAnchorPartRegionResult & QuantityLabelAnchorZone> = []
  const partMask = createQuantityAnchorPartForegroundMask(imageData, foregroundMask, quantityAnchors)

  for (const zone of zones) {
    const partRegionResult = findPartRegionCandidateForQuantityAnchor(imageData, partMask, zone, quantityAnchors)
    const partRegion = partRegionResult.partRegion
    zoneResults.push({
      ...partRegionResult,
      anchor: zone.anchor,
      region: zone.region,
    })
    if (!partRegion) {
      continue
    }

    const quantityRegion = zone.anchor.region
    const itemRegion = normalizeRegion(
      unionRegions([partRegion, quantityRegion]) ?? partRegion,
      imageData.width,
      imageData.height,
    )
    regions.push({
      confidence: scoreAnchoredPartItemRegion(imageData, zone.anchor, itemRegion, partRegion),
      itemRegion,
      partRegion,
      quantity: zone.anchor.quantity,
      quantityRegion,
    })
  }

  return {
    likelyQuantityComponents,
    quantityAnchorCandidates,
    quantityAnchors,
    quantityComponents,
    regions,
    zoneResults,
    zones,
  }
}

function createStepCalloutProgressPublisher(onProgress?: (progress: StepCalloutDetectionProgress) => void) {
  let lastPublishedAt = Number.NEGATIVE_INFINITY
  let lastPublishedProgress = Number.NEGATIVE_INFINITY

  return (progress: StepCalloutDetectionProgress, { force = false }: { force?: boolean } = {}) => {
    if (!onProgress) {
      return
    }

    const now = getNowMs()
    const shouldPublish = force ||
      now - lastPublishedAt >= stepCalloutProgressMinIntervalMs ||
      progress.progress - lastPublishedProgress >= stepCalloutProgressMinDelta

    if (!shouldPublish) {
      return
    }

    lastPublishedAt = now
    lastPublishedProgress = progress.progress
    onProgress(progress)
  }
}

function createStepCalloutProgressTimingFields({
  detectionStartedAt,
  pageTimings,
  scannedPageCount,
  targetPageCount,
}: {
  detectionStartedAt: number
  pageTimings: readonly StepCalloutDetectionPageTiming[]
  scannedPageCount: number
  targetPageCount: number
}): Pick<StepCalloutDetectionProgress, "averagePageMs" | "elapsedMs" | "estimatedRemainingMs"> {
  const elapsedMs = Math.round(getElapsedMs(detectionStartedAt))
  const averagePageMs = getAverageStepCalloutPageMs(pageTimings)
  const remainingPageCount = Math.max(0, targetPageCount - scannedPageCount)

  return {
    averagePageMs,
    elapsedMs,
    estimatedRemainingMs: averagePageMs === null ? null : Math.round(averagePageMs * remainingPageCount),
  }
}

function createEmptyStepCalloutDetectionPageTiming(pageNumber: number): StepCalloutDetectionPageTiming {
  return {
    calloutCount: 0,
    calloutExtractionMs: 0,
    pageLoadMs: 0,
    pageNumber,
    regionDetectionMs: 0,
    renderMs: 0,
    stepLabelCount: 0,
    stepLabelDetectionMs: 0,
    textLayerMs: 0,
    totalMs: 0,
  }
}

function roundStepCalloutDetectionPageTiming(
  timing: StepCalloutDetectionPageTiming,
): StepCalloutDetectionPageTiming {
  return {
    calloutCount: timing.calloutCount,
    calloutExtractionMs: Math.round(timing.calloutExtractionMs),
    pageLoadMs: Math.round(timing.pageLoadMs),
    pageNumber: timing.pageNumber,
    regionDetectionMs: Math.round(timing.regionDetectionMs),
    renderMs: Math.round(timing.renderMs),
    stepLabelCount: timing.stepLabelCount,
    stepLabelDetectionMs: Math.round(timing.stepLabelDetectionMs),
    textLayerMs: Math.round(timing.textLayerMs),
    totalMs: Math.round(timing.totalMs),
  }
}

function createStepCalloutDetectionTimings({
  bomMatchMs,
  detectionStartedAt,
  localImageMatchMs,
  pageTimings,
}: {
  bomMatchMs: number
  detectionStartedAt: number
  localImageMatchMs: number
  pageTimings: readonly StepCalloutDetectionPageTiming[]
}): StepCalloutDetectionTimings {
  const pages = pageTimings.map(roundStepCalloutDetectionPageTiming)

  return {
    averagePageMs: getAverageStepCalloutPageMs(pages),
    bomMatchMs: Math.round(bomMatchMs),
    calloutExtractionMs: sumStepCalloutPageTiming(pages, "calloutExtractionMs"),
    localImageMatchMs: Math.round(localImageMatchMs),
    pageLoadMs: sumStepCalloutPageTiming(pages, "pageLoadMs"),
    pageScanMs: sumStepCalloutPageTiming(pages, "totalMs"),
    pages,
    regionDetectionMs: sumStepCalloutPageTiming(pages, "regionDetectionMs"),
    renderMs: sumStepCalloutPageTiming(pages, "renderMs"),
    stepLabelDetectionMs: sumStepCalloutPageTiming(pages, "stepLabelDetectionMs"),
    textLayerMs: sumStepCalloutPageTiming(pages, "textLayerMs"),
    totalMs: Math.round(getElapsedMs(detectionStartedAt)),
  }
}

function getAverageStepCalloutPageMs(pageTimings: readonly StepCalloutDetectionPageTiming[]) {
  if (pageTimings.length === 0) {
    return null
  }

  return Math.round(sumStepCalloutPageTiming(pageTimings, "totalMs") / pageTimings.length)
}

function sumStepCalloutPageTiming(
  pageTimings: readonly StepCalloutDetectionPageTiming[],
  field: keyof Pick<
    StepCalloutDetectionPageTiming,
    | "calloutExtractionMs"
    | "pageLoadMs"
    | "regionDetectionMs"
    | "renderMs"
    | "stepLabelDetectionMs"
    | "textLayerMs"
    | "totalMs"
  >,
) {
  return Math.round(pageTimings.reduce((sum, timing) => sum + timing[field], 0))
}

function createStepCalloutDetectionResult({
  callouts,
  document,
  excludedPages,
  maxPages,
  pageNumbers,
  stepLabels = [],
  timings,
}: {
  callouts: DetectedStepCallout[]
  document: PdfReadableDocument
  excludedPages: ReadonlySet<number>
  maxPages: number | null
  pageNumbers: readonly number[]
  stepLabels?: DetectedStepNumberLabel[]
  timings?: StepCalloutDetectionTimings
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
    stepLabels,
    timings,
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
  const standardMinWidth = getMinimumStepCalloutRegionWidth(imageData)
  const standardMinHeight = getMinimumStepCalloutRegionHeight(imageData)
  const minWidth = getMinimumSmallStepCalloutRegionWidth(imageData)
  const minHeight = getMinimumSmallStepCalloutRegionHeight(imageData)
  const maxWidth = getMaximumStepCalloutRegionWidth(imageData)
  const maxHeight = getMaximumStepCalloutRegionHeight(imageData)
  const rawArea = component.width * component.height
  const isBelowStandardSize = component.width < standardMinWidth || component.height < standardMinHeight
  const minimumFillPixelRatio = isBelowStandardSize ? 0.0002 : 0.003
  const isTallNarrowCandidate = isTallNarrowStepCalloutRegionCandidate(imageData, component)

  if (
    component.count < Math.max(80, imageArea * minimumFillPixelRatio) ||
    component.width < minWidth ||
    component.height < minHeight ||
    component.width > maxWidth ||
    (component.height > maxHeight && !isTallNarrowCandidate) ||
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
  const isSmallCalloutCandidate =
    borderedRegion.width < standardMinWidth || borderedRegion.height < standardMinHeight
  if (borderScore < (isSmallCalloutCandidate ? 0.3 : 0.22)) {
    return null
  }
  if (!hasCalloutInteriorFillEvidenceForRegion(imageData, borderedRegion)) {
    return null
  }
  if (isSmallCalloutCandidate && !hasSmallStepCalloutAcceptanceEvidence(imageData, borderedRegion)) {
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

function createSmallBorderedStepCalloutRegionCandidate(
  imageData: DetectionImageData,
  rawRegion: PixelRegion,
  maxWidth: number,
  maxHeight: number,
): RegionCandidate | null {
  const minWidth = getMinimumSmallStepCalloutRegionWidth(imageData)
  const minHeight = getMinimumSmallStepCalloutRegionHeight(imageData)
  const standardMinWidth = getMinimumStepCalloutRegionWidth(imageData)
  const standardMinHeight = getMinimumStepCalloutRegionHeight(imageData)
  const searchRadius = Math.max(3, Math.round(Math.min(imageData.width, imageData.height) * 0.005))
  const region = snapRegionToDarkBorder(imageData, rawRegion, searchRadius)
  const isSmallRegion = region.width < standardMinWidth || region.height < standardMinHeight

  if (
    !isSmallRegion ||
    region.width < minWidth ||
    region.height < minHeight ||
    region.width > maxWidth ||
    region.height > maxHeight
  ) {
    return null
  }

  const borderScore = getRegionBorderScore(imageData, region, isSoftStepCalloutBorderPixel)
  if (borderScore < 0.28 || !hasStepLabelAnchoredRectangleEvidence(imageData, region, isSoftStepCalloutBorderPixel)) {
    return null
  }

  const fillRatio = getCalloutInteriorFillEvidenceRatio(imageData, region)
  const blueFillRatio = getBlueCalloutInteriorFillEvidenceRatio(imageData, region)
  const hasQuantityLabelEvidence = hasSmallStepCalloutQuantityLabelEvidence(imageData, region)
  const hasNearbyStepGlyphEvidence = hasNearbyStepNumberGlyphEvidence(imageData, region)
  const hasStrongRectangleEvidence = borderScore >= 0.72 || fillRatio >= 0.62
  if (
    fillRatio < 0.12 ||
    blueFillRatio < getMinimumSmallStepCalloutBlueFillRatio(region) ||
    (!hasQuantityLabelEvidence && (!hasNearbyStepGlyphEvidence || !hasStrongRectangleEvidence)) ||
    (hasQuantityLabelEvidence && !hasStrongRectangleEvidence && !hasNearbyStepGlyphEvidence)
  ) {
    return null
  }
  const aspectRatio = region.width / Math.max(1, region.height)
  if (
    region.y > imageData.height * 0.56 &&
    aspectRatio >= 1.65 &&
    (
      (hasQuantityLabelEvidence && !hasNearbyStepGlyphEvidence) ||
      region.y > imageData.height * 0.72
    )
  ) {
    return null
  }

  const confidence = clamp(0.18 + (fillRatio * 0.24) + (borderScore * 0.58), 0, 1)

  return {
    ...region,
    borderScore,
    confidence,
    fillRatio,
  }
}

function hasCalloutInteriorFillEvidenceForRegion(imageData: DetectionImageData, region: PixelRegion) {
  return getCalloutInteriorFillEvidenceRatio(imageData, region) >= 0.12
}

function getCalloutInteriorFillEvidenceRatio(imageData: DetectionImageData, region: PixelRegion) {
  const inset = Math.max(3, Math.round(Math.min(region.width, region.height) * 0.04))
  const interior = normalizeRegion({
    height: region.height - inset * 2,
    width: region.width - inset * 2,
    x: region.x + inset,
    y: region.y + inset,
  }, imageData.width, imageData.height)
  let fillPixels = 0
  let sampledPixels = 0
  const step = Math.max(1, Math.round(Math.min(region.width, region.height) * 0.018))

  for (let y = interior.y; y < interior.y + interior.height; y += step) {
    for (let x = interior.x; x < interior.x + interior.width; x += step) {
      sampledPixels += 1
      if (isLikelyCalloutInteriorFillPixel(imageData, x, y)) {
        fillPixels += 1
      }
    }
  }

  return fillPixels / Math.max(1, sampledPixels)
}

function getBlueCalloutInteriorFillEvidenceRatio(imageData: DetectionImageData, region: PixelRegion) {
  const inset = Math.max(3, Math.round(Math.min(region.width, region.height) * 0.04))
  const interior = normalizeRegion({
    height: region.height - inset * 2,
    width: region.width - inset * 2,
    x: region.x + inset,
    y: region.y + inset,
  }, imageData.width, imageData.height)
  let fillPixels = 0
  let sampledPixels = 0
  const step = Math.max(1, Math.round(Math.min(region.width, region.height) * 0.018))

  for (let y = interior.y; y < interior.y + interior.height; y += step) {
    for (let x = interior.x; x < interior.x + interior.width; x += step) {
      sampledPixels += 1
      if (isLikelyBlueCalloutInteriorFillPixel(imageData, x, y)) {
        fillPixels += 1
      }
    }
  }

  return fillPixels / Math.max(1, sampledPixels)
}

function hasSmallStepCalloutBlueFillEvidence(imageData: DetectionImageData, region: PixelRegion) {
  return getBlueCalloutInteriorFillEvidenceRatio(imageData, region) >= getMinimumSmallStepCalloutBlueFillRatio(region)
}

function getMinimumSmallStepCalloutBlueFillRatio(region: PixelRegion) {
  return region.width * region.height < 9_000 ? 0.08 : 0.1
}

function isLikelyBlueCalloutInteriorFillPixel(imageData: DetectionImageData, x: number, y: number) {
  const dataIndex = ((Math.floor(y) * imageData.width) + Math.floor(x)) * 4
  const alpha = imageData.data[dataIndex + 3] ?? 255
  if (alpha < 32) {
    return false
  }

  const r = imageData.data[dataIndex] ?? 0
  const g = imageData.data[dataIndex + 1] ?? 0
  const b = imageData.data[dataIndex + 2] ?? 0
  const brightness = (r + g + b) / 3

  return (
    brightness >= 185 &&
    brightness <= 252 &&
    b > r + 8 &&
    g > r + 6 &&
    b >= g - 8
  )
}

function hasSmallStepCalloutAcceptanceEvidence(imageData: DetectionImageData, region: PixelRegion) {
  const hasCalloutContext = (
    hasSmallStepCalloutQuantityLabelEvidence(imageData, region) ||
    hasNearbyStepNumberGlyphEvidence(imageData, region)
  )

  return hasCalloutContext &&
    hasSmallStepCalloutBlueFillEvidence(imageData, region) &&
    hasSmallStepCalloutPartItemRegionEvidence(imageData, region)
}

function hasSmallStepCalloutPartItemRegionEvidence(imageData: DetectionImageData, region: PixelRegion) {
  const croppedRegion = padRegion(region, imageData.width, imageData.height, 1)

  return detectStepCalloutPartItemRegionsFromImageData(cropDetectionImageDataRegion(imageData, croppedRegion)).length > 0
}

function hasSmallStepCalloutQuantityLabelEvidence(imageData: DetectionImageData, region: PixelRegion) {
  const interior = getSmallStepCalloutInteriorRegion(imageData, region)
  const labelRegion = normalizeRegion({
    height: Math.max(1, Math.round(interior.height * 0.58)),
    width: interior.width,
    x: interior.x,
    y: interior.y + Math.floor(interior.height * 0.42),
  }, imageData.width, imageData.height)

  return (
    getReadableQuantityEvidenceRegions(imageData, labelRegion, 0.45).length > 0 ||
    hasQuantityDelimiterEvidence(imageData, labelRegion)
  )
}

function hasNearbyStepNumberGlyphEvidence(imageData: DetectionImageData, region: PixelRegion) {
  const horizontalPadding = Math.max(90, Math.round(region.width * 2.8))
  const verticalPaddingAbove = Math.max(48, Math.round(region.height * 1.55))
  const verticalPaddingBelow = Math.max(10, Math.round(region.height * 0.35))
  const searchRegion = normalizeRegion({
    height: region.height + verticalPaddingAbove + verticalPaddingBelow,
    width: region.width + horizontalPadding + Math.max(12, Math.round(region.width * 0.4)),
    x: region.x - horizontalPadding,
    y: region.y - verticalPaddingAbove,
  }, imageData.width, imageData.height)
  const excludedRegion = expandRegion(region, imageData, 3)
  const minHeight = Math.max(13, Math.round(region.height * 0.48))
  const minWidth = Math.max(5, Math.round(region.width * 0.1))
  const minCount = Math.max(18, Math.round(minHeight * minWidth * 0.5))

  return collectDarkComponents(imageData, searchRegion, isDarkPixel)
    .some((component) => {
      if (intersectRegions(component, excludedRegion)) {
        return false
      }

      const centerY = getRegionCenterY(component)
      const verticallyNearCalloutTop = centerY <= region.y + region.height * 0.55
      const horizontallyNearCallout = component.x <= region.x + region.width * 1.35
      const isLargeGlyph =
        component.height >= minHeight &&
        component.width >= minWidth &&
        component.count >= minCount &&
        component.count / Math.max(1, component.width * component.height) >= 0.18

      return verticallyNearCalloutTop && horizontallyNearCallout && isLargeGlyph
    })
}

function getSmallStepCalloutInteriorRegion(imageData: DetectionImageData, region: PixelRegion) {
  const inset = Math.max(3, Math.round(Math.min(region.width, region.height) * 0.06))

  return normalizeRegion({
    height: region.height - inset * 2,
    width: region.width - inset * 2,
    x: region.x + inset,
    y: region.y + inset,
  }, imageData.width, imageData.height)
}

function hasQuantityDelimiterEvidence(imageData: DetectionImageData, region: PixelRegion) {
  const components = collectDarkComponents(imageData, region, isQuantityTextPixel)
    .filter((component) =>
      component.height >= Math.max(4, Math.round(region.height * 0.12)) &&
      component.width >= 2 &&
      component.count >= 4
    )
  if (components.length < 2) {
    return false
  }

  const medianHeight = median(components.map((component) => component.height)) ?? 6
  const lineTolerance = Math.max(4, Math.round(medianHeight * 0.85))
  const maxComponentGap = Math.max(5, Math.round(medianHeight * 1.35))
  const lines: DarkComponent[][] = []

  for (const component of [...components].sort((left, right) => getRegionCenterY(left) - getRegionCenterY(right))) {
    const line = lines.find((candidateLine) =>
      Math.abs(getQuantityComponentLineCenterY(candidateLine) - getRegionCenterY(component)) <= lineTolerance
    )
    if (line) {
      line.push(component)
    } else {
      lines.push([component])
    }
  }

  for (const line of lines) {
    const sortedLine = [...line].sort((left, right) => left.x - right.x || left.y - right.y)
    for (let markerIndex = 1; markerIndex < sortedLine.length; markerIndex += 1) {
      const marker = sortedLine[markerIndex]
      const previous = sortedLine[markerIndex - 1]
      if (!marker || !previous) {
        continue
      }

      const gap = marker.x - (previous.x + previous.width)
      if (
        gap <= maxComponentGap * 2 &&
        getVerticalOverlapRatio(marker, previous) >= 0.2 &&
        isLikelyQuantityMarkerRegion(imageData, expandRegion(marker, imageData, 1))
      ) {
        return true
      }
    }
  }

  return false
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

function getRegionBorderScore(
  imageData: DetectionImageData,
  region: PixelRegion,
  pixelMatcher: PixelMatcher = isDarkPixel,
) {
  const left = getVerticalDarkCoverage(imageData, region.x, region.y, region.y + region.height - 1, pixelMatcher)
  const right = getVerticalDarkCoverage(
    imageData,
    region.x + region.width - 1,
    region.y,
    region.y + region.height - 1,
    pixelMatcher,
  )
  const top = getHorizontalDarkCoverage(imageData, region.y, region.x, region.x + region.width - 1, pixelMatcher)
  const bottom = getHorizontalDarkCoverage(
    imageData,
    region.y + region.height - 1,
    region.x,
    region.x + region.width - 1,
    pixelMatcher,
  )

  return (left + right + top + bottom) / 4
}

function getVerticalDarkCoverage(
  imageData: DetectionImageData,
  x: number,
  startY: number,
  endY: number,
  pixelMatcher: PixelMatcher = isDarkPixel,
) {
  let darkPixels = 0
  let totalPixels = 0
  const boundedStartY = Math.max(0, Math.floor(startY))
  const boundedEndY = Math.min(imageData.height - 1, Math.ceil(endY))

  for (let y = boundedStartY; y <= boundedEndY; y += 1) {
    totalPixels += 1
    if (pixelMatcher(imageData, x, y)) {
      darkPixels += 1
    }
  }

  return totalPixels === 0 ? 0 : darkPixels / totalPixels
}

function getHorizontalDarkCoverage(
  imageData: DetectionImageData,
  y: number,
  startX: number,
  endX: number,
  pixelMatcher: PixelMatcher = isDarkPixel,
) {
  let darkPixels = 0
  let totalPixels = 0
  const boundedStartX = Math.max(0, Math.floor(startX))
  const boundedEndX = Math.min(imageData.width - 1, Math.ceil(endX))

  for (let x = boundedStartX; x <= boundedEndX; x += 1) {
    totalPixels += 1
    if (pixelMatcher(imageData, x, y)) {
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

function isSoftStepCalloutBorderPixel(imageData: DetectionImageData, x: number, y: number) {
  const dataIndex = ((Math.floor(y) * imageData.width) + Math.floor(x)) * 4
  const alpha = imageData.data[dataIndex + 3] ?? 255
  if (alpha < 32) {
    return false
  }

  const r = imageData.data[dataIndex] ?? 0
  const g = imageData.data[dataIndex + 1] ?? 0
  const b = imageData.data[dataIndex + 2] ?? 0
  const brightness = (r + g + b) / 3

  return brightness < 142
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
    const duplicateIndex = selected.findIndex((existing) => areDuplicativeRegionCandidates(existing, candidate))
    if (duplicateIndex >= 0) {
      const existing = selected[duplicateIndex]
      if (existing && isBetterDuplicateRegionCandidate(candidate, existing)) {
        selected[duplicateIndex] = candidate
      }
      continue
    }

    selected.push(candidate)
  }

  return selected
}

function areDuplicativeRegionCandidates(left: PixelRegion, right: PixelRegion) {
  if (getIntersectionOverUnion(left, right) > 0.65) {
    return true
  }

  const intersection = intersectRegions(left, right)
  if (!intersection) {
    return false
  }

  const intersectionArea = intersection.width * intersection.height
  const smallerArea = Math.min(left.width * left.height, right.width * right.height)

  return intersectionArea / Math.max(1, smallerArea) >= 0.82
}

function isBetterDuplicateRegionCandidate(candidate: RegionCandidate, existing: RegionCandidate) {
  const candidateArea = candidate.width * candidate.height
  const existingArea = existing.width * existing.height

  if (candidateArea >= existingArea * 1.2 && candidate.confidence >= existing.confidence - 0.08) {
    return true
  }

  return candidate.confidence > existing.confidence + 0.04
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
    colorPalette,
    nativeTextItems,
    pageOffsetX,
    pageOffsetY,
    partFeatureEntries,
    stepIndex,
  }: {
    calloutIdPrefix: string
    calloutIndex: number
    colorPalette: readonly StepPartColorPaletteEntry[]
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
  const interiorRegion = getCalloutInteriorRegion(imageData)

  const detectedRegions = detectStepCalloutPartItemRegionsFromImageData(imageData)
  const detectedQuantityGlyphExclusionRegions = detectedRegions.flatMap((region) =>
    getPartPreviewQuantityGlyphExclusionRegions(imageData, region.quantityRegion, region.quantity)
  )

  return detectedRegions.map((region, index) => {
    const itemRegion = padRegionWithin(region.itemRegion, canvas.width, canvas.height, itemCropPaddingPixels, interiorRegion)
    const detectedQuantityRegion = padRegion(region.quantityRegion, canvas.width, canvas.height, 2)
    const itemSourceRegion = toPageSourceRegion(itemRegion, pageOffsetX, pageOffsetY)
    const detectedQuantitySourceRegion = toPageSourceRegion(detectedQuantityRegion, pageOffsetX, pageOffsetY)
    const quantityRead = readQuantityFromNativeTextItems(nativeTextItems ?? [], detectedQuantitySourceRegion) ??
      readQuantityFromNativeTextItems(nativeTextItems ?? [], itemSourceRegion) ?? {
        quantity: region.quantity,
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
    const quantityGlyphExclusionRegions = [
      ...detectedQuantityGlyphExclusionRegions,
      ...getPartPreviewQuantityGlyphExclusionRegions(imageData, quantityRegion, quantity),
    ]
    const partContentRegion = getPartPreviewContentSearchRegion(
      region,
      detectedRegions,
      canvas.width,
      canvas.height,
      interiorRegion,
    )
    const ownedPartContent = getOwnedPartContentForeground(
      imageData,
      partContentRegion,
      background,
      quantityGlyphExclusionRegions,
      region,
      detectedRegions,
    )
    const ownedPartRegion = constrainOwnedPartContentRegionToDetectedPart(
      ownedPartContent.region,
      region,
      canvas.width,
      canvas.height,
      interiorRegion,
    )
    const partDisplayRegion = padPartRegion(
      ownedPartRegion,
      canvas.width,
      canvas.height,
      itemCropPaddingPixels,
      interiorRegion,
    )
    const detectedColor = detectPartColorFromImageData(
      imageData,
      ownedPartRegion,
      background,
      quantityGlyphExclusionRegions,
      colorPalette,
    )
    const feature = createStepPartImageFeature(imageData, ownedPartRegion, quantityGlyphExclusionRegions)
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
      partCrop: cropCanvasRegionRemovingBackground(
        canvas,
        imageData,
        partDisplayRegion,
        background,
        ownedPartContent.foregroundMask,
      ),
      partRegion: toPageSourceRegion(ownedPartRegion, pageOffsetX, pageOffsetY),
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
  const match = /^(\d+)x$/i.exec(text)
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
  if (!digitRunRegion) {
    return {
      confidence: 0,
      text: null,
      value: null,
    }
  }

  const glyphs = getQuantityGlyphRegions(imageData, digitRunRegion)
  const glyphQuantity = readQuantityFromGlyphRegions(imageData, glyphs)
  const selectedQuantity = glyphQuantity

  if (!selectedQuantity.value) {
    return {
      confidence: 0,
      text: null,
      value: null,
    }
  }
  if (isSingleDigitQuantityEmbeddedInNoisyTextRegion(textRegion, glyphs, selectedQuantity)) {
    return {
      confidence: 0,
      text: null,
      value: null,
    }
  }

  const { confidence, text, value } = selectedQuantity

  return {
    confidence,
    text,
    value: isPlausibleCalloutQuantityText(text, value) ? value : null,
  }
}

function isSingleDigitQuantityEmbeddedInNoisyTextRegion(
  textRegion: PixelRegion | null,
  glyphs: readonly PixelRegion[],
  quantity: QuantityEstimate,
) {
  if (!textRegion || !quantity.text || quantity.text.length !== 1 || glyphs.length === 0) {
    return false
  }

  const digitRegion = unionRegions(glyphs.slice(0, quantity.text.length))
  if (!digitRegion) {
    return false
  }

  return (
    digitRegion.height <= 10 &&
    textRegion.height >= digitRegion.height + 5 &&
    digitRegion.height / Math.max(1, textRegion.height) < 0.72
  )
}

function isPlausibleCalloutQuantityText(text: string | null, value: number | null) {
  if (!Number.isInteger(value) || value == null || value <= 0) {
    return false
  }

  return true
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

    const minContinuationConfidence = classification.char === "0" ? 0.6 : 0.68
    if (digits.length > 0 && classification.confidence < minContinuationConfidence) {
      break
    }

    digits.push(classification.char)
    confidences.push(classification.confidence)
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

function isLikelyFourQuantityGlyph(imageData: DetectionImageData, glyphRegion: PixelRegion) {
  const densities = getQuantityGlyphDensities(imageData, glyphRegion)
  const middleLeft = getQuantityGridAreaDensity(densities, 0, 3, 2, 1)
  const middleCenter = getQuantityGridAreaDensity(densities, 1, 3, 3, 1)
  const middleRight = getQuantityGridAreaDensity(densities, 3, 3, 2, 1)
  const middle = getQuantityGridAreaDensity(densities, 0, 3, 5, 1)
  const bottom = getQuantityGridAreaDensity(densities, 0, 5, 5, 2)
  const upperLeft = getQuantityGridAreaDensity(densities, 0, 1, 2, 2)
  const upperRight = getQuantityGridAreaDensity(densities, 3, 1, 2, 2)
  const lowerLeft = getQuantityGridAreaDensity(densities, 0, 4, 2, 2)
  const lowerRight = getQuantityGridAreaDensity(densities, 3, 4, 2, 2)
  const hasCrossbar = middle > 0.12 && middleLeft > 0.08 && middleCenter > 0.12 && middleRight > 0.08
  const hasClassicOpenFourShape = (
    upperLeft > 0.08 &&
    upperRight > 0.06 &&
    lowerRight > 0.06 &&
    lowerLeft < Math.max(0.1, upperLeft * 0.9) &&
    bottom < 0.36
  )
  const hasSlantedFourShape = (
    upperRight > 0.16 &&
    lowerLeft > 0.16 &&
    lowerRight > 0.16 &&
    middleLeft > 0.16 &&
    bottom < 0.48
  )

  return hasCrossbar && (hasClassicOpenFourShape || hasSlantedFourShape)
}

function getPartPreviewQuantityGlyphExclusionRegions(
  imageData: DetectionImageData,
  quantityRegion: PixelRegion,
  quantity: QuantityEstimate,
) {
  if (!quantity.value || quantity.confidence < 0.72) {
    return []
  }

  const textRegion = trimRegionToQuantityText(imageData, quantityRegion)
  if (!textRegion) {
    return []
  }

  const glyphs = getQuantityGlyphRegions(imageData, textRegion)

  return glyphs.length > 0
    ? glyphs.map((glyph) => expandRegion(glyph, imageData, 1))
    : [expandRegion(textRegion, imageData, 1)]
}

function getQuantityDigitRunRegion(imageData: DetectionImageData, quantityRegion: PixelRegion) {
  const textRegion = trimRegionToQuantityText(imageData, quantityRegion)
  if (!textRegion) {
    return null
  }

  const glyphs = getQuantityGlyphRegions(imageData, textRegion)
  const markerStartIndex = getQuantityMarkerSuffixStartIndex(imageData, glyphs)
  if (markerStartIndex != null) {
    const markerGlyph = unionRegions(glyphs.slice(markerStartIndex))
    return markerGlyph
      ? getTrailingQuantityDigitRunRegion(imageData, glyphs.slice(0, markerStartIndex), markerGlyph, textRegion)
      : null
  }

  const separatorX = findQuantityMarkerSeparatorX(imageData, textRegion)
  if (!separatorX) {
    return null
  }

  const leftRegion = trimRegionToQuantityText(imageData, {
    height: textRegion.height,
    width: separatorX - textRegion.x,
    x: textRegion.x,
    y: textRegion.y,
  })
  const markerRegion = trimRegionToQuantityText(imageData, {
    height: textRegion.height,
    width: textRegion.x + textRegion.width - separatorX,
    x: separatorX,
    y: textRegion.y,
  })

  return leftRegion && markerRegion
    ? getTrailingQuantityDigitRunRegion(imageData, getQuantityGlyphRegions(imageData, leftRegion), markerRegion, textRegion)
    : null
}

function getTrailingQuantityDigitRunRegion(
  imageData: DetectionImageData,
  glyphs: readonly PixelRegion[],
  markerRegion: PixelRegion,
  textRegion: PixelRegion,
) {
  const digitGlyphs: PixelRegion[] = []
  const maxInitialGap = Math.max(4, Math.round(textRegion.height * 0.78))
  const maxDigitGap = Math.max(4, Math.round(textRegion.height * 0.72))
  let nextLeftEdge = markerRegion.x

  for (let index = glyphs.length - 1; index >= 0; index -= 1) {
    const glyph = glyphs[index]
    if (!glyph) {
      continue
    }

    const gap = nextLeftEdge - (glyph.x + glyph.width)
    const comparisonRegion = digitGlyphs[0] ?? markerRegion
    const verticalOverlap = getVerticalOverlapRatio(glyph, comparisonRegion)
    const centerDelta = Math.abs(getRegionCenterY(glyph) - getRegionCenterY(comparisonRegion))
    const maxGap = digitGlyphs.length === 0 ? maxInitialGap : maxDigitGap
    if (
      gap > maxGap ||
      (
        verticalOverlap < 0.28 &&
        centerDelta > Math.max(4, textRegion.height * 0.42)
      )
    ) {
      if (digitGlyphs.length > 0) {
        break
      }
      continue
    }

    const classification = classifyQuantityGlyph(imageData, glyph)
    if (!classification || classification.char === "x") {
      if (digitGlyphs.length > 0) {
        break
      }
      continue
    }

    digitGlyphs.unshift(glyph)
    nextLeftEdge = glyph.x
  }

  const digitRegion = digitGlyphs.length > 0 ? unionRegions(digitGlyphs) : null
  if (!digitRegion || markerRegion.x < digitRegion.x + digitRegion.width) {
    return null
  }

  return trimRegionToQuantityText(imageData, digitRegion) ?? digitRegion
}

function getQuantityMarkerSuffixStartIndex(
  imageData: DetectionImageData,
  glyphs: readonly PixelRegion[],
) {
  if (glyphs.length < 2) {
    return null
  }

  const maxMarkerGlyphs = glyphs.length - 1
  for (let markerGlyphCount = 1; markerGlyphCount <= maxMarkerGlyphs; markerGlyphCount += 1) {
    const startIndex = glyphs.length - markerGlyphCount
    const markerRegion = unionRegions(glyphs.slice(startIndex))
    if (markerRegion && isLikelyQuantityMarkerRegion(imageData, markerRegion)) {
      return startIndex
    }
  }

  return null
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

    const rightRegion = trimRegionToQuantityText(imageData, {
      height: boundedRegion.height,
      width: boundedRegion.width - index,
      x: boundedRegion.x + index,
      y: boundedRegion.y,
    })
    if (!rightRegion || !isLikelyQuantityMarkerRegion(imageData, rightRegion)) {
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

    const trailingMarkerRegion = unionRegions(components.slice(index))
    const hasLikelyTrailingMarker = trailingMarkerRegion
      ? isLikelyQuantityMarkerRegion(imageData, trailingMarkerRegion)
      : false

    if (
      gap >= 1 &&
      leftInkRatio >= 0.18 &&
      rightInkRatio >= 0.15 &&
      rightInkRatio <= 0.72 &&
      hasLikelyTrailingMarker
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

function isLikelyQuantityMarkerRegion(imageData: DetectionImageData, region: PixelRegion) {
  const textRegion = trimRegionToQuantityText(imageData, region)
  if (!textRegion) {
    return false
  }

  const aspectRatio = textRegion.width / Math.max(1, textRegion.height)
  if (aspectRatio < 0.45 || aspectRatio > 1.8) {
    return false
  }

  const densities = getQuantityGlyphDensities(imageData, textRegion)
  const xTemplateScore = scoreQuantityGlyphTemplate(
    densities,
    quantityGlyphTemplates.find((template) => template.char === "x")?.pattern ?? "",
  )
  const bestDigitScore = Math.max(
    ...quantityGlyphTemplates
      .filter((template) => template.char !== "x")
      .map((template) => scoreQuantityGlyphTemplate(densities, template.pattern)),
  )
  const featureClassification = classifyQuantityGlyphByFeatures(densities, aspectRatio)

  return (
    (featureClassification?.char === "x" && xTemplateScore >= Math.max(0.42, bestDigitScore - 0.08)) ||
    (xTemplateScore >= 0.46 && xTemplateScore >= bestDigitScore - 0.12)
  )
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
    if (glyph.width <= glyph.height * 0.78 || isLikelyQuantityMarkerRegion(imageData, glyph)) {
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
  const oneTemplate = templateScores.find((template) => template.char === "1")
  const oneFeatureClassification = classifyOneQuantityGlyphByFeatures(densities, aspectRatio)
  const zeroFeatureClassification = classifyZeroQuantityGlyphByFeatures(densities, aspectRatio)
  const twoFeatureClassification = classifyTwoQuantityGlyphByFeatures(densities, aspectRatio)
  const fiveFeatureClassification = classifyFiveQuantityGlyphByFeatures(densities, aspectRatio)
  const sevenFeatureClassification = classifySevenQuantityGlyphByFeatures(densities, aspectRatio)
  const eightFeatureClassification = classifyEightQuantityGlyphByFeatures(densities, aspectRatio)
  const nineFeatureClassification = classifyNineQuantityGlyphByFeatures(densities, aspectRatio)
  const sixFeatureClassification = classifySixQuantityGlyphByFeatures(densities, aspectRatio)
  const fourFeatureClassification = featureClassification?.char === "4" ? featureClassification : null
  if (aspectRatio < 0.48 && bestTemplate.char !== "x") {
    return {
      char: "1",
      confidence: Math.max(oneFeatureClassification?.confidence ?? 0, 0.78),
    }
  }

  if (
    aspectRatio < 0.5 &&
    bestTemplate.char !== "x" &&
    featureClassification?.char === "4" &&
    bestTemplate.confidence < 0.72
  ) {
    return {
      char: "1",
      confidence: Math.max(oneFeatureClassification?.confidence ?? 0, 0.76),
    }
  }

  if (
    aspectRatio < 0.5 &&
    bestTemplate.char === "x" &&
    isRightStemmedOneQuantityGlyph(densities)
  ) {
    return {
      char: "1",
      confidence: 0.76,
    }
  }

  if (
    sevenFeatureClassification &&
    bestTemplate.char === "7" &&
    sevenFeatureClassification.confidence >= bestTemplate.confidence - 0.12
  ) {
    return sevenFeatureClassification
  }

  if (
    twoFeatureClassification &&
    ["2", "6", "7"].includes(bestTemplate.char) &&
    twoFeatureClassification.confidence >= bestTemplate.confidence - 0.18
  ) {
    return twoFeatureClassification
  }

  if (
    zeroFeatureClassification &&
    ["0", "4", "6", "8", "9"].includes(bestTemplate.char) &&
    zeroFeatureClassification.confidence >= bestTemplate.confidence - 0.18
  ) {
    return zeroFeatureClassification
  }

  if (
    fiveFeatureClassification &&
    ["4", "5", "6", "9"].includes(bestTemplate.char) &&
    fiveFeatureClassification.confidence >= bestTemplate.confidence - 0.16
  ) {
    return fiveFeatureClassification
  }

  if (
    nineFeatureClassification &&
    ["3", "4", "8", "9"].includes(bestTemplate.char) &&
    nineFeatureClassification.confidence >= bestTemplate.confidence - 0.18
  ) {
    return nineFeatureClassification
  }

  if (
    sixFeatureClassification &&
    isLeftWeightedSixQuantityGlyph(densities) &&
    sixFeatureClassification.confidence >= bestTemplate.confidence - 0.18
  ) {
    return sixFeatureClassification
  }

  if (
    sixFeatureClassification &&
    isOpenSixQuantityGlyph(densities) &&
    sixFeatureClassification.confidence >= bestTemplate.confidence - 0.16
  ) {
    return sixFeatureClassification
  }

  if (
    eightFeatureClassification &&
    ["0", "2", "5", "6", "8", "9"].includes(bestTemplate.char) &&
    eightFeatureClassification.confidence >= bestTemplate.confidence - 0.16
  ) {
    return eightFeatureClassification
  }

  if (
    sixFeatureClassification &&
    sixFeatureClassification.confidence >= bestTemplate.confidence - 0.08
  ) {
    return sixFeatureClassification
  }

  if (
    bestTemplate.char === "4" &&
    bestTemplate.confidence >= 0.58 &&
    isLikelyFourQuantityGlyph(imageData, glyphRegion)
  ) {
    return {
      char: "4",
      confidence: bestTemplate.confidence,
    }
  }

  if (
    bestTemplate.char === "9" &&
    bestTemplate.confidence < 0.72 &&
    featureClassification?.char === "3" &&
    featureClassification.confidence >= bestTemplate.confidence - 0.12
  ) {
    return featureClassification
  }

  if ((bestTemplate.char === "0" || bestTemplate.char === "9") && bestTemplate.confidence >= 0.58) {
    return {
      char: bestTemplate.char,
      confidence: bestTemplate.confidence,
    }
  }

  if (
    oneFeatureClassification &&
    oneTemplate &&
    oneTemplate.confidence >= bestTemplate.confidence - 0.18 &&
    !fourFeatureClassification
  ) {
    return {
      char: "1",
      confidence: Math.max(oneTemplate.confidence, oneFeatureClassification.confidence, 0.78),
    }
  }

  if (oneFeatureClassification && aspectRatio < 0.5) {
    return {
      char: "1",
      confidence: Math.max(oneFeatureClassification.confidence, oneTemplate?.confidence ?? 0, 0.8),
    }
  }

  if (
    featureClassification &&
    ["2", "3", "4"].includes(featureClassification.char) &&
    featureClassification.confidence >= bestTemplate.confidence - 0.18 &&
    !(
      oneFeatureClassification &&
      oneTemplate &&
      oneTemplate.confidence >= bestTemplate.confidence - 0.18
    )
  ) {
    return featureClassification
  }

  if (
    ["0", "2", "3", "4", "9"].includes(bestTemplate.char) &&
    bestTemplate.confidence >= 0.58
  ) {
    return {
      char: bestTemplate.char,
      confidence: bestTemplate.confidence,
    }
  }

  if (oneFeatureClassification && aspectRatio < 0.42) {
    return {
      char: "1",
      confidence: Math.max(oneFeatureClassification.confidence, 0.8),
    }
  }

  if (
    aspectRatio < 0.64 &&
    bestTemplate.char !== "x" &&
    oneTemplate &&
    oneTemplate.confidence >= bestTemplate.confidence - 0.22 &&
    oneFeatureClassification &&
    featureClassification?.char !== "2" &&
    featureClassification?.char !== "3" &&
    featureClassification?.char !== "4"
  ) {
    return {
      char: "1",
      confidence: Math.max(oneTemplate.confidence, oneFeatureClassification.confidence, 0.76),
    }
  }

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
      confidence: Math.max(bestTemplate.confidence, oneFeatureClassification?.confidence ?? 0, 0.78),
    }
  }

  if (
    aspectRatio < 0.52 &&
    bestTemplate.char !== "x" &&
    oneTemplate &&
    oneTemplate.confidence >= bestTemplate.confidence - 0.12 &&
    oneFeatureClassification &&
    featureClassification?.char !== "2" &&
    featureClassification?.char !== "3" &&
    featureClassification?.char !== "4"
  ) {
    return {
      char: "1",
      confidence: Math.max(oneTemplate.confidence, oneFeatureClassification.confidence, 0.78),
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

  if (bestTemplate.char === "6" && !hasPlausibleSixQuantityLoopBalance(densities)) {
    return null
  }

  if (bestTemplate.confidence < 0.52) {
    return null
  }

  return {
    char: bestTemplate.char,
    confidence: bestTemplate.confidence,
  }
}

function classifyOneQuantityGlyphByFeatures(
  densities: readonly number[],
  aspectRatio: number,
): QuantityGlyphClassification | null {
  const center = getQuantityGridAreaDensity(densities, 2, 0, 1, 7)
  const left = getQuantityGridAreaDensity(densities, 0, 0, 2, 7)
  const right = getQuantityGridAreaDensity(densities, 3, 0, 2, 7)
  const top = getQuantityGridAreaDensity(densities, 0, 0, 5, 2)
  const middle = getQuantityGridAreaDensity(densities, 0, 2, 5, 3)
  const bottom = getQuantityGridAreaDensity(densities, 0, 5, 5, 2)
  const middleLeft = getQuantityGridAreaDensity(densities, 0, 3, 2, 1)
  const middleRight = getQuantityGridAreaDensity(densities, 3, 3, 2, 1)
  const hasFourCrossbar = middleLeft > 0.08 && middleRight > 0.08

  if (aspectRatio < 0.42) {
    return { char: "1", confidence: 0.8 }
  }

  if (
    aspectRatio < 0.72 &&
    center > Math.max(left, right) + 0.03 &&
    middle > 0.08 &&
    top < 0.46 &&
    bottom < 0.56 &&
    !hasFourCrossbar
  ) {
    return { char: "1", confidence: 0.76 }
  }

  if (
    aspectRatio < 0.72 &&
    center > 0.12 &&
    left < 0.22 &&
    right < 0.22 &&
    middleLeft < 0.08 &&
    middleRight < 0.18 &&
    bottom < 0.58
  ) {
    return { char: "1", confidence: 0.74 }
  }

  return null
}

function isRightStemmedOneQuantityGlyph(densities: readonly number[]) {
  const left = getQuantityGridAreaDensity(densities, 0, 0, 2, 7)
  const right = getQuantityGridAreaDensity(densities, 3, 0, 2, 7)
  const top = getQuantityGridAreaDensity(densities, 0, 0, 5, 2)
  const bottom = getQuantityGridAreaDensity(densities, 0, 5, 5, 2)
  const upperRight = getQuantityGridAreaDensity(densities, 3, 1, 2, 2)
  const lowerRight = getQuantityGridAreaDensity(densities, 3, 4, 2, 2)
  const middleLeft = getQuantityGridAreaDensity(densities, 0, 3, 2, 1)
  const middleRight = getQuantityGridAreaDensity(densities, 3, 3, 2, 1)

  return (
    right > 0.42 &&
    upperRight > 0.32 &&
    lowerRight > 0.36 &&
    left < 0.22 &&
    middleLeft < 0.08 &&
    middleRight > 0.28 &&
    top > 0.35 &&
    bottom < 0.36
  )
}

function classifyZeroQuantityGlyphByFeatures(
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

  if (
    aspectRatio >= 0.5 &&
    top > 0.34 &&
    middle < 0.44 &&
    bottom > 0.34 &&
    center < 0.08 &&
    Math.min(upperLeft, upperRight, lowerLeft, lowerRight) > 0.26
  ) {
    return { char: "0", confidence: 0.78 }
  }

  return null
}

function classifyTwoQuantityGlyphByFeatures(
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

  if (
    aspectRatio >= 0.5 &&
    top > 0.32 &&
    middle > 0.12 &&
    bottom > 0.32 &&
    upperRight > 0.25 &&
    lowerLeft > 0.22 &&
    lowerRight < 0.16 &&
    (upperLeft > 0.12 || bottom > 0.36)
  ) {
    return { char: "2", confidence: 0.78 }
  }

  return null
}

function classifyFiveQuantityGlyphByFeatures(
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

  if (
    aspectRatio >= 0.5 &&
    top > 0.34 &&
    middle > 0.28 &&
    bottom > 0.34 &&
    upperLeft > 0.42 &&
    upperRight < Math.max(0.25, upperLeft * 0.55) &&
    lowerRight > 0.32 &&
    lowerLeft < upperLeft * 0.78
  ) {
    return { char: "5", confidence: 0.8 }
  }

  return null
}

function classifySevenQuantityGlyphByFeatures(
  densities: readonly number[],
  aspectRatio: number,
): QuantityGlyphClassification | null {
  const top = getQuantityGridAreaDensity(densities, 0, 0, 5, 2)
  const bottom = getQuantityGridAreaDensity(densities, 0, 5, 5, 2)
  const upperLeft = getQuantityGridAreaDensity(densities, 0, 1, 2, 2)
  const upperRight = getQuantityGridAreaDensity(densities, 3, 1, 2, 2)
  const lowerRight = getQuantityGridAreaDensity(densities, 3, 4, 2, 2)
  const center = getQuantityGridAreaDensity(densities, 2, 2, 1, 3)

  if (
    aspectRatio >= 0.5 &&
    top > 0.36 &&
    bottom < 0.3 &&
    upperLeft < 0.14 &&
    upperRight > 0.3 &&
    lowerRight < 0.16 &&
    center > 0.38
  ) {
    return { char: "7", confidence: 0.82 }
  }

  return null
}

function classifyEightQuantityGlyphByFeatures(
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

  if (
    aspectRatio >= 0.52 &&
    top > 0.38 &&
    middle > 0.45 &&
    bottom > 0.4 &&
    Math.min(upperLeft, upperRight, lowerLeft, lowerRight) > 0.35 &&
    center > 0.16
  ) {
    return { char: "8", confidence: 0.8 }
  }

  return null
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
  const middleLeft = getQuantityGridAreaDensity(densities, 0, 3, 2, 1)
  const middleCenter = getQuantityGridAreaDensity(densities, 1, 3, 3, 1)
  const middleRight = getQuantityGridAreaDensity(densities, 3, 3, 2, 1)
  const hasFourCrossbar = middleLeft > 0.08 && middleCenter > 0.12 && middleRight > 0.08

  if (
    aspectRatio >= 0.56 &&
    aspectRatio <= 0.86 &&
    hasFourCrossbar &&
    upperRight > 0.16 &&
    lowerLeft > 0.16 &&
    lowerRight > 0.16 &&
    middleLeft > 0.16 &&
    bottom < 0.5 &&
    top < 0.52
  ) {
    return { char: "4", confidence: 0.8 }
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
    aspectRatio >= 0.48 &&
    upperLeft > 0.18 &&
    upperRight > 0.08 &&
    middle > 0.12 &&
    hasFourCrossbar &&
    lowerRight > 0.08 &&
    lowerLeft < 0.08 &&
    bottom < 0.36
  ) {
    return { char: "4", confidence: 0.79 }
  }

  if (
    aspectRatio >= 0.45 &&
    upperLeft > 0.28 &&
    upperRight > 0.12 &&
    middle > 0.12 &&
    lowerRight > 0.08 &&
    lowerLeft < upperLeft * 0.48 &&
    bottom < 0.38
  ) {
    return { char: "4", confidence: 0.8 }
  }

  if (
    aspectRatio >= 0.5 &&
    top > 0.16 &&
    middle > 0.12 &&
    bottom > 0.16 &&
    bottom >= 0.24 &&
    upperRight > upperLeft + 0.03 &&
    lowerRight > lowerLeft + 0.04 &&
    upperLeft < 0.24
  ) {
    return { char: "3", confidence: 0.78 }
  }

  if (
    aspectRatio >= 0.52 &&
    upperLeft > 0.08 &&
    upperRight > 0.08 &&
    middle > 0.12 &&
    hasFourCrossbar &&
    lowerRight > 0.08 &&
    lowerLeft < Math.max(0.09, upperLeft * 0.85) &&
    (upperLeft > 0.18 || bottom < 0.24) &&
    bottom < 0.32 &&
    top < 0.65
  ) {
    return { char: "4", confidence: 0.78 }
  }

  if (
    aspectRatio >= 0.45 &&
    upperLeft > lowerLeft + 0.03 &&
    upperRight > 0.05 &&
    middle > 0.12 &&
    hasFourCrossbar &&
    lowerRight > 0.07 &&
    lowerLeft < lowerRight - 0.03 &&
    (upperLeft > 0.18 || bottom < 0.24) &&
    bottom < 0.34 &&
    top < 0.62
  ) {
    return { char: "4", confidence: 0.76 }
  }

  if (
    aspectRatio >= 0.5 &&
    top > 0.16 &&
    middle > 0.12 &&
    bottom > 0.16 &&
    upperRight > upperLeft + 0.03
  ) {
    if (lowerLeft > lowerRight + 0.04) {
      return { char: "2", confidence: 0.76 }
    }
    if (lowerRight > lowerLeft + 0.04) {
      return { char: "3", confidence: 0.76 }
    }
  }

  if (
    aspectRatio >= 0.45 &&
    hasPlausibleSixQuantityLoopBalance(densities) &&
    top > 0.16 &&
    middle > 0.12 &&
    bottom > 0.16 &&
    upperLeft > 0.08 &&
    lowerLeft > 0.08 &&
    lowerRight > 0.08 &&
    upperRight < upperLeft + 0.04
  ) {
    return { char: "6", confidence: 0.72 }
  }

  return null
}

function classifyNineQuantityGlyphByFeatures(
  densities: readonly number[],
  aspectRatio: number,
): QuantityGlyphClassification | null {
  const top = getQuantityGridAreaDensity(densities, 0, 0, 5, 2)
  const middle = getQuantityGridAreaDensity(densities, 0, 3, 5, 1)
  const bottom = getQuantityGridAreaDensity(densities, 0, 5, 5, 2)
  const upperLeft = getQuantityGridAreaDensity(densities, 0, 1, 2, 2)
  const upperLeftBody = getQuantityGridAreaDensity(densities, 0, 2, 2, 2)
  const upperRight = getQuantityGridAreaDensity(densities, 3, 1, 2, 2)
  const lowerLeft = getQuantityGridAreaDensity(densities, 0, 4, 2, 2)
  const lowerRight = getQuantityGridAreaDensity(densities, 3, 4, 2, 2)
  const hasOpenLowerLeftTail = lowerLeft < Math.max(0.14, lowerRight * 0.72)
  const hasLowerCourtyardNineTail =
    upperLeft >= lowerLeft * 1.55 &&
    lowerRight >= lowerLeft * 1.05 &&
    lowerLeft <= 0.34
  const hasRightOpenLowerCourtyardNineTail =
    upperLeft > upperRight + 0.08 &&
    lowerRight >= lowerLeft - 0.01 &&
    lowerLeft <= 0.46 &&
    upperRight <= 0.46
  const isRightWeightedOpenFour =
    upperRight > upperLeft + 0.08 &&
    lowerLeft <= 0.06 &&
    middle <= 0.32 &&
    bottom <= 0.34

  if (
    aspectRatio >= 0.45 &&
    top > 0.14 &&
    middle > 0.1 &&
    bottom > 0.14 &&
    upperLeft > 0.12 &&
    upperLeftBody > 0.1 &&
    upperRight > 0.08 &&
    lowerRight > 0.08 &&
    upperLeft >= upperRight * 0.58 &&
    !isRightWeightedOpenFour &&
    (upperLeft >= lowerLeft * 1.45 || hasRightOpenLowerCourtyardNineTail) &&
    (hasOpenLowerLeftTail || hasLowerCourtyardNineTail || hasRightOpenLowerCourtyardNineTail)
  ) {
    return { char: "9", confidence: 0.78 }
  }

  return null
}

function classifySixQuantityGlyphByFeatures(
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

  if (
    aspectRatio >= 0.45 &&
    hasPlausibleSixQuantityLoopBalance(densities) &&
    top > 0.14 &&
    middle > 0.1 &&
    bottom > 0.14 &&
    upperLeft > 0.08 &&
    lowerLeft > 0.08 &&
    lowerRight > 0.08 &&
    upperLeft >= upperRight * 0.85 &&
    lowerLeft >= lowerRight * 0.55 &&
    lowerRight >= lowerLeft * 0.55
  ) {
    return { char: "6", confidence: 0.78 }
  }

  return null
}

function hasPlausibleSixQuantityLoopBalance(densities: readonly number[]) {
  const top = getQuantityGridAreaDensity(densities, 0, 0, 5, 2)
  const bottom = getQuantityGridAreaDensity(densities, 0, 5, 5, 2)

  return (
    top >= 0.28 &&
    bottom >= 0.26 &&
    bottom <= Math.max(0.62, top * 1.8)
  )
}

function isLeftWeightedSixQuantityGlyph(densities: readonly number[]) {
  const upperLeft = getQuantityGridAreaDensity(densities, 0, 1, 2, 2)
  const upperRight = getQuantityGridAreaDensity(densities, 3, 1, 2, 2)
  const lowerLeft = getQuantityGridAreaDensity(densities, 0, 4, 2, 2)
  const lowerRight = getQuantityGridAreaDensity(densities, 3, 4, 2, 2)

  return (
    upperLeft >= upperRight * 1.35 &&
    lowerLeft >= lowerRight * 1.3
  )
}

function isOpenSixQuantityGlyph(densities: readonly number[]) {
  const upperLeft = getQuantityGridAreaDensity(densities, 0, 1, 2, 2)
  const upperRight = getQuantityGridAreaDensity(densities, 3, 1, 2, 2)
  const lowerLeft = getQuantityGridAreaDensity(densities, 0, 4, 2, 2)
  const lowerRight = getQuantityGridAreaDensity(densities, 3, 4, 2, 2)
  const center = getQuantityGridAreaDensity(densities, 2, 2, 1, 3)

  return (
    upperLeft >= upperRight * 1.32 &&
    upperRight <= 0.38 &&
    lowerLeft >= lowerRight * 0.82 &&
    lowerRight >= lowerLeft * 0.72 &&
    center < 0.26
  )
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
  colorPalette: readonly StepPartColorPaletteEntry[] = fallbackStepPartColorPalette,
): DetectedColorEstimate {
  const samples = collectPartColorSurfaceSamples(imageData, partRegion, background, excludedRegions)
  if (samples.length === 0) {
    return createUnknownColorEstimate()
  }

  const stats = createStepPartColorSampleStats(samples)
  const candidateScores = scoreStepPartColorCandidates(stats, colorPalette)
  const bestCandidate = selectStepPartColorCandidate(candidateScores, stats)
  if (!bestCandidate || stats.totalWeight === 0) {
    return createUnknownColorEstimate()
  }
  const transparentOrangeEstimate = detectTransparentOrangeColorEstimate(
    imageData,
    partRegion,
    background,
    excludedRegions,
    bestCandidate.color.name,
    colorPalette,
  )
  if (transparentOrangeEstimate) {
    return transparentOrangeEstimate
  }

  const selectedCandidate = applyStepPartColorFamilyTieBreakers(candidateScores, stats, bestCandidate)
  const secondCandidate = candidateScores.find((candidate) => candidate.color.name !== selectedCandidate.color.name)
  const scoreMargin = selectedCandidate.score - (secondCandidate?.score ?? 0)

  return {
    confidence: clamp((selectedCandidate.score * 0.78) + Math.max(0, scoreMargin) * 1.4, 0, 1),
    hex: rgbToHex(stats.meanRgb),
    name: selectedCandidate.color.name,
    rgb: stats.meanRgb,
  }
}

function createStepPartColorSampleStats(samples: readonly StepPartSurfaceSample[]): StepPartColorSampleStats {
  const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0)
  const meanRgb = getWeightedMeanColorSample(samples)
  const sortedSamples = [...samples].sort((left, right) => getColorBrightness(left) - getColorBrightness(right))
  const bandSize = Math.max(1, Math.round(sortedSamples.length * 0.35))
  const lowRgb = getWeightedMeanColorSample(sortedSamples.slice(0, bandSize))
  const highRgb = getWeightedMeanColorSample(sortedSamples.slice(-bandSize))

  return {
    chroma: getColorChroma(meanRgb),
    highRgb,
    lowRgb,
    meanRgb,
    sampleCount: samples.length,
    totalWeight,
  }
}

function getWeightedMeanColorSample(samples: readonly StepPartSurfaceSample[]): ColorSample {
  const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0)
  if (totalWeight === 0) {
    return { b: 128, g: 128, r: 128 }
  }

  return {
    b: Math.round(samples.reduce((sum, sample) => sum + sample.b * sample.weight, 0) / totalWeight),
    g: Math.round(samples.reduce((sum, sample) => sum + sample.g * sample.weight, 0) / totalWeight),
    r: Math.round(samples.reduce((sum, sample) => sum + sample.r * sample.weight, 0) / totalWeight),
  }
}

function scoreStepPartColorCandidates(
  stats: StepPartColorSampleStats,
  colorPalette: readonly StepPartColorPaletteEntry[],
): StepPartColorCandidateScore[] {
  return colorPalette
    .map((color) => {
      const distanceScore = Math.max(
        scoreColorDistance(stats.meanRgb, color.rgb, 210),
        (scoreColorDistance(stats.meanRgb, color.rgb, 210) * 0.72) +
          (scoreColorDistance(stats.lowRgb, color.rgb, 235) * 0.28),
        (scoreColorDistance(stats.meanRgb, color.rgb, 210) * 0.72) +
          (scoreColorDistance(stats.highRgb, color.rgb, 235) * 0.28),
      )
      const hueScore = scoreColorHue(stats.meanRgb, color.rgb)
      const brightnessScore = scoreAbsoluteDifference(
        getColorBrightness(stats.meanRgb),
        getColorBrightness(color.rgb),
        150,
      )
      const chromaScore = scoreAbsoluteDifference(stats.chroma, getColorChroma(color.rgb), 160)
      const isNeutral = isNeutralStepPartColor(stats.meanRgb) || isNeutralStepPartColor(color.rgb)
      const score = isNeutral
        ? (distanceScore * 0.52) + (brightnessScore * 0.34) + (chromaScore * 0.1) + (hueScore * 0.04)
        : (distanceScore * 0.44) + (hueScore * 0.32) + (chromaScore * 0.12) + (brightnessScore * 0.08) +
          (Math.max(
            scoreColorDistance(stats.lowRgb, color.rgb, 235),
            scoreColorDistance(stats.highRgb, color.rgb, 235),
          ) * 0.04)

      return {
        color,
        distanceScore,
        score,
      }
    })
    .sort((left, right) =>
      right.score - left.score ||
      right.distanceScore - left.distanceScore ||
      left.color.name.localeCompare(right.color.name)
    )
}

function selectStepPartColorCandidate(
  candidates: readonly StepPartColorCandidateScore[],
  stats: StepPartColorSampleStats,
) {
  const bestCandidate = candidates[0] ?? null
  if (!bestCandidate) {
    return null
  }

  return applyStepPartColorFamilyTieBreakers(candidates, stats, bestCandidate)
}

function applyStepPartColorFamilyTieBreakers(
  candidates: readonly StepPartColorCandidateScore[],
  stats: StepPartColorSampleStats,
  selected: StepPartColorCandidateScore,
) {
  return selectGrayShadeCandidate(candidates, stats, selected) ??
    selectGreenShadeCandidate(candidates, stats, selected) ??
    selectWarmNougatCandidate(candidates, stats, selected) ??
    selected
}

function selectGrayShadeCandidate(
  candidates: readonly StepPartColorCandidateScore[],
  stats: StepPartColorSampleStats,
  selected: StepPartColorCandidateScore,
) {
  const lightBluishGray = getStepPartColorCandidateByName(candidates, "Light Bluish Gray")
  const darkBluishGray = getStepPartColorCandidateByName(candidates, "Dark Bluish Gray")
  if (!lightBluishGray || !darkBluishGray) {
    return null
  }

  const selectedName = normalizeStepColorName(selected.color.name)
  if (selectedName !== "lightbluishgray" && selectedName !== "darkbluishgray") {
    return null
  }

  const scoreGap = Math.abs(lightBluishGray.score - darkBluishGray.score)
  if (scoreGap > 0.12) {
    return null
  }

  const meanBrightness = getColorBrightness(stats.meanRgb)
  const highBrightness = getColorBrightness(stats.highRgb)
  if (highBrightness >= 145 || meanBrightness >= 136) {
    return lightBluishGray
  }
  if (meanBrightness <= 132 && highBrightness <= 145) {
    return darkBluishGray
  }

  return null
}

function selectGreenShadeCandidate(
  candidates: readonly StepPartColorCandidateScore[],
  stats: StepPartColorSampleStats,
  selected: StepPartColorCandidateScore,
) {
  const green = getStepPartColorCandidateByName(candidates, "Green")
  const darkGreen = getStepPartColorCandidateByName(candidates, "Dark Green")
  if (!green || !darkGreen) {
    return null
  }

  const selectedName = normalizeStepColorName(selected.color.name)
  if (selectedName !== "green" && selectedName !== "darkgreen") {
    return null
  }

  const scoreGap = Math.abs(green.score - darkGreen.score)
  if (scoreGap > 0.16) {
    return null
  }

  const meanBrightness = getColorBrightness(stats.meanRgb)
  const highBrightness = getColorBrightness(stats.highRgb)
  if (meanBrightness <= 52 && highBrightness <= 58) {
    return darkGreen
  }
  if (highBrightness >= 62 || meanBrightness >= 64) {
    return green
  }

  return null
}

function selectWarmNougatCandidate(
  candidates: readonly StepPartColorCandidateScore[],
  stats: StepPartColorSampleStats,
  selected: StepPartColorCandidateScore,
) {
  const mediumNougat = getStepPartColorCandidateByName(candidates, "Medium Nougat")
  if (!mediumNougat) {
    return null
  }

  const selectedName = normalizeStepColorName(selected.color.name)
  if (!["brightlightorange", "darkorange", "mediumnougat", "tan", "yellow"].includes(selectedName)) {
    return null
  }

  const hue = getColorHue(stats.meanRgb)
  const brightness = getColorBrightness(stats.meanRgb)
  if (
    hue == null ||
    hue < 18 ||
    hue > 38 ||
    brightness > 190 ||
    stats.chroma < 48 ||
    mediumNougat.score < selected.score - 0.16
  ) {
    return null
  }

  return mediumNougat
}

function getStepPartColorCandidateByName(
  candidates: readonly StepPartColorCandidateScore[],
  name: string,
) {
  const normalizedName = normalizeStepColorName(name)

  return candidates.find((candidate) => normalizeStepColorName(candidate.color.name) === normalizedName) ?? null
}

function detectTransparentOrangeColorEstimate(
  imageData: DetectionImageData,
  partRegion: PixelRegion,
  background: ColorSample,
  excludedRegions: readonly PixelRegion[],
  dominantColorName: string,
  colorPalette: readonly StepPartColorPaletteEntry[],
): DetectedColorEstimate | null {
  if (!["Bright Light Orange", "Brown", "Dark Orange", "Dark Tan", "Medium Nougat", "Reddish Brown", "Tan", "Yellow"].includes(dominantColorName)) {
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
  const hasNarrowTintEvidence = (
    aspectRatio <= 0.72 &&
    tintToDarkRatio >= 0.16 &&
    tintToForegroundRatio >= 0.035
  )
  const hasStrongTintEvidence = (
    aspectRatio <= 2.8 &&
    tintToDarkRatio >= 0.28 &&
    tintToForegroundRatio >= 0.08
  )
  if (
    warmTintPixels < 8 ||
    (!hasNarrowTintEvidence && !hasStrongTintEvidence)
  ) {
    return null
  }

  const transOrange = findStepPartColorByName(colorPalette, "Trans-Orange")
  if (!transOrange) {
    return null
  }

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

function getColorChroma({ b, g, r }: ColorSample) {
  return Math.max(r, g, b) - Math.min(r, g, b)
}

function scoreAbsoluteDifference(left: number, right: number, maxDifference: number) {
  return clamp(1 - Math.abs(left - right) / maxDifference, 0, 1)
}

function scoreColorHue(left: ColorSample, right: ColorSample) {
  if (isNeutralStepPartColor(left) || isNeutralStepPartColor(right)) {
    return 0.5
  }

  const leftHue = getColorHue(left)
  const rightHue = getColorHue(right)
  if (leftHue == null || rightHue == null) {
    return 0.5
  }

  const hueDistance = Math.min(
    Math.abs(leftHue - rightHue),
    360 - Math.abs(leftHue - rightHue),
  )

  return clamp(1 - hueDistance / 90, 0, 1)
}

function getColorHue({ b, g, r }: ColorSample) {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  if (delta === 0) {
    return null
  }

  let hue = 0
  if (max === red) {
    hue = ((green - blue) / delta) % 6
  } else if (max === green) {
    hue = ((blue - red) / delta) + 2
  } else {
    hue = ((red - green) / delta) + 4
  }

  return (hue * 60 + 360) % 360
}

function isNeutralStepPartColor(color: ColorSample) {
  return getColorChroma(color) <= 22
}

function createUnknownColorEstimate(): DetectedColorEstimate {
  return {
    confidence: 0,
    hex: "#808080",
    name: "Unknown",
    rgb: { b: 128, g: 128, r: 128 },
  }
}

const fallbackStepPartColorPalette: StepPartColorPaletteEntry[] = [
  { id: "0", name: "Black", rgb: { b: 18, g: 18, r: 18 } },
  { id: "15", name: "White", rgb: { b: 242, g: 242, r: 242 } },
  { id: "71", name: "Light Bluish Gray", rgb: { b: 169, g: 165, r: 160 } },
  { id: "72", name: "Dark Bluish Gray", rgb: { b: 104, g: 110, r: 108 } },
  { id: "1", name: "Blue", rgb: { b: 191, g: 85, r: 0 } },
  { id: "321", name: "Dark Azure", rgb: { b: 189, g: 155, r: 51 } },
  { id: "4", name: "Red", rgb: { b: 9, g: 26, r: 201 } },
  { id: "2", name: "Green", rgb: { b: 65, g: 120, r: 35 } },
  { id: "10", name: "Bright Green", rgb: { b: 74, g: 159, r: 75 } },
  { id: "288", name: "Dark Green", rgb: { b: 50, g: 70, r: 24 } },
  { id: "14", name: "Yellow", rgb: { b: 55, g: 205, r: 242 } },
  { id: "191", name: "Bright Light Orange", rgb: { b: 61, g: 187, r: 248 } },
  { id: "484", name: "Dark Orange", rgb: { b: 0, g: 85, r: 169 } },
  { id: "182", isTransparent: true, name: "Trans-Orange", rgb: { b: 28, g: 143, r: 240 } },
  { id: "70", name: "Reddish Brown", rgb: { b: 18, g: 42, r: 88 } },
  { id: "6", name: "Brown", rgb: { b: 39, g: 57, r: 88 } },
  { id: "308", name: "Dark Brown", rgb: { b: 0, g: 33, r: 53 } },
  { id: "19", name: "Tan", rgb: { b: 158, g: 205, r: 228 } },
  { id: "28", name: "Dark Tan", rgb: { b: 115, g: 138, r: 149 } },
  { id: "84", name: "Medium Nougat", rgb: { b: 85, g: 125, r: 170 } },
  { id: "179", name: "Flat Silver", rgb: { b: 133, g: 135, r: 137 } },
  { id: "297", name: "Pearl Gold", rgb: { b: 46, g: 127, r: 170 } },
]

function createStepPartColorPalette(colors: readonly PartsListColor[] | undefined) {
  const entries: StepPartColorPaletteEntry[] = []
  const seenNames = new Set<string>()
  for (const color of colors ?? []) {
    if (!isSupportedStepPartPaletteColor(color)) {
      continue
    }

    const normalizedName = normalizeStepColorName(color.name)
    if (seenNames.has(normalizedName)) {
      continue
    }

    entries.push({
      id: color.id,
      isTransparent: color.isTransparent,
      name: color.name,
      rgb: parseHexColorSample(color.rgb ?? ""),
    })
    seenNames.add(normalizedName)
  }

  return entries.length > 0 ? entries : fallbackStepPartColorPalette
}

function isSupportedStepPartPaletteColor(color: PartsListColor) {
  if (!color.rgb || !/^#?[0-9a-f]{6}$/i.test(color.rgb) || color.id === "-1" || color.id === "9999") {
    return false
  }

  const name = color.name.trim()
  return (
    Boolean(name) &&
    !/^\[/.test(name) &&
    !/^(Clikits|Duplo|HO|Modulex|Vintage)\b/i.test(name)
  )
}

function findStepPartColorByName(
  colorPalette: readonly StepPartColorPaletteEntry[],
  name: string,
) {
  const normalizedName = normalizeStepColorName(name)

  return colorPalette.find((color) => normalizeStepColorName(color.name) === normalizedName) ?? null
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
  const interiorRegion = getCalloutInteriorRegion(imageData)
  const samples: ColorSample[] = []
  const step = Math.max(3, Math.round(Math.min(imageData.width, imageData.height) * 0.025))

  for (let y = interiorRegion.y; y < interiorRegion.y + interiorRegion.height; y += step) {
    for (let x = interiorRegion.x; x < interiorRegion.x + interiorRegion.width; x += step) {
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

function hasStepCalloutPartItemDetectionEvidence(imageData: DetectionImageData) {
  if (detectCalloutBorderInteriorRegion(imageData)) {
    return true
  }

  const margin = getCalloutInteriorMargin(imageData)
  const region = normalizeRegion({
    height: imageData.height - margin * 2,
    width: imageData.width - margin * 2,
    x: margin,
    y: margin,
  }, imageData.width, imageData.height)
  let calloutFillPixels = 0
  let sampledPixels = 0
  const step = Math.max(1, Math.round(Math.min(imageData.width, imageData.height) * 0.01))

  for (let y = region.y; y < region.y + region.height; y += step) {
    for (let x = region.x; x < region.x + region.width; x += step) {
      sampledPixels += 1
      if (isLikelyCalloutInteriorFillPixel(imageData, x, y)) {
        calloutFillPixels += 1
      }
    }
  }

  return calloutFillPixels / Math.max(1, sampledPixels) >= 0.24
}

function isLikelyCalloutInteriorFillPixel(imageData: DetectionImageData, x: number, y: number) {
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
  const isWarmModelPanel = brightness > 185 && r > b + 18 && g > b + 8

  return !isWarmModelPanel && brightness >= 185 && brightness <= 252 && chroma >= 6
}

function getCalloutInteriorMargin(imageData: DetectionImageData) {
  return Math.max(8, Math.round(Math.min(imageData.width, imageData.height) * 0.03))
}

function clearMaskOutsideRegion(mask: Uint8Array, width: number, height: number, region: PixelRegion) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (
        x < region.x ||
        y < region.y ||
        x >= region.x + region.width ||
        y >= region.y + region.height
      ) {
        mask[(y * width) + x] = 0
      }
    }
  }
}

function getCalloutInteriorRegion(imageData: DetectionImageData, margin = getCalloutInteriorMargin(imageData)) {
  const borderInterior = detectCalloutBorderInteriorRegion(imageData)
  if (borderInterior) {
    return borderInterior
  }

  return normalizeRegion({
    height: imageData.height - margin * 2,
    width: imageData.width - margin * 2,
    x: margin,
    y: margin,
  }, imageData.width, imageData.height)
}

function detectCalloutBorderInteriorRegion(imageData: DetectionImageData): PixelRegion | null {
  const maxHorizontalScan = Math.max(10, Math.round(imageData.width * 0.16))
  const maxVerticalScan = Math.max(10, Math.round(imageData.height * 0.16))
  const left = findCalloutVerticalBorderLine(imageData, 0, maxHorizontalScan, "left")
  const right = findCalloutVerticalBorderLine(
    imageData,
    Math.max(0, imageData.width - maxHorizontalScan),
    imageData.width - 1,
    "right",
  )
  const top = findCalloutHorizontalBorderLine(imageData, 0, maxVerticalScan, "top")
  const bottom = findCalloutHorizontalBorderLine(
    imageData,
    Math.max(0, imageData.height - maxVerticalScan),
    imageData.height - 1,
    "bottom",
  )
  if (left === null || right === null || top === null || bottom === null) {
    return null
  }
  if (
    right - left < imageData.width * 0.35 ||
    bottom - top < imageData.height * 0.35
  ) {
    return null
  }

  const inset = Math.max(3, Math.round(Math.min(imageData.width, imageData.height) * 0.012))

  return normalizeRegion({
    height: bottom - top - inset * 2,
    width: right - left - inset * 2,
    x: left + inset,
    y: top + inset,
  }, imageData.width, imageData.height)
}

function findCalloutVerticalBorderLine(
  imageData: DetectionImageData,
  startX: number,
  endX: number,
  edge: "left" | "right",
) {
  let bestX: number | null = null
  let bestScore = 0
  const fromX = Math.max(0, Math.min(startX, endX))
  const toX = Math.min(imageData.width - 1, Math.max(startX, endX))

  for (let x = fromX; x <= toX; x += 1) {
    const score = getCalloutVerticalBorderScore(imageData, x)
    if (score > bestScore || (score === bestScore && bestX !== null && isBetterBorderEdge(x, bestX, edge))) {
      bestScore = score
      bestX = x
    }
  }

  return bestScore >= 0.48 ? bestX : null
}

function findCalloutHorizontalBorderLine(
  imageData: DetectionImageData,
  startY: number,
  endY: number,
  edge: "top" | "bottom",
) {
  let bestY: number | null = null
  let bestScore = 0
  const fromY = Math.max(0, Math.min(startY, endY))
  const toY = Math.min(imageData.height - 1, Math.max(startY, endY))

  for (let y = fromY; y <= toY; y += 1) {
    const score = getCalloutHorizontalBorderScore(imageData, y)
    if (score > bestScore || (score === bestScore && bestY !== null && isBetterBorderEdge(y, bestY, edge))) {
      bestScore = score
      bestY = y
    }
  }

  return bestScore >= 0.48 ? bestY : null
}

function isBetterBorderEdge(candidate: number, current: number, edge: "left" | "right" | "top" | "bottom") {
  return edge === "left" || edge === "top" ? candidate < current : candidate > current
}

function getCalloutVerticalBorderScore(imageData: DetectionImageData, x: number) {
  let darkPixels = 0
  let sampledPixels = 0
  const yInset = Math.max(2, Math.round(imageData.height * 0.04))

  for (let y = yInset; y < imageData.height - yInset; y += 1) {
    sampledPixels += 1
    if (isCalloutBorderPixel(imageData, x, y)) {
      darkPixels += 1
    }
  }

  return darkPixels / Math.max(1, sampledPixels)
}

function getCalloutHorizontalBorderScore(imageData: DetectionImageData, y: number) {
  let darkPixels = 0
  let sampledPixels = 0
  const xInset = Math.max(2, Math.round(imageData.width * 0.04))

  for (let x = xInset; x < imageData.width - xInset; x += 1) {
    sampledPixels += 1
    if (isCalloutBorderPixel(imageData, x, y)) {
      darkPixels += 1
    }
  }

  return darkPixels / Math.max(1, sampledPixels)
}

function isCalloutBorderPixel(imageData: DetectionImageData, x: number, y: number) {
  const dataIndex = ((y * imageData.width) + x) * 4
  const alpha = imageData.data[dataIndex + 3] ?? 255
  if (alpha < 32) {
    return false
  }

  const r = imageData.data[dataIndex] ?? 0
  const g = imageData.data[dataIndex + 1] ?? 0
  const b = imageData.data[dataIndex + 2] ?? 0
  const brightness = (r + g + b) / 3
  const chroma = Math.max(r, g, b) - Math.min(r, g, b)

  return brightness < 92 && chroma < 42
}

function detectQuantityLabelAnchors(
  imageData: DetectionImageData,
  interiorRegion: PixelRegion,
  foregroundMask: Uint8Array,
): QuantityLabelAnchor[] {
  return suppressOverlappingQuantityLabelAnchors(
    createQuantityLabelAnchorsForImageData(imageData, interiorRegion, foregroundMask),
  )
}

function createQuantityLabelAnchorsForImageData(
  imageData: DetectionImageData,
  interiorRegion: PixelRegion,
  foregroundMask: Uint8Array,
): QuantityLabelAnchor[] {
  const components = collectDarkComponents(imageData, interiorRegion, isQuantityTextPixel)
    .filter((component) => isLikelyQuantityLabelComponent(imageData, component))
  if (components.length === 0) {
    return []
  }

  return createQuantityLabelAnchorCandidates(imageData, components, interiorRegion, foregroundMask)
}

function isLikelyQuantityLabelComponent(imageData: DetectionImageData, component: DarkComponent) {
  const density = component.count / Math.max(1, component.width * component.height)
  const minLabelHeight = getMinimumQuantityLabelComponentHeight(imageData)
  const maxLabelHeight = Math.max(24, imageData.height * 0.18)
  const maxLabelWidth = Math.max(72, imageData.width * 0.28)

  return (
    component.height >= minLabelHeight &&
    component.height <= maxLabelHeight &&
    component.width <= maxLabelWidth &&
    component.count <= imageData.width * imageData.height * 0.04 &&
    density <= 0.92
  )
}

function getMinimumQuantityLabelComponentHeight(imageData: DetectionImageData) {
  const scaledMinimum = Math.round(imageData.height * 0.018)
  const isTallNarrowCallout = imageData.height > imageData.width * 1.8

  return Math.max(4, isTallNarrowCallout ? Math.min(12, scaledMinimum) : scaledMinimum)
}

function createQuantityLabelAnchorCandidates(
  imageData: DetectionImageData,
  components: readonly DarkComponent[],
  interiorRegion: PixelRegion,
  foregroundMask: Uint8Array,
): QuantityLabelAnchor[] {
  const anchors: QuantityLabelAnchor[] = []
  const busyBackgroundAnchors: QuantityLabelAnchor[] = []
  const medianHeight = median(components.map((component) => component.height)) ?? 10
  const lineTolerance = Math.max(5, Math.round(medianHeight * 0.85))
  const maxComponentGap = Math.max(7, Math.round(medianHeight * 1.35))
  const maxLabelWidth = Math.max(56, Math.round(imageData.width * 0.26))
  const maxLabelHeight = Math.max(22, Math.round(imageData.height * 0.2))
  const lines: DarkComponent[][] = []

  for (const component of [...components].sort((left, right) => getRegionCenterY(left) - getRegionCenterY(right))) {
    const line = lines.find((candidateLine) =>
      Math.abs(getQuantityComponentLineCenterY(candidateLine) - getRegionCenterY(component)) <= lineTolerance
    )
    if (line) {
      line.push(component)
    } else {
      lines.push([component])
    }
  }

  for (const line of lines) {
    const sortedLine = [...line].sort((left, right) => left.x - right.x || left.y - right.y)
    for (let startIndex = 0; startIndex < sortedLine.length; startIndex += 1) {
      const group: DarkComponent[] = []
      for (let index = startIndex; index < sortedLine.length && group.length < 6; index += 1) {
        const component = sortedLine[index]
        const previous = group.at(-1)
        if (!component) {
          continue
        }
        if (previous && component.x - (previous.x + previous.width) > maxComponentGap) {
          break
        }

        group.push(component)
        const region = unionRegions(group)
        if (!region || region.width > maxLabelWidth || region.height > maxLabelHeight) {
          break
        }

        const candidate = createQuantityLabelAnchorCandidate(
          imageData,
          region,
          group.length,
          interiorRegion,
          foregroundMask,
        )
        if (candidate) {
          anchors.push(candidate)
        } else {
          const busyBackgroundCandidate = createQuantityLabelAnchorCandidate(
            imageData,
            region,
            group.length,
            interiorRegion,
            foregroundMask,
            0.3,
          )
          if (busyBackgroundCandidate) {
            busyBackgroundAnchors.push(busyBackgroundCandidate)
          } else {
            const looseOneBackgroundCandidate = createQuantityLabelAnchorCandidate(
              imageData,
              region,
              group.length,
              interiorRegion,
              foregroundMask,
              1,
            )
            if (
              looseOneBackgroundCandidate &&
              isLooseBusyBackgroundQuantityAnchorCandidate(looseOneBackgroundCandidate)
            ) {
              busyBackgroundAnchors.push(looseOneBackgroundCandidate)
            }
          }
        }
      }
    }
  }

  const supportedBusyBackgroundAnchors: QuantityLabelAnchor[] = []
  for (const anchor of [...busyBackgroundAnchors].sort((left, right) =>
    left.maxBackgroundForegroundRatio - right.maxBackgroundForegroundRatio ||
    right.score - left.score
  )) {
    if (
      isSupportedBusyBackgroundQuantityAnchor(anchor, [...anchors, ...supportedBusyBackgroundAnchors]) ||
      isSupportedIsolatedLooseQuantityAnchor(imageData, foregroundMask, anchor, interiorRegion)
    ) {
      supportedBusyBackgroundAnchors.push(anchor)
    }
  }

  const supportedAnchors = [
    ...anchors,
    ...supportedBusyBackgroundAnchors,
  ]

  return [
    ...supportedAnchors,
    ...createRowSupportedLooseLabelAnchors(imageData, components, interiorRegion, foregroundMask, supportedAnchors),
  ]
}

function isLooseBusyBackgroundQuantityAnchorCandidate(candidate: QuantityLabelAnchor) {
  const value = candidate.quantity.value
  if (!value) {
    return false
  }

  if (value === 1) {
    return true
  }

  return (
    value <= 9 &&
    candidate.componentCount === 2 &&
    candidate.quantity.confidence >= getMinimumIsolatedLooseQuantityConfidence(value) &&
    candidate.region.width <= candidate.region.height * 1.8
  )
}

function isSupportedIsolatedLooseQuantityAnchor(
  imageData: DetectionImageData,
  foregroundMask: Uint8Array,
  candidate: QuantityLabelAnchor,
  interiorRegion: PixelRegion,
) {
  const value = candidate.quantity.value
  if (
    !value ||
    value > 9 ||
    candidate.componentCount !== 2 ||
    candidate.quantity.confidence < getMinimumIsolatedLooseQuantityConfidence(value) ||
    candidate.region.width > candidate.region.height * 1.8
  ) {
    return false
  }

  const partSearchRegion = intersectRegions(
    normalizeRegion({
      height: Math.max(1, candidate.region.y - interiorRegion.y + Math.round(candidate.region.height * 0.7)),
      width: Math.max(candidate.region.width * 2, candidate.region.height * 5),
      x: Math.round(
        getRegionCenterX(candidate.region) - Math.max(candidate.region.width, candidate.region.height * 2.5),
      ),
      y: interiorRegion.y,
    }, imageData.width, imageData.height),
    interiorRegion,
  )
  if (!partSearchRegion) {
    return false
  }

  const partMask = new Uint8Array(foregroundMask)
  const labelExclusionRegion = expandRegion(
    candidate.region,
    imageData,
    Math.max(1, Math.round(candidate.region.height * 0.18)),
  )
  for (let y = labelExclusionRegion.y; y < labelExclusionRegion.y + labelExclusionRegion.height; y += 1) {
    for (let x = labelExclusionRegion.x; x < labelExclusionRegion.x + labelExclusionRegion.width; x += 1) {
      partMask[(y * imageData.width) + x] = 0
    }
  }

  return collectMaskComponents(partMask, imageData.width, imageData.height, partSearchRegion)
    .some((component) => (
      component.count >= Math.max(14, candidate.region.height * 1.1) &&
      component.y < candidate.region.y &&
      component.y + component.height <= candidate.region.y + Math.max(2, candidate.region.height * 0.18) &&
      component.width >= Math.max(4, Math.round(candidate.region.height * 0.35)) &&
      component.height >= Math.max(4, Math.round(candidate.region.height * 0.35))
    ))
}

function getMinimumIsolatedLooseQuantityConfidence(value: number) {
  return value === 1 ? 0.78 : 0.76
}

function createRowSupportedLooseLabelAnchors(
  imageData: DetectionImageData,
  components: readonly DarkComponent[],
  interiorRegion: PixelRegion,
  foregroundMask: Uint8Array,
  existingAnchors: readonly QuantityLabelAnchor[],
): QuantityLabelAnchor[] {
  const anchors: QuantityLabelAnchor[] = []
  const medianHeight = median(components.map((component) => component.height)) ?? 10
  const lineTolerance = Math.max(5, Math.round(medianHeight * 0.85))
  const maxComponentGap = Math.max(7, Math.round(medianHeight * 1.35))
  const lines: DarkComponent[][] = []

  for (const component of [...components].sort((left, right) =>
    getRegionCenterY(left) - getRegionCenterY(right) || left.x - right.x
  )) {
    const line = lines.find((candidateLine) =>
      Math.abs(getRegionCenterY(candidateLine[0] ?? component) - getRegionCenterY(component)) <= lineTolerance
    )
    if (line) {
      line.push(component)
    } else {
      lines.push([component])
    }
  }

  for (const line of lines) {
    const sortedLine = [...line].sort((left, right) => left.x - right.x || left.y - right.y)
    for (let startIndex = 0; startIndex < sortedLine.length - 1; startIndex += 1) {
      const left = sortedLine[startIndex]
      const right = sortedLine[startIndex + 1]
      if (!left || !right || right.x - (left.x + left.width) > maxComponentGap) {
        continue
      }

      const region = unionRegions([left, right])
      if (!region) {
        continue
      }

      const quantity = readQuantityFromImageData(imageData, expandRegion(region, imageData, 2))
      const textRegion = trimRegionToQuantityDisplayText(imageData, expandRegion(region, imageData, 2)) ??
        trimRegionToQuantityText(imageData, expandRegion(region, imageData, 2))
      if (
        !isRowSupportedLooseQuantity(quantity) ||
        !textRegion ||
        !isQuantityLabelInsideInterior(textRegion, interiorRegion)
      ) {
        continue
      }

      const aspectRatio = textRegion.width / Math.max(1, textRegion.height)
      if (aspectRatio < 0.55 || aspectRatio > 1.6) {
        continue
      }

      const candidate: QuantityLabelAnchor = {
        componentCount: 2,
        maxBackgroundForegroundRatio: 1,
        quantity,
        region: normalizeRegion(textRegion, imageData.width, imageData.height),
        score: quantity.confidence + 0.04,
      }
      const hasSupport = hasNearbyRowSupportedQuantityAnchor(candidate, [...existingAnchors, ...anchors]) ||
        isSupportedPerspectiveLooseQuantityAnchor(
          imageData,
          foregroundMask,
          candidate,
          interiorRegion,
          [...existingAnchors, ...anchors],
        )

      if (
        existingAnchors.some((anchor) => areQuantityLabelAnchorsDuplicative(anchor, candidate)) ||
        anchors.some((anchor) => areQuantityLabelAnchorsDuplicative(anchor, candidate)) ||
        !hasSupport
      ) {
        continue
      }

      anchors.push(candidate)
    }
  }

  return anchors
}

function isSupportedPerspectiveLooseQuantityAnchor(
  imageData: DetectionImageData,
  foregroundMask: Uint8Array,
  candidate: QuantityLabelAnchor,
  interiorRegion: PixelRegion,
  anchors: readonly QuantityLabelAnchor[],
) {
  if (
    candidate.quantity.value !== 1 ||
    candidate.componentCount !== 2 ||
    candidate.quantity.confidence < 0.8 ||
    candidate.region.width > candidate.region.height * 1.65 ||
    anchors.length < 3 ||
    !isSupportedIsolatedLooseQuantityAnchor(imageData, foregroundMask, candidate, interiorRegion)
  ) {
    return false
  }

  const candidateCenterX = getRegionCenterX(candidate.region)
  const candidateCenterY = getRegionCenterY(candidate.region)
  const horizontalSlack = Math.max(candidate.region.height * 4, candidate.region.width * 2.5)
  const minAnchorX = Math.min(...anchors.map((anchor) => getRegionCenterX(anchor.region)))
  const maxAnchorX = Math.max(...anchors.map((anchor) => getRegionCenterX(anchor.region)))
  if (candidateCenterX < minAnchorX - horizontalSlack || candidateCenterX > maxAnchorX + horizontalSlack) {
    return false
  }

  return anchors.some((anchor) => {
    const deltaX = Math.abs(getRegionCenterX(anchor.region) - candidateCenterX)
    const deltaY = Math.abs(getRegionCenterY(anchor.region) - candidateCenterY)

    return (
      deltaX <= Math.max(candidate.region.height * 10, candidate.region.width * 4.5) &&
      deltaY <= Math.max(candidate.region.height * 4, anchor.region.height * 4)
    )
  })
}

function isRowSupportedLooseQuantity(quantity: QuantityEstimate) {
  if (!quantity.value) {
    return false
  }

  if (quantity.value === 1) {
    return quantity.confidence >= 0.78
  }

  return quantity.value <= 9 && quantity.confidence >= 0.78
}

function hasNearbyRowSupportedQuantityAnchor(
  candidate: QuantityLabelAnchor,
  anchors: readonly QuantityLabelAnchor[],
) {
  const rowTolerance = Math.max(8, Math.round(candidate.region.height * 1.25))
  const rowAnchors = anchors.filter((anchor) =>
    Math.abs(getRegionCenterY(anchor.region) - getRegionCenterY(candidate.region)) <= rowTolerance
  )
  if (rowAnchors.length === 0) {
    return false
  }

  const nearestDistance = Math.min(
    ...rowAnchors.map((anchor) => Math.abs(getRegionCenterX(anchor.region) - getRegionCenterX(candidate.region))),
  )

  return nearestDistance <= Math.max(candidate.region.height * 8, candidate.region.width * 4)
}

function getQuantityComponentLineCenterY(line: readonly DarkComponent[]) {
  return median(line.map((component) => getRegionCenterY(component))) ?? 0
}

function isSupportedBusyBackgroundQuantityAnchor(
  candidate: QuantityLabelAnchor,
  strictAnchors: readonly QuantityLabelAnchor[],
) {
  if (
    !candidate.quantity.value ||
    candidate.componentCount < 2 ||
    strictAnchors.some((anchor) => areQuantityLabelAnchorsDuplicative(anchor, candidate))
  ) {
    return false
  }

  const rowTolerance = Math.max(8, Math.round(candidate.region.height * 1.25))
  const rowAnchors = strictAnchors
    .filter((anchor) => Math.abs(getRegionCenterY(anchor.region) - getRegionCenterY(candidate.region)) <= rowTolerance)
    .sort((left, right) => getRegionCenterX(left.region) - getRegionCenterX(right.region))

  if (candidate.quantity.value > 9) {
    const medianRowHeight = median(rowAnchors.map((anchor) => anchor.region.height)) ?? candidate.region.height
    const nearestRowAnchorDistance = rowAnchors.length > 0
      ? Math.min(...rowAnchors.map((anchor) => Math.abs(getRegionCenterX(anchor.region) - getRegionCenterX(candidate.region))))
      : Number.POSITIVE_INFINITY

    return (
      candidate.maxBackgroundForegroundRatio <= 0.3 &&
      candidate.componentCount >= 3 &&
      candidate.quantity.confidence >= 0.76 &&
      candidate.region.height <= medianRowHeight * 1.45 &&
      candidate.region.width <= candidate.region.height * 3.2 &&
      rowAnchors.length >= 2 &&
      nearestRowAnchorDistance <= Math.max(candidate.region.height * 8, candidate.region.width * 4)
    )
  }

  if (candidate.maxBackgroundForegroundRatio > 0.3) {
    const supportsLooseOne = (
      candidate.quantity.value === 1 &&
      candidate.componentCount === 2 &&
      candidate.quantity.confidence >= 0.8 &&
      candidate.region.width <= candidate.region.height * 1.6 &&
      rowAnchors.length >= 1
    )
    const supportsLooseSingleDigit = (
      candidate.quantity.value <= 9 &&
      candidate.componentCount === 2 &&
      candidate.quantity.confidence >= 0.78 &&
      candidate.region.width <= candidate.region.height * 1.8 &&
      rowAnchors.length >= 2
    )

    if (!supportsLooseOne && !supportsLooseSingleDigit) {
      return false
    }

    const nearestRowAnchorDistance = Math.min(
      ...rowAnchors.map((anchor) => Math.abs(getRegionCenterX(anchor.region) - getRegionCenterX(candidate.region))),
    )

    return nearestRowAnchorDistance <= Math.max(candidate.region.height * 8, candidate.region.width * 4)
  }

  if (
    candidate.componentCount === 2 &&
    candidate.quantity.confidence >= 0.76 &&
    candidate.region.width <= candidate.region.height * 1.8
  ) {
    return true
  }

  if (candidate.quantity.confidence < 0.74) {
    return false
  }

  if (rowAnchors.length < 2) {
    return false
  }

  const rowGaps = rowAnchors
    .slice(1)
    .map((anchor, index) => getRegionCenterX(anchor.region) - getRegionCenterX(rowAnchors[index]?.region ?? anchor.region))
    .filter((gap) => gap > candidate.region.width * 1.2)
  const medianGap = median(rowGaps)
  if (!medianGap) {
    return false
  }

  const candidateCenterX = getRegionCenterX(candidate.region)
  const leftBound = getRegionCenterX(rowAnchors[0]?.region ?? candidate.region) - medianGap * 1.35
  const rightBound = getRegionCenterX(rowAnchors.at(-1)?.region ?? candidate.region) + medianGap * 1.35

  return candidateCenterX >= leftBound && candidateCenterX <= rightBound
}

function createQuantityLabelAnchorCandidate(
  imageData: DetectionImageData,
  region: PixelRegion,
  componentCount: number,
  interiorRegion: PixelRegion,
  foregroundMask: Uint8Array,
  maxBackgroundForegroundRatio = 0.28,
): QuantityLabelAnchor | null {
  const readableRegion = expandRegion(region, imageData, 2)
  const quantity = readQuantityFromImageData(imageData, readableRegion)
  if (!quantity.value || quantity.confidence < 0.675) {
    return null
  }

  const textRegion = trimRegionToQuantityDisplayText(imageData, readableRegion) ??
    trimRegionToQuantityText(imageData, readableRegion)
  const maxTextHeight = Math.max(24, Math.round(imageData.height * 0.09))
  if (
    !textRegion ||
    !isQuantityLabelInsideInterior(textRegion, interiorRegion) ||
    textRegion.height > maxTextHeight ||
    !isQuantityLabelOnPlainBackground(imageData, foregroundMask, textRegion, maxBackgroundForegroundRatio)
  ) {
    return null
  }

  const aspectRatio = textRegion.width / Math.max(1, textRegion.height)
  if (aspectRatio < 0.55 || aspectRatio > 5.2) {
    return null
  }
  const digitCount = quantity.text?.length ?? 0
  if (
    digitCount <= 1 &&
    (
      aspectRatio > 2.6 ||
      (componentCount >= 3 && aspectRatio > 2.05)
    )
  ) {
    return null
  }

  return {
    componentCount,
    maxBackgroundForegroundRatio,
    quantity,
    region: normalizeRegion(textRegion, imageData.width, imageData.height),
    score: quantity.confidence + clamp(componentCount / 4, 0, 1) * 0.08,
  }
}

function isQuantityLabelOnPlainBackground(
  imageData: DetectionImageData,
  foregroundMask: Uint8Array,
  textRegion: PixelRegion,
  maxForegroundRatio: number,
) {
  const inspectRegion = expandRegion(
    textRegion,
    imageData,
    Math.max(2, Math.round(textRegion.height * 0.14)),
  )
  let textPixels = 0
  let nonTextForegroundPixels = 0
  let nonTextPixels = 0

  for (let y = inspectRegion.y; y < inspectRegion.y + inspectRegion.height; y += 1) {
    for (let x = inspectRegion.x; x < inspectRegion.x + inspectRegion.width; x += 1) {
      const pixelIndex = (y * imageData.width) + x
      if (isQuantityTextPixel(imageData, x, y)) {
        textPixels += 1
        continue
      }

      nonTextPixels += 1
      if (foregroundMask[pixelIndex]) {
        nonTextForegroundPixels += 1
      }
    }
  }

  const foregroundRatio = nonTextForegroundPixels / Math.max(1, nonTextPixels)

  return textPixels >= Math.max(8, textRegion.height * 0.68) && foregroundRatio <= maxForegroundRatio
}

function isQuantityLabelInsideInterior(region: PixelRegion, interiorRegion: PixelRegion) {
  const centerX = getRegionCenterX(region)
  const centerY = getRegionCenterY(region)

  return (
    centerX >= interiorRegion.x &&
    centerX <= interiorRegion.x + interiorRegion.width &&
    centerY >= interiorRegion.y &&
    centerY <= interiorRegion.y + interiorRegion.height
  )
}

function suppressOverlappingQuantityLabelAnchors(candidates: readonly QuantityLabelAnchor[]) {
  const selected: QuantityLabelAnchor[] = []

  for (const candidate of [...candidates].sort((left, right) =>
    right.score - left.score ||
    right.region.width * right.region.height - left.region.width * left.region.height
  )) {
    if (selected.some((existing) => areQuantityLabelAnchorsDuplicative(existing, candidate))) {
      continue
    }

    selected.push(candidate)
  }

  return sortQuantityLabelAnchors(
    selected.filter((candidate) =>
      !isQuantityAnchorLikelyPartTextureAboveLabel(candidate, selected) &&
      !isQuantityAnchorLikelyPartTextureBelowLabel(candidate, selected)
    ),
  )
}

function isQuantityAnchorLikelyPartTextureAboveLabel(
  candidate: QuantityLabelAnchor,
  anchors: readonly QuantityLabelAnchor[],
) {
  if (hasTightlyAlignedPeerQuantityAnchor(candidate, anchors)) {
    return false
  }

  return anchors.some((anchor) => {
    if (anchor === candidate || anchor.region.y <= candidate.region.y) {
      return false
    }

    if (anchor.region.height > candidate.region.height * 1.6) {
      return false
    }

    const verticalGap = anchor.region.y - (candidate.region.y + candidate.region.height)
    const candidateAspectRatio = candidate.region.width / Math.max(1, candidate.region.height)
    const lowerAnchorRight = anchor.region.x + anchor.region.width
    if (
      candidate.quantity.value === 1 &&
      candidateAspectRatio > 1.85 &&
      verticalGap >= -Math.max(2, candidate.region.height * 0.12) &&
      verticalGap <= candidate.region.height * 1.1 &&
      getRegionCenterX(candidate.region) > getRegionCenterX(anchor.region) &&
      candidate.region.x <= lowerAnchorRight + candidate.region.height
    ) {
      return true
    }

    if (
      candidate.quantity.value != null &&
      candidate.quantity.value <= 9 &&
      candidateAspectRatio <= 1.85 &&
      verticalGap >= Math.max(2, candidate.region.height * 0.32) &&
      verticalGap <= candidate.region.height * 1.75 &&
      getRegionCenterX(candidate.region) > getRegionCenterX(anchor.region) &&
      candidate.region.x <= lowerAnchorRight + candidate.region.height * 0.75
    ) {
      return true
    }

    const horizontalOverlap = Math.max(
      0,
      Math.min(candidate.region.x + candidate.region.width, anchor.region.x + anchor.region.width) -
        Math.max(candidate.region.x, anchor.region.x),
    )
    const horizontalOverlapRatio = horizontalOverlap / Math.max(1, Math.min(candidate.region.width, anchor.region.width))

    return (
      verticalGap >= -Math.max(2, candidate.region.height * 0.65) &&
      verticalGap <= Math.max(candidate.region.height, anchor.region.height) * 0.72 &&
      horizontalOverlapRatio >= 0.35
    )
  })
}

function isQuantityAnchorLikelyPartTextureBelowLabel(
  candidate: QuantityLabelAnchor,
  anchors: readonly QuantityLabelAnchor[],
) {
  const value = candidate.quantity.value
  if (
    !value ||
    value < 3 ||
    value > 9 ||
    candidate.componentCount !== 2 ||
    candidate.region.width > candidate.region.height * 1.8 ||
    hasTightlyAlignedPeerQuantityAnchor(candidate, anchors)
  ) {
    return false
  }

  return anchors.some((anchor) => {
    if (anchor === candidate || anchor.region.y >= candidate.region.y) {
      return false
    }

    if (anchor.region.height > candidate.region.height * 1.4) {
      return false
    }

    const verticalGap = candidate.region.y - (anchor.region.y + anchor.region.height)
    if (
      verticalGap < Math.max(2, candidate.region.height * 0.35) ||
      verticalGap > candidate.region.height * 1.2
    ) {
      return false
    }

    const centerDeltaX = Math.abs(getRegionCenterX(candidate.region) - getRegionCenterX(anchor.region))
    if (centerDeltaX > candidate.region.height * 1.25) {
      return false
    }

    return (
      candidate.region.x >= anchor.region.x - Math.max(6, candidate.region.height * 0.25) &&
      candidate.region.x <= anchor.region.x + anchor.region.width + candidate.region.height * 1.25
    )
  })
}

function hasTightlyAlignedPeerQuantityAnchor(
  candidate: QuantityLabelAnchor,
  anchors: readonly QuantityLabelAnchor[],
) {
  const candidateCenterX = getRegionCenterX(candidate.region)
  const candidateCenterY = getRegionCenterY(candidate.region)
  const rowTolerance = Math.max(5, Math.round(candidate.region.height * 0.35))
  const maxDistance = Math.max(candidate.region.height * 8, candidate.region.width * 4)

  return anchors.some((anchor) => (
    anchor !== candidate &&
    Math.abs(getRegionCenterY(anchor.region) - candidateCenterY) <= rowTolerance &&
    Math.abs(getRegionCenterX(anchor.region) - candidateCenterX) <= maxDistance
  ))
}

function areQuantityLabelAnchorsDuplicative(left: QuantityLabelAnchor, right: QuantityLabelAnchor) {
  const intersectionOverUnion = getIntersectionOverUnion(left.region, right.region)
  if (intersectionOverUnion > 0.25) {
    return true
  }

  const verticalOverlap = getVerticalOverlapRatio(left.region, right.region)
  const centerDeltaX = Math.abs(getRegionCenterX(left.region) - getRegionCenterX(right.region))
  const maxWidth = Math.max(left.region.width, right.region.width)

  return verticalOverlap >= 0.58 && centerDeltaX <= maxWidth * 0.45
}

function sortQuantityLabelAnchors(anchors: readonly QuantityLabelAnchor[]) {
  return [...anchors].sort((left, right) => {
    const rowTolerance = Math.max(6, Math.round(Math.min(left.region.height, right.region.height) * 1.2))
    if (Math.abs(getRegionCenterY(left.region) - getRegionCenterY(right.region)) <= rowTolerance) {
      return left.region.x - right.region.x
    }

    return left.region.y - right.region.y || left.region.x - right.region.x
  })
}

function createQuantityAnchorPartForegroundMask(
  imageData: DetectionImageData,
  foregroundMask: Uint8Array,
  anchors: readonly QuantityLabelAnchor[],
) {
  const mask = new Uint8Array(foregroundMask)
  for (const anchor of anchors) {
    const exclusionRegion = expandRegion(anchor.region, imageData, Math.max(1, Math.round(anchor.region.height * 0.16)))

    for (let y = exclusionRegion.y; y < exclusionRegion.y + exclusionRegion.height; y += 1) {
      for (let x = exclusionRegion.x; x < exclusionRegion.x + exclusionRegion.width; x += 1) {
        mask[(y * imageData.width) + x] = 0
      }
    }
  }

  return mask
}

function createQuantityLabelAnchorZones(
  anchors: readonly QuantityLabelAnchor[],
  interiorRegion: PixelRegion,
): QuantityLabelAnchorZone[] {
  const rows = groupQuantityAnchorsIntoRows(anchors)
  const zones: QuantityLabelAnchorZone[] = []

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? []
    const sortedRow = [...row].sort((left, right) => getRegionCenterX(left.region) - getRegionCenterX(right.region))

    for (let index = 0; index < sortedRow.length; index += 1) {
      const anchor = sortedRow[index]
      const previous = sortedRow[index - 1] ?? null
      const next = sortedRow[index + 1] ?? null
      if (!anchor) {
        continue
      }

      const left = previous
        ? Math.floor((getRegionCenterX(previous.region) + getRegionCenterX(anchor.region)) / 2)
        : interiorRegion.x
      const right = next
        ? Math.ceil((getRegionCenterX(anchor.region) + getRegionCenterX(next.region)) / 2)
        : interiorRegion.x + interiorRegion.width
      const top = Math.max(
        interiorRegion.y,
        Math.floor(anchor.region.y - Math.max(anchor.region.height * 8, interiorRegion.height * 0.62)),
      )
      const bottomLimit = Math.min(
        interiorRegion.y + interiorRegion.height,
        Math.ceil(anchor.region.y + anchor.region.height * 1.4),
      )
      const region = intersectRegions({
        height: bottomLimit - top,
        width: right - left,
        x: left,
        y: top,
      }, interiorRegion)

      if (region) {
        zones.push({ anchor, region })
      }
    }
  }

  return zones
}

function groupQuantityAnchorsIntoRows(anchors: readonly QuantityLabelAnchor[]) {
  const sorted = [...anchors].sort((left, right) => getRegionCenterY(left.region) - getRegionCenterY(right.region))
  const medianHeight = median(sorted.map((anchor) => anchor.region.height)) ?? 10
  const tolerance = Math.max(8, Math.round(medianHeight * 1.4))
  const rows: QuantityLabelAnchor[][] = []

  for (const anchor of sorted) {
    const row = rows.find((candidate) =>
      Math.abs(getQuantityAnchorRowCenterY(candidate) - getRegionCenterY(anchor.region)) <= tolerance
    )
    if (row) {
      row.push(anchor)
    } else {
      rows.push([anchor])
    }
  }

  return rows.map((row) => [...row].sort((left, right) => left.region.x - right.region.x))
}

function getQuantityAnchorRowCenterY(row: readonly QuantityLabelAnchor[]) {
  return median(row.map((anchor) => getRegionCenterY(anchor.region))) ?? 0
}

function findPartRegionForQuantityAnchor(
  imageData: DetectionImageData,
  partMask: Uint8Array,
  zone: QuantityLabelAnchorZone,
  anchors: readonly QuantityLabelAnchor[],
) {
  return findPartRegionCandidateForQuantityAnchor(imageData, partMask, zone, anchors).partRegion
}

function findPartRegionCandidateForQuantityAnchor(
  imageData: DetectionImageData,
  partMask: Uint8Array,
  zone: QuantityLabelAnchorZone,
  anchors: readonly QuantityLabelAnchor[],
): QuantityAnchorPartRegionResult {
  const labelRegion = zone.anchor.region
  const interiorRegion = getCalloutInteriorRegion(imageData)
  const partSearchBottom = Math.min(
    zone.region.y + zone.region.height,
    Math.ceil(labelRegion.y + labelRegion.height * 1.25),
  )
  const baseSearchRegion = normalizeRegion({
    height: partSearchBottom - zone.region.y,
    width: zone.region.width,
    x: zone.region.x,
    y: zone.region.y,
  }, imageData.width, imageData.height)
  const boundedBaseSearchRegion = intersectRegions(baseSearchRegion, interiorRegion)
  if (!boundedBaseSearchRegion) {
    return {
      partRegion: null,
      reason: "outside-interior",
    }
  }

  const searchRegion = normalizeRegion(boundedBaseSearchRegion, imageData.width, imageData.height)
  const rawPartRegion = selectNearestPartComponentRegion(imageData, partMask, searchRegion, labelRegion)
  if (!rawPartRegion) {
    const impliedPartRegion = getQuantityLabelImpliedPartRegion(imageData, partMask, searchRegion, labelRegion)
    if (impliedPartRegion) {
      return {
        ownedPartRegion: impliedPartRegion,
        partRegion: impliedPartRegion,
        reason: "quantity-label-implied-part-region",
        searchRegion,
      }
    }

    return {
      partRegion: null,
      reason: "no-raw-part-region",
      searchRegion,
    }
  }
  const anchoredPartRegion = isLikelyAnchoredPartRegion(imageData, rawPartRegion, labelRegion)
    ? rawPartRegion
    : getFallbackRegionForUnlikelyAnchoredPart(imageData, partMask, searchRegion, rawPartRegion, labelRegion)
  if (!anchoredPartRegion) {
    const impliedPartRegion = getQuantityLabelImpliedPartRegion(imageData, partMask, searchRegion, labelRegion)
    if (impliedPartRegion) {
      return {
        ownedPartRegion: impliedPartRegion,
        partRegion: impliedPartRegion,
        rawPartRegion,
        reason: "quantity-label-implied-part-region",
        searchRegion,
      }
    }

    return {
      partRegion: null,
      rawPartRegion,
      reason: "unlikely-anchored-part-region",
      searchRegion,
    }
  }

  const expandedPartRegion = expandPartRegionAcrossConnectedForeground(
    imageData,
    partMask,
    anchoredPartRegion,
    zone.anchor,
    anchors,
    interiorRegion,
  )
  const ownedPartRegion = trimPartRegionToQuantityAnchorForeground(
    imageData,
    partMask,
    expandedPartRegion,
    zone.anchor,
    anchors,
  )
  const padding = Math.max(2, Math.round(Math.min(rawPartRegion.width, rawPartRegion.height) * 0.06))
  const paddedRegion = padRegion(ownedPartRegion, imageData.width, imageData.height, padding)
  const constrainedRegion = intersectRegions(paddedRegion, interiorRegion) ?? rawPartRegion

  return {
    expandedPartRegion,
    ownedPartRegion,
    partRegion: normalizeRegion(constrainedRegion, imageData.width, imageData.height),
    rawPartRegion,
    searchRegion,
  }
}

function selectNearestPartComponentRegion(
  imageData: DetectionImageData,
  partMask: Uint8Array,
  searchRegion: PixelRegion,
  labelRegion: PixelRegion,
) {
  const components = collectMaskComponents(partMask, imageData.width, imageData.height, searchRegion)
    .filter((component) =>
      isLikelyPartComponentNearQuantityLabel(imageData, component, labelRegion) &&
      !isLikelyRowSpanningPartComponent(imageData, component, labelRegion)
    )
  if (components.length === 0) {
    return getFallbackAnchoredPartRegion(imageData, partMask, searchRegion, labelRegion)
  }

  const labelCenterX = getRegionCenterX(labelRegion)
  const horizontallyRelevant = components.filter((component) => {
    const slack = Math.max(labelRegion.width * 2.8, component.width * 0.45)

    return labelCenterX >= component.x - slack && labelCenterX <= component.x + component.width + slack
  })
  const candidates = horizontallyRelevant.length > 0 ? horizontallyRelevant : components
  const primaryComponent = selectPrimaryPartComponentForQuantityLabel(candidates, labelRegion)
  const selected = candidates.filter((component) =>
    component === primaryComponent ||
    areCandidatePartComponentsAdjacent(component, primaryComponent, labelRegion)
  )

  return unionRegions(selected.length > 0 ? selected : candidates) ??
    getFallbackAnchoredPartRegion(imageData, partMask, searchRegion, labelRegion)
}

function getFallbackRegionForUnlikelyAnchoredPart(
  imageData: DetectionImageData,
  partMask: Uint8Array,
  searchRegion: PixelRegion,
  rawPartRegion: PixelRegion,
  labelRegion: PixelRegion,
) {
  if (!isBroadConnectedPartRegionNearQuantityLabel(imageData, rawPartRegion, labelRegion)) {
    return null
  }

  const fallbackRegion = getFallbackAnchoredPartRegion(imageData, partMask, searchRegion, labelRegion)
  if (!fallbackRegion || getIntersectionOverUnion(fallbackRegion, rawPartRegion) > 0.92) {
    return null
  }

  return isLikelyAnchoredPartRegion(imageData, fallbackRegion, labelRegion)
    ? fallbackRegion
    : null
}

function getQuantityLabelImpliedPartRegion(
  imageData: DetectionImageData,
  partMask: Uint8Array,
  searchRegion: PixelRegion,
  labelRegion: PixelRegion,
) {
  const labelCenterX = getRegionCenterX(labelRegion)
  const fallbackWidth = Math.max(labelRegion.width * 5.2, imageData.width * 0.1)
  const fallbackHeight = Math.max(labelRegion.height * 6.4, imageData.height * 0.16)
  const fallbackSearch = intersectRegions({
    height: fallbackHeight,
    width: fallbackWidth,
    x: labelCenterX - fallbackWidth / 2,
    y: labelRegion.y - fallbackHeight,
  }, searchRegion)
  if (!fallbackSearch) {
    return null
  }

  const foregroundRegion = trimRegionToForeground(partMask, imageData.width, imageData.height, fallbackSearch)
  if (foregroundRegion && isQuantityLabelImpliedPartRegion(imageData, foregroundRegion, labelRegion)) {
    return normalizeRegion(foregroundRegion, imageData.width, imageData.height)
  }

  return getQuantityLabelDefaultPartRegion(imageData, fallbackSearch, labelRegion)
}

function getQuantityLabelDefaultPartRegion(
  imageData: DetectionImageData,
  searchRegion: PixelRegion,
  labelRegion: PixelRegion,
) {
  const labelCenterX = getRegionCenterX(labelRegion)
  const width = Math.max(labelRegion.width * 4.6, imageData.width * 0.1)
  const height = Math.max(labelRegion.height * 4.8, imageData.height * 0.11)
  const bottom = labelRegion.y - Math.max(1, Math.round(labelRegion.height * 0.12))
  const region = intersectRegions({
    height,
    width,
    x: labelCenterX - width / 2,
    y: bottom - height,
  }, searchRegion)
  if (!region || region.width < 3 || region.height < 2) {
    return null
  }

  return normalizeRegion(region, imageData.width, imageData.height)
}

function isQuantityLabelImpliedPartRegion(
  imageData: DetectionImageData,
  partRegion: PixelRegion,
  labelRegion: PixelRegion,
) {
  const area = partRegion.width * partRegion.height
  const labelCenterX = getRegionCenterX(labelRegion)
  const horizontalSlack = Math.max(labelRegion.width * 2.8, partRegion.width * 0.34)

  return (
    area >= imageData.width * imageData.height * 0.00012 &&
    area <= imageData.width * imageData.height * 0.28 &&
    partRegion.width >= Math.max(3, imageData.width * 0.004) &&
    partRegion.height >= Math.max(2, imageData.height * 0.006) &&
    partRegion.y < labelRegion.y + labelRegion.height * 0.4 &&
    partRegion.y + partRegion.height <= labelRegion.y + labelRegion.height * 0.65 &&
    labelCenterX >= partRegion.x - horizontalSlack &&
    labelCenterX <= partRegion.x + partRegion.width + horizontalSlack
  )
}

function isBroadConnectedPartRegionNearQuantityLabel(
  imageData: DetectionImageData,
  partRegion: PixelRegion,
  labelRegion: PixelRegion,
) {
  const labelCenterX = getRegionCenterX(labelRegion)
  const widthLimit = Math.max(imageData.width * 0.78, labelRegion.width * 7)

  return (
    partRegion.width >= widthLimit &&
    labelCenterX >= partRegion.x &&
    labelCenterX <= partRegion.x + partRegion.width &&
    partRegion.y < labelRegion.y &&
    partRegion.y + partRegion.height <= labelRegion.y + labelRegion.height * 1.25
  )
}

function selectPrimaryPartComponentForQuantityLabel(
  components: readonly DarkComponent[],
  labelRegion: PixelRegion,
) {
  const labelCenterX = getRegionCenterX(labelRegion)

  return [...components].sort((left, right) =>
    scorePartComponentForQuantityLabel(left, labelRegion, labelCenterX) -
    scorePartComponentForQuantityLabel(right, labelRegion, labelCenterX)
  )[0] ?? components[0]
}

function scorePartComponentForQuantityLabel(
  component: DarkComponent,
  labelRegion: PixelRegion,
  labelCenterX: number,
) {
  const horizontalGap = Math.max(
    0,
    Math.max(component.x - labelCenterX, labelCenterX - component.x - component.width),
  )
  const componentBottom = component.y + component.height
  const verticalGapToLabel = Math.max(0, labelRegion.y - componentBottom)
  const labelOverlapBonus = labelCenterX >= component.x && labelCenterX <= component.x + component.width ? labelRegion.width : 0
  const area = component.width * component.height

  return (horizontalGap * 2.4) + verticalGapToLabel - labelOverlapBonus - Math.min(area, labelRegion.width * labelRegion.height * 14) * 0.002
}

function areCandidatePartComponentsAdjacent(
  component: DarkComponent,
  primaryComponent: DarkComponent,
  labelRegion: PixelRegion,
) {
  const horizontalGap = Math.max(
    0,
    Math.max(component.x - primaryComponent.x - primaryComponent.width, primaryComponent.x - component.x - component.width),
  )
  const verticalGap = Math.max(
    0,
    Math.max(component.y - primaryComponent.y - primaryComponent.height, primaryComponent.y - component.y - component.height),
  )
  const gapTolerance = Math.max(4, Math.round(labelRegion.height * 0.85))

  if (horizontalGap > gapTolerance || verticalGap > gapTolerance) {
    return false
  }

  return getVerticalOverlapRatio(component, primaryComponent) >= 0.16 ||
    getHorizontalOverlapRatio(component, primaryComponent) >= 0.16
}

function expandPartRegionAcrossConnectedForeground(
  imageData: DetectionImageData,
  partMask: Uint8Array,
  rawPartRegion: PixelRegion,
  anchor: QuantityLabelAnchor,
  anchors: readonly QuantityLabelAnchor[],
  interiorRegion: PixelRegion,
) {
  const labelRegion = anchor.region
  const horizontalExpansion = Math.max(
    24,
    Math.round(labelRegion.width * 4.2),
    Math.round(rawPartRegion.width * 0.72),
  )
  const verticalExpansion = Math.max(8, Math.round(labelRegion.height * 1.2))
  const expandedSearch = intersectRegions({
    height: rawPartRegion.height + verticalExpansion * 2,
    width: rawPartRegion.width + horizontalExpansion * 2,
    x: rawPartRegion.x - horizontalExpansion,
    y: rawPartRegion.y - verticalExpansion,
  }, interiorRegion)
  if (!expandedSearch) {
    return rawPartRegion
  }

  const components = collectMaskComponents(partMask, imageData.width, imageData.height, expandedSearch)
    .filter((component) =>
      isLikelyPartComponentNearQuantityLabel(imageData, component, labelRegion) &&
      !isLikelyRowSpanningPartComponent(imageData, component, labelRegion)
    )
  const related = components.filter((component) => isConnectedPartRegionContinuation(component, rawPartRegion, labelRegion))

  const expandedRegion = unionRegions(related) ?? rawPartRegion

  return clipPartRegionAwayFromNeighboringQuantityAnchors(expandedRegion, anchor, anchors)
}

function clipPartRegionAwayFromNeighboringQuantityAnchors(
  region: PixelRegion,
  anchor: QuantityLabelAnchor,
  anchors: readonly QuantityLabelAnchor[],
) {
  const anchorCenterX = getRegionCenterX(anchor.region)
  const rowTolerance = Math.max(8, Math.round(anchor.region.height * 1.35))
  let left = region.x
  let right = region.x + region.width

  for (const neighbor of anchors) {
    if (
      neighbor === anchor ||
      Math.abs(getRegionCenterY(neighbor.region) - getRegionCenterY(anchor.region)) > rowTolerance
    ) {
      continue
    }

    const neighborCenterX = getRegionCenterX(neighbor.region)
    const boundaryGap = Math.max(2, Math.round(Math.min(anchor.region.height, neighbor.region.height) * 0.25))
    if (neighborCenterX < anchorCenterX) {
      left = Math.max(
        left,
        region.x < neighbor.region.x + neighbor.region.width + boundaryGap
          ? Math.floor((neighborCenterX + anchorCenterX) / 2)
          : neighbor.region.x + neighbor.region.width + boundaryGap,
      )
    } else if (neighborCenterX > anchorCenterX) {
      right = Math.min(
        right,
        region.x + region.width > neighbor.region.x - boundaryGap
          ? Math.ceil((neighborCenterX + anchorCenterX) / 2)
          : neighbor.region.x - boundaryGap,
      )
    }
  }

  if (right - left < Math.max(7, anchor.region.width * 0.8)) {
    return region
  }

  return {
    height: region.height,
    width: right - left,
    x: left,
    y: region.y,
  }
}

function trimPartRegionToQuantityAnchorForeground(
  imageData: DetectionImageData,
  partMask: Uint8Array,
  region: PixelRegion,
  anchor: QuantityLabelAnchor,
  anchors: readonly QuantityLabelAnchor[],
) {
  const components = collectMaskComponents(partMask, imageData.width, imageData.height, region)
  if (components.length <= 1) {
    return region
  }

  const sameRowAnchors = getSameRowQuantityAnchors(anchor, anchors)
  const hasLeftNeighbor = sameRowAnchors.some((neighbor) => getRegionCenterX(neighbor.region) < getRegionCenterX(anchor.region))
  const hasRightNeighbor = sameRowAnchors.some((neighbor) => getRegionCenterX(neighbor.region) > getRegionCenterX(anchor.region))
  const maxArea = Math.max(...components.map((component) => component.width * component.height))
  const ownedComponents = components.filter((component) =>
    isPartComponentOwnedByQuantityAnchor(component, anchor, anchors)
  )
  const ownershipFilteredComponents = ownedComponents.length > 0 ? ownedComponents : components
  const keptComponents = ownershipFilteredComponents.filter((component) =>
    !isLikelyNeighborPartEdgeComponent(component, region, anchor.region, maxArea, {
      hasLeftNeighbor,
      hasRightNeighbor,
    })
  )

  return unionRegions(keptComponents.length > 0 ? keptComponents : ownershipFilteredComponents) ?? region
}

function isPartComponentOwnedByQuantityAnchor(
  component: DarkComponent,
  anchor: QuantityLabelAnchor,
  anchors: readonly QuantityLabelAnchor[],
) {
  const componentScore = getPartComponentQuantityAnchorOwnershipScore(component, anchor)
  if (componentScore == null) {
    return false
  }

  const bestCompetingScore = Math.min(
    Number.POSITIVE_INFINITY,
    ...anchors
      .filter((candidateAnchor) => candidateAnchor !== anchor)
      .map((candidateAnchor) => getPartComponentQuantityAnchorOwnershipScore(component, candidateAnchor))
      .filter((score): score is number => score != null),
  )
  if (!Number.isFinite(bestCompetingScore)) {
    return true
  }

  const ownershipMargin = Math.max(3, Math.round(anchor.region.height * 0.35))

  return componentScore <= bestCompetingScore + ownershipMargin
}

function getPartComponentQuantityAnchorOwnershipScore(
  component: DarkComponent,
  anchor: QuantityLabelAnchor,
) {
  if (!isPartComponentPlausiblyOwnedByQuantityAnchor(component, anchor.region)) {
    return null
  }

  return scorePartComponentForQuantityLabel(component, anchor.region, getRegionCenterX(anchor.region))
}

function isPartComponentPlausiblyOwnedByQuantityAnchor(
  component: DarkComponent,
  labelRegion: PixelRegion,
) {
  const componentBottom = component.y + component.height

  return (
    component.y < labelRegion.y + labelRegion.height * 0.4 &&
    componentBottom <= labelRegion.y + Math.max(2, labelRegion.height * 0.36) &&
    componentBottom >= labelRegion.y - Math.max(labelRegion.height * 7, component.height * 2.5)
  )
}

function getSameRowQuantityAnchors(anchor: QuantityLabelAnchor, anchors: readonly QuantityLabelAnchor[]) {
  const rowTolerance = Math.max(8, Math.round(anchor.region.height * 1.35))

  return anchors.filter((neighbor) =>
    neighbor !== anchor &&
    Math.abs(getRegionCenterY(neighbor.region) - getRegionCenterY(anchor.region)) <= rowTolerance
  )
}

function isLikelyNeighborPartEdgeComponent(
  component: DarkComponent,
  region: PixelRegion,
  labelRegion: PixelRegion,
  maxArea: number,
  {
    hasLeftNeighbor,
    hasRightNeighbor,
  }: {
    hasLeftNeighbor: boolean
    hasRightNeighbor: boolean
  },
) {
  const area = component.width * component.height
  const overlapsLabelX = component.x <= labelRegion.x + labelRegion.width &&
    component.x + component.width >= labelRegion.x
  const touchesLeftBoundary = component.x <= region.x + 1
  const touchesRightBoundary = component.x + component.width >= region.x + region.width - 1

  return (
    area < maxArea * 0.72 &&
    !overlapsLabelX &&
    (
      (hasLeftNeighbor && touchesLeftBoundary && component.x + component.width < labelRegion.x) ||
      (hasRightNeighbor && touchesRightBoundary && component.x > labelRegion.x + labelRegion.width)
    )
  )
}

function isConnectedPartRegionContinuation(
  component: DarkComponent,
  rawPartRegion: PixelRegion,
  labelRegion: PixelRegion,
) {
  if (getIntersectionOverUnion(component, rawPartRegion) > 0) {
    return true
  }

  const horizontalGap = Math.max(
    0,
    Math.max(component.x - rawPartRegion.x - rawPartRegion.width, rawPartRegion.x - component.x - component.width),
  )
  const verticalGap = Math.max(
    0,
    Math.max(component.y - rawPartRegion.y - rawPartRegion.height, rawPartRegion.y - component.y - component.height),
  )

  return (
    horizontalGap <= Math.max(3, Math.round(labelRegion.height * 0.45)) &&
    verticalGap <= Math.max(4, Math.round(labelRegion.height * 0.55)) &&
    getVerticalOverlapRatio(component, rawPartRegion) >= 0.18
  )
}

function isLikelyRowSpanningPartComponent(
  imageData: DetectionImageData,
  component: DarkComponent,
  labelRegion: PixelRegion,
) {
  if (isTallPartComponentAnchoredToQuantityLabel(imageData, component, labelRegion)) {
    return false
  }

  return (
    component.height > Math.max(labelRegion.height * 7.4, imageData.height * 0.36) &&
    component.width < Math.max(labelRegion.width * 4, imageData.width * 0.12) &&
    component.y < labelRegion.y - labelRegion.height * 4.5
  )
}

function isTallPartComponentAnchoredToQuantityLabel(
  imageData: DetectionImageData,
  component: DarkComponent,
  labelRegion: PixelRegion,
) {
  const labelCenterX = getRegionCenterX(labelRegion)
  const componentBottom = component.y + component.height
  const verticalGapToLabel = labelRegion.y - componentBottom
  const horizontalTolerance = Math.max(2, Math.round(labelRegion.width * 0.4))

  return (
    component.height > Math.max(labelRegion.height * 7.4, imageData.height * 0.36) &&
    component.width >= Math.max(7, labelRegion.width * 0.72) &&
    labelCenterX >= component.x - horizontalTolerance &&
    labelCenterX <= component.x + component.width + horizontalTolerance &&
    verticalGapToLabel >= -labelRegion.height * 0.4 &&
    verticalGapToLabel <= Math.max(6, labelRegion.height * 0.8)
  )
}

function getFallbackAnchoredPartRegion(
  imageData: DetectionImageData,
  partMask: Uint8Array,
  searchRegion: PixelRegion,
  labelRegion: PixelRegion,
) {
  const labelCenterX = getRegionCenterX(labelRegion)
  const fallbackWidth = Math.max(labelRegion.width * 4.8, imageData.width * 0.12)
  const fallbackHeight = Math.max(labelRegion.height * 7, imageData.height * 0.18)
  const fallbackSearch = intersectRegions({
    height: fallbackHeight,
    width: fallbackWidth,
    x: labelCenterX - fallbackWidth / 2,
    y: labelRegion.y - fallbackHeight,
  }, searchRegion)
  if (!fallbackSearch) {
    return null
  }

  return trimRegionToForeground(partMask, imageData.width, imageData.height, fallbackSearch)
}

function collectMaskComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  region: PixelRegion,
) {
  const boundedRegion = normalizeRegion(region, width, height)
  const visited = new Uint8Array(width * height)
  const components: DarkComponent[] = []

  for (let y = boundedRegion.y; y < boundedRegion.y + boundedRegion.height; y += 1) {
    for (let x = boundedRegion.x; x < boundedRegion.x + boundedRegion.width; x += 1) {
      const pixelIndex = (y * width) + x
      if (visited[pixelIndex] || !mask[pixelIndex]) {
        continue
      }

      components.push(collectMaskComponent(mask, visited, width, boundedRegion, pixelIndex))
    }
  }

  return components.filter((component) => component.count >= 8)
}

function collectMaskComponent(
  mask: Uint8Array,
  visited: Uint8Array,
  width: number,
  bounds: PixelRegion,
  startIndex: number,
) {
  const stack = [startIndex]
  let count = 0
  let minX = bounds.x + bounds.width
  let minY = bounds.y + bounds.height
  let maxX = bounds.x
  let maxY = bounds.y
  const pixels: number[] = []
  visited[startIndex] = 1

  while (stack.length > 0) {
    const pixelIndex = stack.pop() ?? 0
    const x = pixelIndex % width
    const y = Math.floor(pixelIndex / width)
    count += 1
    pixels.push(pixelIndex)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)

    addMaskNeighbor(mask, visited, stack, pixelIndex - 1, x > bounds.x)
    addMaskNeighbor(mask, visited, stack, pixelIndex + 1, x < bounds.x + bounds.width - 1)
    addMaskNeighbor(mask, visited, stack, pixelIndex - width, y > bounds.y)
    addMaskNeighbor(mask, visited, stack, pixelIndex + width, y < bounds.y + bounds.height - 1)
  }

  return {
    count,
    height: maxY - minY + 1,
    pixels,
    width: maxX - minX + 1,
    x: minX,
    y: minY,
  }
}

function addMaskNeighbor(
  mask: Uint8Array,
  visited: Uint8Array,
  stack: number[],
  pixelIndex: number,
  isInBounds: boolean,
) {
  if (!isInBounds || visited[pixelIndex] || !mask[pixelIndex]) {
    return
  }

  visited[pixelIndex] = 1
  stack.push(pixelIndex)
}

function isLikelyPartComponentNearQuantityLabel(
  imageData: DetectionImageData,
  component: DarkComponent,
  labelRegion: PixelRegion,
) {
  const area = component.width * component.height
  const componentBottom = component.y + component.height
  const maxBottom = labelRegion.y + Math.max(2, labelRegion.height * 1.25)

  return (
    area >= imageData.width * imageData.height * 0.00035 &&
    area <= imageData.width * imageData.height * 0.46 &&
    component.width >= Math.max(5, imageData.width * 0.01) &&
    component.height >= Math.max(5, imageData.height * 0.018) &&
    componentBottom <= maxBottom &&
    componentBottom >= labelRegion.y - Math.max(labelRegion.height * 7, imageData.height * 0.48)
  )
}

function isLikelyAnchoredPartRegion(
  imageData: DetectionImageData,
  partRegion: PixelRegion,
  labelRegion: PixelRegion,
) {
  const area = partRegion.width * partRegion.height
  const labelCenterX = getRegionCenterX(labelRegion)
  const horizontalSlack = Math.max(labelRegion.width * 2.5, partRegion.width * 0.25)

  return (
    area >= imageData.width * imageData.height * 0.00065 &&
    area <= imageData.width * imageData.height * 0.46 &&
    partRegion.width >= Math.max(7, imageData.width * 0.012) &&
    partRegion.width <= imageData.width * 0.9 &&
    partRegion.height >= Math.max(7, imageData.height * 0.028) &&
    partRegion.height <= imageData.height * 0.78 &&
    partRegion.y < labelRegion.y + labelRegion.height * 0.4 &&
    labelCenterX >= partRegion.x - horizontalSlack &&
    labelCenterX <= partRegion.x + partRegion.width + horizontalSlack
  )
}

function intersectRegions(left: PixelRegion, right: PixelRegion): PixelRegion | null {
  const x = Math.max(left.x, right.x)
  const y = Math.max(left.y, right.y)
  const rightEdge = Math.min(left.x + left.width, right.x + right.width)
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height)

  if (rightEdge <= x || bottomEdge <= y) {
    return null
  }

  return {
    height: bottomEdge - y,
    width: rightEdge - x,
    x,
    y,
  }
}

function scoreAnchoredPartItemRegion(
  imageData: DetectionImageData,
  anchor: QuantityLabelAnchor,
  itemRegion: PixelRegion,
  partRegion: PixelRegion,
) {
  const sizeScore = clamp((partRegion.width * partRegion.height) / Math.max(1, imageData.width * imageData.height * 0.035), 0, 1)
  const itemScore = clamp((itemRegion.width * itemRegion.height) / Math.max(1, imageData.width * imageData.height * 0.06), 0, 1)

  return clamp(anchor.quantity.confidence * 0.48 + sizeScore * 0.34 + itemScore * 0.18, 0, 1)
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
  const pixels: number[] = []
  visited[startIndex] = 1

  while (stack.length > 0) {
    const pixelIndex = stack.pop() ?? 0
    const x = pixelIndex % imageData.width
    const y = Math.floor(pixelIndex / imageData.width)
    count += 1
    pixels.push(pixelIndex)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)

    addDarkNeighbor(imageData, visited, stack, pixelIndex - 1, x > bounds.x, isMatchingPixel)
    addDarkNeighbor(imageData, visited, stack, pixelIndex + 1, x < bounds.x + bounds.width - 1, isMatchingPixel)
    addDarkNeighbor(imageData, visited, stack, pixelIndex - imageData.width, y > bounds.y, isMatchingPixel)
    addDarkNeighbor(imageData, visited, stack, pixelIndex + imageData.width, y < bounds.y + bounds.height - 1, isMatchingPixel)
    addDarkNeighbor(
      imageData,
      visited,
      stack,
      pixelIndex - imageData.width - 1,
      x > bounds.x && y > bounds.y,
      isMatchingPixel,
    )
    addDarkNeighbor(
      imageData,
      visited,
      stack,
      pixelIndex - imageData.width + 1,
      x < bounds.x + bounds.width - 1 && y > bounds.y,
      isMatchingPixel,
    )
    addDarkNeighbor(
      imageData,
      visited,
      stack,
      pixelIndex + imageData.width - 1,
      x > bounds.x && y < bounds.y + bounds.height - 1,
      isMatchingPixel,
    )
    addDarkNeighbor(
      imageData,
      visited,
      stack,
      pixelIndex + imageData.width + 1,
      x < bounds.x + bounds.width - 1 && y < bounds.y + bounds.height - 1,
      isMatchingPixel,
    )
  }

  return {
    count,
    height: maxY - minY + 1,
    pixels,
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

function suppressOverlappingPartItemRegions(regions: readonly StepCalloutPartItemRegion[]) {
  const selected: StepCalloutPartItemRegion[] = []
  const maxArea = Math.max(1, ...regions.map((region) => region.itemRegion.width * region.itemRegion.height))
  for (const region of [...regions].sort((left, right) =>
    getPartItemRegionSelectionScore(right, maxArea) - getPartItemRegionSelectionScore(left, maxArea)
  )) {
    if (selected.some((existing) => arePartItemRegionsDuplicative(existing, region))) {
      continue
    }

    selected.push(region)
  }

  return selected
}

function getPartItemRegionSelectionScore(region: StepCalloutPartItemRegion, maxArea: number) {
  const areaScore = (region.itemRegion.width * region.itemRegion.height) / maxArea

  return region.confidence * 0.72 + areaScore * 0.28
}

function arePartItemRegionsDuplicative(left: StepCalloutPartItemRegion, right: StepCalloutPartItemRegion) {
  if (areQuantityLabelAnchorsDuplicative(
    {
      componentCount: 1,
      maxBackgroundForegroundRatio: 0,
      quantity: left.quantity,
      region: left.quantityRegion,
      score: left.confidence,
    },
    {
      componentCount: 1,
      maxBackgroundForegroundRatio: 0,
      quantity: right.quantity,
      region: right.quantityRegion,
      score: right.confidence,
    },
  )) {
    return true
  }

  if (getIntersectionOverUnion(left.itemRegion, right.itemRegion) > 0.5) {
    return true
  }

  const horizontalOverlap = Math.max(
    0,
    Math.min(left.itemRegion.x + left.itemRegion.width, right.itemRegion.x + right.itemRegion.width) -
      Math.max(left.itemRegion.x, right.itemRegion.x),
  )
  const verticalOverlap = Math.max(
    0,
    Math.min(left.itemRegion.y + left.itemRegion.height, right.itemRegion.y + right.itemRegion.height) -
      Math.max(left.itemRegion.y, right.itemRegion.y),
  )
  const horizontalOverlapRatio = horizontalOverlap / Math.max(1, Math.min(left.itemRegion.width, right.itemRegion.width))
  const verticalOverlapRatio = verticalOverlap / Math.max(1, Math.min(left.itemRegion.height, right.itemRegion.height))
  const labelCenterDeltaX = Math.abs(getRegionCenterX(left.quantityRegion) - getRegionCenterX(right.quantityRegion))
  const maxLabelWidth = Math.max(left.quantityRegion.width, right.quantityRegion.width)

  return (
    horizontalOverlapRatio >= 0.42 &&
    verticalOverlapRatio >= 0.5 &&
    labelCenterDeltaX <= maxLabelWidth * 1.2
  )
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

function getHorizontalOverlapRatio(left: PixelRegion, right: PixelRegion) {
  const overlap = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))

  return overlap / Math.max(1, Math.min(left.width, right.width))
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

function getPartPreviewContentSearchRegion(
  itemRegion: StepCalloutPartItemRegion,
  itemRegions: readonly StepCalloutPartItemRegion[],
  imageWidth: number,
  imageHeight: number,
  interiorRegion: PixelRegion,
) {
  const sameRowRegions = getSameRowPartItemRegions(itemRegion, itemRegions)
  const labelRegion = itemRegion.quantityRegion
  const quantityRowTolerance = Math.max(8, Math.round(labelRegion.height * 1.35))
  const horizontalExpansion = Math.max(
    24,
    Math.round(labelRegion.width * 4.2),
    Math.round(itemRegion.partRegion.width * 0.72),
  )
  const topExpansion = Math.max(
    8,
    Math.round(labelRegion.height * 3.2),
    Math.round(itemRegion.partRegion.height * 0.8),
  )
  const bottomExpansion = Math.max(12, Math.round(labelRegion.height * 3))
  let left = itemRegion.partRegion.x - horizontalExpansion
  let right = itemRegion.partRegion.x + itemRegion.partRegion.width + horizontalExpansion
  const labelCenterX = getRegionCenterX(labelRegion)
  const bottom = Math.min(
    itemRegion.partRegion.y + itemRegion.partRegion.height + bottomExpansion,
    labelRegion.y + Math.round(labelRegion.height * 2.75),
  )

  for (const neighbor of sameRowRegions) {
    const neighborCenterX = getRegionCenterX(neighbor.quantityRegion)
    const hasQuantityAlignedNeighbor =
      Math.abs(getRegionCenterY(neighbor.quantityRegion) - getRegionCenterY(labelRegion)) <= quantityRowTolerance
    const guard = Math.max(
      2,
      Math.round(Math.min(labelRegion.height, neighbor.quantityRegion.height) * 0.22),
    )
    if (neighborCenterX < labelCenterX) {
      const boundary = hasQuantityAlignedNeighbor
        ? neighbor.quantityRegion.x + neighbor.quantityRegion.width
        : getPartPreviewBoundaryBetweenSameRowItems(neighbor, itemRegion)
      left = Math.max(left, boundary + guard)
    } else if (neighborCenterX > labelCenterX) {
      const boundary = hasQuantityAlignedNeighbor
        ? neighbor.quantityRegion.x
        : getPartPreviewBoundaryBetweenSameRowItems(itemRegion, neighbor)
      right = Math.min(right, boundary - guard)
    }
  }

  const searchRegion = normalizeRegion({
    height: bottom - (itemRegion.partRegion.y - topExpansion),
    width: right - left,
    x: left,
    y: itemRegion.partRegion.y - topExpansion,
  }, imageWidth, imageHeight)

  return intersectRegions(searchRegion, interiorRegion) ??
    padPartRegion(itemRegion.partRegion, imageWidth, imageHeight, 1, interiorRegion)
}

function getOwnedPartContentForeground(
  imageData: DetectionImageData,
  region: PixelRegion,
  background: ColorSample,
  quantityGlyphRegions: readonly PixelRegion[],
  itemRegion: StepCalloutPartItemRegion,
  itemRegions: readonly StepCalloutPartItemRegion[],
): OwnedPartContentForeground {
  const boundedRegion = normalizeRegion(region, imageData.width, imageData.height)
  const mask = new Uint8Array(imageData.width * imageData.height)

  for (let y = boundedRegion.y; y < boundedRegion.y + boundedRegion.height; y += 1) {
    for (let x = boundedRegion.x; x < boundedRegion.x + boundedRegion.width; x += 1) {
      const sourceIndex = ((y * imageData.width) + x) * 4
      const alpha = imageData.data[sourceIndex + 3] ?? 255
      if (alpha < 32) {
        continue
      }

      const color = {
        b: imageData.data[sourceIndex + 2] ?? 0,
        g: imageData.data[sourceIndex + 1] ?? 0,
        r: imageData.data[sourceIndex] ?? 0,
      }
      if (isCalloutItemPreviewForegroundPixel(color, background)) {
        mask[(y * imageData.width) + x] = 1
      }
    }
  }

  const components = collectMaskComponents(mask, imageData.width, imageData.height, boundedRegion)
  if (components.length === 0) {
    return {
      componentRegions: [boundedRegion],
      foregroundMask: mask,
      region: boundedRegion,
    }
  }

  const sortedComponents = [...components].sort((left, right) =>
    right.count - left.count ||
    right.width * right.height - left.width * left.height
  )
  const dominantComponent = sortedComponents[0]
  if (!dominantComponent) {
    return {
      componentRegions: [boundedRegion],
      foregroundMask: mask,
      region: boundedRegion,
    }
  }

  const sameRowRegions = getSameRowPartItemRegions(itemRegion, itemRegions)
  const hasLeftNeighbor = sameRowRegions.some((neighbor) =>
    getRegionCenterX(neighbor.quantityRegion) < getRegionCenterX(itemRegion.quantityRegion)
  )
  const hasRightNeighbor = sameRowRegions.some((neighbor) =>
    getRegionCenterX(neighbor.quantityRegion) > getRegionCenterX(itemRegion.quantityRegion)
  )
  const maxArea = Math.max(...components.map((component) => component.width * component.height))
  const directlyOwnedComponents = components.filter((component) =>
    isDirectlyOwnedPartContentComponent(component, itemRegion.partRegion, itemRegion.quantityRegion)
  )
  const looselyOwnedComponents = components.filter((component) =>
    isLooselyOwnedPartContentComponent(component, itemRegion.partRegion, itemRegion.quantityRegion)
  )
  const adjacentLooseComponents = directlyOwnedComponents.length > 0
    ? looselyOwnedComponents.filter((component) =>
        isNearAnyPartContentComponent(component, directlyOwnedComponents, itemRegion.quantityRegion)
      )
    : looselyOwnedComponents
  const candidateComponents = mergeUniqueComponents(directlyOwnedComponents, adjacentLooseComponents)
  const selectedComponents = candidateComponents.length > 0 ? candidateComponents : components
  const quantityFilteredComponents = selectedComponents.filter((component) =>
    !isLikelyQuantityGlyphComponent(component, imageData.width, quantityGlyphRegions)
  )
  const ruleFilteredComponents = quantityFilteredComponents.filter((component) =>
    !isLikelyCalloutRuleComponent(component, boundedRegion, itemRegion.partRegion, itemRegion.quantityRegion)
  )
  const nonEdgeComponents = ruleFilteredComponents.filter((component) =>
    !isLikelyForeignPartContentComponent(component, boundedRegion, itemRegion.partRegion, itemRegion.quantityRegion, {
      hasLeftNeighbor,
      hasRightNeighbor,
    }) &&
    !isLikelyNeighborPartEdgeComponent(component, boundedRegion, itemRegion.quantityRegion, maxArea, {
      hasLeftNeighbor,
      hasRightNeighbor,
    })
  )
  const keptComponents = nonEdgeComponents.length > 0 ? nonEdgeComponents : ruleFilteredComponents.length > 0
    ? ruleFilteredComponents
    : candidateComponents.length > 0
    ? candidateComponents
    : [dominantComponent]
  const componentRegions = (keptComponents.length > 0 ? keptComponents : [dominantComponent])
    .map((component) =>
      intersectRegions(
        padRegion(component, imageData.width, imageData.height, 1),
        boundedRegion,
      ) ?? normalizeRegion(component, imageData.width, imageData.height)
    )
  const foregroundMask = createOwnedForegroundMask(
    imageData,
    imageData.width,
    imageData.height,
    keptComponents,
    quantityGlyphRegions,
    background,
    boundedRegion,
  )
  const ownedRegion = unionRegions(componentRegions) ?? boundedRegion
  const cropRegion = intersectRegions(
    padRegion(ownedRegion, imageData.width, imageData.height, 3),
    boundedRegion,
  ) ?? ownedRegion

  return {
    componentRegions,
    foregroundMask,
    region: cropRegion,
  }
}

function constrainOwnedPartContentRegionToDetectedPart(
  ownedRegion: PixelRegion,
  itemRegion: StepCalloutPartItemRegion,
  imageWidth: number,
  imageHeight: number,
  interiorRegion: PixelRegion,
) {
  const rightSlack = Math.max(6, Math.round(itemRegion.quantityRegion.height * 0.9))
  const widthInflationLimit = Math.max(
    itemRegion.partRegion.width * 1.65,
    itemRegion.partRegion.width + itemRegion.quantityRegion.height * 1.4,
  )
  const reachesRightFrame = ownedRegion.x + ownedRegion.width >=
    interiorRegion.x + interiorRegion.width - rightSlack

  if (!reachesRightFrame || ownedRegion.width <= widthInflationLimit) {
    return ownedRegion
  }

  return padPartRegion(itemRegion.partRegion, imageWidth, imageHeight, 1, interiorRegion)
}

function createOwnedForegroundMask(
  imageData: DetectionImageData,
  width: number,
  height: number,
  components: readonly DarkComponent[],
  excludedRegions: readonly PixelRegion[],
  background: ColorSample,
  bounds: PixelRegion,
) {
  const foregroundMask = new Uint8Array(width * height)
  for (const component of components) {
    for (const pixelIndex of component.pixels ?? []) {
      const x = pixelIndex % width
      const y = Math.floor(pixelIndex / width)
      if (isPointInsideAnyRegion(x, y, excludedRegions)) {
        continue
      }

      foregroundMask[pixelIndex] = 1
    }
  }

  return expandOwnedForegroundMaskIntoPartEdges(foregroundMask, imageData, background, bounds, excludedRegions)
}

function expandOwnedForegroundMaskIntoPartEdges(
  foregroundMask: Uint8Array,
  imageData: DetectionImageData,
  background: ColorSample,
  bounds: PixelRegion,
  excludedRegions: readonly PixelRegion[],
) {
  const xStart = Math.max(0, bounds.x)
  const yStart = Math.max(0, bounds.y)
  const xEnd = Math.min(imageData.width, bounds.x + bounds.width)
  const yEnd = Math.min(imageData.height, bounds.y + bounds.height)
  let expandedMask = new Uint8Array(foregroundMask)

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const sourceMask = expandedMask
    expandedMask = new Uint8Array(sourceMask)

    for (let y = yStart; y < yEnd; y += 1) {
      for (let x = xStart; x < xEnd; x += 1) {
        const pixelIndex = (y * imageData.width) + x
        if (sourceMask[pixelIndex] || isPointInsideAnyRegion(x, y, excludedRegions)) {
          continue
        }
        if (!hasOwnedForegroundNeighbor(sourceMask, imageData.width, imageData.height, x, y)) {
          continue
        }

        const sourceIndex = pixelIndex * 4
        const alpha = imageData.data[sourceIndex + 3] ?? 255
        if (alpha < 32) {
          continue
        }
        const color = {
          b: imageData.data[sourceIndex + 2] ?? 0,
          g: imageData.data[sourceIndex + 1] ?? 0,
          r: imageData.data[sourceIndex] ?? 0,
        }
        if (isCalloutItemPreviewEdgePixel(color, background)) {
          expandedMask[pixelIndex] = 1
        }
      }
    }
  }

  return expandedMask
}

function hasOwnedForegroundNeighbor(
  foregroundMask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
) {
  for (let neighborY = Math.max(0, y - 1); neighborY <= Math.min(height - 1, y + 1); neighborY += 1) {
    for (let neighborX = Math.max(0, x - 1); neighborX <= Math.min(width - 1, x + 1); neighborX += 1) {
      if (neighborX === x && neighborY === y) {
        continue
      }
      if (foregroundMask[(neighborY * width) + neighborX]) {
        return true
      }
    }
  }

  return false
}

function isLikelyQuantityGlyphComponent(
  component: DarkComponent,
  imageWidth: number,
  quantityGlyphRegions: readonly PixelRegion[],
) {
  if (quantityGlyphRegions.length === 0 || !component.pixels || component.pixels.length === 0) {
    return false
  }

  let overlapCount = 0
  for (const pixelIndex of component.pixels) {
    const x = pixelIndex % imageWidth
    const y = Math.floor(pixelIndex / imageWidth)
    if (isPointInsideAnyRegion(x, y, quantityGlyphRegions)) {
      overlapCount += 1
    }
  }

  return overlapCount / Math.max(1, component.count) >= 0.55
}

function getSameRowPartItemRegions(
  itemRegion: StepCalloutPartItemRegion,
  itemRegions: readonly StepCalloutPartItemRegion[],
) {
  const rowTolerance = Math.max(8, Math.round(itemRegion.quantityRegion.height * 1.35))

  return itemRegions.filter((neighbor) =>
    neighbor !== itemRegion && (
      Math.abs(getRegionCenterY(neighbor.quantityRegion) - getRegionCenterY(itemRegion.quantityRegion)) <= rowTolerance ||
      arePartItemRegionsOnSameVisualRow(itemRegion, neighbor)
    )
  )
}

function arePartItemRegionsOnSameVisualRow(
  left: StepCalloutPartItemRegion,
  right: StepCalloutPartItemRegion,
) {
  const partVerticalOverlap = getVerticalOverlapRatio(left.partRegion, right.partRegion)
  const quantityVerticalGap = Math.abs(getRegionCenterY(left.quantityRegion) - getRegionCenterY(right.quantityRegion))
  const quantityGapTolerance = Math.max(
    left.quantityRegion.height,
    right.quantityRegion.height,
    Math.round(Math.min(left.partRegion.height, right.partRegion.height) * 0.35),
  )

  return partVerticalOverlap >= 0.35 && quantityVerticalGap <= quantityGapTolerance
}

function getPartPreviewBoundaryBetweenSameRowItems(
  left: StepCalloutPartItemRegion,
  right: StepCalloutPartItemRegion,
) {
  return Math.round((getRegionCenterX(left.partRegion) + getRegionCenterX(right.partRegion)) / 2)
}

function isDirectlyOwnedPartContentComponent(
  component: DarkComponent,
  rawPartRegion: PixelRegion,
  labelRegion: PixelRegion,
) {
  if (getIntersectionOverUnion(component, rawPartRegion) > 0) {
    return true
  }

  if (isConnectedPartRegionContinuation(component, rawPartRegion, labelRegion)) {
    return true
  }

  if (isStackedPartRegionContinuation(component, rawPartRegion, labelRegion)) {
    return true
  }

  return false
}

function isStackedPartRegionContinuation(
  component: DarkComponent,
  rawPartRegion: PixelRegion,
  labelRegion: PixelRegion,
) {
  const verticalGap = Math.max(
    0,
    Math.max(component.y - rawPartRegion.y - rawPartRegion.height, rawPartRegion.y - component.y - component.height),
  )
  const horizontalOverlap = Math.max(
    0,
    Math.min(component.x + component.width, rawPartRegion.x + rawPartRegion.width) -
      Math.max(component.x, rawPartRegion.x),
  )
  const horizontalOverlapRatio = horizontalOverlap / Math.max(1, Math.min(component.width, rawPartRegion.width))

  return (
    verticalGap <= Math.max(4, Math.round(labelRegion.height * 0.55)) &&
    horizontalOverlapRatio >= 0.18
  )
}

function isLooselyOwnedPartContentComponent(
  component: DarkComponent,
  rawPartRegion: PixelRegion,
  labelRegion: PixelRegion,
) {
  const labelCenterX = getRegionCenterX(labelRegion)
  const componentBottom = component.y + component.height
  const verticalGapToLabel = labelRegion.y - componentBottom

  return (
    labelCenterX >= component.x - labelRegion.width * 1.2 &&
    labelCenterX <= component.x + component.width + labelRegion.width * 1.2 &&
    verticalGapToLabel >= -labelRegion.height * 0.35 &&
    verticalGapToLabel <= Math.max(labelRegion.height * 5, rawPartRegion.height * 1.2)
  )
}

function mergeUniqueComponents(...groups: readonly DarkComponent[][]) {
  const merged: DarkComponent[] = []
  const seen = new Set<DarkComponent>()

  for (const group of groups) {
    for (const component of group) {
      if (seen.has(component)) {
        continue
      }
      seen.add(component)
      merged.push(component)
    }
  }

  return merged
}

function isNearAnyPartContentComponent(
  component: DarkComponent,
  candidates: readonly DarkComponent[],
  labelRegion: PixelRegion,
) {
  return candidates.some((candidate) =>
    component === candidate || arePartContentComponentsNear(component, candidate, labelRegion)
  )
}

function arePartContentComponentsNear(
  left: DarkComponent,
  right: DarkComponent,
  labelRegion: PixelRegion,
) {
  const gapTolerance = Math.max(4, Math.round(labelRegion.height * 0.45))
  const horizontalGap = Math.max(
    0,
    Math.max(left.x - right.x - right.width, right.x - left.x - left.width),
  )
  const verticalGap = Math.max(
    0,
    Math.max(left.y - right.y - right.height, right.y - left.y - left.height),
  )

  if (horizontalGap > gapTolerance || verticalGap > gapTolerance) {
    return false
  }

  return getVerticalOverlapRatio(left, right) >= 0.16 || getHorizontalOverlapRatio(left, right) >= 0.16
}

function isLikelyCalloutRuleComponent(
  component: DarkComponent,
  searchRegion: PixelRegion,
  rawPartRegion: PixelRegion,
  labelRegion: PixelRegion,
) {
  const edgeTolerance = Math.max(2, Math.round(labelRegion.height * 0.1))
  const touchesSearchTop = component.y <= searchRegion.y + edgeTolerance
  const touchesSearchLeft = component.x <= searchRegion.x + edgeTolerance
  const touchesSearchRight = component.x + component.width >= searchRegion.x + searchRegion.width - edgeTolerance
  const searchHeightCoverage = component.height / Math.max(1, searchRegion.height)
  const isHorizontalRule = component.height <= 3 &&
    component.width >= Math.max(20, labelRegion.width * 2.4, searchRegion.width * 0.32) &&
    (
      component.y <= rawPartRegion.y - 1 ||
      touchesSearchTop
    )
  const isVerticalRule = component.width <= 3 &&
    component.height >= Math.max(20, labelRegion.height * 2.8, searchRegion.height * 0.42) &&
    (
      component.x <= rawPartRegion.x - 1 ||
      touchesSearchLeft
    )
  const rightEdgeRuleWidthLimit = Math.max(
    3,
    Math.round(labelRegion.width * 0.95),
    Math.round(searchRegion.width * 0.26),
  )
  const startsAfterRawPartMidline = component.x >= rawPartRegion.x + Math.round(rawPartRegion.width * 0.45)
  const touchesSearchRightLoosely = component.x + component.width >=
    searchRegion.x + searchRegion.width - Math.max(edgeTolerance, rightEdgeRuleWidthLimit)
  const isRightEdgeVerticalRule = component.height >=
    Math.max(20, labelRegion.height * 2.8, searchRegion.height * 0.42) &&
    searchHeightCoverage >= 0.5 &&
    (
      (component.width <= 3 && (touchesSearchRight || startsAfterRawPartMidline)) ||
      (component.width <= rightEdgeRuleWidthLimit && startsAfterRawPartMidline && touchesSearchRightLoosely)
    )
  const isSparseCornerRule = (
    (
      (touchesSearchTop && touchesSearchLeft) ||
      (
        component.x <= rawPartRegion.x + edgeTolerance &&
        component.y <= rawPartRegion.y + edgeTolerance
      )
    ) &&
    component.width >= Math.max(20, labelRegion.width * 2.4) &&
    component.height >= Math.max(20, labelRegion.height * 2.8) &&
    component.count / Math.max(1, component.width * component.height) <= 0.08
  )
  const labelCenterX = getRegionCenterX(labelRegion)
  const isSparsePreLabelFrame = (
    component.width >= Math.max(20, labelRegion.width * 2.4) &&
    component.height >= Math.max(20, labelRegion.height * 2.8) &&
    component.count / Math.max(1, component.width * component.height) <= 0.08 &&
    component.y + component.height <= labelRegion.y + Math.round(labelRegion.height * 0.45) &&
    labelCenterX >= component.x &&
    labelCenterX <= component.x + component.width
  )

  return isHorizontalRule || isVerticalRule || isRightEdgeVerticalRule || isSparseCornerRule || isSparsePreLabelFrame
}

function isLikelyForeignPartContentComponent(
  component: DarkComponent,
  searchRegion: PixelRegion,
  rawPartRegion: PixelRegion,
  labelRegion: PixelRegion,
  {
    hasLeftNeighbor,
    hasRightNeighbor,
  }: {
    hasLeftNeighbor: boolean
    hasRightNeighbor: boolean
  },
) {
  const touchesLeftBoundary = component.x <= searchRegion.x + 1
  const touchesRightBoundary = component.x + component.width >= searchRegion.x + searchRegion.width - 1
  const horizontalTolerance = Math.max(2, Math.round(labelRegion.width * 0.22))

  return (
    (hasLeftNeighbor && touchesLeftBoundary && component.x + component.width <= rawPartRegion.x + horizontalTolerance) ||
    (hasRightNeighbor && touchesRightBoundary && component.x >= rawPartRegion.x + rawPartRegion.width - horizontalTolerance)
  )
}

function cropCanvasRegionRemovingBackground(
  canvas: HTMLCanvasElement,
  imageData: DetectionImageData,
  region: PixelRegion,
  background: ColorSample,
  foregroundMask?: Uint8Array,
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
      const sourceMaskIndex = (sourceY * imageData.width) + sourceX
      const isOwnedMaskPixel = Boolean(foregroundMask?.[sourceMaskIndex])
      if (
        foregroundMask &&
        !isOwnedMaskPixel
      ) {
        continue
      }

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
      if (!isOwnedMaskPixel && !isCalloutItemPreviewForegroundPixel(color, background)) {
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

function isCalloutItemPreviewEdgePixel(color: ColorSample, background: ColorSample) {
  const brightness = getColorBrightness(color)
  const chroma = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b)
  const distanceFromBackground = getColorDistance(color, background)

  return distanceFromBackground >= 10 || brightness < 245 || (chroma >= 12 && distanceFromBackground >= 6)
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
    isPointInsideRegion(x, y, region)
  )
}

function isPointInsideRegion(x: number, y: number, region: PixelRegion) {
  return (
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

function padRegionWithin(
  region: PixelRegion,
  imageWidth: number,
  imageHeight: number,
  padding: number,
  bounds: PixelRegion,
) {
  const paddedRegion = padRegion(region, imageWidth, imageHeight, padding)

  return intersectRegions(paddedRegion, bounds) ?? normalizeRegion(region, imageWidth, imageHeight)
}

function padPartRegion(
  partRegion: PixelRegion,
  imageWidth: number,
  imageHeight: number,
  padding: number,
  bounds?: PixelRegion,
) {
  const x = partRegion.x - padding
  const y = partRegion.y - padding
  const right = partRegion.x + partRegion.width + padding
  const bottom = partRegion.y + partRegion.height + padding

  const paddedRegion = normalizeRegion({
    height: bottom - y,
    width: right - x,
    x,
    y,
  }, imageWidth, imageHeight)

  return bounds ? intersectRegions(paddedRegion, bounds) ?? normalizeRegion(partRegion, imageWidth, imageHeight) : paddedRegion
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

function getElapsedMs(startedAt: number) {
  return getNowMs() - startedAt
}

function getNowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now()
}

async function yieldStepCalloutPageScan(signal?: AbortSignal) {
  assertStepCalloutDetectionCanContinue(signal)

  const scheduler = (globalThis as typeof globalThis & {
    scheduler?: { yield?: () => Promise<void> }
  }).scheduler
  if (typeof scheduler?.yield === "function") {
    await scheduler.yield()
    assertStepCalloutDetectionCanContinue(signal)
    return
  }

  if (typeof globalThis.MessageChannel === "function") {
    await new Promise<void>((resolve) => {
      const channel = new globalThis.MessageChannel()
      channel.port1.onmessage = () => {
        channel.port1.close()
        channel.port2.close()
        resolve()
      }
      channel.port2.postMessage(undefined)
    })
    assertStepCalloutDetectionCanContinue(signal)
    return
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
  assertStepCalloutDetectionCanContinue(signal)
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
