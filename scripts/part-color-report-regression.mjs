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

export const DEFAULT_PART_COLOR_REPORT_REGRESSION_DIR = path.join(
  ".bag-it",
  "private",
  "part-color-reports",
  "regressions",
)

export function buildPartColorReportRegressionSnapshot(report, options) {
  const view = readPartColorReportRegressionView(report)

  return {
    acceptedAt: options.acceptedAt ?? new Date().toISOString(),
    id: options.id,
    reportPath: normalizeWorkspacePath(options.reportPath),
    version: 1,
    ...view,
  }
}

export function comparePartColorReportRegressionSnapshot(snapshot) {
  const report = readReport(snapshot.reportPath)
  const actual = readPartColorReportRegressionView(report)
  const expected = {
    assignmentCount: snapshot.assignmentCount,
    assignmentHash: snapshot.assignmentHash,
    classes: snapshot.classes,
    colorSource: snapshot.colorSource,
    currentPartColorCalibrationVersion: snapshot.currentPartColorCalibrationVersion,
    partColorCalibrationVersion: snapshot.partColorCalibrationVersion,
    totals: snapshot.totals,
  }

  return { actual, expected }
}

export function readPartColorReportRegressionSnapshots(
  snapshotDir = DEFAULT_PART_COLOR_REPORT_REGRESSION_DIR,
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

export function readPartColorReportRegressionView(report) {
  const assignments = readReportAssignments(report)

  return {
    assignmentCount: assignments.length,
    assignmentHash: hashJson(assignments),
    classes: readClassSummary(report),
    colorSource: report.colorSource,
    currentPartColorCalibrationVersion: report.versions?.currentPartColorCalibrationVersion,
    partColorCalibrationVersion: report.versions?.partColorCalibrationVersion,
    totals: readComparableTotals(report),
  }
}

function readComparableTotals(report) {
  const totals = report.totals ?? {}

  return {
    classes: totals.classes,
    detectedRows: totals.detectedRows,
    rawClasses: totals.rawClasses,
    reviewRows: totals.reviewRows,
    rows: totals.rows,
    unknownRows: totals.unknownRows,
  }
}

function readClassSummary(report) {
  return (report.classes ?? []).map((manualClass) => ({
    id: manualClass.id,
    mergeReason: manualClass.mergeReason,
    name: manualClass.name,
    quantityCount: manualClass.quantityCount,
    rawClassIds: manualClass.rawClassIds ?? [],
    rowCount: manualClass.rowCount,
    status: manualClass.status,
    swatchHex: manualClass.swatchHex,
    trustedRows: manualClass.trustedRows,
  }))
}

function readReportAssignments(report) {
  const classRows = (report.classes ?? []).flatMap((manualClass) =>
    (manualClass.rows ?? []).map((row) => ({
      colorName: row.colorName,
      colorStatus: row.colorStatus,
      itemId: row.itemId,
      manualClassId: row.manualClassId,
      quantity: row.quantity ?? null,
      rawManualClassId: row.rawManualClassId ?? null,
    })),
  )
  const unknownRows = (report.unknownRows ?? []).map((row) => ({
    colorName: "unknown",
    colorStatus: "unknown",
    itemId: row.itemId,
    manualClassId: null,
    quantity: row.quantity ?? null,
    rawManualClassId: null,
  }))

  return [...classRows, ...unknownRows].sort((left, right) =>
    left.itemId.localeCompare(right.itemId),
  )
}

function hashJson(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
}

function normalizeWorkspacePath(reportPath) {
  return path.relative(process.cwd(), path.resolve(reportPath))
}

function readReport(reportPath) {
  return JSON.parse(readFileSync(reportPath, "utf8"))
}

function writeSnapshot(id, reportPath) {
  const report = readReport(reportPath)
  const snapshot = buildPartColorReportRegressionSnapshot(report, { id, reportPath })
  const snapshotDir = DEFAULT_PART_COLOR_REPORT_REGRESSION_DIR

  mkdirSync(snapshotDir, { recursive: true })
  writeFileSync(
    path.join(snapshotDir, `${id}.json`),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  )

  return snapshot
}

function validateSnapshots() {
  const snapshots = readPartColorReportRegressionSnapshots()

  for (const { snapshot, snapshotPath } of snapshots) {
    const { actual, expected } = comparePartColorReportRegressionSnapshot(snapshot)

    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Part color report regression failed: ${snapshotPath}`)
    }
  }

  return snapshots.length
}

function runCli(argv) {
  const [command, id, reportPath] = argv

  if (command === "accept" && id && reportPath) {
    const snapshot = writeSnapshot(id, reportPath)

    console.log(`Accepted ${snapshot.id}: ${snapshot.assignmentHash}`)
    return
  }

  if (command === "validate") {
    const count = validateSnapshots()

    console.log(`Validated ${count} part color report regression snapshot(s).`)
    return
  }

  throw new Error(
    "Usage: node scripts/part-color-report-regression.mjs accept <id> <report.json> | validate",
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2))
}
