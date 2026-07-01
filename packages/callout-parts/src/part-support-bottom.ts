import type { BackgroundModel } from "./background-model"
import type { CalloutPartPageInput, Region } from "./contracts"
import {
  fillPotentialPartSupportRun,
  hasSeedInRow,
  type MaskRun,
  readMaskRuns,
  readRowSeedDensity,
  SUPPORT_ALPHA_DISTANCE_MIN,
  SUPPORT_BOTTOM_EDGE,
  SUPPORT_DARK_BACKGROUND_LUMA_DROP_MIN,
} from "./part-support-common"

const PART_IMAGE_BOTTOM_EDGE_SUPPORT_MIN = 3

export function fillBottomEdgeSupport(
  mask: Uint8Array,
  ownedMask: Uint8Array,
  seedMask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
): void {
  const maxDrop = Math.min(6, Math.max(PART_IMAGE_BOTTOM_EDGE_SUPPORT_MIN, Math.round(region.height * 0.07)))

  for (let y = region.height - 2; y >= 0; y -= 1) {
    for (const run of readMaskRuns(seedMask, region.width, y)) {
      if (isBottomEdgeSupportBaseRun(ownedMask, region.width, y, run)) {
        fillDroppedBottomSupport(mask, seedMask, page, region, background, y, run, maxDrop)
      }
    }
  }
}

function isBottomEdgeSupportBaseRun(
  ownedMask: Uint8Array,
  width: number,
  y: number,
  run: MaskRun,
): boolean {
  const runWidth = run.right - run.left + 1

  return runWidth >= 3 && readRowSeedDensity(ownedMask, width, y, run.left, run.right) <= 0.85
}

function fillDroppedBottomSupport(
  mask: Uint8Array,
  seedMask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  y: number,
  run: MaskRun,
  maxDrop: number,
): void {
  const runWidth = run.right - run.left + 1

  for (let drop = 1; drop <= maxDrop && y + drop < region.height; drop += 1) {
    const inset = Math.min(Math.floor(drop / 2), Math.floor(runWidth / 4))
    const supportY = y + drop
    const left = run.left + inset
    const right = run.right - inset

    if (hasSeedInRow(seedMask, region.width, supportY, left, right)) {
      continue
    }

    fillPotentialPartSupportRun(
      mask,
      page,
      region,
      background,
      supportY,
      left,
      right,
      SUPPORT_BOTTOM_EDGE,
      SUPPORT_ALPHA_DISTANCE_MIN,
      {
        allowDarkBackgroundLike: true,
        lumaDropMin: SUPPORT_DARK_BACKGROUND_LUMA_DROP_MIN,
        nearBackgroundDistanceMin: SUPPORT_ALPHA_DISTANCE_MIN,
      },
    )
  }
}
