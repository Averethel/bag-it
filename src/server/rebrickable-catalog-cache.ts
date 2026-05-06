import { readFile } from "node:fs/promises";
import path from "node:path";

import type { RebrickableCatalogCacheIndex } from "@/domain/rebrickable-catalog";

const catalogCachePath = path.join(
  process.cwd(),
  ".cache",
  "rebrickable-catalog",
  "catalog-index.json",
);

let cachePromise: Promise<RebrickableCatalogCacheIndex | null> | null = null;

export function readGeneratedRebrickableCatalogCache() {
  cachePromise ??= readCatalogCache().then(
    (catalogCache) => {
      if (catalogCache === null) {
        cachePromise = null;
      }

      return catalogCache;
    },
    (error: unknown) => {
      cachePromise = null;
      throw error;
    },
  );

  return cachePromise;
}

async function readCatalogCache(): Promise<RebrickableCatalogCacheIndex | null> {
  try {
    const payload = JSON.parse(await readFile(catalogCachePath, "utf8")) as unknown;

    return isRebrickableCatalogCacheIndex(payload) ? payload : null;
  } catch {
    return null;
  }
}

function isRebrickableCatalogCacheIndex(
  value: unknown,
): value is RebrickableCatalogCacheIndex {
  return (
    isRecord(value) &&
    value.schemaVersion === 5 &&
    typeof value.generatedAt === "string" &&
    typeof value.checkedAt === "string" &&
    isRecord(value.sources) &&
    isRecord(value.sources.colors) &&
    isRecord(value.sources.elements) &&
    isRecord(value.sources.parts) &&
    isRecord(value.sources.partRelationships) &&
    isRecord(value.colors) &&
    isRecord(value.colorRgbById) &&
    isRecord(value.elementIdsByPartColor) &&
    isRecord(value.parts) &&
    isRecord(value.aliases)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
