import type { StepCalloutPageInput, StepCalloutRgbColor } from "./contracts"

const ALPHA_CHANNEL = 3
const BLUE_CHANNEL = 2
const GREEN_CHANNEL = 1
const OPAQUE_ALPHA_MIN = 32
const PAGE_BACKGROUND_BUCKET_SIZE = 16
const PAGE_BACKGROUND_EDGE_DEPTH = 8
const PAGE_BACKGROUND_SAMPLE_STRIDE = 8
const RED_CHANNEL = 0
const RGBA_CHANNEL_COUNT = 4

export type { StepCalloutRgbColor }

interface ColorAccumulator {
  b: number
  count: number
  g: number
  r: number
}

export function readStepCalloutPixelColor(
  page: StepCalloutPageInput,
  pixelIndex: number,
): StepCalloutRgbColor {
  const offset = pixelIndex * RGBA_CHANNEL_COUNT

  return {
    b: page.data[offset + BLUE_CHANNEL],
    g: page.data[offset + GREEN_CHANNEL],
    r: page.data[offset + RED_CHANNEL],
  }
}

export function isStepCalloutDarkPixel(page: StepCalloutPageInput, pixelIndex: number): boolean {
  return readStepCalloutPixelAlpha(page, pixelIndex) >= OPAQUE_ALPHA_MIN && stepCalloutPixelLuma(page, pixelIndex) <= 96
}

export function isStepCalloutFillPanelPixel(
  page: StepCalloutPageInput,
  pixelIndex: number,
  background: StepCalloutRgbColor,
): boolean {
  return (
    readStepCalloutPixelAlpha(page, pixelIndex) >= OPAQUE_ALPHA_MIN &&
    stepCalloutPixelLuma(page, pixelIndex) >= 128 &&
    stepCalloutColorDistance(readStepCalloutPixelColor(page, pixelIndex), background) >= 18
  )
}

export function estimateStepCalloutPageBackground(page: StepCalloutPageInput): StepCalloutRgbColor {
  const edgeSample = readDominantEdgeColor(page)

  if (edgeSample) {
    return edgeSample
  }

  const cornerIndexes = [
    0,
    page.width - 1,
    page.width * (page.height - 1),
    page.width * page.height - 1,
  ]

  return averageStepCalloutPixelColors(page, cornerIndexes)
}

export function stepCalloutColorDistance(
  left: StepCalloutRgbColor,
  right: StepCalloutRgbColor,
): number {
  const redDelta = left.r - right.r
  const greenDelta = left.g - right.g
  const blueDelta = left.b - right.b

  return Math.sqrt(redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta)
}

export function stepCalloutColorLuma(color: StepCalloutRgbColor): number {
  return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b
}

function averageStepCalloutPixelColors(
  page: StepCalloutPageInput,
  pixelIndexes: readonly number[],
): StepCalloutRgbColor {
  const total = pixelIndexes.reduce(
    (sum, pixelIndex) => addStepCalloutColors(sum, readStepCalloutPixelColor(page, pixelIndex)),
    { b: 0, g: 0, r: 0 },
  )

  return {
    b: Math.round(total.b / pixelIndexes.length),
    g: Math.round(total.g / pixelIndexes.length),
    r: Math.round(total.r / pixelIndexes.length),
  }
}

function readDominantEdgeColor(page: StepCalloutPageInput): StepCalloutRgbColor | null {
  const clusters = new Map<string, ColorAccumulator>()

  for (const pixelIndex of collectEdgeSamplePixelIndexes(page)) {
    const color = readStepCalloutPixelColor(page, pixelIndex)
    const key = colorBucketKey(color)
    const accumulator = clusters.get(key) ?? createColorAccumulator()

    clusters.set(key, addColorToAccumulator(accumulator, color))
  }

  const largestCluster = [...clusters.values()].sort(compareClusterSize)[0]

  if (!largestCluster) {
    return null
  }

  return {
    b: Math.round(largestCluster.b / largestCluster.count),
    g: Math.round(largestCluster.g / largestCluster.count),
    r: Math.round(largestCluster.r / largestCluster.count),
  }
}

function collectEdgeSamplePixelIndexes(page: StepCalloutPageInput): number[] {
  const indexes = []
  const depth = Math.min(
    PAGE_BACKGROUND_EDGE_DEPTH,
    Math.ceil(page.width / 2),
    Math.ceil(page.height / 2),
  )

  for (let inset = 0; inset < depth; inset += 1) {
    const top = inset
    const bottom = page.height - 1 - inset
    const left = inset
    const right = page.width - 1 - inset

    for (let x = left; x <= right; x += PAGE_BACKGROUND_SAMPLE_STRIDE) {
      indexes.push(top * page.width + x)
      indexes.push(bottom * page.width + x)
    }

    for (let y = top; y <= bottom; y += PAGE_BACKGROUND_SAMPLE_STRIDE) {
      indexes.push(y * page.width + left)
      indexes.push(y * page.width + right)
    }
  }

  return indexes
}

function colorBucketKey(color: StepCalloutRgbColor): string {
  return [color.r, color.g, color.b].map(quantizeChannel).join(":")
}

function quantizeChannel(value: number): number {
  return Math.floor(value / PAGE_BACKGROUND_BUCKET_SIZE)
}

function createColorAccumulator(): ColorAccumulator {
  return {
    b: 0,
    count: 0,
    g: 0,
    r: 0,
  }
}

function addColorToAccumulator(
  accumulator: ColorAccumulator,
  color: StepCalloutRgbColor,
): ColorAccumulator {
  return {
    b: accumulator.b + color.b,
    count: accumulator.count + 1,
    g: accumulator.g + color.g,
    r: accumulator.r + color.r,
  }
}

function compareClusterSize(left: ColorAccumulator, right: ColorAccumulator): number {
  return right.count - left.count
}

function addStepCalloutColors(
  left: StepCalloutRgbColor,
  right: StepCalloutRgbColor,
): StepCalloutRgbColor {
  return {
    b: left.b + right.b,
    g: left.g + right.g,
    r: left.r + right.r,
  }
}

function readStepCalloutPixelAlpha(page: StepCalloutPageInput, pixelIndex: number): number {
  return page.data[pixelIndex * RGBA_CHANNEL_COUNT + ALPHA_CHANNEL]
}

function stepCalloutPixelLuma(page: StepCalloutPageInput, pixelIndex: number): number {
  return stepCalloutColorLuma(readStepCalloutPixelColor(page, pixelIndex))
}
