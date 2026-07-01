export const STEP_DETECTOR_V2_DEFAULT_RENDER_MAX_WIDTH = 1400
export const STEP_DETECTOR_V2_PART_EXTRACTION_RENDER_MAX_WIDTH = 3200
export const STEP_DETECTOR_V2_PART_EXTRACTION_RENDER_SCALE_MULTIPLIER = 3

export interface StepDetectorV2PageBounds {
  height: number
  width: number
}

export function readStepDetectorV2PartExtractionRenderMaxWidth(
  baseBounds: readonly StepDetectorV2PageBounds[],
): number | undefined {
  const maxBaseWidth = Math.max(
    0,
    ...baseBounds
      .map((bounds) => bounds.width)
      .filter((width) => Number.isFinite(width) && width > 0),
  )

  if (maxBaseWidth === 0) {
    return undefined
  }

  return Math.min(
    STEP_DETECTOR_V2_PART_EXTRACTION_RENDER_MAX_WIDTH,
    Math.ceil(maxBaseWidth * STEP_DETECTOR_V2_PART_EXTRACTION_RENDER_SCALE_MULTIPLIER),
  )
}
