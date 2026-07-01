import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  createPartMatchEmbeddingCache,
  decodeRgbaPngBytes,
  encodeRgbaPngDataUrl,
  type CreatePartMatchEmbeddingCacheResult,
  type PartMatchImageEmbedder,
} from "./part-match-embedding-cache"

const DEFAULT_OUTPUT_ROOT = path.join(
  ".bag-it",
  "private",
  "part-match-reports",
  "embedding-experiments",
)
const DEFAULT_MANUAL_ID = "ldraw-lego-training"
const DEFAULT_MODEL_ID = "Xenova/clip-vit-base-patch32"
const TRAINING_EMBEDDING_VERSION = "0.1.0"

interface LegoTrainingDataExample {
  cropHash?: string
  imagePath: string
  itemId: string
  partId: string
  view: string
}

interface LegoTrainingExamplesFile {
  examples?: LegoTrainingDataExample[]
}

interface LegoTrainingReportRow {
  bagId: string
  bagLabel: string
  calloutId: string
  color: {
    family: string
    key: string
    manualClassId: string
    manualClassTrusted: boolean
    name: string
    status: string
  }
  cropHash: string
  imageDataUrl: string
  itemId: string
  pageNumber: number
  partRegion: {
    height: number
    width: number
    x: number
    y: number
  }
  quantity: number
  rowId: string
  stepIndex: number
}

interface LegoTrainingLabelRow {
  cropHash: string
  expectedPartKey: string
  itemId: string
}

interface LegoTrainingEmbeddingSummary {
  dataset: {
    exampleCount: number
    labelPath: string
    reportPath: string
  }
  embedding: {
    outputDir: string
    rows: number
    summaryPath: string
    vectors: number
  }
  generatedAt: string
  manualId: string
  modelId: string
  options: {
    outputDir: string
    trainingDataDir: string
  }
  version: string
}

export interface RunPartMatchLegoTrainingEmbeddingCacheOptions {
  embedder?: PartMatchImageEmbedder
  generatedAt?: Date
  manualId?: string
  modelId?: string
  outputDir?: string
  trainingDataDir: string
}

export interface RunPartMatchLegoTrainingEmbeddingCacheResult {
  embedding: CreatePartMatchEmbeddingCacheResult
  labelDir: string
  labelPath: string
  outputDir: string
  reportPath: string
  summary: LegoTrainingEmbeddingSummary
  summaryPath: string
}

export async function runPartMatchLegoTrainingEmbeddingCache(
  options: RunPartMatchLegoTrainingEmbeddingCacheOptions,
): Promise<RunPartMatchLegoTrainingEmbeddingCacheResult> {
  const generatedAt = options.generatedAt ?? new Date()
  const manualId = options.manualId ?? DEFAULT_MANUAL_ID
  const modelId = options.modelId ?? DEFAULT_MODEL_ID
  const outputDir =
    options.outputDir ?? path.join(DEFAULT_OUTPUT_ROOT, `${timestampForPath(generatedAt)}-lego-training-embeddings`)
  const datasetDir = path.join(outputDir, "dataset")
  const labelDir = path.join(datasetDir, "labels")
  const reportPath = path.join(datasetDir, "report.json")
  const labelPath = path.join(labelDir, `${manualId}.json`)
  const examples = await readTrainingExamples(options.trainingDataDir)

  if (examples.length === 0) {
    throw new Error(`LEGO training data has no examples: ${options.trainingDataDir}`)
  }

  await mkdir(labelDir, { recursive: true })

  const { labels, rows } = await createReportRows({
    examples,
    manualId,
    trainingDataDir: options.trainingDataDir,
  })

  await writeJson(reportPath, {
    generatedAt: generatedAt.toISOString(),
    manualId,
    reportPath: normalizeWorkspacePath(reportPath),
    rows,
    source: {
      trainingDataDir: normalizeWorkspacePath(options.trainingDataDir),
    },
    version: TRAINING_EMBEDDING_VERSION,
  })
  await writeJson(labelPath, {
    generatedAt: generatedAt.toISOString(),
    labels,
    manualId,
    reportPath: normalizeWorkspacePath(reportPath),
    status: "active",
  })

  const embedding = await createPartMatchEmbeddingCache({
    embedder: options.embedder,
    generatedAt,
    manualId,
    modelId,
    outputDir: path.join(outputDir, "embeddings"),
    reportPaths: [reportPath],
  })
  const summary: LegoTrainingEmbeddingSummary = {
    dataset: {
      exampleCount: examples.length,
      labelPath: normalizeWorkspacePath(labelPath),
      reportPath: normalizeWorkspacePath(reportPath),
    },
    embedding: {
      outputDir: normalizeWorkspacePath(embedding.outputDir),
      rows: embedding.summary.totals.rowCount,
      summaryPath: normalizeWorkspacePath(embedding.summaryPath),
      vectors: embedding.summary.totals.embeddings,
    },
    generatedAt: generatedAt.toISOString(),
    manualId,
    modelId,
    options: {
      outputDir: normalizeWorkspacePath(outputDir),
      trainingDataDir: normalizeWorkspacePath(options.trainingDataDir),
    },
    version: TRAINING_EMBEDDING_VERSION,
  }
  const summaryPath = path.join(outputDir, "summary.json")

  await writeJson(summaryPath, summary)

  return {
    embedding,
    labelDir,
    labelPath,
    outputDir,
    reportPath,
    summary,
    summaryPath,
  }
}

async function readTrainingExamples(trainingDataDir: string): Promise<LegoTrainingDataExample[]> {
  const examplesPath = path.join(trainingDataDir, "examples.json")
  const parsed = JSON.parse(await readFile(examplesPath, "utf8")) as LegoTrainingExamplesFile

  return (parsed.examples ?? []).filter((example) =>
    example.imagePath && example.itemId && example.partId && example.view
  )
}

async function createReportRows({
  examples,
  manualId,
  trainingDataDir,
}: {
  examples: readonly LegoTrainingDataExample[]
  manualId: string
  trainingDataDir: string
}): Promise<{
  labels: LegoTrainingLabelRow[]
  rows: LegoTrainingReportRow[]
}> {
  const rows: LegoTrainingReportRow[] = []
  const labels: LegoTrainingLabelRow[] = []
  let pageNumber = 1

  for (const example of examples) {
    const imagePath = path.join(trainingDataDir, example.imagePath)
    const imageBytes = await readFile(imagePath)
    const image = decodeRgbaPngBytes(imageBytes)

    if (!image) {
      throw new Error(`Could not decode LEGO training image: ${imagePath}`)
    }

    const cropHash = example.cropHash ?? hashBytes(imageBytes)
    const rowId = example.itemId

    rows.push({
      bagId: "ldraw-lego-training",
      bagLabel: "LDraw LEGO training",
      calloutId: `view:${example.view}`,
      color: createNeutralCatalogueColor(),
      cropHash,
      imageDataUrl: encodeRgbaPngDataUrl(image),
      itemId: example.itemId,
      pageNumber,
      partRegion: {
        height: image.height,
        width: image.width,
        x: 0,
        y: 0,
      },
      quantity: 1,
      rowId,
      stepIndex: pageNumber,
    })
    labels.push({
      cropHash,
      expectedPartKey: example.partId,
      itemId: example.itemId,
    })
    pageNumber += 1
  }

  if (new Set(rows.map((row) => `${manualId}:${row.itemId}`)).size !== rows.length) {
    throw new Error("LEGO training data contains duplicate item ids.")
  }

  return {
    labels,
    rows,
  }
}

function createNeutralCatalogueColor(): LegoTrainingReportRow["color"] {
  return {
    family: "neutral",
    key: "neutral-grey",
    manualClassId: "neutral-grey",
    manualClassTrusted: true,
    name: "Neutral Gray",
    status: "resolved",
  }
}

function hashBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function normalizeWorkspacePath(value: string): string {
  const absolutePath = path.resolve(value)
  const relative = path.relative(process.cwd(), absolutePath)

  return relative.startsWith("..") ? absolutePath : relative
}

function timestampForPath(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-")
}

function writeJson(filePath: string, value: unknown): Promise<void> {
  return mkdir(path.dirname(filePath), { recursive: true })
    .then(() => writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`))
}

function readOption(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name)

  return index >= 0 ? argv[index + 1] ?? null : null
}

function parseCliArgs(argv: readonly string[]): RunPartMatchLegoTrainingEmbeddingCacheOptions {
  const trainingDataDir = readOption(argv, "--training-data-dir")

  if (!trainingDataDir) {
    throw new Error("--training-data-dir is required.")
  }

  return {
    manualId: readOption(argv, "--manual-id") ?? undefined,
    modelId: readOption(argv, "--model-id") ?? undefined,
    outputDir: readOption(argv, "--output-dir") ?? undefined,
    trainingDataDir,
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isMain) {
  runPartMatchLegoTrainingEmbeddingCache(parseCliArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(`LEGO training embeddings: ${result.summary.embedding.rows} rows, ${result.summary.embedding.vectors} vectors`)
      console.log(`Summary: ${result.summaryPath}`)
      console.log(`Embeddings: ${result.embedding.outputDir}`)
      console.log(`Labels: ${result.labelDir}`)
    })
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
}
