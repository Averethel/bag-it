import {
  findRasterQuantityGlyphRows,
  findRasterQuantityLabels,
  type RasterQuantityLabel,
} from "@bag-it/raster-quantity-labels"
import type {
  StepCalloutCandidate,
  StepCalloutEvidenceScore,
  StepCalloutPageInput,
  StepCalloutRgbColor,
} from "./contracts"
import { stepCalloutRegionCenter } from "./regions"

const LOWER_ROW_START_RATIO = 0.5
const QUANTITY_LABEL_MAX_GLYPH_GAP_HEIGHT_RATIO = 0.35
const QUANTITY_LABEL_MAX_HEIGHT = 30
const QUANTITY_LABEL_MAX_CANDIDATE_HEIGHT_RATIO = 0.3
const REPEATED_SPACED_LABEL_MIN_COUNT = 2
const REPEATED_SPACED_LABEL_MAX_GLYPH_GAP_HEIGHT_RATIO = 0.9
const GLYPH_ROW_FALLBACK_MAX_CANDIDATE_AREA_RATIO = 0.06
const GLYPH_ROW_FALLBACK_MAX_CANDIDATE_HEIGHT = 160
const GLYPH_ROW_FALLBACK_MAX_CANDIDATE_WIDTH = 360

export function scoreStepCalloutQuantityEvidence(
  page: StepCalloutPageInput,
  candidate: StepCalloutCandidate,
  background: StepCalloutRgbColor,
): StepCalloutEvidenceScore {
  const rawQuantityLabels = findRasterQuantityLabels(page, candidate.region, background)
  const quantityLabels = selectRasterQuantityLabels(page, candidate, rawQuantityLabels)
  const lowerRowCount = quantityLabels.filter((label) => isInLowerCandidateRow(candidate, label)).length
  const lowerGlyphRowCount = lowerRowCount > 0 || !isCompactGlyphFallbackCandidate(page, candidate)
    ? 0
    : findRasterQuantityGlyphRows(page, candidate.region, background).length
  const value = lowerRowCount > 0 || lowerGlyphRowCount > 0
    ? 1
    : normalizeQuantityLabelCount(quantityLabels.length)

  return {
    reasons: createQuantityReasons(
      quantityLabels.length,
      lowerRowCount,
      lowerGlyphRowCount,
      rawQuantityLabels.length - quantityLabels.length,
    ),
    signal: "quantity",
    value,
  }
}

function selectRasterQuantityLabels(
  page: StepCalloutPageInput,
  candidate: StepCalloutCandidate,
  rawQuantityLabels: readonly RasterQuantityLabel[],
): RasterQuantityLabel[] {
  const accepted = new Set<RasterQuantityLabel>()

  for (const label of rawQuantityLabels) {
    if (isCompactRasterQuantityLabel(candidate, label)) {
      accepted.add(label)
    }
  }

  for (const label of findRepeatedSpacedLowerRowLabels(page, candidate, rawQuantityLabels)) {
    accepted.add(label)
  }

  return rawQuantityLabels.filter((label) => accepted.has(label))
}

function isCompactGlyphFallbackCandidate(
  page: StepCalloutPageInput,
  candidate: StepCalloutCandidate,
): boolean {
  if (candidate.source === "line-rectangle") {
    return false
  }

  const areaRatio = (candidate.region.width * candidate.region.height) /
    Math.max(1, page.width * page.height)

  return (
    areaRatio <= GLYPH_ROW_FALLBACK_MAX_CANDIDATE_AREA_RATIO &&
    candidate.region.height <= GLYPH_ROW_FALLBACK_MAX_CANDIDATE_HEIGHT &&
    candidate.region.width <= GLYPH_ROW_FALLBACK_MAX_CANDIDATE_WIDTH
  )
}

function findRepeatedSpacedLowerRowLabels(
  page: StepCalloutPageInput,
  candidate: StepCalloutCandidate,
  labels: readonly RasterQuantityLabel[],
): RasterQuantityLabel[] {
  if (candidate.source !== "fill-panel" || !isCompactGlyphFallbackCandidate(page, candidate)) {
    return []
  }

  return clusterRasterQuantityLabelRows(
    labels.filter((label) =>
      isInLowerCandidateRow(candidate, label) &&
      isSpacedRasterQuantityLabel(candidate, label)
    ),
  ).flatMap((row) => row.length >= REPEATED_SPACED_LABEL_MIN_COUNT ? row : [])
}

function isCompactRasterQuantityLabel(
  candidate: StepCalloutCandidate,
  label: RasterQuantityLabel,
): boolean {
  if (
    label.region.height > QUANTITY_LABEL_MAX_HEIGHT ||
    label.region.height / candidate.region.height > QUANTITY_LABEL_MAX_CANDIDATE_HEIGHT_RATIO
  ) {
    return false
  }

  const glyphs = [...(label.glyphs ?? [])].sort((left, right) => left.region.x - right.region.x)

  if (glyphs.length < 2) {
    return true
  }

  const maxGap = glyphs.slice(1).reduce((largestGap, glyph, index) => {
    const previous = glyphs[index]
    const gap = glyph.region.x - (previous.region.x + previous.region.width)

    return Math.max(largestGap, gap)
  }, 0)

  return maxGap / label.region.height <= QUANTITY_LABEL_MAX_GLYPH_GAP_HEIGHT_RATIO
}

function isSpacedRasterQuantityLabel(
  candidate: StepCalloutCandidate,
  label: RasterQuantityLabel,
): boolean {
  if (
    label.region.height > QUANTITY_LABEL_MAX_HEIGHT ||
    label.region.height / candidate.region.height > QUANTITY_LABEL_MAX_CANDIDATE_HEIGHT_RATIO
  ) {
    return false
  }

  const glyphs = [...(label.glyphs ?? [])].sort((left, right) => left.region.x - right.region.x)

  if (glyphs.length < 2) {
    return false
  }

  const maxGap = glyphs.slice(1).reduce((largestGap, glyph, index) => {
    const previous = glyphs[index]
    const gap = glyph.region.x - (previous.region.x + previous.region.width)

    return Math.max(largestGap, gap)
  }, 0)

  return maxGap / label.region.height <= REPEATED_SPACED_LABEL_MAX_GLYPH_GAP_HEIGHT_RATIO
}

function clusterRasterQuantityLabelRows(
  labels: readonly RasterQuantityLabel[],
): RasterQuantityLabel[][] {
  const rows: RasterQuantityLabel[][] = []

  for (const label of [...labels].sort((left, right) => stepCalloutRegionCenter(left.region).y - stepCalloutRegionCenter(right.region).y)) {
    const row = rows.find((candidateRow) => isSameRasterQuantityLabelRow(candidateRow, label))

    if (row) {
      row.push(label)
    } else {
      rows.push([label])
    }
  }

  return rows
}

function isSameRasterQuantityLabelRow(
  row: readonly RasterQuantityLabel[],
  label: RasterQuantityLabel,
): boolean {
  const centerY = stepCalloutRegionCenter(label.region).y
  const rowCenterY = row.reduce((sum, rowLabel) => sum + stepCalloutRegionCenter(rowLabel.region).y, 0) / row.length

  return Math.abs(centerY - rowCenterY) <= Math.max(6, label.region.height * 0.75)
}

function isInLowerCandidateRow(
  candidate: StepCalloutCandidate,
  label: RasterQuantityLabel,
): boolean {
  const center = stepCalloutRegionCenter(label.region)
  const lowerRowStart = candidate.region.y + candidate.region.height * LOWER_ROW_START_RATIO

  return center.y >= lowerRowStart
}

function normalizeQuantityLabelCount(quantityLabelCount: number): number {
  return Math.min(0.5, quantityLabelCount * 0.25)
}

function createQuantityReasons(
  quantityLabelCount: number,
  lowerRowCount: number,
  lowerGlyphRowCount: number,
  rejectedLabelCount: number,
): string[] {
  if (lowerRowCount > 0) {
    return ["raster-lower-row-quantity-label"]
  }

  if (lowerGlyphRowCount > 0) {
    return ["raster-lower-row-quantity-glyphs"]
  }

  if (quantityLabelCount > 0) {
    return ["raster-quantity-label-inside-candidate"]
  }

  if (rejectedLabelCount > 0) {
    return ["raster-quantity-label-rejected-as-text-fragment"]
  }

  return ["no-raster-quantity-label"]
}
