import type { CalloutPartPageInput, Region } from "./contracts"
import {
  findGlyphComponents,
  isLikelyXGlyph,
  isPlausibleGlyph,
  type GlyphComponent,
} from "./glyph-mask"
import type { QuantityCandidateAssemblyOptions } from "./quantity-candidate-assembly-types"
import type { QuantityCandidate } from "./quantity-candidate-types"
import {
  CALLOUT_BORDER_INSET,
  hasReadableLabelInk,
  isCandidateShape,
} from "./quantity-label-shape"
import { readQuantityOcr } from "./quantity-ocr"
import { createQuantityRead, readDigit } from "./quantity-ocr-read"
import { regionCenter, unionRegions } from "./regions"

export function createSeparatedQuantityCandidates(
  page: CalloutPartPageInput,
  calloutRegion: Region,
  mask: Uint8Array,
  glyphs: readonly GlyphComponent[],
  options: QuantityCandidateAssemblyOptions,
): QuantityCandidate[] {
  return glyphs
    .filter(isLikelyXGlyph)
    .flatMap((xGlyph) => createCandidateFromX(page, calloutRegion, mask, glyphs, xGlyph, options))
}

function createCandidateFromX(
  page: CalloutPartPageInput,
  calloutRegion: Region,
  mask: Uint8Array,
  glyphs: readonly GlyphComponent[],
  xGlyph: GlyphComponent,
  options: QuantityCandidateAssemblyOptions,
): QuantityCandidate[] {
  if (hasFollowingXOwner(page, glyphs, xGlyph)) {
    return []
  }

  const preXGlyphs = findPreXGlyphs(glyphs, xGlyph)
  const usedLocalFallback = preXGlyphs.length === 0
  const localPreXGlyphs = !usedLocalFallback
    ? preXGlyphs
    : findLocalPreXGlyphs(page, mask, calloutRegion, xGlyph)
  const quantityGlyphs = recoverLeadingPreXGlyphs(page, glyphs, localPreXGlyphs, xGlyph)
  const glyphSet = [...quantityGlyphs, xGlyph]
  const recoveredRead = quantityGlyphs.length > localPreXGlyphs.length
    ? readExplicitRecoveredQuantity(quantityGlyphs)
    : null
  const read = recoveredRead ?? readQuantityOcr(page, glyphSet)
  const correctedRead = readLocalFusedOneQuantity(quantityGlyphs.at(-1), xGlyph, usedLocalFallback, read) ?? read

  if (!correctedRead || quantityGlyphs.length === 0 || !hasReadableLabelInk(glyphSet)) {
    return []
  }

  const region = unionRegions(glyphSet.map((glyph) => glyph.region))

  if (!isCandidateShape(calloutRegion, region, quantityGlyphs.length, options)) {
    return []
  }

  return [{
    confidence: correctedRead.confidence,
    glyphs: glyphSet,
    region,
    text: correctedRead.text,
    value: correctedRead.value,
  }]
}

function readExplicitRecoveredQuantity(
  quantityGlyphs: readonly GlyphComponent[],
): ReturnType<typeof readQuantityOcr> {
  if (quantityGlyphs.length < 2) {
    return null
  }

  const digits = quantityGlyphs.map(readDigit)

  return digits.every((digit) => digit !== null)
    ? createQuantityRead(digits)
    : null
}

function recoverLeadingPreXGlyphs(
  page: CalloutPartPageInput,
  glyphs: readonly GlyphComponent[],
  preXGlyphs: readonly GlyphComponent[],
  xGlyph: GlyphComponent,
): GlyphComponent[] {
  if (preXGlyphs.length !== 1) {
    return [...preXGlyphs]
  }

  const [firstDigit] = preXGlyphs
  const leadingDigit = glyphs
    .filter((glyph) => glyph !== xGlyph && !preXGlyphs.includes(glyph))
    .filter((glyph) => readDigit(glyph) !== null)
    .filter((glyph) => isAlignedLeadingDigit(glyph, firstDigit, xGlyph))
    .sort((left, right) => right.region.x - left.region.x)
    .find((glyph) => readQuantityOcr(page, [glyph, ...preXGlyphs, xGlyph]) !== null)

  return leadingDigit ? [leadingDigit, ...preXGlyphs] : [...preXGlyphs]
}

function isAlignedLeadingDigit(
  glyph: GlyphComponent,
  firstDigit: GlyphComponent,
  xGlyph: GlyphComponent,
): boolean {
  if (glyph.region.x >= firstDigit.region.x) {
    return false
  }

  const gap = firstDigit.region.x - (glyph.region.x + glyph.region.width)
  const centerGap = Math.abs(regionCenter(glyph.region).y - regionCenter(firstDigit.region).y)
  const heightRatio = glyph.region.height / Math.max(1, xGlyph.region.height)
  const maxGap = Math.max(14, Math.round(xGlyph.region.height * 1.35))

  return gap >= -2 &&
    gap <= maxGap &&
    centerGap <= Math.max(7, Math.round(xGlyph.region.height * 0.62)) &&
    heightRatio >= 0.55 &&
    heightRatio <= 1.75
}

function readLocalFusedOneQuantity(
  digitGlyph: GlyphComponent | undefined,
  xGlyph: GlyphComponent,
  usedLocalFallback: boolean,
  read: ReturnType<typeof readQuantityOcr>,
): ReturnType<typeof readQuantityOcr> {
  if (!usedLocalFallback || !digitGlyph || !isLikelyFusedOneBeforeX(digitGlyph, xGlyph)) {
    return null
  }

  if (read && read.value !== 4) {
    return null
  }

  return {
    confidence: Math.min(0.82, read?.confidence ?? 0.8),
    text: "1x",
    value: 1,
  }
}

function isLikelyFusedOneBeforeX(
  digitGlyph: GlyphComponent,
  xGlyph: GlyphComponent,
): boolean {
  const gap = xGlyph.region.x - (digitGlyph.region.x + digitGlyph.region.width)
  const aspect = digitGlyph.region.width / Math.max(1, digitGlyph.region.height)

  return gap >= -1 &&
    gap <= Math.max(3, Math.round(xGlyph.region.width * 0.55)) &&
    digitGlyph.region.height >= xGlyph.region.height * 1.05 &&
    digitGlyph.region.width <= Math.max(6, Math.round(xGlyph.region.width * 0.95)) &&
    aspect <= 0.58
}

function findLocalPreXGlyphs(
  page: CalloutPartPageInput,
  mask: Uint8Array,
  calloutRegion: Region,
  xGlyph: GlyphComponent,
): GlyphComponent[] {
  const band = createLocalPreXBand(calloutRegion, xGlyph)
  const localMask = new Uint8Array(page.width * page.height)

  for (let y = band.y; y < band.y + band.height; y += 1) {
    for (let x = band.x; x < band.x + band.width; x += 1) {
      const index = y * page.width + x

      localMask[index] = mask[index]
    }
  }

  const digit = findGlyphComponents(page, localMask, band)
    .filter(isPlausibleGlyph)
    .filter((glyph) => isNearX(glyph, xGlyph, regionCenter(xGlyph.region).y))
    .sort((left, right) => right.region.x - left.region.x)
    .find((glyph) => readQuantityOcr(page, [glyph, xGlyph]) !== null)

  return digit ? [digit] : []
}

function createLocalPreXBand(
  calloutRegion: Region,
  xGlyph: GlyphComponent,
): Region {
  const verticalPadding = Math.max(4, Math.round(xGlyph.region.height * 0.7))
  const horizontalReach = Math.max(18, Math.round(xGlyph.region.height * 2.2))
  const left = Math.max(calloutRegion.x + CALLOUT_BORDER_INSET, xGlyph.region.x - horizontalReach)
  const top = Math.max(calloutRegion.y + CALLOUT_BORDER_INSET, xGlyph.region.y - verticalPadding)
  const right = Math.max(left, xGlyph.region.x - 1)
  const bottom = Math.min(
    calloutRegion.y + calloutRegion.height - CALLOUT_BORDER_INSET,
    xGlyph.region.y + xGlyph.region.height + Math.max(3, Math.round(xGlyph.region.height * 0.35)),
  )

  return {
    height: Math.max(1, bottom - top),
    width: Math.max(1, right - left),
    x: left,
    y: top,
  }
}

function hasFollowingXOwner(
  page: CalloutPartPageInput,
  glyphs: readonly GlyphComponent[],
  xGlyph: GlyphComponent,
): boolean {
  const xRight = xGlyph.region.x + xGlyph.region.width
  const xCenterY = regionCenter(xGlyph.region).y

  return glyphs.some((glyph) => {
    const gap = glyph.region.x - xRight

    return (
      glyph !== xGlyph &&
      glyph.region.x > xGlyph.region.x &&
      !isDigitForFollowingQuantity(page, glyphs, glyph) &&
      gap >= -1 &&
      gap <= Math.max(14, xGlyph.region.height * 1.8) &&
      Math.abs(regionCenter(glyph.region).y - xCenterY) <= Math.max(7, xGlyph.region.height * 0.7) &&
      isLikelyXGlyph(glyph)
    )
  })
}

function isDigitForFollowingQuantity(
  page: CalloutPartPageInput,
  glyphs: readonly GlyphComponent[],
  glyph: GlyphComponent,
): boolean {
  return glyphs.some((xGlyph) =>
    xGlyph !== glyph &&
    xGlyph.region.x > glyph.region.x &&
    isLikelyXGlyph(xGlyph) &&
    isNearX(glyph, xGlyph, regionCenter(xGlyph.region).y) &&
    readQuantityOcr(page, [glyph, xGlyph]) !== null,
  )
}

function findPreXGlyphs(
  glyphs: readonly GlyphComponent[],
  xGlyph: GlyphComponent,
): GlyphComponent[] {
  const xCenter = regionCenter(xGlyph.region)
  const candidates = glyphs
    .filter((glyph) => glyph !== xGlyph)
    .filter((glyph) => glyph.region.x < xGlyph.region.x)
    .filter((glyph) => isNearX(glyph, xGlyph, xCenter.y))
    .sort((left, right) => right.region.x - left.region.x)
  const acceptedRightToLeft: GlyphComponent[] = []
  let nextRightBoundary = xGlyph.region.x

  for (const glyph of candidates) {
    if (acceptedRightToLeft.length > 0 && isLikelyXGlyph(glyph)) {
      break
    }

    if (!isAcceptablePreXGap(glyph, xGlyph, nextRightBoundary, acceptedRightToLeft.length)) {
      if (acceptedRightToLeft.length > 0) {
        break
      }
      continue
    }

    acceptedRightToLeft.push(glyph)
    nextRightBoundary = glyph.region.x
  }

  return acceptedRightToLeft.reverse()
}

function isAcceptablePreXGap(
  glyph: GlyphComponent,
  xGlyph: GlyphComponent,
  nextRightBoundary: number,
  acceptedCount: number,
): boolean {
  const gap = nextRightBoundary - (glyph.region.x + glyph.region.width)
  const maxGap = acceptedCount === 0
    ? Math.max(14, xGlyph.region.height * 1.5)
    : Math.max(10, xGlyph.region.height)

  return gap >= -2 && gap <= maxGap
}

function isNearX(glyph: GlyphComponent, xGlyph: GlyphComponent, xCenterY: number): boolean {
  const centerY = regionCenter(glyph.region).y
  const heightRatio = glyph.region.height / Math.max(1, xGlyph.region.height)
  const gap = xGlyph.region.x - (glyph.region.x + glyph.region.width)

  return (
    gap <= Math.max(42, xGlyph.region.height * 3.8) &&
    Math.abs(centerY - xCenterY) <= Math.max(8, xGlyph.region.height * 0.72) &&
    heightRatio >= 0.45 &&
    heightRatio <= 2.1
  )
}
