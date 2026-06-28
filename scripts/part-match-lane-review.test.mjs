import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { writePartMatchLaneReview } from "./part-match-lane-review.ts"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe("part match lane review", () => {
  it("renders clean validation groups and skips color-name conflicts", async () => {
    const tempDir = await createTempDir()
    const scoreDir = path.join(tempDir, "score")
    const manualTrainingDir = path.join(tempDir, "manual-training")
    const laneSummaryDir = path.join(tempDir, "lane-summary")
    const outputDir = path.join(tempDir, "review")

    await writeJson(path.join(scoreDir, "pairs.json"), [
      pair("same-a", "same-b", 0.99, 1),
      pair("brown-a", "dark-brown-a", 1, 0),
    ])
    await writeExamples(manualTrainingDir, [
      example("same-a", "part-001", "Green"),
      example("same-b", "part-001", "Green", { pageNumber: 2, stepIndex: 3 }),
      example("brown-a", "part-002", "Reddish Brown"),
      example("dark-brown-a", "part-003", "Dark Brown"),
    ])
    await writeLaneSummary(laneSummaryDir, {
      manualTrainingDir,
      scoreDir,
      scoreFloor: 0.99,
    })

    const result = await writePartMatchLaneReview({
      generatedAt: new Date("2026-06-26T00:00:00.000Z"),
      laneSummaryDirs: [laneSummaryDir],
      outputDir,
    })

    expect(result.summary.totals).toEqual(expect.objectContaining({
      falseGroups: 0,
      groupedRows: 2,
      matchedPositivePairs: 1,
      positivePairs: 1,
      wrongRowMemberships: 0,
    }))
    const groups = JSON.parse(await readFile(result.groupsPath, "utf8"))
    expect(groups.groups).toHaveLength(1)
    expect(groups.groups[0]).toEqual(expect.objectContaining({
      bagLabel: "Bag 1",
      falsePairCount: 0,
      wrongRowMemberships: 0,
    }))
    expect(await readFile(result.indexPath, "utf8")).toContain("Part Match Lane Review")
  })

  it("flags selected false grouped rows", async () => {
    const tempDir = await createTempDir()
    const scoreDir = path.join(tempDir, "score")
    const manualTrainingDir = path.join(tempDir, "manual-training")
    const laneSummaryDir = path.join(tempDir, "lane-summary")
    const outputDir = path.join(tempDir, "review")

    await writeJson(path.join(scoreDir, "pairs.json"), [
      pair("same-a", "same-b", 0.99, 1),
      pair("same-a", "wrong-a", 0.98, 0),
      pair("same-b", "wrong-a", 0.10, 0),
    ])
    await writeExamples(manualTrainingDir, [
      example("same-a", "part-001", "Light Bluish Gray"),
      example("same-b", "part-001", "Light Bluish Gray"),
      example("wrong-a", "part-002", "Light Bluish Gray"),
    ])
    await writeLaneSummary(laneSummaryDir, {
      manualTrainingDir,
      scoreDir,
      scoreFloor: 0.98,
    })

    const result = await writePartMatchLaneReview({
      laneSummaryDirs: [laneSummaryDir],
      outputDir,
    })
    const groups = JSON.parse(await readFile(result.groupsPath, "utf8"))

    expect(result.summary.totals).toEqual(expect.objectContaining({
      falseGroups: 1,
      groupedRows: 3,
      wrongRowMemberships: 1,
    }))
    expect(groups.groups[0]).toEqual(expect.objectContaining({
      falsePairCount: 2,
      wrongRowMemberships: 1,
    }))
  })
})

async function createTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "part-match-lane-review-"))
  tempDirs.push(tempDir)
  return tempDir
}

async function writeLaneSummary(laneSummaryDir, options) {
  await writeJson(path.join(laneSummaryDir, "summary.json"), {
    options: {
      manualTrainingDir: options.manualTrainingDir,
      scoreDir: options.scoreDir,
      scoreMode: null,
      skipColorNameConflicts: true,
    },
    strategies: [
      {
        auto: {
          config: {
            margin: 0,
            mutualTop1: false,
            rankLimit: null,
            scoreFloor: options.scoreFloor,
          },
        },
        name: "score-threshold",
      },
    ],
  })
}

async function writeExamples(manualTrainingDir, examples) {
  await writeJson(path.join(manualTrainingDir, "examples.json"), { examples })
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function pair(left, right, score, target) {
  return {
    kind: target === 1 ? "positive" : "hard-negative",
    leftExampleId: left,
    manualId: "manual-a",
    rightExampleId: right,
    score,
    split: "validation",
    target,
  }
}

function example(exampleId, expectedPartKey, colorName, options = {}) {
  return {
    bagId: "bag-1",
    bagLabel: "Bag 1",
    calloutId: `${exampleId}-callout`,
    colorName,
    cropHash: `${exampleId}-hash`,
    exampleId,
    expectedPartKey,
    imagePath: `images/${exampleId}.png`,
    itemId: `${exampleId}:x1`,
    manualId: "manual-a",
    pageNumber: options.pageNumber ?? 1,
    quantity: 1,
    role: "active",
    stepIndex: options.stepIndex ?? 1,
    title: exampleId,
  }
}
