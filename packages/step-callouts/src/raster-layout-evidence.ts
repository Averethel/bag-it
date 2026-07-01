import { hasStepCalloutManualStyleBackgroundEvidence } from "./evidence-reasons"
import { readStepCalloutEvidenceSignalValue as readSignalValue } from "./resolution-draft"
import type { StepCalloutRasterStepLayoutDraft } from "./raster-step-layout-types"

const FLOATING_BACKGROUND_MIN = 0.6
const FLOATING_BORDER_MIN = 0.5
const FLOATING_QUANTITY_MAX = 0.1
const MANUAL_STYLE_BACKGROUND_MIN = 0.9
const MANUAL_STYLE_BORDER_MIN = 0.9

export function hasStrongManualStyleEvidence(draft: StepCalloutRasterStepLayoutDraft): boolean {
  return (
    readSignalValue(draft.evidence.scores, "border") >= MANUAL_STYLE_BORDER_MIN &&
    readSignalValue(draft.evidence.scores, "background") >= MANUAL_STYLE_BACKGROUND_MIN &&
    hasStepCalloutManualStyleBackgroundEvidence(draft.evidence.scores)
  )
}

export function isFloatingVisualDraft(draft: StepCalloutRasterStepLayoutDraft): boolean {
  return (
    draft.status === "diagnostic" &&
    readSignalValue(draft.evidence.scores, "border") >= FLOATING_BORDER_MIN &&
    readSignalValue(draft.evidence.scores, "background") >= FLOATING_BACKGROUND_MIN &&
    readSignalValue(draft.evidence.scores, "quantity") <= FLOATING_QUANTITY_MAX
  )
}
