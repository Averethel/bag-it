import { describe, expect, it } from "vitest"
import {
  createEmptyStepCalloutFailureTaxonomy,
  createStepCalloutFailureTaxonomy,
  mergeStepCalloutFailureTaxonomies,
  summarizeStepCalloutStageSnapshots,
} from "../stage-report"

describe("stepCallout detector stage reports", () => {
  it("creates explicit zero counts for every failure kind", () => {
    expect(createEmptyStepCalloutFailureTaxonomy()).toEqual({
      "bad-merge": 0,
      "bad-split": 0,
      duplicate: 0,
      "false-positive-candidate": 0,
      "missing-candidate": 0,
    })
  })

  it("merges failure taxonomies without dropping zero-count kinds", () => {
    const first = createStepCalloutFailureTaxonomy(["missing-candidate", "bad-split"])
    const second = createStepCalloutFailureTaxonomy(["missing-candidate"])

    expect(mergeStepCalloutFailureTaxonomies([first, second])).toEqual({
      ...createEmptyStepCalloutFailureTaxonomy(),
      "bad-split": 1,
      "missing-candidate": 2,
    })
  })

  it("summarizes stage snapshots without exposing stage internals", () => {
    const failures = createEmptyStepCalloutFailureTaxonomy()

    expect(
      summarizeStepCalloutStageSnapshots([
        {
          counts: {
            accepted: 2,
            rejected: 1,
            total: 3,
          },
          failures,
          notes: ["candidate recall only"],
          stageId: "callout-candidates",
        },
      ]),
    ).toEqual([
      {
        accepted: 2,
        rejected: 1,
        stageId: "callout-candidates",
        total: 3,
      },
    ])
  })
})
