import type {
  StepCalloutCandidateEvidence,
  StepCalloutPageInput,
  StepCalloutResolutionStatus,
} from "./contracts"
import { readStepCalloutCandidateBackground } from "./candidate-background"
import {
  isStepCalloutDarkPixel,
  stepCalloutColorDistance,
  stepCalloutColorLuma,
  type StepCalloutRgbColor,
} from "./pixels"
import { readStepCalloutEvidenceSignalValue as readSignalValue } from "./resolution-draft"

const ANCHOR_BACKGROUND_MIN = 0.6
const ANCHOR_BORDER_MIN = 0.9
const COLOR_CLUSTER_DISTANCE_MAX = 24
const DIAGNOSTIC_QUANTITY_MAX = 0.1
const STYLE_CONFLICT_DISTANCE_MIN = 36
const STYLE_CLUSTER_MIN = 2
const WHITE_STYLE_LUMA_MIN = 245
const OFF_STYLE_DARK_DENSITY_MAX = 0.04

export interface StepCalloutPageStyleDraft {
  evidence: StepCalloutCandidateEvidence
  status: StepCalloutResolutionStatus
}

interface PageStyleSample {
  color: StepCalloutRgbColor
  pageNumber: number
}

interface PageStyleCluster {
  color: StepCalloutRgbColor
  count: number
  pageNumber: number
}

export function refineStepCalloutPageStyleDiagnosticLayout(
  drafts: readonly StepCalloutPageStyleDraft[],
  pages: readonly StepCalloutPageInput[],
): Map<string, StepCalloutResolutionStatus> {
  const pageByNumber = createPageLookup(pages)
  const styleByPage = readPageStyles(drafts, pageByNumber)

  return new Map(readOffStyleDiagnosticEntries(drafts, pageByNumber, styleByPage))
}

function readOffStyleDiagnosticEntries(
  drafts: readonly StepCalloutPageStyleDraft[],
  pageByNumber: ReadonlyMap<number, StepCalloutPageInput>,
  styleByPage: ReadonlyMap<number, StepCalloutRgbColor>,
): Array<[string, StepCalloutResolutionStatus]> {
  return drafts
    .filter((draft) => shouldRejectOffStyleDiagnostic(draft, pageByNumber, styleByPage))
    .map((draft) => [draft.evidence.candidate.id, "rejected"])
}

function shouldRejectOffStyleDiagnostic(
  draft: StepCalloutPageStyleDraft,
  pageByNumber: ReadonlyMap<number, StepCalloutPageInput>,
  styleByPage: ReadonlyMap<number, StepCalloutRgbColor>,
): boolean {
  const pageNumber = draft.evidence.candidate.pageNumber
  const page = pageByNumber.get(pageNumber)
  const pageStyle = styleByPage.get(pageNumber)

  return Boolean(
    page &&
      pageStyle &&
      isNoQuantityDiagnostic(draft) &&
      hasConflictingBackground(draft, page, pageStyle) &&
      hasLowDarkInkDensity(draft, page),
  )
}

function isNoQuantityDiagnostic(draft: StepCalloutPageStyleDraft): boolean {
  return (
    draft.status === "diagnostic" &&
    readSignalValue(draft.evidence.scores, "quantity") <= DIAGNOSTIC_QUANTITY_MAX
  )
}

function hasConflictingBackground(
  draft: StepCalloutPageStyleDraft,
  page: StepCalloutPageInput,
  pageStyle: StepCalloutRgbColor,
): boolean {
  const candidateColor = readStepCalloutCandidateBackground(page, draft.evidence.candidate.region)

  return stepCalloutColorDistance(candidateColor, pageStyle) >= STYLE_CONFLICT_DISTANCE_MIN
}

function hasLowDarkInkDensity(
  draft: StepCalloutPageStyleDraft,
  page: StepCalloutPageInput,
): boolean {
  const region = draft.evidence.candidate.region
  let darkPixels = 0

  for (let y = region.y; y < region.y + region.height; y += 1) {
    darkPixels += countDarkPixelsInRow(page, region.x, region.width, y)
  }

  return darkPixels / (region.width * region.height) <= OFF_STYLE_DARK_DENSITY_MAX
}

function countDarkPixelsInRow(
  page: StepCalloutPageInput,
  startX: number,
  width: number,
  y: number,
): number {
  let darkPixels = 0

  for (let x = startX; x < startX + width; x += 1) {
    darkPixels += isStepCalloutDarkPixel(page, y * page.width + x) ? 1 : 0
  }

  return darkPixels
}

function readPageStyles(
  drafts: readonly StepCalloutPageStyleDraft[],
  pageByNumber: ReadonlyMap<number, StepCalloutPageInput>,
): Map<number, StepCalloutRgbColor> {
  const samples = drafts.flatMap((draft) => readAnchorSample(draft, pageByNumber))
  const clusters = samples.reduce<PageStyleCluster[]>(addSampleToClusters, [])

  return new Map(readUnambiguousStyleEntries(clusters))
}

function readAnchorSample(
  draft: StepCalloutPageStyleDraft,
  pageByNumber: ReadonlyMap<number, StepCalloutPageInput>,
): PageStyleSample[] {
  const page = pageByNumber.get(draft.evidence.candidate.pageNumber)

  if (!page || !isStyleAnchor(draft)) {
    return []
  }

  const color = readStepCalloutCandidateBackground(page, draft.evidence.candidate.region)

  return isWhiteStyleColor(color) ? [] : [{ color, pageNumber: page.pageNumber }]
}

function isStyleAnchor(draft: StepCalloutPageStyleDraft): boolean {
  return (
    draft.status !== "rejected" &&
    readSignalValue(draft.evidence.scores, "background") >= ANCHOR_BACKGROUND_MIN &&
    readSignalValue(draft.evidence.scores, "border") >= ANCHOR_BORDER_MIN
  )
}

function isWhiteStyleColor(color: StepCalloutRgbColor): boolean {
  return stepCalloutColorLuma(color) >= WHITE_STYLE_LUMA_MIN
}

function addSampleToClusters(
  clusters: PageStyleCluster[],
  sample: PageStyleSample,
): PageStyleCluster[] {
  const cluster = clusters.find((candidateCluster) => isMatchingCluster(candidateCluster, sample))

  if (!cluster) {
    clusters.push(createPageStyleCluster(sample))
    return clusters
  }

  cluster.color = averageClusterColor(cluster, sample.color)
  cluster.count += 1
  return clusters
}

function isMatchingCluster(cluster: PageStyleCluster, sample: PageStyleSample): boolean {
  return (
    cluster.pageNumber === sample.pageNumber &&
    stepCalloutColorDistance(cluster.color, sample.color) <= COLOR_CLUSTER_DISTANCE_MAX
  )
}

function createPageStyleCluster(sample: PageStyleSample): PageStyleCluster {
  return {
    color: sample.color,
    count: 1,
    pageNumber: sample.pageNumber,
  }
}

function averageClusterColor(
  cluster: PageStyleCluster,
  color: StepCalloutRgbColor,
): StepCalloutRgbColor {
  return {
    b: Math.round((cluster.color.b * cluster.count + color.b) / (cluster.count + 1)),
    g: Math.round((cluster.color.g * cluster.count + color.g) / (cluster.count + 1)),
    r: Math.round((cluster.color.r * cluster.count + color.r) / (cluster.count + 1)),
  }
}

function readUnambiguousStyleEntries(
  clusters: readonly PageStyleCluster[],
): Array<[number, StepCalloutRgbColor]> {
  return readClusterPages(clusters).flatMap((pageNumber) =>
    readUnambiguousPageStyleEntry(pageNumber, clusters),
  )
}

function readUnambiguousPageStyleEntry(
  pageNumber: number,
  clusters: readonly PageStyleCluster[],
): Array<[number, StepCalloutRgbColor]> {
  const pageClusters = clusters.filter((cluster) =>
    cluster.pageNumber === pageNumber && cluster.count >= STYLE_CLUSTER_MIN,
  )

  return pageClusters.length === 1 ? [[pageNumber, pageClusters[0].color]] : []
}

function readClusterPages(clusters: readonly PageStyleCluster[]): number[] {
  return [...new Set(clusters.map((cluster) => cluster.pageNumber))]
}

function createPageLookup(
  pages: readonly StepCalloutPageInput[],
): Map<number, StepCalloutPageInput> {
  return new Map(pages.map((page) => [page.pageNumber, page]))
}
