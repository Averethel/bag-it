import { NextResponse } from "next/server";

import { normalizePartNumber } from "@/domain/rebrickable-csv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const catalogPartsUrl = "https://rebrickable.com/api/v3/lego/parts/";
const allowedImageHosts = new Set(["cdn.rebrickable.com"]);
const allowedImagePathPrefixes = ["/media/parts/", "/media/thumbs/parts/"];
const partImageUrlCache = new Map<string, Promise<URL | null>>();
const catalogRequestTimeoutMs = 10_000;
const imageRequestTimeoutMs = 10_000;

export async function GET(request: Request) {
  const partNumber = readPartNumber(request);

  if (!partNumber) {
    return NextResponse.json(
      { error: "A valid part number is required." },
      { status: 400 },
    );
  }

  const apiKey = process.env.REBRICKABLE_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      { error: "Catalog image lookup is not configured." },
      { status: 503 },
    );
  }

  try {
    const imageUrl = await fetchPartImageUrl(partNumber, apiKey);

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Catalog image was not found." },
        { status: 404 },
      );
    }

    const response = await fetch(imageUrl, {
      cache: "force-cache",
      signal: AbortSignal.timeout(imageRequestTimeoutMs),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Catalog image request failed with HTTP ${response.status}.` },
        { status: 502 },
      );
    }

    const contentType = response.headers.get("content-type") ?? "image/jpeg";

    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "Catalog image lookup did not return an image." },
        { status: 502 },
      );
    }

    return new NextResponse(response.body, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": contentType,
      },
      status: 200,
    });
  } catch (error) {
    return NextResponse.json(
      { error: toCatalogImageErrorMessage(error) },
      { status: 502 },
    );
  }
}

function readPartNumber(request: Request) {
  const partNumber = normalizePartNumber(
    new URL(request.url).searchParams.get("partNumber") ?? "",
  );

  return isSafePartNumber(partNumber) ? partNumber : null;
}

function isSafePartNumber(partNumber: string) {
  return /^[a-z0-9][a-z0-9._-]{0,79}$/.test(partNumber);
}

function fetchPartImageUrl(partNumber: string, apiKey: string) {
  const cachedPartImageUrl = partImageUrlCache.get(partNumber);

  if (cachedPartImageUrl) {
    return cachedPartImageUrl;
  }

  const partImageUrlPromise = fetchPartImageUrlUncached(partNumber, apiKey).then(
    (imageUrl) => {
      if (imageUrl === null) {
        partImageUrlCache.delete(partNumber);
      }

      return imageUrl;
    },
    (error: unknown) => {
      partImageUrlCache.delete(partNumber);
      throw error;
    },
  );

  partImageUrlCache.set(partNumber, partImageUrlPromise);

  return partImageUrlPromise;
}

async function fetchPartImageUrlUncached(partNumber: string, apiKey: string) {
  const response = await fetch(createPartRequestUrl(partNumber), {
    cache: "no-store",
    headers: {
      Authorization: `key ${apiKey}`,
    },
    signal: AbortSignal.timeout(catalogRequestTimeoutMs),
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Catalog image lookup failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json().catch(() => null)) as {
    part_img_url?: unknown;
  } | null;

  return parseAllowedCatalogImageUrl(readString(payload?.part_img_url));
}

function createPartRequestUrl(partNumber: string) {
  return new URL(`${encodeURIComponent(partNumber)}/`, catalogPartsUrl);
}

function parseAllowedCatalogImageUrl(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      !allowedImageHosts.has(url.hostname) ||
      !allowedImagePathPrefixes.some((pathPrefix) =>
        url.pathname.startsWith(pathPrefix),
      )
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toCatalogImageErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "Catalog image request timed out.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Catalog image request failed.";
}
