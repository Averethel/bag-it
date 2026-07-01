import type {
  StepCalloutCandidateEvidence,
  StepCalloutRegion,
  StepCalloutResolutionStatus,
} from "./contracts"

export interface StepCalloutRasterStepLayoutDraft {
  evidence: StepCalloutCandidateEvidence
  status: StepCalloutResolutionStatus
}

export interface RasterStepAnchor {
  pageNumber: number
  region: StepCalloutRegion
}
