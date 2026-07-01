import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  DEFAULT_PART_MATCH_LABEL_DIR,
  readPartMatchLabelSets,
} from "./part-match-label-eval.mjs"
import {
  DEFAULT_PART_MATCH_SOURCE_DIR,
  analyzePartMatchRules,
} from "./part-match-rule-analysis.mjs"
import {
  trainPartMatchScorer,
} from "./train-part-match-scorer.ts"

export const DEFAULT_PART_MATCH_HOLDOUT_DIR = path.join(
  ".bag-it",
  "private",
  "part-match-reports",
  "holdout",
)

const DEFAULT_MAX_EVIDENCE_RULE_CONDITIONS = 3
const DEFAULT_MAX_EVIDENCE_RULES = 160
const DEFAULT_MIN_EVIDENCE_RULE_CONDITIONS = 2
const DEFAULT_MIN_EVIDENCE_RULE_GAIN = 1

export async function runPartMatchHoldoutAnalysis({
  baseScorerConfigPath = null,
  decisionPaths = [],
  generatedAt = new Date(),
  heldOutManualIds = null,
  labelDir = DEFAULT_PART_MATCH_LABEL_DIR,
  manualIds = null,
  maxEvidenceRuleConditions = DEFAULT_MAX_EVIDENCE_RULE_CONDITIONS,
  maxEvidenceRules = DEFAULT_MAX_EVIDENCE_RULES,
  maxTreeDepth = undefined,
  minEvidenceRuleConditions = DEFAULT_MIN_EVIDENCE_RULE_CONDITIONS,
  minEvidenceRuleGain = DEFAULT_MIN_EVIDENCE_RULE_GAIN,
  minTreeLeafSize = undefined,
  outputDir = DEFAULT_PART_MATCH_HOLDOUT_DIR,
  sourceDir = DEFAULT_PART_MATCH_SOURCE_DIR,
} = {}) {
  const selectedManualIds = readSelectedManualIds({
    labelDir,
    manualIds,
  })

  if (selectedManualIds.length < 2) {
    throw new Error("Part match holdout analysis needs at least two labeled manuals.")
  }

  const foldManualIds = readFoldManualIds(selectedManualIds, heldOutManualIds)
  const foldsDir = path.join(outputDir, "folds")

  await mkdir(foldsDir, { recursive: true })

  const folds = []

  for (const heldOutManualId of foldManualIds) {
    const trainManualIds = selectedManualIds.filter((manualId) => manualId !== heldOutManualId)
    const scorerConfigPath = path.join(foldsDir, `${heldOutManualId}.scorer-config.json`)
    const trainingResult = await trainPartMatchScorer({
      baseScorerConfigPath,
      decisionPaths,
      labelDir,
      manualIds: trainManualIds,
      maxEvidenceRuleConditions,
      maxEvidenceRules,
      maxTreeDepth,
      minEvidenceRuleConditions,
      minEvidenceRuleGain,
      minTreeLeafSize,
      outputPath: scorerConfigPath,
      sourceDir,
    })
    const trainAnalysis = analyzePartMatchRules({
      labelDir,
      manualIds: trainManualIds,
      scorerConfigPath,
      sourceDir,
    })
    const holdoutAnalysis = analyzePartMatchRules({
      labelDir,
      manualIds: [heldOutManualId],
      scorerConfigPath,
      sourceDir,
    })

    folds.push({
      heldOutManualId,
      scorerConfigPath: normalizeWorkspacePath(scorerConfigPath),
      train: summarizeAnalysis(trainAnalysis),
      training: {
        examples: trainingResult.examples.length,
        groupScore: trainingResult.groupScore,
        pairScore: trainingResult.pairScore,
      },
      trainManualIds,
      holdout: summarizeAnalysis(holdoutAnalysis),
    })
  }

  const analysis = {
    baseScorerConfigPath: baseScorerConfigPath
      ? normalizeWorkspacePath(baseScorerConfigPath)
      : null,
    generatedAt: generatedAt.toISOString(),
    labelDir: normalizeWorkspacePath(labelDir),
    heldOutManualIds: foldManualIds,
    manualIds: selectedManualIds,
    options: {
      maxEvidenceRuleConditions,
      maxEvidenceRules,
      maxTreeDepth: maxTreeDepth ?? null,
      minEvidenceRuleConditions,
      minEvidenceRuleGain,
      minTreeLeafSize: minTreeLeafSize ?? null,
    },
    outputDir: normalizeWorkspacePath(outputDir),
    sourceDir: normalizeWorkspacePath(sourceDir),
    folds,
    totals: summarizeFolds(folds),
  }

  await mkdir(outputDir, { recursive: true })
  await writeFile(
    path.join(outputDir, "holdout-analysis.json"),
    `${JSON.stringify(analysis, null, 2)}\n`,
  )
  await writeFile(
    path.join(outputDir, "summary.txt"),
    `${formatPartMatchHoldoutAnalysis(analysis)}\n`,
  )

  return analysis
}

function readFoldManualIds(selectedManualIds, heldOutManualIds) {
  if (!heldOutManualIds) {
    return selectedManualIds
  }

  const selected = new Set(selectedManualIds)
  const unknownManualIds = heldOutManualIds.filter((manualId) => !selected.has(manualId))

  if (unknownManualIds.length > 0) {
    throw new Error(`Unknown held-out manual ids: ${unknownManualIds.join(", ")}`)
  }

  return heldOutManualIds
}

function readSelectedManualIds({
  labelDir,
  manualIds,
}) {
  const allowedManualIds = manualIds ? new Set(manualIds) : null

  return [...new Set(readPartMatchLabelSets(labelDir)
    .map((labelSet) => labelSet.manualId)
    .filter((manualId) => !allowedManualIds || allowedManualIds.has(manualId)))]
}

function summarizeAnalysis(analysis) {
  return {
    groupTotals: analysis.groupTotals,
    missedBuckets: analysis.missedBuckets,
    pairTotals: analysis.pairTotals,
  }
}

function summarizeFolds(folds) {
  return {
    holdout: {
      groupTotals: sumGroupTotals(folds.map((fold) => fold.holdout.groupTotals)),
      pairTotals: sumPairTotals(folds.map((fold) => fold.holdout.pairTotals)),
    },
    trainSafety: {
      maxFalseGroups: Math.max(...folds.map((fold) => fold.train.groupTotals.falseGroups)),
      maxHardNegativeFalsePositivePairs: Math.max(
        ...folds.map((fold) => fold.train.pairTotals.falsePositivePairs),
      ),
    },
    unsafeHoldoutFolds: folds
      .filter((fold) =>
        fold.holdout.groupTotals.falseGroups > 0 ||
        fold.holdout.pairTotals.falsePositivePairs > 0 ||
        fold.holdout.groupTotals.cropDrifts > 0
      )
      .map((fold) => fold.heldOutManualId),
    unsafeTrainFolds: folds
      .filter((fold) =>
        fold.train.groupTotals.falseGroups > 0 ||
        fold.train.pairTotals.falsePositivePairs > 0 ||
        fold.train.groupTotals.cropDrifts > 0
      )
      .map((fold) => fold.heldOutManualId),
  }
}

function sumGroupTotals(totals) {
  return totals.reduce((sum, total) => ({
    cropDrifts: sum.cropDrifts + total.cropDrifts,
    expectedPairs: sum.expectedPairs + total.expectedPairs,
    falseGroups: sum.falseGroups + total.falseGroups,
    matchedPairs: sum.matchedPairs + total.matchedPairs,
    missedPairs: sum.missedPairs + total.missedPairs,
  }), {
    cropDrifts: 0,
    expectedPairs: 0,
    falseGroups: 0,
    matchedPairs: 0,
    missedPairs: 0,
  })
}

function sumPairTotals(totals) {
  return totals.reduce((sum, total) => ({
    falsePositivePairs: sum.falsePositivePairs + total.falsePositivePairs,
    sameMatchedPairs: sum.sameMatchedPairs + total.sameMatchedPairs,
    sameMissedPairs: sum.sameMissedPairs + total.sameMissedPairs,
  }), {
    falsePositivePairs: 0,
    sameMatchedPairs: 0,
    sameMissedPairs: 0,
  })
}

export function formatPartMatchHoldoutAnalysis(analysis) {
  const lines = [
    "Part match holdout analysis",
    `Base scorer: ${analysis.baseScorerConfigPath ?? "none"}`,
    `Manuals: ${analysis.manualIds.join(", ")}`,
    "",
    "Holdout total",
    formatGroupLine("  group", analysis.totals.holdout.groupTotals),
    formatPairLine("  pair", analysis.totals.holdout.pairTotals),
    `  unsafe holdout folds: ${analysis.totals.unsafeHoldoutFolds.join(", ") || "none"}`,
    "",
    "Train safety",
    `  max false groups: ${analysis.totals.trainSafety.maxFalseGroups}`,
    `  max hard-negative false-positive pairs: ${analysis.totals.trainSafety.maxHardNegativeFalsePositivePairs}`,
    `  unsafe train folds: ${analysis.totals.unsafeTrainFolds.join(", ") || "none"}`,
    "",
    "Folds",
  ]

  for (const fold of analysis.folds) {
    lines.push(
      `  ${fold.heldOutManualId}`,
      formatGroupLine("    holdout group", fold.holdout.groupTotals),
      formatPairLine("    holdout pair", fold.holdout.pairTotals),
      formatGroupLine("    train group", fold.train.groupTotals),
      formatPairLine("    train pair", fold.train.pairTotals),
    )
  }

  return lines.join("\n")
}

function formatGroupLine(label, totals) {
  return `${label}: ${totals.matchedPairs}/${totals.expectedPairs} matched; ${totals.falseGroups} false groups; ${totals.missedPairs} missed; ${totals.cropDrifts} drift`
}

function formatPairLine(label, totals) {
  return `${label}: ${totals.sameMatchedPairs} same matched; ${totals.sameMissedPairs} same missed; ${totals.falsePositivePairs} hard-negative false positives`
}

function normalizeWorkspacePath(value) {
  const relative = path.relative(process.cwd(), path.resolve(value))

  return relative.startsWith("..") ? value : relative
}

function readOption(argv, name) {
  const index = argv.indexOf(name)

  return index >= 0 ? argv[index + 1] ?? null : null
}

function parsePaths(value) {
  return value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : []
}

function parseOptionalPaths(value) {
  return value === null ? null : parsePaths(value)
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10)

  return Number.isFinite(parsed) ? parsed : fallback
}

function parseOptionalInteger(value) {
  const parsed = Number.parseInt(value ?? "", 10)

  return Number.isFinite(parsed) ? parsed : undefined
}

async function runCli() {
  const argv = process.argv.slice(2)
  const analysis = await runPartMatchHoldoutAnalysis({
    baseScorerConfigPath: readOption(argv, "--base-scorer-config"),
    decisionPaths: parsePaths(readOption(argv, "--decision-path")),
    heldOutManualIds: parseOptionalPaths(readOption(argv, "--held-out-manual-ids")),
    labelDir: readOption(argv, "--label-dir") ?? DEFAULT_PART_MATCH_LABEL_DIR,
    manualIds: parseOptionalPaths(readOption(argv, "--manual-ids")),
    maxEvidenceRuleConditions: parseInteger(
      readOption(argv, "--max-evidence-rule-conditions"),
      DEFAULT_MAX_EVIDENCE_RULE_CONDITIONS,
    ),
    maxEvidenceRules: parseInteger(readOption(argv, "--max-evidence-rules"), DEFAULT_MAX_EVIDENCE_RULES),
    maxTreeDepth: parseOptionalInteger(readOption(argv, "--max-tree-depth")),
    minEvidenceRuleConditions: parseInteger(
      readOption(argv, "--min-evidence-rule-conditions"),
      DEFAULT_MIN_EVIDENCE_RULE_CONDITIONS,
    ),
    minEvidenceRuleGain: parseInteger(
      readOption(argv, "--min-evidence-rule-gain"),
      DEFAULT_MIN_EVIDENCE_RULE_GAIN,
    ),
    minTreeLeafSize: parseOptionalInteger(readOption(argv, "--min-tree-leaf-size")),
    outputDir: readOption(argv, "--output-dir") ?? DEFAULT_PART_MATCH_HOLDOUT_DIR,
    sourceDir: readOption(argv, "--source-dir") ?? DEFAULT_PART_MATCH_SOURCE_DIR,
  })

  if (argv.includes("--json")) {
    console.log(JSON.stringify(analysis, null, 2))
  } else {
    console.log(formatPartMatchHoldoutAnalysis(analysis))
    console.log(`\nWrote holdout analysis to ${path.join(analysis.outputDir, "holdout-analysis.json")}`)
  }

  if (
    argv.includes("--fail-on-false-positive") &&
    (
      analysis.totals.holdout.groupTotals.falseGroups > 0 ||
      analysis.totals.holdout.pairTotals.falsePositivePairs > 0 ||
      analysis.totals.trainSafety.maxFalseGroups > 0 ||
      analysis.totals.trainSafety.maxHardNegativeFalsePositivePairs > 0
    )
  ) {
    process.exitCode = 1
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
