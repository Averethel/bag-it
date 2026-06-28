import type {
  StepCalloutCandidate,
  StepCalloutCandidateEvidence,
  StepCalloutCandidateSource,
  StepCalloutEvidenceScore,
  StepCalloutEvidenceSignal,
  StepCalloutPageInput,
  StepCalloutRegion,
  StepCalloutResolvedCallout,
  StepCalloutResolutionStatus,
  StepCalloutRgbColor,
} from "@bag-it/step-callouts"

export const STEP_DETECTOR_V2_STAGE_IDS = [
  "page-input",
  "callout-candidates",
  "callout-evidence",
  "conflict-resolution",
  "quantity-labels",
  "part-extraction",
  "output-assembly",
] as const

export type StepDetectorV2StageId = (typeof STEP_DETECTOR_V2_STAGE_IDS)[number]

export const STEP_DETECTOR_V2_FAILURE_KINDS = [
  "missing-candidate",
  "false-positive-candidate",
  "bad-merge",
  "bad-split",
  "duplicate",
  "quantity-missing",
  "quantity-wrong",
  "part-crop-overlaps-label",
  "part-crop-cuts-part",
] as const

export type StepDetectorV2FailureKind = (typeof STEP_DETECTOR_V2_FAILURE_KINDS)[number]

export type StepDetectorV2Region = StepCalloutRegion
export type StepDetectorV2RgbColor = StepCalloutRgbColor
export type StepDetectorV2PageInput = StepCalloutPageInput
export type StepDetectorV2CandidateSource = StepCalloutCandidateSource
export type StepDetectorV2CalloutCandidate = StepCalloutCandidate
export type StepDetectorV2EvidenceSignal = StepCalloutEvidenceSignal
export type StepDetectorV2EvidenceScore = StepCalloutEvidenceScore
export type StepDetectorV2CandidateEvidence = StepCalloutCandidateEvidence
export type StepDetectorV2ResolutionStatus = StepCalloutResolutionStatus
export type StepDetectorV2ResolvedCallout = StepCalloutResolvedCallout

export type StepDetectorV2FailureTaxonomy = Record<StepDetectorV2FailureKind, number>

export interface StepDetectorV2StageCounts {
  accepted: number
  rejected: number
  total: number
}

export interface StepDetectorV2StageSnapshot {
  counts: StepDetectorV2StageCounts
  failures: StepDetectorV2FailureTaxonomy
  notes: string[]
  stageId: StepDetectorV2StageId
}

export interface StepDetectorV2ValidationReport {
  caseCount: number
  failures: StepDetectorV2FailureTaxonomy
  generatedAt: string
  stageSnapshots: StepDetectorV2StageSnapshot[]
}
