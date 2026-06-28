import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const DEFAULT_OUTPUT_ROOT = path.join(
  ".bag-it",
  "private",
  "part-match-reports",
  "embedding-experiments",
)
const VERSION = "0.1.0"
const DEFAULT_SUGGESTED_BUDGET = 0.005
const DEFAULT_MARGINS = [0, 0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2]

type PairTarget = 0 | 1
type PairSplit = "train" | "validation" | "all"

interface ScoredPair {
  kind?: string | null
  leftExampleId?: string | null
  leftItemId?: string | null
  leftRowKey?: string | null
  manualId?: string | null
  primaryScore?: number | null
  rightExampleId?: string | null
  rightItemId?: string | null
  rightRowKey?: string | null
  score?: number | null
  scores?: Record<string, number | null> | null
  split?: string | null
  target?: number | null
}

interface PairEntry {
  kind: string
  leftId: string
  manualId: string | null
  rightId: string
  score: number
  split: PairSplit
  target: PairTarget
}

interface ExampleMetadata {
  colorName?: string | null
  exampleId?: string | null
}

interface LaneConfig {
  margin: number
  mutualTop1: boolean
  rankLimit: number | null
  scoreFloor: number
}

interface LaneMetrics {
  acceptedPairs: number
  falseGroups: number
  correctionBurden: number
  correctionBurdenGroups: number
  correctionBurdenPairs: number
  groups: number
  falsePositivePairs: number
  groupedRows: number
  hardNegativeFalsePositivePairs: number
  matchedPositivePairs: number
  missedPositivePairs: number
  negativePairs: number
  positivePairs: number
  recall: number
  scoreFloor: number
  wrongRowMemberships: number
}

interface LaneResult {
  config: LaneConfig
  train: LaneMetrics
  validation: LaneMetrics | null
}

interface StrategyResult {
  auto: LaneResult | null
  budget: number
  margins: number[]
  name: string
  suggested: LaneResult | null
}

interface PairLaneAnalysisSummary {
  generatedAt: string
  options: {
    margins: number[]
    manualTrainingDir: string | null
    outputDir: string
    scoreDir: string
    scoreMode: string | null
    skipColorNameConflicts: boolean
    suggestedBudget: number
  }
  strategies: StrategyResult[]
  totals: Record<PairSplit, {
    negativePairs: number
    positivePairs: number
    scoredPairs: number
  }>
  version: string
}

export interface AnalyzePartMatchPairLanesOptions {
  generatedAt?: Date
  margins?: number[]
  manualTrainingDir?: string | null
  outputDir?: string
  scoreDir: string
  scoreMode?: string | null
  skipColorNameConflicts?: boolean
  suggestedBudget?: number
}

export interface AnalyzePartMatchPairLanesResult {
  indexPath: string
  outputDir: string
  summary: PairLaneAnalysisSummary
  summaryPath: string
}

export async function analyzePartMatchPairLanes(
  options: AnalyzePartMatchPairLanesOptions,
): Promise<AnalyzePartMatchPairLanesResult> {
  const generatedAt = options.generatedAt ?? new Date()
  const margins = options.margins ?? DEFAULT_MARGINS
  const skipColorNameConflicts = options.skipColorNameConflicts ?? Boolean(options.manualTrainingDir)
  const suggestedBudget = options.suggestedBudget ?? DEFAULT_SUGGESTED_BUDGET
  const outputDir = options.outputDir ?? path.join(
    DEFAULT_OUTPUT_ROOT,
    `${timestampSlug(generatedAt)}-pair-lanes`,
  )
  const pairsPath = path.join(options.scoreDir, "pairs.json")
  const exampleColorNames = options.manualTrainingDir
    ? await readExampleColorNames(options.manualTrainingDir)
    : new Map<string, string | null>()
  const pairs = normalizePairs(
    JSON.parse(await readFile(pairsPath, "utf8")),
    options.scoreMode ?? null,
    {
      exampleColorNames,
      skipColorNameConflicts,
    },
  )

  if (pairs.length === 0) {
    throw new Error(`No scored pairs found in ${pairsPath}`)
  }

  const splitPairs = splitPairEntries(pairs)
  const strategies = [
    analyzeStrategy("score-threshold", splitPairs, {
      margins: [0],
      mutualTop1: false,
      suggestedBudget,
    }),
    analyzeStrategy("mutual-top-1", splitPairs, {
      margins,
      mutualTop1: true,
      rankLimit: 1,
      suggestedBudget,
    }),
    analyzeStrategy("mutual-top-2", splitPairs, {
      margins,
      mutualTop1: true,
      rankLimit: 2,
      suggestedBudget,
    }),
    analyzeStrategy("mutual-top-3", splitPairs, {
      margins,
      mutualTop1: true,
      rankLimit: 3,
      suggestedBudget,
    }),
  ]
  const summary: PairLaneAnalysisSummary = {
    generatedAt: generatedAt.toISOString(),
    options: {
    margins,
    manualTrainingDir: options.manualTrainingDir ?? null,
    outputDir,
    scoreDir: options.scoreDir,
    scoreMode: options.scoreMode ?? null,
    skipColorNameConflicts,
    suggestedBudget,
  },
    strategies,
    totals: {
      all: pairTotals(splitPairs.all),
      train: pairTotals(splitPairs.train),
      validation: pairTotals(splitPairs.validation),
    },
    version: VERSION,
  }
  const summaryPath = path.join(outputDir, "summary.json")
  const indexPath = path.join(outputDir, "index.html")

  await mkdir(outputDir, { recursive: true })
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)
  await writeFile(indexPath, renderIndex(summary))

  return {
    indexPath,
    outputDir,
    summary,
    summaryPath,
  }
}

function analyzeStrategy(
  name: string,
  splitPairs: Record<PairSplit, PairEntry[]>,
  options: {
    margins: number[]
    mutualTop1: boolean
    rankLimit?: number | null
    suggestedBudget: number
  },
): StrategyResult {
  return {
    auto: selectLane(splitPairs, {
      budget: 0,
      margins: options.margins,
      mutualTop1: options.mutualTop1,
      rankLimit: options.rankLimit ?? null,
    }),
    budget: options.suggestedBudget,
    margins: options.margins,
    name,
    suggested: selectLane(splitPairs, {
      budget: options.suggestedBudget,
      margins: options.margins,
      mutualTop1: options.mutualTop1,
      rankLimit: options.rankLimit ?? null,
    }),
  }
}

function selectLane(
  splitPairs: Record<PairSplit, PairEntry[]>,
  options: {
    budget: number
    margins: number[]
    mutualTop1: boolean
    rankLimit: number | null
  },
): LaneResult | null {
  let best: LaneResult | null = null

  for (const margin of options.margins) {
    const trainCandidates = filterRankCandidates(splitPairs.train, {
      margin,
      mutualTop1: options.mutualTop1,
      rankLimit: options.rankLimit,
    }).sort((a, b) => b.score - a.score)
    const selectedConfig = selectScoreFloor(trainCandidates, {
      allPairs: splitPairs.train,
      budget: options.budget,
      margin,
      mutualTop1: options.mutualTop1,
      rankLimit: options.rankLimit,
    })

    if (!selectedConfig) {
      continue
    }

    const result = {
      config: selectedConfig,
      train: scoreLane(splitPairs.train, selectedConfig),
      validation: splitPairs.validation.length > 0
        ? scoreLane(splitPairs.validation, selectedConfig)
        : null,
    }

    if (!best || compareLaneResult(result, best) > 0) {
      best = result
    }
  }

  return best
}

function selectScoreFloor(
  candidates: PairEntry[],
  options: {
    allPairs: PairEntry[]
    budget: number
    margin: number
    mutualTop1: boolean
    rankLimit: number | null
  },
): LaneConfig | null {
  let best: {
    config: LaneConfig
    metrics: LaneMetrics
  } | null = null
  const positivePairs = options.allPairs.filter((pair) => pair.target === 1).length
  const negativePairs = options.allPairs.length - positivePairs
  const groupState = new IncrementalGroupState(options.allPairs)
  let acceptedPairs = 0
  let falsePositivePairs = 0
  let hardNegativeFalsePositivePairs = 0

  for (const candidate of candidates) {
    acceptedPairs += 1
    groupState.add(candidate)

    if (candidate.target === 0) {
      falsePositivePairs += 1

      if (isHardNegative(candidate)) {
        hardNegativeFalsePositivePairs += 1
      }
    }

    const correctionBurdenGroups = groupState.groupCorrectionBurden()
    const correctionBurdenPairs = acceptedPairs === 0 ? 0 : falsePositivePairs / acceptedPairs
    const membership = groupState.membershipCorrection()

    if (exceedsCorrectionBudget({
      budget: options.budget,
      correctionBurdenGroups,
      correctionBurdenRows: membership.correctionBurden,
    })) {
      continue
    }

    const config = {
      margin: options.margin,
      mutualTop1: options.mutualTop1,
      rankLimit: options.rankLimit,
      scoreFloor: candidate.score,
    }
    const metrics = {
      acceptedPairs,
      correctionBurden: membership.correctionBurden,
      correctionBurdenGroups,
      correctionBurdenPairs,
      falseGroups: groupState.falseGroups,
      falsePositivePairs,
      groups: groupState.groups,
      groupedRows: membership.groupedRows,
      hardNegativeFalsePositivePairs,
      matchedPositivePairs: groupState.matchedPositivePairs,
      missedPositivePairs: positivePairs - groupState.matchedPositivePairs,
      negativePairs,
      positivePairs,
      recall: positivePairs === 0 ? 0 : groupState.matchedPositivePairs / positivePairs,
      scoreFloor: candidate.score,
      wrongRowMemberships: membership.wrongRowMemberships,
    }

    if (!best || compareLaneMetrics(metrics, best.metrics) > 0) {
      best = { config, metrics }
    }
  }

  return best?.config ?? null
}

function compareLaneResult(left: LaneResult, right: LaneResult) {
  return compareLaneMetrics(left.train, right.train)
}

function compareLaneMetrics(left: LaneMetrics, right: LaneMetrics) {
  if (left.matchedPositivePairs !== right.matchedPositivePairs) {
    return left.matchedPositivePairs - right.matchedPositivePairs
  }

  if (left.wrongRowMemberships !== right.wrongRowMemberships) {
    return right.wrongRowMemberships - left.wrongRowMemberships
  }

  if (left.falsePositivePairs !== right.falsePositivePairs) {
    return right.falsePositivePairs - left.falsePositivePairs
  }

  if (left.scoreFloor !== right.scoreFloor) {
    return right.scoreFloor - left.scoreFloor
  }

  return 0
}

function exceedsCorrectionBudget(options: {
  budget: number
  correctionBurdenGroups: number
  correctionBurdenRows: number
}) {
  if (options.budget === 0) {
    return options.correctionBurdenGroups > 0
  }

  return options.correctionBurdenRows > options.budget
}

function scoreLane(pairs: PairEntry[], config: LaneConfig): LaneMetrics {
  const accepted = filterRankCandidates(pairs, config).filter((pair) => pair.score >= config.scoreFloor)
  const positivePairs = pairs.filter((pair) => pair.target === 1).length
  const negativePairs = pairs.length - positivePairs
  const falsePositivePairs = accepted.filter((pair) => pair.target === 0).length
  const hardNegativeFalsePositivePairs = accepted.filter((pair) =>
    pair.target === 0 && isHardNegative(pair)
  ).length
  const groupMetrics = scoreGroups(pairs, accepted)

  return {
    acceptedPairs: accepted.length,
    correctionBurden: groupMetrics.correctionBurden,
    correctionBurdenGroups: groupMetrics.correctionBurdenGroups,
    correctionBurdenPairs: accepted.length === 0 ? 0 : falsePositivePairs / accepted.length,
    falseGroups: groupMetrics.falseGroups,
    falsePositivePairs,
    groups: groupMetrics.groups,
    groupedRows: groupMetrics.groupedRows,
    hardNegativeFalsePositivePairs,
    matchedPositivePairs: groupMetrics.matchedPositivePairs,
    missedPositivePairs: positivePairs - groupMetrics.matchedPositivePairs,
    negativePairs,
    positivePairs,
    recall: positivePairs === 0 ? 0 : groupMetrics.matchedPositivePairs / positivePairs,
    scoreFloor: config.scoreFloor,
    wrongRowMemberships: groupMetrics.wrongRowMemberships,
  }
}

class IncrementalGroupState {
  private readonly negativeAdjacency = new Map<string, Set<string>>()
  private readonly nodes = new Map<string, GroupNode>()
  private readonly positiveAdjacency = new Map<string, Set<string>>()

  falseGroups = 0
  groups = 0
  matchedPositivePairs = 0

  constructor(pairs: PairEntry[]) {
    for (const pair of pairs) {
      if (pair.target === 1) {
        this.addPositiveAdjacency(pair.leftId, pair.rightId)
        this.addPositiveAdjacency(pair.rightId, pair.leftId)
      } else {
        this.addNegativeAdjacency(pair.leftId, pair.rightId)
        this.addNegativeAdjacency(pair.rightId, pair.leftId)
      }
    }
  }

  add(pair: PairEntry) {
    const left = this.activate(pair.leftId)
    const right = this.activate(pair.rightId)
    const leftRoot = this.find(left)
    const rightRoot = this.find(right)

    if (leftRoot === rightRoot) {
      if (pair.target === 0) {
        this.markFalse(leftRoot)
      }
      return
    }

    this.merge(leftRoot, rightRoot, pair.target === 0)
  }

  groupCorrectionBurden() {
    return this.groups === 0 ? 0 : this.falseGroups / this.groups
  }

  membershipCorrection() {
    let groupedRows = 0
    let wrongRowMemberships = 0

    for (const group of this.activeGroups()) {
      if (group.members.size < 2) {
        continue
      }

      groupedRows += group.members.size
      wrongRowMemberships += this.wrongMemberships(group.members)
    }

    return {
      correctionBurden: groupedRows === 0 ? 0 : wrongRowMemberships / groupedRows,
      groupedRows,
      wrongRowMemberships,
    }
  }

  private addNegativeAdjacency(leftId: string, rightId: string) {
    this.addAdjacency(this.negativeAdjacency, leftId, rightId)
  }

  private addPositiveAdjacency(leftId: string, rightId: string) {
    this.addAdjacency(this.positiveAdjacency, leftId, rightId)
  }

  private addAdjacency(
    adjacency: Map<string, Set<string>>,
    leftId: string,
    rightId: string,
  ) {
    const neighbors = adjacency.get(leftId) ?? new Set<string>()
    neighbors.add(rightId)
    adjacency.set(leftId, neighbors)
  }

  private activate(id: string) {
    let node = this.nodes.get(id)

    if (!node) {
      node = {
        active: true,
        falseGroup: false,
        id,
        members: new Set([id]),
        parent: id,
      }
      this.nodes.set(id, node)
      this.groups += 1
    }

    return node
  }

  private find(node: GroupNode): GroupNode {
    if (node.parent === node.id) {
      return node
    }

    const parent = this.nodes.get(node.parent)

    if (!parent) {
      return node
    }

    const root = this.find(parent)
    node.parent = root.id
    return root
  }

  private merge(leftRoot: GroupNode, rightRoot: GroupNode, directFalsePair: boolean) {
    let target = leftRoot
    let source = rightRoot

    if (source.members.size > target.members.size) {
      target = rightRoot
      source = leftRoot
    }

    this.removeGroupFromCounts(source)
    this.removeGroupFromCounts(target)

    const crossNegative = directFalsePair ||
      this.countCrossPairs(this.negativeAdjacency, source.members, target.members) > 0
    this.matchedPositivePairs += this.countCrossPairs(
      this.positiveAdjacency,
      source.members,
      target.members,
    )
    source.parent = target.id
    for (const member of source.members) {
      target.members.add(member)
    }
    source.members.clear()
    target.falseGroup = target.falseGroup || source.falseGroup || crossNegative

    this.addGroupToCounts(target)
  }

  private countCrossPairs(
    adjacency: ReadonlyMap<string, ReadonlySet<string>>,
    leftMembers: Set<string>,
    rightMembers: Set<string>,
  ) {
    let count = 0

    for (const member of leftMembers) {
      const neighbors = adjacency.get(member)

      if (!neighbors) {
        continue
      }

      for (const neighbor of neighbors) {
        if (rightMembers.has(neighbor)) {
          count += 1
        }
      }
    }

    return count
  }

  private markFalse(root: GroupNode) {
    if (root.falseGroup) {
      return
    }

    root.falseGroup = true
    this.falseGroups += 1
  }

  private removeGroupFromCounts(group: GroupNode) {
    if (!group.active) {
      return
    }

    this.groups -= 1

    if (group.falseGroup) {
      this.falseGroups -= 1
    }
  }

  private addGroupToCounts(group: GroupNode) {
    this.groups += 1

    if (group.falseGroup) {
      this.falseGroups += 1
    }
  }

  private activeGroups() {
    return Array.from(this.nodes.values()).filter((node) =>
      node.parent === node.id && node.members.size > 0
    )
  }

  private wrongMemberships(members: Set<string>) {
    let largestKnownSamePartClass = 0
    const unseen = new Set(members)

    for (const member of members) {
      if (!unseen.has(member)) {
        continue
      }

      const componentSize = this.consumePositiveComponent(member, members, unseen)
      largestKnownSamePartClass = Math.max(largestKnownSamePartClass, componentSize)
    }

    return members.size - largestKnownSamePartClass
  }

  private consumePositiveComponent(
    start: string,
    members: Set<string>,
    unseen: Set<string>,
  ) {
    const stack = [start]
    let size = 0
    unseen.delete(start)

    while (stack.length > 0) {
      const member = stack.pop()

      if (!member) {
        continue
      }

      size += 1
      const neighbors = this.positiveAdjacency.get(member)

      if (!neighbors) {
        continue
      }

      for (const neighbor of neighbors) {
        if (members.has(neighbor) && unseen.has(neighbor)) {
          unseen.delete(neighbor)
          stack.push(neighbor)
        }
      }
    }

    return size
  }
}

interface GroupNode {
  active: boolean
  falseGroup: boolean
  id: string
  members: Set<string>
  parent: string
}

function scoreGroups(pairs: PairEntry[], accepted: PairEntry[]) {
  const groupState = new IncrementalGroupState(pairs)

  for (const pair of accepted.sort((left, right) => right.score - left.score)) {
    groupState.add(pair)
  }
  const membership = groupState.membershipCorrection()

  return {
    correctionBurden: membership.correctionBurden,
    correctionBurdenGroups: groupState.groupCorrectionBurden(),
    falseGroups: groupState.falseGroups,
    groupedRows: membership.groupedRows,
    groups: groupState.groups,
    matchedPositivePairs: groupState.matchedPositivePairs,
    wrongRowMemberships: membership.wrongRowMemberships,
  }
}

function filterRankCandidates(
  pairs: PairEntry[],
  config: {
    margin: number
    mutualTop1: boolean
    rankLimit?: number | null
  },
) {
  if (!config.mutualTop1) {
    return pairs
  }

  const rankings = buildRankings(pairs)
  const rankLimit = config.rankLimit ?? 1

  return pairs.filter((pair) => isMutualRankPair(pair, rankings, {
    margin: config.margin,
    rankLimit,
  }))
}

function buildRankings(pairs: PairEntry[]) {
  const rankings = new Map<string, { id: string; score: number }[]>()

  for (const pair of pairs) {
    addRanking(rankings, pair.leftId, pair.rightId, pair.score)
    addRanking(rankings, pair.rightId, pair.leftId, pair.score)
  }

  for (const ranking of rankings.values()) {
    ranking.sort((left, right) => right.score - left.score)
  }

  return rankings
}

function addRanking(
  rankings: Map<string, { id: string; score: number }[]>,
  id: string,
  otherId: string,
  score: number,
) {
  const ranking = rankings.get(id) ?? []
  ranking.push({ id: otherId, score })
  rankings.set(id, ranking)
}

function isMutualRankPair(
  pair: PairEntry,
  rankings: Map<string, { id: string; score: number }[]>,
  config: {
    margin: number
    rankLimit: number
  },
) {
  return isRankMatch(pair.leftId, pair.rightId, pair.score, rankings, config) &&
    isRankMatch(pair.rightId, pair.leftId, pair.score, rankings, config)
}

function isRankMatch(
  id: string,
  expectedOtherId: string,
  score: number,
  rankings: Map<string, { id: string; score: number }[]>,
  config: {
    margin: number
    rankLimit: number
  },
) {
  const ranking = rankings.get(id) ?? []
  const top = ranking[0]

  if (!top) {
    return false
  }

  if (config.rankLimit <= 1) {
    if (top.id !== expectedOtherId) {
      return false
    }

    const next = ranking.find((candidate) => candidate.id !== expectedOtherId)
    const scoreGap = next ? score - next.score : Number.POSITIVE_INFINITY

    return scoreGap >= config.margin
  }

  const rankIndex = ranking.findIndex((candidate) => candidate.id === expectedOtherId)

  return rankIndex >= 0 &&
    rankIndex < config.rankLimit &&
    top.score - score <= config.margin
}

async function readExampleColorNames(manualTrainingDir: string) {
  const examplesPath = path.join(manualTrainingDir, "examples.json")
  const raw = JSON.parse(await readFile(examplesPath, "utf8")) as { examples?: ExampleMetadata[] }
  const colorNames = new Map<string, string | null>()

  for (const example of raw.examples ?? []) {
    if (!example.exampleId) {
      continue
    }

    colorNames.set(example.exampleId, example.colorName ?? null)
  }

  return colorNames
}

function normalizePairs(
  input: unknown,
  scoreMode: string | null,
  options: {
    exampleColorNames: ReadonlyMap<string, string | null>
    skipColorNameConflicts: boolean
  },
): PairEntry[] {
  const rawPairs = Array.isArray(input)
    ? input
    : Array.isArray((input as { pairs?: unknown }).pairs)
      ? (input as { pairs: unknown[] }).pairs
      : []

  return rawPairs
    .map((rawPair) => normalizePair(rawPair as ScoredPair, scoreMode, options))
    .filter((pair): pair is PairEntry => pair !== null)
}

function normalizePair(
  pair: ScoredPair,
  scoreMode: string | null,
  options: {
    exampleColorNames: ReadonlyMap<string, string | null>
    skipColorNameConflicts: boolean
  },
): PairEntry | null {
  const leftId = firstString(pair.leftExampleId, pair.leftRowKey, pair.leftItemId)
  const rightId = firstString(pair.rightExampleId, pair.rightRowKey, pair.rightItemId)
  const target = pair.target === 1 ? 1 : pair.target === 0 ? 0 : null
  const score = pairScore(pair, scoreMode)

  if (!leftId || !rightId || target === null || score === null) {
    return null
  }

  if (options.skipColorNameConflicts && hasColorNameConflict(leftId, rightId, options.exampleColorNames)) {
    return null
  }

  return {
    kind: pair.kind ?? "",
    leftId,
    manualId: pair.manualId ?? null,
    rightId,
    score,
    split: normalizeSplit(pair.split),
    target,
  }
}

function hasColorNameConflict(
  leftId: string,
  rightId: string,
  colorNames: ReadonlyMap<string, string | null>,
) {
  const leftColorName = colorNames.get(leftId)
  const rightColorName = colorNames.get(rightId)

  return Boolean(leftColorName && rightColorName && leftColorName !== rightColorName)
}

function pairScore(pair: ScoredPair, scoreMode: string | null) {
  if (scoreMode && typeof pair.scores?.[scoreMode] === "number") {
    return pair.scores[scoreMode]
  }

  if (typeof pair.score === "number") {
    return pair.score
  }

  if (typeof pair.primaryScore === "number") {
    return pair.primaryScore
  }

  if (typeof pair.scores?.mean === "number") {
    return pair.scores.mean
  }

  return null
}

function splitPairEntries(pairs: PairEntry[]): Record<PairSplit, PairEntry[]> {
  const train = pairs.filter((pair) => pair.split === "train")
  const validation = pairs.filter((pair) => pair.split === "validation")

  if (train.length > 0 || validation.length > 0) {
    return {
      all: pairs,
      train,
      validation,
    }
  }

  return {
    all: pairs,
    train: pairs,
    validation: [],
  }
}

function pairTotals(pairs: PairEntry[]) {
  const positivePairs = pairs.filter((pair) => pair.target === 1).length

  return {
    negativePairs: pairs.length - positivePairs,
    positivePairs,
    scoredPairs: pairs.length,
  }
}

function normalizeSplit(split?: string | null): PairSplit {
  if (split === "train" || split === "validation") {
    return split
  }

  return "all"
}

function firstString(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.length > 0) ?? null
}

function isHardNegative(pair: PairEntry) {
  return pair.kind.includes("hard-negative") || pair.kind.includes("excluded")
}

function renderIndex(summary: PairLaneAnalysisSummary) {
  const strategyRows = summary.strategies.map((strategy) => {
    const auto = strategy.auto ? renderLane(strategy.auto) : "<td colspan=\"19\">No auto lane</td>"
    const suggested = strategy.suggested ? renderLane(strategy.suggested) : "<td colspan=\"19\">No suggested lane</td>"

    return `<tr><th>${escapeHtml(strategy.name)} auto</th>${auto}</tr><tr><th>${escapeHtml(strategy.name)} suggested</th>${suggested}</tr>`
  }).join("\n")

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Part Match Pair Lane Analysis</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #172033; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d6dbe3; padding: 6px 8px; text-align: left; }
    th { background: #edf1f6; }
    .ok { color: #047857; font-weight: 700; }
    .bad { color: #b91c1c; font-weight: 700; }
  </style>
</head>
<body>
  <h1>Part Match Pair Lane Analysis</h1>
  <p>Score dir: ${escapeHtml(summary.options.scoreDir)}</p>
  <p>Suggested correction budget: ${formatPercent(summary.options.suggestedBudget)}</p>
  <table>
    <thead>
      <tr>
        <th>Lane</th>
        <th>Rank limit</th>
        <th>Margin</th>
        <th>Floor</th>
        <th>Train accepted</th>
        <th>Train TP</th>
        <th>Train FP</th>
        <th>Train false groups</th>
        <th>Train row correction</th>
        <th>Train group correction</th>
        <th>Train pair correction</th>
        <th>Train wrong rows</th>
        <th>Validation accepted</th>
        <th>Validation TP</th>
        <th>Validation FP</th>
        <th>Validation false groups</th>
        <th>Validation row correction</th>
        <th>Validation group correction</th>
        <th>Validation pair correction</th>
        <th>Validation wrong rows</th>
      </tr>
    </thead>
    <tbody>${strategyRows}</tbody>
  </table>
</body>
</html>
`
}

function renderLane(result: LaneResult) {
  const validation = result.validation

  return [
    `<td>${result.config.rankLimit ?? "-"}</td>`,
    `<td>${result.config.margin}</td>`,
    `<td>${result.config.scoreFloor.toFixed(6)}</td>`,
    `<td>${result.train.acceptedPairs}</td>`,
    `<td>${result.train.matchedPositivePairs}/${result.train.positivePairs}</td>`,
    `<td class="${result.train.falsePositivePairs === 0 ? "ok" : "bad"}">${result.train.falsePositivePairs}</td>`,
    `<td class="${result.train.falseGroups === 0 ? "ok" : "bad"}">${result.train.falseGroups}/${result.train.groups}</td>`,
    `<td>${formatPercent(result.train.correctionBurden)}</td>`,
    `<td>${formatPercent(result.train.correctionBurdenGroups)}</td>`,
    `<td>${formatPercent(result.train.correctionBurdenPairs)}</td>`,
    `<td>${result.train.wrongRowMemberships}/${result.train.groupedRows}</td>`,
    `<td>${validation?.acceptedPairs ?? "-"}</td>`,
    `<td>${validation ? `${validation.matchedPositivePairs}/${validation.positivePairs}` : "-"}</td>`,
    `<td class="${(validation?.falsePositivePairs ?? 0) === 0 ? "ok" : "bad"}">${validation?.falsePositivePairs ?? "-"}</td>`,
    `<td class="${(validation?.falseGroups ?? 0) === 0 ? "ok" : "bad"}">${validation ? `${validation.falseGroups}/${validation.groups}` : "-"}</td>`,
    `<td>${validation ? formatPercent(validation.correctionBurden) : "-"}</td>`,
    `<td>${validation ? formatPercent(validation.correctionBurdenGroups) : "-"}</td>`,
    `<td>${validation ? formatPercent(validation.correctionBurdenPairs) : "-"}</td>`,
    `<td>${validation ? `${validation.wrongRowMemberships}/${validation.groupedRows}` : "-"}</td>`,
  ].join("")
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(3)}%`
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
}

function timestampSlug(date: Date) {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-")
}

function parseArgs(argv: string[]): AnalyzePartMatchPairLanesOptions {
  const options: Partial<AnalyzePartMatchPairLanesOptions> = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === "--score-dir" && next) {
      options.scoreDir = next
      index += 1
      continue
    }

    if (arg === "--output-dir" && next) {
      options.outputDir = next
      index += 1
      continue
    }

    if (arg === "--manual-training-dir" && next) {
      options.manualTrainingDir = next
      index += 1
      continue
    }

    if (arg === "--score-mode" && next) {
      options.scoreMode = next
      index += 1
      continue
    }

    if (arg === "--suggested-budget" && next) {
      options.suggestedBudget = Number(next)
      index += 1
      continue
    }

    if (arg === "--margins" && next) {
      options.margins = next.split(",").map((value) => Number(value.trim()))
      index += 1
      continue
    }

    if (arg === "--skip-color-name-conflicts" && next) {
      options.skipColorNameConflicts = next !== "false"
      index += 1
    }
  }

  if (!options.scoreDir) {
    throw new Error("--score-dir is required")
  }

  return options as AnalyzePartMatchPairLanesOptions
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  analyzePartMatchPairLanes(parseArgs(process.argv.slice(2))).then((result) => {
    console.log(JSON.stringify({
      indexPath: result.indexPath,
      outputDir: result.outputDir,
      summaryPath: result.summaryPath,
    }, null, 2))
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
