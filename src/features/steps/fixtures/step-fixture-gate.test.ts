import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"
import { describe, expect, it } from "vitest"
import {
  createPerfectStepFixtureDetection,
  evaluateStepFixtureGate,
} from "./step-fixture-gate"
import { stepFixtureManifest } from "./step-fixture-manifest"
import {
  STEP_FIXTURE_IDS,
  type StepFixtureExpectedBaseline,
} from "./step-fixture-types"

const root = process.cwd()

describe("step fixture manifest", () => {
  it("covers the complete minimum fixture set with synthetic provenance", () => {
    expect(stepFixtureManifest.map((entry) => entry.id)).toEqual([...STEP_FIXTURE_IDS])

    for (const entry of stepFixtureManifest) {
      expect(entry.sourceKind).toBe("synthetic")
      expect(entry.sourceSpecPath).toBe("tests/fixtures/steps/sources/step-fixture-sources.ts")
      expect(entry.generatedPdfPath).toMatch(/^tests\/fixtures\/steps\/generated\/.+\.pdf$/)
      expect(entry.expectedPath).toMatch(/^tests\/fixtures\/steps\/expected\/.+\.json$/)
      expect(existsSync(path.join(root, entry.sourceSpecPath))).toBe(true)
      expect(existsSync(path.join(root, entry.generatedPdfPath))).toBe(true)
      expect(existsSync(path.join(root, entry.expectedPath))).toBe(true)
    }
  })

  it("loads expected baselines with callouts, rows, and source metadata", () => {
    for (const baseline of loadBaselines()) {
      expect(baseline.source.sourceKind).toBe("synthetic")
      expect(baseline.pageCount).toBeGreaterThan(0)
      expect(baseline.expectedScannedPageNumbers).toHaveLength(baseline.pageCount)
      expect(baseline.expectedCallouts.length).toBeGreaterThan(0)
      expect(baseline.expectedBaggableRowCount).toBeGreaterThan(0)
      expect(
        baseline.expectedCallouts.every(
          (callout) =>
            callout.sourceRegion.width > 0 &&
            callout.sourceRegion.height > 0 &&
            callout.cropRegion.width >= callout.sourceRegion.width &&
            callout.cropRegion.height >= callout.sourceRegion.height,
        ),
      ).toBe(true)

      for (const callout of baseline.expectedCallouts) {
        for (const partItem of callout.partItems) {
          expect(partItem.ldrawPartId).toMatch(/^\d+[a-z]?-[-a-z0-9]+$/)
          expect(partItem.quantityLabelRegion.y).toBeGreaterThanOrEqual(
            partItem.partRegion.y + partItem.partRegion.height,
          )
        }
      }
    }
  })

  it("parses generated PDFs with expected page counts", async () => {
    for (const baseline of loadBaselines()) {
      const pdfData = readFileSync(path.join(root, baseline.source.generatedPdfPath))
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(pdfData),
        disableFontFace: true,
        isEvalSupported: false,
        stopAtErrors: true,
        useSystemFonts: false,
      })
      const document = await loadingTask.promise

      try {
        expect(document.numPages).toBe(baseline.pageCount)
      } finally {
        await document.destroy()
      }
    }
  })
})

describe("step fixture gate", () => {
  it("passes perfect controlled detections for every committed baseline", () => {
    for (const baseline of loadBaselines()) {
      const summary = evaluateStepFixtureGate(baseline, createPerfectStepFixtureDetection(baseline))

      expect(summary.failedThresholds, baseline.fixtureId).toEqual([])
      expect(summary.pageCoverage).toBe(1)
      expect(summary.calloutRecall).toBe(1)
      expect(summary.quantityExactRate).toBe(1)
    }
  })

  it("fails recall and source accuracy when a baggable callout is missing", () => {
    const baseline = loadBaseline("simple-blue-callouts")
    const detection = createPerfectStepFixtureDetection(baseline)
    detection.callouts = detection.callouts.slice(0, 1)

    const summary = evaluateStepFixtureGate(baseline, detection)

    expect(summary.failedThresholds.map((check) => check.name)).toContain("callout recall")
    expect(summary.calloutRecall).toBeLessThan(1)
    expect(summary.failureTaxonomy["missing-candidate"]).toBeGreaterThan(0)
  })

  it("fails the false-positive cap when a detected baggable region does not match baseline", () => {
    const baseline = loadBaseline("noisy-false-positive")
    const detection = createPerfectStepFixtureDetection(baseline)
    detection.callouts.push({
      id: "false-positive-baggable-region",
      pageNumber: 1,
      indexOnPage: 99,
      sourceRegion: baseline.falsePositiveTraps[0].region,
      cropRegion: baseline.falsePositiveTraps[0].region,
      baggable: true,
      partItems: [detection.callouts[0].partItems[0]],
    })

    const summary = evaluateStepFixtureGate(baseline, detection)

    expect(summary.failedThresholds.map((check) => check.name)).toContain(
      "false-positive baggable callouts",
    )
    expect(summary.falsePositiveBaggableRate).toBeGreaterThan(0.02)
    expect(summary.failureTaxonomy["false-positive-candidate"]).toBe(1)
  })

  it("fails targeted quantity and crop ownership checks", () => {
    const baseline = loadBaseline("quantity-and-crop-units")
    const detection = createPerfectStepFixtureDetection(baseline)
    const firstPart = detection.callouts[0].partItems[0]

    firstPart.quantity = { text: "11x", value: 11 }
    firstPart.partRegion = { ...firstPart.quantityLabelRegion }

    const summary = evaluateStepFixtureGate(baseline, detection)
    const failedNames = summary.failedThresholds.map((check) => check.name)

    expect(failedNames).toContain("quantity exact-match rate")
    expect(failedNames).toContain("multi-digit quantity exact match")
    expect(failedNames).toContain("part crop ownership")
    expect(summary.partCropOwnershipFailures.length).toBeGreaterThan(0)
    expect(summary.failureTaxonomy["quantity-wrong"]).toBe(1)
    expect(summary.failureTaxonomy["part-crop-overlaps-label"]).toBe(1)
  })
})

function loadBaselines() {
  return stepFixtureManifest.map((entry) => loadBaseline(entry.id))
}

function loadBaseline(fixtureId: (typeof STEP_FIXTURE_IDS)[number]) {
  const entry = stepFixtureManifest.find((manifestEntry) => manifestEntry.id === fixtureId)

  if (!entry) {
    throw new Error(`Unknown step fixture ${fixtureId}`)
  }

  const json = readFileSync(path.join(root, entry.expectedPath), "utf8")
  return JSON.parse(json) as StepFixtureExpectedBaseline
}
