# Product Principles

## Source Of Truth

Bag It is companion guidance. The uploaded MOC manual remains the source of
truth for building, and the app must not generate replacement instructions or
claim catalogue-perfect inventory knowledge.

## User Trust

The fresh MVP should make uncertainty visible. Detected bags are `draft` or
`review`, never implicitly final. Missing callouts, no-callout results,
zero-baggable results, stale detector sessions, unknown quantities, and oversized
bags must produce compact attention states instead of silent empty output.

## Privacy

Private manuals and derived page/crop data belong to the user. Keep analysis in
browser memory for the MVP, persist only through user-triggered session
downloads, and keep private source or derived artifacts out of the repository.

## Workbench Experience

The interface should feel like a dense utility, not a marketing page. Prefer a
single workbench screen with a left upload/status/session sidebar and a right
tabbed work area. Use quiet panels, compact labels, restrained green actions,
clear disabled states, and visible progress.

## Step-First Workflow

The app optimizes for hands-off step-to-bag preparation:

1. Select a PDF manual.
2. Find build-step callouts.
3. Review detected page groups and multipliers.
4. Generate draft bags from detected callout items.
5. Check off physical bag preparation.

BOM discovery, parts-list OCR, catalogue matching, Rebrickable APIs, and
replacement instruction surfaces stay outside the fresh MVP unless a later wiki
decision reintroduces them.

## Engineering Bias

Work one increment at a time. Prefer small, measurable slices that keep CI
green. Keep detector internals observable with fixtures and regression tests
before Bags depends on them.
