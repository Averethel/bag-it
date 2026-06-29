import type { StepCalloutResolutionStatus } from "./contracts"
import {
  hasStepCalloutManualStyleBackgroundEvidence,
  hasStepCalloutPageLocalBackgroundEvidence,
} from "./evidence-reasons"
import {
  rejectStepCalloutResolutionDraft,
  readStepCalloutEvidenceSignalValue,
  type StepCalloutResolutionDraft,
} from "./resolution-draft"
import {
  compareStepCalloutRegions,
  stepCalloutRegionArea,
  stepCalloutRegionSmallerOverlapRatio,
} from "./regions"

const DUPLICATE_OVERLAP_MIN = 0.72
const LINE_RECTANGLE_FRAGMENT_AREA_RATIO_MAX = 0.9
const LINE_RECTANGLE_FRAGMENT_OVERLAP_MIN = 0.55
const EXPANDED_COMPACT_FILL_PANEL_AREA_RATIO_MAX = 2.2
const EXPANDED_COMPACT_FILL_PANEL_BORDER_MIN = 0.3
const EXPANDED_COMPACT_FILL_PANEL_BACKGROUND_MIN = 0.7
const EXPANDED_COMPACT_FILL_PANEL_WIDTH_MAX = 120
const EXPANDED_COMPACT_FILL_PANEL_OVERLAP_MIN = 0.95
const RASTER_LOWER_ROW_QUANTITY_LABEL_REASON = "raster-lower-row-quantity-label"
const WEAK_FILL_PANEL_FRAGMENT_BORDER_MAX = 0.36
const WEAK_FILL_PANEL_FRAGMENT_OVERLAP_MIN = 0.45
const QUANTITY_FILL_PANEL_DUPLICATE_OVERLAP_MIN = 0.58
const STRONG_FILL_PANEL_DUPLICATE_BORDER_MIN = 0.9

export function resolveDuplicateStepCalloutDrafts(
  drafts: readonly StepCalloutResolutionDraft[],
): StepCalloutResolutionDraft[] {
  const orderedDrafts = [...drafts].sort(compareResolutionDrafts)
  const keptDrafts: StepCalloutResolutionDraft[] = []

  for (const draft of orderedDrafts) {
    keptDrafts.push(markDraftIfDuplicate(draft, keptDrafts))
  }

  return keptDrafts.sort(compareStepCalloutResolutionDraftPosition)
}

function markDraftIfDuplicate(
  draft: StepCalloutResolutionDraft,
  keptDrafts: readonly StepCalloutResolutionDraft[],
): StepCalloutResolutionDraft {
  if (draft.status === "rejected") {
    return draft
  }

  if (!hasPreferredOverlap(draft, keptDrafts)) {
    return draft
  }

  return rejectStepCalloutResolutionDraft(draft, "duplicate")
}

function hasPreferredOverlap(
  draft: StepCalloutResolutionDraft,
  keptDrafts: readonly StepCalloutResolutionDraft[],
): boolean {
  return keptDrafts.some((keptDraft) =>
    keptDraft.status !== "rejected" &&
    keptDraft.evidence.candidate.pageNumber === draft.evidence.candidate.pageNumber &&
    (
      stepCalloutRegionSmallerOverlapRatio(draft.evidence.candidate.region, keptDraft.evidence.candidate.region) >=
        DUPLICATE_OVERLAP_MIN ||
      hasQuantityFillPanelDuplicateOverlap(draft, keptDraft) ||
      hasWeakFillPanelFragmentOverlap(draft, keptDraft) ||
      hasLineRectangleFragmentOverlap(draft, keptDraft)
    ),
  )
}

function hasQuantityFillPanelDuplicateOverlap(
  draft: StepCalloutResolutionDraft,
  keptDraft: StepCalloutResolutionDraft,
): boolean {
  return (
    draft.status === "accepted" &&
    keptDraft.status === "accepted" &&
    draft.evidence.candidate.source === "fill-panel" &&
    keptDraft.evidence.candidate.source === "fill-panel" &&
    readStepCalloutEvidenceSignalValue(draft.evidence.scores, "background") >=
      EXPANDED_COMPACT_FILL_PANEL_BACKGROUND_MIN &&
    readStepCalloutEvidenceSignalValue(keptDraft.evidence.scores, "background") >=
      EXPANDED_COMPACT_FILL_PANEL_BACKGROUND_MIN &&
    readStepCalloutEvidenceSignalValue(draft.evidence.scores, "quantity") >= 0.6 &&
    readStepCalloutEvidenceSignalValue(keptDraft.evidence.scores, "quantity") >= 0.6 &&
    stepCalloutRegionSmallerOverlapRatio(
      draft.evidence.candidate.region,
      keptDraft.evidence.candidate.region,
    ) >= QUANTITY_FILL_PANEL_DUPLICATE_OVERLAP_MIN
  )
}

function hasWeakFillPanelFragmentOverlap(
  draft: StepCalloutResolutionDraft,
  keptDraft: StepCalloutResolutionDraft,
): boolean {
  return (
    draft.status === "accepted" &&
    keptDraft.status === "accepted" &&
    draft.evidence.candidate.source === "fill-panel" &&
    keptDraft.evidence.candidate.source === "fill-panel" &&
    readStepCalloutEvidenceSignalValue(draft.evidence.scores, "border") <=
      WEAK_FILL_PANEL_FRAGMENT_BORDER_MAX &&
    readStepCalloutEvidenceSignalValue(keptDraft.evidence.scores, "border") >=
      STRONG_FILL_PANEL_DUPLICATE_BORDER_MIN &&
    stepCalloutRegionSmallerOverlapRatio(
      draft.evidence.candidate.region,
      keptDraft.evidence.candidate.region,
    ) >= WEAK_FILL_PANEL_FRAGMENT_OVERLAP_MIN
  )
}

function hasLineRectangleFragmentOverlap(
  draft: StepCalloutResolutionDraft,
  keptDraft: StepCalloutResolutionDraft,
): boolean {
  return (
    draft.status === "accepted" &&
    keptDraft.status === "accepted" &&
    draft.evidence.candidate.source === "line-rectangle" &&
    keptDraft.evidence.candidate.source === "fill-panel" &&
    borderRegionAreaRatio(
      draft.evidence.candidate.region,
      keptDraft.evidence.candidate.region,
    ) <= LINE_RECTANGLE_FRAGMENT_AREA_RATIO_MAX &&
    stepCalloutRegionSmallerOverlapRatio(
      draft.evidence.candidate.region,
      keptDraft.evidence.candidate.region,
    ) >= LINE_RECTANGLE_FRAGMENT_OVERLAP_MIN
  )
}

function borderRegionAreaRatio(
  left: StepCalloutResolutionDraft["evidence"]["candidate"]["region"],
  right: StepCalloutResolutionDraft["evidence"]["candidate"]["region"],
): number {
  const smallerArea = Math.min(stepCalloutRegionArea(left), stepCalloutRegionArea(right))
  const largerArea = Math.max(stepCalloutRegionArea(left), stepCalloutRegionArea(right))

  return largerArea === 0 ? 0 : smallerArea / largerArea
}

function compareResolutionDrafts(
  left: StepCalloutResolutionDraft,
  right: StepCalloutResolutionDraft,
): number {
  return (
    statusRank(left.status) - statusRank(right.status) ||
    compareExpandedCompactFillPanelPreference(left, right) ||
    right.evidence.totalScore - left.evidence.totalScore ||
    stepCalloutRegionArea(left.evidence.candidate.region) - stepCalloutRegionArea(right.evidence.candidate.region) ||
    compareStepCalloutResolutionDraftPosition(left, right)
  )
}

function compareExpandedCompactFillPanelPreference(
  left: StepCalloutResolutionDraft,
  right: StepCalloutResolutionDraft,
): number {
  const leftPreferred = isExpandedCompactFillPanelDuplicate(left, right)
  const rightPreferred = isExpandedCompactFillPanelDuplicate(right, left)

  if (leftPreferred === rightPreferred) {
    return 0
  }

  return leftPreferred ? -1 : 1
}

function isExpandedCompactFillPanelDuplicate(
  expanded: StepCalloutResolutionDraft,
  inner: StepCalloutResolutionDraft,
): boolean {
  const expandedRegion = expanded.evidence.candidate.region
  const innerRegion = inner.evidence.candidate.region
  const expandedArea = stepCalloutRegionArea(expandedRegion)
  const innerArea = stepCalloutRegionArea(innerRegion)

  return (
    isPageLocalQuantityFillPanel(expanded) &&
    isCompactQuantityDuplicateCandidate(inner) &&
    expandedArea > innerArea &&
    expandedRegion.width <= EXPANDED_COMPACT_FILL_PANEL_WIDTH_MAX &&
    expandedArea / innerArea <= EXPANDED_COMPACT_FILL_PANEL_AREA_RATIO_MAX &&
    stepCalloutRegionSmallerOverlapRatio(expandedRegion, innerRegion) >=
      EXPANDED_COMPACT_FILL_PANEL_OVERLAP_MIN
  )
}

function isCompactQuantityDuplicateCandidate(draft: StepCalloutResolutionDraft): boolean {
  return (
    draft.status === "accepted" &&
    hasQuantityEvidenceReason(draft, RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) &&
    readStepCalloutEvidenceSignalValue(draft.evidence.scores, "background") >=
      EXPANDED_COMPACT_FILL_PANEL_BACKGROUND_MIN &&
    readStepCalloutEvidenceSignalValue(draft.evidence.scores, "quantity") >= 0.6
  )
}

function isPageLocalQuantityFillPanel(draft: StepCalloutResolutionDraft): boolean {
  return (
    draft.status === "accepted" &&
    draft.evidence.candidate.source === "fill-panel" &&
    (
      hasStepCalloutPageLocalBackgroundEvidence(draft.evidence.scores) ||
      hasStepCalloutManualStyleBackgroundEvidence(draft.evidence.scores)
    ) &&
    hasQuantityEvidenceReason(draft, RASTER_LOWER_ROW_QUANTITY_LABEL_REASON) &&
    readStepCalloutEvidenceSignalValue(draft.evidence.scores, "background") >=
      EXPANDED_COMPACT_FILL_PANEL_BACKGROUND_MIN &&
    readStepCalloutEvidenceSignalValue(draft.evidence.scores, "border") >=
      EXPANDED_COMPACT_FILL_PANEL_BORDER_MIN &&
    readStepCalloutEvidenceSignalValue(draft.evidence.scores, "quantity") >= 0.6
  )
}

function hasQuantityEvidenceReason(
  draft: StepCalloutResolutionDraft,
  reason: string,
): boolean {
  return draft.evidence.scores.some((score) =>
    score.signal === "quantity" &&
    score.reasons.includes(reason),
  )
}

function compareStepCalloutResolutionDraftPosition(
  left: StepCalloutResolutionDraft,
  right: StepCalloutResolutionDraft,
): number {
  return (
    left.evidence.candidate.pageNumber - right.evidence.candidate.pageNumber ||
    compareStepCalloutRegions(left.evidence.candidate.region, right.evidence.candidate.region)
  )
}

function statusRank(status: StepCalloutResolutionStatus): number {
  if (status === "accepted") {
    return 0
  }

  if (status === "diagnostic") {
    return 1
  }

  return 2
}
