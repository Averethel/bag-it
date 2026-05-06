import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RebrickableCatalogCacheIndex } from "@/domain/rebrickable-catalog";
import { readGeneratedRebrickableCatalogCache } from "@/server/rebrickable-catalog-cache";

import { POST } from "./route";

vi.mock("@/server/rebrickable-catalog-cache", () => ({
  readGeneratedRebrickableCatalogCache: vi.fn(),
}));

describe("POST /api/catalog/parts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("serves generated catalog cache data without a live API key", async () => {
    vi.stubEnv("REBRICKABLE_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(readGeneratedRebrickableCatalogCache).mockResolvedValue(
      createCatalogCache({
        colors: {
          "71": "Light Bluish Gray",
        },
        colorRgbById: {
          "71": "A0A5A9",
        },
        parts: {
          "4589b": {
            name: "Cone 1 x 1",
            categoryId: "20",
            material: "Plastic",
          },
        },
      }),
    );

    const response = await POST(createPartsRequest(["4589b"]));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.parts).toEqual([
      expect.objectContaining({
        name: "Cone 1 x 1",
        partNumber: "4589b",
        requestedPartNumber: "4589b",
      }),
    ]);
    expect(payload.colorNamesById).toMatchObject({
      "71": "Light Bluish Gray",
    });
    expect(payload.colorRgbById).toMatchObject({
      "71": "A0A5A9",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns local image routes instead of provider image URLs", async () => {
    vi.stubEnv("REBRICKABLE_API_KEY", "test-key");
    vi.mocked(readGeneratedRebrickableCatalogCache).mockResolvedValue(
      createCatalogCache({}),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          results: [
            {
              name: "Brick 2 x 4",
              part_img_url:
                "https://cdn.rebrickable.com/media/parts/photos/15/3001.jpg",
              part_num: "3001",
            },
          ],
        }),
      ),
    );

    const response = await POST(createPartsRequest(["3001"]));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.parts[0]).toMatchObject({
      partImageUrl: "/api/catalog/part-image?partNumber=3001",
      partNumber: "3001",
    });
  });

  it("rejects over-limit requests without truncating part numbers", async () => {
    vi.stubEnv("REBRICKABLE_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn());

    const response = await POST(
      createPartsRequest(
        Array.from({ length: 1_001 }, (_, index) => `part-${index}`),
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Cannot fetch more than 1000 parts at once.");
    expect(readGeneratedRebrickableCatalogCache).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

function createPartsRequest(partNumbers: string[]) {
  return new Request("http://localhost/api/catalog/parts", {
    body: JSON.stringify({ partNumbers }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

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
    aliases: overrides.aliases ?? {},
    colorRgbById: overrides.colorRgbById ?? {},
    colors: overrides.colors ?? {},
    parts: overrides.parts ?? {},
  };
}
