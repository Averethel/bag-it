"use client"

import { Badge, Box, Button, Flex, Grid, HStack, Stack, Text } from "@chakra-ui/react"
import { ArrowDown, ArrowUp, ArrowUpDown, Check } from "lucide-react"
import { Fragment, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react"
import { compareColorNames } from "@/features/bagging/color-sort"

export type PartChecklistSortColumn = "color" | "completion" | "confidence" | "location" | "part" | "quantity"
export type PartChecklistSortDirection = "asc" | "desc"
export type PartChecklistSortState = {
  column: PartChecklistSortColumn
  direction: PartChecklistSortDirection
} | null

export type PartChecklistRow = {
  checkboxLabel: string
  color: {
    hex?: string | null
    isTransparent?: boolean
    name: string
    tone?: "default" | "warning"
  }
  confidence?: number | null
  dataAttributes?: Record<`data-${string}`, number | string | undefined>
  dividerLabel?: ReactNode
  id: string
  image: (props: { opacity: number }) => ReactNode
  locationLabel: ReactNode
  quantity: number
  sortValues: {
    color: string
    confidence?: number | null
    location: number | string
    part: string
  }
  subtitle?: ReactNode
  title: ReactNode
}

const rowGridColumns = {
  base: "3rem 2.5rem 3.25rem minmax(0, 1fr) 3.25rem",
  md: "3rem 3rem 3.5rem minmax(0, 1fr) 3.25rem",
}
const rowGridColumnsWithoutConfidence = {
  base: "3rem 2.75rem 3.25rem minmax(0, 1fr)",
  md: "3rem 3.25rem 3.5rem minmax(0, 1fr)",
}
const partDetailsGridColumns = {
  base: "minmax(4.5rem, .65fr) minmax(0, 1.35fr) max-content",
  md: "minmax(5.5rem, .65fr) minmax(0, 1.35fr) max-content",
}

const partChecklistCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

export function PartChecklistTable({
  checkedRowIds,
  defaultSort = null,
  headerTestId,
  locationColumnLabel = "Page",
  onCheckedRowIdsChange,
  plainColumns = [],
  rows,
  showConfidence = true,
  stickyHeader = false,
  titleColumnLabel = "Part",
}: {
  checkedRowIds: ReadonlySet<string>
  defaultSort?: PartChecklistSortState
  headerTestId?: string
  locationColumnLabel?: string
  onCheckedRowIdsChange: (checkedRowIds: ReadonlySet<string>) => void
  plainColumns?: readonly PartChecklistSortColumn[]
  rows: readonly PartChecklistRow[]
  showConfidence?: boolean
  stickyHeader?: boolean
  titleColumnLabel?: string
}) {
  const [sort, setSort] = useState<PartChecklistSortState>(defaultSort)
  const sortedRows = sortPartChecklistRows(rows, sort, checkedRowIds)
  const gridColumns = showConfidence ? rowGridColumns : rowGridColumnsWithoutConfidence
  const plainColumnSet = new Set(plainColumns)

  function updateChecked(rowId: string, checked: boolean) {
    const next = new Set(checkedRowIds)
    if (checked) {
      next.add(rowId)
    } else {
      next.delete(rowId)
    }
    onCheckedRowIdsChange(next)
  }

  function toggleSort(column: PartChecklistSortColumn) {
    if (plainColumnSet.has(column)) {
      return
    }

    setSort((current) => {
      if (current?.column !== column) {
        return { column, direction: "asc" }
      }

      return {
        column,
        direction: current.direction === "asc" ? "desc" : "asc",
      }
    })
  }

  return (
    <Stack
      data-testid="part-checklist-table"
      gap="bagging.none"
      border="sm"
      borderColor="bagging.border"
      rounded="sm"
      overflowX="hidden"
      overflowY="visible"
    >
      <Grid
        data-testid={headerTestId}
        templateColumns={gridColumns}
        gap="3"
        alignItems="center"
        bg="bagging.subtleBg"
        color="fg.muted"
        fontSize="xs"
        fontWeight="semibold"
        px="3"
        py="2"
        position={stickyHeader ? "sticky" : undefined}
        top={stickyHeader ? "bagging.none" : undefined}
        zIndex={stickyHeader ? "docked" : undefined}
      >
        {plainColumnSet.has("completion") ? (
          <HeaderLabel label="Done" />
        ) : (
          <SortHeader column="completion" label="Done" sortLabel="completion" sort={sort} onSort={toggleSort} />
        )}
        {plainColumnSet.has("quantity") ? (
          <HeaderLabel label="Qty" />
        ) : (
          <SortHeader column="quantity" label="Qty" sort={sort} onSort={toggleSort} />
        )}
        <HeaderLabel label="Image" />
        <PartDetailsHeader
          locationColumnLabel={locationColumnLabel}
          plainColumns={plainColumnSet}
          sort={sort}
          titleColumnLabel={titleColumnLabel}
          onSort={toggleSort}
        />
        {showConfidence ? (
          plainColumnSet.has("confidence") ? (
            <HeaderLabel gridColumn="5" label="Conf." />
          ) : (
            <SortHeader
              column="confidence"
              label="Conf."
              sort={sort}
              gridColumn="5"
              onSort={toggleSort}
            />
          )
        ) : null}
      </Grid>

      {sortedRows.map((row) => (
        <Fragment key={row.id}>
          {row.dividerLabel ? (
            <PartChecklistTableGroupDivider
              gridColumns={gridColumns}
              label={row.dividerLabel}
              showConfidence={showConfidence}
            />
          ) : null}
          <PartChecklistTableRow
            gridColumns={gridColumns}
            isChecked={checkedRowIds.has(row.id)}
            row={row}
            showConfidence={showConfidence}
            onCheckedChange={(checked) => updateChecked(row.id, checked)}
          />
        </Fragment>
      ))}
    </Stack>
  )
}

function PartChecklistTableGroupDivider({
  gridColumns,
  label,
  showConfidence,
}: {
  gridColumns: typeof rowGridColumns | typeof rowGridColumnsWithoutConfidence
  label: ReactNode
  showConfidence: boolean
}) {
  return (
    <Grid
      data-testid="part-checklist-group-divider"
      templateColumns={gridColumns}
      borderTop="sm"
      borderColor="bagging.rowBorder"
      bg="bagging.subtleBg"
      px="3"
      py="1.5"
    >
      <Text
        gridColumn={showConfidence ? "1 / 6" : "1 / 5"}
        color="fg.muted"
        fontSize="2xs"
        fontWeight="semibold"
        textTransform="uppercase"
      >
        {label}
      </Text>
    </Grid>
  )
}

function PartDetailsHeader({
  locationColumnLabel,
  onSort,
  plainColumns,
  sort,
  titleColumnLabel,
}: {
  locationColumnLabel: string
  onSort: (column: PartChecklistSortColumn) => void
  plainColumns: ReadonlySet<PartChecklistSortColumn>
  sort: PartChecklistSortState
  titleColumnLabel: string
}) {
  return (
    <Grid templateColumns={partDetailsGridColumns} gap="3" minW="bagging.zero" alignItems="center">
      {plainColumns.has("part") ? (
        <HeaderLabel label={titleColumnLabel} />
      ) : (
        <SortHeader column="part" label={titleColumnLabel} sort={sort} onSort={onSort} />
      )}
      {plainColumns.has("color") ? (
        <HeaderLabel label="Color" />
      ) : (
        <SortHeader column="color" label="Color" sort={sort} onSort={onSort} />
      )}
      {plainColumns.has("location") ? (
        <HeaderLabel label={locationColumnLabel} />
      ) : (
        <SortHeader column="location" label={locationColumnLabel} sort={sort} onSort={onSort} />
      )}
    </Grid>
  )
}

function HeaderLabel({
  gridColumn,
  gridRow,
  label,
}: {
  gridColumn?: ComponentProps<typeof Box>["gridColumn"]
  gridRow?: ComponentProps<typeof Box>["gridRow"]
  label: string
}) {
  return (
    <Box gridColumn={gridColumn} gridRow={gridRow} minW="bagging.zero">
      <Flex align="center" h="7" minW="bagging.zero" px="1">
        <Text as="span" truncate>
          {label}
        </Text>
      </Flex>
    </Box>
  )
}

function SortHeader({
  column,
  gridColumn,
  gridRow,
  label,
  onSort,
  sort,
  sortLabel,
}: {
  column: PartChecklistSortColumn
  gridColumn?: ComponentProps<typeof Box>["gridColumn"]
  gridRow?: ComponentProps<typeof Box>["gridRow"]
  label: string
  onSort: (column: PartChecklistSortColumn) => void
  sort: PartChecklistSortState
  sortLabel?: string
}) {
  const isActive = sort?.column === column
  const nextDirection = isActive && sort.direction === "asc" ? "descending" : "ascending"
  const accessibleLabel = sortLabel ?? label
  const Icon = isActive ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <Box gridColumn={gridColumn} gridRow={gridRow} minW="bagging.zero" flexShrink={0}>
      <Button
        aria-label={`Sort by ${accessibleLabel} ${nextDirection}`}
        color="fg.muted"
        fontSize="xs"
        fontWeight="semibold"
        h="7"
        justifyContent="flex-start"
        minW="bagging.zero"
        px="1"
        title={`Sort by ${accessibleLabel} ${nextDirection}`}
        type="button"
        variant="ghost"
        onClick={() => onSort(column)}
      >
        <Text as="span" truncate>
          {label}
        </Text>
        <Box as={Icon} aria-hidden="true" boxSize="3.5" flexShrink={0} />
      </Button>
    </Box>
  )
}

function PartChecklistTableRow({
  gridColumns,
  isChecked,
  onCheckedChange,
  row,
  showConfidence,
}: {
  gridColumns: typeof rowGridColumns | typeof rowGridColumnsWithoutConfidence
  isChecked: boolean
  onCheckedChange: (checked: boolean) => void
  row: PartChecklistRow
  showConfidence: boolean
}) {
  const rowContentOpacity = isChecked ? 0.58 : 1
  function toggleChecked() {
    onCheckedChange(!isChecked)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== " " && event.key !== "Enter") {
      return
    }

    event.preventDefault()
    toggleChecked()
  }

  return (
    <Grid
      aria-label={row.checkboxLabel}
      aria-checked={isChecked}
      data-testid="part-checklist-row"
      data-quantity={row.quantity}
      data-row-id={row.id}
      data-selected={isChecked ? "true" : "false"}
      role="checkbox"
      tabIndex={0}
      templateColumns={gridColumns}
      gap="3"
      alignItems="center"
      borderTop="sm"
      borderColor="bagging.rowBorder"
      bg={isChecked ? "bagging.subtleBg" : "white"}
      px="3"
      py="3"
      textAlign="start"
      w="full"
      onClick={toggleChecked}
      onKeyDown={handleKeyDown}
      _hover={{
        bg: isChecked ? "bagging.imageBg" : "bagging.subtleBg",
      }}
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "bagging.accent",
        outlineOffset: "-2px",
      }}
      style={{
        cursor: "pointer",
        transition: "background-color 120ms ease",
      }}
      {...row.dataAttributes}
    >
      <PartFoundControl checked={isChecked} />
      <Text fontWeight="semibold" style={{ opacity: rowContentOpacity, transition: "opacity 120ms ease" }}>
        {row.quantity}
      </Text>
      {row.image({ opacity: rowContentOpacity })}
      <Grid
        data-testid="part-row-details"
        templateColumns={partDetailsGridColumns}
        columnGap="3"
        rowGap="1"
        alignItems="center"
        minW="bagging.zero"
        style={{ opacity: rowContentOpacity, transition: "opacity 120ms ease" }}
      >
        <Text gridColumn="1 / -1" fontWeight="medium" lineHeight="short" overflowWrap="anywhere">
          {row.title}
        </Text>
        {row.subtitle ? (
          <Text color="fg.muted" fontSize="xs" overflowWrap="anywhere">
            {row.subtitle}
          </Text>
        ) : (
          <Box aria-hidden="true" minW="bagging.zero" />
        )}
        <PartChecklistColorCell color={row.color} />
        <Box color="fg.muted" fontSize="sm" whiteSpace="normal">
          {row.locationLabel}
        </Box>
      </Grid>
      {showConfidence && row.confidence != null ? (
        <Badge
          gridColumn="5"
          justifySelf="start"
          justifyContent="center"
          colorPalette={row.confidence >= 0.9 ? "green" : "yellow"}
          fontSize="2xs"
          px="1"
          style={{ opacity: rowContentOpacity, transition: "opacity 120ms ease" }}
          variant="subtle"
        >
          {Math.round(row.confidence * 100)}%
        </Badge>
      ) : null}
    </Grid>
  )
}

function PartFoundControl({ checked }: { checked: boolean }) {
  return (
    <Flex
      aria-hidden="true"
      align="center"
      justify="center"
      boxSize="5"
      border="sm"
      borderColor={checked ? "bagging.accent" : "bagging.borderStrong"}
      bg={checked ? "bagging.accent" : "bg"}
      color="white"
      rounded="sm"
    >
      {checked ? (
        <Box as={Check} aria-hidden="true" boxSize="3.5" flexShrink={0} strokeWidth={3} />
      ) : null}
    </Flex>
  )
}

function PartChecklistColorCell({
  color,
}: {
  color: PartChecklistRow["color"]
}) {
  return (
    <HStack
      gap="2"
      minW="bagging.zero"
      color={color.tone === "warning" ? "orange.fg" : "fg"}
    >
      <PartChecklistColorSwatch color={color} />
      <Text fontSize="sm" truncate>
        {color.name}
      </Text>
    </HStack>
  )
}

function PartChecklistColorSwatch({ color }: { color: PartChecklistRow["color"] }) {
  return (
    <Box
      data-testid="color-swatch"
      aria-hidden="true"
      boxSize="3.5"
      rounded="sm"
      border="sm"
      borderColor="blackAlpha.300"
      flexShrink={0}
      bg={color.hex ? undefined : "bagging.border"}
      style={{
        backgroundColor: color.hex ?? undefined,
        backgroundImage: color.isTransparent
          ? [
              "linear-gradient(45deg,",
              "rgba(255,255,255,.7) 25%,",
              "transparent 25%,",
              "transparent 50%,",
              "rgba(255,255,255,.7) 50%,",
              "rgba(255,255,255,.7) 75%,",
              "transparent 75%,",
              "transparent)",
            ].join(" ")
          : undefined,
        backgroundSize: color.isTransparent ? "6px 6px" : undefined,
      }}
    />
  )
}

function sortPartChecklistRows(
  rows: readonly PartChecklistRow[],
  sort: PartChecklistSortState,
  checkedRowIds: ReadonlySet<string>,
) {
  if (!sort) {
    return rows
  }

  return rows
    .map((row, index) => ({ index, row }))
    .sort((left, right) => {
      const sorted = comparePartChecklistRows(left.row, right.row, sort.column, checkedRowIds)
      const direction = sort.direction === "asc" ? 1 : -1

      return sorted * direction || left.index - right.index
    })
    .map(({ row }) => row)
}

function comparePartChecklistRows(
  left: PartChecklistRow,
  right: PartChecklistRow,
  column: PartChecklistSortColumn,
  checkedRowIds: ReadonlySet<string>,
) {
  switch (column) {
    case "color":
      return compareColorNames(left.sortValues.color, right.sortValues.color)
    case "completion":
      return Number(checkedRowIds.has(left.id)) - Number(checkedRowIds.has(right.id))
    case "confidence":
      return (left.sortValues.confidence ?? 0) - (right.sortValues.confidence ?? 0)
    case "location":
      return compareChecklistSortValues(left.sortValues.location, right.sortValues.location)
    case "part":
      return partChecklistCollator.compare(left.sortValues.part, right.sortValues.part)
    case "quantity":
      return left.quantity - right.quantity
  }
}

function compareChecklistSortValues(left: number | string, right: number | string) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right
  }

  return partChecklistCollator.compare(String(left), String(right))
}
