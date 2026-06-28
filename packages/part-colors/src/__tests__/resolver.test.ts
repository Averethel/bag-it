import { describe, expect, it } from "vitest"
import { rgbToLab, rgbToLch } from "../color-space"
import { calibrateManualPartColors } from "../resolver/resolver"
import { extractPartColorFeature } from "../resolver/feature-extraction"
import { createResolverDataset } from "../resolver/manual-dataset"
import { selectTrainableLabels } from "../resolver/label-policy"
import { trainColorPrototypes } from "../resolver/prototype-training"
import { routeColorFamily } from "../resolver/family-routing"
import type { PartColorSample, RgbColor } from "../contracts"
import type { ColorPrototype, PrototypeSet } from "../resolver/types"

describe("part color resolver", () => {
  it("creates deterministic conservative manual-local classes", () => {
    const result = calibrateManualPartColors([
      { id: "b", sample: sample({ b: 166, g: 166, r: 166 }) },
      { id: "a", sample: sample({ b: 165, g: 165, r: 165 }) },
      { id: "green", sample: sample({ b: 74, g: 159, r: 75 }) },
    ], { prototypes: prototypeSet([]) })

    expect(result.skippedPartIds).toEqual([])
    expect(result.classes).toHaveLength(2)
    expect(result.rawClasses).toHaveLength(2)
    expect(result.colorsByPartId.get("a")).toEqual(
      expect.objectContaining({
        manualClassId: "manual-color-001",
        manualClassTrusted: false,
        nameSource: "family-only",
        rawManualClassId: "manual-color-001",
        status: "review",
      }),
    )
    expect(result.colorsByPartId.get("b")?.manualClassId).toBe("manual-color-001")
    expect(result.colorsByPartId.get("green")?.manualClassId).toBe("manual-color-002")
  })

  it("orders manual-local classes by explicit sort key before row id", () => {
    const result = calibrateManualPartColors([
      { id: "right-border-row", sortKey: "002:right", sample: sample({ b: 52, g: 129, r: 224 }) },
      { id: "left-fill-row", sortKey: "001:left", sample: sample({ b: 54, g: 220, r: 252 }) },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("left-fill-row")?.manualClassId).toBe("manual-color-001")
    expect(result.colorsByPartId.get("right-border-row")?.manualClassId).toBe("manual-color-002")
  })

  it("skips unknown samples instead of forcing advisory names", () => {
    const result = calibrateManualPartColors([
      { id: "missing", sample: null },
      { id: "unknown", sample: sample({ b: 0, g: 0, r: 0 }, { pixelCount: 0, status: "unknown" }) },
      { id: "weak", sample: sample({ b: 74, g: 159, r: 75 }, { pixelCount: 8, status: "weak-classifiable" }) },
      { id: "usable", sample: sample({ b: 74, g: 159, r: 75 }) },
    ])

    expect(result.skippedPartIds).toEqual(["missing", "unknown"])
    expect(result.colorsByPartId.has("usable")).toBe(true)
    expect(result.colorsByPartId.get("weak")).toEqual(expect.objectContaining({
      manualClassTrusted: false,
      sampleStatus: "weak-classifiable",
      status: "review",
    }))
    expect(result.colorsByPartId.has("missing")).toBe(false)
  })

  it("extracts row features and marks weak sample quality without rejecting usable evidence", () => {
    const feature = extractPartColorFeature({
      id: "tiny",
      sample: sample(
        { b: 100, g: 100, r: 100 },
        {
          dominantCoverage: 0.12,
          pixelCount: 42,
          stability: 0.4,
        },
      ),
    })

    expect(feature).toEqual(
      expect.objectContaining({
        family: "neutral",
        quality: expect.objectContaining({
          issues: expect.arrayContaining(["tiny-mask", "low-stability", "low-dominance"]),
          status: "review",
        }),
      }),
    )
  })

  it("keeps dirty or holdout labels out of training", () => {
    const dataset = createResolverDataset({
      labels: [
        { cropHash: "same-crop", expectedName: "Green", itemId: "green", role: "train" },
        { cropHash: "same-crop", expectedName: "Red", itemId: "red", role: "train" },
        { expectedName: "Black", itemId: "black", role: "holdout" },
        { expectedName: "White", itemId: "white", role: "active" },
        { expectedName: "Yellow", itemId: "yellow", role: "excluded" },
        { cropHash: "old-crop", expectedName: "Blue", itemId: "blue", role: "train" },
        { expectedName: "Light Bluish Gray", itemId: "gray", role: "train" },
        { expectedName: "Green", itemId: "weak", role: "train" },
      ],
      cropHashesByItemId: {
        blue: "new-crop",
      },
      rows: [
        { id: "black", sample: sample({ b: 20, g: 20, r: 20 }) },
        { id: "blue", sample: sample({ b: 200, g: 80, r: 20 }) },
        { id: "gray", sample: sample({ b: 165, g: 165, r: 165 }) },
        { id: "green", sample: sample({ b: 74, g: 159, r: 75 }) },
        { id: "red", sample: sample({ b: 9, g: 26, r: 201 }) },
        { id: "weak", sample: sample({ b: 74, g: 159, r: 75 }, { pixelCount: 8, status: "weak-classifiable" }) },
        { id: "white", sample: sample({ b: 250, g: 250, r: 250 }) },
        { id: "yellow", sample: sample({ b: 54, g: 220, r: 252 }) },
      ],
    })

    const policy = selectTrainableLabels(dataset)

    expect(policy.accepted.map((entry) => entry.expectedName)).toEqual(["Light Bluish Gray"])
    expect(policy.excluded.map((entry) => entry.reason)).toEqual([
      "conflicting-crop-hash",
      "conflicting-crop-hash",
      "holdout-role",
      "holdout-role",
      "excluded-role",
      "stale-crop-hash",
      "unclear-sample",
    ])
  })

  it("trains generic prototypes only from accepted labels", () => {
    const dataset = createResolverDataset({
      labels: [
        { expectedName: "Green", itemId: "green-a", role: "train" },
        { expectedName: "Green", itemId: "green-b", role: "gate" },
        { expectedName: "Dark Bluish Gray", itemId: "gray", role: "holdout" },
      ],
      rows: [
        { id: "green-a", sample: sample({ b: 70, g: 150, r: 70 }) },
        { id: "green-b", sample: sample({ b: 78, g: 158, r: 74 }) },
        { id: "gray", sample: sample({ b: 110, g: 110, r: 110 }) },
      ],
    })
    const policy = selectTrainableLabels(dataset)
    const prototypes = trainColorPrototypes(policy.accepted, { minimumSupport: 1 })

    expect(prototypes.prototypes).toEqual([
      expect.objectContaining({
        id: "prototype-green-001",
        expectedName: "Green",
        support: 2,
      }),
    ])
  })

  it("clusters aggregate prototypes by expected color and drops low-support clusters", () => {
    const dataset = createResolverDataset({
      labels: [
        label("dark-red-brown-a", "Reddish Brown"),
        label("dark-red-brown-b", "Reddish Brown"),
        label("dark-red-brown-c", "Reddish Brown"),
        label("dark-red-brown-d", "Reddish Brown"),
        label("body-red-brown-a", "Reddish Brown"),
        label("body-red-brown-b", "Reddish Brown"),
        label("body-red-brown-c", "Reddish Brown"),
        label("body-red-brown-d", "Reddish Brown"),
        label("dark-brown-a", "Dark Brown"),
        label("dark-brown-b", "Dark Brown"),
        label("dark-brown-c", "Dark Brown"),
      ],
      rows: [
        row("dark-red-brown-a", { b: 4, g: 5, r: 8 }),
        row("dark-red-brown-b", { b: 5, g: 5, r: 9 }),
        row("dark-red-brown-c", { b: 6, g: 8, r: 12 }),
        row("dark-red-brown-d", { b: 7, g: 8, r: 13 }),
        row("body-red-brown-a", { b: 13, g: 29, r: 61 }),
        row("body-red-brown-b", { b: 14, g: 31, r: 64 }),
        row("body-red-brown-c", { b: 15, g: 33, r: 67 }),
        row("body-red-brown-d", { b: 16, g: 35, r: 70 }),
        row("dark-brown-a", { b: 8, g: 30, r: 55 }),
        row("dark-brown-b", { b: 10, g: 28, r: 51 }),
        row("dark-brown-c", { b: 12, g: 32, r: 57 }),
      ],
    })
    const policy = selectTrainableLabels(dataset)
    const prototypes = trainColorPrototypes(policy.accepted)

    expect(prototypes.prototypes.map((entry) => [entry.expectedName, entry.support])).toEqual([
      ["Reddish Brown", 4],
      ["Reddish Brown", 4],
    ])
  })

  it("uses trained aggregate prototypes for near-black Reddish Brown", () => {
    const result = calibrateManualPartColors([
      row("dark-red-brown", { b: 6, g: 8, r: 12 }),
    ], {
      prototypes: prototypeSet([
        prototype("prototype-black", "Black", { b: 23, g: 15, r: 10 }),
        prototype("prototype-reddish-brown", "Reddish Brown", { b: 6, g: 8, r: 12 }),
      ]),
    })
    const detectedColor = result.colorsByPartId.get("dark-red-brown")

    expect(detectedColor).toEqual(expect.objectContaining({
      manualClassTrusted: false,
      name: "Reddish Brown",
      nameSource: "prototype-match",
      ruleCandidateNames: expect.arrayContaining(["Reddish Brown", "Black"]),
      ruleResolverKind: "aggregate-prototype",
      status: "review",
    }))
  })

  it("uses warm body chip support when near-black shadow was selected", () => {
    const result = calibrateManualPartColors([
      {
        id: "shadowed-red-brown",
        sample: sample({ b: 6, g: 7, r: 10 }, {
          chips: [
            chip({ b: 8, g: 31, r: 77 }, 0.65),
            chip({ b: 6, g: 7, r: 10 }, 0.15),
            chip({ b: 12, g: 22, r: 43 }, 0.12),
          ],
          dominantCoverage: 0.15,
          selectedChipIndex: 1,
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-black", "Black", { b: 23, g: 15, r: 9 }),
        prototype("prototype-reddish-brown", "Reddish Brown", { b: 8, g: 31, r: 77 }),
      ]),
    })

    expect(result.colorsByPartId.get("shadowed-red-brown")).toEqual(expect.objectContaining({
      name: "Reddish Brown",
      nameSource: "prototype-match",
      observedHex: "#4d1f08",
    }))
  })

  it("uses dominant warm body chip support when dark shadow chips are present", () => {
    const result = calibrateManualPartColors([
      {
        id: "shadowed-red-brown",
        sample: sample({ b: 7, g: 8, r: 10 }, {
          chips: [
            chip({ b: 8, g: 31, r: 76 }, 0.46),
            chip({ b: 7, g: 8, r: 10 }, 0.26),
            chip({ b: 16, g: 26, r: 44 }, 0.17),
            chip({ b: 10, g: 20, r: 53 }, 0.02),
          ],
          dominantCoverage: 0.46,
          selectedChipIndex: 1,
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-black", "Black", { b: 23, g: 15, r: 9 }),
        prototype("prototype-reddish-brown", "Reddish Brown", { b: 8, g: 31, r: 76 }),
      ]),
    })

    expect(result.colorsByPartId.get("shadowed-red-brown")).toEqual(expect.objectContaining({
      name: "Reddish Brown",
      nameSource: "prototype-match",
      observedHex: "#4c1f08",
    }))
  })

  it("uses near-dominant warm body chip support when near-black coverage is close", () => {
    const result = calibrateManualPartColors([
      {
        id: "edge-shadowed-red-brown",
        sample: sample({ b: 5, g: 7, r: 9 }, {
          chips: [
            chip({ b: 9, g: 31, r: 78 }, 0.38),
            chip({ b: 5, g: 7, r: 9 }, 0.2),
            chip({ b: 13, g: 27, r: 54 }, 0.15),
            chip({ b: 19, g: 23, r: 52 }, 0.08),
            chip({ b: 16, g: 21, r: 36 }, 0.05),
            chip({ b: 16, g: 26, r: 44 }, 0.04),
          ],
          dominantCoverage: 0.2,
          selectedChipIndex: 1,
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-black", "Black", { b: 23, g: 15, r: 9 }),
        prototype("prototype-reddish-brown", "Reddish Brown", { b: 9, g: 31, r: 78 }),
      ]),
    })

    expect(result.colorsByPartId.get("edge-shadowed-red-brown")).toEqual(expect.objectContaining({
      name: "Reddish Brown",
      nameSource: "prototype-match",
      observedHex: "#4e1f09",
    }))
  })

  it("keeps true Black when the black prototype wins", () => {
    const result = calibrateManualPartColors([
      row("black", { b: 23, g: 15, r: 10 }),
    ], {
      prototypes: prototypeSet([
        prototype("prototype-black", "Black", { b: 23, g: 15, r: 10 }),
        prototype("prototype-reddish-brown", "Reddish Brown", { b: 6, g: 8, r: 12 }),
      ]),
    })

    expect(result.colorsByPartId.get("black")).toEqual(expect.objectContaining({
      name: "Black",
      nameSource: "prototype-match",
    }))
  })

  it("falls back when tan and nougat prototypes are too close", () => {
    const result = calibrateManualPartColors([
      row("ambiguous-tan", { b: 178, g: 228, r: 251 }),
    ], {
      prototypes: prototypeSet([
        prototype("prototype-tan", "Tan", { b: 178, g: 228, r: 251 }),
        prototype("prototype-light-nougat", "Light Nougat", { b: 179, g: 228, r: 251 }),
      ]),
    })

    const detectedColor = result.colorsByPartId.get("ambiguous-tan")

    expect(detectedColor).toEqual(expect.objectContaining({
      nameSource: "family-only",
    }))
    expect(detectedColor).not.toHaveProperty("ruleResolverKind")
  })

  it("uses the shadowed Pearl Gold aggregate prototypes without flipping Medium Nougat shadows", () => {
    const result = calibrateManualPartColors([
      {
        id: "shadowed-pearl-gold",
        sample: sample({ b: 31, g: 106, r: 129 }, {
          chips: [
            chip({ b: 31, g: 106, r: 129 }, 0.5),
            chip({ b: 18, g: 60, r: 80 }, 0.2),
          ],
          dominantCoverage: 0.5,
        }),
      },
      {
        id: "medium-nougat-shadow",
        sample: sample({ b: 65, g: 107, r: 144 }, {
          chips: [
            chip({ b: 102, g: 169, r: 235 }, 0.19),
            chip({ b: 65, g: 107, r: 144 }, 0.12),
            chip({ b: 94, g: 138, r: 181 }, 0.11),
          ],
          dominantCoverage: 0.19,
        }),
      },
    ])

    expect(result.colorsByPartId.get("shadowed-pearl-gold")).toEqual(expect.objectContaining({
      name: "Pearl Gold",
      nameSource: "prototype-match",
      ruleCanonicalClassId: "prototype-pearl-gold-035",
    }))
    expect(result.colorsByPartId.get("medium-nougat-shadow")).toEqual(expect.objectContaining({
      name: "Medium Nougat",
      nameSource: "family-only",
    }))
  })

  it("uses gold body evidence to rescue Pearl Gold from Dark Brown", () => {
    const result = calibrateManualPartColors([
      {
        id: "edge-heavy-pearl-gold",
        sample: sample({ b: 23, g: 80, r: 103 }, {
          chips: [
            chip({ b: 23, g: 80, r: 103 }, 0.17),
            chip({ b: 43, g: 107, r: 134 }, 0.11),
            chip({ b: 33, g: 66, r: 95 }, 0.11),
            chip({ b: 57, g: 100, r: 131 }, 0.08),
            chip({ b: 36, g: 143, r: 177 }, 0.06),
            chip({ b: 19, g: 61, r: 75 }, 0.05),
          ],
          dominantCoverage: 0.17,
          selectedChipIndex: 0,
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("edge-heavy-pearl-gold")).toEqual(expect.objectContaining({
      name: "Pearl Gold",
      nameSource: "palette-match",
      ruleResolverKind: "pearl-gold-body-evidence",
    }))
  })

  it("uses strong gold body evidence to rescue Pearl Gold from Reddish Brown", () => {
    const result = calibrateManualPartColors([
      {
        id: "reddish-brown-pearl-gold",
        sample: sample({ b: 14, g: 25, r: 39 }, {
          chips: [
            chip({ b: 30, g: 146, r: 176 }, 0.22),
            chip({ b: 40, g: 159, r: 199 }, 0.16),
            chip({ b: 26, g: 77, r: 104 }, 0.12),
            chip({ b: 20, g: 21, r: 35 }, 0.1),
            chip({ b: 14, g: 25, r: 39 }, 0.08),
          ],
          dominantCoverage: 0.22,
          selectedChipIndex: 4,
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("runtime-reddish-brown", "Reddish Brown", { b: 14, g: 25, r: 39 }),
      ]),
    })

    expect(result.colorsByPartId.get("reddish-brown-pearl-gold")).toEqual(expect.objectContaining({
      name: "Pearl Gold",
      nameSource: "palette-match",
      ruleResolverKind: "pearl-gold-body-evidence",
    }))
  })

  it("uses strong gold body evidence to rescue Pearl Gold from Dark Orange", () => {
    const result = calibrateManualPartColors([
      {
        id: "dark-orange-pearl-gold",
        sample: sample({ b: 23, g: 81, r: 115 }, {
          chips: [
            chip({ b: 23, g: 81, r: 115 }, 0.2),
            chip({ b: 33, g: 123, r: 152 }, 0.17),
            chip({ b: 40, g: 144, r: 193 }, 0.1),
            chip({ b: 57, g: 112, r: 153 }, 0.08),
            chip({ b: 28, g: 148, r: 188 }, 0.05),
            chip({ b: 11, g: 42, r: 73 }, 0.04),
          ],
          dominantCoverage: 0.2,
          selectedChipIndex: 0,
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("runtime-reddish-brown", "Reddish Brown", { b: 54, g: 54, r: 116 }),
      ]),
    })

    expect(result.colorsByPartId.get("dark-orange-pearl-gold")).toEqual(expect.objectContaining({
      name: "Pearl Gold",
      nameSource: "palette-match",
      ruleResolverKind: "pearl-gold-body-evidence",
    }))
  })

  it("keeps dark orange warm samples out of Pearl Gold when gold coverage is weak", () => {
    const result = calibrateManualPartColors([
      {
        id: "medium-nougat-like-dark-orange",
        sample: sample({ b: 81, g: 137, r: 193 }, {
          chips: [
            chip({ b: 81, g: 137, r: 193 }, 0.2),
            chip({ b: 90, g: 162, r: 232 }, 0.19),
            chip({ b: 52, g: 93, r: 133 }, 0.16),
            chip({ b: 65, g: 114, r: 165 }, 0.14),
            chip({ b: 33, g: 65, r: 97 }, 0.09),
          ],
          dominantCoverage: 0.2,
          selectedChipIndex: 0,
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    const detectedColor = result.colorsByPartId.get("medium-nougat-like-dark-orange")

    expect(detectedColor).toEqual(expect.objectContaining({
      name: "Medium Nougat",
      nameSource: "family-only",
    }))
    expect(detectedColor?.ruleResolverKind).not.toBe("pearl-gold-body-evidence")
  })

  it("does not force dark brown chips to Pearl Gold without bright-gold support", () => {
    const result = calibrateManualPartColors([
      {
        id: "dark-brown",
        sample: sample({ b: 27, g: 44, r: 62 }, {
          chips: [
            chip({ b: 27, g: 44, r: 62 }, 0.3),
            chip({ b: 12, g: 32, r: 38 }, 0.2),
            chip({ b: 23, g: 58, r: 77 }, 0.12),
            chip({ b: 15, g: 26, r: 36 }, 0.08),
          ],
          dominantCoverage: 0.3,
          selectedChipIndex: 0,
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("dark-brown")).toEqual(expect.objectContaining({
      name: "Dark Brown",
      nameSource: "family-only",
    }))
  })

  it("does not force Reddish Brown to Pearl Gold without bright-gold support", () => {
    const result = calibrateManualPartColors([
      {
        id: "reddish-brown-with-muted-yellow",
        sample: sample({ b: 14, g: 25, r: 39 }, {
          chips: [
            chip({ b: 14, g: 25, r: 39 }, 0.32),
            chip({ b: 35, g: 68, r: 92 }, 0.2),
            chip({ b: 44, g: 128, r: 150 }, 0.16),
            chip({ b: 54, g: 132, r: 142 }, 0.12),
            chip({ b: 22, g: 37, r: 61 }, 0.1),
          ],
          dominantCoverage: 0.32,
          selectedChipIndex: 0,
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("runtime-reddish-brown", "Reddish Brown", { b: 14, g: 25, r: 39 }),
      ]),
    })

    const detectedColor = result.colorsByPartId.get("reddish-brown-with-muted-yellow")

    expect(detectedColor).toEqual(expect.objectContaining({
      name: "Reddish Brown",
      nameSource: "prototype-match",
    }))
    expect(detectedColor?.ruleResolverKind).not.toBe("pearl-gold-body-evidence")
  })

  it("uses no-regression transparent aggregate prototypes", () => {
    const result = calibrateManualPartColors([
      row("trans-green", { b: 98, g: 128, r: 79 }),
      row("shadowed-trans-orange", { b: 26, g: 55, r: 82 }),
      row("trans-yellow", { b: 82, g: 156, r: 172 }),
      row("opaque-green", { b: 74, g: 159, r: 75 }),
    ])

    expect(result.colorsByPartId.get("trans-green")).toEqual(expect.objectContaining({
      name: "Trans-Green",
      nameSource: "prototype-match",
      ruleCanonicalClassId: "prototype-trans-green-038",
    }))
    expect(result.colorsByPartId.get("shadowed-trans-orange")).toEqual(expect.objectContaining({
      name: "Trans-Orange",
      nameSource: "prototype-match",
      ruleCanonicalClassId: "prototype-trans-orange-039",
    }))
    expect(result.colorsByPartId.get("trans-yellow")).toEqual(expect.objectContaining({
      name: "Trans-Yellow",
      nameSource: "prototype-match",
      ruleCanonicalClassId: "prototype-trans-yellow-041",
    }))
    const opaqueGreen = result.colorsByPartId.get("opaque-green")
    expect(opaqueGreen).toEqual(expect.objectContaining({
      nameSource: "family-only",
    }))
    expect(opaqueGreen?.name).not.toBe("Trans-Green")
  })

  it("uses saturated transparent red edge evidence", () => {
    const result = calibrateManualPartColors([
      {
        id: "trans-red-edge",
        sample: sample({ b: 54, g: 65, r: 173 }, {
          chips: [
            chip({ b: 54, g: 65, r: 173 }, 0.3),
            chip({ b: 99, g: 103, r: 189 }, 0.14),
            chip({ b: 122, g: 131, r: 198 }, 0.12),
            chip({ b: 161, g: 162, r: 219 }, 0.08),
            chip({ b: 33, g: 41, r: 153 }, 0.08),
            chip({ b: 78, g: 82, r: 178 }, 0.22),
          ],
          dominantCoverage: 0.3,
          edgeChips: [
            chip({ b: 60, g: 72, r: 183 }, 0.35),
            chip({ b: 101, g: 105, r: 191 }, 0.22),
            chip({ b: 130, g: 139, r: 204 }, 0.16),
          ],
          pixelCount: 64,
          rejectedPixelCount: 138,
          rejectionCounts: {
            background: 30,
            border: 0,
            edge: 108,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("trans-red-edge")).toEqual(expect.objectContaining({
      name: "Trans-Red",
      nameSource: "palette-match",
      ruleResolverKind: "transparent-primary-evidence",
    }))
  })

  it("uses tiny transparent red body evidence when red edge support is weak", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-trans-red-body",
        sample: sample({ b: 72, g: 88, r: 174 }, {
          chips: [
            chip({ b: 72, g: 88, r: 174 }, 0.22),
            chip({ b: 34, g: 40, r: 96 }, 0.19),
            chip({ b: 56, g: 66, r: 141 }, 0.14),
            chip({ b: 76, g: 79, r: 151 }, 0.14),
            chip({ b: 110, g: 121, r: 203 }, 0.07),
            chip({ b: 17, g: 22, r: 63 }, 0.07),
            chip({ b: 80, g: 82, r: 160 }, 0.12),
          ],
          dominantCoverage: 0.22,
          edgeChips: [
            chip({ b: 43, g: 42, r: 68 }, 0.18),
            chip({ b: 59, g: 60, r: 109 }, 0.15),
            chip({ b: 130, g: 125, r: 134 }, 0.1),
            chip({ b: 159, g: 151, r: 152 }, 0.07),
            chip({ b: 67, g: 66, r: 87 }, 0.05),
            chip({ b: 18, g: 23, r: 65 }, 0.05),
          ],
          pixelCount: 42,
          rejectedPixelCount: 208,
          rejectionCounts: {
            background: 42,
            border: 0,
            edge: 120,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("tiny-trans-red-body")).toEqual(expect.objectContaining({
      name: "Trans-Red",
      nameSource: "palette-match",
      ruleResolverKind: "transparent-primary-evidence",
    }))
  })

  it("uses transparent orange evidence when Pearl Gold rows are tiny transparent parts", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-trans-orange",
        sample: sample({ b: 55, g: 134, r: 197 }, {
          chips: [
            chip({ b: 55, g: 134, r: 197 }, 0.47),
            chip({ b: 32, g: 112, r: 174 }, 0.16),
            chip({ b: 89, g: 162, r: 223 }, 0.12),
            chip({ b: 98, g: 133, r: 160 }, 0.04),
            chip({ b: 6, g: 35, r: 47 }, 0.03),
          ],
          dominantCoverage: 0.47,
          edgeChips: [
            chip({ b: 78, g: 124, r: 164 }, 0.11),
            chip({ b: 55, g: 91, r: 125 }, 0.09),
            chip({ b: 50, g: 110, r: 158 }, 0.05),
          ],
          pixelCount: 74,
          rejectedPixelCount: 107,
          rejectionCounts: {
            background: 27,
            border: 0,
            edge: 79,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-pearl-gold", "Pearl Gold", { b: 55, g: 134, r: 197 }),
      ]),
    })

    expect(result.colorsByPartId.get("tiny-trans-orange")).toEqual(expect.objectContaining({
      name: "Trans-Orange",
      nameSource: "palette-match",
      ruleResolverKind: "transparent-orange-evidence",
    }))
  })

  it("keeps Pearl Gold when transparent orange evidence has weak edge rejection", () => {
    const result = calibrateManualPartColors([
      {
        id: "opaque-pearl-gold",
        sample: sample({ b: 55, g: 134, r: 197 }, {
          chips: [
            chip({ b: 55, g: 134, r: 197 }, 0.47),
            chip({ b: 32, g: 112, r: 174 }, 0.16),
            chip({ b: 89, g: 162, r: 223 }, 0.12),
            chip({ b: 98, g: 133, r: 160 }, 0.04),
            chip({ b: 6, g: 35, r: 47 }, 0.03),
          ],
          dominantCoverage: 0.47,
          edgeChips: [
            chip({ b: 78, g: 124, r: 164 }, 0.11),
            chip({ b: 55, g: 91, r: 125 }, 0.09),
            chip({ b: 50, g: 110, r: 158 }, 0.05),
          ],
          pixelCount: 74,
          rejectedPixelCount: 107,
          rejectionCounts: {
            background: 27,
            border: 0,
            edge: 74,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-pearl-gold", "Pearl Gold", { b: 55, g: 134, r: 197 }),
      ]),
    })

    expect(result.colorsByPartId.get("opaque-pearl-gold")).toEqual(expect.objectContaining({
      name: "Pearl Gold",
      nameSource: "prototype-match",
    }))
  })

  it("uses transparent orange evidence for tiny edge-heavy Pearl Gold rows", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-trans-orange-selected-as-pearl-gold",
        sample: sample({ b: 26, g: 53, r: 85 }, {
          chips: [
            chip({ b: 26, g: 53, r: 85 }, 0.23),
            chip({ b: 20, g: 69, r: 92 }, 0.1),
            chip({ b: 16, g: 24, r: 43 }, 0.1),
            chip({ b: 79, g: 142, r: 186 }, 0.07),
            chip({ b: 48, g: 100, r: 137 }, 0.07),
          ],
          dominantCoverage: 0.23,
          edgeChips: [
            chip({ b: 31, g: 111, r: 173 }, 0.08),
            chip({ b: 25, g: 63, r: 98 }, 0.06),
            chip({ b: 16, g: 24, r: 43 }, 0.05),
          ],
          pixelCount: 30,
          rejectedPixelCount: 89,
          rejectionCounts: {
            background: 27,
            border: 0,
            edge: 62,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-pearl-gold", "Pearl Gold", { b: 26, g: 53, r: 85 }),
      ]),
    })

    expect(result.colorsByPartId.get("tiny-trans-orange-selected-as-pearl-gold")).toEqual(expect.objectContaining({
      name: "Trans-Orange",
      nameSource: "palette-match",
      ruleResolverKind: "transparent-orange-evidence",
    }))
  })

  it("keeps tiny Pearl Gold rows when orange edge support is too weak", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-pearl-gold-with-weak-orange-edge",
        sample: sample({ b: 26, g: 53, r: 85 }, {
          chips: [
            chip({ b: 26, g: 53, r: 85 }, 0.23),
            chip({ b: 20, g: 69, r: 92 }, 0.1),
            chip({ b: 16, g: 24, r: 43 }, 0.1),
            chip({ b: 79, g: 142, r: 186 }, 0.07),
          ],
          dominantCoverage: 0.23,
          edgeChips: [
            chip({ b: 26, g: 53, r: 85 }, 0.05),
            chip({ b: 16, g: 24, r: 43 }, 0.05),
          ],
          pixelCount: 30,
          rejectedPixelCount: 89,
          rejectionCounts: {
            background: 27,
            border: 0,
            edge: 62,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-pearl-gold", "Pearl Gold", { b: 26, g: 53, r: 85 }),
      ]),
    })

    expect(result.colorsByPartId.get("tiny-pearl-gold-with-weak-orange-edge")).toEqual(expect.objectContaining({
      name: "Pearl Gold",
      nameSource: "prototype-match",
    }))
  })

  it("uses transparent yellow evidence when Yellow rows are tiny transparent parts", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-trans-yellow",
        sample: sample({ b: 77, g: 181, r: 200 }, {
          chips: [
            chip({ b: 77, g: 181, r: 200 }, 0.32),
            chip({ b: 112, g: 205, r: 214 }, 0.19),
            chip({ b: 143, g: 194, r: 200 }, 0.11),
            chip({ b: 89, g: 158, r: 171 }, 0.09),
            chip({ b: 190, g: 233, r: 234 }, 0.06),
          ],
          dominantCoverage: 0.32,
          edgeChips: [
            chip({ b: 87, g: 169, r: 180 }, 0.28),
            chip({ b: 123, g: 190, r: 202 }, 0.17),
            chip({ b: 66, g: 142, r: 155 }, 0.06),
          ],
          pixelCount: 54,
          rejectedPixelCount: 116,
          rejectionCounts: {
            background: 26,
            border: 0,
            edge: 96,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-yellow", "Yellow", { b: 77, g: 181, r: 200 }),
      ]),
    })

    expect(result.colorsByPartId.get("tiny-trans-yellow")).toEqual(expect.objectContaining({
      name: "Trans-Yellow",
      nameSource: "palette-match",
      ruleResolverKind: "transparent-yellow-evidence",
    }))
  })

  it("keeps Yellow when transparent yellow evidence has too many accepted pixels", () => {
    const result = calibrateManualPartColors([
      {
        id: "large-yellow",
        sample: sample({ b: 77, g: 181, r: 200 }, {
          chips: [
            chip({ b: 77, g: 181, r: 200 }, 0.32),
            chip({ b: 112, g: 205, r: 214 }, 0.19),
            chip({ b: 143, g: 194, r: 200 }, 0.11),
            chip({ b: 89, g: 158, r: 171 }, 0.09),
            chip({ b: 190, g: 233, r: 234 }, 0.06),
          ],
          dominantCoverage: 0.32,
          edgeChips: [
            chip({ b: 87, g: 169, r: 180 }, 0.28),
            chip({ b: 123, g: 190, r: 202 }, 0.17),
            chip({ b: 66, g: 142, r: 155 }, 0.06),
          ],
          pixelCount: 90,
          rejectedPixelCount: 116,
          rejectionCounts: {
            background: 26,
            border: 0,
            edge: 96,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-yellow", "Yellow", { b: 77, g: 181, r: 200 }),
      ]),
    })

    expect(result.colorsByPartId.get("large-yellow")).toEqual(expect.objectContaining({
      name: "Yellow",
      nameSource: "prototype-match",
    }))
  })

  it("uses yellow body evidence when tiny shadowed Yellow rows resolve as Trans-Yellow", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-shadowed-yellow",
        sample: sample({ b: 31, g: 54, r: 59 }, {
          chips: [
            chip({ b: 31, g: 54, r: 59 }, 0.16),
            chip({ b: 42, g: 157, r: 176 }, 0.13),
            chip({ b: 47, g: 99, r: 94 }, 0.08),
            chip({ b: 4, g: 33, r: 40 }, 0.05),
            chip({ b: 29, g: 34, r: 49 }, 0.05),
            chip({ b: 15, g: 72, r: 79 }, 0.05),
          ],
          dominantCoverage: 0.16,
          edgeChips: [
            chip({ b: 21, g: 47, r: 53 }, 0.05),
            chip({ b: 42, g: 186, r: 199 }, 0.05),
            chip({ b: 33, g: 99, r: 117 }, 0.05),
          ],
          pixelCount: 38,
          rejectedPixelCount: 107,
          rejectionCounts: {
            background: 38,
            border: 0,
            edge: 62,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-trans-yellow", "Trans-Yellow", { b: 31, g: 54, r: 59 }),
      ]),
    })

    expect(result.colorsByPartId.get("tiny-shadowed-yellow")).toEqual(expect.objectContaining({
      name: "Yellow",
      nameSource: "palette-match",
      ruleResolverKind: "yellow-body-evidence",
    }))
  })

  it("keeps true Trans-Yellow when bright yellow body support is strong", () => {
    const result = calibrateManualPartColors([
      {
        id: "bright-trans-yellow",
        sample: sample({ b: 77, g: 181, r: 200 }, {
          chips: [
            chip({ b: 77, g: 181, r: 200 }, 0.32),
            chip({ b: 112, g: 205, r: 214 }, 0.19),
            chip({ b: 143, g: 194, r: 200 }, 0.11),
            chip({ b: 89, g: 158, r: 171 }, 0.09),
            chip({ b: 190, g: 233, r: 234 }, 0.06),
          ],
          dominantCoverage: 0.32,
          edgeChips: [
            chip({ b: 87, g: 169, r: 180 }, 0.28),
            chip({ b: 123, g: 190, r: 202 }, 0.17),
            chip({ b: 66, g: 142, r: 155 }, 0.06),
          ],
          pixelCount: 42,
          rejectedPixelCount: 116,
          rejectionCounts: {
            background: 26,
            border: 0,
            edge: 96,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-trans-yellow", "Trans-Yellow", { b: 77, g: 181, r: 200 }),
      ]),
    })

    expect(result.colorsByPartId.get("bright-trans-yellow")).toEqual(expect.objectContaining({
      name: "Trans-Yellow",
      nameSource: "prototype-match",
    }))
  })

  it("uses yellow body evidence when tiny yellow rows resolve as dark colors", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-yellow-selected-as-dark-bluish-gray",
        sample: sample({ b: 29, g: 68, r: 82 }, {
          chips: [
            chip({ b: 29, g: 68, r: 82 }, 0.21),
            chip({ b: 10, g: 42, r: 57 }, 0.13),
            chip({ b: 42, g: 55, r: 75 }, 0.08),
            chip({ b: 33, g: 169, r: 164 }, 0.12),
            chip({ b: 28, g: 164, r: 173 }, 0.1),
            chip({ b: 53, g: 94, r: 109 }, 0.08),
          ],
          dominantCoverage: 0.21,
          edgeChips: [
            chip({ b: 29, g: 68, r: 82 }, 0.33),
          ],
          pixelCount: 38,
          rejectedPixelCount: 95,
          rejectionCounts: {
            background: 37,
            border: 0,
            edge: 54,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
      {
        id: "tiny-yellow-selected-as-dark-orange",
        sample: sample({ b: 20, g: 52, r: 56 }, {
          chips: [
            chip({ b: 20, g: 52, r: 56 }, 0.16),
            chip({ b: 15, g: 63, r: 83 }, 0.13),
            chip({ b: 42, g: 89, r: 118 }, 0.11),
            chip({ b: 24, g: 34, r: 37 }, 0.08),
            chip({ b: 41, g: 150, r: 169 }, 0.12),
            chip({ b: 37, g: 150, r: 169 }, 0.1),
            chip({ b: 37, g: 88, r: 83 }, 0.08),
          ],
          dominantCoverage: 0.16,
          edgeChips: [
            chip({ b: 20, g: 52, r: 56 }, 0.28),
          ],
          pixelCount: 38,
          rejectedPixelCount: 112,
          rejectionCounts: {
            background: 31,
            border: 0,
            edge: 66,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-bluish-gray", "Dark Bluish Gray", { b: 29, g: 68, r: 82 }),
        prototype("prototype-dark-orange", "Dark Orange", { b: 20, g: 52, r: 56 }),
      ]),
    })

    expect(result.colorsByPartId.get("tiny-yellow-selected-as-dark-bluish-gray")).toEqual(expect.objectContaining({
      name: "Yellow",
      nameSource: "palette-match",
      ruleResolverKind: "yellow-body-evidence",
    }))
    expect(result.colorsByPartId.get("tiny-yellow-selected-as-dark-orange")).toEqual(expect.objectContaining({
      name: "Yellow",
      nameSource: "palette-match",
      ruleResolverKind: "yellow-body-evidence",
    }))
  })

  it("does not rewrite transparent yellow rows to opaque yellow", () => {
    const result = calibrateManualPartColors([
      {
        id: "transparent-yellow-source",
        sample: sample({ b: 30, g: 160, r: 170 }, {
          chips: [
            chip({ b: 30, g: 160, r: 170 }, 0.3),
            chip({ b: 18, g: 50, r: 65 }, 0.25),
            chip({ b: 12, g: 30, r: 40 }, 0.25),
          ],
          dominantCoverage: 0.3,
          edgeChips: [
            chip({ b: 30, g: 160, r: 170 }, 0.4),
          ],
          pixelCount: 38,
          rejectedPixelCount: 112,
          rejectionCounts: {
            background: 31,
            border: 0,
            edge: 66,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-trans-yellow", "Trans-Yellow", { b: 30, g: 160, r: 170 }),
      ]),
    })

    expect(result.colorsByPartId.get("transparent-yellow-source")).toEqual(expect.objectContaining({
      name: "Trans-Yellow",
      nameSource: "prototype-match",
    }))
  })

  it("uses transparent green evidence when Dark Green rows are tiny transparent parts", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-trans-green",
        sample: sample({ b: 78, g: 101, r: 62 }, {
          chips: [
            chip({ b: 78, g: 101, r: 62 }, 0.44),
            chip({ b: 45, g: 63, r: 27 }, 0.26),
            chip({ b: 116, g: 141, r: 97 }, 0.09),
            chip({ b: 64, g: 82, r: 50 }, 0.06),
            chip({ b: 104, g: 122, r: 89 }, 0.06),
            chip({ b: 147, g: 163, r: 132 }, 0.03),
          ],
          dominantCoverage: 0.44,
          edgeChips: [
            chip({ b: 70, g: 96, r: 52 }, 0.32),
            chip({ b: 44, g: 66, r: 31 }, 0.22),
            chip({ b: 114, g: 145, r: 96 }, 0.08),
          ],
          pixelCount: 34,
          rejectedPixelCount: 158,
          rejectionCounts: {
            background: 25,
            border: 0,
            edge: 123,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-green", "Dark Green", { b: 78, g: 101, r: 62 }),
      ]),
    })

    expect(result.colorsByPartId.get("tiny-trans-green")).toEqual(expect.objectContaining({
      name: "Trans-Green",
      nameSource: "palette-match",
      ruleResolverKind: "transparent-green-evidence",
    }))
  })

  it("keeps larger Dark Green rows from using transparent green evidence", () => {
    const result = calibrateManualPartColors([
      {
        id: "larger-dark-green",
        sample: sample({ b: 78, g: 101, r: 62 }, {
          chips: [
            chip({ b: 78, g: 101, r: 62 }, 0.44),
            chip({ b: 45, g: 63, r: 27 }, 0.26),
            chip({ b: 116, g: 141, r: 97 }, 0.09),
            chip({ b: 64, g: 82, r: 50 }, 0.06),
            chip({ b: 104, g: 122, r: 89 }, 0.06),
            chip({ b: 147, g: 163, r: 132 }, 0.03),
          ],
          dominantCoverage: 0.44,
          edgeChips: [
            chip({ b: 70, g: 96, r: 52 }, 0.32),
            chip({ b: 44, g: 66, r: 31 }, 0.22),
            chip({ b: 114, g: 145, r: 96 }, 0.08),
          ],
          pixelCount: 59,
          rejectedPixelCount: 158,
          rejectionCounts: {
            background: 25,
            border: 0,
            edge: 123,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-green", "Dark Green", { b: 78, g: 101, r: 62 }),
      ]),
    })

    expect(result.colorsByPartId.get("larger-dark-green")).toEqual(expect.objectContaining({
      name: "Dark Green",
      nameSource: "prototype-match",
    }))
  })

  it("uses transparent green evidence when Green rows are tiny transparent parts", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-trans-green-from-green",
        sample: sample({ b: 51, g: 90, r: 37 }, {
          chips: [
            chip({ b: 51, g: 90, r: 37 }, 0.38),
            chip({ b: 79, g: 103, r: 61 }, 0.20),
            chip({ b: 65, g: 74, r: 57 }, 0.08),
            chip({ b: 70, g: 141, r: 88 }, 0.08),
          ],
          dominantCoverage: 0.38,
          edgeChips: [
            chip({ b: 51, g: 90, r: 37 }, 0.30),
            chip({ b: 79, g: 103, r: 61 }, 0.20),
            chip({ b: 70, g: 141, r: 88 }, 0.10),
          ],
          pixelCount: 40,
          rejectedPixelCount: 192,
          rejectionCounts: {
            background: 40,
            border: 0,
            edge: 137,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-green", "Green", { b: 51, g: 90, r: 37 }),
      ]),
    })

    expect(result.colorsByPartId.get("tiny-trans-green-from-green")).toEqual(expect.objectContaining({
      name: "Trans-Green",
      nameSource: "palette-match",
      ruleResolverKind: "transparent-green-evidence",
    }))
  })

  it("keeps Green when transparent green evidence from Green has too much light support", () => {
    const result = calibrateManualPartColors([
      {
        id: "light-green",
        sample: sample({ b: 51, g: 90, r: 37 }, {
          chips: [
            chip({ b: 51, g: 90, r: 37 }, 0.38),
            chip({ b: 79, g: 103, r: 61 }, 0.20),
            chip({ b: 65, g: 74, r: 57 }, 0.08),
            chip({ b: 70, g: 141, r: 88 }, 0.22),
          ],
          dominantCoverage: 0.38,
          edgeChips: [
            chip({ b: 51, g: 90, r: 37 }, 0.30),
            chip({ b: 79, g: 103, r: 61 }, 0.20),
            chip({ b: 70, g: 141, r: 88 }, 0.10),
          ],
          pixelCount: 40,
          rejectedPixelCount: 192,
          rejectionCounts: {
            background: 40,
            border: 0,
            edge: 137,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-green", "Green", { b: 51, g: 90, r: 37 }),
      ]),
    })

    expect(result.colorsByPartId.get("light-green")).toEqual(expect.objectContaining({
      name: "Green",
      nameSource: "prototype-match",
    }))
  })

  it("uses bright green evidence when Green rows are tiny edge-heavy Bright Green parts", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-bright-green",
        sample: sample({ b: 23, g: 62, r: 22 }, {
          chips: [
            chip({ b: 23, g: 62, r: 22 }, 0.18),
            chip({ b: 80, g: 171, r: 79 }, 0.20),
            chip({ b: 85, g: 147, r: 80 }, 0.18),
            chip({ b: 47, g: 88, r: 48 }, 0.10),
            chip({ b: 42, g: 53, r: 31 }, 0.08),
            chip({ b: 12, g: 42, r: 23 }, 0.08),
          ],
          dominantCoverage: 0.18,
          edgeChips: [
            chip({ b: 35, g: 76, r: 34 }, 0.31),
            chip({ b: 78, g: 160, r: 76 }, 0.22),
            chip({ b: 23, g: 62, r: 22 }, 0.12),
          ],
          pixelCount: 49,
          rejectedPixelCount: 260,
          rejectionCounts: {
            background: 46,
            border: 0,
            edge: 201,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-green", "Green", { b: 23, g: 62, r: 22 }),
      ]),
    })

    expect(result.colorsByPartId.get("tiny-bright-green")).toEqual(expect.objectContaining({
      name: "Bright Green",
      nameSource: "palette-match",
      ruleResolverKind: "bright-green-evidence",
    }))
  })

  it("keeps Green when bright green evidence has too little edge rejection", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-green",
        sample: sample({ b: 23, g: 62, r: 22 }, {
          chips: [
            chip({ b: 23, g: 62, r: 22 }, 0.18),
            chip({ b: 80, g: 171, r: 79 }, 0.20),
            chip({ b: 85, g: 147, r: 80 }, 0.18),
            chip({ b: 47, g: 88, r: 48 }, 0.10),
            chip({ b: 42, g: 53, r: 31 }, 0.08),
            chip({ b: 12, g: 42, r: 23 }, 0.08),
          ],
          dominantCoverage: 0.18,
          edgeChips: [
            chip({ b: 35, g: 76, r: 34 }, 0.31),
            chip({ b: 78, g: 160, r: 76 }, 0.22),
            chip({ b: 23, g: 62, r: 22 }, 0.12),
          ],
          pixelCount: 49,
          rejectedPixelCount: 260,
          rejectionCounts: {
            background: 46,
            border: 0,
            edge: 144,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-green", "Green", { b: 23, g: 62, r: 22 }),
      ]),
    })

    expect(result.colorsByPartId.get("tiny-green")).toEqual(expect.objectContaining({
      name: "Green",
      nameSource: "prototype-match",
    }))
  })

  it("keeps tiny Red rows opaque when background rejection is too low", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-opaque-red-body",
        sample: sample({ b: 72, g: 88, r: 174 }, {
          chips: [
            chip({ b: 72, g: 88, r: 174 }, 0.22),
            chip({ b: 34, g: 40, r: 96 }, 0.19),
            chip({ b: 56, g: 66, r: 141 }, 0.14),
            chip({ b: 76, g: 79, r: 151 }, 0.14),
            chip({ b: 110, g: 121, r: 203 }, 0.07),
            chip({ b: 17, g: 22, r: 63 }, 0.07),
            chip({ b: 80, g: 82, r: 160 }, 0.12),
          ],
          dominantCoverage: 0.22,
          edgeChips: [
            chip({ b: 43, g: 42, r: 68 }, 0.18),
            chip({ b: 59, g: 60, r: 109 }, 0.15),
            chip({ b: 130, g: 125, r: 134 }, 0.1),
            chip({ b: 159, g: 151, r: 152 }, 0.07),
            chip({ b: 67, g: 66, r: 87 }, 0.05),
            chip({ b: 18, g: 23, r: 65 }, 0.05),
          ],
          pixelCount: 42,
          rejectedPixelCount: 208,
          rejectionCounts: {
            background: 35,
            border: 0,
            edge: 120,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("tiny-opaque-red-body")).toEqual(expect.objectContaining({
      name: "Red",
      nameSource: "family-only",
    }))
  })

  it("uses tiny transparent red evidence when glass red resolves as Reddish Brown", () => {
    const result = calibrateManualPartColors([
      {
        id: "trans-red-from-reddish-brown",
        sample: sample({ b: 54, g: 54, r: 116 }, {
          chips: [
            chip({ b: 54, g: 54, r: 116 }, 0.25),
            chip({ b: 27, g: 37, r: 83 }, 0.19),
            chip({ b: 58, g: 65, r: 135 }, 0.13),
            chip({ b: 48, g: 46, r: 163 }, 0.08),
            chip({ b: 11, g: 15, r: 85 }, 0.06),
            chip({ b: 78, g: 87, r: 135 }, 0.06),
          ],
          dominantCoverage: 0.25,
          edgeChips: [
            chip({ b: 94, g: 94, r: 188 }, 0.15),
            chip({ b: 67, g: 69, r: 161 }, 0.08),
            chip({ b: 89, g: 90, r: 139 }, 0.05),
          ],
          pixelCount: 48,
          rejectedPixelCount: 95,
          rejectionCounts: {
            background: 24,
            border: 0,
            edge: 71,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("runtime-reddish-brown", "Reddish Brown", { b: 54, g: 54, r: 116 }),
      ]),
    })

    expect(result.colorsByPartId.get("trans-red-from-reddish-brown")).toEqual(expect.objectContaining({
      name: "Trans-Red",
      nameSource: "palette-match",
      ruleResolverKind: "transparent-primary-evidence",
    }))
  })

  it("uses tiny transparent red evidence when glass red resolves as Dark Red", () => {
    const result = calibrateManualPartColors([
      {
        id: "trans-red-from-dark-red",
        sample: sample({ b: 31, g: 35, r: 96 }, {
          chips: [
            chip({ b: 31, g: 35, r: 96 }, 0.27),
            chip({ b: 49, g: 49, r: 125 }, 0.1),
            chip({ b: 71, g: 76, r: 146 }, 0.1),
            chip({ b: 19, g: 36, r: 73 }, 0.08),
            chip({ b: 44, g: 47, r: 155 }, 0.06),
            chip({ b: 60, g: 65, r: 176 }, 0.04),
            chip({ b: 72, g: 70, r: 125 }, 0.12),
          ],
          dominantCoverage: 0.27,
          edgeChips: [
            chip({ b: 75, g: 82, r: 163 }, 0.14),
            chip({ b: 95, g: 90, r: 145 }, 0.12),
            chip({ b: 100, g: 102, r: 191 }, 0.11),
            chip({ b: 171, g: 168, r: 175 }, 0.09),
            chip({ b: 94, g: 92, r: 125 }, 0.06),
            chip({ b: 66, g: 63, r: 81 }, 0.04),
          ],
          pixelCount: 49,
          rejectedPixelCount: 187,
          rejectionCounts: {
            background: 44,
            border: 0,
            edge: 125,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("trans-red-from-dark-red")).toEqual(expect.objectContaining({
      name: "Trans-Red",
      nameSource: "palette-match",
      ruleResolverKind: "transparent-primary-evidence",
    }))
  })

  it("keeps larger Dark Red rows from using tiny transparent red evidence", () => {
    const result = calibrateManualPartColors([
      {
        id: "larger-dark-red",
        sample: sample({ b: 31, g: 35, r: 96 }, {
          chips: [
            chip({ b: 31, g: 35, r: 96 }, 0.27),
            chip({ b: 49, g: 49, r: 125 }, 0.1),
            chip({ b: 71, g: 76, r: 146 }, 0.1),
            chip({ b: 19, g: 36, r: 73 }, 0.08),
            chip({ b: 44, g: 47, r: 155 }, 0.06),
            chip({ b: 60, g: 65, r: 176 }, 0.04),
            chip({ b: 72, g: 70, r: 125 }, 0.12),
          ],
          dominantCoverage: 0.27,
          edgeChips: [
            chip({ b: 75, g: 82, r: 163 }, 0.14),
            chip({ b: 95, g: 90, r: 145 }, 0.12),
            chip({ b: 100, g: 102, r: 191 }, 0.11),
            chip({ b: 171, g: 168, r: 175 }, 0.09),
            chip({ b: 94, g: 92, r: 125 }, 0.06),
            chip({ b: 66, g: 63, r: 81 }, 0.04),
          ],
          pixelCount: 90,
          rejectedPixelCount: 187,
          rejectionCounts: {
            background: 44,
            border: 0,
            edge: 125,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("larger-dark-red")).toEqual(expect.objectContaining({
      name: "Dark Red",
      nameSource: "family-only",
    }))
  })

  it("keeps larger Reddish Brown rows from using tiny transparent red evidence", () => {
    const result = calibrateManualPartColors([
      {
        id: "larger-reddish-brown",
        sample: sample({ b: 54, g: 54, r: 116 }, {
          chips: [
            chip({ b: 54, g: 54, r: 116 }, 0.25),
            chip({ b: 27, g: 37, r: 83 }, 0.19),
            chip({ b: 58, g: 65, r: 135 }, 0.13),
            chip({ b: 48, g: 46, r: 163 }, 0.08),
            chip({ b: 11, g: 15, r: 85 }, 0.06),
            chip({ b: 78, g: 87, r: 135 }, 0.06),
          ],
          dominantCoverage: 0.25,
          edgeChips: [
            chip({ b: 94, g: 94, r: 188 }, 0.15),
            chip({ b: 67, g: 69, r: 161 }, 0.08),
            chip({ b: 89, g: 90, r: 139 }, 0.05),
          ],
          pixelCount: 90,
          rejectedPixelCount: 95,
          rejectionCounts: {
            background: 24,
            border: 0,
            edge: 71,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("runtime-reddish-brown", "Reddish Brown", { b: 54, g: 54, r: 116 }),
      ]),
    })

    expect(result.colorsByPartId.get("larger-reddish-brown")).toEqual(expect.objectContaining({
      name: "Reddish Brown",
      nameSource: "prototype-match",
    }))
  })

  it("uses saturated transparent dark-blue edge evidence", () => {
    const result = calibrateManualPartColors([
      {
        id: "trans-dark-blue-from-blue",
        sample: sample({ b: 155, g: 72, r: 50 }, {
          chips: [
            chip({ b: 155, g: 72, r: 50 }, 0.31),
            chip({ b: 140, g: 50, r: 31 }, 0.17),
            chip({ b: 95, g: 39, r: 27 }, 0.17),
            chip({ b: 162, g: 99, r: 85 }, 0.12),
            chip({ b: 196, g: 121, r: 98 }, 0.1),
            chip({ b: 96, g: 48, r: 32 }, 0.13),
          ],
          dominantCoverage: 0.31,
          edgeChips: [
            chip({ b: 150, g: 60, r: 44 }, 0.48),
            chip({ b: 99, g: 39, r: 25 }, 0.25),
            chip({ b: 180, g: 100, r: 85 }, 0.19),
          ],
          pixelCount: 59,
          rejectedPixelCount: 138,
          rejectionCounts: {
            background: 38,
            border: 0,
            edge: 98,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
      {
        id: "trans-dark-blue-from-dark-purple",
        sample: sample({ b: 144, g: 65, r: 45 }, {
          chips: [
            chip({ b: 144, g: 65, r: 45 }, 0.34),
            chip({ b: 186, g: 115, r: 96 }, 0.16),
            chip({ b: 122, g: 45, r: 25 }, 0.11),
            chip({ b: 101, g: 57, r: 44 }, 0.09),
            chip({ b: 151, g: 68, r: 44 }, 0.18),
            chip({ b: 86, g: 36, r: 24 }, 0.12),
          ],
          dominantCoverage: 0.34,
          edgeChips: [
            chip({ b: 144, g: 65, r: 45 }, 0.45),
            chip({ b: 186, g: 115, r: 96 }, 0.2),
            chip({ b: 92, g: 42, r: 25 }, 0.18),
            chip({ b: 122, g: 45, r: 25 }, 0.04),
          ],
          pixelCount: 70,
          rejectedPixelCount: 126,
          rejectionCounts: {
            background: 40,
            border: 0,
            edge: 86,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
      {
        id: "opaque-blue",
        sample: sample({ b: 191, g: 85, r: 0 }, {
          chips: [
            chip({ b: 191, g: 85, r: 0 }, 0.74),
            chip({ b: 130, g: 58, r: 0 }, 0.16),
          ],
          dominantCoverage: 0.74,
          edgeChips: [
            chip({ b: 108, g: 50, r: 0 }, 0.35),
          ],
          pixelCount: 160,
          rejectedPixelCount: 60,
          rejectionCounts: {
            background: 20,
            border: 0,
            edge: 40,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("trans-dark-blue-from-blue")).toEqual(expect.objectContaining({
      name: "Trans-Dark Blue",
      nameSource: "palette-match",
      ruleResolverKind: "transparent-primary-evidence",
    }))
    expect(result.colorsByPartId.get("trans-dark-blue-from-dark-purple")).toEqual(expect.objectContaining({
      name: "Trans-Dark Blue",
      nameSource: "palette-match",
      ruleResolverKind: "transparent-primary-evidence",
    }))
    expect(result.colorsByPartId.get("opaque-blue")).toEqual(expect.objectContaining({
      name: "Blue",
      nameSource: "family-only",
    }))
  })

  it("uses transparent light blue evidence for tiny cyan-glass samples selected as Dark Bluish Gray", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-trans-light-blue-selected-as-dark-bluish-gray",
        sample: sample({ b: 112, g: 107, r: 80 }, {
          chips: [
            chip({ b: 112, g: 107, r: 80 }, 0.38),
            chip({ b: 150, g: 146, r: 121 }, 0.33),
            chip({ b: 86, g: 83, r: 60 }, 0.24),
            chip({ b: 135, g: 126, r: 99 }, 0.05),
          ],
          dominantCoverage: 0.38,
          edgeChips: [
            chip({ b: 112, g: 107, r: 80 }, 0.44),
            chip({ b: 86, g: 83, r: 60 }, 0.28),
          ],
          pixelCount: 21,
          rejectedPixelCount: 141,
          rejectionCounts: {
            background: 67,
            border: 0,
            edge: 74,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-bluish-gray", "Dark Bluish Gray", { b: 112, g: 107, r: 80 }),
      ]),
    })

    expect(result.colorsByPartId.get("tiny-trans-light-blue-selected-as-dark-bluish-gray")).toEqual(
      expect.objectContaining({
        name: "Trans-Light Blue",
        nameSource: "palette-match",
        ruleResolverKind: "transparent-light-blue-evidence",
      }),
    )
  })

  it("keeps dark-core cyan neutral samples from using transparent light blue evidence", () => {
    const result = calibrateManualPartColors([
      {
        id: "dark-core-cyan-neutral",
        sample: sample({ b: 95, g: 89, r: 65 }, {
          chips: [
            chip({ b: 112, g: 107, r: 80 }, 0.55),
            chip({ b: 62, g: 60, r: 37 }, 0.25),
            chip({ b: 150, g: 146, r: 121 }, 0.2),
          ],
          dominantCoverage: 0.55,
          edgeChips: [
            chip({ b: 112, g: 107, r: 80 }, 0.5),
            chip({ b: 62, g: 60, r: 37 }, 0.3),
          ],
          pixelCount: 22,
          rejectedPixelCount: 145,
          rejectionCounts: {
            background: 68,
            border: 0,
            edge: 74,
            excludedRegion: 3,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-bluish-gray", "Dark Bluish Gray", { b: 95, g: 89, r: 65 }),
      ]),
    })

    expect(result.colorsByPartId.get("dark-core-cyan-neutral")).toEqual(expect.objectContaining({
      name: "Dark Bluish Gray",
      nameSource: "prototype-match",
    }))
  })

  it("uses transparent light blue evidence for tiny black-core glass samples selected as Black", () => {
    const result = calibrateManualPartColors([
      {
        id: "black-core-trans-light-blue",
        sample: sample({ b: 9, g: 8, r: 6 }, {
          chips: [
            chip({ b: 9, g: 8, r: 6 }, 0.53),
            chip({ b: 25, g: 25, r: 14 }, 0.17),
            chip({ b: 96, g: 91, r: 66 }, 0.08),
            chip({ b: 116, g: 113, r: 82 }, 0.06),
            chip({ b: 182, g: 179, r: 150 }, 0.06),
          ],
          dominantCoverage: 0.53,
          edgeChips: [
            chip({ b: 96, g: 91, r: 66 }, 0.18),
            chip({ b: 9, g: 8, r: 6 }, 0.5),
          ],
          pixelCount: 53,
          rejectedPixelCount: 338,
          rejectionCounts: {
            background: 198,
            border: 0,
            edge: 140,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-black", "Black", { b: 9, g: 8, r: 6 }),
      ]),
    })

    expect(result.colorsByPartId.get("black-core-trans-light-blue")).toEqual(expect.objectContaining({
      name: "Trans-Light Blue",
      nameSource: "palette-match",
      ruleResolverKind: "transparent-light-blue-evidence",
    }))
  })

  it("keeps true black samples without cyan glass support from using transparent light blue evidence", () => {
    const result = calibrateManualPartColors([
      {
        id: "black-without-cyan-glass",
        sample: sample({ b: 12, g: 12, r: 12 }, {
          chips: [
            chip({ b: 12, g: 12, r: 12 }, 0.7),
            chip({ b: 35, g: 35, r: 35 }, 0.2),
            chip({ b: 68, g: 68, r: 68 }, 0.1),
          ],
          dominantCoverage: 0.7,
          edgeChips: [
            chip({ b: 35, g: 35, r: 35 }, 0.5),
          ],
          pixelCount: 48,
          rejectedPixelCount: 180,
          rejectionCounts: {
            background: 90,
            border: 0,
            edge: 90,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-black", "Black", { b: 12, g: 12, r: 12 }),
      ]),
    })

    expect(result.colorsByPartId.get("black-without-cyan-glass")).toEqual(expect.objectContaining({
      name: "Black",
      nameSource: "prototype-match",
    }))
  })

  it("uses transparent light blue evidence for high-background Light Bluish Gray glass samples", () => {
    const result = calibrateManualPartColors([
      {
        id: "light-bluish-gray-trans-light-blue",
        sample: sample({ b: 150, g: 130, r: 80 }, {
          chips: [
            chip({ b: 150, g: 130, r: 80 }, 0.45),
            chip({ b: 158, g: 145, r: 110 }, 0.35),
            chip({ b: 110, g: 90, r: 50 }, 0.2),
          ],
          dominantCoverage: 0.45,
          edgeChips: [
            chip({ b: 150, g: 130, r: 80 }, 0.5),
            chip({ b: 158, g: 145, r: 110 }, 0.25),
          ],
          pixelCount: 36,
          rejectedPixelCount: 214,
          rejectionCounts: {
            background: 176,
            border: 0,
            edge: 58,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 150, g: 130, r: 80 }),
      ]),
    })

    expect(result.colorsByPartId.get("light-bluish-gray-trans-light-blue")).toEqual(expect.objectContaining({
      name: "Trans-Light Blue",
      nameSource: "palette-match",
      ruleResolverKind: "transparent-light-blue-evidence",
    }))
  })

  it("keeps Light Bluish Gray when cyan glass has too little background rejection", () => {
    const result = calibrateManualPartColors([
      {
        id: "light-bluish-gray-with-cyan-edge",
        sample: sample({ b: 150, g: 130, r: 80 }, {
          chips: [
            chip({ b: 150, g: 130, r: 80 }, 0.45),
            chip({ b: 158, g: 145, r: 110 }, 0.35),
            chip({ b: 110, g: 90, r: 50 }, 0.2),
          ],
          dominantCoverage: 0.45,
          edgeChips: [
            chip({ b: 150, g: 130, r: 80 }, 0.5),
            chip({ b: 158, g: 145, r: 110 }, 0.25),
          ],
          pixelCount: 36,
          rejectedPixelCount: 170,
          rejectionCounts: {
            background: 118,
            border: 0,
            edge: 58,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 150, g: 130, r: 80 }),
      ]),
    })

    expect(result.colorsByPartId.get("light-bluish-gray-with-cyan-edge")).toEqual(expect.objectContaining({
      name: "Light Bluish Gray",
      nameSource: "prototype-match",
    }))
  })

  it("uses transparent dark blue evidence for dark and sand blue glass samples", () => {
    const result = calibrateManualPartColors([
      {
        id: "dark-blue-glass",
        sample: sample({ b: 90, g: 41, r: 28 }, {
          chips: [
            chip({ b: 90, g: 41, r: 28 }, 0.33),
            chip({ b: 138, g: 81, r: 66 }, 0.17),
            chip({ b: 150, g: 54, r: 38 }, 0.1),
            chip({ b: 165, g: 98, r: 85 }, 0.1),
            chip({ b: 118, g: 70, r: 55 }, 0.15),
          ],
          dominantCoverage: 0.33,
          edgeChips: [
            chip({ b: 138, g: 81, r: 66 }, 0.35),
            chip({ b: 118, g: 70, r: 55 }, 0.25),
            chip({ b: 165, g: 98, r: 85 }, 0.2),
            chip({ b: 150, g: 54, r: 38 }, 0.1),
            chip({ b: 170, g: 93, r: 76 }, 0.1),
          ],
          pixelCount: 72,
          rejectedPixelCount: 89,
          rejectionCounts: {
            background: 23,
            border: 0,
            edge: 66,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
      {
        id: "sand-blue-glass",
        sample: sample({ b: 172, g: 105, r: 86 }, {
          chips: [
            chip({ b: 172, g: 105, r: 86 }, 0.24),
            chip({ b: 118, g: 70, r: 55 }, 0.2),
            chip({ b: 155, g: 71, r: 50 }, 0.16),
            chip({ b: 155, g: 71, r: 50 }, 0.1),
            chip({ b: 91, g: 42, r: 31 }, 0.1),
          ],
          dominantCoverage: 0.24,
          edgeChips: [
            chip({ b: 172, g: 105, r: 86 }, 0.36),
            chip({ b: 118, g: 70, r: 55 }, 0.28),
            chip({ b: 155, g: 71, r: 50 }, 0.2),
            chip({ b: 155, g: 71, r: 50 }, 0.12),
          ],
          pixelCount: 99,
          rejectedPixelCount: 91,
          rejectionCounts: {
            background: 32,
            border: 0,
            edge: 59,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-blue", "Dark Blue", { b: 90, g: 41, r: 28 }),
        prototype("prototype-sand-blue", "Sand Blue", { b: 172, g: 105, r: 86 }),
      ]),
    })

    expect(result.colorsByPartId.get("dark-blue-glass")).toEqual(expect.objectContaining({
      name: "Trans-Dark Blue",
      nameSource: "palette-match",
      ruleResolverKind: "transparent-dark-blue-evidence",
    }))
    expect(result.colorsByPartId.get("sand-blue-glass")).toEqual(expect.objectContaining({
      name: "Trans-Dark Blue",
      nameSource: "palette-match",
      ruleResolverKind: "transparent-dark-blue-evidence",
    }))
  })

  it("keeps Dark Blue when dark-blue glass evidence has too many accepted pixels", () => {
    const result = calibrateManualPartColors([
      {
        id: "large-dark-blue",
        sample: sample({ b: 90, g: 41, r: 28 }, {
          chips: [
            chip({ b: 90, g: 41, r: 28 }, 0.45),
            chip({ b: 138, g: 81, r: 66 }, 0.2),
            chip({ b: 150, g: 54, r: 38 }, 0.1),
            chip({ b: 115, g: 55, r: 41 }, 0.1),
            chip({ b: 30, g: 30, r: 28 }, 0.1),
          ],
          dominantCoverage: 0.45,
          edgeChips: [
            chip({ b: 90, g: 41, r: 28 }, 0.5),
            chip({ b: 138, g: 81, r: 66 }, 0.2),
            chip({ b: 115, g: 55, r: 41 }, 0.16),
            chip({ b: 150, g: 54, r: 38 }, 0.1),
          ],
          pixelCount: 140,
          rejectedPixelCount: 89,
          rejectionCounts: {
            background: 23,
            border: 0,
            edge: 66,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-blue", "Dark Blue", { b: 90, g: 41, r: 28 }),
      ]),
    })

    expect(result.colorsByPartId.get("large-dark-blue")).toEqual(expect.objectContaining({
      name: "Dark Blue",
      nameSource: "prototype-match",
    }))
  })

  it("uses transparent brown evidence for edge-heavy Flat Silver glass samples", () => {
    const result = calibrateManualPartColors([
      {
        id: "flat-silver-trans-brown",
        sample: sample({ b: 106, g: 108, r: 105 }, {
          chips: [
            chip({ b: 106, g: 108, r: 105 }, 0.72),
            chip({ b: 95, g: 96, r: 94 }, 0.15),
            chip({ b: 70, g: 70, r: 68 }, 0.08),
          ],
          dominantCoverage: 0.72,
          edgeChips: [
            chip({ b: 94, g: 92, r: 85 }, 0.5),
            chip({ b: 125, g: 120, r: 110 }, 0.18),
          ],
          pixelCount: 54,
          rejectedPixelCount: 167,
          rejectionCounts: {
            background: 45,
            border: 0,
            edge: 105,
            excludedRegion: 17,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-flat-silver", "Flat Silver", { b: 106, g: 108, r: 105 }),
      ]),
    })

    expect(result.colorsByPartId.get("flat-silver-trans-brown")).toEqual(expect.objectContaining({
      name: "Trans-Brown",
      nameSource: "palette-match",
      ruleResolverKind: "transparent-brown-evidence",
    }))
  })

  it("keeps Flat Silver when edge-heavy neutral samples lack cyan glass edge support", () => {
    const result = calibrateManualPartColors([
      {
        id: "flat-silver-neutral-edge",
        sample: sample({ b: 106, g: 108, r: 105 }, {
          chips: [
            chip({ b: 106, g: 108, r: 105 }, 0.72),
            chip({ b: 95, g: 96, r: 94 }, 0.15),
            chip({ b: 70, g: 70, r: 68 }, 0.08),
          ],
          dominantCoverage: 0.72,
          edgeChips: [
            chip({ b: 96, g: 96, r: 94 }, 0.5),
            chip({ b: 126, g: 126, r: 123 }, 0.18),
          ],
          pixelCount: 54,
          rejectedPixelCount: 167,
          rejectionCounts: {
            background: 45,
            border: 0,
            edge: 105,
            excludedRegion: 17,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-flat-silver", "Flat Silver", { b: 106, g: 108, r: 105 }),
      ]),
    })

    expect(result.colorsByPartId.get("flat-silver-neutral-edge")).toEqual(expect.objectContaining({
      name: "Flat Silver",
      nameSource: "prototype-match",
    }))
  })

  it("uses transparent orange evidence when Reddish Brown rows are tiny transparent parts", () => {
    const result = calibrateManualPartColors([
      {
        id: "reddish-brown-trans-orange",
        sample: sample({ b: 35, g: 73, r: 132 }, {
          chips: [
            chip({ b: 35, g: 73, r: 132 }, 0.45),
            chip({ b: 50, g: 102, r: 175 }, 0.2),
            chip({ b: 25, g: 50, r: 90 }, 0.12),
            chip({ b: 20, g: 32, r: 45 }, 0.1),
          ],
          dominantCoverage: 0.45,
          edgeChips: [
            chip({ b: 45, g: 96, r: 160 }, 0.25),
            chip({ b: 30, g: 70, r: 115 }, 0.15),
          ],
          pixelCount: 61,
          rejectedPixelCount: 150,
          rejectionCounts: {
            background: 45,
            border: 0,
            edge: 60,
            excludedRegion: 45,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-reddish-brown", "Reddish Brown", { b: 35, g: 73, r: 132 }),
      ]),
    })

    expect(result.colorsByPartId.get("reddish-brown-trans-orange")).toEqual(expect.objectContaining({
      name: "Trans-Orange",
      nameSource: "palette-match",
      ruleResolverKind: "transparent-orange-evidence",
    }))
  })

  it("keeps Reddish Brown when transparent orange evidence has too much dark body", () => {
    const result = calibrateManualPartColors([
      {
        id: "dark-reddish-brown",
        sample: sample({ b: 35, g: 73, r: 132 }, {
          chips: [
            chip({ b: 35, g: 73, r: 132 }, 0.45),
            chip({ b: 20, g: 32, r: 45 }, 0.4),
            chip({ b: 25, g: 50, r: 90 }, 0.05),
            chip({ b: 50, g: 102, r: 175 }, 0.08),
          ],
          dominantCoverage: 0.45,
          edgeChips: [
            chip({ b: 45, g: 96, r: 160 }, 0.25),
            chip({ b: 30, g: 70, r: 115 }, 0.15),
          ],
          pixelCount: 61,
          rejectedPixelCount: 150,
          rejectionCounts: {
            background: 45,
            border: 0,
            edge: 60,
            excludedRegion: 45,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-reddish-brown", "Reddish Brown", { b: 35, g: 73, r: 132 }),
      ]),
    })

    expect(result.colorsByPartId.get("dark-reddish-brown")).toEqual(expect.objectContaining({
      name: "Reddish Brown",
      nameSource: "prototype-match",
    }))
  })

  it("uses transparent yellow evidence when Tan rows are tiny transparent parts", () => {
    const result = calibrateManualPartColors([
      {
        id: "tan-trans-yellow",
        sample: sample({ b: 54, g: 220, r: 252 }, {
          chips: [
            chip({ b: 54, g: 220, r: 252 }, 0.8),
            chip({ b: 90, g: 210, r: 230 }, 0.12),
          ],
          dominantCoverage: 0.8,
          edgeChips: [
            chip({ b: 54, g: 220, r: 252 }, 0.55),
            chip({ b: 90, g: 210, r: 230 }, 0.15),
          ],
          pixelCount: 59,
          rejectedPixelCount: 134,
          rejectionCounts: {
            background: 37,
            border: 0,
            edge: 101,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-tan", "Tan", { b: 54, g: 220, r: 252 }),
      ]),
    })

    expect(result.colorsByPartId.get("tan-trans-yellow")).toEqual(expect.objectContaining({
      name: "Trans-Yellow",
      nameSource: "palette-match",
      ruleResolverKind: "transparent-yellow-evidence",
    }))
  })

  it("keeps Tan when transparent yellow evidence from Tan lacks yellow edge support", () => {
    const result = calibrateManualPartColors([
      {
        id: "tan-yellow-body",
        sample: sample({ b: 54, g: 220, r: 252 }, {
          chips: [
            chip({ b: 54, g: 220, r: 252 }, 0.8),
            chip({ b: 90, g: 210, r: 230 }, 0.12),
          ],
          dominantCoverage: 0.8,
          edgeChips: [
            chip({ b: 88, g: 110, r: 120 }, 0.3),
            chip({ b: 100, g: 130, r: 140 }, 0.15),
          ],
          pixelCount: 59,
          rejectedPixelCount: 134,
          rejectionCounts: {
            background: 37,
            border: 0,
            edge: 101,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-tan", "Tan", { b: 54, g: 220, r: 252 }),
      ]),
    })

    expect(result.colorsByPartId.get("tan-yellow-body")).toEqual(expect.objectContaining({
      name: "Tan",
      nameSource: "prototype-match",
    }))
  })

  it("uses bright red body evidence when Red resolves as Dark Red", () => {
    const result = calibrateManualPartColors([
      {
        id: "shadowed-red-body",
        sample: sample({ b: 10, g: 19, r: 130 }, {
          chips: [
            chip({ b: 10, g: 19, r: 130 }, 0.37),
            chip({ b: 10, g: 14, r: 197 }, 0.3),
            chip({ b: 15, g: 18, r: 154 }, 0.12),
            chip({ b: 7, g: 26, r: 86 }, 0.08),
            chip({ b: 25, g: 20, r: 106 }, 0.06),
          ],
          dominantCoverage: 0.37,
          edgeChips: [
            chip({ b: 11, g: 16, r: 189 }, 0.33),
            chip({ b: 10, g: 19, r: 130 }, 0.23),
            chip({ b: 8, g: 22, r: 102 }, 0.12),
          ],
          pixelCount: 288,
          rejectedPixelCount: 433,
          rejectionCounts: {
            background: 126,
            border: 0,
            edge: 307,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("shadowed-red-body")).toEqual(expect.objectContaining({
      name: "Red",
      nameSource: "palette-match",
      ruleResolverKind: "red-body-evidence",
    }))
  })

  it("uses low-near-black red body evidence when small Red resolves as Dark Red", () => {
    const result = calibrateManualPartColors([
      {
        id: "small-shadowed-red-body",
        sample: sample({ b: 10, g: 19, r: 130 }, {
          chips: [
            chip({ b: 10, g: 19, r: 130 }, 0.36),
            chip({ b: 10, g: 14, r: 197 }, 0.18),
            chip({ b: 15, g: 18, r: 154 }, 0.14),
            chip({ b: 24, g: 20, r: 118 }, 0.18),
          ],
          dominantCoverage: 0.36,
          edgeChips: [
            chip({ b: 11, g: 16, r: 189 }, 0.34),
            chip({ b: 10, g: 19, r: 130 }, 0.24),
            chip({ b: 15, g: 18, r: 154 }, 0.1),
          ],
          pixelCount: 123,
          rejectedPixelCount: 334,
          rejectionCounts: {
            background: 123,
            border: 0,
            edge: 211,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("small-shadowed-red-body")).toEqual(expect.objectContaining({
      name: "Red",
      nameSource: "palette-match",
      ruleResolverKind: "red-body-evidence",
    }))
  })

  it("keeps true Dark Red when red body evidence has near-black support", () => {
    const result = calibrateManualPartColors([
      {
        id: "near-black-dark-red-body",
        sample: sample({ b: 10, g: 19, r: 130 }, {
          chips: [
            chip({ b: 10, g: 19, r: 130 }, 0.36),
            chip({ b: 10, g: 14, r: 197 }, 0.18),
            chip({ b: 15, g: 18, r: 154 }, 0.14),
            chip({ b: 7, g: 20, r: 70 }, 0.08),
            chip({ b: 24, g: 20, r: 118 }, 0.12),
          ],
          dominantCoverage: 0.36,
          edgeChips: [
            chip({ b: 11, g: 16, r: 189 }, 0.34),
            chip({ b: 10, g: 19, r: 130 }, 0.24),
            chip({ b: 15, g: 18, r: 154 }, 0.1),
          ],
          pixelCount: 123,
          rejectedPixelCount: 334,
          rejectionCounts: {
            background: 123,
            border: 0,
            edge: 211,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("near-black-dark-red-body")).toEqual(expect.objectContaining({
      name: "Dark Red",
      nameSource: "family-only",
    }))
  })

  it("keeps Dark Red when red body evidence has too much background rejection", () => {
    const result = calibrateManualPartColors([
      {
        id: "high-background-dark-red",
        sample: sample({ b: 10, g: 19, r: 130 }, {
          chips: [
            chip({ b: 10, g: 19, r: 130 }, 0.37),
            chip({ b: 10, g: 14, r: 197 }, 0.3),
            chip({ b: 15, g: 18, r: 154 }, 0.12),
            chip({ b: 7, g: 26, r: 86 }, 0.08),
            chip({ b: 25, g: 20, r: 106 }, 0.06),
          ],
          dominantCoverage: 0.37,
          edgeChips: [
            chip({ b: 11, g: 16, r: 189 }, 0.33),
            chip({ b: 10, g: 19, r: 130 }, 0.23),
            chip({ b: 8, g: 22, r: 102 }, 0.12),
          ],
          pixelCount: 288,
          rejectedPixelCount: 433,
          rejectionCounts: {
            background: 150,
            border: 0,
            edge: 283,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("high-background-dark-red")).toEqual(expect.objectContaining({
      name: "Dark Red",
      nameSource: "family-only",
    }))
  })

  it("uses warm mid-neutral evidence to rescue Flat Silver from Light Bluish Gray", () => {
    const result = calibrateManualPartColors([
      row("flat-silver", { b: 130, g: 131, r: 133 }),
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 130, g: 131, r: 133 }),
      ]),
    })

    expect(result.colorsByPartId.get("flat-silver")).toEqual(expect.objectContaining({
      name: "Flat Silver",
      nameSource: "palette-match",
      ruleCandidateNames: expect.arrayContaining(["Flat Silver", "Light Bluish Gray"]),
      ruleResolverKind: "flat-silver-evidence",
    }))
  })

  it("uses dark tan body evidence when bluish-gray edge pixels were selected", () => {
    const result = calibrateManualPartColors([
      {
        id: "edge-polluted-dark-tan",
        sample: sample({ b: 83, g: 102, r: 110 }, {
          chips: [
            chip({ b: 83, g: 102, r: 110 }, 0.31),
            chip({ b: 57, g: 73, r: 80 }, 0.28),
            chip({ b: 113, g: 135, r: 144 }, 0.23),
            chip({ b: 100, g: 117, r: 123 }, 0.07),
            chip({ b: 27, g: 43, r: 50 }, 0.03),
          ],
          dominantCoverage: 0.31,
          selectedChipIndex: 0,
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("edge-polluted-dark-tan")).toEqual(expect.objectContaining({
      name: "Dark Tan",
      nameSource: "palette-match",
      observedHex: "#6e6653",
      ruleResolverKind: "dark-tan-body-evidence",
    }))
  })

  it("uses one close Dark Tan anchor chip when muted body evidence is strong", () => {
    const result = calibrateManualPartColors([
      {
        id: "shadowed-dark-tan",
        sample: sample({ b: 63, g: 80, r: 88 }, {
          chips: [
            chip({ b: 63, g: 80, r: 88 }, 0.3),
            chip({ b: 89, g: 105, r: 112 }, 0.18),
            chip({ b: 115, g: 137, r: 149 }, 0.17),
            chip({ b: 90, g: 106, r: 119 }, 0.08),
            chip({ b: 43, g: 56, r: 66 }, 0.04),
          ],
          dominantCoverage: 0.3,
          selectedChipIndex: 0,
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("shadowed-dark-tan")).toEqual(expect.objectContaining({
      name: "Dark Tan",
      nameSource: "palette-match",
      ruleResolverKind: "dark-tan-body-evidence",
    }))
  })

  it("uses dark tan body evidence when Dark Tan resolves as Dark Brown", () => {
    const result = calibrateManualPartColors([
      {
        id: "dark-brown-source-dark-tan",
        sample: sample({ b: 51, g: 68, r: 75 }, {
          chips: [
            chip({ b: 51, g: 68, r: 75 }, 0.26),
            chip({ b: 115, g: 138, r: 147 }, 0.21),
            chip({ b: 89, g: 110, r: 119 }, 0.13),
            chip({ b: 84, g: 97, r: 104 }, 0.13),
            chip({ b: 64, g: 73, r: 84 }, 0.06),
          ],
          dominantCoverage: 0.27,
          pixelCount: 159,
          rejectedPixelCount: 50,
          rejectionCounts: {
            background: 30,
            border: 0,
            edge: 20,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          selectedChipIndex: 0,
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("dark-brown-source-dark-tan")).toEqual(expect.objectContaining({
      name: "Dark Tan",
      nameSource: "palette-match",
      ruleResolverKind: "dark-tan-body-evidence",
    }))
  })

  it("does not force saturated Tan or olive Dark Gray evidence to Dark Tan", () => {
    const result = calibrateManualPartColors([
      {
        id: "shadowed-tan",
        sample: sample({ b: 79, g: 105, r: 120 }, {
          chips: [
            chip({ b: 79, g: 105, r: 120 }, 0.35),
            chip({ b: 111, g: 135, r: 150 }, 0.3),
            chip({ b: 65, g: 91, r: 107 }, 0.12),
            chip({ b: 102, g: 141, r: 151 }, 0.1),
          ],
          dominantCoverage: 0.35,
          selectedChipIndex: 0,
          status: "review",
        }),
      },
      {
        id: "olive-dark-gray",
        sample: sample({ b: 86, g: 105, r: 103 }, {
          chips: [
            chip({ b: 86, g: 105, r: 103 }, 0.59),
            chip({ b: 44, g: 56, r: 55 }, 0.2),
            chip({ b: 74, g: 82, r: 84 }, 0.08),
          ],
          dominantCoverage: 0.59,
          selectedChipIndex: 0,
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("shadowed-tan")).toEqual(expect.objectContaining({
      name: "Dark Bluish Gray",
      nameSource: "family-only",
    }))
    expect(result.colorsByPartId.get("olive-dark-gray")).toEqual(expect.objectContaining({
      name: "Dark Bluish Gray",
      nameSource: "family-only",
    }))
  })

  it("does not force tiny light-tan support to Dark Tan from Dark Brown", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-shadowed-tan",
        sample: sample({ b: 43, g: 66, r: 73 }, {
          chips: [
            chip({ b: 43, g: 66, r: 73 }, 0.27),
            chip({ b: 94, g: 113, r: 126 }, 0.14),
            chip({ b: 67, g: 87, r: 98 }, 0.14),
            chip({ b: 110, g: 134, r: 145 }, 0.14),
            chip({ b: 149, g: 175, r: 187 }, 0.11),
          ],
          dominantCoverage: 0.27,
          pixelCount: 44,
          selectedChipIndex: 0,
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    const detectedColor = result.colorsByPartId.get("tiny-shadowed-tan")

    expect(detectedColor?.name).not.toBe("Dark Tan")
    expect(detectedColor?.ruleResolverKind).not.toBe("dark-tan-body-evidence")
  })

  it("uses tan body evidence when bluish-gray edge pixels were selected", () => {
    const result = calibrateManualPartColors([
      {
        id: "edge-polluted-tan",
        sample: sample({ b: 75, g: 101, r: 114 }, {
          chips: [
            chip({ b: 75, g: 101, r: 114 }, 0.396),
            chip({ b: 113, g: 141, r: 153 }, 0.26),
            chip({ b: 98, g: 122, r: 136 }, 0.125),
            chip({ b: 64, g: 83, r: 96 }, 0.042),
            chip({ b: 82, g: 123, r: 131 }, 0.042),
            chip({ b: 24, g: 42, r: 49 }, 0.031),
          ],
          dominantCoverage: 0.396,
          pixelCount: 96,
          rejectedPixelCount: 196,
          rejectionCounts: {
            background: 50,
            border: 0,
            edge: 145,
            excludedRegion: 1,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-bluish-gray", "Dark Bluish Gray", { b: 75, g: 101, r: 114 }),
      ]),
    })

    expect(result.colorsByPartId.get("edge-polluted-tan")).toEqual(expect.objectContaining({
      name: "Tan",
      nameSource: "palette-match",
      ruleResolverKind: "tan-body-evidence",
    }))
  })

  it("uses tan body evidence when dark-brown edge pixels were selected", () => {
    const result = calibrateManualPartColors([
      {
        id: "dark-brown-selected-tan",
        sample: sample({ b: 42, g: 61, r: 68 }, {
          chips: [
            chip({ b: 42, g: 61, r: 68 }, 0.21),
            chip({ b: 100, g: 123, r: 132 }, 0.19),
            chip({ b: 20, g: 39, r: 50 }, 0.14),
            chip({ b: 67, g: 92, r: 107 }, 0.14),
            chip({ b: 51, g: 77, r: 91 }, 0.12),
            chip({ b: 152, g: 175, r: 184 }, 0.07),
            chip({ b: 82, g: 113, r: 127 }, 0.05),
            chip({ b: 190, g: 219, r: 228 }, 0.02),
            chip({ b: 116, g: 152, r: 170 }, 0.02),
          ],
          dominantCoverage: 0.21,
          pixelCount: 43,
          rejectedPixelCount: 83,
          rejectionCounts: {
            background: 23,
            border: 0,
            edge: 57,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-brown", "Dark Brown", { b: 42, g: 61, r: 68 }),
      ]),
    })

    expect(result.colorsByPartId.get("dark-brown-selected-tan")).toEqual(expect.objectContaining({
      name: "Tan",
      nameSource: "palette-match",
      ruleResolverKind: "tan-body-evidence",
    }))
  })

  it("keeps Dark Brown when dark-brown source tan evidence has too much saturated warm support", () => {
    const result = calibrateManualPartColors([
      {
        id: "dark-brown-with-saturated-warm-body",
        sample: sample({ b: 43, g: 66, r: 73 }, {
          chips: [
            chip({ b: 43, g: 66, r: 73 }, 0.27),
            chip({ b: 94, g: 113, r: 126 }, 0.14),
            chip({ b: 67, g: 87, r: 98 }, 0.14),
            chip({ b: 44, g: 110, r: 214 }, 0.12),
            chip({ b: 149, g: 175, r: 187 }, 0.11),
          ],
          dominantCoverage: 0.27,
          pixelCount: 44,
          rejectedPixelCount: 83,
          rejectionCounts: {
            background: 26,
            border: 0,
            edge: 56,
            excludedRegion: 1,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-brown", "Dark Brown", { b: 43, g: 66, r: 73 }),
      ]),
    })

    expect(result.colorsByPartId.get("dark-brown-with-saturated-warm-body")).toEqual(expect.objectContaining({
      name: "Dark Brown",
      nameSource: "prototype-match",
    }))
  })

  it("uses tan body evidence when tiny dark-tan edge pixels were selected", () => {
    const result = calibrateManualPartColors([
      {
        id: "dark-tan-selected-tan",
        sample: sample({ b: 76, g: 94, r: 102 }, {
          chips: [
            chip({ b: 76, g: 94, r: 102 }, 0.32),
            chip({ b: 120, g: 150, r: 170 }, 0.23),
            chip({ b: 160, g: 190, r: 210 }, 0.12),
            chip({ b: 54, g: 67, r: 74 }, 0.11),
            chip({ b: 92, g: 111, r: 118 }, 0.08),
          ],
          dominantCoverage: 0.32,
          pixelCount: 45,
          rejectedPixelCount: 150,
          rejectionCounts: {
            background: 38,
            border: 0,
            edge: 94,
            excludedRegion: 18,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-tan", "Dark Tan", { b: 76, g: 94, r: 102 }),
      ]),
    })

    expect(result.colorsByPartId.get("dark-tan-selected-tan")).toEqual(expect.objectContaining({
      name: "Tan",
      nameSource: "palette-match",
      ruleResolverKind: "tan-body-evidence",
    }))
  })

  it("keeps Dark Tan when dark-tan source tan evidence is not tiny", () => {
    const result = calibrateManualPartColors([
      {
        id: "larger-dark-tan-sample",
        sample: sample({ b: 76, g: 94, r: 102 }, {
          chips: [
            chip({ b: 76, g: 94, r: 102 }, 0.32),
            chip({ b: 120, g: 150, r: 170 }, 0.23),
            chip({ b: 160, g: 190, r: 210 }, 0.12),
            chip({ b: 54, g: 67, r: 74 }, 0.11),
            chip({ b: 92, g: 111, r: 118 }, 0.08),
          ],
          dominantCoverage: 0.32,
          pixelCount: 95,
          rejectedPixelCount: 150,
          rejectionCounts: {
            background: 38,
            border: 0,
            edge: 94,
            excludedRegion: 18,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-tan", "Dark Tan", { b: 76, g: 94, r: 102 }),
      ]),
    })

    expect(result.colorsByPartId.get("larger-dark-tan-sample")).toEqual(expect.objectContaining({
      name: "Dark Tan",
      nameSource: "prototype-match",
    }))
  })

  it("keeps Dark Bluish Gray when tan body evidence lacks edge rejection", () => {
    const result = calibrateManualPartColors([
      {
        id: "low-edge-tan-like-neutral",
        sample: sample({ b: 75, g: 101, r: 114 }, {
          chips: [
            chip({ b: 75, g: 101, r: 114 }, 0.396),
            chip({ b: 113, g: 141, r: 153 }, 0.26),
            chip({ b: 98, g: 122, r: 136 }, 0.125),
            chip({ b: 64, g: 83, r: 96 }, 0.042),
            chip({ b: 82, g: 123, r: 131 }, 0.042),
            chip({ b: 24, g: 42, r: 49 }, 0.031),
          ],
          dominantCoverage: 0.396,
          pixelCount: 96,
          rejectedPixelCount: 196,
          rejectionCounts: {
            background: 50,
            border: 0,
            edge: 70,
            excludedRegion: 1,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-bluish-gray", "Dark Bluish Gray", { b: 75, g: 101, r: 114 }),
      ]),
    })

    expect(result.colorsByPartId.get("low-edge-tan-like-neutral")).toEqual(expect.objectContaining({
      name: "Dark Bluish Gray",
      nameSource: "prototype-match",
    }))
  })

  it("uses muted warm edge evidence to rescue Medium Nougat from Orange", () => {
    const result = calibrateManualPartColors([
      {
        id: "edge-heavy-medium-nougat",
        sample: sample({ b: 33, g: 110, r: 210 }, {
          chips: [
            chip({ b: 33, g: 110, r: 210 }, 0.55),
            chip({ b: 70, g: 110, r: 150 }, 0.18),
            chip({ b: 45, g: 85, r: 125 }, 0.1),
            chip({ b: 25, g: 35, r: 50 }, 0.05),
          ],
          dominantCoverage: 0.55,
          pixelCount: 300,
          rejectedPixelCount: 420,
          rejectionCounts: {
            background: 20,
            border: 0,
            edge: 400,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-orange", "Orange", { b: 33, g: 110, r: 210 }),
      ]),
    })

    expect(result.colorsByPartId.get("edge-heavy-medium-nougat")).toEqual(expect.objectContaining({
      name: "Medium Nougat",
      nameSource: "palette-match",
      ruleCandidateScores: expect.arrayContaining([
        expect.objectContaining({ name: "Muted warm body" }),
      ]),
      ruleResolverKind: "medium-nougat-edge-evidence",
    }))
  })

  it("keeps Orange when Medium Nougat edge evidence lacks edge rejection", () => {
    const result = calibrateManualPartColors([
      {
        id: "plain-orange",
        sample: sample({ b: 33, g: 110, r: 210 }, {
          chips: [
            chip({ b: 33, g: 110, r: 210 }, 0.55),
            chip({ b: 70, g: 110, r: 150 }, 0.18),
            chip({ b: 45, g: 85, r: 125 }, 0.1),
            chip({ b: 25, g: 35, r: 50 }, 0.05),
          ],
          dominantCoverage: 0.55,
          pixelCount: 300,
          rejectedPixelCount: 120,
          rejectionCounts: {
            background: 20,
            border: 0,
            edge: 100,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-orange", "Orange", { b: 33, g: 110, r: 210 }),
      ]),
    })

    expect(result.colorsByPartId.get("plain-orange")).toEqual(expect.objectContaining({
      name: "Orange",
      nameSource: "prototype-match",
    }))
  })

  it("uses Dark Orange edge evidence with moderate background to rescue Medium Nougat", () => {
    const result = calibrateManualPartColors([
      {
        id: "edge-medium-nougat-from-dark-orange",
        sample: sample({ b: 60, g: 108, r: 158 }, {
          chips: [
            chip({ b: 60, g: 108, r: 158 }, 0.121),
            chip({ b: 25, g: 51, r: 80 }, 0.106),
            chip({ b: 50, g: 97, r: 136 }, 0.106),
            chip({ b: 92, g: 118, r: 144 }, 0.091),
            chip({ b: 57, g: 81, r: 110 }, 0.091),
            chip({ b: 76, g: 132, r: 184 }, 0.061),
            chip({ b: 34, g: 67, r: 113 }, 0.061),
            chip({ b: 37, g: 78, r: 99 }, 0.045),
          ],
          dominantCoverage: 0.121,
          pixelCount: 66,
          rejectedPixelCount: 172,
          rejectionCounts: {
            background: 50,
            border: 0,
            edge: 120,
            excludedRegion: 2,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-orange", "Dark Orange", { b: 60, g: 108, r: 158 }),
      ]),
    })

    expect(result.colorsByPartId.get("edge-medium-nougat-from-dark-orange")).toEqual(expect.objectContaining({
      name: "Medium Nougat",
      nameSource: "palette-match",
      ruleResolverKind: "medium-nougat-edge-evidence",
    }))
  })

  it("uses Trans-Orange edge evidence to rescue Medium Nougat", () => {
    const result = calibrateManualPartColors([
      {
        id: "edge-medium-nougat-from-trans-orange",
        sample: sample({ b: 83, g: 144, r: 208 }, {
          chips: [
            chip({ b: 83, g: 144, r: 208 }, 0.49),
            chip({ b: 96, g: 166, r: 233 }, 0.19),
            chip({ b: 44, g: 93, r: 139 }, 0.11),
            chip({ b: 73, g: 120, r: 168 }, 0.05),
            chip({ b: 78, g: 109, r: 129 }, 0.03),
          ],
          dominantCoverage: 0.49,
          edgeChips: [
            chip({ b: 83, g: 144, r: 208 }, 0.4),
            chip({ b: 96, g: 166, r: 233 }, 0.28),
            chip({ b: 44, g: 93, r: 139 }, 0.15),
            chip({ b: 21, g: 26, r: 32 }, 0.17),
          ],
          pixelCount: 207,
          rejectedPixelCount: 333,
          rejectionCounts: {
            background: 85,
            border: 0,
            edge: 248,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-trans-orange", "Trans-Orange", { b: 83, g: 144, r: 208 }),
      ]),
    })

    expect(result.colorsByPartId.get("edge-medium-nougat-from-trans-orange")).toEqual(expect.objectContaining({
      name: "Medium Nougat",
      nameSource: "palette-match",
      ruleCandidateScores: expect.arrayContaining([
        expect.objectContaining({ name: "Orange edge" }),
      ]),
      ruleResolverKind: "medium-nougat-edge-evidence",
    }))
  })

  it("keeps Trans-Orange when orange-edge evidence is weak", () => {
    const result = calibrateManualPartColors([
      {
        id: "true-trans-orange-with-dark-edges",
        sample: sample({ b: 47, g: 95, r: 127 }, {
          chips: [
            chip({ b: 47, g: 95, r: 127 }, 0.19),
            chip({ b: 24, g: 65, r: 96 }, 0.18),
            chip({ b: 21, g: 44, r: 73 }, 0.1),
            chip({ b: 46, g: 60, r: 95 }, 0.07),
            chip({ b: 60, g: 119, r: 163 }, 0.05),
          ],
          dominantCoverage: 0.19,
          edgeChips: [
            chip({ b: 47, g: 95, r: 127 }, 0.19),
            chip({ b: 24, g: 65, r: 96 }, 0.18),
            chip({ b: 21, g: 44, r: 73 }, 0.1),
            chip({ b: 46, g: 60, r: 95 }, 0.07),
            chip({ b: 60, g: 119, r: 163 }, 0.05),
            chip({ b: 18, g: 22, r: 28 }, 0.41),
          ],
          pixelCount: 164,
          rejectedPixelCount: 274,
          rejectionCounts: {
            background: 55,
            border: 0,
            edge: 219,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-trans-orange", "Trans-Orange", { b: 47, g: 95, r: 127 }),
      ]),
    })

    expect(result.colorsByPartId.get("true-trans-orange-with-dark-edges")).toEqual(expect.objectContaining({
      name: "Trans-Orange",
      nameSource: "prototype-match",
    }))
  })

  it("uses transparent orange evidence when tiny Medium Nougat rows have weak orange-edge support", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-trans-orange-selected-as-medium-nougat",
        sample: sample({ b: 24, g: 53, r: 84 }, {
          chips: [
            chip({ b: 24, g: 53, r: 84 }, 0.2),
            chip({ b: 55, g: 95, r: 120 }, 0.13),
            chip({ b: 15, g: 24, r: 43 }, 0.1),
            chip({ b: 90, g: 153, r: 197 }, 0.07),
            chip({ b: 62, g: 82, r: 111 }, 0.06),
            chip({ b: 38, g: 64, r: 92 }, 0.05),
          ],
          dominantCoverage: 0.2,
          edgeChips: [
            chip({ b: 58, g: 94, r: 128 }, 0.22),
            chip({ b: 108, g: 112, r: 118 }, 0.26),
            chip({ b: 65, g: 70, r: 76 }, 0.22),
            chip({ b: 34, g: 38, r: 42 }, 0.3),
          ],
          pixelCount: 30,
          rejectedPixelCount: 106,
          rejectionCounts: {
            background: 30,
            border: 0,
            edge: 71,
            excludedRegion: 5,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-medium-nougat", "Medium Nougat", { b: 24, g: 53, r: 84 }),
      ]),
    })

    expect(result.colorsByPartId.get("tiny-trans-orange-selected-as-medium-nougat")).toEqual(expect.objectContaining({
      name: "Trans-Orange",
      nameSource: "palette-match",
      ruleCandidateScores: expect.arrayContaining([
        expect.objectContaining({ name: "Orange body" }),
      ]),
      ruleResolverKind: "transparent-orange-evidence",
    }))
  })

  it("keeps Medium Nougat when tiny orange rows have strong orange-edge support", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-medium-nougat-with-orange-edge-support",
        sample: sample({ b: 103, g: 181, r: 252 }, {
          chips: [
            chip({ b: 103, g: 181, r: 252 }, 0.72),
            chip({ b: 92, g: 182, r: 250 }, 0.13),
            chip({ b: 88, g: 172, r: 225 }, 0.05),
            chip({ b: 57, g: 106, r: 128 }, 0.03),
          ],
          dominantCoverage: 0.72,
          edgeChips: [
            chip({ b: 103, g: 181, r: 252 }, 0.42),
            chip({ b: 92, g: 182, r: 250 }, 0.27),
            chip({ b: 80, g: 135, r: 170 }, 0.12),
            chip({ b: 44, g: 52, r: 58 }, 0.19),
          ],
          pixelCount: 61,
          rejectedPixelCount: 220,
          rejectionCounts: {
            background: 61,
            border: 0,
            edge: 139,
            excludedRegion: 20,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-medium-nougat", "Medium Nougat", { b: 103, g: 181, r: 252 }),
      ]),
    })

    expect(result.colorsByPartId.get("tiny-medium-nougat-with-orange-edge-support")).toEqual(expect.objectContaining({
      name: "Medium Nougat",
      nameSource: "prototype-match",
    }))
  })

  it("keeps Orange when moderate-background Medium Nougat evidence is not sourced from Dark Orange", () => {
    const result = calibrateManualPartColors([
      {
        id: "edge-orange",
        sample: sample({ b: 60, g: 108, r: 158 }, {
          chips: [
            chip({ b: 60, g: 108, r: 158 }, 0.121),
            chip({ b: 25, g: 51, r: 80 }, 0.106),
            chip({ b: 50, g: 97, r: 136 }, 0.106),
            chip({ b: 92, g: 118, r: 144 }, 0.091),
            chip({ b: 57, g: 81, r: 110 }, 0.091),
            chip({ b: 76, g: 132, r: 184 }, 0.061),
            chip({ b: 34, g: 67, r: 113 }, 0.061),
            chip({ b: 37, g: 78, r: 99 }, 0.045),
          ],
          dominantCoverage: 0.121,
          pixelCount: 66,
          rejectedPixelCount: 172,
          rejectionCounts: {
            background: 50,
            border: 0,
            edge: 120,
            excludedRegion: 2,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-orange", "Orange", { b: 60, g: 108, r: 158 }),
      ]),
    })

    expect(result.colorsByPartId.get("edge-orange")).toEqual(expect.objectContaining({
      name: "Orange",
      nameSource: "prototype-match",
    }))
  })

  it("keeps Dark Orange when the dominant chip is strong", () => {
    const result = calibrateManualPartColors([
      {
        id: "true-dark-orange",
        sample: sample({ b: 5, g: 80, r: 172 }, {
          chips: [
            chip({ b: 5, g: 80, r: 172 }, 0.645),
            chip({ b: 15, g: 64, r: 124 }, 0.186),
            chip({ b: 9, g: 42, r: 87 }, 0.071),
            chip({ b: 18, g: 28, r: 38 }, 0.022),
          ],
          dominantCoverage: 0.645,
          pixelCount: 183,
          rejectedPixelCount: 302,
          rejectionCounts: {
            background: 65,
            border: 0,
            edge: 236,
            excludedRegion: 1,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-orange", "Dark Orange", { b: 5, g: 80, r: 172 }),
      ]),
    })

    expect(result.colorsByPartId.get("true-dark-orange")).toEqual(expect.objectContaining({
      name: "Dark Orange",
      nameSource: "prototype-match",
    }))
  })

  it("uses dark green body evidence when shadowed Dark Green resolves as Green", () => {
    const result = calibrateManualPartColors([
      {
        id: "shadowed-dark-green",
        sample: sample({ b: 40, g: 54, r: 20 }, {
          chips: [
            chip({ b: 40, g: 54, r: 20 }, 0.82),
            chip({ b: 60, g: 78, r: 35 }, 0.12),
            chip({ b: 31, g: 38, r: 22 }, 0.06),
          ],
          dominantCoverage: 0.82,
          edgeChips: [
            chip({ b: 38, g: 51, r: 20 }, 0.61),
            chip({ b: 55, g: 77, r: 28 }, 0.13),
            chip({ b: 34, g: 38, r: 21 }, 0.13),
          ],
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-green", "Green", { b: 40, g: 54, r: 20 }),
      ]),
    })

    expect(result.colorsByPartId.get("shadowed-dark-green")).toEqual(expect.objectContaining({
      name: "Dark Green",
      nameSource: "palette-match",
      ruleCandidateScores: expect.arrayContaining([
        expect.objectContaining({ name: "Dark green body" }),
      ]),
      ruleResolverKind: "dark-green-body-evidence",
    }))
  })

  it("keeps Green when dark green evidence has bright body support", () => {
    const result = calibrateManualPartColors([
      {
        id: "true-green-with-dark-shadow",
        sample: sample({ b: 35, g: 70, r: 24 }, {
          chips: [
            chip({ b: 35, g: 70, r: 24 }, 0.69),
            chip({ b: 50, g: 112, r: 34 }, 0.18),
            chip({ b: 24, g: 42, r: 18 }, 0.13),
          ],
          dominantCoverage: 0.69,
          edgeChips: [
            chip({ b: 34, g: 61, r: 21 }, 0.42),
            chip({ b: 49, g: 95, r: 32 }, 0.2),
          ],
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-green", "Green", { b: 35, g: 70, r: 24 }),
      ]),
    })

    expect(result.colorsByPartId.get("true-green-with-dark-shadow")).toEqual(expect.objectContaining({
      name: "Green",
      nameSource: "prototype-match",
    }))
  })

  it("uses light neutral edge evidence when Dark Bluish Gray is edge-shadowed Light Bluish Gray", () => {
    const result = calibrateManualPartColors([
      {
        id: "edge-shadowed-light-bluish-gray",
        sample: sample({ b: 90, g: 87, r: 83 }, {
          chips: [
            chip({ b: 90, g: 87, r: 83 }, 0.39),
            chip({ b: 120, g: 117, r: 113 }, 0.3),
            chip({ b: 144, g: 141, r: 137 }, 0.15),
            chip({ b: 60, g: 57, r: 53 }, 0.13),
            chip({ b: 175, g: 172, r: 168 }, 0.03),
          ],
          dominantCoverage: 0.39,
          edgeChips: [
            chip({ b: 145, g: 139, r: 132 }, 0.38),
            chip({ b: 172, g: 166, r: 159 }, 0.22),
            chip({ b: 90, g: 86, r: 80 }, 0.16),
            chip({ b: 121, g: 116, r: 109 }, 0.15),
          ],
          rejectionCounts: {
            background: 0,
            border: 0,
            edge: 95,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          pixelCount: 46,
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("edge-shadowed-light-bluish-gray")).toEqual(expect.objectContaining({
      name: "Light Bluish Gray",
      nameSource: "palette-match",
      observedHex: "#53575a",
      ruleResolverKind: "light-neutral-edge-evidence",
    }))
  })

  it("keeps dark neutral body support from flipping to Light Bluish Gray", () => {
    const result = calibrateManualPartColors([
      {
        id: "dark-bluish-gray-with-light-edge",
        sample: sample({ b: 90, g: 87, r: 83 }, {
          chips: [
            chip({ b: 70, g: 67, r: 64 }, 0.34),
            chip({ b: 90, g: 87, r: 83 }, 0.26),
            chip({ b: 120, g: 117, r: 113 }, 0.19),
            chip({ b: 166, g: 162, r: 158 }, 0.11),
            chip({ b: 35, g: 32, r: 29 }, 0.1),
          ],
          dominantCoverage: 0.34,
          edgeChips: [
            chip({ b: 166, g: 162, r: 158 }, 0.38),
            chip({ b: 145, g: 139, r: 132 }, 0.25),
            chip({ b: 90, g: 86, r: 80 }, 0.2),
          ],
          rejectionCounts: {
            background: 0,
            border: 0,
            edge: 120,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("dark-bluish-gray-with-light-edge")).toEqual(expect.objectContaining({
      name: "Dark Bluish Gray",
      nameSource: "family-only",
    }))
  })

  it("uses full tiny-sample chip evidence for edge-shadowed Light Bluish Gray", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-shadowed-light-bluish-gray",
        sample: sample({ b: 90, g: 88, r: 86 }, {
          chips: [
            chip({ b: 90, g: 88, r: 86 }, 0.36),
            chip({ b: 113, g: 111, r: 109 }, 0.2),
            chip({ b: 72, g: 70, r: 68 }, 0.16),
            chip({ b: 143, g: 141, r: 139 }, 0.15),
            chip({ b: 54, g: 52, r: 50 }, 0.08),
            chip({ b: 166, g: 164, r: 162 }, 0.05),
          ],
          dominantCoverage: 0.36,
          edgeChips: [
            chip({ b: 164, g: 158, r: 152 }, 0.38),
            chip({ b: 142, g: 135, r: 127 }, 0.22),
            chip({ b: 119, g: 112, r: 103 }, 0.18),
          ],
          pixelCount: 46,
          rejectionCounts: {
            background: 20,
            border: 0,
            edge: 94,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("tiny-shadowed-light-bluish-gray")).toEqual(expect.objectContaining({
      name: "Light Bluish Gray",
      ruleResolverKind: "light-neutral-edge-evidence",
    }))
  })

  it("uses bounded tiny light-edge evidence just below the regular thresholds", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-light-bluish-gray-below-regular-edge-threshold",
        sample: sample({ b: 108, g: 105, r: 103 }, {
          chips: [
            chip({ b: 108, g: 105, r: 103 }, 0.47),
            chip({ b: 84, g: 81, r: 79 }, 0.19),
            chip({ b: 61, g: 58, r: 54 }, 0.11),
            chip({ b: 132, g: 129, r: 125 }, 0.11),
            chip({ b: 164, g: 163, r: 160 }, 0.06),
            chip({ b: 143, g: 142, r: 139 }, 0.06),
          ],
          dominantCoverage: 0.47,
          edgeChips: [
            chip({ b: 160, g: 155, r: 150 }, 0.39),
            chip({ b: 126, g: 121, r: 116 }, 0.22),
            chip({ b: 92, g: 88, r: 83 }, 0.13),
            chip({ b: 166, g: 165, r: 162 }, 0.09),
          ],
          pixelCount: 47,
          rejectionCounts: {
            background: 20,
            border: 0,
            edge: 58,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("tiny-light-bluish-gray-below-regular-edge-threshold")).toEqual(expect.objectContaining({
      name: "Light Bluish Gray",
      ruleResolverKind: "light-neutral-edge-evidence",
    }))
  })

  it("uses edge-heavy light neutral evidence above the tiny sample limit", () => {
    const result = calibrateManualPartColors([
      {
        id: "edge-heavy-light-bluish-gray",
        sample: sample({ b: 95, g: 92, r: 87 }, {
          chips: [
            chip({ b: 95, g: 92, r: 87 }, 0.32),
            chip({ b: 164, g: 161, r: 157 }, 0.16),
            chip({ b: 65, g: 63, r: 63 }, 0.14),
            chip({ b: 38, g: 37, r: 37 }, 0.11),
            chip({ b: 139, g: 136, r: 130 }, 0.14),
          ],
          dominantCoverage: 0.32,
          edgeChips: [
            chip({ b: 164, g: 161, r: 157 }, 0.49),
            chip({ b: 116, g: 112, r: 108 }, 0.16),
            chip({ b: 72, g: 68, r: 63 }, 0.14),
          ],
          pixelCount: 87,
          rejectionCounts: {
            background: 30,
            border: 0,
            edge: 126,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          rejectedPixelCount: 156,
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("edge-heavy-light-bluish-gray")).toEqual(expect.objectContaining({
      name: "Light Bluish Gray",
      ruleResolverKind: "light-neutral-edge-evidence",
    }))
  })

  it("uses cool edge-body evidence when Light Bluish Gray samples are selected as Dark Bluish Gray", () => {
    const result = calibrateManualPartColors([
      {
        id: "cool-edge-body-light-bluish-gray",
        sample: sample({ b: 117, g: 115, r: 111 }, {
          chips: [
            chip({ b: 117, g: 115, r: 111 }, 0.3),
            chip({ b: 62, g: 60, r: 56 }, 0.3),
            chip({ b: 87, g: 86, r: 81 }, 0.19),
            chip({ b: 142, g: 139, r: 136 }, 0.09),
            chip({ b: 33, g: 30, r: 27 }, 0.09),
            chip({ b: 164, g: 161, r: 157 }, 0.03),
          ],
          dominantCoverage: 0.3,
          edgeChips: [
            chip({ b: 164, g: 161, r: 157 }, 0.31),
            chip({ b: 117, g: 115, r: 111 }, 0.25),
            chip({ b: 62, g: 60, r: 56 }, 0.18),
          ],
          pixelCount: 64,
          rejectedPixelCount: 100,
          rejectionCounts: {
            background: 18,
            border: 0,
            edge: 82,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-bluish-gray", "Dark Bluish Gray", { b: 117, g: 115, r: 111 }),
      ]),
    })

    expect(result.colorsByPartId.get("cool-edge-body-light-bluish-gray")).toEqual(expect.objectContaining({
      name: "Light Bluish Gray",
      nameSource: "palette-match",
      ruleResolverKind: "light-neutral-edge-evidence",
    }))
  })

  it("uses high-edge top-chip evidence for tiny Light Bluish Gray", () => {
    const result = calibrateManualPartColors([
      {
        id: "high-edge-top-chip-light-bluish-gray",
        sample: sample({ b: 51, g: 49, r: 49 }, {
          chips: [
            chip({ b: 51, g: 49, r: 49 }, 0.354),
            chip({ b: 89, g: 87, r: 86 }, 0.323),
            chip({ b: 170, g: 167, r: 165 }, 0.123),
            chip({ b: 133, g: 131, r: 129 }, 0.077),
            chip({ b: 68, g: 67, r: 70 }, 0.046),
            chip({ b: 101, g: 100, r: 96 }, 0.046),
            chip({ b: 27, g: 24, r: 26 }, 0.015),
          ],
          dominantCoverage: 0.354,
          pixelCount: 65,
          rejectedPixelCount: 231,
          rejectionCounts: {
            background: 50,
            border: 0,
            edge: 181,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-bluish-gray", "Dark Bluish Gray", { b: 51, g: 49, r: 49 }),
      ]),
    })

    expect(result.colorsByPartId.get("high-edge-top-chip-light-bluish-gray")).toEqual(expect.objectContaining({
      name: "Light Bluish Gray",
      nameSource: "palette-match",
      ruleResolverKind: "light-neutral-edge-evidence",
    }))
  })

  it("keeps high-background neutral rows from using high-edge top-chip evidence", () => {
    const result = calibrateManualPartColors([
      {
        id: "high-background-top-chip-neutral",
        sample: sample({ b: 51, g: 49, r: 49 }, {
          chips: [
            chip({ b: 51, g: 49, r: 49 }, 0.354),
            chip({ b: 89, g: 87, r: 86 }, 0.323),
            chip({ b: 170, g: 167, r: 165 }, 0.123),
            chip({ b: 133, g: 131, r: 129 }, 0.077),
            chip({ b: 68, g: 67, r: 70 }, 0.046),
            chip({ b: 101, g: 100, r: 96 }, 0.046),
            chip({ b: 27, g: 24, r: 26 }, 0.015),
          ],
          dominantCoverage: 0.354,
          pixelCount: 65,
          rejectedPixelCount: 310,
          rejectionCounts: {
            background: 80,
            border: 0,
            edge: 220,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-bluish-gray", "Dark Bluish Gray", { b: 51, g: 49, r: 49 }),
      ]),
    })

    expect(result.colorsByPartId.get("high-background-top-chip-neutral")).toEqual(expect.objectContaining({
      name: "Dark Bluish Gray",
      nameSource: "prototype-match",
    }))
  })

  it("uses dark neutral body evidence when Light Bluish Gray prototypes are dark edges", () => {
    const result = calibrateManualPartColors([
      {
        id: "dark-neutral-body-selected-as-light-bluish-gray",
        sample: sample({ b: 69, g: 72, r: 73 }, {
          chips: [
            chip({ b: 69, g: 72, r: 73 }, 0.34),
            chip({ b: 32, g: 34, r: 35 }, 0.34),
            chip({ b: 98, g: 101, r: 102 }, 0.24),
            chip({ b: 55, g: 58, r: 58 }, 0.08),
          ],
          dominantCoverage: 0.34,
          edgeChips: [
            chip({ b: 51, g: 54, r: 55 }, 0.34),
            chip({ b: 72, g: 75, r: 75 }, 0.24),
            chip({ b: 104, g: 107, r: 108 }, 0.18),
          ],
          pixelCount: 79,
          rejectedPixelCount: 172,
          rejectionCounts: {
            background: 41,
            border: 0,
            edge: 131,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 69, g: 72, r: 73 }),
      ]),
    })

    expect(result.colorsByPartId.get("dark-neutral-body-selected-as-light-bluish-gray")).toEqual(
      expect.objectContaining({
        name: "Dark Bluish Gray",
        nameSource: "palette-match",
        ruleResolverKind: "dark-neutral-body-evidence",
      }),
    )
  })

  it("uses dark neutral body evidence when low-black body support is strong", () => {
    const result = calibrateManualPartColors([
      {
        id: "low-black-dark-neutral-body-selected-as-light-bluish-gray",
        sample: sample({ b: 58, g: 61, r: 60 }, {
          chips: [
            chip({ b: 58, g: 61, r: 60 }, 0.44),
            chip({ b: 99, g: 102, r: 102 }, 0.3),
            chip({ b: 33, g: 37, r: 35 }, 0.2),
            chip({ b: 79, g: 81, r: 81 }, 0.05),
            chip({ b: 21, g: 22, r: 13 }, 0.01),
          ],
          dominantCoverage: 0.44,
          edgeChips: [
            chip({ b: 58, g: 61, r: 60 }, 0.35),
            chip({ b: 33, g: 37, r: 35 }, 0.2),
            chip({ b: 99, g: 102, r: 102 }, 0.44),
          ],
          pixelCount: 105,
          rejectedPixelCount: 130,
          rejectionCounts: {
            background: 18,
            border: 0,
            edge: 112,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 58, g: 61, r: 60 }),
      ]),
    })

    expect(result.colorsByPartId.get("low-black-dark-neutral-body-selected-as-light-bluish-gray")).toEqual(
      expect.objectContaining({
        name: "Dark Bluish Gray",
        nameSource: "palette-match",
        ruleResolverKind: "dark-neutral-body-evidence",
      }),
    )
  })

  it("uses dark neutral edge evidence when Black fallback has mid-gray body support", () => {
    const result = calibrateManualPartColors([
      {
        id: "black-fallback-with-mid-neutral-body",
        sample: sample({ b: 32, g: 31, r: 30 }, {
          chips: [
            chip({ b: 89, g: 88, r: 85 }, 0.38),
            chip({ b: 114, g: 112, r: 110 }, 0.24),
            chip({ b: 58, g: 56, r: 54 }, 0.17),
            chip({ b: 36, g: 24, r: 16 }, 0.14),
            chip({ b: 136, g: 134, r: 132 }, 0.07),
          ],
          dominantCoverage: 0.38,
          pixelCount: 77,
          rejectedPixelCount: 101,
          rejectionCounts: {
            background: 24,
            border: 0,
            edge: 77,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("black-fallback-with-mid-neutral-body")).toEqual(
      expect.objectContaining({
        name: "Dark Bluish Gray",
        nameSource: "palette-match",
        ruleResolverKind: "dark-neutral-edge-evidence",
      }),
    )
  })

  it("keeps true Black when dark neutral edge evidence has near-black body support", () => {
    const result = calibrateManualPartColors([
      {
        id: "black-with-near-black-body",
        sample: sample({ b: 25, g: 24, r: 23 }, {
          chips: [
            chip({ b: 24, g: 23, r: 22 }, 0.42),
            chip({ b: 58, g: 56, r: 54 }, 0.28),
            chip({ b: 84, g: 82, r: 80 }, 0.25),
            chip({ b: 112, g: 110, r: 108 }, 0.05),
          ],
          dominantCoverage: 0.42,
          pixelCount: 82,
          rejectedPixelCount: 96,
          rejectionCounts: {
            background: 24,
            border: 0,
            edge: 72,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("black-with-near-black-body")).toEqual(expect.objectContaining({
      name: "Black",
      nameSource: "family-only",
    }))
  })

  it("keeps Black when dark neutral edge evidence has visible light support", () => {
    const result = calibrateManualPartColors([
      {
        id: "black-with-light-neutral-body",
        sample: sample({ b: 32, g: 31, r: 30 }, {
          chips: [
            chip({ b: 89, g: 88, r: 85 }, 0.38),
            chip({ b: 114, g: 112, r: 110 }, 0.24),
            chip({ b: 146, g: 144, r: 142 }, 0.16),
            chip({ b: 58, g: 56, r: 54 }, 0.08),
            chip({ b: 36, g: 24, r: 16 }, 0.14),
          ],
          dominantCoverage: 0.38,
          pixelCount: 88,
          rejectedPixelCount: 90,
          rejectionCounts: {
            background: 24,
            border: 0,
            edge: 66,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("black-with-light-neutral-body")).toEqual(expect.objectContaining({
      name: "Black",
      nameSource: "family-only",
    }))
  })

  it("keeps Light Bluish Gray when dark neutral body evidence has visible light support", () => {
    const result = calibrateManualPartColors([
      {
        id: "light-bluish-gray-with-dark-and-light-body",
        sample: sample({ b: 75, g: 78, r: 78 }, {
          chips: [
            chip({ b: 75, g: 78, r: 78 }, 0.3),
            chip({ b: 34, g: 36, r: 36 }, 0.28),
            chip({ b: 150, g: 153, r: 154 }, 0.12),
            chip({ b: 102, g: 106, r: 106 }, 0.3),
          ],
          dominantCoverage: 0.3,
          edgeChips: [
            chip({ b: 52, g: 55, r: 56 }, 0.36),
            chip({ b: 147, g: 150, r: 151 }, 0.2),
          ],
          pixelCount: 75,
          rejectedPixelCount: 165,
          rejectionCounts: {
            background: 38,
            border: 0,
            edge: 127,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 75, g: 78, r: 78 }),
      ]),
    })

    expect(result.colorsByPartId.get("light-bluish-gray-with-dark-and-light-body")).toEqual(
      expect.objectContaining({
        name: "Light Bluish Gray",
        nameSource: "prototype-match",
      }),
    )
  })

  it("keeps larger Dark Bluish Gray samples from using tiny light-neutral edge evidence", () => {
    const result = calibrateManualPartColors([
      {
        id: "large-dark-bluish-gray-with-light-edge",
        sample: sample({ b: 90, g: 88, r: 86 }, {
          chips: [
            chip({ b: 90, g: 88, r: 86 }, 0.36),
            chip({ b: 113, g: 111, r: 109 }, 0.2),
            chip({ b: 72, g: 70, r: 68 }, 0.16),
            chip({ b: 143, g: 141, r: 139 }, 0.15),
            chip({ b: 54, g: 52, r: 50 }, 0.08),
            chip({ b: 166, g: 164, r: 162 }, 0.05),
          ],
          dominantCoverage: 0.36,
          edgeChips: [
            chip({ b: 164, g: 158, r: 152 }, 0.38),
            chip({ b: 142, g: 135, r: 127 }, 0.22),
            chip({ b: 119, g: 112, r: 103 }, 0.18),
          ],
          pixelCount: 140,
          rejectionCounts: {
            background: 20,
            border: 0,
            edge: 94,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("large-dark-bluish-gray-with-light-edge")).toEqual(expect.objectContaining({
      name: "Dark Bluish Gray",
      nameSource: "family-only",
    }))
  })

  it("does not rescue cool neutral Light Bluish Gray as Flat Silver", () => {
    const result = calibrateManualPartColors([
      row("light-bluish-gray", { b: 169, g: 165, r: 160 }),
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 169, g: 165, r: 160 }),
      ]),
    })

    expect(result.colorsByPartId.get("light-bluish-gray")).toEqual(expect.objectContaining({
      name: "Light Bluish Gray",
      nameSource: "prototype-match",
      ruleResolverKind: "aggregate-prototype",
    }))
  })

  it("uses rejected bright background evidence to rescue White from Black", () => {
    const result = calibrateManualPartColors([
      {
        id: "white-selected-as-black",
        sample: sample({ b: 8, g: 8, r: 8 }, {
          dominantCoverage: 0.7,
          edgeChips: [
            chip({ b: 188, g: 189, r: 190 }, 0.1),
            chip({ b: 94, g: 94, r: 94 }, 0.1),
          ],
          pixelCount: 80,
          rejectedPixelCount: 120,
          rejectionCounts: {
            background: 80,
            border: 0,
            edge: 0,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("white-selected-as-black")).toEqual(expect.objectContaining({
      name: "White",
      nameSource: "palette-match",
      ruleResolverKind: "white-background-evidence",
    }))
  })

  it("uses rejected bright background evidence to rescue White from Dark Bluish Gray", () => {
    const result = calibrateManualPartColors([
      {
        id: "white-selected-as-dark-bluish-gray",
        sample: sample({ b: 101, g: 87, r: 69 }, {
          chips: [
            chip({ b: 72, g: 67, r: 62 }, 0.5),
            chip({ b: 101, g: 87, r: 69 }, 0.17),
            chip({ b: 45, g: 42, r: 39 }, 0.12),
          ],
          dominantCoverage: 0.5,
          edgeChips: [
            chip({ b: 186, g: 188, r: 190 }, 0.2),
          ],
          pixelCount: 90,
          rejectedPixelCount: 130,
          rejectionCounts: {
            background: 84,
            border: 0,
            edge: 0,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-bluish-gray", "Dark Bluish Gray", { b: 101, g: 87, r: 69 }),
      ]),
    })

    expect(result.colorsByPartId.get("white-selected-as-dark-bluish-gray")).toEqual(expect.objectContaining({
      name: "White",
      nameSource: "palette-match",
      ruleResolverKind: "white-background-evidence",
    }))
  })

  it("uses rejected background evidence to rescue White from Flat Silver prototypes", () => {
    const result = calibrateManualPartColors([
      {
        id: "white-selected-as-flat-silver",
        sample: sample({ b: 132, g: 133, r: 134 }, {
          pixelCount: 90,
          rejectedPixelCount: 120,
          rejectionCounts: {
            background: 70,
            border: 0,
            edge: 0,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-flat-silver", "Flat Silver", { b: 132, g: 133, r: 134 }),
      ]),
    })

    expect(result.colorsByPartId.get("white-selected-as-flat-silver")).toEqual(expect.objectContaining({
      name: "White",
      nameSource: "palette-match",
      ruleCandidateNames: expect.arrayContaining(["White", "Flat Silver"]),
      ruleResolverKind: "white-background-evidence",
    }))
  })

  it("uses edge-polluted background evidence to rescue White from Light Bluish Gray", () => {
    const result = calibrateManualPartColors([
      {
        id: "white-selected-as-light-bluish-gray",
        sample: sample({ b: 159, g: 149, r: 140 }, {
          chips: [
            chip({ b: 159, g: 149, r: 140 }, 0.2),
            chip({ b: 32, g: 31, r: 29 }, 0.26),
            chip({ b: 72, g: 71, r: 65 }, 0.18),
            chip({ b: 130, g: 130, r: 130 }, 0.14),
            chip({ b: 177, g: 178, r: 174 }, 0.12),
          ],
          dominantCoverage: 0.26,
          edgeChips: [
            chip({ b: 164, g: 159, r: 151 }, 0.24),
            chip({ b: 178, g: 174, r: 169 }, 0.15),
            chip({ b: 112, g: 111, r: 108 }, 0.14),
          ],
          pixelCount: 50,
          rejectedPixelCount: 285,
          rejectionCounts: {
            background: 151,
            border: 0,
            edge: 134,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("white-selected-as-light-bluish-gray")).toEqual(expect.objectContaining({
      name: "White",
      nameSource: "palette-match",
      ruleResolverKind: "white-background-evidence",
    }))
  })

  it("uses tiny background evidence to rescue White from Light Bluish Gray edges", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-white-selected-as-light-bluish-gray",
        sample: sample({ b: 160, g: 161, r: 161 }, {
          chips: [
            chip({ b: 160, g: 161, r: 161 }, 0.25),
            chip({ b: 98, g: 97, r: 98 }, 0.19),
            chip({ b: 59, g: 59, r: 60 }, 0.16),
            chip({ b: 119, g: 119, r: 119 }, 0.16),
            chip({ b: 33, g: 33, r: 34 }, 0.13),
          ],
          dominantCoverage: 0.25,
          edgeChips: [
            chip({ b: 172, g: 169, r: 166 }, 0.26),
            chip({ b: 80, g: 78, r: 74 }, 0.23),
            chip({ b: 144, g: 143, r: 140 }, 0.2),
          ],
          pixelCount: 32,
          rejectedPixelCount: 224,
          rejectionCounts: {
            background: 110,
            border: 0,
            edge: 109,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 160, g: 161, r: 161 }),
      ]),
    })

    expect(result.colorsByPartId.get("tiny-white-selected-as-light-bluish-gray")).toEqual(expect.objectContaining({
      name: "White",
      nameSource: "palette-match",
      ruleResolverKind: "white-background-evidence",
    }))
  })

  it("uses tiny low-dark light edge evidence to rescue White from Light Bluish Gray", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-low-dark-white-selected-as-light-bluish-gray",
        sample: sample({ b: 175, g: 172, r: 167 }, {
          chips: [
            chip({ b: 175, g: 172, r: 167 }, 0.44),
            chip({ b: 86, g: 85, r: 83 }, 0.28),
            chip({ b: 141, g: 138, r: 132 }, 0.22),
            chip({ b: 58, g: 55, r: 53 }, 0.06),
          ],
          dominantCoverage: 0.44,
          edgeChips: [
            chip({ b: 150, g: 149, r: 148 }, 0.36),
            chip({ b: 176, g: 174, r: 170 }, 0.12),
            chip({ b: 205, g: 199, r: 194 }, 0.05),
            chip({ b: 97, g: 96, r: 94 }, 0.16),
          ],
          pixelCount: 18,
          rejectedPixelCount: 157,
          rejectionCounts: {
            background: 93,
            border: 0,
            edge: 63,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 175, g: 172, r: 167 }),
      ]),
    })

    expect(result.colorsByPartId.get("tiny-low-dark-white-selected-as-light-bluish-gray")).toEqual(
      expect.objectContaining({
        name: "White",
        nameSource: "palette-match",
        ruleResolverKind: "white-background-evidence",
      }),
    )
  })

  it("keeps low-pixel Light Bluish Gray when tiny white evidence has too much dark body", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-light-bluish-gray-with-dark-body",
        sample: sample({ b: 175, g: 172, r: 167 }, {
          chips: [
            chip({ b: 175, g: 172, r: 167 }, 0.44),
            chip({ b: 86, g: 85, r: 83 }, 0.28),
            chip({ b: 58, g: 55, r: 53 }, 0.2),
            chip({ b: 141, g: 138, r: 132 }, 0.08),
          ],
          dominantCoverage: 0.44,
          edgeChips: [
            chip({ b: 150, g: 149, r: 148 }, 0.36),
            chip({ b: 176, g: 174, r: 170 }, 0.12),
            chip({ b: 205, g: 199, r: 194 }, 0.05),
          ],
          pixelCount: 18,
          rejectedPixelCount: 157,
          rejectionCounts: {
            background: 93,
            border: 0,
            edge: 63,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 175, g: 172, r: 167 }),
      ]),
    })

    expect(result.colorsByPartId.get("tiny-light-bluish-gray-with-dark-body")).toEqual(
      expect.objectContaining({
        name: "Light Bluish Gray",
        nameSource: "prototype-match",
      }),
    )
  })

  it("uses light edge evidence to rescue White when accepted pixels are gray edges", () => {
    const result = calibrateManualPartColors([
      {
        id: "white-body-rejected-with-light-edge-samples",
        sample: sample({ b: 176, g: 172, r: 167 }, {
          chips: [
            chip({ b: 176, g: 172, r: 167 }, 0.42),
            chip({ b: 99, g: 96, r: 92 }, 0.25),
            chip({ b: 77, g: 74, r: 70 }, 0.18),
            chip({ b: 135, g: 132, r: 128 }, 0.15),
          ],
          dominantCoverage: 0.42,
          edgeChips: [
            chip({ b: 154, g: 150, r: 146 }, 0.28),
            chip({ b: 166, g: 162, r: 158 }, 0.2),
            chip({ b: 134, g: 132, r: 130 }, 0.15),
            chip({ b: 84, g: 82, r: 80 }, 0.14),
          ],
          pixelCount: 20,
          rejectedPixelCount: 340,
          rejectionCounts: {
            background: 174,
            border: 0,
            edge: 145,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 176, g: 172, r: 167 }),
      ]),
    })

    expect(result.colorsByPartId.get("white-body-rejected-with-light-edge-samples")).toEqual(expect.objectContaining({
      name: "White",
      nameSource: "palette-match",
      ruleCandidateScores: expect.arrayContaining([
        expect.objectContaining({ name: "Light neutral edge" }),
      ]),
      ruleResolverKind: "white-background-evidence",
    }))
  })

  it("uses dark accepted body evidence to rescue White from Light Bluish Gray", () => {
    const result = calibrateManualPartColors([
      {
        id: "white-body-rejected-with-dark-accepted-samples",
        sample: sample({ b: 154, g: 153, r: 152 }, {
          chips: [
            chip({ b: 154, g: 153, r: 152 }, 0.22),
            chip({ b: 120, g: 120, r: 119 }, 0.19),
            chip({ b: 31, g: 31, r: 30 }, 0.16),
            chip({ b: 59, g: 59, r: 58 }, 0.15),
            chip({ b: 181, g: 181, r: 181 }, 0.1),
            chip({ b: 91, g: 90, r: 89 }, 0.08),
          ],
          dominantCoverage: 0.22,
          edgeChips: [
            chip({ b: 166, g: 164, r: 162 }, 0.28),
            chip({ b: 128, g: 126, r: 124 }, 0.24),
            chip({ b: 82, g: 80, r: 78 }, 0.18),
          ],
          pixelCount: 93,
          rejectedPixelCount: 534,
          rejectionCounts: {
            background: 278,
            border: 0,
            edge: 256,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 154, g: 153, r: 152 }),
      ]),
    })

    expect(result.colorsByPartId.get("white-body-rejected-with-dark-accepted-samples")).toEqual(expect.objectContaining({
      name: "White",
      nameSource: "palette-match",
      ruleCandidateScores: expect.arrayContaining([
        expect.objectContaining({ name: "Dark body" }),
      ]),
      ruleResolverKind: "white-background-evidence",
    }))
  })

  it("uses moderate background and dark edge evidence to rescue White from Light Bluish Gray", () => {
    const result = calibrateManualPartColors([
      {
        id: "moderate-background-white-selected-as-light-bluish-gray",
        sample: sample({ b: 110, g: 109, r: 106 }, {
          chips: [
            chip({ b: 56, g: 57, r: 56 }, 0.33),
            chip({ b: 110, g: 109, r: 106 }, 0.17),
            chip({ b: 85, g: 84, r: 82 }, 0.13),
            chip({ b: 24, g: 26, r: 24 }, 0.1),
            chip({ b: 135, g: 131, r: 127 }, 0.07),
            chip({ b: 178, g: 174, r: 171 }, 0.07),
          ],
          dominantCoverage: 0.33,
          edgeChips: [
            chip({ b: 51, g: 46, r: 36 }, 0.2),
            chip({ b: 93, g: 89, r: 77 }, 0.15),
            chip({ b: 154, g: 150, r: 139 }, 0.11),
            chip({ b: 107, g: 108, r: 111 }, 0.11),
            chip({ b: 179, g: 172, r: 159 }, 0.09),
            chip({ b: 125, g: 117, r: 107 }, 0.09),
          ],
          pixelCount: 30,
          rejectedPixelCount: 66,
          rejectionCounts: {
            background: 30,
            border: 0,
            edge: 36,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 110, g: 109, r: 106 }),
      ]),
    })

    expect(result.colorsByPartId.get("moderate-background-white-selected-as-light-bluish-gray")).toEqual(
      expect.objectContaining({
        name: "White",
        nameSource: "palette-match",
        ruleResolverKind: "white-background-evidence",
      }),
    )
  })

  it("uses small under-sampled background evidence to rescue White from Light Bluish Gray", () => {
    const result = calibrateManualPartColors([
      {
        id: "small-white-body-selected-as-light-bluish-gray",
        sample: sample({ b: 135, g: 135, r: 134 }, {
          chips: [
            chip({ b: 135, g: 135, r: 134 }, 0.33),
            chip({ b: 81, g: 80, r: 79 }, 0.26),
            chip({ b: 110, g: 110, r: 111 }, 0.23),
            chip({ b: 31, g: 30, r: 28 }, 0.08),
          ],
          dominantCoverage: 0.33,
          edgeChips: [
            chip({ b: 162, g: 163, r: 163 }, 0.24),
            chip({ b: 138, g: 139, r: 140 }, 0.14),
            chip({ b: 68, g: 68, r: 68 }, 0.1),
          ],
          pixelCount: 39,
          rejectedPixelCount: 85,
          rejectionCounts: {
            background: 33,
            border: 0,
            edge: 51,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 135, g: 135, r: 134 }),
      ]),
    })

    expect(result.colorsByPartId.get("small-white-body-selected-as-light-bluish-gray")).toEqual(
      expect.objectContaining({
        name: "White",
        nameSource: "palette-match",
        ruleResolverKind: "white-background-evidence",
      }),
    )
  })

  it("keeps moderate-background Light Bluish Gray when light edge coverage is high", () => {
    const result = calibrateManualPartColors([
      {
        id: "moderate-background-light-bluish-gray-control",
        sample: sample({ b: 71, g: 67, r: 65 }, {
          chips: [
            chip({ b: 28, g: 28, r: 30 }, 0.27),
            chip({ b: 71, g: 67, r: 65 }, 0.22),
            chip({ b: 103, g: 102, r: 103 }, 0.22),
            chip({ b: 128, g: 128, r: 127 }, 0.22),
          ],
          dominantCoverage: 0.43,
          edgeChips: [
            chip({ b: 88, g: 84, r: 76 }, 0.26),
            chip({ b: 142, g: 141, r: 137 }, 0.22),
            chip({ b: 110, g: 110, r: 109 }, 0.18),
            chip({ b: 69, g: 67, r: 65 }, 0.12),
            chip({ b: 175, g: 171, r: 165 }, 0.08),
          ],
          pixelCount: 37,
          rejectedPixelCount: 85,
          rejectionCounts: {
            background: 37,
            border: 0,
            edge: 45,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 71, g: 67, r: 65 }),
      ]),
    })

    expect(result.colorsByPartId.get("moderate-background-light-bluish-gray-control")).toEqual(
      expect.objectContaining({
        name: "Light Bluish Gray",
        nameSource: "prototype-match",
      }),
    )
  })

  it("keeps Light Bluish Gray when dark accepted body evidence is too large", () => {
    const result = calibrateManualPartColors([
      {
        id: "large-light-bluish-gray-with-dark-accepted-samples",
        sample: sample({ b: 154, g: 153, r: 152 }, {
          chips: [
            chip({ b: 154, g: 153, r: 152 }, 0.22),
            chip({ b: 120, g: 120, r: 119 }, 0.19),
            chip({ b: 31, g: 31, r: 30 }, 0.16),
            chip({ b: 59, g: 59, r: 58 }, 0.15),
            chip({ b: 181, g: 181, r: 181 }, 0.1),
            chip({ b: 91, g: 90, r: 89 }, 0.08),
          ],
          dominantCoverage: 0.22,
          edgeChips: [
            chip({ b: 166, g: 164, r: 162 }, 0.28),
            chip({ b: 128, g: 126, r: 124 }, 0.24),
            chip({ b: 82, g: 80, r: 78 }, 0.18),
          ],
          pixelCount: 180,
          rejectedPixelCount: 534,
          rejectionCounts: {
            background: 278,
            border: 0,
            edge: 256,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 154, g: 153, r: 152 }),
      ]),
    })

    expect(result.colorsByPartId.get("large-light-bluish-gray-with-dark-accepted-samples")).toEqual(expect.objectContaining({
      name: "Light Bluish Gray",
      nameSource: "prototype-match",
    }))
  })

  it("keeps Light Bluish Gray when background rejection lacks edge support", () => {
    const result = calibrateManualPartColors([
      {
        id: "light-bluish-gray-with-background-rejection",
        sample: sample({ b: 102, g: 98, r: 93 }, {
          chips: [
            chip({ b: 102, g: 98, r: 93 }, 0.22),
            chip({ b: 152, g: 148, r: 141 }, 0.22),
            chip({ b: 128, g: 124, r: 120 }, 0.22),
            chip({ b: 75, g: 72, r: 65 }, 0.2),
            chip({ b: 184, g: 180, r: 180 }, 0.09),
            chip({ b: 41, g: 37, r: 36 }, 0.07),
          ],
          dominantCoverage: 0.22,
          edgeChips: [
            chip({ b: 146, g: 141, r: 133 }, 0.25),
            chip({ b: 126, g: 120, r: 110 }, 0.24),
            chip({ b: 174, g: 168, r: 161 }, 0.22),
            chip({ b: 105, g: 98, r: 89 }, 0.12),
            chip({ b: 185, g: 184, r: 184 }, 0.09),
          ],
          pixelCount: 46,
          rejectedPixelCount: 305,
          rejectionCounts: {
            background: 200,
            border: 0,
            edge: 105,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 102, g: 98, r: 93 }),
      ]),
    })

    expect(result.colorsByPartId.get("light-bluish-gray-with-background-rejection")).toEqual(expect.objectContaining({
      name: "Light Bluish Gray",
      ruleResolverKind: "aggregate-prototype",
    }))
  })

  it("keeps near-black rows black when bright neutral edge evidence is absent", () => {
    const result = calibrateManualPartColors([
      {
        id: "black-with-blue-edge",
        sample: sample({ b: 8, g: 8, r: 8 }, {
          dominantCoverage: 0.72,
          edgeChips: [
            chip({ b: 178, g: 116, r: 70 }, 0.2),
          ],
          pixelCount: 80,
          rejectedPixelCount: 120,
          rejectionCounts: {
            background: 80,
            border: 0,
            edge: 0,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("black-with-blue-edge")).toEqual(expect.objectContaining({
      name: "Black",
      nameSource: "family-only",
    }))
  })

  it("uses dark edge evidence when black parts render as gray highlights", () => {
    const result = calibrateManualPartColors([
      {
        id: "black-selected-as-light-bluish-gray",
        sample: sample({ b: 104, g: 96, r: 93 }, {
          chips: [
            chip({ b: 104, g: 96, r: 93 }, 0.38),
            chip({ b: 76, g: 69, r: 65 }, 0.19),
            chip({ b: 130, g: 123, r: 121 }, 0.13),
            chip({ b: 168, g: 160, r: 156 }, 0.11),
          ],
          dominantCoverage: 0.38,
          edgeChips: [
            chip({ b: 24, g: 13, r: 9 }, 0.41),
            chip({ b: 53, g: 44, r: 38 }, 0.19),
            chip({ b: 111, g: 100, r: 89 }, 0.08),
            chip({ b: 177, g: 166, r: 152 }, 0.07),
          ],
          pixelCount: 47,
          rejectionCounts: {
            background: 23,
            border: 0,
            edge: 97,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 104, g: 96, r: 93 }),
      ]),
    })

    expect(result.colorsByPartId.get("black-selected-as-light-bluish-gray")).toEqual(expect.objectContaining({
      name: "Black",
      nameSource: "palette-match",
      ruleResolverKind: "black-edge-evidence",
    }))
  })

  it("uses accepted near-black evidence when black parts render as gray edge samples", () => {
    const result = calibrateManualPartColors([
      {
        id: "black-with-near-black-accepted-support",
        sample: sample({ b: 153, g: 150, r: 146 }, {
          chips: [
            chip({ b: 27, g: 24, r: 20 }, 0.43),
            chip({ b: 77, g: 73, r: 71 }, 0.13),
            chip({ b: 154, g: 150, r: 146 }, 0.2),
            chip({ b: 106, g: 102, r: 100 }, 0.1),
            chip({ b: 53, g: 50, r: 48 }, 0.1),
          ],
          dominantCoverage: 0.43,
          edgeChips: [
            chip({ b: 39, g: 35, r: 30 }, 0.24),
            chip({ b: 98, g: 91, r: 83 }, 0.22),
            chip({ b: 73, g: 68, r: 65 }, 0.17),
            chip({ b: 171, g: 165, r: 151 }, 0.16),
            chip({ b: 131, g: 125, r: 119 }, 0.12),
          ],
          pixelCount: 131,
          rejectedPixelCount: 169,
          rejectionCounts: {
            background: 26,
            border: 0,
            edge: 151,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 153, g: 150, r: 146 }),
      ]),
    })

    expect(result.colorsByPartId.get("black-with-near-black-accepted-support")).toEqual(expect.objectContaining({
      name: "Black",
      nameSource: "palette-match",
      ruleCandidateScores: expect.arrayContaining([
        expect.objectContaining({ name: "Accepted near-black" }),
      ]),
      ruleResolverKind: "black-edge-evidence",
    }))
  })

  it("uses tiny black edge evidence when black parts render as light neutral samples", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-black-selected-as-light-bluish-gray",
        sample: sample({ b: 106, g: 102, r: 101 }, {
          chips: [
            chip({ b: 106, g: 102, r: 101 }, 0.33),
            chip({ b: 137, g: 133, r: 130 }, 0.22),
            chip({ b: 172, g: 168, r: 165 }, 0.15),
            chip({ b: 37, g: 33, r: 29 }, 0.07),
          ],
          dominantCoverage: 0.33,
          edgeChips: [
            chip({ b: 70, g: 60, r: 55 }, 0.28),
            chip({ b: 37, g: 33, r: 29 }, 0.16),
            chip({ b: 170, g: 168, r: 165 }, 0.1),
          ],
          pixelCount: 27,
          rejectedPixelCount: 86,
          rejectionCounts: {
            background: 20,
            border: 0,
            edge: 66,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 106, g: 102, r: 101 }),
      ]),
    })

    expect(result.colorsByPartId.get("tiny-black-selected-as-light-bluish-gray")).toEqual(expect.objectContaining({
      name: "Black",
      nameSource: "palette-match",
      ruleResolverKind: "black-edge-evidence",
    }))
  })

  it("keeps tiny Light Bluish Gray when accepted near-black support is too low", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-light-bluish-gray-with-dark-edge",
        sample: sample({ b: 112, g: 106, r: 102 }, {
          chips: [
            chip({ b: 112, g: 106, r: 102 }, 0.32),
            chip({ b: 167, g: 164, r: 163 }, 0.26),
            chip({ b: 144, g: 138, r: 136 }, 0.19),
            chip({ b: 63, g: 59, r: 56 }, 0.1),
            chip({ b: 27, g: 24, r: 20 }, 0.03),
          ],
          dominantCoverage: 0.32,
          edgeChips: [
            chip({ b: 63, g: 59, r: 56 }, 0.36),
            chip({ b: 27, g: 24, r: 20 }, 0.2),
          ],
          pixelCount: 31,
          rejectedPixelCount: 102,
          rejectionCounts: {
            background: 17,
            border: 0,
            edge: 80,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray", "Light Bluish Gray", { b: 112, g: 106, r: 102 }),
      ]),
    })

    expect(result.colorsByPartId.get("tiny-light-bluish-gray-with-dark-edge")).toEqual(expect.objectContaining({
      name: "Light Bluish Gray",
      nameSource: "prototype-match",
    }))
  })

  it("keeps Dark Bluish Gray rows from using black edge evidence", () => {
    const result = calibrateManualPartColors([
      {
        id: "dark-bluish-gray-with-dark-edges",
        sample: sample({ b: 62, g: 66, r: 65 }, {
          chips: [
            chip({ b: 62, g: 66, r: 65 }, 0.37),
            chip({ b: 105, g: 109, r: 108 }, 0.32),
            chip({ b: 36, g: 39, r: 39 }, 0.23),
          ],
          dominantCoverage: 0.37,
          edgeChips: [
            chip({ b: 103, g: 107, r: 103 }, 0.26),
            chip({ b: 61, g: 65, r: 62 }, 0.26),
            chip({ b: 32, g: 35, r: 32 }, 0.18),
          ],
          pixelCount: 131,
          rejectionCounts: {
            background: 26,
            border: 0,
            edge: 222,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-bluish-gray", "Dark Bluish Gray", { b: 62, g: 66, r: 65 }),
      ]),
    })

    expect(result.colorsByPartId.get("dark-bluish-gray-with-dark-edges")).toEqual(expect.objectContaining({
      name: "Dark Bluish Gray",
      nameSource: "prototype-match",
    }))
  })

  it("uses pearl dark gray metal evidence for edge-heavy dark metal samples", () => {
    const result = calibrateManualPartColors([
      {
        id: "edge-heavy-pearl-dark-gray",
        sample: sample({ b: 61, g: 61, r: 62 }, {
          chips: [
            chip({ b: 61, g: 61, r: 62 }, 0.5),
            chip({ b: 36, g: 36, r: 37 }, 0.29),
            chip({ b: 85, g: 85, r: 84 }, 0.17),
            chip({ b: 44, g: 50, r: 59 }, 0.03),
          ],
          dominantCoverage: 0.5,
          pixelCount: 354,
          rejectedPixelCount: 646,
          rejectionCounts: {
            background: 180,
            border: 0,
            edge: 640,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-bluish-gray", "Dark Bluish Gray", { b: 61, g: 61, r: 62 }),
      ]),
    })

    expect(result.colorsByPartId.get("edge-heavy-pearl-dark-gray")).toEqual(expect.objectContaining({
      name: "Pearl Dark Gray",
      nameSource: "palette-match",
      ruleResolverKind: "pearl-dark-gray-metal-evidence",
    }))
  })

  it("keeps blue-tinted dark neutral samples from using pearl dark gray evidence", () => {
    const result = calibrateManualPartColors([
      {
        id: "blue-tinted-dark-bluish-gray",
        sample: sample({ b: 76, g: 68, r: 63 }, {
          chips: [
            chip({ b: 76, g: 68, r: 63 }, 0.48),
            chip({ b: 42, g: 39, r: 36 }, 0.28),
            chip({ b: 94, g: 86, r: 80 }, 0.16),
            chip({ b: 64, g: 57, r: 51 }, 0.08),
          ],
          dominantCoverage: 0.48,
          pixelCount: 354,
          rejectedPixelCount: 646,
          rejectionCounts: {
            background: 180,
            border: 0,
            edge: 640,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-dark-bluish-gray", "Dark Bluish Gray", { b: 76, g: 68, r: 63 }),
      ]),
    })

    expect(result.colorsByPartId.get("blue-tinted-dark-bluish-gray")).toEqual(expect.objectContaining({
      name: "Dark Bluish Gray",
      ruleResolverKind: "aggregate-prototype",
    }))
  })

  it("does not use broad high-background evidence for Light Bluish Gray", () => {
    const result = calibrateManualPartColors([
      {
        id: "light-bluish-gray-with-background",
        sample: sample({ b: 170, g: 166, r: 160 }, {
          edgeChips: [
            chip({ b: 188, g: 189, r: 190 }, 0.2),
          ],
          pixelCount: 90,
          rejectedPixelCount: 130,
          rejectionCounts: {
            background: 84,
            border: 0,
            edge: 0,
            excludedRegion: 0,
            lowAlpha: 0,
            outOfPage: 0,
          },
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("light-bluish-gray-with-background")).toEqual(expect.objectContaining({
      name: "Light Bluish Gray",
      nameSource: "family-only",
    }))
  })

  it("keeps fallback behavior when no prototype passes", () => {
    const result = calibrateManualPartColors([
      row("gray", { b: 165, g: 165, r: 165 }),
    ], {
      prototypes: prototypeSet([
        prototype("prototype-green", "Green", { b: 53, g: 110, r: 28 }),
      ]),
    })

    expect(result.colorsByPartId.get("gray")).toEqual(expect.objectContaining({
      manualClassTrusted: false,
      name: "Light Bluish Gray",
      nameSource: "family-only",
      status: "review",
    }))
  })

  it("uses neutral body chip support when near-black outline was selected", () => {
    const result = calibrateManualPartColors([
      {
        id: "tiny-gray",
        sample: sample({ b: 15, g: 15, r: 16 }, {
          chips: [
            chip({ b: 168, g: 165, r: 161 }, 0.3),
            chip({ b: 90, g: 87, r: 84 }, 0.2),
            chip({ b: 15, g: 15, r: 16 }, 0.18),
            chip({ b: 129, g: 126, r: 123 }, 0.16),
            chip({ b: 59, g: 58, r: 57 }, 0.12),
          ],
          dominantCoverage: 0.18,
          selectedChipIndex: 2,
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("tiny-gray")).toEqual(expect.objectContaining({
      name: "Light Bluish Gray",
      nameSource: "family-only",
      observedHex: "#a1a5a8",
    }))
  })

  it("uses dominant dark-neutral body support when near-black shadow was selected", () => {
    const result = calibrateManualPartColors([
      {
        id: "shadowed-dark-gray",
        sample: sample({ b: 16, g: 14, r: 13 }, {
          chips: [
            chip({ b: 89, g: 87, r: 84 }, 0.46),
            chip({ b: 16, g: 14, r: 13 }, 0.25),
            chip({ b: 60, g: 59, r: 56 }, 0.25),
            chip({ b: 40, g: 38, r: 37 }, 0.02),
          ],
          dominantCoverage: 0.46,
          selectedChipIndex: 1,
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-black", "Black", { b: 23, g: 15, r: 9 }),
        prototype("prototype-dark-bluish-gray", "Dark Bluish Gray", { b: 90, g: 88, r: 84 }),
      ]),
    })

    expect(result.colorsByPartId.get("shadowed-dark-gray")).toEqual(expect.objectContaining({
      name: "Dark Bluish Gray",
      nameSource: "prototype-match",
      observedHex: "#545759",
    }))
  })

  it("keeps blue-biased near-black body samples black", () => {
    const result = calibrateManualPartColors([
      {
        id: "black",
        sample: sample({ b: 24, g: 14, r: 7 }, {
          chips: [
            chip({ b: 24, g: 14, r: 7 }, 0.32),
            chip({ b: 168, g: 165, r: 161 }, 0.28),
            chip({ b: 90, g: 87, r: 84 }, 0.2),
            chip({ b: 49, g: 42, r: 33 }, 0.12),
          ],
          dominantCoverage: 0.32,
          selectedChipIndex: 0,
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("black")).toEqual(expect.objectContaining({
      name: "Black",
      nameSource: "family-only",
      observedHex: "#070e18",
    }))
  })

  it("keeps blue-biased black samples even with dark-neutral chip support", () => {
    const result = calibrateManualPartColors([
      {
        id: "black",
        sample: sample({ b: 29, g: 19, r: 10 }, {
          chips: [
            chip({ b: 100, g: 94, r: 87 }, 0.36),
            chip({ b: 29, g: 19, r: 10 }, 0.33),
            chip({ b: 133, g: 127, r: 122 }, 0.11),
          ],
          dominantCoverage: 0.36,
          selectedChipIndex: 1,
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-black", "Black", { b: 29, g: 19, r: 10 }),
        prototype("prototype-dark-bluish-gray", "Dark Bluish Gray", { b: 90, g: 88, r: 84 }),
      ]),
    })

    expect(result.colorsByPartId.get("black")).toEqual(expect.objectContaining({
      name: "Black",
      nameSource: "prototype-match",
      observedHex: "#0a131d",
    }))
  })

  it("uses green body evidence when a near-black sample was selected", () => {
    const result = calibrateManualPartColors([
      {
        id: "shadowed-green",
        sample: sample({ b: 6, g: 10, r: 6 }, {
          chips: [
            chip({ b: 45, g: 83, r: 43 }, 0.17),
            chip({ b: 23, g: 48, r: 24 }, 0.13),
            chip({ b: 6, g: 10, r: 6 }, 0.11),
            chip({ b: 65, g: 159, r: 69 }, 0.11),
            chip({ b: 3, g: 22, r: 7 }, 0.08),
          ],
          dominantCoverage: 0.17,
          selectedChipIndex: 2,
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("shadowed-green")).toEqual(expect.objectContaining({
      name: "Green",
      nameSource: "palette-match",
      observedHex: "#060a06",
      ruleResolverKind: "green-body-evidence",
    }))
  })

  it("keeps near-black samples black when green body evidence is weak", () => {
    const result = calibrateManualPartColors([
      {
        id: "black-with-green-highlight",
        sample: sample({ b: 8, g: 9, r: 8 }, {
          chips: [
            chip({ b: 8, g: 9, r: 8 }, 0.42),
            chip({ b: 35, g: 65, r: 34 }, 0.14),
            chip({ b: 22, g: 24, r: 23 }, 0.2),
          ],
          dominantCoverage: 0.42,
          selectedChipIndex: 0,
          status: "review",
        }),
      },
    ], { prototypes: prototypeSet([]) })

    expect(result.colorsByPartId.get("black-with-green-highlight")).toEqual(expect.objectContaining({
      name: "Black",
      nameSource: "family-only",
      observedHex: "#080908",
    }))
  })

  it("rejects shadowed bright-neutral prototypes without neutral body evidence", () => {
    const result = calibrateManualPartColors([
      {
        id: "black",
        sample: sample({ b: 32, g: 31, r: 31 }, {
          chips: [
            chip({ b: 32, g: 31, r: 31 }, 0.7),
            chip({ b: 48, g: 47, r: 46 }, 0.2),
          ],
          dominantCoverage: 0.7,
          selectedChipIndex: 0,
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray-shadow", "Light Bluish Gray", { b: 32, g: 31, r: 31 }),
        prototype("prototype-black", "Black", { b: 13, g: 12, r: 11 }),
      ]),
    })

    expect(result.colorsByPartId.get("black")).toEqual(expect.objectContaining({
      name: "Black",
      nameSource: "prototype-match",
    }))
  })

  it("allows shadowed bright-neutral prototypes with neutral body and edge evidence", () => {
    const result = calibrateManualPartColors([
      {
        id: "shadowed-light-gray",
        sample: sample({ b: 32, g: 31, r: 31 }, {
          chips: [
            chip({ b: 32, g: 31, r: 31 }, 0.48),
            chip({ b: 67, g: 66, r: 61 }, 0.24),
            chip({ b: 52, g: 50, r: 47 }, 0.11),
            chip({ b: 98, g: 96, r: 95 }, 0.08),
            chip({ b: 125, g: 124, r: 124 }, 0.03),
          ],
          dominantCoverage: 0.48,
          edgeChips: [
            chip({ b: 165, g: 158, r: 148 }, 0.2),
            chip({ b: 137, g: 134, r: 125 }, 0.17),
            chip({ b: 115, g: 112, r: 106 }, 0.16),
          ],
          selectedChipIndex: 0,
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-light-bluish-gray-shadow", "Light Bluish Gray", { b: 32, g: 31, r: 31 }),
        prototype("prototype-black", "Black", { b: 13, g: 12, r: 11 }),
      ]),
    })

    expect(result.colorsByPartId.get("shadowed-light-gray")).toEqual(expect.objectContaining({
      name: "Light Bluish Gray",
      nameSource: "prototype-match",
    }))
  })

  it("keeps near-black sample when warm chip support is weak", () => {
    const result = calibrateManualPartColors([
      {
        id: "black-with-warm-shadow",
        sample: sample({ b: 7, g: 7, r: 9 }, {
          chips: [
            chip({ b: 7, g: 7, r: 9 }, 0.4),
            chip({ b: 9, g: 31, r: 74 }, 0.22),
            chip({ b: 25, g: 24, r: 24 }, 0.2),
          ],
          dominantCoverage: 0.4,
          selectedChipIndex: 0,
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-black", "Black", { b: 23, g: 15, r: 9 }),
        prototype("prototype-reddish-brown", "Reddish Brown", { b: 9, g: 31, r: 74 }),
      ]),
    })

    expect(result.colorsByPartId.get("black-with-warm-shadow")).toEqual(expect.objectContaining({
      name: "Black",
      nameSource: "prototype-match",
      observedHex: "#090707",
    }))
  })

  it("rejects Trans-Light Blue prototypes for opaque blue body evidence", () => {
    const result = calibrateManualPartColors([
      {
        id: "opaque-bright-light-blue",
        sample: sample({ b: 171, g: 150, r: 117 }, {
          chips: [
            chip({ b: 171, g: 150, r: 117 }, 0.29),
            chip({ b: 101, g: 88, r: 60 }, 0.29),
            chip({ b: 140, g: 120, r: 84 }, 0.24),
            chip({ b: 62, g: 52, r: 28 }, 0.06),
            chip({ b: 113, g: 86, r: 59 }, 0.06),
          ],
          dominantCoverage: 0.29,
          pixelCount: 17,
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-trans-light-blue", "Trans-Light Blue", { b: 171, g: 150, r: 117 }),
      ]),
    })

    expect(result.colorsByPartId.get("opaque-bright-light-blue")).toEqual(expect.objectContaining({
      nameSource: "family-only",
      observedHex: "#7596ab",
    }))
  })

  it("allows Trans-Light Blue prototypes for glassy blue chip evidence", () => {
    const result = calibrateManualPartColors([
      {
        id: "glassy-trans-light-blue",
        sample: sample({ b: 173, g: 168, r: 139 }, {
          chips: [
            chip({ b: 91, g: 87, r: 63 }, 0.23),
            chip({ b: 209, g: 204, r: 177 }, 0.19),
            chip({ b: 141, g: 137, r: 112 }, 0.19),
            chip({ b: 173, g: 168, r: 139 }, 0.19),
            chip({ b: 118, g: 114, r: 86 }, 0.14),
          ],
          dominantCoverage: 0.23,
          pixelCount: 57,
          status: "review",
        }),
      },
    ], {
      prototypes: prototypeSet([
        prototype("prototype-trans-light-blue", "Trans-Light Blue", { b: 173, g: 168, r: 139 }),
      ]),
    })

    expect(result.colorsByPartId.get("glassy-trans-light-blue")).toEqual(expect.objectContaining({
      name: "Trans-Light Blue",
      nameSource: "prototype-match",
      observedHex: "#8ba8ad",
    }))
  })
})

function label(itemId: string, expectedName: string) {
  return {
    expectedName,
    itemId,
    role: "train" as const,
  }
}

function row(id: string, rgb: RgbColor) {
  return {
    id,
    sample: sample(rgb),
  }
}

function prototypeSet(prototypes: readonly ColorPrototype[]): PrototypeSet {
  return { prototypes: [...prototypes] }
}

function prototype(id: string, expectedName: string, rgb: RgbColor): ColorPrototype {
  const lch = rgbToLch(rgb)

  return {
    expectedName,
    family: routeColorFamily(lch),
    id,
    lab: rgbToLab(rgb),
    rgb,
    support: 3,
  }
}

function sample(rgb: RgbColor, overrides: Partial<PartColorSample> = {}): PartColorSample {
  const pixelCount = overrides.pixelCount ?? 400
  const dominantCoverage = overrides.dominantCoverage ?? 0.82
  const stability = overrides.stability ?? 0.9

  return {
    chips: [
      {
        coverage: dominantCoverage,
        hex: hex(rgb),
        pixelCount,
        rgb,
      },
    ],
    dominantCoverage,
    hex: hex(rgb),
    pixelCount,
    rejectedPixelCount: 0,
    rejectionCounts: {
      background: 0,
      border: 0,
      edge: 0,
      excludedRegion: 0,
      lowAlpha: 0,
      outOfPage: 0,
    },
    rgb,
    selectedChipIndex: 0,
    stability,
    status: overrides.status ?? "stable",
    variance: overrides.variance ?? 2,
    ...overrides,
  }
}

function chip(rgb: RgbColor, coverage: number) {
  return {
    coverage,
    hex: hex(rgb),
    pixelCount: Math.round(coverage * 1_000),
    rgb,
  }
}

function hex(rgb: RgbColor): string {
  return `#${[rgb.r, rgb.g, rgb.b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`
}
