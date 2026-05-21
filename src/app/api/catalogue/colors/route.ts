import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { NextResponse } from "next/server"
import {
  createPartsListColorsFromRebrickableColors,
  parseExternalColorAliasesCsv,
  parseRebrickableColorsCsv,
} from "@/features/bagging/rebrickable-catalogue"
import { getCatalogueDirectory } from "@/server/catalogue-directory"
import {
  isCatalogueSnapshotUnavailableError,
  readActiveCatalogueSnapshot,
  readPinnedCatalogueSnapshot,
  type CatalogueSnapshotReadTarget,
} from "@/server/catalogue-snapshot"
import { readOrCreateExternalColorAliasesCsv } from "@/server/rebrickable-color-aliases"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const catalogueDir = getCatalogueDirectory()
let catalogueColorsCache: {
  promise: Promise<{
    colors: ReturnType<typeof createPartsListColorsFromRebrickableColors>
    snapshot: CatalogueSnapshotReadTarget["snapshot"]
  }>
  snapshotId: string
} | null = null

export async function GET(request: Request) {
  try {
    const snapshotId = new URL(request.url).searchParams.get("snapshotId")?.trim() || null
    const { colors, snapshot } = await getCatalogueColors(snapshotId)

    return NextResponse.json({
      colors,
      snapshot,
      status: "available",
    })
  } catch {
    catalogueColorsCache = null

    return NextResponse.json(
      {
        colors: [],
        status: "missing",
      },
      { status: 503 },
    )
  }
}

async function getCatalogueColors(snapshotId: string | null) {
  const target = await getCatalogueTarget(snapshotId)
  const snapshot = target.snapshot
  if (catalogueColorsCache?.snapshotId !== snapshot.id) {
    catalogueColorsCache = {
      promise: readCatalogueColors(target),
      snapshotId: snapshot.id,
    }
  }

  return catalogueColorsCache.promise
}

async function getCatalogueTarget(snapshotId: string | null) {
  if (!snapshotId) {
    return readActiveCatalogueSnapshot(catalogueDir)
  }

  try {
    return await readPinnedCatalogueSnapshot(catalogueDir, snapshotId)
  } catch (error) {
    if (isCatalogueSnapshotUnavailableError(error)) {
      return readActiveCatalogueSnapshot(catalogueDir)
    }

    throw error
  }
}

async function readCatalogueColors(target: CatalogueSnapshotReadTarget) {
  const [csvText, externalColorAliasesCsvText] = await Promise.all([
    readFile(join(target.directory, "colors.csv"), "utf8"),
    readOrCreateExternalColorAliasesCsv(target.directory, { writeCache: false }).catch(() => ""),
  ])

  return {
    colors: createPartsListColorsFromRebrickableColors(parseRebrickableColorsCsv(csvText), {
      externalColorAliases: externalColorAliasesCsvText
        ? parseExternalColorAliasesCsv(externalColorAliasesCsvText)
        : [],
    }),
    snapshot: target.snapshot,
  }
}
