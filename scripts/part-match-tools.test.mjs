import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { CALLOUT_PART_EXTRACTOR_VERSION } from "../packages/callout-parts/src/index.ts"
import {
  PART_MATCHER_VERSION,
} from "../packages/part-matching/src/index.ts"
import {
  evaluatePartMatchLabelFile,
  readPartMatchLabelSet,
} from "./part-match-label-eval.mjs"
import {
  analyzePartMatchRules,
  createColorConflictDiagnostics,
  createGroupingConflictDiagnostics,
  formatPartMatchRuleAnalysis,
} from "./part-match-rule-analysis.mjs"
import {
  buildFrozenPartMatchLabelFile,
} from "./part-match-freeze-labels.mjs"
import {
  formatPartMatchHoldoutAnalysis,
  runPartMatchHoldoutAnalysis,
} from "./part-match-holdout-analysis.mjs"
import {
  writePartMatchReport,
} from "./write-part-match-report.mjs"
import {
  writePartMatchReviewQueue,
} from "./write-part-match-review-queue.mjs"
import {
  trainPartMatchScorer,
} from "./train-part-match-scorer.ts"
import {
  discoverPartMatchDecisionPaths,
  runPartMatchVerifierLab,
  selectPartMatchVerifierPromotionCandidate,
} from "./part-match-verifier-lab.ts"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe("part match report tools", () => {
  it("writes report details and workbench chunks from a saved session", async () => {
    const tempDir = await createTempDir()
    const sessionPath = path.join(tempDir, "manual.bagit-session.json")
    const outputDir = path.join(tempDir, "report")

    await writeJson(sessionPath, createSession())

    const { report } = await writePartMatchReport({
      generatedAt: new Date("2026-06-20T10:00:00.000Z"),
      outputDir,
      sessionPath,
    })
    const reportJson = JSON.parse(await readFile(path.join(outputDir, "report.json"), "utf8"))
    const detailsHtml = await readFile(path.join(outputDir, "details.html"), "utf8")
    const indexHtml = await readFile(path.join(outputDir, "index.html"), "utf8")
    const dataScript = await readFile(path.join(outputDir, "workbench-data.js"), "utf8")
    const appScript = await readFile(path.join(outputDir, "workbench.js"), "utf8")
    const css = await readFile(path.join(outputDir, "workbench.css"), "utf8")

    expect(report.totals).toEqual({
      exactGroups: 1,
      groupedRows: 2,
      groups: 1,
      nearGroups: 0,
      renderedPixelRows: 0,
      rows: 3,
    })
    expect(report.groups[0]).toEqual(expect.objectContaining({
      matchKind: "exact-digest",
      totalQuantity: 5,
    }))
    expect(report.groups[0].rowIds).toHaveLength(2)
    expect(reportJson.versions).toEqual(expect.objectContaining({
      currentPartExtractor: CALLOUT_PART_EXTRACTOR_VERSION,
      currentPartMatcher: PART_MATCHER_VERSION,
      partExtractorCurrent: true,
      partMatcherCurrent: true,
    }))
    expect(detailsHtml).toContain("Part match report")
    expect(detailsHtml).toContain("exact-digest")
    expect(indexHtml).toContain("part-match-workbench")
    expect(indexHtml).toContain("workbench-data.js")
    expect(dataScript).toContain("PART_MATCH_WORKBENCH_DATA")
    expect(dataScript).toContain('"hasExistingLabels": false')
    expect(dataScript).toContain('"suggestedPartKey": "part-001"')
    expect(appScript).toContain("Apply proposed groups")
    expect(appScript).toContain("Build label JSON")
    expect(appScript).toContain("New group")
    expect(appScript).toContain("seedProposedGroups")
    expect(appScript).toContain("seedProposedGroups({ includeExistingLabels: false })")
    expect(appScript).toContain("collapsedGroupKeys")
    expect(appScript).toContain("collapsedBagKeys")
    expect(appScript).toContain("beginGroupDrag")
    expect(appScript).toContain("renderBagSectionsForRows")
    expect(appScript).toContain("renderBagSectionsForGroups")
    expect(appScript).toContain("groupViewKey")
    expect(appScript).toContain("renderGroupSummary")
    expect(appScript).toContain("Remove")
    expect(appScript).toContain("collapsedColorNames")
    expect(appScript).toContain("captureScrollState")
    expect(appScript).toContain("dragStartScrollState")
    expect(appScript).toContain("renderColorSections")
    expect(appScript).toContain("sortRowsForWorkbench")
    expect(appScript).toContain("compareGroupViewsForWorkbench")
    expect(appScript).toContain("dropRowsOnRow")
    expect(appScript).toContain("Download label JSON")
    expect(appScript).toContain("expectedPartKey")
    expect(css).toContain(".board")
    expect(css).toContain("grid-template-columns: minmax(400px, 1fr) minmax(460px, 1fr)")
    expect(css).toContain(".group-list { display: grid; flex: 1; gap: 10px; grid-template-columns: 1fr")
    expect(css).toContain(".group-summary")
    expect(css).toContain(".bag-sections")
    expect(css).toContain("button.bag-header")
    expect(css).toContain(".color-sections")
    expect(css).toContain("button.color-header")
    expect(css).toContain(".color-section.collapsed")
    expect(css).toContain(".group-bucket")
    expect(css).toContain(".card-remove")
    expect(css).toContain(".drop-zone")
    expect(css).toContain(".part-card")
  })

  it("can filter private report rows to selected bags", async () => {
    const tempDir = await createTempDir()
    const sessionPath = path.join(tempDir, "manual.bagit-session.json")
    const selectedOutputDir = path.join(tempDir, "selected-report")
    const emptyOutputDir = path.join(tempDir, "empty-report")

    await writeJson(sessionPath, createSession())

    const { report: selectedReport } = await writePartMatchReport({
      bagLabels: ["Bag 1"],
      generatedAt: new Date("2026-06-20T10:00:00.000Z"),
      outputDir: selectedOutputDir,
      sessionPath,
    })
    const selectedReportJson = JSON.parse(await readFile(path.join(selectedOutputDir, "report.json"), "utf8"))

    expect(selectedReport.filters).toEqual({
      bagIds: [],
      bagLabels: ["Bag 1"],
    })
    expect(selectedReport.totals).toEqual({
      exactGroups: 1,
      groupedRows: 2,
      groups: 1,
      nearGroups: 0,
      renderedPixelRows: 0,
      rows: 3,
    })
    expect(new Set(selectedReportJson.rows.map((row) => row.bagLabel))).toEqual(new Set(["Bag 1"]))

    const { report } = await writePartMatchReport({
      bagLabels: ["Missing bag"],
      generatedAt: new Date("2026-06-20T10:00:00.000Z"),
      outputDir: emptyOutputDir,
      sessionPath,
    })
    const reportJson = JSON.parse(await readFile(path.join(emptyOutputDir, "report.json"), "utf8"))

    expect(report.filters).toEqual({
      bagIds: [],
      bagLabels: ["Missing bag"],
    })
    expect(report.totals).toEqual({
      exactGroups: 0,
      groupedRows: 0,
      groups: 0,
      nearGroups: 0,
      renderedPixelRows: 0,
      rows: 0,
    })
    expect(reportJson.rows).toEqual([])
    expect(reportJson.groups).toEqual([])
  })

  it("can enable label-gated near groups for private reports", async () => {
    const tempDir = await createTempDir()
    const sessionPath = path.join(tempDir, "manual.bagit-session.json")
    const outputDir = path.join(tempDir, "report")

    await writeJson(sessionPath, createScaledSession())

    const { report } = await writePartMatchReport({
      enableLabelGatedNearMatches: true,
      generatedAt: new Date("2026-06-20T10:00:00.000Z"),
      outputDir,
      sessionPath,
    })
    const reportJson = JSON.parse(await readFile(path.join(outputDir, "report.json"), "utf8"))

    expect(report.matcherConfig).toEqual({
      labelGatedNearMatchesEnabled: true,
      pairScorerEvidenceRuleCount: null,
      pairScorerConfigVersion: null,
      pairScorerKind: null,
      pairScorerThreshold: null,
      pairScorerVetoRuleCount: null,
    })
    expect(report.totals).toEqual(expect.objectContaining({
      exactGroups: 0,
      groupedRows: 2,
      groups: 1,
      nearGroups: 1,
      rows: 2,
    }))
    expect(report.groups[0]).toEqual(expect.objectContaining({
      matchKind: "label-gated-near",
    }))
    expect(reportJson.matcherConfig).toEqual(report.matcherConfig)
  })

  it("summarizes part-match rule analysis from reports and labels", async () => {
    const tempDir = await createTempDir()
    const manualId = "manual-analysis"
    const sourceDir = path.join(tempDir, "sources")
    const sessionPath = path.join(sourceDir, `${manualId}.current-app-result.bagit-session.json`)
    const outputDir = path.join(tempDir, "report")
    const labelDir = path.join(tempDir, "labels")
    const decisionPath = path.join(tempDir, "decisions.json")

    await writeJson(sessionPath, createScaledSession())

    const { report } = await writePartMatchReport({
      enableLabelGatedNearMatches: true,
      generatedAt: new Date("2026-06-20T10:00:00.000Z"),
      manualId,
      outputDir,
      sessionPath,
    })
    await writeJson(path.join(labelDir, `${manualId}.json`), {
      labels: report.rows.map((row) => label(row.itemId, "scaled-plate", {
        cropHash: row.cropHash,
        role: "active",
      })),
      manualId,
      reportPath: path.join(outputDir, "report.json"),
      status: "active",
    })
    await writeJson(decisionPath, {
      decisions: [{
        bucket: "combined-distance-low-alpha",
        left: report.rows[0].itemId,
        manualId,
        right: report.rows[1].itemId,
        status: "same",
      }],
      queueGeneratedAt: "2026-06-20T10:00:00.000Z",
    })

    const analysis = analyzePartMatchRules({
      decisionPath,
      labelDir,
      manualIds: [manualId],
      sourceDir,
    })
    const formatted = formatPartMatchRuleAnalysis(analysis)

    expect(analysis.groupTotals).toEqual(expect.objectContaining({
      expectedPairs: 1,
      falseGroups: 0,
      matchedPairs: 1,
      missedPairs: 0,
    }))
    expect(analysis.pairTotals).toEqual({
      falsePositivePairs: 0,
      sameMatchedPairs: 1,
      sameMissedPairs: 0,
    })
    expect(analysis.reviewDecisionSummary).toEqual(expect.objectContaining({
      differentFalsePositive: 0,
      sameMatched: 1,
      sameMissed: 0,
      total: 1,
    }))
    expect(formatted).toContain("Group score")
    expect(formatted).toContain("Pair score")
    expect(formatted).toContain("hard-negative false positive pairs: 0")
    expect(formatted).toContain("Review decisions")
    expect(formatted).toContain("same: 1 matched; 0 missed")
  })

  it("reports excluded rows as pair-level hard negatives", async () => {
    const tempDir = await createTempDir()
    const manualId = "manual-excluded-analysis"
    const sourceDir = path.join(tempDir, "sources")
    const sessionPath = path.join(sourceDir, `${manualId}.current-app-result.bagit-session.json`)
    const outputDir = path.join(tempDir, "report")
    const labelDir = path.join(tempDir, "labels")

    await writeJson(sessionPath, createScaledSession())

    const { report } = await writePartMatchReport({
      enableLabelGatedNearMatches: true,
      generatedAt: new Date("2026-06-24T10:00:00.000Z"),
      manualId,
      outputDir,
      sessionPath,
    })
    await writeJson(path.join(labelDir, `${manualId}.json`), {
      labels: [
        label(report.rows[0].itemId, "scaled-plate", {
          cropHash: report.rows[0].cropHash,
          role: "active",
        }),
        label(report.rows[1].itemId, "", {
          cropHash: report.rows[1].cropHash,
          role: "excluded",
        }),
      ],
      manualId,
      reportPath: path.join(outputDir, "report.json"),
      status: "active",
    })

    const analysis = analyzePartMatchRules({
      labelDir,
      manualIds: [manualId],
      sourceDir,
    })

    expect(analysis.groupTotals.falseGroups).toBe(1)
    expect(analysis.pairTotals).toEqual({
      falsePositivePairs: 1,
      sameMatchedPairs: 0,
      sameMissedPairs: 0,
    })
    expect(analysis.reasonCounts.falsePositivePairs).toEqual({
      "label-gated visual features match": 1,
    })
  })

  it("reports excluded rows against unlabeled rows as pair-level hard negatives", async () => {
    const tempDir = await createTempDir()
    const manualId = "manual-excluded-unlabeled-analysis"
    const sourceDir = path.join(tempDir, "sources")
    const sessionPath = path.join(sourceDir, `${manualId}.current-app-result.bagit-session.json`)
    const outputDir = path.join(tempDir, "report")
    const labelDir = path.join(tempDir, "labels")

    await writeJson(sessionPath, createSession())

    const { report } = await writePartMatchReport({
      generatedAt: new Date("2026-06-24T10:30:00.000Z"),
      manualId,
      outputDir,
      sessionPath,
    })
    await writeJson(path.join(labelDir, `${manualId}.json`), {
      labels: [
        label(report.rows[0].itemId, "", {
          cropHash: report.rows[0].cropHash,
          role: "excluded",
        }),
      ],
      manualId,
      reportPath: path.join(outputDir, "report.json"),
      status: "active",
    })

    const analysis = analyzePartMatchRules({
      labelDir,
      manualIds: [manualId],
      sourceDir,
    })

    expect(analysis.groupTotals.falseGroups).toBe(1)
    expect(analysis.pairTotals).toEqual({
      falsePositivePairs: 1,
      sameMatchedPairs: 0,
      sameMissedPairs: 0,
    })
    expect(analysis.samples.falsePositivePairs[0]).toEqual(expect.objectContaining({
      left: report.rows[0].itemId,
      right: report.rows[1].itemId,
      rightKey: "",
    }))
  })

  it("computes scorer-backed group score without regenerated reports", async () => {
    const tempDir = await createTempDir()
    const manualId = "manual-analysis-scorer"
    const sourceDir = path.join(tempDir, "sources")
    const sessionPath = path.join(sourceDir, `${manualId}.current-app-result.bagit-session.json`)
    const outputDir = path.join(tempDir, "report")
    const labelDir = path.join(tempDir, "labels")
    const scorerConfigPath = path.join(tempDir, "scorer-config.json")

    await writeJson(sessionPath, createScaledSession())

    const { report } = await writePartMatchReport({
      generatedAt: new Date("2026-06-20T10:00:00.000Z"),
      manualId,
      outputDir,
      sessionPath,
    })
    await writeJson(path.join(labelDir, `${manualId}.json`), {
      labels: report.rows.map((row) => label(row.itemId, "scaled-plate", {
        cropHash: row.cropHash,
        role: "active",
      })),
      manualId,
      reportPath: path.join(outputDir, "report.json"),
      status: "active",
    })
    await writeJson(scorerConfigPath, {
      featureNames: [],
      intercept: 10,
      kind: "linear",
      normalization: {},
      threshold: 0.99,
      version: "test",
      weights: {},
    })

    const analysis = analyzePartMatchRules({
      labelDir,
      manualIds: [manualId],
      scorerConfigPath,
      sourceDir,
    })

    expect(report.groups).toHaveLength(0)
    expect(analysis.groupTotals).toEqual(expect.objectContaining({
      expectedPairs: 1,
      falseGroups: 0,
      matchedPairs: 1,
      missedPairs: 0,
    }))
  })

  it("builds diagnostics for same-label pairs blocked by trusted color conflicts", async () => {
    const tempDir = await createTempDir()
    const manualId = "manual-color-conflict"
    const sourceDir = path.join(tempDir, "sources")
    const sessionPath = path.join(sourceDir, `${manualId}.current-app-result.bagit-session.json`)
    const outputDir = path.join(tempDir, "report")
    const labelDir = path.join(tempDir, "labels")
    const session = createScaledSession()

    session.stepDetectionResult.callouts[1].partItems[0].detectedColor = {
      confidence: 0.95,
      family: "blue",
      manualClassId: "manual-blue",
      manualClassTrusted: true,
      name: "Blue",
      status: "exact",
      swatchHex: "#0055bf",
    }

    await writeJson(sessionPath, session)

    const { report } = await writePartMatchReport({
      generatedAt: new Date("2026-06-20T10:00:00.000Z"),
      manualId,
      outputDir,
      sessionPath,
    })
    await writeJson(path.join(labelDir, `${manualId}.json`), {
      labels: report.rows.map((row) => label(row.itemId, "same-physical-part", {
        cropHash: row.cropHash,
        role: "active",
      })),
      manualId,
      reportPath: path.join(outputDir, "report.json"),
      status: "active",
    })

    const analysis = analyzePartMatchRules({
      includePairs: true,
      labelDir,
      manualIds: [manualId],
      sourceDir,
    })
    const diagnostics = createColorConflictDiagnostics(analysis, {
      generatedAt: new Date("2026-06-20T11:00:00.000Z"),
    })

    expect(analysis.missedBuckets).toEqual({
      "color-conflict": 1,
    })
    expect(diagnostics).toEqual(expect.objectContaining({
      generatedAt: "2026-06-20T11:00:00.000Z",
      pairCount: 1,
    }))
    expect(diagnostics.summary.byColorPair).toEqual({
      "manual:manual-blue <-> manual:manual-green": 1,
    })
    expect(diagnostics.pairs[0]).toEqual(expect.objectContaining({
      expectedPartKey: "same-physical-part",
      manualId,
      reasons: ["color"],
    }))
    expect(diagnostics.pairs[0].left.colorKey).toBe("manual:manual-green")
    expect(diagnostics.pairs[0].right.colorKey).toBe("manual:manual-blue")
  })

  it("builds diagnostics for grouping conflicts with unlabeled competing rows", async () => {
    const tempDir = await createTempDir()
    const reportPath = path.join(tempDir, "report.json")
    const labelDir = path.join(tempDir, "labels")
    const labelPath = path.join(labelDir, "manual-grouping-conflict.json")

    await writeJson(reportPath, {
      groups: [{
        confidence: 1,
        groupId: "group-with-unlabeled-row",
        matchKind: "label-gated-near",
        rowIds: ["row-1", "row-unlabeled"],
      }],
      rows: [
        rowSummary("row-1", {
          bagId: "bag-1",
          calloutId: "callout-1",
          imageDataUrl: "data:image/png;base64,row1",
        }),
        rowSummary("row-2", {
          bagId: "bag-1",
          calloutId: "callout-2",
          imageDataUrl: "data:image/png;base64,row2",
        }),
        rowSummary("row-unlabeled", {
          bagId: "bag-1",
          calloutId: "callout-3",
          imageDataUrl: "data:image/png;base64,row3",
        }),
      ],
      versions: {
        partExtractorCurrent: true,
        partMatcherCurrent: true,
      },
    })
    await writeJson(labelPath, {
      labels: [
        label("row-1", "same-part", { cropHash: "hash-row-1", role: "active" }),
        label("row-2", "same-part", { cropHash: "hash-row-2", role: "active" }),
      ],
      manualId: "manual-grouping-conflict",
      reportPath,
      status: "active",
    })

    const diagnostics = createGroupingConflictDiagnostics({
      generatedAt: new Date("2026-06-20T12:00:00.000Z"),
      labelDir,
      manualIds: ["manual-grouping-conflict"],
    })

    expect(diagnostics).toEqual(expect.objectContaining({
      conflictCount: 1,
      generatedAt: "2026-06-20T12:00:00.000Z",
      missedPairCount: 1,
    }))
    expect(diagnostics.conflicts[0]).toEqual(expect.objectContaining({
      expectedPartKey: "same-part",
      missedPairCount: 1,
    }))
    expect(diagnostics.conflicts[0].currentGroups[0]).toEqual(expect.objectContaining({
      groupId: "group-with-unlabeled-row",
      unlabeledRows: [expect.objectContaining({ itemId: "row-unlabeled" })],
    }))
    expect(diagnostics.decisionRows).toEqual([expect.objectContaining({
      expectedPartKey: "same-part",
      itemId: "row-unlabeled",
      manualId: "manual-grouping-conflict",
      referenceItemIds: ["row-1", "row-2"],
    })])
    expect(diagnostics.decisionRows[0].decisionId).toMatch(/^[a-f0-9]{16}$/)
  })

  it("writes a targeted review queue for missed same-part pairs", async () => {
    const tempDir = await createTempDir()
    const manualId = "manual-review"
    const sourceDir = path.join(tempDir, "sources")
    const sessionPath = path.join(sourceDir, `${manualId}.current-app-result.bagit-session.json`)
    const reportDir = path.join(tempDir, "report")
    const labelDir = path.join(tempDir, "labels")
    const queueDir = path.join(tempDir, "queue")

    await writeJson(sessionPath, createPlateLengthSession())

    const { report } = await writePartMatchReport({
      enableLabelGatedNearMatches: true,
      generatedAt: new Date("2026-06-20T10:00:00.000Z"),
      manualId,
      outputDir: reportDir,
      sessionPath,
    })
    await writeJson(path.join(labelDir, `${manualId}.json`), {
      labels: report.rows.map((row) => label(row.itemId, "same-plate", {
        cropHash: row.cropHash,
        role: "active",
      })),
      manualId,
      reportPath: path.join(reportDir, "report.json"),
      status: "active",
    })

    const { queue } = await writePartMatchReviewQueue({
      generatedAt: new Date("2026-06-20T10:00:00.000Z"),
      hardNegativeLimit: 0,
      labelDir,
      manualIds: [manualId],
      outputDir: queueDir,
      sourceDir,
    })
    const indexHtml = await readFile(path.join(queueDir, "index.html"), "utf8")
    const dataScript = await readFile(path.join(queueDir, "review-queue-data.js"), "utf8")
    const appScript = await readFile(path.join(queueDir, "review-queue.js"), "utf8")

    expect(queue.totals.byBucket).toEqual({
      "aspect-ratio-high-alpha": 1,
    })
    expect(indexHtml).toContain("part-match-review-queue")
    expect(dataScript).toContain("PART_MATCH_REVIEW_QUEUE_DATA")
    expect(dataScript).toContain("same-plate")
    expect(appScript).toContain("Same")
    expect(appScript).toContain("Different")
    expect(appScript).toContain("Bad crop")
    expect(appScript).toContain("Download decisions")

    const decisionPath = path.join(tempDir, "reviewed-decisions.json")
    await writeJson(decisionPath, {
      decisions: [{
        left: queue.pairs[0].left.itemId,
        manualId,
        right: queue.pairs[0].right.itemId,
        status: "same",
      }],
      queueGeneratedAt: queue.generatedAt,
    })

    const { queue: nextQueue } = await writePartMatchReviewQueue({
      excludeDecisionPaths: [decisionPath],
      generatedAt: new Date("2026-06-20T11:00:00.000Z"),
      hardNegativeLimit: 0,
      labelDir,
      manualIds: [manualId],
      outputDir: queueDir,
      sourceDir,
    })

    expect(nextQueue.pairCount).toBe(0)

    const scorerConfigPath = path.join(tempDir, "scorer-config.json")

    await writeJson(scorerConfigPath, {
      featureNames: [],
      intercept: 10,
      normalization: {},
      threshold: 0.99,
      version: "test",
      weights: {},
    })

    const { queue: scorerQueue } = await writePartMatchReviewQueue({
      generatedAt: new Date("2026-06-20T12:00:00.000Z"),
      hardNegativeLimit: 0,
      labelDir,
      manualIds: [manualId],
      outputDir: queueDir,
      scorerConfigPath,
      sourceDir,
    })

    expect(scorerQueue.pairCount).toBe(0)
  })

  it("discovers private part-match decision exports recursively", async () => {
    const tempDir = await createTempDir()
    const firstDecisionPath = path.join(tempDir, "queue-a", "decisions-a.json")
    const secondDecisionPath = path.join(tempDir, "queue-b", "nested", "decisions-b.json")

    await writeJson(firstDecisionPath, {
      decisions: [{
        left: "row-1",
        manualId: "manual-a",
        right: "row-2",
        status: "different",
      }],
    })
    await writeJson(secondDecisionPath, {
      decisions: [],
    })
    await writeJson(path.join(tempDir, "labels", "manual-a.json"), {
      labels: [],
      manualId: "manual-a",
      reportPath: "report.json",
      status: "active",
    })

    await expect(discoverPartMatchDecisionPaths(path.join(tempDir, "missing"))).resolves.toEqual([])
    await expect(discoverPartMatchDecisionPaths(tempDir)).resolves.toEqual([
      secondDecisionPath,
      firstDecisionPath,
    ].sort())
  })

  it("selects only safe verifier lab candidates that improve recall", () => {
    const baseline = verifierCandidate("baseline-current", {
      falseGroups: 0,
      falsePositivePairs: 0,
      matchedPairs: 100,
      missedPairs: 30,
    })
    const unsafeBetter = verifierCandidate("unsafe-better", {
      falseGroups: 1,
      falsePositivePairs: 0,
      matchedPairs: 120,
      missedPairs: 10,
    })
    const safeSame = verifierCandidate("safe-same", {
      falseGroups: 0,
      falsePositivePairs: 0,
      matchedPairs: 100,
      missedPairs: 30,
    })
    const safeBetter = verifierCandidate("safe-better", {
      falseGroups: 0,
      falsePositivePairs: 0,
      matchedPairs: 112,
      missedPairs: 18,
    })

    expect(selectPartMatchVerifierPromotionCandidate(baseline, [
      unsafeBetter,
      safeSame,
      safeBetter,
    ])).toEqual({
      reason: "safe-better safely recovers 12 more group pairs",
      selectedCandidateName: "safe-better",
      status: "promote-candidate",
    })
    expect(selectPartMatchVerifierPromotionCandidate(baseline, [
      unsafeBetter,
      safeSame,
    ])).toEqual({
      reason: "no safe candidate improves group recall over baseline",
      selectedCandidateName: null,
      status: "keep-current",
    })
  })

  it("writes verifier lab baseline miss diagnostics", async () => {
    const tempDir = await createTempDir()
    const manualId = "manual-verifier-diagnostics"
    const sourceDir = path.join(tempDir, "sources")
    const sessionPath = path.join(sourceDir, `${manualId}.current-app-result.bagit-session.json`)
    const reportDir = path.join(tempDir, "report")
    const labelDir = path.join(tempDir, "labels")
    const outputDir = path.join(tempDir, "verifier-lab")

    await writeJson(sessionPath, createPlateLengthSession())

    const { report } = await writePartMatchReport({
      enableLabelGatedNearMatches: true,
      generatedAt: new Date("2026-06-20T10:00:00.000Z"),
      manualId,
      outputDir: reportDir,
      sessionPath,
    })
    await writeJson(path.join(labelDir, `${manualId}.json`), {
      labels: report.rows.map((row) => label(row.itemId, "same-plate", {
        cropHash: row.cropHash,
        role: "active",
      })),
      manualId,
      reportPath: path.join(reportDir, "report.json"),
      status: "active",
    })

    const labReport = await runPartMatchVerifierLab({
      baselineOnly: true,
      generatedAt: new Date("2026-06-20T12:00:00.000Z"),
      labelDir,
      manualIds: [manualId],
      outputDir,
      sourceDir,
    })
    const summaryJson = JSON.parse(await readFile(path.join(outputDir, "lab-summary.json"), "utf8"))
    const indexHtml = await readFile(path.join(outputDir, "index.html"), "utf8")

    expect(labReport.baseline.diagnostics?.sameMissedByManual).toEqual({
      [manualId]: 1,
    })
    expect(summaryJson.baseline.diagnostics.topNearThresholdMisses[0]).toEqual(expect.objectContaining({
      leftKey: "same-plate",
      manualId,
      rightKey: "same-plate",
    }))
    expect(indexHtml).toContain("Baseline Miss Diagnostics")
    expect(indexHtml).toContain("same-plate")
  }, 30000)

  it("uses grouping conflict decisions as scorer training examples", async () => {
    const tempDir = await createTempDir()
    const manualId = "manual-grouping-decision-training"
    const sourceDir = path.join(tempDir, "sources")
    const sessionPath = path.join(sourceDir, `${manualId}.current-app-result.bagit-session.json`)
    const reportDir = path.join(tempDir, "report")
    const labelDir = path.join(tempDir, "labels")
    const decisionPath = path.join(tempDir, "grouping-conflict-decisions.json")
    const outputPath = path.join(tempDir, "scorer-config.json")

    await writeJson(sessionPath, createSession())

    const { report } = await writePartMatchReport({
      generatedAt: new Date("2026-06-20T10:00:00.000Z"),
      manualId,
      outputDir: reportDir,
      sessionPath,
    })
    const sameReference = report.rows[0].itemId
    const sameCandidate = report.rows[1].itemId
    const differentReference = report.rows[2].itemId

    await writeJson(path.join(labelDir, `${manualId}.json`), {
      labels: [
        label(sameReference, "known-same", {
          cropHash: report.rows[0].cropHash,
          role: "active",
        }),
        label(differentReference, "known-different", {
          cropHash: report.rows[2].cropHash,
          role: "active",
        }),
      ],
      manualId,
      reportPath: path.join(reportDir, "report.json"),
      status: "active",
    })
    await writeJson(decisionPath, {
      decisions: [{
        decisionId: "decision-1",
        expectedPartKey: "known-same",
        itemId: sameCandidate,
        manualId,
        referenceItemIds: [sameReference],
        status: "same",
      }],
      generatedAt: "2026-06-20T11:00:00.000Z",
      type: "part-match-grouping-conflict-decisions",
    })

    const result = await trainPartMatchScorer({
      decisionPaths: [decisionPath],
      labelDir,
      maxTreeDepth: 2,
      minTreeLeafSize: 1,
      outputPath,
      sourceDir,
    })
    const writtenConfig = JSON.parse(await readFile(outputPath, "utf8"))

    expect(result.examples).toEqual(expect.arrayContaining([
      expect.objectContaining({
        left: sameCandidate,
        manualId,
        right: sameReference,
        source: `grouping-decision:${decisionPath}:known-same`,
        target: 1,
      }),
      expect.objectContaining({
        left: sameReference,
        manualId,
        right: differentReference,
        source: "label",
        target: 0,
      }),
    ]))
    expect(result.pairScore.falsePositivePairs).toBe(0)
    expect(writtenConfig.kind).toBe("decision-tree")
  })

  it("can prefer review decisions over stale label pair conflicts", async () => {
    const tempDir = await createTempDir()
    const manualId = "manual-review-decision-conflict-training"
    const sourceDir = path.join(tempDir, "sources")
    const sessionPath = path.join(sourceDir, `${manualId}.current-app-result.bagit-session.json`)
    const reportDir = path.join(tempDir, "report")
    const labelDir = path.join(tempDir, "labels")
    const decisionPath = path.join(tempDir, "review-decisions.json")
    const outputPath = path.join(tempDir, "scorer-config.json")

    await writeJson(sessionPath, createSession())

    const { report } = await writePartMatchReport({
      generatedAt: new Date("2026-06-20T10:00:00.000Z"),
      manualId,
      outputDir: reportDir,
      sessionPath,
    })
    const firstItem = report.rows[0].itemId
    const secondItem = report.rows[1].itemId
    const thirdItem = report.rows[2].itemId

    await writeJson(path.join(labelDir, `${manualId}.json`), {
      labels: [
        label(firstItem, "old-a", {
          cropHash: report.rows[0].cropHash,
          role: "active",
        }),
        label(secondItem, "old-b", {
          cropHash: report.rows[1].cropHash,
          role: "active",
        }),
        label(thirdItem, "old-c", {
          cropHash: report.rows[2].cropHash,
          role: "active",
        }),
      ],
      manualId,
      reportPath: path.join(reportDir, "report.json"),
      status: "active",
    })
    await writeJson(decisionPath, {
      decisions: [{
        bucket: "other",
        kind: "missed-same",
        left: firstItem,
        manualId,
        right: secondItem,
        status: "same",
      }],
      generatedAt: "2026-06-20T11:00:00.000Z",
      type: "part-match-review-decisions",
    })

    await expect(trainPartMatchScorer({
      decisionPaths: [decisionPath],
      labelDir,
      maxTreeDepth: 2,
      minTreeLeafSize: 1,
      outputPath,
      sourceDir,
    })).rejects.toThrow(/Conflicting part-match training labels/)

    const result = await trainPartMatchScorer({
      decisionConflictPolicy: "prefer-decisions",
      decisionPaths: [decisionPath],
      labelDir,
      maxTreeDepth: 2,
      minTreeLeafSize: 1,
      outputPath,
      sourceDir,
    })

    expect(result.examples).toEqual(expect.arrayContaining([
      expect.objectContaining({
        left: firstItem,
        manualId,
        right: secondItem,
        source: `decision:${decisionPath}`,
        target: 1,
      }),
      expect.objectContaining({
        left: firstItem,
        manualId,
        right: thirdItem,
        source: "label",
        target: 0,
      }),
    ]))
    expect(result.examples).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        left: firstItem,
        manualId,
        right: secondItem,
        source: "label",
        target: 0,
      }),
    ]))
  })

  it("fits zero-negative evidence rules on top of an existing scorer config", async () => {
    const tempDir = await createTempDir()
    const manualId = "manual-base-scorer-training"
    const sourceDir = path.join(tempDir, "sources")
    const sessionPath = path.join(sourceDir, `${manualId}.current-app-result.bagit-session.json`)
    const reportDir = path.join(tempDir, "report")
    const labelDir = path.join(tempDir, "labels")
    const baseConfigPath = path.join(tempDir, "base-scorer-config.json")
    const outputPath = path.join(tempDir, "scorer-config.json")

    const session = createScaledSession()

    session.stepDetectionResult.callouts.push(
      callout("callout-3", 3, [partItem("item-3", plateMask(4, 2, 10), 1)]),
    )

    await writeJson(sessionPath, session)

    const { report } = await writePartMatchReport({
      generatedAt: new Date("2026-06-20T10:00:00.000Z"),
      manualId,
      outputDir: reportDir,
      sessionPath,
    })

    await writeJson(path.join(labelDir, `${manualId}.json`), {
      labels: [
        label(report.rows[0].itemId, "same-plate", {
          cropHash: report.rows[0].cropHash,
          role: "active",
        }),
        label(report.rows[1].itemId, "same-plate", {
          cropHash: report.rows[1].cropHash,
          role: "active",
        }),
        label(report.rows[2].itemId, "different-plate", {
          cropHash: report.rows[2].cropHash,
          role: "active",
        }),
      ],
      manualId,
      reportPath: path.join(reportDir, "report.json"),
      status: "active",
    })
    await writeJson(baseConfigPath, {
      featureNames: [],
      intercept: 10,
      kind: "linear",
      metadata: {
        model: "base-test",
      },
      normalization: {},
      threshold: 0.99,
      version: "test",
      weights: {},
    })

    const result = await trainPartMatchScorer({
      baseScorerConfigPath: baseConfigPath,
      labelDir,
      minEvidenceRuleGain: 1,
      outputPath,
      sourceDir,
    })
    const writtenConfig = JSON.parse(await readFile(outputPath, "utf8"))

    expect(result.pairScore).toEqual({
      falsePositivePairs: 0,
      matchedPositivePairs: 1,
      negativePairs: 2,
      positivePairs: 1,
    })
    expect(writtenConfig).toEqual(expect.objectContaining({
      evidenceRules: expect.arrayContaining([expect.objectContaining({
        conditions: expect.any(Array),
      })]),
      kind: "linear",
    }))
    expect(writtenConfig.metadata).toEqual(expect.objectContaining({
      baseScorerConfigPath: baseConfigPath,
      evidenceRuleCount: expect.any(Number),
      model: "base-test+evidence-rules",
    }))
  })

  it("requires cross-manual support when requested for evidence rules", async () => {
    const tempDir = await createTempDir()
    const manualId = "manual-evidence-manual-support"
    const sourceDir = path.join(tempDir, "sources")
    const sessionPath = path.join(sourceDir, `${manualId}.current-app-result.bagit-session.json`)
    const reportDir = path.join(tempDir, "report")
    const labelDir = path.join(tempDir, "labels")
    const baseConfigPath = path.join(tempDir, "base-scorer-config.json")
    const outputPath = path.join(tempDir, "scorer-config.json")

    const session = createScaledSession()

    session.stepDetectionResult.callouts.push(
      callout("callout-3", 3, [partItem("item-3", plateMask(4, 2, 10), 1)]),
    )

    await writeJson(sessionPath, session)

    const { report } = await writePartMatchReport({
      generatedAt: new Date("2026-06-24T16:00:00.000Z"),
      manualId,
      outputDir: reportDir,
      sessionPath,
    })

    await writeJson(path.join(labelDir, `${manualId}.json`), {
      labels: [
        label(report.rows[0].itemId, "same-plate", {
          cropHash: report.rows[0].cropHash,
          role: "active",
        }),
        label(report.rows[1].itemId, "same-plate", {
          cropHash: report.rows[1].cropHash,
          role: "active",
        }),
        label(report.rows[2].itemId, "different-plate", {
          cropHash: report.rows[2].cropHash,
          role: "active",
        }),
      ],
      manualId,
      reportPath: path.join(reportDir, "report.json"),
      status: "active",
    })
    await writeJson(baseConfigPath, {
      featureNames: [],
      intercept: 10,
      kind: "linear",
      metadata: {
        model: "base-test",
      },
      normalization: {},
      threshold: 0.99,
      version: "test",
      weights: {},
    })

    const result = await trainPartMatchScorer({
      baseScorerConfigPath: baseConfigPath,
      labelDir,
      minEvidenceRuleGain: 1,
      minEvidenceRuleManualSupport: 2,
      outputPath,
      sourceDir,
    })
    const writtenConfig = JSON.parse(await readFile(outputPath, "utf8"))

    expect(result.pairScore).toEqual({
      falsePositivePairs: 2,
      matchedPositivePairs: 1,
      negativePairs: 2,
      positivePairs: 1,
    })
    expect(writtenConfig).toEqual(expect.objectContaining({
      evidenceRules: [],
      kind: "linear",
    }))
    expect(writtenConfig.metadata).toEqual(expect.objectContaining({
      evidenceRuleCount: 0,
      evidenceRuleManualSupport: 2,
    }))
  })

  it("fits zero-negative supplemental rules for raw scorer misses", async () => {
    const tempDir = await createTempDir()
    const manualId = "manual-supplemental-scorer-training"
    const sourceDir = path.join(tempDir, "sources")
    const sessionPath = path.join(sourceDir, `${manualId}.current-app-result.bagit-session.json`)
    const reportDir = path.join(tempDir, "report")
    const labelDir = path.join(tempDir, "labels")
    const baseConfigPath = path.join(tempDir, "base-scorer-config.json")
    const outputPath = path.join(tempDir, "scorer-config.json")

    await writeJson(sessionPath, createSession())

    const { report } = await writePartMatchReport({
      generatedAt: new Date("2026-06-20T10:00:00.000Z"),
      manualId,
      outputDir: reportDir,
      sessionPath,
    })

    await writeJson(path.join(labelDir, `${manualId}.json`), {
      labels: [
        label(report.rows[0].itemId, "same-square", {
          cropHash: report.rows[0].cropHash,
          role: "active",
        }),
        label(report.rows[1].itemId, "same-square", {
          cropHash: report.rows[1].cropHash,
          role: "active",
        }),
        label(report.rows[2].itemId, "different-diagonal", {
          cropHash: report.rows[2].cropHash,
          role: "active",
        }),
      ],
      manualId,
      reportPath: path.join(reportDir, "report.json"),
      status: "active",
    })
    await writeJson(baseConfigPath, {
      featureNames: [],
      intercept: -10,
      kind: "linear",
      metadata: {
        model: "rejecting-base-test",
      },
      normalization: {},
      threshold: 0.99,
      version: "test",
      weights: {},
    })

    const result = await trainPartMatchScorer({
      baseScorerConfigPath: baseConfigPath,
      labelDir,
      maxEvidenceRuleConditions: 2,
      minEvidenceRuleConditions: 1,
      minEvidenceRuleGain: 1,
      outputPath,
      sourceDir,
    })
    const writtenConfig = JSON.parse(await readFile(outputPath, "utf8"))

    expect(result.pairScore).toEqual({
      falsePositivePairs: 0,
      matchedPositivePairs: 1,
      negativePairs: 2,
      positivePairs: 1,
    })
    expect(writtenConfig.supplementalRules).toEqual(
      expect.arrayContaining([expect.objectContaining({
        conditions: expect.any(Array),
      })]),
    )
    expect(writtenConfig.metadata).toEqual(expect.objectContaining({
      supplementalRuleCount: expect.any(Number),
    }))
  })

  it("preserves base supplemental rules when fitting residual scorer rules", async () => {
    const tempDir = await createTempDir()
    const manualId = "manual-preserve-supplemental-rules"
    const sourceDir = path.join(tempDir, "sources")
    const sessionPath = path.join(sourceDir, `${manualId}.current-app-result.bagit-session.json`)
    const reportDir = path.join(tempDir, "report")
    const labelDir = path.join(tempDir, "labels")
    const baseConfigPath = path.join(tempDir, "base-scorer-config.json")
    const outputPath = path.join(tempDir, "scorer-config.json")
    const baseSupplementalRule = {
      conditions: [{
        featureName: "hasLuma",
        operator: "gt",
        threshold: 2,
      }],
    }

    await writeJson(sessionPath, createSession())

    const { report } = await writePartMatchReport({
      generatedAt: new Date("2026-06-24T11:10:00.000Z"),
      manualId,
      outputDir: reportDir,
      sessionPath,
    })

    await writeJson(path.join(labelDir, `${manualId}.json`), {
      labels: [
        label(report.rows[0].itemId, "same-square", {
          cropHash: report.rows[0].cropHash,
          role: "active",
        }),
        label(report.rows[1].itemId, "same-square", {
          cropHash: report.rows[1].cropHash,
          role: "active",
        }),
        label(report.rows[2].itemId, "different-diagonal", {
          cropHash: report.rows[2].cropHash,
          role: "active",
        }),
      ],
      manualId,
      reportPath: path.join(reportDir, "report.json"),
      status: "active",
    })
    await writeJson(baseConfigPath, {
      featureNames: [],
      intercept: -10,
      kind: "linear",
      metadata: {
        model: "base-with-supplemental-test",
      },
      normalization: {},
      supplementalRules: [baseSupplementalRule],
      threshold: 0.99,
      version: "test",
      weights: {},
    })

    const result = await trainPartMatchScorer({
      baseScorerConfigPath: baseConfigPath,
      labelDir,
      maxEvidenceRules: 0,
      outputPath,
      sourceDir,
    })
    const writtenConfig = JSON.parse(await readFile(outputPath, "utf8"))

    expect(result.pairScore.matchedPositivePairs).toBe(0)
    expect(writtenConfig.supplementalRules).toEqual([baseSupplementalRule])
    expect(writtenConfig.metadata).toEqual(expect.objectContaining({
      supplementalRuleCount: 1,
    }))
  })

  it("trains excluded rows as negatives against unlabeled rows", async () => {
    const tempDir = await createTempDir()
    const manualId = "manual-excluded-unlabeled-training"
    const sourceDir = path.join(tempDir, "sources")
    const sessionPath = path.join(sourceDir, `${manualId}.current-app-result.bagit-session.json`)
    const reportDir = path.join(tempDir, "report")
    const labelDir = path.join(tempDir, "labels")
    const baseConfigPath = path.join(tempDir, "base-scorer-config.json")
    const outputPath = path.join(tempDir, "scorer-config.json")

    await writeJson(sessionPath, createExcludedUnlabeledTrainingSession())

    const { report } = await writePartMatchReport({
      generatedAt: new Date("2026-06-24T10:40:00.000Z"),
      manualId,
      outputDir: reportDir,
      sessionPath,
    })
    await writeJson(path.join(labelDir, `${manualId}.json`), {
      labels: [
        label(report.rows[0].itemId, "", {
          cropHash: report.rows[0].cropHash,
          role: "excluded",
        }),
        label(report.rows[2].itemId, "same-diagonal", {
          cropHash: report.rows[2].cropHash,
          role: "active",
        }),
        label(report.rows[3].itemId, "same-diagonal", {
          cropHash: report.rows[3].cropHash,
          role: "active",
        }),
      ],
      manualId,
      reportPath: path.join(reportDir, "report.json"),
      status: "active",
    })
    await writeJson(baseConfigPath, {
      featureNames: [],
      intercept: -10,
      kind: "linear",
      metadata: {
        model: "rejecting-base-test",
      },
      normalization: {},
      threshold: 0.99,
      version: "test",
      weights: {},
    })

    const result = await trainPartMatchScorer({
      baseScorerConfigPath: baseConfigPath,
      labelDir,
      maxEvidenceRuleConditions: 2,
      minEvidenceRuleConditions: 1,
      minEvidenceRuleGain: 1,
      outputPath,
      sourceDir,
    })

    expect(result.examples).toEqual(expect.arrayContaining([expect.objectContaining({
      left: report.rows[0].itemId,
      right: report.rows[1].itemId,
      source: "excluded-unlabeled-row",
      target: 0,
    })]))
    expect(result.pairScore).toEqual({
      falsePositivePairs: 0,
      matchedPositivePairs: 1,
      negativePairs: 3,
      positivePairs: 1,
    })
  })

  it("runs per-manual scorer holdout analysis", async () => {
    const tempDir = await createTempDir()
    const sourceDir = path.join(tempDir, "sources")
    const labelDir = path.join(tempDir, "labels")
    const outputDir = path.join(tempDir, "holdout")
    const manualIds = ["manual-holdout-a", "manual-holdout-b"]

    for (const manualId of manualIds) {
      const sessionPath = path.join(sourceDir, `${manualId}.current-app-result.bagit-session.json`)
      const reportDir = path.join(tempDir, manualId)

      await writeJson(sessionPath, createSession())

      const { report } = await writePartMatchReport({
        generatedAt: new Date("2026-06-20T10:00:00.000Z"),
        manualId,
        outputDir: reportDir,
        sessionPath,
      })

      await writeJson(path.join(labelDir, `${manualId}.json`), {
        labels: [
          label(report.rows[0].itemId, "same-square", {
            cropHash: report.rows[0].cropHash,
            role: "active",
          }),
          label(report.rows[1].itemId, "same-square", {
            cropHash: report.rows[1].cropHash,
            role: "active",
          }),
          label(report.rows[2].itemId, "different-diagonal", {
            cropHash: report.rows[2].cropHash,
            role: "active",
          }),
        ],
        manualId,
        reportPath: path.join(reportDir, "report.json"),
        status: "active",
      })
    }

    const analysis = await runPartMatchHoldoutAnalysis({
      generatedAt: new Date("2026-06-20T13:00:00.000Z"),
      labelDir,
      manualIds,
      maxTreeDepth: 2,
      minTreeLeafSize: 1,
      outputDir,
      sourceDir,
    })
    const persisted = JSON.parse(await readFile(path.join(outputDir, "holdout-analysis.json"), "utf8"))
    const formatted = formatPartMatchHoldoutAnalysis(analysis)

    expect(analysis.folds).toHaveLength(2)
    expect(analysis.totals.holdout.groupTotals).toEqual(expect.objectContaining({
      expectedPairs: 2,
      falseGroups: 0,
    }))
    expect(analysis.totals.holdout.pairTotals.falsePositivePairs).toBe(0)
    expect(persisted.generatedAt).toBe("2026-06-20T13:00:00.000Z")
    expect(formatted).toContain("Part match holdout analysis")
    expect(formatted).toContain("unsafe holdout folds: none")
  })

  it("preloads existing labels into the visual annotation workbench", async () => {
    const tempDir = await createTempDir()
    const sessionPath = path.join(tempDir, "manual.bagit-session.json")
    const outputDir = path.join(tempDir, "report")
    const labelDir = path.join(tempDir, "labels")

    await writeJson(sessionPath, createSession())
    await writeJson(path.join(labelDir, "manual-stable.json"), {
      labels: [
        label("bag-1-p1:callout-1:item-1:x1", "custom-plate", {
          cropHash: "old-crop",
          role: "active",
        }),
      ],
      manualId: "manual-stable",
      reportPath: "old/report.json",
      status: "active",
    })

    const { report } = await writePartMatchReport({
      generatedAt: new Date("2026-06-20T10:00:00.000Z"),
      labelDir,
      manualId: "manual-stable",
      outputDir,
      sessionPath,
    })
    const dataScript = await readFile(path.join(outputDir, "workbench-data.js"), "utf8")

    expect(report.manualId).toBe("manual-stable")
    expect(report.labels).toEqual(expect.objectContaining({
      manualId: "manual-stable",
      status: "active",
      total: 1,
    }))
    expect(report.rows[0].label).toEqual(expect.objectContaining({
      expectedPartKey: "custom-plate",
      role: "active",
    }))
    expect(dataScript).toContain('"hasExistingLabels": true')
    expect(dataScript).toContain("custom-plate")
  })

  it("evaluates gate labels for false groups, missed pairs, missing rows, crop drift, and stale reports", async () => {
    const tempDir = await createTempDir()
    const reportPath = path.join(tempDir, "report.json")
    const labelPath = path.join(tempDir, "labels.json")

    await writeJson(reportPath, {
      groups: [{
        groupId: "group-false",
        rowIds: ["row-1", "row-2"],
      }],
      rows: [
        rowSummary("row-1", { cropHash: "current-1" }),
        rowSummary("row-2", { cropHash: "current-2" }),
        rowSummary("row-3", { cropHash: "current-3" }),
      ],
      versions: {
        currentPartExtractor: CALLOUT_PART_EXTRACTOR_VERSION,
        currentPartMatcher: PART_MATCHER_VERSION,
        partExtractor: "old-extractor",
        partExtractorCurrent: false,
        partMatcher: "old-matcher",
        partMatcherCurrent: false,
      },
    })
    await writeJson(labelPath, {
      labels: [
        label("row-1", "plate-1x3", { cropHash: "stale-1" }),
        label("row-2", "plate-1x4"),
        label("row-3", "plate-1x4"),
        label("row-missing", "plate-2x2"),
      ],
      manualId: "manual",
      reportPath,
      status: "gate",
    })

    const evaluation = evaluatePartMatchLabelFile(readPartMatchLabelSet(labelPath))
    const categories = evaluation.issues.map((issue) => issue.category)

    expect(evaluation.failed).toBe(true)
    expect(categories).toEqual(expect.arrayContaining([
      "crop-drift",
      "false-group",
      "missing-row",
      "missed-pair",
      "stale-input",
      "stale-matcher",
    ]))
  })

  it("treats excluded label rows as singleton hard negatives", async () => {
    const tempDir = await createTempDir()
    const reportPath = path.join(tempDir, "report.json")
    const labelPath = path.join(tempDir, "labels.json")

    await writeJson(reportPath, {
      groups: [{
        groupId: "group-excluded",
        rowIds: ["row-1", "row-excluded"],
      }],
      rows: [
        rowSummary("row-1"),
        rowSummary("row-excluded"),
      ],
      versions: {
        partExtractorCurrent: true,
        partMatcherCurrent: true,
      },
    })
    await writeJson(labelPath, {
      labels: [
        label("row-1", "brick"),
        label("row-excluded", "", { role: "excluded" }),
      ],
      manualId: "manual",
      reportPath,
      status: "gate",
    })

    const evaluation = evaluatePartMatchLabelFile(readPartMatchLabelSet(labelPath))

    expect(evaluation.falseGroups).toBe(1)
    expect(evaluation.issues[0]?.message).toContain("row-excluded")
  })

  it("keeps active labels score-only even when issues are present", async () => {
    const tempDir = await createTempDir()
    const reportPath = path.join(tempDir, "report.json")
    const labelPath = path.join(tempDir, "labels.json")

    await writeJson(reportPath, {
      groups: [],
      rows: [
        rowSummary("row-1"),
        rowSummary("row-2"),
      ],
      versions: {
        partExtractorCurrent: true,
        partMatcherCurrent: true,
      },
    })
    await writeJson(labelPath, {
      labels: [
        label("row-1", "brick"),
        label("row-2", "brick"),
      ],
      manualId: "manual",
      reportPath,
      status: "active",
    })

    const evaluation = evaluatePartMatchLabelFile(readPartMatchLabelSet(labelPath))

    expect(evaluation.missedPairs).toBe(1)
    expect(evaluation.failed).toBe(false)
  })

  it("does not require same-callout rows to be grouped", async () => {
    const tempDir = await createTempDir()
    const reportPath = path.join(tempDir, "report.json")
    const labelPath = path.join(tempDir, "labels.json")

    await writeJson(reportPath, {
      groups: [],
      rows: [
        rowSummary("row-1", { calloutId: "callout-1" }),
        rowSummary("row-2", { calloutId: "callout-1" }),
        rowSummary("row-3", { calloutId: "callout-2" }),
      ],
      versions: {
        partExtractorCurrent: true,
        partMatcherCurrent: true,
      },
    })
    await writeJson(labelPath, {
      labels: [
        label("row-1", "brick"),
        label("row-2", "brick"),
        label("row-3", "brick"),
      ],
      manualId: "manual",
      reportPath,
      status: "gate",
    })

    const evaluation = evaluatePartMatchLabelFile(readPartMatchLabelSet(labelPath))

    expect(evaluation.expectedPairs).toBe(2)
    expect(evaluation.missedPairs).toBe(2)
    expect(evaluation.issues.map((issue) => issue.message))
      .not.toContain("row-1::row-2 expected as brick.")
  })

  it("rejects duplicate label item ids", async () => {
    const tempDir = await createTempDir()
    const labelPath = path.join(tempDir, "labels.json")

    await writeJson(labelPath, {
      labels: [
        label("row-1", "brick"),
        label("row-1", "brick"),
      ],
      manualId: "manual",
      reportPath: path.join(tempDir, "report.json"),
      status: "gate",
    })

    expect(() => readPartMatchLabelSet(labelPath)).toThrow(/duplicate itemId row-1/)
  })

  it("freezes label skeletons while preserving existing notes and roles", async () => {
    const tempDir = await createTempDir()
    const reportPath = path.join(tempDir, "report.json")
    const existingPath = path.join(tempDir, "labels.json")
    const report = {
      groups: [{
        groupId: "group-1",
        rowIds: ["row-1", "row-2"],
      }],
      manualId: "manual",
      rows: [
        rowSummary("row-1", { cropHash: "new-1" }),
        rowSummary("row-2", { cropHash: "new-2" }),
        rowSummary("row-3", { cropHash: "new-3" }),
      ],
    }

    await writeJson(existingPath, {
      labels: [{
        cropHash: "old-1",
        expectedPartKey: "custom-key",
        itemId: "row-1",
        note: "keep note",
        role: "gate",
      }],
      manualId: "manual",
      reportPath,
      status: "active",
    })

    const frozen = buildFrozenPartMatchLabelFile({
      existingLabelPath: existingPath,
      manualId: "manual",
      report,
      reportPath,
      status: "active",
    })

    expect(frozen.labels).toEqual([
      {
        cropHash: "new-1",
        expectedPartKey: "custom-key",
        itemId: "row-1",
        note: "keep note",
        role: "gate",
      },
      {
        cropHash: "new-2",
        expectedPartKey: "part-001",
        itemId: "row-2",
        role: "active",
      },
      {
        cropHash: "new-3",
        expectedPartKey: "",
        itemId: "row-3",
        role: "excluded",
      },
    ])
  })
})

async function createTempDir() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "bag-it-part-match-"))

  tempDirs.push(tempDir)

  return tempDir
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function createSession() {
  return {
    manual: {
      fileName: "manual.pdf",
      lastModified: 123,
      sizeBytes: 456,
    },
    stepDetectionResult: {
      callouts: [
        callout("callout-1", 1, [partItem("item-1", fullMask(), 2)]),
        callout("callout-2", 2, [partItem("item-2", fullMask(), 3)]),
        callout("callout-3", 3, [partItem("item-3", diagonalMask(), 1)]),
      ],
      detectorVersion: "detector-test",
      pageAttentionItems: [],
      pageCount: 1,
      pageLimit: null,
      pagePreviews: [{
        height: 800,
        imageDataUrl: "data:image/png;base64,page",
        pageNumber: 1,
        width: 600,
      }],
      partExtractorVersion: CALLOUT_PART_EXTRACTOR_VERSION,
      scannedPageNumbers: [1],
      skippedPageNumbers: [],
      status: "detected",
    },
  }
}

function createExcludedUnlabeledTrainingSession() {
  return {
    manual: {
      fileName: "manual.pdf",
      lastModified: 123,
      sizeBytes: 456,
    },
    stepDetectionResult: {
      callouts: [
        callout("callout-1", 1, [partItem("item-1", fullMask(), 1)]),
        callout("callout-2", 2, [partItem("item-2", fullMask(), 1)]),
        callout("callout-3", 3, [partItem("item-3", diagonalMask(), 1)]),
        callout("callout-4", 4, [partItem("item-4", diagonalMask(), 1)]),
      ],
      detectorVersion: "detector-test",
      pageAttentionItems: [],
      pageCount: 1,
      pageLimit: null,
      pagePreviews: [{
        height: 800,
        imageDataUrl: "data:image/png;base64,page",
        pageNumber: 1,
        width: 600,
      }],
      partExtractorVersion: CALLOUT_PART_EXTRACTOR_VERSION,
      scannedPageNumbers: [1],
      skippedPageNumbers: [],
      status: "detected",
    },
  }
}

function createScaledSession() {
  return {
    manual: {
      fileName: "manual.pdf",
      lastModified: 123,
      sizeBytes: 456,
    },
    stepDetectionResult: {
      callouts: [
        callout("callout-1", 1, [partItem("item-1", plateMask(3, 2, 10), 2)]),
        callout("callout-2", 2, [partItem("item-2", plateMask(3, 2, 20), 3)]),
      ],
      detectorVersion: "detector-test",
      pageAttentionItems: [],
      pageCount: 1,
      pageLimit: null,
      pagePreviews: [{
        height: 800,
        imageDataUrl: "data:image/png;base64,page",
        pageNumber: 1,
        width: 600,
      }],
      partExtractorVersion: CALLOUT_PART_EXTRACTOR_VERSION,
      scannedPageNumbers: [1],
      skippedPageNumbers: [],
      status: "detected",
    },
  }
}

function createPlateLengthSession() {
  return {
    manual: {
      fileName: "manual.pdf",
      lastModified: 123,
      sizeBytes: 456,
    },
    stepDetectionResult: {
      callouts: [
        callout("callout-1", 1, [partItem("item-1", plateMask(3, 1, 12), 1)]),
        callout("callout-2", 2, [partItem("item-2", plateMask(4, 1, 12), 1)]),
      ],
      detectorVersion: "detector-test",
      pageAttentionItems: [],
      pageCount: 1,
      pageLimit: null,
      pagePreviews: [{
        height: 800,
        imageDataUrl: "data:image/png;base64,page",
        pageNumber: 1,
        width: 600,
      }],
      partExtractorVersion: CALLOUT_PART_EXTRACTOR_VERSION,
      scannedPageNumbers: [1],
      skippedPageNumbers: [],
      status: "detected",
    },
  }
}

function callout(id, stepIndex, partItems) {
  return {
    confidence: 0.92,
    crop: {
      imageDataUrl: `data:image/png;base64,${id}`,
      region: { height: 80, width: 140, x: 10, y: stepIndex * 90 },
    },
    id,
    indexOnPage: stepIndex - 1,
    inferredBackground: {
      confidence: 0.9,
      hex: "#ffffff",
      rgb: { b: 255, g: 255, r: 255 },
    },
    pageNumber: 1,
    partItems,
    sourceRegion: { height: 80, width: 140, x: 10, y: stepIndex * 90 },
    stepIndex,
  }
}

function partItem(id, mask, quantity) {
  return {
    confidence: 0.91,
    detectedColor: {
      confidence: 0.95,
      family: "green",
      manualClassId: "manual-green",
      manualClassTrusted: true,
      name: "Green",
      status: "exact",
      swatchHex: "#237841",
    },
    id,
    indexOnCallout: 0,
    partImage: {
      alphaMask: mask,
      imageDataUrl: `data:image/png;base64,${id}`,
      region: { height: mask.height, width: mask.width, x: 40, y: 20 },
    },
    partRegion: { height: mask.height, width: mask.width, x: 40, y: 20 },
    quantity: {
      confidence: 0.98,
      text: `${quantity}x`,
      value: quantity,
    },
    quantityLabel: {
      imageDataUrl: `data:image/png;base64,${id}-quantity`,
      region: { height: 10, width: 12, x: 20, y: 24 },
    },
    sourceRegion: { height: mask.height, width: mask.width, x: 40, y: 20 },
  }
}

function fullMask() {
  return {
    data: Array.from({ length: 16 }, () => 255),
    height: 4,
    width: 4,
  }
}

function diagonalMask() {
  return {
    data: Array.from({ length: 16 }, (_value, index) =>
      index % 5 === 0 ? 255 : 0
    ),
    height: 4,
    width: 4,
  }
}

function plateMask(studs, rows, unit) {
  const width = studs * unit
  const height = rows * unit
  const data = Array.from({ length: width * height }, () => 0)
  const baseTop = Math.floor(unit * 0.45)

  paintRegion(data, width, {
    height: height - baseTop,
    width,
    x: 0,
    y: baseTop,
  })

  for (let stud = 0; stud < studs; stud += 1) {
    paintRegion(data, width, {
      height: Math.max(2, Math.floor(unit * 0.32)),
      width: Math.max(2, Math.floor(unit * 0.5)),
      x: stud * unit + Math.floor(unit * 0.25),
      y: 0,
    })
  }

  return { data, height, width }
}

function paintRegion(data, width, region) {
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      data[y * width + x] = 255
    }
  }
}

function verifierCandidate(name, {
  falseGroups,
  falsePositivePairs,
  matchedPairs,
  missedPairs,
}) {
  return {
    analysis: {
      group: {
        cropDrifts: 0,
        expectedPairs: matchedPairs + missedPairs,
        falseGroups,
        matchedPairs,
        missedPairs,
      },
      pair: {
        falsePositivePairs,
        sameMatchedPairs: matchedPairs,
        sameMissedPairs: missedPairs,
      },
    },
    configPath: `${name}.json`,
    name,
    safe: falseGroups === 0 && falsePositivePairs === 0,
    status: name === "baseline-current" ? "baseline" : "trained",
  }
}

function rowSummary(rowId, options = {}) {
  return {
    bagId: options.bagId ?? "bag-1",
    calloutId: options.calloutId,
    cropHash: options.cropHash ?? `hash-${rowId}`,
    imageDataUrl: options.imageDataUrl,
    itemId: rowId,
    pageNumber: options.pageNumber,
    rowId,
  }
}

function label(itemId, expectedPartKey, options = {}) {
  return {
    cropHash: options.cropHash,
    expectedPartKey,
    itemId,
    role: options.role ?? "gate",
  }
}
