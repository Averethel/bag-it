import type { StepCalloutPageInput, StepCalloutRegion } from "./contracts"
import { findStepCalloutPixelComponents } from "./pixel-components"
import { isStepCalloutDarkPixel } from "./pixels"
import type { RasterStepAnchor, StepCalloutRasterStepLayoutDraft } from "./raster-step-layout-types"
import { stepCalloutRegionArea, stepCalloutRegionCenter } from "./regions"

const ANCHORED_COLUMN_CENTER_TOLERANCE = 64
const ANCHORED_COLUMN_SIZE_RATIO_MIN = 0.35
const ANCHORED_COLUMN_X_TOLERANCE = 64
const ANCHOR_DENSITY_MIN = 0.22
const ANCHOR_HEIGHT_RATIO_MIN = 0.035
const ANCHOR_LEFT_GAP_MIN = 96
const ANCHOR_LEFT_GAP_RATIO = 0.5
const ANCHOR_TOP_GAP_MIN = 48
const ANCHOR_TOP_GAP_RATIO = 0.4
const ANCHOR_TOP_OVERLAP_MIN = 0.2
const ANCHOR_TOP_TOLERANCE_MIN = 36
const ANCHOR_TOP_TOLERANCE_RATIO = 0.55
const MAX_ANCHOR_AREA_RATIO = 0.03
const MIN_ANCHOR_AREA = 120
const MIN_ANCHOR_HEIGHT = 18

export function readRasterAnchorsByPage(
  pages: readonly StepCalloutPageInput[],
): Map<number, RasterStepAnchor[]> {
  return new Map(pages.map((page) => [page.pageNumber, readRasterStepAnchors(page)]))
}

export function readAnchoredDrafts(
  drafts: readonly StepCalloutRasterStepLayoutDraft[],
  anchors: readonly RasterStepAnchor[],
): StepCalloutRasterStepLayoutDraft[] {
  return drafts.filter((draft) => hasRasterStepAnchor(draft, anchors))
}

export function hasRasterStepAnchor(
  draft: StepCalloutRasterStepLayoutDraft,
  anchors: readonly RasterStepAnchor[],
): boolean {
  return anchors.some((anchor) => isAnchorForRegion(anchor.region, draft.evidence.candidate.region))
}

export function isAlignedWithAnchoredColumn(
  draft: StepCalloutRasterStepLayoutDraft,
  anchoredDrafts: readonly StepCalloutRasterStepLayoutDraft[],
): boolean {
  return anchoredDrafts.some((anchoredDraft) =>
    draft.evidence.candidate.id !== anchoredDraft.evidence.candidate.id &&
    hasSimilarColumn(draft.evidence.candidate.region, anchoredDraft.evidence.candidate.region),
  )
}

function readRasterStepAnchors(page: StepCalloutPageInput): RasterStepAnchor[] {
  return findStepCalloutPixelComponents(page, (pixelIndex) => isStepCalloutDarkPixel(page, pixelIndex))
    .filter((component) => isStepNumberLikeComponent(page, component.region, component.pixelCount))
    .map((component) => ({
      pageNumber: page.pageNumber,
      region: component.region,
    }))
}

function isStepNumberLikeComponent(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
  pixelCount: number,
): boolean {
  return (
    hasStepNumberScale(page, region) &&
    hasStepNumberDensity(region, pixelCount) &&
    stepCalloutRegionArea(region) <= page.width * page.height * MAX_ANCHOR_AREA_RATIO
  )
}

function hasStepNumberScale(page: StepCalloutPageInput, region: StepCalloutRegion): boolean {
  return (
    region.height >= Math.max(MIN_ANCHOR_HEIGHT, page.height * ANCHOR_HEIGHT_RATIO_MIN) &&
    stepCalloutRegionArea(region) >= MIN_ANCHOR_AREA
  )
}

function hasStepNumberDensity(region: StepCalloutRegion, pixelCount: number): boolean {
  return pixelCount / stepCalloutRegionArea(region) >= ANCHOR_DENSITY_MIN
}

function hasSimilarColumn(left: StepCalloutRegion, right: StepCalloutRegion): boolean {
  return (
    hasSimilarColumnPosition(left, right) &&
    sizeRatio(left.width, right.width) >= ANCHORED_COLUMN_SIZE_RATIO_MIN
  )
}

function hasSimilarColumnPosition(left: StepCalloutRegion, right: StepCalloutRegion): boolean {
  return (
    Math.abs(left.x - right.x) <= ANCHORED_COLUMN_X_TOLERANCE ||
    Math.abs(stepCalloutRegionCenter(left).x - stepCalloutRegionCenter(right).x) <= ANCHORED_COLUMN_CENTER_TOLERANCE
  )
}

function sizeRatio(left: number, right: number): number {
  return Math.min(left, right) / Math.max(left, right)
}

function isAnchorForRegion(anchor: StepCalloutRegion, region: StepCalloutRegion): boolean {
  return isLeftStepAnchor(anchor, region) || isAboveStepAnchor(anchor, region)
}

function isLeftStepAnchor(anchor: StepCalloutRegion, region: StepCalloutRegion): boolean {
  return isNearCandidateTop(anchor, region) && isLeftOfCandidate(anchor, region)
}

function isAboveStepAnchor(anchor: StepCalloutRegion, region: StepCalloutRegion): boolean {
  return (
    isAboveCandidate(anchor, region) &&
    region.y - (anchor.y + anchor.height) <= topGapLimit(region) &&
    horizontalOverlapRatio(anchor, region) >= ANCHOR_TOP_OVERLAP_MIN
  )
}

function isNearCandidateTop(anchor: StepCalloutRegion, region: StepCalloutRegion): boolean {
  return Math.abs(anchor.y - region.y) <= topTolerance(region)
}

function topTolerance(region: StepCalloutRegion): number {
  return Math.max(ANCHOR_TOP_TOLERANCE_MIN, region.height * ANCHOR_TOP_TOLERANCE_RATIO)
}

function isLeftOfCandidate(anchor: StepCalloutRegion, region: StepCalloutRegion): boolean {
  const anchorRight = anchor.x + anchor.width

  return anchorRight <= region.x + region.width * 0.2 && region.x - anchorRight <= leftGapLimit(region)
}

function isAboveCandidate(anchor: StepCalloutRegion, region: StepCalloutRegion): boolean {
  return anchor.y + anchor.height <= region.y + region.height * 0.15
}

function leftGapLimit(region: StepCalloutRegion): number {
  return Math.max(ANCHOR_LEFT_GAP_MIN, region.width * ANCHOR_LEFT_GAP_RATIO)
}

function topGapLimit(region: StepCalloutRegion): number {
  return Math.max(ANCHOR_TOP_GAP_MIN, region.height * ANCHOR_TOP_GAP_RATIO)
}

function horizontalOverlapRatio(left: StepCalloutRegion, right: StepCalloutRegion): number {
  const overlap = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x)

  return Math.max(0, overlap) / Math.min(left.width, right.width)
}
