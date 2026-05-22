"use client"

import { Badge, Box, Flex, HoverCard, HStack, Image, Portal, Progress, Stack, Text } from "@chakra-ui/react"
import { ImageIcon } from "lucide-react"
import { useMemo, useState } from "react"
import {
  getPartsListPartPreviewKey,
  type PartsListPartPreview,
} from "@/features/bagging/browser-catalogue"
import {
  normalizePartsListRows,
  type NormalizedPartsListRow,
  type PartsListNormalizationSummary,
} from "@/features/bagging/parts-list-normalization"
import { getPartsListRowId } from "@/features/bagging/parts-list-row-id"
import type {
  PartsListExtractionStatus,
  PartsListResolvedColor,
  PartsListFromPageTextResult,
  ParsedPartsListPageRow,
} from "@/features/bagging/parts-list-extraction"
import {
  PartChecklistTable,
  type PartChecklistRow,
  type PartChecklistSortState,
} from "./part-checklist-table"

type ExtractedPartsPanelResult = PartsListFromPageTextResult & {
  extractionMethod?: "native_text" | "ocr" | "none"
  ocrPageCount?: number
}

const statusLabels = {
  needs_attention: "Needs attention",
  supported: "Supported",
  unsupported: "Unsupported",
} satisfies Record<PartsListExtractionStatus, string>

const statusPalettes = {
  needs_attention: "yellow",
  supported: "green",
  unsupported: "red",
} as const satisfies Record<PartsListExtractionStatus, "green" | "red" | "yellow">

type PartsCompletion = {
  completedQuantity: number
  percent: number
  totalQuantity: number
}

const defaultSort = {
  column: "location",
  direction: "asc",
} as const satisfies PartChecklistSortState

const partQuantityFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
})

export function ExtractedPartsPanel({
  checkedRowIds,
  isPartial = false,
  onCheckedRowIdsChange,
  partPreviewByKey = new Map(),
  result,
}: {
  checkedRowIds?: ReadonlySet<string>
  isPartial?: boolean
  onCheckedRowIdsChange?: (checkedRowIds: ReadonlySet<string>) => void
  partPreviewByKey?: ReadonlyMap<string, PartsListPartPreview>
  result: ExtractedPartsPanelResult
}) {
  const normalization = result.normalization ?? normalizePartsListRows(result.rows)

  return (
    <Box
      display="flex"
      flex="1"
      minH="bagging.zero"
      border="sm"
      borderColor="bagging.border"
      bg="white"
      rounded="md"
      p="4"
    >
      <Stack flex="1" minH="bagging.zero" gap="3">
        <HStack justify="space-between" align="start" gap="4">
          <Stack gap="1">
            <Text color="fg.muted" fontSize="sm">
              Parsed bill-of-materials rows from the uploaded manual.
            </Text>
            <Text color="fg.muted" fontSize="xs">
              {getResultSummary(result, isPartial)}
            </Text>
          </Stack>
          <Badge colorPalette={isPartial ? "blue" : statusPalettes[result.status]} variant="subtle" flexShrink={0}>
            {isPartial ? "Updating" : statusLabels[result.status]}
          </Badge>
        </HStack>

        {result.rows.length > 0 ? (
          <>
            <NormalizationSummary normalization={normalization} />
            <ExtractedRows
              checkedRowIds={checkedRowIds}
              normalization={normalization}
              onCheckedRowIdsChange={onCheckedRowIdsChange}
              partPreviewByKey={partPreviewByKey}
              rows={result.rows}
            />
          </>
        ) : (
          <EmptyResult result={result} />
        )}
      </Stack>
    </Box>
  )
}

function ExtractedRows({
  checkedRowIds,
  normalization,
  onCheckedRowIdsChange,
  partPreviewByKey,
  rows,
}: {
  checkedRowIds?: ReadonlySet<string>
  normalization: PartsListNormalizationSummary
  onCheckedRowIdsChange?: (checkedRowIds: ReadonlySet<string>) => void
  partPreviewByKey: ReadonlyMap<string, PartsListPartPreview>
  rows: readonly ParsedPartsListPageRow[]
}) {
  const [localCheckedRowIds, setLocalCheckedRowIds] = useState<ReadonlySet<string>>(new Set())
  const visibleCheckedRowIds = checkedRowIds ?? localCheckedRowIds
  const completion = useMemo(() => getPartsCompletion(rows, visibleCheckedRowIds), [rows, visibleCheckedRowIds])
  const normalizedRowById = useMemo(
    () => new Map(normalization.rows.map((row) => [row.rowId, row] as const)),
    [normalization],
  )
  const tableRows = useMemo(
    () => rows.map((row) =>
      createExtractedPartChecklistRow(row, normalizedRowById.get(getPartsListRowId(row)), partPreviewByKey)
    ),
    [normalizedRowById, partPreviewByKey, rows],
  )

  function updateCheckedRowIds(next: ReadonlySet<string>) {
    if (onCheckedRowIdsChange) {
      onCheckedRowIdsChange(next)
      return
    }

    setLocalCheckedRowIds(next)
  }

  return (
    <Stack
      flex="1"
      gap="2"
      minH="bagging.zero"
    >
      <CompletionIndicator completion={completion} />
      <Stack
        flex="1"
        gap="bagging.none"
        minH="bagging.zero"
        overflowY={{ base: "visible", lg: "auto" }}
      >
        <PartChecklistTable
          checkedRowIds={visibleCheckedRowIds}
          defaultSort={defaultSort}
          headerTestId="extracted-parts-header"
          onCheckedRowIdsChange={updateCheckedRowIds}
          rows={tableRows}
          stickyHeader
        />
      </Stack>
    </Stack>
  )
}

function createExtractedPartChecklistRow(
  row: ParsedPartsListPageRow,
  normalizedRow: NormalizedPartsListRow | undefined,
  partPreviewByKey: ReadonlyMap<string, PartsListPartPreview>,
): PartChecklistRow {
  const rowId = getPartsListRowId(row)
  const partPreview = getPartPreview(row, normalizedRow, partPreviewByKey)
  const partTitle = getPartTitle(row, normalizedRow, partPreview)
  const cataloguePart = normalizedRow?.part ?? row.part
  const color = getPartChecklistColor(row.color)

  return {
    checkboxLabel: `Mark ${row.partNumber} as found`,
    color,
    confidence: row.confidence,
    dataAttributes: {
      "data-color-id": row.color?.id ?? "",
      "data-color-name": row.color?.name ?? "",
      "data-confidence": row.confidence,
      "data-catalogue-part-number": cataloguePart?.cataloguePartNumber ?? "",
      "data-part-number": row.partNumber,
      "data-part-match-kind": cataloguePart?.matchKind ?? "unresolved",
      "data-normalization-status": normalizedRow?.status ?? "",
      "data-source-page": row.sourcePage,
      "data-testid": "extracted-part-row",
    },
    id: rowId,
    image: ({ opacity }) => (
      <PartPreviewImage
        colorName={row.color?.name ?? null}
        opacity={opacity}
        partNumber={partPreview?.partNumber ?? cataloguePart?.cataloguePartNumber ?? row.partNumber}
        preview={partPreview}
      />
    ),
    locationLabel: `Page ${row.sourcePage}`,
    quantity: row.quantity,
    sortValues: {
      color: color.name,
      confidence: row.confidence,
      location: row.sourcePage,
      part: row.partNumber,
    },
    subtitle: partTitle !== row.partNumber ? row.partNumber : undefined,
    title: partTitle,
  }
}

function CompletionIndicator({
  completion,
}: {
  completion: PartsCompletion
}) {
  const completedQuantity = partQuantityFormatter.format(completion.completedQuantity)
  const totalQuantity = partQuantityFormatter.format(completion.totalQuantity)

  return (
    <Stack gap="2" px="3">
      <HStack gap="3" justify="space-between" align="center">
        <Text color="fg.muted" fontSize="sm">
          Parts checked
        </Text>
        <Text data-testid="parts-completion-summary" fontSize="sm" fontWeight="semibold">
          {completion.percent}% checked
        </Text>
      </HStack>
      <Progress.Root value={completion.percent} colorPalette={completion.percent === 100 ? "green" : "yellow"} size="xs">
        <Progress.Track aria-label="Parts checked progress">
          <Progress.Range />
        </Progress.Track>
      </Progress.Root>
      <Text color="fg.muted" fontSize="xs">
        {completedQuantity} of {totalQuantity} parts checked
      </Text>
    </Stack>
  )
}

function NormalizationSummary({
  normalization,
}: {
  normalization: PartsListNormalizationSummary
}) {
  const percent = getNormalizationCoveragePercent(normalization)

  return (
    <HStack
      data-testid="parts-normalization-summary"
      gap="2"
      flexWrap="wrap"
      px="3"
    >
      <Badge colorPalette={normalization.status === "ready" ? "green" : "yellow"} variant="subtle">
        {percent}% normalized
      </Badge>
      {normalization.unresolvedQuantity > 0 ? (
        <Badge colorPalette="orange" variant="subtle">
          {partQuantityFormatter.format(normalization.unresolvedQuantity)} unresolved
        </Badge>
      ) : null}
      {normalization.ambiguousQuantity > 0 ? (
        <Badge colorPalette="yellow" variant="subtle">
          {partQuantityFormatter.format(normalization.ambiguousQuantity)} ambiguous
        </Badge>
      ) : null}
      {normalization.catalogueSnapshotId ? (
        <Text color="fg.muted" fontSize="xs">
          Catalogue {normalization.catalogueSnapshotId.slice(0, 12)}
        </Text>
      ) : null}
    </HStack>
  )
}

export function NormalizationAttentionList({
  rows,
}: {
  rows: readonly NormalizedPartsListRow[]
}) {
  return (
    <Box
      border="sm"
      borderColor="bagging.border"
      bg="bagging.subtleBg"
      data-testid="normalization-attention-list"
      data-normalization-attention-count={rows.length}
      rounded="md"
      p="3"
    >
      <Stack gap="2">
        <HStack justify="space-between" gap="3">
          <Text fontSize="sm" fontWeight="semibold">
            Normalization needs attention
          </Text>
          <Badge colorPalette="orange" variant="solid">
            {rows.length}
          </Badge>
        </HStack>
        <Stack gap="1">
          {rows.map((row) => (
            <Text
              key={row.rowId}
              color="fg.muted"
              data-testid="normalization-attention-row"
              data-normalization-status={row.status}
              data-part-number={row.partNumber}
              data-quantity={row.quantity}
              data-row-id={row.rowId}
              fontSize="xs"
              overflowWrap="anywhere"
            >
              {formatNormalizationAttentionRow(row)}
            </Text>
          ))}
        </Stack>
      </Stack>
    </Box>
  )
}

function getNormalizationCoveragePercent(normalization: PartsListNormalizationSummary) {
  if (normalization.totalQuantity <= 0) {
    return 0
  }

  return Math.round((normalization.resolvedQuantity / normalization.totalQuantity) * 100)
}

function formatNormalizationAttentionRow(row: NormalizedPartsListRow) {
  const partText = row.part?.cataloguePartNumber ?? row.partNumber
  const colorText = row.color?.name ?? "unresolved color"
  const issueText = row.issues.map(formatNormalizationIssue).join(", ")

  return `${row.quantity} x ${partText} ${colorText}, page ${row.sourcePage}: ${issueText}`
}

function formatNormalizationIssue(issue: NormalizedPartsListRow["issues"][number]) {
  switch (issue) {
    case "ambiguous_part":
      return "ambiguous part"
    case "missing_color":
      return "missing color"
    case "missing_part":
      return "missing part"
  }
}

function PartPreviewImage({
  colorName,
  opacity = 1,
  partNumber,
  preview,
}: {
  colorName: string | null
  opacity?: number
  partNumber: string
  preview?: PartsListPartPreview
}) {
  const previewLabel = getPreviewImageAlt({ colorName, partNumber, preview })
  const [failedImageUrls, setFailedImageUrls] = useState<readonly string[]>([])
  const primaryImageUrl = preview?.imageUrl ?? ""
  const imageUrl = primaryImageUrl && !failedImageUrls.includes(primaryImageUrl)
    ? primaryImageUrl
    : preview?.fallbackImageUrl && !failedImageUrls.includes(preview.fallbackImageUrl)
    ? preview.fallbackImageUrl
    : ""

  function handleImageError() {
    if (!imageUrl) {
      return
    }

    setFailedImageUrls((current) => current.includes(imageUrl) ? current : [...current, imageUrl])
  }

  const image = preview && imageUrl ? (
    <Image
      alt={previewLabel}
      src={imageUrl}
      maxW="full"
      maxH="full"
      objectFit="contain"
      loading="eager"
      decoding="async"
      onError={handleImageError}
    />
  ) : (
    <Stack align="center" gap="0.5" color="fg.muted">
      <Box as={ImageIcon} aria-hidden="true" boxSize="4" />
      {preview ? (
        <Text fontSize="2xs" lineHeight="short" textAlign="center">
          No preview
        </Text>
      ) : null}
    </Stack>
  )

  if (!preview) {
    return (
      <Flex
        align="center"
        justify="center"
        w="12"
        h="11"
        bg="bagging.imageBg"
        border="sm"
        borderColor="bagging.border"
        rounded="sm"
        overflow="hidden"
        style={{ opacity, transition: "opacity 120ms ease" }}
      >
        {image}
      </Flex>
    )
  }

  if (!imageUrl) {
    return (
      <Flex
        align="center"
        justify="center"
        w="12"
        h="11"
        bg="bagging.imageBg"
        border="sm"
        borderColor="bagging.border"
        rounded="sm"
        overflow="hidden"
        style={{ opacity, transition: "opacity 120ms ease" }}
      >
        {image}
      </Flex>
    )
  }

  return (
    <HoverCard.Root openDelay={120} closeDelay={80}>
      <HoverCard.Trigger asChild>
        <Flex
          align="center"
          justify="center"
          w="12"
          h="11"
          bg="bagging.imageBg"
          border="sm"
          borderColor="bagging.border"
          rounded="sm"
          overflow="hidden"
          style={{ opacity, transition: "opacity 120ms ease" }}
        >
          {image}
        </Flex>
      </HoverCard.Trigger>
      <Portal>
        <HoverCard.Positioner>
          <HoverCard.Content bg="white" border="sm" borderColor="bagging.border" rounded="md" shadow="lg" p="3" w="56">
            <Stack gap="2">
              <Flex align="center" justify="center" h="40" bg="bagging.imageBg" rounded="sm">
                <Image
                  alt={`${previewLabel} enlarged`}
                  src={imageUrl}
                  maxW="full"
                  maxH="full"
                  objectFit="contain"
                  onError={handleImageError}
                />
              </Flex>
              <Stack gap="bagging.none">
                <Text fontSize="sm" fontWeight="medium" truncate>
                  {preview.name ?? partNumber}
                </Text>
                <Text color="fg.muted" fontSize="xs" truncate>
                  {colorName ? `${partNumber} · ${colorName}` : partNumber}
                </Text>
              </Stack>
            </Stack>
          </HoverCard.Content>
        </HoverCard.Positioner>
      </Portal>
    </HoverCard.Root>
  )
}

function getPreviewImageAlt({
  colorName,
  partNumber,
  preview,
}: {
  colorName: string | null
  partNumber: string
  preview?: PartsListPartPreview
}) {
  const colorPrefix = colorName ? `${partNumber} ${colorName}` : partNumber

  return preview?.name ? `${colorPrefix} ${preview.name}` : `${colorPrefix} part preview`
}

function getPartChecklistColor(color: PartsListResolvedColor | null): PartChecklistRow["color"] {
  const rgb = color?.rgb ?? getFallbackColorRgb(color?.id ?? "")

  return {
    hex: rgb ? `#${rgb}` : null,
    isTransparent: color?.isTransparent,
    name: color?.name ?? "Unresolved color",
    tone: color ? "default" : "warning",
  }
}

function getPartsCompletion(rows: readonly ParsedPartsListPageRow[], checkedRowIds: ReadonlySet<string>) {
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0)
  const completedQuantity = rows.reduce(
    (sum, row) => (checkedRowIds.has(getPartsListRowId(row)) ? sum + row.quantity : sum),
    0,
  )
  const percent = totalQuantity > 0 ? Math.min(100, Math.round((completedQuantity / totalQuantity) * 100)) : 0

  return {
    completedQuantity,
    percent,
    totalQuantity,
  } satisfies PartsCompletion
}

function getPartPreview(
  row: ParsedPartsListPageRow,
  normalizedRow: NormalizedPartsListRow | undefined,
  partPreviewByKey: ReadonlyMap<string, PartsListPartPreview>,
) {
  const colorId = normalizedRow?.color?.id ?? row.color?.id ?? null

  for (const partNumber of getPartPreviewPartNumbers(row, normalizedRow?.part ?? null)) {
    const colorPreview = colorId ? partPreviewByKey.get(getPartsListPartPreviewKey(partNumber, colorId)) : null
    const genericPreview = partPreviewByKey.get(getPartsListPartPreviewKey(partNumber))
    if (colorPreview) {
      return mergeGenericPartPreviewFallback(colorPreview, genericPreview)
    }
    if (genericPreview) {
      return genericPreview
    }
  }

  return undefined
}

function mergeGenericPartPreviewFallback(
  preview: PartsListPartPreview,
  genericPreview: PartsListPartPreview | undefined,
): PartsListPartPreview {
  if (!genericPreview?.imageUrl || preview.fallbackImageUrl || preview.imageUrl === genericPreview.imageUrl) {
    return preview
  }

  return {
    ...preview,
    fallbackImageUrl: genericPreview.imageUrl,
    name: preview.name ?? genericPreview.name,
  }
}

function getPartTitle(
  row: ParsedPartsListPageRow,
  normalizedRow: NormalizedPartsListRow | undefined,
  preview?: PartsListPartPreview,
) {
  return preview?.name ??
    normalizedRow?.part?.name ??
    row.part?.name ??
    normalizedRow?.part?.cataloguePartNumber ??
    row.part?.cataloguePartNumber ??
    row.partNumber
}

function getPartPreviewPartNumbers(
  row: ParsedPartsListPageRow,
  normalizedPart: ParsedPartsListPageRow["part"],
) {
  const partNumbers = new Set<string>()
  if (shouldPreferManualPrintedPart(row, normalizedPart)) {
    partNumbers.add(row.partNumber)
  }
  if (normalizedPart?.cataloguePartNumber) {
    partNumbers.add(normalizedPart.cataloguePartNumber)
  }
  if (row.part?.cataloguePartNumber) {
    partNumbers.add(row.part.cataloguePartNumber)
  }
  partNumbers.add(row.partNumber)

  return [...partNumbers]
}

function shouldPreferManualPrintedPart(
  row: ParsedPartsListPageRow,
  normalizedPart: ParsedPartsListPageRow["part"],
) {
  return row.partNumber !== (normalizedPart?.cataloguePartNumber ?? row.part?.cataloguePartNumber) &&
    isPrintedPartNumber(row.partNumber)
}

function isPrintedPartNumber(partNumber: string) {
  return /^\d+(?:[a-z]|c\d{2})?(?:p|pb|pr|px)\d+$/i.test(partNumber.trim())
}

function getFallbackColorRgb(colorId: string) {
  return fallbackColorRgbById[colorId] ?? null
}

const fallbackColorRgbById: Record<string, string> = {
  "0": "1B1B1B",
  "1": "0055BF",
  "2": "237841",
  "4": "C91A09",
  "6": "583927",
  "14": "F2CD37",
  "15": "FFFFFF",
  "19": "E4CD9E",
  "28": "958A73",
  "34": "84B68D",
  "36": "C91A09",
  "41": "AEEFEC",
  "46": "F5CD2F",
  "47": "FCFCFC",
  "57": "FF800D",
  "70": "582A12",
  "71": "A0A5A9",
  "72": "6C6E68",
  "84": "AA7D55",
  "179": "898788",
  "182": "F08F1C",
  "297": "AA7F2E",
  "321": "078BC9",
  "322": "36AEBF",
  "326": "9B9A5A",
  "378": "A0BCAC",
  "484": "A95500",
  "1103": "3E3C39",
}

function EmptyResult({ result }: { result: ExtractedPartsPanelResult }) {
  return (
    <Box border="sm" borderColor="bagging.border" bg="bagging.subtleBg" rounded="md" p="4">
      <Text color="fg.muted" fontSize="sm">
        {result.reason === "no_candidate_pages"
          ? getNoCandidateMessage(result)
          : "No parseable bill-of-materials rows were found."}
      </Text>
    </Box>
  )
}

function getResultSummary(result: ExtractedPartsPanelResult, isPartial = false) {
  if (result.rows.length === 0) {
    return `${result.candidates.length} candidate pages checked.`
  }

  const lowConfidenceRows = result.lowConfidenceRows.length
  const suffix = lowConfidenceRows > 0 ? ` ${lowConfidenceRows} rows need attention.` : ""
  const source =
    result.extractionMethod === "ocr"
      ? " using OCR"
      : result.extractionMethod === "native_text"
        ? " from native PDF text"
        : ""

  const prefix = isPartial ? "Updating result: " : ""

  return `${prefix}${result.rows.length} rows parsed${source} from ${result.candidates.length} candidate pages.${suffix}`
}

function getNoCandidateMessage(result: ExtractedPartsPanelResult) {
  if (result.ocrPageCount && result.ocrPageCount > 0) {
    return "No bill of materials was detected in the native PDF text or OCR fallback."
  }

  return "No bill of materials was detected in the native PDF text."
}
