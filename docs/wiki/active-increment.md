# Active Increment

## Current Increment

- Increment 4: Step Recognition.

## Status

Increment 2 is formally closed as of 2026-05-17.

Increment 3 was activated on 2026-05-17.

Increment 3 is formally closed as of 2026-05-18. Closure validation completed
with the full local verification suite and exact Castle validation for all five
multipart manuals.

Increment 4 was activated on 2026-05-18. The current implementation slice
detects and renders build-step callout crops across all non-BOM pages, segments
the visible callout part items, and reads visible quantities and colors. The
current UX now uses those detected callout quantities to display draft bag
groups in the Bags tab instead of maintaining a separate Steps tab. These draft
bags are heuristic, contiguous step ranges only: a detected step callout is
never split between bags, bag targets vary by estimated set size, and any
unknown quantities or oversized steps keep the bag in review. Step-to-BOM,
Rebrickable matching, and same-element local grouping are paused in the primary
UX. The Bags tab now shows a packing checklist table with one row per detected
callout part item, including completion state, quantity, hover-enlarged crop,
bag number, detected color, and source step number with a hover preview of the
source callout. Users can group the
open-by-default accordions either by bag number or by detected color. Color mode
uses one group per normalized color name across all bags so users can sort a
physical color pile into its bags; in that mode row sorting is disabled and bag
dividers preserve the bag switch points. Bag checklist completion is shown as
quantity-weighted progress both for the whole checklist and for each open
accordion group. The previous callout crop and local matching surface is
preserved in the Debug tab for later tuning; final ready-bag generation remains
outside the active UI loop while this local baseline is being tightened.
Step-number OCR, exports, labels, and ready-bag reconciliation remain out of
scope until this callout baseline is working. Quantity text is kept as separate
debug data and rendered from its own quantity-label crop. Displayed callout item
previews now use the detected part-only crop with the sampled callout background
removed, while trusted quantity glyph pixels are excluded from internal visual
comparison and color sampling.
Same-part local image grouping is debug metadata based on
preserved-aspect mask, structure, detail, and color matching. As of the
`step-callout-detection-v82` label-anchored cropper pass, detected color name is a
hard local grouping gate, edge silhouette is not used as a local grouping
signal, and local image grouping stores the closest rejected candidate crops and
failed shape, structure, detail, aspect, coverage, compactness, and color gates
so false negatives can be inspected directly in the Debug tab. The quantity
reader now treats visible `Nx` labels as anchors, finds the nearest part
foreground above each trusted label inside the step crop, clears only the active
label while validating that item, rejects giant assembled-model components, and
keeps the full local part crop instead of cutting it at dark details. The OCR
path still requires a trailing `x` marker before accepting a digit run, reads
only the contiguous digit run immediately before that marker, keeps both digits
in `11x`, and separates `6` and `9` from broad `4` and `3` fallbacks with
fixture masks. The same pass rescues row-supported `1x` labels on busy part
pixels, avoids narrow row-spanning part components that swallow neighboring
rows, and is measured against saved Castle Ramp and Middle Wall session callout
crops so detector totals can be compared with the recognized BOM totals without
re-running PDF rendering.
The `step-callout-detection-v82` crop-quality pass detects the actual inside of
the callout border before segmentation, clips padded previews to that interior,
expands connected foreground beyond a label midpoint so wide parts are not cut
off, and stops that expansion before it crosses another same-row quantity label
center. Displayed previews, color sampling, and local image features then use
the dominant connected foreground component inside that owned part region so
thin neighboring-part edges do not pollute the crop. The part-region pass also
scores foreground components against every quantity anchor and keeps only the
best-owned components, preventing lower labels from borrowing the part or label
region above them when stacked callout items share a wide search zone.
The
`step-callout-bagging-v2` pass merges an undersized trailing bag into the
previous bag when the previous bag can absorb it within the hard part limit.

Increment 2 closure is conditional on the Castle hard gate documented in
[Quality gates](quality-gates.md) and
[Increment 2](increments/02-parts-list-extraction.md): parts-list OCR, parser,
or validation changes must not reduce Castle suite accuracy. Any Castle row,
quantity, missing-row, extra-row, compatible-alias, or assertion regression
blocks the change until fixed.

## Scope Rule

Only one increment may be active at a time.

Before implementation starts, document the active increment here and keep all code,
tests, and documentation changes scoped to that increment. Do not implement work
from later increments unless the active increment is first changed explicitly.

## Current Boundary

The active Increment 4 boundary builds on the structured bill of materials and
catalogue-normalized rows delivered by earlier increments. This increment does
not expand catalogue normalization behavior. The current tuning pass has paused
step-to-BOM and Rebrickable preview matching so the app can first prove
same-part grouping from local callout images alone.

Increment 4 may render transient private page images during active analysis to
detect step-local callout rectangles, crop those callouts, segment visible part
image plus quantity-label groups, read visible callout quantities, estimate
visible part colors as structured debuggable step data, compare local callout
part crops to other local callout part crops for debug diagnostics, and derive
draft callout-based bag groups. The draft bag part list currently does not
collapse rows by local visual evidence or catalogue identity; each visible
callout part item remains its own checklist row, while grouping controls only
choose the section layout: by bag number or by normalized detected color name.
BOM thumbnail and Rebrickable catalogue preview matching are temporarily
disabled in the primary step analysis loop until local same-part grouping is
reliable enough to validate.
Draft bags may use the current BOM total quantity to choose a set-size heuristic;
they still do not claim ready inventory reconciliation. The detector scans every
page that is not part of the detected bill of materials so full-manual callout
coverage can be measured while quantity, color, local grouping, and bag-range
heuristics are tuned. Step analysis has its own detector version so a session
with current part analysis can run only the step callout pass when the part
extractor version has not changed.

Manual PDFs remain private source documents. The app must not commit, bundle, or
silently persist uploaded manual PDFs as long-lived product data. Local private
examples may be used for manual browser testing and catalogue/data analysis only
when they stay outside version control. During Increment 2 recognition tuning,
derived page renders,
OCR text, crops, source fingerprints, metadata, layout regions, and debug
artifacts remain transient in the active browser session unless the user
explicitly downloads a private Bag It session bundle. That bundle is a
user-owned file that may contain the manual, analysis result, OCR/debug data,
page previews, checked-part state, and extractor version so work can continue
after reload. The app still must not add hidden local storage, IndexedDB,
filesystem cache, or server persistence for manual analysis data; importing a
bundle must validate its extractor version and ask for recalculation before
using stale recognition output.

Increment 3 may use bounded Rebrickable API calls only for catalogue misses or
metadata unavailable in downloadable CSVs, and never as the full-manual
normalization path. The browser must not receive the full parts catalogue; it
posts compact extracted rows for server-side normalization against the local
snapshot. Displaying an already-normalized parts list must not depend on
synchronous external Rebrickable calls.

Step-number OCR, full per-step reconciliation, ready bag generation, exports,
and a user-facing PDF viewer remain outside the current slice until the
full-manual callout baseline is validated.
