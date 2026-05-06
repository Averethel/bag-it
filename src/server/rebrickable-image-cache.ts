import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export type CachedRebrickableElementImage = {
  bytes: Uint8Array;
  contentType: string;
  sourceUrl: string;
};

type CachedMiss = {
  checkedAt: string;
  status: number | null;
};

const rebrickableElementImageBaseUrl =
  "https://cdn.rebrickable.com/media/parts/elements/";
const requestTimeoutMs = 10_000;
const missCacheTtlMs = 24 * 60 * 60 * 1000;
const remoteBlockCooldownMs = 15 * 60 * 1000;
const remoteTransientCooldownMs = 2 * 60 * 1000;
const pendingImageReads = new Map<
  string,
  Promise<CachedRebrickableElementImage | null>
>();

let remoteFetchCooldownUntil = 0;

export async function readCachedRebrickableElementImage(elementIds: string[]) {
  for (const elementId of dedupeValues(elementIds).filter(isSafeElementId)) {
    const cachedImage = await readCachedRebrickableElementImageById(elementId);

    if (cachedImage) {
      return cachedImage;
    }
  }

  return null;
}

async function readCachedRebrickableElementImageById(
  elementId: string,
): Promise<CachedRebrickableElementImage | null> {
  const cachedRead = pendingImageReads.get(elementId);

  if (cachedRead) {
    return cachedRead;
  }

  const readPromise = readCachedRebrickableElementImageByIdUncached(elementId).finally(
    () => {
      pendingImageReads.delete(elementId);
    },
  );

  pendingImageReads.set(elementId, readPromise);

  return readPromise;
}

async function readCachedRebrickableElementImageByIdUncached(elementId: string) {
  const cachePath = readElementImageCachePath(elementId);
  const cachedBytes = await readCachedImageBytes(cachePath);

  if (cachedBytes) {
    return {
      bytes: cachedBytes,
      contentType: "image/jpeg",
      sourceUrl: createElementImageUrl(elementId),
    };
  }

  if (await hasFreshMissCache(elementId)) {
    return null;
  }

  if (Date.now() < remoteFetchCooldownUntil) {
    return null;
  }

  const remoteImage = await fetchRemoteElementImage(elementId);

  if (!remoteImage) {
    return null;
  }

  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, remoteImage.bytes).catch(() => undefined);

  return remoteImage;
}

async function readCachedImageBytes(cachePath: string) {
  try {
    return new Uint8Array(await readFile(cachePath));
  } catch {
    return null;
  }
}

async function fetchRemoteElementImage(elementId: string) {
  const sourceUrl = createElementImageUrl(elementId);

  try {
    const response = await fetch(sourceUrl, {
      cache: "no-store",
      headers: {
        Accept: "image/*",
        "User-Agent": "bag-it local catalog image cache",
      },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });

    if (!response.ok) {
      rememberTransientRemoteFailure(response.status);

      if (isPersistentMissStatus(response.status)) {
        await writeMissCache(elementId, response.status);
      }

      return null;
    }

    const contentType = response.headers.get("Content-Type") ?? "image/jpeg";

    if (!contentType.toLowerCase().startsWith("image/")) {
      return null;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    if (bytes.byteLength === 0) {
      return null;
    }

    return {
      bytes,
      contentType,
      sourceUrl,
    } satisfies CachedRebrickableElementImage;
  } catch {
    rememberTransientRemoteFailure(null);
    return null;
  }
}

function rememberTransientRemoteFailure(status: number | null) {
  if (status === 403 || status === 429) {
    remoteFetchCooldownUntil = Date.now() + remoteBlockCooldownMs;
    return;
  }

  if (status === null || status === 408 || status >= 500) {
    remoteFetchCooldownUntil = Date.now() + remoteTransientCooldownMs;
  }
}

function isPersistentMissStatus(status: number) {
  return status === 404 || status === 410;
}

async function hasFreshMissCache(elementId: string) {
  try {
    const miss = JSON.parse(
      await readFile(readElementImageMissCachePath(elementId), "utf8"),
    ) as CachedMiss;
    const checkedAtMs = Date.parse(miss.checkedAt);

    return Number.isFinite(checkedAtMs) && Date.now() - checkedAtMs < missCacheTtlMs;
  } catch {
    return false;
  }
}

async function writeMissCache(elementId: string, status: number | null) {
  const cachePath = readElementImageMissCachePath(elementId);

  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(
    cachePath,
    JSON.stringify({
      checkedAt: new Date().toISOString(),
      status,
    } satisfies CachedMiss),
  ).catch(() => undefined);
}

function readElementImageCachePath(elementId: string) {
  return path.join(readElementImageCacheDir(), `${elementId}.jpg`);
}

function readElementImageMissCachePath(elementId: string) {
  return path.join(readElementImageCacheDir(), `${elementId}.miss.json`);
}

function readElementImageCacheDir() {
  return path.resolve(
    readOptionalEnvPath("BAG_IT_REBRICKABLE_IMAGE_CACHE_DIR") ??
      path.join(tmpdir(), "bag-it", "rebrickable-images", "elements"),
  );
}

function createElementImageUrl(elementId: string) {
  return `${rebrickableElementImageBaseUrl}${encodeURIComponent(elementId)}.jpg`;
}

function isSafeElementId(elementId: string) {
  return /^[a-z0-9_-]{1,80}$/i.test(elementId);
}

function dedupeValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function readOptionalEnvPath(name: string) {
  const value = process.env[name]?.trim();

  return value ? value : null;
}
