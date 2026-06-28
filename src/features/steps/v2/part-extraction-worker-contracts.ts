import type {
  CalloutPartCalloutInput,
  CalloutPartItem,
} from "@bag-it/callout-parts"
import type { StepDetectorV2PageInput } from "./contracts"
import type { StepDetectorV2PageBounds } from "./render-widths"

export interface PartExtractionWorkerResult {
  items: CalloutPartItem[]
  pageNumber: number
  partColorCalibrationVersion: string
  partExtractorVersion: string
}

export type PartExtractionWorkerRequest = {
  id: number
} & (
  | {
      type: "extract"
      basePageBounds: StepDetectorV2PageBounds
      callouts: CalloutPartCalloutInput[]
      page: StepDetectorV2PageInput
    }
  | {
      type: "version"
    }
)

export type PartExtractionWorkerResponse =
  | ({
      type: "extract"
      id: number
    } & PartExtractionWorkerResult)
  | {
      type: "version"
      id: number
      partColorCalibrationVersion: string
      partExtractorVersion: string
    }
  | {
      error: string
      id: number
    }
