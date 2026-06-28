import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { JSDOM } from "jsdom"
import { afterEach, describe, expect, it } from "vitest"
import { scorePartMatchEmbeddings } from "./part-match-embedding-score.ts"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe("part match embedding score", () => {
  it("scores label positives, negatives, excluded hard negatives, and decisions", async () => {
    const tempDir = await createTempDir()
    const embeddingDir = path.join(tempDir, "embeddings")
    const labelDir = path.join(tempDir, "labels")
    const decisionPath = path.join(tempDir, "decisions.json")
    const outputDir = path.join(tempDir, "score")

    await writeEmbeddingCache(embeddingDir, [
      row("manual-a", "same-1", { bagId: "bag-1", calloutId: "callout-1", vector: [1, 0] }),
      row("manual-a", "same-2", { bagId: "bag-1", calloutId: "callout-2", vector: [0.9, 0.1] }),
      row("manual-a", "different-1", { bagId: "bag-1", calloutId: "callout-3", vector: [0, 1] }),
      row("manual-a", "excluded-1", { bagId: "bag-1", calloutId: "callout-4", vector: [0.2, 0.8] }),
      row("manual-a", "same-callout", { bagId: "bag-1", calloutId: "callout-1", vector: [1, 0] }),
    ])
    await writeJson(path.join(labelDir, "manual-a.json"), {
      labels: [
        label("same-1", "part-a"),
        label("same-2", "part-a"),
        label("different-1", "part-b"),
        label("excluded-1", "", { role: "excluded" }),
        label("same-callout", "part-c"),
      ],
      manualId: "manual-a",
      reportPath: "report.json",
      status: "active",
    })
    await writeJson(decisionPath, {
      decisions: [
        {
          left: "same-2",
          manualId: "manual-a",
          right: "different-1",
          status: "different",
        },
        {
          left: "same-1",
          manualId: "manual-a",
          right: "same-2",
          status: "same",
        },
      ],
    })

    const result = await scorePartMatchEmbeddings({
      decisionPaths: [decisionPath],
      embeddingDirs: [embeddingDir],
      generatedAt: new Date("2026-06-25T10:00:00.000Z"),
      labelDir,
      outputDir,
    })
    const pairs = JSON.parse(await readFile(result.pairsPath, "utf8"))
    const sweep = JSON.parse(await readFile(result.sweepPath, "utf8"))

    expect(result.summary.totals.positivePairs).toBe(1)
    expect(result.summary.totals.negativePairs).toBeGreaterThan(0)
    expect(result.summary.totals.falsePositivePairs).toBe(0)
    expect(result.summary.totals.hardNegativeFalsePositivePairs).toBe(0)
    expect(result.summary.skippedPairs.byReason["non-app-candidate"]).toBeGreaterThan(0)
    expect(pairs.pairs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "positive",
        leftItemId: "same-1",
        rightItemId: "same-2",
        target: 1,
      }),
      expect.objectContaining({
        kind: "hard-negative",
        leftItemId: "different-1",
        rightItemId: "same-2",
        target: 0,
      }),
      expect.objectContaining({
        kind: "hard-negative",
        leftItemId: "different-1",
        rightItemId: "excluded-1",
        target: 0,
      }),
    ]))
    expect(sweep.modes.map((mode) => mode.mode)).toContain("rendered-tight-min")
  })

  it("blocks known color conflicts before embedding scoring", async () => {
    const tempDir = await createTempDir()
    const embeddingDir = path.join(tempDir, "embeddings")
    const labelDir = path.join(tempDir, "labels")
    const outputDir = path.join(tempDir, "score")

    await writeEmbeddingCache(embeddingDir, [
      row("manual-a", "same-1", {
        bagId: "bag-1",
        calloutId: "callout-1",
        color: color("Green"),
        vector: [1, 0],
      }),
      row("manual-a", "same-2", {
        bagId: "bag-1",
        calloutId: "callout-2",
        color: color("Green"),
        vector: [0.95, 0.05],
      }),
      row("manual-a", "different-color", {
        bagId: "bag-1",
        calloutId: "callout-3",
        color: color("Bright Green"),
        vector: [0.96, 0.04],
      }),
      row("manual-a", "different-shape", {
        bagId: "bag-1",
        calloutId: "callout-4",
        color: color("Green"),
        vector: [0, 1],
      }),
    ])
    await writeLabelSet(labelDir, "manual-a", [
      label("same-1", "part-a"),
      label("same-2", "part-a"),
      label("different-color", "part-b"),
      label("different-shape", "part-c"),
    ])

    const result = await scorePartMatchEmbeddings({
      embeddingDirs: [embeddingDir],
      labelDir,
      outputDir,
    })
    const pairs = JSON.parse(await readFile(result.pairsPath, "utf8"))
    const itemIds = pairs.pairs.flatMap((pair) => [pair.leftItemId, pair.rightItemId])

    expect(result.summary.skippedPairs.byReason["color-conflict"]).toBeGreaterThan(0)
    expect(itemIds).not.toContain("different-color")
    expect(result.summary.totals.falsePositivePairs).toBe(0)
  })

  it("moves threshold when strongest negative changes", async () => {
    const lowNegative = await scoreSingleNegative([0, 1])
    const highNegative = await scoreSingleNegative([0.8, 0.2])

    expect(highNegative.summary.threshold).toBeGreaterThan(lowNegative.summary.threshold)
  })

  it("reports holdout false positives separately", async () => {
    const tempDir = await createTempDir()
    const embeddingDir = path.join(tempDir, "embeddings")
    const labelDir = path.join(tempDir, "labels")
    const outputDir = path.join(tempDir, "score")

    await writeEmbeddingCache(embeddingDir, [
      row("manual-train", "train-same-1", { bagId: "bag-1", calloutId: "callout-1", vector: [1, 0] }),
      row("manual-train", "train-same-2", { bagId: "bag-1", calloutId: "callout-2", vector: [0.95, 0.05] }),
      row("manual-train", "train-different", { bagId: "bag-1", calloutId: "callout-3", vector: [0, 1] }),
      row("manual-holdout", "holdout-same-1", { bagId: "bag-1", calloutId: "callout-1", vector: [1, 0] }),
      row("manual-holdout", "holdout-same-2", { bagId: "bag-1", calloutId: "callout-2", vector: [0.95, 0.05] }),
      row("manual-holdout", "holdout-different", { bagId: "bag-1", calloutId: "callout-3", vector: [0.99, 0.01] }),
    ])
    await writeLabelSet(labelDir, "manual-train", [
      label("train-same-1", "part-a"),
      label("train-same-2", "part-a"),
      label("train-different", "part-b"),
    ])
    await writeLabelSet(labelDir, "manual-holdout", [
      label("holdout-same-1", "part-a"),
      label("holdout-same-2", "part-a"),
      label("holdout-different", "part-b"),
    ])

    const result = await scorePartMatchEmbeddings({
      embeddingDirs: [embeddingDir],
      labelDir,
      outputDir,
    })
    const holdoutManual = result.summary.holdout.manuals.find((manual) => manual.manualId === "manual-holdout")
    const html = await readFile(result.indexPath, "utf8")

    expect(result.summary.totals.falsePositivePairs).toBe(0)
    expect(holdoutManual?.available).toBe(true)
    expect(holdoutManual?.totals.falsePositivePairs).toBeGreaterThan(0)
    expect(result.summary.holdout.totals.falsePositivePairs).toBeGreaterThan(0)
    expect(html).toContain("Unreviewed holdout false positives")
    expect(html).toContain("Reviewed holdout blockers")
    expect(html).toContain("Score mode sweep")
    expect(html).toContain("Download decisions")
    expect(html).toContain("data-review-filter=\"pending\"")
    expect(html).toContain("data-section-filter=\"dangerous-negatives\"")
    expect(html).toContain("data-review-status=\"same\"")
    expect(html).toContain("holdout-different")

    const reviewJsonPattern = new RegExp('<script id="pair-review-data" type="application/json">([^<]+)</script>')
    const reviewJson = html.match(reviewJsonPattern)?.[1]
    expect(reviewJson).toBeTruthy()
    expect(JSON.parse(reviewJson)).toEqual(expect.objectContaining({
      pairs: expect.arrayContaining([
        expect.objectContaining({
          left: "holdout-different",
          manualId: "manual-holdout",
        }),
      ]),
    }))

    const dom = new JSDOM(html, {
      runScripts: "dangerously",
      url: "file:///tmp/part-match-embedding-score/index.html",
    })
    const sameButton = dom.window.document.querySelector('button[data-review-status="same"]')
    sameButton.click()

    const reviewedCard = dom.window.document.querySelector("[data-pair-id]")
    expect(reviewedCard.getAttribute("data-review-status")).toBe("same")
    expect(reviewedCard.classList.contains("is-hidden")).toBe(true)
    expect(sameButton.getAttribute("aria-pressed")).toBe("true")
    expect(dom.window.document.getElementById("review-counts").textContent).toContain("same")
    expect(dom.window.document.getElementById("review-counts").textContent).not.toContain("0 same")

    const reviewedFilterButton = dom.window.document.querySelector('button[data-review-filter="reviewed"]')
    reviewedFilterButton.click()

    expect(reviewedCard.classList.contains("is-hidden")).toBe(false)
    expect(reviewedFilterButton.getAttribute("aria-pressed")).toBe("true")
  })

  it("skips pairs with missing vectors", async () => {
    const tempDir = await createTempDir()
    const embeddingDir = path.join(tempDir, "embeddings")
    const labelDir = path.join(tempDir, "labels")
    const outputDir = path.join(tempDir, "score")

    await writeEmbeddingCache(embeddingDir, [
      row("manual-a", "same-1", { bagId: "bag-1", calloutId: "callout-1", vector: [1, 0] }),
      row("manual-a", "same-2", { bagId: "bag-1", calloutId: "callout-2", vector: null }),
      row("manual-a", "same-3", { bagId: "bag-1", calloutId: "callout-3", vector: [0.9, 0.1] }),
      row("manual-a", "different-1", { bagId: "bag-1", calloutId: "callout-3", vector: [0, 1] }),
      row("manual-a", "different-2", { bagId: "bag-1", calloutId: "callout-4", vector: [0.1, 0.9] }),
    ])
    await writeLabelSet(labelDir, "manual-a", [
      label("same-1", "part-a"),
      label("same-2", "part-a"),
      label("same-3", "part-a"),
      label("different-1", "part-b"),
      label("different-2", "part-c"),
    ])

    const result = await scorePartMatchEmbeddings({
      embeddingDirs: [embeddingDir],
      labelDir,
      outputDir,
    })

    expect(result.summary.skippedPairs.byReason["missing-vector"]).toBeGreaterThan(0)
    expect(result.summary.totals.scoredPairs).toBeGreaterThan(0)
  })

  it("lets reviewed same decisions override generated excluded-row hard negatives", async () => {
    const tempDir = await createTempDir()
    const embeddingDir = path.join(tempDir, "embeddings")
    const labelDir = path.join(tempDir, "labels")
    const decisionPath = path.join(tempDir, "decisions.json")
    const outputDir = path.join(tempDir, "score")

    await writeEmbeddingCache(embeddingDir, [
      row("manual-a", "same-1", { bagId: "bag-1", calloutId: "callout-1", vector: [1, 0] }),
      row("manual-a", "same-2", { bagId: "bag-1", calloutId: "callout-2", vector: [0.95, 0.05] }),
      row("manual-a", "different-1", { bagId: "bag-1", calloutId: "callout-3", vector: [0, 1] }),
      row("manual-a", "excluded-1", { bagId: "bag-1", calloutId: "callout-4", vector: [0.94, 0.06] }),
    ])
    await writeLabelSet(labelDir, "manual-a", [
      label("same-1", "part-a"),
      label("same-2", "part-a"),
      label("different-1", "part-b"),
      label("excluded-1", "", { role: "excluded" }),
    ])
    await writeJson(decisionPath, {
      decisions: [
        {
          left: "same-1",
          manualId: "manual-a",
          right: "excluded-1",
          status: "same",
        },
      ],
    })

    const result = await scorePartMatchEmbeddings({
      decisionPaths: [decisionPath],
      embeddingDirs: [embeddingDir],
      labelDir,
      outputDir,
    })
    const pairs = JSON.parse(await readFile(result.pairsPath, "utf8"))

    expect(result.summary.skippedPairs.byReason["review-decision-overrode-target"]).toBe(1)
    expect(pairs.pairs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "positive",
        leftItemId: "excluded-1",
        rightItemId: "same-1",
        source: expect.stringContaining("decision:"),
        target: 1,
      }),
    ]))
  })

  it("skips same-priority conflicting reviewed decisions", async () => {
    const tempDir = await createTempDir()
    const embeddingDir = path.join(tempDir, "embeddings")
    const labelDir = path.join(tempDir, "labels")
    const decisionPath = path.join(tempDir, "decisions.json")
    const outputDir = path.join(tempDir, "score")

    await writeEmbeddingCache(embeddingDir, [
      row("manual-a", "same-1", { bagId: "bag-1", calloutId: "callout-1", vector: [1, 0] }),
      row("manual-a", "same-2", { bagId: "bag-1", calloutId: "callout-2", vector: [0.95, 0.05] }),
      row("manual-a", "same-3", { bagId: "bag-1", calloutId: "callout-3", vector: [0.94, 0.06] }),
      row("manual-a", "different-1", { bagId: "bag-1", calloutId: "callout-4", vector: [0, 1] }),
    ])
    await writeLabelSet(labelDir, "manual-a", [
      label("same-1", "part-a"),
      label("same-2", "part-a"),
      label("same-3", "part-a"),
      label("different-1", "part-b"),
    ])
    await writeJson(decisionPath, {
      decisions: [
        {
          left: "same-1",
          manualId: "manual-a",
          right: "same-2",
          status: "same",
        },
        {
          left: "same-1",
          manualId: "manual-a",
          right: "same-2",
          status: "different",
        },
      ],
    })

    const result = await scorePartMatchEmbeddings({
      decisionPaths: [decisionPath],
      embeddingDirs: [embeddingDir],
      labelDir,
      outputDir,
    })

    expect(result.summary.skippedPairs.byReason["conflicting-target"]).toBe(1)
    expect(result.summary.totals.positivePairs).toBeGreaterThan(0)
  })
})

async function scoreSingleNegative(differentVector) {
  const tempDir = await createTempDir()
  const embeddingDir = path.join(tempDir, "embeddings")
  const labelDir = path.join(tempDir, "labels")
  const outputDir = path.join(tempDir, "score")

  await writeEmbeddingCache(embeddingDir, [
    row("manual-a", "same-1", { bagId: "bag-1", calloutId: "callout-1", vector: [1, 0] }),
    row("manual-a", "same-2", { bagId: "bag-1", calloutId: "callout-2", vector: [0.95, 0.05] }),
    row("manual-a", "different-1", { bagId: "bag-1", calloutId: "callout-3", vector: differentVector }),
  ])
  await writeLabelSet(labelDir, "manual-a", [
    label("same-1", "part-a"),
    label("same-2", "part-a"),
    label("different-1", "part-b"),
  ])

  return scorePartMatchEmbeddings({
    embeddingDirs: [embeddingDir],
    labelDir,
    outputDir,
  })
}

async function createTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "part-match-embedding-score-"))
  tempDirs.push(tempDir)
  return tempDir
}

async function writeLabelSet(labelDir, manualId, labels) {
  await writeJson(path.join(labelDir, `${manualId}.json`), {
    labels,
    manualId,
    reportPath: "report.json",
    status: "active",
  })
}

function label(itemId, expectedPartKey, options = {}) {
  return {
    expectedPartKey,
    itemId,
    role: options.role ?? "active",
  }
}

function color(name) {
  return {
    family: "green",
    key: `key-${name}`,
    manualClassId: name,
    manualClassTrusted: true,
    name,
    status: "accepted",
  }
}

function row(manualId, itemId, { bagId, calloutId, color: rowColor = color("Light Bluish Gray"), vector }) {
  const rowKey = `${manualId}:${itemId}`

  return {
    embedding: vector
      ? {
        "neutral-mask": embeddingRecord(vector),
        rendered: embeddingRecord(vector),
        silhouette: embeddingRecord(vector),
        "tight-rendered": embeddingRecord(vector),
      }
      : null,
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
    embeddings: Object.fromEntries(rowSpecs
      .filter((spec) => spec.embedding)
      .map((spec) => [spec.row.rowKey, spec.embedding])),
    model: {
      id: "fake-model",
      task: "image-feature-extraction",
    },
    version: "test",
  })
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}
