import type {
  StepCalloutCandidate,
  StepCalloutEvidenceScore,
  StepCalloutPageInput,
  StepCalloutRgbColor,
  StepCalloutRegion,
} from "./contracts"
import {
  isStepCalloutDarkPixel,
  readStepCalloutPixelColor,
  stepCalloutColorDistance,
} from "./pixels"

const BORDER_SEARCH_OUTSETS = [0, 1, 2, 3]
const EDGE_CONTRAST_BORDER_SCORE_MAX = 0.35
const EDGE_CONTRAST_DISTANCE_MIN = 18
const STRONG_EDGE_COVERAGE = 0.45

interface EdgeCoverage {
  kind: "dark" | "edge-contrast"
  outset: number
  value: number
}

export function scoreStepCalloutBorderEvidence(
  page: StepCalloutPageInput,
  candidate: StepCalloutCandidate,
  candidateBackground?: StepCalloutRgbColor,
): StepCalloutEvidenceScore {
  const coverage = readBestEdgeCoverage(page, candidate, candidateBackground)

  return {
    reasons: createBorderReasons(candidate, coverage),
    signal: "border",
    value: coverage.value,
  }
}

function createBorderReasons(
  candidate: StepCalloutCandidate,
  coverage: EdgeCoverage,
): string[] {
  const reasons = []

  if (candidate.source === "border" || candidate.source === "line-rectangle") {
    reasons.push("candidate-source-border")
  }

  if (candidate.source === "line-rectangle") {
    reasons.push("candidate-source-line-rectangle")
  }

  if (coverage.outset > 0) {
    reasons.push("expanded-edge-search")
  }

  if (coverage.kind === "edge-contrast") {
    reasons.push("edge-contrast-coverage")
  }

  if (coverage.value >= STRONG_EDGE_COVERAGE) {
    reasons.push("dark-edge-coverage")
  }

  if (reasons.length === 0) {
    reasons.push("weak-border-evidence")
  }

  return reasons
}

function readBestEdgeCoverage(
  page: StepCalloutPageInput,
  candidate: StepCalloutCandidate,
  candidateBackground: StepCalloutRgbColor | undefined,
): EdgeCoverage {
  const coverages = BORDER_SEARCH_OUTSETS.flatMap<EdgeCoverage>((outset) => {
    const region = outsetRegion(candidate.region, outset)
    const darkCoverage: EdgeCoverage = {
      kind: "dark",
      outset,
      value: edgeDarkCoverage(page, region),
    }

    if (candidate.source !== "fill-panel" || !candidateBackground) {
      return [darkCoverage]
    }

    return [
      darkCoverage,
      {
        kind: "edge-contrast",
        outset,
        value: edgeContrastCoverage(page, region, candidateBackground) * EDGE_CONTRAST_BORDER_SCORE_MAX,
      },
    ]
  })

  return coverages.sort(compareEdgeCoverage)[0] ?? { kind: "dark", outset: 0, value: 0 }
}

function compareEdgeCoverage(left: EdgeCoverage, right: EdgeCoverage): number {
  return right.value - left.value || left.outset - right.outset
}

function edgeDarkCoverage(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
): number {
  const edgeIndexes = collectEdgePixelIndexes(page, region)
  const darkCount = edgeIndexes.filter((pixelIndex) => isStepCalloutDarkPixel(page, pixelIndex)).length

  return edgeIndexes.length === 0 ? 0 : darkCount / edgeIndexes.length
}

function edgeContrastCoverage(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
  background: StepCalloutRgbColor,
): number {
  const edgeIndexes = collectEdgePixelIndexes(page, region)
  const contrastCount = edgeIndexes.filter((pixelIndex) =>
    stepCalloutColorDistance(readStepCalloutPixelColor(page, pixelIndex), background) >= EDGE_CONTRAST_DISTANCE_MIN
  ).length

  return edgeIndexes.length === 0 ? 0 : contrastCount / edgeIndexes.length
}

function collectEdgePixelIndexes(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
): number[] {
  return [
    ...collectHorizontalEdge(page, region, region.y),
    ...collectHorizontalEdge(page, region, region.y + region.height - 1),
    ...collectVerticalEdge(page, region, region.x),
    ...collectVerticalEdge(page, region, region.x + region.width - 1),
  ]
}

function collectHorizontalEdge(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
  y: number,
): number[] {
  return createRange(region.x, region.x + region.width)
    .map((x) => pixelIndexIfInPage(page, x, y))
    .filter((pixelIndex): pixelIndex is number => pixelIndex !== null)
}

function collectVerticalEdge(
  page: StepCalloutPageInput,
  region: StepCalloutRegion,
  x: number,
): number[] {
  return createRange(region.y, region.y + region.height)
    .map((y) => pixelIndexIfInPage(page, x, y))
    .filter((pixelIndex): pixelIndex is number => pixelIndex !== null)
}

function createRange(start: number, endExclusive: number): number[] {
  return Array.from({ length: Math.max(0, endExclusive - start) }, (_, index) => start + index)
}

function pixelIndexIfInPage(
  page: StepCalloutPageInput,
  x: number,
  y: number,
): number | null {
  if (x < 0 || y < 0 || x >= page.width || y >= page.height) {
    return null
  }

  return y * page.width + x
}

function outsetRegion(region: StepCalloutRegion, outset: number): StepCalloutRegion {
  return {
    height: region.height + outset * 2,
    width: region.width + outset * 2,
    x: region.x - outset,
    y: region.y - outset,
  }
}
