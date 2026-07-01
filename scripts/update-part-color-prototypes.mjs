import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { colorDistanceCiede2000 } from "../packages/part-colors/src/color-space.ts"
import { createResolverDataset } from "../packages/part-colors/src/resolver/manual-dataset.ts"
import { selectTrainableLabels } from "../packages/part-colors/src/resolver/label-policy.ts"
import {
  AGGREGATE_PROTOTYPE_CLUSTER_DISTANCE_LIMIT,
  trainColorPrototypes,
} from "../packages/part-colors/src/resolver/prototype-training.ts"
import { RUNTIME_COLOR_PROTOTYPES as CURRENT_RUNTIME_COLOR_PROTOTYPES } from "../packages/part-colors/src/resolver/trained-prototypes.ts"
import {
  DEFAULT_PART_COLOR_LABEL_DIR,
  isRejectedTuningReport,
  readPartColorLabelSets,
  readReportRowCropHash,
  readReportRowsByItemId,
} from "./part-color-label-eval.mjs"

const DEFAULT_OUTPUT_PATH = "packages/part-colors/src/resolver/trained-prototypes.ts"

export function buildRuntimePrototypeSet({
  basePrototypeSet = CURRENT_RUNTIME_COLOR_PROTOTYPES,
  labelDir = DEFAULT_PART_COLOR_LABEL_DIR,
  manualIds = null,
  minimumSupport,
  clusterDistanceLimit,
  replace = false,
} = {}) {
  const accepted = []
  const excluded = []
  const includedManualIds = new Set(manualIds ?? [])
  const labelSets = readPartColorLabelSets(labelDir)
    .filter((labelSet) => !manualIds || includedManualIds.has(labelSet.manualId))

  for (const labelSet of labelSets) {
    const report = readTrainingReport(labelSet.reportPath)

    if (!report || isRejectedTuningReport(report)) {
      excluded.push(...labelSet.labels.map((label) => ({
        label,
        manualId: labelSet.manualId,
        reason: report ? "stale-report" : "missing-report",
      })))
      continue
    }

    const rowsById = readTrainingRowsById(report)
    const reportRowsById = readReportRowsByItemId(report)
    const dataset = createResolverDataset({
      cropHashesByItemId: createCropHashMap(reportRowsById),
      labels: labelSet.labels,
      manualId: labelSet.manualId,
      rows: [...rowsById.values()].map(toCalibrationInput),
    })
    const policy = selectTrainableLabels(dataset)

    accepted.push(...policy.accepted)
    excluded.push(...policy.excluded.map((entry) => ({
      ...entry,
      manualId: labelSet.manualId,
    })))
  }

  const trainedPrototypeSet = trainColorPrototypes(accepted, {
    clusterDistanceLimit,
    minimumSupport,
  })
  const prototypeSet = replace
    ? trainedPrototypeSet
    : mergeRuntimePrototypeSets(basePrototypeSet, trainedPrototypeSet, {
        clusterDistanceLimit,
      })

  return {
    excluded,
    labelSetCount: labelSets.length,
    promotedPrototypeCount: replace
      ? trainedPrototypeSet.prototypes.length
      : prototypeSet.prototypes.length - basePrototypeSet.prototypes.length,
    prototypeSet,
    trainedPrototypeCount: trainedPrototypeSet.prototypes.length,
    trainableExampleCount: accepted.length,
  }
}

function readTrainingReport(reportPath) {
  return JSON.parse(readFileSync(reportPath, "utf8"))
}

export function readTrainingRowsById(report) {
  if (report.sourceSessionPath) {
    return readSessionRowsById(report.sourceSessionPath)
  }

  return readReportRowsByItemId(report)
}

function readSessionRowsById(sourceSessionPath) {
  const session = JSON.parse(readFileSync(sourceSessionPath, "utf8"))
  const rowsById = new Map()

  for (const callout of session?.stepDetectionResult?.callouts ?? []) {
    for (const partItem of callout.partItems ?? []) {
      rowsById.set(partItem.id, {
        itemId: partItem.id,
        sample: detectedColorSample(partItem.detectedColor),
      })
    }
  }

  return rowsById
}

function createCropHashMap(rowsById) {
  return new Map(
    [...rowsById.entries()]
      .map(([itemId, row]) => [itemId, readReportRowCropHash(row)])
      .filter(([, cropHash]) => typeof cropHash === "string" && cropHash.length > 0),
  )
}

export function toCalibrationInput(row) {
  return {
    id: row.itemId,
    sample: row.sample ?? readReportSample(row),
  }
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
    resampleReason: detectedColor.sampleResampleReason ?? undefined,
    rgb: detectedColor.observedRgb,
    sampleScale: detectedColor.sampleScale ?? undefined,
    selectedChipIndex: 0,
    stability: detectedColor.confidence ?? 0,
    status: detectedColor.sampleStatus ?? "review",
    variance: 0,
  }
}

function readReportSample(row) {
  const rgb = readObservedRgb(row)

  if (!row.sampleChips?.length || !row.observedHex || !rgb) {
    return null
  }

  return {
    baseChips: row.sampleBaseChips ?? [],
    baseDominantCoverage: row.sampleBaseDominantCoverage ?? null,
    baseEdgeChips: row.sampleBaseEdgeChips ?? [],
    basePixelCount: row.sampleBasePixelCount ?? null,
    baseRejectedPixelCount: row.sampleBaseRejectedPixelCount ?? null,
    baseRejectionCounts: row.sampleBaseRejections ?? null,
    baseStatus: row.sampleBaseStatus ?? null,
    baseVariance: row.sampleBaseVariance ?? null,
    chips: row.sampleChips,
    dominantCoverage: row.sampleDominantCoverage ?? row.sampleChips[0]?.coverage ?? 0,
    edgeChips: row.sampleEdgeChips ?? [],
    hex: row.observedHex,
    pixelCount: row.samplePixelCount ?? row.sampleChips.reduce((total, chip) => total + chip.pixelCount, 0),
    rejectedPixelCount: row.sampleRejectedPixelCount ?? 0,
    rejectionCounts: row.sampleRejections ?? emptyRejectionCounts(),
    resampleReason: row.sampleResampleReason ?? undefined,
    rgb,
    sampleScale: row.sampleScale ?? undefined,
    selectedChipIndex: 0,
    stability: typeof row.confidence === "number" ? row.confidence : 0.8,
    status: normalizeSampleStatus(row.sampleStatus),
    variance: row.sampleVariance ?? 0,
  }
}

function readObservedRgb(row) {
  if (row.observedRgb) {
    return row.observedRgb
  }

  if (typeof row.observedHex === "string") {
    return parseHexRgb(row.observedHex)
  }

  return row.sampleChips?.[0]?.rgb ?? null
}

function parseHexRgb(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex)

  if (!match) {
    return null
  }

  const value = match[1]

  return {
    b: Number.parseInt(value.slice(4, 6), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    r: Number.parseInt(value.slice(0, 2), 16),
  }
}

function emptyRejectionCounts() {
  return {
    background: 0,
    border: 0,
    edge: 0,
    excludedRegion: 0,
    lowAlpha: 0,
    outOfPage: 0,
  }
}

function normalizeSampleStatus(status) {
  return status === "stable" || status === "unknown" || status === "review" || status === "weak-classifiable"
    ? status
    : "review"
}

export function mergeRuntimePrototypeSets(
  basePrototypeSet,
  candidatePrototypeSet,
  { clusterDistanceLimit = AGGREGATE_PROTOTYPE_CLUSTER_DISTANCE_LIMIT } = {},
) {
  const prototypes = basePrototypeSet.prototypes.map((prototype) => ({ ...prototype }))
  let nextIdIndex = readNextPrototypeIdIndex(prototypes)

  for (const candidate of candidatePrototypeSet.prototypes) {
    if (isPrototypeRepresented(prototypes, candidate, clusterDistanceLimit)) {
      continue
    }

    prototypes.push({
      ...candidate,
      id: createRuntimePrototypeId(candidate.expectedName, nextIdIndex),
    })
    nextIdIndex += 1
  }

  return {
    prototypes: prototypes.sort(compareRuntimePrototypes),
  }
}

function isPrototypeRepresented(prototypes, candidate, clusterDistanceLimit) {
  return prototypes.some((prototype) =>
    normalizeColorName(prototype.expectedName) === normalizeColorName(candidate.expectedName) &&
    colorDistanceCiede2000(prototype.rgb, candidate.rgb) <= clusterDistanceLimit,
  )
}

function compareRuntimePrototypes(left, right) {
  return normalizeColorName(left.expectedName).localeCompare(normalizeColorName(right.expectedName)) ||
    left.rgb.r - right.rgb.r ||
    left.rgb.g - right.rgb.g ||
    left.rgb.b - right.rgb.b ||
    left.id.localeCompare(right.id)
}

function readNextPrototypeIdIndex(prototypes) {
  const highestIndex = prototypes.reduce((highest, prototype) => {
    const match = /-(\d+)$/.exec(prototype.id)
    const index = match ? Number(match[1]) : 0

    return Math.max(highest, index)
  }, 0)

  return highestIndex + 1
}

function createRuntimePrototypeId(expectedName, index) {
  return `prototype-${slugColorName(expectedName)}-${String(index).padStart(3, "0")}`
}

function slugColorName(name) {
  return normalizeColorName(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function normalizeColorName(name) {
  return String(name).trim().toLowerCase()
}

function renderRuntimePrototypeSet(prototypeSet) {
  const roundedSet = {
    prototypes: prototypeSet.prototypes.map((prototype) => ({
      expectedName: prototype.expectedName,
      family: prototype.family,
      id: prototype.id,
      lab: roundObject(prototype.lab),
      rgb: prototype.rgb,
      support: prototype.support,
    })),
  }

  return [
    "import type { PrototypeSet } from \"./types\"",
    "",
    "// Generated by scripts/update-part-color-prototypes.mjs.",
    "// Contains aggregate prototype data only; no private row, crop, or manual ids.",
    `export const RUNTIME_COLOR_PROTOTYPES: PrototypeSet = ${JSON.stringify(roundedSet, null, 2)}`,
    "",
  ].join("\n")
}

function roundObject(value) {
  return Object.fromEntries(
    Object.entries(value).map(([key, numericValue]) => [
      key,
      Math.round(numericValue * 1_000_000) / 1_000_000,
    ]),
  )
}

function parseArgs(argv) {
  return {
    clusterDistanceLimit: readNumberOption(argv, "--cluster-distance"),
    dryRun: argv.includes("--dry-run"),
    labelDir: readStringOption(argv, "--label-dir") ?? DEFAULT_PART_COLOR_LABEL_DIR,
    manualIds: readListOption(argv, "--manual-ids"),
    minimumSupport: readNumberOption(argv, "--minimum-support"),
    outputPath: readStringOption(argv, "--out") ?? DEFAULT_OUTPUT_PATH,
    replace: argv.includes("--replace"),
  }
}

function readStringOption(argv, name) {
  const index = argv.indexOf(name)

  return index >= 0 ? argv[index + 1] : null
}

function readNumberOption(argv, name) {
  const value = readStringOption(argv, name)

  if (!value) {
    return undefined
  }

  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number.`)
  }

  return parsed
}

function readListOption(argv, name) {
  const value = readStringOption(argv, name)

  return value ? value.split(",").map((entry) => entry.trim()).filter(Boolean) : null
}

function runCli(argv) {
  const options = parseArgs(argv)
  const result = buildRuntimePrototypeSet(options)
  const source = renderRuntimePrototypeSet(result.prototypeSet)

  if (options.dryRun) {
    console.log(source)
  } else {
    writeFileSync(options.outputPath, source)
  }

  console.error(JSON.stringify({
    excludedLabels: result.excluded.length,
    labelSetCount: result.labelSetCount,
    outputPath: path.relative(process.cwd(), path.resolve(options.outputPath)),
    promotedPrototypes: result.promotedPrototypeCount,
    prototypes: result.prototypeSet.prototypes.length,
    trainedPrototypes: result.trainedPrototypeCount,
    trainableExamples: result.trainableExampleCount,
  }, null, 2))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2))
}
