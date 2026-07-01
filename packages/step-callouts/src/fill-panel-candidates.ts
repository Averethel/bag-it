import type {
  StepCalloutPageInput,
  StepCalloutRegion,
  StepCalloutRgbColor,
} from "./contracts"
import {
  findStepCalloutPixelComponents,
  type StepCalloutPixelComponent,
} from "./pixel-components"
import {
  estimateStepCalloutPageBackground,
  isStepCalloutFillPanelPixel,
  readStepCalloutPixelColor,
  stepCalloutColorDistance,
  stepCalloutColorLuma,
} from "./pixels"
import {
  stepCalloutRegionArea,
  stepCalloutRegionSmallerOverlapRatio,
} from "./regions"

const MAX_FILL_ASPECT_RATIO = 8
const MAX_FILL_AREA_RATIO = 0.42
const MAX_OUTLINE_DENSITY = 0.55
const MIN_OUTLINE_CONTRAST_DISTANCE = 18
const MIN_OUTLINE_PERIMETER_COVERAGE = 0.25
const MIN_DENSE_FILL_DENSITY = 0.65
const MIN_OCCLUDED_FILL_DENSITY = 0.58
const MIN_FILL_HEIGHT = 12
const MIN_FILL_WIDTH = 16
const SAME_PANEL_OVERLAP_RATIO = 0.88
const EXPANDED_COMPACT_PANEL_PAGE_WIDTH_MIN = 500
const EXPANDED_COMPACT_PANEL_PADDING = 8
const EXPANDED_COMPACT_PANEL_WIDTH_MAX = 80
const EXPANDED_COMPACT_PANEL_HEIGHT_MAX = 90

export function findStepCalloutFillPanelCandidateRegions(
  page: StepCalloutPageInput,
): StepCalloutRegion[] {
  const background = estimateStepCalloutPageBackground(page)
  const filledRegions = findStepCalloutPixelComponents(page, (pixelIndex) =>
    isStepCalloutFillPanelPixel(page, pixelIndex, background),
  )
    .filter((component) => isFillPanelCandidateComponent(page, component))
    .map((component) => component.region)

  const outlineRegions = findStepCalloutPixelComponents(page, (pixelIndex) =>
    isStepCalloutPanelOutlinePixel(page, pixelIndex, background),
  )
    .filter((component) => isFillPanelOutlineComponent(page, component))
    .map((component) => component.region)

  const panelRegions = dedupeFillPanelRegions([...filledRegions, ...outlineRegions])

  return [
    ...panelRegions,
    ...createExpandedCompactPanelRegions(page, panelRegions),
  ]
}

function isFillPanelCandidateComponent(
  page: StepCalloutPageInput,
  component: StepCalloutPixelComponent,
): boolean {
  return (
    hasFillPanelScale(component.region) &&
    hasFillPanelArea(page, component.region) &&
    hasCandidateFillDensity(page, component)
  )
}

function hasFillPanelScale(region: StepCalloutRegion): boolean {
  return (
    region.width >= MIN_FILL_WIDTH &&
    region.height >= MIN_FILL_HEIGHT &&
    region.width / region.height <= MAX_FILL_ASPECT_RATIO &&
    region.height / region.width <= MAX_FILL_ASPECT_RATIO
  )
}

function fillDensity(component: StepCalloutPixelComponent): number {
  return component.pixelCount / stepCalloutRegionArea(component.region)
}

function hasFillPanelArea(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
): boolean {
  return stepCalloutRegionArea(region) / pageArea(page) <= MAX_FILL_AREA_RATIO
}

function hasCandidateFillDensity(
  page: StepCalloutPageInput,
  component: StepCalloutPixelComponent,
): boolean {
  const density = fillDensity(component)

  return density >= MIN_DENSE_FILL_DENSITY || isOccludedFillPanel(page, component, density)
}

function isOccludedFillPanel(
  page: StepCalloutPageInput,
  component: StepCalloutPixelComponent,
  density: number,
): boolean {
  return (
    density >= MIN_OCCLUDED_FILL_DENSITY &&
    hasFillPanelArea(page, component.region)
  )
}

function pageArea(page: StepCalloutPageInput): number {
  return page.width * page.height
}

function isStepCalloutPanelOutlinePixel(
  page: StepCalloutPageInput,
  pixelIndex: number,
  background: StepCalloutRgbColor,
): boolean {
  const color = readStepCalloutPixelColor(page, pixelIndex)

  return (
    stepCalloutColorLuma(color) > 96 &&
    stepCalloutColorDistance(color, background) >=
    MIN_OUTLINE_CONTRAST_DISTANCE
  )
}

function isFillPanelOutlineComponent(
  page: StepCalloutPageInput,
  component: StepCalloutPixelComponent,
): boolean {
  return (
    hasFillPanelScale(component.region) &&
    hasFillPanelArea(page, component.region) &&
    hasPlausibleOutlineDensity(component) &&
    outlinePerimeterCoverage(component) >= MIN_OUTLINE_PERIMETER_COVERAGE
  )
}

function hasPlausibleOutlineDensity(component: StepCalloutPixelComponent): boolean {
  return component.pixelCount / stepCalloutRegionArea(component.region) <= MAX_OUTLINE_DENSITY
}

function outlinePerimeterCoverage(component: StepCalloutPixelComponent): number {
  const perimeter = 2 * (component.region.width + component.region.height)

  return perimeter === 0 ? 0 : component.pixelCount / perimeter
}

function dedupeFillPanelRegions(
  regions: readonly StepCalloutRegion[],
): StepCalloutRegion[] {
  return regions.reduce<StepCalloutRegion[]>((deduped, region) => {
    if (
      deduped.some((existing) =>
        stepCalloutRegionSmallerOverlapRatio(existing, region) >= SAME_PANEL_OVERLAP_RATIO
      )
    ) {
      return deduped
    }

    deduped.push(region)
    return deduped
  }, [])
}

function createExpandedCompactPanelRegions(
  page: StepCalloutPageInput,
  regions: readonly StepCalloutRegion[],
): StepCalloutRegion[] {
  if (page.width < EXPANDED_COMPACT_PANEL_PAGE_WIDTH_MIN) {
    return []
  }

  return regions
    .filter(isExpandableCompactPanelRegion)
    .map((region) => expandRegion(page, region, EXPANDED_COMPACT_PANEL_PADDING))
}

function isExpandableCompactPanelRegion(region: StepCalloutRegion): boolean {
  return (
    region.width <= EXPANDED_COMPACT_PANEL_WIDTH_MAX &&
    region.height <= EXPANDED_COMPACT_PANEL_HEIGHT_MAX
  )
}

function expandRegion(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
  padding: number,
): StepCalloutRegion {
  const x = Math.max(0, region.x - padding)
  const y = Math.max(0, region.y - padding)
  const right = Math.min(page.width, region.x + region.width + padding)
  const bottom = Math.min(page.height, region.y + region.height + padding)

  return {
    height: bottom - y,
    width: right - x,
    x,
    y,
  }
}
