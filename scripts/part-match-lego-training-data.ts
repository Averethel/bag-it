import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  decodeRgbaPngBytes,
  encodeRgbaPng,
  type DecodedPngImage,
} from "./part-match-embedding-cache"
import {
  inferPartAttributes,
  type PartAttributeLabels,
} from "./part-match-attribute-spike"
import {
  runPartMatchLDrawThreeRender,
  type RunPartMatchLDrawThreeRenderOptions,
} from "./part-match-ldraw-three-render"

const DEFAULT_OUTPUT_ROOT = path.join(
  ".bag-it",
  "private",
  "part-match-reports",
  "embedding-experiments",
)
const DEFAULT_LDRAW_ROOT = "/Applications/Studio 2.0/ldraw"
const DEFAULT_OUTPUT_SIZE = 96
const DEFAULT_RENDER_SIZE = 256
const DEFAULT_AUGMENTATIONS = 5
const DEFAULT_MAX_NEGATIVES_PER_EXAMPLE = 4
const DEFAULT_MAX_BOM_PARTS = 180
const DEFAULT_FOLD_COUNT = 5
const DEFAULT_VALIDATION_FOLD = 0
const TRAINING_DATA_VERSION = "0.1.0"
const DEFAULT_VIEWS = ["iso-left", "iso-right"] as const
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
  "3666",
  "3710",
  "3795",
  "3832",
  "4070",
  "4286",
  "54200",
  "60478",
  "6141",
  "87079",
  "98138",
]

type ThreeRenderViewName = NonNullable<RunPartMatchLDrawThreeRenderOptions["views"]>[number]
type PairTarget = 0 | 1
type PairSplit = "train" | "validation" | "bridge"
type PairKind =
  | "positive-same-part-same-view"
  | "negative-same-signature"
  | "negative-same-category-footprint"
  | "negative-same-category"
  | "negative-same-footprint"
  | "negative-nearest-geometry"

interface RenderSummary {
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

interface TrainingExample {
  attributes: PartAttributeLabels
  augmentationIndex: number
  cropHash: string
  exampleId: string
  fold: number
  imagePath: string
  itemId: string
  partId: string
  sourceRenderPath: string
  title: string
  view: string
}

interface TrainingPair {
  kind: PairKind
  leftExampleId: string
  leftPartId: string
  pairId: string
  partFolds: number[]
  reason: string
  rightExampleId: string
  rightPartId: string
  split: PairSplit
  target: PairTarget
  view: string
}

interface SkippedTrainingPart {
  partId: string
  reason: string
}

interface BomPartSelectionSummary {
  csvPaths: string[]
  ldrawResolvedParts: number
  missingParts: Array<{
    partId: string
    quantity: number
  }>
  selectedPartIds: string[]
  selectedParts: number
  selectedQuantity: number
  totalQuantity: number
  totalRows: number
  uniqueParts: number
}

interface TrainingDataSummary {
  bom?: BomPartSelectionSummary
  examples: {
    count: number
    imageSize: number
    validationFold: number
  }
  folds: Record<string, number>
  generatedAt: string
  options: {
    augmentations: number
    foldCount: number
    ldrawRoot: string
    maxNegativesPerExample: number
    maxParts: number
    outputDir: string
    outputSize: number
    partIds: string[] | null
    renderDir: string
    renderSize: number
    validationFold: number
    views: string[]
  }
  pairs: {
    byKind: Record<string, number>
    bySplit: Record<string, number>
    negative: number
    positive: number
    total: number
  }
  render: {
    renderedParts: number
    skippedParts: SkippedTrainingPart[]
  }
  version: string
}

export interface RunPartMatchLegoTrainingDataOptions {
  augmentations?: number
  bomCsvs?: string[]
  foldCount?: number
  generatedAt?: Date
  ldrawRoot?: string
  maxParts?: number
  maxNegativesPerExample?: number
  outputDir?: string
  outputSize?: number
  partIds?: string[]
  renderDir?: string
  renderSize?: number
  validationFold?: number
  views?: ThreeRenderViewName[]
}

export interface RunPartMatchLegoTrainingDataResult {
  examplesPath: string
  indexPath: string
  outputDir: string
  pairsPath: string
  partsPath: string
  summary: TrainingDataSummary
  summaryPath: string
}

export async function runPartMatchLegoTrainingData(
  options: RunPartMatchLegoTrainingDataOptions = {},
): Promise<RunPartMatchLegoTrainingDataResult> {
  const generatedAt = options.generatedAt ?? new Date()
  const outputDir = options.outputDir ?? path.join(DEFAULT_OUTPUT_ROOT, `${timestampForPath(generatedAt)}-lego-training-data`)
  const ldrawRoot = options.ldrawRoot ?? DEFAULT_LDRAW_ROOT
  const outputSize = options.outputSize ?? DEFAULT_OUTPUT_SIZE
  const renderSize = options.renderSize ?? DEFAULT_RENDER_SIZE
  const augmentations = options.augmentations ?? DEFAULT_AUGMENTATIONS
  const maxParts = options.maxParts ?? DEFAULT_MAX_BOM_PARTS
  const maxNegativesPerExample = options.maxNegativesPerExample ?? DEFAULT_MAX_NEGATIVES_PER_EXAMPLE
  const foldCount = options.foldCount ?? DEFAULT_FOLD_COUNT
  const validationFold = options.validationFold ?? DEFAULT_VALIDATION_FOLD
  const views = options.views ?? [...DEFAULT_VIEWS]

  validatePositiveInteger("augmentations", augmentations)
  validatePositiveInteger("outputSize", outputSize)
  validatePositiveInteger("foldCount", foldCount)
  validatePositiveInteger("maxParts", maxParts)
  validatePositiveInteger("maxNegativesPerExample", maxNegativesPerExample)

  const bomSelection = options.bomCsvs?.length
    ? await selectBomPartIds({
        bomCsvs: options.bomCsvs,
        ldrawRoot,
        maxParts,
      })
    : null
  const requestedPartIds = options.partIds ?? bomSelection?.selectedPartIds ?? null
  const partIds = requestedPartIds ?? DEFAULT_PART_IDS

  await mkdir(outputDir, { recursive: true })

  const renderSummary = options.renderDir
    ? await readRenderSummary(options.renderDir)
    : await renderPartsOneByOne({
        generatedAt,
        ldrawRoot,
        outputDir: path.join(outputDir, "renders"),
        partIds,
        renderSize,
        views,
      })
  const { examples, skippedParts } = await writeTrainingExamples({
    augmentations,
    foldCount,
    ldrawRoot,
    outputDir,
    outputSize,
    renderDir: renderSummary.outputDir,
    renderSummary,
    selectedPartIds: requestedPartIds,
    views,
  })

  if (examples.length === 0) {
    throw new Error("Training data generation produced zero examples.")
  }

  const pairs = createTrainingPairs({
    examples,
    maxNegativesPerExample,
    validationFold,
  })

  if (pairs.every((pair) => pair.target === 0) || pairs.every((pair) => pair.target === 1)) {
    throw new Error("Training data needs both positive and negative pairs.")
  }

  const summary = createSummary({
    augmentations,
    examples,
    foldCount,
    generatedAt,
    ldrawRoot,
    maxNegativesPerExample,
    maxParts,
    outputDir,
    outputSize,
    partIds: requestedPartIds,
    pairs,
    renderDir: renderSummary.outputDir,
    renderSize,
    renderSummary,
    bomSelection,
    skippedParts,
    validationFold,
    views,
  })
  const examplesPath = path.join(outputDir, "examples.json")
  const pairsPath = path.join(outputDir, "pairs.json")
  const partsPath = path.join(outputDir, "parts.json")
  const summaryPath = path.join(outputDir, "summary.json")
  const indexPath = path.join(outputDir, "index.html")

  await writeJson(examplesPath, {
    examples,
    generatedAt: generatedAt.toISOString(),
    version: TRAINING_DATA_VERSION,
  })
  await writeJson(pairsPath, {
    generatedAt: generatedAt.toISOString(),
    pairs,
    version: TRAINING_DATA_VERSION,
  })
  await writeJson(partsPath, {
    generatedAt: generatedAt.toISOString(),
    parts: createPartMetadata(examples),
    skippedParts,
    version: TRAINING_DATA_VERSION,
  })
  await writeJson(summaryPath, summary)
  await writeFile(indexPath, renderIndexHtml({
    examples,
    outputDir,
    pairs,
    summary,
  }))

  return {
    examplesPath,
    indexPath,
    outputDir,
    pairsPath,
    partsPath,
    summary,
    summaryPath,
  }
}

async function writeTrainingExamples({
  augmentations,
  foldCount,
  ldrawRoot,
  outputDir,
  outputSize,
  renderDir,
  renderSummary,
  selectedPartIds,
  views,
}: {
  augmentations: number
  foldCount: number
  ldrawRoot: string
  outputDir: string
  outputSize: number
  renderDir: string
  renderSummary: RenderSummary
  selectedPartIds: readonly string[] | null
  views: readonly string[]
}): Promise<{
  examples: TrainingExample[]
  skippedParts: SkippedTrainingPart[]
}> {
  const examples: TrainingExample[] = []
  const skippedParts: SkippedTrainingPart[] = [...renderSummary.skippedParts ?? []]
  const selectedPartIdSet = selectedPartIds ? new Set(selectedPartIds) : null
  const selectedViews = new Set(views)

  for (const part of renderSummary.parts) {
    if (selectedPartIdSet && !selectedPartIdSet.has(part.partId)) {
      continue
    }

    const title = await readLDrawPartTitle(ldrawRoot, part.partId)

    if (!title || title.startsWith("~Moved")) {
      skippedParts.push({
        partId: part.partId,
        reason: title ? `alias-title:${title}` : "missing-ldraw-title",
      })
      continue
    }

    const attributes = inferPartAttributes({ partId: part.partId, title })

    if (attributes.category === "other") {
      skippedParts.push({
        partId: part.partId,
        reason: `unsupported-title:${title}`,
      })
      continue
    }

    for (const view of part.views.filter((entry) => selectedViews.has(entry.view))) {
      const sourceRenderPath = path.resolve(renderDir, view.path)
      const sourceImage = decodeRgbaPngBytes(await readFile(sourceRenderPath))

      if (!sourceImage) {
        throw new Error(`Could not decode rendered PNG: ${sourceRenderPath}`)
      }

      for (let augmentationIndex = 0; augmentationIndex < augmentations; augmentationIndex += 1) {
        const exampleId = createExampleId(part.partId, view.view, augmentationIndex)
        const trainingImage = createTrainingImage(sourceImage, {
          augmentationIndex,
          outputSize,
        })
        const imageBytes = encodeRgbaPng(trainingImage)
        const imagePath = path.join("images", safeFileName(part.partId), safeFileName(view.view), `aug-${augmentationIndex}.png`)

        await mkdir(path.dirname(path.join(outputDir, imagePath)), { recursive: true })
        await writeFile(path.join(outputDir, imagePath), imageBytes)

        examples.push({
          attributes,
          augmentationIndex,
          cropHash: hashBytes(imageBytes),
          exampleId,
          fold: stableFold(part.partId, foldCount),
          imagePath,
          itemId: `${part.partId}:${view.view}:aug-${augmentationIndex}`,
          partId: part.partId,
          sourceRenderPath: normalizeWorkspacePath(sourceRenderPath),
          title,
          view: view.view,
        })
      }
    }
  }

  return {
    examples,
    skippedParts,
  }
}

function createTrainingImage(
  image: DecodedPngImage,
  options: {
    augmentationIndex: number
    outputSize: number
  },
): DecodedPngImage {
  const bounds = findAlphaBounds(image)
  const transform = augmentationTransform(options.augmentationIndex)
  const sourceSide = Math.max(bounds.width, bounds.height) * transform.scale
  const centerX = bounds.x + bounds.width / 2 + transform.dx * bounds.width
  const centerY = bounds.y + bounds.height / 2 + transform.dy * bounds.height
  const data = new Uint8ClampedArray(options.outputSize * options.outputSize * 4)

  for (let y = 0; y < options.outputSize; y += 1) {
    for (let x = 0; x < options.outputSize; x += 1) {
      const sourceX = Math.round(centerX + (x / Math.max(1, options.outputSize - 1) - 0.5) * sourceSide)
      const sourceY = Math.round(centerY + (y / Math.max(1, options.outputSize - 1) - 0.5) * sourceSide)
      const targetIndex = (y * options.outputSize + x) * 4

      if (sourceX < 0 || sourceY < 0 || sourceX >= image.width || sourceY >= image.height) {
        continue
      }

      const sourceIndex = (sourceY * image.width + sourceX) * 4
      const alpha = image.data[sourceIndex + 3] ?? 0

      data[targetIndex] = alpha > 0 ? image.data[sourceIndex] ?? 0 : 0
      data[targetIndex + 1] = alpha > 0 ? image.data[sourceIndex + 1] ?? 0 : 0
      data[targetIndex + 2] = alpha > 0 ? image.data[sourceIndex + 2] ?? 0 : 0
      data[targetIndex + 3] = alpha
    }
  }

  return {
    data,
    height: options.outputSize,
    width: options.outputSize,
  }
}

function augmentationTransform(index: number): {
  dx: number
  dy: number
  scale: number
} {
  const transforms = [
    { dx: 0, dy: 0, scale: 1.28 },
    { dx: -0.035, dy: 0.025, scale: 1.2 },
    { dx: 0.035, dy: -0.025, scale: 1.36 },
    { dx: 0.02, dy: 0.035, scale: 1.16 },
    { dx: -0.02, dy: -0.035, scale: 1.44 },
    { dx: 0.05, dy: 0.01, scale: 1.24 },
    { dx: -0.05, dy: -0.01, scale: 1.32 },
  ]

  return transforms[index % transforms.length] ?? transforms[0]
}

function findAlphaBounds(image: DecodedPngImage): {
  height: number
  width: number
  x: number
  y: number
} {
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.data[(y * image.width + x) * 4 + 3] ?? 0

      if (alpha <= 8) {
        continue
      }

      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) {
    return {
      height: image.height,
      width: image.width,
      x: 0,
      y: 0,
    }
  }

  return {
    height: maxY - minY + 1,
    width: maxX - minX + 1,
    x: minX,
    y: minY,
  }
}

function createTrainingPairs({
  examples,
  maxNegativesPerExample,
  validationFold,
}: {
  examples: readonly TrainingExample[]
  maxNegativesPerExample: number
  validationFold: number
}): TrainingPair[] {
  const pairs: TrainingPair[] = []
  const examplesByPartView = groupBy(examples, (example) => `${example.partId}|${example.view}`)
  const pairKeys = new Set<string>()

  for (const group of examplesByPartView.values()) {
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const left = group[leftIndex]
        const right = group[rightIndex]

        if (!left || !right) {
          continue
        }

        addPair(pairs, pairKeys, createPair({
          kind: "positive-same-part-same-view",
          left,
          reason: "same LDraw part id, same rendered view, different augmentation",
          right,
          target: 1,
          validationFold,
        }))
      }
    }
  }

  for (const left of examples) {
    const candidates = examples
      .filter((right) => right.partId !== left.partId && right.view === left.view)
      .map((right) => ({
        kind: negativeKind(left, right),
        right,
        score: negativeHardness(left, right),
      }))
      .sort((a, b) =>
        Number(b.right.fold === left.fold) - Number(a.right.fold === left.fold) ||
        b.score - a.score ||
        a.right.partId.localeCompare(b.right.partId) ||
        a.right.exampleId.localeCompare(b.right.exampleId),
      )
      .slice(0, maxNegativesPerExample)

    for (const candidate of candidates) {
      addPair(pairs, pairKeys, createPair({
        kind: candidate.kind,
        left,
        reason: negativeReason(left, candidate.right, candidate.kind),
        right: candidate.right,
        target: 0,
        validationFold,
      }))
    }
  }

  return pairs.sort((left, right) =>
    left.target - right.target ||
    left.kind.localeCompare(right.kind) ||
    left.leftExampleId.localeCompare(right.leftExampleId) ||
    left.rightExampleId.localeCompare(right.rightExampleId),
  )
}

function addPair(
  pairs: TrainingPair[],
  pairKeys: Set<string>,
  pair: TrainingPair,
): void {
  const key = canonicalPairKey(pair.leftExampleId, pair.rightExampleId)

  if (pairKeys.has(key)) {
    return
  }

  pairKeys.add(key)
  pairs.push(pair)
}

function createPair({
  kind,
  left,
  reason,
  right,
  target,
  validationFold,
}: {
  kind: PairKind
  left: TrainingExample
  reason: string
  right: TrainingExample
  target: PairTarget
  validationFold: number
}): TrainingPair {
  const [first, second] = left.exampleId.localeCompare(right.exampleId) <= 0
    ? [left, right]
    : [right, left]
  const partFolds = [...new Set([first.fold, second.fold])].sort((a, b) => a - b)

  return {
    kind,
    leftExampleId: first.exampleId,
    leftPartId: first.partId,
    pairId: `${first.exampleId}__${second.exampleId}`,
    partFolds,
    reason,
    rightExampleId: second.exampleId,
    rightPartId: second.partId,
    split: pairSplit(partFolds, validationFold),
    target,
    view: first.view === second.view ? first.view : "mixed",
  }
}

function negativeKind(left: TrainingExample, right: TrainingExample): PairKind {
  if (left.attributes.signature === right.attributes.signature) {
    return "negative-same-signature"
  }

  if (
    left.attributes.category === right.attributes.category &&
    left.attributes.footprint === right.attributes.footprint
  ) {
    return "negative-same-category-footprint"
  }

  if (left.attributes.category === right.attributes.category) {
    return "negative-same-category"
  }

  if (left.attributes.footprint !== "unknown" && left.attributes.footprint === right.attributes.footprint) {
    return "negative-same-footprint"
  }

  return "negative-nearest-geometry"
}

function negativeHardness(left: TrainingExample, right: TrainingExample): number {
  const signatureBonus = left.attributes.signature === right.attributes.signature ? 100 : 0
  const categoryFootprintBonus =
    left.attributes.category === right.attributes.category &&
    left.attributes.footprint === right.attributes.footprint
      ? 80
      : 0
  const categoryBonus = left.attributes.category === right.attributes.category ? 40 : 0
  const footprintBonus = left.attributes.footprint === right.attributes.footprint ? 25 : 0
  const widthDelta = Math.abs((left.attributes.footprintWidth ?? 0) - (right.attributes.footprintWidth ?? 0))
  const lengthDelta = Math.abs((left.attributes.footprintLength ?? 0) - (right.attributes.footprintLength ?? 0))

  return signatureBonus + categoryFootprintBonus + categoryBonus + footprintBonus - widthDelta - lengthDelta
}

function negativeReason(left: TrainingExample, right: TrainingExample, kind: PairKind): string {
  if (kind === "negative-same-signature") {
    return `different part ids share inferred signature ${left.attributes.signature}`
  }

  if (kind === "negative-same-category-footprint") {
    return `same ${left.attributes.category} ${left.attributes.footprint}, different modifier/signature`
  }

  if (kind === "negative-same-category") {
    return `same category ${left.attributes.category}, different footprint or modifier`
  }

  if (kind === "negative-same-footprint") {
    return `same footprint ${left.attributes.footprint}, different category`
  }

  return `nearest available same-view negative: ${left.attributes.signature} vs ${right.attributes.signature}`
}

function pairSplit(partFolds: readonly number[], validationFold: number): PairSplit {
  if (partFolds.length === 1 && partFolds[0] === validationFold) {
    return "validation"
  }

  if (!partFolds.includes(validationFold)) {
    return "train"
  }

  return "bridge"
}

function createSummary({
  augmentations,
  bomSelection,
  examples,
  foldCount,
  generatedAt,
  ldrawRoot,
  maxParts,
  maxNegativesPerExample,
  outputDir,
  outputSize,
  partIds,
  pairs,
  renderDir,
  renderSize,
  renderSummary,
  skippedParts,
  validationFold,
  views,
}: {
  augmentations: number
  bomSelection: BomPartSelectionSummary | null
  examples: readonly TrainingExample[]
  foldCount: number
  generatedAt: Date
  ldrawRoot: string
  maxParts: number
  maxNegativesPerExample: number
  outputDir: string
  outputSize: number
  partIds: readonly string[] | null
  pairs: readonly TrainingPair[]
  renderDir: string
  renderSize: number
  renderSummary: RenderSummary
  skippedParts: readonly SkippedTrainingPart[]
  validationFold: number
  views: readonly string[]
}): TrainingDataSummary {
  return {
    ...(bomSelection ? { bom: bomSelection } : {}),
    examples: {
      count: examples.length,
      imageSize: outputSize,
      validationFold,
    },
    folds: Object.fromEntries(
      [...new Set(examples.map((example) => example.partId))]
        .sort()
        .map((partId) => [partId, stableFold(partId, foldCount)]),
    ),
    generatedAt: generatedAt.toISOString(),
    options: {
      augmentations,
      foldCount,
      ldrawRoot,
      maxNegativesPerExample,
      maxParts,
      outputDir: normalizeWorkspacePath(outputDir),
      outputSize,
      partIds: partIds ? [...partIds] : null,
      renderDir: normalizeWorkspacePath(renderDir),
      renderSize,
      validationFold,
      views: [...views],
    },
    pairs: {
      byKind: countBy(pairs, (pair) => pair.kind),
      bySplit: countBy(pairs, (pair) => pair.split),
      negative: pairs.filter((pair) => pair.target === 0).length,
      positive: pairs.filter((pair) => pair.target === 1).length,
      total: pairs.length,
    },
    render: {
      renderedParts: renderSummary.parts.length,
      skippedParts: [...skippedParts],
    },
    version: TRAINING_DATA_VERSION,
  }
}

function createPartMetadata(examples: readonly TrainingExample[]): Array<{
  attributes: PartAttributeLabels
  exampleCount: number
  fold: number
  partId: string
  title: string
}> {
  const examplesByPart = groupBy(examples, (example) => example.partId)

  return [...examplesByPart.entries()]
    .map(([partId, partExamples]) => {
      const first = partExamples[0]

      if (!first) {
        throw new Error(`Missing example metadata for ${partId}.`)
      }

      return {
        attributes: first.attributes,
        exampleCount: partExamples.length,
        fold: first.fold,
        partId,
        title: first.title,
      }
    })
    .sort((left, right) => left.partId.localeCompare(right.partId))
}

async function selectBomPartIds({
  bomCsvs,
  ldrawRoot,
  maxParts,
}: {
  bomCsvs: readonly string[]
  ldrawRoot: string
  maxParts: number
}): Promise<BomPartSelectionSummary> {
  const rawParts = new Map<string, {
    partId: string
    quantity: number
    rows: number
  }>()
  let totalRows = 0
  let totalQuantity = 0

  for (const csvPath of bomCsvs) {
    const rows = parseRebrickableBomCsv(await readFile(csvPath, "utf8"), csvPath)

    totalRows += rows.length

    for (const row of rows) {
      if (row.isSpare || row.quantity <= 0) {
        continue
      }

      const current = rawParts.get(row.partId) ?? {
        partId: row.partId,
        quantity: 0,
        rows: 0,
      }

      current.quantity += row.quantity
      current.rows += 1
      rawParts.set(row.partId, current)
      totalQuantity += row.quantity
    }
  }

  const missingParts: BomPartSelectionSummary["missingParts"] = []
  const resolvedParts = new Map<string, {
    ldrawPartId: string
    quantity: number
  }>()

  for (const rawPart of rawParts.values()) {
    const ldrawPartId = resolveLDrawPartId(ldrawRoot, rawPart.partId)

    if (!ldrawPartId) {
      missingParts.push({
        partId: rawPart.partId,
        quantity: rawPart.quantity,
      })
      continue
    }

    const current = resolvedParts.get(ldrawPartId) ?? {
      ldrawPartId,
      quantity: 0,
    }

    current.quantity += rawPart.quantity
    resolvedParts.set(ldrawPartId, current)
  }

  const selected = [...resolvedParts.values()]
    .sort((left, right) =>
      right.quantity - left.quantity ||
      left.ldrawPartId.localeCompare(right.ldrawPartId, undefined, { numeric: true }),
    )
    .slice(0, maxParts)

  if (selected.length === 0) {
    throw new Error(`BOM CSVs resolved zero LDraw parts: ${bomCsvs.join(", ")}`)
  }

  return {
    csvPaths: bomCsvs.map((csvPath) => normalizeWorkspacePath(csvPath)),
    ldrawResolvedParts: resolvedParts.size,
    missingParts: missingParts.sort((left, right) =>
      right.quantity - left.quantity ||
      left.partId.localeCompare(right.partId, undefined, { numeric: true }),
    ),
    selectedPartIds: selected.map((part) => part.ldrawPartId),
    selectedParts: selected.length,
    selectedQuantity: selected.reduce((total, part) => total + part.quantity, 0),
    totalQuantity,
    totalRows,
    uniqueParts: rawParts.size,
  }
}

function parseRebrickableBomCsv(text: string, csvPath: string): Array<{
  isSpare: boolean
  partId: string
  quantity: number
}> {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)

  if (lines.length === 0) {
    return []
  }

  const header = parseCsvLine(lines[0] ?? "").map((name) => name.trim().toLowerCase())
  const partIndex = header.indexOf("part")
  const quantityIndex = header.indexOf("quantity")
  const spareIndex = header.indexOf("is spare")

  if (partIndex < 0 || quantityIndex < 0) {
    throw new Error(`BOM CSV missing Part or Quantity columns: ${csvPath}`)
  }

  return lines.slice(1)
    .map((line) => parseCsvLine(line))
    .map((fields) => {
      const partId = fields[partIndex]?.trim() ?? ""
      const quantity = Number.parseInt(fields[quantityIndex]?.trim() ?? "0", 10)
      const isSpare = spareIndex >= 0 ? parseCsvBoolean(fields[spareIndex] ?? "") : false

      return {
        isSpare,
        partId,
        quantity: Number.isFinite(quantity) ? quantity : 0,
      }
    })
    .filter((row) => row.partId.length > 0)
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === "," && !inQuotes) {
      fields.push(current)
      current = ""
      continue
    }

    current += char
  }

  fields.push(current)

  return fields
}

function parseCsvBoolean(value: string): boolean {
  return ["1", "true", "yes"].includes(value.trim().toLowerCase())
}

function resolveLDrawPartId(ldrawRoot: string, partId: string): string | null {
  const raw = partId.trim()
  const candidates = [
    raw,
    raw.toLowerCase(),
    raw.replace(/pr\d+$/i, ""),
    raw.replace(/c\d+$/i, ""),
    raw.replace(/[a-z]+$/i, ""),
  ]

  for (const candidate of uniqueStrings(candidates)) {
    if (candidate && ldrawPartFileExists(ldrawRoot, candidate)) {
      return candidate
    }
  }

  return null
}

function ldrawPartFileExists(ldrawRoot: string, partId: string): boolean {
  return [
    path.join(ldrawRoot, "parts", `${partId}.dat`),
    path.join(ldrawRoot, "UnOfficial", "parts", `${partId}.dat`),
  ].some((filePath) => existsSync(filePath))
}

async function readRenderSummary(renderDir: string): Promise<RenderSummary> {
  const rendersPath = path.join(renderDir, "renders.json")

  if (!existsSync(rendersPath)) {
    throw new Error(`Missing LDraw render summary: ${rendersPath}`)
  }

  const summary = JSON.parse(await readFile(rendersPath, "utf8")) as RenderSummary

  return {
    ...summary,
    outputDir: renderDir,
  }
}

async function renderPartsOneByOne({
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
  partIds: readonly string[]
  renderSize: number
  views: readonly ThreeRenderViewName[]
}): Promise<RenderSummary> {
  const parts: RenderSummary["parts"] = []
  const skippedParts: SkippedTrainingPart[] = []

  for (const partId of partIds) {
    if (!ldrawPartFileExists(ldrawRoot, partId)) {
      skippedParts.push({ partId, reason: "missing-ldraw-part-file" })
      continue
    }

    try {
      const partOutputDir = path.join(outputDir, "parts", safeFileName(partId))
      const render = await runPartMatchLDrawThreeRender({
        generatedAt,
        ldrawRoot,
        outputDir: partOutputDir,
        partIds: [partId],
        renderSize,
        views: [...views],
      })
      const renderedPart = render.summary.parts[0]

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

  const summary: RenderSummary = {
    generatedAt: generatedAt.toISOString(),
    ldrawRoot,
    outputDir,
    parts,
    renderer: "three-ldraw-loader-webgl-training-data",
    skippedParts,
    version: TRAINING_DATA_VERSION,
  }

  await mkdir(outputDir, { recursive: true })
  await writeJson(path.join(outputDir, "renders.json"), summary)

  return summary
}

async function readLDrawPartTitle(ldrawRoot: string, partId: string): Promise<string | null> {
  for (const filePath of [
    path.join(ldrawRoot, "parts", `${partId}.dat`),
    path.join(ldrawRoot, "UnOfficial", "parts", `${partId}.dat`),
  ]) {
    if (!existsSync(filePath)) {
      continue
    }

    return (await readFile(filePath, "utf8")).split(/\r?\n/)[0]?.replace(/^0\s+/, "").trim() || null
  }

  return null
}

function renderIndexHtml({
  examples,
  outputDir,
  pairs,
  summary,
}: {
  examples: readonly TrainingExample[]
  outputDir: string
  pairs: readonly TrainingPair[]
  summary: TrainingDataSummary
}): string {
  const examplesById = new Map(examples.map((example) => [example.exampleId, example]))
  const positivePairs = pairs.filter((pair) => pair.target === 1).slice(0, 40)
  const negativePairs = pairs.filter((pair) => pair.target === 0).slice(0, 80)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>LEGO training data</title>
  <style>
    body { color: #172033; font-family: system-ui, sans-serif; margin: 24px; }
    code { overflow-wrap: anywhere; }
    .summary { background: #f5f8f3; border: 1px solid #d7e1d5; border-radius: 8px; margin-bottom: 18px; padding: 16px; }
    .grid { display: flex; flex-direction: column; gap: 12px; max-width: 1120px; }
    article { border: 1px solid #d8ded8; border-radius: 8px; padding: 12px; width: 100%; }
    .pair { align-items: stretch; display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    figure { align-items: center; display: grid; gap: 12px; grid-template-columns: 96px minmax(0, 1fr); margin: 0; min-width: 0; }
    figcaption { min-width: 0; overflow-wrap: anywhere; }
    img { background: #f8fafc; border: 1px solid #d8ded8; display: block; height: 96px; image-rendering: auto; object-fit: contain; width: 96px; }
    .meta { color: #526071; font-size: 12px; }
    .part-title { font-weight: 700; }
    .signature { color: #374151; font-size: 13px; }
    .positive { background: #f0fff4; }
    .negative { background: #fff7ed; }
    @media (max-width: 720px) {
      .pair { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <h1>LEGO training data</h1>
  <div class="summary">
    <p>${summary.examples.count} examples · ${summary.pairs.positive} positives · ${summary.pairs.negative} negatives · ${summary.examples.imageSize}px</p>
    <p>Render dir: <code>${escapeHtml(summary.options.renderDir)}</code></p>
  </div>
  <h2>Positive pairs</h2>
  <div class="grid">${positivePairs.map((pair) => renderPairCard(pair, examplesById, outputDir)).join("")}</div>
  <h2>Negative pairs</h2>
  <div class="grid">${negativePairs.map((pair) => renderPairCard(pair, examplesById, outputDir)).join("")}</div>
</body>
</html>
`
}

function renderPairCard(
  pair: TrainingPair,
  examplesById: ReadonlyMap<string, TrainingExample>,
  outputDir: string,
): string {
  const left = examplesById.get(pair.leftExampleId)
  const right = examplesById.get(pair.rightExampleId)

  if (!left || !right) {
    return ""
  }

  return `
    <article class="${pair.target === 1 ? "positive" : "negative"}">
      <p><strong>${escapeHtml(pair.kind)}</strong> · ${escapeHtml(pair.split)}</p>
      <div class="pair">
        ${renderExampleFigure(left, outputDir)}
        ${renderExampleFigure(right, outputDir)}
      </div>
      <p class="meta">${escapeHtml(pair.reason)}</p>
    </article>
  `
}

function renderExampleFigure(example: TrainingExample, outputDir: string): string {
  return `
    <figure>
      <img src="${escapeAttribute(relativeLink(outputDir, path.join(outputDir, example.imagePath)))}" alt="${escapeAttribute(example.exampleId)}" />
      <figcaption>
        <div class="part-title">${escapeHtml(example.partId)}</div>
        <div class="signature">${escapeHtml(example.attributes.signature)}</div>
        <span class="meta">${escapeHtml(example.view)} · fold ${example.fold}</span>
      </figcaption>
    </figure>
  `
}

function groupBy<T>(
  values: readonly T[],
  keyFor: (value: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>()

  for (const value of values) {
    const key = keyFor(value)
    const group = groups.get(key) ?? []

    group.push(value)
    groups.set(key, group)
  }

  return groups
}

function countBy<T>(
  values: readonly T[],
  keyFor: (value: T) => string,
): Record<string, number> {
  const counts: Record<string, number> = {}

  for (const value of values) {
    const key = keyFor(value)
    counts[key] = (counts[key] ?? 0) + 1
  }

  return counts
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function canonicalPairKey(left: string, right: string): string {
  return left.localeCompare(right) <= 0 ? `${left}__${right}` : `${right}__${left}`
}

function createExampleId(partId: string, view: string, augmentationIndex: number): string {
  return `${safeFileName(partId)}-${safeFileName(view)}-aug-${augmentationIndex}`
}

function stableFold(value: string, foldCount: number): number {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }

  return hash % foldCount
}

function validatePositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer.`)
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

function relativeLink(fromDir: string, toPath: string): string {
  const relative = path.relative(path.resolve(fromDir), path.resolve(toPath))

  return relative || "."
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-")
}

function timestampForPath(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-")
}

function writeJson(filePath: string, value: unknown): Promise<void> {
  return mkdir(path.dirname(filePath), { recursive: true })
    .then(() => writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`))
}

function parseList(value: string | undefined): string[] {
  return value?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? []
}

function parseCliArgs(argv: readonly string[]): RunPartMatchLegoTrainingDataOptions {
  const options: RunPartMatchLegoTrainingDataOptions = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === "--augmentations" && next) {
      options.augmentations = Number.parseInt(next, 10)
      index += 1
      continue
    }

    if (arg === "--bom-csvs" && next) {
      options.bomCsvs = parseList(next)
      index += 1
      continue
    }

    if (arg === "--fold-count" && next) {
      options.foldCount = Number.parseInt(next, 10)
      index += 1
      continue
    }

    if (arg === "--ldraw-root" && next) {
      options.ldrawRoot = next
      index += 1
      continue
    }

    if (arg === "--max-negatives-per-example" && next) {
      options.maxNegativesPerExample = Number.parseInt(next, 10)
      index += 1
      continue
    }

    if (arg === "--max-parts" && next) {
      options.maxParts = Number.parseInt(next, 10)
      index += 1
      continue
    }

    if (arg === "--output-dir" && next) {
      options.outputDir = next
      index += 1
      continue
    }

    if (arg === "--output-size" && next) {
      options.outputSize = Number.parseInt(next, 10)
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

    if (arg === "--validation-fold" && next) {
      options.validationFold = Number.parseInt(next, 10)
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

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isMain) {
  runPartMatchLegoTrainingData(parseCliArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(`LEGO training data: ${result.summary.examples.count} examples`)
      console.log(`Pairs: ${result.summary.pairs.positive} positive, ${result.summary.pairs.negative} negative`)
      console.log(`Summary: ${result.summaryPath}`)
      console.log(`Index: ${result.indexPath}`)
    })
    .catch((error: unknown) => {
      console.error(error)
      process.exitCode = 1
    })
}
