import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  countPartColorLabelRoles,
  defaultPartColorLabelRole,
  isPartColorLabelScored,
  normalizePartColorLabel,
  normalizePartColorLabelRole,
} from "./part-color-label-roles.mjs"

export const DEFAULT_PART_COLOR_LABEL_DIR = path.join(
  ".bag-it",
  "private",
  "part-color-reports",
  "labels",
)

const VALID_LABEL_STATUSES = new Set(["gate", "active"])
const NEUTRAL_COLOR_NAMES = new Set([
  "black",
  "dark bluish gray",
  "flat silver",
  "light bluish gray",
  "white",
])
const WARM_RED_COLOR_NAMES = new Set([
  "dark red",
  "red",
  "reddish brown",
  "trans-brown",
  "trans-orange",
  "trans-red",
])
const GOLD_NOUGAT_COLOR_NAMES = new Set([
  "bright yellow",
  "dark orange",
  "medium nougat",
  "pearl gold",
  "trans-orange",
  "yellow",
])
const BLUE_GREEN_COLOR_NAMES = new Set([
  "blue",
  "blue family",
  "bright blue",
  "bright green",
  "dark azure",
  "dark blue",
  "dark green",
  "green",
  "green family",
  "teal",
])

export function readPartColorLabelSets(labelDir = DEFAULT_PART_COLOR_LABEL_DIR) {
  if (!existsSync(labelDir)) {
    return []
  }

  return readJsonFilePaths(labelDir)
    .map((labelPath) => readPartColorLabelSet(labelPath))
    .sort((left, right) =>
      left.manualId.localeCompare(right.manualId) ||
      left.labelPath.localeCompare(right.labelPath),
    )
}

export function readPartColorLabelSet(labelPath) {
  const parsed = JSON.parse(readFileSync(labelPath, "utf8"))
  const context = `Part color label file ${labelPath}`

  assertNonEmptyString(parsed.manualId, `${context} manualId`)
  assertNonEmptyString(parsed.status, `${context} status`)
  assertNonEmptyString(parsed.reportPath, `${context} reportPath`)

  if (!VALID_LABEL_STATUSES.has(parsed.status)) {
    throw new Error(`${context} status must be "gate" or "active".`)
  }

  if (!Array.isArray(parsed.labels)) {
    throw new Error(`${context} labels must be an array.`)
  }

  const seen = new Set()
  const labels = parsed.labels.map((label, index) => {
    const labelContext = `${context} labels[${index}]`
    const role = normalizePartColorLabelRole(label, parsed.status, labelContext)

    assertNonEmptyString(label?.itemId, `${labelContext}.itemId`)
    assertExpectedNameForRole(label?.expectedName, role, `${labelContext}.expectedName`)

    if (seen.has(label.itemId)) {
      throw new Error(`${context} has duplicate label itemId ${label.itemId}.`)
    }

    seen.add(label.itemId)

    if (label.note !== undefined && typeof label.note !== "string") {
      throw new Error(`${labelContext}.note must be a string when present.`)
    }

    if (label.cropHash !== undefined && typeof label.cropHash !== "string") {
      throw new Error(`${labelContext}.cropHash must be a string when present.`)
    }

    return normalizePartColorLabel(label, {
      context: labelContext,
      fallbackStatus: parsed.status,
    })
  })

  return {
    labelPath: normalizeWorkspacePath(labelPath),
    labels,
    manualId: parsed.manualId,
    reportPath: normalizeWorkspacePath(parsed.reportPath),
    status: parsed.status,
  }
}

export function findPartColorLabelSetForReport({
  labelDir = DEFAULT_PART_COLOR_LABEL_DIR,
  manualId = null,
  reportPath = null,
} = {}) {
  const labelSets = readPartColorLabelSets(labelDir)
  const normalizedReportPath = reportPath ? normalizeWorkspacePath(reportPath) : null

  if (normalizedReportPath) {
    const matchingPath = labelSets.find((labelSet) =>
      normalizeWorkspacePath(labelSet.reportPath) === normalizedReportPath,
    )

    if (matchingPath) {
      return matchingPath
    }
  }

  if (manualId) {
    return labelSets.find((labelSet) => labelSet.manualId === manualId) ?? null
  }

  return null
}

export function evaluatePartColorLabelFiles({
  labelDir = DEFAULT_PART_COLOR_LABEL_DIR,
  manualId = null,
} = {}) {
  const labelSets = readPartColorLabelSets(labelDir)
    .filter((labelSet) => !manualId || labelSet.manualId === manualId)
  const evaluations = labelSets.map((labelSet) =>
    evaluatePartColorLabelFile(labelSet),
  )

  return {
    evaluations,
    failed: evaluations.some(shouldFailPartColorLabelEvaluation),
    labelCount: evaluations.reduce((total, evaluation) => total + evaluation.total, 0),
    labelFileCount: labelSets.length,
    messages: formatPartColorLabelEvaluationMessages(evaluations),
  }
}

export function evaluatePartColorLabelFile(labelSet) {
  const reportPath = path.resolve(labelSet.reportPath)
  const scoredLabels = labelSet.labels.filter(isPartColorLabelScored)

  if (!existsSync(reportPath)) {
    return {
      actualCounts: [],
      classificationCounts: [{
        category: "report-row-state",
        count: scoredLabels.length,
      }],
      confusionCounts: [{
        actualName: "missing report",
        count: scoredLabels.length,
        expectedName: "*",
      }],
      expectedCounts: [{
        count: scoredLabels.length,
        expectedName: "*",
        matched: 0,
        mismatched: 0,
        missing: scoredLabels.length,
      }],
      failedRows: scoredLabels.map((label) => ({
        actualName: "missing report",
        expectedName: label.expectedName,
        itemId: label.itemId,
        note: label.note,
        role: label.role,
        status: "missing",
      })),
      conflicts: 0,
      excluded: labelSet.labels.length - scoredLabels.length,
      gateFailures: scoredLabels.filter((label) => label.role === "gate").length,
      labelPath: labelSet.labelPath,
      labelConflicts: [],
      manualId: labelSet.manualId,
      matched: 0,
      mismatched: 0,
      missing: scoredLabels.length,
      reportMissing: true,
      reportPath: labelSet.reportPath,
      roleCounts: countPartColorLabelRoles(labelSet.labels),
      status: labelSet.status,
      total: scoredLabels.length,
    }
  }

  const report = JSON.parse(readFileSync(reportPath, "utf8"))

  if (isRejectedTuningReport(report)) {
    return createRejectedReportEvaluation(labelSet, "stale report")
  }

  return evaluatePartColorLabels({ labelSet, report })
}

export function evaluatePartColorLabels({ labelSet, report }) {
  const labels = labelSet.labels.map((label) => ({
    ...label,
    role: label.role ?? defaultPartColorLabelRole(labelSet.status),
  }))
  const scoredLabels = labels.filter(isPartColorLabelScored)
  const rowsById = readReportRowsByItemId(report)
  const labelConflicts = findPartColorLabelConflicts({
    labels: scoredLabels,
    rowsById,
  })
  const conflictsByItemId = new Map(labelConflicts.map((conflict) => [
    conflict.itemId,
    conflict,
  ]))
  const expectedCounts = new Map()
  const actualCounts = new Map()
  const confusionCounts = new Map()
  const classificationCounts = new Map()
  const failedRows = []
  let conflicts = 0
  let matched = 0
  let mismatched = 0
  let missing = 0
  let gateFailures = 0

  for (const label of scoredLabels) {
    if (conflictsByItemId.has(label.itemId)) {
      conflicts += 1
      if (label.role === "gate") {
        gateFailures += 1
      }
      incrementExpected(expectedCounts, label.expectedName, "conflict")
      continue
    }

    const row = rowsById.get(label.itemId)
    const cropHashStatus = row ? readCropHashStatus(label, row) : "ok"
    const actualName = row
      ? cropHashStatus === "drifted" ? "row crop drift" : row.colorName ?? "Unknown"
      : "missing row"
    const rowStatus = row
      ? cropHashStatus === "drifted"
        ? "mismatch"
        : colorNamesMatch(label.expectedName, actualName) ? "match" : "mismatch"
      : "missing"

    incrementExpected(expectedCounts, label.expectedName, rowStatus)

    if (rowStatus === "match") {
      matched += 1
      incrementActual(actualCounts, actualName, "match")
      continue
    }

    if (label.role === "gate") {
      gateFailures += 1
    }

    if (rowStatus === "missing") {
      missing += 1
    } else {
      mismatched += 1
      incrementActual(actualCounts, actualName, "mismatch")
    }

    incrementConfusion(confusionCounts, label.expectedName, actualName)
    incrementClassification(classificationCounts, label.expectedName, actualName)
    failedRows.push({
      actualName,
      category: classifyPartColorMismatch(label.expectedName, actualName),
      expectedName: label.expectedName,
      itemId: label.itemId,
      note: label.note,
      role: label.role,
      status: rowStatus,
    })
  }

  return {
    actualCounts: sortCounts([...actualCounts.values()], "actualName"),
    classificationCounts: sortClassificationCounts([...classificationCounts.values()]),
    confusionCounts: sortConfusions([...confusionCounts.values()]),
    expectedCounts: sortCounts([...expectedCounts.values()], "expectedName"),
    excluded: labels.length - scoredLabels.length,
    failedRows: failedRows.sort((left, right) => left.itemId.localeCompare(right.itemId)),
    conflicts,
    gateFailures,
    labelPath: labelSet.labelPath,
    labelConflicts,
    manualId: labelSet.manualId,
    matched,
    mismatched,
    missing,
    reportMissing: false,
    reportPath: labelSet.reportPath,
    roleCounts: countPartColorLabelRoles(labels),
    status: labelSet.status,
    total: scoredLabels.length,
  }
}

export function shouldFailPartColorLabelEvaluation(evaluation) {
  if (typeof evaluation.gateFailures === "number") {
    return evaluation.gateFailures > 0
  }

  return evaluation.status === "gate" && (
    evaluation.mismatched > 0 ||
    evaluation.missing > 0 ||
    (evaluation.conflicts ?? 0) > 0 ||
    evaluation.reportMissing ||
    evaluation.reportRejected
  )
}

export function formatPartColorLabelEvaluationMessages(evaluations) {
  if (evaluations.length === 0) {
    return ["No part color label files found; skipping part color label gate."]
  }

  return evaluations.flatMap((evaluation) => [
    formatPartColorLabelEvaluationSummary(evaluation),
    ...evaluation.expectedCounts.map((count) =>
      formatPartColorExpectedCountMessage(count),
    ),
    ...formatPartColorLabelConflictMessages(evaluation.labelConflicts ?? []),
    ...(evaluation.classificationCounts ?? []).map((classification) =>
      `  category ${classification.category}: ${classification.count}`,
    ),
    ...evaluation.confusionCounts.map((confusion) =>
      `  confusion ${confusion.expectedName} -> ${confusion.actualName}: ${confusion.count}`,
    ),
  ])
}

export function findPartColorLabelConflicts({
  labels = [],
  rowsById = new Map(),
} = {}) {
  const groupsByCropHash = new Map()

  for (const label of labels) {
    if (label.role === "excluded") {
      continue
    }

    const evidence = readLabelCropEvidence(label, rowsById.get(label.itemId))

    if (!evidence) {
      continue
    }

    const group = groupsByCropHash.get(evidence.cropHash) ?? {
      cropHash: evidence.cropHash,
      evidenceSources: new Set(),
      expectedNamesByKey: new Map(),
      labels: [],
    }

    group.evidenceSources.add(evidence.source)
    const expectedKey = canonicalColorNameKey(label.expectedName)

    group.expectedNamesByKey.set(
      expectedKey,
      group.expectedNamesByKey.get(expectedKey) ?? label.expectedName,
    )
    group.labels.push(label)
    groupsByCropHash.set(evidence.cropHash, group)
  }

  return [...groupsByCropHash.values()]
    .filter((group) => group.expectedNamesByKey.size > 1)
    .flatMap(createPartColorLabelConflictRows)
    .sort((left, right) =>
      left.cropHash.localeCompare(right.cropHash) ||
      left.itemId.localeCompare(right.itemId),
    )
}

export function classifyPartColorMismatch(expectedName, actualName) {
  const expected = normalizeColorName(expectedName)
  const actual = normalizeColorName(actualName)

  if (
    expected === "*" ||
    actual === "missing report" ||
    actual === "missing row" ||
    actual === "row crop drift" ||
    actual === "stale report"
  ) {
    return "report-row-state"
  }

  if (NEUTRAL_COLOR_NAMES.has(expected) && NEUTRAL_COLOR_NAMES.has(actual)) {
    return "neutral-small-part-ambiguity"
  }

  if (GOLD_NOUGAT_COLOR_NAMES.has(expected) && GOLD_NOUGAT_COLOR_NAMES.has(actual)) {
    return "gold-nougat-trans-singleton"
  }

  if (WARM_RED_COLOR_NAMES.has(expected) && WARM_RED_COLOR_NAMES.has(actual)) {
    return "warm-red-trans-brown"
  }

  if (BLUE_GREEN_COLOR_NAMES.has(expected) && BLUE_GREEN_COLOR_NAMES.has(actual)) {
    return "blue-green-family-split"
  }

  return "other"
}

export function pruneMatchedPartColorLabelNotes({
  labelDir = DEFAULT_PART_COLOR_LABEL_DIR,
  manualId = null,
} = {}) {
  const summaries = []

  for (const labelSet of readPartColorLabelSets(labelDir)) {
    if (manualId && labelSet.manualId !== manualId) {
      continue
    }

    const summary = pruneMatchedPartColorLabelNotesForFile(labelSet)

    if (summary) {
      summaries.push(summary)
    }
  }

  return {
    fileCount: summaries.length,
    pruned: summaries.reduce((total, summary) => total + summary.pruned, 0),
    summaries,
  }
}

export function readReportRowsByItemId(report) {
  const rows = [
    ...(report.classes ?? []).flatMap((manualClass) => manualClass.rows ?? []),
    ...(report.unknownRows ?? []),
  ]
  const rowsById = new Map()

  for (const row of rows) {
    if (!row?.itemId) {
      continue
    }

    if (rowsById.has(row.itemId)) {
      throw new Error(`Part color report has duplicate row itemId ${row.itemId}.`)
    }

    rowsById.set(row.itemId, row)
  }

  return rowsById
}

export function readReportRowCropHash(row) {
  return row?.cropHash ?? hashDataUrl(row?.imageDataUrl)
}

export function colorNamesMatch(expectedName, actualName) {
  return canonicalColorNameKey(expectedName) === canonicalColorNameKey(actualName)
}

export function isRejectedTuningReport(report) {
  return report?.colorSource !== "recomputed-manual-render" &&
    report?.versions?.partColorCalibrationStale === true
}

function createRejectedReportEvaluation(labelSet, reason) {
  const scoredLabels = labelSet.labels.filter(isPartColorLabelScored)

  return {
    actualCounts: [{
      actualName: reason,
      count: scoredLabels.length,
      matched: 0,
      mismatched: scoredLabels.length,
    }],
    classificationCounts: [{
      category: "report-row-state",
      count: scoredLabels.length,
    }],
    confusionCounts: [{
      actualName: reason,
      count: scoredLabels.length,
      expectedName: "*",
    }],
    expectedCounts: [{
      count: scoredLabels.length,
      expectedName: "*",
      matched: 0,
      mismatched: scoredLabels.length,
      missing: 0,
    }],
    failedRows: scoredLabels.map((label) => ({
      actualName: reason,
      category: "report-row-state",
      expectedName: label.expectedName,
      itemId: label.itemId,
      note: label.note,
      role: label.role,
      status: "mismatch",
    })),
    conflicts: 0,
    excluded: labelSet.labels.length - scoredLabels.length,
    gateFailures: scoredLabels.filter((label) => label.role === "gate").length,
    labelPath: labelSet.labelPath,
    labelConflicts: [],
    manualId: labelSet.manualId,
    matched: 0,
    mismatched: scoredLabels.length,
    missing: 0,
    reportMissing: false,
    reportPath: labelSet.reportPath,
    reportRejected: true,
    roleCounts: countPartColorLabelRoles(labelSet.labels),
    status: labelSet.status,
    total: scoredLabels.length,
  }
}

function pruneMatchedPartColorLabelNotesForFile(labelSet) {
  const reportPath = path.resolve(labelSet.reportPath)

  if (!existsSync(reportPath)) {
    return null
  }

  const report = JSON.parse(readFileSync(reportPath, "utf8"))

  if (isRejectedTuningReport(report)) {
    return null
  }

  const rowsById = readReportRowsByItemId(report)
  const labelsByItemId = new Map(labelSet.labels.map((label) => [label.itemId, label]))
  const rawLabelFile = JSON.parse(readFileSync(labelSet.labelPath, "utf8"))
  let pruned = 0

  for (const label of rawLabelFile.labels ?? []) {
    if (labelsByItemId.get(label.itemId)?.role === "excluded") {
      continue
    }

    if (typeof label?.note !== "string") {
      continue
    }

    const row = rowsById.get(label.itemId)

    if (!row || readCropHashStatus(label, row) === "drifted") {
      continue
    }

    const actualName = row.colorName ?? "Unknown"

    if (colorNamesMatch(label.expectedName, actualName)) {
      delete label.note
      pruned += 1
    }
  }

  if (pruned > 0) {
    writeFileSync(labelSet.labelPath, `${JSON.stringify(rawLabelFile, null, 2)}\n`)
  }

  return {
    labelPath: labelSet.labelPath,
    manualId: labelSet.manualId,
    pruned,
  }
}

function readCropHashStatus(label, row) {
  if (!label.cropHash) {
    return "ok"
  }

  const rowHash = readReportRowCropHash(row)

  return rowHash === label.cropHash ? "ok" : "drifted"
}

function readLabelCropEvidence(label, row) {
  if (label.cropHash) {
    return {
      cropHash: label.cropHash,
      source: "label-crop-hash",
    }
  }

  const rowHash = readReportRowCropHash(row)

  return rowHash
    ? {
        cropHash: rowHash,
        source: "report-crop-hash",
      }
    : null
}

function createPartColorLabelConflictRows(group) {
  const conflictItemIds = group.labels
    .map((label) => label.itemId)
    .sort()
  const conflictingExpectedNames = [...group.expectedNamesByKey.values()]
    .sort((left, right) => left.localeCompare(right))
  const evidenceSource = [...group.evidenceSources].sort().join("+")

  return group.labels.map((label) => ({
    actualName: "label conflict",
    category: "label-conflict",
    conflictingExpectedNames,
    conflictItemIds,
    cropHash: group.cropHash,
    evidenceSource,
    expectedName: label.expectedName,
    itemId: label.itemId,
    note: label.note,
    role: label.role,
    status: "conflict",
  }))
}

function formatPartColorLabelEvaluationSummary(evaluation) {
  const conflictText = evaluation.conflicts
    ? `, ${evaluation.conflicts} conflicts`
    : ""
  const excludedText = evaluation.excluded
    ? `, ${evaluation.excluded} excluded`
    : ""

  return `${evaluation.manualId} (${evaluation.status}): ${evaluation.matched}/${evaluation.total} matched, ${evaluation.mismatched} mismatched, ${evaluation.missing} missing${conflictText}${excludedText}.`
}

function formatPartColorExpectedCountMessage(count) {
  const conflictText = count.conflicts
    ? `, ${count.conflicts} conflicts`
    : ""

  return `  expected ${count.expectedName}: ${count.matched}/${count.count} matched, ${count.mismatched} mismatched, ${count.missing} missing${conflictText}.`
}

function formatPartColorLabelConflictMessages(conflicts) {
  const groupsByCropHash = new Map()

  for (const conflict of conflicts) {
    groupsByCropHash.set(conflict.cropHash, conflict)
  }

  return [...groupsByCropHash.values()]
    .sort((left, right) => left.cropHash.localeCompare(right.cropHash))
    .map((conflict) =>
      `  label conflict ${conflict.cropHash}: ${conflict.conflictItemIds.join(", ")} disagree as ${conflict.conflictingExpectedNames.join(" / ")}.`,
    )
}

function hashDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || dataUrl.length === 0) {
    return null
  }

  return createHash("sha256").update(dataUrl).digest("hex")
}

function readJsonFilePaths(dir) {
  return readdirSync(dir)
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry)
      const stat = statSync(fullPath)

      if (stat.isDirectory()) {
        return readJsonFilePaths(fullPath)
      }

      return entry.endsWith(".json") ? [fullPath] : []
    })
    .sort()
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`)
  }
}

function assertExpectedNameForRole(value, role, label) {
  if (role === "excluded" && value === undefined) {
    return
  }

  assertNonEmptyString(value, label)
}

function incrementExpected(counts, expectedName, status) {
  const count = counts.get(expectedName) ?? {
    count: 0,
    expectedName,
    matched: 0,
    mismatched: 0,
    missing: 0,
  }

  count.count += 1

  if (status === "match") {
    count.matched += 1
  } else if (status === "missing") {
    count.missing += 1
  } else if (status === "conflict") {
    count.conflicts = (count.conflicts ?? 0) + 1
  } else {
    count.mismatched += 1
  }

  counts.set(expectedName, count)
}

function incrementActual(counts, actualName, status) {
  const count = counts.get(actualName) ?? {
    actualName,
    count: 0,
    matched: 0,
    mismatched: 0,
  }

  count.count += 1

  if (status === "match") {
    count.matched += 1
  } else {
    count.mismatched += 1
  }

  counts.set(actualName, count)
}

function incrementConfusion(counts, expectedName, actualName) {
  const key = `${expectedName}\u0000${actualName}`
  const count = counts.get(key) ?? { actualName, count: 0, expectedName }

  count.count += 1
  counts.set(key, count)
}

function incrementClassification(counts, expectedName, actualName) {
  const category = classifyPartColorMismatch(expectedName, actualName)
  const count = counts.get(category) ?? { category, count: 0 }

  count.count += 1
  counts.set(category, count)
}

function sortCounts(counts, nameKey) {
  return counts.sort((left, right) =>
    right.count - left.count ||
    String(left[nameKey]).localeCompare(String(right[nameKey])),
  )
}

function sortConfusions(confusions) {
  return confusions.sort((left, right) =>
    right.count - left.count ||
    left.expectedName.localeCompare(right.expectedName) ||
    left.actualName.localeCompare(right.actualName),
  )
}

function sortClassificationCounts(counts) {
  return counts.sort((left, right) =>
    right.count - left.count ||
    left.category.localeCompare(right.category),
  )
}

function normalizeColorName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
}

function canonicalColorNameKey(value) {
  const normalized = normalizeColorName(value)

  if (normalized === "bright blue") {
    return "blue"
  }

  if (normalized === "light gray") {
    return "light bluish gray"
  }

  if (normalized === "dark gray") {
    return "dark bluish gray"
  }

  return normalized
}

function normalizeWorkspacePath(filePath) {
  return path.relative(process.cwd(), path.resolve(filePath))
}

function runCli(argv) {
  const options = readCliOptions(argv)

  if (options.pruneMatchedNotes) {
    const pruneResult = pruneMatchedPartColorLabelNotes({
      labelDir: options.labelDir,
      manualId: options.manualId,
    })

    for (const summary of pruneResult.summaries) {
      console.log(`Pruned ${summary.pruned} matched label notes from ${summary.manualId}.`)
    }
  }

  const labelDir = options.labelDir
  const result = evaluatePartColorLabelFiles({
    labelDir,
    manualId: options.manualId,
  })

  for (const message of result.messages) {
    console.log(message)
  }

  if (result.failed) {
    process.exitCode = 1
  }
}

function readCliOptions(argv) {
  const labelDir = readCliLabelDir(argv)
  const manualId = readCliManualId(argv)

  return {
    labelDir,
    manualId,
    pruneMatchedNotes: argv.includes("--prune-matched-notes"),
  }
}

function readCliLabelDir(argv) {
  const labelDirIndex = argv.indexOf("--label-dir")

  if (labelDirIndex >= 0) {
    const value = argv[labelDirIndex + 1]

    if (!value) {
      throw new Error("--label-dir requires a path.")
    }

    return value
  }

  return DEFAULT_PART_COLOR_LABEL_DIR
}

function readCliManualId(argv) {
  const manualIdIndex = argv.indexOf("--manual-id")

  if (manualIdIndex >= 0) {
    const value = argv[manualIdIndex + 1]

    if (!value) {
      throw new Error("--manual-id requires a value.")
    }

    return value
  }

  return null
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2))
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
