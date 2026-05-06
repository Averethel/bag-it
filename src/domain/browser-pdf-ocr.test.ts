import { describe, expect, it } from "vitest";

import {
  collectCatalogImageDescriptorTargetRowIds,
  collectCatalogCandidatePartNumbers,
  fetchOptionalOcrCatalogPartsForExtraction,
} from "./browser-pdf-ocr";
import type { PartListExtractionResult } from "./part-list-extraction";
import type { RebrickableInventoryItem } from "./rebrickable-csv";
import type { VisualPartDescriptor } from "./visual-part-matching";

const descriptor: VisualPartDescriptor = {
  aspectRatio: 1,
  dominantRgb: null,
  fillRatio: 0.5,
  xHistogram: [1],
  yHistogram: [1],
};

function extractionResult(
  item: PartListExtractionResult["items"][number],
): PartListExtractionResult {
  return {
    candidatePageNumbers: [1],
    items: [item],
    pagesAnalyzed: 1,
    selectedPageNumbers: [1],
    warnings: [],
  };
}

function item(
  overrides: Partial<PartListExtractionResult["items"][number]>,
): PartListExtractionResult["items"][number] {
  return {
    colorName: "Light Bluish Gray",
    confidence: 90,
    description: "Tile",
    id: "item-1",
    notes: [],
    pageNumber: 1,
    partNumber: "3069b",
    quantity: 1,
    rawText: "1x 3069 Tile",
    sequence: 1,
    status: "complete",
    validationStatus: "csv-exact-match",
    visualDescriptor: descriptor,
    ...overrides,
  };
}

function inventoryItem(
  id: string,
  partNumber: string,
  imageUrl: string,
  aliases: string[] = [],
): RebrickableInventoryItem {
  return {
    color: "71",
    colorName: "Light Bluish Gray",
    id,
    isSpare: false,
    partNumber,
    quantity: 1,
    sequence: Number(id.replace(/\D/g, "")) || 1,
    catalogPart: {
      aliases: aliases.map((partNumber) => ({
        kind: "relationship",
        partNumber,
        source: "M",
      })),
      name: "Tile",
      partImageUrl: imageUrl,
      partNumber,
      partUrl: null,
      requestedPartNumber: partNumber,
    },
  };
}

describe("collectCatalogImageDescriptorTargetRowIds", () => {
  it("does not fetch catalog images for already exact CSV matches", () => {
    const targetRowIds = collectCatalogImageDescriptorTargetRowIds(
      extractionResult(item({ partNumber: "3001" })),
      [
        inventoryItem("row-1", "3001", "https://cdn.rebrickable.com/3001.jpg"),
        inventoryItem("row-2", "3001", "https://cdn.rebrickable.com/3001-alt.jpg"),
      ],
    );

    expect([...targetRowIds]).toEqual([]);
  });

  it("fetches candidate images only when an OCR alias has multiple visual candidates", () => {
    const targetRowIds = collectCatalogImageDescriptorTargetRowIds(
      extractionResult(
        item({
          ocrPartNumber: "3069",
          partNumber: "3069b",
          validationStatus: "csv-alias-match",
        }),
      ),
      [
        inventoryItem("row-1", "3069b", "https://cdn.rebrickable.com/3069b.jpg", [
          "3069",
        ]),
        inventoryItem("row-2", "3069c", "https://cdn.rebrickable.com/3069c.jpg", [
          "3069",
        ]),
      ],
    );

    expect([...targetRowIds]).toEqual(["row-1", "row-2"]);
  });

  it("skips alias image matching when there is no visual choice to make", () => {
    const targetRowIds = collectCatalogImageDescriptorTargetRowIds(
      extractionResult(
        item({
          ocrPartNumber: "3069",
          partNumber: "3069b",
          validationStatus: "csv-alias-match",
        }),
      ),
      [
        inventoryItem("row-1", "3069b", "https://cdn.rebrickable.com/3069b.jpg", [
          "3069",
        ]),
      ],
    );

    expect([...targetRowIds]).toEqual([]);
  });
});

describe("collectCatalogCandidatePartNumbers", () => {
  it("uses all OCR part numbers when no CSV inventory is present", () => {
    const partNumbers = collectCatalogCandidatePartNumbers(
      {
        candidatePageNumbers: [1],
        items: [
          item({ partNumber: "3001" }),
          item({
            ocrPartNumber: "3040",
            partNumber: "3040b",
            validationStatus: "catalog-alias-match",
          }),
        ],
        pagesAnalyzed: 1,
        selectedPageNumbers: [1],
        warnings: [],
      },
      false,
    );

    expect(partNumbers).toEqual(["3001", "3040"]);
  });

  it("uses only CSV misses when CSV inventory is present", () => {
    const partNumbers = collectCatalogCandidatePartNumbers(
      {
        candidatePageNumbers: [1],
        items: [
          item({
            partNumber: "3001",
            validationStatus: "csv-exact-match",
          }),
          item({
            partNumber: "9999",
            validationStatus: "csv-no-match",
          }),
        ],
        pagesAnalyzed: 1,
        selectedPageNumbers: [1],
        warnings: [],
      },
      true,
    );

    expect(partNumbers).toEqual(["9999"]);
  });
});

describe("fetchOptionalOcrCatalogPartsForExtraction", () => {
  it("keeps OCR extraction usable when catalog lookup fails", async () => {
    const result = await fetchOptionalOcrCatalogPartsForExtraction(
      extractionResult(item({ partNumber: "3001" })),
      {
        fetchCatalogParts: async () => {
          throw new Error("Rebrickable catalog request timed out.");
        },
      },
    );

    expect(result.catalogResult).toBeNull();
    expect(result.warnings).toEqual([
      "Rebrickable catalog validation skipped: Rebrickable catalog request timed out.",
    ]);
  });
});
