import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  readPartMatchLabelSet,
  readPartMatchReportRowsByItemId,
} from "./part-match-label-eval.mjs"

const VALID_STATUSES = new Set(["active", "gate"])

export function buildFrozenPartMatchLabelFile({
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
    ? readPartMatchLabelSet(existingLabelPath).labels
    : []
  const existingByItemId = new Map(existingLabels.map((label) => [label.itemId, label]))
  const rowsByItemId = readPartMatchReportRowsByItemId(report)
  const groupKeyByItemId = createGroupKeyByItemId(report)

  for (const label of existingLabels) {
    if (!rowsByItemId.has(label.itemId)) {
      throw new Error(`Existing label ${label.itemId} is missing from ${reportPath}.`)
    }
  }

  const labels = [...rowsByItemId.values()]
    .map((row) =>
      freezeRowLabel({
        existingLabel: existingByItemId.get(row.itemId ?? row.rowId),
        groupKey: groupKeyByItemId.get(row.itemId ?? row.rowId),
        row,
        status,
      })
    )
    .sort((left, right) => left.itemId.localeCompare(right.itemId))

  return {
    manualId,
    status,
    reportPath: normalizeWorkspacePath(reportPath),
    labels,
  }
}

function createGroupKeyByItemId(report) {
  const groupKeyByItemId = new Map()

  for (const [index, group] of (report.groups ?? []).entries()) {
    const groupKey = `part-${String(index + 1).padStart(3, "0")}`

    for (const rowId of group.rowIds ?? []) {
      groupKeyByItemId.set(rowId, groupKey)
    }
  }

  return groupKeyByItemId
}

function freezeRowLabel({
  existingLabel,
  groupKey,
  row,
  status,
}) {
  const itemId = row.itemId ?? row.rowId
  const expectedPartKey = existingLabel?.expectedPartKey ?? groupKey ?? ""
  const role = existingLabel?.role ?? (expectedPartKey ? status : "excluded")
  const label = {
    itemId,
    expectedPartKey,
    role,
  }

  if (row.cropHash) {
    label.cropHash = row.cropHash
  }

  if (existingLabel?.note) {
    label.note = existingLabel.note
  }

  return label
}

function normalizeWorkspacePath(filePath) {
  return path.relative(process.cwd(), path.resolve(filePath))
}

function runCli(argv) {
  const { existingLabelPath, outputPath, reportPath, status } = parseArgs(argv)
  const report = JSON.parse(readFileSync(reportPath, "utf8"))
  const manualId = readManualId(report, reportPath)
  const frozen = buildFrozenPartMatchLabelFile({
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
    throw new Error("Usage: node scripts/part-match-freeze-labels.mjs <report.json> <label.json|--out label.json> [--existing label.json] [--status active|gate]")
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
