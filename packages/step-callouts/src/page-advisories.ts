import {
  findRasterQuantityLabels,
  type RasterQuantityLabel,
} from "@bag-it/raster-quantity-labels"
import { readStepCalloutCandidateBackground } from "./candidate-background"
import type {
  StepCalloutCandidateEvidence,
  StepCalloutPageAdvisory,
  StepCalloutPageInput,
  StepCalloutRegion,
  StepCalloutResolvedCallout,
} from "./contracts"
import {
  classifyStepCalloutPageRoles,
  isRepeatPanelLikeEvidence,
  readStepCalloutEvidenceValue,
  type StepCalloutPageRole,
} from "./page-roles"
import { estimateStepCalloutPageBackground } from "./pixels"
import {
  compareStepCalloutRegions,
  stepCalloutRegionCenter,
  stepCalloutRegionContainsPoint,
  stepCalloutRegionContainsRegion,
  stepCalloutRegionSmallerOverlapRatio,
} from "./regions"

const ACTIONABLE_MULTIPLIER_MIN = 2
const ACTIONABLE_MULTIPLIER_MAX = 99
const LABEL_SEARCH_BAND_RATIO = 0.35
const LABEL_SEARCH_BAND_MIN = 18
const LABEL_SEARCH_BAND_MAX = 80
const MIN_LABEL_CONFIDENCE = 0.55
const PANEL_LABEL_LOWER_Y_RATIO = 0.6
const PANEL_LABEL_LEFT_X_RATIO = 0.45
const PANEL_LABEL_INSIDE_LEFT_X_RATIO = 0.3
const VISIBLE_CALLOUT_OVERLAP_MAX = 0.2
const DEDUPE_OVERLAP_MIN = 0.7
const DENSE_NEIGHBOR_MIN = 4
const DENSE_NEIGHBOR_SMALL_AREA_RATIO_MAX = 0.035
const DENSE_NEIGHBOR_REGION_RATIO = 1.35

interface PageAdvisoryCandidate {
  candidateEvidence: StepCalloutCandidateEvidence
  label: RasterQuantityLabel
  page: StepCalloutPageInput
}

export function detectStepCalloutPageAdvisories(
  pages: readonly StepCalloutPageInput[],
  resolvedCallouts: readonly StepCalloutResolvedCallout[],
  evidence: readonly StepCalloutCandidateEvidence[],
): StepCalloutPageAdvisory[] {
  const pageByNumber = new Map(pages.map((page) => [page.pageNumber, page]))
  const evidenceByCandidateId = new Map(
    evidence.map((candidateEvidence) => [candidateEvidence.candidate.id, candidateEvidence]),
  )
  const visibleRegionsByPage = createVisibleRegionsByPage(resolvedCallouts)
  const pageRoles = classifyStepCalloutPageRoles(pages, resolvedCallouts, evidence)
  const firstBuildPageNumber = readFirstBuildPageNumber(pageRoles)

  const candidates = resolvedCallouts.flatMap((callout) => {
    const candidateEvidence = evidenceByCandidateId.get(callout.candidateId)
    const page = pageByNumber.get(callout.pageNumber)

    if (
      !candidateEvidence ||
      !page ||
      !isAdvisoryPage(firstBuildPageNumber, callout.pageNumber, pageRoles.get(callout.pageNumber)) ||
      !isAdvisoryPanelCandidate(callout, page, candidateEvidence, evidence)
    ) {
      return []
    }

    return findOutsideMultiplierLabels(page, candidateEvidence, visibleRegionsByPage.get(callout.pageNumber) ?? [])
      .map((label) => ({ candidateEvidence, label, page }))
  })

  return dedupeAdvisoryCandidates(candidates).map(createPageAdvisory)
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

function readFirstBuildPageNumber(
  pageRoles: ReadonlyMap<number, StepCalloutPageRole>,
): number | null {
  const firstBuildPage = [...pageRoles.entries()]
    .filter(([, role]) => role === "step-like")
    .map(([pageNumber]) => pageNumber)
    .sort((left, right) => left - right)[0]

  return firstBuildPage ?? null
}

function isAdvisoryPage(
  firstBuildPageNumber: number | null,
  pageNumber: number,
  role: StepCalloutPageRole | undefined,
): boolean {
  return (
    firstBuildPageNumber !== null &&
    pageNumber >= firstBuildPageNumber &&
    (role === "step-like" || role === "repeat-panel-like")
  )
}

function isAdvisoryPanelCandidate(
  callout: StepCalloutResolvedCallout,
  page: StepCalloutPageInput,
  evidence: StepCalloutCandidateEvidence,
  allEvidence: readonly StepCalloutCandidateEvidence[],
): boolean {
  return (
    callout.status !== "accepted" &&
    isRepeatPanelLikeEvidence(page, evidence) &&
    !hasDenseNeighboringCandidateLayout(page, evidence, allEvidence)
  )
}

function findOutsideMultiplierLabels(
  page: StepCalloutPageInput,
  evidence: StepCalloutCandidateEvidence,
  visibleRegions: readonly StepCalloutRegion[],
): RasterQuantityLabel[] {
  const labelSearchRegion = createLabelSearchRegion(page, evidence.candidate.region)
  const searchBackground = readStepCalloutCandidateBackground(page, labelSearchRegion)
  const pageBackground = estimateStepCalloutPageBackground(page)

  return dedupeMultiplierLabels([
    ...findRasterQuantityLabels(page, labelSearchRegion, searchBackground),
    ...findRasterQuantityLabels(page, labelSearchRegion, pageBackground),
  ])
    .filter((label) => isActionableMultiplierLabel(label))
    .filter((label) => isPhysicallyAttachedLowerLeftLabel(evidence.candidate.region, label))
    .filter((label) => !overlapsVisibleCallout(label.region, visibleRegions))
}

function createLabelSearchRegion(
  page: StepCalloutPageInput,
  panelRegion: StepCalloutRegion,
): StepCalloutRegion {
  const band = readLabelSearchBand(panelRegion)
  const x = Math.max(0, panelRegion.x - band)
  const y = Math.max(0, panelRegion.y + panelRegion.height * 0.45)
  const right = Math.min(page.width, panelRegion.x + panelRegion.width * PANEL_LABEL_LEFT_X_RATIO)
  const bottom = Math.min(page.height, panelRegion.y + panelRegion.height + band)

  return {
    height: Math.max(0, bottom - y),
    width: Math.max(0, right - x),
    x,
    y,
  }
}

function readLabelSearchBand(panelRegion: StepCalloutRegion): number {
  return Math.min(
    LABEL_SEARCH_BAND_MAX,
    Math.max(LABEL_SEARCH_BAND_MIN, Math.round(Math.min(panelRegion.width, panelRegion.height) * LABEL_SEARCH_BAND_RATIO)),
  )
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
    labelRight >= panelRegion.x - band &&
    labelRight <= panelRegion.x + panelRegion.width * PANEL_LABEL_INSIDE_LEFT_X_RATIO &&
    label.region.y <= panelBottom + band &&
    labelBottom >= panelRegion.y + panelRegion.height * PANEL_LABEL_LOWER_Y_RATIO
  )
}

function hasDenseNeighboringCandidateLayout(
  page: StepCalloutPageInput,
  panelEvidence: StepCalloutCandidateEvidence,
  allEvidence: readonly StepCalloutCandidateEvidence[],
): boolean {
  const neighborhood = expandPanelNeighborhood(page, panelEvidence.candidate.region)
  const neighbors = allEvidence.filter((candidateEvidence) =>
    candidateEvidence.candidate.id !== panelEvidence.candidate.id &&
    candidateEvidence.candidate.pageNumber === panelEvidence.candidate.pageNumber &&
    stepCalloutRegionContainsRegion(neighborhood, candidateEvidence.candidate.region)
  )
  const smallNeighbors = neighbors.filter((candidateEvidence) =>
    stepCalloutRegionAreaRatio(page, candidateEvidence.candidate.region) <=
      DENSE_NEIGHBOR_SMALL_AREA_RATIO_MAX ||
    readStepCalloutEvidenceValue(candidateEvidence.scores, "quantity") > 0
  )

  return smallNeighbors.length >= DENSE_NEIGHBOR_MIN
}

function expandPanelNeighborhood(
  page: StepCalloutPageInput,
  panelRegion: StepCalloutRegion,
): StepCalloutRegion {
  const xPadding = panelRegion.width * DENSE_NEIGHBOR_REGION_RATIO
  const yPadding = panelRegion.height * DENSE_NEIGHBOR_REGION_RATIO
  const x = Math.max(0, panelRegion.x - xPadding)
  const y = Math.max(0, panelRegion.y - yPadding)
  const right = Math.min(page.width, panelRegion.x + panelRegion.width + xPadding)
  const bottom = Math.min(page.height, panelRegion.y + panelRegion.height + yPadding)

  return {
    height: bottom - y,
    width: right - x,
    x,
    y,
  }
}

function stepCalloutRegionAreaRatio(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
): number {
  return (region.width * region.height) / Math.max(1, page.width * page.height)
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
