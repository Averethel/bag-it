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
const CATALOGUE_RETRIEVAL_VERSION = "0.1.0"
const SAFE_THRESHOLD_EPSILON = 0.000001
const DIAGNOSTIC_LIMIT = 120
const VARIANT_NAMES: readonly PartMatchEmbeddingVariantName[] = [
  "rendered",
  "tight-rendered",
  "neutral-mask",
  "silhouette",
]

type CatalogueMode = "label-exemplars"
type RetrievalScoreMode = "mean" | "rendered-tight-min"

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
}

interface LabelSet {
  labelPath: string
  labels: LabelRow[]
  manualId: string
  reportPath: string
  status: "active" | "gate"
}

interface LabelRow {
  expectedPartKey: string
  itemId: string
  role: "active" | "gate" | "excluded"
}

interface LabelledRow {
  expectedPartKey: string
  labelPath: string
  row: PartMatchEmbeddingRow
}

interface CatalogueCandidate {
  candidateId: string
  expectedPartKey: string
  row: PartMatchEmbeddingRow
  source: string
}

interface RetrievalScores {
  max: number
  mean: number
  min: number
  neutralMask: number | null
  rendered: number | null
  silhouette: number | null
  tightRendered: number | null
}

interface RetrievalNeighbor {
  candidateId: string
  expectedPartKey: string
  imagePath: string | null
  itemId: string
  rowKey: string
  score: number
  scores: RetrievalScores
}

interface RetrievalPrediction {
  expectedPartKey: string
  imagePath: string | null
  itemId: string
  labelPath: string
  manualId: string
  rowKey: string
  top: RetrievalNeighbor | null
  topK: RetrievalNeighbor[]
}

interface SkippedRetrievalRow {
  itemId: string
  manualId: string
  reason: string
}

interface RetrievalSummary {
  durationMs: number
  generatedAt: string
  modelIds: string[]
  options: {
    embeddingDirs: string[]
    excludeManualIds: string[]
    labelDir: string
    manualIds: string[] | null
    mode: CatalogueMode
    outputDir: string
    scoreMode: RetrievalScoreMode
    topK: number
  }
  safeThreshold: number | null
  totals: {
    candidateCount: number
    eligibleRows: number
    safeCorrectRows: number
    safeRecall: number
    skippedRows: number
    top1Accuracy: number
    top1CorrectRows: number
    top1WrongRows: number
  }
  skippedRows: {
    byReason: Record<string, number>
    count: number
  }
  version: string
}

export interface RunPartMatchCatalogueRetrievalOptions {
  embeddingDirs: string[]
  excludeManualIds?: string[]
  generatedAt?: Date
  labelDir?: string
  manualIds?: string[] | null
  mode?: CatalogueMode
  outputDir?: string
  scoreMode?: RetrievalScoreMode
  topK?: number
}

export interface RunPartMatchCatalogueRetrievalResult {
  indexPath: string
  outputDir: string
  predictionsPath: string
  summary: RetrievalSummary
  summaryPath: string
}

export async function runPartMatchCatalogueRetrieval(
  options: RunPartMatchCatalogueRetrievalOptions,
): Promise<RunPartMatchCatalogueRetrievalResult> {
  if (options.embeddingDirs.length === 0) {
    throw new Error("At least one embedding cache directory is required.")
  }

  const startedAt = Date.now()
  const generatedAt = options.generatedAt ?? new Date()
  const outputDir = options.outputDir ?? path.join(DEFAULT_OUTPUT_ROOT, `${timestampForPath(generatedAt)}-catalogue-retrieval`)
  const labelDir = options.labelDir ?? DEFAULT_LABEL_DIR
  const manualIds = options.manualIds ?? null
  const excludeManualIds = options.excludeManualIds ?? []
  const mode = options.mode ?? "label-exemplars"
  const scoreMode = options.scoreMode ?? "rendered-tight-min"
  const topK = options.topK ?? 10
  const input = await readEmbeddingInputs(options.embeddingDirs)
  const labelSets = filterLabelSets(await readLabelSets(labelDir), { excludeManualIds, manualIds })
  const labelledRows = createLabelledRows({ input, labelSets })
  const candidates = createLabelExemplarCatalogue(labelledRows)
  const { predictions, skippedRows } = createPredictions({
    candidates,
    input,
    labelledRows,
    scoreMode,
    topK,
  })
  const summary = createSummary({
    candidates,
    durationMs: Date.now() - startedAt,
    embeddingDirs: options.embeddingDirs,
    excludeManualIds,
    generatedAt,
    input,
    labelDir,
    manualIds,
    mode,
    outputDir,
    predictions,
    scoreMode,
    skippedRows,
    topK,
  })

  await mkdir(outputDir, { recursive: true })
  const predictionsPath = path.join(outputDir, "predictions.json")
  const summaryPath = path.join(outputDir, "summary.json")
  const indexPath = path.join(outputDir, "index.html")

  await writeJson(predictionsPath, {
    generatedAt: generatedAt.toISOString(),
    predictions,
    skippedRows,
    version: CATALOGUE_RETRIEVAL_VERSION,
  })
  await writeJson(summaryPath, summary)
  await writeFile(indexPath, renderIndexHtml({
    candidates,
    outputDir,
    predictions,
    summary,
  }))

  return {
    indexPath,
    outputDir,
    predictionsPath,
    summary,
    summaryPath,
  }
}

async function readEmbeddingInputs(embeddingDirs: readonly string[]): Promise<EmbeddingInput> {
  const rowsByItemKey = new Map<string, PartMatchEmbeddingRow>()
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
      labels: parsed.labels.map((label, index) => normalizeLabelRow(label, { index, labelPath })),
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
    index,
    labelPath,
  }: {
    index: number
    labelPath: string
  },
): LabelRow {
  const role = label.role ?? "active"

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
    expectedPartKey: label.expectedPartKey ?? "",
    itemId: label.itemId,
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

function createLabelledRows({
  input,
  labelSets,
}: {
  input: EmbeddingInput
  labelSets: readonly LabelSet[]
}): LabelledRow[] {
  const labelledRows: LabelledRow[] = []

  for (const labelSet of labelSets) {
    for (const label of labelSet.labels) {
      if (label.role === "excluded" || !label.expectedPartKey) {
        continue
      }

      const row = input.rowsByItemKey.get(createItemKey(labelSet.manualId, label.itemId))

      if (!row) {
        continue
      }

      labelledRows.push({
        expectedPartKey: label.expectedPartKey,
        labelPath: labelSet.labelPath,
        row,
      })
    }
  }

  return labelledRows
}

function createLabelExemplarCatalogue(labelledRows: readonly LabelledRow[]): CatalogueCandidate[] {
  return labelledRows.map((entry) => ({
    candidateId: [
      entry.row.manualId,
      entry.expectedPartKey,
      entry.row.itemId,
    ].join("::"),
    expectedPartKey: entry.expectedPartKey,
    row: entry.row,
    source: "label-exemplar",
  }))
}

function createPredictions({
  candidates,
  input,
  labelledRows,
  scoreMode,
  topK,
}: {
  candidates: readonly CatalogueCandidate[]
  input: EmbeddingInput
  labelledRows: readonly LabelledRow[]
  scoreMode: RetrievalScoreMode
  topK: number
}): {
  predictions: RetrievalPrediction[]
  skippedRows: SkippedRetrievalRow[]
} {
  const predictions: RetrievalPrediction[] = []
  const skippedRows: SkippedRetrievalRow[] = []
  const groupSizes = countGroups(labelledRows)

  for (const query of labelledRows) {
    if ((groupSizes.get(createGroupKey(query.row.manualId, query.expectedPartKey)) ?? 0) < 2) {
      skippedRows.push({
        itemId: query.row.itemId,
        manualId: query.row.manualId,
        reason: "singleton-expected-key",
      })
      continue
    }

    const neighbors = candidates
      .filter((candidate) =>
        candidate.row.manualId === query.row.manualId &&
        candidate.row.itemId !== query.row.itemId &&
        colorsAreCompatible(readPartMatchColor(query.row.color), readPartMatchColor(candidate.row.color))
      )
      .map((candidate) => {
        const scores = scoreRows(query.row, candidate.row, input.embeddings)

        if (!scores) {
          return null
        }

        return {
          candidateId: candidate.candidateId,
          expectedPartKey: candidate.expectedPartKey,
          imagePath: candidate.row.variants.rendered?.path ?? null,
          itemId: candidate.row.itemId,
          rowKey: candidate.row.rowKey,
          score: scoreForMode(scores, scoreMode),
          scores,
        } satisfies RetrievalNeighbor
      })
      .filter((neighbor): neighbor is RetrievalNeighbor => neighbor !== null)
      .sort((left, right) => right.score - left.score)

    if (neighbors.length === 0) {
      skippedRows.push({
        itemId: query.row.itemId,
        manualId: query.row.manualId,
        reason: "no-scored-candidates",
      })
      continue
    }

    predictions.push({
      expectedPartKey: query.expectedPartKey,
      imagePath: query.row.variants.rendered?.path ?? null,
      itemId: query.row.itemId,
      labelPath: query.labelPath,
      manualId: query.row.manualId,
      rowKey: query.row.rowKey,
      top: neighbors[0] ?? null,
      topK: neighbors.slice(0, topK),
    })
  }

  return {
    predictions,
    skippedRows,
  }
}

function countGroups(labelledRows: readonly LabelledRow[]): Map<string, number> {
  const counts = new Map<string, number>()

  for (const row of labelledRows) {
    const key = createGroupKey(row.row.manualId, row.expectedPartKey)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return counts
}

function scoreRows(
  left: PartMatchEmbeddingRow,
  right: PartMatchEmbeddingRow,
  embeddings: ReadonlyMap<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>>,
): RetrievalScores | null {
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

function scoreForMode(scores: RetrievalScores, scoreMode: RetrievalScoreMode): number {
  if (scoreMode === "rendered-tight-min") {
    const scoreValues = [scores.rendered, scores.tightRendered].filter((score): score is number => score !== null)

    return scoreValues.length === 0 ? Number.NEGATIVE_INFINITY : Math.min(...scoreValues)
  }

  return scores.mean
}

function createSummary({
  candidates,
  durationMs,
  embeddingDirs,
  excludeManualIds,
  generatedAt,
  input,
  labelDir,
  manualIds,
  mode,
  outputDir,
  predictions,
  scoreMode,
  skippedRows,
  topK,
}: {
  candidates: readonly CatalogueCandidate[]
  durationMs: number
  embeddingDirs: readonly string[]
  excludeManualIds: readonly string[]
  generatedAt: Date
  input: EmbeddingInput
  labelDir: string
  manualIds: readonly string[] | null
  mode: CatalogueMode
  outputDir: string
  predictions: readonly RetrievalPrediction[]
  scoreMode: RetrievalScoreMode
  skippedRows: readonly SkippedRetrievalRow[]
  topK: number
}): RetrievalSummary {
  const top1CorrectRows = predictions.filter((prediction) =>
    prediction.top?.expectedPartKey === prediction.expectedPartKey
  ).length
  const top1WrongRows = predictions.length - top1CorrectRows
  const safeThreshold = chooseSafeThreshold(predictions)
  const safeCorrectRows = safeThreshold === null
    ? 0
    : predictions.filter((prediction) =>
      prediction.top?.expectedPartKey === prediction.expectedPartKey &&
      prediction.top.score >= safeThreshold
    ).length

  return {
    durationMs,
    generatedAt: generatedAt.toISOString(),
    modelIds: input.modelIds,
    options: {
      embeddingDirs: [...embeddingDirs],
      excludeManualIds: [...excludeManualIds],
      labelDir,
      manualIds: manualIds ? [...manualIds] : null,
      mode,
      outputDir: normalizeWorkspacePath(outputDir),
      scoreMode,
      topK,
    },
    safeThreshold,
    skippedRows: {
      byReason: countBy(skippedRows, (row) => row.reason),
      count: skippedRows.length,
    },
    totals: {
      candidateCount: candidates.length,
      eligibleRows: predictions.length,
      safeCorrectRows,
      safeRecall: predictions.length === 0 ? 0 : safeCorrectRows / predictions.length,
      skippedRows: skippedRows.length,
      top1Accuracy: predictions.length === 0 ? 0 : top1CorrectRows / predictions.length,
      top1CorrectRows,
      top1WrongRows,
    },
    version: CATALOGUE_RETRIEVAL_VERSION,
  }
}

function chooseSafeThreshold(predictions: readonly RetrievalPrediction[]): number | null {
  const wrongScores = predictions
    .filter((prediction) => prediction.top && prediction.top.expectedPartKey !== prediction.expectedPartKey)
    .map((prediction) => prediction.top?.score)
    .filter((score): score is number => typeof score === "number")

  if (wrongScores.length === 0) {
    return null
  }

  return Math.max(...wrongScores) + SAFE_THRESHOLD_EPSILON
}

function renderIndexHtml({
  outputDir,
  predictions,
  summary,
}: {
  candidates: readonly CatalogueCandidate[]
  outputDir: string
  predictions: readonly RetrievalPrediction[]
  summary: RetrievalSummary
}): string {
  const wrong = predictions
    .filter((prediction) => prediction.top && prediction.top.expectedPartKey !== prediction.expectedPartKey)
    .sort((left, right) => (right.top?.score ?? 0) - (left.top?.score ?? 0))
    .slice(0, DIAGNOSTIC_LIMIT)
  const safeThreshold = summary.safeThreshold ?? Number.POSITIVE_INFINITY
  const safeMisses = predictions
    .filter((prediction) =>
      prediction.top?.expectedPartKey === prediction.expectedPartKey &&
      prediction.top.score < safeThreshold
    )
    .sort((left, right) => (right.top?.score ?? 0) - (left.top?.score ?? 0))
    .slice(0, DIAGNOSTIC_LIMIT)

  return `<!doctype html>
<meta charset="utf-8">
<title>Part match catalogue retrieval</title>
<style>
body { color: #0f172a; font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; }
.grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(520px, 1fr)); }
.card { border: 1px solid #d7ded7; border-radius: 8px; padding: 12px; }
.parts { display: grid; gap: 8px; grid-template-columns: 1fr 1fr; }
.part { align-items: center; display: grid; gap: 8px; grid-template-columns: 72px 1fr; min-width: 0; }
.part img { background: #f8fafc; border: 1px solid #d7ded7; max-height: 64px; max-width: 64px; object-fit: contain; }
.meta { color: #475569; font-size: 12px; overflow-wrap: anywhere; }
.score { font-weight: 700; }
code { font-size: 12px; }
</style>
<h1>Part match catalogue retrieval</h1>
<p>${escapeHtml(summary.options.mode)} · ${escapeHtml(summary.options.scoreMode)} · ${summary.totals.top1CorrectRows}/${summary.totals.eligibleRows} top-1 correct · safe ${summary.totals.safeCorrectRows}/${summary.totals.eligibleRows} · ${summary.totals.top1WrongRows} top-1 wrong</p>
<p class="meta">This is a private catalogue-retrieval smoke test. In <code>label-exemplars</code> mode, labeled crops stand in for catalogue renders to test retrieval mechanics before real LDraw/catalogue images exist.</p>
<p class="meta">Safe threshold: ${summary.safeThreshold === null ? "none needed" : formatScore(summary.safeThreshold)} · skipped ${summary.skippedRows.count} ${escapeHtml(JSON.stringify(summary.skippedRows.byReason))}</p>
<h2>Dangerous wrong top-1 matches (${wrong.length})</h2>
<div class="grid">
${wrong.map((prediction) => renderPredictionCard(prediction)).join("\n")}
</div>
<h2>Correct but below safe threshold (${safeMisses.length})</h2>
<div class="grid">
${safeMisses.map((prediction) => renderPredictionCard(prediction)).join("\n")}
</div>
`
}

function renderPredictionCard(prediction: RetrievalPrediction): string {
  const top = prediction.top

  return `<article class="card">
  <p class="score">${escapeHtml(prediction.manualId)} · ${escapeHtml(prediction.expectedPartKey)} → ${escapeHtml(top?.expectedPartKey ?? "none")} · ${formatScore(top?.score ?? 0)}</p>
  <p class="meta">${escapeHtml(prediction.itemId)}</p>
  <div class="parts">
    ${renderPart({
      imagePath: prediction.imagePath,
      itemId: prediction.itemId,
      rowKey: prediction.rowKey,
    })}
    ${top ? renderPart({
      imagePath: top.imagePath,
      itemId: top.itemId,
      rowKey: top.rowKey,
    }) : "<div></div>"}
  </div>
  <p class="meta">${escapeHtml(JSON.stringify(top?.scores ?? {}))}</p>
</article>`
}

function renderPart({
  imagePath,
  itemId,
  rowKey,
}: {
  imagePath: string | null
  itemId: string
  rowKey: string
}): string {
  return `<div class="part">
  ${imagePath ? `<img src="${escapeAttribute(path.resolve(imagePath))}" alt="">` : "<div></div>"}
  <div>
    <p>${escapeHtml(itemId)}</p>
    <p class="meta">${escapeHtml(rowKey)}</p>
  </div>
</div>`
}

function dotProduct(left: readonly number[], right: readonly number[]): number {
  let total = 0

  for (let index = 0; index < left.length; index += 1) {
    total += (left[index] ?? 0) * (right[index] ?? 0)
  }

  return total
}

function readPartMatchColor(color: unknown): PartMatchColor | null {
  return color && typeof color === "object"
    ? color as PartMatchColor
    : null
}

function countBy<T>(items: readonly T[], getKey: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {}

  for (const item of items) {
    const key = getKey(item)
    counts[key] = (counts[key] ?? 0) + 1
  }

  return counts
}

function createGroupKey(manualId: string, expectedPartKey: string): string {
  return `${manualId}:${expectedPartKey}`
}

function createItemKey(manualId: string, itemId: string): string {
  return `${manualId}:${itemId}`
}

function writeJson(filePath: string, value: unknown): Promise<void> {
  return writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function formatScore(score: number): string {
  return score.toFixed(6)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;")
}

function normalizeWorkspacePath(filePath: string): string {
  return filePath.split(path.sep).join("/")
}

function timestampForPath(date: Date): string {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-")
}

function parseList(value: string | undefined): string[] {
  return value
    ? value.split(",").map((entry) => entry.trim()).filter(Boolean)
    : []
}

function parseCliArgs(argv: readonly string[]): RunPartMatchCatalogueRetrievalOptions {
  const options: RunPartMatchCatalogueRetrievalOptions = {
    embeddingDirs: [],
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === "--embedding-dir" && next) {
      options.embeddingDirs = parseList(next)
      index += 1
      continue
    }

    if (arg === "--exclude-manual-ids" && next) {
      options.excludeManualIds = parseList(next)
      index += 1
      continue
    }

    if (arg === "--label-dir" && next) {
      options.labelDir = next
      index += 1
      continue
    }

    if (arg === "--manual-ids" && next) {
      options.manualIds = parseList(next)
      index += 1
      continue
    }

    if (arg === "--mode" && next) {
      if (next !== "label-exemplars") {
        throw new Error(`Unsupported catalogue retrieval mode: ${next}`)
      }

      options.mode = next
      index += 1
      continue
    }

    if (arg === "--output-dir" && next) {
      options.outputDir = next
      index += 1
      continue
    }

    if (arg === "--score-mode" && next) {
      if (next !== "mean" && next !== "rendered-tight-min") {
        throw new Error(`Unsupported score mode: ${next}`)
      }

      options.scoreMode = next
      index += 1
      continue
    }

    if (arg === "--top-k" && next) {
      options.topK = Number.parseInt(next, 10)
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isMain) {
  runPartMatchCatalogueRetrieval(parseCliArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(`Part-match catalogue retrieval: ${result.summary.totals.top1CorrectRows}/${result.summary.totals.eligibleRows} top-1 correct`)
      console.log(`Safe recall: ${result.summary.totals.safeCorrectRows}/${result.summary.totals.eligibleRows}`)
      console.log(`Wrong top-1: ${result.summary.totals.top1WrongRows}`)
      console.log(`Summary: ${result.summaryPath}`)
      console.log(`Predictions: ${result.predictionsPath}`)
      console.log(`Index: ${result.indexPath}`)
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
}
