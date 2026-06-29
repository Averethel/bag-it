import type { Region } from "./contracts"
import type { GlyphComponent } from "@bag-it/raster-quantity-labels"
import { MIN_PART_AREA, MIN_PART_HEIGHT, MIN_PART_WIDTH } from "./part-foreground-constants"
import { horizontalOverlapRatio, regionArea } from "./regions"

export function isUsableComponent(
  component: GlyphComponent,
  searchRegion: Region,
  labelRegion: Region,
  ownershipRegion: Region,
): boolean {
  const { height, width } = component.region
  const density = component.area / Math.max(1, regionArea(component.region))
  const bottom = component.region.y + component.region.height
  const rowTopTolerance = Math.max(18, Math.round(labelRegion.height * 2.4))
  const rowBottomTolerance = Math.max(4, Math.round(labelRegion.height * 0.4))

  return (
    component.area >= MIN_PART_AREA &&
    width >= MIN_PART_WIDTH &&
    height >= MIN_PART_HEIGHT &&
    density >= 0.03 &&
    !isLikelyLabelResidue(component, labelRegion) &&
    !isLikelyBorderComponent(component, searchRegion, labelRegion) &&
    !(width >= searchRegion.width * 0.9 && height <= Math.max(2, searchRegion.height * 0.04)) &&
    component.region.y < labelRegion.y + Math.max(2, Math.round(labelRegion.height * 0.5)) &&
    bottom >= ownershipRegion.y - rowTopTolerance &&
    bottom <= ownershipRegion.y + ownershipRegion.height + rowBottomTolerance
  )
}

function isLikelyLabelResidue(
  component: GlyphComponent,
  labelRegion: Region,
): boolean {
  const verticalTolerance = Math.max(3, Math.round(labelRegion.height * 0.45))
  const horizontalTolerance = Math.max(4, Math.round(labelRegion.width * 0.45))
  const top = component.region.y
  const bottom = component.region.y + component.region.height
  const labelBottom = labelRegion.y + labelRegion.height
  const closeToLabelX = horizontalGap(component.region, labelRegion) <= horizontalTolerance ||
    horizontalOverlapRatio(component.region, labelRegion) >= 0.3
  const verticallyInsideLabelHalo = top >= labelRegion.y - verticalTolerance &&
    bottom <= labelBottom + verticalTolerance
  const labelSized = component.region.width <= labelRegion.width + horizontalTolerance * 2 &&
    component.region.height <= labelRegion.height + verticalTolerance * 2

  return closeToLabelX && verticallyInsideLabelHalo && labelSized
}

function isLikelyBorderComponent(
  component: GlyphComponent,
  searchRegion: Region,
  labelRegion: Region,
): boolean {
  const touchesLeft = component.region.x <= searchRegion.x + 1
  const touchesTop = component.region.y <= searchRegion.y + 1
  const touchesRight = component.region.x + component.region.width >= searchRegion.x + searchRegion.width - 1
  const touchesBottom = component.region.y + component.region.height >= searchRegion.y + searchRegion.height - 1
  const touchedSides = [touchesLeft, touchesTop, touchesRight, touchesBottom].filter(Boolean).length
  const thinLimit = Math.max(4, Math.round(labelRegion.height * 0.45))
  const longHorizontal = component.region.width >= searchRegion.width * 0.35 && component.region.height <= thinLimit
  const longVertical = component.region.height >= searchRegion.height * 0.35 && component.region.width <= thinLimit
  const frameFragment = touchedSides >= 2 &&
    (component.region.width >= labelRegion.width * 2 || component.region.height >= labelRegion.height * 2)

  return frameFragment || longHorizontal || longVertical
}

function horizontalGap(left: Region, right: Region): number {
  return Math.max(0, Math.max(left.x - right.x - right.width, right.x - left.x - left.width))
}
