import {
  SUGGESTED_PART_PAIR_SCORER_CONFIG,
  type PartPairScorerConfig,
} from "@bag-it/part-matching"

let staticSuggestedScorerConfigPromise: Promise<PartPairScorerConfig> | null = null

export async function resolveSuggestedPartPairScorerConfig(
  hasCnnScores: boolean,
): Promise<PartPairScorerConfig> {
  return hasCnnScores
    ? SUGGESTED_PART_PAIR_SCORER_CONFIG
    : loadStaticSuggestedPartPairScorerConfig()
}

async function loadStaticSuggestedPartPairScorerConfig(): Promise<PartPairScorerConfig> {
  staticSuggestedScorerConfigPromise ??= import("@bag-it/part-matching")
    .then((module) => module.STATIC_SUGGESTED_PART_PAIR_SCORER_CONFIG)

  return staticSuggestedScorerConfigPromise
}
