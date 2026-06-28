import { extractPartColorFeature } from "./feature-extraction"
import { findDatasetRow, readDatasetRowCropHash } from "./manual-dataset"
import type { ResolverDataset, ResolverLabel, TrainingExample } from "./types"

const TRAINABLE_ROLES = new Set(["gate", "train"])

export interface LabelPolicyResult {
  accepted: TrainingExample[]
  excluded: Array<{
    label: ResolverLabel
    reason: LabelExclusionReason
  }>
}

export type LabelExclusionReason =
  | "conflicting-crop-hash"
  | "excluded-role"
  | "holdout-role"
  | "missing-expected-name"
  | "missing-row"
  | "stale-crop-hash"
  | "unclear-sample"

export function selectTrainableLabels(dataset: ResolverDataset): LabelPolicyResult {
  const conflictKeys = findConflictingCropHashes(dataset.labels)
  const accepted: TrainingExample[] = []
  const excluded: LabelPolicyResult["excluded"] = []

  for (const label of dataset.labels) {
    const exclusionReason = readLabelExclusionReason(dataset, label, conflictKeys)

    if (exclusionReason) {
      excluded.push({ label, reason: exclusionReason })
      continue
    }

    const row = findDatasetRow(dataset, label)
    const feature = row ? extractPartColorFeature(row) : null

    if (!feature) {
      excluded.push({ label, reason: "unclear-sample" })
      continue
    }

    if (feature.sample.status === "weak-classifiable") {
      excluded.push({ label, reason: "unclear-sample" })
      continue
    }

    accepted.push({
      expectedName: label.expectedName,
      feature,
      label,
    })
  }

  return { accepted, excluded }
}

export function findConflictingCropHashes(labels: readonly ResolverLabel[]): Set<string> {
  const expectedNamesByHash = new Map<string, Set<string>>()

  for (const label of labels) {
    if (!label.cropHash || !label.expectedName) {
      continue
    }

    const names = expectedNamesByHash.get(label.cropHash) ?? new Set<string>()

    names.add(normalizeName(label.expectedName))
    expectedNamesByHash.set(label.cropHash, names)
  }

  return new Set(
    [...expectedNamesByHash.entries()]
      .filter(([, names]) => names.size > 1)
      .map(([cropHash]) => cropHash),
  )
}

function readLabelExclusionReason(
  dataset: ResolverDataset,
  label: ResolverLabel,
  conflictKeys: ReadonlySet<string>,
): LabelExclusionReason | null {
  if (!label.expectedName?.trim()) {
    return "missing-expected-name"
  }

  if (label.role === "excluded" || label.status === "excluded") {
    return "excluded-role"
  }

  if (label.role === "holdout" || label.role === "active") {
    return "holdout-role"
  }

  if (label.role && !TRAINABLE_ROLES.has(label.role)) {
    return "excluded-role"
  }

  if (!findDatasetRow(dataset, label)) {
    return "missing-row"
  }

  if (label.cropHash && conflictKeys.has(label.cropHash)) {
    return "conflicting-crop-hash"
  }

  const rowCropHash = readDatasetRowCropHash(dataset, label)

  if (label.cropHash && rowCropHash && rowCropHash !== label.cropHash) {
    return "stale-crop-hash"
  }

  return null
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
