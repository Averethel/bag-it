import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  isCatalogueSnapshotUnavailableError,
  readActiveCatalogueSnapshot,
  readCatalogueSnapshotMetadata,
  readPinnedCatalogueSnapshot,
} from "./catalogue-snapshot"

describe("readCatalogueSnapshotMetadata", () => {
  it("reads stored catalogue snapshot metadata", async () => {
    const catalogueDir = await mkdtemp(join(tmpdir(), "bag-it-catalogue-"))
    await writeFile(
      join(catalogueDir, "snapshot.json"),
      JSON.stringify({
        downloadedAt: "2026-05-17T10:00:00.000Z",
        id: "snapshot-id",
        schemaVersion: 1,
        tables: [
          {
            contentHash: "abc123",
            fileName: "parts.csv",
            rowCount: 2,
            sourceUrl: "https://cdn.rebrickable.com/media/downloads/parts.csv.gz",
          },
        ],
      }),
    )

    await expect(readCatalogueSnapshotMetadata(catalogueDir)).resolves.toEqual({
      downloadedAt: "2026-05-17T10:00:00.000Z",
      id: "snapshot-id",
      schemaVersion: 1,
      tables: [
        {
          contentHash: "abc123",
          fileName: "parts.csv",
          rowCount: 2,
          sourceUrl: "https://cdn.rebrickable.com/media/downloads/parts.csv.gz",
        },
      ],
    })
  })

  it("creates a deterministic fallback id from local catalogue files", async () => {
    const catalogueDir = await mkdtemp(join(tmpdir(), "bag-it-catalogue-"))
    await writeFile(join(catalogueDir, "parts.csv"), "part_num,name\n3005,Brick 1 x 1\n")
    await writeFile(join(catalogueDir, "colors.csv"), "id,name,rgb,is_trans\n0,Black,1B1B1B,f\n")

    const first = await readCatalogueSnapshotMetadata(catalogueDir)
    const second = await readCatalogueSnapshotMetadata(catalogueDir)

    expect(first.id).toBe(second.id)
    expect(first.tables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: "parts.csv",
          rowCount: 1,
        }),
        expect.objectContaining({
          fileName: "colors.csv",
          rowCount: 1,
        }),
      ]),
    )
  })

  it("allows pinned reads against legacy active catalogues without snapshot metadata", async () => {
    const catalogueDir = await mkdtemp(join(tmpdir(), "bag-it-catalogue-"))
    await writeFile(join(catalogueDir, "parts.csv"), "part_num,name\n3005,Brick 1 x 1\n")
    await writeFile(join(catalogueDir, "colors.csv"), "id,name,rgb,is_trans\n0,Black,1B1B1B,f\n")
    const active = await readActiveCatalogueSnapshot(catalogueDir)

    await expect(readPinnedCatalogueSnapshot(catalogueDir, active.snapshot.id)).resolves.toEqual(active)
  })

  it("marks unavailable pinned catalogue snapshots so callers can fall back to active metadata", async () => {
    const catalogueDir = await mkdtemp(join(tmpdir(), "bag-it-catalogue-"))
    await writeFile(join(catalogueDir, "parts.csv"), "part_num,name\n3005,Brick 1 x 1\n")

    const error = await readPinnedCatalogueSnapshot(catalogueDir, "missing-snapshot").catch((caught) => caught)

    expect(isCatalogueSnapshotUnavailableError(error)).toBe(true)
    expect(error).toMatchObject({
      message: "Catalogue snapshot missing-snapshot is not available.",
      name: "CatalogueSnapshotUnavailableError",
    })
  })

  it("fails closed when stored snapshot metadata is malformed", async () => {
    const catalogueDir = await mkdtemp(join(tmpdir(), "bag-it-catalogue-"))
    await writeFile(join(catalogueDir, "snapshot.json"), "{not-json")
    await writeFile(join(catalogueDir, "parts.csv"), "part_num,name\n3005,Brick 1 x 1\n")

    await expect(readCatalogueSnapshotMetadata(catalogueDir)).rejects.toThrow()
  })

  it("pins active catalogue reads to the symlink target directory", async () => {
    const parentDir = await mkdtemp(join(tmpdir(), "bag-it-catalogue-parent-"))
    const snapshotDir = join(parentDir, "catalogue.snapshots", "snapshot-id")
    const activeDir = join(parentDir, "catalogue")
    await mkdir(snapshotDir, { recursive: true })
    await writeFile(
      join(snapshotDir, "snapshot.json"),
      JSON.stringify({ id: "snapshot-id", schemaVersion: 1 }),
    )
    await symlink(snapshotDir, activeDir, "dir")
    const resolvedSnapshotDir = await realpath(snapshotDir)

    await expect(readActiveCatalogueSnapshot(activeDir)).resolves.toMatchObject({
      directory: resolvedSnapshotDir,
      snapshot: { id: "snapshot-id" },
    })
  })
})
