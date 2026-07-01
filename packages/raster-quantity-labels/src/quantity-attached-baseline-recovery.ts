import type { CalloutPartPageInput, Region, RgbColor } from "./contracts"
import {
  createGlyphFromPixels,
  createGlyphMask,
  findGlyphComponents,
  type GlyphComponent,
} from "./glyph-mask"
import type { QuantityCandidate } from "./quantity-candidate-types"
import {
  CALLOUT_BORDER_INSET,
  hasReadableLabelInk,
  isCandidateShape,
} from "./quantity-label-shape"
import { readQuantityOcr } from "./quantity-ocr"
import { clusterQuantityRows } from "./quantity-row-clustering"
import type { QuantityRecoveryPlan } from "./quantity-recovery-types"
import {
  isCandidateInRecoveryBand,
  readQuantityReferenceHeight,
  readRecoveryCandidateHeights,
} from "./quantity-recovery-utils"
import { RECOVERY_ASSEMBLY_OPTIONS } from "./quantity-retry-recovery"
import { insetRegion, regionCenter, unionRegions } from "./regions"

export function createAttachedBaselineRecoveryPlan(
  candidates: readonly QuantityCandidate[],
  calloutRegion: Region,
): QuantityRecoveryPlan | null {
  if (candidates.length < 3) {
    return null
  }

  const printedRows = clusterQuantityRows(candidates.filter((candidate) => candidate.glyphs.length >= 2))
  const supportedRows = printedRows.filter((row) => row.length >= 2)

  if (supportedRows.length === 0) {
    return null
  }

  const referenceHeight = readQuantityReferenceHeight(candidates)
  const verticalPadding = Math.max(7, Math.round(referenceHeight * 0.85))
  const top = Math.max(calloutRegion.y, Math.min(...supportedRows.flatMap((row) => row.map((candidate) => candidate.region.y))) - verticalPadding)
  const bottom = Math.min(
    calloutRegion.y + calloutRegion.height,
    Math.max(...supportedRows.flatMap((row) => row.map((candidate) => candidate.region.y + candidate.region.height))) +
      verticalPadding,
  )

  return {
    kind: "attached-baseline",
    source: "attached-baseline",
    targetBand: {
      height: Math.max(1, bottom - top),
      width: calloutRegion.width,
      x: calloutRegion.x,
      y: top,
    },
  }
}

export function recoverAttachedBaselineCandidates(
  page: CalloutPartPageInput,
  calloutRegion: Region,
  background: RgbColor,
  initialCandidates: readonly QuantityCandidate[],
  plan: QuantityRecoveryPlan,
): QuantityCandidate[] {
  const referenceHeight = readQuantityReferenceHeight(initialCandidates)
  const searchRegion = insetRegion(calloutRegion, CALLOUT_BORDER_INSET)
  const mask = createGlyphMask(page, searchRegion, background)
  const components = findGlyphComponents(page, mask, searchRegion)
    .filter((component) => isAttachedBaselineRecoveryComponent(component, referenceHeight))

  return components
    .map((component) => createAttachedBaselineCandidate(page, calloutRegion, initialCandidates, component, referenceHeight))
    .filter((candidate): candidate is QuantityCandidate => candidate !== null)
    .filter((candidate) => isCandidateInRecoveryBand(candidate, plan.targetBand))
}

function isAttachedBaselineRecoveryComponent(
  component: GlyphComponent,
  referenceHeight: number,
): boolean {
  return component.region.height >= referenceHeight * 1.6 &&
    component.region.height <= referenceHeight * 5 &&
    component.region.width <= Math.max(40, referenceHeight * 4.8)
}

function createAttachedBaselineCandidate(
  page: CalloutPartPageInput,
  calloutRegion: Region,
  initialCandidates: readonly QuantityCandidate[],
  component: GlyphComponent,
  referenceHeight: number,
): QuantityCandidate | null {
  for (const baselineHeight of readRecoveryCandidateHeights(referenceHeight, component.region.height)) {
    const baselineGlyphs = createAttachedBaselineGlyphs(page, component, baselineHeight)

    if (baselineGlyphs.length === 0 || !hasReadableLabelInk(baselineGlyphs)) {
      continue
    }

    const read = readQuantityOcr(page, baselineGlyphs)
    const region = unionRegions(baselineGlyphs.map((glyph) => glyph.region))

    if (
      !read ||
      read.confidence < 0.78 ||
      !isCandidateShape(calloutRegion, region, read.text.length - 1, RECOVERY_ASSEMBLY_OPTIONS) ||
      !hasSameRowPrintedSupport(initialCandidates, region) ||
      hasPrintedLabelDirectlyBelow(initialCandidates, region)
    ) {
      continue
    }

    return {
      confidence: Math.min(0.82, read.confidence),
      glyphs: baselineGlyphs,
      recoveryKind: "attached-baseline",
      region,
      text: read.text,
      value: read.value,
    }
  }

  return null
}

function createAttachedBaselineGlyphs(
  page: CalloutPartPageInput,
  component: GlyphComponent,
  baselineHeight: number,
): GlyphComponent[] {
  const baselineTop = component.region.y + component.region.height - baselineHeight
  const baselinePixels = component.pixels.filter((pixel) => pixel.y >= baselineTop)
  const localMask = new Uint8Array(page.width * page.height)

  for (const pixel of baselinePixels) {
    localMask[pixel.y * page.width + pixel.x] = 1
  }

  const baselineRegion = {
    height: baselineHeight,
    width: component.region.width,
    x: component.region.x,
    y: baselineTop,
  }
  const splitGlyphs = findGlyphComponents(page, localMask, baselineRegion)
    .sort((left, right) => left.region.x - right.region.x)
  const fallbackGlyph = createGlyphFromPixels(baselinePixels)

  if (splitGlyphs.length > 1) {
    return splitGlyphs
  }

  return fallbackGlyph ? [fallbackGlyph] : []
}

function hasSameRowPrintedSupport(
  candidates: readonly QuantityCandidate[],
  region: Region,
): boolean {
  const centerY = regionCenter(region).y
  const rowPeers = candidates.filter((candidate) =>
    candidate.glyphs.length >= 2 &&
    Math.abs(regionCenter(candidate.region).y - centerY) <= Math.max(6, region.height * 0.85),
  )

  return rowPeers.length >= 2
}

function hasPrintedLabelDirectlyBelow(
  candidates: readonly QuantityCandidate[],
  region: Region,
): boolean {
  const center = regionCenter(region)
  const bottom = region.y + region.height

  return candidates.some((candidate) => {
    if (candidate.glyphs.length < 2 || candidate.region.y < bottom - 1) {
      return false
    }

    const candidateCenter = regionCenter(candidate.region)
    const verticalGap = candidate.region.y - bottom
    const horizontalGap = Math.abs(candidateCenter.x - center.x)

    return verticalGap <= Math.max(7, region.height * 0.7) &&
      horizontalGap <= Math.max(7, region.width * 0.65)
  })
}
