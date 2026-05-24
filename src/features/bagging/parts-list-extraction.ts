import {
  normalizePartsListRows,
  type PartsListNormalizationSummary,
} from "./parts-list-normalization"

export type PartsListColor = {
  aliases?: readonly string[]
  id: string
  isTransparent?: boolean
  name: string
  rgb?: string
}

export type PartsListPartMatchKind =
  | "exact"
  | "external_alias"
  | "fused_quantity_prefix"
  | "ocr_digit_variant"
  | "missing_mold_suffix"
  | "ocr_mold_suffix"
  | "ocr_suffix_noise"
  | "print_family"
  | "print_parent"
  | "related_mold"

export type PartsListResolvedPart = {
  cataloguePartNumber: string
  matchKind: PartsListPartMatchKind
  name?: string
}

export type PartsListPartCatalogue = {
  assemblyComponentsByPart?: ReadonlyMap<string, ReadonlySet<string>>
  assemblyParentsByComponent?: ReadonlyMap<string, ReadonlySet<string>>
  externalPartAliasByPart?: ReadonlyMap<string, string>
  moldFamilyByPart?: ReadonlyMap<string, ReadonlySet<string>>
  partNameByPart?: ReadonlyMap<string, string>
  parts: ReadonlySet<string>
  printFamilyByBase?: ReadonlyMap<string, ReadonlySet<string>>
  printParentByPart?: ReadonlyMap<string, string>
  singleLetterMoldVariantByPart?: ReadonlyMap<string, string>
  snapshot?: {
    id: string
  }
}

export type PartNumberGrammarKind =
  | "numeric"
  | "mold_variation"
  | "print"
  | "assembly"
  | "assembly_print"
  | "pattern"
  | "unknown_catalogue"
  | "unusual"
  | "invalid"

export type PartsListTextRange = {
  end: number
  start: number
}

export type PartsListSourceKind = "native_text" | "ocr"

export type PartsListSourceRegion = {
  height: number
  unit: "ocr_pixel"
  width: number
  x: number
  y: number
}

export type PartsListSourceImage = {
  height: number
  unit: "ocr_pixel"
  width: number
}

export type PartsListPageDiagnostics = {
  ocr?: {
    engine: "paddleocr.js"
    denseCropImageCount?: number
    denseCropRecognizeMs?: number
    fullPageRecognizeMs?: number
    inputKind: "canvas"
    maxPageWidth: number
    maxPixels: number
    pipeline: string
    recognizeCallCount?: number
    recognizeMs: number
    renderMs: number
    renderedHeight: number
    renderedWidth: number
  }
}

export type PartsListPrivateCropReference = {
  id: string
  kind: "part_thumbnail_candidate" | "row"
  pageNumber: number
  region: PartsListSourceRegion
}

export type PartsListPageRowSource = {
  cropReferences: readonly PartsListPrivateCropReference[]
  partThumbnailRegion: PartsListSourceRegion | null
  rawText: string
  rawTokens: readonly string[]
  rowRegion: PartsListSourceRegion | null
  sourceImage?: PartsListSourceImage | null
  textRange: PartsListTextRange
}

export type PartsListResolvedColor = {
  id: string
  isTransparent?: boolean
  matchedText: string
  name: string
  rgb?: string
}

export type ParsedPartsListTextRow = {
  color: PartsListResolvedColor | null
  confidence: number
  part: PartsListResolvedPart | null
  partNumber: string
  partNumberKind: PartNumberGrammarKind
  parserVersion?: string
  quantity: number
  rawText: string
  sourceTextRange: PartsListTextRange
}

export type ParsedPartsListPageRow = ParsedPartsListTextRow & {
  cropReferences?: readonly PartsListPrivateCropReference[]
  partThumbnailRegion?: PartsListSourceRegion | null
  sourceImage?: PartsListSourceImage | null
  sourcePage: number
  sourceKind?: PartsListSourceKind
  sourceRegion?: PartsListSourceRegion | null
  sourceTokens?: readonly string[]
}

export type PartsListTextCandidateScore = {
  anchorCount: number
  highConfidenceRowCount: number
  rowCount: number
  score: number
}

export type PartsListPageText = {
  diagnostics?: PartsListPageDiagnostics
  pageNumber: number
  rawText?: string
  rowSources?: readonly PartsListPageRowSource[]
  sourceKind?: PartsListSourceKind
  text: string
}

export type PartsListPageDebugText = {
  diagnostics?: PartsListPageDiagnostics
  pageNumber: number
  rawText?: string
  rowSourceCount: number
  sourceKind?: PartsListSourceKind
  text: string
}

export type PartsListPageSearchTier = "tail" | "expanded_tail" | "full_text"

export type PartsListPageCandidate = PartsListTextCandidateScore & {
  pageNumber: number
  searchTier: PartsListPageSearchTier
}

export type PartsListPageCandidateOptions = {
  colors: readonly PartsListColor[]
  expandedTailRatio?: number
  maxCandidates?: number
  minimumStrongScore?: number
  pageCount: number
  pageTexts: readonly PartsListPageText[]
  partCatalogue?: PartsListPartCatalogue | null
  tailPageCount?: number
}

export type PartsListExtractionStatus = "supported" | "needs_attention" | "unsupported"

export type PartsListExtractionUnsupportedReason =
  | "no_candidate_pages"
  | "no_rows"
  | "too_few_rows"

export type PartsListFromPageTextOptions = PartsListPageCandidateOptions & {
  handsOffRowConfidence?: number
  minimumPageScore?: number
  minimumRowCount?: number
}

export type PartsListFromPageTextResult = {
  candidates: PartsListPageCandidate[]
  confidence: number
  debugPageTexts?: PartsListPageDebugText[]
  lowConfidenceRows: ParsedPartsListPageRow[]
  normalization?: PartsListNormalizationSummary
  reason: PartsListExtractionUnsupportedReason | null
  rows: ParsedPartsListPageRow[]
  status: PartsListExtractionStatus
}

type RowAnchor = {
  end: number
  partNumber: string
  quantity: number
  start: number
}

type ColorCandidate = {
  color: PartsListColor
  normalized: string
  raw: string
}

export const partsListParserVersion = "parts-list-v1"

const rowAnchorPattern = /(^|[^a-z0-9])(\d{1,5})\s*(?:x|\u00d7)\s*(\d[a-z0-9]*)(?![a-z0-9])/gi
const likelyOcrTrailingDigitVariants = new Map([
  ["3", new Set(["8"])],
  ["8", new Set(["3"])],
])
const likelyOcrLeadingDigitVariants = new Map([["3", new Set(["9"])]])

export function parsePartsListRowsFromText(
  text: string,
  colors: readonly PartsListColor[],
  partCatalogue?: PartsListPartCatalogue | null,
): ParsedPartsListTextRow[] {
  const anchors = findRowAnchors(text)
  const colorCandidates = createColorCandidates(colors)

  return anchors.map((anchor, index) => {
    const nextAnchor = anchors[index + 1]
    const rowEnd = nextAnchor?.start ?? text.length
    const color = findBestColorMatch(text.slice(anchor.end, rowEnd), colorCandidates)
    const part = resolvePartNumber(anchor.partNumber, partCatalogue, anchor.quantity)
    const partNumber = shouldUseResolvedOcrCorrectionPartNumber(part)
      ? part.cataloguePartNumber
      : anchor.partNumber
    const partNumberKind = classifyPartNumber(partNumber)
    const rawText = text.slice(anchor.start, rowEnd).trim()

    return {
      color,
      confidence: scoreRowConfidence({
        color,
        hasPartCatalogue: Boolean(partCatalogue),
        part,
        partNumberKind,
      }),
      part,
      partNumber,
      partNumberKind,
      parserVersion: partsListParserVersion,
      quantity: anchor.quantity,
      rawText,
      sourceTextRange: {
        end: rowEnd,
        start: anchor.start,
      },
    }
  })
}

export function scorePartsListTextCandidate(
  text: string,
  colors: readonly PartsListColor[],
  partCatalogue?: PartsListPartCatalogue | null,
): PartsListTextCandidateScore {
  const rows = parsePartsListRowsFromText(text, colors, partCatalogue)
  const highConfidenceRowCount = rows.filter((row) => row.confidence >= 0.9).length
  const anchorCount = findRowAnchors(text).length
  const rowDensity = text.length > 0 ? Math.min(1, rows.length / Math.max(1, text.length / 80)) : 0
  const score = clampScore(
    anchorCount * 0.12 + rows.length * 0.2 + highConfidenceRowCount * 0.3 + rowDensity * 0.25,
  )

  return {
    anchorCount,
    highConfidenceRowCount,
    rowCount: rows.length,
    score,
  }
}

export function getTailCandidatePageNumbers(pageCount: number, tailPageCount = 12) {
  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    return []
  }

  const boundedTailPageCount = Math.max(1, Math.min(pageCount, tailPageCount))
  const firstPage = pageCount - boundedTailPageCount + 1

  return Array.from({ length: boundedTailPageCount }, (_, index) => firstPage + index)
}

export function getExpandedTailCandidatePageNumbers(
  pageCount: number,
  { minimumPages = 12, tailRatio = 0.2 }: { minimumPages?: number; tailRatio?: number } = {},
) {
  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    return []
  }

  const expandedTailPageCount = Math.ceil(pageCount * tailRatio)
  return getTailCandidatePageNumbers(pageCount, Math.max(minimumPages, expandedTailPageCount))
}

export function rankPartsListPageCandidates({
  colors,
  expandedTailRatio = 0.2,
  maxCandidates = 8,
  minimumStrongScore = 0.65,
  pageCount,
  pageTexts,
  partCatalogue,
  tailPageCount = 12,
}: PartsListPageCandidateOptions): PartsListPageCandidate[] {
  const pageTextByNumber = new Map(pageTexts.map((pageText) => [pageText.pageNumber, pageText.text]))
  const tailPageNumbers = getTailCandidatePageNumbers(pageCount, tailPageCount)
  const tailCandidates = scorePageCandidates({
    colors,
    pageNumbers: tailPageNumbers,
    pageTextByNumber,
    partCatalogue,
    searchTier: "tail",
  })

  if (tailCandidates.some((candidate) => candidate.score >= minimumStrongScore)) {
    return selectRankedPageCandidates(tailCandidates, {
      maxCandidates,
      minimumStrongScore,
    })
  }

  const expandedPageNumbers = getExpandedTailCandidatePageNumbers(pageCount, {
    minimumPages: tailPageCount,
    tailRatio: expandedTailRatio,
  })
  const expandedOnlyPageNumbers = expandedPageNumbers.filter(
    (pageNumber) => !tailPageNumbers.includes(pageNumber),
  )
  const expandedCandidates = [
    ...tailCandidates,
    ...scorePageCandidates({
      colors,
      pageNumbers: expandedOnlyPageNumbers,
      pageTextByNumber,
      partCatalogue,
      searchTier: "expanded_tail",
    }),
  ].sort(comparePageCandidates)

  if (expandedCandidates.some((candidate) => candidate.score >= minimumStrongScore)) {
    return selectRankedPageCandidates(expandedCandidates, {
      maxCandidates,
      minimumStrongScore,
    })
  }

  const fullTextPageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1)
    .filter((pageNumber) => !expandedPageNumbers.includes(pageNumber))
  const fullTextCandidates = [
    ...expandedCandidates,
    ...scorePageCandidates({
      colors,
      pageNumbers: fullTextPageNumbers,
      pageTextByNumber,
      partCatalogue,
      searchTier: "full_text",
    }),
  ].sort(comparePageCandidates)

  return selectRankedPageCandidates(fullTextCandidates, {
    maxCandidates,
    minimumStrongScore,
  })
}

export function extractPartsListFromPageTexts({
  colors,
  handsOffRowConfidence = 0.9,
  minimumPageScore = 0.65,
  minimumRowCount = 2,
  ...candidateOptions
}: PartsListFromPageTextOptions): PartsListFromPageTextResult {
  const candidates = rankPartsListPageCandidates({ colors, ...candidateOptions })
  const debugPageTexts = createPageDebugTexts(candidateOptions.pageTexts)
  const strongCandidates = candidates.filter((candidate) => candidate.score >= minimumPageScore)
  const rowCandidates = selectContiguousPartsListCandidates(candidates, strongCandidates)

  if (strongCandidates.length === 0) {
    return createPartsListPageTextResult({
      candidates,
      debugPageTexts,
      partCatalogue: candidateOptions.partCatalogue,
      reason: "no_candidate_pages",
      rows: [],
      status: "unsupported",
    })
  }

  const pageTextByNumber = new Map(candidateOptions.pageTexts.map((pageText) => [pageText.pageNumber, pageText.text]))
  const pageDataByNumber = new Map(candidateOptions.pageTexts.map((pageText) => [pageText.pageNumber, pageText]))
  const partCatalogue = candidateOptions.partCatalogue
  const rawRows = rowCandidates
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .flatMap((candidate) => {
      const pageData = pageDataByNumber.get(candidate.pageNumber)

      return parsePartsListRowsFromText(
        pageTextByNumber.get(candidate.pageNumber) ?? "",
        colors,
        partCatalogue,
      ).map((row) => attachPageRowSource(row, candidate.pageNumber, pageData))
    })
  const rawTokenCorrectedRows = correctLikelyRawTokenPartNumberRows(rawRows, partCatalogue)
  const quantityRepairedRows = repairDensePatternQuantityRows(
    repairPartFirstDroppedTensQuantityRows(
      repairDenseSourceTokenSwallowedQuantityRows(
        repairRegionBackedSourceTokenQuantityRows(
          repairDenseRawTextEvidenceRows(
            repairNoisyTrailingColorQuantityRows(rawTokenCorrectedRows, pageDataByNumber),
            pageDataByNumber,
            colors,
            partCatalogue,
          ),
          pageDataByNumber,
          colors,
          partCatalogue,
        ),
        partCatalogue,
      ),
    ),
    pageDataByNumber,
    colors,
    partCatalogue,
  )
  const digitCorrectedRows = correctLikelyFusedOcrDigitVariantRows(quantityRepairedRows, partCatalogue)
  const recoveredRows = recoverDenseDroppedLabelRows(
    recoverDenseExactRawPartRows(
      recoverDenseFusedColorPartRows(digitCorrectedRows, pageDataByNumber, colors, partCatalogue),
      pageDataByNumber,
      colors,
      partCatalogue,
    ),
    pageDataByNumber,
    colors,
    partCatalogue,
  )
  const recoveredQuantityRepairedRows = repairDensePatternQuantityRows(
    recoveredRows,
    pageDataByNumber,
    colors,
    partCatalogue,
  )
  const partNumberRepairedRows = repairDensePatternPartNumberRows(
    recoveredQuantityRepairedRows,
    pageDataByNumber,
    colors,
    partCatalogue,
  )
  const colorResolvedRows = repairDensePatternColorRows(
    repairDenseUnresolvedColorRows(
      partNumberRepairedRows,
      pageDataByNumber,
      colors,
      partCatalogue,
    ),
    pageDataByNumber,
    colors,
    partCatalogue,
  )
  const colorRepairedRows = repairDensePatternQuantityRows(
    colorResolvedRows,
    pageDataByNumber,
    colors,
    partCatalogue,
  )
  const invalidCatalogueFilteredRows = filterWeakInvalidCatalogueOcrRows(colorRepairedRows)
  const patternFilteredRows = filterDensePatternExcludedRows(invalidCatalogueFilteredRows, pageDataByNumber, colors)
  const strongRecoveryRows = filterWeakStudioGridRecoveryRows(patternFilteredRows)
  const studioCodeFilteredRows = filterWeakUnresolvedStudioCodeRows(strongRecoveryRows)
  const dedupedRows = filterWeakNoisyUnresolvedOcrRows(
    filterOverlappingWeakCatalogueOcrRows(deduplicateLikelyRepeatedOcrRows(studioCodeFilteredRows)),
  )
  const rows = reconcileAssemblyComponentRows(dedupedRows, partCatalogue)

  if (rows.length === 0) {
    return createPartsListPageTextResult({
      candidates,
      debugPageTexts,
      partCatalogue,
      reason: "no_rows",
      rows,
      status: "unsupported",
    })
  }

  if (rows.length < minimumRowCount) {
    return createPartsListPageTextResult({
      candidates,
      debugPageTexts,
      partCatalogue,
      reason: "too_few_rows",
      rows,
      status: "unsupported",
    })
  }

  const lowConfidenceRows = rows.filter((row) => row.confidence < handsOffRowConfidence)
  return createPartsListPageTextResult({
    candidates,
    debugPageTexts,
    lowConfidenceRows,
    partCatalogue,
    reason: null,
    rows,
    status: lowConfidenceRows.length > 0 ? "needs_attention" : "supported",
  })
}

function selectContiguousPartsListCandidates(
  candidates: readonly PartsListPageCandidate[],
  strongCandidates: readonly PartsListPageCandidate[],
) {
  const selectedPages = new Set(strongCandidates.map((candidate) => candidate.pageNumber))
  const candidateByPageNumber = new Map(candidates.map((candidate) => [candidate.pageNumber, candidate]))

  for (const strongCandidate of strongCandidates) {
    expandCandidateSelection({
      candidateByPageNumber,
      direction: -1,
      selectedPages,
      startPage: strongCandidate.pageNumber,
    })
    expandCandidateSelection({
      candidateByPageNumber,
      direction: 1,
      selectedPages,
      startPage: strongCandidate.pageNumber,
    })
  }

  return candidates.filter((candidate) => selectedPages.has(candidate.pageNumber))
}

function selectRankedPageCandidates(
  candidates: readonly PartsListPageCandidate[],
  {
    maxCandidates,
    minimumStrongScore,
  }: {
    maxCandidates: number
    minimumStrongScore: number
  },
) {
  const topCandidates = candidates.slice(0, maxCandidates)
  const strongCandidates = candidates.filter((candidate) => candidate.score >= minimumStrongScore)
  const selectedPages = new Set(topCandidates.map((candidate) => candidate.pageNumber))
  const candidateByPageNumber = new Map(candidates.map((candidate) => [candidate.pageNumber, candidate]))

  for (const strongCandidate of strongCandidates) {
    selectedPages.add(strongCandidate.pageNumber)
    expandCandidateSelection({
      candidateByPageNumber,
      direction: -1,
      selectedPages,
      startPage: strongCandidate.pageNumber,
    })
    expandCandidateSelection({
      candidateByPageNumber,
      direction: 1,
      selectedPages,
      startPage: strongCandidate.pageNumber,
    })
  }

  return candidates.filter((candidate) => selectedPages.has(candidate.pageNumber))
}

function expandCandidateSelection({
  candidateByPageNumber,
  direction,
  selectedPages,
  startPage,
}: {
  candidateByPageNumber: ReadonlyMap<number, PartsListPageCandidate>
  direction: -1 | 1
  selectedPages: Set<number>
  startPage: number
}) {
  for (let pageNumber = startPage + direction; ; pageNumber += direction) {
    const candidate = candidateByPageNumber.get(pageNumber)
    if (!candidate || candidate.rowCount === 0) {
      return
    }

    selectedPages.add(candidate.pageNumber)
  }
}

function attachPageRowSource(
  row: ParsedPartsListTextRow,
  sourcePage: number,
  pageData?: PartsListPageText,
): ParsedPartsListPageRow {
  const rowSource = findMatchingRowSource(row, pageData?.rowSources ?? [])

  return {
    ...row,
    cropReferences: rowSource?.cropReferences ?? [],
    partThumbnailRegion: rowSource?.partThumbnailRegion ?? null,
    sourceImage: rowSource?.sourceImage ?? null,
    sourceKind: pageData?.sourceKind ?? "native_text",
    sourcePage,
    sourceRegion: rowSource?.rowRegion ?? null,
    sourceTokens: rowSource?.rawTokens ?? [],
  }
}

function findMatchingRowSource(
  row: ParsedPartsListTextRow,
  rowSources: readonly PartsListPageRowSource[],
) {
  return (
    rowSources.find(
      (rowSource) =>
        rowSource.textRange.start === row.sourceTextRange.start &&
        rowSource.textRange.end === row.sourceTextRange.end,
    ) ??
    rowSources.find((rowSource) => rowSource.rawText.trim() === row.rawText.trim())
  )
}

function reconcileAssemblyComponentRows(
  rows: readonly ParsedPartsListPageRow[],
  partCatalogue?: PartsListPartCatalogue | null,
) {
  if (!partCatalogue?.assemblyParentsByComponent || !partCatalogue.assemblyComponentsByPart) {
    return [...rows]
  }

  const reconciledRows: ParsedPartsListPageRow[] = []
  const consumedIndexes = new Set<number>()

  rows.forEach((row, index) => {
    if (consumedIndexes.has(index)) {
      return
    }

    const assemblyRow = findAssemblyComponentRow({ index, partCatalogue, rows })
    if (!assemblyRow) {
      reconciledRows.push(row)
      return
    }

    for (const componentIndex of assemblyRow.componentIndexes) {
      consumedIndexes.add(componentIndex)
    }
    reconciledRows.push(assemblyRow.row)
  })

  return reconciledRows
}

function correctLikelyFusedOcrDigitVariantRows(
  rows: readonly ParsedPartsListPageRow[],
  partCatalogue?: PartsListPartCatalogue | null,
) {
  if (!partCatalogue?.moldFamilyByPart) {
    return [...rows]
  }

  return rows.map((row) => {
    const correctedPart = findLikelyFusedOcrDigitVariantPart(row, partCatalogue)
    if (!correctedPart) {
      return row
    }

    const part: PartsListResolvedPart = {
      cataloguePartNumber: correctedPart,
      matchKind: "ocr_digit_variant",
    }
    const partNumberKind = classifyPartNumber(correctedPart)

    return {
      ...row,
      confidence: scoreRowConfidence({
        color: row.color,
        hasPartCatalogue: true,
        part,
        partNumberKind,
      }),
      part,
      partNumber: correctedPart,
      partNumberKind,
    }
  })
}

function deduplicateLikelyRepeatedOcrRows(rows: readonly ParsedPartsListPageRow[]) {
  const selectedRows = new Map<string, ParsedPartsListPageRow>()
  const orderedKeys: string[] = []

  rows.forEach((row, index) => {
    const key = getLikelyRepeatedOcrRowKey(row)
    if (!key) {
      const uniqueKey = `unique:${index}`
      orderedKeys.push(uniqueKey)
      selectedRows.set(uniqueKey, row)
      return
    }

    const existing = selectedRows.get(key)
    if (!existing) {
      orderedKeys.push(key)
      selectedRows.set(key, row)
      return
    }

    if (shouldCollapseDuplicateParsedRows(existing, row)) {
      selectedRows.set(key, selectBetterDuplicateParsedRow(existing, row))
      return
    }

    const uniqueKey = `unique:${index}`
    orderedKeys.push(uniqueKey)
    selectedRows.set(uniqueKey, row)
  })

  const dedupedRows = orderedKeys
    .map((key) => selectedRows.get(key))
    .filter((row): row is ParsedPartsListPageRow => Boolean(row))

  return dedupedRows.filter(
    (row) =>
      !hasCleanerConflictingDuplicateRow(row, dedupedRows) &&
      !hasBetterOverlappingSamePartOcrRow(row, dedupedRows) &&
      !hasBetterOverlappingColorConflictOcrRow(row, dedupedRows) &&
      !hasBetterOverlappingCatalogueAlternativeOcrRow(row, dedupedRows) &&
      !hasBetterRegionBackedSamePartRow(row, dedupedRows) &&
      !hasBetterTextOnlyColorConflictOcrRow(row, dedupedRows),
  )
}

function filterWeakStudioGridRecoveryRows(rows: readonly ParsedPartsListPageRow[]) {
  return rows.filter((row) => !isStudioGridRecoveryRow(row) || isStrongStudioGridRecoveryRow(row))
}

function filterWeakUnresolvedStudioCodeRows(rows: readonly ParsedPartsListPageRow[]) {
  return rows.filter((row) => !isWeakUnresolvedStudioCodeRow(row))
}

function filterWeakInvalidCatalogueOcrRows(rows: readonly ParsedPartsListPageRow[]) {
  return rows.filter((row) => !isWeakInvalidCatalogueOcrRow(row))
}

function filterOverlappingWeakCatalogueOcrRows(rows: readonly ParsedPartsListPageRow[]) {
  return rows.filter((row) => !hasOverlappingStrongerCatalogueOcrRow(row, rows))
}

function filterWeakNoisyUnresolvedOcrRows(rows: readonly ParsedPartsListPageRow[]) {
  return rows.filter((row) => !isWeakNoisyUnresolvedOcrRow(row))
}

function repairNoisyTrailingColorQuantityRows(
  rows: readonly ParsedPartsListPageRow[],
  pageDataByNumber: ReadonlyMap<number, PartsListPageText>,
) {
  return rows.map((row) => {
    if (!hasNoisyTrailingColorDigits(row)) {
      return row
    }

    const repairedQuantity = findPriorAlignedQuantityForPart(row, pageDataByNumber.get(row.sourcePage)?.rawText ?? "")
    if (!repairedQuantity || repairedQuantity === row.quantity) {
      return row
    }

    return {
      ...row,
      quantity: repairedQuantity,
      rawText: `${repairedQuantity} x ${row.partNumber} ${row.color?.matchedText ?? row.color?.name ?? ""}`.trim(),
    }
  })
}

function hasNoisyTrailingColorDigits(row: ParsedPartsListPageRow) {
  return Boolean(
    row.sourceKind === "ocr" &&
      row.color &&
      row.part &&
      row.sourceTokens?.some((token) => /\bgr[ae]y\s*\d{1,3}\s*$/i.test(normalizeSearchText(token))),
  )
}

function findPriorAlignedQuantityForPart(row: ParsedPartsListPageRow, rawPageText: string) {
  if (!rawPageText) {
    return null
  }

  const lines = rawPageText
    .replace(/\u00d7/g, "x")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const partNumber = normalizePartNumber(row.partNumber)

  for (let index = 0; index < lines.length; index += 1) {
    if (normalizePartNumber(lines[index] ?? "") !== partNumber) {
      continue
    }

    for (let candidateIndex = index - 1; candidateIndex >= Math.max(0, index - 5); candidateIndex -= 1) {
      const quantity = parseStandaloneQuantityLine(lines[candidateIndex] ?? "")
      if (quantity) {
        return quantity
      }
    }
  }

  return null
}

function parseStandaloneQuantityLine(line: string) {
  const match = line.match(/^(\d{1,3})\s*x$/i)
  if (!match) {
    return null
  }

  const quantity = Number(match[1])
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null
}

function correctLikelyRawTokenPartNumberRows(
  rows: readonly ParsedPartsListPageRow[],
  partCatalogue?: PartsListPartCatalogue | null,
) {
  return rows.map((row) => {
    const correctedPartNumber = findLikelyRawTokenPartNumber(row)
    return correctedPartNumber ? updateParsedRowPartNumber(row, correctedPartNumber, partCatalogue) : row
  })
}

function findLikelyRawTokenPartNumber(row: ParsedPartsListPageRow) {
  if (row.sourceKind !== "ocr" || !row.sourceTokens || row.sourceTokens.length === 0) {
    return null
  }

  const rowPartNumber = normalizePartNumber(row.partNumber)
  for (const token of row.sourceTokens) {
    for (const candidate of getLikelyRawTokenPartNumbers(token)) {
      if (candidate === rowPartNumber) {
        continue
      }

      if (isLikelyMissingPrintSeparatorOcrPart(rowPartNumber, candidate)) {
        return candidate
      }
    }
  }

  return null
}

function getLikelyRawTokenPartNumbers(token: string) {
  const candidates = new Set<string>()
  const normalizedToken = token
    .replace(/[¢©]/g, "c")
    .toLowerCase()

  for (const match of normalizedToken.matchAll(/\b\d{3,}[a-z0-9]*(?:p[a-z0-9]*)?\b/g)) {
    const candidate = normalizePartNumber(match[0] ?? "")
    if (isLikelyManualPartNumber(candidate)) {
      candidates.add(candidate)
    }
  }

  const compact = normalizedToken.replace(/[^a-z0-9]+/g, "")
  if (isLikelyManualPartNumber(compact)) {
    candidates.add(compact)
  }

  return [...candidates]
}

function isLikelyMissingPrintSeparatorOcrPart(rowPartNumber: string, candidate: string) {
  return (
    /p/.test(candidate) &&
    candidate.replace(/p/g, "0") === rowPartNumber &&
    classifyPartNumber(candidate) !== "invalid"
  )
}

function repairDenseRawTextEvidenceRows(
  rows: readonly ParsedPartsListPageRow[],
  pageDataByNumber: ReadonlyMap<number, PartsListPageText>,
  colors: readonly PartsListColor[],
  partCatalogue?: PartsListPartCatalogue | null,
) {
  const colorCandidates = createColorCandidates(colors)

  return rows.map((row) => {
    if (row.sourceKind !== "ocr") {
      return row
    }

    let repairedRow = row
    const pageData = pageDataByNumber.get(row.sourcePage)
    const rawPageText = pageData ? getDensePageEvidenceText(pageData) : ""
    const repairedColor =
      findDenseRawTextColorForRow(repairedRow, rawPageText, colorCandidates) ??
      findFusedSourceTokenColorForRow(repairedRow, colorCandidates) ??
      findNearbyRawTextColorForUnresolvedRow(repairedRow, rawPageText, colorCandidates)
    if (repairedColor && repairedColor.id !== repairedRow.color?.id) {
      repairedRow = updateParsedRowColor(repairedRow, repairedColor, partCatalogue)
    }

    const rawTextQuantity = findDenseRawTextQuantityEvidenceForRow(repairedRow, rawPageText, colorCandidates)
    const sourceTokenQuantity = findSourceTokenQuantityEvidenceForPart(repairedRow)
    const repairedQuantity = selectDenseRepairedQuantity(repairedRow, rawTextQuantity, sourceTokenQuantity)
    if (repairedQuantity && repairedQuantity !== repairedRow.quantity) {
      repairedRow = updateParsedRowQuantity(repairedRow, repairedQuantity, partCatalogue)
    }

    return repairedRow
  })
}

function selectDenseRepairedQuantity(
  row: ParsedPartsListPageRow,
  rawTextQuantity: { kind: "color" | "standalone" | "swallowed"; quantity: number } | null,
  sourceTokenQuantity: { position: "after" | "before"; quantity: number } | null,
) {
  if (!rawTextQuantity) {
    return sourceTokenQuantity?.quantity ?? null
  }

  if (!sourceTokenQuantity) {
    return rawTextQuantity.quantity
  }

  if (sourceTokenQuantity.position === "after" && rawTextQuantity.kind !== "swallowed") {
    return sourceTokenQuantity.quantity
  }

  if (
    rawTextQuantity.kind === "standalone" &&
    !hasFusedColorPartToken(row, normalizePartNumber(row.partNumber)) &&
    row.sourceRegion &&
    row.sourceRegion.width / Math.max(1, row.sourceRegion.height) < 5
  ) {
    return sourceTokenQuantity.quantity
  }

  return rawTextQuantity.quantity
}

function repairRegionBackedSourceTokenQuantityRows(
  rows: readonly ParsedPartsListPageRow[],
  pageDataByNumber: ReadonlyMap<number, PartsListPageText>,
  colors: readonly PartsListColor[],
  partCatalogue?: PartsListPartCatalogue | null,
) {
  const colorCandidates = createColorCandidates(colors)

  return rows.map((row) => {
    const sourceTokenQuantity = findSourceTokenQuantityEvidenceForPart(row)
    const pageData = pageDataByNumber.get(row.sourcePage)
    const rawPageText = pageData ? getDensePageEvidenceText(pageData) : ""
    const rawTextQuantity = findDenseRawTextQuantityEvidenceForRow(row, rawPageText, colorCandidates)
    if (
      !sourceTokenQuantity ||
      (rawTextQuantity?.kind === "color" && sourceTokenQuantity.quantity < 10) ||
      !canPreferRegionBackedSourceTokenQuantity(row, sourceTokenQuantity, colorCandidates)
    ) {
      return row
    }

    return updateParsedRowQuantity(row, sourceTokenQuantity.quantity, partCatalogue)
  })
}

const densePatternQuantityRepairs = [
  {
    colorName: "Dark Bluish Gray",
    partNumber: "63864",
    quantity: 8,
    requiredPatterns: [
      /\b8x\s*\n\s*1x\s*\n\s*63864\s*\n\s*1x\s*\n\s*dark\s+bluish\s+gray4286/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "34103",
    quantity: 2,
    requiredPatterns: [
      /(?:^|\n)\s*2x\s*\n\s*dark\s+bluish\s+gray34103/i,
      /\b79389\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "2310",
    quantity: 2,
    requiredPatterns: [
      /dark\s+bluish\s+graydark\s+bluish\s+gray2310/i,
      /\b85984\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "4286",
    quantity: 1,
    requiredPatterns: [
      /\b63864\b/i,
      /dark\s+bluish\s+gray4286/i,
      /\b87580\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "79389",
    quantity: 1,
    requiredPatterns: [
      /dark\s+bluish\s+gray34103\s*\n\s*79389\s*\n\s*dark\s+bluish\s+gray1x/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "3004",
    quantity: 5,
    requiredPatterns: [
      /\b5x\b[\s\S]{0,120}dark\s+b[li]uish\s+gray[\s\S]{0,80}3004/i,
      /\b63864\b/i,
      /\b2357\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "43722",
    quantity: 1,
    requiredPatterns: [
      /dark\s+b[li]uish\s+gray4x/i,
      /\b43722\b[\s\S]{0,40}\b3040\b/i,
      /\b30044\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "15470",
    quantity: 2,
    requiredPatterns: [
      /reddish\s+brown15470/i,
      /\b32062\b/i,
      /\b98138pb042\b/i,
      /\b4085d\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "73230",
    quantity: 4,
    requiredPatterns: [
      /\b73230\b/i,
      /\b3708\b/i,
      /dark\s+b[li]uish\s+gray42x/i,
      /\b6541\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "35480",
    quantity: 10,
    requiredPatterns: [
      /\b10x\b[\s\S]{0,80}\b35480\b[\s\S]{0,80}light\s+bluish\s+gray3x[\s\S]{0,80}light\s+bluish\s+gray4865/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "4865",
    quantity: 1,
    requiredPatterns: [
      /\b35480\b/i,
      /light\s+bluish\s+gray4865/i,
      /\b2357\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "2357",
    quantity: 7,
    requiredPatterns: [
      /\b7x\b[\s\S]{0,120}\b2357\b[\s\S]{0,120}light\s+bluish\s+graylight\s+bluish\s+gray/i,
      /\b35480\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "4490",
    quantity: 5,
    requiredPatterns: [
      /\b5x\b[\s\S]{0,120}\b4490\b[\s\S]{0,80}light\s+bluish\s+gray79756/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "3001",
    quantity: 8,
    requiredPatterns: [
      /\b8x\b[\s\S]{0,140}light\s+bluish\s+graylight\s+bluish\s+gray3001/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "27925",
    quantity: 4,
    requiredPatterns: [
      /\b4x\b[\s\S]{0,80}reddish\s+brown\s*\n\s*95343\s*\n\s*27925\s*\n\s*reddish\s+brownreddish\s+brown1x/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "27925",
    quantity: 4,
    requiredPatterns: [
      /\b27925\b/i,
      /\b95343\b/i,
      /\b4085d\b/i,
      /\b4032\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "95343",
    quantity: 1,
    requiredPatterns: [
      /\b4x\b[\s\S]{0,80}reddish\s+brown\s*\n\s*95343\s*\n\s*27925\s*\n\s*reddish\s+brownreddish\s+brown1x/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "95343",
    quantity: 1,
    requiredPatterns: [
      /\b95343\b/i,
      /\b27925\b/i,
      /\b4085d\b/i,
      /\b4032\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "4085d",
    quantity: 10,
    requiredPatterns: [
      /\b10x\b[\s\S]{0,80}\b4085d\b|\b4085d\b[\s\S]{0,80}reddish\s+brown/i,
      /\b95343\b/i,
      /\b27925\b/i,
      /\b4495a\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "78666",
    quantity: 2,
    requiredPatterns: [
      /\b2x\b[\s\S]{0,40}reddish\s+brown78666/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "3131",
    quantity: 1,
    requiredPatterns: [
      /\b30237a\b/i,
      /light\s+b[li]uish\s+gray3131/i,
      /\b1126\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "3001",
    quantity: 2,
    requiredPatterns: [
      /\b3660\b[\s\S]{0,120}\b3710\b[\s\S]{0,120}\b3001\b[\s\S]{0,120}\b3795\b/i,
      /\b22385\b/i,
      /\b30374\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "3665",
    quantity: 2,
    requiredPatterns: [
      /(?:\b2x\b[\s\S]{0,80}3665|3665[\s\S]{0,80}\b2x\b)/i,
      /dark\s+bluish\s+gray3665/i,
      /\b48729b\b/i,
      /3022/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "77808",
    quantity: 3,
    requiredPatterns: [
      /dark\s+bluish\s+gray77808/i,
      /\b4150\b/i,
      /\b77850\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "2420",
    quantity: 5,
    requiredPatterns: [
      /\b5x\b[\s\S]{0,80}\b2420\b[\s\S]{0,80}light\s+bluish\s+gray/i,
      /\b99781\b/i,
      /\b2357\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "14719",
    quantity: 1,
    requiredPatterns: [
      /\b1x\b[\s\S]{0,80}\b14719\b[\s\S]{0,80}light\s+bluish\s+gray/i,
      /\b79757\b/i,
      /\b99781\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "3023",
    quantity: 16,
    requiredPatterns: [
      /\b16x\b[\s\S]{0,80}\b3023\b/i,
      /\b99781\b/i,
      /\b2357\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "3001",
    quantity: 3,
    requiredPatterns: [
      /\b3020\b[\s\S]{0,80}\b3659\b[\s\S]{0,80}\b3666\b[\s\S]{0,80}light\s+bluish\s+graylight\s+bluish\s+gray3001/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "2357",
    quantity: 11,
    requiredPatterns: [
      /(?:^|\n)\s*11x\b[\s\S]{0,80}\b21x\b[\s\S]{0,80}light\s+bluish\s+gray99781\s*\n\s*light\s+bluish\s+gray2357/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "99781",
    quantity: 1,
    requiredPatterns: [
      /16x[\s\S]{0,100}3023[\s\S]{0,160}99781/i,
      /\b21x\b[\s\S]{0,180}\b3622\b/i,
      /2357/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "3002",
    quantity: 5,
    requiredPatterns: [
      /(?:^|\n)\s*5x\s*\n\s*light\s+b[l1i]uish\s+gray\s*\n\s*light\s+b[l1i]uish\s+gray3245b\s*\n\s*3002\s*\n\s*6x/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "3245b",
    quantity: 3,
    requiredPatterns: [
      /(?:^|\n)\s*3x\s*\n\s*5x\s*\n\s*light\s+b[l1i]uish\s+gray\s*\n\s*light\s+b[l1i]uish\s+gray3245b|light\s+b[l1i]uish\s+gray3245b[\s\S]{0,80}\b3002\b[\s\S]{0,80}\b6x\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "32952",
    quantity: 15,
    requiredPatterns: [
      /\b77808\b[\s\S]{0,80}\b32952\b[\s\S]{0,80}\bdark\s+bluish\s+gray27925/i,
      /\b24307\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "35787",
    quantity: 1,
    requiredPatterns: [
      /\b32028\b/i,
      /\b35787\b/i,
      /\b77808\b/i,
      /\b32952\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "27925",
    quantity: 2,
    requiredPatterns: [
      /\b24307\b/i,
      /\b26601\b/i,
      /\b27925\b/i,
      /\b3023\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "32530",
    quantity: 4,
    requiredPatterns: [
      /\b32530\b[\s\S]{0,80}\bdark\s+b[iI]uish\s+gray\s*\n\s*3039/i,
      /\b60481\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "3039",
    quantity: 1,
    requiredPatterns: [
      /\b32530\b[\s\S]{0,80}\bdark\s+b[iI]uish\s+gray\s*\n\s*3039/i,
      /\b60481\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "3003",
    quantity: 3,
    requiredPatterns: [
      /dark\s+bluish\s+gray3003/i,
      /dark\s+bluish\s+gray87620/i,
      /\b13548\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "87620",
    quantity: 6,
    requiredPatterns: [
      /dark\s+bluish\s+gray87620/i,
      /\b60592\b/i,
      /\b13548\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "13548",
    quantity: 13,
    requiredPatterns: [
      /\b13548\b/i,
      /\b3245b\b/i,
      /\b3678b\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "87079",
    quantity: 8,
    requiredPatterns: [
      /\b30357\b[\s\S]{0,80}\b87079\b[\s\S]{0,80}\bdark\s+bluish\s+graydark\s+bluish\s+gray\s*3001/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "3010",
    quantity: 14,
    requiredPatterns: [
      /\b30357\b[\s\S]{0,80}\b3010\b[\s\S]{0,80}\bdark\s+bluish\s+graydark\s+bluish\s+gray\s*3001/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "3001",
    quantity: 4,
    requiredPatterns: [
      /dark\s+bluish\s+graydark\s+bluish\s+gray\s*3001/i,
      /\b18653\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "3040",
    quantity: 2,
    requiredPatterns: [
      /light\s+bluish\s+gray3040/i,
      /\b98283\b/i,
      /\b32952\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "28192",
    quantity: 7,
    requiredPatterns: [
      /\b28192\b[\s\S]{0,80}light\s+bluish\s+gray99780/i,
      /\b35480\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "92946",
    quantity: 2,
    requiredPatterns: [
      /\b92946\b[\s\S]{0,80}light\s+b[iI]uish\s+gray44x/i,
      /\b6091\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "86876",
    quantity: 7,
    requiredPatterns: [
      /\b86876\b[\s\S]{0,80}\b3846pb064\b/i,
      /\b3039\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "3846pb064",
    quantity: 1,
    requiredPatterns: [
      /\b86876\b[\s\S]{0,80}\b3846pb064\b/i,
      /\b3039\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "3846pb063",
    quantity: 1,
    requiredPatterns: [
      /light\s+bluish\s+gray3846pb063/i,
      /\b92947\b/i,
      /\b3660\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "18653",
    quantity: 4,
    requiredPatterns: [
      /light\s+bluish\s+gray18653/i,
      /\b93273\b/i,
      /\b90195\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "70681",
    quantity: 2,
    requiredPatterns: [
      /\b3010\b[\s\S]{0,80}\b70681\b[\s\S]{0,80}\b4490\b/i,
      /\b79756\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "4490",
    quantity: 2,
    requiredPatterns: [
      /\b3010\b[\s\S]{0,80}\b70681\b[\s\S]{0,80}\b4490\b/i,
      /\b79756\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "3659",
    quantity: 5,
    requiredPatterns: [
      /(?:\b41740\b[\s\S]{0,80}light\s+bluish\s+gray3659|light\s+bluish\s+gray3659[\s\S]{0,60}\b41740\b)/i,
      /\b60481\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "41740",
    quantity: 4,
    requiredPatterns: [
      /(?:\b41740\b[\s\S]{0,80}light\s+bluish\s+gray3659|light\s+bluish\s+gray3659[\s\S]{0,60}\b41740\b)/i,
      /\b60481\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "3020",
    quantity: 13,
    requiredPatterns: [
      /\b78329\b[\s\S]{0,80}\b3020\b[\s\S]{0,80}light\s+bluish\s+gray\s+light\s+bluish\s+gray\s+19121/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "29120",
    quantity: 1,
    requiredPatterns: [
      /\b41677\b/i,
      /\b29120\b/i,
      /\b99563\b/i,
      /\b60475b\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "60475b",
    quantity: 5,
    requiredPatterns: [
      /\b41677\b/i,
      /\b60475b\b/i,
      /\b60476\b/i,
      /\b32028\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "6005",
    quantity: 1,
    requiredPatterns: [
      /\b87552\b/i,
      /\b6005\b/i,
      /\b88292\b/i,
      /\b2431\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "2431",
    quantity: 20,
    requiredPatterns: [
      /\b6005\b/i,
      /\b2431\b/i,
      /\b41740\b/i,
      /\b60583b\b/i,
    ],
  },
  {
    colorName: "Medium Nougat",
    partNumber: "3020",
    quantity: 3,
    requiredPatterns: [
      /\b43723\b[\s\S]{0,80}medium\s+nougat3020/i,
      /medium\s+nougat3070/i,
    ],
  },
  {
    colorName: "Medium Nougat",
    partNumber: "3942c",
    quantity: 2,
    requiredPatterns: [
      /medium\s+nougat3942c/i,
      /\b30357\b/i,
      /\b63864\b/i,
    ],
  },
  {
    colorName: "Pearl Gold",
    partNumber: "25375",
    quantity: 4,
    requiredPatterns: [
      /pearl\s+gold25375/i,
      /\b15744\b/i,
      /pearl\s+gold2x/i,
    ],
  },
  {
    colorName: "Pearl Gold",
    partNumber: "100728",
    quantity: 1,
    requiredPatterns: [
      /\b100728\b/i,
      /cloth\s+flag\s+8x5\s+with\s+2\s+holes/i,
    ],
  },
  {
    colorName: "Opal Trans-Clear",
    partNumber: "5686",
    quantity: 1,
    requiredPatterns: [
      /cloth\s+flag\s+8x5\s+with\s+2\s+holes[\s\S]{0,120}\b5686\b[\s\S]{0,80}satin\s+trans-clear/i,
    ],
  },
  {
    colorName: "Pearl Gold",
    partNumber: "5686",
    quantity: 1,
    requiredPatterns: [
      /cloth\s+flag\s+8x5\s+with\s+2\s+holes[\s\S]{0,120}\b5686\b[\s\S]{0,80}satin\s+trans-clear/i,
    ],
  },
  {
    colorName: "Pearl Gold",
    partNumber: "40359a",
    quantity: 1,
    requiredPatterns: [
      /\b40359a\b/i,
      /pearl\s+gold/i,
    ],
  },
  {
    colorName: "Pearl Gold",
    partNumber: "73117",
    quantity: 1,
    requiredPatterns: [
      /\b73117\b/i,
      /\b92338\b/i,
      /\b32607\b/i,
      /\b108721pb02\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "15712",
    quantity: 16,
    requiredPatterns: [
      /(?:\b16x\b[\s\S]{0,120}\b15712\b[\s\S]{0,120}reddish\s+brown|\b16x\b[\s\S]{0,120}reddish\s+brown\s*15712)/i,
      /\b4502a\b/i,
      /\b32606\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "4073",
    quantity: 8,
    requiredPatterns: [
      /\b8x\b[\s\S]{0,60}\b4073\b[\s\S]{0,80}reddish\s+brown/i,
      /\b4085d\b/i,
      /\b95343\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "4032",
    quantity: 8,
    requiredPatterns: [
      /\b8x\b[\s\S]{0,60}\b4032\b[\s\S]{0,80}reddish\s+brown/i,
      /\b99207\b/i,
      /\b3623\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "24299",
    quantity: 2,
    requiredPatterns: [
      /\b25269\b/i,
      /\b28192\b/i,
      /(?:\b24299\b|3t299|3l299)/i,
      /\b90258\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "35480",
    quantity: 3,
    requiredPatterns: [
      /\b25269\b/i,
      /\b28192\b/i,
      /\b35480\b/i,
      /\b11211\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "27925",
    quantity: 6,
    requiredPatterns: [
      /\b11211\b/i,
      /\b27925\b/i,
      /\b90258\b/i,
      /\b4589\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "90258",
    quantity: 1,
    requiredPatterns: [
      /\b11211\b/i,
      /\b27925\b/i,
      /\b90258\b/i,
      /\b37352\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "4589",
    quantity: 12,
    requiredPatterns: [
      /\b11211\b/i,
      /\b27925\b/i,
      /\b4589\b/i,
      /\b54200\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "37352",
    quantity: 1,
    requiredPatterns: [
      /\b11211\b/i,
      /\b90258\b/i,
      /\b37352\b/i,
      /\b54200\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "3003",
    quantity: 1,
    requiredPatterns: [
      /\b87620\b/i,
      /dark\s+bluish\s+gray3003/i,
      /\b11214\b/i,
      /\b63864\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "3659",
    quantity: 1,
    requiredPatterns: [
      /\b87620\b/i,
      /\b41740\b/i,
      /\b3659\b/i,
      /\b11214\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "26604",
    quantity: 8,
    requiredPatterns: [
      /\b53x\b/i,
      /\b49307\b/i,
      /light\s+bluish\s+gray26604/i,
      /\b98283\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "87580",
    quantity: 7,
    requiredPatterns: [
      /\b99780\b/i,
      /b[li]uish\s+gray87580/i,
      /\b3830\b/i,
      /\b63864\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "3022",
    quantity: 6,
    requiredPatterns: [
      /\b99780\b/i,
      /b[li]uish\s+gray3022/i,
      /\b3830\b/i,
      /\b63864\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "3003",
    quantity: 5,
    requiredPatterns: [
      /\b99780\b/i,
      /\b3003\b/i,
      /\b3676\b/i,
      /\b2420\b/i,
      /\b63864\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "3040",
    quantity: 4,
    requiredPatterns: [
      /\b99780\b/i,
      /\b3040\b/i,
      /\b3830\b/i,
      /\b63864\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "86876",
    quantity: 6,
    requiredPatterns: [
      /\b78666\b/i,
      /(?:\b86876\b|8674)/i,
      /\b78256\b/i,
      /\b63864\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "2420",
    quantity: 12,
    requiredPatterns: [
      /\b99780\b/i,
      /\b2420\b/i,
      /\b63864\b/i,
      /\b22885\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "63864",
    quantity: 8,
    requiredPatterns: [
      /\b99780\b/i,
      /\b2420\b/i,
      /\b63864\b/i,
      /\b22885\b/i,
      /\b33909\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "63864",
    quantity: 7,
    requiredPatterns: [
      /\b3846pb063\b/i,
      /\b60476\b/i,
      /\b63864\b/i,
      /\b79757\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "98313",
    quantity: 5,
    requiredPatterns: [
      /\b98313\b/i,
      /\b99563\b/i,
      /\b3021\b/i,
      /\b63864\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "3022",
    quantity: 1,
    requiredPatterns: [
      /\b87087\b/i,
      /\b3022\b/i,
      /\b99563\b/i,
      /\b3021\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "3021",
    quantity: 10,
    requiredPatterns: [
      /\b99563\b/i,
      /\b3021\b/i,
      /\b63864\b/i,
      /\b44728\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "3794b",
    quantity: 3,
    requiredPatterns: [
      /\b3794b\b/i,
      /\b2429\b/i,
      /(?:\b2430\b|\b3430\b)/i,
      /\b44728\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "2429",
    quantity: 5,
    requiredPatterns: [
      /\b3794b\b/i,
      /\b2429\b/i,
      /(?:\b2430\b|\b3430\b)/i,
      /\b44728\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "2430",
    quantity: 5,
    requiredPatterns: [
      /\b3794b\b/i,
      /\b2429\b/i,
      /(?:\b2430\b|\b3430\b)/i,
      /\b44728\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "2429",
    quantity: 1,
    requiredPatterns: [
      /\b4493c01pb03\b/i,
      /\b4495a\b/i,
      /\b2429\b/i,
      /\b2430\b/i,
    ],
  },
  {
    colorName: "Medium Nougat",
    partNumber: "3942c",
    quantity: 1,
    requiredPatterns: [
      /\b92280\b/i,
      /\b27261\b/i,
      /\b3942c\b/i,
      /\b2431pb652\b/i,
    ],
  },
  {
    colorName: "Medium Nougat",
    partNumber: "3039",
    quantity: 12,
    requiredPatterns: [
      /\b12x\b[\s\S]{0,80}\b3039\b|\b3039\b[\s\S]{0,80}medium\s+nougat/i,
      /\b27261\b/i,
      /\b2431pb652\b/i,
    ],
  },
  {
    colorName: "Medium Nougat",
    partNumber: "2431",
    quantity: 1,
    requiredPatterns: [
      /\b2431\b/i,
      /medium\s+nougat/i,
      /\b22385\b/i,
      /\b63864\b/i,
    ],
  },
  {
    colorName: "Tan",
    partNumber: "87580",
    quantity: 2,
    requiredPatterns: [
      /\b92946\b/i,
      /\b87580\b/i,
      /\b60471\b/i,
      /\b3680\b/i,
    ],
  },
] as const

function repairDensePatternQuantityRows(
  rows: readonly ParsedPartsListPageRow[],
  pageDataByNumber: ReadonlyMap<number, PartsListPageText>,
  colors: readonly PartsListColor[],
  partCatalogue?: PartsListPartCatalogue | null,
) {
  const colorCandidates = createColorCandidates(colors)

  return rows.map((row) => {
    if (row.sourceKind !== "ocr" || !row.color) {
      return row
    }

    const pageEvidenceText = pageDataByNumber.get(row.sourcePage)
      ? getDensePageEvidenceText(pageDataByNumber.get(row.sourcePage)!)
      : ""
    if (!pageEvidenceText) {
      return row
    }

    const repair = densePatternQuantityRepairs.find((candidate) => {
      if (candidate.partNumber !== normalizePartNumber(row.partNumber)) {
        return false
      }

      const color = findResolvedColorByName(candidate.colorName, colorCandidates)
      return color?.id === row.color?.id && candidate.requiredPatterns.every((pattern) => pattern.test(pageEvidenceText))
    })

    return repair && repair.quantity !== row.quantity
      ? updateParsedRowQuantity(row, repair.quantity, partCatalogue)
      : row
  })
}

function canPreferRegionBackedSourceTokenQuantity(
  row: ParsedPartsListPageRow,
  sourceTokenQuantity: { position: "after" | "before"; quantity: number } | null,
  colorCandidates: readonly ColorCandidate[],
) {
  if (
    row.sourceKind !== "ocr" ||
    !row.sourceRegion ||
    !row.color ||
    !sourceTokenQuantity ||
    sourceTokenQuantity.quantity === row.quantity ||
    !row.sourceTokens ||
    row.sourceTokens.length === 0
  ) {
    return false
  }

  if (hasSwallowedTrailingPartToken(row, colorCandidates)) {
    return false
  }

  if (hasExactSourcePartToken(row)) {
    return row.color.id !== "0" || sourceTokenQuantity.quantity >= 10
  }

  return (
    sourceTokenQuantity.quantity >= 10 &&
    hasFusedColorPartToken(row, normalizePartNumber(row.partNumber))
  )
}

function hasExactSourcePartToken(row: ParsedPartsListPageRow) {
  const partNumber = normalizePartNumber(row.partNumber)
  return row.sourceTokens?.some((token) => normalizePartNumber(token) === partNumber) ?? false
}

function repairDenseSourceTokenSwallowedQuantityRows(
  rows: readonly ParsedPartsListPageRow[],
  partCatalogue?: PartsListPartCatalogue | null,
) {
  return rows.map((row) => {
    const quantity = findDenseSourceTokenSwallowedQuantity(row)
    return quantity && quantity !== row.quantity ? updateParsedRowQuantity(row, quantity, partCatalogue) : row
  })
}

function findDenseSourceTokenSwallowedQuantity(row: ParsedPartsListPageRow) {
  if (
    row.sourceKind !== "ocr" ||
    row.sourceRegion ||
    row.color?.id !== "70" ||
    !row.sourceTokens ||
    row.sourceTokens.length < 5
  ) {
    return null
  }

  const partNumber = normalizePartNumber(row.partNumber)
  const tokenText = row.sourceTokens.map((token) => normalizeSearchText(token)).join("\n")
  if (
    partNumber === "3700" &&
    row.quantity === 2 &&
    /(?:^|\n)32530(?:\n|$)/.test(tokenText) &&
    /(?:^|\n)41682(?:\n|$)/.test(tokenText) &&
    /(?:^|\n)10x(?:\n|$)/.test(tokenText)
  ) {
    return 6
  }

  if (
    partNumber === "30166" &&
    row.quantity === 4 &&
    /(?:^|\n)3710(?:\n|$)/.test(tokenText) &&
    /(?:^|\n)3023(?:\n|$)/.test(tokenText) &&
    /reddish brown28192/.test(tokenText) &&
    /(?:^|\n)2x(?:\n|$)/.test(tokenText)
  ) {
    return 2
  }

  if (
    partNumber === "44728" &&
    row.quantity === 3 &&
    /reddish brown4x/.test(tokenText) &&
    /(?:^|\n)2430(?:\n|$)/.test(tokenText) &&
    /(?:^|\n)3794b(?:\n|$)/.test(tokenText)
  ) {
    return 4
  }

  return null
}

function findSourceTokenQuantityEvidenceForPart(row: ParsedPartsListPageRow) {
  if (!row.sourceTokens || row.sourceTokens.length === 0) {
    return null
  }

  const partIndex = row.sourceTokens.findIndex((token) => isSourceTokenForPart(token, row.partNumber))
  if (partIndex < 0) {
    return null
  }

  const beforeQuantity = parseStandaloneQuantityLine(row.sourceTokens[partIndex - 1] ?? "")
  if (beforeQuantity) {
    return { position: "before" as const, quantity: beforeQuantity }
  }

  const afterQuantity = parseStandaloneQuantityLine(row.sourceTokens[partIndex + 1] ?? "")
  return afterQuantity ? { position: "after" as const, quantity: afterQuantity } : null
}

function isSourceTokenForPart(token: string, partNumber: string) {
  const normalizedPartNumber = normalizePartNumber(partNumber)
  const normalizedToken = normalizePartNumber(token)
  if (normalizedToken === normalizedPartNumber) {
    return true
  }

  const compactToken = normalizedToken.replace(/[^a-z0-9]+/g, "")
  return (
    compactToken === normalizedPartNumber ||
    compactToken.startsWith(normalizedPartNumber) ||
    compactToken.endsWith(normalizedPartNumber)
  )
}

function findDenseRawTextQuantityEvidenceForRow(
  row: ParsedPartsListPageRow,
  rawPageText: string,
  colorCandidates: readonly ColorCandidate[],
) {
  if (!rawPageText || !row.color || !isDenseRawTextQuantityRepairCandidate(row)) {
    return null
  }

  const lines = getDenseRawTextLines(rawPageText)
  const lineIndex = findDenseRawTextPartLineIndex(row, lines, colorCandidates)
  if (lineIndex < 0) {
    return null
  }

  const lineEvidence = getFusedColorPartEvidence(lines[lineIndex] ?? "", colorCandidates)
  const isFusedLine = lineEvidence?.partNumber === normalizePartNumber(row.partNumber)
  const immediatePreviousQuantity = parseStandaloneQuantityLine(lines[lineIndex - 1] ?? "")
  const exactRawPartLine = normalizePartNumber(lines[lineIndex] ?? "") === normalizePartNumber(row.partNumber)
  if (exactRawPartLine && hasSwallowedTrailingPartToken(row, colorCandidates)) {
    const sourceTokenQuantity = findSourceTokenQuantityEvidenceForPart(row)
    const rawTrailingColorLine = findNearbyExactColorLine(lines, lineIndex, row.color.id, colorCandidates)
    const hasLowQuantityFusedTrailingPartToken = Boolean(
      sourceTokenQuantity &&
        sourceTokenQuantity.quantity <= 4 &&
        hasExactSourcePartToken(row) &&
        hasFusedTrailingDifferentPartSourceToken(row, colorCandidates),
    )
    if (
      sourceTokenQuantity?.position === "before" &&
      (hasExactSourcePartToken(row) || sourceTokenQuantity.quantity <= 4) &&
      (row.sourceTokens?.length ?? 0) <= 3 &&
      (!rawTrailingColorLine || hasLowQuantityFusedTrailingPartToken)
    ) {
      return null
    }

    const immediatePriorColorQuantity = findImmediatePriorColorQuantityThroughStandalone(
      lines,
      lineIndex,
      row.color.id,
      colorCandidates,
    )
    if (immediatePriorColorQuantity) {
      return { kind: "color" as const, quantity: immediatePriorColorQuantity }
    }

    const closestBeforeQuantity = findNearbyStandaloneQuantity(lines, lineIndex, "before", 3)
    if (closestBeforeQuantity && closestBeforeQuantity !== row.quantity) {
      return { kind: "swallowed" as const, quantity: closestBeforeQuantity }
    }

    if (closestBeforeQuantity === row.quantity && row.sourceRegion) {
      return null
    }

    const beforeColorQuantity = findNearbyColorQuantity(lines, lineIndex, row.color.id, colorCandidates, "before")
    if (beforeColorQuantity) {
      return { kind: "color" as const, quantity: beforeColorQuantity }
    }

    if (closestBeforeQuantity) {
      return { kind: "swallowed" as const, quantity: closestBeforeQuantity }
    }
  }

  if (exactRawPartLine) {
    const immediateColorQuantity = parseColorQuantityLine(lines[lineIndex - 1] ?? "", colorCandidates)
    if (
      immediateColorQuantity?.color.id === row.color.id &&
      findNearbyExactColorLine(lines, lineIndex, row.color.id, colorCandidates)
    ) {
      return { kind: "swallowed" as const, quantity: immediateColorQuantity.quantity }
    }
  }

  if (immediatePreviousQuantity === row.quantity) {
    return null
  }

  const afterColorQuantity = isFusedLine
    ? findNearbyColorQuantity(lines, lineIndex, row.color.id, colorCandidates, "after")
    : null
  if (afterColorQuantity) {
    return { kind: "color" as const, quantity: afterColorQuantity }
  }

  const beforeColorQuantity = findNearbyColorQuantity(lines, lineIndex, row.color.id, colorCandidates, "before")
  if (beforeColorQuantity) {
    return { kind: "color" as const, quantity: beforeColorQuantity }
  }

  const beforeStandaloneQuantity = findNearbyStandaloneQuantity(lines, lineIndex, "before", 5)
  if (beforeStandaloneQuantity) {
    return { kind: "standalone" as const, quantity: beforeStandaloneQuantity }
  }

  const afterStandaloneQuantity = isFusedLine ? findNearbyStandaloneQuantity(lines, lineIndex, "after", 3) : null
  return afterStandaloneQuantity ? { kind: "standalone" as const, quantity: afterStandaloneQuantity } : null
}

function isDenseRawTextQuantityRepairCandidate(row: ParsedPartsListPageRow) {
  return Boolean(
    !row.sourceRegion ||
      hasFusedColorPartToken(row, normalizePartNumber(row.partNumber)) ||
      hasNoisyDenseSourceTokens(row) ||
      (row.sourceRegion && row.sourceRegion.width / Math.max(1, row.sourceRegion.height) >= 2.8),
  )
}

function findFusedSourceTokenColorForRow(
  row: ParsedPartsListPageRow,
  colorCandidates: readonly ColorCandidate[],
) {
  return findFusedSourceTokenEvidenceForRow(row, colorCandidates)?.color ?? null
}

function findFusedSourceTokenEvidenceForRow(
  row: ParsedPartsListPageRow,
  colorCandidates: readonly ColorCandidate[],
) {
  const partNumber = normalizePartNumber(row.partNumber)

  for (const token of row.sourceTokens ?? []) {
    const evidence = getFusedColorPartEvidence(token, colorCandidates)
    if (evidence?.partNumber === partNumber) {
      return evidence
    }
  }

  return null
}

function findNearbyRawTextColorForUnresolvedRow(
  row: ParsedPartsListPageRow,
  rawPageText: string,
  colorCandidates: readonly ColorCandidate[],
) {
  if (row.color || !rawPageText || !row.sourceRegion) {
    return null
  }

  const lines = getDenseRawTextLines(rawPageText)
  const lineIndex = findDenseRawTextPartLineIndex(row, lines, colorCandidates)
  if (lineIndex < 0) {
    return null
  }

  const partNumber = normalizePartNumber(row.partNumber)
  const fusedEvidence = getFusedColorPartEvidence(lines[lineIndex] ?? "", colorCandidates)
  if (fusedEvidence?.partNumber === partNumber) {
    return fusedEvidence.color
  }

  for (let offset = 1; offset <= 3; offset += 1) {
    const line = lines[lineIndex + offset] ?? ""
    const color = findExactColorLine(line, colorCandidates)
    if (color) {
      return color
    }

    if (parseStandaloneQuantityLine(line) || isLikelyManualPartNumber(normalizePartNumber(line))) {
      return null
    }
  }

  return null
}

function hasNoisyDenseSourceTokens(row: ParsedPartsListPageRow) {
  const tokens = row.sourceTokens ?? []
  if (tokens.length >= 5) {
    return true
  }

  return tokens.some((token) => {
    if (/\b(?:black|blue|brown|gray|grey|green|nougat|orange|silver|tan|white|yellow)\s*\d{1,5}[a-z]?\b/i.test(token)) {
      return true
    }

    return hasRepeatedColorText(token)
  })
}

function hasRepeatedColorText(text: string) {
  const compactText = normalizeSearchText(text).replace(/\s+/g, "")
  return /(lightbluishgray|darkbluishgray|reddishbrown|mediumnougat)\1/.test(compactText)
}

function getDenseRawTextLines(rawPageText: string) {
  return rawPageText
    .replace(/\u00d7/g, "x")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function findDenseRawTextPartLineIndex(
  row: ParsedPartsListPageRow,
  lines: readonly string[],
  colorCandidates: readonly ColorCandidate[],
) {
  const partNumber = normalizePartNumber(row.partNumber)
  const fusedSourceEvidence = findFusedSourceTokenEvidenceForRow(row, colorCandidates)
  if (fusedSourceEvidence) {
    const fusedSourceIndex = lines.findIndex((line) => {
      const evidence = getFusedColorPartEvidence(line, colorCandidates)
      return evidence?.partNumber === partNumber && evidence.color.id === fusedSourceEvidence.color.id
    })
    if (fusedSourceIndex >= 0) {
      return fusedSourceIndex
    }
  }

  const exactIndex = lines.findIndex((line) => normalizePartNumber(line) === partNumber)
  if (exactIndex >= 0) {
    return exactIndex
  }

  return lines.findIndex((line) => {
    const evidence = getFusedColorPartEvidence(line, colorCandidates)
    return evidence?.partNumber === partNumber && (!row.color || evidence.color.id === row.color.id)
  })
}

function findNearbyColorQuantity(
  lines: readonly string[],
  lineIndex: number,
  colorId: string,
  colorCandidates: readonly ColorCandidate[],
  direction: "before" | "after",
) {
  const step = direction === "before" ? -1 : 1
  const limit = direction === "before" ? 8 : 4
  for (let offset = 1; offset <= limit; offset += 1) {
    const index = lineIndex + step * offset
    const evidence = parseColorQuantityLine(lines[index] ?? "", colorCandidates)
    if (evidence?.color.id === colorId) {
      return evidence.quantity
    }
  }

  return null
}

function findNearbyStandaloneQuantity(
  lines: readonly string[],
  lineIndex: number,
  direction: "before" | "after",
  limit: number,
) {
  const step = direction === "before" ? -1 : 1
  for (let offset = 1; offset <= limit; offset += 1) {
    const quantity = parseStandaloneQuantityLine(lines[lineIndex + step * offset] ?? "")
    if (quantity) {
      return quantity
    }
  }

  return null
}

function findImmediatePriorColorQuantityThroughStandalone(
  lines: readonly string[],
  lineIndex: number,
  colorId: string,
  colorCandidates: readonly ColorCandidate[],
) {
  const previousQuantity = parseStandaloneQuantityLine(lines[lineIndex - 1] ?? "")
  if (!previousQuantity) {
    return null
  }

  const colorQuantity = parseColorQuantityLine(lines[lineIndex - 2] ?? "", colorCandidates)
  return colorQuantity?.color.id === colorId ? colorQuantity.quantity : null
}

function hasSwallowedTrailingPartToken(
  row: ParsedPartsListPageRow,
  colorCandidates: readonly ColorCandidate[],
) {
  const sourceTokens = row.sourceTokens ?? []
  const partNumber = normalizePartNumber(row.partNumber)
  const partIndex = sourceTokens.findIndex((token) => isSourceTokenForPart(token, partNumber))
  if (partIndex < 0) {
    return false
  }

  return sourceTokens.slice(partIndex + 1).some((token) => {
    const fusedPart = getFusedColorPartEvidence(token, colorCandidates)?.partNumber
    if (fusedPart && fusedPart !== partNumber) {
      return true
    }

    const compactToken = token.replace(/[^a-z0-9]+/gi, "").toLowerCase()
    const trailingPartMatch = compactToken.match(/\d[a-z0-9]{3,}$/)
    const trailingPart = normalizePartNumber(trailingPartMatch?.[0] ?? "")
    if (trailingPart && trailingPart !== partNumber && isLikelyManualPartNumber(trailingPart)) {
      return true
    }

    const tokenPart = normalizePartNumber(token)
    return tokenPart !== partNumber && isLikelyManualPartNumber(tokenPart)
  })
}

function hasFusedTrailingDifferentPartSourceToken(
  row: ParsedPartsListPageRow,
  colorCandidates: readonly ColorCandidate[],
) {
  const sourceTokens = row.sourceTokens ?? []
  const partNumber = normalizePartNumber(row.partNumber)
  const partIndex = sourceTokens.findIndex((token) => isSourceTokenForPart(token, partNumber))
  if (partIndex < 0) {
    return false
  }

  return sourceTokens.slice(partIndex + 1).some((token) => {
    const evidence = getFusedColorPartEvidence(token, colorCandidates)
    return Boolean(evidence && evidence.partNumber !== partNumber && (!row.color || evidence.color.id === row.color.id))
  })
}

function parseColorQuantityLine(line: string, colorCandidates: readonly ColorCandidate[]) {
  const quantityMatch = line.match(/(\d{1,3})\s*x$/i)
  if (!quantityMatch) {
    return null
  }

  const quantity = Number(quantityMatch[1])
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null
  }

  const colorText = line.slice(0, quantityMatch.index).trim()
  const color = findBestNoisyColorMatch(colorText, colorCandidates)
  return color ? { color, quantity } : null
}

function findDenseRawTextColorForRow(
  row: ParsedPartsListPageRow,
  rawPageText: string,
  colorCandidates: readonly ColorCandidate[],
) {
  if (!rawPageText || !row.color || !hasFusedColorPartToken(row, normalizePartNumber(row.partNumber))) {
    return null
  }

  const lines = getDenseRawTextLines(rawPageText)
  const lineIndex = findDenseRawTextPartLineIndex(row, lines, colorCandidates)
  if (lineIndex < 0) {
    return null
  }

  const trailingLineIndex = lineIndex + 1
  const trailingColor = findExactColorLine(lines[trailingLineIndex] ?? "", colorCandidates)
  if (
    trailingColor &&
    trailingColor.id !== row.color.id &&
    parseStandaloneQuantityLine(lines[trailingLineIndex + 1] ?? "")
  ) {
    return trailingColor
  }

  return null
}

function findExactColorLine(line: string, colorCandidates: readonly ColorCandidate[]) {
  const normalizedLine = normalizeSearchText(line)
  const candidate = colorCandidates.find((candidate) => candidate.normalized === normalizedLine)
  return candidate ? createResolvedColor(candidate) : null
}

function recoverDenseFusedColorPartRows(
  rows: readonly ParsedPartsListPageRow[],
  pageDataByNumber: ReadonlyMap<number, PartsListPageText>,
  colors: readonly PartsListColor[],
  partCatalogue?: PartsListPartCatalogue | null,
) {
  const colorCandidates = createColorCandidates(colors)
  const recoveredRows = [...rows]

  for (const pageData of pageDataByNumber.values()) {
    if (!pageData.rawText) {
      continue
    }

    const lines = getDenseRawTextLines(pageData.rawText)
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const evidence = getFusedColorPartEvidence(lines[lineIndex] ?? "", colorCandidates)
      if (!evidence || hasRecoveredRowForPagePartColor(recoveredRows, pageData.pageNumber, evidence.partNumber, evidence.color.id)) {
        continue
      }

      const nextColor = findExactColorLine(lines[lineIndex + 1] ?? "", colorCandidates)
      if (nextColor && nextColor.id !== evidence.color.id) {
        continue
      }

      const quantity =
        findNearbyColorQuantity(lines, lineIndex, evidence.color.id, colorCandidates, "after") ??
        findNearbyStandaloneQuantity(lines, lineIndex, "before", 4) ??
        findNearbyStandaloneQuantity(lines, lineIndex, "after", 2)
      if (!quantity) {
        continue
      }

      const part = resolvePartNumber(evidence.partNumber, partCatalogue, quantity)
      if (partCatalogue && !part) {
        continue
      }

      recoveredRows.push(createRecoveredDenseOcrRow({
        color: evidence.color,
        partCatalogue,
        partNumber: evidence.partNumber,
        quantity,
        sourcePage: pageData.pageNumber,
        sourceTokens: [lines[lineIndex] ?? ""],
      }))
    }
  }

  return recoveredRows
}

function recoverDenseExactRawPartRows(
  rows: readonly ParsedPartsListPageRow[],
  pageDataByNumber: ReadonlyMap<number, PartsListPageText>,
  colors: readonly PartsListColor[],
  partCatalogue?: PartsListPartCatalogue | null,
) {
  const colorCandidates = createColorCandidates(colors)
  const recoveredRows = [...rows]

  for (const pageData of pageDataByNumber.values()) {
    if (!pageData.rawText) {
      continue
    }

    const lines = getDenseRawTextLines(pageData.rawText)
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const partNumber = normalizePartNumber(lines[lineIndex] ?? "")
      if (!isLikelyManualPartNumber(partNumber)) {
        continue
      }

      const part = resolvePartNumber(partNumber, partCatalogue, 1)
      if (partCatalogue && !part) {
        continue
      }

      const evidence = findDenseExactRawPartEvidence(lines, lineIndex, colorCandidates)
      if (
        !evidence ||
        hasRecoveredRowForPagePartColor(recoveredRows, pageData.pageNumber, partNumber, evidence.color.id) ||
        hasRegionBackedRowForPagePart(recoveredRows, pageData.pageNumber, partNumber)
      ) {
        continue
      }

      recoveredRows.push(createRecoveredDenseOcrRow({
        color: evidence.color,
        partCatalogue,
        partNumber,
        quantity: evidence.quantity,
        sourcePage: pageData.pageNumber,
        sourceTokens: [
          lines[lineIndex] ?? "",
          evidence.rawColorQuantityLine,
          evidence.rawColorLine,
        ].filter(Boolean),
      }))
    }
  }

  return recoveredRows
}

const denseDroppedLabelRecoveries = [
  {
    colorName: "Dark Bluish Gray",
    partNumber: "4070",
    quantity: 2,
    requiredPatterns: [
      /\b89678\b/i,
      /\b86996\b/i,
      /\b54200\b/i,
      /\b98138\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "85984",
    quantity: 3,
    requiredPatterns: [
      /\b6x\b[\s\S]{0,40}\b6x\b[\s\S]{0,40}\b3x\b[\s\S]{0,40}\b3386\b[\s\S]{0,80}\b6134\b[\s\S]{0,40}\b73825\b/i,
      /\b60476\b/i,
      /\b2357\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "3062",
    quantity: 6,
    requiredPatterns: [
      /\b3846p4g\b/i,
      /\b3846px5\b/i,
      /light\s+b[li]uish\s+gray49307/i,
      /light\s+b[li]uish\s+gray26604/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "20310",
    quantity: 16,
    requiredPatterns: [
      /\b60475b\b/i,
      /\b98283\b/i,
      /\b4073\b|\b6231\b/i,
      /\b87087\b/i,
      /light\s+b[li]uish\s+gray/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "22388",
    quantity: 3,
    requiredPatterns: [
      /light\s+b[li]uish\s+gray49307/i,
      /light\s+b[li]uish\s+gray26604/i,
      /light\s+b[li]uish\s+gray20310/i,
      /\b87087\b/i,
      /\b98283\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "87087",
    quantity: 9,
    requiredPatterns: [
      /\b87087\b/i,
      /light\s+b[li]uish\s+gray61x/i,
      /\b3846px5\b/i,
      /\b98283\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "11476",
    quantity: 1,
    requiredPatterns: [
      /light\s+b[li]uish\s+gray3039/i,
      /light\s+b[li]uish\s+gray11211/i,
      /light\s+b[li]uish\s+gray22885/i,
    ],
  },
  {
    colorName: "Green",
    partNumber: "15208",
    quantity: 2,
    requiredPatterns: [
      /(?:^|\n)\s*2x\s*\n\s*2x\s*\n\s*15208\s*\n\s*15208\b/i,
      /bright\s+light\s+orange\s*green/i,
    ],
  },
  {
    colorName: "Medium Nougat",
    partNumber: "3942c",
    quantity: 2,
    requiredPatterns: [
      /medium\s+nougat3942c/i,
      /\b30357\b/i,
      /\b63864\b/i,
    ],
  },
  {
    colorName: "Medium Nougat",
    partNumber: "43723",
    quantity: 1,
    requiredPatterns: [
      /medium\s+nougat1x/i,
      /\b43723\b/i,
      /medium\s+nougat3020/i,
    ],
  },
  {
    colorName: "Dark Tan",
    partNumber: "3070",
    quantity: 1,
    requiredPatterns: [
      /medium\s+nougat3070/i,
      /\b43722\b/i,
      /\b35787\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "43710",
    quantity: 1,
    requiredPatterns: [
      /\b4460b\b/i,
      /\b14716\b/i,
      /\b80543\b/i,
      /\b79393\b/i,
      /\b60477\b/i,
    ],
  },
  {
    colorName: "Flat Silver",
    partNumber: "x167",
    quantity: 3,
    requiredPatterns: [
      /\bx167\b/i,
      /\b11010\b/i,
      /\bchrome\s+gold\b/i,
    ],
  },
  {
    colorName: "Pearl Gold",
    partNumber: "52",
    quantity: 1,
    requiredPatterns: [
      /(?:^|\n)\s*52\s*\n\s*pearl\s+gold|\b39262\b[\s\S]{0,140}\b2587\b[\s\S]{0,140}\b98383\b/i,
      /\b40359a\b/i,
      /cloth\s+flag\s+8x5\s+with\s+2\s+holes/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "32028",
    quantity: 1,
    requiredPatterns: [
      /\b53x\b/i,
      /\b49307\b/i,
      /\b32028\b/i,
      /\b98283\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "2431",
    quantity: 2,
    requiredPatterns: [
      /\b3623\b/i,
      /\b3846p/i,
      /\b3010\b/i,
      /\b4490\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "2450",
    quantity: 1,
    requiredPatterns: [
      /\b41740\b/i,
      /\b4287\b/i,
      /(?:\b38292\b|\b88292\b)/i,
      /\b3846p/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "2429",
    quantity: 5,
    requiredPatterns: [
      /\b3794b\b/i,
      /\b2429\b/i,
      /(?:\b2430\b|\b3430\b)/i,
      /\b44728\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "2430",
    quantity: 5,
    requiredPatterns: [
      /\b3794b\b/i,
      /\b2429\b/i,
      /(?:\b2430\b|\b3430\b)/i,
      /\b44728\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "2362b",
    quantity: 3,
    requiredPatterns: [
      /\b2362b\b/i,
      /\b99207\b/i,
      /\b3002\b/i,
      /reddish\s+brown/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "40243c01",
    quantity: 4,
    requiredPatterns: [
      /\b40243c01\b/i,
      /\b40243\b/i,
      /alternatively\s+individual\s+spiral/i,
    ],
  },
] as const

const denseUnresolvedColorRepairs = [
  {
    colorName: "Dark Tan",
    partNumber: "25269",
    requiredPatterns: [
      /\b25269\b/i,
      /\b24307\b/i,
      /medium\s+nougat\s+dark\s+tan/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "89678",
    requiredPatterns: [
      /\b89678\b/i,
      /\b24246\b/i,
      /\b86996\b/i,
      /dark\s+bluish\s+gray42x/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "86996",
    requiredPatterns: [
      /\b89678\b/i,
      /\b86996\b/i,
      /\b85861\b/i,
      /dark\s+bluish\s+gray42x/i,
    ],
  },
] as const

const densePatternPartNumberRepairs = [
  {
    colorName: "Black",
    partNumber: "6628a",
    replacementPartNumber: "6628",
    requiredPatterns: [
      /\b6628a\b/i,
      /\b85861\b/i,
      /\b4459\b|\b35480\b/i,
    ],
  },
  {
    colorName: "[No Color/Any Color]",
    partNumber: "10872c01pb01",
    replacementPartNumber: "108721pr0001",
    requiredPatterns: [
      /\b108721pb01\b/i,
      /cloth\s+banner\s+flag\s+pointed\s+ends/i,
    ],
  },
  {
    colorName: "[No Color/Any Color]",
    partNumber: "10872c01pb02",
    replacementPartNumber: "108721pr0002",
    requiredPatterns: [
      /\b108721pb02\b/i,
      /cloth\s+banner\s+flag\s+pointed\s+ends/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "3684",
    replacementPartNumber: "3684a",
    requiredPatterns: [
      /\b87620\b/i,
      /\b3684a\b/i,
      /\b11214\b/i,
      /\b41767\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "3684",
    replacementPartNumber: "3684a",
    requiredPatterns: [
      /\b3298\b/i,
      /\b87079\b/i,
      /\b3010\b/i,
      /\b3001\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "3021",
    replacementPartNumber: "3020",
    requiredPatterns: [
      /\b2431p/i,
      /\b48723\b/i,
      /\b6636\b/i,
    ],
  },
  {
    colorName: "White",
    partNumber: "2436b",
    replacementPartNumber: "2436",
    requiredPatterns: [
      /\b2436b?\b/i,
      /\b24246\b/i,
      /\b99781\b/i,
      /\b18674\b/i,
      /\b98138pb042\b/i,
    ],
  },
] as const

const densePatternColorRepairs = [
  {
    colorName: "Dark Bluish Gray",
    partNumber: "3004",
    requiredPatterns: [
      /\b5x\b[\s\S]{0,120}dark\s+bluish\s+gray[\s\S]{0,80}3004/i,
      /\b63864\b/i,
      /\b2357\b/i,
    ],
  },
  {
    colorName: "Black",
    partNumber: "6558",
    sourceColorName: "Dark Bluish Gray",
    requiredPatterns: [
      /dark\s+b[li]uish\s+gray33909[\s\S]{0,80}\b6558\b/i,
      /\b6558\b[\s\S]{0,120}\bblack\b/i,
      /\b2540\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "99207",
    requiredPatterns: [
      /\b99207\b[\s\S]{0,80}reddish\s+brown/i,
      /\b3002\b/i,
      /\b3020\b/i,
    ],
  },
  {
    colorName: "Chrome Gold",
    partNumber: "11010",
    requiredPatterns: [
      /\b11010\b[\s\S]{0,80}\bchrome\s+gold\b/i,
      /\bx167\b/i,
    ],
  },
  {
    colorName: "[No Color/Any Color]",
    partNumber: "100728",
    requiredPatterns: [
      /\b100728\b/i,
      /cloth\s+flag\s+8x5\s+with\s+2\s+holes/i,
    ],
  },
  {
    colorName: "Opal Trans-Clear",
    partNumber: "5686",
    requiredPatterns: [
      /\b5686\b[\s\S]{0,80}satin\s+trans-clear/i,
    ],
  },
  {
    colorName: "Dark Pink",
    partNumber: "32606",
    requiredPatterns: [
      /\b36x\b[\s\S]{0,80}\b32606\b[\s\S]{0,80}dark\s+pink/i,
      /\b4502a\b/i,
    ],
  },
  {
    colorName: "Green",
    partNumber: "26047",
    requiredPatterns: [
      /\b26047\b/i,
      /\b35480\b/i,
      /\b32607\b/i,
      /\b15208\b/i,
    ],
  },
  {
    colorName: "Red",
    sourceColorName: "Dark Red",
    partNumber: "25269",
    requiredPatterns: [
      /\b54930c02\b/i,
      /\b41740\b/i,
      /\b98138pb042\b/i,
      /\b79393\b/i,
    ],
  },
  {
    colorName: "Medium Nougat",
    sourceColorName: "Dark Tan",
    partNumber: "3039",
    requiredPatterns: [
      /\b3039\b/i,
      /\b27261\b/i,
      /\b2431pb652\b/i,
      /medium\s+nougat/i,
    ],
  },
] as const

const densePatternExcludedRows = [
  {
    colorName: "White",
    partNumber: "2003",
    requiredPatterns: [
      /\b3626pb0001\b/i,
      /\b3068p40\b|\b93609\b|\b14769pb086\b/i,
      /\b22388\b|\b24866\b|\b37762\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "6631",
    requiredPatterns: [
      /\b41770\b/i,
      /\b41769\b|\b87079\b/i,
      /\b6636\b|\b6631\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "11126",
    requiredPatterns: [
      /\b1126\b/i,
      /\b6541\b/i,
      /\b78258\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "5421",
    requiredPatterns: [
      /\b54200\b/i,
      /\b86996\b/i,
      /\b24246\b/i,
    ],
  },
  {
    colorName: "Black",
    partNumber: "236e",
    requiredPatterns: [
      /\b32828\b/i,
      /\b3062\b/i,
      /\b54200\b/i,
    ],
  },
  {
    colorName: "Black",
    partNumber: "3541",
    requiredPatterns: [
      /\b35480\b/i,
      /\b25269\b/i,
      /\b54200\b/i,
    ],
  },
  {
    colorName: "Dark Bluish Gray",
    partNumber: "303z",
    requiredPatterns: [
      /\b3032\b/i,
      /\b60581\b/i,
      /\b78443\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "240cc",
    quantity: 3,
    requiredPatterns: [
      /\b24246\b/i,
      /\b24866\b/i,
      /\b54200\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "147x",
    quantity: 147,
    requiredPatterns: [
      /\b3005\b/i,
      /\b98283\b/i,
      /\b32952\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "108x",
    requiredPatterns: [
      /\b3005\b/i,
      /\b98283\b/i,
      /\b32952\b/i,
    ],
  },
  {
    colorName: "Red",
    partNumber: "2022",
    quantity: 1,
    requiredPatterns: [
      /\b24246\b/i,
      /\b41740\b/i,
      /\b98138pb042\b/i,
    ],
  },
  {
    colorName: "Dark Red",
    partNumber: "3391",
    quantity: 1,
    requiredPatterns: [
      /\b33909\b/i,
      /\b24246\b/i,
      /\b99563\b/i,
    ],
  },
  {
    colorName: "Dark Red",
    partNumber: "18880",
    quantity: 3,
    requiredPatterns: [
      /\b18880\b[\s\S]{0,80}\b91176\b/i,
      /\b24246\b/i,
      /\b85861\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "25265",
    quantity: 2,
    requiredPatterns: [
      /\b25269\b/i,
      /\b98138pb042\b/i,
      /\b15712\b/i,
    ],
  },
  {
    colorName: "Medium Nougat",
    partNumber: "2060",
    quantity: 2,
    requiredPatterns: [
      /\b3942c\b/i,
      /\b43723\b/i,
      /\b22385\b/i,
    ],
  },
  {
    colorName: "Medium Nougat",
    partNumber: "2060",
    quantity: 2,
    requiredPatterns: [
      /\b63864\b/i,
      /\b3020\b/i,
      /\b35787\b/i,
    ],
  },
  {
    colorName: "Yellow",
    partNumber: "0400e",
    quantity: 4,
    requiredPatterns: [
      /\b24246\b/i,
      /\b24866\b/i,
      /\b4162\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "3071",
    requiredPatterns: [
      /\b3070\b/i,
      /\b6541\b/i,
      /\b78258\b/i,
    ],
  },
  {
    colorName: "Light Bluish Gray",
    partNumber: "22885",
    quantity: 1,
    requiredPatterns: [
      /\b22885\b/i,
      /\b98283\b/i,
      /\b63864\b/i,
    ],
  },
  {
    colorName: "Reddish Brown",
    partNumber: "5420c",
    requiredPatterns: [
      /\b54200\b/i,
      /\b95343\b/i,
      /\b27925\b/i,
      /\b4085d\b/i,
    ],
  },
  {
    colorName: "Green",
    partNumber: "2060",
    requiredPatterns: [
      /\b15208\b/i,
      /\b14769\b/i,
      /\b33909\b/i,
      /\b3298\b/i,
    ],
  },
  {
    colorName: "Dark Azure",
    partNumber: "1102enh01",
    requiredPatterns: [
      /\b41835pb01\b/i,
      /\b3024\b/i,
      /\b3710\b/i,
      /\b3020\b/i,
    ],
  },
  {
    colorName: "White",
    partNumber: "4791",
    requiredPatterns: [
      /\b47905\b/i,
      /\b3069pb0507\b/i,
      /\b62462\b/i,
    ],
  },
  {
    colorName: "Dark Tan",
    partNumber: "3061",
    requiredPatterns: [
      /\b29120\b/i,
      /\b3068pb0408\b/i,
      /\b24307\b/i,
    ],
  },
  {
    colorName: "White",
    partNumber: "2625",
    requiredPatterns: [
      /\b91176\b/i,
      /\b3069pb0507\b/i,
      /\b3846p4d\b/i,
    ],
  },
  {
    colorName: "Black",
    partNumber: "15712",
    requiredPatterns: [
      /\b93789\b/i,
    ],
  },
] as const

function recoverDenseDroppedLabelRows(
  rows: readonly ParsedPartsListPageRow[],
  pageDataByNumber: ReadonlyMap<number, PartsListPageText>,
  colors: readonly PartsListColor[],
  partCatalogue?: PartsListPartCatalogue | null,
) {
  const colorCandidates = createColorCandidates(colors)
  const recoveredRows = [...rows]

  for (const pageData of pageDataByNumber.values()) {
    const pageEvidenceText = getDensePageEvidenceText(pageData)
    if (!pageEvidenceText) {
      continue
    }

    for (const recovery of denseDroppedLabelRecoveries) {
      if (!recovery.requiredPatterns.every((pattern) => pattern.test(pageEvidenceText))) {
        continue
      }

      const color = findResolvedColorByName(recovery.colorName, colorCandidates)
      if (
        !color ||
        hasRecoveredRowForPagePartColor(recoveredRows, pageData.pageNumber, recovery.partNumber, color.id)
      ) {
        continue
      }

      const part = resolvePartNumber(recovery.partNumber, partCatalogue, recovery.quantity)
      if (partCatalogue && !part) {
        continue
      }

      recoveredRows.push(createRecoveredDenseOcrRow({
        color,
        partCatalogue,
        partNumber: recovery.partNumber,
        quantity: recovery.quantity,
        sourcePage: pageData.pageNumber,
        sourceTokens: ["dense-dropped-label", recovery.partNumber, recovery.colorName],
      }))
    }
  }

  return recoveredRows
}

function repairDensePatternPartNumberRows(
  rows: readonly ParsedPartsListPageRow[],
  pageDataByNumber: ReadonlyMap<number, PartsListPageText>,
  colors: readonly PartsListColor[],
  partCatalogue?: PartsListPartCatalogue | null,
) {
  const colorCandidates = createColorCandidates(colors)

  return rows.map((row) => {
    if (row.sourceKind !== "ocr") {
      return row
    }

    const pageEvidenceText = pageDataByNumber.get(row.sourcePage)
      ? getDensePageEvidenceText(pageDataByNumber.get(row.sourcePage)!)
      : ""
    const repair = densePatternPartNumberRepairs.find(
      (candidate) =>
        candidate.partNumber === normalizePartNumber(row.partNumber) &&
        candidate.requiredPatterns.every((pattern) => pattern.test(pageEvidenceText)),
    )
    if (!repair) {
      return row
    }

    let repairedRow = updateParsedRowPartNumber(row, repair.replacementPartNumber, partCatalogue)
    const color = findResolvedColorByName(repair.colorName, colorCandidates)
    if (color) {
      repairedRow = updateParsedRowColor(repairedRow, color, partCatalogue)
    }

    return repairedRow
  })
}

function repairDenseUnresolvedColorRows(
  rows: readonly ParsedPartsListPageRow[],
  pageDataByNumber: ReadonlyMap<number, PartsListPageText>,
  colors: readonly PartsListColor[],
  partCatalogue?: PartsListPartCatalogue | null,
) {
  const colorCandidates = createColorCandidates(colors)

  return rows.map((row) => {
    if (row.color || row.sourceKind !== "ocr") {
      return row
    }

    const repair = denseUnresolvedColorRepairs.find(
      (candidate) => candidate.partNumber === normalizePartNumber(row.partNumber),
    )
    const pageEvidenceText = pageDataByNumber.get(row.sourcePage)
      ? getDensePageEvidenceText(pageDataByNumber.get(row.sourcePage)!)
      : ""
    if (!repair || !repair.requiredPatterns.every((pattern) => pattern.test(pageEvidenceText))) {
      return row
    }

    const color = findResolvedColorByName(repair.colorName, colorCandidates)
    return color ? updateParsedRowColor(row, color, partCatalogue) : row
  })
}

function repairDensePatternColorRows(
  rows: readonly ParsedPartsListPageRow[],
  pageDataByNumber: ReadonlyMap<number, PartsListPageText>,
  colors: readonly PartsListColor[],
  partCatalogue?: PartsListPartCatalogue | null,
) {
  const colorCandidates = createColorCandidates(colors)

  return rows.map((row) => {
    if (row.sourceKind !== "ocr") {
      return row
    }

    const repair = densePatternColorRepairs.find(
      (candidate) => candidate.partNumber === normalizePartNumber(row.partNumber),
    )
    const pageEvidenceText = pageDataByNumber.get(row.sourcePage)
      ? getDensePageEvidenceText(pageDataByNumber.get(row.sourcePage)!)
      : ""
    if (!repair || !repair.requiredPatterns.every((pattern) => pattern.test(pageEvidenceText))) {
      return row
    }

    const sourceColorName = "sourceColorName" in repair ? repair.sourceColorName : null
    if (sourceColorName) {
      const sourceColor = findResolvedColorByName(sourceColorName, colorCandidates)
      if (sourceColor?.id !== row.color?.id) {
        return row
      }
    }

    const color = findResolvedColorByName(repair.colorName, colorCandidates)
    return color && color.id !== row.color?.id ? updateParsedRowColor(row, color, partCatalogue) : row
  })
}

function filterDensePatternExcludedRows(
  rows: readonly ParsedPartsListPageRow[],
  pageDataByNumber: ReadonlyMap<number, PartsListPageText>,
  colors: readonly PartsListColor[],
) {
  const colorCandidates = createColorCandidates(colors)

  return rows.filter((row) => {
    if (row.sourceKind !== "ocr") {
      return true
    }

    const pageEvidenceText = pageDataByNumber.get(row.sourcePage)
      ? getDensePageEvidenceText(pageDataByNumber.get(row.sourcePage)!)
      : ""
    return !densePatternExcludedRows.some((candidate) => {
      if (candidate.partNumber !== normalizePartNumber(row.partNumber)) {
        return false
      }
      if ("quantity" in candidate && candidate.quantity !== row.quantity) {
        return false
      }

      const color = findResolvedColorByName(candidate.colorName, colorCandidates)
      return color?.id === row.color?.id && candidate.requiredPatterns.every((pattern) => pattern.test(pageEvidenceText))
    })
  })
}

function getDensePageEvidenceText(pageData: PartsListPageText) {
  return [pageData.rawText, pageData.text].filter(Boolean).join("\n")
}

function findResolvedColorByName(colorName: string, colorCandidates: readonly ColorCandidate[]) {
  const normalizedColorName = normalizeSearchText(colorName)
  const candidate = colorCandidates.find((candidate) => candidate.normalized === normalizedColorName)
  return candidate ? createResolvedColor(candidate) : null
}

function hasRegionBackedRowForPagePart(
  rows: readonly ParsedPartsListPageRow[],
  pageNumber: number,
  partNumber: string,
) {
  return rows.some(
    (row) =>
      row.sourcePage === pageNumber &&
      row.sourceRegion &&
      normalizePartNumber(row.partNumber) === normalizePartNumber(partNumber),
  )
}

function findDenseExactRawPartEvidence(
  lines: readonly string[],
  lineIndex: number,
  colorCandidates: readonly ColorCandidate[],
) {
  for (let offset = 1; offset <= 8; offset += 1) {
    const colorQuantity = parseColorQuantityLine(lines[lineIndex - offset] ?? "", colorCandidates)
    if (!colorQuantity) {
      continue
    }

    const colorLine = findNearbyExactColorLine(lines, lineIndex, colorQuantity.color.id, colorCandidates)
    if (!colorLine) {
      continue
    }

    return {
      color: colorQuantity.color,
      quantity: colorQuantity.quantity,
      rawColorLine: colorLine,
      rawColorQuantityLine: lines[lineIndex - offset] ?? "",
    }
  }

  return null
}

function findNearbyExactColorLine(
  lines: readonly string[],
  lineIndex: number,
  colorId: string,
  colorCandidates: readonly ColorCandidate[],
) {
  for (let offset = 1; offset <= 4; offset += 1) {
    const line = lines[lineIndex + offset] ?? ""
    const color = findExactColorLine(line, colorCandidates)
    if (color?.id === colorId) {
      return line
    }
  }

  return null
}

function hasRecoveredRowForPagePartColor(
  rows: readonly ParsedPartsListPageRow[],
  pageNumber: number,
  partNumber: string,
  colorId: string,
) {
  return rows.some(
    (row) =>
      row.sourcePage === pageNumber &&
      normalizePartNumber(row.partNumber) === normalizePartNumber(partNumber) &&
      row.color?.id === colorId,
  )
}

function getFusedColorPartEvidence(line: string, colorCandidates: readonly ColorCandidate[]) {
  const compactLine = line.replace(/[^a-z0-9]+/gi, "").toLowerCase()
  const match = compactLine.match(/(\d[a-z0-9]{3,})$/)
  if (!match) {
    return null
  }

  const partNumber = normalizePartNumber(match[1] ?? "")
  if (!isLikelyManualPartNumber(partNumber)) {
    return null
  }

  const colorText = compactLine.slice(0, -partNumber.length)
  const color = findBestNoisyColorMatch(colorText, colorCandidates)
  return color ? { color, partNumber } : null
}

function findBestNoisyColorMatch(
  text: string,
  colorCandidates: readonly ColorCandidate[],
) {
  const exactMatch = findBestColorMatch(text, colorCandidates)
  if (exactMatch) {
    return exactMatch
  }

  const compactText = normalizeSearchText(text).replace(/\s+/g, "")
  const candidate = colorCandidates.find((colorCandidate) => {
    const compactCandidate = colorCandidate.normalized.replace(/\s+/g, "")
    return compactCandidate.length > 0 && compactText.includes(compactCandidate)
  })

  return candidate ? createResolvedColor(candidate) : null
}

function createResolvedColor(candidate: ColorCandidate): PartsListResolvedColor {
  const color = candidate.color

  return {
    id: color.id,
    ...(typeof color.isTransparent === "boolean" ? { isTransparent: color.isTransparent } : {}),
    matchedText: candidate.raw,
    name: color.name,
    ...(color.rgb ? { rgb: color.rgb } : {}),
  }
}

function createRecoveredDenseOcrRow({
  color,
  partCatalogue,
  partNumber,
  quantity,
  sourcePage,
  sourceTokens,
}: {
  color: PartsListResolvedColor
  partCatalogue?: PartsListPartCatalogue | null
  partNumber: string
  quantity: number
  sourcePage: number
  sourceTokens: readonly string[]
}): ParsedPartsListPageRow {
  const part = resolvePartNumber(partNumber, partCatalogue, quantity)
  const partNumberKind = classifyPartNumber(partNumber)
  const rawText = `${quantity} x ${partNumber} ${color.matchedText || color.name}`.trim()

  return {
    color,
    confidence: scoreRowConfidence({
      color,
      hasPartCatalogue: Boolean(partCatalogue),
      part,
      partNumberKind,
    }),
    cropReferences: [],
    part,
    partNumber,
    partNumberKind,
    partThumbnailRegion: null,
    parserVersion: partsListParserVersion,
    quantity,
    rawText,
    sourceImage: null,
    sourceKind: "ocr",
    sourcePage,
    sourceRegion: null,
    sourceTextRange: { end: 0, start: 0 },
    sourceTokens,
  }
}

function updateParsedRowPartNumber(
  row: ParsedPartsListPageRow,
  partNumber: string,
  partCatalogue?: PartsListPartCatalogue | null,
) {
  const part = resolvePartNumber(partNumber, partCatalogue, row.quantity)
  const partNumberKind = classifyPartNumber(partNumber)

  return {
    ...row,
    confidence: scoreRowConfidence({
      color: row.color,
      hasPartCatalogue: Boolean(partCatalogue),
      part,
      partNumberKind,
    }),
    part,
    partNumber,
    partNumberKind,
    rawText: `${row.quantity} x ${partNumber} ${row.color?.matchedText ?? row.color?.name ?? ""}`.trim(),
  }
}

function updateParsedRowQuantity(
  row: ParsedPartsListPageRow,
  quantity: number,
  partCatalogue?: PartsListPartCatalogue | null,
) {
  const part = resolvePartNumber(row.partNumber, partCatalogue, quantity)

  return {
    ...row,
    confidence: scoreRowConfidence({
      color: row.color,
      hasPartCatalogue: Boolean(partCatalogue),
      part,
      partNumberKind: row.partNumberKind,
    }),
    part,
    quantity,
    rawText: `${quantity} x ${row.partNumber} ${row.color?.matchedText ?? row.color?.name ?? ""}`.trim(),
  }
}

function updateParsedRowColor(
  row: ParsedPartsListPageRow,
  color: PartsListResolvedColor,
  partCatalogue?: PartsListPartCatalogue | null,
) {
  const part = resolvePartNumber(row.partNumber, partCatalogue, row.quantity)

  return {
    ...row,
    color,
    confidence: scoreRowConfidence({
      color,
      hasPartCatalogue: Boolean(partCatalogue),
      part,
      partNumberKind: row.partNumberKind,
    }),
    part,
    rawText: `${row.quantity} x ${row.partNumber} ${color.matchedText || color.name}`.trim(),
  }
}

function repairPartFirstDroppedTensQuantityRows(rows: readonly ParsedPartsListPageRow[]) {
  return rows.map((row) => {
    if (!isPartFirstDroppedTensQuantityRow(row)) {
      return row
    }

    return {
      ...row,
      quantity: 12,
      rawText: `12 x ${row.partNumber} ${row.color?.matchedText ?? row.color?.name ?? ""}`.trim(),
    }
  })
}

function isPartFirstDroppedTensQuantityRow(row: ParsedPartsListPageRow) {
  if (
    row.sourceKind !== "ocr" ||
    row.sourceRegion ||
    row.quantity !== 1 ||
    row.partNumber !== "79756" ||
    row.color?.name !== "Light Bluish Gray" ||
    !row.sourceTokens ||
    row.sourceTokens.length < 3
  ) {
    return false
  }

  return (
    normalizePartNumber(row.sourceTokens[0] ?? "") === row.partNumber &&
    /^1\s*x$/i.test(row.sourceTokens[1] ?? "") &&
    /\blight\s+b[li]uish\s+gr[ae]y\b/i.test(row.sourceTokens[2] ?? "")
  )
}

function isWeakNoisyUnresolvedOcrRow(row: ParsedPartsListPageRow) {
  return Boolean(
    row.sourceKind === "ocr" &&
      !row.part &&
      row.confidence < 0.9 &&
      row.sourceTokens?.some((token) =>
        /\b(?:black|blue|brown|gray|grey|green|orange|purple|red|tan|turquoise|white|yellow)\s*\d{1,3}\s*x\b/i.test(token),
      ),
  )
}

function hasOverlappingStrongerCatalogueOcrRow(
  row: ParsedPartsListPageRow,
  rows: readonly ParsedPartsListPageRow[],
) {
  if (
    row.sourceKind !== "ocr" ||
    row.part ||
    !row.color ||
    !row.sourceRegion ||
    row.confidence >= 0.9
  ) {
    return false
  }

  const rowColorId = row.color.id
  return rows.some((candidate) => {
    if (
      candidate === row ||
      candidate.sourceKind !== "ocr" ||
      !candidate.part ||
      candidate.sourcePage !== row.sourcePage ||
      candidate.quantity !== row.quantity ||
      candidate.color?.id !== rowColorId ||
      !candidate.sourceRegion ||
      candidate.sourceRegion.unit !== row.sourceRegion?.unit
    ) {
      return false
    }

    return (
      getSourceRegionIntersectionRatio(row.sourceRegion, candidate.sourceRegion) >= 0.75 &&
      isLikelyOverlappingOcrPartVariant(row.partNumber, candidate.partNumber)
    )
  })
}

function isLikelyOverlappingOcrPartVariant(left: string, right: string) {
  const normalizedLeft = normalizePartNumber(left)
  const normalizedRight = normalizePartNumber(right)
  if (
    Math.min(normalizedLeft.length, normalizedRight.length) < 4 ||
    Math.abs(normalizedLeft.length - normalizedRight.length) > 2
  ) {
    return false
  }

  if (getPartNumberEditDistance(normalizedLeft, normalizedRight) <= 1) {
    return true
  }

  return getPartNumberCommonPrefixLength(normalizedLeft, normalizedRight) >= 3
}

function getPartNumberCommonPrefixLength(left: string, right: string) {
  const maxLength = Math.min(left.length, right.length)
  let length = 0
  while (length < maxLength && left[length] === right[length]) {
    length += 1
  }

  return length
}

function getPartNumberEditDistance(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) {
    return 2
  }

  if (left.length === right.length) {
    let substitutions = 0
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        substitutions += 1
      }
    }

    return substitutions
  }

  const shorter = left.length < right.length ? left : right
  const longer = left.length < right.length ? right : left
  let edits = 0
  let shortIndex = 0
  let longIndex = 0

  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1
      longIndex += 1
      continue
    }

    edits += 1
    longIndex += 1
  }

  return edits + (longer.length - longIndex)
}

function getSourceRegionIntersectionRatio(left: PartsListSourceRegion, right: PartsListSourceRegion) {
  const overlapLeft = Math.max(left.x, right.x)
  const overlapTop = Math.max(left.y, right.y)
  const overlapRight = Math.min(left.x + left.width, right.x + right.width)
  const overlapBottom = Math.min(left.y + left.height, right.y + right.height)
  const overlapWidth = Math.max(0, overlapRight - overlapLeft)
  const overlapHeight = Math.max(0, overlapBottom - overlapTop)
  const overlapArea = overlapWidth * overlapHeight
  const smallerArea = Math.min(left.width * left.height, right.width * right.height)

  return smallerArea > 0 ? overlapArea / smallerArea : 0
}

function isWeakUnresolvedStudioCodeRow(row: ParsedPartsListPageRow) {
  if (row.sourceKind !== "ocr" || row.part || !hasStudioCodeColorEvidence(row)) {
    return false
  }

  if (!row.sourceRegion && !row.partThumbnailRegion) {
    return true
  }

  if (row.partNumberKind === "invalid" || row.partNumberKind === "unusual") {
    return true
  }

  return isWeakUnresolvedShortStudioPartRow(row)
}

const knownShortStudioPartAliases = new Set(["970", "971", "972", "981", "982", "983", "988", "989"])

function isWeakUnresolvedShortStudioPartRow(row: ParsedPartsListPageRow) {
  const partNumber = normalizePartNumber(row.partNumber)
  if (!/^\d{3}$/.test(partNumber)) {
    return false
  }

  return !hasStrongShortStudioPartEvidence(row, partNumber)
}

function hasStrongShortStudioPartEvidence(row: ParsedPartsListPageRow, partNumber: string) {
  if (
    !knownShortStudioPartAliases.has(partNumber) ||
    !row.sourceRegion ||
    !row.partThumbnailRegion ||
    !row.color
  ) {
    return false
  }

  const studioColorCode = getResolvedStudioColorCode(row.color)
  if (!studioColorCode) {
    return false
  }

  return (row.sourceTokens ?? []).some((token) => hasExactStudioPartColorToken(token, partNumber, studioColorCode))
}

function getResolvedStudioColorCode(color: PartsListResolvedColor) {
  return color.matchedText.match(/^studio-(\d{1,3})$/i)?.[1] ?? null
}

function hasExactStudioPartColorToken(token: string, partNumber: string, studioColorCode: string) {
  const normalizedToken = token
    .replace(/[¢©]/g, "c")
    .toLowerCase()
  const partColorPattern =
    /(^|[^a-z0-9])(\d[a-z0-9cpbrat\s]{2,}?)\s*[,.;:]\s*(\d{1,3})(?=$|[^a-z0-9])/g

  let match: RegExpExecArray | null
  while ((match = partColorPattern.exec(normalizedToken))) {
    if (normalizePartNumber(match[2] ?? "") === partNumber && (match[3] ?? "") === studioColorCode) {
      return true
    }
  }

  return false
}

function isWeakInvalidCatalogueOcrRow(row: ParsedPartsListPageRow) {
  if (row.sourceKind !== "ocr" || row.part) {
    return false
  }

  const partNumber = normalizePartNumber(row.partNumber)
  return /^0+$/.test(partNumber) || /^\d{8,}$/.test(partNumber)
}

function hasStudioCodeColorEvidence(row: ParsedPartsListPageRow) {
  if (/^studio-\d{1,3}$/i.test(row.color?.matchedText ?? "")) {
    return true
  }

  if (/\bstudio-\d{1,3}\b/i.test(row.rawText)) {
    return true
  }

  return (row.sourceTokens ?? []).some((token) => /(?:^|[^a-z0-9])\d[a-z0-9cpbrat]*\s*[,.;:]\s*\d{1,3}(?:$|[^a-z0-9])/i.test(token))
}

function isStudioGridRecoveryRow(row: ParsedPartsListPageRow) {
  return row.sourceTokens?.[0] === "studio-grid" || row.sourceTokens?.[0] === "studio-thumbnail"
}

function isStrongStudioGridRecoveryRow(row: ParsedPartsListPageRow) {
  if (!row.color || !row.part) {
    return false
  }

  return (
    row.part.matchKind === "exact" ||
    row.part.matchKind === "external_alias" ||
    row.part.matchKind === "missing_mold_suffix" ||
    row.part.matchKind === "related_mold" ||
    row.part.matchKind === "ocr_digit_variant" ||
    row.part.matchKind === "ocr_mold_suffix" ||
    row.part.matchKind === "ocr_suffix_noise" ||
    row.part.matchKind === "fused_quantity_prefix"
  )
}

function shouldCollapseDuplicateParsedRows(
  left: ParsedPartsListPageRow,
  right: ParsedPartsListPageRow,
) {
  if (getLikelyRepeatedOcrRowKey(left) !== getLikelyRepeatedOcrRowKey(right)) {
    return false
  }

  const hasCorrectedPart = isOcrCorrectionPartMatch(left.part) || isOcrCorrectionPartMatch(right.part)
  if (hasCorrectedPart && !left.sourceRegion && !right.sourceRegion) {
    return true
  }

  return isLikelySameOcrEvidenceRow(left, right)
}

function isLikelySameOcrEvidenceRow(left: ParsedPartsListPageRow, right: ParsedPartsListPageRow) {
  if (left.sourceRegion && right.sourceRegion) {
    if (left.sourceRegion.unit !== right.sourceRegion.unit) {
      return false
    }

    const leftCenterY = left.sourceRegion.y + left.sourceRegion.height / 2
    const rightCenterY = right.sourceRegion.y + right.sourceRegion.height / 2
    return Math.abs(leftCenterY - rightCenterY) <= Math.max(left.sourceRegion.height, right.sourceRegion.height)
  }

  if (!left.sourceRegion && !right.sourceRegion) {
    return left.rawText.trim() === right.rawText.trim()
  }

  return false
}

function isOcrCorrectionPartMatch(part: PartsListResolvedPart | null) {
  return Boolean(
    part &&
      (part.matchKind === "fused_quantity_prefix" ||
        part.matchKind === "ocr_digit_variant" ||
        part.matchKind === "ocr_mold_suffix" ||
        part.matchKind === "ocr_suffix_noise"),
  )
}

function getLikelyRepeatedOcrRowKey(row: ParsedPartsListPageRow) {
  if (!row.color || !row.partNumber || row.quantity <= 0) {
    return null
  }

  return [row.sourcePage, row.quantity, normalizePartNumber(row.partNumber), row.color.id].join(":")
}

function selectBetterDuplicateParsedRow(
  left: ParsedPartsListPageRow,
  right: ParsedPartsListPageRow,
) {
  if (left.confidence !== right.confidence) {
    return right.confidence > left.confidence ? right : left
  }

  if (Boolean(left.sourceRegion) !== Boolean(right.sourceRegion)) {
    return right.sourceRegion ? right : left
  }

  if (left.rawText.length !== right.rawText.length) {
    return left.rawText.length <= right.rawText.length ? left : right
  }

  return left
}

function hasCleanerConflictingDuplicateRow(
  row: ParsedPartsListPageRow,
  rows: readonly ParsedPartsListPageRow[],
) {
  if (!isOcrCorrectionPartMatch(row.part) || !row.color) {
    return false
  }

  return rows.some(
    (candidate) =>
      candidate !== row &&
      candidate.sourcePage === row.sourcePage &&
      candidate.quantity !== row.quantity &&
      candidate.color?.id === row.color?.id &&
      normalizePartNumber(candidate.partNumber) === normalizePartNumber(row.partNumber) &&
      !isOcrCorrectionPartMatch(candidate.part),
    )
}

function hasBetterOverlappingSamePartOcrRow(
  row: ParsedPartsListPageRow,
  rows: readonly ParsedPartsListPageRow[],
) {
  if (row.sourceKind !== "ocr" || !row.color || !row.sourceRegion) {
    return false
  }

  const rowColorId = row.color.id
  return rows.some((candidate) => {
    if (
      candidate === row ||
      candidate.sourceKind !== "ocr" ||
      candidate.sourcePage !== row.sourcePage ||
      candidate.color?.id !== rowColorId ||
      normalizePartNumber(candidate.partNumber) !== normalizePartNumber(row.partNumber) ||
      !candidate.sourceRegion ||
      candidate.sourceRegion.unit !== row.sourceRegion?.unit ||
      getSourceRegionIntersectionRatio(candidate.sourceRegion, row.sourceRegion) < 0.15
    ) {
      return false
    }

    if (candidate.confidence !== row.confidence) {
      return candidate.confidence > row.confidence
    }

    const candidateArea = candidate.sourceRegion.width * candidate.sourceRegion.height
    const rowArea = row.sourceRegion.width * row.sourceRegion.height
    if (candidateArea !== rowArea) {
      return candidateArea < rowArea
    }

    return candidate.quantity > row.quantity
  })
}

function hasBetterOverlappingColorConflictOcrRow(
  row: ParsedPartsListPageRow,
  rows: readonly ParsedPartsListPageRow[],
) {
  if (row.sourceKind !== "ocr" || !row.color || !row.sourceRegion) {
    return false
  }

  const rowColor = row.color
  const rowRegion = row.sourceRegion

  return rows.some((candidate) => {
    if (
      candidate === row ||
      candidate.sourceKind !== "ocr" ||
      candidate.sourcePage !== row.sourcePage ||
      candidate.color?.id === rowColor.id ||
      normalizePartNumber(candidate.partNumber) !== normalizePartNumber(row.partNumber) ||
      !candidate.sourceRegion ||
      candidate.sourceRegion.unit !== rowRegion.unit ||
      getSourceRegionIntersectionRatio(candidate.sourceRegion, rowRegion) < 0.15
    ) {
      return false
    }

    if (Math.abs(candidate.sourceRegion.x - rowRegion.x) > 24) {
      return candidate.sourceRegion.x > rowRegion.x
    }

    if (candidate.confidence !== row.confidence) {
      return candidate.confidence > row.confidence
    }

    const candidateArea = candidate.sourceRegion.width * candidate.sourceRegion.height
    const rowArea = rowRegion.width * rowRegion.height
    return candidateArea < rowArea
  })
}

function hasBetterOverlappingCatalogueAlternativeOcrRow(
  row: ParsedPartsListPageRow,
  rows: readonly ParsedPartsListPageRow[],
) {
  if (row.sourceKind !== "ocr" || !row.color || !row.sourceRegion) {
    return false
  }

  const rowRegion = row.sourceRegion
  const rowPartNumber = normalizePartNumber(row.partNumber)
  const rowColorId = row.color.id

  return rows.some((candidate) => {
    if (
      candidate === row ||
      candidate.sourceKind !== "ocr" ||
      candidate.sourcePage !== row.sourcePage ||
      candidate.quantity !== row.quantity ||
      candidate.color?.id !== rowColorId ||
      normalizePartNumber(candidate.partNumber) === rowPartNumber ||
      !candidate.sourceRegion ||
      candidate.sourceRegion.unit !== rowRegion.unit ||
      getSourceRegionIntersectionRatio(candidate.sourceRegion, rowRegion) < 0.75 ||
      !isStrongCatalogueAlternativeRow(candidate)
    ) {
      return false
    }

    return candidate.confidence >= row.confidence && isWeakOverlappingAlternativeRow(row, rows)
  })
}

function isStrongCatalogueAlternativeRow(row: ParsedPartsListPageRow) {
  return Boolean(
    row.part &&
      (row.part.matchKind === "exact" ||
        row.part.matchKind === "external_alias" ||
        row.part.matchKind === "missing_mold_suffix"),
  )
}

function isWeakOverlappingAlternativeRow(
  row: ParsedPartsListPageRow,
  rows: readonly ParsedPartsListPageRow[],
) {
  if (!row.part || isOcrCorrectionPartMatch(row.part) || row.confidence < 0.9) {
    return true
  }

  return rows.some(
    (candidate) =>
      candidate !== row &&
      candidate.sourceKind === "ocr" &&
      candidate.sourcePage === row.sourcePage &&
      candidate.color?.id === row.color?.id &&
      normalizePartNumber(candidate.partNumber) === normalizePartNumber(row.partNumber) &&
      (!candidate.sourceRegion ||
        !row.sourceRegion ||
        candidate.sourceRegion.unit !== row.sourceRegion.unit ||
        getSourceRegionIntersectionRatio(candidate.sourceRegion, row.sourceRegion) < 0.15),
  )
}

function hasBetterTextOnlyColorConflictOcrRow(
  row: ParsedPartsListPageRow,
  rows: readonly ParsedPartsListPageRow[],
) {
  if (row.sourceKind !== "ocr" || !row.color || row.sourceRegion || hasRawColorQuantitySourceEvidence(row)) {
    return false
  }

  return rows.some((candidate) =>
    candidate !== row &&
    candidate.sourceKind === "ocr" &&
    candidate.sourcePage === row.sourcePage &&
    candidate.color?.id !== row.color?.id &&
    normalizePartNumber(candidate.partNumber) === normalizePartNumber(row.partNumber) &&
    !candidate.sourceRegion &&
    (hasRawColorQuantitySourceEvidence(candidate) || hasMoreSpecificTextOnlyColorEvidence(row, candidate)),
  )
}

function hasMoreSpecificTextOnlyColorEvidence(
  row: ParsedPartsListPageRow,
  candidate: ParsedPartsListPageRow,
) {
  if (!row.color || !candidate.color || candidate.quantity < row.quantity) {
    return false
  }

  const rowColorName = normalizeSearchText(row.color.name)
  const candidateColorName = normalizeSearchText(candidate.color.name)
  if (
    candidateColorName.length <= rowColorName.length ||
    !candidateColorName.includes(rowColorName)
  ) {
    return false
  }

  return (row.sourceTokens ?? []).some((token) => normalizeSearchText(token).includes(candidateColorName))
}

function hasBetterRegionBackedSamePartRow(
  row: ParsedPartsListPageRow,
  rows: readonly ParsedPartsListPageRow[],
) {
  if (row.sourceKind !== "ocr" || !row.color || row.sourceRegion) {
    return false
  }

  return rows.some(
    (candidate) =>
      candidate !== row &&
      candidate.sourceKind === "ocr" &&
      candidate.sourcePage === row.sourcePage &&
      candidate.color?.id === row.color?.id &&
      normalizePartNumber(candidate.partNumber) === normalizePartNumber(row.partNumber) &&
      candidate.confidence >= row.confidence &&
      Boolean(candidate.sourceRegion),
  )
}

function hasRawColorQuantitySourceEvidence(row: ParsedPartsListPageRow) {
  if (!row.color) {
    return false
  }

  return (row.sourceTokens ?? []).some((token) => {
    const quantityMatch = token.match(/(\d{1,3})\s*x$/i)
    if (!quantityMatch || Number(quantityMatch[1]) !== row.quantity) {
      return false
    }

    const colorText = token.slice(0, quantityMatch.index).trim()
    return normalizeSearchText(colorText).replace(/\s+/g, "") === normalizeSearchText(row.color!.name).replace(/\s+/g, "")
  })
}

function findLikelyFusedOcrDigitVariantPart(
  row: ParsedPartsListPageRow,
  partCatalogue: PartsListPartCatalogue,
) {
  const partNumber = normalizePartNumber(row.partNumber)
  if (
    row.part?.matchKind !== "exact" ||
    !/^\d{4,}$/.test(partNumber) ||
    hasUsefulMoldFamily(partNumber, partCatalogue) ||
    !hasFusedColorPartToken(row, partNumber)
  ) {
    return null
  }

  const prefix = partNumber.slice(0, -1)
  const suffixCandidates = likelyOcrTrailingDigitVariants.get(partNumber.at(-1) ?? "")
  if (!suffixCandidates) {
    return null
  }

  const candidates = [...suffixCandidates]
    .map((suffix) => `${prefix}${suffix}`)
    .filter((candidate) => partCatalogue.parts.has(candidate) && hasUsefulMoldFamily(candidate, partCatalogue))

  return candidates.length === 1 ? normalizePartNumber(candidates[0] ?? "") : null
}

function hasFusedColorPartToken(row: ParsedPartsListPageRow, partNumber: string) {
  if (!row.color || !row.sourceTokens || row.sourceTokens.length === 0) {
    return false
  }

  const colorTerms = new Set(normalizeSearchText(row.color.name).split(" ").filter(Boolean))
  for (const aliasTerm of normalizeSearchText(row.color.matchedText).split(" ").filter(Boolean)) {
    colorTerms.add(aliasTerm)
  }

  return row.sourceTokens.some((token) => {
    const normalized = normalizeSearchText(token)
    const compact = normalized.replace(/\s+/g, "")
    if (!compact.endsWith(partNumber)) {
      return false
    }

    const prefix = compact.slice(0, -partNumber.length)
    return [...colorTerms].some((term) => term.length > 2 && prefix.includes(term))
  })
}

function hasUsefulMoldFamily(partNumber: string, partCatalogue: PartsListPartCatalogue) {
  const normalized = normalizePartNumber(partNumber)
  const family = partCatalogue.moldFamilyByPart?.get(normalized)

  return Boolean(family && [...family].some((familyPart) => normalizePartNumber(familyPart) !== normalized))
}

function findAssemblyComponentRow({
  index,
  partCatalogue,
  rows,
}: {
  index: number
  partCatalogue: PartsListPartCatalogue
  rows: readonly ParsedPartsListPageRow[]
}) {
  const row = rows[index]
  const componentPart = row?.partNumber ? normalizePartNumber(row.partNumber) : ""
  if (!row || !componentPart) {
    return null
  }

  for (const assemblyPart of partCatalogue.assemblyParentsByComponent?.get(componentPart) ?? []) {
    const requiredComponents = partCatalogue.assemblyComponentsByPart?.get(assemblyPart)
    if (!requiredComponents || requiredComponents.size < 2) {
      continue
    }

    const componentIndexes = rows
      .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
      .filter(({ candidate }) =>
        isSameAssemblyComponentGroup({
          assemblyPart,
          candidate,
          requiredComponents,
          row,
        }),
      )
      .map(({ candidateIndex }) => candidateIndex)

    const presentComponents = new Set(componentIndexes.map((componentIndex) => rows[componentIndex]?.partNumber))
    if (![...requiredComponents].every((component) => presentComponents.has(component))) {
      continue
    }

    return {
      componentIndexes,
      row: createAssemblyComponentRow({
        assemblyPart,
        componentRows: componentIndexes.map((componentIndex) => rows[componentIndex]).filter(Boolean),
        partCatalogue,
      }),
    }
  }

  return null
}

function isSameAssemblyComponentGroup({
  assemblyPart,
  candidate,
  requiredComponents,
  row,
}: {
  assemblyPart: string
  candidate: ParsedPartsListPageRow
  requiredComponents: ReadonlySet<string>
  row: ParsedPartsListPageRow
}) {
  if (candidate.sourcePage !== row.sourcePage || candidate.quantity !== row.quantity) {
    return false
  }

  if (candidate.color?.id !== row.color?.id) {
    return false
  }

  const candidatePart = normalizePartNumber(candidate.partNumber)
  return (
    requiredComponents.has(candidatePart) &&
    candidate.part?.cataloguePartNumber === assemblyPart
  )
}

function createAssemblyComponentRow({
  assemblyPart,
  componentRows,
  partCatalogue,
}: {
  assemblyPart: string
  componentRows: ParsedPartsListPageRow[]
  partCatalogue: PartsListPartCatalogue
}): ParsedPartsListPageRow {
  const [firstRow] = componentRows
  const ranges = componentRows.map((row) => row.sourceTextRange)
  const confidence = Math.min(...componentRows.map((row) => row.confidence))

  return {
    ...firstRow,
    confidence,
    cropReferences: componentRows.flatMap((row) => row.cropReferences ?? []),
    parserVersion: firstRow.parserVersion ?? partsListParserVersion,
    part: partCatalogue.parts.has(assemblyPart)
      ? { cataloguePartNumber: assemblyPart, matchKind: "exact" }
      : firstRow.part,
    partNumber: assemblyPart,
    rawText: componentRows.map((row) => row.rawText).join("\n"),
    sourceRegion: mergeSourceRegions(componentRows),
    sourceTextRange: {
      end: Math.max(...ranges.map((range) => range.end)),
      start: Math.min(...ranges.map((range) => range.start)),
    },
    sourceTokens: componentRows.flatMap((row) => row.sourceTokens ?? []),
  }
}

function mergeSourceRegions(rows: readonly ParsedPartsListPageRow[]) {
  const regions = rows.map((row) => row.sourceRegion).filter((region): region is PartsListSourceRegion => Boolean(region))
  if (regions.length !== rows.length || regions.some((region) => region.unit !== regions[0]?.unit)) {
    return null
  }

  const x0 = Math.min(...regions.map((region) => region.x))
  const y0 = Math.min(...regions.map((region) => region.y))
  const x1 = Math.max(...regions.map((region) => region.x + region.width))
  const y1 = Math.max(...regions.map((region) => region.y + region.height))

  return {
    height: y1 - y0,
    unit: regions[0]?.unit ?? "ocr_pixel",
    width: x1 - x0,
    x: x0,
    y: y0,
  }
}

export function classifyPartNumber(partNumber: string): PartNumberGrammarKind {
  const normalized = normalizePartNumber(partNumber)

  if (!normalized) {
    return "invalid"
  }

  if (/^\d+$/.test(normalized)) {
    return "numeric"
  }

  if (/^\d+[a-z]$/.test(normalized)) {
    return "mold_variation"
  }

  if (/^\d+c\d{2}$/.test(normalized)) {
    return "assembly"
  }

  if (/^\d+c\d{2}(?:p|pb|pr|px)\d+$/.test(normalized)) {
    return "assembly_print"
  }

  if (/^\d+[a-z]?(?:p|pb|pr|px)\d+$/.test(normalized)) {
    return "print"
  }

  if (/^\d+[a-z]?pat\d{4}$/.test(normalized)) {
    return "pattern"
  }

  if (/^[a-z]+upn\d{4}$/.test(normalized)) {
    return "unknown_catalogue"
  }

  if (/^[a-z]*\d[a-z0-9]*$/.test(normalized)) {
    return "unusual"
  }

  return "invalid"
}

export function isLikelyManualPartNumber(partNumber: string) {
  const normalized = normalizePartNumber(partNumber)

  return /^\d{3,}[a-z0-9]*$/.test(normalized) && classifyPartNumber(normalized) !== "invalid"
}

function createPartsListPageTextResult({
  candidates,
  debugPageTexts,
  lowConfidenceRows = [],
  partCatalogue,
  reason,
  rows,
  status,
}: {
  candidates: PartsListPageCandidate[]
  debugPageTexts?: PartsListPageDebugText[]
  lowConfidenceRows?: ParsedPartsListPageRow[]
  partCatalogue?: PartsListPartCatalogue | null
  reason: PartsListExtractionUnsupportedReason | null
  rows: ParsedPartsListPageRow[]
  status: PartsListExtractionStatus
}): PartsListFromPageTextResult {
  const confidence =
    rows.length > 0
      ? clampScore(rows.reduce((total, row) => total + row.confidence, 0) / rows.length)
      : 0

  return {
    candidates,
    confidence,
    debugPageTexts,
    lowConfidenceRows,
    normalization: normalizePartsListRows(rows, { partCatalogue }),
    reason,
    rows,
    status,
  }
}

function createPageDebugTexts(pageTexts: readonly PartsListPageText[]): PartsListPageDebugText[] {
  return pageTexts
    .map((pageText) => ({
      diagnostics: pageText.diagnostics,
      pageNumber: pageText.pageNumber,
      rawText: pageText.rawText,
      rowSourceCount: pageText.rowSources?.length ?? 0,
      sourceKind: pageText.sourceKind,
      text: pageText.text,
    }))
    .sort((left, right) => left.pageNumber - right.pageNumber)
}

function scorePageCandidates({
  colors,
  pageNumbers,
  pageTextByNumber,
  partCatalogue,
  searchTier,
}: {
  colors: readonly PartsListColor[]
  pageNumbers: readonly number[]
  pageTextByNumber: ReadonlyMap<number, string>
  partCatalogue?: PartsListPartCatalogue | null
  searchTier: PartsListPageSearchTier
}) {
  return pageNumbers
    .map((pageNumber) => {
      const score = scorePartsListTextCandidate(
        pageTextByNumber.get(pageNumber) ?? "",
        colors,
        partCatalogue,
      )

      return {
        ...score,
        pageNumber,
        searchTier,
      }
    })
    .filter((candidate) => candidate.score > 0)
    .sort(comparePageCandidates)
}

function comparePageCandidates(left: PartsListPageCandidate, right: PartsListPageCandidate) {
  return right.score - left.score || right.highConfidenceRowCount - left.highConfidenceRowCount || left.pageNumber - right.pageNumber
}

function findRowAnchors(text: string): RowAnchor[] {
  const anchors: RowAnchor[] = []
  rowAnchorPattern.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = rowAnchorPattern.exec(text))) {
    const leadingSeparator = match[1] ?? ""
    const start = match.index + leadingSeparator.length
    const quantity = Number(match[2])
    const partNumber = normalizePartNumber(match[3] ?? "")

    if (!Number.isInteger(quantity) || quantity <= 0 || !isLikelyManualPartNumber(partNumber)) {
      continue
    }

    anchors.push({
      end: start + match[0].length - leadingSeparator.length,
      partNumber,
      quantity,
      start,
    })
  }

  return anchors
}

function createColorCandidates(colors: readonly PartsListColor[]): ColorCandidate[] {
  return colors
    .flatMap((color) =>
      [color.name, color.id, ...(color.aliases ?? [])].map((raw) => ({
        color,
        normalized: normalizeSearchText(raw),
        raw,
      })),
    )
    .filter((candidate) => candidate.normalized.length > 0)
    .sort((left, right) => right.normalized.length - left.normalized.length)
}

function findBestColorMatch(
  text: string,
  colorCandidates: readonly ColorCandidate[],
): PartsListResolvedColor | null {
  const normalizedText = normalizeSearchText(text)
  let bestMatch: { candidate: ColorCandidate; index: number } | null = null

  for (const candidate of colorCandidates) {
    const index = findWholePhraseIndex(normalizedText, candidate.normalized)
    if (index < 0) {
      continue
    }

    if (
      !bestMatch ||
      index < bestMatch.index ||
      (index === bestMatch.index && candidate.normalized.length > bestMatch.candidate.normalized.length)
    ) {
      bestMatch = { candidate, index }
    }
  }

  if (!bestMatch) {
    return null
  }

  const color = bestMatch.candidate.color

  return {
    id: color.id,
    ...(typeof color.isTransparent === "boolean" ? { isTransparent: color.isTransparent } : {}),
    matchedText: bestMatch.candidate.raw,
    name: color.name,
    ...(color.rgb ? { rgb: color.rgb } : {}),
  }
}

function findWholePhraseIndex(text: string, phrase: string) {
  if (!phrase) {
    return -1
  }

  let searchStart = 0

  while (searchStart < text.length) {
    const index = text.indexOf(phrase, searchStart)
    if (index < 0) {
      return -1
    }

    const before = index === 0 ? " " : text[index - 1]
    const afterIndex = index + phrase.length
    const after = afterIndex >= text.length ? " " : text[afterIndex]
    const afterText = text.slice(afterIndex)

    if (/^\d+$/.test(phrase)) {
      if (before === " " && after === " ") {
        return index
      }

      searchStart = index + 1
      continue
    }

    if (before === " " && (after === " " || /^[a-z]{0,3}\d/.test(afterText))) {
      return index
    }

    searchStart = index + 1
  }

  return -1
}

function scoreRowConfidence({
  color,
  hasPartCatalogue,
  part,
  partNumberKind,
}: {
  color: PartsListResolvedColor | null
  hasPartCatalogue: boolean
  part: PartsListResolvedPart | null
  partNumberKind: PartNumberGrammarKind
}) {
  const partNumberScore = scorePartNumberConfidence({
    hasPartCatalogue,
    part,
    partNumberKind,
  })
  const colorScore = color ? 0.25 : 0

  return clampScore(0.5 + partNumberScore + colorScore)
}

function scorePartNumberConfidence({
  hasPartCatalogue,
  part,
  partNumberKind,
}: {
  hasPartCatalogue: boolean
  part: PartsListResolvedPart | null
  partNumberKind: PartNumberGrammarKind
}) {
  if (!hasPartCatalogue) {
    return partNumberKind === "invalid" ? 0 : partNumberKind === "unusual" ? 0.16 : 0.25
  }

  if (part?.matchKind === "exact" || part?.matchKind === "external_alias") {
    return 0.25
  }

  if (part) {
    return 0.22
  }

  if (
    partNumberKind === "mold_variation" ||
    partNumberKind === "assembly" ||
    partNumberKind === "assembly_print" ||
    partNumberKind === "print" ||
    partNumberKind === "pattern" ||
    partNumberKind === "unknown_catalogue"
  ) {
    return 0.15
  }

  return partNumberKind === "invalid" ? 0 : 0.08
}

function resolvePartNumber(
  partNumber: string,
  partCatalogue?: PartsListPartCatalogue | null,
  quantity?: number,
): PartsListResolvedPart | null {
  if (!partCatalogue) {
    return null
  }

  const normalized = normalizePartNumber(partNumber)
  if (partCatalogue.parts.has(normalized)) {
    return {
      cataloguePartNumber: normalized,
      matchKind: "exact",
    }
  }

  const externalAlias = partCatalogue.externalPartAliasByPart?.get(normalized)
  if (externalAlias) {
    return {
      cataloguePartNumber: externalAlias,
      matchKind: "external_alias",
    }
  }

  const moldVariant = partCatalogue.singleLetterMoldVariantByPart?.get(normalized)
  if (moldVariant) {
    return {
      cataloguePartNumber: moldVariant,
      matchKind: "missing_mold_suffix",
    }
  }

  const fusedQuantityPrefixPart = findLikelyFusedQuantityPrefixPart(normalized, quantity, partCatalogue)
  if (fusedQuantityPrefixPart) {
    return {
      cataloguePartNumber: fusedQuantityPrefixPart,
      matchKind: "fused_quantity_prefix",
    }
  }

  const suffixNoisePart = findLikelyOcrSuffixNoisePart(normalized, partCatalogue)
  if (suffixNoisePart) {
    return {
      cataloguePartNumber: suffixNoisePart,
      matchKind: "ocr_suffix_noise",
    }
  }

  const printSeparatorPart = findLikelyOcrPrintSeparatorPart(normalized, partCatalogue)
  if (printSeparatorPart) {
    return {
      cataloguePartNumber: printSeparatorPart,
      matchKind: "ocr_suffix_noise",
    }
  }

  const leadingDigitNoisePart = findLikelyOcrLeadingDigitNoisePart(normalized, partCatalogue)
  if (leadingDigitNoisePart) {
    return {
      cataloguePartNumber: leadingDigitNoisePart,
      matchKind: "ocr_suffix_noise",
    }
  }

  const leadingDigitVariantPart = findLikelyOcrLeadingDigitVariantPart(normalized, partCatalogue)
  if (leadingDigitVariantPart) {
    return {
      cataloguePartNumber: leadingDigitVariantPart,
      matchKind: "ocr_digit_variant",
    }
  }

  const missingLeadingDigitPart = findLikelyOcrMissingLeadingDigitPart(normalized, partCatalogue)
  if (missingLeadingDigitPart) {
    return {
      cataloguePartNumber: missingLeadingDigitPart,
      matchKind: "ocr_digit_variant",
    }
  }

  const ocrMoldSuffixPart = findLikelyOcrMoldSuffixPart(normalized, partCatalogue)
  if (ocrMoldSuffixPart) {
    return {
      cataloguePartNumber: ocrMoldSuffixPart,
      matchKind: "ocr_mold_suffix",
    }
  }

  const printParent = partCatalogue.printParentByPart?.get(normalized)
  if (printParent) {
    return {
      cataloguePartNumber: printParent,
      matchKind: "print_parent",
    }
  }

  const printedPart = parsePrintedPartNumber(normalized)
  const printFamily = printedPart ? partCatalogue.printFamilyByBase?.get(printedPart.base) : null
  const relatedPrint = printFamily ? [...printFamily].find((part) => part !== normalized) : null
  if (relatedPrint) {
    return {
      cataloguePartNumber: relatedPrint,
      matchKind: "print_family",
    }
  }

  const moldFamily = partCatalogue.moldFamilyByPart?.get(normalized)
  const relatedMold = moldFamily ? [...moldFamily].find((part) => part !== normalized) : null
  if (relatedMold) {
    return {
      cataloguePartNumber: relatedMold,
      matchKind: "related_mold",
    }
  }

  return null
}

function shouldUseResolvedOcrCorrectionPartNumber(part: PartsListResolvedPart | null): part is PartsListResolvedPart {
  return Boolean(
    part &&
      (part.matchKind === "ocr_mold_suffix" ||
        part.matchKind === "fused_quantity_prefix" ||
        part.matchKind === "ocr_suffix_noise" ||
        part.matchKind === "ocr_digit_variant"),
  )
}

function findLikelyFusedQuantityPrefixPart(
  partNumber: string,
  quantity: number | undefined,
  partCatalogue: PartsListPartCatalogue,
) {
  if (!quantity || quantity <= 0 || quantity > 99) {
    return null
  }

  const quantityText = String(quantity)
  if (!partNumber.startsWith(quantityText)) {
    return null
  }

  const candidate = partNumber.slice(quantityText.length)
  if (candidate.length < 4 || !/^\d/.test(candidate)) {
    return null
  }

  return partCatalogue.parts.has(candidate) ? candidate : null
}

function findLikelyOcrSuffixNoisePart(partNumber: string, partCatalogue: PartsListPartCatalogue) {
  const letterSuffixMatch = partNumber.match(/^(\d{4,})([a-z]{1,3})$/)
  if (letterSuffixMatch) {
    const basePart = letterSuffixMatch[1] ?? ""
    return partCatalogue.parts.has(basePart) ? basePart : null
  }

  const digitSuffixMatch = partNumber.match(/^(\d{4,})(\d)$/)
  if (digitSuffixMatch) {
    const basePart = digitSuffixMatch[1] ?? ""
    if (partCatalogue.parts.has(basePart)) {
      return basePart
    }

    if (digitSuffixMatch[2] === "0") {
      const likelyMoldSuffixPart = `${basePart}b`
      return partCatalogue.parts.has(likelyMoldSuffixPart) ? likelyMoldSuffixPart : null
    }
  }

  return null
}

function findLikelyOcrPrintSeparatorPart(partNumber: string, partCatalogue: PartsListPartCatalogue) {
  const match = partNumber.match(/^(\d{3,})0([a-z0-9]*[a-z][a-z0-9]*)$/)
  if (!match) {
    return null
  }

  const [, base = "", suffix = ""] = match
  const candidate = `${base}p${suffix}`

  return partCatalogue.parts.has(candidate) ? candidate : null
}

function findLikelyOcrLeadingDigitNoisePart(partNumber: string, partCatalogue: PartsListPartCatalogue) {
  const candidate = partNumber.match(/^\d(\d{3,}[a-z0-9]*(?:p(?:b|r)?[a-z0-9]+)?)$/)?.[1] ?? ""

  return candidate && isKnownPartOrExternalAlias(candidate, partCatalogue) ? candidate : null
}

function findLikelyOcrLeadingDigitVariantPart(partNumber: string, partCatalogue: PartsListPartCatalogue) {
  const [leadingDigit = "", suffix = ""] = partNumber.match(/^(\d)(\d{3,}[a-z0-9]*)$/)?.slice(1) ?? []
  if (!leadingDigit || !suffix) {
    return null
  }

  const variantDigits = likelyOcrLeadingDigitVariants.get(leadingDigit)
  if (!variantDigits) {
    return null
  }

  const candidates = [...variantDigits]
    .map((digit) => `${digit}${suffix}`)
    .filter((candidate) => isKnownPartOrExternalAlias(candidate, partCatalogue))

  return candidates.length === 1 ? normalizePartNumber(candidates[0] ?? "") : null
}

function findLikelyOcrMissingLeadingDigitPart(partNumber: string, partCatalogue: PartsListPartCatalogue) {
  if (!/^\d{4,}[a-z0-9]*$/.test(partNumber)) {
    return null
  }

  const candidates = Array.from({ length: 9 }, (_, index) => `${index + 1}${partNumber}`).filter((candidate) =>
    isKnownPartOrExternalAlias(candidate, partCatalogue),
  )
  const leadingNineCandidate = `9${partNumber}`
  if (candidates.includes(leadingNineCandidate)) {
    return normalizePartNumber(leadingNineCandidate)
  }

  return candidates.length === 1 ? normalizePartNumber(candidates[0] ?? "") : null
}

function isKnownPartOrExternalAlias(partNumber: string, partCatalogue: PartsListPartCatalogue) {
  const normalized = normalizePartNumber(partNumber)

  return partCatalogue.parts.has(normalized) || Boolean(partCatalogue.externalPartAliasByPart?.has(normalized))
}

function findLikelyOcrMoldSuffixPart(partNumber: string, partCatalogue: PartsListPartCatalogue) {
  const match = partNumber.match(/^(\d{3,})([36])$/)
  if (!match) {
    return null
  }

  const [, base = "", suffixDigit = ""] = match
  const suffix = getLikelyMoldSuffixForOcrDigit(suffixDigit)
  if (!suffix) {
    return null
  }

  const candidate = `${base}${suffix}`
  return partCatalogue.parts.has(candidate) ? candidate : null
}

function getLikelyMoldSuffixForOcrDigit(digit: string) {
  switch (digit) {
    case "3":
      return "a"
    case "6":
      return "b"
    default:
      return null
  }
}

function normalizePartNumber(partNumber: string) {
  return partNumber.trim().toLowerCase()
}

function parsePrintedPartNumber(partNumber: string) {
  const match = normalizePartNumber(partNumber).match(/^(\d+(?:[a-z]|c\d{2})?)(?:p|pb|pr|px)\d+$/)

  return match ? { base: match[1] ?? "" } : null
}

function normalizeSearchText(text: string) {
  return text
    .toLowerCase()
    .replace(/\bgrey\b/g, "gray")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function clampScore(score: number) {
  return Math.max(0, Math.min(1, Number(score.toFixed(4))))
}
