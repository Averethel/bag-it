import fs from "node:fs"
import { expect, type Page, type TestInfo } from "@playwright/test"
import {
  compareBagAnalysisVisuals,
  matchBagAnalysisStructure,
  type VisualComparisonFailure,
} from "./bag-analysis-comparison"
import {
  loadBagAnalysisFixture,
  type BagAnalysisFixtureCase,
} from "./bag-analysis-fixtures"

export async function runBagAnalysisFixtureCase(
  page: Page,
  testInfo: TestInfo,
  fixtureCase: BagAnalysisFixtureCase,
): Promise<void> {
  const fixture = loadBagAnalysisFixture(fixtureCase)

  await page.goto("/")
  await page.getByLabel("Continue session file").setInputFiles(fixture.inputSessionPath)
  await waitForBagAnalysisReady(page)

  const session = await downloadSession(page, testInfo, fixtureCase.id)
  const actualResult = session.stepDetectionResult

  expect(actualResult, `${fixtureCase.id}: downloaded session has no stepDetectionResult`).toBeTruthy()
  expect(actualResult.detectorVersion).toBe(await readCurrentDetectorVersion(page))
  expect(actualResult.partExtractorVersion).toBe(await readCurrentPartExtractorVersion(page))
  expect(actualResult.partColorCalibrationVersion).toBe(await readCurrentPartColorCalibrationVersion(page))

  const structuralMatch = matchBagAnalysisStructure({
    actualResult,
    expectedCallouts: fixture.callouts,
    expectedParts: fixture.parts,
  })

  if (structuralMatch.failures.length > 0) {
    await testInfo.attach(`${fixtureCase.id}-structural-failures`, {
      body: Buffer.from(`${structuralMatch.failures.join("\n")}\n`),
      contentType: "text/plain",
    })
    throw new Error(formatStructuralFailures(fixtureCase.id, structuralMatch.failures))
  }

  const visualFailures = await compareBagAnalysisVisuals(page, {
    calloutPairs: structuralMatch.calloutPairs,
    partPairs: structuralMatch.partPairs,
  })

  await attachVisualFailures(testInfo, fixtureCase.id, visualFailures)

  if (visualFailures.length > 0) {
    throw new Error(formatVisualFailures(fixtureCase.id, visualFailures))
  }
}

async function waitForBagAnalysisReady(
  page: Page,
): Promise<void> {
  await page.waitForFunction(
    () => {
      const validationState = window.__bagItValidationState
      const e2eState = window.__bagItE2EState

      if (!validationState || !e2eState) {
        return false
      }

      return (
        validationState.error === null &&
        validationState.stepStatus === "ready" &&
        validationState.partStatus === "ready" &&
        validationState.previewStatus === "ready" &&
        validationState.detectorVersion === validationState.currentDetectorVersion &&
        validationState.partExtractorVersion === validationState.currentPartExtractorVersion &&
        validationState.partColorCalibrationVersion === validationState.currentPartColorCalibrationVersion &&
        e2eState.previewStatus === "ready" &&
        e2eState.result !== null &&
        e2eState.pageAssets.length > 0
      )
    },
    { timeout: 12 * 60 * 1000 },
  )
}

async function downloadSession(
  page: Page,
  testInfo: TestInfo,
  caseId: string,
): Promise<any> {
  const downloadPromise = page.waitForEvent("download")

  await page.getByRole("button", { name: "Download" }).click()

  const download = await downloadPromise
  const sessionPath = testInfo.outputPath(`${caseId}.downloaded.bagit-session.json`)

  await download.saveAs(sessionPath)
  await testInfo.attach(`${caseId}-downloaded-session`, {
    contentType: "application/json",
    path: sessionPath,
  })

  return JSON.parse(fs.readFileSync(sessionPath, "utf8"))
}

async function readCurrentDetectorVersion(page: Page): Promise<string> {
  return page.evaluate(() => window.__bagItValidationState?.currentDetectorVersion ?? "")
}

async function readCurrentPartExtractorVersion(page: Page): Promise<string> {
  return page.evaluate(() => window.__bagItValidationState?.currentPartExtractorVersion ?? "")
}

async function readCurrentPartColorCalibrationVersion(page: Page): Promise<string> {
  return page.evaluate(() => window.__bagItValidationState?.currentPartColorCalibrationVersion ?? "")
}

async function attachVisualFailures(
  testInfo: TestInfo,
  caseId: string,
  failures: VisualComparisonFailure[],
): Promise<void> {
  for (const [index, failure] of failures.entries()) {
    for (const [kind, dataUrl] of [
      ["expected", failure.expectedPng],
      ["actual", failure.actualPng],
      ["diff", failure.diffPng],
    ] as const) {
      if (!dataUrl) {
        continue
      }

      await testInfo.attach(
        [
          caseId,
          failure.pageNumber ? `page-${failure.pageNumber}` : "page-unknown",
          failure.calloutOrdinal !== undefined ? `callout-${failure.calloutOrdinal}` : null,
          failure.rowOrdinal !== undefined ? `row-${failure.rowOrdinal}` : null,
          `${index}-${kind}`,
        ].filter(Boolean).join("-"),
        {
          body: dataUrlToBuffer(dataUrl),
          contentType: "image/png",
        },
      )
    }
  }
}

function formatVisualFailures(caseId: string, failures: VisualComparisonFailure[]): string {
  return failures.map((failure) => {
    const location = [
      `${caseId}`,
      failure.pageNumber ? `page ${failure.pageNumber}` : null,
      failure.calloutOrdinal !== undefined ? `callout ${failure.calloutOrdinal}` : null,
      failure.rowOrdinal !== undefined ? `row ${failure.rowOrdinal}` : null,
      failure.quantity ? `qty ${failure.quantity}` : null,
    ].filter(Boolean).join(" / ")

    return `${location}: ${failure.message}; metrics=${JSON.stringify(failure.metrics ?? {})}`
  }).join("\n")
}

function formatStructuralFailures(caseId: string, failures: string[]): string {
  const visibleFailures = failures.slice(0, 30)
  const remainingCount = Math.max(0, failures.length - visibleFailures.length)

  return [
    `${caseId}: structural fixture comparison failed with ${failures.length} issue(s).`,
    ...visibleFailures,
    remainingCount > 0 ? `... ${remainingCount} more issue(s); see structural-failures attachment.` : null,
  ].filter(Boolean).join("\n")
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const marker = "base64,"
  const markerIndex = dataUrl.indexOf(marker)

  if (markerIndex < 0) {
    return Buffer.from("")
  }

  return Buffer.from(dataUrl.slice(markerIndex + marker.length), "base64")
}
