# Increment 4: Step Recognition

## Goal

Detect build-step callouts in the original manual and turn them into draft,
page-contained bagging guidance.

## User Value

The user gets bag assignments that preserve manual page boundaries and map back
to the original build callouts.

## Deliverables

- Full non-BOM-page build-step callout detection while callout item crop,
  quantity reading, and color detection are being tuned
- Cropped render per detected step-local callout
- Step-local part type count, visible quantity, estimated color, and item crop
  within each detected callout
- Draft bag rendering in the Bags tab derived from detected step callouts, with
  one checklist row per detected callout part item: completion checkbox,
  quantity, hover-enlarged part crop, bag number, color, and source step number
  with a hover preview of the source callout
- Open-by-default accordion grouping for the draft bag checklist, switchable
  between bag number and one normalized group per detected color name
- Previous callout crop and local match diagnostic cards preserved in the Debug
  tab while step-to-BOM matching is paused
- Separate Build steps tab with one group per scanned step page, page number,
  assigned build-step indexes for detected rows, batched full page preview
  loading, and hover previews for enlarged callout crops
- Per-step bagging multiplier controls in the Build steps tab, defaulting to 1,
  for manuals that print one callout but expect a step to be repeated
- Step coverage diagnostic when BOM quantity is higher than the current
  callout-derived bagging quantity, including BOM, callout, and missing counts
- Page reference and source region per callout
- Callout-first default detection path, with manual step-number assignment kept
  as an optional debug path rather than required for draft bag grouping
- Detector version stored separately from the parts-list extractor version
- Step-only analysis path when saved part analysis is current
- Set-size-aware heuristic bag policy derived from the BOM total quantity when
  available, falling back to detected step-callout quantity
- Local visual grouping for repeated part images across
  5-step windows, based only on callout crops with preserved-aspect mask,
  structure, and color gates
- Rejected local visual candidate crops with per-gate scores and rejection
  reasons visible in the debug panel
- Weak or ambiguous step items kept separate for review rather than folded into
  broad color groups
- Later slices:
  - Step boundary detection
  - Page reference per step
  - Step ordering model
  - Confidence per detected step
  - Detection of missing, duplicated, or suspicious step numbers

## Current-Slice Acceptance Criteria

- The app can detect rectangular build-step callouts across every page that is
  not part of the detected bill of materials.
- The Bags tab renders detected callout part items as a packing checklist table
  with completion checkbox, parsed quantity, part crop with hover enlargement,
  bag number, detected color, and a compact source step number that opens the
  callout crop on hover.
- The checklist can be grouped by bag number or detected color; groups are
  foldable accordions, start opened, and color grouping produces one section per
  normalized color name even when that color appears in multiple bags.
- Detected callout crops, source regions, local grouping diagnostics, and
  rejected local candidate crops remain visible in the Debug tab.
- The Build steps tab renders every scanned step page as a group, including
  pages with no detected build-step rows, with page, assigned build-step index,
  callout columns, visible batched full-page preview loading, and enlarged
  callout crop hovers.
- The Build steps tab is always visible; before current step analysis is
  available it shows pending step-analysis state instead of disappearing.
- Each detected build-step row exposes a multiplier control. The multiplier
  defaults to 1, cannot be lowered below 1, and multiplies every detected item
  in that step for draft bagging quantities.
- Multiplier-adjusted quantities are applied before bag balancing, so changing a
  multiplier can rebalance draft bags while preserving the same-page bag
  containment constraint.
- When the recognized BOM quantity is higher than multiplier-adjusted callout
  quantity, the UI displays a step coverage diagnostic with the BOM quantity,
  callout quantity, and missing quantity.
- Each detected callout reports the number of visible part types and renders
  detected part-image crops with parsed quantity numbers and visual color
  estimates.
- Default step analysis assigns build-step indexes from callout order and does
  not require page-wide step-label OCR.
- Each draft bag part row visibly exposes the detected part crop, parsed
  quantity, detected color, bag number, and source step number for that raw
  callout item.
- The app displays draft bag groups as contiguous callout ranges, with no
  detected callout split across multiple bags and no manual page split across
  draft bags.
- Draft bag groups are marked draft or review, not ready, and review is used
  when quantities are missing or a single range exceeds the heuristic target.
- Same-manual BOM row and Rebrickable preview matching are paused while the
  local same-part grouping baseline is tuned.
- Fixed 5-step user-facing aggregation is replaced by a set-size-aware draft
  bag heuristic. Draft bag rows currently do not group by local visual identity
  or catalogue identity; local visual grouping remains debug-only.
- Debug local image grouping compares only detected callout part crops in the
  same 5-step window, never groups two items from the same step, and requires
  compatible detected color.
- Castle Ramp validation must first show reliable local grouping of same
  callout-rendered parts before BOM row coverage is reintroduced.
- A current saved parts-list analysis can be reused while only step callout
  analysis runs.
- The product does not expose re-rendered manual pages as a user-facing viewer
  or replacement instructions. Build steps may show page previews as validation
  context for detected callouts.

## Later Slice Acceptance Targets

- The app can produce a chronological step list from selected manuals.
- The MVP fixture set reaches at least 95% expected step-number detection in sequence.
- Each step includes source page references.

## Technical Notes

- Step recognition can use internal page images and regions.
- The output should be structured data and focused callout crops, not a
  replacement instruction page or a user-facing PDF viewer.
- Store enough debug metadata to tune recognition later.
- Castle Ramp is the smallest local tuning target. The current pass now scans
  the full non-BOM manual while callout quantity, color, and BOM thumbnail
  matching are evaluated; row-level misses, over-fills, and unmatched items must
  remain explicit and measurable. The `step-callout-detection-v86` tuning pass
  anchors BOM image features from the row's centered quantity/part label,
  removes catalogue preview evidence from the matching decision, and disables
  coverage-completion assignment because quantity-perfect or row-filling
  assignment can still be visually wrong. The `step-callout-detection-v86`
  rebuild keeps quantity labels as item anchors, treats saved session callout
  crops as measurable fixtures, and requires exact detector totals against the
  recognized BOM totals for the local Castle Ramp and Middle Wall sessions.
  Accepted matches must have a strong
  visual profile, a clear margin over the next candidate, and either repeated
  local-image support or extra-high one-off confidence. Weak visual matches must
  stay debuggable through row-level missing, overfilled, and unmatched
  quantities.
- The first quantity reader targets the common visible `Nx` callout label and
  parses the numeric run before the trailing marker. As of
  `step-callout-detection-v86`, `Nx` labels anchor item detection directly:
  the detector finds the nearest foreground component above each trusted label,
  clears only the active label while validating that item, rejects giant
  assembled-model components, and keeps separated part halves together inside
  the label's local zone. A trailing `x` marker is still required before a digit
  run is accepted, only the contiguous digit run immediately before that marker
  is read, no artificial quantity ceiling is applied, narrow and sloped `1`
  glyphs are protected from broad `4` fallbacks, and multi-digit labels keep
  every contiguous digit before the marker. The classifier now has explicit
  2/5/7/8/9 feature guards in addition to the 3/4/6 gates, prefers feature
  reads over weak templates where annotated masks prove the manual shape, rescues
  row-supported single-digit labels on busy part pixels, and rejects narrow
  row-spanning part components before overlap suppression can drop a neighboring
  item. Regression masks and saved-session callout crop validation cover
  annotated `1 -> 4`, `11 -> 1`, `3 -> 9`, `4 -> 3`, `6 -> 8`, `6 -> 9`,
  `10/20/30/36` multi-digit reads, bad marker-only crops, busy-background
  labels, and split-part cases. The crop-quality pass detects the actual inside of the
  callout border before segmentation, clips padded part previews to that
  interior, expands connected foreground beyond a label midpoint so wide parts
  are not cut off, and stops that expansion before it crosses another same-row
  quantity label center. Displayed previews, color sampling, and local image
  features then use the dominant connected foreground component inside the
  owned part region so thin neighboring-part edges do not pollute the crop.
  Part-region ownership is scored against every quantity anchor so stacked
  callout items keep the component nearest their own label instead of borrowing
  the part or label region above them. All detected quantity-label glyph regions
  are excluded from every displayed part crop so tall-part preview expansion
  cannot leak a previous item's quantity label. Strongly overlapping part
  regions are treated as same-row neighbors even when their quantity labels are
  vertically staggered, and preview expansion clips at the midpoint between
  neighboring part crops so adjacent wide plates remain separate. Borderless
  non-blue model fragments are rejected before quantity-anchor detection,
  page-level callout candidates must show the expected blue callout-fill
  evidence, quantity-like part texture just above a real lower-row label is
  discarded, and broad connected row blobs fall back to a label-local foreground
  search so top-row items are not lost.
  Broader quantity formats still need fixture-driven tuning before the
  whole-manual pass.
- As of `step-callout-bagging-v4`, the bag heuristic groups detected callouts
  by manual page before it decides bag boundaries. A page group can exceed the
  normal target and enter review, but it is not split across physical bags.
  Undersized bags are still merged into the previous bag when possible, and
  truly tiny bags are folded into the previous review range when needed.
  User-selected per-step multipliers adjust callout quantities before this
  heuristic runs, but do not alter the raw detected callout item data.
  Multipliers are saved in user-owned session bundles alongside current step
  analysis and are dropped when the saved step analysis is stale or structurally
  invalid.
- As of `step-callout-detection-v104`, the default detector returns to
  callout-first region detection for performance. Printed step-label OCR and
  label-anchored non-blue callout search remain available behind an explicit
  debug option for manuals where the callout-only path is insufficient. The
  callout-first path also proposes tiny bordered blue one-part callouts from
  their actual rectangle structure: paired dark or soft anti-aliased borders,
  expected blue interior fill, and either an `x`-delimited quantity label or
  nearby printed-step glyph evidence are enough evidence even when the part
  itself is too small or light to provide separate dark foreground. Weak tiny
  rectangles still need strong rectangle evidence plus parsed quantity-anchored
  part items before they can enter Build steps. Zero-part rectangle candidates
  remain internal detector evidence only, even when they look visually
  callout-like. The part-item cropper accepts isolated single-item `Nx` labels
  on busy part pixels when a foreground part image sits above the label, and the
  quantity classifier distinguishes compact lower-courtyard `9x` labels from
  open `4x` glyphs. This keeps small one-part callouts while rejecting model
  geometry fragments that look like small bordered rectangles but do not contain
  parsed callout part items. The part-only preview cropper rejects thin or
  bright-connected right-edge callout rule components in addition to top and left
  rule fragments, and clamps frame-inflated rightmost crops back to the detected
  part, so rightmost black parts do not keep the callout border in their
  checklist image.
- Visible part color estimates should bias toward locally supported part
  surface pixels so outlines, shadows, and detail lines do not dominate small
  parts.
- Step-to-BOM and Rebrickable matching are paused in the primary bag checklist.
  The previous match-oriented callout cards remain available under Debug so the
  matching work can resume without reintroducing wrong catalogue labels into the
  default bagging view.
- Displayed callout item previews use the part-only crop with the sampled
  callout background removed. Quantity text is kept as separate structured data
  with its own quantity-label crop so color sampling and local visual grouping
  are not polluted by label glyphs or callout borders.
- Draft bag rows currently represent raw detected callout part items, not local
  callout part groups or catalogue identities. The app should avoid showing
  confident-looking BOM or Rebrickable labels until the matching baseline is
  reliable.
- Draft bag checklists show quantity-weighted completion progress for the
  whole checklist and for each group accordion. Bag grouping preserves sortable
  rows, while color grouping disables row sorting and inserts bag dividers so a
  user working from a color-sorted pile can see when the target bag changes.
- Visible callout quantity and color are prerequisites for grouped callout
  images. Color must also be a grouping constraint: strong color mismatches
  should prevent local callout-image merges.
- Local image grouping requires near-identical silhouettes and the same detected
  color. The current debug matcher segments foreground, excludes trusted
  quantity glyph pixels, letterboxes the foreground into a canonical grid
  without stretching aspect ratio, compares mask, structure, detail, aspect,
  coverage, compactness, embedding, and color signals with small translation
  tolerance, and clusters only mutually strong pair matches. Edge silhouette is
  not currently used as a local grouping signal because it over-penalized noisy
  manual crops. Detected color name is a hard local grouping gate; differently
  colored items are skipped before visual scoring and do not appear as rejected
  local candidates.
  The same rendered part in different colors stays separate, and dense but
  differently proportioned parts such as plates and bricks do not merge just
  because both are solid foreground shapes.
- Rejected local-image candidates are stored on the item as bounded debug data:
  the app keeps the closest rejected candidates, their crops, their scores, and
  the first failed gate so missing local groups can be tuned without restoring
  BOM/Rebrickable matching.
- Trusted quantity-label glyph pixels should not contribute to local part-image
  grouping or color sampling when the detected quantity text overlaps the
  detected part crop. The source callout remains available on hover and in
  Debug so transparent foreground previews do not hide bad source regions.
- Bagging research snapshot as of 2026-05-19:
  - LEGO support notes that most sets use numbered bags, and large sets may
    have several bags with the same number.
  - Public reviews show small sets around 176 pieces with 2 numbered bags, 424
    parts with 5 numbered bags across 3 stages, and 617 pieces with 6 numbered
    bags.
  - Larger adult sets vary more: examples include 1,483 pieces across 5
    numbered stages with multiple physical bags per stage, 2,022 pieces across
    10 numbered stages, and 2,540 pieces across 23 numbered bags but 5 broader
    build sections.
  - Therefore Bag It's draft heuristic targets physical prep bags, not LEGO's
    broader numbered-stage labels: small sets bias around 45-75 parts, medium
    sets around 70-110, large sets around 90-140, and huge sets around
    100-160, with the displayed step count derived from detected parts per
    callout and no step split allowed.

## Open Questions

- How should substeps or alternate numbering formats be represented?
- How should pages with multiple steps be modeled?
- What should happen when step numbers are missing?
- Which non-`Nx` callout quantity formats appear in the fixture manuals?
- How should ambiguous visual matches be reconciled once whole-manual step
  recognition and ready bag assignment are active?
- Should the draft bag target ranges become user-configurable after recognition
  confidence is high enough?
