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
const WEAK_FILL_PANEL_FRAGMENT_BORDER_MAX = 0.34
const WEAK_FILL_PANEL_FRAGMENT_OVERLAP_MIN = 0.45
const STRONG_FILL_PANEL_DUPLICATE_BORDER_MIN = 0.9
const OVERLAPPING_FILL_PANEL_FRAGMENT_HORIZONTAL_OVERLAP_MIN = 0.55
const OVERLAPPING_FILL_PANEL_FRAGMENT_VERTICAL_OVERLAP_MIN = 0.8
const OVERLAPPING_FILL_PANEL_FRAGMENT_SCORE_DROP_MIN = 0.2

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
      hasOverlappingFillPanelFragment(draft, keptDraft) ||
      hasWeakFillPanelFragmentOverlap(draft, keptDraft) ||
      hasLineRectangleFragmentOverlap(draft, keptDraft)
    ),
  )
}

function hasOverlappingFillPanelFragment(
  draft: StepCalloutResolutionDraft,
  keptDraft: StepCalloutResolutionDraft,
): boolean {
  if (
    draft.status !== "accepted" ||
    keptDraft.status !== "accepted" ||
    draft.evidence.candidate.source !== "fill-panel" ||
    keptDraft.evidence.candidate.source !== "fill-panel"
  ) {
    return false
  }

  const draftRegion = draft.evidence.candidate.region
  const keptRegion = keptDraft.evidence.candidate.region

  if (!hasOverlappingFillPanelFragmentShape(draftRegion, keptRegion)) {
    return false
  }

  return draftRegion.width < keptRegion.width ||
    draft.evidence.totalScore <= keptDraft.evidence.totalScore - OVERLAPPING_FILL_PANEL_FRAGMENT_SCORE_DROP_MIN
}

function hasOverlappingFillPanelFragmentShape(
  left: StepCalloutResolutionDraft["evidence"]["candidate"]["region"],
  right: StepCalloutResolutionDraft["evidence"]["candidate"]["region"],
): boolean {
  return horizontalSmallerOverlapRatio(left, right) >=
    OVERLAPPING_FILL_PANEL_FRAGMENT_HORIZONTAL_OVERLAP_MIN &&
    verticalSmallerOverlapRatio(left, right) >=
      OVERLAPPING_FILL_PANEL_FRAGMENT_VERTICAL_OVERLAP_MIN
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
    compareOverlappingFillPanelWidthPreference(left, right) ||
    right.evidence.totalScore - left.evidence.totalScore ||
    stepCalloutRegionArea(left.evidence.candidate.region) - stepCalloutRegionArea(right.evidence.candidate.region) ||
    compareStepCalloutResolutionDraftPosition(left, right)
  )
}

function compareOverlappingFillPanelWidthPreference(
  left: StepCalloutResolutionDraft,
  right: StepCalloutResolutionDraft,
): number {
  if (
    left.status !== "accepted" ||
    right.status !== "accepted" ||
    left.evidence.candidate.source !== "fill-panel" ||
    right.evidence.candidate.source !== "fill-panel"
  ) {
    return 0
  }

  const leftRegion = left.evidence.candidate.region
  const rightRegion = right.evidence.candidate.region

  if (
    verticalSmallerOverlapRatio(leftRegion, rightRegion) <
      OVERLAPPING_FILL_PANEL_FRAGMENT_VERTICAL_OVERLAP_MIN ||
    horizontalSmallerOverlapRatio(leftRegion, rightRegion) <
      OVERLAPPING_FILL_PANEL_FRAGMENT_HORIZONTAL_OVERLAP_MIN
  ) {
    return 0
  }

  if (Math.abs(left.evidence.totalScore - right.evidence.totalScore) >=
    OVERLAPPING_FILL_PANEL_FRAGMENT_SCORE_DROP_MIN) {
    return 0
  }

  return rightRegion.width - leftRegion.width
}

function horizontalSmallerOverlapRatio(
  left: StepCalloutResolutionDraft["evidence"]["candidate"]["region"],
  right: StepCalloutResolutionDraft["evidence"]["candidate"]["region"],
): number {
  const overlap = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x)
  const smallerWidth = Math.min(left.width, right.width)

  return smallerWidth <= 0 ? 0 : Math.max(0, overlap) / smallerWidth
}

function verticalSmallerOverlapRatio(
  left: StepCalloutResolutionDraft["evidence"]["candidate"]["region"],
  right: StepCalloutResolutionDraft["evidence"]["candidate"]["region"],
): number {
  const overlap = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y)
  const smallerHeight = Math.min(left.height, right.height)

  return smallerHeight <= 0 ? 0 : Math.max(0, overlap) / smallerHeight
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
