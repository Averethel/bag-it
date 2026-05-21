"use client"

import { Accordion, Badge, Box, HStack, Image, SimpleGrid, Stack, Text } from "@chakra-ui/react"
import type { ReactNode } from "react"
import type {
  PartsListExtractionStatus,
  PartsListFromPageTextResult,
  PartsListPageCandidate,
  PartsListPageDebugText,
  PartsListSourceImage,
  PartsListSourceRegion,
  ParsedPartsListPageRow,
} from "@/features/bagging/parts-list-extraction"
import type { PdfPrivatePageRender } from "@/features/bagging/pdf-intake"

type PartsListDebugPanelResult = PartsListFromPageTextResult & {
  extractionMethod?: "native_text" | "ocr" | "none"
  extractionTimings?: {
    nativeTextMs?: number
    ocrDetectionMs?: number
    ocrCandidateProcessingMs?: number
    ocrResultParseMs?: number
    ocrRefinementMs?: number
    sourceOrderedProgressMs?: number
    totalMs?: number
  }
  extractorVersion?: string
  nativeTextPageCount?: number
  ocrPageCount?: number
}
type PartsListDebugPanelPlacement = "main" | "sidebar"

const statusPalettes = {
  needs_attention: "yellow",
  supported: "green",
  unsupported: "red",
} as const satisfies Record<PartsListExtractionStatus, "green" | "red" | "yellow">

const regionColors = {
  part: "#3182ce",
  row: "#e53e3e",
} as const

export function PartsListDebugPanel({
  pageRenders = [],
  placement = "main",
  result,
}: {
  pageRenders?: readonly PdfPrivatePageRender[]
  placement?: PartsListDebugPanelPlacement
  result: PartsListDebugPanelResult
}) {
  const pageRenderByNumber = new Map(pageRenders.map((pageRender) => [pageRender.pageNumber, pageRender]))
  const pageTextByNumber = new Map(result.debugPageTexts?.map((pageText) => [pageText.pageNumber, pageText]))
  const lowConfidenceRowKeys = new Set(result.lowConfidenceRows.map((row) => getDebugRowKey(row, "state")))
  const isSidebar = placement === "sidebar"

  return (
    <Box
      data-placement={placement}
      data-testid="parts-list-extraction-performance"
      data-extraction-native-text-ms={result.extractionTimings?.nativeTextMs ?? undefined}
      data-extraction-ocr-detection-ms={result.extractionTimings?.ocrDetectionMs ?? undefined}
      data-extraction-ocr-candidate-processing-ms={result.extractionTimings?.ocrCandidateProcessingMs ?? undefined}
      data-extraction-ocr-result-parse-ms={result.extractionTimings?.ocrResultParseMs ?? undefined}
      data-extraction-ocr-refinement-ms={result.extractionTimings?.ocrRefinementMs ?? undefined}
      data-extraction-source-ordered-progress-ms={result.extractionTimings?.sourceOrderedProgressMs ?? undefined}
      data-extraction-total-ms={result.extractionTimings?.totalMs ?? undefined}
      border="sm"
      borderColor="bagging.border"
      bg="white"
      maxH={isSidebar ? { lg: "bagging.partListMax" } : undefined}
      overflowY={isSidebar ? { base: "visible", lg: "auto" } : undefined}
      rounded="md"
      p={isSidebar ? "3" : "4"}
    >
      <Stack gap={isSidebar ? "4" : "5"}>
        <HStack justify="space-between" align="start" gap="4">
          <Stack gap="1">
            <Text fontWeight="semibold">Extraction diagnostics</Text>
            <Text color="fg.muted" fontSize="xs">
              {getDebugSummary(result)}
            </Text>
          </Stack>
          <Badge colorPalette={statusPalettes[result.status]} variant="subtle" flexShrink={0}>
            {result.status.replace("_", " ")}
          </Badge>
        </HStack>

        {result.extractionTimings ? (
          <SimpleGrid columns={isSidebar ? 1 : { base: 2, md: 3, xl: 7 }} gap="2">
            <DebugMetric label="Total" value={`${result.extractionTimings.totalMs ?? 0}ms`} />
            <DebugMetric label="Native text" value={`${result.extractionTimings.nativeTextMs ?? 0}ms`} />
            <DebugMetric label="OCR detect" value={`${result.extractionTimings.ocrDetectionMs ?? 0}ms`} />
            <DebugMetric
              label="OCR candidates"
              value={`${result.extractionTimings.ocrCandidateProcessingMs ?? 0}ms`}
            />
            <DebugMetric label="OCR parse" value={`${result.extractionTimings.ocrResultParseMs ?? 0}ms`} />
            <DebugMetric label="OCR refine" value={`${result.extractionTimings.ocrRefinementMs ?? 0}ms`} />
            <DebugMetric
              label="Row publish"
              value={`${result.extractionTimings.sourceOrderedProgressMs ?? 0}ms`}
            />
          </SimpleGrid>
        ) : null}

        <DebugSection title="Candidate pages">
          {result.candidates.length > 0 ? (
            <Accordion.Root multiple defaultValue={[]} lazyMount>
              <Stack gap="3">
                {sortCandidatesByPage(result.candidates).map((candidate) => (
                  <CandidatePageCard
                    key={`${candidate.searchTier}-${candidate.pageNumber}`}
                    candidate={candidate}
                    lowConfidenceRowKeys={lowConfidenceRowKeys}
                    placement={placement}
                    pageRender={pageRenderByNumber.get(candidate.pageNumber) ?? null}
                    pageText={pageTextByNumber.get(candidate.pageNumber) ?? null}
                    rows={result.rows.filter((row) => row.sourcePage === candidate.pageNumber)}
                  />
                ))}
              </Stack>
            </Accordion.Root>
          ) : (
            <EmptyDebugText>No candidate pages.</EmptyDebugText>
          )}
        </DebugSection>
      </Stack>
    </Box>
  )
}

function CandidatePageCard({
  candidate,
  lowConfidenceRowKeys,
  placement,
  pageRender,
  pageText,
  rows,
}: {
  candidate: PartsListPageCandidate
  lowConfidenceRowKeys: ReadonlySet<string>
  placement: PartsListDebugPanelPlacement
  pageRender: PdfPrivatePageRender | null
  pageText: PartsListPageDebugText | null
  rows: readonly ParsedPartsListPageRow[]
}) {
  const sortedRows = sortRowsByPage(rows)
  const ocr = pageText?.diagnostics?.ocr
  const isSidebar = placement === "sidebar"

  return (
    <Accordion.Item
      data-testid="debug-candidate-page"
      data-page-number={candidate.pageNumber}
      data-ocr-dense-crop-image-count={ocr?.denseCropImageCount ?? undefined}
      data-ocr-dense-crop-recognize-ms={ocr?.denseCropRecognizeMs ?? undefined}
      data-ocr-full-page-recognize-ms={ocr?.fullPageRecognizeMs ?? undefined}
      data-ocr-recognize-call-count={ocr?.recognizeCallCount ?? undefined}
      data-ocr-recognize-ms={ocr?.recognizeMs ?? undefined}
      data-ocr-render-ms={ocr?.renderMs ?? undefined}
      value={`page-${candidate.pageNumber}-${candidate.searchTier}`}
      border="sm"
      borderColor="bagging.rowBorder"
      rounded="md"
      overflow="hidden"
    >
      <Accordion.ItemTrigger px="3" py="3">
        <HStack flex="1" justify="space-between" gap="3" textAlign="start">
          <Stack gap="bagging.none" minW="bagging.zero">
            <Text fontWeight="semibold" fontSize="sm">
              Page {candidate.pageNumber}
            </Text>
            <Text color="fg.muted" fontSize="xs">
              score {candidate.score.toFixed(2)}
              {" · "}
              {candidate.anchorCount} anchors
              {" · "}
              {candidate.searchTier}
            </Text>
          </Stack>
          <Badge colorPalette={pageRender?.dataUrl ? "green" : "yellow"} variant="subtle" flexShrink={0}>
            {rows.length} rows
          </Badge>
        </HStack>
        <Accordion.ItemIndicator />
      </Accordion.ItemTrigger>

      <Accordion.ItemContent>
        <Accordion.ItemBody px="3" pb="3">
          <Stack gap="3">
            <SimpleGrid columns={isSidebar ? 1 : { base: 2, md: 4 }} gap="2">
              <DebugMetric label="Score" value={candidate.score.toFixed(2)} />
              <DebugMetric label="Rows" value={String(candidate.rowCount)} />
              <DebugMetric label="Anchors" value={String(candidate.anchorCount)} />
              <DebugMetric label="Tier" value={candidate.searchTier} />
            </SimpleGrid>

            {pageRender?.dataUrl ? (
              <Stack gap="2">
                <RegionLegend />
                <FullPagePreview pageNumber={candidate.pageNumber} pageRender={pageRender} rows={sortedRows} />
              </Stack>
            ) : (
              <EmptyDebugText>No preview available for page {candidate.pageNumber}.</EmptyDebugText>
            )}

            <PageTextDebug pageText={pageText} placement={placement} />

            <Stack gap="2">
              <Text color="fg.muted" fontSize="xs" fontWeight="semibold" textTransform="uppercase">
                Rows on page
              </Text>
              {sortedRows.length > 0 ? (
                <Stack gap="2" data-testid="debug-page-rows">
                  {sortedRows.map((row) => (
                    <DebugPartRow
                      key={getDebugRowKey(row, "page-row")}
                      isLowConfidence={lowConfidenceRowKeys.has(getDebugRowKey(row, "state"))}
                      placement={placement}
                      pageRender={pageRender}
                      row={row}
                    />
                  ))}
                </Stack>
              ) : (
                <EmptyDebugText>No parsed rows on this page.</EmptyDebugText>
              )}
            </Stack>
          </Stack>
        </Accordion.ItemBody>
      </Accordion.ItemContent>
    </Accordion.Item>
  )
}

function PageTextDebug({
  pageText,
  placement,
}: {
  pageText: PartsListPageDebugText | null
  placement: PartsListDebugPanelPlacement
}) {
  const rawText = pageText?.rawText?.trim()
  const parsedText = pageText?.text.trim()
  const displayText = rawText || parsedText
  const ocr = pageText?.diagnostics?.ocr
  const isSidebar = placement === "sidebar"

  return (
    <Stack gap="2">
      <HStack justify="space-between" gap="2">
        <Text color="fg.muted" fontSize="xs" fontWeight="semibold" textTransform="uppercase">
          Raw page OCR text
        </Text>
        {pageText ? (
          <Badge colorPalette="gray" variant="subtle">
            {pageText.rowSourceCount} row sources
          </Badge>
        ) : null}
      </HStack>
      {ocr ? (
        <SimpleGrid columns={isSidebar ? 1 : { base: 1, md: 2, xl: 6 }} gap="2">
          <DebugMetric label="OCR render" value={`${ocr.renderedWidth} x ${ocr.renderedHeight} ocr_pixel`} />
          <DebugMetric label="OCR max width" value={String(ocr.maxPageWidth)} />
          <DebugMetric label="OCR engine" value={ocr.engine} />
          <DebugMetric label="OCR pipeline" value={ocr.pipeline} />
          <DebugMetric label="OCR input" value={ocr.inputKind} />
          <DebugMetric label="OCR timing" value={`${ocr.renderMs}ms render, ${ocr.recognizeMs}ms OCR`} />
          {ocr.recognizeCallCount ? (
            <DebugMetric label="OCR calls" value={`${ocr.recognizeCallCount} calls`} />
          ) : null}
          {ocr.fullPageRecognizeMs != null ? (
            <DebugMetric label="OCR full page" value={`${ocr.fullPageRecognizeMs}ms`} />
          ) : null}
          {ocr.denseCropImageCount ? (
            <DebugMetric
              label="OCR crop retry"
              value={`${ocr.denseCropImageCount} crops, ${ocr.denseCropRecognizeMs ?? 0}ms`}
            />
          ) : null}
        </SimpleGrid>
      ) : null}
      {displayText ? (
        <Box
          data-testid="debug-page-ocr-text"
          border="sm"
          borderColor="bagging.rowBorder"
          bg="bagging.subtleBg"
          maxH="48"
          overflowY="auto"
          rounded="sm"
          p="2"
        >
          <Text as="pre" color="fg.muted" fontFamily="mono" fontSize="xs" whiteSpace="pre-wrap">
            {displayText}
          </Text>
        </Box>
      ) : (
        <EmptyDebugText>No raw OCR text captured for this page.</EmptyDebugText>
      )}
    </Stack>
  )
}

function RegionLegend() {
  return (
    <HStack data-testid="debug-region-legend" gap="3" flexWrap="wrap">
      <RegionLegendItem color={regionColors.row} label="Red: OCR row" />
      <RegionLegendItem color={regionColors.part} label="Blue: inferred part image candidate" />
    </HStack>
  )
}

function RegionLegendItem({ color, label }: { color: string; label: string }) {
  return (
    <HStack gap="1.5">
      <Box aria-hidden="true" w="4" h="3" rounded="xs" style={{ border: `2px solid ${color}` }} />
      <Text color="fg.muted" fontSize="xs">
        {label}
      </Text>
    </HStack>
  )
}

function FullPagePreview({
  pageNumber,
  pageRender,
  rows,
}: {
  pageNumber: number
  pageRender: PdfPrivatePageRender
  rows: readonly ParsedPartsListPageRow[]
}) {
  return (
    <Box overflowX="auto" maxW="full">
      <Box position="relative" maxW="full" style={{ width: `${pageRender.width}px` }}>
        <Image
          alt={`Manual page ${pageNumber} preview`}
          data-testid="debug-manual-preview-image"
          src={pageRender.dataUrl ?? ""}
          w="full"
          display="block"
          border="sm"
          borderColor="bagging.rowBorder"
          rounded="sm"
        />
        {rows.map((row) => (
          <ManualPreviewRowOverlays key={getDebugRowKey(row, "preview")} row={row} />
        ))}
      </Box>
    </Box>
  )
}

function ManualPreviewRowOverlays({ row }: { row: ParsedPartsListPageRow }) {
  return (
    <>
      <ManualPreviewOverlay
        kind="row"
        partNumber={row.partNumber}
        region={row.sourceRegion ?? null}
        sourceImage={row.sourceImage ?? null}
      />
      <ManualPreviewOverlay
        kind="part"
        partNumber={row.partNumber}
        region={row.partThumbnailRegion ?? null}
        sourceImage={row.sourceImage ?? null}
      />
    </>
  )
}

function ManualPreviewOverlay({
  kind,
  partNumber,
  region,
  sourceImage,
}: {
  kind: "part" | "row"
  partNumber: string
  region: PartsListSourceRegion | null
  sourceImage: PartsListSourceImage | null
}) {
  if (!region || !sourceImage || sourceImage.width <= 0 || sourceImage.height <= 0) {
    return null
  }

  const left = toBoundedPercent(region.x, sourceImage.width)
  const top = toBoundedPercent(region.y, sourceImage.height)
  const width = Math.min(100 - left, toBoundedPercent(region.width, sourceImage.width))
  const height = Math.min(100 - top, toBoundedPercent(region.height, sourceImage.height))
  const color = regionColors[kind]

  return (
    <Box
      aria-hidden="true"
      data-testid={`debug-${kind}-region-overlay`}
      data-part-number={partNumber}
      data-region-kind={kind}
      position="absolute"
      pointerEvents="none"
      title={`${kind} region for ${partNumber}`}
      style={{
        border: `2px solid ${color}`,
        borderRadius: "2px",
        height: `${height}%`,
        left: `${left}%`,
        top: `${top}%`,
        width: `${width}%`,
      }}
    />
  )
}

function DebugSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <Stack gap="2">
      <Text color="fg.muted" fontSize="xs" fontWeight="semibold" textTransform="uppercase">
        {title}
      </Text>
      {children}
    </Stack>
  )
}

function DebugPartRow({
  isLowConfidence = false,
  placement,
  pageRender,
  row,
}: {
  isLowConfidence?: boolean
  placement: PartsListDebugPanelPlacement
  pageRender: PdfPrivatePageRender | null
  row: ParsedPartsListPageRow
}) {
  const sourceRegion = formatRegion(row.sourceRegion ?? null)
  const thumbnailRegion = formatRegion(row.partThumbnailRegion ?? null)
  const rawTokens = row.sourceTokens?.join(" | ") || "none"
  const isSidebar = placement === "sidebar"

  return (
    <Stack
      data-testid="debug-part-row"
      data-part-number={row.partNumber}
      data-source-kind={row.sourceKind ?? "unknown"}
      data-source-page={row.sourcePage}
      data-source-region={sourceRegion}
      gap="2"
      border="sm"
      borderColor={isLowConfidence ? "yellow.300" : "bagging.rowBorder"}
      rounded="md"
      px="3"
      py="3"
    >
      <HStack justify="space-between" align="start" gap="3">
        <Stack gap="bagging.none" minW="bagging.zero">
          <HStack gap="2" flexWrap="wrap">
            <Text fontWeight="semibold">
              {row.quantity} x {row.partNumber}
            </Text>
            <Badge colorPalette={row.color ? "green" : "yellow"} variant="subtle">
              {row.color?.name ?? "Unresolved color"}
            </Badge>
            <Badge colorPalette={row.sourceKind === "ocr" ? "blue" : "gray"} variant="subtle">
              {row.sourceKind ?? "unknown"}
            </Badge>
            <Badge colorPalette={row.part ? "green" : "yellow"} variant="subtle">
              {row.part ? row.part.matchKind.replaceAll("_", " ") : "unresolved part"}
            </Badge>
            {isLowConfidence ? (
              <Badge colorPalette="yellow" variant="subtle">
                needs attention
              </Badge>
            ) : null}
          </HStack>
          <Text color="fg.muted" fontFamily="mono" fontSize="xs" truncate>
            {row.rawText}
          </Text>
        </Stack>
        <Badge colorPalette={row.confidence >= 0.9 ? "green" : "yellow"} variant="subtle" flexShrink={0}>
          {Math.round(row.confidence * 100)}%
        </Badge>
      </HStack>

      <SimpleGrid columns={isSidebar ? 1 : { base: 1, md: 2, xl: 4 }} gap="2">
        <DebugMetric label="Page" value={String(row.sourcePage)} />
        <DebugMetric label="Text range" value={`${row.sourceTextRange.start}-${row.sourceTextRange.end}`} />
        <DebugMetric label="Row region" value={sourceRegion} />
        <DebugMetric label="Part image region" value={thumbnailRegion} />
        <DebugMetric label="Source image" value={formatSourceImage(row.sourceImage ?? null)} />
        <DebugMetric label="Crop refs" value={String(row.cropReferences?.length ?? 0)} />
        <DebugMetric label="Parser" value={row.parserVersion ?? "unknown"} />
        <DebugMetric label="Part kind" value={row.partNumberKind} />
        <DebugMetric label="Part match" value={formatPartMatch(row)} />
        <DebugMetric label="Color id" value={row.color?.id ?? "unresolved"} />
      </SimpleGrid>

      <RowRegionPreviews pageRender={pageRender} placement={placement} row={row} />

      <Text color="fg.muted" fontFamily="mono" fontSize="xs">
        tokens: {rawTokens}
      </Text>
    </Stack>
  )
}

function RowRegionPreviews({
  pageRender,
  placement,
  row,
}: {
  pageRender: PdfPrivatePageRender | null
  placement: PartsListDebugPanelPlacement
  row: ParsedPartsListPageRow
}) {
  return (
    <SimpleGrid columns={placement === "sidebar" ? 1 : { base: 1, md: 2 }} gap="2">
      <RegionCropPreview
        kind="row"
        label="Red row cropout"
        pageRender={pageRender}
        region={row.sourceRegion ?? null}
        row={row}
      />
      <RegionCropPreview
        kind="part"
        label="Blue part candidate cropout"
        pageRender={pageRender}
        region={row.partThumbnailRegion ?? null}
        row={row}
      />
    </SimpleGrid>
  )
}

function RegionCropPreview({
  kind,
  label,
  pageRender,
  region,
  row,
}: {
  kind: "part" | "row"
  label: string
  pageRender: PdfPrivatePageRender | null
  region: PartsListSourceRegion | null
  row: ParsedPartsListPageRow
}) {
  const cropRegion = region && row.sourceImage ? expandCropRegion(region, row.sourceImage) : null
  const displayWidth =
    cropRegion && row.sourceImage && pageRender
      ? getCropDisplayWidth(cropRegion, row.sourceImage, pageRender)
      : null

  return (
    <Stack gap="1">
      <Text color="fg.muted" fontSize="xs" fontWeight="semibold" textTransform="uppercase">
        {label}
      </Text>
      {pageRender?.dataUrl && region && row.sourceImage && cropRegion && displayWidth ? (
        <Box
          data-testid={`debug-${kind}-region-preview`}
          data-part-number={row.partNumber}
          border="sm"
          bg="bagging.subtleBg"
          maxW="full"
          overflow="hidden"
          position="relative"
          rounded="sm"
          style={{
            aspectRatio: `${cropRegion.width} / ${cropRegion.height}`,
            border: `2px solid ${regionColors[kind]}`,
            maxWidth: "100%",
            width: `${displayWidth}px`,
          }}
        >
          <Image
            alt={`${label} for ${row.quantity} x ${row.partNumber}`}
            src={pageRender.dataUrl}
            pointerEvents="none"
            position="absolute"
            style={{
              height: `${(row.sourceImage.height / cropRegion.height) * 100}%`,
              left: `${(-cropRegion.x / cropRegion.width) * 100}%`,
              maxWidth: "none",
              top: `${(-cropRegion.y / cropRegion.height) * 100}%`,
              width: `${(row.sourceImage.width / cropRegion.width) * 100}%`,
            }}
          />
          <ManualPreviewOverlay
            kind={kind}
            partNumber={row.partNumber}
            region={toCropLocalRegion(region, cropRegion)}
            sourceImage={cropRegion}
          />
        </Box>
      ) : (
        <EmptyDebugText>No {kind} preview.</EmptyDebugText>
      )}
    </Stack>
  )
}

function DebugMetric({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap="bagging.none" minW="bagging.zero">
      <Text color="fg.muted" fontSize="xs" fontWeight="semibold" textTransform="uppercase">
        {label}
      </Text>
      <Text fontFamily="mono" fontSize="xs" overflowWrap="anywhere">
        {value}
      </Text>
    </Stack>
  )
}

function formatPartMatch(row: ParsedPartsListPageRow) {
  return row.part
    ? `${row.part.matchKind}:${row.part.cataloguePartNumber}`
    : "unresolved"
}

function EmptyDebugText({ children }: { children: ReactNode }) {
  return (
    <Box border="sm" borderColor="bagging.rowBorder" bg="bagging.subtleBg" rounded="md" p="3">
      <Text color="fg.muted" fontSize="sm">
        {children}
      </Text>
    </Box>
  )
}

function getDebugSummary(result: PartsListDebugPanelResult) {
  const source =
    result.extractionMethod === "ocr"
      ? `ocr pages ${result.ocrPageCount ?? 0}`
      : result.extractionMethod === "native_text"
        ? `native pages ${result.nativeTextPageCount ?? 0}`
        : result.extractionMethod ?? "unknown source"

  const extractor = result.extractorVersion ? `, ${result.extractorVersion}` : ""

  return `${result.rows.length} rows, ${result.lowConfidenceRows.length} low-confidence rows, ${result.candidates.length} candidate pages, ${source}${extractor}.`
}

function formatRegion(region: PartsListSourceRegion | null) {
  if (!region) {
    return "none"
  }

  return `x${region.x} y${region.y} w${region.width} h${region.height} ${region.unit}`
}

function formatSourceImage(sourceImage: PartsListSourceImage | null) {
  if (!sourceImage) {
    return "none"
  }

  return `${sourceImage.width} x ${sourceImage.height} ${sourceImage.unit}`
}

function getDebugRowKey(row: ParsedPartsListPageRow, prefix: string) {
  return `${prefix}-${row.sourcePage}-${row.sourceTextRange.start}-${row.sourceTextRange.end}-${row.partNumber}`
}

function expandCropRegion(
  region: PartsListSourceRegion,
  sourceImage: PartsListSourceImage,
): PartsListSourceRegion {
  const paddingX = Math.max(48, Math.round(region.width * 0.75), Math.round(region.height * 1.5))
  const paddingY = Math.max(32, Math.round(region.height * 0.75))
  const x = Math.max(0, region.x - paddingX)
  const y = Math.max(0, region.y - paddingY)
  const right = Math.min(sourceImage.width, region.x + region.width + paddingX)
  const bottom = Math.min(sourceImage.height, region.y + region.height + paddingY)

  return {
    height: Math.max(1, bottom - y),
    unit: "ocr_pixel",
    width: Math.max(1, right - x),
    x,
    y,
  }
}

function getCropDisplayWidth(
  cropRegion: PartsListSourceRegion,
  sourceImage: PartsListSourceImage,
  pageRender: PdfPrivatePageRender,
) {
  const naturalWidth = (cropRegion.width / sourceImage.width) * pageRender.width

  return Math.round(Math.min(560, Math.max(180, naturalWidth * 2)))
}

function toCropLocalRegion(
  region: PartsListSourceRegion,
  cropRegion: PartsListSourceRegion,
): PartsListSourceRegion {
  return {
    height: region.height,
    unit: region.unit,
    width: region.width,
    x: Math.max(0, region.x - cropRegion.x),
    y: Math.max(0, region.y - cropRegion.y),
  }
}

function sortCandidatesByPage(candidates: readonly PartsListPageCandidate[]) {
  return [...candidates].sort(
    (left, right) =>
      left.pageNumber - right.pageNumber ||
      left.searchTier.localeCompare(right.searchTier) ||
      right.score - left.score,
  )
}

function sortRowsByPage(rows: readonly ParsedPartsListPageRow[]) {
  return [...rows].sort(
    (left, right) =>
      left.sourcePage - right.sourcePage ||
      (left.sourceRegion?.y ?? Number.MAX_SAFE_INTEGER) -
        (right.sourceRegion?.y ?? Number.MAX_SAFE_INTEGER) ||
      (left.sourceRegion?.x ?? Number.MAX_SAFE_INTEGER) -
        (right.sourceRegion?.x ?? Number.MAX_SAFE_INTEGER) ||
      left.sourceTextRange.start - right.sourceTextRange.start,
  )
}

function toBoundedPercent(value: number, total: number) {
  return Math.max(0, Math.min(100, (value / total) * 100))
}
