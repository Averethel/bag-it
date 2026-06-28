import { describe, expect, it } from "vitest"
import { mergeRuntimePrototypeSets } from "./update-part-color-prototypes.mjs"

describe("part color prototype updater", () => {
  it("promotes only unrepresented aggregate prototypes", () => {
    const merged = mergeRuntimePrototypeSets(
      {
        prototypes: [
          prototype("prototype-green-001", "Green", { b: 30, g: 60, r: 30 }),
          prototype("prototype-white-002", "White", { b: 250, g: 250, r: 250 }),
        ],
      },
      {
        prototypes: [
          prototype("prototype-green-candidate", "Green", { b: 31, g: 61, r: 31 }),
          prototype("prototype-pearl-gold-candidate", "Pearl Gold", { b: 33, g: 145, r: 186 }),
        ],
      },
    )

    expect(merged.prototypes.map((entry) => [entry.id, entry.expectedName])).toEqual([
      ["prototype-green-001", "Green"],
      ["prototype-pearl-gold-003", "Pearl Gold"],
      ["prototype-white-002", "White"],
    ])
  })
})

function prototype(id, expectedName, rgb) {
  return {
    expectedName,
    family: "fallback",
    id,
    lab: { a: 0, b: 0, l: 0 },
    rgb,
    support: 4,
  }
}
