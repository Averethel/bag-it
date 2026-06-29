import type { Region } from "./contracts"
import type { GlyphComponent } from "./glyph-mask"

export type QuantityRecoveryKind =
  | "attached-baseline"
  | "compact-missing-lower-peer"
  | "compact-upper-multirow"
  | "connected-top-cap"
  | "large-dense-top"
  | "tall-sparse-top"
  | "tall-multirow-top"

export interface QuantityCandidate {
  confidence: number
  glyphs: GlyphComponent[]
  recoveryKind?: QuantityRecoveryKind
  region: Region
  text: string
  value: number
}
