import type {
  StepCalloutCandidateEvidence,
  StepCalloutEvidenceScore,
  StepCalloutPageInput,
  StepCalloutResolvedCallout,
} from "./contracts"
import {
  hasStepCalloutOffManualStyleBackgroundEvidence,
  hasStepCalloutPageLocalBackgroundEvidence,
} from "./evidence-reasons"
import { stepCalloutRegionArea } from "./regions"

export type StepCalloutPageRole =
  | "step-like"
  | "repeat-panel-like"
  | "bom-like"
  | "unknown"

const MIN_REPEAT_PANEL_BORDER_SCORE = 0.45
const MAX_REPEAT_PANEL_QUANTITY_SCORE = 0
const MAX_REPEAT_PANEL_BACKGROUND_SCORE = 0.35
const MIN_REPEAT_PANEL_AREA_RATIO = 0.006
const MIN_BOM_DENSE_CANDIDATES = 8
const MIN_BOM_DENSE_SMALL_CANDIDATE_RATIO = 0.65
const MIN_BOM_QUANTITY_BACKED_CANDIDATES = 4
const MAX_BOM_SMALL_CANDIDATE_AREA_RATIO = 0.035
const MAX_BOM_MEDIUM_CANDIDATE_AREA_RATIO = 0.08

export function classifyStepCalloutPageRoles(
  pages: readonly StepCalloutPageInput[],
  resolvedCallouts: readonly StepCalloutResolvedCallout[],
  evidence: readonly StepCalloutCandidateEvidence[],
): Map<number, StepCalloutPageRole> {
  const resolvedByPage = groupResolvedCalloutsByPage(resolvedCallouts)
  const evidenceByPage = groupEvidenceByPage(evidence)

  return new Map(pages.map((page) => [
    page.pageNumber,
    classifyStepCalloutPageRole(
      page,
      evidenceByPage.get(page.pageNumber) ?? [],
      resolvedByPage.get(page.pageNumber) ?? [],
    ),
  ]))
}

export function classifyStepCalloutPageRole(
  page: StepCalloutPageInput,
  pageEvidence: readonly StepCalloutCandidateEvidence[],
  pageResolvedCallouts: readonly StepCalloutResolvedCallout[],
): StepCalloutPageRole {
  if (pageResolvedCallouts.some((callout) => callout.status === "accepted")) {
    return "step-like"
  }

  if (isBomLikePage(page, pageEvidence)) {
    return "bom-like"
  }

  if (pageEvidence.some((candidateEvidence) =>
    isRepeatPanelLikeEvidence(page, candidateEvidence)
  )) {
    return "repeat-panel-like"
  }

  return "unknown"
}

export function isRepeatPanelLikeEvidence(
  page: StepCalloutPageInput,
  evidence: StepCalloutCandidateEvidence,
): boolean {
  if (
    readEvidenceValue(evidence.scores, "border") < MIN_REPEAT_PANEL_BORDER_SCORE ||
    readEvidenceValue(evidence.scores, "quantity") > MAX_REPEAT_PANEL_QUANTITY_SCORE ||
    !hasRepeatPanelArea(page, evidence)
  ) {
    return false
  }

  return (
    hasStepCalloutOffManualStyleBackgroundEvidence(evidence.scores) ||
    hasStepCalloutPageLocalBackgroundEvidence(evidence.scores) ||
    readEvidenceValue(evidence.scores, "background") <= MAX_REPEAT_PANEL_BACKGROUND_SCORE ||
    evidence.candidate.source === "border" ||
    evidence.candidate.source === "line-rectangle"
  )
}

export function readStepCalloutEvidenceValue(
  scores: readonly StepCalloutEvidenceScore[],
  signal: StepCalloutEvidenceScore["signal"],
): number {
  return readEvidenceValue(scores, signal)
}

function isBomLikePage(
  page: StepCalloutPageInput,
  pageEvidence: readonly StepCalloutCandidateEvidence[],
): boolean {
  if (pageEvidence.length < MIN_BOM_DENSE_CANDIDATES) {
    return false
  }

  const smallCandidates = pageEvidence.filter((candidateEvidence) =>
    isSmallOrMediumListCandidate(page, candidateEvidence, MAX_BOM_SMALL_CANDIDATE_AREA_RATIO)
  )
  const quantityBackedCandidates = pageEvidence.filter(hasStepCalloutQuantityEvidence)

  return (
    smallCandidates.length / pageEvidence.length >= MIN_BOM_DENSE_SMALL_CANDIDATE_RATIO ||
    quantityBackedCandidates.length >= MIN_BOM_QUANTITY_BACKED_CANDIDATES &&
      pageEvidence.every((candidateEvidence) =>
        isSmallOrMediumListCandidate(page, candidateEvidence, MAX_BOM_MEDIUM_CANDIDATE_AREA_RATIO)
      )
  )
}

function hasRepeatPanelArea(
  page: StepCalloutPageInput,
  evidence: StepCalloutCandidateEvidence,
): boolean {
  const areaRatio = stepCalloutRegionArea(evidence.candidate.region) /
    Math.max(1, page.width * page.height)

  return areaRatio >= MIN_REPEAT_PANEL_AREA_RATIO
}

function isSmallOrMediumListCandidate(
  page: StepCalloutPageInput,
  evidence: StepCalloutCandidateEvidence,
  maxAreaRatio: number,
): boolean {
  const areaRatio = stepCalloutRegionArea(evidence.candidate.region) /
    Math.max(1, page.width * page.height)

  return areaRatio <= maxAreaRatio
}

export function hasStepCalloutQuantityEvidence(evidence: StepCalloutCandidateEvidence): boolean {
  return readEvidenceValue(evidence.scores, "quantity") > 0 ||
    evidence.scores.some((score) =>
      score.signal === "quantity" &&
      score.reasons.some((reason) =>
        reason === "raster-lower-row-quantity-label" ||
        reason === "raster-lower-row-quantity-glyphs" ||
        reason === "raster-quantity-label-inside-candidate"
      )
    )
}

function groupResolvedCalloutsByPage(
  resolvedCallouts: readonly StepCalloutResolvedCallout[],
): Map<number, StepCalloutResolvedCallout[]> {
  const byPage = new Map<number, StepCalloutResolvedCallout[]>()

  for (const callout of resolvedCallouts) {
    byPage.set(callout.pageNumber, [...(byPage.get(callout.pageNumber) ?? []), callout])
  }

  return byPage
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

function readEvidenceValue(
  scores: readonly StepCalloutEvidenceScore[],
  signal: StepCalloutEvidenceScore["signal"],
): number {
  return scores.find((score) => score.signal === signal)?.value ?? 0
}
