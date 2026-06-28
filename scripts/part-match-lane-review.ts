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

type PairSplit = "train" | "validation" | "all"
type PairTarget = 0 | 1
type ReviewLane = "auto" | "suggested"

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

interface LaneAnalysisSummary {
  generatedAt?: string
  options?: {
    manualTrainingDir?: string | null
    scoreDir?: string | null
    scoreMode?: string | null
    skipColorNameConflicts?: boolean | null
  }
  strategies?: Array<{
    auto?: LaneResult | null
    name?: string | null
    suggested?: LaneResult | null
  }>
}

interface LaneResult {
  config?: LaneConfig | null
}

interface LaneConfig {
  margin: number
  mutualTop1: boolean
  rankLimit: number | null
  scoreFloor: number
}

interface ExampleMetadata {
  bagId: string
  bagLabel?: string | null
  calloutId: string
  colorName?: string | null
  cropHash?: string | null
  exampleId: string
  expectedPartKey?: string | null
  imagePath?: string | null
  itemId: string
  manualId: string
  pageNumber?: number | null
  quantity?: number | null
  role?: string | null
  stepIndex?: number | null
  title?: string | null
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

interface ReviewGroup {
  bagId: string
  bagLabel: string
  falsePairCount: number
  groupId: string
  imageCount: number
  manualId: string
  matchedPositivePairs: number
  members: ReviewMember[]
  negativePairCount: number
  positivePairCount: number
  scoreMax: number
  scoreMin: number
  wrongRowMemberships: number
}

interface ReviewMember {
  bagId: string
  bagLabel: string
  calloutId: string
  colorName: string | null
  cropHash: string | null
  exampleId: string
  expectedPartKey: string | null
  imagePath: string | null
  itemId: string
  manualId: string
  pageNumber: number | null
  quantity: number | null
  role: string | null
  stepIndex: number | null
  title: string | null
}

interface ReviewCaseSummary {
  acceptedPairs: number
  falseGroups: number
  groupCount: number
  groupedRows: number
  laneSummaryDir: string
  manualIds: string[]
  matchedPositivePairs: number
  negativePairs: number
  positivePairs: number
  scoreDir: string
  scoreFloor: number
  wrongRowMemberships: number
}

interface LaneReviewSummary {
  cases: ReviewCaseSummary[]
  generatedAt: string
  options: {
    lane: ReviewLane
    laneSummaryDirs: string[]
    outputDir: string
    split: PairSplit
    strategy: string
  }
  totals: {
    acceptedPairs: number
    falseGroups: number
    groupCount: number
    groupedRows: number
    matchedPositivePairs: number
    negativePairs: number
    positivePairs: number
    wrongRowMemberships: number
  }
  version: string
}

export interface WritePartMatchLaneReviewOptions {
  generatedAt?: Date
  lane?: ReviewLane
  laneSummaryDirs: string[]
  outputDir?: string
  split?: PairSplit
  strategy?: string
}

export interface WritePartMatchLaneReviewResult {
  groupsPath: string
  indexPath: string
  outputDir: string
  summary: LaneReviewSummary
  summaryPath: string
}

export async function writePartMatchLaneReview(
  options: WritePartMatchLaneReviewOptions,
): Promise<WritePartMatchLaneReviewResult> {
  const generatedAt = options.generatedAt ?? new Date()
  const lane = options.lane ?? "auto"
  const split = options.split ?? "validation"
  const strategy = options.strategy ?? "score-threshold"
  const outputDir = options.outputDir ?? path.join(
    DEFAULT_OUTPUT_ROOT,
    `${timestampSlug(generatedAt)}-lane-review`,
  )
  const allGroups: ReviewGroup[] = []
  const cases: ReviewCaseSummary[] = []

  if (options.laneSummaryDirs.length === 0) {
    throw new Error("--lane-summary-dirs requires at least one directory")
  }

  for (const laneSummaryDir of options.laneSummaryDirs) {
    const reviewCase = await readReviewCase({
      lane,
      laneSummaryDir,
      outputDir,
      split,
      strategy,
    })

    allGroups.push(...reviewCase.groups)
    cases.push(reviewCase.summary)
  }

  allGroups.sort(compareReviewGroups)

  const summary: LaneReviewSummary = {
    cases,
    generatedAt: generatedAt.toISOString(),
    options: {
      lane,
      laneSummaryDirs: options.laneSummaryDirs,
      outputDir,
      split,
      strategy,
    },
    totals: sumCaseSummaries(cases),
    version: VERSION,
  }
  const summaryPath = path.join(outputDir, "summary.json")
  const groupsPath = path.join(outputDir, "groups.json")
  const indexPath = path.join(outputDir, "index.html")

  await mkdir(outputDir, { recursive: true })
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)
  await writeFile(groupsPath, `${JSON.stringify({ groups: allGroups }, null, 2)}\n`)
  await writeFile(indexPath, renderIndex(summary, allGroups))

  return {
    groupsPath,
    indexPath,
    outputDir,
    summary,
    summaryPath,
  }
}

async function readReviewCase(options: {
  lane: ReviewLane
  laneSummaryDir: string
  outputDir: string
  split: PairSplit
  strategy: string
}) {
  const laneSummary = await readLaneSummary(options.laneSummaryDir)
  const laneResult = laneSummary.strategies
    ?.find((strategy) => strategy.name === options.strategy)
    ?.[options.lane]
  const config = laneResult?.config

  if (!config) {
    throw new Error(`No ${options.lane} ${options.strategy} lane in ${options.laneSummaryDir}`)
  }

  const scoreDir = laneSummary.options?.scoreDir
  const manualTrainingDir = laneSummary.options?.manualTrainingDir

  if (!scoreDir) {
    throw new Error(`Lane summary ${options.laneSummaryDir} is missing options.scoreDir`)
  }

  if (!manualTrainingDir) {
    throw new Error(`Lane summary ${options.laneSummaryDir} is missing options.manualTrainingDir`)
  }

  const examples = await readExamples(manualTrainingDir)
  const pairs = normalizePairs(
    await readPairs(scoreDir),
    {
      exampleColorNames: new Map(Array.from(examples.values()).map((example) => [
        example.exampleId,
        example.colorName ?? null,
      ])),
      scoreMode: laneSummary.options?.scoreMode ?? null,
      skipColorNameConflicts: laneSummary.options?.skipColorNameConflicts ?? true,
    },
  ).filter((pair) => options.split === "all" || pair.split === options.split)
  const acceptedPairs = filterRankCandidates(pairs, config)
    .filter((pair) => pair.score >= config.scoreFloor)
    .sort((left, right) => right.score - left.score)
  const groups = buildReviewGroups({
    acceptedPairs,
    examples,
    manualTrainingDir,
    outputDir: options.outputDir,
    pairs,
  })
  const metrics = scoreReviewGroups(pairs, acceptedPairs, groups)

  return {
    groups,
    summary: {
      acceptedPairs: acceptedPairs.length,
      falseGroups: metrics.falseGroups,
      groupCount: groups.length,
      groupedRows: metrics.groupedRows,
      laneSummaryDir: options.laneSummaryDir,
      manualIds: Array.from(new Set(groups.map((group) => group.manualId))).sort(),
      matchedPositivePairs: metrics.matchedPositivePairs,
      negativePairs: pairs.filter((pair) => pair.target === 0).length,
      positivePairs: pairs.filter((pair) => pair.target === 1).length,
      scoreDir,
      scoreFloor: config.scoreFloor,
      wrongRowMemberships: metrics.wrongRowMemberships,
    },
  }
}

async function readLaneSummary(summaryDir: string) {
  return JSON.parse(await readFile(path.join(summaryDir, "summary.json"), "utf8")) as LaneAnalysisSummary
}

async function readPairs(scoreDir: string) {
  const raw = JSON.parse(await readFile(path.join(scoreDir, "pairs.json"), "utf8"))

  return Array.isArray(raw)
    ? raw as ScoredPair[]
    : Array.isArray((raw as { pairs?: unknown }).pairs)
      ? (raw as { pairs: ScoredPair[] }).pairs
      : []
}

async function readExamples(manualTrainingDir: string) {
  const raw = JSON.parse(await readFile(path.join(manualTrainingDir, "examples.json"), "utf8")) as {
    examples?: ExampleMetadata[]
  }
  const examples = new Map<string, ExampleMetadata>()

  for (const example of raw.examples ?? []) {
    if (example.exampleId) {
      examples.set(example.exampleId, example)
    }
  }

  return examples
}

function normalizePairs(
  pairs: ScoredPair[],
  options: {
    exampleColorNames: ReadonlyMap<string, string | null>
    scoreMode: string | null
    skipColorNameConflicts: boolean
  },
): PairEntry[] {
  return pairs
    .map((pair) => normalizePair(pair, options))
    .filter((pair): pair is PairEntry => pair !== null)
}

function normalizePair(
  pair: ScoredPair,
  options: {
    exampleColorNames: ReadonlyMap<string, string | null>
    scoreMode: string | null
    skipColorNameConflicts: boolean
  },
): PairEntry | null {
  const leftId = firstString(pair.leftExampleId, pair.leftRowKey, pair.leftItemId)
  const rightId = firstString(pair.rightExampleId, pair.rightRowKey, pair.rightItemId)
  const target = pair.target === 1 ? 1 : pair.target === 0 ? 0 : null
  const score = pairScore(pair, options.scoreMode)

  if (!leftId || !rightId || target === null || score === null) {
    return null
  }

  if (
    options.skipColorNameConflicts &&
    hasColorNameConflict(leftId, rightId, options.exampleColorNames)
  ) {
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

function buildReviewGroups(options: {
  acceptedPairs: PairEntry[]
  examples: ReadonlyMap<string, ExampleMetadata>
  manualTrainingDir: string
  outputDir: string
  pairs: PairEntry[]
}) {
  const groups = new GroupState()

  for (const pair of options.acceptedPairs) {
    groups.add(pair)
  }

  return groups.activeGroups()
    .filter((members) => members.length > 1)
    .map((members, index) => reviewGroup({
      acceptedPairs: options.acceptedPairs,
      examples: options.examples,
      groupIndex: index,
      manualTrainingDir: options.manualTrainingDir,
      members,
      outputDir: options.outputDir,
      pairs: options.pairs,
    }))
    .filter((group): group is ReviewGroup => group !== null)
}

function reviewGroup(options: {
  acceptedPairs: PairEntry[]
  examples: ReadonlyMap<string, ExampleMetadata>
  groupIndex: number
  manualTrainingDir: string
  members: string[]
  outputDir: string
  pairs: PairEntry[]
}): ReviewGroup | null {
  const memberSet = new Set(options.members)
  const members = options.members
    .map((member) => reviewMember(
      options.examples.get(member),
      options.manualTrainingDir,
      options.outputDir,
    ))
    .filter((member): member is ReviewMember => member !== null)
    .sort(compareReviewMembers)

  if (members.length < 2) {
    return null
  }

  const first = members[0]
  const inGroupPairs = options.pairs.filter((pair) =>
    memberSet.has(pair.leftId) && memberSet.has(pair.rightId)
  )
  const acceptedScores = options.acceptedPairs
    .filter((pair) => memberSet.has(pair.leftId) && memberSet.has(pair.rightId))
    .map((pair) => pair.score)
  const positivePairCount = inGroupPairs.filter((pair) => pair.target === 1).length
  const negativePairCount = inGroupPairs.length - positivePairCount

  return {
    bagId: first.bagId,
    bagLabel: first.bagLabel,
    falsePairCount: negativePairCount,
    groupId: `${first.manualId}:${first.bagId}:lane-group-${options.groupIndex + 1}`,
    imageCount: members.filter((member) => member.imagePath).length,
    manualId: first.manualId,
    matchedPositivePairs: positivePairCount,
    members,
    negativePairCount,
    positivePairCount,
    scoreMax: acceptedScores.length > 0 ? Math.max(...acceptedScores) : 0,
    scoreMin: acceptedScores.length > 0 ? Math.min(...acceptedScores) : 0,
    wrongRowMemberships: wrongMemberships(memberSet, options.pairs),
  }
}

function reviewMember(
  example: ExampleMetadata | undefined,
  manualTrainingDir: string,
  outputDir: string,
): ReviewMember | null {
  if (!example) {
    return null
  }

  return {
    bagId: example.bagId,
    bagLabel: example.bagLabel ?? "Unknown bag",
    calloutId: example.calloutId,
    colorName: example.colorName ?? null,
    cropHash: example.cropHash ?? null,
    exampleId: example.exampleId,
    expectedPartKey: example.expectedPartKey ?? null,
    imagePath: example.imagePath
      ? toPosixPath(path.relative(outputDir, path.join(manualTrainingDir, example.imagePath)))
      : null,
    itemId: example.itemId,
    manualId: example.manualId,
    pageNumber: example.pageNumber ?? null,
    quantity: example.quantity ?? null,
    role: example.role ?? null,
    stepIndex: example.stepIndex ?? null,
    title: example.title ?? null,
  }
}

function scoreReviewGroups(
  pairs: PairEntry[],
  acceptedPairs: PairEntry[],
  groups: ReviewGroup[],
) {
  const groupedIds = new Map<string, string>()

  for (const group of groups) {
    for (const member of group.members) {
      groupedIds.set(member.exampleId, group.groupId)
    }
  }

  const matchedPositivePairs = pairs.filter((pair) =>
    pair.target === 1 &&
    groupedIds.get(pair.leftId) !== undefined &&
    groupedIds.get(pair.leftId) === groupedIds.get(pair.rightId)
  ).length

  return {
    falseGroups: groups.filter((group) => group.falsePairCount > 0).length,
    groupedRows: groups.reduce((total, group) => total + group.members.length, 0),
    matchedPositivePairs,
    wrongRowMemberships: groups.reduce((total, group) => total + group.wrongRowMemberships, 0),
    acceptedPairs,
  }
}

class GroupState {
  private readonly nodes = new Map<string, GroupNode>()

  add(pair: PairEntry) {
    const left = this.activate(pair.leftId)
    const right = this.activate(pair.rightId)
    const leftRoot = this.find(left)
    const rightRoot = this.find(right)

    if (leftRoot === rightRoot) {
      return
    }

    let target = leftRoot
    let source = rightRoot

    if (source.members.size > target.members.size) {
      target = rightRoot
      source = leftRoot
    }

    source.parent = target.id
    for (const member of source.members) {
      target.members.add(member)
    }
    source.members.clear()
  }

  activeGroups() {
    return Array.from(this.nodes.values())
      .filter((node) => node.parent === node.id && node.members.size > 0)
      .map((node) => Array.from(node.members))
  }

  private activate(id: string) {
    let node = this.nodes.get(id)

    if (!node) {
      node = {
        id,
        members: new Set([id]),
        parent: id,
      }
      this.nodes.set(id, node)
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
}

interface GroupNode {
  id: string
  members: Set<string>
  parent: string
}

function wrongMemberships(members: Set<string>, pairs: PairEntry[]) {
  const positiveAdjacency = new Map<string, Set<string>>()

  for (const pair of pairs) {
    if (pair.target !== 1) {
      continue
    }

    addAdjacency(positiveAdjacency, pair.leftId, pair.rightId)
    addAdjacency(positiveAdjacency, pair.rightId, pair.leftId)
  }

  let largestKnownSamePartClass = 0
  const unseen = new Set(members)

  for (const member of members) {
    if (!unseen.has(member)) {
      continue
    }

    const componentSize = consumePositiveComponent(member, members, unseen, positiveAdjacency)
    largestKnownSamePartClass = Math.max(largestKnownSamePartClass, componentSize)
  }

  return members.size - largestKnownSamePartClass
}

function consumePositiveComponent(
  start: string,
  members: Set<string>,
  unseen: Set<string>,
  positiveAdjacency: ReadonlyMap<string, ReadonlySet<string>>,
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
    const neighbors = positiveAdjacency.get(member)

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

function addAdjacency(adjacency: Map<string, Set<string>>, leftId: string, rightId: string) {
  const neighbors = adjacency.get(leftId) ?? new Set<string>()
  neighbors.add(rightId)
  adjacency.set(leftId, neighbors)
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

function hasColorNameConflict(
  leftId: string,
  rightId: string,
  colorNames: ReadonlyMap<string, string | null>,
) {
  const leftColorName = colorNames.get(leftId)
  const rightColorName = colorNames.get(rightId)

  return Boolean(leftColorName && rightColorName && leftColorName !== rightColorName)
}

function sumCaseSummaries(cases: ReviewCaseSummary[]): LaneReviewSummary["totals"] {
  return cases.reduce((totals, reviewCase) => ({
    acceptedPairs: totals.acceptedPairs + reviewCase.acceptedPairs,
    falseGroups: totals.falseGroups + reviewCase.falseGroups,
    groupCount: totals.groupCount + reviewCase.groupCount,
    groupedRows: totals.groupedRows + reviewCase.groupedRows,
    matchedPositivePairs: totals.matchedPositivePairs + reviewCase.matchedPositivePairs,
    negativePairs: totals.negativePairs + reviewCase.negativePairs,
    positivePairs: totals.positivePairs + reviewCase.positivePairs,
    wrongRowMemberships: totals.wrongRowMemberships + reviewCase.wrongRowMemberships,
  }), {
    acceptedPairs: 0,
    falseGroups: 0,
    groupCount: 0,
    groupedRows: 0,
    matchedPositivePairs: 0,
    negativePairs: 0,
    positivePairs: 0,
    wrongRowMemberships: 0,
  })
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

function compareReviewGroups(left: ReviewGroup, right: ReviewGroup) {
  return left.manualId.localeCompare(right.manualId) ||
    left.bagLabel.localeCompare(right.bagLabel, undefined, { numeric: true }) ||
    nullableNumber(left.members[0]?.pageNumber ?? null) - nullableNumber(right.members[0]?.pageNumber ?? null) ||
    nullableNumber(left.members[0]?.stepIndex ?? null) - nullableNumber(right.members[0]?.stepIndex ?? null) ||
    left.groupId.localeCompare(right.groupId)
}

function compareReviewMembers(left: ReviewMember, right: ReviewMember) {
  return nullableNumber(left.pageNumber) - nullableNumber(right.pageNumber) ||
    nullableNumber(left.stepIndex) - nullableNumber(right.stepIndex) ||
    left.itemId.localeCompare(right.itemId)
}

function nullableNumber(value: number | null) {
  return value ?? Number.MAX_SAFE_INTEGER
}

function renderIndex(summary: LaneReviewSummary, groups: ReviewGroup[]) {
  const cases = summary.cases.map((reviewCase) => `
    <tr>
      <td>${escapeHtml(reviewCase.manualIds.join(", ") || "unknown")}</td>
      <td>${reviewCase.matchedPositivePairs}/${reviewCase.positivePairs}</td>
      <td class="${reviewCase.wrongRowMemberships === 0 ? "ok" : "bad"}">${reviewCase.wrongRowMemberships}/${reviewCase.groupedRows}</td>
      <td class="${reviewCase.falseGroups === 0 ? "ok" : "bad"}">${reviewCase.falseGroups}/${reviewCase.groupCount}</td>
      <td>${reviewCase.acceptedPairs}</td>
      <td>${reviewCase.scoreFloor.toFixed(6)}</td>
    </tr>
  `).join("")
  const groupCards = groupByManualAndBag(groups)
    .map(([manualId, bagGroups]) => renderManualSection(manualId, bagGroups))
    .join("")

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Part Match Lane Review</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #172033; background: #f8fafc; }
    h1, h2, h3 { margin: 0 0 8px; }
    table { border-collapse: collapse; width: 100%; background: white; }
    th, td { border: 1px solid #d6dbe3; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #edf1f6; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(160px, 1fr)); gap: 12px; margin: 16px 0; }
    .metric { background: white; border: 1px solid #d6dbe3; border-radius: 8px; padding: 12px; }
    .metric strong { display: block; font-size: 22px; }
    details { background: white; border: 1px solid #d6dbe3; border-radius: 8px; margin: 12px 0; padding: 10px 12px; }
    summary { cursor: pointer; font-weight: 700; }
    .group { border-top: 1px solid #e4e8ef; padding: 12px 0; }
    .group.bad { background: #fff1f2; margin: 8px -12px -10px; padding: 12px; }
    .group-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
    .members { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
    .member { border: 1px solid #d6dbe3; border-radius: 8px; padding: 8px; background: #f8fafc; display: grid; grid-template-columns: 64px 1fr; gap: 8px; }
    .member img { width: 56px; height: 56px; object-fit: contain; border: 1px solid #bfcedd; background: #dff1ff; }
    .small { color: #536071; font-size: 12px; overflow-wrap: anywhere; }
    .ok { color: #047857; font-weight: 700; }
    .bad { color: #b91c1c; font-weight: 700; }
  </style>
</head>
<body>
  <h1>Part Match Lane Review</h1>
  <p>${escapeHtml(summary.options.strategy)} ${escapeHtml(summary.options.lane)} lane, ${escapeHtml(summary.options.split)} split.</p>
  <div class="summary">
    <div class="metric"><span>matched</span><strong>${summary.totals.matchedPositivePairs}/${summary.totals.positivePairs}</strong></div>
    <div class="metric"><span>wrong grouped rows</span><strong class="${summary.totals.wrongRowMemberships === 0 ? "ok" : "bad"}">${summary.totals.wrongRowMemberships}/${summary.totals.groupedRows}</strong></div>
    <div class="metric"><span>false groups</span><strong class="${summary.totals.falseGroups === 0 ? "ok" : "bad"}">${summary.totals.falseGroups}/${summary.totals.groupCount}</strong></div>
    <div class="metric"><span>accepted pairs</span><strong>${summary.totals.acceptedPairs}</strong></div>
  </div>
  <h2>Cases</h2>
  <table>
    <thead><tr><th>Manual</th><th>Matched</th><th>Wrong rows</th><th>False groups</th><th>Accepted pairs</th><th>Floor</th></tr></thead>
    <tbody>${cases}</tbody>
  </table>
  <h2>Groups</h2>
  ${groupCards}
</body>
</html>
`
}

function groupByManualAndBag(groups: ReviewGroup[]) {
  const manuals = new Map<string, ReviewGroup[]>()

  for (const group of groups) {
    const manualGroups = manuals.get(group.manualId) ?? []
    manualGroups.push(group)
    manuals.set(group.manualId, manualGroups)
  }

  return Array.from(manuals.entries())
}

function renderManualSection(manualId: string, groups: ReviewGroup[]) {
  const bags = new Map<string, ReviewGroup[]>()

  for (const group of groups) {
    const key = `${group.bagLabel} ${group.bagId}`
    const bagGroups = bags.get(key) ?? []
    bagGroups.push(group)
    bags.set(key, bagGroups)
  }

  return `<details open>
    <summary>${escapeHtml(manualId)} · ${groups.length} groups</summary>
    ${Array.from(bags.entries()).map(([bagLabel, bagGroups]) => renderBagSection(bagLabel, bagGroups)).join("")}
  </details>`
}

function renderBagSection(bagLabel: string, groups: ReviewGroup[]) {
  return `<details>
    <summary>${escapeHtml(bagLabel)} · ${groups.length} groups</summary>
    ${groups.map(renderGroup).join("")}
  </details>`
}

function renderGroup(group: ReviewGroup) {
  const status = group.wrongRowMemberships === 0 && group.falsePairCount === 0 ? "ok" : "bad"

  return `<section class="group ${status === "bad" ? "bad" : ""}">
    <div class="group-head">
      <div>
        <strong>${escapeHtml(group.groupId)}</strong>
        <div class="small">${group.members.length} rows · score ${group.scoreMin.toFixed(6)}-${group.scoreMax.toFixed(6)}</div>
      </div>
      <div class="${status}">${group.wrongRowMemberships} wrong rows · ${group.falsePairCount} negative pairs</div>
    </div>
    <div class="members">${group.members.map(renderMember).join("")}</div>
  </section>`
}

function renderMember(member: ReviewMember) {
  return `<article class="member">
    ${member.imagePath ? `<img src="${escapeHtml(member.imagePath)}" alt="">` : "<div></div>"}
    <div>
      <strong>${escapeHtml(member.quantity ? `${member.quantity}x` : "?x")} ${escapeHtml(member.colorName ?? "Unknown color")}</strong>
      <div class="small">page ${member.pageNumber ?? "?"} · step ${member.stepIndex ?? "?"}</div>
      <div class="small">${escapeHtml(member.expectedPartKey ?? member.role ?? "unlabeled")}</div>
      <div class="small">${escapeHtml(member.itemId)}</div>
    </div>
  </article>`
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
}

function toPosixPath(value: string) {
  return value.split(path.sep).join("/")
}

function timestampSlug(date: Date) {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-")
}

function parseArgs(argv: string[]): WritePartMatchLaneReviewOptions {
  const options: Partial<WritePartMatchLaneReviewOptions> = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if ((arg === "--lane-summary-dirs" || arg === "--lane-summary-dir") && next) {
      options.laneSummaryDirs = next.split(",").map((value) => value.trim()).filter(Boolean)
      index += 1
      continue
    }

    if (arg === "--output-dir" && next) {
      options.outputDir = next
      index += 1
      continue
    }

    if (arg === "--strategy" && next) {
      options.strategy = next
      index += 1
      continue
    }

    if (arg === "--lane" && (next === "auto" || next === "suggested")) {
      options.lane = next
      index += 1
      continue
    }

    if (arg === "--split" && (next === "train" || next === "validation" || next === "all")) {
      options.split = next
      index += 1
    }
  }

  if (!options.laneSummaryDirs) {
    throw new Error("--lane-summary-dirs is required")
  }

  return options as WritePartMatchLaneReviewOptions
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  writePartMatchLaneReview(parseArgs(process.argv.slice(2))).then((result) => {
    console.log(JSON.stringify({
      groupsPath: result.groupsPath,
      indexPath: result.indexPath,
      outputDir: result.outputDir,
      summaryPath: result.summaryPath,
    }, null, 2))
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
