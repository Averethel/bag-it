# Detector V2 Specification

V2 is the production detector path behind `/`. The `/v2` route is a temporary
redirect alias for old validation scripts and bookmarks. Pure step-callout
detection lives in `@bag-it/step-callouts`; browser rendering, progress,
quantity/part extraction, preview hydration, sessions, output assembly, and
route compatibility remain in `src/features/steps/v2/**`.

## Pipeline

1. [Page input](01-page-input.md): normalize rendered page pixels, text items,
   and coordinates.
2. [Callout candidates](02-callout-candidates.md): produce broad bordered,
   fill-panel, and quantity-anchored candidate regions.
3. [Callout evidence](03-callout-evidence.md): score candidates with border,
   background, and quantity evidence.
4. [Conflict resolution](04-conflict-resolution.md): choose accepted,
   diagnostic, and rejected callouts.
5. [Quantity labels](05-quantity-labels.md): parse visible `Nx` labels without
   guessing values.
6. [Part extraction](06-part-extraction.md): assign foreground to labels and
   emit part-only crops.
7. [Output assembly](07-output-assembly.md): map v2 internals to the existing
   Build steps result contract.

## Invariants

- V2 production detector modules and `@bag-it/step-callouts` do not import the
  legacy detector monolith.
- `@bag-it/step-callouts` does not import app code, PDF.js, React, Next,
  Chakra, sessions, previews, bagging, or part extraction.
- `@bag-it/step-callouts` raster step-number layout refinement keeps a small
  resolver facade and separates anchor detection/alignment, evidence gates,
  top-row support, and shared layout types.
- The production browser adapter uses the v2 page-input, candidate, evidence,
  resolver, and output assembly path. The legacy detector path is removed.
- Every stage emits structured counts and failure taxonomy data.
- Accepted baggable callouts require quantity-backed part rows before Bags use
  v2 output.
- Tuning must add evidence or split a stage when fixes conflict; do not add
  manual-, page-, or step-specific guards.

## Validation Data

Committed fixtures may be synthetic, public/licensed, or user-approved.
Private manuals, rendered pages, crops, and row-level debug output stay under
ignored `.bag-it/private/**` or `/private/tmp`.

Manual-derived saved sessions may be committed only as approved expected
baselines. Their manifest entries must declare `sourceKind`,
`approvalStatus`, and which render/session/part baseline artifacts are committed
expected baselines. They are not executed by package-level replay. Private
regression validation uploads a temp copy of the saved session through `/` in
a Playwright-controlled browser session, forces fresh analysis from the embedded
manual bytes, downloads the browser-produced session, then compares callouts
first and parts second with IoU tolerance. Temporary browser automation output
may live under `/private/tmp`; committed code must not contain derived crops,
refreshed saved sessions without approval, or row-level debug output.

Failure taxonomy:

- `missing-candidate`
- `false-positive-candidate`
- `bad-merge`
- `bad-split`
- `duplicate`
- `quantity-missing`
- `quantity-wrong`
- `part-crop-missing`
- `part-crop-overlaps-label`
- `part-crop-cuts-part`

Private manual acceptance and regression work uses the app path itself: real
Playwright browser upload, browser-produced session comparison, mounted DOM
checks, and screenshots. If any local non-browser output disagrees with the
browser upload path, the browser upload path is authoritative.
