import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, extname, join } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("../", import.meta.url))
const examplesDir = join(repoRoot, "examples")
const privateCatalogueColorsPath = join(repoRoot, ".bag-it", "private", "catalogue", "colors.csv")

if (!existsSync(examplesDir)) {
  console.log(JSON.stringify({ available: false, message: "No local examples directory found." }, null, 2))
  process.exit(0)
}

const files = walkFiles(examplesDir)
const csvFiles = files.filter((file) => extname(file).toLowerCase() === ".csv")
const pdfFiles = files.filter((file) => extname(file).toLowerCase() === ".pdf")
const expectedPartsDirectories = new Set(csvFiles.map((file) => dirname(file)))
const partNumbers = new Set()
const colorIds = new Set()
const grammarCounts = new Map()
let expectedQuantity = 0
let expectedRows = 0
let spareRows = 0
let largestExpectedRowCount = 0

for (const csvFile of csvFiles) {
  const rows = readExpectedRows(csvFile)
  largestExpectedRowCount = Math.max(largestExpectedRowCount, rows.length)

  for (const row of rows) {
    expectedRows += 1
    expectedQuantity += row.quantity
    partNumbers.add(row.part)
    colorIds.add(row.color)

    if (row.isSpare) {
      spareRows += 1
    }

    const kind = classifyPartNumber(row.part)
    grammarCounts.set(kind, (grammarCounts.get(kind) ?? 0) + 1)
  }
}

console.log(
  JSON.stringify(
    {
      available: true,
      catalogueColorCoverage: getCatalogueColorCoverage(colorIds),
      csvFileCount: csvFiles.length,
      expectedQuantity,
      expectedRows,
      largestExpectedRowCount,
      expectedPartsDirectoryCount: expectedPartsDirectories.size,
      partNumberGrammarCoverage: Object.fromEntries([...grammarCounts.entries()].sort()),
      pdfFileCount: pdfFiles.length,
      spareRows,
      uniqueColorIds: colorIds.size,
      uniquePartNumbers: partNumbers.size,
    },
    null,
    2,
  ),
)

function walkFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...walkFiles(path))
      continue
    }

    if (entry.isFile()) {
      files.push(path)
    }
  }

  return files
}

function readExpectedRows(csvFile) {
  return readFileSync(csvFile, "utf8")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [part = "", color = "", quantity = "", isSpare = "False"] = line.split(",")

      return {
        color: color.trim(),
        isSpare: isSpare.trim().toLowerCase() === "true",
        part: part.trim().toLowerCase(),
        quantity: Number(quantity),
      }
    })
    .filter((row) => row.part && row.color && Number.isInteger(row.quantity) && row.quantity > 0)
}

function getCatalogueColorCoverage(expectedColorIds) {
  if (!existsSync(privateCatalogueColorsPath)) {
    return null
  }

  const catalogueColorIds = new Set(readCatalogueColorIds(privateCatalogueColorsPath))
  let resolved = 0

  for (const colorId of expectedColorIds) {
    if (catalogueColorIds.has(colorId)) {
      resolved += 1
    }
  }

  return {
    catalogueColorCount: catalogueColorIds.size,
    expectedColorIdsResolved: resolved,
    expectedColorIdsUnresolved: expectedColorIds.size - resolved,
  }
}

function readCatalogueColorIds(csvFile) {
  const [headerLine = "", ...lines] = readFileSync(csvFile, "utf8").trim().split(/\r?\n/)
  const idIndex = headerLine.split(",").indexOf("id")

  if (idIndex < 0) {
    return []
  }

  return lines
    .map((line) => line.split(",")[idIndex]?.trim() ?? "")
    .filter((id) => id.length > 0)
}

function classifyPartNumber(partNumber) {
  if (/^\d+$/.test(partNumber)) {
    return "numeric"
  }

  if (/^\d+[a-z]$/.test(partNumber)) {
    return "mold_variation"
  }

  if (/^\d+c\d{2}$/.test(partNumber)) {
    return "assembly"
  }

  if (/^\d+c\d{2}pr\d{4}$/.test(partNumber)) {
    return "assembly_print"
  }

  if (/^\d+[a-z]?pr\d{4}$/.test(partNumber)) {
    return "print"
  }

  if (/^\d+[a-z]?pat\d{4}$/.test(partNumber)) {
    return "pattern"
  }

  if (/^[a-z]+upn\d{4}$/.test(partNumber)) {
    return "unknown_catalogue"
  }

  if (/^[a-z]*\d[a-z0-9]*$/.test(partNumber)) {
    return "unusual"
  }

  return "invalid"
}
