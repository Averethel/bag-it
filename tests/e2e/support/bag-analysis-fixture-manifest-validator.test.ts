import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  assertValidBagAnalysisFixtureManifest,
  validateBagAnalysisFixtureManifest,
} from "./bag-analysis-fixture-manifest-validator"

describe("bag-analysis fixture manifest validator", () => {
  const fixtureDirs: string[] = []

  afterEach(() => {
    for (const fixtureDir of fixtureDirs.splice(0)) {
      rmSync(fixtureDir, { force: true, recursive: true })
    }
  })

  it("accepts an approved manual-derived fixture manifest", () => {
    const fixtureDir = createFixtureDir()
    const manifest = createManifest()

    expect(validateBagAnalysisFixtureManifest(manifest, {
      fixtureDir,
      isPathIgnored: () => false,
      manifestPath: path.join(fixtureDir, "manifest.json"),
    })).toEqual([])
  })

  it("rejects missing fixture paths", () => {
    const fixtureDir = createFixtureDir()
    const manifest = createManifest({
      calloutsPath: "manual-001/missing-callouts.json",
    })

    expect(validateBagAnalysisFixtureManifest(manifest, {
      fixtureDir,
      isPathIgnored: () => false,
    })).toContain("manual-001.calloutsPath file does not exist: manual-001/missing-callouts.json")
  })

  it("rejects fixture paths outside the fixture root", () => {
    const fixtureDir = createFixtureDir()
    const manifest = createManifest({
      inputSessionPath: "../manual-001/input.bagit-session.json",
    })

    expect(validateBagAnalysisFixtureManifest(manifest, {
      fixtureDir,
      isPathIgnored: () => false,
    })).toContain("manual-001.inputSessionPath must stay inside " + fixtureDir)
  })

  it("rejects unapproved or non-manual fixture cases", () => {
    const fixtureDir = createFixtureDir()
    const manifest = createManifest({
      approvalStatus: "pending",
      sourceKind: "private",
    })

    expect(validateBagAnalysisFixtureManifest(manifest, {
      fixtureDir,
      isPathIgnored: () => false,
    })).toEqual(expect.arrayContaining([
      "manual-001.sourceKind must be user-approved-manual",
      "manual-001.approvalStatus must be approved",
    ]))
  })

  it("rejects ignored input session files", () => {
    const fixtureDir = createFixtureDir()
    const manifest = createManifest()

    expect(validateBagAnalysisFixtureManifest(manifest, {
      fixtureDir,
      isPathIgnored: (relativeRepoPath) => relativeRepoPath.endsWith("input.bagit-session.json"),
    })).toContain("manual-001.inputSessionPath must not be ignored by git: manual-001/input.bagit-session.json")
  })

  it("throws a grouped error for invalid manifests", () => {
    const fixtureDir = createFixtureDir()
    const manifest = createManifest({
      partsPath: "manual-001/missing-parts.json",
    })

    expect(() => assertValidBagAnalysisFixtureManifest(manifest, {
      fixtureDir,
      isPathIgnored: () => false,
      manifestPath: "manifest.json",
    })).toThrow(/manifest\.json is invalid:/)
  })

  it("rejects malformed CI-known missing callouts", () => {
    const fixtureDir = createFixtureDir()
    const manifest = createManifest({
      ciKnownMissingCallouts: [
        {
          calloutOrdinal: "0",
          reason: "",
        },
      ],
    })

    expect(validateBagAnalysisFixtureManifest(manifest, {
      fixtureDir,
      isPathIgnored: () => false,
    })).toEqual(expect.arrayContaining([
      "manual-001.ciKnownMissingCallouts[0].calloutOrdinal must be a finite number",
      "manual-001.ciKnownMissingCallouts[0].reason must be a non-empty string",
    ]))
  })

  function createFixtureDir(): string {
    const fixtureDir = mkdtempSync(path.join(os.tmpdir(), "bag-analysis-fixtures-"))
    const caseDir = path.join(fixtureDir, "manual-001")

    fixtureDirs.push(fixtureDir)
    mkdirSync(caseDir, { recursive: true })
    writeFileSync(path.join(caseDir, "input.bagit-session.json"), "{}")
    writeFileSync(path.join(caseDir, "callouts.json"), "{}")
    writeFileSync(path.join(caseDir, "parts.json"), "{}")

    return fixtureDir
  }
})

function createManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 2,
    cases: [
      {
        approvalStatus: "approved",
        calloutsPath: "manual-001/callouts.json",
        contextPages: null,
        expectedCallouts: 1,
        expectedColorRows: 1,
        expectedPageCounts: null,
        expectedPartRows: 1,
        id: "manual-001",
        inputSessionPath: "manual-001/input.bagit-session.json",
        pages: null,
        partsPath: "manual-001/parts.json",
        regressionType: "callout-parts",
        sourceKind: "user-approved-manual",
        ...overrides,
      },
    ],
  }
}
