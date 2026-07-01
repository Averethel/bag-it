import {
  detectStepCalloutPageCandidates,
  resolveStepCalloutConflicts,
  scoreStepCalloutPageEvidence,
  STEP_CALLOUT_DETECTOR_VERSION,
  type StepCalloutCandidate,
  type StepCalloutCandidateEvidence,
  type StepCalloutManualStyle,
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
      workerScope.postMessage({
        candidates,
        detectorVersion: STEP_CALLOUT_DETECTOR_VERSION,
        id: request.id,
        kind: "candidates",
        page: request.page,
        progressCalloutCount: countPageResolvedVisibleCallouts(request.page, progressEvidence),
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

function countPageResolvedVisibleCallouts(
  page: StepDetectorV2PageInput,
  evidence: readonly StepCalloutCandidateEvidence[],
): number {
  const report = resolveStepCalloutConflicts(evidence, { pages: [page] })

  return report.resolvedCallouts.filter((callout) => callout.status === "accepted").length
}

export {}
