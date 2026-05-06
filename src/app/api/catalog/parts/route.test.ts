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
    expect(payload.colorIdsByName).toMatchObject({
      "light bluish gray": "71",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the generated catalog cache even when an API key is configured", async () => {
    vi.stubEnv("REBRICKABLE_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(readGeneratedRebrickableCatalogCache).mockResolvedValue(
      createCatalogCache({
        parts: {
          "3001": {
            name: "Brick 2 x 4",
            categoryId: "11",
            material: "Plastic",
          },
        },
      }),
    );

    const response = await POST(createPartsRequest(["3001"]));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.parts[0]).toMatchObject({
      name: "Brick 2 x 4",
      partNumber: "3001",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns local image routes instead of provider image URLs when live lookup is explicitly enabled", async () => {
    vi.stubEnv("REBRICKABLE_API_KEY", "test-key");
    vi.stubEnv("REBRICKABLE_LIVE_CATALOG", "1");
    vi.mocked(readGeneratedRebrickableCatalogCache).mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                name: "Brick 2 x 4",
                part_img_url:
                  "https://cdn.rebrickable.com/media/parts/photos/15/3001.jpg",
                part_num: "3001",
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const response = await POST(createPartsRequest(["3001"]));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.parts[0]).toMatchObject({
      partImageUrl:
        "/api/catalog/part-image?partNumber=3001&source=rebrickable-cache-v1",
      partNumber: "3001",
    });
  });

  it("falls back to generated catalog cache when the live API request fails", async () => {
    vi.stubEnv("REBRICKABLE_API_KEY", "test-key");
    vi.stubEnv("REBRICKABLE_LIVE_CATALOG", "1");
    vi.mocked(readGeneratedRebrickableCatalogCache).mockResolvedValue(
      createCatalogCache({
        colors: {
          "297": "Pearl Gold",
        },
        colorRgbById: {
          "297": "AA7F2E",
        },
        parts: {
          "22388": {
            categoryId: "27",
            material: "Plastic",
            name: "Minifig, Weapon Bladed Claw",
          },
        },
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream unavailable", { status: 502 })),
    );

    const response = await POST(createPartsRequest(["22388"]));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.parts[0]).toMatchObject({
      name: "Minifig, Weapon Bladed Claw",
      partNumber: "22388",
    });
    expect(payload.colorNamesById).toMatchObject({
      "297": "Pearl Gold",
    });
    expect(payload.warnings).toContain(
      "Live catalog request failed with HTTP 502; using generated catalog cache.",
    );
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
      "aliases" | "colorRgbById" | "colors" | "elementIdsByPartColor" | "parts"
    >
  >,
): RebrickableCatalogCacheIndex {
  return {
    schemaVersion: 5,
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
      elements: {
        fileName: "elements.csv.gz",
        url: "https://cdn.rebrickable.com/media/downloads/elements.csv.gz",
        etag: "\"elements\"",
        lastModified: "Tue, 05 May 2026 00:00:00 GMT",
        contentLength: "1",
        sha256: "elements-sha",
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
    elementIdsByPartColor: overrides.elementIdsByPartColor ?? {},
    parts: overrides.parts ?? {},
  };
}
