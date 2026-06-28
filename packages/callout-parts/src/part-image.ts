import type { CalloutPartImage, CalloutPartPageInput, Region } from "./contracts"
import {
  type BackgroundModel,
} from "./background-model"
import {
  createPartAlphaMask,
  type PartImagePoint,
} from "./part-alpha-mask"
import { trimPartAlphaMask } from "./part-alpha-trim"
import type { LabelSuppressionMask } from "./label-suppression"
import { clipRegionTop, readExcludedUpperLabelClipTop } from "./part-crop-top-recovery"
import type { LowContrastFaceSupportMode } from "./part-support-types"

interface PartImageOptions {
  allowLongShallowTopRecovery?: boolean
  enableLowContrastFaceSupport?: boolean
  lowContrastFaceSupportMode?: LowContrastFaceSupportMode
  allowTopCropContext?: boolean
  enableTopSupport?: boolean
}

export function createPartImage(
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  ownedRegion?: Region,
  excludedRegions: readonly Region[] = [],
  foregroundPixels?: readonly PartImagePoint[],
  labelSuppressionMasks: readonly LabelSuppressionMask[] = [],
  options: PartImageOptions = {},
): CalloutPartImage {
  const selectedForegroundPixels = foregroundPixels ?? []
  const rawForegroundBounds = readPointBounds(selectedForegroundPixels)
  const upperLabelClipTop = readExcludedUpperLabelClipTop(excludedRegions, rawForegroundBounds)
  const clippedRegion = clipRegionTop(region, upperLabelClipTop)
  const clippedOwnedRegion = ownedRegion ? clipRegionTop(ownedRegion, upperLabelClipTop) : undefined
  const topSupportEnabled = shouldEnableTopSupportForForeground(
    options.enableTopSupport ?? true,
    rawForegroundBounds,
    options.allowTopCropContext,
  )
  const alphaMaskResult = createPartAlphaMask(page, clippedRegion, background, {
    allowLongShallowTopRecovery: options.allowLongShallowTopRecovery,
    enableLowContrastFaceSupport: options.enableLowContrastFaceSupport,
    enableTopSupport: topSupportEnabled,
    foregroundPixels: selectedForegroundPixels.length > 0 ? selectedForegroundPixels : undefined,
    labelSuppressionMasks,
    lowContrastFaceSupportMode: options.lowContrastFaceSupportMode,
    ownedRegion: clippedOwnedRegion,
  })
  const alphaTrim = trimPartAlphaMask({
    allowLongShallowTopRecovery: options.allowLongShallowTopRecovery,
    allowTopCropContext: options.allowTopCropContext,
    alphaMask: alphaMaskResult.alphaMask,
    foregroundBounds: rawForegroundBounds,
    foregroundPixelCount: selectedForegroundPixels.length,
    ownedRegion: clippedOwnedRegion,
    region: clippedRegion,
    supportPixelsAdded: alphaMaskResult.supportPixelsAdded,
  })
  const image: CalloutPartImage = {
    alphaMask: alphaTrim.alphaMask,
    diagnostics: {
      alphaBounds: translateRegion(alphaTrim.alphaBounds, clippedRegion.x, clippedRegion.y),
      excludedLabelRegions: [...excludedRegions],
      imageRegionBeforeAlphaTrim: clippedRegion,
      ownedRegion: clippedOwnedRegion,
      rawForegroundBounds,
      rawForegroundPixelCount: selectedForegroundPixels.length,
    },
    region: alphaTrim.region,
  }

  return image.diagnostics
    ? {
        ...image,
        diagnostics: {
          ...image.diagnostics,
          finalCropBounds: image.region,
        },
      }
    : image
}

function shouldEnableTopSupportForForeground(
  requested: boolean,
  foregroundBounds: Region | undefined,
  allowTopCropContext = false,
): boolean {
  if (!requested) {
    return false
  }

  if (!foregroundBounds || allowTopCropContext) {
    return true
  }

  return true
}

function readPointBounds(points: readonly PartImagePoint[]): Region | undefined {
  if (points.length === 0) {
    return undefined
  }

  let left = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY

  for (const point of points) {
    left = Math.min(left, point.x)
    right = Math.max(right, point.x)
    top = Math.min(top, point.y)
    bottom = Math.max(bottom, point.y)
  }

  return {
    height: bottom - top + 1,
    width: right - left + 1,
    x: left,
    y: top,
  }
}

function translateRegion(region: Region | undefined, x: number, y: number): Region | undefined {
  return region
    ? {
        ...region,
        x: region.x + x,
        y: region.y + y,
      }
    : undefined
}
