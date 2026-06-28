import type { Region } from "./contracts"
import type { GlyphComponent } from "./glyph-mask"
import { regionCenter, unionRegions } from "./regions"

export const CALLOUT_BORDER_INSET = 2

const MIN_READABLE_LABEL_PIXELS = 12
const MIN_LABEL_WIDTH_MAX = 32
const MAX_LABEL_AREA_RATIO = 0.07
const MAX_COMPACT_LOWER_LABEL_AREA_RATIO = 0.12
const COMPACT_LOWER_LABEL_MIN_VERTICAL_RATIO = 0.42
const COMPACT_LOWER_LABEL_MIN_HEIGHT_RATIO = 0.14
const MAX_LABEL_WIDTH_TO_HEIGHT_RATIO = 1.7

export interface QuantityLabelShapeOptions {
  minVerticalRatio?: number
}

export function isCandidateShape(
  calloutRegion: Region,
  labelRegion: Region,
  digitCount: number,
  options: QuantityLabelShapeOptions = {},
): boolean {
  const labelCenter = regionCenter(labelRegion)
  const verticalRatio = (labelCenter.y - calloutRegion.y) / Math.max(1, calloutRegion.height)
  const labelArea = labelRegion.width * labelRegion.height
  const calloutArea = calloutRegion.width * calloutRegion.height
  const minVerticalRatio = options.minVerticalRatio ?? 0.18

  return (
    digitCount >= 1 &&
    labelRegion.height >= 5 &&
    labelRegion.width >= 6 &&
    verticalRatio >= minVerticalRatio &&
    labelArea <= Math.max(460, calloutArea * readMaxLabelAreaRatio(calloutRegion, labelRegion, verticalRatio)) &&
    labelRegion.width <= readMaxLabelWidth(calloutRegion, labelRegion, digitCount)
  )
}

export function hasReadableLabelInk(glyphs: readonly GlyphComponent[]): boolean {
  if (glyphs.length === 0) {
    return false
  }

  const region = unionRegions(glyphs.map((glyph) => glyph.region))
  const pixels = new Set<number>()

  for (const glyph of glyphs) {
    for (const pixel of glyph.pixels) {
      pixels.add((pixel.y - region.y) * region.width + pixel.x - region.x)
    }
  }

  return pixels.size >= MIN_READABLE_LABEL_PIXELS
}

export function isReadableConnectedCandidateShape(region: Region): boolean {
  return region.height >= 8 &&
    region.width >= 10 &&
    region.width * region.height >= 80
}

function readMaxLabelWidth(
  calloutRegion: Region,
  labelRegion: Region,
  digitCount: number,
): number {
  return Math.max(
    MIN_LABEL_WIDTH_MAX,
    calloutRegion.width * 0.22,
    Math.ceil(labelRegion.height * readMaxLabelAspect(digitCount)),
  )
}

function readMaxLabelAreaRatio(
  calloutRegion: Region,
  labelRegion: Region,
  verticalRatio: number,
): number {
  const heightRatio = labelRegion.height / Math.max(1, calloutRegion.height)

  return verticalRatio >= COMPACT_LOWER_LABEL_MIN_VERTICAL_RATIO &&
    heightRatio >= COMPACT_LOWER_LABEL_MIN_HEIGHT_RATIO
    ? MAX_COMPACT_LOWER_LABEL_AREA_RATIO
    : MAX_LABEL_AREA_RATIO
}

function readMaxLabelAspect(digitCount: number): number {
  return digitCount > 1
    ? Math.max(MAX_LABEL_WIDTH_TO_HEIGHT_RATIO, 1.15 + digitCount * 0.6)
    : MAX_LABEL_WIDTH_TO_HEIGHT_RATIO
}
