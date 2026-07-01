import type { DetectedLegoPartColor, RgbColor } from "./fallback-lego-palette"

export interface StepSourceRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface StepPageTextItem {
  text: string
  region: StepSourceRegion
}

export interface StepImagePreview {
  imageDataUrl?: string
  width: number
  height: number
}

export interface StepPagePreview extends StepImagePreview {
  pageNumber: number
}

export interface StepPageImage {
  pageNumber: number
  width: number
  height: number
  data: Uint8ClampedArray
  preview?: StepImagePreview
  textItems?: StepPageTextItem[]
}

export type StepProcessingPhase =
  | "finalizing"
  | "page-scan"
  | "part-extraction"
  | "preview-hydration"

export interface StepCalloutDetectionProgress {
  activePage: number | null
  scannedPageCount: number
  targetPageCount: number
  detectedCalloutCount?: number
  detectedPartItemCount?: number
  phase?: StepProcessingPhase
  processedCalloutCount?: number
  targetCalloutCount?: number
  percentage: number
  message: string
}

export interface StepPartExtractionProgress {
  activePage: number | null
  processedCalloutCount: number
  targetCalloutCount: number
  detectedPartItemCount: number
  phase?: StepProcessingPhase
  percentage: number
  message: string
}

export interface StepPreviewHydrationProgress {
  activePage: number | null
  hydratedPreviewPageCount: number
  targetPreviewPageCount: number
  phase: "preview-hydration"
  percentage: number
  message: string
}

export interface StepProcessingTimingSummary {
  label: string
  totalMs: number
  phaseMs: Record<string, number>
  counts: Record<string, number>
}

export interface InferredCalloutBackground {
  rgb: RgbColor
  hex: string
  confidence: number
}

export interface StepPageAttentionItem {
  id: string
  pageNumber: number
  kind: "possible-step-multiplier"
  source: "text" | "raster"
  text: string
  value: number
  confidence: number
  sourceRegion: StepSourceRegion
}

export interface StepSectionBoundaryHint {
  id: string
  pageNumber: number
  position: "before-page"
  kind: "off-style-rejected-callout"
  confidence: number
  sourceRegion?: StepSourceRegion
}

export interface DetectedStepCalloutPartItem {
  id: string
  indexOnCallout: number
  confidence: number
  detectedColor?: DetectedLegoPartColor
  sourceRegion: StepSourceRegion
  partRegion: StepSourceRegion
  partCrop?: {
    imageDataUrl?: string
    region: StepSourceRegion
  }
  partImage?: {
    alphaMask?: {
      data: Uint8ClampedArray
      height: number
      width: number
    }
    diagnostics?: unknown
    imageDataUrl?: string
    region: StepSourceRegion
  }
  quantityLabel: {
    crop?: {
      imageDataUrl?: string
      region: StepSourceRegion
    }
    imageDataUrl?: string
    region: StepSourceRegion
  }
  quantity: {
    value: number | null
    text: string
    confidence: number
  }
}

export interface DetectedStepCallout {
  id: string
  pageNumber: number
  indexOnPage: number
  stepIndex: number
  confidence: number
  sourceRegion: StepSourceRegion
  crop: {
    imageDataUrl?: string
    region: StepSourceRegion
  }
  inferredBackground: InferredCalloutBackground
  partItems: DetectedStepCalloutPartItem[]
}

export interface StepCalloutDetectionResult {
  detectorVersion: string
  partExtractorVersion?: string
  partColorCalibrationVersion?: string
  pageCount: number
  pageLimit: number | null
  scannedPageNumbers: number[]
  skippedPageNumbers: number[]
  status: "detected" | "empty"
  pagePreviews: StepPagePreview[]
  pageAttentionItems: StepPageAttentionItem[]
  sectionBoundaryHints?: StepSectionBoundaryHint[]
  callouts: DetectedStepCallout[]
  timing?: StepProcessingTimingSummary
  previewTiming?: StepProcessingTimingSummary
  qualitySummary?: {
    firstBuildStepPageNumber: number | null
    inferredCalloutBackgrounds: InferredCalloutBackground[]
  }
}
