import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  decodeRgbaPngBytes,
  encodeRgbaPng,
} from "./part-match-embedding-cache.ts"
import { runPartMatchLegoTrainingData } from "./part-match-lego-training-data.ts"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe("part match LEGO training data", () => {
  it("writes normalized examples and pair manifests from rendered parts", async () => {
    const tempDir = await createTempDir()
    const renderDir = path.join(tempDir, "renders")
    const ldrawRoot = path.join(tempDir, "ldraw")
    const outputDir = path.join(tempDir, "out")

    await writeFakeLDrawParts(ldrawRoot)
    await writeFakeRenders(renderDir)

    const result = await runPartMatchLegoTrainingData({
      augmentations: 3,
      foldCount: 3,
      generatedAt: new Date("2026-06-25T00:00:00.000Z"),
      ldrawRoot,
      maxNegativesPerExample: 2,
      outputDir,
      outputSize: 32,
      renderDir,
      validationFold: 0,
    })
    const examplesFile = JSON.parse(await readFile(result.examplesPath, "utf8"))
    const pairsFile = JSON.parse(await readFile(result.pairsPath, "utf8"))
    const firstExample = examplesFile.examples[0]
    const firstImage = decodeRgbaPngBytes(await readFile(path.join(outputDir, firstExample.imagePath)))

    expect(result.summary.examples.count).toBe(9)
    expect(result.summary.pairs.positive).toBe(9)
    expect(result.summary.pairs.negative).toBeGreaterThan(0)
    expect(firstImage?.width).toBe(32)
    expect(firstImage?.height).toBe(32)
    expect(pairsFile.pairs.some((pair) => pair.kind === "negative-same-category")).toBe(true)
    expect(existsSync(result.indexPath)).toBe(true)
  })

  it("selects high-quantity LDraw parts from Rebrickable BOM CSVs", async () => {
    const tempDir = await createTempDir()
    const bomPath = path.join(tempDir, "bom.csv")
    const renderDir = path.join(tempDir, "renders")
    const ldrawRoot = path.join(tempDir, "ldraw")
    const outputDir = path.join(tempDir, "out")

    await writeFakeLDrawParts(ldrawRoot)
    await writeFakeRenders(renderDir)
    await writeFile(bomPath, [
      "Part,Color,Quantity,Is Spare",
      "9999,0,50,False",
      "3005,15,30,True",
      "3004,71,9,False",
      "3023,71,2,False",
      "",
    ].join("\n"))

    const result = await runPartMatchLegoTrainingData({
      augmentations: 2,
      bomCsvs: [bomPath],
      foldCount: 3,
      generatedAt: new Date("2026-06-25T00:00:00.000Z"),
      ldrawRoot,
      maxNegativesPerExample: 1,
      maxParts: 2,
      outputDir,
      outputSize: 32,
      renderDir,
      validationFold: 0,
      views: ["iso-left"],
    })

    expect(result.summary.bom?.selectedPartIds).toEqual(["3004", "3023"])
    expect(result.summary.bom?.selectedQuantity).toBe(11)
    expect(result.summary.bom?.missingParts[0]).toEqual({ partId: "9999", quantity: 50 })
    expect(result.summary.examples.count).toBe(4)
    expect(result.summary.options.partIds).toEqual(["3004", "3023"])
    expect(result.summary.render.renderedParts).toBe(3)
  })
})

async function createTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "part-match-lego-training-data-"))
  tempDirs.push(tempDir)

  return tempDir
}

async function writeFakeLDrawParts(ldrawRoot) {
  const partsDir = path.join(ldrawRoot, "parts")

  await mkdir(partsDir, { recursive: true })
  await writeFile(path.join(partsDir, "3004.dat"), "0 Brick  1 x  2\n")
  await writeFile(path.join(partsDir, "3005.dat"), "0 Brick  1 x  1\n")
  await writeFile(path.join(partsDir, "3023.dat"), "0 Plate  1 x  2\n")
}

async function writeFakeRenders(renderDir) {
  await mkdir(renderDir, { recursive: true })

  const parts = []

  for (const partId of ["3004", "3005", "3023"]) {
    const fileName = `${partId}-iso-left.png`
    await writeFile(path.join(renderDir, fileName), encodeRgbaPng(fakePartImage(partId)))
    parts.push({
      partId,
      views: [{ path: fileName, view: "iso-left" }],
    })
  }

  await writeJson(path.join(renderDir, "renders.json"), {
    generatedAt: "2026-06-25T00:00:00.000Z",
    ldrawRoot: "fake",
    outputDir: renderDir,
    parts,
    renderer: "fake",
    version: "test",
  })
}

function fakePartImage(partId) {
  const width = 48
  const height = 48
  const data = new Uint8ClampedArray(width * height * 4)
  const bounds = partId === "3005"
    ? { x: 18, y: 14, width: 12, height: 20 }
    : partId === "3023"
      ? { x: 8, y: 19, width: 32, height: 10 }
      : { x: 8, y: 14, width: 32, height: 18 }

  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const index = (y * width + x) * 4

      data[index] = 160
      data[index + 1] = 170
      data[index + 2] = 180
      data[index + 3] = 255
    }
  }

  return { data, height, width }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}
