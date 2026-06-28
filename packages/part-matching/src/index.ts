export {
  PART_MATCHER_VERSION,
  type PartMatchAlphaMask,
  type PartMatchColor,
  type PartMatchGroup,
  type PartMatchInput,
  type PartMatchKind,
  type PartMatchRegion,
  type PartMatchRenderedPixels,
  type PartMatchRowInput,
  type PartPairEvidenceCondition,
  type PartPairEvidenceRule,
  type PartPairScoreFeatureLookup,
  type PartPairScoreFeatureRecord,
  type PartPairScorerConfig,
  type PartPairScorerTreeLeaf,
  type PartPairScorerTreeNode,
  type PartPairScorerTreeSplit,
  type PartVisualFeatureInput,
  type PartVisualFeatures,
  type WritablePartPairScoreFeatureCache,
} from "./contracts"
export { extractPartVisualFeatures } from "./features"
export { DEFAULT_PART_PAIR_SCORER_CONFIG } from "./default-scorer-config"
export {
  AUTO_PART_PAIR_SCORER_CONFIG,
  SUGGESTED_PART_PAIR_SCORER_CONFIG,
} from "./trained-scorer-configs"
export { STATIC_SUGGESTED_PART_PAIR_SCORER_CONFIG } from "./static-suggested-scorer-config"
export { createPartMatchGroups } from "./grouping"
export {
  PART_PAIR_SCORER_CONFIG_VERSION,
  PART_PAIR_SCORE_FEATURE_NAMES,
  collectPartPairScorerFeatureNames,
  extractPartPairScoreFeatures,
  partPairScoreFeaturesMatch,
  scoreFeatureVector,
  scorePartPair,
  type PartPairScoreFeatureName,
  type PartPairScoreFeatures,
  type PartPairScoreResult,
} from "./pair-scorer"
