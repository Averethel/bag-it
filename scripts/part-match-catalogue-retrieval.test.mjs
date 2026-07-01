import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { runPartMatchCatalogueRetrieval } from "./part-match-catalogue-retrieval.ts"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe("part match catalogue retrieval", () => {
  it("uses labeled exemplars as catalogue candidates and reports top-1 accuracy", async () => {
    const tempDir = await createTempDir()
    const embeddingDir = path.join(tempDir, "embeddings")
    const labelDir = path.join(tempDir, "labels")
    const outputDir = path.join(tempDir, "retrieval")

    await writeEmbeddingCache(embeddingDir, [
      row("manual-a", "same-1", { vector: [1, 0] }),
      row("manual-a", "same-2", { vector: [0.99, 0.01] }),
      row("manual-a", "different-1", { vector: [0, 1] }),
      row("manual-a", "different-2", { vector: [0.01, 0.99] }),
      row("manual-a", "singleton", { vector: [0.5, 0.5] }),
    ])
    await writeLabelSet(labelDir, "manual-a", [
      label("same-1", "part-a"),
      label("same-2", "part-a"),
      label("different-1", "part-b"),
      label("different-2", "part-b"),
      label("singleton", "part-c"),
    ])

    const result = await runPartMatchCatalogueRetrieval({
      embeddingDirs: [embeddingDir],
      generatedAt: new Date("2026-06-25T12:00:00.000Z"),
      labelDir,
      outputDir,
    })
    const predictions = JSON.parse(await readFile(result.predictionsPath, "utf8"))
    const html = await readFile(result.indexPath, "utf8")

    expect(result.summary.totals.eligibleRows).toBe(4)
    expect(result.summary.totals.top1CorrectRows).toBe(4)
    expect(result.summary.totals.top1WrongRows).toBe(0)
    expect(result.summary.skippedRows.byReason["singleton-expected-key"]).toBe(1)
    expect(predictions.predictions).toHaveLength(4)
    expect(html).toContain("label-exemplars")
  })

  it("sets safe threshold above wrong top-1 matches", async () => {
    const tempDir = await createTempDir()
    const embeddingDir = path.join(tempDir, "embeddings")
    const labelDir = path.join(tempDir, "labels")
    const outputDir = path.join(tempDir, "retrieval")

    await writeEmbeddingCache(embeddingDir, [
      row("manual-a", "same-1", { vector: [1, 0] }),
      row("manual-a", "same-2", { vector: [0.7, 0.3] }),
      row("manual-a", "different-1", { vector: [0.99, 0.01] }),
      row("manual-a", "different-2", { vector: [0.98, 0.02] }),
    ])
    await writeLabelSet(labelDir, "manual-a", [
      label("same-1", "part-a"),
      label("same-2", "part-a"),
      label("different-1", "part-b"),
      label("different-2", "part-b"),
    ])

    const result = await runPartMatchCatalogueRetrieval({
      embeddingDirs: [embeddingDir],
      labelDir,
      outputDir,
    })

    expect(result.summary.totals.top1WrongRows).toBeGreaterThan(0)
    expect(result.summary.safeThreshold).toBeGreaterThan(0.98)
    expect(result.summary.totals.safeCorrectRows).toBeLessThan(result.summary.totals.top1CorrectRows)
  })
})

async function createTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "part-match-catalogue-retrieval-"))
  tempDirs.push(tempDir)

  return tempDir
}

function row(manualId, itemId, {
  bagId = "bag-1",
  calloutId = itemId,
  color: rowColor = color("Light Bluish Gray"),
  vector,
}) {
  const rowKey = `${manualId}:${itemId}`

  return {
    embedding: {
      rendered: embeddingRecord(vector),
      "tight-rendered": embeddingRecord(vector),
    },
    row: {
      bagId,
      bagLabel: bagId,
      calloutId,
      color: rowColor,
      cropHash: `crop-${itemId}`,
      itemId,
      manualId,
      pageNumber: 1,
      partRegion: { height: 1, width: 1, x: 0, y: 0 },
      quantity: 1,
      rowId: itemId,
      rowKey,
      stepIndex: 1,
      variants: {
        rendered: {
          cacheKey: `cache-${itemId}`,
          height: 1,
          path: path.join(".bag-it", "private", `${itemId}.png`),
          variant: "rendered",
          width: 1,
        },
      },
    },
  }
}

function embeddingRecord(vector) {
  return {
    cacheKey: `cache-${vector.join("-")}`,
    dimensions: vector.length,
    reused: false,
    vector,
  }
}

function label(itemId, expectedPartKey, extra = {}) {
  return {
    cropHash: `crop-${itemId}`,
    expectedPartKey,
    itemId,
    ...extra,
  }
}

function color(name) {
  return {
    confidence: 1,
    family: "neutral",
    key: name.toLowerCase().replaceAll(" ", "-"),
    manualClassId: name.toLowerCase().replaceAll(" ", "-"),
    manualClassTrusted: true,
    name,
    status: "resolved",
    swatchHex: "#aaaaaa",
  }
}

async function writeEmbeddingCache(embeddingDir, rowSpecs) {
  await mkdir(embeddingDir, { recursive: true })
  await writeJson(path.join(embeddingDir, "rows.json"), {
    model: {
      id: "fake-model",
      task: "image-feature-extraction",
    },
    rows: rowSpecs.map((spec) => spec.row),
    skippedRows: [],
    version: "test",
  })
  await writeJson(path.join(embeddingDir, "embeddings.json"), {
    embeddings: Object.fromEntries(rowSpecs.map((spec) => [spec.row.rowKey, spec.embedding])),
    model: {
      id: "fake-model",
      task: "image-feature-extraction",
    },
    version: "test",
  })
}

async function writeLabelSet(labelDir, manualId, labels) {
  await writeJson(path.join(labelDir, `${manualId}.json`), {
    labels,
    manualId,
    reportPath: `${manualId}/report.json`,
    status: "active",
  })
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}
