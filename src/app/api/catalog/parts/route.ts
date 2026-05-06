import { NextResponse } from "next/server";

import {
  enrichRebrickablePartsWithCatalogCache,
  normalizeRebrickablePartsResponse,
  type RebrickableCatalogFetchResult,
} from "@/domain/rebrickable-catalog";
import { normalizePartNumber } from "@/domain/rebrickable-csv";
import { readGeneratedRebrickableCatalogCache } from "@/server/rebrickable-catalog-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const catalogPartsUrl = "https://rebrickable.com/api/v3/lego/parts/";
const maxRequestedPartNumbers = 1_000;
const requestTimeoutMs = 15_000;

export async function POST(request: Request) {
  const { isOverLimit, partNumbers } = await readPartNumbers(request);

  if (isOverLimit) {
    return NextResponse.json(
      { error: `Cannot fetch more than ${maxRequestedPartNumbers} parts at once.` },
      { status: 400 },
    );
  }

  if (partNumbers.length === 0) {
    return NextResponse.json(createEmptyCatalogFetchResult());
  }

  const catalogCachePromise = readGeneratedRebrickableCatalogCache();
  const apiKey = process.env.REBRICKABLE_API_KEY?.trim();

  if (!apiKey) {
    const catalogCache = await catalogCachePromise;

    if (catalogCache) {
      return NextResponse.json(
        withLocalPartImageRoutes(
          enrichRebrickablePartsWithCatalogCache(
            createEmptyCatalogFetchResult(),
            partNumbers,
            catalogCache,
          ),
        ),
      );
    }

    return NextResponse.json(
      { error: "Catalog API key is not configured." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(createPartsRequestUrl(partNumbers), {
      cache: "no-store",
      headers: {
        Authorization: `key ${apiKey}`,
      },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Catalog request failed with HTTP ${response.status}.`,
        },
        { status: 502 },
      );
    }

    const [payload, catalogCache] = await Promise.all([
      response.json() as Promise<unknown>,
      catalogCachePromise,
    ]);
    const normalizedResult = normalizeRebrickablePartsResponse(partNumbers, payload);

    return NextResponse.json(
      withLocalPartImageRoutes(
        enrichRebrickablePartsWithCatalogCache(
          normalizedResult,
          partNumbers,
          catalogCache,
        ),
      ),
    );
  } catch (error) {
    return NextResponse.json(
      { error: toCatalogErrorMessage(error) },
      { status: 502 },
    );
  }
}

async function readPartNumbers(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    partNumbers?: unknown;
  } | null;

  if (!Array.isArray(body?.partNumbers)) {
    return { isOverLimit: false, partNumbers: [] };
  }

  const partNumbers = [
    ...new Set(body.partNumbers.flatMap(readPartNumberValue)),
  ].sort();

  return {
    isOverLimit: partNumbers.length > maxRequestedPartNumbers,
    partNumbers,
  };
}

function readPartNumberValue(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return [];
  }

  const partNumber = normalizePartNumber(String(value));

  return partNumber ? [partNumber] : [];
}

function createPartsRequestUrl(partNumbers: string[]) {
  const url = new URL(catalogPartsUrl);

  url.searchParams.set("part_nums", partNumbers.join(","));
  url.searchParams.set("inc_part_details", "1");
  url.searchParams.set("inc_color_details", "0");
  url.searchParams.set("page_size", String(Math.max(100, partNumbers.length)));

  return url;
}

function createEmptyCatalogFetchResult(): RebrickableCatalogFetchResult {
  return {
    parts: [],
    missingPartNumbers: [],
    warnings: [],
    colorNamesById: {},
    colorRgbById: {},
  };
}

function withLocalPartImageRoutes(
  result: RebrickableCatalogFetchResult,
): RebrickableCatalogFetchResult {
  return {
    ...result,
    parts: result.parts.map((part) =>
      part.partImageUrl
        ? {
            ...part,
            partImageUrl: `/api/catalog/part-image?partNumber=${encodeURIComponent(part.partNumber)}`,
          }
        : part,
    ),
  };
}

function toCatalogErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "Catalog request timed out.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Catalog request failed.";
}
