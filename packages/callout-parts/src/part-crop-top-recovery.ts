import type { CalloutQuantityLabel, Region } from "./contracts"
import type { OwnershipZone } from "./part-ownership"

export function readUpperLabelClipTop(
  ownerLabel: Region,
  labels: readonly CalloutQuantityLabel[],
  rawRegion: Region,
): number | undefined {
  const upperLabels = labels
    .map((label) => label.region)
    .filter((label) => label.y + label.height < ownerLabel.y)
    .filter((label) => isAboveSelectedForeground(label, rawRegion))
    .filter((label) =>
      horizontallyConflictsWithRecoveredTop(label, rawRegion) ||
      isCloseUpperOwnerLabel(label, ownerLabel, rawRegion),
    )

  if (upperLabels.length === 0) {
    return undefined
  }

  return Math.max(...upperLabels.map((label) => label.y + label.height))
}

export function clipRegionTop(region: Region, top: number | undefined): Region {
  if (top === undefined || region.y >= top) {
    return region
  }

  const bottom = region.y + region.height
  const clippedTop = Math.min(top, bottom - 1)

  return {
    ...region,
    height: bottom - clippedTop,
    y: clippedTop,
  }
}

export function readExcludedUpperLabelClipTop(
  excludedRegions: readonly Region[],
  rawForegroundBounds: Region | undefined,
): number | undefined {
  if (!rawForegroundBounds) {
    return undefined
  }

  const rawRight = rawForegroundBounds.x + rawForegroundBounds.width
  const verticalTolerance = Math.max(24, Math.round(rawForegroundBounds.height * 0.9))
  const horizontalTolerance = Math.max(6, Math.round(Math.min(rawForegroundBounds.width, 18) * 0.45))
  const candidates = excludedRegions.filter((region) => {
    const bottom = region.y + region.height
    const verticalGap = rawForegroundBounds.y - bottom

    if (verticalGap < 0 || verticalGap > verticalTolerance) {
      return false
    }

    const tolerance = Math.max(1, Math.round(rawForegroundBounds.height * 0.08))
    if (bottom > rawForegroundBounds.y + tolerance) {
      return false
    }

    const regionRight = region.x + region.width
    const overlap = Math.min(regionRight, rawRight) - Math.max(region.x, rawForegroundBounds.x)
    const horizontalGap = Math.max(region.x - rawRight, rawForegroundBounds.x - regionRight, 0)

    return overlap > 0 || horizontalGap <= horizontalTolerance
  })

  return candidates.length > 0
    ? Math.max(...candidates.map((region) => region.y + region.height))
    : undefined
}

export function readRowSpanSearchLift(
  zone: OwnershipZone,
  interior: Region,
): number {
  const labelRegion = zone.label.region
  const zoneStartsAtInterior = zone.region.y <= interior.y + Math.max(2, Math.round(labelRegion.height * 0.25))

  if (zoneStartsAtInterior) {
    return 0
  }

  const rowGap = labelRegion.y - zone.region.y
  const rowSpanGap = Math.max(28, Math.round(labelRegion.height * 2.6))

  return rowGap >= rowSpanGap ? Math.max(36, Math.round(labelRegion.height * 8)) : 0
}

function isAboveSelectedForeground(label: Region, rawRegion: Region): boolean {
  const tolerance = Math.max(1, Math.round(rawRegion.height * 0.08))

  return label.y + label.height <= rawRegion.y + tolerance
}

function horizontallyConflictsWithRecoveredTop(label: Region, rawRegion: Region): boolean {
  const labelCenter = label.x + label.width / 2
  const overlap = Math.min(label.x + label.width, rawRegion.x + rawRegion.width) - Math.max(label.x, rawRegion.x)

  return (labelCenter >= rawRegion.x && labelCenter <= rawRegion.x + rawRegion.width) ||
    overlap >= Math.min(label.width, rawRegion.width) * 0.35
}

function isCloseUpperOwnerLabel(
  label: Region,
  ownerLabel: Region,
  rawRegion: Region,
): boolean {
  const verticalGap = rawRegion.y - (label.y + label.height)
  const labelCenterX = label.x + label.width / 2
  const ownerCenterX = ownerLabel.x + ownerLabel.width / 2
  const horizontalTolerance = Math.max(24, Math.max(label.width, ownerLabel.width) * 1.6)
  const verticalTolerance = Math.max(24, Math.round(ownerLabel.height * 2.2))

  return verticalGap >= 0 &&
    verticalGap <= verticalTolerance &&
    Math.abs(labelCenterX - ownerCenterX) <= horizontalTolerance
}
