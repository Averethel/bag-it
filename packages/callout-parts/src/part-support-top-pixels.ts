import { matchBackgroundColor, type BackgroundModel } from "./background-model"
import type { CalloutPartPageInput, Region } from "./contracts"
import {
  isPotentialPartSupportPixel,
  SUPPORT_ALPHA_DISTANCE_MIN,
  SUPPORT_TOP_ALPHA_DISTANCE_LOOSE_MIN,
  SUPPORT_TOP_ALPHA_DISTANCE_MIN,
  SUPPORT_TOP_DARK_BACKGROUND_LUMA_DROP_MIN,
} from "./part-support-common"
import { colorDistance, colorLuma, readAlpha, readPixel } from "./pixels"

const LONG_SHALLOW_FACE_DISTANCE_MIN = 1
const LONG_SHALLOW_FACE_LUMA_DROP_MIN = 1
const LONG_SHALLOW_END_CAP_BASE_DISTANCE_MAX = 48
const LONG_SHALLOW_END_CAP_BASE_DISTANCE_MIN = 18
const LONG_SHALLOW_END_CAP_LUMA_DROP_MIN = 4
const LONG_SHALLOW_HIGHLIGHT_DISTANCE_MIN = 4
const LONG_SHALLOW_HIGHLIGHT_DISTANCE_MAX = 34

export function isOwnedEnvelopeVisiblePartPixel(
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  x: number,
  y: number,
): boolean {
  const pageX = region.x + x
  const pageY = region.y + y

  if (readAlpha(page, pageX, pageY) < 32) {
    return false
  }

  const match = matchBackgroundColor(background, readPixel(page, pageX, pageY))

  return match.distance >= 1 && (!match.isBackgroundLike || isLongShallowHighlightPixel(page, region, background, x, y))
}

export function isLongShallowFaceSupportPixel(
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  x: number,
  y: number,
): boolean {
  const pageX = region.x + x
  const pageY = region.y + y

  if (isPotentialPartSupportPixel(
    page,
    pageX,
    pageY,
    background,
    LONG_SHALLOW_FACE_DISTANCE_MIN,
    {
      allowDarkBackgroundLike: true,
      lumaDropMin: LONG_SHALLOW_FACE_LUMA_DROP_MIN,
      nearBackgroundDistanceMin: LONG_SHALLOW_FACE_DISTANCE_MIN,
    },
  )) {
    return true
  }

  return isLongShallowHighlightPixel(page, region, background, x, y)
}

export function isLongShallowContinuationPixel(
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  x: number,
  y: number,
): boolean {
  return isPotentialPartSupportPixel(
    page,
    region.x + x,
    region.y + y,
    background,
    SUPPORT_ALPHA_DISTANCE_MIN,
    {
      allowDarkBackgroundLike: true,
      lumaDropMin: SUPPORT_TOP_DARK_BACKGROUND_LUMA_DROP_MIN,
      nearBackgroundDistanceMin: SUPPORT_ALPHA_DISTANCE_MIN,
    },
  )
}

export function isConnectedLongShallowEndCapPixel(
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  x: number,
  y: number,
): boolean {
  const pageX = region.x + x
  const pageY = region.y + y

  if (readAlpha(page, pageX, pageY) < 32) {
    return false
  }

  const color = readPixel(page, pageX, pageY)
  const match = matchBackgroundColor(background, color)
  const distance = colorDistance(color, match.nearest)

  return distance >= LONG_SHALLOW_END_CAP_BASE_DISTANCE_MIN &&
    distance <= LONG_SHALLOW_END_CAP_BASE_DISTANCE_MAX &&
    colorLuma(color) <= colorLuma(match.nearest) - LONG_SHALLOW_END_CAP_LUMA_DROP_MIN
}

export function isLongShallowHighlightPixel(
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  x: number,
  y: number,
): boolean {
  const pageX = region.x + x
  const pageY = region.y + y

  if (readAlpha(page, pageX, pageY) < 32) {
    return false
  }

  const color = readPixel(page, pageX, pageY)
  const match = matchBackgroundColor(background, color)

  if (
    match.distance < LONG_SHALLOW_HIGHLIGHT_DISTANCE_MIN ||
    match.distance > LONG_SHALLOW_HIGHLIGHT_DISTANCE_MAX
  ) {
    return false
  }

  return !match.isBackgroundLike ||
    colorLuma(color) <= colorLuma(match.nearest) - SUPPORT_TOP_DARK_BACKGROUND_LUMA_DROP_MIN
}

export function isTopGapBridgePixel(
  page: CalloutPartPageInput,
  x: number,
  y: number,
  background: BackgroundModel,
): boolean {
  return isPotentialPartSupportPixel(
    page,
    x,
    y,
    background,
    SUPPORT_TOP_ALPHA_DISTANCE_MIN,
    {
      allowDarkBackgroundLike: true,
      lumaDropMin: SUPPORT_TOP_DARK_BACKGROUND_LUMA_DROP_MIN,
      nearBackgroundDistanceMin: SUPPORT_TOP_ALPHA_DISTANCE_LOOSE_MIN,
    },
  )
}
