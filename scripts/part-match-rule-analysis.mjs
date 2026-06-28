import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  createStepCalloutBagRows,
  createStepCalloutBaggingPlan,
} from "../src/features/bagging/step-callout-bagging.ts"
import { colorsAreCompatible } from "../packages/part-matching/src/color.ts"
import {
  createPartMatchGroups,
  extractPartVisualFeatures,
} from "../packages/part-matching/src/index.ts"
import { compareNearFeatures } from "../packages/part-matching/src/near-match.ts"
import {
  extractPartPairScoreFeatures,
  scorePartPair,
} from "../packages/part-matching/src/pair-scorer.ts"
import {
  DEFAULT_PART_MATCH_LABEL_DIR,
  evaluatePartMatchLabelFile,
  evaluatePartMatchLabelRows,
  isPartMatchLabelScored,
  readPartMatchLabelSets,
  readPartMatchReportRowsByItemId,
} from "./part-match-label-eval.mjs"
import { decodePngImageDataUrl } from "./write-part-match-report.mjs"

export const DEFAULT_PART_MATCH_SOURCE_DIR = path.join(
  ".bag-it",
  "private",
  "part-color-reports",
  "sources",
)

const LOW_ALPHA_DRIFT_MAX = 10
const SAMPLE_LIMIT = 5

const METRIC_NAMES = [
  "confidence",
  "alignedAlpha8",
  "alignedAlpha8Overlap",
  "alignedEdge8",
  "alignedLuma8",
  "alignmentScale",
  "alignmentShift",
  "alphaChamfer",
  "alphaChamferShift",
  "alpha32",
  "alpha32Shift",
  "alpha",
  "edge",
  "edge32",
  "alphaShift",
  "alphaOrientation",
  "luma",
  "luma32",
  "lumaEdge",
  "lumaEdgeShift",
  "luma32Shift",
  "lumaOrientation",
  "lumaShift",
  "projection",
  "silhouette",
  "silhouetteShift",
  "tightAlpha32",
  "tightAlpha32Shift",
  "tightAlphaChamfer",
  "tightAlphaChamferShift",
  "tightAlphaEdge32",
  "tightLuma32",
  "tightLuma32Shift",
  "wideAlpha32Shift",
  "wideLuma32Shift",
  "wideSilhouetteShift",
  "top",
  "lower",
  "left",
  "right",
  "aspectRatio",
  "areaRatio",
  "coverage",
  "center",
]

export function analyzePartMatchRules({
  decisionPath = null,
  includePairs = false,
  labelDir = DEFAULT_PART_MATCH_LABEL_DIR,
  manualIds = null,
  scorerConfigPath = null,
  sourceDir = DEFAULT_PART_MATCH_SOURCE_DIR,
} = {}) {
  const scorerConfig = scorerConfigPath
    ? JSON.parse(readFileSync(scorerConfigPath, "utf8"))
    : null
  const manualIdSet = manualIds ? new Set(manualIds) : null
  const labelSets = readPartMatchLabelSets(labelDir)
    .filter((labelSet) => !manualIdSet || manualIdSet.has(labelSet.manualId))
  const groupEvaluations = labelSets.map((labelSet) =>
    evaluateLabelSetGroups(labelSet, { scorerConfig, sourceDir })
  )
  const pairAnalyses = labelSets.map((labelSet) =>
    analyzeLabelSetPairs(labelSet, { scorerConfig, sourceDir })
  )
  const sameMatchedPairs = pairAnalyses.flatMap((analysis) => analysis.sameMatchedPairs)
  const sameMissedPairs = pairAnalyses.flatMap((analysis) => analysis.sameMissedPairs)
  const samePairs = pairAnalyses.flatMap((analysis) => analysis.samePairs)
  const differentPairs = pairAnalyses.flatMap((analysis) => analysis.differentPairs)
  const falsePositivePairs = pairAnalyses.flatMap((analysis) => analysis.falsePositivePairs)
  const reviewDecisionSummary = decisionPath
    ? summarizeReviewDecisions(readReviewDecisions(decisionPath), {
        differentPairs,
        falsePositivePairs,
        sameMatchedPairs,
        sameMissedPairs,
        samePairs,
      })
    : null

  const analysis = {
    groupEvaluations,
    groupTotals: summarizeGroupEvaluations(groupEvaluations),
    pairSummaries: {
      falsePositivePairs: summarizePairs(falsePositivePairs),
      sameMatchedPairs: summarizePairs(sameMatchedPairs),
      sameMissedPairs: summarizePairs(sameMissedPairs),
    },
    pairTotals: {
      falsePositivePairs: falsePositivePairs.length,
      sameMatchedPairs: sameMatchedPairs.length,
      sameMissedPairs: sameMissedPairs.length,
    },
    reasonCounts: {
      falsePositivePairs: reasonCounts(falsePositivePairs),
      sameMissedPairs: reasonCounts(sameMissedPairs),
    },
    reviewDecisionSummary,
    missedBuckets: bucketCounts(sameMissedPairs),
    samples: {
      falsePositivePairs: falsePositivePairs.slice(0, SAMPLE_LIMIT).map(toSample),
      sameMissedPairs: sameMissedPairs.slice(0, SAMPLE_LIMIT).map(toSample),
    },
    skippedPairAnalyses: pairAnalyses
      .filter((analysis) => analysis.skipped)
      .map((analysis) => ({
        manualId: analysis.manualId,
        reason: analysis.skipped,
      })),
  }

  return includePairs
    ? {
        ...analysis,
        pairs: {
          differentPairs,
          falsePositivePairs,
          sameMatchedPairs,
          sameMissedPairs,
          samePairs,
        },
      }
    : analysis
}

function evaluateLabelSetGroups(labelSet, { scorerConfig, sourceDir }) {
  if (!scorerConfig) {
    return evaluatePartMatchLabelFile(labelSet)
  }

  const sourcePath = path.join(
    sourceDir,
    `${labelSet.manualId}.current-app-result.bagit-session.json`,
  )
  const reportPath = path.resolve(labelSet.reportPath)

  if (!existsSync(sourcePath) || !existsSync(reportPath)) {
    return evaluatePartMatchLabelFile(labelSet)
  }

  const report = JSON.parse(readFileSync(reportPath, "utf8"))
  const featureRowsById = createFeatureRows({
    manualId: labelSet.manualId,
    report,
    session: JSON.parse(readFileSync(sourcePath, "utf8")),
  })
  const groups = createPartMatchGroups({
    enableLabelGatedNearMatches: true,
    pairScorerConfig: scorerConfig,
    rows: [...featureRowsById.values()].map(toPartMatchRowInput),
  })

  return evaluatePartMatchLabelRows(labelSet, {
    groups,
    report,
    rowsById: readPartMatchReportRowsByItemId(report),
  })
}

function analyzeLabelSetPairs(labelSet, { scorerConfig, sourceDir }) {
  const sourcePath = path.join(
    sourceDir,
    `${labelSet.manualId}.current-app-result.bagit-session.json`,
  )
  const reportPath = path.resolve(labelSet.reportPath)

  if (!existsSync(sourcePath)) {
    return emptyPairAnalysis(labelSet.manualId, `missing source session ${sourcePath}`)
  }

  if (!existsSync(reportPath)) {
    return emptyPairAnalysis(labelSet.manualId, `missing report ${labelSet.reportPath}`)
  }

  const rowsById = createFeatureRows({
    manualId: labelSet.manualId,
    report: JSON.parse(readFileSync(reportPath, "utf8")),
    session: JSON.parse(readFileSync(sourcePath, "utf8")),
  })
  const pairLabels = labelSet.labels.filter(isPartMatchLabelPairCandidate)
  const pairLabelsByItemId = new Map(pairLabels.map((label) => [label.itemId, label]))
  const pairKeys = new Set()
  const sameMatchedPairs = []
  const sameMissedPairs = []
  const samePairs = []
  const differentPairs = []
  const falsePositivePairs = []

  for (let leftIndex = 0; leftIndex < pairLabels.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < pairLabels.length; rightIndex += 1) {
      analyzePair(pairLabels[leftIndex], pairLabels[rightIndex])
    }
  }

  for (const excludedLabel of pairLabels.filter((label) => label.role === "excluded")) {
    for (const row of rowsById.values()) {
      if (pairLabelsByItemId.has(row.itemId)) {
        continue
      }

      analyzePair(excludedLabel, createUnlabeledPairLabel(row.itemId))
    }
  }

  function analyzePair(leftLabel, rightLabel) {
    const left = rowsById.get(leftLabel.itemId)
    const right = rowsById.get(rightLabel.itemId)
    const pairKey = labelPairKey(labelSet.manualId, leftLabel.itemId, rightLabel.itemId)

    if (
      !left ||
      !right ||
      pairKeys.has(pairKey) ||
      left.bagId !== right.bagId ||
      left.calloutId === right.calloutId
    ) {
      return
    }

    pairKeys.add(pairKey)

    const result = colorsAreCompatible(left.color, right.color)
      ? compareFeaturesWithOptionalScorer(left.features, right.features, scorerConfig)
      : { confidence: 0, matched: false, reasons: ["color"] }
    const pair = {
      left: leftLabel.itemId,
      leftKey: leftLabel.expectedPartKey,
      leftRow: summarizeFeatureRow(left),
      manualId: labelSet.manualId,
      metrics: readPairMetrics(left.features, right.features),
      result,
      right: rightLabel.itemId,
      rightKey: rightLabel.expectedPartKey,
      rightRow: summarizeFeatureRow(right),
    }

    if (labelsAreSameScoredPart(leftLabel, rightLabel)) {
      samePairs.push(pair)

      if (result.matched) {
        sameMatchedPairs.push(pair)
      } else {
        sameMissedPairs.push(pair)
      }
    } else {
      differentPairs.push(pair)

      if (result.matched) {
        falsePositivePairs.push(pair)
      }
    }
  }

  return {
    falsePositivePairs,
    differentPairs,
    manualId: labelSet.manualId,
    sameMatchedPairs,
    sameMissedPairs,
    samePairs,
    skipped: null,
  }
}

function isPartMatchLabelPairCandidate(label) {
  return isPartMatchLabelScored(label) || label.role === "excluded"
}

function labelsAreSameScoredPart(leftLabel, rightLabel) {
  return isPartMatchLabelScored(leftLabel) &&
    isPartMatchLabelScored(rightLabel) &&
    leftLabel.expectedPartKey === rightLabel.expectedPartKey
}

function createUnlabeledPairLabel(itemId) {
  return {
    expectedPartKey: "",
    itemId,
    role: "unlabeled",
  }
}

function labelPairKey(manualId, leftItemId, rightItemId) {
  const [left, right] = [leftItemId, rightItemId].sort()

  return `${manualId}\0${left}\0${right}`
}

function compareFeaturesWithOptionalScorer(left, right, scorerConfig) {
  if (!scorerConfig) {
    return compareNearFeatures(left, right)
  }

  const scorerResult = scorePartPair(left, right, scorerConfig)

  return scorerResult.matched
    ? {
        confidence: scorerResult.probability,
        matched: true,
        reasons: ["trained visual scorer match"],
      }
    : {
        confidence: scorerResult.probability,
        matched: false,
        reasons: ["trained visual scorer rejected"],
      }
}

function createFeatureRows({
  manualId,
  report,
  session,
}) {
  const result = session.stepDetectionResult

  if (!result) {
    return new Map()
  }

  const reportRowsById = new Map(
    (report.rows ?? []).map((row) => [row.rowId, row]),
  )
  const plan = createStepCalloutBaggingPlan(result)
  const bagRows = createStepCalloutBagRows(plan, {
    manualFingerprint: createManualFingerprint(session, manualId),
    pagePreviews: result.pagePreviews,
  })

  return new Map(bagRows.map((row) => {
    const reportRow = reportRowsById.get(row.id)
    const renderedPixels = decodePngImageDataUrl(reportRow?.imageDataUrl)
    const features = extractPartVisualFeatures({
      alphaMask: row.partImageAlphaMask,
      partRegion: row.partCrop?.region ?? row.anchor.partRegion,
      renderedPixels,
    })

    return [row.id, {
      bagId: row.bagId,
      bagLabel: row.bagLabel,
      calloutId: row.calloutId,
      color: row.color,
      cropHash: reportRow?.cropHash ?? null,
      features,
      imageDataUrl: reportRow?.imageDataUrl ?? null,
      itemId: row.id,
      pageNumber: reportRow?.pageNumber ?? row.sourcePageNumber ?? null,
      partRegion: row.partCrop?.region ?? row.anchor.partRegion,
      previewKind: reportRow?.previewKind ?? null,
      quantity: reportRow?.quantity ?? row.quantity ?? null,
      rowId: row.id,
      stepIndex: reportRow?.stepIndex ?? row.stepIndex ?? null,
    }]
  }))
}

function toPartMatchRowInput(row) {
  return {
    bagId: row.bagId,
    calloutId: row.calloutId,
    color: row.color,
    features: row.features,
    itemId: row.itemId,
    partRegion: row.partRegion,
    rowId: row.rowId,
  }
}

function createManualFingerprint(session, fallbackManualId) {
  const manual = session.manual ?? {}

  return `${manual.fileName ?? fallbackManualId}:${manual.sizeBytes ?? 0}:${manual.lastModified ?? 0}`
}

function emptyPairAnalysis(manualId, skipped) {
  return {
    falsePositivePairs: [],
    differentPairs: [],
    manualId,
    sameMatchedPairs: [],
    sameMissedPairs: [],
    samePairs: [],
    skipped,
  }
}

function readReviewDecisions(decisionPath) {
  const parsed = JSON.parse(readFileSync(decisionPath, "utf8"))

  if (!Array.isArray(parsed.decisions)) {
    throw new Error(`Part match review decisions ${decisionPath} must contain decisions[].`)
  }

  return {
    decisions: parsed.decisions,
    path: normalizeWorkspacePath(decisionPath),
    queueGeneratedAt: parsed.queueGeneratedAt ?? null,
  }
}

export function createColorConflictDiagnostics(analysis, {
  generatedAt = new Date(),
} = {}) {
  const pairs = (analysis.pairs?.sameMissedPairs ?? [])
    .filter((pair) => classifyMiss(pair) === "color-conflict")

  return {
    generatedAt: generatedAt.toISOString(),
    pairCount: pairs.length,
    pairs: pairs.map((pair) => ({
      confidence: pair.result.confidence,
      expectedPartKey: pair.leftKey,
      left: pair.leftRow,
      manualId: pair.manualId,
      metrics: pair.metrics,
      reasons: pair.result.reasons,
      right: pair.rightRow,
    })),
    summary: {
      byColorPair: countBy(pairs, (pair) => colorPairKey(pair.leftRow.colorKey, pair.rightRow.colorKey)),
      byExpectedPartKey: countBy(pairs, (pair) => `${pair.manualId}:${pair.leftKey}`),
      byManual: countBy(pairs, (pair) => pair.manualId),
    },
  }
}

export function createGroupingConflictDiagnostics({
  generatedAt = new Date(),
  labelDir = DEFAULT_PART_MATCH_LABEL_DIR,
  manualIds = null,
  scorerConfigPath = null,
  sourceDir = DEFAULT_PART_MATCH_SOURCE_DIR,
} = {}) {
  const scorerConfig = scorerConfigPath
    ? JSON.parse(readFileSync(scorerConfigPath, "utf8"))
    : null
  const manualIdSet = manualIds ? new Set(manualIds) : null
  const conflicts = readPartMatchLabelSets(labelDir)
    .filter((labelSet) => !manualIdSet || manualIdSet.has(labelSet.manualId))
    .flatMap((labelSet) =>
      createGroupingConflictsForLabelSet(labelSet, { scorerConfig, sourceDir })
    )
  const decisionRows = createGroupingConflictDecisionRows(conflicts)

  return {
    conflictCount: conflicts.length,
    decisionRows,
    generatedAt: generatedAt.toISOString(),
    missedPairCount: conflicts.reduce((total, conflict) => total + conflict.missedPairCount, 0),
    conflicts,
    summary: {
      byExpectedPartKey: countBy(conflicts, (conflict) =>
        `${conflict.manualId}:${conflict.expectedPartKey}`
      ),
      byManual: countBy(conflicts, (conflict) => conflict.manualId),
    },
  }
}

function createGroupingConflictsForLabelSet(labelSet, { scorerConfig, sourceDir }) {
  const reportPath = path.resolve(labelSet.reportPath)

  if (!existsSync(reportPath)) {
    return []
  }

  const report = JSON.parse(readFileSync(reportPath, "utf8"))
  const rowsById = readPartMatchReportRowsByItemId(report)
  const groups = scorerConfig
    ? createGroupsForLabelSet(labelSet, report, { scorerConfig, sourceDir })
    : report.groups ?? []
  const groupPairKeys = new Set(groups.flatMap((group) => createPairKeys(group.rowIds)))
  const scoredLabels = labelSet.labels.filter(isPartMatchLabelScored)
  const labelsByItemId = new Map(scoredLabels.map((label) => [label.itemId, label]))
  const groupsByPartKeyAndBag = groupLabelsByPartKeyAndBag(scoredLabels, rowsById)

  return [...groupsByPartKeyAndBag.values()].flatMap((labelGroup) => {
    const expectedPairs = createExpectedPairs(labelGroup.labels, rowsById)
    const missedPairs = expectedPairs.filter((pair) => !groupPairKeys.has(pair.key))

    if (missedPairs.length === 0) {
      return []
    }

    const labelIds = new Set(labelGroup.labels.map((label) => label.itemId))
    const currentGroups = groups
      .filter((group) => group.rowIds.some((rowId) => labelIds.has(rowId)))
      .map((group) => summarizeConflictGroup(group, { labelsByItemId, rowsById }))

    return [{
      bagId: labelGroup.bagId,
      currentGroups,
      expectedPairCount: expectedPairs.length,
      expectedPartKey: labelGroup.expectedPartKey,
      labeledRows: labelGroup.labels.map((label) =>
        summarizeConflictRow(rowsById.get(label.itemId), labelsByItemId)
      ),
      manualId: labelSet.manualId,
      missedPairCount: missedPairs.length,
      missedPairs: missedPairs.map((pair) => ({
        key: pair.key,
        left: summarizeConflictRow(rowsById.get(pair.left.itemId), labelsByItemId),
        right: summarizeConflictRow(rowsById.get(pair.right.itemId), labelsByItemId),
      })),
    }]
  })
}

function createGroupsForLabelSet(labelSet, report, { scorerConfig, sourceDir }) {
  const sourcePath = path.join(
    sourceDir,
    `${labelSet.manualId}.current-app-result.bagit-session.json`,
  )

  if (!existsSync(sourcePath)) {
    return report.groups ?? []
  }

  const featureRowsById = createFeatureRows({
    manualId: labelSet.manualId,
    report,
    session: JSON.parse(readFileSync(sourcePath, "utf8")),
  })

  return createPartMatchGroups({
    enableLabelGatedNearMatches: true,
    pairScorerConfig: scorerConfig,
    rows: [...featureRowsById.values()].map(toPartMatchRowInput),
  })
}

function groupLabelsByPartKeyAndBag(labels, rowsById) {
  const groups = new Map()

  for (const label of labels) {
    const row = rowsById.get(label.itemId)

    if (!row) {
      continue
    }

    const key = `${row.bagId}:${label.expectedPartKey}`
    const group = groups.get(key) ?? {
      bagId: row.bagId,
      expectedPartKey: label.expectedPartKey,
      labels: [],
    }

    group.labels.push(label)
    groups.set(key, group)
  }

  return groups
}

function createExpectedPairs(labels, rowsById) {
  const pairs = []
  const sorted = [...labels].sort((left, right) => left.itemId.localeCompare(right.itemId))

  for (let leftIndex = 0; leftIndex < sorted.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex += 1) {
      const left = sorted[leftIndex]
      const right = sorted[rightIndex]

      if (!left || !right) {
        continue
      }

      const leftRow = rowsById.get(left.itemId)
      const rightRow = rowsById.get(right.itemId)

      if (sameKnownCallout(leftRow, rightRow)) {
        continue
      }

      pairs.push({
        key: pairIdKey(left.itemId, right.itemId),
        left,
        right,
      })
    }
  }

  return pairs
}

function createPairKeys(rowIds) {
  const pairs = []
  const sorted = [...new Set(rowIds)].sort()

  for (let leftIndex = 0; leftIndex < sorted.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex += 1) {
      const left = sorted[leftIndex]
      const right = sorted[rightIndex]

      if (left && right) {
        pairs.push(pairIdKey(left, right))
      }
    }
  }

  return pairs
}

function pairIdKey(left, right) {
  return [left, right].sort().join("::")
}

function sameKnownCallout(leftRow, rightRow) {
  return Boolean(
    leftRow?.calloutId &&
    rightRow?.calloutId &&
    leftRow.calloutId === rightRow.calloutId,
  )
}

function summarizeConflictGroup(group, { labelsByItemId, rowsById }) {
  const rowIds = group.rowIds ?? []

  return {
    confidence: group.confidence ?? null,
    groupId: group.groupId,
    matchKind: group.matchKind,
    labeledRows: rowIds
      .filter((rowId) => labelsByItemId.has(rowId))
      .map((rowId) => summarizeConflictRow(rowsById.get(rowId), labelsByItemId)),
    rowCount: rowIds.length,
    rows: rowIds.map((rowId) => summarizeConflictRow(rowsById.get(rowId), labelsByItemId)),
    unlabeledRows: rowIds
      .filter((rowId) => !labelsByItemId.has(rowId))
      .map((rowId) => summarizeConflictRow(rowsById.get(rowId), labelsByItemId)),
  }
}

function summarizeConflictRow(row, labelsByItemId) {
  if (!row) {
    return null
  }

  const itemId = row.itemId ?? row.rowId
  const label = labelsByItemId.get(itemId)

  return {
    bagId: row.bagId ?? null,
    calloutId: row.calloutId ?? null,
    color: row.color ?? null,
    colorLabel: readDiagnosticColorLabel(row.color),
    cropHash: row.cropHash ?? null,
    expectedPartKey: label?.expectedPartKey ?? null,
    imageDataUrl: row.imageDataUrl ?? null,
    itemId,
    pageNumber: row.pageNumber ?? null,
    previewKind: row.previewKind ?? null,
    quantity: row.quantity ?? null,
    rowId: row.rowId ?? itemId,
    stepIndex: row.stepIndex ?? null,
  }
}

function writeColorConflictReport(outputDir, diagnostics) {
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(
    path.join(outputDir, "color-conflicts.json"),
    `${JSON.stringify(diagnostics, null, 2)}\n`,
  )
  writeFileSync(
    path.join(outputDir, "index.html"),
    renderColorConflictHtml(diagnostics),
  )
}

function writeGroupingConflictReport(outputDir, diagnostics) {
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(
    path.join(outputDir, "grouping-conflicts.json"),
    `${JSON.stringify(diagnostics, null, 2)}\n`,
  )
  writeFileSync(
    path.join(outputDir, "index.html"),
    renderGroupingConflictHtml(diagnostics),
  )
}

function renderColorConflictHtml(diagnostics) {
  const pairs = diagnostics.pairs.map((pair) => `
    <article class="pair">
      <header>
        <strong>${escapeHtml(pair.manualId)} / ${escapeHtml(pair.expectedPartKey)}</strong>
        <span>${escapeHtml(pair.left.colorKey)} -> ${escapeHtml(pair.right.colorKey)}</span>
      </header>
      <div class="cards">
        ${renderConflictSide(pair.left)}
        ${renderConflictSide(pair.right)}
      </div>
      <pre>${escapeHtml(JSON.stringify({
        confidence: pair.confidence,
        metrics: pair.metrics,
        reasons: pair.reasons,
      }, null, 2))}</pre>
    </article>
  `).join("\n")

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Part match color conflicts</title>
  <style>
    body { background: #f7f7f4; color: #20211f; font: 13px/1.4 system-ui, sans-serif; margin: 0; }
    main { margin: 0 auto; max-width: 1280px; padding: 24px; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    .summary { color: #5b5d56; margin: 0 0 18px; }
    .pair { background: #fff; border: 1px solid #d9dbd2; border-radius: 8px; margin: 0 0 14px; padding: 12px; }
    .pair header { align-items: center; display: flex; gap: 16px; justify-content: space-between; margin-bottom: 10px; }
    .cards { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .card { border: 1px solid #e1e3dc; border-radius: 6px; display: grid; gap: 10px; grid-template-columns: 128px 1fr; padding: 10px; }
    .card img { background: #eef0e8; border: 1px solid #d6d8cf; height: 118px; object-fit: contain; width: 118px; }
    dl { display: grid; gap: 3px 8px; grid-template-columns: max-content 1fr; margin: 0; }
    dt { color: #696b64; }
    dd { margin: 0; overflow-wrap: anywhere; }
    pre { background: #282a26; border-radius: 6px; color: #f2f4ec; font-size: 11px; overflow: auto; padding: 8px; }
  </style>
</head>
<body>
  <main>
    <h1>Part match color conflicts</h1>
    <p class="summary">${diagnostics.pairCount} same-label pairs blocked by color policy. Generated ${escapeHtml(diagnostics.generatedAt)}.</p>
    ${pairs || "<p>No color conflicts.</p>"}
  </main>
</body>
</html>
`
}

function renderGroupingConflictHtml(diagnostics) {
  const conflicts = diagnostics.conflicts.map((conflict) => `
    <article class="conflict" data-manual-id="${escapeAttribute(conflict.manualId)}" data-expected-part-key="${escapeAttribute(conflict.expectedPartKey)}">
      <header>
        <strong>${escapeHtml(conflict.manualId)} / ${escapeHtml(conflict.expectedPartKey)}</strong>
        <span>${conflict.missedPairCount}/${conflict.expectedPairCount} missed pairs</span>
      </header>
      <section>
        <h2>Labeled rows</h2>
        <div class="cards">${conflict.labeledRows.map((row) => renderConflictCard(row)).join("")}</div>
      </section>
      <section>
        <h2>Missed pairs</h2>
        ${conflict.missedPairs.map((pair) => `
          <div class="pair">
            ${renderConflictCard(pair.left)}
            ${renderConflictCard(pair.right)}
          </div>
        `).join("")}
      </section>
      <section>
        <h2>Current groups touching these rows</h2>
        ${conflict.currentGroups.map((group) => renderGroupingConflictGroup(group, conflict)).join("")}
      </section>
    </article>
  `).join("\n")
  const decisionRows = diagnostics.decisionRows ?? createGroupingConflictDecisionRows(diagnostics.conflicts)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Part match grouping conflicts</title>
  <style>
    body { background: #f7f7f4; color: #20211f; font: 13px/1.4 system-ui, sans-serif; margin: 0; }
    main { margin: 0 auto; max-width: 1440px; padding: 24px; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    h2 { color: #4f514c; font-size: 13px; margin: 12px 0 8px; text-transform: uppercase; }
    .summary { color: #5b5d56; margin: 0 0 18px; }
    .toolbar { align-items: center; display: flex; gap: 8px; margin: 14px 0 18px; }
    button { background: #fff; border: 1px solid #b8bbb1; border-radius: 6px; color: #20211f; cursor: pointer; font: inherit; padding: 6px 9px; }
    button:hover { background: #eef0e8; }
    button.active { background: #20211f; border-color: #20211f; color: #fff; }
    .conflict, .group { background: #fff; border: 1px solid #d9dbd2; border-radius: 8px; margin: 0 0 14px; padding: 12px; }
    .conflict header, .group header { align-items: center; display: flex; gap: 16px; justify-content: space-between; margin-bottom: 10px; }
    .cards { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
    .pair { border: 1px solid #eceee7; border-radius: 6px; display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0 0 10px; padding: 8px; }
    .card { border: 1px solid #e1e3dc; border-radius: 6px; display: grid; gap: 8px; grid-template-columns: 86px 1fr; padding: 8px; }
    .card img { background: #eef0e8; border: 1px solid #d6d8cf; height: 78px; object-fit: contain; width: 78px; }
    .unlabeled { border-color: #c87f28; }
    .decision-controls { display: flex; flex-wrap: wrap; gap: 4px; grid-column: 1 / -1; }
    .decision-status { color: #696b64; grid-column: 1 / -1; }
    dl { display: grid; gap: 2px 6px; grid-template-columns: max-content 1fr; margin: 0; }
    dt { color: #696b64; }
    dd { margin: 0; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <main>
    <h1>Part match grouping conflicts</h1>
    <p class="summary">${diagnostics.missedPairCount} missed pairs across ${diagnostics.conflictCount} conflicts. Generated ${escapeHtml(diagnostics.generatedAt)}.</p>
    <div class="toolbar">
      <button type="button" id="download-decisions">Download decisions</button>
      <button type="button" id="clear-decisions">Clear local choices</button>
      <span id="decision-count" class="summary"></span>
    </div>
    ${conflicts || "<p>No grouping conflicts.</p>"}
  </main>
  <script type="application/json" id="grouping-conflict-decision-rows">${safeJsonForScript(decisionRows)}</script>
  <script>
    (() => {
      const storageKey = "bag-it-part-match-grouping-conflicts";
      const decisionRows = JSON.parse(document.getElementById("grouping-conflict-decision-rows").textContent || "[]");
      const readState = () => {
        try {
          return JSON.parse(localStorage.getItem(storageKey) || "{}");
        } catch {
          return {};
        }
      };
      let state = readState();
      const writeState = () => localStorage.setItem(storageKey, JSON.stringify(state));
      const update = () => {
        for (const control of document.querySelectorAll("[data-decision-id]")) {
          const decisionId = control.getAttribute("data-decision-id");
          const status = state[decisionId]?.status || "";
          control.querySelector(".decision-status").textContent = status ? \`choice: \${status}\` : "choice: unset";
          for (const button of control.querySelectorAll("button[data-status]")) {
            button.classList.toggle("active", button.getAttribute("data-status") === status);
          }
        }
        const count = decisionRows.filter((row) => {
          const status = state[row.decisionId]?.status || "";

          return status && status !== "unset";
        }).length;
        document.getElementById("decision-count").textContent = \`\${count} / \${decisionRows.length} decided\`;
      };
      document.addEventListener("click", (event) => {
        const statusButton = event.target.closest("button[data-status]");
        if (statusButton) {
          const control = statusButton.closest("[data-decision-id]");
          const decisionId = control.getAttribute("data-decision-id");
          const row = decisionRows.find((candidate) => candidate.decisionId === decisionId);
          state[decisionId] = { ...row, status: statusButton.getAttribute("data-status") };
          writeState();
          update();
          return;
        }
        if (event.target.id === "download-decisions") {
          const decisions = decisionRows
            .map((row) => state[row.decisionId])
            .filter((decision) => decision?.status && decision.status !== "unset");
          const payload = {
            decisions,
            generatedAt: new Date().toISOString(),
            reportGeneratedAt: ${safeJsonForScript(diagnostics.generatedAt)},
            type: "part-match-grouping-conflict-decisions",
          };
          const blob = new Blob([JSON.stringify(payload, null, 2) + "\\n"], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "grouping-conflict-decisions.json";
          link.click();
          URL.revokeObjectURL(url);
          return;
        }
        if (event.target.id === "clear-decisions") {
          state = {};
          writeState();
          update();
        }
      });
      update();
    })();
  </script>
</body>
</html>
`
}

function createGroupingConflictDecisionRows(conflicts) {
  const rowsByDecisionId = new Map()

  for (const conflict of conflicts) {
    for (const group of conflict.currentGroups) {
      for (const row of group.unlabeledRows) {
        if (!row?.itemId) {
          continue
        }

        const decisionId = groupingConflictDecisionId(conflict, row)

        rowsByDecisionId.set(decisionId, {
          decisionId,
          expectedPartKey: conflict.expectedPartKey,
          itemId: row.itemId,
          manualId: conflict.manualId,
          referenceItemIds: conflict.labeledRows
            .map((labeledRow) => labeledRow?.itemId)
            .filter(Boolean),
        })
      }
    }
  }

  return [...rowsByDecisionId.values()]
}

function groupingConflictDecisionId(conflict, row) {
  return createHash("sha256")
    .update(`${conflict.manualId}\0${conflict.expectedPartKey}\0${row.itemId}`)
    .digest("hex")
    .slice(0, 16)
}

function renderGroupingConflictGroup(group, conflict) {
  return `<article class="group">
    <header>
      <strong>${escapeHtml(group.groupId)}</strong>
      <span>${escapeHtml(group.matchKind)} / ${group.rowCount} rows / ${group.unlabeledRows.length} unlabeled</span>
    </header>
    <div class="cards">${group.rows.map((row) => renderConflictCard(row, conflict)).join("")}</div>
  </article>`
}

function renderConflictCard(row, conflict = null) {
  if (!row) {
    return "<section class=\"card\"><div></div><dl><dt>row</dt><dd>missing</dd></dl></section>"
  }

  const image = row.imageDataUrl
    ? `<img alt="" src="${escapeAttribute(row.imageDataUrl)}" />`
    : "<div></div>"
  const className = row.expectedPartKey ? "card" : "card unlabeled"
  const decisionControls = !row.expectedPartKey && conflict
    ? renderGroupingConflictDecisionControls(conflict, row)
    : ""

  return `<section class="${className}">
    ${image}
    <dl>
      <dt>part</dt><dd>${escapeHtml(row.expectedPartKey ?? "unlabeled")}</dd>
      <dt>item</dt><dd>${escapeHtml(row.itemId)}</dd>
      <dt>page</dt><dd>${escapeHtml(String(row.pageNumber ?? ""))}</dd>
      <dt>callout</dt><dd>${escapeHtml(row.calloutId ?? "")}</dd>
      <dt>color</dt><dd>${escapeHtml(row.colorLabel)}</dd>
    </dl>
    ${decisionControls}
  </section>`
}

function renderGroupingConflictDecisionControls(conflict, row) {
  const decisionId = groupingConflictDecisionId(conflict, row)

  return `<div class="decision-controls" data-decision-id="${escapeAttribute(decisionId)}">
    <button type="button" data-status="same">Same</button>
    <button type="button" data-status="different">Different</button>
    <button type="button" data-status="ignore">Ignore</button>
    <span class="decision-status">choice: unset</span>
  </div>`
}

function renderConflictSide(row) {
  const image = row.imageDataUrl
    ? `<img alt="" src="${escapeAttribute(row.imageDataUrl)}" />`
    : `<div></div>`

  return `<section class="card">
    ${image}
    <dl>
      <dt>item</dt><dd>${escapeHtml(row.itemId)}</dd>
      <dt>bag</dt><dd>${escapeHtml(row.bagId)}</dd>
      <dt>callout</dt><dd>${escapeHtml(row.calloutId)}</dd>
      <dt>page</dt><dd>${escapeHtml(String(row.pageNumber ?? ""))}</dd>
      <dt>color key</dt><dd>${escapeHtml(row.colorKey)}</dd>
      <dt>color</dt><dd>${escapeHtml(row.colorLabel)}</dd>
      <dt>trusted</dt><dd>${escapeHtml(String(row.color?.manualClassTrusted ?? ""))}</dd>
      <dt>crop</dt><dd>${escapeHtml(row.cropHash ?? "")}</dd>
    </dl>
  </section>`
}

function summarizeFeatureRow(row) {
  return {
    bagId: row.bagId,
    bagLabel: row.bagLabel ?? null,
    calloutId: row.calloutId,
    color: row.color ?? null,
    colorKey: readDiagnosticColorKey(row.color),
    colorLabel: readDiagnosticColorLabel(row.color),
    cropHash: row.cropHash,
    imageDataUrl: row.imageDataUrl,
    itemId: row.itemId,
    pageNumber: row.pageNumber,
    partRegion: row.partRegion,
    previewKind: row.previewKind,
    quantity: row.quantity,
    rowId: row.rowId,
    stepIndex: row.stepIndex,
  }
}

function readDiagnosticColorKey(color) {
  if (!color) {
    return "unknown"
  }

  if (color.manualClassTrusted && color.manualClassId) {
    return `manual:${normalizeDiagnosticColorValue(color.manualClassId)}`
  }

  if (color.key) {
    return `key:${normalizeDiagnosticColorValue(color.key)}`
  }

  if (color.name && color.family) {
    return `name:${normalizeDiagnosticColorValue(color.family)}:${normalizeDiagnosticColorValue(color.name)}`
  }

  return "unknown"
}

function readDiagnosticColorLabel(color) {
  if (!color) {
    return "unknown"
  }

  return [
    color.family,
    color.name,
    color.swatchHex,
    color.status,
  ].filter(Boolean).join(" / ") || readDiagnosticColorKey(color)
}

function normalizeDiagnosticColorValue(value) {
  return String(value).trim().toLowerCase()
}

function colorPairKey(left, right) {
  return [left, right].sort().join(" <-> ")
}

function countBy(values, readKey) {
  const counts = new Map()

  for (const value of values) {
    const key = readKey(value)

    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Object.fromEntries([...counts.entries()].sort((left, right) => right[1] - left[1]))
}

function summarizeReviewDecisions(reviewDecisions, pairs) {
  const pairResultsByKey = createPairResultsByKey(pairs)
  const summary = createEmptyReviewDecisionSummary(reviewDecisions)
  const samePairs = []
  const differentPairs = []

  for (const decision of reviewDecisions.decisions) {
    const status = decision.status ?? "unknown"

    summary.byStatus[status] = (summary.byStatus[status] ?? 0) + 1

    if (decision.bucket) {
      summary.byBucket[decision.bucket] = (summary.byBucket[decision.bucket] ?? 0) + 1
    }

    if (status !== "same" && status !== "different") {
      summary.ignored += 1
      continue
    }

    const pair = pairResultsByKey.get(reviewDecisionKey(decision))

    if (!pair) {
      summary.missingPairs += 1
      continue
    }

    if (status === "same") {
      samePairs.push(pair)

      if (pair.result.matched) {
        summary.sameMatched += 1
      } else {
        summary.sameMissed += 1
      }
      continue
    }

    differentPairs.push(pair)

    if (pair.result.matched) {
      summary.differentFalsePositive += 1
    } else {
      summary.differentSafe += 1
    }
  }

  return {
    ...summary,
    byBucket: sortCountObject(summary.byBucket),
    byStatus: sortCountObject(summary.byStatus),
    metricSummaries: {
      different: summarizePairs(differentPairs),
      same: summarizePairs(samePairs),
    },
  }
}

function createPairResultsByKey(pairs) {
  return new Map([
    ...pairs.sameMatchedPairs,
    ...pairs.sameMissedPairs,
    ...pairs.differentPairs,
    ...pairs.falsePositivePairs,
    ...pairs.samePairs,
  ].map((pair) => [pairKey(pair), pair]))
}

function createEmptyReviewDecisionSummary(reviewDecisions) {
  return {
    byBucket: {},
    byStatus: {},
    differentFalsePositive: 0,
    differentSafe: 0,
    ignored: 0,
    missingPairs: 0,
    path: reviewDecisions.path,
    queueGeneratedAt: reviewDecisions.queueGeneratedAt,
    sameMatched: 0,
    sameMissed: 0,
    total: reviewDecisions.decisions.length,
  }
}

function summarizeGroupEvaluations(evaluations) {
  return evaluations.reduce((totals, evaluation) => ({
    cropDrifts: totals.cropDrifts + evaluation.cropDrifts,
    expectedPairs: totals.expectedPairs + evaluation.expectedPairs,
    falseGroups: totals.falseGroups + evaluation.falseGroups,
    matchedPairs: totals.matchedPairs + evaluation.matchedPairs,
    missedPairs: totals.missedPairs + evaluation.missedPairs,
  }), {
    cropDrifts: 0,
    expectedPairs: 0,
    falseGroups: 0,
    matchedPairs: 0,
    missedPairs: 0,
  })
}

function summarizePairs(pairs) {
  return Object.fromEntries(METRIC_NAMES.map((metricName) => [
    metricName,
    summarizeMetric(pairs, metricName),
  ]))
}

function summarizeMetric(pairs, metricName) {
  const values = pairs
    .map((pair) => pair.metrics[metricName])
    .filter((value) => value !== null && Number.isFinite(value))
    .sort((left, right) => left - right)

  if (values.length === 0) {
    return null
  }

  return {
    max: values.at(-1),
    min: values[0],
    p50: percentile(values, 0.5),
    p90: percentile(values, 0.9),
  }
}

function reasonCounts(pairs) {
  const counts = new Map()

  for (const pair of pairs) {
    for (const reason of pair.result.reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1)
    }
  }

  return Object.fromEntries(
    [...counts.entries()].sort((left, right) => right[1] - left[1]),
  )
}

function bucketCounts(pairs) {
  const counts = new Map()

  for (const pair of pairs) {
    const bucket = classifyMiss(pair)
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
  }

  return Object.fromEntries(
    [...counts.entries()].sort((left, right) => right[1] - left[1]),
  )
}

function classifyMiss(pair) {
  const reasons = new Set(pair.result.reasons)
  const alphaBucket = pair.metrics.alpha <= LOW_ALPHA_DRIFT_MAX
    ? "low-alpha"
    : "high-alpha"

  if (reasons.has("color")) {
    return "color-conflict"
  }

  if (reasons.has("aspect ratio differs")) {
    return `aspect-ratio-${alphaBucket}`
  }

  if (reasons.has("stud/detail structure differs")) {
    return "structure"
  }

  if (reasons.has("luma detail differs")) {
    return `luma-detail-${alphaBucket}`
  }

  if (reasons.has("combined visual distance too high")) {
    return `combined-distance-${alphaBucket}`
  }

  return "other"
}

function pairKey(pair) {
  return `${pair.manualId}\0${pair.left}\0${pair.right}`
}

function reviewDecisionKey(decision) {
  return `${decision.manualId}\0${decision.left}\0${decision.right}`
}

function readPairMetrics(left, right) {
  const scoreFeatures = extractPartPairScoreFeatures(left, right)

  return {
    alignedAlpha8: scoreFeatures.alignedAlpha8Distance,
    alignedAlpha8Overlap: scoreFeatures.alignedAlpha8Overlap,
    alignedEdge8: scoreFeatures.alignedEdge8Distance,
    alignedLuma8: scoreFeatures.alignedLuma8Distance,
    alignmentScale: scoreFeatures.alignmentScaleDelta,
    alignmentShift: scoreFeatures.alignmentShiftDistance,
    alphaChamfer: scoreFeatures.alphaChamferDistance,
    alphaChamferShift: scoreFeatures.alphaChamferShiftDistance,
    alpha32: scoreFeatures.alpha32Distance,
    alpha32Shift: scoreFeatures.alpha32ShiftDistance,
    alpha: meanAbsoluteDifference(left.normalizedAlpha, right.normalizedAlpha),
    alphaShift: scoreFeatures.alphaShiftDistance,
    alphaOrientation: scoreFeatures.alphaOrientationDistance,
    areaRatio: ratioOf(left.area, right.area),
    aspectRatio: ratioOf(left.aspectRatio, right.aspectRatio),
    center: Math.hypot(left.centerX - right.centerX, left.centerY - right.centerY),
    confidence: compareNearFeatures(left, right).confidence,
    coverage: Math.abs(left.opaqueCoverage - right.opaqueCoverage),
    edge: meanAbsoluteDifference(left.edgeAlpha, right.edgeAlpha),
    edge32: scoreFeatures.alphaEdge32Distance,
    left: meanAbsoluteDifference(left.leftProfile, right.leftProfile),
    lower: meanAbsoluteDifference(left.lowerProfile, right.lowerProfile),
    luma: left.lumaGrid && right.lumaGrid
      ? meanAbsoluteDifference(left.lumaGrid, right.lumaGrid)
      : null,
    luma32: scoreFeatures.luma32Distance,
    lumaEdge: left.lumaGrid && right.lumaGrid
      ? meanAbsoluteDifference(createEdgeGrid(left.lumaGrid), createEdgeGrid(right.lumaGrid))
      : null,
    luma32Shift: scoreFeatures.luma32ShiftDistance,
    lumaEdgeShift: scoreFeatures.lumaEdgeShiftDistance,
    lumaOrientation: scoreFeatures.lumaOrientationDistance,
    lumaShift: scoreFeatures.lumaShiftDistance,
    projection: Math.max(
      meanAbsoluteDifference(left.projectionX, right.projectionX),
      meanAbsoluteDifference(left.projectionY, right.projectionY),
    ),
    right: meanAbsoluteDifference(left.rightProfile, right.rightProfile),
    silhouette: scoreFeatures.silhouetteDistance,
    silhouetteShift: scoreFeatures.silhouetteShiftDistance,
    tightAlpha32: scoreFeatures.tightAlpha32Distance,
    tightAlpha32Shift: scoreFeatures.tightAlpha32ShiftDistance,
    tightAlphaChamfer: scoreFeatures.tightAlphaChamferDistance,
    tightAlphaChamferShift: scoreFeatures.tightAlphaChamferShiftDistance,
    tightAlphaEdge32: scoreFeatures.tightAlphaEdge32Distance,
    tightLuma32: scoreFeatures.tightLuma32Distance,
    tightLuma32Shift: scoreFeatures.tightLuma32ShiftDistance,
    wideAlpha32Shift: scoreFeatures.wideAlpha32ShiftDistance,
    wideLuma32Shift: scoreFeatures.wideLuma32ShiftDistance,
    wideSilhouetteShift: scoreFeatures.wideSilhouetteShiftDistance,
    top: meanAbsoluteDifference(left.topProfile, right.topProfile),
  }
}

function toSample(pair) {
  return {
    left: pair.left,
    leftKey: pair.leftKey,
    manualId: pair.manualId,
    metrics: pair.metrics,
    reasons: pair.result.reasons,
    right: pair.right,
    rightKey: pair.rightKey,
  }
}

function sortCountObject(value) {
  return Object.fromEntries(
    Object.entries(value).sort((left, right) => right[1] - left[1]),
  )
}

export function formatPartMatchRuleAnalysis(analysis) {
  const lines = [
    "Part match rule analysis",
    "",
    "Group score",
    `  total: ${analysis.groupTotals.matchedPairs}/${analysis.groupTotals.expectedPairs} matched; ${analysis.groupTotals.falseGroups} false groups; ${analysis.groupTotals.missedPairs} missed; ${analysis.groupTotals.cropDrifts} crop drifts`,
  ]

  for (const evaluation of analysis.groupEvaluations) {
    lines.push(
      `  ${evaluation.manualId}: ${evaluation.matchedPairs}/${evaluation.expectedPairs} matched; ${evaluation.falseGroups} false; ${evaluation.missedPairs} missed; ${evaluation.cropDrifts} drift`,
    )
  }

  lines.push(
    "",
    "Pair score",
    `  same matched pairs: ${analysis.pairTotals.sameMatchedPairs}`,
    `  same missed pairs: ${analysis.pairTotals.sameMissedPairs}`,
    `  hard-negative false positive pairs: ${analysis.pairTotals.falsePositivePairs}`,
    "",
    "Miss buckets",
    ...formatObjectEntries(analysis.missedBuckets),
    "",
    "Miss reasons",
    ...formatObjectEntries(analysis.reasonCounts.sameMissedPairs),
    "",
    "Hard-negative reasons",
    ...formatObjectEntries(analysis.reasonCounts.falsePositivePairs),
    "",
    "Metric summaries",
    `  same matched confidence: ${formatMetric(analysis.pairSummaries.sameMatchedPairs.confidence)}`,
    `  same missed confidence: ${formatMetric(analysis.pairSummaries.sameMissedPairs.confidence)}`,
    `  hard-negative confidence: ${formatMetric(analysis.pairSummaries.falsePositivePairs.confidence)}`,
    `  same matched luma: ${formatMetric(analysis.pairSummaries.sameMatchedPairs.luma)}`,
    `  same missed luma: ${formatMetric(analysis.pairSummaries.sameMissedPairs.luma)}`,
    `  hard-negative luma: ${formatMetric(analysis.pairSummaries.falsePositivePairs.luma)}`,
    `  same matched luma edge: ${formatMetric(analysis.pairSummaries.sameMatchedPairs.lumaEdge)}`,
    `  same missed luma edge: ${formatMetric(analysis.pairSummaries.sameMissedPairs.lumaEdge)}`,
    `  hard-negative luma edge: ${formatMetric(analysis.pairSummaries.falsePositivePairs.lumaEdge)}`,
  )

  if (analysis.reviewDecisionSummary) {
    lines.push(
      "",
      "Review decisions",
      `  file: ${analysis.reviewDecisionSummary.path}`,
      `  same: ${analysis.reviewDecisionSummary.sameMatched} matched; ${analysis.reviewDecisionSummary.sameMissed} missed`,
      `  different: ${analysis.reviewDecisionSummary.differentSafe} safe; ${analysis.reviewDecisionSummary.differentFalsePositive} false positive`,
      `  missing pairs: ${analysis.reviewDecisionSummary.missingPairs}`,
      `  ignored: ${analysis.reviewDecisionSummary.ignored}`,
      "  metrics:",
      `    same alpha shift: ${formatMetric(analysis.reviewDecisionSummary.metricSummaries.same.alphaShift)}`,
      `    different alpha shift: ${formatMetric(analysis.reviewDecisionSummary.metricSummaries.different.alphaShift)}`,
      `    same luma shift: ${formatMetric(analysis.reviewDecisionSummary.metricSummaries.same.lumaShift)}`,
      `    different luma shift: ${formatMetric(analysis.reviewDecisionSummary.metricSummaries.different.lumaShift)}`,
      `    same luma edge shift: ${formatMetric(analysis.reviewDecisionSummary.metricSummaries.same.lumaEdgeShift)}`,
      `    different luma edge shift: ${formatMetric(analysis.reviewDecisionSummary.metricSummaries.different.lumaEdgeShift)}`,
      "  statuses:",
      ...formatObjectEntries(analysis.reviewDecisionSummary.byStatus).map((line) => `  ${line}`),
      "  buckets:",
      ...formatObjectEntries(analysis.reviewDecisionSummary.byBucket).map((line) => `  ${line}`),
    )
  }

  if (analysis.skippedPairAnalyses.length > 0) {
    lines.push("", "Skipped pair analyses")

    for (const skipped of analysis.skippedPairAnalyses) {
      lines.push(`  ${skipped.manualId}: ${skipped.reason}`)
    }
  }

  if (analysis.samples.falsePositivePairs.length > 0) {
    lines.push("", "Hard-negative samples")

    for (const sample of analysis.samples.falsePositivePairs) {
      lines.push(`  ${JSON.stringify(sample)}`)
    }
  }

  return lines.join("\n")
}

function formatObjectEntries(value) {
  const entries = Object.entries(value)

  if (entries.length === 0) {
    return ["  none"]
  }

  return entries.map(([key, count]) => `  ${key}: ${count}`)
}

function formatMetric(metric) {
  if (!metric) {
    return "n/a"
  }

  return `min=${formatNumber(metric.min)} p50=${formatNumber(metric.p50)} p90=${formatNumber(metric.p90)} max=${formatNumber(metric.max)}`
}

function percentile(sortedValues, value) {
  const index = Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * value))

  return sortedValues[index]
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(4) : String(value)
}

function ratioOf(left, right) {
  const min = Math.max(0.0001, Math.min(left, right))
  const max = Math.max(left, right)

  return max / min
}

function meanAbsoluteDifference(left, right) {
  const length = Math.min(left.length, right.length)

  if (length === 0) {
    return Number.POSITIVE_INFINITY
  }

  let total = 0

  for (let index = 0; index < length; index += 1) {
    total += Math.abs((left[index] ?? 0) - (right[index] ?? 0))
  }

  return total / length
}

function createEdgeGrid(values) {
  const size = Math.round(Math.sqrt(values.length))
  const result = []

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = readGridValue(values, size, x, y)
      const horizontal = Math.abs(value - readGridValue(values, size, x + 1, y))
      const vertical = Math.abs(value - readGridValue(values, size, x, y + 1))

      result.push(Math.max(horizontal, vertical))
    }
  }

  return result
}

function readGridValue(values, size, x, y) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return 0
  }

  return values[y * size + x] ?? 0
}

function normalizeWorkspacePath(value) {
  const relative = path.relative(process.cwd(), path.resolve(value))

  return relative.startsWith("..") ? value : relative
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function escapeAttribute(value) {
  return escapeHtml(value)
}

function safeJsonForScript(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029")
}

function readOption(argv, name) {
  const index = argv.indexOf(name)

  return index >= 0 ? argv[index + 1] ?? null : null
}

function parseManualIds(value) {
  return value
    ? value.split(",").map((manualId) => manualId.trim()).filter(Boolean)
    : null
}

async function runCli() {
  const argv = process.argv.slice(2)
  const colorConflictReportDir = readOption(argv, "--write-color-conflict-report")
  const groupingConflictReportDir = readOption(argv, "--write-grouping-conflict-report")
  const labelDir = readOption(argv, "--label-dir") ?? DEFAULT_PART_MATCH_LABEL_DIR
  const manualIds = parseManualIds(readOption(argv, "--manual-ids"))
  const scorerConfigPath = readOption(argv, "--scorer-config")
  const sourceDir = readOption(argv, "--source-dir") ?? DEFAULT_PART_MATCH_SOURCE_DIR
  const analysis = analyzePartMatchRules({
    decisionPath: readOption(argv, "--decision-path"),
    includePairs: argv.includes("--include-pairs") || Boolean(colorConflictReportDir),
    labelDir,
    manualIds,
    scorerConfigPath,
    sourceDir,
  })

  if (colorConflictReportDir) {
    const diagnostics = createColorConflictDiagnostics(analysis)

    writeColorConflictReport(colorConflictReportDir, diagnostics)
  }

  if (groupingConflictReportDir) {
    const diagnostics = createGroupingConflictDiagnostics({
      labelDir,
      manualIds,
      scorerConfigPath,
      sourceDir,
    })

    writeGroupingConflictReport(groupingConflictReportDir, diagnostics)
  }

  if (argv.includes("--json")) {
    console.log(JSON.stringify(analysis, null, 2))
  } else {
    console.log(formatPartMatchRuleAnalysis(analysis))

    if (colorConflictReportDir) {
      console.log(`\nWrote color-conflict report to ${colorConflictReportDir}`)
    }

    if (groupingConflictReportDir) {
      console.log(`\nWrote grouping-conflict report to ${groupingConflictReportDir}`)
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
