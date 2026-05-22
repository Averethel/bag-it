import { readFile } from "node:fs/promises"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { NextRequest } from "next/server"
import { readPinnedCatalogueSnapshot } from "@/server/catalogue-snapshot"

const fsPromisesMock = vi.hoisted(() => ({
  readFile: vi.fn(),
}))

vi.mock("node:fs/promises", () => ({
  default: fsPromisesMock,
  readFile: fsPromisesMock.readFile,
}))

vi.mock("@/server/catalogue-directory", () => ({
  getCatalogueDirectory: () => "/catalogue",
}))

vi.mock("@/server/catalogue-snapshot", () => ({
  isCatalogueSnapshotUnavailableError: (error: unknown) => (
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name?: unknown }).name === "CatalogueSnapshotUnavailableError"
  ),
  readActiveCatalogueSnapshot: vi.fn(async () => ({
    directory: "/catalogue",
    snapshot: { id: "active-snapshot" },
  })),
  readPinnedCatalogueSnapshot: vi.fn(async (_catalogueDir: string, snapshotId: string) => ({
    directory: `/catalogue/.snapshots/${snapshotId}`,
    snapshot: { id: snapshotId },
  })),
}))

const readFileMock = vi.mocked(readFile)
const readPinnedCatalogueSnapshotMock = vi.mocked(readPinnedCatalogueSnapshot)

describe("/api/catalogue/part-previews", () => {
  const originalApiKey = process.env.REBRICKABLE_API_KEY

  beforeEach(() => {
    delete process.env.REBRICKABLE_API_KEY
  })

  afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    readFileMock.mockReset()
    if (originalApiKey === undefined) {
      delete process.env.REBRICKABLE_API_KEY
    } else {
      process.env.REBRICKABLE_API_KEY = originalApiKey
    }
  })

  it("uses a live color-specific preview before falling back to generic metadata", async () => {
    process.env.REBRICKABLE_API_KEY = "test-api-key"
    readFileMock.mockImplementation(async (path) => {
      const pathText = String(path)
      if (pathText.endsWith("parts.csv")) {
        return [
          "part_num,name,part_cat_id,part_material,part_img_url",
          "3001,Brick 2 x 4,11,Plastic,https://cdn.example.test/generic/3001.jpg",
        ].join("\n")
      }

      if (pathText.endsWith("ldraw_part_aliases.csv")) {
        return "alias,canonical\n"
      }

      return ""
    })
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      void url

      return Response.json({
        color_id: 71,
        elements: ["4211398"],
        part: {
          name: "Brick 2 x 4",
          part_num: "3001",
        },
        part_img_url: "https://cdn.example.test/color/3001-71.jpg",
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/catalogue/part-previews", {
        body: JSON.stringify({ parts: [{ colorId: "71", partNumber: "3001" }] }),
        method: "POST",
      }) as NextRequest,
    )
    const payload = (await response.json()) as { previews: unknown[]; status: string }

    expect(payload.status).toBe("available")
    expect(payload.previews).toEqual([
      {
        colorId: "71",
        fallbackImageUrl: "https://cdn.example.test/generic/3001.jpg",
        imageUrl: "https://cdn.example.test/color/3001-71.jpg",
        key: "3001:71",
        name: "Brick 2 x 4",
        partNumber: "3001",
      },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://rebrickable.com/api/v3/lego/parts/3001/colors/71/",
    )
  })

  it("falls back to a live generic preview when a color-specific preview misses", async () => {
    process.env.REBRICKABLE_API_KEY = "test-api-key"
    readFileMock.mockImplementation(async (path) => {
      const pathText = String(path)
      if (pathText.endsWith("parts.csv")) {
        return "part_num,name,part_cat_id,part_material,part_img_url\n"
      }

      if (pathText.endsWith("ldraw_part_aliases.csv")) {
        return "alias,canonical\n"
      }

      return ""
    })
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.endsWith("/parts/3001/colors/71/")) {
        return new Response(null, { status: 404 })
      }

      return Response.json({
        results: [
          {
            name: "Brick 2 x 4",
            part_img_url: "https://cdn.example.test/parts/3001.jpg",
            part_num: "3001",
          },
        ],
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/catalogue/part-previews", {
        body: JSON.stringify({ parts: [{ colorId: "71", partNumber: "3001" }] }),
        method: "POST",
      }) as NextRequest,
    )
    const payload = (await response.json()) as { previews: unknown[]; status: string }

    expect(payload.status).toBe("available")
    expect(payload.previews).toEqual([
      {
        colorId: "71",
        imageUrl: "https://cdn.example.test/parts/3001.jpg",
        key: "3001:71",
        name: "Brick 2 x 4",
        partNumber: "3001",
      },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://rebrickable.com/api/v3/lego/parts/3001/colors/71/",
    )
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain("color_id=")
  })

  it("uses local element metadata for color-specific previews when available", async () => {
    readFileMock.mockImplementation(async (path) => {
      const pathText = String(path)
      if (pathText.endsWith("parts.csv")) {
        return [
          "part_num,name,part_cat_id,part_material,part_img_url",
          "3005,Brick 1 x 1,11,Plastic,https://cdn.example.test/generic/3005.jpg",
        ].join("\n")
      }

      if (pathText.endsWith("elements.csv")) {
        return [
          "element_id,part_num,color_id,design_id",
          "4211398,3005,0,3005",
        ].join("\n")
      }

      if (pathText.endsWith("ldraw_part_aliases.csv")) {
        return "alias,canonical\n"
      }

      return ""
    })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/catalogue/part-previews", {
        body: JSON.stringify({
          parts: [{ colorId: "0", partNumber: "3005" }],
          snapshotId: "snapshot-1",
        }),
        method: "POST",
      }) as NextRequest,
    )
    const payload = (await response.json()) as { previews: unknown[]; status: string }

    expect(payload.status).toBe("available")
    expect(payload.previews).toEqual([
      {
        colorId: "0",
        fallbackImageUrl: "https://cdn.example.test/generic/3005.jpg",
        imageUrl: "https://cdn.rebrickable.com/media/parts/elements/4211398.jpg",
        key: "3005:0",
        name: "Brick 1 x 1",
        partNumber: "3005",
      },
    ])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(readFileMock).toHaveBeenCalledWith("/catalogue/.snapshots/snapshot-1/elements.csv", "utf8")
  })

  it("reads local preview metadata from a pinned catalogue snapshot", async () => {
    readFileMock.mockImplementation(async (path) => {
      const pathText = String(path)
      if (pathText.endsWith("parts.csv")) {
        return [
          "part_num,name,part_cat_id,part_material,part_img_url",
          "3005,Brick 1 x 1,11,Plastic,https://cdn.example.test/snapshot/3005.jpg",
        ].join("\n")
      }

      if (pathText.endsWith("ldraw_part_aliases.csv")) {
        return "alias,canonical\n"
      }

      return ""
    })

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/catalogue/part-previews", {
        body: JSON.stringify({
          parts: [{ colorId: "0", partNumber: "3005" }],
          snapshotId: "snapshot-1",
        }),
        method: "POST",
      }) as NextRequest,
    )
    const payload = (await response.json()) as { previews: unknown[]; snapshot: { id: string }; status: string }

    expect(payload.status).toBe("available")
    expect(payload.snapshot.id).toBe("snapshot-1")
    expect(payload.previews).toEqual([
      {
        colorId: "0",
        imageUrl: "https://cdn.example.test/snapshot/3005.jpg",
        key: "3005:0",
        name: "Brick 1 x 1",
        partNumber: "3005",
      },
    ])
    expect(readFileMock).toHaveBeenCalledWith("/catalogue/.snapshots/snapshot-1/parts.csv", "utf8")
  })

  it("falls back to the active catalogue when a saved session references an unavailable snapshot", async () => {
    readPinnedCatalogueSnapshotMock.mockRejectedValueOnce(
      Object.assign(new Error("Catalogue snapshot stale-snapshot is not available."), {
        name: "CatalogueSnapshotUnavailableError",
      }),
    )
    readFileMock.mockImplementation(async (path) => {
      const pathText = String(path)
      if (pathText.endsWith("parts.csv")) {
        return [
          "part_num,name,part_cat_id,part_material,part_img_url",
          "3005,Brick 1 x 1,11,Plastic,https://cdn.example.test/active/3005.jpg",
        ].join("\n")
      }

      if (pathText.endsWith("ldraw_part_aliases.csv")) {
        return "alias,canonical\n"
      }

      return ""
    })

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/catalogue/part-previews", {
        body: JSON.stringify({
          parts: [{ colorId: "0", partNumber: "3005" }],
          snapshotId: "stale-snapshot",
        }),
        method: "POST",
      }) as NextRequest,
    )
    const payload = (await response.json()) as { previews: unknown[]; snapshot: { id: string }; status: string }

    expect(payload.status).toBe("available")
    expect(payload.snapshot.id).toBe("active-snapshot")
    expect(payload.previews).toEqual([
      {
        colorId: "0",
        imageUrl: "https://cdn.example.test/active/3005.jpg",
        key: "3005:0",
        name: "Brick 1 x 1",
        partNumber: "3005",
      },
    ])
    expect(readFileMock).toHaveBeenCalledWith("/catalogue/parts.csv", "utf8")
  })
})
