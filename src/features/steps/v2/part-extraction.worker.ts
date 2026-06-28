import {
  CALLOUT_PART_EXTRACTOR_VERSION,
  extractCalloutPartsForScaledPage,
} from "@bag-it/callout-parts"
import { PART_COLOR_CALIBRATION_VERSION } from "@bag-it/part-colors"
import type {
  PartExtractionWorkerRequest,
  PartExtractionWorkerResponse,
} from "./part-extraction-worker-contracts"

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<PartExtractionWorkerRequest>) => void) | null
  postMessage: (message: PartExtractionWorkerResponse) => void
}

workerScope.onmessage = (event) => {
  const request = event.data

  try {
    if (request.type === "version") {
      workerScope.postMessage({
        id: request.id,
        partColorCalibrationVersion: PART_COLOR_CALIBRATION_VERSION,
        partExtractorVersion: CALLOUT_PART_EXTRACTOR_VERSION,
        type: "version",
      })
      return
    }

    workerScope.postMessage({
      id: request.id,
      items: extractCalloutPartsForScaledPage({
        basePageBounds: request.basePageBounds,
        callouts: request.callouts,
        page: request.page,
      }).items,
      pageNumber: request.page.pageNumber,
      partColorCalibrationVersion: PART_COLOR_CALIBRATION_VERSION,
      partExtractorVersion: CALLOUT_PART_EXTRACTOR_VERSION,
      type: "extract",
    })
  } catch (error) {
    workerScope.postMessage({
      error: error instanceof Error ? error.message : "Part extraction worker failed.",
      id: request.id,
    })
  }
}

export {}
