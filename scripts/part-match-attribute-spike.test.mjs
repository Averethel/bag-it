import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  inferPartAttributes,
  runPartMatchAttributeSpike,
} from "./part-match-attribute-spike.ts"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe("part match attribute spike", () => {
  it("infers LEGO-ish attributes from LDraw titles", () => {
    expect(inferPartAttributes({
      partId: "3023",
      title: "Plate  1 x  2",
    })).toEqual(expect.objectContaining({
      category: "plate",
      footprint: "1x2",
      heightBand: "plate",
      modifier: "plain",
      signature: "plate|1x2|plate|plain",
    }))

    expect(inferPartAttributes({
      partId: "60478",
      title: "Plate  1 x  2 with Handle on End",
    })).toEqual(expect.objectContaining({
      category: "plate",
      footprint: "1x2",
      modifier: "handle",
    }))

    expect(inferPartAttributes({
      partId: "3040b",
      title: "Slope Brick 45  2 x  1",
    })).toEqual(expect.objectContaining({
      category: "slope",
      footprint: "1x2",
      modifier: "slope-45",
    }))
  })

  it("writes an attribute evaluation report", async () => {
    const tempDir = await createTempDir()
    const embeddingDir = path.join(tempDir, "embeddings")
    const ldrawRoot = path.join(tempDir, "ldraw")
    const outputDir = path.join(tempDir, "out")

    await writeFakeParts(ldrawRoot)
    await writeFakeEmbeddings(embeddingDir)

    const result = await runPartMatchAttributeSpike({
      embeddingDir,
      foldCount: 2,
      generatedAt: new Date("2026-06-25T00:00:00.000Z"),
      ldrawRoot,
      outputDir,
    })
    const summary = JSON.parse(await readFile(result.summaryPath, "utf8"))
    const predictions = JSON.parse(await readFile(result.predictionsPath, "utf8"))
    const html = await readFile(result.indexPath, "utf8")

    expect(summary.sampleCount).toBe(8)
    expect(summary.metrics.find((metric) => metric.name === "category").correct).toBeGreaterThan(0)
    expect(predictions.predictions).toHaveLength(8)
    expect(html).toContain("Part match attribute spike")
  })
})

async function createTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "part-match-attribute-spike-"))
  tempDirs.push(tempDir)

  return tempDir
}

async function writeFakeParts(ldrawRoot) {
  const partsDir = path.join(ldrawRoot, "parts")
  await mkdir(partsDir, { recursive: true })
  await writeFile(path.join(partsDir, "3004.dat"), "0 Brick  1 x  2\n")
  await writeFile(path.join(partsDir, "3005.dat"), "0 Brick  1 x  1\n")
  await writeFile(path.join(partsDir, "3023.dat"), "0 Plate  1 x  2\n")
  await writeFile(path.join(partsDir, "3024.dat"), "0 Plate  1 x  1\n")
}

async function writeFakeEmbeddings(embeddingDir) {
  const rows = [
    row("3004", "iso-left"),
    row("3004", "top"),
    row("3005", "iso-left"),
    row("3005", "top"),
    row("3023", "iso-left"),
    row("3023", "top"),
    row("3024", "iso-left"),
    row("3024", "top"),
  ]
  const vectors = new Map([
    ["3004", [1, 0.1, 0]],
    ["3005", [1, 0, 0.1]],
    ["3023", [0, 1, 0.1]],
    ["3024", [0.1, 1, 0]],
  ])
  const embeddings = Object.fromEntries(rows.map((entry) => [
    entry.rowKey,
    allVariantEmbeddings(vectors.get(entry.itemId.split(":")[0])),
  ]))

  await mkdir(embeddingDir, { recursive: true })
  await writeJson(path.join(embeddingDir, "rows.json"), { rows })
  await writeJson(path.join(embeddingDir, "embeddings.json"), {
    embeddings,
    model: { id: "fake" },
  })
}

function row(partId, view) {
  const itemId = `${partId}:${view}:aug-0`

  return {
    bagId: "catalogue",
    bagLabel: "Catalogue",
    calloutId: view,
    color: null,
    cropHash: itemId,
    itemId,
    manualId: "fake-catalogue",
    pageNumber: 1,
    partRegion: null,
    quantity: 1,
    rowId: itemId,
    rowKey: `fake-catalogue:${itemId}`,
    stepIndex: 1,
    variants: {},
  }
}

function allVariantEmbeddings(vector) {
  return Object.fromEntries(["rendered", "tight-rendered", "neutral-mask", "silhouette"].map((variant) => [
    variant,
    {
      cacheKey: `${variant}-${vector.join("-")}`,
      dimensions: vector.length,
      reused: false,
      vector: normalize(vector),
    },
  ]))
}

function normalize(vector) {
  const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0))

  return vector.map((value) => value / magnitude)
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}
