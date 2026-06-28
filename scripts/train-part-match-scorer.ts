import { existsSync } from "node:fs"
import {
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { inflateSync } from "node:zlib"
import {
  PART_MATCHER_VERSION,
  PART_PAIR_SCORER_CONFIG_VERSION,
  PART_PAIR_SCORE_FEATURE_NAMES,
  collectPartPairScorerFeatureNames,
  createPartMatchGroups,
  extractPartPairScoreFeatures,
  extractPartVisualFeatures,
  partPairScoreFeaturesMatch,
  scoreFeatureVector,
  type PartMatchColor,
  type PartMatchGroup,
  type PartMatchRegion,
  type PartMatchRowInput,
  type PartPairEvidenceCondition,
  type PartPairEvidenceRule,
  type PartPairScorerConfig,
  type PartPairScorerTreeNode,
  type PartPairScoreFeatureName,
  type PartPairScoreFeatures,
  type PartVisualFeatures,
} from "../packages/part-matching/src/index"
import { colorsAreCompatible } from "../packages/part-matching/src/color"
import {
  createStepCalloutBagRows,
  createStepCalloutBaggingPlan,
} from "../src/features/bagging/step-callout-bagging"
import type {
  StepCalloutDetectionResult,
  StepPagePreview,
} from "../src/features/steps/step-detection-contracts"

const DEFAULT_LABEL_DIR = path.join(".bag-it", "private", "part-match-reports", "labels")
const DEFAULT_OUTPUT_PATH = path.join(".bag-it", "private", "part-match-reports", "scorer-config.json")
const DEFAULT_SOURCE_DIR = path.join(".bag-it", "private", "part-color-reports", "sources")
const DEFAULT_ITERATIONS = 2000
const DEFAULT_LEARNING_RATE = 0.08
const DEFAULT_L2 = 0.001
const DEFAULT_MAX_TREE_DEPTH = 6
const DEFAULT_MIN_TREE_LEAF_SIZE = 3
const DEFAULT_MAX_EVIDENCE_RULES = 24
const DEFAULT_MAX_EVIDENCE_RULE_CONDITIONS = 2
const DEFAULT_MIN_EVIDENCE_RULE_MANUAL_SUPPORT = 1
const DEFAULT_MIN_EVIDENCE_RULE_CONDITIONS = 1
const DEFAULT_MIN_EVIDENCE_RULE_GAIN = 3
const MAX_EVIDENCE_CANDIDATES = 100000
const MAX_TRIPLE_PAIR_SEEDS = 1000
const MAX_TRIPLE_PAIR_SEED_BUFFER = MAX_TRIPLE_PAIR_SEEDS * 4
const THRESHOLD_EPSILON = 0.000001
const EVIDENCE_THRESHOLD_EPSILON = 0.0000001

const LOWER_IS_BETTER_EVIDENCE_FEATURES: PartPairScoreFeatureName[] = [
  "alignedAlpha8Distance",
  "alignedEdge8Distance",
  "alignedLuma8Distance",
  "alignmentScaleDelta",
  "alignmentShiftDistance",
  "alphaChamferDistance",
  "alphaChamferShiftDistance",
  "alphaChamferShiftRatio",
  "alpha32Distance",
  "alpha32ShiftDistance",
  "alpha32ShiftRatio",
  "alphaDistance",
  "alphaEdgeDistance",
  "alphaEdge32Distance",
  "alphaOrientationDistance",
  "alphaShiftDistance",
  "alphaShiftRatio",
  "areaRatio",
  "aspectRatio",
  "centerDistance",
  "coverageDelta",
  "leftProfileDistance",
  "lowerProfileDistance",
  "lowerSegmentDelta",
  "lumaDistance",
  "luma32Distance",
  "luma32ShiftDistance",
  "luma32ShiftRatio",
  "lumaEdgeDistance",
  "lumaEdgeShiftDistance",
  "lumaOrientationDistance",
  "lumaShiftDistance",
  "lumaShiftRatio",
  "profileMaxDistance",
  "projectionDistance",
  "rightProfileDistance",
  "silhouetteDistance",
  "silhouetteShiftDistance",
  "silhouetteShiftRatio",
  "tightAlphaChamferDistance",
  "tightAlphaChamferShiftDistance",
  "tightAlphaChamferShiftRatio",
  "topPeakDelta",
  "topProfileDistance",
  "wideAlpha32ShiftDistance",
  "wideAlpha32ShiftRatio",
  "wideLuma32ShiftDistance",
  "wideLuma32ShiftRatio",
  "wideSilhouetteShiftDistance",
  "wideSilhouetteShiftRatio",
]

const HIGHER_IS_BETTER_EVIDENCE_FEATURES: PartPairScoreFeatureName[] = [
  "alignedAlpha8Overlap",
  "alphaCorrelation",
  "hasLuma",
  "lumaCorrelation",
  "lumaEdgeCorrelation",
  "nearConfidence",
]

const EVIDENCE_THRESHOLD_QUANTILES = [
  0.01,
  0.025,
  0.05,
  0.075,
  0.1,
  0.15,
  0.2,
  0.25,
  0.3,
  0.35,
  0.4,
  0.45,
  0.5,
  0.55,
  0.6,
  0.65,
  0.7,
  0.75,
  0.8,
  0.85,
  0.9,
  0.95,
  0.975,
  0.99,
]

interface PartMatchLabel {
  cropHash?: string
  expectedPartKey?: string
  itemId: string
  role?: string
}

interface PartMatchLabelSet {
  labels: PartMatchLabel[]
  manualId: string
  reportPath: string
  status: string
}

interface PartMatchReport {
  rows?: PartMatchReportRow[]
}

interface PartMatchReportRow {
  bagId: string
  calloutId: string
  color?: PartMatchColor | null
  imageDataUrl?: string | null
  itemId?: string
  partRegion: PartMatchRegion
  rowId?: string
}

interface ReviewDecision {
  left: string
  manualId: string
  right: string
  status: string
}

interface GroupingConflictDecision {
  expectedPartKey?: string
  itemId: string
  manualId: string
  referenceItemIds: string[]
  status: string
}

type PartMatchTrainingDecision = ReviewDecision | GroupingConflictDecision
type DecisionConflictPolicy = "error" | "prefer-decisions"

interface TrainingExample {
  features: PartPairScoreFeatures
  left: string
  manualId: string
  right: string
  source: string
  target: 0 | 1
}

interface TrainingOptions {
  baseScorerConfigPath: string | null
  decisionConflictPolicy: DecisionConflictPolicy
  decisionPaths: string[]
  evidenceFeatureNames: PartPairScoreFeatureName[] | null
  excludeManualIds: string[]
  iterations: number
  l2: number
  labelDir: string
  learningRate: number
  manualIds: string[] | null
  maxEvidenceRuleConditions: number
  maxEvidenceRules: number
  minEvidenceRuleManualSupport: number
  minEvidenceRuleConditions: number
  maxTreeDepth: number
  minEvidenceRuleGain: number
  minTreeLeafSize: number
  model: "decision-tree" | "linear"
  outputPath: string
  sourceDir: string
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

interface TrainingResult {
  config: PartPairScorerConfig
  examples: TrainingExample[]
  groupScore: GroupScore
  pairScore: PairScore
}

interface EvaluatePartMatchScorerOptions {
  excludeManualIds?: string[]
  labelDir?: string
  manualIds?: string[] | null
  scorerConfigPath: string
  sourceDir?: string
}

interface LoadPartMatchScorerEvalDataOptions {
  excludeManualIds?: string[]
  includeDerivedPairs?: boolean
  labelDir?: string
  manualIds?: string[] | null
  sourceDir?: string
}

interface EvaluatePartMatchScorerResult {
  groupScore: GroupScore
  pairScore: PairScore
}

interface PartMatchScorerEvalData {
  labelSets: PartMatchLabelSet[]
  labelExamples: TrainingExample[]
  pairScoreFeaturesByManual: Map<string, Map<string, PartPairScoreFeatures>>
  reportRowsByManual: Map<string, Map<string, FeatureRow>>
}

interface PairScore {
  falsePositivePairs: number
  matchedPositivePairs: number
  negativePairs: number
  positivePairs: number
}

interface GroupScore {
  expectedPairs: number
  falseGroups: number
  matchedPairs: number
  missedPairs: number
}

export async function trainPartMatchScorer(options: Partial<TrainingOptions> = {}): Promise<TrainingResult> {
  const resolvedOptions: TrainingOptions = {
    baseScorerConfigPath: options.baseScorerConfigPath ?? null,
    decisionConflictPolicy: options.decisionConflictPolicy ?? "error",
    decisionPaths: options.decisionPaths ?? [],
    evidenceFeatureNames: options.evidenceFeatureNames ?? null,
    excludeManualIds: options.excludeManualIds ?? [],
    iterations: options.iterations ?? DEFAULT_ITERATIONS,
    l2: options.l2 ?? DEFAULT_L2,
    labelDir: options.labelDir ?? DEFAULT_LABEL_DIR,
    learningRate: options.learningRate ?? DEFAULT_LEARNING_RATE,
    manualIds: options.manualIds ?? null,
    maxEvidenceRuleConditions: options.maxEvidenceRuleConditions ?? DEFAULT_MAX_EVIDENCE_RULE_CONDITIONS,
    maxEvidenceRules: options.maxEvidenceRules ?? DEFAULT_MAX_EVIDENCE_RULES,
    minEvidenceRuleManualSupport: options.minEvidenceRuleManualSupport ?? DEFAULT_MIN_EVIDENCE_RULE_MANUAL_SUPPORT,
    minEvidenceRuleConditions: options.minEvidenceRuleConditions ?? DEFAULT_MIN_EVIDENCE_RULE_CONDITIONS,
    maxTreeDepth: options.maxTreeDepth ?? DEFAULT_MAX_TREE_DEPTH,
    minEvidenceRuleGain: options.minEvidenceRuleGain ?? DEFAULT_MIN_EVIDENCE_RULE_GAIN,
    minTreeLeafSize: options.minTreeLeafSize ?? DEFAULT_MIN_TREE_LEAF_SIZE,
    model: options.model ?? "decision-tree",
    outputPath: options.outputPath ?? DEFAULT_OUTPUT_PATH,
    sourceDir: options.sourceDir ?? DEFAULT_SOURCE_DIR,
  }
  const labelSets = filterLabelSets(
    await readPartMatchLabelSets(resolvedOptions.labelDir),
    resolvedOptions,
  )
  const reportRowsByManual = await readFeatureRowsByManual(labelSets, resolvedOptions.sourceDir)
  const baseScorerConfig = resolvedOptions.baseScorerConfigPath
    ? JSON.parse(await readFile(path.resolve(resolvedOptions.baseScorerConfigPath), "utf8")) as PartPairScorerConfig
    : null
  const pairFeatureNames = createTrainingPairFeatureNames(baseScorerConfig, resolvedOptions.evidenceFeatureNames)
  const labelExamples = createLabelExamples(labelSets, reportRowsByManual, pairFeatureNames)
  const decisionExamples = await createDecisionExamples(
    resolvedOptions.decisionPaths,
    reportRowsByManual,
    pairFeatureNames,
  )
  const uniqueExamples = dedupeTrainingExamples({
    decisionConflictPolicy: resolvedOptions.decisionConflictPolicy,
    decisionExamples,
    labelExamples,
  })

  if (uniqueExamples.length === 0 || !uniqueExamples.some((example) => example.target === 1)) {
    throw new Error("Part match scorer needs at least one positive training pair.")
  }

  if (!uniqueExamples.some((example) => example.target === 0)) {
    throw new Error("Part match scorer needs at least one negative training pair.")
  }

  const config = fitScorer(uniqueExamples, resolvedOptions, baseScorerConfig)
  const pairScore = evaluatePairScore(uniqueExamples, config)
  const groupScore = evaluateGroupScore(labelSets, reportRowsByManual, config)

  await mkdir(path.dirname(resolvedOptions.outputPath), { recursive: true })
  await writeFile(resolvedOptions.outputPath, `${JSON.stringify(config, null, 2)}\n`)

  return {
    config,
    examples: uniqueExamples,
    groupScore,
    pairScore,
  }
}

export async function evaluatePartMatchScorer(
  options: EvaluatePartMatchScorerOptions,
): Promise<EvaluatePartMatchScorerResult> {
  const scorerConfig = JSON.parse(
    await readFile(path.resolve(options.scorerConfigPath), "utf8"),
  ) as PartPairScorerConfig
  const evalData = await loadPartMatchScorerEvalData(options)

  return evaluateLoadedPartMatchScorer(evalData, scorerConfig)
}

export async function loadPartMatchScorerEvalData(
  options: LoadPartMatchScorerEvalDataOptions = {},
): Promise<PartMatchScorerEvalData> {
  const includeDerivedPairs = options.includeDerivedPairs ?? true
  const labelSets = filterLabelSets(
    await readPartMatchLabelSets(options.labelDir ?? DEFAULT_LABEL_DIR),
    {
      excludeManualIds: options.excludeManualIds ?? [],
      manualIds: options.manualIds ?? null,
    },
  )
  const reportRowsByManual = await readFeatureRowsByManual(
    labelSets,
    options.sourceDir ?? DEFAULT_SOURCE_DIR,
  )
  const labelExamples = includeDerivedPairs
    ? createLabelExamples(labelSets, reportRowsByManual, null)
    : []
  const pairScoreFeaturesByManual = includeDerivedPairs
    ? createPairScoreFeatureCachesByManual(reportRowsByManual)
    : new Map()

  return {
    labelSets,
    labelExamples,
    pairScoreFeaturesByManual,
    reportRowsByManual,
  }
}

export function evaluateLoadedPartMatchScorer(
  evalData: PartMatchScorerEvalData,
  scorerConfig: PartPairScorerConfig,
): EvaluatePartMatchScorerResult {
  return {
    groupScore: evaluateGroupScore(
      evalData.labelSets,
      evalData.reportRowsByManual,
      scorerConfig,
      evalData.pairScoreFeaturesByManual,
    ),
    pairScore: evaluatePairScore(evalData.labelExamples, scorerConfig),
  }
}

function filterLabelSets(
  labelSets: readonly PartMatchLabelSet[],
  options: Pick<TrainingOptions, "excludeManualIds" | "manualIds">,
): PartMatchLabelSet[] {
  const includeManualIds = options.manualIds ? new Set(options.manualIds) : null
  const excludeManualIds = new Set(options.excludeManualIds)

  return labelSets.filter((labelSet) =>
    (!includeManualIds || includeManualIds.has(labelSet.manualId)) &&
    !excludeManualIds.has(labelSet.manualId)
  )
}

function createTrainingPairFeatureNames(
  baseScorerConfig: PartPairScorerConfig | null,
  evidenceFeatureNames: readonly PartPairScoreFeatureName[] | null,
): PartPairScoreFeatureName[] | null {
  if (!baseScorerConfig && !evidenceFeatureNames) {
    return null
  }

  const featureNames = new Set<string>(evidenceFeatureNames ?? PART_PAIR_SCORE_FEATURE_NAMES)

  if (baseScorerConfig) {
    for (const featureName of collectPartPairScorerFeatureNames(baseScorerConfig)) {
      featureNames.add(featureName)
    }
  }

  const validFeatureNames = new Set<string>(PART_PAIR_SCORE_FEATURE_NAMES)

  return [...featureNames]
    .filter((featureName): featureName is PartPairScoreFeatureName => validFeatureNames.has(featureName))
    .sort()
}

async function readPartMatchLabelSets(labelDir: string): Promise<PartMatchLabelSet[]> {
  if (!existsSync(labelDir)) {
    return []
  }

  const paths = await readJsonFilePaths(labelDir)
  const labelSets = await Promise.all(paths.map(async (labelPath) => {
    const parsed = JSON.parse(await readFile(labelPath, "utf8")) as PartMatchLabelSet

    return {
      ...parsed,
      reportPath: normalizeWorkspacePath(parsed.reportPath),
    }
  }))

  return labelSets.sort((left, right) =>
    left.manualId.localeCompare(right.manualId) ||
    left.reportPath.localeCompare(right.reportPath)
  )
}

async function readJsonFilePaths(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name)

    if (entry.isDirectory()) {
      return readJsonFilePaths(entryPath)
    }

    return entry.isFile() && entry.name.endsWith(".json")
      ? [entryPath]
      : []
  }))

  return nested.flat().sort()
}

async function readFeatureRowsByManual(
  labelSets: readonly PartMatchLabelSet[],
  sourceDir: string,
): Promise<Map<string, Map<string, FeatureRow>>> {
  const result = new Map<string, Map<string, FeatureRow>>()

  for (const labelSet of labelSets) {
    if (result.has(labelSet.manualId)) {
      continue
    }

    const report = JSON.parse(await readFile(path.resolve(labelSet.reportPath), "utf8")) as PartMatchReport
    const sessionPath = path.join(sourceDir, `${labelSet.manualId}.current-app-result.bagit-session.json`)
    const session = existsSync(sessionPath)
      ? JSON.parse(await readFile(sessionPath, "utf8")) as BagItSession
      : null
    const rows = new Map<string, FeatureRow>()

    for (const row of createSourceRows(labelSet.manualId, report, session)) {
      const featureRow = toFeatureRow(row)

      if (featureRow) {
        rows.set(featureRow.itemId, featureRow)
      }
    }

    result.set(labelSet.manualId, rows)
  }

  return result
}

interface BagItSession {
  manual?: {
    fileName?: string
    lastModified?: number
    sizeBytes?: number
  }
  stepDetectionResult?: StepCalloutDetectionResult
}

function createSourceRows(
  manualId: string,
  report: PartMatchReport,
  session: BagItSession | null,
): PartMatchReportRow[] {
  if (!session?.stepDetectionResult) {
    return report.rows ?? []
  }

  const reportRowsById = new Map((report.rows ?? []).map((row) => [row.rowId ?? row.itemId, row]))
  const plan = createStepCalloutBaggingPlan(session.stepDetectionResult)
  const bagRows = createStepCalloutBagRows(plan, {
    manualFingerprint: createManualFingerprint(session, manualId),
    pagePreviews: readPagePreviews(session.stepDetectionResult),
  })

  return bagRows.map((row) => {
    const reportRow = reportRowsById.get(row.id)

    return {
      bagId: row.bagId,
      calloutId: row.calloutId,
      color: row.color,
      imageDataUrl: reportRow?.imageDataUrl ?? null,
      itemId: row.id,
      partImageAlphaMask: row.partImageAlphaMask,
      partRegion: row.partCrop?.region ?? row.anchor.partRegion,
      rowId: row.id,
    }
  })
}

function createManualFingerprint(session: BagItSession, fallbackManualId: string): string {
  const manual = session.manual ?? {}

  return `${manual.fileName ?? fallbackManualId}:${manual.sizeBytes ?? 0}:${manual.lastModified ?? 0}`
}

function readPagePreviews(stepDetectionResult: StepCalloutDetectionResult): StepPagePreview[] | undefined {
  return stepDetectionResult.pagePreviews
}

function toFeatureRow(row: PartMatchReportRow & {
  partImageAlphaMask?: {
    data: Uint8ClampedArray | number[] | Record<string, number>
    height: number
    width: number
  } | null
}): FeatureRow | null {
  const itemId = row.itemId ?? row.rowId
  const image = decodePngImageDataUrl(row.imageDataUrl)

  if (!itemId) {
    return null
  }

  const alphaMask = row.partImageAlphaMask ?? (image
    ? {
        data: extractAlpha(image.data),
        height: image.height,
        width: image.width,
      }
    : null)

  if (!alphaMask) {
    return null
  }

  const features = extractPartVisualFeatures({
    alphaMask,
    partRegion: row.partRegion,
    renderedPixels: image ?? null,
  })

  return {
    bagId: row.bagId,
    calloutId: row.calloutId,
    color: row.color,
    features,
    itemId,
    partRegion: row.partRegion,
    rowId: row.rowId ?? itemId,
  }
}

function createLabelExamples(
  labelSets: readonly PartMatchLabelSet[],
  reportRowsByManual: ReadonlyMap<string, ReadonlyMap<string, FeatureRow>>,
  pairFeatureNames: readonly PartPairScoreFeatureName[] | null,
): TrainingExample[] {
  return labelSets.flatMap((labelSet) => {
    const rowsById = reportRowsByManual.get(labelSet.manualId) ?? new Map()
    const labels = labelSet.labels.filter(isTrainingLabel)
    const labeledItemIds = new Set(labels.map((label) => label.itemId))
    const examples: TrainingExample[] = []

    for (let leftIndex = 0; leftIndex < labels.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < labels.length; rightIndex += 1) {
        const leftLabel = labels[leftIndex]
        const rightLabel = labels[rightIndex]

        if (!leftLabel || !rightLabel) {
          continue
        }

        const example = createExampleFromRows({
          left: rowsById.get(leftLabel.itemId),
          leftId: leftLabel.itemId,
          manualId: labelSet.manualId,
          right: rowsById.get(rightLabel.itemId),
          rightId: rightLabel.itemId,
          source: "label",
          target: labelsAreSamePart(leftLabel, rightLabel) ? 1 : 0,
          pairFeatureNames,
        })

        if (example) {
          examples.push(example)
        }
      }
    }

    for (const excludedLabel of labels.filter((label) => label.role === "excluded")) {
      for (const row of rowsById.values()) {
        if (labeledItemIds.has(row.itemId)) {
          continue
        }

        const example = createExampleFromRows({
          left: rowsById.get(excludedLabel.itemId),
          leftId: excludedLabel.itemId,
          manualId: labelSet.manualId,
          right: row,
          rightId: row.itemId,
          source: "excluded-unlabeled-row",
          target: 0,
          pairFeatureNames,
        })

        if (example) {
          examples.push(example)
        }
      }
    }

    return examples
  })
}

async function createDecisionExamples(
  decisionPaths: readonly string[],
  reportRowsByManual: ReadonlyMap<string, ReadonlyMap<string, FeatureRow>>,
  pairFeatureNames: readonly PartPairScoreFeatureName[] | null,
): Promise<TrainingExample[]> {
  const examples: TrainingExample[] = []

  for (const decisionPath of decisionPaths) {
    const parsed = JSON.parse(await readFile(path.resolve(decisionPath), "utf8")) as { decisions?: PartMatchTrainingDecision[] }

    for (const decision of parsed.decisions ?? []) {
      if (decision.status !== "same" && decision.status !== "different") {
        continue
      }

      examples.push(...createDecisionExamplesForDecision({
        decision,
        decisionPath,
        pairFeatureNames,
        reportRowsByManual,
      }))
    }
  }

  return examples
}

function createDecisionExamplesForDecision({
  decision,
  decisionPath,
  pairFeatureNames,
  reportRowsByManual,
}: {
  decision: PartMatchTrainingDecision
  decisionPath: string
  pairFeatureNames: readonly PartPairScoreFeatureName[] | null
  reportRowsByManual: ReadonlyMap<string, ReadonlyMap<string, FeatureRow>>
}): TrainingExample[] {
  if (isReviewDecision(decision)) {
    return compactExamples([
      createDecisionExample({
        leftId: decision.left,
        manualId: decision.manualId,
        rightId: decision.right,
        source: `decision:${normalizeWorkspacePath(decisionPath)}`,
        status: decision.status,
        pairFeatureNames,
        reportRowsByManual,
      }),
    ])
  }

  if (!isGroupingConflictDecision(decision)) {
    return []
  }

  return compactExamples(decision.referenceItemIds.map((referenceItemId) =>
    createDecisionExample({
      leftId: decision.itemId,
      manualId: decision.manualId,
      rightId: referenceItemId,
      source: `grouping-decision:${normalizeWorkspacePath(decisionPath)}:${decision.expectedPartKey ?? "unknown"}`,
      status: decision.status,
      pairFeatureNames,
      reportRowsByManual,
    })
  ))
}

function isReviewDecision(decision: PartMatchTrainingDecision): decision is ReviewDecision {
  return "left" in decision && "right" in decision
}

function isGroupingConflictDecision(decision: PartMatchTrainingDecision): decision is GroupingConflictDecision {
  return "itemId" in decision && Array.isArray(decision.referenceItemIds)
}

function compactExamples(examples: (TrainingExample | null)[]): TrainingExample[] {
  return examples.filter((example): example is TrainingExample => Boolean(example))
}

function createDecisionExample({
  leftId,
  manualId,
  pairFeatureNames,
  reportRowsByManual,
  rightId,
  source,
  status,
}: {
  leftId: string
  manualId: string
  pairFeatureNames: readonly PartPairScoreFeatureName[] | null
  reportRowsByManual: ReadonlyMap<string, ReadonlyMap<string, FeatureRow>>
  rightId: string
  source: string
  status: string
}): TrainingExample | null {
  const rowsById = reportRowsByManual.get(manualId)

  return createExampleFromRows({
    left: rowsById?.get(leftId),
    leftId,
    manualId,
    right: rowsById?.get(rightId),
    rightId,
    source,
    target: status === "same" ? 1 : 0,
    pairFeatureNames,
  })
}

function isScoredLabel(label: PartMatchLabel): boolean {
  return label.role !== "excluded" && Boolean(label.expectedPartKey)
}

function isTrainingLabel(label: PartMatchLabel): boolean {
  return isScoredLabel(label) || label.role === "excluded"
}

function labelsAreSamePart(left: PartMatchLabel, right: PartMatchLabel): boolean {
  return isScoredLabel(left) &&
    isScoredLabel(right) &&
    left.expectedPartKey === right.expectedPartKey
}

function createExampleFromRows({
  left,
  leftId,
  manualId,
  pairFeatureNames,
  right,
  rightId,
  source,
  target,
}: {
  left?: FeatureRow
  leftId: string
  manualId: string
  pairFeatureNames: readonly PartPairScoreFeatureName[] | null
  right?: FeatureRow
  rightId: string
  source: string
  target: 0 | 1
}): TrainingExample | null {
  if (
    !left ||
    !right ||
    left.bagId !== right.bagId ||
    left.calloutId === right.calloutId ||
    !colorsAreCompatible(left.color, right.color)
  ) {
    return null
  }

  return {
    features: extractPartPairScoreFeatures(left.features, right.features, {
      featureNames: pairFeatureNames,
    }),
    left: leftId,
    manualId,
    right: rightId,
    source,
    target,
  }
}

function createPairScoreFeatureCachesByManual(
  reportRowsByManual: ReadonlyMap<string, ReadonlyMap<string, FeatureRow>>,
): Map<string, Map<string, PartPairScoreFeatures>> {
  const result = new Map<string, Map<string, PartPairScoreFeatures>>()

  for (const manualId of reportRowsByManual.keys()) {
    result.set(manualId, new Map<string, PartPairScoreFeatures>())
  }

  return result
}

function dedupeExamples(examples: readonly TrainingExample[]): TrainingExample[] {
  const result = new Map<string, TrainingExample>()

  for (const example of examples) {
    const key = exampleKey(example)
    const existing = result.get(key)

    if (existing && existing.target !== example.target) {
      throw new Error(`Conflicting part-match training labels for ${key}.`)
    }

    result.set(key, existing ?? example)
  }

  return [...result.values()]
}

function dedupeTrainingExamples({
  decisionConflictPolicy,
  decisionExamples,
  labelExamples,
}: {
  decisionConflictPolicy: DecisionConflictPolicy
  decisionExamples: readonly TrainingExample[]
  labelExamples: readonly TrainingExample[]
}): TrainingExample[] {
  if (decisionConflictPolicy === "error") {
    return dedupeExamples([...labelExamples, ...decisionExamples])
  }

  const uniqueDecisionExamples = dedupeExamples(decisionExamples)
  const decisionTargetsByKey = new Map(uniqueDecisionExamples.map((example) => [
    exampleKey(example),
    example.target,
  ]))
  const compatibleLabelExamples = labelExamples.filter((example) => {
    const decisionTarget = decisionTargetsByKey.get(exampleKey(example))

    return decisionTarget === undefined || decisionTarget === example.target
  })

  return dedupeExamples([...compatibleLabelExamples, ...uniqueDecisionExamples])
}

function exampleKey(example: TrainingExample): string {
  const [left, right] = [example.left, example.right].sort()

  return `${example.manualId}\0${left}\0${right}`
}

function fitScorer(
  examples: readonly TrainingExample[],
  options: TrainingOptions,
  baseScorerConfig: PartPairScorerConfig | null,
): PartPairScorerConfig {
  if (baseScorerConfig) {
    return fitEvidenceGatedScorer(examples, options, baseScorerConfig)
  }

  return options.model === "linear"
    ? fitLogisticScorer(examples, options)
    : fitDecisionTreeScorer(examples, options)
}

function fitEvidenceGatedScorer(
  examples: readonly TrainingExample[],
  options: TrainingOptions,
  baseScorerConfig: PartPairScorerConfig,
): PartPairScorerConfig {
  const evidenceRules = mergeEvidenceRules(
    baseScorerConfig.evidenceRules ?? [],
    fitEvidenceRules(examples, baseScorerConfig, options),
  )
  const supplementalRules = mergeEvidenceRules(
    baseScorerConfig.supplementalRules ?? [],
    fitSupplementalRules(examples, baseScorerConfig, options),
  )

  return {
    ...baseScorerConfig,
    evidenceRules,
    metadata: {
      ...(baseScorerConfig.metadata ?? {}),
      baseScorerConfigPath: options.baseScorerConfigPath
        ? normalizeWorkspacePath(options.baseScorerConfigPath)
        : null,
      evidenceRuleConditionLimit: options.maxEvidenceRuleConditions,
      evidenceRuleCount: evidenceRules.length,
      evidenceRuleFeatureNames: options.evidenceFeatureNames,
      evidenceRuleManualSupport: options.minEvidenceRuleManualSupport,
      evidenceRuleMinConditions: options.minEvidenceRuleConditions,
      matcherVersion: PART_MATCHER_VERSION,
      model: scorerModelName(baseScorerConfig, supplementalRules),
      supplementalRuleCount: supplementalRules.length,
    },
    supplementalRules,
    version: PART_PAIR_SCORER_CONFIG_VERSION,
  }
}

function scorerModelName(
  baseScorerConfig: PartPairScorerConfig,
  supplementalRules: readonly PartPairEvidenceRule[],
): string {
  const baseName = `${baseScorerConfig.metadata?.model ?? baseScorerConfig.kind ?? "base"}`
  const evidenceName = baseName.endsWith("+evidence-rules")
    ? baseName
    : `${baseName}+evidence-rules`

  return supplementalRules.length > 0
    ? `${evidenceName}+supplemental-rules`
    : evidenceName
}

function fitEvidenceRules(
  examples: readonly TrainingExample[],
  baseScorerConfig: PartPairScorerConfig,
  options: Pick<TrainingOptions, "evidenceFeatureNames" | "maxEvidenceRuleConditions" | "maxEvidenceRules" | "minEvidenceRuleConditions" | "minEvidenceRuleGain" | "minEvidenceRuleManualSupport">,
): PartPairEvidenceRule[] {
  const basePositiveMatches = examples
    .map((example, index) => ({ example, index }))
    .filter((entry) => entry.example.target === 1 && rawModelMatches(entry.example.features, baseScorerConfig))
  const baseNegativeMatches = examples
    .map((example, index) => ({ example, index }))
    .filter((entry) => entry.example.target === 0 && rawModelMatches(entry.example.features, baseScorerConfig))
  const positiveIndexes = new Set(basePositiveMatches.map((entry) => entry.index))
  const candidates = createEvidenceRuleCandidates(
    examples,
    basePositiveMatches.map((entry) => entry.index),
    baseNegativeMatches.map((entry) => entry.index),
    options.evidenceFeatureNames,
    options.maxEvidenceRuleConditions,
    options.minEvidenceRuleConditions,
    options.minEvidenceRuleManualSupport,
  )

  return selectEvidenceRules(candidates, positiveIndexes, options)
}

function fitSupplementalRules(
  examples: readonly TrainingExample[],
  baseScorerConfig: PartPairScorerConfig,
  options: Pick<TrainingOptions, "evidenceFeatureNames" | "maxEvidenceRuleConditions" | "maxEvidenceRules" | "minEvidenceRuleConditions" | "minEvidenceRuleGain" | "minEvidenceRuleManualSupport">,
): PartPairEvidenceRule[] {
  const missedPositiveIndexes = examples
    .map((example, index) => ({ example, index }))
    .filter((entry) => entry.example.target === 1 && !partPairScoreFeaturesMatch(entry.example.features, baseScorerConfig))
    .map((entry) => entry.index)
  const negativeIndexes = examples
    .map((example, index) => ({ example, index }))
    .filter((entry) => entry.example.target === 0)
    .map((entry) => entry.index)

  return selectEvidenceRules(
    createEvidenceRuleCandidates(
      examples,
      missedPositiveIndexes,
      negativeIndexes,
      options.evidenceFeatureNames,
      options.maxEvidenceRuleConditions,
      options.minEvidenceRuleConditions,
      options.minEvidenceRuleManualSupport,
    ),
    new Set(missedPositiveIndexes),
    options,
  )
}

function mergeEvidenceRules(
  ...ruleGroups: readonly (readonly PartPairEvidenceRule[])[]
): PartPairEvidenceRule[] {
  const result: PartPairEvidenceRule[] = []
  const seen = new Set<string>()

  for (const rule of ruleGroups.flat()) {
    const key = evidenceRuleKey(rule)

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(rule)
  }

  return result
}

function selectEvidenceRules(
  candidates: readonly EvidenceRuleCandidate[],
  uncoveredPositiveIndexes: Set<number>,
  options: Pick<TrainingOptions, "maxEvidenceRules" | "minEvidenceRuleGain">,
): PartPairEvidenceRule[] {
  const selected: PartPairEvidenceRule[] = []

  for (;;) {
    const best = candidates
      .map((candidate) => ({
        candidate,
        gain: countUncovered(candidate.positiveIndexes, uncoveredPositiveIndexes),
      }))
      .filter((entry) => entry.gain >= options.minEvidenceRuleGain)
      .sort((left, right) =>
        right.gain - left.gain ||
        right.candidate.positiveManualCount - left.candidate.positiveManualCount ||
        right.candidate.positiveIndexes.length - left.candidate.positiveIndexes.length ||
        left.candidate.rule.conditions.length - right.candidate.rule.conditions.length ||
        evidenceRuleKey(left.candidate.rule).localeCompare(evidenceRuleKey(right.candidate.rule))
      )[0]

    if (!best || selected.length >= options.maxEvidenceRules) {
      return selected
    }

    selected.push(best.candidate.rule)

    for (const index of best.candidate.positiveIndexes) {
      uncoveredPositiveIndexes.delete(index)
    }
  }
}

function rawModelMatches(
  features: PartPairScoreFeatures,
  config: PartPairScorerConfig,
): boolean {
  return predict(features, config) >= config.threshold
}

interface EvidenceRuleCandidate {
  positiveIndexes: number[]
  positiveManualCount: number
  rule: PartPairEvidenceRule
}

interface EvidenceRuleStats extends EvidenceRuleCandidate {
  negativeIndexes: number[]
  positiveManualOrdinals: number[]
}

function createEvidenceRuleCandidates(
  examples: readonly TrainingExample[],
  basePositiveIndexes: readonly number[],
  baseNegativeIndexes: readonly number[],
  evidenceFeatureNames: readonly PartPairScoreFeatureName[] | null,
  maxEvidenceRuleConditions: number,
  minEvidenceRuleConditions: number,
  minEvidenceRuleManualSupport: number,
): EvidenceRuleCandidate[] {
  const manualOrdinalsById = createManualOrdinalsById(examples)
  const atoms = createEvidenceConditionCandidates(examples, basePositiveIndexes, evidenceFeatureNames)
    .map((condition): EvidenceRuleStats => {
      const rule = { conditions: [condition] }
      const positiveIndexes = matchedIndexes(examples, basePositiveIndexes, rule)
      const positiveManualOrdinals = matchedManualOrdinals(examples, positiveIndexes, manualOrdinalsById)

      return {
        negativeIndexes: matchedIndexes(examples, baseNegativeIndexes, rule),
        positiveIndexes,
        positiveManualCount: positiveManualOrdinals.length,
        positiveManualOrdinals,
        rule,
      }
    })
    .filter((candidate) => candidate.positiveIndexes.length > 0)
  const candidates = new Map<string, EvidenceRuleCandidate>()
  const triplePairSeeds: EvidenceRuleStats[] = []

  for (const atom of atoms) {
    addEvidenceRuleCandidate(candidates, atom, {
      minEvidenceRuleConditions,
      minEvidenceRuleManualSupport,
    })
  }

  for (let leftIndex = 0; leftIndex < atoms.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < atoms.length; rightIndex += 1) {
      const left = atoms[leftIndex]
      const right = atoms[rightIndex]

      if (!left || !right || evidenceRulesShareFeature(left.rule, right.rule)) {
        continue
      }

      const pair = combineEvidenceRuleStats(left, right)

      addEvidenceRuleCandidate(candidates, pair, {
        minEvidenceRuleConditions,
        minEvidenceRuleManualSupport,
      })

      if (
        maxEvidenceRuleConditions >= 3 &&
        pair.negativeIndexes.length > 0 &&
        pair.positiveIndexes.length > 0
      ) {
        addTriplePairSeed(triplePairSeeds, pair)
      }
    }
  }

  if (maxEvidenceRuleConditions >= 3) {
    for (const pair of chooseTriplePairSeeds(triplePairSeeds)) {
      for (const atom of atoms) {
        if (evidenceRulesShareFeature(pair.rule, atom.rule)) {
          continue
        }

        addEvidenceRuleCandidate(candidates, combineEvidenceRuleStats(pair, atom), {
          minEvidenceRuleConditions,
          minEvidenceRuleManualSupport,
        })
      }
    }
  }

  return [...candidates.values()]
}

function addTriplePairSeed(
  seeds: EvidenceRuleStats[],
  seed: EvidenceRuleStats,
): void {
  seeds.push(seed)

  if (seeds.length <= MAX_TRIPLE_PAIR_SEED_BUFFER) {
    return
  }

  seeds.splice(0, seeds.length, ...chooseTriplePairSeeds(seeds))
}

function combineEvidenceRuleStats(
  left: EvidenceRuleStats,
  right: EvidenceRuleStats,
): EvidenceRuleStats {
  const positiveManualOrdinals = intersectSortedIndexes(
    left.positiveManualOrdinals,
    right.positiveManualOrdinals,
  )

  return {
    negativeIndexes: intersectSortedIndexes(left.negativeIndexes, right.negativeIndexes),
    positiveIndexes: intersectSortedIndexes(left.positiveIndexes, right.positiveIndexes),
    positiveManualCount: positiveManualOrdinals.length,
    positiveManualOrdinals,
    rule: {
      conditions: sortEvidenceConditions([
        ...left.rule.conditions,
        ...right.rule.conditions,
      ]),
    },
  }
}

function chooseTriplePairSeeds(pairSeeds: readonly EvidenceRuleStats[]): EvidenceRuleStats[] {
  return [...pairSeeds]
    .sort((left, right) =>
      left.negativeIndexes.length - right.negativeIndexes.length ||
      right.positiveIndexes.length - left.positiveIndexes.length ||
      evidenceRuleKey(left.rule).localeCompare(evidenceRuleKey(right.rule))
    )
    .slice(0, MAX_TRIPLE_PAIR_SEEDS)
}

function createManualOrdinalsById(
  examples: readonly TrainingExample[],
): ReadonlyMap<string, number> {
  const manualOrdinalsById = new Map<string, number>()

  for (const example of examples) {
    if (manualOrdinalsById.has(example.manualId)) {
      continue
    }

    manualOrdinalsById.set(example.manualId, manualOrdinalsById.size)
  }

  return manualOrdinalsById
}

function intersectSortedIndexes(
  left: readonly number[],
  right: readonly number[],
): number[] {
  const result: number[] = []
  let leftIndex = 0
  let rightIndex = 0

  while (leftIndex < left.length && rightIndex < right.length) {
    const leftValue = left[leftIndex] ?? -1
    const rightValue = right[rightIndex] ?? -1

    if (leftValue === rightValue) {
      result.push(leftValue)
      leftIndex += 1
      rightIndex += 1
      continue
    }

    if (leftValue < rightValue) {
      leftIndex += 1
      continue
    }

    rightIndex += 1
  }

  return result
}

function evidenceRulesShareFeature(left: PartPairEvidenceRule, right: PartPairEvidenceRule): boolean {
  const features = new Set(left.conditions.map((condition) => condition.featureName))

  return right.conditions.some((condition) => features.has(condition.featureName))
}

function createEvidenceConditionCandidates(
  examples: readonly TrainingExample[],
  basePositiveIndexes: readonly number[],
  evidenceFeatureNames: readonly PartPairScoreFeatureName[] | null,
): PartPairEvidenceCondition[] {
  const candidates = new Map<string, PartPairEvidenceCondition>()
  const allowedFeatures = evidenceFeatureNames ? new Set(evidenceFeatureNames) : null

  for (const featureName of filterEvidenceFeatures(LOWER_IS_BETTER_EVIDENCE_FEATURES, allowedFeatures)) {
    for (const threshold of quantileThresholds(examples, basePositiveIndexes, featureName)) {
      const condition: PartPairEvidenceCondition = {
        featureName,
        operator: "lt",
        threshold: threshold + EVIDENCE_THRESHOLD_EPSILON,
      }

      candidates.set(evidenceConditionKey(condition), condition)
    }
  }

  for (const featureName of filterEvidenceFeatures(HIGHER_IS_BETTER_EVIDENCE_FEATURES, allowedFeatures)) {
    for (const threshold of quantileThresholds(examples, basePositiveIndexes, featureName)) {
      const condition: PartPairEvidenceCondition = {
        featureName,
        operator: "gt",
        threshold: threshold - EVIDENCE_THRESHOLD_EPSILON,
      }

      candidates.set(evidenceConditionKey(condition), condition)
    }
  }

  return [...candidates.values()]
}

function filterEvidenceFeatures(
  featureNames: readonly PartPairScoreFeatureName[],
  allowedFeatures: ReadonlySet<PartPairScoreFeatureName> | null,
): PartPairScoreFeatureName[] {
  return allowedFeatures
    ? featureNames.filter((featureName) => allowedFeatures.has(featureName))
    : [...featureNames]
}

function quantileThresholds(
  examples: readonly TrainingExample[],
  indexes: readonly number[],
  featureName: PartPairScoreFeatureName,
): number[] {
  const values = indexes
    .map((index) => examples[index]?.features[featureName] ?? Number.NaN)
    .filter(Number.isFinite)
    .sort((left, right) => left - right)

  if (values.length === 0) {
    return []
  }

  return [...new Set(EVIDENCE_THRESHOLD_QUANTILES.map((quantile) => {
    const index = Math.min(values.length - 1, Math.floor((values.length - 1) * quantile))

    return Number((values[index] ?? 0).toPrecision(12))
  }))]
}

function addEvidenceRuleCandidate(
  candidates: Map<string, EvidenceRuleCandidate>,
  candidate: EvidenceRuleStats,
  {
    minEvidenceRuleConditions,
    minEvidenceRuleManualSupport,
  }: {
    minEvidenceRuleConditions: number
    minEvidenceRuleManualSupport: number
  },
): void {
  if (
    candidate.positiveIndexes.length === 0 ||
    candidate.positiveManualCount < minEvidenceRuleManualSupport ||
    candidate.negativeIndexes.length > 0 ||
    candidate.rule.conditions.length < minEvidenceRuleConditions ||
    !hasSpecificEvidenceCondition(candidate.rule)
  ) {
    return
  }

  const key = evidenceRuleKey(candidate.rule)

  if (!candidates.has(key) && candidates.size >= MAX_EVIDENCE_CANDIDATES) {
    return
  }

  candidates.set(key, {
    positiveIndexes: candidate.positiveIndexes,
    positiveManualCount: candidate.positiveManualCount,
    rule: candidate.rule,
  })
}

function hasSpecificEvidenceCondition(rule: PartPairEvidenceRule): boolean {
  return rule.conditions.some((condition) => condition.featureName !== "hasLuma")
}

function matchedIndexes(
  examples: readonly TrainingExample[],
  indexes: readonly number[],
  rule: PartPairEvidenceRule,
): number[] {
  const result: number[] = []

  for (const index of indexes) {
    const example = examples[index]

    if (example && evidenceRuleMatches(example.features, rule)) {
      result.push(index)
    }
  }

  return result
}

function matchedManualOrdinals(
  examples: readonly TrainingExample[],
  indexes: readonly number[],
  manualOrdinalsById: ReadonlyMap<string, number>,
): number[] {
  const seen = new Set<number>()

  for (const index of indexes) {
    const example = examples[index]

    if (example) {
      const manualOrdinal = manualOrdinalsById.get(example.manualId)

      if (manualOrdinal !== undefined) {
        seen.add(manualOrdinal)
      }
    }
  }

  return [...seen].sort((left, right) => left - right)
}

function evidenceRuleMatches(
  features: PartPairScoreFeatures,
  rule: PartPairEvidenceRule,
): boolean {
  return rule.conditions.every((condition) => {
    const value = features[condition.featureName as PartPairScoreFeatureName] ?? 0

    return condition.operator === "lt"
      ? value < condition.threshold
      : value > condition.threshold
  })
}

function countUncovered(indexes: readonly number[], uncovered: ReadonlySet<number>): number {
  let count = 0

  for (const index of indexes) {
    if (uncovered.has(index)) {
      count += 1
    }
  }

  return count
}

function sortEvidenceConditions(
  conditions: readonly PartPairEvidenceCondition[],
): PartPairEvidenceCondition[] {
  return [...conditions].sort((left, right) =>
    left.featureName.localeCompare(right.featureName) ||
    left.operator.localeCompare(right.operator) ||
    left.threshold - right.threshold
  )
}

function evidenceRuleKey(rule: PartPairEvidenceRule): string {
  return sortEvidenceConditions(rule.conditions).map(evidenceConditionKey).join("&")
}

function evidenceConditionKey(condition: PartPairEvidenceCondition): string {
  return `${condition.featureName}:${condition.operator}:${condition.threshold.toPrecision(12)}`
}

function fitDecisionTreeScorer(
  examples: readonly TrainingExample[],
  options: TrainingOptions,
): PartPairScorerConfig {
  const positiveCount = examples.filter((example) => example.target === 1).length
  const negativeCount = examples.length - positiveCount
  const tree = buildTree(examples, {
    depth: 0,
    maxDepth: options.maxTreeDepth,
    minLeafSize: options.minTreeLeafSize,
  })
  const preliminaryConfig: PartPairScorerConfig = {
    featureNames: [...PART_PAIR_SCORE_FEATURE_NAMES],
    intercept: 0,
    kind: "decision-tree",
    metadata: {
      matcherVersion: PART_MATCHER_VERSION,
      model: "decision-tree",
      negativePairs: negativeCount,
      positivePairs: positiveCount,
      treeMaxDepth: options.maxTreeDepth,
      treeMinLeafSize: options.minTreeLeafSize,
    },
    normalization: {},
    threshold: 0.5,
    tree,
    version: PART_PAIR_SCORER_CONFIG_VERSION,
    weights: {},
  }
  const threshold = chooseZeroFalsePositiveThreshold(examples, preliminaryConfig)

  return {
    ...preliminaryConfig,
    threshold,
  }
}

function buildTree(
  examples: readonly TrainingExample[],
  options: {
    depth: number
    maxDepth: number
    minLeafSize: number
  },
): PartPairScorerTreeNode {
  const leaf = createTreeLeaf(examples)

  if (
    options.depth >= options.maxDepth ||
    examples.length < options.minLeafSize * 2 ||
    leaf.positiveCount === 0 ||
    leaf.positiveCount === leaf.totalCount
  ) {
    return leaf
  }

  const split = findBestSplit(examples, options.minLeafSize)

  if (!split) {
    return leaf
  }

  return {
    ...leaf,
    featureName: split.featureName,
    left: buildTree(split.left, {
      ...options,
      depth: options.depth + 1,
    }),
    right: buildTree(split.right, {
      ...options,
      depth: options.depth + 1,
    }),
    threshold: split.threshold,
  }
}

function createTreeLeaf(examples: readonly TrainingExample[]): PartPairScorerTreeNode {
  const positiveCount = examples.filter((example) => example.target === 1).length

  return {
    probability: examples.length === 0 ? 0 : positiveCount / examples.length,
    positiveCount,
    totalCount: examples.length,
  }
}

function findBestSplit(
  examples: readonly TrainingExample[],
  minLeafSize: number,
): {
  featureName: PartPairScoreFeatureName
  left: TrainingExample[]
  right: TrainingExample[]
  threshold: number
} | null {
  const baseImpurity = giniImpurity(examples)
  let best: {
    featureName: PartPairScoreFeatureName
    gain: number
    left: TrainingExample[]
    right: TrainingExample[]
    threshold: number
  } | null = null

  for (const featureName of PART_PAIR_SCORE_FEATURE_NAMES) {
    const sorted = examples
      .map((example) => ({
        example,
        value: example.features[featureName],
      }))
      .filter((entry) => Number.isFinite(entry.value))
      .sort((left, right) => left.value - right.value)
    const totalPositive = sorted.reduce((total, entry) =>
      total + (entry.example.target === 1 ? 1 : 0), 0)
    let leftPositive = 0

    for (let index = 1; index < sorted.length; index += 1) {
      leftPositive += sorted[index - 1]?.example.target === 1 ? 1 : 0

      const previous = sorted[index - 1]
      const current = sorted[index]

      if (!previous || !current || previous.value === current.value) {
        continue
      }

      const leftCount = index
      const rightCount = sorted.length - index

      if (leftCount < minLeafSize || rightCount < minLeafSize) {
        continue
      }

      const threshold = (previous.value + current.value) / 2
      const gain = baseImpurity -
        (leftCount / examples.length) * giniImpurityFromCounts(leftPositive, leftCount) -
        (rightCount / examples.length) * giniImpurityFromCounts(totalPositive - leftPositive, rightCount)

      if (!best || gain > best.gain) {
        best = {
          featureName,
          gain,
          left: [],
          right: [],
          threshold,
        }
      }
    }
  }

  if (best) {
    best.left = examples.filter((example) => example.features[best.featureName] <= best.threshold)
    best.right = examples.filter((example) => example.features[best.featureName] > best.threshold)
  }

  return best && best.gain > 0
    ? best
    : null
}

function giniImpurity(examples: readonly TrainingExample[]): number {
  if (examples.length === 0) {
    return 0
  }

  const positiveRatio = examples.filter((example) => example.target === 1).length / examples.length
  const negativeRatio = 1 - positiveRatio

  return 1 - positiveRatio * positiveRatio - negativeRatio * negativeRatio
}

function giniImpurityFromCounts(positiveCount: number, totalCount: number): number {
  if (totalCount === 0) {
    return 0
  }

  const positiveRatio = positiveCount / totalCount
  const negativeRatio = 1 - positiveRatio

  return 1 - positiveRatio * positiveRatio - negativeRatio * negativeRatio
}

function fitLogisticScorer(
  examples: readonly TrainingExample[],
  options: TrainingOptions,
): PartPairScorerConfig {
  const normalization = createNormalization(examples)
  const weights = Object.fromEntries(PART_PAIR_SCORE_FEATURE_NAMES.map((name) => [name, 0])) as Record<string, number>
  const positiveCount = examples.filter((example) => example.target === 1).length
  const negativeCount = examples.length - positiveCount
  const positiveWeight = examples.length / (2 * positiveCount)
  const negativeWeight = examples.length / (2 * negativeCount)
  let intercept = Math.log(positiveCount / negativeCount)

  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const gradients = Object.fromEntries(PART_PAIR_SCORE_FEATURE_NAMES.map((name) => [name, 0])) as Record<string, number>
    let interceptGradient = 0

    for (const example of examples) {
      const prediction = predict(example.features, {
        featureNames: [...PART_PAIR_SCORE_FEATURE_NAMES],
        intercept,
        normalization,
        threshold: 0.5,
        version: PART_PAIR_SCORER_CONFIG_VERSION,
        weights,
      })
      const exampleWeight = example.target === 1 ? positiveWeight : negativeWeight
      const error = (prediction - example.target) * exampleWeight

      interceptGradient += error

      for (const featureName of PART_PAIR_SCORE_FEATURE_NAMES) {
        gradients[featureName] += error * normalizeFeature(
          example.features[featureName],
          normalization[featureName],
        )
      }
    }

    intercept -= options.learningRate * interceptGradient / examples.length

    for (const featureName of PART_PAIR_SCORE_FEATURE_NAMES) {
      const gradient = gradients[featureName] / examples.length + options.l2 * weights[featureName]
      weights[featureName] -= options.learningRate * gradient
    }
  }

  const preliminaryConfig: PartPairScorerConfig = {
    featureNames: [...PART_PAIR_SCORE_FEATURE_NAMES],
    intercept,
    kind: "linear",
    metadata: {
      matcherVersion: PART_MATCHER_VERSION,
      model: "linear",
      negativePairs: negativeCount,
      positivePairs: positiveCount,
    },
    normalization,
    threshold: 0.5,
    version: PART_PAIR_SCORER_CONFIG_VERSION,
    weights,
  }
  const threshold = chooseZeroFalsePositiveThreshold(examples, preliminaryConfig)

  return {
    ...preliminaryConfig,
    threshold,
  }
}

function createNormalization(
  examples: readonly TrainingExample[],
): PartPairScorerConfig["normalization"] {
  const result: PartPairScorerConfig["normalization"] = {}

  for (const featureName of PART_PAIR_SCORE_FEATURE_NAMES) {
    const values = examples.map((example) => example.features[featureName])
    const mean = values.reduce((total, value) => total + value, 0) / values.length
    const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length

    result[featureName] = {
      mean,
      std: Math.sqrt(variance) || 1,
    }
  }

  return result
}

function chooseZeroFalsePositiveThreshold(
  examples: readonly TrainingExample[],
  config: PartPairScorerConfig,
): number {
  const negativeMax = Math.max(
    ...examples
      .filter((example) => example.target === 0)
      .map((example) => predict(example.features, config)),
  )

  return negativeMax + THRESHOLD_EPSILON
}

function evaluatePairScore(
  examples: readonly TrainingExample[],
  config: PartPairScorerConfig,
): PairScore {
  return examples.reduce<PairScore>((totals, example) => {
    const matched = partPairScoreFeaturesMatch(example.features, config)

    if (example.target === 1) {
      return {
        ...totals,
        matchedPositivePairs: totals.matchedPositivePairs + (matched ? 1 : 0),
        positivePairs: totals.positivePairs + 1,
      }
    }

    return {
      ...totals,
      falsePositivePairs: totals.falsePositivePairs + (matched ? 1 : 0),
      negativePairs: totals.negativePairs + 1,
    }
  }, {
    falsePositivePairs: 0,
    matchedPositivePairs: 0,
    negativePairs: 0,
    positivePairs: 0,
  })
}

function evaluateGroupScore(
  labelSets: readonly PartMatchLabelSet[],
  reportRowsByManual: ReadonlyMap<string, ReadonlyMap<string, FeatureRow>>,
  config: PartPairScorerConfig,
  pairScoreFeaturesByManual?: ReadonlyMap<string, ReadonlyMap<string, PartPairScoreFeatures>>,
): GroupScore {
  return labelSets.reduce<GroupScore>((totals, labelSet) => {
    const rowsById = reportRowsByManual.get(labelSet.manualId) ?? new Map()
    const labels = labelSet.labels.filter(isScoredLabel)
    const allLabels = labelSet.labels.filter(isTrainingLabel)
    const groups = createPartMatchGroups({
      enableLabelGatedNearMatches: true,
      pairScorerConfig: config,
      pairScoreFeaturesByKey: pairScoreFeaturesByManual?.get(labelSet.manualId),
      rows: [...rowsById.values()].map(toPartMatchRowInput),
    })
    const groupPairKeys = new Set(groups.flatMap((group) => createGroupPairKeys(group)))
    const falseGroups = countFalseGroups(groups, allLabels)
    let expectedPairs = 0
    let matchedPairs = 0

    for (let leftIndex = 0; leftIndex < labels.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < labels.length; rightIndex += 1) {
        const left = labels[leftIndex]
        const right = labels[rightIndex]

        if (
          !left ||
          !right ||
          left.expectedPartKey !== right.expectedPartKey ||
          !rowsCanPair(rowsById.get(left.itemId), rowsById.get(right.itemId))
        ) {
          continue
        }

        expectedPairs += 1

        if (groupPairKeys.has(pairKey(left.itemId, right.itemId))) {
          matchedPairs += 1
        }
      }
    }

    return {
      expectedPairs: totals.expectedPairs + expectedPairs,
      falseGroups: totals.falseGroups + falseGroups,
      matchedPairs: totals.matchedPairs + matchedPairs,
      missedPairs: totals.missedPairs + expectedPairs - matchedPairs,
    }
  }, {
    expectedPairs: 0,
    falseGroups: 0,
    matchedPairs: 0,
    missedPairs: 0,
  })
}

function toPartMatchRowInput(row: FeatureRow): PartMatchRowInput {
  return {
    bagId: row.bagId,
    calloutId: row.calloutId,
    color: row.color,
    features: row.features,
    itemId: row.itemId,
    partRegion: row.partRegion,
    rowId: row.rowId,
  }
}

function createGroupPairKeys(group: PartMatchGroup): string[] {
  const keys: string[] = []

  for (let leftIndex = 0; leftIndex < group.rowIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < group.rowIds.length; rightIndex += 1) {
      const left = group.rowIds[leftIndex]
      const right = group.rowIds[rightIndex]

      if (left && right) {
        keys.push(pairKey(left, right))
      }
    }
  }

  return keys
}

function countFalseGroups(
  groups: readonly PartMatchGroup[],
  labels: readonly PartMatchLabel[],
): number {
  const labelsByItemId = new Map(labels.map((label) => [label.itemId, label]))

  return groups.filter((group) => {
    const groupLabels = group.rowIds
      .map((rowId) => labelsByItemId.get(rowId))
      .filter((label): label is PartMatchLabel => Boolean(label))
    const hasExcluded = groupLabels.some((label) => label.role === "excluded")
    const keys = new Set(groupLabels
      .filter(isScoredLabel)
      .map((label) => label.expectedPartKey))

    return hasExcluded || keys.size > 1
  }).length
}

function rowsCanPair(left: FeatureRow | undefined, right: FeatureRow | undefined): boolean {
  return Boolean(
    left &&
    right &&
    left.bagId === right.bagId &&
    left.calloutId !== right.calloutId &&
    colorsAreCompatible(left.color, right.color),
  )
}

function pairKey(left: string, right: string): string {
  return [left, right].sort().join("\0")
}

function predict(features: PartPairScoreFeatures, config: PartPairScorerConfig): number {
  return scoreFeatureVector(features, config)
}

function normalizeFeature(
  value: number,
  normalization: { mean: number, std: number } | undefined,
): number {
  if (!normalization || normalization.std <= 0) {
    return value
  }

  return (value - normalization.mean) / normalization.std
}

interface PngImageData {
  data: Uint8ClampedArray
  height: number
  width: number
}

function decodePngImageDataUrl(imageDataUrl: string | null | undefined): PngImageData | null {
  const match = /^data:image\/png;base64,([a-z0-9+/=]+)$/i.exec(imageDataUrl ?? "")

  if (!match?.[1]) {
    return null
  }

  try {
    return decodePngBytes(Buffer.from(match[1], "base64"))
  } catch {
    return null
  }
}

function decodePngBytes(bytes: Buffer): PngImageData | null {
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    return null
  }

  let offset = 8
  let header: {
    bitDepth: number
    colorType: number
    height: number
    interlace: number
    width: number
  } | null = null
  const idatChunks: Buffer[] = []

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

  if (!header || header.bitDepth !== 8 || header.interlace !== 0) {
    return null
  }

  const channels = readPngChannelCount(header.colorType)

  if (!channels) {
    return null
  }

  const inflated = inflateSync(Buffer.concat(idatChunks))
  const raw = unfilterPngScanlines(inflated, header.width, header.height, channels)

  return {
    data: pngRawToRgba(raw, header.width, header.height, channels, header.colorType),
    height: header.height,
    width: header.width,
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

  if (colorType === 6) {
    return 4
  }

  return null
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
    const rowOffset = y * stride
    const previousRowOffset = rowOffset - stride

    for (let x = 0; x < stride; x += 1) {
      const value = inflated[sourceOffset + x] ?? 0
      const left = x >= channels ? raw[rowOffset + x - channels] ?? 0 : 0
      const up = y > 0 ? raw[previousRowOffset + x] ?? 0 : 0
      const upLeft = y > 0 && x >= channels ? raw[previousRowOffset + x - channels] ?? 0 : 0

      raw[rowOffset + x] = unfilterPngByte(filter, value, left, up, upLeft)
    }

    sourceOffset += stride
  }

  return raw
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

function paethPredictor(left: number, up: number, upLeft: number): number {
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
    const sourceOffset = pixel * channels
    const targetOffset = pixel * 4

    if (colorType === 0) {
      const gray = raw[sourceOffset] ?? 0

      rgba[targetOffset] = gray
      rgba[targetOffset + 1] = gray
      rgba[targetOffset + 2] = gray
      rgba[targetOffset + 3] = 255
    } else if (colorType === 2) {
      rgba[targetOffset] = raw[sourceOffset] ?? 0
      rgba[targetOffset + 1] = raw[sourceOffset + 1] ?? 0
      rgba[targetOffset + 2] = raw[sourceOffset + 2] ?? 0
      rgba[targetOffset + 3] = 255
    } else if (colorType === 4) {
      const gray = raw[sourceOffset] ?? 0

      rgba[targetOffset] = gray
      rgba[targetOffset + 1] = gray
      rgba[targetOffset + 2] = gray
      rgba[targetOffset + 3] = raw[sourceOffset + 1] ?? 0
    } else if (colorType === 6) {
      rgba[targetOffset] = raw[sourceOffset] ?? 0
      rgba[targetOffset + 1] = raw[sourceOffset + 1] ?? 0
      rgba[targetOffset + 2] = raw[sourceOffset + 2] ?? 0
      rgba[targetOffset + 3] = raw[sourceOffset + 3] ?? 0
    }
  }

  return rgba
}

function extractAlpha(pixels: Uint8ClampedArray): number[] {
  const alpha: number[] = []

  for (let index = 3; index < pixels.length; index += 4) {
    alpha.push(pixels[index] ?? 0)
  }

  return alpha
}

function normalizeWorkspacePath(value: string): string {
  const relative = path.relative(process.cwd(), path.resolve(value))

  return relative.startsWith("..") ? value : relative
}

function readOption(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name)

  return index >= 0 ? argv[index + 1] ?? null : null
}

function parsePaths(value: string | null): string[] {
  return value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : []
}

function parseOptionalPaths(value: string | null): string[] | null {
  const paths = parsePaths(value)

  return value === null ? null : paths
}

function parseEvidenceFeatureNames(value: string | null): PartPairScoreFeatureName[] | null {
  if (value === null) {
    return null
  }

  const validNames = new Set<string>(PART_PAIR_SCORE_FEATURE_NAMES)

  return parsePaths(value).map((featureName) => {
    if (!validNames.has(featureName)) {
      throw new Error(`Unknown part pair score feature: ${featureName}`)
    }

    return featureName as PartPairScoreFeatureName
  })
}

function parseInteger(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10)

  return Number.isFinite(parsed) ? parsed : fallback
}

function parseNumber(value: string | null, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "")

  return Number.isFinite(parsed) ? parsed : fallback
}

function parseModel(value: string | null): TrainingOptions["model"] {
  return value === "linear" ? "linear" : "decision-tree"
}

async function runCli(): Promise<void> {
  const argv = process.argv.slice(2)
  const outputPath = readOption(argv, "--output-path") ?? DEFAULT_OUTPUT_PATH
  const result = await trainPartMatchScorer({
    baseScorerConfigPath: readOption(argv, "--base-scorer-config"),
    decisionConflictPolicy: parseDecisionConflictPolicy(readOption(argv, "--decision-conflict-policy")),
    decisionPaths: parsePaths(readOption(argv, "--decision-path")),
    evidenceFeatureNames: parseEvidenceFeatureNames(readOption(argv, "--evidence-feature-names")),
    excludeManualIds: parsePaths(readOption(argv, "--exclude-manual-ids")),
    iterations: parseInteger(readOption(argv, "--iterations"), DEFAULT_ITERATIONS),
    l2: parseNumber(readOption(argv, "--l2"), DEFAULT_L2),
    labelDir: readOption(argv, "--label-dir") ?? DEFAULT_LABEL_DIR,
    learningRate: parseNumber(readOption(argv, "--learning-rate"), DEFAULT_LEARNING_RATE),
    manualIds: parseOptionalPaths(readOption(argv, "--manual-ids")),
    maxEvidenceRuleConditions: parseInteger(
      readOption(argv, "--max-evidence-rule-conditions"),
      DEFAULT_MAX_EVIDENCE_RULE_CONDITIONS,
    ),
    maxEvidenceRules: parseInteger(readOption(argv, "--max-evidence-rules"), DEFAULT_MAX_EVIDENCE_RULES),
    minEvidenceRuleManualSupport: parseInteger(
      readOption(argv, "--min-evidence-rule-manual-support"),
      DEFAULT_MIN_EVIDENCE_RULE_MANUAL_SUPPORT,
    ),
    minEvidenceRuleConditions: parseInteger(
      readOption(argv, "--min-evidence-rule-conditions"),
      DEFAULT_MIN_EVIDENCE_RULE_CONDITIONS,
    ),
    maxTreeDepth: parseInteger(readOption(argv, "--max-tree-depth"), DEFAULT_MAX_TREE_DEPTH),
    minEvidenceRuleGain: parseInteger(readOption(argv, "--min-evidence-rule-gain"), DEFAULT_MIN_EVIDENCE_RULE_GAIN),
    minTreeLeafSize: parseInteger(readOption(argv, "--min-tree-leaf-size"), DEFAULT_MIN_TREE_LEAF_SIZE),
    model: parseModel(readOption(argv, "--model")),
    outputPath,
    sourceDir: readOption(argv, "--source-dir") ?? DEFAULT_SOURCE_DIR,
  })

  console.log(`Wrote part match scorer config to ${outputPath}`)
  console.log(`Training examples: ${result.examples.length}`)
  console.log(`Pair score: ${result.pairScore.matchedPositivePairs}/${result.pairScore.positivePairs} positives; ${result.pairScore.falsePositivePairs}/${result.pairScore.negativePairs} false positives`)
  console.log(`Group score: ${result.groupScore.matchedPairs}/${result.groupScore.expectedPairs} expected pairs; ${result.groupScore.falseGroups} false groups; ${result.groupScore.missedPairs} missed`)
  console.log(`Threshold: ${result.config.threshold.toFixed(6)}`)
  console.log(`Evidence rules: ${result.config.evidenceRules?.length ?? 0}`)
}

function parseDecisionConflictPolicy(value: string | null): DecisionConflictPolicy {
  return value === "prefer-decisions" ? "prefer-decisions" : "error"
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
