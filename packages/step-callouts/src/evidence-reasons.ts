import type { StepCalloutEvidenceScore } from "./contracts"

const MANUAL_STYLE_BACKGROUND_REASON_PREFIX = "manual-style-background:"
const OFF_MANUAL_STYLE_BACKGROUND_REASON_PREFIX = "off-manual-style-background:"
const PAGE_LOCAL_BACKGROUND_REASON_PREFIX = "page-local-background-over-manual-style:"

export function hasStepCalloutManualStyleBackgroundEvidence(
  scores: readonly StepCalloutEvidenceScore[],
): boolean {
  return hasStepCalloutEvidenceReasonPrefix(scores, "background", MANUAL_STYLE_BACKGROUND_REASON_PREFIX)
}

export function hasStepCalloutOffManualStyleBackgroundEvidence(
  scores: readonly StepCalloutEvidenceScore[],
): boolean {
  return hasStepCalloutEvidenceReasonPrefix(scores, "background", OFF_MANUAL_STYLE_BACKGROUND_REASON_PREFIX)
}

export function hasStepCalloutPageLocalBackgroundEvidence(
  scores: readonly StepCalloutEvidenceScore[],
): boolean {
  return hasStepCalloutEvidenceReasonPrefix(scores, "background", PAGE_LOCAL_BACKGROUND_REASON_PREFIX)
}

function hasStepCalloutEvidenceReasonPrefix(
  scores: readonly StepCalloutEvidenceScore[],
  signal: StepCalloutEvidenceScore["signal"],
  prefix: string,
): boolean {
  return scores.some((score) =>
    score.signal === signal &&
    score.reasons.some((reason) => reason.startsWith(prefix)),
  )
}
