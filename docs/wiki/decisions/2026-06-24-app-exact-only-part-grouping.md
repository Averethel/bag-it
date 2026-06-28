# App Exact-Only Part Grouping

## Status

Accepted.

## Context

The Bags UI has a useful `Group parts` interaction: it keeps bag accordions and
raw checklist rows intact while adding expandable group header rows inside the
same table. The package boundary for `@bag-it/part-matching` is also useful
because app UI, private reports, and future model experiments need the same
row-shaped contract.

The deterministic visual near matcher did not meet the product safety bar.
Manual app review found false positive same-part groups on labeled Ramp data
even after private pair gates passed. A missed group is tolerable because the
user searches twice; a false group is harmful because it can put wrong parts in
a physical bag.

The project has six days to wrap the MVP, so the near-match path must stop
consuming product time unless it can produce a clearly safer matcher family.

## Decision

Keep:

- the `Group parts` Bags UI toggle
- expandable group header rows inside the normal bag checklist table
- raw row ids, checked state, completion anchors, and session shape
- the pure `@bag-it/part-matching` package boundary and row/group interfaces
- private same-part reports, labels, and candidate-generation scripts

Change:

- app-visible same-part grouping is exact-digest only
- the app must not enable deterministic label-gated near matching
- packaged or ignored scorer configs do not affect checklist output
- deterministic near scoring is private analysis/training tooling only

Next experiment:

- train or evaluate an ML pair scorer that answers whether two rendered part
  crops are the same physical part
- use existing labels, excluded singleton rows, hard-negative decisions, and
  generated candidate queues
- keep the ML scorer private until it passes the two-lane promotion gate and
  visual app review on labeled manuals. Silent auto grouping still requires
  zero known false positives; lower-confidence suggestions may tolerate less
  than `0.5%` measured correction burden when the app provides explicit
  confidence UI and fast split/reject controls.

## Consequences

The MVP can ship a safe but sparse grouping feature. Exact duplicates may be
rare because manual rendering and extraction drift often change crops, but the
feature will not create known wrong bags.

Private tooling stays useful for the ML spike. If the ML scorer does not clear
the auto-safe or reviewed-suggestion gate quickly, same-part near grouping
remains out of MVP scope.
