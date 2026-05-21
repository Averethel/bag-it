import type { PartsListPageText } from "./parts-list-extraction"
import type { PdfReadableDocument, PdfReadablePage, PdfTextContentItem } from "./pdf-intake"

export type PdfPageTextExtractionOptions = {
  signal?: AbortSignal
}

export async function extractPdfPageTexts(
  document: PdfReadableDocument,
  pageNumbers: readonly number[],
  { signal }: PdfPageTextExtractionOptions = {},
): Promise<PartsListPageText[]> {
  const boundedPageNumbers = getBoundedPageNumbers(pageNumbers, document.numPages)

  if (!document.getPage) {
    return boundedPageNumbers.map((pageNumber) => ({ pageNumber, sourceKind: "native_text", text: "" }))
  }

  const pageTexts: PartsListPageText[] = []

  for (const pageNumber of boundedPageNumbers) {
    assertTextExtractionCanContinue(signal)
    const page = await document.getPage(pageNumber)

    try {
      pageTexts.push({
        pageNumber,
        sourceKind: "native_text",
        text: await extractPdfPageText(page, signal),
      })
    } finally {
      page.cleanup?.()
    }
  }

  return pageTexts
}

async function extractPdfPageText(page: PdfReadablePage, signal?: AbortSignal) {
  if (!page.getTextContent) {
    return ""
  }

  assertTextExtractionCanContinue(signal)
  const textContent = await page.getTextContent()
  assertTextExtractionCanContinue(signal)

  const normalizedText = normalizeNativeTextItems(textContent.items)
  const positionedText = buildPositionedNativeText(textContent.items)
  if (!positionedText || normalizeTextForComparison(positionedText) === normalizeTextForComparison(normalizedText)) {
    return normalizedText
  }

  return [normalizedText, positionedText].filter(Boolean).join("\n")
}

function normalizeNativeTextItems(items: readonly PdfTextContentItem[]) {
  return items
    .map((item) => getNativeTextItemString(item))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

type PositionedNativeTextItem = {
  height: number
  text: string
  width: number
  x: number
  y: number
}

type PositionedNativeTextLine = {
  items: PositionedNativeTextItem[]
  y: number
}

function buildPositionedNativeText(items: readonly PdfTextContentItem[]) {
  const positionedItems = items
    .map(getPositionedNativeTextItem)
    .filter((item): item is PositionedNativeTextItem => Boolean(item))
    .sort((left, right) => right.y - left.y || left.x - right.x)
  if (positionedItems.length === 0) {
    return ""
  }

  const lineTolerance = getNativeTextLineTolerance(positionedItems)
  const lines: PositionedNativeTextLine[] = []
  for (const item of positionedItems) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= lineTolerance)
    if (line) {
      line.items.push(item)
      line.y = (line.y * (line.items.length - 1) + item.y) / line.items.length
      continue
    }

    lines.push({ items: [item], y: item.y })
  }

  return lines
    .sort((left, right) => right.y - left.y)
    .map(formatPositionedNativeTextLine)
    .filter(Boolean)
    .join("\n")
    .trim()
}

function getPositionedNativeTextItem(item: PdfTextContentItem): PositionedNativeTextItem | null {
  const text = getNativeTextItemString(item)
  if (!text) {
    return null
  }

  const transform = item.transform
  if (!Array.isArray(transform)) {
    return null
  }

  const x = getFiniteNumber(transform[4])
  const y = getFiniteNumber(transform[5])
  if (x == null || y == null) {
    return null
  }

  const width = getFiniteNumber(item.width) ?? 0
  const height = getFiniteNumber(item.height) ?? getFiniteNumber(transform[3]) ?? getFiniteNumber(transform[0]) ?? 1

  return {
    height: Math.max(1, Math.abs(height)),
    text,
    width: Math.max(0, Math.abs(width)),
    x,
    y,
  }
}

function formatPositionedNativeTextLine(line: PositionedNativeTextLine) {
  const sortedItems = [...line.items].sort((left, right) => left.x - right.x)
  const medianHeight = getMedian(sortedItems.map((item) => item.height)) ?? 1
  let previousRight: number | null = null

  return sortedItems
    .map((item) => {
      const gap = previousRight == null ? 0 : item.x - previousRight
      previousRight = item.x + item.width

      return `${gap > medianHeight * 0.4 ? " " : ""}${item.text}`
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

function getNativeTextLineTolerance(items: readonly PositionedNativeTextItem[]) {
  const medianHeight = getMedian(items.map((item) => item.height)) ?? 1
  return Math.max(2, medianHeight * 0.55)
}

function getNativeTextItemString(item: PdfTextContentItem) {
  return typeof item.str === "string" ? item.str.trim() : ""
}

function normalizeTextForComparison(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function getFiniteNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function getMedian(values: readonly number[]) {
  const sortedValues = values.filter(Number.isFinite).sort((left, right) => left - right)
  if (sortedValues.length === 0) {
    return null
  }

  return sortedValues[Math.floor(sortedValues.length / 2)] ?? null
}

function getBoundedPageNumbers(pageNumbers: readonly number[], pageCount: number) {
  const seen = new Set<number>()

  return pageNumbers.filter((pageNumber) => {
    if (seen.has(pageNumber) || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
      return false
    }

    seen.add(pageNumber)
    return true
  })
}

function assertTextExtractionCanContinue(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new PdfPageTextExtractionCancelledError()
  }
}

export class PdfPageTextExtractionCancelledError extends Error {
  constructor() {
    super("PDF page text extraction was cancelled.")
    this.name = "PdfPageTextExtractionCancelledError"
  }
}
