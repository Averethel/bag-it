import type {
  StepFixtureDetectionFailureTaxonomy,
  StepFixtureDetectionResult,
  StepFixtureDetectedCallout,
  StepFixtureDetectedPartItem,
  StepFixtureExpectedBaseline,
  StepFixtureExpectedCallout,
  StepFixtureExpectedPartItem,
  StepFixtureGateCheck,
  StepFixtureGateSummary,
  StepFixtureGateThresholds,
  StepFixtureRegion,
} from "./step-fixture-types"
import { STEP_FIXTURE_DETECTION_FAILURE_KINDS } from "./step-fixture-types"

export const STEP_FIXTURE_GATE_THRESHOLDS: StepFixtureGateThresholds = {
  pageCoverageMin: 1,
  calloutRecallMin: 0.95,
  falsePositiveBaggableRateMax: 0.02,
  sourceReferenceAccuracyMin: 0.95,
  quantityExactRateMin: 0.95,
  calloutRegionIouMin: 0.75,
  partRegionIouMin: 0.65,
}

export function evaluateStepFixtureGate(
  baseline: StepFixtureExpectedBaseline,
  detection: StepFixtureDetectionResult,
  thresholds: StepFixtureGateThresholds = STEP_FIXTURE_GATE_THRESHOLDS,
): StepFixtureGateSummary {
  const expectedBaggableCallouts = baseline.expectedCallouts.filter((callout) => callout.baggable)
  const detectedBaggableCallouts = detection.callouts.filter((callout) => callout.baggable)
  const matches = matchCallouts(expectedBaggableCallouts, detectedBaggableCallouts, thresholds)
  const quantityStats = evaluateQuantities(matches)
  const partCropOwnershipFailures = findPartCropOwnershipFailures(matches, thresholds)
  const matchedDetectedCount = new Set(matches.map((match) => match.detectedIndex)).size
  const missingCalloutCount = expectedBaggableCallouts.length - matches.length
  const falsePositiveBaggableCount = detectedBaggableCallouts.length - matchedDetectedCount
  const pageCoverage = calculatePageCoverage(
    baseline.expectedScannedPageNumbers,
    detection.scannedPageNumbers,
  )
  const calloutRecall = ratio(matches.length, expectedBaggableCallouts.length, 1)
  const falsePositiveBaggableRate = ratio(
    falsePositiveBaggableCount,
    detectedBaggableCallouts.length,
    0,
  )
  const sourceReferenceAccuracy = ratio(
    matchedDetectedCount,
    detectedBaggableCallouts.length,
    expectedBaggableCallouts.length === 0 ? 1 : 0,
  )
  const checks = buildChecks({
    pageCoverage,
    calloutRecall,
    falsePositiveBaggableRate,
    sourceReferenceAccuracy,
    quantityExactRate: quantityStats.exactRate,
    multiDigitQuantityExact: quantityStats.multiDigitExact,
    partCropOwnershipFailures,
    thresholds,
  })
  const failureTaxonomy = createFailureTaxonomy({
    falsePositiveBaggableCount,
    missingCalloutCount,
    partCropOwnershipFailures,
    quantityMissingCount: quantityStats.missingCount,
    quantityWrongCount: quantityStats.wrongCount,
  })

  return {
    failureTaxonomy,
    fixtureId: baseline.fixtureId,
    pageCoverage,
    calloutRecall,
    falsePositiveBaggableRate,
    sourceReferenceAccuracy,
    quantityExactRate: quantityStats.exactRate,
    multiDigitQuantityExact: quantityStats.multiDigitExact,
    partCropOwnershipFailures,
    checks,
    failedThresholds: checks.filter((check) => !check.pass),
  }
}

export function createPerfectStepFixtureDetection(
  baseline: StepFixtureExpectedBaseline,
): StepFixtureDetectionResult {
  return {
    fixtureId: baseline.fixtureId,
    scannedPageNumbers: [...baseline.expectedScannedPageNumbers],
    callouts: baseline.expectedCallouts.map((callout) => ({
      id: callout.id,
      pageNumber: callout.pageNumber,
      indexOnPage: callout.indexOnPage,
      sourceRegion: { ...callout.sourceRegion },
      cropRegion: { ...callout.cropRegion },
      baggable: callout.baggable,
      partItems: callout.partItems.map((item) => ({
        id: item.id,
        indexOnCallout: item.indexOnCallout,
        quantity: { ...item.quantity },
        quantityLabelRegion: { ...item.quantityLabelRegion },
        partRegion: { ...item.partRegion },
      })),
    })),
  }
}

interface CalloutMatch {
  expected: StepFixtureExpectedCallout
  detected: StepFixtureDetectedCallout
  detectedIndex: number
}

interface PartMatch {
  expected: StepFixtureExpectedPartItem
  detected: StepFixtureDetectedPartItem
}

function matchCallouts(
  expectedCallouts: StepFixtureExpectedCallout[],
  detectedCallouts: StepFixtureDetectedCallout[],
  thresholds: StepFixtureGateThresholds,
): CalloutMatch[] {
  const usedDetectedIndexes = new Set<number>()
  const matches: CalloutMatch[] = []

  for (const expected of expectedCallouts) {
    let bestDetectedIndex = -1
    let bestIou = 0

    for (let index = 0; index < detectedCallouts.length; index += 1) {
      const detected = detectedCallouts[index]

      if (usedDetectedIndexes.has(index) || detected.pageNumber !== expected.pageNumber) {
        continue
      }

      const iou = regionIou(expected.sourceRegion, detected.sourceRegion)

      if (iou > bestIou) {
        bestIou = iou
        bestDetectedIndex = index
      }
    }

    if (bestDetectedIndex >= 0 && bestIou >= thresholds.calloutRegionIouMin) {
      usedDetectedIndexes.add(bestDetectedIndex)
      matches.push({
        expected,
        detected: detectedCallouts[bestDetectedIndex],
        detectedIndex: bestDetectedIndex,
      })
    }
  }

  return matches
}

function evaluateQuantities(matches: CalloutMatch[]) {
  const partMatches = matches.flatMap(matchParts)
  const expectedPartCount = matches.reduce(
    (total, match) => total + match.expected.partItems.length,
    0,
  )
  const exactQuantityCount = partMatches.filter(
    ({ expected, detected }) =>
      expected.quantity.value === detected.quantity.value &&
      expected.quantity.text === detected.quantity.text,
  ).length
  const nullQuantityCount = partMatches.filter(({ detected }) => detected.quantity.value === null).length
  const wrongQuantityCount = partMatches.length - exactQuantityCount - nullQuantityCount
  const multiDigitMatches = partMatches.filter(({ expected }) => expected.quantity.value >= 10)

  return {
    exactRate: ratio(exactQuantityCount, partMatches.length, 1),
    missingCount: expectedPartCount - partMatches.length + nullQuantityCount,
    multiDigitExact: multiDigitMatches.every(
      ({ expected, detected }) =>
        expected.quantity.value === detected.quantity.value &&
        expected.quantity.text === detected.quantity.text,
    ),
    wrongCount: wrongQuantityCount,
  }
}

function findPartCropOwnershipFailures(
  matches: CalloutMatch[],
  thresholds: StepFixtureGateThresholds,
) {
  const failures: string[] = []

  for (const { expected, detected } of matches.flatMap(matchParts)) {
    if (regionsOverlap(detected.partRegion, detected.quantityLabelRegion)) {
      failures.push(`${detected.id}: part crop overlaps its detected quantity label`)
      continue
    }

    if (regionsOverlap(detected.partRegion, expected.quantityLabelRegion)) {
      failures.push(`${detected.id}: part crop overlaps expected quantity label`)
      continue
    }

    if (regionIou(expected.partRegion, detected.partRegion) < thresholds.partRegionIouMin) {
      failures.push(`${detected.id}: part crop does not match expected ownership region`)
    }
  }

  return failures
}

function matchParts(match: CalloutMatch): PartMatch[] {
  return match.expected.partItems.flatMap((expected) => {
    const detected =
      match.detected.partItems.find((item) => item.indexOnCallout === expected.indexOnCallout) ??
      null

    return detected ? [{ expected, detected }] : []
  })
}

function calculatePageCoverage(expectedPages: number[], scannedPages: number[]) {
  const scannedPageSet = new Set(scannedPages)
  const coveredPages = expectedPages.filter((pageNumber) => scannedPageSet.has(pageNumber)).length

  return ratio(coveredPages, expectedPages.length, 1)
}

function buildChecks(values: {
  pageCoverage: number
  calloutRecall: number
  falsePositiveBaggableRate: number
  sourceReferenceAccuracy: number
  quantityExactRate: number
  multiDigitQuantityExact: boolean
  partCropOwnershipFailures: string[]
  thresholds: StepFixtureGateThresholds
}): StepFixtureGateCheck[] {
  return [
    {
      name: "page coverage",
      actual: values.pageCoverage,
      expected: values.thresholds.pageCoverageMin,
      pass: values.pageCoverage >= values.thresholds.pageCoverageMin,
    },
    {
      name: "callout recall",
      actual: values.calloutRecall,
      expected: values.thresholds.calloutRecallMin,
      pass: values.calloutRecall >= values.thresholds.calloutRecallMin,
    },
    {
      name: "false-positive baggable callouts",
      actual: values.falsePositiveBaggableRate,
      expected: values.thresholds.falsePositiveBaggableRateMax,
      pass: values.falsePositiveBaggableRate <= values.thresholds.falsePositiveBaggableRateMax,
    },
    {
      name: "source reference accuracy",
      actual: values.sourceReferenceAccuracy,
      expected: values.thresholds.sourceReferenceAccuracyMin,
      pass: values.sourceReferenceAccuracy >= values.thresholds.sourceReferenceAccuracyMin,
    },
    {
      name: "quantity exact-match rate",
      actual: values.quantityExactRate,
      expected: values.thresholds.quantityExactRateMin,
      pass: values.quantityExactRate >= values.thresholds.quantityExactRateMin,
    },
    {
      name: "multi-digit quantity exact match",
      actual: values.multiDigitQuantityExact ? 1 : 0,
      expected: 1,
      pass: values.multiDigitQuantityExact,
    },
    {
      name: "part crop ownership",
      actual: values.partCropOwnershipFailures.length,
      expected: 0,
      pass: values.partCropOwnershipFailures.length === 0,
    },
  ]
}

function createFailureTaxonomy(values: {
  falsePositiveBaggableCount: number
  missingCalloutCount: number
  partCropOwnershipFailures: string[]
  quantityMissingCount: number
  quantityWrongCount: number
}): StepFixtureDetectionFailureTaxonomy {
  const taxonomy = Object.fromEntries(
    STEP_FIXTURE_DETECTION_FAILURE_KINDS.map((kind) => [kind, 0]),
  ) as StepFixtureDetectionFailureTaxonomy

  taxonomy["false-positive-candidate"] = values.falsePositiveBaggableCount
  taxonomy["missing-candidate"] = values.missingCalloutCount
  taxonomy["quantity-missing"] = values.quantityMissingCount
  taxonomy["quantity-wrong"] = values.quantityWrongCount

  for (const failure of values.partCropOwnershipFailures) {
    const kind = failure.includes("overlaps")
      ? "part-crop-overlaps-label"
      : "part-crop-cuts-part"

    taxonomy[kind] += 1
  }

  return taxonomy
}

function ratio(numerator: number, denominator: number, emptyValue: number) {
  return denominator === 0 ? emptyValue : numerator / denominator
}

function regionIou(a: StepFixtureRegion, b: StepFixtureRegion) {
  const overlapArea = regionOverlapArea(a, b)
  const unionArea = regionArea(a) + regionArea(b) - overlapArea

  return unionArea === 0 ? 0 : overlapArea / unionArea
}

function regionsOverlap(a: StepFixtureRegion, b: StepFixtureRegion) {
  return regionOverlapArea(a, b) > 0
}

function regionOverlapArea(a: StepFixtureRegion, b: StepFixtureRegion) {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  const width = Math.max(0, right - left)
  const height = Math.max(0, bottom - top)

  return width * height
}

function regionArea(region: StepFixtureRegion) {
  return region.width * region.height
}
