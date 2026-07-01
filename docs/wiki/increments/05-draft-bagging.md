# Increment 5: Draft Bagging

## Status

Complete. Detected callout rows now feed `step-callout-bagging-v6`, which
creates draft physical bag plans from browser-detected quantities and source
geometry without requiring BOM or catalogue input.

## Scope

Deliver:

- detected-quantity set-size fallback when no inventory count is supplied
- contiguous callout ordering by page and source position
- page-contained bag boundaries
- section-aware bag splitting from scanned pages, zero-baggable pages, zero-part
  callouts, and detector section boundary hints
- callout multipliers applied before balancing
- stable bag ids and row ids
- review reasons for unknown quantities
- no-baggable-callouts attention state

## Out Of Scope

- final or official LEGO bag reconstruction
- catalogue identity, spares, or inventory reconciliation
- splitting a manual page across generated bags
- automatic use of BOM OCR or Rebrickable data

## Acceptance

- bags are contiguous in detected callout order
- no manual page splits across bags
- zero-baggable results produce no bag plan and show an attention state
- multipliers rebalance generated bags before rendering
- unknown quantities mark affected bags for review
- section cues influence boundaries without overriding page containment or the
  soft hard cap

## Validation Notes

- Unit coverage exercises detected-quantity policy, oversized page containment,
  undersized bag merging, section cues, multipliers, row identity, completion
  anchor transfer, and ambiguous-anchor drops.
- The current full validation gate remains `npm run verify`.
