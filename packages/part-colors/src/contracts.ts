export interface RgbColor {
  r: number
  g: number
  b: number
}

export interface PartColorRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface PartColorPageImage {
  data: Uint8ClampedArray
  height: number
  width: number
}

export interface PartColorAlphaMask {
  data: Uint8ClampedArray
  height: number
  width: number
}

export interface PartColorImage {
  alphaMask: PartColorAlphaMask
  region: PartColorRegion
}

export type PartColorSampleStatus = "review" | "stable" | "unknown" | "weak-classifiable"

export interface PartColorSampleChip {
  coverage: number
  hex: string
  pixelCount: number
  rgb: RgbColor
}

export interface PartColorSampleRejectionCounts {
  background: number
  border: number
  edge?: number
  excludedRegion: number
  lowAlpha: number
  outOfPage: number
}

export interface PartColorSample {
  baseChips?: PartColorSampleChip[]
  baseDominantCoverage?: number
  baseEdgeChips?: PartColorSampleChip[]
  basePixelCount?: number
  baseRejectedPixelCount?: number
  baseRejectionCounts?: PartColorSampleRejectionCounts
  baseStatus?: PartColorSampleStatus
  baseVariance?: number
  chips: PartColorSampleChip[]
  dominantCoverage: number
  edgeChips?: PartColorSampleChip[]
  hex: string
  pixelCount: number
  rgb: RgbColor
  resampleReason?: string
  sampleScale?: number
  selectedChipIndex: number
  rejectionCounts: PartColorSampleRejectionCounts
  rejectedPixelCount: number
  stability: number
  status: PartColorSampleStatus
  variance: number
}

export interface PartColorHighResolutionSampleInput {
  page: PartColorPageImage
  scaleX: number
  scaleY: number
}

export interface PartColorSampleInput {
  background?: RgbColor
  excludedRegions?: readonly PartColorRegion[]
  highResolution?: PartColorHighResolutionSampleInput
  page: PartColorPageImage
  partImage: PartColorImage
}

export type LegoColorRarityTier = "common" | "rare" | "special" | "uncommon"
export type DetectedPartColorStatus = "exact" | "family" | "review"
export type PartColorNameSource =
  | "family-only"
  | "palette-match"
  | "prototype-match"
  | "unknown"

export interface FallbackLegoColor {
  family: string
  hex: string
  name: string
  rarityTier: LegoColorRarityTier
  rgb: RgbColor
}

export interface DetectedFallbackColor extends FallbackLegoColor {
  alternatives: string[]
  confidence: number
  distance: number
  observedHex: string
  observedRgb: RgbColor
  status: DetectedPartColorStatus
  swatchHex: string
}

export interface DetectedPartColor extends DetectedFallbackColor {
  manualClassConfidence: number
  manualClassHex: string
  manualClassId: string
  manualClassMergeReason?: "raw" | "same-name"
  manualClassRgb: RgbColor
  manualClassSourceIds?: string[]
  manualClassTrusted: boolean
  nameSource: PartColorNameSource
  rawManualClassConfidence?: number
  rawManualClassHex?: string
  rawManualClassId?: string
  rawManualClassRgb?: RgbColor
  ruleCanonicalClassId?: string
  ruleCandidateNames?: string[]
  ruleCandidateScores?: Array<{
    name: string
    score: number
  }>
  ruleAnchorNames?: string[]
  ruleId?: string
  ruleMergeReason?: "raw" | "same-name"
  ruleScoreMargin?: number
  ruleScoreTop?: number
  ruleResolverKind?: string
  ruleSourceRawClassId?: string
  sampleEdgeChips?: PartColorSampleChip[]
  sampleBaseChips?: PartColorSampleChip[]
  sampleBaseDominantCoverage?: number
  sampleBaseEdgeChips?: PartColorSampleChip[]
  sampleBasePixelCount?: number
  sampleBaseRejectedPixelCount?: number
  sampleBaseRejectionCounts?: PartColorSampleRejectionCounts
  sampleBaseStatus?: PartColorSampleStatus
  sampleBaseVariance?: number
  sampleChips?: PartColorSampleChip[]
  sampleRejectionCounts?: PartColorSampleRejectionCounts
  sampleResampleReason?: string
  sampleScale?: number
  sampleStatus?: PartColorSampleStatus
}

export type DetectedLegoPartColor = DetectedPartColor

export interface PartColorCalibrationInput {
  id: string
  sample: PartColorSample | null | undefined
  sortKey?: string
}

export interface ManualPartColorClass {
  confidence: number
  distance?: number
  family?: string
  hex: string
  id: string
  mergeReason?: "raw" | "same-name"
  name?: string
  nameSource: PartColorNameSource
  nearestPaletteNames?: string[]
  pixelCount: number
  quantityCount?: number
  rawClassIds?: string[]
  rgb: RgbColor
  rowCount: number
  status: DetectedPartColorStatus
  swatchHex?: string
  trusted: boolean
}

export interface PartColorCalibrationResult {
  classes: ManualPartColorClass[]
  colorsByPartId: Map<string, DetectedPartColor>
  rawClasses?: ManualPartColorClass[]
  skippedPartIds: string[]
}
