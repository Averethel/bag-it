import { readFile } from "node:fs/promises"
import { afterEach, describe, expect, it, vi } from "vitest"
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
    snapshot: { id: "snapshot-1" },
  })),
  readPinnedCatalogueSnapshot: vi.fn(async (_catalogueDir: string, snapshotId: string) => ({
    directory: `/catalogue/.snapshots/${snapshotId}`,
    snapshot: { id: snapshotId },
  })),
}))

const readFileMock = vi.mocked(readFile)
const readPinnedCatalogueSnapshotMock = vi.mocked(readPinnedCatalogueSnapshot)

describe("/api/catalogue/parts", () => {
  afterEach(() => {
    vi.resetModules()
    readFileMock.mockReset()
  })

  it("does not expose the full server catalogue over GET", async () => {
    const { GET } = await import("./route")
    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(405)
    expect(payload).toMatchObject({
      status: "method_not_allowed",
    })
  })

  it("normalizes posted rows against the server-side catalogue", async () => {
    readFileMock.mockImplementation(async (path) => {
      const pathText = String(path)
      if (pathText.endsWith("parts.csv")) {
        return [
          "part_num,name,part_cat_id,part_material,part_img_url",
          "3005,Brick 1 x 1,11,Plastic,https://example.test/3005.jpg",
        ].join("\n")
      }
      if (pathText.endsWith("part_relationships.csv")) {
        return "rel_type,child_part_num,parent_part_num\n"
      }
      if (pathText.endsWith("ldraw_part_aliases.csv")) {
        return "alias,canonical\n"
      }

      return ""
    })

    const { POST } = await import("./route")
    const response = await POST(new Request("http://localhost/api/catalogue/parts", {
      body: JSON.stringify({
        rows: [
          {
            color: { id: "0", matchedText: "Black", name: "Black" },
            part: null,
            partNumber: "3005",
            quantity: 2,
            sourcePage: 4,
            sourceTextRange: { end: 13, start: 0 },
          },
        ],
      }),
      method: "POST",
    }))
    const payload = await response.json()

    expect(payload.status).toBe("available")
    expect(payload.normalization).toMatchObject({
      catalogueSnapshotId: "snapshot-1",
      resolvedQuantity: 2,
      status: "ready",
      totalQuantity: 2,
    })
    expect(payload.normalization.rows).toMatchObject([
      {
        part: { cataloguePartNumber: "3005", matchKind: "exact", name: "Brick 1 x 1" },
        rowId: "4-0-2-3005-0",
        status: "resolved",
      },
    ])
  })

  it("does not trust a client-supplied canonical part", async () => {
    readFileMock.mockImplementation(async (path) => {
      const pathText = String(path)
      if (pathText.endsWith("parts.csv")) {
        return [
          "part_num,name,part_cat_id,part_material,part_img_url",
          "3005,Brick 1 x 1,11,Plastic,https://example.test/3005.jpg",
        ].join("\n")
      }
      if (pathText.endsWith("part_relationships.csv")) {
        return "rel_type,child_part_num,parent_part_num\n"
      }
      if (pathText.endsWith("ldraw_part_aliases.csv")) {
        return "alias,canonical\n"
      }

      return ""
    })

    const { POST } = await import("./route")
    const response = await POST(new Request("http://localhost/api/catalogue/parts", {
      body: JSON.stringify({
        rows: [
          {
            color: { id: "0", matchedText: "Black", name: "Black" },
            part: { cataloguePartNumber: "99999", matchKind: "exact" },
            partNumber: "3005",
            quantity: 2,
            sourcePage: 4,
            sourceTextRange: { end: 13, start: 0 },
          },
        ],
      }),
      method: "POST",
    }))
    const payload = await response.json()

    expect(payload.normalization.rows).toMatchObject([
      {
        part: { cataloguePartNumber: "3005", matchKind: "exact", name: "Brick 1 x 1" },
        partCandidates: [
          expect.objectContaining({ partNumber: "3005", selected: true }),
        ],
        status: "resolved",
      },
    ])
  })

  it("falls back to active catalogue normalization when a saved snapshot is unavailable", async () => {
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
          "3005,Brick 1 x 1,11,Plastic,https://example.test/3005.jpg",
        ].join("\n")
      }
      if (pathText.endsWith("part_relationships.csv")) {
        return "rel_type,child_part_num,parent_part_num\n"
      }
      if (pathText.endsWith("ldraw_part_aliases.csv")) {
        return "alias,canonical\n"
      }

      return ""
    })

    const { POST } = await import("./route")
    const response = await POST(new Request("http://localhost/api/catalogue/parts", {
      body: JSON.stringify({
        rows: [
          {
            color: { id: "0", matchedText: "Black", name: "Black" },
            part: null,
            partNumber: "3005",
            quantity: 2,
            sourcePage: 4,
            sourceTextRange: { end: 13, start: 0 },
          },
        ],
        snapshotId: "stale-snapshot",
      }),
      method: "POST",
    }))
    const payload = await response.json()

    expect(payload.status).toBe("available")
    expect(payload.snapshot.id).toBe("snapshot-1")
    expect(payload.normalization).toMatchObject({
      catalogueSnapshotId: "snapshot-1",
      resolvedQuantity: 2,
      status: "ready",
    })
    expect(readFileMock).toHaveBeenCalledWith("/catalogue/parts.csv", "utf8")
  })
})
