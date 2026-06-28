import type { GlyphComponent } from "./glyph-mask"
import {
  normalizeGlyph,
  readFeatures,
  readSourceFeatures,
} from "./quantity-ocr-features"
import { DIGIT_FEATURE_CLASSIFIERS } from "./quantity-ocr-feature-classifiers"
import { SOURCE_DIGIT_FEATURE_CLASSIFIERS } from "./quantity-ocr-source-classifiers"
import { classifyByTemplate } from "./quantity-ocr-template-classifier"
import type {
  DigitClassifierRead,
  DigitFeatures,
  SourceDigitFeatures,
} from "./quantity-ocr-types"

export function classifyDigit(
  glyph: GlyphComponent,
): DigitClassifierRead | null {
  const normalized = normalizeGlyph(glyph, 5, 7)
  const features = readFeatures(normalized)
  const sourceFeatures = readSourceFeatures(glyph)
  const sourceDigit = classifyBySourceFeatures(glyph, features, sourceFeatures)

  if (sourceDigit) {
    return sourceDigit
  }

  const bestTemplateDigit = classifyByTemplate(normalized)

  if (bestTemplateDigit && bestTemplateDigit.confidence >= 0.82) {
    return bestTemplateDigit
  }

  const featureDigit = classifyByFeatures(glyph, features, sourceFeatures)

  if (featureDigit) {
    return featureDigit
  }

  return bestTemplateDigit && bestTemplateDigit.confidence >= 0.48 ? bestTemplateDigit : null
}

function classifyBySourceFeatures(
  glyph: GlyphComponent,
  features: DigitFeatures,
  sourceFeatures: SourceDigitFeatures,
): DigitClassifierRead | null {
  const aspect = glyph.region.width / Math.max(1, glyph.region.height)

  for (const classifier of SOURCE_DIGIT_FEATURE_CLASSIFIERS) {
    const read = classifier(glyph, features, sourceFeatures, aspect)

    if (read) {
      return read
    }
  }

  return null
}

function classifyByFeatures(
  glyph: GlyphComponent,
  features: DigitFeatures,
  sourceFeatures: SourceDigitFeatures,
): DigitClassifierRead | null {
  const aspect = glyph.region.width / Math.max(1, glyph.region.height)

  for (const classifier of DIGIT_FEATURE_CLASSIFIERS) {
    const read = classifier(glyph, features, sourceFeatures, aspect)

    if (read) {
      return read
    }
  }

  return null
}
