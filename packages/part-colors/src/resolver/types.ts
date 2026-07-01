import type {
  DetectedPartColor,
  ManualPartColorClass,
  PartColorCalibrationInput,
  PartColorSample,
  PartColorSampleChip,
  RgbColor,
} from "../contracts"
import type { LabColor, LchColor } from "../color-space"

export type ResolverColorFamily =
  | "cool"
  | "fallback"
  | "neutral"
  | "tan-gold"
  | "warm"

export type SampleQualityStatus = "review" | "unknown" | "usable"

export type SampleQualityIssue =
  | "edge-polluted"
  | "low-dominance"
  | "low-stability"
  | "missing-sample"
  | "tiny-mask"
  | "unknown-sample"

export interface SampleQuality {
  confidence: number
  issues: SampleQualityIssue[]
  status: SampleQualityStatus
}

export interface PartColorFeature {
  family: ResolverColorFamily
  hex: string
  id: string
  lab: LabColor
  lch: LchColor
  pixelCount: number
  quality: SampleQuality
  rgb: RgbColor
  sample: PartColorSample
  topChips: PartColorSampleChip[]
}

export interface ResolverManualClass extends ManualPartColorClass {
  distance: number
  family: string
  name: string
  nearestPaletteNames: string[]
  quantityCount: number
  swatchHex: string
}

export interface ResolverClassAssignment {
  color: DetectedPartColor
  feature: PartColorFeature
  manualClass: ResolverManualClass
}

export interface ResolverLabel {
  cropHash?: string
  expectedName: string
  id?: string
  itemId?: string
  note?: string
  role?: ResolverLabelRole
  status?: ResolverLabelStatus
}

export type ResolverLabelRole = "active" | "excluded" | "gate" | "holdout" | "train"
export type ResolverLabelStatus = "active" | "excluded" | "gate"

export interface ResolverDataset {
  cropHashesByItemId?: ReadonlyMap<string, string>
  labels: ResolverLabel[]
  manualId?: string
  rows: PartColorCalibrationInput[]
}

export interface TrainingExample {
  expectedName: string
  feature: PartColorFeature
  label: ResolverLabel
}

export interface ColorPrototype {
  expectedName: string
  family: ResolverColorFamily
  id: string
  lab: LabColor
  rgb: RgbColor
  support: number
}

export interface PrototypeSet {
  prototypes: ColorPrototype[]
}

export interface EvaluationLabelResult {
  actualName?: string
  expectedName: string
  id: string
  matched: boolean
}

export interface EvaluationSummary {
  conflicts: number
  matched: number
  missing: number
  results: EvaluationLabelResult[]
  total: number
}
