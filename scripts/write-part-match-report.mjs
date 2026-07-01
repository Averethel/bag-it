import { existsSync } from "node:fs"
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { inflateSync } from "node:zlib"
import {
  CALLOUT_PART_EXTRACTOR_VERSION,
} from "../packages/callout-parts/src/index.ts"
import {
  PART_MATCHER_VERSION,
  createPartMatchGroups,
  extractPartVisualFeatures,
} from "../packages/part-matching/src/index.ts"
import {
  createStepCalloutBagRows,
  createStepCalloutBaggingPlan,
} from "../src/features/bagging/step-callout-bagging.ts"
import {
  findPartMatchLabelSetForReport,
  hashPartMatchCrop,
} from "./part-match-label-eval.mjs"
import {
  createPartColorReportAnalysis,
} from "./write-part-color-report.mjs"

const DEFAULT_REPORT_ROOT = path.join(".bag-it", "private", "part-match-reports")
const WORKBENCH_MAX_ROWS_PER_PAGE = 500

export async function writePartMatchReport({
  bagIds = [],
  bagLabels = [],
  enableLabelGatedNearMatches = false,
  generatedAt = new Date(),
  labelDir,
  manualId,
  outputDir,
  pairScorerConfig = null,
  sessionPath,
} = {}) {
  if (!sessionPath) {
    throw new Error("sessionPath is required.")
  }

  const session = JSON.parse(await readFile(sessionPath, "utf8"))
  const resolvedOutputDir = outputDir ?? defaultReportDir(sessionPath, generatedAt, manualId)
  const reportPath = path.join(resolvedOutputDir, "report.json")
  const resolvedManualId = manualId ?? path.basename(resolvedOutputDir)
  const labelSet = findPartMatchLabelSetForReport({
    labelDir,
    manualId: resolvedManualId,
    reportPath,
  })
  const renderedPreviews = await createPartMatchRenderedPreviews(session)
  const bagFilter = createBagFilter({ bagIds, bagLabels })
  const previewRows = filterRowsByBag(collectPartMatchRows(session, {
    previewDataUrlsByPartId: renderedPreviews.previewDataUrlsByPartId,
  }), bagFilter)
  const renderedPixelsByImageDataUrl = await decodeRenderedPixelsByImageDataUrl(
    previewRows.map((row) => row.imageDataUrl).filter(Boolean),
  )
  const report = buildPartMatchReport(session, {
    bagIds,
    bagLabels,
    enableLabelGatedNearMatches,
    generatedAt,
    labelSet,
    manualId: resolvedManualId,
    pairScorerConfig,
    previewDataUrlsByPartId: renderedPreviews.previewDataUrlsByPartId,
    reportPath,
    renderedPixelsByImageDataUrl,
    sourceSessionPath: sessionPath,
  })
  const workbenchPages = createPartMatchWorkbenchPages(report)

  await mkdir(resolvedOutputDir, { recursive: true })
  await removeStaleWorkbenchChunkFiles(resolvedOutputDir, workbenchPages)
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(path.join(resolvedOutputDir, "details.html"), renderPartMatchDetailsHtml(report))
  await writeFile(path.join(resolvedOutputDir, "workbench.css"), renderWorkbenchCss())
  await writeFile(path.join(resolvedOutputDir, "workbench.js"), renderWorkbenchJs())

  for (const page of workbenchPages) {
    await writeFile(path.join(resolvedOutputDir, page.htmlName), renderWorkbenchHtml(page))
    await writeFile(path.join(resolvedOutputDir, page.dataScriptName), renderWorkbenchDataScript(page))
  }

  return {
    outputDir: resolvedOutputDir,
    report,
  }
}

export function buildPartMatchReport(
  session,
  {
    bagIds = [],
    bagLabels = [],
    enableLabelGatedNearMatches = false,
    generatedAt = new Date(),
    labelSet = null,
    manualId = null,
    pairScorerConfig = null,
    previewDataUrlsByPartId = new Map(),
    reportPath = null,
    renderedPixelsByImageDataUrl = new Map(),
    sourceSessionPath = null,
  } = {},
) {
  const bagFilter = createBagFilter({ bagIds, bagLabels })
  const rows = filterRowsByBag(collectPartMatchRows(session, {
    previewDataUrlsByPartId,
    renderedPixelsByImageDataUrl,
  }), bagFilter)
  const labelsByItemId = createLabelsByItemId(labelSet)
  const matchGroups = createPartMatchGroups({
    enableLabelGatedNearMatches,
    pairScorerConfig,
    rows: rows.map((row) => row.matchInput),
  })
  const groups = matchGroups.map((group) => ({
    ...group,
    totalQuantity: group.rowIds.reduce(
      (total, rowId) => total + (rows.find((row) => row.rowId === rowId)?.quantity ?? 0),
      0,
    ),
  }))

  return {
    generatedAt: generatedAt.toISOString(),
    filters: summarizeBagFilter(bagFilter),
    groups,
    matcherConfig: {
      pairScorerEvidenceRuleCount: pairScorerConfig?.evidenceRules?.length ?? null,
      labelGatedNearMatchesEnabled: enableLabelGatedNearMatches,
      pairScorerConfigVersion: pairScorerConfig?.version ?? null,
      pairScorerKind: pairScorerConfig?.kind ?? null,
      pairScorerThreshold: pairScorerConfig?.threshold ?? null,
      pairScorerVetoRuleCount: pairScorerConfig?.vetoRules?.length ?? null,
    },
    labels: labelSet ? summarizeLabelSet(labelSet) : null,
    manualId,
    reportPath: reportPath ? normalizeWorkspacePath(reportPath) : null,
    rows: rows.map(({ matchInput: _matchInput, ...row }) => ({
      ...row,
      label: labelsByItemId.get(row.rowId) ?? null,
    })),
    sourceSessionPath: sourceSessionPath ? normalizeWorkspacePath(sourceSessionPath) : null,
    totals: {
      exactGroups: groups.filter((group) => group.matchKind === "exact-digest").length,
      groupedRows: new Set(groups.flatMap((group) => group.rowIds)).size,
      groups: groups.length,
      nearGroups: groups.filter((group) => group.matchKind === "label-gated-near").length,
      renderedPixelRows: rows.filter((row) => row.matchInput.renderedPixels).length,
      rows: rows.length,
    },
    versions: createVersionSummary(session),
  }
}

function createBagFilter({ bagIds = [], bagLabels = [] } = {}) {
  const bagIdSet = new Set(normalizeFilterValues(bagIds))
  const bagLabelSet = new Set(normalizeFilterValues(bagLabels))

  return {
    bagIds: [...bagIdSet],
    bagLabels: [...bagLabelSet],
    enabled: bagIdSet.size > 0 || bagLabelSet.size > 0,
    matches(row) {
      return bagIdSet.has(row.bagId) || bagLabelSet.has(row.bagLabel)
    },
  }
}

function normalizeFilterValues(values) {
  return values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
}

function filterRowsByBag(rows, bagFilter) {
  return bagFilter.enabled
    ? rows.filter((row) => bagFilter.matches(row))
    : rows
}

function summarizeBagFilter(bagFilter) {
  return bagFilter.enabled
    ? {
        bagIds: bagFilter.bagIds,
        bagLabels: bagFilter.bagLabels,
      }
    : null
}

async function createPartMatchRenderedPreviews(session) {
  const analysis = await createPartColorReportAnalysis(session, {
    useRenderedColors: false,
    useRenderedSamples: false,
  })

  return {
    previewDataUrlsByPartId: analysis.previewDataUrlsByPartId ?? new Map(),
  }
}

function createLabelsByItemId(labelSet) {
  return new Map((labelSet?.labels ?? []).map((label) => [label.itemId, label]))
}

function collectPartMatchRows(
  session,
  {
    previewDataUrlsByPartId = new Map(),
    renderedPixelsByImageDataUrl = new Map(),
  } = {},
) {
  const result = session.stepDetectionResult

  if (!result) {
    return []
  }

  const plan = createStepCalloutBaggingPlan(result)
  const bagRows = createStepCalloutBagRows(plan, {
    manualFingerprint: createManualFingerprint(session),
    pagePreviews: result.pagePreviews,
  })

  return bagRows.map((row) => {
    const renderedImageDataUrl = row.partCrop?.imageDataUrl ??
      previewDataUrlsByPartId.get(row.itemId) ??
      null
    const renderedPixels = renderedImageDataUrl
      ? renderedPixelsByImageDataUrl.get(renderedImageDataUrl) ?? null
      : null
    const maskImageDataUrl = createAlphaMaskPreviewDataUrl(row.partImageAlphaMask)
    const imageDataUrl = renderedImageDataUrl ?? maskImageDataUrl
    const features = extractPartVisualFeatures({
      alphaMask: row.partImageAlphaMask,
      partRegion: row.partCrop?.region ?? row.anchor.partRegion,
      renderedPixels,
    })
    const reportRow = {
      bagId: row.bagId,
      bagLabel: row.bagLabel,
      calloutId: row.calloutId,
      color: row.color,
      cropHash: hashPartMatchCrop(imageDataUrl ?? features.alphaDigest ?? row.id),
      imageDataUrl,
      itemId: row.id,
      previewKind: renderedImageDataUrl ? "rendered-crop" : (maskImageDataUrl ? "mask-preview" : "none"),
      pageNumber: row.sourcePageNumber,
      partRegion: row.partCrop?.region ?? row.anchor.partRegion,
      quantity: row.quantity,
      rowId: row.id,
      sourceItemId: row.itemId,
      stepIndex: row.stepIndex,
    }

    return {
      ...reportRow,
      matchInput: {
        alphaMask: row.partImageAlphaMask,
        bagId: row.bagId,
        calloutId: row.calloutId,
        color: row.color,
        features,
        itemId: row.itemId,
        partRegion: reportRow.partRegion,
        renderedPixels,
        rowId: row.id,
      },
    }
  })
}

async function decodeRenderedPixelsByImageDataUrl(imageDataUrls) {
  const result = new Map()
  const unresolvedImageDataUrls = []

  for (const imageDataUrl of [...new Set(imageDataUrls)]) {
    const renderedPixels = decodePngImageDataUrl(imageDataUrl)

    if (renderedPixels) {
      result.set(imageDataUrl, renderedPixels)
    } else {
      unresolvedImageDataUrls.push(imageDataUrl)
    }
  }

  if (unresolvedImageDataUrls.length === 0) {
    return result
  }

  const canvas = await loadCanvasModule()

  if (!canvas) {
    return result
  }

  for (const imageDataUrl of unresolvedImageDataUrls) {
    const renderedPixels = await decodeRenderedPixelsWithCanvas(canvas, imageDataUrl)

    if (renderedPixels) {
      result.set(imageDataUrl, renderedPixels)
    }
  }

  return result
}

export function decodePngImageDataUrl(imageDataUrl) {
  const match = /^data:image\/png;base64,([a-z0-9+/=]+)$/i.exec(imageDataUrl ?? "")

  if (!match) {
    return null
  }

  try {
    return decodePngBytes(Buffer.from(match[1], "base64"))
  } catch {
    return null
  }
}

function decodePngBytes(bytes) {
  const pngSignature = "89504e470d0a1a0a"

  if (bytes.subarray(0, 8).toString("hex") !== pngSignature) {
    return null
  }

  let offset = 8
  let header = null
  const idatChunks = []

  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii")
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const chunk = bytes.subarray(dataStart, dataEnd)

    if (type === "IHDR") {
      header = {
        bitDepth: chunk[8],
        colorType: chunk[9],
        height: chunk.readUInt32BE(4),
        interlace: chunk[12],
        width: chunk.readUInt32BE(0),
      }
    } else if (type === "IDAT") {
      idatChunks.push(chunk)
    } else if (type === "IEND") {
      break
    }

    offset = dataEnd + 4
  }

  if (!header || header.bitDepth !== 8 || header.interlace !== 0) {
    return null
  }

  const channels = readPngChannelCount(header.colorType)

  if (!channels) {
    return null
  }

  const inflated = inflateSync(Buffer.concat(idatChunks))
  const raw = unfilterPngScanlines(inflated, header.width, header.height, channels)

  return {
    data: pngRawToRgba(raw, header.width, header.height, channels, header.colorType),
    height: header.height,
    width: header.width,
  }
}

function readPngChannelCount(colorType) {
  if (colorType === 0) {
    return 1
  }

  if (colorType === 2) {
    return 3
  }

  if (colorType === 4) {
    return 2
  }

  if (colorType === 6) {
    return 4
  }

  return null
}

function unfilterPngScanlines(inflated, width, height, channels) {
  const stride = width * channels
  const raw = new Uint8ClampedArray(stride * height)
  let sourceOffset = 0

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset]
    sourceOffset += 1
    const rowOffset = y * stride
    const previousRowOffset = rowOffset - stride

    for (let x = 0; x < stride; x += 1) {
      const value = inflated[sourceOffset + x] ?? 0
      const left = x >= channels ? raw[rowOffset + x - channels] ?? 0 : 0
      const up = y > 0 ? raw[previousRowOffset + x] ?? 0 : 0
      const upLeft = y > 0 && x >= channels ? raw[previousRowOffset + x - channels] ?? 0 : 0

      raw[rowOffset + x] = unfilterPngByte(filter, value, left, up, upLeft)
    }

    sourceOffset += stride
  }

  return raw
}

function unfilterPngByte(filter, value, left, up, upLeft) {
  if (filter === 0) {
    return value
  }

  if (filter === 1) {
    return (value + left) & 0xff
  }

  if (filter === 2) {
    return (value + up) & 0xff
  }

  if (filter === 3) {
    return (value + Math.floor((left + up) / 2)) & 0xff
  }

  if (filter === 4) {
    return (value + paethPredictor(left, up, upLeft)) & 0xff
  }

  throw new Error(`Unsupported PNG filter ${filter}.`)
}

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upLeftDistance = Math.abs(estimate - upLeft)

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left
  }

  return upDistance <= upLeftDistance ? up : upLeft
}

function pngRawToRgba(raw, width, height, channels, colorType) {
  const rgba = new Uint8ClampedArray(width * height * 4)

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const rawIndex = pixel * channels
    const rgbaIndex = pixel * 4

    if (colorType === 0) {
      const gray = raw[rawIndex] ?? 0
      rgba[rgbaIndex] = gray
      rgba[rgbaIndex + 1] = gray
      rgba[rgbaIndex + 2] = gray
      rgba[rgbaIndex + 3] = 255
    } else if (colorType === 2) {
      rgba[rgbaIndex] = raw[rawIndex] ?? 0
      rgba[rgbaIndex + 1] = raw[rawIndex + 1] ?? 0
      rgba[rgbaIndex + 2] = raw[rawIndex + 2] ?? 0
      rgba[rgbaIndex + 3] = 255
    } else if (colorType === 4) {
      const gray = raw[rawIndex] ?? 0
      rgba[rgbaIndex] = gray
      rgba[rgbaIndex + 1] = gray
      rgba[rgbaIndex + 2] = gray
      rgba[rgbaIndex + 3] = raw[rawIndex + 1] ?? 0
    } else {
      rgba[rgbaIndex] = raw[rawIndex] ?? 0
      rgba[rgbaIndex + 1] = raw[rawIndex + 1] ?? 0
      rgba[rgbaIndex + 2] = raw[rawIndex + 2] ?? 0
      rgba[rgbaIndex + 3] = raw[rawIndex + 3] ?? 0
    }
  }

  return rgba
}

async function decodeRenderedPixelsWithCanvas(canvas, imageDataUrl) {
  if (!imageDataUrl?.startsWith("data:image/")) {
    return null
  }

  try {
    const image = await canvas.loadImage(imageDataUrl)
    const width = Math.max(1, Math.round(image.width))
    const height = Math.max(1, Math.round(image.height))
    const previewCanvas = canvas.createCanvas(width, height)
    const context = previewCanvas.getContext("2d")

    context.clearRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    const imageData = context.getImageData(0, 0, width, height)

    return {
      data: imageData.data,
      height,
      width,
    }
  } catch {
    return null
  }
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
      // Optional Node canvas binding is unavailable. Report still works with alpha-only features.
    }
  }

  return null
}

function createAlphaMaskPreviewDataUrl(alphaMask) {
  if (!alphaMask?.data || !alphaMask.width || !alphaMask.height) {
    return null
  }

  const gridSize = 16
  const cells = []

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      if (sampleAlphaCell(alphaMask, x, y, gridSize) > 64) {
        cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`)
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${gridSize} ${gridSize}" width="${alphaMask.width}" height="${alphaMask.height}"><rect width="16" height="16" fill="#f8fafc"/><g fill="#1f2937">${cells.join("")}</g></svg>`

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
}

function sampleAlphaCell(alphaMask, gridX, gridY, gridSize) {
  const width = Math.max(1, Math.round(alphaMask.width))
  const height = Math.max(1, Math.round(alphaMask.height))
  const xStart = Math.floor((gridX * width) / gridSize)
  const xEnd = Math.max(xStart + 1, Math.floor(((gridX + 1) * width) / gridSize))
  const yStart = Math.floor((gridY * height) / gridSize)
  const yEnd = Math.max(yStart + 1, Math.floor(((gridY + 1) * height) / gridSize))
  let total = 0
  let count = 0

  for (let y = yStart; y < Math.min(height, yEnd); y += 1) {
    for (let x = xStart; x < Math.min(width, xEnd); x += 1) {
      total += readMaskValue(alphaMask.data, y * width + x)
      count += 1
    }
  }

  return count === 0 ? 0 : total / count
}

function readMaskValue(data, index) {
  if (data instanceof Uint8ClampedArray || Array.isArray(data)) {
    return data[index] ?? 0
  }

  return data?.[String(index)] ?? 0
}

function createVersionSummary(session) {
  const result = session.stepDetectionResult ?? {}

  return {
    currentPartExtractor: CALLOUT_PART_EXTRACTOR_VERSION,
    currentPartMatcher: PART_MATCHER_VERSION,
    detector: result.detectorVersion ?? null,
    partExtractor: result.partExtractorVersion ?? null,
    partExtractorCurrent: result.partExtractorVersion === CALLOUT_PART_EXTRACTOR_VERSION,
    partMatcher: PART_MATCHER_VERSION,
    partMatcherCurrent: true,
  }
}

function summarizeLabelSet(labelSet) {
  return {
    labelPath: labelSet.labelPath,
    manualId: labelSet.manualId,
    reportPath: labelSet.reportPath,
    status: labelSet.status,
    total: labelSet.labels.length,
  }
}

function createPartMatchWorkbenchPages(report) {
  const rows = report.rows ?? []
  const suggestedGroups = (report.groups ?? []).map((group, index) => ({
    ...group,
    suggestedPartKey: `part-${String(index + 1).padStart(3, "0")}`,
  }))
  const chunkCount = Math.max(1, Math.ceil(rows.length / WORKBENCH_MAX_ROWS_PER_PAGE))

  return Array.from({ length: chunkCount }, (_value, index) => {
    const start = index * WORKBENCH_MAX_ROWS_PER_PAGE
    const end = Math.min(start + WORKBENCH_MAX_ROWS_PER_PAGE, rows.length)
    const suffix = index === 0 ? "" : `-${String(index + 1).padStart(3, "0")}`
    const pageRowIds = new Set(rows.slice(start, end).map((row) => row.rowId))

    return {
      dataScriptName: index === 0 ? "workbench-data.js" : `workbench-data${suffix}.js`,
      htmlName: index === 0 ? "index.html" : `part${suffix}.html`,
      report: {
        config: {
          exportFileName: `${report.manualId || "part-match-labels"}${suffix}.json`,
          hasExistingLabels: Boolean(report.labels),
          manualId: report.manualId,
          reportPath: report.reportPath,
          status: report.labels?.status ?? "active",
        },
        groups: suggestedGroups.filter((group) =>
          group.rowIds.some((rowId) => pageRowIds.has(rowId)),
        ),
        rows: rows.slice(start, end),
        totals: report.totals,
      },
    }
  })
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
    /^workbench-data(?:-\d{3})?\.js$/.test(entry)
}

function renderPartMatchDetailsHtml(report) {
  const groupRows = (report.groups ?? [])
    .map((group) => `<tr><td>${escapeHtml(group.groupId)}</td><td>${escapeHtml(group.matchKind)}</td><td>${escapeHtml(group.rowIds.join(", "))}</td><td>${group.totalQuantity}</td></tr>`)
    .join("")
  const rows = (report.rows ?? [])
    .map((row) => `<tr><td>${renderCrop(row.imageDataUrl)}</td><td>${escapeHtml(row.rowId)}</td><td>${escapeHtml(row.bagLabel)}</td><td>${escapeHtml(row.color?.name ?? "Unknown")}</td><td>${row.quantity}</td></tr>`)
    .join("")

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Part match report</title>
  <style>${renderSharedCss()}</style>
</head>
<body>
  <h1>Part match report</h1>
  <p>${report.totals.rows} rows, ${report.totals.groups} groups, ${report.totals.groupedRows} grouped rows.</p>
  <h2>Groups</h2>
  <table><thead><tr><th>Group</th><th>Kind</th><th>Rows</th><th>Quantity</th></tr></thead><tbody>${groupRows}</tbody></table>
  <h2>Rows</h2>
  <table><thead><tr><th>Crop</th><th>Row</th><th>Bag</th><th>Color</th><th>Qty</th></tr></thead><tbody>${rows}</tbody></table>
</body>
</html>`
}

function renderWorkbenchHtml(page) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Part match workbench</title>
  <link rel="stylesheet" href="workbench.css">
</head>
<body>
  <main id="part-match-workbench"></main>
  <script src="${page.dataScriptName}"></script>
  <script src="workbench.js"></script>
</body>
</html>`
}

function renderWorkbenchDataScript(page) {
  return `window.PART_MATCH_WORKBENCH_DATA = ${JSON.stringify(page.report, null, 2)};\n`
}

function renderWorkbenchCss() {
  return renderSharedCss() + `
* { box-sizing: border-box; }
body { background: #f5f7fb; color: #172033; font-family: system-ui, sans-serif; height: 100vh; margin: 0; overflow: hidden; }
main { display: grid; gap: 14px; grid-template-rows: auto minmax(0, 1fr); height: 100vh; padding: 18px; }
.toolbar { background: #ffffff; border: 1px solid #d8dee9; border-radius: 8px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08); padding: 12px; position: relative; z-index: 20; }
.toolbar h1 { font-size: 20px; line-height: 1.2; margin: 0 0 4px; }
.toolbar-grid { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(150px, 1fr)); margin-top: 10px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.board { align-items: stretch; display: grid; gap: 14px; grid-template-columns: minmax(400px, 1fr) minmax(460px, 1fr); min-height: 0; }
.panel { background: #ffffff; border: 1px solid #d8dee9; border-radius: 8px; display: flex; flex-direction: column; min-height: 0; min-width: 0; padding: 12px; }
.panel-header { align-items: center; display: flex; gap: 8px; justify-content: space-between; margin-bottom: 10px; }
.panel-title { font-size: 15px; font-weight: 700; }
.pool-panel { position: relative; }
.drop-zone { border: 2px dashed #b7c0cf; border-radius: 8px; flex: 1; min-height: 0; overflow: auto; padding: 8px; transition: background 120ms ease, border-color 120ms ease; }
.drop-zone.drag-over, .group-bucket.drag-over, .part-card.drag-over { background: #edf7f1; border-color: #2f855a; }
.part-list { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
.bag-sections { display: grid; gap: 14px; }
.bag-section { border: 1px solid #e2e8f0; border-radius: 8px; display: grid; gap: 10px; padding: 8px; }
.bag-section.collapsed { gap: 0; }
.bag-section-body { display: grid; gap: 10px; }
.bag-group-list { display: grid; gap: 10px; }
.color-sections { display: grid; gap: 12px; }
.color-section { display: grid; gap: 8px; }
.color-swatch { border: 1px solid #9aa7b8; border-radius: 999px; display: inline-block; height: 14px; width: 14px; }
.color-section.collapsed { gap: 0; }
.group-list { display: grid; flex: 1; gap: 10px; grid-template-columns: 1fr; min-height: 0; overflow: auto; padding-right: 2px; }
.group-bucket { background: #fdfefe; border: 2px solid #d8dee9; border-radius: 8px; display: grid; gap: 0; grid-auto-rows: max-content; height: max-content; min-height: 0; padding: 10px; transition: background 120ms ease, border-color 120ms ease; }
.group-bucket.collapsed { padding: 8px; }
.group-summary { align-items: center; background: transparent; border: 0; border-radius: 6px; color: #172033; cursor: pointer; display: grid; gap: 12px; grid-template-columns: 84px minmax(0, 1fr) auto; padding: 4px; text-align: left; width: 100%; }
.group-summary:hover { background: #f8fafc; }
.group-summary.dragging { opacity: 0.45; }
.group-summary-image { align-items: center; background: #f8fafc; border: 1px solid #d8dee9; border-radius: 6px; display: flex; height: 76px; justify-content: center; padding: 5px; width: 84px; }
.group-summary-image img { max-height: 100%; max-width: 100%; object-fit: contain; }
.group-summary-meta { display: grid; gap: 3px; min-width: 0; }
.group-summary-title { font-size: 13px; font-weight: 700; overflow-wrap: anywhere; }
.group-summary-detail { color: #64748b; font-size: 12px; overflow-wrap: anywhere; }
.group-summary-toggle { color: #475569; font-size: 18px; font-weight: 700; }
.group-editor { align-items: center; display: grid; gap: 8px; grid-template-columns: minmax(160px, 1fr) 86px auto; margin: 10px 0 8px; }
.group-key { font-weight: 700; }
.group-count { color: #64748b; font-size: 12px; margin-bottom: 8px; }
.group-cards { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); min-height: 92px; }
.empty { align-items: center; color: #64748b; display: flex; font-size: 13px; justify-content: center; min-height: 96px; text-align: center; }
.part-card { background: #ffffff; border: 2px solid #d8dee9; border-radius: 8px; cursor: grab; display: grid; gap: 7px; min-width: 0; padding: 8px; user-select: none; }
.part-card:active { cursor: grabbing; }
.part-card.selected { border-color: #1f5f8b; box-shadow: 0 0 0 2px rgba(31, 95, 139, 0.16); }
.part-card.dragging { opacity: 0.45; }
.part-image { align-items: center; background: #f8fafc; border: 1px solid #d8dee9; border-radius: 6px; display: flex; height: 128px; justify-content: center; padding: 6px; width: 100%; }
.group-bucket .part-image { height: 92px; }
.part-image img { max-height: 100%; max-width: 100%; object-fit: contain; }
.part-meta { display: grid; gap: 2px; font-size: 12px; line-height: 1.35; }
.row-title { font-size: 12px; font-weight: 700; overflow-wrap: anywhere; }
.card-note { font-size: 12px; padding: 5px; }
.card-remove { font-size: 12px; padding: 5px 7px; }
.badge { background: #edf2f7; border-radius: 999px; color: #334155; display: inline-flex; font-size: 11px; justify-self: start; padding: 2px 7px; }
.muted { color: #64748b; font-size: 12px; }
input, select, textarea { border: 1px solid #b7c0cf; border-radius: 5px; font: inherit; min-width: 0; padding: 7px; width: 100%; }
textarea { margin-top: 10px; min-height: 96px; }
textarea.hidden { display: none; }
button { border: 1px solid #166534; border-radius: 5px; background: #166534; color: white; cursor: pointer; font: inherit; padding: 8px 10px; }
button.secondary { background: #ffffff; border-color: #9aa7b8; color: #172033; }
button.danger { background: #9f1239; border-color: #9f1239; }
button:disabled { cursor: not-allowed; opacity: 0.55; }
button.color-header { align-items: center; background: transparent; border: 0; border-bottom: 1px solid #e5e7eb; border-radius: 0; color: #334155; display: flex; font-size: 12px; font-weight: 700; gap: 8px; justify-content: flex-start; padding: 0 0 4px; text-align: left; width: 100%; }
button.color-header:hover { background: #f8fafc; }
button.bag-header { align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; color: #172033; display: flex; font-size: 13px; font-weight: 700; gap: 8px; justify-content: flex-start; padding: 7px 9px; text-align: left; width: 100%; }
button.bag-header:hover { background: #eef2f7; }
.collapse-icon { margin-left: auto; }
@media (max-width: 900px) {
  body { height: auto; overflow: auto; }
  main { display: block; height: auto; padding: 12px; }
  .toolbar { position: static; }
  .toolbar-grid { grid-template-columns: 1fr; }
  .board { grid-template-columns: 1fr; margin-top: 12px; }
  .pool-panel { position: static; }
  .drop-zone, .group-list { max-height: none; overflow: visible; }
}
`
}

function renderWorkbenchJs() {
  return `
(function () {
  const data = window.PART_MATCH_WORKBENCH_DATA;
  const root = document.getElementById("part-match-workbench");
  const state = new Map();
  const rowsById = new Map(data.rows.map(function (row) {
    return [row.rowId, row];
  }));
  const selected = new Set();
  const emptyGroupKeys = new Set();
  const collapsedBagKeys = new Set();
  const collapsedColorNames = new Set();
  const collapsedGroupKeys = new Set();
  let dragStartScrollState = null;
  let draggedRowIds = [];
  let searchText = "";
  let bagFilter = "all";
  let roleFilter = "all";

  initializeState();

  function render() {
    const scrollState = dragStartScrollState || captureScrollState();
    root.innerHTML = "";
    root.appendChild(renderToolbar());
    root.appendChild(renderBoard());
    restoreScrollState(scrollState);
  }

  function initializeState() {
    data.rows.forEach(function (row) {
      const label = row.label || {};
      const expectedPartKey = (label.expectedPartKey || "").trim();
      state.set(row.rowId, {
        expectedPartKey,
        note: label.note || "",
        role: label.role || (expectedPartKey ? "active" : "excluded")
      });
    });

    if (data.config.hasExistingLabels) {
      seedProposedGroups({ includeExistingLabels: false });
    } else {
      seedProposedGroups({ includeExistingLabels: true });
    }

    collapseVisibleGroups();
  }

  function seedProposedGroups(options) {
    const seedOptions = options || {};
    data.groups.forEach(function (group, index) {
      const rowIds = group.rowIds.filter(function (rowId) {
        const row = rowsById.get(rowId);
        return state.has(rowId) &&
          !isGroupedValue(state.get(rowId)) &&
          (seedOptions.includeExistingLabels || !row || !row.label);
      });

      if (rowIds.length < 2) {
        return;
      }

      const suggestedKey = group.suggestedPartKey || "part-" + String(index + 1).padStart(3, "0");
      const key = knownGroupKeys().includes(suggestedKey) ? nextPartKey() : suggestedKey;
      rowIds.forEach(function (rowId) {
        updateRow(rowId, { expectedPartKey: key, role: "active" });
      });
    });
  }

  function renderToolbar() {
    const toolbar = document.createElement("section");
    toolbar.className = "toolbar";
    const title = document.createElement("h1");
    title.textContent = "Part match annotation";
    const summary = document.createElement("p");
    summary.className = "muted";
    summary.textContent = summaryText();

    const controls = document.createElement("div");
    controls.className = "toolbar-grid";
    controls.appendChild(selectControl("Bag", bagFilter, bagOptions(), function (value) {
      bagFilter = value;
      render();
    }));
    controls.appendChild(selectControl("Role", roleFilter, [
      ["all", "All roles"],
      ["active", "Active"],
      ["gate", "Gate"],
      ["excluded", "Excluded"]
    ], function (value) {
      roleFilter = value;
      render();
    }));
    controls.appendChild(inputControl("Search", searchText, function (value) {
      searchText = value.trim().toLowerCase();
      render();
    }));

    const actions = document.createElement("div");
    actions.className = "actions";
    actions.appendChild(actionButton("New group", "secondary", function () {
      const key = nextPartKey();
      emptyGroupKeys.add(key);
      collapsedGroupKeys.delete(key);
      render();
    }));
    actions.appendChild(actionButton("Clear selection", "secondary", function () {
      selected.clear();
      render();
    }, selected.size === 0));
    actions.appendChild(actionButton("Expand groups", "secondary", function () {
      expandAllGroups();
      render();
    }));
    actions.appendChild(actionButton("Collapse groups", "secondary", function () {
      collapseVisibleGroups();
      render();
    }));
    actions.appendChild(actionButton("Apply proposed groups", "secondary", function () {
      applyProposedGroups();
      render();
    }, !data.groups.length));
    actions.appendChild(actionButton("Build label JSON", "", function () {
      writeOutput();
    }));
    actions.appendChild(actionButton("Download label JSON", "secondary", function () {
      downloadLabels();
    }));

    const output = document.createElement("textarea");
    output.id = "label-json-output";
    output.readOnly = true;
    output.className = "hidden";
    output.placeholder = "Generated label JSON appears here.";

    toolbar.appendChild(title);
    toolbar.appendChild(summary);
    toolbar.appendChild(controls);
    toolbar.appendChild(actions);
    toolbar.appendChild(output);
    return toolbar;
  }

  function renderBoard() {
    const visibleRows = sortRowsForWorkbench(data.rows.filter(rowMatchesFilters));
    const board = document.createElement("section");
    board.className = "board";
    board.appendChild(renderPoolPanel(visibleRows));
    board.appendChild(renderGroupsPanel(visibleRows));
    return board;
  }

  function renderPoolPanel(visibleRows) {
    const panel = document.createElement("section");
    panel.className = "panel pool-panel";
    const rows = visibleRows.filter(function (row) {
      return !isGroupedValue(state.get(row.rowId));
    });

    panel.appendChild(panelHeader("Ungrouped", rows.length, "parts"));
    const dropZone = document.createElement("section");
    dropZone.className = "drop-zone";
    addDropHandlers(dropZone, function (rowIds) {
      clearRows(rowIds);
      render();
    });

    if (rows.length === 0) {
      dropZone.appendChild(emptyMessage("No ungrouped rows."));
    } else {
      dropZone.appendChild(renderBagSectionsForRows(rows));
    }

    panel.appendChild(dropZone);
    return panel;
  }

  function renderGroupsPanel(visibleRows) {
    const panel = document.createElement("section");
    panel.className = "panel";
    const groupViews = createGroupViews(visibleRows);
    panel.appendChild(panelHeader("Groups", groupViews.length, "groups"));

    const list = document.createElement("section");
    list.className = "group-list";

    if (groupViews.length === 0) {
      const dropZone = document.createElement("section");
      dropZone.className = "group-bucket";
      addDropHandlers(dropZone, function (rowIds) {
        assignRows(rowIds, nextPartKey());
        render();
      });
      dropZone.appendChild(emptyMessage("Drop parts here."));
      list.appendChild(dropZone);
    } else {
      list.appendChild(renderBagSectionsForGroups(groupViews));
    }

    panel.appendChild(list);
    return panel;
  }

  function renderGroupBucket(group) {
    const bucket = document.createElement("section");
    const isCollapsed = collapsedGroupKeys.has(group.key);
    bucket.className = "group-bucket" + (isCollapsed ? " collapsed" : " expanded");
    addDropHandlers(bucket, function (rowIds) {
      assignRows(rowIds, group.key);
      render();
    });

    bucket.appendChild(renderGroupSummary(group, isCollapsed));

    if (isCollapsed) {
      return bucket;
    }

    bucket.appendChild(renderGroupEditor(group));
    bucket.appendChild(textLine("group-count", group.allRowIds.length + " rows"));
    bucket.appendChild(renderGroupCards(group));
    return bucket;
  }

  function renderGroupSummary(group, isCollapsed) {
    const representative = representativeRowForGroup(group);
    const summary = document.createElement("section");
    summary.className = "group-summary";
    summary.draggable = group.allRowIds.length > 0;
    summary.role = "button";
    summary.tabIndex = 0;
    summary.setAttribute("aria-expanded", String(!isCollapsed));
    summary.addEventListener("click", function (event) {
      event.stopPropagation();
      toggleGroupCollapsed(group.key);
      render();
    });
    summary.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleGroupCollapsed(group.key);
        render();
      }
    });
    summary.addEventListener("dragstart", function (event) {
      beginGroupDrag(group, event);
    });
    summary.addEventListener("dragend", function () {
      draggedRowIds = [];
      dragStartScrollState = null;
      summary.classList.remove("dragging");
    });

    const imageFrame = document.createElement("div");
    imageFrame.className = "group-summary-image";
    if (representative) {
      const image = document.createElement("img");
      image.alt = representative.rowId;
      image.src = representative.imageDataUrl || "";
      imageFrame.appendChild(image);
    }

    const meta = document.createElement("section");
    meta.className = "group-summary-meta";
    meta.appendChild(textLine("group-summary-title", group.key));
    meta.appendChild(textLine("group-summary-detail", group.allRowIds.length + " rows | " + representativeDetail(representative)));

    const toggle = document.createElement("span");
    toggle.className = "group-summary-toggle";
    toggle.textContent = isCollapsed ? "+" : "-";

    summary.appendChild(imageFrame);
    summary.appendChild(meta);
    summary.appendChild(toggle);
    return summary;
  }

  function renderGroupEditor(group) {
    const editor = document.createElement("section");
    editor.className = "group-editor";
    const keyInput = document.createElement("input");
    keyInput.className = "group-key";
    keyInput.value = group.key;
    keyInput.addEventListener("click", stopEvent);
    keyInput.addEventListener("dragstart", stopEvent);
    keyInput.addEventListener("change", function () {
      renameGroup(group.key, keyInput.value.trim(), group.allRowIds);
      render();
    });
    keyInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        keyInput.blur();
      }
    });

    const roleSelect = document.createElement("select");
    ["active", "gate"].forEach(function (role) {
      const option = document.createElement("option");
      option.value = role;
      option.textContent = role;
      option.selected = role === groupRole(group);
      roleSelect.appendChild(option);
    });
    roleSelect.addEventListener("click", stopEvent);
    roleSelect.addEventListener("change", function () {
      setGroupRoleForRows(group.allRowIds, roleSelect.value);
      render();
    });

    const ungroupButton = actionButton("Ungroup", "danger", function (event) {
      event.stopPropagation();
      clearRows(group.allRowIds);
      emptyGroupKeys.delete(group.key);
      collapsedGroupKeys.delete(group.key);
      render();
    }, group.allRowIds.length === 0);

    editor.appendChild(keyInput);
    editor.appendChild(roleSelect);
    editor.appendChild(ungroupButton);
    return editor;
  }

  function renderGroupCards(group) {
    const cards = document.createElement("section");
    cards.className = "group-cards";
    if (group.rows.length === 0) {
      cards.appendChild(emptyMessage("No visible rows."));
    } else {
      group.rows.forEach(function (row) {
        cards.appendChild(renderPartCard(row, { showRemoveFromGroup: true }));
      });
    }
    return cards;
  }

  function renderColorSections(rows) {
    const wrapper = document.createElement("section");
    wrapper.className = "color-sections";

    groupRowsByColor(rows).forEach(function (group) {
      const colorCollapseKey = group.collapseKey || group.name;
      const isCollapsed = collapsedColorNames.has(colorCollapseKey);
      const section = document.createElement("section");
      section.className = "color-section" + (isCollapsed ? " collapsed" : "");
      section.appendChild(renderColorHeader(group, isCollapsed));

      if (!isCollapsed) {
        const list = document.createElement("div");
        list.className = "part-list";
        group.rows.forEach(function (row) {
          list.appendChild(renderPartCard(row));
        });

        section.appendChild(list);
      }
      wrapper.appendChild(section);
    });

    return wrapper;
  }

  function renderBagSectionsForRows(rows) {
    if (bagFilter !== "all") {
      return renderColorSections(rows);
    }

    const wrapper = document.createElement("section");
    wrapper.className = "bag-sections";
    groupRowsByBag(rows).forEach(function (bag) {
      wrapper.appendChild(renderBagSection(bag, function () {
        return renderColorSections(bag.rows);
      }));
    });
    return wrapper;
  }

  function renderBagSectionsForGroups(groups) {
    if (bagFilter !== "all") {
      const wrapper = document.createElement("section");
      wrapper.className = "bag-group-list";
      groups.forEach(function (group) {
        wrapper.appendChild(renderGroupBucket(group));
      });
      return wrapper;
    }

    const wrapper = document.createElement("section");
    wrapper.className = "bag-sections";
    groupViewsByBag(groups).forEach(function (bag) {
      wrapper.appendChild(renderBagSection(bag, function () {
        const groupList = document.createElement("section");
        groupList.className = "bag-group-list";
        bag.groups.forEach(function (group) {
          groupList.appendChild(renderGroupBucket(group));
        });
        return groupList;
      }));
    });
    return wrapper;
  }

  function renderBagSection(bag, renderBody) {
    const isCollapsed = collapsedBagKeys.has(bag.key);
    const section = document.createElement("section");
    section.className = "bag-section" + (isCollapsed ? " collapsed" : "");
    section.appendChild(renderBagHeader(bag, isCollapsed));

    if (!isCollapsed) {
      const body = document.createElement("section");
      body.className = "bag-section-body";
      body.appendChild(renderBody());
      section.appendChild(body);
    }

    return section;
  }

  function renderBagHeader(bag, isCollapsed) {
    const header = document.createElement("button");
    header.className = "bag-header";
    header.type = "button";
    header.setAttribute("aria-expanded", String(!isCollapsed));
    header.addEventListener("click", function () {
      toggleBagCollapsed(bag.key);
      render();
    });
    const text = document.createElement("span");
    text.textContent = bag.label + " (" + bag.count + ")";
    const icon = document.createElement("span");
    icon.className = "collapse-icon";
    icon.textContent = isCollapsed ? "+" : "-";
    header.appendChild(text);
    header.appendChild(icon);
    return header;
  }

  function renderColorHeader(group, isCollapsed) {
    const header = document.createElement("button");
    header.className = "color-header";
    header.type = "button";
    header.setAttribute("aria-expanded", String(!isCollapsed));
    header.addEventListener("click", function () {
      toggleColorCollapsed(group.collapseKey || group.name);
      render();
    });
    const swatch = document.createElement("span");
    swatch.className = "color-swatch";
    swatch.style.background = group.swatchHex || "#ffffff";
    const text = document.createElement("span");
    text.textContent = group.name + " (" + group.rows.length + ")";
    const icon = document.createElement("span");
    icon.className = "collapse-icon";
    icon.textContent = isCollapsed ? "+" : "-";
    header.appendChild(swatch);
    header.appendChild(text);
    header.appendChild(icon);
    return header;
  }

  function renderPartCard(row, options) {
    const card = document.createElement("section");
    const cardOptions = options || {};
    const value = state.get(row.rowId) || {};
    const isSelected = selected.has(row.rowId);
    card.className = "part-card" + (isSelected ? " selected" : "");
    card.draggable = true;
    card.dataset.rowId = row.rowId;
    card.addEventListener("click", function () {
      toggleSelected(row.rowId);
      render();
    });
    card.addEventListener("dragstart", function (event) {
      beginDrag(row.rowId, event);
    });
    card.addEventListener("dragend", function () {
      draggedRowIds = [];
      dragStartScrollState = null;
      card.classList.remove("dragging");
    });
    addDropHandlers(card, function (rowIds) {
      dropRowsOnRow(rowIds, row.rowId);
      render();
    });

    const imageFrame = document.createElement("div");
    imageFrame.className = "part-image";
    const image = document.createElement("img");
    image.alt = row.rowId;
    image.src = row.imageDataUrl || "";
    imageFrame.appendChild(image);

    const meta = document.createElement("section");
    meta.className = "part-meta";
    meta.appendChild(textLine("row-title", row.rowId));
    meta.appendChild(textLine("muted", row.bagLabel + " | page " + row.pageNumber + " | step " + row.stepIndex));
    meta.appendChild(textLine("muted", "qty " + row.quantity + " | " + colorName(row)));
    if (isGroupedValue(value)) {
      meta.appendChild(textLine("badge", value.expectedPartKey));
    }

    const noteInput = document.createElement("input");
    noteInput.className = "note";
    noteInput.value = value.note || "";
    noteInput.placeholder = "note";
    noteInput.className = "card-note";
    noteInput.addEventListener("click", stopEvent);
    noteInput.addEventListener("dragstart", stopEvent);
    noteInput.addEventListener("input", function () {
      updateRow(row.rowId, { note: noteInput.value.trim() });
    });

    card.appendChild(imageFrame);
    card.appendChild(meta);
    if (cardOptions.showRemoveFromGroup) {
      card.appendChild(actionButton("Remove", "secondary card-remove", function (event) {
        event.stopPropagation();
        clearRows([row.rowId]);
        render();
      }));
    }
    card.appendChild(noteInput);
    return card;
  }

  function inputControl(labelText, value, onInput) {
    const wrapper = document.createElement("label");
    wrapper.className = "muted";
    wrapper.textContent = labelText;
    const input = document.createElement("input");
    input.value = value;
    input.addEventListener("input", function () {
      onInput(input.value);
    });
    wrapper.appendChild(input);
    return wrapper;
  }

  function selectControl(labelText, value, options, onInput) {
    const wrapper = document.createElement("label");
    wrapper.className = "muted";
    wrapper.textContent = labelText;
    const select = document.createElement("select");
    options.forEach(function (optionValue) {
      const option = document.createElement("option");
      option.value = optionValue[0];
      option.textContent = optionValue[1];
      option.selected = optionValue[0] === value;
      select.appendChild(option);
    });
    select.addEventListener("input", function () {
      onInput(select.value);
    });
    wrapper.appendChild(select);
    return wrapper;
  }

  function actionButton(text, style, onClick, disabled) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.disabled = Boolean(disabled);
    if (style) {
      button.className = style;
    }
    button.addEventListener("click", onClick);
    return button;
  }

  function panelHeader(title, count, unit) {
    const header = document.createElement("section");
    header.className = "panel-header";
    header.appendChild(textLine("panel-title", title));
    header.appendChild(textLine("muted", count + " " + unit));
    return header;
  }

  function textLine(className, text) {
    const element = document.createElement("div");
    element.className = className;
    element.textContent = text;
    return element;
  }

  function emptyMessage(text) {
    return textLine("empty", text);
  }

  function updateRow(rowId, patch) {
    const current = state.get(rowId) || { expectedPartKey: "", note: "", role: "excluded" };
    state.set(rowId, Object.assign({}, current, patch));
  }

  function toggleSelected(rowId) {
    if (selected.has(rowId)) {
      selected.delete(rowId);
      return;
    }

    selected.add(rowId);
  }

  function toggleBagCollapsed(bagKey) {
    if (collapsedBagKeys.has(bagKey)) {
      collapsedBagKeys.delete(bagKey);
      return;
    }

    collapsedBagKeys.add(bagKey);
  }

  function toggleColorCollapsed(colorNameValue) {
    if (collapsedColorNames.has(colorNameValue)) {
      collapsedColorNames.delete(colorNameValue);
      return;
    }

    collapsedColorNames.add(colorNameValue);
  }

  function toggleGroupCollapsed(key) {
    if (collapsedGroupKeys.has(key)) {
      collapsedGroupKeys.delete(key);
      return;
    }

    collapsedGroupKeys.add(key);
  }

  function collapseVisibleGroups() {
    knownGroupKeys().forEach(function (key) {
      collapsedGroupKeys.add(key);
    });
  }

  function expandAllGroups() {
    collapsedGroupKeys.clear();
  }

  function assignRows(rowIds, key) {
    const targetKey = key || nextPartKey();
    uniqueRowIds(rowIds).forEach(function (rowId) {
      const current = state.get(rowId) || {};
      updateRow(rowId, {
        expectedPartKey: targetKey,
        role: current.role === "gate" ? "gate" : "active"
      });
    });
    emptyGroupKeys.delete(targetKey);
  }

  function clearRows(rowIds) {
    uniqueRowIds(rowIds).forEach(function (rowId) {
      updateRow(rowId, {
        expectedPartKey: "",
        role: "excluded"
      });
    });
  }

  function dropRowsOnRow(rowIds, targetRowId) {
    const target = state.get(targetRowId);
    const key = isGroupedValue(target) ? target.expectedPartKey : nextPartKey();
    assignRows([...rowIds, targetRowId], key);
  }

  function applyProposedGroups() {
    seedProposedGroups({ includeExistingLabels: true });
    collapseVisibleGroups();
  }

  function createGroupViews(visibleRows) {
    const groupsByViewKey = new Map();
    const visibleRowIds = new Set(visibleRows.map(function (row) {
      return row.rowId;
    }));

    data.rows.forEach(function (row) {
      const value = state.get(row.rowId);
      if (!isGroupedValue(value)) {
        return;
      }

      const viewKey = groupViewKey(row.bagId, value.expectedPartKey);
      if (!groupsByViewKey.has(viewKey)) {
        groupsByViewKey.set(viewKey, {
          allRowIds: [],
          bagId: row.bagId,
          bagLabel: row.bagLabel || row.bagId,
          key: value.expectedPartKey,
          rows: []
        });
      }

      const view = groupsByViewKey.get(viewKey);
      view.allRowIds.push(row.rowId);
      if (visibleRowIds.has(row.rowId)) {
        view.rows.push(row);
      }
    });

    emptyGroupKeys.forEach(function (key) {
      groupsByViewKey.set(groupViewKey("", key), {
        allRowIds: [],
        bagId: "",
        bagLabel: "No bag",
        key,
        rows: []
      });
    });

    return Array.from(groupsByViewKey.values())
      .map(function (group) {
        return Object.assign({}, group, {
          rows: sortRowsForWorkbench(group.rows)
        });
      })
      .filter(function (group) {
        return group.rows.length > 0 || emptyGroupKeys.has(group.key);
      })
      .sort(compareGroupViewsForWorkbench);
  }

  function groupRowsByBag(rows) {
    const groups = new Map();
    sortRowsForWorkbench(rows).forEach(function (row) {
      const key = row.bagId || "unknown-bag";
      if (!groups.has(key)) {
        groups.set(key, {
          count: 0,
          key,
          label: row.bagLabel || row.bagId || "Unknown bag",
          rows: []
        });
      }
      groups.get(key).rows.push(row);
      groups.get(key).count += 1;
    });
    return Array.from(groups.values());
  }

  function groupViewsByBag(groups) {
    const bags = new Map();
    groups.forEach(function (group) {
      const key = group.bagId || "no-bag";
      if (!bags.has(key)) {
        bags.set(key, {
          count: 0,
          groups: [],
          key,
          label: group.bagLabel || group.bagId || "No bag"
        });
      }
      bags.get(key).groups.push(group);
      bags.get(key).count += 1;
    });
    return Array.from(bags.values()).sort(function (left, right) {
      return compareText(left.label, right.label);
    });
  }

  function groupRowsByColor(rows) {
    const groups = new Map();
    sortRowsForWorkbench(rows).forEach(function (row) {
      const name = colorName(row);
      const key = (row.bagId || "unknown-bag") + "\\0" + name;
      if (!groups.has(key)) {
        groups.set(key, {
          collapseKey: key,
          name,
          rows: [],
          swatchHex: row.color && row.color.swatchHex ? row.color.swatchHex : ""
        });
      }
      groups.get(key).rows.push(row);
    });
    return Array.from(groups.values());
  }

  function sortRowsForWorkbench(rows) {
    return [...rows].sort(compareRowsForWorkbench);
  }

  function compareRowsForWorkbench(left, right) {
    return compareText(left.bagLabel || left.bagId, right.bagLabel || right.bagId) ||
      compareText(colorName(left), colorName(right)) ||
      compareNumber(left.pageNumber, right.pageNumber) ||
      compareNumber(left.stepIndex, right.stepIndex) ||
      compareText(left.rowId, right.rowId);
  }

  function compareGroupViewsForWorkbench(left, right) {
    const leftRow = representativeRowForGroup(left);
    const rightRow = representativeRowForGroup(right);
    return compareText(left.bagLabel || (leftRow && (leftRow.bagLabel || leftRow.bagId)), right.bagLabel || (rightRow && (rightRow.bagLabel || rightRow.bagId))) ||
      compareText(groupSortColorName(leftRow), groupSortColorName(rightRow)) ||
      compareNumber(leftRow && leftRow.pageNumber, rightRow && rightRow.pageNumber) ||
      compareNumber(leftRow && leftRow.stepIndex, rightRow && rightRow.stepIndex) ||
      compareText(left.key, right.key);
  }

  function groupSortColorName(row) {
    return row ? colorName(row) : "zzzzzz";
  }

  function compareText(left, right) {
    return String(left || "").localeCompare(String(right || ""), undefined, {
      numeric: true,
      sensitivity: "base"
    });
  }

  function compareNumber(left, right) {
    return (Number(left) || 0) - (Number(right) || 0);
  }

  function knownGroupKeys() {
    const keys = new Set(emptyGroupKeys);
    state.forEach(function (value) {
      if (isGroupedValue(value)) {
        keys.add(value.expectedPartKey);
      }
    });
    return Array.from(keys).sort(function (left, right) {
      return left.localeCompare(right);
    });
  }

  function groupRole(group) {
    const roles = new Set(group.allRowIds.map(function (rowId) {
      const role = (state.get(rowId) || {}).role;
      return role === "gate" ? "gate" : "active";
    }));
    return roles.size === 1 && roles.has("gate") ? "gate" : "active";
  }

  function setGroupRoleForRows(rowIds, role) {
    rowIds.forEach(function (rowId) {
      updateRow(rowId, { role });
    });
  }

  function renameGroup(oldKey, nextKey, rowIds) {
    if (!nextKey || nextKey === oldKey) {
      return;
    }

    rowIds.forEach(function (rowId) {
      const value = state.get(rowId);
      if (value && value.expectedPartKey === oldKey) {
        updateRow(rowId, { expectedPartKey: nextKey });
      }
    });

    if (emptyGroupKeys.has(oldKey)) {
      emptyGroupKeys.delete(oldKey);
      emptyGroupKeys.add(nextKey);
    }
    if (collapsedGroupKeys.has(oldKey)) {
      collapsedGroupKeys.delete(oldKey);
      collapsedGroupKeys.add(nextKey);
    }
  }

  function representativeRowForGroup(group) {
    if (group.rows[0]) {
      return group.rows[0];
    }

    const rowIds = new Set(group.allRowIds);
    return data.rows.find(function (row) {
      return rowIds.has(row.rowId);
    }) || null;
  }

  function representativeDetail(row) {
    if (!row) {
      return "empty group";
    }

    return row.bagLabel + " | page " + row.pageNumber + " | " + colorName(row);
  }

  function groupViewKey(bagId, key) {
    return String(bagId || "") + "\\0" + key;
  }

  function rowMatchesFilters(row) {
    const value = state.get(row.rowId) || {};
    if (bagFilter !== "all" && row.bagId !== bagFilter) {
      return false;
    }
    if (roleFilter !== "all" && value.role !== roleFilter) {
      return false;
    }
    if (!searchText) {
      return true;
    }

    return [
      row.rowId,
      row.bagLabel,
      row.sourceItemId,
      colorName(row),
      value.expectedPartKey,
      value.note
    ].some(function (part) {
      return String(part || "").toLowerCase().includes(searchText);
    });
  }

  function bagOptions() {
    const seen = new Set();
    const options = [["all", "All bags"]];
    data.rows.forEach(function (row) {
      if (seen.has(row.bagId)) {
        return;
      }
      seen.add(row.bagId);
      options.push([row.bagId, row.bagLabel || row.bagId]);
    });
    return options;
  }

  function nextPartKey() {
    const used = new Set(knownGroupKeys());
    let index = used.size + 1;
    while (used.has("part-" + String(index).padStart(3, "0"))) {
      index += 1;
    }
    return "part-" + String(index).padStart(3, "0");
  }

  function colorName(row) {
    return row.color && row.color.name ? row.color.name : "Unknown color";
  }

  function isGroupedValue(value) {
    return Boolean(value && value.expectedPartKey && value.role !== "excluded");
  }

  function addDropHandlers(element, onDrop) {
    element.addEventListener("dragover", function (event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    element.addEventListener("dragenter", function (event) {
      event.preventDefault();
      element.classList.add("drag-over");
    });
    element.addEventListener("dragleave", function (event) {
      if (!element.contains(event.relatedTarget)) {
        element.classList.remove("drag-over");
      }
    });
    element.addEventListener("drop", function (event) {
      event.preventDefault();
      event.stopPropagation();
      element.classList.remove("drag-over");
      const rowIds = readDraggedRowIds(event);
      if (rowIds.length === 0) {
        return;
      }
      onDrop(rowIds);
    });
  }

  function beginDrag(rowId, event) {
    draggedRowIds = selected.has(rowId) ? Array.from(selected) : [rowId];
    dragStartScrollState = captureScrollState();
    event.currentTarget.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/json", JSON.stringify(draggedRowIds));
    event.dataTransfer.setData("text/plain", draggedRowIds.join("\\n"));
  }

  function beginGroupDrag(group, event) {
    draggedRowIds = group.allRowIds;
    dragStartScrollState = captureScrollState();
    event.currentTarget.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/json", JSON.stringify(draggedRowIds));
    event.dataTransfer.setData("text/plain", draggedRowIds.join("\\n"));
  }

  function readDraggedRowIds(event) {
    const rawJson = event.dataTransfer.getData("application/json");
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson);
        return Array.isArray(parsed) ? uniqueRowIds(parsed) : [];
      } catch (_error) {}
    }
    return uniqueRowIds(draggedRowIds);
  }

  function uniqueRowIds(rowIds) {
    const knownIds = new Set(data.rows.map(function (row) {
      return row.rowId;
    }));
    return Array.from(new Set(rowIds)).filter(function (rowId) {
      return knownIds.has(rowId);
    });
  }

  function stopEvent(event) {
    event.stopPropagation();
  }

  function captureScrollState() {
    return {
      groups: readScrollState(".group-list"),
      page: {
        left: window.scrollX,
        top: window.scrollY
      },
      pool: readScrollState(".drop-zone")
    };
  }

  function readScrollState(selector) {
    const element = root.querySelector(selector);
    return element
      ? {
          left: element.scrollLeft,
          top: element.scrollTop
        }
      : null;
  }

  function restoreScrollState(scrollState) {
    restoreElementScroll(".drop-zone", scrollState.pool);
    restoreElementScroll(".group-list", scrollState.groups);
    window.scrollTo(scrollState.page.left, scrollState.page.top);
    dragStartScrollState = null;
  }

  function restoreElementScroll(selector, scrollState) {
    if (!scrollState) {
      return;
    }

    const element = root.querySelector(selector);
    if (!element) {
      return;
    }

    element.scrollLeft = scrollState.left;
    element.scrollTop = scrollState.top;
  }

  function summaryText() {
    let grouped = 0;
    state.forEach(function (value) {
      if (isGroupedValue(value)) {
        grouped += 1;
      }
    });
    return data.totals.rows + " rows, " + grouped + " grouped, " + selected.size + " selected.";
  }

  function writeOutput() {
    const output = document.getElementById("label-json-output");
    output.classList.remove("hidden");
    output.value = JSON.stringify(createExport(), null, 2);
    output.select();
    try {
      document.execCommand("copy");
    } catch (_error) {}
  }

  function downloadLabels() {
    const json = JSON.stringify(createExport(), null, 2) + "\\n";
    const blob = new Blob([json], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = data.config.exportFileName || "part-match-labels.json";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function createExport() {
    return {
      manualId: data.config.manualId,
      status: data.config.status,
      reportPath: data.config.reportPath,
      labels: data.rows.map(function (row) {
        const value = state.get(row.rowId) || {};
        const grouped = isGroupedValue(value);
        return {
          itemId: row.rowId,
          expectedPartKey: grouped ? value.expectedPartKey : "",
          role: grouped ? value.role : "excluded",
          cropHash: row.cropHash,
          ...(value.note ? { note: value.note } : {})
        };
      })
    };
  }

  render();
})();
`
}

function renderSharedCss() {
  return "table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #d8dee9; padding: 6px; text-align: left; } img.crop { max-height: 72px; max-width: 96px; object-fit: contain; }"
}

function renderCrop(imageDataUrl) {
  return imageDataUrl
    ? `<img class="crop" alt="" src="${escapeAttribute(imageDataUrl)}">`
    : ""
}

function createManualFingerprint(session) {
  const manual = session.manual ?? {}

  return `${manual.fileName ?? "manual.pdf"}:${manual.sizeBytes ?? 0}:${manual.lastModified ?? 0}`
}

function defaultReportDir(sessionPath, generatedAt, manualId) {
  if (manualId) {
    return path.join(DEFAULT_REPORT_ROOT, manualId)
  }

  const baseName = path.basename(sessionPath, path.extname(sessionPath))
    .replace(/\.bagit-session$/i, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  const timestamp = generatedAt.toISOString().replace(/[:.]/g, "-")

  return path.join(DEFAULT_REPORT_ROOT, `${timestamp}-${baseName || "manual"}`)
}

function normalizeWorkspacePath(value) {
  return path.relative(process.cwd(), path.resolve(value))
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;")
}

async function runCli() {
  const argv = process.argv.slice(2)
  const sessionPath = argv[0]
  const outputDir = readOption(argv, "--out-dir")
  const labelDir = readOption(argv, "--label-dir")
  const manualId = readOption(argv, "--manual-id")
  const scorerConfigPath = readOption(argv, "--scorer-config")
  const bagIds = parseListOption(readOption(argv, "--bag-ids"))
  const bagLabels = parseListOption(readOption(argv, "--bag-labels"))
  const enableLabelGatedNearMatches = argv.includes("--enable-near-matches")

  if (!sessionPath) {
    throw new Error(`Usage: node scripts/write-part-match-report.mjs <session.bagit-session.json> [--manual-id manual] [--out-dir ${DEFAULT_REPORT_ROOT}/manual] [--label-dir ${DEFAULT_REPORT_ROOT}/labels] [--bag-labels "Bag 1,Bag 2"] [--bag-ids bag-id] [--enable-near-matches]`)
  }

  const result = await writePartMatchReport({
    bagIds,
    bagLabels,
    enableLabelGatedNearMatches,
    labelDir,
    manualId,
    outputDir,
    pairScorerConfig: scorerConfigPath
      ? JSON.parse(await readFile(scorerConfigPath, "utf8"))
      : null,
    sessionPath,
  })

  console.log(`Wrote part match report to ${result.outputDir}`)
}

function readOption(argv, name) {
  const index = argv.indexOf(name)

  return index >= 0 ? argv[index + 1] : undefined
}

function parseListOption(value) {
  return value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : []
}

const currentFile = fileURLToPath(import.meta.url)

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  runCli().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
