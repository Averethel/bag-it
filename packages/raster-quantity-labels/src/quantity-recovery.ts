import type { CalloutPartPageInput, Region, RgbColor } from "./contracts"
import {
  createAttachedBaselineRecoveryPlan,
  recoverAttachedBaselineCandidates,
} from "./quantity-attached-baseline-recovery"
import {
  createConnectedTopCapRecoveryPlan,
  recoverConnectedTopCapCandidates,
} from "./quantity-connected-top-cap-recovery"
import type { QuantityCandidate } from "./quantity-candidate-types"
import {
  COMPACT_MISSING_LOWER_PEER_RECOVERY_KIND,
  COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND,
  COMPACT_MISSING_UPPER_PEER_ROW_RECOVERY_KIND,
  createQuantityRetryRecoveryPlans,
  recoverCompactMissingLowerPeerCandidates,
  recoverCompactMissingSameRowTrailingPeerCandidates,
  recoverCompactMissingUpperPeerRowCandidates,
  recoverQuantityRetryCandidates,
} from "./quantity-retry-recovery"
import type { QuantityRecoveryPlan } from "./quantity-recovery-types"
import { mergeQuantityCandidates } from "./quantity-recovery-utils"

export type { QuantityRecoveryPlan } from "./quantity-recovery-types"

export function recoverQuantityCandidates(
  page: CalloutPartPageInput,
  calloutRegion: Region,
  background: RgbColor,
  initialCandidates: readonly QuantityCandidate[],
): QuantityCandidate[] {
  const recovered = createQuantityRecoveryPlans(initialCandidates, calloutRegion)
    .flatMap((plan) => recoverCandidatesForPlan(page, calloutRegion, background, initialCandidates, plan))

  return mergeQuantityCandidates(initialCandidates, recovered)
}

export function recoverPostRejectionQuantityCandidates(
  page: CalloutPartPageInput,
  calloutRegion: Region,
  background: RgbColor,
  postRejectionCandidates: readonly QuantityCandidate[],
): QuantityCandidate[] {
  const recovered = createQuantityRecoveryPlans(postRejectionCandidates, calloutRegion)
    .filter((plan) =>
      plan.kind === COMPACT_MISSING_LOWER_PEER_RECOVERY_KIND ||
      plan.kind === COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND ||
      plan.kind === COMPACT_MISSING_UPPER_PEER_ROW_RECOVERY_KIND
    )
    .flatMap((plan) => recoverCandidatesForPlan(page, calloutRegion, background, postRejectionCandidates, plan))

  return mergeQuantityCandidates(postRejectionCandidates, recovered)
}

export function createQuantityRecoveryPlans(
  candidates: readonly QuantityCandidate[],
  calloutRegion: Region,
): QuantityRecoveryPlan[] {
  const plans = [
    ...createQuantityRetryRecoveryPlans(candidates, calloutRegion),
    createConnectedTopCapRecoveryPlan(candidates, calloutRegion),
    createAttachedBaselineRecoveryPlan(candidates, calloutRegion),
  ]

  return plans.filter((plan): plan is QuantityRecoveryPlan => plan !== null)
}

function recoverCandidatesForPlan(
  page: CalloutPartPageInput,
  calloutRegion: Region,
  background: RgbColor,
  initialCandidates: readonly QuantityCandidate[],
  plan: QuantityRecoveryPlan,
): QuantityCandidate[] {
  if (plan.source === "lower-threshold") {
    if (plan.kind === COMPACT_MISSING_LOWER_PEER_RECOVERY_KIND) {
      return recoverCompactMissingLowerPeerCandidates(page, calloutRegion, background, initialCandidates, plan)
    }

    if (plan.kind === COMPACT_MISSING_SAME_ROW_TRAILING_PEER_RECOVERY_KIND) {
      return recoverCompactMissingSameRowTrailingPeerCandidates(page, calloutRegion, background, initialCandidates, plan)
    }

    if (plan.kind === COMPACT_MISSING_UPPER_PEER_ROW_RECOVERY_KIND) {
      return recoverCompactMissingUpperPeerRowCandidates(page, calloutRegion, background, initialCandidates, plan)
    }

    return recoverQuantityRetryCandidates(page, calloutRegion, background, plan)
  }

  if (plan.source === "connected-top-cap") {
    return recoverConnectedTopCapCandidates(page, calloutRegion, background, initialCandidates, plan)
  }

  return recoverAttachedBaselineCandidates(page, calloutRegion, background, initialCandidates, plan)
}
