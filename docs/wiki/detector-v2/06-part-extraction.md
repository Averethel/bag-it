# Part Extraction

## Goal

Use resolved callout regions to create row-major part items with part-only
crops and separate quantity-label crops.

## Inputs

- visible non-rejected callout region
- page pixels
- callout-local background estimate

## Output

`CalloutPartItem` from `@bag-it/callout-parts`:

- `calloutId`
- `indexOnCallout`
- `sourceRegion`
- `partImage.region`
- `partImage.alphaMask`
- `quantityLabel.region`, `quantityLabel.text`, `quantityLabel.value`, and
  confidence

## Rules

- Part extraction is label-owned: visible raster `/^\d+x$/i` labels inside the
  accepted callout create review rows.
- Accepted callout regions are the only part-scan input. Page-wide part scans,
  native PDF text, source text OCR, BOM data, and catalogue data are not inputs.
- Quantity-label detection thresholds dark pixels against the callout-local
  background, flood-fills glyph components, and applies label/stud rejection.
  Final text/value reading uses a cheap raster OCR pass only on those found
  label crops, padded inside the accepted callout.
- For each accepted raster label, create one row with a separate
  `quantityLabelRegion` and `partRegion`.
- Part crops exclude callout border pixels and accepted quantity-label glyph
  components.
- Alpha masks are extractor output, not app-side preview inference. The app
  crops rendered page pixels from `partImage.region`, applies
  `partImage.alphaMask`, and encodes the preview mechanically.
- Tight crops preserve antialiasing, shadows, studs, and light parts close to
  callout background.
- Part extraction must never search for rows outside the owning callout region.
  This is a hard product constraint: callout detection owns page-wide scanning,
  part detection owns only resolved callout interiors.
- Browser execution may start extracting parts as soon as page-level callouts
  are resolved. Any streamed rows are provisional and must be attached only to
  the final matching resolved callout; rejected or changed callout regions drop
  their provisional rows.
- Final assembly must rerun part extraction on the final accepted callout
  regions. Provisional page-stream rows are progress data and must not be used
  as final Build steps rows.
- Callout acceptance is never downgraded by part extraction. If an accepted
  callout yields zero rows, keep the callout accepted and report a part
  detection failure.
- Ownership zones split same-row labels by neighboring label centers, v1-style.
  Foreground components are scored by label alignment, vertical relation, size,
  and containment before creating the final padded crop.
- Oversized raised candidate rows are rejected as part art only when the same
  callout has a compact lower baseline with multiple quantity labels. This is a
  generic baseline-shape guard for translucent and light parts, not a manual- or
  color-specific exception.
- Close raised sparse or vertically noisy candidate rows above a stronger
  compact lower baseline are also rejected as part art. Candidate labels shorter
  than the supported raster label height are ignored, which prevents light/white
  part outlines from becoming fake quantities.
- Label-like part slivers just above a lower same-column real label are
  rejected only when the lower candidate has comparable confidence. This
  removes part fragments from lower-row part art without letting low-confidence
  fragments suppress real labels above them.
- Same-column raised part marks that nearly touch a compact lower baseline with
  at least two labels are rejected by the same geometry rule. This guard must
  stay generic: no manual ids, step ids, expected counts, color-specific
  branches, source text OCR, BOM data, or catalogue data.
- Browser-scale compact labels are handled as first-class raster OCR shapes:
  six-pixel-high `1` stems, compact `2`/`3` curves, and three-pixel `x` glyphs
  are read by the bounded OCR layer after candidate detection. Candidate
  regions that are taller than plausible printed quantity labels are rejected
  as part/stud fragments.
- Label-sized candidates with consecutive dense horizontal fill bands across
  the candidate mask are rejected as part caps, not text labels. This prevents
  compact studs and curved part fragments from becoming fake `4x`, `6x`, `9x`,
  or multi-digit quantity rows.
- Label-like candidates with dense local foreground continuation immediately
  below the assembled label are rejected as embedded part art. The check happens
  after label candidate assembly, so it filters the full candidate context
  rather than adding manual-specific digit rules.
- X-like pre-`x` glyphs may be used only in uninterrupted multi-glyph label
  geometry; a detected `x` glyph is not allowed to become the next label's
  pre-`x` glyph. This prevents adjacent raster labels from merging into fake
  multi-digit quantities.
- When an x-like pre-`x` glyph sits before a following `x` with no intervening
  pre-`x` glyph, the following `x` owns the label. This preserves multi-digit
  labels such as `12x` while keeping adjacent labels split by their intervening
  pre-`x` glyph.
- Connected-label fallback is reserved for horizontally elongated digit-plus-x
  blobs. Round or stud-like part marks are not split into fake quantity labels.
- Single-pre-`x` candidates that span across two compact same-baseline labels
  are rejected as composite false labels. Real multi-digit labels remain valid
  because their candidate carries multiple pre-`x` glyphs.
- The foreground search band may expand horizontally beyond the midpoint split,
  but only inside the accepted callout interior. This keeps the midpoint as an
  ownership hint instead of a hard crop edge, preventing long parts from being
  cut off on the right while preserving callout-only scanning.
- Same-row neighboring quantity labels also act as stable crop ownership
  bounds. Secondary foreground components closer to a neighboring label are not
  merged into the current row, and final padded anchors are clipped back toward
  the owning label zone with a small allowance for long parts.
- Part alpha masks are constrained to foreground components selected by label
  ownership. Padded image regions may include breathing room, but unrelated
  foreground inside that rectangle remains transparent so neighboring parts and
  callout borders do not leak into previews.
- Tight primary-adjacent foreground fragments may stay with the selected
  component group even when the fragment center is closer to the next printed
  label. This is a local component-adjacency rule for disconnected part edges;
  loose neighboring foreground must remain transparent.
- The v2 app path must not emit `partCrop`. If future masks need richer
  semantics, the extractor emits those mask fields and the app applies them
  without geometry decisions.
- Stable part anchors use conservative horizontal padding and larger vertical
  padding. This keeps low-contrast part fill above a detected dark edge from
  being clipped while avoiding extra left/right neighbor bleed.
- When a saved result has current callouts but stale or missing part rows, the
  part-only rerun must render pages at the saved page-preview width by default.
  Source callout coordinates and rendered page pixels must share one coordinate
  scale.

## Validation

- `partImage.region` does not overlap detected or expected quantity-label
  regions
- crop ownership uses `part-crop-overlaps-label` and `part-crop-cuts-part`
  failures
- row-major ordering is stable across multi-row callouts
- committed tests prove labels and foreground outside the callout region are
  ignored, and every emitted `partRegion` and `quantityLabelRegion` is contained
  by the owning callout
- accepted callouts with zero detected labels or zero part rows are validation
  failures, not callout rejections
- private manual acceptance uses a fresh Playwright browser upload through
  `/v2`; local non-browser render scales are not accepted validation.
- when any local non-browser output disagrees with the rendered `/v2` app, the
  Playwright browser upload path is authoritative. Validate mounted Build steps
  rows and hydrated previews before marking detector tuning complete.
- transparent preview crops remove flat and gradient accepted callout
  backgrounds while preserving part outlines, shadows, light part pixels, and
  long right edges
