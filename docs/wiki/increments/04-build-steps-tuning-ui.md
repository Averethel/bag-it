# Increment 4: Build Steps Tuning UI

## Status

Complete. The Build steps tab now renders the browser detector result as a
reviewable page-by-page workbench with previews, visible part rows, step
multipliers, and compact attention states.

## Scope

Deliver:

- scanned page groups for every page represented by detector output
- zero-callout and zero-part callout states
- page, callout, part, and quantity-label previews
- hover/focus enlargement for page, callout, quantity, and part crops
- per-callout multiplier controls
- immediate total and row quantity updates after multiplier changes
- possible outside-callout multiplier advisories
- stale-session and preview hydration state handling

## Out Of Scope

- user-facing full PDF viewer
- manual page replacement instructions
- BOM, Rebrickable, catalogue, or parts-list OCR surfaces
- automatic multiplier application from outside-callout advisories

## Acceptance

- Build steps renders every scanned page from the active analysis
- zero-callout pages remain visible
- accepted callouts with detected rows show quantity, part, color, and source
  reference data
- multiplier changes update visible totals and bagging input immediately
- preview hydration does not block detector geometry from becoming usable
- diagnostics stay compact and do not become a replacement PDF reader

## Validation Notes

- Component coverage exercises page/callout previews, quantity crops, part
  crops, color columns, multipliers, no-baggable callouts, collapsible page
  groups, and preview hydration behavior.
- The current full validation gate remains `npm run verify`.
