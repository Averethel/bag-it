import { describe, expect, it } from "vitest"
import type { CalloutPartAlphaMask, Region } from "../contracts"
import { trimPartAlphaMask } from "../part-alpha-trim"

describe("part alpha trim", () => {
  it("clamps support that escapes from the top edge back to the selected foreground", () => {
    const region = { height: 90, width: 50, x: 100, y: 20 }
    const foregroundBounds = { height: 30, width: 22, x: 114, y: 70 }
    const alphaMask = createMask(region, { height: 75, width: 24, x: 12, y: 0 })

    const trimmed = trimPartAlphaMask({
      alphaMask,
      foregroundBounds,
      region,
      supportPixelsAdded: { bottom: 0, interior: 0, top: 400 },
    })

    expect(trimmed.region.y).toBe(foregroundBounds.y - 4)
    expect(trimmed.region.height).toBe(43)
    expect(readAlpha(trimmed.alphaMask, 12, 0)).toBe(0)
    expect(trimmed.alphaBounds).toMatchObject({ height: 25, y: 50 })
  })

  it("clamps interior support that escapes from the top edge", () => {
    const region = { height: 90, width: 50, x: 100, y: 20 }
    const foregroundBounds = { height: 30, width: 22, x: 114, y: 70 }
    const alphaMask = createMask(region, { height: 75, width: 24, x: 12, y: 0 })

    const trimmed = trimPartAlphaMask({
      alphaMask,
      foregroundBounds,
      region,
      supportPixelsAdded: { bottom: 0, interior: 400, top: 0 },
    })

    expect(trimmed.region.y).toBe(foregroundBounds.y - 4)
    expect(readAlpha(trimmed.alphaMask, 12, 0)).toBe(0)
  })

  it("clamps non-compact top-edge leakage without support pixels", () => {
    const region = { height: 90, width: 70, x: 470, y: 28 }
    const foregroundBounds = { height: 30, width: 43, x: 492, y: 58 }
    const alphaMask = createMask(region, { height: 60, width: 45, x: 21, y: 0 })

    const trimmed = trimPartAlphaMask({
      alphaMask,
      foregroundBounds,
      foregroundPixelCount: 6235,
      region,
      supportPixelsAdded: { bottom: 0, interior: 0, top: 0 },
    })

    expect(trimmed.region.y).toBe(54)
    expect(readAlpha(trimmed.alphaMask, 21, 0)).toBe(0)
  })

  it("keeps legitimate top support that does not start at the image edge", () => {
    const region = { height: 90, width: 50, x: 100, y: 20 }
    const foregroundBounds = { height: 30, width: 22, x: 114, y: 54 }
    const alphaMask = createMask(region, { height: 50, width: 24, x: 12, y: 10 })

    const trimmed = trimPartAlphaMask({
      alphaMask,
      foregroundBounds,
      region,
      supportPixelsAdded: { bottom: 0, interior: 0, top: 120 },
    })

    expect(trimmed.region.y).toBe(22)
    expect(readAlpha(trimmed.alphaMask, 12, 8)).toBe(255)
  })

  it("keeps compact top support that starts inside the image", () => {
    const region = { height: 70, width: 42, x: 180, y: 56 }
    const foregroundBounds = { height: 14, width: 17, x: 196, y: 78 }
    const alphaMask = createMask(region, { height: 24, width: 18, x: 16, y: 12 })

    const trimmed = trimPartAlphaMask({
      alphaMask,
      foregroundBounds,
      region,
      supportPixelsAdded: { bottom: 0, interior: 0, top: 80 },
    })

    expect(trimmed.region.y).toBeLessThanOrEqual(68)
    expect(readAlpha(trimmed.alphaMask, 16, 8)).toBe(255)
  })

  it("clamps right-side support that escapes past the owned foreground envelope", () => {
    const region = { height: 57, width: 89, x: 254, y: 313 }
    const ownedRegion = { height: 57, width: 57, x: 263, y: 313 }
    const foregroundBounds = { height: 17, width: 41, x: 271, y: 336 }
    const alphaMask = createMask(region, { height: 20, width: 73, x: 16, y: 21 })

    const trimmed = trimPartAlphaMask({
      allowLongShallowTopRecovery: true,
      alphaMask,
      foregroundBounds,
      ownedRegion,
      region,
      supportPixelsAdded: { bottom: 0, interior: 0, top: 120 },
    })

    expect(trimmed.region.x + trimmed.region.width).toBe(ownedRegion.x + ownedRegion.width)
    expect(trimmed.alphaMask.width).toBe(trimmed.region.width)
    expect(readAlpha(trimmed.alphaMask, foregroundBounds.x + foregroundBounds.width - trimmed.region.x, 25)).toBe(0)
    expect(readAlpha(trimmed.alphaMask, foregroundBounds.x + foregroundBounds.width - trimmed.region.x - 1, 25))
      .toBe(255)
  })

  it("clamps scaled right-side support that escapes past the owned foreground envelope", () => {
    const region = { height: 114, width: 178, x: 508, y: 626 }
    const ownedRegion = { height: 114, width: 114, x: 526, y: 626 }
    const foregroundBounds = { height: 34, width: 82, x: 542, y: 672 }
    const alphaMask = createMask(region, { height: 40, width: 146, x: 32, y: 42 })

    const trimmed = trimPartAlphaMask({
      allowLongShallowTopRecovery: true,
      alphaMask,
      foregroundBounds,
      ownedRegion,
      region,
      supportPixelsAdded: { bottom: 0, interior: 0, top: 240 },
    })

    expect(trimmed.region.x + trimmed.region.width).toBe(ownedRegion.x + ownedRegion.width)
    expect(trimmed.alphaMask.width).toBe(trimmed.region.width)
  })

  it("keeps small right-side support overhang for long shallow parts", () => {
    const region = { height: 52, width: 87, x: 279, y: 56 }
    const ownedRegion = { height: 52, width: 55, x: 288, y: 56 }
    const foregroundBounds = { height: 14, width: 39, x: 296, y: 78 }
    const alphaMask = createMask(region, { height: 33, width: 53, x: 17, y: 4 })

    const trimmed = trimPartAlphaMask({
      allowLongShallowTopRecovery: true,
      alphaMask,
      foregroundBounds,
      ownedRegion,
      region,
      supportPixelsAdded: { bottom: 0, interior: 0, top: 120 },
    })

    expect(trimmed.region.x + trimmed.region.width).toBeGreaterThan(ownedRegion.x + ownedRegion.width)
    expect(trimmed.alphaMask.width).toBe(trimmed.region.width)
  })

  it("keeps long shallow right support beyond the ownership envelope", () => {
    const region = { height: 64, width: 108, x: 552, y: 117 }
    const ownedRegion = { height: 64, width: 75, x: 561, y: 117 }
    const foregroundBounds = { height: 24, width: 59, x: 569, y: 140 }
    const alphaMask = createMask(region, { height: 45, width: 87, x: 17, y: 4 })

    const trimmed = trimPartAlphaMask({
      allowLongShallowTopRecovery: true,
      alphaMask,
      foregroundBounds,
      ownedRegion,
      region,
      supportPixelsAdded: { bottom: 0, interior: 0, top: 120 },
    })

    expect(trimmed.region.x + trimmed.region.width).toBeGreaterThan(ownedRegion.x + ownedRegion.width)
    expect(readAlpha(trimmed.alphaMask, ownedRegion.x + ownedRegion.width - trimmed.region.x, 20)).toBe(255)
  })

  it("keeps scaled long shallow right support with one-pixel ratio rounding drift", () => {
    const region = { height: 225, width: 360, x: 1656, y: 318 }
    const ownedRegion = { height: 225, width: 225, x: 1683, y: 318 }
    const foregroundBounds = { height: 72, width: 177, x: 1707, y: 420 }
    const alphaMask = createMask(region, { height: 156, width: 284, x: 51, y: 18 })

    const trimmed = trimPartAlphaMask({
      allowLongShallowTopRecovery: true,
      alphaMask,
      foregroundBounds,
      ownedRegion,
      region,
      supportPixelsAdded: { bottom: 0, interior: 0, top: 540 },
    })

    expect(trimmed.region.x + trimmed.region.width).toBeGreaterThan(ownedRegion.x + ownedRegion.width)
  })

  it("does not keep bottom padding below long shallow alpha support", () => {
    const region = { height: 75, width: 119, x: 552, y: 106 }
    const ownedRegion = { height: 75, width: 75, x: 561, y: 106 }
    const foregroundBounds = { height: 24, width: 59, x: 569, y: 140 }
    const alphaMask = createMask(region, { height: 48, width: 88, x: 17, y: 12 })

    const trimmed = trimPartAlphaMask({
      allowLongShallowTopRecovery: true,
      alphaMask,
      foregroundBounds,
      ownedRegion,
      region,
      supportPixelsAdded: { bottom: 0, interior: 0, top: 180 },
    })

    expect(trimmed.region.y + trimmed.region.height).toBe(region.y + 12 + 48)
  })

  it("keeps one extra scaled top row for very long shallow top support", () => {
    const region = { height: 150, width: 238, x: 1104, y: 212 }
    const ownedRegion = { height: 150, width: 150, x: 1122, y: 212 }
    const foregroundBounds = { height: 48, width: 118, x: 1138, y: 280 }
    const alphaMask = createMask(region, { height: 92, width: 180, x: 34, y: 28 })

    const trimmed = trimPartAlphaMask({
      allowLongShallowTopRecovery: true,
      alphaMask,
      foregroundBounds,
      ownedRegion,
      region,
      supportPixelsAdded: { bottom: 0, interior: 0, top: 360 },
    })

    expect(trimmed.region.y).toBeLessThanOrEqual(226)
  })

  it("keeps bottom crop room for shallow lower-label parts without retaining top context", () => {
    const region = { height: 51, width: 97, x: 468, y: 123 }
    const foregroundBounds = { height: 25, width: 71, x: 485, y: 132 }
    const alphaMask = createMask(region, { height: 27, width: 79, x: 9, y: 7 })

    const trimmed = trimPartAlphaMask({
      alphaMask,
      foregroundBounds,
      foregroundPixelCount: 6235,
      region,
      supportPixelsAdded: { bottom: 0, interior: 0, top: 0 },
    })

    expect(trimmed.region.y).toBe(129)
    expect(trimmed.region.y + trimmed.region.height).toBe(166)
    expect(trimmed.region.width).toBe(97)
  })

  it("clears sparse top alpha rows before a shallow lower-label part", () => {
    const region = { height: 51, width: 97, x: 468, y: 123 }
    const foregroundBounds = { height: 25, width: 71, x: 485, y: 132 }
    const alphaMask = createMaskWithRegions(region, [
      { height: 1, width: 7, x: 56, y: 7 },
      { height: 1, width: 7, x: 56, y: 8 },
      { height: 1, width: 14, x: 50, y: 9 },
      { height: 1, width: 10, x: 50, y: 10 },
      { height: 23, width: 79, x: 9, y: 11 },
    ])

    const trimmed = trimPartAlphaMask({
      alphaMask,
      foregroundBounds,
      region,
      supportPixelsAdded: { bottom: 0, interior: 0, top: 0 },
    })

    expect(trimmed.region.y).toBe(133)
    expect(trimmed.region.y + trimmed.region.height).toBe(166)
    expect(readAlpha(trimmed.alphaMask, 56, 0)).toBe(0)
    expect(readAlpha(trimmed.alphaMask, 9, 1)).toBe(255)
    expect(readAlpha(trimmed.alphaMask, 13, 27)).toBe(255)
  })

  it("keeps tight padding for dense taller long shallow plates", () => {
    const region = { height: 64, width: 119, x: 673, y: 50 }
    const foregroundBounds = { height: 38, width: 92, x: 690, y: 60 }
    const alphaMask = createMask(region, { height: 38, width: 92, x: 17, y: 10 })

    const trimmed = trimPartAlphaMask({
      alphaMask,
      foregroundBounds,
      foregroundPixelCount: 18138,
      region,
      supportPixelsAdded: { bottom: 0, interior: 0, top: 0 },
    })

    expect(trimmed.region).toMatchObject({ height: 48, y: 54 })
    expect(trimmed.alphaBounds).toMatchObject({ height: 38 })
    expect(readAlpha(trimmed.alphaMask, 17, trimmed.alphaBounds!.y + trimmed.alphaBounds!.height)).toBe(0)
  })

  it("does not recover bottom alpha for dense scaled shallow plates", () => {
    const region = { height: 110, width: 220, x: 0, y: 0 }
    const foregroundBounds = { height: 60, width: 150, x: 35, y: 20 }
    const alphaMask = createMask(region, { height: 64, width: 150, x: 35, y: 18 })

    const trimmed = trimPartAlphaMask({
      alphaMask,
      foregroundBounds,
      foregroundPixelCount: 45000,
      region,
      supportPixelsAdded: { bottom: 0, interior: 0, top: 0 },
    })

    expect(trimmed.alphaBounds).toMatchObject({ height: 64 })
    expect(readAlpha(trimmed.alphaMask, 35, trimmed.alphaBounds!.y + trimmed.alphaBounds!.height)).toBe(0)
  })

  it("removes detached top-edge contamination while keeping the lower compact part", () => {
    const region = { height: 58, width: 62, x: 50, y: 338 }
    const foregroundBounds = { height: 41, width: 29, x: 51, y: 338 }
    const alphaMask = createMaskWithRegions(region, [
      { height: 15, width: 29, x: 1, y: 0 },
      { height: 3, width: 1, x: 35, y: 1 },
      { height: 1, width: 1, x: 38, y: 3 },
      { height: 14, width: 16, x: 11, y: 26 },
    ])

    const trimmed = trimPartAlphaMask({
      alphaMask,
      foregroundBounds,
      region,
      supportPixelsAdded: { bottom: 0, interior: 0, top: 0 },
    })

    expect(trimmed.region.y).toBe(356)
    expect(readAlpha(trimmed.alphaMask, 0, 0)).toBe(0)
    expect(readAlpha(trimmed.alphaMask, 11, 8)).toBe(255)
  })

  it("keeps lone tiny top pixels that preserve compact part context", () => {
    const region = { height: 61, width: 58, x: 136, y: 381 }
    const foregroundBounds = { height: 42, width: 33, x: 153, y: 383 }
    const alphaMask = createMaskWithRegions(region, [
      { height: 1, width: 1, x: 27, y: 2 },
      { height: 33, width: 32, x: 12, y: 11 },
    ])

    const trimmed = trimPartAlphaMask({
      alphaMask,
      foregroundBounds,
      region,
      supportPixelsAdded: { bottom: 0, interior: 0, top: 0 },
    })

    expect(trimmed.region.y).toBe(381)
    expect(readAlpha(trimmed.alphaMask, 27, 2)).toBe(255)
  })

})

function createMask(maskRegion: Region, filledRegion: Region): CalloutPartAlphaMask {
  return createMaskWithRegions(maskRegion, [filledRegion])
}

function createMaskWithRegions(maskRegion: Region, filledRegions: readonly Region[]): CalloutPartAlphaMask {
  const data = new Uint8ClampedArray(maskRegion.width * maskRegion.height)

  for (const filledRegion of filledRegions) {
    for (let y = filledRegion.y; y < filledRegion.y + filledRegion.height; y += 1) {
      for (let x = filledRegion.x; x < filledRegion.x + filledRegion.width; x += 1) {
        data[y * maskRegion.width + x] = 255
      }
    }
  }

  return {
    data,
    height: maskRegion.height,
    width: maskRegion.width,
  }
}

function readAlpha(mask: CalloutPartAlphaMask, x: number, y: number): number {
  return mask.data[y * mask.width + x] ?? 0
}
