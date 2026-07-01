import { existsSync } from "node:fs"
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  deflateSync,
  inflateSync,
} from "node:zlib"

const DEFAULT_OUTPUT_ROOT = path.join(
  ".bag-it",
  "private",
  "part-match-reports",
  "embedding-experiments",
)
const DEFAULT_LABEL_DIR = path.join(".bag-it", "private", "part-match-reports", "labels")
const DEFAULT_MODEL_ID = "Xenova/clip-vit-base-patch32"
const MODEL_TASK = "image-feature-extraction"
const NEAREST_NEIGHBOR_COUNT = 5
const NEUTRAL_BACKGROUND = {
  b: 244,
  g: 244,
  r: 240,
}

export const PART_MATCH_EMBEDDING_CACHE_VERSION = "0.1.0"

export type PartMatchEmbeddingVariantName =
  | "rendered"
  | "tight-rendered"
  | "neutral-mask"
  | "silhouette"

interface PartMatchReport {
  manualId?: string | null
  reportPath?: string | null
  rows?: PartMatchReportRow[]
}

interface PartMatchReportRow {
  bagId?: string | null
  bagLabel?: string | null
  calloutId?: string | null
  color?: unknown
  cropHash?: string | null
  imageDataUrl?: string | null
  itemId?: string | null
  pageNumber?: number | null
  partRegion?: unknown
  quantity?: number | null
  rowId?: string | null
  stepIndex?: number | null
}

export interface DecodedPngImage {
  data: Uint8ClampedArray
  height: number
  width: number
}

interface ImageBounds {
  height: number
  width: number
  x: number
  y: number
}

export interface PartMatchEmbeddingRow {
  bagId: string | null
  bagLabel: string | null
  calloutId: string | null
  color: unknown
  cropHash: string
  itemId: string
  manualId: string
  pageNumber: number | null
  partRegion: unknown
  quantity: number | null
  rowId: string
  rowKey: string
  stepIndex: number | null
  variants: Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingVariant>>
}

export interface PartMatchEmbeddingVariant {
  cacheKey: string
  height: number
  path: string
  variant: PartMatchEmbeddingVariantName
  width: number
}

export interface PartMatchEmbeddingRecord {
  cacheKey: string
  dimensions: number
  reused: boolean
  vector: number[]
}

interface PartMatchEmbeddingModelSummary {
  cacheDir: string
  id: string
  task: string
}

interface PartMatchEmbeddingRowsFile {
  generatedAt: string
  model: PartMatchEmbeddingModelSummary
  reports: string[]
  rows: PartMatchEmbeddingRow[]
  skippedRows: PartMatchEmbeddingSkippedRow[]
  version: string
}

interface PartMatchEmbeddingSkippedRow {
  manualId: string
  reason: string
  reportPath: string
  rowId: string
}

interface PartMatchEmbeddingCacheFile {
  embeddings: Record<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>>
  generatedAt: string
  model: PartMatchEmbeddingModelSummary
  version: string
}

interface PartMatchEmbeddingSummary {
  durationMs: number
  generatedAt: string
  model: PartMatchEmbeddingModelSummary
  options: {
    labelDir: string
    manualId: string | null
    outputDir: string
    reportPaths: string[]
  }
  totals: {
    embeddedRows: number
    embeddings: number
    reusedEmbeddings: number
    rowCount: number
    skippedRows: number
    variantCount: number
    vectorDimensions: number | null
  }
  version: string
}

interface NearestNeighborEntry {
  neighbors: Array<{
    score: number
    rowKey: string
  }>
  rowKey: string
}

interface CreatePartMatchEmbeddingCacheOptions {
  embedder?: PartMatchImageEmbedder
  generatedAt?: Date
  labelDir?: string
  manualId?: string | null
  modelId?: string
  outputDir?: string
  reportPaths: string[]
}

export interface CreatePartMatchEmbeddingCacheResult {
  embeddingsPath: string
  indexPath: string
  outputDir: string
  rowsPath: string
  summary: PartMatchEmbeddingSummary
  summaryPath: string
}

export interface PartMatchImageEmbedder {
  embed(imagePath: string): Promise<number[]>
  model: PartMatchEmbeddingModelSummary
}

interface TransformersModule {
  env?: {
    cacheDir?: string
  }
  pipeline: (
    task: string,
    modelId: string,
    options?: Record<string, unknown>,
  ) => Promise<(input: string) => Promise<unknown>>
}

export async function createPartMatchEmbeddingCache(
  options: CreatePartMatchEmbeddingCacheOptions,
): Promise<CreatePartMatchEmbeddingCacheResult> {
  if (options.reportPaths.length === 0) {
    throw new Error("At least one part-match report path is required.")
  }

  const startedAt = Date.now()
  const generatedAt = options.generatedAt ?? new Date()
  const outputDir = options.outputDir ?? path.join(DEFAULT_OUTPUT_ROOT, timestampForPath(generatedAt))
  const modelId = options.modelId ?? DEFAULT_MODEL_ID
  const model = {
    cacheDir: normalizeWorkspacePath(path.join(outputDir, "model-cache")),
    id: modelId,
    task: MODEL_TASK,
  }

  await mkdir(outputDir, { recursive: true })

  const existingEmbeddings = await readExistingEmbeddings(path.join(outputDir, "embeddings.json"))
  const { rows, skippedRows } = await createRowsAndVariants({
    generatedAt,
    modelId,
    outputDir,
    reportPaths: options.reportPaths,
    manualIdOverride: options.manualId ?? null,
  })
  const embedder = options.embedder ?? await createTransformersEmbedder(model)
  const embeddings = await embedRows(rows, {
    embedder,
    existingEmbeddings,
  })
  const summary = createSummary({
    durationMs: Date.now() - startedAt,
    embeddings,
    generatedAt,
    labelDir: options.labelDir ?? DEFAULT_LABEL_DIR,
    model,
    outputDir,
    reportPaths: options.reportPaths,
    rows,
    skippedRows,
    manualId: options.manualId ?? null,
  })

  if (summary.totals.embeddings === 0) {
    throw new Error("Part-match embedding cache produced zero embeddings.")
  }

  const nearestNeighbors = createNearestNeighbors(embeddings)
  const rowsPath = path.join(outputDir, "rows.json")
  const embeddingsPath = path.join(outputDir, "embeddings.json")
  const summaryPath = path.join(outputDir, "summary.json")
  const indexPath = path.join(outputDir, "index.html")

  await writeJson(rowsPath, {
    generatedAt: generatedAt.toISOString(),
    model,
    reports: options.reportPaths.map(normalizeWorkspacePath),
    rows,
    skippedRows,
    version: PART_MATCH_EMBEDDING_CACHE_VERSION,
  } satisfies PartMatchEmbeddingRowsFile)
  await writeJson(embeddingsPath, {
    embeddings,
    generatedAt: generatedAt.toISOString(),
    model,
    version: PART_MATCH_EMBEDDING_CACHE_VERSION,
  } satisfies PartMatchEmbeddingCacheFile)
  await writeJson(summaryPath, summary)
  await writeFile(indexPath, renderEmbeddingIndexHtml({
    embeddings,
    nearestNeighbors,
    outputDir,
    rows,
    summary,
  }))

  return {
    embeddingsPath,
    indexPath,
    outputDir,
    rowsPath,
    summary,
    summaryPath,
  }
}

async function createRowsAndVariants({
  generatedAt,
  manualIdOverride,
  modelId,
  outputDir,
  reportPaths,
}: {
  generatedAt: Date
  manualIdOverride: string | null
  modelId: string
  outputDir: string
  reportPaths: readonly string[]
}): Promise<{
  rows: PartMatchEmbeddingRow[]
  skippedRows: PartMatchEmbeddingSkippedRow[]
}> {
  const rows: PartMatchEmbeddingRow[] = []
  const skippedRows: PartMatchEmbeddingSkippedRow[] = []

  for (const reportPath of reportPaths) {
    const report = await readReport(reportPath)
    const manualId = manualIdOverride ?? report.manualId ?? path.basename(path.dirname(reportPath))
    const reportRows = report.rows ?? []

    for (const row of reportRows) {
      const rowId = row.rowId ?? row.itemId ?? "unknown-row"
      const decodedImage = decodePngImageDataUrl(row.imageDataUrl)

      if (!decodedImage) {
        skippedRows.push({
          manualId,
          reason: row.imageDataUrl ? "unsupported-image-data-url" : "missing-image-data-url",
          reportPath: normalizeWorkspacePath(reportPath),
          rowId,
        })
        continue
      }

      rows.push(await createEmbeddingRow({
        decodedImage,
        generatedAt,
        manualId,
        modelId,
        outputDir,
        reportRow: row,
      }))
    }
  }

  return { rows, skippedRows }
}

async function readReport(reportPath: string): Promise<PartMatchReport> {
  const resolvedPath = path.resolve(reportPath)

  if (!existsSync(resolvedPath)) {
    throw new Error(`Part-match report not found: ${reportPath}`)
  }

  return JSON.parse(await readFile(resolvedPath, "utf8")) as PartMatchReport
}

async function createEmbeddingRow({
  decodedImage,
  generatedAt,
  manualId,
  modelId,
  outputDir,
  reportRow,
}: {
  decodedImage: DecodedPngImage
  generatedAt: Date
  manualId: string
  modelId: string
  outputDir: string
  reportRow: PartMatchReportRow
}): Promise<PartMatchEmbeddingRow> {
  const rowId = reportRow.rowId ?? reportRow.itemId ?? hashString(JSON.stringify(reportRow))
  const cropHash = reportRow.cropHash ?? hashImage(decodedImage)
  const rowKey = createRowKey(manualId, rowId)
  const variants = await writeImageVariants({
    cropHash,
    generatedAt,
    image: decodedImage,
    manualId,
    modelId,
    outputDir,
    rowId,
  })

  return {
    bagId: reportRow.bagId ?? null,
    bagLabel: reportRow.bagLabel ?? null,
    calloutId: reportRow.calloutId ?? null,
    color: reportRow.color ?? null,
    cropHash,
    itemId: reportRow.itemId ?? rowId,
    manualId,
    pageNumber: reportRow.pageNumber ?? null,
    partRegion: reportRow.partRegion ?? null,
    quantity: reportRow.quantity ?? null,
    rowId,
    rowKey,
    stepIndex: reportRow.stepIndex ?? null,
    variants,
  }
}

async function writeImageVariants({
  cropHash,
  generatedAt,
  image,
  manualId,
  modelId,
  outputDir,
  rowId,
}: {
  cropHash: string
  generatedAt: Date
  image: DecodedPngImage
  manualId: string
  modelId: string
  outputDir: string
  rowId: string
}): Promise<Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingVariant>>> {
  const variants = createImageVariants(image)
  const result: Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingVariant>> = {}

  for (const variant of variants) {
    const relativePath = path.join(
      "variants",
      safeFileSegment(manualId),
      safeFileSegment(rowId),
      `${variant.name}.png`,
    )
    const absolutePath = path.join(outputDir, relativePath)
    const cacheKey = createEmbeddingCacheKey({
      cropHash,
      generatedAt,
      manualId,
      modelId,
      rowId,
      variant: variant.name,
    })

    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, encodeRgbaPng(variant.image))

    result[variant.name] = {
      cacheKey,
      height: variant.image.height,
      path: normalizeWorkspacePath(absolutePath),
      variant: variant.name,
      width: variant.image.width,
    }
  }

  return result
}

export function createImageVariants(image: DecodedPngImage): Array<{
  image: DecodedPngImage
  name: PartMatchEmbeddingVariantName
}> {
  const tightBounds = findAlphaBounds(image) ?? fullImageBounds(image)
  const tightImage = cropImage(image, tightBounds)

  return [
    {
      image,
      name: "rendered",
    },
    {
      image: tightImage,
      name: "tight-rendered",
    },
    {
      image: compositeOnNeutralBackground(image),
      name: "neutral-mask",
    },
    {
      image: createSilhouetteImage(tightImage),
      name: "silhouette",
    },
  ]
}

function findAlphaBounds(image: DecodedPngImage): ImageBounds | null {
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.data[(y * image.width + x) * 4 + 3] ?? 0

      if (alpha <= 0) {
        continue
      }

      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) {
    return null
  }

  return {
    height: maxY - minY + 1,
    width: maxX - minX + 1,
    x: minX,
    y: minY,
  }
}

function fullImageBounds(image: DecodedPngImage): ImageBounds {
  return {
    height: image.height,
    width: image.width,
    x: 0,
    y: 0,
  }
}

function cropImage(image: DecodedPngImage, bounds: ImageBounds): DecodedPngImage {
  const data = new Uint8ClampedArray(bounds.width * bounds.height * 4)

  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const sourceIndex = ((bounds.y + y) * image.width + bounds.x + x) * 4
      const targetIndex = (y * bounds.width + x) * 4

      data[targetIndex] = image.data[sourceIndex] ?? 0
      data[targetIndex + 1] = image.data[sourceIndex + 1] ?? 0
      data[targetIndex + 2] = image.data[sourceIndex + 2] ?? 0
      data[targetIndex + 3] = image.data[sourceIndex + 3] ?? 0
    }
  }

  return {
    data,
    height: bounds.height,
    width: bounds.width,
  }
}

function compositeOnNeutralBackground(image: DecodedPngImage): DecodedPngImage {
  const data = new Uint8ClampedArray(image.data.length)

  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
    const index = pixel * 4
    const alpha = (image.data[index + 3] ?? 0) / 255

    data[index] = compositeChannel(image.data[index] ?? 0, NEUTRAL_BACKGROUND.r, alpha)
    data[index + 1] = compositeChannel(image.data[index + 1] ?? 0, NEUTRAL_BACKGROUND.g, alpha)
    data[index + 2] = compositeChannel(image.data[index + 2] ?? 0, NEUTRAL_BACKGROUND.b, alpha)
    data[index + 3] = 255
  }

  return {
    data,
    height: image.height,
    width: image.width,
  }
}

function compositeChannel(
  foreground: number,
  background: number,
  alpha: number,
): number {
  return Math.round(foreground * alpha + background * (1 - alpha))
}

function createSilhouetteImage(image: DecodedPngImage): DecodedPngImage {
  const data = new Uint8ClampedArray(image.data.length)

  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
    const index = pixel * 4
    const alpha = image.data[index + 3] ?? 0
    const shape = alpha > 0 ? 0 : 255

    data[index] = shape
    data[index + 1] = shape
    data[index + 2] = shape
    data[index + 3] = 255
  }

  return {
    data,
    height: image.height,
    width: image.width,
  }
}

async function embedRows(
  rows: readonly PartMatchEmbeddingRow[],
  {
    embedder,
    existingEmbeddings,
  }: {
    embedder: PartMatchImageEmbedder
    existingEmbeddings: PartMatchEmbeddingCacheFile | null
  },
): Promise<Record<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>>> {
  const result: Record<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>> = {}

  for (const row of rows) {
    result[row.rowKey] = {}

    for (const variant of Object.values(row.variants)) {
      const existingRecord = existingEmbeddings?.embeddings[row.rowKey]?.[variant.variant]

      if (existingRecord?.cacheKey === variant.cacheKey) {
        result[row.rowKey][variant.variant] = {
          ...existingRecord,
          reused: true,
        }
        continue
      }

      const vector = normalizeVector(await embedder.embed(path.resolve(variant.path)))

      result[row.rowKey][variant.variant] = {
        cacheKey: variant.cacheKey,
        dimensions: vector.length,
        reused: false,
        vector,
      }
    }
  }

  return result
}

async function createTransformersEmbedder(
  model: PartMatchEmbeddingModelSummary,
): Promise<PartMatchImageEmbedder> {
  try {
    const transformers = await import("@huggingface/transformers") as unknown as TransformersModule

    if (transformers.env) {
      transformers.env.cacheDir = path.resolve(model.cacheDir)
    }

    const extractor = await transformers.pipeline(model.task, model.id, {
      dtype: "q8",
    })

    return {
      async embed(imagePath: string): Promise<number[]> {
        return flattenEmbeddingOutput(await extractor(imagePath))
      },
      model,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    throw new Error(`Failed to load part-match embedding model ${model.id}: ${message}`)
  }
}

function flattenEmbeddingOutput(output: unknown): number[] {
  const tensorData = readTensorData(output)

  if (tensorData.length > 0) {
    return tensorData
  }

  return flattenNumbers(output)
}

function readTensorData(output: unknown): number[] {
  if (!isRecord(output)) {
    return []
  }

  const data = output.data

  if (ArrayBuffer.isView(data) && "length" in data) {
    return Array.from(data as unknown as ArrayLike<number>, Number)
  }

  if (Array.isArray(data)) {
    return data.filter(isNumber)
  }

  return []
}

function flattenNumbers(value: unknown): number[] {
  if (isNumber(value)) {
    return [value]
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenNumbers)
  }

  if (isRecord(value)) {
    return Object.values(value).flatMap(flattenNumbers)
  }

  return []
}

function normalizeVector(vector: readonly number[]): number[] {
  const finite = vector.filter(Number.isFinite)
  const magnitude = Math.sqrt(finite.reduce((total, value) => total + value * value, 0))

  if (finite.length === 0 || magnitude === 0) {
    throw new Error("Embedding model returned an empty or zero vector.")
  }

  return finite.map((value) => value / magnitude)
}

function createSummary({
  durationMs,
  embeddings,
  generatedAt,
  labelDir,
  manualId,
  model,
  outputDir,
  reportPaths,
  rows,
  skippedRows,
}: {
  durationMs: number
  embeddings: Record<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>>
  generatedAt: Date
  labelDir: string
  manualId: string | null
  model: PartMatchEmbeddingModelSummary
  outputDir: string
  reportPaths: readonly string[]
  rows: readonly PartMatchEmbeddingRow[]
  skippedRows: readonly PartMatchEmbeddingSkippedRow[]
}): PartMatchEmbeddingSummary {
  const records = Object.values(embeddings).flatMap((variants) => Object.values(variants))
  const vectorDimensions = records.find((record) => record?.dimensions)?.dimensions ?? null

  return {
    durationMs,
    generatedAt: generatedAt.toISOString(),
    model,
    options: {
      labelDir: normalizeWorkspacePath(labelDir),
      manualId,
      outputDir: normalizeWorkspacePath(outputDir),
      reportPaths: reportPaths.map(normalizeWorkspacePath),
    },
    totals: {
      embeddedRows: Object.keys(embeddings).length,
      embeddings: records.length,
      reusedEmbeddings: records.filter((record) => record?.reused).length,
      rowCount: rows.length,
      skippedRows: skippedRows.length,
      variantCount: rows.reduce((total, row) => total + Object.keys(row.variants).length, 0),
      vectorDimensions,
    },
    version: PART_MATCH_EMBEDDING_CACHE_VERSION,
  }
}

function createNearestNeighbors(
  embeddings: Record<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>>,
): NearestNeighborEntry[] {
  const rowVectors = Object.entries(embeddings)
    .map(([rowKey, variants]) => ({
      rowKey,
      vector: averageVectors(Object.values(variants)
        .map((record) => record?.vector)
        .filter((vector): vector is number[] => Boolean(vector))),
    }))
    .filter((entry): entry is { rowKey: string, vector: number[] } => Boolean(entry.vector))

  return rowVectors.map((entry) => ({
    neighbors: rowVectors
      .filter((candidate) => candidate.rowKey !== entry.rowKey)
      .map((candidate) => ({
        rowKey: candidate.rowKey,
        score: dotProduct(entry.vector, candidate.vector),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, NEAREST_NEIGHBOR_COUNT),
    rowKey: entry.rowKey,
  }))
}

function averageVectors(vectors: readonly number[][]): number[] | null {
  const length = vectors[0]?.length

  if (!length || vectors.some((vector) => vector.length !== length)) {
    return null
  }

  const totals = new Array<number>(length).fill(0)

  for (const vector of vectors) {
    for (let index = 0; index < length; index += 1) {
      totals[index] += vector[index] ?? 0
    }
  }

  return normalizeVector(totals)
}

function dotProduct(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length)
  let total = 0

  for (let index = 0; index < length; index += 1) {
    total += (left[index] ?? 0) * (right[index] ?? 0)
  }

  return total
}

function renderEmbeddingIndexHtml({
  embeddings,
  nearestNeighbors,
  outputDir,
  rows,
  summary,
}: {
  embeddings: Record<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>>
  nearestNeighbors: readonly NearestNeighborEntry[]
  outputDir?: string
  rows: readonly PartMatchEmbeddingRow[]
  summary: PartMatchEmbeddingSummary
}): string {
  const rowsByKey = new Map(rows.map((row) => [row.rowKey, row]))
  const resolvedOutputDir = outputDir ?? summary.options.outputDir

  return `<!doctype html>
<meta charset="utf-8">
<title>Part match embedding cache</title>
<style>
body { color: #0f172a; font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; }
.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.card { border: 1px solid #d7ded7; border-radius: 8px; padding: 12px; }
.variants { display: flex; flex-wrap: wrap; gap: 6px; }
.variants img { background: #f8fafc; border: 1px solid #d7ded7; max-height: 72px; max-width: 96px; object-fit: contain; }
.meta { color: #475569; font-size: 12px; }
code { font-size: 12px; }
</style>
<h1>Part match embedding cache</h1>
<p>${escapeHtml(summary.model.id)} · ${summary.totals.embeddings} embeddings · ${summary.totals.vectorDimensions ?? "?"} dimensions · ${summary.totals.skippedRows} skipped rows</p>
<div class="grid">
${rows.map((row) => renderRowCard(row, rowsByKey, embeddings, nearestNeighbors, resolvedOutputDir)).join("\n")}
</div>
`
}

function renderRowCard(
  row: PartMatchEmbeddingRow,
  rowsByKey: ReadonlyMap<string, PartMatchEmbeddingRow>,
  embeddings: Record<string, Partial<Record<PartMatchEmbeddingVariantName, PartMatchEmbeddingRecord>>>,
  neighbors: readonly NearestNeighborEntry[],
  outputDir: string,
): string {
  const rowNeighbors = neighbors.find((entry) => entry.rowKey === row.rowKey)?.neighbors ?? []

  return `<section class="card">
  <div><strong>${escapeHtml(row.rowKey)}</strong></div>
  <div class="meta">${escapeHtml(row.bagLabel ?? row.bagId ?? "unknown bag")} · page ${row.pageNumber ?? "?"} · step ${row.stepIndex ?? "?"}</div>
  <div class="variants">${Object.values(row.variants).map((variant) =>
    `<img alt="${escapeAttribute(variant.variant)}" title="${escapeAttribute(variant.variant)}" src="${escapeAttribute(path.relative(path.resolve(outputDir), path.resolve(variant.path)))}">`
  ).join("")}</div>
  <p class="meta">${Object.values(embeddings[row.rowKey] ?? {}).length} vectors</p>
  <ol>${rowNeighbors.map((neighbor) => renderNeighbor(neighbor, rowsByKey)).join("")}</ol>
</section>`
}

function renderNeighbor(
  neighbor: {
    rowKey: string
    score: number
  },
  rowsByKey: ReadonlyMap<string, PartMatchEmbeddingRow>,
): string {
  const row = rowsByKey.get(neighbor.rowKey)
  const label = row
    ? `${row.rowKey} (${row.bagLabel ?? row.bagId ?? "unknown bag"})`
    : neighbor.rowKey

  return `<li><code>${escapeHtml(label)}</code> ${neighbor.score.toFixed(4)}</li>`
}

export function createEmbeddingCacheKey({
  cropHash,
  manualId,
  modelId,
  rowId,
  variant,
}: {
  cropHash: string
  generatedAt?: Date
  manualId: string
  modelId: string
  rowId: string
  variant: PartMatchEmbeddingVariantName
}): string {
  return hashString([
    PART_MATCH_EMBEDDING_CACHE_VERSION,
    modelId,
    manualId,
    rowId,
    cropHash,
    variant,
  ].join("\0"))
}

async function readExistingEmbeddings(
  embeddingsPath: string,
): Promise<PartMatchEmbeddingCacheFile | null> {
  if (!existsSync(embeddingsPath)) {
    return null
  }

  try {
    return JSON.parse(await readFile(embeddingsPath, "utf8")) as PartMatchEmbeddingCacheFile
  } catch {
    return null
  }
}

function decodePngImageDataUrl(imageDataUrl: string | null | undefined): DecodedPngImage | null {
  const match = /^data:image\/png;base64,([a-z0-9+/=]+)$/i.exec(imageDataUrl ?? "")

  if (!match) {
    return null
  }

  try {
    return decodePngBytes(Buffer.from(match[1] ?? "", "base64"))
  } catch {
    return null
  }
}

function decodePngBytes(bytes: Buffer): DecodedPngImage | null {
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    return null
  }

  const parsed = readPngChunks(bytes)

  if (!parsed.header || parsed.header.bitDepth !== 8 || parsed.header.interlace !== 0) {
    return null
  }

  const channels = readPngChannelCount(parsed.header.colorType)

  if (!channels) {
    return null
  }

  const inflated = inflateSync(Buffer.concat(parsed.idatChunks))
  const raw = unfilterPngScanlines(inflated, parsed.header.width, parsed.header.height, channels)

  return {
    data: pngRawToRgba(raw, parsed.header.width, parsed.header.height, channels, parsed.header.colorType),
    height: parsed.header.height,
    width: parsed.header.width,
  }
}

export function decodeRgbaPngBytes(bytes: Buffer): DecodedPngImage | null {
  return decodePngBytes(bytes)
}

function readPngChunks(bytes: Buffer): {
  header: {
    bitDepth: number
    colorType: number
    height: number
    interlace: number
    width: number
  } | null
  idatChunks: Buffer[]
} {
  let offset = 8
  const idatChunks: Buffer[] = []
  let header: ReturnType<typeof readPngChunks>["header"] = null

  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii")
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const chunk = bytes.subarray(dataStart, dataEnd)

    if (type === "IHDR") {
      header = {
        bitDepth: chunk[8] ?? 0,
        colorType: chunk[9] ?? 0,
        height: chunk.readUInt32BE(4),
        interlace: chunk[12] ?? 0,
        width: chunk.readUInt32BE(0),
      }
    } else if (type === "IDAT") {
      idatChunks.push(chunk)
    } else if (type === "IEND") {
      break
    }

    offset = dataEnd + 4
  }

  return {
    header,
    idatChunks,
  }
}

function readPngChannelCount(colorType: number): number | null {
  if (colorType === 0) {
    return 1
  }

  if (colorType === 2) {
    return 3
  }

  if (colorType === 4) {
    return 2
  }

  return colorType === 6 ? 4 : null
}

function unfilterPngScanlines(
  inflated: Buffer,
  width: number,
  height: number,
  channels: number,
): Uint8ClampedArray {
  const stride = width * channels
  const raw = new Uint8ClampedArray(stride * height)
  let sourceOffset = 0

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset] ?? 0

    sourceOffset += 1
    unfilterPngRow({
      channels,
      filter,
      raw,
      rowOffset: y * stride,
      source: inflated,
      sourceOffset,
      stride,
    })
    sourceOffset += stride
  }

  return raw
}

function unfilterPngRow({
  channels,
  filter,
  raw,
  rowOffset,
  source,
  sourceOffset,
  stride,
}: {
  channels: number
  filter: number
  raw: Uint8ClampedArray
  rowOffset: number
  source: Buffer
  sourceOffset: number
  stride: number
}): void {
  const previousRowOffset = rowOffset - stride

  for (let x = 0; x < stride; x += 1) {
    const value = source[sourceOffset + x] ?? 0
    const left = x >= channels ? raw[rowOffset + x - channels] ?? 0 : 0
    const up = rowOffset > 0 ? raw[previousRowOffset + x] ?? 0 : 0
    const upLeft = rowOffset > 0 && x >= channels ? raw[previousRowOffset + x - channels] ?? 0 : 0

    raw[rowOffset + x] = unfilterPngByte(filter, value, left, up, upLeft)
  }
}

function unfilterPngByte(
  filter: number,
  value: number,
  left: number,
  up: number,
  upLeft: number,
): number {
  if (filter === 0) {
    return value
  }

  if (filter === 1) {
    return (value + left) & 0xff
  }

  if (filter === 2) {
    return (value + up) & 0xff
  }

  if (filter === 3) {
    return (value + Math.floor((left + up) / 2)) & 0xff
  }

  if (filter === 4) {
    return (value + paethPredictor(left, up, upLeft)) & 0xff
  }

  throw new Error(`Unsupported PNG filter ${filter}.`)
}

function paethPredictor(
  left: number,
  up: number,
  upLeft: number,
): number {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upLeftDistance = Math.abs(estimate - upLeft)

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left
  }

  return upDistance <= upLeftDistance ? up : upLeft
}

function pngRawToRgba(
  raw: Uint8ClampedArray,
  width: number,
  height: number,
  channels: number,
  colorType: number,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4)

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    writeRgbaPixel({
      channels,
      colorType,
      pixel,
      raw,
      rgba,
    })
  }

  return rgba
}

function writeRgbaPixel({
  channels,
  colorType,
  pixel,
  raw,
  rgba,
}: {
  channels: number
  colorType: number
  pixel: number
  raw: Uint8ClampedArray
  rgba: Uint8ClampedArray
}): void {
  const rawIndex = pixel * channels
  const rgbaIndex = pixel * 4

  if (colorType === 0) {
    const gray = raw[rawIndex] ?? 0

    rgba[rgbaIndex] = gray
    rgba[rgbaIndex + 1] = gray
    rgba[rgbaIndex + 2] = gray
    rgba[rgbaIndex + 3] = 255
    return
  }

  if (colorType === 4) {
    const gray = raw[rawIndex] ?? 0

    rgba[rgbaIndex] = gray
    rgba[rgbaIndex + 1] = gray
    rgba[rgbaIndex + 2] = gray
    rgba[rgbaIndex + 3] = raw[rawIndex + 1] ?? 0
    return
  }

  rgba[rgbaIndex] = raw[rawIndex] ?? 0
  rgba[rgbaIndex + 1] = raw[rawIndex + 1] ?? 0
  rgba[rgbaIndex + 2] = raw[rawIndex + 2] ?? 0
  rgba[rgbaIndex + 3] = colorType === 2 ? 255 : raw[rawIndex + 3] ?? 0
}

export function encodeRgbaPng(image: DecodedPngImage): Buffer {
  const raw = Buffer.alloc((image.width * 4 + 1) * image.height)
  let offset = 0

  for (let y = 0; y < image.height; y += 1) {
    raw[offset] = 0
    offset += 1

    for (let x = 0; x < image.width; x += 1) {
      const sourceIndex = (y * image.width + x) * 4

      raw[offset] = image.data[sourceIndex] ?? 0
      raw[offset + 1] = image.data[sourceIndex + 1] ?? 0
      raw[offset + 2] = image.data[sourceIndex + 2] ?? 0
      raw[offset + 3] = image.data[sourceIndex + 3] ?? 0
      offset += 4
    }
  }

  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    createPngChunk("IHDR", createPngHeader(image.width, image.height)),
    createPngChunk("IDAT", deflateSync(raw)),
    createPngChunk("IEND", Buffer.alloc(0)),
  ])
}

export function encodeRgbaPngDataUrl(image: DecodedPngImage): string {
  return `data:image/png;base64,${encodeRgbaPng(image).toString("base64")}`
}

function createPngHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(13)

  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  header[10] = 0
  header[11] = 0
  header[12] = 0

  return header
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii")
  const length = Buffer.alloc(4)
  const crc = Buffer.alloc(4)

  length.writeUInt32BE(data.length, 0)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)

  return Buffer.concat([length, typeBuffer, data, crc])
}

const CRC_TABLE = createCrcTable()

function createCrcTable(): number[] {
  const table: number[] = []

  for (let index = 0; index < 256; index += 1) {
    table[index] = createCrcEntry(index)
  }

  return table
}

function createCrcEntry(index: number): number {
  let value = index

  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1
      ? 0xedb88320 ^ (value >>> 1)
      : value >>> 1
  }

  return value >>> 0
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff

  for (const byte of buffer) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

function hashImage(image: DecodedPngImage): string {
  return hashString(`${image.width}x${image.height}\0${Buffer.from(image.data).toString("base64")}`)
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function createRowKey(manualId: string, rowId: string): string {
  return `${manualId}:${rowId}`
}

function safeFileSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "row"
}

function timestampForPath(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-")
}

function normalizeWorkspacePath(value: string): string {
  return path.relative(process.cwd(), path.resolve(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
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

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function parsePaths(value: string | null): string[] {
  return value?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? []
}

function readOption(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name)

  return index >= 0 ? argv[index + 1] ?? null : null
}

function readOptions(argv: readonly string[], name: string): string[] {
  const values: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name && argv[index + 1]) {
      values.push(argv[index + 1] ?? "")
    }
  }

  return values
}

function parseReportPaths(argv: readonly string[]): string[] {
  const optionValues = readOptions(argv, "--report-path").flatMap(parsePaths)
  const positional = argv.filter((value, index) =>
    !value.startsWith("--") && (index === 0 || !argv[index - 1]?.startsWith("--"))
  )

  return [...optionValues, ...positional]
}

async function runCli(): Promise<void> {
  const argv = process.argv.slice(2)
  const result = await createPartMatchEmbeddingCache({
    labelDir: readOption(argv, "--label-dir") ?? DEFAULT_LABEL_DIR,
    manualId: readOption(argv, "--manual-id"),
    modelId: readOption(argv, "--model-id") ?? DEFAULT_MODEL_ID,
    outputDir: readOption(argv, "--output-dir") ?? undefined,
    reportPaths: parseReportPaths(argv),
  })

  console.log(`Part-match embeddings: ${result.summary.totals.embeddings} vectors`)
  console.log(`Rows: ${result.rowsPath}`)
  console.log(`Embeddings: ${result.embeddingsPath}`)
  console.log(`Summary: ${result.summaryPath}`)
  console.log(`Index: ${result.indexPath}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
