# Increment 6: Bags Checklist

## Status

Complete. The Bags tab renders draft bag plans as a quantity-weighted checklist
with row completion, bag/color grouping, two-lane same-part grouping, previews,
and session restoration.

## Scope

Deliver:

- bag-grouped checklist rows
- color-grouped checklist view
- same-part grouping inside bag view through `@bag-it/part-matching`
- quantity-weighted progress
- row checkbox state
- checked row persistence in explicit session files
- completion transfer by coordinate anchors after detector reruns
- part, quantity-label, page, and source-callout hover previews
- large-list rendering protections, including worker-precomputed same-part
  groups and an always-present Processing status `Part grouping` progress row
  so toggling `Group parts` does not run matcher work on the click path
- bounded runtime part-mask crop sources and cached page preview image decoding
  so same-part grouping preparation does not repeatedly decode the same page or
  send full-resolution crop pixels to the scorer

## Out Of Scope

- catalogue-backed part identity or user-confirmed permanent part identity
- catalogue-backed part identity
- automatic browser persistence outside explicit session download/import
- user-facing debug workbenches for private same-part labels

## Acceptance

- checklist remains responsive with large detected row counts
- bag and color grouping preserve row semantics
- same-part grouping never changes saved row identity
- same-part grouping is prepared in a Web Worker with its own Processing status
  progress row, and the toggle remains display-only; the toggle is disabled
  until preparation finishes
- checked state survives tab remounts and current-session restore
- stale detector reruns transfer completion only when one confident coordinate
  match exists
- row sorting does not break bag grouping semantics

## Validation Notes

- Component and unit coverage exercises bag checklist rendering, quantity-
  weighted progress, color grouping, same-part grouping, multiplier-driven
  bag recalculation, session restore, and completion-anchor transfer.
- The current full validation gate remains `npm run verify`.
