import type {
  StepCalloutPageInput,
  StepCalloutRegion,
  StepCalloutStageSnapshot,
} from "./contracts"
import { createEmptyStepCalloutFailureTaxonomy } from "./stage-report"

const RGBA_CHANNEL_COUNT = 4

export interface StepCalloutPageBounds {
  height: number
  width: number
}

export interface CreateStepCalloutPageInputOptions {
  data: Uint8ClampedArray
  height: number
  pageNumber: number
  width: number
}

export function createStepCalloutPageInput(
  options: CreateStepCalloutPageInputOptions,
): StepCalloutPageInput {
  assertPositiveInteger(options.pageNumber, "pageNumber")
  assertPositiveInteger(options.width, "width")
  assertPositiveInteger(options.height, "height")
  assertPixelBufferLength(options)

  return {
    data: new Uint8ClampedArray(options.data),
    height: options.height,
    pageNumber: options.pageNumber,
    width: options.width,
  }
}

export function clampStepCalloutRegionToPage(
  region: StepCalloutRegion,
  bounds: StepCalloutPageBounds,
): StepCalloutRegion | null {
  if (!hasPositiveFiniteArea(region)) {
    return null
  }

  const left = clampCoordinate(region.x, bounds.width)
  const top = clampCoordinate(region.y, bounds.height)
  const right = clampCoordinate(region.x + region.width, bounds.width)
  const bottom = clampCoordinate(region.y + region.height, bounds.height)

  return createRegionOrNull(left, top, right, bottom)
}

export function createPageInputStageSnapshot(
  pages: readonly StepCalloutPageInput[],
): StepCalloutStageSnapshot {
  return {
    counts: {
      accepted: pages.length,
      rejected: 0,
      total: pages.length,
    },
    failures: createEmptyStepCalloutFailureTaxonomy(),
    notes: ["Normalized page pixels only; no detector decisions."],
    stageId: "page-input",
  }
}

function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${fieldName} must be a positive integer.`)
  }
}

function assertPixelBufferLength(options: CreateStepCalloutPageInputOptions): void {
  const expectedLength = options.width * options.height * RGBA_CHANNEL_COUNT

  if (options.data.length !== expectedLength) {
    throw new RangeError("page input data length must match width * height * 4.")
  }
}

function hasPositiveFiniteArea(region: StepCalloutRegion): boolean {
  return (
    Number.isFinite(region.x) &&
    Number.isFinite(region.y) &&
    Number.isFinite(region.width) &&
    Number.isFinite(region.height) &&
    region.width > 0 &&
    region.height > 0
  )
}

function clampCoordinate(value: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, Math.round(value)))
}

function createRegionOrNull(
  left: number,
  top: number,
  right: number,
  bottom: number,
): StepCalloutRegion | null {
  if (right <= left || bottom <= top) {
    return null
  }

  return {
    height: bottom - top,
    width: right - left,
    x: left,
    y: top,
  }
}
