import type { PartPairScorerConfig } from "./contracts"
import staticSuggestedScorerConfig from "./scorer-configs/static-suggested-part-pair-scorer-config.json" with { type: "json" }

export const STATIC_SUGGESTED_PART_PAIR_SCORER_CONFIG =
  staticSuggestedScorerConfig as PartPairScorerConfig
