import { describe, expect, it } from "vitest"
import { boundsForPixels, selectOwnedForegroundPixels } from "../part-foreground-selection"
import type { Region } from "../contracts"

describe("part foreground selection", () => {
  it("splits high-resolution same-row foreground between neighboring labels", () => {
    const previousLabel = { height: 11, width: 14, x: 107, y: 212 }
    const currentLabel = { height: 11, width: 13, x: 184, y: 212 }
    const leftNeighbor = { height: 420, width: 86, x: 98, y: 50 }
    const currentPart = { height: 540, width: 267, x: 168, y: 50 }
    const pixels = [
      ...pointsInRegion(leftNeighbor),
      ...pointsInRegion(currentPart),
    ]

    expect(pixels.length).toBeGreaterThan(60_000)

    const selected = selectOwnedForegroundPixels(
      pixels,
      currentLabel,
      [previousLabel, currentLabel],
      { splitSameRowComponents: true },
    )
    const selectedBounds = boundsForPixels(selected)

    expect(selected.length).toBeLessThan(pixels.length)
    expect(selectedBounds.x).toBeGreaterThan(leftNeighbor.x)
    expect(selectedBounds.x + selectedBounds.width).toBe(currentPart.x + currentPart.width)
  })
})

function pointsInRegion(region: Region): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      points.push({ x, y })
    }
  }

  return points
}
