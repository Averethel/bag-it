import { describe, expect, it } from "vitest"
import {
  comparePartColorReportRegressionSnapshot,
  readPartColorReportRegressionSnapshots,
} from "./part-color-report-regression.mjs"

describe("private part color report regressions", () => {
  it("matches accepted private report snapshots when present", () => {
    const snapshots = readPartColorReportRegressionSnapshots()

    for (const { snapshot } of snapshots) {
      const { actual, expected } = comparePartColorReportRegressionSnapshot(snapshot)

      expect(actual).toEqual(expected)
    }
  })
})
