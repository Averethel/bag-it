import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("readLDrawFileWithRemoteFallback", () => {
  let localCacheDir: string;
  let remoteCacheDir: string;

  beforeEach(async () => {
    vi.resetModules();
    localCacheDir = await mkdtemp(path.join(tmpdir(), "bag-it-empty-ldraw-"));
    remoteCacheDir = await mkdtemp(path.join(tmpdir(), "bag-it-remote-ldraw-"));
    vi.stubEnv("BAG_IT_LDRAW_CACHE_DIR", localCacheDir);
    vi.stubEnv("BAG_IT_LDRAW_REMOTE_CACHE_DIR", remoteCacheDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await rm(localCacheDir, { force: true, recursive: true });
    await rm(remoteCacheDir, { force: true, recursive: true });
  });

  it("fetches one official LDraw part file and caches it locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("0 Remote Part", { status: 200 })),
    );
    const { readLDrawFileWithRemoteFallback } = await import(
      "./ldraw-remote-library"
    );

    const firstRead =
      await readLDrawFileWithRemoteFallback("remote-cache-test.dat");

    expect(firstRead).toBe("0 Remote Part");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe(
      "https://library.ldraw.org/library/official/parts/remote-cache-test.dat",
    );
    await expect(
      readFile(
        path.join(remoteCacheDir, "parts", "remote-cache-test.dat"),
        "utf8",
      ),
    ).resolves.toBe("0 Remote Part");

    vi.mocked(fetch).mockClear();

    const secondRead =
      await readLDrawFileWithRemoteFallback("remote-cache-test.dat");

    expect(secondRead).toBe("0 Remote Part");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("tries primitive paths when the parts path is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        String(url).endsWith("/p/stud.dat")
          ? new Response("0 Primitive Stud", { status: 200 })
          : new Response("missing", { status: 404 }),
      ),
    );
    const { readLDrawFileWithRemoteFallback } = await import(
      "./ldraw-remote-library"
    );

    const file = await readLDrawFileWithRemoteFallback("stud.dat");

    expect(file).toBe("0 Primitive Stud");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe(
      "https://library.ldraw.org/library/official/parts/stud.dat",
    );
    expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toBe(
      "https://library.ldraw.org/library/official/p/stud.dat",
    );
  });

  it("can feed fetched geometry into the LDraw thumbnail renderer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          [
            "0 Remote Render Part",
            "4 16 -20 0 -20 20 0 -20 20 0 20 -20 0 20",
          ].join("\n"),
          { status: 200 },
        ),
      ),
    );
    const [{ readLDrawFileWithRemoteFallback }, { renderLDrawPartSvg }] =
      await Promise.all([
        import("./ldraw-remote-library"),
        import("./ldraw-thumbnail"),
      ]);

    const svg = await renderLDrawPartSvg({
      colorHex: "#C91A09",
      partNumberCandidates: ["remote-render-test"],
      readLDrawFile: readLDrawFileWithRemoteFallback,
    });

    expect(svg).toContain("<svg");
    expect(svg).toContain('data-ldraw-part="remote-render-test"');
  });

  it("rejects unsafe file names before remote lookup", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { readLDrawFileWithRemoteFallback } = await import(
      "./ldraw-remote-library"
    );

    const file = await readLDrawFileWithRemoteFallback("../3001.dat");

    expect(file).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not cache transient remote failures as permanent misses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("temporary", { status: 503 })),
    );
    const { readLDrawFileWithRemoteFallback } = await import(
      "./ldraw-remote-library"
    );

    await expect(
      readLDrawFileWithRemoteFallback("temporary-failure.dat"),
    ).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("0 Recovered Part", { status: 200 })),
    );

    await expect(
      readLDrawFileWithRemoteFallback("temporary-failure.dat"),
    ).resolves.toBe("0 Recovered Part");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
