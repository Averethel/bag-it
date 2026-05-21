import { createHash } from "node:crypto"
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { loadEnvFile } from "node:process"
import { gunzipSync, inflateRawSync } from "node:zlib"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("../", import.meta.url))
loadLocalEnvFile(".env")
loadLocalEnvFile(".env.local")

const activeCatalogueDir = process.env.BAG_IT_CATALOGUE_DIR?.trim()
  ? resolve(process.env.BAG_IT_CATALOGUE_DIR)
  : join(repoRoot, ".bag-it", "private", "catalogue")
const dryRun = process.argv.includes("--dry-run")
const catalogueDir = dryRun ? activeCatalogueDir : `${activeCatalogueDir}.tmp-${Date.now()}`
const snapshotsDir = `${activeCatalogueDir}.snapshots`
const snapshotSchemaVersion = 1
const snapshotFileName = "snapshot.json"
const downloads = [
  {
    fileName: "colors.csv",
    table: "colors",
    url: "https://cdn.rebrickable.com/media/downloads/colors.csv.gz",
    zipped: true,
  },
  {
    fileName: "parts.csv",
    table: "parts",
    url: "https://cdn.rebrickable.com/media/downloads/parts.csv.gz",
    zipped: true,
  },
  {
    fileName: "elements.csv",
    table: "elements",
    url: "https://cdn.rebrickable.com/media/downloads/elements.csv.gz",
    zipped: true,
  },
  {
    fileName: "part_relationships.csv",
    table: "part_relationships",
    url: "https://cdn.rebrickable.com/media/downloads/part_relationships.csv.gz",
    zipped: true,
  },
  {
    fileName: "external_color_aliases.csv",
    table: "external_color_aliases",
    url: "https://rebrickable.com/api/v3/lego/colors/?page_size=1000",
  },
  {
    fileName: "ldraw_part_aliases.csv",
    table: "ldraw_part_aliases",
    url: "https://library.ldraw.org/library/updates/complete.zip",
  },
]
const tableRequirements = new Map([
  ["colors", { minimumRows: 100, requiredColumns: ["id", "name", "rgb", "is_trans"] }],
  ["parts", { minimumRows: 50_000, requiredColumns: ["part_num"] }],
  ["elements", { minimumRows: 50_000, requiredColumns: ["element_id", "part_num", "color_id"] }],
  ["part_relationships", { minimumRows: 10_000, requiredColumns: ["rel_type", "child_part_num", "parent_part_num"] }],
  ["external_color_aliases", { minimumRows: 100, requiredColumns: ["system", "external_id", "rebrickable_id"] }],
  ["ldraw_part_aliases", { minimumRows: 100, requiredColumns: ["alias", "canonical", "source"] }],
])

if (dryRun) {
  console.log(JSON.stringify({ catalogueDir: activeCatalogueDir, downloads, dryRun: true }, null, 2))
  process.exit(0)
}

mkdirSync(catalogueDir, { recursive: true })
const downloadedMetadataByTable = new Map()

for (const download of downloads) {
  const downloaded = await downloadCatalogueCsv(download)
  const outputPath = join(catalogueDir, download.fileName)

  writeFileSync(outputPath, downloaded.bytes)
  downloadedMetadataByTable.set(download.table, downloaded)
  console.log(
    JSON.stringify(
      {
        bytes: downloaded.bytes.byteLength,
        outputPath,
        table: download.table,
      },
      null,
      2,
    ),
  )
}

const snapshotMetadata = createCatalogueSnapshotMetadata(catalogueDir, downloads, downloadedMetadataByTable)
writeFileSync(join(catalogueDir, snapshotFileName), `${JSON.stringify(snapshotMetadata, null, 2)}\n`)
promoteCatalogueDirectory(catalogueDir, activeCatalogueDir, snapshotMetadata.id)
console.log(
  JSON.stringify(
    {
      catalogueDir: activeCatalogueDir,
      snapshotId: snapshotMetadata.id,
      status: "promoted",
    },
    null,
    2,
  ),
)

function loadLocalEnvFile(fileName) {
  try {
    loadEnvFile(join(repoRoot, fileName))
  } catch {
    // Local env files are optional for catalogue downloads that do not need API access.
  }
}

async function downloadCatalogueCsv(download) {
  if (download.table === "external_color_aliases") {
    return {
      bytes: Buffer.from(await fetchRebrickableExternalColorAliasesCsv(download.url), "utf8"),
    }
  }

  const response = await fetch(download.url)

  if (!response.ok) {
    throw new Error(`Failed to download ${download.table}: ${response.status} ${response.statusText}`)
  }

  return {
    bytes: createCatalogueCsv(download, Buffer.from(await response.arrayBuffer())),
    etag: response.headers.get("etag") ?? undefined,
    lastModified: response.headers.get("last-modified") ?? undefined,
  }
}

function createCatalogueCsv(download, bytes) {
  if (download.zipped) {
    return gunzipSync(bytes)
  }

  if (download.table === "ldraw_part_aliases") {
    const rebrickablePartsCsv = readFileSync(join(catalogueDir, "parts.csv"), "utf8")
    return Buffer.from(createLDrawPartAliasesCsv(bytes, rebrickablePartsCsv), "utf8")
  }

  throw new Error(`Unsupported catalogue transform: ${download.table}`)
}

function createCatalogueSnapshotMetadata(catalogueDirectory, snapshotDownloads, downloadedMetadata) {
  const tables = snapshotDownloads.map((download) => {
    const filePath = join(catalogueDirectory, download.fileName)
    const bytes = readFileSync(filePath)
    const csvText = bytes.toString("utf8")
    const rows = parseCsv(csvText)
    const headers = rows[0] ?? []
    const rowCount = Math.max(0, rows.length - 1)
    const validation = validateCatalogueTable(download.table, headers, rowCount)
    const metadata = downloadedMetadata.get(download.table) ?? {}

    return {
      contentHash: createHash("sha256").update(bytes).digest("hex"),
      fileName: download.fileName,
      http: {
        ...(metadata.etag ? { etag: metadata.etag } : {}),
        ...(metadata.lastModified ? { lastModified: metadata.lastModified } : {}),
      },
      requiredColumnValidation: validation,
      rowCount,
      sourceUrl: download.url,
      table: download.table,
    }
  })
  const id = createHash("sha256")
    .update(`${snapshotSchemaVersion}:${tables.map((table) => `${table.table}:${table.contentHash}`).join("|")}`)
    .digest("hex")
    .slice(0, 16)

  return {
    downloadedAt: new Date().toISOString(),
    id,
    schemaVersion: snapshotSchemaVersion,
    tables,
  }
}

function validateCatalogueTable(tableName, headers, rowCount) {
  const requirements = tableRequirements.get(tableName)
  if (!requirements) {
    return { ok: true, missingColumns: [], rowCount }
  }

  const missingColumns = requirements.requiredColumns.filter((column) => !headers.includes(column))
  const ok = missingColumns.length === 0 && rowCount >= requirements.minimumRows
  if (!ok) {
    throw new Error(
      `Downloaded ${tableName} failed validation: missing columns ${missingColumns.join(", ") || "none"}, rows ${rowCount}.`,
    )
  }

  return {
    minimumRows: requirements.minimumRows,
    missingColumns,
    ok,
    rowCount,
  }
}

function promoteCatalogueDirectory(workingDirectory, targetDirectory, snapshotId) {
  const previousDirectory = `${targetDirectory}.previous`
  const nextLink = `${targetDirectory}.next`
  const snapshotDirectory = join(snapshotsDir, snapshotId)
  mkdirSync(snapshotsDir, { recursive: true })
  if (existsSync(snapshotDirectory)) {
    rmSync(workingDirectory, { force: true, recursive: true })
  } else {
    renameSync(workingDirectory, snapshotDirectory)
  }
  rmSync(nextLink, { force: true, recursive: true })

  if (
    existsSync(targetDirectory) &&
    lstatSync(targetDirectory).isSymbolicLink() &&
    readlinkSync(targetDirectory) === snapshotDirectory
  ) {
    return
  }

  symlinkSync(snapshotDirectory, nextLink, "dir")

  if (!existsSync(targetDirectory)) {
    renameSync(nextLink, targetDirectory)
    return
  }

  if (lstatSync(targetDirectory).isSymbolicLink()) {
    renameSync(nextLink, targetDirectory)
    return
  }

  rmSync(previousDirectory, { force: true, recursive: true })
  if (existsSync(targetDirectory)) {
    renameSync(targetDirectory, previousDirectory)
  }

  try {
    renameSync(nextLink, targetDirectory)
  } catch (error) {
    if (existsSync(previousDirectory) && !existsSync(targetDirectory)) {
      renameSync(previousDirectory, targetDirectory)
    }

    throw error
  }
}

async function fetchRebrickableExternalColorAliasesCsv(url) {
  const apiKey = process.env.REBRICKABLE_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("REBRICKABLE_API_KEY is required to download external color aliases.")
  }

  const rows = [["system", "external_id", "rebrickable_id", "external_name", "rebrickable_name"]]
  let nextUrl = url

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `key ${apiKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to download external color aliases: ${response.status} ${response.statusText}`)
    }

    const page = await response.json()
    for (const color of page.results ?? []) {
      for (const row of createExternalColorAliasRows(color)) {
        rows.push(row)
      }
    }

    nextUrl = page.next ?? null
  }

  if (rows.length <= 1) {
    throw new Error("Failed to parse Rebrickable external color aliases.")
  }

  return `${rows.map((row) => row.map(formatCsvCell).join(",")).join("\n")}\n`
}

function createExternalColorAliasRows(color) {
  const rows = []

  for (const [system, values] of Object.entries(color.external_ids ?? {})) {
    const externalIds = values.ext_ids ?? []
    const externalDescriptions = values.ext_descrs ?? []

    for (let index = 0; index < externalIds.length; index += 1) {
      const externalId = externalIds[index]
      if (externalId === null || externalId === undefined || externalId === "") {
        continue
      }

      rows.push([
        system,
        String(externalId),
        String(color.id),
        getExternalDescription(externalDescriptions[index]),
        color.name,
      ])
    }
  }

  return rows
}

function createLDrawPartAliasesCsv(zipBytes, rebrickablePartsCsv) {
  const [headers = [], ...records] = parseCsv(rebrickablePartsCsv)
  const partIndex = headers.indexOf("part_num")
  if (partIndex < 0) {
    throw new Error("Rebrickable parts CSV must include part_num.")
  }

  const rebrickableParts = new Set(
    records
      .map((row) => normalizePart(row[partIndex] ?? ""))
      .filter(Boolean),
  )
  const targetsByAlias = new Map()
  const sourceByAliasTarget = new Map()

  for (const entry of readZipEntries(zipBytes)) {
    if (!/^ldraw\/parts\/[^/]+\.dat$/i.test(entry.name)) {
      continue
    }

    const ldrawPart = normalizePart(entry.name.split("/").pop()?.replace(/\.dat$/i, "") ?? "")
    if (!ldrawPart) {
      continue
    }

    const lines = entry.text.split(/\r?\n/).slice(0, 30)
    const movedLine = lines.find((line) => /^0\s+~Moved to\s+/i.test(line))
    if (movedLine) {
      const target = normalizePart(movedLine.replace(/^0\s+~Moved to\s+/i, "").trim().split(/\s+/)[0] ?? "")
      addExternalAlias(targetsByAlias, sourceByAliasTarget, ldrawPart, target, "ldraw_moved", rebrickableParts)
    }

    const keywordsLine = lines.find((line) => /^0\s+!KEYWORDS\s+/i.test(line))
    if (!keywordsLine) {
      continue
    }

    const brickLinkAliases = [...keywordsLine.matchAll(/\bBrickLink\s+([a-z0-9._-]+)/gi)]
      .map((match) => normalizePart(match[1] ?? ""))
      .filter(Boolean)
    const rebrickableAliases = [...keywordsLine.matchAll(/\bRebrickable\s+([a-z0-9._-]+)/gi)]
      .map((match) => normalizePart(match[1] ?? ""))
      .filter(Boolean)
    const canonical =
      rebrickableAliases.find((part) => rebrickableParts.has(part)) ??
      (rebrickableParts.has(ldrawPart) ? ldrawPart : "")

    for (const alias of brickLinkAliases) {
      addExternalAlias(targetsByAlias, sourceByAliasTarget, alias, canonical, "ldraw_keyword", rebrickableParts)
    }
  }

  const rows = [["alias", "canonical", "source"]]
  for (const [alias, targets] of [...targetsByAlias.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (targets.size !== 1) {
      continue
    }

    const [canonical] = targets
    rows.push([alias, canonical, sourceByAliasTarget.get(`${alias}\u0000${canonical}`) ?? "ldraw"])
  }

  if (rows.length <= 1) {
    throw new Error("Failed to parse LDraw part aliases.")
  }

  return `${rows.map((row) => row.map(formatCsvCell).join(",")).join("\n")}\n`
}

function addExternalAlias(targetsByAlias, sourceByAliasTarget, alias, canonical, source, rebrickableParts) {
  const normalizedAlias = normalizePart(alias)
  const normalizedCanonical = normalizePart(canonical)
  if (
    !normalizedAlias ||
    !normalizedCanonical ||
    normalizedAlias === normalizedCanonical ||
    !rebrickableParts.has(normalizedCanonical)
  ) {
    return
  }

  const targets = targetsByAlias.get(normalizedAlias) ?? new Set()
  targets.add(normalizedCanonical)
  targetsByAlias.set(normalizedAlias, targets)
  sourceByAliasTarget.set(`${normalizedAlias}\u0000${normalizedCanonical}`, source)
}

function readZipEntries(zipBytes) {
  const endOfCentralDirectoryOffset = findEndOfCentralDirectory(zipBytes)
  const centralDirectorySize = zipBytes.readUInt32LE(endOfCentralDirectoryOffset + 12)
  const centralDirectoryOffset = zipBytes.readUInt32LE(endOfCentralDirectoryOffset + 16)
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize
  const entries = []

  for (let offset = centralDirectoryOffset; offset < centralDirectoryEnd;) {
    if (zipBytes.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory.")
    }

    const method = zipBytes.readUInt16LE(offset + 10)
    const compressedSize = zipBytes.readUInt32LE(offset + 20)
    const fileNameLength = zipBytes.readUInt16LE(offset + 28)
    const extraLength = zipBytes.readUInt16LE(offset + 30)
    const commentLength = zipBytes.readUInt16LE(offset + 32)
    const localHeaderOffset = zipBytes.readUInt32LE(offset + 42)
    const name = zipBytes.toString("utf8", offset + 46, offset + 46 + fileNameLength)
    const nextOffset = offset + 46 + fileNameLength + extraLength + commentLength
    if (!/^ldraw\/parts\/[^/]+\.dat$/i.test(name)) {
      offset = nextOffset
      continue
    }

    const data = readZipEntryData(zipBytes, {
      compressedSize,
      localHeaderOffset,
      method,
    })

    entries.push({ name, text: data.toString("utf8") })
    offset = nextOffset
  }

  return entries
}

function findEndOfCentralDirectory(zipBytes) {
  const signature = 0x06054b50
  const minOffset = Math.max(0, zipBytes.length - 65_557)
  for (let offset = zipBytes.length - 22; offset >= minOffset; offset -= 1) {
    if (zipBytes.readUInt32LE(offset) === signature) {
      return offset
    }
  }

  throw new Error("ZIP end of central directory not found.")
}

function readZipEntryData(zipBytes, { compressedSize, localHeaderOffset, method }) {
  if (zipBytes.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
    throw new Error("Invalid ZIP local header.")
  }

  const fileNameLength = zipBytes.readUInt16LE(localHeaderOffset + 26)
  const extraLength = zipBytes.readUInt16LE(localHeaderOffset + 28)
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength
  const compressedData = zipBytes.subarray(dataStart, dataStart + compressedSize)

  if (method === 0) {
    return compressedData
  }

  if (method === 8) {
    return inflateRawSync(compressedData)
  }

  throw new Error(`Unsupported ZIP compression method: ${method}`)
}

function getExternalDescription(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean).join(" | ")
  }

  return value === null || value === undefined ? "" : String(value)
}

function normalizePart(partNumber) {
  return partNumber.trim().toLowerCase().replace(/\.dat$/i, "")
}

function formatCsvCell(value) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, "\"\"")}"` : value
}

function parseCsv(csvText) {
  const rows = []
  let currentCell = ""
  let currentRow = []
  let inQuotes = false

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index]
    const nextCharacter = csvText[index + 1]

    if (character === "\"" && inQuotes && nextCharacter === "\"") {
      currentCell += "\""
      index += 1
      continue
    }

    if (character === "\"") {
      inQuotes = !inQuotes
      continue
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentCell)
      currentCell = ""
      continue
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1
      }

      currentRow.push(currentCell)
      rows.push(currentRow)
      currentCell = ""
      currentRow = []
      continue
    }

    currentCell += character
  }

  currentRow.push(currentCell)
  rows.push(currentRow)

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0))
}
