import { PART_COLOR_LABEL_ROLES } from "./part-color-label-roles.mjs"
import {
  FALLBACK_LEGO_PALETTE,
  REBRICKABLE_LEGO_COLOR_NAMES,
} from "../packages/part-colors/src/index.ts"

const WORKBENCH_FAMILY_COLOR_OPTIONS = [
  "blue family",
  "green family",
  "purple family",
]

export const PART_COLOR_WORKBENCH_COLOR_OPTIONS = uniqueColorOptions([
  "Unknown",
  ...REBRICKABLE_LEGO_COLOR_NAMES,
  ...FALLBACK_LEGO_PALETTE.map((color) => color.name),
  ...WORKBENCH_FAMILY_COLOR_OPTIONS,
])

const CLOSE_PAIR_COLOR_GROUPS = [
  ["Dark Bluish Gray", "Light Bluish Gray", "Flat Silver", "White", "Black"],
  ["Pearl Gold", "Medium Nougat", "Tan", "Dark Tan", "Yellow", "Bright Yellow", "Dark Orange"],
  ["Trans-Red", "Trans-Orange", "Dark Brown", "Reddish Brown", "Dark Red", "Red", "Trans-Brown"],
]

const WORKBENCH_FILTERS = [
  { id: "unknown", label: "Unknown" },
  { id: "review", label: "Review" },
  { id: "close-pair", label: "Close pairs" },
  { id: "conflict", label: "Conflicts" },
  { id: "mismatch", label: "Mismatches" },
]

export const PART_COLOR_WORKBENCH_MAX_ROWS_PER_PAGE = 500

export function buildPartColorWorkbenchData(report) {
  const rows = collectWorkbenchRows(report).map(toWorkbenchRow)
  const sourcePreviewsById = createSourcePreviewsById(report.sourcePreviews ?? [])
  const filterCounts = countFilters(rows)
  const exportBlockReasons = readExportBlockReasons(report)

  return {
    colorOptions: PART_COLOR_WORKBENCH_COLOR_OPTIONS,
    config: {
      colorSource: report.colorSource,
      defaultRole: report.labels?.status === "gate" ? "gate" : "active",
      exportBlocked: exportBlockReasons.length > 0,
      exportBlockReasons,
      generatedAt: report.generatedAt,
      manualId: report.manualId ?? report.labels?.manualId ?? "",
      reportPath: report.reportPath ?? report.labels?.reportPath ?? "report.json",
      sourceSessionPath: report.sourceSessionPath ?? null,
      status: report.labels?.status ?? "active",
    },
    filters: WORKBENCH_FILTERS.map((filter) => ({
      ...filter,
      count: filterCounts[filter.id] ?? 0,
    })),
    labels: report.labels ?? null,
    roles: PART_COLOR_LABEL_ROLES,
    rows,
    sourcePreviewsById,
    totals: {
      classes: report.totals?.classes ?? 0,
      conflicts: report.totals?.labelConflicts ?? 0,
      labelMismatches: report.totals?.labelMismatches ?? 0,
      labeledRows: report.totals?.labeledRows ?? 0,
      rawClasses: report.totals?.rawClasses ?? report.totals?.classes ?? 0,
      reviewRows: report.totals?.reviewRows ?? 0,
      rows: report.totals?.rows ?? rows.length,
      unknownRows: report.totals?.unknownRows ?? 0,
    },
    versions: report.versions ?? null,
  }
}

export function createPartColorWorkbenchPages(
  data,
  { maxRowsPerPage = PART_COLOR_WORKBENCH_MAX_ROWS_PER_PAGE } = {},
) {
  const rows = data.rows ?? []
  const chunkSize = Math.max(1, maxRowsPerPage)
  const pageCount = Math.max(1, Math.ceil(rows.length / chunkSize))
  const links = Array.from({ length: pageCount }, (_, index) => createWorkbenchPageLink(index, pageCount, rows.length, chunkSize))

  return links.map((link, index) => {
    const start = index * chunkSize
    const end = Math.min(start + chunkSize, rows.length)
    const pageRows = rows.slice(start, end)

    return {
      data: createWorkbenchPageData(data, {
        chunk: {
          count: pageCount,
          endRow: end,
          index: index + 1,
          startRow: rows.length === 0 ? 0 : start + 1,
          totalRows: rows.length,
        },
        links,
        rows: pageRows,
      }),
      dataScriptName: link.dataScriptName,
      htmlName: link.href,
    }
  })
}

function createWorkbenchPageLink(index, pageCount, totalRows, chunkSize) {
  const pageNumber = index + 1
  const start = totalRows === 0 ? 0 : index * chunkSize + 1
  const end = Math.min((index + 1) * chunkSize, totalRows)
  const suffix = pageNumber === 1 ? "" : `-${String(pageNumber).padStart(3, "0")}`

  return {
    current: false,
    dataScriptName: pageNumber === 1 ? "workbench-data.js" : `workbench-data${suffix}.js`,
    href: pageNumber === 1 ? "index.html" : `part${suffix}.html`,
    label: pageCount === 1 ? "All rows" : `Part ${pageNumber}`,
    rowRange: totalRows === 0 ? "0 rows" : `${start}-${end}`,
  }
}

function createWorkbenchPageData(data, { chunk, links, rows }) {
  return {
    ...data,
    chunks: links.map((link, index) => ({
      current: index + 1 === chunk.index,
      href: link.href,
      label: link.label,
      rowRange: link.rowRange,
    })),
    config: {
      ...data.config,
      chunk,
      exportFileName: createChunkExportFileName(data.config?.manualId, chunk),
    },
    filters: WORKBENCH_FILTERS.map((filter) => ({
      ...filter,
      count: rows.filter((row) => row.flags?.[filter.id]).length,
    })),
    rows,
    sourcePreviewsById: filterSourcePreviews(data.sourcePreviewsById ?? {}, rows),
  }
}

function createChunkExportFileName(manualId, chunk) {
  const baseName = manualId || "part-color-labels"

  if (!chunk || chunk.count <= 1) {
    return `${baseName}.json`
  }

  return `${baseName}.part-${String(chunk.index).padStart(3, "0")}.json`
}

function filterSourcePreviews(sourcePreviewsById, rows) {
  const usedPreviewIds = new Set(rows.map((row) => row.sourcePreviewId).filter(Boolean))

  return Object.fromEntries(
    Object.entries(sourcePreviewsById)
      .filter(([previewId]) => usedPreviewIds.has(previewId)),
  )
}

function createSourcePreviewsById(sourcePreviews) {
  return Object.fromEntries(
    sourcePreviews
      .filter((preview) => preview?.calloutId)
      .map((preview) => [preview.calloutId, {
        imageDataUrl: preview.imageDataUrl ?? null,
        pageNumber: preview.pageNumber ?? null,
        region: preview.region ?? null,
        stepIndex: preview.stepIndex ?? null,
      }]),
  )
}

function uniqueColorOptions(names) {
  return [...new Set(names.filter(Boolean))]
}

export function renderPartColorWorkbenchDataScript(data) {
  return `window.partColorWorkbenchData = ${stringifyForScript(data)};\n`
}

export function collectWorkbenchRows(report) {
  const rowsById = new Map()
  const rows = [
    ...(report.classes ?? []).flatMap((manualClass) => manualClass.rows ?? []),
    ...(report.unknownRows ?? []),
  ]

  for (const row of rows) {
    if (row?.itemId && !rowsById.has(row.itemId)) {
      rowsById.set(row.itemId, row)
    }
  }

  return [...rowsById.values()].sort((left, right) =>
    (left.pageNumber ?? 0) - (right.pageNumber ?? 0) ||
    (left.stepIndex ?? 0) - (right.stepIndex ?? 0) ||
    left.itemId.localeCompare(right.itemId),
  )
}

export function readWorkbenchRowFlags(row) {
  return {
    "close-pair": isClosePairRow(row),
    conflict: row.labelStatus === "conflict",
    mismatch: ["conflict", "drift", "mismatch", "missing"].includes(row.labelStatus),
    review: row.manualClassTrusted !== true || row.colorStatus !== "exact",
    unknown: !row.manualClassId || row.colorName === "Unknown",
  }
}

export function readExportBlockReasons(report) {
  const reasons = []

  if (report.colorSource !== "saved-app-result") {
    reasons.push("not saved-app-result")
  }
  if (report.versions?.partColorCalibrationStale === true) {
    reasons.push("stale part color calibration")
  }
  if (report.versions?.partExtractorStale === true) {
    reasons.push("stale part extractor")
  }

  return reasons
}

function toWorkbenchRow(row) {
  const flags = readWorkbenchRowFlags(row)

  return {
    badges: readWorkbenchBadges(row, flags),
    colorName: row.colorName ?? "Unknown",
    colorStatus: row.colorStatus ?? "unknown",
    confidence: row.confidence ?? null,
    cropHash: row.cropHash ?? null,
    distance: row.distance ?? null,
    flags,
    imageDataUrl: row.imageDataUrl ?? null,
    itemId: row.itemId,
    labelExpectedName: row.labelExpectedName ?? "",
    labelNote: row.labelNote ?? "",
    labelRole: row.labelRole ?? null,
    labelStatus: row.labelStatus ?? null,
    manualClassId: row.manualClassId ?? null,
    manualClassTrusted: row.manualClassTrusted === true,
    pageNumber: row.pageNumber ?? null,
    partRegion: row.partRegion ?? null,
    quantity: row.quantity ?? null,
    sampleChips: row.sampleChips ?? [],
    sourcePreviewId: row.sourcePreviewId ?? row.calloutId ?? null,
    stepIndex: row.stepIndex ?? null,
    swatchHex: row.swatchHex ?? row.observedHex ?? null,
  }
}

function readWorkbenchBadges(row, flags) {
  const badges = []

  if (row.labelStatus) {
    badges.push({ kind: row.labelStatus, label: row.labelStatus })
  }
  if (flags.unknown) {
    badges.push({ kind: "unknown", label: "unknown" })
  }
  if (flags.review) {
    badges.push({ kind: "review", label: "review" })
  }
  if (flags["close-pair"]) {
    badges.push({ kind: "close-pair", label: "close pair" })
  }

  return badges
}

function countFilters(rows) {
  const counts = Object.fromEntries(WORKBENCH_FILTERS.map((filter) => [filter.id, 0]))

  for (const row of rows) {
    for (const filter of WORKBENCH_FILTERS) {
      if (row.flags[filter.id]) {
        counts[filter.id] += 1
      }
    }
  }

  return counts
}

function isClosePairRow(row) {
  const names = [
    row.colorName,
    row.labelExpectedName,
    ...(row.ruleCandidateNames ?? []),
  ].map(normalizeColorOption)

  return CLOSE_PAIR_COLOR_GROUPS.some((group) => {
    const normalizedGroup = group.map(normalizeColorOption)

    return names.some((name) => normalizedGroup.includes(name))
  })
}

function normalizeColorOption(value) {
  return String(value ?? "").trim().toLowerCase()
}

function stringifyForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}
