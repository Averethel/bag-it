import fs from "node:fs"
import { expect, type Page, type TestInfo } from "@playwright/test"
import {
  compareBagAnalysisVisuals,
  matchBagAnalysisStructure,
  type ActualDetectionResult,
  type ExpectedCalloutsFixture,
  type ExpectedPartsFixture,
  type VisualComparisonFailure,
} from "./bag-analysis-comparison"
import {
  loadBagAnalysisFixture,
  type BagAnalysisFixtureCase,
} from "./bag-analysis-fixtures"

const SESSION_DOWNLOAD_FIXTURE_LIMIT_BYTES = 50 * 1024 * 1024

type FixtureActualResult = ActualDetectionResult & {
  detectorVersion?: string
  partColorCalibrationVersion?: string | null
  partExtractorVersion?: string | null
}

interface DownloadedBagItSession {
  stepDetectionResult?: FixtureActualResult | null
}

export async function runBagAnalysisFixtureCase(
  page: Page,
  testInfo: TestInfo,
  fixtureCase: BagAnalysisFixtureCase,
): Promise<void> {
  const fixture = loadBagAnalysisFixture(fixtureCase)

  await page.goto("/")
  await page.getByLabel("Continue session file").setInputFiles(fixture.inputSessionPath)
  await waitForBagAnalysisReady(page)

  const actualResult = await readActualResult(page, testInfo, {
    caseId: fixtureCase.id,
    inputSessionPath: fixture.inputSessionPath,
  })

  expect(actualResult.detectorVersion).toBe(await readCurrentDetectorVersion(page))
  expect(actualResult.partExtractorVersion).toBe(await readCurrentPartExtractorVersion(page))
  expect(actualResult.partColorCalibrationVersion).toBe(await readCurrentPartColorCalibrationVersion(page))

  const comparisonInput = await createComparisonInput({
    actualResult,
    expectedCallouts: fixture.callouts,
    expectedParts: fixture.parts,
    fixtureCase,
    inputSessionPath: fixture.inputSessionPath,
    testInfo,
  })
  const structuralMatch = matchBagAnalysisStructure({
    actualResult: comparisonInput.actualResult,
    expectedCallouts: comparisonInput.expectedCallouts,
    expectedParts: comparisonInput.expectedParts,
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

async function createComparisonInput({
  actualResult,
  expectedCallouts,
  expectedParts,
  fixtureCase,
  inputSessionPath,
  testInfo,
}: {
  actualResult: FixtureActualResult
  expectedCallouts: ExpectedCalloutsFixture
  expectedParts: ExpectedPartsFixture
  fixtureCase: BagAnalysisFixtureCase
  inputSessionPath: string
  testInfo: TestInfo
}): Promise<{
  actualResult: FixtureActualResult
  expectedCallouts: ExpectedCalloutsFixture
  expectedParts: ExpectedPartsFixture
}> {
  let comparisonInput = {
    actualResult,
    expectedCallouts,
    expectedParts,
  }

  if (!shouldScopeLargeFixtureToAnnotatedPages(fixtureCase, inputSessionPath)) {
    return shouldApplyKnownCiFixtureOverrides(fixtureCase)
      ? applyKnownCiFixtureOverrides({
          ...comparisonInput,
          fixtureCase,
          testInfo,
        })
      : comparisonInput
  }

  const pageNumbers = new Set(fixtureCase.pages ?? [])
  comparisonInput = {
    actualResult: {
      ...actualResult,
      callouts: (actualResult.callouts ?? []).filter((callout) => pageNumbers.has(callout.pageNumber)),
    },
    expectedCallouts: {
      ...expectedCallouts,
      callouts: expectedCallouts.callouts.filter((callout) => pageNumbers.has(callout.pageNumber)),
    },
    expectedParts: {
      ...expectedParts,
      callouts: expectedParts.callouts.filter((callout) => pageNumbers.has(callout.pageNumber)),
    },
  }

  await testInfo.attach(`${fixtureCase.id}-comparison-scope`, {
    body: Buffer.from(
      [
        "Scoped large-session CI comparison to manifest pages.",
        `Pages: ${[...pageNumbers].sort((left, right) => left - right).join(", ")}`,
        `Expected scoped callouts: ${comparisonInput.expectedCallouts.callouts.length}`,
        `Actual scoped callouts: ${comparisonInput.actualResult.callouts.length}`,
        "",
      ].join("\n"),
    ),
    contentType: "text/plain",
  })

  return shouldApplyKnownCiFixtureOverrides(fixtureCase)
    ? applyKnownCiFixtureOverrides({
        ...comparisonInput,
        fixtureCase,
        testInfo,
      })
    : comparisonInput
}

async function applyKnownCiFixtureOverrides({
  actualResult,
  expectedCallouts,
  expectedParts,
  fixtureCase,
  testInfo,
}: {
  actualResult: FixtureActualResult
  expectedCallouts: ExpectedCalloutsFixture
  expectedParts: ExpectedPartsFixture
  fixtureCase: BagAnalysisFixtureCase
  testInfo: TestInfo
}): Promise<{
  actualResult: FixtureActualResult
  expectedCallouts: ExpectedCalloutsFixture
  expectedParts: ExpectedPartsFixture
}> {
  const missingCallouts = fixtureCase.ciKnownMissingCallouts ?? []
  const missingRows = fixtureCase.ciKnownMissingPartRows ?? []
  const missingCalloutOrdinals = new Set(missingCallouts.map((callout) => callout.calloutOrdinal))
  const missingByCallout = new Map<number, Set<number>>()

  for (const row of missingRows) {
    const rows = missingByCallout.get(row.calloutOrdinal) ?? new Set<number>()

    rows.add(row.partOrdinal)
    missingByCallout.set(row.calloutOrdinal, rows)
  }

  const expectedCalloutsWithoutKnownMissing = {
    ...expectedCallouts,
    callouts: expectedCallouts.callouts.filter((callout) => !missingCalloutOrdinals.has(callout.ordinal)),
  }
  const expectedPartsWithoutKnownMissing = {
    ...expectedParts,
    callouts: expectedParts.callouts
      .filter((callout) => !missingCalloutOrdinals.has(callout.ordinal))
      .map((callout) => {
        const missingOrdinals = missingByCallout.get(callout.ordinal)

        return missingOrdinals
          ? {
              ...callout,
              parts: callout.parts.filter((part) => !missingOrdinals.has(part.ordinal)),
            }
          : callout
      }),
  }

  await testInfo.attach(`${fixtureCase.id}-ci-known-fixture-overrides`, {
    body: Buffer.from(
      [
        "Applied CI-only known missing fixture overrides.",
        ...missingCallouts.map((callout) =>
          `callout ${callout.calloutOrdinal}: ${callout.reason}`,
        ),
        ...missingRows.map((row) =>
          `callout ${row.calloutOrdinal} row ${row.partOrdinal}: ${row.reason}`,
        ),
        "",
      ].join("\n"),
    ),
    contentType: "text/plain",
  })

  return {
    actualResult,
    expectedCallouts: expectedCalloutsWithoutKnownMissing,
    expectedParts: expectedPartsWithoutKnownMissing,
  }
}

function shouldApplyKnownCiFixtureOverrides(fixtureCase: BagAnalysisFixtureCase): boolean {
  return (
    process.env.BAG_IT_E2E_ALLOW_UNTRUSTED_COLOR_DRIFT === "1" &&
    (
      Boolean(fixtureCase.ciKnownMissingCallouts?.length) ||
      Boolean(fixtureCase.ciKnownMissingPartRows?.length)
    )
  )
}

async function readActualResult(
  page: Page,
  testInfo: TestInfo,
  {
    caseId,
    inputSessionPath,
  }: {
    caseId: string
    inputSessionPath: string
  },
): Promise<FixtureActualResult> {
  if (fs.statSync(inputSessionPath).size <= SESSION_DOWNLOAD_FIXTURE_LIMIT_BYTES) {
    const session = await downloadSession(page, testInfo, caseId)

    if (!session.stepDetectionResult) {
      throw new Error(`${caseId}: downloaded session has no stepDetectionResult`)
    }

    return session.stepDetectionResult
  }

  await testInfo.attach(`${caseId}-download-skipped`, {
    body: Buffer.from(
      [
        `Skipped browser session download for ${caseId}.`,
        `Input session exceeds ${SESSION_DOWNLOAD_FIXTURE_LIMIT_BYTES} bytes.`,
        "Fixture comparison uses window.__bagItE2EState.result to avoid CI Chrome crashes on huge session downloads.",
        "",
      ].join("\n"),
    ),
    contentType: "text/plain",
  })

  const actualResult = await page.evaluate(() => window.__bagItE2EState?.result ?? null)

  if (!actualResult) {
    throw new Error(`${caseId}: in-page e2e state has no result`)
  }

  return actualResult as unknown as FixtureActualResult
}

function shouldScopeLargeFixtureToAnnotatedPages(
  fixtureCase: BagAnalysisFixtureCase,
  inputSessionPath: string,
): boolean {
  return (
    process.env.BAG_IT_E2E_ALLOW_UNTRUSTED_COLOR_DRIFT === "1" &&
    fs.statSync(inputSessionPath).size > SESSION_DOWNLOAD_FIXTURE_LIMIT_BYTES &&
    Array.isArray(fixtureCase.pages) &&
    fixtureCase.pages.length > 0
  )
}

async function downloadSession(
  page: Page,
  testInfo: TestInfo,
  caseId: string,
): Promise<DownloadedBagItSession> {
  const downloadPromise = page.waitForEvent("download")

  await page.getByRole("button", { name: "Download" }).click()

  const download = await downloadPromise
  const sessionPath = testInfo.outputPath(`${caseId}.downloaded.bagit-session.json`)

  await download.saveAs(sessionPath)
  await testInfo.attach(`${caseId}-downloaded-session`, {
    contentType: "application/json",
    path: sessionPath,
  })

  return JSON.parse(fs.readFileSync(sessionPath, "utf8")) as DownloadedBagItSession
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
