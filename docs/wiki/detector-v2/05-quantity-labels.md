# Quantity Labels

## Goal

Read visible part quantity labels exactly when possible and return unknown when
not possible.

## Inputs

- accepted callout region
- page pixels
- callout-local background estimate

## Output

`StepDetectorV2QuantityLabel`:

- `pageNumber`
- `region`
- `text`
- `value`

## Rules

- Valid label shape is visible raster glyphs for one or more digits followed by
  `x`.
- Native PDF text items are not a fast path, fallback, or hint for part labels.
- Raster parsing is deterministic and browser-safe. Candidate detection and
  label/stud rejection remain separate from final text reading.
- The cheap OCR layer reads only already-found candidate label crops, padded
  inside the accepted callout. It parses the crop into `/^\d+x$/i` text/value
  and never performs page-wide detection.
- Candidate detection does not classify pre-`x` glyphs into digit values.
  Detection may use glyph geometry, `x` anchors, row baselines, and foreground
  continuation only; OCR owns digit-value classification.
- `raster-glyphs.ts` owns mask/component primitives and `x`-anchor geometry.
  `quantity-digit-classifier.ts` owns digit classification and is used only by
  the bounded quantity OCR layer.
- Ambiguous labels are rejected for part-row creation; never guess from text,
  BOM, or catalogue context.
- Quantity labels outside accepted callouts are review-only multiplier
  advisories, not part rows.
- The parser must handle proportional manual glyphs, dense antialiasing,
  connected `Nx` blobs, and digits that touch nearby part pixels. These are
  still raster-only cases and must be covered by synthetic shape tests before
  being accepted in private browser validation.
- Dense antialiased `4` glyphs may have dark pixels in all corner bands because
  of sloped strokes and shadowing. The classifier treats a strong middle
  crossbar plus dense center as an open-four signal before accepting a
  closed-loop `8`.
- Dense-bottom closed-loop `8` glyphs remain `8`, not `2`. A full lower stroke
  is only a two signal when the lower-left stroke clearly dominates the
  lower-right stroke.
- Thick or slanted one-stem glyphs with a foot classify as `1`, not as `4`,
  `8`, or `9`.
- Part-shaped dark components can accidentally form digit-like blobs near an
  `x` glyph. Candidates raised above the dominant same-row label baseline are
  rejected when lower real labels provide the row evidence.
- Wide, low-confidence single-digit candidates raised above multiple compact
  baseline labels are rejected as part art. This protects callouts where two
  small parts plus nearby `x`-like strokes otherwise become a fake quantity row.
- Label-sized candidates whose raster mask has consecutive dense horizontal
  fill bands are rejected as part caps. This protects compact studs and curved
  part fragments that are the same size as real quantity labels.
- A candidate whose local foreground mask continues immediately below the
  assembled `Nx` glyphs is rejected as embedded part art. Real printed quantity
  labels may have part pixels above them, but they should not have dense part
  foreground directly underneath the text baseline.
- If a pre-`x` glyph before the real `x` is also x-like, a following `x` on the
  same baseline owns the label unless another pre-`x` glyph starts the next
  label between them. This keeps `12x` from collapsing to `1x` without merging
  adjacent labels.
- X-like pre-`x` ownership is limited to uninterrupted multi-glyph labels. A
  previous label's `x` cannot be reused as a pre-`x` glyph for the next label.
- Connected digit+x blobs may trim one bridge column from the `x` side before
  split scoring. This keeps compact `6x` labels from becoming `5x` when
  antialiasing touches the digit to the `x`.
- Connected split candidates whose local raster mask contains consecutive dense
  part-cap bands are rejected as part art. This rejects stud tops and part
  edges without rejecting separate dense glyph labels.
- High-resolution renders can make real separated labels, especially tall
  one-stem `1x` labels, exceed the old browser-scale bounding-box area cap. The
  area cap allows compact separated one- and two-digit labels to keep the full
  raster glyph region instead of falling through to attached-digit trimming.
- Alpha 26 keeps final quantity text/value reading in the bounded OCR layer,
  so detection can stay focused on finding plausible label regions and
  rejecting label-like part/stud fragments. Detection no longer runs fragile
  raster digit-value classification while assembling or suppressing candidates.
- Alpha 28 keeps dense-bottom closed-loop `8x` labels from falling through to
  the two fallback while preserving sloped `2x` labels with a left-heavy lower
  stroke.
- Quantity validation must use the same render scale as the source callout
  coordinates. Wrong-scale callout crops can place unrelated part pixels near
  label glyphs and create fake quantities.

## Validation

- committed fixtures cover one-digit and multi-digit quantities, including
  `1x`, `2x`, `3x`, `4x`, `8x`, `10x`, `12x`, connected `2x`, sloped `2x`,
  dense-bottom `8x`, connected bridged `6x`, rounded `3x`, stylized `4x`,
  dense open `4x`, thick `1x`, slanted wide `1x`, and rejection of part-shaped
  fake `7x`
- `quantity-missing` and `quantity-wrong` failures are separate
- multi-digit fixture reads are exact before part extraction uses the labels
