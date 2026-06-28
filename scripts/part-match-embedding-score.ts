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
import { colorsAreCompatible } from "../packages/part-matching/src/color"
import type { PartMatchColor } from "../packages/part-matching/src/contracts"

const DEFAULT_LABEL_DIR = path.join(".bag-it", "private", "part-match-reports", "labels")
const DEFAULT_OUTPUT_ROOT = path.join(
  ".bag-it",
  "private",
  "part-match-reports",
  "embedding-experiments",
)
const PAIR_SCORE_VERSION = "0.1.0"
const THRESHOLD_EPSILON = 0.000001
const DIAGNOSTIC_PAIR_LIMIT = 80
const VARIANT_NAMES: readonly PartMatchEmbeddingVariantName[] = [
  "rendered",
  "tight-rendered",
  "neutral-mask",
  "silhouette",
]
const PRIMARY_SCORE_NAME = "mean"
const SCORE_MODES = [
  "mean",
  "min",
  "max",
  "rendered",
  "tight-rendered",
  "neutral-mask",
  "silhouette",
  "rendered-tight-min",
  "all-variants-min",
] as const

type PairTarget = 0 | 1
type PairKind = "positive" | "negative" | "hard-negative"
type ScoreMode = typeof SCORE_MODES[number]

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

interface EmbeddingInput {
  embeddings: Map<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>>
  modelIds: string[]
  rowsByItemKey: Map<string, PartMatchEmbeddingRow>
  rowsByManual: Map<string, PartMatchEmbeddingRow[]>
}

interface LabelSet {
  labelPath: string
  labels: LabelRow[]
  manualId: string
  reportPath: string
  status: "active" | "gate"
}

interface LabelRow {
  cropHash?: string
  expectedPartKey: string
  itemId: string
  note?: string
  role: "active" | "gate" | "excluded"
}

interface PairCandidate {
  kind: PairKind
  leftItemId: string
  manualId: string
  rightItemId: string
  source: string
  target: PairTarget
}

interface ReviewPairRecord {
  id: string
  initialStatus: "different" | "same" | null
  kind: PairKind
  left: string
  manualId: string
  right: string
  score: number
  scores: PairVariantScores
  source: string
  target: PairTarget
}

export interface ScoredEmbeddingPair extends PairCandidate {
  leftRowKey: string
  primaryScore: number
  rightRowKey: string
  scores: PairVariantScores
}

interface PairVariantScores {
  max: number
  mean: number
  min: number
  neutralMask: number | null
  rendered: number | null
  silhouette: number | null
  tightRendered: number | null
}

interface SkippedPair {
  leftItemId: string
  manualId: string
  reason: string
  rightItemId: string
  source: string
}

interface PairScoreTotals {
  falsePositivePairs: number
  hardNegativeFalsePositivePairs: number
  matchedPositivePairs: number
  missedPositivePairs: number
  negativePairs: number
  positivePairs: number
  recall: number
  scoredPairs: number
}

interface ScoreModeResult {
  holdout: HoldoutScore
  mode: ScoreMode
  threshold: number
  totals: PairScoreTotals
}

interface ScoreSweepFile {
  generatedAt: string
  modes: ScoreModeResult[]
  version: string
}

interface HoldoutManualScore {
  available: boolean
  manualId: string
  reason?: string
  threshold: number | null
  totals: PairScoreTotals
}

interface HoldoutScore {
  manuals: HoldoutManualScore[]
  totals: PairScoreTotals
}

interface EmbeddingScoreSummary {
  durationMs: number
  generatedAt: string
  modelIds: string[]
  options: {
    decisionPaths: string[]
    embeddingDirs: string[]
    excludeManualIds: string[]
    labelDir: string
    manualIds: string[] | null
    outputDir: string
  }
  primaryScore: string
  threshold: number
  thresholdEpsilon: number
  totals: PairScoreTotals
  perManual: Record<string, PairScoreTotals>
  holdout: HoldoutScore
  skippedPairs: {
    byReason: Record<string, number>
    count: number
  }
  version: string
}

export interface ScorePartMatchEmbeddingsOptions {
  decisionPaths?: string[]
  embeddingDirs: string[]
  excludeManualIds?: string[]
  generatedAt?: Date
  labelDir?: string
  manualIds?: string[] | null
  outputDir?: string
}

export interface ScorePartMatchEmbeddingsResult {
  indexPath: string
  outputDir: string
  pairsPath: string
  summary: EmbeddingScoreSummary
  summaryPath: string
  sweepPath: string
}

export async function scorePartMatchEmbeddings(
  options: ScorePartMatchEmbeddingsOptions,
): Promise<ScorePartMatchEmbeddingsResult> {
  if (options.embeddingDirs.length === 0) {
    throw new Error("At least one embedding cache directory is required.")
  }

  const startedAt = Date.now()
  const generatedAt = options.generatedAt ?? new Date()
  const outputDir = options.outputDir ?? path.join(DEFAULT_OUTPUT_ROOT, `${timestampForPath(generatedAt)}-score`)
  const labelDir = options.labelDir ?? DEFAULT_LABEL_DIR
  const manualIds = options.manualIds ?? null
  const excludeManualIds = options.excludeManualIds ?? []
  const decisionPaths = options.decisionPaths ?? []
  const input = await readEmbeddingInputs(options.embeddingDirs)
  const labelSets = filterLabelSets(await readLabelSets(labelDir), { excludeManualIds, manualIds })
  const decisions = await readDecisionPairs(decisionPaths)
  const { candidates, skippedPairs } = createPairCandidates({
    decisions,
    excludeManualIds,
    input,
    labelSets,
    manualIds,
  })
  const { pairs, skipped: scoringSkippedPairs } = scorePairCandidates(candidates, input)
  const allSkippedPairs = [...skippedPairs, ...scoringSkippedPairs]

  if (!pairs.some((pair) => pair.target === 1)) {
    throw new Error("Embedding scorer needs at least one positive pair.")
  }

  if (!pairs.some((pair) => pair.target === 0)) {
    throw new Error("Embedding scorer needs at least one negative pair.")
  }

  const threshold = chooseZeroFalsePositiveThreshold(pairs)
  const sweep = createScoreSweep(pairs)
  const summary = createSummary({
    decisionPaths,
    durationMs: Date.now() - startedAt,
    embeddingDirs: options.embeddingDirs,
    excludeManualIds,
    generatedAt,
    input,
    labelDir,
    manualIds,
    outputDir,
    pairs,
    skippedPairs: allSkippedPairs,
    threshold,
  })

  await mkdir(outputDir, { recursive: true })
  const pairsPath = path.join(outputDir, "pairs.json")
  const summaryPath = path.join(outputDir, "summary.json")
  const sweepPath = path.join(outputDir, "sweep.json")
  const indexPath = path.join(outputDir, "index.html")

  await writeJson(pairsPath, {
    generatedAt: generatedAt.toISOString(),
    pairs,
    skippedPairs: allSkippedPairs,
    version: PAIR_SCORE_VERSION,
  })
  await writeJson(summaryPath, summary)
  await writeJson(sweepPath, {
    generatedAt: generatedAt.toISOString(),
    modes: sweep,
    version: PAIR_SCORE_VERSION,
  } satisfies ScoreSweepFile)
  await writeFile(indexPath, renderScoreIndexHtml({
    input,
    outputDir,
    pairs,
    skippedPairs: allSkippedPairs,
    summary,
    sweep,
    threshold,
  }))

  return {
    indexPath,
    outputDir,
    pairsPath,
    summary,
    summaryPath,
    sweepPath,
  }
}

async function readEmbeddingInputs(embeddingDirs: readonly string[]): Promise<EmbeddingInput> {
  const rowsByItemKey = new Map<string, PartMatchEmbeddingRow>()
  const rowsByManual = new Map<string, PartMatchEmbeddingRow[]>()
  const embeddings = new Map<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>>()
  const modelIds = new Set<string>()

  for (const embeddingDir of embeddingDirs) {
    const rowsPath = path.join(embeddingDir, "rows.json")
    const embeddingsPath = path.join(embeddingDir, "embeddings.json")

    if (!existsSync(rowsPath)) {
      throw new Error(`Missing embedding rows file: ${rowsPath}`)
    }

    if (!existsSync(embeddingsPath)) {
      throw new Error(`Missing embeddings file: ${embeddingsPath}`)
    }

    const rowsFile = JSON.parse(await readFile(rowsPath, "utf8")) as EmbeddingRowsFile
    const embeddingsFile = JSON.parse(await readFile(embeddingsPath, "utf8")) as EmbeddingCacheFile

    if (embeddingsFile.model?.id) {
      modelIds.add(embeddingsFile.model.id)
    }

    for (const row of rowsFile.rows ?? []) {
      const itemKey = createItemKey(row.manualId, row.itemId)

      if (rowsByItemKey.has(itemKey)) {
        throw new Error(`Duplicate embedding row for ${itemKey}.`)
      }

      rowsByItemKey.set(itemKey, row)
      rowsByManual.set(row.manualId, [...(rowsByManual.get(row.manualId) ?? []), row])
    }

    for (const [rowKey, rowEmbeddings] of Object.entries(embeddingsFile.embeddings ?? {})) {
      if (embeddings.has(rowKey)) {
        throw new Error(`Duplicate embedding vector row ${rowKey}.`)
      }

      embeddings.set(rowKey, rowEmbeddings)
    }
  }

  return {
    embeddings,
    modelIds: [...modelIds].sort(),
    rowsByItemKey,
    rowsByManual,
  }
}

async function readLabelSets(labelDir: string): Promise<LabelSet[]> {
  if (!existsSync(labelDir)) {
    return []
  }

  const labelPaths = await readJsonFilePaths(labelDir)
  const labelSets = await Promise.all(labelPaths.map(async (labelPath) => {
    const parsed = JSON.parse(await readFile(labelPath, "utf8")) as {
      labels?: Array<Partial<LabelRow>>
      manualId?: string
      reportPath?: string
      status?: string
    }

    if (parsed.status !== "active" && parsed.status !== "gate") {
      throw new Error(`Part match label file ${labelPath} status must be "active" or "gate".`)
    }

    if (!parsed.manualId || !parsed.reportPath || !Array.isArray(parsed.labels)) {
      throw new Error(`Part match label file ${labelPath} is missing manualId, reportPath, or labels.`)
    }

    return {
      labelPath: normalizeWorkspacePath(labelPath),
      labels: parsed.labels.map((label, index) => normalizeLabelRow(label, {
        fallbackRole: parsed.status as "active" | "gate",
        labelPath,
        index,
      })),
      manualId: parsed.manualId,
      reportPath: normalizeWorkspacePath(parsed.reportPath),
      status: parsed.status,
    } satisfies LabelSet
  }))

  return labelSets.sort((left, right) =>
    left.manualId.localeCompare(right.manualId) ||
    left.labelPath.localeCompare(right.labelPath),
  )
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

function normalizeLabelRow(
  label: Partial<LabelRow>,
  {
    fallbackRole,
    index,
    labelPath,
  }: {
    fallbackRole: "active" | "gate"
    index: number
    labelPath: string
  },
): LabelRow {
  const role = label.role ?? fallbackRole

  if (role !== "active" && role !== "gate" && role !== "excluded") {
    throw new Error(`Part match label file ${labelPath} labels[${index}].role is invalid.`)
  }

  if (!label.itemId) {
    throw new Error(`Part match label file ${labelPath} labels[${index}].itemId is required.`)
  }

  if (role !== "excluded" && !label.expectedPartKey) {
    throw new Error(`Part match label file ${labelPath} labels[${index}].expectedPartKey is required.`)
  }

  return {
    cropHash: label.cropHash,
    expectedPartKey: label.expectedPartKey ?? "",
    itemId: label.itemId,
    note: label.note,
    role,
  }
}

function filterLabelSets(
  labelSets: readonly LabelSet[],
  {
    excludeManualIds,
    manualIds,
  }: {
    excludeManualIds: readonly string[]
    manualIds: readonly string[] | null
  },
): LabelSet[] {
  const includeManualIds = manualIds ? new Set(manualIds) : null
  const excluded = new Set(excludeManualIds)

  return labelSets.filter((labelSet) =>
    (!includeManualIds || includeManualIds.has(labelSet.manualId)) &&
    !excluded.has(labelSet.manualId)
  )
}

async function readDecisionPairs(decisionPaths: readonly string[]): Promise<PairCandidate[]> {
  const decisions: PairCandidate[] = []

  for (const decisionPath of decisionPaths) {
    if (!existsSync(decisionPath)) {
      throw new Error(`Decision file missing: ${decisionPath}`)
    }

    const parsed = JSON.parse(await readFile(decisionPath, "utf8")) as {
      decisions?: Array<{
        itemId?: string
        left?: string
        manualId?: string
        referenceItemIds?: string[]
        right?: string
        status?: string
      }>
    }

    for (const decision of parsed.decisions ?? []) {
      if (decision.status !== "same" && decision.status !== "different") {
        continue
      }

      if (!decision.manualId) {
        throw new Error(`Decision in ${decisionPath} is missing manualId.`)
      }

      const target = decision.status === "same" ? 1 : 0
      const kind: PairKind = target === 1 ? "positive" : "hard-negative"
      const source = `decision:${normalizeWorkspacePath(decisionPath)}`

      if (decision.left && decision.right) {
        decisions.push({
          kind,
          leftItemId: decision.left,
          manualId: decision.manualId,
          rightItemId: decision.right,
          source,
          target,
        })
        continue
      }

      if (decision.itemId && Array.isArray(decision.referenceItemIds)) {
        for (const referenceItemId of decision.referenceItemIds) {
          decisions.push({
            kind,
            leftItemId: decision.itemId,
            manualId: decision.manualId,
            rightItemId: referenceItemId,
            source,
            target,
          })
        }
      }
    }
  }

  return decisions
}

function createPairCandidates({
  decisions,
  excludeManualIds,
  input,
  labelSets,
  manualIds,
}: {
  decisions: readonly PairCandidate[]
  excludeManualIds: readonly string[]
  input: EmbeddingInput
  labelSets: readonly LabelSet[]
  manualIds: readonly string[] | null
}): {
  candidates: PairCandidate[]
  skippedPairs: SkippedPair[]
} {
  const candidates = new Map<string, PairCandidate>()
  const skippedPairs: SkippedPair[] = []

  for (const labelSet of labelSets) {
    const labels = labelSet.labels.filter((label) => label.role !== "excluded" && label.expectedPartKey)

    for (let leftIndex = 0; leftIndex < labels.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < labels.length; rightIndex += 1) {
        const left = labels[leftIndex]
        const right = labels[rightIndex]

        if (!left || !right) {
          continue
        }

        addCandidate({
          candidate: {
            kind: left.expectedPartKey === right.expectedPartKey ? "positive" : "negative",
            leftItemId: left.itemId,
            manualId: labelSet.manualId,
            rightItemId: right.itemId,
            source: "label",
            target: left.expectedPartKey === right.expectedPartKey ? 1 : 0,
          },
          candidates,
          input,
          skippedPairs,
        })
      }
    }

    for (const excludedLabel of labelSet.labels.filter((label) => label.role === "excluded")) {
      const excludedRow = input.rowsByItemKey.get(createItemKey(labelSet.manualId, excludedLabel.itemId))

      if (!excludedRow) {
        skippedPairs.push({
          leftItemId: excludedLabel.itemId,
          manualId: labelSet.manualId,
          reason: "missing-excluded-row",
          rightItemId: "",
          source: "excluded-row",
        })
        continue
      }

      for (const row of input.rowsByManual.get(labelSet.manualId) ?? []) {
        if (row.itemId === excludedLabel.itemId || !rowsCanPair(excludedRow, row)) {
          continue
        }

        addCandidate({
          candidate: {
            kind: "hard-negative",
            leftItemId: excludedLabel.itemId,
            manualId: labelSet.manualId,
            rightItemId: row.itemId,
            source: "excluded-row",
            target: 0,
          },
          candidates,
          input,
          skippedPairs,
        })
      }
    }
  }

  const includedManualIds = manualIds ? new Set(manualIds) : null
  const excludedManualIds = new Set(excludeManualIds)

  for (const decision of decisions) {
    if (
      (includedManualIds && !includedManualIds.has(decision.manualId)) ||
      excludedManualIds.has(decision.manualId)
    ) {
      continue
    }

    addCandidate({
      candidate: decision,
      candidates,
      input,
      skippedPairs,
    })
  }

  return {
    candidates: [...candidates.values()],
    skippedPairs,
  }
}

function addCandidate({
  candidate,
  candidates,
  input,
  skippedPairs,
}: {
  candidate: PairCandidate
  candidates: Map<string, PairCandidate>
  input: EmbeddingInput
  skippedPairs: SkippedPair[]
}): void {
  const left = input.rowsByItemKey.get(createItemKey(candidate.manualId, candidate.leftItemId))
  const right = input.rowsByItemKey.get(createItemKey(candidate.manualId, candidate.rightItemId))

  if (!left || !right) {
    skippedPairs.push({
      leftItemId: candidate.leftItemId,
      manualId: candidate.manualId,
      reason: "missing-row",
      rightItemId: candidate.rightItemId,
      source: candidate.source,
    })
    return
  }

  if (!rowsCanPair(left, right)) {
    skippedPairs.push({
      leftItemId: candidate.leftItemId,
      manualId: candidate.manualId,
      reason: "non-app-candidate",
      rightItemId: candidate.rightItemId,
      source: candidate.source,
    })
    return
  }

  if (!colorsAreCompatible(readPartMatchColor(left.color), readPartMatchColor(right.color))) {
    skippedPairs.push({
      leftItemId: candidate.leftItemId,
      manualId: candidate.manualId,
      reason: "color-conflict",
      rightItemId: candidate.rightItemId,
      source: candidate.source,
    })
    return
  }

  const pairKey = createPairKey(candidate.manualId, candidate.leftItemId, candidate.rightItemId)
  const existing = candidates.get(pairKey)

  if (existing && existing.target !== candidate.target) {
    const replacement = chooseConflictingCandidate(existing, candidate)

    if (replacement) {
      candidates.set(pairKey, normalizeCandidateOrder(replacement))
      skippedPairs.push({
        leftItemId: candidate.leftItemId,
        manualId: candidate.manualId,
        reason: "review-decision-overrode-target",
        rightItemId: candidate.rightItemId,
        source: candidate.source,
      })
      return
    }

    skippedPairs.push({
      leftItemId: candidate.leftItemId,
      manualId: candidate.manualId,
      reason: "conflicting-target",
      rightItemId: candidate.rightItemId,
      source: candidate.source,
    })
    return
  }

  if (
    !existing ||
    candidatePriority(candidate) > candidatePriority(existing) ||
    (candidatePriority(candidate) === candidatePriority(existing) && pairKindRank(candidate.kind) > pairKindRank(existing.kind))
  ) {
    candidates.set(pairKey, normalizeCandidateOrder(candidate))
  }
}

function chooseConflictingCandidate(
  existing: PairCandidate,
  candidate: PairCandidate,
): PairCandidate | null {
  if (candidatePriority(candidate) > candidatePriority(existing)) {
    return candidate
  }

  if (candidatePriority(existing) > candidatePriority(candidate)) {
    return existing
  }

  return null
}

function rowsCanPair(left: PartMatchEmbeddingRow, right: PartMatchEmbeddingRow): boolean {
  return Boolean(
    left.bagId &&
    right.bagId &&
    left.bagId === right.bagId &&
    left.calloutId &&
    right.calloutId &&
    left.calloutId !== right.calloutId,
  )
}

function readPartMatchColor(color: unknown): PartMatchColor | null {
  return color && typeof color === "object"
    ? color as PartMatchColor
    : null
}

function pairKindRank(kind: PairKind): number {
  return kind === "hard-negative" ? 3 : kind === "positive" ? 2 : 1
}

function candidatePriority(candidate: PairCandidate): number {
  if (candidate.source.startsWith("decision:")) {
    return 3
  }

  return candidate.source === "label" ? 2 : 1
}

function normalizeCandidateOrder(candidate: PairCandidate): PairCandidate {
  const [leftItemId, rightItemId] = sortPair(candidate.leftItemId, candidate.rightItemId)

  return {
    ...candidate,
    leftItemId,
    rightItemId,
  }
}

function scorePairCandidates(
  candidates: readonly PairCandidate[],
  input: EmbeddingInput,
): {
  pairs: ScoredEmbeddingPair[]
  skipped: SkippedPair[]
} {
  const pairs: ScoredEmbeddingPair[] = []
  const skipped: SkippedPair[] = []

  for (const candidate of candidates) {
    const left = input.rowsByItemKey.get(createItemKey(candidate.manualId, candidate.leftItemId))
    const right = input.rowsByItemKey.get(createItemKey(candidate.manualId, candidate.rightItemId))

    if (!left || !right) {
      skipped.push({
        leftItemId: candidate.leftItemId,
        manualId: candidate.manualId,
        reason: "missing-row",
        rightItemId: candidate.rightItemId,
        source: candidate.source,
      })
      continue
    }

    const scores = scoreRowPair(left, right, input.embeddings)

    if (!scores) {
      skipped.push({
        leftItemId: candidate.leftItemId,
        manualId: candidate.manualId,
        reason: "missing-vector",
        rightItemId: candidate.rightItemId,
        source: candidate.source,
      })
      continue
    }

    pairs.push({
      ...candidate,
      leftRowKey: left.rowKey,
      primaryScore: scores[PRIMARY_SCORE_NAME],
      rightRowKey: right.rowKey,
      scores,
    })
  }

  return { pairs, skipped }
}

function scoreRowPair(
  left: PartMatchEmbeddingRow,
  right: PartMatchEmbeddingRow,
  embeddings: ReadonlyMap<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>>,
): PairVariantScores | null {
  const leftEmbeddings = embeddings.get(left.rowKey)
  const rightEmbeddings = embeddings.get(right.rowKey)
  const variantScores = new Map<PartMatchEmbeddingVariantName, number>()

  if (!leftEmbeddings || !rightEmbeddings) {
    return null
  }

  for (const variantName of VARIANT_NAMES) {
    const leftVector = leftEmbeddings[variantName]?.vector
    const rightVector = rightEmbeddings[variantName]?.vector

    if (!leftVector || !rightVector || leftVector.length !== rightVector.length) {
      continue
    }

    variantScores.set(variantName, dotProduct(leftVector, rightVector))
  }

  const scores = [...variantScores.values()]

  if (scores.length === 0) {
    return null
  }

  return {
    max: Math.max(...scores),
    mean: scores.reduce((total, score) => total + score, 0) / scores.length,
    min: Math.min(...scores),
    neutralMask: variantScores.get("neutral-mask") ?? null,
    rendered: variantScores.get("rendered") ?? null,
    silhouette: variantScores.get("silhouette") ?? null,
    tightRendered: variantScores.get("tight-rendered") ?? null,
  }
}

function chooseZeroFalsePositiveThreshold(pairs: readonly ScoredEmbeddingPair[]): number {
  const negativeScores = pairs
    .filter((pair) => pair.target === 0)
    .map((pair) => pair.primaryScore)

  if (negativeScores.length === 0) {
    throw new Error("Embedding scorer needs at least one negative pair.")
  }

  return Math.max(...negativeScores) + THRESHOLD_EPSILON
}

function chooseZeroFalsePositiveThresholdForMode(
  pairs: readonly ScoredEmbeddingPair[],
  mode: ScoreMode,
): number {
  const negativeScores = pairs
    .filter((pair) => pair.target === 0)
    .map((pair) => scorePairForMode(pair, mode))
    .filter((score): score is number => score !== null)

  if (negativeScores.length === 0) {
    throw new Error(`Embedding scorer mode ${mode} needs at least one negative pair.`)
  }

  return Math.max(...negativeScores) + THRESHOLD_EPSILON
}

function createScoreSweep(pairs: readonly ScoredEmbeddingPair[]): ScoreModeResult[] {
  return SCORE_MODES.map((mode) => {
    const modePairs = pairs.filter((pair) => scorePairForMode(pair, mode) !== null)
    const threshold = chooseZeroFalsePositiveThresholdForMode(modePairs, mode)

    return {
      holdout: evaluateHoldout(modePairs, mode),
      mode,
      threshold,
      totals: summarizePairs(modePairs, threshold, mode),
    }
  }).sort((left, right) =>
    left.holdout.totals.falsePositivePairs - right.holdout.totals.falsePositivePairs ||
    right.totals.matchedPositivePairs - left.totals.matchedPositivePairs ||
    left.mode.localeCompare(right.mode)
  )
}

function scorePairForMode(pair: ScoredEmbeddingPair, mode: ScoreMode): number | null {
  switch (mode) {
    case "all-variants-min":
      return scoreMin([
        pair.scores.rendered,
        pair.scores.tightRendered,
        pair.scores.neutralMask,
        pair.scores.silhouette,
      ])
    case "max":
      return pair.scores.max
    case "mean":
      return pair.scores.mean
    case "min":
      return pair.scores.min
    case "neutral-mask":
      return pair.scores.neutralMask
    case "rendered":
      return pair.scores.rendered
    case "rendered-tight-min":
      return scoreMin([pair.scores.rendered, pair.scores.tightRendered])
    case "silhouette":
      return pair.scores.silhouette
    case "tight-rendered":
      return pair.scores.tightRendered
  }
}

function scoreMin(scores: readonly (number | null)[]): number | null {
  const usableScores = scores.filter((score): score is number => score !== null)

  return usableScores.length === scores.length
    ? Math.min(...usableScores)
    : null
}

function createSummary({
  decisionPaths,
  durationMs,
  embeddingDirs,
  excludeManualIds,
  generatedAt,
  input,
  labelDir,
  manualIds,
  outputDir,
  pairs,
  skippedPairs,
  threshold,
}: {
  decisionPaths: readonly string[]
  durationMs: number
  embeddingDirs: readonly string[]
  excludeManualIds: readonly string[]
  generatedAt: Date
  input: EmbeddingInput
  labelDir: string
  manualIds: readonly string[] | null
  outputDir: string
  pairs: readonly ScoredEmbeddingPair[]
  skippedPairs: readonly SkippedPair[]
  threshold: number
}): EmbeddingScoreSummary {
  return {
    durationMs,
    generatedAt: generatedAt.toISOString(),
    holdout: evaluateHoldout(pairs),
    modelIds: input.modelIds,
    options: {
      decisionPaths: decisionPaths.map(normalizeWorkspacePath),
      embeddingDirs: embeddingDirs.map(normalizeWorkspacePath),
      excludeManualIds: [...excludeManualIds],
      labelDir: normalizeWorkspacePath(labelDir),
      manualIds: manualIds ? [...manualIds] : null,
      outputDir: normalizeWorkspacePath(outputDir),
    },
    perManual: summarizePairsByManual(pairs, threshold),
    primaryScore: PRIMARY_SCORE_NAME,
    skippedPairs: {
      byReason: countBy(skippedPairs, (pair) => pair.reason),
      count: skippedPairs.length,
    },
    threshold,
    thresholdEpsilon: THRESHOLD_EPSILON,
    totals: summarizePairs(pairs, threshold),
    version: PAIR_SCORE_VERSION,
  }
}

function summarizePairsByManual(
  pairs: readonly ScoredEmbeddingPair[],
  threshold: number,
): Record<string, PairScoreTotals> {
  const manualIds = [...new Set(pairs.map((pair) => pair.manualId))].sort()
  const result: Record<string, PairScoreTotals> = {}

  for (const manualId of manualIds) {
    result[manualId] = summarizePairs(pairs.filter((pair) => pair.manualId === manualId), threshold)
  }

  return result
}

function summarizePairs(
  pairs: readonly ScoredEmbeddingPair[],
  threshold: number,
  mode: ScoreMode = PRIMARY_SCORE_NAME,
): PairScoreTotals {
  let falsePositivePairs = 0
  let hardNegativeFalsePositivePairs = 0
  let matchedPositivePairs = 0
  let negativePairs = 0
  let positivePairs = 0

  for (const pair of pairs) {
    const score = scorePairForMode(pair, mode)
    const matched = score !== null && score >= threshold

    if (pair.target === 1) {
      positivePairs += 1
      matchedPositivePairs += matched ? 1 : 0
      continue
    }

    negativePairs += 1
    falsePositivePairs += matched ? 1 : 0
    hardNegativeFalsePositivePairs += matched && pair.kind === "hard-negative" ? 1 : 0
  }

  return {
    falsePositivePairs,
    hardNegativeFalsePositivePairs,
    matchedPositivePairs,
    missedPositivePairs: positivePairs - matchedPositivePairs,
    negativePairs,
    positivePairs,
    recall: positivePairs === 0 ? 0 : matchedPositivePairs / positivePairs,
    scoredPairs: pairs.length,
  }
}

function evaluateHoldout(
  pairs: readonly ScoredEmbeddingPair[],
  mode: ScoreMode = PRIMARY_SCORE_NAME,
): HoldoutScore {
  const manuals = [...new Set(pairs.map((pair) => pair.manualId))].sort().map((manualId) => {
    const trainingPairs = pairs.filter((pair) => pair.manualId !== manualId)
    const holdoutPairs = pairs.filter((pair) => pair.manualId === manualId)

    if (holdoutPairs.length === 0) {
      return unavailableHoldout(manualId, "no-holdout-pairs")
    }

    if (!trainingPairs.some((pair) => pair.target === 0)) {
      return unavailableHoldout(manualId, "no-training-negatives")
    }

    const threshold = chooseZeroFalsePositiveThresholdForMode(trainingPairs, mode)

    return {
      available: true,
      manualId,
      threshold,
      totals: summarizePairs(holdoutPairs, threshold, mode),
    } satisfies HoldoutManualScore
  })

  return {
    manuals,
    totals: manuals
      .filter((manual) => manual.available)
      .reduce<PairScoreTotals>((totals, manual) => addPairScoreTotals(totals, manual.totals), emptyPairScoreTotals()),
  }
}

function unavailableHoldout(manualId: string, reason: string): HoldoutManualScore {
  return {
    available: false,
    manualId,
    reason,
    threshold: null,
    totals: emptyPairScoreTotals(),
  }
}

function emptyPairScoreTotals(): PairScoreTotals {
  return {
    falsePositivePairs: 0,
    hardNegativeFalsePositivePairs: 0,
    matchedPositivePairs: 0,
    missedPositivePairs: 0,
    negativePairs: 0,
    positivePairs: 0,
    recall: 0,
    scoredPairs: 0,
  }
}

function addPairScoreTotals(left: PairScoreTotals, right: PairScoreTotals): PairScoreTotals {
  const positivePairs = left.positivePairs + right.positivePairs
  const matchedPositivePairs = left.matchedPositivePairs + right.matchedPositivePairs

  return {
    falsePositivePairs: left.falsePositivePairs + right.falsePositivePairs,
    hardNegativeFalsePositivePairs: left.hardNegativeFalsePositivePairs + right.hardNegativeFalsePositivePairs,
    matchedPositivePairs,
    missedPositivePairs: left.missedPositivePairs + right.missedPositivePairs,
    negativePairs: left.negativePairs + right.negativePairs,
    positivePairs,
    recall: positivePairs === 0 ? 0 : matchedPositivePairs / positivePairs,
    scoredPairs: left.scoredPairs + right.scoredPairs,
  }
}

function renderScoreIndexHtml({
  input,
  outputDir,
  pairs,
  skippedPairs,
  summary,
  sweep,
  threshold,
}: {
  input: EmbeddingInput
  outputDir: string
  pairs: readonly ScoredEmbeddingPair[]
  skippedPairs: readonly SkippedPair[]
  summary: EmbeddingScoreSummary
  sweep: readonly ScoreModeResult[]
  threshold: number
}): string {
  const holdoutFalsePositives = selectHoldoutFalsePositives(summary, pairs)
  const reviewedHoldoutFalsePositives = holdoutFalsePositives.filter(isReviewedPair)
  const unreviewedHoldoutFalsePositives = holdoutFalsePositives.filter((pair) => !isReviewedPair(pair))
  const falsePositives = pairs
    .filter((pair) => pair.target === 0 && pair.primaryScore >= threshold && !isReviewedPair(pair))
    .sort(sortPairsByDanger)
    .slice(0, DIAGNOSTIC_PAIR_LIMIT)
  const dangerousNegatives = pairs
    .filter((pair) => pair.target === 0 && pair.primaryScore < threshold && !isReviewedPair(pair))
    .sort(sortPairsByDanger)
    .slice(0, DIAGNOSTIC_PAIR_LIMIT)
  const missedPositives = pairs
    .filter((pair) => pair.target === 1 && pair.primaryScore < threshold && !isReviewedPair(pair))
    .sort(sortPairsByDanger)
    .slice(0, DIAGNOSTIC_PAIR_LIMIT)
  const reviewPairs = collectReviewPairs([
    reviewedHoldoutFalsePositives,
    unreviewedHoldoutFalsePositives,
    falsePositives,
    dangerousNegatives,
    missedPositives,
  ])
  const sourceReport = normalizeWorkspacePath(path.join(outputDir, "summary.json"))

  return `<!doctype html>
<meta charset="utf-8">
<title>Part match embedding score</title>
<style>
body { color: #0f172a; font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; }
.toolbar { align-items: center; background: #f8fafc; border: 1px solid #d7ded7; border-radius: 8px; display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0; padding: 12px; position: sticky; top: 0; z-index: 1; }
.toolbar button, .review-actions button { background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; color: #0f172a; cursor: pointer; font: inherit; padding: 6px 10px; }
.toolbar button:hover, .review-actions button:hover { border-color: #64748b; }
.toolbar button[aria-pressed="true"] { background: #0f172a; border-color: #0f172a; color: #fff; }
.toolbar .danger { color: #b91c1c; }
.filter-group { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; }
.filter-label { color: #475569; font-size: 12px; font-weight: 700; text-transform: uppercase; }
.grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); }
.pair { border: 1px solid #d7ded7; border-radius: 8px; padding: 12px; }
.pair.is-hidden, .pair-section.is-hidden { display: none; }
.pair[data-review-status="same"] { border-color: #16a34a; box-shadow: inset 4px 0 0 #16a34a; }
.pair[data-review-status="different"] { border-color: #dc2626; box-shadow: inset 4px 0 0 #dc2626; }
.pair[data-review-status="not-sure"] { border-color: #ca8a04; box-shadow: inset 4px 0 0 #ca8a04; }
.parts { display: grid; gap: 8px; grid-template-columns: 1fr 1fr; }
.part { align-items: center; display: grid; gap: 8px; grid-template-columns: 72px 1fr; min-width: 0; }
.part img { background: #f8fafc; border: 1px solid #d7ded7; max-height: 64px; max-width: 64px; object-fit: contain; }
.meta { color: #475569; font-size: 12px; overflow-wrap: anywhere; }
.review-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 12px; }
.review-actions button[aria-pressed="true"] { color: #fff; }
.review-actions button[data-review-status="same"][aria-pressed="true"] { background: #16a34a; border-color: #16a34a; }
.review-actions button[data-review-status="different"][aria-pressed="true"] { background: #dc2626; border-color: #dc2626; }
.review-actions button[data-review-status="not-sure"][aria-pressed="true"] { background: #ca8a04; border-color: #ca8a04; }
.score { font-weight: 700; }
code { font-size: 12px; }
</style>
<h1>Part match embedding score</h1>
<p>${escapeHtml(summary.modelIds.join(", ") || "unknown model")} · threshold ${formatScore(threshold)} · ${summary.totals.matchedPositivePairs}/${summary.totals.positivePairs} positives · ${summary.totals.falsePositivePairs} false positives · ${summary.totals.hardNegativeFalsePositivePairs} hard-negative false positives · holdout ${summary.holdout.totals.falsePositivePairs} false positives</p>
<p class="meta">Skipped pairs: ${skippedPairs.length} ${escapeHtml(JSON.stringify(summary.skippedPairs.byReason))}</p>
<p class="meta">Review queues hide already-reviewed decision pairs. Reviewed holdout blockers remain visible with their existing decision preselected because they explain why the scorer is not promotable.</p>
<div class="toolbar">
  <strong>Review decisions</strong>
  <span id="review-counts" class="meta">0 marked</span>
  <div class="filter-group" aria-label="Review status filter">
    <span class="filter-label">Show</span>
    <button type="button" data-review-filter="pending">Needs review</button>
    <button type="button" data-review-filter="reviewed">Reviewed</button>
    <button type="button" data-review-filter="all">All</button>
  </div>
  <div class="filter-group" aria-label="Queue filter">
    <span class="filter-label">Queue</span>
    <button type="button" data-section-filter="all">All</button>
    <button type="button" data-section-filter="holdout-blockers">Holdout blockers</button>
    <button type="button" data-section-filter="holdout-false-positives">Holdout FP</button>
    <button type="button" data-section-filter="false-positives">FP</button>
    <button type="button" data-section-filter="dangerous-negatives">Negatives</button>
    <button type="button" data-section-filter="missed-positives">Misses</button>
  </div>
  <button id="download-decisions" type="button">Download decisions</button>
  <button id="clear-decisions" class="danger" type="button">Clear decisions</button>
</div>
${renderSweepTable(sweep)}
${renderPairSection("Reviewed holdout blockers", "holdout-blockers", reviewedHoldoutFalsePositives, input, outputDir)}
${renderPairSection("Unreviewed holdout false positives", "holdout-false-positives", unreviewedHoldoutFalsePositives, input, outputDir)}
${renderPairSection("Unreviewed false positives", "false-positives", falsePositives, input, outputDir)}
${renderPairSection("Closest unreviewed negatives", "dangerous-negatives", dangerousNegatives, input, outputDir)}
${renderPairSection("Missed unreviewed positives", "missed-positives", missedPositives, input, outputDir)}
<script id="pair-review-data" type="application/json">${serializeScriptJson({
    generatedAt: summary.generatedAt,
    pairs: reviewPairs,
    sourceReport,
  })}</script>
<script>${renderReviewScript()}</script>
`
}

function renderSweepTable(sweep: readonly ScoreModeResult[]): string {
  return `<h2>Score mode sweep</h2>
<table>
  <thead>
    <tr>
      <th>Mode</th>
      <th>Threshold</th>
      <th>Train positives</th>
      <th>Train FP</th>
      <th>Hard-negative FP</th>
      <th>Holdout positives</th>
      <th>Holdout FP</th>
    </tr>
  </thead>
  <tbody>
    ${sweep.map((result) => `<tr>
      <td>${escapeHtml(result.mode)}</td>
      <td>${formatScore(result.threshold)}</td>
      <td>${result.totals.matchedPositivePairs}/${result.totals.positivePairs}</td>
      <td>${result.totals.falsePositivePairs}</td>
      <td>${result.totals.hardNegativeFalsePositivePairs}</td>
      <td>${result.holdout.totals.matchedPositivePairs}/${result.holdout.totals.positivePairs}</td>
      <td>${result.holdout.totals.falsePositivePairs}</td>
    </tr>`).join("\n")}
  </tbody>
</table>`
}

function selectHoldoutFalsePositives(
  summary: EmbeddingScoreSummary,
  pairs: readonly ScoredEmbeddingPair[],
): ScoredEmbeddingPair[] {
  const thresholdsByManual = new Map(summary.holdout.manuals
    .filter((manual): manual is HoldoutManualScore & { threshold: number } =>
      manual.available && typeof manual.threshold === "number")
    .map((manual) => [manual.manualId, manual.threshold]))

  return pairs
    .filter((pair) =>
      pair.target === 0 &&
      pair.primaryScore >= (thresholdsByManual.get(pair.manualId) ?? Number.POSITIVE_INFINITY)
    )
    .sort(sortPairsByDanger)
    .slice(0, DIAGNOSTIC_PAIR_LIMIT)
}

function renderPairSection(
  title: string,
  sectionKey: string,
  pairs: readonly ScoredEmbeddingPair[],
  input: EmbeddingInput,
  outputDir: string,
): string {
  return `<section class="pair-section" data-section="${escapeAttribute(sectionKey)}">
<h2>${escapeHtml(title)} (${pairs.length})</h2>
<div class="grid">
${pairs.map((pair) => renderPairCard(pair, input, outputDir)).join("\n")}
</div>
</section>`
}

function renderPairCard(
  pair: ScoredEmbeddingPair,
  input: EmbeddingInput,
  outputDir: string,
): string {
  const left = input.rowsByItemKey.get(createItemKey(pair.manualId, pair.leftItemId))
  const right = input.rowsByItemKey.get(createItemKey(pair.manualId, pair.rightItemId))
  const reviewId = createReviewPairId(pair)
  const initialStatus = isReviewedPair(pair) ? targetToReviewStatus(pair.target) : null
  const initialStatusAttribute = initialStatus
    ? ` data-initial-review-status="${initialStatus}"`
    : ""

  return `<article class="pair" data-pair-id="${escapeAttribute(reviewId)}"${initialStatusAttribute}>
  <p class="score">${escapeHtml(pair.manualId)} · ${escapeHtml(pair.kind)} · ${formatScore(pair.primaryScore)}</p>
  <p class="meta">${escapeHtml(pair.source)} · ${escapeHtml(JSON.stringify(pair.scores))}</p>
  <div class="review-actions">
    <button type="button" data-review-status="same">Same</button>
    <button type="button" data-review-status="different">Different</button>
    <button type="button" data-review-status="not-sure">Not sure</button>
  </div>
  <div class="parts">
    ${renderPartCard(left, outputDir)}
    ${renderPartCard(right, outputDir)}
  </div>
</article>`
}

function collectReviewPairs(sections: readonly (readonly ScoredEmbeddingPair[])[]): ReviewPairRecord[] {
  const pairs = new Map<string, ReviewPairRecord>()

  for (const section of sections) {
    for (const pair of section) {
      const id = createReviewPairId(pair)

      if (!pairs.has(id)) {
        pairs.set(id, {
          id,
          initialStatus: isReviewedPair(pair) ? targetToReviewStatus(pair.target) : null,
          kind: pair.kind,
          left: pair.leftItemId,
          manualId: pair.manualId,
          right: pair.rightItemId,
          score: pair.primaryScore,
          scores: pair.scores,
          source: pair.source,
          target: pair.target,
        })
      }
    }
  }

  return [...pairs.values()]
}

function createReviewPairId(pair: Pick<ScoredEmbeddingPair, "leftItemId" | "manualId" | "rightItemId">): string {
  return Buffer
    .from(JSON.stringify([pair.manualId, pair.leftItemId, pair.rightItemId]))
    .toString("base64url")
}

function isReviewedPair(pair: ScoredEmbeddingPair): boolean {
  return pair.source.startsWith("decision:")
}

function targetToReviewStatus(target: PairTarget): "different" | "same" {
  return target === 1 ? "same" : "different"
}

function serializeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029")
}

function renderReviewScript(): string {
  return `(() => {
  const dataElement = document.getElementById("pair-review-data");
  const reviewData = dataElement ? JSON.parse(dataElement.textContent || "{}") : {};
  const sourceReport = reviewData.sourceReport || "unknown-report";
  const storageKey = "bag-it:part-match-embedding-score-decisions:" + sourceReport;
  const filterStorageKey = storageKey + ":filters";
  const pairsById = new Map((reviewData.pairs || []).map((pair) => [pair.id, pair]));
  let memoryDecisions = {};
  let memoryFilters = { review: "pending", section: "all" };

  function readStorage() {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  function readDecisions() {
    const storage = readStorage();
    if (!storage) {
      return memoryDecisions;
    }

    try {
      return JSON.parse(storage.getItem(storageKey) || "{}");
    } catch {
      return memoryDecisions;
    }
  }

  function writeDecisions(decisions) {
    memoryDecisions = decisions;
    const storage = readStorage();
    if (storage) {
      storage.setItem(storageKey, JSON.stringify(decisions));
    }
  }

  function readFilters() {
    const storage = readStorage();
    if (!storage) {
      return memoryFilters;
    }

    try {
      return { ...memoryFilters, ...JSON.parse(storage.getItem(filterStorageKey) || "{}") };
    } catch {
      return memoryFilters;
    }
  }

  function writeFilters(filters) {
    memoryFilters = { ...memoryFilters, ...filters };
    const storage = readStorage();
    if (storage) {
      storage.setItem(filterStorageKey, JSON.stringify(memoryFilters));
    }
  }

  function shouldShowCard(card, decisions, filters) {
    const explicitStatus = decisions[card.dataset.pairId] || "";
    const initialStatus = card.dataset.initialReviewStatus || "";

    if (filters.review === "pending") {
      return !explicitStatus;
    }

    if (filters.review === "reviewed") {
      return Boolean(explicitStatus || initialStatus);
    }

    return true;
  }

  function updateUi() {
    const decisions = readDecisions();
    const filters = readFilters();
    let same = 0;
    let different = 0;
    let notSure = 0;

    for (const card of document.querySelectorAll("[data-pair-id]")) {
      const status = decisions[card.dataset.pairId] || card.dataset.initialReviewStatus || "";
      card.dataset.reviewStatus = status;

      for (const button of card.querySelectorAll("[data-review-status]")) {
        button.setAttribute("aria-pressed", String(button.dataset.reviewStatus === status));
      }

      card.classList.toggle("is-hidden", !shouldShowCard(card, decisions, filters));
    }

    for (const section of document.querySelectorAll("[data-section]")) {
      const sectionMatches = filters.section === "all" || section.dataset.section === filters.section;
      const visibleCards = Array.from(section.querySelectorAll("[data-pair-id]"))
        .some((card) => !card.classList.contains("is-hidden"));
      section.classList.toggle("is-hidden", !sectionMatches || !visibleCards);
    }

    for (const button of document.querySelectorAll("[data-review-filter]")) {
      button.setAttribute("aria-pressed", String(button.dataset.reviewFilter === filters.review));
    }

    for (const button of document.querySelectorAll("[data-section-filter]")) {
      button.setAttribute("aria-pressed", String(button.dataset.sectionFilter === filters.section));
    }

    for (const card of document.querySelectorAll("[data-pair-id]")) {
      const status = decisions[card.dataset.pairId] || card.dataset.initialReviewStatus || "";
      same += status === "same" ? 1 : 0;
      different += status === "different" ? 1 : 0;
      notSure += status === "not-sure" ? 1 : 0;
    }

    const countElement = document.getElementById("review-counts");
    if (countElement) {
      countElement.textContent = same + " same · " + different + " different · " + notSure + " not sure";
    }
  }

  function downloadDecisions() {
    const decisions = readDecisions();
    const rows = Array.from(pairsById.values())
      .map((pair) => ({ pair, status: decisions[pair.id] || pair.initialStatus }))
      .filter((entry) => entry.pair && entry.status)
      .map((entry) => ({
        kind: entry.pair.kind,
        left: entry.pair.left,
        manualId: entry.pair.manualId,
        right: entry.pair.right,
        score: entry.pair.score,
        source: entry.pair.source,
        status: entry.status,
        target: entry.pair.target,
      }));
    const payload = {
      decisions: rows,
      generatedAt: new Date().toISOString(),
      sourceGeneratedAt: reviewData.generatedAt,
      sourceReport,
      type: "part-match-embedding-score-decisions",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2) + "\\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "part-match-embedding-score-decisions-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
    link.click();
    URL.revokeObjectURL(url);
  }

  document.addEventListener("click", (event) => {
    const reviewButton = event.target.closest("[data-review-status]");
    if (reviewButton) {
      const card = reviewButton.closest("[data-pair-id]");
      if (!card) {
        return;
      }

      const decisions = readDecisions();
      const status = reviewButton.dataset.reviewStatus;
      if (decisions[card.dataset.pairId] === status) {
        delete decisions[card.dataset.pairId];
      } else {
        decisions[card.dataset.pairId] = status;
      }
      writeDecisions(decisions);
      updateUi();
      return;
    }

    const reviewFilterButton = event.target.closest("[data-review-filter]");
    if (reviewFilterButton) {
      writeFilters({ review: reviewFilterButton.dataset.reviewFilter });
      updateUi();
      return;
    }

    const sectionFilterButton = event.target.closest("[data-section-filter]");
    if (sectionFilterButton) {
      writeFilters({ section: sectionFilterButton.dataset.sectionFilter });
      updateUi();
      return;
    }

    if (event.target.id === "download-decisions") {
      downloadDecisions();
      return;
    }

    if (event.target.id === "clear-decisions" && confirm("Clear local review decisions for this report?")) {
      memoryDecisions = {};
      const storage = readStorage();
      if (storage) {
        storage.removeItem(storageKey);
      }
      updateUi();
    }
  });

  updateUi();
})();`
}

function renderPartCard(row: PartMatchEmbeddingRow | undefined, outputDir: string): string {
  if (!row) {
    return `<div class="part"><div></div><p class="meta">missing row</p></div>`
  }

  const imagePath = row.variants.rendered?.path
  const imageHtml = imagePath
    ? `<img src="${escapeAttribute(path.relative(path.resolve(outputDir), path.resolve(imagePath)))}" alt="">`
    : ""

  return `<div class="part">
  ${imageHtml}
  <div>
    <div>${escapeHtml(row.itemId)}</div>
    <div class="meta">${escapeHtml(row.bagId ?? "?")} · ${escapeHtml(row.calloutId ?? "?")} · p${row.pageNumber ?? "?"} · step ${row.stepIndex ?? "?"}</div>
  </div>
</div>`
}

function sortPairsByDanger(left: ScoredEmbeddingPair, right: ScoredEmbeddingPair): number {
  return right.primaryScore - left.primaryScore || left.manualId.localeCompare(right.manualId)
}

function dotProduct(left: readonly number[], right: readonly number[]): number {
  let total = 0

  for (let index = 0; index < left.length; index += 1) {
    total += (left[index] ?? 0) * (right[index] ?? 0)
  }

  return total
}

function createItemKey(manualId: string, itemId: string): string {
  return `${manualId}\0${itemId}`
}

function createPairKey(manualId: string, left: string, right: string): string {
  const [sortedLeft, sortedRight] = sortPair(left, right)
  return `${manualId}\0${sortedLeft}\0${sortedRight}`
}

function sortPair(left: string, right: string): [string, string] {
  return left.localeCompare(right) <= 0 ? [left, right] : [right, left]
}

function countBy<T>(values: readonly T[], keyForValue: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {}

  for (const value of values) {
    const key = keyForValue(value)
    counts[key] = (counts[key] ?? 0) + 1
  }

  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
}

function formatScore(value: number): string {
  return value.toFixed(6)
}

function timestampForPath(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-")
}

function normalizeWorkspacePath(filePath: string): string {
  return path.relative(process.cwd(), path.resolve(filePath)) || "."
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
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
  return value
    ? value.split(",").map((entry) => entry.trim()).filter(Boolean)
    : []
}

function parseOptionalList(value: string | null): string[] | null {
  const values = parseList(value)

  return values.length > 0 ? values : null
}

async function runCli(): Promise<void> {
  const argv = process.argv.slice(2)
  const embeddingDirs = parseList(readOption(argv, "--embedding-dir"))

  const result = await scorePartMatchEmbeddings({
    decisionPaths: parseList(readOption(argv, "--decision-paths")),
    embeddingDirs,
    excludeManualIds: parseList(readOption(argv, "--exclude-manual-ids")),
    labelDir: readOption(argv, "--label-dir") ?? DEFAULT_LABEL_DIR,
    manualIds: parseOptionalList(readOption(argv, "--manual-ids")),
    outputDir: readOption(argv, "--output-dir") ?? undefined,
  })

  console.log(`Part-match embedding score: ${result.summary.totals.matchedPositivePairs}/${result.summary.totals.positivePairs} positives`)
  console.log(`False positives: ${result.summary.totals.falsePositivePairs}`)
  console.log(`Hard-negative false positives: ${result.summary.totals.hardNegativeFalsePositivePairs}`)
  console.log(`Holdout false positives: ${result.summary.holdout.totals.falsePositivePairs}`)
  console.log(`Summary: ${result.summaryPath}`)
  console.log(`Pairs: ${result.pairsPath}`)
  console.log(`Index: ${result.indexPath}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
