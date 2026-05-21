import { fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { renderWithProvider } from "@/test/render"
import { ExtractedPartsPanel, NormalizationAttentionList } from "./extracted-parts-panel"
import { getPartsListPartPreviewKey } from "@/features/bagging/browser-catalogue"
import type { ParsedPartsListPageRow, PartsListFromPageTextResult } from "@/features/bagging/parts-list-extraction"

describe("ExtractedPartsPanel", () => {
  it("renders extracted rows and confidence state", async () => {
    const user = userEvent.setup()

    renderWithProvider(
      <ExtractedPartsPanel
        partPreviewByKey={
          new Map([
            [
              getPartsListPartPreviewKey("3068b", "71"),
              {
                colorId: "71",
                imageUrl: "https://cdn.rebrickable.com/media/parts/elements/3068b.jpg",
                key: getPartsListPartPreviewKey("3068b", "71"),
                name: "Tile 2 x 2",
                partNumber: "3068b",
              },
            ],
            [
              getPartsListPartPreviewKey("3005", "0"),
              {
                colorId: "0",
                imageUrl: "https://cdn.rebrickable.com/media/parts/elements/3005.jpg",
                key: getPartsListPartPreviewKey("3005", "0"),
                name: "Brick 1 x 1",
                partNumber: "3005",
              },
            ],
          ])
        }
        result={supportedResult}
      />,
    )

    expect(screen.getByText("Supported")).toBeVisible()
    expect(screen.getByText("2 rows parsed from 1 candidate pages.")).toBeVisible()
    expect(screen.getAllByText("Tile 2 x 2")[0]).toBeVisible()
    expect(screen.getByText("3068b")).toBeVisible()
    expect(screen.getByText("Light Bluish Gray")).toBeVisible()
    expect(screen.getAllByText("Brick 1 x 1")[0]).toBeVisible()
    expect(screen.getByText("3005")).toBeVisible()
    expect(screen.getByText("Black")).toBeVisible()
    expect(screen.queryByText(/numeric/)).not.toBeInTheDocument()
    expect(screen.queryByText(/catalogue/)).not.toBeInTheDocument()
    expect(screen.getByRole("img", { name: "3068b Light Bluish Gray Tile 2 x 2" })).toHaveAttribute(
      "src",
      "https://cdn.rebrickable.com/media/parts/elements/3068b.jpg",
    )
    expect(screen.getAllByTestId("color-swatch")[0]).toHaveStyle({ backgroundColor: "#a0a5a9" })
    expect(screen.getAllByText("Page")[0]).toBeVisible()
    expect(screen.getByTestId("extracted-parts-header")).toHaveStyle({
      position: "sticky",
      top: "var(--chakra-spacing-bagging-none)",
    })
    expect(screen.getByTestId("parts-completion-summary")).toHaveTextContent("0% checked")
    expect(screen.getByText("0 of 16 parts checked")).toBeVisible()
    const firstRow = screen.getAllByTestId("extracted-part-row")[0]!
    const firstRowDetails = screen.getAllByTestId("part-row-details")[0]!
    expect(firstRowDetails).toHaveStyle({ display: "grid" })
    expect(within(firstRowDetails).getByText("3068b")).toBeVisible()
    expect(within(firstRowDetails).getByText("Light Bluish Gray")).toBeVisible()
    expect(within(firstRowDetails).getByText("Page 10")).toBeVisible()

    const foundCheckbox = screen.getByRole("checkbox", { name: "Mark 3068b as found" })
    expect(foundCheckbox).not.toBeChecked()
    await user.click(foundCheckbox)
    expect(foundCheckbox).toBeChecked()
    expect(firstRow).toHaveAttribute("data-selected", "true")
    expect(firstRowDetails).toHaveStyle({ opacity: "0.58" })
    expect(screen.getByTestId("parts-completion-summary")).toHaveTextContent("13% checked")
    expect(screen.getByText("2 of 16 parts checked")).toBeVisible()
    await user.click(firstRow)
    expect(foundCheckbox).not.toBeChecked()
    expect(firstRow).toHaveAttribute("data-selected", "false")
    expect(firstRowDetails).toHaveStyle({ opacity: "1" })
    expect(screen.getByTestId("parts-completion-summary")).toHaveTextContent("0% checked")

    await user.hover(screen.getByRole("img", { name: "3068b Light Bluish Gray Tile 2 x 2" }))
    expect(
      await screen.findByRole("img", { name: "3068b Light Bluish Gray Tile 2 x 2 enlarged" }),
    ).toBeVisible()
  })

  it("prefers catalogue-backed manual names for printed parts", () => {
    renderWithProvider(
      <ExtractedPartsPanel
        partPreviewByKey={
          new Map([
            [
              getPartsListPartPreviewKey("4493c01pb02", "0"),
              {
                colorId: "0",
                imageUrl: "https://cdn.rebrickable.com/media/parts/elements/4493c01pb02.jpg",
                key: getPartsListPartPreviewKey("4493c01pb02", "0"),
                name: "Horse Battle Helmet with Long Printed Catalogue Name and Accurate Pattern",
                partNumber: "4493c01pb02",
              },
            ],
            [
              getPartsListPartPreviewKey("4493c01pr0002", "0"),
              {
                colorId: "0",
                imageUrl: "https://cdn.rebrickable.com/media/parts/elements/4493c01pr0002.jpg",
                key: getPartsListPartPreviewKey("4493c01pr0002", "0"),
                name: "Heuristic print-family fallback",
                partNumber: "4493c01pr0002",
              },
            ],
          ])
        }
        result={printedPartResult}
      />,
    )

    expect(screen.getAllByText("Horse Battle Helmet with Long Printed Catalogue Name and Accurate Pattern")[0]).toBeVisible()
    expect(screen.queryByText("Heuristic print-family fallback")).not.toBeInTheDocument()
    expect(screen.getByText("4493c01pb02")).toBeVisible()
  })

  it("uses a generic preview when the color-specific preview is missing", () => {
    renderWithProvider(
      <ExtractedPartsPanel
        partPreviewByKey={
          new Map([
            [
              getPartsListPartPreviewKey("3068b"),
              {
                imageUrl: "https://cdn.rebrickable.com/media/parts/ldraw/3068b.png",
                key: getPartsListPartPreviewKey("3068b"),
                name: "Tile 2 x 2",
                partNumber: "3068b",
              },
            ],
          ])
        }
        result={supportedResult}
      />,
    )

    expect(screen.getByRole("img", { name: "3068b Light Bluish Gray Tile 2 x 2" })).toHaveAttribute(
      "src",
      "https://cdn.rebrickable.com/media/parts/ldraw/3068b.png",
    )
  })

  it("falls back to a generic preview image when the color-specific preview image fails", () => {
    renderWithProvider(
      <ExtractedPartsPanel
        partPreviewByKey={
          new Map([
            [
              getPartsListPartPreviewKey("3068b", "71"),
              {
                colorId: "71",
                fallbackImageUrl: "https://cdn.rebrickable.com/media/parts/ldraw/3068b.png",
                imageUrl: "https://cdn.rebrickable.com/media/parts/elements/missing-element.jpg",
                key: getPartsListPartPreviewKey("3068b", "71"),
                name: "Tile 2 x 2",
                partNumber: "3068b",
              },
            ],
          ])
        }
        result={supportedResult}
      />,
    )

    const image = screen.getByRole("img", { name: "3068b Light Bluish Gray Tile 2 x 2" })

    expect(image).toHaveAttribute("src", "https://cdn.rebrickable.com/media/parts/elements/missing-element.jpg")
    fireEvent.error(image)
    expect(image).toHaveAttribute("src", "https://cdn.rebrickable.com/media/parts/ldraw/3068b.png")
  })

  it("uses the generic preview as the fallback when a color-specific preview image fails", () => {
    renderWithProvider(
      <ExtractedPartsPanel
        partPreviewByKey={
          new Map([
            [
              getPartsListPartPreviewKey("3068b", "71"),
              {
                colorId: "71",
                imageUrl: "https://cdn.rebrickable.com/media/parts/elements/missing-element.jpg",
                key: getPartsListPartPreviewKey("3068b", "71"),
                name: "Tile 2 x 2",
                partNumber: "3068b",
              },
            ],
            [
              getPartsListPartPreviewKey("3068b"),
              {
                imageUrl: "https://cdn.rebrickable.com/media/parts/ldraw/3068b.png",
                key: getPartsListPartPreviewKey("3068b"),
                name: "Tile 2 x 2",
                partNumber: "3068b",
              },
            ],
          ])
        }
        result={supportedResult}
      />,
    )

    const image = screen.getByRole("img", { name: "3068b Light Bluish Gray Tile 2 x 2" })

    expect(image).toHaveAttribute("src", "https://cdn.rebrickable.com/media/parts/elements/missing-element.jpg")
    fireEvent.error(image)
    expect(image).toHaveAttribute("src", "https://cdn.rebrickable.com/media/parts/ldraw/3068b.png")
  })

  it("sorts rows by every extracted column", async () => {
    const user = userEvent.setup()
    renderWithProvider(<ExtractedPartsPanel result={sortableResult} />)

    expect(getRenderedPartNumbers()).toEqual(["1000", "3068b", "3005"])

    await user.click(screen.getByRole("button", { name: "Sort by Qty ascending" }))
    expect(getRenderedPartNumbers()).toEqual(["1000", "3068b", "3005"])

    await user.click(screen.getByRole("button", { name: "Sort by Qty descending" }))
    expect(getRenderedPartNumbers()).toEqual(["3005", "3068b", "1000"])

    await user.click(screen.getByRole("button", { name: "Sort by Part ascending" }))
    expect(getRenderedPartNumbers()).toEqual(["1000", "3005", "3068b"])

    await user.click(screen.getByRole("button", { name: "Sort by Color ascending" }))
    expect(getRenderedPartNumbers()).toEqual(["3005", "3068b", "1000"])

    await user.click(screen.getByRole("button", { name: "Sort by Page ascending" }))
    expect(getRenderedPartNumbers()).toEqual(["1000", "3068b", "3005"])

    await user.click(screen.getByRole("button", { name: "Sort by Conf. ascending" }))
    expect(getRenderedPartNumbers()).toEqual(["1000", "3005", "3068b"])
  })

  it("sorts rows by completion state", async () => {
    const user = userEvent.setup()
    renderWithProvider(<ExtractedPartsPanel result={sortableResult} />)

    await user.click(screen.getByRole("checkbox", { name: "Mark 3068b as found" }))
    await user.click(screen.getByRole("button", { name: "Sort by completion ascending" }))

    expect(getRenderedSelectedStates()).toEqual(["false", "false", "true"])

    await user.click(screen.getByRole("button", { name: "Sort by completion descending" }))

    expect(getRenderedSelectedStates()).toEqual(["true", "false", "false"])
  })

  it("groups shade variants by their base color when sorting by color", async () => {
    const user = userEvent.setup()
    renderWithProvider(<ExtractedPartsPanel result={colorGroupedResult} />)

    await user.click(screen.getByRole("button", { name: "Sort by Color ascending" }))

    expect(getRenderedColorNames()).toEqual([
      "Dark Bluish Gray",
      "Light Bluish Gray",
      "Dark Tan",
      "Tan",
      "Dark Red",
      "Red",
      "Dark Orange",
      "Orange",
      "Bright Light Orange",
      "Dark Blue",
      "Blue",
      "Light Blue",
      "Unresolved color",
    ])
  })

  it("renders unsupported state without row-by-row correction", () => {
    renderWithProvider(
      <ExtractedPartsPanel
        result={{
          candidates: [],
          confidence: 0,
          lowConfidenceRows: [],
          reason: "no_candidate_pages",
          rows: [],
          status: "unsupported",
        }}
      />,
    )

    expect(screen.getByText("Unsupported")).toBeVisible()
    expect(screen.getByText("No bill of materials was detected in the native PDF text.")).toBeVisible()
  })

  it("surfaces compact normalization attention rows", () => {
    const attentionRows = [
      {
        color: null,
        issues: ["missing_color" as const],
        part: { cataloguePartNumber: "1000", matchKind: "exact" as const },
        partCandidates: [
          {
            matchKind: "exact" as const,
            partNumber: "1000",
            rank: 100,
            selected: true,
          },
        ],
        partNumber: "1000",
        quantity: 1,
        rowId: "9-0-1-1000-unresolved",
        sourcePage: 9,
        status: "unresolved" as const,
      },
    ]

    renderWithProvider(
      <>
        <ExtractedPartsPanel
          result={{
            ...sortableResult,
            normalization: {
              ambiguousQuantity: 0,
              attentionRows,
              catalogueSnapshotId: "abcdef1234567890",
              coverageThreshold: 0.9,
              resolvedQuantity: 16,
              rows: attentionRows,
              status: "ready",
              totalQuantity: 17,
              unresolvedQuantity: 1,
            },
          }}
        />
        <NormalizationAttentionList rows={attentionRows} />
      </>,
    )

    expect(screen.getByTestId("parts-normalization-summary")).toHaveTextContent("94% normalized")
    expect(screen.getByText("1 unresolved")).toBeVisible()
    expect(screen.getByText("Catalogue abcdef123456")).toBeVisible()
    expect(screen.getByText("Normalization needs attention")).toBeVisible()
    expect(screen.getByText("1 x 1000 unresolved color, page 9: missing color")).toBeVisible()
  })

  it("shows every normalization attention row", () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
      color: null,
      issues: ["missing_color" as const],
      part: { cataloguePartNumber: `${1000 + index}`, matchKind: "exact" as const },
      partCandidates: [],
      partNumber: `${1000 + index}`,
      quantity: 1,
      rowId: `9-${index}-1-${1000 + index}-unresolved`,
      sourcePage: 9,
      status: "unresolved" as const,
    }))

    renderWithProvider(<NormalizationAttentionList rows={rows} />)

    expect(screen.getAllByTestId("normalization-attention-row")).toHaveLength(6)
    expect(screen.queryByText("2 more rows")).not.toBeInTheDocument()
  })
})

function getRenderedPartNumbers() {
  return screen.getAllByTestId("extracted-part-row").map((row) => {
    const text = row.textContent ?? ""
    const partNumber = ["1000", "3005", "3068b"].find((candidate) => text.includes(candidate))

    expect(partNumber).toBeTruthy()
    return partNumber
  })
}

function getRenderedColorNames() {
  return screen.getAllByTestId("extracted-part-row").map((row) => row.getAttribute("data-color-name") || "Unresolved color")
}

function getRenderedSelectedStates() {
  return screen.getAllByTestId("extracted-part-row").map((row) => row.getAttribute("data-selected") ?? "false")
}

const supportedResult = {
  candidates: [
    {
      anchorCount: 2,
      highConfidenceRowCount: 2,
      pageNumber: 10,
      rowCount: 2,
      score: 1,
      searchTier: "tail",
    },
  ],
  confidence: 1,
  lowConfidenceRows: [],
  reason: null,
  rows: [
    {
      color: {
        id: "71",
        isTransparent: false,
        matchedText: "Light Bluish Gray",
        name: "Light Bluish Gray",
        rgb: "A0A5A9",
      },
      confidence: 1,
      part: { cataloguePartNumber: "3068b", matchKind: "exact" },
      partNumber: "3068b",
      partNumberKind: "mold_variation",
      quantity: 2,
      rawText: "2 x 3068b Light Bluish Gray",
      sourcePage: 10,
      sourceTextRange: { end: 28, start: 0 },
    },
    {
      color: { id: "0", isTransparent: false, matchedText: "Black", name: "Black", rgb: "1B1B1B" },
      confidence: 1,
      part: { cataloguePartNumber: "3005", matchKind: "exact" },
      partNumber: "3005",
      partNumberKind: "numeric",
      quantity: 14,
      rawText: "14 x 3005 Black",
      sourcePage: 10,
      sourceTextRange: { end: 45, start: 29 },
    },
  ],
  status: "supported",
} satisfies PartsListFromPageTextResult

const sortableResult = {
  ...supportedResult,
  confidence: 0.85,
  lowConfidenceRows: [
    {
      color: null,
      confidence: 0.75,
      part: null,
      partNumber: "1000",
      partNumberKind: "numeric",
      quantity: 1,
      rawText: "1 x 1000",
      sourcePage: 9,
      sourceTextRange: { end: 8, start: 0 },
    },
    {
      color: { id: "0", isTransparent: false, matchedText: "Black", name: "Black", rgb: "1B1B1B" },
      confidence: 0.8,
      part: { cataloguePartNumber: "3005", matchKind: "exact" },
      partNumber: "3005",
      partNumberKind: "numeric",
      quantity: 14,
      rawText: "14 x 3005 Black",
      sourcePage: 12,
      sourceTextRange: { end: 45, start: 29 },
    },
  ],
  rows: [
    {
      color: {
        id: "71",
        isTransparent: false,
        matchedText: "Light Bluish Gray",
        name: "Light Bluish Gray",
        rgb: "A0A5A9",
      },
      confidence: 1,
      part: { cataloguePartNumber: "3068b", matchKind: "exact" },
      partNumber: "3068b",
      partNumberKind: "mold_variation",
      quantity: 2,
      rawText: "2 x 3068b Light Bluish Gray",
      sourcePage: 10,
      sourceTextRange: { end: 28, start: 0 },
    },
    {
      color: { id: "0", isTransparent: false, matchedText: "Black", name: "Black", rgb: "1B1B1B" },
      confidence: 0.8,
      part: { cataloguePartNumber: "3005", matchKind: "exact" },
      partNumber: "3005",
      partNumberKind: "numeric",
      quantity: 14,
      rawText: "14 x 3005 Black",
      sourcePage: 12,
      sourceTextRange: { end: 45, start: 29 },
    },
    {
      color: null,
      confidence: 0.75,
      part: null,
      partNumber: "1000",
      partNumberKind: "numeric",
      quantity: 1,
      rawText: "1 x 1000",
      sourcePage: 9,
      sourceTextRange: { end: 8, start: 0 },
    },
  ],
  status: "needs_attention",
} satisfies PartsListFromPageTextResult

const printedPartResult = {
  ...supportedResult,
  rows: [
    {
      color: { id: "0", isTransparent: false, matchedText: "Black", name: "Black", rgb: "1B1B1B" },
      confidence: 0.97,
      part: { cataloguePartNumber: "4493c01pr0002", matchKind: "print_family" },
      partNumber: "4493c01pb02",
      partNumberKind: "assembly_print",
      quantity: 1,
      rawText: "1 x 4493c01pb02 Black",
      sourcePage: 10,
      sourceTextRange: { end: 22, start: 0 },
    },
  ],
} satisfies PartsListFromPageTextResult

const colorGroupedResult = {
  ...supportedResult,
  rows: [
    makeSortableColorRow(1, "1001", "Blue", "0055BF"),
    makeSortableColorRow(2, "1002", "Dark Tan", "958A73"),
    makeSortableColorRow(3, "1003", "Red", "C91A09"),
    makeSortableColorRow(4, "1004", "Dark Blue", "0A3463"),
    makeSortableColorRow(5, "1005", "Light Bluish Gray", "A0A5A9"),
    makeSortableColorRow(6, "1006", "Orange", "FE8A18"),
    makeSortableColorRow(7, "1007", "Dark Red", "720E0F"),
    makeSortableColorRow(8, "1008", "Light Blue", "B4D2E3"),
    makeSortableColorRow(9, "1009", "Bright Light Orange", "F8BB3D"),
    makeSortableColorRow(10, "1010", "Tan", "E4CD9E"),
    makeSortableColorRow(11, "1011", "Dark Orange", "A95500"),
    makeSortableColorRow(12, "1012", "Dark Bluish Gray", "6C6E68"),
    {
      color: null,
      confidence: 0.7,
      part: null,
      partNumber: "1013",
      partNumberKind: "numeric",
      quantity: 1,
      rawText: "1 x 1013",
      sourcePage: 13,
      sourceTextRange: { end: 8, start: 120 },
    },
  ],
} satisfies PartsListFromPageTextResult

function makeSortableColorRow(
  index: number,
  partNumber: string,
  colorName: string,
  rgb: string,
): ParsedPartsListPageRow {
  return {
    color: {
      id: String(index),
      isTransparent: false,
      matchedText: colorName,
      name: colorName,
      rgb,
    },
    confidence: 1,
    part: { cataloguePartNumber: partNumber, matchKind: "exact" },
    partNumber,
    partNumberKind: "numeric",
    quantity: 1,
    rawText: `1 x ${partNumber} ${colorName}`,
    sourcePage: index,
    sourceTextRange: { end: 20 + index, start: index * 10 },
  }
}
