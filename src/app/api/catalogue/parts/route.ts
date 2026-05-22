import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { NextResponse } from "next/server"
import type { ParsedPartsListPageRow } from "@/features/bagging/parts-list-extraction"
import { normalizePartsListRows } from "@/features/bagging/parts-list-normalization"
import {
  createPartsListPartCatalogue,
  parseExternalPartAliasesCsv,
  parseRebrickablePartRelationshipsCsv,
  parseRebrickablePartsCsv,
} from "@/features/bagging/rebrickable-catalogue"
import { getCatalogueDirectory } from "@/server/catalogue-directory"
import {
  isCatalogueSnapshotUnavailableError,
  readActiveCatalogueSnapshot,
  readPinnedCatalogueSnapshot,
  type CatalogueSnapshotReadTarget,
} from "@/server/catalogue-snapshot"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type PartsNormalizationRequestRow = ParsedPartsListPageRow

const catalogueDir = getCatalogueDirectory()
let partCatalogueCache: {
  promise: Promise<ReturnType<typeof createPartsListPartCatalogue>>
  snapshotId: string
} | null = null

export async function GET() {
  return NextResponse.json(
    {
      message: "Use POST with extracted part rows to normalize against the server-side catalogue.",
      status: "method_not_allowed",
    },
    {
      status: 405,
    },
  )
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null)
    const rows = normalizeRequestRows(getPayloadRows(payload))
    const snapshotId = getPayloadSnapshotId(payload)
    const catalogue = await getPartCatalogue(snapshotId)
    const normalization = normalizePartsListRows(rows, { partCatalogue: catalogue })

    return NextResponse.json({
      normalization,
      snapshot: catalogue.snapshot ?? null,
      status: "available",
    })
  } catch {
    partCatalogueCache = null

    return NextResponse.json(
      {
        normalization: normalizePartsListRows([]),
        status: "missing",
      },
      { status: 503 },
    )
  }
}

async function getPartCatalogue(snapshotId: string | null) {
  const target = await getCatalogueTarget(snapshotId)
  const snapshot = target.snapshot
  if (partCatalogueCache?.snapshotId !== snapshot.id) {
    partCatalogueCache = {
      promise: readPartCatalogue(target),
      snapshotId: snapshot.id,
    }
  }

  return partCatalogueCache.promise
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

async function readPartCatalogue(target: CatalogueSnapshotReadTarget) {
  const [partsCsvText, relationshipsCsvText, aliasesCsvText] = await Promise.all([
    readFile(join(target.directory, "parts.csv"), "utf8"),
    readFile(join(target.directory, "part_relationships.csv"), "utf8").catch(() => null),
    readFile(join(target.directory, "ldraw_part_aliases.csv"), "utf8").catch(() => null),
  ])

  return createPartsListPartCatalogue({
    externalPartAliases: aliasesCsvText ? parseExternalPartAliasesCsv(aliasesCsvText) : [],
    parts: parseRebrickablePartsCsv(partsCsvText),
    relationships: relationshipsCsvText
      ? parseRebrickablePartRelationshipsCsv(relationshipsCsvText)
      : [],
    snapshot: target.snapshot,
  })
}

function getPayloadRows(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("rows" in payload)) {
    return []
  }

  const rows = (payload as { rows?: unknown }).rows
  return Array.isArray(rows) ? rows : []
}

function getPayloadSnapshotId(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("snapshotId" in payload)) {
    return null
  }

  const snapshotId = (payload as { snapshotId?: unknown }).snapshotId
  return typeof snapshotId === "string" && snapshotId.trim() ? snapshotId.trim() : null
}

function normalizeRequestRows(rows: readonly unknown[]): PartsNormalizationRequestRow[] {
  const normalizedRows: PartsNormalizationRequestRow[] = []

  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue
    }

    const record = row as Partial<PartsNormalizationRequestRow>
    const partNumber = typeof record.partNumber === "string" ? record.partNumber.trim() : ""
    const quantity = typeof record.quantity === "number" && Number.isFinite(record.quantity)
      ? record.quantity
      : 0
    const sourcePage = typeof record.sourcePage === "number" && Number.isFinite(record.sourcePage)
      ? record.sourcePage
      : 0
    const sourceTextRange = normalizeSourceTextRange(record.sourceTextRange)
    if (!partNumber || quantity <= 0 || sourcePage <= 0 || !sourceTextRange) {
      continue
    }

    normalizedRows.push({
      color: record.color ?? null,
      confidence: 0,
      part: null,
      partNumber,
      partNumberKind: "unknown_catalogue",
      rawText: "",
      quantity,
      sourcePage,
      sourceTextRange,
    })
  }

  return normalizedRows
}

function normalizeSourceTextRange(sourceTextRange: unknown) {
  if (!sourceTextRange || typeof sourceTextRange !== "object") {
    return null
  }

  const { end, start } = sourceTextRange as { end?: unknown; start?: unknown }
  if (
    typeof start !== "number" ||
    typeof end !== "number" ||
    !Number.isFinite(start) ||
    !Number.isFinite(end)
  ) {
    return null
  }

  return { end, start }
}
