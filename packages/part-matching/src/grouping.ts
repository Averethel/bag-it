import type {
  PartMatchGroup,
  PartMatchInput,
  PartMatchKind,
  PartMatchRowInput,
  PartPairScoreFeatureLookup,
  WritablePartPairScoreFeatureCache,
  PartPairScorerConfig,
  PartVisualFeatures,
} from "./contracts"
import { colorsAreCompatible, readColorKey } from "./color"
import { digestString } from "./digest"
import { extractPartVisualFeatures } from "./features"
import { compareNearFeatures } from "./near-match"
import {
  extractPartPairScoreFeatures,
  partPairScoreFeaturesMatch,
  scoreFeatureVector,
  scorePartPair,
  type PartPairScoreFeatures,
} from "./pair-scorer"

interface MatchableRow {
  colorKey: string
  features: PartVisualFeatures
  row: PartMatchRowInput
}

interface DraftGroup {
  confidence: number
  kind: PartMatchKind
  reasons: string[]
  rows: MatchableRow[]
}

interface ScoredPairEdge {
  confidence: number
  left: MatchableRow
  right: MatchableRow
}

interface PartPairScoreFeatureSources {
  pairScoreFeaturesByKey: PartPairScoreFeatureLookup | null | undefined
  writablePairScoreFeatureCache: WritablePartPairScoreFeatureCache | null | undefined
}

export function createPartMatchGroups(input: PartMatchInput): PartMatchGroup[] {
  const rows = input.rows.map(toMatchableRow).filter((row): row is MatchableRow => Boolean(row))
  const exactGroups = createExactGroups(rows)
  const pairScoreFeatureSources = {
    pairScoreFeaturesByKey: input.pairScoreFeaturesByKey,
    writablePairScoreFeatureCache: input.writablePairScoreFeatureCache,
  }

  if (!input.enableLabelGatedNearMatches) {
    return exactGroups
      .map(toPartMatchGroup)
      .sort(compareGroups)
  }

  const nearGroups = removeExactDuplicateNearGroups(
    createNearGroups(rows, input.pairScorerConfig, pairScoreFeatureSources),
    exactGroups,
  )
  const nearRowIds = new Set(nearGroups.flatMap((group) => group.rows.map((row) => row.row.rowId)))
  const remainingExactGroups = createExactGroups(
    rows.filter((row) => !nearRowIds.has(row.row.rowId)),
  )

  return [...remainingExactGroups, ...nearGroups]
    .map(toPartMatchGroup)
    .sort(compareGroups)
}

function toMatchableRow(row: PartMatchRowInput): MatchableRow | null {
  const colorKey = readColorKey(row.color)

  if (!colorKey) {
    return null
  }

  const features = row.features ?? extractPartVisualFeatures({
    alphaMask: row.alphaMask,
    partRegion: row.partRegion,
    renderedPixels: row.renderedPixels,
  })

  if (!features.alphaDigest) {
    return null
  }

  return { colorKey, features, row }
}

function createExactGroups(rows: readonly MatchableRow[]): DraftGroup[] {
  const rowsByDigest = new Map<string, MatchableRow[]>()

  for (const row of rows) {
    const key = `${row.row.bagId}:${row.colorKey}:${row.features.alphaDigest}:${row.features.detailDigest ?? "no-detail"}`
    rowsByDigest.set(key, [...(rowsByDigest.get(key) ?? []), row])
  }

  return [...rowsByDigest.values()].flatMap((digestRows) =>
    createCalloutDistinctGroups(digestRows, {
      confidence: 1,
      kind: "exact-digest",
      reasons: ["same color and exact alpha digest"],
    }),
  )
}

function createNearGroups(
  rows: readonly MatchableRow[],
  pairScorerConfig: PartPairScorerConfig | null | undefined,
  pairScoreFeatureSources: PartPairScoreFeatureSources,
): DraftGroup[] {
  if (pairScorerConfig) {
    return createScoredNearGroups(rows, pairScorerConfig, pairScoreFeatureSources)
  }

  const groups: DraftGroup[] = []

  for (const row of rows) {
    const targetGroup = groups.find((group) =>
      canJoinNearGroup(row, group, pairScorerConfig, pairScoreFeatureSources)
    )

    if (targetGroup) {
      targetGroup.confidence = Math.min(
        targetGroup.confidence,
        confidenceAgainstGroup(row, targetGroup, pairScorerConfig, pairScoreFeatureSources),
      )
      targetGroup.rows.push(row)
      continue
    }

    groups.push({
      confidence: 0.98,
      kind: "label-gated-near",
      reasons: ["label-gated visual features match"],
      rows: [row],
    })
  }

  return groups.filter((group) => group.rows.length > 1)
}

function createScoredNearGroups(
  rows: readonly MatchableRow[],
  pairScorerConfig: PartPairScorerConfig,
  pairScoreFeatureSources: PartPairScoreFeatureSources,
): DraftGroup[] {
  const graph = createMatchedPairGraph(rows, pairScorerConfig, pairScoreFeatureSources)

  if (pairScorerConfig.groupingStrategy === "connected-components") {
    return createConnectedComponentGroups(rows, graph)
  }

  const candidates = createScoredCliqueCandidates(rows, graph)

  return selectDisjointCliqueGroups(candidates)
}

function createMatchedPairGraph(
  rows: readonly MatchableRow[],
  pairScorerConfig: PartPairScorerConfig,
  pairScoreFeatureSources: PartPairScoreFeatureSources,
): {
  edges: ScoredPairEdge[]
  pairConfidenceByKey: Map<string, number>
} {
  const edges: ScoredPairEdge[] = []
  const pairConfidenceByKey = new Map<string, number>()

  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
      const left = rows[leftIndex]
      const right = rows[rightIndex]

      if (!left || !right) {
        continue
      }

      const result = nearRowsMatch(left, right, pairScorerConfig, pairScoreFeatureSources)

      if (!result.matched) {
        continue
      }

      edges.push({ confidence: result.confidence, left, right })
      pairConfidenceByKey.set(rowPairKey(left, right), result.confidence)
    }
  }

  return { edges, pairConfidenceByKey }
}

function createScoredCliqueCandidates(
  rows: readonly MatchableRow[],
  graph: {
    edges: readonly ScoredPairEdge[]
    pairConfidenceByKey: ReadonlyMap<string, number>
  },
): DraftGroup[] {
  const candidatesByKey = new Map<string, DraftGroup>()

  for (const edge of graph.edges) {
    const clique = growClique([edge.left, edge.right], rows, graph.pairConfidenceByKey)
    const key = groupRowsKey(clique)

    if (!candidatesByKey.has(key)) {
      candidatesByKey.set(key, createScoredCliqueGroup(clique, graph.pairConfidenceByKey))
    }
  }

  return [...candidatesByKey.values()].filter((group) => group.rows.length > 1)
}

function growClique(
  seedRows: MatchableRow[],
  rows: readonly MatchableRow[],
  pairConfidenceByKey: ReadonlyMap<string, number>,
): MatchableRow[] {
  const clique = [...seedRows]

  for (;;) {
    const next = rows
      .filter((row) => !clique.includes(row))
      .filter((row) => canJoinScoredClique(row, clique, pairConfidenceByKey))
      .sort((left, right) =>
        confidenceAgainstClique(right, clique, pairConfidenceByKey) -
        confidenceAgainstClique(left, clique, pairConfidenceByKey) ||
        right.row.rowId.localeCompare(left.row.rowId)
      )[0]

    if (!next) {
      return clique
    }

    clique.push(next)
  }
}

function canJoinScoredClique(
  row: MatchableRow,
  clique: readonly MatchableRow[],
  pairConfidenceByKey: ReadonlyMap<string, number>,
): boolean {
  return clique.every((candidate) =>
    row.row.calloutId !== candidate.row.calloutId &&
    pairConfidenceByKey.has(rowPairKey(row, candidate))
  )
}

function confidenceAgainstClique(
  row: MatchableRow,
  clique: readonly MatchableRow[],
  pairConfidenceByKey: ReadonlyMap<string, number>,
): number {
  return Math.min(
    ...clique.map((candidate) => pairConfidenceByKey.get(rowPairKey(row, candidate)) ?? 0),
  )
}

function createScoredCliqueGroup(
  rows: readonly MatchableRow[],
  pairConfidenceByKey: ReadonlyMap<string, number>,
): DraftGroup {
  return {
    confidence: confidenceWithinClique(rows, pairConfidenceByKey),
    kind: "label-gated-near",
    reasons: ["label-gated visual features match"],
    rows: [...rows],
  }
}

function createConnectedComponentGroups(
  rows: readonly MatchableRow[],
  graph: {
    edges: readonly ScoredPairEdge[]
    pairConfidenceByKey: ReadonlyMap<string, number>
  },
): DraftGroup[] {
  const rowsById = new Map(rows.map((row) => [row.row.rowId, row]))

  return connectedComponentRowIds(rows, graph.edges)
    .flatMap((componentRowIds) =>
      splitConnectedComponentByCallout(
        componentRowIds.map((rowId) => rowsById.get(rowId)).filter((row): row is MatchableRow => Boolean(row)),
        graph,
      )
    )
}

function connectedComponentRowIds(
  rows: readonly MatchableRow[],
  edges: readonly ScoredPairEdge[],
): string[][] {
  const adjacency = createScoredAdjacency(rows, edges)
  const seen = new Set<string>()

  return rows.flatMap((row) => {
    const component = readConnectedComponent(row.row.rowId, adjacency, seen)

    return component ? [component] : []
  })
}

function createScoredAdjacency(
  rows: readonly MatchableRow[],
  edges: readonly ScoredPairEdge[],
): Map<string, string[]> {
  const adjacency = new Map(rows.map((row) => [row.row.rowId, [] as string[]]))

  for (const edge of edges) {
    adjacency.get(edge.left.row.rowId)?.push(edge.right.row.rowId)
    adjacency.get(edge.right.row.rowId)?.push(edge.left.row.rowId)
  }

  return adjacency
}

function readConnectedComponent(
  startRowId: string,
  adjacency: ReadonlyMap<string, readonly string[]>,
  seen: Set<string>,
): string[] | null {
  if (seen.has(startRowId) || (adjacency.get(startRowId)?.length ?? 0) === 0) {
    return null
  }

  const queue = [startRowId]
  const component = []
  seen.add(startRowId)

  while (queue.length > 0) {
    const rowId = queue.shift()

    if (!rowId) {
      continue
    }

    component.push(rowId)
    enqueueUnseenNeighbors(rowId, adjacency, seen, queue)
  }

  return component
}

function enqueueUnseenNeighbors(
  rowId: string,
  adjacency: ReadonlyMap<string, readonly string[]>,
  seen: Set<string>,
  queue: string[],
): void {
  for (const nextRowId of adjacency.get(rowId) ?? []) {
    if (seen.has(nextRowId)) {
      continue
    }

    seen.add(nextRowId)
    queue.push(nextRowId)
  }
}

function splitConnectedComponentByCallout(
  rows: readonly MatchableRow[],
  graph: {
    edges: readonly ScoredPairEdge[]
    pairConfidenceByKey: ReadonlyMap<string, number>
  },
): DraftGroup[] {
  const remaining = new Set(rows.map((row) => row.row.rowId))
  const groups: DraftGroup[] = []
  const rowsById = new Map(rows.map((row) => [row.row.rowId, row]))

  while (remaining.size > 0) {
    const seed = [...remaining]
      .map((rowId) => rowsById.get(rowId))
      .filter((row): row is MatchableRow => Boolean(row))
      .sort((left, right) =>
        scoredEdgeDegree(right, graph.edges) - scoredEdgeDegree(left, graph.edges)
      )[0]

    if (!seed) {
      break
    }

    const groupRows = [seed]
    remaining.delete(seed.row.rowId)

    const candidates = [...remaining]
      .map((rowId) => rowsById.get(rowId))
      .filter((row): row is MatchableRow => Boolean(row))
      .sort((left, right) =>
        confidenceAgainstConnectedGroup(right, groupRows, graph.pairConfidenceByKey) -
        confidenceAgainstConnectedGroup(left, groupRows, graph.pairConfidenceByKey)
      )

    for (const candidate of candidates) {
      if (
        groupRows.some((row) => row.row.calloutId === candidate.row.calloutId) ||
        confidenceAgainstConnectedGroup(candidate, groupRows, graph.pairConfidenceByKey) <= 0
      ) {
        continue
      }

      groupRows.push(candidate)
      remaining.delete(candidate.row.rowId)
    }

    if (groupRows.length > 1) {
      groups.push(createConnectedComponentGroup(groupRows, graph.pairConfidenceByKey))
    }
  }

  return groups
}

function scoredEdgeDegree(row: MatchableRow, edges: readonly ScoredPairEdge[]): number {
  return edges.filter((edge) => edge.left === row || edge.right === row).length
}

function confidenceAgainstConnectedGroup(
  row: MatchableRow,
  groupRows: readonly MatchableRow[],
  pairConfidenceByKey: ReadonlyMap<string, number>,
): number {
  return Math.max(
    0,
    ...groupRows.map((candidate) => pairConfidenceByKey.get(rowPairKey(row, candidate)) ?? 0),
  )
}

function createConnectedComponentGroup(
  rows: readonly MatchableRow[],
  pairConfidenceByKey: ReadonlyMap<string, number>,
): DraftGroup {
  return {
    confidence: confidenceWithinConnectedGroup(rows, pairConfidenceByKey),
    kind: "label-gated-near",
    reasons: ["label-gated visual scorer connected component"],
    rows: [...rows],
  }
}

function confidenceWithinConnectedGroup(
  rows: readonly MatchableRow[],
  pairConfidenceByKey: ReadonlyMap<string, number>,
): number {
  const confidences = []

  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
      const left = rows[leftIndex]
      const right = rows[rightIndex]

      if (!left || !right) {
        continue
      }

      const confidence = pairConfidenceByKey.get(rowPairKey(left, right))

      if (confidence) {
        confidences.push(confidence)
      }
    }
  }

  return Math.min(...confidences)
}

function confidenceWithinClique(
  rows: readonly MatchableRow[],
  pairConfidenceByKey: ReadonlyMap<string, number>,
): number {
  const confidences = []

  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
      const left = rows[leftIndex]
      const right = rows[rightIndex]

      if (left && right) {
        confidences.push(pairConfidenceByKey.get(rowPairKey(left, right)) ?? 0)
      }
    }
  }

  return Math.min(...confidences)
}

function selectDisjointCliqueGroups(candidates: readonly DraftGroup[]): DraftGroup[] {
  const selected = []
  const usedRowIds = new Set<string>()

  for (const candidate of [...candidates].sort(compareCliqueGroups)) {
    if (candidate.rows.some((row) => usedRowIds.has(row.row.rowId))) {
      continue
    }

    selected.push(candidate)

    for (const row of candidate.rows) {
      usedRowIds.add(row.row.rowId)
    }
  }

  return selected
}

function compareCliqueGroups(left: DraftGroup, right: DraftGroup): number {
  return pairCount(right.rows.length) - pairCount(left.rows.length) ||
    right.confidence - left.confidence ||
    groupRowsKey(left.rows).localeCompare(groupRowsKey(right.rows))
}

function pairCount(rowCount: number): number {
  return (rowCount * (rowCount - 1)) / 2
}

function removeExactDuplicateNearGroups(
  nearGroups: readonly DraftGroup[],
  exactGroups: readonly DraftGroup[],
): DraftGroup[] {
  return nearGroups.filter((nearGroup) =>
    !exactGroups.some((exactGroup) => groupsHaveSameRows(nearGroup, exactGroup))
  )
}

function groupsHaveSameRows(left: DraftGroup, right: DraftGroup): boolean {
  if (left.rows.length !== right.rows.length) {
    return false
  }

  const rightRowIds = new Set(right.rows.map((row) => row.row.rowId))

  return left.rows.every((row) => rightRowIds.has(row.row.rowId))
}

function groupRowsKey(rows: readonly MatchableRow[]): string {
  return rows.map((row) => row.row.rowId).sort().join("\0")
}

function rowPairKey(left: MatchableRow, right: MatchableRow): string {
  return [left.row.rowId, right.row.rowId].sort().join("\0")
}

function canJoinNearGroup(
  row: MatchableRow,
  group: DraftGroup,
  pairScorerConfig: PartPairScorerConfig | null | undefined,
  pairScoreFeatureSources: PartPairScoreFeatureSources,
): boolean {
  return group.rows.every((candidate) =>
    nearRowsMatch(row, candidate, pairScorerConfig, pairScoreFeatureSources).matched
  )
}

function confidenceAgainstGroup(
  row: MatchableRow,
  group: DraftGroup,
  pairScorerConfig: PartPairScorerConfig | null | undefined,
  pairScoreFeatureSources: PartPairScoreFeatureSources,
): number {
  return Math.min(
    ...group.rows.map((candidate) =>
      nearRowsMatch(row, candidate, pairScorerConfig, pairScoreFeatureSources).confidence
    ),
  )
}

function nearRowsMatch(
  left: MatchableRow,
  right: MatchableRow,
  pairScorerConfig: PartPairScorerConfig | null | undefined,
  pairScoreFeatureSources: PartPairScoreFeatureSources,
) {
  if (
    left.row.bagId !== right.row.bagId ||
    left.row.calloutId === right.row.calloutId ||
    !colorsAreCompatible(left.row.color, right.row.color)
  ) {
    return { confidence: 0, matched: false, reasons: ["scope or color mismatch"] }
  }

  if (!pairScorerConfig) {
    return compareNearFeatures(left.features, right.features)
  }

  const pairKey = rowPairKey(left, right)
  const cachedFeatures =
    pairScoreFeatureSources.pairScoreFeaturesByKey?.get(pairKey) ??
    pairScoreFeatureSources.writablePairScoreFeatureCache?.get(pairKey)

  if (cachedFeatures) {
    const features = cachedFeatures as PartPairScoreFeatures
    const rawProbability = scoreFeatureVector(features, pairScorerConfig)
    const matched = partPairScoreFeaturesMatch(features, pairScorerConfig)

    return matched
      ? {
          confidence: Math.max(rawProbability, pairScorerConfig.threshold),
          matched: true,
          reasons: ["trained visual scorer match"],
        }
      : {
          confidence: rawProbability,
          matched: false,
          reasons: ["trained visual scorer rejected"],
        }
  }

  if (pairScoreFeatureSources.writablePairScoreFeatureCache) {
    const features = extractPartPairScoreFeatures(left.features, right.features)

    pairScoreFeatureSources.writablePairScoreFeatureCache.set(pairKey, features)

    const rawProbability = scoreFeatureVector(features, pairScorerConfig)
    const matched = partPairScoreFeaturesMatch(features, pairScorerConfig)

    return matched
      ? {
          confidence: Math.max(rawProbability, pairScorerConfig.threshold),
          matched: true,
          reasons: ["trained visual scorer match"],
        }
      : {
          confidence: rawProbability,
          matched: false,
          reasons: ["trained visual scorer rejected"],
        }
  }

  const scorerResult = scorePartPair(left.features, right.features, pairScorerConfig)

  return scorerResult.matched
    ? {
        confidence: scorerResult.probability,
        matched: true,
        reasons: ["trained visual scorer match"],
      }
    : {
        confidence: scorerResult.probability,
        matched: false,
        reasons: ["trained visual scorer rejected"],
      }
}

function createCalloutDistinctGroups(
  rows: readonly MatchableRow[],
  options: {
    confidence: number
    kind: PartMatchKind
    reasons: string[]
  },
): DraftGroup[] {
  const groups: DraftGroup[] = []

  for (const row of rows) {
    const existingGroup = groups.find((group) =>
      group.rows.every((candidate) => candidate.row.calloutId !== row.row.calloutId)
    )

    if (existingGroup) {
      existingGroup.rows.push(row)
      continue
    }

    groups.push({
      confidence: options.confidence,
      kind: options.kind,
      reasons: options.reasons,
      rows: [row],
    })
  }

  return groups.filter((group) => group.rows.length > 1)
}

function toPartMatchGroup(group: DraftGroup): PartMatchGroup {
  const rowIds = group.rows.map((row) => row.row.rowId)
  const bagId = group.rows[0]?.row.bagId ?? "bag"
  const digest = digestString(`${bagId}:${group.kind}:${rowIds.join(":")}`)

  return {
    bagId,
    confidence: group.confidence,
    groupId: `part-match-${digest}`,
    matchKind: group.kind,
    reasons: group.reasons,
    rowIds,
  }
}

function compareGroups(left: PartMatchGroup, right: PartMatchGroup): number {
  return left.bagId.localeCompare(right.bagId) ||
    (left.rowIds[0] ?? "").localeCompare(right.rowIds[0] ?? "") ||
    left.groupId.localeCompare(right.groupId)
}
