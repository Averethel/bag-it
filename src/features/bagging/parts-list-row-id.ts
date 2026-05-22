import type { ParsedPartsListPageRow } from "./parts-list-extraction"

export function getPartsListRowId(row: Pick<
  ParsedPartsListPageRow,
  "color" | "partNumber" | "quantity" | "sourcePage" | "sourceTextRange"
>) {
  return `${row.sourcePage}-${row.sourceTextRange.start}-${row.quantity}-${row.partNumber}-${row.color?.id ?? "unresolved"}`
}
