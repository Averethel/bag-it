import type { StepCalloutPageInput, StepCalloutRegion } from "./contracts"
import {
  findStepCalloutPixelComponents,
  type StepCalloutPixelComponent,
} from "./pixel-components"
import { isStepCalloutDarkPixel } from "./pixels"
import {
  stepCalloutRegionArea,
  stepCalloutRegionSmallerOverlapRatio,
} from "./regions"

const MAX_BORDER_DENSITY = 0.55
const MAX_BORDER_AREA_RATIO = 0.24
const MAX_LINE_RECTANGLE_DARK_DENSITY = 0.35
const MAX_LINE_RECTANGLE_HEIGHT = 180
const MAX_RUN_GAP = 2
const MIN_BORDER_HEIGHT = 12
const MIN_BORDER_PERIMETER_COVERAGE = 0.35
const MIN_BORDER_WIDTH = 16
const MIN_LINE_RECTANGLE_HEIGHT = 18
const MIN_LINE_RECTANGLE_OVERLAP_RATIO = 0.72
const MIN_LINE_RECTANGLE_SIDE_COVERAGE = 0.28
const MIN_LINE_RECTANGLE_WIDTH = 64
const SAME_BORDER_REGION_OVERLAP_RATIO = 0.88
const LINE_RECTANGLE_DENSITY_SAMPLE_STRIDE = 4
const SIDE_EDGE_SEARCH_RADIUS = 2

interface HorizontalBand {
  height: number
  width: number
  x: number
  y: number
}

export function findStepCalloutBorderCandidateRegions(
  page: StepCalloutPageInput,
): StepCalloutRegion[] {
  return findStepCalloutPixelComponents(page, (pixelIndex) => isStepCalloutDarkPixel(page, pixelIndex))
    .filter((component) => isBorderCandidateComponent(page, component))
    .map((component) => component.region)
}

export function findStepCalloutLineRectangleCandidateRegions(
  page: StepCalloutPageInput,
): StepCalloutRegion[] {
  return findLineRectangleCandidateRegions(page)
}

function isBorderCandidateComponent(
  page: StepCalloutPageInput,
  component: StepCalloutPixelComponent,
): boolean {
  return (
    hasCalloutScale(page, component.region) &&
    hasPlausibleBorderDensity(component) &&
    borderPerimeterCoverage(component) >= MIN_BORDER_PERIMETER_COVERAGE
  )
}

function hasCalloutScale(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
): boolean {
  return (
    region.width >= MIN_BORDER_WIDTH &&
    region.height >= MIN_BORDER_HEIGHT &&
    stepCalloutRegionArea(region) / pageArea(page) <= MAX_BORDER_AREA_RATIO &&
    region.width / region.height <= 8 &&
    region.height / region.width <= 4
  )
}

function pageArea(page: StepCalloutPageInput): number {
  return page.width * page.height
}

function hasPlausibleBorderDensity(component: StepCalloutPixelComponent): boolean {
  return component.pixelCount / stepCalloutRegionArea(component.region) <= MAX_BORDER_DENSITY
}

function borderPerimeterCoverage(component: StepCalloutPixelComponent): number {
  const perimeter = 2 * (component.region.width + component.region.height)

  return component.pixelCount / perimeter
}

function findLineRectangleCandidateRegions(page: StepCalloutPageInput): StepCalloutRegion[] {
  const bands = findHorizontalDarkBands(page)
  const regions: StepCalloutRegion[] = []

  for (let topIndex = 0; topIndex < bands.length; topIndex += 1) {
    regions.push(...findLineRectangleRegionsFromTopBand(page, bands, topIndex))
  }

  return dedupeBorderRegions(regions)
}

function findLineRectangleRegionsFromTopBand(
  page: StepCalloutPageInput,
  bands: readonly HorizontalBand[],
  topIndex: number,
): StepCalloutRegion[] {
  const top = bands[topIndex]
  const regions: StepCalloutRegion[] = []

  for (let bottomIndex = topIndex + 1; bottomIndex < bands.length; bottomIndex += 1) {
    const bottom = bands[bottomIndex]
    const candidate = createLineRectangleRegion(top, bottom)

    if (candidate.height > MAX_LINE_RECTANGLE_HEIGHT) {
      break
    }

    if (isLineRectangleCandidate(page, top, bottom, candidate)) {
      regions.push(candidate)
    }
  }

  return regions
}

function isLineRectangleCandidate(
  page: StepCalloutPageInput,
  top: HorizontalBand,
  bottom: HorizontalBand,
  region: StepCalloutRegion,
): boolean {
  return (
    region.height >= MIN_LINE_RECTANGLE_HEIGHT &&
    hasLineRectangleScale(page, region) &&
    horizontalBandOverlapRatio(top, bottom) >= MIN_LINE_RECTANGLE_OVERLAP_RATIO &&
    hasLineRectangleSideSupport(page, region) &&
    sampledLineRectangleDarkDensity(page, region) <= MAX_LINE_RECTANGLE_DARK_DENSITY
  )
}

function hasLineRectangleScale(page: StepCalloutPageInput, region: StepCalloutRegion): boolean {
  return (
    region.width >= MIN_LINE_RECTANGLE_WIDTH &&
    region.height >= MIN_LINE_RECTANGLE_HEIGHT &&
    region.height <= MAX_LINE_RECTANGLE_HEIGHT &&
    stepCalloutRegionArea(region) / pageArea(page) <= MAX_BORDER_AREA_RATIO &&
    region.width / region.height <= 8 &&
    region.height / region.width <= 4
  )
}

function findHorizontalDarkBands(page: StepCalloutPageInput): HorizontalBand[] {
  const bands: HorizontalBand[] = []

  for (let y = 0; y < page.height; y += 1) {
    bands.push(...findHorizontalDarkRuns(page, y))
  }

  return bands
}

function findHorizontalDarkRuns(page: StepCalloutPageInput, y: number): HorizontalBand[] {
  const runs: HorizontalBand[] = []
  let runStart: number | null = null
  let lastDarkX = -1

  for (let x = 0; x < page.width; x += 1) {
    if (isStepCalloutDarkPixel(page, y * page.width + x)) {
      if (runStart === null) {
        runStart = x
      }
      lastDarkX = x
      continue
    }

    if (runStart !== null && x - lastDarkX > MAX_RUN_GAP + 1) {
      addHorizontalRun(runs, y, runStart, lastDarkX + 1)
      runStart = null
    }
  }

  if (runStart !== null) {
    addHorizontalRun(runs, y, runStart, lastDarkX + 1)
  }

  return runs
}

function addHorizontalRun(
  runs: HorizontalBand[],
  y: number,
  startX: number,
  endX: number,
): void {
  const width = endX - startX

  if (width < MIN_LINE_RECTANGLE_WIDTH) {
    return
  }

  runs.push({
    height: 1,
    width,
    x: startX,
    y,
  })
}

function createLineRectangleRegion(
  top: HorizontalBand,
  bottom: HorizontalBand,
): StepCalloutRegion {
  const left = Math.max(top.x, bottom.x)
  const right = Math.min(top.x + top.width, bottom.x + bottom.width)

  return {
    height: bottom.y + bottom.height - top.y,
    width: right - left,
    x: left,
    y: top.y,
  }
}

function horizontalBandOverlapRatio(
  top: HorizontalBand,
  bottom: HorizontalBand,
): number {
  const overlap = Math.min(top.x + top.width, bottom.x + bottom.width) - Math.max(top.x, bottom.x)
  const smallerWidth = Math.min(top.width, bottom.width)

  return smallerWidth <= 0 ? 0 : Math.max(0, overlap) / smallerWidth
}

function hasLineRectangleSideSupport(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
): boolean {
  return (
    verticalEdgeDarkCoverage(page, region, region.x) >= MIN_LINE_RECTANGLE_SIDE_COVERAGE &&
    verticalEdgeDarkCoverage(page, region, region.x + region.width - 1) >=
      MIN_LINE_RECTANGLE_SIDE_COVERAGE
  )
}

function verticalEdgeDarkCoverage(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
  x: number,
): number {
  let darkRows = 0

  for (let y = region.y; y < region.y + region.height; y += 1) {
    if (hasNearbyDarkPixel(page, x, y)) {
      darkRows += 1
    }
  }

  return darkRows / region.height
}

function hasNearbyDarkPixel(
  page: StepCalloutPageInput,
  x: number,
  y: number,
): boolean {
  for (let dx = -SIDE_EDGE_SEARCH_RADIUS; dx <= SIDE_EDGE_SEARCH_RADIUS; dx += 1) {
    const nextX = x + dx

    if (
      nextX >= 0 &&
      nextX < page.width &&
      isStepCalloutDarkPixel(page, y * page.width + nextX)
    ) {
      return true
    }
  }

  return false
}

function sampledLineRectangleDarkDensity(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
): number {
  let darkCount = 0
  let sampleCount = 0

  for (let y = region.y; y < region.y + region.height; y += LINE_RECTANGLE_DENSITY_SAMPLE_STRIDE) {
    for (let x = region.x; x < region.x + region.width; x += LINE_RECTANGLE_DENSITY_SAMPLE_STRIDE) {
      sampleCount += 1

      if (isStepCalloutDarkPixel(page, y * page.width + x)) {
        darkCount += 1
      }
    }
  }

  return sampleCount === 0 ? 1 : darkCount / sampleCount
}

function dedupeBorderRegions(regions: readonly StepCalloutRegion[]): StepCalloutRegion[] {
  return regions.reduce<StepCalloutRegion[]>((deduped, region) => {
    if (
      deduped.some((existing) =>
        areSameBorderRegion(existing, region)
      )
    ) {
      return deduped
    }

    deduped.push(region)
    return deduped
  }, [])
}

function areSameBorderRegion(
  left: StepCalloutRegion,
  right: StepCalloutRegion,
): boolean {
  return (
    stepCalloutRegionSmallerOverlapRatio(left, right) >= SAME_BORDER_REGION_OVERLAP_RATIO &&
    borderRegionAreaRatio(left, right) >= SAME_BORDER_REGION_OVERLAP_RATIO
  )
}

function borderRegionAreaRatio(
  left: StepCalloutRegion,
  right: StepCalloutRegion,
): number {
  const smallerArea = Math.min(stepCalloutRegionArea(left), stepCalloutRegionArea(right))
  const largerArea = Math.max(stepCalloutRegionArea(left), stepCalloutRegionArea(right))

  return largerArea === 0 ? 0 : smallerArea / largerArea
}
