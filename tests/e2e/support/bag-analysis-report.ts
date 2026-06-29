import fs from "node:fs"
import path from "node:path"
import type { Page } from "@playwright/test"
import {
  CALLOUT_REGION_TOLERANCE_PX,
  PART_REGION_TOLERANCE_PX,
  compareAlphaMasks,
  createQuantityMultiset,
  decodeBase64Bytes,
  formatPartColor,
  formatMultiset,
  formatRegion,
  matchBagAnalysisStructure,
  normalizeActualPartColor,
  partColorsMatch,
  quantityKey,
  readActualPartRegion,
  readActualQuantityLabelRegion,
  readCalloutRegion,
  regionsMutuallyWithinTolerance,
  type ActualDetectionResult,
  type CalloutPair,
  type ExpectedPartRow,
  type PartPair,
  type Region,
} from "./bag-analysis-comparison"
import type {
  BagAnalysisFixtureCase,
  LoadedBagAnalysisFixture,
} from "./bag-analysis-fixtures"

export interface BagAnalysisReportSummary {
  browserInfo?: BrowserRunInfo
  caseId: string
  error?: string
  issueCount: number
  manualSource: string
  relativePath: string
}

export interface BrowserRunInfo {
  browserVersion: string
  devicePixelRatio: number
  projectName: string
  userAgent: string
}

interface BagAnalysisCaseReport {
  browserInfo: BrowserRunInfo
  caseId: string
  downloadedSessionPath: string
  issues: BagAnalysisDifference[]
  manualSource: string
  relativePath: string
}

interface BagAnalysisDifference {
  actualQuantity?: string
  actualRegion?: Region
  calloutOrdinal?: number
  expectedQuantity?: string
  expectedRegion?: Region
  fullCallout?: ImageTriplet
  id: string
  metrics?: Record<string, boolean | number | string | null>
  pageNumber?: number
  quantity?: string
  reason: string
  regionDrift?: string
  rowOrdinal?: number
  source: string
  visual?: ImageTriplet
}

interface PendingDifference extends BagAnalysisDifference {
  actualCalloutRegion?: Region
  actualMask?: SerializedAlphaMask
  expectedCalloutRegion?: Region
  expectedMask?: SerializedAlphaMask
  showAlphaLayer?: boolean
}

interface SerializedAlphaMask {
  data?: Record<string, number> | number[]
  dataBase64?: string
  encoding?: string
  height: number
  width: number
}

interface ImageTriplet {
  actual?: string
  diff?: string
  expected?: string
}

interface RenderedImageTriplets {
  fullCallout?: DataUrlTriplet
  id: string
  visual?: DataUrlTriplet
}

interface DataUrlTriplet {
  actual?: string
  diff?: string
  expected?: string
}

const IMAGE_CHUNK_SIZE = 25

export async function createBagAnalysisCaseReport({
  actualResult,
  browserInfo,
  downloadedSessionPath,
  fixture,
  outputRoot,
  page,
}: {
  actualResult: ActualDetectionResult
  browserInfo: BrowserRunInfo
  downloadedSessionPath: string
  fixture: LoadedBagAnalysisFixture
  outputRoot: string
  page: Page
}): Promise<BagAnalysisReportSummary> {
  const caseId = fixture.fixtureCase.id
  const manualSource = readManualSource(fixture)
  const caseDirectory = path.join(outputRoot, caseId)
  const imagesDirectory = path.join(caseDirectory, "images")

  fs.mkdirSync(imagesDirectory, { recursive: true })

  const structuralMatch = matchBagAnalysisStructure({
    actualResult,
    expectedCallouts: fixture.callouts,
    expectedParts: fixture.parts,
  })
  const pendingIssues = buildPendingDifferences({
    actualResult,
    fixtureCase: fixture.fixtureCase,
    manualSource,
    structuralMatch,
    fixture,
  })

  for (let start = 0; start < pendingIssues.length; start += IMAGE_CHUNK_SIZE) {
    const chunk = pendingIssues.slice(start, start + IMAGE_CHUNK_SIZE)
    const rendered = await page.evaluate(
      renderBagAnalysisDifferenceImagesInBrowser,
      attachAlphaMasksToChunk({
        chunk,
        fixture,
        structuralMatch,
      }),
    )
    writeRenderedImages({
      imagesDirectory,
      issuesById: new Map(pendingIssues.map((issue) => [issue.id, issue])),
      rendered,
    })
  }

  const report: BagAnalysisCaseReport = {
    browserInfo,
    caseId,
    downloadedSessionPath,
    issues: pendingIssues,
    manualSource,
    relativePath: `${caseId}/index.html`,
  }

  writeCaseHtml(outputRoot, report)

  return {
    browserInfo,
    caseId,
    issueCount: pendingIssues.length,
    manualSource,
    relativePath: report.relativePath,
  }
}

export function writeBagAnalysisReportIndex(
  outputRoot: string,
  summaries: BagAnalysisReportSummary[],
): string {
  const indexPath = path.join(outputRoot, "index.html")
  const totalIssues = summaries.reduce((sum, summary) => sum + summary.issueCount, 0)
  const generatedAt = new Date().toISOString()
  const sortedSummaries = [...summaries].sort(compareReportSummariesByIssueCount)

  fs.mkdirSync(outputRoot, { recursive: true })
  fs.writeFileSync(
    indexPath,
    htmlDocument({
      body: `
        <h1>Bag Analysis Fixture Difference Report</h1>
        <p class="meta">Generated ${escapeHtml(generatedAt)}. Total issues: ${totalIssues}.</p>
        <table>
          <thead>
            <tr>
              <th>Case</th>
              <th>Manual source</th>
              <th>Browser</th>
              <th><button type="button" class="sort-button" data-sort-issues>Issues ↑</button></th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${sortedSummaries.map((summary) => `
              <tr data-issue-count="${summary.issueCount}" data-case-id="${escapeAttribute(summary.caseId)}">
                <td><a href="${escapeAttribute(summary.relativePath)}">${escapeHtml(summary.caseId)}</a></td>
                <td>${escapeHtml(summary.manualSource)}</td>
                <td>${escapeHtml(formatBrowserInfo(summary.browserInfo))}</td>
                <td class="number">${summary.issueCount}</td>
                <td>${summary.error ? `<span class="error">${escapeHtml(summary.error)}</span>` : "reported"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        ${renderReportIndexSortScript()}
      `,
      title: "Bag Analysis Fixture Difference Report",
    }),
  )

  return indexPath
}

function compareReportSummariesByIssueCount(
  left: BagAnalysisReportSummary,
  right: BagAnalysisReportSummary,
): number {
  return left.issueCount - right.issueCount || left.caseId.localeCompare(right.caseId)
}

export function writeBagAnalysisErrorReport({
  browserInfo,
  caseId,
  error,
  fixture,
  outputRoot,
}: {
  browserInfo?: BrowserRunInfo
  caseId: string
  error: unknown
  fixture: LoadedBagAnalysisFixture
  outputRoot: string
}): BagAnalysisReportSummary {
  const manualSource = readManualSource(fixture)
  const relativePath = `${caseId}/index.html`
  const caseDirectory = path.join(outputRoot, caseId)

  fs.mkdirSync(caseDirectory, { recursive: true })
  fs.writeFileSync(
    path.join(caseDirectory, "index.html"),
    htmlDocument({
      body: `
        <h1>${escapeHtml(caseId)}</h1>
        <p class="meta">${escapeHtml(manualSource)}</p>
        <p class="meta">Browser: ${escapeHtml(formatBrowserInfo(browserInfo))}</p>
        <section class="issue">
          <h2>Run failure</h2>
          <p>${escapeHtml(readErrorMessage(error))}</p>
        </section>
      `,
      title: `${caseId} fixture report`,
    }),
  )

  return {
    browserInfo,
    caseId,
    error: readErrorMessage(error),
    issueCount: 1,
    manualSource,
    relativePath,
  }
}

function buildPendingDifferences({
  actualResult,
  fixture,
  fixtureCase,
  manualSource,
  structuralMatch,
}: {
  actualResult: ActualDetectionResult
  fixture: LoadedBagAnalysisFixture
  fixtureCase: BagAnalysisFixtureCase
  manualSource: string
  structuralMatch: ReturnType<typeof matchBagAnalysisStructure>
}): PendingDifference[] {
  const issues: PendingDifference[] = []
  const actualCallouts = actualResult.callouts ?? []
  const calloutPairsByExpectedOrdinal = new Map(
    structuralMatch.calloutPairs.map((pair) => [pair.expected.ordinal, pair]),
  )
  const matchedExpectedCalloutOrdinals = new Set(
    structuralMatch.calloutPairs.map((pair) => pair.expected.ordinal),
  )
  const matchedActualCalloutIndexes = new Set(
    structuralMatch.calloutPairs.map((pair) => pair.actualIndex),
  )
  const expectedPartsByCallout = new Map(
    fixture.parts.callouts.map((callout) => [callout.ordinal, callout.parts]),
  )
  const partPairsByExpectedKey = new Map(
    structuralMatch.partPairs.map((pair) => [partExpectedKey(pair), pair]),
  )
  const partPairsByActualKey = new Map(
    structuralMatch.partPairs.map((pair) => [partActualKey(pair), pair]),
  )

  if (actualCallouts.length !== fixture.callouts.callouts.length) {
    issues.push(createIssue({
      fixtureCase,
      manualSource,
      reason: `callout count mismatch: expected ${fixture.callouts.callouts.length}, got ${actualCallouts.length}`,
      type: "callout-count",
    }))
  }

  for (const expected of fixture.callouts.callouts) {
    const pair = calloutPairsByExpectedOrdinal.get(expected.ordinal)

    if (!pair) {
      issues.push(createIssue({
        expectedCalloutRegion: expected.crop.region,
        expectedRegion: expected.crop.region,
        fixtureCase,
        manualSource,
        pageNumber: expected.pageNumber,
        reason: "missing expected callout in current output",
        type: "missing-callout",
        calloutOrdinal: expected.ordinal,
      }))
      continue
    }

    const actualRegion = readCalloutRegion(pair.actual)

    if (!actualRegion) {
      issues.push(createIssue({
        expectedCalloutRegion: expected.crop.region,
        expectedRegion: expected.crop.region,
        fixtureCase,
        manualSource,
        pageNumber: expected.pageNumber,
        reason: "actual callout has no crop.region",
        type: "callout-region-missing",
        calloutOrdinal: expected.ordinal,
      }))
    } else if (!regionsMutuallyWithinTolerance(expected.crop.region, actualRegion, CALLOUT_REGION_TOLERANCE_PX)) {
      issues.push(createIssue({
        actualCalloutRegion: actualRegion,
        actualRegion,
        expectedCalloutRegion: expected.crop.region,
        expectedRegion: expected.crop.region,
        fixtureCase,
        manualSource,
        pageNumber: expected.pageNumber,
        reason: `callout region drift exceeds ${CALLOUT_REGION_TOLERANCE_PX}px per edge`,
        regionDrift: formatRegionDrift(expected.crop.region, actualRegion),
        type: "callout-region",
        calloutOrdinal: expected.ordinal,
      }))
    }

    collectPartDifferences({
      expectedRows: expectedPartsByCallout.get(expected.ordinal) ?? [],
      fixtureCase,
      issues,
      manualSource,
      pair,
      partPairsByActualKey,
      partPairsByExpectedKey,
    })
  }

  for (const [actualIndex, actual] of actualCallouts.entries()) {
    if (matchedActualCalloutIndexes.has(actualIndex)) {
      continue
    }

    const actualRegion = readCalloutRegion(actual) ?? undefined
    issues.push(createIssue({
      actualCalloutRegion: actualRegion,
      actualRegion,
      fixtureCase,
      manualSource,
      pageNumber: actual.pageNumber,
      reason: "extra current callout not matched by fixture",
      type: "extra-callout",
    }))
  }

  return issues

  function collectPartDifferences({
    expectedRows,
    fixtureCase,
    issues,
    manualSource,
    pair,
    partPairsByActualKey,
    partPairsByExpectedKey,
  }: {
    expectedRows: ExpectedPartRow[]
    fixtureCase: BagAnalysisFixtureCase
    issues: PendingDifference[]
    manualSource: string
    pair: CalloutPair
    partPairsByActualKey: Map<string, PartPair>
    partPairsByExpectedKey: Map<string, PartPair>
  }): void {
    const actualRows = Array.isArray(pair.actual.partItems) ? pair.actual.partItems : []
    const actualCalloutRegion = readCalloutRegion(pair.actual) ?? undefined
    const expectedCalloutRegion = pair.expected.crop.region

    if (actualRows.length !== expectedRows.length) {
      issues.push(createIssue({
        actualCalloutRegion,
        expectedCalloutRegion,
        fixtureCase,
        manualSource,
        pageNumber: pair.expected.pageNumber,
        reason: `part row count mismatch: expected ${expectedRows.length}, got ${actualRows.length}`,
        type: "part-row-count",
        calloutOrdinal: pair.expected.ordinal,
      }))
    }

    const expectedQuantityMultiset = createQuantityMultiset(expectedRows)
    const actualQuantityMultiset = createQuantityMultiset(actualRows)

    if (formatMultiset(expectedQuantityMultiset) !== formatMultiset(actualQuantityMultiset)) {
      issues.push(createIssue({
        actualCalloutRegion,
        actualQuantity: formatMultiset(actualQuantityMultiset),
        expectedCalloutRegion,
        expectedQuantity: formatMultiset(expectedQuantityMultiset),
        fixtureCase,
        manualSource,
        pageNumber: pair.expected.pageNumber,
        reason: "quantity multiset mismatch",
        type: "quantity-multiset",
        calloutOrdinal: pair.expected.ordinal,
      }))
    }

    for (const expected of expectedRows) {
      const partPair = partPairsByExpectedKey.get(`${pair.expected.ordinal}:${expected.ordinal}`)

      if (!partPair) {
        issues.push(createIssue({
          expectedCalloutRegion,
          expectedQuantity: quantityKey(expected.quantity),
          expectedRegion: expected.partRegion,
          fixtureCase,
          manualSource,
          pageNumber: pair.expected.pageNumber,
          quantity: expected.quantity.text,
          reason: "missing expected part row in current output",
          rowOrdinal: expected.ordinal,
          showAlphaLayer: true,
          type: "missing-part-row",
          calloutOrdinal: pair.expected.ordinal,
        }))
        continue
      }

      const actualPartRegion = readActualPartRegion(partPair.actual)
      const actualQuantityLabelRegion = readActualQuantityLabelRegion(partPair.actual)

      if (!actualPartRegion) {
        issues.push(createIssue({
          actualCalloutRegion,
          expectedCalloutRegion,
          expectedRegion: expected.partRegion,
          fixtureCase,
          manualSource,
          pageNumber: pair.expected.pageNumber,
          quantity: expected.quantity.text,
          reason: "actual part row has no crop region",
          rowOrdinal: expected.ordinal,
          showAlphaLayer: true,
          type: "part-region-missing",
          calloutOrdinal: pair.expected.ordinal,
        }))
      } else if (!regionsMutuallyWithinTolerance(expected.partRegion, actualPartRegion, PART_REGION_TOLERANCE_PX)) {
        issues.push(createIssue({
          actualCalloutRegion,
          actualRegion: actualPartRegion,
          expectedCalloutRegion,
          expectedRegion: expected.partRegion,
          fixtureCase,
          manualSource,
          pageNumber: pair.expected.pageNumber,
          quantity: expected.quantity.text,
          reason: `part region drift exceeds ${PART_REGION_TOLERANCE_PX}px per edge`,
          regionDrift: formatRegionDrift(expected.partRegion, actualPartRegion),
          rowOrdinal: expected.ordinal,
          showAlphaLayer: true,
          type: "part-region",
          calloutOrdinal: pair.expected.ordinal,
        }))
      } else {
        const actualMask = readActualAlphaMask(partPair.actual)

        if (actualMask) {
          const alphaMetrics = compareAlphaMasks({
            actualMask,
            actualRegion: actualPartRegion,
            expectedMask: {
              data: decodeBase64Bytes(expected.alphaMask.dataBase64),
              height: expected.alphaMask.height,
              width: expected.alphaMask.width,
            },
            expectedRegion: expected.partRegion,
            tolerance: PART_REGION_TOLERANCE_PX,
          })

          if (!alphaMetrics.passed) {
            issues.push(createIssue({
              actualCalloutRegion,
              actualMask: partPair.actual.partImage?.alphaMask,
              actualRegion: actualPartRegion,
              expectedCalloutRegion,
              expectedMask: expected.alphaMask,
              expectedRegion: expected.partRegion,
              fixtureCase,
              manualSource,
              metrics: { ...alphaMetrics },
              pageNumber: pair.expected.pageNumber,
              quantity: expected.quantity.text,
              reason: "part alpha mask visual coverage changed",
              regionDrift: formatRegionDrift(expected.partRegion, actualPartRegion),
              rowOrdinal: expected.ordinal,
              showAlphaLayer: true,
              type: "part-alpha",
              calloutOrdinal: pair.expected.ordinal,
            }))
          }
        }
      }

      if (!actualQuantityLabelRegion) {
        issues.push(createIssue({
          actualCalloutRegion,
          actualRegion: actualPartRegion ?? undefined,
          expectedCalloutRegion,
          expectedRegion: expected.quantityLabelRegion,
          fixtureCase,
          manualSource,
          pageNumber: pair.expected.pageNumber,
          quantity: expected.quantity.text,
          reason: "actual quantity label has no region",
          rowOrdinal: expected.ordinal,
          type: "quantity-label-region-missing",
          calloutOrdinal: pair.expected.ordinal,
        }))
      } else if (!regionsMutuallyWithinTolerance(
        expected.quantityLabelRegion,
        actualQuantityLabelRegion,
        PART_REGION_TOLERANCE_PX,
      )) {
        issues.push(createIssue({
          actualCalloutRegion,
          actualRegion: actualQuantityLabelRegion,
          expectedCalloutRegion,
          expectedRegion: expected.quantityLabelRegion,
          fixtureCase,
          manualSource,
          pageNumber: pair.expected.pageNumber,
          quantity: expected.quantity.text,
          reason: `quantity label region drift exceeds ${PART_REGION_TOLERANCE_PX}px per edge`,
          regionDrift: formatRegionDrift(expected.quantityLabelRegion, actualQuantityLabelRegion),
          rowOrdinal: expected.ordinal,
          type: "quantity-label-region",
          calloutOrdinal: pair.expected.ordinal,
        }))
      }

      if (!partColorsMatch(expected.color, partPair.actual.detectedColor)) {
        issues.push(createIssue({
          actualCalloutRegion,
          actualRegion: actualPartRegion ?? undefined,
          expectedCalloutRegion,
          expectedRegion: expected.partRegion,
          fixtureCase,
          manualSource,
          pageNumber: pair.expected.pageNumber,
          quantity: expected.quantity.text,
          reason: `color mismatch: expected ${formatPartColor(expected.color)}, got ${
            formatPartColor(normalizeActualPartColor(partPair.actual.detectedColor))
          }`,
          rowOrdinal: expected.ordinal,
          showAlphaLayer: true,
          type: "part-color",
          calloutOrdinal: pair.expected.ordinal,
        }))
      }
    }

    for (const [actualIndex, actual] of actualRows.entries()) {
      if (partPairsByActualKey.has(`${pair.actualIndex}:${actualIndex}`)) {
        continue
      }

      const actualPartRegion = readActualPartRegion(actual) ?? undefined
      issues.push(createIssue({
        actualCalloutRegion,
        actualMask: actual.partImage?.alphaMask,
        actualQuantity: quantityKey(actual.quantity),
        actualRegion: actualPartRegion,
        expectedCalloutRegion,
        fixtureCase,
        manualSource,
        pageNumber: pair.expected.pageNumber,
        quantity: actual.quantity?.text,
        reason: "extra current part row not matched by fixture",
        showAlphaLayer: true,
        type: "extra-part-row",
        calloutOrdinal: pair.expected.ordinal,
      }))
    }
  }
}

function attachAlphaMasksToChunk({
  chunk,
  fixture,
  structuralMatch,
}: {
  chunk: PendingDifference[]
  fixture: LoadedBagAnalysisFixture
  structuralMatch: ReturnType<typeof matchBagAnalysisStructure>
}): PendingDifference[] {
  const expectedRowsByKey = new Map<string, ExpectedPartRow>()
  const partPairsByExpectedKey = new Map<string, PartPair>()

  for (const callout of fixture.parts.callouts) {
    for (const row of callout.parts) {
      expectedRowsByKey.set(`${callout.ordinal}:${row.ordinal}`, row)
    }
  }

  for (const pair of structuralMatch.partPairs) {
    partPairsByExpectedKey.set(partExpectedKey(pair), pair)
  }

  return chunk.map((issue) => {
    if (!issue.showAlphaLayer || issue.calloutOrdinal === undefined || issue.rowOrdinal === undefined) {
      return issue
    }

    const key = `${issue.calloutOrdinal}:${issue.rowOrdinal}`
    const expectedRow = expectedRowsByKey.get(key)
    const partPair = partPairsByExpectedKey.get(key)

    return {
      ...issue,
      actualMask: issue.actualMask ?? partPair?.actual.partImage?.alphaMask,
      expectedMask: issue.expectedMask ?? expectedRow?.alphaMask,
    }
  })
}

function createIssue({
  actualCalloutRegion,
  actualMask,
  actualQuantity,
  actualRegion,
  calloutOrdinal,
  expectedCalloutRegion,
  expectedMask,
  expectedQuantity,
  expectedRegion,
  fixtureCase,
  manualSource,
  metrics,
  pageNumber,
  quantity,
  reason,
  regionDrift,
  rowOrdinal,
  showAlphaLayer,
  type,
}: Omit<Partial<PendingDifference>, "id" | "reason" | "source"> & {
  fixtureCase: BagAnalysisFixtureCase
  manualSource: string
  reason: string
  type: string
}): PendingDifference {
  const id = [
    fixtureCase.id,
    type,
    pageNumber ? `p${pageNumber}` : "p-all",
    calloutOrdinal === undefined ? null : `c${calloutOrdinal}`,
    rowOrdinal === undefined ? null : `r${rowOrdinal}`,
    stableHash([
      reason,
      expectedRegion ? formatRegion(expectedRegion) : "",
      actualRegion ? formatRegion(actualRegion) : "",
    ].join("|")),
  ].filter(Boolean).join("-")

  return {
    actualCalloutRegion,
    actualMask,
    actualQuantity,
    actualRegion,
    calloutOrdinal,
    expectedCalloutRegion,
    expectedMask,
    expectedQuantity,
    expectedRegion,
    id,
    metrics,
    pageNumber,
    quantity,
    reason,
    regionDrift,
    rowOrdinal,
    showAlphaLayer,
    source: manualSource,
  }
}

function partExpectedKey(pair: PartPair): string {
  return `${pair.expectedCalloutOrdinal}:${pair.expected.ordinal}`
}

function partActualKey(pair: PartPair): string {
  return `${pair.actualCalloutIndex}:${pair.actualIndex}`
}

function writeRenderedImages({
  imagesDirectory,
  issuesById,
  rendered,
}: {
  imagesDirectory: string
  issuesById: Map<string, PendingDifference>
  rendered: RenderedImageTriplets[]
}): void {
  for (const imageSet of rendered) {
    const issue = issuesById.get(imageSet.id)

    if (!issue) {
      continue
    }

    issue.fullCallout = writeTriplet(imagesDirectory, imageSet.id, "callout", imageSet.fullCallout)
    issue.visual = writeTriplet(imagesDirectory, imageSet.id, "visual", imageSet.visual)
  }
}

function writeTriplet(
  imagesDirectory: string,
  issueId: string,
  group: string,
  triplet: DataUrlTriplet | undefined,
): ImageTriplet | undefined {
  if (!triplet) {
    return undefined
  }

  const written: ImageTriplet = {}

  for (const kind of ["expected", "diff", "actual"] as const) {
    const dataUrl = triplet[kind]

    if (!dataUrl) {
      continue
    }

    const filename = `${safeFileName(issueId)}-${group}-${kind}.png`
    fs.writeFileSync(path.join(imagesDirectory, filename), dataUrlToBuffer(dataUrl))
    written[kind] = `images/${filename}`
  }

  return Object.keys(written).length > 0 ? written : undefined
}

function writeCaseHtml(outputRoot: string, report: BagAnalysisCaseReport): void {
  const caseDirectory = path.join(outputRoot, report.caseId)

  fs.mkdirSync(caseDirectory, { recursive: true })
  fs.writeFileSync(
    path.join(caseDirectory, "index.html"),
    htmlDocument({
      body: `
        <p><a href="../index.html">Back to report index</a></p>
        <h1>${escapeHtml(report.caseId)}</h1>
        <p class="meta">Manual source: ${escapeHtml(report.manualSource)}</p>
        <p class="meta">Browser: ${escapeHtml(formatBrowserInfo(report.browserInfo))}</p>
        <p class="meta">User agent: ${escapeHtml(report.browserInfo.userAgent)}</p>
        <p class="meta">Device pixel ratio: ${report.browserInfo.devicePixelRatio}</p>
        <p class="meta">Downloaded session: ${escapeHtml(path.basename(report.downloadedSessionPath))}</p>
        <p class="meta">Issues: ${report.issues.length}</p>
        ${report.issues.map(renderIssueHtml).join("")}
      `,
      title: `${report.caseId} fixture differences`,
    }),
  )
}

function renderIssueHtml(issue: BagAnalysisDifference): string {
  return `
    <section class="issue" id="${escapeAttribute(issue.id)}">
      <h2>${escapeHtml(issue.reason)}</h2>
      <dl>
        <dt>Manual source</dt><dd>${escapeHtml(issue.source)}</dd>
        <dt>Page</dt><dd>${issue.pageNumber ?? "all"}</dd>
        <dt>Callout</dt><dd>${issue.calloutOrdinal ?? "n/a"}</dd>
        <dt>Row</dt><dd>${issue.rowOrdinal ?? "n/a"}</dd>
        <dt>Quantity</dt><dd>${escapeHtml(issue.quantity ?? issue.expectedQuantity ?? issue.actualQuantity ?? "n/a")}</dd>
        <dt>Expected region</dt><dd>${issue.expectedRegion ? escapeHtml(formatRegion(issue.expectedRegion)) : "n/a"}</dd>
        <dt>Current region</dt><dd>${issue.actualRegion ? escapeHtml(formatRegion(issue.actualRegion)) : "n/a"}</dd>
        <dt>Drift</dt><dd>${escapeHtml(issue.regionDrift ?? "n/a")}</dd>
      </dl>
      ${issue.metrics ? `<pre>${escapeHtml(JSON.stringify(issue.metrics, null, 2))}</pre>` : ""}
      ${renderImageTriplet("Full callout preview", issue.fullCallout)}
      ${renderImageTriplet("Visual difference (alpha: saved blue, current red)", issue.visual)}
    </section>
  `
}

function renderImageTriplet(title: string, triplet: ImageTriplet | undefined): string {
  if (!triplet) {
    return ""
  }

  return `
    <h3>${escapeHtml(title)}</h3>
    <div class="triplet">
      ${renderImageColumn("Saved fixture", triplet.expected)}
      ${renderImageColumn("Diff", triplet.diff)}
      ${renderImageColumn("Current output", triplet.actual)}
    </div>
  `
}

function renderImageColumn(label: string, source: string | undefined): string {
  return `
    <figure>
      <figcaption>${escapeHtml(label)}</figcaption>
      ${source ? `<img src="${escapeAttribute(source)}" alt="${escapeAttribute(label)}">` : `<div class="missing">missing</div>`}
    </figure>
  `
}

function formatBrowserInfo(browserInfo: BrowserRunInfo | undefined): string {
  if (!browserInfo) {
    return "unknown"
  }

  return `${browserInfo.projectName} ${browserInfo.browserVersion}`
}

function renderReportIndexSortScript(): string {
  return `
        <script>
          (() => {
            const button = document.querySelector("[data-sort-issues]");
            const tbody = document.querySelector("tbody");

            if (!button || !tbody) {
              return;
            }

            let ascending = true;
            button.addEventListener("click", () => {
              ascending = !ascending;
              const rows = Array.from(tbody.querySelectorAll("tr"));
              rows.sort((left, right) => {
                const leftIssueCount = Number(left.dataset.issueCount ?? "0");
                const rightIssueCount = Number(right.dataset.issueCount ?? "0");
                const issueDifference = ascending
                  ? leftIssueCount - rightIssueCount
                  : rightIssueCount - leftIssueCount;

                if (issueDifference !== 0) {
                  return issueDifference;
                }

                return (left.dataset.caseId ?? "").localeCompare(right.dataset.caseId ?? "");
              });

              button.textContent = ascending ? "Issues ↑" : "Issues ↓";
              tbody.replaceChildren(...rows);
            });
          })();
        </script>
  `
}

function htmlDocument({ body, title }: { body: string; title: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { color: #111827; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.4; margin: 24px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
    .sort-button { appearance: none; background: none; border: 0; color: inherit; cursor: pointer; font: inherit; font-weight: 700; padding: 0; }
    .sort-button:hover { color: #1d4ed8; text-decoration: underline; }
    .number { font-variant-numeric: tabular-nums; text-align: right; }
    .meta { color: #4b5563; }
    .error { color: #b91c1c; }
    .issue { border: 1px solid #d1d5db; margin: 18px 0; padding: 16px; }
    .issue h2 { font-size: 18px; margin: 0 0 10px; }
    .issue h3 { font-size: 15px; margin: 16px 0 8px; }
    dl { display: grid; grid-template-columns: 160px 1fr; margin: 0; row-gap: 4px; }
    dt { color: #4b5563; font-weight: 700; }
    dd { margin: 0; }
    pre { background: #f9fafb; border: 1px solid #e5e7eb; overflow: auto; padding: 10px; }
    .triplet { align-items: start; display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    figure { margin: 0; min-width: 0; }
    figcaption { color: #4b5563; font-size: 12px; font-weight: 700; margin-bottom: 4px; }
    img { background: white; border: 1px solid #d1d5db; image-rendering: auto; max-height: 520px; max-width: 100%; object-fit: contain; }
    .missing { align-items: center; background: #f3f4f6; border: 1px solid #d1d5db; color: #6b7280; display: flex; height: 120px; justify-content: center; }
  </style>
</head>
<body>
${body}
</body>
</html>
`
}

function readManualSource(fixture: LoadedBagAnalysisFixture): string {
  const inputSession = JSON.parse(fs.readFileSync(fixture.inputSessionPath, "utf8"))

  return inputSession.manual?.fileName ?? inputSession.metadata?.fileName ?? fixture.fixtureCase.id
}

function formatRegionDrift(expected: Region, actual: Region): string {
  return [
    `left=${actual.x - expected.x}`,
    `top=${actual.y - expected.y}`,
    `right=${(actual.x + actual.width) - (expected.x + expected.width)}`,
    `bottom=${(actual.y + actual.height) - (expected.y + expected.height)}`,
  ].join(" ")
}

function readActualAlphaMask(part: PartPair["actual"]): {
  data: Uint8Array
  height: number
  width: number
} | null {
  const alphaMask = part.partImage?.alphaMask

  if (!alphaMask) {
    return null
  }

  const expectedLength = alphaMask.width * alphaMask.height
  const data = new Uint8Array(expectedLength)

  for (let index = 0; index < expectedLength; index += 1) {
    data[index] = readActualAlphaValue(alphaMask.data, index)
  }

  return {
    data,
    height: alphaMask.height,
    width: alphaMask.width,
  }
}

function readActualAlphaValue(data: Record<string, number> | number[], index: number): number {
  return Array.isArray(data) ? data[index] ?? 0 : data[String(index)] ?? 0
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const marker = "base64,"
  const markerIndex = dataUrl.indexOf(marker)

  if (markerIndex < 0) {
    return Buffer.from("")
  }

  return Buffer.from(dataUrl.slice(markerIndex + marker.length), "base64")
}

function stableHash(value: string): string {
  let hash = 5381

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(index)
    hash >>>= 0
  }

  return hash.toString(36)
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 180)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;")
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function renderBagAnalysisDifferenceImagesInBrowser(
  issues: PendingDifference[],
): Promise<RenderedImageTriplets[]> {
  type BrowserPageAsset = {
    baseHeight: number
    baseWidth: number
    naturalHeight: number
    naturalWidth: number
    pageNumber: number
    url: string
  }

  const state = window.__bagItE2EState
  const assetsByPageNumber = new Map<number, BrowserPageAsset>(
    (state?.pageAssets ?? []).map((asset: BrowserPageAsset) => [asset.pageNumber, asset]),
  )
  const loadedImages = new Map<number, HTMLImageElement>()
  const rendered: RenderedImageTriplets[] = []

  for (const issue of issues) {
    const pageNumber = issue.pageNumber
    const asset = pageNumber ? assetsByPageNumber.get(pageNumber) : undefined

    if (!asset) {
      rendered.push({ id: issue.id })
      continue
    }

    const pageImage = await loadPageImage(asset)

    rendered.push({
      fullCallout: renderRegionTriplet({
        actualRegion: issue.actualCalloutRegion,
        asset,
        expectedRegion: issue.expectedCalloutRegion,
        image: pageImage,
      }),
      id: issue.id,
      visual: renderVisualTriplet({
        actualMask: decodeMask(issue.actualMask),
        actualRegion: issue.actualRegion,
        asset,
        expectedMask: decodeMask(issue.expectedMask),
        expectedRegion: issue.expectedRegion,
        image: pageImage,
      }),
    })
  }

  return rendered

  async function loadPageImage(asset: BrowserPageAsset): Promise<HTMLImageElement> {
    const cached = loadedImages.get(asset.pageNumber)

    if (cached) {
      return cached
    }

    const image = new Image()
    image.decoding = "async"
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error(`Failed to load page asset ${asset.pageNumber}`))
    })

    image.src = asset.url
    await loaded
    loadedImages.set(asset.pageNumber, image)
    return image
  }

  function renderRegionTriplet({
    actualRegion,
    asset,
    expectedRegion,
    image,
  }: {
    actualRegion?: Region
    asset: BrowserPageAsset
    expectedRegion?: Region
    image: HTMLImageElement
  }): DataUrlTriplet | undefined {
    if (!actualRegion && !expectedRegion) {
      return undefined
    }

    return {
      actual: actualRegion ? drawRegion(asset, image, actualRegion).toDataURL("image/png") : undefined,
      diff: renderRegionDiff(asset, image, expectedRegion, actualRegion),
      expected: expectedRegion ? drawRegion(asset, image, expectedRegion).toDataURL("image/png") : undefined,
    }
  }

  function renderVisualTriplet({
    actualMask,
    actualRegion,
    asset,
    expectedMask,
    expectedRegion,
    image,
  }: {
    actualMask?: BrowserMask
    actualRegion?: Region
    asset: BrowserPageAsset
    expectedMask?: BrowserMask
    expectedRegion?: Region
    image: HTMLImageElement
  }): DataUrlTriplet | undefined {
    if (!actualRegion && !expectedRegion) {
      return undefined
    }

    return {
      actual: actualRegion
        ? drawRegionWithOptionalMask(asset, image, actualRegion, actualMask, "rgba(220, 38, 38, 0.42)")
          .toDataURL("image/png")
        : undefined,
      diff: expectedMask || actualMask
        ? renderMaskDiff(expectedRegion, expectedMask, actualRegion, actualMask)
        : renderRegionDiff(asset, image, expectedRegion, actualRegion),
      expected: expectedRegion
        ? drawRegionWithOptionalMask(asset, image, expectedRegion, expectedMask, "rgba(37, 99, 235, 0.42)")
          .toDataURL("image/png")
        : undefined,
    }
  }

  function drawRegion(asset: BrowserPageAsset, image: HTMLImageElement, region: Region): HTMLCanvasElement {
    const scaleX = asset.naturalWidth / asset.baseWidth
    const scaleY = asset.naturalHeight / asset.baseHeight
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(region.width))
    canvas.height = Math.max(1, Math.round(region.height))
    const context = canvas.getContext("2d")

    if (!context) {
      return canvas
    }

    context.drawImage(
      image,
      Math.round(region.x * scaleX),
      Math.round(region.y * scaleY),
      Math.max(1, Math.round(region.width * scaleX)),
      Math.max(1, Math.round(region.height * scaleY)),
      0,
      0,
      canvas.width,
      canvas.height,
    )

    return canvas
  }

  function drawRegionWithOptionalMask(
    asset: BrowserPageAsset,
    image: HTMLImageElement,
    region: Region,
    mask: BrowserMask | undefined,
    maskColor: string,
  ): HTMLCanvasElement {
    const canvas = drawRegion(asset, image, region)

    if (!mask) {
      return canvas
    }

    const context = canvas.getContext("2d")

    if (!context) {
      return canvas
    }

    context.fillStyle = maskColor
    paintMask(context, mask, region, region)
    context.strokeStyle = maskColor
    context.lineWidth = 1
    context.strokeRect(0.5, 0.5, Math.max(1, canvas.width - 1), Math.max(1, canvas.height - 1))

    return canvas
  }

  function renderRegionDiff(
    asset: BrowserPageAsset,
    image: HTMLImageElement,
    expectedRegion?: Region,
    actualRegion?: Region,
  ): string | undefined {
    if (!expectedRegion && !actualRegion) {
      return undefined
    }

    const union = unionRegion(expectedRegion, actualRegion)
    const canvas = drawRegion(asset, image, union)
    const context = canvas.getContext("2d")

    if (!context) {
      return canvas.toDataURL("image/png")
    }

    context.fillStyle = "rgba(255, 255, 255, 0.35)"
    context.fillRect(0, 0, canvas.width, canvas.height)

    if (expectedRegion) {
      strokeRegion(context, expectedRegion, union, "#2563eb")
    }

    if (actualRegion) {
      strokeRegion(context, actualRegion, union, "#dc2626")
    }

    return canvas.toDataURL("image/png")
  }

  function renderMaskDiff(
    expectedRegion?: Region,
    expectedMask?: BrowserMask,
    actualRegion?: Region,
    actualMask?: BrowserMask,
  ): string | undefined {
    if ((!expectedRegion || !expectedMask) && (!actualRegion || !actualMask)) {
      return renderRegionOnlyDiff(expectedRegion, actualRegion)
    }

    const union = unionRegion(expectedRegion, actualRegion)
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.ceil(union.width))
    canvas.height = Math.max(1, Math.ceil(union.height))
    const context = canvas.getContext("2d")

    if (!context) {
      return canvas.toDataURL("image/png")
    }

    context.fillStyle = "white"
    context.fillRect(0, 0, canvas.width, canvas.height)

    if (expectedRegion && expectedMask) {
      context.fillStyle = "rgba(37, 99, 235, 0.65)"
      paintMask(context, expectedMask, expectedRegion, union)
    }

    if (actualRegion && actualMask) {
      context.fillStyle = "rgba(220, 38, 38, 0.65)"
      paintMask(context, actualMask, actualRegion, union)
    }

    return canvas.toDataURL("image/png")
  }

  function renderRegionOnlyDiff(expectedRegion?: Region, actualRegion?: Region): string | undefined {
    if (!expectedRegion && !actualRegion) {
      return undefined
    }

    const union = unionRegion(expectedRegion, actualRegion)
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.ceil(union.width))
    canvas.height = Math.max(1, Math.ceil(union.height))
    const context = canvas.getContext("2d")

    if (!context) {
      return canvas.toDataURL("image/png")
    }

    context.fillStyle = "white"
    context.fillRect(0, 0, canvas.width, canvas.height)

    if (expectedRegion) {
      strokeRegion(context, expectedRegion, union, "#2563eb")
    }

    if (actualRegion) {
      strokeRegion(context, actualRegion, union, "#dc2626")
    }

    return canvas.toDataURL("image/png")
  }

  function strokeRegion(context: CanvasRenderingContext2D, region: Region, union: Region, color: string): void {
    context.strokeStyle = color
    context.lineWidth = 2
    context.strokeRect(
      Math.round(region.x - union.x) + 1,
      Math.round(region.y - union.y) + 1,
      Math.max(1, Math.round(region.width)) - 2,
      Math.max(1, Math.round(region.height)) - 2,
    )
  }

  function paintMask(
    context: CanvasRenderingContext2D,
    mask: BrowserMask,
    region: Region,
    union: Region,
  ): void {
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        if ((mask.data[y * mask.width + x] ?? 0) <= 15) {
          continue
        }

        context.fillRect(Math.round(region.x + x - union.x), Math.round(region.y + y - union.y), 1, 1)
      }
    }
  }

  function unionRegion(left?: Region, right?: Region): Region {
    const regions = [left, right].filter((region): region is Region => Boolean(region))
    const minX = Math.min(...regions.map((region) => region.x))
    const minY = Math.min(...regions.map((region) => region.y))
    const maxX = Math.max(...regions.map((region) => region.x + region.width))
    const maxY = Math.max(...regions.map((region) => region.y + region.height))

    return {
      height: Math.max(1, maxY - minY),
      width: Math.max(1, maxX - minX),
      x: minX,
      y: minY,
    }
  }

  interface BrowserMask {
    data: Uint8Array
    height: number
    width: number
  }

  function decodeMask(mask: SerializedAlphaMask | undefined): BrowserMask | undefined {
    if (!mask) {
      return undefined
    }

    if (typeof mask.dataBase64 === "string") {
      const binary = atob(mask.dataBase64)
      const data = new Uint8Array(binary.length)

      for (let index = 0; index < binary.length; index += 1) {
        data[index] = binary.charCodeAt(index)
      }

      return {
        data,
        height: mask.height,
        width: mask.width,
      }
    }

    const expectedLength = mask.width * mask.height
    const data = new Uint8Array(expectedLength)

    for (let index = 0; index < expectedLength; index += 1) {
      data[index] = readAlphaValue(mask.data, index)
    }

    return {
      data,
      height: mask.height,
      width: mask.width,
    }
  }

  function readAlphaValue(data: Record<string, number> | number[] | undefined, index: number): number {
    if (!data) {
      return 0
    }

    return Array.isArray(data) ? data[index] ?? 0 : data[String(index)] ?? 0
  }
}
