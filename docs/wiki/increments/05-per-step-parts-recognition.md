# Increment 5: Per-Step Parts Recognition

## Goal

Recognize which parts and quantities are used at each build step.

## User Value

The app can assign parts to bags based on actual build order rather than only the global parts list.

## Deliverables

- Parts callout detection near steps
- Quantity OCR
- Part shape and color candidate recognition
- Matching against normalized BOM
- Per-step part usage records
- Confidence per step-part assignment
- Reconciliation against total BOM quantities
- Partial per-page or per-step recognition status

## Acceptance Criteria

- For the MVP fixture set, at least 90% of total BOM quantity is assigned to detected steps or explicitly classified as unresolved.
- The app detects quantity mismatches and uncertain assignments.
- Bag generation can consume step-level part data.
- Recognition progress can be reported before the full manual completes.

## Technical Notes

- Treat the manual BOM as the inventory boundary.
- Prefer reconciliation against known inventory over open-ended recognition.
- Preserve candidates and confidence for future tuning.
- If the BOM is missing, this increment should not infer full inventory for MVP bagging.

## Open Questions

- Which recognition approach should be tried first for part callouts?
- How should reused parts, optional parts, or spare parts be represented?
- What mismatch threshold should block automatic bagging?
