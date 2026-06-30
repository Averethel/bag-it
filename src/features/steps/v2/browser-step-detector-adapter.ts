import {
  type CalloutPartCalloutInput,
} from "@bag-it/callout-parts"
import {
  inferStepCalloutEvidenceManualStyle,
  resolveStepCalloutsFromPageEvidence,
  STEP_CALLOUT_DETECTOR_VERSION,
  type StepCalloutCandidate,
  type StepCalloutCandidateEvidence,
  type StepCalloutManualStyle,
  type StepCalloutPageAdvisoryDiagnostic,
  type StepCalloutPageRole,
} from "@bag-it/step-callouts"
import {
  visitStepDetectorV2PageInputsFromFile,
} from "./browser-page-input"
import type { StepDetectorV2PageInput } from "./contracts"
import {
  assembleV2BuildStepsResult,
  createBuildStepPartItems,
  type StepDetectorV2BuildStepsResult,
} from "./output-assembly"
import {
  createPartExtractionScheduler,
  STEP_PART_COLOR_CALIBRATION_V2_VERSION,
  STEP_PART_EXTRACTOR_V2_VERSION,
  StalePartExtractionWorkerError,
} from "./part-extraction-scheduler"
import {
  createColorSamplingPageInput,
  createPartColorRows,
  withDetectedPartColors,
  type StepPartColorCalibrationRow,
} from "./part-color-calibration-runner"
import {
  attachV2PreviewImages,
  type StepDetectorV2PreviewHydratableResult,
} from "./preview-images"
import {
  readStepDetectorV2PartExtractionRenderMaxWidth,
  type StepDetectorV2PageBounds,
} from "./render-widths"
import {
  countPageResolvedVisibleCallouts,
  createStepDetectorScheduler,
  resolveMaxQueuedWorkerPages,
  StaleStepDetectorWorkerError,
  type StepDetectorScheduler,
} from "./step-detector-scheduler"
import type {
  DetectedStepCalloutPartItem,
  StepProcessingTimingSummary,
} from "../step-detection-contracts"
export {
  createPdfPagePreviewAssetV2FromFile,
  hydratePdfStepPreviewImagesV2FromFile,
  type StepDetectorV2PagePreviewAssetOptions,
  type StepDetectorV2PreviewHydrationOptions,
  type StepDetectorV2PreviewHydrationUpdate,
} from "./preview-hydration-runner"

export const STEP_CALLOUT_DETECTOR_V2_VERSION = STEP_CALLOUT_DETECTOR_VERSION
export {
  STEP_PART_COLOR_CALIBRATION_V2_VERSION,
  STEP_PART_EXTRACTOR_V2_VERSION,
}

const DEFAULT_PAGE_PREVIEW_HYDRATION_RENDER_MAX_WIDTH = 520
const SAFE_TAIL_BOM_PAGE_COUNT = 3
const SAFE_TAIL_MIN_LAST_STEP_PAGE_RATIO = 0.6

export interface StepDetectorV2ScanOptions {
  eagerPreviewImages?: boolean
  maxPages?: number
  onPreviewPageInput?: (pageInput: StepDetectorV2PageInput, baseBounds: StepDetectorV2PageBounds) => void
  onPageAdvisoryDiagnostics?: (diagnostics: StepCalloutPageAdvisoryDiagnostic[]) => void
  pageCount?: number
  parallelPageDetection?: boolean
  signal?: AbortSignal
  onProgress?: (progress: StepDetectorV2Progress) => void
}

export interface StepDetectorV2Progress {
  activePage: number | null
  detectedCalloutCount?: number
  detectedPartItemCount?: number
  message: string
  phase?: StepDetectorV2ProgressPhase
  percentage: number
  processedCalloutCount?: number
  scannedPageCount: number
  targetCalloutCount?: number
  targetPageCount: number
}

export interface StepDetectorV2PartExtractionOptions {
  eagerPreviewImages?: boolean
  onPreviewPageInput?: (pageInput: StepDetectorV2PageInput, baseBounds: StepDetectorV2PageBounds) => void
  onProgress?: (progress: StepDetectorV2PartProgress) => void
  signal?: AbortSignal
}

export interface StepDetectorV2PartProgress {
  activePage: number | null
  detectedPartItemCount: number
  message: string
  phase?: StepDetectorV2ProgressPhase
  percentage: number
  processedCalloutCount: number
  targetCalloutCount: number
}

export type StepDetectorV2ProgressPhase =
  | "finalizing"
  | "page-scan"
  | "part-extraction"
  | "preview-hydration"

interface StepDetectorV2ReusableResult {
  callouts: StepDetectorV2ReusableCallout[]
  detectorVersion: string
  pageCount: number
  pageLimit: number | null
  pagePreviews?: Array<{
    height: number
    imageDataUrl?: string
    pageNumber: number
    width: number
  }>
  partColorCalibrationVersion?: string
  partExtractorVersion?: string
  previewTiming?: StepProcessingTimingSummary
  scannedPageNumbers: number[]
  skippedPageNumbers: number[]
  status: "detected" | "empty"
  timing?: StepProcessingTimingSummary
}

interface StepDetectorV2ReusableCallout {
  detectorCandidateId?: string
  id: string
  inferredBackground?: {
    rgb: {
      b: number
      g: number
      r: number
    }
  }
  pageNumber: number
  partExtractionRegion?: {
    height: number
    width: number
    x: number
    y: number
  }
  partItems: DetectedStepCalloutPartItem[]
  sourceRegion: {
    height: number
    width: number
    x: number
    y: number
  }
}

export async function scanPdfStepCalloutsV2FromFile(
  file: File,
  options: StepDetectorV2ScanOptions = {},
): Promise<StepDetectorV2BuildStepsResult> {
  const startedAt = readPerformanceNow()
  const scan = await runV2PageScanWithStaleWorkerRetry(file, options)
  const pageScanFinishedAt = readPerformanceNow()
  publishScanProgress(options, null, scan.progressCalloutCount, undefined, {
    message: "V2 resolving page callouts.",
    percentage: 90,
    phase: "finalizing",
  })
  const detectionReport = resolveStepCalloutsFromPageEvidence(
    scan.pages,
    scan.candidates,
    scan.evidence,
    {
      includePageAdvisoryDiagnostics: Boolean(options.onPageAdvisoryDiagnostics),
    },
  )
  options.onPageAdvisoryDiagnostics?.(detectionReport.pageAdvisoryDiagnostics)
  const resolverFinishedAt = readPerformanceNow()
  const assembledResult = assembleV2BuildStepsResult(
    scan.pages,
    detectionReport.resolvedCallouts,
    detectionReport.evidence,
    {
      detectorVersion: STEP_CALLOUT_DETECTOR_V2_VERSION,
      pageCount: scan.pageCount,
      pageLimit: options.maxPages ?? null,
      pageAdvisories: detectionReport.pageAdvisories,
      skippedPageNumbers: scan.skippedPageNumbers,
    },
  )
  const result = {
    ...assembledResult,
    timing: {
      counts: {
        callouts: assembledResult.callouts.length,
        pages: scan.pages.length,
        partRows: 0,
      },
      label: "V2 scan",
      phaseMs: {
        finalizing: Math.max(0, resolverFinishedAt - pageScanFinishedAt),
        "page-scan": Math.max(0, pageScanFinishedAt - startedAt),
      },
      totalMs: Math.max(0, resolverFinishedAt - startedAt),
    },
  }

  publishScanProgress(options, null, result.callouts.length, undefined, {
    message: "V2 scan complete.",
    percentage: 100,
    phase: "finalizing",
  })

  return result
}

export async function scanPdfStepPartsV2FromFile<
  T extends StepDetectorV2ReusableResult & StepDetectorV2PreviewHydratableResult,
>(
  file: File,
  result: T,
  options: StepDetectorV2PartExtractionOptions = {},
): Promise<T> {
  try {
    return await scanPdfStepPartsV2FromFileOnce(file, result, options)
  } catch (error) {
    if (!(error instanceof StalePartExtractionWorkerError)) {
      throw error
    }

    return scanPdfStepPartsV2FromFileOnce(file, result, options)
  }
}

async function scanPdfStepPartsV2FromFileOnce<
  T extends StepDetectorV2ReusableResult & StepDetectorV2PreviewHydratableResult,
>(
  file: File,
  result: T,
  options: StepDetectorV2PartExtractionOptions = {},
): Promise<T> {
  const startedAt = readPerformanceNow()
  const scheduler = createPartExtractionScheduler()
  let processedCalloutCount = 0
  const partItemsByCalloutId = new Map<string, ReturnType<typeof createBuildStepPartItems>>()
  const partColorRows: StepPartColorCalibrationRow[] = []
  const calloutsByPage = createReusableCalloutPageMap(result.callouts)
  const baseBoundsByPage = createResultPageBoundsMap(result)
  const initialPreviewPageNumbers = options.eagerPreviewImages === true
    ? readInitialPreviewHydrationPageNumbers(result)
    : new Set<number>()
  const initialPreviewPageInputs = new Map<number, StepDetectorV2PageInput>()
  const pageTasks = new Set<Promise<void>>()
  const maxQueuedPages = resolveMaxQueuedWorkerPages(scheduler.workerCount)

  try {
    await visitStepDetectorV2PageInputsFromFile(file, async (pageInput) => {
      throwIfAborted(options.signal)
      const pageCallouts = calloutsByPage.get(pageInput.pageNumber) ?? []
      const initialPreviewPageInput = initialPreviewPageNumbers.has(pageInput.pageNumber)
        ? cloneStepDetectorV2PageInput(pageInput)
        : null
      const baseBounds = readBasePageBounds(baseBoundsByPage, pageInput)
      const colorPageInput = createColorSamplingPageInput(pageInput, baseBounds)

      options.onPreviewPageInput?.(cloneStepDetectorV2PageInput(pageInput), baseBounds)
      const task = scheduler.extractParts(
        pageInput,
        pageCallouts.map(createPartExtractionCallout),
        baseBounds,
        options.signal,
      ).then(({ items, pageNumber }) => {
        throwIfAborted(options.signal)

        for (const callout of pageCallouts) {
          const candidateId = readReusableCalloutCandidateId(callout)
          const rawPartItems = items.filter((partItem) => partItem.calloutId === candidateId)

          partColorRows.push(...createPartColorRows(colorPageInput, callout, rawPartItems, {
            highResolutionPageInput: pageInput,
          }))
          processedCalloutCount += 1
          partItemsByCalloutId.set(
            callout.id,
            createBuildStepPartItems(
              { candidateId },
              rawPartItems,
            ),
          )
        }

        publishPartProgress(
          options,
          pageNumber,
          processedCalloutCount,
          result.callouts.length,
          partItemsByCalloutId,
        )
        if (initialPreviewPageInput) {
          initialPreviewPageInputs.set(pageNumber, initialPreviewPageInput)
        }
      }).finally(() => {
        pageTasks.delete(task)
      })

      pageTasks.add(task)

      if (pageTasks.size >= maxQueuedPages) {
        await Promise.race(pageTasks)
      }
    }, {
      allowUpscale: true,
      batchSize: 1,
      maxPages: result.pageLimit ?? undefined,
      pageNumbers: [...calloutsByPage.keys()],
      renderMaxWidth: readStepDetectorV2PartExtractionRenderMaxWidth([...baseBoundsByPage.values()]),
      signal: options.signal,
    })

    await Promise.all(pageTasks)
  } finally {
    scheduler.terminate()
  }

  const nextResult = withDetectedPartColors({
    ...result,
    partColorCalibrationVersion: STEP_PART_COLOR_CALIBRATION_V2_VERSION,
    partExtractorVersion: STEP_PART_EXTRACTOR_V2_VERSION,
    callouts: result.callouts.map((callout) => ({
      ...callout,
      partItems: partItemsByCalloutId.get(callout.id) ?? [],
    })),
  }, partColorRows)
  const partExtractionFinishedAt = readPerformanceNow()
  const hydratedResult = initialPreviewPageInputs.size > 0
    ? await attachV2PreviewImages(nextResult, [...initialPreviewPageInputs.values()], {
        includeCropPreviews: true,
        includePagePreviews: true,
        pagePreviewMaxWidth: DEFAULT_PAGE_PREVIEW_HYDRATION_RENDER_MAX_WIDTH,
      })
    : nextResult
  const partExtractionMs = Math.max(0, partExtractionFinishedAt - startedAt)

  publishPartProgress(options, null, result.callouts.length, result.callouts.length, partItemsByCalloutId)

  return {
    ...hydratedResult,
    timing: {
      counts: {
        callouts: hydratedResult.callouts.length,
        pages: result.scannedPageNumbers.length,
        partRows: countExtractedPartItems(partItemsByCalloutId),
      },
      label: result.timing?.label ?? "V2 scan",
      phaseMs: {
        ...(result.timing?.phaseMs ?? {}),
        "part-extraction": partExtractionMs,
      },
      totalMs: Math.max(0, (result.timing?.totalMs ?? 0) + partExtractionMs),
    },
  } as T
}

function publishScanProgress(
  options: StepDetectorV2ScanOptions,
  activePage: number | null,
  detectedCalloutCount?: number,
  detectedPartItemCount?: number,
  overrides: Partial<StepDetectorV2Progress> = {},
): void {
  const targetPageCount = options.pageCount ?? options.maxPages ?? 1
  const scannedPageCount = activePage ?? targetPageCount

  options.onProgress?.({
    activePage,
    detectedCalloutCount,
    detectedPartItemCount,
    phase: overrides.phase ?? "page-scan",
    message: activePage ? `V2 scanning page ${activePage}.` : "V2 scan complete.",
    percentage: progressPercentage(scannedPageCount, targetPageCount),
    scannedPageCount,
    targetPageCount,
    ...overrides,
  })
}

function publishPartProgress(
  options: StepDetectorV2PartExtractionOptions,
  activePage: number | null,
  processedCalloutCount: number,
  targetCalloutCount: number,
  partItemsByCalloutId: ReadonlyMap<string, ReturnType<typeof createBuildStepPartItems>>,
): void {
  options.onProgress?.({
    activePage,
    detectedPartItemCount: countExtractedPartItems(partItemsByCalloutId),
    message: activePage ? `V2 extracting parts on page ${activePage}.` : "V2 part extraction complete.",
    phase: "part-extraction",
    percentage: progressPercentage(processedCalloutCount, targetCalloutCount),
    processedCalloutCount,
    targetCalloutCount,
  })
}

function progressPercentage(scannedPageCount: number, targetPageCount: number): number {
  if (targetPageCount === 0) {
    return 100
  }

  return Math.min(100, Math.round((scannedPageCount / targetPageCount) * 100))
}

interface V2PageScanResult {
  candidates: StepCalloutCandidate[]
  evidence: StepCalloutCandidateEvidence[]
  pageCount: number
  pages: StepDetectorV2PageInput[]
  progressCalloutCount: number
  skippedPageNumbers: number[]
}

interface SafeBomTailState {
  consecutiveBomTailPages: number
  lastStepLikePageNumber: number | null
}

async function runV2PageScanWithStaleWorkerRetry(
  file: File,
  options: StepDetectorV2ScanOptions,
): Promise<V2PageScanResult> {
  try {
    return await runV2PageScan(file, options)
  } catch (error) {
    if (options.parallelPageDetection === false || !(error instanceof StaleStepDetectorWorkerError)) {
      throw error
    }

    return runV2PageScan(file, {
      ...options,
      parallelPageDetection: false,
    })
  }
}

async function runV2PageScan(
  file: File,
  options: StepDetectorV2ScanOptions,
): Promise<V2PageScanResult> {
  const scheduler = createStepDetectorScheduler(options)
  const candidatesByPage = new Map<number, StepCalloutCandidate[]>()
  const pagesByNumber = new Map<number, StepDetectorV2PageInput>()
  const progressCalloutCountByPage = new Map<number, number>()
  const pageRoleByNumber = new Map<number, StepCalloutPageRole>()
  const candidateTasks = new Set<Promise<void>>()
  const maxQueuedPages = resolveMaxQueuedWorkerPages(scheduler.workerCount)
  let scannedPageCount = 0

  try {
    const pagesResult = await visitStepDetectorV2PageInputsFromFile(file, async (pageInput, context) => {
      throwIfAborted(options.signal)

      const task = scheduler.detectCandidates(pageInput, options.signal)
        .then(({ candidates, page, pageRole, progressCalloutCount }) => {
          throwIfAborted(options.signal)
          scannedPageCount += 1
          candidatesByPage.set(page.pageNumber, candidates)
          pagesByNumber.set(page.pageNumber, page)
          pageRoleByNumber.set(page.pageNumber, pageRole)
          progressCalloutCountByPage.set(page.pageNumber, progressCalloutCount)
          options.onPreviewPageInput?.(
            cloneStepDetectorV2PageInput(page),
            { height: page.height, width: page.width },
          )
          publishScanProgress(
            options,
            page.pageNumber,
            countResolvedVisibleCallouts(progressCalloutCountByPage),
            undefined,
            {
              message: `V2 scanning page ${page.pageNumber}.`,
              percentage: scaledProgress(scannedPageCount, readScanProgressTarget(options), 0, 45),
              phase: "page-scan",
              scannedPageCount,
            },
          )
        })
        .finally(() => {
          candidateTasks.delete(task)
        })

      candidateTasks.add(task)

      if (candidateTasks.size >= maxQueuedPages) {
        await Promise.race(candidateTasks)

        if (
          shouldStopForSafeBomTail(
            pageRoleByNumber,
            context?.pageCount ?? options.pageCount ?? Number.POSITIVE_INFINITY,
            options,
          )
        ) {
          return false
        }
      }
    }, {
      batchSize: 1,
      maxPages: options.maxPages,
      signal: options.signal,
    })

    await Promise.all(candidateTasks)

    const pages = sortPagesByNumber([...pagesByNumber.values()])
    const candidates = pages.flatMap((page) => candidatesByPage.get(page.pageNumber) ?? [])
    const manualStyle = inferStepCalloutEvidenceManualStyle(pages, candidates)
    const evidence = await scoreEvidenceWithScheduler(
      scheduler,
      pages,
      candidatesByPage,
      manualStyle,
      options,
      progressCalloutCountByPage,
    )

    return {
      candidates,
      evidence,
      pageCount: pagesResult.pageCount,
      pages,
      progressCalloutCount: countResolvedVisibleCallouts(progressCalloutCountByPage),
      skippedPageNumbers: createSkippedPageNumbers(pagesResult.pageCount, pagesByNumber, options),
    }
  } finally {
    scheduler.terminate()
  }
}

function shouldStopForSafeBomTail(
  pageRoleByNumber: ReadonlyMap<number, StepCalloutPageRole>,
  pageCount: number,
  options: StepDetectorV2ScanOptions,
): boolean {
  return (
    options.maxPages === undefined &&
    readSafeBomTailStopPage(pageRoleByNumber, pageCount) !== null
  )
}

export function readSafeBomTailStopPage(
  pageRoleByNumber: ReadonlyMap<number, StepCalloutPageRole>,
  pageCount: number,
): number | null {
  let state = createSafeBomTailState()

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const role = pageRoleByNumber.get(pageNumber)

    if (!role) {
      return null
    }

    state = updateSafeBomTailState(state, pageNumber, role)

    if (isSafeBomTailStop(state, pageCount)) {
      return pageNumber
    }
  }

  return null
}

function createSafeBomTailState(): SafeBomTailState {
  return {
    consecutiveBomTailPages: 0,
    lastStepLikePageNumber: null,
  }
}

function updateSafeBomTailState(
  state: SafeBomTailState,
  pageNumber: number,
  role: StepCalloutPageRole,
): SafeBomTailState {
  if (role === "step-like") {
    return {
      consecutiveBomTailPages: 0,
      lastStepLikePageNumber: pageNumber,
    }
  }

  if (role === "bom-like" && state.lastStepLikePageNumber !== null) {
    return {
      ...state,
      consecutiveBomTailPages: state.consecutiveBomTailPages + 1,
    }
  }

  return {
    ...state,
    consecutiveBomTailPages: 0,
  }
}

function isSafeBomTailStop(
  state: SafeBomTailState,
  pageCount: number,
): boolean {
  return (
    state.consecutiveBomTailPages >= SAFE_TAIL_BOM_PAGE_COUNT &&
    isLateManualStepPage(state.lastStepLikePageNumber, pageCount)
  )
}

function isLateManualStepPage(
  pageNumber: number | null,
  pageCount: number,
): boolean {
  return (
    pageNumber !== null &&
    pageNumber / Math.max(1, pageCount) >= SAFE_TAIL_MIN_LAST_STEP_PAGE_RATIO
  )
}

function createSkippedPageNumbers(
  pageCount: number,
  pagesByNumber: ReadonlyMap<number, StepDetectorV2PageInput>,
  options: StepDetectorV2ScanOptions,
): number[] {
  if (options.maxPages !== undefined) {
    return []
  }

  const skippedPageNumbers: number[] = []

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    if (!pagesByNumber.has(pageNumber)) {
      skippedPageNumbers.push(pageNumber)
    }
  }

  return skippedPageNumbers
}

async function scoreEvidenceWithScheduler(
  scheduler: StepDetectorScheduler,
  pages: readonly StepDetectorV2PageInput[],
  candidatesByPage: ReadonlyMap<number, StepCalloutCandidate[]>,
  manualStyle: StepCalloutManualStyle | null,
  options: StepDetectorV2ScanOptions,
  progressCalloutCountByPage: Map<number, number>,
): Promise<StepCalloutCandidateEvidence[]> {
  const evidenceByPage = new Map<number, StepCalloutCandidateEvidence[]>()
  const evidenceTasks = new Set<Promise<void>>()
  const maxQueuedPages = resolveMaxQueuedWorkerPages(scheduler.workerCount)
  let scoredPageCount = 0

  for (const page of pages) {
    throwIfAborted(options.signal)

    const pageCandidates = candidatesByPage.get(page.pageNumber) ?? []
    const task = scheduler.scoreEvidence(page, pageCandidates, manualStyle, options.signal)
      .then((result) => {
        throwIfAborted(options.signal)
        scoredPageCount += 1
        evidenceByPage.set(page.pageNumber, result.evidence)
        progressCalloutCountByPage.set(
          page.pageNumber,
          countPageResolvedVisibleCallouts(result.page, result.evidence),
        )
        publishScanProgress(
          options,
          page.pageNumber,
          countResolvedVisibleCallouts(progressCalloutCountByPage),
          undefined,
          {
            message: `V2 scoring page ${page.pageNumber}.`,
            percentage: scaledProgress(scoredPageCount, pages.length, 45, 85),
            phase: "page-scan",
            scannedPageCount: pages.length,
          },
        )
      })
      .finally(() => {
        evidenceTasks.delete(task)
      })

    evidenceTasks.add(task)

    if (evidenceTasks.size >= maxQueuedPages) {
      await Promise.race(evidenceTasks)
    }
  }

  await Promise.all(evidenceTasks)

  return pages.flatMap((page) => evidenceByPage.get(page.pageNumber) ?? [])
}

function countResolvedVisibleCallouts(countByPage: ReadonlyMap<number, number>): number {
  let total = 0

  for (const count of countByPage.values()) {
    total += count
  }

  return total
}

function sortPagesByNumber(pages: readonly StepDetectorV2PageInput[]): StepDetectorV2PageInput[] {
  return [...pages].sort((left, right) => left.pageNumber - right.pageNumber)
}

function scaledProgress(done: number, total: number, min: number, max: number): number {
  if (total <= 0) {
    return max
  }

  return Math.min(max, Math.round(min + ((max - min) * done) / total))
}

function readScanProgressTarget(options: StepDetectorV2ScanOptions): number {
  if (options.pageCount && options.maxPages) {
    return Math.min(options.pageCount, options.maxPages)
  }

  return options.pageCount ?? options.maxPages ?? 1
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Operation cancelled.", "AbortError")
  }
}

function readPerformanceNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now()
}

function createPartExtractionCalloutPageMap<T extends { pageNumber: number }>(
  callouts: readonly T[],
): Map<number, T[]> {
  const byPage = new Map<number, T[]>()

  for (const callout of callouts) {
    byPage.set(callout.pageNumber, [...(byPage.get(callout.pageNumber) ?? []), callout])
  }

  return byPage
}

function countDetectedPartItems(result: StepDetectorV2BuildStepsResult): number {
  return result.callouts.reduce((total, callout) => total + callout.partItems.length, 0)
}

function createReusableCalloutPageMap(
  callouts: readonly StepDetectorV2ReusableCallout[],
): Map<number, StepDetectorV2ReusableCallout[]> {
  const byPage = new Map<number, StepDetectorV2ReusableCallout[]>()

  for (const callout of callouts) {
    byPage.set(callout.pageNumber, [...(byPage.get(callout.pageNumber) ?? []), callout])
  }

  return byPage
}

function readInitialPreviewHydrationPageNumbers(result: StepDetectorV2ReusableResult): Set<number> {
  const firstPreviewPageNumber = result.callouts[0]?.pageNumber ?? result.scannedPageNumbers[0]

  return firstPreviewPageNumber ? new Set([firstPreviewPageNumber]) : new Set()
}

function cloneStepDetectorV2PageInput(page: StepDetectorV2PageInput): StepDetectorV2PageInput {
  return {
    ...page,
    data: new Uint8ClampedArray(page.data),
  }
}

function createResultPageBoundsMap(
  result: StepDetectorV2ReusableResult,
): Map<number, StepDetectorV2PageBounds> {
  return new Map(
    result.pagePreviews?.map((preview) => [
      preview.pageNumber,
      { height: preview.height, width: preview.width },
    ]) ?? [],
  )
}

function readBasePageBounds(
  baseBoundsByPage: ReadonlyMap<number, StepDetectorV2PageBounds>,
  page: StepDetectorV2PageInput,
): StepDetectorV2PageBounds {
  return baseBoundsByPage.get(page.pageNumber) ?? { height: page.height, width: page.width }
}

function countExtractedPartItems(
  partItemsByCalloutId: ReadonlyMap<string, ReturnType<typeof createBuildStepPartItems>>,
): number {
  return [...partItemsByCalloutId.values()].reduce((total, partItems) => total + partItems.length, 0)
}

function createPartExtractionCallout(callout: StepDetectorV2ReusableCallout): CalloutPartCalloutInput {
  return {
    background: callout.inferredBackground?.rgb,
    id: readReusableCalloutCandidateId(callout),
    pageNumber: callout.pageNumber,
    region: callout.partExtractionRegion ?? callout.sourceRegion,
  }
}

function readReusableCalloutCandidateId(callout: StepDetectorV2ReusableCallout): string {
  return callout.detectorCandidateId ?? readLegacyCalloutCandidateId(callout.id)
}

function readLegacyCalloutCandidateId(calloutId: string): string {
  return calloutId.startsWith("v2-") ? calloutId.slice(3) : calloutId
}
