import { colorDistanceCiede2000 } from "../color-space"
import type { ColorPrototype, PartColorFeature } from "./types"
import {
  hasBrightNeutralShadowEvidence,
  isShadowedBrightNeutralPrototype,
} from "./neutral-shadow-evidence"
import {
  hasTransparentBlueEvidence,
  isTransparentBluePrototype,
} from "./transparent-blue-evidence"

export const AGGREGATE_PROTOTYPE_DISTANCE_LIMIT = 8
export const AGGREGATE_PROTOTYPE_MARGIN_LIMIT = 1.5

export interface PrototypeResolutionPolicy {
  distanceLimit?: number
  marginLimit?: number
}

export interface RankedPrototypeCandidate {
  distance: number
  name: string
  prototype: ColorPrototype
}

export interface PrototypeResolution {
  candidates: RankedPrototypeCandidate[]
  distance: number
  margin: number
  name: string
  prototype: ColorPrototype
}

export function resolveByAggregatePrototype(
  feature: PartColorFeature,
  prototypes: readonly ColorPrototype[],
  policy: PrototypeResolutionPolicy = {},
): PrototypeResolution | null {
  const distanceLimit = policy.distanceLimit ?? AGGREGATE_PROTOTYPE_DISTANCE_LIMIT
  const marginLimit = policy.marginLimit ?? AGGREGATE_PROTOTYPE_MARGIN_LIMIT
  const candidates = rankPrototypeCandidates(feature, prototypes)
  const nearest = candidates[0]

  if (!nearest) {
    return null
  }

  const nextDifferentName = candidates.find((candidate) =>
    normalizeName(candidate.name) !== normalizeName(nearest.name)
  )
  const margin = nextDifferentName
    ? nextDifferentName.distance - nearest.distance
    : Number.POSITIVE_INFINITY

  if (nearest.distance > distanceLimit || margin < marginLimit) {
    return null
  }

  return {
    candidates,
    distance: nearest.distance,
    margin,
    name: nearest.name,
    prototype: nearest.prototype,
  }
}

export function rankPrototypeCandidates(
  feature: PartColorFeature,
  prototypes: readonly ColorPrototype[],
): RankedPrototypeCandidate[] {
  return prototypes
    .filter((prototype) => isEligiblePrototypeCandidate(feature, prototype))
    .map((prototype) => ({
      distance: colorDistanceCiede2000(feature.rgb, prototype.rgb),
      name: prototype.expectedName,
      prototype,
    }))
    .sort((left, right) =>
      left.distance - right.distance ||
      left.name.localeCompare(right.name) ||
      left.prototype.id.localeCompare(right.prototype.id),
    )
}

function isEligiblePrototypeCandidate(feature: PartColorFeature, prototype: ColorPrototype): boolean {
  if (isShadowedBrightNeutralPrototype(prototype) && !hasBrightNeutralShadowEvidence(feature)) {
    return false
  }

  if (isTransparentBluePrototype(prototype) && !hasTransparentBlueEvidence(feature)) {
    return false
  }

  return true
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
