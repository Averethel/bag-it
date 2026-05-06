import { get, put } from "@vercel/blob";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createLDrawPartSvgCachePath,
  readCachedLDrawPartSvg,
  writeCachedLDrawPartSvg,
} from "./ldraw-render-cache";

vi.mock("@vercel/blob", () => ({
  get: vi.fn(),
  put: vi.fn(),
}));

describe("LDraw rendered SVG cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates deterministic cache paths for part candidates and color", () => {
    const firstPath = createLDrawPartSvgCachePath({
      colorHex: "#ffffff",
      partNumberCandidates: ["3021", "3021a"],
    });
    const secondPath = createLDrawPartSvgCachePath({
      colorHex: "#FFFFFF",
      partNumberCandidates: ["3021", "3021a"],
    });

    expect(firstPath).toBe(secondPath);
    expect(firstPath).toMatch(/^ldraw-thumbnails\/v1\/[a-f0-9]{64}\.svg$/);
  });

  it("skips Blob reads and writes when no token is configured", async () => {
    await expect(readCachedLDrawPartSvg("ldraw-thumbnails/v1/test.svg")).resolves.toBe(
      null,
    );
    await writeCachedLDrawPartSvg("ldraw-thumbnails/v1/test.svg", "<svg />");

    expect(get).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("reads a private SVG blob when Blob storage is configured", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
    vi.mocked(get).mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("<svg>cached</svg>"));
          controller.close();
        },
      }),
    } as Awaited<ReturnType<typeof get>>);

    await expect(
      readCachedLDrawPartSvg("ldraw-thumbnails/v1/test.svg"),
    ).resolves.toBe("<svg>cached</svg>");
    expect(get).toHaveBeenCalledWith("ldraw-thumbnails/v1/test.svg", {
      access: "private",
    });
  });

  it("writes rendered SVG blobs when Blob storage is configured", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
    vi.mocked(put).mockResolvedValue({} as Awaited<ReturnType<typeof put>>);

    await writeCachedLDrawPartSvg("ldraw-thumbnails/v1/test.svg", "<svg />");

    expect(put).toHaveBeenCalledWith("ldraw-thumbnails/v1/test.svg", "<svg />", {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 31_536_000,
      contentType: "image/svg+xml",
    });
  });
});
