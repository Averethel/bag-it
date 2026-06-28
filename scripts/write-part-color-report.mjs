import { existsSync } from "node:fs"
import { createHash } from "node:crypto"
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
  CALLOUT_PART_EXTRACTOR_VERSION,
} from "../packages/callout-parts/src/index.ts"
import {
  auditPartColorSampling,
  calibrateManualPartColors,
  PART_COLOR_CALIBRATION_VERSION,
  PART_COLOR_SAMPLE_DECISION,
  samplePartColor,
} from "../packages/part-colors/src/index.ts"
import {
  classifyPartColorMismatch,
  colorNamesMatch,
  findPartColorLabelConflicts,
  findPartColorLabelSetForReport,
} from "./part-color-label-eval.mjs"
import {
  PART_COLOR_LABEL_ROLES,
  countPartColorLabelRoles,
  isPartColorLabelScored,
} from "./part-color-label-roles.mjs"
import {
  readPartColorWorkbenchAssets,
  renderPartColorWorkbenchHtml,
} from "./part-color-workbench-assets.mjs"
import {
  buildPartColorWorkbenchData,
  createPartColorWorkbenchPages,
  renderPartColorWorkbenchDataScript,
} from "./part-color-workbench-view-model.mjs"

const DEFAULT_REPORT_ROOT = path.join(".bag-it", "private", "part-color-reports")

export async function writePartColorReport({
  colorSource = "saved-app-result",
  generatedAt = new Date(),
  labelDir,
  outputDir,
  recomputeColors = false,
  sessionPath,
} = {}) {
  if (!sessionPath) {
    throw new Error("sessionPath is required.")
  }

  const session = JSON.parse(await readFile(sessionPath, "utf8"))
  const shouldRecomputeColors = recomputeColors || colorSource === "recomputed-manual-render"
  const resolvedColorSource = shouldRecomputeColors
    ? "recomputed-manual-render"
    : "saved-app-result"
  const colorAnalysis = await createPartColorReportAnalysis(session, {
    useRenderedColors: shouldRecomputeColors,
    useRenderedSamples: shouldRecomputeColors,
  })
  const resolvedOutputDir = outputDir ?? defaultReportDir(sessionPath, generatedAt)
  const reportPath = path.join(resolvedOutputDir, "report.json")
  const manualId = path.basename(resolvedOutputDir)
  const labelSet = findPartColorLabelSetForReport({
    labelDir,
    manualId,
    reportPath,
  })
  const report = buildPartColorReport(session, {
    colorAnalysis,
    colorSource: resolvedColorSource,
    generatedAt,
    labelSet,
    manualId,
    reportPath,
    sourceSessionPath: sessionPath,
  })
  const workbenchData = buildPartColorWorkbenchData(report)
  const workbenchPages = createPartColorWorkbenchPages(workbenchData)
  const workbenchAssets = await readPartColorWorkbenchAssets()

  await mkdir(resolvedOutputDir, { recursive: true })
  await removeStaleWorkbenchChunkFiles(resolvedOutputDir, workbenchPages)
  await writeFile(
    path.join(resolvedOutputDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  for (const page of workbenchPages) {
    await writeFile(
      path.join(resolvedOutputDir, page.htmlName),
      renderPartColorWorkbenchHtml(page.data, { dataScriptName: page.dataScriptName }),
    )
    await writeFile(
      path.join(resolvedOutputDir, page.dataScriptName),
      renderPartColorWorkbenchDataScript(page.data),
    )
  }
  await writeFile(
    path.join(resolvedOutputDir, "workbench.js"),
    workbenchAssets.script,
  )
  await writeFile(
    path.join(resolvedOutputDir, "workbench.css"),
    workbenchAssets.styles,
  )
  await writeFile(
    path.join(resolvedOutputDir, "details.html"),
    renderPartColorReportHtml(report),
  )

  return {
    outputDir: resolvedOutputDir,
    report,
  }
}

async function removeStaleWorkbenchChunkFiles(outputDir, pages) {
  const keepFiles = new Set(pages.flatMap((page) => [page.htmlName, page.dataScriptName]))
  const entries = await readdir(outputDir).catch((error) => {
    if (error?.code === "ENOENT") {
      return []
    }

    throw error
  })

  await Promise.all(entries
    .filter((entry) => isGeneratedWorkbenchChunkFile(entry) && !keepFiles.has(entry))
    .map((entry) => rm(path.join(outputDir, entry), { force: true })))
}

function isGeneratedWorkbenchChunkFile(entry) {
  return /^part-\d{3}\.html$/.test(entry) ||
    /^workbench-data-\d{3}\.js$/.test(entry)
}

export function buildPartColorReport(
  session,
  {
    colorAnalysis = createEmptyColorAnalysis(),
    colorSource = "saved-app-result",
    generatedAt = new Date(),
    labelSet = null,
    manualId = null,
    reportPath = null,
    sourceSessionPath = null,
  } = {},
) {
  const rows = collectPartColorRows(session, colorAnalysis)
  const sourcePreviews = createSourcePreviewSummaries(rows)
  const labelAnalysis = createReportLabelAnalysis(rows, labelSet)
  const includeLabels = labelAnalysis.summary !== null
  const labelsByItemId = labelAnalysis.labelsByItemId
  const detectedRows = rows.filter((row) => row.detectedColor)
  const unknownRows = rows.filter((row) => !row.detectedColor?.manualClassId)
  const reviewRows = detectedRows.filter((row) =>
    row.detectedColor.manualClassTrusted !== true ||
    row.detectedColor.status !== "exact" ||
    row.detectedColor.nameSource !== "palette-match"
  )
  const classes = createManualClassSummaries(detectedRows, { includeLabels, labelsByItemId })
  const rawClasses = createManualClassSummaries(detectedRows, { includeLabels, labelsByItemId, raw: true })
  const versions = createReportVersionSummary(session, { colorSource })

  return {
    ...(includeLabels ? {
      annotatedMismatches: labelAnalysis.annotatedMismatches,
      labelConflicts: labelAnalysis.labelConflicts,
      labels: labelAnalysis.summary,
    } : {}),
    classes,
    colorSource,
    generatedAt: generatedAt.toISOString(),
    manualId,
    reportPath,
    reviewRows: reviewRows.map((row) => summarizeRow(row, labelsByItemId.get(row.itemId), { includeLabels })),
    sourcePreviews,
    sourceSessionPath,
    totals: {
      classes: classes.length,
      detectedRows: detectedRows.length,
      ...(includeLabels ? {
        labelConflicts: labelAnalysis.summary.conflicts,
        labelMismatches: labelAnalysis.summary.mismatched,
        labeledRows: labelAnalysis.summary.total,
      } : {}),
      rawClasses: rawClasses.length,
      reviewRows: reviewRows.length,
      rows: rows.length,
      unknownRows: unknownRows.length,
    },
    rawClasses,
    unknownRows: unknownRows.map((row) => summarizeRow(row, labelsByItemId.get(row.itemId), { includeLabels })),
    versions,
  }
}

function createSourcePreviewSummaries(rows) {
  const previewsByCalloutId = new Map()

  for (const row of rows) {
    if (!row.calloutId || previewsByCalloutId.has(row.calloutId)) {
      continue
    }

    if (!row.calloutImageDataUrl && !row.calloutRegion) {
      continue
    }

    previewsByCalloutId.set(row.calloutId, {
      calloutId: row.calloutId,
      imageDataUrl: row.calloutImageDataUrl ?? null,
      pageNumber: row.pageNumber,
      region: row.calloutRegion ?? null,
      stepIndex: row.stepIndex,
    })
  }

  return [...previewsByCalloutId.values()].sort((left, right) =>
    (left.pageNumber ?? 0) - (right.pageNumber ?? 0) ||
    (left.stepIndex ?? 0) - (right.stepIndex ?? 0) ||
    left.calloutId.localeCompare(right.calloutId),
  )
}

function createReportVersionSummary(session, { colorSource = "saved-app-result" } = {}) {
  const result = session?.stepDetectionResult ?? {}
  const partColorCalibrationVersion = result.partColorCalibrationVersion ?? null
  const partExtractorVersion = result.partExtractorVersion ?? null
  const usesCurrentPartColorCalibration = colorSource === "recomputed-manual-render"

  return {
    currentPartColorCalibrationVersion: PART_COLOR_CALIBRATION_VERSION,
    currentPartExtractorVersion: CALLOUT_PART_EXTRACTOR_VERSION,
    detectorVersion: result.detectorVersion ?? null,
    partColorCalibrationStale: !usesCurrentPartColorCalibration &&
      partColorCalibrationVersion !== PART_COLOR_CALIBRATION_VERSION,
    partColorCalibrationVersion: usesCurrentPartColorCalibration
      ? PART_COLOR_CALIBRATION_VERSION
      : partColorCalibrationVersion,
    partColorCalibrationVersionSource: usesCurrentPartColorCalibration ? "recomputed-current-code" : "saved-session",
    partExtractorStale: partExtractorVersion !== CALLOUT_PART_EXTRACTOR_VERSION,
    partExtractorVersion,
    savedPartColorCalibrationVersion: partColorCalibrationVersion,
  }
}

function createEmptyColorAnalysis() {
  return {
    calloutPreviewDataUrlsByCalloutId: new Map(),
    calloutPreviewRegionsByCalloutId: new Map(),
    colorsComputed: false,
    colorsByPartId: new Map(),
    previewDataUrlsByPartId: new Map(),
    sampleOverlayDataUrlsByPartId: new Map(),
    samplesByPartId: new Map(),
  }
}

function collectPartColorRows(session, colorAnalysis) {
  const callouts = session?.stepDetectionResult?.callouts ?? []

  return callouts.flatMap((callout) => {
    const calloutImageDataUrl = colorAnalysis.calloutPreviewDataUrlsByCalloutId?.get(callout.id) ??
      readCalloutImageDataUrl(callout)
    const calloutRegion = colorAnalysis.calloutPreviewRegionsByCalloutId?.get(callout.id) ??
      readCalloutRegion(callout)

    return (callout.partItems ?? []).map((partItem) => ({
      calloutId: callout.id,
      calloutImageDataUrl,
      calloutRegion,
      colorSample: colorAnalysis.samplesByPartId.get(partItem.id) ?? detectedColorSample(partItem.detectedColor),
      detectedColor: readReportDetectedColor(colorAnalysis, partItem),
      imageDataUrl: colorAnalysis.previewDataUrlsByPartId.get(partItem.id) ?? readPartImageDataUrl(partItem),
      itemId: partItem.id,
      pageNumber: callout.pageNumber,
      partRegion: partItem.partImage?.region ?? partItem.partCrop?.region ?? partItem.partRegion ?? null,
      quantity: partItem.quantity?.value ?? null,
      sampleOverlayDataUrl: colorAnalysis.sampleOverlayDataUrlsByPartId.get(partItem.id) ?? null,
      stepIndex: callout.stepIndex,
    }))
  })
}

function readReportDetectedColor(colorAnalysis, partItem) {
  if (colorAnalysis.colorsComputed) {
    return colorAnalysis.colorsByPartId.get(partItem.id) ?? null
  }

  return colorAnalysis.colorsByPartId.get(partItem.id) ?? partItem.detectedColor ?? null
}

function createReportLabelAnalysis(rows, labelSet) {
  if (!labelSet) {
    return {
      annotatedMismatches: [],
      labelConflicts: [],
      labelsByItemId: new Map(),
      summary: null,
    }
  }

  const rowsById = new Map(rows.map((row) => [row.itemId, row]))
  const scoredLabels = labelSet.labels.filter(isPartColorLabelScored)
  const labelConflicts = findPartColorLabelConflicts({
    labels: scoredLabels,
    rowsById,
  })
  const conflictsByItemId = new Map(labelConflicts.map((conflict) => [
    conflict.itemId,
    conflict,
  ]))
  const labelsByItemId = new Map(labelSet.labels.map((label) => [
    label.itemId,
    conflictsByItemId.has(label.itemId)
      ? { ...label, labelConflict: conflictsByItemId.get(label.itemId) }
      : label,
  ]))
  const annotatedMismatches = []
  const classificationCounts = new Map()
  let conflicts = 0
  let matched = 0
  let mismatched = 0
  let missing = 0

  for (const label of scoredLabels) {
    if (conflictsByItemId.has(label.itemId)) {
      conflicts += 1
      continue
    }

    const row = rowsById.get(label.itemId)

    if (!row) {
      missing += 1
      incrementLabelClassification(classificationCounts, label.expectedName, "missing row")
      annotatedMismatches.push({
        actualName: "missing row",
        category: classifyPartColorMismatch(label.expectedName, "missing row"),
        expectedName: label.expectedName,
        itemId: label.itemId,
        note: label.note,
        status: "missing",
      })
      continue
    }

    const actualName = displayColorName(row.detectedColor) ?? "Unknown"
    const labelStatus = readLabelStatus(label, row, actualName)

    if (labelStatus === "match") {
      matched += 1
      continue
    }

    mismatched += 1
    incrementLabelClassification(classificationCounts, label.expectedName, labelStatus === "drift" ? "row crop drift" : actualName)
    annotatedMismatches.push({
      actualName: labelStatus === "drift" ? "row crop drift" : actualName,
      category: classifyPartColorMismatch(label.expectedName, labelStatus === "drift" ? "row crop drift" : actualName),
      expectedName: label.expectedName,
      itemId: label.itemId,
      note: label.note,
      status: labelStatus,
    })
  }

  return {
    annotatedMismatches,
    labelConflicts,
    labelsByItemId,
    summary: {
      labelPath: labelSet.labelPath,
      classificationCounts: sortLabelClassificationCounts([...classificationCounts.values()]),
      conflicts,
      excluded: labelSet.labels.length - scoredLabels.length,
      manualId: labelSet.manualId,
      matched,
      mismatched,
      missing,
      reportPath: labelSet.reportPath,
      roleCounts: countPartColorLabelRoles(labelSet.labels),
      status: labelSet.status,
      total: scoredLabels.length,
    },
  }
}

function incrementLabelClassification(counts, expectedName, actualName) {
  const category = classifyPartColorMismatch(expectedName, actualName)
  const count = counts.get(category) ?? { category, count: 0 }

  count.count += 1
  counts.set(category, count)
}

function sortLabelClassificationCounts(counts) {
  return counts.sort((left, right) =>
    right.count - left.count ||
    left.category.localeCompare(right.category),
  )
}

function detectedColorSample(detectedColor) {
  if (!detectedColor?.sampleChips) {
    return null
  }

  return {
    baseChips: detectedColor.sampleBaseChips ?? [],
    baseDominantCoverage: detectedColor.sampleBaseDominantCoverage ?? null,
    baseEdgeChips: detectedColor.sampleBaseEdgeChips ?? [],
    basePixelCount: detectedColor.sampleBasePixelCount ?? null,
    baseRejectedPixelCount: detectedColor.sampleBaseRejectedPixelCount ?? null,
    baseRejectionCounts: detectedColor.sampleBaseRejectionCounts ?? null,
    baseStatus: detectedColor.sampleBaseStatus ?? null,
    baseVariance: detectedColor.sampleBaseVariance ?? null,
    chips: detectedColor.sampleChips,
    dominantCoverage: detectedColor.sampleChips[0]?.coverage ?? 0,
    edgeChips: detectedColor.sampleEdgeChips ?? [],
    hex: detectedColor.observedHex,
    pixelCount: detectedColor.sampleChips.reduce((total, chip) => total + chip.pixelCount, 0),
    rejectionCounts: detectedColor.sampleRejectionCounts ?? null,
    rejectedPixelCount: detectedColor.sampleRejectionCounts
      ? Object.values(detectedColor.sampleRejectionCounts).reduce((total, count) => total + count, 0)
      : 0,
    resampleReason: detectedColor.sampleResampleReason ?? null,
    rgb: detectedColor.observedRgb,
    sampleScale: detectedColor.sampleScale ?? null,
    selectedChipIndex: 0,
    stability: detectedColor.confidence ?? 0,
    status: detectedColor.sampleStatus ?? "review",
    variance: 0,
  }
}

function createManualClassSummaries(rows, { includeLabels = false, labelsByItemId = new Map(), raw = false } = {}) {
  const classesById = new Map()

  for (const row of rows) {
    const color = row.detectedColor
    const classId = raw ? color?.rawManualClassId ?? color?.manualClassId : color?.manualClassId

    if (!classId) {
      continue
    }

    const summary = classesById.get(classId) ?? createClassSummary(color, { classId, raw })
    summary.rows.push(summarizeRow(row, labelsByItemId.get(row.itemId), { includeLabels }))
    summary.rowCount = summary.rows.length
    summary.quantityCount += row.quantity ?? 1
    summary.trustedRows += color.manualClassTrusted === true ? 1 : 0
    classesById.set(classId, summary)
  }

  return [...classesById.values()].sort(compareClassSummaries)
}

function createClassSummary(color, { classId, raw = false } = {}) {
  const id = classId ?? color.manualClassId
  const sourceIds = color.manualClassSourceIds ?? [color.manualClassId].filter(Boolean)

  return {
    confidence: raw
      ? color.rawManualClassConfidence ?? color.manualClassConfidence ?? color.confidence ?? null
      : color.manualClassConfidence ?? color.confidence ?? null,
    distance: color.distance ?? null,
    family: color.family ?? "unknown",
    id,
    mergeReason: raw ? "raw" : color.manualClassMergeReason ?? "raw",
    name: displayColorName(color),
    nameSource: color.nameSource ?? "unknown",
    nearestPaletteNames: [color.name, ...(color.alternatives ?? [])].filter(Boolean).slice(0, 4),
    quantityCount: 0,
    rawClassIds: raw ? [id] : sourceIds,
    rowCount: 0,
    rows: [],
    status: color.status ?? "review",
    swatchHex: raw
      ? color.rawManualClassHex ?? color.manualClassHex ?? color.swatchHex ?? color.observedHex ?? null
      : color.manualClassHex ?? color.swatchHex ?? color.observedHex ?? null,
    trustedRows: 0,
  }
}

function compareClassSummaries(left, right) {
  return left.id.localeCompare(right.id)
}

function summarizeRow(row, label = null, { includeLabels = false } = {}) {
  const colorName = displayColorName(row.detectedColor)
  const cropHash = hashDataUrl(row.imageDataUrl)
  const labelStatus = includeLabels && label
    ? readLabelStatus(label, { imageDataUrl: row.imageDataUrl }, colorName)
    : null
  const labelNote = label?.note && labelStatus !== "match"
    ? label.note
    : null

  return {
    calloutId: row.calloutId,
    colorName,
    colorStatus: row.detectedColor?.status ?? null,
    confidence: row.detectedColor?.confidence ?? null,
    distance: row.detectedColor?.distance ?? null,
    family: row.detectedColor?.family ?? null,
    cropHash,
    imageDataUrl: row.imageDataUrl,
    itemId: row.itemId,
    ...(includeLabels ? {
      labelExpectedName: label?.expectedName ?? null,
      labelCropHash: label?.cropHash ?? null,
      labelNote,
      labelRole: label?.role ?? null,
      labelStatus,
    } : {}),
    manualClassId: row.detectedColor?.manualClassId ?? null,
    manualClassMergeReason: row.detectedColor?.manualClassMergeReason ?? null,
    manualClassSourceIds: row.detectedColor?.manualClassSourceIds ?? [],
    manualClassTrusted: row.detectedColor?.manualClassTrusted ?? false,
    observedHex: row.detectedColor?.observedHex ?? row.colorSample?.hex ?? null,
    pageNumber: row.pageNumber,
    partRegion: row.partRegion,
    quantity: row.quantity,
    rawManualClassId: row.detectedColor?.rawManualClassId ?? row.detectedColor?.manualClassId ?? null,
    ruleAnchorNames: row.detectedColor?.ruleAnchorNames ?? [],
    ruleCanonicalClassId: row.detectedColor?.ruleCanonicalClassId ?? row.detectedColor?.manualClassId ?? null,
    ruleCandidateNames: row.detectedColor?.ruleCandidateNames ?? [],
    ruleCandidateScores: row.detectedColor?.ruleCandidateScores ?? [],
    ruleId: row.detectedColor?.ruleId ?? null,
    ruleMergeReason: row.detectedColor?.ruleMergeReason ?? row.detectedColor?.manualClassMergeReason ?? null,
    ruleResolverKind: row.detectedColor?.ruleResolverKind ?? null,
    ruleScoreMargin: row.detectedColor?.ruleScoreMargin ?? null,
    ruleScoreTop: row.detectedColor?.ruleScoreTop ?? null,
    ruleSourceRawClassId: row.detectedColor?.ruleSourceRawClassId ?? row.detectedColor?.rawManualClassId ?? null,
    sampleChips: row.colorSample?.chips ?? [],
    sampleEdgeChips: row.colorSample?.edgeChips ?? [],
    sampleBaseChips: row.colorSample?.baseChips ?? row.detectedColor?.sampleBaseChips ?? [],
    sampleBaseDominantCoverage: row.colorSample?.baseDominantCoverage ?? row.detectedColor?.sampleBaseDominantCoverage ?? null,
    sampleBaseEdgeChips: row.colorSample?.baseEdgeChips ?? row.detectedColor?.sampleBaseEdgeChips ?? [],
    sampleBasePixelCount: row.colorSample?.basePixelCount ?? row.detectedColor?.sampleBasePixelCount ?? null,
    sampleBaseRejectedPixelCount: row.colorSample?.baseRejectedPixelCount ?? row.detectedColor?.sampleBaseRejectedPixelCount ?? null,
    sampleBaseRejections: row.colorSample?.baseRejectionCounts ?? row.detectedColor?.sampleBaseRejectionCounts ?? null,
    sampleBaseStatus: row.colorSample?.baseStatus ?? row.detectedColor?.sampleBaseStatus ?? null,
    sampleBaseVariance: row.colorSample?.baseVariance ?? row.detectedColor?.sampleBaseVariance ?? null,
    sampleDominantCoverage: row.colorSample?.dominantCoverage ?? null,
    sampleOverlayDataUrl: row.sampleOverlayDataUrl,
    samplePixelCount: row.colorSample?.pixelCount ?? null,
    sampleRejectedPixelCount: row.colorSample?.rejectedPixelCount ?? null,
    sampleRejections: row.colorSample?.rejectionCounts ?? null,
    sampleResampleReason: row.colorSample?.resampleReason ?? row.detectedColor?.sampleResampleReason ?? null,
    sampleScale: row.colorSample?.sampleScale ?? row.detectedColor?.sampleScale ?? null,
    sampleStatus: row.colorSample?.status ?? null,
    sampleVariance: row.colorSample?.variance ?? null,
    sourcePreviewId: row.calloutId,
    stepIndex: row.stepIndex,
    swatchHex: row.detectedColor?.swatchHex ?? row.detectedColor?.observedHex ?? null,
  }
}

function readLabelStatus(label, row, actualName) {
  if (label.role === "excluded") {
    return "excluded"
  }

  if (label.labelConflict) {
    return "conflict"
  }

  if (label.cropHash) {
    const rowHash = hashDataUrl(row.imageDataUrl)

    if (rowHash !== label.cropHash) {
      return "drift"
    }
  }

  return colorNamesMatch(label.expectedName, actualName) ? "match" : "mismatch"
}

function hashDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || dataUrl.length === 0) {
    return null
  }

  return createHash("sha256").update(dataUrl).digest("hex")
}

function displayColorName(color) {
  if (!color) {
    return null
  }

  return color.status === "family"
    ? `${color.family ?? "unknown"} family`
    : color.name ?? "Unknown"
}

function readPartImageDataUrl(partItem) {
  return partItem.partImage?.imageDataUrl ?? partItem.partCrop?.imageDataUrl ?? null
}

function readCalloutImageDataUrl(callout) {
  return callout.crop?.imageDataUrl ?? callout.calloutCrop?.imageDataUrl ?? null
}

function readCalloutRegion(callout) {
  return callout.crop?.region ?? callout.calloutCrop?.region ?? callout.sourceRegion ?? null
}

export function renderPartColorReportHtml(report) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Bag It Part Color Report</title>
  <style>
    body { color: #1f2933; font: 14px/1.45 system-ui, sans-serif; margin: 32px; }
    table { border-collapse: collapse; margin: 16px 0 32px; width: 100%; }
    th, td { border-bottom: 1px solid #d8dee4; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f6f8fa; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
    .swatch { border: 1px solid #8c959f; display: inline-block; height: 22px; margin-right: 8px; vertical-align: middle; width: 38px; }
    .crop {
      background-color: #ffffff;
      background-image:
        linear-gradient(45deg, #d8dee4 25%, transparent 25%),
        linear-gradient(-45deg, #d8dee4 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #d8dee4 75%),
        linear-gradient(-45deg, transparent 75%, #d8dee4 75%);
      background-position: 0 0, 0 6px, 6px -6px, -6px 0;
      background-size: 12px 12px;
      border: 1px solid #8c959f;
      max-height: 72px;
      max-width: 112px;
      object-fit: contain;
    }
    .sample-crops { display: flex; flex-wrap: wrap; gap: 4px; }
    .sample-crop-link { display: inline-block; position: relative; }
    .sample-index {
      background: rgba(31, 41, 51, .82);
      color: #fff;
      font-size: 10px;
      left: 2px;
      line-height: 1;
      padding: 2px 3px;
      position: absolute;
      top: 2px;
    }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; max-width: 260px; }
    .chip { align-items: center; border: 1px solid #d8dee4; display: inline-flex; gap: 4px; padding: 2px 4px; white-space: nowrap; }
    .chip-swatch { border: 1px solid #8c959f; display: inline-block; height: 14px; width: 22px; }
    .label-status { border-radius: 3px; display: inline-block; font-size: 12px; font-weight: 600; padding: 2px 6px; }
    .label-match { background: #dcfce7; color: #166534; }
    .label-mismatch, .label-missing, .label-drift { background: #fee2e2; color: #991b1b; }
    .label-conflict { background: #fef3c7; color: #92400e; }
    .label-excluded { background: #e2e8f0; color: #334155; }
    .muted { color: #6b7280; }
    h3 { margin: 24px 0 0; }
  </style>
</head>
<body>
  <h1>Bag It Part Color Report</h1>
  <p class="muted">Generated ${escapeHtml(report.generatedAt)} from ${escapeHtml(report.sourceSessionPath ?? "session")}.</p>
  ${renderColorSourceSummary(report.colorSource)}
  ${renderVersionSummary(report.versions)}
  ${renderLabelSummary(report.labels)}
  <p><a href="./index.html">Open Label Workbench</a></p>
  <p>${report.totals.rows} rows, ${report.totals.classes} merged color classes, ${report.totals.rawClasses ?? report.totals.classes} raw color classes, ${report.totals.reviewRows} review rows, ${report.totals.unknownRows} unknown rows.</p>
  ${renderLabelConflicts(report.labelConflicts ?? [])}
  ${renderAnnotatedMismatches(report.annotatedMismatches ?? [])}
  <h2>Merged Color Classes</h2>
  <p class="muted">Summary by app color bucket. Parts matches the app's Bags color bucket quantity; Rows is the row-level audit count. The samples column shows every assigned part crop so class splits and accidental merges are visible at a glance.</p>
  ${renderClassTable(report.classes, { showSourceIds: true })}
  <h2>Raw Color Classes</h2>
  <p class="muted">Diagnostic pre-merge classes. Use this when a merged app bucket still contains a suspicious crop.</p>
  ${renderClassTable(report.rawClasses ?? [])}
  <h2>Rows By Merged Color Class</h2>
  <p class="muted">Use this section for row-level audit. Crop is the masked part preview, Sampling shows accepted body pixels and rejected/deprioritized pixels, Chips lists the sampled color clusters, and Sample shows selected coverage plus rejected-pixel counts.</p>
  ${renderClassRowSections(report.classes)}
  <h2>Review Rows</h2>
  ${renderRowTable(report.reviewRows)}
  <h2>Unknown Rows</h2>
  ${renderRowTable(report.unknownRows)}
</body>
</html>
`
}

function renderColorSourceSummary(colorSource) {
  if (colorSource === "recomputed-manual-render") {
    return "<p class=\"muted\">Color source: recomputed from embedded manual bytes. Use only for renderer drift research; app parity is not guaranteed.</p>"
  }

  return "<p class=\"muted\">Color source: saved app result. This is the tuning view for app/report parity.</p>"
}

function renderVersionSummary(versions) {
  if (!versions) {
    return ""
  }

  const partColorVersionText = versions.partColorCalibrationVersionSource === "recomputed-current-code"
    ? `${escapeHtml(versions.partColorCalibrationVersion ?? "missing")} recomputed from current code; saved ${escapeHtml(versions.savedPartColorCalibrationVersion ?? "missing")}`
    : `${escapeHtml(versions.partColorCalibrationVersion ?? "missing")} / current ${escapeHtml(versions.currentPartColorCalibrationVersion)}`
  const staleWarnings = [
    versions.partExtractorStale ? "part extractor" : null,
    versions.partColorCalibrationStale ? "part color calibration" : null,
  ].filter(Boolean)

  return `
    <p class="muted">Versions: detector ${escapeHtml(versions.detectorVersion ?? "missing")}; part extractor ${escapeHtml(versions.partExtractorVersion ?? "missing")} / current ${escapeHtml(versions.currentPartExtractorVersion)}; part color ${partColorVersionText}.</p>
    ${staleWarnings.length > 0 ? `<p><strong>Stale session warning:</strong> ${escapeHtml(staleWarnings.join(", "))} version differs from current code.</p>` : ""}
  `
}

function renderLabelSummary(labels) {
  if (!labels) {
    return ""
  }

  const classifications = (labels.classificationCounts ?? [])
    .map((classification) => `${escapeHtml(classification.category)}: ${classification.count}`)
    .join("; ")

  const conflictText = labels.conflicts
    ? `, ${labels.conflicts} conflicts`
    : ""
  const excludedText = labels.excluded
    ? `, ${labels.excluded} excluded`
    : ""
  const roleText = labels.roleCounts
    ? ` Roles: ${PART_COLOR_LABEL_ROLES
        .filter((role) => labels.roleCounts[role])
        .map((role) => `${role} ${labels.roleCounts[role]}`)
        .join(", ")}.`
    : ""

  return `
    <p class="muted">Labels: ${escapeHtml(labels.manualId)} (${escapeHtml(labels.status)}) from ${escapeHtml(labels.labelPath)}; ${labels.matched}/${labels.total} matched, ${labels.mismatched} mismatched, ${labels.missing} missing${conflictText}${excludedText}.${escapeHtml(roleText)}</p>
    ${classifications ? `<p class="muted">Mismatch classes: ${classifications}.</p>` : ""}
  `
}

function renderLabelConflicts(conflicts) {
  if (conflicts.length === 0) {
    return ""
  }

  const rows = groupLabelConflicts(conflicts).map((conflict) => `<tr>
    <td>${escapeHtml(conflict.cropHash)}</td>
    <td>${escapeHtml(conflict.evidenceSource)}</td>
    <td>${escapeHtml(conflict.conflictItemIds.join(", "))}</td>
    <td>${escapeHtml(conflict.conflictingExpectedNames.join(" / "))}</td>
    <td>${escapeHtml(conflict.notes.join(" / "))}</td>
  </tr>`).join("")

  return `
    <h2>Label Conflicts</h2>
    <p class="muted">Same crop evidence has contradictory expected colors. These rows are label conflicts, not detector mismatches.</p>
    <table>
      <thead><tr><th>Crop hash</th><th>Evidence</th><th>Rows</th><th>Expected names</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

function renderAnnotatedMismatches(mismatches) {
  if (mismatches.length === 0) {
    return ""
  }

  const rows = mismatches.map((mismatch) => `<tr>
    <td>${escapeHtml(mismatch.itemId)}</td>
    <td>${escapeHtml(mismatch.expectedName)}</td>
    <td>${escapeHtml(mismatch.actualName)}</td>
    <td>${renderLabelStatus(mismatch.status)}<br><span class="muted">${escapeHtml(mismatch.category ?? "")}</span></td>
    <td>${escapeHtml(mismatch.note ?? "")}</td>
  </tr>`).join("")

  return `
    <h2>Annotated Mismatches</h2>
    <table>
      <thead><tr><th>Row</th><th>Expected</th><th>Actual</th><th>Status</th><th>Note</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

function groupLabelConflicts(conflicts) {
  const groupsByCropHash = new Map()

  for (const conflict of conflicts) {
    const group = groupsByCropHash.get(conflict.cropHash) ?? {
      conflictItemIds: conflict.conflictItemIds,
      conflictingExpectedNames: conflict.conflictingExpectedNames,
      cropHash: conflict.cropHash,
      evidenceSource: conflict.evidenceSource,
      notes: [],
    }

    if (conflict.note) {
      group.notes.push(conflict.note)
    }

    groupsByCropHash.set(conflict.cropHash, group)
  }

  return [...groupsByCropHash.values()].sort((left, right) =>
    left.cropHash.localeCompare(right.cropHash),
  )
}

function renderClassTable(classes, { showSourceIds = false } = {}) {
  if (classes.length === 0) {
    return "<p>No detected manual color classes.</p>"
  }

  const rows = classes.map((manualClass) => `<tr>
    <td>${renderSwatch(manualClass.swatchHex)}${escapeHtml(manualClass.id)}</td>
    <td>${escapeHtml(manualClass.name)}<br><span class="muted">${escapeHtml(manualClass.family)} / ${escapeHtml(manualClass.nameSource)}</span></td>
    <td>${manualClass.rowCount}</td>
    <td>${manualClass.quantityCount}</td>
    <td>${renderSampleCrops(manualClass.rows)}</td>
    <td>${formatNumber(manualClass.confidence)}</td>
    <td>${manualClass.trustedRows}/${manualClass.rowCount}</td>
    <td>${escapeHtml(manualClass.status)}</td>
    ${showSourceIds ? `<td>${escapeHtml(manualClass.mergeReason ?? "raw")}<br><span class="muted">${escapeHtml((manualClass.rawClassIds ?? []).join(", "))}</span></td>` : ""}
    <td>${formatNumber(manualClass.distance)}</td>
    <td>${escapeHtml(manualClass.nearestPaletteNames.join(", "))}</td>
  </tr>`).join("")

  return `<table>
    <thead><tr><th>Class</th><th>Name</th><th>Rows</th><th>Parts</th><th>Samples</th><th>Confidence</th><th>Trusted</th><th>Status</th>${showSourceIds ? "<th>Merge</th>" : ""}<th>Distance</th><th>Nearest Palette</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

function renderClassRowSections(classes) {
  if (classes.length === 0) {
    return "<p>No detected manual color classes.</p>"
  }

  return classes.map((manualClass) => `
    <section>
      <h3>${renderSwatch(manualClass.swatchHex)}${escapeHtml(manualClass.id)} - ${escapeHtml(manualClass.name)}</h3>
      ${renderRowTable(manualClass.rows, { anchorRows: true })}
    </section>
  `).join("")
}

function renderRowTable(rows, { anchorRows = false } = {}) {
  if (rows.length === 0) {
    return "<p>No rows.</p>"
  }

  const showExpectedColumn = rows.some((row) =>
    row.labelExpectedName || row.labelStatus || row.labelNote,
  )
  const tableRows = rows.map((row) => `<tr${anchorRows ? ` id="${escapeAttribute(rowAnchorId(row))}"` : ""}>
    <td>${renderCrop(row.imageDataUrl)}</td>
    <td>${renderCrop(row.sampleOverlayDataUrl)}</td>
    <td>${escapeHtml(row.itemId)}</td>
    <td>${escapeHtml(row.manualClassId ?? "unknown")}<br><span class="muted">raw ${escapeHtml(row.rawManualClassId ?? "unknown")}</span></td>
    <td>${escapeHtml(row.colorName ?? "Unknown")}<br><span class="muted">${escapeHtml(row.colorStatus ?? "unknown")} / ${row.manualClassTrusted ? "trusted" : "untrusted"}</span></td>
    ${showExpectedColumn ? `<td>${renderRowLabel(row)}</td>` : ""}
    <td>${renderResolverDiagnostics(row)}</td>
    <td>${renderSampleChips(row.sampleChips)}</td>
    <td>${renderSampleChips(row.sampleEdgeChips)}</td>
    <td>${renderSampleChips(row.sampleBaseChips)}</td>
    <td>${row.quantity ?? ""}</td>
    <td>${row.pageNumber ?? ""}</td>
    <td>${row.stepIndex ?? ""}</td>
    <td>${formatNumber(row.confidence)}</td>
    <td>${formatNumber(row.distance)}</td>
    <td>${escapeHtml(formatSampleStats(row))}</td>
  </tr>`).join("")

  return `<table>
    <thead><tr><th>Crop</th><th>Sampling</th><th>Row</th><th>Class</th><th>Color</th>${showExpectedColumn ? "<th>Expected</th>" : ""}<th>Resolver</th><th>Chips</th><th>Edge chips</th><th>Base chips</th><th>Qty</th><th>Page</th><th>Step</th><th>Confidence</th><th>Distance</th><th>Sample</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>`
}

function renderResolverDiagnostics(row) {
  const parts = []

  if (row.ruleId) {
    parts.push(escapeHtml(row.ruleId))
  }

  if (typeof row.ruleScoreTop === "number" || typeof row.ruleScoreMargin === "number") {
    parts.push(`<span class="muted">top ${formatNumber(row.ruleScoreTop)} / margin ${formatNumber(row.ruleScoreMargin)}</span>`)
  }

  if (row.ruleResolverKind) {
    parts.push(`<span class="muted">${escapeHtml(row.ruleResolverKind)}</span>`)
  }

  if (row.ruleCandidateScores?.length) {
    parts.push(`<span class="muted">${row.ruleCandidateScores
      .slice(0, 4)
      .map((candidate) => `${escapeHtml(candidate.name)} ${formatNumber(candidate.score)}`)
      .join("<br>")}</span>`)
  }

  if (row.ruleAnchorNames?.length) {
    parts.push(`<span class="muted">anchors ${escapeHtml(row.ruleAnchorNames.slice(0, 5).join(", "))}</span>`)
  }

  return parts.join("<br>")
}

function renderRowLabel(row) {
  if (!row.labelExpectedName) {
    return ""
  }

  const shouldShowNote = row.labelNote && row.labelStatus !== "match"

  return `${escapeHtml(row.labelExpectedName)}<br>${renderLabelStatus(row.labelStatus)}${shouldShowNote ? `<br><span class="muted">${escapeHtml(row.labelNote)}</span>` : ""}`
}

function renderLabelStatus(status) {
  if (!status) {
    return ""
  }

  return `<span class="label-status label-${escapeAttribute(status)}">${escapeHtml(status)}</span>`
}

function renderSwatch(hex) {
  if (!hex) {
    return ""
  }

  return `<span class="swatch" style="background:${escapeAttribute(hex)}"></span>`
}

function renderSampleCrops(rows) {
  const images = rows.filter((row) => row.imageDataUrl)

  return `<div class="sample-crops">${images.map((row, index) => renderSummaryCrop(row, index + 1)).join("")}</div>`
}

function renderSummaryCrop(row, index) {
  const label = `${index}: ${row.itemId}`

  return `<a class="sample-crop-link" href="#${escapeAttribute(rowAnchorId(row))}" title="${escapeAttribute(label)}"><span class="sample-index">${index}</span><img class="crop" alt="${escapeAttribute(label)}" src="${escapeAttribute(row.imageDataUrl)}"></a>`
}

function renderCrop(imageDataUrl) {
  return imageDataUrl
    ? `<a href="${escapeAttribute(imageDataUrl)}" target="_blank" rel="noreferrer"><img class="crop" alt="" src="${escapeAttribute(imageDataUrl)}"></a>`
    : ""
}

function rowAnchorId(row) {
  return `row-${row.itemId.replace(/[^a-z0-9_-]+/gi, "-")}`
}

function renderSampleChips(chips) {
  if (!chips?.length) {
    return ""
  }

  return `<div class="chips">${chips.slice(0, 6).map((chip) => `
    <span class="chip"><span class="chip-swatch" style="background:${escapeAttribute(chip.hex)}"></span>${escapeHtml(chip.hex)} ${formatPercent(chip.coverage)}</span>
  `).join("")}</div>`
}

function formatSampleStats(row) {
  const parts = []

  if (row.sampleStatus) {
    parts.push(row.sampleStatus)
  }

  if (typeof row.sampleScale === "number" && row.sampleScale > 1) {
    parts.push(`scale ${formatNumber(row.sampleScale)}x`)
  }

  if (row.sampleResampleReason) {
    parts.push(`resample ${row.sampleResampleReason}`)
  }

  if (row.observedHex) {
    parts.push(`selected ${row.observedHex}`)
  }

  if (typeof row.samplePixelCount === "number") {
    parts.push(`${row.samplePixelCount} px`)
  }

  if (typeof row.sampleDominantCoverage === "number") {
    parts.push(`${formatPercent(row.sampleDominantCoverage)} selected`)
  }

  if (typeof row.sampleRejectedPixelCount === "number" && row.sampleRejectedPixelCount > 0) {
    parts.push(`${row.sampleRejectedPixelCount} rejected`)
  }

  if (typeof row.sampleRejections?.edge === "number" && row.sampleRejections.edge > 0) {
    parts.push(`${row.sampleRejections.edge} edge`)
  }

  if (typeof row.sampleBasePixelCount === "number") {
    parts.push(`base ${row.sampleBasePixelCount} px`)
  }

  if (typeof row.sampleBaseDominantCoverage === "number") {
    parts.push(`base ${formatPercent(row.sampleBaseDominantCoverage)} selected`)
  }

  return parts.join(" / ")
}

function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : ""
}

function formatPercent(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : ""
}

function defaultReportDir(sessionPath, generatedAt) {
  const baseName = path.basename(sessionPath, ".bagit-session.json")
  const stamp = generatedAt.toISOString().replace(/[:.]/g, "-")

  return path.join(DEFAULT_REPORT_ROOT, `${slugify(baseName)}-${stamp}`)
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "session"
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char])
}

function escapeAttribute(value) {
  return escapeHtml(value)
}

export async function createPartColorReportAnalysis(
  session,
  {
    useRenderedColors = true,
    useRenderedSamples = true,
  } = {},
) {
  const analysis = createEmptyColorAnalysis()

  if (!session?.manual?.dataBase64) {
    return analysis
  }

  const canvas = await loadCanvasModule()

  if (!canvas) {
    return analysis
  }

  installPdfCanvasGlobals(canvas)
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const pdfData = Uint8Array.from(Buffer.from(session.manual.dataBase64, "base64"))
  const document = await pdfjs.getDocument({ data: pdfData, disableWorker: true }).promise
  const pagePreviews = new Map(
    (session.stepDetectionResult?.pagePreviews ?? [])
      .map((preview) => [preview.pageNumber, preview]),
  )

  try {
    for (const [pageNumber, partItems] of collectPreviewPartItemsByPage(session)) {
      const page = await document.getPage(pageNumber)
      const viewport = createReportViewport(page, pagePreviews.get(pageNumber))
      const sourceCanvas = canvas.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
      const context = sourceCanvas.getContext("2d")
      let highResolutionPageImage = null

      await page.render({ canvasContext: context, viewport }).promise
      const pageImage = context.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
      const readHighResolutionPageImage = async () => {
        if (highResolutionPageImage) {
          return highResolutionPageImage
        }

        highResolutionPageImage = await renderHighResolutionReportPageImage(canvas, page, viewport)
        return highResolutionPageImage
      }

      for (const { callout, partItem } of partItems) {
        if (callout.id && !analysis.calloutPreviewDataUrlsByCalloutId.has(callout.id)) {
          const calloutPreview = await createCalloutPreview(canvas, sourceCanvas, callout)

          if (calloutPreview) {
            analysis.calloutPreviewDataUrlsByCalloutId.set(callout.id, calloutPreview.imageDataUrl)
            analysis.calloutPreviewRegionsByCalloutId.set(callout.id, calloutPreview.region)
          }
        }

        const normalizedPartImage = normalizePartImageForSampling(partItem.partImage)
        const imageDataUrl = await createMaskedPartPreviewDataUrl(canvas, sourceCanvas, partItem)

        if (imageDataUrl) {
          analysis.previewDataUrlsByPartId.set(partItem.id, imageDataUrl)
        }

        if (!normalizedPartImage) {
          continue
        }

        const sampleInput = {
          background: callout.inferredBackground?.rgb,
          excludedRegions: [partItem.quantityLabel?.region].filter(Boolean),
          page: {
            data: pageImage.data,
            height: sourceCanvas.height,
            width: sourceCanvas.width,
          },
          partImage: normalizedPartImage,
        }
        const audit = auditPartColorSampling(sampleInput)
        let colorSample = audit.sample

        if (useRenderedSamples && shouldCreateHighResolutionReportSample(audit.sample)) {
          const highResolutionImage = await readHighResolutionPageImage()

          colorSample = samplePartColor({
            ...sampleInput,
            highResolution: {
              page: highResolutionImage,
              scaleX: highResolutionImage.width / sourceCanvas.width,
              scaleY: highResolutionImage.height / sourceCanvas.height,
            },
          })
        }

        if (useRenderedSamples) {
          analysis.samplesByPartId.set(partItem.id, colorSample)
        }

        const sampleOverlayDataUrl = await createSamplingOverlayDataUrl(canvas, sourceCanvas, partItem, audit)

        if (sampleOverlayDataUrl) {
          analysis.sampleOverlayDataUrlsByPartId.set(partItem.id, sampleOverlayDataUrl)
        }
      }
    }
  } finally {
    await document.destroy?.()
  }

  if (!useRenderedColors) {
    return analysis
  }

  const calibration = calibrateManualPartColors(
    [...analysis.samplesByPartId.entries()].map(([id, sample]) => ({ id, sample })),
  )

  analysis.colorsComputed = true
  analysis.colorsByPartId = calibration.colorsByPartId

  return analysis
}

async function loadCanvasModule() {
  const candidates = [
    "@napi-rs/canvas",
    pathToFileURL(path.resolve("node_modules", ".pnpm", "node_modules", "@napi-rs", "canvas", "index.js")).href,
  ]

  for (const candidate of candidates) {
    try {
      if (candidate.startsWith("file:") && !existsSync(fileURLToPath(candidate))) {
        continue
      }

      return await import(candidate)
    } catch {
      // Optional Node canvas binding is unavailable. Report still renders without generated crops.
    }
  }

  return null
}

function installPdfCanvasGlobals(canvas) {
  globalThis.DOMMatrix ??= canvas.DOMMatrix
  globalThis.ImageData ??= canvas.ImageData
  globalThis.Path2D ??= canvas.Path2D
}

function collectPreviewPartItemsByPage(session) {
  const byPage = new Map()

  for (const callout of session.stepDetectionResult?.callouts ?? []) {
    for (const partItem of callout.partItems ?? []) {
      if (!partItem.partImage?.region || !partItem.partImage?.alphaMask) {
        continue
      }

      const pagePartItems = byPage.get(callout.pageNumber) ?? []

      pagePartItems.push({ callout, partItem })
      byPage.set(callout.pageNumber, pagePartItems)
    }
  }

  return [...byPage.entries()].sort(([left], [right]) => left - right)
}

function createReportViewport(page, preview) {
  const nativeViewport = page.getViewport({ scale: 1 })
  const scale = preview?.width
    ? preview.width / nativeViewport.width
    : 1

  return page.getViewport({ scale })
}

async function renderHighResolutionReportPageImage(canvas, page, baseViewport) {
  const nativeViewport = page.getViewport({ scale: 1 })
  const baseScale = baseViewport.width / nativeViewport.width
  const highResolutionViewport = page.getViewport({ scale: baseScale * 2 })
  const highResolutionCanvas = canvas.createCanvas(
    Math.ceil(highResolutionViewport.width),
    Math.ceil(highResolutionViewport.height),
  )
  const context = highResolutionCanvas.getContext("2d")

  await page.render({ canvasContext: context, viewport: highResolutionViewport }).promise

  const imageData = context.getImageData(0, 0, highResolutionCanvas.width, highResolutionCanvas.height)

  return {
    data: imageData.data,
    height: highResolutionCanvas.height,
    width: highResolutionCanvas.width,
  }
}

function shouldCreateHighResolutionReportSample(sample) {
  if (!sample) {
    return false
  }

  const edgeCount = sample.rejectionCounts?.edge ?? 0
  const edgeRatio = edgeCount + sample.pixelCount > 0
    ? edgeCount / (edgeCount + sample.pixelCount)
    : 0

  return sample.pixelCount <= 220 ||
    sample.status === "review" ||
    edgeRatio >= 0.45 ||
    sample.dominantCoverage <= 0.45 ||
    sample.variance >= 8
}

function normalizePartImageForSampling(partImage) {
  const region = normalizeRegion(partImage?.region)

  if (!region || !partImage?.alphaMask) {
    return null
  }

  const alphaMask = normalizeAlphaMask(partImage.alphaMask, region)

  if (!alphaMask) {
    return null
  }

  return { alphaMask, region }
}

function normalizeAlphaMask(alphaMask, region) {
  const width = Math.max(1, Math.round(alphaMask.width ?? region.width))
  const height = Math.max(1, Math.round(alphaMask.height ?? region.height))
  const expectedLength = width * height
  const sourceData = alphaMask.data

  if (!sourceData) {
    return null
  }

  if (sourceData instanceof Uint8ClampedArray && sourceData.length >= expectedLength) {
    return { data: sourceData, height, width }
  }

  if (Array.isArray(sourceData)) {
    return { data: Uint8ClampedArray.from(sourceData.slice(0, expectedLength)), height, width }
  }

  const data = new Uint8ClampedArray(expectedLength)

  for (let index = 0; index < expectedLength; index += 1) {
    data[index] = readMaskValue(sourceData, index)
  }

  return { data, height, width }
}

async function createCalloutPreview(canvas, sourceCanvas, callout) {
  const region = normalizeRegion(readCalloutRegion(callout))

  if (!region || region.width <= 0 || region.height <= 0) {
    return null
  }

  const sourceRegion = clampRegionToCanvas(region, sourceCanvas)

  if (sourceRegion.width <= 0 || sourceRegion.height <= 0) {
    return null
  }

  const previewCanvas = canvas.createCanvas(sourceRegion.width, sourceRegion.height)
  const context = previewCanvas.getContext("2d")

  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, sourceRegion.width, sourceRegion.height)
  context.drawImage(
    sourceCanvas,
    sourceRegion.x,
    sourceRegion.y,
    sourceRegion.width,
    sourceRegion.height,
    0,
    0,
    sourceRegion.width,
    sourceRegion.height,
  )

  const png = await previewCanvas.encode("png")

  return {
    imageDataUrl: `data:image/png;base64,${Buffer.from(png).toString("base64")}`,
    region: sourceRegion,
  }
}

async function createMaskedPartPreviewDataUrl(canvas, sourceCanvas, partItem) {
  const region = normalizeRegion(partItem.partImage?.region)
  const alphaMask = partItem.partImage?.alphaMask

  if (!region || !alphaMask || region.width <= 0 || region.height <= 0) {
    return null
  }

  const previewCanvas = canvas.createCanvas(region.width, region.height)
  const context = previewCanvas.getContext("2d")
  const sourceRegion = clampRegionToCanvas(region, sourceCanvas)

  if (sourceRegion.width <= 0 || sourceRegion.height <= 0) {
    return null
  }

  context.clearRect(0, 0, region.width, region.height)
  context.drawImage(
    sourceCanvas,
    sourceRegion.x,
    sourceRegion.y,
    sourceRegion.width,
    sourceRegion.height,
    sourceRegion.x - region.x,
    sourceRegion.y - region.y,
    sourceRegion.width,
    sourceRegion.height,
  )

  const imageData = context.getImageData(0, 0, region.width, region.height)

  applyAlphaMask(imageData, alphaMask, region, sourceRegion)
  context.putImageData(imageData, 0, 0)

  const png = await previewCanvas.encode("png")

  return `data:image/png;base64,${Buffer.from(png).toString("base64")}`
}

async function createSamplingOverlayDataUrl(canvas, sourceCanvas, partItem, audit) {
  const region = normalizeRegion(partItem.partImage?.region)

  if (!region || region.width <= 0 || region.height <= 0) {
    return null
  }

  const previewCanvas = canvas.createCanvas(region.width, region.height)
  const context = previewCanvas.getContext("2d")
  const sourceRegion = clampRegionToCanvas(region, sourceCanvas)

  if (sourceRegion.width <= 0 || sourceRegion.height <= 0) {
    return null
  }

  context.clearRect(0, 0, region.width, region.height)
  context.drawImage(
    sourceCanvas,
    sourceRegion.x,
    sourceRegion.y,
    sourceRegion.width,
    sourceRegion.height,
    sourceRegion.x - region.x,
    sourceRegion.y - region.y,
    sourceRegion.width,
    sourceRegion.height,
  )

  const imageData = context.getImageData(0, 0, region.width, region.height)

  applySamplingOverlay(imageData, audit, region, sourceRegion)
  context.putImageData(imageData, 0, 0)

  const png = await previewCanvas.encode("png")

  return `data:image/png;base64,${Buffer.from(png).toString("base64")}`
}

function normalizeRegion(region) {
  if (!region) {
    return null
  }

  return {
    height: Math.max(0, Math.round(region.height)),
    width: Math.max(0, Math.round(region.width)),
    x: Math.round(region.x),
    y: Math.round(region.y),
  }
}

function clampRegionToCanvas(region, canvas) {
  const x = Math.max(0, Math.min(canvas.width, region.x))
  const y = Math.max(0, Math.min(canvas.height, region.y))
  const right = Math.max(x, Math.min(canvas.width, region.x + region.width))
  const bottom = Math.max(y, Math.min(canvas.height, region.y + region.height))

  return {
    height: bottom - y,
    width: right - x,
    x,
    y,
  }
}

function applyAlphaMask(imageData, alphaMask, region, sourceRegion) {
  const maskWidth = Math.max(1, Math.round(alphaMask.width ?? region.width))
  const maskHeight = Math.max(1, Math.round(alphaMask.height ?? region.height))
  const maskData = alphaMask.data ?? {}

  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const pageX = region.x + x
      const pageY = region.y + y
      const offset = (y * region.width + x) * 4

      if (
        pageX < sourceRegion.x ||
        pageY < sourceRegion.y ||
        pageX >= sourceRegion.x + sourceRegion.width ||
        pageY >= sourceRegion.y + sourceRegion.height
      ) {
        imageData.data[offset + 3] = 0
        continue
      }

      const maskX = Math.min(maskWidth - 1, Math.floor((x * maskWidth) / region.width))
      const maskY = Math.min(maskHeight - 1, Math.floor((y * maskHeight) / region.height))

      imageData.data[offset + 3] = readMaskValue(maskData, maskY * maskWidth + maskX)
    }
  }
}

function applySamplingOverlay(imageData, audit, region, sourceRegion) {
  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const pageX = region.x + x
      const pageY = region.y + y
      const offset = (y * region.width + x) * 4

      if (
        pageX < sourceRegion.x ||
        pageY < sourceRegion.y ||
        pageX >= sourceRegion.x + sourceRegion.width ||
        pageY >= sourceRegion.y + sourceRegion.height
      ) {
        imageData.data[offset + 3] = 0
        continue
      }

      const decision = readAuditDecision(audit, x, y, region)

      if (decision === 0) {
        imageData.data[offset + 3] = Math.round(imageData.data[offset + 3] * 0.2)
        continue
      }

      blendOverlayPixel(imageData.data, offset, overlayColorForDecision(decision), 0.62)
      imageData.data[offset + 3] = 255
    }
  }
}

function readAuditDecision(audit, x, y, region) {
  const maskX = Math.min(audit.width - 1, Math.floor((x * audit.width) / region.width))
  const maskY = Math.min(audit.height - 1, Math.floor((y * audit.height) / region.height))

  return audit.decisions[maskY * audit.width + maskX] ?? 0
}

function overlayColorForDecision(decision) {
  if (decision === PART_COLOR_SAMPLE_DECISION.accepted) {
    return { b: 94, g: 197, r: 34 }
  }

  if (decision === PART_COLOR_SAMPLE_DECISION.border) {
    return { b: 22, g: 115, r: 249 }
  }

  if (decision === PART_COLOR_SAMPLE_DECISION.edge) {
    return { b: 180, g: 108, r: 124 }
  }

  if (decision === PART_COLOR_SAMPLE_DECISION.excludedRegion) {
    return { b: 247, g: 85, r: 168 }
  }

  if (decision === PART_COLOR_SAMPLE_DECISION.lowAlpha) {
    return { b: 8, g: 179, r: 234 }
  }

  return { b: 68, g: 68, r: 239 }
}

function blendOverlayPixel(data, offset, color, alpha) {
  data[offset] = Math.round(data[offset] * (1 - alpha) + color.r * alpha)
  data[offset + 1] = Math.round(data[offset + 1] * (1 - alpha) + color.g * alpha)
  data[offset + 2] = Math.round(data[offset + 2] * (1 - alpha) + color.b * alpha)
}

function readMaskValue(maskData, index) {
  const value = maskData[index]

  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function readCliOptions(argv) {
  const options = {
    labelDir: undefined,
    recomputeColors: false,
    outputDir: null,
    sessionPath: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === "--out-dir") {
      options.outputDir = argv[index + 1] ?? null
      index += 1
    } else if (arg === "--label-dir") {
      options.labelDir = argv[index + 1] ?? undefined
      index += 1
    } else if (arg === "--recompute-colors") {
      options.recomputeColors = true
    } else if (!options.sessionPath) {
      options.sessionPath = arg
    }
  }

  return options
}

async function runCli() {
  const options = readCliOptions(process.argv.slice(2))

  if (!options.sessionPath) {
    const command = path.basename(process.argv[1] ?? "write-part-color-report.mjs")
    throw new Error(`Usage: node scripts/${command} <session.bagit-session.json> [--out-dir ${DEFAULT_REPORT_ROOT}/manual] [--label-dir ${DEFAULT_REPORT_ROOT}/labels] [--recompute-colors]`)
  }

  const result = await writePartColorReport(options)

  console.log(`Part color report written to ${result.outputDir}`)
}

const scriptPath = fileURLToPath(import.meta.url)
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null

if (invokedPath && scriptPath === invokedPath) {
  runCli().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

export const PART_COLOR_REPORT_DEFAULT_ROOT = DEFAULT_REPORT_ROOT
