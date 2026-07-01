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
  createPartMatchEmbeddingCache,
  decodeRgbaPngBytes,
  encodeRgbaPng,
  encodeRgbaPngDataUrl,
  type CreatePartMatchEmbeddingCacheResult,
  type DecodedPngImage,
} from "./part-match-embedding-cache"
import {
  runPartMatchCatalogueRetrieval,
  type RunPartMatchCatalogueRetrievalResult,
} from "./part-match-catalogue-retrieval"
import {
  runPartMatchLDrawThreeRender,
  type RunPartMatchLDrawThreeRenderOptions,
  type RunPartMatchLDrawThreeRenderResult,
} from "./part-match-ldraw-three-render"

const DEFAULT_OUTPUT_ROOT = path.join(
  ".bag-it",
  "private",
  "part-match-reports",
  "embedding-experiments",
)
const DEFAULT_LDRAW_ROOT = "/Applications/Studio 2.0/ldraw"
const DEFAULT_MODEL_ID = "Xenova/clip-vit-base-patch32"
const DEFAULT_MANUAL_ID = "ldraw-catalogue-poc"
const DEFAULT_RENDER_SIZE = 256
const DEFAULT_TOP_K = 8
const DEFAULT_AUGMENTATIONS = 1
const POC_VERSION = "0.1.0"
const DEFAULT_SCORE_MODES = ["rendered-tight-min", "mean"] as const
const DEFAULT_PART_IDS = [
  "3001",
  "3002",
  "3003",
  "3004",
  "3005",
  "3008",
  "3010",
  "3020",
  "3021",
  "3022",
  "3023",
  "3024",
  "3031",
  "3032",
  "3034",
  "3040b",
  "3068b",
  "3069b",
  "3070b",
  "3460",
  "3622",
  "3623",
  "3660",
  "3665",
  "3666",
  "3710",
  "3795",
  "3832",
  "4070",
  "4073",
  "4286",
  "54200",
  "60478",
  "6141",
  "87079",
  "98138",
]

type CataloguePocScoreMode = (typeof DEFAULT_SCORE_MODES)[number]
type ThreeRenderViewName = NonNullable<RunPartMatchLDrawThreeRenderOptions["views"]>[number]

interface CataloguePocRenderSummary {
  generatedAt?: string
  ldrawRoot?: string
  outputDir: string
  parts: Array<{
    partId: string
    views: Array<{
      path: string
      view: string
    }>
  }>
  renderer?: string
  skippedParts?: Array<{
    partId: string
    reason: string
  }>
  version?: string
}

interface CataloguePocReportRow {
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

interface CataloguePocLabelRow {
  cropHash: string
  expectedPartKey: string
  itemId: string
}

export interface CataloguePocDatasetResult {
  labelDir: string
  labelPath: string
  labels: CataloguePocLabelRow[]
  partCount: number
  reportPath: string
  rows: CataloguePocReportRow[]
  rowCount: number
}

interface CataloguePocRetrievalMetric {
  eligibleRows: number
  indexPath: string
  outputDir: string
  safeCorrectRows: number
  safeRecall: number
  safeThreshold: number | null
  scoreMode: CataloguePocScoreMode
  summaryPath: string
  topKHitRows: number
  topKRecall: number
  top1Accuracy: number
  top1CorrectRows: number
  top1WrongRows: number
}

export interface CataloguePocSummary {
  availablePartIds: string[]
  dataset: {
    labelPath: string
    partCount: number
    reportPath: string
    rowCount: number
  }
  embedding: {
    outputDir: string
    rowsPath: string
    summaryPath: string
    vectorDimensions: number | null
    vectors: number
  }
  generatedAt: string
  missingPartIds: string[]
  modelId: string
  options: {
    augmentations: number
    ldrawRoot: string
    manualId: string
    outputDir: string
    renderDir: string
    renderSize: number
    scoreModes: CataloguePocScoreMode[]
    topK: number
    views: ThreeRenderViewName[]
  }
  render: {
    renderedPartIds: string[]
    skippedParts: Array<{
      partId: string
      reason: string
    }>
  }
  retrieval: CataloguePocRetrievalMetric[]
  verdict: CataloguePocVerdict
  version: string
}

export interface CataloguePocVerdict {
  reason: string
  status: "promising" | "blocked" | "inconclusive"
}

export interface RunPartMatchCataloguePocOptions {
  augmentations?: number
  generatedAt?: Date
  ldrawRoot?: string
  manualId?: string
  modelId?: string
  outputDir?: string
  partIds?: string[]
  renderDir?: string
  renderSize?: number
  scoreModes?: CataloguePocScoreMode[]
  topK?: number
  views?: ThreeRenderViewName[]
}

export interface RunPartMatchCataloguePocResult {
  dataset: CataloguePocDatasetResult
  embedding: CreatePartMatchEmbeddingCacheResult
  indexPath: string
  outputDir: string
  render: CataloguePocRenderSummary
  retrieval: RunPartMatchCatalogueRetrievalResult[]
  summary: CataloguePocSummary
  summaryPath: string
}

export async function runPartMatchCataloguePoc(
  options: RunPartMatchCataloguePocOptions = {},
): Promise<RunPartMatchCataloguePocResult> {
  const generatedAt = options.generatedAt ?? new Date()
  const outputDir = options.outputDir ?? path.join(DEFAULT_OUTPUT_ROOT, `${timestampForPath(generatedAt)}-catalogue-poc`)
  const ldrawRoot = options.ldrawRoot ?? DEFAULT_LDRAW_ROOT
  const manualId = options.manualId ?? DEFAULT_MANUAL_ID
  const modelId = options.modelId ?? DEFAULT_MODEL_ID
  const renderSize = options.renderSize ?? DEFAULT_RENDER_SIZE
  const scoreModes = options.scoreModes ?? [...DEFAULT_SCORE_MODES]
  const topK = options.topK ?? DEFAULT_TOP_K
  const augmentations = options.augmentations ?? DEFAULT_AUGMENTATIONS
  const views = options.views ?? ["iso-left", "iso-right", "top"]
  const requestedPartIds = options.partIds ?? DEFAULT_PART_IDS

  if (!Number.isInteger(augmentations) || augmentations < 1) {
    throw new Error("--augmentations must be a positive integer.")
  }

  const { availablePartIds, missingPartIds } = filterAvailablePartIds(requestedPartIds, ldrawRoot)

  if (availablePartIds.length < 3) {
    throw new Error(`Catalogue PoC needs at least 3 available LDraw parts. Found ${availablePartIds.length}.`)
  }

  await mkdir(outputDir, { recursive: true })

  const renderOutput = options.renderDir
    ? await readRenderSummary(options.renderDir)
    : await renderCatalogueParts({
        generatedAt,
        ldrawRoot,
        outputDir: path.join(outputDir, "renders"),
        partIds: availablePartIds,
        renderSize,
        views,
      })

  if (renderOutput.parts.length < 3) {
    throw new Error(`Catalogue PoC needs at least 3 rendered LDraw parts. Rendered ${renderOutput.parts.length}.`)
  }

  const dataset = await writeCataloguePocDataset({
    generatedAt,
    manualId,
    outputDir: path.join(outputDir, "dataset"),
    renderDir: renderOutput.outputDir,
    renderSize,
    renderSummary: renderOutput,
    augmentations,
  })
  const embedding = await createPartMatchEmbeddingCache({
    generatedAt,
    manualId,
    modelId,
    outputDir: path.join(outputDir, "embeddings"),
    reportPaths: [dataset.reportPath],
  })
  const retrieval = []

  for (const scoreMode of scoreModes) {
    retrieval.push(await runPartMatchCatalogueRetrieval({
      embeddingDirs: [embedding.outputDir],
      generatedAt,
      labelDir: dataset.labelDir,
      manualIds: [manualId],
      outputDir: path.join(outputDir, `retrieval-${scoreMode}`),
      scoreMode,
      topK,
    }))
  }

  const retrievalMetrics = await Promise.all(retrieval.map((result, index) =>
    createRetrievalMetric(scoreModes[index] ?? "rendered-tight-min", result),
  ))
  const summary: CataloguePocSummary = {
    availablePartIds,
    dataset: {
      labelPath: normalizeWorkspacePath(dataset.labelPath),
      partCount: dataset.partCount,
      reportPath: normalizeWorkspacePath(dataset.reportPath),
      rowCount: dataset.rowCount,
    },
    embedding: {
      outputDir: normalizeWorkspacePath(embedding.outputDir),
      rowsPath: normalizeWorkspacePath(embedding.rowsPath),
      summaryPath: normalizeWorkspacePath(embedding.summaryPath),
      vectorDimensions: embedding.summary.totals.vectorDimensions,
      vectors: embedding.summary.totals.embeddings,
    },
    generatedAt: generatedAt.toISOString(),
    missingPartIds,
    modelId,
    options: {
      ldrawRoot,
      manualId,
      outputDir: normalizeWorkspacePath(outputDir),
      renderDir: normalizeWorkspacePath(renderOutput.outputDir),
      renderSize,
      scoreModes,
      topK,
      views,
      augmentations,
    },
    render: {
      renderedPartIds: renderOutput.parts.map((part) => part.partId),
      skippedParts: renderOutput.skippedParts ?? [],
    },
    retrieval: retrievalMetrics,
    verdict: createCataloguePocVerdict(retrievalMetrics),
    version: POC_VERSION,
  }
  const summaryPath = path.join(outputDir, "catalogue-poc-summary.json")
  const indexPath = path.join(outputDir, "index.html")

  await writeJson(summaryPath, summary)
  await writeFile(indexPath, renderCataloguePocIndex(summary))

  return {
    dataset,
    embedding,
    indexPath,
    outputDir,
    render: renderOutput,
    retrieval,
    summary,
    summaryPath,
  }
}

export function filterAvailablePartIds(
  partIds: readonly string[],
  ldrawRoot: string,
): {
  availablePartIds: string[]
  missingPartIds: string[]
} {
  const seen = new Set<string>()
  const availablePartIds: string[] = []
  const missingPartIds: string[] = []

  for (const rawPartId of partIds) {
    const partId = rawPartId.trim()

    if (!partId || seen.has(partId.toLowerCase())) {
      continue
    }

    seen.add(partId.toLowerCase())

    if (existsSync(path.join(ldrawRoot, "parts", `${partId}.dat`))) {
      availablePartIds.push(partId)
    } else {
      missingPartIds.push(partId)
    }
  }

  return {
    availablePartIds,
    missingPartIds,
  }
}

export async function writeCataloguePocDataset({
  augmentations = DEFAULT_AUGMENTATIONS,
  generatedAt,
  manualId,
  outputDir,
  renderDir,
  renderSize,
  renderSummary,
}: {
  augmentations?: number
  generatedAt: Date
  manualId: string
  outputDir: string
  renderDir: string
  renderSize: number
  renderSummary: CataloguePocRenderSummary
}): Promise<CataloguePocDatasetResult> {
  await mkdir(outputDir, { recursive: true })

  const rows: CataloguePocReportRow[] = []
  const labels: CataloguePocLabelRow[] = []
  const labelDir = path.join(outputDir, "labels")
  const reportPath = path.join(outputDir, "report.json")
  const labelPath = path.join(labelDir, `${manualId}.json`)
  let pageNumber = 1

  for (const part of renderSummary.parts) {
    for (const view of part.views) {
      const imagePath = path.resolve(renderDir, view.path)
      const imageBytes = await readFile(imagePath)
      const decodedImage = decodeRgbaPngBytes(imageBytes)

      if (!decodedImage) {
        throw new Error(`Could not decode rendered PNG: ${imagePath}`)
      }

      for (let augmentationIndex = 0; augmentationIndex < augmentations; augmentationIndex += 1) {
        const itemId = `${part.partId}:${view.view}:aug-${augmentationIndex}`
        const augmentedImage = createAugmentedImage(decodedImage, augmentationIndex)
        const encodedImage = encodeRgbaPng(augmentedImage)
        const cropHash = hashBytes(encodedImage)

        rows.push({
          bagId: "ldraw-catalogue",
          bagLabel: "LDraw catalogue",
          calloutId: `view:${view.view}:aug-${augmentationIndex}`,
          color: createNeutralCatalogueColor(),
          cropHash,
          imageDataUrl: encodeRgbaPngDataUrl(augmentedImage),
          itemId,
          pageNumber,
          partRegion: {
            height: renderSize,
            width: renderSize,
            x: 0,
            y: 0,
          },
          quantity: 1,
          rowId: itemId,
          stepIndex: pageNumber,
        })
        labels.push({
          cropHash,
          expectedPartKey: part.partId,
          itemId,
        })
        pageNumber += 1
      }
    }
  }

  await writeJson(reportPath, {
    generatedAt: generatedAt.toISOString(),
    manualId,
    reportPath: normalizeWorkspacePath(reportPath),
    rows,
    source: {
      renderDir: normalizeWorkspacePath(renderDir),
      renderer: renderSummary.renderer ?? "unknown",
    },
    version: POC_VERSION,
  })
  await writeJson(labelPath, {
    generatedAt: generatedAt.toISOString(),
    labels,
    manualId,
    reportPath: normalizeWorkspacePath(reportPath),
    status: "active",
  })

  return {
    labelDir,
    labelPath,
    labels,
    partCount: renderSummary.parts.length,
    reportPath,
    rows,
    rowCount: rows.length,
  }
}

function createAugmentedImage(image: DecodedPngImage, augmentationIndex: number): DecodedPngImage {
  const transforms = [
    { dx: 0, dy: 0, scale: 1 },
    { dx: -0.035, dy: 0.025, scale: 0.93 },
    { dx: 0.035, dy: -0.025, scale: 0.88 },
    { dx: 0.02, dy: 0.03, scale: 0.96 },
  ]
  const transform = transforms[augmentationIndex % transforms.length] ?? transforms[0]
  const output = new Uint8ClampedArray(image.width * image.height * 4)
  const centerX = image.width / 2
  const centerY = image.height / 2
  const shiftX = transform.dx * image.width
  const shiftY = transform.dy * image.height

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const sourceX = Math.round((x - centerX - shiftX) / transform.scale + centerX)
      const sourceY = Math.round((y - centerY - shiftY) / transform.scale + centerY)
      const targetIndex = (y * image.width + x) * 4

      if (sourceX < 0 || sourceY < 0 || sourceX >= image.width || sourceY >= image.height) {
        continue
      }

      const sourceIndex = (sourceY * image.width + sourceX) * 4

      output[targetIndex] = image.data[sourceIndex] ?? 0
      output[targetIndex + 1] = image.data[sourceIndex + 1] ?? 0
      output[targetIndex + 2] = image.data[sourceIndex + 2] ?? 0
      output[targetIndex + 3] = image.data[sourceIndex + 3] ?? 0
    }
  }

  return {
    data: output,
    height: image.height,
    width: image.width,
  }
}

export function createCataloguePocVerdict(
  metrics: readonly CataloguePocRetrievalMetric[],
): CataloguePocVerdict {
  if (metrics.length === 0 || metrics.every((metric) => metric.eligibleRows === 0)) {
    return {
      reason: "No eligible retrieval rows. Render/embedding pipeline did not create a useful catalogue set.",
      status: "blocked",
    }
  }

  const best = metrics.reduce((currentBest, metric) =>
    metric.top1Accuracy > currentBest.top1Accuracy ? metric : currentBest
  )
  const bestTopK = metrics.reduce((currentBest, metric) =>
    metric.topKRecall > currentBest.topKRecall ? metric : currentBest
  )
  const safest = metrics.reduce((currentBest, metric) =>
    metric.safeRecall > currentBest.safeRecall ? metric : currentBest
  )

  if (best.top1WrongRows === 0 && best.top1Accuracy >= 0.95) {
    return {
      reason: `${best.scoreMode} separated catalogue views with ${best.top1CorrectRows}/${best.eligibleRows} top-1 correct and no wrong top-1 matches. Manual-to-catalogue bridge still needs mapped manual examples.`,
      status: "promising",
    }
  }

  if (best.top1Accuracy >= 0.8 || bestTopK.topKRecall >= 0.9 || safest.safeCorrectRows > 0) {
    return {
      reason: `Catalogue self-retrieval has signal (${best.top1CorrectRows}/${best.eligibleRows} best top-1, ${bestTopK.topKHitRows}/${bestTopK.eligibleRows} best top-K, ${safest.safeCorrectRows}/${safest.eligibleRows} safe). Needs stronger scorer/reranker before manual use.`,
      status: "inconclusive",
    }
  }

  return {
    reason: `Catalogue self-retrieval is weak (${best.top1CorrectRows}/${best.eligibleRows} best top-1, ${bestTopK.topKHitRows}/${bestTopK.eligibleRows} best top-K). This embedding setup is unlikely to work.`,
    status: "blocked",
  }
}

async function createRetrievalMetric(
  scoreMode: CataloguePocScoreMode,
  result: RunPartMatchCatalogueRetrievalResult,
): Promise<CataloguePocRetrievalMetric> {
  const predictions = JSON.parse(await readFile(result.predictionsPath, "utf8")) as {
    predictions?: Array<{
      expectedPartKey?: string
      topK?: Array<{
        expectedPartKey?: string
      }>
    }>
  }
  const predictionRows = predictions.predictions ?? []
  const topKHitRows = predictionRows.filter((prediction) =>
    prediction.topK?.some((neighbor) => neighbor.expectedPartKey === prediction.expectedPartKey),
  ).length

  return {
    eligibleRows: result.summary.totals.eligibleRows,
    indexPath: normalizeWorkspacePath(result.indexPath),
    outputDir: normalizeWorkspacePath(result.outputDir),
    safeCorrectRows: result.summary.totals.safeCorrectRows,
    safeRecall: result.summary.totals.safeRecall,
    safeThreshold: result.summary.safeThreshold,
    scoreMode,
    summaryPath: normalizeWorkspacePath(result.summaryPath),
    topKHitRows,
    topKRecall: result.summary.totals.eligibleRows === 0
      ? 0
      : topKHitRows / result.summary.totals.eligibleRows,
    top1Accuracy: result.summary.totals.top1Accuracy,
    top1CorrectRows: result.summary.totals.top1CorrectRows,
    top1WrongRows: result.summary.totals.top1WrongRows,
  }
}

async function readRenderSummary(renderDir: string): Promise<CataloguePocRenderSummary> {
  const rendersPath = path.join(renderDir, "renders.json")

  if (!existsSync(rendersPath)) {
    throw new Error(`Missing Three LDraw render summary: ${rendersPath}`)
  }

  const parsed = JSON.parse(await readFile(rendersPath, "utf8")) as CataloguePocRenderSummary

  return {
    ...parsed,
    outputDir: renderDir,
  }
}

async function renderCatalogueParts({
  generatedAt,
  ldrawRoot,
  outputDir,
  partIds,
  renderSize,
  views,
}: {
  generatedAt: Date
  ldrawRoot: string
  outputDir: string
  partIds: string[]
  renderSize: number
  views: ThreeRenderViewName[]
}): Promise<CataloguePocRenderSummary> {
  try {
    return createRenderSummary(await runPartMatchLDrawThreeRender({
      generatedAt,
      ldrawRoot,
      outputDir,
      partIds,
      renderSize,
      views,
    }))
  } catch {
    return renderCataloguePartsOneByOne({
      generatedAt,
      ldrawRoot,
      outputDir,
      partIds,
      renderSize,
      views,
    })
  }
}

async function renderCataloguePartsOneByOne({
  generatedAt,
  ldrawRoot,
  outputDir,
  partIds,
  renderSize,
  views,
}: {
  generatedAt: Date
  ldrawRoot: string
  outputDir: string
  partIds: string[]
  renderSize: number
  views: ThreeRenderViewName[]
}): Promise<CataloguePocRenderSummary> {
  const parts: CataloguePocRenderSummary["parts"] = []
  const skippedParts: NonNullable<CataloguePocRenderSummary["skippedParts"]> = []

  for (const partId of partIds) {
    const partOutputDir = path.join(outputDir, "parts", safeFileName(partId))

    try {
      const partRender = await runPartMatchLDrawThreeRender({
        generatedAt,
        ldrawRoot,
        outputDir: partOutputDir,
        partIds: [partId],
        renderSize,
        views,
      })
      const renderedPart = partRender.summary.parts[0]

      if (renderedPart) {
        parts.push({
          partId,
          views: renderedPart.views.map((view) => ({
            path: path.join("parts", safeFileName(partId), view.path),
            view: view.view,
          })),
        })
      }
    } catch (error) {
      skippedParts.push({
        partId,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const summary: CataloguePocRenderSummary = {
    generatedAt: generatedAt.toISOString(),
    ldrawRoot,
    outputDir,
    parts,
    renderer: "three-ldraw-loader-webgl-tolerant",
    skippedParts,
    version: POC_VERSION,
  }

  await mkdir(outputDir, { recursive: true })
  await writeJson(path.join(outputDir, "renders.json"), summary)
  await writeFile(path.join(outputDir, "index.html"), renderTolerantRenderIndex(summary))

  return summary
}

function createRenderSummary(
  result: RunPartMatchLDrawThreeRenderResult,
): CataloguePocRenderSummary {
  return {
    ...result.summary,
    outputDir: result.outputDir,
  }
}

function createNeutralCatalogueColor(): CataloguePocReportRow["color"] {
  return {
    family: "catalogue-neutral",
    key: "ldraw-neutral",
    manualClassId: "ldraw-neutral",
    manualClassTrusted: true,
    name: "LDraw Neutral",
    status: "resolved",
  }
}

function renderCataloguePocIndex(summary: CataloguePocSummary): string {
  const retrievalRows = summary.retrieval.map((metric) => `
    <tr>
      <td>${escapeHtml(metric.scoreMode)}</td>
      <td>${metric.top1CorrectRows}/${metric.eligibleRows}</td>
      <td>${metric.topKHitRows}/${metric.eligibleRows}</td>
      <td>${metric.top1WrongRows}</td>
      <td>${metric.safeCorrectRows}/${metric.eligibleRows}</td>
      <td><a href="${escapeAttribute(relativeLink(summary.options.outputDir, metric.indexPath))}">open</a></td>
    </tr>
  `).join("")

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Part match catalogue PoC</title>
  <style>
    body { color: #14213d; font-family: system-ui, sans-serif; margin: 24px; }
    a { color: #007a3d; }
    table { border-collapse: collapse; margin-top: 16px; min-width: 720px; }
    th, td { border-bottom: 1px solid #d8ded8; padding: 8px 12px; text-align: left; }
    .verdict { background: #f2f7f1; border: 1px solid #d7e1d5; border-radius: 8px; margin: 16px 0; padding: 16px; }
    .meta { color: #4a5568; }
  </style>
</head>
<body>
  <h1>Part match catalogue PoC</h1>
  <div class="verdict">
    <h2>${escapeHtml(summary.verdict.status)}</h2>
    <p>${escapeHtml(summary.verdict.reason)}</p>
  </div>
  <p class="meta">${summary.dataset.partCount} parts · ${summary.dataset.rowCount} rendered views · ${summary.embedding.vectors} vectors · ${escapeHtml(summary.modelId)}</p>
  <p><a href="${escapeAttribute(relativeLink(summary.options.outputDir, path.join(summary.options.renderDir, "index.html")))}">Render sheet</a> · <a href="${escapeAttribute(relativeLink(summary.options.outputDir, path.join(summary.embedding.outputDir, "index.html")))}">Embedding sheet</a></p>
  <table>
    <thead>
      <tr>
        <th>Score mode</th>
        <th>Top-1 correct</th>
        <th>Top-K hit</th>
        <th>Top-1 wrong</th>
        <th>Safe rows</th>
        <th>Report</th>
      </tr>
    </thead>
    <tbody>${retrievalRows}</tbody>
  </table>
  ${summary.render.skippedParts.length > 0
    ? `<h2>Skipped render parts</h2><ul>${summary.render.skippedParts.map((part) => `<li>${escapeHtml(part.partId)}: ${escapeHtml(part.reason)}</li>`).join("")}</ul>`
    : ""}
</body>
</html>
`
}

function renderTolerantRenderIndex(summary: CataloguePocRenderSummary): string {
  const cards = summary.parts.flatMap((part) =>
    part.views.map((view) => `
      <article>
        <h2>${escapeHtml(part.partId)} · ${escapeHtml(view.view)}</h2>
        <img src="${escapeAttribute(view.path)}" alt="${escapeAttribute(`${part.partId} ${view.view}`)}" />
      </article>
    `)
  ).join("")

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Part match tolerant LDraw renders</title>
  <style>
    body { color: #14213d; font-family: system-ui, sans-serif; margin: 24px; }
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
    article { border: 1px solid #d8ded8; border-radius: 8px; padding: 12px; }
    img { background: #f4f6f0; border: 1px solid #d8ded8; max-width: 100%; }
  </style>
</head>
<body>
  <h1>Part match tolerant LDraw renders</h1>
  <p>${summary.parts.length} parts rendered · ${summary.skippedParts?.length ?? 0} skipped</p>
  <div class="grid">${cards}</div>
</body>
</html>
`
}

function relativeLink(fromDir: string, toPath: string): string {
  const relative = path.relative(path.resolve(fromDir), path.resolve(toPath))

  return relative || "."
}

function hashBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex")
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

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-")
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

function parseList(value: string | undefined): string[] {
  return value?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? []
}

function parseCliArgs(argv: readonly string[]): RunPartMatchCataloguePocOptions {
  const options: RunPartMatchCataloguePocOptions = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === "--ldraw-root" && next) {
      options.ldrawRoot = next
      index += 1
      continue
    }

    if (arg === "--augmentations" && next) {
      options.augmentations = Number.parseInt(next, 10)
      index += 1
      continue
    }

    if (arg === "--manual-id" && next) {
      options.manualId = next
      index += 1
      continue
    }

    if (arg === "--model-id" && next) {
      options.modelId = next
      index += 1
      continue
    }

    if (arg === "--output-dir" && next) {
      options.outputDir = next
      index += 1
      continue
    }

    if (arg === "--part-ids" && next) {
      options.partIds = parseList(next)
      index += 1
      continue
    }

    if (arg === "--render-dir" && next) {
      options.renderDir = next
      index += 1
      continue
    }

    if (arg === "--render-size" && next) {
      options.renderSize = Number.parseInt(next, 10)
      index += 1
      continue
    }

    if (arg === "--score-modes" && next) {
      options.scoreModes = parseList(next).map((scoreMode) => {
        if (scoreMode !== "mean" && scoreMode !== "rendered-tight-min") {
          throw new Error(`Unsupported score mode: ${scoreMode}`)
        }

        return scoreMode
      })
      index += 1
      continue
    }

    if (arg === "--top-k" && next) {
      options.topK = Number.parseInt(next, 10)
      index += 1
      continue
    }

    if (arg === "--views" && next) {
      options.views = parseList(next) as ThreeRenderViewName[]
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isMain) {
  runPartMatchCataloguePoc(parseCliArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(`Part-match catalogue PoC: ${result.summary.verdict.status}`)
      console.log(result.summary.verdict.reason)
      console.log(`Summary: ${result.summaryPath}`)
      console.log(`Index: ${result.indexPath}`)
    })
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
}
