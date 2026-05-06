import { describe, expect, it } from "vitest";

import {
  attachCatalogColorsToInventory,
  attachCatalogPartsToInventory,
  enrichRebrickablePartsWithCatalogCache,
  normalizeRebrickablePartsResponse,
} from "./rebrickable-catalog";
import type { RebrickableCatalogCacheIndex } from "./rebrickable-catalog";

describe("normalizeRebrickablePartsResponse", () => {
  it("collects canonical, print, external, and relationship aliases", () => {
    const result = normalizeRebrickablePartsResponse(["49661pr0001"], {
      results: [
        {
          part_num: "49661pr0001",
          name: "Torso with Print",
          part_url: "https://rebrickable.com/parts/49661pr0001",
          part_img_url: "https://img.example/49661pr0001.png",
          print_of: "49661",
          external_ids: {
            BrickLink: ["49661pb01"],
            LDraw: {
              ext_ids: ["973pb0001"],
            },
          },
          relationships: [
            {
              rel_type: "M",
              child_part_num: "76382",
            },
          ],
        },
      ],
    });

    expect(result.missingPartNumbers).toEqual([]);
    expect(result.parts[0]).toMatchObject({
      partNumber: "49661pr0001",
      name: "Torso with Print",
      partUrl: "https://rebrickable.com/parts/49661pr0001",
      partImageUrl: "https://img.example/49661pr0001.png",
    });
    expect(result.parts[0]?.aliases).toEqual(
      expect.arrayContaining([
        {
          partNumber: "49661",
          kind: "print",
          source: "print_of",
        },
        {
          partNumber: "49661pb01",
          kind: "external",
          source: "BrickLink",
        },
        {
          partNumber: "973pb0001",
          kind: "external",
          source: "LDraw",
        },
        {
          partNumber: "76382",
          kind: "relationship",
          source: "M",
        },
      ]),
    );
  });

  it("attaches catalog details to CSV rows through aliases", () => {
    const catalogResult = normalizeRebrickablePartsResponse(["3040b"], {
      results: [
        {
          part_num: "3040b",
          rebrickable_part_ids: ["3040"],
        },
      ],
    });
    const inventory = attachCatalogPartsToInventory(
      [
        {
          id: "csv-1",
          sequence: 1,
          partNumber: "3040",
          color: "71",
          colorName: "Light Bluish Gray",
          quantity: 4,
          isSpare: false,
        },
      ],
      catalogResult.parts,
    );

    expect(inventory[0]?.catalogPart?.partNumber).toBe("3040b");
  });

  it("keeps exact catalog lookups from being overwritten by aliases", () => {
    const inventory = attachCatalogPartsToInventory(
      [
        {
          id: "csv-1",
          sequence: 1,
          partNumber: "6141",
          color: "308",
          colorName: null,
          quantity: 8,
          isSpare: false,
        },
        {
          id: "csv-2",
          sequence: 2,
          partNumber: "85861",
          color: "15",
          colorName: "White",
          quantity: 2,
          isSpare: false,
        },
      ],
      [
        {
          requestedPartNumber: "6141",
          partNumber: "6141",
          name: "Plate Round 1 x 1 with Solid Stud",
          partUrl: null,
          partImageUrl: null,
          aliases: [
            {
              partNumber: "85861",
              kind: "relationship",
              source: "A",
            },
          ],
        },
        {
          requestedPartNumber: "85861",
          partNumber: "85861",
          name: "Plate Round 1 x 1 with Open Stud",
          partUrl: null,
          partImageUrl: null,
          aliases: [
            {
              partNumber: "6141",
              kind: "relationship",
              source: "A",
            },
          ],
        },
      ],
    );

    expect(inventory[0]?.catalogPart?.partNumber).toBe("6141");
    expect(inventory[1]?.catalogPart?.partNumber).toBe("85861");
  });

  it("hydrates uploaded CSV color IDs from the generated catalog", () => {
    const inventory = attachCatalogColorsToInventory(
      [
        {
          id: "csv-1",
          sequence: 1,
          partNumber: "6141",
          color: "308",
          colorName: "308",
          quantity: 8,
          isSpare: false,
        },
      ],
      {
        "308": "Dark Brown",
      },
    );

    expect(inventory[0]?.colorName).toBe("Dark Brown");
  });

  it("adds generated catalogue relationship aliases to API parts", () => {
    const apiResult = normalizeRebrickablePartsResponse(["15573"], {
      results: [
        {
          part_num: "15573",
          name: "Plate Special 1 x 2 with 1 Stud",
        },
      ],
    });

    const result = enrichRebrickablePartsWithCatalogCache(
      apiResult,
      ["15573"],
      createCatalogCache({
        aliases: {
          "15573": [
            {
              partNumber: "3794b",
              kind: "relationship",
              source: "M",
            },
          ],
        },
        parts: {
          "15573": {
            name: "Plate Special 1 x 2 with 1 Stud",
            categoryId: "9",
            material: "Plastic",
          },
        },
      }),
    );

    expect(result.missingPartNumbers).toEqual([]);
    expect(result.parts[0]?.aliases).toEqual(
      expect.arrayContaining([
        {
          partNumber: "3794b",
          kind: "relationship",
          source: "M",
        },
      ]),
    );
  });

  it("creates cache-only catalog parts when the live API does not return a part", () => {
    const result = enrichRebrickablePartsWithCatalogCache(
      {
        parts: [],
        missingPartNumbers: ["30241b"],
        warnings: [],
        colorNamesById: {},
        colorRgbById: {},
      },
      ["30241b"],
      createCatalogCache({
        aliases: {
          "30241b": [
            {
              partNumber: "60475b",
              kind: "relationship",
              source: "A",
            },
          ],
        },
        parts: {
          "30241b": {
            name: "Legacy bracket",
            categoryId: "9",
            material: "Plastic",
          },
        },
      }),
    );

    expect(result.missingPartNumbers).toEqual([]);
    expect(result.parts[0]).toMatchObject({
      requestedPartNumber: "30241b",
      partNumber: "30241b",
      name: "Legacy bracket",
      aliases: [
        {
          partNumber: "60475b",
          kind: "relationship",
          source: "A",
        },
      ],
    });
  });

  it("uses generated catalogue base aliases for suffixed OCR part numbers", () => {
    const result = enrichRebrickablePartsWithCatalogCache(
      {
        parts: [],
        missingPartNumbers: ["4589b"],
        warnings: [],
        colorNamesById: {},
        colorRgbById: {},
      },
      ["4589b"],
      createCatalogCache({
        aliases: {
          "4589": [
            {
              partNumber: "59900",
              kind: "relationship",
              source: "M",
            },
          ],
        },
        parts: {
          "59900": {
            name: "Cone 1 x 1 with Top Groove",
            categoryId: "20",
            material: "Plastic",
          },
        },
      }),
    );

    expect(result.missingPartNumbers).toEqual([]);
    expect(result.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestedPartNumber: "4589b",
          partNumber: "59900",
          name: "Cone 1 x 1 with Top Groove",
          aliases: expect.arrayContaining([
            {
              partNumber: "4589b",
              kind: "relationship",
              source: "M",
            },
            {
              partNumber: "4589",
              kind: "relationship",
              source: "M",
            },
          ]),
        }),
      ]),
    );
  });
});

function createCatalogCache(
  overrides: Partial<
    Pick<
      RebrickableCatalogCacheIndex,
      "aliases" | "colorRgbById" | "colors" | "parts"
    >
  >,
): RebrickableCatalogCacheIndex {
  return {
    schemaVersion: 3,
    generatedAt: "2026-05-05T00:00:00.000Z",
    checkedAt: "2026-05-05T00:00:00.000Z",
    sources: {
      colors: {
        fileName: "colors.csv.gz",
        url: "https://cdn.rebrickable.com/media/downloads/colors.csv.gz",
        etag: "\"colors\"",
        lastModified: "Tue, 05 May 2026 00:00:00 GMT",
        contentLength: "1",
        sha256: "colors-sha",
        rowCount: 1,
      },
      parts: {
        fileName: "parts.csv.gz",
        url: "https://cdn.rebrickable.com/media/downloads/parts.csv.gz",
        etag: "\"parts\"",
        lastModified: "Tue, 05 May 2026 00:00:00 GMT",
        contentLength: "1",
        sha256: "parts-sha",
        rowCount: 1,
      },
      partRelationships: {
        fileName: "part_relationships.csv.gz",
        url: "https://cdn.rebrickable.com/media/downloads/part_relationships.csv.gz",
        etag: "\"relationships\"",
        lastModified: "Tue, 05 May 2026 00:00:00 GMT",
        contentLength: "1",
        sha256: "relationships-sha",
        rowCount: 1,
      },
    },
    colors: overrides.colors ?? {},
    colorRgbById: overrides.colorRgbById ?? {},
    aliases: overrides.aliases ?? {},
    parts: overrides.parts ?? {},
  };
}
