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
  type PartPairScoreFeatures,
  type PartVisualFeatures,
} from "../packages/part-matching/src/index"
import { loadPartMatchScorerEvalData } from "./train-part-match-scorer"

const DEFAULT_OUTPUT_ROOT = path.join(
  ".bag-it",
  "private",
  "part-match-reports",
  "embedding-experiments",
)
const DEFAULT_CANDIDATE_MIN_SCORE = 0.7
const VERSION = "0.1.0"

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
  split?: string | null
  target?: number | null
}

interface FeatureEntry {
  features: PartVisualFeatures
  itemId: string
  manualId: string
}

interface HybridPair {
  kind: string
  leftExampleId: string
  leftItemId: string
  manualId: string
  rightExampleId: string
  rightItemId: string
  score: number
  scores: Record<string, number>
  split: "train" | "validation"
  target: 0 | 1
}

interface HybridSummary {
  generatedAt: string
  options: {
    candidateMinScore: number
    defaultScoreMode: string
    labelDir: string | null
    manualTrainingDir: string
    outputDir: string
    scoreDir: string
    sourceDir: string | null
  }
  pairs: {
    scored: number
    skipped: Record<string, number>
    total: number
  }
  scoreModes: string[]
  version: string
}

export interface RunPartMatchHybridScoreOptions {
  candidateMinScore?: number
  defaultScoreMode?: string
  generatedAt?: Date
  labelDir?: string
  manualTrainingDir: string
  outputDir?: string
  scoreDir: string
  sourceDir?: string
}

export interface RunPartMatchHybridScoreResult {
  outputDir: string
  pairsPath: string
  summary: HybridSummary
  summaryPath: string
}

export async function runPartMatchHybridScore(
  options: RunPartMatchHybridScoreOptions,
): Promise<RunPartMatchHybridScoreResult> {
  const generatedAt = options.generatedAt ?? new Date()
  const outputDir = options.outputDir ?? path.join(DEFAULT_OUTPUT_ROOT, `${timestampSlug(generatedAt)}-hybrid-score`)
  const candidateMinScore = options.candidateMinScore ?? DEFAULT_CANDIDATE_MIN_SCORE
  const defaultScoreMode = options.defaultScoreMode ?? "cnnStructuralMin"
  const examples = await readManualTrainingExamples(options.manualTrainingDir)
  const featureEntries = await readFeatureEntries({
    examples,
    labelDir: options.labelDir,
    sourceDir: options.sourceDir,
  })
  const scoredPairs = await readScoredPairs(options.scoreDir)
  const skipped: Record<string, number> = {}
  const hybridPairs: HybridPair[] = []

  for (const scoredPair of scoredPairs) {
    const normalized = normalizeScoredPair(scoredPair)

    if (!normalized) {
      increment(skipped, "invalid-pair")
      continue
    }

    const left = featureEntries.get(normalized.leftExampleId)
    const right = featureEntries.get(normalized.rightExampleId)

    if (!left || !right) {
      increment(skipped, "missing-features")
      continue
    }

    const scores = normalized.score >= candidateMinScore
      ? createHybridScores({
        cnnScore: normalized.score,
        ...scoreStructuralPair(left.features, right.features),
      })
      : createLowCandidateScores(normalized.score)
    const defaultScore = scores[defaultScoreMode]

    if (!Number.isFinite(defaultScore)) {
      increment(skipped, "missing-default-score")
      continue
    }

    hybridPairs.push({
      kind: normalized.kind,
      leftExampleId: normalized.leftExampleId,
      leftItemId: left.itemId,
      manualId: left.manualId,
      rightExampleId: normalized.rightExampleId,
      rightItemId: right.itemId,
      score: defaultScore,
      scores,
      split: normalized.split,
      target: normalized.target,
    })
  }

  if (hybridPairs.length === 0) {
    throw new Error("Hybrid scorer produced zero pairs.")
  }

  const scoreModes = Object.keys(hybridPairs[0]?.scores ?? {}).sort()
  const summary: HybridSummary = {
    generatedAt: generatedAt.toISOString(),
    options: {
      candidateMinScore,
      defaultScoreMode,
      labelDir: options.labelDir ?? null,
      manualTrainingDir: options.manualTrainingDir,
      outputDir,
      scoreDir: options.scoreDir,
      sourceDir: options.sourceDir ?? null,
    },
    pairs: {
      scored: hybridPairs.length,
      skipped,
      total: scoredPairs.length,
    },
    scoreModes,
    version: VERSION,
  }
  const pairsPath = path.join(outputDir, "pairs.json")
  const summaryPath = path.join(outputDir, "summary.json")

  await mkdir(outputDir, { recursive: true })
  await writeFile(pairsPath, `${JSON.stringify(hybridPairs, null, 2)}\n`)
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)
  await writeFile(path.join(outputDir, "index.html"), renderIndex(summary))

  return {
    outputDir,
    pairsPath,
    summary,
    summaryPath,
  }
}

export function createHybridScores({
  cnnScore,
  structuralFeatures,
  structuralMatched,
  structuralProbability,
}: {
  cnnScore: number
  structuralFeatures: PartPairScoreFeatures
  structuralMatched: boolean
  structuralProbability: number
}): Record<string, number> {
  const nearConfidence = structuralFeatures.nearConfidence
  const alphaCorrelation = structuralFeatures.alphaCorrelation
  const lumaCorrelation = structuralFeatures.lumaCorrelation
  const structuralGate = structuralMatched ? 1 : 0

  return {
    cnn: cnnScore,
    cnnAlphaProduct: cnnScore * clamp01(alphaCorrelation),
    cnnIfStructuralMatch: structuralGate * cnnScore,
    cnnLumaProduct: cnnScore * clamp01(lumaCorrelation),
    cnnNearMin: Math.min(cnnScore, nearConfidence),
    cnnNearProduct: cnnScore * nearConfidence,
    cnnStructuralMin: Math.min(cnnScore, structuralProbability),
    cnnStructuralProduct: cnnScore * structuralProbability,
    structural: structuralProbability,
  }
}

function scoreStructuralPair(
  left: PartVisualFeatures,
  right: PartVisualFeatures,
): {
  structuralFeatures: PartPairScoreFeatures
  structuralMatched: boolean
  structuralProbability: number
} {
  const structural = scorePartPair(
    left,
    right,
    DEFAULT_PART_PAIR_SCORER_CONFIG,
  )

  return {
    structuralFeatures: structural.features,
    structuralMatched: structural.matched,
    structuralProbability: structural.probability,
  }
}

function createLowCandidateScores(cnnScore: number): Record<string, number> {
  return {
    cnn: cnnScore,
    cnnAlphaProduct: 0,
    cnnIfStructuralMatch: 0,
    cnnLumaProduct: 0,
    cnnNearMin: 0,
    cnnNearProduct: 0,
    cnnStructuralMin: 0,
    cnnStructuralProduct: 0,
    structural: 0,
  }
}

async function readManualTrainingExamples(root: string): Promise<ManualTrainingExample[]> {
  const parsed = JSON.parse(await readFile(path.join(root, "examples.json"), "utf8")) as {
    examples?: ManualTrainingExample[]
  }

  return parsed.examples ?? []
}

async function readFeatureEntries({
  examples,
  labelDir,
  sourceDir,
}: {
  examples: readonly ManualTrainingExample[]
  labelDir?: string
  sourceDir?: string
}): Promise<Map<string, FeatureEntry>> {
  const manualIds = [...new Set(examples.map((example) => example.manualId))].sort()
  const evalData = await loadPartMatchScorerEvalData({
    includeDerivedPairs: false,
    labelDir,
    manualIds,
    sourceDir,
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

function normalizeScoredPair(pair: ScoredPairInput): {
  kind: string
  leftExampleId: string
  rightExampleId: string
  score: number
  split: "train" | "validation"
  target: 0 | 1
} | null {
  const leftExampleId = pair.leftExampleId ?? null
  const rightExampleId = pair.rightExampleId ?? null
  const score = pair.score
  const target = pair.target === 1 ? 1 : pair.target === 0 ? 0 : null

  if (!leftExampleId || !rightExampleId || !Number.isFinite(score) || target === null) {
    return null
  }

  return {
    kind: pair.kind ?? "hybrid-pair",
    leftExampleId,
    rightExampleId,
    score: score as number,
    split: pair.split === "train" ? "train" : "validation",
    target,
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(1, value))
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1
}

function timestampSlug(date: Date): string {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-")
}

function renderIndex(summary: HybridSummary): string {
  const scoreModeRows = summary.scoreModes.map((scoreMode) => `
    <tr>
      <td>${escapeHtml(scoreMode)}</td>
      <td><code>npm run lab:part-match-pair-lanes -- --score-dir ${escapeHtml(summary.options.outputDir)} --score-mode ${escapeHtml(scoreMode)}</code></td>
    </tr>`).join("")

  return `<!doctype html>
<meta charset="utf-8">
<title>Part Match Hybrid Score</title>
<style>
body { color: #172033; font: 14px/1.5 system-ui, sans-serif; margin: 24px; }
code { background: #f1f5f9; border-radius: 4px; padding: 2px 4px; }
table { border-collapse: collapse; width: 100%; }
td, th { border-bottom: 1px solid #d8dee9; padding: 8px; text-align: left; vertical-align: top; }
</style>
<h1>Part Match Hybrid Score</h1>
<p>${summary.pairs.scored}/${summary.pairs.total} scored pairs · skipped ${escapeHtml(JSON.stringify(summary.pairs.skipped))}</p>
<table>
  <thead><tr><th>Score mode</th><th>Lane analysis command</th></tr></thead>
  <tbody>${scoreModeRows}</tbody>
</table>`
}

function escapeHtml(value: unknown): string {
  return `${value}`
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
  const scoreDir = readOption(argv, "--score-dir")
  const manualTrainingDir = readOption(argv, "--manual-training-dir")

  if (!scoreDir || !manualTrainingDir) {
    throw new Error("Usage: part-match-hybrid-score --score-dir <dir> --manual-training-dir <dir> [--output-dir <dir>]")
  }

  const result = await runPartMatchHybridScore({
    candidateMinScore: readNumericOption(argv, "--candidate-min-score") ?? undefined,
    defaultScoreMode: readOption(argv, "--default-score-mode") ?? undefined,
    labelDir: readOption(argv, "--label-dir") ?? undefined,
    manualTrainingDir,
    outputDir: readOption(argv, "--output-dir") ?? undefined,
    scoreDir,
    sourceDir: readOption(argv, "--source-dir") ?? undefined,
  })

  console.log(JSON.stringify({
    outputDir: result.outputDir,
    pairsPath: result.pairsPath,
    scoredPairs: result.summary.pairs.scored,
    scoreModes: result.summary.scoreModes,
    summaryPath: result.summaryPath,
  }, null, 2))
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
