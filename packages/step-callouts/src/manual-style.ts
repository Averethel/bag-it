import {
  findRasterQuantityLabels,
  type RasterQuantityLabel,
} from "@bag-it/raster-quantity-labels"
import { readStepCalloutCandidateBackground } from "./candidate-background"
import type {
  StepCalloutCandidate,
  StepCalloutPageInput,
} from "./contracts"
import {
  estimateStepCalloutPageBackground,
  stepCalloutColorDistance,
  stepCalloutColorLuma,
  type StepCalloutRgbColor,
} from "./pixels"
import {
  stepCalloutRegionArea,
  stepCalloutRegionCenter,
} from "./regions"

const MAX_SEED_AREA_RATIO = 0.18
const MIN_CLUSTER_SIZE = 3
const MIN_SEED_AREA_RATIO = 0.012
const MIN_SEED_LUMA = 150
const MIN_STYLE_SEED_PAGE_BACKGROUND_DISTANCE = 18
const STYLE_EXACT_DISTANCE = 24
const STYLE_CLUSTER_DISTANCE = 42
const STYLE_REJECT_DISTANCE = 42
const STYLE_SEED_LOWER_ROW_START_RATIO = 0.5
const STYLE_SEED_QUANTITY_LABEL_MAX_GLYPH_GAP_HEIGHT_RATIO = 0.35

export interface StepCalloutManualStyle {
  background: StepCalloutRgbColor
  sampleCount: number
}

interface StyleSeed {
  color: StepCalloutRgbColor
  quantityBacked: boolean
}

interface StyleCluster {
  color: StepCalloutRgbColor
  sampleCount: number
}

export function inferStepCalloutManualCalloutStyle(
  pages: readonly StepCalloutPageInput[],
  candidates: readonly StepCalloutCandidate[],
): StepCalloutManualStyle | null {
  const pageByNumber = new Map(pages.map((page) => [page.pageNumber, page]))
  const seeds = candidates.flatMap((candidate) => createStyleSeed(pageByNumber, candidate))
  const quantityBackedSeeds = seeds.filter((seed) => seed.quantityBacked)
  const styleSeeds = quantityBackedSeeds.length > 0 ? quantityBackedSeeds : seeds
  const cluster = strongestStyleCluster(styleSeeds)

  if (!cluster || cluster.sampleCount < MIN_CLUSTER_SIZE) {
    return null
  }

  return {
    background: cluster.color,
    sampleCount: cluster.sampleCount,
  }
}

export function scoreStepCalloutManualStyleCompatibility(
  color: StepCalloutRgbColor,
  style: StepCalloutManualStyle,
): number {
  const distance = stepCalloutColorDistance(color, style.background)

  if (distance <= STYLE_EXACT_DISTANCE) {
    return 1
  }

  if (distance >= STYLE_REJECT_DISTANCE) {
    return 0
  }

  return (STYLE_REJECT_DISTANCE - distance) / (STYLE_REJECT_DISTANCE - STYLE_EXACT_DISTANCE)
}

function createStyleSeed(
  pageByNumber: ReadonlyMap<number, StepCalloutPageInput>,
  candidate: StepCalloutCandidate,
): StyleSeed[] {
  const page = pageByNumber.get(candidate.pageNumber)

  if (!page || !hasPlausibleStyleSeedShape(page, candidate)) {
    return []
  }

  const color = readStepCalloutCandidateBackground(page, candidate.region)

  const quantityBacked = hasStyleSeedRasterQuantityLabel(page, candidate, color)

  if (
    stepCalloutColorLuma(color) < MIN_SEED_LUMA ||
    !quantityBacked && !differsFromPageBackground(page, color)
  ) {
    return []
  }

  return [{ color, quantityBacked }]
}

function hasPlausibleStyleSeedShape(
  page: StepCalloutPageInput,
  candidate: StepCalloutCandidate,
): boolean {
  const areaRatio = stepCalloutRegionArea(candidate.region) / pageArea(page)

  return (
    candidate.source === "fill-panel" &&
    areaRatio >= MIN_SEED_AREA_RATIO &&
    areaRatio <= MAX_SEED_AREA_RATIO
  )
}

function hasStyleSeedRasterQuantityLabel(
  page: StepCalloutPageInput,
  candidate: StepCalloutCandidate,
  background: StepCalloutRgbColor,
): boolean {
  return findRasterQuantityLabels(page, candidate.region, background)
    .filter(isCompactRasterQuantityLabel)
    .some((label) => isInLowerCandidateRow(candidate, label))
}

function isCompactRasterQuantityLabel(label: RasterQuantityLabel): boolean {
  const glyphs = [...(label.glyphs ?? [])].sort((left, right) => left.region.x - right.region.x)

  if (glyphs.length < 2) {
    return true
  }

  const maxGap = glyphs.slice(1).reduce((largestGap, glyph, index) => {
    const previous = glyphs[index]
    const gap = glyph.region.x - (previous.region.x + previous.region.width)

    return Math.max(largestGap, gap)
  }, 0)

  return maxGap / label.region.height <= STYLE_SEED_QUANTITY_LABEL_MAX_GLYPH_GAP_HEIGHT_RATIO
}

function isInLowerCandidateRow(
  candidate: StepCalloutCandidate,
  label: RasterQuantityLabel,
): boolean {
  const center = stepCalloutRegionCenter(label.region)
  const lowerRowStart = candidate.region.y + candidate.region.height * STYLE_SEED_LOWER_ROW_START_RATIO

  return center.y >= lowerRowStart
}

function differsFromPageBackground(
  page: StepCalloutPageInput,
  color: StepCalloutRgbColor,
): boolean {
  return (
    stepCalloutColorDistance(color, estimateStepCalloutPageBackground(page)) >=
    MIN_STYLE_SEED_PAGE_BACKGROUND_DISTANCE
  )
}

function pageArea(page: StepCalloutPageInput): number {
  return page.width * page.height
}

function strongestStyleCluster(seeds: readonly StyleSeed[]): StyleCluster | null {
  const clusters = seeds.reduce<StyleCluster[]>(addSeedToClusters, [])

  return clusters.sort(compareStyleClusters)[0] ?? null
}

function addSeedToClusters(clusters: StyleCluster[], seed: StyleSeed): StyleCluster[] {
  const cluster = clusters.find((item) =>
    stepCalloutColorDistance(item.color, seed.color) <= STYLE_CLUSTER_DISTANCE,
  )

  if (!cluster) {
    clusters.push({
      color: seed.color,
      sampleCount: 1,
    })
    return clusters
  }

  cluster.color = mergeClusterColor(cluster, seed.color)
  cluster.sampleCount += 1
  return clusters
}

function mergeClusterColor(
  cluster: StyleCluster,
  color: StepCalloutRgbColor,
): StepCalloutRgbColor {
  return {
    b: mergeChannel(cluster.color.b, color.b, cluster.sampleCount),
    g: mergeChannel(cluster.color.g, color.g, cluster.sampleCount),
    r: mergeChannel(cluster.color.r, color.r, cluster.sampleCount),
  }
}

function mergeChannel(current: number, next: number, sampleCount: number): number {
  return Math.round((current * sampleCount + next) / (sampleCount + 1))
}

function compareStyleClusters(left: StyleCluster, right: StyleCluster): number {
  return right.sampleCount - left.sampleCount
}
