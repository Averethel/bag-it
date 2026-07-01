import type { Region } from "./contracts"
import { isComponentOwnedByOtherLabel } from "./part-ownership"
import type { ScoredComponent } from "./part-component-scoring"
import { horizontalOverlapRatio, regionCenter } from "./regions"

type RelatedComponentEvidenceKind =
  | "direct-contact"
  | "same-row-contact"
  | "vertical-stack"

interface RelatedComponentEvidence {
  kind: RelatedComponentEvidenceKind
  scoreDriftLimit: number
}

export function selectRelatedComponents(
  components: readonly ScoredComponent[],
  primary: ScoredComponent,
  labelRegion: Region,
  labelRegions: readonly Region[],
): ScoredComponent[] {
  const strictRelatedOwnership = isCrowdedWideLabel(labelRegion, labelRegions)

  return components.filter((candidate) =>
    candidate === primary ||
    isRelatedComponent(candidate, primary, components, labelRegion, labelRegions, strictRelatedOwnership),
  )
}

function isRelatedComponent(
  candidate: ScoredComponent,
  primary: ScoredComponent,
  components: readonly ScoredComponent[],
  labelRegion: Region,
  labelRegions: readonly Region[],
  strictRelatedOwnership: boolean,
): boolean {
  const evidence = readRelatedComponentEvidence(
    candidate.component.region,
    primary.component.region,
    labelRegion,
  )

  if (!evidence) {
    return false
  }

  if (
    isComponentBetterOwnedByOtherRowLabel(candidate.component.region, labelRegion, labelRegions) &&
    !isTightPrimaryContinuation(candidate.component.region, primary.component.region, labelRegion)
  ) {
    return false
  }

  if (
    isComponentOwnedByOtherLabel(candidate.component, labelRegion, labelRegions) &&
    (
      strictRelatedOwnership ||
      !isTightPrimaryContinuation(candidate.component.region, primary.component.region, labelRegion) ||
      isTightFragmentBesideBetterOwnedPeer(candidate, primary, components, labelRegion, labelRegions)
    )
  ) {
    return false
  }

  return candidate.score <= primary.score + evidence.scoreDriftLimit
}

function readRelatedComponentEvidence(
  candidate: Region,
  primary: Region,
  label: Region,
): RelatedComponentEvidence | null {
  const scoreTolerance = Math.max(28, label.width * 3.2)

  if (hasStrongPrimaryAdjacency(candidate, primary, label)) {
    return {
      kind: "direct-contact",
      scoreDriftLimit: Math.max(scoreTolerance, label.width * 8),
    }
  }

  if (hasCloseVerticalStackRelation(candidate, primary, label)) {
    return {
      kind: "vertical-stack",
      scoreDriftLimit: Math.max(scoreTolerance, label.width * 5.6, label.height * 7),
    }
  }

  if (hasSameRowContactEvidence(candidate, primary, label)) {
    return {
      kind: "same-row-contact",
      scoreDriftLimit: scoreTolerance,
    }
  }

  return null
}

function hasSameRowContactEvidence(candidate: Region, primary: Region, label: Region): boolean {
  const tolerance = Math.max(5, Math.round(label.height * 0.7))

  return horizontalGap(candidate, primary) <= tolerance &&
    verticalOverlapRatio(candidate, primary) >= 0.25
}

function isTightFragmentBesideBetterOwnedPeer(
  candidate: ScoredComponent,
  primary: ScoredComponent,
  components: readonly ScoredComponent[],
  labelRegion: Region,
  labelRegions: readonly Region[],
): boolean {
  const candidateRegion = candidate.component.region
  const peerAreaFloor = Math.max(candidateRegion.width * candidateRegion.height * 4, labelRegion.height * labelRegion.height)
  const narrowVerticalSideEdge = candidateRegion.height >= candidateRegion.width * 2.4 &&
    candidateRegion.height >= Math.max(8, Math.round(labelRegion.height * 0.55))

  if (!narrowVerticalSideEdge) {
    return false
  }

  return components.some((peer) => {
    if (peer === candidate || peer === primary) {
      return false
    }

    const peerRegion = peer.component.region
    const peerArea = peerRegion.width * peerRegion.height

    return peerArea >= peerAreaFloor &&
      isComponentOwnedByOtherLabel(peer.component, labelRegion, labelRegions) &&
      horizontalGap(candidateRegion, peerRegion) <= Math.max(4, Math.round(labelRegion.height * 0.5)) &&
      verticalOverlapRatio(candidateRegion, peerRegion) >= 0.35
  })
}

function isTightPrimaryContinuation(candidate: Region, primary: Region, label: Region): boolean {
  if (!hasHorizontalPrimaryAdjacency(candidate, primary, label)) {
    return false
  }

  const candidateArea = candidate.width * candidate.height
  const primaryArea = primary.width * primary.height
  const candidateIsSmallFragment =
    candidateArea <= primaryArea * 0.5 ||
    candidate.width <= primary.width * 0.5 ||
    candidate.height <= primary.height * 0.5

  return candidateIsSmallFragment && horizontalGap(candidate, primary) <= Math.max(4, Math.round(label.height * 0.45))
}

function isComponentBetterOwnedByOtherRowLabel(
  component: Region,
  labelRegion: Region,
  labelRegions: readonly Region[],
): boolean {
  const currentScore = scoreComponentToLabel(component, labelRegion)
  const scoreMargin = Math.max(8, Math.round(labelRegion.height * 1.1))

  return labelRegions.some((otherLabel) =>
    otherLabel !== labelRegion &&
    !isSameLabelRow(otherLabel, labelRegion) &&
    isPlausibleOwnerLabel(component, otherLabel) &&
    scoreComponentToLabel(component, otherLabel) + scoreMargin < currentScore,
  )
}

function isPlausibleOwnerLabel(component: Region, label: Region): boolean {
  const labelCenter = regionCenter(label)
  const horizontalReach = Math.max(label.width * 2.2, label.height * 4)
  const verticalReach = Math.max(24, label.height * 7)

  return labelCenter.x >= component.x - horizontalReach &&
    labelCenter.x <= component.x + component.width + horizontalReach &&
    verticalGap(component, label) <= verticalReach
}

function scoreComponentToLabel(component: Region, label: Region): number {
  const labelCenter = regionCenter(label)
  const componentCenter = regionCenter(component)
  const horizontalMiss = Math.max(0, component.x - labelCenter.x, labelCenter.x - component.x - component.width)
  const verticalMiss = verticalGap(component, label)
  const centerDrift = Math.abs(componentCenter.x - labelCenter.x) * 0.35

  return horizontalMiss * 2 + verticalMiss + centerDrift
}

function isSameLabelRow(left: Region, right: Region): boolean {
  return Math.abs(regionCenter(left).y - regionCenter(right).y) <= Math.max(9, Math.min(left.height, right.height) * 1.35)
}

function isCrowdedWideLabel(labelRegion: Region, labelRegions: readonly Region[]): boolean {
  const labelCenter = regionCenter(labelRegion)
  const sameRow = labelRegions.filter((candidate) =>
    candidate !== labelRegion &&
    Math.abs(regionCenter(candidate).y - labelCenter.y) <= Math.max(9, labelRegion.height * 1.35),
  )

  if (sameRow.length < 2) {
    return false
  }

  const peerWidths = sameRow.map((region) => region.width).sort((left, right) => left - right)
  const medianWidth = peerWidths[Math.floor(peerWidths.length / 2)] ?? labelRegion.width

  return labelRegion.width >= medianWidth * 1.35
}

function hasStrongPrimaryAdjacency(candidate: Region, primary: Region, label: Region): boolean {
  const gapLimit = Math.max(4, Math.round(label.height * 0.45))

  return (
    horizontalGap(candidate, primary) <= gapLimit &&
    verticalOverlapRatio(candidate, primary) >= 0.35
  ) || (
    verticalGap(candidate, primary) <= gapLimit &&
    horizontalOverlapRatio(candidate, primary) >= 0.3
  )
}

function hasCloseVerticalStackRelation(candidate: Region, primary: Region, label: Region): boolean {
  const gapLimit = Math.max(16, Math.round(label.height * 1.25))

  return verticalGap(candidate, primary) <= gapLimit &&
    horizontalOverlapRatio(candidate, primary) >= 0.45 &&
    isMostlyAboveLabel(candidate, label) &&
    isMostlyAboveLabel(primary, label)
}

function isMostlyAboveLabel(region: Region, label: Region): boolean {
  return region.y + region.height <= label.y + label.height * 0.35
}

function hasHorizontalPrimaryAdjacency(candidate: Region, primary: Region, label: Region): boolean {
  const gapLimit = Math.max(4, Math.round(label.height * 0.45))

  return horizontalGap(candidate, primary) <= gapLimit &&
    verticalOverlapRatio(candidate, primary) >= 0.35
}

function horizontalGap(left: Region, right: Region): number {
  return Math.max(0, Math.max(left.x - right.x - right.width, right.x - left.x - left.width))
}

function verticalGap(top: Region, bottom: Region): number {
  return Math.max(0, Math.max(top.y - bottom.y - bottom.height, bottom.y - top.y - top.height))
}

function verticalOverlapRatio(left: Region, right: Region): number {
  const overlap = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  )

  return overlap / Math.max(1, Math.min(left.height, right.height))
}
