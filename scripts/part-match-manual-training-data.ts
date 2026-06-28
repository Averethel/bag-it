import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const DEFAULT_REPORT_ROOT = path.join(".bag-it", "private", "part-match-reports")
const DEFAULT_LABEL_DIR = path.join(DEFAULT_REPORT_ROOT, "labels")
const DEFAULT_OUTPUT_ROOT = path.join(DEFAULT_REPORT_ROOT, "embedding-experiments")
const VERSION = "0.1.0"
const DEFAULT_VALIDATION_FOLD = 0

type PairTarget = 0 | 1
type PairSplit = "train" | "validation"

interface PartMatchReport {
  manualId?: string | null
  reportPath?: string | null
  rows?: PartMatchReportRow[]
}

interface PartMatchReportRow {
  bagId?: string | null
  bagLabel?: string | null
  calloutId?: string | null
  color?: {
    manualClassTrusted?: boolean | null
    name?: string | null
    status?: string | null
  } | null
  cropHash?: string | null
  imageDataUrl?: string | null
  itemId?: string | null
  pageNumber?: number | null
  quantity?: number | null
  rowId?: string | null
  stepIndex?: number | null
}

interface PartMatchLabelSet {
  labels?: PartMatchLabel[]
  manualId?: string | null
  reportPath?: string | null
  status?: string | null
}

interface PartMatchLabel {
  cropHash?: string | null
  expectedPartKey?: string | null
  itemId?: string | null
  role?: string | null
}

interface PartMatchDecisionFile {
  decisions?: PartMatchDecision[]
}

interface PartMatchDecision {
  left?: string | null
  manualId?: string | null
  right?: string | null
  status?: string | null
}

interface ManualTrainingExample {
  bagId: string
  bagLabel: string
  calloutId: string
  colorName: string | null
  cropHash: string
  exampleId: string
  expectedPartKey: string | null
  fold: number
  imagePath: string
  itemId: string
  manualId: string
  pageNumber: number | null
  partId: string
  quantity: number | null
  role: string
  stepIndex: number | null
  title: string
  view: string
}

interface ManualTrainingPair {
  kind: string
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

interface SkippedPair {
  leftItemId?: string
  manualId: string
  reason: string
  rightItemId?: string
}

export interface RunPartMatchManualTrainingDataOptions {
  decisionPaths?: string[]
  generatedAt?: Date
  labelDir?: string
  manualIds?: string[]
  outputDir?: string
  pairSplit?: PairSplit
  reportPaths?: string[]
  skipTrustedColorConflicts?: boolean
  validationFold?: number
  validationManualIds?: string[]
}

export interface RunPartMatchManualTrainingDataResult {
  examplesPath: string
  outputDir: string
  pairsPath: string
  summary: ManualTrainingDataSummary
  summaryPath: string
}

interface ManualTrainingDataSummary {
  decisions: {
    applied: number
    files: string[]
    skipped: Record<string, number>
  }
  examples: {
    count: number
    manuals: number
    rowsWithoutImages: number
  }
  generatedAt: string
  options: {
    labelDir: string
    manualIds: string[] | null
    outputDir: string
    pairSplit: PairSplit
    reportPaths: string[]
    skipTrustedColorConflicts: boolean
    validationFold: number
    validationManualIds: string[] | null
  }
  pairs: {
    byKind: Record<string, number>
    negative: number
    positive: number
    skipped: Record<string, number>
    total: number
  }
  version: string
}

interface ManualContext {
  labelPath: string
  labelsByItemId: Map<string, PartMatchLabel>
  manualId: string
  reportPath: string
  rowsByItemId: Map<string, PartMatchReportRow>
}

interface PairAccumulatorEntry {
  pair: ManualTrainingPair
  priority: number
}

export async function runPartMatchManualTrainingData(
  options: RunPartMatchManualTrainingDataOptions = {},
): Promise<RunPartMatchManualTrainingDataResult> {
  const generatedAt = options.generatedAt ?? new Date()
  const labelDir = options.labelDir ?? DEFAULT_LABEL_DIR
  const outputDir = options.outputDir ?? path.join(DEFAULT_OUTPUT_ROOT, `${timestampForPath(generatedAt)}-manual-training-data`)
  const validationFold = options.validationFold ?? DEFAULT_VALIDATION_FOLD
  const skipTrustedColorConflicts = options.skipTrustedColorConflicts ?? true
  const validationManualIds = options.validationManualIds?.length ? new Set(options.validationManualIds) : null
  const pairSplit = options.pairSplit ?? "validation"
  const reportPaths = options.reportPaths?.length
    ? options.reportPaths
    : await defaultReportPaths(labelDir, options.manualIds)
  const manualIds = options.manualIds?.length ? new Set(options.manualIds) : null

  await mkdir(outputDir, { recursive: true })

  const contexts = await readManualContexts({
    labelDir,
    manualIds,
    reportPaths,
  })
  const examples: ManualTrainingExample[] = []
  const examplesByItemId = new Map<string, ManualTrainingExample>()
  let rowsWithoutImages = 0

  for (const context of contexts) {
    for (const [itemId, row] of context.rowsByItemId) {
      const imageBytes = decodePngDataUrl(row.imageDataUrl)

      if (!imageBytes) {
        rowsWithoutImages += 1
        continue
      }

      const label = context.labelsByItemId.get(itemId)
      const role = label?.role ?? "unlabeled"
      const expectedPartKey = normalizedPartKey(label)
      const exampleId = `manual:${context.manualId}:${hashText(itemId).slice(0, 16)}`
      const imagePath = path.join("images", safeFileName(context.manualId), `${hashText(itemId).slice(0, 16)}.png`)
      const example: ManualTrainingExample = {
        bagId: row.bagId ?? "",
        bagLabel: row.bagLabel ?? row.bagId ?? "",
        calloutId: row.calloutId ?? "",
        colorName: row.color?.name ?? null,
        cropHash: row.cropHash ?? hashBytes(imageBytes),
        exampleId,
        expectedPartKey,
        fold: validationFold,
        imagePath,
        itemId,
        manualId: context.manualId,
        pageNumber: row.pageNumber ?? null,
        partId: expectedPartKey ? `${context.manualId}:${expectedPartKey}` : `${context.manualId}:excluded:${hashText(itemId).slice(0, 8)}`,
        quantity: row.quantity ?? null,
        role,
        stepIndex: row.stepIndex ?? null,
        title: `${context.manualId} ${expectedPartKey || role} ${itemId}`,
        view: "manual-crop",
      }

      await mkdir(path.dirname(path.join(outputDir, imagePath)), { recursive: true })
      await writeFile(path.join(outputDir, imagePath), imageBytes)
      examples.push(example)
      examplesByItemId.set(`${context.manualId}\0${itemId}`, example)
    }
  }

  const pairEntries = new Map<string, PairAccumulatorEntry>()
  const skippedPairs: SkippedPair[] = []

  for (const context of contexts) {
    addLabelPairs({
      context,
      examplesByItemId,
      pairEntries,
      pairSplit,
      skippedPairs,
      skipTrustedColorConflicts,
      validationFold,
      validationManualIds,
    })
  }

  const decisions = await readDecisions(options.decisionPaths ?? [])
  const decisionSkipped: Record<string, number> = {}
  let appliedDecisions = 0

  for (const decision of decisions) {
    const result = addDecisionPair({
      decision,
      examplesByItemId,
      pairEntries,
      pairSplit,
      skippedPairs,
      validationFold,
      validationManualIds,
    })

    if (result === "applied") {
      appliedDecisions += 1
    } else {
      decisionSkipped[result] = (decisionSkipped[result] ?? 0) + 1
    }
  }

  const pairs = [...pairEntries.values()]
    .map((entry) => entry.pair)
    .sort((left, right) =>
      left.target - right.target ||
      left.kind.localeCompare(right.kind) ||
      left.leftExampleId.localeCompare(right.leftExampleId) ||
      left.rightExampleId.localeCompare(right.rightExampleId),
    )

  if (pairs.length === 0) {
    throw new Error("Manual training data generation produced zero pairs.")
  }

  const summary: ManualTrainingDataSummary = {
    decisions: {
      applied: appliedDecisions,
      files: (options.decisionPaths ?? []).map(normalizeWorkspacePath),
      skipped: decisionSkipped,
    },
    examples: {
      count: examples.length,
      manuals: contexts.length,
      rowsWithoutImages,
    },
    generatedAt: generatedAt.toISOString(),
    options: {
      labelDir: normalizeWorkspacePath(labelDir),
      manualIds: options.manualIds?.length ? options.manualIds : null,
      outputDir: normalizeWorkspacePath(outputDir),
      pairSplit,
      reportPaths: reportPaths.map(normalizeWorkspacePath),
      skipTrustedColorConflicts,
      validationFold,
      validationManualIds: options.validationManualIds?.length ? options.validationManualIds : null,
    },
    pairs: {
      byKind: countBy(pairs, (pair) => pair.kind),
      negative: pairs.filter((pair) => pair.target === 0).length,
      positive: pairs.filter((pair) => pair.target === 1).length,
      skipped: countBy(skippedPairs, (pair) => pair.reason),
      total: pairs.length,
    },
    version: VERSION,
  }

  const examplesPath = path.join(outputDir, "examples.json")
  const pairsPath = path.join(outputDir, "pairs.json")
  const summaryPath = path.join(outputDir, "summary.json")

  await writeJson(examplesPath, {
    examples,
    generatedAt: generatedAt.toISOString(),
    version: VERSION,
  })
  await writeJson(pairsPath, {
    generatedAt: generatedAt.toISOString(),
    pairs,
    skippedPairs,
    version: VERSION,
  })
  await writeJson(summaryPath, summary)
  await writeFile(path.join(outputDir, "index.html"), renderIndexHtml({ examples, pairs, summary }))

  return {
    examplesPath,
    outputDir,
    pairsPath,
    summary,
    summaryPath,
  }
}

async function readManualContexts({
  labelDir,
  manualIds,
  reportPaths,
}: {
  labelDir: string
  manualIds: Set<string> | null
  reportPaths: readonly string[]
}): Promise<ManualContext[]> {
  const contexts: ManualContext[] = []

  for (const reportPath of reportPaths) {
    const report = JSON.parse(await readFile(reportPath, "utf8")) as PartMatchReport
    const manualId = report.manualId

    if (!manualId || (manualIds && !manualIds.has(manualId))) {
      continue
    }

    const labelPath = path.join(labelDir, `${manualId}.json`)

    if (!existsSync(labelPath)) {
      continue
    }

    const labelSet = JSON.parse(await readFile(labelPath, "utf8")) as PartMatchLabelSet
    const rows = report.rows ?? []
    const labels = labelSet.labels ?? []
    const rowsByItemId = new Map<string, PartMatchReportRow>()
    const labelsByItemId = new Map<string, PartMatchLabel>()

    for (const row of rows) {
      const itemId = row.itemId ?? row.rowId
      if (itemId) {
        rowsByItemId.set(itemId, row)
      }
    }

    for (const label of labels) {
      if (label.itemId) {
        labelsByItemId.set(label.itemId, label)
      }
    }

    contexts.push({
      labelPath,
      labelsByItemId,
      manualId,
      reportPath,
      rowsByItemId,
    })
  }

  return contexts
}

async function defaultReportPaths(labelDir: string, manualIds: readonly string[] | undefined): Promise<string[]> {
  const ids = manualIds?.length ? manualIds : await readManualIdsFromLabels(labelDir)

  return ids
    .map((manualId) => path.join(DEFAULT_REPORT_ROOT, manualId, "report.json"))
    .filter((reportPath) => existsSync(reportPath))
}

async function readManualIdsFromLabels(labelDir: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises")

  if (!existsSync(labelDir)) {
    return []
  }

  return (await readdir(labelDir))
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => fileName.replace(/\.json$/, ""))
    .sort()
}

function addLabelPairs({
  context,
  examplesByItemId,
  pairEntries,
  pairSplit,
  skippedPairs,
  skipTrustedColorConflicts,
  validationFold,
  validationManualIds,
}: {
  context: ManualContext
  examplesByItemId: Map<string, ManualTrainingExample>
  pairEntries: Map<string, PairAccumulatorEntry>
  pairSplit: PairSplit
  skippedPairs: SkippedPair[]
  skipTrustedColorConflicts: boolean
  validationFold: number
  validationManualIds: Set<string> | null
}): void {
  const labels = [...context.labelsByItemId.values()]
  const scoredLabels = labels.filter((label) => Boolean(normalizedPartKey(label)) && label.role !== "excluded")
  const excludedLabels = labels.filter((label) => label.role === "excluded")

  for (let leftIndex = 0; leftIndex < scoredLabels.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < scoredLabels.length; rightIndex += 1) {
      const leftLabel = scoredLabels[leftIndex]
      const rightLabel = scoredLabels[rightIndex]

      if (!leftLabel || !rightLabel || !leftLabel.itemId || !rightLabel.itemId) {
        continue
      }

      const leftRow = context.rowsByItemId.get(leftLabel.itemId)
      const rightRow = context.rowsByItemId.get(rightLabel.itemId)
      const appCandidate = classifyAppCandidate(context.manualId, leftLabel.itemId, rightLabel.itemId, leftRow, rightRow, {
        skipTrustedColorConflicts,
      })

      if (appCandidate) {
        skippedPairs.push(appCandidate)
        continue
      }

      addTrainingPair(pairEntries, {
        context,
        examplesByItemId,
        kind: normalizedPartKey(leftLabel) === normalizedPartKey(rightLabel) ? "manual-label-positive" : "manual-label-negative",
        leftItemId: leftLabel.itemId,
        priority: 0,
        reason: "active label pair",
        rightItemId: rightLabel.itemId,
        split: pairSplit,
        target: normalizedPartKey(leftLabel) === normalizedPartKey(rightLabel) ? 1 : 0,
        validationFold,
        validationManualIds,
      })
    }
  }

  for (const excludedLabel of excludedLabels) {
    if (!excludedLabel.itemId) {
      continue
    }

    const excludedRow = context.rowsByItemId.get(excludedLabel.itemId)

    for (const activeLabel of scoredLabels) {
      if (!activeLabel.itemId) {
        continue
      }

      const activeRow = context.rowsByItemId.get(activeLabel.itemId)
      const appCandidate = classifyAppCandidate(context.manualId, excludedLabel.itemId, activeLabel.itemId, excludedRow, activeRow, {
        skipTrustedColorConflicts,
      })

      if (appCandidate) {
        skippedPairs.push(appCandidate)
        continue
      }

      addTrainingPair(pairEntries, {
        context,
        examplesByItemId,
        kind: "manual-excluded-hard-negative",
        leftItemId: excludedLabel.itemId,
        priority: 0,
        reason: "excluded label against active same-bag row",
        rightItemId: activeLabel.itemId,
        split: pairSplit,
        target: 0,
        validationFold,
        validationManualIds,
      })
    }
  }
}

async function readDecisions(decisionPaths: readonly string[]): Promise<PartMatchDecision[]> {
  const decisions: PartMatchDecision[] = []

  for (const decisionPath of decisionPaths) {
    const parsed = JSON.parse(await readFile(decisionPath, "utf8")) as PartMatchDecisionFile
    decisions.push(...(parsed.decisions ?? []))
  }

  return decisions
}

function addDecisionPair({
  decision,
  examplesByItemId,
  pairEntries,
  pairSplit,
  skippedPairs,
  validationFold,
  validationManualIds,
}: {
  decision: PartMatchDecision
  examplesByItemId: Map<string, ManualTrainingExample>
  pairEntries: Map<string, PairAccumulatorEntry>
  pairSplit: PairSplit
  skippedPairs: SkippedPair[]
  validationFold: number
  validationManualIds: Set<string> | null
}): "applied" | "invalid-decision" | "missing-example" | "non-app-candidate" {
  const manualId = decision.manualId ?? ""
  const leftItemId = decision.left ?? ""
  const rightItemId = decision.right ?? ""
  const status = decision.status

  if (!manualId || !leftItemId || !rightItemId || (status !== "same" && status !== "different")) {
    return "invalid-decision"
  }

  const left = examplesByItemId.get(`${manualId}\0${leftItemId}`)
  const right = examplesByItemId.get(`${manualId}\0${rightItemId}`)

  if (!left || !right) {
    return "missing-example"
  }

  if (left.bagId !== right.bagId || left.calloutId === right.calloutId) {
    skippedPairs.push({
      leftItemId,
      manualId,
      reason: "non-app-candidate",
      rightItemId,
    })
    return "non-app-candidate"
  }

  addPairEntry(pairEntries, createPair({
    kind: `manual-reviewed-${status}`,
    left,
    priority: 1,
    reason: "reviewed decision",
    right,
    split: pairSplit,
    target: status === "same" ? 1 : 0,
    validationFold,
    validationManualIds,
  }))

  return "applied"
}

function addTrainingPair(
  pairEntries: Map<string, PairAccumulatorEntry>,
  options: {
    context: ManualContext
    examplesByItemId: Map<string, ManualTrainingExample>
    kind: string
    leftItemId: string
    priority: number
    reason: string
    rightItemId: string
    split: PairSplit
    target: PairTarget
    validationFold: number
    validationManualIds: Set<string> | null
  },
): void {
  const left = options.examplesByItemId.get(`${options.context.manualId}\0${options.leftItemId}`)
  const right = options.examplesByItemId.get(`${options.context.manualId}\0${options.rightItemId}`)

  if (!left || !right) {
    return
  }

  addPairEntry(pairEntries, createPair({
    kind: options.kind,
    left,
    priority: options.priority,
    reason: options.reason,
    right,
    split: options.split,
    target: options.target,
    validationFold: options.validationFold,
    validationManualIds: options.validationManualIds,
  }))
}

function addPairEntry(pairEntries: Map<string, PairAccumulatorEntry>, pair: ManualTrainingPair & { priority: number }): void {
  const key = canonicalPairKey(pair.leftExampleId, pair.rightExampleId)
  const existing = pairEntries.get(key)

  if (existing && existing.priority > pair.priority) {
    return
  }

  if (existing && existing.priority === pair.priority && existing.pair.target !== pair.target) {
    pairEntries.delete(key)
    return
  }

  const { priority: _priority, ...trainingPair } = pair
  pairEntries.set(key, {
    pair: trainingPair,
    priority: pair.priority,
  })
}

function createPair({
  kind,
  left,
  priority,
  reason,
  right,
  split,
  target,
  validationFold,
  validationManualIds,
}: {
  kind: string
  left: ManualTrainingExample
  priority: number
  reason: string
  right: ManualTrainingExample
  split: PairSplit
  target: PairTarget
  validationFold: number
  validationManualIds: Set<string> | null
}): ManualTrainingPair & { priority: number } {
  const [first, second] = left.exampleId.localeCompare(right.exampleId) <= 0
    ? [left, right]
    : [right, left]

  return {
    kind,
    leftExampleId: first.exampleId,
    leftPartId: first.partId,
    pairId: `${first.exampleId}__${second.exampleId}`,
    partFolds: [validationFold],
    priority,
    reason,
    rightExampleId: second.exampleId,
    rightPartId: second.partId,
    split: pairSplitForManual(first.manualId, validationManualIds, split),
    target,
    view: "manual-crop",
  }
}

function pairSplitForManual(
  manualId: string,
  validationManualIds: Set<string> | null,
  fallback: PairSplit,
): PairSplit {
  if (!validationManualIds) {
    return fallback
  }

  return validationManualIds.has(manualId) ? "validation" : "train"
}

function classifyAppCandidate(
  manualId: string,
  leftItemId: string,
  rightItemId: string,
  left: PartMatchReportRow | undefined,
  right: PartMatchReportRow | undefined,
  options: {
    skipTrustedColorConflicts: boolean
  },
): SkippedPair | null {
  if (!left || !right) {
    return {
      leftItemId,
      manualId,
      reason: "missing-row",
      rightItemId,
    }
  }

  if (!left.bagId || left.bagId !== right.bagId) {
    return {
      leftItemId,
      manualId,
      reason: "different-bag",
      rightItemId,
    }
  }

  if (left.calloutId && left.calloutId === right.calloutId) {
    return {
      leftItemId,
      manualId,
      reason: "same-callout",
      rightItemId,
    }
  }

  if (options.skipTrustedColorConflicts && hasTrustedColorConflict(left, right)) {
    return {
      leftItemId,
      manualId,
      reason: "trusted-color-conflict",
      rightItemId,
    }
  }

  return null
}

function hasTrustedColorConflict(left: PartMatchReportRow, right: PartMatchReportRow): boolean {
  const leftName = left.color?.name
  const rightName = right.color?.name

  return Boolean(
    leftName &&
    rightName &&
    leftName !== rightName &&
    isTrustedColor(left) &&
    isTrustedColor(right),
  )
}

function isTrustedColor(row: PartMatchReportRow): boolean {
  return row.color?.manualClassTrusted === true || row.color?.status === "accepted"
}

function normalizedPartKey(label: PartMatchLabel | undefined): string | null {
  const key = label?.expectedPartKey?.trim()
  return key || null
}

function decodePngDataUrl(value: string | null | undefined): Buffer | null {
  const match = /^data:image\/png;base64,([a-z0-9+/=]+)$/i.exec(value ?? "")
  return match ? Buffer.from(match[1] ?? "", "base64") : null
}

function canonicalPairKey(left: string, right: string): string {
  return left.localeCompare(right) <= 0 ? `${left}\0${right}` : `${right}\0${left}`
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function hashBytes(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16)
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "unknown"
}

function timestampForPath(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-")
}

function countBy<T>(items: readonly T[], keyForItem: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {}

  for (const item of items) {
    const key = keyForItem(item)
    counts[key] = (counts[key] ?? 0) + 1
  }

  return counts
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function normalizeWorkspacePath(filePath: string): string {
  return path.relative(process.cwd(), path.resolve(filePath)) || "."
}

function renderIndexHtml({
  examples,
  pairs,
  summary,
}: {
  examples: readonly ManualTrainingExample[]
  pairs: readonly ManualTrainingPair[]
  summary: ManualTrainingDataSummary
}): string {
  const examplesById = new Map(examples.map((example) => [example.exampleId, example]))
  const rows = pairs.slice(0, 120).map((pair) => {
    const left = examplesById.get(pair.leftExampleId)
    const right = examplesById.get(pair.rightExampleId)

    return `<tr>
      <td>${escapeHtml(String(pair.target))}</td>
      <td>${escapeHtml(pair.kind)}</td>
      <td>${left ? imageCell(left) : ""}</td>
      <td>${right ? imageCell(right) : ""}</td>
    </tr>`
  }).join("\n")

  return `<!doctype html>
<meta charset="utf-8">
<title>Manual part-match training data</title>
<style>
body { font-family: system-ui, sans-serif; margin: 24px; color: #172033; }
pre { background: #f4f6f8; padding: 16px; overflow: auto; }
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #d7dde5; padding: 8px; vertical-align: top; }
img { width: 72px; height: 72px; object-fit: contain; image-rendering: auto; background: #f5f5f2; }
.cell { display: grid; grid-template-columns: 80px 1fr; gap: 8px; align-items: center; }
.meta { font-size: 12px; color: #485469; overflow-wrap: anywhere; }
</style>
<h1>Manual part-match training data</h1>
<pre>${escapeHtml(JSON.stringify(summary, null, 2))}</pre>
<table>
  <thead><tr><th>Target</th><th>Kind</th><th>Left</th><th>Right</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`
}

function imageCell(example: ManualTrainingExample): string {
  return `<div class="cell">
    <img alt="" src="${escapeAttribute(example.imagePath)}">
    <div class="meta">${escapeHtml(example.manualId)} · ${escapeHtml(example.bagLabel)} · ${escapeHtml(example.expectedPartKey ?? example.role)}<br>${escapeHtml(example.itemId)}</div>
  </div>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;")
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

async function runCli(): Promise<void> {
  const argv = process.argv.slice(2)
  const result = await runPartMatchManualTrainingData({
    decisionPaths: parseList(readOption(argv, "--decision-paths")),
    labelDir: readOption(argv, "--label-dir") ?? undefined,
    manualIds: parseList(readOption(argv, "--manual-ids")),
    outputDir: readOption(argv, "--output-dir") ?? undefined,
    pairSplit: parsePairSplit(readOption(argv, "--pair-split")),
    reportPaths: parseList(readOption(argv, "--report-paths")),
    skipTrustedColorConflicts: readOption(argv, "--skip-trusted-color-conflicts") !== "false",
    validationManualIds: parseList(readOption(argv, "--validation-manual-ids")),
  })

  console.log(JSON.stringify({
    outputDir: result.outputDir,
    examples: result.summary.examples,
    pairs: result.summary.pairs,
    decisions: result.summary.decisions,
  }, null, 2))
}

function parsePairSplit(value: string | null): PairSplit | undefined {
  if (value === "train" || value === "validation") {
    return value
  }

  return undefined
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
