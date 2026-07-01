import type { StepCalloutPageInput, StepCalloutRegion } from "./contracts"
import {
  estimateStepCalloutPageBackground,
  readStepCalloutPixelColor,
  stepCalloutColorLuma,
  type StepCalloutRgbColor,
} from "./pixels"
import { stepCalloutInsetRegion } from "./regions"

const BACKGROUND_LUMA_MIN = 128
const COLOR_BUCKET_SIZE = 16
const SAMPLE_STRIDE = 3

interface ColorAccumulator {
  b: number
  count: number
  g: number
  r: number
}

export function readStepCalloutCandidateBackground(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
): StepCalloutRgbColor {
  const samples = collectSampleColors(page, stepCalloutInsetRegion(region, 2))

  if (samples.length === 0) {
    return estimateStepCalloutPageBackground(page)
  }

  return readDominantLightColor(samples) ?? averageColors(samples)
}

function collectSampleColors(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
): StepCalloutRgbColor[] {
  const samples = []

  for (let y = region.y; y < region.y + region.height; y += SAMPLE_STRIDE) {
    samples.push(...collectRowSampleColors(page, region, y))
  }

  return samples
}

function collectRowSampleColors(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
  y: number,
): StepCalloutRgbColor[] {
  const colors = []

  for (let x = region.x; x < region.x + region.width; x += SAMPLE_STRIDE) {
    colors.push(readStepCalloutPixelColor(page, y * page.width + x))
  }

  return colors
}

function averageColors(colors: readonly StepCalloutRgbColor[]): StepCalloutRgbColor {
  const total = colors.reduce(
    (sum, color) => ({
      b: sum.b + color.b,
      g: sum.g + color.g,
      r: sum.r + color.r,
    }),
    { b: 0, g: 0, r: 0 },
  )

  return {
    b: Math.round(total.b / colors.length),
    g: Math.round(total.g / colors.length),
    r: Math.round(total.r / colors.length),
  }
}

function readDominantLightColor(
  colors: readonly StepCalloutRgbColor[],
): StepCalloutRgbColor | null {
  const clusters = new Map<string, ColorAccumulator>()

  for (const color of colors) {
    addLightColorToClusters(clusters, color)
  }

  return readLargestClusterColor(clusters)
}

function addLightColorToClusters(
  clusters: Map<string, ColorAccumulator>,
  color: StepCalloutRgbColor,
): void {
  if (stepCalloutColorLuma(color) < BACKGROUND_LUMA_MIN) {
    return
  }

  const bucket = colorBucketKey(color)
  const cluster = clusters.get(bucket) ?? createColorAccumulator()

  clusters.set(bucket, addColorToAccumulator(cluster, color))
}

function colorBucketKey(color: StepCalloutRgbColor): string {
  return [color.r, color.g, color.b].map(quantizeChannel).join(":")
}

function quantizeChannel(value: number): number {
  return Math.floor(value / COLOR_BUCKET_SIZE)
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

function readLargestClusterColor(
  clusters: ReadonlyMap<string, ColorAccumulator>,
): StepCalloutRgbColor | null {
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

function compareClusterSize(left: ColorAccumulator, right: ColorAccumulator): number {
  return right.count - left.count
}
