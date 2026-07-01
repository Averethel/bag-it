import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  createPartMatchGroups,
  type PartMatchGroup,
  type PartMatchColor,
  type PartMatchRegion,
  type PartMatchRowInput,
  type PartPairScorerConfig,
  type PartVisualFeatures,
} from "../packages/part-matching/src/index"
import { loadPartMatchScorerEvalData } from "./train-part-match-scorer"

const DEFAULT_OUTPUT_ROOT = path.join(
  ".bag-it",
  "private",
  "part-match-reports",
  "embedding-experiments",
)
const VERSION = "0.1.0"

interface ManualTrainingExample {
  bagId: string
  calloutId: string
  colorName?: string | null
  exampleId: string
  expectedPartKey?: string | null
  imagePath: string
  itemId: string
  manualId: string
  role?: string | null
}

interface ManualTrainingPair {
  leftExampleId: string
  rightExampleId: string
  target: number
}

interface RuntimeGroupRow {
  classKey: string
  example: ManualTrainingExample
  row: PartMatchRowInput
}

interface FeatureRow {
  bagId: string
  calloutId: string
  color?: PartMatchColor | null
  features: PartVisualFeatures
  itemId: string
  partRegion: PartMatchRegion
  rowId: string
}

interface PairMetricCounts {
  excludedOnlyGroups: number
  expectedPairs: number
  falseGroups: number
  falsePositivePairs: number
  groupedRows: number
  matchedPairs: number
  missedPairs: number
  wrongRowMemberships: number
}

type TruthSource = "labels" | "pair-targets"

interface GroupTruth {
  classByRowId: ReadonlyMap<string, string>
  expectedPairs: ReadonlySet<string>
  falsePairs: ReadonlySet<string>
}

export interface RunPartMatchRuntimeGroupScoreOptions {
  generatedAt?: Date
  manualTrainingDir: string
  outputDir?: string
  scorerConfigPath: string
  truthSource?: TruthSource
}

export interface RunPartMatchRuntimeGroupScoreResult {
  groupsPath: string
  outputDir: string
  summary: {
    generatedAt: string
    metrics: PairMetricCounts
    options: {
      manualTrainingDir: string
      outputDir: string
      scorerConfigPath: string
      truthSource: TruthSource
    }
    rows: {
      decoded: number
      skipped: Record<string, number>
    }
    version: string
  }
  summaryPath: string
}

export async function runPartMatchRuntimeGroupScore(
  options: RunPartMatchRuntimeGroupScoreOptions,
): Promise<RunPartMatchRuntimeGroupScoreResult> {
  const generatedAt = options.generatedAt ?? new Date()
  const outputDir = options.outputDir ?? path.join(
    DEFAULT_OUTPUT_ROOT,
    `${timestampSlug(generatedAt)}-runtime-group-score`,
  )
  const examples = await readManualTrainingExamples(options.manualTrainingDir)
  const truthSource = options.truthSource ?? "labels"
  const pairs = truthSource === "pair-targets"
    ? await readManualTrainingPairs(options.manualTrainingDir)
    : []
  if (truthSource === "pair-targets" && pairs.length === 0) {
    throw new Error(`No pair targets found in ${path.join(options.manualTrainingDir, "pairs.json")}`)
  }
  const scorerConfig = await readJson<PartPairScorerConfig>(options.scorerConfigPath)
  const rows = await readRuntimeGroupRows(options.manualTrainingDir, examples)
  const groups = createGroupsByBag(rows, scorerConfig)
  const truth = createGroupTruth(rows, pairs, truthSource)
  const metrics = scoreGroups(rows, groups, truth)
  const groupsPath = path.join(outputDir, "groups.json")
  const summaryPath = path.join(outputDir, "summary.json")
  const summary = {
    generatedAt: generatedAt.toISOString(),
    metrics,
    options: {
      manualTrainingDir: options.manualTrainingDir,
      outputDir,
      scorerConfigPath: options.scorerConfigPath,
      truthSource,
    },
    rows: {
      decoded: rows.length,
      skipped: countSkippedRows(examples, rows),
    },
    version: VERSION,
  }

  await mkdir(outputDir, { recursive: true })
  await writeJson(groupsPath, groups)
  await writeJson(summaryPath, summary)
  await writeFile(path.join(outputDir, "index.html"), renderIndex(summary))

  return {
    groupsPath,
    outputDir,
    summary,
    summaryPath,
  }
}

async function readRuntimeGroupRows(
  _manualTrainingDir: string,
  examples: readonly ManualTrainingExample[],
): Promise<RuntimeGroupRow[]> {
  const rows: RuntimeGroupRow[] = []
  const manualIds = [...new Set(examples.map((example) => example.manualId))].sort()
  const evalData = await loadPartMatchScorerEvalData({
    includeDerivedPairs: false,
    manualIds,
  })
  const reportRowsByManual = (evalData as unknown as {
    reportRowsByManual: Map<string, Map<string, FeatureRow>>
  }).reportRowsByManual

  for (const example of examples) {
    const classKey = exampleClassKey(example)

    if (!classKey) {
      continue
    }

    const featureRow = reportRowsByManual.get(example.manualId)?.get(example.itemId)

    if (!featureRow) {
      continue
    }

    rows.push({
      classKey,
      example,
      row: {
        bagId: `${example.manualId}:${featureRow.bagId}`,
        calloutId: featureRow.calloutId,
        color: featureRow.color ?? null,
        features: featureRow.features,
        itemId: featureRow.itemId,
        partRegion: featureRow.partRegion,
        rowId: example.exampleId,
      },
    })
  }

  return rows
}

function createGroupsByBag(
  rows: readonly RuntimeGroupRow[],
  scorerConfig: PartPairScorerConfig,
): PartMatchGroup[] {
  const groups: PartMatchGroup[] = []

  for (const bucketRows of groupBy(rows, (row) => row.row.bagId).values()) {
    groups.push(...createPartMatchGroups({
      enableLabelGatedNearMatches: true,
      pairScorerConfig: scorerConfig,
      rows: bucketRows.map((row) => row.row),
    }))
  }

  return groups
}

function scoreGroups(
  rows: readonly RuntimeGroupRow[],
  groups: readonly PartMatchGroup[],
  truth: GroupTruth,
): PairMetricCounts {
  const rowById = new Map(rows.map((row) => [row.row.rowId, row]))
  const groupedPositivePairs = new Set<string>()
  let excludedOnlyGroups = 0
  let falseGroups = 0
  let falsePositivePairs = 0
  let groupedRows = 0
  let wrongRowMemberships = 0

  for (const group of groups) {
    const knownRowIds = group.rowIds.filter((rowId) => truth.classByRowId.has(rowId))

    if (knownRowIds.length < 2) {
      continue
    }

    if (knownRowIds.every((rowId) => truth.classByRowId.get(rowId)?.startsWith("excluded:"))) {
      excludedOnlyGroups += 1
      continue
    }

    groupedRows += knownRowIds.length
    wrongRowMemberships += countWrongMemberships(knownRowIds, truth.classByRowId)

    let groupHasFalsePair = false

    for (let leftIndex = 0; leftIndex < knownRowIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < knownRowIds.length; rightIndex += 1) {
        const leftId = knownRowIds[leftIndex]
        const rightId = knownRowIds[rightIndex]

        if (!leftId || !rightId) {
          continue
        }

        const pairKey = rowPairKey(leftId, rightId)

        if (truth.expectedPairs.has(pairKey)) {
          groupedPositivePairs.add(pairKey)
          continue
        }

        const left = rowById.get(leftId)
        const right = rowById.get(rightId)

        if (left && right && pairCanBeFalsePositive(left, right, truth)) {
          falsePositivePairs += 1
          groupHasFalsePair = true
        }
      }
    }

    if (groupHasFalsePair) {
      falseGroups += 1
    }
  }

  return {
    excludedOnlyGroups,
    expectedPairs: truth.expectedPairs.size,
    falseGroups,
    falsePositivePairs,
    groupedRows,
    matchedPairs: groupedPositivePairs.size,
    missedPairs: truth.expectedPairs.size - groupedPositivePairs.size,
    wrongRowMemberships,
  }
}

function createGroupTruth(
  rows: readonly RuntimeGroupRow[],
  pairs: readonly ManualTrainingPair[],
  truthSource: TruthSource,
): GroupTruth {
  return truthSource === "pair-targets"
    ? createPairTargetTruth(rows, pairs)
    : createLabelTruth(rows)
}

function createLabelTruth(rows: readonly RuntimeGroupRow[]): GroupTruth {
  return {
    classByRowId: new Map(rows.map((row) => [row.row.rowId, row.classKey])),
    expectedPairs: createExpectedPairSet(rows),
    falsePairs: new Set(),
  }
}

function createPairTargetTruth(
  rows: readonly RuntimeGroupRow[],
  pairs: readonly ManualTrainingPair[],
): GroupTruth {
  const rowIds = new Set(rows.map((row) => row.row.rowId))
  const expectedPairs = new Set<string>()
  const falsePairs = new Set<string>()
  const positiveLinks = new Map<string, Set<string>>()

  for (const pair of pairs) {
    if (!rowIds.has(pair.leftExampleId) || !rowIds.has(pair.rightExampleId)) {
      continue
    }

    const key = rowPairKey(pair.leftExampleId, pair.rightExampleId)

    if (pair.target === 1) {
      expectedPairs.add(key)
      addPositiveLink(positiveLinks, pair.leftExampleId, pair.rightExampleId)
      addPositiveLink(positiveLinks, pair.rightExampleId, pair.leftExampleId)
    } else {
      falsePairs.add(key)
    }
  }

  return {
    classByRowId: createPairTargetClasses(rows, positiveLinks),
    expectedPairs,
    falsePairs,
  }
}

function addPositiveLink(
  links: Map<string, Set<string>>,
  leftId: string,
  rightId: string,
): void {
  const current = links.get(leftId) ?? new Set<string>()

  current.add(rightId)
  links.set(leftId, current)
}

function createPairTargetClasses(
  rows: readonly RuntimeGroupRow[],
  positiveLinks: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, string> {
  const rowById = new Map(rows.map((row) => [row.row.rowId, row]))
  const classByRowId = new Map<string, string>()
  const seen = new Set<string>()

  for (const row of rows) {
    if (seen.has(row.row.rowId)) {
      continue
    }

    const component = readPositiveComponent(row.row.rowId, positiveLinks, seen)
    const classKey = component.length > 1
      ? `pair-target:${[...component].sort().join("|")}`
      : rowById.get(row.row.rowId)?.classKey ?? `row:${row.row.rowId}`

    for (const rowId of component) {
      classByRowId.set(rowId, classKey)
    }
  }

  return classByRowId
}

function readPositiveComponent(
  startRowId: string,
  positiveLinks: ReadonlyMap<string, ReadonlySet<string>>,
  seen: Set<string>,
): string[] {
  const queue = [startRowId]
  const result: string[] = []
  seen.add(startRowId)

  for (let index = 0; index < queue.length; index += 1) {
    const rowId = queue[index]

    if (!rowId) {
      continue
    }

    result.push(rowId)

    for (const nextRowId of positiveLinks.get(rowId) ?? []) {
      if (!seen.has(nextRowId)) {
        seen.add(nextRowId)
        queue.push(nextRowId)
      }
    }
  }

  return result
}

function pairCanBeFalsePositive(
  left: RuntimeGroupRow,
  right: RuntimeGroupRow,
  truth: GroupTruth,
): boolean {
  const pairKey = rowPairKey(left.row.rowId, right.row.rowId)

  return truth.falsePairs.size > 0
    ? truth.falsePairs.has(pairKey)
    : rowsAreComparable(left, right)
}

function createExpectedPairSet(rows: readonly RuntimeGroupRow[]): Set<string> {
  const expectedPairs = new Set<string>()
  const rowsByScope = groupBy(rows.filter((row) => isActivePart(row.example)), (row) =>
    `${row.example.manualId}\0${row.example.bagId}\0${row.classKey}`
  )

  for (const scopeRows of rowsByScope.values()) {
    for (let leftIndex = 0; leftIndex < scopeRows.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < scopeRows.length; rightIndex += 1) {
        const left = scopeRows[leftIndex]
        const right = scopeRows[rightIndex]

        if (left && right && left.example.calloutId !== right.example.calloutId) {
          expectedPairs.add(rowPairKey(left.row.rowId, right.row.rowId))
        }
      }
    }
  }

  return expectedPairs
}

function rowsAreComparable(left: RuntimeGroupRow, right: RuntimeGroupRow): boolean {
  if (left.classKey.startsWith("excluded:") && right.classKey.startsWith("excluded:")) {
    return false
  }

  return left.example.manualId === right.example.manualId &&
    left.example.bagId === right.example.bagId &&
    left.example.calloutId !== right.example.calloutId
}

function countWrongMemberships(
  rowIds: readonly string[],
  classByRowId: ReadonlyMap<string, string>,
): number {
  const counts = new Map<string, number>()

  for (const rowId of rowIds) {
    const classKey = classByRowId.get(rowId)

    if (classKey) {
      counts.set(classKey, (counts.get(classKey) ?? 0) + 1)
    }
  }

  return rowIds.length - Math.max(0, ...counts.values())
}

function exampleClassKey(example: ManualTrainingExample): string | null {
  if (isActivePart(example)) {
    return `part:${example.expectedPartKey}`
  }

  return example.role === "excluded" ? `excluded:${example.itemId}` : null
}

function isActivePart(example: ManualTrainingExample): boolean {
  return example.role !== "excluded" && Boolean(example.expectedPartKey)
}

function countSkippedRows(
  examples: readonly ManualTrainingExample[],
  rows: readonly RuntimeGroupRow[],
): Record<string, number> {
  const decodedExampleIds = new Set(rows.map((row) => row.example.exampleId))
  const skipped: Record<string, number> = {}

  for (const example of examples) {
    const key = exampleClassKey(example)

    if (!key) {
      skipped["unlabeled"] = (skipped["unlabeled"] ?? 0) + 1
      continue
    }

    if (!decodedExampleIds.has(example.exampleId)) {
      skipped["missing-feature"] = (skipped["missing-feature"] ?? 0) + 1
    }
  }

  return skipped
}

function groupBy<T>(
  values: readonly T[],
  keyFor: (value: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>()

  for (const value of values) {
    const key = keyFor(value)
    groups.set(key, [...(groups.get(key) ?? []), value])
  }

  return groups
}

function rowPairKey(leftId: string, rightId: string): string {
  return [leftId, rightId].sort().join("\0")
}

async function readManualTrainingExamples(root: string): Promise<ManualTrainingExample[]> {
  const parsed = await readJson<{ examples?: ManualTrainingExample[] }>(path.join(root, "examples.json"))

  return parsed.examples ?? []
}

async function readManualTrainingPairs(root: string): Promise<ManualTrainingPair[]> {
  const parsed = await readJson<{ pairs?: ManualTrainingPair[] } | ManualTrainingPair[]>(path.join(root, "pairs.json"))

  return Array.isArray(parsed)
    ? parsed
    : parsed.pairs ?? []
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function timestampSlug(date: Date): string {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-")
}

function renderIndex(summary: RunPartMatchRuntimeGroupScoreResult["summary"]): string {
  const metrics = summary.metrics

  return `<!doctype html>
<meta charset="utf-8">
<title>Part Match Runtime Group Score</title>
<style>
body { color: #172033; font: 14px/1.5 system-ui, sans-serif; margin: 24px; }
code { background: #f1f5f9; border-radius: 4px; padding: 2px 4px; }
</style>
<h1>Part Match Runtime Group Score</h1>
<p>${metrics.matchedPairs}/${metrics.expectedPairs} expected pairs matched · ${metrics.falseGroups} false groups · ${metrics.falsePositivePairs} false pair diagnostics · ${metrics.wrongRowMemberships}/${metrics.groupedRows} wrong row memberships</p>
<p>Truth source: <code>${escapeHtml(summary.options.truthSource)}</code></p>
<p>Scorer config: <code>${escapeHtml(summary.options.scorerConfigPath)}</code></p>`
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
  const manualTrainingDir = readOption(argv, "--manual-training-dir")
  const scorerConfigPath = readOption(argv, "--scorer-config")

  if (!manualTrainingDir || !scorerConfigPath) {
    throw new Error("Usage: part-match-runtime-group-score --manual-training-dir <dir> --scorer-config <file> [--output-dir <dir>] [--truth-source labels|pair-targets]")
  }

  const result = await runPartMatchRuntimeGroupScore({
    manualTrainingDir,
    outputDir: readOption(argv, "--output-dir") ?? undefined,
    scorerConfigPath,
    truthSource: parseTruthSource(readOption(argv, "--truth-source")),
  })

  console.log(JSON.stringify({
    groupsPath: result.groupsPath,
    outputDir: result.outputDir,
    summaryPath: result.summaryPath,
    ...result.summary,
  }, null, 2))
}

function parseTruthSource(value: string | null): TruthSource | undefined {
  if (value === null) {
    return undefined
  }

  if (value === "labels" || value === "pair-targets") {
    return value
  }

  throw new Error(`Unsupported --truth-source "${value}". Expected "labels" or "pair-targets".`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
