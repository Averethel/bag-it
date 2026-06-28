import { describe, expect, it } from "vitest"
import { appendPartGroupingStatusRow } from "./part-grouping-status"
import type { PartMatchPrecomputeState } from "./use-precomputed-part-match-groups"
import type { StatusRow } from "./processing-status-card"
import type { StepCalloutBagRow } from "@/features/bagging/step-callout-bagging"

const completeRows: StatusRow[] = [
  {
    detail: "Done",
    label: "Scanning pages",
    progress: 100,
    state: "complete",
  },
  {
    detail: "Done",
    label: "Extracting parts",
    progress: 100,
    state: "complete",
  },
  {
    detail: "Done",
    label: "Generating previews",
    progress: 100,
    state: "complete",
  },
]

const bagRows = [{ id: "row-1" }, { id: "row-2" }] as StepCalloutBagRow[]

describe("appendPartGroupingStatusRow", () => {
  it("keeps part grouping progress monotonic across preview and scorer stages", () => {
    const sequence = [
      progressFor({
        groupsByBagId: new Map(),
        progress: null,
        status: "idle",
        waitingForPartPreviews: {
          ready: 0,
          total: 2,
        },
      }),
      progressFor({
        groupsByBagId: new Map(),
        progress: null,
        status: "idle",
        waitingForPartPreviews: {
          ready: 1,
          total: 2,
        },
      }),
      progressFor({
        groupsByBagId: new Map(),
        progress: {
          completed: 0,
          label: "Loading CNN scorer",
          total: 5,
        },
        status: "preparing",
      }),
      progressFor({
        groupsByBagId: new Map(),
        progress: {
          completed: 5,
          label: "Scoring suggested groups",
          total: 5,
        },
        status: "preparing",
      }),
      progressFor({
        groupsByBagId: new Map(),
        progress: null,
        status: "ready",
      }),
    ]

    expect(sequence).toEqual([0, 25, 50, 99, 100])
  })
})

function progressFor(partMatchPrecompute: PartMatchPrecomputeState): number {
  return appendPartGroupingStatusRow(completeRows, bagRows, partMatchPrecompute).at(-1)!.progress
}
