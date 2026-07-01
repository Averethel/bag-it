import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { calibrateManualPartColors } from "../packages/part-colors/src/resolver/resolver.ts"
import { isPartColorLabelScored } from "./part-color-label-roles.mjs"
import {
  colorNamesMatch,
  DEFAULT_PART_COLOR_LABEL_DIR,
  isRejectedTuningReport,
  readPartColorLabelSets,
  readReportRowCropHash,
  readReportRowsByItemId,
} from "./part-color-label-eval.mjs"
import { readTrainingRowsById, toCalibrationInput } from "./update-part-color-prototypes.mjs"

export function evaluatePartColorRuntime({
  labelDir = DEFAULT_PART_COLOR_LABEL_DIR,
  manualIds = null,
  prototypeSet,
} = {}) {
  const includedManualIds = new Set(manualIds ?? [])
  const evaluations = readPartColorLabelSets(labelDir)
    .filter((labelSet) => !manualIds || includedManualIds.has(labelSet.manualId))
    .map((labelSet) => evaluateLabelSetRuntime(labelSet, { prototypeSet }))

  return {
    evaluations,
    matchedAfter: sum(evaluations.map((evaluation) => evaluation.matchedAfter)),
    matchedBefore: sum(evaluations.map((evaluation) => evaluation.matchedBefore)),
    total: sum(evaluations.map((evaluation) => evaluation.total)),
  }
}

function evaluateLabelSetRuntime(labelSet, { prototypeSet } = {}) {
  const report = JSON.parse(readFileSync(labelSet.reportPath, "utf8"))
  const scoredLabels = labelSet.labels.filter(isPartColorLabelScored)

  if (isRejectedTuningReport(report)) {
    return {
      delta: 0,
      manualId: labelSet.manualId,
      matchedAfter: 0,
      matchedBefore: 0,
      rejected: true,
      total: scoredLabels.length,
      worsenedRows: [],
    }
  }

  const reportRowsById = readReportRowsByItemId(report)
  const rowsById = readTrainingRowsById(report)
  const result = calibrateManualPartColors(
    [...rowsById.values()].map(toCalibrationInput),
    prototypeSet ? { prototypes: prototypeSet } : undefined,
  )
  const rows = scoredLabels.map((label) =>
    evaluateLabelRuntime({
      label,
      reportRow: reportRowsById.get(label.itemId),
      resolvedName: result.colorsByPartId.get(label.itemId)?.name,
    }),
  )
  const matchedBefore = rows.filter((row) => row.matchedBefore).length
  const matchedAfter = rows.filter((row) => row.matchedAfter).length

  return {
    delta: matchedAfter - matchedBefore,
    manualId: labelSet.manualId,
    matchedAfter,
    matchedBefore,
    rejected: false,
    total: rows.length,
    worsenedRows: rows
      .filter((row) => row.matchedBefore && !row.matchedAfter)
      .map((row) => ({
        actualAfter: row.actualAfter,
        actualBefore: row.actualBefore,
        expectedName: row.expectedName,
        itemId: row.itemId,
      })),
  }
}

function evaluateLabelRuntime({ label, reportRow, resolvedName }) {
  const cropHashStatus = reportRow ? readCropHashStatus(label, reportRow) : "ok"
  const actualBefore = reportRow
    ? cropHashStatus === "drifted" ? "row crop drift" : reportRow.colorName ?? "Unknown"
    : "missing row"
  const actualAfter = resolvedName ?? "missing row"

  return {
    actualAfter,
    actualBefore,
    expectedName: label.expectedName,
    itemId: label.itemId,
    matchedAfter: colorNamesMatch(label.expectedName, actualAfter),
    matchedBefore: colorNamesMatch(label.expectedName, actualBefore),
  }
}

function readCropHashStatus(label, row) {
  if (!label.cropHash) {
    return "ok"
  }

  return readReportRowCropHash(row) === label.cropHash ? "ok" : "drifted"
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0)
}

function runCli(argv) {
  const result = evaluatePartColorRuntime({
    labelDir: readStringOption(argv, "--label-dir") ?? DEFAULT_PART_COLOR_LABEL_DIR,
    manualIds: readListOption(argv, "--manual-ids"),
  })

  for (const evaluation of result.evaluations) {
    const status = evaluation.rejected ? "rejected" : `${evaluation.delta >= 0 ? "+" : ""}${evaluation.delta}`

    console.log(
      `${evaluation.manualId}: ${evaluation.matchedAfter}/${evaluation.total} runtime, ` +
        `${evaluation.matchedBefore}/${evaluation.total} report, delta ${status}`,
    )
  }

  console.log(
    `total: ${result.matchedAfter}/${result.total} runtime, ` +
      `${result.matchedBefore}/${result.total} report, delta ${result.matchedAfter - result.matchedBefore}`,
  )
}

function readStringOption(argv, name) {
  const index = argv.indexOf(name)

  return index >= 0 ? argv[index + 1] : null
}

function readListOption(argv, name) {
  const value = readStringOption(argv, name)

  return value
    ? value.split(",").map((entry) => entry.trim()).filter(Boolean)
    : null
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2))
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
