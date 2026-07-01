import { createStepCalloutResolutionDraft } from "./candidate-classification"
import type {
  StepCalloutCandidateEvidence,
  StepCalloutPageInput,
  StepCalloutResolvedCallout,
  StepCalloutResolutionStatus,
  StepCalloutStageSnapshot,
} from "./contracts"
import { resolveDuplicateStepCalloutDrafts } from "./duplicate-resolution"
import { rejectUnsupportedLeadingStepCalloutDiagnostics } from "./leading-page-support"
import { refineStepCalloutPageStyleDiagnosticLayout } from "./page-style-diagnostic-layout"
import { refineStepCalloutRasterStepNumberLayout } from "./raster-step-number-layout"
import {
  createStepCalloutResolvedCallout,
  rejectStepCalloutResolutionDraft,
  type StepCalloutResolutionDraft,
} from "./resolution-draft"
import {
  createEmptyStepCalloutFailureTaxonomy,
  createStepCalloutFailureTaxonomy,
} from "./stage-report"
import { refineStepCalloutVisualDiagnosticLayout } from "./visual-diagnostic-layout"

export interface StepCalloutResolutionStageResult {
  resolvedCallouts: StepCalloutResolvedCallout[]
  snapshot: StepCalloutStageSnapshot
}

export interface StepCalloutResolutionOptions {
  pages?: readonly StepCalloutPageInput[]
}

export function resolveStepCalloutConflicts(
  evidence: readonly StepCalloutCandidateEvidence[],
  options: StepCalloutResolutionOptions = {},
): StepCalloutResolutionStageResult {
  const pages = options.pages ?? []
  const pageByNumber = createPageLookup(pages)
  const drafts = evidence.map((candidateEvidence) =>
    createStepCalloutResolutionDraft(candidateEvidence, pageByNumber.get(candidateEvidence.candidate.pageNumber)),
  )
  const layoutDrafts = refineVisualDiagnosticDrafts(drafts)
  const rasterFilteredDrafts = refineRasterStepNumberDrafts(layoutDrafts, pages)
  const styleFilteredDrafts = refinePageStyleDiagnosticDrafts(rasterFilteredDrafts, pages)
  const leadingFilteredDrafts = rejectUnsupportedLeadingStepCalloutDiagnostics(styleFilteredDrafts)
  const resolvedDrafts = resolveDuplicateStepCalloutDrafts(leadingFilteredDrafts)
  const resolvedCallouts = resolvedDrafts.map(createStepCalloutResolvedCallout)

  return {
    resolvedCallouts,
    snapshot: createConflictResolutionStageSnapshot(resolvedCallouts, resolvedDrafts),
  }
}

function refineVisualDiagnosticDrafts(
  drafts: readonly StepCalloutResolutionDraft[],
): StepCalloutResolutionDraft[] {
  const decisions = refineStepCalloutVisualDiagnosticLayout(drafts)

  return drafts.map((draft) => applyVisualLayoutDecision(draft, decisions))
}

function refineRasterStepNumberDrafts(
  drafts: readonly StepCalloutResolutionDraft[],
  pages: readonly StepCalloutPageInput[],
): StepCalloutResolutionDraft[] {
  if (pages.length === 0) {
    return [...drafts]
  }

  const decisions = refineStepCalloutRasterStepNumberLayout(drafts, pages)

  return drafts.map((draft) => applyRejectionOnlyDecision(draft, decisions))
}

function refinePageStyleDiagnosticDrafts(
  drafts: readonly StepCalloutResolutionDraft[],
  pages: readonly StepCalloutPageInput[],
): StepCalloutResolutionDraft[] {
  if (pages.length === 0) {
    return [...drafts]
  }

  const decisions = refineStepCalloutPageStyleDiagnosticLayout(drafts, pages)

  return drafts.map((draft) => applyRejectionOnlyDecision(draft, decisions))
}

function applyRejectionOnlyDecision(
  draft: StepCalloutResolutionDraft,
  decisions: ReadonlyMap<string, StepCalloutResolutionStatus>,
): StepCalloutResolutionDraft {
  const status = decisions.get(draft.evidence.candidate.id)

  return status === "rejected" ? rejectStepCalloutResolutionDraft(draft, "false-positive-candidate") : draft
}

function applyVisualLayoutDecision(
  draft: StepCalloutResolutionDraft,
  decisions: ReadonlyMap<string, StepCalloutResolutionStatus>,
): StepCalloutResolutionDraft {
  const status = decisions.get(draft.evidence.candidate.id)

  if (!status) {
    return draft
  }

  if (status === "rejected") {
    return rejectStepCalloutResolutionDraft(draft, "false-positive-candidate")
  }

  return {
    ...draft,
    rejectionKind: null,
    status,
  }
}

function createConflictResolutionStageSnapshot(
  resolvedCallouts: readonly StepCalloutResolvedCallout[],
  drafts: readonly StepCalloutResolutionDraft[] = [],
): StepCalloutStageSnapshot {
  const failures = drafts.flatMap((draft) => draft.rejectionKind ?? [])

  return {
    counts: {
      accepted: countResolvedStatus(resolvedCallouts, "accepted"),
      rejected: countResolvedStatus(resolvedCallouts, "rejected"),
      total: resolvedCallouts.length,
    },
    failures: failures.length > 0
      ? createStepCalloutFailureTaxonomy(failures)
      : createEmptyStepCalloutFailureTaxonomy(),
    notes: ["Diagnostic callouts stay review-only and never enter Bags."],
    stageId: "conflict-resolution",
  }
}

function createPageLookup(
  pages: readonly StepCalloutPageInput[],
): Map<number, StepCalloutPageInput> {
  return new Map(pages.map((page) => [page.pageNumber, page]))
}

function countResolvedStatus(
  resolvedCallouts: readonly StepCalloutResolvedCallout[],
  status: StepCalloutResolutionStatus,
): number {
  return resolvedCallouts.filter((callout) => callout.status === status).length
}
