import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const schemaVersion = 3;
const freshnessWindowMs = 24 * 60 * 60 * 1000;
const cacheDir = path.join(process.cwd(), ".cache", "rebrickable-catalog");
const outputPath = path.join(cacheDir, "catalog-index.json");
const tempOutputPath = path.join(cacheDir, "catalog-index.json.tmp");
const requireCatalogCache = process.argv.includes("--required");
const allowMissingCatalogCache =
  process.argv.includes("--optional") && !requireCatalogCache;

const sources = {
  colors: {
    fileName: "colors.csv.gz",
    url: "https://cdn.rebrickable.com/media/downloads/colors.csv.gz",
  },
  parts: {
    fileName: "parts.csv.gz",
    url: "https://cdn.rebrickable.com/media/downloads/parts.csv.gz",
  },
  partRelationships: {
    fileName: "part_relationships.csv.gz",
    url: "https://cdn.rebrickable.com/media/downloads/part_relationships.csv.gz",
  },
};

const relationshipAliasPolicy = {
  A: "bidirectional",
  M: "bidirectional",
  P: "child-to-parent",
};

async function main() {
  const existingIndex = await readExistingIndex();

  if (isFresh(existingIndex)) {
    log(
      `Using fresh Rebrickable catalogue cache generated at ${existingIndex.generatedAt}.`,
    );
    return;
  }

  const remoteMetadata = await readRemoteMetadata(existingIndex);

  if (canReuseExistingIndex(existingIndex, remoteMetadata)) {
    log("Using existing Rebrickable catalogue cache; upstream sources are unchanged.");
    return;
  }

  log("Downloading Rebrickable catalogue CSV files.");

  let colorsSource;
  let partsSource;
  let relationshipsSource;

  try {
    [colorsSource, partsSource, relationshipsSource] = await Promise.all([
      downloadSource("colors", sources.colors.url),
      downloadSource("parts", sources.parts.url),
      downloadSource("partRelationships", sources.partRelationships.url),
    ]);
  } catch (error) {
    if (existingIndex) {
      log(`Using stale Rebrickable catalogue cache. ${toErrorMessage(error)}`);
      return;
    }

    if (allowMissingCatalogCache) {
      log(
        `Could not generate Rebrickable catalogue cache; continuing without it. ${toErrorMessage(error)}`,
      );
      return;
    }

    throw error;
  }

  log("Building Rebrickable color index.");
  const colors = buildColorsIndex(colorsSource.text);

  log("Building Rebrickable part metadata index.");
  const parts = buildPartsIndex(partsSource.text);

  log("Building Rebrickable relationship alias index.");
  const aliases = buildRelationshipAliasIndex(relationshipsSource.text);

  const index = {
    schemaVersion,
    generatedAt: new Date().toISOString(),
    checkedAt: new Date().toISOString(),
    sources: {
      colors: {
        ...sources.colors,
        ...colorsSource.metadata,
        rowCount: Object.keys(colors.namesById).length,
      },
      parts: {
        ...sources.parts,
        ...partsSource.metadata,
        rowCount: Object.keys(parts).length,
      },
      partRelationships: {
        ...sources.partRelationships,
        ...relationshipsSource.metadata,
        rowCount: countDataRows(relationshipsSource.text),
      },
    },
    colors: colors.namesById,
    colorRgbById: colors.rgbById,
    parts,
    aliases,
  };

  await mkdir(cacheDir, { recursive: true });
  await writeFile(tempOutputPath, `${JSON.stringify(index)}\n`, "utf8");
  await rename(tempOutputPath, outputPath);

  log(
    `Wrote ${path.relative(process.cwd(), outputPath)} with ${Object.keys(colors.namesById).length} colors, ${Object.keys(parts).length} parts, and ${Object.keys(aliases).length} alias roots.`,
  );
}

async function readExistingIndex() {
  try {
    const rawJson = await readFile(outputPath, "utf8");
    const parsed = JSON.parse(rawJson);

    return parsed?.schemaVersion === schemaVersion ? parsed : null;
  } catch {
    return null;
  }
}

function isFresh(index) {
  if (!index?.generatedAt) {
    return false;
  }

  const generatedAt = new Date(index.generatedAt).getTime();

  return Number.isFinite(generatedAt) && Date.now() - generatedAt < freshnessWindowMs;
}

async function readRemoteMetadata(existingIndex) {
  const entries = await Promise.all(
    Object.entries(sources).map(async ([key, source]) => {
      try {
        const response = await fetch(source.url, { method: "HEAD" });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return [
          key,
          {
            etag: response.headers.get("etag"),
            lastModified: response.headers.get("last-modified"),
            contentLength: response.headers.get("content-length"),
          },
        ];
      } catch (error) {
        if (existingIndex || allowMissingCatalogCache) {
          log(
            `Could not validate ${source.fileName}; will try to download it next. ${toErrorMessage(error)}`,
          );
          return [key, null];
        }

        throw error;
      }
    }),
  );

  return Object.fromEntries(entries);
}

function canReuseExistingIndex(existingIndex, remoteMetadata) {
  if (!existingIndex) {
    return false;
  }

  return Object.entries(sources).every(([key]) => {
    const existingSource = existingIndex.sources?.[key];
    const remoteSource = remoteMetadata[key];

    if (!existingSource || !remoteSource) {
      return false;
    }

    return (
      existingSource.etag === remoteSource.etag &&
      existingSource.lastModified === remoteSource.lastModified &&
      existingSource.contentLength === remoteSource.contentLength
    );
  });
}

async function downloadSource(key, url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not download ${sources[key].fileName}: HTTP ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const text = gunzipSync(bytes).toString("utf8");

  return {
    text,
    metadata: {
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      contentLength: response.headers.get("content-length"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

function buildColorsIndex(csvText) {
  const namesById = {};
  const rgbById = {};
  const rows = parseCsvRows(csvText);
  const headers = createHeaderLookup(rows.shift() ?? []);

  const idIndex = headers.get("id");
  const nameIndex = headers.get("name");
  const rgbIndex = headers.get("rgb");

  if (idIndex === undefined || nameIndex === undefined) {
    throw new Error("colors.csv is missing required id or name columns.");
  }

  rows.forEach((row) => {
    const colorId = (row[idIndex] ?? "").trim();
    const colorName = normalizeNullableString(row[nameIndex] ?? "");

    if (!colorId || !colorName) {
      return;
    }

    namesById[colorId] = colorName;

    const colorRgb =
      rgbIndex !== undefined ? normalizeRgbHex(row[rgbIndex] ?? "") : null;

    if (colorRgb) {
      rgbById[colorId] = colorRgb;
    }
  });

  return { namesById, rgbById };
}

function buildPartsIndex(csvText) {
  const parts = {};
  const rows = parseCsvRows(csvText);
  const headers = createHeaderLookup(rows.shift() ?? []);

  const partNumberIndex = headers.get("part_num");
  const nameIndex = headers.get("name");
  const categoryIndex = headers.get("part_cat_id");
  const materialIndex = headers.get("part_material");

  if (partNumberIndex === undefined || nameIndex === undefined) {
    throw new Error("parts.csv is missing required part_num or name columns.");
  }

  rows.forEach((row) => {
    const partNumber = normalizePartNumber(row[partNumberIndex] ?? "");

    if (!partNumber) {
      return;
    }

    parts[partNumber] = {
      name: normalizeNullableString(row[nameIndex] ?? ""),
      categoryId:
        categoryIndex === undefined
          ? null
          : normalizeNullableString(row[categoryIndex] ?? ""),
      material:
        materialIndex === undefined
          ? null
          : normalizeNullableString(row[materialIndex] ?? ""),
    };
  });

  return parts;
}

function buildRelationshipAliasIndex(csvText) {
  const aliases = new Map();
  const rows = parseCsvRows(csvText);
  const headers = createHeaderLookup(rows.shift() ?? []);

  const relationshipTypeIndex = headers.get("rel_type");
  const childPartIndex = headers.get("child_part_num");
  const parentPartIndex = headers.get("parent_part_num");

  if (
    relationshipTypeIndex === undefined ||
    childPartIndex === undefined ||
    parentPartIndex === undefined
  ) {
    throw new Error(
      "part_relationships.csv is missing rel_type, child_part_num, or parent_part_num columns.",
    );
  }

  rows.forEach((row) => {
    const relationshipType = (row[relationshipTypeIndex] ?? "").trim().toUpperCase();
    const childPartNumber = normalizePartNumber(row[childPartIndex] ?? "");
    const parentPartNumber = normalizePartNumber(row[parentPartIndex] ?? "");
    const policy = relationshipAliasPolicy[relationshipType];

    if (!policy || !childPartNumber || !parentPartNumber) {
      return;
    }

    addAlias(aliases, childPartNumber, parentPartNumber, relationshipType);

    if (policy === "bidirectional") {
      addAlias(aliases, parentPartNumber, childPartNumber, relationshipType);
    }
  });

  return Object.fromEntries(
    [...aliases.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([partNumber, partAliases]) => [
        partNumber,
        partAliases.sort((left, right) =>
          left.partNumber.localeCompare(right.partNumber),
        ),
      ]),
  );
}

function addAlias(aliases, sourcePartNumber, aliasPartNumber, relationshipType) {
  const partAliases = aliases.get(sourcePartNumber) ?? [];

  if (
    sourcePartNumber === aliasPartNumber ||
    partAliases.some((alias) => alias.partNumber === aliasPartNumber)
  ) {
    return;
  }

  partAliases.push({
    partNumber: aliasPartNumber,
    kind: relationshipType === "P" ? "print" : "relationship",
    source: relationshipType,
  });
  aliases.set(sourcePartNumber, partAliases);
}

function countDataRows(csvText) {
  return Math.max(0, parseCsvRows(csvText).length - 1);
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (inQuotes) {
      if (character === "\"" && nextCharacter === "\"") {
        cell += "\"";
        index += 1;
      } else if (character === "\"") {
        inQuotes = false;
      } else {
        cell += character;
      }

      continue;
    }

    if (character === "\"") {
      inQuotes = true;
      continue;
    }

    if (character === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (character === "\n") {
      row.push(stripCarriageReturn(cell));
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  if (cell || row.length > 0) {
    row.push(stripCarriageReturn(cell));
    rows.push(row);
  }

  return rows.filter((candidateRow) =>
    candidateRow.some((candidateCell) => candidateCell.trim()),
  );
}

function createHeaderLookup(headers) {
  const lookup = new Map();

  headers.forEach((header, index) => {
    lookup.set(header.trim(), index);
  });

  return lookup;
}

function normalizePartNumber(partNumber) {
  return partNumber.trim().toLowerCase();
}

function normalizeNullableString(value) {
  const trimmedValue = value.trim();

  return trimmedValue ? trimmedValue : null;
}

function normalizeRgbHex(value) {
  const normalizedValue = value.trim().replace(/^#/, "").toUpperCase();

  return /^[0-9A-F]{6}$/.test(normalizedValue) ? normalizedValue : null;
}

function stripCarriageReturn(value) {
  return value.endsWith("\r") ? value.slice(0, -1) : value;
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : "unknown error";
}

function log(message) {
  console.log(`[rebrickable-catalog] ${message}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
