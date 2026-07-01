import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createEmbeddingCacheKey,
  createPartMatchEmbeddingCache,
  encodeRgbaPngDataUrl,
} from "./part-match-embedding-cache.ts"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe("part match embedding cache", () => {
  it("writes crop variants, embeddings, summary, and skipped row counts", async () => {
    const tempDir = await createTempDir()
    const reportPath = path.join(tempDir, "report.json")
    const outputDir = path.join(tempDir, "embeddings")

    await writeJson(reportPath, createReport())

    const result = await createPartMatchEmbeddingCache({
      embedder: createFakeEmbedder(),
      generatedAt: new Date("2026-06-25T08:00:00.000Z"),
      outputDir,
      reportPaths: [reportPath],
    })
    const rows = JSON.parse(await readFile(result.rowsPath, "utf8"))
    const embeddings = JSON.parse(await readFile(result.embeddingsPath, "utf8"))
    const summary = JSON.parse(await readFile(result.summaryPath, "utf8"))
    const html = await readFile(result.indexPath, "utf8")
    const row = rows.rows[0]

    expect(row.rowKey).toBe("manual-a:row-1")
    expect(Object.keys(row.variants).sort()).toEqual([
      "neutral-mask",
      "rendered",
      "silhouette",
      "tight-rendered",
    ])
    expect(row.variants.rendered.width).toBe(3)
    expect(row.variants.rendered.height).toBe(2)
    expect(row.variants["tight-rendered"].width).toBe(1)
    expect(row.variants["tight-rendered"].height).toBe(1)
    expect(rows.skippedRows).toEqual([expect.objectContaining({
      reason: "missing-image-data-url",
      rowId: "row-missing",
    })])
    expect(embeddings.embeddings["manual-a:row-1"].rendered.vector).toEqual([1, 0])
    expect(summary.totals).toEqual(expect.objectContaining({
      embeddedRows: 1,
      embeddings: 4,
      reusedEmbeddings: 0,
      rowCount: 1,
      skippedRows: 1,
      variantCount: 4,
      vectorDimensions: 2,
    }))
    expect(html).toContain("Part match embedding cache")
    expect(html).toContain("manual-a:row-1")
  })

  it("reuses existing vectors when cache keys match", async () => {
    const tempDir = await createTempDir()
    const reportPath = path.join(tempDir, "report.json")
    const outputDir = path.join(tempDir, "embeddings")
    const embedder = createFakeEmbedder()

    await writeJson(reportPath, createReport({ includeMissingRow: false }))
    await createPartMatchEmbeddingCache({
      embedder,
      outputDir,
      reportPaths: [reportPath],
    })

    const callsAfterFirstRun = embedder.calls.length

    await createPartMatchEmbeddingCache({
      embedder,
      outputDir,
      reportPaths: [reportPath],
    })

    const embeddings = JSON.parse(await readFile(path.join(outputDir, "embeddings.json"), "utf8"))

    expect(callsAfterFirstRun).toBe(4)
    expect(embedder.calls).toHaveLength(4)
    expect(embeddings.embeddings["manual-a:row-1"].rendered.reused).toBe(true)
  })

  it("changes cache key when crop hash, variant, row, or model changes", () => {
    const base = {
      cropHash: "crop-a",
      manualId: "manual-a",
      modelId: "model-a",
      rowId: "row-a",
      variant: "rendered",
    }

    expect(createEmbeddingCacheKey(base)).not.toBe(createEmbeddingCacheKey({
      ...base,
      cropHash: "crop-b",
    }))
    expect(createEmbeddingCacheKey(base)).not.toBe(createEmbeddingCacheKey({
      ...base,
      modelId: "model-b",
    }))
    expect(createEmbeddingCacheKey(base)).not.toBe(createEmbeddingCacheKey({
      ...base,
      rowId: "row-b",
    }))
    expect(createEmbeddingCacheKey(base)).not.toBe(createEmbeddingCacheKey({
      ...base,
      variant: "silhouette",
    }))
  })
})

function createFakeEmbedder() {
  const embedder = {
    calls: [],
    async embed(imagePath) {
      embedder.calls.push(imagePath)

      if (imagePath.includes("tight-rendered")) {
        return [0, 2]
      }

      if (imagePath.includes("neutral-mask")) {
        return [3, 4]
      }

      if (imagePath.includes("silhouette")) {
        return [1, 1]
      }

      return [2, 0]
    },
    model: {
      cacheDir: ".bag-it/private/test-cache",
      id: "fake-embedder",
      task: "image-feature-extraction",
    },
  }

  return embedder
}

function createReport({ includeMissingRow = true } = {}) {
  return {
    manualId: "manual-a",
    rows: [
      {
        bagId: "bag-1",
        bagLabel: "Bag 1",
        calloutId: "callout-1",
        color: { name: "Light Bluish Gray" },
        cropHash: "crop-row-1",
        imageDataUrl: createDataUrl(),
        itemId: "row-1",
        pageNumber: 1,
        partRegion: { height: 2, width: 3, x: 0, y: 0 },
        quantity: 1,
        rowId: "row-1",
        stepIndex: 2,
      },
      ...(includeMissingRow
        ? [{
            bagId: "bag-1",
            calloutId: "callout-2",
            itemId: "row-missing",
            rowId: "row-missing",
          }]
        : []),
    ],
  }
}

function createDataUrl() {
  return encodeRgbaPngDataUrl({
    data: Uint8ClampedArray.from([
      0, 0, 0, 0,
      20, 40, 60, 255,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]),
    height: 2,
    width: 3,
  })
}

async function createTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "bag-it-embedding-cache-"))

  tempDirs.push(tempDir)

  return tempDir
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}
