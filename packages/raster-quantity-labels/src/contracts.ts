import type { QuantityRecoveryKind } from "./quantity-candidate-types"

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

export interface RasterQuantityPageInput {
  data: Uint8ClampedArray
  height: number
  pageNumber: number
  width: number
}

export interface RasterQuantityLabel {
  confidence: number
  glyphs?: RasterQuantityLabelGlyph[]
  recoveryKind?: QuantityRecoveryKind
  region: Region
  text: string
  value: number
}

export interface RasterQuantityLabelGlyph {
  pixels: Array<{ x: number; y: number }>
  region: Region
}

export type RasterQuantityRecoveryKind = QuantityRecoveryKind

type LegacyPageInput = RasterQuantityPageInput
type LegacyQuantityLabel = RasterQuantityLabel
type LegacyQuantityLabelGlyph = RasterQuantityLabelGlyph

export type {
  LegacyPageInput as CalloutPartPageInput,
  LegacyQuantityLabel as CalloutQuantityLabel,
  LegacyQuantityLabelGlyph as CalloutQuantityLabelGlyph,
}
