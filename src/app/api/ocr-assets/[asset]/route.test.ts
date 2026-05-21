import { afterEach, describe, expect, it, vi } from "vitest"
import { paddleOcrModelAssetFiles, paddleOcrRemoteModelAssets } from "@/features/bagging/paddle-ocr-assets"
import { GET } from "./route"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("/api/ocr-assets/[asset]", () => {
  it("streams known Paddle OCR assets through the same-origin route", async () => {
    const body = new Uint8Array([1, 2, 3])
    const fetchMock = vi.fn(async () =>
      new Response(body, {
        headers: {
          "content-length": String(body.byteLength),
          "content-type": "application/x-tar",
          etag: '"test-etag"',
          "last-modified": "Sat, 16 May 2026 12:00:00 GMT",
        },
        status: 200,
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await GET(new Request("http://localhost:3001/api/ocr-assets/test"), {
      params: Promise.resolve({ asset: paddleOcrModelAssetFiles.detection }),
    })

    expect(fetchMock).toHaveBeenCalledWith(paddleOcrRemoteModelAssets[paddleOcrModelAssetFiles.detection], {
      cache: "no-store",
    })
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400, stale-while-revalidate=604800")
    expect(response.headers.get("content-type")).toBe("application/x-tar")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(body)
  })

  it("rejects unknown OCR asset names", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await GET(new Request("http://localhost:3001/api/ocr-assets/test"), {
      params: Promise.resolve({ asset: "other-model.tar" }),
    })

    expect(response.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
