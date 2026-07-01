import type { CalloutPartPageInput, Region, RgbColor } from "./contracts"
import { insetRegion } from "./regions"

const RGBA_CHANNEL_COUNT = 4
const ALPHA_CHANNEL = 3

export function readPixel(page: CalloutPartPageInput, x: number, y: number): RgbColor {
  const index = (y * page.width + x) * RGBA_CHANNEL_COUNT

  return {
    b: page.data[index + 2] ?? 0,
    g: page.data[index + 1] ?? 0,
    r: page.data[index] ?? 0,
  }
}

export function readAlpha(page: CalloutPartPageInput, x: number, y: number): number {
  return page.data[(y * page.width + x) * RGBA_CHANNEL_COUNT + ALPHA_CHANNEL] ?? 0
}

export function colorDistance(left: RgbColor, right: RgbColor): number {
  return Math.sqrt(
    (left.r - right.r) ** 2 +
    (left.g - right.g) ** 2 +
    (left.b - right.b) ** 2,
  )
}

export function colorLuma(color: RgbColor): number {
  return color.r * 0.299 + color.g * 0.587 + color.b * 0.114
}

export function readCalloutBackground(
  page: CalloutPartPageInput,
  calloutRegion: Region,
  suppliedBackground?: RgbColor,
): RgbColor {
  if (suppliedBackground) {
    return suppliedBackground
  }

  const sampleRegion = insetRegion(calloutRegion, 3)
  const buckets = new Map<string, { color: RgbColor; count: number }>()

  for (let y = sampleRegion.y; y < sampleRegion.y + sampleRegion.height; y += 2) {
    for (let x = sampleRegion.x; x < sampleRegion.x + sampleRegion.width; x += 2) {
      const color = readBackgroundSampleColor(page, x, y)

      if (!color) {
        continue
      }

      addBackgroundColorSample(buckets, color)
    }
  }

  const bucket = [...buckets.values()].sort((left, right) => right.count - left.count)[0]

  return bucket
    ? {
        b: Math.round(bucket.color.b / bucket.count),
        g: Math.round(bucket.color.g / bucket.count),
        r: Math.round(bucket.color.r / bucket.count),
      }
    : { b: 255, g: 255, r: 255 }
}

function readBackgroundSampleColor(
  page: CalloutPartPageInput,
  x: number,
  y: number,
): RgbColor | null {
  if (readAlpha(page, x, y) < 32) {
    return null
  }

  const color = readPixel(page, x, y)

  return colorLuma(color) >= 120 ? color : null
}

function addBackgroundColorSample(
  buckets: Map<string, { color: RgbColor; count: number }>,
  color: RgbColor,
): void {
  const key = createBackgroundColorBucketKey(color)
  const bucket = buckets.get(key)

  if (bucket) {
    bucket.color.r += color.r
    bucket.color.g += color.g
    bucket.color.b += color.b
    bucket.count += 1
    return
  }

  buckets.set(key, { color: { ...color }, count: 1 })
}

function createBackgroundColorBucketKey(color: RgbColor): string {
  return [
    Math.round(color.r / 12),
    Math.round(color.g / 12),
    Math.round(color.b / 12),
  ].join(":")
}
