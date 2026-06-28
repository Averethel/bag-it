import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  convertFeatureFusionModel,
  runPartMatchExportFeatureFusionScorer,
} from "./part-match-export-feature-fusion-scorer.ts"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe("part-match-export-feature-fusion-scorer", () => {
  it("maps structural fusion features into runtime scorer features", () => {
    const converted = convertFeatureFusionModel({
      featureNames: [
        "score:cnn",
        "struct:matched",
        "struct:probability",
        "struct:alphaDistance",
      ],
      means: [0.1, 0.2, 0.3, 0.4],
      stds: [1, 2, 3, 4],
      weights: [0.5, 0, 1.5, -0.25, 0.75],
    })

    expect(converted).toEqual({
      featureNames: ["baseMatched", "baseProbability", "alphaDistance"],
      intercept: 0.5,
      normalization: {
        alphaDistance: { mean: 0.4, std: 4 },
        baseMatched: { mean: 0.2, std: 2 },
        baseProbability: { mean: 0.3, std: 3 },
      },
      skippedScoreFeatures: ["score:cnn"],
      weights: {
        alphaDistance: 0.75,
        baseMatched: 1.5,
        baseProbability: -0.25,
      },
    })
  })

  it("rejects nonzero model-only score weights", () => {
    expect(() => convertFeatureFusionModel({
      featureNames: ["score:cnn"],
      means: [0],
      stds: [1],
      weights: [0, 0.5],
    })).toThrow(/runtime-only/)
  })

  it("exports auto and suggested scorer configs from lane metrics", async () => {
    const tempDir = await createTempDir()
    const featureFusionDir = path.join(tempDir, "fusion")
    const laneSummaryDir = path.join(tempDir, "lanes")
    const outputDir = path.join(tempDir, "export")

    await writeJson(path.join(featureFusionDir, "summary.json"), {
      model: {
        featureNames: ["struct:matched", "struct:probability"],
        means: [0.1, 0.2],
        stds: [1, 2],
        weights: [-1, 2, 3],
      },
    })
    await writeJson(path.join(laneSummaryDir, "summary.json"), {
      strategies: [{
        auto: lane(0.99, { falsePositivePairs: 0, matchedPositivePairs: 10 }),
        name: "score-threshold",
        suggested: lane(0.91, { falsePositivePairs: 1, matchedPositivePairs: 20 }),
      }],
    })

    const result = await runPartMatchExportFeatureFusionScorer({
      featureFusionDir,
      generatedAt: new Date("2026-06-26T00:00:00.000Z"),
      laneSummaryDir,
      outputDir,
    })
    const autoConfig = JSON.parse(await readFile(result.autoConfigPath, "utf8"))
    const suggestedConfig = JSON.parse(await readFile(result.suggestedConfigPath, "utf8"))

    expect(result.summary.exportedLanes).toEqual(["auto", "suggested"])
    expect(autoConfig).toMatchObject({
      featureNames: ["baseMatched", "baseProbability"],
      kind: "linear",
      metadata: {
        lane: "auto",
        falsePositivePairs: 0,
        matchedPositivePairs: 10,
        trustedColorGateRequired: true,
      },
      threshold: 0.99,
      weights: {
        baseMatched: 2,
        baseProbability: 3,
      },
    })
    expect(suggestedConfig).toMatchObject({
      metadata: {
        lane: "suggested",
        falsePositivePairs: 1,
        matchedPositivePairs: 20,
      },
      threshold: 0.91,
    })
    expect(await readFile(result.summaryPath, "utf8")).toContain("auto-scorer-config.json")
  })
})

function lane(scoreFloor, overrides = {}) {
  return {
    config: {
      margin: 0,
      mutualTop1: false,
      rankLimit: null,
      scoreFloor,
    },
    train: {
      acceptedPairs: 0,
      correctionBurden: 0,
      falseGroups: 0,
      falsePositivePairs: 0,
      groupedRows: 0,
      hardNegativeFalsePositivePairs: 0,
      matchedPositivePairs: 0,
      positivePairs: 20,
      recall: 0,
      wrongRowMemberships: 0,
      ...overrides,
    },
  }
}

async function createTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "part-match-export-scorer-"))

  tempDirs.push(dir)

  return dir
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}
