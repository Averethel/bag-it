import { test } from "@playwright/test"
import { loadBagAnalysisManifest } from "./support/bag-analysis-fixtures"
import { runBagAnalysisFixtureCase } from "./support/bag-analysis-playwright"

const manifest = loadBagAnalysisManifest()

test.describe.configure({ mode: "serial" })

test.describe("bag-analysis fixture gate", () => {
  for (const fixture of manifest.cases) {
    test(fixture.id, async ({ page }, testInfo) => {
      await runBagAnalysisFixtureCase(page, testInfo, fixture)
    })
  }
})
