import type {
  StepCalloutCandidate,
  StepCalloutEvidenceScore,
  StepCalloutPageInput,
  StepCalloutRgbColor,
} from "./contracts"
import {
  scoreStepCalloutManualStyleCompatibility,
  type StepCalloutManualStyle,
} from "./manual-style"
import {
  estimateStepCalloutPageBackground,
  stepCalloutColorDistance,
  stepCalloutColorLuma,
} from "./pixels"

const MIN_BACKGROUND_DISTANCE = 18
const PAGE_LOCAL_FALLBACK_MAX_MANUAL_STYLE_SAMPLES = 96

export function scoreStepCalloutBackgroundEvidence(
  page: StepCalloutPageInput,
  candidate: StepCalloutCandidate,
  candidateBackground: StepCalloutRgbColor,
  manualStyle: StepCalloutManualStyle | null = null,
  options: { allowPageLocalFallback?: boolean; forcePageLocalFallback?: boolean } = {},
): StepCalloutEvidenceScore {
  const pageBackground = estimateStepCalloutPageBackground(page)
  const pageLocalScore = scorePageLocalBackground(candidate, candidateBackground, pageBackground)

  if (manualStyle) {
    const manualStyleScore = scoreManualStyleBackground(candidateBackground, manualStyle)

    if (!canUsePageLocalFallback(options, manualStyle)) {
      return manualStyleScore
    }

    return scoreBestBackgroundEvidence(
      manualStyleScore,
      pageLocalScore,
      manualStyle,
    )
  }

  return pageLocalScore
}

function scorePageLocalBackground(
  candidate: StepCalloutCandidate,
  candidateBackground: StepCalloutRgbColor,
  pageBackground: StepCalloutRgbColor,
): StepCalloutEvidenceScore {
  const distance = stepCalloutColorDistance(candidateBackground, pageBackground)

  return {
    reasons: createBackgroundReasons(candidate, candidateBackground, distance),
    signal: "background",
    value: normalizeBackgroundDistance(distance),
  }
}

function canUsePageLocalFallback(
  options: { allowPageLocalFallback?: boolean; forcePageLocalFallback?: boolean },
  manualStyle: StepCalloutManualStyle,
): boolean {
  return (
    options.forcePageLocalFallback === true ||
    options.allowPageLocalFallback === true &&
      manualStyle.sampleCount <= PAGE_LOCAL_FALLBACK_MAX_MANUAL_STYLE_SAMPLES
  )
}

function scoreBestBackgroundEvidence(
  manualStyleScore: StepCalloutEvidenceScore,
  pageLocalScore: StepCalloutEvidenceScore,
  manualStyle: StepCalloutManualStyle,
): StepCalloutEvidenceScore {
  if (manualStyleScore.value >= pageLocalScore.value) {
    return manualStyleScore
  }

  return {
    reasons: [
      ...pageLocalScore.reasons,
      `page-local-background-over-manual-style:${manualStyle.sampleCount}`,
    ],
    signal: "background",
    value: pageLocalScore.value,
  }
}

function scoreManualStyleBackground(
  color: StepCalloutRgbColor,
  manualStyle: StepCalloutManualStyle,
): StepCalloutEvidenceScore {
  const value = scoreStepCalloutManualStyleCompatibility(color, manualStyle)

  return {
    reasons: createManualStyleReasons(value, manualStyle.sampleCount),
    signal: "background",
    value,
  }
}

function createManualStyleReasons(value: number, sampleCount: number): string[] {
  if (value >= 0.6) {
    return [`manual-style-background:${sampleCount}`]
  }

  return [`off-manual-style-background:${sampleCount}`]
}

function createBackgroundReasons(
  candidate: StepCalloutCandidate,
  color: StepCalloutRgbColor,
  distance: number,
): string[] {
  const reasons = []

  if (candidate.source === "fill-panel") {
    reasons.push("candidate-source-fill-panel")
  }

  if (distance >= MIN_BACKGROUND_DISTANCE) {
    reasons.push("differs-from-page-background")
  }

  if (stepCalloutColorLuma(color) >= 128) {
    reasons.push("light-panel-background")
  }

  if (reasons.length === 0) {
    reasons.push("weak-background-evidence")
  }

  return reasons
}

function normalizeBackgroundDistance(distance: number): number {
  return Math.min(1, distance / 60)
}
