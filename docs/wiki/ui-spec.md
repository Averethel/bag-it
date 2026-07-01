# UI Specification

## App Frame

Use a workbench layout with a compact product hero:

- full-page muted background
- constrained `7xl` content width
- hero eyebrow, headline, support copy, and three concise workflow notes
- left sidebar for upload/status/session/attention
- right flexible work area for output tabs
- responsive stack on mobile, side-by-side layout on large screens
- desktop keeps the sidebar sticky and the tabs header sticky so scan results can
  be inspected without returning to the top of the page
- the default `/` route uses the production v2 detector adapter
- `/v2` is a temporary compatibility alias for `/` while validation scripts and
  saved bookmarks migrate
- the sticky tabs header masks its desktop top offset with page background so
  scrolling content and side borders are not visible above the header
- the sticky tabs header keeps a visible top edge while stuck; its background
  mask must sit behind the header edge rather than cover it
- desktop sizing targets a compact MBP-style workbench with a narrow sidebar;
  mobile keeps larger touch targets while preserving the same hierarchy
- numeric count labels use the shared `Intl.PluralRules` formatter everywhere,
  so user-facing text reads `0 callouts`, `1 callout`, `2 callouts`, and the
  same rule applies to pages, parts, rows, bags, groups, crops, and reviews

Keep the visual language quiet and utilitarian:

- white bordered panels
- small-radius cards
- green action color
- subdued page and image backgrounds
- compact text sizes in tool surfaces
- lucide icons in buttons
- icon-only controls keep explicit `aria-label` text and render their matching
  tooltip content through a portal so hover/focus labels are not clipped by
  scroll containers, accordions, or preview overlays

Use strict Chakra tokens and a dedicated `bagging.*` semantic token namespace.

## Design Wireframes

These wireframes are the design reference for the rewrite. They intentionally
omit excluded Part list, BOM debug, and Rebrickable matching surfaces.

### Pre-Analysis

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Bag It                                                                     │
│ Turn a MOC manual into builder-ready bags                                  │
│                                                                            │
│ [Use original manual] [Find build callouts] [Pack physical bags]            │
│                                                                            │
│ ┌──────────────────────────┐ ┌───────────────────────────────────────────┐ │
│ │ Upload PDF manual        │ │ Build steps                               │ │
│ │                          │ │ Waiting for analysis                      │ │
│ │ [drop zone / file input] │ │                                           │ │
│ │ [Bag it!]               │ │ Bags                                      │ │
│ │                          │ │ Waiting for analysis                      │ │
│ │ Analysis progress        │ │                                           │ │
│ │ Scanning pages    0%     │ │                                           │ │
│ │ Extracting parts  0%     │ │                                           │ │
│ │ Generating previews 0%   │ │                                           │ │
│ │                          │ │                                           │ │
│ │ [Download session]       │ │                                           │ │
│ │ [Continue session]       │ │                                           │ │
│ └──────────────────────────┘ └───────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

### Build Steps

```text
┌──────────────────────────┐ ┌──────────────────────────────────────────────┐
│ Manual + status sidebar  │ │ Tabs: [Build steps] [Bags] [Diagnostics*]    │
│                          │ │                                              │
│ Uploaded manual.pdf      │ │ Build steps                                  │
│ [Find steps]             │ │ 42 callouts across 28 scanned pages          │
│                          │ │                                              │
│ Scanning pages complete  │ │ ┌ Page 1 ───────────────┬─────────────────┐ │
│ Extracting parts complete│ │ │ page preview           │ Step Parts Qty│ │
│ Generating previews done │ │ │                         │ 1    3t   8q │ │
│                          │ │ │                         │ 2    1t   2q │ │
│                          │ │ └─────────────────────────┴─────────────────┘ │
│ Attention                │ │ ┌ Page 2 ───────────────┬─────────────────┐ │
│ No BOM panels            │ │ │ page preview           │ No rows found  │ │
└──────────────────────────┘ └──────────────────────────────────────────────┘
```

`Diagnostics*` is optional and developer-oriented. It is not a BOM debug tab.

### Bags

```text
┌──────────────────────────┐ ┌──────────────────────────────────────────────┐
│ Manual + status sidebar  │ │ Tabs: [Build steps] [Bags] [Diagnostics*]    │
│                          │ │                                              │
│ Scanning pages complete  │ │ Bag checklist                  Bag ○ Color │
│ Extracting parts complete│ │ 6 bags from 42 callouts                      │
│ Generating previews done │ │ Packed: ███████░░░ 70%                      │
│ Attention                │ │                                              │
│ Review: unknown qty      │ │ ▾ Bag 1 · Pages 1-3             review*    │
│                          │ │   ✓ Qty Crop  Bag        Source             │
│                          │ │   □  2  img   Bag 1      Page 1 step        │
│                          │ │   □  1  img   Bag 1      Page 2 step        │
│                          │ │                                              │
│                          │ │ ▾ Bag 2 · Pages 4-5                         │
│                          │ │   □  4  img   Bag 2  Tan         Page 4 step│
└──────────────────────────┘ └──────────────────────────────────────────────┘
```

## Sidebar

### Upload Card

The upload card must support:

- drag/drop or file picker for PDF files
- dashed upload target with centered file-upload icon
- visible selected manual filename
- selected-file state keeps the dashed target and shows read/ready status
- selected-file status badge is pinned to the top-left of the drop target so
  long filenames cannot resize the filename row
- primary action button
- purge/remove button after a manual or session is loaded
- no separate cancel button after manual upload; purge remains the visible abort
  and clear action
- inline recovery/status notice
- valid PDF selection may start the intake/read-metadata step immediately; the
  primary action remains available for retry/rerun when no analysis is running
- successful read-metadata state shows a compact page-count and file-size
  summary near the selected filename

Acceptance:

- primary action is disabled until a PDF or restorable session is selected
- primary action is disabled while analysis is running
- purge aborts in-flight work and returns the app to pre-analysis state
- failed or expired scans show retry guidance without losing the selected manual
  unless source bytes were purged

Default primary button labels:

- `Bag it!` before any analysis
- `Find steps` when a session has a manual and step analysis is missing
- `Recalculate analysis` only if a saved session is stale

### Analysis Progress

The progress card is always visible because analysis is the app's primary job.
It shows discrete rows with icon, label, details, state badge, and progress bar.

The only progress rows are heavy analysis operations:

- `Scanning pages`: low-resolution page rendering, step-callout evidence, and
  final callout conflict resolution only
- `Extracting parts`: high-resolution callout-page rendering, quantity labels,
  and part-image extraction
- `Generating previews`: runtime page preview images first, then optional
  transparent part-mask upgrades for visible or near-visible rows

Rows can be pending, active, complete, or failed. Active rows should include a
heartbeat-style detail when long operations do not publish frequent progress.
The active-row icon must spin unless the user prefers reduced motion.
Before a manual is selected, all rows remain visible, pending, and at `0%`.
During page scanning, show scanned page count, total pages, and numeric
resolved-callout progress as pages finish streaming through detector workers.
Do not display raw candidate/evidence counts as detected callouts; page-stream
progress uses a conservative page-local resolved visible-callout count, then the
final conflict resolver publishes the authoritative total. Do not include part
extraction in this row. During part extraction, keep the completed page-scan
summary visible and build on it with processed callouts, total callouts, and
detected part rows. During preview generation, progress is based on total pages
with runtime page preview assets, for example `Preview pages 4/42`. A secondary
detail may report transparent part-mask upgrades, for example `Masks 7/120`,
but mask work never resets page-preview progress to `0%` or `100%` per job.
Reading manual status belongs in the upload card. Bags status belongs in the
Bags tab and never gets a progress row.

Preview generation is page-backed. The app generates one sharp runtime page
asset for each needed page at a default target width of `2200px`, stores it as
an object URL, and renders page previews, callout previews, and quantity-label
previews from that single image. Callout and quantity previews are CSS region
crops over the page asset; they do not allocate crop blobs. Part previews first
render as rectangular CSS region crops from the page asset, then visible or
near-visible rows upgrade to transparent part-mask blobs when mask work
finishes.

Page-backed crop previews must preserve the source region aspect ratio. The UI
sizes callout, quantity-label, and rectangular part-crop frames from the saved
region width and height, and must not use max-height clamps that distort the
frame. Inline callout crop previews are bounded thumbnails; part-image
thumbnails in Build steps, Bags, and grouped-part rows are compact and bounded
to a small square preview box while preserving aspect ratio. Hover and focus
zoom previews must be larger than inline thumbnails on desktop while still
preserving the region aspect ratio. Hover and focus zoom previews for
part-image previews are capped at `3x` the saved base part-region dimensions,
even when the transparent mask blob has higher natural pixel dimensions.
Hover and focus zoom previews for page-backed crops use explicit
region-derived width and aspect sizing so popovers open at the correct shape
without waiting for image natural-size measurement.

The first priority queue contains the expanded or visible page plus pages 1-6
on first Build steps render. The warm queue contains adjacent pages and then the
remaining pages in order. Transparent part-mask work has its own queue and is
enqueued when the corresponding page asset becomes ready, including warm
background pages, so part rows do not remain as rectangular page crops after
their page preview is hydrated. Background preview work must continue without
scroll events, but it must yield between page jobs and must not block scrolling,
tab switches, or session controls.

Runtime preview assets live outside `StepCalloutDetectionResult` in a
runtime-only preview asset store keyed by page number or part row id. The
detection result remains geometry-only for production UI. Existing `imageDataUrl`
fields remain as backward-compatible imported-session fallback fields only.
Session files must not persist `blob:` URLs; imported sessions with missing
runtime previews rehydrate previews from the embedded manual PDF. Older
sessions that contain data URLs remain readable. Object URLs must be revoked
when a manual is purged, replaced, restored, evicted, or when the component
unmounts.

Crop previews must always use the saved analysis coordinate system for their
regions. When preview work uses higher-resolution pixels from part extraction
or a preview render, it scales those base-coordinate regions into the
higher-resolution source image. It must not normalize high-resolution preview
sources down to the saved page-preview bounds, because that loses the quality
needed for usable page, callout, quantity, and part previews.

Before part extraction completes, the Build steps tab keeps the same live
analysis panel that was visible during scanning. It must not fall back to a
generic pending message when the pipeline moves from `Scanning pages` to
`Extracting parts`; it shows completed page scanning, accepted callouts, active
part page, current part row count, and the active phase progress. If part
extraction fails, the Build steps tab keeps the completed scan metrics visible
with a failed-parts state instead of returning to the generic pending panel.
Once part extraction completes, each detected callout renders part rows as a sortable
table, not as individual panels. The current table has three columns:

- `Quantity`: parsed quantity value/text with the raster quantity-label crop
  shown below the value for debugging.
- `Part image`: the part crop preview rendered over the detected callout
  background color.
- `Color`: advisory detected color with a catalogue swatch, confidence badge,
  and sortable text ordering.

The Build steps page accordion opens every scanned page by default so users can
review the manual as a continuous page list without extra expand clicks. Expanded
pages outside the near-viewport render window show lightweight skeleton bodies
instead of mounting every page preview, callout panel, hover preview, and
part-row table during the first usable render. A page body mounts when it is
within two viewport heights above or below the visible viewport, and once
mounted it stays mounted for the current result to preserve local review state.
Collapsed page bodies remain unmounted.

Both crop previews must use the shared hover/focus zoom preview behavior. Extra
debug fields such as confidence, page, callout, raw region, and quantity value
columns stay out of the default table.
Quantity-label and part-image row thumbnails render at their original crop
pixel size inside stable table cells. Their preview panels shrink-wrap the crop
rather than expanding to fill the table cell. Their hover/focus previews are
capped at 2.5x the original crop dimensions to use the high-resolution crop
source without expanding the stable row thumbnail.

### Session Controls

Keep:

- `Download session`
- `Continue session`

Session controls are disabled during analysis. Session files should restore:

- manual PDF bytes
- PDF metadata/job snapshot
- step-callout detection result
- callout multipliers
- checked bag row ids
- checked bag completion anchors for detector-version transfer

Increment 1 session files restore manual PDF bytes and PDF metadata only.
Current session files may additionally restore detector results, multipliers,
checked rows, and completion anchors.

Acceptance:

- `Download session` is enabled only when a restorable session can be created and
  no analysis is running
- `Continue session` is disabled while analysis is running
- stale detector sessions show a `Find steps`/rerun state before Bags render
- malformed sessions show an error and do not partially hydrate stale data

### Attention Area

The sidebar attention area should be compact. Keep only issues that affect the
step/bag workflow:

- stale detector/session version
- scan failed or expired
- no callouts detected
- no baggable callouts detected
- bag review reasons summarized at the global level if useful

Hide the attention area when there are no active issues. Do not render placeholder
issues as content.

Do not include BOM normalization attention or BOM-vs-step coverage panels.

## Tabs

Fresh default tabs:

1. `Build steps`
2. `Bags`
3. `Diagnostics` only if step-detection diagnostics are needed

Do not include a default `Part list` tab unless a later optional inventory
import feature is added. Do not include a BOM debug tab.

`Grouped parts` is intentionally removed from the active interface. Same-part
grouping will be rebuilt after color detection can provide a stronger matching
contract.

The tabs surface owns the outer border and background. Tab bodies render as
unframed layouts inside that surface; do not nest a full-width card or panel
around an entire tab body. Keep borders on repeated page and bag items, tables,
preview cards, and dashed empty states where they aid scanning.

### Pending States

Tabs should always be present. Before data exists, each tab renders a pending
panel:

- Build steps: analysis has not scanned pages yet or stale step analysis must be
  rerun.
- Build steps: while step scanning is running, show a live pending panel with
  active page, scanned/total pages, callouts as resolving until the accepted
  count exists, status text, and a progress bar. The sidebar status row stays
  more compact than this panel.
- Bags: generated bag groups appear after step callout analysis.
- Bags: if analysis has no baggable callout items, show a no-baggable-callouts
  attention panel instead of an empty checklist.
- Empty states use a bordered/dashed panel with centered icon, title, and concise
  copy. Do not leave blank placeholder rectangles.
- Diagnostics: hidden unless data exists or a developer flag enables it.

## Build Steps Tab

Use this page-grouped structure:

- one page group for every scanned page, even if no callouts were detected
- page groups render as open-by-default accordions that can be collapsed
- page preview appears at the top of each page group on desktop, above detected
  callout rows
- rows sorted by assigned step index and callout position
- callout header metrics:
  - Step
  - Part types
  - Total qty
- Step callout preview
- callout crop thumbnail with hover enlargement
- part rows below each callout row render as a sortable table with `Quantity`,
  `Part image`, and `Color` columns; the quantity cell shows the parsed
  quantity with its quantity-label crop below it for debugging
- part-only image previews alpha-mask the accepted callout background and render
  over that same flat background color; the crop source may use temporary
  padding to avoid clipped edges, but the emitted visible image and preview
  sizing should trim to retained part pixels so the thumbnail does not show
  transparent gutters
- `Not bagged` for zero-part callouts

Page previews:

- render inside a dedicated bordered preview panel rather than as loose
  thumbnails
- page previews and callout crop previews use the same shared preview card and
  popup component; only image data, accessible label, and stable thumbnail
  height differ
- quantity-label crops and part-only crops use the same shared preview card and
  popup component as page and callout previews
- quantity-label and part-only row thumbnails render at original crop size,
  with hover/focus zoom no larger than 2.5x the crop dimensions
- show hover/focus zoom in a Chakra `HoverCard`, preserving the thumbnail as
  the stable row anchor
- preview hover cards use viewport-aware positioning with flip, slide, and
  fit-to-viewport behavior
- hover/focus zoom panels must not be clipped by page accordions and must layer
  above neighboring page groups
- zoom panels may keep rounded panel corners, but rendered preview images stay
  square-cornered
- zoom panels use the same small, even padding on every side for page and
  callout previews
- zoom panels size to the preview image aspect ratio instead of the thumbnail
  width, so manual pages do not show horizontal gutters
- zoom panels must stay inside viewport width and must not create page-level
  horizontal scrolling
- use large enough page and callout crop images that a builder can verify
  border/fill decisions without opening a PDF viewer
- hydrate each selected preview page as a complete page preview set: page
  thumbnail, callout crops, quantity-label crops, and part-image crops
- prioritize visible or expanded Build steps pages before offscreen backlog, so
  jumping to a later page does not wait for every earlier preview to hydrate
- load preview pages in small, viewport-driven batches, initially the first
  visible page for large manuals
- keep the active batch stable until it resolves
- reserve preview slots from known page, callout, quantity-label, and part-image
  regions before image bytes arrive, so thumbnails do not shift table layout
- show unavailable state when a render cannot be loaded
- remain validation context, not a PDF reader

Build steps shows multiplier controls for callouts that have detected part rows.
The control is a compact numeric stepper with decrement/increment buttons and a
bounded numeric input. Multiplier values are whole numbers from `1` to `99`.
Changing a multiplier updates the callout total quantity and row quantities
immediately while keeping the raster quantity crop visible for debugging.
Pages with possible outside-callout step multiplier advisories use an accent
border/background on the page accordion group and keep a compact in-group review
alert. The page trigger points assistive tech to that alert and still uses the
badge text as a non-color review marker.
Build steps renders scanned page groups open by default. The UI may use
near-viewport priority hints for preview hydration, but it must not hide page
callouts or part rows behind lazy page-body mounting because fast scrolling
should still land on visible content.
Zero-part callouts show `Not bagged` and no multiplier control.
The app shell and callout preview plus step controls should not switch to the
horizontal desktop layout until the `xl` breakpoint; below that, keep the
sidebar/output areas and callout controls stacked so multiplier controls and
totals have enough room.
At the horizontal `xl` layout, the callout preview column uses about one third
of the callout row and the controls/table column uses the remaining visible
width. The part rows table must fit that visible column instead of forcing
page-level horizontal scrolling; compact preview columns stay fixed while color
text wraps in the remaining space.

## Bags Tab

Use this checklist-first design:

- title `Bag checklist`
- summary: bag count, callout count, detected part quantity, scanned page
  count, and scan scope
- review badge only when the bag plan needs review; do not render `draft`
  badges
- grouping switch: `Bag` when off, `Color` when on
- quantity-weighted global completion
- open-by-default accordion groups
- per-group progress visible in each group header, including when collapsed
- rows rendered with reusable checklist table

Bag grouping:

- one accordion per generated bag
- group title is `Bag N · Page X` or `Bag N · Pages X-Y`
- rows sorted by bag, page, callout, and item
- row sorting is normally enabled for page, quantity, completion, and title
  unless a grouping mode needs fixed ordering
- color grouping is available as advisory organization. Unknown, family-only,
  or review-color rows must stay visibly uncertain and must not imply catalogue
  normalization.

Color grouping:

- one accordion per color/family bucket
- group title uses the detected color/family label
- group summary still shows quantity-weighted completion
- rows keep their source bag label in the accessible checkbox label and retain
  page/step handles

Row contents:

- centered checkbox
- detected quantity, with estimated marker and quantity-label crop
- detected part crop with hover enlargement
- advisory color with catalogue swatch and confidence badge
- source page number handle with full-page hover/focus preview
- source `step` handle with callout crop hover/focus preview
- page, step, and part hover/focus previews render in a portal with
  viewport-aware positioning so scrollable table containers cannot clip them

Table columns:

- `Done`
- `Quantity`
- `Part preview`
- `Color`
- `Page`
- `Step`

Completion:

- checked state is per generated row id
- global and group progress are quantity-weighted
- checked rows reduce visual opacity but remain readable
- keyboard interaction uses checkbox role with Space/Enter
- checkbox rows apply immediate optimistic feedback; persistence, progress
  updates, and session anchor bookkeeping must not block the checked visual state

Performance:

- if raw detected part rows exceed the large-list threshold, mount a lightweight
  shell first
- after a short defer, mount checklist content
- for large multi-bag results, open only the first section initially
- use memoized sections/rows and accordion lazy mounting; collapsed large-list
  sections keep only their header and progress mounted until the user expands
  them
- use `content-visibility: auto` with conservative intrinsic size for section
  bodies

## Grouped Parts Tab

This prototype tab compares grouped part rows without replacing the Bags
checklist. It groups only within each generated physical bag.

Rows group when their part crop image data is an exact visual match or when a
strict offscreen normalized pixel signature indicates a near duplicate across
render scale drift. The signature compares alpha, luminance, and composited
detail; crop size metadata alone must not group rows. Advisory color is a gate,
not identity: neutral families such as gray, black, and white require the same
detected color name, while non-neutral uncertain rows may match within the same
detected family when the pixel signature is strong. Weak compact matches also
compare the lower silhouette to keep arched/notched parts separate from straight
parts, and same-color non-neutral compact rows can tolerate mild opacity drift.
Pixel signatures are derived from a temporary normalized canvas and do not alter
the original part crop image or source region. Same-page matches are allowed. If
two matching rows come from the same callout, they stay separate because the same
part is not expected to appear twice in one callout and similar-looking parts
may be adjacent there.

The grouped table shows a per-bag row number, total quantity, representative
part crop, all matched source part crops for validation, advisory color, and
compact source page/step references. Completion state remains owned by the
underlying checklist rows. Rows with multiple matched source crops can fold the
matched-crop preview area after visual validation; the representative crop,
quantity, color, and source references stay visible so the comparison row
remains scannable.
