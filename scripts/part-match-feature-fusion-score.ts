import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  DEFAULT_PART_PAIR_SCORER_CONFIG,
  scorePartPair,
  type PartVisualFeatures,
} from "../packages/part-matching/src/index"
import { loadPartMatchScorerEvalData } from "./train-part-match-scorer"

const DEFAULT_OUTPUT_ROOT = path.join(
  ".bag-it",
  "private",
  "part-match-reports",
  "embedding-experiments",
)
const DEFAULT_CANDIDATE_MIN_SCORE = 0.4
const DEFAULT_EPOCHS = 800
const DEFAULT_LEARNING_RATE = 0.015
const DEFAULT_L2 = 0.001
const VERSION = "0.1.0"

const SCORE_FEATURE_NAMES = [
  "cnn",
  "structural",
  "cnnIfStructuralMatch",
  "cnnStructuralMin",
  "cnnStructuralProduct",
  "cnnNearMin",
  "cnnNearProduct",
  "cnnAlphaProduct",
  "cnnLumaProduct",
] as const

interface ManualTrainingExample {
  exampleId: string
  itemId: string
  manualId: string
}

interface ScoredPairInput {
  kind?: string | null
  leftExampleId?: string | null
  rightExampleId?: string | null
  score?: number | null
  scores?: Record<string, number | null> | null
  split?: string | null
  target?: number | null
}

interface NormalizedPair {
  leftExampleId: string
  rightExampleId: string
  score: number
  target: 0 | 1
}

interface FeatureEntry {
  features: PartVisualFeatures
  itemId: string
  manualId: string
}

interface FusionCandidate {
  featureMap: Record<string, number>
  pair: ScoredPairInput
  target: 0 | 1
}

interface FeatureFusionModel {
  featureNames: string[]
  means: number[]
  stds: number[]
  weights: number[]
}

interface FeatureFusionSummary {
  candidateMinScore: number
  candidatePairs: number
  featureCount: number
  generatedAt: string
  negativeTrain: number
  options: {
    manualTrainingDir: string
    outputDir: string
    scoreDir: string
  }
  positiveTrain: number
  skipped: Record<string, number>
  version: string
}

export interface RunPartMatchFeatureFusionScoreOptions {
  candidateMinScore?: number
  generatedAt?: Date
  manualTrainingDir: string
  outputDir?: string
  scoreDir: string
}

export interface RunPartMatchFeatureFusionScoreResult {
  outputDir: string
  pairsPath: string
  summary: FeatureFusionSummary
  summaryPath: string
}

export async function runPartMatchFeatureFusionScore(
  options: RunPartMatchFeatureFusionScoreOptions,
): Promise<RunPartMatchFeatureFusionScoreResult> {
  const generatedAt = options.generatedAt ?? new Date()
  const outputDir = options.outputDir ?? path.join(
    DEFAULT_OUTPUT_ROOT,
    `${timestampSlug(generatedAt)}-feature-fusion-score`,
  )
  const candidateMinScore = options.candidateMinScore ?? DEFAULT_CANDIDATE_MIN_SCORE
  const examples = await readManualTrainingExamples(options.manualTrainingDir)
  const featureEntries = await readFeatureEntries(examples)
  const pairs = await readScoredPairs(options.scoreDir)
  const skipped: Record<string, number> = {}
  const candidates: FusionCandidate[] = []

  for (const pair of pairs) {
    const normalized = normalizeScoredPair(pair)

    if (!normalized) {
      increment(skipped, "invalid-pair")
      continue
    }

    if (normalized.score < candidateMinScore) {
      continue
    }

    const left = featureEntries.get(normalized.leftExampleId)
    const right = featureEntries.get(normalized.rightExampleId)

    if (!left || !right) {
      increment(skipped, "missing-features")
      continue
    }

    candidates.push({
      featureMap: createFeatureMap(pair, left.features, right.features),
      pair,
      target: normalized.target,
    })
  }

  const trainCandidates = candidates.filter((candidate) => candidate.pair.split === "train")
  const model = fitFeatureFusionModel(trainCandidates)
  const positiveTrain = trainCandidates.filter((candidate) => candidate.target === 1).length
  const candidateByPair = new Map(candidates.map((candidate) => [candidate.pair, candidate]))
  const outputPairs = pairs.map((pair) => {
    const candidate = candidateByPair.get(pair)
    const featureFusion = candidate
      ? scoreFeatureFusion(model, candidate.featureMap)
      : 0
    const combined = combineFeatureFusionScores(featureFusion, pair.scores)

    return {
      ...pair,
      score: combined.featureFusionProduct,
      scores: {
        ...pair.scores,
        featureFusion,
        featureFusionMax: combined.featureFusionMax,
        featureFusionProduct: combined.featureFusionProduct,
      },
    }
  })
  const summary: FeatureFusionSummary = {
    candidateMinScore,
    candidatePairs: candidates.length,
    featureCount: model.featureNames.length,
    generatedAt: generatedAt.toISOString(),
    negativeTrain: trainCandidates.length - positiveTrain,
    options: {
      manualTrainingDir: options.manualTrainingDir,
      outputDir,
      scoreDir: options.scoreDir,
    },
    positiveTrain,
    skipped,
    version: VERSION,
  }
  const pairsPath = path.join(outputDir, "pairs.json")
  const summaryPath = path.join(outputDir, "summary.json")

  await mkdir(outputDir, { recursive: true })
  await writeFile(pairsPath, `${JSON.stringify(outputPairs, null, 2)}\n`)
  await writeFile(summaryPath, `${JSON.stringify({
    ...summary,
    model,
  }, null, 2)}\n`)
  await writeFile(path.join(outputDir, "index.html"), renderIndex(summary))

  return {
    outputDir,
    pairsPath,
    summary,
    summaryPath,
  }
}

export function fitFeatureFusionModel(
  candidates: readonly FusionCandidate[],
): FeatureFusionModel {
  if (!candidates.some((candidate) => candidate.target === 1)) {
    throw new Error("Feature fusion needs at least one positive training candidate.")
  }

  if (!candidates.some((candidate) => candidate.target === 0)) {
    throw new Error("Feature fusion needs at least one negative training candidate.")
  }

  const featureNames = [...new Set(candidates.flatMap((candidate) =>
    Object.keys(candidate.featureMap)
  ))].sort()
  const scaler = fitScaler(candidates, featureNames)
  const xs = candidates.map((candidate) => toVector(candidate.featureMap, featureNames, scaler))
  const ys = candidates.map((candidate) => candidate.target)

  return {
    featureNames,
    means: scaler.means,
    stds: scaler.stds,
    weights: fitLogistic(xs, ys),
  }
}

export function scoreFeatureFusion(
  model: FeatureFusionModel,
  featureMap: Record<string, number>,
): number {
  return sigmoid(dot(model.weights, toVector(featureMap, model.featureNames, model)))
}

export function combineFeatureFusionScores(
  featureFusion: number,
  scores?: Record<string, number | null> | null,
) {
  const rawGate = scores?.cnnIfStructuralMatch
  const hasGate = typeof rawGate === "number" && Number.isFinite(rawGate)
  const cnnIfStructuralMatch = hasGate ? rawGate : featureFusion

  return {
    featureFusionMax: Math.max(featureFusion, cnnIfStructuralMatch),
    featureFusionProduct: Math.sqrt(featureFusion * cnnIfStructuralMatch),
  }
}

async function readManualTrainingExamples(root: string): Promise<ManualTrainingExample[]> {
  const parsed = JSON.parse(await readFile(path.join(root, "examples.json"), "utf8")) as {
    examples?: ManualTrainingExample[]
  }

  return parsed.examples ?? []
}

async function readFeatureEntries(
  examples: readonly ManualTrainingExample[],
): Promise<Map<string, FeatureEntry>> {
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
  const result = new Map<string, FeatureEntry>()

  for (const example of examples) {
    const row = reportRowsByManual.get(example.manualId)?.get(example.itemId)

    if (!row) {
      continue
    }

    result.set(example.exampleId, {
      features: row.features,
      itemId: row.itemId,
      manualId: example.manualId,
    })
  }

  return result
}

async function readScoredPairs(scoreDir: string): Promise<ScoredPairInput[]> {
  const parsed = JSON.parse(await readFile(path.join(scoreDir, "pairs.json"), "utf8")) as unknown

  return Array.isArray(parsed)
    ? parsed as ScoredPairInput[]
    : Array.isArray((parsed as { pairs?: unknown }).pairs)
      ? (parsed as { pairs: ScoredPairInput[] }).pairs
      : []
}

function normalizeScoredPair(pair: ScoredPairInput): NormalizedPair | null {
  const leftExampleId = pair.leftExampleId
  const rightExampleId = pair.rightExampleId
  const score = pair.score
  const target = pair.target === 1 ? 1 : pair.target === 0 ? 0 : null

  if (!leftExampleId || !rightExampleId || !Number.isFinite(score) || target === null) {
    return null
  }

  return {
    leftExampleId,
    rightExampleId,
    score: score as number,
    target,
  }
}

function createFeatureMap(
  pair: ScoredPairInput,
  left: PartVisualFeatures,
  right: PartVisualFeatures,
): Record<string, number> {
  const structural = scorePartPair(left, right, DEFAULT_PART_PAIR_SCORER_CONFIG)
  const featureMap: Record<string, number> = {}

  for (const scoreName of SCORE_FEATURE_NAMES) {
    featureMap[`score:${scoreName}`] = finite(pair.scores?.[scoreName] ?? 0)
  }

  for (const [name, value] of Object.entries(structural.features)) {
    featureMap[`struct:${name}`] = finite(value)
  }

  featureMap["struct:matched"] = structural.matched ? 1 : 0
  featureMap["struct:probability"] = structural.probability

  return featureMap
}

function fitScaler(candidates: readonly FusionCandidate[], featureNames: readonly string[]) {
  const means = Array(featureNames.length).fill(0)
  const stds = Array(featureNames.length).fill(0)

  for (const candidate of candidates) {
    for (let index = 0; index < featureNames.length; index += 1) {
      means[index] += finite(candidate.featureMap[featureNames[index]] ?? 0)
    }
  }

  for (let index = 0; index < means.length; index += 1) {
    means[index] /= Math.max(1, candidates.length)
  }

  for (const candidate of candidates) {
    for (let index = 0; index < featureNames.length; index += 1) {
      const delta = finite(candidate.featureMap[featureNames[index]] ?? 0) - means[index]
      stds[index] += delta * delta
    }
  }

  for (let index = 0; index < stds.length; index += 1) {
    stds[index] = Math.sqrt(stds[index] / Math.max(1, candidates.length))

    if (stds[index] < 0.000001) {
      stds[index] = 1
    }
  }

  return { means, stds }
}

function toVector(
  featureMap: Record<string, number>,
  featureNames: readonly string[],
  scaler: { means: readonly number[]; stds: readonly number[] },
) {
  return [
    1,
    ...featureNames.map((name, index) =>
      (finite(featureMap[name] ?? 0) - scaler.means[index]) / scaler.stds[index]
    ),
  ]
}

function fitLogistic(xs: readonly number[][], ys: readonly number[]) {
  const weights = Array(xs[0]?.length ?? 0).fill(0)
  const positives = ys.filter(Boolean).length
  const negatives = ys.length - positives
  const positiveWeight = negatives / Math.max(1, positives)

  for (let epoch = 0; epoch < DEFAULT_EPOCHS; epoch += 1) {
    const gradient = Array(weights.length).fill(0)

    for (let rowIndex = 0; rowIndex < xs.length; rowIndex += 1) {
      const x = xs[rowIndex]
      const y = ys[rowIndex]
      const sampleWeight = y === 1 ? positiveWeight : 1
      const error = (sigmoid(dot(weights, x)) - y) * sampleWeight

      for (let featureIndex = 0; featureIndex < weights.length; featureIndex += 1) {
        gradient[featureIndex] += error * x[featureIndex]
      }
    }

    for (let featureIndex = 1; featureIndex < weights.length; featureIndex += 1) {
      gradient[featureIndex] += DEFAULT_L2 * weights[featureIndex] * xs.length
    }

    for (let featureIndex = 0; featureIndex < weights.length; featureIndex += 1) {
      weights[featureIndex] -= DEFAULT_LEARNING_RATE * gradient[featureIndex] / xs.length
    }
  }

  return weights
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function dot(left: readonly number[], right: readonly number[]) {
  let result = 0

  for (let index = 0; index < left.length; index += 1) {
    result += left[index] * right[index]
  }

  return result
}

function sigmoid(value: number) {
  if (value <= -40) {
    return 0
  }

  if (value >= 40) {
    return 1
  }

  return 1 / (1 + Math.exp(-value))
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1
}

function timestampSlug(date: Date): string {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-")
}

function renderIndex(summary: FeatureFusionSummary): string {
  return `<!doctype html>
<meta charset="utf-8">
<title>Part Match Feature Fusion Score</title>
<style>
body { color: #172033; font: 14px/1.5 system-ui, sans-serif; margin: 24px; }
code { background: #f1f5f9; border-radius: 4px; padding: 2px 4px; }
</style>
<h1>Part Match Feature Fusion Score</h1>
<p>${summary.candidatePairs} candidate pairs · ${summary.positiveTrain} train positives · ${summary.negativeTrain} train negatives</p>
<p>Use <code>featureFusionProduct</code> with <code>lab:part-match-pair-lanes</code> for the current best conservative lane.</p>`
}

function readOption(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name)

  return index >= 0 ? argv[index + 1] ?? null : null
}

function readNumericOption(argv: readonly string[], name: string): number | null {
  const raw = readOption(argv, name)

  if (raw === null) {
    return null
  }

  const value = Number(raw)

  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`)
  }

  return value
}

async function runCli(): Promise<void> {
  const argv = process.argv.slice(2)
  const scoreDir = readOption(argv, "--score-dir")
  const manualTrainingDir = readOption(argv, "--manual-training-dir")

  if (!scoreDir || !manualTrainingDir) {
    throw new Error("Usage: part-match-feature-fusion-score --score-dir <dir> --manual-training-dir <dir> [--output-dir <dir>]")
  }

  const result = await runPartMatchFeatureFusionScore({
    candidateMinScore: readNumericOption(argv, "--candidate-min-score") ?? undefined,
    manualTrainingDir,
    outputDir: readOption(argv, "--output-dir") ?? undefined,
    scoreDir,
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
