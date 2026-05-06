import { createWriteStream } from "node:fs";
import { access, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const completeZipUrl = "https://library.ldraw.org/library/updates/complete.zip";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configuredLibraryPath = readOptionalEnvPath("LDRAW_LIBRARY_PATH");
const cacheRoot = readLDrawCacheRoot();
const zipPath = path.join(cacheRoot, "complete.zip");
const extractPath = path.join(cacheRoot, "library");
const shouldRefresh = process.argv.includes("--refresh");

await mkdir(cacheRoot, { recursive: true });

if (configuredLibraryPath) {
  const resolvedLibraryPath = path.resolve(configuredLibraryPath);

  if (await hasLDrawLibrary(createLDrawRootPaths(resolvedLibraryPath))) {
    await rm(zipPath, { force: true });
    console.log(
      `LDraw library ready at ${path.relative(repoRoot, resolvedLibraryPath)}`,
    );
  } else {
    throw new Error(
      "LDRAW_LIBRARY_PATH does not contain an extracted LDraw library. Unset LDRAW_LIBRARY_PATH so this script can manage a cache, or set BAG_IT_LDRAW_CACHE_DIR to choose the managed cache directory.",
    );
  }
} else if (
  !shouldRefresh &&
  (await hasLDrawLibrary(createLDrawRootPaths(extractPath)))
) {
  await rm(zipPath, { force: true });
  console.log(`LDraw library ready at ${path.relative(repoRoot, extractPath)}`);
} else {
  await downloadCompleteZip();
  await rm(extractPath, { force: true, recursive: true });
  await mkdir(extractPath, { recursive: true });
  await execFileAsync("unzip", ["-q", zipPath, "-d", extractPath], {
    cwd: repoRoot,
  });

  await rm(zipPath, { force: true });
  console.log(`LDraw library ready at ${path.relative(repoRoot, extractPath)}`);
}

async function hasLDrawLibrary(rootPaths) {
  for (const rootPath of rootPaths) {
    try {
      await access(path.join(rootPath, "parts"));
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

async function downloadCompleteZip() {
  const response = await fetch(completeZipUrl);

  if (!response.ok || !response.body) {
    throw new Error(`Could not download LDraw complete.zip: HTTP ${response.status}`);
  }

  await pipeline(response.body, createWriteStream(zipPath));
}

function readLDrawCacheRoot() {
  return path.resolve(
    readOptionalEnvPath("BAG_IT_LDRAW_CACHE_DIR") ??
      path.join(tmpdir(), "bag-it", "ldraw"),
  );
}

function createLDrawRootPaths(libraryPath) {
  return [libraryPath, path.join(libraryPath, "ldraw")];
}

function readOptionalEnvPath(name) {
  const value = process.env[name]?.trim();

  return value ? value : null;
}
