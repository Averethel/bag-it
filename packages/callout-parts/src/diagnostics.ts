import type {
  CalloutPartFailureKind,
  CalloutPartFailureTaxonomy,
  CalloutPartStageSnapshot,
} from "./contracts"

export function createEmptyFailureTaxonomy(): CalloutPartFailureTaxonomy {
  return {
    "part-crop-cuts-part": 0,
    "part-crop-missing": 0,
    "part-crop-overlaps-label": 0,
    "quantity-missing": 0,
    "quantity-wrong": 0,
  }
}

export function createStageSnapshot({
  accepted,
  failures,
  notes = [],
  rejected,
  stageId,
  total,
}: {
  accepted: number
  failures?: Partial<Record<CalloutPartFailureKind, number>>
  notes?: string[]
  rejected: number
  stageId: CalloutPartStageSnapshot["stageId"]
  total: number
}): CalloutPartStageSnapshot {
  return {
    counts: { accepted, rejected, total },
    failures: {
      ...createEmptyFailureTaxonomy(),
      ...failures,
    },
    notes,
    stageId,
  }
}

export function mergeFailures(
  snapshots: readonly CalloutPartStageSnapshot[],
): CalloutPartFailureTaxonomy {
  const failures = createEmptyFailureTaxonomy()

  for (const snapshot of snapshots) {
    for (const key of Object.keys(failures) as CalloutPartFailureKind[]) {
      failures[key] += snapshot.failures[key]
    }
  }

  return failures
}
