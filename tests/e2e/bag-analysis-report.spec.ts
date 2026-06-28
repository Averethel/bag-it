import fs from "node:fs"
import path from "node:path"
import { test } from "@playwright/test"
import {
  loadBagAnalysisFixture,
  loadBagAnalysisManifest,
} from "./support/bag-analysis-fixtures"
import {
  createBagAnalysisCaseReport,
  writeBagAnalysisErrorReport,
  writeBagAnalysisReportIndex,
  type BagAnalysisReportSummary,
} from "./support/bag-analysis-report"

const manifest = loadBagAnalysisManifest()
const selectedCaseIds = new Set(
  (process.env.BAG_ANALYSIS_CASE_IDS ?? "")
    .split(",")
    .map((caseId) => caseId.trim())
    .filter(Boolean),
)
const selectedCases = selectedCaseIds.size === 0
  ? manifest.cases
  : manifest.cases.filter((fixtureCase) => selectedCaseIds.has(fixtureCase.id))

test.describe.configure({ mode: "serial" })

test("write bag-analysis fixture difference report", async ({ browser }, testInfo) => {
  test.setTimeout(90 * 60 * 1000)

  const outputRoot = process.env.BAG_ANALYSIS_DIFF_REPORT_DIR
    ? path.resolve(process.env.BAG_ANALYSIS_DIFF_REPORT_DIR)
    : path.join(
      process.cwd(),
      ".bag-it/private/e2e-fixture-diff-reports",
      createTimestampSlug(),
    )
  const summaries: BagAnalysisReportSummary[] = []

  fs.mkdirSync(outputRoot, { recursive: true })

  for (const fixtureCase of selectedCases) {
    const fixture = loadBagAnalysisFixture(fixtureCase)
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      await page.goto("/")
      const browserInfo = await readBrowserRunInfo(page, testInfo.project.name, browser.version())
      await page.getByLabel("Continue session file").setInputFiles(fixture.inputSessionPath)
      await waitForPipelineReady(page)

      const downloadedSessionPath = path.join(outputRoot, fixtureCase.id, `${fixtureCase.id}.downloaded.bagit-session.json`)
      const session = await downloadSession(page, downloadedSessionPath)
      const actualResult = session.stepDetectionResult

      if (!actualResult) {
        throw new Error(`${fixtureCase.id}: downloaded session has no stepDetectionResult`)
      }

      summaries.push(await createBagAnalysisCaseReport({
        actualResult,
        browserInfo,
        downloadedSessionPath,
        fixture,
        outputRoot,
        page,
      }))
    } catch (error) {
      summaries.push(writeBagAnalysisErrorReport({
        browserInfo: await readBrowserRunInfoSafely(page, testInfo.project.name, browser.version()),
        caseId: fixtureCase.id,
        error,
        fixture,
        outputRoot,
      }))
    } finally {
      await context.close()
      writeBagAnalysisReportIndex(outputRoot, summaries)
    }
  }

  const indexPath = writeBagAnalysisReportIndex(outputRoot, summaries)

  await testInfo.attach("bag-analysis-difference-report", {
    contentType: "text/html",
    path: indexPath,
  })

  console.log(`Bag analysis difference report: ${indexPath}`)
})

async function readBrowserRunInfo(
  page: import("@playwright/test").Page,
  projectName: string,
  browserVersion: string,
) {
  const runtime = await page.evaluate(() => ({
    devicePixelRatio: window.devicePixelRatio,
    userAgent: navigator.userAgent,
  }))

  return {
    browserVersion,
    devicePixelRatio: runtime.devicePixelRatio,
    projectName,
    userAgent: runtime.userAgent,
  }
}

async function readBrowserRunInfoSafely(
  page: import("@playwright/test").Page,
  projectName: string,
  browserVersion: string,
) {
  try {
    return await readBrowserRunInfo(page, projectName, browserVersion)
  } catch {
    return {
      browserVersion,
      devicePixelRatio: 0,
      projectName,
      userAgent: "unavailable",
    }
  }
}

async function waitForPipelineReady(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const validationState = window.__bagItValidationState
      const e2eState = window.__bagItE2EState

      if (!validationState || !e2eState) {
        return false
      }

      if (validationState.error !== null) {
        return "error"
      }

      return (
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
    undefined,
    { timeout: 12 * 60 * 1000 },
  )

  const appError = await page.evaluate(() => window.__bagItValidationState?.error ?? null)

  if (appError) {
    throw new Error(String(appError))
  }
}

async function downloadSession(
  page: import("@playwright/test").Page,
  downloadedSessionPath: string,
): Promise<any> {
  fs.mkdirSync(path.dirname(downloadedSessionPath), { recursive: true })

  const downloadPromise = page.waitForEvent("download")

  await page.getByRole("button", { name: "Download" }).click()

  const download = await downloadPromise

  await download.saveAs(downloadedSessionPath)

  return JSON.parse(fs.readFileSync(downloadedSessionPath, "utf8"))
}

function createTimestampSlug(): string {
  return new Date().toISOString().replaceAll(":", "").replaceAll(".", "-")
}
