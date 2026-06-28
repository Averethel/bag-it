import type { CalloutQuantityLabel, Region } from "./contracts"
import type { GlyphComponent } from "@bag-it/raster-quantity-labels"
import { compareRegions, intersectRegions, regionCenter, unionRegions } from "./regions"

export interface OwnershipZone {
  label: CalloutQuantityLabel
  region: Region
}

interface OwnershipZoneOptions {
  denseMode?: boolean
}

export function createPartOwnershipZones(
  labels: readonly CalloutQuantityLabel[],
  interior: Region,
  options: OwnershipZoneOptions = {},
): OwnershipZone[] {
  const rows = clusterLabelRows(labels, options)

  return rows.flatMap((row, rowIndex) => (
    options.denseMode
      ? createDenseRowZones(rows, rowIndex, interior)
      : createRowZones(rows, rowIndex, interior)
  ))
    .sort((left, right) => compareRegions(left.label.region, right.label.region))
}

export function isComponentOwnedByOtherLabel(
  component: GlyphComponent,
  owningLabel: Region,
  labelRegions: readonly Region[],
): boolean {
  const owningCenter = regionCenter(owningLabel)
  const componentAnchorX = readComponentOwnershipAnchorX(component, owningLabel)
  const sameRowLabels = labelRegions.filter((label) =>
    label !== owningLabel &&
    Math.abs(regionCenter(label).y - owningCenter.y) <= Math.max(9, owningLabel.height * 1.35),
  )

  if (sameRowLabels.length === 0) {
    return false
  }

  const ownDistance = Math.abs(componentAnchorX - owningCenter.x)
  const nearestOtherDistance = Math.min(...sameRowLabels.map((label) => Math.abs(componentAnchorX - regionCenter(label).x)))

  return nearestOtherDistance + Math.max(2, Math.round(owningLabel.width * 0.25)) < ownDistance
}

function clusterLabelRows(
  labels: readonly CalloutQuantityLabel[],
  options: OwnershipZoneOptions,
): CalloutQuantityLabel[][] {
  const rows: CalloutQuantityLabel[][] = []

  for (const label of [...labels].sort((left, right) => compareRegions(left.region, right.region))) {
    const row = rows.find((candidateRow) => isInRow(label, candidateRow, options))

    if (row) {
      row.push(label)
    } else {
      rows.push([label])
    }
  }

  return rows.map((row) => row.sort((left, right) => regionCenter(left.region).x - regionCenter(right.region).x))
}

function isInRow(
  label: CalloutQuantityLabel,
  row: readonly CalloutQuantityLabel[],
  options: OwnershipZoneOptions,
): boolean {
  if (options.denseMode) {
    return isInDenseRow(label, row)
  }

  const rowRegion = unionRegions(row.map((entry) => entry.region))
  const tolerance = Math.max(8, label.region.height + rowRegion.height)

  return Math.abs(regionCenter(label.region).y - regionCenter(rowRegion).y) <= tolerance ||
    (!options.denseMode && isTrailingStaggeredRowLabel(label, row, rowRegion))
}

function isInDenseRow(label: CalloutQuantityLabel, row: readonly CalloutQuantityLabel[]): boolean {
  const rowCenterY = row.reduce((sum, entry) => sum + regionCenter(entry.region).y, 0) / row.length
  const tolerance = Math.max(8, Math.round(label.region.height * 1.4))

  return Math.abs(regionCenter(label.region).y - rowCenterY) <= tolerance
}

function isTrailingStaggeredRowLabel(
  label: CalloutQuantityLabel,
  row: readonly CalloutQuantityLabel[],
  rowRegion: Region,
): boolean {
  const labelCenter = regionCenter(label.region)
  const rowRightCenter = Math.max(...row.map((entry) => regionCenter(entry.region).x))
  const rowBottom = rowRegion.y + rowRegion.height
  const verticalGap = label.region.y - rowBottom

  return labelCenter.x > rowRightCenter &&
    verticalGap >= 0 &&
    verticalGap <= rowRegion.height
}

function createRowZones(
  rows: readonly CalloutQuantityLabel[][],
  rowIndex: number,
  interior: Region,
): OwnershipZone[] {
  const row = rows[rowIndex]
  const previousRow = rows[rowIndex - 1]
  const nextRow = rows[rowIndex + 1]
  const top = readRowTop(row, previousRow, interior)
  const bottom = readRowBottom(nextRow, interior)

  return row.flatMap((label, labelIndex) => {
    const previous = row[labelIndex - 1]
    const next = row[labelIndex + 1]
    const center = regionCenter(label.region)
    const left = previous
      ? Math.floor((regionCenter(previous.region).x + center.x) / 2)
      : interior.x
    const right = next
      ? Math.ceil((center.x + regionCenter(next.region).x) / 2)
      : interior.x + interior.width
    const region = intersectRegions(
      { height: Math.max(1, bottom - top), width: Math.max(1, right - left), x: left, y: top },
      interior,
    )

    return region ? [{ label, region }] : []
  })
}

function createDenseRowZones(
  rows: readonly CalloutQuantityLabel[][],
  rowIndex: number,
  interior: Region,
): OwnershipZone[] {
  const row = rows[rowIndex]
  const nextRow = rows[rowIndex + 1]
  const top = readDenseRowTop(row, interior)
  const bottom = readDenseRowBottom(row, nextRow, interior)

  return row.flatMap((label, labelIndex) => {
    const previous = row[labelIndex - 1]
    const next = row[labelIndex + 1]
    const center = regionCenter(label.region)
    const left = previous
      ? Math.floor((regionCenter(previous.region).x + center.x) / 2)
      : interior.x
    const right = next
      ? Math.ceil((center.x + regionCenter(next.region).x) / 2)
      : interior.x + interior.width
    const region = intersectRegions(
      { height: Math.max(1, bottom - top), width: Math.max(1, right - left), x: left, y: top },
      interior,
    )

    return region ? [{ label, region }] : []
  })
}

function readRowTop(
  row: readonly CalloutQuantityLabel[],
  previousRow: readonly CalloutQuantityLabel[] | undefined,
  interior: Region,
): number {
  if (!previousRow) {
    return interior.y
  }

  const previousTop = readRowExtent(previousRow).top
  const currentTop = Math.min(...row.map((label) => label.region.y))

  return Math.min(Math.max(interior.y, previousTop), currentTop - 1)
}

function readRowBottom(
  nextRow: readonly CalloutQuantityLabel[] | undefined,
  interior: Region,
): number {
  if (!nextRow) {
    return interior.y + interior.height
  }

  return Math.min(interior.y + interior.height, Math.min(...nextRow.map((label) => label.region.y)) - 1)
}

function readRowExtent(row: readonly CalloutQuantityLabel[]): { top: number } {
  return {
    top: Math.min(...row.map((label) => label.region.y)),
  }
}

function readDenseRowTop(
  row: readonly CalloutQuantityLabel[],
  interior: Region,
): number {
  const currentTop = Math.min(...row.map((label) => label.region.y))
  const labelHeight = readMedianLabelHeight(row)
  const localTop = currentTop - Math.max(86, Math.round(labelHeight * 8))

  return Math.max(interior.y, localTop)
}

function readDenseRowBottom(
  row: readonly CalloutQuantityLabel[],
  nextRow: readonly CalloutQuantityLabel[] | undefined,
  interior: Region,
): number {
  const currentBottom = Math.max(...row.map((label) => label.region.y + label.region.height))
  const labelHeight = readMedianLabelHeight(row)
  const localBottom = currentBottom + Math.max(8, Math.round(labelHeight * 1.2))

  if (!nextRow) {
    return Math.min(interior.y + interior.height, localBottom)
  }

  const nextTop = Math.min(...nextRow.map((label) => label.region.y))

  return Math.min(interior.y + interior.height, Math.min(nextTop - 1, localBottom))
}

function readMedianLabelHeight(row: readonly CalloutQuantityLabel[]): number {
  const heights = row.map((label) => label.region.height).sort((left, right) => left - right)
  const middle = Math.floor(heights.length / 2)

  return heights[middle] ?? 1
}

function readComponentOwnershipAnchorX(
  component: GlyphComponent,
  label: Region,
): number {
  if (component.region.height <= label.height * 2) {
    return regionCenter(component.region).x
  }

  const lowerBandY = component.region.y + component.region.height - label.height
  const lowerPixels = component.pixels.filter((pixel) => pixel.y >= lowerBandY)
  const anchorPixels = lowerPixels.length > 0 ? lowerPixels : component.pixels
  const xSum = anchorPixels.reduce((sum, pixel) => sum + pixel.x, 0)

  return xSum / anchorPixels.length
}
