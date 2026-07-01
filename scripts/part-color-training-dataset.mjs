import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  DEFAULT_PART_COLOR_LABEL_DIR,
  classifyPartColorMismatch,
  evaluatePartColorLabelFile,
  findPartColorLabelConflicts,
  isRejectedTuningReport,
  readPartColorLabelSets,
  readReportRowCropHash,
  readReportRowsByItemId,
} from "./part-color-label-eval.mjs"
import {
  PART_COLOR_LABEL_ROLES,
  countPartColorLabelRoles,
  isPartColorLabelScored,
  isPartColorLabelTrainable,
} from "./part-color-label-roles.mjs"

const CLOSE_PAIR_CATEGORIES = new Set([
  "blue-green-family-split",
  "gold-nougat-trans-singleton",
  "neutral-small-part-ambiguity",
  "warm-red-trans-brown",
])

export function buildPartColorTrainingDatasetSummary({
  labelDir = DEFAULT_PART_COLOR_LABEL_DIR,
  manualId = null,
} = {}) {
  const labelSets = readPartColorLabelSets(labelDir)
    .filter((labelSet) => !manualId || labelSet.manualId === manualId)
  const manuals = labelSets.map(summarizeManualTrainingDataset)
  const dirtyLabelRejections = manuals.flatMap((manual) => manual.dirtyLabelRejections)

  return {
    closePairConfusions: summarizeClosePairConfusions(manuals),
    dirtyLabelSummary: summarizeDirtyLabels(dirtyLabelRejections),
    families: summarizeFamilies(manuals),
    labelDir,
    manuals: manuals.map(stripManualDetail),
    totals: {
      dirtyLabels: dirtyLabelRejections.length,
      excludedLabels: manuals.reduce((total, manual) => total + manual.excluded, 0),
      manuals: manuals.length,
      scoredLabels: manuals.reduce((total, manual) => total + manual.total, 0),
      trainableExamples: manuals.reduce((total, manual) => total + manual.trainableExamples, 0),
    },
    trainableByManualRole: manuals.map((manual) => ({
      gate: manual.trainableByRole.gate,
      manualId: manual.manualId,
      train: manual.trainableByRole.train,
    })),
  }
}

function summarizeManualTrainingDataset(labelSet) {
  const evaluation = evaluatePartColorLabelFile(labelSet)
  const report = readTrainingReport(labelSet.reportPath)
  const rowsById = report && !isRejectedTuningReport(report)
    ? readReportRowsByItemId(report)
    : new Map()
  const dirtyLabelRejections = findDirtyLabelRejections(labelSet, report, rowsById)
  const trainableExamples = labelSet.labels
    .filter(isPartColorLabelTrainable)
    .filter((label) => !dirtyLabelRejections.some((rejection) => rejection.itemId === label.itemId))
  const familyCounts = summarizeManualFamilies(labelSet, rowsById, dirtyLabelRejections)

  return {
    ...evaluation,
    dirtyLabelRejections,
    familyCounts,
    roleCounts: countPartColorLabelRoles(labelSet.labels),
    trainableByRole: {
      gate: trainableExamples.filter((label) => label.role === "gate").length,
      train: trainableExamples.filter((label) => label.role === "train").length,
    },
    trainableExamples: trainableExamples.length,
  }
}

function readTrainingReport(reportPath) {
  const resolvedPath = path.resolve(reportPath)

  if (!existsSync(resolvedPath)) {
    return null
  }

  return JSON.parse(readFileSync(resolvedPath, "utf8"))
}

function findDirtyLabelRejections(labelSet, report, rowsById) {
  const rejections = []
  const reportRejected = report ? isRejectedTuningReport(report) : false
  const conflicts = report && !reportRejected
    ? findPartColorLabelConflicts({
        labels: labelSet.labels.filter(isPartColorLabelScored),
        rowsById,
      })
    : []
  const conflictItemIds = new Set(conflicts.map((conflict) => conflict.itemId))

  for (const label of labelSet.labels) {
    if (!isPartColorLabelTrainable(label)) {
      rejections.push(createDirtyLabelRejection(labelSet, label, label.role === "excluded" ? "excluded-role" : "score-only-role"))
      continue
    }

    if (!report) {
      rejections.push(createDirtyLabelRejection(labelSet, label, "missing-report"))
      continue
    }

    if (reportRejected) {
      rejections.push(createDirtyLabelRejection(labelSet, label, "stale-report"))
      continue
    }

    const row = rowsById.get(label.itemId)

    if (!row) {
      rejections.push(createDirtyLabelRejection(labelSet, label, "missing-row"))
      continue
    }

    if (conflictItemIds.has(label.itemId)) {
      rejections.push(createDirtyLabelRejection(labelSet, label, "conflicting-crop-hash"))
      continue
    }

    if (label.cropHash && readReportRowCropHash(row) !== label.cropHash) {
      rejections.push(createDirtyLabelRejection(labelSet, label, "stale-crop-hash"))
      continue
    }

    if (
      !row.colorName ||
      row.colorName === "Unknown" ||
      row.sampleStatus === "unknown" ||
      row.sampleStatus === "weak-classifiable"
    ) {
      rejections.push(createDirtyLabelRejection(labelSet, label, "unclear-sample"))
    }
  }

  return rejections
}

function createDirtyLabelRejection(labelSet, label, reason) {
  return {
    expectedName: label.expectedName,
    itemId: label.itemId,
    manualId: labelSet.manualId,
    reason,
    role: label.role,
  }
}

function summarizeManualFamilies(labelSet, rowsById, dirtyLabelRejections) {
  const dirtyItemIds = new Set(dirtyLabelRejections.map((rejection) => rejection.itemId))
  const familiesByName = new Map()

  for (const label of labelSet.labels.filter(isPartColorLabelScored)) {
    const row = rowsById.get(label.itemId)
    const family = row?.family ?? "unknown"
    const summary = familiesByName.get(family) ?? {
      dirtyLabels: 0,
      family,
      scoredLabels: 0,
      trainableExamples: 0,
    }

    summary.scoredLabels += 1

    if (dirtyItemIds.has(label.itemId)) {
      summary.dirtyLabels += 1
    } else if (isPartColorLabelTrainable(label)) {
      summary.trainableExamples += 1
    }

    familiesByName.set(family, summary)
  }

  return [...familiesByName.values()].sort((left, right) =>
    right.scoredLabels - left.scoredLabels ||
    left.family.localeCompare(right.family),
  )
}

function summarizeFamilies(manuals) {
  const families = new Map()

  for (const manual of manuals) {
    for (const family of manual.familyCounts) {
      const summary = families.get(family.family) ?? {
        dirtyLabels: 0,
        family: family.family,
        scoredLabels: 0,
        trainableExamples: 0,
      }

      summary.dirtyLabels += family.dirtyLabels
      summary.scoredLabels += family.scoredLabels
      summary.trainableExamples += family.trainableExamples
      families.set(family.family, summary)
    }
  }

  return [...families.values()].sort((left, right) =>
    right.scoredLabels - left.scoredLabels ||
    left.family.localeCompare(right.family),
  )
}

function summarizeClosePairConfusions(manuals) {
  const confusions = new Map()

  for (const manual of manuals) {
    for (const confusion of manual.confusionCounts ?? []) {
      const category = classifyPartColorMismatch(confusion.expectedName, confusion.actualName)

      if (!CLOSE_PAIR_CATEGORIES.has(category)) {
        continue
      }

      const key = `${category}\u0000${confusion.expectedName}\u0000${confusion.actualName}`
      const summary = confusions.get(key) ?? {
        actualName: confusion.actualName,
        category,
        count: 0,
        expectedName: confusion.expectedName,
      }

      summary.count += confusion.count
      confusions.set(key, summary)
    }
  }

  return [...confusions.values()].sort((left, right) =>
    right.count - left.count ||
    left.category.localeCompare(right.category) ||
    left.expectedName.localeCompare(right.expectedName) ||
    left.actualName.localeCompare(right.actualName),
  )
}

function summarizeDirtyLabels(rejections) {
  const counts = new Map()

  for (const rejection of rejections) {
    const summary = counts.get(rejection.reason) ?? {
      count: 0,
      reason: rejection.reason,
    }

    summary.count += 1
    counts.set(rejection.reason, summary)
  }

  return [...counts.values()].sort((left, right) =>
    right.count - left.count ||
    left.reason.localeCompare(right.reason),
  )
}

function stripManualDetail(manual) {
  return {
    conflicts: manual.conflicts,
    dirtyLabels: manual.dirtyLabelRejections.length,
    excluded: manual.excluded,
    familyCounts: manual.familyCounts,
    manualId: manual.manualId,
    matched: manual.matched,
    missing: manual.missing,
    mismatched: manual.mismatched,
    reportPath: manual.reportPath,
    roleCounts: pickRoleCounts(manual.roleCounts),
    status: manual.status,
    total: manual.total,
    trainableByRole: manual.trainableByRole,
    trainableExamples: manual.trainableExamples,
  }
}

function pickRoleCounts(roleCounts) {
  return Object.fromEntries(PART_COLOR_LABEL_ROLES.map((role) => [role, roleCounts?.[role] ?? 0]))
}

function readOption(argv, name) {
  const index = argv.indexOf(name)

  return index === -1 ? null : argv[index + 1] ?? null
}

function runCli(argv = process.argv.slice(2)) {
  const summary = buildPartColorTrainingDatasetSummary({
    labelDir: readOption(argv, "--label-dir") ?? DEFAULT_PART_COLOR_LABEL_DIR,
    manualId: readOption(argv, "--manual-id"),
  })

  console.log(JSON.stringify(summary, null, 2))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli()
}
