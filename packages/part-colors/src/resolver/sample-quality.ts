import type { PartColorSample } from "../contracts"
import type { SampleQuality, SampleQualityIssue } from "./types"

const TINY_PIXEL_COUNT = 80
const LOW_STABILITY = 0.45
const LOW_DOMINANCE = 0.18
const EDGE_POLLUTION_RATIO = 0.5

export function classifySampleQuality(sample: PartColorSample | null | undefined): SampleQuality {
  if (!sample) {
    return unknownQuality(["missing-sample"])
  }

  if (sample.status === "unknown" || sample.pixelCount <= 0) {
    return unknownQuality(["unknown-sample"])
  }

  const issues = readSampleQualityIssues(sample)

  return {
    confidence: readSampleConfidence(sample, issues),
    issues,
    status: issues.length > 0 || sample.status === "review" || sample.status === "weak-classifiable"
      ? "review"
      : "usable",
  }
}

function readSampleQualityIssues(sample: PartColorSample): SampleQualityIssue[] {
  const issues: SampleQualityIssue[] = []

  if (sample.pixelCount < TINY_PIXEL_COUNT) {
    issues.push("tiny-mask")
  }

  if (sample.stability < LOW_STABILITY) {
    issues.push("low-stability")
  }

  if (sample.dominantCoverage < LOW_DOMINANCE) {
    issues.push("low-dominance")
  }

  if (readEdgePollutionRatio(sample) > EDGE_POLLUTION_RATIO) {
    issues.push("edge-polluted")
  }

  return issues
}

function readEdgePollutionRatio(sample: PartColorSample): number {
  const rejectedEdge = sample.rejectionCounts.edge ?? 0
  const acceptedPixels = Math.max(1, sample.pixelCount)

  return rejectedEdge / acceptedPixels
}

function readSampleConfidence(sample: PartColorSample, issues: readonly SampleQualityIssue[]): number {
  const issuePenalty = issues.length * 0.08
  const dominanceScore = Math.min(1, sample.dominantCoverage * 1.25)
  const stabilityScore = Math.max(0, Math.min(1, sample.stability))

  return Math.max(0, Math.min(1, stabilityScore * 0.72 + dominanceScore * 0.28 - issuePenalty))
}

function unknownQuality(issues: SampleQualityIssue[]): SampleQuality {
  return {
    confidence: 0,
    issues,
    status: "unknown",
  }
}
