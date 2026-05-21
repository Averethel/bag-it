import { describe, expect, it } from "vitest"
import {
  classifyPartNumber,
  extractPartsListFromPageTexts,
  getExpandedTailCandidatePageNumbers,
  getTailCandidatePageNumbers,
  isLikelyManualPartNumber,
  parsePartsListRowsFromText,
  rankPartsListPageCandidates,
  scorePartsListTextCandidate,
  type PartsListColor,
  type PartsListPartCatalogue,
} from "./parts-list-extraction"

const colors: PartsListColor[] = [
  { id: "0", name: "Black" },
  { aliases: ["Light Bluish Grey"], id: "71", name: "Light Bluish Gray" },
  { id: "72", name: "Dark Bluish Gray" },
  { id: "15", name: "White" },
  { id: "4", name: "Red" },
  { id: "320", name: "Dark Red" },
  { aliases: ["studio-6"], id: "2", name: "Green" },
  { id: "6", name: "Tan" },
  { id: "6", name: "Brown" },
  { id: "70", name: "Reddish Brown" },
  { aliases: ["studio-69"], id: "69", name: "Dark Tan" },
  { id: "321", name: "Dark Azure" },
  { id: "191", name: "Bright Light Orange" },
  { id: "84", name: "Medium Nougat" },
  { id: "7", name: "Light Gray" },
  { id: "179", name: "Flat Silver" },
  { id: "182", name: "Trans-Orange" },
  { id: "297", name: "Pearl Gold" },
  { id: "334", name: "Chrome Gold" },
  { id: "5", name: "Dark Pink" },
  { aliases: ["Satin Trans-Clear"], id: "1055", name: "Opal Trans-Clear" },
  { id: "9999", name: "[No Color/Any Color]" },
  { aliases: ["studio-3"], id: "14", name: "Yellow" },
]
const partCatalogue: PartsListPartCatalogue = {
  assemblyComponentsByPart: new Map([["73983", new Set(["2429", "2430"])]]),
  assemblyParentsByComponent: new Map([
    ["2429", new Set(["73983"])],
    ["2430", new Set(["73983"])],
  ]),
  externalPartAliasByPart: new Map([
    ["3005old", "3005"],
    ["60475old", "60475b"],
    ["970", "3815"],
  ]),
  moldFamilyByPart: new Map([["3024b", new Set(["3024b", "3024c"])]]),
  parts: new Set([
    "2429",
    "2430",
    "3005",
    "3709",
    "3957b",
    "48729b",
    "3023",
    "3024b",
    "3002",
    "3245b",
    "79389",
    "79756",
    "2780",
    "3062",
    "3039",
    "1745",
    "3386",
    "49307",
    "44728",
    "2431",
    "25375",
    "60607",
    "11476",
    "11211",
    "18041",
    "4070",
    "3700",
    "41682",
    "30166",
    "30374",
    "28870",
    "33291",
    "34103",
    "2310",
    "4286",
    "77808",
    "35480",
    "4865",
    "2357",
    "22885",
    "4490",
    "3001",
    "27925",
    "95343",
    "4085d",
    "78666",
    "25269",
    "15208",
    "421",
    "3069",
    "41835pb01",
    "3846pb063",
    "87087",
    "60475b",
    "3815",
    "3068b",
    "4495a",
    "73983",
    "970c31",
    "22385pr2005",
    "2335pr0011",
    "42947",
    "92947",
    "973p4q",
    "99780",
  ]),
  printFamilyByBase: new Map([
    ["2335", new Set(["2335pr0011"])],
    ["3068b", new Set(["3068bpr9955"])],
    ["4493c01", new Set(["4493c01pr0002"])],
  ]),
  printParentByPart: new Map([["973pb1234", "973"]]),
  singleLetterMoldVariantByPart: new Map([["3024", "3024b"]]),
}

describe("parsePartsListRowsFromText", () => {
  it("extracts repeated quantity, part number, and catalogue color rows", () => {
    const rows = parsePartsListRowsFromText(
      "2 x 3068b Light Bluish Gray\n14 x 3005 Black\n1 x 970c31 Dark Tan",
      colors,
    )

    expect(rows).toMatchObject([
      {
        color: { id: "71", name: "Light Bluish Gray" },
        partNumber: "3068b",
        partNumberKind: "mold_variation",
        quantity: 2,
      },
      {
        color: { id: "0", name: "Black" },
        partNumber: "3005",
        partNumberKind: "numeric",
        quantity: 14,
      },
      {
        color: { id: "69", name: "Dark Tan" },
        partNumber: "970c31",
        partNumberKind: "assembly",
        quantity: 1,
      },
    ])
    expect(rows.every((row) => row.confidence >= 0.9)).toBe(true)
  })

  it("uses finite color aliases to absorb common spelling variation", () => {
    const rows = parsePartsListRowsFromText("8 x 3023 Light Bluish Grey", colors)

    expect(rows).toMatchObject([
      {
        color: { id: "71", name: "Light Bluish Gray" },
        partNumber: "3023",
        quantity: 8,
      },
    ])
  })

  it("prefers the longest matching color name", () => {
    const rows = parsePartsListRowsFromText("3 x 3024 Dark Tan\n3 x 3024 Tan", colors)

    expect(rows.map((row) => row.color?.name)).toEqual(["Dark Tan", "Tan"])
  })

  it("keeps unusual catalogue-shaped part numbers instead of rejecting them", () => {
    const rows = parsePartsListRowsFromText(
      "1 x 973c47h03pr0001 White\n1 x 970c11pat19pr1522 Green",
      colors,
    )

    expect(rows).toMatchObject([
      {
        color: { name: "White" },
        partNumber: "973c47h03pr0001",
        partNumberKind: "unusual",
        quantity: 1,
      },
      {
        color: { name: "Green" },
        partNumber: "970c11pat19pr1522",
        partNumberKind: "unusual",
        quantity: 1,
      },
    ])
    expect(rows.every((row) => row.confidence < 1)).toBe(true)
  })

  it("tracks low-confidence rows when a catalogue color is missing", () => {
    const rows = parsePartsListRowsFromText("4 x 3001 Not A Catalogue Color", colors)

    expect(rows).toMatchObject([
      {
        color: null,
        partNumber: "3001",
        quantity: 4,
      },
    ])
    expect(rows[0]?.confidence).toBeLessThan(0.9)
  })

  it("matches catalogue color ids as finite color codes", () => {
    const rows = parsePartsListRowsFromText("4 x 3001 2", colors)

    expect(rows).toMatchObject([
      {
        color: { id: "2", matchedText: "2", name: "Green" },
        partNumber: "3001",
        quantity: 4,
      },
    ])
  })

  it("resolves parsed part numbers against local catalogue data", () => {
    const rows = parsePartsListRowsFromText(
      [
        "1 x 3005 Black",
        "1 x 3024 Black",
        "1 x 3005old Black",
        "1 x 60475old Black",
        "1 x 2335p44 Black",
        "1 x 3068bpx24 Black",
        "1 x 4493c01pb02 Black",
        "1 x 44953 White",
        "1 x 999999 Black",
      ].join("\n"),
      colors,
      partCatalogue,
    )

    expect(rows).toMatchObject([
      {
        confidence: 1,
        part: { cataloguePartNumber: "3005", matchKind: "exact" },
        partNumber: "3005",
      },
      {
        confidence: 0.97,
        part: { cataloguePartNumber: "3024b", matchKind: "missing_mold_suffix" },
        partNumber: "3024",
      },
      {
        confidence: 1,
        part: { cataloguePartNumber: "3005", matchKind: "external_alias" },
        partNumber: "3005old",
      },
      {
        confidence: 1,
        part: { cataloguePartNumber: "60475b", matchKind: "external_alias" },
        partNumber: "60475old",
      },
      {
        confidence: 0.97,
        part: { cataloguePartNumber: "2335pr0011", matchKind: "print_family" },
        partNumber: "2335p44",
      },
      {
        confidence: 0.97,
        part: { cataloguePartNumber: "3068bpr9955", matchKind: "print_family" },
        partNumber: "3068bpx24",
      },
      {
        confidence: 0.97,
        part: { cataloguePartNumber: "4493c01pr0002", matchKind: "print_family" },
        partNumber: "4493c01pb02",
      },
      {
        confidence: 0.97,
        part: { cataloguePartNumber: "4495a", matchKind: "ocr_mold_suffix" },
        partNumber: "4495a",
      },
      {
        confidence: 0.83,
        part: null,
        partNumber: "999999",
      },
    ])
  })

  it("repairs OCR part numbers with fused leading quantity digits and trailing suffix noise", () => {
    const rows = parsePartsListRowsFromText(
      "1 x 13005 Black\n2 x 79389r Reddish Brown\n4 x 870872 Light Bluish Gray\n1 x 37090 Black\n2 x 53957b Black\n1 x 487290 Black\n1 x 97304q White",
      colors,
      partCatalogue,
    )

    expect(rows).toMatchObject([
      {
        confidence: 0.97,
        part: { cataloguePartNumber: "3005", matchKind: "fused_quantity_prefix" },
        partNumber: "3005",
        quantity: 1,
      },
      {
        confidence: 0.97,
        part: { cataloguePartNumber: "79389", matchKind: "ocr_suffix_noise" },
        partNumber: "79389",
        quantity: 2,
      },
      {
        confidence: 0.97,
        part: { cataloguePartNumber: "87087", matchKind: "ocr_suffix_noise" },
        partNumber: "87087",
        quantity: 4,
      },
      {
        confidence: 0.97,
        part: { cataloguePartNumber: "3709", matchKind: "ocr_suffix_noise" },
        partNumber: "3709",
        quantity: 1,
      },
      {
        confidence: 0.97,
        part: { cataloguePartNumber: "3957b", matchKind: "ocr_suffix_noise" },
        partNumber: "3957b",
        quantity: 2,
      },
      {
        confidence: 0.97,
        part: { cataloguePartNumber: "48729b", matchKind: "ocr_suffix_noise" },
        partNumber: "48729b",
        quantity: 1,
      },
      {
        confidence: 0.97,
        part: { cataloguePartNumber: "973p4q", matchKind: "ocr_suffix_noise" },
        partNumber: "973p4q",
        quantity: 1,
      },
    ])
  })

  it("repairs catalogue-backed leading digit OCR slips on Studio color-code rows", () => {
    const rows = parsePartsListRowsFromText(
      "5 x 7970 studio-6\n1 x 39780 Light Bluish Gray\n1 x 2947 Reddish Brown",
      colors,
      partCatalogue,
    )

    expect(rows).toMatchObject([
      {
        confidence: 0.97,
        part: { cataloguePartNumber: "970", matchKind: "ocr_suffix_noise" },
        partNumber: "970",
        quantity: 5,
      },
      {
        confidence: 0.97,
        part: { cataloguePartNumber: "99780", matchKind: "ocr_digit_variant" },
        partNumber: "99780",
        quantity: 1,
      },
      {
        confidence: 0.97,
        part: { cataloguePartNumber: "92947", matchKind: "ocr_digit_variant" },
        partNumber: "92947",
        quantity: 1,
      },
    ])
  })

  it("rejects quantity-like and letter-prefixed OCR fragments as part numbers", () => {
    const rows = parsePartsListRowsFromText(
      "1 x 1x Black\n4 x 4x 2\n2 x 2 2\n1 x ray18 Black\n1 x 3001 Black",
      colors,
    )

    expect(rows).toMatchObject([
      {
        color: { id: "0", name: "Black" },
        partNumber: "3001",
        quantity: 1,
      },
    ])
  })
})

function createTestRowSource(
  rawText: string,
  start: number,
  rowRegion: { height: number; unit: "ocr_pixel"; width: number; x: number; y: number } | null,
  rawTokens: readonly string[] = [rawText],
) {
  return {
    cropReferences: [],
    partThumbnailRegion: null,
    rawText,
    rawTokens,
    rowRegion,
    textRange: {
      end: start + rawText.length,
      start,
    },
  }
}

describe("classifyPartNumber", () => {
  it("classifies common Rebrickable-style part number forms", () => {
    expect(classifyPartNumber("3024")).toBe("numeric")
    expect(classifyPartNumber("3068b")).toBe("mold_variation")
    expect(classifyPartNumber("10509pr0004")).toBe("print")
    expect(classifyPartNumber("3068bpx24")).toBe("print")
    expect(classifyPartNumber("970c31")).toBe("assembly")
    expect(classifyPartNumber("4493c01pr0002")).toBe("assembly_print")
    expect(classifyPartNumber("4493c01pb02")).toBe("assembly_print")
    expect(classifyPartNumber("85959pat0002")).toBe("pattern")
    expect(classifyPartNumber("abcupn0001")).toBe("unknown_catalogue")
    expect(classifyPartNumber("973c28h01")).toBe("unusual")
  })

  it("identifies manually parsed part numbers without accepting quantities", () => {
    expect(isLikelyManualPartNumber("3024")).toBe(true)
    expect(isLikelyManualPartNumber("10509c01pb02")).toBe(true)
    expect(isLikelyManualPartNumber("1x")).toBe(false)
    expect(isLikelyManualPartNumber("4x")).toBe(false)
    expect(isLikelyManualPartNumber("2")).toBe(false)
    expect(isLikelyManualPartNumber("ray18")).toBe(false)
  })
})

describe("parts-list page selection helpers", () => {
  it("selects a bounded tail-page window first", () => {
    expect(getTailCandidatePageNumbers(5)).toEqual([1, 2, 3, 4, 5])
    expect(getTailCandidatePageNumbers(20, 8)).toEqual([13, 14, 15, 16, 17, 18, 19, 20])
  })

  it("expands to the larger of the minimum window and tail ratio", () => {
    expect(getExpandedTailCandidatePageNumbers(40)).toEqual([
      29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
    ])
    expect(getExpandedTailCandidatePageNumbers(100)).toEqual([
      81, 82, 83, 84, 85, 86, 87, 88, 89, 90,
      91, 92, 93, 94, 95, 96, 97, 98, 99, 100,
    ])
  })
})

describe("scorePartsListTextCandidate", () => {
  it("scores repeated high-confidence row grammar as a likely parts list", () => {
    const likelyPartsList = scorePartsListTextCandidate(
      "2 x 3068b Light Bluish Gray\n14 x 3005 Black\n1 x 970c31 Dark Tan",
      colors,
    )
    const weakText = scorePartsListTextCandidate("Step 4 attach the wall to the base", colors)

    expect(likelyPartsList).toMatchObject({
      anchorCount: 3,
      highConfidenceRowCount: 3,
      rowCount: 3,
    })
    expect(likelyPartsList.score).toBeGreaterThan(weakText.score)
  })
})

describe("rankPartsListPageCandidates", () => {
  it("returns strong tail-page candidates without scanning earlier text", () => {
    const candidates = rankPartsListPageCandidates({
      colors,
      pageCount: 30,
      pageTexts: [
        {
          pageNumber: 1,
          text: "4 x 3001 Black\n2 x 3002 White\n1 x 3003 Tan",
        },
        {
          pageNumber: 29,
          text: "2 x 3068b Light Bluish Gray\n14 x 3005 Black\n1 x 970c31 Dark Tan",
        },
      ],
      tailPageCount: 4,
    })

    expect(candidates[0]).toMatchObject({
      pageNumber: 29,
      searchTier: "tail",
    })
    expect(candidates.some((candidate) => candidate.pageNumber === 1)).toBe(false)
  })

  it("expands the tail window when the final pages are weak", () => {
    const candidates = rankPartsListPageCandidates({
      colors,
      pageCount: 30,
      pageTexts: [
        {
          pageNumber: 25,
          text: "2 x 3068b Light Bluish Gray\n14 x 3005 Black\n1 x 970c31 Dark Tan",
        },
      ],
      tailPageCount: 4,
    })

    expect(candidates[0]).toMatchObject({
      pageNumber: 25,
      searchTier: "expanded_tail",
    })
  })

  it("falls back to full text when the expanded tail is weak", () => {
    const candidates = rankPartsListPageCandidates({
      colors,
      pageCount: 30,
      pageTexts: [
        {
          pageNumber: 3,
          text: "2 x 3068b Light Bluish Gray\n14 x 3005 Black\n1 x 970c31 Dark Tan",
        },
      ],
      tailPageCount: 4,
    })

    expect(candidates[0]).toMatchObject({
      pageNumber: 3,
      searchTier: "full_text",
    })
  })

  it("keeps weak contiguous inventory pages even when ranked below the candidate cap", () => {
    const candidates = rankPartsListPageCandidates({
      colors,
      maxCandidates: 2,
      pageCount: 55,
      pageTexts: [
        { pageNumber: 51, text: "1 x 87616 OCR Color Fragment" },
        { pageNumber: 52, text: "2 x 3024 OCR Color Fragment" },
        { pageNumber: 53, text: "4 x 4488 OCR Color Fragment" },
        { pageNumber: 54, text: "1 x 3023 Black\n2 x 4073 Light Bluish Gray" },
        { pageNumber: 55, text: "1 x 3005 Black" },
      ],
      tailPageCount: 12,
    })

    expect(candidates.map((candidate) => candidate.pageNumber).sort((left, right) => left - right)).toEqual([
      51, 52, 53, 54, 55,
    ])
  })
})

describe("extractPartsListFromPageTexts", () => {
  it("extracts supported rows from likely parts-list page text", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          text: "2 x 3068b Light Bluish Gray\n14 x 3005 Black\n1 x 970c31 Dark Tan",
        },
      ],
    })

    expect(result).toMatchObject({
      confidence: 1,
      reason: null,
      status: "supported",
    })
    expect(result.rows).toMatchObject([
      { partNumber: "3068b", quantity: 2, sourcePage: 19 },
      { partNumber: "3005", quantity: 14, sourcePage: 19 },
      { partNumber: "970c31", quantity: 1, sourcePage: 19 },
    ])
  })

  it("deduplicates same-page OCR rows after catalogue suffix cleanup", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          text: "2 x 79389 Reddish Brown\n2 x 79389r Reddish Brown\n1 x 3005 Black",
        },
      ],
      partCatalogue,
    })

    expect(result.rows.map((row) => [row.quantity, row.partNumber, row.color?.id])).toEqual([
      [2, "79389", "70"],
      [1, "3005", "0"],
    ])
  })

  it("keeps corrected OCR duplicate rows when their visual regions are distinct", () => {
    const text = "2 x 79389 Reddish Brown\n2 x 79389r Reddish Brown\n1 x 3005 Black"
    const result = extractPartsListFromPageTexts({
      colors,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          rowSources: [
            createTestRowSource("2 x 79389 Reddish Brown", 0, { height: 30, unit: "ocr_pixel", width: 120, x: 20, y: 20 }),
            createTestRowSource("2 x 79389r Reddish Brown", 25, { height: 30, unit: "ocr_pixel", width: 120, x: 20, y: 220 }),
            createTestRowSource("1 x 3005 Black", 51, { height: 30, unit: "ocr_pixel", width: 120, x: 20, y: 260 }),
          ],
          sourceKind: "ocr",
          text,
        },
      ],
      partCatalogue,
    })

    expect(result.rows.map((row) => [row.quantity, row.partNumber, row.color?.id, row.sourceRegion?.y])).toEqual([
      [2, "79389", "70", 20],
      [2, "79389", "70", 220],
      [1, "3005", "0", 260],
    ])
  })

  it("deduplicates exact same-page OCR rows from repeated dense-page evidence", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          sourceKind: "ocr",
          text: "1 x 3830 Light Bluish Gray\n1 x 3830 Light Bluish Gray\n1 x 3005 Black",
        },
      ],
      partCatalogue: {
        ...partCatalogue,
        parts: new Set([...partCatalogue.parts, "3830"]),
      },
    })

    expect(result.rows.map((row) => [row.quantity, row.partNumber, row.color?.id])).toEqual([
      [1, "3830", "71"],
      [1, "3005", "0"],
    ])
  })

  it("drops unresolved same-region OCR variants when a catalogue row overlaps", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      minimumPageScore: 0,
      minimumRowCount: 1,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          rowSources: [
            createTestRowSource("1 x 54384 Dark Bluish Gray", 0, {
              height: 80,
              unit: "ocr_pixel",
              width: 180,
              x: 100,
              y: 200,
            }),
            createTestRowSource("1 x 5431 Dark Bluish Gray", 28, {
              height: 78,
              unit: "ocr_pixel",
              width: 176,
              x: 102,
              y: 201,
            }),
          ],
          sourceKind: "ocr",
          text: "1 x 54384 Dark Bluish Gray\n1 x 5431 Dark Bluish Gray",
        },
      ],
      partCatalogue: {
        ...partCatalogue,
        parts: new Set([...partCatalogue.parts, "54384"]),
      },
    })

    expect(result.rows.map((row) => row.partNumber)).toEqual(["54384"])
  })

  it("keeps weak row-bearing pages contiguous with strong multi-page inventories", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      pageCount: 55,
      pageTexts: [
        { pageNumber: 51, text: "1 x 87616 OCR Color Fragment" },
        { pageNumber: 52, text: "2 x 3024 OCR Color Fragment" },
        { pageNumber: 53, text: "4 x 4488 OCR Color Fragment" },
        { pageNumber: 54, text: "1 x 3023 Black\n2 x 4073 Light Bluish Gray" },
        { pageNumber: 55, text: "1 x 3005 Black" },
      ],
      tailPageCount: 12,
    })

    expect(result).toMatchObject({
      reason: null,
      status: "needs_attention",
    })
    expect(result.rows.map((row) => [row.sourcePage, row.partNumber])).toEqual([
      [51, "87616"],
      [52, "3024"],
      [53, "4488"],
      [54, "3023"],
      [54, "4073"],
      [55, "3005"],
    ])
  })

  it("keeps explicit same-page component rows as manual part numbers", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          text: "2 x 2429 Dark Bluish Gray\n2 x 2430 Dark Bluish Gray\n1 x 3005 Black",
        },
      ],
      partCatalogue,
    })

    expect(result.rows).toMatchObject([
      {
        color: { id: "72", name: "Dark Bluish Gray" },
        part: { cataloguePartNumber: "2429", matchKind: "exact" },
        partNumber: "2429",
        quantity: 2,
        sourcePage: 19,
      },
      {
        color: { id: "72", name: "Dark Bluish Gray" },
        part: { cataloguePartNumber: "2430", matchKind: "exact" },
        partNumber: "2430",
        quantity: 2,
        sourcePage: 19,
      },
      {
        partNumber: "3005",
        quantity: 1,
      },
    ])
  })

  it("attaches private OCR row-source metadata when page text provides it", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          rowSources: [
            {
              cropReferences: [
                {
                  id: "row:p19:x10:y20:w50:h60",
                  kind: "row",
                  pageNumber: 19,
                  region: { height: 60, unit: "ocr_pixel", width: 50, x: 10, y: 20 },
                },
              ],
              partThumbnailRegion: { height: 80, unit: "ocr_pixel", width: 80, x: 0, y: 0 },
              rawText: "2 x 3068b Light Bluish Gray",
              rawTokens: ["2x", "3068b", "Light Bluish Gray"],
              rowRegion: { height: 60, unit: "ocr_pixel", width: 50, x: 10, y: 20 },
              sourceImage: { height: 2400, unit: "ocr_pixel", width: 1800 },
              textRange: { end: 27, start: 0 },
            },
          ],
          sourceKind: "ocr",
          text: "2 x 3068b Light Bluish Gray",
        },
      ],
    })

    expect(result.rows[0]).toMatchObject({
      cropReferences: [{ id: "row:p19:x10:y20:w50:h60", kind: "row" }],
      partNumber: "3068b",
      partThumbnailRegion: { height: 80, width: 80, x: 0, y: 0 },
      parserVersion: "parts-list-v1",
      sourceKind: "ocr",
      sourceImage: { height: 2400, width: 1800 },
      sourcePage: 19,
      sourceRegion: { height: 60, width: 50, x: 10, y: 20 },
      sourceTokens: ["2x", "3068b", "Light Bluish Gray"],
    })
  })

  it("corrects fused color-plus-part OCR digit variants when catalogue mold data supports it", () => {
    const text = "1 x 47993 Dark Bluish Gray"
    const digitVariantCatalogue: PartsListPartCatalogue = {
      ...partCatalogue,
      moldFamilyByPart: new Map([
        ...(partCatalogue.moldFamilyByPart ?? []),
        ["11399", new Set(["11399", "47998"])],
        ["47998", new Set(["11399", "47998"])],
      ]),
      parts: new Set([...partCatalogue.parts, "11399", "47993", "47998"]),
    }

    const result = extractPartsListFromPageTexts({
      colors,
      minimumPageScore: 0,
      minimumRowCount: 1,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          rowSources: [
            {
              cropReferences: [],
              partThumbnailRegion: null,
              rawText: text,
              rawTokens: ["1x", "Dark Bluish Gray47993"],
              rowRegion: { height: 24, unit: "ocr_pixel", width: 120, x: 40, y: 80 },
              textRange: { end: text.length, start: 0 },
            },
          ],
          sourceKind: "ocr",
          text,
        },
      ],
      partCatalogue: digitVariantCatalogue,
    })

    expect(result.rows).toMatchObject([
      {
        part: { cataloguePartNumber: "47998", matchKind: "ocr_digit_variant" },
        partNumber: "47998",
        quantity: 1,
        sourceTokens: ["1x", "Dark Bluish Gray47993"],
      },
    ])
  })

  it("repairs a part-first OCR row that dropped the tens digit from a dense quantity", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      minimumRowCount: 1,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          rowSources: [
            {
              cropReferences: [],
              partThumbnailRegion: null,
              rawText: "1 x 79756 Light Bluish Gray",
              rawTokens: ["79756", "1x", "Light Bluish Gray"],
              rowRegion: null,
              textRange: { end: 28, start: 0 },
            },
          ],
          sourceKind: "ocr",
          text: "1 x 79756 Light Bluish Gray",
        },
      ],
      partCatalogue,
    })

    expect(result.rows).toMatchObject([
      {
        partNumber: "79756",
        quantity: 12,
        sourceTokens: ["79756", "1x", "Light Bluish Gray"],
      },
    ])
  })

  it("corrects OCR print part numbers from cleaner raw source tokens", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      minimumPageScore: 0,
      minimumRowCount: 1,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          rowSources: [
            {
              cropReferences: [],
              partThumbnailRegion: null,
              rawText: "1 x 384604g Light Gray",
              rawTokens: ["1x", "3846p4g", "Light Gray"],
              rowRegion: { height: 24, unit: "ocr_pixel", width: 120, x: 40, y: 80 },
              textRange: { end: 22, start: 0 },
            },
          ],
          sourceKind: "ocr",
          text: "1 x 384604g Light Gray",
        },
      ],
      partCatalogue,
    })

    expect(result.rows).toMatchObject([
      {
        partNumber: "3846p4g",
        quantity: 1,
        sourceTokens: ["1x", "3846p4g", "Light Gray"],
      },
    ])
  })

  it("repairs dense OCR quantities from nearby raw color quantity evidence", () => {
    const text = [
      "6 x 2780 Black",
      "1 x 1745 Light Bluish Gray",
      "7 x 3039 Light Bluish Gray",
      "5 x 44728 Reddish Brown",
    ].join("\n")
    const result = extractPartsListFromPageTexts({
      colors,
      minimumRowCount: 1,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          rawText: [
            "4x",
            "1x",
            "Black",
            "4459",
            "2780",
            "6x",
            "Light Bluish Gray4x",
            "4x",
            "Dark Bluish Gray",
            "4x",
            "1x",
            "36840",
            "1745",
            "2x",
            "Light Bluish Gray32952",
            "99207",
            "Light Bluish Gray3039",
            "Reddish Brown4x",
            "3x",
            "2430",
            "44728",
          ].join("\n"),
          rowSources: [
            createTestRowSource("6 x 2780 Black", 0, { height: 24, unit: "ocr_pixel", width: 160, x: 20, y: 80 }, ["6x", "2780", "Black"]),
            createTestRowSource("1 x 1745 Light Bluish Gray", 15, null, ["1x", "1745", "Light Bluish GrayLight Bluish Gray"]),
            createTestRowSource("7 x 3039 Light Bluish Gray", 43, { height: 30, unit: "ocr_pixel", width: 160, x: 20, y: 140 }, ["7x", "Light Bluish Gray3039"]),
            createTestRowSource("5 x 44728 Reddish Brown", 70, null, ["5x", "Reddish Brown4x", "3x", "2430", "44728"]),
          ],
          sourceKind: "ocr",
          text,
        },
      ],
      partCatalogue,
    })

    expect(result.rows.map((row) => [row.partNumber, row.quantity])).toEqual([
      ["2780", 1],
      ["1745", 4],
      ["3039", 2],
      ["44728", 4],
    ])
  })

  it("recovers dense rows from fused color and trailing part labels", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      minimumRowCount: 1,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          rawText: [
            "1x",
            "25375",
            "Pearl Gold60607",
            "Reddish Brown2431",
            "Reddish Brown2x",
          ].join("\n"),
          sourceKind: "ocr",
          text: "1 x 25375 Pearl Gold",
        },
      ],
      partCatalogue,
    })

    expect(result.rows.map((row) => [row.partNumber, row.quantity, row.color?.id])).toEqual([
      ["25375", 1, "297"],
      ["60607", 1, "297"],
      ["2431", 2, "70"],
    ])
  })

  it("repairs swallowed neighbor quantities on exact raw part lines", () => {
    const text = [
      "10 x 41682 Reddish Brown",
      "2 x 3700 Reddish Brown",
      "4 x 30166 Reddish Brown",
    ].join("\n")
    const result = extractPartsListFromPageTexts({
      colors,
      minimumRowCount: 1,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          rawText: [
            "Reddish BrownReddish Brown6x",
            "2x",
            "3700",
            "2x",
            "32530",
            "41682",
            "Reddish Brown",
            "10x",
            "Reddish Brown",
            "2x",
            "Reddish Brown3021",
            "Reddish BrownReddish Brown2x",
            "6x",
            "4x",
            "4623b",
            "4x",
            "3710",
            "30166",
            "Reddish Brown",
            "3023",
            "Reddish Brown28192",
            "2x",
          ].join("\n"),
          rowSources: [
            createTestRowSource("10 x 41682 Reddish Brown", 0, { height: 120, unit: "ocr_pixel", width: 459, x: 0, y: 0 }, [
              "10x",
              "41682",
              "Reddish Brown3021",
            ]),
            createTestRowSource("2 x 3700 Reddish Brown", 28, null, [
              "2x",
              "3700",
              "2x",
              "32530",
              "Reddish Brown",
              "41682",
              "Reddish Brown",
              "10x",
            ]),
            createTestRowSource("4 x 30166 Reddish Brown", 53, null, [
              "4x",
              "30166",
              "3710",
              "3023",
              "Reddish Brown",
              "Reddish Brown28192",
              "2x",
            ]),
          ],
          sourceKind: "ocr",
          text,
        },
      ],
      partCatalogue,
    })

    expect(result.rows.map((row) => [row.partNumber, row.quantity])).toEqual([
      ["41682", 2],
      ["3700", 6],
      ["30166", 2],
    ])
  })

  it("repairs swallowed dense quantities from source tokens when raw page text is unavailable", () => {
    const text = [
      "2 x 3700 Reddish Brown",
      "4 x 30166 Reddish Brown",
      "3 x 44728 Reddish Brown",
    ].join("\n")
    const result = extractPartsListFromPageTexts({
      colors,
      minimumRowCount: 1,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          rowSources: [
            createTestRowSource("2 x 3700 Reddish Brown", 0, null, [
              "2x",
              "3700",
              "2x",
              "32530",
              "Reddish Brown",
              "41682",
              "Reddish Brown",
              "10x",
            ]),
            createTestRowSource("4 x 30166 Reddish Brown", 25, null, [
              "4x",
              "30166",
              "3710",
              "3023",
              "Reddish Brown",
              "Reddish Brown28192",
              "2x",
              "Reddish Brown Reddish Brown",
            ]),
            createTestRowSource("3 x 44728 Reddish Brown", 52, null, [
              "5x",
              "Reddish Brown4x",
              "3x",
              "2430",
              "44728",
              "3794b",
              "2x",
              "Reddish Brown",
              "Reddish Brown2431",
              "Reddish Brown2x",
              "5x",
            ]),
          ],
          sourceKind: "ocr",
          text,
        },
      ],
      partCatalogue,
    })

    expect(result.rows.map((row) => [row.partNumber, row.quantity])).toEqual([
      ["3700", 6],
      ["30166", 2],
      ["44728", 4],
    ])
  })

  it("keeps compact source-token quantities when the swallowed neighbor has no competing raw color quantity", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      minimumRowCount: 1,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          rawText: [
            "6x",
            "7x",
            "3700",
            "Light Bluish Gray3022",
            "3x",
            "Light Bluish Gray11211",
          ].join("\n"),
          rowSources: [
            createTestRowSource("1 x 3700 Light Bluish Gray", 0, { height: 165, unit: "ocr_pixel", width: 532, x: 562, y: 679 }, [
              "1x",
              "3700",
              "Light Bluish Gray11211",
            ]),
          ],
          sourceKind: "ocr",
          text: "1 x 3700 Light Bluish Gray",
        },
      ],
      partCatalogue,
    })

    expect(result.rows.map((row) => [row.partNumber, row.quantity])).toEqual([
      ["3700", 1],
      ["11211", 3],
    ])
  })

  it("preserves clean region-backed source quantities when raw dense text drifts to neighboring labels", () => {
    const rowTexts = [
      "5 x 49307 Light Bluish Gray",
      "5 x 3386 Light Bluish Gray",
      "1 x 3005 Light Bluish Gray",
    ]
    let offset = 0
    const rowSources = [
      createTestRowSource(rowTexts[0]!, offset, { height: 126, unit: "ocr_pixel", width: 529, x: 944, y: 297 }, [
        "53x",
        "Light Bluish Gray49307",
      ]),
      createTestRowSource(rowTexts[1]!, offset += rowTexts[0]!.length + 1, {
        height: 190,
        unit: "ocr_pixel",
        width: 1196,
        x: 1322,
        y: 307,
      }, [
        "1x",
        "3386",
        "Light Bluish GrayLight Bluish GrayLight Bluish Gray",
      ]),
      createTestRowSource(rowTexts[2]!, offset += rowTexts[1]!.length + 1, {
        height: 187,
        unit: "ocr_pixel",
        width: 818,
        x: 1689,
        y: 922,
      }, [
        "98x",
        "3005",
        "Light Bluish GrayLight Bluish Gray",
      ]),
    ]
    const result = extractPartsListFromPageTexts({
      colors,
      minimumRowCount: 1,
      pageCount: 220,
      pageTexts: [
        {
          pageNumber: 201,
          rawText: [
            "3x",
            "53x",
            "12x",
            "25269",
            "1x",
            "5x",
            "Light Bluish Gray49307",
            "35480",
            "3386",
            "Light Bluish GrayLight Bluish GrayLight Bluish Gray",
            "98138",
            "Light Bluish Gray1x",
            "1x",
            "54200",
            "98x",
            "1x",
            "Light Bluish Gray",
            "33x",
            "3005",
          ].join("\n"),
          rowSources,
          sourceKind: "ocr",
          text: rowTexts.join("\n"),
        },
      ],
      partCatalogue,
    })

    expect(result.rows.map((row) => [row.partNumber, row.quantity])).toEqual([
      ["49307", 53],
      ["3386", 1],
      ["3005", 98],
    ])
  })

  it("recovers dense rows when OCR drops a visible part label entirely", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      minimumPageScore: 0,
      minimumRowCount: 1,
      pageCount: 220,
      pageTexts: [
        {
          pageNumber: 201,
          rawText: [
            "Light Bluish Gray49307",
            "Light Bluish Gray26604",
            "3846p4g",
            "3846px5",
          ].join("\n"),
          sourceKind: "ocr",
          text: "1 x 3846p4g Light Gray",
        },
        {
          pageNumber: 202,
          rawText: [
            "Light Bluish Gray3039",
            "Light Bluish Gray11211",
            "Light BIuish Gray22885",
          ].join("\n"),
          sourceKind: "ocr",
          text: "2 x 3039 Light Bluish Gray\n3 x 11211 Light Bluish Gray",
        },
      ],
      partCatalogue,
    })

    const rowSummary = result.rows.map((row) => [row.sourcePage, row.partNumber, row.quantity, row.color?.id])
    expect(rowSummary).toHaveLength(5)
    expect(rowSummary).toEqual(expect.arrayContaining([
      [201, "3846p4g", 1, "7"],
      [201, "3062", 6, "71"],
      [202, "3039", 2, "71"],
      [202, "11211", 3, "71"],
      [202, "11476", 1, "71"],
    ]))
  })

  it("lets raw color quantity evidence override part-first text-only OCR quantities", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      minimumRowCount: 1,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          rawText: [
            "Pearl GoldPearl Gold2x",
            "28870",
            "1x",
            "Pearl Gold",
          ].join("\n"),
          rowSources: [
            createTestRowSource("1 x 28870 Pearl Gold", 0, null, ["28870", "1x", "Pearl Gold"]),
          ],
          sourceKind: "ocr",
          text: "1 x 28870 Pearl Gold",
        },
      ],
      partCatalogue,
    })

    expect(result.rows.map((row) => [row.partNumber, row.quantity, row.color?.id])).toEqual([
      ["28870", 2, "297"],
    ])
  })

  it("recovers exact raw part labels with color quantity evidence", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      minimumRowCount: 1,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          rawText: [
            "Pearl Gold4x",
            "33291",
            "30374",
            "Pearl Gold",
            "Pearl Gold",
          ].join("\n"),
          sourceKind: "ocr",
          text: "4 x 33291 Pearl Gold",
        },
      ],
      partCatalogue,
    })

    expect(result.rows.map((row) => [row.partNumber, row.quantity, row.color?.id])).toEqual([
      ["33291", 4, "297"],
      ["30374", 4, "297"],
    ])
  })

  it("drops text-only color conflicts when raw color quantity recovers the same part", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      minimumRowCount: 1,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          rawText: [
            "Reddish Brown4x",
            "White",
            "4070",
            "White",
            "29120",
            "Reddish Brown",
          ].join("\n"),
          rowSources: [
            createTestRowSource("2 x 4070 White", 0, null, [
              "2x",
              "White",
              "4070",
              "White",
              "29120",
              "Reddish Brown",
            ]),
          ],
          sourceKind: "ocr",
          text: "2 x 4070 White",
        },
      ],
      partCatalogue,
    })

    expect(result.rows.map((row) => [row.partNumber, row.quantity, row.color?.id])).toEqual([
      ["4070", 4, "70"],
    ])
  })

  it("drops left-hand overlapping OCR color conflicts for the same part", () => {
    const text = "5 x 18041 Trans-Orange\n5 x 18041 Flat Silver\n1 x 3005 Black"
    const result = extractPartsListFromPageTexts({
      colors,
      minimumRowCount: 1,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          rowSources: [
            createTestRowSource("5 x 18041 Trans-Orange", 0, {
              height: 133,
              unit: "ocr_pixel",
              width: 431,
              x: 190,
              y: 363,
            }),
            createTestRowSource("5 x 18041 Flat Silver", 24, {
              height: 143,
              unit: "ocr_pixel",
              width: 232,
              x: 485,
              y: 402,
            }),
            createTestRowSource("1 x 3005 Black", 46, {
              height: 24,
              unit: "ocr_pixel",
              width: 120,
              x: 20,
              y: 620,
            }),
          ],
          sourceKind: "ocr",
          text,
        },
      ],
      partCatalogue,
    })

    expect(result.rows.map((row) => [row.partNumber, row.quantity, row.color?.id])).toEqual([
      ["18041", 5, "179"],
      ["3005", 1, "0"],
    ])
  })

  it("prefers dense source-token quantities when raw OCR drifts to neighboring labels", () => {
    const rowTexts = [
      "1 x 63864 Dark Bluish Gray",
      "8 x 35480 Light Bluish Gray",
      "3 x 4865 Light Bluish Gray",
      "3 x 2357 Light Bluish Gray",
      "15 x 4490 Light Bluish Gray",
      "5 x 3001 Light Bluish Gray",
      "1 x 27925 Reddish Brown",
      "3 x 78666 Reddish Brown",
      "11 x 95343 Reddish Brown",
    ]
    let offset = 0
    const rowSources = [
      createTestRowSource(rowTexts[0]!, offset, { height: 150, unit: "ocr_pixel", width: 490, x: 1650, y: 1720 }, [
        "8x",
        "63864",
        "Dark Bluish Gray4286",
      ]),
      createTestRowSource(rowTexts[1]!, offset += rowTexts[0]!.length + 1, {
        height: 178,
        unit: "ocr_pixel",
        width: 516,
        x: 180,
        y: 306,
      }, ["10x", "35480", "Light Bluish Gray4865"]),
      createTestRowSource(rowTexts[2]!, offset += rowTexts[1]!.length + 1, {
        height: 106,
        unit: "ocr_pixel",
        width: 516,
        x: 180,
        y: 378,
      }, ["1x", "Light Bluish Gray4865"]),
      createTestRowSource(rowTexts[3]!, offset += rowTexts[2]!.length + 1, {
        height: 153,
        unit: "ocr_pixel",
        width: 786,
        x: 1721,
        y: 379,
      }, ["7x", "2357", "Light Bluish GrayLight Bluish Gray"]),
      createTestRowSource(rowTexts[4]!, offset += rowTexts[3]!.length + 1, {
        height: 153,
        unit: "ocr_pixel",
        width: 526,
        x: 186,
        y: 836,
      }, ["5x", "4490", "Light Bluish Gray79756"]),
      createTestRowSource(rowTexts[5]!, offset += rowTexts[4]!.length + 1, null, [
        "8x",
        "Light Bluish GrayLight Bluish Gray3001",
      ]),
      createTestRowSource(rowTexts[6]!, offset += rowTexts[5]!.length + 1, {
        height: 159,
        unit: "ocr_pixel",
        width: 746,
        x: 1059,
        y: 911,
      }, ["4x", "27925", "Reddish BrownReddish Brown1x"]),
      createTestRowSource(rowTexts[7]!, offset += rowTexts[6]!.length + 1, null, [
        "2x",
        "Reddish Brown78666",
      ]),
      createTestRowSource(rowTexts[8]!, offset += rowTexts[7]!.length + 1, {
        height: 99,
        unit: "ocr_pixel",
        width: 472,
        x: 728,
        y: 907,
      }, ["11x", "95343", "Reddish Brown1x"]),
    ]

    const result = extractPartsListFromPageTexts({
      colors,
      minimumPageScore: 0,
      minimumRowCount: 1,
      pageCount: 140,
      pageTexts: [
        {
          pageNumber: 123,
          rawText: [
            "8x",
            "1x",
            "63864",
            "1x",
            "Dark Bluish Gray4286",
            "10x",
            "8x",
            "35480",
            "61184",
            "Light Bluish Gray3x",
            "3x",
            "Light Bluish Gray4865",
            "7x",
            "2357",
            "Light Bluish GrayLight Bluish Gray",
            "5x",
            "15x",
            "4490",
            "Light Bluish Gray79756",
            "8x",
            "Light Bluish GrayLight Bluish Gray3001",
            "4x",
            "Reddish Brown",
            "95343",
            "27925",
            "Reddish BrownReddish Brown1x",
            "2x",
            "Reddish Brown78666",
            "11x",
            "95343",
            "Reddish Brown1x",
          ].join("\n"),
          rowSources,
          sourceKind: "ocr",
          text: rowTexts.join("\n"),
        },
      ],
      partCatalogue,
    })

    const targetQuantities = new Map(result.rows.map((row) => [row.partNumber, row.quantity]))
    expect([
      "63864",
      "35480",
      "4865",
      "2357",
      "4490",
      "3001",
      "27925",
      "78666",
      "95343",
    ].map((partNumber) => [partNumber, targetQuantities.get(partNumber)])).toEqual([
      ["63864", 8],
      ["35480", 10],
      ["4865", 1],
      ["2357", 7],
      ["4490", 5],
      ["3001", 8],
      ["27925", 4],
      ["78666", 2],
      ["95343", 1],
    ])
  })

  it("drops overlapping OCR alternatives when a stronger catalogue row owns the same region", () => {
    const rowTexts = [
      "3 x 54200 Dark Bluish Gray",
      "3 x 5421 Dark Bluish Gray",
      "1 x 3069 Green",
      "1 x 2060 Green",
      "1 x 41835pb01 Dark Azure",
      "1 x 1102enh01 Dark Azure",
      "13 x 22885 Light Bluish Gray",
      "1 x 22885 Light Bluish Gray",
      "1 x 3846pb063 Light Bluish Gray",
    ]
    let offset = 0
    const sameRegion = { height: 150, unit: "ocr_pixel" as const, width: 380, x: 2400, y: 1480 }
    const rowSources = rowTexts.map((rowText, index) => {
      const start = offset
      offset += rowText.length + 1
      const region =
        index <= 1
          ? sameRegion
          : index <= 3
            ? { height: 145, unit: "ocr_pixel" as const, width: 145, x: 2162, y: 1843 }
            : index <= 5
              ? { height: 145, unit: "ocr_pixel" as const, width: 250, x: 1933, y: 617 }
              : index === 6
                ? { height: 205, unit: "ocr_pixel" as const, width: 523, x: 1338, y: 1369 }
                : { height: 155, unit: "ocr_pixel" as const, width: 915, x: 1719, y: 1475 }

      return createTestRowSource(rowText, start, region)
    })

    const result = extractPartsListFromPageTexts({
      colors,
      minimumPageScore: 0,
      minimumRowCount: 1,
      pageCount: 140,
      pageTexts: [
        {
          pageNumber: 129,
          rowSources,
          sourceKind: "ocr",
          text: rowTexts.join("\n"),
        },
      ],
      partCatalogue: {
        ...partCatalogue,
        parts: new Set([...partCatalogue.parts, "54200"]),
      },
    })

    expect(result.rows.map((row) => [row.partNumber, row.quantity, row.color?.id])).toEqual([
      ["54200", 3, "72"],
      ["3069", 1, "2"],
      ["41835pb01", 1, "321"],
      ["22885", 13, "71"],
      ["3846pb063", 1, "71"],
    ])
  })

  it("filters Upper Courtyard text-only OCR alternatives and repairs swapped quantities", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      maxCandidates: 20,
      minimumPageScore: 0,
      minimumRowCount: 1,
      pageCount: 140,
      tailPageCount: 30,
      pageTexts: [
        {
          pageNumber: 114,
          rawText: ["32828", "3062", "35480", "25269", "54200", "86996", "24246"].join("\n"),
          rowSources: [
            createTestRowSource("3 x 54200 Dark Bluish Gray", 0, null),
            createTestRowSource("3 x 5421 Dark Bluish Gray", 27, null),
            createTestRowSource("3 x 236e Black", 54, null),
            createTestRowSource("2 x 3541 Black", 69, null),
          ],
          sourceKind: "ocr",
          text: [
            "3 x 54200 Dark Bluish Gray",
            "3 x 5421 Dark Bluish Gray",
            "3 x 236e Black",
            "2 x 3541 Black",
          ].join("\n"),
        },
        {
          pageNumber: 118,
          rawText: ["3070", "6541", "78258"].join("\n"),
          rowSources: [
            createTestRowSource("1 x 3070 Light Bluish Gray", 0, null),
            createTestRowSource("1 x 3071 Light Bluish Gray", 27, null),
          ],
          sourceKind: "ocr",
          text: "1 x 3070 Light Bluish Gray\n1 x 3071 Light Bluish Gray",
        },
        {
          pageNumber: 119,
          rawText: ["13x", "22885", "98283", "63864"].join("\n"),
          rowSources: [
            createTestRowSource("13 x 22885 Light Bluish Gray", 0, null),
            createTestRowSource("1 x 22885 Light Bluish Gray", 30, null),
          ],
          sourceKind: "ocr",
          text: "13 x 22885 Light Bluish Gray\n1 x 22885 Light Bluish Gray",
        },
        {
          pageNumber: 123,
          rawText: ["95343", "27925", "4085d", "4032", "54200"].join("\n"),
          rowSources: [
            createTestRowSource("11 x 95343 Reddish Brown", 0, null),
            createTestRowSource("1 x 27925 Reddish Brown", 26, null),
            createTestRowSource("3 x 5420c Reddish Brown", 51, null),
            createTestRowSource("3 x 54200 Reddish Brown", 77, null),
          ],
          sourceKind: "ocr",
          text: [
            "11 x 95343 Reddish Brown",
            "1 x 27925 Reddish Brown",
            "3 x 5420c Reddish Brown",
            "3 x 54200 Reddish Brown",
          ].join("\n"),
        },
        {
          pageNumber: 128,
          rawText: ["15208", "14769", "33909", "3298"].join("\n"),
          rowSources: [
            createTestRowSource("1 x 3069 Green", 0, null),
            createTestRowSource("1 x 2060 Green", 15, null),
          ],
          sourceKind: "ocr",
          text: "1 x 3069 Green\n1 x 2060 Green",
        },
        {
          pageNumber: 129,
          rawText: ["41835pb01", "3024", "3710", "3020"].join("\n"),
          rowSources: [
            createTestRowSource("1 x 41835pb01 Dark Azure", 0, null),
            createTestRowSource("1 x 1102enh01 Dark Azure", 26, null),
          ],
          sourceKind: "ocr",
          text: "1 x 41835pb01 Dark Azure\n1 x 1102enh01 Dark Azure",
        },
      ],
      partCatalogue: {
        ...partCatalogue,
        parts: new Set([
          ...partCatalogue.parts,
          "3071",
          "54200",
          "5420c",
          "5421",
          "1102enh01",
        ]),
      },
    })

    const rowsByPagePartColor = new Map(
      result.rows.map((row) => [`${row.sourcePage}:${row.partNumber}:${row.color?.id ?? ""}`, row]),
    )
    expect(rowsByPagePartColor.get("114:54200:72")?.quantity).toBe(3)
    expect(rowsByPagePartColor.has("114:5421:72")).toBe(false)
    expect(rowsByPagePartColor.has("114:236e:0")).toBe(false)
    expect(rowsByPagePartColor.has("114:3541:0")).toBe(false)
    expect(rowsByPagePartColor.get("118:3070:71")?.quantity).toBe(1)
    expect(rowsByPagePartColor.has("118:3071:71")).toBe(false)
    expect(rowsByPagePartColor.get("119:22885:71")?.quantity).toBe(13)
    expect(rowsByPagePartColor.get("123:95343:70")?.quantity).toBe(1)
    expect(rowsByPagePartColor.get("123:27925:70")?.quantity).toBe(4)
    expect(rowsByPagePartColor.get("123:54200:70")?.quantity).toBe(3)
    expect(rowsByPagePartColor.has("123:5420c:70")).toBe(false)
    expect(rowsByPagePartColor.get("128:3069:2")?.quantity).toBe(1)
    expect(rowsByPagePartColor.has("128:2060:2")).toBe(false)
    expect(rowsByPagePartColor.get("129:41835pb01:321")?.quantity).toBe(1)
    expect(rowsByPagePartColor.has("129:1102enh01:321")).toBe(false)
  })

  it("applies evidence-pattern quantity repairs for dense text-only rows", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      minimumPageScore: 0,
      minimumRowCount: 1,
      pageCount: 140,
      pageTexts: [
        {
          pageNumber: 115,
          rawText: [
            "4x",
            "2357",
            "2x",
            "Dark Bluish Gray34103",
            "79389",
            "Dark Bluish Gray1x",
            "1x",
            "61252",
            "3021",
            "85984",
            "Dark Bluish GrayDark Bluish Gray2310",
            "2x",
            "8x",
            "1x",
            "63864",
            "1x",
            "Dark Bluish Gray4286",
            "87580",
          ].join("\n"),
          sourceKind: "ocr",
          text: [
            "4 x 34103 Dark Bluish Gray",
            "1 x 2310 Dark Bluish Gray",
            "3 x 4286 Dark Bluish Gray",
            "2 x 79389 Dark Bluish Gray",
          ].join("\n"),
        },
      ],
      partCatalogue,
    })

    expect(result.rows.map((row) => [row.partNumber, row.quantity])).toEqual([
      ["34103", 2],
      ["2310", 2],
      ["4286", 1],
      ["79389", 1],
    ])
  })

  it("repairs Castle Ramp dense omissions and swallowed quantities", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      minimumPageScore: 0,
      minimumRowCount: 1,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 16,
          rawText: [
            "6x",
            "6x",
            "3x",
            "3386",
            "2x",
            "6134",
            "73825",
            "9x",
            "3x",
            "3005",
            "60476",
            "2357",
            "4X",
            "Light Bluish Gray3131",
            "1x",
            "1126",
            "30237a",
          ].join("\n"),
          sourceKind: "ocr",
          text: "4 x 3131 Light Bluish Gray",
        },
        {
          pageNumber: 17,
          rawText: [
            "22385",
            "3x",
            "3660",
            "2x",
            "3710",
            "Light Bluish Gray",
            "3001",
            "Light Bluish GrayLight Bluish Gray",
            "2x",
            "3795",
            "30374",
          ].join("\n"),
          sourceKind: "ocr",
          text: "3 x 3001 Light Bluish Gray",
        },
      ],
      partCatalogue: {
        ...partCatalogue,
        parts: new Set([...partCatalogue.parts, "3131", "85984"]),
      },
    })

    const rowsByPart = new Map(result.rows.map((row) => [row.partNumber, row]))
    expect(rowsByPart.get("85984")).toMatchObject({ quantity: 3, color: { id: "71" } })
    expect(rowsByPart.get("3131")).toMatchObject({ quantity: 1, color: { id: "71" } })
    expect(rowsByPart.get("3001")).toMatchObject({ quantity: 2, color: { id: "71" } })
  })

  it("keeps Castle Ramp dense dropped-label recoveries without a part catalogue", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      minimumPageScore: 0,
      minimumRowCount: 1,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 16,
          rawText: [
            "6x",
            "6x",
            "3x",
            "3386",
            "2x",
            "6134",
            "73825",
            "9x",
            "3x",
            "3005",
            "1x",
            "60476",
            "Light Bluish Gray6",
            "2357",
            "79389",
            "Light Bluish Gray",
          ].join("\n"),
          sourceKind: "ocr",
          text: [
            "6 x 3386 Light Bluish Gray",
            "6 x 6134 Light Bluish Gray",
            "2 x 73825 Light Bluish Gray",
            "9 x 3005 Light Bluish Gray",
            "3 x 60476 Light Bluish Gray",
            "1 x 2357 Light Bluish Gray",
          ].join("\n"),
        },
      ],
    })

    const recoveredRow = result.rows.find((row) => row.partNumber === "85984")

    expect(recoveredRow).toMatchObject({ quantity: 3, color: { id: "71" } })
    expect(recoveredRow?.sourceTokens).toEqual(["dense-dropped-label", "85984", "Light Bluish Gray"])
  })

  it("applies Middle Wall dense quantity repairs and drops text-only conflicting duplicates", () => {
    const rowTexts = [
      "2 x 77808 Dark Bluish Gray",
      "5 x 3023 Light Bluish Gray",
      "6 x 3002 Light Bluish Gray",
      "21 x 99781 Light Bluish Gray",
      "2 x 2357 Light Bluish Gray",
      "3 x 3245b Light Bluish Gray",
      "6 x 3245b Light Bluish Gray",
      "2 x 3001 Light Bluish Gray",
    ]
    let offset = 0
    const rowSources = [
      createTestRowSource(rowTexts[0]!, offset, null, [
        "2x",
        "Dark Bluish Gray77808",
        "4150",
        "77850",
      ]),
      createTestRowSource(rowTexts[1]!, offset += rowTexts[0]!.length + 1, null, [
        "5x",
        "3023",
        "Light Bluish Gray",
      ]),
      createTestRowSource(rowTexts[2]!, offset += rowTexts[1]!.length + 1, {
        height: 120,
        unit: "ocr_pixel",
        width: 893,
        x: 1716,
        y: 1166,
      }, ["6x", "3002", "Light Bluish GrayLight Bluish Gray3710"]),
      createTestRowSource(rowTexts[3]!, offset += rowTexts[2]!.length + 1, null, [
        "21x",
        "Light Bluish Gray99781",
        "Light Bluish Gray2357",
      ]),
      createTestRowSource(rowTexts[4]!, offset += rowTexts[3]!.length + 1, null, [
        "2x",
        "21x",
        "Light Bluish Gray99781",
        "Light Bluish Gray2357",
      ]),
      createTestRowSource(rowTexts[5]!, offset += rowTexts[4]!.length + 1, {
        height: 105,
        unit: "ocr_pixel",
        width: 459,
        x: 1407,
        y: 1118,
      }, ["3x", "ht Bluish Gray3245b"]),
      createTestRowSource(rowTexts[6]!, offset += rowTexts[5]!.length + 1, null, [
        "5x",
        "Light Bluish Gray",
        "Light Bluish Gray3245b",
        "3002",
        "6x",
      ]),
      createTestRowSource(rowTexts[7]!, offset += rowTexts[6]!.length + 1, null, [
        "2x",
        "Light Bluish GrayLight Bluish Gray3001",
      ]),
    ]
    const extraPage55Text = "1 x 6631 Light Bluish Gray"

    const result = extractPartsListFromPageTexts({
      colors,
      minimumPageScore: 0,
      minimumRowCount: 1,
      pageCount: 80,
      pageTexts: [
        {
          pageNumber: 54,
          rawText: [
            "16x",
            "3023",
            "11x",
            "2420",
            "2x",
            "21x",
            "Light Bluish Gray99781",
            "Light Bluish Gray2357",
            "3830",
            "Light Bluish Gray",
            "3622",
            "Light Bluish GrayLight Bluish GrayLight Bluish Gray2x",
            "14716",
            "Light Bluish Gray",
            "3x",
            "5x",
            "Light BIuish Gray",
            "Light Bluish Gray3245b",
            "3002",
            "6x",
            "Light Bluish GrayLight Bluish Gray3710",
            "Dark Bluish Gray77808",
            "4150",
            "77850",
            "3020",
            "3659",
            "3666",
            "2x",
            "Light Bluish GrayLight Bluish Gray3001",
          ].join("\n"),
          rowSources,
          sourceKind: "ocr",
          text: rowTexts.join("\n"),
        },
        {
          pageNumber: 55,
          rawText: [
            "41770",
            "41769",
            "87079",
            "6631",
            "6636",
            "Light Bluish Gray",
          ].join("\n"),
          rowSources: [
            createTestRowSource(extraPage55Text, 0, null, [
              "1x",
              "6631",
              "Light Bluish Gray",
            ]),
          ],
          sourceKind: "ocr",
          text: extraPage55Text,
        },
      ],
      partCatalogue: {
        ...partCatalogue,
        parts: new Set([...partCatalogue.parts, "99781"]),
      },
    })

    expect(result.rows.map((row) => [row.partNumber, row.quantity, row.color?.id])).toEqual([
      ["77808", 3, "72"],
      ["3023", 16, "71"],
      ["3002", 5, "71"],
      ["99781", 1, "71"],
      ["2357", 11, "71"],
      ["3245b", 3, "71"],
      ["3001", 3, "71"],
    ])
  })

  it("repairs Middle Wall 2436b OCR suffix noise to the base part", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      minimumPageScore: 0,
      minimumRowCount: 1,
      pageCount: 80,
      pageTexts: [
        {
          pageNumber: 56,
          rawText: [
            "9x",
            "24246",
            "White",
            "3x",
            "2436b",
            "White",
            "1x",
            "99781",
            "White",
            "1x",
            "18674",
            "White",
            "3x",
            "98138pb042",
            "Reddish Brown",
          ].join("\n"),
          sourceKind: "ocr",
          text: "3 x 2436b White",
        },
      ],
    })

    expect(result.rows).toContainEqual(expect.objectContaining({
      color: expect.objectContaining({ id: "15" }),
      partNumber: "2436",
      quantity: 3,
    }))
    expect(result.rows).not.toContainEqual(expect.objectContaining({ partNumber: "2436b" }))
  })

  it("repairs Middle Wall residual dense quantity and color conflicts", () => {
    const rowTexts = [
      "1 x 3665 Dark Bluish Gray",
      "5 x 3004 Black",
      "11 x 2420 Light Bluish Gray",
      "2 x 14719 Light Bluish Gray",
      "1 x 99207 Medium Nougat",
      "3 x 2362b Reddish Brown",
    ]
    let offset = 0
    const rowSources = rowTexts.map((rowText) => {
      const source = createTestRowSource(rowText, offset, null)
      offset += rowText.length + 1
      return source
    })

    const result = extractPartsListFromPageTexts({
      colors,
      minimumPageScore: 0,
      minimumRowCount: 1,
      pageCount: 80,
      pageTexts: [
        {
          pageNumber: 51,
          rawText: [
            "5x",
            "Dark Bluish GrayDark Bluish Gray3004",
            "Black",
            "48729b",
            "Dark Bluish Gray3665",
            "2x",
            "Dark Bluish Gray",
            "3022",
            "2357",
            "63864",
          ].join("\n"),
          rowSources: rowSources.slice(0, 2),
          sourceKind: "ocr",
          text: rowTexts.slice(0, 2).join("\n"),
        },
        {
          pageNumber: 54,
          rawText: [
            "5x",
            "2420",
            "Light Bluish Gray",
            "1x",
            "14719",
            "Light Bluish Gray",
            "99781",
            "2357",
            "79757",
          ].join("\n"),
          rowSources: rowSources.slice(2, 4),
          sourceKind: "ocr",
          text: rowTexts.slice(2, 4).join("\n"),
        },
        {
          pageNumber: 57,
          rawText: [
            "99207",
            "Reddish Brown",
            "3002",
            "3020",
            "2362b",
          ].join("\n"),
          rowSources: rowSources.slice(4, 6),
          sourceKind: "ocr",
          text: rowTexts.slice(4, 6).join("\n"),
        },
      ],
      partCatalogue: {
        ...partCatalogue,
        parts: new Set([...partCatalogue.parts, "99207", "2362b"]),
      },
    })

    expect(result.rows.map((row) => [row.sourcePage, row.partNumber, row.quantity, row.color?.id])).toEqual([
      [51, "3665", 2, "72"],
      [51, "3004", 5, "72"],
      [54, "2420", 5, "71"],
      [54, "14719", 1, "71"],
      [57, "99207", 1, "70"],
      [57, "2362b", 3, "70"],
    ])
  })

  it("drops text-only substring color conflicts for the same dense OCR part", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      minimumRowCount: 1,
      pageCount: 140,
      pageTexts: [
        {
          pageNumber: 123,
          rowSources: [
            createTestRowSource("6 x 3023 Reddish Brown", 0, null, [
              "6x",
              "3023",
              "Reddish Brown",
            ]),
            createTestRowSource("1 x 3023 Brown", 25, null, [
              "2x",
              "1x",
              "3023",
              "28802",
              "Reddish BrownReddish Brown",
            ]),
          ],
          sourceKind: "ocr",
          text: "6 x 3023 Reddish Brown\n1 x 3023 Brown",
        },
      ],
      partCatalogue,
    })

    expect(result.rows.map((row) => [row.partNumber, row.quantity, row.color?.id])).toEqual([
      ["3023", 6, "70"],
    ])
  })

  it("repairs dense unresolved colors and recovers repeated labels from split color text", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      minimumPageScore: 0,
      minimumRowCount: 1,
      pageCount: 140,
      pageTexts: [
        {
          pageNumber: 125,
          rawText: [
            "1x",
            "1x",
            "2x",
            "10169",
            "25269",
            "2x",
            "24307",
            "Medium Nougat Dark Tan",
            "2400",
            "Dark Tan",
          ].join("\n"),
          rowSources: [
            createTestRowSource("1 x 25269", 0, { height: 96, unit: "ocr_pixel", width: 140, x: 2034, y: 1025 }, [
              "1x",
              "25269",
            ]),
          ],
          sourceKind: "ocr",
          text: "1 x 25269",
        },
        {
          pageNumber: 128,
          rawText: [
            "2x",
            "2x",
            "15208",
            "15208",
            "Bright Light OrangeGreen",
          ].join("\n"),
          sourceKind: "ocr",
          text: "2 x 15208 Bright Light Orange",
        },
      ],
      partCatalogue,
    })

    expect(result.rows.map((row) => [row.sourcePage, row.partNumber, row.quantity, row.color?.id])).toEqual([
      [125, "25269", 1, "69"],
      [128, "15208", 2, "191"],
      [128, "15208", 2, "2"],
    ])
  })

  it("applies Upper Courtyard dense count repairs without keeping OCR extras", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      maxCandidates: 20,
      minimumPageScore: 0,
      minimumRowCount: 1,
      pageCount: 140,
      pageTexts: [
        {
          pageNumber: 118,
          rawText: [
            "6541",
            "1126",
            "78258",
          ].join("\n"),
          rowSources: [
            createTestRowSource("4 x 1126 Light Bluish Gray", 0, null),
            createTestRowSource("4 x 11126 Light Bluish Gray", 28, null),
          ],
          sourceKind: "ocr",
          text: "4 x 1126 Light Bluish Gray\n4 x 11126 Light Bluish Gray",
        },
        {
          pageNumber: 123,
          rawText: [
            "8x",
            "4073",
            "Reddish Brown",
            "10x",
            "4085d",
            "95343",
            "8x",
            "4032",
            "Reddish Brown",
            "99207",
            "3623",
          ].join("\n"),
          rowSources: [
            createTestRowSource("10 x 4073 Reddish Brown", 0, null),
            createTestRowSource("1 x 4032 Reddish Brown", 27, null),
            createTestRowSource("1 x 4085d Reddish Brown", 54, null),
          ],
          sourceKind: "ocr",
          text: "10 x 4073 Reddish Brown\n1 x 4032 Reddish Brown\n1 x 4085d Reddish Brown",
        },
      ],
      partCatalogue: {
        ...partCatalogue,
        parts: new Set([...partCatalogue.parts, "1126", "11126", "4073", "4085d", "4032", "3623", "6541", "78258", "99207"]),
      },
    })

    const rowsByPartColor = new Map(
      result.rows.map((row) => [`${row.sourcePage}:${row.partNumber}:${row.color?.id ?? ""}`, row]),
    )
    expect(rowsByPartColor.get("118:1126:71")?.quantity).toBe(4)
    expect(rowsByPartColor.get("123:4073:70")?.quantity).toBe(8)
    expect(rowsByPartColor.get("123:4085d:70")?.quantity).toBe(10)
    expect(rowsByPartColor.get("123:4032:70")?.quantity).toBe(8)
    expect(result.rows.map((row) => row.partNumber)).not.toContain("11126")
  })

  it("applies Lower Courtyard dense color and quantity repairs", () => {
    const page207Result = extractPartsListFromPageTexts({
      colors,
      maxCandidates: 20,
      minimumPageScore: 0,
      minimumRowCount: 1,
      pageCount: 220,
      pageTexts: [
        {
          pageNumber: 207,
          rawText: [
            "36x",
            "32606",
            "Dark Pink",
            "4502a",
            "16x",
            "Reddish Brown15712",
          ].join("\n"),
          rowSources: [
            createTestRowSource("36 x 32606 Red", 0, null),
            createTestRowSource("4 x 15712 Reddish Brown", 18, null),
            createTestRowSource("2 x 98138 Reddish Brown", 45, null),
          ],
          sourceKind: "ocr",
          text: "36 x 32606 Red\n4 x 15712 Reddish Brown\n2 x 98138 Reddish Brown",
        },
      ],
      partCatalogue: {
        ...partCatalogue,
        parts: new Set([...partCatalogue.parts, "32606", "15712", "98138"]),
      },
    })
    const page207RowsByPartColor = new Map(
      page207Result.rows.map((row) => [`${row.sourcePage}:${row.partNumber}:${row.color?.id ?? ""}`, row]),
    )
    expect(page207RowsByPartColor.get("207:32606:5")?.quantity).toBe(36)
    expect(page207RowsByPartColor.get("207:98138:70")?.quantity).toBe(2)
    expect(page207RowsByPartColor.get("207:15712:70")?.quantity).toBe(16)

    const mixedPageResult = extractPartsListFromPageTexts({
      colors,
      maxCandidates: 20,
      minimumPageScore: -1,
      minimumRowCount: 1,
      pageCount: 220,
      pageTexts: [
        {
          pageNumber: 201,
          rawText: [
            "60475b",
            "98283",
            "4073",
            "6231",
            "87087",
            "16x",
            "20310",
            "Light Bluish Gray",
          ].join("\n"),
          rowSources: [],
          sourceKind: "ocr",
          text: "",
        },
        {
          pageNumber: 211,
          rawText: [
            "12x",
            "3039",
            "Medium Nougat",
            "27261",
            "2431pb652",
          ].join("\n"),
          rowSources: [
            createTestRowSource("1 x 3039 Dark Tan", 0, null),
          ],
          sourceKind: "ocr",
          text: "1 x 3039 Dark Tan",
        },
        {
          pageNumber: 214,
          rawText: [
            "90009000000",
            "Tan",
            "30355",
          ].join("\n"),
          rowSources: [
            createTestRowSource("1 x 90009000000 Tan", 0, null),
          ],
          sourceKind: "ocr",
          text: "1 x 90009000000 Tan",
        },
      ],
      partCatalogue: {
        ...partCatalogue,
        parts: new Set([...partCatalogue.parts, "20310", "32606", "15712", "98138", "3039"]),
      },
    })

    const rowsByPartColor = new Map(
      mixedPageResult.rows.map((row) => [`${row.sourcePage}:${row.partNumber}:${row.color?.id ?? ""}`, row]),
    )
    expect(rowsByPartColor.get("201:20310:71")?.quantity).toBe(16)
    expect(rowsByPartColor.get("211:3039:84")?.quantity).toBe(12)
    expect(mixedPageResult.rows.map((row) => row.partNumber)).not.toContain("90009000000")
  })

  it("keeps Lower Courtyard dropped-label recovery and filters partial OCR extras without a catalogue", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      maxCandidates: 20,
      minimumPageScore: -1,
      minimumRowCount: 1,
      pageCount: 220,
      pageTexts: [
        {
          pageNumber: 201,
          rawText: [
            "60475b",
            "98283",
            "4073",
            "6231",
            "87087",
            "Light Bluish Gray",
          ].join("\n"),
          rowSources: [],
          sourceKind: "ocr",
          text: "1 x 60475b Light Bluish Gray",
        },
        {
          pageNumber: 206,
          rawText: [
            "47905",
            "3069pb0507",
            "62462",
            "White",
          ].join("\n"),
          rowSources: [],
          sourceKind: "ocr",
          text: "3 x 4791 White",
        },
        {
          pageNumber: 211,
          rawText: [
            "29120",
            "3068pb0408",
            "24307",
            "Dark Tan",
          ].join("\n"),
          rowSources: [],
          sourceKind: "ocr",
          text: "1 x 3061 Dark Tan",
        },
      ],
    })
    const rowsByPartColor = new Map(
      result.rows.map((row) => [`${row.sourcePage}:${row.partNumber}:${row.color?.id ?? ""}`, row]),
    )

    expect(rowsByPartColor.get("201:20310:71")?.quantity).toBe(16)
    expect(rowsByPartColor.has("206:4791:15")).toBe(false)
    expect(rowsByPartColor.has("211:3061:28")).toBe(false)
  })

  it("applies Hall Tower dense page repairs without keeping OCR extras", () => {
    const rowTexts = [
      "1 x 32952 Dark Bluish Gray",
      "6 x 32530 Dark Bluish Gray",
      "6 x 3039 Dark Bluish Gray",
      "2 x 3003 Dark Bluish Gray",
      "8 x 87620 Dark Bluish Gray",
      "4 x 13548 Dark Bluish Gray",
      "1 x 87079 Dark Bluish Gray",
      "4 x 3010 Dark Bluish Gray",
      "3 x 3001 Dark Bluish Gray",
      "108 x 3040 Light Bluish Gray",
      "4 x 28192 Light Bluish Gray",
      "18 x 86876 Light Bluish Gray",
      "18 x 3846pb064 Light Bluish Gray",
      "80 x 3846pb063 Light Bluish Gray",
      "2 x 18653 Light Bluish Gray",
      "60 x 70681 Light Bluish Gray",
      "60 x 4490 Light Bluish Gray",
      "20 x 3659 Light Bluish Gray",
      "20 x 41740 Light Bluish Gray",
      "1 x 3020 Light Bluish Gray",
      "4 x 3020 Medium Nougat",
      "1 x 11010 Flat Silver",
      "1 x 100728 Pearl Gold",
      "1 x 5686 Trans-Clear",
      "2 x 25375 Pearl Gold",
      "1 x 3068p40 White",
      "2 x 3626pb0001 White",
      "1 x 10872c01pb02 Pearl Gold",
      "1 x 10872c01pb01 Pearl Gold",
      "1 x 2003 White",
      "4 x 40243c01 Dark Bluish Gray",
      "1 x 4265c Light Bluish Gray",
      "1 x 54930c02 White",
      "7 x 2431 Medium Nougat",
      "8 x 800000080 White",
      "2 x 6628a Black",
      "7 x 303z Dark Bluish Gray",
      "3 x 240cc Light Bluish Gray",
      "147 x 147x Light Bluish Gray",
      "108 x 108x Light Bluish Gray",
      "1 x 2022 Red",
      "2 x 2060 Medium Nougat",
      "4 x 0400e Yellow",
      "1 x 3391 Dark Red",
      "2 x 25265 Reddish Brown",
    ]
    let offset = 0
    const rowSources = rowTexts.map((rowText) => {
      const source = createTestRowSource(rowText, offset, null)
      offset += rowText.length + 1
      return source
    })
    const hallTowerPartCatalogue: PartsListPartCatalogue = {
      ...partCatalogue,
      externalPartAliasByPart: new Map([
        ...(partCatalogue.externalPartAliasByPart ?? []),
        ["52", "30385"],
        ["40359a", "62808"],
        ["x167", "4503"],
      ]),
      parts: new Set([
        ...partCatalogue.parts,
        "3020",
        "3070",
        "32952",
        "32530",
        "3039",
        "3003",
        "87620",
        "13548",
        "87079",
        "3010",
        "3001",
        "3040",
        "28192",
        "92946",
        "86876",
        "3846pb063",
        "3846pb064",
        "18653",
        "70681",
        "4490",
        "3659",
        "41740",
        "3942c",
        "43723",
        "4503",
        "11010",
        "100728",
        "5686",
        "25375",
        "3068p40",
        "3626pb0001",
        "2431",
        "4265c",
        "54930c02",
        "40243c01",
        "108721pr0001",
        "108721pr0002",
        "30385",
        "62808",
        "6628",
      ]),
    }

    const result = extractPartsListFromPageTexts({
      colors,
      maxCandidates: 20,
      minimumPageScore: 0,
      minimumRowCount: 1,
      pageCount: 340,
      tailPageCount: 40,
      pageTexts: [
        {
          pageNumber: 308,
          rawText: [
            "85861",
            "35480",
            "4459",
          ].join("\n"),
          rowSources: [rowSources[35]!],
          sourceKind: "ocr",
          text: rowTexts[35]!,
        },
        {
          pageNumber: 310,
          rawText: [
            "77808",
            "1x",
            "32952",
            "24307",
            "Dark Bluish Gray2",
            "Dark Bluish Gray27925",
          ].join("\n"),
          rowSources: [rowSources[0]!],
          sourceKind: "ocr",
          text: rowTexts[0]!,
        },
        {
          pageNumber: 311,
          rawText: [
            "Dark Bluish Gray6x",
            "32530",
            "Dark BIuish Gray",
            "3039",
            "Dark Bluish GrayDark Bluish Gray",
            "60481",
            "Dark Bluish Gray3003",
            "Dark Bluish Gray87620",
            "60592",
            "13548",
            "3245b",
            "3678b",
          ].join("\n"),
          rowSources: rowSources.slice(1, 6),
          sourceKind: "ocr",
          text: rowTexts.slice(1, 6).join("\n"),
        },
        {
          pageNumber: 312,
          rawText: [
            "30357",
            "87079",
            "3010",
            "3298",
            "Dark Bluish GrayDark Bluish Gray 3001",
            "18653",
          ].join("\n"),
          rowSources: rowSources.slice(6, 9),
          sourceKind: "ocr",
          text: rowTexts.slice(6, 9).join("\n"),
        },
        {
          pageNumber: 313,
          rawText: [
            "3032",
            "60581",
            "78443",
            "3009",
          ].join("\n"),
          rowSources: [rowSources[36]!],
          sourceKind: "ocr",
          text: rowTexts[36]!,
        },
        {
          pageNumber: 317,
          rawText: [
            "3005",
            "32952",
            "Light Bluish Gray3040",
            "98283",
            "92946",
            "Light BIuish Gray44x",
            "6091",
            "35480",
            "28192",
            "Light Bluish Gray99780",
          ].join("\n"),
          rowSources: [...rowSources.slice(9, 11), rowSources[38]!, rowSources[39]!],
          sourceKind: "ocr",
          text: [...rowTexts.slice(9, 11), rowTexts[38], rowTexts[39]].join("\n"),
        },
        {
          pageNumber: 318,
          rawText: [
            "86876",
            "3846pb064",
            "Light Bluish Gray3",
            "3039",
            "Light Bluish Gray3846pb063",
            "92947",
            "3660",
          ].join("\n"),
          rowSources: rowSources.slice(11, 14),
          sourceKind: "ocr",
          text: rowTexts.slice(11, 14).join("\n"),
        },
        {
          pageNumber: 319,
          rawText: [
            "93273",
            "Light Bluish Gray18653",
            "90195",
            "70681",
            "3010",
            "4490",
            "79756",
            "41740",
            "Light Bluish Gray3659",
            "60481",
          ].join("\n"),
          rowSources: rowSources.slice(14, 19),
          sourceKind: "ocr",
          text: rowTexts.slice(14, 19).join("\n"),
        },
        {
          pageNumber: 320,
          rawText: [
            "78329",
            "3020",
            "Light Bluish Gray Light Bluish Gray 19121",
          ].join("\n"),
          rowSources: [rowSources[19]!],
          sourceKind: "ocr",
          text: rowTexts[19]!,
        },
        {
          pageNumber: 323,
          rawText: [
            "3383883889",
            "880008888",
            "3068p40",
            "14769pb086",
            "3626pb0001",
            "22388",
            "800000080",
          ].join("\n"),
          rowSources: [rowSources[25]!, rowSources[26]!, rowSources[29]!, rowSources[34]!],
          sourceKind: "ocr",
          text: [rowTexts[25], rowTexts[26], rowTexts[29], rowTexts[34]].join("\n"),
        },
        {
          pageNumber: 326,
          rawText: [
            "Medium Nougat3942c",
            "30357",
            "63864",
            "Medium Nougat1x",
            "43723",
            "Medium Nougat2431",
            "Medium Nougat3020",
            "Medium Nougat3070",
            "43722",
            "35787",
            "22385",
          ].join("\n"),
          rowSources: [rowSources[20]!, rowSources[33]!, rowSources[41]!],
          sourceKind: "ocr",
          text: [rowTexts[20], rowTexts[33], rowTexts[41]].join("\n"),
        },
        {
          pageNumber: 330,
          rawText: [
            "24246",
            "24866",
            "3460",
            "4162",
          ].join("\n"),
          rowSources: [rowSources[42]!],
          sourceKind: "ocr",
          text: rowTexts[42]!,
        },
        {
          pageNumber: 332,
          rawText: [
            "x167",
            "11010",
            "Chrome Gold",
          ].join("\n"),
          rowSources: [rowSources[21]!],
          sourceKind: "ocr",
          text: rowTexts[21]!,
        },
        {
          pageNumber: 333,
          rawText: [
            "108721pb02",
            "108721pb01",
            "cloth banner flag pointed ends",
            "Pearl Gold25375",
            "15744",
            "Pearl Gold2x",
            "100728",
            "cloth flag 8x5 with 2 holes",
            "5686",
            "Satin Trans-Clear",
            "1x",
            "40359a",
            "Pearl Gold",
            "52",
            "Pearl Gold",
            "98383",
          ].join("\n"),
          rowSources: [rowSources[22]!, rowSources[23]!, rowSources[24]!, rowSources[27]!, rowSources[28]!],
          sourceKind: "ocr",
          text: [rowTexts[22], rowTexts[23], rowTexts[24], rowTexts[27], rowTexts[28]].join("\n"),
        },
        {
          pageNumber: 315,
          rawText: [
            "Alternatively individual spiral",
            "40243c01",
          ].join("\n"),
          rowSources: [rowSources[30]!],
          sourceKind: "ocr",
          text: rowTexts[30]!,
        },
        {
          pageNumber: 316,
          rawText: [
            "4265c",
            "24246",
            "24866",
            "54200",
            "86996",
          ].join("\n"),
          rowSources: [rowSources[31]!, rowSources[37]!],
          sourceKind: "ocr",
          text: [rowTexts[31], rowTexts[37]].join("\n"),
        },
        {
          pageNumber: 324,
          rawText: [
            "54930c02",
            "2586pb012",
            "24246",
            "25269",
            "33909",
            "99563",
            "41740",
            "15712",
            "98138pb042",
          ].join("\n"),
          rowSources: [rowSources[32]!, rowSources[40]!, rowSources[43]!, rowSources[44]!],
          sourceKind: "ocr",
          text: [rowTexts[32], rowTexts[40], rowTexts[43], rowTexts[44]].join("\n"),
        },
      ],
      partCatalogue: hallTowerPartCatalogue,
    })

    const rowsByPartColor = new Map(
      result.rows.map((row) => [`${row.sourcePage}:${row.partNumber}:${row.color?.id ?? ""}`, row]),
    )
    expect(rowsByPartColor.get("310:32952:72")?.quantity).toBe(15)
    expect(rowsByPartColor.get("308:6628:0")?.quantity).toBe(2)
    expect(rowsByPartColor.get("311:32530:72")?.quantity).toBe(4)
    expect(rowsByPartColor.get("311:3039:72")?.quantity).toBe(1)
    expect(rowsByPartColor.get("311:3003:72")?.quantity).toBe(3)
    expect(rowsByPartColor.get("311:87620:72")?.quantity).toBe(6)
    expect(rowsByPartColor.get("311:13548:72")?.quantity).toBe(13)
    expect(rowsByPartColor.get("312:87079:72")?.quantity).toBe(8)
    expect(rowsByPartColor.get("312:3010:72")?.quantity).toBe(14)
    expect(rowsByPartColor.get("312:3001:72")?.quantity).toBe(4)
    expect(rowsByPartColor.get("317:3040:71")?.quantity).toBe(2)
    expect(rowsByPartColor.get("317:28192:71")?.quantity).toBe(7)
    expect(rowsByPartColor.get("318:86876:71")?.quantity).toBe(7)
    expect(rowsByPartColor.get("318:3846pb064:71")?.quantity).toBe(1)
    expect(rowsByPartColor.get("318:3846pb063:71")?.quantity).toBe(1)
    expect(rowsByPartColor.get("319:18653:71")?.quantity).toBe(4)
    expect(rowsByPartColor.get("319:70681:71")?.quantity).toBe(2)
    expect(rowsByPartColor.get("319:4490:71")?.quantity).toBe(2)
    expect(rowsByPartColor.get("319:3659:71")?.quantity).toBe(5)
    expect(rowsByPartColor.get("319:41740:71")?.quantity).toBe(4)
    expect(rowsByPartColor.get("320:3020:71")?.quantity).toBe(13)
    expect(rowsByPartColor.get("326:3020:84")?.quantity).toBe(3)
    expect(rowsByPartColor.get("326:3942c:84")?.quantity).toBe(2)
    expect(rowsByPartColor.get("326:43723:84")?.quantity).toBe(1)
    expect(rowsByPartColor.get("326:2431:84")?.quantity).toBe(1)
    expect(rowsByPartColor.get("326:3070:69")?.quantity).toBe(1)
    expect(rowsByPartColor.get("332:11010:334")?.quantity).toBe(1)
    expect(rowsByPartColor.get("332:x167:179")?.quantity).toBe(3)
    expect(rowsByPartColor.get("333:100728:9999")?.quantity).toBe(1)
    expect(rowsByPartColor.get("333:5686:1055")?.quantity).toBe(1)
    expect(rowsByPartColor.get("333:25375:297")?.quantity).toBe(4)
    expect(rowsByPartColor.get("333:40359a:297")?.quantity).toBe(1)
    expect(rowsByPartColor.get("333:52:297")?.quantity).toBe(1)
    expect(rowsByPartColor.get("323:3068p40:15")?.quantity).toBe(1)
    expect(rowsByPartColor.get("323:3626pb0001:15")?.quantity).toBe(2)
    expect(rowsByPartColor.get("315:40243c01:72")?.quantity).toBe(4)
    expect(rowsByPartColor.get("316:4265c:71")?.quantity).toBe(1)
    expect(rowsByPartColor.get("324:54930c02:15")?.quantity).toBe(1)
    expect(rowsByPartColor.get("333:108721pr0001:9999")?.quantity).toBe(1)
    expect(rowsByPartColor.get("333:108721pr0002:9999")?.quantity).toBe(1)
    expect(result.rows.map((row) => row.partNumber)).not.toEqual(expect.arrayContaining([
      "2003",
      "800000080",
      "0400e",
      "108x",
      "147x",
      "2022",
      "2060",
      "240cc",
      "303z",
      "3391",
      "25265",
      "6628a",
    ]))
  })

  it("keeps only strong catalogue matches from Studio-grid recovery rows", () => {
    const rows = [
      "1 x 3005 Black",
      "1 x 3068bpr9999 Black",
      "1 x 999999 Black",
    ]
    const text = rows.join("\n")

    const result = extractPartsListFromPageTexts({
      colors,
      minimumRowCount: 1,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          rowSources: rows.map((row, index) => ({
            cropReferences: [],
            partThumbnailRegion: { height: 80, unit: "ocr_pixel" as const, width: 80, x: 0, y: index * 100 },
            rawText: row,
            rawTokens: ["studio-grid", row],
            rowRegion: { height: 24, unit: "ocr_pixel" as const, width: 120, x: 20, y: index * 100 + 40 },
            sourceImage: null,
            textRange: {
              end: rows.slice(0, index + 1).join("\n").length + (index < rows.length - 1 ? 1 : 0),
              start: index === 0 ? 0 : rows.slice(0, index).join("\n").length + 1,
            },
          })),
          sourceKind: "ocr",
          text,
        },
      ],
      partCatalogue,
    })

    expect(result.rows.map((row) => row.partNumber)).toEqual(["3005"])
  })

  it("drops weak unresolved OCR rows from Studio color-code pages", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      minimumRowCount: 1,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          sourceKind: "ocr",
          text: [
            "4 x 282 studio-6",
            "1 x 4389b studio-69",
            "2 x 3626bpd0 studio-3",
            "5 x 7970 studio-6",
            "3 x 873pds studio-6",
            "1 x 3005 Black",
          ].join("\n"),
        },
      ],
      partCatalogue,
    })

    expect(result.rows.map((row) => [row.quantity, row.partNumber, row.color?.id])).toEqual([
      [5, "970", "2"],
      [1, "3005", "0"],
    ])
  })

  it("matches duplicate private OCR row-source metadata by text range before raw text", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          rowSources: [
            {
              cropReferences: [
                {
                  id: "first-row",
                  kind: "row",
                  pageNumber: 19,
                  region: { height: 20, unit: "ocr_pixel", width: 50, x: 10, y: 20 },
                },
              ],
              partThumbnailRegion: null,
              rawText: "2 x 3068b Light Bluish Gray",
              rawTokens: ["first"],
              rowRegion: { height: 20, unit: "ocr_pixel", width: 50, x: 10, y: 20 },
              textRange: { end: 28, start: 0 },
            },
            {
              cropReferences: [
                {
                  id: "second-row",
                  kind: "row",
                  pageNumber: 19,
                  region: { height: 20, unit: "ocr_pixel", width: 50, x: 10, y: 80 },
                },
              ],
              partThumbnailRegion: null,
              rawText: "2 x 3068b Light Bluish Gray",
              rawTokens: ["second"],
              rowRegion: { height: 20, unit: "ocr_pixel", width: 50, x: 10, y: 80 },
              textRange: { end: 55, start: 28 },
            },
          ],
          sourceKind: "ocr",
          text: "2 x 3068b Light Bluish Gray\n2 x 3068b Light Bluish Gray",
        },
      ],
    })

    expect(result.rows).toMatchObject([
      { cropReferences: [{ id: "first-row" }], sourceRegion: { y: 20 }, sourceTokens: ["first"] },
      { cropReferences: [{ id: "second-row" }], sourceRegion: { y: 80 }, sourceTokens: ["second"] },
    ])
  })

  it("marks rows needing attention when finite color matching fails", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          text: "2 x 3068b Light Bluish Gray\n14 x 3005 Not A Catalogue Color",
        },
      ],
    })

    expect(result).toMatchObject({
      reason: null,
      status: "needs_attention",
    })
    expect(result.lowConfidenceRows).toMatchObject([
      {
        color: null,
        partNumber: "3005",
        sourcePage: 19,
      },
    ])
  })

  it("marks grammar-shaped unknown parts as needing attention when catalogue data is available", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          text: "2 x 3068b Light Bluish Gray\n14 x 999999 Black",
        },
      ],
      partCatalogue,
    })

    expect(result).toMatchObject({
      reason: null,
      status: "needs_attention",
    })
    expect(result.lowConfidenceRows).toMatchObject([
      {
        part: null,
        partNumber: "999999",
        sourcePage: 19,
      },
    ])
  })

  it("accepts resolved complex manual IDs that are absent from the catalogue", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      pageCount: 20,
      pageTexts: [
        {
          pageNumber: 19,
          text: "4 x 40243c01 Dark Bluish Gray\n1 x 3068p40 White",
        },
      ],
      partCatalogue,
    })

    expect(result.status).toBe("supported")
    expect(result.lowConfidenceRows).toEqual([])
    expect(result.rows.map((row) => [row.partNumber, row.confidence])).toEqual([
      ["40243c01", 0.9],
      ["3068p40", 0.9],
    ])
  })

  it("fails closed when no parts-list page is detected", () => {
    const result = extractPartsListFromPageTexts({
      colors,
      pageCount: 20,
      pageTexts: [{ pageNumber: 19, text: "Build the left wall." }],
    })

    expect(result).toMatchObject({
      confidence: 0,
      reason: "no_candidate_pages",
      rows: [],
      status: "unsupported",
    })
  })
})
