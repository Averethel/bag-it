import type { PartColorCalibrationInput } from "../contracts"
import type { ResolverDataset, ResolverLabel } from "./types"

export interface CreateResolverDatasetInput {
  cropHashesByItemId?: ReadonlyMap<string, string> | Record<string, string>
  labels?: readonly ResolverLabel[]
  manualId?: string
  rows: readonly PartColorCalibrationInput[]
}

export function createResolverDataset(input: CreateResolverDatasetInput): ResolverDataset {
  return {
    cropHashesByItemId: normalizeCropHashes(input.cropHashesByItemId),
    labels: [...(input.labels ?? [])],
    manualId: input.manualId,
    rows: [...input.rows].sort((left, right) => left.id.localeCompare(right.id)),
  }
}

export function findDatasetRow(
  dataset: ResolverDataset,
  label: ResolverLabel,
): PartColorCalibrationInput | undefined {
  const id = label.itemId ?? label.id

  return id ? dataset.rows.find((row) => row.id === id) : undefined
}

export function readDatasetRowCropHash(
  dataset: ResolverDataset,
  label: ResolverLabel,
): string | undefined {
  const id = label.itemId ?? label.id

  return id ? dataset.cropHashesByItemId?.get(id) : undefined
}

function normalizeCropHashes(
  cropHashes: CreateResolverDatasetInput["cropHashesByItemId"],
): ReadonlyMap<string, string> | undefined {
  if (!cropHashes) {
    return undefined
  }

  return cropHashes instanceof Map
    ? new Map(cropHashes)
    : new Map(Object.entries(cropHashes))
}
