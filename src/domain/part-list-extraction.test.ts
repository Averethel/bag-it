import { describe, expect, it } from "vitest";

import {
  extractPartListFromOcrPages,
  summarizePartsListPage,
  type OcrPageText,
  type OcrTextWord,
} from "./part-list-extraction";
import type { VisualPartDescriptor } from "./visual-part-matching";

function page(pageNumber: number, textLines: string[]): OcrPageText {
  return {
    pageNumber,
    width: 1200,
    height: 1600,
    lines: textLines.map((text, index) => ({
      pageNumber,
      text,
      confidence: 90 - index,
      bbox: {
        x0: 20,
        y0: index * 30,
        x1: 900,
        y1: index * 30 + 20,
      },
    })),
  };
}

function word(
  text: string,
  x: number,
  y: number,
  pageNumber = 1,
  visualColorRgb: string | null = null,
  visualDescriptor: VisualPartDescriptor | null = null,
): OcrTextWord {
  return {
    pageNumber,
    text,
    confidence: 90,
    bbox: {
      x0: x,
      y0: y,
      x1: x + Math.max(24, text.length * 10),
      y1: y + 20,
    },
    ...(visualColorRgb ? { visualColorRgb } : {}),
    ...(visualDescriptor ? { visualDescriptor } : {}),
  };
}

function descriptor(
  xHistogram: number[],
  yHistogram: number[],
  aspectRatio = 1,
  fillRatio = 0.5,
): VisualPartDescriptor {
  return {
    aspectRatio,
    dominantRgb: null,
    fillRatio,
    xHistogram,
    yHistogram,
  };
}

describe("extractPartListFromOcrPages", () => {
  it("extracts single-line part rows in OCR order", () => {
    const result = extractPartListFromOcrPages([
      page(1, ["Step 1", "Qty 2 2420 Black Plate 2 x 2 Corner"]),
      page(2, [
        "Parts List",
        "Qty 7 2431 Blue Tile 1 x 4",
        "Qty 4 2450 Green Wedge Plate 3 x 3",
        "Qty 9 2456 Black Brick 2 x 6",
        "Qty 6 2780 Blue Technic Pin",
      ]),
    ]);

    expect(result.selectedPageNumbers).toEqual([2]);
    expect(result.items.map((item) => item.partNumber)).toEqual([
      "2431",
      "2450",
      "2456",
      "2780",
    ]);
    expect(result.items.map((item) => item.quantity)).toEqual([7, 4, 9, 6]);
    expect(result.items[0]).toMatchObject({
      colorName: "Blue",
      description: "Tile 1 x 4",
      pageNumber: 2,
      sequence: 1,
      status: "complete",
    });
  });

  it("keeps review notes when OCR rows are missing fields", () => {
    const result = extractPartListFromOcrPages([
      page(4, [
        "Inventory",
        "Qty 3",
        "3001",
        "Brick 2 x 4",
        "Qty 8 3002 Black",
      ]),
    ]);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      partNumber: "3001",
      quantity: 3,
      description: "Brick 2 x 4",
      status: "needs-review",
    });
    expect(result.items[0]?.notes).toContain("Missing or unclear color.");
    expect(result.items[1]).toMatchObject({
      partNumber: "3002",
      quantity: 8,
      colorName: "Black",
      status: "complete",
    });
  });

  it("uses word geometry to assign quantities from card regions", () => {
    const result = extractPartListFromOcrPages([
      {
        pageNumber: 8,
        width: 900,
        height: 900,
        lines: [
          {
            pageNumber: 8,
            text: "2420 2431 Plate Corner Tile 2x 7x Black Blue",
            confidence: 90,
            bbox: { x0: 40, y0: 100, x1: 820, y1: 300 },
          },
        ],
        words: [
          word("2420", 100, 120, 8),
          word("2431", 500, 120, 8),
          word("Plate", 100, 170, 8),
          word("Corner", 100, 200, 8),
          word("Tile", 500, 170, 8),
          word("2x", 110, 260, 8),
          word("7x", 510, 260, 8),
          word("Black", 120, 310, 8),
          word("Blue", 520, 310, 8),
        ],
      },
    ]);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      partNumber: "2420",
      quantity: 2,
      colorName: "Black",
      description: "Plate Corner",
      status: "complete",
    });
    expect(result.items[1]).toMatchObject({
      partNumber: "2431",
      quantity: 7,
      colorName: "Blue",
      description: "Tile",
      status: "complete",
    });
  });

  it("reads standalone quantity words immediately before the part number", () => {
    const result = extractPartListFromOcrPages([
      {
        pageNumber: 8,
        width: 900,
        height: 900,
        lines: [
          {
            pageNumber: 8,
            text: "4 73825 Light Bluish Gray",
            confidence: 90,
            bbox: { x0: 80, y0: 100, x1: 420, y1: 120 },
          },
        ],
        words: [
          word("4", 100, 120, 8),
          word("73825", 140, 120, 8),
          word("Light", 210, 120, 8),
          word("Bluish", 270, 120, 8),
          word("Gray", 340, 120, 8),
        ],
      },
    ]);

    expect(result.items[0]).toMatchObject({
      partNumber: "73825",
      quantity: 4,
      colorName: "Light Bluish Gray",
      status: "complete",
    });
  });

  it("reads standalone quantity words above the part number", () => {
    const result = extractPartListFromOcrPages([
      {
        pageNumber: 8,
        width: 900,
        height: 900,
        lines: [
          {
            pageNumber: 8,
            text: "4 73825 Light Bluish Gray",
            confidence: 90,
            bbox: { x0: 80, y0: 100, x1: 420, y1: 180 },
          },
        ],
        words: [
          word("4", 150, 70, 8),
          word("73825", 120, 160, 8),
          word("Light", 200, 160, 8),
          word("Bluish", 260, 160, 8),
          word("Gray", 330, 160, 8),
        ],
      },
    ]);

    expect(result.items[0]).toMatchObject({
      partNumber: "73825",
      quantity: 4,
      colorName: "Light Bluish Gray",
      status: "complete",
    });
  });

  it("repairs common one-count quantity symbol OCR in the quantity slot", () => {
    const result = extractPartListFromOcrPages([
      {
        pageNumber: 8,
        width: 900,
        height: 900,
        lines: [
          {
            pageNumber: 8,
            text: "@ 6134 Light Bluish Gray",
            confidence: 90,
            bbox: { x0: 80, y0: 100, x1: 420, y1: 120 },
          },
        ],
        words: [
          word("@", 100, 120, 8),
          word("6134", 140, 120, 8),
          word("Light", 210, 120, 8),
          word("Bluish", 270, 120, 8),
          word("Gray", 340, 120, 8),
        ],
      },
    ]);

    expect(result.items[0]).toMatchObject({
      partNumber: "6134",
      quantity: 1,
      colorName: "Light Bluish Gray",
      status: "complete",
    });
  });

  it("repairs hash quantity symbol OCR in the quantity slot", () => {
    const result = extractPartListFromOcrPages([
      {
        pageNumber: 8,
        width: 900,
        height: 900,
        lines: [
          {
            pageNumber: 8,
            text: "# 32932 Green",
            confidence: 90,
            bbox: { x0: 80, y0: 100, x1: 420, y1: 120 },
          },
        ],
        words: [
          word("#", 100, 120, 8),
          word("32932", 140, 120, 8),
          word("Green", 220, 120, 8),
        ],
      },
    ]);

    expect(result.items[0]).toMatchObject({
      partNumber: "32932",
      quantity: 1,
      colorName: "Green",
      status: "complete",
    });
  });

  it("reads a standalone quantity immediately after the part number", () => {
    const result = extractPartListFromOcrPages([
      {
        pageNumber: 8,
        width: 900,
        height: 900,
        lines: [
          {
            pageNumber: 8,
            text: "2454 1 Tan",
            confidence: 90,
            bbox: { x0: 80, y0: 100, x1: 420, y1: 120 },
          },
        ],
        words: [
          word("2454", 100, 120, 8),
          word("1", 160, 120, 8),
          word("Tan", 200, 120, 8),
        ],
      },
    ]);

    expect(result.items[0]).toMatchObject({
      partNumber: "2454",
      quantity: 1,
      colorName: "Tan",
      status: "complete",
    });
  });

  it("does not repair one-count symbols after the part number", () => {
    const result = extractPartListFromOcrPages([
      {
        pageNumber: 8,
        width: 900,
        height: 900,
        lines: [
          {
            pageNumber: 8,
            text: "6134 @ Light Bluish Gray",
            confidence: 90,
            bbox: { x0: 80, y0: 100, x1: 420, y1: 120 },
          },
        ],
        words: [
          word("6134", 100, 120, 8),
          word("@", 170, 120, 8),
          word("Light", 210, 120, 8),
          word("Bluish", 270, 120, 8),
          word("Gray", 340, 120, 8),
        ],
      },
    ]);

    expect(result.items[0]).toMatchObject({
      partNumber: "6134",
      quantity: null,
      colorName: "Light Bluish Gray",
      status: "needs-review",
    });
  });

  it("does not treat split description dimensions as quantities", () => {
    const result = extractPartListFromOcrPages([
      {
        pageNumber: 8,
        width: 900,
        height: 900,
        lines: [
          {
            pageNumber: 8,
            text: "3001 Black Brick 2 x 4",
            confidence: 90,
            bbox: { x0: 80, y0: 100, x1: 420, y1: 120 },
          },
        ],
        words: [
          word("3001", 100, 120, 8),
          word("Black", 170, 120, 8),
          word("Brick", 240, 120, 8),
          word("2", 310, 120, 8),
          word("x", 340, 120, 8),
          word("4", 370, 120, 8),
        ],
      },
    ]);

    expect(result.items[0]).toMatchObject({
      partNumber: "3001",
      quantity: null,
      colorName: "Black",
      status: "needs-review",
    });
  });

  it("reads a raw standalone quantity immediately after the part number", () => {
    const result = extractPartListFromOcrPages([
      page(8, [
        "Parts",
        "Tan 2454 1 noisy text",
      ]),
    ]);

    expect(result.items[0]).toMatchObject({
      partNumber: "2454",
      quantity: 1,
      colorName: "Tan",
      status: "complete",
    });
  });

  it("repairs a missing card quantity from a unique alternate OCR row", () => {
    const result = extractPartListFromOcrPages([
      {
        pageNumber: 8,
        width: 1200,
        height: 1200,
        lines: [
          {
            pageNumber: 8,
            text: "Parts",
            confidence: 90,
            bbox: { x0: 20, y0: 20, x1: 100, y1: 40 },
          },
          {
            pageNumber: 8,
            text: "1x 3009 Dark Bluish Gray",
            confidence: 90,
            bbox: { x0: 40, y0: 80, x1: 360, y1: 110 },
          },
        ],
        cards: [
          {
            pageNumber: 8,
            bbox: { x0: 20, y0: 60, x1: 280, y1: 240 },
            lines: [],
            words: [
              word("3009", 80, 120, 8),
              word("Dark", 80, 170, 8),
              word("Bluish", 130, 170, 8),
              word("Gray", 200, 170, 8),
            ],
          },
          {
            pageNumber: 8,
            bbox: { x0: 300, y0: 60, x1: 560, y1: 240 },
            lines: [],
            words: [
              word("1x", 330, 100, 8),
              word("85861", 360, 120, 8),
              word("Black", 360, 170, 8),
            ],
          },
          {
            pageNumber: 8,
            bbox: { x0: 580, y0: 60, x1: 840, y1: 240 },
            lines: [],
            words: [
              word("1x", 610, 100, 8),
              word("4740", 640, 120, 8),
              word("Dark", 640, 170, 8),
              word("Bluish", 690, 170, 8),
              word("Gray", 760, 170, 8),
            ],
          },
          {
            pageNumber: 8,
            bbox: { x0: 860, y0: 60, x1: 1120, y1: 240 },
            lines: [],
            words: [
              word("1x", 890, 100, 8),
              word("43722", 920, 120, 8),
              word("Dark", 920, 170, 8),
              word("Bluish", 970, 170, 8),
              word("Gray", 1040, 170, 8),
            ],
          },
        ],
      },
    ]);

    expect(result.items[0]).toMatchObject({
      partNumber: "3009",
      quantity: 1,
      colorName: "Dark Bluish Gray",
      status: "complete",
    });
    expect(result.items[0]?.notes).toContain(
      "Quantity recovered from alternate OCR row.",
    );
  });

  it("keeps suffixed Rebrickable part numbers intact", () => {
    const result = extractPartListFromOcrPages([
      page(12, [
        "Parts List",
        "970c12 2x Black Hips and Legs",
        "49661pr0001 1x White Torso Print",
        "983 Dark Bluish Gray reference marker",
      ]),
    ]);

    expect(result.items.map((item) => item.partNumber)).toEqual([
      "970c12",
      "49661pr0001",
    ]);
    expect(result.items.map((item) => item.quantity)).toEqual([2, 1]);
  });

  it("uses conservative quantity fallbacks for noisy OCR rows", () => {
    const result = extractPartListFromOcrPages([
      page(12, [
        "Parts List",
        "3x £5850 Black Wedge",
        "Black 3675 Black 8x Black",
      ]),
    ]);

    expect(result.items.map((item) => item.partNumber)).toEqual(["5850", "3675"]);
    expect(result.items.map((item) => item.quantity)).toEqual([3, 8]);
  });

  it("validates manual OCR rows against CSV inventory without adding CSV-only rows", () => {
    const result = extractPartListFromOcrPages(
      [
        page(12, [
          "Parts List",
          "4x 3040 Light Bluish Gray",
          "2x 3001 Black Brick",
        ]),
      ],
      {
        validationInventory: [
          {
            id: "csv-1",
            sequence: 1,
            partNumber: "3040b",
            color: "71",
            colorName: "Light Bluish Gray",
            quantity: 4,
            isSpare: false,
          },
          {
            id: "csv-2",
            sequence: 2,
            partNumber: "3001",
            color: "0",
            colorName: "Black",
            quantity: 2,
            isSpare: false,
          },
          {
            id: "csv-3",
            sequence: 3,
            partNumber: "3020",
            color: "0",
            colorName: "Black",
            quantity: 9,
            isSpare: false,
          },
        ],
      },
    );

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.partNumber)).toEqual(["3040b", "3001"]);
    expect(result.items[0]).toMatchObject({
      ocrPartNumber: "3040",
      validationStatus: "csv-alias-match",
    });
    expect(result.items[1]).toMatchObject({
      validationStatus: "csv-exact-match",
    });
    expect(result.validationSummary).toMatchObject({
      csvRows: 3,
      exactMatches: 1,
      aliasMatches: 1,
      unmatchedRows: 0,
      unusedCsvRows: 1,
    });
  });

  it("uses Rebrickable catalog aliases from CSV rows during validation", () => {
    const result = extractPartListFromOcrPages(
      [
        page(12, [
          "Parts List",
          "1x 49661pb01 White Torso Print",
          "2x 3040 Light Bluish Gray Slope",
        ]),
      ],
      {
        validationInventory: [
          {
            id: "csv-1",
            sequence: 1,
            partNumber: "49661pr0001",
            color: "15",
            colorName: "White",
            colorRgb: "FFFFFF",
            quantity: 1,
            isSpare: false,
            catalogPart: {
              requestedPartNumber: "49661pr0001",
              partNumber: "49661pr0001",
              name: "Torso with Print",
              partImageUrl: null,
              partUrl: null,
              aliases: [
                {
                  partNumber: "49661pb01",
                  kind: "external",
                  source: "BrickLink",
                },
                {
                  partNumber: "49661",
                  kind: "print",
                  source: "print_of",
                },
              ],
            },
          },
          {
            id: "csv-2",
            sequence: 2,
            partNumber: "3040b",
            color: "71",
            colorName: "Light Bluish Gray",
            colorRgb: "A0A5A9",
            quantity: 2,
            isSpare: false,
            catalogPart: {
              requestedPartNumber: "3040b",
              partNumber: "3040b",
              name: "Slope 45 2 x 1",
              partImageUrl: null,
              partUrl: null,
              aliases: [
                {
                  partNumber: "3040",
                  kind: "canonical",
                  source: "Rebrickable",
                },
              ],
            },
          },
        ],
      },
    );

    expect(result.items.map((item) => item.partNumber)).toEqual([
      "49661pr0001",
      "3040b",
    ]);
    expect(result.items.map((item) => item.ocrPartNumber)).toEqual([
      "49661pb01",
      "3040",
    ]);
    expect(result.items[0]).toMatchObject({
      catalogPart: expect.objectContaining({
        name: "Torso with Print",
        partNumber: "49661pr0001",
      }),
      colorRgb: "FFFFFF",
      rebrickableColorId: "15",
    });
    expect(result.items[1]).toMatchObject({
      catalogPart: expect.objectContaining({
        name: "Slope 45 2 x 1",
        partNumber: "3040b",
      }),
      colorRgb: "A0A5A9",
      rebrickableColorId: "71",
    });
    expect(result.validationSummary).toMatchObject({
      aliasMatches: 2,
      unmatchedRows: 0,
    });
    expect(result.items[0]?.notes).toContain(
      "Rebrickable catalog suggests 49661pr0001 for OCR part 49661pb01.",
    );
  });

  it("hydrates CSV color ids from catalog colors during validation", () => {
    const result = extractPartListFromOcrPages(
      [
        page(12, [
          "Parts List",
          "1x 22388 PearlGold Decorative Ornament",
        ]),
      ],
      {
        catalogColorNamesById: {
          "297": "Pearl Gold",
        },
        catalogColorRgbById: {
          "297": "AA7F2E",
        },
        validationInventory: [
          {
            color: "297",
            colorName: "297",
            id: "csv-1",
            isSpare: false,
            partNumber: "22388",
            quantity: 1,
            sequence: 1,
          },
        ],
      },
    );

    expect(result.items[0]).toMatchObject({
      colorName: "Pearl Gold",
      colorRgb: "AA7F2E",
      rebrickableColorId: "297",
      validationStatus: "csv-exact-match",
    });
  });

  it("adds Rebrickable color IDs from catalog color names for colored previews", () => {
    const result = extractPartListFromOcrPages(
      [
        page(12, [
          "Parts List",
          "2x 3001 Black Brick",
          "4x 3040 Light Bluish Gray Slope",
        ]),
      ],
      {
        catalogValidationEnabled: true,
        catalogColorIdsByName: {
          black: "0",
          "light bluish gray": "71",
        },
        candidateCatalogParts: [
          {
            requestedPartNumber: "3001",
            partNumber: "3001",
            name: "Brick 2 x 4",
            partImageUrl: "/api/catalog/part-image?partNumber=3001",
            partUrl: null,
            aliases: [],
          },
          {
            requestedPartNumber: "3040",
            partNumber: "3040b",
            name: "Slope 45 2 x 1",
            partImageUrl: "/api/catalog/part-image?partNumber=3040b",
            partUrl: null,
            aliases: [
              {
                partNumber: "3040",
                kind: "canonical",
                source: "Rebrickable",
              },
            ],
          },
        ],
      },
    );

    expect(result.items[0]).toMatchObject({
      colorName: "Black",
      partNumber: "3001",
      rebrickableColorId: "0",
    });
    expect(result.items[1]).toMatchObject({
      colorName: "Light Bluish Gray",
      partNumber: "3040",
      rebrickableColorId: "71",
    });
  });

  it("prefers Rebrickable canonical catalog color names over local aliases", () => {
    const result = extractPartListFromOcrPages(
      [
        page(12, [
          "Parts List",
          "1x 20482 Trans Clear Tile Round",
          "2x 30153 Trans-Orange Flame",
        ]),
      ],
      {
        catalogColorIdsByName: {
          "trans clear": "47",
          "trans orange": "182",
        },
        catalogColorNames: ["Trans-Clear", "Trans-Orange"],
      },
    );

    expect(result.items[0]).toMatchObject({
      colorName: "Trans-Clear",
      description: "Tile Round",
      rebrickableColorId: "47",
    });
    expect(result.items[1]).toMatchObject({
      colorName: "Trans-Orange",
      description: "Flame",
      rebrickableColorId: "182",
    });
  });

  it("reads merged OCR color words as canonical catalog colors", () => {
    const result = extractPartListFromOcrPages(
      [
        page(12, [
          "Parts List",
          "1x 3040 LightBluishGray Slope",
          "2x 4073 ReddishBrown Plate Round",
          "3x 53454 PearlDarkGray Sword",
        ]),
      ],
      {
        catalogColorIdsByName: {
          "light bluish gray": "71",
          "pearl dark gray": "77",
          "reddish brown": "70",
        },
        catalogColorNames: [
          "Light Bluish Gray",
          "Pearl Dark Gray",
          "Reddish Brown",
        ],
      },
    );

    expect(result.items[0]).toMatchObject({
      colorName: "Light Bluish Gray",
      description: "Slope",
      rebrickableColorId: "71",
    });
    expect(result.items[1]).toMatchObject({
      colorName: "Reddish Brown",
      description: "Plate Round",
      rebrickableColorId: "70",
    });
    expect(result.items[2]).toMatchObject({
      colorName: "Pearl Dark Gray",
      description: "Sword",
      rebrickableColorId: "77",
    });
  });

  it("does not let weak catalog aliases consume later exact CSV matches", () => {
    const result = extractPartListFromOcrPages(
      [
        page(20, [
          "Parts",
          "10x 3626 Transparent Noisy printed head row",
          "28x 28621 Trans Red Round Tile",
        ]),
      ],
      {
        validationInventory: [
          {
            id: "csv-1",
            sequence: 1,
            partNumber: "28621",
            color: "47",
            colorName: "Trans-Red",
            quantity: 2,
            isSpare: false,
            catalogPart: {
              requestedPartNumber: "28621",
              partNumber: "28621",
              name: "Round Tile 1 x 1",
              partImageUrl: null,
              partUrl: null,
              aliases: [
                {
                  partNumber: "3626",
                  kind: "external",
                  source: "BrickLink",
                },
              ],
            },
          },
        ],
      },
    );

    expect(result.items.map((item) => item.validationStatus)).toEqual([
      "csv-no-match",
      "csv-exact-match",
    ]);
    expect(result.validationSummary).toMatchObject({
      exactMatches: 1,
      aliasMatches: 0,
      unmatchedRows: 1,
      unusedCsvRows: 0,
    });
  });

  it("uses OCR part catalog names to match equivalent unused CSV rows", () => {
    const result = extractPartListFromOcrPages(
      [
        page(8, [
          "Parts",
          "2x 3794b Light Bluish Gray Plate Special Jumper",
        ]),
      ],
      {
        candidateCatalogParts: [
          {
            requestedPartNumber: "3794b",
            partNumber: "3794b",
            name: "Plate Special 1 x 2 with 1 Stud with Groove (Jumper)",
            partImageUrl: null,
            partUrl: null,
            aliases: [],
          },
        ],
        validationInventory: [
          {
            id: "csv-1",
            sequence: 1,
            partNumber: "15573",
            color: "71",
            colorName: "Light Bluish Gray",
            quantity: 2,
            isSpare: false,
            catalogPart: {
              requestedPartNumber: "15573",
              partNumber: "15573",
              name: "Plate Special 1 x 2 with 1 Stud with Groove and Inside Stud Holder (Jumper)",
              partImageUrl: null,
              partUrl: null,
              aliases: [],
            },
          },
        ],
      },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      partNumber: "15573",
      ocrPartNumber: "3794b",
      validationStatus: "csv-alias-match",
    });
    expect(result.validationSummary).toMatchObject({
      aliasMatches: 1,
      unmatchedRows: 0,
      unusedCsvRows: 0,
    });
  });

  it("validates OCR rows against the Rebrickable catalog when no CSV is loaded", () => {
    const result = extractPartListFromOcrPages(
      [
        page(8, [
          "Parts",
          "1x 3001 Black Brick",
          "2x 3040 Light Bluish Gray Slope",
          "3x 9999 Red Unknown",
        ]),
      ],
      {
        candidateCatalogParts: [
          {
            requestedPartNumber: "3001",
            partNumber: "3001",
            name: "Brick 2 x 4",
            partImageUrl: null,
            partUrl: null,
            aliases: [],
          },
          {
            requestedPartNumber: "3040b",
            partNumber: "3040b",
            name: "Slope 45 2 x 1",
            partImageUrl: null,
            partUrl: null,
            aliases: [
              {
                partNumber: "3040",
                kind: "canonical",
                source: "Rebrickable",
              },
            ],
          },
        ],
      },
    );

    expect(result.items.map((item) => item.partNumber)).toEqual([
      "3001",
      "3040b",
      "9999",
    ]);
    expect(result.items.map((item) => item.validationStatus)).toEqual([
      "catalog-exact-match",
      "catalog-alias-match",
      "catalog-no-match",
    ]);
    expect(result.items[1]).toMatchObject({
      colorName: "Light Bluish Gray",
      ocrPartNumber: "3040",
    });
    expect(result.items[1]?.notes).toContain(
      "Rebrickable catalog suggests 3040b for OCR part 3040.",
    );
    expect(result.validationSummary).toMatchObject({
      source: "catalog",
      csvRows: 0,
      catalogRows: 2,
      exactMatches: 1,
      aliasMatches: 1,
      unmatchedRows: 1,
      quantityDifferences: 0,
      unusedCsvRows: 0,
    });
  });

  it("reports catalog misses after a catalog lookup returns no candidate parts", () => {
    const result = extractPartListFromOcrPages(
      [
        page(8, [
          "Parts",
          "1x 9999 Black Unknown",
        ]),
      ],
      {
        catalogValidationEnabled: true,
        candidateCatalogParts: [],
      },
    );

    expect(result.items[0]).toMatchObject({
      partNumber: "9999",
      status: "needs-review",
      validationStatus: "catalog-no-match",
    });
    expect(result.validationSummary).toMatchObject({
      source: "catalog",
      catalogRows: 0,
      unmatchedRows: 1,
    });
  });

  it("uses catalog alias bases for OCR suffix variants when CSV is missing", () => {
    const result = extractPartListFromOcrPages(
      [
        page(8, [
          "Parts",
          "4x 4589b Light Bluish Gray Cone",
        ]),
      ],
      {
        candidateCatalogParts: [
          {
            requestedPartNumber: "4589",
            partNumber: "59900",
            name: "Cone 1 x 1 with Top Groove",
            partImageUrl: null,
            partUrl: null,
            aliases: [
              {
                partNumber: "4589",
                kind: "relationship",
                source: "M",
              },
            ],
          },
        ],
      },
    );

    expect(result.items[0]).toMatchObject({
      partNumber: "59900",
      ocrPartNumber: "4589b",
      validationStatus: "catalog-alias-match",
    });
  });

  it("uses manual color to choose between alias CSV rows", () => {
    const result = extractPartListFromOcrPages(
      [
        page(8, [
          "Parts",
          "4x 3794b Red Plate Special Jumper",
        ]),
      ],
      {
        validationInventory: [
          {
            id: "csv-1",
            sequence: 1,
            partNumber: "15573",
            color: "1",
            colorName: "Blue",
            quantity: 4,
            isSpare: false,
            catalogPart: {
              requestedPartNumber: "15573",
              partNumber: "15573",
              name: "Plate Special 1 x 2 with 1 Stud with Groove and Inside Stud Holder (Jumper)",
              partImageUrl: null,
              partUrl: null,
              aliases: [
                {
                  partNumber: "3794b",
                  kind: "relationship",
                  source: "M",
                },
              ],
            },
          },
          {
            id: "csv-2",
            sequence: 2,
            partNumber: "15573",
            color: "4",
            colorName: "Red",
            quantity: 1,
            isSpare: false,
            catalogPart: {
              requestedPartNumber: "15573",
              partNumber: "15573",
              name: "Plate Special 1 x 2 with 1 Stud with Groove and Inside Stud Holder (Jumper)",
              partImageUrl: null,
              partUrl: null,
              aliases: [
                {
                  partNumber: "3794b",
                  kind: "relationship",
                  source: "M",
                },
              ],
            },
          },
        ],
      },
    );

    expect(result.items[0]).toMatchObject({
      partNumber: "15573",
      ocrPartNumber: "3794b",
      colorName: "Red",
      validationStatus: "csv-alias-match",
    });
    expect(result.validationSummary).toMatchObject({
      aliasMatches: 1,
      unusedCsvRows: 1,
    });
  });

  it("keeps exact OCR part numbers ahead of quantity-matching aliases", () => {
    const result = extractPartListFromOcrPages(
      [
        page(8, [
          "Parts",
          "1x 85861 Black Plate Round",
        ]),
      ],
      {
        validationInventory: [
          {
            id: "csv-1",
            sequence: 1,
            partNumber: "6141",
            color: "0",
            colorName: "Black",
            quantity: 1,
            isSpare: false,
            catalogPart: {
              requestedPartNumber: "6141",
              partNumber: "6141",
              name: "Plate Round 1 x 1",
              partImageUrl: null,
              partUrl: null,
              aliases: [
                {
                  partNumber: "85861",
                  kind: "canonical",
                  source: "Rebrickable",
                },
              ],
            },
          },
          {
            id: "csv-2",
            sequence: 2,
            partNumber: "85861",
            color: "0",
            colorName: "Black",
            quantity: 9,
            isSpare: false,
            catalogPart: {
              requestedPartNumber: "85861",
              partNumber: "85861",
              name: "Plate Round 1 x 1 with Open Stud",
              partImageUrl: null,
              partUrl: null,
              aliases: [],
            },
          },
        ],
      },
    );

    expect(result.items[0]).toMatchObject({
      partNumber: "85861",
      validationStatus: "csv-exact-match",
    });
  });

  it("uses raw OCR color phrases to choose between same-part CSV colors", () => {
    const result = extractPartListFromOcrPages(
      [
        page(8, [
          "Parts",
          "1x Gray 69729 Dark Bluish Gray Plate",
        ]),
      ],
      {
        validationInventory: [
          {
            id: "csv-1",
            sequence: 1,
            partNumber: "69729",
            color: "0",
            colorName: "Black",
            quantity: 1,
            isSpare: false,
          },
          {
            id: "csv-2",
            sequence: 2,
            partNumber: "69729",
            color: "72",
            colorName: "Dark Bluish Gray",
            quantity: 1,
            isSpare: false,
          },
        ],
      },
    );

    expect(result.items[0]).toMatchObject({
      partNumber: "69729",
      colorName: "Dark Bluish Gray",
      validationStatus: "csv-exact-match",
    });
    expect(result.items[0]?.ocrColorName).toBeUndefined();
  });

  it("uses generic gray evidence to avoid non-gray same-part CSV colors", () => {
    const result = extractPartListFromOcrPages(
      [
        page(8, [
          "Parts",
          "1x Gray 3795 Plate",
        ]),
      ],
      {
        validationInventory: [
          {
            id: "csv-1",
            sequence: 1,
            partNumber: "3795",
            color: "6",
            colorName: "Green",
            quantity: 1,
            isSpare: false,
          },
          {
            id: "csv-2",
            sequence: 2,
            partNumber: "3795",
            color: "72",
            colorName: "Dark Bluish Gray",
            quantity: 1,
            isSpare: false,
          },
        ],
      },
    );

    expect(result.items[0]).toMatchObject({
      colorName: "Dark Bluish Gray",
      ocrColorName: "Gray",
      validationStatus: "csv-exact-match",
    });
  });

  it("matches partial bluish-gray OCR phrases before unrelated same-part colors", () => {
    const result = extractPartListFromOcrPages(
      [
        page(8, [
          "Parts",
          "3x Gray 85984 Light Bluish Plate",
        ]),
      ],
      {
        validationInventory: [
          {
            id: "csv-1",
            sequence: 1,
            partNumber: "85984",
            color: "6",
            colorName: "Green",
            quantity: 3,
            isSpare: false,
          },
          {
            id: "csv-2",
            sequence: 2,
            partNumber: "85984",
            color: "71",
            colorName: "Light Bluish Gray",
            quantity: 3,
            isSpare: false,
          },
        ],
      },
    );

    expect(result.items[0]).toMatchObject({
      colorName: "Light Bluish Gray",
      validationStatus: "csv-exact-match",
    });
    expect(result.items[0]?.ocrColorName).toBeUndefined();
  });

  it("combines nearby finite color tokens around the part number", () => {
    const result = extractPartListFromOcrPages([
      page(8, [
        "Parts",
        "Gray, & 43722 Dark Bluish",
      ]),
    ]);

    expect(result.items[0]).toMatchObject({
      partNumber: "43722",
      colorName: "Dark Bluish Gray",
    });
  });

  it("uses positioned raw color after the part number over neighboring colors", () => {
    const result = extractPartListFromOcrPages(
      [
        page(8, [
          "Parts",
          "1x Green 3069 Gray Reddish Brown",
        ]),
      ],
      {
        validationInventory: [
          {
            id: "csv-1",
            sequence: 1,
            partNumber: "3069b",
            color: "2",
            colorName: "Green",
            quantity: 1,
            isSpare: false,
            catalogPart: {
              requestedPartNumber: "3069b",
              partNumber: "3069b",
              name: "Tile 1 x 2",
              partImageUrl: null,
              partUrl: null,
              aliases: [
                {
                  partNumber: "3069",
                  kind: "canonical",
                  source: "Rebrickable",
                },
              ],
            },
          },
          {
            id: "csv-2",
            sequence: 2,
            partNumber: "3069b",
            color: "70",
            colorName: "Reddish Brown",
            quantity: 5,
            isSpare: false,
            catalogPart: {
              requestedPartNumber: "3069b",
              partNumber: "3069b",
              name: "Tile 1 x 2",
              partImageUrl: null,
              partUrl: null,
              aliases: [
                {
                  partNumber: "3069",
                  kind: "canonical",
                  source: "Rebrickable",
                },
              ],
            },
          },
        ],
      },
    );

    expect(result.items[0]).toMatchObject({
      partNumber: "3069b",
      colorName: "Reddish Brown",
      validationStatus: "csv-alias-match",
    });
    expect(result.items[0]?.ocrColorName).toBeUndefined();
  });

  it("uses nearby OCR color context when a repeated part row has no readable color", () => {
    const result = extractPartListFromOcrPages(
      [
        page(8, [
          "Parts",
          "2x 86996 Light Gray",
          "6x 3003",
        ]),
      ],
      {
        validationInventory: [
          {
            id: "csv-1",
            sequence: 1,
            partNumber: "86996",
            color: "71",
            colorName: "Light Bluish Gray",
            quantity: 2,
            isSpare: false,
          },
          {
            id: "csv-2",
            sequence: 2,
            partNumber: "3003",
            color: "297",
            colorName: "Pearl Gold",
            quantity: 6,
            isSpare: false,
          },
          {
            id: "csv-3",
            sequence: 3,
            partNumber: "3003",
            color: "71",
            colorName: "Light Bluish Gray",
            quantity: 45,
            isSpare: false,
          },
        ],
      },
    );

    expect(result.items[1]).toMatchObject({
      partNumber: "3003",
      colorName: "Light Bluish Gray",
      validationStatus: "csv-exact-match",
    });
  });

  it("uses visual color evidence when OCR only reads a generic color", () => {
    const result = extractPartListFromOcrPages(
      [
        {
          pageNumber: 8,
          width: 900,
          height: 900,
          lines: [
            {
              pageNumber: 8,
              text: "Gray 1x 30357",
              confidence: 90,
              bbox: { x0: 40, y0: 100, x1: 300, y1: 120 },
            },
          ],
          words: [
            word("Gray", 100, 120, 8),
            word("1x", 130, 170, 8),
            word("30357", 160, 170, 8, "237841"),
          ],
        },
      ],
      {
        validationInventory: [
          {
            id: "csv-1",
            sequence: 1,
            partNumber: "30357",
            color: "72",
            colorName: "Dark Bluish Gray",
            colorRgb: "6C6E68",
            quantity: 7,
            isSpare: false,
          },
          {
            id: "csv-2",
            sequence: 2,
            partNumber: "30357",
            color: "2",
            colorName: "Green",
            colorRgb: "237841",
            quantity: 8,
            isSpare: false,
          },
        ],
      },
    );

    expect(result.items[0]).toMatchObject({
      colorName: "Green",
      ocrColorName: "Gray",
      validationStatus: "csv-exact-match",
    });
  });

  it("uses part image shape evidence to rerank plausible catalog aliases", () => {
    const manualTileDescriptor = descriptor(
      [0.04, 0.08, 0.15, 0.23, 0.23, 0.15, 0.08, 0.04],
      [0.05, 0.1, 0.18, 0.22, 0.2, 0.14, 0.08, 0.03],
      1.9,
      0.48,
    );
    const wrongShapeDescriptor = descriptor(
      [0.22, 0.18, 0.12, 0.06, 0.06, 0.12, 0.18, 0.22],
      [0.2, 0.16, 0.12, 0.08, 0.08, 0.12, 0.16, 0.08],
      0.8,
      0.22,
    );

    const result = extractPartListFromOcrPages(
      [
        {
          pageNumber: 8,
          width: 900,
          height: 900,
          lines: [
            {
              pageNumber: 8,
              text: "1x 3069 Gray",
              confidence: 90,
              bbox: { x0: 40, y0: 100, x1: 300, y1: 120 },
            },
          ],
          words: [
            word("1x", 120, 170, 8),
            word("3069", 160, 170, 8, null, manualTileDescriptor),
            word("Gray", 170, 220, 8),
          ],
        },
      ],
      {
        validationInventory: [
          {
            id: "csv-1",
            sequence: 1,
            partNumber: "3069c",
            color: "71",
            colorName: "Light Bluish Gray",
            quantity: 1,
            isSpare: false,
            catalogImageDescriptor: wrongShapeDescriptor,
            catalogPart: {
              requestedPartNumber: "3069c",
              partNumber: "3069c",
              name: "Tile 1 x 2 alternate mold",
              partImageUrl: "https://cdn.rebrickable.com/wrong.jpg",
              partUrl: null,
              aliases: [
                {
                  partNumber: "3069",
                  kind: "relationship",
                  source: "M",
                },
              ],
            },
          },
          {
            id: "csv-2",
            sequence: 2,
            partNumber: "3069b",
            color: "71",
            colorName: "Light Bluish Gray",
            quantity: 1,
            isSpare: false,
            catalogImageDescriptor: manualTileDescriptor,
            catalogPart: {
              requestedPartNumber: "3069b",
              partNumber: "3069b",
              name: "Tile 1 x 2",
              partImageUrl: "https://cdn.rebrickable.com/match.jpg",
              partUrl: null,
              aliases: [
                {
                  partNumber: "3069",
                  kind: "relationship",
                  source: "M",
                },
              ],
            },
          },
        ],
      },
    );

    expect(result.items[0]).toMatchObject({
      partNumber: "3069b",
      ocrPartNumber: "3069",
      validationStatus: "csv-alias-match",
    });
  });

  it("uses CSV color as the validated color while preserving OCR color", () => {
    const result = extractPartListFromOcrPages(
      [
        page(8, [
          "Parts",
          "8x 6141 Brown Plate Round",
        ]),
      ],
      {
        validationInventory: [
          {
            id: "csv-1",
            sequence: 1,
            partNumber: "6141",
            color: "308",
            colorName: "Dark Brown",
            quantity: 8,
            isSpare: false,
          },
        ],
      },
    );

    expect(result.items[0]).toMatchObject({
      partNumber: "6141",
      colorName: "Dark Brown",
      ocrColorName: "Brown",
      validationStatus: "csv-exact-match",
    });
    expect(result.items[0]?.notes).toContain(
      "CSV suggests Dark Brown for OCR color Brown.",
    );
  });

  it("uses CSV colors as OCR vocabulary before validation", () => {
    const result = extractPartListFromOcrPages(
      [
        page(8, [
          "Parts",
          "8x 6141 Dark Brown Plate Round",
        ]),
      ],
      {
        validationInventory: [
          {
            id: "csv-1",
            sequence: 1,
            partNumber: "6141",
            color: "308",
            colorName: "Dark Brown",
            quantity: 8,
            isSpare: false,
          },
        ],
      },
    );

    expect(result.items[0]).toMatchObject({
      partNumber: "6141",
      colorName: "Dark Brown",
      validationStatus: "csv-exact-match",
    });
    expect(result.items[0]?.ocrColorName).toBeUndefined();
    expect(result.items[0]?.notes).not.toContain("Missing or unclear color.");
  });

  it("uses CSV validation to correct one-digit OCR part number misses", () => {
    const result = extractPartListFromOcrPages(
      [
        page(8, [
          "Parts",
          "3x 80481 Dark Bluish Gray",
        ]),
      ],
      {
        validationInventory: [
          {
            id: "csv-1",
            sequence: 1,
            partNumber: "60481",
            color: "72",
            colorName: "Dark Bluish Gray",
            quantity: 11,
            isSpare: false,
          },
        ],
      },
    );

    expect(result.items[0]).toMatchObject({
      partNumber: "60481",
      ocrPartNumber: "80481",
      colorName: "Dark Bluish Gray",
      validationStatus: "csv-alias-match",
    });
  });

  it("uses CSV validation to choose the best OCR candidate shape", () => {
    const result = extractPartListFromOcrPages(
      [
        {
          ...page(8, ["Parts", "1x 9999 Black"]),
          words: [
            word("1x", 40, 80, 8),
            word("3001", 90, 80, 8),
            word("Black", 150, 80, 8),
          ],
        },
      ],
      {
        validationInventory: [
          {
            id: "csv-1",
            sequence: 1,
            partNumber: "3001",
            color: "0",
            colorName: "Black",
            quantity: 1,
            isSpare: false,
          },
        ],
      },
    );

    expect(result.items[0]).toMatchObject({
      partNumber: "3001",
      quantity: 1,
      validationStatus: "csv-exact-match",
    });
  });

  it("uses the last dense trailing candidate page group as the parts list", () => {
    const result = extractPartListFromOcrPages([
      page(2, [
        "Step 5",
        "Qty 1 3001 Black Brick 2 x 4",
        "Qty 1 3002 Blue Brick 2 x 3",
        "Qty 1 3003 Green Brick 2 x 2",
        "Qty 1 3004 Red Brick 1 x 2",
      ]),
      page(9, [
        "Parts",
        "Qty 2 3020 Black Plate 2 x 4",
        "Qty 2 3021 Blue Plate 2 x 3",
        "Qty 2 3022 Green Plate 2 x 2",
        "Qty 2 3023 Red Plate 1 x 2",
      ]),
      page(10, [
        "Parts continued",
        "Qty 1 3031 Black Plate 4 x 4",
        "Qty 1 3032 Blue Plate 4 x 6",
        "Qty 1 3033 Green Plate 6 x 10",
        "Qty 1 3034 Red Plate 2 x 8",
      ]),
    ]);

    expect(result.selectedPageNumbers).toEqual([9, 10]);
    expect(result.items.map((item) => item.partNumber)).toEqual([
      "3020",
      "3021",
      "3022",
      "3023",
      "3031",
      "3032",
      "3033",
      "3034",
    ]);
  });

  it("includes sparse trailing candidate pages after the dense parts list", () => {
    const result = extractPartListFromOcrPages([
      page(8, [
        "Parts",
        "Qty 2 3020 Black Plate 2 x 4",
        "Qty 2 3021 Blue Plate 2 x 3",
        "Qty 2 3022 Green Plate 2 x 2",
        "Qty 2 3023 Red Plate 1 x 2",
      ]),
      page(9, [
        "Qty 1 3031 Black Plate 4 x 4",
        "Qty 1 3032 Blue Plate 4 x 6",
      ]),
    ]);

    expect(result.selectedPageNumbers).toEqual([8, 9]);
    expect(result.items.map((item) => item.partNumber)).toEqual([
      "3020",
      "3021",
      "3022",
      "3023",
      "3031",
      "3032",
    ]);
  });

  it("summarizes likely parts-list pages for automatic boundary detection", () => {
    expect(
      summarizePartsListPage(
        page(4, ["Step 7", "Qty 1 3001 Black Brick 2 x 4"]),
      ),
    ).toMatchObject({
      itemCount: 1,
      isLikelyPartsListPage: false,
    });
    expect(
      summarizePartsListPage(
        page(12, [
          "Qty 1 3020 Black Plate",
          "Qty 1 3021 Black Plate",
          "Qty 1 3022 Black Plate",
          "Qty 1 3023 Black Plate",
          "Qty 1 3024 Black Plate",
          "Qty 1 3025 Black Plate",
          "Qty 1 3026 Black Plate",
          "Qty 1 3027 Black Plate",
        ]),
      ),
    ).toMatchObject({
      itemCount: 8,
      isLikelyPartsListPage: true,
    });
    expect(
      summarizePartsListPage(page(13, ["Inventory", "Qty 1 3031 Blue Plate"])),
    ).toMatchObject({
      hasInventoryHeader: true,
      isLikelyPartsListPage: true,
    });
  });
});
