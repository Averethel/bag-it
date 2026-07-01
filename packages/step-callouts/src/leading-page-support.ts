import { hasStepCalloutManualStyleBackgroundEvidence } from "./evidence-reasons"
import {
  readStepCalloutEvidenceSignalValue,
  rejectStepCalloutResolutionDraft,
  type StepCalloutResolutionDraft,
} from "./resolution-draft"
import { stepCalloutRegionArea, stepCalloutRegionSmallerOverlapRatio } from "./regions"

const LEADING_BORDER_FRAGMENT_MIN = 0.75
const LEADING_DISTINCT_OVERLAP_MIN = 0.72
const LEADING_LAYOUT_AREA_MIN = 2500
const LEADING_LAYOUT_POSITION_TOLERANCE = 48
const LEADING_LAYOUT_SIZE_RATIO_MIN = 0.4
const LEADING_MANUAL_STYLE_BACKGROUND_MIN = 0.9
const LEADING_MANUAL_STYLE_BORDER_MIN = 0.9
const LEADING_MANUAL_STYLE_WIDTH_RATIO_MIN = 0.6
const LEADING_MANUAL_STYLE_X_TOLERANCE = 64
const LEADING_PAGE_SUPPORT_MIN = 2
const LEADING_SUPPORT_PAGE_WINDOW = 2
const LEADING_VERTICAL_FLOW_X_TOLERANCE = 64
const LEADING_VERTICAL_FLOW_SIZE_RATIO_MIN = 0.6

export function rejectUnsupportedLeadingStepCalloutDiagnostics(
  drafts: readonly StepCalloutResolutionDraft[],
): StepCalloutResolutionDraft[] {
  let filteredDrafts = [...drafts]
  let rejectedCount = -1

  while (countRejectedDrafts(filteredDrafts) !== rejectedCount) {
    rejectedCount = countRejectedDrafts(filteredDrafts)
    filteredDrafts = rejectUnsupportedFirstVisiblePage(filteredDrafts)
  }

  return filteredDrafts
}

function rejectUnsupportedFirstVisiblePage(
  drafts: readonly StepCalloutResolutionDraft[],
): StepCalloutResolutionDraft[] {
  const leadingPage = firstVisibleDraftPage(drafts)

  if (leadingPage === null || shouldKeepLeadingPage(drafts, leadingPage)) {
    return [...drafts]
  }

  const laterVisibleDrafts = readLeadingSupportDrafts(drafts, leadingPage)

  if (laterVisibleDrafts.length === 0) {
    return [...drafts]
  }

  return drafts.map((draft) =>
    isUnsupportedLeadingDiagnostic(draft, leadingPage, laterVisibleDrafts)
      ? rejectStepCalloutResolutionDraft(draft, "false-positive-candidate")
      : draft,
  )
}

function shouldKeepLeadingPage(
  drafts: readonly StepCalloutResolutionDraft[],
  leadingPage: number,
): boolean {
  return (
    hasAcceptedPageDraft(drafts, leadingPage) ||
    hasSupportableLeadingPage(drafts, leadingPage)
  )
}

function countRejectedDrafts(drafts: readonly StepCalloutResolutionDraft[]): number {
  return drafts.filter((draft) => draft.status === "rejected").length
}

function firstVisibleDraftPage(drafts: readonly StepCalloutResolutionDraft[]): number | null {
  return drafts.reduce<number | null>((firstPage, draft) => {
    if (draft.status === "rejected") {
      return firstPage
    }

    const pageNumber = draft.evidence.candidate.pageNumber
    return firstPage === null ? pageNumber : Math.min(firstPage, pageNumber)
  }, null)
}

function hasAcceptedPageDraft(
  drafts: readonly StepCalloutResolutionDraft[],
  pageNumber: number,
): boolean {
  return drafts.some((draft) =>
    draft.evidence.candidate.pageNumber === pageNumber && draft.status === "accepted",
  )
}

function isUnsupportedLeadingDiagnostic(
  draft: StepCalloutResolutionDraft,
  leadingPage: number,
  laterVisibleDrafts: readonly StepCalloutResolutionDraft[],
): boolean {
  if (draft.status !== "diagnostic" || draft.evidence.candidate.pageNumber !== leadingPage) {
    return false
  }

  if (!hasSupportableLeadingEvidence(draft)) {
    return true
  }

  return !hasLeadingDiagnosticSupport(draft, laterVisibleDrafts)
}

function hasSupportableLeadingEvidence(draft: StepCalloutResolutionDraft): boolean {
  return (
    stepCalloutRegionArea(draft.evidence.candidate.region) >= LEADING_LAYOUT_AREA_MIN &&
    (
      draft.evidence.candidate.source !== "border" ||
      readStepCalloutEvidenceSignalValue(draft.evidence.scores, "border") >= LEADING_BORDER_FRAGMENT_MIN
    )
  )
}

function hasLeadingDiagnosticSupport(
  draft: StepCalloutResolutionDraft,
  laterVisibleDrafts: readonly StepCalloutResolutionDraft[],
): boolean {
  return (
    hasLaterLayoutSupport(draft, laterVisibleDrafts) ||
    hasLaterManualStyleColumnSupport(draft, laterVisibleDrafts)
  )
}

function hasLaterManualStyleColumnSupport(
  draft: StepCalloutResolutionDraft,
  laterVisibleDrafts: readonly StepCalloutResolutionDraft[],
): boolean {
  return (
    hasStrongManualStyleLeadingEvidence(draft) &&
    laterVisibleDrafts.some((laterDraft) => hasSimilarManualStyleColumnAnchor(draft, laterDraft))
  )
}

function hasStrongManualStyleLeadingEvidence(
  draft: StepCalloutResolutionDraft,
): boolean {
  return (
    draft.evidence.candidate.source === "fill-panel" &&
    readStepCalloutEvidenceSignalValue(draft.evidence.scores, "border") >= LEADING_MANUAL_STYLE_BORDER_MIN &&
    readStepCalloutEvidenceSignalValue(draft.evidence.scores, "background") >= LEADING_MANUAL_STYLE_BACKGROUND_MIN &&
    hasStepCalloutManualStyleBackgroundEvidence(draft.evidence.scores)
  )
}

function hasSimilarManualStyleColumnAnchor(
  left: StepCalloutResolutionDraft,
  right: StepCalloutResolutionDraft,
): boolean {
  return (
    hasSupportableLeadingEvidence(right) &&
    Math.abs(left.evidence.candidate.region.x - right.evidence.candidate.region.x) <=
      LEADING_MANUAL_STYLE_X_TOLERANCE &&
    sizeRatio(left.evidence.candidate.region.width, right.evidence.candidate.region.width) >=
      LEADING_MANUAL_STYLE_WIDTH_RATIO_MIN
  )
}

function hasSupportableLeadingPage(
  drafts: readonly StepCalloutResolutionDraft[],
  leadingPage: number,
): boolean {
  return countDistinctSupportableLeadingDrafts(drafts, leadingPage) >= LEADING_PAGE_SUPPORT_MIN
}

function readLeadingSupportDrafts(
  drafts: readonly StepCalloutResolutionDraft[],
  leadingPage: number,
): StepCalloutResolutionDraft[] {
  const pageNumbers = readLeadingSupportPageNumbers(drafts, leadingPage)

  return drafts.filter((draft) =>
    draft.status !== "rejected" &&
    pageNumbers.includes(draft.evidence.candidate.pageNumber),
  )
}

function readLeadingSupportPageNumbers(
  drafts: readonly StepCalloutResolutionDraft[],
  leadingPage: number,
): number[] {
  const pageNumbers = drafts
    .filter((draft) =>
      draft.status !== "rejected" && draft.evidence.candidate.pageNumber > leadingPage,
    )
    .map((draft) => draft.evidence.candidate.pageNumber)

  return [...new Set(pageNumbers)].sort((left, right) => left - right).slice(0, LEADING_SUPPORT_PAGE_WINDOW)
}

function countDistinctSupportableLeadingDrafts(
  drafts: readonly StepCalloutResolutionDraft[],
  leadingPage: number,
): number {
  return drafts.reduce<StepCalloutResolutionDraft[]>((supportableDrafts, draft) => {
    if (isDistinctSupportableLeadingDraft(draft, supportableDrafts, leadingPage)) {
      supportableDrafts.push(draft)
    }

    return supportableDrafts
  }, []).length
}

function isDistinctSupportableLeadingDraft(
  draft: StepCalloutResolutionDraft,
  supportableDrafts: readonly StepCalloutResolutionDraft[],
  leadingPage: number,
): boolean {
  return (
    draft.status !== "rejected" &&
    draft.evidence.candidate.pageNumber === leadingPage &&
    hasSupportableLeadingEvidence(draft) &&
    !hasOverlappingSupportDraft(draft, supportableDrafts)
  )
}

function hasLaterLayoutSupport(
  draft: StepCalloutResolutionDraft,
  laterVisibleDrafts: readonly StepCalloutResolutionDraft[],
): boolean {
  return laterVisibleDrafts.some((laterDraft) =>
    hasSimilarLayoutAnchor(draft, laterDraft) ||
    hasSimilarVerticalFlowAnchor(draft, laterDraft),
  )
}

function hasSimilarLayoutAnchor(
  left: StepCalloutResolutionDraft,
  right: StepCalloutResolutionDraft,
): boolean {
  return (
    Math.abs(left.evidence.candidate.region.x - right.evidence.candidate.region.x) <=
      LEADING_LAYOUT_POSITION_TOLERANCE &&
    Math.abs(left.evidence.candidate.region.y - right.evidence.candidate.region.y) <=
      LEADING_LAYOUT_POSITION_TOLERANCE &&
    hasSimilarLayoutSize(left, right)
  )
}

function hasSimilarLayoutSize(
  left: StepCalloutResolutionDraft,
  right: StepCalloutResolutionDraft,
): boolean {
  const leftRegion = left.evidence.candidate.region
  const rightRegion = right.evidence.candidate.region

  return (
    sizeRatio(leftRegion.width, rightRegion.width) >= LEADING_LAYOUT_SIZE_RATIO_MIN &&
    sizeRatio(leftRegion.height, rightRegion.height) >= LEADING_LAYOUT_SIZE_RATIO_MIN
  )
}

function hasSimilarVerticalFlowAnchor(
  left: StepCalloutResolutionDraft,
  right: StepCalloutResolutionDraft,
): boolean {
  return (
    Math.abs(left.evidence.candidate.region.x - right.evidence.candidate.region.x) <=
      LEADING_VERTICAL_FLOW_X_TOLERANCE &&
    hasSimilarVerticalFlowSize(left, right)
  )
}

function hasSimilarVerticalFlowSize(
  left: StepCalloutResolutionDraft,
  right: StepCalloutResolutionDraft,
): boolean {
  const leftRegion = left.evidence.candidate.region
  const rightRegion = right.evidence.candidate.region

  return (
    sizeRatio(leftRegion.width, rightRegion.width) >= LEADING_VERTICAL_FLOW_SIZE_RATIO_MIN &&
    sizeRatio(leftRegion.height, rightRegion.height) >= LEADING_VERTICAL_FLOW_SIZE_RATIO_MIN
  )
}

function hasOverlappingSupportDraft(
  draft: StepCalloutResolutionDraft,
  supportDrafts: readonly StepCalloutResolutionDraft[],
): boolean {
  return supportDrafts.some((supportDraft) =>
    supportDraft.status !== "rejected" &&
    supportDraft.evidence.candidate.pageNumber === draft.evidence.candidate.pageNumber &&
    stepCalloutRegionSmallerOverlapRatio(
      draft.evidence.candidate.region,
      supportDraft.evidence.candidate.region,
    ) >= LEADING_DISTINCT_OVERLAP_MIN,
  )
}

function sizeRatio(left: number, right: number): number {
  return Math.min(left, right) / Math.max(left, right)
}
