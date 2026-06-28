import type { GlyphComponent } from "./glyph-mask"
import type {
  DigitClassifierRead,
  DigitFeatureClassifier,
  DigitFeatures,
  SourceDigitFeatures,
} from "./quantity-ocr-types"

export const DIGIT_FEATURE_CLASSIFIERS: readonly DigitFeatureClassifier[] = [
  classifyNarrowOne,
  classifyTallOne,
  classifyZero,
  classifyTwo,
  classifyThree,
  classifyFour,
  classifyFive,
  classifySix,
  classifySeven,
  classifyEight,
  classifyNine,
]

function classifyNarrowOne(
  glyph: GlyphComponent,
): DigitClassifierRead | null {
  return glyph.region.width <= 3 && glyph.region.height >= 5
    ? { confidence: 0.84, digit: "1" }
    : null
}

function classifyTallOne(
  _glyph: GlyphComponent,
  features: DigitFeatures,
  _sourceFeatures: SourceDigitFeatures,
  aspect: number,
): DigitClassifierRead | null {
  return aspect <= 0.72 &&
    features.center >= 0.32 &&
    features.lowerLeft <= 0.22 &&
    features.lowerRight >= 0.28 &&
    features.middle <= 0.7
    ? { confidence: 0.8, digit: "1" }
    : null
}

function classifyZero(
  _glyph: GlyphComponent,
  features: DigitFeatures,
): DigitClassifierRead | null {
  return features.top >= 0.3 &&
    features.bottom >= 0.3 &&
    Math.min(features.upperLeft, features.upperRight, features.lowerLeft, features.lowerRight) > 0.18 &&
    features.center < 0.22
    ? { confidence: 0.78, digit: "0" }
    : null
}

function classifyTwo(
  _glyph: GlyphComponent,
  features: DigitFeatures,
  _sourceFeatures: SourceDigitFeatures,
  aspect: number,
): DigitClassifierRead | null {
  return aspect >= 0.45 &&
    features.top >= 0.34 &&
    features.middle >= 0.16 &&
    features.bottom >= 0.42 &&
    features.lowerLeft > features.lowerRight + 0.08
    ? { confidence: 0.78, digit: "2" }
    : null
}

function classifyThree(
  _glyph: GlyphComponent,
  features: DigitFeatures,
  _sourceFeatures: SourceDigitFeatures,
  aspect: number,
): DigitClassifierRead | null {
  return aspect >= 0.45 &&
    features.top >= 0.34 &&
    features.middle >= 0.18 &&
    features.bottom >= 0.34 &&
    features.upperRight > features.upperLeft + 0.1 &&
    features.lowerRight > features.lowerLeft + 0.1
    ? { confidence: 0.77, digit: "3" }
    : null
}

function classifyFour(
  _glyph: GlyphComponent,
  features: DigitFeatures,
): DigitClassifierRead | null {
  return features.middle > 0.32 &&
    features.upperRight > 0.12 &&
    features.lowerRight > 0.12 &&
    features.bottom < 0.72 &&
    (features.upperLeft > 0.05 || features.lowerLeft > 0.05)
    ? { confidence: 0.8, digit: "4" }
    : null
}

function classifyFive(
  _glyph: GlyphComponent,
  features: DigitFeatures,
): DigitClassifierRead | null {
  return features.top >= 0.34 &&
    features.middle >= 0.22 &&
    features.bottom >= 0.34 &&
    features.upperLeft > features.upperRight + 0.1 &&
    features.lowerRight > features.lowerLeft + 0.06
    ? { confidence: 0.76, digit: "5" }
    : null
}

function classifySix(
  _glyph: GlyphComponent,
  features: DigitFeatures,
): DigitClassifierRead | null {
  return features.top >= 0.26 &&
    features.middle >= 0.32 &&
    features.bottom >= 0.32 &&
    features.upperLeft > features.upperRight + 0.12 &&
    features.lowerLeft >= features.lowerRight - 0.08
    ? { confidence: 0.78, digit: "6" }
    : null
}

function classifySeven(
  _glyph: GlyphComponent,
  features: DigitFeatures,
): DigitClassifierRead | null {
  return features.top > 0.36 &&
    features.bottom < 0.32 &&
    features.upperRight > 0.24 &&
    features.center > 0.2
    ? { confidence: 0.74, digit: "7" }
    : null
}

function classifyEight(
  _glyph: GlyphComponent,
  features: DigitFeatures,
): DigitClassifierRead | null {
  return features.top >= 0.32 &&
    features.middle >= 0.32 &&
    features.bottom >= 0.32 &&
    Math.min(features.upperLeft, features.upperRight, features.lowerLeft, features.lowerRight) > 0.2
    ? { confidence: 0.76, digit: "8" }
    : null
}

function classifyNine(
  _glyph: GlyphComponent,
  features: DigitFeatures,
): DigitClassifierRead | null {
  return features.top >= 0.36 &&
    features.middle >= 0.36 &&
    features.upperLeft > 0.24 &&
    features.upperRight > 0.24 &&
    features.lowerRight > 0.24 &&
    features.upperLeft > features.lowerLeft + 0.06
    ? { confidence: 0.76, digit: "9" }
    : null
}
