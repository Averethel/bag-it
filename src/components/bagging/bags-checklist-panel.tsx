import {
  memo,
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  Badge,
  Box,
  Checkbox,
  HStack,
  IconButton,
  Stack,
  Switch,
  Text,
} from "@chakra-ui/react"
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Minus,
  PackageCheck,
  X,
} from "lucide-react"
import { PreviewCard, PreviewTextHandle } from "./preview-card"
import {
  colorConfidenceLabel,
  confidenceBadgePalette,
  displayColorSwatchHex,
} from "./bagging-color-display"
import {
  BagChecklistAccordion,
  BagChecklistProgressBar,
} from "./bag-checklist-accordion"
import {
  BAG_CHECKLIST_DEFAULT_SORT,
  bagSortDirectionLabel,
  createBagChecklistGroups,
  createBagChecklistTableKey,
  createCheckedBagRowIdsKeyByGroupId,
  createPartGroupedTableItems,
  createProgressSummary,
  formatBagChecklistSummary,
  partGroupRowKey,
  sortBagRows,
  type BagChecklistGroup,
  type BagChecklistPartGroup,
  type BagChecklistSort,
  type BagChecklistSortColumn,
  type BagChecklistTableItem,
  type BagGroupingMode,
} from "./bag-checklist-table-model"
import {
  type PartMatchPrecomputeState,
  type PartMatchPrecomputeStatus,
} from "./use-precomputed-part-match-groups"
import { IconButtonTooltip } from "@/components/ui/icon-button-tooltip"
import {
  type StepCalloutBagRow,
  type StepCalloutBaggingPlan,
} from "@/features/bagging/step-callout-bagging"
import {
  type PreviewAssetStore,
  type RegionPreviewSource,
} from "@/features/steps/preview-assets"
import { COUNT_LABELS, formatCount, formatCountRatio } from "@/lib/count-format"

const PART_ROW_PREVIEW_MAX_ZOOM_SCALE = 3
const PART_ROW_PREVIEW_THUMBNAIL_MAX_SIZE = 64

export type {
  PartMatchPrecomputeState,
  PartMatchPrecomputeStatus,
} from "./use-precomputed-part-match-groups"

const LARGE_BAG_CHECKLIST_ROW_THRESHOLD = 250
const EMPTY_BAG_CHECKLIST_PART_GROUPS: readonly BagChecklistPartGroup[] = []

export function BagsChecklistPanel({
  checkedRowIds,
  partMatchPrecompute,
  plan,
  previewAssetStore,
  rows,
  onRowCheckedChange,
}: {
  checkedRowIds: ReadonlySet<string>
  partMatchPrecompute: PartMatchPrecomputeState
  plan: StepCalloutBaggingPlan
  previewAssetStore: PreviewAssetStore
  rows: StepCalloutBagRow[]
  onRowCheckedChange: (rowId: string, checked: boolean) => void
}) {
  const [groupingMode, setGroupingMode] = useState<BagGroupingMode>("bag")
  const [groupSameParts, setGroupSameParts] = useState(false)
  const deferredRows = useDeferredValue(rows)
  const deferredGroupingMode = useDeferredValue(groupingMode)
  const partGroupingReady = partMatchPrecompute.status === "ready"
  const groupPartsAvailable = groupingMode === "bag" && partGroupingReady
  const groupPartsActive = groupPartsAvailable && groupSameParts
  const isLargeChecklist = rows.length > LARGE_BAG_CHECKLIST_ROW_THRESHOLD
  const mountRows =
    !isLargeChecklist || (deferredRows === rows && deferredGroupingMode === groupingMode)
  const groups = useMemo(
    () => createBagChecklistGroups(plan, rows, groupingMode),
    [groupingMode, plan, rows],
  )
  const globalProgress = useMemo(
    () => createProgressSummary(rows, checkedRowIds),
    [checkedRowIds, rows],
  )
  const checkedRowIdsKeyByGroupId = useMemo(
    () => createCheckedBagRowIdsKeyByGroupId(groups, checkedRowIds),
    [checkedRowIds, groups],
  )
  const hasReviewBags = plan.bags.some((bag) => bag.status === "review")
  const renderGroupBody = useCallback(
    ({ checkedRowIds: groupCheckedRowIds, group }: {
      checkedRowIds: ReadonlySet<string>
      group: BagChecklistGroup
    }) => (
      <Stack gap={3}>
        {group.reviewReasons.length > 0 ? (
          <Text color="bagging.warning" fontSize="xs">
            Review: {group.reviewReasons.join(", ")}
          </Text>
        ) : null}

        <BagChecklistTable
          key={createBagChecklistTableKey(groupPartsActive, group.rows)}
          checkedRowIds={groupCheckedRowIds}
          groupSameParts={groupPartsActive}
          partGroups={
            partMatchPrecompute.groupsByBagId.get(group.id) ??
            EMPTY_BAG_CHECKLIST_PART_GROUPS
          }
          partMatchStatus={partMatchPrecompute.status}
          previewAssetStore={previewAssetStore}
          rows={group.rows}
          onRowCheckedChange={onRowCheckedChange}
        />
      </Stack>
    ),
    [
      groupPartsActive,
      onRowCheckedChange,
      partMatchPrecompute.groupsByBagId,
      partMatchPrecompute.status,
      previewAssetStore,
    ],
  )

  return (
    <Stack gap={{ base: 4, md: 3 }} minH={{ base: "360px", md: "520px" }}>
      <HStack align="start" justify="space-between" gap={3}>
        <Stack gap={1} minW={0}>
          <Text fontSize={{ base: "xl", md: "md" }} fontWeight="semibold">
            Bag checklist
          </Text>
          <Text color="bagging.muted" fontSize={{ base: "md", md: "sm" }}>
            {formatBagChecklistSummary(plan)}
          </Text>
        </Stack>
        {hasReviewBags ? <Badge colorPalette="orange">review</Badge> : null}
      </HStack>

      <HStack align="center" justify="space-between" gap={3} flexWrap="wrap">
        <Stack gap={1} flex="1" minW="240px">
          <HStack justify="space-between">
            <Text color="bagging.muted" fontSize="xs" fontWeight="medium">
              Packed
            </Text>
            <Text fontSize="xs" fontWeight="semibold">
              {formatCountRatio(
                globalProgress.checkedQuantity,
                globalProgress.totalQuantity,
                COUNT_LABELS.part,
              )} · {globalProgress.percent}%
            </Text>
          </HStack>
          <BagChecklistProgressBar
            label="Packed progress"
            value={globalProgress.percent}
            valueText={`${globalProgress.percent}% packed`}
          />
        </Stack>

        <Switch.Root
          aria-label="Group bag checklist by color"
          checked={groupingMode === "color"}
          colorPalette="green"
          size="sm"
          onCheckedChange={(details) => {
            setGroupingMode(details.checked ? "color" : "bag")
          }}
        >
          <HStack gap={2}>
            <Text
              color={groupingMode === "bag" ? "bagging.text" : "bagging.muted"}
              fontSize="sm"
              fontWeight={groupingMode === "bag" ? "semibold" : "medium"}
            >
              Bag
            </Text>
            <Switch.HiddenInput role="switch" />
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Text
              color={groupingMode === "color" ? "bagging.text" : "bagging.muted"}
              fontSize="sm"
              fontWeight={groupingMode === "color" ? "semibold" : "medium"}
            >
              Color
            </Text>
          </HStack>
        </Switch.Root>
        <Switch.Root
          aria-label="Group parts inside bags"
          checked={groupPartsActive}
          colorPalette="green"
          disabled={!groupPartsAvailable}
          size="sm"
          onCheckedChange={(details) => {
            if (!groupPartsAvailable) {
              return
            }

            setGroupSameParts(details.checked === true)
          }}
        >
          <HStack gap={2}>
            <Switch.HiddenInput role="switch" />
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Text
              color={groupPartsActive ? "bagging.text" : "bagging.muted"}
              fontSize="sm"
              fontWeight={groupPartsActive ? "semibold" : "medium"}
            >
              Group parts
            </Text>
          </HStack>
        </Switch.Root>
      </HStack>

      {!mountRows ? (
        <Box
          alignItems="center"
          borderColor="moss.100"
          borderRadius="panel"
          borderStyle="dashed"
          borderWidth="1px"
          color="bagging.muted"
          display="flex"
          justifyContent="center"
          minH="240px"
          px={4}
          py={8}
        >
          <Text fontSize="sm">Loading checklist rows</Text>
        </Box>
      ) : (
        <BagChecklistAccordion
          checkedRowIdsKeyByGroupId={checkedRowIdsKeyByGroupId}
          groups={groups}
          isLargeChecklist={isLargeChecklist}
          renderGroupBody={renderGroupBody}
        />
      )}
    </Stack>
  )
}

function BagChecklistTable({
  checkedRowIds,
  groupSameParts,
  partGroups,
  partMatchStatus,
  previewAssetStore,
  rows,
  onRowCheckedChange,
}: {
  checkedRowIds: ReadonlySet<string>
  groupSameParts: boolean
  partGroups: readonly BagChecklistPartGroup[]
  partMatchStatus: PartMatchPrecomputeStatus
  previewAssetStore: PreviewAssetStore
  rows: StepCalloutBagRow[]
  onRowCheckedChange: (rowId: string, checked: boolean) => void
}) {
  const [sort, setSort] = useState<BagChecklistSort>(BAG_CHECKLIST_DEFAULT_SORT)
  const [expandedPartGroupIds, setExpandedPartGroupIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  )
  const [rejectedPartGroupIds, setRejectedPartGroupIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  )
  const [removedPartGroupRowKeys, setRemovedPartGroupRowKeys] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  )
  const checkedSortRowIds = sort.column === "checked" ? checkedRowIds : null
  const sortedRows = useMemo(
    () => sortBagRows(rows, checkedSortRowIds, sort),
    [checkedSortRowIds, rows, sort],
  )
  const groupedItems = useMemo(
    () =>
      groupSameParts && partGroups.length > 0
        ? createPartGroupedTableItems(
            sortedRows,
            partGroups,
            sort,
            checkedSortRowIds,
            expandedPartGroupIds,
            rejectedPartGroupIds,
            removedPartGroupRowKeys,
          )
        : null,
    [
      checkedSortRowIds,
      expandedPartGroupIds,
      groupSameParts,
      partGroups,
      rejectedPartGroupIds,
      removedPartGroupRowKeys,
      sort,
      sortedRows,
    ],
  )
  const showPartGroupPreparing =
    groupSameParts && partMatchStatus === "preparing" && partGroups.length === 0
  const handlePartGroupToggle = (groupId: string) => {
    setExpandedPartGroupIds((currentGroupIds) => {
      const nextGroupIds = new Set(currentGroupIds)

      if (nextGroupIds.has(groupId)) {
        nextGroupIds.delete(groupId)
      } else {
        nextGroupIds.add(groupId)
      }

      return nextGroupIds
    })
  }
  const handlePartGroupReject = (groupId: string) => {
    setRejectedPartGroupIds((currentGroupIds) => new Set(currentGroupIds).add(groupId))
    setExpandedPartGroupIds((currentGroupIds) => {
      const nextGroupIds = new Set(currentGroupIds)
      nextGroupIds.delete(groupId)
      return nextGroupIds
    })
  }
  const handlePartGroupRowRemove = (groupId: string, rowId: string) => {
    setRemovedPartGroupRowKeys((currentKeys) =>
      new Set(currentKeys).add(partGroupRowKey(groupId, rowId))
    )
  }

  return (
    <>
      {showPartGroupPreparing ? (
        <Text color="bagging.muted" fontSize="xs">
          Preparing part groups. Rows stay usable.
        </Text>
      ) : null}
      <BagChecklistRowsTable
        ariaLabel="Bag checklist rows"
        checkedRowIds={checkedRowIds}
        expandedPartGroupIds={expandedPartGroupIds}
        items={groupedItems ?? undefined}
        previewAssetStore={previewAssetStore}
        rows={sortedRows}
        sort={sort}
        onPartGroupReject={handlePartGroupReject}
        onPartGroupRowRemove={handlePartGroupRowRemove}
        onPartGroupToggle={handlePartGroupToggle}
        onRowCheckedChange={onRowCheckedChange}
        onSort={setSort}
      />
    </>
  )
}

function BagChecklistRowsTable({
  ariaLabel,
  checkedRowIds,
  expandedPartGroupIds,
  items,
  onPartGroupReject,
  onPartGroupRowRemove,
  onPartGroupToggle,
  previewAssetStore,
  rows,
  sort,
  onRowCheckedChange,
  onSort,
}: {
  ariaLabel: string
  checkedRowIds: ReadonlySet<string>
  expandedPartGroupIds?: ReadonlySet<string>
  items?: BagChecklistTableItem[]
  previewAssetStore: PreviewAssetStore
  rows: StepCalloutBagRow[]
  sort: BagChecklistSort
  onPartGroupReject?: (groupId: string) => void
  onPartGroupRowRemove?: (groupId: string, rowId: string) => void
  onPartGroupToggle?: (groupId: string) => void
  onRowCheckedChange: (rowId: string, checked: boolean) => void
  onSort: (sort: BagChecklistSort) => void
}) {
  const tableItems: BagChecklistTableItem[] =
    items ?? rows.map((row) => ({ kind: "row", row }))

  return (
    <Box
      borderColor="bagging.border"
      borderRadius="md"
      borderWidth="1px"
      overflowX={{ base: "auto", xl: "visible" }}
      w="full"
    >
      <Box
        as="table"
        aria-label={ariaLabel}
        borderCollapse="separate"
        borderSpacing={0}
        minW={{ base: "752px", xl: 0 }}
        tableLayout="fixed"
        w="full"
      >
        <Box as="thead" bg="bagging.surface.subtle">
          <Box as="tr">
            <Box
              as="th"
              aria-label="Part group controls"
              borderBottomColor="bagging.border"
              borderBottomWidth="1px"
              px={2}
              py={2}
              w="72px"
            />
            <BagSortHeader column="checked" label="Done" sort={sort} onSort={onSort} width="72px" />
            <BagSortHeader column="quantity" label="Quantity" sort={sort} onSort={onSort} width="132px" />
            <Box
              as="th"
              borderBottomColor="bagging.border"
              borderBottomWidth="1px"
              color="bagging.muted"
              fontSize="xs"
              fontWeight="semibold"
              px={2}
              py={2}
              textAlign="left"
              whiteSpace="nowrap"
              w="128px"
            >
              Part preview
            </Box>
            <BagSortHeader column="color" label="Color" sort={sort} onSort={onSort} width="152px" />
            <BagSortHeader column="page" label="Page" sort={sort} onSort={onSort} width="88px" />
            <BagSortHeader column="step" label="Step" sort={sort} onSort={onSort} width="88px" />
          </Box>
        </Box>
        <Box as="tbody">
          {tableItems.map((item) =>
            item.kind === "part-group" ? (
              <BagPartMatchHeaderRow
                key={item.group.group.groupId}
                checkedRowIds={checkedRowIds}
                expanded={expandedPartGroupIds?.has(item.group.group.groupId) ?? false}
                group={item.group}
                groupIndex={item.groupIndex}
                previewAssetStore={previewAssetStore}
                rows={item.rows}
                onReject={onPartGroupReject}
                onToggle={onPartGroupToggle}
                onRowCheckedChange={onRowCheckedChange}
              />
            ) : (
              <BagChecklistTableRow
                key={item.nestedPartGroupId ? `${item.nestedPartGroupId}:${item.row.id}` : item.row.id}
                checked={checkedRowIds.has(item.row.id)}
                nestedInPartGroup={Boolean(item.nestedPartGroupId)}
                nestedPartGroupId={item.nestedPartGroupId}
                nestedPartGroupLane={item.nestedPartGroupLane}
                onPartGroupRowRemove={onPartGroupRowRemove}
                previewAssetStore={previewAssetStore}
                row={item.row}
                onRowCheckedChange={onRowCheckedChange}
              />
            )
          )}
        </Box>
      </Box>
    </Box>
  )
}

const BagPartMatchHeaderRow = memo(function BagPartMatchHeaderRow({
  checkedRowIds,
  expanded,
  group,
  groupIndex,
  onReject,
  onToggle,
  onRowCheckedChange,
  previewAssetStore,
  rows,
}: {
  checkedRowIds: ReadonlySet<string>
  expanded: boolean
  group: BagChecklistPartGroup
  groupIndex: number
  previewAssetStore: PreviewAssetStore
  rows: StepCalloutBagRow[]
  onReject?: (groupId: string) => void
  onToggle?: (groupId: string) => void
  onRowCheckedChange: (rowId: string, checked: boolean) => void
}) {
  const representative = rows[0] ?? group.rows[0]
  const totalQuantity = rows.reduce((total, row) => total + row.quantity, 0)
  const confidence = Math.round(group.group.confidence * 100)
  const checkedCount = rows.filter((row) => checkedRowIds.has(row.id)).length
  const groupChecked = checkedCount === rows.length
    ? true
    : checkedCount > 0
      ? "indeterminate"
      : false
  const Icon = expanded ? ChevronDown : ChevronRight
  const isSuggested = group.lane === "suggested"
  const expandLabel = `${expanded ? "Collapse" : "Expand"} part group ${groupIndex + 1}`
  const rejectLabel = `Reject suggested part group ${groupIndex + 1}`

  if (!representative) {
    return null
  }

  return (
    <Box
      as="tr"
      bg={isSuggested ? "bagging.review.surface" : "bagging.surface.subtle"}
      transition="background 80ms ease"
      _hover={{ bg: isSuggested ? "bagging.review.surface.hover" : "moss.50" }}
    >
      <Box
        as="td"
        borderBottomColor="bagging.border"
        borderBottomWidth="1px"
        px={2}
        py={2}
        textAlign="center"
        verticalAlign="middle"
        w="72px"
      >
        <HStack gap={1} justify="center">
          <IconButtonTooltip label={expandLabel}>
            <IconButton
              aria-expanded={expanded}
              aria-label={expandLabel}
              h="8"
              minW="8"
              size="xs"
              variant="outline"
              onClick={() => onToggle?.(group.group.groupId)}
            >
              <Icon size={15} aria-hidden="true" />
            </IconButton>
          </IconButtonTooltip>
          {isSuggested ? (
            <IconButtonTooltip label={rejectLabel}>
              <IconButton
                aria-label={rejectLabel}
                colorPalette="orange"
                h="8"
                minW="8"
                size="xs"
                variant="ghost"
                onClick={() => onReject?.(group.group.groupId)}
              >
                <X size={14} aria-hidden="true" />
              </IconButton>
            </IconButtonTooltip>
          ) : null}
        </HStack>
      </Box>
      <Box
        as="td"
        borderBottomColor="bagging.border"
        borderBottomWidth="1px"
        px={2}
        py={2}
        textAlign="center"
        verticalAlign="middle"
        w="72px"
      >
        <Checkbox.Root
          aria-label={`Mark part group ${groupIndex + 1} packed`}
          checked={groupChecked}
          colorPalette="green"
          display="inline-flex"
          mx="auto"
          onCheckedChange={(details) => {
            const nextChecked = details.checked === true

            for (const row of rows) {
              if (checkedRowIds.has(row.id) !== nextChecked) {
                onRowCheckedChange(row.id, nextChecked)
              }
            }
          }}
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
        </Checkbox.Root>
      </Box>
      <Box
        as="td"
        borderBottomColor="bagging.border"
        borderBottomWidth="1px"
        color="bagging.text"
        fontSize="sm"
        fontVariantNumeric="tabular-nums"
        px={2}
        py={2}
        textAlign="left"
        verticalAlign="middle"
        w="132px"
      >
        <Text fontWeight="semibold">{totalQuantity}x</Text>
      </Box>
      <Box
        as="td"
        borderBottomColor="bagging.border"
        borderBottomWidth="1px"
        minW="128px"
        px={2}
        py={2}
        verticalAlign="middle"
        w="128px"
      >
        <PreviewCard
          alt={`${representative.bagLabel} part group ${groupIndex + 1} representative crop`}
          imageSize={cropSize(representative.partCrop)}
          imageSizing="original"
          imageDataUrl={representative.partCrop?.imageDataUrl}
          maxZoomScale={PART_ROW_PREVIEW_MAX_ZOOM_SCALE}
          minH="96px"
          partMaskItemId={representative.itemId}
          pendingLabel="Preparing page"
          previewBackground={representative.calloutBackgroundHex}
          previewAssetStore={previewAssetStore}
          regionPreview={createBagPartRegionPreview(representative)}
          thumbnailMaxPixels={PART_ROW_PREVIEW_THUMBNAIL_MAX_SIZE}
        />
      </Box>
      <Box
        as="td"
        borderBottomColor="bagging.border"
        borderBottomWidth="1px"
        color="bagging.text"
        fontSize="sm"
        px={2}
        py={2}
        textAlign="left"
        verticalAlign="middle"
        w="152px"
      >
        <HStack align="center" gap={2}>
          <Box
            aria-hidden="true"
            bg={displayColorSwatchHex(representative.color.name, representative.color.swatchHex) ?? "transparent"}
            borderColor="bagging.border"
            borderRadius="sm"
            borderWidth="1px"
            boxSize="18px"
            flexShrink={0}
          />
          <Stack gap={1} minW={0}>
            <Text fontWeight="semibold" lineClamp={2}>
              {representative.color.name}
            </Text>
          </Stack>
        </HStack>
      </Box>
      <HandleChecklistCell verticalAlign="middle">
        <Stack gap={1}>
          <Text color="bagging.text" fontSize="sm" fontWeight="semibold">
            {formatCount(rows.length, COUNT_LABELS.row)}
          </Text>
          {isSuggested ? (
            <Badge alignSelf="start" colorPalette="orange" size="sm" variant="subtle">
              review
            </Badge>
          ) : null}
          <Text color="bagging.muted" fontSize="xs">
            {confidence}% confidence
          </Text>
        </Stack>
      </HandleChecklistCell>
      <HandleChecklistCell verticalAlign="middle">
        {null}
      </HandleChecklistCell>
    </Box>
  )
})

const BagChecklistTableRow = memo(function BagChecklistTableRow({
  checked,
  nestedInPartGroup = false,
  nestedPartGroupId,
  nestedPartGroupLane,
  onPartGroupRowRemove,
  previewAssetStore,
  row,
  onRowCheckedChange,
}: {
  checked: boolean
  nestedInPartGroup?: boolean
  nestedPartGroupId?: string
  nestedPartGroupLane?: BagChecklistPartGroup["lane"]
  onPartGroupRowRemove?: (groupId: string, rowId: string) => void
  previewAssetStore: PreviewAssetStore
  row: StepCalloutBagRow
  onRowCheckedChange: (rowId: string, checked: boolean) => void
}) {
  const handleCheckedChange = (nextChecked: boolean) => {
    onRowCheckedChange(row.id, nextChecked)
  }
  const nestedGroupBg = nestedInPartGroup
    ? nestedPartGroupLane === "suggested" ? "bagging.review.surface" : "bagging.surface.subtle"
    : undefined
  const removeFromGroupLabel =
    `Remove ${row.bagLabel} page ${row.sourcePageNumber} step ${row.stepIndex} row from suggested part group`

  return (
    <Box
      as="tr"
      bg={nestedGroupBg}
      opacity={checked ? 0.62 : 1}
      transition="opacity 80ms ease, background 80ms ease"
      _hover={{ bg: nestedGroupBg ?? "bagging.surface.subtle" }}
    >
      <Box
        as="td"
        borderBottomColor="bagging.border"
        borderBottomWidth="1px"
        px={2}
        py={2}
        textAlign="center"
        verticalAlign="middle"
        w="72px"
      >
        {nestedPartGroupId && nestedPartGroupLane === "suggested" ? (
          <IconButtonTooltip label={removeFromGroupLabel}>
            <IconButton
              aria-label={removeFromGroupLabel}
              colorPalette="orange"
              h="8"
              minW="8"
              size="xs"
              variant="ghost"
              onClick={() => onPartGroupRowRemove?.(nestedPartGroupId, row.id)}
            >
              <Minus size={14} aria-hidden="true" />
            </IconButton>
          </IconButtonTooltip>
        ) : null}
      </Box>
      <Box
        as="td"
        borderBottomColor="bagging.border"
        borderBottomWidth="1px"
        px={2}
        py={2}
        textAlign="center"
        verticalAlign="middle"
        w="72px"
      >
        <Checkbox.Root
          aria-label={`Mark ${row.bagLabel} page ${row.sourcePageNumber} step ${row.stepIndex} part ${row.itemIndexOnCallout + 1} packed`}
          checked={checked}
          colorPalette="green"
          display="inline-flex"
          mx="auto"
          onCheckedChange={(details) => {
            handleCheckedChange(details.checked === true)
          }}
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
        </Checkbox.Root>
      </Box>
      <QuantityChecklistCell previewAssetStore={previewAssetStore} row={row} />
      <Box
        as="td"
        borderBottomColor="bagging.border"
        borderBottomWidth="1px"
        minW="128px"
        px={2}
        py={2}
        verticalAlign="top"
        w="128px"
      >
        <PreviewCard
          alt={`${row.bagLabel} page ${row.sourcePageNumber} step ${row.stepIndex} part crop`}
          imageSize={cropSize(row.partCrop)}
          imageSizing="original"
          imageDataUrl={row.partCrop?.imageDataUrl}
          maxZoomScale={PART_ROW_PREVIEW_MAX_ZOOM_SCALE}
          minH="96px"
          partMaskItemId={row.itemId}
          pendingLabel="Preparing page"
          previewBackground={row.calloutBackgroundHex}
          previewAssetStore={previewAssetStore}
          regionPreview={createBagPartRegionPreview(row)}
          thumbnailMaxPixels={PART_ROW_PREVIEW_THUMBNAIL_MAX_SIZE}
        />
      </Box>
      <ColorChecklistCell row={row} />
      <HandleChecklistCell>
        <PreviewTextHandle
          label={`Page ${row.sourcePageNumber}`}
          previewAlt={`Page ${row.sourcePageNumber} preview`}
          previewImageDataUrl={row.pagePreview?.imageDataUrl}
          previewAssetStore={previewAssetStore}
          previewPageNumber={row.sourcePageNumber}
        />
      </HandleChecklistCell>
      <HandleChecklistCell>
        <PreviewTextHandle
          label={`Step ${row.stepIndex}`}
          previewAlt={`Step ${row.stepIndex} callout preview`}
          previewImageDataUrl={row.calloutCrop?.imageDataUrl}
          previewAssetStore={previewAssetStore}
          previewRegion={createBagCalloutRegionPreview(row)}
        />
      </HandleChecklistCell>
    </Box>
  )
})

function BagSortHeader({
  column,
  label,
  onSort,
  sort,
  width,
}: {
  column: BagChecklistSortColumn
  label: string
  onSort: (sort: BagChecklistSort) => void
  sort: BagChecklistSort
  width: string
}) {
  const isActive = sort.column === column
  const nextDirection = isActive && sort.direction === "asc" ? "desc" : "asc"
  const Icon = !isActive || sort.direction === "asc" ? ArrowUp : ArrowDown

  return (
    <Box
      as="th"
      aria-sort={bagSortDirectionLabel(sort, column)}
      borderBottomColor="bagging.border"
      borderBottomWidth="1px"
      color="bagging.muted"
      fontSize="xs"
      fontWeight="semibold"
      px={2}
      py={2}
      textAlign="left"
      whiteSpace="nowrap"
      w={width}
    >
      <Box
        as="button"
        aria-label={`Sort bag rows by ${label.toLowerCase()} ${nextDirection === "asc" ? "ascending" : "descending"}`}
        color="inherit"
        cursor="pointer"
        display="flex"
        fontSize="xs"
        fontWeight="semibold"
        gap={1}
        textAlign="left"
        onClick={() =>
          onSort({
            column,
            direction: nextDirection,
          })
        }
      >
        <Text as="span">{label}</Text>
        <Icon size={13} aria-hidden="true" />
      </Box>
    </Box>
  )
}

function QuantityChecklistCell({
  previewAssetStore,
  row,
}: {
  previewAssetStore: PreviewAssetStore
  row: StepCalloutBagRow
}) {
  return (
    <Box
      as="td"
      borderBottomColor="bagging.border"
      borderBottomWidth="1px"
      color="bagging.text"
      fontSize="sm"
      fontVariantNumeric="tabular-nums"
      px={2}
      py={2}
      textAlign="left"
      verticalAlign="top"
      w="132px"
    >
      <Stack gap={2}>
        <HStack gap={2}>
          <Text fontWeight="semibold">{row.quantity}x</Text>
          {row.quantityEstimated ? (
            <Badge colorPalette="orange" size="sm">
              estimated
            </Badge>
          ) : null}
        </HStack>
        <PreviewCard
          alt={`${row.bagLabel} page ${row.sourcePageNumber} step ${row.stepIndex} quantity crop`}
          imageSize={cropSize(row.quantityLabelCrop)}
          imageSizing="original"
          imageDataUrl={row.quantityLabelCrop?.imageDataUrl}
          maxZoomScale={PART_ROW_PREVIEW_MAX_ZOOM_SCALE}
          minH="56px"
          pendingLabel="Preparing page"
          previewAssetStore={previewAssetStore}
          regionPreview={createBagQuantityRegionPreview(row)}
        />
      </Stack>
    </Box>
  )
}

function ColorChecklistCell({ row }: { row: StepCalloutBagRow }) {
  const colorSwatchHex = displayColorSwatchHex(row.color.name, row.color.swatchHex)

  return (
    <Box
      as="td"
      borderBottomColor="bagging.border"
      borderBottomWidth="1px"
      color="bagging.text"
      fontSize="sm"
      px={2}
      py={2}
      textAlign="left"
      verticalAlign="top"
      w="152px"
    >
      <HStack align="start" gap={2}>
        <Box
          aria-hidden="true"
          bg={colorSwatchHex ?? "transparent"}
          borderColor="bagging.border"
          borderRadius="sm"
          borderWidth="1px"
          boxSize="18px"
          data-color-swatch-hex={colorSwatchHex ?? undefined}
          flexShrink={0}
          mt="0.5"
        />
        <Stack gap={0} minW={0}>
          <Text fontWeight="semibold" lineClamp={2}>
            {row.color.name}
          </Text>
          <Badge
            alignSelf="start"
            colorPalette={confidenceBadgePalette(row.color.confidence)}
            size="sm"
            variant="subtle"
          >
            {colorConfidenceLabel(row.color.confidence)}
          </Badge>
        </Stack>
      </HStack>
    </Box>
  )
}

function HandleChecklistCell({
  children,
  verticalAlign = "top",
}: {
  children: ReactNode
  verticalAlign?: "middle" | "top"
}) {
  return (
    <Box
      as="td"
      borderBottomColor="bagging.border"
      borderBottomWidth="1px"
      color="bagging.text"
      fontSize="sm"
      px={2}
      py={2}
      textAlign="left"
      verticalAlign={verticalAlign}
      w="88px"
    >
      {children}
    </Box>
  )
}

export function NoBaggableCalloutsPanel({ plan }: { plan: StepCalloutBaggingPlan }) {
  return (
    <Stack gap={{ base: 4, md: 3 }} minH={{ base: "360px", md: "520px" }}>
      <HStack justify="space-between" align="start">
        <Stack gap={1}>
          <Text fontSize={{ base: "xl", md: "md" }} fontWeight="semibold">
            Bag checklist
          </Text>
          <Text color="bagging.muted" fontSize={{ base: "md", md: "sm" }}>
            {formatCount(plan.detectedStepCount, COUNT_LABELS.callout)} scanned; no part rows can be bagged.
          </Text>
        </Stack>
        <Badge colorPalette="orange">attention</Badge>
      </HStack>

      <Box
        alignItems="center"
        borderColor="moss.100"
        borderRadius="panel"
        borderStyle="dashed"
        borderWidth="1px"
        display="flex"
        flex="1"
        justifyContent="center"
        minH={{ base: "240px", md: "360px" }}
        px={4}
        py={8}
      >
        <Stack align="center" gap={3} maxW="380px" textAlign="center">
          <Box
            alignItems="center"
            bg="bagging.action.subtle"
            borderRadius="full"
            color="bagging.action"
            display="flex"
            h={{ base: "64px", md: "44px" }}
            justifyContent="center"
            w={{ base: "64px", md: "44px" }}
          >
            <PackageCheck size={22} aria-hidden="true" />
          </Box>
          <Text fontSize={{ base: "xl", md: "md" }} fontWeight="semibold">
            No baggable callouts
          </Text>
          <Text color="bagging.muted" fontSize={{ base: "md", md: "sm" }}>
            Bags appear after detected callouts include quantity and part rows.
          </Text>
        </Stack>
      </Box>
    </Stack>
  )
}

function cropSize(crop: { region: { width: number; height: number } } | null) {
  return crop?.region
}

function createBagPartRegionPreview(row: StepCalloutBagRow): RegionPreviewSource | undefined {
  return createBagRegionPreview(row, row.partCrop)
}

function createBagQuantityRegionPreview(row: StepCalloutBagRow): RegionPreviewSource | undefined {
  return createBagRegionPreview(row, row.quantityLabelCrop)
}

function createBagCalloutRegionPreview(row: StepCalloutBagRow): RegionPreviewSource | undefined {
  return createBagRegionPreview(row, row.calloutCrop)
}

function createBagRegionPreview(
  row: StepCalloutBagRow,
  crop: { region: RegionPreviewSource["region"] } | null,
): RegionPreviewSource | undefined {
  if (!crop) {
    return undefined
  }

  return {
    baseHeight: row.anchor.pageRenderHeight ?? row.pagePreview?.height ?? crop.region.y + crop.region.height,
    baseWidth: row.anchor.pageRenderWidth ?? row.pagePreview?.width ?? crop.region.x + crop.region.width,
    pageNumber: row.sourcePageNumber,
    region: crop.region,
  }
}
