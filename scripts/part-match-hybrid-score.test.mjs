import { describe, expect, it } from "vitest"
import { createHybridScores } from "./part-match-hybrid-score"

describe("part-match-hybrid-score", () => {
  it("combines CNN and structural scores conservatively", () => {
    const scores = createHybridScores({
      cnnScore: 0.8,
      structuralMatched: false,
      structuralProbability: 0.6,
      structuralFeatures: {
        alignedAlpha8Distance: 0,
        alignedAlpha8Overlap: 0,
        alignedEdge8Distance: 0,
        alignedLuma8Distance: 0,
        alignmentScaleDelta: 0,
        alignmentShiftDistance: 0,
        alpha32Distance: 0,
        alpha32ShiftDistance: 0,
        alpha32ShiftRatio: 0,
        alphaChamferDistance: 0,
        alphaChamferShiftDistance: 0,
        alphaChamferShiftRatio: 0,
        alphaCorrelation: 0.75,
        alphaDistance: 0,
        alphaEdge32Distance: 0,
        alphaEdgeDistance: 0,
        alphaOrientationDistance: 0,
        alphaShiftDistance: 0,
        alphaShiftRatio: 0,
        areaRatio: 1,
        aspectRatio: 1,
        centerDistance: 0,
        coverageDelta: 0,
        hasLuma: 1,
        leftProfileDistance: 0,
        lowerProfileDistance: 0,
        lowerSegmentDelta: 0,
        luma32Distance: 0,
        luma32ShiftDistance: 0,
        luma32ShiftRatio: 0,
        lumaCorrelation: 0.25,
        lumaDistance: 0,
        lumaEdgeCorrelation: 0,
        lumaEdgeDistance: 0,
        lumaEdgeShiftDistance: 0,
        lumaOrientationDistance: 0,
        lumaShiftDistance: 0,
        lumaShiftRatio: 0,
        nearConfidence: 0.4,
        profileMaxDistance: 0,
        projectionDistance: 0,
        rightProfileDistance: 0,
        silhouetteDistance: 0,
        silhouetteShiftDistance: 0,
        silhouetteShiftRatio: 0,
        tightAlpha32Distance: 0,
        tightAlpha32ShiftDistance: 0,
        tightAlpha32ShiftRatio: 0,
        tightAlphaChamferDistance: 0,
        tightAlphaChamferShiftDistance: 0,
        tightAlphaChamferShiftRatio: 0,
        tightAlphaEdge32Distance: 0,
        tightLuma32Distance: 0,
        tightLuma32ShiftDistance: 0,
        tightLuma32ShiftRatio: 0,
        topPeakDelta: 0,
        topProfileDistance: 0,
        wideAlpha32ShiftDistance: 0,
        wideAlpha32ShiftRatio: 0,
        wideLuma32ShiftDistance: 0,
        wideLuma32ShiftRatio: 0,
        wideSilhouetteShiftDistance: 0,
        wideSilhouetteShiftRatio: 0,
      },
    })

    expect(scores.cnn).toBe(0.8)
    expect(scores.cnnStructuralMin).toBe(0.6)
    expect(scores.cnnStructuralProduct).toBeCloseTo(0.48)
    expect(scores.cnnNearMin).toBe(0.4)
    expect(scores.cnnNearProduct).toBeCloseTo(0.32)
    expect(scores.cnnIfStructuralMatch).toBe(0)
    expect(scores.cnnAlphaProduct).toBeCloseTo(0.6)
    expect(scores.cnnLumaProduct).toBeCloseTo(0.2)
  })
})
