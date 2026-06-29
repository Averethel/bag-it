import type { QuantityRecoveryKind } from "@bag-it/raster-quantity-labels"

export const CALLOUT_PART_EXTRACTOR_VERSION = "2.0.0-alpha.169"

export interface Region {
  x: number
  y: number
  width: number
  height: number
}

export interface RgbColor {
  r: number
  g: number
  b: number
}

export interface CalloutPartPageInput {
  data: Uint8ClampedArray
  height: number
  pageNumber: number
  width: number
}

export interface CalloutPartCalloutInput {
  background?: RgbColor
  id: string
  pageNumber: number
  region: Region
}

export interface CalloutPartAlphaMask {
  data: Uint8ClampedArray
  height: number
  width: number
}

export interface CalloutPartImage {
  alphaMask: CalloutPartAlphaMask
  diagnostics?: CalloutPartImageDiagnostics
  imageDataUrl?: string
  region: Region
}

export interface CalloutPartImageDiagnostics {
  alphaBounds?: Region
  excludedLabelRegions: Region[]
  finalCropBounds?: Region
  imageRegionBeforeAlphaTrim?: Region
  ownedRegion?: Region
  rawForegroundBounds?: Region
  rawForegroundPixelCount: number
}

export interface CalloutQuantityLabel {
  confidence: number
  glyphs?: CalloutQuantityLabelGlyph[]
  imageDataUrl?: string
  recoveryKind?: QuantityRecoveryKind
  region: Region
  text: string
  value: number
}

export interface CalloutQuantityLabelGlyph {
  pixels: Array<{ x: number; y: number }>
  region: Region
}

export interface CalloutPartItem {
  calloutId: string
  confidence: number
  id: string
  indexOnCallout: number
  partImage: CalloutPartImage
  quantityLabel: CalloutQuantityLabel
  sourceRegion: Region
}

export interface CalloutPartCalloutResult {
  calloutId: string
  items: CalloutPartItem[]
  pageNumber: number
}

export interface CalloutPartExtractionResult {
  callouts: CalloutPartCalloutResult[]
  failures: CalloutPartFailureTaxonomy
  items: CalloutPartItem[]
  stageSnapshots: CalloutPartStageSnapshot[]
}

export type CalloutPartFailureKind =
  | "part-crop-missing"
  | "quantity-missing"
  | "quantity-wrong"
  | "part-crop-overlaps-label"
  | "part-crop-cuts-part"

export type CalloutPartFailureTaxonomy = Record<CalloutPartFailureKind, number>

export interface CalloutPartStageSnapshot {
  counts: {
    accepted: number
    rejected: number
    total: number
  }
  failures: CalloutPartFailureTaxonomy
  notes: string[]
  stageId: "quantity-labels" | "part-extraction"
}
