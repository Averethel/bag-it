import {
  classifyStepCalloutPageRole,
  detectStepCalloutPageCandidates,
  resolveStepCalloutConflicts,
  scoreStepCalloutPageEvidence,
  STEP_CALLOUT_DETECTOR_VERSION,
  type StepCalloutCandidate,
  type StepCalloutCandidateEvidence,
  type StepCalloutManualStyle,
  type StepCalloutPageRole,
} from "@bag-it/step-callouts"
import {
  createBrowserWorkerPool,
} from "./browser-worker-pool"
import type { StepDetectorV2PageInput } from "./contracts"

interface StepDetectorCandidateWorkerResult {
  candidates: StepCalloutCandidate[]
  page: StepDetectorV2PageInput
  pageRole: StepCalloutPageRole
  progressCalloutCount: number
}

interface StepDetectorEvidenceWorkerResult {
  evidence: StepCalloutCandidateEvidence[]
  page: StepDetectorV2PageInput
}

export interface StepDetectorScheduler {
  detectCandidates: (
    page: StepDetectorV2PageInput,
    signal: AbortSignal | undefined,
  ) => Promise<StepDetectorCandidateWorkerResult>
  scoreEvidence: (
    page: StepDetectorV2PageInput,
    candidates: readonly StepCalloutCandidate[],
    manualStyle: StepCalloutManualStyle | null,
    signal: AbortSignal | undefined,
  ) => Promise<StepDetectorEvidenceWorkerResult>
  terminate: () => void
  workerCount: number
}

type StepDetectorWorkerRequest =
  | {
      id: number
      kind: "candidates"
      page: StepDetectorV2PageInput
    }
  | {
      candidates: StepCalloutCandidate[]
      id: number
      kind: "evidence"
      manualStyle: StepCalloutManualStyle | null
      page: StepDetectorV2PageInput
    }

type StepDetectorWorkerResponse =
  | {
      candidates: StepCalloutCandidate[]
      detectorVersion: string
      id: number
      kind: "candidates"
      page: StepDetectorV2PageInput
      pageRole: StepCalloutPageRole
      progressCalloutCount: number
    }
  | {
      detectorVersion: string
      evidence: StepCalloutCandidateEvidence[]
      id: number
      kind: "evidence"
      page: StepDetectorV2PageInput
    }
  | {
      error: string
      id: number
      kind: "candidates" | "evidence"
    }

export function createStepDetectorScheduler(options: {
  parallelPageDetection?: boolean
}): StepDetectorScheduler {
  const workerCount = resolveStepDetectorWorkerCount(options)

  if (workerCount === 0) {
    return createFallbackStepDetectorScheduler()
  }

  const pool = createBrowserWorkerPool<StepDetectorWorkerRequest, StepDetectorWorkerResponse>(
    () => new Worker(new URL("./step-detector.worker.ts", import.meta.url), { type: "module" }),
    workerCount,
  )

  return {
    workerCount,
    detectCandidates: async (page, signal) => {
      const response = await pool.run({
        id: 0,
        kind: "candidates",
        page,
      }, [page.data.buffer as ArrayBuffer], signal)

      if ("error" in response) {
        throw new Error(response.error)
      }

      if (response.kind !== "candidates") {
        throw new Error("Step detector worker returned an unexpected candidate response.")
      }
      assertCurrentStepDetectorWorker(response.detectorVersion)

      return {
        candidates: response.candidates,
        page: response.page,
        pageRole: response.pageRole,
        progressCalloutCount: response.progressCalloutCount,
      }
    },
    scoreEvidence: async (page, candidates, manualStyle, signal) => {
      const workerPage = cloneStepDetectorPageInput(page)
      const response = await pool.run({
        candidates: [...candidates],
        id: 0,
        kind: "evidence",
        manualStyle,
        page: workerPage,
      }, [workerPage.data.buffer as ArrayBuffer], signal)

      if ("error" in response) {
        throw new Error(response.error)
      }

      if (response.kind !== "evidence") {
        throw new Error("Step detector worker returned an unexpected evidence response.")
      }
      assertCurrentStepDetectorWorker(response.detectorVersion)

      return {
        evidence: response.evidence,
        page: response.page,
      }
    },
    terminate: pool.terminate,
  }
}

export class StaleStepDetectorWorkerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StaleStepDetectorWorkerError"
  }
}

function assertCurrentStepDetectorWorker(detectorVersion: string | undefined): void {
  if (detectorVersion !== STEP_CALLOUT_DETECTOR_VERSION) {
    throw new StaleStepDetectorWorkerError(
      `Step detector worker version mismatch. detector=${detectorVersion ?? "missing"}/${STEP_CALLOUT_DETECTOR_VERSION}`,
    )
  }
}

export function resolveMaxQueuedWorkerPages(workerCount: number): number {
  return Math.max(1, workerCount * 2)
}

export function countPageResolvedVisibleCallouts(
  page: StepDetectorV2PageInput,
  evidence: readonly StepCalloutCandidateEvidence[],
): number {
  return summarizePageCandidateProgress(page, evidence).progressCalloutCount
}

function createFallbackStepDetectorScheduler(): StepDetectorScheduler {
  return {
    workerCount: 1,
    detectCandidates: async (page) => {
      const candidates = detectStepCalloutPageCandidates(page)
      const progressEvidence = scoreStepCalloutPageEvidence(page, candidates, null)
      const progress = summarizePageCandidateProgress(page, progressEvidence)

      return {
        candidates,
        page,
        pageRole: progress.pageRole,
        progressCalloutCount: progress.progressCalloutCount,
      }
    },
    scoreEvidence: async (page, candidates, manualStyle) => ({
      evidence: scoreStepCalloutPageEvidence(page, candidates, manualStyle),
      page,
    }),
    terminate: () => {},
  }
}

function summarizePageCandidateProgress(
  page: StepDetectorV2PageInput,
  evidence: readonly StepCalloutCandidateEvidence[],
): { pageRole: StepCalloutPageRole; progressCalloutCount: number } {
  const report = resolveStepCalloutConflicts(evidence, { pages: [page] })

  return {
    pageRole: classifyStepCalloutPageRole(page, evidence, report.resolvedCallouts),
    progressCalloutCount: report.resolvedCallouts
      .filter((callout) => callout.status === "accepted")
      .length,
  }
}

function cloneStepDetectorPageInput(page: StepDetectorV2PageInput): StepDetectorV2PageInput {
  return {
    ...page,
    data: new Uint8ClampedArray(page.data),
  }
}

function resolveStepDetectorWorkerCount(options: { parallelPageDetection?: boolean }): number {
  if (options.parallelPageDetection === false || typeof Worker === "undefined") {
    return 0
  }

  return Math.min(4, Math.max(1, readHardwareConcurrency() - 1))
}

function readHardwareConcurrency(): number {
  if (typeof navigator === "undefined" || !Number.isFinite(navigator.hardwareConcurrency)) {
    return 2
  }

  return navigator.hardwareConcurrency
}
