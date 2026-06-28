import { describe, expect, it } from "vitest"
import {
  createMinimalInputSession,
  splitBagAnalysisSession,
} from "./split-bag-analysis-fixtures.mjs"

describe("splitBagAnalysisSession", () => {
  it("creates a minimal resumable input session with no analysis data", () => {
    const minimal = createMinimalInputSession(createSourceSession())

    expect(minimal).toEqual({
      kind: "bag-it-session",
      version: 1,
      savedAt: "2026-06-17T00:00:00.000Z",
      manual: {
        fileName: "manual.pdf",
        mimeType: "application/pdf",
        sizeBytes: 3,
        lastModified: 1,
        dataBase64: "JVBERg==",
      },
      metadata: {
        fileName: "manual.pdf",
        sizeBytes: 3,
        pageCount: 1,
        title: null,
        author: null,
      },
    })
  })

  it("splits callouts into page/order and crop regions only", () => {
    const split = splitBagAnalysisSession(createSourceSession(), {
      caseId: "manual-test",
    })

    expect(split.calloutsFixture).toEqual({
      schemaVersion: 2,
      caseId: "manual-test",
      callouts: [
        {
          ordinal: 0,
          pageNumber: 1,
          crop: {
            region: { x: 10, y: 20, width: 100, height: 80 },
          },
        },
      ],
    })
  })

  it("splits part rows into quantities, crop regions, label regions, and compact alpha masks", () => {
    const split = splitBagAnalysisSession(createSourceSession(), {
      caseId: "manual-test",
    })

    expect(split.partsFixture).toEqual({
      schemaVersion: 2,
      caseId: "manual-test",
      callouts: [
        {
          ordinal: 0,
          pageNumber: 1,
          parts: [
            {
              ordinal: 0,
              quantity: { text: "2x", value: 2 },
              color: {
                name: "Green",
                family: "green",
                status: "review",
                swatchHex: "#165025",
                manualClassId: "manual-color-001",
                manualClassTrusted: false,
                rawManualClassId: "manual-color-001",
              },
              partRegion: { x: 25, y: 35, width: 20, height: 10 },
              quantityLabelRegion: { x: 12, y: 36, width: 8, height: 6 },
              alphaMask: {
                width: 3,
                height: 2,
                encoding: "uint8-base64",
                dataBase64: "AP+AAQD/",
              },
            },
          ],
        },
      ],
    })
  })

  it("counts exported color rows in the manifest case", () => {
    const split = splitBagAnalysisSession(createSourceSession(), {
      caseId: "manual-test",
    })

    expect(split.manifestCase.expectedColorRows).toBe(1)
  })
})

function createSourceSession() {
  return {
    kind: "bag-it-session",
    version: 1,
    savedAt: "2026-06-17T00:00:00.000Z",
    manual: {
      fileName: "manual.pdf",
      mimeType: "application/pdf",
      sizeBytes: 3,
      lastModified: 1,
      dataBase64: "JVBERg==",
    },
    metadata: {
      fileName: "manual.pdf",
      sizeBytes: 3,
      pageCount: 1,
      title: null,
      author: null,
    },
    stepDetectionResult: {
      detectorVersion: "detector-test",
      partExtractorVersion: "parts-test",
      partColorCalibrationVersion: "colors-test",
      pageCount: 1,
      pageLimit: null,
      scannedPageNumbers: [1],
      skippedPageNumbers: [],
      status: "detected",
      pagePreviews: [],
      pageAttentionItems: [],
      callouts: [
        {
          id: "callout-1",
          pageNumber: 1,
          indexOnPage: 0,
          stepIndex: 0,
          confidence: 1,
          sourceRegion: { x: 11, y: 21, width: 90, height: 70 },
          crop: {
            imageDataUrl: "data:image/png;base64,ignored",
            region: { x: 10, y: 20, width: 100, height: 80 },
          },
          inferredBackground: {
            rgb: { r: 255, g: 255, b: 255 },
            hex: "#ffffff",
            confidence: 1,
          },
          partItems: [
            {
              id: "part-1",
              indexOnCallout: 0,
              confidence: 1,
              sourceRegion: { x: 25, y: 35, width: 20, height: 10 },
              partRegion: { x: 25, y: 35, width: 20, height: 10 },
              partImage: {
                imageDataUrl: "data:image/png;base64,ignored",
                region: { x: 25, y: 35, width: 20, height: 10 },
                alphaMask: {
                  width: 3,
                  height: 2,
                  data: {
                    0: 0,
                    1: 255,
                    2: 128,
                    3: 1,
                    4: 0,
                    5: 255,
                  },
                },
              },
              quantityLabel: {
                imageDataUrl: "data:image/png;base64,ignored",
                region: { x: 12, y: 36, width: 8, height: 6 },
              },
              quantity: { text: " 2x ", value: 2, confidence: 0.9 },
              detectedColor: {
                name: "Green",
                family: "green",
                status: "review",
                swatchHex: "#165025",
                manualClassId: "manual-color-001",
                manualClassTrusted: false,
                rawManualClassId: "manual-color-001",
              },
            },
          ],
        },
      ],
    },
    calloutMultipliers: { ignored: 2 },
    checkedBagRowIds: ["ignored"],
    checkedBagCompletionAnchors: [{ rowId: "ignored" }],
  }
}
