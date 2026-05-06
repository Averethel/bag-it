import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("readCachedRebrickableElementImage", () => {
  let cacheDir: string;

  beforeEach(async () => {
    vi.resetModules();
    cacheDir = await mkdtemp(
      path.join(os.tmpdir(), "bag-it-rebrickable-image-cache-"),
    );
    vi.stubEnv("BAG_IT_REBRICKABLE_IMAGE_CACHE_DIR", cacheDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await rm(cacheDir, { force: true, recursive: true });
  });

  it("downloads an allowed element image once and caches the bytes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "Content-Type": "image/jpeg" },
        }),
      ),
    );
    const { readCachedRebrickableElementImage } = await import(
      "./rebrickable-image-cache"
    );

    const image = await readCachedRebrickableElementImage([
      "../not-safe",
      "300121",
    ]);

    expect(image?.contentType).toBe("image/jpeg");
    expect([...(image?.bytes ?? [])]).toEqual([1, 2, 3]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe(
      "https://cdn.rebrickable.com/media/parts/elements/300121.jpg",
    );
    expect([...(await readFile(path.join(cacheDir, "300121.jpg")))]).toEqual([
      1, 2, 3,
    ]);
  });

  it("serves an existing cached image without contacting Rebrickable", async () => {
    await writeFile(path.join(cacheDir, "300121.jpg"), new Uint8Array([4, 5, 6]));
    vi.stubGlobal("fetch", vi.fn());
    const { readCachedRebrickableElementImage } = await import(
      "./rebrickable-image-cache"
    );

    const image = await readCachedRebrickableElementImage(["300121"]);

    expect([...(image?.bytes ?? [])]).toEqual([4, 5, 6]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the default mutable image cache outside the project tree", async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(new Uint8Array([10, 11, 12]), {
          headers: { "Content-Type": "image/jpeg" },
        }),
      ),
    );
    const defaultCachePath = path.join(
      os.tmpdir(),
      "bag-it",
      "rebrickable-images",
      "elements",
      "bagitdefaultcachetest.jpg",
    );
    await rm(defaultCachePath, { force: true });
    const { readCachedRebrickableElementImage } = await import(
      "./rebrickable-image-cache"
    );

    await readCachedRebrickableElementImage(["bagitdefaultcachetest"]);

    expect([...(await readFile(defaultCachePath))]).toEqual([10, 11, 12]);
    await rm(defaultCachePath, { force: true });
  });

  it("treats a blank mutable image cache env var as unset", async () => {
    vi.stubEnv("BAG_IT_REBRICKABLE_IMAGE_CACHE_DIR", " ");
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(new Uint8Array([13, 14, 15]), {
          headers: { "Content-Type": "image/jpeg" },
        }),
      ),
    );
    const defaultCachePath = path.join(
      os.tmpdir(),
      "bag-it",
      "rebrickable-images",
      "elements",
      "bagitblankcachetest.jpg",
    );
    const cwdCachePath = path.join(process.cwd(), "bagitblankcachetest.jpg");
    await rm(defaultCachePath, { force: true });
    await rm(cwdCachePath, { force: true });
    const { readCachedRebrickableElementImage } = await import(
      "./rebrickable-image-cache"
    );

    await readCachedRebrickableElementImage(["bagitblankcachetest"]);

    expect([...(await readFile(defaultCachePath))]).toEqual([13, 14, 15]);
    await expect(readFile(cwdCachePath)).rejects.toThrow();
    await rm(defaultCachePath, { force: true });
  });

  it("backs off after a 403 instead of retrying the image CDN for every row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("blocked", { status: 403 })),
    );
    const { readCachedRebrickableElementImage } = await import(
      "./rebrickable-image-cache"
    );

    const firstImage = await readCachedRebrickableElementImage(["300121"]);
    const secondImage = await readCachedRebrickableElementImage(["300221"]);

    expect(firstImage).toBeNull();
    expect(secondImage).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not persist transient upstream failures as day-long misses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("temporary", { status: 502 })),
    );
    let imageCacheModule = await import("./rebrickable-image-cache");

    const firstImage =
      await imageCacheModule.readCachedRebrickableElementImage(["300121"]);

    expect(firstImage).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(new Uint8Array([7, 8, 9]), {
          headers: { "Content-Type": "image/jpeg" },
        }),
      ),
    );
    imageCacheModule = await import("./rebrickable-image-cache");

    const recoveredImage =
      await imageCacheModule.readCachedRebrickableElementImage(["300121"]);

    expect([...(recoveredImage?.bytes ?? [])]).toEqual([7, 8, 9]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("persists stable missing element responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 })),
    );
    let imageCacheModule = await import("./rebrickable-image-cache");

    const firstImage =
      await imageCacheModule.readCachedRebrickableElementImage(["300121"]);

    expect(firstImage).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
    imageCacheModule = await import("./rebrickable-image-cache");

    const secondImage =
      await imageCacheModule.readCachedRebrickableElementImage(["300121"]);

    expect(secondImage).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
