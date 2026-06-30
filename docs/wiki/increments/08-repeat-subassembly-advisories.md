# Increment 8: Repeat Subassembly Advisories

## Status

Active. This branch implements raster-only page advisories for possible repeated
subassembly panels. Alpha22 improves advisory recall for the known manual set by
searching eligible border, line-rectangle, and fill-panel evidence while keeping
review-only output. It keeps internal page-role gating, off-style pale-panel
gating, attached-label OCR, BOM/table-like rejection, accepted-callout label
overlap rejection, noisy-neighborhood rejection, internal-only diagnostics,
connected/bottom-edge label recovery, and conservative trailing-BOM safe skip.
The increment remains active until integration review accepts the private manual
examples in the PR branch.

## Scope

Deliver:

- detector-owned page advisories for possible repeat-subassembly multipliers
- raster-only outside `Nx` label detection through `@bag-it/raster-quantity-labels`
- no native PDF text or source text OCR dependency
- Build steps page review marker using existing `possible-step-multiplier`
  attention kind
- no automatic multiplier, bag quantity, part row, or completion-anchor changes
- synthetic unit coverage for positive and negative advisory cases
- private browser validation for the current repeat-callout page set across
  Lower Courtyard, Upper Courtyard, Hall Tower, mmannual, farm-house, and
  Animals manuals
- conservative trailing BOM/list scan skip that records unscanned pages in
  `skippedPageNumbers`

## Out Of Scope

- automatically applying detected repeat multipliers to callouts or Bags
- committing private screenshots, PDFs, rendered pages, or crop/debug artifacts
- refreshing approved manual-derived e2e fixtures without explicit user approval
- reintroducing native PDF text extraction

## Acceptance

- advisory detection does not alter accepted callout counts or part extraction
- non-actionable labels such as `1x` do not produce review markers
- labels inside accepted callouts remain normal part/callout quantity evidence,
  not page advisories
- repeat-panel-only pages inside the build span can emit review markers
- BOM, parts-list, and dense table-like pages do not emit review markers
- safe skip does not run before the build span, with `maxPages`, or through
  uncertain page roles
- Build steps shows affected pages as review-only and keeps multiplier controls
  manual
- focused detector, output assembly, session validation, and UI tests pass
- full verification passes before merge

## Validation Notes

- Private acceptance must use real browser upload through `/`, not package-level
  manual replay.
- Alpha22 private replay requires `possible-step-multiplier` advisories on the
  current expected pages: Lower Courtyard pages 31, 164, and 183; Upper
  Courtyard page 59; Hall Tower pages 6, 9, 104, 172, 224, 263, 282, 285, 296,
  and 298; mmannual page 34; farm-house pages 24 and 48; and Animals pages 61
  and 63.
- Known false-positive pages Upper Courtyard 105, 4th-stage 5, Animals 68, and
  Hall Tower BOM/tail pages must stay unmarked. The private replay also records
  conservative Hall Tower tail skips in `skippedPageNumbers`.
