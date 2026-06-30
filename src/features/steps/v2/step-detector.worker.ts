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
import type { StepDetectorV2PageInput } from "./contracts"

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
      kind: StepDetectorWorkerRequest["kind"]
    }

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<StepDetectorWorkerRequest>) => void) | null
  postMessage: (message: StepDetectorWorkerResponse, transfer?: Transferable[]) => void
}

workerScope.onmessage = (event) => {
  const request = event.data

  try {
    if (request.kind === "candidates") {
      const candidates = detectStepCalloutPageCandidates(request.page)
      const progressEvidence = scoreStepCalloutPageEvidence(request.page, candidates, null)
      const progress = summarizePageCandidateProgress(request.page, progressEvidence)
      workerScope.postMessage({
        candidates,
        detectorVersion: STEP_CALLOUT_DETECTOR_VERSION,
        id: request.id,
        kind: "candidates",
        page: request.page,
        pageRole: progress.pageRole,
        progressCalloutCount: progress.progressCalloutCount,
      }, [request.page.data.buffer as ArrayBuffer])
      return
    }

    workerScope.postMessage({
      detectorVersion: STEP_CALLOUT_DETECTOR_VERSION,
      evidence: scoreStepCalloutPageEvidence(
        request.page,
        request.candidates,
        request.manualStyle,
      ),
      id: request.id,
      kind: "evidence",
      page: request.page,
    }, [request.page.data.buffer as ArrayBuffer])
  } catch (error) {
    workerScope.postMessage({
      error: error instanceof Error ? error.message : "Step detector worker failed.",
      id: request.id,
      kind: request.kind,
    })
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

export {}
