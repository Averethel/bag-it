import type {
  StepCalloutPageInput,
  StepCalloutResolutionStatus,
} from "./contracts"
import { hasStrongManualStyleEvidence, isFloatingVisualDraft } from "./raster-layout-evidence"
import {
  hasRasterStepAnchor,
  isAlignedWithAnchoredColumn,
  readAnchoredDrafts,
  readRasterAnchorsByPage,
} from "./raster-step-anchors"
import type { RasterStepAnchor, StepCalloutRasterStepLayoutDraft } from "./raster-step-layout-types"
import {
  isAlignedWithSupportedTopRowColumn,
  isSupportedTopBandPanel,
  isSupportedTopRowMember,
  readSupportedTopRows,
  type TopPanelRow,
} from "./raster-top-panel-rows"

export type { StepCalloutRasterStepLayoutDraft } from "./raster-step-layout-types"

const ANCHORED_DRAFTS_MIN = 2

export function refineStepCalloutRasterStepNumberLayout(
  drafts: readonly StepCalloutRasterStepLayoutDraft[],
  pages: readonly StepCalloutPageInput[],
): Map<string, StepCalloutResolutionStatus> {
  const anchorsByPage = readRasterAnchorsByPage(pages)
  const pageByNumber = readPageByNumber(pages)

  return new Map(readRasterStepLayoutEntries(drafts, anchorsByPage, pageByNumber))
}

function readRasterStepLayoutEntries(
  drafts: readonly StepCalloutRasterStepLayoutDraft[],
  anchorsByPage: ReadonlyMap<number, readonly RasterStepAnchor[]>,
  pageByNumber: ReadonlyMap<number, StepCalloutPageInput>,
): Array<[string, StepCalloutResolutionStatus]> {
  return readDraftPages(drafts).flatMap((pageNumber) =>
    readPageLayoutEntries(
      drafts,
      pageNumber,
      anchorsByPage.get(pageNumber) ?? [],
      pageByNumber.get(pageNumber),
    ),
  )
}

function readPageLayoutEntries(
  drafts: readonly StepCalloutRasterStepLayoutDraft[],
  pageNumber: number,
  anchors: readonly RasterStepAnchor[],
  page: StepCalloutPageInput | undefined,
): Array<[string, StepCalloutResolutionStatus]> {
  const visibleDrafts = readVisiblePageDrafts(drafts, pageNumber)
  const anchoredDrafts = readAnchoredDrafts(visibleDrafts, anchors)

  if (anchoredDrafts.length < ANCHORED_DRAFTS_MIN) {
    return []
  }

  const topRows = page ? readSupportedTopRows(visibleDrafts, page) : []

  return visibleDrafts
    .filter((draft) => shouldRejectFloatingDraft(draft, anchors, anchoredDrafts, topRows, page))
    .map((draft) => [draft.evidence.candidate.id, "rejected"])
}

function readVisiblePageDrafts(
  drafts: readonly StepCalloutRasterStepLayoutDraft[],
  pageNumber: number,
): StepCalloutRasterStepLayoutDraft[] {
  return drafts.filter((draft) =>
    draft.status !== "rejected" && draft.evidence.candidate.pageNumber === pageNumber,
  )
}

function shouldRejectFloatingDraft(
  draft: StepCalloutRasterStepLayoutDraft,
  anchors: readonly RasterStepAnchor[],
  anchoredDrafts: readonly StepCalloutRasterStepLayoutDraft[],
  topRows: readonly TopPanelRow[],
  page: StepCalloutPageInput | undefined,
): boolean {
  return (
    isFloatingVisualDraft(draft) &&
    !hasRasterStepAnchor(draft, anchors) &&
    !hasStrongManualStyleEvidence(draft) &&
    !isAlignedWithAnchoredColumn(draft, anchoredDrafts) &&
    !isSupportedTopRowMember(draft, topRows, page) &&
    !isSupportedTopBandPanel(draft, topRows, page) &&
    !isAlignedWithSupportedTopRowColumn(draft, topRows)
  )
}

function readPageByNumber(
  pages: readonly StepCalloutPageInput[],
): Map<number, StepCalloutPageInput> {
  return new Map(pages.map((page) => [page.pageNumber, page]))
}

function readDraftPages(
  drafts: readonly StepCalloutRasterStepLayoutDraft[],
): number[] {
  return [...new Set(drafts.map((draft) => draft.evidence.candidate.pageNumber))]
}
