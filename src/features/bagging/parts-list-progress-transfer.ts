import type { ParsedPartsListPageRow, PartsListFromPageTextResult } from "./parts-list-extraction"
import { getPartsListRowId } from "./parts-list-row-id"

export type PartsListProgressTransferChangeField =
  | "catalogue_part"
  | "color"
  | "part_number"
  | "quantity"

export type PartsListProgressTransferChangedRow = {
  changes: PartsListProgressTransferChangeField[]
  next: PartsListProgressTransferRowSnapshot
  previous: PartsListProgressTransferRowSnapshot
}

export type PartsListProgressTransferDroppedRow = {
  previous: PartsListProgressTransferRowSnapshot | null
  previousRowId: string
}

export type PartsListProgressTransferResult = {
  changedRows: PartsListProgressTransferChangedRow[]
  checkedRowIds: ReadonlySet<string>
  droppedRows: PartsListProgressTransferDroppedRow[]
  previousCheckedCount: number
  transferredCount: number
  unchangedCount: number
}

export type PartsListProgressTransferSource = {
  checkedRowIds: ReadonlySet<string>
  result: PartsListFromPageTextResult
}

export type PartsListProgressTransferRowSnapshot = {
  cataloguePartNumber: string | null
  colorId: string | null
  colorName: string | null
  partNumber: string
  quantity: number
  rowId: string
  sourcePage: number
}

type MatchCandidate = {
  row: ParsedPartsListPageRow
  rowId: string
}

type NormalizedTransferRow = NonNullable<PartsListFromPageTextResult["normalization"]>["rows"][number]

type TransferResultContext = {
  normalizedRowsById: ReadonlyMap<string, NormalizedTransferRow>
  rows: readonly ParsedPartsListPageRow[]
  rowsById: ReadonlyMap<string, ParsedPartsListPageRow>
}

export function createPartsListProgressTransfer({
  nextResult,
  previous,
}: {
  nextResult: PartsListFromPageTextResult
  previous: PartsListProgressTransferSource | null
}): PartsListProgressTransferResult {
  if (!previous || previous.checkedRowIds.size === 0) {
    return createEmptyProgressTransfer()
  }

  const previousContext = createTransferResultContext(previous.result)
  const nextContext = createTransferResultContext(nextResult)
  const nextCheckedRowIds = new Set<string>()
  const changedRows: PartsListProgressTransferChangedRow[] = []
  const droppedRows: PartsListProgressTransferDroppedRow[] = []
  let unchangedCount = 0

  for (const previousRowId of previous.checkedRowIds) {
    const previousRow = previousContext.rowsById.get(previousRowId)
    const match = previousRow
      ? findNextTransferMatch(previousRow, previousRowId, nextContext, nextCheckedRowIds, previousContext)
      : null

    if (!previousRow || !match) {
      droppedRows.push({
        previous: previousRow ? createTransferRowSnapshot(previousRow, previousContext) : null,
        previousRowId,
      })
      continue
    }

    nextCheckedRowIds.add(match.rowId)
    const changes = getTransferChanges(previousRow, previousContext, match.row, nextContext)
    if (changes.length > 0) {
      changedRows.push({
        changes,
        next: createTransferRowSnapshot(match.row, nextContext),
        previous: createTransferRowSnapshot(previousRow, previousContext),
      })
    } else {
      unchangedCount += 1
    }
  }

  return {
    changedRows,
    checkedRowIds: nextCheckedRowIds,
    droppedRows,
    previousCheckedCount: previous.checkedRowIds.size,
    transferredCount: nextCheckedRowIds.size,
    unchangedCount,
  }
}

function createEmptyProgressTransfer(): PartsListProgressTransferResult {
  return {
    changedRows: [],
    checkedRowIds: new Set(),
    droppedRows: [],
    previousCheckedCount: 0,
    transferredCount: 0,
    unchangedCount: 0,
  }
}

function createTransferResultContext(result: PartsListFromPageTextResult): TransferResultContext {
  return {
    normalizedRowsById: new Map(result.normalization?.rows.map((row) => [row.rowId, row] as const) ?? []),
    rows: result.rows,
    rowsById: createRowsById(result.rows),
  }
}

function createRowsById(rows: readonly ParsedPartsListPageRow[]) {
  return new Map(rows.map((row) => [getPartsListRowId(row), row] as const))
}

function findNextTransferMatch(
  previousRow: ParsedPartsListPageRow,
  previousRowId: string,
  nextContext: TransferResultContext,
  usedRowIds: ReadonlySet<string>,
  previousContext: TransferResultContext,
): MatchCandidate | null {
  const exactRow = nextContext.rowsById.get(previousRowId)
  if (exactRow && !usedRowIds.has(previousRowId)) {
    return { row: exactRow, rowId: previousRowId }
  }

  return (
    findUniqueCandidate(nextContext.rows, usedRowIds, (row) => hasSameSourceAnchor(previousRow, row)) ??
    findUniqueCandidate(nextContext.rows, usedRowIds, (row) =>
      hasSamePartColorAndQuantity(previousRow, previousContext, row, nextContext),
    ) ??
    findUniqueCandidate(nextContext.rows, usedRowIds, (row) =>
      hasSamePartAndColor(previousRow, previousContext, row, nextContext),
    ) ??
    null
  )
}

function findUniqueCandidate(
  rows: readonly ParsedPartsListPageRow[],
  usedRowIds: ReadonlySet<string>,
  predicate: (row: ParsedPartsListPageRow) => boolean,
) {
  const matches: MatchCandidate[] = []
  for (const row of rows) {
    const rowId = getPartsListRowId(row)
    if (!usedRowIds.has(rowId) && predicate(row)) {
      matches.push({ row, rowId })
    }
  }

  return matches.length === 1 ? matches[0] : null
}

function hasSameSourceAnchor(left: ParsedPartsListPageRow, right: ParsedPartsListPageRow) {
  return left.sourcePage === right.sourcePage && left.sourceTextRange.start === right.sourceTextRange.start
}

function hasSamePartColorAndQuantity(
  left: ParsedPartsListPageRow,
  leftContext: TransferResultContext,
  right: ParsedPartsListPageRow,
  rightContext: TransferResultContext,
) {
  return hasSamePartAndColor(left, leftContext, right, rightContext) && left.quantity === right.quantity
}

function hasSamePartAndColor(
  left: ParsedPartsListPageRow,
  leftContext: TransferResultContext,
  right: ParsedPartsListPageRow,
  rightContext: TransferResultContext,
) {
  return (
    normalizePartNumber(getComparablePartNumber(left, leftContext)) === normalizePartNumber(getComparablePartNumber(right, rightContext)) &&
    getComparableColorId(left) === getComparableColorId(right)
  )
}

function getTransferChanges(
  previousRow: ParsedPartsListPageRow,
  previousContext: TransferResultContext,
  nextRow: ParsedPartsListPageRow,
  nextContext: TransferResultContext,
): PartsListProgressTransferChangeField[] {
  const changes: PartsListProgressTransferChangeField[] = []

  if (previousRow.quantity !== nextRow.quantity) {
    changes.push("quantity")
  }
  if (normalizePartNumber(previousRow.partNumber) !== normalizePartNumber(nextRow.partNumber)) {
    changes.push("part_number")
  }
  if (
    normalizePartNumber(getCataloguePartNumber(previousRow, previousContext) ?? "") !==
    normalizePartNumber(getCataloguePartNumber(nextRow, nextContext) ?? "")
  ) {
    changes.push("catalogue_part")
  }
  if (getComparableColorId(previousRow) !== getComparableColorId(nextRow)) {
    changes.push("color")
  }

  return changes
}

function createTransferRowSnapshot(
  row: ParsedPartsListPageRow,
  context: TransferResultContext,
): PartsListProgressTransferRowSnapshot {
  return {
    cataloguePartNumber: getCataloguePartNumber(row, context),
    colorId: row.color?.id ?? null,
    colorName: row.color?.name ?? null,
    partNumber: row.partNumber,
    quantity: row.quantity,
    rowId: getPartsListRowId(row),
    sourcePage: row.sourcePage,
  }
}

function getComparablePartNumber(row: ParsedPartsListPageRow, context: TransferResultContext) {
  return getCataloguePartNumber(row, context) ?? row.partNumber
}

function getCataloguePartNumber(row: ParsedPartsListPageRow, context: TransferResultContext) {
  return context.normalizedRowsById.get(getPartsListRowId(row))?.part?.cataloguePartNumber ??
    row.part?.cataloguePartNumber ??
    null
}

function getComparableColorId(row: ParsedPartsListPageRow) {
  return row.color?.id ?? "unresolved"
}

function normalizePartNumber(partNumber: string) {
  return partNumber.trim().toLowerCase()
}
