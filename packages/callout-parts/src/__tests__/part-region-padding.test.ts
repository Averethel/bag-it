import { describe, expect, it } from "vitest"
import { padPartImageRegion, padPartMaskRegion } from "../part-region-padding"

describe("part region padding", () => {
  it("adds top search room for long shallow parts whose weak face sits above selected foreground", () => {
    const foreground = { height: 24, width: 59, x: 569, y: 140 }
    const label = { height: 11, width: 13, x: 571, y: 164 }
    const imageRegion = padPartImageRegion(foreground, label, { allowLongShallowTopRecovery: true })

    expect(imageRegion.y).toBeLessThanOrEqual(109)
    expect(imageRegion.x + imageRegion.width).toBeGreaterThanOrEqual(668)
    expect(padPartMaskRegion(foreground, label, { allowLongShallowTopRecovery: true }).y).toBeLessThanOrEqual(109)
  })

  it("keeps long shallow recovery off by default", () => {
    const foreground = { height: 24, width: 59, x: 569, y: 140 }
    const label = { height: 11, width: 13, x: 571, y: 164 }
    const imageRegion = padPartImageRegion(foreground, label)

    expect(imageRegion.y).toBe(116)
    expect(imageRegion.x + imageRegion.width).toBe(664)
    expect(padPartMaskRegion(foreground, label).y).toBe(116)
  })

  it("keeps smaller lower-row crops on the compact top-padding path", () => {
    const foreground = { height: 17, width: 41, x: 271, y: 336 }
    const label = { height: 11, width: 13, x: 271, y: 353 }

    expect(padPartImageRegion(foreground, label).y).toBe(312)
    expect(padPartMaskRegion(foreground, label).y).toBe(312)
  })
})
