import { describe, expect, it } from "vitest"
import { PART_COLOR_CALIBRATION_VERSION } from "../version"

describe("part color calibration version", () => {
  it("exposes the current persisted calibration version", () => {
    expect(PART_COLOR_CALIBRATION_VERSION).toBe("2.0.0-alpha.65")
  })
})
