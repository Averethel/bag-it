import {
  STEP_CALLOUT_FAILURE_KINDS,
  type StepCalloutFailureKind,
  type StepCalloutFailureTaxonomy,
  type StepCalloutStageId,
  type StepCalloutStageSnapshot,
} from "./contracts"

export interface StepCalloutStageSummary {
  accepted: number
  rejected: number
  stageId: StepCalloutStageId
  total: number
}

export function createEmptyStepCalloutFailureTaxonomy(): StepCalloutFailureTaxonomy {
  return Object.fromEntries(
    STEP_CALLOUT_FAILURE_KINDS.map((kind) => [kind, 0]),
  ) as StepCalloutFailureTaxonomy
}

export function createStepCalloutFailureTaxonomy(
  failures: readonly StepCalloutFailureKind[],
): StepCalloutFailureTaxonomy {
  const taxonomy = createEmptyStepCalloutFailureTaxonomy()

  for (const failure of failures) {
    taxonomy[failure] += 1
  }

  return taxonomy
}

export function mergeStepCalloutFailureTaxonomies(
  taxonomies: readonly StepCalloutFailureTaxonomy[],
): StepCalloutFailureTaxonomy {
  const merged = createEmptyStepCalloutFailureTaxonomy()

  for (const taxonomy of taxonomies) {
    addFailureTaxonomy(merged, taxonomy)
  }

  return merged
}

export function summarizeStepCalloutStageSnapshots(
  snapshots: readonly StepCalloutStageSnapshot[],
): StepCalloutStageSummary[] {
  return snapshots.map(({ counts, stageId }) => ({
    accepted: counts.accepted,
    rejected: counts.rejected,
    stageId,
    total: counts.total,
  }))
}

function addFailureTaxonomy(
  target: StepCalloutFailureTaxonomy,
  source: StepCalloutFailureTaxonomy,
) {
  for (const kind of STEP_CALLOUT_FAILURE_KINDS) {
    target[kind] += source[kind]
  }
}
