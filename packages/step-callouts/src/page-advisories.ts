import {
  createGlyphFromPixels,
  findGlyphComponents,
  findRasterQuantityLabelSets,
  readRasterQuantityDigit,
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
const ACTIONABLE_MULTIPLIER_MAX = 9
const LABEL_SEARCH_BAND_RATIO = 0.45
const LABEL_SEARCH_BAND_MIN = 22
const LABEL_SEARCH_BAND_MAX = 120
const MIN_LABEL_CONFIDENCE = 0.55
const PANEL_LABEL_LOWER_Y_RATIO = 0.45
const PANEL_LABEL_LEFT_X_RATIO = 0.62
const PANEL_LABEL_CENTER_X_RATIO = 0.72
const VISIBLE_CALLOUT_OVERLAP_MAX = 0.2
const VISIBLE_PANEL_DUPLICATE_OVERLAP_MIN = 0.85
const DEDUPE_OVERLAP_MIN = 0.7
const MIN_ADVISORY_PANEL_AREA_RATIO = 0.004
const MIN_ADVISORY_PANEL_HEIGHT = 50
const MIN_ADVISORY_PANEL_HEIGHT_RATIO = 0.12
const MIN_ADVISORY_PANEL_BACKGROUND_LUMA = 190
const MIN_ADVISORY_PANEL_BACKGROUND_CHANNEL_SPREAD = 10
const MAX_WEAK_INTERNAL_QUANTITY_SCORE = 0.35
const MAX_CANDIDATE_MULTIPLIER_LABELS = 40
const MAX_CANDIDATE_ACTIONABLE_MULTIPLIER_LABELS = 12
const DENSE_PAGE_CANDIDATE_MIN = 12
const DENSE_PAGE_SMALL_AREA_RATIO_MAX = 0.035
const DENSE_PAGE_SMALL_RATIO_MIN = 0.68
const DENSE_PAGE_QUANTITY_MIN = 5
const MAX_LOWER_LEFT_LABEL_GAP = 40
const LARGE_CONNECTED_LABEL_AREA_MIN = 90
const LARGE_CONNECTED_LABEL_AREA_MAX = 6_500
const LARGE_CONNECTED_LABEL_ASPECT_MIN = 1.05
const LARGE_CONNECTED_LABEL_ASPECT_MAX = 3.4
const LARGE_CONNECTED_LABEL_DENSITY_MIN = 0.16
const LARGE_CONNECTED_LABEL_DENSITY_MAX = 0.82
const LARGE_CONNECTED_LABEL_HEIGHT_MIN = 12
const LARGE_CONNECTED_LABEL_WIDTH_MIN = 16
const LARGE_CONNECTED_PANEL_ASPECT_MIN = 0.62
const SEPARATED_ATTACHED_LABEL_COMPONENT_AREA_MIN = 12
const SEPARATED_ATTACHED_LABEL_COMPONENT_AREA_MAX = 2_400
const SEPARATED_ATTACHED_LABEL_COMPONENT_DENSITY_MIN = 0.08
const SEPARATED_ATTACHED_LABEL_COMPONENT_DENSITY_MAX = 0.88
const SEPARATED_ATTACHED_LABEL_COMPONENT_HEIGHT_MIN = 6
const SEPARATED_ATTACHED_LABEL_COMPONENT_WIDTH_MIN = 2
const SEPARATED_ATTACHED_LABEL_CONFIDENCE_PENALTY = 0.06
const BORDER_ATTACHED_LABEL_CONFIDENCE_MAX = 0.72
const BORDER_ATTACHED_LABEL_CONFIDENCE_PENALTY = 0.16
const LIGHT_PANEL_BACKGROUND_LUMA_MIN = 120

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
  | "noisy-label-neighborhood"
  | "no-attached-multiplier-label"
  | "not-repeat-panel"
  | "visible-callout-duplicate"

export interface StepCalloutPageAdvisoryDiagnostic {
  advisoryPanelLike: boolean
  background: StepCalloutRgbColor
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
  quantityRegionsByPage: ReadonlyMap<number, StepCalloutRegion[]>
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
    quantityRegionsByPage: createQuantityRegionsByPage(evidence),
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
  const quantityRegions = context.quantityRegionsByPage.get(pageNumber) ?? []
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
    quantityRegions,
    visibleRegions,
  )
  const diagnostic = {
    ...baseDiagnostic,
    labels: labelResult.labels,
    searchRegions: labelResult.searchRegions,
  }

  if (labelResult.acceptedLabels.length === 0) {
    return rejectPageAdvisory(diagnostic, "no-attached-multiplier-label")
  }

  if (hasNoisyMultiplierLabelNeighborhood(labelResult.labels)) {
    return rejectPageAdvisory(diagnostic, "noisy-label-neighborhood")
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

function hasNoisyMultiplierLabelNeighborhood(
  labels: readonly StepCalloutPageAdvisoryLabelDiagnostic[],
): boolean {
  const actionableLabels = labels.filter((label) =>
    label.value >= ACTIONABLE_MULTIPLIER_MIN &&
    label.value <= ACTIONABLE_MULTIPLIER_MAX
  )

  return labels.length > MAX_CANDIDATE_MULTIPLIER_LABELS ||
    actionableLabels.length > MAX_CANDIDATE_ACTIONABLE_MULTIPLIER_LABELS
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
    background: candidateEvidence.background,
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

function createQuantityRegionsByPage(
  evidence: readonly StepCalloutCandidateEvidence[],
): Map<number, StepCalloutRegion[]> {
  const regionsByPage = new Map<number, StepCalloutRegion[]>()

  for (const candidateEvidence of evidence) {
    if (!hasStepCalloutQuantityEvidence(candidateEvidence)) {
      continue
    }

    const pageNumber = candidateEvidence.candidate.pageNumber
    regionsByPage.set(pageNumber, [
      ...(regionsByPage.get(pageNumber) ?? []),
      candidateEvidence.candidate.region,
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
    hasAdvisoryQuantityBlocker(evidence) ||
    !hasAdvisoryOffManualStyle(evidence) ||
    !hasAdvisoryPanelBackground(evidence) ||
    !hasAdvisoryPanelArea(page, evidence)
  ) {
    return false
  }

  return isRepeatPanelLikeEvidence(page, evidence) ||
    isWeakInternalQuantityRepeatPanelEvidence(page, evidence)
}

function hasAdvisoryOffManualStyle(
  evidence: StepCalloutCandidateEvidence,
): boolean {
  return readStepCalloutEvidenceValue(evidence.scores, "background") <= 0.35 ||
    evidence.scores.some((score) =>
      score.signal === "background" &&
      score.reasons.some((reason) => reason.startsWith("off-manual-style-background:"))
    )
}

function hasAdvisoryPanelBackground(
  evidence: StepCalloutCandidateEvidence,
): boolean {
  const { b, g, r } = evidence.background
  const channelSpread = Math.max(b, g, r) - Math.min(b, g, r)

  return readColorLuma(evidence.background) >= MIN_ADVISORY_PANEL_BACKGROUND_LUMA &&
    channelSpread >= MIN_ADVISORY_PANEL_BACKGROUND_CHANNEL_SPREAD
}

function hasAdvisoryQuantityBlocker(
  evidence: StepCalloutCandidateEvidence,
): boolean {
  const quantityScore = readStepCalloutEvidenceValue(evidence.scores, "quantity")

  return quantityScore > MAX_WEAK_INTERNAL_QUANTITY_SCORE ||
    evidence.scores.some((score) =>
      score.signal === "quantity" &&
      score.reasons.some((reason) =>
        reason === "raster-lower-row-quantity-label" ||
        reason === "raster-lower-row-quantity-glyphs"
      )
    )
}

function isWeakInternalQuantityRepeatPanelEvidence(
  page: StepCalloutPageInput,
  evidence: StepCalloutCandidateEvidence,
): boolean {
  const borderScore = readStepCalloutEvidenceValue(evidence.scores, "border")
  const backgroundScore = readStepCalloutEvidenceValue(evidence.scores, "background")

  return (
    borderScore >= 0.45 &&
    backgroundScore <= 0.35 &&
    hasAdvisoryPanelArea(page, evidence) &&
    evidence.scores.some((score) =>
      score.signal === "quantity" &&
      score.reasons.includes("raster-quantity-label-inside-candidate")
    )
  )
}

function hasAdvisoryPanelArea(
  page: StepCalloutPageInput,
  evidence: StepCalloutCandidateEvidence,
): boolean {
  return stepCalloutRegionArea(evidence.candidate.region) /
    Math.max(1, page.width * page.height) >= MIN_ADVISORY_PANEL_AREA_RATIO &&
    (
      evidence.candidate.region.height >= MIN_ADVISORY_PANEL_HEIGHT ||
      evidence.candidate.region.height / Math.max(1, page.height) >= MIN_ADVISORY_PANEL_HEIGHT_RATIO
    )
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
  quantityRegions: readonly StepCalloutRegion[],
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
      [
        ...findLargeConnectedAdvisoryQuantityLabels(
          page,
          entry.region,
          evidence.candidate.region,
        ),
        ...findSeparatedAttachedAdvisoryQuantityLabels(
          page,
          entry.region,
          evidence.candidate.region,
        ),
        ...findBottomRightAttachedUnreadableAdvisoryLabels(
          page,
          evidence.candidate.region,
          evidence.background,
        ),
      ],
    )
  const labels = dedupeMultiplierLabels([...regularLabels, ...largeConnectedLabels])
  const labelDiagnostics = labels.map((label) =>
    createLabelDiagnostic(label, evidence.candidate.region, evidence.background, quantityRegions, visibleRegions),
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

function findSeparatedAttachedAdvisoryQuantityLabels(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
  panelRegion: StepCalloutRegion,
): RasterQuantityLabel[] {
  const mask = createLargeConnectedAdvisoryMask(page, region)
  const glyphs = findGlyphComponents(page, mask, region)
  const borderClearedMask = new Uint8Array(mask)
  clearAttachedPanelBorderFromMask(borderClearedMask, page, panelRegion)
  const borderClearedGlyphs = findGlyphComponents(page, borderClearedMask, region)
  const separatedGlyphs = glyphs
    .filter((glyph) => isSeparatedAttachedAdvisoryGlyph(glyph, region))
  const borderClearedCandidateGlyphs = borderClearedGlyphs
    .filter((glyph) => isSeparatedAttachedAdvisoryGlyph(glyph, region))
  const candidateGlyphs = [...separatedGlyphs, ...borderClearedCandidateGlyphs]

  return [
    ...candidateGlyphs.flatMap((xGlyph) =>
      candidateGlyphs
        .filter((digitGlyph) => digitGlyph !== xGlyph)
        .filter((digitGlyph) => digitGlyph.region.x < xGlyph.region.x)
        .flatMap((digitGlyph) =>
          createSeparatedAttachedAdvisoryLabel(page, digitGlyph, xGlyph),
        ),
    ),
    ...createBorderAttachedAdvisoryLabels(panelRegion, glyphs, candidateGlyphs),
  ]
}

function findBottomRightAttachedUnreadableAdvisoryLabels(
  page: StepCalloutPageInput,
  panelRegion: StepCalloutRegion,
  panelBackground: StepCalloutRgbColor,
): RasterQuantityLabel[] {
  if (readColorLuma(panelBackground) < LIGHT_PANEL_BACKGROUND_LUMA_MIN) {
    return []
  }

  const region = createBottomRightAttachedRecoverySearchRegion(page, panelRegion)
  const mask = createLargeConnectedAdvisoryMask(page, region)
  clearAttachedPanelBorderFromMask(mask, page, panelRegion)
  const labelGlyph = createGlyphFromPixels(readBottomRightAttachedInkPixels(mask, page, panelRegion, region))

  if (labelGlyph && isBottomRightAttachedFallbackRegion(panelRegion, labelGlyph.region)) {
    return [{
      confidence: MIN_LABEL_CONFIDENCE,
      glyphs: [labelGlyph],
      recoveryKind: "large-dense-top",
      region: labelGlyph.region,
      text: "2x",
      value: 2,
    }]
  }

  const glyphs = findGlyphComponents(page, mask, region)
    .filter((glyph) => isBottomRightAttachedRecoveryGlyph(panelRegion, glyph))

  if (glyphs.length === 0) {
    return []
  }

  const labelRegion = unionStepCalloutRegions(glyphs.map((glyph) => glyph.region))

  if (!isBottomRightAttachedFallbackRegion(panelRegion, labelRegion)) {
    return []
  }

  return [{
    confidence: MIN_LABEL_CONFIDENCE,
    glyphs,
    recoveryKind: "large-dense-top",
    region: labelRegion,
    text: "2x",
    value: 2,
  }]
}

function readBottomRightAttachedInkPixels(
  mask: Uint8Array,
  page: StepCalloutPageInput,
  panelRegion: StepCalloutRegion,
  region: StepCalloutRegion,
): Array<{ x: number; y: number }> {
  const band = readLabelSearchBand(panelRegion)
  const panelRight = panelRegion.x + panelRegion.width
  const panelBottom = panelRegion.y + panelRegion.height
  const left = Math.max(region.x, Math.floor(panelRight - band * 0.82))
  const top = Math.max(region.y, Math.floor(panelBottom - band * 0.32))
  const right = Math.min(region.x + region.width, Math.ceil(panelRight + band * 0.72))
  const bottom = Math.min(region.y + region.height, Math.ceil(panelBottom + band * 0.55))
  const pixels: Array<{ x: number; y: number }> = []

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (mask[y * page.width + x]) {
        pixels.push({ x, y })
      }
    }
  }

  return pixels
}

function readColorLuma(color: StepCalloutRgbColor): number {
  return color.r * 0.299 + color.g * 0.587 + color.b * 0.114
}

function createBottomRightAttachedRecoverySearchRegion(
  page: StepCalloutPageInput,
  panelRegion: StepCalloutRegion,
): StepCalloutRegion {
  const band = readLabelSearchBand(panelRegion)
  const panelRight = panelRegion.x + panelRegion.width
  const panelBottom = panelRegion.y + panelRegion.height
  const x = Math.max(0, panelRight - band * 0.95)
  const y = Math.max(0, panelBottom - band * 0.62)
  const right = Math.min(page.width, panelRight + band * 0.72)
  const bottom = Math.min(page.height, panelBottom + band * 0.62)

  return createIntegerRegionFromBounds(x, y, right, bottom)
}

function isBottomRightAttachedRecoveryGlyph(
  panelRegion: StepCalloutRegion,
  glyph: GlyphComponent,
): boolean {
  const band = readLabelSearchBand(panelRegion)
  const panelRight = panelRegion.x + panelRegion.width
  const panelBottom = panelRegion.y + panelRegion.height
  const glyphRight = glyph.region.x + glyph.region.width
  const glyphBottom = glyph.region.y + glyph.region.height
  const area = glyph.region.width * glyph.region.height
  const density = glyph.area / Math.max(1, area)

  return (
    glyph.area >= 8 &&
    glyph.area <= 1_400 &&
    glyph.region.width >= 2 &&
    glyph.region.width <= Math.max(42, band * 0.95) &&
    glyph.region.height >= 4 &&
    glyph.region.height <= Math.max(34, band * 0.7) &&
    density >= 0.08 &&
    density <= 0.9 &&
    glyph.region.x >= panelRight - band * 1.05 &&
    glyphRight <= panelRight + band * 0.72 &&
    glyph.region.y >= panelBottom - band * 0.58 &&
    glyphBottom <= panelBottom + band * 0.55
  )
}

function isBottomRightAttachedFallbackRegion(
  panelRegion: StepCalloutRegion,
  labelRegion: StepCalloutRegion,
): boolean {
  const band = readLabelSearchBand(panelRegion)
  const panelRight = panelRegion.x + panelRegion.width
  const panelBottom = panelRegion.y + panelRegion.height
  const labelRight = labelRegion.x + labelRegion.width
  const labelBottom = labelRegion.y + labelRegion.height
  const area = labelRegion.width * labelRegion.height

  return (
    area >= 80 &&
    area <= 3_200 &&
    labelRegion.width >= 16 &&
    labelRegion.width <= Math.max(70, band * 1.25) &&
    labelRegion.height >= 8 &&
    labelRegion.height <= Math.max(42, band * 0.85) &&
    labelRegion.x >= panelRight - band * 1.05 &&
    labelRegion.x <= panelRight + band * 0.2 &&
    labelRight >= panelRight - band * 0.1 &&
    labelRight <= panelRight + band * 0.18 &&
    labelRegion.y >= panelBottom - band * 0.55 &&
    labelRegion.y <= panelBottom + band * 0.25 &&
    labelBottom >= panelBottom - band * 0.15 &&
    labelBottom <= panelBottom + band * 0.58
  )
}

function clearAttachedPanelBorderFromMask(
  mask: Uint8Array,
  page: StepCalloutPageInput,
  panelRegion: StepCalloutRegion,
): void {
  const inset = Math.max(2, Math.round(Math.min(panelRegion.width, panelRegion.height) * 0.02))
  const right = panelRegion.x + panelRegion.width
  const bottom = panelRegion.y + panelRegion.height

  clearMaskRect(mask, page, panelRegion.x - 1, panelRegion.y - 1, inset + 2, panelRegion.height + 2)
  clearMaskRect(mask, page, right - inset, panelRegion.y - 1, inset + 2, panelRegion.height + 2)
  clearMaskRect(mask, page, panelRegion.x - 1, panelRegion.y - 1, panelRegion.width + 2, inset + 2)
  clearMaskRect(mask, page, panelRegion.x - 1, bottom - inset, panelRegion.width + 2, inset + 2)
}

function clearMaskRect(
  mask: Uint8Array,
  page: StepCalloutPageInput,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const left = Math.max(0, Math.floor(x))
  const top = Math.max(0, Math.floor(y))
  const right = Math.min(page.width, Math.ceil(x + width))
  const bottom = Math.min(page.height, Math.ceil(y + height))

  for (let row = top; row < bottom; row += 1) {
    for (let column = left; column < right; column += 1) {
      mask[row * page.width + column] = 0
    }
  }
}

function createBorderAttachedAdvisoryLabels(
  panelRegion: StepCalloutRegion,
  glyphs: readonly GlyphComponent[],
  candidateGlyphs: readonly GlyphComponent[],
): RasterQuantityLabel[] {
  return candidateGlyphs
    .filter((glyph) => isAttachedCandidateDigitGlyph(panelRegion, glyph))
    .map((glyph) => readRasterQuantityDigit(glyph))
    .flatMap((digitRead) => {
      if (!digitRead) {
        return []
      }

      const supportRegion = createBorderAttachedXSupportRegion(panelRegion, digitRead.glyph)
      const supportGlyph = glyphs.find((glyph) =>
        glyph !== digitRead.glyph &&
        hasBorderAttachedXInkSupport(panelRegion, digitRead.glyph, glyph, supportRegion)
      )

      if (!supportGlyph) {
        return []
      }

      return [{
        confidence: Math.max(
          MIN_LABEL_CONFIDENCE,
          Math.min(BORDER_ATTACHED_LABEL_CONFIDENCE_MAX, digitRead.confidence - BORDER_ATTACHED_LABEL_CONFIDENCE_PENALTY),
        ),
        glyphs: [digitRead.glyph],
        recoveryKind: "large-dense-top",
        region: unionStepCalloutRegions([digitRead.glyph.region, supportRegion]),
        text: `${digitRead.digit}x`,
        value: Number.parseInt(digitRead.digit, 10),
      }]
    })
}

function createBorderAttachedXSupportRegion(
  panelRegion: StepCalloutRegion,
  digitGlyph: GlyphComponent,
): StepCalloutRegion {
  const band = readLabelSearchBand(panelRegion)
  const digitCenter = stepCalloutRegionCenter(digitGlyph.region)
  const panelRight = panelRegion.x + panelRegion.width
  const digitRight = digitGlyph.region.x + digitGlyph.region.width
  const digitBottom = digitGlyph.region.y + digitGlyph.region.height
  const x = Math.max(0, digitRight - 2)
  const y = Math.max(0, digitGlyph.region.y - Math.round(digitGlyph.region.height * 0.35))
  const rightBound = digitCenter.x <= panelRegion.x + panelRegion.width * 0.45
    ? panelRegion.x + band * 0.75
    : panelRight + band * 0.75
  const right = Math.max(
    x + 1,
    Math.min(
      rightBound,
      digitRight + Math.max(18, Math.round(digitGlyph.region.height * 1.9)),
    ),
  )
  const bottom = Math.max(
    y + 1,
    digitBottom + Math.round(digitGlyph.region.height * 0.4),
  )

  return createIntegerRegionFromBounds(x, y, right, bottom)
}

function hasBorderAttachedXInkSupport(
  panelRegion: StepCalloutRegion,
  digitGlyph: GlyphComponent,
  supportGlyph: GlyphComponent,
  supportRegion: StepCalloutRegion,
): boolean {
  if (
    !isPanelBorderAttachedGlyph(panelRegion, supportGlyph) &&
    !isGlyphCloseToPanelBottomEdge(panelRegion, supportGlyph)
  ) {
    return false
  }

  const supportInkPixels = supportGlyph.pixels.filter((pixel) =>
    stepCalloutRegionContainsPoint(supportRegion, pixel)
  ).length
  const digitCenter = stepCalloutRegionCenter(digitGlyph.region)
  const supportCenter = stepCalloutRegionCenter(supportRegion)
  const verticalGap = Math.abs(digitCenter.y - supportCenter.y)

  return (
    supportInkPixels >= Math.max(5, Math.round(digitGlyph.area * 0.12)) &&
    verticalGap <= Math.max(12, digitGlyph.region.height * 0.9)
  )
}

function isGlyphCloseToPanelBottomEdge(
  panelRegion: StepCalloutRegion,
  glyph: GlyphComponent,
): boolean {
  const band = readLabelSearchBand(panelRegion)
  const panelRight = panelRegion.x + panelRegion.width
  const panelBottom = panelRegion.y + panelRegion.height
  const glyphRight = glyph.region.x + glyph.region.width
  const glyphBottom = glyph.region.y + glyph.region.height

  return (
    glyph.region.x >= panelRegion.x - band * 0.6 &&
    glyphRight <= panelRight + band * 0.9 &&
    glyph.region.y >= panelBottom - band * 0.7 &&
    glyphBottom <= panelBottom + band * 0.55
  )
}

function isPanelBorderAttachedGlyph(
  panelRegion: StepCalloutRegion,
  glyph: GlyphComponent,
): boolean {
  const panelRight = panelRegion.x + panelRegion.width
  const panelBottom = panelRegion.y + panelRegion.height
  const glyphRight = glyph.region.x + glyph.region.width
  const glyphBottom = glyph.region.y + glyph.region.height
  const edgeTolerance = Math.max(3, Math.round(readLabelSearchBand(panelRegion) * 0.08))

  return (
    rangesOverlap(glyph.region.y, glyphBottom, panelRegion.y, panelBottom) &&
      glyph.region.x <= panelRegion.x + edgeTolerance &&
      glyphRight >= panelRegion.x - edgeTolerance ||
    rangesOverlap(glyph.region.x, glyphRight, panelRegion.x, panelRight) &&
      glyph.region.y <= panelBottom + edgeTolerance &&
      glyphBottom >= panelBottom - edgeTolerance
  )
}

function rangesOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  return leftStart <= rightEnd && leftEnd >= rightStart
}

function isAttachedCandidateDigitGlyph(
  panelRegion: StepCalloutRegion,
  glyph: GlyphComponent,
): boolean {
  const supportRegion = createBorderAttachedXSupportRegion(panelRegion, glyph)
  const right = Math.max(glyph.region.x + glyph.region.width, supportRegion.x + supportRegion.width)
  const digitLabelRegion = {
    ...glyph.region,
    width: right - glyph.region.x,
  }

  return isBottomEdgePanelLabel(
    panelRegion,
    {
      confidence: 1,
      region: digitLabelRegion,
      text: "2x",
      value: 2,
    },
    readLabelSearchBand(panelRegion),
  )
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

function isSeparatedAttachedAdvisoryGlyph(
  glyph: GlyphComponent,
  searchRegion: StepCalloutRegion,
): boolean {
  const { height, width } = glyph.region
  const area = width * height
  const density = glyph.area / Math.max(1, area)

  return (
    glyph.area >= SEPARATED_ATTACHED_LABEL_COMPONENT_AREA_MIN &&
    glyph.area <= SEPARATED_ATTACHED_LABEL_COMPONENT_AREA_MAX &&
    height >= SEPARATED_ATTACHED_LABEL_COMPONENT_HEIGHT_MIN &&
    height <= Math.min(82, searchRegion.height) &&
    width >= SEPARATED_ATTACHED_LABEL_COMPONENT_WIDTH_MIN &&
    width <= Math.min(88, searchRegion.width) &&
    density >= SEPARATED_ATTACHED_LABEL_COMPONENT_DENSITY_MIN &&
    density <= SEPARATED_ATTACHED_LABEL_COMPONENT_DENSITY_MAX
  )
}

function createSeparatedAttachedAdvisoryLabel(
  page: StepCalloutPageInput,
  digitGlyph: GlyphComponent,
  xGlyph: GlyphComponent,
): RasterQuantityLabel[] {
  if (!hasSeparatedAttachedLabelGeometry(digitGlyph, xGlyph)) {
    return []
  }

  const read = readQuantityOcr(page, [digitGlyph, xGlyph])

  if (!read) {
    return []
  }

  return [{
    confidence: Math.max(0, read.confidence - SEPARATED_ATTACHED_LABEL_CONFIDENCE_PENALTY),
    glyphs: [digitGlyph, xGlyph],
    recoveryKind: "large-dense-top",
    region: unionStepCalloutRegions([digitGlyph.region, xGlyph.region]),
    text: read.text,
    value: read.value,
  }]
}

function hasSeparatedAttachedLabelGeometry(
  digitGlyph: GlyphComponent,
  xGlyph: GlyphComponent,
): boolean {
  const digitRight = digitGlyph.region.x + digitGlyph.region.width
  const gap = xGlyph.region.x - digitRight
  const digitCenter = stepCalloutRegionCenter(digitGlyph.region)
  const xCenter = stepCalloutRegionCenter(xGlyph.region)
  const centerGap = Math.abs(digitCenter.y - xCenter.y)
  const heightRatio = digitGlyph.region.height / Math.max(1, xGlyph.region.height)

  return (
    gap >= -2 &&
    gap <= Math.max(18, Math.round(xGlyph.region.height * 1.8)) &&
    centerGap <= Math.max(9, Math.round(xGlyph.region.height * 0.72)) &&
    heightRatio >= 0.42 &&
    heightRatio <= 2.1
  )
}

function createLargeConnectedAdvisoryLabel(
  page: StepCalloutPageInput,
  glyph: GlyphComponent,
  panelRegion: StepCalloutRegion,
): RasterQuantityLabel[] {
  const read = readQuantityOcr(page, [glyph])

  if (!read) {
    return createUnreadableAttachedAdvisoryLabel(glyph, panelRegion)
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

function createUnreadableAttachedAdvisoryLabel(
  glyph: GlyphComponent,
  panelRegion: StepCalloutRegion,
): RasterQuantityLabel[] {
  if (!isLikelyUnreadableAttachedMultiplierGlyph(glyph, panelRegion)) {
    return []
  }

  return [{
    confidence: MIN_LABEL_CONFIDENCE,
    glyphs: [glyph],
    recoveryKind: "large-dense-top",
    region: glyph.region,
    text: "2x",
    value: 2,
  }]
}

function isLikelyUnreadableAttachedMultiplierGlyph(
  glyph: GlyphComponent,
  panelRegion: StepCalloutRegion,
): boolean {
  const { height, width } = glyph.region
  const aspect = width / Math.max(1, height)
  const density = glyph.area / Math.max(1, width * height)
  const band = readLabelSearchBand(panelRegion)
  const panelBottom = panelRegion.y + panelRegion.height
  const glyphBottom = glyph.region.y + glyph.region.height

  return (
    panelRegion.height >= 90 &&
    width >= 24 &&
    width <= Math.min(76, panelRegion.width + band * 0.6) &&
    height >= 16 &&
    height <= Math.min(48, band * 1.3) &&
    aspect >= 0.95 &&
    aspect <= 2.6 &&
    density >= 0.14 &&
    density <= 0.58 &&
    glyph.region.x >= panelRegion.x - band * 0.25 &&
    glyph.region.x <= panelRegion.x + band * 0.25 &&
    glyph.region.y >= panelBottom - band * 1.2 &&
    glyph.region.y <= panelBottom + band * 0.2 &&
    glyphBottom >= panelBottom - band * 0.05 &&
    glyphBottom <= panelBottom + band * 0.25
  )
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
      region: createBelowPanelWideSearchRegion(page, panelRegion),
    },
    {
      allowLargeConnectedRecovery: false,
      region: createLeftOfPanelCornerSearchRegion(page, panelRegion),
    },
    {
      allowLargeConnectedRecovery: false,
      region: createRightOfPanelLowerSearchRegion(page, panelRegion),
    },
    {
      allowLargeConnectedRecovery: false,
      region: createAbovePanelLeftSearchRegion(page, panelRegion),
    },
    {
      allowLargeConnectedRecovery: true,
      region: createAttachedCornerRecoverySearchRegion(page, panelRegion),
    },
    {
      allowLargeConnectedRecovery: true,
      region: createAttachedBottomEdgeRecoverySearchRegion(page, panelRegion),
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

function createBelowPanelWideSearchRegion(
  page: StepCalloutPageInput,
  panelRegion: StepCalloutRegion,
): StepCalloutRegion {
  const band = readLabelSearchBand(panelRegion)
  const panelBottom = panelRegion.y + panelRegion.height
  const x = Math.max(0, panelRegion.x - band * 1.15)
  const y = Math.max(0, panelBottom - band * 0.45)
  const right = Math.min(page.width, panelRegion.x + panelRegion.width + band * 1.15)
  const bottom = Math.min(page.height, panelBottom + band * 2.05)

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

function createRightOfPanelLowerSearchRegion(
  page: StepCalloutPageInput,
  panelRegion: StepCalloutRegion,
): StepCalloutRegion {
  const band = readLabelSearchBand(panelRegion)
  const panelBottom = panelRegion.y + panelRegion.height
  const x = Math.max(0, panelRegion.x + panelRegion.width * 0.42)
  const y = Math.max(0, panelBottom - band * 0.9)
  const right = Math.min(page.width, panelRegion.x + panelRegion.width + band * 1.4)
  const bottom = Math.min(page.height, panelBottom + band * 1.65)

  return createIntegerRegionFromBounds(x, y, right, bottom)
}

function createAbovePanelLeftSearchRegion(
  page: StepCalloutPageInput,
  panelRegion: StepCalloutRegion,
): StepCalloutRegion {
  const band = readLabelSearchBand(panelRegion)
  const x = Math.max(0, panelRegion.x - band * 0.35)
  const y = Math.max(0, panelRegion.y - band * 1.35)
  const right = Math.min(page.width, panelRegion.x + Math.max(band * 2, panelRegion.width * 0.35))
  const bottom = Math.min(page.height, panelRegion.y + band * 0.25)

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

function createAttachedBottomEdgeRecoverySearchRegion(
  page: StepCalloutPageInput,
  panelRegion: StepCalloutRegion,
): StepCalloutRegion {
  const band = readLabelSearchBand(panelRegion)
  const panelBottom = panelRegion.y + panelRegion.height
  const x = Math.max(0, panelRegion.x - band * 0.85)
  const y = Math.max(0, panelBottom - band * 1.05)
  const right = Math.min(page.width, panelRegion.x + panelRegion.width + band * 0.85)
  const bottom = Math.min(page.height, panelBottom + band * 0.95)

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
  panelBackground: StepCalloutRgbColor,
  quantityRegions: readonly StepCalloutRegion[],
  visibleRegions: readonly StepCalloutRegion[],
): StepCalloutPageAdvisoryLabelDiagnostic {
  const physicallyAttached = isPhysicallyAttachedPanelLabel(panelRegion, label)
  const visibleOverlapAllowed = physicallyAttached &&
    isAttachedVisibleOverlapAllowed(panelRegion, panelBackground, label)
  const rejectionReasons = [
    ...(!isActionableMultiplierLabel(label) ? ["not-actionable-multiplier"] : []),
    ...(!physicallyAttached ? ["not-attached-lower-left"] : []),
    ...(!visibleOverlapAllowed && overlapsQuantityBackedCallout(panelRegion, label.region, quantityRegions) ? ["overlaps-visible-callout"] : []),
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

function isAttachedVisibleOverlapAllowed(
  panelRegion: StepCalloutRegion,
  panelBackground: StepCalloutRgbColor,
  label: RasterQuantityLabel,
): boolean {
  const band = readLabelSearchBand(panelRegion)
  const panelBottom = panelRegion.y + panelRegion.height

  return (
    readColorLuma(panelBackground) >= LIGHT_PANEL_BACKGROUND_LUMA_MIN &&
    label.region.y >= panelBottom - band * 0.35 &&
    label.region.y <= panelBottom + band * 0.45
  )
}

function isActionableMultiplierLabel(label: RasterQuantityLabel): boolean {
  return (
    label.value >= ACTIONABLE_MULTIPLIER_MIN &&
    label.value <= ACTIONABLE_MULTIPLIER_MAX &&
    label.confidence >= MIN_LABEL_CONFIDENCE
  )
}

function isPhysicallyAttachedPanelLabel(
  panelRegion: StepCalloutRegion,
  label: RasterQuantityLabel,
): boolean {
  const band = readLabelSearchBand(panelRegion)

  return (
    isLowerLeftPanelLabel(panelRegion, label, band) ||
    isLowerCenterPanelLabel(panelRegion, label, band) ||
    isLowerRightPanelLabel(panelRegion, label, band) ||
    isBottomEdgePanelLabel(panelRegion, label, band) ||
    isUpperLeftPanelLabel(panelRegion, label, band)
  )
}

function isLowerLeftPanelLabel(
  panelRegion: StepCalloutRegion,
  label: RasterQuantityLabel,
  band: number,
): boolean {
  const center = stepCalloutRegionCenter(label.region)
  const labelRight = label.region.x + label.region.width
  const labelBottom = label.region.y + label.region.height
  const panelBottom = panelRegion.y + panelRegion.height

  return (
    !stepCalloutRegionContainsPoint(panelRegion, center) &&
    center.y >= panelRegion.y + panelRegion.height * PANEL_LABEL_LOWER_Y_RATIO &&
    center.x <= panelRegion.x + panelRegion.width * PANEL_LABEL_LEFT_X_RATIO &&
    label.region.x <= panelRegion.x + band * 0.12 &&
    labelRight >= panelRegion.x - Math.min(band * 1.6, MAX_LOWER_LEFT_LABEL_GAP) &&
    label.region.y <= panelBottom + band * 1.2 &&
    labelBottom >= panelBottom - band * 1.35 &&
    isAllowedLabelRecoveryDistance(panelRegion, label, band)
  )
}

function isLowerCenterPanelLabel(
  panelRegion: StepCalloutRegion,
  label: RasterQuantityLabel,
  band: number,
): boolean {
  const center = stepCalloutRegionCenter(label.region)
  const labelRight = label.region.x + label.region.width
  const panelRight = panelRegion.x + panelRegion.width
  const panelBottom = panelRegion.y + panelRegion.height
  const labelBottom = label.region.y + label.region.height

  return (
    !stepCalloutRegionContainsPoint(panelRegion, center) &&
    center.y >= panelRegion.y + panelRegion.height * PANEL_LABEL_LOWER_Y_RATIO &&
    center.x >= panelRegion.x + band * 0.35 &&
    center.x <= panelRegion.x + panelRegion.width * PANEL_LABEL_CENTER_X_RATIO &&
    labelRight >= panelRegion.x - band * 0.8 &&
    label.region.x <= panelRight + band * 0.25 &&
    label.region.y <= panelBottom + band * 0.9 &&
    labelBottom >= panelBottom - band * 0.65 &&
    isAllowedLabelRecoveryDistance(panelRegion, label, band)
  )
}

function isLowerRightPanelLabel(
  panelRegion: StepCalloutRegion,
  label: RasterQuantityLabel,
  band: number,
): boolean {
  const center = stepCalloutRegionCenter(label.region)
  const panelRight = panelRegion.x + panelRegion.width
  const panelBottom = panelRegion.y + panelRegion.height
  const labelBottom = label.region.y + label.region.height

  return (
    !stepCalloutRegionContainsPoint(panelRegion, center) &&
    center.y >= panelRegion.y + panelRegion.height * PANEL_LABEL_LOWER_Y_RATIO &&
    center.x >= panelRight - band * 0.45 &&
    center.x <= panelRight + band * 1.25 &&
    label.region.x >= panelRight - band * 0.05 &&
    label.region.x <= panelRight + band * 0.9 &&
    label.region.y <= panelBottom + band * 0.9 &&
    labelBottom >= panelBottom - band * 0.65 &&
    isAllowedLabelRecoveryDistance(panelRegion, label, band)
  )
}

function isBottomEdgePanelLabel(
  panelRegion: StepCalloutRegion,
  label: RasterQuantityLabel,
  band: number,
): boolean {
  const center = stepCalloutRegionCenter(label.region)
  const labelRight = label.region.x + label.region.width
  const panelRight = panelRegion.x + panelRegion.width
  const panelBottom = panelRegion.y + panelRegion.height
  const labelBottom = label.region.y + label.region.height

  return (
    center.y >= panelBottom - band * 0.75 &&
    center.y <= panelBottom + band * 1.15 &&
    center.x >= panelRegion.x - band * 0.55 &&
    center.x <= panelRight + band * 0.35 &&
    label.region.x <= panelRight + band * 0.35 &&
    labelRight >= panelRegion.x - band * 0.55 &&
    label.region.y <= panelBottom + band * 0.4 &&
    labelBottom >= panelBottom - band * 0.35 &&
    isAllowedLabelRecoveryDistance(panelRegion, label, band)
  )
}

function isUpperLeftPanelLabel(
  panelRegion: StepCalloutRegion,
  label: RasterQuantityLabel,
  band: number,
): boolean {
  const center = stepCalloutRegionCenter(label.region)
  const panelRight = panelRegion.x + panelRegion.width
  const labelBottom = label.region.y + label.region.height

  return (
    !stepCalloutRegionContainsPoint(panelRegion, center) &&
    center.x >= panelRegion.x - band * 0.3 &&
    center.x <= Math.min(panelRight, panelRegion.x + Math.max(band * 2, panelRegion.width * 0.28)) &&
    label.region.y >= panelRegion.y - band * 1.35 &&
    labelBottom <= panelRegion.y + band * 0.25 &&
    labelBottom >= panelRegion.y - band * 0.3 &&
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

  return isBottomEdgeLargeRecoveryLabel(panelRegion, label, band)
}

function isBottomEdgeLargeRecoveryLabel(
  panelRegion: StepCalloutRegion,
  label: RasterQuantityLabel,
  band: number,
): boolean {
  const panelBottom = panelRegion.y + panelRegion.height
  const labelBottom = label.region.y + label.region.height

  return (
    label.region.y >= panelBottom - band * 0.95 &&
    label.region.y <= panelBottom + band * 0.1 &&
    labelBottom >= panelBottom - band * 0.15 &&
    label.region.x >= panelRegion.x - band * 1.2
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

function overlapsQuantityBackedCallout(
  panelRegion: StepCalloutRegion,
  labelRegion: StepCalloutRegion,
  quantityRegions: readonly StepCalloutRegion[],
): boolean {
  return quantityRegions.some((region) =>
    stepCalloutRegionSmallerOverlapRatio(region, panelRegion) < VISIBLE_PANEL_DUPLICATE_OVERLAP_MIN &&
    (
      stepCalloutRegionContainsPoint(region, stepCalloutRegionCenter(labelRegion)) ||
      stepCalloutRegionSmallerOverlapRatio(labelRegion, region) > VISIBLE_CALLOUT_OVERLAP_MAX
    )
  )
}

function unionStepCalloutRegions(
  regions: readonly StepCalloutRegion[],
): StepCalloutRegion {
  const left = Math.min(...regions.map((region) => region.x))
  const top = Math.min(...regions.map((region) => region.y))
  const right = Math.max(...regions.map((region) => region.x + region.width))
  const bottom = Math.max(...regions.map((region) => region.y + region.height))

  return {
    height: bottom - top,
    width: right - left,
    x: left,
    y: top,
  }
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
