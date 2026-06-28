import { existsSync } from "node:fs"
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type {
  PartMatchEmbeddingRecord,
  PartMatchEmbeddingRow,
  PartMatchEmbeddingVariantName,
} from "./part-match-embedding-cache"

const DEFAULT_LDRAW_ROOT = "/Applications/Studio 2.0/ldraw"
const DEFAULT_OUTPUT_ROOT = path.join(
  ".bag-it",
  "private",
  "part-match-reports",
  "embedding-experiments",
)
const DEFAULT_FOLD_COUNT = 5
const DEFAULT_VARIANT: AttributeFeatureMode = "combined"
const ATTRIBUTE_SPIKE_VERSION = "0.1.0"
const NEIGHBOR_COUNT = 7
const COMMON_STUD_DIMENSIONS = [0.667, 1, 2, 3, 4, 6, 8, 10, 12, 16]
const VARIANT_NAMES: readonly PartMatchEmbeddingVariantName[] = [
  "rendered",
  "tight-rendered",
  "neutral-mask",
  "silhouette",
]
const ATTRIBUTE_NAMES = [
  "category",
  "footprint",
  "heightBand",
  "modifier",
  "signature",
] as const

type AttributeName = (typeof ATTRIBUTE_NAMES)[number]
type AttributeFeatureMode = PartMatchEmbeddingVariantName | "combined"

interface EmbeddingRowsFile {
  rows?: PartMatchEmbeddingRow[]
}

interface EmbeddingCacheFile {
  embeddings?: Record<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>>
  model?: {
    id?: string
  }
}

export interface PartAttributeLabels {
  category: string
  footprint: string
  footprintLength: number | null
  footprintWidth: number | null
  heightBand: string
  modifier: string
  partId: string
  signature: string
  title: string
}

interface AttributeSample {
  attributes: PartAttributeLabels
  geometry: SampleGeometry
  itemId: string
  partId: string
  rowKey: string
  vector: number[]
  view: string | null
}

interface SampleGeometry {
  areaRatio: number
  aspect: number
  tightArea: number
  tightHeight: number
  tightWidth: number
}

interface AttributePrediction {
  attributes: PartAttributeLabels
  itemId: string
  partId: string
  predictions: Record<AttributeName, string | null>
  rowKey: string
  view: string | null
}

interface AttributeMetric {
  correct: number
  labels: number
  name: AttributeName
  total: number
  unknown: number
}

interface PartMatchAttributeSpikeSummary {
  generatedAt: string
  modelIds: string[]
  options: {
    embeddingDir: string
    foldCount: number
    ldrawRoot: string
    outputDir: string
    variant: AttributeFeatureMode
  }
  partCount: number
  sampleCount: number
  skippedRows: {
    byReason: Record<string, number>
    count: number
  }
  metrics: AttributeMetric[]
  signatureFalseCollisionPairs: number
  verdict: {
    reason: string
    status: "promising" | "blocked" | "inconclusive"
  }
  version: string
}

export interface RunPartMatchAttributeSpikeOptions {
  embeddingDir: string
  foldCount?: number
  generatedAt?: Date
  ldrawRoot?: string
  outputDir?: string
  variant?: AttributeFeatureMode
}

export interface RunPartMatchAttributeSpikeResult {
  indexPath: string
  outputDir: string
  predictionsPath: string
  summary: PartMatchAttributeSpikeSummary
  summaryPath: string
}

export async function runPartMatchAttributeSpike(
  options: RunPartMatchAttributeSpikeOptions,
): Promise<RunPartMatchAttributeSpikeResult> {
  const startedAt = Date.now()
  const generatedAt = options.generatedAt ?? new Date()
  const outputDir =
    options.outputDir ?? path.join(DEFAULT_OUTPUT_ROOT, `${timestampForPath(generatedAt)}-attribute-spike`)
  const foldCount = options.foldCount ?? DEFAULT_FOLD_COUNT
  const ldrawRoot = options.ldrawRoot ?? DEFAULT_LDRAW_ROOT
  const variant = options.variant ?? DEFAULT_VARIANT
  const input = await readEmbeddingInput(options.embeddingDir)
  const { samples, skippedRows } = await createAttributeSamples({
    embeddings: input.embeddings,
    ldrawRoot,
    rows: input.rows,
    variant,
  })

  if (samples.length === 0) {
    throw new Error("No attribute samples with vectors were found.")
  }

  const predictions = evaluateAttributePredictions(samples, foldCount)
  const metrics = summarizeAttributeMetrics(predictions)
  const signatureFalseCollisionPairs = countSignatureFalseCollisionPairs(predictions)
  const summary: PartMatchAttributeSpikeSummary = {
    generatedAt: generatedAt.toISOString(),
    metrics,
    modelIds: input.modelIds,
    options: {
      embeddingDir: normalizeWorkspacePath(options.embeddingDir),
      foldCount,
      ldrawRoot,
      outputDir: normalizeWorkspacePath(outputDir),
      variant,
    },
    partCount: new Set(samples.map((sample) => sample.partId)).size,
    sampleCount: samples.length,
    signatureFalseCollisionPairs,
    skippedRows: summarizeSkippedRows(skippedRows),
    verdict: createVerdict(metrics, signatureFalseCollisionPairs),
    version: ATTRIBUTE_SPIKE_VERSION,
  }

  await mkdir(outputDir, { recursive: true })
  const summaryPath = path.join(outputDir, "summary.json")
  const predictionsPath = path.join(outputDir, "predictions.json")
  const indexPath = path.join(outputDir, "index.html")

  await writeJson(summaryPath, {
    ...summary,
    durationMs: Date.now() - startedAt,
  })
  await writeJson(predictionsPath, {
    generatedAt: generatedAt.toISOString(),
    predictions,
    version: ATTRIBUTE_SPIKE_VERSION,
  })
  await writeFile(indexPath, renderIndexHtml(summary, predictions))

  return {
    indexPath,
    outputDir,
    predictionsPath,
    summary,
    summaryPath,
  }
}

async function readEmbeddingInput(embeddingDir: string): Promise<{
  embeddings: Map<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>>
  modelIds: string[]
  rows: PartMatchEmbeddingRow[]
}> {
  const rowsPath = path.join(embeddingDir, "rows.json")
  const embeddingsPath = path.join(embeddingDir, "embeddings.json")

  if (!existsSync(rowsPath) || !existsSync(embeddingsPath)) {
    throw new Error(`Missing embedding cache files in ${embeddingDir}.`)
  }

  const rowsFile = JSON.parse(await readFile(rowsPath, "utf8")) as EmbeddingRowsFile
  const embeddingsFile = JSON.parse(await readFile(embeddingsPath, "utf8")) as EmbeddingCacheFile

  return {
    embeddings: new Map(Object.entries(embeddingsFile.embeddings ?? {})),
    modelIds: embeddingsFile.model?.id ? [embeddingsFile.model.id] : [],
    rows: rowsFile.rows ?? [],
  }
}

async function createAttributeSamples({
  embeddings,
  ldrawRoot,
  rows,
  variant,
}: {
  embeddings: ReadonlyMap<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>>
  ldrawRoot: string
  rows: readonly PartMatchEmbeddingRow[]
  variant: AttributeFeatureMode
}): Promise<{
  samples: AttributeSample[]
  skippedRows: Array<{ reason: string; rowKey: string }>
}> {
  const samples: AttributeSample[] = []
  const skippedRows: Array<{ reason: string; rowKey: string }> = []
  const titleCache = new Map<string, string | null>()

  for (const row of rows) {
    const partId = readCataloguePartId(row.itemId)
    const rowEmbeddings = embeddings.get(row.rowKey)
    const vector = readSampleVector(rowEmbeddings, variant)

    if (!partId) {
      skippedRows.push({ reason: "missing-part-id", rowKey: row.rowKey })
      continue
    }

    if (!vector) {
      skippedRows.push({ reason: "missing-vector", rowKey: row.rowKey })
      continue
    }

    const title = await readCachedTitle(titleCache, ldrawRoot, partId)

    if (!title) {
      skippedRows.push({ reason: "missing-title", rowKey: row.rowKey })
      continue
    }

    samples.push({
      attributes: inferPartAttributes({ partId, title }),
      geometry: createSampleGeometry(row),
      itemId: row.itemId,
      partId,
      rowKey: row.rowKey,
      vector,
      view: readCatalogueView(row.itemId),
    })
  }

  return {
    samples,
    skippedRows,
  }
}

function readSampleVector(
  embeddings: Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>> | undefined,
  variant: AttributeFeatureMode,
): number[] | null {
  if (!embeddings) {
    return null
  }

  if (variant !== "combined") {
    return embeddings[variant]?.vector ?? null
  }

  const vectors = VARIANT_NAMES.map((variantName) => embeddings[variantName]?.vector)

  if (vectors.some((vector) => !vector)) {
    return null
  }

  return normalizeVector(vectors.flatMap((vector) => vector ?? []))
}

async function readCachedTitle(
  cache: Map<string, string | null>,
  ldrawRoot: string,
  partId: string,
): Promise<string | null> {
  if (cache.has(partId)) {
    return cache.get(partId) ?? null
  }

  const title = await readLDrawPartTitle(ldrawRoot, partId)
  cache.set(partId, title)

  return title
}

async function readLDrawPartTitle(ldrawRoot: string, partId: string): Promise<string | null> {
  for (const filePath of [
    path.join(ldrawRoot, "parts", `${partId}.dat`),
    path.join(ldrawRoot, "UnOfficial", "parts", `${partId}.dat`),
  ]) {
    if (!existsSync(filePath)) {
      continue
    }

    const firstLine = (await readFile(filePath, "utf8")).split(/\r?\n/)[0] ?? ""
    return firstLine.replace(/^0\s+/, "").trim() || null
  }

  return null
}

export function inferPartAttributes({
  partId,
  title,
}: {
  partId: string
  title: string
}): PartAttributeLabels {
  const normalizedTitle = title.toLowerCase()
  const category = inferCategory(normalizedTitle)
  const footprintDimensions = inferFootprintDimensions(normalizedTitle)
  const footprint = formatFootprint(footprintDimensions)
  const heightBand = inferHeightBand(normalizedTitle, category)
  const modifier = inferModifier(normalizedTitle, category)
  const signature = [category, footprint, heightBand, modifier].join("|")

  return {
    category,
    footprint,
    footprintLength: footprintDimensions?.length ?? null,
    footprintWidth: footprintDimensions?.width ?? null,
    heightBand,
    modifier,
    partId,
    signature,
    title,
  }
}

function inferCategory(normalizedTitle: string): string {
  if (normalizedTitle.includes("slope")) {
    return "slope"
  }

  if (normalizedTitle.includes("tile")) {
    return "tile"
  }

  if (normalizedTitle.includes("plate")) {
    return "plate"
  }

  if (normalizedTitle.includes("brick")) {
    return "brick"
  }

  return "other"
}

function inferFootprintDimensions(normalizedTitle: string): {
  length: number
  width: number
} | null {
  const dimensionMatch = normalizedTitle.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)(?:\s*x\s*(\d+(?:\.\d+)?))?/)

  if (!dimensionMatch) {
    return null
  }

  const width = normalizeDimension(dimensionMatch[1] ?? "")
  const length = normalizeDimension(dimensionMatch[2] ?? "")

  if (width === null || length === null) {
    return null
  }

  return {
    length: Math.max(width, length),
    width: Math.min(width, length),
  }
}

function formatFootprint(dimensions: { length: number; width: number } | null): string {
  if (!dimensions) {
    return "unknown"
  }

  return `${formatDimension(dimensions.width)}x${formatDimension(dimensions.length)}`
}

function normalizeDimension(value: string): number | null {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return null
  }

  return number
}

function formatDimension(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value)
}

function inferHeightBand(normalizedTitle: string, category: string): string {
  if (normalizedTitle.includes("0.667")) {
    return "two-thirds"
  }

  if (category === "tile") {
    return "tile"
  }

  if (category === "plate") {
    return "plate"
  }

  if (category === "brick") {
    return "brick"
  }

  if (category === "slope") {
    return "slope"
  }

  return "unknown"
}

function inferModifier(normalizedTitle: string, category: string): string {
  const modifiers = []

  if (normalizedTitle.includes("round")) {
    modifiers.push("round")
  }

  if (normalizedTitle.includes("inverted")) {
    modifiers.push("inverted")
  }

  if (normalizedTitle.includes("headlight")) {
    modifiers.push("headlight")
  }

  if (normalizedTitle.includes("handle")) {
    modifiers.push("handle")
  }

  if (normalizedTitle.includes("groove")) {
    modifiers.push("groove")
  }

  if (normalizedTitle.includes("with ") && modifiers.length === 0) {
    modifiers.push("modified")
  }

  if (category === "slope") {
    const angle = normalizedTitle.match(/slope brick\s+(\d+)/)?.[1]
    modifiers.push(angle ? `slope-${angle}` : "slope")
  }

  return modifiers.length === 0 ? "plain" : modifiers.join("+")
}

function evaluateAttributePredictions(
  samples: readonly AttributeSample[],
  foldCount: number,
): AttributePrediction[] {
  const partIds = [...new Set(samples.map((sample) => sample.partId))].sort()
  const predictions: AttributePrediction[] = []

  for (let fold = 0; fold < foldCount; fold += 1) {
    const holdoutPartIds = new Set(partIds.filter((partId) => stableFold(partId, foldCount) === fold))
    const trainingSamples = samples.filter((sample) => !holdoutPartIds.has(sample.partId))
    const holdoutSamples = samples.filter((sample) => holdoutPartIds.has(sample.partId))

    for (const sample of holdoutSamples) {
      predictions.push({
        attributes: sample.attributes,
        itemId: sample.itemId,
        partId: sample.partId,
        predictions: predictAttributesFromNeighbors(sample, trainingSamples),
        rowKey: sample.rowKey,
        view: sample.view,
      })
    }
  }

  return predictions.sort((left, right) =>
    left.partId.localeCompare(right.partId) ||
    left.itemId.localeCompare(right.itemId),
  )
}

function predictAttributesFromNeighbors(
  sample: AttributeSample,
  trainingSamples: readonly AttributeSample[],
): Record<AttributeName, string | null> {
  const sameViewTrainingSamples = trainingSamples.filter((entry) => entry.view && entry.view === sample.view)
  const pool = sameViewTrainingSamples.length >= NEIGHBOR_COUNT ? sameViewTrainingSamples : trainingSamples
  const neighbors = pool
    .map((entry) => ({
      distance: sampleDistance(sample, entry),
      sample: entry,
    }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, NEIGHBOR_COUNT)

  if (neighbors.length === 0) {
    return Object.fromEntries(ATTRIBUTE_NAMES.map((attributeName) => [attributeName, null])) as Record<AttributeName, string | null>
  }

  const category = voteAttribute(neighbors, "category")
  const heightBand = voteAttribute(neighbors, "heightBand")
  const modifier = voteAttribute(neighbors, "modifier")
  const footprint = predictFootprint(neighbors)
  const signature = category && footprint && heightBand && modifier
    ? [category, footprint, heightBand, modifier].join("|")
    : null

  return {
    category,
    footprint,
    heightBand,
    modifier,
    signature,
  }
}

function sampleDistance(left: AttributeSample, right: AttributeSample): number {
  const embeddingDistance = 1 - dotProduct(left.vector, right.vector)
  const aspectDistance = Math.abs(Math.log(left.geometry.aspect / Math.max(0.000001, right.geometry.aspect)))
  const areaDistance = Math.abs(Math.log(left.geometry.areaRatio / Math.max(0.000001, right.geometry.areaRatio)))

  return embeddingDistance + aspectDistance * 0.12 + areaDistance * 0.04
}

function voteAttribute(
  neighbors: readonly { distance: number; sample: AttributeSample }[],
  attributeName: Exclude<AttributeName, "footprint" | "signature">,
): string | null {
  const scores = new Map<string, number>()

  for (const neighbor of neighbors) {
    const label = neighbor.sample.attributes[attributeName]
    scores.set(label, (scores.get(label) ?? 0) + neighborWeight(neighbor.distance))
  }

  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null
}

function predictFootprint(
  neighbors: readonly { distance: number; sample: AttributeSample }[],
): string | null {
  let totalWeight = 0
  let widthTotal = 0
  let lengthTotal = 0

  for (const neighbor of neighbors) {
    const { footprintLength, footprintWidth } = neighbor.sample.attributes

    if (footprintLength === null || footprintWidth === null) {
      continue
    }

    const weight = neighborWeight(neighbor.distance)
    widthTotal += footprintWidth * weight
    lengthTotal += footprintLength * weight
    totalWeight += weight
  }

  if (totalWeight === 0) {
    return null
  }

  return formatFootprint({
    length: nearestCommonDimension(lengthTotal / totalWeight),
    width: nearestCommonDimension(widthTotal / totalWeight),
  })
}

function nearestCommonDimension(value: number): number {
  return COMMON_STUD_DIMENSIONS
    .map((dimension) => ({
      delta: Math.abs(dimension - value),
      dimension,
    }))
    .sort((left, right) => left.delta - right.delta || left.dimension - right.dimension)[0]?.dimension ?? value
}

function neighborWeight(distance: number): number {
  return 1 / Math.max(0.000001, distance)
}

function createSampleGeometry(row: PartMatchEmbeddingRow): SampleGeometry {
  const tight = row.variants["tight-rendered"]
  const rendered = row.variants.rendered
  const partRegion = readRegionSize(row.partRegion)
  const tightWidth = tight?.width ?? partRegion?.width ?? 1
  const tightHeight = tight?.height ?? partRegion?.height ?? 1
  const renderedArea = Math.max(1, (rendered?.width ?? partRegion?.width ?? tightWidth) * (rendered?.height ?? partRegion?.height ?? tightHeight))
  const tightArea = tightWidth * tightHeight

  return {
    areaRatio: tightArea / renderedArea,
    aspect: tightWidth / Math.max(1, tightHeight),
    tightArea,
    tightHeight,
    tightWidth,
  }
}

function readRegionSize(value: unknown): { height: number; width: number } | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const region = value as { height?: unknown; width?: unknown }

  return typeof region.height === "number" && typeof region.width === "number"
    ? { height: region.height, width: region.width }
    : null
}

function summarizeAttributeMetrics(
  predictions: readonly AttributePrediction[],
): AttributeMetric[] {
  return ATTRIBUTE_NAMES.map((name) => {
    const labels = new Set(predictions.map((prediction) => prediction.attributes[name]))
    let correct = 0
    let unknown = 0

    for (const prediction of predictions) {
      const predicted = prediction.predictions[name]

      if (!predicted) {
        unknown += 1
        continue
      }

      if (predicted === prediction.attributes[name]) {
        correct += 1
      }
    }

    return {
      correct,
      labels: labels.size,
      name,
      total: predictions.length,
      unknown,
    }
  })
}

function countSignatureFalseCollisionPairs(predictions: readonly AttributePrediction[]): number {
  let collisions = 0

  for (let leftIndex = 0; leftIndex < predictions.length; leftIndex += 1) {
    const left = predictions[leftIndex]

    for (let rightIndex = leftIndex + 1; rightIndex < predictions.length; rightIndex += 1) {
      const right = predictions[rightIndex]

      if (
        left?.partId !== right?.partId &&
        left?.predictions.signature &&
        left.predictions.signature === right?.predictions.signature
      ) {
        collisions += 1
      }
    }
  }

  return collisions
}

function createVerdict(
  metrics: readonly AttributeMetric[],
  signatureFalseCollisionPairs: number,
): PartMatchAttributeSpikeSummary["verdict"] {
  const signatureMetric = metrics.find((metric) => metric.name === "signature")
  const categoryMetric = metrics.find((metric) => metric.name === "category")

  if (!signatureMetric || !categoryMetric) {
    return {
      reason: "No signature or category metric was produced.",
      status: "blocked",
    }
  }

  const signatureAccuracy = accuracy(signatureMetric)
  const categoryAccuracy = accuracy(categoryMetric)

  if (signatureFalseCollisionPairs === 0 && signatureAccuracy >= 0.8 && categoryAccuracy >= 0.95) {
    return {
      reason: `Promising attribute signal: signature ${formatPercent(signatureAccuracy)}, category ${formatPercent(categoryAccuracy)}, no signature collision pairs.`,
      status: "promising",
    }
  }

  if (categoryAccuracy >= 0.85 || signatureAccuracy >= 0.5) {
    return {
      reason: `Partial attribute signal: signature ${formatPercent(signatureAccuracy)}, category ${formatPercent(categoryAccuracy)}, ${signatureFalseCollisionPairs} signature collision pairs.`,
      status: "inconclusive",
    }
  }

  return {
    reason: `Weak attribute signal: signature ${formatPercent(signatureAccuracy)}, category ${formatPercent(categoryAccuracy)}, ${signatureFalseCollisionPairs} signature collision pairs.`,
    status: "blocked",
  }
}

function accuracy(metric: AttributeMetric): number {
  return metric.total === 0 ? 0 : metric.correct / metric.total
}

function summarizeSkippedRows(
  skippedRows: readonly { reason: string }[],
): PartMatchAttributeSpikeSummary["skippedRows"] {
  const byReason: Record<string, number> = {}

  for (const row of skippedRows) {
    byReason[row.reason] = (byReason[row.reason] ?? 0) + 1
  }

  return {
    byReason,
    count: skippedRows.length,
  }
}

function readCataloguePartId(itemId: string): string | null {
  return itemId.split(":")[0] || null
}

function readCatalogueView(itemId: string): string | null {
  return itemId.split(":")[1] || null
}

function normalizeVector(vector: readonly number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0))

  if (magnitude === 0) {
    return vector.map(() => 0)
  }

  return vector.map((value) => value / magnitude)
}

function dotProduct(left: readonly number[], right: readonly number[]): number {
  return left.reduce((total, value, index) => total + value * (right[index] ?? 0), 0)
}

function stableFold(value: string, foldCount: number): number {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }

  return hash % foldCount
}

function renderIndexHtml(
  summary: PartMatchAttributeSpikeSummary,
  predictions: readonly AttributePrediction[],
): string {
  const misses = predictions.filter((prediction) =>
    ATTRIBUTE_NAMES.some((attributeName) => prediction.predictions[attributeName] !== prediction.attributes[attributeName])
  )

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Part match attribute spike</title>
  <style>
    body { color: #172033; font-family: system-ui, sans-serif; margin: 24px; }
    article { border: 1px solid #d8ded8; border-radius: 8px; margin: 12px 0; padding: 12px; }
    .promising { background: #f0fff4; }
    .inconclusive { background: #fff8e5; }
    .blocked { background: #fff1f1; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border-bottom: 1px solid #d8ded8; padding: 6px; text-align: left; }
    code { overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <h1>Part match attribute spike</h1>
  <article class="${escapeAttribute(summary.verdict.status)}">
    <h2>${escapeHtml(summary.verdict.status)}</h2>
    <p>${escapeHtml(summary.verdict.reason)}</p>
  </article>
  <p>${summary.partCount} parts · ${summary.sampleCount} samples · ${escapeHtml(summary.options.variant)} · ${escapeHtml(summary.modelIds.join(", ") || "unknown model")}</p>
  <h2>Metrics</h2>
  <table>
    <thead><tr><th>Attribute</th><th>Accuracy</th><th>Labels</th><th>Correct</th><th>Unknown</th></tr></thead>
    <tbody>${summary.metrics.map((metric) => `
      <tr>
        <td>${escapeHtml(metric.name)}</td>
        <td>${formatPercent(accuracy(metric))}</td>
        <td>${metric.labels}</td>
        <td>${metric.correct}/${metric.total}</td>
        <td>${metric.unknown}</td>
      </tr>
    `).join("")}</tbody>
  </table>
  <p>Signature false collision pairs: ${summary.signatureFalseCollisionPairs}</p>
  <h2>Mismatches (${misses.length})</h2>
  ${misses.slice(0, 160).map((prediction) => `
    <article>
      <p><strong>${escapeHtml(prediction.partId)}</strong> · ${escapeHtml(prediction.attributes.title)} · ${escapeHtml(prediction.view ?? "unknown-view")}</p>
      <p><code>${escapeHtml(prediction.itemId)}</code></p>
      <p>Expected: ${escapeHtml(JSON.stringify(pickAttributes(prediction.attributes)))}</p>
      <p>Predicted: ${escapeHtml(JSON.stringify(prediction.predictions))}</p>
    </article>
  `).join("")}
</body>
</html>
`
}

function pickAttributes(attributes: PartAttributeLabels): Record<AttributeName, string> {
  return Object.fromEntries(ATTRIBUTE_NAMES.map((attributeName) => [
    attributeName,
    attributes[attributeName],
  ])) as Record<AttributeName, string>
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

function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`
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

function parseCliArgs(argv: readonly string[]): RunPartMatchAttributeSpikeOptions {
  const embeddingDir = readOption(argv, "--embedding-dir")

  if (!embeddingDir) {
    throw new Error("--embedding-dir is required.")
  }

  return {
    embeddingDir,
    foldCount: Number(readOption(argv, "--fold-count") ?? DEFAULT_FOLD_COUNT),
    ldrawRoot: readOption(argv, "--ldraw-root") ?? undefined,
    outputDir: readOption(argv, "--output-dir") ?? undefined,
    variant: (readOption(argv, "--variant") as AttributeFeatureMode | null) ?? undefined,
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isMain) {
  runPartMatchAttributeSpike(parseCliArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(`Part-match attribute spike: ${result.summary.verdict.status}`)
      console.log(result.summary.verdict.reason)
      console.log(`Summary: ${result.summaryPath}`)
      console.log(`Index: ${result.indexPath}`)
    })
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
}
