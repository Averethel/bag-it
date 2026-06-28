import type { CalloutQuantityLabel, Region } from "./contracts"

export function createExcludedLabelRegions(labels: readonly CalloutQuantityLabel[]): Region[] {
  return labels.map((label) => expandLabelMaskRegion(label.region))
}

function expandLabelMaskRegion(region: Region): Region {
  const padding = Math.max(2, Math.round(region.height * 0.22))

  return {
    height: region.height + padding * 2,
    width: region.width + padding * 2,
    x: region.x - padding,
    y: region.y - padding,
  }
}
