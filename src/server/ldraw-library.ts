import { access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const defaultLDrawCachePath = path.join(tmpdir(), "bag-it", "ldraw");

export async function readLDrawFile(fileName: string) {
  const normalizedFileName = normalizeLDrawFileName(fileName);

  if (!normalizedFileName) {
    return null;
  }

  const searchPaths = createLDrawSearchPaths(normalizedFileName);

  for (const searchPath of searchPaths) {
    try {
      return await readFile(searchPath, "utf8");
    } catch {
      continue;
    }
  }

  return null;
}

export async function hasLDrawLibrary() {
  for (const rootPath of createLDrawRootPaths()) {
    try {
      await access(path.join(rootPath, "parts"));
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

function createLDrawSearchPaths(fileName: string) {
  const rootPaths = createLDrawRootPaths();
  const relativePaths = createLDrawRelativeFilePaths(fileName);

  return rootPaths.flatMap((rootPath) =>
    relativePaths.map((relativePath) => path.join(rootPath, relativePath)),
  );
}

export function createLDrawRelativeFilePaths(fileName: string) {
  return fileName.startsWith("parts/") || fileName.startsWith("p/")
    ? [fileName]
    : [`parts/${fileName}`, `p/${fileName}`];
}

function createLDrawRootPaths() {
  const configuredLibraryPath = readOptionalEnvPath("LDRAW_LIBRARY_PATH");

  if (configuredLibraryPath) {
    const resolvedLibraryPath = path.resolve(configuredLibraryPath);

    return [resolvedLibraryPath, path.join(resolvedLibraryPath, "ldraw")];
  }

  const libraryPath = path.join(readLDrawCachePath(), "library");

  return [libraryPath, path.join(libraryPath, "ldraw")];
}

function readLDrawCachePath() {
  return path.resolve(
    readOptionalEnvPath("BAG_IT_LDRAW_CACHE_DIR") ?? defaultLDrawCachePath,
  );
}

function readOptionalEnvPath(name: string) {
  const value = process.env[name]?.trim();

  return value ? value : null;
}

export function normalizeLDrawFileName(fileName: string) {
  const normalizedFileName = fileName
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .toLowerCase()
    .trim();

  if (
    !normalizedFileName ||
    path.isAbsolute(normalizedFileName) ||
    normalizedFileName.split("/").some((segment) => segment === "..")
  ) {
    return null;
  }

  return normalizedFileName;
}
