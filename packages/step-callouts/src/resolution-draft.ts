import type {
  StepCalloutCandidateEvidence,
  StepCalloutEvidenceScore,
  StepCalloutFailureKind,
  StepCalloutResolvedCallout,
  StepCalloutResolutionStatus,
} from "./contracts"

export interface StepCalloutResolutionDraft {
  evidence: StepCalloutCandidateEvidence
  rejectionKind: StepCalloutFailureKind | null
  status: StepCalloutResolutionStatus
}

export function rejectStepCalloutResolutionDraft(
  draft: StepCalloutResolutionDraft,
  rejectionKind: StepCalloutFailureKind,
): StepCalloutResolutionDraft {
  return {
    ...draft,
    rejectionKind,
    status: "rejected",
  }
}

export function createStepCalloutResolvedCallout(
  draft: StepCalloutResolutionDraft,
): StepCalloutResolvedCallout {
  const candidate = draft.evidence.candidate

  return {
    candidateId: candidate.id,
    pageNumber: candidate.pageNumber,
    region: candidate.region,
    status: draft.status,
  }
}

export function readStepCalloutEvidenceSignalValue(
  scores: readonly StepCalloutEvidenceScore[],
  signal: StepCalloutEvidenceScore["signal"],
): number {
  return scores.find((score) => score.signal === signal)?.value ?? 0
}
