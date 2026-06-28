import {
  CALLOUT_PART_EXTRACTOR_VERSION,
  extractCalloutPartsForScaledPage,
  type CalloutPartCalloutInput,
  type CalloutPartItem,
} from "@bag-it/callout-parts"
import { PART_COLOR_CALIBRATION_VERSION } from "@bag-it/part-colors"
import {
  createBrowserWorkerPool,
  type BrowserWorkerPool,
} from "./browser-worker-pool"
import type { StepDetectorV2PageInput } from "./contracts"
import type {
  PartExtractionWorkerRequest,
  PartExtractionWorkerResponse,
  PartExtractionWorkerResult,
} from "./part-extraction-worker-contracts"
import type { StepDetectorV2PageBounds } from "./render-widths"

export const STEP_PART_EXTRACTOR_V2_VERSION = CALLOUT_PART_EXTRACTOR_VERSION
export const STEP_PART_COLOR_CALIBRATION_V2_VERSION = PART_COLOR_CALIBRATION_VERSION

export interface PartExtractionScheduler {
  extractParts: (
    page: StepDetectorV2PageInput,
    callouts: readonly CalloutPartCalloutInput[],
    basePageBounds: StepDetectorV2PageBounds,
    signal: AbortSignal | undefined,
  ) => Promise<PartExtractionWorkerResult>
  terminate: () => void
  workerCount: number
}

export class StalePartExtractionWorkerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StalePartExtractionWorkerError"
  }
}

export function createPartExtractionScheduler(): PartExtractionScheduler {
  const workerCount = resolvePartExtractionWorkerCount()

  if (workerCount === 0) {
    return createFallbackPartExtractionScheduler()
  }

  let pool = createPartExtractionWorkerPool(workerCount)
  let versionCheck: Promise<void> | null = null

  const ensureCurrentWorkerPool = (signal: AbortSignal | undefined): Promise<void> => {
    versionCheck ??= runPartExtractionWorkerVersionCheck(pool, signal)

    return versionCheck
  }

  return {
    workerCount,
    extractParts: async (page, callouts, basePageBounds, signal) => {
      await ensureCurrentWorkerPool(signal)
      const response = await runPartExtractionWorker(pool, page, callouts, basePageBounds, signal)

      if ("error" in response) {
        throw new Error(response.error)
      }
      if (response.type !== "extract") {
        throw new Error("Part extraction worker returned an unexpected response.")
      }

      return {
        items: response.items,
        pageNumber: response.pageNumber,
        partColorCalibrationVersion: response.partColorCalibrationVersion,
        partExtractorVersion: response.partExtractorVersion,
      }
    },
    terminate: () => {
      pool.terminate()
    },
  }
}

function createPartExtractionWorkerPool(
  workerCount: number,
): BrowserWorkerPool<PartExtractionWorkerRequest, PartExtractionWorkerResponse> {
  return createBrowserWorkerPool<PartExtractionWorkerRequest, PartExtractionWorkerResponse>(
    () => new Worker(new URL("./part-extraction.worker.ts", import.meta.url), { type: "module" }),
    workerCount,
  )
}

async function runPartExtractionWorkerVersionCheck(
  pool: BrowserWorkerPool<PartExtractionWorkerRequest, PartExtractionWorkerResponse>,
  signal: AbortSignal | undefined,
): Promise<void> {
  const response = await pool.run({
    id: 0,
    type: "version",
  }, [], signal)

  if ("error" in response) {
    throw new StalePartExtractionWorkerError(response.error)
  }

  assertCurrentPartExtractionWorker(response)
}

async function runPartExtractionWorker(
  pool: BrowserWorkerPool<PartExtractionWorkerRequest, PartExtractionWorkerResponse>,
  page: StepDetectorV2PageInput,
  callouts: readonly CalloutPartCalloutInput[],
  basePageBounds: StepDetectorV2PageBounds,
  signal: AbortSignal | undefined,
): Promise<PartExtractionWorkerResponse> {
  const requestPage = cloneStepDetectorV2PageInput(page)

  const response = await pool.run({
    basePageBounds,
    callouts: [...callouts],
    id: 0,
    page: requestPage,
    type: "extract",
  }, [requestPage.data.buffer as ArrayBuffer], signal)

  assertCurrentPartExtractionWorker(response)

  return response
}

function assertCurrentPartExtractionWorker(response: PartExtractionWorkerResponse): void {
  if ("error" in response) {
    return
  }

  if (
    response.partExtractorVersion !== STEP_PART_EXTRACTOR_V2_VERSION ||
    response.partColorCalibrationVersion !== STEP_PART_COLOR_CALIBRATION_V2_VERSION
  ) {
    throw new StalePartExtractionWorkerError(
      [
        "Part extraction worker version mismatch.",
        `partExtractor=${response.partExtractorVersion ?? "missing"}/${STEP_PART_EXTRACTOR_V2_VERSION}`,
        `partColor=${response.partColorCalibrationVersion ?? "missing"}/${STEP_PART_COLOR_CALIBRATION_V2_VERSION}`,
      ].join(" "),
    )
  }
}

function createFallbackPartExtractionScheduler(): PartExtractionScheduler {
  return {
    workerCount: 1,
    extractParts: async (page, callouts, basePageBounds) => ({
      items: extractPartItemsForScaledPageCallouts(page, callouts, basePageBounds),
      pageNumber: page.pageNumber,
      partColorCalibrationVersion: STEP_PART_COLOR_CALIBRATION_V2_VERSION,
      partExtractorVersion: STEP_PART_EXTRACTOR_V2_VERSION,
    }),
    terminate: () => {},
  }
}

function resolvePartExtractionWorkerCount(): number {
  return typeof Worker === "undefined" ? 0 : 2
}

function cloneStepDetectorV2PageInput(page: StepDetectorV2PageInput): StepDetectorV2PageInput {
  return {
    ...page,
    data: new Uint8ClampedArray(page.data),
  }
}

function extractPartItemsForScaledPageCallouts(
  page: StepDetectorV2PageInput,
  callouts: readonly CalloutPartCalloutInput[],
  baseBounds: StepDetectorV2PageBounds,
): CalloutPartItem[] {
  return extractCalloutPartsForScaledPage({
    basePageBounds: baseBounds,
    callouts,
    page,
  }).items
}
