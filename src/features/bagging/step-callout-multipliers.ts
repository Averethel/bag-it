import type { StepCalloutDetectionResult } from "@/features/steps/step-detection-contracts"

export type StepCalloutMultiplierMap = Record<string, number>

export const DEFAULT_STEP_CALLOUT_MULTIPLIER = 1
export const MAX_STEP_CALLOUT_MULTIPLIER = 99

export function calloutMultiplierFor(
  multipliers: StepCalloutMultiplierMap,
  calloutId: string,
): number {
  return normalizeStepCalloutMultiplier(multipliers[calloutId])
}

export function setCalloutMultiplier(
  multipliers: StepCalloutMultiplierMap,
  calloutId: string,
  multiplier: number,
): StepCalloutMultiplierMap {
  const normalized = normalizeStepCalloutMultiplier(multiplier)
  const next = { ...multipliers }

  if (normalized === DEFAULT_STEP_CALLOUT_MULTIPLIER) {
    delete next[calloutId]
    return next
  }

  next[calloutId] = normalized
  return next
}

export function normalizeStepCalloutMultiplier(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_STEP_CALLOUT_MULTIPLIER
  }

  return Math.max(
    DEFAULT_STEP_CALLOUT_MULTIPLIER,
    Math.min(MAX_STEP_CALLOUT_MULTIPLIER, Math.round(value)),
  )
}

export function sanitizeCalloutMultipliers(value: unknown): StepCalloutMultiplierMap {
  if (!isRecord(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([calloutId, multiplier]) => [
        calloutId,
        normalizeStepCalloutMultiplier(multiplier),
      ] as const)
      .filter(([_calloutId, multiplier]) => multiplier !== DEFAULT_STEP_CALLOUT_MULTIPLIER),
  )
}

export function pruneCalloutMultipliers(
  multipliers: StepCalloutMultiplierMap,
  result: StepCalloutDetectionResult | null,
): StepCalloutMultiplierMap {
  if (!result) {
    return {}
  }

  const calloutIds = new Set(result.callouts.map((callout) => callout.id))

  return Object.fromEntries(
    Object.entries(multipliers).filter(([calloutId]) => calloutIds.has(calloutId)),
  )
}

export function hasCalloutMultipliers(multipliers: StepCalloutMultiplierMap): boolean {
  return Object.keys(multipliers).length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
