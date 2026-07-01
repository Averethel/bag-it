export {
  hasStepCalloutOffManualStyleBackgroundEvidence,
  hasStepCalloutManualStyleBackgroundEvidence,
} from "./evidence-reasons"
export {
  detectStepCallouts,
  detectStepCalloutPageCandidates,
  inferStepCalloutEvidenceManualStyle,
  resolveStepCalloutsFromPageEvidence,
  scoreStepCalloutPageEvidence,
  STEP_CALLOUT_DETECTOR_VERSION,
  type StepCalloutDetection,
  type StepCalloutDetectionReport,
} from "./detector"
export {
  resolveStepCalloutConflicts,
  type StepCalloutResolutionStageResult,
} from "./conflict-resolution"
export type { StepCalloutManualStyle } from "./manual-style"
export {
  clampStepCalloutRegionToPage,
  createPageInputStageSnapshot,
  createStepCalloutPageInput,
  type CreateStepCalloutPageInputOptions,
  type StepCalloutPageBounds,
} from "./page-input"
export {
  compareStepCalloutRegions,
  stepCalloutInsetRegion,
  stepCalloutIntersectRegions,
  stepCalloutRegionArea,
  stepCalloutRegionCenter,
  stepCalloutRegionContainsPoint,
  stepCalloutRegionContainsRegion,
  stepCalloutRegionOverlapRatio,
  stepCalloutRegionSmallerOverlapRatio,
} from "./regions"
export type {
  StepCalloutCandidate,
  StepCalloutCandidateEvidence,
  StepCalloutCandidateSource,
  StepCalloutEvidenceScore,
  StepCalloutEvidenceSignal,
  StepCalloutFailureKind,
  StepCalloutFailureTaxonomy,
  StepCalloutPageInput,
  StepCalloutRegion,
  StepCalloutResolvedCallout,
  StepCalloutResolutionStatus,
  StepCalloutRgbColor,
  StepCalloutStageSnapshot,
} from "./contracts"
