import type { CalloutPartPageInput, Region, RgbColor } from "./contracts"
import { colorDistance, readAlpha, readPixel } from "./pixels"
import type { QuantityCandidate } from "./quantity-candidate-types"
import {
  hasLowerQuantityRow,
  hasNearbyLowerQuantityRow,
  hasPrintedBottomRowPeers,
  hasQuantityShapedPartCandidateAbove,
  isOnlyReadableCandidate,
} from "./quantity-part-art-layout"
import { clampRegionToPage } from "./regions"

const PART_ART_FOREGROUND_DISTANCE_MIN = 30

export function hasPrintedLabelLikeForegroundDensity(
  page: CalloutPartPageInput,
  background: RgbColor,
  candidate: QuantityCandidate,
): boolean {
  const foregroundPixels = countForegroundPixels(page, background, candidate.region)
  const area = candidate.region.width * candidate.region.height

  return foregroundPixels >= Math.max(4, Math.round(area * 0.08)) &&
    foregroundPixels <= Math.max(12, Math.round(area * 0.65))
}

export function hasPrintedBaselinePartAbove(
  page: CalloutPartPageInput,
  background: RgbColor,
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): boolean {
  if (candidates.length < 2) {
    return false
  }

  const padding = Math.max(2, Math.round(candidate.region.height * 0.35))
  const aboveHeight = Math.max(6, Math.round(candidate.region.height * 1.75))
  const above = clampRegionToPage({
    height: aboveHeight,
    width: candidate.region.width + padding * 2,
    x: candidate.region.x - padding,
    y: candidate.region.y - aboveHeight,
  }, page)
  const below = clampRegionToPage({
    height: Math.max(4, Math.round(candidate.region.height * 0.9)),
    width: candidate.region.width + padding * 2,
    x: candidate.region.x - padding,
    y: candidate.region.y + candidate.region.height,
  }, page)

  if (!above || !below) {
    return false
  }

  if (hasQuantityShapedPartCandidateAbove(candidates, candidate)) {
    return true
  }

  const belowPixels = countForegroundPixels(page, background, below)

  if (belowPixels > Math.max(3, Math.round(candidate.region.width * 0.18))) {
    return false
  }

  const aboveForeground = countForegroundStats(page, background, above)

  return hasForegroundPartAbove(candidate, aboveForeground)
}

export function hasPrintedBottomRowPartAbove(
  page: CalloutPartPageInput,
  background: RgbColor,
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): boolean {
  if (candidate.glyphs.length === 0 || candidate.value < 4 || hasLowerQuantityRow(candidates, candidate)) {
    return false
  }

  const padding = Math.max(3, Math.round(candidate.region.height * 0.45))
  const aboveHeight = Math.max(10, Math.round(candidate.region.height * 2.25))
  const above = clampRegionToPage({
    height: aboveHeight,
    width: candidate.region.width + padding * 2,
    x: candidate.region.x - padding,
    y: candidate.region.y - aboveHeight,
  }, page)
  const below = clampRegionToPage({
    height: Math.max(4, Math.round(candidate.region.height * 0.75)),
    width: candidate.region.width + padding * 2,
    x: candidate.region.x - padding,
    y: candidate.region.y + candidate.region.height,
  }, page)

  if (!above || !below) {
    return false
  }

  const aboveForeground = countForegroundStats(page, background, above)
  const belowForeground = countForegroundStats(page, background, below)

  return hasForegroundPartAbove(candidate, aboveForeground) &&
    (
      hasPrintedBottomRowPeers(candidates, candidate) ||
      (
        belowForeground.count <= Math.max(18, Math.round(candidate.region.width * 0.55)) &&
        belowForeground.rows <= Math.max(4, Math.round(candidate.region.height * 0.22))
      )
    )
}

export function hasSubstantialNonGlyphForeground(
  page: CalloutPartPageInput,
  background: RgbColor,
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): boolean {
  if (isOnlyReadableCandidate(candidates, candidate)) {
    return false
  }

  const glyphPixels = createGlyphPixelKeys(page, candidate)
  const nonGlyphForegroundPixels = countNonGlyphForegroundPixels(page, background, candidate, glyphPixels)

  return nonGlyphForegroundPixels >= Math.max(16, glyphPixels.size * 1.1)
}

export function hasEmbeddedPartForeground(
  page: CalloutPartPageInput,
  background: RgbColor,
  candidate: QuantityCandidate,
): boolean {
  if (candidate.value < 4 || candidate.glyphs.length === 0) {
    return false
  }

  const glyphPixels = createGlyphPixelKeys(page, candidate)
  const padding = Math.max(2, Math.round(candidate.region.height * 0.22))
  const probe = clampRegionToPage({
    height: candidate.region.height,
    width: candidate.region.width + padding * 2,
    x: candidate.region.x - padding,
    y: candidate.region.y,
  }, page)

  if (!probe) {
    return false
  }

  const nonGlyphForegroundPixels = countNonGlyphForegroundPixels(page, background, {
    ...candidate,
    region: probe,
  }, glyphPixels)

  return nonGlyphForegroundPixels >= Math.max(10, Math.round(glyphPixels.size * 0.22))
}

export function hasRaisedPartForegroundContinuation(
  page: CalloutPartPageInput,
  background: RgbColor,
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): boolean {
  if (candidate.region.height > 22 || !hasLowerQuantityRow(candidates, candidate)) {
    return false
  }

  const probe = clampRegionToPage({
    height: Math.max(2, Math.round(candidate.region.height * 0.35)),
    width: candidate.region.width + Math.max(4, Math.round(candidate.region.height * 0.5)),
    x: candidate.region.x - Math.max(2, Math.round(candidate.region.height * 0.25)),
    y: candidate.region.y + candidate.region.height,
  }, page)

  if (!probe) {
    return false
  }

  return countForegroundPixels(page, background, probe) >= Math.max(6, candidate.region.width * 0.35)
}

export function hasRaisedPartForegroundHalo(
  page: CalloutPartPageInput,
  background: RgbColor,
  candidates: readonly QuantityCandidate[],
  candidate: QuantityCandidate,
): boolean {
  if (candidate.value < 4 || !hasNearbyLowerQuantityRow(candidates, candidate)) {
    return false
  }

  const padding = Math.max(2, Math.round(candidate.region.height * 0.25))
  const probe = clampRegionToPage({
    height: candidate.region.height + padding,
    width: candidate.region.width + padding * 2,
    x: candidate.region.x - padding,
    y: candidate.region.y,
  }, page)

  if (!probe) {
    return false
  }

  const glyphPixels = createGlyphPixelKeys(page, candidate)
  const haloPixels = countNonGlyphForegroundPixels(page, background, {
    ...candidate,
    region: probe,
  }, glyphPixels)
  const glyphPixelCount = Math.max(1, glyphPixels.size)

  return haloPixels >= Math.max(8, glyphPixelCount * 0.12)
}

function hasForegroundPartAbove(
  candidate: QuantityCandidate,
  aboveForeground: { count: number; rows: number },
): boolean {
  return aboveForeground.count >= Math.max(4, Math.round(candidate.region.width * 0.25)) &&
    aboveForeground.rows >= Math.max(3, Math.round(candidate.region.height * 0.25))
}

function countForegroundPixels(
  page: CalloutPartPageInput,
  background: RgbColor,
  region: Region,
): number {
  let count = 0

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      if (readAlpha(page, x, y) >= 32 && colorDistance(readPixel(page, x, y), background) >= PART_ART_FOREGROUND_DISTANCE_MIN) {
        count += 1
      }
    }
  }

  return count
}

function countForegroundStats(
  page: CalloutPartPageInput,
  background: RgbColor,
  region: Region,
): { count: number; rows: number } {
  let count = 0
  const rows = new Set<number>()

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      if (readAlpha(page, x, y) >= 32 && colorDistance(readPixel(page, x, y), background) >= PART_ART_FOREGROUND_DISTANCE_MIN) {
        count += 1
        rows.add(y)
      }
    }
  }

  return { count, rows: rows.size }
}

function countNonGlyphForegroundPixels(
  page: CalloutPartPageInput,
  background: RgbColor,
  candidate: QuantityCandidate,
  glyphPixels: ReadonlySet<number>,
): number {
  let count = 0

  for (let y = candidate.region.y; y < candidate.region.y + candidate.region.height; y += 1) {
    for (let x = candidate.region.x; x < candidate.region.x + candidate.region.width; x += 1) {
      if (isNonGlyphForegroundPixel(page, background, glyphPixels, x, y)) {
        count += 1
      }
    }
  }

  return count
}

function createGlyphPixelKeys(
  page: CalloutPartPageInput,
  candidate: QuantityCandidate,
): Set<number> {
  const glyphPixels = new Set<number>()

  for (const glyph of candidate.glyphs) {
    for (const pixel of glyph.pixels) {
      glyphPixels.add(createPagePixelKey(page, pixel.x, pixel.y))
    }
  }

  return glyphPixels
}

function isNonGlyphForegroundPixel(
  page: CalloutPartPageInput,
  background: RgbColor,
  glyphPixels: ReadonlySet<number>,
  x: number,
  y: number,
): boolean {
  return !glyphPixels.has(createPagePixelKey(page, x, y)) &&
    readAlpha(page, x, y) >= 32 &&
    colorDistance(readPixel(page, x, y), background) >= PART_ART_FOREGROUND_DISTANCE_MIN
}

function createPagePixelKey(page: CalloutPartPageInput, x: number, y: number): number {
  return y * page.width + x
}
