import type {
  StepCalloutCandidate,
  StepCalloutCandidateEvidence,
  StepCalloutEvidenceScore,
  StepCalloutPageInput,
  StepCalloutStageSnapshot,
} from "./contracts"
import { readStepCalloutCandidateBackground } from "./candidate-background"
import { scoreStepCalloutBackgroundEvidence } from "./evidence-background"
import { scoreStepCalloutBorderEvidence } from "./evidence-border"
import { scoreStepCalloutQuantityEvidence } from "./evidence-quantity"
import {
  inferStepCalloutManualCalloutStyle,
  type StepCalloutManualStyle,
} from "./manual-style"
import { createEmptyStepCalloutFailureTaxonomy } from "./stage-report"
import { stepCalloutRegionArea } from "./regions"

const COMPACT_TOP_PAGE_LOCAL_AREA_MIN = 3000
const COMPACT_TOP_PAGE_LOCAL_AREA_RATIO_MAX = 0.02
const COMPACT_TOP_PAGE_LOCAL_TOP_RATIO_MAX = 0.18
const COMPACT_TOP_PAGE_LOCAL_WIDTH_MAX = 120

export interface StepCalloutEvidenceStageResult {
  evidence: StepCalloutCandidateEvidence[]
  snapshot: StepCalloutStageSnapshot
}

export function scoreStepCalloutEvidence(
  pages: readonly StepCalloutPageInput[],
  candidates: readonly StepCalloutCandidate[],
): StepCalloutEvidenceStageResult {
  const pageByNumber = createPageLookup(pages)
  const manualStyle = inferStepCalloutManualCalloutStyle(pages, candidates)
  const evidence = candidates.map((candidate) =>
    scoreCandidateEvidence(requirePage(pageByNumber, candidate), candidate, manualStyle),
  )

  return {
    evidence,
    snapshot: createCalloutEvidenceStageSnapshot(evidence),
  }
}

export function scoreCandidateEvidence(
  page: StepCalloutPageInput,
  candidate: StepCalloutCandidate,
  manualStyle: StepCalloutManualStyle | null = null,
): StepCalloutCandidateEvidence {
  const background = readStepCalloutCandidateBackground(page, candidate.region)
  const borderScore = scoreStepCalloutBorderEvidence(page, candidate, background)
  const quantityScore = scoreStepCalloutQuantityEvidence(page, candidate, background)
  const backgroundScore = scoreStepCalloutBackgroundEvidence(page, candidate, background, manualStyle, {
    allowPageLocalFallback: quantityScore.value >= 0.6,
    forcePageLocalFallback: hasCompactTopPageLocalFallbackShape(page, candidate) &&
      quantityScore.value >= 0.6,
  })
  const scores = [
    borderScore,
    backgroundScore,
    quantityScore,
  ]

  return {
    background,
    candidate,
    scores,
    totalScore: sumEvidenceScores(scores),
  }
}

function hasCompactTopPageLocalFallbackShape(
  page: StepCalloutPageInput,
  candidate: StepCalloutCandidate,
): boolean {
  const area = stepCalloutRegionArea(candidate.region)

  return (
    candidate.source === "fill-panel" &&
    candidate.region.y / page.height <= COMPACT_TOP_PAGE_LOCAL_TOP_RATIO_MAX &&
    candidate.region.width <= COMPACT_TOP_PAGE_LOCAL_WIDTH_MAX &&
    area >= COMPACT_TOP_PAGE_LOCAL_AREA_MIN &&
    area / (page.width * page.height) <= COMPACT_TOP_PAGE_LOCAL_AREA_RATIO_MAX
  )
}

export function createCalloutEvidenceStageSnapshot(
  evidence: readonly StepCalloutCandidateEvidence[],
): StepCalloutStageSnapshot {
  return {
    counts: {
      accepted: evidence.length,
      rejected: 0,
      total: evidence.length,
    },
    failures: createEmptyStepCalloutFailureTaxonomy(),
    notes: ["Evidence scoring only; resolver owns callout statuses."],
    stageId: "callout-evidence",
  }
}

function createPageLookup(
  pages: readonly StepCalloutPageInput[],
): Map<number, StepCalloutPageInput> {
  return new Map(pages.map((page) => [page.pageNumber, page]))
}

function requirePage(
  pageByNumber: ReadonlyMap<number, StepCalloutPageInput>,
  candidate: StepCalloutCandidate,
): StepCalloutPageInput {
  const page = pageByNumber.get(candidate.pageNumber)

  if (!page) {
    throw new RangeError(`candidate page ${candidate.pageNumber} missing from page inputs.`)
  }

  return page
}

function sumEvidenceScores(scores: readonly StepCalloutEvidenceScore[]): number {
  return scores.reduce((total, score) => total + score.value, 0)
}
