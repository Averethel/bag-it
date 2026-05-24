export type StepCalloutMultiplierMap = Readonly<Record<string, number>>

type StepCalloutMultiplierScope = {
  callouts: readonly {
    id: string
  }[]
}

export function normalizeStepCalloutMultiplier(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1
  }

  return Math.max(1, Math.floor(value))
}

export function getStepCalloutMultiplier(
  calloutId: string,
  calloutMultipliers: StepCalloutMultiplierMap = {},
) {
  return normalizeStepCalloutMultiplier(calloutMultipliers[calloutId])
}

export function setStepCalloutMultiplier(
  current: StepCalloutMultiplierMap,
  calloutId: string,
  multiplier: unknown,
): StepCalloutMultiplierMap {
  const nextMultiplier = normalizeStepCalloutMultiplier(multiplier)
  const currentMultiplier = getStepCalloutMultiplier(calloutId, current)
  if (nextMultiplier === currentMultiplier) {
    return current
  }

  const next = { ...current }
  if (nextMultiplier <= 1) {
    delete next[calloutId]
  } else {
    next[calloutId] = nextMultiplier
  }

  return next
}

export function pruneStepCalloutMultipliers(
  current: StepCalloutMultiplierMap,
  result: StepCalloutMultiplierScope | null,
): StepCalloutMultiplierMap {
  const entries = Object.entries(current)
  if (entries.length === 0) {
    return current
  }
  if (!result) {
    return {}
  }

  const calloutIds = getStepCalloutIds(result)
  const next: Record<string, number> = {}
  let changed = false

  for (const [calloutId, multiplier] of entries) {
    const normalizedMultiplier = normalizeStepCalloutMultiplier(multiplier)
    if (!calloutIds.has(calloutId) || normalizedMultiplier <= 1) {
      changed = true
      continue
    }

    next[calloutId] = normalizedMultiplier
    if (normalizedMultiplier !== multiplier) {
      changed = true
    }
  }

  return changed || Object.keys(next).length !== entries.length ? next : current
}

export function createStepCalloutMultiplierEntries(
  multipliers: StepCalloutMultiplierMap,
  result: StepCalloutMultiplierScope | null,
): [string, number][] {
  if (!result) {
    return []
  }

  return Object.entries(pruneStepCalloutMultipliers(multipliers, result))
    .sort(([leftCalloutId], [rightCalloutId]) => leftCalloutId.localeCompare(rightCalloutId))
}

export function restoreStepCalloutMultiplierEntries(
  entries: unknown,
  result: StepCalloutMultiplierScope | null,
): StepCalloutMultiplierMap {
  if (!result || !Array.isArray(entries)) {
    return {}
  }

  const calloutIds = getStepCalloutIds(result)
  const multipliers: Record<string, number> = {}

  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      continue
    }

    const [calloutId, multiplier] = entry
    const normalizedMultiplier = normalizeStepCalloutMultiplier(multiplier)
    if (typeof calloutId === "string" && calloutIds.has(calloutId) && normalizedMultiplier > 1) {
      multipliers[calloutId] = normalizedMultiplier
    }
  }

  return multipliers
}

function getStepCalloutIds(result: StepCalloutMultiplierScope) {
  return new Set(result.callouts.map((callout) => callout.id))
}
