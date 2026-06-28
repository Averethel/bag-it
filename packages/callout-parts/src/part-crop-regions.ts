import type { CalloutPartPageInput, CalloutQuantityLabel, Region } from "./contracts"
import { MIN_PART_AREA } from "./part-foreground-constants"
import {
  boundsForPixels,
  selectOwnedForegroundPixels,
} from "./part-foreground-selection"
import {
  clipRegionTop,
  readRowSpanSearchLift,
  readUpperLabelClipTop,
} from "./part-crop-top-recovery"
import type { OwnershipZone } from "./part-ownership"
import { selectRelatedComponents } from "./part-related-components"
import {
  clipToSelectedEnvelope,
  includeOwnedTopForTallPart,
  padPartImageRegion,
  padPartMaskRegion,
} from "./part-region-padding"
import type { ScoredComponent } from "./part-component-scoring"
import { clampRegionToPage, regionArea } from "./regions"

export interface SelectedPartRegion {
  allowLongShallowTopRecovery: boolean
  foregroundPixels: Array<{ x: number; y: number }>
  ownedRegion: Region
  region: Region
}

export function createPartSearchRegion(
  zone: OwnershipZone,
  interior: Region,
): Region {
  const top = Math.max(interior.y, zone.region.y - readRowSpanSearchLift(zone, interior))
  const bottom = Math.min(interior.y + interior.height, zone.region.y + zone.region.height)

  return {
    height: Math.max(0, bottom - top),
    width: interior.width,
    x: interior.x,
    y: top,
  }
}

export function selectPartRegion(
  page: CalloutPartPageInput,
  components: readonly ScoredComponent[],
  zone: OwnershipZone,
  labels: readonly CalloutQuantityLabel[],
  interior: Region,
  options: {
    allowRelatedComponents?: boolean
    splitSameRowComponents?: boolean
    trimConnectedForegroundBelowLabel?: boolean
  } = {},
): SelectedPartRegion | null {
  const primary = components[0]

  if (!primary) {
    return null
  }

  const labelRegions = labels.map((label) => label.region)
  const selected = options.allowRelatedComponents === false
    ? [primary]
    : selectRelatedComponents(components, primary, zone.label.region, labelRegions)
  const foregroundPixels = selectOwnedForegroundPixels(
    selected.flatMap((candidate) => candidate.component.pixels),
    zone.label.region,
    labelRegions,
    {
      splitSameRowComponents: options.splitSameRowComponents ?? true,
      trimConnectedForegroundBelowLabel: options.trimConnectedForegroundBelowLabel,
    },
  )

  if (foregroundPixels.length === 0) {
    return null
  }

  const rawRegion = boundsForPixels(foregroundPixels)
  const upperLabelClipTop = readUpperLabelClipTop(zone.label.region, labels, rawRegion)
  const allowLongShallowTopRecovery = shouldAllowLongShallowTopRecovery(rawRegion, zone.label.region, interior)
  const paddingOptions = { allowLongShallowTopRecovery }
  const ownedRegion = clipRegionTop(padPartMaskRegion(rawRegion, zone.label.region, paddingOptions), upperLabelClipTop)
  const imageRegion = clipRegionTop(padPartImageRegion(rawRegion, zone.label.region, paddingOptions), upperLabelClipTop)
  const selectedEnvelope = clipToSelectedEnvelope(imageRegion, ownedRegion, zone, interior)
  const recoveredRegion = includeOwnedTopForTallPart(selectedEnvelope, ownedRegion, rawRegion, zone.label.region, interior)
  const clamped = clampRegionToPage(clipRegionTop(recoveredRegion, upperLabelClipTop), page)

  return clamped && regionArea(clamped) >= MIN_PART_AREA
    ? {
        allowLongShallowTopRecovery,
        foregroundPixels,
        ownedRegion,
        region: clamped,
      }
    : null
}

function shouldAllowLongShallowTopRecovery(
  rawRegion: Region,
  labelRegion: Region,
  interior: Region,
): boolean {
  const labelGap = labelRegion.y - (rawRegion.y + rawRegion.height)

  return rawRegion.width >= 56 &&
    rawRegion.width >= rawRegion.height * 2.2 &&
    rawRegion.height >= Math.max(18, labelRegion.height * 1.8) &&
    labelRegion.width <= labelRegion.height * 1.6 &&
    labelGap >= -Math.round(labelRegion.height * 0.35) &&
    labelGap <= Math.max(8, Math.round(labelRegion.height * 1.2)) &&
    interior.width >= interior.height * 1.25
}
