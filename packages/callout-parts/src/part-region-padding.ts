import type { Region } from "./contracts"
import type { OwnershipZone } from "./part-ownership"
import { intersectRegions } from "./regions"

export interface PartRegionPaddingOptions {
  allowLongShallowTopRecovery?: boolean
}

export function padPartImageRegion(
  region: Region,
  labelRegion: Region,
  options: PartRegionPaddingOptions = {},
): Region {
  const leftPadding = Math.max(14, Math.round(labelRegion.height * 1.6))
  const rightPadding = Math.max(
    36,
    Math.round(labelRegion.height * 3),
    options.allowLongShallowTopRecovery
      ? readLongShallowRightPadding(region, labelRegion)
      : 0,
  )
  const topPadding = readPartTopPadding(region, labelRegion, options)
  const bottomPadding = Math.max(14, Math.round(labelRegion.height * 1.6))

  return {
    height: region.height + topPadding + bottomPadding,
    width: region.width + leftPadding + rightPadding,
    x: region.x - leftPadding,
    y: region.y - topPadding,
  }
}

export function padPartMaskRegion(
  region: Region,
  labelRegion: Region,
  options: PartRegionPaddingOptions = {},
): Region {
  const horizontalPadding = Math.max(8, Math.round(labelRegion.height * 0.75))
  const topPadding = readPartTopPadding(region, labelRegion, options)
  const bottomPadding = Math.max(14, Math.round(labelRegion.height * 1.6))

  return {
    height: region.height + topPadding + bottomPadding,
    width: region.width + horizontalPadding * 2,
    x: region.x - horizontalPadding,
    y: region.y - topPadding,
  }
}

export function clipToSelectedEnvelope(
  region: Region,
  ownedRegion: Region,
  zone: OwnershipZone,
  interior: Region,
): Region {
  const verticalClip = intersectRegions(zone.region, interior) ?? interior
  const top = Math.max(interior.y, Math.min(verticalClip.y, ownedRegion.y))
  const bottom = Math.min(
    interior.y + interior.height,
    Math.max(verticalClip.y + verticalClip.height, ownedRegion.y + ownedRegion.height),
  )
  const clip = {
    height: Math.max(1, bottom - top),
    width: interior.width,
    x: interior.x,
    y: top,
  }

  return intersectRegions(region, clip) ?? region
}

export function includeOwnedTopForTallPart(
  region: Region,
  ownedRegion: Region,
  rawRegion: Region,
  labelRegion: Region,
  interior: Region,
): Region {
  if (!isTallPartTopRecoveryCandidate(rawRegion, labelRegion)) {
    return region
  }

  const top = Math.max(interior.y, Math.min(region.y, ownedRegion.y))
  const bottom = region.y + region.height

  return {
    ...region,
    height: Math.max(1, bottom - top),
    y: top,
  }
}

function readPartTopPadding(
  region: Region,
  labelRegion: Region,
  options: PartRegionPaddingOptions,
): number {
  const labelPadding = Math.max(12, Math.round(labelRegion.height * 2.2))
  const componentPadding = Math.min(42, Math.round(region.height * 0.5))
  const deepTopRecoveryPadding = isDeepTopRecoveryCandidate(region, labelRegion)
    ? Math.max(Math.round(labelRegion.height * 3.2), Math.round(region.height * 1.35))
    : 0
  const longShallowTopRecoveryPadding = options.allowLongShallowTopRecovery &&
      isLongShallowTopRecoveryCandidate(region, labelRegion)
    ? Math.max(Math.round(labelRegion.height * 3.2), Math.round(region.height * 1.35))
    : 0

  return Math.max(labelPadding, componentPadding, deepTopRecoveryPadding, longShallowTopRecoveryPadding)
}

function isTallPartTopRecoveryCandidate(region: Region, labelRegion: Region): boolean {
  return region.height >= Math.max(28, labelRegion.height * 2.8) &&
    region.height >= region.width * 0.75
}

function isDeepTopRecoveryCandidate(region: Region, labelRegion: Region): boolean {
  const labelGap = labelRegion.y - (region.y + region.height)

  return region.height >= Math.max(24, labelRegion.height * 2.2) &&
    region.width >= region.height * 1.25 &&
    region.width <= region.height * 1.65 &&
    labelRegion.width <= labelRegion.height * 1.6 &&
    labelGap >= -Math.round(labelRegion.height * 0.25)
}

function isLongShallowTopRecoveryCandidate(region: Region, labelRegion: Region): boolean {
  const labelGap = labelRegion.y - (region.y + region.height)

  return region.width >= 56 &&
    region.width >= region.height * 2.2 &&
    region.height >= Math.max(18, labelRegion.height * 1.8) &&
    labelRegion.width <= labelRegion.height * 1.6 &&
    labelGap >= -Math.round(labelRegion.height * 0.35) &&
    labelGap <= Math.max(8, Math.round(labelRegion.height * 1.2))
}

function readLongShallowRightPadding(region: Region, labelRegion: Region): number {
  return isLongShallowTopRecoveryCandidate(region, labelRegion)
    ? Math.round(region.width * 0.75)
    : 0
}
