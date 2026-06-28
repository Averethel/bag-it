import { describe, expect, it } from "vitest"
import type { CalloutQuantityLabel, Region } from "../contracts"
import { readUpperLabelClipTop } from "../part-crop-top-recovery"

describe("part crop top recovery", () => {
  it("clips lower-row top recovery below a close upper-row label owner", () => {
    const upperLabel = createLabel({ height: 11, width: 14, x: 130, y: 100 })
    const lowerLabel = createLabel({ height: 11, width: 14, x: 146, y: 142 })
    const rawLowerForeground = { height: 31, width: 45, x: 144, y: 112 }

    expect(readUpperLabelClipTop(lowerLabel.region, [upperLabel, lowerLabel], rawLowerForeground))
      .toBe(upperLabel.region.y + upperLabel.region.height)
  })
})

function createLabel(region: Region): CalloutQuantityLabel {
  return {
    confidence: 0.9,
    region,
    text: "1x",
    value: 1,
  }
}
