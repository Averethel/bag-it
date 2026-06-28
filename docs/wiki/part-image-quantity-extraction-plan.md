# Part Image And Quantity Extraction Plan

## Status

Implemented fresh deterministic package extractor for Increment 3. This page
keeps the research context, accepted approach, validation expectations, and
open follow-up decisions for exact part images and quantity labels from
already-detected build-step callouts.

The local private known-good manuals were used only for observation. No private
PDFs, page renders, callout crops, part crops, exact private coordinates, or
row-level debug output should be committed.

## Goal

For each accepted build-step callout, emit one item per visible part:

- a `partImage.region` rectangle around the exact part image section
- a `partImage.alphaMask` that removes callout background mechanically
- a separate `quantityLabel.region`
- an exact `quantity.text` and `quantity.value` parsed from a visible
  `/^\d+x$/i` quantity label below the part
- no quantity-label glyph pixels inside the part-only crop

The app must render previews only from `partImage.region` plus
`partImage.alphaMask`; it must not duplicate geometry, matte, or ownership logic
outside the extractor.

## Non-Goals

- Do not identify catalogue part ids.
- Do not use BOM, parts-list OCR, Rebrickable, or inventory pages.
- Do not require server-side OCR or upload private pages to a service.
- Do not use extracted part images as replacement build instructions.
- Do not let zero-part visual callouts enter Bags.

## Current State

The current v2 detector finds accepted callout rectangles from border,
background, and quantity evidence. Part extractor `2.0.0-alpha.162` lives in
workspace package `@bag-it/callout-parts` and runs a label-owned item pass
against accepted callout regions only. It uses visible raster `Nx` labels as row
anchors, creates one row per accepted label, assigns foreground from a
callout-local row band, scores ownership against the label, rejects border and
label-halo residue before ownership, probes each callout background as flat,
gradient, or mixed before accepting broad fill-gradient buckets,
emits separate quantity-label regions plus stored `partImage.region` and
`partImage.alphaMask`, uses source-feature `5` recognition before closed-loop
digit fallbacks, keeps extra bottom-only breathing room for compact part image
crops, and keeps `/v2` preview hydration on the stored package mask plus flat
mask only.
Candidate detection still finds likely label shapes and applies label/stud
rejection. A small raster OCR layer then reads the final `/^\d+x$/i` text/value
from the already-found, padded label crop; it does not scan outside accepted
callouts and does not use PDF/native text OCR. The OCR implementation is split
into focused feature extraction, source-shape classifier, template classifier,
connected-label splitting, and ordered classifier modules while preserving the
single `readQuantityOcr(page, glyphs)` contract.
Quantity candidate detection is likewise split behind the unchanged
`findQuantityCandidates(page, calloutRegion, background)` contract: candidate
assembly, label-shape gates, part-art rejection, row clustering, and overlap
suppression each live in focused modules.
Part-image foreground extraction now keeps `createPartImageForLabel(...)` as the
entry point while moving flood-filled foreground components, component
eligibility, ownership scoring, related-component selection, crop padding, and
label mask exclusions into focused modules.
The same-row ownership midpoint is an assignment hint, not a hard crop edge, so
long parts are not sliced at either side. Label-owned search spans a wider
callout-local row band, and final preview regions keep enough label-row
vertical span for tall parts and light studs. Quantity-label regions are
expanded only as alpha-mask exclusions, so stored part regions can overlap the
label row without leaking label text into previews. The bounded OCR reader
distinguishes dense antialiased open `4` glyphs from closed-loop `8` glyphs by
using the strong crossbar and filled-center shape before accepting an `8`. It
also treats thick or slanted one-stem labels as `1`, distinguishes
browser-scale `3`, cropped-top `5`, `6`, and `9` glyphs by reusable raster
shape features, and candidate rejection drops raised part-shaped glyph rows
that mimic quantities when lower compact labels establish the real baseline. It
also rejects close raised sparse/noisy candidate rows and too-short label-like
fragments from light part art. Same-column label-like part slivers above a
lower real label are rejected when the lower candidate is comparable
confidence, preventing Step 41-style extra rows without letting low-confidence
slivers suppress real labels above them. The same generic rule covers
same-column raised part marks that nearly touch a compact lower baseline; it
does not use manual ids, step ids, expected counts, color names, source text
OCR, BOM data, or catalogue data. It also handles compact browser-scale `1`,
`2`, `3`, and
`x` raster shapes before broad fallback rules and rejects part-sized stud/top
fragments by candidate label height. It rejects label-sized dense cap masks as
part art, so compact studs and curved part fragments do not become fake `4x`,
`6x`, `9x`, or multi-digit quantity rows. It also rejects label-like candidates
whose local foreground mask continues immediately under the assembled label,
which indicates part art rather than printed text, and it keeps the real
following `x` anchor for multi-digit labels such as `12x`. Alpha 22 narrows
x-like digit ownership to uninterrupted multi-digit labels, trims one bridge
column while splitting connected digit+x blobs, and rejects connected split
candidates whose local mask still has dense part-cap bands. Alpha 25 moves
final text/value parsing into the bounded raster OCR reader while preserving
the existing candidate and rejection layers. Alpha 26 removes digit-value
classification from candidate assembly and suppression; candidate detection is
geometry-only and OCR owns digit reads. Alpha 27 clamps preview matte source
crops to the accepted callout interior so outer callout border pixels stay out
of part thumbnails. Alpha 28 reads dense-bottom closed-loop `8x` labels as
`8x`, not `2x`. Alpha 29 drops secondary thin vertical source-edge components
from the preview matte so thick callout side borders do not remain in part
thumbnails. Alpha 30 restores the bounded OCR digit-classifier contract and
clips padded stable part anchors back toward same-row label ownership zones, so
close neighboring parts do not become duplicate foreground in each other's
rows. Alpha 35 adds source-shape `9` OCR before broad template fallback,
rejects tiny label-ink fragments, drops unreadable canonical-scale labels after
high-resolution extraction is scaled back to `/v2` coordinates, and uses
symmetric label-owned search and mask padding. The mask explicitly zeroes all
quantity-label regions, so transparent label-adjacent breathing room can survive
alpha masking without showing quantity glyphs or broad empty preview whitespace.
Alpha 41 keeps that package-owned output but rejects more part-art quantity
candidates: high-value tiny outliers, dense non-glyph foreground inside a
candidate region, and close raised rows above compact real labels. The temporary
base-render row fallback from this tuning pass was removed because it could
reintroduce part art as fake quantity labels; high-resolution browser-rendered
part extraction owns all emitted rows. Alpha 48 separates row-band/label
ownership into a named part ownership module and keeps tight primary-adjacent
foreground fragments with the selected component group when adjacency shows
they belong to the same part, even if the fragment center is closer to the next
printed label. Loose neighboring foreground remains transparent because alpha
masks still use only selected components.
Alpha 49 keeps that ownership model and adds extra right-side padding after
alpha-bound trimming, so compact parts near their right edge are not visually
cropped in stored previews while non-owned foreground remains transparent.
Alpha 59 keeps bounded raster OCR in the extractor and classifies connected
closed-lower-loop `8x` labels before the source `9` fallback using source glyph
loop density and lower-left/lower-right closure. It does not use manual ids,
page ids, step ids, expected counts, source text OCR, BOM data, catalogue data,
or color-specific branches.
Alpha 62 keeps source-feature `7` before source `2`, source `3` before
closed-loop `8`, expands same-row search across the callout interior so long
parts are not sliced by label midpoints, rejects far-from-fill background
buckets, keeps owned/supported near-background part pixels opaque, and removes
app-side preview background scrubbing.
Alpha 63 preserves near-background top faces and studs before alpha trimming,
classifies crossed/stroked browser-raster `2x` labels before the broad `4x`
fallback, accepts high-resolution multi-digit `12x` labels through the width
gate, and constrains crowded wide labels so they do not borrow neighboring
same-row part components.

Part extraction is raster-only. Native PDF text, source text OCR, BOM data,
catalogue data, and page-wide part scans are not inputs. Part extraction never
downgrades an accepted callout; if an accepted callout has zero rows,
validation reports a part detection failure.
The extractor reports accepted quantity labels that cannot produce an emitted
part image as `part-crop-missing`, separately from callouts that have no
readable quantity labels at all.
Restored sessions with current callouts but missing or stale part extraction
rerun only this part extraction pass. The rerun renders pages at the saved
page-preview width by default. Saved callout coordinates, detector pixels, and
private replay pixels must use one coordinate scale; mixing saved 1080-wide
callout boxes with a 1400-wide rerender is invalid and can create fake labels
or wrong part crops.
During fresh uploads, page-streamed part rows are provisional progress only.
Final output reruns part extraction from the final accepted callout regions
instead of reusing page-local provisional rows by candidate id.

Part-row preview images are generated from a second browser page render when
that render can be meaningfully larger than the detector render. Detector
geometry, row ordering, session anchors, and masks remain extractor output in
the original scan coordinate system; only the PNG data for quantity-label and
part-image previews uses the higher-resolution pixels.
The previous v2 app-side `partCrop`/preview-matting path has been removed from
the v2 path. Preview hydration crops rendered page pixels from
`partImage.region`, applies `partImage.alphaMask`, and encodes PNG bytes only.

## Observed Callout Geometry

Known-good callout crops show these stable patterns:

- Callouts usually have a dark outer border and a mostly uniform light fill.
  Page and callout background styles vary, including one small-manual style
  that differs from the larger blue-fill samples.
- Background variation is not the hard part at item-extraction time. The
  detector has already accepted the callout and inferred its background color,
  so part detection should use that known callout-local background instead of
  guessing from the page.
- Each item is a vertical stack: part thumbnail above, quantity label below.
- Quantity labels are dark, high-contrast raster glyphs in the form `1x`,
  `2x`, `3x`, `4x`, `6x`, or multi-digit values in fixtures.
- Label center normally aligns with the owning part center, but part thumbnails
  may be wider, taller, or angled relative to the text.
- Callouts range from tiny one-row strips to tall multi-row grids.
- Rows can contain different part sizes. A row may include small bricks, long
  plates, tall panels, and thin accessories in the same callout.
- Very dark parts can look like label ink. Light gray parts can be close to the
  callout fill. Segmentation must use both foreground contrast and edge/outline
  evidence.
- Large black step numbers may sit beside callouts but are outside the accepted
  rectangle or should be excluded by the existing leading-gutter trim.

## Implemented Pipeline

Run this pipeline for each accepted `DetectedStepCallout`.

1. Build callout-local masks.

   Clamp to the callout interior, excluding the outer border band. Use
   `callout.inferredBackground.rgb` as the primary fill color. A local fallback
   can sample low-foreground interior pixels, but only as a sanity check against
   the already-known callout background. Build two masks:

   - `quantityInkMask`: dark, high-contrast pixels likely to be text glyphs.
   - `partForegroundMask`: pixels that differ from fill, plus dark outlines and
     edge-supported light foreground. Exclude border pixels and later exclude
     accepted quantity-label regions.

2. Detect quantity labels.

   Use only raster label glyphs inside the accepted callout:

   - detect `x` glyph candidates with diagonal/cross shape checks
   - collect one or more aligned digit glyph components to the left of the `x`
   - classify digit components after normalizing their bitmap to a fixed grid
   - assemble text as `<digits>x`
   - reject candidates whose label center is not in the lower part of an item
   - recover connected label blobs and digits touching nearby part pixels only
     from bounded local raster windows
   - prefer label-shaped components over part-bleed strips
   - suppress overlapping labels by confidence

   The raster path accepts the callout-local background and returns the actual
   digit string and confidence instead of a placeholder value.

3. Cluster labels into rows.

   Sort labels by y-center and cluster rows with a tolerance scaled by glyph
   height. Within each row, sort by x-center. These ordered labels define the
   item read order and the horizontal ownership cells.

4. Assign foreground to labels.

   For each label, create an ownership cell:

   - left/right bounds from midpoints between neighboring label centers, clamped
     to the callout interior
   - bottom bound just above the label region
   - top bound from the previous label row's lower label band, or callout top
     for the first row

   Inside the cell, find foreground components above the label. Use light
   dilation/closing so separated studs, outlines, and highlights become one
   logical part candidate. Assign components by score, not containment alone:

   - horizontal distance to the label center
   - vertical gap above the label
   - overlap with the label-centered search band
   - component size relative to callout and row
   - penalty for touching another label region

   This avoids cutting long angled parts while keeping adjacent items separate.

5. Create tight part crops.

   Union the assigned part components and emit the bounding box with small
   scaled padding. The crop must:

   - stay inside the callout interior
   - include antialiased edges and shadows
   - exclude all accepted quantity-label pixels
   - exclude the outer callout border
   - minimize background by using the component bounding box, not the full
     ownership cell

   No fake fallback success is allowed. If no label-owned part can be assigned,
   keep the callout accepted and leave it with zero rows for validation.

6. Emit `DetectedStepCalloutPartItem`.

   Use row-major order for `indexOnCallout`. Emit:

   - `sourceRegion`: union of part crop and quantity label region
   - `partRegion`: tight part-only crop
   - `quantityLabel.region`
   - `quantity.text`, `quantity.value`, and confidence
   - item confidence from label read, part assignment, and crop quality

   If the label is readable but part assignment is weak, keep the item visible
   in Build steps with review confidence. Bags should mark unknown or weak
   quantities as review, consistent with the Quantity Gate.

## Current Private Validation Note

MOC-129110 replay currently keeps the 33 accepted callouts and reports zero
accepted callouts with zero rows. It emits 76 part rows because the visible
raster labels across those accepted callouts total 76. The earlier BOM-derived
sanity target of around 63 rows is retained as a warning signal only; this
pipeline treats visible raster callout labels as source of truth and does not
discard real labels to match BOM row count.

## Digit Classifier

Use a deterministic browser-safe micro-classifier before considering any heavy
OCR dependency.

Recommended implementation:

- normalize each digit glyph to a small bitmap, such as `12x18` or `16x24`
- compare against generated templates for digits `0-9` at several font sizes
  and weights
- add simple topology features: aspect ratio, density, holes, horizontal and
  vertical stroke projections, endpoint count, and diagonal density
- classify multi-digit labels by reading components left-to-right before the
  `x`
- return `null` when the top two scores are too close

Fixtures must cover at least `1x`, `2x`, `3x`, `4x`, `6x`, `8x`, `10x`,
`12x`, and another two-digit value. Multi-digit fixture accuracy should remain
100%.

## Validation Plan

Shared fixture validation:

- Extend `quantity-and-crop-units` with dark parts, light gray parts,
  long/tall parts, small accessories, multi-row callouts, and multi-digit
  quantities.
- Add targeted glyph-mask unit fixtures for all digits and `x`.
- Keep `part crop ownership` checks: detected part crop must not overlap
  detected or expected quantity-label regions.
- Add a crop tightness metric: part crop may include only a bounded background
  margin around foreground pixels.

Private validation:

- Add an ignored replay/debug script that exports per-callout overlays showing
  label boxes, owner cells, assigned foreground, and final part crops.
- Run it against the existing user-approved known-good sessions.
- Store exports only under `.bag-it/private/**` or `/private/tmp`.
- Review the same classes observed locally: tiny strips, tall multi-row grids,
  dark parts, light gray parts, and large step-number-adjacent callouts.

Focused commands after implementation:

```text
npm run test:steps-fixtures
npm test -- packages/step-callouts/src/__tests__/detector.test.ts src/components/bagging/bagging-app.test.tsx
npm run benchmark:steps -- --pages 400
```

Use browser/Webwright validation when Build steps or Bags rendering changes.

## Acceptance Criteria

- Private raster manuals no longer produce zero `partItems` when callouts have
  visible `Nx` labels.
- Quantity reads are exact on shared fixtures, including multi-digit labels.
- Part-only crops never include quantity-label glyph pixels.
- Tight crops preserve dark part edges and light gray parts close to the
  callout background.
- Multi-row callouts retain correct row-major ordering.
- Zero-part diagnostic callouts remain excluded from Bags.
- No private manual images, exact private coordinates, or crop outputs are
  committed.

## Open Decisions

- Alpha-masked part images are now used for previews. The extractor may render
  from a padded source crop to avoid clipped edges, then trims the emitted
  preview image and preview region to the retained connected part alpha bounds.
- Whether low-confidence readable labels should create review items or keep the
  callout zero-part. Recommendation: create review items only when both a
  readable label and plausible part foreground exist; otherwise keep zero-part
  diagnostics out of Bags.
