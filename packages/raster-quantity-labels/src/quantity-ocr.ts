import type { CalloutPartPageInput } from "./contracts"
import { isLikelyXGlyph, type GlyphComponent } from "./glyph-mask"
import { readConnectedQuantity } from "./quantity-ocr-connected"
import {
  createQuantityRead,
  isDigitGlyphBeforeX,
  readDigit,
} from "./quantity-ocr-read"
import type { DigitRead, QuantityOcrRead } from "./quantity-ocr-types"

export type { QuantityOcrRead } from "./quantity-ocr-types"

export function readQuantityOcr(
  _page: CalloutPartPageInput,
  glyphs: readonly GlyphComponent[],
): QuantityOcrRead | null {
  return readSeparatedQuantity(glyphs) ?? readConnectedQuantity(glyphs)
}

function readSeparatedQuantity(
  glyphs: readonly GlyphComponent[],
): QuantityOcrRead | null {
  const terminalX = glyphs
    .filter((glyph) => isLikelyXGlyph(glyph))
    .filter((glyph) => glyphs.some((other) => isDigitGlyphBeforeX(other, glyph)))
    .sort((left, right) => right.region.x - left.region.x)[0]

  if (!terminalX) {
    return null
  }

  const digitReads = glyphs
    .filter((glyph) => isDigitGlyphBeforeX(glyph, terminalX))
    .map(readDigit)

  if (digitReads.some((read) => read === null)) {
    return null
  }

  return createQuantityRead(
    digitReads
      .filter((read): read is DigitRead => read !== null)
      .sort((left, right) => left.glyph.region.x - right.glyph.region.x),
  )
}
