import { NextResponse } from "next/server";

import type { RebrickableCatalogCacheIndex } from "@/domain/rebrickable-catalog";
import { normalizePartNumber } from "@/domain/rebrickable-csv";
import { hasLDrawLibrary } from "@/server/ldraw-library";
import { readGeneratedRebrickableCatalogCache } from "@/server/rebrickable-catalog-cache";
import { readCachedRebrickableElementImage } from "@/server/rebrickable-image-cache";
import { renderLDrawPartSvg } from "@/server/ldraw-thumbnail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const neutralColorHex = "#A0A5A9";
const renderedPartImageCache = new Map<string, Promise<string | null>>();
const ldrawPartNumberSubstitutions: Record<string, string[]> = {
  "24126": ["2412b", "2412"],
  "25375": ["25375-f1", "25375-f2", "25375-f3"],
  "92338": ["92338-f1", "92338-f2"],
  "100728": ["30292a", "30292b", "30292"],
  "108721": ["30292a", "30292b", "30292"],
  "15744": ["33211"],
};

export async function GET(request: Request) {
  const imageRequest = readPartImageRequest(request);

  if (!imageRequest) {
    return NextResponse.json(
      { error: "A valid part number is required." },
      { status: 400 },
    );
  }

  const catalogCache = await readGeneratedRebrickableCatalogCache();
  const colorHex = readColorHex(imageRequest.colorId, catalogCache);
  const catalogPartNumberCandidates = createCatalogPartNumberCandidates(
    imageRequest.partNumber,
    catalogCache,
  );
  const rebrickableImage = imageRequest.useRebrickableCache
    ? await readRebrickableElementImage({
        catalogCache,
        colorId: imageRequest.colorId,
        partNumberCandidates: catalogPartNumberCandidates,
      })
    : null;

  if (rebrickableImage) {
    return new NextResponse(toArrayBuffer(rebrickableImage.bytes), {
      headers: {
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000",
        "Content-Type": rebrickableImage.contentType,
      },
      status: 200,
    });
  }

  const partNumberCandidates = createLDrawPartNumberCandidates(
    catalogPartNumberCandidates,
  );

  if (!(await hasLDrawLibrary())) {
    return NextResponse.json(
      {
        error:
          "LDraw part geometry library is not available. Run npm run ldraw:build or set LDRAW_LIBRARY_PATH before using local fallback thumbnails.",
      },
      { status: 404 },
    );
  }

  const svg = await renderCachedLDrawPartSvg({ colorHex, partNumberCandidates });

  if (!svg) {
    return NextResponse.json(
      { error: "LDraw part geometry was not found." },
      { status: 404 },
    );
  }

  return new NextResponse(svg, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "image/svg+xml",
    },
    status: 200,
  });
}

type PartImageRequest = {
  colorId: string | null;
  partNumber: string;
  useRebrickableCache: boolean;
};

function readPartImageRequest(request: Request): PartImageRequest | null {
  const searchParams = new URL(request.url).searchParams;
  const partNumber = normalizePartNumber(searchParams.get("partNumber") ?? "");
  const colorId = searchParams.get("colorId")?.trim() ?? null;
  const renderer = searchParams.get("renderer")?.trim() ?? null;
  const source = searchParams.get("source")?.trim() ?? null;

  if (!isSafePartNumber(partNumber)) {
    return null;
  }

  if (colorId !== null && !isSafeColorId(colorId)) {
    return null;
  }

  return {
    colorId,
    partNumber,
    useRebrickableCache:
      renderer !== "ldraw-v1" && source === "rebrickable-cache-v1",
  };
}

function isSafePartNumber(partNumber: string) {
  return /^[a-z0-9][a-z0-9._-]{0,79}$/.test(partNumber);
}

function isSafeColorId(colorId: string) {
  return /^\d{1,8}$/.test(colorId);
}

function createLDrawPartNumberCandidates(directCandidates: string[]) {
  return dedupeValues([
    ...directCandidates,
    ...directCandidates.flatMap(expandLDrawPartNumberCandidate),
  ]);
}

function createCatalogPartNumberCandidates(
  partNumber: string,
  catalogCache: RebrickableCatalogCacheIndex | null,
) {
  const aliases =
    catalogCache?.aliases[partNumber]?.map((alias) => alias.partNumber) ?? [];
  const printBasePartNumber = readPrintBasePartNumber(partNumber);

  return dedupeValues([
    partNumber,
    ...aliases,
    ...(printBasePartNumber ? [printBasePartNumber] : []),
  ]);
}

function readPrintBasePartNumber(partNumber: string) {
  const match = /^(?<basePartNumber>[a-z0-9]+)pr[a-z0-9]+$/.exec(partNumber);

  return match?.groups?.basePartNumber ?? null;
}

function expandLDrawPartNumberCandidate(partNumber: string): string[] {
  const baseVariantPartNumber = readLetterVariantBasePartNumber(partNumber);
  const directSubstitutions = ldrawPartNumberSubstitutions[partNumber] ?? [];
  const baseSubstitutions = baseVariantPartNumber
    ? (ldrawPartNumberSubstitutions[baseVariantPartNumber] ?? [])
    : [];

  return [
    partNumber,
    ...(baseVariantPartNumber ? [baseVariantPartNumber] : []),
    ...directSubstitutions,
    ...baseSubstitutions,
  ];
}

function readLetterVariantBasePartNumber(partNumber: string) {
  const match = /^(?<basePartNumber>\d{4,7})[a-z]$/.exec(partNumber);

  return match?.groups?.basePartNumber ?? null;
}

function readColorHex(
  colorId: string | null,
  catalogCache: RebrickableCatalogCacheIndex | null,
) {
  const colorRgb = colorId ? catalogCache?.colorRgbById[colorId] : null;
  const normalizedColorRgb = colorRgb?.trim().replace(/^#/, "").toUpperCase();

  return normalizedColorRgb && /^[0-9A-F]{6}$/.test(normalizedColorRgb)
    ? `#${normalizedColorRgb}`
    : neutralColorHex;
}

async function readRebrickableElementImage({
  catalogCache,
  colorId,
  partNumberCandidates,
}: {
  catalogCache: RebrickableCatalogCacheIndex | null;
  colorId: string | null;
  partNumberCandidates: string[];
}) {
  if (!catalogCache || !colorId) {
    return null;
  }

  const elementIds = dedupeValues(
    partNumberCandidates.flatMap(
      (partNumber) => catalogCache.elementIdsByPartColor[partNumber]?.[colorId] ?? [],
    ),
  );

  return elementIds.length > 0
    ? readCachedRebrickableElementImage(elementIds)
    : null;
}

function dedupeValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function toArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);

  return copy.buffer;
}

function renderCachedLDrawPartSvg({
  colorHex,
  partNumberCandidates,
}: {
  colorHex: string;
  partNumberCandidates: string[];
}) {
  const cacheKey = `${colorHex}:${partNumberCandidates.join("|")}`;
  const cachedSvg = renderedPartImageCache.get(cacheKey);

  if (cachedSvg) {
    return cachedSvg;
  }

  const svgPromise = renderLDrawPartSvg({ colorHex, partNumberCandidates }).catch(
    (error: unknown) => {
      renderedPartImageCache.delete(cacheKey);
      throw error;
    },
  );

  renderedPartImageCache.set(cacheKey, svgPromise);

  return svgPromise;
}
