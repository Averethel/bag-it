import type { GlyphComponent } from "./glyph-mask"
import type {
  DigitFeatures,
  DigitRowProfile,
  SourceDigitFeatures,
} from "./quantity-ocr-types"

export function normalizeGlyph(glyph: GlyphComponent, width: number, height: number): boolean[] {
  return Array.from({ length: width * height }, (_, index) => {
    const targetX = index % width
    const targetY = Math.floor(index / width)
    const minX = glyph.region.x + Math.floor((targetX / width) * glyph.region.width)
    const maxX = glyph.region.x + Math.ceil(((targetX + 1) / width) * glyph.region.width)
    const minY = glyph.region.y + Math.floor((targetY / height) * glyph.region.height)
    const maxY = glyph.region.y + Math.ceil(((targetY + 1) / height) * glyph.region.height)

    return glyph.pixels.some((pixel) =>
      pixel.x >= minX && pixel.x < maxX && pixel.y >= minY && pixel.y < maxY,
    )
  })
}

export function readFeatures(cells: readonly boolean[]): DigitFeatures {
  return {
    bottom: areaDensity(cells, 0, 5, 5, 2),
    center: areaDensity(cells, 2, 2, 1, 3),
    lowerLeft: areaDensity(cells, 0, 4, 2, 2),
    lowerRight: areaDensity(cells, 3, 4, 2, 2),
    middle: areaDensity(cells, 0, 3, 5, 1),
    top: areaDensity(cells, 0, 0, 5, 2),
    upperLeft: areaDensity(cells, 0, 1, 2, 2),
    upperRight: areaDensity(cells, 3, 1, 2, 2),
  }
}

export function readSourceFeatures(glyph: GlyphComponent): SourceDigitFeatures {
  const rows = Array.from({ length: glyph.region.height }, (_value, y) => ({
    centerX: 0,
    count: 0,
    density: 0,
    maxX: Number.NEGATIVE_INFINITY,
    minX: Number.POSITIVE_INFINITY,
    y,
  }))

  for (const pixel of glyph.pixels) {
    const row = rows[pixel.y - glyph.region.y]
    const x = pixel.x - glyph.region.x

    row.count += 1
    row.minX = Math.min(row.minX, x)
    row.maxX = Math.max(row.maxX, x)
  }

  return {
    height: glyph.region.height,
    rows: rows.map((row) => ({
      ...row,
      centerX: row.count === 0 ? 0 : (row.minX + row.maxX) / 2,
      density: row.count / Math.max(1, glyph.region.width),
      maxX: row.count === 0 ? -1 : row.maxX,
      minX: row.count === 0 ? glyph.region.width : row.minX,
    })),
    width: glyph.region.width,
  }
}

export function countDenseRowsInBand(
  features: SourceDigitFeatures,
  startRatio: number,
  endRatio: number,
  densityMin: number,
): number {
  return rowsInBand(features, startRatio, endRatio)
    .filter((row) => row.density >= densityMin).length
}

export function countLeftEdgeRows(
  features: SourceDigitFeatures,
  startRatio: number,
  endRatio: number,
): number {
  const edgeMax = Math.max(1, features.width * 0.26)

  return rowsInBand(features, startRatio, endRatio)
    .filter((row) => row.count > 0 && row.minX <= edgeMax).length
}

export function countRightEdgeRows(
  features: SourceDigitFeatures,
  startRatio: number,
  endRatio: number,
): number {
  const edgeMin = features.width - Math.max(2, features.width * 0.26)

  return rowsInBand(features, startRatio, endRatio)
    .filter((row) => row.count > 0 && row.maxX >= edgeMin).length
}

export function countNearRightEdgeRows(
  features: SourceDigitFeatures,
  startRatio: number,
  endRatio: number,
  insetRatio: number,
): number {
  const edgeMin = features.width - Math.max(2, features.width * insetRatio)

  return rowsInBand(features, startRatio, endRatio)
    .filter((row) => row.count > 0 && row.maxX >= edgeMin).length
}

export function countMissingLeftEdgeRows(
  features: SourceDigitFeatures,
  startRatio: number,
  endRatio: number,
): number {
  const edgeMax = Math.max(1, features.width * 0.26)

  return rowsInBand(features, startRatio, endRatio)
    .filter((row) => row.count > 0 && row.minX > edgeMax).length
}

export function countMissingRightEdgeRows(
  features: SourceDigitFeatures,
  startRatio: number,
  endRatio: number,
): number {
  const edgeMin = features.width - Math.max(2, features.width * 0.26)

  return rowsInBand(features, startRatio, endRatio)
    .filter((row) => row.count > 0 && row.maxX < edgeMin).length
}

export function averageRowCenter(
  features: SourceDigitFeatures,
  startRatio: number,
  endRatio: number,
): number | null {
  const rows = rowsInBand(features, startRatio, endRatio)
    .filter((row) => row.count > 0)

  if (rows.length === 0) {
    return null
  }

  return rows.reduce((sum, row) => sum + row.centerX, 0) / rows.length
}

export function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
}

function rowsInBand(
  features: SourceDigitFeatures,
  startRatio: number,
  endRatio: number,
): DigitRowProfile[] {
  return features.rows.filter((row) => {
    const rowRatio = (row.y + 0.5) / Math.max(1, features.height)

    return rowRatio >= startRatio && rowRatio <= endRatio
  })
}

function areaDensity(
  cells: readonly boolean[],
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  let total = 0
  let hits = 0

  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      total += 1
      hits += cells[row * 5 + column] ? 1 : 0
    }
  }

  return total === 0 ? 0 : hits / total
}
