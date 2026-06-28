import type { PartMatchRenderedPixels, PartMatchRowInput } from "@bag-it/part-matching"

type OrtRuntime = typeof import("onnxruntime-web/wasm")
type OrtSession = Awaited<ReturnType<OrtRuntime["InferenceSession"]["create"]>>

interface CnnPartPairScorer {
  featureSession: OrtSession
  metadata: CnnPartPairScorerMetadata
  ort: OrtRuntime
  pairHeadSession: OrtSession
}

interface CnnPartPairScorerMetadata {
  featureName: "cachedPairScore"
  featureSize: number
  imageSize: number
  mean: [number, number, number]
  modelId: string
  std: [number, number, number]
  threshold: number
}

interface PartPairScoreProgress {
  completed: number
  label: string
  total: number
}

interface RowEmbedding {
  embedding: Float32Array
  row: PartMatchRowInput
}

const MODEL_BASE_PATH = "/models/part-matching/manual-crop-cnn-hardneg-v4-closure-fixed-v1"
const MODEL_PROGRESS_TOTAL = 3
const EMBEDDING_BATCH_SIZE = 32
const PAIR_HEAD_BATCH_SIZE = 2048
const MAX_CNN_SCORER_BUCKET_ROWS = 96
const BACKGROUND_RGB = 245

let scorerPromise: Promise<CnnPartPairScorer> | null = null

export async function createCnnPartPairScoreFeatures(
  rows: readonly PartMatchRowInput[],
  onProgress: (progress: PartPairScoreProgress) => void,
): Promise<Map<string, Record<string, number>>> {
  if (rows.length < 2 || rows.length > MAX_CNN_SCORER_BUCKET_ROWS) {
    return new Map()
  }

  const scorer = await loadCnnPartPairScorer()

  onProgress({ completed: 1, label: "Embedding part crops", total: MODEL_PROGRESS_TOTAL })
  const rowEmbeddings = await embedRows(rows, scorer)

  if (rowEmbeddings.length < 2) {
    return new Map()
  }

  onProgress({ completed: 2, label: "Scoring part pairs", total: MODEL_PROGRESS_TOTAL })
  const scores = await scoreRowPairs(rowEmbeddings, scorer)
  onProgress({ completed: 3, label: "CNN scorer ready", total: MODEL_PROGRESS_TOTAL })
  return scores
}

async function loadCnnPartPairScorer(): Promise<CnnPartPairScorer> {
  scorerPromise ??= loadCnnPartPairScorerOnce()
  return scorerPromise
}

async function loadCnnPartPairScorerOnce(): Promise<CnnPartPairScorer> {
  try {
    const [ort, metadata] = await Promise.all([
      import("onnxruntime-web/wasm"),
      fetchJson<CnnPartPairScorerMetadata>(`${MODEL_BASE_PATH}/metadata.json`),
    ])

    ort.env.wasm.numThreads = 1
    ort.env.wasm.proxy = false

    const sessionOptions = {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all" as const,
    }
    const [featureSession, pairHeadSession] = await Promise.all([
      ort.InferenceSession.create(`${MODEL_BASE_PATH}/feature-extractor.onnx`, sessionOptions),
      ort.InferenceSession.create(`${MODEL_BASE_PATH}/pair-head.onnx`, sessionOptions),
    ])

    return { featureSession, metadata, ort, pairHeadSession }
  } catch {
    throw new Error("Part grouping scorer failed to load.")
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path)

  if (!response.ok) {
    throw new Error(`Failed to load ${path}`)
  }

  return response.json() as Promise<T>
}

async function embedRows(
  rows: readonly PartMatchRowInput[],
  scorer: CnnPartPairScorer,
): Promise<RowEmbedding[]> {
  const embeddableRows = rows.filter(hasRenderedPixels)
  const rowEmbeddings: RowEmbedding[] = []

  for (let start = 0; start < embeddableRows.length; start += EMBEDDING_BATCH_SIZE) {
    const batchRows = embeddableRows.slice(start, start + EMBEDDING_BATCH_SIZE)
    const inputTensor = createImageBatchTensor(batchRows, scorer)
    const result = await scorer.featureSession.run({ images: inputTensor })
    const rawEmbeddings = toFloat32Array(result.embeddings?.data)

    if (!rawEmbeddings) {
      continue
    }

    for (let index = 0; index < batchRows.length; index += 1) {
      const row = batchRows[index]

      if (!row) {
        continue
      }

      const from = index * scorer.metadata.featureSize
      const to = from + scorer.metadata.featureSize
      rowEmbeddings.push({
        embedding: rawEmbeddings.slice(from, to),
        row,
      })
    }
  }

  return rowEmbeddings
}

function createImageBatchTensor(
  rows: readonly PartMatchRowInput[],
  scorer: CnnPartPairScorer,
): InstanceType<OrtRuntime["Tensor"]> {
  const imageSize = scorer.metadata.imageSize
  const imageArea = imageSize * imageSize
  const batchData = new Float32Array(rows.length * 3 * imageArea)

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]

    if (!row?.renderedPixels) {
      continue
    }

    writePreprocessedImage(row.renderedPixels, batchData, rowIndex, scorer.metadata)
  }

  return new scorer.ort.Tensor("float32", batchData, [
    rows.length,
    3,
    imageSize,
    imageSize,
  ])
}

function writePreprocessedImage(
  renderedPixels: PartMatchRenderedPixels,
  target: Float32Array,
  rowIndex: number,
  metadata: CnnPartPairScorerMetadata,
): void {
  const source = normalizeRenderedPixels(renderedPixels)
  const imageSize = metadata.imageSize
  const imageArea = imageSize * imageSize
  const rowOffset = rowIndex * 3 * imageArea

  fillBackground(target, rowOffset, imageArea, metadata)

  if (!source) {
    return
  }

  const scale = Math.min(imageSize / renderedPixels.width, imageSize / renderedPixels.height)
  const scaledWidth = Math.max(1, Math.round(renderedPixels.width * scale))
  const scaledHeight = Math.max(1, Math.round(renderedPixels.height * scale))
  const xOffset = Math.floor((imageSize - scaledWidth) / 2)
  const yOffset = Math.floor((imageSize - scaledHeight) / 2)

  for (let y = 0; y < scaledHeight; y += 1) {
    const sourceY = (y + 0.5) / scale - 0.5

    for (let x = 0; x < scaledWidth; x += 1) {
      const sourceX = (x + 0.5) / scale - 0.5
      const rgb = readCompositedRgb(source, renderedPixels.width, renderedPixels.height, sourceX, sourceY)
      const targetPixel = (yOffset + y) * imageSize + xOffset + x

      for (let channel = 0; channel < 3; channel += 1) {
        target[rowOffset + channel * imageArea + targetPixel] =
          normalizeChannel(rgb[channel] ?? BACKGROUND_RGB, channel, metadata)
      }
    }
  }
}

function fillBackground(
  target: Float32Array,
  rowOffset: number,
  imageArea: number,
  metadata: CnnPartPairScorerMetadata,
): void {
  for (let channel = 0; channel < 3; channel += 1) {
    const value = normalizeChannel(BACKGROUND_RGB, channel, metadata)
    const channelOffset = rowOffset + channel * imageArea

    target.fill(value, channelOffset, channelOffset + imageArea)
  }
}

function readCompositedRgb(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number, number] {
  const x0 = clampInteger(Math.floor(x), 0, width - 1)
  const y0 = clampInteger(Math.floor(y), 0, height - 1)
  const x1 = clampInteger(x0 + 1, 0, width - 1)
  const y1 = clampInteger(y0 + 1, 0, height - 1)
  const xWeight = clampUnit(x - x0)
  const yWeight = clampUnit(y - y0)
  const top = mixRgba(readRgba(source, width, x0, y0), readRgba(source, width, x1, y0), xWeight)
  const bottom = mixRgba(readRgba(source, width, x0, y1), readRgba(source, width, x1, y1), xWeight)
  const rgba = mixRgba(top, bottom, yWeight)
  const alpha = rgba[3] / 255

  return [
    rgba[0] * alpha + BACKGROUND_RGB * (1 - alpha),
    rgba[1] * alpha + BACKGROUND_RGB * (1 - alpha),
    rgba[2] * alpha + BACKGROUND_RGB * (1 - alpha),
  ]
}

function readRgba(
  source: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const offset = (y * width + x) * 4

  return [
    source[offset] ?? BACKGROUND_RGB,
    source[offset + 1] ?? BACKGROUND_RGB,
    source[offset + 2] ?? BACKGROUND_RGB,
    source[offset + 3] ?? 0,
  ]
}

function mixRgba(
  left: [number, number, number, number],
  right: [number, number, number, number],
  weight: number,
): [number, number, number, number] {
  return [
    mix(left[0], right[0], weight),
    mix(left[1], right[1], weight),
    mix(left[2], right[2], weight),
    mix(left[3], right[3], weight),
  ]
}

async function scoreRowPairs(
  rowEmbeddings: readonly RowEmbedding[],
  scorer: CnnPartPairScorer,
): Promise<Map<string, Record<string, number>>> {
  const pairScoreFeaturesByKey = new Map<string, Record<string, number>>()
  const pairQueue = createPairQueue(rowEmbeddings)

  for (let start = 0; start < pairQueue.length; start += PAIR_HEAD_BATCH_SIZE) {
    const batch = pairQueue.slice(start, start + PAIR_HEAD_BATCH_SIZE)
    const leftFeatures = new Float32Array(batch.length * scorer.metadata.featureSize)
    const rightFeatures = new Float32Array(batch.length * scorer.metadata.featureSize)

    for (let index = 0; index < batch.length; index += 1) {
      const pair = batch[index]

      if (!pair) {
        continue
      }

      leftFeatures.set(pair.left.embedding, index * scorer.metadata.featureSize)
      rightFeatures.set(pair.right.embedding, index * scorer.metadata.featureSize)
    }

    const scores = await scorePairBatch(leftFeatures, rightFeatures, batch.length, scorer)

    for (let index = 0; index < batch.length; index += 1) {
      const pair = batch[index]
      const score = scores[index]

      if (!pair || !Number.isFinite(score)) {
        continue
      }

      pairScoreFeaturesByKey.set(rowPairKey(pair.left.row.rowId, pair.right.row.rowId), {
        cachedPairScore: score ?? 0,
      })
    }
  }

  return pairScoreFeaturesByKey
}

function createPairQueue(rowEmbeddings: readonly RowEmbedding[]): Array<{
  left: RowEmbedding
  right: RowEmbedding
}> {
  const pairs: Array<{ left: RowEmbedding, right: RowEmbedding }> = []

  for (let leftIndex = 0; leftIndex < rowEmbeddings.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rowEmbeddings.length; rightIndex += 1) {
      const left = rowEmbeddings[leftIndex]
      const right = rowEmbeddings[rightIndex]

      if (!left || !right || left.row.calloutId === right.row.calloutId) {
        continue
      }

      pairs.push({ left, right })
    }
  }

  return pairs
}

async function scorePairBatch(
  leftFeatures: Float32Array,
  rightFeatures: Float32Array,
  pairCount: number,
  scorer: CnnPartPairScorer,
): Promise<Float32Array> {
  const dimensions = [pairCount, scorer.metadata.featureSize]
  const result = await scorer.pairHeadSession.run({
    leftFeatures: new scorer.ort.Tensor("float32", leftFeatures, dimensions),
    rightFeatures: new scorer.ort.Tensor("float32", rightFeatures, dimensions),
  })

  return toFloat32Array(result.scores?.data) ?? new Float32Array(pairCount)
}

function hasRenderedPixels(row: PartMatchRowInput): boolean {
  return Boolean(row.renderedPixels?.data && row.renderedPixels.width > 0 && row.renderedPixels.height > 0)
}

function normalizeRenderedPixels(renderedPixels: PartMatchRenderedPixels): Uint8ClampedArray | null {
  const expectedLength = renderedPixels.width * renderedPixels.height * 4
  const data = renderedPixels.data

  if (data instanceof Uint8ClampedArray) {
    return data.length >= expectedLength
      ? data.slice(0, expectedLength)
      : null
  }

  const bytes = new Uint8ClampedArray(expectedLength)

  if (Array.isArray(data)) {
    for (let index = 0; index < expectedLength; index += 1) {
      bytes[index] = clampByte(data[index] ?? 0)
    }

    return bytes
  }

  for (let index = 0; index < expectedLength; index += 1) {
    bytes[index] = clampByte(data[String(index)] ?? 0)
  }

  return bytes
}

function toFloat32Array(data: unknown): Float32Array | null {
  if (data instanceof Float32Array) {
    return data
  }

  return Array.isArray(data)
    ? Float32Array.from(data)
    : null
}

function normalizeChannel(
  value: number,
  channel: number,
  metadata: CnnPartPairScorerMetadata,
): number {
  return (value / 255 - metadata.mean[channel]) / metadata.std[channel]
}

function rowPairKey(leftId: string, rightId: string): string {
  return [leftId, rightId].sort().join("\0")
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function mix(left: number, right: number, weight: number): number {
  return left + (right - left) * weight
}
