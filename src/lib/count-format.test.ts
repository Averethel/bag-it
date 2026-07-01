import { describe, expect, it } from "vitest"
import { COUNT_LABELS, formatCount, formatCountRatio } from "./count-format"

describe("formatCount", () => {
  it("uses Intl plural categories for count labels", () => {
    expect(formatCount(0, COUNT_LABELS.callout)).toBe("0 callouts")
    expect(formatCount(1, COUNT_LABELS.callout)).toBe("1 callout")
    expect(formatCount(2, COUNT_LABELS.callout)).toBe("2 callouts")
  })

  it("pluralizes ratios by the total count", () => {
    expect(formatCountRatio(0, 1, COUNT_LABELS.part)).toBe("0/1 part")
    expect(formatCountRatio(0, 2, COUNT_LABELS.part)).toBe("0/2 parts")
  })
})
