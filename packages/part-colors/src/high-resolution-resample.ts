import { rgbToLch } from "./color-space"
import type {
  PartColorRegion,
  PartColorSample,
  PartColorSampleInput,
  RgbColor,
} from "./contracts"

const HIGH_RES_FALLBACK_DOMINANT_COVERAGE_MAX = 0.45
const HIGH_RES_FALLBACK_DOMINANT_GAIN_MIN = 0.5
const HIGH_RES_FALLBACK_EDGE_RATIO_MIN = 0.45
const HIGH_RES_FALLBACK_MIN_SCALE = 1.35
const HIGH_RES_FALLBACK_PIXEL_COUNT_MAX = 220
const HIGH_RES_FALLBACK_STABLE_TINY_WARM_CHROMA_MIN = 12
const HIGH_RES_FALLBACK_STABLE_TINY_WARM_DOMINANT_GAIN_MIN = 0.18
const HIGH_RES_FALLBACK_STABLE_TINY_WARM_HUE_MAX = 95
const HIGH_RES_FALLBACK_STABLE_TINY_WARM_HUE_MIN = 25
const HIGH_RES_FALLBACK_STABLE_TINY_WARM_LUMA_MAX = 95
const HIGH_RES_FALLBACK_STABILITY_GAIN_MIN = 0.75
const HIGH_RES_FALLBACK_VARIANCE_MIN = 8
const HIGH_RES_FALLBACK_VARIANCE_GAIN_MIN = 2

export type PartColorSampleRunner = (input: PartColorSampleInput) => PartColorSample | null

export function chooseHighResolutionPartColorSample(
  input: PartColorSampleInput,
  baseSample: PartColorSample | null,
  sampleInput: PartColorSampleRunner,
): PartColorSample | null {
  const highResolution = input.highResolution

  if (!baseSample || !highResolution) {
    return baseSample
  }

  const reason = readHighResolutionResampleReason(baseSample)

  if (!reason) {
    return baseSample
  }

  const scaleX = finitePositiveScale(highResolution.scaleX)
  const scaleY = finitePositiveScale(highResolution.scaleY)

  if (!scaleX || !scaleY || Math.min(scaleX, scaleY) < HIGH_RES_FALLBACK_MIN_SCALE) {
    return baseSample
  }

  const highResolutionSample = sampleInput({
    background: input.background,
    excludedRegions: scaleRegions(input.excludedRegions ?? [], scaleX, scaleY),
    page: highResolution.page,
    partImage: scalePartColorImage(input.partImage, scaleX, scaleY),
  })

  if (!shouldUseHighResolutionSample(baseSample, highResolutionSample)) {
    return baseSample
  }

  return {
    ...highResolutionSample,
    baseChips: baseSample.chips,
    baseDominantCoverage: baseSample.dominantCoverage,
    baseEdgeChips: baseSample.edgeChips,
    basePixelCount: baseSample.pixelCount,
    baseRejectedPixelCount: baseSample.rejectedPixelCount,
    baseRejectionCounts: baseSample.rejectionCounts,
    baseStatus: baseSample.status,
    baseVariance: baseSample.variance,
    resampleReason: reason,
    sampleScale: Math.min(scaleX, scaleY),
  }
}

function readHighResolutionResampleReason(sample: PartColorSample): string | null {
  const reasons: string[] = []
  const edgeRatio = readSampleEdgeRatio(sample)

  if (sample.pixelCount <= HIGH_RES_FALLBACK_PIXEL_COUNT_MAX) {
    reasons.push("tiny")
  }

  if (sample.status === "review" || sample.status === "weak-classifiable") {
    reasons.push("review")
  }

  if (isStableTinyWarmSample(sample)) {
    reasons.push("warm")
  }

  if (edgeRatio >= HIGH_RES_FALLBACK_EDGE_RATIO_MIN) {
    reasons.push("edge")
  }

  if (sample.dominantCoverage <= HIGH_RES_FALLBACK_DOMINANT_COVERAGE_MAX) {
    reasons.push("mixed")
  }

  if (sample.variance >= HIGH_RES_FALLBACK_VARIANCE_MIN) {
    reasons.push("variance")
  }

  return reasons.length > 0 ? reasons.join("+") : null
}

function readSampleEdgeRatio(sample: PartColorSample): number {
  const edgeCount = sample.rejectionCounts.edge ?? 0
  const total = sample.pixelCount + edgeCount

  return total > 0 ? edgeCount / total : 0
}

function finitePositiveScale(scale: number): number | null {
  return Number.isFinite(scale) && scale > 0 ? scale : null
}

function scalePartColorImage(
  partImage: PartColorSampleInput["partImage"],
  scaleX: number,
  scaleY: number,
): PartColorSampleInput["partImage"] {
  const width = Math.max(1, Math.round(partImage.alphaMask.width * scaleX))
  const height = Math.max(1, Math.round(partImage.alphaMask.height * scaleY))
  const data = new Uint8ClampedArray(width * height)

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(partImage.alphaMask.height - 1, Math.floor(y / scaleY))

    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(partImage.alphaMask.width - 1, Math.floor(x / scaleX))

      data[y * width + x] = partImage.alphaMask.data[sourceY * partImage.alphaMask.width + sourceX] ?? 0
    }
  }

  return {
    alphaMask: { data, height, width },
    region: scaleRegion(partImage.region, scaleX, scaleY),
  }
}

function scaleRegions(
  regions: readonly PartColorRegion[],
  scaleX: number,
  scaleY: number,
): PartColorRegion[] {
  return regions.map((region) => scaleRegion(region, scaleX, scaleY))
}

function scaleRegion(region: PartColorRegion, scaleX: number, scaleY: number): PartColorRegion {
  return {
    height: Math.max(0, Math.round(region.height * scaleY)),
    width: Math.max(0, Math.round(region.width * scaleX)),
    x: Math.round(region.x * scaleX),
    y: Math.round(region.y * scaleY),
  }
}

function shouldUseHighResolutionSample(
  baseSample: PartColorSample,
  highResolutionSample: PartColorSample | null,
): highResolutionSample is PartColorSample {
  if (!highResolutionSample || highResolutionSample.status !== "stable") {
    return false
  }

  if (isStableTinyWarmSample(baseSample)) {
    return highResolutionSample.dominantCoverage >=
      baseSample.dominantCoverage + HIGH_RES_FALLBACK_STABLE_TINY_WARM_DOMINANT_GAIN_MIN ||
      highResolutionSample.variance <= baseSample.variance - HIGH_RES_FALLBACK_VARIANCE_GAIN_MIN
  }

  if (baseSample.status !== "review" && baseSample.status !== "weak-classifiable") {
    return false
  }

  return highResolutionSample.stability >= baseSample.stability + HIGH_RES_FALLBACK_STABILITY_GAIN_MIN ||
    highResolutionSample.dominantCoverage >= baseSample.dominantCoverage + HIGH_RES_FALLBACK_DOMINANT_GAIN_MIN ||
    highResolutionSample.variance <= baseSample.variance - 1
}

function isStableTinyWarmSample(sample: PartColorSample): boolean {
  if (sample.status !== "stable" || sample.pixelCount > HIGH_RES_FALLBACK_PIXEL_COUNT_MAX) {
    return false
  }

  const lch = rgbToLch(sample.rgb)
  const luma = colorLuma(sample.rgb)

  return luma <= HIGH_RES_FALLBACK_STABLE_TINY_WARM_LUMA_MAX &&
    lch.c >= HIGH_RES_FALLBACK_STABLE_TINY_WARM_CHROMA_MIN &&
    lch.h >= HIGH_RES_FALLBACK_STABLE_TINY_WARM_HUE_MIN &&
    lch.h <= HIGH_RES_FALLBACK_STABLE_TINY_WARM_HUE_MAX
}

function colorLuma(rgb: RgbColor): number {
  return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b
}
