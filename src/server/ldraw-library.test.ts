import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hasLDrawLibrary, readLDrawFile } from "./ldraw-library";

describe("LDraw library reader", () => {
  let cacheRoot: string;

  beforeEach(async () => {
    cacheRoot = await mkdtemp(path.join(tmpdir(), "bag-it-ldraw-library-"));
    vi.stubEnv("BAG_IT_LDRAW_CACHE_DIR", cacheRoot);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(cacheRoot, { force: true, recursive: true });
  });

  it("uses BAG_IT_LDRAW_CACHE_DIR for build and runtime cache alignment", async () => {
    const partsDir = path.join(cacheRoot, "library", "ldraw", "parts");
    await mkdir(partsDir, { recursive: true });
    await writeFile(path.join(partsDir, "3001.dat"), "0 Brick 2 x 4", "utf8");

    await expect(hasLDrawLibrary()).resolves.toBe(true);
    await expect(readLDrawFile("3001.dat")).resolves.toBe("0 Brick 2 x 4");
  });

  it("treats blank LDraw path env vars as unset", async () => {
    vi.stubEnv("BAG_IT_LDRAW_CACHE_DIR", " ");
    vi.stubEnv("LDRAW_LIBRARY_PATH", "");
    const originalCwd = process.cwd();
    const tempCwd = await mkdtemp(path.join(tmpdir(), "bag-it-blank-ldraw-cwd-"));
    const cwdLibraryRoot = path.join(tempCwd, "library");
    const cwdPartsDir = path.join(cwdLibraryRoot, "parts");
    await mkdir(cwdPartsDir, { recursive: true });
    await writeFile(
      path.join(cwdPartsDir, "blank-env-test.dat"),
      "0 Wrong library",
      "utf8",
    );

    try {
      process.chdir(tempCwd);
      await expect(readLDrawFile("blank-env-test.dat")).resolves.toBeNull();
    } finally {
      process.chdir(originalCwd);
      await rm(tempCwd, { force: true, recursive: true });
    }
  });
});
