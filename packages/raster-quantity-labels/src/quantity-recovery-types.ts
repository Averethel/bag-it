import type { Region } from "./contracts"
import type { QuantityCandidateAssemblyOptions } from "./quantity-candidate-assembly"
import type { QuantityRecoveryKind } from "./quantity-candidate-types"

export type QuantityRecoverySource =
  | "attached-baseline"
  | "connected-top-cap"
  | "lower-threshold"

export interface QuantityRecoveryPlan {
  assemblyOptions?: QuantityCandidateAssemblyOptions
  kind: QuantityRecoveryKind
  source: QuantityRecoverySource
  targetBand: Region
}
