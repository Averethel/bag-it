import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { analyzePartMatchPairLanes } from "./part-match-pair-lane-analysis.ts"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe("part match pair lane analysis", () => {
  it("selects auto and suggested score floors from wrapped scored pairs", async () => {
    const tempDir = await createTempDir()
    const scoreDir = path.join(tempDir, "score")
    const outputDir = path.join(tempDir, "lanes")

    await writeJson(path.join(scoreDir, "pairs.json"), {
      pairs: [
        pair("same-a", "same-b", 0.99, 1),
        pair("same-c", "same-d", 0.98, 1),
        pair("different-a", "different-b", 0.97, 0),
        pair("same-e", "same-f", 0.96, 1),
      ],
    })

    const result = await analyzePartMatchPairLanes({
      generatedAt: new Date("2026-06-26T00:00:00.000Z"),
      outputDir,
      scoreDir,
      suggestedBudget: 0.25,
    })
    const scoreThreshold = result.summary.strategies.find((strategy) => strategy.name === "score-threshold")

    expect(scoreThreshold?.auto?.train).toEqual(expect.objectContaining({
      acceptedPairs: 2,
      falsePositivePairs: 0,
      matchedPositivePairs: 2,
    }))
    expect(scoreThreshold?.suggested?.train).toEqual(expect.objectContaining({
      acceptedPairs: 4,
      falsePositivePairs: 1,
      matchedPositivePairs: 3,
    }))
    expect(result.summary.totals.train.positivePairs).toBe(3)
    expect(await readFile(result.indexPath, "utf8")).toContain("Part Match Pair Lane Analysis")
  })

  it("uses mutual top-1 and margin to reject ambiguous neighbors", async () => {
    const tempDir = await createTempDir()
    const scoreDir = path.join(tempDir, "score")

    await writeJson(path.join(scoreDir, "pairs.json"), {
      pairs: [
        pair("same-a", "same-b", 0.98, 1),
        pair("same-a", "near-a", 0.97, 0),
        pair("same-b", "near-b", 0.96, 0),
        pair("solo-a", "solo-b", 0.95, 1),
        pair("solo-a", "far-a", 0.40, 0),
        pair("solo-b", "far-b", 0.30, 0),
      ],
    })

    const result = await analyzePartMatchPairLanes({
      margins: [0.02],
      scoreDir,
      suggestedBudget: 0,
    })
    const mutualTop1 = result.summary.strategies.find((strategy) => strategy.name === "mutual-top-1")

    expect(mutualTop1?.auto?.train).toEqual(expect.objectContaining({
      acceptedPairs: 1,
      falsePositivePairs: 0,
      matchedPositivePairs: 1,
    }))
    expect(mutualTop1?.auto?.config).toEqual(expect.objectContaining({
      margin: 0.02,
      mutualTop1: true,
      scoreFloor: 0.95,
    }))
  })

  it("can evaluate mutual top-2 for repeated same-part families", async () => {
    const tempDir = await createTempDir()
    const scoreDir = path.join(tempDir, "score")

    await writeJson(path.join(scoreDir, "pairs.json"), {
      pairs: [
        pair("same-a", "same-b", 0.99, 1),
        pair("same-a", "same-c", 0.98, 1),
        pair("same-b", "different-a", 0.40, 0),
        pair("same-c", "different-b", 0.30, 0),
      ],
    })

    const result = await analyzePartMatchPairLanes({
      margins: [0.02],
      scoreDir,
      suggestedBudget: 0,
    })
    const mutualTop2 = result.summary.strategies.find((strategy) => strategy.name === "mutual-top-2")

    expect(mutualTop2?.auto?.train).toEqual(expect.objectContaining({
      falsePositivePairs: 0,
      matchedPositivePairs: 2,
    }))
    expect(mutualTop2?.auto?.config).toEqual(expect.objectContaining({
      margin: 0.02,
      rankLimit: 2,
      scoreFloor: 0.98,
    }))
  })

  it("counts transitive grouped positives as recovered", async () => {
    const tempDir = await createTempDir()
    const scoreDir = path.join(tempDir, "score")

    await writeJson(path.join(scoreDir, "pairs.json"), {
      pairs: [
        pair("same-a", "same-b", 0.99, 1),
        pair("same-b", "same-c", 0.98, 1),
        pair("same-a", "different-a", 0.97, 0),
        pair("same-a", "same-c", 0.10, 1),
      ],
    })

    const result = await analyzePartMatchPairLanes({
      scoreDir,
      suggestedBudget: 0,
    })
    const scoreThreshold = result.summary.strategies.find((strategy) => strategy.name === "score-threshold")

    expect(scoreThreshold?.auto?.train).toEqual(expect.objectContaining({
      acceptedPairs: 2,
      falsePositivePairs: 0,
      matchedPositivePairs: 3,
    }))
  })

  it("uses wrong row memberships as the suggested correction budget", async () => {
    const tempDir = await createTempDir()
    const scoreDir = path.join(tempDir, "score")

    await writeJson(path.join(scoreDir, "pairs.json"), {
      pairs: [
        pair("same-a", "same-b", 0.99, 1),
        pair("same-a", "wrong-a", 0.98, 0),
        pair("same-b", "same-c", 0.97, 1),
        pair("same-a", "same-c", 0.10, 1),
        pair("same-b", "wrong-a", 0.09, 0),
        pair("same-c", "wrong-a", 0.08, 0),
      ],
    })

    const result = await analyzePartMatchPairLanes({
      scoreDir,
      suggestedBudget: 0.25,
    })
    const scoreThreshold = result.summary.strategies.find((strategy) => strategy.name === "score-threshold")

    expect(scoreThreshold?.suggested?.train).toEqual(expect.objectContaining({
      acceptedPairs: 4,
      correctionBurden: 0.25,
      correctionBurdenGroups: 1,
      falseGroups: 1,
      groupedRows: 4,
      matchedPositivePairs: 3,
      wrongRowMemberships: 1,
    }))
  })

  it("keeps the auto lane strict when labels conflict", async () => {
    const tempDir = await createTempDir()
    const scoreDir = path.join(tempDir, "score")

    await writeJson(path.join(scoreDir, "pairs.json"), {
      pairs: [
        pair("same-a", "same-b", 0.99, 0),
        pair("same-a", "same-b", 0.98, 1),
      ],
    })

    const result = await analyzePartMatchPairLanes({
      scoreDir,
      suggestedBudget: 0.25,
    })
    const scoreThreshold = result.summary.strategies.find((strategy) => strategy.name === "score-threshold")

    expect(scoreThreshold?.auto).toBeNull()
    expect(scoreThreshold?.suggested?.train).toEqual(expect.objectContaining({
      correctionBurden: 0,
      correctionBurdenGroups: 1,
      falseGroups: 1,
      wrongRowMemberships: 0,
    }))
  })

  it("reports validation lane metrics separately from training selection", async () => {
    const tempDir = await createTempDir()
    const scoreDir = path.join(tempDir, "score")

    await writeJson(path.join(scoreDir, "pairs.json"), [
      pair("train-a", "train-b", 0.99, 1, { split: "train" }),
      pair("train-c", "train-d", 0.98, 1, { split: "train" }),
      pair("train-e", "train-f", 0.97, 0, { split: "train" }),
      pair("holdout-a", "holdout-b", 0.99, 1, { split: "validation" }),
      pair("holdout-c", "holdout-d", 0.98, 0, { split: "validation" }),
    ])

    const result = await analyzePartMatchPairLanes({
      scoreDir,
      suggestedBudget: 0,
    })
    const scoreThreshold = result.summary.strategies.find((strategy) => strategy.name === "score-threshold")

    expect(scoreThreshold?.auto?.train).toEqual(expect.objectContaining({
      falsePositivePairs: 0,
      matchedPositivePairs: 2,
    }))
    expect(scoreThreshold?.auto?.validation).toEqual(expect.objectContaining({
      acceptedPairs: 2,
      falsePositivePairs: 1,
      matchedPositivePairs: 1,
    }))
  })

  it("can skip color-name conflicts using manual training metadata", async () => {
    const tempDir = await createTempDir()
    const scoreDir = path.join(tempDir, "score")
    const manualTrainingDir = path.join(tempDir, "manual-training")

    await writeJson(path.join(scoreDir, "pairs.json"), [
      pair("same-a", "same-b", 0.99, 1),
      pair("brown-a", "dark-brown-a", 0.98, 0),
      pair("same-c", "same-d", 0.97, 1),
    ])
    await writeJson(path.join(manualTrainingDir, "examples.json"), {
      examples: [
        example("same-a", "Light Bluish Gray"),
        example("same-b", "Light Bluish Gray"),
        example("same-c", "Green"),
        example("same-d", "Green"),
        example("brown-a", "Reddish Brown"),
        example("dark-brown-a", "Dark Brown"),
      ],
    })

    const result = await analyzePartMatchPairLanes({
      manualTrainingDir,
      scoreDir,
      suggestedBudget: 0,
    })
    const scoreThreshold = result.summary.strategies.find((strategy) => strategy.name === "score-threshold")

    expect(scoreThreshold?.auto?.train).toEqual(expect.objectContaining({
      acceptedPairs: 2,
      falsePositivePairs: 0,
      matchedPositivePairs: 2,
    }))
    expect(result.summary.totals.train.negativePairs).toBe(0)
    expect(result.summary.options.skipColorNameConflicts).toBe(true)
  })
})

async function createTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "part-match-pair-lane-analysis-"))
  tempDirs.push(tempDir)
  return tempDir
}

function pair(left, right, score, target, options = {}) {
  return {
    kind: options.kind ?? (target === 1 ? "positive" : "hard-negative"),
    leftExampleId: left,
    manualId: options.manualId ?? "manual-a",
    rightExampleId: right,
    score,
    split: options.split,
    target,
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function example(exampleId, colorName) {
  return {
    colorName,
    exampleId,
  }
}
