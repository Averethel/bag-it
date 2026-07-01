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
import type { QuantityRecoveryPlan } from "./quantity-recovery-types"
import {
  isCandidateInRecoveryBand,
  readQuantityReferenceHeight,
  readRecoveryCandidateHeights,
} from "./quantity-recovery-utils"
import { RECOVERY_ASSEMBLY_OPTIONS } from "./quantity-retry-recovery"
import { insetRegion, regionCenter } from "./regions"

export function createConnectedTopCapRecoveryPlan(
  candidates: readonly QuantityCandidate[],
  calloutRegion: Region,
): QuantityRecoveryPlan | null {
  if (candidates.length < 2) {
    return null
  }

  const top = Math.round(calloutRegion.y + calloutRegion.height * 0.66)
  const bottom = calloutRegion.y + calloutRegion.height

  return {
    kind: "connected-top-cap",
    source: "connected-top-cap",
    targetBand: {
      height: Math.max(1, bottom - top),
      width: calloutRegion.width,
      x: calloutRegion.x,
      y: top,
    },
  }
}

export function recoverConnectedTopCapCandidates(
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
    .filter((component) => isConnectedTopCapRecoveryComponent(component, calloutRegion, referenceHeight))

  return components
    .map((component) => createConnectedTopCapCandidate(page, calloutRegion, component, referenceHeight))
    .filter((candidate): candidate is QuantityCandidate => candidate !== null)
    .filter((candidate) => isCandidateInRecoveryBand(candidate, plan.targetBand))
}

function isConnectedTopCapRecoveryComponent(
  component: GlyphComponent,
  calloutRegion: Region,
  referenceHeight: number,
): boolean {
  const componentCenter = regionCenter(component.region)
  const calloutBottom = calloutRegion.y + calloutRegion.height

  return componentCenter.y >= calloutRegion.y + calloutRegion.height * 0.66 &&
    component.region.y + component.region.height >= calloutBottom - Math.max(5, referenceHeight * 0.7) &&
    component.region.height >= referenceHeight * 1.6 &&
    component.region.width <= Math.max(34, calloutRegion.width * 0.45) &&
    component.region.width <= referenceHeight * 3.4
}

function createConnectedTopCapCandidate(
  page: CalloutPartPageInput,
  calloutRegion: Region,
  component: GlyphComponent,
  referenceHeight: number,
): QuantityCandidate | null {
  const attempts: unknown[] = []
  const candidates: QuantityCandidate[] = []

  for (const capHeight of readRecoveryCandidateHeights(referenceHeight, component.region.height)) {
    const capGlyph = createConnectedTopCapGlyph(component, capHeight)

    if (!capGlyph || !hasReadableLabelInk([capGlyph])) {
      continue
    }

    const read = readQuantityOcr(page, [capGlyph])
    attempts.push({
      capHeight,
      read,
      region: capGlyph.region,
    })

    if (
      !read ||
      read.confidence < 0.8 ||
      !isCandidateShape(calloutRegion, capGlyph.region, read.text.length - 1, RECOVERY_ASSEMBLY_OPTIONS)
    ) {
      continue
    }

    candidates.push({
      confidence: Math.min(0.82, read.confidence),
      glyphs: [capGlyph],
      recoveryKind: "connected-top-cap",
      region: capGlyph.region,
      text: read.text,
      value: read.value,
    })
  }

  const selected = candidates
    .sort((left, right) => right.confidence - left.confidence)[0] ?? null

  pushRecoveryDebugEntry({
    attempts,
    calloutRegion,
    componentRegion: component.region,
    kind: "connected-top-cap",
    selected: selected ? {
      confidence: selected.confidence,
      text: selected.text,
      value: selected.value,
    } : null,
  })

  return selected
}

interface CalloutPartsDebugState {
  enabled?: boolean
  quantityRecoveryEntries?: unknown[]
}

function pushRecoveryDebugEntry(entry: unknown): void {
  const state = (globalThis as { __bagItCalloutPartsDebug?: CalloutPartsDebugState }).__bagItCalloutPartsDebug

  if (!state?.enabled) {
    return
  }

  if (!state.quantityRecoveryEntries) {
    state.quantityRecoveryEntries = []
  }

  state.quantityRecoveryEntries.push(entry)
}

function createConnectedTopCapGlyph(component: GlyphComponent, capHeight: number): GlyphComponent | null {
  return createGlyphFromPixels(
    component.pixels.filter((pixel) => pixel.y < component.region.y + capHeight),
  )
}
