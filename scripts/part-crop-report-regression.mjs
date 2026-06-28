import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const DEFAULT_PART_CROP_REPORT_REGRESSION_DIR = path.join(
  ".bag-it",
  "private",
  "part-crop-reports",
  "regressions",
)

export function buildPartCropReportRegressionSnapshot(report, options) {
  const view = readPartCropReportRegressionView(report)

  return {
    acceptedAt: options.acceptedAt ?? new Date().toISOString(),
    id: options.id,
    reportPath: normalizeWorkspacePath(options.reportPath),
    version: 1,
    ...view,
  }
}

export function comparePartCropReportRegressionSnapshot(snapshot) {
  const report = readReport(snapshot.reportPath)
  const actual = readPartCropReportRegressionView(report)
  const expected = {
    cropCount: snapshot.cropCount,
    cropHash: snapshot.cropHash,
    crops: snapshot.crops,
    currentPartExtractorVersion: snapshot.currentPartExtractorVersion,
    partExtractorVersion: snapshot.partExtractorVersion,
    totals: snapshot.totals,
  }

  return { actual, expected }
}

export function readPartCropReportRegressionSnapshots(
  snapshotDir = DEFAULT_PART_CROP_REPORT_REGRESSION_DIR,
) {
  if (!existsSync(snapshotDir)) {
    return []
  }

  return readdirSync(snapshotDir)
    .filter((filename) => filename.endsWith(".json"))
    .sort()
    .map((filename) => {
      const snapshotPath = path.join(snapshotDir, filename)

      return {
        snapshot: JSON.parse(readFileSync(snapshotPath, "utf8")),
        snapshotPath,
      }
    })
}

export function readPartCropReportRegressionView(report) {
  const crops = readReportCrops(report)

  return {
    cropCount: crops.length,
    cropHash: hashJson(crops),
    crops,
    currentPartExtractorVersion: report.versions?.currentPartExtractorVersion ?? null,
    partExtractorVersion: report.versions?.partExtractorVersion ?? null,
    totals: {
      rows: report.totals?.rows ?? null,
    },
  }
}

function readReportCrops(report) {
  return readReportRows(report)
    .map((row) => ({
      cropHash: hashString(row.imageDataUrl ?? ""),
      itemId: row.itemId,
      pageNumber: row.pageNumber ?? null,
      partRegion: row.partRegion ?? null,
      quantity: row.quantity ?? null,
      stepIndex: row.stepIndex ?? null,
    }))
    .sort((left, right) => left.itemId.localeCompare(right.itemId))
}

function readReportRows(report) {
  const rowsById = new Map()

  for (const row of (report.classes ?? []).flatMap((manualClass) => manualClass.rows ?? [])) {
    rowsById.set(row.itemId, row)
  }

  for (const row of report.unknownRows ?? []) {
    rowsById.set(row.itemId, row)
  }

  return [...rowsById.values()]
}

function hashJson(value) {
  return hashString(JSON.stringify(value))
}

function hashString(value) {
  return createHash("sha256").update(value).digest("hex")
}

function normalizeWorkspacePath(reportPath) {
  return path.relative(process.cwd(), path.resolve(reportPath))
}

function readReport(reportPath) {
  return JSON.parse(readFileSync(reportPath, "utf8"))
}

function writeSnapshot(id, reportPath) {
  const report = readReport(reportPath)
  const snapshot = buildPartCropReportRegressionSnapshot(report, { id, reportPath })
  const snapshotDir = DEFAULT_PART_CROP_REPORT_REGRESSION_DIR

  mkdirSync(snapshotDir, { recursive: true })
  writeFileSync(
    path.join(snapshotDir, `${id}.json`),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  )

  return snapshot
}

function validateSnapshots() {
  const snapshots = readPartCropReportRegressionSnapshots()

  for (const { snapshot, snapshotPath } of snapshots) {
    const { actual, expected } = comparePartCropReportRegressionSnapshot(snapshot)

    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Part crop report regression failed: ${snapshotPath}`)
    }
  }

  return snapshots.length
}

function runCli(argv) {
  const [command, id, reportPath] = argv

  if (command === "accept" && id && reportPath) {
    const snapshot = writeSnapshot(id, reportPath)

    console.log(`Accepted ${snapshot.id}: ${snapshot.cropHash}`)
    return
  }

  if (command === "validate") {
    const count = validateSnapshots()

    console.log(`Validated ${count} part crop report regression snapshot(s).`)
    return
  }

  throw new Error(
    "Usage: node scripts/part-crop-report-regression.mjs accept <id> <report.json> | validate",
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2))
}
