import { describe, expect, it } from "vitest"
import {
  ALPHA_MASK_PASS_CRITERIA,
  UNTRUSTED_REVIEW_ALPHA_MASK_PASS_CRITERIA,
  compareAlphaMaskPixels,
  alphaMaskComparisonPasses,
  compareAlphaMasks,
  matchBagAnalysisStructure,
  partRowKey,
  regionsMutuallyWithinTolerance,
  type DecodedAlphaMask,
} from "./bag-analysis-comparison"

describe("bag-analysis comparator primitives", () => {
  it("fails a missing callout edge beyond the 2px tolerance", () => {
    expect(
      regionsMutuallyWithinTolerance(
        { x: 10, y: 10, width: 100, height: 80 },
        { x: 13, y: 10, width: 97, height: 80 },
        2,
      ),
    ).toBe(false)
  })

  it("fails neighboring-content crop growth beyond the 2px tolerance", () => {
    expect(
      regionsMutuallyWithinTolerance(
        { x: 10, y: 10, width: 100, height: 80 },
        { x: 6, y: 10, width: 104, height: 80 },
        2,
      ),
    ).toBe(false)
  })

  it("passes 2px callout drift", () => {
    expect(
      regionsMutuallyWithinTolerance(
        { x: 10, y: 10, width: 100, height: 80 },
        { x: 8, y: 12, width: 102, height: 78 },
        2,
      ),
    ).toBe(true)
  })

  it("detects wrong quantity multisets", () => {
    const match = matchBagAnalysisStructure({
      actualResult: {
        callouts: [
          {
            pageNumber: 1,
            crop: { region: { x: 10, y: 10, width: 50, height: 40 } },
            partItems: [
              actualPart("1x", 1, { x: 20, y: 20, width: 8, height: 8 }),
              actualPart("3x", 3, { x: 35, y: 20, width: 8, height: 8 }),
            ],
          },
        ],
      },
      expectedCallouts: {
        schemaVersion: 1,
        caseId: "test",
        callouts: [
          {
            ordinal: 0,
            pageNumber: 1,
            crop: { region: { x: 10, y: 10, width: 50, height: 40 } },
          },
        ],
      },
      expectedParts: {
        schemaVersion: 1,
        caseId: "test",
        callouts: [
          {
            ordinal: 0,
            pageNumber: 1,
            parts: [
              expectedPart(0, "1x", 1, { x: 20, y: 20, width: 8, height: 8 }),
              expectedPart(1, "2x", 2, { x: 35, y: 20, width: 8, height: 8 }),
            ],
          },
        ],
      },
    })

    expect(match.failures).toContain("callout 0: quantity multiset mismatch: expected 1x::1 x1, 2x::2 x1, got 1x::1 x1, 3x::3 x1")
  })

  it("detects color drift on matched part rows", () => {
    const match = matchBagAnalysisStructure({
      actualResult: {
        callouts: [
          {
            pageNumber: 1,
            crop: { region: { x: 10, y: 10, width: 50, height: 40 } },
            partItems: [
              actualPart("1x", 1, { x: 20, y: 20, width: 8, height: 8 }, {
                name: "Dark Bluish Gray",
                family: "gray",
                status: "review",
                swatchHex: "#676963",
                manualClassId: "manual-color-002",
                manualClassTrusted: false,
                rawManualClassId: "manual-color-002",
              }),
            ],
          },
        ],
      },
      expectedCallouts: {
        schemaVersion: 2,
        caseId: "test",
        callouts: [
          {
            ordinal: 0,
            pageNumber: 1,
            crop: { region: { x: 10, y: 10, width: 50, height: 40 } },
          },
        ],
      },
      expectedParts: {
        schemaVersion: 2,
        caseId: "test",
        callouts: [
          {
            ordinal: 0,
            pageNumber: 1,
            parts: [
              expectedPart(0, "1x", 1, { x: 20, y: 20, width: 8, height: 8 }),
            ],
          },
        ],
      },
    })

    expect(match.failures).toContain(
      "callout 0 row 0: color mismatch: expected Green/green/review/#165025/manual-color-001/untrusted/manual-color-001, got Dark Bluish Gray/gray/review/#676963/manual-color-002/untrusted/manual-color-002",
    )
  })

  it("ignores exact declared callout and part region drifts", () => {
    const match = matchBagAnalysisStructure({
      actualResult: {
        callouts: [
          {
            pageNumber: 1,
            crop: { region: { x: 7, y: 7, width: 35, height: 25 } },
            partItems: [
              actualPart("1x", 1, { x: 18, y: 20, width: 12, height: 8 }),
            ],
          },
        ],
      },
      expectedCallouts: {
        schemaVersion: 2,
        caseId: "test",
        callouts: [
          {
            ordinal: 4,
            pageNumber: 1,
            crop: { region: { x: 0, y: 0, width: 50, height: 40 } },
          },
        ],
      },
      expectedParts: {
        schemaVersion: 2,
        caseId: "test",
        callouts: [
          {
            ordinal: 4,
            pageNumber: 1,
            parts: [
              expectedPart(2, "1x", 1, { x: 20, y: 20, width: 8, height: 8 }),
            ],
          },
        ],
      },
      knownRegionDrifts: {
        calloutOrdinals: new Set([4]),
        partRows: new Set([partRowKey(4, 2)]),
      },
    })

    expect(match.failures).toEqual([])
    expect(match.calloutPairs).toHaveLength(1)
    expect(match.partPairs).toHaveLength(1)
  })

  it("tolerates untrusted manual color class renumbering", () => {
    const match = matchBagAnalysisStructure({
      actualResult: {
        callouts: [
          {
            pageNumber: 1,
            crop: { region: { x: 10, y: 10, width: 50, height: 40 } },
            partItems: [
              actualPart("1x", 1, { x: 20, y: 20, width: 8, height: 8 }, {
                name: "Green",
                family: "green",
                status: "review",
                swatchHex: "#165025",
                manualClassId: "manual-color-014",
                manualClassTrusted: false,
                rawManualClassId: "manual-color-014",
              }),
            ],
          },
        ],
      },
      expectedCallouts: {
        schemaVersion: 2,
        caseId: "test",
        callouts: [
          {
            ordinal: 0,
            pageNumber: 1,
            crop: { region: { x: 10, y: 10, width: 50, height: 40 } },
          },
        ],
      },
      expectedParts: {
        schemaVersion: 2,
        caseId: "test",
        callouts: [
          {
            ordinal: 0,
            pageNumber: 1,
            parts: [
              expectedPart(0, "1x", 1, { x: 20, y: 20, width: 8, height: 8 }),
            ],
          },
        ],
      },
    })

    expect(match.failures).toEqual([])
  })

  it("tolerates untrusted review color drift when the CI drift gate is enabled", () => {
    const previous = process.env.BAG_IT_E2E_ALLOW_UNTRUSTED_COLOR_DRIFT
    process.env.BAG_IT_E2E_ALLOW_UNTRUSTED_COLOR_DRIFT = "1"

    try {
      const match = matchBagAnalysisStructure({
        actualResult: {
          callouts: [
            {
              pageNumber: 1,
              crop: { region: { x: 10, y: 10, width: 50, height: 40 } },
              partItems: [
                actualPart("1x", 1, { x: 20, y: 20, width: 8, height: 8 }, {
                  name: "Trans-Orange",
                  family: "orange",
                  status: "review",
                  swatchHex: "#4c3318",
                  manualClassId: "manual-color-014",
                  manualClassTrusted: false,
                  rawManualClassId: "manual-color-014",
                }),
              ],
            },
          ],
        },
        expectedCallouts: {
          schemaVersion: 2,
          caseId: "test",
          callouts: [
            {
              ordinal: 0,
              pageNumber: 1,
              crop: { region: { x: 10, y: 10, width: 50, height: 40 } },
            },
          ],
        },
        expectedParts: {
          schemaVersion: 2,
          caseId: "test",
          callouts: [
            {
              ordinal: 0,
              pageNumber: 1,
              parts: [
                expectedPart(0, "1x", 1, { x: 20, y: 20, width: 8, height: 8 }),
              ],
            },
          ],
        },
      })

      expect(match.failures).toEqual([])
    } finally {
      restoreColorDriftGate(previous)
    }
  })

  it("tolerates one-channel swatch drift when semantic color identity is unchanged", () => {
    const match = matchBagAnalysisStructure({
      actualResult: {
        callouts: [
          {
            pageNumber: 1,
            crop: { region: { x: 10, y: 10, width: 50, height: 40 } },
            partItems: [
              actualPart("1x", 1, { x: 20, y: 20, width: 8, height: 8 }, {
                name: "Green",
                family: "green",
                status: "review",
                swatchHex: "#165026",
                manualClassId: "manual-color-001",
                manualClassTrusted: false,
                rawManualClassId: "manual-color-001",
              }),
            ],
          },
        ],
      },
      expectedCallouts: {
        schemaVersion: 2,
        caseId: "test",
        callouts: [
          {
            ordinal: 0,
            pageNumber: 1,
            crop: { region: { x: 10, y: 10, width: 50, height: 40 } },
          },
        ],
      },
      expectedParts: {
        schemaVersion: 2,
        caseId: "test",
        callouts: [
          {
            ordinal: 0,
            pageNumber: 1,
            parts: [
              expectedPart(0, "1x", 1, { x: 20, y: 20, width: 8, height: 8 }),
            ],
          },
        ],
      },
    })

    expect(match.failures).toEqual([])
  })

  it("fails a wrong part crop with the same quantity", () => {
    const expectedMask = squareMask(8, 8, 1, 1, 5, 5)
    const actualMask = squareMask(8, 8, 1, 1, 5, 5)
    const comparison = compareAlphaMasks({
      expectedMask,
      actualMask,
      expectedRegion: { x: 20, y: 20, width: 8, height: 8 },
      actualRegion: { x: 40, y: 40, width: 8, height: 8 },
      tolerance: 4,
    })

    expect(comparison.passed).toBe(false)
    expect(comparison.expectedCoverage).toBe(0)
  })

  it("tolerates part crop region drift when alpha masks remain equivalent", () => {
    const expected = expectedPart(0, "1x", 1, { x: 20, y: 20, width: 8, height: 8 })
    const actual = actualPart("1x", 1, { x: 20, y: 26, width: 8, height: 8 })

    expected.alphaMask = encodeMask(squareMask(8, 8, 1, 6, 5, 1))
    actual.partImage.alphaMask = {
      data: Object.fromEntries([...squareMask(8, 8, 1, 0, 5, 1).data].map((value, index) => [index, value])),
      height: 8,
      width: 8,
    }

    const match = matchBagAnalysisStructure({
      actualResult: {
        callouts: [
          {
            pageNumber: 1,
            crop: { region: { x: 10, y: 10, width: 50, height: 40 } },
            partItems: [actual],
          },
        ],
      },
      expectedCallouts: {
        schemaVersion: 2,
        caseId: "test",
        callouts: [
          {
            ordinal: 0,
            pageNumber: 1,
            crop: { region: { x: 10, y: 10, width: 50, height: 40 } },
          },
        ],
      },
      expectedParts: {
        schemaVersion: 2,
        caseId: "test",
        callouts: [
          {
            ordinal: 0,
            pageNumber: 1,
            parts: [expected],
          },
        ],
      },
    })

    expect(match.failures).toEqual([])
  })

  it("passes small part crop and alpha drift when masked content remains equivalent", () => {
    const expectedMask = squareMask(8, 8, 1, 1, 5, 5)
    const actualMask = squareMask(8, 8, 1, 1, 5, 5)
    const comparison = compareAlphaMasks({
      expectedMask,
      actualMask,
      expectedRegion: { x: 20, y: 20, width: 8, height: 8 },
      actualRegion: { x: 22, y: 21, width: 8, height: 8 },
      tolerance: 4,
    })

    expect(comparison.passed).toBe(true)
    expect(comparison.expectedCoverage).toBe(1)
  })

  it("uses centralized alpha mask pass criteria at threshold edges", () => {
    expect(ALPHA_MASK_PASS_CRITERIA).toEqual({
      maxActualExtraRatio: 0.025,
      minExpectedCoverage: 0.95,
    })
    expect(alphaMaskComparisonPasses({
      actualExtraRatio: 0.025,
      expectedCoverage: 0.95,
    }, ALPHA_MASK_PASS_CRITERIA)).toBe(true)
    expect(alphaMaskComparisonPasses({
      actualExtraRatio: 0.0251,
      expectedCoverage: 1,
    }, ALPHA_MASK_PASS_CRITERIA)).toBe(false)
    expect(alphaMaskComparisonPasses({
      actualExtraRatio: 0,
      expectedCoverage: 0.9499,
    }, ALPHA_MASK_PASS_CRITERIA)).toBe(false)
  })

  it("relaxes only expected coverage for CI untrusted review raster drift", () => {
    expect(UNTRUSTED_REVIEW_ALPHA_MASK_PASS_CRITERIA).toEqual({
      maxActualExtraRatio: 0.025,
      minExpectedCoverage: 0.9,
    })
    expect(alphaMaskComparisonPasses({
      actualExtraRatio: 0,
      expectedCoverage: 0.9,
    }, UNTRUSTED_REVIEW_ALPHA_MASK_PASS_CRITERIA)).toBe(true)
    expect(alphaMaskComparisonPasses({
      actualExtraRatio: 0.026,
      expectedCoverage: 1,
    }, UNTRUSTED_REVIEW_ALPHA_MASK_PASS_CRITERIA)).toBe(false)
    expect(alphaMaskComparisonPasses({
      actualExtraRatio: 0,
      expectedCoverage: 0.899,
    }, UNTRUSTED_REVIEW_ALPHA_MASK_PASS_CRITERIA)).toBe(false)
  })

  it("runs the shared alpha mask comparator from serialized source", () => {
    const comparisonInput = {
      actualMask: squareMask(8, 8, 1, 1, 5, 5),
      actualRegion: { x: 22, y: 21, width: 8, height: 8 },
      expectedMask: squareMask(8, 8, 1, 1, 5, 5),
      expectedRegion: { x: 20, y: 20, width: 8, height: 8 },
      passCriteria: ALPHA_MASK_PASS_CRITERIA,
      tolerance: 4,
    }
    const restoredComparator = restoreComparatorForTest(
      compareAlphaMaskPixels.toString(),
      alphaMaskComparisonPasses.toString(),
    )

    expect(restoredComparator(comparisonInput)).toEqual(compareAlphaMaskPixels(comparisonInput))
  })
})

function restoreComparatorForTest(
  compareSource: string,
  passesSource: string,
): typeof compareAlphaMaskPixels {
  const passes = new Function(
    `"use strict"; return (${passesSource});`,
  )() as typeof alphaMaskComparisonPasses

  return new Function(
    "alphaMaskComparisonPasses",
    `"use strict"; return (${compareSource});`,
  )(passes) as typeof compareAlphaMaskPixels
}

function restoreColorDriftGate(previous: string | undefined): void {
  if (typeof previous === "string") {
    process.env.BAG_IT_E2E_ALLOW_UNTRUSTED_COLOR_DRIFT = previous
    return
  }

  delete process.env.BAG_IT_E2E_ALLOW_UNTRUSTED_COLOR_DRIFT
}

function encodeMask(mask: DecodedAlphaMask) {
  return {
    width: mask.width,
    height: mask.height,
    encoding: "uint8-base64" as const,
    dataBase64: Buffer.from(mask.data).toString("base64"),
  }
}

function squareMask(
  width: number,
  height: number,
  startX: number,
  startY: number,
  maskWidth: number,
  maskHeight: number,
): DecodedAlphaMask {
  const data = new Uint8Array(width * height)

  for (let y = startY; y < startY + maskHeight; y += 1) {
    for (let x = startX; x < startX + maskWidth; x += 1) {
      data[y * width + x] = 255
    }
  }

  return {
    data,
    height,
    width,
  }
}

function expectedPart(
  ordinal: number,
  text: string,
  value: number,
  partRegion: { height: number; width: number; x: number; y: number },
) {
  return {
    ordinal,
    quantity: { text, value },
    color: {
      name: "Green",
      family: "green",
      status: "review",
      swatchHex: "#165025",
      manualClassId: "manual-color-001",
      manualClassTrusted: false,
      rawManualClassId: "manual-color-001",
    },
    partRegion,
    quantityLabelRegion: { x: 1, y: 1, width: 3, height: 2 },
    alphaMask: {
      width: 1,
      height: 1,
      encoding: "uint8-base64" as const,
      dataBase64: "/w==",
    },
  }
}

function actualPart(
  text: string,
  value: number,
  region: { height: number; width: number; x: number; y: number },
  detectedColor = {
    name: "Green",
    family: "green",
    status: "review",
    swatchHex: "#165025",
    manualClassId: "manual-color-001",
    manualClassTrusted: false,
    rawManualClassId: "manual-color-001",
  },
) {
  return {
    quantity: { text, value },
    detectedColor,
    partImage: {
      region,
      alphaMask: {
        width: 1,
        height: 1,
        data: { 0: 255 } as Record<string, number>,
      },
    },
    quantityLabel: {
      region: { x: 1, y: 1, width: 3, height: 2 },
    },
  }
}
