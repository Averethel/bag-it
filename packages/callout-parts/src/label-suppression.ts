import type { CalloutQuantityLabel, Region } from "./contracts"
import { regionContainsPoint } from "./regions"

const LABEL_SUPPRESSION_DILATION_MIN = 1
const LABEL_SUPPRESSION_DILATION_MAX = 3
const LABEL_SUPPRESSION_DILATION_RATIO = 0.08

export interface LabelSuppressionMask {
  data: Uint8Array
  region: Region
}

export function createLabelSuppressionMasks(
  labels: readonly CalloutQuantityLabel[],
): LabelSuppressionMask[] {
  return labels.map(createLabelSuppressionMask)
}

export function isSuppressedLabelPixel(
  masks: readonly LabelSuppressionMask[],
  x: number,
  y: number,
): boolean {
  return masks.some((mask) => {
    if (!regionContainsPoint(mask.region, x, y)) {
      return false
    }

    const maskX = x - mask.region.x
    const maskY = y - mask.region.y

    return mask.data[maskY * mask.region.width + maskX] > 0
  })
}

function createLabelSuppressionMask(label: CalloutQuantityLabel): LabelSuppressionMask {
  const dilation = readLabelSuppressionDilation(label.region)
  const region = expandRegion(label.region, dilation)
  const data = new Uint8Array(region.width * region.height)

  if (!label.glyphs || label.glyphs.length === 0) {
    data.fill(1)
    return { data, region }
  }

  for (const glyph of label.glyphs) {
    for (const pixel of glyph.pixels) {
      paintSuppressedPixel(data, region, pixel.x, pixel.y, dilation)
    }
  }

  return { data, region }
}

function paintSuppressedPixel(
  data: Uint8Array,
  region: Region,
  x: number,
  y: number,
  dilation: number,
): void {
  for (let dy = -dilation; dy <= dilation; dy += 1) {
    for (let dx = -dilation; dx <= dilation; dx += 1) {
      const maskX = x + dx - region.x
      const maskY = y + dy - region.y

      if (maskX < 0 || maskY < 0 || maskX >= region.width || maskY >= region.height) {
        continue
      }

      data[maskY * region.width + maskX] = 1
    }
  }
}

function readLabelSuppressionDilation(region: Region): number {
  return Math.max(
    LABEL_SUPPRESSION_DILATION_MIN,
    Math.min(
      LABEL_SUPPRESSION_DILATION_MAX,
      Math.round(region.height * LABEL_SUPPRESSION_DILATION_RATIO),
    ),
  )
}

function expandRegion(region: Region, padding: number): Region {
  return {
    height: region.height + padding * 2,
    width: region.width + padding * 2,
    x: region.x - padding,
    y: region.y - padding,
  }
}
