import { existsSync } from "node:fs"
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type {
  PartMatchEmbeddingRecord,
  PartMatchEmbeddingRow,
  PartMatchEmbeddingVariantName,
} from "./part-match-embedding-cache"

const DEFAULT_OUTPUT_ROOT = path.join(
  ".bag-it",
  "private",
  "part-match-reports",
  "embedding-experiments",
)
const RERANKER_VERSION = "0.1.1"
const THRESHOLD_EPSILON = 0.000001
const DEFAULT_FOLDS = 5
const DEFAULT_ITERATIONS = 800
const DEFAULT_LEARNING_RATE = 0.05
const DEFAULT_L2 = 0.001
const DEFAULT_MAX_NEGATIVES_PER_POSITIVE = 20
const DIAGNOSTIC_LIMIT = 120
const VARIANT_NAMES: readonly PartMatchEmbeddingVariantName[] = [
  "rendered",
  "tight-rendered",
  "neutral-mask",
  "silhouette",
]
const FEATURE_NAMES = [
  "rendered",
  "tightRendered",
  "neutralMask",
  "silhouette",
  "mean",
  "min",
  "max",
  "renderedTightMin",
  "allVariantsMin",
  "spread",
  "renderedMinusTight",
  "renderedMinusSilhouette",
  "neutralMinusSilhouette",
  "tightAspectDelta",
  "tightAreaRatio",
  "tightWidthRatio",
  "tightHeightRatio",
] as const

type LegoRerankerFeatureName = (typeof FEATURE_NAMES)[number]
type PairViewPolicy = "any-view" | "same-view"

interface EmbeddingRowsFile {
  rows?: PartMatchEmbeddingRow[]
}

interface EmbeddingCacheFile {
  embeddings?: Record<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>>
  model?: {
    id?: string
    task?: string
  }
}

interface LabelFile {
  labels?: Array<{
    expectedPartKey?: string
    itemId?: string
    role?: string
  }>
  manualId?: string
  status?: string
}

interface LegoRerankerInput {
  embeddings: Map<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>>
  labelsByItemKey: Map<string, string>
  modelIds: string[]
  rows: PartMatchEmbeddingRow[]
}

export interface LegoRerankerPair {
  features: Record<LegoRerankerFeatureName, number>
  leftItemId: string
  leftPartId: string
  leftRowKey: string
  leftView: string | null
  manualId: string
  rightItemId: string
  rightPartId: string
  rightRowKey: string
  rightView: string | null
  target: 0 | 1
}

interface ScoredLegoRerankerPair extends LegoRerankerPair {
  score: number
}

interface LegoRerankerModel {
  bias: number
  featureNames: LegoRerankerFeatureName[]
  means: Record<LegoRerankerFeatureName, number>
  model: "linear-logistic"
  stdDevs: Record<LegoRerankerFeatureName, number>
  threshold: number
  version: string
  weights: Record<LegoRerankerFeatureName, number>
}

interface RerankerTotals {
  falsePositivePairs: number
  matchedPositivePairs: number
  missedPositivePairs: number
  negativePairs: number
  positivePairs: number
  recall: number
  scoredPairs: number
}

interface RerankerFoldScore {
  fold: number
  holdoutPartIds: string[]
  threshold: number
  totals: RerankerTotals
}

interface RerankerTrainingSummary {
  diagnostics: RerankerDiagnostics
  durationMs: number
  foldScore: {
    folds: RerankerFoldScore[]
    totals: RerankerTotals
  }
  generatedAt: string
  globalScore: {
    threshold: number
    totals: RerankerTotals
  }
  modelIds: string[]
  options: {
    embeddingDirs: string[]
    foldCount: number
    iterations: number
    l2: number
    labelDir: string
    learningRate: number
    maxNegativesPerPositive: number
    outputDir: string
    pairViewPolicy: PairViewPolicy
  }
  partCount: number
  pairCount: number
  trainingPairs: {
    global: number
    positives: number
    negatives: number
  }
  verdict: {
    reason: string
    status: "promising" | "blocked" | "inconclusive"
  }
  version: string
}

interface RerankerDiagnostics {
  blockingNegativePairs: number
  exactDuplicateNegativePairs: number
  negativeScoreMax: number
  positiveScoreMax: number
}

export interface TrainPartMatchLegoRerankerOptions {
  embeddingDirs: string[]
  foldCount?: number
  generatedAt?: Date
  iterations?: number
  l2?: number
  labelDir: string
  learningRate?: number
  maxNegativesPerPositive?: number
  outputDir?: string
  pairViewPolicy?: PairViewPolicy
}

export interface TrainPartMatchLegoRerankerResult {
  indexPath: string
  modelPath: string
  outputDir: string
  pairsPath: string
  summary: RerankerTrainingSummary
  summaryPath: string
}

export async function trainPartMatchLegoReranker(
  options: TrainPartMatchLegoRerankerOptions,
): Promise<TrainPartMatchLegoRerankerResult> {
  if (options.embeddingDirs.length === 0) {
    throw new Error("At least one embedding cache directory is required.")
  }

  const startedAt = Date.now()
  const generatedAt = options.generatedAt ?? new Date()
  const outputDir = options.outputDir ?? path.join(DEFAULT_OUTPUT_ROOT, `${timestampForPath(generatedAt)}-lego-reranker`)
  const foldCount = options.foldCount ?? DEFAULT_FOLDS
  const iterations = options.iterations ?? DEFAULT_ITERATIONS
  const learningRate = options.learningRate ?? DEFAULT_LEARNING_RATE
  const l2 = options.l2 ?? DEFAULT_L2
  const maxNegativesPerPositive = options.maxNegativesPerPositive ?? DEFAULT_MAX_NEGATIVES_PER_POSITIVE
  const pairViewPolicy = options.pairViewPolicy ?? "any-view"
  const input = await readRerankerInput(options.embeddingDirs, options.labelDir)
  const pairs = buildLegoRerankerPairs(input, { pairViewPolicy })
  const positivePairs = pairs.filter((pair) => pair.target === 1)
  const negativePairs = pairs.filter((pair) => pair.target === 0)

  if (positivePairs.length === 0 || negativePairs.length === 0) {
    throw new Error("LEGO reranker needs both positive and negative pairs.")
  }

  const globalTrainingPairs = selectTrainingPairs(pairs, maxNegativesPerPositive)
  const globalModel = trainLinearModel(globalTrainingPairs, { iterations, l2, learningRate })
  const threshold = chooseZeroFalsePositiveThreshold(scorePairs(negativePairs, globalModel))
  const model = {
    ...globalModel,
    threshold,
  }
  const globalScore = summarizePairs(scorePairs(pairs, model), threshold)
  const foldScore = evaluatePartFolds(pairs, {
    foldCount,
    iterations,
    l2,
    learningRate,
    maxNegativesPerPositive,
  })
  const scoredPairs = scorePairs(pairs, model)
  const summary: RerankerTrainingSummary = {
    diagnostics: createRerankerDiagnostics(scoredPairs),
    durationMs: Date.now() - startedAt,
    foldScore,
    generatedAt: generatedAt.toISOString(),
    globalScore: {
      threshold,
      totals: globalScore,
    },
    modelIds: input.modelIds,
    options: {
      embeddingDirs: options.embeddingDirs.map(normalizeWorkspacePath),
      foldCount,
      iterations,
      l2,
      labelDir: normalizeWorkspacePath(options.labelDir),
      learningRate,
      maxNegativesPerPositive,
      outputDir: normalizeWorkspacePath(outputDir),
      pairViewPolicy,
    },
    partCount: countPartIds(pairs),
    pairCount: pairs.length,
    trainingPairs: {
      global: globalTrainingPairs.length,
      negatives: globalTrainingPairs.filter((pair) => pair.target === 0).length,
      positives: globalTrainingPairs.filter((pair) => pair.target === 1).length,
    },
    verdict: createRerankerVerdict(globalScore, foldScore.totals),
    version: RERANKER_VERSION,
  }

  await mkdir(outputDir, { recursive: true })

  const summaryPath = path.join(outputDir, "summary.json")
  const modelPath = path.join(outputDir, "model.json")
  const pairsPath = path.join(outputDir, "pairs.json")
  const indexPath = path.join(outputDir, "index.html")

  await writeJson(summaryPath, summary)
  await writeJson(modelPath, model)
  await writeJson(pairsPath, {
    generatedAt: generatedAt.toISOString(),
    pairs: scoredPairs,
    version: RERANKER_VERSION,
  })
  await writeFile(indexPath, renderRerankerIndex(summary, scoredPairs))

  return {
    indexPath,
    modelPath,
    outputDir,
    pairsPath,
    summary,
    summaryPath,
  }
}

function createRerankerDiagnostics(
  scoredPairs: readonly ScoredLegoRerankerPair[],
): RerankerDiagnostics {
  const positiveScores = scoredPairs
    .filter((pair) => pair.target === 1)
    .map((pair) => pair.score)
  const negativeScores = scoredPairs
    .filter((pair) => pair.target === 0)
    .map((pair) => pair.score)
  const positiveScoreMax = maxNumber(positiveScores)
  const negativeScoreMax = maxNumber(negativeScores)

  return {
    blockingNegativePairs: scoredPairs.filter((pair) => pair.target === 0 && pair.score >= positiveScoreMax).length,
    exactDuplicateNegativePairs: scoredPairs.filter((pair) => pair.target === 0 && isExactDuplicateFeaturePair(pair)).length,
    negativeScoreMax,
    positiveScoreMax,
  }
}

function isExactDuplicateFeaturePair(pair: LegoRerankerPair): boolean {
  return [
    pair.features.rendered,
    pair.features.tightRendered,
    pair.features.neutralMask,
    pair.features.silhouette,
    pair.features.tightAreaRatio,
    pair.features.tightWidthRatio,
    pair.features.tightHeightRatio,
  ].every((value) => Math.abs(value - 1) <= 0.000000001) &&
    pair.features.tightAspectDelta <= 0.000000001
}

export function buildLegoRerankerPairs(
  input: LegoRerankerInput,
  options: { pairViewPolicy?: PairViewPolicy } = {},
): LegoRerankerPair[] {
  const pairViewPolicy = options.pairViewPolicy ?? "any-view"
  const rows = input.rows
    .map((row) => ({
      partId: input.labelsByItemKey.get(createItemKey(row.manualId, row.itemId)),
      row,
      view: readCatalogueView(row.itemId),
    }))
    .filter((entry): entry is { partId: string; row: PartMatchEmbeddingRow; view: string | null } => Boolean(entry.partId))
  const pairs: LegoRerankerPair[] = []

  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    const left = rows[leftIndex]

    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
      const right = rows[rightIndex]

      if (!left || !right || left.row.manualId !== right.row.manualId) {
        continue
      }

      if (pairViewPolicy === "same-view" && (!left.view || !right.view || left.view !== right.view)) {
        continue
      }

      const features = createPairFeatures(left.row, right.row, input.embeddings)

      if (!features) {
        continue
      }

      pairs.push({
        features,
        leftItemId: left.row.itemId,
        leftPartId: left.partId,
        leftRowKey: left.row.rowKey,
        leftView: left.view,
        manualId: left.row.manualId,
        rightItemId: right.row.itemId,
        rightPartId: right.partId,
        rightRowKey: right.row.rowKey,
        rightView: right.view,
        target: left.partId === right.partId ? 1 : 0,
      })
    }
  }

  return pairs
}

function readCatalogueView(itemId: string): string | null {
  const parts = itemId.split(":")

  if (parts.length < 3) {
    return null
  }

  return parts[1] || null
}

export function selectTrainingPairs(
  pairs: readonly LegoRerankerPair[],
  maxNegativesPerPositive: number,
): LegoRerankerPair[] {
  const positives = pairs.filter((pair) => pair.target === 1)
  const negatives = pairs
    .filter((pair) => pair.target === 0)
    .sort((left, right) => right.features.mean - left.features.mean)
  const negativeLimit = maxNegativesPerPositive <= 0
    ? negatives.length
    : Math.min(negatives.length, positives.length * maxNegativesPerPositive)

  return [
    ...positives,
    ...negatives.slice(0, negativeLimit),
  ]
}

function readRerankerInput(
  embeddingDirs: readonly string[],
  labelDir: string,
): Promise<LegoRerankerInput> {
  return Promise.all([
    readEmbeddingInputs(embeddingDirs),
    readLabels(labelDir),
  ]).then(([embeddingInput, labelsByItemKey]) => ({
    ...embeddingInput,
    labelsByItemKey,
  }))
}

async function readEmbeddingInputs(embeddingDirs: readonly string[]): Promise<{
  embeddings: Map<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>>
  modelIds: string[]
  rows: PartMatchEmbeddingRow[]
}> {
  const rows: PartMatchEmbeddingRow[] = []
  const embeddings = new Map<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>>()
  const modelIds = new Set<string>()

  for (const embeddingDir of embeddingDirs) {
    const rowsPath = path.join(embeddingDir, "rows.json")
    const embeddingsPath = path.join(embeddingDir, "embeddings.json")

    if (!existsSync(rowsPath) || !existsSync(embeddingsPath)) {
      throw new Error(`Missing embedding cache files in ${embeddingDir}.`)
    }

    const rowsFile = JSON.parse(await readFile(rowsPath, "utf8")) as EmbeddingRowsFile
    const embeddingsFile = JSON.parse(await readFile(embeddingsPath, "utf8")) as EmbeddingCacheFile

    if (embeddingsFile.model?.id) {
      modelIds.add(embeddingsFile.model.id)
    }

    for (const row of rowsFile.rows ?? []) {
      rows.push(row)
    }

    for (const [rowKey, rowEmbeddings] of Object.entries(embeddingsFile.embeddings ?? {})) {
      embeddings.set(rowKey, rowEmbeddings)
    }
  }

  return {
    embeddings,
    modelIds: [...modelIds].sort(),
    rows,
  }
}

async function readLabels(labelDir: string): Promise<Map<string, string>> {
  const labelsByItemKey = new Map<string, string>()

  if (!existsSync(labelDir)) {
    throw new Error(`Label directory not found: ${labelDir}`)
  }

  for (const labelPath of await readJsonFilePaths(labelDir)) {
    const parsed = JSON.parse(await readFile(labelPath, "utf8")) as LabelFile

    if (!parsed.manualId || !Array.isArray(parsed.labels)) {
      continue
    }

    for (const label of parsed.labels) {
      if (!label.itemId || !label.expectedPartKey || label.role === "excluded") {
        continue
      }

      labelsByItemKey.set(createItemKey(parsed.manualId, label.itemId), label.expectedPartKey)
    }
  }

  return labelsByItemKey
}

async function readJsonFilePaths(root: string): Promise<string[]> {
  const entries = await readdir(root)
  const paths = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry)
    const entryStat = await stat(entryPath)

    if (entryStat.isDirectory()) {
      return readJsonFilePaths(entryPath)
    }

    return entry.endsWith(".json") ? [entryPath] : []
  }))

  return paths.flat().sort()
}

function createPairFeatures(
  left: PartMatchEmbeddingRow,
  right: PartMatchEmbeddingRow,
  embeddings: ReadonlyMap<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>>,
): Record<LegoRerankerFeatureName, number> | null {
  const leftEmbeddings = embeddings.get(left.rowKey)
  const rightEmbeddings = embeddings.get(right.rowKey)

  if (!leftEmbeddings || !rightEmbeddings) {
    return null
  }

  const variantScores = new Map<PartMatchEmbeddingVariantName, number>()

  for (const variantName of VARIANT_NAMES) {
    const leftVector = leftEmbeddings[variantName]?.vector
    const rightVector = rightEmbeddings[variantName]?.vector

    if (!leftVector || !rightVector || leftVector.length !== rightVector.length) {
      return null
    }

    variantScores.set(variantName, dotProduct(leftVector, rightVector))
  }

  const rendered = readVariantScore(variantScores, "rendered")
  const tightRendered = readVariantScore(variantScores, "tight-rendered")
  const neutralMask = readVariantScore(variantScores, "neutral-mask")
  const silhouette = readVariantScore(variantScores, "silhouette")
  const scores = [rendered, tightRendered, neutralMask, silhouette]
  const max = Math.max(...scores)
  const min = Math.min(...scores)
  const geometry = createTightGeometryFeatures(left, right)

  return {
    allVariantsMin: min,
    max,
    mean: scores.reduce((total, score) => total + score, 0) / scores.length,
    min,
    neutralMask,
    neutralMinusSilhouette: neutralMask - silhouette,
    rendered,
    renderedMinusSilhouette: rendered - silhouette,
    renderedMinusTight: rendered - tightRendered,
    renderedTightMin: Math.min(rendered, tightRendered),
    silhouette,
    spread: max - min,
    tightAreaRatio: geometry.areaRatio,
    tightAspectDelta: geometry.aspectDelta,
    tightHeightRatio: geometry.heightRatio,
    tightRendered,
    tightWidthRatio: geometry.widthRatio,
  }
}

function createTightGeometryFeatures(
  left: PartMatchEmbeddingRow,
  right: PartMatchEmbeddingRow,
): {
  areaRatio: number
  aspectDelta: number
  heightRatio: number
  widthRatio: number
} {
  const leftTight = left.variants["tight-rendered"]
  const rightTight = right.variants["tight-rendered"]

  if (!leftTight || !rightTight) {
    return {
      areaRatio: 0,
      aspectDelta: Number.POSITIVE_INFINITY,
      heightRatio: 0,
      widthRatio: 0,
    }
  }

  const leftArea = leftTight.width * leftTight.height
  const rightArea = rightTight.width * rightTight.height
  const leftAspect = leftTight.width / Math.max(1, leftTight.height)
  const rightAspect = rightTight.width / Math.max(1, rightTight.height)

  return {
    areaRatio: ratio(leftArea, rightArea),
    aspectDelta: Math.abs(Math.log(leftAspect / rightAspect)),
    heightRatio: ratio(leftTight.height, rightTight.height),
    widthRatio: ratio(leftTight.width, rightTight.width),
  }
}

function ratio(left: number, right: number): number {
  const high = Math.max(left, right)

  if (high <= 0) {
    return 0
  }

  return Math.min(left, right) / high
}

function maxNumber(values: readonly number[]): number {
  let max = Number.NEGATIVE_INFINITY

  for (const value of values) {
    max = Math.max(max, value)
  }

  return max
}

function readVariantScore(
  scores: ReadonlyMap<PartMatchEmbeddingVariantName, number>,
  variant: PartMatchEmbeddingVariantName,
): number {
  const score = scores.get(variant)

  if (typeof score !== "number") {
    throw new Error(`Missing required variant score ${variant}.`)
  }

  return score
}

function trainLinearModel(
  pairs: readonly LegoRerankerPair[],
  options: {
    iterations: number
    l2: number
    learningRate: number
  },
): Omit<LegoRerankerModel, "threshold"> {
  const featureNames = [...FEATURE_NAMES]
  const means = createFeatureMeans(pairs, featureNames)
  const stdDevs = createFeatureStdDevs(pairs, featureNames, means)
  const weights = Object.fromEntries(featureNames.map((featureName) => [featureName, 0])) as Record<LegoRerankerFeatureName, number>
  let bias = 0
  const positiveCount = pairs.filter((pair) => pair.target === 1).length
  const negativeCount = pairs.length - positiveCount
  const positiveWeight = pairs.length / Math.max(1, positiveCount * 2)
  const negativeWeight = pairs.length / Math.max(1, negativeCount * 2)

  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    let biasGradient = 0
    const gradients = Object.fromEntries(featureNames.map((featureName) => [featureName, 0])) as Record<LegoRerankerFeatureName, number>

    for (const pair of pairs) {
      const prediction = sigmoid(scoreNormalizedFeatures(pair.features, {
        bias,
        featureNames,
        means,
        model: "linear-logistic",
        stdDevs,
        version: RERANKER_VERSION,
        weights,
      }))
      const classWeight = pair.target === 1 ? positiveWeight : negativeWeight
      const error = (prediction - pair.target) * classWeight

      biasGradient += error

      for (const featureName of featureNames) {
        gradients[featureName] += error * normalizeFeature(pair.features[featureName], means[featureName], stdDevs[featureName])
      }
    }

    bias -= options.learningRate * biasGradient / pairs.length

    for (const featureName of featureNames) {
      const gradient = gradients[featureName] / pairs.length + options.l2 * weights[featureName]
      weights[featureName] -= options.learningRate * gradient
    }
  }

  return {
    bias,
    featureNames,
    means,
    model: "linear-logistic",
    stdDevs,
    version: RERANKER_VERSION,
    weights,
  }
}

function createFeatureMeans(
  pairs: readonly LegoRerankerPair[],
  featureNames: readonly LegoRerankerFeatureName[],
): Record<LegoRerankerFeatureName, number> {
  return Object.fromEntries(featureNames.map((featureName) => [
    featureName,
    pairs.reduce((total, pair) => total + pair.features[featureName], 0) / pairs.length,
  ])) as Record<LegoRerankerFeatureName, number>
}

function createFeatureStdDevs(
  pairs: readonly LegoRerankerPair[],
  featureNames: readonly LegoRerankerFeatureName[],
  means: Readonly<Record<LegoRerankerFeatureName, number>>,
): Record<LegoRerankerFeatureName, number> {
  return Object.fromEntries(featureNames.map((featureName) => {
    const variance = pairs.reduce((total, pair) => {
      const delta = pair.features[featureName] - means[featureName]

      return total + delta * delta
    }, 0) / pairs.length

    return [featureName, Math.max(0.000001, Math.sqrt(variance))]
  })) as Record<LegoRerankerFeatureName, number>
}

function scorePairs(
  pairs: readonly LegoRerankerPair[],
  model: Omit<LegoRerankerModel, "threshold">,
): ScoredLegoRerankerPair[] {
  return pairs.map((pair) => ({
    ...pair,
    score: sigmoid(scoreNormalizedFeatures(pair.features, model)),
  }))
}

function scoreNormalizedFeatures(
  features: Readonly<Record<LegoRerankerFeatureName, number>>,
  model: Omit<LegoRerankerModel, "threshold">,
): number {
  return model.featureNames.reduce((score, featureName) =>
    score + model.weights[featureName] * normalizeFeature(features[featureName], model.means[featureName], model.stdDevs[featureName]),
  model.bias)
}

function normalizeFeature(value: number, mean: number, stdDev: number): number {
  return (value - mean) / stdDev
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exp = Math.exp(-value)

    return 1 / (1 + exp)
  }

  const exp = Math.exp(value)

  return exp / (1 + exp)
}

function chooseZeroFalsePositiveThreshold(scoredNegativePairs: readonly ScoredLegoRerankerPair[]): number {
  let threshold = Number.NEGATIVE_INFINITY

  for (const pair of scoredNegativePairs) {
    if (pair.target === 0) {
      threshold = Math.max(threshold, pair.score)
    }
  }

  if (threshold === Number.NEGATIVE_INFINITY) {
    throw new Error("LEGO reranker needs at least one negative threshold pair.")
  }

  return threshold + THRESHOLD_EPSILON
}

function evaluatePartFolds(
  pairs: readonly LegoRerankerPair[],
  options: {
    foldCount: number
    iterations: number
    l2: number
    learningRate: number
    maxNegativesPerPositive: number
  },
): RerankerTrainingSummary["foldScore"] {
  const partIds = [...new Set(pairs.flatMap((pair) => [pair.leftPartId, pair.rightPartId]))].sort()
  const folds: RerankerFoldScore[] = []

  for (let fold = 0; fold < options.foldCount; fold += 1) {
    const holdoutPartIds = partIds.filter((partId) => stableFold(partId, options.foldCount) === fold)
    const holdoutPartSet = new Set(holdoutPartIds)
    const trainingPairs = pairs.filter((pair) =>
      !holdoutPartSet.has(pair.leftPartId) && !holdoutPartSet.has(pair.rightPartId)
    )
    const holdoutPairs = pairs.filter((pair) =>
      holdoutPartSet.has(pair.leftPartId) && holdoutPartSet.has(pair.rightPartId)
    )

    if (
      holdoutPairs.length === 0 ||
      !trainingPairs.some((pair) => pair.target === 1) ||
      !trainingPairs.some((pair) => pair.target === 0) ||
      !holdoutPairs.some((pair) => pair.target === 1) ||
      !holdoutPairs.some((pair) => pair.target === 0)
    ) {
      continue
    }

    const model = trainLinearModel(selectTrainingPairs(trainingPairs, options.maxNegativesPerPositive), options)
    const threshold = chooseZeroFalsePositiveThreshold(scorePairs(trainingPairs.filter((pair) => pair.target === 0), model))

    folds.push({
      fold,
      holdoutPartIds,
      threshold,
      totals: summarizePairs(scorePairs(holdoutPairs, model), threshold),
    })
  }

  return {
    folds,
    totals: folds.reduce((total, fold) => addTotals(total, fold.totals), emptyTotals()),
  }
}

function summarizePairs(
  scoredPairs: readonly ScoredLegoRerankerPair[],
  threshold: number,
): RerankerTotals {
  let falsePositivePairs = 0
  let matchedPositivePairs = 0
  let negativePairs = 0
  let positivePairs = 0

  for (const pair of scoredPairs) {
    const matched = pair.score >= threshold

    if (pair.target === 1) {
      positivePairs += 1
      matchedPositivePairs += matched ? 1 : 0
    } else {
      negativePairs += 1
      falsePositivePairs += matched ? 1 : 0
    }
  }

  return {
    falsePositivePairs,
    matchedPositivePairs,
    missedPositivePairs: positivePairs - matchedPositivePairs,
    negativePairs,
    positivePairs,
    recall: positivePairs === 0 ? 0 : matchedPositivePairs / positivePairs,
    scoredPairs: scoredPairs.length,
  }
}

function addTotals(left: RerankerTotals, right: RerankerTotals): RerankerTotals {
  const positivePairs = left.positivePairs + right.positivePairs
  const matchedPositivePairs = left.matchedPositivePairs + right.matchedPositivePairs

  return {
    falsePositivePairs: left.falsePositivePairs + right.falsePositivePairs,
    matchedPositivePairs,
    missedPositivePairs: left.missedPositivePairs + right.missedPositivePairs,
    negativePairs: left.negativePairs + right.negativePairs,
    positivePairs,
    recall: positivePairs === 0 ? 0 : matchedPositivePairs / positivePairs,
    scoredPairs: left.scoredPairs + right.scoredPairs,
  }
}

function emptyTotals(): RerankerTotals {
  return {
    falsePositivePairs: 0,
    matchedPositivePairs: 0,
    missedPositivePairs: 0,
    negativePairs: 0,
    positivePairs: 0,
    recall: 0,
    scoredPairs: 0,
  }
}

function createRerankerVerdict(
  globalScore: RerankerTotals,
  foldScore: RerankerTotals,
): RerankerTrainingSummary["verdict"] {
  if (foldScore.positivePairs === 0) {
    return {
      reason: "No usable part-id holdout folds. Need more rendered catalogue parts.",
      status: "blocked",
    }
  }

  if (foldScore.falsePositivePairs === 0 && foldScore.recall >= 0.8) {
    return {
      reason: `Promising synthetic result: ${foldScore.matchedPositivePairs}/${foldScore.positivePairs} holdout positives with zero false positives. Manual bridge still unproven.`,
      status: "promising",
    }
  }

  if (foldScore.falsePositivePairs === 0 && foldScore.matchedPositivePairs > 0) {
    return {
      reason: `Safe but weak synthetic result: ${foldScore.matchedPositivePairs}/${foldScore.positivePairs} holdout positives with zero false positives. Needs stronger data/model before manual bridge.`,
      status: "inconclusive",
    }
  }

  return {
    reason: `Blocked synthetic result: ${foldScore.falsePositivePairs} holdout false positives; global training recall was ${globalScore.matchedPositivePairs}/${globalScore.positivePairs}.`,
    status: "blocked",
  }
}

function renderRerankerIndex(
  summary: RerankerTrainingSummary,
  scoredPairs: readonly ScoredLegoRerankerPair[],
): string {
  const threshold = summary.globalScore.threshold
  const falsePositives = scoredPairs
    .filter((pair) => pair.target === 0 && pair.score >= threshold)
    .sort((left, right) => right.score - left.score)
    .slice(0, DIAGNOSTIC_LIMIT)
  const missedPositives = scoredPairs
    .filter((pair) => pair.target === 1 && pair.score < threshold)
    .sort((left, right) => left.score - right.score)
    .slice(0, DIAGNOSTIC_LIMIT)
  const dangerousNegatives = scoredPairs
    .filter((pair) => pair.target === 0 && pair.score < threshold)
    .sort((left, right) => right.score - left.score)
    .slice(0, DIAGNOSTIC_LIMIT)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Part match LEGO reranker</title>
  <style>
    body { color: #14213d; font-family: system-ui, sans-serif; margin: 24px; }
    article { border: 1px solid #d8ded8; border-radius: 8px; margin: 12px 0; padding: 12px; }
    .blocked { background: #fff1f1; }
    .promising { background: #f0fff4; }
    .inconclusive { background: #fff8e5; }
    .meta { color: #4a5568; }
    code { overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <h1>Part match LEGO reranker</h1>
  <article class="${escapeAttribute(summary.verdict.status)}">
    <h2>${escapeHtml(summary.verdict.status)}</h2>
    <p>${escapeHtml(summary.verdict.reason)}</p>
  </article>
  <p>${summary.partCount} parts · ${summary.pairCount} pairs · ${summary.trainingPairs.global} global training pairs · ${escapeHtml(summary.modelIds.join(", ") || "unknown model")}</p>
  <p>Global: ${summary.globalScore.totals.matchedPositivePairs}/${summary.globalScore.totals.positivePairs} positives, ${summary.globalScore.totals.falsePositivePairs} false positives</p>
  <p>Fold holdout: ${summary.foldScore.totals.matchedPositivePairs}/${summary.foldScore.totals.positivePairs} positives, ${summary.foldScore.totals.falsePositivePairs} false positives</p>
  ${renderPairSection("Global false positives", falsePositives)}
  ${renderPairSection("Global dangerous negatives", dangerousNegatives)}
  ${renderPairSection("Global missed positives", missedPositives)}
</body>
</html>
`
}

function renderPairSection(title: string, pairs: readonly ScoredLegoRerankerPair[]): string {
  return `
  <h2>${escapeHtml(title)} (${pairs.length})</h2>
  ${pairs.map((pair) => `
    <article>
      <p><strong>${escapeHtml(pair.leftPartId)} ↔ ${escapeHtml(pair.rightPartId)}</strong> · score ${pair.score.toFixed(6)} · target ${pair.target}</p>
      <p class="meta"><code>${escapeHtml(pair.leftItemId)}</code> · <code>${escapeHtml(pair.rightItemId)}</code></p>
      <p class="meta">${escapeHtml(JSON.stringify(pair.features))}</p>
    </article>
  `).join("")}
`
}

function countPartIds(pairs: readonly LegoRerankerPair[]): number {
  return new Set(pairs.flatMap((pair) => [pair.leftPartId, pair.rightPartId])).size
}

function stableFold(value: string, foldCount: number): number {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }

  return hash % foldCount
}

function dotProduct(left: readonly number[], right: readonly number[]): number {
  return left.reduce((total, value, index) => total + value * (right[index] ?? 0), 0)
}

function createItemKey(manualId: string, itemId: string): string {
  return `${manualId}:${itemId}`
}

function writeJson(filePath: string, value: unknown): Promise<void> {
  return mkdir(path.dirname(filePath), { recursive: true })
    .then(() => writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`))
}

function normalizeWorkspacePath(value: string): string {
  const absolutePath = path.resolve(value)
  const relative = path.relative(process.cwd(), absolutePath)

  return relative.startsWith("..") ? absolutePath : relative
}

function timestampForPath(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-")
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function escapeAttribute(value: string): string {
  return escapeHtml(value)
}

function readOption(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name)

  return index >= 0 ? argv[index + 1] ?? null : null
}

function parseList(value: string | null): string[] {
  return value?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? []
}

function parseNumberOption(argv: readonly string[], name: string, fallback: number): number {
  const value = readOption(argv, name)

  return value ? Number(value) : fallback
}

function parsePairViewPolicy(value: string | null): PairViewPolicy {
  if (!value) {
    return "any-view"
  }

  if (value === "any-view" || value === "same-view") {
    return value
  }

  throw new Error(`Unsupported --pair-view-policy ${value}. Expected any-view or same-view.`)
}

function parseCliArgs(argv: readonly string[]): TrainPartMatchLegoRerankerOptions {
  const embeddingDirs = parseList(readOption(argv, "--embedding-dir"))
  const labelDir = readOption(argv, "--label-dir")

  if (!labelDir) {
    throw new Error("--label-dir is required.")
  }

  return {
    embeddingDirs,
    foldCount: parseNumberOption(argv, "--fold-count", DEFAULT_FOLDS),
    iterations: parseNumberOption(argv, "--iterations", DEFAULT_ITERATIONS),
    l2: parseNumberOption(argv, "--l2", DEFAULT_L2),
    labelDir,
    learningRate: parseNumberOption(argv, "--learning-rate", DEFAULT_LEARNING_RATE),
    maxNegativesPerPositive: parseNumberOption(argv, "--max-negatives-per-positive", DEFAULT_MAX_NEGATIVES_PER_POSITIVE),
    outputDir: readOption(argv, "--output-dir") ?? undefined,
    pairViewPolicy: parsePairViewPolicy(readOption(argv, "--pair-view-policy")),
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isMain) {
  trainPartMatchLegoReranker(parseCliArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(`Part-match LEGO reranker: ${result.summary.verdict.status}`)
      console.log(result.summary.verdict.reason)
      console.log(`Summary: ${result.summaryPath}`)
      console.log(`Index: ${result.indexPath}`)
    })
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
}
