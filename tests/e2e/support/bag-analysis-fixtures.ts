import fs from "node:fs"
import path from "node:path"
import type {
  ExpectedCalloutsFixture,
  ExpectedPartsFixture,
} from "./bag-analysis-comparison"
import {
  assertValidBagAnalysisFixtureManifest,
} from "./bag-analysis-fixture-manifest-validator"

export interface BagAnalysisFixtureManifest {
  schemaVersion: number
  cases: BagAnalysisFixtureCase[]
}

export interface BagAnalysisFixtureCase {
  id: string
  approvalStatus: string
  calloutsPath: string
  contextPages: number[] | null
  ciKnownMissingPartRows?: BagAnalysisKnownMissingPartRow[]
  expectedCallouts: number
  expectedColorRows: number
  expectedPageCounts: Record<string, number> | null
  expectedPartRows: number
  inputSessionPath: string
  pages: number[] | null
  partsPath: string
  regressionType: string
  sourceKind: string
}

export interface BagAnalysisKnownMissingPartRow {
  calloutOrdinal: number
  partOrdinal: number
  reason: string
}

export interface LoadedBagAnalysisFixture {
  callouts: ExpectedCalloutsFixture
  directory: string
  fixtureCase: BagAnalysisFixtureCase
  inputSessionPath: string
  parts: ExpectedPartsFixture
}

export const BAG_ANALYSIS_FIXTURE_DIR = path.join(
  process.cwd(),
  "tests/e2e/fixtures/bag-analysis",
)

export function loadBagAnalysisManifest(
  fixtureDir = BAG_ANALYSIS_FIXTURE_DIR,
  options: { validate?: boolean } = {},
): BagAnalysisFixtureManifest {
  const manifestPath = path.join(fixtureDir, "manifest.json")
  const manifest = readJson(manifestPath) as BagAnalysisFixtureManifest

  if (options.validate ?? true) {
    assertValidBagAnalysisFixtureManifest(manifest, {
      fixtureDir,
      manifestPath,
    })
  }

  return manifest
}

export function loadBagAnalysisFixture(
  fixtureCase: BagAnalysisFixtureCase,
  fixtureDir = BAG_ANALYSIS_FIXTURE_DIR,
): LoadedBagAnalysisFixture {
  return {
    callouts: readJson(path.join(fixtureDir, fixtureCase.calloutsPath)) as ExpectedCalloutsFixture,
    directory: path.join(fixtureDir, fixtureCase.id),
    fixtureCase,
    inputSessionPath: path.join(fixtureDir, fixtureCase.inputSessionPath),
    parts: readJson(path.join(fixtureDir, fixtureCase.partsPath)) as ExpectedPartsFixture,
  }
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}
