import { NextResponse } from "next/server";

import {
  enrichRebrickablePartsWithCatalogCache,
  normalizeRebrickablePartsResponse,
} from "@/domain/rebrickable-catalog";
import { normalizePartNumber } from "@/domain/rebrickable-csv";
import { readGeneratedRebrickableCatalogCache } from "@/server/rebrickable-catalog-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const rebrickablePartsUrl = "https://rebrickable.com/api/v3/lego/parts/";
const maxRequestedPartNumbers = 1_000;
const requestTimeoutMs = 15_000;

export async function POST(request: Request) {
  const apiKey = process.env.REBRICKABLE_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      { error: "REBRICKABLE_API_KEY is not configured." },
      { status: 503 },
    );
  }

  const partNumbers = await readPartNumbers(request);

  if (partNumbers.length === 0) {
    return NextResponse.json({
      parts: [],
      missingPartNumbers: [],
      warnings: [],
      colorNamesById: {},
      colorRgbById: {},
    });
  }

  if (partNumbers.length > maxRequestedPartNumbers) {
    return NextResponse.json(
      { error: `Cannot fetch more than ${maxRequestedPartNumbers} parts at once.` },
      { status: 400 },
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
          error: `Rebrickable catalog request failed with HTTP ${response.status}.`,
        },
        { status: 502 },
      );
    }

    const [payload, catalogCache] = await Promise.all([
      response.json() as Promise<unknown>,
      readGeneratedRebrickableCatalogCache(),
    ]);
    const normalizedResult = normalizeRebrickablePartsResponse(partNumbers, payload);

    return NextResponse.json(
      enrichRebrickablePartsWithCatalogCache(
        normalizedResult,
        partNumbers,
        catalogCache,
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
    return [];
  }

  return [...new Set(body.partNumbers.flatMap(readPartNumberValue))]
    .slice(0, maxRequestedPartNumbers)
    .sort();
}

function readPartNumberValue(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return [];
  }

  const partNumber = normalizePartNumber(String(value));

  return partNumber ? [partNumber] : [];
}

function createPartsRequestUrl(partNumbers: string[]) {
  const url = new URL(rebrickablePartsUrl);

  url.searchParams.set("part_nums", partNumbers.join(","));
  url.searchParams.set("inc_part_details", "1");
  url.searchParams.set("inc_color_details", "0");
  url.searchParams.set("page_size", String(Math.max(100, partNumbers.length)));

  return url;
}

function toCatalogErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "Rebrickable catalog request timed out.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Rebrickable catalog request failed.";
}
