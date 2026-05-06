import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createLDrawRelativeFilePaths,
  normalizeLDrawFileName,
  readLDrawFile,
} from "./ldraw-library";

const officialLDrawLibraryBaseUrl = "https://library.ldraw.org/library/official/";
const requestTimeoutMs = 10_000;
const maxLDrawFileBytes = 1_000_000;
const pendingRemoteReads = new Map<string, Promise<string | null>>();
const remoteMisses = new Set<string>();

type RemoteLDrawFetchResult =
  | { kind: "hit"; text: string }
  | { kind: "miss" }
  | { kind: "unavailable" };

export async function readLDrawFileWithRemoteFallback(fileName: string) {
  const localFile = await readLDrawFile(fileName);

  if (localFile) {
    return localFile;
  }

  const normalizedFileName = normalizeLDrawFileName(fileName);

  if (!normalizedFileName) {
    return null;
  }

  const pendingRead = pendingRemoteReads.get(normalizedFileName);

  if (pendingRead) {
    return pendingRead;
  }

  const readPromise = readRemoteLDrawFile(normalizedFileName).finally(() => {
    pendingRemoteReads.delete(normalizedFileName);
  });

  pendingRemoteReads.set(normalizedFileName, readPromise);

  return readPromise;
}

async function readRemoteLDrawFile(normalizedFileName: string) {
  if (remoteMisses.has(normalizedFileName)) {
    return null;
  }

  let hasUnavailableFetch = false;

  for (const relativePath of createLDrawRelativeFilePaths(normalizedFileName)) {
    const cachedFile = await readCachedRemoteLDrawFile(relativePath);

    if (cachedFile) {
      return cachedFile;
    }

    const remoteFile = await fetchOfficialLDrawFile(relativePath);

    if (remoteFile.kind === "hit") {
      await writeCachedRemoteLDrawFile(relativePath, remoteFile.text);
      return remoteFile.text;
    }

    if (remoteFile.kind === "unavailable") {
      hasUnavailableFetch = true;
    }
  }

  if (!hasUnavailableFetch) {
    remoteMisses.add(normalizedFileName);
  }

  return null;
}

async function readCachedRemoteLDrawFile(relativePath: string) {
  try {
    return await readFile(createRemoteCacheFilePath(relativePath), "utf8");
  } catch {
    return null;
  }
}

async function writeCachedRemoteLDrawFile(relativePath: string, text: string) {
  const cachePath = createRemoteCacheFilePath(relativePath);

  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, text, "utf8").catch(() => undefined);
}

async function fetchOfficialLDrawFile(
  relativePath: string,
): Promise<RemoteLDrawFetchResult> {
  const response = await fetch(createOfficialLDrawFileUrl(relativePath), {
    cache: "no-store",
    headers: {
      Accept: "text/plain, application/x-ldraw",
      "User-Agent": "bag-it on-demand ldraw thumbnail renderer",
    },
    signal: AbortSignal.timeout(requestTimeoutMs),
  }).catch(() => null);

  if (!response) {
    return { kind: "unavailable" };
  }

  if (response.status === 404 || response.status === 410) {
    return { kind: "miss" };
  }

  if (!response.ok) {
    return { kind: "unavailable" };
  }

  const text = await response.text();

  return text.length > 0 && text.length <= maxLDrawFileBytes
    ? { kind: "hit", text }
    : { kind: "unavailable" };
}

function createOfficialLDrawFileUrl(relativePath: string) {
  const encodedRelativePath = relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${officialLDrawLibraryBaseUrl}${encodedRelativePath}`;
}

function createRemoteCacheFilePath(relativePath: string) {
  return path.join(readRemoteCacheDir(), ...relativePath.split("/"));
}

function readRemoteCacheDir() {
  return path.resolve(
    readOptionalEnvPath("BAG_IT_LDRAW_REMOTE_CACHE_DIR") ??
      path.join(tmpdir(), "bag-it", "ldraw-remote-files", "official"),
  );
}

function readOptionalEnvPath(name: string) {
  const value = process.env[name]?.trim();

  return value ? value : null;
}
