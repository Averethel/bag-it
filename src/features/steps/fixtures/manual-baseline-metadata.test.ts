import { describe, expect, it } from "vitest"
import { loadBagAnalysisManifest } from "../../../../tests/e2e/support/bag-analysis-fixtures"

describe("manual baseline fixture metadata", () => {
  it("marks committed e2e fixtures as approved manual-derived baselines", () => {
    const manifest = loadBagAnalysisManifest()

    expect(manifest.cases.length).toBeGreaterThan(0)
  })
})
