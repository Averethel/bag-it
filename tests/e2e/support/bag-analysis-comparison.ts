import { Buffer } from "node:buffer"
import type { Page } from "@playwright/test"

export interface Region {
  x: number
  y: number
  width: number
  height: number
}

export interface AlphaMaskPassCriteria {
  maxActualExtraOpaquePixels: number
  minExpectedCoverage: number
}

export const ALPHA_MASK_PASS_CRITERIA: AlphaMaskPassCriteria = {
  maxActualExtraOpaquePixels: 12,
  minExpectedCoverage: 0.95,
}

export interface ExpectedCallout {
  ordinal: number
  pageNumber: number
  crop: {
    region: Region
  }
}

export interface ExpectedPartRow {
  ordinal: number
  quantity: {
    text: string
    value: number | null
  }
  color: ExpectedPartColor
  partRegion: Region
  quantityLabelRegion: Region
  alphaMask: {
    width: number
    height: number
    encoding: "uint8-base64"
    dataBase64: string
  }
}

export interface ExpectedPartColor {
  family: string
  manualClassId: string | null
  manualClassTrusted: boolean
  name: string
  rawManualClassId: string | null
  status: string
  swatchHex: string
}

export interface ExpectedPartsCallout {
  ordinal: number
  pageNumber: number
  parts: ExpectedPartRow[]
}

export interface ExpectedCalloutsFixture {
  schemaVersion: number
  caseId: string
  callouts: ExpectedCallout[]
}

export interface ExpectedPartsFixture {
  schemaVersion: number
  caseId: string
  callouts: ExpectedPartsCallout[]
}

export interface ActualPartRow {
  id?: string
  indexOnCallout?: number
  partRegion?: Region
  partCrop?: {
    region?: Region
  }
  partImage?: {
    region?: Region
    alphaMask?: {
      width: number
      height: number
      data: Record<string, number> | number[]
    }
  }
  quantityLabel?: {
    region?: Region
    crop?: {
      region?: Region
    }
  }
  quantity?: {
    text?: string
    value?: number | null
  }
  detectedColor?: {
    family?: string
    manualClassId?: string | null
    manualClassTrusted?: boolean
    name?: string
    rawManualClassId?: string | null
    status?: string
    swatchHex?: string | null
  }
}

export interface ActualCallout {
  id?: string
  pageNumber: number
  crop?: {
    region?: Region
  }
  partItems?: ActualPartRow[]
}

export interface ActualDetectionResult {
  callouts: ActualCallout[]
}

export interface StructuralMatch {
  calloutPairs: CalloutPair[]
  failures: string[]
  partPairs: PartPair[]
}

export interface CalloutPair {
  actual: ActualCallout
  actualIndex: number
  expected: ExpectedCallout
}

export interface PartPair {
  actual: ActualPartRow
  actualIndex: number
  actualCalloutIndex: number
  expected: ExpectedPartRow
  expectedCalloutOrdinal: number
}

export interface VisualComparisonFailure {
  actualPng?: string
  calloutOrdinal?: number
  diffPng?: string
  expectedPng?: string
  message: string
  metrics?: Record<string, number | string | null>
  pageNumber?: number
  quantity?: string
  rowOrdinal?: number
}

interface BrowserVisualCalloutPair {
  actualRegion: Region | null
  expected: ExpectedCallout
}

interface BrowserVisualPartPair {
  actualMask: SerializableAlphaMask | null
  actualRegion: Region | null
  expected: ExpectedPartRow
  expectedCalloutOrdinal: number
  pageNumber: number | null
}

interface SerializableAlphaMask {
  dataBase64: string
  height: number
  width: number
}

interface AlphaMaskComparatorSource {
  alphaMaskComparisonPasses: string
  compareAlphaMaskPixels: string
}

export const CALLOUT_REGION_TOLERANCE_PX = 8
export const PART_REGION_TOLERANCE_PX = 6
export const PART_SWATCH_CHANNEL_TOLERANCE = 2

export function matchBagAnalysisStructure({
  actualResult,
  expectedCallouts,
  expectedParts,
}: {
  actualResult: ActualDetectionResult
  expectedCallouts: ExpectedCalloutsFixture
  expectedParts: ExpectedPartsFixture
}): StructuralMatch {
  const failures: string[] = []
  const actualCallouts = actualResult.callouts ?? []

  if (actualCallouts.length !== expectedCallouts.callouts.length) {
    failures.push(
      `callout count mismatch: expected ${expectedCallouts.callouts.length}, got ${actualCallouts.length}`,
    )
  }

  const calloutPairs = matchCalloutsByPageAndRegion(expectedCallouts.callouts, actualCallouts)

  for (const pair of calloutPairs) {
    const actualRegion = readCalloutRegion(pair.actual)

    if (!actualRegion) {
      failures.push(`callout ${pair.expected.ordinal}: actual callout has no crop.region`)
      continue
    }

    if (!regionsMutuallyWithinTolerance(pair.expected.crop.region, actualRegion, CALLOUT_REGION_TOLERANCE_PX)) {
      failures.push(
        `callout ${pair.expected.ordinal}: region drift exceeds ${CALLOUT_REGION_TOLERANCE_PX}px per edge; expected ${formatRegion(
          pair.expected.crop.region,
        )}, got ${formatRegion(actualRegion)}`,
      )
    }
  }

  const partPairs: PartPair[] = []
  const partsByCallout = new Map(expectedParts.callouts.map((callout) => [callout.ordinal, callout]))

  for (const calloutPair of calloutPairs) {
    const expectedPartCallout = partsByCallout.get(calloutPair.expected.ordinal)
    const expectedRows = expectedPartCallout?.parts ?? []
    const actualRows = Array.isArray(calloutPair.actual.partItems) ? calloutPair.actual.partItems : []

    if (actualRows.length !== expectedRows.length) {
      failures.push(
        `callout ${calloutPair.expected.ordinal}: part row count mismatch: expected ${expectedRows.length}, got ${actualRows.length}`,
      )
    }

    const expectedQuantityMultiset = createQuantityMultiset(expectedRows)
    const actualQuantityMultiset = createQuantityMultiset(actualRows)

    if (!sameMultiset(expectedQuantityMultiset, actualQuantityMultiset)) {
      failures.push(
        `callout ${calloutPair.expected.ordinal}: quantity multiset mismatch: expected ${formatMultiset(
          expectedQuantityMultiset,
        )}, got ${formatMultiset(actualQuantityMultiset)}`,
      )
    }

    for (const partPair of matchPartsByQuantityAndRegion(
      expectedRows,
      actualRows,
      calloutPair.expected.ordinal,
      calloutPair.actualIndex,
    )) {
      const actualPartRegion = readActualPartRegion(partPair.actual)
      const actualQuantityLabelRegion = readActualQuantityLabelRegion(partPair.actual)

      if (!actualPartRegion) {
        failures.push(
          `callout ${partPair.expectedCalloutOrdinal} row ${partPair.expected.ordinal}: actual part has no crop region`,
        )
      } else if (!regionsMutuallyWithinTolerance(partPair.expected.partRegion, actualPartRegion, PART_REGION_TOLERANCE_PX)) {
        const alphaEquivalent = partAlphaMaskComparisonPasses(partPair.expected, partPair.actual, actualPartRegion)

        if (!alphaEquivalent) {
          failures.push(
            `callout ${partPair.expectedCalloutOrdinal} row ${partPair.expected.ordinal}: part region drift exceeds ${PART_REGION_TOLERANCE_PX}px per edge; expected ${formatRegion(
              partPair.expected.partRegion,
            )}, got ${formatRegion(actualPartRegion)}`,
          )
        }
      }

      if (!actualQuantityLabelRegion) {
        failures.push(
          `callout ${partPair.expectedCalloutOrdinal} row ${partPair.expected.ordinal}: actual quantity label has no region`,
        )
      } else if (!regionsMutuallyWithinTolerance(
        partPair.expected.quantityLabelRegion,
        actualQuantityLabelRegion,
        PART_REGION_TOLERANCE_PX,
      )) {
        failures.push(
          `callout ${partPair.expectedCalloutOrdinal} row ${partPair.expected.ordinal}: quantity label region drift exceeds ${PART_REGION_TOLERANCE_PX}px per edge; expected ${formatRegion(
            partPair.expected.quantityLabelRegion,
          )}, got ${formatRegion(actualQuantityLabelRegion)}`,
        )
      }

      if (!partColorsMatch(partPair.expected.color, partPair.actual.detectedColor)) {
        failures.push(
          `callout ${partPair.expectedCalloutOrdinal} row ${partPair.expected.ordinal}: color mismatch: expected ${formatPartColor(
            partPair.expected.color,
          )}, got ${formatPartColor(normalizeActualPartColor(partPair.actual.detectedColor))}`,
        )
      }

      partPairs.push(partPair)
    }
  }

  return {
    calloutPairs,
    failures,
    partPairs,
  }
}

function partAlphaMaskComparisonPasses(
  expected: ExpectedPartRow,
  actual: ActualPartRow,
  actualRegion: Region,
): boolean {
  const actualMask = readActualAlphaMask(actual)

  if (!actualMask) {
    return false
  }

  return compareAlphaMasks({
    actualMask,
    actualRegion,
    expectedMask: {
      data: decodeBase64Bytes(expected.alphaMask.dataBase64),
      height: expected.alphaMask.height,
      width: expected.alphaMask.width,
    },
    expectedRegion: expected.partRegion,
    tolerance: PART_REGION_TOLERANCE_PX,
  }).passed
}

function readActualAlphaMask(part: ActualPartRow): DecodedAlphaMask | null {
  const alphaMask = part.partImage?.alphaMask

  if (!alphaMask) {
    return null
  }

  const expectedLength = alphaMask.width * alphaMask.height
  const data = new Uint8Array(expectedLength)

  for (let index = 0; index < expectedLength; index += 1) {
    data[index] = readSerializableAlphaMaskValue(alphaMask.data, index)
  }

  return {
    data,
    height: alphaMask.height,
    width: alphaMask.width,
  }
}

export async function compareBagAnalysisVisuals(
  page: Page,
  {
    calloutPairs,
    partPairs,
  }: {
    calloutPairs: CalloutPair[]
    partPairs: PartPair[]
  },
): Promise<VisualComparisonFailure[]> {
  const pageByCalloutOrdinal = new Map(
    calloutPairs.map((pair) => [pair.expected.ordinal, pair.expected.pageNumber]),
  )
  const browserCalloutPairs: BrowserVisualCalloutPair[] = calloutPairs.map((pair) => ({
    actualRegion: readCalloutRegion(pair.actual),
    expected: pair.expected,
  }))
  const browserPartPairs: BrowserVisualPartPair[] = partPairs.map((pair) => ({
    actualMask: serializeActualAlphaMask(pair.actual),
    actualRegion: readActualPartRegion(pair.actual),
    expected: pair.expected,
    expectedCalloutOrdinal: pair.expectedCalloutOrdinal,
    pageNumber: pageByCalloutOrdinal.get(pair.expectedCalloutOrdinal) ?? null,
  }))

  return page.evaluate(compareBagAnalysisVisualsInBrowser, {
    alphaMaskComparatorSource: createAlphaMaskComparatorSource(),
    alphaMaskPassCriteria: ALPHA_MASK_PASS_CRITERIA,
    calloutRegionTolerancePx: CALLOUT_REGION_TOLERANCE_PX,
    calloutPairs: browserCalloutPairs,
    partRegionTolerancePx: PART_REGION_TOLERANCE_PX,
    partPairs: browserPartPairs,
  })
}

function createAlphaMaskComparatorSource(): AlphaMaskComparatorSource {
  return {
    alphaMaskComparisonPasses: alphaMaskComparisonPasses.toString(),
    compareAlphaMaskPixels: compareAlphaMaskPixels.toString(),
  }
}

function serializeActualAlphaMask(part: ActualPartRow): SerializableAlphaMask | null {
  const alphaMask = part.partImage?.alphaMask

  if (!alphaMask) {
    return null
  }

  const expectedLength = alphaMask.width * alphaMask.height
  const data = new Uint8Array(expectedLength)

  for (let index = 0; index < expectedLength; index += 1) {
    data[index] = readSerializableAlphaMaskValue(alphaMask.data, index)
  }

  return {
    dataBase64: Buffer.from(data).toString("base64"),
    height: alphaMask.height,
    width: alphaMask.width,
  }
}

function readSerializableAlphaMaskValue(data: Record<string, number> | number[], index: number): number {
  return Array.isArray(data) ? data[index] ?? 0 : data[String(index)] ?? 0
}

export function regionsMutuallyWithinTolerance(expected: Region, actual: Region, tolerance: number): boolean {
  return (
    actual.x >= expected.x - tolerance &&
    actual.y >= expected.y - tolerance &&
    actual.x + actual.width <= expected.x + expected.width + tolerance &&
    actual.y + actual.height <= expected.y + expected.height + tolerance &&
    expected.x >= actual.x - tolerance &&
    expected.y >= actual.y - tolerance &&
    expected.x + expected.width <= actual.x + actual.width + tolerance &&
    expected.y + expected.height <= actual.y + actual.height + tolerance
  )
}

export function createQuantityMultiset(rows: Array<ExpectedPartRow | ActualPartRow>): Map<string, number> {
  const multiset = new Map<string, number>()

  for (const row of rows) {
    const key = quantityKey(row.quantity)
    multiset.set(key, (multiset.get(key) ?? 0) + 1)
  }

  return multiset
}

export function quantityKey(quantity: { text?: string; value?: number | null } | undefined): string {
  return `${typeof quantity?.text === "string" ? quantity.text.trim() : ""}::${quantity?.value ?? "null"}`
}

function partColorsMatch(
  expected: ExpectedPartColor,
  actual: ActualPartRow["detectedColor"],
): boolean {
  const comparableActual = normalizeActualPartColor(actual)

  return (
    expected.name === comparableActual.name &&
    expected.family === comparableActual.family &&
    expected.status === comparableActual.status &&
    swatchHexesMatch(expected.swatchHex, comparableActual.swatchHex) &&
    expected.manualClassTrusted === comparableActual.manualClassTrusted &&
    manualClassIdentityMatches(expected, comparableActual)
  )
}

function swatchHexesMatch(expected: string, actual: string): boolean {
  if (expected === actual) {
    return true
  }

  const expectedRgb = parseSwatchHex(expected)
  const actualRgb = parseSwatchHex(actual)

  return Boolean(
    expectedRgb &&
      actualRgb &&
      Math.abs(expectedRgb.r - actualRgb.r) <= PART_SWATCH_CHANNEL_TOLERANCE &&
      Math.abs(expectedRgb.g - actualRgb.g) <= PART_SWATCH_CHANNEL_TOLERANCE &&
      Math.abs(expectedRgb.b - actualRgb.b) <= PART_SWATCH_CHANNEL_TOLERANCE,
  )
}

function parseSwatchHex(value: string): { b: number; g: number; r: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value)

  if (!match) {
    return null
  }

  const packed = Number.parseInt(match[1], 16)

  return {
    b: packed & 0xff,
    g: (packed >> 8) & 0xff,
    r: (packed >> 16) & 0xff,
  }
}

function manualClassIdentityMatches(
  expected: ExpectedPartColor,
  actual: ExpectedPartColor,
): boolean {
  if (!expected.manualClassTrusted && !actual.manualClassTrusted) {
    return true
  }

  return expected.manualClassId === actual.manualClassId &&
    expected.rawManualClassId === actual.rawManualClassId
}

function normalizeActualPartColor(color: ActualPartRow["detectedColor"]): ExpectedPartColor {
  return {
    name: typeof color?.name === "string" ? color.name : "missing",
    family: typeof color?.family === "string" ? color.family : "missing",
    status: typeof color?.status === "string" ? color.status : "missing",
    swatchHex: typeof color?.swatchHex === "string" ? color.swatchHex : "missing",
    manualClassId: typeof color?.manualClassId === "string" ? color.manualClassId : null,
    manualClassTrusted: color?.manualClassTrusted === true,
    rawManualClassId: typeof color?.rawManualClassId === "string" ? color.rawManualClassId : null,
  }
}

function formatPartColor(color: ExpectedPartColor): string {
  return [
    color.name,
    color.family,
    color.status,
    color.swatchHex,
    color.manualClassId ?? "no-manual-class",
    color.manualClassTrusted ? "trusted" : "untrusted",
    color.rawManualClassId ?? "no-raw-class",
  ].join("/")
}

export function compareAlphaMasks({
  actualMask,
  actualRegion,
  expectedMask,
  expectedRegion,
  passCriteria = ALPHA_MASK_PASS_CRITERIA,
  tolerance,
}: {
  actualMask: DecodedAlphaMask
  actualRegion: Region
  expectedMask: DecodedAlphaMask
  expectedRegion: Region
  passCriteria?: AlphaMaskPassCriteria
  tolerance: number
}): AlphaMaskComparison {
  return compareAlphaMaskPixels({
    actualMask,
    actualRegion,
    expectedMask,
    expectedRegion,
    passCriteria,
    tolerance,
  })
}

export function compareAlphaMaskPixels({
  actualMask,
  actualRegion,
  expectedMask,
  expectedRegion,
  passCriteria,
  tolerance,
}: {
  actualMask: DecodedAlphaMask
  actualRegion: Region
  expectedMask: DecodedAlphaMask
  expectedRegion: Region
  passCriteria: AlphaMaskPassCriteria
  tolerance: number
}): AlphaMaskComparison {
  const expectedOpaquePoints = readOpaquePoints(expectedMask, expectedRegion)
  const actualOpaquePoints = readOpaquePoints(actualMask, actualRegion)
  const actualOpaqueSet = new Set(actualOpaquePoints.map(pointKey))
  const expectedOpaqueSet = new Set(expectedOpaquePoints.map(pointKey))
  let expectedCovered = 0
  let actualCovered = 0
  let exactOverlap = 0

  for (const point of expectedOpaquePoints) {
    if (actualOpaqueSet.has(pointKey(point))) {
      exactOverlap += 1
    }

    if (hasOpaqueNeighbor(point, actualOpaqueSet, tolerance)) {
      expectedCovered += 1
    }
  }

  for (const point of actualOpaquePoints) {
    if (hasOpaqueNeighbor(point, expectedOpaqueSet, tolerance)) {
      actualCovered += 1
    }
  }

  const expectedCoverage = expectedOpaquePoints.length === 0
    ? 1
    : expectedCovered / expectedOpaquePoints.length
  const actualExtraOpaquePixels = actualOpaquePoints.length - actualCovered
  const actualExtraRatio = actualOpaquePoints.length === 0
    ? 0
    : actualExtraOpaquePixels / actualOpaquePoints.length
  const exactOverlapRatio = expectedOpaquePoints.length === 0
    ? 1
    : exactOverlap / expectedOpaquePoints.length

  return {
    actualExtraOpaquePixels,
    actualExtraRatio,
    actualOpaque: actualOpaquePoints.length,
    exactOverlapRatio,
    expectedCoverage,
    expectedOpaque: expectedOpaquePoints.length,
    passed: alphaMaskComparisonPasses(
      { actualExtraOpaquePixels, expectedCoverage },
      passCriteria,
    ),
  }

  function readOpaquePoints(mask: DecodedAlphaMask, region: Region) {
    const points: { x: number; y: number }[] = []

    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        if ((mask.data[y * mask.width + x] ?? 0) <= 15) {
          continue
        }

        points.push({
          x: Math.round(region.x + x),
          y: Math.round(region.y + y),
        })
      }
    }

    return points
  }

  function pointKey(point: { x: number; y: number }): string {
    return `${point.x}:${point.y}`
  }

  function hasOpaqueNeighbor(
    point: { x: number; y: number },
    opaquePoints: Set<string>,
    tolerance: number,
  ): boolean {
    for (let dy = -tolerance; dy <= tolerance; dy += 1) {
      for (let dx = -tolerance; dx <= tolerance; dx += 1) {
        if (opaquePoints.has(`${point.x + dx}:${point.y + dy}`)) {
          return true
        }
      }
    }

    return false
  }
}

export function alphaMaskComparisonPasses(
  metrics: Pick<AlphaMaskComparison, "actualExtraOpaquePixels" | "expectedCoverage">,
  criteria: AlphaMaskPassCriteria,
): boolean {
  return metrics.expectedCoverage >= criteria.minExpectedCoverage &&
    metrics.actualExtraOpaquePixels <= criteria.maxActualExtraOpaquePixels
}

export interface DecodedAlphaMask {
  data: Uint8Array
  height: number
  width: number
}

export interface AlphaMaskComparison {
  actualExtraOpaquePixels: number
  actualExtraRatio: number
  actualOpaque: number
  exactOverlapRatio: number
  expectedCoverage: number
  expectedOpaque: number
  passed: boolean
}

export function decodeBase64Bytes(dataBase64: string): Uint8Array {
  return new Uint8Array(Buffer.from(dataBase64, "base64"))
}

function matchCalloutsByPageAndRegion(
  expectedCallouts: ExpectedCallout[],
  actualCallouts: ActualCallout[],
): CalloutPair[] {
  const availableActualIndexes = new Set(actualCallouts.map((_callout, index) => index))
  const pairs: CalloutPair[] = []

  for (const expected of expectedCallouts) {
    let bestIndex: number | null = null
    let bestScore = Number.POSITIVE_INFINITY

    for (const actualIndex of availableActualIndexes) {
      const actual = actualCallouts[actualIndex]
      const actualRegion = readCalloutRegion(actual)

      if (!actualRegion || actual.pageNumber !== expected.pageNumber) {
        continue
      }

      const score = regionDistance(expected.crop.region, actualRegion)

      if (score < bestScore) {
        bestScore = score
        bestIndex = actualIndex
      }
    }

    if (bestIndex === null) {
      continue
    }

    availableActualIndexes.delete(bestIndex)
    pairs.push({
      actual: actualCallouts[bestIndex],
      actualIndex: bestIndex,
      expected,
    })
  }

  return pairs
}

function matchPartsByQuantityAndRegion(
  expectedRows: ExpectedPartRow[],
  actualRows: ActualPartRow[],
  expectedCalloutOrdinal: number,
  actualCalloutIndex: number,
): PartPair[] {
  const availableActualIndexes = new Set(actualRows.map((_row, index) => index))
  const pairs: PartPair[] = []

  for (const expected of expectedRows) {
    let bestIndex: number | null = null
    let bestScore = Number.POSITIVE_INFINITY
    const expectedQuantityKey = quantityKey(expected.quantity)

    for (const actualIndex of availableActualIndexes) {
      const actual = actualRows[actualIndex]

      if (quantityKey(actual.quantity) !== expectedQuantityKey) {
        continue
      }

      const actualPartRegion = readActualPartRegion(actual)

      if (!actualPartRegion) {
        continue
      }

      const score = regionDistance(expected.partRegion, actualPartRegion)

      if (score < bestScore) {
        bestScore = score
        bestIndex = actualIndex
      }
    }

    if (bestIndex === null) {
      continue
    }

    availableActualIndexes.delete(bestIndex)
    pairs.push({
      actual: actualRows[bestIndex],
      actualIndex: bestIndex,
      actualCalloutIndex,
      expected,
      expectedCalloutOrdinal,
    })
  }

  return pairs
}

export function readCalloutRegion(callout: ActualCallout): Region | null {
  return isRegion(callout.crop?.region) ? callout.crop.region : null
}

export function readActualPartRegion(part: ActualPartRow): Region | null {
  return isRegion(part.partImage?.region)
    ? part.partImage.region
    : isRegion(part.partCrop?.region)
      ? part.partCrop.region
      : isRegion(part.partRegion)
        ? part.partRegion
        : null
}

export function readActualQuantityLabelRegion(part: ActualPartRow): Region | null {
  return isRegion(part.quantityLabel?.region)
    ? part.quantityLabel.region
    : isRegion(part.quantityLabel?.crop?.region)
      ? part.quantityLabel.crop.region
      : null
}

function isRegion(value: unknown): value is Region {
  return (
    typeof value === "object" &&
    value !== null &&
    Number.isFinite((value as Region).x) &&
    Number.isFinite((value as Region).y) &&
    Number.isFinite((value as Region).width) &&
    Number.isFinite((value as Region).height)
  )
}

function sameMultiset(left: Map<string, number>, right: Map<string, number>): boolean {
  if (left.size !== right.size) {
    return false
  }

  for (const [key, count] of left) {
    if (right.get(key) !== count) {
      return false
    }
  }

  return true
}

export function formatMultiset(multiset: Map<string, number>): string {
  return [...multiset.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key} x${count}`)
    .join(", ")
}

export function formatRegion(region: Region): string {
  return `x=${region.x} y=${region.y} width=${region.width} height=${region.height}`
}

export function regionDistance(left: Region, right: Region): number {
  return (
    Math.abs(left.x - right.x) +
    Math.abs(left.y - right.y) +
    Math.abs((left.x + left.width) - (right.x + right.width)) +
    Math.abs((left.y + left.height) - (right.y + right.height))
  )
}

async function compareBagAnalysisVisualsInBrowser({
  alphaMaskComparatorSource,
  alphaMaskPassCriteria,
  calloutRegionTolerancePx,
  calloutPairs,
  partRegionTolerancePx,
  partPairs,
}: {
  alphaMaskComparatorSource: AlphaMaskComparatorSource
  alphaMaskPassCriteria: AlphaMaskPassCriteria
  calloutRegionTolerancePx: number
  calloutPairs: BrowserVisualCalloutPair[]
  partRegionTolerancePx: number
  partPairs: BrowserVisualPartPair[]
}): Promise<VisualComparisonFailure[]> {
  type BrowserRegion = Region
  type BrowserImage = {
    canvas: HTMLCanvasElement
    data: ImageData
    region: BrowserRegion
  }
  type BrowserPageAsset = {
    baseHeight: number
    baseWidth: number
    naturalHeight: number
    naturalWidth: number
    pageNumber: number
    url: string
  }

  const calloutTolerance = calloutRegionTolerancePx
  const partTolerance = partRegionTolerancePx
  const failures: VisualComparisonFailure[] = []
  const state = window.__bagItE2EState
  const compareAlphaMaskPixelsInBrowser = restoreAlphaMaskPixelComparator(alphaMaskComparatorSource)
  const assetsByPageNumber = new Map<number, BrowserPageAsset>(
    (state?.pageAssets ?? []).map((asset: BrowserPageAsset) => [asset.pageNumber, asset]),
  )
  const loadedImages = new Map<number, HTMLImageElement>()

  for (const pair of calloutPairs) {
    const actualRegion = pair.actualRegion
    const expectedRegion = pair.expected.crop.region
    const pageAsset = assetsByPageNumber.get(pair.expected.pageNumber)

    if (!actualRegion || !pageAsset) {
      failures.push({
        calloutOrdinal: pair.expected.ordinal,
        message: `callout ${pair.expected.ordinal}: missing actual region or page preview asset`,
        pageNumber: pair.expected.pageNumber,
      })
      continue
    }

    const pageImage = await loadPageImage(pageAsset, loadedImages)
    const actualImage = drawRegion(pageAsset, pageImage, actualRegion)
    const expectedImage = drawRegion(pageAsset, pageImage, expectedRegion)
    const actualInk = countInkPixels(actualImage)
    const actualExtraInk = countInkOutsideExpandedRegion(actualImage, expectedRegion, calloutTolerance)
    const expectedInk = countInkPixels(expectedImage)
    const expectedMissingInk = countInkOutsideExpandedRegion(expectedImage, actualRegion, calloutTolerance)
    const actualExtraInkRatio = actualInk === 0 ? 0 : actualExtraInk / actualInk
    const expectedMissingInkRatio = expectedInk === 0 ? 0 : expectedMissingInk / expectedInk

    if (actualExtraInkRatio > 0.01 || expectedMissingInkRatio > 0.005) {
      failures.push({
        actualPng: actualImage.canvas.toDataURL("image/png"),
        calloutOrdinal: pair.expected.ordinal,
        diffPng: renderCalloutDiff(actualImage, expectedRegion, calloutTolerance),
        expectedPng: expectedImage.canvas.toDataURL("image/png"),
        message: `callout ${pair.expected.ordinal}: visual crop changed`,
        metrics: {
          actualExtraInkRatio,
          expectedMissingInkRatio,
          actualInk,
          expectedInk,
        },
        pageNumber: pair.expected.pageNumber,
      })
    }
  }

  for (const pair of partPairs) {
    const actualRegion = pair.actualRegion
    const actualMask = decodeActualAlphaMask(pair.actualMask)
    const pageNumber = pair.pageNumber
    const pageAsset = pageNumber ? assetsByPageNumber.get(pageNumber) : null

    if (!actualRegion || !actualMask || !pageAsset || !pageNumber) {
      failures.push({
        calloutOrdinal: pair.expectedCalloutOrdinal,
        message: `callout ${pair.expectedCalloutOrdinal} row ${pair.expected.ordinal}: missing actual part mask or page preview asset`,
        quantity: pair.expected.quantity.text,
        rowOrdinal: pair.expected.ordinal,
      })
      continue
    }

    const expectedMask = decodeExpectedAlphaMask(pair.expected.alphaMask)
    const alphaMetrics = compareAlphaMaskPixelsInBrowser({
      actualMask,
      actualRegion,
      expectedMask,
      expectedRegion: pair.expected.partRegion,
      passCriteria: alphaMaskPassCriteria,
      tolerance: partTolerance,
    })

    if (!alphaMetrics.passed) {
      const pageImage = await loadPageImage(pageAsset, loadedImages)
      const actualImage = drawRegion(pageAsset, pageImage, actualRegion)
      const expectedImage = drawRegion(pageAsset, pageImage, pair.expected.partRegion)

      failures.push({
        actualPng: actualImage.canvas.toDataURL("image/png"),
        calloutOrdinal: pair.expectedCalloutOrdinal,
        diffPng: renderPartMaskDiff(pair.expected.partRegion, expectedMask, actualRegion, actualMask),
        expectedPng: expectedImage.canvas.toDataURL("image/png"),
        message: `callout ${pair.expectedCalloutOrdinal} row ${pair.expected.ordinal}: masked part visual changed`,
        metrics: {
          actualExtraRatio: alphaMetrics.actualExtraRatio,
          actualExtraOpaquePixels: alphaMetrics.actualExtraOpaquePixels,
          actualOpaque: alphaMetrics.actualOpaque,
          exactOverlapRatio: alphaMetrics.exactOverlapRatio,
          expectedCoverage: alphaMetrics.expectedCoverage,
          expectedOpaque: alphaMetrics.expectedOpaque,
          pageNumber,
          regionDrift: regionDrift(pair.expected.partRegion, actualRegion),
        },
        pageNumber,
        quantity: pair.expected.quantity.text,
        rowOrdinal: pair.expected.ordinal,
      })
    }
  }

  return failures

  async function loadPageImage(
    asset: BrowserPageAsset,
    imageCache: Map<number, HTMLImageElement>,
  ): Promise<HTMLImageElement> {
    const cached = imageCache.get(asset.pageNumber)

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
    imageCache.set(asset.pageNumber, image)
    return image
  }

  function drawRegion(
    asset: BrowserPageAsset,
    image: HTMLImageElement,
    region: BrowserRegion,
  ): BrowserImage {
    const scaleX = asset.naturalWidth / asset.baseWidth
    const scaleY = asset.naturalHeight / asset.baseHeight
    const canvas = document.createElement("canvas")
    const width = Math.max(1, Math.round(region.width))
    const height = Math.max(1, Math.round(region.height))
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d", { willReadFrequently: true })

    if (!context) {
      throw new Error("Canvas 2D context unavailable")
    }

    context.drawImage(
      image,
      Math.round(region.x * scaleX),
      Math.round(region.y * scaleY),
      Math.max(1, Math.round(region.width * scaleX)),
      Math.max(1, Math.round(region.height * scaleY)),
      0,
      0,
      width,
      height,
    )

    return {
      canvas,
      data: context.getImageData(0, 0, width, height),
      region,
    }
  }

  function countInkPixels(image: BrowserImage): number {
    let count = 0

    for (let y = 1; y < image.data.height - 1; y += 1) {
      for (let x = 1; x < image.data.width - 1; x += 1) {
        if (isInkPixel(image.data, x, y)) {
          count += 1
        }
      }
    }

    return count
  }

  function countInkOutsideExpandedRegion(
    image: BrowserImage,
    referenceRegion: BrowserRegion,
    tolerance: number,
  ): number {
    let count = 0

    for (let y = 1; y < image.data.height - 1; y += 1) {
      for (let x = 1; x < image.data.width - 1; x += 1) {
        if (!isInkPixel(image.data, x, y)) {
          continue
        }

        const pageX = image.region.x + x
        const pageY = image.region.y + y

        if (
          pageX < referenceRegion.x - tolerance ||
          pageY < referenceRegion.y - tolerance ||
          pageX > referenceRegion.x + referenceRegion.width + tolerance ||
          pageY > referenceRegion.y + referenceRegion.height + tolerance
        ) {
          count += 1
        }
      }
    }

    return count
  }

  function isInkPixel(imageData: ImageData, x: number, y: number): boolean {
    const center = pixelAt(imageData, x, y)
    const left = pixelAt(imageData, x - 1, y)
    const right = pixelAt(imageData, x + 1, y)
    const top = pixelAt(imageData, x, y - 1)
    const bottom = pixelAt(imageData, x, y + 1)
    const gradient = Math.max(
      colorDistance(center, left),
      colorDistance(center, right),
      colorDistance(center, top),
      colorDistance(center, bottom),
    )
    const luma = (center.r * 0.2126) + (center.g * 0.7152) + (center.b * 0.0722)

    return gradient > 24 || luma < 230
  }

  function pixelAt(imageData: ImageData, x: number, y: number): { b: number; g: number; r: number } {
    const offset = ((y * imageData.width) + x) * 4

    return {
      r: imageData.data[offset] ?? 0,
      g: imageData.data[offset + 1] ?? 0,
      b: imageData.data[offset + 2] ?? 0,
    }
  }

  function colorDistance(
    left: { b: number; g: number; r: number },
    right: { b: number; g: number; r: number },
  ): number {
    return Math.abs(left.r - right.r) + Math.abs(left.g - right.g) + Math.abs(left.b - right.b)
  }

  function renderCalloutDiff(
    actualImage: BrowserImage,
    expectedRegion: BrowserRegion,
    tolerance: number,
  ): string {
    const canvas = document.createElement("canvas")
    canvas.width = actualImage.canvas.width
    canvas.height = actualImage.canvas.height
    const context = canvas.getContext("2d", { willReadFrequently: true })

    if (!context) {
      return actualImage.canvas.toDataURL("image/png")
    }

    context.drawImage(actualImage.canvas, 0, 0)
    const diff = context.getImageData(0, 0, canvas.width, canvas.height)

    for (let y = 1; y < diff.height - 1; y += 1) {
      for (let x = 1; x < diff.width - 1; x += 1) {
        const pageX = actualImage.region.x + x
        const pageY = actualImage.region.y + y

        if (
          isInkPixel(actualImage.data, x, y) &&
          (
            pageX < expectedRegion.x - tolerance ||
            pageY < expectedRegion.y - tolerance ||
            pageX > expectedRegion.x + expectedRegion.width + tolerance ||
            pageY > expectedRegion.y + expectedRegion.height + tolerance
          )
        ) {
          const offset = ((y * diff.width) + x) * 4
          diff.data[offset] = 255
          diff.data[offset + 1] = 0
          diff.data[offset + 2] = 0
          diff.data[offset + 3] = 255
        }
      }
    }

    context.putImageData(diff, 0, 0)
    return canvas.toDataURL("image/png")
  }

  function decodeExpectedAlphaMask(mask: ExpectedPartRow["alphaMask"]): DecodedAlphaMask {
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

  function decodeActualAlphaMask(alphaMask: SerializableAlphaMask | null): DecodedAlphaMask | null {
    if (!alphaMask) {
      return null
    }

    const binary = atob(alphaMask.dataBase64)
    const data = new Uint8Array(binary.length)

    for (let index = 0; index < binary.length; index += 1) {
      data[index] = binary.charCodeAt(index)
    }

    return {
      data,
      height: alphaMask.height,
      width: alphaMask.width,
    }
  }

  function renderPartMaskDiff(
    expectedRegion: BrowserRegion,
    expectedMask: DecodedAlphaMask,
    actualRegion: BrowserRegion,
    actualMask: DecodedAlphaMask,
  ): string {
    const minX = Math.min(expectedRegion.x, actualRegion.x)
    const minY = Math.min(expectedRegion.y, actualRegion.y)
    const maxX = Math.max(expectedRegion.x + expectedRegion.width, actualRegion.x + actualRegion.width)
    const maxY = Math.max(expectedRegion.y + expectedRegion.height, actualRegion.y + actualRegion.height)
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.ceil(maxX - minX))
    canvas.height = Math.max(1, Math.ceil(maxY - minY))
    const context = canvas.getContext("2d")

    if (!context) {
      return canvas.toDataURL("image/png")
    }

    context.fillStyle = "white"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = "rgba(0, 120, 255, 0.65)"
    paintMask(context, expectedMask, expectedRegion, minX, minY)
    context.fillStyle = "rgba(255, 0, 0, 0.65)"
    paintMask(context, actualMask, actualRegion, minX, minY)

    return canvas.toDataURL("image/png")
  }

  function paintMask(
    context: CanvasRenderingContext2D,
    mask: DecodedAlphaMask,
    region: BrowserRegion,
    offsetX: number,
    offsetY: number,
  ): void {
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        if ((mask.data[y * mask.width + x] ?? 0) <= 15) {
          continue
        }

        context.fillRect(Math.round(region.x + x - offsetX), Math.round(region.y + y - offsetY), 1, 1)
      }
    }
  }

  function regionDrift(expected: BrowserRegion, actual: BrowserRegion): string {
    return [
      `left=${actual.x - expected.x}`,
      `top=${actual.y - expected.y}`,
      `right=${(actual.x + actual.width) - (expected.x + expected.width)}`,
      `bottom=${(actual.y + actual.height) - (expected.y + expected.height)}`,
    ].join(" ")
  }

  function restoreAlphaMaskPixelComparator(
    source: AlphaMaskComparatorSource,
  ): typeof compareAlphaMaskPixels {
    const passes = new Function(
      `"use strict"; return (${source.alphaMaskComparisonPasses});`,
    )() as typeof alphaMaskComparisonPasses

    return new Function(
      "alphaMaskComparisonPasses",
      `"use strict"; return (${source.compareAlphaMaskPixels});`,
    )(passes) as typeof compareAlphaMaskPixels
  }
}
