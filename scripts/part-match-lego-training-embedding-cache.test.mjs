import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { encodeRgbaPng } from "./part-match-embedding-cache.ts"
import { runPartMatchLegoTrainingEmbeddingCache } from "./part-match-lego-training-embedding-cache.ts"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe("part match LEGO training embedding cache", () => {
  it("converts LEGO training examples into report labels and embeddings", async () => {
    const tempDir = await createTempDir()
    const trainingDataDir = path.join(tempDir, "training")
    const outputDir = path.join(tempDir, "out")

    await writeFakeTrainingData(trainingDataDir)

    const result = await runPartMatchLegoTrainingEmbeddingCache({
      embedder: fakeEmbedder(),
      generatedAt: new Date("2026-06-25T00:00:00.000Z"),
      manualId: "fake-lego-training",
      outputDir,
      trainingDataDir,
    })
    const report = JSON.parse(await readFile(result.reportPath, "utf8"))
    const labels = JSON.parse(await readFile(result.labelPath, "utf8"))
    const embeddings = JSON.parse(await readFile(result.embedding.embeddingsPath, "utf8"))

    expect(result.summary.dataset.exampleCount).toBe(2)
    expect(result.summary.embedding.rows).toBe(2)
    expect(result.summary.embedding.vectors).toBe(8)
    expect(report.rows.map((row) => row.itemId)).toEqual(["3004:iso-left:aug-0", "3023:iso-left:aug-0"])
    expect(labels.labels.map((label) => label.expectedPartKey)).toEqual(["3004", "3023"])
    expect(Object.keys(embeddings.embeddings)).toEqual([
      "fake-lego-training:3004:iso-left:aug-0",
      "fake-lego-training:3023:iso-left:aug-0",
    ])
  })
})

async function createTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "part-match-lego-training-embedding-"))
  tempDirs.push(tempDir)

  return tempDir
}

async function writeFakeTrainingData(trainingDataDir) {
  await mkdir(path.join(trainingDataDir, "images", "3004", "iso-left"), { recursive: true })
  await mkdir(path.join(trainingDataDir, "images", "3023", "iso-left"), { recursive: true })
  await writeFile(path.join(trainingDataDir, "images", "3004", "iso-left", "aug-0.png"), encodeRgbaPng(fakeImage(12, 18)))
  await writeFile(path.join(trainingDataDir, "images", "3023", "iso-left", "aug-0.png"), encodeRgbaPng(fakeImage(24, 8)))
  await writeJson(path.join(trainingDataDir, "examples.json"), {
    examples: [
      {
        cropHash: "hash-3004",
        imagePath: "images/3004/iso-left/aug-0.png",
        itemId: "3004:iso-left:aug-0",
        partId: "3004",
        view: "iso-left",
      },
      {
        cropHash: "hash-3023",
        imagePath: "images/3023/iso-left/aug-0.png",
        itemId: "3023:iso-left:aug-0",
        partId: "3023",
        view: "iso-left",
      },
    ],
    generatedAt: "2026-06-25T00:00:00.000Z",
    version: "test",
  })
}

function fakeImage(width, height) {
  const data = new Uint8ClampedArray(32 * 32 * 4)

  for (let y = 4; y < 4 + height; y += 1) {
    for (let x = 4; x < 4 + width; x += 1) {
      const index = (y * 32 + x) * 4

      data[index] = 160
      data[index + 1] = 170
      data[index + 2] = 180
      data[index + 3] = 255
    }
  }

  return { data, height: 32, width: 32 }
}

function fakeEmbedder() {
  return {
    async embed(imagePath) {
      const seed = imagePath.includes("3004") ? 1 : 2

      return normalize([seed, imagePath.length % 7, 1])
    },
    model: {
      cacheDir: "fake-cache",
      id: "fake-model",
      task: "image-feature-extraction",
    },
  }
}

function normalize(vector) {
  const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0))

  return vector.map((value) => value / magnitude)
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}
