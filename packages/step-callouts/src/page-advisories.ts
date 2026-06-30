import {
  findGlyphComponents,
  findRasterQuantityLabelSets,
  readQuantityOcr,
  type GlyphComponent,
  type RasterQuantityLabel,
} from "@bag-it/raster-quantity-labels"
import { readStepCalloutCandidateBackground } from "./candidate-background"
import type {
  StepCalloutCandidateEvidence,
  StepCalloutEvidenceScore,
  StepCalloutPageAdvisory,
  StepCalloutPageInput,
  StepCalloutRegion,
  StepCalloutResolvedCallout,
  StepCalloutResolutionStatus,
  StepCalloutRgbColor,
} from "./contracts"
import {
  classifyStepCalloutPageRoles,
  hasStepCalloutQuantityEvidence,
  isRepeatPanelLikeEvidence,
  readStepCalloutEvidenceValue,
  type StepCalloutPageRole,
} from "./page-roles"
import {
  estimateStepCalloutPageBackground,
  isStepCalloutDarkPixel,
} from "./pixels"
import {
  compareStepCalloutRegions,
  stepCalloutRegionArea,
  stepCalloutRegionCenter,
  stepCalloutRegionContainsPoint,
  stepCalloutRegionSmallerOverlapRatio,
} from "./regions"

const ACTIONABLE_MULTIPLIER_MIN = 2
const ACTIONABLE_MULTIPLIER_MAX = 2
const LABEL_SEARCH_BAND_RATIO = 0.45
const LABEL_SEARCH_BAND_MIN = 22
const LABEL_SEARCH_BAND_MAX = 120
const MIN_LABEL_CONFIDENCE = 0.55
const PANEL_LABEL_LOWER_Y_RATIO = 0.45
const PANEL_LABEL_LEFT_X_RATIO = 0.62
const VISIBLE_CALLOUT_OVERLAP_MAX = 0.2
const VISIBLE_PANEL_DUPLICATE_OVERLAP_MIN = 0.85
const DEDUPE_OVERLAP_MIN = 0.7
const MIN_ADVISORY_PANEL_AREA_RATIO = 0.004
const DENSE_PAGE_CANDIDATE_MIN = 12
const DENSE_PAGE_SMALL_AREA_RATIO_MAX = 0.035
const DENSE_PAGE_SMALL_RATIO_MIN = 0.68
const DENSE_PAGE_QUANTITY_MIN = 5
const LARGE_CONNECTED_LABEL_AREA_MIN = 90
const LARGE_CONNECTED_LABEL_AREA_MAX = 6_500
const LARGE_CONNECTED_LABEL_ASPECT_MIN = 1.05
const LARGE_CONNECTED_LABEL_ASPECT_MAX = 3.4
const LARGE_CONNECTED_LABEL_DENSITY_MIN = 0.16
const LARGE_CONNECTED_LABEL_DENSITY_MAX = 0.82
const LARGE_CONNECTED_LABEL_HEIGHT_MIN = 12
const LARGE_CONNECTED_LABEL_WIDTH_MIN = 16
const LARGE_CONNECTED_PANEL_ASPECT_MIN = 0.62

export interface StepCalloutPageAdvisoryTrace {
  advisories: StepCalloutPageAdvisory[]
  diagnostics: StepCalloutPageAdvisoryDiagnostic[]
}

export type StepCalloutPageAdvisoryDecision =
  | "accepted"
  | "accepted-callout"
  | "before-build-start"
  | "bom-page"
  | "dense-page-layout"
  | "missing-page"
  | "no-outside-multiplier-label"
  | "not-repeat-panel"
  | "visible-callout-duplicate"

export interface StepCalloutPageAdvisoryDiagnostic {
  advisoryPanelLike: boolean
  candidateId: string
  candidateRegion: StepCalloutRegion
  candidateSource: StepCalloutCandidateEvidence["candidate"]["source"]
  decision: StepCalloutPageAdvisoryDecision
  densePageLayout: boolean
  evidenceScores: StepCalloutEvidenceScore[]
  firstBuildPageNumber: number | null
  labels: StepCalloutPageAdvisoryLabelDiagnostic[]
  pageNumber: number
  pageRole: StepCalloutPageRole | "missing"
  repeatPanelLike: boolean
  resolvedStatus: StepCalloutResolutionStatus | "unresolved"
  searchRegions: StepCalloutRegion[]
}

export interface StepCalloutPageAdvisoryLabelDiagnostic {
  accepted: boolean
  confidence: number
  recoveryKind?: RasterQuantityLabel["recoveryKind"]
  region: StepCalloutRegion
  rejectionReasons: string[]
  text: string
  value: number
}

interface PageAdvisoryContext {
  evidenceByPage: ReadonlyMap<number, StepCalloutCandidateEvidence[]>
  firstBuildPageNumber: number | null
  pageByNumber: ReadonlyMap<number, StepCalloutPageInput>
  pageRoles: ReadonlyMap<number, StepCalloutPageRole>
  resolvedByCandidateId: ReadonlyMap<string, StepCalloutResolvedCallout>
  visibleRegionsByPage: ReadonlyMap<number, StepCalloutRegion[]>
}

interface PageAdvisoryCandidate {
  candidateEvidence: StepCalloutCandidateEvidence
  label: RasterQuantityLabel
  page: StepCalloutPageInput
}

interface PageAdvisoryEvaluation {
  candidate: PageAdvisoryCandidate | null
  diagnostic: StepCalloutPageAdvisoryDiagnostic
}

interface MultiplierLabelSearchResult {
  acceptedLabels: RasterQuantityLabel[]
  labels: StepCalloutPageAdvisoryLabelDiagnostic[]
  searchRegions: StepCalloutRegion[]
}

interface LabelSearchRegion {
  allowLargeConnectedRecovery: boolean
  region: StepCalloutRegion
}

export function detectStepCalloutPageAdvisories(
  pages: readonly StepCalloutPageInput[],
  resolvedCallouts: readonly StepCalloutResolvedCallout[],
  evidence: readonly StepCalloutCandidateEvidence[],
): StepCalloutPageAdvisory[] {
  return traceStepCalloutPageAdvisories(pages, resolvedCallouts, evidence).advisories
}

export function traceStepCalloutPageAdvisories(
  pages: readonly StepCalloutPageInput[],
  resolvedCallouts: readonly StepCalloutResolvedCallout[],
  evidence: readonly StepCalloutCandidateEvidence[],
): StepCalloutPageAdvisoryTrace {
  const context = createPageAdvisoryContext(pages, resolvedCallouts, evidence)
  const evaluations = evidence.map((candidateEvidence) =>
    evaluatePageAdvisoryCandidate(candidateEvidence, context),
  )
  const candidates = evaluations.flatMap((evaluation) =>
    evaluation.candidate ? [evaluation.candidate] : [],
  )

  return {
    advisories: dedupeAdvisoryCandidates(candidates).map(createPageAdvisory),
    diagnostics: evaluations.map((evaluation) => evaluation.diagnostic),
  }
}

function createPageAdvisoryContext(
  pages: readonly StepCalloutPageInput[],
  resolvedCallouts: readonly StepCalloutResolvedCallout[],
  evidence: readonly StepCalloutCandidateEvidence[],
): PageAdvisoryContext {
  const pageRoles = classifyStepCalloutPageRoles(pages, resolvedCallouts, evidence)

  return {
    evidenceByPage: groupEvidenceByPage(evidence),
    firstBuildPageNumber: readFirstBuildPageNumber(pageRoles),
    pageByNumber: new Map(pages.map((page) => [page.pageNumber, page])),
    pageRoles,
    resolvedByCandidateId: new Map(resolvedCallouts.map((callout) => [callout.candidateId, callout])),
    visibleRegionsByPage: createVisibleRegionsByPage(resolvedCallouts),
  }
}

function evaluatePageAdvisoryCandidate(
  candidateEvidence: StepCalloutCandidateEvidence,
  context: PageAdvisoryContext,
): PageAdvisoryEvaluation {
  const pageNumber = candidateEvidence.candidate.pageNumber
  const page = context.pageByNumber.get(pageNumber)
  const pageRole = context.pageRoles.get(pageNumber) ?? "missing"
  const resolvedStatus = context.resolvedByCandidateId.get(candidateEvidence.candidate.id)?.status ?? "unresolved"
  const repeatPanelLike = page ? isRepeatPanelLikeEvidence(page, candidateEvidence) : false
  const advisoryPanelLike = page ? isAdvisoryPanelLikeEvidence(page, candidateEvidence) : false
  const visibleRegions = context.visibleRegionsByPage.get(pageNumber) ?? []
  const densePageLayout = page
    ? hasDensePageCandidateLayout(
        page,
        context.evidenceByPage.get(pageNumber) ?? [],
        visibleRegions,
      )
    : false
  const baseDiagnostic = createBaseDiagnostic(candidateEvidence, {
    advisoryPanelLike,
    densePageLayout,
    firstBuildPageNumber: context.firstBuildPageNumber,
    pageRole,
    repeatPanelLike,
    resolvedStatus,
  })

  const gateDecision = readPageAdvisoryGateDecision({
    advisoryPanelLike,
    candidateEvidence,
    densePageLayout,
    firstBuildPageNumber: context.firstBuildPageNumber,
    page,
    pageNumber,
    pageRole,
    resolvedStatus,
    visibleRegions,
  })

  if (gateDecision) {
    return rejectPageAdvisory(baseDiagnostic, gateDecision)
  }

  const labelResult = findOutsideMultiplierLabels(
    page!,
    candidateEvidence,
    visibleRegions,
  )
  const diagnostic = {
    ...baseDiagnostic,
    labels: labelResult.labels,
    searchRegions: labelResult.searchRegions,
  }

  if (labelResult.acceptedLabels.length === 0) {
    return rejectPageAdvisory(diagnostic, "no-outside-multiplier-label")
  }

  return {
    candidate: {
      candidateEvidence,
      label: labelResult.acceptedLabels[0],
      page: page!,
    },
    diagnostic: {
      ...diagnostic,
      decision: "accepted",
    },
  }
}

function readPageAdvisoryGateDecision(options: {
  advisoryPanelLike: boolean
  candidateEvidence: StepCalloutCandidateEvidence
  densePageLayout: boolean
  firstBuildPageNumber: number | null
  page: StepCalloutPageInput | undefined
  pageNumber: number
  pageRole: StepCalloutPageAdvisoryDiagnostic["pageRole"]
  resolvedStatus: StepCalloutPageAdvisoryDiagnostic["resolvedStatus"]
  visibleRegions: readonly StepCalloutRegion[]
}): StepCalloutPageAdvisoryDecision | null {
  if (!options.page) {
    return "missing-page"
  }

  if (options.resolvedStatus === "accepted") {
    return "accepted-callout"
  }

  if (!isAfterBuildStart(options.firstBuildPageNumber, options.pageNumber)) {
    return "before-build-start"
  }

  if (options.pageRole === "bom-like") {
    return "bom-page"
  }

  if (!options.advisoryPanelLike) {
    return "not-repeat-panel"
  }

  if (isVisibleCalloutDuplicate(options.candidateEvidence.candidate.region, options.visibleRegions)) {
    return "visible-callout-duplicate"
  }

  return options.densePageLayout ? "dense-page-layout" : null
}

function createBaseDiagnostic(
  candidateEvidence: StepCalloutCandidateEvidence,
  options: {
    advisoryPanelLike: boolean
    densePageLayout: boolean
    firstBuildPageNumber: number | null
    pageRole: StepCalloutPageAdvisoryDiagnostic["pageRole"]
    repeatPanelLike: boolean
    resolvedStatus: StepCalloutPageAdvisoryDiagnostic["resolvedStatus"]
  },
): StepCalloutPageAdvisoryDiagnostic {
  return {
    advisoryPanelLike: options.advisoryPanelLike,
    candidateId: candidateEvidence.candidate.id,
    candidateRegion: candidateEvidence.candidate.region,
    candidateSource: candidateEvidence.candidate.source,
    decision: "not-repeat-panel",
    densePageLayout: options.densePageLayout,
    evidenceScores: candidateEvidence.scores,
    firstBuildPageNumber: options.firstBuildPageNumber,
    labels: [],
    pageNumber: candidateEvidence.candidate.pageNumber,
    pageRole: options.pageRole,
    repeatPanelLike: options.repeatPanelLike,
    resolvedStatus: options.resolvedStatus,
    searchRegions: [],
  }
}

function rejectPageAdvisory(
  diagnostic: StepCalloutPageAdvisoryDiagnostic,
  decision: StepCalloutPageAdvisoryDecision,
): PageAdvisoryEvaluation {
  return {
    candidate: null,
    diagnostic: {
      ...diagnostic,
      decision,
    },
  }
}

function createVisibleRegionsByPage(
  resolvedCallouts: readonly StepCalloutResolvedCallout[],
): Map<number, StepCalloutRegion[]> {
  const regionsByPage = new Map<number, StepCalloutRegion[]>()

  for (const callout of resolvedCallouts) {
    if (callout.status !== "accepted") {
      continue
    }

    regionsByPage.set(callout.pageNumber, [
      ...(regionsByPage.get(callout.pageNumber) ?? []),
      callout.region,
    ])
  }

  return regionsByPage
}

function groupEvidenceByPage(
  evidence: readonly StepCalloutCandidateEvidence[],
): Map<number, StepCalloutCandidateEvidence[]> {
  const byPage = new Map<number, StepCalloutCandidateEvidence[]>()

  for (const candidateEvidence of evidence) {
    const pageNumber = candidateEvidence.candidate.pageNumber

    byPage.set(pageNumber, [...(byPage.get(pageNumber) ?? []), candidateEvidence])
  }

  return byPage
}

function readFirstBuildPageNumber(
  pageRoles: ReadonlyMap<number, StepCalloutPageRole>,
): number | null {
  const firstBuildPage = [...pageRoles.entries()]
    .filter(([, role]) => role === "step-like")
    .map(([pageNumber]) => pageNumber)
    .sort((left, right) => left - right)[0]

  return firstBuildPage ?? null
}

function isAfterBuildStart(
  firstBuildPageNumber: number | null,
  pageNumber: number,
): boolean {
  return firstBuildPageNumber !== null && pageNumber >= firstBuildPageNumber
}

function isAdvisoryPanelLikeEvidence(
  page: StepCalloutPageInput,
  evidence: StepCalloutCandidateEvidence,
): boolean {
  if (
    evidence.candidate.source !== "border" ||
    hasStepCalloutQuantityEvidence(evidence) ||
    !hasAdvisoryPanelArea(page, evidence)
  ) {
    return false
  }

  return isRepeatPanelLikeEvidence(page, evidence)
}

function hasAdvisoryPanelArea(
  page: StepCalloutPageInput,
  evidence: StepCalloutCandidateEvidence,
): boolean {
  return stepCalloutRegionArea(evidence.candidate.region) /
    Math.max(1, page.width * page.height) >= MIN_ADVISORY_PANEL_AREA_RATIO
}

function isVisibleCalloutDuplicate(
  panelRegion: StepCalloutRegion,
  visibleRegions: readonly StepCalloutRegion[],
): boolean {
  return visibleRegions.some((region) =>
    stepCalloutRegionSmallerOverlapRatio(panelRegion, region) >= VISIBLE_PANEL_DUPLICATE_OVERLAP_MIN
  )
}

function hasDensePageCandidateLayout(
  page: StepCalloutPageInput,
  pageEvidence: readonly StepCalloutCandidateEvidence[],
  visibleRegions: readonly StepCalloutRegion[],
): boolean {
  if (visibleRegions.length > 0) {
    return false
  }

  const minimumCandidateCount = DENSE_PAGE_CANDIDATE_MIN

  if (pageEvidence.length < minimumCandidateCount) {
    return false
  }

  const smallCandidates = pageEvidence.filter((candidateEvidence) =>
    stepCalloutRegionArea(candidateEvidence.candidate.region) /
      Math.max(1, page.width * page.height) <= DENSE_PAGE_SMALL_AREA_RATIO_MAX
  )
  const quantityBackedCandidates = pageEvidence.filter(hasStepCalloutQuantityEvidence)

  return (
    smallCandidates.length / pageEvidence.length >= DENSE_PAGE_SMALL_RATIO_MIN ||
    quantityBackedCandidates.length >= DENSE_PAGE_QUANTITY_MIN
  )
}

function findOutsideMultiplierLabels(
  page: StepCalloutPageInput,
  evidence: StepCalloutCandidateEvidence,
  visibleRegions: readonly StepCalloutRegion[],
): MultiplierLabelSearchResult {
  const searchRegions = createLabelSearchRegions(page, evidence.candidate.region)
  const backgrounds = createLabelSearchBackgrounds(page, evidence, searchRegions.map((entry) => entry.region))
  const regularLabels = searchRegions.flatMap(({ region }) =>
    backgrounds.flatMap((background) =>
      findAdvisoryRasterQuantityLabels(page, region, background),
    ),
  )
  const largeConnectedLabels = searchRegions
    .filter((entry) => entry.allowLargeConnectedRecovery)
    .flatMap((entry) =>
      findLargeConnectedAdvisoryQuantityLabels(
        page,
        entry.region,
        evidence.candidate.region,
      ),
    )
  const labels = dedupeMultiplierLabels([...regularLabels, ...largeConnectedLabels])
  const labelDiagnostics = labels.map((label) =>
    createLabelDiagnostic(label, evidence.candidate.region, visibleRegions),
  )

  return {
    acceptedLabels: labels.filter((label) =>
      labelDiagnostics.some((diagnostic) =>
        diagnostic.accepted &&
        diagnostic.region === label.region
      ),
    ),
    labels: labelDiagnostics,
    searchRegions: searchRegions.map((entry) => entry.region),
  }
}

function findAdvisoryRasterQuantityLabels(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
  background: StepCalloutRgbColor,
): RasterQuantityLabel[] {
  const labelSets = findRasterQuantityLabelSets(page, region, background)

  return [
    ...labelSets.emitted,
    ...labelSets.suppression,
  ]
}

function findLargeConnectedAdvisoryQuantityLabels(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
  panelRegion: StepCalloutRegion,
): RasterQuantityLabel[] {
  const mask = createLargeConnectedAdvisoryMask(page, region)

  return findGlyphComponents(page, mask, region)
    .filter((glyph) => isLargeConnectedAdvisoryGlyph(glyph, region))
    .flatMap((glyph) => createLargeConnectedAdvisoryLabel(page, glyph, panelRegion))
}

function createLargeConnectedAdvisoryMask(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
): Uint8Array {
  const mask = new Uint8Array(page.width * page.height)

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const pixelIndex = y * page.width + x

      if (isStepCalloutDarkPixel(page, pixelIndex)) {
        mask[pixelIndex] = 1
      }
    }
  }

  return mask
}

function isLargeConnectedAdvisoryGlyph(
  glyph: GlyphComponent,
  searchRegion: StepCalloutRegion,
): boolean {
  const { height, width } = glyph.region
  const area = width * height
  const aspect = width / Math.max(1, height)
  const density = glyph.area / Math.max(1, area)

  return (
    glyph.area >= LARGE_CONNECTED_LABEL_AREA_MIN &&
    glyph.area <= LARGE_CONNECTED_LABEL_AREA_MAX &&
    height >= LARGE_CONNECTED_LABEL_HEIGHT_MIN &&
    height <= Math.min(80, searchRegion.height) &&
    width >= LARGE_CONNECTED_LABEL_WIDTH_MIN &&
    width <= Math.min(130, searchRegion.width) &&
    aspect >= LARGE_CONNECTED_LABEL_ASPECT_MIN &&
    aspect <= LARGE_CONNECTED_LABEL_ASPECT_MAX &&
    density >= LARGE_CONNECTED_LABEL_DENSITY_MIN &&
    density <= LARGE_CONNECTED_LABEL_DENSITY_MAX
  )
}

function createLargeConnectedAdvisoryLabel(
  page: StepCalloutPageInput,
  glyph: GlyphComponent,
  panelRegion: StepCalloutRegion,
): RasterQuantityLabel[] {
  const read = readQuantityOcr(page, [glyph])

  if (!read) {
    return []
  }

  const labelRead = read.value === 2 || !isLikelyCollidedRepeatTwoMultiplier(panelRegion, glyph, read)
    ? read
    : {
        ...read,
        confidence: Math.min(read.confidence, 0.7),
        text: "2x",
        value: 2,
      }

  return [{
    confidence: Math.max(0, labelRead.confidence - 0.08),
    glyphs: [glyph],
    recoveryKind: "large-dense-top",
    region: glyph.region,
    text: labelRead.text,
    value: labelRead.value,
  }]
}

function isLikelyCollidedRepeatTwoMultiplier(
  panelRegion: StepCalloutRegion,
  glyph: GlyphComponent,
  read: { text: string; value: number },
): boolean {
  const band = readLabelSearchBand(panelRegion)
  const panelBottom = panelRegion.y + panelRegion.height

  return (
    read.text.endsWith("x") &&
    read.value >= 1 &&
    read.value <= 9 &&
    hasLargeConnectedRecoveryPanelShape(panelRegion) &&
    glyph.region.height >= 18 &&
    glyph.region.x >= panelRegion.x - band * 1.75 &&
    glyph.region.x <= panelRegion.x + band * 0.25 &&
    glyph.region.y >= panelBottom - band * 0.12 &&
    glyph.region.y <= panelBottom + band * 0.35
  )
}

function hasLargeConnectedRecoveryPanelShape(panelRegion: StepCalloutRegion): boolean {
  return panelRegion.width / Math.max(1, panelRegion.height) >= LARGE_CONNECTED_PANEL_ASPECT_MIN
}

function createLabelSearchRegions(
  page: StepCalloutPageInput,
  panelRegion: StepCalloutRegion,
): LabelSearchRegion[] {
  return dedupeLabelSearchRegions([
    {
      allowLargeConnectedRecovery: false,
      region: createLowerLeftEdgeSearchRegion(page, panelRegion),
    },
    {
      allowLargeConnectedRecovery: false,
      region: createLowerLeftCornerSkirtSearchRegion(page, panelRegion),
    },
    {
      allowLargeConnectedRecovery: false,
      region: createBelowPanelCornerSearchRegion(page, panelRegion),
    },
    {
      allowLargeConnectedRecovery: false,
      region: createLeftOfPanelCornerSearchRegion(page, panelRegion),
    },
    {
      allowLargeConnectedRecovery: true,
      region: createAttachedCornerRecoverySearchRegion(page, panelRegion),
    },
  ]).filter((entry) => entry.region.width > 0 && entry.region.height > 0)
}

function createLowerLeftEdgeSearchRegion(
  page: StepCalloutPageInput,
  panelRegion: StepCalloutRegion,
): StepCalloutRegion {
  const band = readLabelSearchBand(panelRegion)
  const x = Math.max(0, panelRegion.x - band * 2.25)
  const y = Math.max(0, panelRegion.y + panelRegion.height * 0.38)
  const right = Math.min(page.width, panelRegion.x + panelRegion.width * 0.58)
  const bottom = Math.min(page.height, panelRegion.y + panelRegion.height + band)

  return createIntegerRegionFromBounds(x, y, right, bottom)
}

function createLowerLeftCornerSkirtSearchRegion(
  page: StepCalloutPageInput,
  panelRegion: StepCalloutRegion,
): StepCalloutRegion {
  const band = readLabelSearchBand(panelRegion)
  const panelBottom = panelRegion.y + panelRegion.height
  const x = Math.max(0, panelRegion.x - band * 2.65)
  const y = Math.max(0, panelBottom - band * 1.4)
  const right = Math.min(page.width, panelRegion.x + panelRegion.width * 0.65)
  const bottom = Math.min(page.height, panelBottom + band * 1.2)

  return createIntegerRegionFromBounds(x, y, right, bottom)
}

function createBelowPanelCornerSearchRegion(
  page: StepCalloutPageInput,
  panelRegion: StepCalloutRegion,
): StepCalloutRegion {
  const band = readLabelSearchBand(panelRegion)
  const panelBottom = panelRegion.y + panelRegion.height
  const x = Math.max(0, panelRegion.x - band * 2.65)
  const y = Math.max(0, panelBottom + 1)
  const right = Math.min(page.width, panelRegion.x + panelRegion.width * 0.65)
  const bottom = Math.min(page.height, panelBottom + band * 1.45)

  return createIntegerRegionFromBounds(x, y, right, bottom)
}

function createLeftOfPanelCornerSearchRegion(
  page: StepCalloutPageInput,
  panelRegion: StepCalloutRegion,
): StepCalloutRegion {
  const band = readLabelSearchBand(panelRegion)
  const panelBottom = panelRegion.y + panelRegion.height
  const x = Math.max(0, panelRegion.x - band * 2.65)
  const y = Math.max(0, panelBottom - band * 1.4)
  const right = Math.min(page.width, Math.max(x, panelRegion.x - 1))
  const bottom = Math.min(page.height, panelBottom + band * 1.2)

  return createIntegerRegionFromBounds(x, y, right, bottom)
}

function createAttachedCornerRecoverySearchRegion(
  page: StepCalloutPageInput,
  panelRegion: StepCalloutRegion,
): StepCalloutRegion {
  const band = readLabelSearchBand(panelRegion)
  const panelBottom = panelRegion.y + panelRegion.height
  const x = Math.max(0, panelRegion.x - band * 1.45)
  const y = Math.max(0, panelBottom - band * 0.75)
  const right = Math.min(page.width, panelRegion.x + band * 1.05)
  const bottom = Math.min(page.height, panelBottom + band * 0.8)

  return createIntegerRegionFromBounds(x, y, right, bottom)
}

function createIntegerRegionFromBounds(
  x: number,
  y: number,
  right: number,
  bottom: number,
): StepCalloutRegion {
  const integerX = Math.max(0, Math.floor(x))
  const integerY = Math.max(0, Math.floor(y))
  const integerRight = Math.max(integerX, Math.ceil(right))
  const integerBottom = Math.max(integerY, Math.ceil(bottom))

  return {
    height: integerBottom - integerY,
    width: integerRight - integerX,
    x: integerX,
    y: integerY,
  }
}

function readLabelSearchBand(panelRegion: StepCalloutRegion): number {
  return Math.min(
    LABEL_SEARCH_BAND_MAX,
    Math.max(
      LABEL_SEARCH_BAND_MIN,
      Math.round(Math.min(panelRegion.width, panelRegion.height) * LABEL_SEARCH_BAND_RATIO),
    ),
  )
}

function createLabelSearchBackgrounds(
  page: StepCalloutPageInput,
  evidence: StepCalloutCandidateEvidence,
  searchRegions: readonly StepCalloutRegion[],
): StepCalloutRgbColor[] {
  return dedupeBackgrounds([
    estimateStepCalloutPageBackground(page),
    evidence.background,
    readStepCalloutCandidateBackground(page, evidence.candidate.region),
    ...searchRegions.map((region) => readStepCalloutCandidateBackground(page, region)),
  ])
}

function createLabelDiagnostic(
  label: RasterQuantityLabel,
  panelRegion: StepCalloutRegion,
  visibleRegions: readonly StepCalloutRegion[],
): StepCalloutPageAdvisoryLabelDiagnostic {
  const rejectionReasons = [
    ...(!isActionableMultiplierLabel(label) ? ["not-actionable-multiplier"] : []),
    ...(!isPhysicallyAttachedLowerLeftLabel(panelRegion, label) ? ["not-attached-lower-left"] : []),
    ...(overlapsVisibleCallout(label.region, visibleRegions) ? ["overlaps-visible-callout"] : []),
  ]

  return {
    accepted: rejectionReasons.length === 0,
    confidence: label.confidence,
    recoveryKind: label.recoveryKind,
    region: label.region,
    rejectionReasons,
    text: label.text,
    value: label.value,
  }
}

function isActionableMultiplierLabel(label: RasterQuantityLabel): boolean {
  return (
    label.value >= ACTIONABLE_MULTIPLIER_MIN &&
    label.value <= ACTIONABLE_MULTIPLIER_MAX &&
    label.confidence >= MIN_LABEL_CONFIDENCE
  )
}

function isPhysicallyAttachedLowerLeftLabel(
  panelRegion: StepCalloutRegion,
  label: RasterQuantityLabel,
): boolean {
  const center = stepCalloutRegionCenter(label.region)
  const labelRight = label.region.x + label.region.width
  const labelBottom = label.region.y + label.region.height
  const panelBottom = panelRegion.y + panelRegion.height
  const band = readLabelSearchBand(panelRegion)

  return (
    !stepCalloutRegionContainsPoint(panelRegion, center) &&
    center.y >= panelRegion.y + panelRegion.height * PANEL_LABEL_LOWER_Y_RATIO &&
    center.x <= panelRegion.x + panelRegion.width * PANEL_LABEL_LEFT_X_RATIO &&
    label.region.x <= panelRegion.x + band &&
    labelRight >= panelRegion.x - band * 1.6 &&
    label.region.y <= panelBottom + band * 1.2 &&
    labelBottom >= panelBottom - band * 1.35 &&
    isAllowedLabelRecoveryDistance(panelRegion, label, band)
  )
}

function isAllowedLabelRecoveryDistance(
  panelRegion: StepCalloutRegion,
  label: RasterQuantityLabel,
  band: number,
): boolean {
  if (label.recoveryKind !== "large-dense-top") {
    return true
  }

  return (
    hasLargeConnectedRecoveryPanelShape(panelRegion) &&
    label.region.x >= panelRegion.x - band * 1.55
  )
}

function overlapsVisibleCallout(
  labelRegion: StepCalloutRegion,
  visibleRegions: readonly StepCalloutRegion[],
): boolean {
  return visibleRegions.some((region) =>
    stepCalloutRegionContainsPoint(region, stepCalloutRegionCenter(labelRegion)) ||
    stepCalloutRegionSmallerOverlapRatio(labelRegion, region) > VISIBLE_CALLOUT_OVERLAP_MAX
  )
}

function dedupeMultiplierLabels(labels: readonly RasterQuantityLabel[]): RasterQuantityLabel[] {
  const selected: RasterQuantityLabel[] = []

  for (const label of [...labels].sort((left, right) => right.confidence - left.confidence)) {
    if (selected.some((item) =>
      stepCalloutRegionSmallerOverlapRatio(item.region, label.region) >= DEDUPE_OVERLAP_MIN
    )) {
      continue
    }

    selected.push(label)
  }

  return selected
}

function dedupeRegions(regions: readonly StepCalloutRegion[]): StepCalloutRegion[] {
  const selected: StepCalloutRegion[] = []

  for (const region of regions) {
    if (selected.some((item) => areNearDuplicateRegions(item, region))) {
      continue
    }

    selected.push(region)
  }

  return selected
}

function dedupeLabelSearchRegions(regions: readonly LabelSearchRegion[]): LabelSearchRegion[] {
  return dedupeRegions(regions.map((entry) => entry.region))
    .map((region) => ({
      allowLargeConnectedRecovery: regions.some((entry) =>
        entry.allowLargeConnectedRecovery &&
        compareStepCalloutRegions(entry.region, region) === 0
      ),
      region,
    }))
}

function areNearDuplicateRegions(
  left: StepCalloutRegion,
  right: StepCalloutRegion,
): boolean {
  const leftArea = stepCalloutRegionArea(left)
  const rightArea = stepCalloutRegionArea(right)
  const areaRatio = Math.min(leftArea, rightArea) / Math.max(1, Math.max(leftArea, rightArea))

  return areaRatio >= 0.9 &&
    stepCalloutRegionSmallerOverlapRatio(left, right) >= DEDUPE_OVERLAP_MIN
}

function dedupeBackgrounds(colors: readonly StepCalloutRgbColor[]): StepCalloutRgbColor[] {
  const selected: StepCalloutRgbColor[] = []

  for (const color of colors) {
    if (selected.some((item) => areSimilarBackgrounds(item, color))) {
      continue
    }

    selected.push(color)
  }

  return selected
}

function areSimilarBackgrounds(
  left: StepCalloutRgbColor,
  right: StepCalloutRgbColor,
): boolean {
  return (
    Math.abs(left.r - right.r) <= 3 &&
    Math.abs(left.g - right.g) <= 3 &&
    Math.abs(left.b - right.b) <= 3
  )
}

function dedupeAdvisoryCandidates(
  candidates: readonly PageAdvisoryCandidate[],
): PageAdvisoryCandidate[] {
  const selected: PageAdvisoryCandidate[] = []

  for (const candidate of [...candidates].sort(compareAdvisoryCandidates)) {
    if (selected.some((item) => isDuplicateAdvisoryCandidate(item, candidate))) {
      continue
    }

    selected.push(candidate)
  }

  return selected.sort((left, right) =>
    left.page.pageNumber - right.page.pageNumber ||
    compareStepCalloutRegions(left.candidateEvidence.candidate.region, right.candidateEvidence.candidate.region)
  )
}

function compareAdvisoryCandidates(
  left: PageAdvisoryCandidate,
  right: PageAdvisoryCandidate,
): number {
  return (
    readAdvisoryConfidence(right) - readAdvisoryConfidence(left) ||
    compareStepCalloutRegions(left.candidateEvidence.candidate.region, right.candidateEvidence.candidate.region)
  )
}

function isDuplicateAdvisoryCandidate(
  left: PageAdvisoryCandidate,
  right: PageAdvisoryCandidate,
): boolean {
  return (
    left.page.pageNumber === right.page.pageNumber &&
    (
      stepCalloutRegionSmallerOverlapRatio(left.label.region, right.label.region) >= DEDUPE_OVERLAP_MIN ||
      stepCalloutRegionSmallerOverlapRatio(
        left.candidateEvidence.candidate.region,
        right.candidateEvidence.candidate.region,
      ) >= DEDUPE_OVERLAP_MIN
    )
  )
}

function createPageAdvisory(candidate: PageAdvisoryCandidate): StepCalloutPageAdvisory {
  const panelRegion = candidate.candidateEvidence.candidate.region
  const sourceRegion = unionRegions(panelRegion, candidate.label.region)

  return {
    confidence: readAdvisoryConfidence(candidate),
    id: `possible-step-multiplier-${candidate.candidateEvidence.candidate.id}-${candidate.label.text}-${Math.round(candidate.label.region.x)}-${Math.round(candidate.label.region.y)}`,
    kind: "possible-step-multiplier",
    pageNumber: candidate.page.pageNumber,
    source: "raster",
    sourceRegion,
    text: candidate.label.text,
    value: candidate.label.value,
  }
}

function readAdvisoryConfidence(candidate: PageAdvisoryCandidate): number {
  return Math.min(
    1,
    0.45 +
      readStepCalloutEvidenceValue(candidate.candidateEvidence.scores, "border") * 0.3 +
      candidate.label.confidence * 0.25,
  )
}

function unionRegions(
  left: StepCalloutRegion,
  right: StepCalloutRegion,
): StepCalloutRegion {
  const x = Math.min(left.x, right.x)
  const y = Math.min(left.y, right.y)
  const regionRight = Math.max(left.x + left.width, right.x + right.width)
  const regionBottom = Math.max(left.y + left.height, right.y + right.height)

  return {
    height: regionBottom - y,
    width: regionRight - x,
    x,
    y,
  }
}
