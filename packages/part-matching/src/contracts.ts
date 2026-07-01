export const PART_MATCHER_VERSION = "0.1.0-alpha.16"

export type PartMatchKind = "exact-digest" | "label-gated-near"

export interface PartMatchRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface PartMatchAlphaMask {
  data: Uint8ClampedArray | number[] | Record<string, number>
  height: number
  width: number
}

export interface PartMatchRenderedPixels {
  data: Uint8ClampedArray | number[] | Record<string, number>
  height: number
  width: number
}

export interface PartMatchColor {
  family?: string | null
  key?: string | null
  manualClassId?: string | null
  manualClassTrusted?: boolean | null
  name?: string | null
  status?: string | null
}

export interface PartMatchRowInput {
  alphaMask?: PartMatchAlphaMask | null
  bagId: string
  calloutId: string
  color?: PartMatchColor | null
  features?: PartVisualFeatures
  itemId: string
  partRegion: PartMatchRegion
  renderedPixels?: PartMatchRenderedPixels | null
  rowId: string
}

export interface PartVisualFeatureInput {
  alphaMask?: PartMatchAlphaMask | null
  partRegion: PartMatchRegion
  renderedPixels?: PartMatchRenderedPixels | null
}

export interface PartVisualFeatures {
  alphaDigest: string | null
  alphaOrientationHistogram: number[]
  alphaSignedDistanceGrid32: number[]
  area: number
  aspectRatio: number
  centerX: number
  centerY: number
  detailDigest: string | null
  edgeAlpha: number[]
  edgeAlpha32: number[]
  height: number
  leftProfile: number[]
  lowerProfile: number[]
  lowerSegmentCount: number
  lumaGrid: number[] | null
  lumaGrid32: number[] | null
  lumaOrientationHistogram: number[] | null
  normalizedAlpha: number[]
  normalizedAlpha32: number[]
  opaqueCoverage: number
  projectionX: number[]
  projectionY: number[]
  rightProfile: number[]
  tightAlpha32: number[]
  tightAlphaEdge32: number[]
  tightAlphaSignedDistanceGrid32: number[]
  tightLumaGrid32: number[] | null
  topProfile: number[]
  topPeakCount: number
  width: number
}

export interface PartMatchGroup {
  bagId: string
  confidence: number
  groupId: string
  matchKind: PartMatchKind
  reasons: string[]
  rowIds: string[]
}

export type PartPairScoreFeatureRecord = Record<string, number>
export type PartPairScoreFeatureLookup = ReadonlyMap<string, PartPairScoreFeatureRecord>
export type WritablePartPairScoreFeatureCache = Map<string, PartPairScoreFeatureRecord>

export interface PartPairScorerConfig {
  evidenceRules?: PartPairEvidenceRule[]
  featureNames: string[]
  groupingStrategy?: "clique" | "connected-components"
  intercept: number
  kind?: "linear" | "decision-tree"
  metadata?: Record<string, unknown>
  modelGatedSupplementalRules?: PartPairEvidenceRule[]
  normalization: Record<string, {
    mean: number
    std: number
  }>
  supplementalMode?: "independent" | "model-gated"
  supplementalRules?: PartPairEvidenceRule[]
  threshold: number
  tree?: PartPairScorerTreeNode
  version: string
  vetoRules?: PartPairEvidenceRule[]
  weights: Record<string, number>
}

export interface PartPairEvidenceRule {
  conditions: PartPairEvidenceCondition[]
}

export interface PartPairEvidenceCondition {
  featureName: string
  operator: "gt" | "lt"
  threshold: number
}

export type PartPairScorerTreeNode = PartPairScorerTreeLeaf | PartPairScorerTreeSplit

export interface PartPairScorerTreeLeaf {
  probability: number
  positiveCount: number
  totalCount: number
}

export interface PartPairScorerTreeSplit extends PartPairScorerTreeLeaf {
  featureName: string
  left: PartPairScorerTreeNode
  right: PartPairScorerTreeNode
  threshold: number
}

export interface PartMatchInput {
  enableLabelGatedNearMatches?: boolean
  pairScorerConfig?: PartPairScorerConfig | null
  pairScoreFeaturesByKey?: PartPairScoreFeatureLookup | null
  writablePairScoreFeatureCache?: WritablePartPairScoreFeatureCache | null
  rows: readonly PartMatchRowInput[]
}
