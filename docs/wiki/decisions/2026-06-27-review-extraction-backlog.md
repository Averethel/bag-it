# Review Extraction Backlog

## Status

Accepted as future work.

## Context

The 2026-06-27 focused review found more extraction opportunities after the
same-part matching refactors. These are not required before the current review
fixes, but they should guide future cleanup so large files do not regain mixed
responsibilities.

## Decision

Document these candidate boundaries for later, one extraction per patch, with a
focused check and full `npm run verify` after each change:

- `part-match-precompute-runtime`: own Bags-tab grouping precompute orchestration,
  worker client lifecycle, bucket fanout, transferable payloads, progress
  labels, stale-result rejection, and failure mapping.
- `bag-checklist-table-model`: own pure row grouping, sorting, reject/split
  display state, and row-summary derivations for checklist tables.
- `bag-checklist-accordion`: own expanded-section state, large-list lazy
  mounting, and section-header progress display.
- `runtime-preview-task-controller`: own page preview scheduling, mask work
  scheduling, abort fanout, retry behavior, and progress snapshots.
- `detector-client-boundary`: own lazy browser imports for PDF metadata,
  detector adapters, runtime preview defaults, and detector version constants.
- `analysis-job-state`: own legal upload, restore, purge, stale-rerun, scan,
  extraction, and failure transitions currently coordinated by
  `useStepAnalysisJob`.
- `bag-analysis-fixture-manifest-validator`: own manifest schema checks,
  approval rules, path confinement, split artifact existence, and tracked input
  session guard.
- `alpha-mask-comparison`: own shared alpha coverage, extra-pixel, and diff
  threshold calculations used by fixture comparison.

Later lower-priority package/script splits:

- split `part-alpha-trim.ts` into trim-window selection, alpha morphology, and
  output assembly only if the next detector change touches it.
- split `pair-scorer.ts` into candidate selection, static feature scoring, and
  lane classification only if matcher tuning resumes.
- split `write-part-match-report.mjs` into report data loading, HTML rendering,
  and label export helpers only when private report work continues.

## Consequences

- The current review pass may fix defects without doing broad extraction.
- Future cleanup should use these names as target boundaries instead of adding
  generic helper modules.
- Extraction remains behavior-preserving unless a relevant spec page is updated
  first.
