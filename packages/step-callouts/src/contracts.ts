export const STEP_CALLOUT_STAGE_IDS = [
  "page-input",
  "callout-candidates",
  "callout-evidence",
  "conflict-resolution",
] as const

export type StepCalloutStageId = (typeof STEP_CALLOUT_STAGE_IDS)[number]

export const STEP_CALLOUT_FAILURE_KINDS = [
  "missing-candidate",
  "false-positive-candidate",
  "bad-merge",
  "bad-split",
  "duplicate",
] as const

export type StepCalloutFailureKind = (typeof STEP_CALLOUT_FAILURE_KINDS)[number]

export interface StepCalloutRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface StepCalloutRgbColor {
  b: number
  g: number
  r: number
}

export interface StepCalloutPageInput {
  data: Uint8ClampedArray
  height: number
  pageNumber: number
  width: number
}

export type StepCalloutCandidateSource =
  | "border"
  | "line-rectangle"
  | "fill-panel"

export interface StepCalloutCandidate {
  id: string
  pageNumber: number
  region: StepCalloutRegion
  source: StepCalloutCandidateSource
}

export type StepCalloutEvidenceSignal = "background" | "border" | "quantity"

export interface StepCalloutEvidenceScore {
  reasons: string[]
  signal: StepCalloutEvidenceSignal
  value: number
}

export interface StepCalloutCandidateEvidence {
  background: StepCalloutRgbColor
  candidate: StepCalloutCandidate
  scores: StepCalloutEvidenceScore[]
  totalScore: number
}

export type StepCalloutResolutionStatus = "accepted" | "diagnostic" | "rejected"

export interface StepCalloutResolvedCallout {
  candidateId: string
  pageNumber: number
  region: StepCalloutRegion
  status: StepCalloutResolutionStatus
}

export interface StepCalloutPageAdvisory {
  confidence: number
  id: string
  kind: "possible-step-multiplier"
  pageNumber: number
  source: "raster"
  sourceRegion: StepCalloutRegion
  text: string
  value: number
}

export type StepCalloutFailureTaxonomy = Record<StepCalloutFailureKind, number>

export interface StepCalloutStageCounts {
  accepted: number
  rejected: number
  total: number
}

export interface StepCalloutStageSnapshot {
  counts: StepCalloutStageCounts
  failures: StepCalloutFailureTaxonomy
  notes: string[]
  stageId: StepCalloutStageId
}
