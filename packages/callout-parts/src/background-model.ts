import type { CalloutPartPageInput, Region, RgbColor } from "./contracts"
import { colorDistance, colorLuma, readAlpha, readPixel } from "./pixels"
import { regionContainsPoint } from "./regions"

export type BackgroundKind = "flat" | "gradient" | "mixed"

export interface BackgroundBucketDiagnostic {
  accepted: boolean
  color: RgbColor
  count: number
  reason: "accepted-gradient" | "compact" | "far-base" | "near-base" | "unsafe" | "weak"
  safeCount: number
  spanX: number
  spanY: number
  tileCount: number
}

export interface BackgroundModel {
  buckets: BackgroundBucketDiagnostic[]
  colors: RgbColor[]
  kind: BackgroundKind
}

export interface BackgroundColorMatch {
  distance: number
  isBackgroundLike: boolean
  limit: number
  nearest: RgbColor
}

const BACKGROUND_BUCKET_SIZE = 10
const BACKGROUND_SAMPLE_STEP = 2
const BACKGROUND_LUMA_MIN = 170
const BACKGROUND_BUCKET_MIN_COUNT = 8
const BACKGROUND_BUCKET_RELATIVE_MIN = 0.06
const BACKGROUND_BUCKET_DISTANCE_MIN = 18
const BACKGROUND_BUCKET_DISTANCE_MAX = 96
const BACKGROUND_BUCKET_LIMIT = 14
const BACKGROUND_BUCKET_SAFE_RATIO_MIN = 0.08
const BACKGROUND_BUCKET_SAFE_MIN_COUNT = 6
const BACKGROUND_BUCKET_SPAN_MIN_RATIO = 0.18
const BACKGROUND_BUCKET_BROAD_SPAN_RATIO = 0.35
const BACKGROUND_BUCKET_WIDE_SPAN_RATIO = 0.6
const BACKGROUND_BUCKET_MIN_TILES = 4
const BACKGROUND_SAFE_BAND_MIN = 5
const BACKGROUND_SAFE_BAND_RATIO = 0.16
const BACKGROUND_DISTANCE_LIMIT = 14
const SATURATED_BACKGROUND_DISTANCE_LIMIT = 48
const SATURATED_BACKGROUND_CHROMA_MIN = 90

interface BackgroundModelOptions {
  excludedRegions?: readonly Region[]
}

interface BackgroundBucket {
  color: RgbColor
  count: number
  maxX: number
  maxY: number
  minX: number
  minY: number
  safeCount: number
  tiles: Set<string>
}

export function createBackgroundModel(
  page: CalloutPartPageInput,
  region: Region,
  baseBackground: RgbColor,
  options: BackgroundModelOptions = {},
): BackgroundModel {
  const buckets = new Map<string, BackgroundBucket>()
  const excludedRegions = options.excludedRegions ?? []

  for (let y = region.y; y < region.y + region.height; y += BACKGROUND_SAMPLE_STEP) {
    for (let x = region.x; x < region.x + region.width; x += BACKGROUND_SAMPLE_STEP) {
      if (readAlpha(page, x, y) < 32 || excludedRegions.some((excluded) => regionContainsPoint(excluded, x, y))) {
        continue
      }

      const color = readPixel(page, x, y)

      if (!isBackgroundSampleColor(color)) {
        continue
      }

      addBucketSample(buckets, color, region, x, y)
    }
  }
  const selection = selectBackgroundBucketColors(buckets, region, baseBackground)

  return {
    buckets: selection.diagnostics,
    colors: [baseBackground, ...selection.colors],
    kind: selection.kind,
  }
}

export function createFlatBackgroundModel(baseBackground: RgbColor): BackgroundModel {
  return {
    buckets: [],
    colors: [baseBackground],
    kind: "flat",
  }
}

export function backgroundDistance(model: BackgroundModel, color: RgbColor): number {
  return matchBackgroundColor(model, color).distance
}

export function matchBackgroundColor(model: BackgroundModel, color: RgbColor): BackgroundColorMatch {
  const nearest = nearestBackgroundColor(model, color)
  const distance = colorDistance(color, nearest)
  const limit = backgroundDistanceLimit(nearest)

  return {
    distance,
    isBackgroundLike: distance <= limit,
    limit,
    nearest,
  }
}

export function nearestBackgroundColor(model: BackgroundModel, color: RgbColor): RgbColor {
  return model.colors.reduce((nearest, background) => (
    colorDistance(color, background) < colorDistance(color, nearest)
      ? background
      : nearest
  ), model.colors[0])
}

export function colorChroma(color: RgbColor): number {
  return Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b)
}

function backgroundDistanceLimit(background: RgbColor): number {
  return colorChroma(background) >= SATURATED_BACKGROUND_CHROMA_MIN
    ? SATURATED_BACKGROUND_DISTANCE_LIMIT
    : BACKGROUND_DISTANCE_LIMIT
}

function isBackgroundSampleColor(color: RgbColor): boolean {
  return colorLuma(color) >= BACKGROUND_LUMA_MIN
}

function addBucketSample(
  buckets: Map<string, BackgroundBucket>,
  color: RgbColor,
  region: Region,
  x: number,
  y: number,
): void {
  const key = [
    Math.round(color.r / BACKGROUND_BUCKET_SIZE),
    Math.round(color.g / BACKGROUND_BUCKET_SIZE),
    Math.round(color.b / BACKGROUND_BUCKET_SIZE),
  ].join(":")
  const bucket = buckets.get(key)

  if (bucket) {
    bucket.color.r += color.r
    bucket.color.g += color.g
    bucket.color.b += color.b
    bucket.count += 1
    bucket.maxX = Math.max(bucket.maxX, x)
    bucket.maxY = Math.max(bucket.maxY, y)
    bucket.minX = Math.min(bucket.minX, x)
    bucket.minY = Math.min(bucket.minY, y)
    bucket.safeCount += isSafeBackgroundSample(region, x, y) ? 1 : 0
    bucket.tiles.add(createTileKey(region, x, y))
    return
  }

  buckets.set(key, {
    color: { ...color },
    count: 1,
    maxX: x,
    maxY: y,
    minX: x,
    minY: y,
    safeCount: isSafeBackgroundSample(region, x, y) ? 1 : 0,
    tiles: new Set([createTileKey(region, x, y)]),
  })
}

function selectBackgroundBucketColors(
  buckets: Map<string, BackgroundBucket>,
  region: Region,
  baseBackground: RgbColor,
): {
  colors: RgbColor[]
  diagnostics: BackgroundBucketDiagnostic[]
  kind: BackgroundKind
} {
  const sorted = [...buckets.values()].sort((left, right) => right.count - left.count)
  const strongestCount = sorted[0]?.count ?? 0
  const selected: RgbColor[] = []
  const diagnostics: BackgroundBucketDiagnostic[] = []
  let rejectedStrongExtraCount = 0

  for (const bucket of sorted) {
    if (diagnostics.length >= BACKGROUND_BUCKET_LIMIT) {
      break
    }

    if (!isStrongBackgroundBucket(bucket, strongestCount)) {
      diagnostics.push(createBucketDiagnostic(bucket, "weak", false))
      continue
    }

    const decision = readBucketSelection(bucket, region, baseBackground, selected)

    rejectedStrongExtraCount += decision.rejectedStrongExtraCount
    diagnostics.push(decision.diagnostic)

    if (decision.color) {
      selected.push(decision.color)
    }
  }

  return {
    colors: selected,
    diagnostics,
    kind: readBackgroundKind(selected.length, rejectedStrongExtraCount),
  }
}

function readBucketSelection(
  bucket: BackgroundBucket,
  region: Region,
  baseBackground: RgbColor,
  selected: readonly RgbColor[],
): {
  color: RgbColor | null
  diagnostic: BackgroundBucketDiagnostic
  rejectedStrongExtraCount: number
} {
  const color = averageBucketColor(bucket)
  const reason = readBucketSelectionReason(bucket, region, color, baseBackground)
  const accepted = reason === "accepted-gradient" &&
    selected.every((entry) => colorDistance(entry, color) >= BACKGROUND_BUCKET_DISTANCE_MIN)

  return {
    color: accepted ? color : null,
    diagnostic: createBucketDiagnostic(bucket, reason, accepted, color),
    rejectedStrongExtraCount: !accepted && reason !== "near-base" ? 1 : 0,
  }
}

function readBackgroundKind(selectedCount: number, rejectedStrongExtraCount: number): BackgroundKind {
  if (selectedCount > 0) {
    return "gradient"
  }

  return rejectedStrongExtraCount > 0 ? "mixed" : "flat"
}

function isStrongBackgroundBucket(
  bucket: { count: number },
  strongestCount: number,
): boolean {
  return bucket.count >= BACKGROUND_BUCKET_MIN_COUNT &&
    bucket.count >= strongestCount * BACKGROUND_BUCKET_RELATIVE_MIN
}

function readBucketSelectionReason(
  bucket: BackgroundBucket,
  region: Region,
  color: RgbColor,
  baseBackground: RgbColor,
): BackgroundBucketDiagnostic["reason"] {
  if (colorDistance(color, baseBackground) <= backgroundDistanceLimit(baseBackground)) {
    return "near-base"
  }

  if (colorDistance(color, baseBackground) > BACKGROUND_BUCKET_DISTANCE_MAX) {
    return "far-base"
  }

  if (!hasSafeFillEvidence(bucket)) {
    return "unsafe"
  }

  if (!hasBroadSpatialSpread(bucket, region)) {
    return "compact"
  }

  return "accepted-gradient"
}

function hasSafeFillEvidence(bucket: BackgroundBucket): boolean {
  const safeMinimum = Math.min(
    BACKGROUND_BUCKET_SAFE_MIN_COUNT,
    Math.max(2, Math.ceil(bucket.count * BACKGROUND_BUCKET_SAFE_RATIO_MIN)),
  )

  return bucket.safeCount >= safeMinimum
}

function hasBroadSpatialSpread(bucket: BackgroundBucket, region: Region): boolean {
  const spanXRatio = (bucket.maxX - bucket.minX + 1) / Math.max(1, region.width)
  const spanYRatio = (bucket.maxY - bucket.minY + 1) / Math.max(1, region.height)
  const broadAreaFill = spanXRatio >= BACKGROUND_BUCKET_BROAD_SPAN_RATIO &&
    spanYRatio >= BACKGROUND_BUCKET_BROAD_SPAN_RATIO
  const wideHorizontalFill = spanXRatio >= BACKGROUND_BUCKET_WIDE_SPAN_RATIO &&
    spanYRatio >= BACKGROUND_BUCKET_SPAN_MIN_RATIO

  return bucket.tiles.size >= BACKGROUND_BUCKET_MIN_TILES &&
    (broadAreaFill || wideHorizontalFill)
}

function createBucketDiagnostic(
  bucket: BackgroundBucket,
  reason: BackgroundBucketDiagnostic["reason"],
  accepted: boolean,
  color = averageBucketColor(bucket),
): BackgroundBucketDiagnostic {
  return {
    accepted,
    color,
    count: bucket.count,
    reason,
    safeCount: bucket.safeCount,
    spanX: bucket.maxX - bucket.minX + 1,
    spanY: bucket.maxY - bucket.minY + 1,
    tileCount: bucket.tiles.size,
  }
}

function averageBucketColor(bucket: { color: RgbColor; count: number }): RgbColor {
  return {
    b: Math.round(bucket.color.b / bucket.count),
    g: Math.round(bucket.color.g / bucket.count),
    r: Math.round(bucket.color.r / bucket.count),
  }
}

function isSafeBackgroundSample(region: Region, x: number, y: number): boolean {
  const band = Math.max(
    BACKGROUND_SAFE_BAND_MIN,
    Math.round(Math.min(region.width, region.height) * BACKGROUND_SAFE_BAND_RATIO),
  )

  return x < region.x + band ||
    x >= region.x + region.width - band ||
    y < region.y + band ||
    y >= region.y + region.height - band
}

function createTileKey(region: Region, x: number, y: number): string {
  const tileSize = Math.max(6, Math.round(Math.min(region.width, region.height) / 8))

  return [
    Math.floor((x - region.x) / tileSize),
    Math.floor((y - region.y) / tileSize),
  ].join(":")
}
