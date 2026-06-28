import type { CalloutPartPageInput, Region, RgbColor } from "./contracts"
import {
  createGlyphMask,
  findGlyphComponents,
  isLikelyXGlyph,
  isPlausibleGlyph,
  type GlyphComponent,
} from "./glyph-mask"
import { CALLOUT_BORDER_INSET } from "./quantity-label-shape"
import { readDigit } from "./quantity-ocr-read"
import { insetRegion, regionCenter, unionRegions } from "./regions"

const DEFAULT_MIN_VERTICAL_RATIO = 0.58
const GLYPH_ROW_CENTER_TOLERANCE = 6
const LABEL_GLYPH_AREA_MAX = 160
const LABEL_GLYPH_HEIGHT_MAX = 16
const LABEL_GLYPH_WIDTH_MAX = 18
const LABEL_ROW_GLYPH_COUNT_MAX = 8

export interface QuantityGlyphRow {
  glyphs: GlyphComponent[]
  region: Region
}

export interface QuantityGlyphRowOptions {
  minVerticalRatio?: number
}

export function findQuantityGlyphRows(
  page: CalloutPartPageInput,
  calloutRegion: Region,
  background: RgbColor,
  options: QuantityGlyphRowOptions = {},
): QuantityGlyphRow[] {
  const searchRegion = insetRegion(calloutRegion, CALLOUT_BORDER_INSET)
  const mask = createGlyphMask(page, searchRegion, background)
  const glyphs = findGlyphComponents(page, mask, searchRegion)
    .filter(isPlausibleGlyph)
    .filter((glyph) => isLowerCompactLabelGlyph(glyph, calloutRegion, options))
  const rows = clusterGlyphRows(glyphs)

  return rows
    .filter((row) => isQuantityLikeGlyphRow(row, calloutRegion))
    .map((glyphRow) => ({
      glyphs: glyphRow,
      region: unionRegions(glyphRow.map((glyph) => glyph.region)),
    }))
}

function isLowerCompactLabelGlyph(
  glyph: GlyphComponent,
  calloutRegion: Region,
  options: QuantityGlyphRowOptions,
): boolean {
  const center = regionCenter(glyph.region)
  const verticalRatio = (center.y - calloutRegion.y) / Math.max(1, calloutRegion.height)

  return (
    verticalRatio >= (options.minVerticalRatio ?? DEFAULT_MIN_VERTICAL_RATIO) &&
    glyph.area <= LABEL_GLYPH_AREA_MAX &&
    glyph.region.height <= LABEL_GLYPH_HEIGHT_MAX &&
    glyph.region.width <= LABEL_GLYPH_WIDTH_MAX
  )
}

function clusterGlyphRows(glyphs: readonly GlyphComponent[]): GlyphComponent[][] {
  const rows: GlyphComponent[][] = []

  for (const glyph of [...glyphs].sort((left, right) => regionCenter(left.region).y - regionCenter(right.region).y)) {
    const row = rows.find((candidate) => isSameGlyphRow(candidate, glyph))

    if (row) {
      row.push(glyph)
    } else {
      rows.push([glyph])
    }
  }

  return rows.map((row) => [...row].sort((left, right) => left.region.x - right.region.x))
}

function isSameGlyphRow(row: readonly GlyphComponent[], glyph: GlyphComponent): boolean {
  const centerY = regionCenter(glyph.region).y
  const rowCenterY = row.reduce((sum, rowGlyph) => sum + regionCenter(rowGlyph.region).y, 0) / row.length

  return Math.abs(centerY - rowCenterY) <= GLYPH_ROW_CENTER_TOLERANCE
}

function isQuantityLikeGlyphRow(row: readonly GlyphComponent[], calloutRegion: Region): boolean {
  if (isSingleLowerQuantityGlyphRow(row, calloutRegion)) {
    return true
  }

  if (
    row.length < 2 ||
    row.length > LABEL_ROW_GLYPH_COUNT_MAX ||
    !hasQuantityLikeXSupport(row)
  ) {
    return false
  }

  const region = unionRegions(row.map((glyph) => glyph.region))

  return region.width <= Math.max(80, calloutRegion.width * 0.6)
}

function isSingleLowerQuantityGlyphRow(row: readonly GlyphComponent[], calloutRegion: Region): boolean {
  if (row.length !== 1 || !readDigit(row[0])) {
    return false
  }

  const glyph = row[0]
  const center = regionCenter(glyph.region)
  const verticalRatio = (center.y - calloutRegion.y) / Math.max(1, calloutRegion.height)

  return (
    verticalRatio >= 0.75 &&
    glyph.region.height >= 6 &&
    glyph.region.height <= 10 &&
    glyph.region.width <= 12
  )
}

function hasQuantityLikeXSupport(row: readonly GlyphComponent[]): boolean {
  const xGlyphs = row.filter(isLikelyXGlyph)

  if (xGlyphs.length > 0) {
    return xGlyphs.some((xGlyph) =>
      hasTightPrecedingGlyph(row, xGlyph) ||
      row.filter((glyph) => !isLikelyXGlyph(glyph)).length >= 2
    )
  }

  return row.length >= 3 && row.filter((glyph) => readDigit(glyph)).length >= 2
}

function hasTightPrecedingGlyph(row: readonly GlyphComponent[], xGlyph: GlyphComponent): boolean {
  const maxGap = Math.max(4, Math.floor(xGlyph.region.height * 0.45))

  return row.some((glyph) => {
    if (glyph === xGlyph) {
      return false
    }

    const gap = xGlyph.region.x - (glyph.region.x + glyph.region.width)

    return gap >= 0 && gap <= maxGap
  })
}
