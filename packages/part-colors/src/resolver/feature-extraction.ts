import type { PartColorCalibrationInput } from "../contracts"
import { rgbToHex, rgbToLab, rgbToLch } from "../color-space"
import { routeColorFamily } from "./family-routing"
import { selectRepresentativeSampleColor } from "./representative-color"
import { classifySampleQuality } from "./sample-quality"
import type { PartColorFeature } from "./types"

export function extractPartColorFeature(row: PartColorCalibrationInput): PartColorFeature | null {
  const quality = classifySampleQuality(row.sample)

  if (!row.sample || quality.status === "unknown") {
    return null
  }

  const representative = selectRepresentativeSampleColor(row.sample)
  const lab = rgbToLab(representative.rgb)
  const lch = rgbToLch(representative.rgb)

  return {
    family: routeColorFamily(lch),
    hex: rgbToHex(representative.rgb),
    id: row.id,
    lab,
    lch,
    pixelCount: row.sample.pixelCount,
    quality,
    rgb: representative.rgb,
    sample: row.sample,
    topChips: row.sample.chips.slice(0, 5),
  }
}

export function extractPartColorFeatures(
  rows: readonly PartColorCalibrationInput[],
): {
  features: PartColorFeature[]
  skippedPartIds: string[]
} {
  const features: PartColorFeature[] = []
  const skippedPartIds: string[] = []

  for (const row of [...rows].sort(compareRowsById)) {
    const feature = extractPartColorFeature(row)

    if (feature) {
      features.push(feature)
    } else {
      skippedPartIds.push(row.id)
    }
  }

  return { features, skippedPartIds }
}

function compareRowsById(left: PartColorCalibrationInput, right: PartColorCalibrationInput): number {
  return (left.sortKey ?? left.id).localeCompare(right.sortKey ?? right.id) ||
    left.id.localeCompare(right.id)
}
