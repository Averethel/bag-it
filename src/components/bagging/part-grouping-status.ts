import type { PartMatchPrecomputeState } from "./use-precomputed-part-match-groups"
import type { StatusRow } from "./processing-status-card"
import type { StepCalloutBagRow } from "@/features/bagging/step-callout-bagging"

const PREVIEW_STAGE_PROGRESS_MAX = 50
const ACTIVE_GROUPING_PROGRESS_MAX = 99
const GROUPING_STAGE_PROGRESS_SPAN =
  ACTIVE_GROUPING_PROGRESS_MAX - PREVIEW_STAGE_PROGRESS_MAX

export function appendPartGroupingStatusRow(
  rows: StatusRow[],
  bagRows: StepCalloutBagRow[],
  partMatchPrecompute: PartMatchPrecomputeState,
): StatusRow[] {
  return [
    ...rows,
    createPartGroupingStatusRow(rows, bagRows, partMatchPrecompute),
  ]
}

function createPartGroupingStatusRow(
  rows: StatusRow[],
  bagRows: StepCalloutBagRow[],
  partMatchPrecompute: PartMatchPrecomputeState,
): StatusRow {
  if (bagRows.length < 2) {
    const processingComplete = rows.every((row) => row.state === "complete")

    return {
      detail: processingComplete ? "No grouping needed" : "Waiting for part rows",
      label: "Part grouping",
      progress: processingComplete ? 100 : 0,
      state: processingComplete ? "complete" : "pending",
    }
  }

  if (partMatchPrecompute.status === "ready") {
    return {
      detail: "Part groups ready",
      label: "Part grouping",
      progress: 100,
      state: "complete",
    }
  }

  if (partMatchPrecompute.status === "failed") {
    return {
      detail: partMatchPrecompute.errorMessage ?? "Part grouping failed",
      label: "Part grouping",
      progress: 100,
      state: "failed",
    }
  }

  if (partMatchPrecompute.status === "preparing") {
    const progress = partMatchPrecompute.progress

    return {
      detail: progress ? `${progress.label}; ${progress.completed}/${progress.total}` : "Preparing part scorer",
      label: "Part grouping",
      progress: progress
        ? calculatePartGroupingProgressPercent(progress.completed, progress.total)
        : PREVIEW_STAGE_PROGRESS_MAX,
      state: "active",
    }
  }

  if (partMatchPrecompute.waitingForPartPreviews) {
    const waiting = partMatchPrecompute.waitingForPartPreviews

    return {
      detail: `Waiting for part previews; ${waiting.ready}/${waiting.total}`,
      label: "Part grouping",
      progress: calculateWaitingPartPreviewProgressPercent(waiting.ready, waiting.total),
      state: "active",
    }
  }

  return {
    detail: "Queued",
    label: "Part grouping",
    progress: 0,
    state: "pending",
  }
}

function calculatePartGroupingProgressPercent(completed: number, total: number): number {
  if (total <= 0) {
    return PREVIEW_STAGE_PROGRESS_MAX
  }

  return Math.min(
    ACTIVE_GROUPING_PROGRESS_MAX,
    PREVIEW_STAGE_PROGRESS_MAX +
      Math.round((completed / total) * GROUPING_STAGE_PROGRESS_SPAN),
  )
}

function calculateWaitingPartPreviewProgressPercent(ready: number, total: number): number {
  if (total <= 0) {
    return 0
  }

  return Math.min(
    PREVIEW_STAGE_PROGRESS_MAX,
    Math.round((ready / total) * PREVIEW_STAGE_PROGRESS_MAX),
  )
}
