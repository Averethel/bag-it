import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createCataloguePocVerdict,
  filterAvailablePartIds,
  writeCataloguePocDataset,
} from "./part-match-catalogue-poc.ts"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe("part match catalogue PoC", () => {
  it("filters missing LDraw parts before rendering", async () => {
    const tempDir = await createTempDir()
    const ldrawRoot = path.join(tempDir, "ldraw")

    await writeFileWithDirs(path.join(ldrawRoot, "parts", "3023.dat"), "0 Plate 1 x 2\n")
    await writeFileWithDirs(path.join(ldrawRoot, "parts", "3710.dat"), "0 Plate 1 x 4\n")

    expect(filterAvailablePartIds(["3023", "missing", "3710", "3023"], ldrawRoot)).toEqual({
      availablePartIds: ["3023", "3710"],
      missingPartIds: ["missing"],
    })
  })

  it("converts Three render output into report rows and labels", async () => {
    const tempDir = await createTempDir()
    const renderDir = path.join(tempDir, "renders")
    const outputDir = path.join(tempDir, "dataset")

    await writeFileWithDirs(path.join(renderDir, "3023-iso-left.png"), createTinyPng())
    await writeFileWithDirs(path.join(renderDir, "3023-top.png"), createTinyPng())
    await writeFileWithDirs(path.join(renderDir, "3710-iso-left.png"), createTinyPng())

    const result = await writeCataloguePocDataset({
      generatedAt: new Date("2026-06-25T16:00:00.000Z"),
      manualId: "ldraw-test",
      outputDir,
      renderDir,
      renderSize: 64,
      renderSummary: {
        outputDir: renderDir,
        parts: [
          {
            partId: "3023",
            views: [
              { path: "3023-iso-left.png", view: "iso-left" },
              { path: "3023-top.png", view: "top" },
            ],
          },
          {
            partId: "3710",
            views: [
              { path: "3710-iso-left.png", view: "iso-left" },
            ],
          },
        ],
      },
    })
    const report = JSON.parse(await readFile(result.reportPath, "utf8"))
    const labels = JSON.parse(await readFile(result.labelPath, "utf8"))

    expect(result.partCount).toBe(2)
    expect(result.rowCount).toBe(3)
    expect(report.rows.map((row) => row.itemId)).toEqual([
      "3023:iso-left:aug-0",
      "3023:top:aug-0",
      "3710:iso-left:aug-0",
    ])
    expect(report.rows[0].imageDataUrl).toMatch(/^data:image\/png;base64,/)
    expect(report.rows[0].color).toEqual(expect.objectContaining({
      manualClassId: "ldraw-neutral",
      manualClassTrusted: true,
    }))
    expect(labels.labels.map((label) => label.expectedPartKey)).toEqual(["3023", "3023", "3710"])
  })

  it("summarizes whether catalogue self-retrieval is promising", () => {
    expect(createCataloguePocVerdict([
      metric({ eligibleRows: 30, top1CorrectRows: 30, top1WrongRows: 0 }),
    ])).toEqual(expect.objectContaining({
      status: "promising",
    }))
    expect(createCataloguePocVerdict([
      metric({ eligibleRows: 30, safeCorrectRows: 3, top1CorrectRows: 25, top1WrongRows: 5 }),
    ])).toEqual(expect.objectContaining({
      status: "inconclusive",
    }))
    expect(createCataloguePocVerdict([
      metric({ eligibleRows: 30, top1CorrectRows: 5, top1WrongRows: 25 }),
    ])).toEqual(expect.objectContaining({
      status: "blocked",
    }))
  })
})

async function createTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "part-match-catalogue-poc-"))
  tempDirs.push(tempDir)

  return tempDir
}

async function writeFileWithDirs(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents)
}

function createTinyPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  )
}

function metric(overrides) {
  return {
    eligibleRows: 0,
    indexPath: "index.html",
    outputDir: "out",
    safeCorrectRows: 0,
    safeRecall: 0,
    safeThreshold: null,
    scoreMode: "mean",
    summaryPath: "summary.json",
    topKHitRows: overrides.topKHitRows ?? overrides.top1CorrectRows ?? 0,
    topKRecall: overrides.eligibleRows === 0 ? 0 : (overrides.topKHitRows ?? overrides.top1CorrectRows ?? 0) / overrides.eligibleRows,
    top1Accuracy: overrides.eligibleRows === 0 ? 0 : overrides.top1CorrectRows / overrides.eligibleRows,
    top1CorrectRows: 0,
    top1WrongRows: 0,
    ...overrides,
  }
}
