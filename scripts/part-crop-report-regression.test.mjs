import { describe, expect, it } from "vitest"
import {
  comparePartCropReportRegressionSnapshot,
  readPartCropReportRegressionSnapshots,
} from "./part-crop-report-regression.mjs"

describe("private part crop report regressions", () => {
  it("matches accepted private crop snapshots when present", () => {
    const snapshots = readPartCropReportRegressionSnapshots()

    for (const { snapshot } of snapshots) {
      const { actual, expected } = comparePartCropReportRegressionSnapshot(snapshot)

      expect(actual).toEqual(expected)
    }
  })
})
