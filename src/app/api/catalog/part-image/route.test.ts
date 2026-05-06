import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("GET /api/catalog/part-image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects URL passthrough requests", async () => {
    vi.stubEnv("REBRICKABLE_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn());

    const response = await GET(
      createPartImageRequest(
        "url=https%3A%2F%2Fcdn.rebrickable.com%2Fmedia%2Fparts%2F3001.jpg",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("A valid part number is required.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects unsafe part numbers before any catalog request", async () => {
    vi.stubEnv("REBRICKABLE_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn());

    const response = await GET(createPartImageRequest("partNumber=..%2F3001"));

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("looks up a provider image URL server-side from a part number", async () => {
    vi.stubEnv("REBRICKABLE_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            part_img_url:
              "https://cdn.rebrickable.com/media/parts/photos/15/3001.jpg",
          }),
        )
        .mockResolvedValueOnce(
          new Response("image-bytes", {
            headers: {
              "Content-Type": "image/png",
            },
            status: 200,
          }),
        ),
    );

    const response = await GET(createPartImageRequest("partNumber=3001"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe(
      "https://rebrickable.com/api/v3/lego/parts/3001/",
    );
    expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toBe(
      "https://cdn.rebrickable.com/media/parts/photos/15/3001.jpg",
    );
  });

  it("rejects catalog image URLs outside the allowed image CDN paths", async () => {
    vi.stubEnv("REBRICKABLE_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          part_img_url: "https://example.com/not-a-catalog-image.jpg",
        }),
      ),
    );

    const response = await GET(createPartImageRequest("partNumber=3002"));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Catalog image was not found.");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

function createPartImageRequest(query: string) {
  return new Request(`http://localhost/api/catalog/part-image?${query}`);
}
