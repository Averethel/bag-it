import { createHash } from "node:crypto";

import { get, put } from "@vercel/blob";

const cacheVersion = "v1";
const cachePrefix = `ldraw-thumbnails/${cacheVersion}`;
const cacheControlMaxAge = 365 * 24 * 60 * 60;

export function createLDrawPartSvgCachePath({
  colorHex,
  partNumberCandidates,
}: {
  colorHex: string;
  partNumberCandidates: string[];
}) {
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        colorHex: colorHex.toUpperCase(),
        partNumberCandidates,
      }),
    )
    .digest("hex");

  return `${cachePrefix}/${hash}.svg`;
}

export async function readCachedLDrawPartSvg(pathname: string) {
  if (!isBlobCacheConfigured()) {
    return null;
  }

  try {
    const blob = await get(pathname, { access: "private" });

    if (blob?.statusCode !== 200) {
      return null;
    }

    const svg = await new Response(blob.stream).text();

    return svg.trimStart().startsWith("<svg") ? svg : null;
  } catch {
    return null;
  }
}

export async function writeCachedLDrawPartSvg(pathname: string, svg: string) {
  if (!isBlobCacheConfigured()) {
    return;
  }

  await put(pathname, svg, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge,
    contentType: "image/svg+xml",
  }).catch(() => undefined);
}

function isBlobCacheConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}
