import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { parseExternalColorAliasesCsv } from "@/features/bagging/rebrickable-catalogue"

type RebrickableExternalIdGroup = {
  ext_descrs?: unknown[]
  ext_ids?: unknown[]
}

type RebrickableColorResponse = {
  count?: number
  next?: string | null
  results?: RebrickableColor[]
}

type RebrickableColor = {
  external_ids?: Record<string, RebrickableExternalIdGroup>
  id: number
  name: string
}

const externalColorAliasesFileName = "external_color_aliases.csv"
const rebrickableColorsUrl = "https://rebrickable.com/api/v3/lego/colors/?page_size=1000"

export async function readOrCreateExternalColorAliasesCsv(
  catalogueDir: string,
  { writeCache = true }: { writeCache?: boolean } = {},
) {
  const cachePath = join(catalogueDir, externalColorAliasesFileName)
  const apiKey = process.env.REBRICKABLE_API_KEY?.trim()

  try {
    const cachedCsv = await readFile(cachePath, "utf8")
    if (isUsableExternalColorAliasesCsv(cachedCsv)) {
      return cachedCsv
    }
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error
    }
  }

  if (!apiKey) {
    return ""
  }

  const csvText = await fetchRebrickableExternalColorAliasesCsv(apiKey)
  if (writeCache) {
    await mkdir(catalogueDir, { recursive: true })
    await writeFile(cachePath, csvText)
  }

  return csvText
}

export async function fetchRebrickableExternalColorAliasesCsv(apiKey: string) {
  const rows = [["system", "external_id", "rebrickable_id", "external_name", "rebrickable_name"]]
  let url: string | null = rebrickableColorsUrl

  while (url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `key ${apiKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch Rebrickable colors: ${response.status} ${response.statusText}`)
    }

    const page = await response.json() as RebrickableColorResponse
    for (const color of page.results ?? []) {
      for (const row of createExternalColorAliasRows(color)) {
        rows.push(row)
      }
    }

    url = page.next ?? null
  }

  return `${rows.map((row) => row.map(formatCsvCell).join(",")).join("\n")}\n`
}

function isUsableExternalColorAliasesCsv(csvText: string) {
  try {
    return parseExternalColorAliasesCsv(csvText).length > 0
  } catch {
    return false
  }
}

function createExternalColorAliasRows(color: RebrickableColor) {
  const rows: string[][] = []
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

function getExternalDescription(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean).join(" | ")
  }

  return value === null || value === undefined ? "" : String(value)
}

function formatCsvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, "\"\"")}"` : value
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}
