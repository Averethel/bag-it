# Increment 9: Performance Hardening

## Goal

Harden and scale the baseline performance guardrails introduced in earlier increments.

## User Value

The user sees useful partial results quickly even for larger manuals, repeated runs, and noisier recognition paths.

## Deliverables

- Background job queue
- Page-level parallel processing
- Progressive result updates
- Cached page renders
- Cached Rebrickable lookups
- Resumable processing
- Avoidance of repeated full reprocessing
- Processing metrics
- Performance budget reporting by pipeline stage

## Acceptance Criteria

- Baseline MVP performance gates from [../quality-gates.md](../quality-gates.md) remain satisfied.
- Partial results become visible as soon as they are useful on larger manuals.
- Reprocessing an unchanged manual reuses cached work across extraction, normalization, and bagging where possible.
- Long-running analysis exposes meaningful status and stage-level timing.

## Technical Notes

- Design for asynchronous analysis early, even if the first implementation is local.
- Keep expensive catalogue and OCR work out of request-response UI paths.
- Capture timing metrics per processing stage.
- This is a hardening increment; do not defer all async, status, or caching work until here.

## Open Questions

- What processing time target is acceptable for a 100-page manual?
- Which job system should be used first?
- What should be cached locally versus remotely?
