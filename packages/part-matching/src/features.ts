import {
  normalizeAlphaMask,
  normalizeRenderedPixels,
} from "./alpha-mask"
import type {
  PartVisualFeatureInput,
  PartVisualFeatures,
} from "./contracts"
import { digestNumbers } from "./digest"

const GRID_SIZE = 16
const HIGH_RES_GRID_SIZE = 32
const ORIENTATION_BINS = 8
const OPAQUE_ALPHA_MIN = 64
const TOP_BAND_RATIO = 0.42
const TOP_PEAK_THRESHOLD = 0.26
const LOWER_SEGMENT_THRESHOLD = 0.2

interface SampleBounds {
  height: number
  width: number
  x: number
  y: number
}

interface AlphaFeatureGrids {
  alphaOrientationHistogram: number[]
  alphaSignedDistanceGrid32: number[]
  edgeAlpha: number[]
  edgeAlpha32: number[]
  normalizedAlpha: number[]
  normalizedAlpha32: number[]
  tightAlpha32: number[]
  tightAlphaEdge32: number[]
  tightAlphaSignedDistanceGrid32: number[]
  tightBounds: SampleBounds | null
}

interface LumaFeatureGrids {
  detailDigest: string | null
  lumaGrid: number[] | null
  lumaGrid32: number[] | null
  lumaOrientationHistogram: number[] | null
  tightLumaGrid32: number[] | null
}

export function extractPartVisualFeatures(
  input: PartVisualFeatureInput,
): PartVisualFeatures {
  const width = normalizeDimension(input.alphaMask?.width ?? input.partRegion.width)
  const height = normalizeDimension(input.alphaMask?.height ?? input.partRegion.height)
  const alpha = normalizeAlphaMask(input.alphaMask)
  const alphaFeatures = createAlphaFeatureGrids(alpha, width, height)
  const { normalizedAlpha } = alphaFeatures
  const projections = createProjections(normalizedAlpha)
  const leftProfile = createSideProfile(normalizedAlpha, "left")
  const lowerProfile = createLowerProfile(normalizedAlpha)
  const rightProfile = createSideProfile(normalizedAlpha, "right")
  const topProfile = createVerticalProfile(normalizedAlpha, "top")
  const renderedPixels = normalizeRenderedPixels(input.renderedPixels)
  const lumaFeatures = createLumaFeatureGrids({
    alphaHeight: height,
    alphaTightBounds: alphaFeatures.tightBounds,
    alphaWidth: width,
    renderedPixels,
    renderedPixelsInput: input.renderedPixels,
  })
  const opaqueCoverage = normalizedAlpha.reduce((total, value) => total + value, 0) /
    (GRID_SIZE * GRID_SIZE * 255)

  return {
    alphaDigest: alpha ? digestNumbers([width, height, ...alpha]) : null,
    alphaOrientationHistogram: alphaFeatures.alphaOrientationHistogram,
    alphaSignedDistanceGrid32: alphaFeatures.alphaSignedDistanceGrid32,
    area: width * height,
    aspectRatio: width / height,
    centerX: weightedCenter(projections.x),
    centerY: weightedCenter(projections.y),
    detailDigest: lumaFeatures.detailDigest,
    edgeAlpha: alphaFeatures.edgeAlpha,
    edgeAlpha32: alphaFeatures.edgeAlpha32,
    height,
    leftProfile,
    lowerProfile,
    lowerSegmentCount: countLowerSegments(normalizedAlpha),
    lumaGrid: lumaFeatures.lumaGrid,
    lumaGrid32: lumaFeatures.lumaGrid32,
    lumaOrientationHistogram: lumaFeatures.lumaOrientationHistogram,
    normalizedAlpha,
    normalizedAlpha32: alphaFeatures.normalizedAlpha32,
    opaqueCoverage,
    projectionX: projections.x,
    projectionY: projections.y,
    rightProfile,
    tightAlpha32: alphaFeatures.tightAlpha32,
    tightAlphaEdge32: alphaFeatures.tightAlphaEdge32,
    tightAlphaSignedDistanceGrid32: alphaFeatures.tightAlphaSignedDistanceGrid32,
    tightLumaGrid32: lumaFeatures.tightLumaGrid32,
    topProfile,
    topPeakCount: countTopPeaks(normalizedAlpha),
    width,
  }
}

function createAlphaFeatureGrids(
  alpha: Uint8ClampedArray | null,
  width: number,
  height: number,
): AlphaFeatureGrids {
  const normalizedAlpha = alpha
    ? createNormalizedAlphaGrid(alpha, width, height, GRID_SIZE)
    : createEmptyGrid(GRID_SIZE)
  const normalizedAlpha32 = alpha
    ? createNormalizedAlphaGrid(alpha, width, height, HIGH_RES_GRID_SIZE)
    : createEmptyGrid(HIGH_RES_GRID_SIZE)
  const tightBounds = alpha ? findOpaqueBounds(alpha, width, height) : null
  const tightAlpha32 = alpha
    ? createNormalizedAlphaGrid(alpha, width, height, HIGH_RES_GRID_SIZE, tightBounds)
    : createEmptyGrid(HIGH_RES_GRID_SIZE)

  return {
    alphaOrientationHistogram: createOrientationHistogram(normalizedAlpha, GRID_SIZE),
    alphaSignedDistanceGrid32: createSignedBoundaryDistanceGrid(normalizedAlpha32, HIGH_RES_GRID_SIZE),
    edgeAlpha: createEdgeAlphaGrid(normalizedAlpha),
    edgeAlpha32: createEdgeAlphaGrid(normalizedAlpha32, HIGH_RES_GRID_SIZE),
    normalizedAlpha,
    normalizedAlpha32,
    tightAlpha32,
    tightAlphaEdge32: createEdgeAlphaGrid(tightAlpha32, HIGH_RES_GRID_SIZE),
    tightAlphaSignedDistanceGrid32: createSignedBoundaryDistanceGrid(tightAlpha32, HIGH_RES_GRID_SIZE),
    tightBounds,
  }
}

function createLumaFeatureGrids({
  alphaHeight,
  alphaTightBounds,
  alphaWidth,
  renderedPixels,
  renderedPixelsInput,
}: {
  alphaHeight: number
  alphaTightBounds: SampleBounds | null
  alphaWidth: number
  renderedPixels: Uint8ClampedArray | null
  renderedPixelsInput?: {
    height: number
    width: number
  } | null
}): LumaFeatureGrids {
  if (!renderedPixels || !renderedPixelsInput) {
    return {
      detailDigest: null,
      lumaGrid: null,
      lumaGrid32: null,
      lumaOrientationHistogram: null,
      tightLumaGrid32: null,
    }
  }

  const lumaGrid = createLumaGrid(renderedPixels, renderedPixelsInput.width, renderedPixelsInput.height, GRID_SIZE)
  const tightRenderedBounds = renderedPixelsInput.width === alphaWidth && renderedPixelsInput.height === alphaHeight
    ? alphaTightBounds
    : null

  return {
    detailDigest: digestNumbers(lumaGrid),
    lumaGrid,
    lumaGrid32: createLumaGrid(renderedPixels, renderedPixelsInput.width, renderedPixelsInput.height, HIGH_RES_GRID_SIZE),
    lumaOrientationHistogram: createOrientationHistogram(lumaGrid, GRID_SIZE),
    tightLumaGrid32: createLumaGrid(
      renderedPixels,
      renderedPixelsInput.width,
      renderedPixelsInput.height,
      HIGH_RES_GRID_SIZE,
      tightRenderedBounds,
    ),
  }
}

function fullSampleBounds(width: number, height: number): SampleBounds {
  return {
    height,
    width,
    x: 0,
    y: 0,
  }
}

function findOpaqueBounds(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
): SampleBounds {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((alpha[y * width + x] ?? 0) < OPAQUE_ALPHA_MIN) {
        continue
      }

      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) {
    return fullSampleBounds(width, height)
  }

  return {
    height: Math.max(1, maxY - minY + 1),
    width: Math.max(1, maxX - minX + 1),
    x: minX,
    y: minY,
  }
}

function createNormalizedAlphaGrid(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  gridSize: number,
  sampleBounds: SampleBounds | null = null,
): number[] {
  const values: number[] = []
  const bounds = sampleBounds ?? fullSampleBounds(width, height)

  for (let gridY = 0; gridY < gridSize; gridY += 1) {
    for (let gridX = 0; gridX < gridSize; gridX += 1) {
      values.push(sampleAlphaCell(alpha, width, height, gridX, gridY, gridSize, bounds))
    }
  }

  return values
}

function sampleAlphaCell(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  gridX: number,
  gridY: number,
  gridSize: number,
  bounds: SampleBounds,
): number {
  const xStart = Math.floor(bounds.x + (gridX * bounds.width) / gridSize)
  const xEnd = Math.max(xStart + 1, Math.floor(bounds.x + ((gridX + 1) * bounds.width) / gridSize))
  const yStart = Math.floor(bounds.y + (gridY * bounds.height) / gridSize)
  const yEnd = Math.max(yStart + 1, Math.floor(bounds.y + ((gridY + 1) * bounds.height) / gridSize))
  let total = 0
  let count = 0

  for (let y = yStart; y < Math.min(height, yEnd); y += 1) {
    for (let x = xStart; x < Math.min(width, xEnd); x += 1) {
      total += alpha[y * width + x] ?? 0
      count += 1
    }
  }

  return count === 0 ? 0 : Math.round(total / count)
}

function createProjections(normalizedAlpha: readonly number[]): {
  x: number[]
  y: number[]
} {
  const x = Array.from({ length: GRID_SIZE }, () => 0)
  const y = Array.from({ length: GRID_SIZE }, () => 0)

  for (let gridY = 0; gridY < GRID_SIZE; gridY += 1) {
    for (let gridX = 0; gridX < GRID_SIZE; gridX += 1) {
      const value = normalizedAlpha[gridY * GRID_SIZE + gridX] ?? 0
      x[gridX] += value
      y[gridY] += value
    }
  }

  return {
    x: x.map((value) => value / (GRID_SIZE * 255)),
    y: y.map((value) => value / (GRID_SIZE * 255)),
  }
}

function createLowerProfile(normalizedAlpha: readonly number[]): number[] {
  return createVerticalProfile(normalizedAlpha, "lower")
}

function createVerticalProfile(
  normalizedAlpha: readonly number[],
  side: "lower" | "top",
): number[] {
  return Array.from({ length: GRID_SIZE }, (_value, gridX) => {
    const range = side === "top"
      ? Array.from({ length: GRID_SIZE }, (_ignored, gridY) => gridY)
      : Array.from({ length: GRID_SIZE }, (_ignored, gridY) => GRID_SIZE - 1 - gridY)

    for (const gridY of range) {
      if ((normalizedAlpha[gridY * GRID_SIZE + gridX] ?? 0) >= OPAQUE_ALPHA_MIN) {
        return gridY / (GRID_SIZE - 1)
      }
    }

    return side === "top" ? 1 : 0
  })
}

function createSideProfile(
  normalizedAlpha: readonly number[],
  side: "left" | "right",
): number[] {
  return Array.from({ length: GRID_SIZE }, (_value, gridY) => {
    const range = side === "left"
      ? Array.from({ length: GRID_SIZE }, (_ignored, gridX) => gridX)
      : Array.from({ length: GRID_SIZE }, (_ignored, gridX) => GRID_SIZE - 1 - gridX)

    for (const gridX of range) {
      if ((normalizedAlpha[gridY * GRID_SIZE + gridX] ?? 0) >= OPAQUE_ALPHA_MIN) {
        return gridX / (GRID_SIZE - 1)
      }
    }

    return side === "left" ? 1 : 0
  })
}

function createEdgeAlphaGrid(
  normalizedAlpha: readonly number[],
  gridSize = GRID_SIZE,
): number[] {
  const values: number[] = []

  for (let gridY = 0; gridY < gridSize; gridY += 1) {
    for (let gridX = 0; gridX < gridSize; gridX += 1) {
      const value = readGridAlpha(normalizedAlpha, gridX, gridY, gridSize)
      const horizontalEdge = Math.abs(value - readGridAlpha(normalizedAlpha, gridX + 1, gridY, gridSize))
      const verticalEdge = Math.abs(value - readGridAlpha(normalizedAlpha, gridX, gridY + 1, gridSize))

      values.push(Math.max(horizontalEdge, verticalEdge))
    }
  }

  return values
}

function readGridAlpha(
  normalizedAlpha: readonly number[],
  gridX: number,
  gridY: number,
  gridSize = GRID_SIZE,
): number {
  if (gridX < 0 || gridY < 0 || gridX >= gridSize || gridY >= gridSize) {
    return 0
  }

  return normalizedAlpha[gridY * gridSize + gridX] ?? 0
}

function countTopPeaks(normalizedAlpha: readonly number[]): number {
  const topRows = Math.max(2, Math.round(GRID_SIZE * TOP_BAND_RATIO))
  const columnCoverage = Array.from({ length: GRID_SIZE }, (_value, gridX) => {
    let total = 0

    for (let gridY = 0; gridY < topRows; gridY += 1) {
      total += normalizedAlpha[gridY * GRID_SIZE + gridX] ?? 0
    }

    return total / (topRows * 255)
  })

  return countSegments(columnCoverage, TOP_PEAK_THRESHOLD)
}

function countLowerSegments(normalizedAlpha: readonly number[]): number {
  const startRow = Math.floor(GRID_SIZE * 0.55)
  const columnCoverage = Array.from({ length: GRID_SIZE }, (_value, gridX) => {
    let total = 0
    let rows = 0

    for (let gridY = startRow; gridY < GRID_SIZE; gridY += 1) {
      total += normalizedAlpha[gridY * GRID_SIZE + gridX] ?? 0
      rows += 1
    }

    return rows === 0 ? 0 : total / (rows * 255)
  })

  return countSegments(columnCoverage, LOWER_SEGMENT_THRESHOLD)
}

function countSegments(values: readonly number[], threshold: number): number {
  let count = 0
  let insideSegment = false

  for (const value of values) {
    if (value >= threshold) {
      if (!insideSegment) {
        count += 1
      }
      insideSegment = true
      continue
    }

    insideSegment = false
  }

  return count
}

function weightedCenter(values: readonly number[]): number {
  const total = values.reduce((sum, value) => sum + value, 0)

  if (total <= 0) {
    return 0.5
  }

  return values.reduce(
    (sum, value, index) => sum + value * (index / Math.max(1, values.length - 1)),
    0,
  ) / total
}

function createLumaGrid(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  gridSize: number,
  sampleBounds: SampleBounds | null = null,
): number[] {
  const values: Array<number | null> = []
  const bounds = sampleBounds ?? fullSampleBounds(width, height)

  for (let gridY = 0; gridY < gridSize; gridY += 1) {
    for (let gridX = 0; gridX < gridSize; gridX += 1) {
      values.push(sampleLumaCell(pixels, width, height, gridX, gridY, gridSize, bounds))
    }
  }

  return normalizeLumaGrid(values)
}

function sampleLumaCell(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  gridX: number,
  gridY: number,
  gridSize: number,
  bounds: SampleBounds,
): number | null {
  const xStart = Math.floor(bounds.x + (gridX * bounds.width) / gridSize)
  const xEnd = Math.max(xStart + 1, Math.floor(bounds.x + ((gridX + 1) * bounds.width) / gridSize))
  const yStart = Math.floor(bounds.y + (gridY * bounds.height) / gridSize)
  const yEnd = Math.max(yStart + 1, Math.floor(bounds.y + ((gridY + 1) * bounds.height) / gridSize))
  let total = 0
  let count = 0

  for (let y = yStart; y < Math.min(height, yEnd); y += 1) {
    for (let x = xStart; x < Math.min(width, xEnd); x += 1) {
      const pixelIndex = (y * width + x) * 4
      const alpha = pixels[pixelIndex + 3] ?? 0

      if (alpha < OPAQUE_ALPHA_MIN) {
        continue
      }

      total += luma(
        pixels[pixelIndex] ?? 0,
        pixels[pixelIndex + 1] ?? 0,
        pixels[pixelIndex + 2] ?? 0,
      )
      count += 1
    }
  }

  return count === 0 ? null : Math.round(total / count)
}

function normalizeLumaGrid(values: readonly (number | null)[]): number[] {
  const validValues = values.filter((value): value is number => value !== null)
  const mean = validValues.length === 0
    ? 128
    : validValues.reduce((total, value) => total + value, 0) / validValues.length

  return values.map((value) =>
    value === null ? 128 : clampByte(value - mean + 128)
  )
}

function luma(r: number, g: number, b: number): number {
  return Math.round(r * 0.299 + g * 0.587 + b * 0.114)
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function createOrientationHistogram(values: readonly number[], gridSize: number): number[] {
  const bins = Array.from({ length: ORIENTATION_BINS }, () => 0)

  for (let y = 1; y < gridSize - 1; y += 1) {
    for (let x = 1; x < gridSize - 1; x += 1) {
      const dx = readGridAlpha(values, x + 1, y, gridSize) - readGridAlpha(values, x - 1, y, gridSize)
      const dy = readGridAlpha(values, x, y + 1, gridSize) - readGridAlpha(values, x, y - 1, gridSize)
      const magnitude = Math.hypot(dx, dy)

      if (magnitude <= 0) {
        continue
      }

      const angle = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)
      const bin = Math.min(ORIENTATION_BINS - 1, Math.floor(angle * ORIENTATION_BINS))

      bins[bin] += magnitude
    }
  }

  const total = bins.reduce((sum, value) => sum + value, 0)

  return total <= 0
    ? bins
    : bins.map((value) => value / total)
}

function createSignedBoundaryDistanceGrid(
  normalizedAlpha: readonly number[],
  gridSize: number,
): number[] {
  const distances = Array.from({ length: gridSize * gridSize }, () => Number.POSITIVE_INFINITY)
  const queue = seedBoundaryDistances(normalizedAlpha, distances, gridSize)

  expandBoundaryDistances(distances, queue, gridSize)

  return toSignedBoundaryDistanceValues(normalizedAlpha, distances, gridSize)
}

function seedBoundaryDistances(
  normalizedAlpha: readonly number[],
  distances: number[],
  gridSize: number,
): number[] {
  const queue: number[] = []

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      seedBoundaryDistance(normalizedAlpha, distances, queue, x, y, gridSize)
    }
  }

  return queue
}

function seedBoundaryDistance(
  normalizedAlpha: readonly number[],
  distances: number[],
  queue: number[],
  x: number,
  y: number,
  gridSize: number,
): void {
  if (!isSilhouetteBoundary(normalizedAlpha, x, y, gridSize)) {
    return
  }

  const index = y * gridSize + x

  distances[index] = 0
  queue.push(index)
}

function expandBoundaryDistances(
  distances: number[],
  queue: number[],
  gridSize: number,
): void {
  for (let head = 0; head < queue.length; head += 1) {
    expandBoundaryDistance(distances, queue, head, gridSize)
  }
}

function expandBoundaryDistance(
  distances: number[],
  queue: number[],
  head: number,
  gridSize: number,
): void {
  const index = queue[head] ?? 0
  const x = index % gridSize
  const y = Math.floor(index / gridSize)
  const nextDistance = (distances[index] ?? 0) + 1

  for (const [nextX, nextY] of neighborCells(x, y)) {
    maybeQueueBoundaryNeighbor(distances, queue, nextX, nextY, nextDistance, gridSize)
  }
}

function maybeQueueBoundaryNeighbor(
  distances: number[],
  queue: number[],
  x: number,
  y: number,
  distance: number,
  gridSize: number,
): void {
  if (x < 0 || y < 0 || x >= gridSize || y >= gridSize) {
    return
  }

  const index = y * gridSize + x

  if (distance >= (distances[index] ?? Number.POSITIVE_INFINITY)) {
    return
  }

  distances[index] = distance
  queue.push(index)
}

function toSignedBoundaryDistanceValues(
  normalizedAlpha: readonly number[],
  distances: readonly number[],
  gridSize: number,
): number[] {
  const maxDistance = Math.max(1, gridSize / 2)

  return distances.map((distance, index) =>
    signedBoundaryDistanceValue(normalizedAlpha[index] ?? 0, distance, maxDistance)
  )
}

function signedBoundaryDistanceValue(
  alpha: number,
  distance: number,
  maxDistance: number,
): number {
  const sign = alpha >= OPAQUE_ALPHA_MIN ? 1 : -1
  const boundedDistance = Number.isFinite(distance) ? Math.min(distance, maxDistance) : maxDistance

  return sign * (boundedDistance / maxDistance) * 255
}

function neighborCells(x: number, y: number): [number, number][] {
  return [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
  ]
}

function isSilhouetteBoundary(
  normalizedAlpha: readonly number[],
  x: number,
  y: number,
  gridSize: number,
): boolean {
  const opaque = readGridAlpha(normalizedAlpha, x, y, gridSize) >= OPAQUE_ALPHA_MIN

  return [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
  ].some(([neighborX, neighborY]) =>
    (readGridAlpha(normalizedAlpha, neighborX, neighborY, gridSize) >= OPAQUE_ALPHA_MIN) !== opaque
  )
}

function createEmptyGrid(gridSize: number): number[] {
  return Array.from({ length: gridSize * gridSize }, () => 0)
}

function normalizeDimension(value: number): number {
  return Math.max(1, Math.round(Number.isFinite(value) ? value : 1))
}
