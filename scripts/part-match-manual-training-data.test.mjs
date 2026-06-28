import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  encodeRgbaPng,
} from "./part-match-embedding-cache.ts"
import { runPartMatchManualTrainingData } from "./part-match-manual-training-data.ts"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe("part match manual training data", () => {
  it("writes manual crop examples and app-candidate pair manifests", async () => {
    const tempDir = await createTempDir()
    const reportPath = path.join(tempDir, "reports", "manual-a", "report.json")
    const labelDir = path.join(tempDir, "labels")
    const decisionPath = path.join(tempDir, "decisions.json")
    const outputDir = path.join(tempDir, "out")

    await writeJson(reportPath, {
      manualId: "manual-a",
      rows: [
        row("same-a", { calloutId: "callout-1", colorName: "Light Bluish Gray" }),
        row("same-b", { calloutId: "callout-2", colorName: "Light Bluish Gray" }),
        row("different", { calloutId: "callout-3", colorName: "Light Bluish Gray" }),
        row("excluded", { calloutId: "callout-4", colorName: "Light Bluish Gray" }),
        row("same-callout", { calloutId: "callout-1", colorName: "Light Bluish Gray" }),
        row("color-conflict", { calloutId: "callout-5", colorName: "Reddish Brown" }),
        row("missing-image", { calloutId: "callout-6", colorName: "Light Bluish Gray", imageDataUrl: null }),
      ],
    })
    await writeJson(path.join(labelDir, "manual-a.json"), {
      labels: [
        label("same-a", "part-1"),
        label("same-b", "part-1"),
        label("different", "part-2"),
        label("excluded", "", { role: "excluded" }),
        label("same-callout", "part-3"),
        label("color-conflict", "part-4"),
        label("missing-image", "part-5"),
      ],
      manualId: "manual-a",
      reportPath,
      status: "active",
    })
    await writeJson(decisionPath, {
      decisions: [
        {
          left: "excluded",
          manualId: "manual-a",
          right: "same-a",
          status: "same",
        },
        {
          left: "same-b",
          manualId: "manual-a",
          right: "different",
          status: "different",
        },
      ],
    })

    const result = await runPartMatchManualTrainingData({
      decisionPaths: [decisionPath],
      generatedAt: new Date("2026-06-26T00:00:00.000Z"),
      labelDir,
      outputDir,
      reportPaths: [reportPath],
    })
    const examples = JSON.parse(await readFile(result.examplesPath, "utf8"))
    const pairs = JSON.parse(await readFile(result.pairsPath, "utf8"))
    const pairFor = (leftItemId, rightItemId) => pairs.pairs.find((pair) => {
      const left = examples.examples.find((example) => example.exampleId === pair.leftExampleId)
      const right = examples.examples.find((example) => example.exampleId === pair.rightExampleId)
      return new Set([left?.itemId, right?.itemId]).size === 2 &&
        [left?.itemId, right?.itemId].includes(leftItemId) &&
        [left?.itemId, right?.itemId].includes(rightItemId)
    })

    expect(result.summary.examples.count).toBe(6)
    expect(result.summary.examples.rowsWithoutImages).toBe(1)
    expect(result.summary.pairs.positive).toBeGreaterThan(0)
    expect(result.summary.pairs.negative).toBeGreaterThan(0)
    expect(result.summary.pairs.skipped["same-callout"]).toBeGreaterThan(0)
    expect(result.summary.pairs.skipped["trusted-color-conflict"]).toBeGreaterThan(0)
    expect(result.summary.decisions.applied).toBe(2)
    expect(pairFor("same-a", "same-b")).toEqual(expect.objectContaining({
      kind: "manual-label-positive",
      target: 1,
    }))
    expect(pairFor("excluded", "same-a")).toEqual(expect.objectContaining({
      kind: "manual-reviewed-same",
      target: 1,
    }))
    expect(pairFor("same-b", "different")).toEqual(expect.objectContaining({
      kind: "manual-reviewed-different",
      target: 0,
    }))
    expect(existsSync(path.join(outputDir, examples.examples[0].imagePath))).toBe(true)
  })
})

async function createTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "part-match-manual-training-data-"))
  tempDirs.push(tempDir)
  return tempDir
}

function row(itemId, options) {
  return {
    bagId: "bag-1",
    bagLabel: "Bag 1",
    calloutId: options.calloutId,
    color: {
      manualClassTrusted: true,
      name: options.colorName,
      status: "accepted",
    },
    cropHash: `hash-${itemId}`,
    imageDataUrl: options.imageDataUrl === null ? null : pngDataUrl(),
    itemId,
    pageNumber: 1,
    quantity: 1,
    stepIndex: 1,
  }
}

function label(itemId, expectedPartKey, options = {}) {
  return {
    cropHash: `hash-${itemId}`,
    expectedPartKey,
    itemId,
    role: options.role ?? "active",
  }
}

function pngDataUrl() {
  const data = new Uint8ClampedArray(12 * 12 * 4)

  for (let y = 3; y < 9; y += 1) {
    for (let x = 2; x < 10; x += 1) {
      const index = (y * 12 + x) * 4
      data[index] = 160
      data[index + 1] = 170
      data[index + 2] = 180
      data[index + 3] = 255
    }
  }

  return `data:image/png;base64,${encodeRgbaPng({ data, height: 12, width: 12 }).toString("base64")}`
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}
