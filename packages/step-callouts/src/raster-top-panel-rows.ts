import type { StepCalloutPageInput, StepCalloutRegion } from "./contracts"
import { isFloatingVisualDraft } from "./raster-layout-evidence"
import type { StepCalloutRasterStepLayoutDraft } from "./raster-step-layout-types"
import { readStepCalloutEvidenceSignalValue as readSignalValue } from "./resolution-draft"
import { stepCalloutRegionArea, stepCalloutRegionCenter } from "./regions"

const TOP_ROW_AREA_ABSOLUTE_MIN = 1800
const TOP_ROW_AREA_RATIO_MIN = 0.006
const TOP_ROW_BACKGROUND_MIN = 0.6
const TOP_ROW_BORDER_MIN = 0.9
const TOP_ROW_CENTER_TOLERANCE = 96
const TOP_ROW_COLUMN_TOLERANCE = 96
const TOP_ROW_DISTINCT_X_TOLERANCE = 96
const TOP_ROW_HEIGHT_ABSOLUTE_MIN = 40
const TOP_ROW_HEIGHT_RATIO_MIN = 0.07
const TOP_ROW_MEMBER_MIN = 2
const TOP_ROW_WIDTH_ABSOLUTE_MIN = 56
const TOP_ROW_WIDTH_RATIO_MIN = 0.085
const TOP_ROW_Y_RATIO_MAX = 0.28

export interface TopPanelRow {
  centerY: number
  pageNumber: number
  xCenters: number[]
}

export function readSupportedTopRows(
  drafts: readonly StepCalloutRasterStepLayoutDraft[],
  page: StepCalloutPageInput,
): TopPanelRow[] {
  return drafts
    .filter((draft) => isTopPanelRowAnchor(draft, page))
    .reduce<TopPanelRow[]>(addDraftToTopRows, [])
    .filter((row) => row.xCenters.length >= TOP_ROW_MEMBER_MIN)
}

export function isSupportedTopRowMember(
  draft: StepCalloutRasterStepLayoutDraft,
  topRows: readonly TopPanelRow[],
  page: StepCalloutPageInput | undefined,
): boolean {
  const center = stepCalloutRegionCenter(draft.evidence.candidate.region)

  return Boolean(
    page &&
      isStrongTopPanel(draft) &&
      hasTopPanelScale(draft.evidence.candidate.region, page) &&
      topRows.some((row) =>
        row.pageNumber === draft.evidence.candidate.pageNumber &&
        Math.abs(row.centerY - center.y) <= TOP_ROW_CENTER_TOLERANCE,
      ),
  )
}

export function isSupportedTopBandPanel(
  draft: StepCalloutRasterStepLayoutDraft,
  topRows: readonly TopPanelRow[],
  page: StepCalloutPageInput | undefined,
): boolean {
  return Boolean(
    page &&
      hasPageSupportedTopRow(draft, topRows) &&
      isTopPanelRowAnchor(draft, page),
  )
}

export function isAlignedWithSupportedTopRowColumn(
  draft: StepCalloutRasterStepLayoutDraft,
  topRows: readonly TopPanelRow[],
): boolean {
  if (!isStrongTopPanel(draft)) {
    return false
  }

  const center = stepCalloutRegionCenter(draft.evidence.candidate.region)

  return topRows.some((row) =>
    row.pageNumber === draft.evidence.candidate.pageNumber &&
    row.xCenters.some((xCenter) => Math.abs(xCenter - center.x) <= TOP_ROW_COLUMN_TOLERANCE),
  )
}

function isTopPanelRowAnchor(
  draft: StepCalloutRasterStepLayoutDraft,
  page: StepCalloutPageInput,
): boolean {
  return (
    isFloatingVisualDraft(draft) &&
    draft.evidence.candidate.source === "fill-panel" &&
    readSignalValue(draft.evidence.scores, "border") >= TOP_ROW_BORDER_MIN &&
    readSignalValue(draft.evidence.scores, "background") >= TOP_ROW_BACKGROUND_MIN &&
    hasTopPanelScale(draft.evidence.candidate.region, page) &&
    draft.evidence.candidate.region.y / page.height <= TOP_ROW_Y_RATIO_MAX
  )
}

function hasTopPanelScale(region: StepCalloutRegion, page: StepCalloutPageInput): boolean {
  return (
    region.height >= minTopRowHeight(page) &&
    region.width >= minTopRowWidth(page) &&
    stepCalloutRegionArea(region) >= minTopRowArea(page)
  )
}

function minTopRowHeight(page: StepCalloutPageInput): number {
  return Math.max(TOP_ROW_HEIGHT_ABSOLUTE_MIN, page.height * TOP_ROW_HEIGHT_RATIO_MIN)
}

function minTopRowWidth(page: StepCalloutPageInput): number {
  return Math.max(TOP_ROW_WIDTH_ABSOLUTE_MIN, page.width * TOP_ROW_WIDTH_RATIO_MIN)
}

function minTopRowArea(page: StepCalloutPageInput): number {
  return Math.max(TOP_ROW_AREA_ABSOLUTE_MIN, page.width * page.height * TOP_ROW_AREA_RATIO_MIN)
}

function addDraftToTopRows(
  rows: TopPanelRow[],
  draft: StepCalloutRasterStepLayoutDraft,
): TopPanelRow[] {
  const row = findMatchingTopRow(rows, draft)

  if (!row) {
    rows.push(createTopPanelRow(draft))
    return rows
  }

  row.centerY = mergeTopRowCenter(row, draft)
  addDistinctTopRowX(row, draft)
  return rows
}

function findMatchingTopRow(
  rows: readonly TopPanelRow[],
  draft: StepCalloutRasterStepLayoutDraft,
): TopPanelRow | null {
  const center = stepCalloutRegionCenter(draft.evidence.candidate.region)

  return rows.find((row) =>
    row.pageNumber === draft.evidence.candidate.pageNumber &&
    Math.abs(row.centerY - center.y) <= TOP_ROW_CENTER_TOLERANCE,
  ) ?? null
}

function createTopPanelRow(draft: StepCalloutRasterStepLayoutDraft): TopPanelRow {
  const center = stepCalloutRegionCenter(draft.evidence.candidate.region)

  return {
    centerY: center.y,
    pageNumber: draft.evidence.candidate.pageNumber,
    xCenters: [center.x],
  }
}

function mergeTopRowCenter(
  row: TopPanelRow,
  draft: StepCalloutRasterStepLayoutDraft,
): number {
  const center = stepCalloutRegionCenter(draft.evidence.candidate.region)

  return (row.centerY * row.xCenters.length + center.y) / (row.xCenters.length + 1)
}

function addDistinctTopRowX(
  row: TopPanelRow,
  draft: StepCalloutRasterStepLayoutDraft,
): void {
  const center = stepCalloutRegionCenter(draft.evidence.candidate.region)

  if (row.xCenters.every((xCenter) => Math.abs(xCenter - center.x) > TOP_ROW_DISTINCT_X_TOLERANCE)) {
    row.xCenters.push(center.x)
  }
}

function isStrongTopPanel(draft: StepCalloutRasterStepLayoutDraft): boolean {
  return (
    draft.evidence.candidate.source === "fill-panel" &&
    readSignalValue(draft.evidence.scores, "border") >= TOP_ROW_BORDER_MIN &&
    readSignalValue(draft.evidence.scores, "background") >= TOP_ROW_BACKGROUND_MIN
  )
}

function hasPageSupportedTopRow(
  draft: StepCalloutRasterStepLayoutDraft,
  topRows: readonly TopPanelRow[],
): boolean {
  return topRows.some((row) => row.pageNumber === draft.evidence.candidate.pageNumber)
}
