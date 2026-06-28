import { existsSync } from "node:fs"
import {
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  trainPartMatchScorer,
} from "./train-part-match-scorer"

const DEFAULT_LABEL_DIR = path.join(".bag-it", "private", "part-match-reports", "labels")
const DEFAULT_REPORT_ROOT = path.join(".bag-it", "private", "part-match-reports")
const DEFAULT_SCORER_CONFIG = path.join(DEFAULT_REPORT_ROOT, "scorer-config.json")
const DEFAULT_SOURCE_DIR = path.join(".bag-it", "private", "part-color-reports", "sources")
const DEFAULT_OUTPUT_DIR = path.join(DEFAULT_REPORT_ROOT, "verifier-lab")

const DEFAULT_CANDIDATES: PartMatchVerifierCandidateSpec[] = [
  {
    maxEvidenceRuleConditions: 2,
    maxEvidenceRules: 24,
    maxTreeDepth: 6,
    minEvidenceRuleGain: 3,
    minTreeLeafSize: 4,
    model: "decision-tree",
    name: "tree-conservative",
  },
  {
    maxEvidenceRuleConditions: 3,
    maxEvidenceRules: 36,
    maxTreeDepth: 8,
    minEvidenceRuleGain: 2,
    minEvidenceRuleManualSupport: 2,
    minTreeLeafSize: 3,
    model: "decision-tree",
    name: "tree-support-2",
  },
  {
    maxEvidenceRuleConditions: 3,
    maxEvidenceRules: 36,
    maxTreeDepth: 8,
    minEvidenceRuleGain: 3,
    minTreeLeafSize: 3,
    model: "decision-tree",
    name: "tree-deeper",
  },
  {
    iterations: 4000,
    l2: 0.002,
    learningRate: 0.04,
    maxEvidenceRuleConditions: 2,
    maxEvidenceRules: 24,
    minEvidenceRuleGain: 3,
    model: "linear",
    name: "linear-guarded",
  },
]

type ScorerModel = "decision-tree" | "linear"

export interface PartMatchVerifierCandidateSpec {
  iterations?: number
  l2?: number
  learningRate?: number
  maxEvidenceRuleConditions?: number
  maxEvidenceRules?: number
  minEvidenceRuleManualSupport?: number
  maxTreeDepth?: number
  minEvidenceRuleGain?: number
  minTreeLeafSize?: number
  model: ScorerModel
  name: string
}

export interface PartMatchVerifierLabOptions {
  baselineOnly: boolean
  baselineScorerConfigPath: string | null
  candidateNames: string[] | null
  decisionPaths: string[]
  decisionRoot: string
  excludeManualIds: string[]
  generatedAt: Date
  labelDir: string
  manualIds: string[] | null
  outputDir: string
  sourceDir: string
}

export interface PartMatchVerifierLabReport {
  baseline: PartMatchVerifierCandidateReport
  candidates: PartMatchVerifierCandidateReport[]
  decisionPaths: string[]
  generatedAt: string
  options: {
    baselineOnly: boolean
    baselineScorerConfigPath: string | null
    candidateNames: string[] | null
    excludeManualIds: string[]
    labelDir: string
    manualIds: string[] | null
    outputDir: string
    sourceDir: string
  }
  recommendation: PartMatchVerifierRecommendation
}

export interface PartMatchVerifierCandidateReport {
  analysis?: PartMatchVerifierAnalysisSummary
  configPath: string | null
  diagnostics?: PartMatchVerifierPairDiagnostics
  error?: string
  name: string
  safe: boolean
  spec?: PartMatchVerifierCandidateSpec
  status: "baseline" | "failed" | "trained"
}

export interface PartMatchVerifierAnalysisSummary {
  group: {
    cropDrifts: number
    expectedPairs: number
    falseGroups: number
    matchedPairs: number
    missedPairs: number
  }
  pair: {
    falsePositivePairs: number
    sameMatchedPairs: number
    sameMissedPairs: number
  }
}

export interface PartMatchVerifierRecommendation {
  reason: string
  selectedCandidateName: string | null
  status: "keep-current" | "promote-candidate"
}

export interface PartMatchVerifierPairDiagnostics {
  sameMissedByBucket: Record<string, number>
  sameMissedByManual: Record<string, number>
  sameMissedByReason: Record<string, number>
  topNearThresholdMisses: PartMatchVerifierMissedPair[]
}

export interface PartMatchVerifierMissedPair {
  bucket: string
  confidence: number
  left: string
  leftKey: string | null
  manualId: string
  metrics: Record<string, number | null>
  reasons: string[]
  right: string
  rightKey: string | null
}

interface RawPartMatchRuleAnalysis {
  groupTotals: PartMatchVerifierAnalysisSummary["group"]
  missedBuckets?: Record<string, number>
  pairs?: {
    sameMissedPairs?: RawPartMatchPair[]
  }
  pairTotals: PartMatchVerifierAnalysisSummary["pair"]
  reasonCounts?: {
    sameMissedPairs?: Record<string, number>
  }
}

interface RawPartMatchPair {
  left: string
  leftKey?: string | null
  manualId: string
  metrics?: Record<string, number | null>
  result?: {
    confidence?: number
    reasons?: string[]
  }
  right: string
  rightKey?: string | null
}

interface AnalysisModule {
  analyzePartMatchRules(options: {
    includePairs?: boolean
    labelDir: string
    manualIds: string[] | null
    scorerConfigPath: string | null
    sourceDir: string
  }): RawPartMatchRuleAnalysis
}

export async function runPartMatchVerifierLab(
  options: Partial<PartMatchVerifierLabOptions> = {},
): Promise<PartMatchVerifierLabReport> {
  const resolvedOptions = await resolveVerifierLabOptions(options)
  const selectedCandidates = selectCandidateSpecs(resolvedOptions)
  const decisionPaths = resolvedOptions.decisionPaths.length > 0
    ? resolvedOptions.decisionPaths
    : await discoverPartMatchDecisionPaths(resolvedOptions.decisionRoot)

  await mkdir(resolvedOptions.outputDir, { recursive: true })
  await mkdir(path.join(resolvedOptions.outputDir, "candidates"), { recursive: true })

  const baseline = await evaluateExistingConfig({
    configPath: resolvedOptions.baselineScorerConfigPath,
    includeDiagnostics: true,
    labelDir: resolvedOptions.labelDir,
    manualIds: resolvedOptions.manualIds,
    name: "baseline-current",
    sourceDir: resolvedOptions.sourceDir,
  })
  const candidates = resolvedOptions.baselineOnly
    ? []
    : await trainAndEvaluateCandidates({
        baselineScorerConfigPath: resolvedOptions.baselineScorerConfigPath,
        candidateSpecs: selectedCandidates,
        decisionPaths,
        excludeManualIds: resolvedOptions.excludeManualIds,
        labelDir: resolvedOptions.labelDir,
        manualIds: resolvedOptions.manualIds,
        outputDir: resolvedOptions.outputDir,
        sourceDir: resolvedOptions.sourceDir,
      })
  const recommendation = selectPartMatchVerifierPromotionCandidate(baseline, candidates)
  const report: PartMatchVerifierLabReport = {
    baseline,
    candidates,
    decisionPaths,
    generatedAt: resolvedOptions.generatedAt.toISOString(),
    options: {
      baselineOnly: resolvedOptions.baselineOnly,
      baselineScorerConfigPath: resolvedOptions.baselineScorerConfigPath,
      candidateNames: resolvedOptions.candidateNames,
      excludeManualIds: resolvedOptions.excludeManualIds,
      labelDir: resolvedOptions.labelDir,
      manualIds: resolvedOptions.manualIds,
      outputDir: resolvedOptions.outputDir,
      sourceDir: resolvedOptions.sourceDir,
    },
    recommendation,
  }

  await writeVerifierLabOutputs(report, resolvedOptions.outputDir)

  return report
}

export function selectPartMatchVerifierPromotionCandidate(
  baseline: PartMatchVerifierCandidateReport,
  candidates: readonly PartMatchVerifierCandidateReport[],
): PartMatchVerifierRecommendation {
  const baselineAnalysis = baseline.analysis

  if (!baselineAnalysis || !baseline.safe) {
    return {
      reason: "baseline is missing or unsafe; do not promote lab candidates",
      selectedCandidateName: null,
      status: "keep-current",
    }
  }

  const eligible = candidates
    .filter((candidate) => candidate.safe && candidate.analysis)
    .map((candidate) => ({
      candidate,
      recallGain: (candidate.analysis?.group.matchedPairs ?? 0) - baselineAnalysis.group.matchedPairs,
      missedGain: baselineAnalysis.group.missedPairs - (candidate.analysis?.group.missedPairs ?? 0),
    }))
    .filter((entry) => entry.recallGain > 0 && entry.missedGain > 0)
    .sort((left, right) =>
      right.recallGain - left.recallGain ||
      right.missedGain - left.missedGain ||
      left.candidate.name.localeCompare(right.candidate.name)
    )

  const best = eligible[0]

  if (!best) {
    return {
      reason: "no safe candidate improves group recall over baseline",
      selectedCandidateName: null,
      status: "keep-current",
    }
  }

  return {
    reason: `${best.candidate.name} safely recovers ${best.recallGain} more group pairs`,
    selectedCandidateName: best.candidate.name,
    status: "promote-candidate",
  }
}

function candidateIsSafe(analysis: PartMatchVerifierAnalysisSummary): boolean {
  return analysis.group.falseGroups === 0 &&
    analysis.group.cropDrifts === 0 &&
    analysis.pair.falsePositivePairs === 0
}

async function resolveVerifierLabOptions(
  options: Partial<PartMatchVerifierLabOptions>,
): Promise<PartMatchVerifierLabOptions> {
  const generatedAt = options.generatedAt ?? new Date()

  return {
    baselineOnly: options.baselineOnly ?? false,
    baselineScorerConfigPath: normalizeOptionalExistingPath(
      options.baselineScorerConfigPath ?? DEFAULT_SCORER_CONFIG,
    ),
    candidateNames: options.candidateNames ?? null,
    decisionPaths: options.decisionPaths ?? [],
    decisionRoot: options.decisionRoot ?? DEFAULT_REPORT_ROOT,
    excludeManualIds: options.excludeManualIds ?? [],
    generatedAt,
    labelDir: options.labelDir ?? DEFAULT_LABEL_DIR,
    manualIds: options.manualIds ?? null,
    outputDir: options.outputDir ?? path.join(
      DEFAULT_OUTPUT_DIR,
      timestampForPath(generatedAt),
    ),
    sourceDir: options.sourceDir ?? DEFAULT_SOURCE_DIR,
  }
}

function normalizeOptionalExistingPath(pathValue: string | null): string | null {
  if (!pathValue) {
    return null
  }

  return existsSync(pathValue) ? pathValue : null
}

function selectCandidateSpecs(options: PartMatchVerifierLabOptions): PartMatchVerifierCandidateSpec[] {
  if (!options.candidateNames) {
    return DEFAULT_CANDIDATES
  }

  const candidatesByName = new Map(DEFAULT_CANDIDATES.map((candidate) => [candidate.name, candidate]))
  const selected = options.candidateNames.map((name) => {
    const candidate = candidatesByName.get(name)

    if (!candidate) {
      throw new Error(`Unknown part-match verifier candidate '${name}'.`)
    }

    return candidate
  })

  return selected
}

async function trainAndEvaluateCandidates({
  baselineScorerConfigPath,
  candidateSpecs,
  decisionPaths,
  excludeManualIds,
  labelDir,
  manualIds,
  outputDir,
  sourceDir,
}: {
  baselineScorerConfigPath: string | null
  candidateSpecs: readonly PartMatchVerifierCandidateSpec[]
  decisionPaths: readonly string[]
  excludeManualIds: readonly string[]
  labelDir: string
  manualIds: string[] | null
  outputDir: string
  sourceDir: string
}): Promise<PartMatchVerifierCandidateReport[]> {
  const reports: PartMatchVerifierCandidateReport[] = []

  for (const spec of candidateSpecs) {
    const configPath = path.join(outputDir, "candidates", `${spec.name}.json`)

    try {
      await trainPartMatchScorer({
        baseScorerConfigPath: baselineScorerConfigPath,
        decisionConflictPolicy: "prefer-decisions",
        decisionPaths: [...decisionPaths],
        excludeManualIds: [...excludeManualIds],
        labelDir,
        manualIds,
        outputPath: configPath,
        sourceDir,
        ...trainingOptionsForSpec(spec),
      })

      reports.push(await evaluateExistingConfig({
        configPath,
        labelDir,
        manualIds,
        name: spec.name,
        sourceDir,
        spec,
        status: "trained",
      }))
    } catch (error) {
      reports.push({
        configPath,
        error: error instanceof Error ? error.message : String(error),
        name: spec.name,
        safe: false,
        spec,
        status: "failed",
      })
    }
  }

  return reports
}

function trainingOptionsForSpec(spec: PartMatchVerifierCandidateSpec): {
  iterations?: number
  l2?: number
  learningRate?: number
  maxEvidenceRuleConditions?: number
  maxEvidenceRules?: number
  minEvidenceRuleManualSupport?: number
  maxTreeDepth?: number
  minEvidenceRuleGain?: number
  minTreeLeafSize?: number
  model: ScorerModel
} {
  return {
    iterations: spec.iterations,
    l2: spec.l2,
    learningRate: spec.learningRate,
    maxEvidenceRuleConditions: spec.maxEvidenceRuleConditions,
    maxEvidenceRules: spec.maxEvidenceRules,
    minEvidenceRuleManualSupport: spec.minEvidenceRuleManualSupport,
    maxTreeDepth: spec.maxTreeDepth,
    minEvidenceRuleGain: spec.minEvidenceRuleGain,
    minTreeLeafSize: spec.minTreeLeafSize,
    model: spec.model,
  }
}

async function evaluateExistingConfig({
  configPath,
  includeDiagnostics = false,
  labelDir,
  manualIds,
  name,
  sourceDir,
  spec,
  status = "baseline",
}: {
  configPath: string | null
  includeDiagnostics?: boolean
  labelDir: string
  manualIds: string[] | null
  name: string
  sourceDir: string
  spec?: PartMatchVerifierCandidateSpec
  status?: "baseline" | "trained"
}): Promise<PartMatchVerifierCandidateReport> {
  const rawAnalysis = await analyzePartMatchRules({
    includePairs: includeDiagnostics,
    labelDir,
    manualIds,
    scorerConfigPath: configPath,
    sourceDir,
  })
  const analysis = summarizeAnalysis(rawAnalysis)

  return {
    analysis,
    configPath,
    diagnostics: includeDiagnostics ? createPairDiagnostics(rawAnalysis) : undefined,
    name,
    safe: candidateIsSafe(analysis),
    spec,
    status,
  }
}

async function analyzePartMatchRules(options: {
  includePairs?: boolean
  labelDir: string
  manualIds: string[] | null
  scorerConfigPath: string | null
  sourceDir: string
}): Promise<RawPartMatchRuleAnalysis> {
  const modulePath = "./part-match-rule-analysis.mjs"
  const analysisModule = await import(modulePath) as AnalysisModule

  return analysisModule.analyzePartMatchRules(options)
}

function summarizeAnalysis(analysis: RawPartMatchRuleAnalysis): PartMatchVerifierAnalysisSummary {
  return {
    group: analysis.groupTotals,
    pair: analysis.pairTotals,
  }
}

function createPairDiagnostics(analysis: RawPartMatchRuleAnalysis): PartMatchVerifierPairDiagnostics {
  const sameMissedPairs = analysis.pairs?.sameMissedPairs ?? []

  return {
    sameMissedByBucket: analysis.missedBuckets ?? {},
    sameMissedByManual: countBy(sameMissedPairs, (pair) => pair.manualId),
    sameMissedByReason: analysis.reasonCounts?.sameMissedPairs ?? {},
    topNearThresholdMisses: sameMissedPairs
      .map(toMissedPairDiagnostic)
      .sort((left, right) =>
        right.confidence - left.confidence ||
        left.manualId.localeCompare(right.manualId) ||
        left.left.localeCompare(right.left)
      )
      .slice(0, 20),
  }
}

function toMissedPairDiagnostic(pair: RawPartMatchPair): PartMatchVerifierMissedPair {
  const reasons = pair.result?.reasons ?? []

  return {
    bucket: bucketMissedPair(pair),
    confidence: pair.result?.confidence ?? 0,
    left: pair.left,
    leftKey: pair.leftKey ?? null,
    manualId: pair.manualId,
    metrics: pickDiagnosticMetrics(pair.metrics ?? {}),
    reasons,
    right: pair.right,
    rightKey: pair.rightKey ?? null,
  }
}

function bucketMissedPair(pair: RawPartMatchPair): string {
  const reasons = pair.result?.reasons ?? []

  if (reasons.includes("color")) {
    return "color-conflict"
  }

  const confidence = pair.result?.confidence ?? 0

  if (confidence >= 0.7) {
    return "near-threshold"
  }

  if (confidence === 0) {
    return "hard-reject"
  }

  return "low-confidence"
}

function pickDiagnosticMetrics(metrics: Record<string, number | null>): Record<string, number | null> {
  return Object.fromEntries([
    "alpha32",
    "alpha32Shift",
    "alphaChamfer",
    "alphaChamferShift",
    "luma",
    "luma32",
    "luma32Shift",
    "lumaEdge",
    "lumaEdgeShift",
    "projection",
    "silhouette",
    "silhouetteShift",
    "tightAlpha32",
    "tightAlpha32Shift",
    "tightAlphaChamfer",
    "tightAlphaChamferShift",
    "tightAlphaEdge32",
    "tightLuma32",
    "tightLuma32Shift",
    "top",
    "lower",
    "left",
    "right",
    "aspectRatio",
    "areaRatio",
    "coverage",
  ].map((metricName) => [metricName, metrics[metricName] ?? null]))
}

function countBy<T>(values: readonly T[], readKey: (value: T) => string): Record<string, number> {
  const counts = new Map<string, number>()

  for (const value of values) {
    const key = readKey(value)

    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Object.fromEntries([...counts.entries()].sort((left, right) =>
    right[1] - left[1] ||
    left[0].localeCompare(right[0])
  ))
}

export async function discoverPartMatchDecisionPaths(root: string): Promise<string[]> {
  if (!existsSync(root)) {
    return []
  }

  const paths = await readJsonPaths(root)
  const decisionPaths: string[] = []

  for (const candidatePath of paths) {
    if (await containsReviewDecisions(candidatePath)) {
      decisionPaths.push(candidatePath)
    }
  }

  return decisionPaths.sort()
}

async function readJsonPaths(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name)

    if (entry.isDirectory()) {
      return readJsonPaths(entryPath)
    }

    return entry.isFile() && entry.name.endsWith(".json")
      ? [entryPath]
      : []
  }))

  return nested.flat()
}

async function containsReviewDecisions(candidatePath: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(await readFile(candidatePath, "utf8")) as { decisions?: unknown }

    return Array.isArray(parsed.decisions)
  } catch {
    return false
  }
}

async function writeVerifierLabOutputs(
  report: PartMatchVerifierLabReport,
  outputDir: string,
): Promise<void> {
  await writeFile(
    path.join(outputDir, "lab-summary.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  await writeFile(
    path.join(outputDir, "index.html"),
    renderVerifierLabHtml(report),
  )
}

function renderVerifierLabHtml(report: PartMatchVerifierLabReport): string {
  const rows = [report.baseline, ...report.candidates]
    .map(renderCandidateRow)
    .join("")

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Part Match Verifier Lab</title>
  <style>
    body { color: #1d2430; font-family: system-ui, sans-serif; margin: 24px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #d9dee7; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f5f7fa; font-size: 12px; text-transform: uppercase; }
    .safe { color: #126b3a; font-weight: 700; }
    .unsafe { color: #9b1c1c; font-weight: 700; }
    .muted { color: #687386; }
  </style>
</head>
<body>
  <h1>Part Match Verifier Lab</h1>
  <p class="muted">Generated ${escapeHtml(report.generatedAt)}. Decisions: ${report.decisionPaths.length} files.</p>
  <p><strong>Recommendation:</strong> ${escapeHtml(report.recommendation.status)} — ${escapeHtml(report.recommendation.reason)}</p>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Status</th>
        <th>Safe</th>
        <th>Group score</th>
        <th>Pair score</th>
        <th>Config</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  ${renderDiagnosticsSection(report.baseline.diagnostics)}
</body>
</html>
`
}

function renderCandidateRow(candidate: PartMatchVerifierCandidateReport): string {
  const analysis = candidate.analysis
  const groupScore = analysis
    ? `${analysis.group.matchedPairs}/${analysis.group.expectedPairs} matched, ${analysis.group.falseGroups} false, ${analysis.group.missedPairs} missed`
    : candidate.error ?? "n/a"
  const pairScore = analysis
    ? `${analysis.pair.sameMatchedPairs} same matched, ${analysis.pair.sameMissedPairs} same missed, ${analysis.pair.falsePositivePairs} hard-negative FP`
    : "n/a"
  const safeClass = candidate.safe ? "safe" : "unsafe"

  return `<tr>
    <td>${escapeHtml(candidate.name)}</td>
    <td>${escapeHtml(candidate.status)}</td>
    <td class="${safeClass}">${candidate.safe ? "yes" : "no"}</td>
    <td>${escapeHtml(groupScore)}</td>
    <td>${escapeHtml(pairScore)}</td>
    <td>${escapeHtml(candidate.configPath ?? "none")}</td>
  </tr>`
}

function renderDiagnosticsSection(diagnostics: PartMatchVerifierPairDiagnostics | undefined): string {
  if (!diagnostics) {
    return ""
  }

  const missedRows = diagnostics.topNearThresholdMisses
    .map((pair) => `<tr>
      <td>${escapeHtml(pair.manualId)}</td>
      <td>${escapeHtml(pair.bucket)}</td>
      <td>${escapeHtml(pair.confidence.toFixed(4))}</td>
      <td>${escapeHtml(pair.leftKey ?? "")}</td>
      <td>${escapeHtml(pair.left)}</td>
      <td>${escapeHtml(pair.right)}</td>
      <td>${escapeHtml(pair.reasons.join(", "))}</td>
      <td>${escapeHtml(formatMetricSummary(pair.metrics))}</td>
    </tr>`)
    .join("")

  return `<h2>Baseline Miss Diagnostics</h2>
  <p class="muted">Top same-label missed pairs sorted by scorer confidence.</p>
  <p><strong>By bucket:</strong> ${escapeHtml(JSON.stringify(diagnostics.sameMissedByBucket))}</p>
  <p><strong>By manual:</strong> ${escapeHtml(JSON.stringify(diagnostics.sameMissedByManual))}</p>
  <table>
    <thead>
      <tr>
        <th>Manual</th>
        <th>Bucket</th>
        <th>Confidence</th>
        <th>Part key</th>
        <th>Left</th>
        <th>Right</th>
        <th>Reasons</th>
        <th>Metrics</th>
      </tr>
    </thead>
    <tbody>${missedRows}</tbody>
  </table>`
}

function formatMetricSummary(metrics: Record<string, number | null>): string {
  return Object.entries(metrics)
    .filter(([_name, value]) => value !== null)
    .map(([name, value]) => `${name}=${formatMetricValue(value)}`)
    .join(", ")
}

function formatMetricValue(value: number | null): string {
  if (value === null) {
    return "n/a"
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(4)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function timestampForPath(date: Date): string {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-")
}

function readStringListOption(argv: readonly string[], name: string): string[] | null {
  const values: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== name) {
      continue
    }

    const rawValue = argv[index + 1]

    if (!rawValue) {
      throw new Error(`${name} requires a value.`)
    }

    values.push(...rawValue.split(",").map((value) => value.trim()).filter(Boolean))
  }

  return values.length > 0 ? values : null
}

function readStringOption(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name)

  if (index === -1) {
    return null
  }

  const value = argv[index + 1]

  if (!value) {
    throw new Error(`${name} requires a value.`)
  }

  return value
}

function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(name)
}

function parseCliOptions(argv: readonly string[]): Partial<PartMatchVerifierLabOptions> {
  return {
    baselineOnly: hasFlag(argv, "--baseline-only"),
    baselineScorerConfigPath: readStringOption(argv, "--scorer-config") ?? undefined,
    candidateNames: readStringListOption(argv, "--candidate"),
    decisionPaths: readStringListOption(argv, "--decision-path") ?? undefined,
    decisionRoot: readStringOption(argv, "--decision-root") ?? undefined,
    excludeManualIds: readStringListOption(argv, "--exclude-manual-id") ?? undefined,
    labelDir: readStringOption(argv, "--label-dir") ?? undefined,
    manualIds: readStringListOption(argv, "--manual-id"),
    outputDir: readStringOption(argv, "--output-dir") ?? undefined,
    sourceDir: readStringOption(argv, "--source-dir") ?? undefined,
  }
}

async function main(): Promise<void> {
  const report = await runPartMatchVerifierLab(parseCliOptions(process.argv.slice(2)))
  const selected = report.recommendation.selectedCandidateName ?? "none"

  console.log(`Wrote part match verifier lab to ${report.options.outputDir}`)
  console.log(`Baseline: ${formatCandidateSummary(report.baseline)}`)
  for (const candidate of report.candidates) {
    console.log(`Candidate ${candidate.name}: ${formatCandidateSummary(candidate)}`)
  }
  console.log(`Recommendation: ${report.recommendation.status}; selected=${selected}; ${report.recommendation.reason}`)
}

function formatCandidateSummary(candidate: PartMatchVerifierCandidateReport): string {
  if (!candidate.analysis) {
    return `failed; ${candidate.error ?? "no analysis"}`
  }

  return `${candidate.analysis.group.matchedPairs}/${candidate.analysis.group.expectedPairs} groups; ` +
    `${candidate.analysis.group.falseGroups} false groups; ` +
    `${candidate.analysis.pair.falsePositivePairs} hard-negative FP; ` +
    `safe=${candidate.safe}`
}

const isCli = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false

if (isCli) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
