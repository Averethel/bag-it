import { describe, expect, it } from "vitest"
import {
  createStepCalloutMultiplierEntries,
  getStepCalloutMultiplier,
  normalizeStepCalloutMultiplier,
  pruneStepCalloutMultipliers,
  restoreStepCalloutMultiplierEntries,
  setStepCalloutMultiplier,
} from "./step-callout-multipliers"

describe("step callout multipliers", () => {
  const result = {
    callouts: [
      { id: "step-callout:p1:r1" },
      { id: "step-callout:p2:r1" },
    ],
  }

  it("normalizes multiplier values to finite positive integers", () => {
    expect(normalizeStepCalloutMultiplier(undefined)).toBe(1)
    expect(normalizeStepCalloutMultiplier(Number.POSITIVE_INFINITY)).toBe(1)
    expect(normalizeStepCalloutMultiplier(0)).toBe(1)
    expect(normalizeStepCalloutMultiplier(3.8)).toBe(3)
  })

  it("sets and removes normalized multiplier values without changing equivalent maps", () => {
    const current = { "step-callout:p1:r1": 2 }

    expect(setStepCalloutMultiplier(current, "step-callout:p1:r1", 2.8)).toBe(current)
    expect(setStepCalloutMultiplier(current, "step-callout:p1:r1", 1)).toEqual({})
    expect(setStepCalloutMultiplier(current, "step-callout:p2:r1", 4.2)).toEqual({
      "step-callout:p1:r1": 2,
      "step-callout:p2:r1": 4,
    })
  })

  it("reads, prunes, serializes, and restores only valid non-default callout multipliers", () => {
    const multipliers = {
      "missing-callout": 5,
      "step-callout:p1:r1": 3.8,
      "step-callout:p2:r1": 1,
    }

    expect(getStepCalloutMultiplier("missing-callout", multipliers)).toBe(5)
    expect(pruneStepCalloutMultipliers(multipliers, result)).toEqual({
      "step-callout:p1:r1": 3,
    })
    expect(createStepCalloutMultiplierEntries(multipliers, result)).toEqual([
      ["step-callout:p1:r1", 3],
    ])
    expect(restoreStepCalloutMultiplierEntries([
      ["step-callout:p2:r1", 4.9],
      ["step-callout:p1:r1", 1],
      ["missing-callout", 6],
      ["invalid-entry"],
    ], result)).toEqual({
      "step-callout:p2:r1": 4,
    })
  })
})
