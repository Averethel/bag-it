export const STEP_FIXTURE_RENDER_WIDTH = 1200

export const STEP_FIXTURE_IDS = [
  "simple-blue-callouts",
  "multi-page-multi-callout",
  "repeated-step-multiplier",
  "noisy-false-positive",
  "quantity-and-crop-units",
] as const

export type StepFixtureId = (typeof STEP_FIXTURE_IDS)[number]

export type StepFixtureSourceKind = "synthetic" | "public" | "approved"

export const STEP_FIXTURE_DETECTION_FAILURE_KINDS = [
  "missing-candidate",
  "false-positive-candidate",
  "bad-merge",
  "bad-split",
  "duplicate",
  "quantity-missing",
  "quantity-wrong",
  "part-crop-overlaps-label",
  "part-crop-cuts-part",
] as const

export type StepFixtureDetectionFailureKind =
  (typeof STEP_FIXTURE_DETECTION_FAILURE_KINDS)[number]

export type StepFixtureDetectionFailureTaxonomy = Record<
  StepFixtureDetectionFailureKind,
  number
>

export type SyntheticLDrawPartId =
  | "3023-plate-1x2"
  | "3069b-tile-1x2"
  | "3710-plate-1x4"
  | "6141-round-plate-1x1"

export interface StepFixtureRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface StepFixtureRgb {
  r: number
  g: number
  b: number
}

export interface StepFixtureColor {
  name: string
  hex: string
  rgb: StepFixtureRgb
  family: string
}

export interface StepFixtureSourceMetadata {
  sourceKind: StepFixtureSourceKind
  sourceSpecPath: string
  generatedPdfPath: string
  expectedPath: string
  purpose: string
  browserE2eCandidate: boolean
}

export interface StepFixtureManifestEntry extends StepFixtureSourceMetadata {
  id: StepFixtureId
}

export interface SyntheticStepFixturePartRow {
  id: string
  quantityText: string
  quantityValue: number
  quantityLabelRegion: StepFixtureRegion
  partRegion: StepFixtureRegion
  color: StepFixtureColor
  ldrawPartId: SyntheticLDrawPartId
  imageSignatureId?: string
}

export interface SyntheticStepFixtureCallout {
  id: string
  region: StepFixtureRegion
  fill: string
  stroke: string
  partRows: SyntheticStepFixturePartRow[]
  baggable?: boolean
  expectedMultiplier?: number
  label?: string
}

export interface SyntheticStepFixtureTrap {
  id: string
  region: StepFixtureRegion
  label: string
  fill: string
  stroke: string
}

export interface SyntheticStepFixturePage {
  width: number
  height: number
  title: string
  callouts: SyntheticStepFixtureCallout[]
  falsePositiveTraps?: SyntheticStepFixtureTrap[]
}

export interface SyntheticStepFixtureSource {
  id: StepFixtureId
  purpose: string
  renderWidth: number
  browserE2eCandidate: boolean
  pages: SyntheticStepFixturePage[]
}

export interface StepFixtureExpectedPartItem {
  id: string
  indexOnCallout: number
  quantity: {
    text: string
    value: number
  }
  quantityLabelRegion: StepFixtureRegion
  partRegion: StepFixtureRegion
  ldrawPartId: SyntheticLDrawPartId
  imageSignatureId?: string
}

export interface StepFixtureExpectedCallout {
  id: string
  pageNumber: number
  indexOnPage: number
  sourceRegion: StepFixtureRegion
  cropRegion: StepFixtureRegion
  baggable: boolean
  expectedMultiplier: number
  partItems: StepFixtureExpectedPartItem[]
}

export interface StepFixtureFalsePositiveTrap {
  id: string
  pageNumber: number
  region: StepFixtureRegion
  label: string
}

export interface StepFixtureExpectedBaseline {
  fixtureId: StepFixtureId
  source: StepFixtureSourceMetadata
  renderWidth: number
  pageCount: number
  expectedScannedPageNumbers: number[]
  expectedCallouts: StepFixtureExpectedCallout[]
  falsePositiveTraps: StepFixtureFalsePositiveTrap[]
  expectedBaggableRowCount: number
  expectedZeroPartCalloutCount: number
}

export interface StepFixtureDetectedPartItem {
  id: string
  indexOnCallout: number
  quantity: {
    text: string
    value: number | null
  }
  quantityLabelRegion: StepFixtureRegion
  partRegion: StepFixtureRegion
}

export interface StepFixtureDetectedCallout {
  id: string
  pageNumber: number
  indexOnPage: number
  sourceRegion: StepFixtureRegion
  cropRegion: StepFixtureRegion
  baggable: boolean
  partItems: StepFixtureDetectedPartItem[]
}

export interface StepFixtureStageSnapshotCounts {
  accepted: number
  rejected: number
  total: number
}

export interface StepFixtureStageSnapshot {
  counts: StepFixtureStageSnapshotCounts
  failureTaxonomy: StepFixtureDetectionFailureTaxonomy
  stageId: string
}

export interface StepFixtureStageSnapshots {
  candidates: StepFixtureStageSnapshot[]
  evidence: StepFixtureStageSnapshot[]
  partCrops: StepFixtureStageSnapshot[]
  quantities: StepFixtureStageSnapshot[]
  resolvedCallouts: StepFixtureStageSnapshot[]
}

export interface StepFixtureDetectionResult {
  fixtureId: StepFixtureId
  scannedPageNumbers: number[]
  callouts: StepFixtureDetectedCallout[]
  stageSnapshots?: StepFixtureStageSnapshots
}

export interface StepFixtureGateThresholds {
  pageCoverageMin: number
  calloutRecallMin: number
  falsePositiveBaggableRateMax: number
  sourceReferenceAccuracyMin: number
  quantityExactRateMin: number
  calloutRegionIouMin: number
  partRegionIouMin: number
}

export interface StepFixtureGateCheck {
  name: string
  actual: number
  expected: number
  pass: boolean
}

export interface StepFixtureGateSummary {
  failureTaxonomy: StepFixtureDetectionFailureTaxonomy
  fixtureId: StepFixtureId
  pageCoverage: number
  calloutRecall: number
  falsePositiveBaggableRate: number
  sourceReferenceAccuracy: number
  quantityExactRate: number
  multiDigitQuantityExact: boolean
  partCropOwnershipFailures: string[]
  checks: StepFixtureGateCheck[]
  failedThresholds: StepFixtureGateCheck[]
}
