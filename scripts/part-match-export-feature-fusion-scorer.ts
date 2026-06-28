import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  PART_PAIR_SCORER_CONFIG_VERSION,
  PART_PAIR_SCORE_FEATURE_NAMES,
  type PartPairScorerConfig,
} from "../packages/part-matching/src/index"

const DEFAULT_OUTPUT_ROOT = path.join(
  ".bag-it",
  "private",
  "part-match-reports",
  "embedding-experiments",
)
const DEFAULT_STRATEGY = "score-threshold"
const SCORE_WEIGHT_EPSILON = 1e-12
const VERSION = "0.1.0"

interface FeatureFusionModel {
  featureNames: string[]
  means: number[]
  stds: number[]
  weights: number[]
}

interface FeatureFusionSummary {
  generatedAt?: string
  model?: FeatureFusionModel
  options?: Record<string, unknown>
  version?: string
}

interface LaneConfig {
  margin: number
  mutualTop1: boolean
  rankLimit: number | null
  scoreFloor: number
}

interface LaneMetrics {
  acceptedPairs: number
  correctionBurden: number
  falseGroups: number
  falsePositivePairs: number
  groupedRows: number
  hardNegativeFalsePositivePairs: number
  matchedPositivePairs: number
  positivePairs: number
  recall: number
  wrongRowMemberships: number
}

interface LaneResult {
  config: LaneConfig
  train: LaneMetrics
  validation?: LaneMetrics | null
}

interface LaneStrategy {
  auto?: LaneResult | null
  name: string
  suggested?: LaneResult | null
}

interface LaneSummary {
  generatedAt?: string
  options?: Record<string, unknown>
  strategies?: LaneStrategy[]
  version?: string
}

export interface RunPartMatchExportFeatureFusionScorerOptions {
  featureFusionDir: string
  generatedAt?: Date
  laneSummaryDir: string
  outputDir?: string
  strategyName?: string
}

export interface RunPartMatchExportFeatureFusionScorerResult {
  autoConfigPath: string | null
  outputDir: string
  suggestedConfigPath: string | null
  summary: {
    autoConfigPath: string | null
    exportedLanes: string[]
    featureFusionDir: string
    generatedAt: string
    laneSummaryDir: string
    skippedScoreFeatures: string[]
    strategyName: string
    suggestedConfigPath: string | null
    version: string
  }
  summaryPath: string
}

export async function runPartMatchExportFeatureFusionScorer(
  options: RunPartMatchExportFeatureFusionScorerOptions,
): Promise<RunPartMatchExportFeatureFusionScorerResult> {
  const generatedAt = options.generatedAt ?? new Date()
  const outputDir = options.outputDir ?? path.join(
    DEFAULT_OUTPUT_ROOT,
    `${timestampSlug(generatedAt)}-feature-fusion-scorer-export`,
  )
  const strategyName = options.strategyName ?? DEFAULT_STRATEGY
  const fusion = await readJson<FeatureFusionSummary>(path.join(options.featureFusionDir, "summary.json"))
  const laneSummary = await readJson<LaneSummary>(path.join(options.laneSummaryDir, "summary.json"))
  const model = validateFusionModel(fusion)
  const strategy = (laneSummary.strategies ?? []).find((candidate) => candidate.name === strategyName)

  if (!strategy) {
    throw new Error(`Lane strategy not found: ${strategyName}`)
  }

  const converted = convertFeatureFusionModel(model)
  const exportedLanes: string[] = []
  let autoConfigPath: string | null = null
  let suggestedConfigPath: string | null = null

  await mkdir(outputDir, { recursive: true })

  if (strategy.auto) {
    const config = createLaneScorerConfig({
      converted,
      featureFusionDir: options.featureFusionDir,
      lane: "auto",
      laneResult: strategy.auto,
      laneSummaryDir: options.laneSummaryDir,
      strategyName,
    })

    autoConfigPath = path.join(outputDir, "auto-scorer-config.json")
    exportedLanes.push("auto")
    await writeJson(autoConfigPath, config)
  }

  if (strategy.suggested) {
    const config = createLaneScorerConfig({
      converted,
      featureFusionDir: options.featureFusionDir,
      lane: "suggested",
      laneResult: strategy.suggested,
      laneSummaryDir: options.laneSummaryDir,
      strategyName,
    })

    suggestedConfigPath = path.join(outputDir, "suggested-scorer-config.json")
    exportedLanes.push("suggested")
    await writeJson(suggestedConfigPath, config)
  }

  if (exportedLanes.length === 0) {
    throw new Error(`Lane strategy has no exportable lanes: ${strategyName}`)
  }

  const summary = {
    autoConfigPath,
    exportedLanes,
    featureFusionDir: options.featureFusionDir,
    generatedAt: generatedAt.toISOString(),
    laneSummaryDir: options.laneSummaryDir,
    skippedScoreFeatures: converted.skippedScoreFeatures,
    strategyName,
    suggestedConfigPath,
    version: VERSION,
  }
  const summaryPath = path.join(outputDir, "summary.json")

  await writeJson(summaryPath, summary)
  await writeFile(path.join(outputDir, "index.html"), renderIndex(summary))

  return {
    autoConfigPath,
    outputDir,
    suggestedConfigPath,
    summary,
    summaryPath,
  }
}

interface ConvertedFeatureFusionModel {
  featureNames: string[]
  intercept: number
  normalization: PartPairScorerConfig["normalization"]
  skippedScoreFeatures: string[]
  weights: Record<string, number>
}

export function convertFeatureFusionModel(model: FeatureFusionModel): ConvertedFeatureFusionModel {
  if (model.weights.length !== model.featureNames.length + 1) {
    throw new Error("Feature fusion model weight count must equal feature count plus intercept.")
  }

  if (model.means.length !== model.featureNames.length || model.stds.length !== model.featureNames.length) {
    throw new Error("Feature fusion model scaler length must match feature count.")
  }

  const validFeatureNames = new Set<string>(PART_PAIR_SCORE_FEATURE_NAMES)
  const featureNames: string[] = []
  const normalization: PartPairScorerConfig["normalization"] = {}
  const skippedScoreFeatures: string[] = []
  const weights: Record<string, number> = {}

  for (let index = 0; index < model.featureNames.length; index += 1) {
    const sourceFeatureName = model.featureNames[index]
    const weight = model.weights[index + 1] ?? 0

    if (Math.abs(weight) <= SCORE_WEIGHT_EPSILON) {
      if (sourceFeatureName.startsWith("score:")) {
        skippedScoreFeatures.push(sourceFeatureName)
      }

      continue
    }

    const featureName = mapFeatureFusionFeatureName(sourceFeatureName)

    if (!featureName) {
      throw new Error(`Cannot export nonzero runtime-only feature: ${sourceFeatureName}`)
    }

    if (!validFeatureNames.has(featureName)) {
      throw new Error(`Feature fusion model uses unsupported part-pair feature: ${sourceFeatureName}`)
    }

    featureNames.push(featureName)
    weights[featureName] = weight
    normalization[featureName] = {
      mean: finite(model.means[index], `${sourceFeatureName} mean`),
      std: Math.max(finite(model.stds[index], `${sourceFeatureName} std`), 1e-6),
    }
  }

  return {
    featureNames,
    intercept: finite(model.weights[0], "intercept"),
    normalization,
    skippedScoreFeatures,
    weights,
  }
}

function mapFeatureFusionFeatureName(sourceFeatureName: string): string | null {
  if (sourceFeatureName.startsWith("score:")) {
    return null
  }

  if (!sourceFeatureName.startsWith("struct:")) {
    throw new Error(`Unknown feature fusion feature namespace: ${sourceFeatureName}`)
  }

  const structuralName = sourceFeatureName.slice("struct:".length)

  if (structuralName === "matched") {
    return "baseMatched"
  }

  if (structuralName === "probability") {
    return "baseProbability"
  }

  return structuralName
}

function createLaneScorerConfig({
  converted,
  featureFusionDir,
  lane,
  laneResult,
  laneSummaryDir,
  strategyName,
}: {
  converted: ConvertedFeatureFusionModel
  featureFusionDir: string
  lane: "auto" | "suggested"
  laneResult: LaneResult
  laneSummaryDir: string
  strategyName: string
}): PartPairScorerConfig {
  return {
    evidenceRules: [{
      conditions: [{
        featureName: "nearConfidence",
        operator: "gt",
        threshold: -1,
      }],
    }],
    featureNames: converted.featureNames,
    intercept: converted.intercept,
    kind: "linear",
    metadata: {
      correctionBurden: laneResult.train.correctionBurden,
      exportedFrom: "part-match-feature-fusion",
      falseGroups: laneResult.train.falseGroups,
      falsePositivePairs: laneResult.train.falsePositivePairs,
      featureFusionDir,
      groupedRows: laneResult.train.groupedRows,
      hardNegativeFalsePositivePairs: laneResult.train.hardNegativeFalsePositivePairs,
      lane,
      laneConfig: laneResult.config,
      laneSummaryDir,
      matchedPositivePairs: laneResult.train.matchedPositivePairs,
      positivePairs: laneResult.train.positivePairs,
      recall: laneResult.train.recall,
      skippedScoreFeatures: converted.skippedScoreFeatures,
      strategyName,
      trustedColorGateRequired: true,
      wrongRowMemberships: laneResult.train.wrongRowMemberships,
    },
    normalization: converted.normalization,
    threshold: laneResult.config.scoreFloor,
    version: PART_PAIR_SCORER_CONFIG_VERSION,
    weights: converted.weights,
  }
}

function validateFusionModel(summary: FeatureFusionSummary): FeatureFusionModel {
  const model = summary.model

  if (!model) {
    throw new Error("Feature fusion summary is missing model.")
  }

  if (!Array.isArray(model.featureNames) || !Array.isArray(model.means) ||
    !Array.isArray(model.stds) || !Array.isArray(model.weights)) {
    throw new Error("Feature fusion model has invalid shape.")
  }

  return model
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`)
  }

  return value
}

function timestampSlug(date: Date): string {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-")
}

function renderIndex(summary: RunPartMatchExportFeatureFusionScorerResult["summary"]): string {
  return `<!doctype html>
<meta charset="utf-8">
<title>Part Match Feature Fusion Scorer Export</title>
<style>
body { color: #172033; font: 14px/1.5 system-ui, sans-serif; margin: 24px; }
code { background: #f1f5f9; border-radius: 4px; padding: 2px 4px; }
</style>
<h1>Part Match Feature Fusion Scorer Export</h1>
<p>${summary.exportedLanes.join(", ")} lanes exported for <code>${escapeHtml(summary.strategyName)}</code>.</p>
<p>Auto config: <code>${escapeHtml(summary.autoConfigPath ?? "not exported")}</code></p>
<p>Suggested config: <code>${escapeHtml(summary.suggestedConfigPath ?? "not exported")}</code></p>`
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
  const featureFusionDir = readOption(argv, "--feature-fusion-dir")
  const laneSummaryDir = readOption(argv, "--lane-summary-dir")

  if (!featureFusionDir || !laneSummaryDir) {
    throw new Error("Usage: part-match-export-feature-fusion-scorer --feature-fusion-dir <dir> --lane-summary-dir <dir> [--strategy <name>] [--output-dir <dir>]")
  }

  const result = await runPartMatchExportFeatureFusionScorer({
    featureFusionDir,
    laneSummaryDir,
    outputDir: readOption(argv, "--output-dir") ?? undefined,
    strategyName: readOption(argv, "--strategy") ?? undefined,
  })

  console.log(JSON.stringify(result.summary, null, 2))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
