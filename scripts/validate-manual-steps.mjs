import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, extname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const repoRoot = fileURLToPath(new URL("../", import.meta.url))
const defaultExample = join(
  repoRoot,
  ".bag-it",
  "private",
  "multipart",
  "MOC-220614",
  "manual-print-expected-examples",
  "01-castle-ramp",
)
const options = parseArgs(process.argv.slice(2))
const baseUrl = normalizeLocalhostBaseUrl(options.baseUrl || process.env.BAG_IT_BASE_URL || "http://localhost:3000")
const exampleDir = resolve(options.input || defaultExample)

if (options.help) {
  printUsage()
  process.exit(0)
}

const manualPath = findFirstFile(exampleDir, [".pdf"])
const csvPath = findFirstFile(exampleDir, [".csv"])
if (!manualPath || !csvPath) {
  throw new Error(`Expected one PDF and one CSV in ${exampleDir}`)
}

const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() || chromium.executablePath()
const browser = await chromium.launch({
  executablePath: chromiumExecutablePath,
  args: ["--disable-features=MachPortRendezvous"],
})

try {
  const page = await browser.newPage()
  const startedAt = Date.now()

  await page.goto(baseUrl)
  await page.evaluate(() => {
    window.__bagItStepBomDebug = []
  })
  await page.getByLabel("Upload PDF manual").setInputFiles(manualPath)
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("button")).some(
      (button) => button.textContent?.includes("Bag it!") && !button.disabled,
    ),
    null,
    { timeout: 30_000 },
  )
  await page.getByRole("button", { name: "Bag it!" }).click()
  await page.getByText("Analysis complete").waitFor({ timeout: options.analysisTimeoutMs })

  const bomRows = await readBomRows(page)
  await page.getByRole("tab", { name: "Bags" }).click()
  await page.getByTestId("step-callouts-panel").waitFor({ timeout: 30_000 })
  const bags = await readBags(page)
  const callouts = await readCallouts(page)
  const colorGroups = await readColorGroups(page)
  const stepBomDebug = await page.evaluate(() => window.__bagItStepBomDebug ?? [])
  const expectedRows = readExpectedRows(csvPath)
  const report = createStepCoverageReport({
    baseUrl,
    bags,
    bomRows,
    callouts,
    colorGroups,
    csvPath,
    elapsedMs: Date.now() - startedAt,
    exampleDir,
    expectedRows,
    manualPath,
    stepBomDebug,
  })

  if (options.outputPath) {
    mkdirSync(dirname(options.outputPath), { recursive: true })
    writeFileSync(options.outputPath, `${JSON.stringify(report, null, 2)}\n`)
  }
  if (options.sessionOutputPath) {
    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "Download session" }).click()
    const download = await downloadPromise
    mkdirSync(dirname(options.sessionOutputPath), { recursive: true })
    await download.saveAs(options.sessionOutputPath)
  }

  console.log(JSON.stringify(report, null, 2))
  process.exitCode = report.summary.bags > 0 &&
    report.summary.colorGroups > 0 &&
    report.summary.exactRowMatches === report.summary.bomRows &&
    report.summary.missingDetectedQuantity === 0 &&
    report.summary.extraDetectedQuantity === 0 &&
    report.summary.unmatchedQuantity === 0
    ? 0
    : 1
} finally {
  await browser.close()
}

async function readBomRows(page) {
  return page.getByTestId("extracted-part-row").evaluateAll((elements) =>
    elements.map((element) => ({
      cataloguePartNumber: element.getAttribute("data-catalogue-part-number") ?? "",
      colorId: element.getAttribute("data-color-id") ?? "",
      colorName: element.getAttribute("data-color-name") ?? "",
      normalizationStatus: element.getAttribute("data-normalization-status") ?? "",
      partNumber: element.getAttribute("data-part-number") ?? "",
      quantity: Number(element.getAttribute("data-quantity") ?? "0"),
      rowId: element.getAttribute("data-row-id") ?? "",
      sourcePage: Number(element.getAttribute("data-source-page") ?? "0"),
    })),
  )
}

async function readBags(page) {
  return page.getByTestId("step-callout-bag").evaluateAll((elements) =>
    elements.map((element) => ({
      pageRange: element.getAttribute("data-page-range") ?? "",
      partCount: Number(element.getAttribute("data-part-count") ?? "0"),
      policySetSize: element.getAttribute("data-policy-set-size") ?? "",
      status: element.getAttribute("data-bag-status") ?? "",
      stepCount: Number(element.getAttribute("data-step-count") ?? "0"),
      stepRange: element.getAttribute("data-step-range") ?? "",
    })),
  )
}

async function readCallouts(page) {
  return page.getByTestId("step-callout-card").evaluateAll((elements) =>
    elements.map((element) => ({
      pageNumber: Number(element.getAttribute("data-page-number") ?? "0"),
      partTypeCount: Number(element.getAttribute("data-part-type-count") ?? "0"),
      sourceRegion: element.getAttribute("data-source-region") ?? "",
      stepIndex: Number(element.getAttribute("data-step-index") ?? "0"),
    })),
  )
}

async function readColorGroups(page) {
  return page.getByTestId("step-callout-bag-part-group").evaluateAll((elements) =>
    elements.map((element) => ({
      bagStepRange: element.closest("[data-testid='step-callout-bag']")?.getAttribute("data-step-range") ?? "",
      cataloguePartNumber: element.getAttribute("data-catalogue-part-number") ?? "",
      colorId: element.getAttribute("data-color-id") ?? "",
      colorConfidence: Number(element.getAttribute("data-detected-color-confidence") ?? "0"),
      colorHex: element.getAttribute("data-detected-color-hex") ?? "",
      colorName: element.getAttribute("data-detected-color") ?? "",
      itemCount: Number(element.getAttribute("data-item-count") ?? "0"),
      matchConfidence: Number(element.getAttribute("data-match-confidence") ?? "0"),
      matchRowId: element.getAttribute("data-match-row-id") ?? "",
      matchStatus: element.getAttribute("data-match-status") ?? "",
      partNumber: element.getAttribute("data-part-number") ?? "",
      quantity: Number(element.getAttribute("data-quantity") ?? "0"),
      quantityConfidence: Number(element.getAttribute("data-quantity-confidence") ?? "0"),
      quantityEstimated: element.getAttribute("data-quantity-estimated") === "true",
      sourceItemIds: element.getAttribute("data-source-item-ids") ?? "",
      stepIndexes: element.getAttribute("data-step-indexes") ?? "",
    })),
  )
}

function createStepCoverageReport({
  baseUrl,
  bags,
  bomRows,
  callouts,
  colorGroups,
  csvPath,
  elapsedMs,
  exampleDir,
  expectedRows,
  manualPath,
  stepBomDebug,
}) {
  const bomQuantity = bomRows.reduce((sum, row) => sum + row.quantity, 0)
  const detectedCalloutQuantity = colorGroups.reduce((sum, group) => sum + group.quantity, 0)
  const matchedQuantityByRowId = colorGroups.reduce((rows, group) => {
    if (!group.matchRowId) {
      return rows
    }

    rows.set(group.matchRowId, (rows.get(group.matchRowId) ?? 0) + group.quantity)
    return rows
  }, new Map())
  const rowComparisons = bomRows.map((row) => {
    const detectedQuantity = matchedQuantityByRowId.get(row.rowId) ?? 0

    return {
      cataloguePartNumber: row.cataloguePartNumber,
      colorId: row.colorId,
      colorName: row.colorName,
      detectedQuantity,
      delta: detectedQuantity - row.quantity,
      expectedQuantity: row.quantity,
      partNumber: row.partNumber,
      rowId: row.rowId,
      sourcePage: row.sourcePage,
    }
  })
  const unmatchedGroups = colorGroups.filter((group) => !group.matchRowId)
  const exactRowMatches = rowComparisons.filter((row) => row.delta === 0)
  const missingRows = rowComparisons.filter((row) => row.delta < 0)
  const overfilledRows = rowComparisons.filter((row) => row.delta > 0)
  const estimatedColorGroups = colorGroups.filter((group) => group.quantityEstimated)
  const colorSummary = [...colorGroups.reduce((groups, group) => {
    const key = group.colorName.trim().toLowerCase()
    const existing = groups.get(key) ?? {
      colorName: group.colorName,
      itemCount: 0,
      quantity: 0,
      quantityEstimated: false,
    }

    existing.itemCount += group.itemCount
    existing.quantity += group.quantity
    existing.quantityEstimated = existing.quantityEstimated || group.quantityEstimated
    groups.set(key, existing)
    return groups
  }, new Map()).values()].sort((left, right) => left.colorName.localeCompare(right.colorName))

  return {
    baseUrl,
    elapsedMs,
    example: {
      id: basename(exampleDir),
      path: relative(repoRoot, exampleDir),
    },
    expected: {
      csvPath: relative(repoRoot, csvPath),
      quantity: expectedRows.reduce((sum, row) => sum + row.quantity, 0),
      rows: expectedRows.length,
    },
    manualPath: relative(repoRoot, manualPath),
    summary: {
      bags: bags.length,
      bomQuantity,
      bomRows: bomRows.length,
      callouts: callouts.length,
      colorGroupColors: colorSummary.length,
      colorGroups: colorGroups.length,
      coverageRate: ratio(exactRowMatches.reduce((sum, row) => sum + row.expectedQuantity, 0), bomQuantity),
      detectedCalloutQuantity,
      estimatedColorGroups: estimatedColorGroups.length,
      estimatedQuantity: estimatedColorGroups.reduce((sum, group) => sum + group.quantity, 0),
      exactRowMatches: exactRowMatches.length,
      extraDetectedQuantity: overfilledRows.reduce((sum, row) => sum + row.delta, 0) +
        unmatchedGroups.reduce((sum, group) => sum + group.quantity, 0),
      missingDetectedQuantity: missingRows.reduce((sum, row) => sum + Math.abs(row.delta), 0),
      missingRows: missingRows.length,
      overfilledRows: overfilledRows.length,
      quantityDelta: detectedCalloutQuantity - bomQuantity,
      unmatchedGroups: unmatchedGroups.length,
      unmatchedQuantity: unmatchedGroups.reduce((sum, group) => sum + group.quantity, 0),
    },
    bags,
    callouts,
    colorGroups,
    colorSummary,
    stepBomDebug,
    rowComparisons,
  }
}

function readExpectedRows(csvPath) {
  const [headers = [], ...records] = parseCsv(readFileSync(csvPath, "utf8"))
  const normalizedHeaders = headers.map((header) => header.trim().toLowerCase())
  const partIndex = normalizedHeaders.indexOf("part")
  const colorIndex = normalizedHeaders.indexOf("color")
  const quantityIndex = normalizedHeaders.indexOf("qty")

  return records
    .map((record) => ({
      colorId: record[colorIndex] ?? "",
      partNumber: record[partIndex] ?? "",
      quantity: Number(record[quantityIndex] ?? "0"),
    }))
    .filter((row) => row.partNumber && row.colorId && Number.isFinite(row.quantity) && row.quantity > 0)
}

function parseCsv(text) {
  const rows = []
  let current = ""
  let row = []
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? ""
    const next = text[index + 1] ?? ""

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      index += 1
      continue
    }
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (char === "," && !inQuotes) {
      row.push(current)
      current = ""
      continue
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1
      }
      row.push(current)
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row)
      }
      row = []
      current = ""
      continue
    }

    current += char
  }

  row.push(current)
  if (row.some((cell) => cell.trim() !== "")) {
    rows.push(row)
  }

  return rows
}

function findFirstFile(directory, extensions) {
  if (!existsSync(directory)) {
    return null
  }

  return readdirSync(directory)
    .map((entry) => join(directory, entry))
    .find((entry) => extensions.includes(extname(entry).toLowerCase())) ?? null
}

function normalizeLocalhostBaseUrl(rawBaseUrl) {
  const url = new URL(rawBaseUrl)
  if (url.hostname === "127.0.0.1") {
    url.hostname = "localhost"
  }

  return url.toString()
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0
}

function parseArgs(args) {
  const parsed = {
    analysisTimeoutMs: 600_000,
    baseUrl: "",
    help: false,
    input: "",
    outputPath: "",
    sessionOutputPath: "",
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ""
    if (arg === "--help" || arg === "-h") {
      parsed.help = true
      continue
    }
    if (arg === "--base-url") {
      parsed.baseUrl = args[++index] ?? ""
      continue
    }
    if (arg.startsWith("--base-url=")) {
      parsed.baseUrl = arg.slice("--base-url=".length)
      continue
    }
    if (arg === "--output") {
      parsed.outputPath = resolve(args[++index] ?? "")
      continue
    }
    if (arg.startsWith("--output=")) {
      parsed.outputPath = resolve(arg.slice("--output=".length))
      continue
    }
    if (arg === "--session-output") {
      parsed.sessionOutputPath = resolve(args[++index] ?? "")
      continue
    }
    if (arg.startsWith("--session-output=")) {
      parsed.sessionOutputPath = resolve(arg.slice("--session-output=".length))
      continue
    }
    if (arg.startsWith("--analysis-timeout-ms=")) {
      parsed.analysisTimeoutMs = Number(arg.slice("--analysis-timeout-ms=".length))
      continue
    }

    parsed.input = arg
  }

  return parsed
}

function printUsage() {
  console.log(`Usage:
  node scripts/validate-manual-steps.mjs [example-dir] [--output .bag-it/private/step-validation/castle-ramp.json]

Runs the browser app against a local manual and reports draft bag callouts,
color groups, and quantity totals. Defaults to the private Castle Ramp
expected-example directory.

Options:
  --base-url <url>          App URL. Defaults to BAG_IT_BASE_URL or http://localhost:3000.
  --output <path>          Write the JSON report to a path under .bag-it/private/.
  --session-output <path>  Download the analyzed Bag It session JSON to a path.
  --analysis-timeout-ms=<ms>
                            Per-manual browser analysis timeout. Default 600000.
`)
}
