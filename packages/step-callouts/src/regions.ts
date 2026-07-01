import type { StepCalloutRegion } from "./contracts"

export function stepCalloutRegionArea(region: StepCalloutRegion): number {
  return region.width * region.height
}

export function stepCalloutRegionOverlapRatio(
  expected: StepCalloutRegion,
  actual: StepCalloutRegion,
): number {
  const expectedArea = stepCalloutRegionArea(expected)

  if (expectedArea === 0) {
    return 0
  }

  return stepCalloutRegionIntersectionArea(expected, actual) / expectedArea
}

export function stepCalloutRegionSmallerOverlapRatio(
  left: StepCalloutRegion,
  right: StepCalloutRegion,
): number {
  const smallerArea = Math.min(stepCalloutRegionArea(left), stepCalloutRegionArea(right))

  if (smallerArea === 0) {
    return 0
  }

  return stepCalloutRegionIntersectionArea(left, right) / smallerArea
}

export function compareStepCalloutRegions(
  left: StepCalloutRegion,
  right: StepCalloutRegion,
): number {
  return (
    left.y - right.y ||
    left.x - right.x ||
    left.height - right.height ||
    left.width - right.width
  )
}

export function stepCalloutRegionCenter(region: StepCalloutRegion): { x: number; y: number } {
  return {
    x: region.x + region.width / 2,
    y: region.y + region.height / 2,
  }
}

export function stepCalloutRegionContainsPoint(
  region: StepCalloutRegion,
  point: { x: number; y: number },
): boolean {
  return (
    point.x >= region.x &&
    point.y >= region.y &&
    point.x <= region.x + region.width &&
    point.y <= region.y + region.height
  )
}

export function stepCalloutRegionContainsRegion(
  outer: StepCalloutRegion,
  inner: StepCalloutRegion,
): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

export function stepCalloutInsetRegion(
  region: StepCalloutRegion,
  inset: number,
): StepCalloutRegion {
  const safeInset = Math.max(0, Math.min(inset, region.width / 2, region.height / 2))

  return {
    height: region.height - safeInset * 2,
    width: region.width - safeInset * 2,
    x: region.x + safeInset,
    y: region.y + safeInset,
  }
}

export function stepCalloutIntersectRegions(
  left: StepCalloutRegion,
  right: StepCalloutRegion,
): StepCalloutRegion | null {
  const x = Math.max(left.x, right.x)
  const y = Math.max(left.y, right.y)
  const regionRight = Math.min(left.x + left.width, right.x + right.width)
  const regionBottom = Math.min(left.y + left.height, right.y + right.height)

  if (regionRight <= x || regionBottom <= y) {
    return null
  }

  return {
    height: regionBottom - y,
    width: regionRight - x,
    x,
    y,
  }
}

function stepCalloutRegionIntersectionArea(
  left: StepCalloutRegion,
  right: StepCalloutRegion,
): number {
  const overlapWidth = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x)
  const overlapHeight = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y)

  return Math.max(0, overlapWidth) * Math.max(0, overlapHeight)
}
