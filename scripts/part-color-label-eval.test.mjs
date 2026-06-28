import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  evaluatePartColorLabelFiles,
  evaluatePartColorLabels,
  findPartColorLabelConflicts,
  pruneMatchedPartColorLabelNotes,
  readPartColorLabelSets,
  shouldFailPartColorLabelEvaluation,
} from "./part-color-label-eval.mjs"

describe("part color label evaluator", () => {
  it("parses label files recursively", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-color-labels-"))
    const labelDir = path.join(root, "labels")

    writeJson(path.join(labelDir, "manuals", "castle.json"), {
      labels: [{ expectedName: "Black", itemId: "row-1", note: "tiny part" }],
      manualId: "01-castle-ramp",
      reportPath: "report.json",
      status: "gate",
    })

    expect(readPartColorLabelSets(labelDir)).toEqual([
      expect.objectContaining({
        labels: [{ cropHash: null, expectedName: "Black", itemId: "row-1", note: "tiny part", role: "gate" }],
        manualId: "01-castle-ramp",
        status: "gate",
      }),
    ])
  })

  it("defaults row roles from top-level label status and accepts explicit row roles", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-color-labels-"))
    const labelDir = path.join(root, "labels")

    writeJson(path.join(labelDir, "manual.json"), {
      labels: [
        { expectedName: "Black", itemId: "row-1" },
        { expectedName: "White", itemId: "row-2", role: "train" },
      ],
      manualId: "manual",
      reportPath: "report.json",
      status: "active",
    })

    expect(readPartColorLabelSets(labelDir)[0].labels).toEqual([
      { cropHash: null, expectedName: "Black", itemId: "row-1", note: null, role: "active" },
      { cropHash: null, expectedName: "White", itemId: "row-2", note: null, role: "train" },
    ])
  })

  it("allows excluded labels to omit expected names", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-color-labels-"))
    const labelDir = path.join(root, "labels")

    writeJson(path.join(labelDir, "manual.json"), {
      labels: [
        { itemId: "row-excluded", note: "missing dropdown: Sand Green", role: "excluded" },
      ],
      manualId: "manual",
      reportPath: "report.json",
      status: "active",
    })

    expect(readPartColorLabelSets(labelDir)[0].labels).toEqual([
      { cropHash: null, expectedName: undefined, itemId: "row-excluded", note: "missing dropdown: Sand Green", role: "excluded" },
    ])
  })

  it("rejects scored labels without expected names", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-color-labels-"))
    const labelDir = path.join(root, "labels")

    writeJson(path.join(labelDir, "manual.json"), {
      labels: [
        { itemId: "row-active", note: "missing dropdown: Sand Green", role: "active" },
      ],
      manualId: "manual",
      reportPath: "report.json",
      status: "active",
    })

    expect(() => readPartColorLabelSets(labelDir)).toThrow("labels[0].expectedName must be a non-empty string")
  })

  it("rejects duplicate labels", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-color-labels-"))
    const labelDir = path.join(root, "labels")

    writeJson(path.join(labelDir, "bad.json"), {
      labels: [
        { expectedName: "Black", itemId: "row-1" },
        { expectedName: "White", itemId: "row-1" },
      ],
      manualId: "bad",
      reportPath: "report.json",
      status: "gate",
    })

    expect(() => readPartColorLabelSets(labelDir)).toThrow("duplicate label itemId row-1")
  })

  it("scores expected, actual, and confusion counts", () => {
    const labelSet = {
      labels: [
        { cropHash: null, expectedName: "Black", itemId: "row-black", note: null },
        { cropHash: null, expectedName: "Light Bluish Gray", itemId: "row-lbg", note: null },
        { cropHash: null, expectedName: "White", itemId: "row-missing", note: "lost row" },
      ],
      labelPath: "labels/manual.json",
      manualId: "manual",
      reportPath: "report.json",
      status: "gate",
    }
    const report = createReport([
      { colorName: "Black", itemId: "row-black" },
      { colorName: "Dark Bluish Gray", itemId: "row-lbg" },
    ])
    const result = evaluatePartColorLabels({ labelSet, report })

    expect(result).toEqual(expect.objectContaining({
      matched: 1,
      mismatched: 1,
      missing: 1,
      total: 3,
    }))
    expect(result.expectedCounts).toContainEqual({
      count: 1,
      expectedName: "Light Bluish Gray",
      matched: 0,
      mismatched: 1,
      missing: 0,
    })
    expect(result.confusionCounts).toEqual([
      { actualName: "Dark Bluish Gray", count: 1, expectedName: "Light Bluish Gray" },
      { actualName: "missing row", count: 1, expectedName: "White" },
    ])
    expect(result.classificationCounts).toEqual([
      { category: "neutral-small-part-ambiguity", count: 1 },
      { category: "report-row-state", count: 1 },
    ])
  })

  it("separates contradictory same-crop labels from detector mismatches", () => {
    const sharedCropHash = hashDataUrl("same accepted crop")
    const labelSet = {
      labels: [
        { cropHash: sharedCropHash, expectedName: "Black", itemId: "row-black", note: "first label" },
        { cropHash: sharedCropHash, expectedName: "White", itemId: "row-white", note: "contradiction" },
        { cropHash: null, expectedName: "Light Bluish Gray", itemId: "row-lbg", note: null },
      ],
      labelPath: "labels/manual.json",
      manualId: "manual",
      reportPath: "report.json",
      status: "gate",
    }
    const report = createReport([
      { colorName: "Black", itemId: "row-black" },
      { colorName: "Black", itemId: "row-white" },
      { colorName: "Dark Bluish Gray", itemId: "row-lbg" },
    ])
    const result = evaluatePartColorLabels({ labelSet, report })

    expect(result).toEqual(expect.objectContaining({
      conflicts: 2,
      matched: 0,
      mismatched: 1,
      missing: 0,
      total: 3,
    }))
    expect(result.labelConflicts).toEqual([
      expect.objectContaining({
        actualName: "label conflict",
        category: "label-conflict",
        conflictingExpectedNames: ["Black", "White"],
        conflictItemIds: ["row-black", "row-white"],
        itemId: "row-black",
        status: "conflict",
      }),
      expect.objectContaining({
        itemId: "row-white",
        status: "conflict",
      }),
    ])
    expect(result.failedRows).toEqual([
      expect.objectContaining({
        actualName: "Dark Bluish Gray",
        expectedName: "Light Bluish Gray",
        itemId: "row-lbg",
      }),
    ])
    expect(result.confusionCounts).toEqual([
      { actualName: "Dark Bluish Gray", count: 1, expectedName: "Light Bluish Gray" },
    ])
    expect(shouldFailPartColorLabelEvaluation(result)).toBe(true)
  })

  it("can find conflicts from report row crop hashes when labels are not anchored", () => {
    const report = createReport([
      { colorName: "Black", imageDataUrl: "data:image/png;base64,same", itemId: "row-black" },
      { colorName: "Black", imageDataUrl: "data:image/png;base64,same", itemId: "row-white" },
    ])
    const rowsById = new Map(report.classes[0].rows.map((row) => [row.itemId, row]))

    expect(findPartColorLabelConflicts({
      labels: [
        { cropHash: null, expectedName: "Black", itemId: "row-black", note: null },
        { cropHash: null, expectedName: "White", itemId: "row-white", note: null },
      ],
      rowsById,
    })).toEqual([
      expect.objectContaining({
        conflictingExpectedNames: ["Black", "White"],
        evidenceSource: "report-crop-hash",
        itemId: "row-black",
        status: "conflict",
      }),
      expect.objectContaining({
        itemId: "row-white",
        status: "conflict",
      }),
    ])
  })

  it("classifies warm and gold/nougat mismatches separately", () => {
    const labelSet = {
      labels: [
        { cropHash: null, expectedName: "Red", itemId: "row-red", note: null },
        { cropHash: null, expectedName: "Trans-Orange", itemId: "row-orange", note: null },
      ],
      labelPath: "labels/manual.json",
      manualId: "manual",
      reportPath: "report.json",
      status: "active",
    }
    const report = createReport([
      { colorName: "Reddish Brown", itemId: "row-red" },
      { colorName: "Medium Nougat", itemId: "row-orange" },
    ])

    expect(evaluatePartColorLabels({ labelSet, report }).classificationCounts).toEqual([
      { category: "gold-nougat-trans-singleton", count: 1 },
      { category: "warm-red-trans-brown", count: 1 },
    ])
  })

  it("matches Rebrickable Blue to legacy Bright Blue naming", () => {
    const labelSet = {
      labels: [
        { cropHash: null, expectedName: "Blue", itemId: "row-blue", note: null },
        { cropHash: null, expectedName: "Bright Blue", itemId: "row-bright-blue", note: null },
      ],
      labelPath: "labels/manual.json",
      manualId: "manual",
      reportPath: "report.json",
      status: "active",
    }
    const report = createReport([
      { colorName: "Bright Blue", itemId: "row-blue" },
      { colorName: "Blue", itemId: "row-bright-blue" },
    ])

    expect(evaluatePartColorLabels({ labelSet, report })).toEqual(expect.objectContaining({
      matched: 2,
      mismatched: 0,
      total: 2,
    }))
  })

  it("matches legacy gray names to bluish gray names for scoring", () => {
    const labelSet = {
      labels: [
        { cropHash: null, expectedName: "Light Gray", itemId: "row-light-gray", note: null },
        { cropHash: null, expectedName: "Dark Bluish Gray", itemId: "row-dark-gray", note: null },
      ],
      labelPath: "labels/manual.json",
      manualId: "manual",
      reportPath: "report.json",
      status: "active",
    }
    const report = createReport([
      { colorName: "Light Bluish Gray", itemId: "row-light-gray" },
      { colorName: "Dark Gray", itemId: "row-dark-gray" },
    ])

    expect(evaluatePartColorLabels({ labelSet, report })).toEqual(expect.objectContaining({
      matched: 2,
      mismatched: 0,
      total: 2,
    }))
  })

  it("classifies blue and green family splits separately", () => {
    const labelSet = {
      labels: [
        { cropHash: null, expectedName: "Dark Azure", itemId: "row-blue", note: null },
        { cropHash: null, expectedName: "Bright Green", itemId: "row-green", note: null },
      ],
      labelPath: "labels/manual.json",
      manualId: "manual",
      reportPath: "report.json",
      status: "active",
    }
    const report = createReport([
      { colorName: "Blue", itemId: "row-blue" },
      { colorName: "Green", itemId: "row-green" },
    ])

    expect(evaluatePartColorLabels({ labelSet, report }).classificationCounts).toEqual([
      { category: "blue-green-family-split", count: 2 },
    ])
  })

  it("matches labeled unknown rows", () => {
    const labelSet = {
      labels: [{ expectedName: "Unknown", itemId: "row-unknown", note: null }],
      labelPath: "labels/manual.json",
      manualId: "manual",
      reportPath: "report.json",
      status: "gate",
    }
    const report = {
      classes: [],
      unknownRows: [{ colorName: null, itemId: "row-unknown" }],
    }

    expect(evaluatePartColorLabels({ labelSet, report })).toEqual(expect.objectContaining({
      matched: 1,
      mismatched: 0,
      missing: 0,
    }))
  })

  it("fails only gate labels", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-color-labels-"))
    const labelDir = path.join(root, "labels")
    const reportPath = path.join(root, "report.json")

    writeJson(reportPath, createReport([{ colorName: "Black", itemId: "row-1" }]))
    writeJson(path.join(labelDir, "active.json"), {
      labels: [{ expectedName: "White", itemId: "row-1" }],
      manualId: "active-manual",
      reportPath,
      status: "active",
    })

    expect(evaluatePartColorLabelFiles({ labelDir })).toEqual(expect.objectContaining({
      failed: false,
      labelCount: 1,
      labelFileCount: 1,
    }))

    writeJson(path.join(labelDir, "gate.json"), {
      labels: [{ expectedName: "White", itemId: "row-1" }],
      manualId: "gate-manual",
      reportPath,
      status: "gate",
    })

    expect(evaluatePartColorLabelFiles({ labelDir })).toEqual(expect.objectContaining({
      failed: true,
      labelCount: 2,
      labelFileCount: 2,
    }))
  })

  it("can evaluate one manual label file by manual id", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-color-labels-"))
    const labelDir = path.join(root, "labels")
    const reportPath = path.join(root, "report.json")

    writeJson(reportPath, createReport([{ colorName: "Black", itemId: "row-1" }]))
    writeJson(path.join(labelDir, "selected.json"), {
      labels: [{ expectedName: "Black", itemId: "row-1" }],
      manualId: "selected-manual",
      reportPath,
      status: "gate",
    })
    writeJson(path.join(labelDir, "other.json"), {
      labels: [{ expectedName: "White", itemId: "row-1" }],
      manualId: "other-manual",
      reportPath,
      status: "gate",
    })

    expect(evaluatePartColorLabelFiles({ labelDir, manualId: "selected-manual" })).toEqual(expect.objectContaining({
      failed: false,
      labelCount: 1,
      labelFileCount: 1,
    }))
  })

  it("prunes notes only from labels whose current report row matches", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-color-labels-"))
    const labelDir = path.join(root, "labels")
    const reportPath = path.join(root, "report.json")
    const labelPath = path.join(labelDir, "manual.json")

    writeJson(reportPath, createReport([
      { colorName: "Black", itemId: "row-match" },
      { colorName: "Dark Bluish Gray", itemId: "row-mismatch" },
    ]))
    writeJson(labelPath, {
      labels: [
        { expectedName: "Black", itemId: "row-match", note: "stale note" },
        { expectedName: "Light Bluish Gray", itemId: "row-mismatch", note: "current problem" },
      ],
      manualId: "manual",
      reportPath,
      status: "active",
    })

    expect(pruneMatchedPartColorLabelNotes({ labelDir, manualId: "manual" })).toEqual({
      fileCount: 1,
      pruned: 1,
      summaries: [expect.objectContaining({ manualId: "manual", pruned: 1 })],
    })
    expect(readPartColorLabelSets(labelDir)[0].labels).toEqual([
      { cropHash: null, expectedName: "Black", itemId: "row-match", note: null, role: "active" },
      { cropHash: null, expectedName: "Light Bluish Gray", itemId: "row-mismatch", note: "current problem", role: "active" },
    ])
  })

  it("excludes excluded labels from score totals and gate failure state", () => {
    const labelSet = {
      labels: [
        { cropHash: null, expectedName: "Black", itemId: "row-black", note: null, role: "gate" },
        { cropHash: null, expectedName: "White", itemId: "row-excluded", note: null, role: "excluded" },
      ],
      labelPath: "labels/manual.json",
      manualId: "manual",
      reportPath: "report.json",
      status: "gate",
    }
    const report = createReport([
      { colorName: "Black", itemId: "row-black" },
      { colorName: "Tan", itemId: "row-excluded" },
    ])
    const result = evaluatePartColorLabels({ labelSet, report })

    expect(result).toEqual(expect.objectContaining({
      excluded: 1,
      gateFailures: 0,
      matched: 1,
      mismatched: 0,
      total: 1,
    }))
    expect(shouldFailPartColorLabelEvaluation(result)).toBe(false)
  })

  it("rejects stale saved color reports before scoring labels", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-color-labels-"))
    const labelDir = path.join(root, "labels")
    const reportPath = path.join(root, "report.json")

    writeJson(reportPath, {
      ...createReport([{ colorName: "White", itemId: "row-1" }]),
      colorSource: "saved-app-result",
      versions: { partColorCalibrationStale: true },
    })
    writeJson(path.join(labelDir, "manual.json"), {
      labels: [{ expectedName: "White", itemId: "row-1" }],
      manualId: "manual",
      reportPath,
      status: "gate",
    })

    const result = evaluatePartColorLabelFiles({ labelDir })

    expect(result.failed).toBe(true)
    expect(result.messages).toContain("  confusion * -> stale report: 1")
  })

  it("reports row crop drift when a labeled crop hash changes", () => {
    const labelSet = {
      labels: [{
        cropHash: hashDataUrl("data:image/png;base64,old"),
        expectedName: "Black",
        itemId: "row-1",
        note: null,
      }],
      labelPath: "labels/manual.json",
      manualId: "manual",
      reportPath: "report.json",
      status: "gate",
    }
    const report = createReport([{
      colorName: "Black",
      imageDataUrl: "data:image/png;base64,new",
      itemId: "row-1",
    }])

    expect(evaluatePartColorLabels({ labelSet, report })).toEqual(expect.objectContaining({
      matched: 0,
      mismatched: 1,
      missing: 0,
    }))
  })
})

function createReport(rows) {
  return {
    classes: [
      {
        rows: rows.map((row) => ({
          colorName: row.colorName,
          cropHash: row.cropHash,
          imageDataUrl: row.imageDataUrl,
          itemId: row.itemId,
        })),
      },
    ],
    unknownRows: [],
  }
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function hashDataUrl(value) {
  return createHash("sha256").update(value).digest("hex")
}
