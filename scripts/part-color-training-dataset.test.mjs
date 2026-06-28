import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { buildPartColorTrainingDatasetSummary } from "./part-color-training-dataset.mjs"

describe("part color training dataset summary", () => {
  it("counts trainable labels and rejects score-only or excluded roles", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-training-dataset-"))
    const labelDir = path.join(root, "labels")
    const reportPath = path.join(root, "report.json")

    writeJson(reportPath, createReport([
      { colorName: "Black", family: "neutral", itemId: "row-gate" },
      { colorName: "Green", family: "green", itemId: "row-train" },
      { colorName: "White", family: "neutral", itemId: "row-holdout" },
      { colorName: "Tan", family: "tan", itemId: "row-active" },
      { colorName: "Red", family: "red", itemId: "row-excluded" },
      { colorName: "Green", family: "green", itemId: "row-weak", sampleStatus: "weak-classifiable" },
    ]))
    writeJson(path.join(labelDir, "manual.json"), {
      labels: [
        { expectedName: "Black", itemId: "row-gate", role: "gate" },
        { expectedName: "Green", itemId: "row-train", role: "train" },
        { expectedName: "White", itemId: "row-holdout", role: "holdout" },
        { expectedName: "Tan", itemId: "row-active", role: "active" },
        { expectedName: "Red", itemId: "row-excluded", role: "excluded" },
        { expectedName: "Green", itemId: "row-weak", role: "train" },
      ],
      manualId: "manual",
      reportPath,
      status: "active",
    })

    const summary = buildPartColorTrainingDatasetSummary({ labelDir })

    expect(summary.totals).toEqual({
      dirtyLabels: 4,
      excludedLabels: 1,
      manuals: 1,
      scoredLabels: 5,
      trainableExamples: 2,
    })
    expect(summary.trainableByManualRole).toEqual([
      { gate: 1, manualId: "manual", train: 1 },
    ])
    expect(summary.dirtyLabelSummary).toEqual([
      { count: 2, reason: "score-only-role" },
      { count: 1, reason: "excluded-role" },
      { count: 1, reason: "unclear-sample" },
    ])
  })

  it("rejects stale crop hashes and contradictory crop evidence from training", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-training-dataset-"))
    const labelDir = path.join(root, "labels")
    const reportPath = path.join(root, "report.json")
    const sharedImage = "data:image/png;base64,same-crop"

    writeJson(reportPath, createReport([
      { colorName: "Black", family: "neutral", imageDataUrl: "data:image/png;base64,new-crop", itemId: "row-drift" },
      { colorName: "Green", family: "green", imageDataUrl: sharedImage, itemId: "row-green" },
      { colorName: "Green", family: "green", imageDataUrl: sharedImage, itemId: "row-red" },
    ]))
    writeJson(path.join(labelDir, "manual.json"), {
      labels: [
        { cropHash: hashDataUrl("data:image/png;base64,old-crop"), expectedName: "Black", itemId: "row-drift", role: "train" },
        { expectedName: "Green", itemId: "row-green", role: "train" },
        { expectedName: "Red", itemId: "row-red", role: "train" },
      ],
      manualId: "manual",
      reportPath,
      status: "active",
    })

    const summary = buildPartColorTrainingDatasetSummary({ labelDir })

    expect(summary.totals.trainableExamples).toBe(0)
    expect(summary.dirtyLabelSummary).toEqual([
      { count: 2, reason: "conflicting-crop-hash" },
      { count: 1, reason: "stale-crop-hash" },
    ])
  })

  it("summarizes close-pair confusions and family counts", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-training-dataset-"))
    const labelDir = path.join(root, "labels")
    const reportPath = path.join(root, "report.json")

    writeJson(reportPath, createReport([
      { colorName: "Dark Bluish Gray", family: "neutral", itemId: "row-lbg" },
      { colorName: "Medium Nougat", family: "tan-gold", itemId: "row-gold" },
    ]))
    writeJson(path.join(labelDir, "manual.json"), {
      labels: [
        { expectedName: "Light Bluish Gray", itemId: "row-lbg", role: "holdout" },
        { expectedName: "Pearl Gold", itemId: "row-gold", role: "holdout" },
      ],
      manualId: "manual",
      reportPath,
      status: "active",
    })

    const summary = buildPartColorTrainingDatasetSummary({ labelDir })

    expect(summary.closePairConfusions).toEqual([
      { actualName: "Medium Nougat", category: "gold-nougat-trans-singleton", count: 1, expectedName: "Pearl Gold" },
      { actualName: "Dark Bluish Gray", category: "neutral-small-part-ambiguity", count: 1, expectedName: "Light Bluish Gray" },
    ])
    expect(summary.families).toEqual([
      { dirtyLabels: 1, family: "neutral", scoredLabels: 1, trainableExamples: 0 },
      { dirtyLabels: 1, family: "tan-gold", scoredLabels: 1, trainableExamples: 0 },
    ])
  })
})

function createReport(rows) {
  return {
    classes: [{
      rows: rows.map((row) => ({
        colorName: row.colorName,
        cropHash: row.cropHash,
        family: row.family,
        imageDataUrl: row.imageDataUrl,
        itemId: row.itemId,
        sampleStatus: row.sampleStatus ?? "stable",
      })),
    }],
    colorSource: "saved-app-result",
    unknownRows: [],
    versions: {
      partColorCalibrationStale: false,
      partExtractorStale: false,
    },
  }
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function hashDataUrl(value) {
  return createHash("sha256").update(value).digest("hex")
}
