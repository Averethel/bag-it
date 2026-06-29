import {
  detectStepCalloutCandidatesForPage,
  createCalloutCandidateStageSnapshot,
  type StepCalloutCandidateStageResult,
} from "./callout-candidates"
import {
  scoreCandidateEvidence,
  createCalloutEvidenceStageSnapshot,
  type StepCalloutEvidenceStageResult,
} from "./callout-evidence"
import {
  resolveStepCalloutConflicts,
  type StepCalloutResolutionStageResult,
} from "./conflict-resolution"
import {
  inferStepCalloutManualCalloutStyle,
  type StepCalloutManualStyle,
} from "./manual-style"
import type {
  StepCalloutCandidate,
  StepCalloutCandidateEvidence,
  StepCalloutPageInput,
  StepCalloutResolvedCallout,
  StepCalloutStageSnapshot,
} from "./contracts"
import { createPageInputStageSnapshot } from "./page-input"

export const STEP_CALLOUT_DETECTOR_VERSION = "2.0.0-alpha.19"

export interface StepCalloutDetection {
  evidence: StepCalloutCandidateEvidence | null
  pageNumber: number
  region: StepCalloutResolvedCallout["region"]
  status: StepCalloutResolvedCallout["status"]
}

export interface StepCalloutDetectionReport {
  candidates: StepCalloutCandidate[]
  detections: StepCalloutDetection[]
  evidence: StepCalloutCandidateEvidence[]
  resolvedCallouts: StepCalloutResolvedCallout[]
  stageSnapshots: StepCalloutStageSnapshot[]
}

export function detectStepCallouts(
  pages: readonly StepCalloutPageInput[],
): StepCalloutDetectionReport {
  const candidates = pages.flatMap(detectStepCalloutPageCandidates)
  const manualStyle = inferStepCalloutEvidenceManualStyle(pages, candidates)
  const evidence = pages.flatMap((page) =>
    scoreStepCalloutPageEvidence(
      page,
      candidates.filter((candidate) => candidate.pageNumber === page.pageNumber),
      manualStyle,
    ),
  )

  return resolveStepCalloutsFromPageEvidence(
    pages,
    candidates,
    evidence,
  )
}

export function detectStepCalloutPageCandidates(
  page: StepCalloutPageInput,
): StepCalloutCandidate[] {
  return detectStepCalloutCandidatesForPage(page)
}

export function inferStepCalloutEvidenceManualStyle(
  pages: readonly StepCalloutPageInput[],
  candidates: readonly StepCalloutCandidate[],
): StepCalloutManualStyle | null {
  return inferStepCalloutManualCalloutStyle(pages, candidates)
}

export function scoreStepCalloutPageEvidence(
  page: StepCalloutPageInput,
  candidates: readonly StepCalloutCandidate[],
  manualStyle: StepCalloutManualStyle | null,
): StepCalloutCandidateEvidence[] {
  return candidates.map((candidate) => scoreCandidateEvidence(page, candidate, manualStyle))
}

export function resolveStepCalloutsFromPageEvidence(
  pages: readonly StepCalloutPageInput[],
  candidates: readonly StepCalloutCandidate[],
  evidence: readonly StepCalloutCandidateEvidence[],
): StepCalloutDetectionReport {
  const candidateStage: StepCalloutCandidateStageResult = {
    candidates: [...candidates],
    snapshot: createCalloutCandidateStageSnapshot(candidates),
  }
  const evidenceStage: StepCalloutEvidenceStageResult = {
    evidence: [...evidence],
    snapshot: createCalloutEvidenceStageSnapshot(evidence),
  }
  const resolutionStage = resolveStepCalloutConflicts(evidenceStage.evidence, { pages })

  return createDetectionReport(pages, candidateStage, evidenceStage, resolutionStage)
}

function createDetectionReport(
  pages: readonly StepCalloutPageInput[],
  candidateStage: StepCalloutCandidateStageResult,
  evidenceStage: StepCalloutEvidenceStageResult,
  resolutionStage: StepCalloutResolutionStageResult,
): StepCalloutDetectionReport {
  return {
    candidates: candidateStage.candidates,
    detections: createDetections(resolutionStage.resolvedCallouts, evidenceStage.evidence),
    evidence: evidenceStage.evidence,
    resolvedCallouts: resolutionStage.resolvedCallouts,
    stageSnapshots: [
      createPageInputStageSnapshot(pages),
      candidateStage.snapshot,
      evidenceStage.snapshot,
      resolutionStage.snapshot,
    ],
  }
}

function createDetections(
  resolvedCallouts: readonly StepCalloutResolvedCallout[],
  evidence: readonly StepCalloutCandidateEvidence[],
): StepCalloutDetection[] {
  const evidenceByCandidateId = new Map(
    evidence.map((candidateEvidence) => [candidateEvidence.candidate.id, candidateEvidence]),
  )

  return resolvedCallouts.map((callout) => ({
    evidence: evidenceByCandidateId.get(callout.candidateId) ?? null,
    pageNumber: callout.pageNumber,
    region: callout.region,
    status: callout.status,
  }))
}
