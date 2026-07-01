import type { BackgroundModel } from "./background-model"
import type { CalloutPartPageInput, Region } from "./contracts"
import {
  SUPPORT_TOP_FACE,
  writeSupportPixel,
} from "./part-support-common"
import { fillLongShallowFaceSupportRun } from "./part-support-long-shallow"
import { isOwnedEnvelopeVisiblePartPixel } from "./part-support-top-pixels"
import {
  hasNearbySupportPixel,
  LONG_SHALLOW_END_CAP_CONNECT_RADIUS,
  visitLocalRect,
} from "./part-support-top-geometry"
import type { LowContrastFaceSupportMode } from "./part-support-types"
import { readAlpha } from "./pixels"

const OWNED_ENVELOPE_TOP_GAP_MIN = 16
const OWNED_ENVELOPE_CONNECTED_TOP_PASSES = 3
const OWNED_ENVELOPE_LOW_CONTRAST_TOP_INSET = 4
const OWNED_ENVELOPE_LOW_CONTRAST_LEFT_INSET = 0

export function fillOwnedEnvelopeWeakTopSupport(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  bounds: Region,
  ownedRegion: Region | undefined,
  enableLowContrastFaceSupport = false,
  lowContrastFaceSupportMode?: LowContrastFaceSupportMode,
): void {
  const envelope = readLocalOwnedEnvelope(region, ownedRegion)

  if (!envelope) {
    return
  }

  if (enableLowContrastFaceSupport) {
    fillOwnedEnvelopeLowContrastFaceSupport(
      mask,
      page,
      region,
      background,
      envelope,
      bounds,
      lowContrastFaceSupportMode ?? "top-and-left",
    )
  }

  if (!isOwnedEnvelopeTopSupportCandidate(envelope, bounds)) {
    return
  }

  const top = Math.max(0, envelope.y)
  const bottom = bounds.y - 1
  const left = Math.max(0, envelope.x)
  const right = Math.min(region.width - 1, envelope.x + envelope.width - 1)

  for (let y = top; y <= bottom; y += 1) {
    fillLongShallowFaceSupportRun(mask, page, region, background, y, left, right, SUPPORT_TOP_FACE)
  }

  growOwnedEnvelopeConnectedTopSupport(mask, page, region, background, envelope, bounds)
}

function fillOwnedEnvelopeLowContrastFaceSupport(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  envelope: Region,
  bounds: Region,
  mode: LowContrastFaceSupportMode,
): void {
  if (!isLowContrastFaceSupportCandidate(envelope, bounds, mode)) {
    return
  }

  if (mode === "sparse-top-and-left") {
    fillSparseLowContrastTopFace(mask, page, region, background, envelope, bounds)
    fillSparseLowContrastLeftFace(mask, page, region, background, envelope, bounds)
    return
  }

  if (mode === "top" || mode === "top-and-left") {
    fillLowContrastTopFace(mask, page, region, envelope, bounds)
  }

  if (mode === "left" || mode === "top-and-left") {
    fillLowContrastLeftFace(mask, page, region, envelope, bounds)
  }
}

function isLowContrastFaceSupportCandidate(
  envelope: Region,
  bounds: Region,
  mode: LowContrastFaceSupportMode,
): boolean {
  if (mode === "sparse-top-and-left") {
    return isSparseLowContrastFaceSupportCandidate(envelope, bounds)
  }

  const overlap = readHorizontalOverlap(envelope, bounds)

  return bounds.height >= 14 &&
    bounds.width >= Math.max(28, Math.round(bounds.height * 1.25)) &&
    overlap >= Math.min(bounds.width, Math.max(16, Math.round(bounds.width * 0.72))) &&
    envelope.width <= Math.max(bounds.width * 1.8, bounds.width + 22)
}

function isSparseLowContrastFaceSupportCandidate(envelope: Region, bounds: Region): boolean {
  const overlap = readHorizontalOverlap(envelope, bounds)

  return bounds.height >= 12 &&
    bounds.height <= 72 &&
    bounds.width >= Math.max(6, Math.round(bounds.height * 0.35)) &&
    bounds.width <= Math.max(60, Math.round(bounds.height * 3.4)) &&
    overlap >= Math.max(4, Math.min(bounds.width, Math.round(bounds.width * 0.65))) &&
    envelope.width >= Math.max(55, bounds.width + 34) &&
    envelope.height >= Math.max(35, bounds.height + 18)
}

function fillLowContrastTopFace(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  envelope: Region,
  bounds: Region,
): void {
  const topGap = bounds.y - envelope.y

  if (
    topGap < Math.max(10, Math.round(bounds.height * 0.36)) ||
    topGap > Math.max(26, Math.round(bounds.height * 1.1))
  ) {
    return
  }

  const top = Math.min(bounds.y - 1, envelope.y + OWNED_ENVELOPE_LOW_CONTRAST_TOP_INSET)
  const bottom = bounds.y - 1
  const left = Math.max(envelope.x, bounds.x)
  const right = Math.min(envelope.x + envelope.width - 1, bounds.x + bounds.width - 1 + Math.max(2, Math.round(bounds.height * 0.18)))

  fillAlphaSupportRect(mask, page, region, { bottom, left, right, top })
}

function fillSparseLowContrastTopFace(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  envelope: Region,
  bounds: Region,
): void {
  const topGap = bounds.y - envelope.y

  if (
    topGap < Math.max(10, Math.round(bounds.height * 0.55)) ||
    topGap > Math.max(64, Math.round(bounds.height * 3.6))
  ) {
    return
  }

  fillVisiblePartSupportRect(mask, page, region, background, {
    bottom: bounds.y - 1,
    left: envelope.x,
    right: envelope.x + envelope.width - 1,
    top: envelope.y,
  })
}

function fillSparseLowContrastLeftFace(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  envelope: Region,
  bounds: Region,
): void {
  const leftGap = bounds.x - envelope.x

  if (leftGap < 2 || leftGap > Math.max(42, Math.round(bounds.height * 2.6))) {
    return
  }

  fillVisiblePartSupportRect(mask, page, region, background, {
    bottom: Math.min(envelope.y + envelope.height - 1, bounds.y + bounds.height - 1),
    left: envelope.x,
    right: bounds.x - 1,
    top: envelope.y,
  })
}

function fillLowContrastLeftFace(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  envelope: Region,
  bounds: Region,
): void {
  const topGap = bounds.y - envelope.y
  const leftGap = bounds.x - envelope.x

  if (
    topGap > Math.max(26, Math.round(bounds.height * 1.1)) ||
    leftGap < 2 ||
    leftGap > Math.max(14, Math.round(bounds.height * 0.56))
  ) {
    return
  }

  const left = Math.min(bounds.x - 1, envelope.x + OWNED_ENVELOPE_LOW_CONTRAST_LEFT_INSET)
  const right = bounds.x - 1
  const top = Math.max(envelope.y, bounds.y - Math.max(1, Math.round(bounds.height * 0.08)))
  const bottom = Math.min(envelope.y + envelope.height - 1, bounds.y + bounds.height - 1)

  fillAlphaSupportRect(mask, page, region, { bottom, left, right, top })
}

function fillVisiblePartSupportRect(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  rect: { bottom: number; left: number; right: number; top: number },
): void {
  if (rect.left > rect.right || rect.top > rect.bottom) {
    return
  }

  visitLocalRect(rect, (x, y) => {
    if (isOwnedEnvelopeVisiblePartPixel(page, region, background, x, y)) {
      writeSupportPixel(mask, region.width, x, y, SUPPORT_TOP_FACE)
    }
  })
}

function fillAlphaSupportRect(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  rect: { bottom: number; left: number; right: number; top: number },
): void {
  if (rect.left > rect.right || rect.top > rect.bottom) {
    return
  }

  visitLocalRect(rect, (x, y) => {
    if (readAlpha(page, region.x + x, region.y + y) >= 32) {
      writeSupportPixel(mask, region.width, x, y, SUPPORT_TOP_FACE)
    }
  })
}

function readLocalOwnedEnvelope(region: Region, ownedRegion: Region | undefined): Region | undefined {
  if (!ownedRegion) {
    return undefined
  }

  const left = Math.max(0, ownedRegion.x - region.x)
  const top = Math.max(0, ownedRegion.y - region.y)
  const right = Math.min(region.width, ownedRegion.x + ownedRegion.width - region.x)
  const bottom = Math.min(region.height, ownedRegion.y + ownedRegion.height - region.y)

  return right <= left || bottom <= top
    ? undefined
    : { height: bottom - top, width: right - left, x: left, y: top }
}

function isOwnedEnvelopeTopSupportCandidate(envelope: Region, bounds: Region): boolean {
  const topGap = bounds.y - envelope.y
  const envelopeBottom = envelope.y + envelope.height
  const boundsBottom = bounds.y + bounds.height
  const overlap = readHorizontalOverlap(envelope, bounds)

  return topGap >= Math.max(OWNED_ENVELOPE_TOP_GAP_MIN, Math.round(bounds.height * 0.9)) &&
    bounds.height >= 24 &&
    bounds.width >= bounds.height * 1.25 &&
    envelopeBottom >= bounds.y + Math.max(2, Math.round(bounds.height * 0.35)) &&
    boundsBottom >= envelope.y + Math.max(6, Math.round(envelope.height * 0.45)) &&
    overlap >= Math.min(bounds.width, Math.max(8, Math.round(bounds.width * 0.45))) &&
    envelope.width >= Math.max(10, Math.round(bounds.width * 0.65))
}

function growOwnedEnvelopeConnectedTopSupport(
  mask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  envelope: Region,
  bounds: Region,
): void {
  const search = {
    bottom: Math.min(region.height - 1, bounds.y + Math.max(2, Math.round(bounds.height * 0.2))),
    left: Math.max(0, envelope.x),
    right: Math.min(region.width - 1, envelope.x + envelope.width - 1),
    top: Math.max(0, envelope.y),
  }

  for (let pass = 0; pass < OWNED_ENVELOPE_CONNECTED_TOP_PASSES; pass += 1) {
    const source = mask.slice()
    let added = 0

    visitLocalRect(search, (x, y) => {
      if (!shouldAddOwnedEnvelopeConnectedTopPixel(source, page, region, background, x, y)) {
        return
      }

      writeSupportPixel(mask, region.width, x, y, SUPPORT_TOP_FACE)
      added += 1
    })

    if (added === 0) {
      return
    }
  }
}

function shouldAddOwnedEnvelopeConnectedTopPixel(
  sourceMask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  x: number,
  y: number,
): boolean {
  return sourceMask[y * region.width + x] === 0 &&
    isOwnedEnvelopeVisiblePartPixel(page, region, background, x, y) &&
    hasNearbySupportPixel(sourceMask, region.width, region.height, x, y, LONG_SHALLOW_END_CAP_CONNECT_RADIUS)
}

function readHorizontalOverlap(a: Region, b: Region): number {
  const left = Math.max(a.x, b.x)
  const right = Math.min(a.x + a.width, b.x + b.width)

  return Math.max(0, right - left)
}
