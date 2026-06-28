import type {
  StepCalloutCandidateEvidence,
  StepCalloutResolutionStatus,
} from "./contracts"
import { hasStepCalloutOffManualStyleBackgroundEvidence } from "./evidence-reasons"
import { readStepCalloutEvidenceSignalValue as readSignalValue } from "./resolution-draft"
import { stepCalloutRegionArea, stepCalloutRegionCenter } from "./regions"

const DISTINCT_X_TOLERANCE = 48
const GRID_COLUMN_X_TOLERANCE = 64
const OUT_OF_ROW_BORDER_MAX = 0.75
const OUT_OF_ROW_NARROW_WIDTH_RATIO_MAX = 0.42
const ROW_ANCHOR_BACKGROUND_MIN = 0.6
const ROW_ANCHOR_BORDER_MIN = 0.9
const ROW_CENTER_TOLERANCE = 56
const ROW_MEMBER_FILL_PANEL_BACKGROUND_MIN = 0.2
const ROW_MEMBER_AREA_MIN = 600
const ROW_MEMBER_BACKGROUND_MIN = 0.01
const ROW_MEMBER_GRID_ASPECT_MIN = 0.5
const SUPPORTED_ROW_X_COUNT_MIN = 2

export interface StepCalloutVisualDiagnosticDraft {
  evidence: StepCalloutCandidateEvidence
  status: StepCalloutResolutionStatus
}

interface VisualDiagnosticRow {
  centerY: number
  pageNumber: number
  xCenters: number[]
}

interface VisualDiagnosticGrid {
  anchorRows: VisualDiagnosticRow[]
  columns: VisualDiagnosticColumn[]
  supportedRows: VisualDiagnosticRow[]
}

interface VisualDiagnosticColumn {
  pageNumber: number
  x: number
}

export function refineStepCalloutVisualDiagnosticLayout(
  drafts: readonly StepCalloutVisualDiagnosticDraft[],
): Map<string, StepCalloutResolutionStatus> {
  const grid = readVisualDiagnosticGrid(drafts)

  return new Map(readLayoutStatusEntries(drafts, grid))
}

function readLayoutStatusEntries(
  drafts: readonly StepCalloutVisualDiagnosticDraft[],
  grid: VisualDiagnosticGrid,
): Array<[string, StepCalloutResolutionStatus]> {
  return drafts.flatMap((draft) => {
    const status = readLayoutStatus(draft, grid)
    return status ? [[draft.evidence.candidate.id, status]] : []
  })
}

function readLayoutStatus(
  draft: StepCalloutVisualDiagnosticDraft,
  grid: VisualDiagnosticGrid,
): StepCalloutResolutionStatus | null {
  if (shouldRecoverRowMember(draft, grid)) {
    return "diagnostic"
  }

  if (shouldRejectOutOfRowFragment(draft, grid.supportedRows)) {
    return "rejected"
  }

  return null
}

function shouldRecoverRowMember(
  draft: StepCalloutVisualDiagnosticDraft,
  grid: VisualDiagnosticGrid,
): boolean {
  return (
    draft.status === "rejected" &&
    hasMinimumArea(draft) &&
    readSignalValue(draft.evidence.scores, "border") >= ROW_ANCHOR_BORDER_MIN &&
    hasRecoverableLayoutEvidence(draft, grid)
  )
}

function hasRecoverableLayoutEvidence(
  draft: StepCalloutVisualDiagnosticDraft,
  grid: VisualDiagnosticGrid,
): boolean {
  if (hasRecoverableBackground(draft)) {
    return isAlignedWithSupportedRow(draft, grid.supportedRows) || isSupportedGridMember(draft, grid)
  }

  return hasBorderGridRecovery(draft, grid)
}

function hasRecoverableBackground(draft: StepCalloutVisualDiagnosticDraft): boolean {
  const background = readSignalValue(draft.evidence.scores, "background")

  return draft.evidence.candidate.source === "fill-panel"
    ? background >= ROW_MEMBER_FILL_PANEL_BACKGROUND_MIN
    : background >= ROW_MEMBER_BACKGROUND_MIN
}

function hasBorderGridRecovery(
  draft: StepCalloutVisualDiagnosticDraft,
  grid: VisualDiagnosticGrid,
): boolean {
  return (
    draft.evidence.candidate.source !== "fill-panel" &&
    hasNoOffManualStyleBackground(draft) &&
    hasPanelLikeGridShape(draft) &&
    isSupportedGridMember(draft, grid)
  )
}

function hasNoOffManualStyleBackground(draft: StepCalloutVisualDiagnosticDraft): boolean {
  return !hasStepCalloutOffManualStyleBackgroundEvidence(draft.evidence.scores)
}

function hasPanelLikeGridShape(draft: StepCalloutVisualDiagnosticDraft): boolean {
  const region = draft.evidence.candidate.region

  return region.width / region.height >= ROW_MEMBER_GRID_ASPECT_MIN
}

function shouldRejectOutOfRowFragment(
  draft: StepCalloutVisualDiagnosticDraft,
  supportedRows: readonly VisualDiagnosticRow[],
): boolean {
  return (
    draft.status === "diagnostic" &&
    hasPageSupportedRows(draft, supportedRows) &&
    !isAlignedWithSupportedRow(draft, supportedRows) &&
    (isWeakBorderOnlyDiagnostic(draft) || isNarrowVisualFragment(draft))
  )
}

function isWeakBorderOnlyDiagnostic(draft: StepCalloutVisualDiagnosticDraft): boolean {
  return (
    draft.evidence.candidate.source === "border" &&
    readSignalValue(draft.evidence.scores, "border") < OUT_OF_ROW_BORDER_MAX
  )
}

function isNarrowVisualFragment(draft: StepCalloutVisualDiagnosticDraft): boolean {
  const region = draft.evidence.candidate.region

  return region.width / region.height <= OUT_OF_ROW_NARROW_WIDTH_RATIO_MAX
}

function readVisualDiagnosticGrid(
  drafts: readonly StepCalloutVisualDiagnosticDraft[],
): VisualDiagnosticGrid {
  const anchors = drafts.filter(isVisualRowAnchor)
  const anchorRows = anchors.reduce<VisualDiagnosticRow[]>(addAnchorToRows, [])

  return {
    anchorRows,
    columns: anchors.map(createVisualDiagnosticColumn),
    supportedRows: anchorRows.filter((row) => row.xCenters.length >= SUPPORTED_ROW_X_COUNT_MIN),
  }
}

function isVisualRowAnchor(draft: StepCalloutVisualDiagnosticDraft): boolean {
  return (
    draft.status !== "rejected" &&
    hasMinimumArea(draft) &&
    readSignalValue(draft.evidence.scores, "border") >= ROW_ANCHOR_BORDER_MIN &&
    readSignalValue(draft.evidence.scores, "background") >= ROW_ANCHOR_BACKGROUND_MIN
  )
}

function addAnchorToRows(
  rows: VisualDiagnosticRow[],
  draft: StepCalloutVisualDiagnosticDraft,
): VisualDiagnosticRow[] {
  const row = findMatchingRow(rows, draft)

  if (!row) {
    rows.push(createVisualDiagnosticRow(draft))
    return rows
  }

  row.centerY = mergeRowCenter(row, draft)
  addDistinctXCenter(row, draft)
  return rows
}

function findMatchingRow(
  rows: readonly VisualDiagnosticRow[],
  draft: StepCalloutVisualDiagnosticDraft,
): VisualDiagnosticRow | null {
  const center = stepCalloutRegionCenter(draft.evidence.candidate.region)

  return rows.find((row) =>
    row.pageNumber === draft.evidence.candidate.pageNumber &&
    Math.abs(row.centerY - center.y) <= ROW_CENTER_TOLERANCE,
  ) ?? null
}

function createVisualDiagnosticRow(
  draft: StepCalloutVisualDiagnosticDraft,
): VisualDiagnosticRow {
  const center = stepCalloutRegionCenter(draft.evidence.candidate.region)

  return {
    centerY: center.y,
    pageNumber: draft.evidence.candidate.pageNumber,
    xCenters: [center.x],
  }
}

function mergeRowCenter(
  row: VisualDiagnosticRow,
  draft: StepCalloutVisualDiagnosticDraft,
): number {
  const center = stepCalloutRegionCenter(draft.evidence.candidate.region)

  return (row.centerY * row.xCenters.length + center.y) / (row.xCenters.length + 1)
}

function addDistinctXCenter(
  row: VisualDiagnosticRow,
  draft: StepCalloutVisualDiagnosticDraft,
): void {
  const center = stepCalloutRegionCenter(draft.evidence.candidate.region)

  if (row.xCenters.every((xCenter) => Math.abs(xCenter - center.x) > DISTINCT_X_TOLERANCE)) {
    row.xCenters.push(center.x)
  }
}

function createVisualDiagnosticColumn(
  draft: StepCalloutVisualDiagnosticDraft,
): VisualDiagnosticColumn {
  return {
    pageNumber: draft.evidence.candidate.pageNumber,
    x: draft.evidence.candidate.region.x,
  }
}

function hasMinimumArea(draft: StepCalloutVisualDiagnosticDraft): boolean {
  return stepCalloutRegionArea(draft.evidence.candidate.region) >= ROW_MEMBER_AREA_MIN
}

function hasPageSupportedRows(
  draft: StepCalloutVisualDiagnosticDraft,
  supportedRows: readonly VisualDiagnosticRow[],
): boolean {
  return supportedRows.some((row) => row.pageNumber === draft.evidence.candidate.pageNumber)
}

function isAlignedWithSupportedRow(
  draft: StepCalloutVisualDiagnosticDraft,
  supportedRows: readonly VisualDiagnosticRow[],
): boolean {
  const center = stepCalloutRegionCenter(draft.evidence.candidate.region)

  return supportedRows.some((row) =>
    row.pageNumber === draft.evidence.candidate.pageNumber &&
    Math.abs(row.centerY - center.y) <= ROW_CENTER_TOLERANCE,
  )
}

function isSupportedGridMember(
  draft: StepCalloutVisualDiagnosticDraft,
  grid: VisualDiagnosticGrid,
): boolean {
  return (
    hasPageSupportedRows(draft, grid.supportedRows) &&
    isAlignedWithAnchorRow(draft, grid.anchorRows) &&
    isAlignedWithAnchorColumn(draft, grid.columns)
  )
}

function isAlignedWithAnchorRow(
  draft: StepCalloutVisualDiagnosticDraft,
  rows: readonly VisualDiagnosticRow[],
): boolean {
  const center = stepCalloutRegionCenter(draft.evidence.candidate.region)

  return rows.some((row) =>
    row.pageNumber === draft.evidence.candidate.pageNumber &&
    Math.abs(row.centerY - center.y) <= ROW_CENTER_TOLERANCE,
  )
}

function isAlignedWithAnchorColumn(
  draft: StepCalloutVisualDiagnosticDraft,
  columns: readonly VisualDiagnosticColumn[],
): boolean {
  const region = draft.evidence.candidate.region

  return columns.some((column) =>
    column.pageNumber === draft.evidence.candidate.pageNumber &&
    Math.abs(column.x - region.x) <= GRID_COLUMN_X_TOLERANCE,
  )
}
