import { describe, expect, it } from "vitest"
import type { ParsedPartsListPageRow } from "./parts-list-extraction"
import { normalizePartsListRows } from "./parts-list-normalization"
import { createPartsListPartCatalogue } from "./rebrickable-catalogue"

describe("normalizePartsListRows", () => {
  it("summarizes canonical Rebrickable coverage by quantity", () => {
    const catalogue = createPartsListPartCatalogue({
      parts: ["3005", "3068b"],
      snapshot: { id: "catalogue-2026-05-17" },
    })

    const normalization = normalizePartsListRows(
      [
        createRow({
          colorId: "0",
          part: { cataloguePartNumber: "3005", matchKind: "exact" },
          partNumber: "3005",
          quantity: 9,
        }),
        createRow({
          colorId: "71",
          part: { cataloguePartNumber: "3068b", matchKind: "exact" },
          partNumber: "3068b",
          quantity: 1,
        }),
        createRow({
          colorId: null,
          part: null,
          partNumber: "99999",
          quantity: 1,
        }),
      ],
      { partCatalogue: catalogue },
    )

    expect(normalization).toMatchObject({
      catalogueSnapshotId: "catalogue-2026-05-17",
      resolvedQuantity: 10,
      status: "ready",
      totalQuantity: 11,
      unresolvedQuantity: 1,
    })
    expect(normalization.attentionRows).toMatchObject([
      {
        issues: ["missing_part", "missing_color"],
        partNumber: "99999",
        quantity: 1,
        status: "unresolved",
      },
    ])
  })

  it("attaches Rebrickable part names to selected normalized parts", () => {
    const catalogue = createPartsListPartCatalogue({
      parts: [
        { name: "Brick 1 x 1", partNum: "3005" },
      ],
    })

    const normalization = normalizePartsListRows(
      [
        createRow({
          colorId: "0",
          part: null,
          partNumber: "3005",
          quantity: 2,
        }),
      ],
      { partCatalogue: catalogue },
    )

    expect(normalization.rows[0]?.part).toMatchObject({
      cataloguePartNumber: "3005",
      matchKind: "exact",
      name: "Brick 1 x 1",
    })
  })

  it("preserves selected and alternate candidates for ambiguous catalogue matches", () => {
    const catalogue = createPartsListPartCatalogue({
      parts: ["4493c01pr0001", "4493c01pr0002", "4493c01pr0003"],
    })

    const normalization = normalizePartsListRows(
      [
        createRow({
          colorId: "0",
          part: { cataloguePartNumber: "4493c01pr0002", matchKind: "print_family" },
          partNumber: "4493c01pb02",
          quantity: 2,
        }),
      ],
      { partCatalogue: catalogue },
    )

    expect(normalization.status).toBe("needs_attention")
    expect(normalization.ambiguousQuantity).toBe(2)
    expect(normalization.attentionRows).toMatchObject([
      {
        issues: ["ambiguous_part"],
        partCandidates: [
          { partNumber: "4493c01pr0002", selected: true },
          { partNumber: "4493c01pr0001", selected: false },
          { partNumber: "4493c01pr0003", selected: false },
        ],
        status: "ambiguous",
      },
    ])
  })

  it("marks missing catalogue or color records as unresolved", () => {
    const normalization = normalizePartsListRows([
      createRow({
        colorId: "0",
        part: null,
        partNumber: "99999",
        quantity: 3,
      }),
      createRow({
        colorId: null,
        part: { cataloguePartNumber: "3005", matchKind: "exact" },
        partNumber: "3005",
        quantity: 2,
      }),
    ])

    expect(normalization).toMatchObject({
      resolvedQuantity: 0,
      status: "needs_attention",
      totalQuantity: 5,
      unresolvedQuantity: 5,
    })
    expect(normalization.attentionRows.map((row) => row.issues)).toEqual([
      ["missing_part"],
      ["missing_color"],
    ])
  })

  it("normalizes manual-only mold suffixes to the catalogue base part", () => {
    const catalogue = createPartsListPartCatalogue({
      parts: ["2436"],
    })

    const normalization = normalizePartsListRows(
      [
        createRow({
          colorId: "0",
          part: null,
          partNumber: "2436b",
          quantity: 2,
        }),
      ],
      { partCatalogue: catalogue },
    )

    expect(normalization).toMatchObject({
      resolvedQuantity: 2,
      status: "ready",
      totalQuantity: 2,
      unresolvedQuantity: 0,
    })
    expect(normalization.rows).toMatchObject([
      {
        issues: [],
        part: { cataloguePartNumber: "2436", matchKind: "ocr_suffix_noise" },
        partCandidates: [
          {
            matchKind: "ocr_suffix_noise",
            partNumber: "2436",
            selected: true,
          },
        ],
        partNumber: "2436b",
        status: "resolved",
      },
    ])
  })
})

function createRow({
  colorId,
  part,
  partNumber,
  quantity,
}: {
  colorId: string | null
  part: ParsedPartsListPageRow["part"]
  partNumber: string
  quantity: number
}): ParsedPartsListPageRow {
  return {
    color: colorId
      ? {
          id: colorId,
          matchedText: colorId === "0" ? "Black" : "Light Bluish Gray",
          name: colorId === "0" ? "Black" : "Light Bluish Gray",
        }
      : null,
    confidence: part && colorId ? 1 : 0.75,
    part,
    partNumber,
    partNumberKind: "numeric",
    quantity,
    rawText: `${quantity} x ${partNumber}`,
    sourcePage: 10,
    sourceTextRange: { end: 10, start: quantity },
  }
}
