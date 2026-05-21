import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import type { PartsListFromPageTextResult } from "@/features/bagging/parts-list-extraction"
import { renderWithProvider } from "@/test/render"
import { PartsListDebugPanel } from "./parts-list-debug-panel"

describe("PartsListDebugPanel", () => {
  it("renders collapsible candidate pages, row regions, raw text, and source metadata", async () => {
    const user = userEvent.setup()
    renderWithProvider(<PartsListDebugPanel pageRenders={debugPageRenders} result={debugResult} />)

    expect(screen.getByText("Extraction diagnostics")).toBeVisible()
    expect(screen.getByText("1 rows, 1 low-confidence rows, 1 candidate pages, ocr pages 4.")).toBeVisible()
    const candidatePage = screen.getByTestId("debug-candidate-page")
    expect(candidatePage).toHaveAttribute("data-page-number", "10")
    expect(within(candidatePage).queryByText("Rows on page")).not.toBeInTheDocument()

    await user.click(within(candidatePage).getByRole("button", { name: /Page 10/ }))

    expect(within(candidatePage).getByText("Red: OCR row")).toBeVisible()
    expect(within(candidatePage).getByText("Blue: inferred part image candidate")).toBeVisible()
    expect(within(candidatePage).getByText("Rows on page")).toBeVisible()
    expect(within(candidatePage).getByText("2x 3024 Black")).toBeVisible()
    expect(within(candidatePage).getByAltText("Manual page 10 preview")).toBeVisible()
    expect(screen.getAllByTestId("debug-row-region-overlay")[0]).toHaveAttribute("data-part-number", "3024")
    expect(screen.getAllByTestId("debug-part-region-overlay")[0]).toHaveAttribute("data-part-number", "3024")
    expect(screen.getAllByText("Red row cropout")[0]).toBeVisible()
    expect(screen.getAllByText("Blue part candidate cropout")[0]).toBeVisible()
    expect(screen.getAllByTestId("debug-row-region-preview")[0]).toHaveAttribute("data-part-number", "3024")
    expect(screen.getAllByTestId("debug-part-region-preview")[0]).toHaveAttribute("data-part-number", "3024")
    expect(screen.getAllByTestId("debug-part-row")[0]).toHaveAttribute("data-source-kind", "ocr")
    expect(screen.getAllByTestId("debug-part-row")[0]).toHaveAttribute(
      "data-source-region",
      "x52 y93 w53 h55 ocr_pixel",
    )
    expect(screen.getAllByText("2 x 3024 Black")[0]).toBeVisible()
    expect(screen.getAllByText("x52 y93 w53 h55 ocr_pixel")[0]).toBeVisible()
    expect(screen.getAllByText("1800 x 2400 ocr_pixel")[0]).toBeVisible()
    expect(screen.getByText("2400 x 1800 ocr_pixel")).toBeVisible()
    expect(screen.getByText("paddleocr.js")).toBeVisible()
    expect(screen.getByText("PP-OCRv5")).toBeVisible()
    expect(screen.getByText("canvas")).toBeVisible()
    expect(screen.getAllByText("tokens: 2x | 3024 | Black")[0]).toBeVisible()
  })

  it("orders candidate pages and rows by source page", async () => {
    const user = userEvent.setup()
    renderWithProvider(<PartsListDebugPanel pageRenders={debugPageRenders} result={unsortedDebugResult} />)

    expect(screen.getAllByTestId("debug-candidate-page").map((element) => element.dataset.pageNumber)).toEqual([
      "9",
      "10",
    ])
    await user.click(screen.getByRole("button", { name: /Page 9/ }))
    await user.click(screen.getByRole("button", { name: /Page 10/ }))
    expect(screen.getAllByTestId("debug-part-row").map((element) => element.dataset.sourcePage)).toEqual([
      "9",
      "10",
    ])
  })
})

const debugPageRenders = [
  {
    dataUrl: "data:image/png;base64,test",
    height: 426,
    pageNumber: 9,
    renderKind: "canvas" as const,
    width: 320,
  },
  {
    dataUrl: "data:image/png;base64,test",
    height: 426,
    pageNumber: 10,
    renderKind: "canvas" as const,
    width: 320,
  },
]

const page9Row = {
  color: { id: "0", matchedText: "Black", name: "Black" },
  confidence: 0.95,
  cropReferences: [
    {
      id: "row:p9:x20:y30:w60:h70",
      kind: "row" as const,
      pageNumber: 9,
      region: { height: 70, unit: "ocr_pixel" as const, width: 60, x: 20, y: 30 },
    },
  ],
  parserVersion: "parts-list-v1",
  part: { cataloguePartNumber: "3005", matchKind: "exact" as const },
  partNumber: "3005",
  partNumberKind: "numeric" as const,
  partThumbnailRegion: { height: 100, unit: "ocr_pixel" as const, width: 100, x: 0, y: 0 },
  quantity: 4,
  rawText: "4 x 3005 Black",
  sourceKind: "ocr" as const,
  sourceImage: { height: 2400, unit: "ocr_pixel" as const, width: 1800 },
  sourcePage: 9,
  sourceRegion: { height: 70, unit: "ocr_pixel" as const, width: 60, x: 20, y: 30 },
  sourceTextRange: { end: 14, start: 0 },
  sourceTokens: ["4x", "3005", "Black"],
}

const debugResult = {
  candidates: [
    {
      anchorCount: 1,
      highConfidenceRowCount: 1,
      pageNumber: 10,
      rowCount: 1,
      score: 1,
      searchTier: "tail",
    },
  ],
  confidence: 0.75,
  debugPageTexts: [
    {
      diagnostics: {
        ocr: {
          engine: "paddleocr.js",
          inputKind: "canvas",
          maxPageWidth: 2400,
          maxPixels: 5500000,
          pipeline: "PP-OCRv5",
          recognizeMs: 980,
          renderMs: 40,
          renderedHeight: 1800,
          renderedWidth: 2400,
        },
      },
      pageNumber: 10,
      rawText: "2x 3024 Black",
      rowSourceCount: 1,
      sourceKind: "ocr",
      text: "2 x 3024 Black",
    },
  ],
  extractionMethod: "ocr",
  lowConfidenceRows: [
    {
      color: { id: "0", matchedText: "Black", name: "Black" },
      confidence: 0.75,
      cropReferences: [
        {
          id: "row:p10:x52:y93:w53:h55",
          kind: "row",
          pageNumber: 10,
          region: { height: 55, unit: "ocr_pixel", width: 53, x: 52, y: 93 },
        },
      ],
      parserVersion: "parts-list-v1",
      part: null,
      partNumber: "3024",
      partNumberKind: "numeric",
      partThumbnailRegion: { height: 99, unit: "ocr_pixel", width: 99, x: 30, y: 71 },
      quantity: 2,
      rawText: "2 x 3024 Black",
      sourceKind: "ocr",
      sourceImage: { height: 2400, unit: "ocr_pixel", width: 1800 },
      sourcePage: 10,
      sourceRegion: { height: 55, unit: "ocr_pixel", width: 53, x: 52, y: 93 },
      sourceTextRange: { end: 14, start: 0 },
      sourceTokens: ["2x", "3024", "Black"],
    },
  ],
  ocrPageCount: 4,
  reason: null,
  rows: [
    {
      color: { id: "0", matchedText: "Black", name: "Black" },
      confidence: 0.75,
      cropReferences: [
        {
          id: "row:p10:x52:y93:w53:h55",
          kind: "row",
          pageNumber: 10,
          region: { height: 55, unit: "ocr_pixel", width: 53, x: 52, y: 93 },
        },
      ],
      parserVersion: "parts-list-v1",
      part: null,
      partNumber: "3024",
      partNumberKind: "numeric",
      partThumbnailRegion: { height: 99, unit: "ocr_pixel", width: 99, x: 30, y: 71 },
      quantity: 2,
      rawText: "2 x 3024 Black",
      sourceKind: "ocr",
      sourceImage: { height: 2400, unit: "ocr_pixel", width: 1800 },
      sourcePage: 10,
      sourceRegion: { height: 55, unit: "ocr_pixel", width: 53, x: 52, y: 93 },
      sourceTextRange: { end: 14, start: 0 },
      sourceTokens: ["2x", "3024", "Black"],
    },
  ],
  status: "needs_attention",
} satisfies PartsListFromPageTextResult & { extractionMethod: "ocr"; ocrPageCount: number }

const unsortedDebugResult = {
  ...debugResult,
  candidates: [
    debugResult.candidates[0],
    {
      anchorCount: 1,
      highConfidenceRowCount: 1,
      pageNumber: 9,
      rowCount: 1,
      score: 0.95,
      searchTier: "tail" as const,
    },
  ],
  lowConfidenceRows: [],
  rows: [debugResult.rows[0], page9Row],
} satisfies PartsListFromPageTextResult & { extractionMethod: "ocr"; ocrPageCount: number }
