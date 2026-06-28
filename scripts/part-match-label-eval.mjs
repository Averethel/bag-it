import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const DEFAULT_PART_MATCH_LABEL_DIR = path.join(
  ".bag-it",
  "private",
  "part-match-reports",
  "labels",
)

const VALID_LABEL_STATUSES = new Set(["gate", "active"])
const VALID_LABEL_ROLES = new Set(["gate", "active", "excluded"])

export function readPartMatchLabelSets(labelDir = DEFAULT_PART_MATCH_LABEL_DIR) {
  if (!existsSync(labelDir)) {
    return []
  }

  return readJsonFilePaths(labelDir)
    .map((labelPath) => readPartMatchLabelSet(labelPath))
    .sort((left, right) =>
      left.manualId.localeCompare(right.manualId) ||
      left.labelPath.localeCompare(right.labelPath),
    )
}

export function readPartMatchLabelSet(labelPath) {
  const parsed = JSON.parse(readFileSync(labelPath, "utf8"))
  const context = `Part match label file ${labelPath}`

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
  const labels = parsed.labels.map((label, index) =>
    normalizePartMatchLabel(label, {
      context: `${context} labels[${index}]`,
      fallbackRole: parsed.status,
      seen,
    })
  )

  return {
    labelPath: normalizeWorkspacePath(labelPath),
    labels,
    manualId: parsed.manualId,
    reportPath: normalizeWorkspacePath(parsed.reportPath),
    status: parsed.status,
  }
}

export function findPartMatchLabelSetForReport({
  labelDir = DEFAULT_PART_MATCH_LABEL_DIR,
  manualId = null,
  reportPath = null,
} = {}) {
  const labelSets = readPartMatchLabelSets(labelDir)
  const normalizedReportPath = reportPath ? normalizeWorkspacePath(reportPath) : null

  if (normalizedReportPath) {
    const matchingPath = labelSets.find((labelSet) =>
      normalizeWorkspacePath(labelSet.reportPath) === normalizedReportPath
    )

    if (matchingPath) {
      return matchingPath
    }
  }

  return manualId
    ? labelSets.find((labelSet) => labelSet.manualId === manualId) ?? null
    : null
}

export function evaluatePartMatchLabelFiles({
  labelDir = DEFAULT_PART_MATCH_LABEL_DIR,
  manualId = null,
} = {}) {
  const evaluations = readPartMatchLabelSets(labelDir)
    .filter((labelSet) => !manualId || labelSet.manualId === manualId)
    .map(evaluatePartMatchLabelFile)

  return {
    evaluations,
    failed: evaluations.some((evaluation) => evaluation.failed),
    labelCount: evaluations.reduce((total, evaluation) => total + evaluation.total, 0),
    labelFileCount: evaluations.length,
    messages: formatPartMatchLabelEvaluationMessages(evaluations),
  }
}

export function evaluatePartMatchLabelFile(labelSet) {
  const reportPath = path.resolve(labelSet.reportPath)

  if (!existsSync(reportPath)) {
    return createEvaluation(labelSet, [{
      category: "missing-report",
      message: `Report missing: ${labelSet.reportPath}`,
    }])
  }

  const report = JSON.parse(readFileSync(reportPath, "utf8"))
  const rowsById = readPartMatchReportRowsByItemId(report)

  return evaluatePartMatchLabelRows(labelSet, {
    groups: report.groups ?? [],
    report,
    rowsById,
  })
}

export function evaluatePartMatchLabelRows(labelSet, {
  groups,
  report = {},
  rowsById,
}) {
  const scoredLabels = labelSet.labels.filter(isPartMatchLabelScored)
  const expectedPairs = countExpectedPairs(scoredLabels, rowsById)
  const issues = [
    ...findMissingRows(scoredLabels, rowsById),
    ...findCropDrift(scoredLabels, rowsById),
    ...findFalseGroups(labelSet.labels, groups),
    ...findMissedPairs(scoredLabels, rowsById, groups),
    ...findStaleReportIssues(report),
  ]

  return createEvaluation(labelSet, issues, { expectedPairs })
}

export function isPartMatchLabelScored(label) {
  return label.role !== "excluded" && Boolean(label.expectedPartKey)
}

export function hashPartMatchCrop(value) {
  return createHash("sha256")
    .update(value ?? "")
    .digest("hex")
    .slice(0, 16)
}

export function readPartMatchReportRowsByItemId(report) {
  const rowsById = new Map()

  for (const row of report.rows ?? []) {
    const itemId = row.itemId ?? row.rowId

    if (!itemId) {
      continue
    }

    if (rowsById.has(itemId)) {
      throw new Error(`Part match report has duplicate row itemId ${itemId}.`)
    }

    rowsById.set(itemId, row)
  }

  return rowsById
}

export function formatPartMatchLabelEvaluationMessages(evaluations) {
  if (evaluations.length === 0) {
    return ["No part match label files found; skipping part match label gate."]
  }

  return evaluations.flatMap((evaluation) => {
    const summary = `${evaluation.manualId}: ${evaluation.matchedPairs}/${evaluation.expectedPairs} expected pairs matched; ${evaluation.falseGroups} false groups, ${evaluation.missedPairs} missed pairs, ${evaluation.cropDrifts} crop drifts.`
    const issueLines = evaluation.issues.map((issue) => `  ${issue.category}: ${issue.message}`)

    return [summary, ...issueLines]
  })
}

function normalizePartMatchLabel(label, {
  context,
  fallbackRole,
  seen,
}) {
  assertNonEmptyString(label?.itemId, `${context}.itemId`)

  if (seen.has(label.itemId)) {
    throw new Error(`${context} duplicate itemId ${label.itemId}.`)
  }

  seen.add(label.itemId)

  const role = label.role === undefined ? fallbackRole : label.role

  if (!VALID_LABEL_ROLES.has(role)) {
    throw new Error(`${context}.role must be "gate", "active", or "excluded".`)
  }

  if (role !== "excluded") {
    assertNonEmptyString(label.expectedPartKey, `${context}.expectedPartKey`)
  }

  if (label.note !== undefined && typeof label.note !== "string") {
    throw new Error(`${context}.note must be a string when present.`)
  }

  if (label.cropHash !== undefined && typeof label.cropHash !== "string") {
    throw new Error(`${context}.cropHash must be a string when present.`)
  }

  return {
    cropHash: label.cropHash,
    expectedPartKey: label.expectedPartKey ?? "",
    itemId: label.itemId,
    note: label.note,
    role,
  }
}

function findMissingRows(labels, rowsById) {
  return labels
    .filter((label) => !rowsById.has(label.itemId))
    .map((label) => ({
      category: "missing-row",
      itemId: label.itemId,
      message: `${label.itemId} is missing from report rows.`,
    }))
}

function findCropDrift(labels, rowsById) {
  return labels.flatMap((label) => {
    if (!label.cropHash) {
      return []
    }

    const row = rowsById.get(label.itemId)

    if (!row || row.cropHash === label.cropHash) {
      return []
    }

    return [{
      category: "crop-drift",
      itemId: label.itemId,
      message: `${label.itemId} crop hash changed from ${label.cropHash} to ${row.cropHash}.`,
    }]
  })
}

function findFalseGroups(labels, groups) {
  const labelsByItemId = new Map(labels.map((label) => [label.itemId, label]))

  return groups.flatMap((group) => {
    const groupLabels = group.rowIds
      .map((rowId) => labelsByItemId.get(rowId))
      .filter(Boolean)
    const excludedLabels = groupLabels.filter((label) => label.role === "excluded")
    const expectedKeys = [...new Set(groupLabels
      .filter(isPartMatchLabelScored)
      .map((label) => label.expectedPartKey))]

    if (excludedLabels.length > 0) {
      return [{
        category: "false-group",
        groupId: group.groupId,
        message: `${group.groupId} contains excluded row ${excludedLabels.map((label) => label.itemId).join(" / ")}.`,
      }]
    }

    if (expectedKeys.length > 1) {
      return [{
        category: "false-group",
        groupId: group.groupId,
        message: `${group.groupId} contains ${expectedKeys.join(" / ")}.`,
      }]
    }

    return []
  })
}

function findMissedPairs(labels, rowsById, groups) {
  const groupPairKeys = new Set(groups.flatMap((group) =>
    createPairKeys(group.rowIds)
  ))
  const labelsByKeyAndBag = groupLabelsByPartKeyAndBag(labels, rowsById)

  return [...labelsByKeyAndBag.values()].flatMap((group) =>
    createExpectedPairKeys(group.labels, rowsById)
      .filter((pairKey) => !groupPairKeys.has(pairKey))
      .map((pairKey) => ({
        category: "missed-pair",
        expectedPartKey: group.expectedPartKey,
        message: `${pairKey} expected as ${group.expectedPartKey}.`,
      }))
  )
}

function findStaleReportIssues(report) {
  const issues = []

  if (report.versions?.partMatcherCurrent === false) {
    issues.push({
        category: "stale-matcher",
        message: `Report uses matcher ${report.versions?.partMatcher ?? "unknown"} but current is ${report.versions?.currentPartMatcher ?? "unknown"}.`,
    })
  }

  if (report.versions?.partExtractorCurrent === false) {
    issues.push({
      category: "stale-input",
      message: `Report uses part extractor ${report.versions?.partExtractor ?? "unknown"} but current is ${report.versions?.currentPartExtractor ?? "unknown"}.`,
    })
  }

  return issues
}

function groupLabelsByPartKeyAndBag(labels, rowsById) {
  const groups = new Map()

  for (const label of labels) {
    const row = rowsById.get(label.itemId)

    if (!row) {
      continue
    }

    const key = `${row.bagId}:${label.expectedPartKey}`
    const group = groups.get(key) ?? {
      expectedPartKey: label.expectedPartKey,
      labels: [],
    }

    group.labels.push(label)
    groups.set(key, group)
  }

  return groups
}

function createPairKeys(rowIds) {
  const pairs = []
  const sorted = [...new Set(rowIds)].sort()

  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      pairs.push(`${sorted[left]}::${sorted[right]}`)
    }
  }

  return pairs
}

function createExpectedPairKeys(labels, rowsById) {
  const pairs = []
  const sorted = [...labels].sort((left, right) => left.itemId.localeCompare(right.itemId))

  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      const leftLabel = sorted[left]
      const rightLabel = sorted[right]

      if (!leftLabel || !rightLabel) {
        continue
      }

      const leftRow = rowsById.get(leftLabel.itemId)
      const rightRow = rowsById.get(rightLabel.itemId)

      if (sameKnownCallout(leftRow, rightRow)) {
        continue
      }

      pairs.push(`${leftLabel.itemId}::${rightLabel.itemId}`)
    }
  }

  return pairs
}

function sameKnownCallout(leftRow, rightRow) {
  return Boolean(
    leftRow?.calloutId &&
    rightRow?.calloutId &&
    leftRow.calloutId === rightRow.calloutId,
  )
}

function createEvaluation(labelSet, issues, { expectedPairs = null } = {}) {
  const scoredLabels = labelSet.labels.filter(isPartMatchLabelScored)
  const categoryCounts = countIssues(issues)
  const resolvedExpectedPairs = expectedPairs ?? [...groupLabelsByKey(scoredLabels).values()]
    .reduce((total, labels) => total + createPairKeys(labels.map((label) => label.itemId)).length, 0)
  const missedPairs = categoryCounts.get("missed-pair") ?? 0

  return {
    cropDrifts: categoryCounts.get("crop-drift") ?? 0,
    expectedPairs: resolvedExpectedPairs,
    failed: labelSet.status === "gate" && issues.length > 0,
    falseGroups: categoryCounts.get("false-group") ?? 0,
    issues,
    matchedPairs: Math.max(0, resolvedExpectedPairs - missedPairs),
    missedPairs,
    manualId: labelSet.manualId,
    status: labelSet.status,
    total: scoredLabels.length,
  }
}

function countExpectedPairs(labels, rowsById) {
  const labelsByKeyAndBag = groupLabelsByPartKeyAndBag(labels, rowsById)

  return [...labelsByKeyAndBag.values()]
    .reduce((total, group) => total + createExpectedPairKeys(group.labels, rowsById).length, 0)
}

function groupLabelsByKey(labels) {
  const groups = new Map()

  for (const label of labels) {
    groups.set(label.expectedPartKey, [
      ...(groups.get(label.expectedPartKey) ?? []),
      label,
    ])
  }

  return groups
}

function countIssues(issues) {
  const counts = new Map()

  for (const issue of issues) {
    counts.set(issue.category, (counts.get(issue.category) ?? 0) + 1)
  }

  return counts
}

function readJsonFilePaths(root) {
  return readdirSync(root)
    .flatMap((entry) => {
      const entryPath = path.join(root, entry)
      const stats = statSync(entryPath)

      if (stats.isDirectory()) {
        return readJsonFilePaths(entryPath)
      }

      return entry.endsWith(".json") ? [entryPath] : []
    })
}

function normalizeWorkspacePath(value) {
  return path.relative(process.cwd(), path.resolve(value))
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`)
  }
}

function runCli(argv) {
  const labelDir = readOption(argv, "--label-dir") ?? DEFAULT_PART_MATCH_LABEL_DIR
  const manualId = readOption(argv, "--manual-id")
  const result = evaluatePartMatchLabelFiles({ labelDir, manualId })

  for (const message of result.messages) {
    console.log(message)
  }

  if (result.failed) {
    process.exitCode = 1
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2))
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
