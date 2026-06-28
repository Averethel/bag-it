import type {
  PartMatchGroup,
  PartMatchRenderedPixels,
  PartMatchRowInput,
} from "@bag-it/part-matching"

export type {
  PartMatchGroup,
  PartMatchRenderedPixels,
  PartMatchRowInput,
}

export type PartMatchPrecomputeProgress = {
  completed: number
  label: string
  total: number
}

export type PartMatchGroupRunResult = {
  group: PartMatchGroup
  lane: "auto" | "suggested"
}

export const PART_MATCH_GROUP_RUNNER_PROGRESS_TOTAL = 5

export function createPartMatchProgress(
  label: string,
  completed: number,
  total: number,
): PartMatchPrecomputeProgress {
  return {
    completed,
    label,
    total: Math.max(1, total),
  }
}
