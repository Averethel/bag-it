import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  buildLegoRerankerPairs,
  selectTrainingPairs,
  trainPartMatchLegoReranker,
} from "./train-part-match-lego-reranker.ts"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe("part match LEGO reranker", () => {
  it("builds supervised positives and negatives from catalogue labels", () => {
    const input = createFakeInput()
    const pairs = buildLegoRerankerPairs(input)

    expect(pairs.filter((pair) => pair.target === 1)).toHaveLength(3)
    expect(pairs.filter((pair) => pair.target === 0)).toHaveLength(12)
    expect(pairs[0].features).toEqual(expect.objectContaining({
      allVariantsMin: expect.any(Number),
      mean: expect.any(Number),
      rendered: expect.any(Number),
    }))
  })

  it("keeps all positives and hardest negatives for training", () => {
    const pairs = buildLegoRerankerPairs(createFakeInput())
    const selected = selectTrainingPairs(pairs, 2)

    expect(selected.filter((pair) => pair.target === 1)).toHaveLength(3)
    expect(selected.filter((pair) => pair.target === 0)).toHaveLength(6)
    expect(selected.filter((pair) => pair.target === 0).map((pair) => pair.features.mean))
      .toEqual([...selected.filter((pair) => pair.target === 0).map((pair) => pair.features.mean)].sort((a, b) => b - a))
  })

  it("can restrict synthetic training pairs to the same catalogue view", () => {
    const input = createFakeViewInput()
    const pairs = buildLegoRerankerPairs(input, { pairViewPolicy: "same-view" })

    expect(pairs.every((pair) => pair.leftView === pair.rightView)).toBe(true)
    expect(pairs.filter((pair) => pair.target === 1)).toHaveLength(2)
    expect(pairs.filter((pair) => pair.target === 0)).toHaveLength(4)
  })

  it("trains and writes a zero-training-false-positive report on separable data", async () => {
    const tempDir = await createTempDir()
    const embeddingDir = path.join(tempDir, "embeddings")
    const labelDir = path.join(tempDir, "labels")
    const outputDir = path.join(tempDir, "out")

    await writeFakeCache(embeddingDir, labelDir)

    const result = await trainPartMatchLegoReranker({
      embeddingDirs: [embeddingDir],
      foldCount: 2,
      iterations: 150,
      labelDir,
      learningRate: 0.1,
      outputDir,
    })
    const summary = JSON.parse(await readFile(result.summaryPath, "utf8"))
    const model = JSON.parse(await readFile(result.modelPath, "utf8"))
    const html = await readFile(result.indexPath, "utf8")

    expect(summary.globalScore.totals.falsePositivePairs).toBe(0)
    expect(summary.globalScore.totals.matchedPositivePairs).toBeGreaterThan(0)
    expect(summary.diagnostics.positiveScoreMax).toBeGreaterThan(0)
    expect(model.featureNames).toContain("mean")
    expect(html).toContain("Part match LEGO reranker")
  })
})

async function createTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "part-match-lego-reranker-"))
  tempDirs.push(tempDir)

  return tempDir
}

function createFakeInput() {
  const rows = [
    row("a:left"),
    row("a:right"),
    row("b:left"),
    row("b:right"),
    row("c:left"),
    row("c:right"),
  ]
  const labelsByItemKey = new Map([
    ["manual:a:left", "a"],
    ["manual:a:right", "a"],
    ["manual:b:left", "b"],
    ["manual:b:right", "b"],
    ["manual:c:left", "c"],
    ["manual:c:right", "c"],
  ])
  const vectors = new Map([
    ["manual:a:left", [1, 0, 0]],
    ["manual:a:right", [0.99, 0.01, 0]],
    ["manual:b:left", [0, 1, 0]],
    ["manual:b:right", [0.01, 0.99, 0]],
    ["manual:c:left", [0, 0, 1]],
    ["manual:c:right", [0.01, 0, 0.99]],
  ])
  const embeddings = new Map(rows.map((entry) => [entry.rowKey, allVariantEmbeddings(vectors.get(entry.rowKey))]))

  return {
    embeddings,
    labelsByItemKey,
    modelIds: ["fake"],
    rows,
  }
}

function createFakeViewInput() {
  const rows = [
    row("a:front:1"),
    row("a:front:2"),
    row("a:iso:1"),
    row("b:front:1"),
    row("b:front:2"),
  ]
  const labelsByItemKey = new Map(rows.map((entry) => [
    `manual:${entry.itemId}`,
    entry.itemId.startsWith("a:") ? "a" : "b",
  ]))
  const vectors = new Map([
    ["manual:a:front:1", [1, 0, 0]],
    ["manual:a:front:2", [0.99, 0.01, 0]],
    ["manual:a:iso:1", [0.5, 0.5, 0]],
    ["manual:b:front:1", [0, 1, 0]],
    ["manual:b:front:2", [0.01, 0.99, 0]],
  ])
  const embeddings = new Map(rows.map((entry) => [entry.rowKey, allVariantEmbeddings(vectors.get(entry.rowKey))]))

  return {
    embeddings,
    labelsByItemKey,
    modelIds: ["fake"],
    rows,
  }
}

function row(itemId) {
  return {
    bagId: "catalogue",
    bagLabel: "Catalogue",
    calloutId: itemId.split(":")[1],
    color: null,
    cropHash: `crop-${itemId}`,
    itemId,
    manualId: "manual",
    pageNumber: 1,
    partRegion: null,
    quantity: 1,
    rowId: itemId,
    rowKey: `manual:${itemId}`,
    stepIndex: 1,
    variants: {
      "tight-rendered": {
        cacheKey: `tight-${itemId}`,
        height: 10,
        path: `${itemId}.png`,
        variant: "tight-rendered",
        width: 10,
      },
    },
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

async function writeFakeCache(embeddingDir, labelDir) {
  const input = createFakeInput()

  await mkdir(embeddingDir, { recursive: true })
  await mkdir(labelDir, { recursive: true })
  await writeJson(path.join(embeddingDir, "rows.json"), {
    model: { id: "fake", task: "image-feature-extraction" },
    rows: input.rows,
  })
  await writeJson(path.join(embeddingDir, "embeddings.json"), {
    embeddings: Object.fromEntries(input.embeddings.entries()),
    model: { id: "fake", task: "image-feature-extraction" },
  })
  await writeJson(path.join(labelDir, "manual.json"), {
    labels: [...input.labelsByItemKey.entries()].map(([itemKey, expectedPartKey]) => ({
      expectedPartKey,
      itemId: itemKey.slice("manual:".length),
    })),
    manualId: "manual",
    reportPath: "report.json",
    status: "active",
  })
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}
