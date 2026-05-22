import { describe, expect, it } from "vitest"
import type { ParsedPartsListPageRow, PartsListFromPageTextResult } from "./parts-list-extraction"
import { createPartsListProgressTransfer } from "./parts-list-progress-transfer"
import { getPartsListRowId } from "./parts-list-row-id"

describe("createPartsListProgressTransfer", () => {
  it("keeps checked rows when recalculation preserves row identity", () => {
    const previous = createResult([
      createRow({ partNumber: "3005", quantity: 14, sourceStart: 0 }),
    ])
    const checkedRowId = getPartsListRowId(previous.rows[0])

    const transfer = createPartsListProgressTransfer({
      nextResult: previous,
      previous: {
        checkedRowIds: new Set([checkedRowId]),
        result: previous,
      },
    })

    expect(transfer.checkedRowIds.has(checkedRowId)).toBe(true)
    expect(transfer).toMatchObject({
      changedRows: [],
      droppedRows: [],
      previousCheckedCount: 1,
      transferredCount: 1,
      unchangedCount: 1,
    })
  })

  it("transfers checked rows by source anchor and reports changed fields", () => {
    const previous = createResult([
      createRow({ colorId: "0", partNumber: "3005", quantity: 12, sourceStart: 0 }),
    ])
    const next = createResult([
      createRow({ colorId: "71", partNumber: "3005b", quantity: 14, sourceStart: 0 }),
    ])

    const transfer = createPartsListProgressTransfer({
      nextResult: next,
      previous: {
        checkedRowIds: new Set([getPartsListRowId(previous.rows[0])]),
        result: previous,
      },
    })

    expect(transfer.checkedRowIds).toEqual(new Set([getPartsListRowId(next.rows[0])]))
    expect(transfer.changedRows).toHaveLength(1)
    expect(transfer.changedRows[0].changes).toEqual(["quantity", "part_number", "catalogue_part", "color"])
    expect(transfer.droppedRows).toHaveLength(0)
  })

  it("reports catalogue-part changes from normalized rows", () => {
    const previous = createResult([
      createRow({ partNumber: "3005", quantity: 1, sourceStart: 0, withRawPart: false }),
    ])
    previous.normalization = createNormalization(previous.rows, ["3005"])
    const next = createResult([
      createRow({ partNumber: "3005", quantity: 1, sourceStart: 0, withRawPart: false }),
    ])
    next.normalization = createNormalization(next.rows, ["3005b"])

    const transfer = createPartsListProgressTransfer({
      nextResult: next,
      previous: {
        checkedRowIds: new Set([getPartsListRowId(previous.rows[0])]),
        result: previous,
      },
    })

    expect(transfer.checkedRowIds).toEqual(new Set([getPartsListRowId(next.rows[0])]))
    expect(transfer.changedRows).toMatchObject([
      {
        changes: ["catalogue_part"],
        next: { cataloguePartNumber: "3005b" },
        previous: { cataloguePartNumber: "3005" },
      },
    ])
  })
})

function createResult(rows: ParsedPartsListPageRow[]): PartsListFromPageTextResult {
  return {
    candidates: [],
    confidence: 1,
    lowConfidenceRows: [],
    reason: null,
    rows,
    status: "supported",
  }
}

function createRow({
  colorId = "0",
  partNumber,
  quantity,
  sourceStart,
  withRawPart = true,
}: {
  colorId?: string
  partNumber: string
  quantity: number
  sourceStart: number
  withRawPart?: boolean
}): ParsedPartsListPageRow {
  return {
    color: {
      id: colorId,
      matchedText: colorId === "0" ? "Black" : "Light Bluish Gray",
      name: colorId === "0" ? "Black" : "Light Bluish Gray",
    },
    confidence: 1,
    part: withRawPart ? { cataloguePartNumber: partNumber, matchKind: "exact" } : null,
    partNumber,
    partNumberKind: "numeric",
    quantity,
    rawText: `${quantity} x ${partNumber}`,
    sourcePage: 2,
    sourceTextRange: { end: sourceStart + 12, start: sourceStart },
  }
}

function createNormalization(rows: readonly ParsedPartsListPageRow[], partNumbers: readonly string[]) {
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0)

  return {
    ambiguousQuantity: 0,
    attentionRows: [],
    catalogueSnapshotId: "test-snapshot",
    coverageThreshold: 0.9,
    resolvedQuantity: totalQuantity,
    rows: rows.map((row, index) => ({
      color: row.color,
      issues: [],
      part: { cataloguePartNumber: partNumbers[index] ?? row.partNumber, matchKind: "exact" as const },
      partCandidates: [],
      partNumber: row.partNumber,
      quantity: row.quantity,
      rowId: getPartsListRowId(row),
      sourcePage: row.sourcePage,
      status: "resolved" as const,
    })),
    status: "ready" as const,
    totalQuantity,
    unresolvedQuantity: 0,
  }
}
