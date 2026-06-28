import type { Region } from "./contracts"
import { MIN_PART_AREA } from "./part-foreground-constants"
import { regionCenter } from "./regions"

const MAX_SAME_ROW_SPLIT_LABELS = 8
const MAX_SAME_ROW_SPLIT_PIXELS = 320_000

export interface PartForegroundSelectionOptions {
  splitSameRowComponents: boolean
  trimConnectedForegroundBelowLabel?: boolean
}

export interface PartForegroundPoint {
  x: number
  y: number
}

export function selectOwnedForegroundPixels(
  pixels: PartForegroundPoint[],
  labelRegion: Region,
  labelRegions: readonly Region[],
  options: PartForegroundSelectionOptions,
): PartForegroundPoint[] {
  const verticallyOwnedPixels = options.trimConnectedForegroundBelowLabel
    ? selectBestDenseForegroundSubcomponent(trimForegroundBelowLabel(pixels, labelRegion), labelRegion)
    : pixels
  const columnOwnedPixels = selectColumnOwnedSubcomponent(verticallyOwnedPixels, labelRegion, labelRegions)

  if (!options.splitSameRowComponents) {
    return columnOwnedPixels
  }

  const sameRowLabels = findSameRowLabels(labelRegion, labelRegions)

  if (
    sameRowLabels.length < 2 ||
    sameRowLabels.length > MAX_SAME_ROW_SPLIT_LABELS ||
    columnOwnedPixels.length > MAX_SAME_ROW_SPLIT_PIXELS
  ) {
    return columnOwnedPixels
  }

  const labelCenterX = regionCenter(labelRegion).x
  const labelIndex = sameRowLabels.findIndex((label) => label === labelRegion)

  if (labelIndex < 0 || !supportSpansMultipleLabelAnchors(columnOwnedPixels, sameRowLabels)) {
    return columnOwnedPixels
  }

  const previous = sameRowLabels[labelIndex - 1]
  const next = sameRowLabels[labelIndex + 1]
  const leftBoundary = previous
    ? findSparseColumnBoundary(columnOwnedPixels, regionCenter(previous).x, labelCenterX)
    : -Infinity
  const rightBoundary = next
    ? findSparseColumnBoundary(columnOwnedPixels, labelCenterX, regionCenter(next).x)
    : Infinity
  const filtered = columnOwnedPixels.filter((pixel) => pixel.x >= leftBoundary && pixel.x <= rightBoundary)

  return filtered.length >= MIN_PART_AREA ? filtered : columnOwnedPixels
}

export function boundsForPixels(pixels: ReadonlyArray<PartForegroundPoint>): Region {
  let x = Number.POSITIVE_INFINITY
  let y = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY

  for (const pixel of pixels) {
    x = Math.min(x, pixel.x)
    y = Math.min(y, pixel.y)
    right = Math.max(right, pixel.x + 1)
    bottom = Math.max(bottom, pixel.y + 1)
  }

  return {
    height: bottom - y,
    width: right - x,
    x,
    y,
  }
}

function selectColumnOwnedSubcomponent(
  pixels: PartForegroundPoint[],
  labelRegion: Region,
  labelRegions: readonly Region[],
): PartForegroundPoint[] {
  if (!hasHigherLabelInSameColumn(labelRegion, labelRegions)) {
    return pixels
  }

  const components = splitPixelComponents(pixels).filter((component) => component.length >= MIN_PART_AREA)

  if (components.length <= 1) {
    return pixels
  }

  const [best] = components.sort((left, right) =>
    scoreColumnSubcomponent(left, labelRegion) - scoreColumnSubcomponent(right, labelRegion),
  )
  const largestPixelCount = Math.max(...components.map((component) => component.length))
  const realComponentFloor = Math.max(MIN_PART_AREA * 4, Math.round(largestPixelCount * 0.18))

  return best && best.length >= realComponentFloor ? best : pixels
}

function hasHigherLabelInSameColumn(labelRegion: Region, labelRegions: readonly Region[]): boolean {
  const labelCenter = regionCenter(labelRegion)
  const rowGap = Math.max(18, Math.round(labelRegion.height * 1.6))
  const columnTolerance = Math.max(labelRegion.width * 1.2, labelRegion.height * 1.8)

  return labelRegions.some((candidate) => {
    if (candidate === labelRegion) {
      return false
    }

    const candidateCenter = regionCenter(candidate)

    return candidateCenter.y < labelCenter.y - rowGap &&
      Math.abs(candidateCenter.x - labelCenter.x) <= columnTolerance
  })
}

function scoreColumnSubcomponent(component: PartForegroundPoint[], labelRegion: Region): number {
  const region = boundsForPixels(component)
  const labelCenter = regionCenter(labelRegion)
  const componentCenter = regionCenter(region)
  const verticalGap = Math.max(0, labelRegion.y - (region.y + region.height))
  const horizontalGap = Math.abs(componentCenter.x - labelCenter.x)

  return verticalGap * 3 + horizontalGap
}

function selectBestDenseForegroundSubcomponent(
  pixels: PartForegroundPoint[],
  labelRegion: Region,
): PartForegroundPoint[] {
  const components = splitPixelComponents(pixels)

  if (components.length <= 1) {
    return pixels
  }

  const [best] = components
    .filter((component) => component.length >= MIN_PART_AREA)
    .sort((left, right) =>
      scoreDenseSubcomponent(left, labelRegion) - scoreDenseSubcomponent(right, labelRegion),
    )

  return best ?? pixels
}

function splitPixelComponents(pixels: PartForegroundPoint[]): PartForegroundPoint[][] {
  const byKey = new Map<string, PartForegroundPoint>()

  for (const pixel of pixels) {
    byKey.set(pixelKey(pixel.x, pixel.y), pixel)
  }

  const visited = new Set<string>()
  const components: PartForegroundPoint[][] = []

  for (const pixel of pixels) {
    const key = pixelKey(pixel.x, pixel.y)

    if (!visited.has(key)) {
      components.push(floodFillPixelComponent(pixel, byKey, visited))
    }
  }

  return components
}

function floodFillPixelComponent(
  start: PartForegroundPoint,
  byKey: Map<string, PartForegroundPoint>,
  visited: Set<string>,
): PartForegroundPoint[] {
  const stack = [start]
  const component: PartForegroundPoint[] = []

  visited.add(pixelKey(start.x, start.y))

  while (stack.length > 0) {
    const pixel = stack.pop()!

    component.push(pixel)
    pushPixelNeighbors(pixel, byKey, visited, stack)
  }

  return component
}

function pushPixelNeighbors(
  pixel: PartForegroundPoint,
  byKey: Map<string, PartForegroundPoint>,
  visited: Set<string>,
  stack: PartForegroundPoint[],
): void {
  for (let y = pixel.y - 1; y <= pixel.y + 1; y += 1) {
    pushPixelNeighborRow(pixel, y, byKey, visited, stack)
  }
}

function pushPixelNeighborRow(
  pixel: PartForegroundPoint,
  y: number,
  byKey: Map<string, PartForegroundPoint>,
  visited: Set<string>,
  stack: PartForegroundPoint[],
): void {
  for (let x = pixel.x - 1; x <= pixel.x + 1; x += 1) {
    pushPixelNeighbor(x, y, byKey, visited, stack)
  }
}

function pushPixelNeighbor(
  x: number,
  y: number,
  byKey: Map<string, PartForegroundPoint>,
  visited: Set<string>,
  stack: PartForegroundPoint[],
): void {
  const key = pixelKey(x, y)
  const next = byKey.get(key)

  if (next && !visited.has(key)) {
    visited.add(key)
    stack.push(next)
  }
}

function scoreDenseSubcomponent(pixels: PartForegroundPoint[], labelRegion: Region): number {
  const region = boundsForPixels(pixels)
  const labelCenterX = regionCenter(labelRegion).x
  const labelBottom = labelRegion.y + labelRegion.height
  const horizontalGap = Math.max(0, Math.max(
    region.x - labelCenterX,
    labelCenterX - region.x - region.width,
  ))
  const verticalGapAboveLabel = Math.max(0, labelRegion.y - (region.y + region.height))
  const belowLabelPenalty = Math.max(0, region.y - labelBottom) * 4
  const labelOverlapBonus = labelCenterX >= region.x && labelCenterX <= region.x + region.width
    ? labelRegion.width * 2
    : 0

  return horizontalGap * 3 + verticalGapAboveLabel + belowLabelPenalty - labelOverlapBonus
}

function pixelKey(x: number, y: number): string {
  return `${x},${y}`
}

function trimForegroundBelowLabel(
  pixels: PartForegroundPoint[],
  labelRegion: Region,
): PartForegroundPoint[] {
  const labelBottom = labelRegion.y + labelRegion.height
  const belowAllowance = Math.max(7, Math.round(labelRegion.height * 0.8))
  const filtered = pixels.filter((pixel) => pixel.y <= labelBottom + belowAllowance)

  return filtered.length >= MIN_PART_AREA ? filtered : pixels
}

function findSameRowLabels(labelRegion: Region, labelRegions: readonly Region[]): Region[] {
  const labelCenterY = regionCenter(labelRegion).y

  return labelRegions
    .filter((label) => Math.abs(regionCenter(label).y - labelCenterY) <= Math.max(9, labelRegion.height * 2.1))
    .sort((left, right) => regionCenter(left).x - regionCenter(right).x)
}

function supportSpansMultipleLabelAnchors(
  pixels: ReadonlyArray<PartForegroundPoint>,
  labelRegions: readonly Region[],
): boolean {
  if (pixels.length === 0) {
    return false
  }

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY

  for (const pixel of pixels) {
    minX = Math.min(minX, pixel.x)
    maxX = Math.max(maxX, pixel.x)
  }

  const coveredAnchors = labelRegions.filter((label) => {
    const centerX = regionCenter(label).x

    return centerX >= minX && centerX <= maxX
  })

  return coveredAnchors.length > 1
}

function findSparseColumnBoundary(
  pixels: ReadonlyArray<PartForegroundPoint>,
  leftCenterX: number,
  rightCenterX: number,
): number {
  const left = Math.floor(Math.min(leftCenterX, rightCenterX))
  const right = Math.ceil(Math.max(leftCenterX, rightCenterX))

  if (right <= left + 2) {
    return Math.floor((leftCenterX + rightCenterX) / 2)
  }

  const counts = new Map<number, number>()

  for (const pixel of pixels) {
    if (pixel.x >= left && pixel.x <= right) {
      counts.set(pixel.x, (counts.get(pixel.x) ?? 0) + 1)
    }
  }

  let bestX = Math.floor((leftCenterX + rightCenterX) / 2)
  let bestScore = Infinity
  let bestDistanceFromMidpoint = Infinity
  const midpoint = (leftCenterX + rightCenterX) / 2

  for (let x = left + 1; x < right; x += 1) {
    const score = (counts.get(x - 1) ?? 0) + (counts.get(x) ?? 0) + (counts.get(x + 1) ?? 0)
    const distanceFromMidpoint = Math.abs(x - midpoint)

    if (score < bestScore || (score === bestScore && distanceFromMidpoint < bestDistanceFromMidpoint)) {
      bestScore = score
      bestDistanceFromMidpoint = distanceFromMidpoint
      bestX = x
    }
  }

  return bestX
}
