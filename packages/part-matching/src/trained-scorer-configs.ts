import type { PartPairScorerConfig } from "./contracts"
import autoScorerConfig from "./scorer-configs/auto-part-pair-scorer-config.json" with { type: "json" }
import suggestedScorerConfig from "./scorer-configs/suggested-part-pair-scorer-config.json" with { type: "json" }

export const AUTO_PART_PAIR_SCORER_CONFIG =
  autoScorerConfig as PartPairScorerConfig

export const SUGGESTED_PART_PAIR_SCORER_CONFIG =
  suggestedScorerConfig as PartPairScorerConfig
