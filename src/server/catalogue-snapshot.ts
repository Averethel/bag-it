import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import { join } from "node:path"
import type { RebrickableCatalogueSnapshot } from "@/features/bagging/rebrickable-catalogue"

const snapshotFileName = "snapshot.json"
const fallbackSnapshotSchemaVersion = 1
const fallbackSnapshotFiles = [
  "colors.csv",
  "parts.csv",
  "elements.csv",
  "part_relationships.csv",
  "ldraw_part_aliases.csv",
  "external_color_aliases.csv",
] as const

type SnapshotFile = {
  downloadedAt?: string
  id?: string
  schemaVersion?: number
  tables?: readonly {
    contentHash?: string
    fileName: string
    rowCount?: number
    sha256?: string
    sourceUrl?: string
  }[]
}

type SnapshotTable = NonNullable<RebrickableCatalogueSnapshot["tables"]>[number]

export type CatalogueSnapshotReadTarget = {
  directory: string
  snapshot: RebrickableCatalogueSnapshot
}

export class CatalogueSnapshotUnavailableError extends Error {
  override name = "CatalogueSnapshotUnavailableError"
}

export async function readActiveCatalogueSnapshot(catalogueDir: string): Promise<CatalogueSnapshotReadTarget> {
  const directory = await resolveActiveCatalogueDirectory(catalogueDir)

  return {
    directory,
    snapshot: await readCatalogueSnapshotMetadata(directory),
  }
}

export async function readPinnedCatalogueSnapshot(
  activeCatalogueDir: string,
  snapshotId: string,
): Promise<CatalogueSnapshotReadTarget> {
  const directory = join(`${activeCatalogueDir}.snapshots`, snapshotId)
  if (!await snapshotDirectoryExists(directory)) {
    const activeTarget = await readActiveCatalogueSnapshot(activeCatalogueDir)
    if (activeTarget.snapshot.id === snapshotId) {
      return activeTarget
    }

    throw new CatalogueSnapshotUnavailableError(`Catalogue snapshot ${snapshotId} is not available.`)
  }

  const snapshot = await readCatalogueSnapshotMetadata(directory)
  if (snapshot.id !== snapshotId) {
    throw new CatalogueSnapshotUnavailableError(`Catalogue snapshot ${snapshotId} resolved to ${snapshot.id}.`)
  }

  return { directory, snapshot }
}

export function isCatalogueSnapshotUnavailableError(error: unknown) {
  return error instanceof CatalogueSnapshotUnavailableError ||
    (
      error !== null &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: unknown }).name === "CatalogueSnapshotUnavailableError"
    )
}

export async function readCatalogueSnapshotMetadata(catalogueDir: string): Promise<RebrickableCatalogueSnapshot> {
  const snapshot = await readStoredCatalogueSnapshot(catalogueDir).catch((error: unknown) => {
    if (isMissingFileError(error)) {
      return null
    }

    throw error
  })
  if (snapshot) {
    return snapshot
  }

  return createFallbackCatalogueSnapshot(catalogueDir)
}

async function readStoredCatalogueSnapshot(catalogueDir: string) {
  const parsed = JSON.parse(await readFile(join(catalogueDir, snapshotFileName), "utf8")) as SnapshotFile
  if (!parsed || typeof parsed.id !== "string" || !parsed.id) {
    throw new Error("Catalogue snapshot metadata is missing an id.")
  }

  return {
    ...(parsed.downloadedAt ? { downloadedAt: parsed.downloadedAt } : {}),
    id: parsed.id,
    ...(parsed.schemaVersion ? { schemaVersion: parsed.schemaVersion } : {}),
    ...(parsed.tables
      ? {
          tables: parsed.tables.map((table) => ({
            ...(table.contentHash || table.sha256 ? { contentHash: table.contentHash ?? table.sha256 } : {}),
            fileName: table.fileName,
            ...(typeof table.rowCount === "number" ? { rowCount: table.rowCount } : {}),
            ...(table.sourceUrl ? { sourceUrl: table.sourceUrl } : {}),
          })),
        }
      : {}),
  } satisfies RebrickableCatalogueSnapshot
}

async function createFallbackCatalogueSnapshot(catalogueDir: string) {
  const tableResults = await Promise.all(
    fallbackSnapshotFiles.map(async (fileName): Promise<SnapshotTable | null> => {
      const filePath = join(catalogueDir, fileName)
      const bytes = await readFile(filePath).catch(() => null)

      if (!bytes) {
        return null
      }

      return {
        contentHash: createHash("sha256").update(bytes).digest("hex"),
        fileName,
        rowCount: countCsvRows(bytes.toString("utf8")),
        sourceUrl: "",
      }
    }),
  )
  const tables: SnapshotTable[] = []
  for (const table of tableResults) {
    if (table) {
      tables.push(table)
    }
  }
  const idSource = tables
    .map((table) => `${table.fileName}:${table.contentHash}`)
    .sort()
    .join("|")
  const id = createHash("sha256").update(idSource || "missing-catalogue").digest("hex").slice(0, 16)

  return {
    id,
    schemaVersion: fallbackSnapshotSchemaVersion,
    tables,
  } satisfies RebrickableCatalogueSnapshot
}

async function resolveActiveCatalogueDirectory(catalogueDir: string) {
  const stats = await lstat(catalogueDir).catch((error: unknown) => {
    if (isMissingFileError(error)) {
      return null
    }

    throw error
  })

  if (stats?.isSymbolicLink()) {
    return realpath(catalogueDir)
  }

  return catalogueDir
}

function isMissingFileError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  )
}

async function snapshotDirectoryExists(directory: string) {
  return Boolean(await lstat(directory).catch(() => null))
}

function countCsvRows(csvText: string) {
  const trimmed = csvText.trim()
  if (!trimmed) {
    return 0
  }

  return Math.max(0, trimmed.split(/\r?\n/).length - 1)
}
