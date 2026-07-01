import { describe, expect, it } from "vitest"
import {
  createPdfIntakeSessionFile,
  getSessionDownloadName,
  restorePdfIntakeSessionFile,
} from "./session-file"
import type { PdfMetadata } from "@/features/pdf/pdf-intake"
import {
  STEP_CALLOUT_DETECTOR_V2_VERSION as STEP_CALLOUT_DETECTOR_VERSION,
  STEP_PART_COLOR_CALIBRATION_V2_VERSION as STEP_PART_COLOR_CALIBRATION_VERSION,
  STEP_PART_EXTRACTOR_V2_VERSION as STEP_PART_EXTRACTOR_VERSION,
} from "@/features/steps/v2/browser-step-detector-adapter"
import type { StepCalloutDetectionResult } from "@/features/steps/step-detection-contracts"

describe("session-file", () => {
  it("round-trips a PDF intake session", async () => {
    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
      lastModified: 123,
    })
    const metadata: PdfMetadata = {
      fileName: "manual.pdf",
      sizeBytes: manual.size,
      pageCount: 4,
      title: null,
      author: null,
    }

    const sessionBlob = await createPdfIntakeSessionFile({
      manualFile: manual,
      metadata,
    })
    const sessionFile = new File([sessionBlob], "manual.bagit-session.json", {
      type: "application/json",
    })
    const restored = await restorePdfIntakeSessionFile(sessionFile)

    expect(restored.manualFile.name).toBe("manual.pdf")
    expect(restored.manualFile.type).toBe("application/pdf")
    expect(restored.metadata).toEqual(metadata)
    expect(restored.manualFile.size).toBe(manual.size)
    expect(restored.stepDetectionResult).toBeNull()
    expect(restored.calloutMultipliers).toEqual({})
  })

  it("round-trips current step analysis when the session includes it", async () => {
    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
      lastModified: 123,
    })
    const metadata: PdfMetadata = {
      fileName: "manual.pdf",
      sizeBytes: manual.size,
      pageCount: 4,
      title: null,
      author: null,
    }
    const stepDetectionResult = emptyStepResult(4)

    const sessionBlob = await createPdfIntakeSessionFile({
      manualFile: manual,
      metadata,
      stepDetectionResult,
    })
    const sessionFile = new File([sessionBlob], "manual.bagit-session.json", {
      type: "application/json",
    })
    const restored = await restorePdfIntakeSessionFile(sessionFile)

    expect(restored.stepDetectionResult).toEqual(stepDetectionResult)
  })

  it("round-trips callout multipliers", async () => {
    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
      lastModified: 123,
    })
    const metadata: PdfMetadata = {
      fileName: "manual.pdf",
      sizeBytes: manual.size,
      pageCount: 4,
      title: null,
      author: null,
    }

    const sessionBlob = await createPdfIntakeSessionFile({
      manualFile: manual,
      metadata,
      stepDetectionResult: emptyStepResult(4),
      calloutMultipliers: {
        "callout-1": 3,
        "callout-default": 1,
      },
    })
    const sessionFile = new File([sessionBlob], "manual.bagit-session.json", {
      type: "application/json",
    })
    const restored = await restorePdfIntakeSessionFile(sessionFile)

    expect(restored.calloutMultipliers).toEqual({
      "callout-1": 3,
    })
  })

  it("round-trips checked bag completion state", async () => {
    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
      lastModified: 123,
    })
    const metadata: PdfMetadata = {
      fileName: "manual.pdf",
      sizeBytes: manual.size,
      pageCount: 4,
      title: null,
      author: null,
    }
    const anchor = {
      manualFingerprint: "manual.pdf:8:123",
      pageNumber: 1,
      pageRenderWidth: 100,
      pageRenderHeight: 140,
      calloutRegion: { x: 10, y: 20, width: 80, height: 40 },
      partRegion: { x: 20, y: 24, width: 24, height: 14 },
      quantityLabelRegion: { x: 12, y: 34, width: 8, height: 8 },
      itemIndexOnCallout: 0,
    }

    const sessionBlob = await createPdfIntakeSessionFile({
      manualFile: manual,
      metadata,
      stepDetectionResult: emptyStepResult(4),
      checkedBagRowIds: ["bag-1:callout-1:part-1:x1", "bag-1:callout-1:part-1:x1"],
      checkedBagCompletionAnchors: [anchor],
    })
    const sessionFile = new File([sessionBlob], "manual.bagit-session.json", {
      type: "application/json",
    })
    const restored = await restorePdfIntakeSessionFile(sessionFile)

    expect(restored.checkedBagRowIds).toEqual(["bag-1:callout-1:part-1:x1"])
    expect(restored.checkedBagCompletionAnchors).toEqual([anchor])
  })

  it("strips runtime preview object urls from session exports", async () => {
    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
      lastModified: 123,
    })
    const metadata: PdfMetadata = {
      fileName: "manual.pdf",
      sizeBytes: manual.size,
      pageCount: 1,
      title: null,
      author: null,
    }

    const sessionBlob = await createPdfIntakeSessionFile({
      manualFile: manual,
      metadata,
      stepDetectionResult: resultWithRuntimePreviewUrls(),
    })
    const session = JSON.parse(await readBlobAsText(sessionBlob)) as {
      stepDetectionResult: StepCalloutDetectionResult
    }
    const result = session.stepDetectionResult
    const partItem = result.callouts[0].partItems[0]

    expect(result.pagePreviews[0].imageDataUrl).toBeUndefined()
    expect(result.callouts[0].crop.imageDataUrl).toBeUndefined()
    expect(partItem.partCrop?.imageDataUrl).toBeUndefined()
    expect(partItem.partImage?.imageDataUrl).toBeUndefined()
    expect(partItem.quantityLabel.crop?.imageDataUrl).toBeUndefined()
    expect(partItem.quantityLabel.imageDataUrl).toBe("data:image/png;base64,quantity")
  })

  it("rejects malformed session files", async () => {
    const malformed = new File(["{}"], "manual.bagit-session.json", {
      type: "application/json",
    })

    await expect(restorePdfIntakeSessionFile(malformed)).rejects.toMatchObject({
      message: "Session file could not be read. Choose a Bag It session file.",
    })
  })

  it("rejects sessions with malformed saved step analysis", async () => {
    const manual = new File(["%PDF-1.7"], "manual.pdf", {
      type: "application/pdf",
      lastModified: 123,
    })
    const metadata: PdfMetadata = {
      fileName: "manual.pdf",
      sizeBytes: manual.size,
      pageCount: 4,
      title: null,
      author: null,
    }
    const sessionBlob = await createPdfIntakeSessionFile({
      manualFile: manual,
      metadata,
      stepDetectionResult: emptyStepResult(4),
    })
    const session = JSON.parse(await readBlobAsText(sessionBlob)) as {
      stepDetectionResult: unknown
    }
    session.stepDetectionResult = {
      detectorVersion: STEP_CALLOUT_DETECTOR_VERSION,
      status: "detected",
    }
    const sessionFile = new File([JSON.stringify(session)], "manual.bagit-session.json", {
      type: "application/json",
    })

    await expect(restorePdfIntakeSessionFile(sessionFile)).rejects.toMatchObject({
      message: "Session file could not be read. Choose a Bag It session file.",
    })
  })

  it("restores saved step analysis with serialized part mask data", async () => {
    const session = await createSessionJsonWithStepResult(resultWithRuntimePreviewUrls())
    const restored = await restorePdfIntakeSessionFile(createSessionJsonFile(session))
    const alphaMaskData =
      restored.stepDetectionResult?.callouts[0]?.partItems[0]?.partImage?.alphaMask?.data

    expect(alphaMaskData).toEqual({ 0: 255 })
  })

  it.each([
    [
      "page preview",
      (result: MutableJsonRecord) => {
        firstRecord(result.pagePreviews).pageNumber = "1"
      },
    ],
    [
      "callout region",
      (result: MutableJsonRecord) => {
        childRecord(firstRecord(result.callouts), "sourceRegion").width = "wide"
      },
    ],
    [
      "part item quantity",
      (result: MutableJsonRecord) => {
        childRecord(firstPartItem(result), "quantity").value = "2"
      },
    ],
    [
      "part image alpha mask",
      (result: MutableJsonRecord) => {
        childRecord(childRecord(firstPartItem(result), "partImage"), "alphaMask").data = {
          0: 255,
          1: "bad",
        }
      },
    ],
    [
      "page attention item",
      (result: MutableJsonRecord) => {
        result.pageAttentionItems = [
          {
            confidence: 0.8,
            id: "attention-1",
            kind: "possible-step-multiplier",
            pageNumber: 1,
            source: "text",
            sourceRegion: { height: "bad", width: 12, x: 2, y: 3 },
            text: "2x",
            value: 2,
          },
        ]
      },
    ],
  ])("rejects saved step analysis with malformed nested %s", async (_label, mutate) => {
    const session = await createSessionJsonWithStepResult(resultWithRuntimePreviewUrls())
    mutate(childRecord(session, "stepDetectionResult"))

    await expect(restorePdfIntakeSessionFile(createSessionJsonFile(session))).rejects.toMatchObject({
      message: "Session file could not be read. Choose a Bag It session file.",
    })
  })

  it("creates stable download names", () => {
    expect(getSessionDownloadName("5. Hall Tower Instructions.pdf")).toBe(
      "5.-Hall-Tower-Instructions.bagit-session.json",
    )
  })
})

function emptyStepResult(pageCount: number): StepCalloutDetectionResult {
  const scannedPageNumbers = Array.from({ length: pageCount }, (_value, index) => index + 1)

  return {
    detectorVersion: STEP_CALLOUT_DETECTOR_VERSION,
    partColorCalibrationVersion: STEP_PART_COLOR_CALIBRATION_VERSION,
    partExtractorVersion: STEP_PART_EXTRACTOR_VERSION,
    pageCount,
    pageLimit: null,
    scannedPageNumbers,
    skippedPageNumbers: [],
    status: "empty",
    pagePreviews: scannedPageNumbers.map((pageNumber) => ({
      pageNumber,
      width: 100,
      height: 140,
    })),
    pageAttentionItems: [],
    callouts: [],
    qualitySummary: {
      firstBuildStepPageNumber: null,
      inferredCalloutBackgrounds: [],
    },
  }
}

function resultWithRuntimePreviewUrls(): StepCalloutDetectionResult {
  return {
    ...emptyStepResult(1),
    status: "detected",
    pagePreviews: [
      {
        height: 140,
        imageDataUrl: "blob:page-preview",
        pageNumber: 1,
        width: 100,
      },
    ],
    callouts: [
      {
        confidence: 0.9,
        crop: {
          imageDataUrl: "blob:callout-crop",
          region: { height: 44, width: 84, x: 8, y: 18 },
        },
        id: "callout-1",
        inferredBackground: {
          confidence: 0.8,
          hex: "#f7edcf",
          rgb: { b: 207, g: 237, r: 247 },
        },
        indexOnPage: 0,
        pageNumber: 1,
        partItems: [
          {
            confidence: 0.8,
            id: "part-1",
            indexOnCallout: 0,
            partCrop: {
              imageDataUrl: "blob:part-crop",
              region: { height: 14, width: 24, x: 20, y: 24 },
            },
            partImage: {
              alphaMask: {
                data: new Uint8ClampedArray([255]),
                height: 1,
                width: 1,
              },
              imageDataUrl: "blob:part-image",
              region: { height: 14, width: 24, x: 20, y: 24 },
            },
            partRegion: { height: 14, width: 24, x: 20, y: 24 },
            quantity: {
              confidence: 0.9,
              text: "2x",
              value: 2,
            },
            quantityLabel: {
              crop: {
                imageDataUrl: "blob:quantity-crop",
                region: { height: 8, width: 8, x: 12, y: 34 },
              },
              imageDataUrl: "data:image/png;base64,quantity",
              region: { height: 8, width: 8, x: 12, y: 34 },
            },
            sourceRegion: { height: 16, width: 40, x: 12, y: 24 },
          },
        ],
        sourceRegion: { height: 40, width: 80, x: 10, y: 20 },
        stepIndex: 1,
      },
    ],
  }
}

type MutableJsonRecord = Record<string, unknown>

async function createSessionJsonWithStepResult(
  stepDetectionResult: StepCalloutDetectionResult,
): Promise<MutableJsonRecord> {
  const manual = new File(["%PDF-1.7"], "manual.pdf", {
    type: "application/pdf",
    lastModified: 123,
  })
  const metadata: PdfMetadata = {
    fileName: "manual.pdf",
    sizeBytes: manual.size,
    pageCount: stepDetectionResult.pageCount,
    title: null,
    author: null,
  }
  const sessionBlob = await createPdfIntakeSessionFile({
    manualFile: manual,
    metadata,
    stepDetectionResult,
  })

  return JSON.parse(await readBlobAsText(sessionBlob)) as MutableJsonRecord
}

function createSessionJsonFile(session: MutableJsonRecord): File {
  return new File([JSON.stringify(session)], "manual.bagit-session.json", {
    type: "application/json",
  })
}

function firstPartItem(result: MutableJsonRecord): MutableJsonRecord {
  return firstRecord(firstRecord(result.callouts).partItems)
}

function firstRecord(value: unknown): MutableJsonRecord {
  return (value as MutableJsonRecord[])[0] ?? {}
}

function childRecord(parent: MutableJsonRecord, key: string): MutableJsonRecord {
  return parent[key] as MutableJsonRecord
}

function readBlobAsText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") {
    return blob.text()
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }

      reject(new Error("Expected text blob result."))
    })
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Blob read failed.")))
    reader.readAsText(blob)
  })
}
