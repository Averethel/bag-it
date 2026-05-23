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
current UX uses those detected callout quantities to display draft bag groups in
the Bags tab and keeps an always-visible Build steps tab for step-callout
tuning. These draft bags are heuristic, contiguous step ranges only: a detected
step callout is never split between bags, bag targets vary by estimated set
size, and any unknown quantities or oversized steps keep the bag in review.
Step-to-BOM, Rebrickable matching, and same-element local grouping are paused in
the primary UX. The Bags tab now shows a packing checklist table with one row
per detected callout part item, including completion state, bagging quantity,
hover-enlarged crop, bag number, detected color, and source step number with a
hover preview of the source callout. Users can group the
open-by-default accordions either by bag number or by detected color. Color mode
uses one group per normalized color name across all bags so users can sort a
physical color pile into its bags; in that mode row sorting is disabled and bag
dividers preserve the bag switch points. Bag checklist completion is shown as
quantity-weighted progress both for the whole checklist and for each open
accordion group. The previous callout crop and local matching surface is
preserved in the Debug tab for later tuning; final ready-bag generation remains
outside the active UI loop while this local baseline is being tightened.
When the recognized BOM quantity and the bagging quantity currently accounted
for by detected callouts differ, the UI shows a step coverage diagnostic with
the BOM quantity, callout quantity, and missing or extra quantity in the same
sidebar attention area used for unresolved BOM rows, so it remains visible while
the user changes tabs and tunes bagging. The Build steps tab lets the user raise
a per-step multiplier, defaulting to 1, so repeated manual steps can multiply
every detected item in that callout for bagging and trigger bag rebalancing
without requiring the detector to infer repeated-step notation.
Bag boundaries now preserve page containment: every detected callout on the
same manual page stays in the same draft bag, so the default detector can stay
callout-first and avoid step-label OCR during normal analysis. Step-number OCR
and label-anchored callout search remain optional debug/tuning paths rather
than the default bagging path. Quantity text is kept as separate debug data and
rendered from its own quantity-label crop. Displayed callout item
previews now use the detected part-only crop with the sampled callout background
removed, while trusted quantity glyph pixels are excluded from internal visual
comparison and color sampling.
Same-part local image grouping is debug metadata based on
preserved-aspect mask, structure, detail, and color matching. As of the
`step-callout-detection-v86` label-anchored cropper pass, detected color name is a
hard local grouping gate, edge silhouette is not used as a local grouping
signal, and local image grouping stores the closest rejected candidate crops and
failed shape, structure, detail, aspect, coverage, compactness, and color gates
so false negatives can be inspected directly in the Debug tab. The quantity
reader now treats visible `Nx` labels as anchors, finds the nearest part
foreground above each trusted label inside the step crop, clears only the active
label while validating that item, rejects giant assembled-model components, and
keeps the full local part crop instead of cutting it at dark details. The OCR
path still requires a trailing `x` marker before accepting a digit run, reads
only the contiguous digit run immediately before that marker, keeps contiguous
multi-digit quantities such as `11x`, `20x`, `36x`, and larger explicit
`Nx` labels, and separates 2/5/7/8/9 from broad 3/4/6 fallbacks with fixture
masks. The same pass rescues row-supported single-digit labels on busy part
pixels, avoids narrow row-spanning part components that swallow neighboring
rows, and is measured against saved Castle Ramp and Middle Wall session callout
crops so detector totals can be compared with the recognized BOM totals without
re-running PDF rendering.
The `step-callout-detection-v86` crop-quality pass detects the actual inside of
the callout border before segmentation, clips padded previews to that interior,
expands connected foreground beyond a label midpoint so wide parts are not cut
off, and stops that expansion before it crosses another same-row quantity label
center. Displayed previews, color sampling, and local image features then use
the dominant connected foreground component inside that owned part region so
thin neighboring-part edges do not pollute the crop. The part-region pass also
scores foreground components against every quantity anchor and keeps only the
best-owned components, preventing lower labels from borrowing the part or label
region above them when stacked callout items share a wide search zone. Every
detected quantity-label glyph region is excluded from every displayed part crop
so tall-part preview expansion cannot leak a previous item's label. The same
pass treats strongly overlapping part regions as same-row neighbors even when
their quantity labels are vertically staggered, then clips preview expansion at
the midpoint between neighboring part crops so large adjacent plates do not
swallow each other. The same pass rejects borderless non-blue model fragments
before quantity-anchor detection, requires page-level callout candidates to show
the expected blue callout-fill evidence, removes quantity-like part texture that
sits just above a real lower-row label, and falls back to a label-local
foreground search when a broad connected row blob would otherwise hide a real
top-row part.
The `step-callout-bagging-v4` pass groups detected callouts by manual page
before applying the set-size bag heuristic. A page group may exceed the normal
target and enter review, but it is not split across physical bags. Undersized
bags are still merged into the previous bag when possible, and truly tiny bags
can fold into the previous review range so five-part tail groups do not stand
alone.
The `step-callout-detection-v107` default path detects callout rectangles from
callout visual evidence only and assigns fallback build-step indexes in page
order. The older step-label OCR and label-anchored non-blue callout path remains
available behind an explicit option for debugging manuals where the callout-only
path is insufficient. Tiny blue one-part callouts below the normal page-size
gate are admitted from their rectangle structure: paired dark or soft
anti-aliased borders, expected blue callout fill, and either an `x`-delimited
quantity label or nearby printed-step glyph evidence are enough evidence even
when the single part is too small or light to form a separate dark component.
Weak tiny rectangles still need enough true blue-fill share, strong rectangle
evidence, and parsed quantity-anchored part items before they can enter Build
steps, so neutral grey model panels near printed step labels do not borrow
small-callout context. Zero-part
rectangle candidates remain internal detector evidence only, even when they
look visually callout-like. The part-item cropper accepts isolated single-item
`Nx` labels on busy part pixels when a foreground part image sits above the
label, and the quantity classifier distinguishes compact lower-courtyard `9x`
labels from open `4x` glyphs. This keeps small one-part callouts while rejecting
bordered model fragments that would otherwise surface as zero-part build rows.
The part-only preview cropper rejects thin or bright-connected callout rule
components on the right edge as well as top and left rule fragments, and clamps
frame-inflated rightmost crops back to the detected part, so rightmost black
parts do not keep the callout border in their checklist image.
The output surface now includes a separate Build steps tab for step-callout
tuning: every scanned step page gets a page group so missed callouts can be
spotted, detected rows list the build-step index and callout crop, and full page
previews load from the tab in small batches instead of blocking analysis
completion or session download. Callout cells hover-open the enlarged callout
crop.

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
they still do not claim ready inventory reconciliation. User-selected step
multipliers may increase a detected callout's bagging quantity before the draft
bag heuristic runs, but they do not change raw extraction data. The detector
scans every page that is not part of the detected bill of materials so
full-manual callout coverage can be measured while quantity, color, local
grouping, and bag-range heuristics are tuned. Step analysis has its own detector
version so a session with current part analysis can run only the step callout
pass when the part extractor version has not changed.

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
after reload. User-selected step multipliers are stored in that user-owned
session bundle with current step analysis so repeated-step tuning survives a
reload. The app still must not add hidden local storage, IndexedDB, filesystem
cache, or server persistence for manual analysis data; importing a bundle must
validate its extractor version and ask for recalculation before using stale
recognition output.

Increment 3 may use bounded Rebrickable API calls only for catalogue misses or
metadata unavailable in downloadable CSVs, and never as the full-manual
normalization path. The browser must not receive the full parts catalogue; it
posts compact extracted rows for server-side normalization against the local
snapshot. Displaying an already-normalized parts list must not depend on
synchronous external Rebrickable calls.

Full per-step reconciliation, ready bag generation, exports, and a
general-purpose user-facing PDF viewer remain outside the current slice until
the full-manual callout baseline is validated. Build steps page previews are
validation aids for detected callouts, not replacement instructions.
Step-number OCR remains an optional debug path, not a default requirement for
draft bag grouping.
