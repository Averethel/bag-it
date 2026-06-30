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
  type StepCalloutDetectionOptions,
  type StepCalloutDetectionReport,
} from "./detector"
export {
  resolveStepCalloutConflicts,
  type StepCalloutResolutionStageResult,
} from "./conflict-resolution"
export {
  classifyStepCalloutPageRole,
  classifyStepCalloutPageRoles,
  hasStepCalloutQuantityEvidence,
  isRepeatPanelLikeEvidence,
  readStepCalloutEvidenceValue,
  type StepCalloutPageRole,
} from "./page-roles"
export type {
  StepCalloutPageAdvisoryDecision,
  StepCalloutPageAdvisoryDiagnostic,
  StepCalloutPageAdvisoryLabelDiagnostic,
  StepCalloutPageAdvisoryTrace,
} from "./page-advisories"
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
  StepCalloutPageAdvisory,
  StepCalloutPageInput,
  StepCalloutRegion,
  StepCalloutResolvedCallout,
  StepCalloutResolutionStatus,
  StepCalloutRgbColor,
  StepCalloutStageSnapshot,
} from "./contracts"
