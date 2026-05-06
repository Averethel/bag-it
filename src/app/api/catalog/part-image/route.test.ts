import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readLDrawFileWithRemoteFallback } from "@/server/ldraw-remote-library";
import {
  createLDrawPartSvgCachePath,
  readCachedLDrawPartSvg,
  writeCachedLDrawPartSvg,
} from "@/server/ldraw-render-cache";
import { readGeneratedRebrickableCatalogCache } from "@/server/rebrickable-catalog-cache";
import { readCachedRebrickableElementImage } from "@/server/rebrickable-image-cache";
import { renderLDrawPartSvg } from "@/server/ldraw-thumbnail";

import { GET } from "./route";

vi.mock("@/server/rebrickable-catalog-cache", () => ({
  readGeneratedRebrickableCatalogCache: vi.fn(),
}));

vi.mock("@/server/ldraw-render-cache", () => ({
  createLDrawPartSvgCachePath: vi.fn(),
  readCachedLDrawPartSvg: vi.fn(),
  writeCachedLDrawPartSvg: vi.fn(),
}));

vi.mock("@/server/rebrickable-image-cache", () => ({
  readCachedRebrickableElementImage: vi.fn(),
}));

vi.mock("@/server/ldraw-thumbnail", () => ({
  renderLDrawPartSvg: vi.fn(),
}));

describe("GET /api/catalog/part-image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createLDrawPartSvgCachePath).mockImplementation(
      ({ colorHex, partNumberCandidates }) =>
        `ldraw-thumbnails/v1/${colorHex}-${partNumberCandidates.join("-")}.svg`,
    );
    vi.mocked(readCachedLDrawPartSvg).mockResolvedValue(null);
    vi.mocked(writeCachedLDrawPartSvg).mockResolvedValue(undefined);
    vi.mocked(readGeneratedRebrickableCatalogCache).mockResolvedValue(null);
    vi.mocked(readCachedRebrickableElementImage).mockResolvedValue(null);
    vi.mocked(renderLDrawPartSvg).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects URL passthrough requests", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const response = await GET(
      createPartImageRequest(
        "url=https%3A%2F%2Fcdn.rebrickable.com%2Fmedia%2Fparts%2F3001.jpg",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("A valid part number is required.");
    expect(fetch).not.toHaveBeenCalled();
    expect(renderLDrawPartSvg).not.toHaveBeenCalled();
  });

  it("rejects unsafe part numbers before any lookup", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const response = await GET(createPartImageRequest("partNumber=..%2F3001"));

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(renderLDrawPartSvg).not.toHaveBeenCalled();
  });

  it("renders a local LDraw thumbnail for the requested part and color", async () => {
    vi.mocked(readGeneratedRebrickableCatalogCache).mockResolvedValue(
      createCatalogCache({
        colorRgbById: {
          "4": "C91A09",
        },
      }),
    );
    vi.mocked(renderLDrawPartSvg).mockResolvedValue(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"></svg>',
    );
    vi.stubGlobal("fetch", vi.fn());

    const response = await GET(
      createPartImageRequest("partNumber=3001&colorId=4"),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(body).toContain("<svg");
    expectLDrawRender({
      colorHex: "#C91A09",
      partNumberCandidates: ["3001"],
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves a cached LDraw thumbnail before rendering on demand", async () => {
    vi.mocked(readCachedLDrawPartSvg).mockResolvedValue("<svg>cached</svg>");

    const response = await GET(createPartImageRequest("partNumber=3021&colorId=15"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toBe("<svg>cached</svg>");
    expect(renderLDrawPartSvg).not.toHaveBeenCalled();
    expect(writeCachedLDrawPartSvg).not.toHaveBeenCalled();
  });

  it("serves a cached Rebrickable element image before rendering LDraw", async () => {
    vi.mocked(readGeneratedRebrickableCatalogCache).mockResolvedValue(
      createCatalogCache({
        colorRgbById: {
          "4": "C91A09",
        },
        elementIdsByPartColor: {
          "3001": {
            "4": ["300121"],
          },
        },
      }),
    );
    vi.mocked(readCachedRebrickableElementImage).mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/jpeg",
      sourceUrl: "https://cdn.rebrickable.com/media/parts/elements/300121.jpg",
    });

    const response = await GET(
      createPartImageRequest("partNumber=3001&colorId=4&source=rebrickable-cache-v1"),
    );
    const body = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect([...body]).toEqual([1, 2, 3]);
    expect(readCachedRebrickableElementImage).toHaveBeenCalledWith(["300121"]);
    expect(renderLDrawPartSvg).not.toHaveBeenCalled();
  });

  it("falls back to LDraw when the Rebrickable element image is unavailable", async () => {
    vi.mocked(readGeneratedRebrickableCatalogCache).mockResolvedValue(
      createCatalogCache({
        colorRgbById: {
          "4": "C91A09",
        },
        elementIdsByPartColor: {
          "3002": {
            "4": ["300221"],
          },
        },
      }),
    );
    vi.mocked(readCachedRebrickableElementImage).mockResolvedValue(null);
    vi.mocked(renderLDrawPartSvg).mockResolvedValue("<svg></svg>");

    const response = await GET(
      createPartImageRequest("partNumber=3002&colorId=4&source=rebrickable-cache-v1"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
    expectLDrawRender({
      colorHex: "#C91A09",
      partNumberCandidates: ["3002"],
    });
  });

  it("can force LDraw rendering without checking the Rebrickable image cache", async () => {
    vi.mocked(readGeneratedRebrickableCatalogCache).mockResolvedValue(
      createCatalogCache({
        elementIdsByPartColor: {
          "3001": {
            "4": ["300121"],
          },
        },
      }),
    );
    vi.mocked(renderLDrawPartSvg).mockResolvedValue("<svg></svg>");

    await GET(createPartImageRequest("partNumber=3001&colorId=4&renderer=ldraw-v1"));

    expect(readCachedRebrickableElementImage).not.toHaveBeenCalled();
    expectLDrawRender({
      colorHex: "#A0A5A9",
      partNumberCandidates: ["3001"],
    });
  });

  it("passes catalogue aliases as LDraw part candidates", async () => {
    vi.mocked(readGeneratedRebrickableCatalogCache).mockResolvedValue(
      createCatalogCache({
        aliases: {
          "98138pr0048": [
            {
              kind: "print",
              partNumber: "98138",
              source: "Rebrickable",
            },
          ],
        },
      }),
    );
    vi.mocked(renderLDrawPartSvg).mockResolvedValue("<svg></svg>");

    await GET(createPartImageRequest("partNumber=98138pr0048&colorId=70"));

    expectLDrawRender({
      colorHex: "#A0A5A9",
      partNumberCandidates: ["98138pr0048", "98138"],
    });
  });

  it("tries an unlettered LDraw candidate for Rebrickable variant part numbers", async () => {
    vi.mocked(readGeneratedRebrickableCatalogCache).mockResolvedValue(
      createCatalogCache({
        aliases: {
          "30237a": [
            {
              kind: "relationship",
              partNumber: "30237b",
              source: "M",
            },
          ],
        },
      }),
    );
    vi.mocked(renderLDrawPartSvg).mockResolvedValue("<svg></svg>");

    await GET(createPartImageRequest("partNumber=30237a&colorId=71"));

    expectLDrawRender({
      colorHex: "#A0A5A9",
      partNumberCandidates: ["30237a", "30237b", "30237"],
    });
  });

  it("tries local LDraw substitutes for Rebrickable IDs without direct LDraw files", async () => {
    vi.mocked(renderLDrawPartSvg).mockResolvedValue("<svg></svg>");

    await GET(createPartImageRequest("partNumber=92338&colorId=297"));

    expectLDrawRender({
      colorHex: "#A0A5A9",
      partNumberCandidates: ["92338", "92338-f1", "92338-f2"],
    });
  });

  it.each([
    ["24126", ["24126", "2412b", "2412"]],
    ["25375", ["25375", "25375-f1", "25375-f2", "25375-f3"]],
    ["15744", ["15744", "33211"]],
    ["100728", ["100728", "30292a", "30292b", "30292"]],
  ])(
    "covers the castle manual LDraw substitute for %s",
    async (partNumber, partNumberCandidates) => {
      vi.mocked(renderLDrawPartSvg).mockResolvedValue("<svg></svg>");

      await GET(createPartImageRequest(`partNumber=${partNumber}&colorId=15`));

      expectLDrawRender({
        colorHex: "#A0A5A9",
        partNumberCandidates,
      });
    },
  );

  it("tries local LDraw substitutes for printed Rebrickable IDs", async () => {
    vi.mocked(renderLDrawPartSvg).mockResolvedValue("<svg></svg>");

    await GET(createPartImageRequest("partNumber=108721pr0001&colorId=9999"));

    expectLDrawRender({
      colorHex: "#A0A5A9",
      partNumberCandidates: ["108721pr0001", "108721", "30292a", "30292b", "30292"],
    });
  });

  it("uses a neutral color when the catalogue has no matching color RGB", async () => {
    vi.mocked(renderLDrawPartSvg).mockResolvedValue("<svg></svg>");

    await GET(createPartImageRequest("partNumber=3022&colorId=999"));

    expectLDrawRender({
      colorHex: "#A0A5A9",
      partNumberCandidates: ["3022"],
    });
  });

  it("returns not found when no local LDraw geometry is available", async () => {
    vi.mocked(renderLDrawPartSvg).mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn());

    const response = await GET(createPartImageRequest("partNumber=notfound"));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("LDraw part geometry was not found.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not memoize missing LDraw renders across later retries", async () => {
    vi.mocked(renderLDrawPartSvg)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("<svg>recovered</svg>");

    const firstResponse = await GET(
      createPartImageRequest("partNumber=retry-ldraw&colorId=15"),
    );
    const secondResponse = await GET(
      createPartImageRequest("partNumber=retry-ldraw&colorId=15"),
    );

    expect(firstResponse.status).toBe(404);
    expect(secondResponse.status).toBe(200);
    await expect(secondResponse.text()).resolves.toBe("<svg>recovered</svg>");
    expect(renderLDrawPartSvg).toHaveBeenCalledTimes(2);
  });
});

function createPartImageRequest(query: string) {
  return new Request(`http://localhost/api/catalog/part-image?${query}`);
}

function expectLDrawRender({
  colorHex,
  partNumberCandidates,
}: {
  colorHex: string;
  partNumberCandidates: string[];
}) {
  expect(renderLDrawPartSvg).toHaveBeenCalledWith({
    colorHex,
    partNumberCandidates,
    readLDrawFile: readLDrawFileWithRemoteFallback,
  });
}

function createCatalogCache(overrides: {
  aliases?: NonNullable<
    Awaited<ReturnType<typeof readGeneratedRebrickableCatalogCache>>
  >["aliases"];
  colorRgbById?: NonNullable<
    Awaited<ReturnType<typeof readGeneratedRebrickableCatalogCache>>
  >["colorRgbById"];
  elementIdsByPartColor?: NonNullable<
    Awaited<ReturnType<typeof readGeneratedRebrickableCatalogCache>>
  >["elementIdsByPartColor"];
}) {
  return {
    aliases: overrides.aliases ?? {},
    checkedAt: "2026-05-06T00:00:00.000Z",
    colorRgbById: overrides.colorRgbById ?? {},
    colors: {},
    elementIdsByPartColor: overrides.elementIdsByPartColor ?? {},
    generatedAt: "2026-05-06T00:00:00.000Z",
    parts: {},
    schemaVersion: 5,
    sources: {
      colors: createCatalogSource("colors.csv.gz"),
      elements: createCatalogSource("elements.csv.gz"),
      partRelationships: createCatalogSource("part_relationships.csv.gz"),
      parts: createCatalogSource("parts.csv.gz"),
    },
  } as Awaited<ReturnType<typeof readGeneratedRebrickableCatalogCache>>;
}

function createCatalogSource(fileName: string) {
  return {
    contentLength: "0",
    etag: null,
    fileName,
    lastModified: null,
    rowCount: 0,
    sha256: "test",
    url: `https://example.com/${fileName}`,
  };
}
