import type { PartMatchGroup } from "./part-match-group-progress"
import { displayColorSwatchHex } from "./bagging-color-display"
import type {
  StepCalloutBagRow,
  StepCalloutBaggingPlan,
} from "@/features/bagging/step-callout-bagging"
import { COUNT_LABELS, formatCount } from "@/lib/count-format"

export type BagGroupingMode = "bag" | "color"
export type BagChecklistSortColumn = "checked" | "quantity" | "color" | "page" | "step"

export type BagChecklistSort = {
  column: BagChecklistSortColumn
  direction: "asc" | "desc"
}

export type BagChecklistGroup = {
  badge: string
  colorSwatchHex: string | null
  id: string
  reviewReasons: string[]
  rows: StepCalloutBagRow[]
  status: "draft" | "review"
  title: string
}

export type BagChecklistPartGroup = {
  group: PartMatchGroup
  lane: "auto" | "suggested"
  rows: StepCalloutBagRow[]
}

export type BagChecklistProgressSummary = {
  checkedQuantity: number
  percent: number
  totalQuantity: number
}

export type ActiveBagChecklistPartGroup = {
  partGroup: BagChecklistPartGroup
  rows: StepCalloutBagRow[]
}

export type BagChecklistTableItem =
  | {
      kind: "row"
      row: StepCalloutBagRow
      nestedPartGroupId?: string
      nestedPartGroupLane?: BagChecklistPartGroup["lane"]
    }
  | {
      kind: "part-group"
      group: BagChecklistPartGroup
      groupIndex: number
      rows: StepCalloutBagRow[]
    }

export const BAG_CHECKLIST_DEFAULT_SORT: BagChecklistSort = {
  column: "page",
  direction: "asc",
}

export const BAG_CHECKLIST_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

export function createPartGroupedTableItems(
  sortedRows: readonly StepCalloutBagRow[],
  partGroups: readonly BagChecklistPartGroup[],
  sort: BagChecklistSort,
  checkedSortRowIds: ReadonlySet<string> | null,
  expandedPartGroupIds: ReadonlySet<string>,
  rejectedPartGroupIds: ReadonlySet<string>,
  removedPartGroupRowKeys: ReadonlySet<string>,
): BagChecklistTableItem[] {
  const groupByRowId = new Map<string, ActiveBagChecklistPartGroup>()

  for (const partGroup of partGroups) {
    const groupId = partGroup.group.groupId

    if (rejectedPartGroupIds.has(groupId)) {
      continue
    }

    const activeRows = partGroup.rows.filter((row) =>
      !removedPartGroupRowKeys.has(partGroupRowKey(groupId, row.id))
    )

    if (activeRows.length < 2) {
      continue
    }

    const activeGroup = { partGroup, rows: activeRows }

    for (const row of activeRows) {
      groupByRowId.set(row.id, activeGroup)
    }
  }

  const emittedGroupIds = new Set<string>()
  const items: BagChecklistTableItem[] = []
  let groupIndex = 0

  for (const row of sortedRows) {
    const activeGroup = groupByRowId.get(row.id)

    if (!activeGroup) {
      items.push({ kind: "row", row })
      continue
    }

    const { partGroup } = activeGroup
    const groupId = partGroup.group.groupId

    if (emittedGroupIds.has(groupId)) {
      continue
    }

    emittedGroupIds.add(groupId)

    const groupRows = sortBagRows(activeGroup.rows, checkedSortRowIds, sort)
    items.push({
      kind: "part-group",
      group: partGroup,
      groupIndex,
      rows: groupRows,
    })
    groupIndex += 1

    if (expandedPartGroupIds.has(groupId)) {
      for (const groupRow of groupRows) {
        items.push({
          kind: "row",
          nestedPartGroupId: groupId,
          nestedPartGroupLane: partGroup.lane,
          row: groupRow,
        })
      }
    }
  }

  return items
}

export function createBagChecklistTableKey(
  groupSameParts: boolean,
  rows: readonly StepCalloutBagRow[],
): string {
  return `${groupSameParts ? "parts" : "rows"}:${rows.map((row) => row.id).join("|")}`
}

export function createCheckedBagRowIdsKeyByGroupId(
  groups: readonly BagChecklistGroup[],
  checkedRowIds: ReadonlySet<string>,
): ReadonlyMap<string, string> {
  const keyByGroupId = new Map<string, string>()

  for (const group of groups) {
    const checkedGroupRowIds = group.rows.flatMap((row) =>
      checkedRowIds.has(row.id) ? [row.id] : []
    )

    keyByGroupId.set(group.id, checkedGroupRowIds.join("\0"))
  }

  return keyByGroupId
}

export function createBagChecklistCheckedRowIdSet(checkedRowIdsKey: string): ReadonlySet<string> {
  return new Set(checkedRowIdsKey.length > 0 ? checkedRowIdsKey.split("\0") : [])
}

export function createBagChecklistGroups(
  plan: StepCalloutBaggingPlan,
  rows: readonly StepCalloutBagRow[],
  groupingMode: BagGroupingMode,
): BagChecklistGroup[] {
  if (groupingMode === "color") {
    return createColorGroups(rows)
  }

  return plan.bags.map((bag) => ({
    badge: `${formatCount(bag.partCount, COUNT_LABELS.part)}`,
    colorSwatchHex: null,
    id: bag.id,
    reviewReasons: bag.reviewReasons,
    rows: rows.filter((row) => row.bagId === bag.id),
    status: bag.status,
    title: `${bag.label} · ${bag.pageRange.label}`,
  }))
}

export function createDefaultExpandedBagGroupValues(
  groups: readonly BagChecklistGroup[],
  isLargeChecklist: boolean,
): string[] {
  return (isLargeChecklist ? groups.slice(0, 1) : groups).map((group) => group.id)
}

export function createBagChecklistAccordionValueKey(
  groups: readonly BagChecklistGroup[],
  isLargeChecklist: boolean,
): string {
  return [
    isLargeChecklist ? "large" : "standard",
    ...groups.map((group) => {
      const firstRowId = group.rows[0]?.id ?? ""
      const lastRowId = group.rows[group.rows.length - 1]?.id ?? ""

      return `${group.id}:${group.rows.length}:${firstRowId}:${lastRowId}`
    }),
  ].join("|")
}

export function partGroupRowKey(groupId: string, rowId: string): string {
  return `${groupId}\0${rowId}`
}

export function createProgressSummary(
  rows: readonly StepCalloutBagRow[],
  checkedRowIds: ReadonlySet<string>,
): BagChecklistProgressSummary {
  const totalQuantity = rows.reduce((total, row) => total + row.quantity, 0)
  const checkedQuantity = rows.reduce(
    (total, row) => total + (checkedRowIds.has(row.id) ? row.quantity : 0),
    0,
  )
  const percent =
    totalQuantity === 0 ? 0 : Math.round((checkedQuantity / totalQuantity) * 100)

  return {
    checkedQuantity,
    percent,
    totalQuantity,
  }
}

export function sortBagRows(
  rows: readonly StepCalloutBagRow[],
  checkedRowIds: ReadonlySet<string> | null,
  sort: BagChecklistSort,
): StepCalloutBagRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const comparison = compareBagRows(left.row, right.row, checkedRowIds, sort.column)
      const direction = sort.direction === "asc" ? 1 : -1

      return comparison === 0 ? left.index - right.index : comparison * direction
    })
    .map(({ row }) => row)
}

export function compareBagRows(
  left: StepCalloutBagRow,
  right: StepCalloutBagRow,
  checkedRowIds: ReadonlySet<string> | null,
  column: BagChecklistSortColumn,
): number {
  switch (column) {
    case "checked":
      return (
        Number(checkedRowIds?.has(left.id) ?? false) -
        Number(checkedRowIds?.has(right.id) ?? false)
      )
    case "quantity":
      return left.quantity - right.quantity
    case "color":
      return (
        BAG_CHECKLIST_COLLATOR.compare(left.color.family, right.color.family) ||
        BAG_CHECKLIST_COLLATOR.compare(left.color.name, right.color.name)
      )
    case "step":
      return left.stepIndex - right.stepIndex || compareBagRows(left, right, checkedRowIds, "page")
    case "page":
    default:
      return (
        left.bagNumber - right.bagNumber ||
        left.sourcePageNumber - right.sourcePageNumber ||
        left.calloutIndexOnPage - right.calloutIndexOnPage ||
        left.itemIndexOnCallout - right.itemIndexOnCallout
      )
  }
}

export function bagSortDirectionLabel(
  sort: BagChecklistSort,
  column: BagChecklistSortColumn,
): "ascending" | "descending" | undefined {
  return sort.column === column
    ? sort.direction === "asc" ? "ascending" : "descending"
    : undefined
}

export function formatBagChecklistSummary(plan: StepCalloutBaggingPlan): string {
  return [
    `${formatCount(plan.bags.length, COUNT_LABELS.bag)}`,
    `${formatCount(plan.detectedStepCount, COUNT_LABELS.callout)}`,
    `${formatCount(plan.detectedPartCount, COUNT_LABELS.detectedPart)}`,
    `${plan.policy.source === "inventory" ? "inventory" : "detected"} sizing`,
    `${plan.policy.band} band`,
  ].join(" · ")
}

function createColorGroups(rows: readonly StepCalloutBagRow[]): BagChecklistGroup[] {
  const groups = new Map<string, BagChecklistGroup>()

  for (const row of rows) {
    const existing = groups.get(row.color.key)
    const group = existing ?? {
      badge: "",
      colorSwatchHex: displayColorSwatchHex(row.color.name, row.color.swatchHex),
      id: `color-${row.color.key}`,
      reviewReasons: row.color.status === "exact" ? [] : ["advisory color"],
      rows: [],
      status: row.color.status === "exact" ? "draft" as const : "review" as const,
      title: row.color.name,
    }

    group.rows.push(row)
    groups.set(row.color.key, group)
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      badge: formatCount(
        group.rows.reduce((total, row) => total + row.quantity, 0),
        COUNT_LABELS.part,
      ),
    }))
    .sort((left, right) =>
      BAG_CHECKLIST_COLLATOR.compare(left.title, right.title),
    )
}
