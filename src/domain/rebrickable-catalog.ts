import type { RebrickableInventoryItem } from "./rebrickable-csv";
import { normalizePartNumber } from "./rebrickable-csv";

export type RebrickableCatalogAliasKind =
  | "canonical"
  | "external"
  | "print"
  | "relationship";

export type RebrickableCatalogAlias = {
  partNumber: string;
  kind: RebrickableCatalogAliasKind;
  source: string;
};

export type RebrickableCatalogPart = {
  requestedPartNumber: string;
  partNumber: string;
  name: string | null;
  partUrl: string | null;
  partImageUrl: string | null;
  aliases: RebrickableCatalogAlias[];
};

export type RebrickableCatalogFetchResult = {
  parts: RebrickableCatalogPart[];
  missingPartNumbers: string[];
  warnings: string[];
  colorNamesById: Record<string, string>;
  colorRgbById: Record<string, string>;
};

export type RebrickableCatalogCachePart = {
  name: string | null;
  categoryId: string | null;
  material: string | null;
};

export type RebrickableCatalogCacheSource = {
  fileName: string;
  url: string;
  etag: string | null;
  lastModified: string | null;
  contentLength: string | null;
  sha256: string;
  rowCount: number;
};

export type RebrickableCatalogCacheIndex = {
  schemaVersion: 3;
  generatedAt: string;
  checkedAt: string;
  sources: {
    colors: RebrickableCatalogCacheSource;
    parts: RebrickableCatalogCacheSource;
    partRelationships: RebrickableCatalogCacheSource;
  };
  colors: Record<string, string>;
  colorRgbById: Record<string, string>;
  parts: Record<string, RebrickableCatalogCachePart>;
  aliases: Record<string, RebrickableCatalogAlias[]>;
};

type RawRebrickablePart = Record<string, unknown>;

export function normalizeRebrickablePartsResponse(
  requestedPartNumbers: string[],
  payload: unknown,
): RebrickableCatalogFetchResult {
  const requestedPartNumberSet = new Set(
    requestedPartNumbers.map(normalizePartNumber).filter(Boolean),
  );
  const rawParts = readRawPartResults(payload);
  const parts = rawParts.flatMap((rawPart): RebrickableCatalogPart[] => {
    const partNumber = readString(rawPart.part_num ?? rawPart.part_id);

    if (!partNumber) {
      return [];
    }

    const normalizedPartNumber = normalizePartNumber(partNumber);
    const requestedPartNumber = requestedPartNumberSet.has(normalizedPartNumber)
      ? normalizedPartNumber
      : normalizedPartNumber;

    return [
      {
        requestedPartNumber,
        partNumber: normalizedPartNumber,
        name: readString(rawPart.name),
        partUrl: readString(rawPart.part_url),
        partImageUrl: readString(rawPart.part_img_url),
        aliases: collectCatalogAliases(rawPart),
      },
    ];
  });
  const returnedPartNumberSet = new Set(
    parts.flatMap((part) => [
      part.partNumber,
      ...part.aliases.map((alias) => alias.partNumber),
    ]),
  );
  const missingPartNumbers = [...requestedPartNumberSet].filter(
    (partNumber) => !returnedPartNumberSet.has(partNumber),
  );

  return {
    parts,
    missingPartNumbers,
    warnings: [],
    colorNamesById: {},
    colorRgbById: {},
  };
}

export function attachCatalogPartsToInventory(
  inventory: RebrickableInventoryItem[],
  catalogParts: RebrickableCatalogPart[],
) {
  const catalogPartsByCandidate = createCatalogPartLookup(catalogParts);

  return inventory.map((inventoryItem) => {
    const catalogPart = catalogPartsByCandidate.get(inventoryItem.partNumber);

    return catalogPart ? { ...inventoryItem, catalogPart } : inventoryItem;
  });
}

export function attachCatalogColorsToInventory(
  inventory: RebrickableInventoryItem[],
  colorNamesById: Record<string, string>,
  colorRgbById: Record<string, string> = {},
) {
  return inventory.map((inventoryItem) => {
    const colorName = colorNamesById[inventoryItem.color.trim()];
    const colorRgb = colorRgbById[inventoryItem.color.trim()];

    return colorName || colorRgb
      ? {
          ...inventoryItem,
          ...(colorName ? { colorName } : {}),
          ...(colorRgb ? { colorRgb } : {}),
        }
      : inventoryItem;
  });
}

export function enrichRebrickablePartsWithCatalogCache(
  result: RebrickableCatalogFetchResult,
  requestedPartNumbers: string[],
  catalogCache: RebrickableCatalogCacheIndex | null,
): RebrickableCatalogFetchResult {
  if (!catalogCache) {
    return result;
  }

  const requestedPartNumberSet = new Set(
    requestedPartNumbers.map(normalizePartNumber).filter(Boolean),
  );
  const enrichedParts = mergeDuplicateCatalogParts(
    result.parts.map((catalogPart) =>
      enrichCatalogPartWithCacheAliases(catalogPart, catalogCache),
    ),
  );
  const returnedPartNumberSet = createReturnedPartNumberSet(enrichedParts);
  const cacheOnlyParts = [...requestedPartNumberSet].flatMap((partNumber) => {
    if (returnedPartNumberSet.has(partNumber)) {
      return [];
    }

    return createCatalogPartsFromCache(partNumber, catalogCache);
  });
  const parts = mergeDuplicateCatalogParts([...enrichedParts, ...cacheOnlyParts]);
  const returnedWithCachePartNumberSet = createReturnedPartNumberSet(parts);

  return {
    ...result,
    parts,
    colorNamesById: catalogCache.colors,
    colorRgbById: catalogCache.colorRgbById,
    missingPartNumbers: [...requestedPartNumberSet].filter(
      (partNumber) => !returnedWithCachePartNumberSet.has(partNumber),
    ),
  };
}

export async function fetchRebrickableCatalogParts(
  partNumbers: string[],
): Promise<RebrickableCatalogFetchResult> {
  const requestedPartNumbers = [...new Set(partNumbers.map(normalizePartNumber))]
    .filter(Boolean)
    .sort();

  if (requestedPartNumbers.length === 0) {
    return {
      parts: [],
      missingPartNumbers: [],
      warnings: [],
      colorNamesById: {},
      colorRgbById: {},
    };
  }

  const response = await fetch("/api/rebrickable/parts", {
    body: JSON.stringify({ partNumbers: requestedPartNumbers }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as
    | Partial<RebrickableCatalogFetchResult> & { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "Could not fetch Rebrickable catalog data.");
  }

  return {
    parts: payload?.parts ?? [],
    missingPartNumbers: payload?.missingPartNumbers ?? [],
    warnings: payload?.warnings ?? [],
    colorNamesById: payload?.colorNamesById ?? {},
    colorRgbById: payload?.colorRgbById ?? {},
  };
}

function createCatalogPartLookup(catalogParts: RebrickableCatalogPart[]) {
  const lookup = new Map<string, RebrickableCatalogPart>();

  catalogParts.forEach((catalogPart) => {
    [catalogPart.requestedPartNumber, catalogPart.partNumber].forEach((partNumber) => {
      lookup.set(partNumber, catalogPart);
    });
  });

  catalogParts.forEach((catalogPart) => {
    catalogPart.aliases.forEach((alias) => {
      if (!lookup.has(alias.partNumber)) {
        lookup.set(alias.partNumber, catalogPart);
      }
    });
  });

  return lookup;
}

function enrichCatalogPartWithCacheAliases(
  catalogPart: RebrickableCatalogPart,
  catalogCache: RebrickableCatalogCacheIndex,
): RebrickableCatalogPart {
  const aliases = collectCachedAliases(catalogPart, catalogCache);

  if (aliases.length === 0) {
    return catalogPart;
  }

  return {
    ...catalogPart,
    aliases: dedupeCatalogAliases([...catalogPart.aliases, ...aliases]),
  };
}

function collectCachedAliases(
  catalogPart: RebrickableCatalogPart,
  catalogCache: RebrickableCatalogCacheIndex,
) {
  const rootPartNumbers = [
    catalogPart.requestedPartNumber,
    catalogPart.partNumber,
    ...catalogPart.aliases.map((alias) => alias.partNumber),
  ];
  const normalizedRootPartNumberSet = new Set(
    rootPartNumbers.map(normalizePartNumber).filter(Boolean),
  );

  return [...normalizedRootPartNumberSet].flatMap((partNumber) =>
    readCachedAliases(partNumber, catalogCache),
  );
}

function createCatalogPartsFromCache(
  requestedPartNumber: string,
  catalogCache: RebrickableCatalogCacheIndex,
) {
  const normalizedPartNumber = normalizePartNumber(requestedPartNumber);
  const directCatalogPart = createDirectCatalogPartFromCache(
    normalizedPartNumber,
    catalogCache,
  );
  const aliasTargetCatalogParts = collectCacheLookupRoots(normalizedPartNumber)
    .flatMap((rootPartNumber) =>
      readCachedAliases(rootPartNumber, catalogCache).flatMap((alias) =>
        createAliasTargetCatalogPartFromCache(
          normalizedPartNumber,
          rootPartNumber,
          alias,
          catalogCache,
        ),
      ),
    );

  return mergeDuplicateCatalogParts([
    ...(directCatalogPart ? [directCatalogPart] : []),
    ...aliasTargetCatalogParts,
  ]);
}

function createDirectCatalogPartFromCache(
  requestedPartNumber: string,
  catalogCache: RebrickableCatalogCacheIndex,
) {
  const cachedPart = catalogCache.parts[requestedPartNumber];
  const aliases = readCachedAliases(requestedPartNumber, catalogCache);

  if (!cachedPart && aliases.length === 0) {
    return null;
  }

  return {
    requestedPartNumber,
    partNumber: requestedPartNumber,
    name: cachedPart?.name ?? null,
    partUrl: null,
    partImageUrl: null,
    aliases,
  };
}

function createAliasTargetCatalogPartFromCache(
  requestedPartNumber: string,
  lookupRootPartNumber: string,
  alias: RebrickableCatalogAlias,
  catalogCache: RebrickableCatalogCacheIndex,
) {
  const targetPartNumber = normalizePartNumber(alias.partNumber);
  const cachedPart = catalogCache.parts[targetPartNumber];

  if (!cachedPart) {
    return [];
  }

  return [
    {
      requestedPartNumber,
      partNumber: targetPartNumber,
      name: cachedPart.name,
      partUrl: null,
      partImageUrl: null,
      aliases: dedupeCatalogAliases([
        {
          partNumber: requestedPartNumber,
          kind: alias.kind,
          source: alias.source,
        },
        ...(lookupRootPartNumber !== requestedPartNumber
          ? [
              {
                partNumber: lookupRootPartNumber,
                kind: alias.kind,
                source: alias.source,
              },
            ]
          : []),
        ...readCachedAliases(targetPartNumber, catalogCache),
      ]),
    },
  ];
}

function collectCacheLookupRoots(partNumber: string) {
  const roots = new Set([partNumber]);
  const basePartNumber = partNumber.match(/^\d+/)?.[0] ?? null;

  if (basePartNumber && basePartNumber !== partNumber) {
    roots.add(basePartNumber);
  }

  return [...roots];
}

function readCachedAliases(
  partNumber: string,
  catalogCache: RebrickableCatalogCacheIndex,
) {
  return dedupeCatalogAliases(catalogCache.aliases[normalizePartNumber(partNumber)] ?? []);
}

function dedupeCatalogAliases(aliases: RebrickableCatalogAlias[]) {
  const seenAliases = new Set<string>();
  const dedupedAliases: RebrickableCatalogAlias[] = [];

  aliases.forEach((alias) => {
    const normalizedPartNumber = normalizePartNumber(alias.partNumber);

    if (!normalizedPartNumber) {
      return;
    }

    const key = `${normalizedPartNumber}:${alias.kind}:${alias.source}`;

    if (seenAliases.has(key)) {
      return;
    }

    seenAliases.add(key);
    dedupedAliases.push({ ...alias, partNumber: normalizedPartNumber });
  });

  return dedupedAliases;
}

function mergeDuplicateCatalogParts(catalogParts: RebrickableCatalogPart[]) {
  const catalogPartsByPartNumber = new Map<string, RebrickableCatalogPart>();

  catalogParts.forEach((catalogPart) => {
    const key = normalizePartNumber(catalogPart.partNumber);
    const existingPart = catalogPartsByPartNumber.get(key);

    if (!existingPart) {
      catalogPartsByPartNumber.set(key, catalogPart);
      return;
    }

    catalogPartsByPartNumber.set(key, {
      ...existingPart,
      name: existingPart.name ?? catalogPart.name,
      partUrl: existingPart.partUrl ?? catalogPart.partUrl,
      partImageUrl: existingPart.partImageUrl ?? catalogPart.partImageUrl,
      aliases: dedupeCatalogAliases([
        ...existingPart.aliases,
        ...catalogPart.aliases,
      ]),
    });
  });

  return [...catalogPartsByPartNumber.values()];
}

function createReturnedPartNumberSet(catalogParts: RebrickableCatalogPart[]) {
  return new Set(
    catalogParts.flatMap((part) => [
      part.requestedPartNumber,
      part.partNumber,
      ...part.aliases.map((alias) => alias.partNumber),
    ]),
  );
}

function readRawPartResults(payload: unknown): RawRebrickablePart[] {
  if (isRecord(payload) && Array.isArray(payload.results)) {
    return payload.results.filter(isRecord);
  }

  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (isRecord(payload)) {
    return [payload];
  }

  return [];
}

function collectCatalogAliases(rawPart: RawRebrickablePart) {
  const aliases: RebrickableCatalogAlias[] = [];

  addAliasValues(aliases, rawPart.rebrickable_part_ids, "canonical", "Rebrickable");
  addAliasValues(aliases, rawPart.rebrickable_part_id, "canonical", "Rebrickable");
  addAliasValues(aliases, rawPart.print_of, "print", "print_of");
  addExternalIdAliases(aliases, rawPart.external_ids ?? rawPart.external_part_ids);
  addRelationshipAliases(
    aliases,
    rawPart.relationships ??
      rawPart.related_parts ??
      rawPart.part_relationships ??
      rawPart.part_rels,
  );

  const partNumber = readString(rawPart.part_num ?? rawPart.part_id);
  const normalizedPartNumber = partNumber ? normalizePartNumber(partNumber) : null;
  const seenPartNumbers = new Set<string>();

  return aliases.filter((alias) => {
    if (!alias.partNumber || alias.partNumber === normalizedPartNumber) {
      return false;
    }

    if (seenPartNumbers.has(alias.partNumber)) {
      return false;
    }

    seenPartNumbers.add(alias.partNumber);
    return true;
  });
}

function addExternalIdAliases(
  aliases: RebrickableCatalogAlias[],
  externalIds: unknown,
) {
  if (!isRecord(externalIds)) {
    return;
  }

  Object.entries(externalIds).forEach(([source, value]) => {
    addAliasValues(aliases, value, "external", source);
  });
}

function addRelationshipAliases(
  aliases: RebrickableCatalogAlias[],
  relationships: unknown,
) {
  if (!Array.isArray(relationships)) {
    return;
  }

  relationships.filter(isRecord).forEach((relationship) => {
    const source =
      readString(
        relationship.rel_type ??
          relationship.type ??
          relationship.relationship ??
          relationship.description,
      ) ?? "relationship";

    addAliasValues(
      aliases,
      relationship.part_num ??
        relationship.part_id ??
        relationship.related_part_num ??
        relationship.related_part_id ??
        relationship.child_part_num ??
        relationship.parent_part_num,
      "relationship",
      source,
    );
  });
}

function addAliasValues(
  aliases: RebrickableCatalogAlias[],
  value: unknown,
  kind: RebrickableCatalogAliasKind,
  source: string,
) {
  readPartNumberValues(value).forEach((partNumber) => {
    aliases.push({ partNumber, kind, source });
  });
}

function readPartNumberValues(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number") {
    const normalizedValue = normalizePartNumber(String(value));

    return normalizedValue ? [normalizedValue] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(readPartNumberValues);
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    if (/^(?:ext_ids?|ids?|part_nums?|parts?)$/i.test(key)) {
      return readPartNumberValues(nestedValue);
    }

    if (/part(?:_|-)?(?:num|id)$/i.test(key)) {
      return readPartNumberValues(nestedValue);
    }

    return [];
  });
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
