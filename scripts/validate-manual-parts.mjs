import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, extname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const repoRoot = fileURLToPath(new URL("../", import.meta.url))
const defaultExample = join(repoRoot, "examples", "small", "MOC-120645")
const defaultSuiteRoot = join(repoRoot, "examples")
const defaultSuiteExclusions = new Set(["MOC-138457"])
const options = parseArgs(process.argv.slice(2))
const baseUrl = createValidationBaseUrl(
  normalizeLocalhostBaseUrl(process.env.BAG_IT_BASE_URL ?? "http://localhost:3000"),
  options.ocrProfile,
)
const catalogueDir = process.env.BAG_IT_CATALOGUE_DIR?.trim()
  ? resolve(process.env.BAG_IT_CATALOGUE_DIR)
  : join(repoRoot, ".bag-it", "private", "catalogue")
const expectedColorAliasByNormalizedName = new Map([
  ["satin clear", "1055"],
  ["satin trans clear", "1055"],
])

if (options.help) {
  printUsage()
  process.exit(0)
}

const suiteDiscovery = options.suite ? discoverExampleSuite(options.inputs) : null
const exampleDirs = suiteDiscovery?.exampleDirs ?? (
  options.inputs.length > 0 ? options.inputs.map((input) => resolve(input)) : [defaultExample]
)

if (options.listSuite) {
  console.log(JSON.stringify({
    examples: exampleDirs.map((exampleDir) => createExampleIdentity(exampleDir)),
    skipped: suiteDiscovery?.skipped ?? [],
  }, null, 2))
  process.exit(0)
}

if (exampleDirs.length === 0) {
  throw new Error("No manual validation examples found. Provide an example directory or add private examples locally.")
}

const catalogue = loadCatalogue(catalogueDir)
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() || chromium.executablePath()
const browser = await chromium.launch({
  executablePath: chromiumExecutablePath,
  args: ["--disable-features=MachPortRendezvous"],
})

try {
  const results = []

  for (const exampleDir of exampleDirs) {
    console.error(`[manual-validation] ${relative(repoRoot, exampleDir)}`)
    const result = await validateExampleSafely(exampleDir)
    results.push(result)
    console.error(
      `[manual-validation] ${result.id}: ${result.status} ${result.metrics.acceptedRowMatchRate}/${result.metrics.acceptedQuantityMatchRate} in ${result.elapsedMs}ms`,
    )
  }

  const report = createValidationReport({
    baseUrl,
    catalogueDir,
    ocrProfile: options.ocrProfile,
    results,
    skipped: suiteDiscovery?.skipped ?? [],
    suite: options.suite,
  })
  const output = options.suite || options.redacted
    ? report
    : results.length === 1 ? results[0] : results

  if (options.outputPath) {
    mkdirSync(dirname(options.outputPath), { recursive: true })
    writeFileSync(options.outputPath, `${JSON.stringify(output, null, 2)}\n`)
  }

  console.log(JSON.stringify(output, null, 2))
  process.exitCode = shouldFailValidation(report) ? 1 : 0
} finally {
  await browser.close()
}

async function validateExample(exampleDir) {
  const manualPath = findFirstFile(exampleDir, [".pdf"])
  const csvPath = findFirstFile(exampleDir, [".csv"])
  if (!manualPath || !csvPath) {
    throw new Error(`Expected a PDF and CSV in ${exampleDir}`)
  }

  const page = await browser.newPage()
  if (options.ocrProfile) {
    await page.addInitScript((profile) => {
      window.sessionStorage.setItem("bagItOcrProfile", profile)
    }, options.ocrProfile)
  }
  const startedAt = Date.now()
  try {
    await page.goto(baseUrl)
    await page.getByLabel("Upload PDF manual").setInputFiles(manualPath)
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("button")).some(
        (button) => button.textContent?.includes("Bag it!") && !button.disabled,
      ),
      null,
      { timeout: 30_000 },
    )
    await page.getByRole("button", { name: "Bag it!" }).click()
    const partsReadyPromise = waitForPartsReady(page, startedAt)
    await page.getByText("Analysis complete").waitFor({
      timeout: options.analysisTimeoutMs,
    })
    const analysisCompleteElapsedMs = Date.now() - startedAt
    const partsReadyElapsedMs = await partsReadyPromise

    const actual = await readActualRows(page)
    const status = await readExtractionStatus(page)
    const ocrDiagnostics = await readOcrDiagnostics(page)
    const extractionPerformance = await readExtractionPerformance(page)
    const normalizationAttention = await readNormalizationAttentionSummary(page)
    const expected = readExpectedRows(csvPath)
    const comparison = compareRows({ actual, expected })
    const assertions = evaluateRowAssertions(actual, readRowAssertions(exampleDir))
    const metrics = createComparisonMetrics({ actual, comparison, expected })
    const normalizationMetrics = createNormalizationMetrics(actual, normalizationAttention)
    const identity = createExampleIdentity(exampleDir)
    const summary = await page.locator("text=/rows parsed|candidate pages checked/").first().textContent().catch(() => null)
    const stepCoverage = options.includeStepCoverage ? await readStepCoverage(page, actual) : null

    return {
      actualCount: actual.length,
      candidateCount: parseCandidateCount(summary),
      elapsedMs: analysisCompleteElapsedMs,
      ...identity,
      expectedCount: expected.length,
      metrics,
      normalizationMetrics,
      ...(extractionPerformance ? { extractionPerformance } : {}),
      ...(ocrDiagnostics ? { ocrDiagnostics } : {}),
      ...(assertions ? { assertions } : {}),
      rowsByPage: groupRowsByPage(actual),
      status,
      ...(stepCoverage ? { stepCoverage } : {}),
      timings: createValidationTimings({
        analysisCompleteElapsedMs,
        partsReadyElapsedMs,
      }),
      summary,
      ...(options.redacted ? {} : {
        csvPath: relative(repoRoot, csvPath),
        extra: comparison.extra,
        manualPath: relative(repoRoot, manualPath),
        matchedAliases: comparison.matchedAliases,
        missing: comparison.missing,
      }),
      ...(options.includeDebugRows ? { actualRows: actual.map(formatActualRow), ...(await readDebugDetails(page)) } : {}),
    }
  } finally {
    await page.close()
  }
}

async function waitForPartsReady(page, startedAt) {
  return page.locator("text=/rows parsed|candidate pages checked/").first().waitFor({
    timeout: options.analysisTimeoutMs,
  })
    .then(() => Date.now() - startedAt)
    .catch(() => null)
}

function createValidationTimings({ analysisCompleteElapsedMs, partsReadyElapsedMs }) {
  return {
    analysisCompleteElapsedMs,
    partsReadyElapsedMs,
    postPartsReadyElapsedMs: partsReadyElapsedMs == null ? null : analysisCompleteElapsedMs - partsReadyElapsedMs,
  }
}

async function validateExampleSafely(exampleDir) {
  const startedAt = Date.now()
  try {
    return await validateExample(exampleDir)
  } catch (error) {
    return createFailedValidationResult(exampleDir, error, Date.now() - startedAt)
  }
}

function createFailedValidationResult(exampleDir, error, elapsedMs) {
  const identity = createExampleIdentity(exampleDir)
  const csvPath = findFirstFile(exampleDir, [".csv"])
  const expected = csvPath ? readExpectedRows(csvPath) : []
  const comparison = compareRows({ actual: [], expected })
  const assertions = evaluateRowAssertions([], readRowAssertions(exampleDir))
  const metrics = createComparisonMetrics({ actual: [], comparison, expected })
  const normalizationMetrics = createNormalizationMetrics([], { rowCount: 0, visibleRowCount: 0 })

  return {
    actualCount: 0,
    candidateCount: null,
    elapsedMs,
    ...identity,
    error: {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : "Error",
    },
    expectedCount: expected.length,
    metrics,
    normalizationMetrics,
    ...(assertions ? { assertions } : {}),
    rowsByPage: {},
    status: "failed",
    summary: null,
  }
}

async function readExtractionStatus(page) {
  for (const status of ["Supported", "Needs attention", "Unsupported"]) {
    if (await page.getByText(status, { exact: true }).isVisible().catch(() => false)) {
      return status.toLowerCase().replace(/\s+/g, "_")
    }
  }

  return "unknown"
}

function createValidationBaseUrl(rawBaseUrl, ocrProfile) {
  if (!ocrProfile) {
    return rawBaseUrl
  }

  const url = new URL(rawBaseUrl)
  url.searchParams.set("bagItOcrProfile", ocrProfile)

  return url.toString()
}

function normalizeLocalhostBaseUrl(rawBaseUrl) {
  const url = new URL(rawBaseUrl)
  if (url.hostname === "127.0.0.1") {
    url.hostname = "localhost"
  }

  return url.toString()
}

function createValidationReport({ baseUrl, catalogueDir, ocrProfile, results, skipped, suite }) {
  const totals = results.reduce(
    (summary, result) => {
      summary.actualCount += result.actualCount
      summary.compatibleMatchCount += result.metrics.compatibleMatchCount
      summary.elapsedMs += result.elapsedMs
      summary.exactMatchedQuantity += result.metrics.exactQuantity
      summary.expectedCount += result.expectedCount
      summary.expectedQuantity += result.metrics.expectedQuantity
      summary.extraCount += result.metrics.extraCount
      summary.extraQuantity += result.metrics.extraQuantity
      summary.assertionFailureCount += result.assertions?.failureCount ?? 0
      summary.matchedCount += result.metrics.matchedCount
      summary.matchedQuantity += result.metrics.matchedQuantity
      summary.missingCount += result.metrics.missingCount
      summary.normalizationAmbiguousQuantity += result.normalizationMetrics?.ambiguousQuantity ?? 0
      summary.normalizationAttentionMismatchCount += result.normalizationMetrics?.attentionListMatches ? 0 : 1
      summary.normalizationResolvedQuantity += result.normalizationMetrics?.resolvedQuantity ?? 0
      summary.normalizationTotalQuantity += result.normalizationMetrics?.totalQuantity ?? 0
      summary.normalizationUnresolvedQuantity += result.normalizationMetrics?.unresolvedQuantity ?? 0
      return summary
    },
    {
      actualCount: 0,
      compatibleMatchCount: 0,
      elapsedMs: 0,
      exactMatchedQuantity: 0,
      expectedCount: 0,
      expectedQuantity: 0,
      extraCount: 0,
      extraQuantity: 0,
      assertionFailureCount: 0,
      matchedCount: 0,
      matchedQuantity: 0,
      missingCount: 0,
      normalizationAmbiguousQuantity: 0,
      normalizationAttentionMismatchCount: 0,
      normalizationResolvedQuantity: 0,
      normalizationTotalQuantity: 0,
      normalizationUnresolvedQuantity: 0,
    },
  )
  const summary = {
    ...totals,
    acceptedQuantityMatchRate: ratio(totals.matchedQuantity, totals.expectedQuantity),
    acceptedRowMatchRate: ratio(totals.matchedCount, totals.expectedCount),
    exactQuantityMatchRate: ratio(totals.exactMatchedQuantity, totals.expectedQuantity),
    exactRowMatchRate: ratio(totals.matchedCount - totals.compatibleMatchCount, totals.expectedCount),
    normalizationQuantityMatchRate: ratio(totals.normalizationResolvedQuantity, totals.normalizationTotalQuantity),
  }
  const exactGates = options.requireExact
    ? {
        exactQuantity: summary.exactQuantityMatchRate === 1,
        exactRows: summary.exactRowMatchRate === 1,
        noCompatibleAliases: summary.compatibleMatchCount === 0,
        noDiff: summary.extraCount === 0 && summary.extraQuantity === 0 && summary.missingCount === 0,
      }
    : {}
  const gates = {
    ...(options.expectUnsupported
      ? {
          unsupported: results.every(
            (result) =>
              result.status === "unsupported" &&
              result.actualCount === 0 &&
              result.candidateCount === 0,
          ),
        }
      : {
          normalizationAttentionList: summary.normalizationAttentionMismatchCount === 0,
          normalizationQuantityWeighted: summary.normalizationQuantityMatchRate >= 0.9,
          quantityWeighted: summary.acceptedQuantityMatchRate >= options.minQuantityMatchRate,
          rowMatch: summary.acceptedRowMatchRate >= options.minRowMatchRate,
          ...exactGates,
        }),
  }

  return {
    baseUrl,
    catalogueDir: relative(repoRoot, catalogueDir),
    generatedAt: new Date().toISOString(),
    gates,
    ...(ocrProfile ? { ocrProfile } : {}),
    thresholds: {
      minQuantityMatchRate: options.minQuantityMatchRate,
      minRowMatchRate: options.minRowMatchRate,
    },
    mode: suite ? "suite" : "examples",
    results,
    skipped,
    summary,
  }
}

function shouldFailValidation(report) {
  if (report.results.some((result) => (result.assertions?.failureCount ?? 0) > 0)) {
    return true
  }

  if (options.expectUnsupported) {
    return !report.gates.unsupported
  }

  if (options.requireExact) {
    return (
      report.summary.compatibleMatchCount > 0 ||
      report.summary.exactQuantityMatchRate !== 1 ||
      report.summary.exactRowMatchRate !== 1 ||
      report.summary.extraCount > 0 ||
      report.summary.extraQuantity > 0 ||
      report.summary.missingCount > 0
    )
  }

  if (options.failOnGates) {
    return Object.values(report.gates).some((passed) => !passed)
  }

  if (options.failOnDiff || !options.suite) {
    return report.summary.missingCount > 0 || report.summary.extraCount > 0
  }

  return false
}

function discoverExampleSuite(inputs) {
  const roots = inputs.length > 0 ? inputs.map((input) => resolve(input)) : [defaultSuiteRoot]
  const excludedNames = new Set([...defaultSuiteExclusions, ...options.excludedNames])
  const exampleDirs = []
  const skipped = []

  for (const root of roots) {
    walkDirectories(root, (directory) => {
      const entries = readFileNames(directory)
      const csvFiles = entries.filter((entry) => extname(entry).toLowerCase() === ".csv")
      const pdfFiles = entries.filter((entry) => extname(entry).toLowerCase() === ".pdf")

      if (csvFiles.length === 0 && pdfFiles.length === 0) {
        return
      }

      const identity = createExampleIdentity(directory)
      if (excludedNames.has(identity.id)) {
        skipped.push({ ...identity, reason: "excluded" })
        return
      }

      if (csvFiles.length !== 1 || pdfFiles.length !== 1) {
        skipped.push({
          ...identity,
          csvFileCount: csvFiles.length,
          pdfFileCount: pdfFiles.length,
          reason: "expected exactly one PDF and one CSV",
        })
        return
      }

      exampleDirs.push(directory)
    })
  }

  return {
    exampleDirs: exampleDirs.sort((left, right) => relative(repoRoot, left).localeCompare(relative(repoRoot, right))),
    skipped,
  }
}

function walkDirectories(directory, visit) {
  if (!existsSync(directory)) {
    return
  }

  visit(directory)

  for (const entry of readFileNames(directory)) {
    const child = join(directory, entry)
    if (isDirectory(child)) {
      walkDirectories(child, visit)
    }
  }
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function createExampleIdentity(exampleDir) {
  return {
    category: basename(dirname(exampleDir)),
    id: basename(exampleDir),
    path: relative(repoRoot, exampleDir),
  }
}

function parseArgs(args) {
  const parsed = {
    excludedNames: [],
    failOnDiff: false,
    failOnGates: false,
    expectUnsupported: false,
    help: false,
    includeDebugRows: false,
    includeStepCoverage: false,
    inputs: [],
    listSuite: false,
    details: false,
    analysisTimeoutMs: 600_000,
    minQuantityMatchRate: 0.99,
    minRowMatchRate: 0.95,
    ocrProfile: "",
    outputPath: "",
    redacted: false,
    requireExact: false,
    suite: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ""

    if (arg === "--debug-rows") {
      parsed.includeDebugRows = true
      continue
    }

    if (arg === "--step-coverage") {
      parsed.includeStepCoverage = true
      continue
    }

    if (arg === "--details") {
      parsed.details = true
      continue
    }

    if (arg === "--exclude") {
      parsed.excludedNames.push(args[++index] ?? "")
      continue
    }

    if (arg.startsWith("--exclude=")) {
      parsed.excludedNames.push(arg.slice("--exclude=".length))
      continue
    }

    if (arg === "--fail-on-diff") {
      parsed.failOnDiff = true
      continue
    }

    if (arg === "--fail-on-gates") {
      parsed.failOnGates = true
      continue
    }

    if (arg === "--expect-unsupported") {
      parsed.expectUnsupported = true
      continue
    }

    if (arg.startsWith("--analysis-timeout-ms=")) {
      parsed.analysisTimeoutMs = Number(arg.slice("--analysis-timeout-ms=".length))
      continue
    }

    if (arg === "--ocr-profile") {
      parsed.ocrProfile = parseOcrProfile(args[++index] ?? "")
      continue
    }

    if (arg.startsWith("--ocr-profile=")) {
      parsed.ocrProfile = parseOcrProfile(arg.slice("--ocr-profile=".length))
      continue
    }

    if (arg === "--help" || arg === "-h") {
      parsed.help = true
      continue
    }

    if (arg === "--list-suite") {
      parsed.listSuite = true
      parsed.suite = true
      parsed.redacted = true
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

    if (arg === "--redacted") {
      parsed.redacted = true
      continue
    }

    if (arg === "--require-exact") {
      parsed.requireExact = true
      continue
    }

    if (arg === "--suite") {
      parsed.suite = true
      continue
    }

    if (arg.startsWith("--min-row-match=")) {
      parsed.minRowMatchRate = Number(arg.slice("--min-row-match=".length))
      continue
    }

    if (arg.startsWith("--min-quantity-match=")) {
      parsed.minQuantityMatchRate = Number(arg.slice("--min-quantity-match=".length))
      continue
    }

    parsed.inputs.push(arg)
  }

  return {
    ...parsed,
    redacted: parsed.redacted || (parsed.suite && !parsed.details && !parsed.includeDebugRows),
  }
}

function parseOcrProfile(profile) {
  if (["auto", "baseline", "split3", "split4"].includes(profile)) {
    return profile === "auto" ? "" : profile
  }

  throw new Error(`Unknown OCR validation profile: ${profile || "(empty)"}`)
}

function printUsage() {
  console.log(`Usage:
  node scripts/validate-manual-parts.mjs [example-dir ...]
  node scripts/validate-manual-parts.mjs --suite [root-dir ...] [--output .bag-it/private/validation/latest.json]

Runs the browser app against local private manuals and compares extracted BOM rows with local CSV expectations.

Options:
  --suite                  Discover one-PDF/one-CSV example directories under the provided roots or examples/.
  --list-suite             Print discovered suite entries and skipped directories without launching a browser.
  --redacted               Omit row-level missing/extra details from output.
  --details                Include row-level missing/extra details.
  --debug-rows             Include private raw debug OCR text and row diagnostics. Do not commit this output.
  --step-coverage          Include draft bag callout and color-group quantity coverage.
  --exclude <id>           Exclude an example directory by basename. MOC-138457 is excluded by default.
  --output <path>          Write the JSON report to a path, typically under .bag-it/private/.
  --fail-on-diff           Exit non-zero if any missing or extra rows are reported.
  --fail-on-gates          Exit non-zero if accepted row or quantity thresholds fail.
  --require-exact          Exit non-zero unless exact row and quantity match rates are 1, with no compatible aliases or diffs.
  --expect-unsupported     Exit non-zero unless every provided manual reports unsupported with zero candidate pages and zero extracted rows.
  --analysis-timeout-ms=<ms>
                           Per-manual browser analysis timeout. Default 600000.
  --ocr-profile=<profile>  Validation OCR profile: baseline, split3, split4, or auto.
  --min-row-match=<rate>   Accepted row-match gate. Default 0.95.
  --min-quantity-match=<rate>
                           Accepted quantity-weighted gate. Default 0.99.
`)
}

async function readDebugDetails(page) {
  const diagnosticsPanel = await getDiagnosticsPanel(page)
  if (!diagnosticsPanel) {
    return { debugPageTexts: [], debugRows: [] }
  }

  const candidatePages = diagnosticsPanel.getByTestId("debug-candidate-page")
  const candidatePageCount = await candidatePages.count()

  for (let index = 0; index < candidatePageCount; index += 1) {
    await candidatePages.nth(index).getByRole("button").click()
  }

  const debugPageTexts = await diagnosticsPanel.getByTestId("debug-page-ocr-text").evaluateAll((elements) =>
    elements.map((element) => element.textContent ?? ""),
  )
  const debugRows = await diagnosticsPanel.getByTestId("debug-part-row").evaluateAll((elements) =>
    elements.map((element) => ({
      page: Number(element.getAttribute("data-source-page") ?? "0"),
      part: element.getAttribute("data-part-number") ?? "",
      region: element.getAttribute("data-source-region") ?? "",
      text: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
    })),
  )

  return { debugPageTexts, debugRows }
}

async function readOcrDiagnostics(page) {
  const diagnosticsPanel = await getDiagnosticsPanel(page)
  if (!diagnosticsPanel) {
    return null
  }

  const pages = await diagnosticsPanel.getByTestId("debug-candidate-page").evaluateAll((elements) => {
    const numberAttribute = (element, attributeName) => {
      const value = Number(element.getAttribute(attributeName) ?? "0")
      return Number.isFinite(value) ? value : 0
    }

    return elements.map((element) => ({
      denseCropImageCount: numberAttribute(element, "data-ocr-dense-crop-image-count"),
      denseCropRecognizeMs: numberAttribute(element, "data-ocr-dense-crop-recognize-ms"),
      fullPageRecognizeMs: numberAttribute(element, "data-ocr-full-page-recognize-ms"),
      page: numberAttribute(element, "data-page-number"),
      recognizeCallCount: numberAttribute(element, "data-ocr-recognize-call-count"),
      recognizeMs: numberAttribute(element, "data-ocr-recognize-ms"),
      renderMs: numberAttribute(element, "data-ocr-render-ms"),
    }))
  })
  const ocrPages = pages.filter((page) => page.recognizeMs > 0 || page.renderMs > 0)
  if (ocrPages.length === 0) {
    return null
  }

  return {
    denseCropImageCount: sum(ocrPages, "denseCropImageCount"),
    denseCropRecognizeMs: sum(ocrPages, "denseCropRecognizeMs"),
    fullPageRecognizeMs: sum(ocrPages, "fullPageRecognizeMs"),
    pageCount: ocrPages.length,
    pages: ocrPages,
    recognizeCallCount: sum(ocrPages, "recognizeCallCount"),
    recognizeMs: sum(ocrPages, "recognizeMs"),
    renderMs: sum(ocrPages, "renderMs"),
  }
}

async function getDiagnosticsPanel(page) {
  const debugTab = page.getByRole("tab", { name: /debug/i })
  if (await debugTab.isVisible().catch(() => false)) {
    await debugTab.click()
  }

  const diagnosticsPanel = page.getByTestId("parts-list-extraction-performance")
  if (!(await diagnosticsPanel.isVisible().catch(() => false))) {
    return null
  }

  return diagnosticsPanel
}

async function readExtractionPerformance(page) {
  const performancePanel = page.getByTestId("parts-list-extraction-performance")
  if (!(await performancePanel.isVisible().catch(() => false))) {
    return null
  }

  const performance = await performancePanel.evaluate((element) => {
    const numberAttribute = (attributeName) => {
      const value = Number(element.getAttribute(attributeName) ?? "0")
      return Number.isFinite(value) ? value : 0
    }

    return {
      nativeTextMs: numberAttribute("data-extraction-native-text-ms"),
      ocrDetectionMs: numberAttribute("data-extraction-ocr-detection-ms"),
      ocrCandidateProcessingMs: numberAttribute("data-extraction-ocr-candidate-processing-ms"),
      ocrResultParseMs: numberAttribute("data-extraction-ocr-result-parse-ms"),
      ocrRefinementMs: numberAttribute("data-extraction-ocr-refinement-ms"),
      sourceOrderedProgressMs: numberAttribute("data-extraction-source-ordered-progress-ms"),
      totalMs: numberAttribute("data-extraction-total-ms"),
    }
  })

  return Object.values(performance).some((value) => value > 0) ? performance : null
}

function sum(items, key) {
  return items.reduce((total, item) => total + (item[key] ?? 0), 0)
}

async function readActualRows(page) {
  return page.getByTestId("extracted-part-row").evaluateAll((elements) =>
    elements.map((element) => ({
      colorId: element.getAttribute("data-color-id") ?? "",
      colorName: element.getAttribute("data-color-name") ?? "",
      confidence: Number(element.getAttribute("data-confidence") ?? "0"),
      normalizedPart: element.getAttribute("data-catalogue-part-number") ?? "",
      normalizationStatus: element.getAttribute("data-normalization-status") ?? "",
      part: element.getAttribute("data-part-number") ?? "",
      page: Number(element.getAttribute("data-source-page") ?? "0"),
      quantity: Number(element.getAttribute("data-quantity") ?? "0"),
      rowId: element.getAttribute("data-row-id") ?? "",
    })),
  )
}

async function readStepCoverage(page, bomRows) {
  const bagsTab = page.getByRole("tab", { name: "Bags" })
  const panel = page.getByTestId("step-callouts-panel")

  if (await bagsTab.isVisible().catch(() => false)) {
    await bagsTab.click()
    await panel.waitFor({ timeout: 30_000 }).catch(() => null)
  } else {
    await panel.waitFor({ timeout: 1_000 }).catch(() => null)
  }

  if (!(await panel.isVisible().catch(() => false))) {
    return {
      available: false,
      summary: createEmptyStepCoverageSummary(bomRows),
    }
  }

  const bags = await page.getByTestId("step-callout-bag").evaluateAll((elements) =>
    elements.map((element) => ({
      pageRange: element.getAttribute("data-page-range") ?? "",
      partCount: Number(element.getAttribute("data-part-count") ?? "0"),
      policySetSize: element.getAttribute("data-policy-set-size") ?? "",
      status: element.getAttribute("data-bag-status") ?? "",
      stepCount: Number(element.getAttribute("data-step-count") ?? "0"),
      stepRange: element.getAttribute("data-step-range") ?? "",
    })),
  )
  const callouts = await page.getByTestId("step-callout-card").evaluateAll((elements) =>
    elements.map((element) => ({
      pageNumber: Number(element.getAttribute("data-page-number") ?? "0"),
      partTypeCount: Number(element.getAttribute("data-part-type-count") ?? "0"),
      sourceRegion: element.getAttribute("data-source-region") ?? "",
      stepIndex: Number(element.getAttribute("data-step-index") ?? "0"),
    })),
  )
  const colorGroups = await page.getByTestId("step-callout-bag-part-group").evaluateAll((elements) =>
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

  return createStepCoverage({ bags, bomRows, callouts, colorGroups })
}

function createStepCoverage({ bags, bomRows, callouts, colorGroups }) {
  const totalBomQuantity = bomRows.reduce((sum, row) => sum + row.quantity, 0)
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
      cataloguePartNumber: row.normalizedPart || row.cataloguePartNumber || "",
      colorId: row.colorId,
      colorName: row.colorName,
      detectedQuantity,
      delta: detectedQuantity - row.quantity,
      expectedQuantity: row.quantity,
      partNumber: row.part || row.partNumber || "",
      rowId: row.rowId,
      sourcePage: row.page || row.sourcePage || 0,
    }
  })
  const exactRowMatches = rowComparisons.filter((row) => row.delta === 0)
  const missingRows = rowComparisons.filter((row) => row.delta < 0)
  const overfilledRows = rowComparisons.filter((row) => row.delta > 0)
  const unresolvedGroups = colorGroups.filter((group) => !group.matchRowId)
  const matchedQuantity = exactRowMatches.reduce((sum, row) => sum + row.expectedQuantity, 0)
  const extraDetectedQuantity = overfilledRows.reduce((sum, row) => sum + row.delta, 0) +
    unresolvedGroups.reduce((sum, group) => sum + group.quantity, 0)
  const missingDetectedQuantity = missingRows.reduce((sum, row) => sum + Math.abs(row.delta), 0)
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
    available: true,
    bags,
    callouts,
    colorSummary,
    summary: {
      bomQuantity: totalBomQuantity,
      bomRows: bomRows.length,
      bags: bags.length,
      callouts: callouts.length,
      colorGroupColors: colorSummary.length,
      colorGroups: colorGroups.length,
      calloutCoverageRate: ratio(matchedQuantity, totalBomQuantity),
      calloutCoveredQuantity: matchedQuantity,
      candidateCoverageRate: ratio(matchedQuantity, totalBomQuantity),
      candidateCoveredQuantity: matchedQuantity,
      coverageRate: ratio(matchedQuantity, totalBomQuantity),
      coveredQuantity: matchedQuantity,
      detectedCalloutQuantity,
      estimatedColorGroups: estimatedColorGroups.length,
      estimatedQuantity: estimatedColorGroups.reduce((sum, group) => sum + group.quantity, 0),
      exactRowMatches: exactRowMatches.length,
      extraDetectedQuantity,
      extraMatchedQuantity: extraDetectedQuantity,
      matchedStepQuantity: 0,
      missingDetectedQuantity,
      missingQuantity: missingDetectedQuantity,
      missingRows: missingRows.length,
      overfilledRows: overfilledRows.length,
      quantityDelta: detectedCalloutQuantity - totalBomQuantity,
      remainderQuantity: 0,
      remainderRows: 0,
      stepItems: 0,
      unresolvedItems: unresolvedGroups.length,
      unresolvedQuantity: unresolvedGroups.reduce((sum, group) => sum + group.quantity, 0),
    },
    rowComparisons,
    ...(options.details || options.includeDebugRows ? { colorGroups } : {}),
  }
}

function createEmptyStepCoverageSummary(bomRows) {
  const bomQuantity = bomRows.reduce((sum, row) => sum + row.quantity, 0)

  return {
    ambiguousStepQuantity: 0,
    bomQuantity,
    bomRows: bomRows.length,
    bags: 0,
    callouts: 0,
    candidateCoverageRate: 0,
    candidateCoveredQuantity: 0,
    calloutCoverageRate: 0,
    calloutCoveredQuantity: 0,
    colorGroupColors: 0,
    colorGroups: 0,
    coverageRate: 0,
    coveredQuantity: 0,
    detectedCalloutQuantity: 0,
    estimatedColorGroups: 0,
    estimatedQuantity: 0,
    exactRowMatches: 0,
    extraDetectedQuantity: 0,
    extraMatchedQuantity: 0,
    matchedStepQuantity: 0,
    missingDetectedQuantity: bomQuantity,
    missingQuantity: bomQuantity,
    missingRows: bomRows.length,
    overfilledRows: 0,
    quantityDelta: -bomQuantity,
    remainderQuantity: 0,
    remainderRows: 0,
    stepItems: 0,
    unresolvedItems: 0,
    unresolvedQuantity: 0,
  }
}

async function readNormalizationAttentionSummary(page) {
  const attentionList = page.getByTestId("normalization-attention-list")
  if (await attentionList.count() === 0) {
    return { rowCount: 0, visibleRowCount: 0 }
  }

  const rowCount = await attentionList.first().evaluate((element) =>
    Number(element.getAttribute("data-normalization-attention-count") ?? "0"),
  )
  const visibleRowCount = await page.getByTestId("normalization-attention-row").count()

  return { rowCount, visibleRowCount }
}

function parseCandidateCount(summary) {
  const match = summary?.match(/(\d+)\s+candidate pages?/)
  return match ? Number(match[1]) : null
}

function readExpectedRows(csvPath) {
  const rows = parseCsv(readFileSync(csvPath, "utf8"))
  const [headers = [], ...records] = rows
  const normalizedHeaders = headers.map((header) => header.trim().toLowerCase())
  const fixturePageIndex = normalizedHeaders.indexOf("page")
  const fixtureColumnIndex = normalizedHeaders.indexOf("column")
  const fixturePartIndex = normalizedHeaders.indexOf("part")
  const fixtureColorIndex = normalizedHeaders.indexOf("color")
  const fixtureQuantityIndex = normalizedHeaders.indexOf("qty")

  if (
    fixturePageIndex >= 0 &&
    fixtureColumnIndex >= 0 &&
    fixturePartIndex >= 0 &&
    fixtureColorIndex >= 0 &&
    fixtureQuantityIndex >= 0
  ) {
    return records
      .map((row, index) => {
        if (row.length !== headers.length) {
          throw new Error(
            `Malformed fixture CSV row ${index + 2} in ${csvPath}: expected ${headers.length} columns, got ${row.length}`,
          )
        }

        const color = resolveExpectedColor(row[fixtureColorIndex] ?? "")
        return {
          colorId: color.colorId,
          colorName: color.colorName,
          column: Number(row[fixtureColumnIndex] ?? "0"),
          part: normalizePart(row[fixturePartIndex] ?? ""),
          page: Number(row[fixturePageIndex] ?? "0"),
          quantity: Number(row[fixtureQuantityIndex] ?? "0"),
        }
      })
      .filter(
        (row) =>
          row.part &&
          row.colorId &&
          Number.isInteger(row.quantity) &&
          row.quantity > 0 &&
          Number.isInteger(row.page) &&
          row.page > 0,
      )
  }

  const partIndex = headers.indexOf("Part")
  const colorIndex = headers.indexOf("Color")
  const quantityIndex = headers.indexOf("Quantity")
  const spareIndex = headers.indexOf("Is Spare")

  if (partIndex < 0 || colorIndex < 0 || quantityIndex < 0) {
    throw new Error(`Expected Part, Color, and Quantity columns or page,column,qty,part,color columns in ${csvPath}`)
  }

  return records
    .map((row) => {
      const color = resolveExpectedColor(row[colorIndex] ?? "")
      return {
        colorId: color.colorId,
        colorName: color.colorName,
        isSpare: (row[spareIndex] ?? "False").trim().toLowerCase() === "true",
        part: normalizePart(row[partIndex] ?? ""),
        quantity: Number(row[quantityIndex] ?? "0"),
      }
    })
    .filter((row) => !row.isSpare && row.part && row.colorId && Number.isInteger(row.quantity) && row.quantity > 0)
}

function readRowAssertions(exampleDir) {
  const assertionsPath = join(exampleDir, "row-assertions.json")
  if (!existsSync(assertionsPath)) {
    return null
  }

  const payload = JSON.parse(readFileSync(assertionsPath, "utf8"))
  const mustInclude = Array.isArray(payload.mustInclude)
    ? payload.mustInclude.map(normalizeAssertionRow).filter(Boolean)
    : []
  const mustExclude = Array.isArray(payload.mustExclude)
    ? payload.mustExclude.map(normalizeAssertionRow).filter(Boolean)
    : []

  return {
    mustExclude,
    mustInclude,
    path: relative(repoRoot, assertionsPath),
  }
}

function normalizeAssertionRow(row) {
  if (!row || typeof row !== "object") {
    return null
  }

  const colorName = String(row.color ?? row.colorName ?? "").trim()
  const color = colorName ? resolveExpectedColor(colorName) : { colorId: "", colorName: "" }
  const page = Number(row.page ?? "0")
  const quantity = Number(row.quantity ?? row.qty ?? "0")
  const part = normalizePart(row.part ?? row.partNumber ?? "")

  if (!part || !Number.isInteger(page) || page <= 0) {
    return null
  }

  return {
    colorId: color.colorId,
    colorName: color.colorName,
    page,
    part,
    quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : null,
  }
}

function evaluateRowAssertions(actual, assertions) {
  if (!assertions || (assertions.mustInclude.length === 0 && assertions.mustExclude.length === 0)) {
    return null
  }

  const failures = []
  for (const expected of assertions.mustInclude) {
    if (!actual.some((row) => rowMatchesAssertion(row, expected, { requireQuantity: true }))) {
      failures.push({
        expected: formatAssertionRow(expected),
        kind: "missing_asserted_row",
      })
    }
  }

  for (const forbidden of assertions.mustExclude) {
    const actualRow = actual.find((row) =>
      rowMatchesAssertion(row, forbidden, { requireQuantity: Boolean(forbidden.quantity) }),
    )
    if (actualRow) {
      failures.push({
        actual: formatActualRow(actualRow),
        forbidden: formatAssertionRow(forbidden),
        kind: "forbidden_row_present",
      })
    }
  }

  return {
    checkedCount: assertions.mustInclude.length + assertions.mustExclude.length,
    failureCount: failures.length,
    failures,
    path: assertions.path,
  }
}

function rowMatchesAssertion(row, assertion, { requireQuantity }) {
  if (row.page !== assertion.page || normalizePart(row.part) !== assertion.part) {
    return false
  }

  if (assertion.colorId && row.colorId !== assertion.colorId) {
    return false
  }

  return !requireQuantity || row.quantity === assertion.quantity
}

function compareRows({ actual, expected }) {
  const remainingActual = actual.map((row, index) => ({ index, row }))
  const remainingExpected = expected.map((row, index) => ({ index, row }))
  const matches = []
  const matchedAliases = []

  for (let actualIndex = 0; actualIndex < remainingActual.length;) {
    const actualRow = remainingActual[actualIndex]?.row
    const match = actualRow ? findBestMatch(actualRow, remainingExpected) : null
    if (!match) {
      actualIndex += 1
      continue
    }

    remainingActual.splice(actualIndex, 1)
    remainingExpected.splice(match.remainingIndex, 1)
    addMatch({
      actual: actualRow,
      expected: match.expected.row,
      matchedAliases,
      matches,
      reason: match.reason,
    })
  }

  for (let expectedIndex = 0; expectedIndex < remainingExpected.length;) {
    const expectedRow = remainingExpected[expectedIndex]?.row
    const match = expectedRow ? findBestGroupMatch(expectedRow, remainingActual) : null
    if (!match) {
      expectedIndex += 1
      continue
    }

    const actualRows = match.remainingIndexes
      .map((remainingIndex) => remainingActual[remainingIndex]?.row)
      .filter(Boolean)

    for (const remainingIndex of [...match.remainingIndexes].sort((left, right) => right - left)) {
      remainingActual.splice(remainingIndex, 1)
    }
    remainingExpected.splice(expectedIndex, 1)
    addMatch({
      actual: createGroupedActualRow(actualRows),
      expected: expectedRow,
      matchedAliases,
      matches,
      reason: match.reason,
    })
  }

  return {
    extra: remainingActual.map(({ row }) => formatActualRow(row)),
    matches,
    matchedAliases,
    missing: remainingExpected.map(({ row }) => formatExpectedRow(row)),
  }
}

function addMatch({ actual, expected, matchedAliases, matches, reason }) {
  matches.push({
    actual,
    expected,
    reason,
  })
  if (reason !== "exact") {
    matchedAliases.push({
      actual: formatActualRow(actual),
      expected: formatExpectedRow(expected),
      reason,
    })
  }
}

function createComparisonMetrics({ actual, comparison, expected }) {
  const expectedQuantity = sumQuantities(expected)
  const matchedQuantity = sumQuantities(comparison.matches.map((match) => match.expected))
  const exactMatches = comparison.matches.filter((match) => match.reason === "exact")
  const exactQuantity = sumQuantities(exactMatches.map((match) => match.expected))
  const extraQuantity = sumQuantities(actual) - sumQuantities(comparison.matches.map((match) => match.actual))

  return {
    acceptedQuantityMatchRate: ratio(matchedQuantity, expectedQuantity),
    acceptedRowMatchRate: ratio(comparison.matches.length, expected.length),
    compatibleMatchCount: comparison.matches.length - exactMatches.length,
    exactQuantity,
    exactQuantityMatchRate: ratio(exactQuantity, expectedQuantity),
    exactRowMatchRate: ratio(exactMatches.length, expected.length),
    extraCount: comparison.extra.length,
    extraQuantity,
    matchedCount: comparison.matches.length,
    matchedQuantity,
    missingCount: comparison.missing.length,
    expectedQuantity,
  }
}

function createNormalizationMetrics(actualRows, attentionSummary) {
  const totalQuantity = sumQuantities(actualRows)
  const attentionExpectedRows = actualRows.filter((row) =>
    row.normalizationStatus === "ambiguous" || row.normalizationStatus === "unresolved"
  )
  const resolvedQuantity = sumQuantities(
    actualRows.filter((row) => row.normalizationStatus === "resolved" && row.normalizedPart && row.colorId),
  )
  const ambiguousQuantity = sumQuantities(
    actualRows.filter((row) => row.normalizationStatus === "ambiguous"),
  )
  const unresolvedQuantity = Math.max(0, totalQuantity - resolvedQuantity - ambiguousQuantity)

  return {
    ambiguousQuantity,
    attentionExpectedRowCount: attentionExpectedRows.length,
    attentionListMatches: attentionSummary.rowCount === attentionExpectedRows.length,
    attentionRowCount: attentionSummary.rowCount,
    attentionVisibleRowCount: attentionSummary.visibleRowCount,
    quantityMatchRate: ratio(resolvedQuantity, totalQuantity),
    resolvedQuantity,
    totalQuantity,
    unresolvedQuantity,
  }
}

function sumQuantities(rows) {
  return rows.reduce((total, row) => total + row.quantity, 0)
}

function ratio(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(6)) : 0
}

function findBestMatch(actualRow, remainingExpected) {
  return remainingExpected
    .map((expected, remainingIndex) => ({
      expected,
      remainingIndex,
      score: scoreRowMatch(actualRow, expected.row),
    }))
    .filter((candidate) => candidate.score)
    .sort((left, right) => left.score.rank - right.score.rank || left.remainingIndex - right.remainingIndex)
    .map((candidate) => ({
      expected: candidate.expected,
      reason: candidate.score.reason,
      remainingIndex: candidate.remainingIndex,
    }))[0] ?? null
}

function scoreRowMatch(actualRow, expectedRow) {
  if (expectedRow.page && actualRow.page !== expectedRow.page) {
    return null
  }

  if (actualRow.quantity !== expectedRow.quantity || !areCompatibleColors(actualRow.colorId, expectedRow.colorId)) {
    return null
  }

  return scorePartMatch(actualRow.part, expectedRow.part)
}

function scorePartMatch(actualRowPart, expectedRowPart) {
  const actualPart = normalizePart(actualRowPart)
  const expectedPart = normalizePart(expectedRowPart)

  if (actualPart === expectedPart) {
    return { rank: 0, reason: "exact" }
  }

  if (catalogue.externalPartAliasByPart.get(actualPart) === expectedPart) {
    return { rank: 1, reason: "external catalogue alias" }
  }

  if (isKnownSingleLetterMoldVariant(actualPart, expectedPart)) {
    return { rank: 2, reason: "missing mold suffix" }
  }

  if (areRelatedMoldParts(actualPart, expectedPart)) {
    return { rank: 3, reason: "Rebrickable alternate mold" }
  }

  if (areSamePrintedPartFamily(actualPart, expectedPart)) {
    return { rank: 4, reason: "printed part family" }
  }

  const expectedParent = catalogue.printParentByPart.get(expectedPart)
  if (expectedParent && actualPart === expectedParent) {
    return { rank: 5, reason: "print parent" }
  }

  return null
}

function findBestGroupMatch(expectedRow, remainingActual) {
  return findMinifigureLegComponentGroupMatch(expectedRow, remainingActual) ??
    findSplitCompatiblePartGroupMatch(expectedRow, remainingActual)
}

function findSplitCompatiblePartGroupMatch(expectedRow, remainingActual) {
  const candidates = remainingActual
    .map((actual, remainingIndex) => ({
      actual,
      partScore: scorePartMatch(actual.row.part, expectedRow.part),
      remainingIndex,
    }))
    .filter(({ actual, partScore }) =>
      partScore &&
      (!expectedRow.page || actual.row.page === expectedRow.page) &&
      actual.row.quantity > 0 &&
      actual.row.quantity <= expectedRow.quantity &&
      areCompatibleColors(actual.row.colorId, expectedRow.colorId),
    )
    .sort((left, right) =>
      left.partScore.rank - right.partScore.rank ||
      left.actual.row.quantity - right.actual.row.quantity ||
      left.remainingIndex - right.remainingIndex,
    )

  const subset = findQuantitySubset(candidates, expectedRow.quantity)
  if (!subset || subset.length < 2) {
    return null
  }

  return {
    reason: `split ${subset.map((candidate) => candidate.partScore.reason).join(" + ")}`,
    remainingIndexes: subset.map((candidate) => candidate.remainingIndex),
  }
}

function findMinifigureLegComponentGroupMatch(expectedRow, remainingActual) {
  const expectedPart = normalizePart(expectedRow.part)
  if (!/^970c\d+$/.test(expectedPart)) {
    return null
  }

  const requiredComponents = new Map([
    ["hip", new Set(["970", "3815"])],
    ["left-leg", new Set(["971", "3816"])],
    ["right-leg", new Set(["972", "3817"])],
  ])
  const remainingIndexes = []

  for (const componentParts of requiredComponents.values()) {
    const remainingIndex = remainingActual.findIndex(({ row }, index) =>
      !remainingIndexes.includes(index) &&
      (!expectedRow.page || row.page === expectedRow.page) &&
      row.quantity === expectedRow.quantity &&
      areCompatibleColors(row.colorId, expectedRow.colorId) &&
      componentParts.has(normalizePart(row.part)),
    )
    if (remainingIndex < 0) {
      return null
    }
    remainingIndexes.push(remainingIndex)
  }

  return {
    reason: "minifigure leg component group",
    remainingIndexes,
  }
}

function findQuantitySubset(candidates, targetQuantity) {
  const sorted = candidates.filter((candidate) => candidate.actual.row.quantity <= targetQuantity)

  function search(startIndex, remainingQuantity, selected) {
    if (remainingQuantity === 0) {
      return selected
    }

    for (let index = startIndex; index < sorted.length; index += 1) {
      const candidate = sorted[index]
      const quantity = candidate?.actual.row.quantity ?? 0
      if (quantity > remainingQuantity) {
        continue
      }

      const result = search(index + 1, remainingQuantity - quantity, [...selected, candidate])
      if (result) {
        return result
      }
    }

    return null
  }

  return search(0, targetQuantity, [])
}

function createGroupedActualRow(rows) {
  const [firstRow] = rows

  return {
    colorId: firstRow?.colorId ?? "",
    colorName: firstRow?.colorName ?? "",
    page: firstRow?.page ?? 0,
    part: rows.map((row) => normalizePart(row.part)).join(" + "),
    quantity: sumQuantities(rows),
  }
}

function areCompatibleColors(actualColorId, expectedColorId) {
  if (actualColorId === expectedColorId) {
    return true
  }

  return getColorAliasKey(actualColorId) === getColorAliasKey(expectedColorId)
}

function isKnownSingleLetterMoldVariant(actualPart, expectedPart) {
  if (!actualPart || !expectedPart || !expectedPart.startsWith(actualPart)) {
    return false
  }

  const suffix = expectedPart.slice(actualPart.length)
  return /^[a-z]$/.test(suffix) && catalogue.parts.has(expectedPart)
}

function getColorAliasKey(colorId) {
  switch (colorId) {
    case "1103":
    case "148":
      return "pearl-titanium"
    case "36":
    case "1102":
      return "trans-red"
    default:
      return colorId
  }
}

function areRelatedMoldParts(left, right) {
  if (!left || !right) {
    return false
  }

  return catalogue.moldFamilyByPart.get(left)?.has(right) ?? false
}

function areSamePrintedPartFamily(left, right) {
  const leftPrint = parsePrintedPart(left)
  const rightPrint = parsePrintedPart(right)

  return Boolean(leftPrint && rightPrint && leftPrint.base === rightPrint.base)
}

function parsePrintedPart(part) {
  const match = normalizePart(part).match(/^(\d+(?:[a-z]|c\d{2})?)(?:p|pb|pr|px)\d+$/)

  return match ? { base: match[1] ?? "" } : null
}

function formatActualRow(row) {
  return {
    colorId: row.colorId,
    colorName: row.colorName,
    page: row.page,
    part: normalizePart(row.part),
    quantity: row.quantity,
  }
}

function formatExpectedRow(row) {
  return {
    colorId: row.colorId,
    colorName: row.colorName,
    ...(row.column ? { column: row.column } : {}),
    ...(row.page ? { page: row.page } : {}),
    part: normalizePart(row.part),
    quantity: row.quantity,
  }
}

function formatAssertionRow(row) {
  return {
    ...(row.colorId ? { colorId: row.colorId } : {}),
    ...(row.colorName ? { colorName: row.colorName } : {}),
    page: row.page,
    part: normalizePart(row.part),
    ...(row.quantity ? { quantity: row.quantity } : {}),
  }
}

function groupRowsByPage(rows) {
  return rows.reduce((groups, row) => {
    const key = String(row.page)
    groups[key] = (groups[key] ?? 0) + 1
    return groups
  }, {})
}

function loadCatalogue(directory) {
  const colorIdByNormalizedName = new Map()
  const colorNameById = new Map()
  const colorsPath = join(directory, "colors.csv")
  if (existsSync(colorsPath)) {
    const [headers = [], ...records] = parseCsv(readFileSync(colorsPath, "utf8"))
    const idIndex = headers.indexOf("id")
    const nameIndex = headers.indexOf("name")
    for (const record of records) {
      const id = record[idIndex]?.trim() ?? ""
      const name = record[nameIndex]?.trim() ?? ""
      colorNameById.set(id, name)
      colorIdByNormalizedName.set(normalizeColorName(name), id)
    }
  }

  const parts = new Set()
  const partsPath = join(directory, "parts.csv")
  if (existsSync(partsPath)) {
    const [headers = [], ...records] = parseCsv(readFileSync(partsPath, "utf8"))
    const partIndex = headers.indexOf("part_num")
    for (const record of records) {
      const part = normalizePart(record[partIndex] ?? "")
      if (part) {
        parts.add(part)
      }
    }
  }

  const moldEdges = []
  const printParentByPart = new Map()
  const relationshipsPath = join(directory, "part_relationships.csv")
  if (existsSync(relationshipsPath)) {
    const [headers = [], ...records] = parseCsv(readFileSync(relationshipsPath, "utf8"))
    const typeIndex = headers.indexOf("rel_type")
    const childIndex = headers.indexOf("child_part_num")
    const parentIndex = headers.indexOf("parent_part_num")

    for (const record of records) {
      const type = record[typeIndex]?.trim() ?? ""
      const child = normalizePart(record[childIndex] ?? "")
      const parent = normalizePart(record[parentIndex] ?? "")
      if (!child || !parent) {
        continue
      }

      if (type === "P") {
        printParentByPart.set(child, parent)
      }

      if (type === "A" || type === "M") {
        moldEdges.push([child, parent])
      }
    }
  }

  return {
    colorIdByNormalizedName,
    colorNameById,
    externalPartAliasByPart: createExternalPartAliasMap(directory),
    moldFamilyByPart: createFamilyMap(moldEdges),
    parts,
    printParentByPart,
  }
}

function createExternalPartAliasMap(directory) {
  const aliases = new Map()
  const ldrawAliasesPath = join(directory, "ldraw_part_aliases.csv")

  if (existsSync(ldrawAliasesPath)) {
    const [headers = [], ...records] = parseCsv(readFileSync(ldrawAliasesPath, "utf8"))
    const aliasIndex = headers.indexOf("alias")
    const canonicalIndex = headers.indexOf("canonical")

    if (aliasIndex >= 0 && canonicalIndex >= 0) {
      for (const record of records) {
        const alias = normalizePart(record[aliasIndex] ?? "")
        const canonical = normalizePart(record[canonicalIndex] ?? "")
        if (alias && canonical && alias !== canonical) {
          aliases.set(alias, canonical)
        }
      }
    }
  }

  return aliases
}

function createFamilyMap(edges) {
  const adjacency = new Map()
  for (const [left, right] of edges) {
    addEdge(adjacency, left, right)
    addEdge(adjacency, right, left)
  }

  const familyByPart = new Map()
  for (const part of adjacency.keys()) {
    if (familyByPart.has(part)) {
      continue
    }

    const family = new Set()
    const queue = [part]
    while (queue.length > 0) {
      const current = queue.shift()
      if (!current || family.has(current)) {
        continue
      }

      family.add(current)
      for (const next of adjacency.get(current) ?? []) {
        queue.push(next)
      }
    }

    for (const member of family) {
      familyByPart.set(member, family)
    }
  }

  return familyByPart
}

function addEdge(adjacency, left, right) {
  const values = adjacency.get(left) ?? new Set()
  values.add(right)
  adjacency.set(left, values)
}

function findFirstFile(directory, extensions) {
  const entries = readFileNames(directory)
  return entries
    .filter((fileName) => extensions.includes(extname(fileName).toLowerCase()))
    .map((fileName) => join(directory, fileName))[0] ?? null
}

function readFileNames(directory) {
  return readdirSync(directory)
}

function normalizePart(part) {
  return part.trim().toLowerCase()
}

function resolveExpectedColor(color) {
  const value = color.trim()
  if (catalogue.colorNameById.has(value)) {
    return { colorId: value, colorName: catalogue.colorNameById.get(value) ?? "" }
  }

  const normalizedName = normalizeColorName(value)
  const colorId = catalogue.colorIdByNormalizedName.get(normalizedName) ?? expectedColorAliasByNormalizedName.get(normalizedName) ?? ""
  return {
    colorId,
    colorName: catalogue.colorNameById.get(colorId) ?? "",
  }
}

function normalizeColorName(color) {
  return color.trim().toLowerCase().replaceAll("-", " ").replace(/\s+/g, " ").replace(/\bgrey\b/g, "gray")
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
