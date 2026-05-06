# Bag Size Research

Date: 2026-05-06

## Summary

Recommended default:

```text
Target 50 pieces per bag, with a normal acceptance range of 40-60 pieces.
Also close a bag early around 28-30 quantity callouts.
```

This keeps bags small enough for manual packing and review, while still covering
a useful amount of build progress. In the representative PDFs, a 50-piece target
produced an outlier-trimmed average of 46.44 pieces and 8.57 build steps per
bag. 88.1% of generated bags landed in the 40-60 piece range.

The important adjustment is not to use piece count alone. The manuals do not
expose reliable part IDs or dimensions through embedded text, so this research
uses quantity callouts as a conservative size and sorting proxy. A bag with 45
pieces spread across 32 callouts is harder to pack and use than a bag with 55
pieces across 12 repeated small-element callouts.

## Inputs

The analysis used 11 local PDFs from:

```text
/Users/neithan/Downloads/research
```

The PDFs were not copied into the repository. No rendered manual pages, page
images, crops, or OCR output were persisted.

One-off processing files:

- `artefacts/manual_bag_size_research.py`
- `artefacts/manual-bag-size-analysis.json`

## Method

The script extracts embedded PDF text with `pypdf`, then:

1. finds the dominant ordered build-step number run per PDF;
2. extracts `Nx` quantity callouts from instruction pages;
3. assigns callouts to the nearest detected step anchor on the same page;
4. simulates ordered bag allocation for target sizes of 40, 50, 60, 70, and 80
   pieces;
5. summarizes bag piece count, build-step count, callout count, and an adjusted
   load score.

Adjusted load:

```text
adjusted_load = pieces + (1.25 * quantity_callouts)
```

This is not true physical volume. It is a practical proxy for part-size and
sorting burden when the manual text exposes quantities but not reliable
dimensions. Repeated high-quantity callouts are often tiny elements; many
separate 1x/2x callouts usually mean more distinct shapes, larger pieces, or
more sorting friction.

Outliers were removed from summary metrics with the 1.5 IQR rule per metric.
Raw outliers remain in the JSON output.

## Core Findings

Across the detected build steps:

| Metric | Outlier-trimmed value |
| --- | ---: |
| Detected build steps | 3,797 |
| Mean pieces per step | 4.23 |
| Median pieces per step | 3 |
| 10th-90th percentile pieces per step | 1-9 |
| Mean callouts per step | 2.73 |
| Median callouts per step | 2 |
| 90th percentile callouts per step | 6 |

Most steps are small. This means bag boundaries can usually move by one or two
steps without causing a large piece-count jump. The hard cases are high-callout
detail sections and occasional large repeated-element steps.

## Target Comparison

| Target pieces | Generated bags | Mean pieces per bag | Median pieces | Bags in 40-60 range | Mean steps per bag | Mean callouts per bag | Mean adjusted load |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 40 | 539 | 36.55 | 35.0 | 26% | 6.75 | 20.90 | 63.20 |
| 50 | 430 | 46.44 | 44.0 | 88% | 8.57 | 26.85 | 79.17 |
| 60 | 361 | 55.55 | 53.0 | 73% | 10.42 | 31.95 | 94.62 |
| 70 | 310 | 65.12 | 63.0 | 42% | 11.94 | 37.41 | 110.97 |
| 80 | 270 | 74.31 | 70.5 | 2% | 13.68 | 42.33 | 126.15 |

Interpretation:

- 40 is too conservative. It creates many short bags and often lands below the
  product's desired 40-piece lower bound.
- 50 is the best default. It preserves the 40-60 target range while keeping
  callout burden near 27 rows per bag.
- 60 can work for simple repeated-piece sections, but the average callout burden
  rises to about 32 and more bags drift above 60 pieces.
- 70 and 80 are too large for this product goal unless the user explicitly wants
  fewer, bulkier bags.

## Recommended Allocation Rules

Use these defaults for the app:

```text
targetPieces = 50
minPieces = 40
maxPieces = 60
softMaxCallouts = 28
hardMaxCallouts = 35
softMaxAdjustedLoad = 80
hardMaxAdjustedLoad = 95
```

Practical behavior:

- Preserve build order and never split a step.
- Once the current bag has at least 40 pieces, close it before adding a step
  that would exceed 60 pieces, 28-30 callouts, or about 80 adjusted load.
- Allow 30-39 piece bags for dense, high-callout detail sections.
- Allow 61-65 piece bags only when callout count is low and the section is
  mostly repeated small elements.
- Merge a tiny final bag backward only if the merged bag stays under the hard
  callout/load limits.
- Flag bags above 65 pieces, above 35 callouts, or above 95 adjusted load for
  user review.

Expected default output:

| Metric | Recommended expectation |
| --- | ---: |
| Average pieces per bag | 45-50 |
| Average build steps per bag | 8-9 |
| Normal build-step range per bag | 4-14 |
| Average quantity callouts per bag | 26-28 |

## Per-Manual Summary

All per-manual averages below use the recommended 50-piece target.

| PDF | Pages | Step range | Detected steps | Missing labels | Pieces | Callouts | Bags | Mean pieces | Mean steps | Mean callouts |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 6422770.pdf | 284 | 1-400 | 380 | 20 | 1,570 | 1,098 | 37 | 41.66 | 10.27 | 30.94 |
| 6429213.pdf | 228 | 1-259 | 251 | 8 | 2,142 | 1,193 | 45 | 47.09 | 4.92 | 27.14 |
| 6429333.pdf | 288 | 260-620 | 347 | 14 | 2,390 | 1,343 | 51 | 46.12 | 6.80 | 28.00 |
| 6455638.pdf | 332 | 1-423 | 404 | 19 | 2,259 | 1,061 | 46 | 49.11 | 8.51 | 23.53 |
| 6456559.pdf | 164 | 1-241 | 228 | 13 | 1,032 | 577 | 22 | 45.43 | 9.67 | 28.79 |
| 6499553.pdf | 184 | 1-245 | 234 | 11 | 1,072 | 497 | 22 | 48.73 | 10.64 | 22.59 |
| 6521150.pdf | 116 | 1-197 | 183 | 14 | 1,037 | 577 | 21 | 49.38 | 8.71 | 26.50 |
| 6521152.pdf | 224 | 1-362 | 339 | 23 | 1,823 | 1,041 | 40 | 44.94 | 8.13 | 26.30 |
| 6532380.pdf | 84 | 1-103 | 93 | 10 | 776 | 177 | 13 | 48.00 | 7.15 | 13.62 |
| 6564020.pdf | 468 | 1-998 | 925 | 73 | 3,682 | 2,086 | 79 | 46.32 | 11.09 | 26.79 |
| 6576298.pdf | 280 | 1-439 | 413 | 26 | 2,556 | 1,330 | 54 | 47.23 | 7.65 | 25.39 |

## Useful Product Implications

- The current 40-60 piece target is well supported, but the generator should aim
  for the middle of that range rather than the upper end.
- A single piece-count threshold is not enough. Add a callout or adjusted-load
  guardrail so dense detail sections do not become frustrating bags.
- The UI should make boundary adjustment cheap because most steps are small and
  moving a boundary by one or two steps usually changes a bag by fewer than 10
  pieces.
- Per-bag validation should show both `piece_count` and `callout_count`.
  `unique_part_count` will be better once Rebrickable matching is available,
  but callout count is available earlier and is still useful.
- The allocation engine should treat the final bag specially. A small final bag
  is acceptable when merging would create a high-callout or high-load bag.

## Limitations

- This was embedded-text analysis, not visual part recognition.
- Quantity callouts are assigned geometrically to nearby step labels, so a few
  page-layout edge cases can shift pieces between adjacent steps.
- Missing step labels are expected in some PDFs because text extraction can miss
  labels embedded in images or repeated groups.
- No manual PDF bytes, page renderings, crops, or OCR output were persisted, so
  the analysis intentionally avoids image-derived measurements.
- The adjusted load score is a proxy. Once part IDs and Rebrickable matches are
  available, replace or augment it with actual dimensions, category, and image
  metadata.

## Reproducing

Run from the repository root:

```bash
/Users/neithan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 artefacts/manual_bag_size_research.py
```

The script writes:

```text
artefacts/manual-bag-size-analysis.json
```
