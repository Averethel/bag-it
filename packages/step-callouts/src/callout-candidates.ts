import {
  findStepCalloutBorderCandidateRegions,
  findStepCalloutLineRectangleCandidateRegions,
} from "./border-candidates"
import type {
  StepCalloutCandidate,
  StepCalloutCandidateSource,
  StepCalloutPageInput,
  StepCalloutRegion,
  StepCalloutStageSnapshot,
} from "./contracts"
import { findStepCalloutFillPanelCandidateRegions } from "./fill-panel-candidates"
import { compareStepCalloutRegions } from "./regions"
import { createEmptyStepCalloutFailureTaxonomy } from "./stage-report"

interface CandidateRegion {
  pageNumber: number
  region: StepCalloutRegion
  source: StepCalloutCandidateSource
}

export interface StepCalloutCandidateStageResult {
  candidates: StepCalloutCandidate[]
  snapshot: StepCalloutStageSnapshot
}

export function detectStepCalloutCandidates(
  pages: readonly StepCalloutPageInput[],
): StepCalloutCandidateStageResult {
  const candidates = pages.flatMap(detectStepCalloutCandidatesForPage)

  return {
    candidates,
    snapshot: createCalloutCandidateStageSnapshot(candidates),
  }
}

export function detectStepCalloutCandidatesForPage(
  page: StepCalloutPageInput,
): StepCalloutCandidate[] {
  const regions = [
    ...createCandidateRegions(page, "border", findStepCalloutBorderCandidateRegions(page)),
    ...createCandidateRegions(page, "line-rectangle", findStepCalloutLineRectangleCandidateRegions(page)),
    ...createCandidateRegions(page, "fill-panel", findStepCalloutFillPanelCandidateRegions(page)),
  ].sort(compareCandidateRegions)

  return assignCandidateIds(page.pageNumber, regions)
}

export function createCalloutCandidateStageSnapshot(
  candidates: readonly StepCalloutCandidate[],
): StepCalloutStageSnapshot {
  return {
    counts: {
      accepted: candidates.length,
      rejected: 0,
      total: candidates.length,
    },
    failures: createEmptyStepCalloutFailureTaxonomy(),
    notes: ["Candidate recall only; no final callout acceptance."],
    stageId: "callout-candidates",
  }
}

function createCandidateRegions(
  page: StepCalloutPageInput,
  source: StepCalloutCandidateSource,
  regions: readonly StepCalloutRegion[],
): CandidateRegion[] {
  return regions.map((region) => ({
    pageNumber: page.pageNumber,
    region,
    source,
  }))
}

function assignCandidateIds(
  pageNumber: number,
  regions: readonly CandidateRegion[],
): StepCalloutCandidate[] {
  const counters = createCandidateSourceCounters()

  return regions.map((candidateRegion) => {
    counters[candidateRegion.source] += 1

    return {
      ...candidateRegion,
      id: formatCandidateId(pageNumber, candidateRegion.source, counters[candidateRegion.source]),
    }
  })
}

function createCandidateSourceCounters(): Record<StepCalloutCandidateSource, number> {
  return {
    border: 0,
    "line-rectangle": 0,
    "fill-panel": 0,
  }
}

function formatCandidateId(
  pageNumber: number,
  source: StepCalloutCandidateSource,
  sourceIndex: number,
): string {
  return `p${pageNumber}-${source}-${String(sourceIndex).padStart(3, "0")}`
}

function compareCandidateRegions(left: CandidateRegion, right: CandidateRegion): number {
  return (
    left.pageNumber - right.pageNumber ||
    sourceRank(left.source) - sourceRank(right.source) ||
    compareStepCalloutRegions(left.region, right.region)
  )
}

function sourceRank(source: StepCalloutCandidateSource): number {
  if (source === "border") {
    return 0
  }

  if (source === "line-rectangle") {
    return 1
  }

  return 2
}
