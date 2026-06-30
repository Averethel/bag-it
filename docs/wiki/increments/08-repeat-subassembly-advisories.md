# Increment 8: Repeat Subassembly Advisories

## Status

Active. This branch implements raster-only page advisories for possible repeated
subassembly panels. Alpha20 improves advisory accuracy with internal page-role
gating, lower-left attached-label OCR, BOM/table-like false-positive rejection,
and a conservative trailing-BOM safe skip. The increment remains active until
integration review and private real-browser checks accept the Lower Courtyard
and Hall Tower examples.

## Scope

Deliver:

- detector-owned page advisories for possible repeat-subassembly multipliers
- raster-only outside `Nx` label detection through `@bag-it/raster-quantity-labels`
- no native PDF text or source text OCR dependency
- Build steps page review marker using existing `possible-step-multiplier`
  attention kind
- no automatic multiplier, bag quantity, part row, or completion-anchor changes
- synthetic unit coverage for positive and negative advisory cases
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
- Lower Courtyard page 31 and Hall Tower pages 296 and 298 are the current
  private examples to inspect before closing this increment.
