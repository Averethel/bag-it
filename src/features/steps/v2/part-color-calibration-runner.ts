import type { CalloutPartItem } from "@bag-it/callout-parts"
import {
  calibrateManualPartColors,
  samplePartColor,
  type PartColorCalibrationInput,
} from "@bag-it/part-colors"
import type { StepDetectorV2PageInput } from "./contracts"
import type { StepDetectorV2PageBounds } from "./render-widths"
import type { DetectedStepCalloutPartItem } from "../step-detection-contracts"

interface ColorCalibratableCallout {
  inferredBackground?: {
    rgb: {
      b: number
      g: number
      r: number
    }
  }
  partItems: DetectedStepCalloutPartItem[]
}

interface PartColorSourceCallout {
  id?: string
  inferredBackground?: {
    rgb: {
      b: number
      g: number
      r: number
    }
  }
  pageNumber?: number
  sourceRegion?: {
    height: number
    width: number
    x: number
    y: number
  }
}

interface ColorCalibratableResult {
  callouts: ColorCalibratableCallout[]
}

export type StepPartColorCalibrationRow = PartColorCalibrationInput

interface CreatePartColorRowsOptions {
  highResolutionPageInput?: StepDetectorV2PageInput
  sortOrder?: number
}

export function createPartColorRows(
  pageInput: StepDetectorV2PageInput,
  callout: PartColorSourceCallout,
  partItems: readonly CalloutPartItem[],
  options: CreatePartColorRowsOptions = {},
): StepPartColorCalibrationRow[] {
  const highResolution = createHighResolutionSampleInput(pageInput, options.highResolutionPageInput)

  return partItems.map((partItem) => ({
    id: createBuildStepPartItemId(partItem),
    sample: samplePartColor({
      background: callout.inferredBackground?.rgb,
      excludedRegions: [partItem.quantityLabel.region],
      highResolution,
      page: pageInput,
      partImage: partItem.partImage,
    }),
    sortKey: options.sortOrder === undefined
      ? undefined
      : createPartColorSortKey(callout, partItem, options.sortOrder),
  }))
}

function createPartColorSortKey(
  callout: PartColorSourceCallout,
  partItem: CalloutPartItem,
  sortOrder?: number,
): string {
  const calloutRegion = callout.sourceRegion ?? partItem.sourceRegion
  const partRegion = partItem.sourceRegion

  return [
    padSortNumber(sortOrder ?? 0),
    padSortNumber(callout.pageNumber ?? 0),
    padSortNumber(calloutRegion.y),
    padSortNumber(calloutRegion.x),
    padSortNumber(calloutRegion.height),
    padSortNumber(calloutRegion.width),
    padSortNumber(partItem.indexOnCallout),
    padSortNumber(partRegion.y),
    padSortNumber(partRegion.x),
    createBuildStepPartItemId(partItem),
  ].join(":")
}

function padSortNumber(value: number): string {
  return String(Math.round(value)).padStart(6, "0")
}

export function createColorSamplingPageInput(
  pageInput: StepDetectorV2PageInput,
  baseBounds: StepDetectorV2PageBounds,
): StepDetectorV2PageInput {
  const targetWidth = Math.round(baseBounds.width)
  const targetHeight = Math.round(baseBounds.height)

  if (
    targetWidth <= 0 ||
    targetHeight <= 0 ||
    (targetWidth === pageInput.width && targetHeight === pageInput.height)
  ) {
    return pageInput
  }

  const data = new Uint8ClampedArray(targetWidth * targetHeight * 4)
  const scaleX = pageInput.width / targetWidth
  const scaleY = pageInput.height / targetHeight

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      writeDownsampledPixel(data, x, y, targetWidth, pageInput, scaleX, scaleY)
    }
  }

  return {
    ...pageInput,
    data,
    height: targetHeight,
    width: targetWidth,
  }
}

export function withDetectedPartColors<T extends ColorCalibratableResult>(
  result: T,
  partColorRows: readonly StepPartColorCalibrationRow[],
): T {
  const calibration = calibrateManualPartColors(partColorRows)

  if (calibration.colorsByPartId.size === 0) {
    return result
  }

  return {
    ...result,
    callouts: result.callouts.map((callout) => ({
      ...callout,
      partItems: callout.partItems.map((partItem) => ({
        ...partItem,
        detectedColor: calibration.colorsByPartId.get(partItem.id) ?? partItem.detectedColor,
      })),
    })),
  }
}

function createHighResolutionSampleInput(
  basePageInput: StepDetectorV2PageInput,
  highResolutionPageInput?: StepDetectorV2PageInput,
):
  | {
    page: StepDetectorV2PageInput
    scaleX: number
    scaleY: number
  }
  | undefined {
  if (!highResolutionPageInput) {
    return undefined
  }

  if (
    highResolutionPageInput.width <= basePageInput.width ||
    highResolutionPageInput.height <= basePageInput.height
  ) {
    return undefined
  }

  return {
    page: highResolutionPageInput,
    scaleX: highResolutionPageInput.width / basePageInput.width,
    scaleY: highResolutionPageInput.height / basePageInput.height,
  }
}

function writeDownsampledPixel(
  targetData: Uint8ClampedArray,
  targetX: number,
  targetY: number,
  targetWidth: number,
  source: StepDetectorV2PageInput,
  scaleX: number,
  scaleY: number,
): void {
  const left = Math.floor(targetX * scaleX)
  const top = Math.floor(targetY * scaleY)
  const right = Math.max(left + 1, Math.ceil((targetX + 1) * scaleX))
  const bottom = Math.max(top + 1, Math.ceil((targetY + 1) * scaleY))
  let r = 0
  let g = 0
  let b = 0
  let a = 0
  let count = 0

  for (let y = top; y < Math.min(bottom, source.height); y += 1) {
    for (let x = left; x < Math.min(right, source.width); x += 1) {
      const offset = (y * source.width + x) * 4

      r += source.data[offset] ?? 0
      g += source.data[offset + 1] ?? 0
      b += source.data[offset + 2] ?? 0
      a += source.data[offset + 3] ?? 0
      count += 1
    }
  }

  const targetOffset = (targetY * targetWidth + targetX) * 4

  targetData[targetOffset] = Math.round(r / count)
  targetData[targetOffset + 1] = Math.round(g / count)
  targetData[targetOffset + 2] = Math.round(b / count)
  targetData[targetOffset + 3] = Math.round(a / count)
}

function createBuildStepPartItemId(partItem: CalloutPartItem): string {
  return `v2-${partItem.calloutId}-part-${partItem.indexOnCallout}`
}
