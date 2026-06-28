import type { BackgroundModel } from "./background-model"
import type { CalloutPartPageInput, Region } from "./contracts"
import {
  fillPotentialPartSupportRun,
  type MaskRun,
  readMaskRuns,
  readRowSeedDensity,
  SUPPORT_TOP_ALPHA_DISTANCE_LOOSE_MIN,
  SUPPORT_TOP_ALPHA_DISTANCE_MIN,
  SUPPORT_TOP_DARK_BACKGROUND_LUMA_DROP_MIN,
  SUPPORT_TOP_FACE,
} from "./part-support-common"

const PART_IMAGE_TOP_FACE_SUPPORT_MIN = 4
const TOP_FACE_SEED_DENSITY_MAX = 0.72

export function fillTopFaceSupport(
  mask: Uint8Array,
  ownedMask: Uint8Array,
  seedMask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
): void {
  const maxLift = readTopSupportLift(region)

  for (let y = 1; y < region.height; y += 1) {
    for (const run of readMaskRuns(seedMask, region.width, y)) {
      if (isTopFaceSupportBaseRun(ownedMask, region.width, y, run)) {
        fillLiftedTopSupport(mask, seedMask, page, region, background, y, run, maxLift)
      }
    }
  }
}

function isTopFaceSupportBaseRun(
  ownedMask: Uint8Array,
  width: number,
  y: number,
  run: MaskRun,
): boolean {
  const runWidth = run.right - run.left + 1

  return runWidth >= 4 && readRowSeedDensity(ownedMask, width, y, run.left, run.right) > 0
}

function fillLiftedTopSupport(
  mask: Uint8Array,
  seedMask: Uint8Array,
  page: CalloutPartPageInput,
  region: Region,
  background: BackgroundModel,
  y: number,
  run: MaskRun,
  maxLift: number,
): void {
  const runWidth = run.right - run.left + 1

  for (let lift = 1; lift <= maxLift && y - lift >= 0; lift += 1) {
    const expansion = Math.min(Math.floor(lift / 3), Math.max(4, Math.floor(runWidth / 4)))
    const supportY = y - lift
    const left = Math.max(0, run.left - expansion)
    const right = Math.min(region.width - 1, run.right + expansion)

    if (readRowSeedDensity(seedMask, region.width, supportY, left, right) <= TOP_FACE_SEED_DENSITY_MAX) {
      fillPotentialPartSupportRun(
        mask,
        page,
        region,
        background,
        supportY,
        left,
        right,
        SUPPORT_TOP_FACE,
        SUPPORT_TOP_ALPHA_DISTANCE_MIN,
        {
          allowDarkBackgroundLike: true,
          lumaDropMin: SUPPORT_TOP_DARK_BACKGROUND_LUMA_DROP_MIN,
          nearBackgroundDistanceMin: SUPPORT_TOP_ALPHA_DISTANCE_LOOSE_MIN,
        },
      )
    }
  }
}

function readTopSupportLift(region: Region): number {
  const baseLift = Math.max(PART_IMAGE_TOP_FACE_SUPPORT_MIN, Math.round(region.height * 0.14))
  const tallLift = region.height >= 40
    ? Math.round(region.height * 0.28)
    : baseLift

  return Math.min(24, Math.max(baseLift, tallLift))
}
