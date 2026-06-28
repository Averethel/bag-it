import type { Region } from "./contracts"
import type { GlyphComponent } from "@bag-it/raster-quantity-labels"
import type { OwnershipZone } from "./part-ownership"
import { horizontalOverlapRatio, regionCenter } from "./regions"

export interface ScoredComponent {
  component: GlyphComponent
  score: number
}

export function scoreComponent(component: GlyphComponent, zone: OwnershipZone): number {
  const label = zone.label.region
  const labelCenterX = regionCenter(label).x
  const verticalGap = Math.max(0, label.y - (component.region.y + component.region.height))
  const ownershipPenalty =
    (1 - horizontalOverlapRatio(component.region, zone.region)) * Math.max(label.width, label.height) * 1.8
  const labelOverlapBonus = labelCenterX >= component.region.x && labelCenterX <= component.region.x + component.region.width
    ? label.width
    : 0

  return horizontalGapToX(component.region, labelCenterX) * 2.4 + verticalGap + ownershipPenalty - labelOverlapBonus
}

function horizontalGapToX(region: Region, x: number): number {
  return Math.max(0, Math.max(region.x - x, x - region.x - region.width))
}
