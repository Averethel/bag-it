import type { GlyphComponent } from "./glyph-mask"
import { regionCenter } from "./regions"
import { classifyDigit } from "./quantity-ocr-digit-classifier"
import { average } from "./quantity-ocr-features"
import type { DigitRead, QuantityOcrRead } from "./quantity-ocr-types"

export function readDigit(glyph: GlyphComponent): DigitRead | null {
  const digit = classifyDigit(glyph)

  return digit ? { ...digit, glyph } : null
}

export function createQuantityRead(digits: readonly DigitRead[]): QuantityOcrRead | null {
  if (digits.length === 0) {
    return null
  }

  const digitText = digits.map((digit) => digit.digit).join("")
  const value = Number.parseInt(digitText, 10)

  if (!Number.isSafeInteger(value) || value <= 0) {
    return null
  }

  return {
    confidence: Math.min(0.94, (average(digits.map((digit) => digit.confidence)) + 0.82) / 2),
    text: `${digitText}x`,
    value,
  }
}

export function isDigitGlyphBeforeX(glyph: GlyphComponent, xGlyph: GlyphComponent): boolean {
  if (glyph === xGlyph || glyph.region.x >= xGlyph.region.x) {
    return false
  }

  const gap = xGlyph.region.x - (glyph.region.x + glyph.region.width)
  const centerGap = Math.abs(regionCenter(glyph.region).y - regionCenter(xGlyph.region).y)
  const heightRatio = glyph.region.height / Math.max(1, xGlyph.region.height)

  return (
    gap <= Math.max(16, xGlyph.region.height * 1.8) &&
    centerGap <= Math.max(8, xGlyph.region.height * 0.72) &&
    heightRatio >= 0.42 &&
    heightRatio <= 2.1
  )
}
