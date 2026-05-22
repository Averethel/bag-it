import type { Tokens } from "@chakra-ui/react"

export type OverviewItem = {
  label: string
  detail: string
}

export type BaggingOverviewContent = {
  badge: string
  title: string
  description: string
  items: readonly OverviewItem[]
}

export type BaggingSwatchToken = Extract<Tokens["colors"], `bagging.swatch.${string}`>

export type BaggingPart = {
  id: string
  color: string
  name: string
  qty: number
  swatch: BaggingSwatchToken
  imageUrl: string
}

export type BagChecklistItem = {
  partId: string
  name: string
  color: string
  qty: number
}

export type BagPlan = {
  id: string
  label: string
  range: string
  parts: number
  status: "Ready" | "Review"
  checklist: BagChecklistItem[]
}

export type CheckedItemChangeHandler = (id: string, checked: boolean) => void
