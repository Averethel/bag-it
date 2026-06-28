import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { buildPartColorReportRegressionSnapshot } from "./part-color-report-regression.mjs"
import { buildPartCropReportRegressionSnapshot } from "./part-crop-report-regression.mjs"
import { validateDetectorRegressionGates } from "./validate-detector-regressions.mjs"

describe("detector regression gate", () => {
  it("skips missing private snapshots outside tuning mode", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-detector-regressions-"))
    const result = validateDetectorRegressionGates({
      colorLabelDir: path.join(root, "missing-labels"),
      colorSnapshotDir: path.join(root, "missing-colors"),
      cropSnapshotDir: path.join(root, "missing-crops"),
      partMatchLabelDir: path.join(root, "missing-part-match-labels"),
      runSavedSessions: false,
    })

    expect(result).toEqual({
      colorLabelCount: 0,
      colorLabelFileCount: 0,
      colorSnapshotCount: 0,
      cropSnapshotCount: 0,
      partMatchLabelCount: 0,
      partMatchLabelFileCount: 0,
      messages: [
        "No part color report snapshots found; skipping part color report gate.",
        "No part color label files found; skipping part color label gate.",
        "No part match label files found; skipping part match label gate.",
        "No part crop report snapshots found; skipping part crop report gate.",
        "Bag-analysis e2e fixture gate skipped by option.",
      ],
    })
  })

  it("requires tuning snapshots in strict mode", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-detector-regressions-"))

    expect(() =>
      validateDetectorRegressionGates({
        colorLabelDir: path.join(root, "missing-labels"),
        colorSnapshotDir: path.join(root, "missing-colors"),
        cropSnapshotDir: path.join(root, "missing-crops"),
        partMatchLabelDir: path.join(root, "missing-part-match-labels"),
        runSavedSessions: false,
        strict: true,
      }),
    ).toThrow("Missing required part color report snapshots: 02-middle-wall")
  })

  it("validates present private snapshots", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-detector-regressions-"))
    const colorLabelDir = path.join(root, "labels")
    const colorReportPath = path.join(root, "color-report.json")
    const cropReportPath = path.join(root, "crop-report.json")
    const partMatchLabelDir = path.join(root, "part-match-labels")
    const partMatchReportPath = path.join(root, "part-match-report.json")
    const colorSnapshotDir = path.join(root, "colors")
    const cropSnapshotDir = path.join(root, "crops")
    const colorReport = createColorReport()
    const cropReport = createCropReport()

    writeJson(colorReportPath, colorReport)
    writeJson(cropReportPath, cropReport)
    writeJson(partMatchReportPath, createPartMatchReport())
    writeJson(
      path.join(colorSnapshotDir, "02-middle-wall.json"),
      buildPartColorReportRegressionSnapshot(colorReport, {
        acceptedAt: "2026-06-14T00:00:00.000Z",
        id: "02-middle-wall",
        reportPath: colorReportPath,
      }),
    )
    writeJson(
      path.join(colorLabelDir, "02-middle-wall.json"),
      {
        labels: [{ expectedName: "Black", itemId: "row-1" }],
        manualId: "02-middle-wall",
        reportPath: colorReportPath,
        status: "gate",
      },
    )
    writeJson(
      path.join(partMatchLabelDir, "part-manual.json"),
      {
        labels: [
          { expectedPartKey: "brick", itemId: "row-a" },
          { expectedPartKey: "brick", itemId: "row-b" },
        ],
        manualId: "part-manual",
        reportPath: partMatchReportPath,
        status: "gate",
      },
    )
    writeJson(
      path.join(cropSnapshotDir, "lower-courtyard-crops.json"),
      buildPartCropReportRegressionSnapshot(cropReport, {
        acceptedAt: "2026-06-14T00:00:00.000Z",
        id: "lower-courtyard-crops",
        reportPath: cropReportPath,
      }),
    )

    const result = validateDetectorRegressionGates({
      colorLabelDir,
      colorSnapshotDir,
      cropSnapshotDir,
      partMatchLabelDir,
      runSavedSessions: false,
      strict: true,
    })

    expect(result.colorSnapshotCount).toBe(1)
    expect(result.colorLabelCount).toBe(1)
    expect(result.colorLabelFileCount).toBe(1)
    expect(result.cropSnapshotCount).toBe(1)
    expect(result.partMatchLabelCount).toBe(2)
    expect(result.partMatchLabelFileCount).toBe(1)
    expect(result.messages).toContain("Validated 1 part color report snapshot(s).")
    expect(result.messages).toContain("02-middle-wall (gate): 1/1 matched, 0 mismatched, 0 missing.")
    expect(result.messages).toContain("part-manual: 1/1 expected pairs matched; 0 false groups, 0 missed pairs, 0 crop drifts.")
    expect(result.messages).toContain("Validated 1 part crop report snapshot(s).")
  })

  it("fails when gate labels mismatch", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-detector-regressions-"))
    const colorLabelDir = path.join(root, "labels")
    const colorReportPath = path.join(root, "color-report.json")

    writeJson(colorReportPath, createColorReport())
    writeJson(
      path.join(colorLabelDir, "02-middle-wall.json"),
      {
        labels: [{ expectedName: "White", itemId: "row-1" }],
        manualId: "02-middle-wall",
        reportPath: colorReportPath,
        status: "gate",
      },
    )

    expect(() =>
      validateDetectorRegressionGates({
        colorLabelDir,
        colorSnapshotDir: path.join(root, "missing-colors"),
        cropSnapshotDir: path.join(root, "missing-crops"),
        partMatchLabelDir: path.join(root, "missing-part-match-labels"),
        runSavedSessions: false,
      }),
    ).toThrow("Part color label gate failed.")
  })

  it("fails when part match gate labels miss an expected pair", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-detector-regressions-"))
    const partMatchLabelDir = path.join(root, "part-match-labels")
    const partMatchReportPath = path.join(root, "part-match-report.json")

    writeJson(partMatchReportPath, {
      ...createPartMatchReport(),
      groups: [],
    })
    writeJson(
      path.join(partMatchLabelDir, "part-manual.json"),
      {
        labels: [
          { expectedPartKey: "brick", itemId: "row-a" },
          { expectedPartKey: "brick", itemId: "row-b" },
        ],
        manualId: "part-manual",
        reportPath: partMatchReportPath,
        status: "gate",
      },
    )

    expect(() =>
      validateDetectorRegressionGates({
        colorLabelDir: path.join(root, "missing-labels"),
        colorSnapshotDir: path.join(root, "missing-colors"),
        cropSnapshotDir: path.join(root, "missing-crops"),
        partMatchLabelDir,
        runSavedSessions: false,
      }),
    ).toThrow("Part match label gate failed.")
  })
})

function createColorReport() {
  return {
    classes: [
      {
        id: "manual-color-001",
        mergeReason: "raw",
        name: "Black",
        quantityCount: 1,
        rawClassIds: ["manual-color-001"],
        rowCount: 1,
        rows: [
          {
            colorName: "Black",
            colorStatus: "exact",
            itemId: "row-1",
            manualClassId: "manual-color-001",
            quantity: 1,
            rawManualClassId: "manual-color-001",
          },
        ],
        status: "exact",
        swatchHex: "#000000",
        trustedRows: 1,
      },
    ],
    colorSource: "saved",
    totals: { rows: 1 },
    versions: {
      currentPartColorCalibrationVersion: "test-current",
      partColorCalibrationVersion: "test-current",
    },
  }
}

function createCropReport() {
  return {
    classes: [
      {
        rows: [
          {
            imageDataUrl: "data:image/png;base64,test",
            itemId: "row-1",
            pageNumber: 1,
            partRegion: { height: 2, width: 3, x: 4, y: 5 },
            quantity: 1,
            stepIndex: 2,
          },
        ],
      },
    ],
    totals: { rows: 1 },
    versions: {
      currentPartExtractorVersion: "test-current",
      partExtractorVersion: "test-current",
    },
  }
}

function createPartMatchReport() {
  return {
    groups: [{
      groupId: "group-1",
      rowIds: ["row-a", "row-b"],
    }],
    rows: [
      {
        bagId: "bag-1",
        cropHash: "hash-a",
        itemId: "row-a",
        rowId: "row-a",
      },
      {
        bagId: "bag-1",
        cropHash: "hash-b",
        itemId: "row-b",
        rowId: "row-b",
      },
    ],
    versions: {
      partExtractorCurrent: true,
      partMatcherCurrent: true,
    },
  }
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}
