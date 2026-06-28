import type { GlyphComponent } from "./glyph-mask"

export interface QuantityOcrRead {
  confidence: number
  text: string
  value: number
}

export interface DigitClassifierRead {
  confidence: number
  digit: string
}

export interface DigitRead extends DigitClassifierRead {
  glyph: GlyphComponent
}

export interface DigitFeatures {
  bottom: number
  center: number
  lowerLeft: number
  lowerRight: number
  middle: number
  top: number
  upperLeft: number
  upperRight: number
}

export interface SourceDigitFeatures {
  height: number
  rows: DigitRowProfile[]
  width: number
}

export interface DigitRowProfile {
  centerX: number
  count: number
  density: number
  maxX: number
  minX: number
  y: number
}

export type DigitFeatureClassifier = (
  glyph: GlyphComponent,
  features: DigitFeatures,
  sourceFeatures: SourceDigitFeatures,
  aspect: number,
) => DigitClassifierRead | null
