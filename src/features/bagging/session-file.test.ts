import { describe, expect, it } from "vitest"
import {
  createBaggingSessionFile,
  getBaggingSessionDownloadName,
  isRestoredAnalysisCurrent,
  isRestoredStepAnalysisCurrent,
  restoreBaggingSessionFile,
} from "./session-file"
import type { PartsListPdfExtractionResult } from "./parts-list-pdf-extraction"
import type { PdfIntakeJobSnapshot, PdfIntakeMetadata } from "./pdf-intake"
import { getStepCalloutBagChecklistRowIds } from "./step-callout-bagging"
import { stepCalloutDetectorVersion, type StepCalloutDetectionResult } from "./step-callout-detection"

describe("Bag It session files", () => {
  it("round-trips manual bytes, analysis data, preview cache, and checked rows", async () => {
    const manualFile = new File(["%PDF-1.7 session"], "Castle Manual.pdf", { type: "application/pdf" })
    const metadata = createMetadata(manualFile)
    const jobSnapshot = createJobSnapshot(metadata)
    const partsListResult = createPartsListResult("parts-list-extraction-v26")
    const stepCalloutResult = createStepCalloutResult()
    const stepCalloutMultipliers = {
      "missing-callout": 4,
      "step-callout:p1:r1": 3.8,
    }
    const checkedStepBagRowIds = getStepCalloutBagChecklistRowIds(stepCalloutResult, {
      calloutMultipliers: { "step-callout:p1:r1": 3 },
      inventoryPartCount: 14,
    })
    const sessionFile = await createBaggingSessionFile({
      attemptedPartPreviewKeys: new Set(["3005:0"]),
      checkedRowIds: new Set(["2-0-14-3005-0"]),
      checkedStepBagRowIds: new Set([...checkedStepBagRowIds, "stale-step-bag-row"]),
      currentExtractorVersion: "parts-list-extraction-v26",
      jobSnapshot,
      manualFile,
      metadata,
      partPreviewByKey: new Map([
        [
          "3005:0",
          {
            colorId: "0",
            imageUrl: "https://cdn.rebrickable.com/media/parts/elements/3005.jpg",
            key: "3005:0",
            name: "Brick 1 x 1",
            partNumber: "3005",
          },
        ],
      ]),
      partsListResult,
      stepCalloutMultipliers,
      stepCalloutResult,
    })

    const restored = await restoreBaggingSessionFile(
      new File([JSON.stringify(sessionFile)], "Castle-Manual.bagit.json", { type: "application/json" }),
    )

    await expect(restored.manualFile.text()).resolves.toBe("%PDF-1.7 session")
    expect(restored.manualFile.name).toBe("Castle Manual.pdf")
    expect(restored.metadata).toEqual(metadata)
    expect(restored.jobSnapshot).toEqual(jobSnapshot)
    expect(restored.partsListResult).toEqual(partsListResult)
    expect(restored.stepCalloutResult).toEqual(createStepCalloutResult())
    expect(restored.stepCalloutMultipliers).toEqual({ "step-callout:p1:r1": 3 })
    expect(restored.checkedStepBagRowIds).toEqual(checkedStepBagRowIds)
    expect(restored.partPreviewByKey.get("3005:0")?.name).toBe("Brick 1 x 1")
    expect(restored.attemptedPartPreviewKeys.has("3005:0")).toBe(true)
    expect(restored.checkedRowIds.has("2-0-14-3005-0")).toBe(true)
    expect(isRestoredAnalysisCurrent(restored, "parts-list-extraction-v26")).toBe(true)
    expect(isRestoredStepAnalysisCurrent(restored, stepCalloutDetectorVersion)).toBe(true)
  })

  it("detects restored analysis from an older extractor version", async () => {
    const restored = {
      partsListResult: createPartsListResult("parts-list-extraction-v25"),
      savedExtractorVersion: "parts-list-extraction-v25",
    }

    expect(isRestoredAnalysisCurrent(restored, "parts-list-extraction-v26")).toBe(false)
  })

  it("detects restored current-version analysis without normalization data", async () => {
    const restored = {
      partsListResult: {
        ...createPartsListResult("parts-list-extraction-v26"),
        normalization: undefined,
      },
      savedExtractorVersion: "parts-list-extraction-v26",
    }

    expect(isRestoredAnalysisCurrent(restored, "parts-list-extraction-v26")).toBe(false)
  })

  it("quarantines structurally stale step analysis while preserving the saved detector version", async () => {
    const manualFile = new File(["%PDF-1.7 session"], "Castle Manual.pdf", { type: "application/pdf" })
    const sessionFile = await createBaggingSessionFile({
      attemptedPartPreviewKeys: new Set(),
      checkedRowIds: new Set(),
      currentExtractorVersion: "parts-list-extraction-v26",
      jobSnapshot: createJobSnapshot(createMetadata(manualFile)),
      manualFile,
      metadata: createMetadata(manualFile),
      partPreviewByKey: new Map(),
      partsListResult: createPartsListResult("parts-list-extraction-v26"),
      stepCalloutResult: createStepCalloutResult(),
    })
    const legacySessionFile = structuredClone(sessionFile)
    delete (legacySessionFile.analysis.stepCalloutResult?.callouts[0] as Partial<{
      stepIndex: number
    }>).stepIndex

    const restored = await restoreBaggingSessionFile(
      new File([JSON.stringify(legacySessionFile)], "Castle-Manual.bagit.json", { type: "application/json" }),
    )

    expect(restored.savedStepCalloutDetectorVersion).toBe(stepCalloutDetectorVersion)
    expect(restored.stepCalloutResult).toBeNull()
    expect(restored.stepCalloutMultipliers).toEqual({})
    expect(isRestoredStepAnalysisCurrent(restored, stepCalloutDetectorVersion)).toBe(false)
    expect(isRestoredAnalysisCurrent(restored, "parts-list-extraction-v26")).toBe(true)
  })

  it("creates filesystem-safe session download names", () => {
    expect(getBaggingSessionDownloadName("Castle Ramp Instructions.pdf")).toBe("Castle-Ramp-Instructions.bagit.json")
    expect(getBaggingSessionDownloadName("")).toBe("bag-it-session.bagit.json")
  })
})

function createMetadata(file: File): PdfIntakeMetadata {
  return {
    fileName: file.name,
    fingerprint: "test-fingerprint",
    pageCount: 2,
    readMode: "parser",
    sizeBytes: file.size,
  }
}

function createJobSnapshot(metadata: PdfIntakeMetadata): PdfIntakeJobSnapshot {
  return {
    errorMessage: null,
    id: "test-job",
    metadata,
    pageRenderProgress: 100,
    pageRenders: [
      {
        dataUrl: "data:image/png;base64,test",
        height: 426,
        pageNumber: 2,
        renderKind: "canvas",
        width: 320,
      },
    ],
    progress: 100,
    sourceBytesPurged: true,
    startedAt: 1,
    state: "complete",
    updatedAt: 2,
  }
}

function createPartsListResult(extractorVersion: string): PartsListPdfExtractionResult {
  const row: PartsListPdfExtractionResult["rows"][number] = {
    color: { id: "0", matchedText: "Black", name: "Black" },
    confidence: 1,
    parserVersion: "parts-list-v1",
    part: { cataloguePartNumber: "3005", matchKind: "exact" },
    partNumber: "3005",
    partNumberKind: "numeric",
    quantity: 14,
    rawText: "14 x 3005 Black",
    sourceKind: "ocr",
    sourcePage: 2,
    sourceTextRange: { end: 16, start: 0 },
  }

  return {
    candidates: [
      {
        anchorCount: 1,
        highConfidenceRowCount: 1,
        pageNumber: 2,
        rowCount: 1,
        score: 1,
        searchTier: "tail",
      },
    ],
    confidence: 1,
    debugPageTexts: [
      {
        pageNumber: 2,
        rawText: "14 x 3005 Black",
        rowSourceCount: 1,
        sourceKind: "ocr",
        text: "14 x 3005 Black",
      },
    ],
    extractionMethod: "ocr",
    extractorVersion: extractorVersion as PartsListPdfExtractionResult["extractorVersion"],
    lowConfidenceRows: [],
    nativeTextPageCount: 2,
    ocrPageCount: 1,
    reason: null,
    rows: [row],
    normalization: {
      ambiguousQuantity: 0,
      attentionRows: [],
      catalogueSnapshotId: "snapshot-id",
      coverageThreshold: 0.9,
      resolvedQuantity: 14,
      rows: [
        {
          color: row.color,
          issues: [],
          part: row.part,
          partCandidates: [
            {
              matchKind: "exact",
              partNumber: "3005",
              rank: 100,
              selected: true,
            },
          ],
          partNumber: "3005",
          quantity: 14,
          rowId: "2-0-14-3005-0",
          sourcePage: 2,
          status: "resolved",
        },
      ],
      status: "ready",
      totalQuantity: 14,
      unresolvedQuantity: 0,
    },
    status: "supported",
  }
}

function createStepCalloutResult(): StepCalloutDetectionResult {
  return {
    callouts: [
      {
        confidence: 0.82,
        crop: {
          dataUrl: "data:image/png;base64,step-callout",
          height: 120,
          width: 180,
        },
        id: "step-callout:p1:r1",
        indexOnPage: 1,
        pageNumber: 1,
        partItems: [
          {
            confidence: 0.73,
            detectedColor: {
              confidence: 0.82,
              hex: "#237823",
              name: "Green",
              rgb: {
                b: 35,
                g: 120,
                r: 35,
              },
            },
            id: "step-callout:p1:r1:item1",
            indexOnCallout: 1,
            localImageMatch: null,
            partCrop: {
              dataUrl: "data:image/png;base64,step-part",
              height: 56,
              width: 64,
            },
            partRegion: {
              height: 56,
              unit: "step_pixel",
              width: 64,
              x: 30,
              y: 42,
            },
            quantityLabel: {
              crop: {
                dataUrl: "data:image/png;base64,step-quantity",
                height: 14,
                width: 28,
              },
              region: {
                height: 14,
                unit: "step_pixel",
                width: 28,
                x: 48,
                y: 104,
              },
            },
            quantity: {
              confidence: 0.86,
              text: "1",
              value: 1,
            },
            sourceRegion: {
              height: 88,
              unit: "step_pixel",
              width: 80,
              x: 24,
              y: 36,
            },
          },
        ],
        sourceImage: {
          height: 900,
          unit: "step_pixel",
          width: 700,
        },
        sourceRegion: {
          height: 120,
          unit: "step_pixel",
          width: 180,
          x: 20,
          y: 30,
        },
        stepIndex: 1,
      },
    ],
    detectorVersion: stepCalloutDetectorVersion,
    pageCount: 2,
    pageLimit: null,
    scannedPageNumbers: [1],
    skippedBomPageNumbers: [2],
    status: "detected",
  }
}
