import type { ReactNode } from "react"
import { useMemo, useState } from "react"
import { Badge, Box, Button, HStack, Stack, Text } from "@chakra-ui/react"
import { ArrowDown, ArrowUp } from "lucide-react"

type SortDirection = "asc" | "desc"
type SortColumn = "quantity" | "color"

type PartItemsSort = {
  column: SortColumn
  direction: SortDirection
}

export type PartItemsTableRow = {
  colorConfidence: number | null
  colorFamily: string
  colorName: string
  colorSwatchHex: string | null
  id: string
  partRegion?: {
    height: number
    width: number
    x: number
    y: number
  }
  quantityRegion?: {
    height: number
    width: number
    x: number
    y: number
  }
  quantityText: string
  quantityValue: number | null
  quantityPreview: ReactNode
  partPreview: ReactNode
}

const DEFAULT_SORT: PartItemsSort = {
  column: "quantity",
  direction: "asc",
}

const TEXT_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

export function PartItemsTable({
  ariaLabel,
  rows,
}: {
  ariaLabel: string
  rows: PartItemsTableRow[]
}) {
  const [sort, setSort] = useState<PartItemsSort>(DEFAULT_SORT)
  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort])

  return (
    <Box
      borderColor="bagging.border"
      borderRadius="md"
      borderWidth="1px"
      minW={0}
      overflowX="hidden"
      w="full"
    >
      <Box
        as="table"
        aria-label={ariaLabel}
        borderCollapse="separate"
        borderSpacing={0}
        minW={0}
        tableLayout="fixed"
        w="full"
      >
        <Box as="thead" bg="bagging.surface.subtle">
          <Box as="tr">
            <Box
              as="th"
              aria-sort={sortDirectionLabel(sort, "quantity")}
              borderBottomColor="bagging.border"
              borderBottomWidth="1px"
              color="bagging.muted"
              fontSize="xs"
              fontWeight="semibold"
              px={2}
              py={2}
              textAlign="left"
              whiteSpace="nowrap"
              w={{ base: "88px", md: "96px" }}
            >
              <SortButton column="quantity" label="Quantity" sort={sort} onSort={setSort} />
            </Box>
            <PreviewHeader label="Part image" />
            <Box
              as="th"
              aria-sort={sortDirectionLabel(sort, "color")}
              borderBottomColor="bagging.border"
              borderBottomWidth="1px"
              color="bagging.muted"
              fontSize="xs"
              fontWeight="semibold"
              px={2}
              py={2}
              textAlign="left"
              whiteSpace="nowrap"
              w="auto"
            >
              <SortButton column="color" label="Color" sort={sort} onSort={setSort} />
            </Box>
          </Box>
        </Box>

        <Box as="tbody">
          {sortedRows.map((row) => (
            <Box
              key={row.id}
              as="tr"
              _hover={{ bg: "bagging.surface.subtle" }}
              data-v2-part-region={row.partRegion ? JSON.stringify(row.partRegion) : undefined}
              data-v2-part-row={row.id}
              data-v2-quantity-region={row.quantityRegion ? JSON.stringify(row.quantityRegion) : undefined}
              data-v2-quantity-text={row.quantityText}
              data-v2-quantity-value={row.quantityValue ?? undefined}
            >
              <QuantityCell row={row} />
              <PreviewCell>{row.partPreview}</PreviewCell>
              <ColorCell row={row} />
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
}

function SortButton({
  column,
  label,
  onSort,
  sort,
}: {
  column: SortColumn
  label: string
  onSort: (sort: PartItemsSort) => void
  sort: PartItemsSort
}) {
  const isActive = sort.column === column
  const nextDirection = isActive && sort.direction === "asc" ? "desc" : "asc"
  const Icon = !isActive || sort.direction === "asc" ? ArrowUp : ArrowDown

  return (
    <Button
      aria-label={`Sort part rows by ${label.toLowerCase()} ${nextDirection === "asc" ? "ascending" : "descending"}`}
      color="inherit"
      fontSize="xs"
      fontWeight="semibold"
      h="7"
      justifyContent="flex-start"
      minW="0"
      px={1}
      size="xs"
      variant="ghost"
      w="full"
      onClick={() =>
        onSort({
          column,
          direction: nextDirection,
        })
      }
    >
      <HStack gap={1} justify="start" w="full">
        <Text as="span">{label}</Text>
        <Icon size={13} aria-hidden="true" />
      </HStack>
    </Button>
  )
}

function PreviewHeader({ label }: { label: string }) {
  return (
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
      w={{ base: "104px", md: "116px" }}
    >
      {label}
    </Box>
  )
}

function QuantityCell({ row }: { row: PartItemsTableRow }) {
  return (
    <Box
      as="td"
      borderBottomColor="bagging.border"
      borderBottomWidth="1px"
      color="bagging.text"
      fontSize="sm"
      fontVariantNumeric="tabular-nums"
      minW={0}
      px={2}
      py={2}
      textAlign="left"
      verticalAlign="top"
      w={{ base: "88px", md: "96px" }}
    >
      <Stack gap={2}>
        <Text fontWeight="semibold">{quantityValueLabel(row)}</Text>
        {row.quantityPreview}
      </Stack>
    </Box>
  )
}

function ColorCell({ row }: { row: PartItemsTableRow }) {
  return (
    <Box
      as="td"
      borderBottomColor="bagging.border"
      borderBottomWidth="1px"
      color="bagging.text"
      fontSize="sm"
      minW={0}
      px={2}
      py={2}
      textAlign="left"
      verticalAlign="top"
      w="auto"
    >
      <HStack align="start" gap={2}>
        <Box
          aria-hidden="true"
          bg={row.colorSwatchHex ?? "transparent"}
          borderColor="bagging.border"
          borderRadius="sm"
          borderWidth="1px"
          boxSize="18px"
          data-color-swatch-hex={row.colorSwatchHex ?? undefined}
          flexShrink={0}
          mt="0.5"
        />
        <Stack gap={0} minW={0}>
          <Text fontWeight="semibold" overflowWrap="anywhere">
            {row.colorName}
          </Text>
          <ColorConfidenceBadge confidence={row.colorConfidence} />
        </Stack>
      </HStack>
    </Box>
  )
}

function ColorConfidenceBadge({ confidence }: { confidence: number | null }) {
  return (
    <Badge
      alignSelf="start"
      colorPalette={confidenceBadgePalette(confidence)}
      size="sm"
      variant="subtle"
    >
      {colorConfidenceLabel(confidence)}
    </Badge>
  )
}

function PreviewCell({ children }: { children: ReactNode }) {
  return (
    <Box
      as="td"
      borderBottomColor="bagging.border"
      borderBottomWidth="1px"
      minW={0}
      px={2}
      py={2}
      verticalAlign="top"
      w={{ base: "104px", md: "116px" }}
    >
      {children}
    </Box>
  )
}

function sortRows(rows: PartItemsTableRow[], sort: PartItemsSort) {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const compared = compareRows(left.row, right.row, sort)
      return compared === 0 ? left.index - right.index : compared
    })
    .map(({ row }) => row)
}

function compareRows(left: PartItemsTableRow, right: PartItemsTableRow, sort: PartItemsSort) {
  const direction = sort.direction === "asc" ? 1 : -1
  const comparison = sort.column === "color"
    ? compareColorRows(left, right)
    : compareQuantityRows(left, right)

  return direction * comparison
}

function compareQuantityRows(left: PartItemsTableRow, right: PartItemsTableRow) {
  const quantityComparison = compareOptionalNumbers(left.quantityValue, right.quantityValue)

  return quantityComparison === 0
    ? TEXT_COLLATOR.compare(left.quantityText, right.quantityText)
    : quantityComparison
}

function compareColorRows(left: PartItemsTableRow, right: PartItemsTableRow) {
  const familyComparison = TEXT_COLLATOR.compare(left.colorFamily, right.colorFamily)

  if (familyComparison !== 0) {
    return familyComparison
  }

  const nameComparison = TEXT_COLLATOR.compare(left.colorName, right.colorName)

  return nameComparison === 0 ? compareQuantityRows(left, right) : nameComparison
}

function compareOptionalNumbers(left: number | null, right: number | null) {
  if (left === null && right === null) {
    return 0
  }

  if (left === null) {
    return 1
  }

  if (right === null) {
    return -1
  }

  return left - right
}

function sortDirectionLabel(sort: PartItemsSort, column: SortColumn) {
  return sort.column === column
    ? sort.direction === "asc" ? "ascending" : "descending"
    : undefined
}

function quantityValueLabel(row: PartItemsTableRow) {
  return row.quantityValue === null ? row.quantityText || "unknown" : `${row.quantityValue}x`
}

function colorConfidenceLabel(confidence: number | null) {
  return confidence === null ? "confidence n/a" : `${Math.round(confidence * 100)}% confidence`
}

function confidenceBadgePalette(confidence: number | null) {
  if (confidence === null) {
    return "gray"
  }

  if (confidence >= 0.72) {
    return "green"
  }

  if (confidence >= 0.48) {
    return "orange"
  }

  return "red"
}
