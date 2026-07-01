import type { BackgroundModel } from "./background-model"
import type { CalloutPartPageInput, Region } from "./contracts"
import {
  type MaskRun,
  readMaskRuns,
  readMaskValueBounds,
  SUPPORT_TOP_FACE,
  writeSupportPixel,
} from "./part-support-common"
import {
  fillLongShallowConnectedEndCapSupport,
  fillLongShallowEndCapSupportHoles,
  fillLongShallowHighlightInteriorSupport,
  fillLongShallowHorizontalContinuationSupport,
  fillLongShallowLocalWeakFaceSupport,
  fillLongShallowWeakFaceSupport,
} from "./part-support-long-shallow"
import { fillOwnedEnvelopeWeakTopSupport } from "./part-support-owned-envelope"
import { isTopGapBridgePixel } from "./part-support-top-pixels"
import { isWideShallowSupport } from "./part-support-top-geometry"
import type { LowContrastFaceSupportMode } from "./part-support-types"

const TOP_GAP_BRIDGE_MAX = 18
const TOP_GAP_BRIDGE_LONG_SHALLOW_MAX = 30
const TOP_GAP_BRIDGE_MIN_RUN = 12

export function fillTopGapBridgeSupport(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  ownedRegion?: Region,
  enableLowContrastFaceSupport = false,
  lowContrastFaceSupportMode?: LowContrastFaceSupportMode,
  ownedSeedBounds?: Region,
): void {
  const bounds = readMaskValueBounds(mask, region.width, region.height)

  if (!bounds) {
    return
  }
  const longShallowBounds = ownedSeedBounds ?? bounds
  const enableScaledLongShallowLift = Boolean(ownedSeedBounds)

  fillOwnedEnvelopeWeakTopSupport(
    mask,
    page,
    region,
    background,
    longShallowBounds,
    ownedRegion,
    enableLowContrastFaceSupport,
    lowContrastFaceSupportMode,
  )
  fillLongShallowLocalWeakFaceSupport(mask, page, region, background, longShallowBounds, enableScaledLongShallowLift)
  fillLongShallowWeakFaceSupport(mask, page, region, background, longShallowBounds, enableScaledLongShallowLift)
  fillLongShallowHorizontalContinuationSupport(mask, page, region, background, longShallowBounds)
  fillLongShallowHighlightInteriorSupport(mask, page, region, background, longShallowBounds)
  fillLongShallowConnectedEndCapSupport(mask, page, region, background, longShallowBounds, enableScaledLongShallowLift)

  const updatedBounds = readMaskValueBounds(mask, region.width, region.height) ?? bounds

  if (updatedBounds.y <= 0 || updatedBounds.y > readTopGapBridgeMax(region, updatedBounds)) {
    return
  }

  const minRunWidth = readTopGapBridgeMinRunWidth(region, updatedBounds)

  for (const run of readMaskRuns(mask, region.width, updatedBounds.y)) {
    if (run.right - run.left + 1 < minRunWidth) {
      continue
    }

    fillTopGapBridgeRun(mask, page, region, background, updatedBounds.y, run, isWideShallowSupport(region, updatedBounds))
  }

  fillLongShallowConnectedEndCapSupport(mask, page, region, background, longShallowBounds, enableScaledLongShallowLift)
  fillLongShallowEndCapSupportHoles(mask, page, region, longShallowBounds, enableScaledLongShallowLift)
}

function readTopGapBridgeMax(region: Region, bounds: Region): number {
  if (isWideShallowSupport(region, bounds)) {
    return TOP_GAP_BRIDGE_LONG_SHALLOW_MAX
  }

  return TOP_GAP_BRIDGE_MAX
}

function readTopGapBridgeMinRunWidth(region: Region, bounds: Region): number {
  const regionRatio = isWideShallowSupport(region, bounds) ? 0.22 : 0.3

  return Math.max(TOP_GAP_BRIDGE_MIN_RUN, Math.round(region.width * regionRatio))
}

function fillTopGapBridgeRun(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  firstSupportY: number,
  run: MaskRun,
  isLongShallow: boolean,
): void {
  const runWidth = run.right - run.left + 1

  for (let y = firstSupportY - 1; y >= 0; y -= 1) {
    const lift = firstSupportY - y
    const bounds = readTopGapBridgeRunBounds(run, runWidth, lift, firstSupportY, region.width, isLongShallow)

    for (let x = bounds.left; x <= bounds.right; x += 1) {
      if (isTopGapBridgePixel(page, region.x + x, region.y + y, background)) {
        writeSupportPixel(mask, region.width, x, y, SUPPORT_TOP_FACE)
      }
    }
  }
}

function readTopGapBridgeRunBounds(
  run: MaskRun,
  runWidth: number,
  lift: number,
  firstSupportY: number,
  regionWidth: number,
  isLongShallow: boolean,
): MaskRun {
  if (isLongShallow) {
    const expansion = Math.min(Math.ceil(lift / 3) + 1, Math.max(4, Math.floor(runWidth / 3)))

    return {
      left: Math.max(0, run.left - Math.floor(expansion / 2)),
      right: Math.min(regionWidth - 1, run.right + expansion),
    }
  }

  const inset = Math.min(Math.floor((lift * runWidth) / Math.max(1, firstSupportY * 5)), Math.floor(runWidth / 4))

  return {
    left: run.left + inset,
    right: run.right - inset,
  }
}
