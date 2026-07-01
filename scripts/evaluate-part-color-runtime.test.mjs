import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { evaluatePartColorRuntime } from "./evaluate-part-color-runtime.mjs"

describe("part color runtime evaluation", () => {
  it("can evaluate an explicit prototype set", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bag-it-runtime-eval-"))
    const labelDir = path.join(root, "labels")
    const sessionPath = path.join(root, "manual.bagit-session.json")
    const reportPath = path.join(root, "report.json")
    const rgb = { b: 12, g: 8, r: 6 }

    writeJson(sessionPath, {
      stepDetectionResult: {
        callouts: [{
          partItems: [{
            detectedColor: detectedColor(rgb),
            id: "row-1",
          }],
        }],
      },
    })
    writeJson(reportPath, {
      classes: [{
        rows: [{
          colorName: "Black",
          cropHash: "current-crop",
          itemId: "row-1",
        }],
      }],
      colorSource: "saved-app-result",
      sourceSessionPath: sessionPath,
      unknownRows: [],
      versions: {
        partColorCalibrationStale: false,
        partExtractorStale: false,
      },
    })
    writeJson(path.join(labelDir, "manual.json"), {
      labels: [{
        cropHash: "current-crop",
        expectedName: "Reddish Brown",
        itemId: "row-1",
        role: "active",
      }],
      manualId: "manual",
      reportPath,
      status: "active",
    })

    const result = evaluatePartColorRuntime({
      labelDir,
      prototypeSet: {
        prototypes: [{
          expectedName: "Reddish Brown",
          family: "neutral",
          id: "prototype-reddish-brown-test",
          lab: { a: 0, b: 0, l: 0 },
          rgb,
          support: 4,
        }],
      },
    })

    expect(result.evaluations).toEqual([
      expect.objectContaining({
        matchedAfter: 1,
        matchedBefore: 0,
        total: 1,
      }),
    ])
  })
})

function detectedColor(rgb) {
  return {
    confidence: 0.9,
    observedHex: hex(rgb),
    observedRgb: rgb,
    sampleChips: [{
      coverage: 0.8,
      hex: hex(rgb),
      pixelCount: 400,
      rgb,
    }],
    sampleRejectionCounts: {
      background: 0,
      border: 0,
      edge: 0,
      excludedRegion: 0,
      lowAlpha: 0,
      outOfPage: 0,
    },
    sampleStatus: "stable",
  }
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function hex(rgb) {
  return `#${[rgb.r, rgb.g, rgb.b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`
}
