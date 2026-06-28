import { createGlyphFromPixels, isLikelyXGlyph, type GlyphComponent } from "./glyph-mask"
import {
  createQuantityRead,
  readDigit,
} from "./quantity-ocr-read"
import type { QuantityOcrRead } from "./quantity-ocr-types"

export function readConnectedQuantity(
  glyphs: readonly GlyphComponent[],
): QuantityOcrRead | null {
  return glyphs
    .filter((glyph) => glyph.region.width / Math.max(1, glyph.region.height) >= 1.15)
    .flatMap(readConnectedSplits)
    .sort((left, right) => right.confidence - left.confidence)[0] ?? null
}

function readConnectedSplits(
  glyph: GlyphComponent,
): QuantityOcrRead[] {
  const reads: QuantityOcrRead[] = []

  for (
    let splitX = glyph.region.x + 3;
    splitX <= glyph.region.x + glyph.region.width - 3;
    splitX += 1
  ) {
    const digitGlyph = createGlyphFromPixels(glyph.pixels.filter((pixel) => pixel.x < splitX))
    const xGlyph = createGlyphFromPixels(glyph.pixels.filter((pixel) => pixel.x >= splitX))

    if (!digitGlyph || !xGlyph || !isLikelyXGlyph(xGlyph)) {
      continue
    }

    const digit = readDigit(digitGlyph)

    if (digit) {
      const read = createQuantityRead([digit])

      if (read) {
        reads.push(read)
      }
    }
  }

  return reads
}
