#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { gunzipSync } from "node:zlib"

const REBRICKABLE_COLORS_CSV_URL = "https://cdn.rebrickable.com/media/downloads/colors.csv.gz"
const OUTPUT_PATH = path.join("packages", "part-colors", "src", "rebrickable-colors.ts")

async function main() {
  const csv = await fetchGzippedText(REBRICKABLE_COLORS_CSV_URL)
  const colors = parseCsv(csv)
    .map(toCatalogColor)
    .filter((color) => color && isRealColorName(color.name))

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, renderCatalogModule(colors))

  console.log(`Wrote ${colors.length} Rebrickable colors to ${OUTPUT_PATH}`)
}

async function fetchGzippedText(url) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`)
  }

  return gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8")
}

function parseCsv(csv) {
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/)
  const headers = parseCsvLine(headerLine)

  return lines.map((line) => Object.fromEntries(
    parseCsvLine(line).map((value, index) => [headers[index], value]),
  ))
}

function parseCsvLine(line) {
  const values = []
  let current = ""
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === "\"" && next === "\"") {
      current += "\""
      index += 1
    } else if (char === "\"") {
      inQuotes = !inQuotes
    } else if (char === "," && !inQuotes) {
      values.push(current)
      current = ""
    } else {
      current += char
    }
  }

  values.push(current)

  return values
}

function toCatalogColor(row) {
  const id = Number(row.id)
  const hex = normalizeHex(row.rgb)

  if (!Number.isFinite(id) || !hex) {
    return null
  }

  return {
    hex,
    id,
    isTransparent: row.is_trans === "True",
    name: row.name,
    numParts: readInteger(row.num_parts),
    numSets: readInteger(row.num_sets),
    rgb: hexToRgb(hex),
    year1: readInteger(row.y1),
    year2: readInteger(row.y2),
  }
}

function isRealColorName(name) {
  return Boolean(name) && !name.startsWith("[")
}

function normalizeHex(value) {
  if (!/^[\dA-Fa-f]{6}$/.test(value ?? "")) {
    return null
  }

  return `#${value.toUpperCase()}`
}

function readInteger(value) {
  const parsed = Number(value)

  return Number.isInteger(parsed) ? parsed : null
}

function hexToRgb(hex) {
  return {
    b: Number.parseInt(hex.slice(5, 7), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    r: Number.parseInt(hex.slice(1, 3), 16),
  }
}

function renderCatalogModule(colors) {
  return `import type { RgbColor } from "./contracts"

export interface RebrickableLegoColor {
  id: number
  name: string
  hex: string
  isTransparent: boolean
  numParts: number | null
  numSets: number | null
  rgb: RgbColor
  year1: number | null
  year2: number | null
}

export const REBRICKABLE_COLOR_CATALOG_SOURCE_URL = ${JSON.stringify(REBRICKABLE_COLORS_CSV_URL)}

export const REBRICKABLE_LEGO_COLOR_CATALOG = [
${colors.map(renderColorEntry).join(",\n")}
] as const satisfies readonly RebrickableLegoColor[]

export const REBRICKABLE_LEGO_COLOR_NAMES = REBRICKABLE_LEGO_COLOR_CATALOG.map((color) => color.name)
`
}

function renderColorEntry(color) {
  return `  {
    id: ${color.id},
    name: ${JSON.stringify(color.name)},
    hex: ${JSON.stringify(color.hex)},
    isTransparent: ${color.isTransparent},
    numParts: ${formatNullableNumber(color.numParts)},
    numSets: ${formatNullableNumber(color.numSets)},
    rgb: { r: ${color.rgb.r}, g: ${color.rgb.g}, b: ${color.rgb.b} },
    year1: ${formatNullableNumber(color.year1)},
    year2: ${formatNullableNumber(color.year2)},
  }`
}

function formatNullableNumber(value) {
  return Number.isFinite(value) ? String(value) : "null"
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
