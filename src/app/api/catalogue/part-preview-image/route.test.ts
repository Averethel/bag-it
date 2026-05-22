import { afterEach, describe, expect, it, vi } from "vitest"
import type { NextRequest } from "next/server"

describe("/api/catalogue/part-preview-image", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("proxies allowed Rebrickable preview images as same-origin image responses", async () => {
    const imageBytes = new Uint8Array([1, 2, 3, 4])
    const fetchMock = vi.fn(async () => new Response(imageBytes, {
      headers: {
        "content-type": "image/jpeg",
      },
      status: 200,
    }))
    vi.stubGlobal("fetch", fetchMock)

    const { GET } = await import("./route")
    const response = await GET(
      new Request(
        "http://localhost/api/catalogue/part-preview-image?url=https%3A%2F%2Fcdn.rebrickable.com%2Fmedia%2Fparts%2Felements%2F300526.jpg",
      ) as NextRequest,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/jpeg")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(imageBytes)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn.rebrickable.com/media/parts/elements/300526.jpg",
      expect.objectContaining({
        cache: "force-cache",
      }),
    )
  })

  it("rejects non-Rebrickable preview image URLs", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const { GET } = await import("./route")
    const response = await GET(
      new Request(
        "http://localhost/api/catalogue/part-preview-image?url=https%3A%2F%2Fexample.test%2Fpart.jpg",
      ) as NextRequest,
    )
    const payload = (await response.json()) as { status: string }

    expect(response.status).toBe(400)
    expect(payload.status).toBe("invalid_preview_url")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
