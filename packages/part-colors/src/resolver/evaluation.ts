import type { DetectedPartColor } from "../contracts"
import { findConflictingCropHashes } from "./label-policy"
import type { EvaluationSummary, ResolverLabel } from "./types"

export function evaluateResolverLabels(
  labels: readonly ResolverLabel[],
  colorsByPartId: ReadonlyMap<string, DetectedPartColor>,
): EvaluationSummary {
  const conflicts = findConflictingCropHashes(labels).size
  const results = labels.map((label) => {
    const id = label.itemId ?? label.id ?? ""
    const actualName = id ? colorsByPartId.get(id)?.name : undefined
    const expectedName = label.expectedName

    return {
      actualName,
      expectedName,
      id,
      matched: normalizeName(actualName) === normalizeName(expectedName),
    }
  })

  return {
    conflicts,
    matched: results.filter((result) => result.matched).length,
    missing: results.filter((result) => !result.actualName).length,
    results,
    total: results.length,
  }
}

function normalizeName(name: string | undefined): string {
  return name?.trim().toLowerCase() ?? ""
}
