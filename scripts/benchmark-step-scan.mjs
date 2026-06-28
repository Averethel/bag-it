#!/usr/bin/env node

import { performance } from "node:perf_hooks"
import {
  STEP_CALLOUT_DETECTOR_VERSION,
  detectStepCalloutPageCandidates,
  inferStepCalloutEvidenceManualStyle,
  resolveStepCalloutsFromPageEvidence,
  scoreStepCalloutPageEvidence,
} from "@bag-it/step-callouts"

const options = parseOptions(process.argv.slice(2))
const progressGaps = []
const pageDurations = []
let lastProgressAt = performance.now()
const pages = []

const startedAt = performance.now()
const candidatesByPage = new Map()

for (let pageNumber = 1; pageNumber <= options.pages; pageNumber += 1) {
  const page = createBenchmarkPage(pageNumber, options.width, options.height, options.callouts)
  const pageStartedAt = performance.now()
  const candidates = detectStepCalloutPageCandidates(page)

  pages.push(page)
  candidatesByPage.set(page.pageNumber, candidates)
  pageDurations.push(performance.now() - pageStartedAt)
  recordProgress()
}

const candidates = pages.flatMap((page) => candidatesByPage.get(page.pageNumber) ?? [])
const manualStyle = inferStepCalloutEvidenceManualStyle(pages, candidates)
const evidence = pages.flatMap((page) => {
  const pageEvidence = scoreStepCalloutPageEvidence(
    page,
    candidatesByPage.get(page.pageNumber) ?? [],
    manualStyle,
  )

  recordProgress()

  return pageEvidence
})
const result = resolveStepCalloutsFromPageEvidence(pages, candidates, evidence)
const elapsedMs = performance.now() - startedAt

console.log(JSON.stringify({
  detectorVersion: STEP_CALLOUT_DETECTOR_VERSION,
  mode: "staged-package",
  pages: options.pages,
  pageSize: `${options.width}x${options.height}`,
  calloutsPerPage: options.callouts,
  detectedCallouts: result.resolvedCallouts.filter((callout) => callout.status !== "rejected").length,
  progressEvents: progressGaps.length,
  elapsedMs: round(elapsedMs),
  pagesPerSecond: round(options.pages / (elapsedMs / 1000)),
  meanPageMs: round(mean(pageDurations)),
  p95PageMs: round(percentile(pageDurations, 0.95)),
  maxPageMs: round(Math.max(...pageDurations)),
  maxProgressGapMs: round(Math.max(...progressGaps)),
}, null, 2))

function recordProgress() {
  const now = performance.now()

  progressGaps.push(now - lastProgressAt)
  lastProgressAt = now
}

function parseOptions(args) {
  return {
    pages: readNumberArg(args, "pages", 120),
    width: readNumberArg(args, "width", 420),
    height: readNumberArg(args, "height", 300),
    callouts: readNumberArg(args, "callouts", 2),
  }
}

function readNumberArg(args, name, fallback) {
  const equalsPrefix = `--${name}=`
  const equalsValue = args.find((arg) => arg.startsWith(equalsPrefix))

  if (equalsValue) {
    return positiveInteger(equalsValue.slice(equalsPrefix.length), name)
  }

  const flagIndex = args.indexOf(`--${name}`)

  if (flagIndex >= 0 && args[flagIndex + 1]) {
    return positiveInteger(args[flagIndex + 1], name)
  }

  return fallback
}

function positiveInteger(value, name) {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer.`)
  }

  return parsed
}

function createBenchmarkPage(pageNumber, width, height, calloutCount) {
  const data = new Uint8ClampedArray(width * height * 4)
  const textItems = []

  fillRect(data, width, { x: 0, y: 0, width, height }, "#ffffff")

  for (let index = 0; index < calloutCount; index += 1) {
    const columnWidth = Math.floor(width / calloutCount)
    const calloutWidth = Math.max(76, Math.min(150, columnWidth - 40))
    const calloutHeight = Math.max(68, Math.min(104, height - 88))
    const x = 24 + index * columnWidth
    const y = 42 + ((pageNumber + index) % 3) * 12
    const callout = {
      x,
      y,
      width: calloutWidth,
      height: calloutHeight,
    }
    const part = {
      x: x + Math.round(calloutWidth * 0.28),
      y: y + 18,
      width: Math.round(calloutWidth * 0.42),
      height: Math.round(calloutHeight * 0.28),
    }
    const quantityLabel = {
      x: part.x + Math.round(part.width * 0.25),
      y: part.y + part.height + 8,
      width: 28,
      height: 16,
    }
    const fill = "#e5f2ff"
    const partFill = index % 2 === 0 ? "#c91a09" : "#0055bf"

    drawBox(data, width, callout, fill, "#111111")
    fillRect(data, width, part, partFill)
    textItems.push({
      text: `${(index % 4) + 1}x`,
      region: quantityLabel,
    })
  }

  return {
    pageNumber,
    width,
    height,
    data,
    textItems,
  }
}

function drawBox(data, width, region, fill, stroke) {
  fillRect(data, width, region, stroke)
  fillRect(
    data,
    width,
    {
      x: region.x + 3,
      y: region.y + 3,
      width: region.width - 6,
      height: region.height - 6,
    },
    fill,
  )
}

function fillRect(data, width, region, hex) {
  const rgb = hexToRgb(hex)
  const left = Math.max(0, region.x)
  const top = Math.max(0, region.y)
  const right = Math.min(width, region.x + region.width)
  const bottom = Math.min(data.length / 4 / width, region.y + region.height)

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * width + x) * 4

      data[offset] = rgb.r
      data[offset + 1] = rgb.g
      data[offset + 2] = rgb.b
      data[offset + 3] = 255
    }
  }
}

function hexToRgb(hex) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length)
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * percentileValue))

  return sorted[index] ?? 0
}

function round(value) {
  return Math.round(value * 100) / 100
}
