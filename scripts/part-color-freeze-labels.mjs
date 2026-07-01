import { createHash } from "node:crypto"
import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  readPartColorLabelSet,
  readReportRowsByItemId,
} from "./part-color-label-eval.mjs"

const VALID_STATUSES = new Set(["active", "gate"])

export function buildFrozenPartColorLabelFile({
  existingLabelPath,
  manualId,
  report,
  reportPath,
  status = "active",
}) {
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`status must be one of: ${[...VALID_STATUSES].join(", ")}.`)
  }

  const existingLabels = existingLabelPath && existsSync(existingLabelPath)
    ? readPartColorLabelSet(existingLabelPath).labels
    : []
  const existingByItemId = new Map(existingLabels.map((label) => [label.itemId, label]))
  const rowsByItemId = readReportRowsByItemId(report)

  for (const label of existingLabels) {
    if (!rowsByItemId.has(label.itemId)) {
      throw new Error(`Existing label ${label.itemId} is missing from ${reportPath}.`)
    }
  }

  const labels = [...rowsByItemId.values()]
    .map((row) => freezeRowLabel(row, existingByItemId.get(row.itemId)))
    .sort((left, right) => left.itemId.localeCompare(right.itemId))

  return {
    manualId,
    status,
    reportPath: normalizeWorkspacePath(reportPath),
    labels,
  }
}

function freezeRowLabel(row, existingLabel) {
  const cropHash = row.cropHash ?? hashDataUrl(row.imageDataUrl)
  const label = {
    itemId: row.itemId,
    expectedName: existingLabel?.expectedName ?? row.colorName ?? "Unknown",
  }

  if (cropHash) {
    label.cropHash = cropHash
  }

  if (existingLabel?.note) {
    label.note = existingLabel.note
  }

  if (existingLabel?.role) {
    label.role = existingLabel.role
  }

  return label
}

function hashDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || dataUrl.length === 0) {
    return null
  }

  return createHash("sha256").update(dataUrl).digest("hex")
}

function normalizeWorkspacePath(filePath) {
  return path.relative(process.cwd(), path.resolve(filePath))
}

function runCli(argv) {
  const { existingLabelPath, outputPath, reportPath, status } = parseArgs(argv)
  const report = JSON.parse(readFileSync(reportPath, "utf8"))
  const manualId = readManualId(report, reportPath)
  const frozen = buildFrozenPartColorLabelFile({
    existingLabelPath,
    manualId,
    report,
    reportPath,
    status,
  })

  writeFileSync(outputPath, `${JSON.stringify(frozen, null, 2)}\n`)
  console.log(`Wrote ${frozen.labels.length} labels to ${outputPath}.`)
}

function readManualId(report, reportPath) {
  if (typeof report.manualId === "string" && report.manualId.trim() !== "") {
    return report.manualId
  }

  return path.basename(path.dirname(path.resolve(reportPath)))
}

function parseArgs(argv) {
  const reportPath = argv[0]
  const outputPath = readOption(argv, "--out") ?? readOption(argv, "--label") ?? argv[1]
  const existingLabelPath = readOption(argv, "--existing") ?? outputPath
  const status = readOption(argv, "--status") ?? "active"

  if (!reportPath || !outputPath) {
    throw new Error("Usage: node scripts/part-color-freeze-labels.mjs <report.json> <label.json|--out label.json> [--existing label.json] [--status active|gate]")
  }

  return {
    existingLabelPath,
    outputPath,
    reportPath,
    status,
  }
}

function readOption(argv, option) {
  const index = argv.indexOf(option)

  if (index < 0) {
    return null
  }

  const value = argv[index + 1]

  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`)
  }

  return value
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2))
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
