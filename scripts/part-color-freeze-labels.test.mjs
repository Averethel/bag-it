import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { buildFrozenPartColorLabelFile } from "./part-color-freeze-labels.mjs"

describe("part color label freezer", () => {
  it("preserves existing corrected labels and freezes unlabeled rows to current report colors", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-freeze-labels-"))
    const existingLabelPath = path.join(root, "labels", "manual.json")
    const report = createReport({
      classes: [
        {
          rows: [
            row("row-good", "Black", "data:image/png;base64,black"),
            row("row-fixed", "Reddish Brown", "data:image/png;base64,red"),
          ],
        },
      ],
    })
    writeJson(existingLabelPath, createExistingLabels([
      {
        cropHash: hashDataUrl("data:image/png;base64,old-red"),
        expectedName: "Red",
        itemId: "row-fixed",
        note: "annotated red",
        role: "train",
      },
    ]))

    const frozen = buildFrozenPartColorLabelFile({
      existingLabelPath,
      manualId: "manual",
      report,
      reportPath: "/repo/.bag-it/private/part-color-reports/manual/report.json",
      status: "active",
    })

    expect(frozen).toEqual({
      manualId: "manual",
      status: "active",
      reportPath: expect.stringMatching(/report\.json$/),
      labels: [
        {
          cropHash: hashDataUrl("data:image/png;base64,red"),
          expectedName: "Red",
          itemId: "row-fixed",
          note: "annotated red",
          role: "train",
        },
        {
          cropHash: hashDataUrl("data:image/png;base64,black"),
          expectedName: "Black",
          itemId: "row-good",
        },
      ],
    })
  })

  it("includes unknown rows and uses Unknown as the expected name", () => {
    const frozen = buildFrozenPartColorLabelFile({
      existingLabelPath: null,
      manualId: "manual",
      report: createReport({
        classes: [],
        unknownRows: [row("row-unknown", null, "data:image/png;base64,unknown")],
      }),
      reportPath: "report.json",
      status: "active",
    })

    expect(frozen.labels).toEqual([
      {
        cropHash: hashDataUrl("data:image/png;base64,unknown"),
        expectedName: "Unknown",
        itemId: "row-unknown",
      },
    ])
  })

  it("omits cropHash when the report row has no crop image or stored hash", () => {
    const frozen = buildFrozenPartColorLabelFile({
      existingLabelPath: null,
      manualId: "manual",
      report: createReport({
        classes: [
          {
            rows: [row("row-no-crop", "Black", null)],
          },
        ],
      }),
      reportPath: "report.json",
      status: "active",
    })

    expect(frozen.labels).toEqual([
      {
        expectedName: "Black",
        itemId: "row-no-crop",
      },
    ])
  })

  it("fails when an existing correction no longer has a report row", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-freeze-labels-"))
    const existingLabelPath = path.join(root, "labels", "manual.json")

    writeJson(existingLabelPath, createExistingLabels([
      { expectedName: "Red", itemId: "missing-row" },
    ]))

    expect(() =>
      buildFrozenPartColorLabelFile({
        existingLabelPath,
        manualId: "manual",
        report: createReport({ classes: [], unknownRows: [] }),
        reportPath: "report.json",
        status: "active",
      }),
    ).toThrow("Existing label missing-row is missing")
  })
})

function createReport({ classes, unknownRows = [] }) {
  return { classes, unknownRows }
}

function row(itemId, colorName, imageDataUrl) {
  return { colorName, imageDataUrl, itemId }
}

function createExistingLabels(labels) {
  return {
    labels,
    manualId: "manual",
    reportPath: "report.json",
    status: "active",
  }
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function hashDataUrl(value) {
  return createHash("sha256").update(value).digest("hex")
}
