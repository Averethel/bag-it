import {
  AUTO_PART_PAIR_SCORER_CONFIG,
  createPartMatchGroups,
  type PartMatchGroup,
  type PartMatchRowInput,
} from "@bag-it/part-matching"
import { createCnnPartPairScoreFeatures } from "./cnn-part-pair-scorer"
import {
  PART_MATCH_GROUP_RUNNER_PROGRESS_TOTAL,
  createPartMatchProgress,
  type PartMatchGroupRunResult,
  type PartMatchPrecomputeProgress,
} from "./part-match-group-progress"
import { resolveSuggestedPartPairScorerConfig } from "./part-match-suggested-scorer"

export async function runPartMatchGroupBucket(
  matcherRows: PartMatchRowInput[],
  onProgress: (progress: PartMatchPrecomputeProgress) => void,
): Promise<PartMatchGroupRunResult[]> {
  onProgress(createPartMatchProgress(
    "Loading CNN scorer",
    0,
    PART_MATCH_GROUP_RUNNER_PROGRESS_TOTAL,
  ))

  const cnnPairScoreFeatureLookup = await createCnnPartPairScoreFeatures(
    matcherRows,
    (progress) => {
      onProgress(createPartMatchProgress(progress.label, progress.completed, progress.total + 2))
    },
  )
  const suggestedPairScoreFeatureLookup = cnnPairScoreFeatureLookup.size > 0
    ? cnnPairScoreFeatureLookup
    : null
  const suggestedWritablePairScoreFeatureCache = cnnPairScoreFeatureLookup.size > 0
    ? null
    : new Map<string, Record<string, number>>()
  const suggestedPairScorerConfig = await resolveSuggestedPartPairScorerConfig(
    cnnPairScoreFeatureLookup.size > 0,
  )

  onProgress(createPartMatchProgress(
    "Scoring auto groups",
    4,
    PART_MATCH_GROUP_RUNNER_PROGRESS_TOTAL,
  ))

  const autoGroupKeys = new Set(createPartMatchGroups({
    enableLabelGatedNearMatches: true,
    pairScorerConfig: AUTO_PART_PAIR_SCORER_CONFIG,
    rows: matcherRows,
    writablePairScoreFeatureCache: new Map<string, Record<string, number>>(),
  }).map(partMatchGroupRowSetKey))

  onProgress(createPartMatchProgress(
    "Scoring suggested groups",
    5,
    PART_MATCH_GROUP_RUNNER_PROGRESS_TOTAL,
  ))

  return createPartMatchGroups({
    enableLabelGatedNearMatches: true,
    pairScoreFeaturesByKey: suggestedPairScoreFeatureLookup,
    pairScorerConfig: suggestedPairScorerConfig,
    rows: matcherRows,
    writablePairScoreFeatureCache: suggestedWritablePairScoreFeatureCache,
  }).map((group) => ({
    group,
    lane: group.matchKind === "exact-digest" || autoGroupKeys.has(partMatchGroupRowSetKey(group))
      ? "auto" as const
      : "suggested" as const,
  }))
}

function partMatchGroupRowSetKey(group: PartMatchGroup): string {
  return [...group.rowIds].sort().join("\0")
}
