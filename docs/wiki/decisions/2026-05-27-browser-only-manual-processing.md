# Browser-Only Manual Processing

## Status

Accepted.

## Context

Bag It handles private MOC manual PDFs. The fresh MVP needs PDF metadata,
rendering, step-callout detection, OCR-like image analysis, draft bagging, and
session export/import without making private source material part of application
server state.

## Decision

Manual processing is browser-owned for the fresh MVP:

- uploaded PDF bytes stay in browser memory unless the user explicitly downloads
  a session file
- PDF rendering, detector work, OCR-like image analysis, and draft bagging run in
  browser-owned code
- session files are generated client-side
- application server routes must not receive uploaded PDF bytes, page renders,
  crops, or private row-level debug output
- server-side manual processing jobs are out of scope and not planned

The `expired` state remains a model/UI state for browser-owned source or derived
artifacts. If actual expiry behavior is introduced later, it applies to browser
memory, workers, rendered pages, crops, or local browser caches, not server jobs.

## Consequences

- Large-manual performance work must focus on browser workers, progressive
  rendering, batching, and resumable client-side state.
- Privacy guarantees are simpler: no backend retention or deletion workflow is
  required for manual data in the MVP.
- Any future proposal to process manuals server-side must be a new explicit
  architecture decision and cannot be assumed by existing specs.
