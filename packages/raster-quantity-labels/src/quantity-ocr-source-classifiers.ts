import type { GlyphComponent } from "./glyph-mask"
import {
  averageRowCenter,
  countDenseRowsInBand,
  countLeftEdgeRows,
  countMissingLeftEdgeRows,
  countMissingRightEdgeRows,
  countNearRightEdgeRows,
  countRightEdgeRows,
} from "./quantity-ocr-features"
import type {
  DigitClassifierRead,
  DigitFeatureClassifier,
  DigitFeatures,
  SourceDigitFeatures,
} from "./quantity-ocr-types"

export const SOURCE_DIGIT_FEATURE_CLASSIFIERS: readonly DigitFeatureClassifier[] = [
  classifyCompactNarrowOne,
  classifySlantedOne,
  classifyNarrowOneWithBase,
  classifySevenBySource,
  classifyTopBarSevenBySource,
  classifyTwoBySource,
  classifyCrossedTwoBySource,
  classifyFourBySource,
  classifyFiveBySource,
  classifySixBySource,
  classifyThreeBySource,
  classifyEightBySource,
  classifyNineBySource,
]

function classifyCompactNarrowOne(
  glyph: GlyphComponent,
  _features: DigitFeatures,
  sourceFeatures: SourceDigitFeatures,
  aspect: number,
): DigitClassifierRead | null {
  return glyph.region.width <= 4 &&
    glyph.region.height >= 7 &&
    aspect <= 0.5 &&
    countDenseRowsInBand(sourceFeatures, 0, 0.72, 0.76) <= Math.max(1, glyph.region.height * 0.12) &&
    countDenseRowsInBand(sourceFeatures, 0.76, 1, 0.52) <= Math.max(2, glyph.region.height * 0.22)
    ? { confidence: 0.83, digit: "1" }
    : null
}

function classifySlantedOne(
  glyph: GlyphComponent,
  features: DigitFeatures,
  sourceFeatures: SourceDigitFeatures,
  aspect: number,
): DigitClassifierRead | null {
  return glyph.region.width <= 24 &&
    aspect <= 0.5 &&
    features.center <= 0.45 &&
    countRightEdgeRows(sourceFeatures, 0.28, 1) >= Math.max(7, glyph.region.height * 0.58) &&
    countLeftEdgeRows(sourceFeatures, 0.48, 1) <= 2 &&
    countDenseRowsInBand(sourceFeatures, 0.78, 1, 0.72) === 0
    ? { confidence: 0.82, digit: "1" }
    : null
}

function classifyNarrowOneWithBase(
  glyph: GlyphComponent,
  _features: DigitFeatures,
  sourceFeatures: SourceDigitFeatures,
  aspect: number,
): DigitClassifierRead | null {
  return glyph.region.width <= 30 &&
    aspect <= 0.78 &&
    countDenseRowsInBand(sourceFeatures, 0.76, 1, 0.52) >= 1 &&
    countDenseRowsInBand(sourceFeatures, 0.24, 0.72, 0.52) <= Math.max(1, glyph.region.height * 0.08) &&
    countMissingLeftEdgeRows(sourceFeatures, 0.22, 0.74) >= Math.max(4, glyph.region.height * 0.42) &&
    countMissingRightEdgeRows(sourceFeatures, 0.22, 0.74) >= Math.max(4, glyph.region.height * 0.42)
    ? { confidence: 0.84, digit: "1" }
    : null
}

function classifySevenBySource(
  glyph: GlyphComponent,
  _features: DigitFeatures,
  sourceFeatures: SourceDigitFeatures,
  aspect: number,
): DigitClassifierRead | null {
  const upperCenter = averageRowCenter(sourceFeatures, 0.18, 0.46)
  const lowerCenter = averageRowCenter(sourceFeatures, 0.52, 0.92)

  return aspect >= 0.42 &&
    aspect <= 1.05 &&
    upperCenter !== null &&
    lowerCenter !== null &&
    upperCenter - lowerCenter >= glyph.region.width * 0.14 &&
    countDenseRowsInBand(sourceFeatures, 0, 0.24, 0.58) >= 1 &&
    countDenseRowsInBand(sourceFeatures, 0.78, 1, 0.58) === 0 &&
    countNearRightEdgeRows(sourceFeatures, 0.12, 0.5, 0.34) >= Math.max(2, glyph.region.height * 0.1) &&
    countLeftEdgeRows(sourceFeatures, 0.58, 1) >= Math.max(1, glyph.region.height * 0.08)
    ? { confidence: 0.82, digit: "7" }
    : null
}

function classifyTopBarSevenBySource(
  glyph: GlyphComponent,
  _features: DigitFeatures,
  sourceFeatures: SourceDigitFeatures,
  aspect: number,
): DigitClassifierRead | null {
  const upperCenter = averageRowCenter(sourceFeatures, 0, 0.34)
  const lowerCenter = averageRowCenter(sourceFeatures, 0.48, 0.94)

  return aspect >= 0.42 &&
    aspect <= 1.1 &&
    upperCenter !== null &&
    lowerCenter !== null &&
    upperCenter - lowerCenter >= glyph.region.width * 0.12 &&
    countDenseRowsInBand(sourceFeatures, 0, 0.24, 0.58) >= 1 &&
    countDenseRowsInBand(sourceFeatures, 0.78, 1, 0.62) === 0 &&
    countNearRightEdgeRows(sourceFeatures, 0.12, 0.5, 0.34) >= Math.max(2, glyph.region.height * 0.1) &&
    countRightEdgeRows(sourceFeatures, 0.56, 1) <= Math.max(2, glyph.region.height * 0.22) &&
    countLeftEdgeRows(sourceFeatures, 0, 0.38) <= Math.max(2, glyph.region.height * 0.22)
    ? { confidence: 0.83, digit: "7" }
    : null
}

function classifyTwoBySource(
  glyph: GlyphComponent,
  _features: DigitFeatures,
  sourceFeatures: SourceDigitFeatures,
  aspect: number,
): DigitClassifierRead | null {
  const upperCenter = averageRowCenter(sourceFeatures, 0.34, 0.52)
  const lowerCenter = averageRowCenter(sourceFeatures, 0.62, 0.86)

  return aspect >= 0.42 &&
    aspect <= 0.95 &&
    upperCenter !== null &&
    lowerCenter !== null &&
    upperCenter - lowerCenter >= glyph.region.width * 0.22 &&
    countDenseRowsInBand(sourceFeatures, 0, 0.22, 0.62) >= 1 &&
    countDenseRowsInBand(sourceFeatures, 0.78, 1, 0.62) >= 1 &&
    countRightEdgeRows(sourceFeatures, 0.24, 0.52) >= 2 &&
    countLeftEdgeRows(sourceFeatures, 0.62, 0.9) >= 2
    ? { confidence: 0.82, digit: "2" }
    : null
}

function classifyCrossedTwoBySource(
  glyph: GlyphComponent,
  _features: DigitFeatures,
  sourceFeatures: SourceDigitFeatures,
  aspect: number,
): DigitClassifierRead | null {
  const upperCenter = averageRowCenter(sourceFeatures, 0.18, 0.42)
  const tailCenter = averageRowCenter(sourceFeatures, 0.82, 1)

  return aspect >= 0.55 &&
    aspect <= 1.05 &&
    upperCenter !== null &&
    tailCenter !== null &&
    upperCenter - tailCenter >= glyph.region.width * 0.25 &&
    countDenseRowsInBand(sourceFeatures, 0, 0.3, 0.46) >= Math.max(2, glyph.region.height * 0.08) &&
    countDenseRowsInBand(sourceFeatures, 0.64, 0.84, 0.72) >= 1 &&
    countNearRightEdgeRows(sourceFeatures, 0.22, 0.54, 0.34) >= Math.max(2, glyph.region.height * 0.1) &&
    countLeftEdgeRows(sourceFeatures, 0.82, 1) >= Math.max(2, glyph.region.height * 0.12) &&
    countRightEdgeRows(sourceFeatures, 0.84, 1) <= 1
    ? { confidence: 0.82, digit: "2" }
    : null
}

function classifyFourBySource(
  glyph: GlyphComponent,
  _features: DigitFeatures,
  sourceFeatures: SourceDigitFeatures,
  aspect: number,
): DigitClassifierRead | null {
  return aspect >= 0.42 &&
    aspect <= 0.95 &&
    countDenseRowsInBand(sourceFeatures, 0, 0.24, 0.62) === 0 &&
    countDenseRowsInBand(sourceFeatures, 0.52, 0.82, 0.72) >= 1 &&
    countDenseRowsInBand(sourceFeatures, 0.84, 1, 0.62) === 0 &&
    countRightEdgeRows(sourceFeatures, 0, 1) >= Math.max(5, glyph.region.height * 0.64) &&
    countLeftEdgeRows(sourceFeatures, 0.24, 0.72) >= Math.max(2, glyph.region.height * 0.2) &&
    countMissingLeftEdgeRows(sourceFeatures, 0.78, 1) >= Math.max(2, glyph.region.height * 0.18)
    ? { confidence: 0.83, digit: "4" }
    : null
}

function classifyFiveBySource(
  glyph: GlyphComponent,
  _features: DigitFeatures,
  sourceFeatures: SourceDigitFeatures,
  aspect: number,
): DigitClassifierRead | null {
  const upperCenter = averageRowCenter(sourceFeatures, 0.16, 0.48)
  const lowerCenter = averageRowCenter(sourceFeatures, 0.52, 0.9)

  return aspect >= 0.42 &&
    aspect <= 1.05 &&
    upperCenter !== null &&
    lowerCenter !== null &&
    lowerCenter - upperCenter >= glyph.region.width * 0.2 &&
    countDenseRowsInBand(sourceFeatures, 0, 0.24, 0.56) >= 1 &&
    countDenseRowsInBand(sourceFeatures, 0.32, 0.62, 0.56) >= 1 &&
    countDenseRowsInBand(sourceFeatures, 0.76, 1, 0.56) >= 1 &&
    countLeftEdgeRows(sourceFeatures, 0.16, 0.48) >= Math.max(2, glyph.region.height * 0.16) &&
    countMissingRightEdgeRows(sourceFeatures, 0.18, 0.48) >= 1 &&
    countRightEdgeRows(sourceFeatures, 0.5, 0.9) >= Math.max(3, glyph.region.height * 0.24) &&
    countMissingLeftEdgeRows(sourceFeatures, 0.5, 0.9) >= Math.max(2, glyph.region.height * 0.08)
    ? { confidence: 0.83, digit: "5" }
    : null
}

function classifySixBySource(
  glyph: GlyphComponent,
  _features: DigitFeatures,
  sourceFeatures: SourceDigitFeatures,
  aspect: number,
): DigitClassifierRead | null {
  return aspect >= 0.42 &&
    aspect <= 0.95 &&
    countDenseRowsInBand(sourceFeatures, 0, 0.22, 0.62) >= 1 &&
    countDenseRowsInBand(sourceFeatures, 0.72, 1, 0.62) >= 1 &&
    countDenseRowsInBand(sourceFeatures, 0.34, 0.6, 0.62) >= 1 &&
    countLeftEdgeRows(sourceFeatures, 0.24, 0.78) >= Math.max(5, glyph.region.height * 0.34) &&
    countRightEdgeRows(sourceFeatures, 0.54, 0.84) >= 3 &&
    countMissingRightEdgeRows(sourceFeatures, 0.22, 0.42) >= 1
    ? { confidence: 0.82, digit: "6" }
    : null
}

function classifyThreeBySource(
  glyph: GlyphComponent,
  _features: DigitFeatures,
  sourceFeatures: SourceDigitFeatures,
  aspect: number,
): DigitClassifierRead | null {
  return aspect >= 0.42 &&
    aspect <= 1 &&
    countDenseRowsInBand(sourceFeatures, 0, 0.22, 0.58) >= 1 &&
    countDenseRowsInBand(sourceFeatures, 0.75, 1, 0.58) >= 1 &&
    countRightEdgeRows(sourceFeatures, 0.24, 0.86) >= Math.max(5, glyph.region.height * 0.36) &&
    countMissingLeftEdgeRows(sourceFeatures, 0.28, 0.68) >= Math.max(3, glyph.region.height * 0.24) &&
    countLeftEdgeRows(sourceFeatures, 0.28, 0.68) <= Math.max(3, glyph.region.height * 0.26)
    ? { confidence: 0.8, digit: "3" }
    : null
}

function classifyEightBySource(
  glyph: GlyphComponent,
  _features: DigitFeatures,
  sourceFeatures: SourceDigitFeatures,
  aspect: number,
): DigitClassifierRead | null {
  return aspect >= 0.42 &&
    aspect <= 1.05 &&
    countDenseRowsInBand(sourceFeatures, 0, 0.26, 0.56) >= 1 &&
    countDenseRowsInBand(sourceFeatures, 0.34, 0.62, 0.56) >= 1 &&
    countDenseRowsInBand(sourceFeatures, 0.62, 1, 0.56) >= 1 &&
    countLeftEdgeRows(sourceFeatures, 0.16, 0.5) >= Math.max(2, glyph.region.height * 0.16) &&
    countMissingRightEdgeRows(sourceFeatures, 0.22, 0.42) === 0 &&
    countLeftEdgeRows(sourceFeatures, 0.54, 0.96) >= Math.max(3, Math.round(glyph.region.height * 0.24)) &&
    countRightEdgeRows(sourceFeatures, 0.54, 0.96) >= Math.max(1, Math.round(glyph.region.height * 0.1)) &&
    countMissingLeftEdgeRows(sourceFeatures, 0.62, 0.78) === 0 &&
    countMissingLeftEdgeRows(sourceFeatures, 0.78, 1) <= readRoundedLoopEdgeMissLimit(glyph)
    ? { confidence: 0.84, digit: "8" }
    : null
}

function classifyNineBySource(
  glyph: GlyphComponent,
  _features: DigitFeatures,
  sourceFeatures: SourceDigitFeatures,
  aspect: number,
): DigitClassifierRead | null {
  const upperLeftRows = countLeftEdgeRows(sourceFeatures, 0.16, 0.5)

  return aspect >= 0.42 &&
    aspect <= 1.05 &&
    countDenseRowsInBand(sourceFeatures, 0, 0.26, 0.56) >= 1 &&
    countDenseRowsInBand(sourceFeatures, 0.34, 0.62, 0.56) >= 1 &&
    countRightEdgeRows(sourceFeatures, 0.16, 0.9) >= Math.max(5, glyph.region.height * 0.44) &&
    countRightEdgeRows(sourceFeatures, 0.16, 0.5) >= Math.max(2, glyph.region.height * 0.18) &&
    upperLeftRows >= Math.max(2, glyph.region.height * 0.16) &&
    countMissingRightEdgeRows(sourceFeatures, 0.78, 1) >= 1
    ? { confidence: 0.83, digit: "9" }
    : null
}

function readRoundedLoopEdgeMissLimit(glyph: GlyphComponent): number {
  return Math.max(1, Math.floor(glyph.region.height * 0.04))
}
