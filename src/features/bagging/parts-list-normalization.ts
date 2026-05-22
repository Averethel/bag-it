import type {
  ParsedPartsListPageRow,
  PartsListPartCatalogue,
  PartsListPartMatchKind,
  PartsListResolvedPart,
} from "./parts-list-extraction"
import { getPartsListRowId } from "./parts-list-row-id"

export type PartsListNormalizationStatus = "ready" | "needs_attention" | "unavailable"

export type NormalizedPartsListRowStatus = "resolved" | "ambiguous" | "unresolved"

export type NormalizedPartsListIssue =
  | "ambiguous_part"
  | "missing_color"
  | "missing_part"

export type NormalizedPartsListPartCandidate = {
  matchKind: PartsListPartMatchKind
  partNumber: string
  rank: number
  selected: boolean
}

export type NormalizedPartsListRow = {
  color: ParsedPartsListPageRow["color"]
  issues: NormalizedPartsListIssue[]
  part: PartsListResolvedPart | null
  partCandidates: NormalizedPartsListPartCandidate[]
  partNumber: string
  quantity: number
  rowId: string
  sourcePage: number
  status: NormalizedPartsListRowStatus
}

export type PartsListNormalizationSummary = {
  ambiguousQuantity: number
  attentionRows: NormalizedPartsListRow[]
  catalogueSnapshotId: string | null
  coverageThreshold: number
  resolvedQuantity: number
  rows: NormalizedPartsListRow[]
  status: PartsListNormalizationStatus
  totalQuantity: number
  unresolvedQuantity: number
}

const defaultCoverageThreshold = 0.9

const partCandidateRanks = {
  exact: 100,
  external_alias: 96,
  missing_mold_suffix: 92,
  fused_quantity_prefix: 88,
  ocr_digit_variant: 86,
  ocr_mold_suffix: 84,
  ocr_suffix_noise: 82,
  print_parent: 74,
  print_family: 72,
  related_mold: 68,
} as const satisfies Record<PartsListPartMatchKind, number>

const ambiguousPartMatchKinds = new Set<PartsListPartMatchKind>([
  "print_parent",
  "print_family",
  "related_mold",
])

export function normalizePartsListRows(
  rows: readonly ParsedPartsListPageRow[],
  {
    coverageThreshold = defaultCoverageThreshold,
    partCatalogue = null,
  }: {
    coverageThreshold?: number
    partCatalogue?: PartsListPartCatalogue | null
  } = {},
): PartsListNormalizationSummary {
  const normalizedRows = rows.map((row) => normalizePartsListRow(row, partCatalogue))
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0)
  const resolvedQuantity = normalizedRows.reduce(
    (sum, row) => sum + (row.status === "resolved" ? row.quantity : 0),
    0,
  )
  const ambiguousQuantity = normalizedRows.reduce(
    (sum, row) => sum + (row.status === "ambiguous" ? row.quantity : 0),
    0,
  )
  const unresolvedQuantity = totalQuantity - resolvedQuantity - ambiguousQuantity
  const coverage = totalQuantity > 0 ? resolvedQuantity / totalQuantity : 0

  return {
    ambiguousQuantity,
    attentionRows: normalizedRows.filter((row) => row.status !== "resolved"),
    catalogueSnapshotId: partCatalogue?.snapshot?.id ?? null,
    coverageThreshold,
    resolvedQuantity,
    rows: normalizedRows,
    status: getNormalizationStatus({ coverage, coverageThreshold, totalQuantity }),
    totalQuantity,
    unresolvedQuantity,
  }
}

function normalizePartsListRow(
  row: ParsedPartsListPageRow,
  partCatalogue: PartsListPartCatalogue | null,
): NormalizedPartsListRow {
  const rankedPartCandidates = rankPartCandidates(row, partCatalogue)
  const part = row.part ?? getSelectedCandidatePart(rankedPartCandidates, partCatalogue)
  const partCandidates = rankedPartCandidates.map((candidate) => ({
    ...candidate,
    selected: candidate.partNumber === part?.cataloguePartNumber &&
      candidate.matchKind === part.matchKind,
  }))
  const issues = getNormalizationIssues(row, part, partCandidates)
  const status = getRowNormalizationStatus(issues)

  return {
    color: row.color,
    issues,
    part,
    partCandidates,
    partNumber: row.partNumber,
    quantity: row.quantity,
    rowId: getPartsListRowId(row),
    sourcePage: row.sourcePage,
    status,
  }
}

function rankPartCandidates(
  row: ParsedPartsListPageRow,
  partCatalogue: PartsListPartCatalogue | null,
) {
  const candidates = new Map<string, NormalizedPartsListPartCandidate>()
  const selectedPartNumber = normalizePartNumber(row.part?.cataloguePartNumber ?? "")

  if (row.part) {
    addPartCandidate(candidates, {
      matchKind: row.part.matchKind,
      partNumber: row.part.cataloguePartNumber,
      selected: true,
    })
  }

  if (!partCatalogue) {
    return sortPartCandidates(candidates)
  }

  const manualPartNumber = normalizePartNumber(row.partNumber)
  if (!manualPartNumber) {
    return sortPartCandidates(candidates)
  }

  if (partCatalogue.parts.has(manualPartNumber)) {
    addPartCandidate(candidates, {
      matchKind: "exact",
      partNumber: manualPartNumber,
      selected: selectedPartNumber === manualPartNumber,
    })
  }

  const externalAlias = partCatalogue.externalPartAliasByPart?.get(manualPartNumber)
  if (externalAlias) {
    addPartCandidate(candidates, {
      matchKind: "external_alias",
      partNumber: externalAlias,
      selected: selectedPartNumber === normalizePartNumber(externalAlias),
    })
  }

  const moldVariant = partCatalogue.singleLetterMoldVariantByPart?.get(manualPartNumber)
  if (moldVariant) {
    addPartCandidate(candidates, {
      matchKind: "missing_mold_suffix",
      partNumber: moldVariant,
      selected: selectedPartNumber === normalizePartNumber(moldVariant),
    })
  }

  const basePart = findLikelyLetterSuffixBasePart(manualPartNumber, partCatalogue)
  if (basePart) {
    addPartCandidate(candidates, {
      matchKind: "ocr_suffix_noise",
      partNumber: basePart,
      selected: selectedPartNumber === normalizePartNumber(basePart),
    })
  }

  const printParent = partCatalogue.printParentByPart?.get(manualPartNumber)
  if (printParent) {
    addPartCandidate(candidates, {
      matchKind: "print_parent",
      partNumber: printParent,
      selected: selectedPartNumber === normalizePartNumber(printParent),
    })
  }

  const printedPart = parsePrintedPartNumber(manualPartNumber)
  const printFamily = printedPart ? partCatalogue.printFamilyByBase?.get(printedPart.base) : null
  for (const partNumber of printFamily ?? []) {
    addPartCandidate(candidates, {
      matchKind: "print_family",
      partNumber,
      selected: selectedPartNumber === normalizePartNumber(partNumber),
    })
  }

  const family = partCatalogue.moldFamilyByPart?.get(manualPartNumber)
  for (const partNumber of family ?? []) {
    addPartCandidate(candidates, {
      matchKind: "related_mold",
      partNumber,
      selected: selectedPartNumber === normalizePartNumber(partNumber),
    })
  }

  return sortPartCandidates(candidates)
}

function getSelectedCandidatePart(
  partCandidates: readonly NormalizedPartsListPartCandidate[],
  partCatalogue: PartsListPartCatalogue | null,
): PartsListResolvedPart | null {
  const selectedCandidate = partCandidates.find((candidate) => candidate.selected) ?? partCandidates[0]
  if (!selectedCandidate) {
    return null
  }

  return {
    cataloguePartNumber: selectedCandidate.partNumber,
    matchKind: selectedCandidate.matchKind,
    ...(partCatalogue?.partNameByPart?.get(selectedCandidate.partNumber)
      ? { name: partCatalogue.partNameByPart.get(selectedCandidate.partNumber) }
      : {}),
  }
}

function addPartCandidate(
  candidates: Map<string, NormalizedPartsListPartCandidate>,
  candidate: Omit<NormalizedPartsListPartCandidate, "rank">,
) {
  const partNumber = normalizePartNumber(candidate.partNumber)
  if (!partNumber) {
    return
  }

  const existing = candidates.get(partNumber)
  const rankedCandidate = {
    ...candidate,
    partNumber,
    rank: partCandidateRanks[candidate.matchKind],
  }

  if (
    !existing ||
    rankedCandidate.selected ||
    (!existing.selected && rankedCandidate.rank > existing.rank)
  ) {
    candidates.set(partNumber, rankedCandidate)
  }
}

function sortPartCandidates(candidates: ReadonlyMap<string, NormalizedPartsListPartCandidate>) {
  return [...candidates.values()].sort(
    (left, right) =>
      Number(right.selected) - Number(left.selected) ||
      right.rank - left.rank ||
      left.partNumber.localeCompare(right.partNumber, undefined, { numeric: true, sensitivity: "base" }),
  )
}

function getNormalizationIssues(
  row: ParsedPartsListPageRow,
  part: PartsListResolvedPart | null,
  partCandidates: readonly NormalizedPartsListPartCandidate[],
) {
  const issues: NormalizedPartsListIssue[] = []

  if (!part) {
    issues.push("missing_part")
  } else if (
    ambiguousPartMatchKinds.has(part.matchKind) &&
    partCandidates.some((candidate) => !candidate.selected)
  ) {
    issues.push("ambiguous_part")
  }

  if (!row.color) {
    issues.push("missing_color")
  }

  return issues
}

function getRowNormalizationStatus(issues: readonly NormalizedPartsListIssue[]): NormalizedPartsListRowStatus {
  if (issues.includes("missing_part") || issues.includes("missing_color")) {
    return "unresolved"
  }

  if (issues.includes("ambiguous_part")) {
    return "ambiguous"
  }

  return "resolved"
}

function getNormalizationStatus({
  coverage,
  coverageThreshold,
  totalQuantity,
}: {
  coverage: number
  coverageThreshold: number
  totalQuantity: number
}) {
  if (totalQuantity <= 0) {
    return "unavailable"
  }

  return coverage >= coverageThreshold ? "ready" : "needs_attention"
}

function normalizePartNumber(partNumber: string) {
  return partNumber.trim().toLowerCase()
}

function parsePrintedPartNumber(partNumber: string) {
  const match = normalizePartNumber(partNumber).match(/^(\d+(?:[a-z]|c\d{2})?)(?:p|pb|pr|px)\d+$/)

  return match ? { base: match[1] ?? "" } : null
}

function findLikelyLetterSuffixBasePart(
  partNumber: string,
  partCatalogue: PartsListPartCatalogue,
) {
  const match = normalizePartNumber(partNumber).match(/^(\d{4,})([a-z]{1,3})$/)
  if (!match) {
    return null
  }

  const basePart = match[1] ?? ""

  return partCatalogue.parts.has(basePart) ? basePart : null
}
