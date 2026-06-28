import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  collectPartPairScorerFeatureNames,
  extractPartPairScoreFeatures,
  partPairScoreFeaturesMatch,
  scoreFeatureVector,
  type PartPairScorerConfig,
  type PartVisualFeatures,
} from "../packages/part-matching/src/index"
import { loadPartMatchScorerEvalData } from "./train-part-match-scorer"

const DEFAULT_OUTPUT_ROOT = path.join(
  ".bag-it",
  "private",
  "part-match-reports",
  "embedding-experiments",
)
const DEFAULT_SCORE_FIELD = "runtimeScorer"
const VERSION = "0.1.0"

interface ManualTrainingExample {
  exampleId: string
  itemId: string
  manualId: string
}

interface RuntimePairInput {
  leftExampleId?: string | null
  rightExampleId?: string | null
  score?: number | null
  scores?: Record<string, number | null> | null
  [key: string]: unknown
}

interface FeatureEntry {
  features: PartVisualFeatures
  itemId: string
  manualId: string
}

interface RuntimeScoreSkippedCounts {
  "invalid-pair": number
  "missing-feature": number
}

export interface ScorePartMatchPairsWithRuntimeScorerOptions {
  examples: readonly ManualTrainingExample[]
  featureEntries: readonly FeatureEntry[]
  pairs: readonly RuntimePairInput[]
  scoreField?: string
  scorerConfig: PartPairScorerConfig
  zeroUnmatched?: boolean
}

export interface ScorePartMatchPairsWithRuntimeScorerResult {
  scoredPairs: RuntimePairInput[]
  skipped: RuntimeScoreSkippedCounts
}

export interface RunPartMatchRuntimeScoreOptions {
  generatedAt?: Date
  manualTrainingDir: string
  outputDir?: string
  scoreDir: string
  scoreField?: string
  scorerConfigPath: string
  zeroUnmatched?: boolean
}

export interface RunPartMatchRuntimeScoreResult {
  outputDir: string
  pairsPath: string
  summary: {
    generatedAt: string
    options: {
      manualTrainingDir: string
      outputDir: string
      scoreDir: string
      scoreField: string
      scorerConfigPath: string
      zeroUnmatched: boolean
    }
    pairsRead: number
    scoredPairs: number
    skipped: RuntimeScoreSkippedCounts
    version: string
  }
  summaryPath: string
}

export async function runPartMatchRuntimeScore(
  options: RunPartMatchRuntimeScoreOptions,
): Promise<RunPartMatchRuntimeScoreResult> {
  const generatedAt = options.generatedAt ?? new Date()
  const scoreField = options.scoreField ?? DEFAULT_SCORE_FIELD
  const outputDir = options.outputDir ?? path.join(
    DEFAULT_OUTPUT_ROOT,
    `${timestampSlug(generatedAt)}-runtime-score`,
  )
  const pairs = await readPairs(options.scoreDir)
  const examples = await readManualTrainingExamples(options.manualTrainingDir)
  const featureEntries = await readFeatureEntries(examples)
  const scorerConfig = await readJson<PartPairScorerConfig>(options.scorerConfigPath)
  const scored = scorePartMatchPairsWithRuntimeScorer({
    examples,
    featureEntries,
    pairs,
    scoreField,
    scorerConfig,
    zeroUnmatched: options.zeroUnmatched,
  })
  const pairsPath = path.join(outputDir, "pairs.json")
  const summaryPath = path.join(outputDir, "summary.json")
  const summary = {
    generatedAt: generatedAt.toISOString(),
    options: {
      manualTrainingDir: options.manualTrainingDir,
      outputDir,
      scoreDir: options.scoreDir,
      scoreField,
      scorerConfigPath: options.scorerConfigPath,
      zeroUnmatched: options.zeroUnmatched ?? false,
    },
    pairsRead: pairs.length,
    scoredPairs: scored.scoredPairs.length,
    skipped: scored.skipped,
    version: VERSION,
  }

  await mkdir(outputDir, { recursive: true })
  await writeJson(pairsPath, scored.scoredPairs)
  await writeJson(summaryPath, summary)
  await writeFile(path.join(outputDir, "index.html"), renderIndex(summary))

  return {
    outputDir,
    pairsPath,
    summary,
    summaryPath,
  }
}

export function scorePartMatchPairsWithRuntimeScorer(
  options: ScorePartMatchPairsWithRuntimeScorerOptions,
): ScorePartMatchPairsWithRuntimeScorerResult {
  const scoreField = options.scoreField ?? DEFAULT_SCORE_FIELD
  const featuresByExampleId = buildFeatureEntriesByExampleId(options.examples, options.featureEntries)
  const featureNames = collectPartPairScorerFeatureNames(options.scorerConfig)
  const skipped: RuntimeScoreSkippedCounts = {
    "invalid-pair": 0,
    "missing-feature": 0,
  }
  const scoredPairs: RuntimePairInput[] = []

  for (const pair of options.pairs) {
    const leftExampleId = pair.leftExampleId
    const rightExampleId = pair.rightExampleId

    if (!leftExampleId || !rightExampleId) {
      skipped["invalid-pair"] += 1
      continue
    }

    const left = featuresByExampleId.get(leftExampleId)
    const right = featuresByExampleId.get(rightExampleId)

    if (!left || !right) {
      skipped["missing-feature"] += 1
      continue
    }

    const features = extractPartPairScoreFeatures(left.features, right.features, {
      featureNames,
    })
    const rawScore = scoreFeatureVector(features, options.scorerConfig)
    const score = options.zeroUnmatched && !partPairScoreFeaturesMatch(features, options.scorerConfig)
      ? 0
      : rawScore

    scoredPairs.push({
      ...pair,
      score,
      scores: {
        ...(pair.scores ?? {}),
        [scoreField]: score,
      },
    })
  }

  return {
    scoredPairs,
    skipped,
  }
}

function buildFeatureEntriesByExampleId(
  examples: readonly ManualTrainingExample[],
  featureEntries: readonly FeatureEntry[],
): Map<string, FeatureEntry> {
  const featureEntriesByKey = new Map(featureEntries.map((entry) => [
    rowKey(entry.manualId, entry.itemId),
    entry,
  ]))
  const result = new Map<string, FeatureEntry>()

  for (const example of examples) {
    const featureEntry = featureEntriesByKey.get(rowKey(example.manualId, example.itemId))

    if (featureEntry) {
      result.set(example.exampleId, featureEntry)
    }
  }

  return result
}

async function readPairs(scoreDir: string): Promise<RuntimePairInput[]> {
  const parsed = await readJson<unknown>(path.join(scoreDir, "pairs.json"))

  return Array.isArray(parsed)
    ? parsed as RuntimePairInput[]
    : Array.isArray((parsed as { pairs?: unknown }).pairs)
      ? (parsed as { pairs: RuntimePairInput[] }).pairs
      : []
}

async function readManualTrainingExamples(root: string): Promise<ManualTrainingExample[]> {
  const parsed = await readJson<{ examples?: ManualTrainingExample[] }>(path.join(root, "examples.json"))

  return parsed.examples ?? []
}

async function readFeatureEntries(
  examples: readonly ManualTrainingExample[],
): Promise<FeatureEntry[]> {
  const manualIds = [...new Set(examples.map((example) => example.manualId))].sort()
  const evalData = await loadPartMatchScorerEvalData({
    includeDerivedPairs: false,
    manualIds,
  })
  const reportRowsByManual = (evalData as unknown as {
    reportRowsByManual: Map<string, Map<string, {
      features: PartVisualFeatures
      itemId: string
    }>>
  }).reportRowsByManual
  const result: FeatureEntry[] = []

  for (const [manualId, rows] of reportRowsByManual) {
    for (const row of rows.values()) {
      result.push({
        features: row.features,
        itemId: row.itemId,
        manualId,
      })
    }
  }

  return result
}

function rowKey(manualId: string, itemId: string): string {
  return `${manualId}\u0000${itemId}`
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function timestampSlug(date: Date): string {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-")
}

function renderIndex(summary: RunPartMatchRuntimeScoreResult["summary"]): string {
  return `<!doctype html>
<meta charset="utf-8">
<title>Part Match Runtime Score</title>
<style>
body { color: #172033; font: 14px/1.5 system-ui, sans-serif; margin: 24px; }
code { background: #f1f5f9; border-radius: 4px; padding: 2px 4px; }
</style>
<h1>Part Match Runtime Score</h1>
<p>${summary.scoredPairs} scored pairs · ${summary.skipped["missing-feature"]} missing features · ${summary.skipped["invalid-pair"]} invalid pairs</p>
<p>Scorer config: <code>${escapeHtml(summary.options.scorerConfigPath)}</code></p>
<p>Zero unmatched: <code>${summary.options.zeroUnmatched ? "true" : "false"}</code></p>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
}

function readOption(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name)

  return index >= 0 ? argv[index + 1] ?? null : null
}

async function runCli(): Promise<void> {
  const argv = process.argv.slice(2)
  const manualTrainingDir = readOption(argv, "--manual-training-dir")
  const scoreDir = readOption(argv, "--score-dir")
  const scorerConfigPath = readOption(argv, "--scorer-config")

  if (!manualTrainingDir || !scoreDir || !scorerConfigPath) {
    throw new Error("Usage: part-match-runtime-score --score-dir <dir> --manual-training-dir <dir> --scorer-config <file> [--score-field <name>] [--output-dir <dir>]")
  }

  const result = await runPartMatchRuntimeScore({
    manualTrainingDir,
    outputDir: readOption(argv, "--output-dir") ?? undefined,
    scoreDir,
    scoreField: readOption(argv, "--score-field") ?? undefined,
    scorerConfigPath,
    zeroUnmatched: argv.includes("--zero-unmatched"),
  })

  console.log(JSON.stringify({
    outputDir: result.outputDir,
    pairsPath: result.pairsPath,
    summaryPath: result.summaryPath,
    ...result.summary,
  }, null, 2))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
