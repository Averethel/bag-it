import { beforeEach, describe, expect, it, vi } from "vitest";

const readFile = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", () => ({
  default: {
    readFile,
  },
  readFile,
}));

const validCatalogCache = {
  aliases: {},
  checkedAt: "2026-01-01T00:00:00.000Z",
  colorRgbById: {},
  colors: {},
  elementIdsByPartColor: {},
  generatedAt: "2026-01-01T00:00:00.000Z",
  parts: {},
  schemaVersion: 5,
  sources: {
    colors: {},
    elements: {},
    partRelationships: {},
    parts: {},
  },
};

describe("readGeneratedRebrickableCatalogCache", () => {
  beforeEach(() => {
    readFile.mockReset();
  });

  it("does not memoize a missing cache so a later generated cache can be read", async () => {
    readFile.mockRejectedValueOnce(new Error("ENOENT"));
    readFile.mockResolvedValueOnce(JSON.stringify(validCatalogCache));
    vi.resetModules();

    const { readGeneratedRebrickableCatalogCache } = await import(
      "./rebrickable-catalog-cache"
    );

    await expect(readGeneratedRebrickableCatalogCache()).resolves.toBeNull();
    await expect(readGeneratedRebrickableCatalogCache()).resolves.toEqual(
      validCatalogCache,
    );
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it("rejects array-shaped cache payloads", async () => {
    readFile.mockResolvedValueOnce(JSON.stringify([]));
    vi.resetModules();

    const { readGeneratedRebrickableCatalogCache } = await import(
      "./rebrickable-catalog-cache"
    );

    await expect(readGeneratedRebrickableCatalogCache()).resolves.toBeNull();
  });
});
