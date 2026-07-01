# Draft Bagging Specification

## Goal

Turn detected step callout items into practical draft physical bags. Bags must be
useful for preparing parts, but they must not claim final catalogue certainty.

The app classifies generated bags as `draft` or `review`, not `ready`. The UI
surfaces `review` when action is needed and does not render `draft` badges.

## Inputs

Required:

- active `StepCalloutDetectionResult`

Optional:

- `calloutMultipliers`
- `inventoryPartCount`

For the fresh MVP, `inventoryPartCount` is normally absent. The bagging policy
must then use detected callout quantity as the set-size source.

## Output Contract

`StepCalloutBaggingPlan`:

- `heuristicVersion`
- `policy`
- `setPieceCount`
- `detectedStepCount`
- `detectedPartCount`
- `bags`

Initial heuristic version:

```ts
step-callout-bagging-v6
```

`StepCalloutBagPlan`:

- stable `id`
- `label`
- `status`: `draft` or `review`
- `reviewReasons`
- `pageRange`
- `stepRange`
- `partCount`
- `unknownQuantityCount`
- `callouts`

## Bagging Rules

### Sorting

Sort baggable callouts by:

1. page number
2. source region `y`
3. source region `x`
4. page-local callout index
5. step index

Callouts with no part items do not contribute to bag planning.

If no callouts have part items, the bagging plan must contain no bags and the UI
must show a no-baggable-callouts attention state. It must not render an empty
`Bag 1` or imply usable bag output.

### Page Containment

Group callouts by manual page before deciding bag boundaries.

A manual page must not be split across bags. If one page exceeds the normal
target, keep it intact and mark the resulting bag for review.

### Quantity Calculation

For each callout item:

- trusted quantity is a finite positive parsed value
- untrusted or missing quantity counts as `1`
- callout multiplier multiplies every item quantity in that callout
- multipliers are applied before balancing

### Section Boundary Anchors

The bagger builds its page sequence from `scannedPageNumbers`, not only pages
with baggable callouts. Soft section cues are:

- one or more scanned pages with no baggable callouts between baggable work
- pages containing only zero-part accepted callouts
- detector `sectionBoundaryHints` with `position: "before-page"`

These anchors represent likely module endings, attachment steps, or a new
manual section starting. They do not mean one bag per section. They bias
boundary choice only when the active bag is already useful enough to finish, or
when adding one more page completes the current section without crossing the
soft hard cap. Low-fill bags may carry across section cues.

Section cues may override normal target-size packing because a slightly over-
or under-sized useful bag is better than a bag that takes one or two steps from
the next section. They do not override page containment or the soft hard cap of
`maxParts + overfillToleranceParts`.

### Policy Bands

Use inventory quantity when explicitly available; otherwise use detected
callout quantity.

Initial policy bands, calibrated from public bag inventory data:

| Set size | Band | Min parts | Target parts | Max parts | Max target steps |
| --- | --- | ---: | ---: | ---: | ---: |
| `<= 500` | small | 70 | 105 | 145 | 18 |
| `<= 1,200` | medium | 80 | 115 | 155 | 16 |
| `<= 2,500` | large | 95 | 130 | 170 | 14 |
| `> 2,500` | huge | 105 | 145 | 190 | 12 |

`targetSteps` is derived from average detected parts per callout and clamped to
the band's min/max target step range.

### Calibration Research

Bag-size policy uses [BricksPerBag](https://bricksperbag.com/) public set data
as a community baseline, not as official LEGO policy. BricksPerBag documents
official LEGO instruction PDFs as its primary bag-assignment source and
Rebrickable as supplemental metadata. The current calibration check fetched all
1,560 public API set records from
`https://bricksperbag.com/api/sets?limit=500&offset=0&sort=pieces`, then
filtered to 1,409 recent 2021-2026 non-virtual sets with positive
`total_pieces` and `bag_count`. The 2026 sample is partial.

Observed recent pieces per numbered bag:

| Set size | Sample | Average | Median | P25 | P75 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `<= 500` | 731 | 85.0 | 84.3 | 57.5 | 106.1 |
| `501-1,200` | 455 | 120.9 | 115.4 | 101.5 | 132.6 |
| `1,201-2,500` | 150 | 136.1 | 129.1 | 109.7 | 146.9 |
| `> 2,500` | 73 | 142.5 | 130.7 | 111.9 | 163.3 |

The app uses conservative target/max ranges around these medians because MOC
manual callouts may omit spares, minifig bags, stickers, sub-build packaging,
or set-specific bagging choices. Recent large sets mostly scale by adding more
numbered bags, not by growing bag size; set pieces correlate strongly with bag
count and only moderately with pieces per bag.

### Boundary Selection

Accumulate page groups into the active bag. Section cues are evaluated around
size targets, not as mandatory split points.

Close the active bag before adding the next page group when:

- the active bag has at least one callout, and
- adding the next page would exceed the soft hard cap
  `maxParts + overfillToleranceParts`, or
- the next page starts a new section and the active bag has reached preferred
  fill, or
- the active bag has reached a preferred fill and adding the next page would
  exceed the target part limit without completing the current section, or
- the active bag already has at least `minParts` and adding the next page would
  exceed the target step limit without completing the current section

When the next page is immediately followed by a section cue, it may stay in the
active bag to complete the current section even if it exceeds the normal target
part or step limit. This section-ending override still stops at the soft hard
cap.

Preferred fill is the smaller of:

- policy minimum parts
- 75% of target parts

### Undersized Merge

After initial bag creation:

- merge an undersized bag into the previous or next neighbor when that improves
  usefulness without splitting any page
- allow the merge to exceed the normal max only within the overfill tolerance
- never merge across a chosen useful section boundary
- except when the undersized bag is abnormally small and the merged bag still
  stays within the soft hard cap

Tiny threshold:

```ts
max(5, floor(minParts * 0.15), floor(targetParts * 0.08))
```

Abnormally small threshold:

```ts
max(tinyBagThreshold, floor(minParts * 0.25), floor(targetParts * 0.2))
```

Overfill tolerance:

```ts
max(20, floor(maxParts * 0.15))
```

### Review Reasons

A bag is `review` when:

- one or more quantities are unknown

Otherwise it is `draft`.

Part-count policy limits are grouping heuristics only. They do not create
user-facing review warnings.

## Checklist Row Contract

Create one visible row per detected callout part item.

The canonical checklist row remains the detected callout part item because row
identity, completion anchors, and session restoration all depend on source
geometry. Same-part groups are derived from rows at render/report time and do
not change saved session shape.

Same physical part means the same bag item, including shape and color. Quantity
is not part identity; two rows with `2x` and `3x` may group when the visual part
identity matches, and the group total sums row quantities. Similar-looking but
different parts such as a 1x3 plate and 1x4 plate must remain separate.

Same-part matching lives in the pure package `@bag-it/part-matching`. The
package owns `PART_MATCHER_VERSION`, `extractPartVisualFeatures(input)`, and
`createPartMatchGroups(input)`. It must not import React, Next.js, Chakra UI,
PDF renderers, filesystem APIs, session-file code, or app components. Inputs are
row-shaped records with row/bag/callout/item ids, part region, alpha mask,
optional rendered pixels or precomputed features, and color metadata. Outputs
are groups with `groupId`, `bagId`, `rowIds`, `confidence`, `matchKind`, and
short reasons.

App-visible same-part grouping uses a two-lane policy. Exact-digest groups and
near groups that also pass the auto-safe scorer render as normal checklist group
headers. Near groups that pass only the suggested scorer render as visually
distinct review suggestions. Suggested groups must keep raw source rows
individually checkable, show confidence, and provide fast reject/split controls:
the user can reject the whole suggested group or remove a single expanded row
from that group. These corrections are display-local and do not change saved
session row ids or completion anchors.

Same-part groups must be precomputed from Bags row data and rendered part-mask
preview pixels before the user toggles `Group parts` whenever possible. The
toggle is a display control, not a matcher trigger: switching it on must not run
package matching inside table render. App-visible matching work must run in a
Web Worker so hover, scrolling, checkbox, and accordion interactions stay
responsive while same-part scoring runs. The app must transfer cloned
alpha-mask and rendered-pixel buffers into the worker instead of
structured-cloning live React/session buffers. The original row and preview
assets remain owned by the UI; worker messages receive disposable byte copies.
This background work waits for the masked part crops produced after page
previews, but its wait and scorer progress belong to the fourth `Part grouping`
row in the main Processing status panel, beside `Scanning pages`, `Extracting
parts`, and `Generating previews`, to avoid layout shifts and keep page-preview
progress monotonic. Rows must remain usable during that background preparation.
The `Part grouping` progress bar is a two-stage bar: waiting for part-mask
previews fills only the first half, scorer/group creation fills the second half
up to `99%`, and only the ready state may show `100%`.
Runtime masked part crops may be capped to a small source size for display and
scorer input because the table only needs thumbnail-scale masked previews and
the matcher extracts normalized feature grids; page-backed hover previews
remain available for larger crop inspection.
The `Group parts` toggle stays disabled until this precomputation reaches
`ready`, so the switch itself never starts matcher work or traps the UI behind
a long click. If precomputation fails, the Processing status panel marks `Part
grouping` as failed and the `Group parts` toggle remains disabled rather than
showing an empty ready state. Worker bucket failures must return an explicit
error response so the status detail shows the underlying scorer or grouping
message instead of only a generic worker crash.

The promoted suggested scorer may load a committed ONNX model artifact trained
only on part manual crops, not full manual pages or build steps. The app worker
preprocesses runtime masked crop pixels into the same normalized square image
format used by training, embeds each row crop once, scores candidate row pairs
through the pair head, and passes those scores to `createPartMatchGroups` as
`cachedPairScore`. The package grouping contract remains pure: it receives only
row records, scorer config, and optional pair-score features.
To protect responsiveness while the ONNX path is still CPU/WASM-bound, buckets
above the runtime CNN cap of `96` rows use the previous static suggested scorer
instead of blocking background preparation on large-bag embedding work.
Buckets at or below that cap must fail part-grouping precompute if the committed
model or ONNX runtime cannot load; they must not silently downgrade to the
static suggested scorer because that would expose weaker suggestions as if the
trained scorer had run.

Silent auto groups must pass the zero-known-false-positive promotion gate across
active labels, excluded singleton rows, and real app checklist review. Suggested
groups may tolerate a measured correction burden below `0.5%` only when the UI
explicitly marks them as below-threshold suggestions and gives fast correction
controls. The zero-false-positive requirement does not apply globally to this
suggestion lane; it remains mandatory only for silent auto grouping.

Private same-part labeling uses generated static workbench pages under
`.bag-it/private/part-match-reports/**`. Reports should use a stable
`--manual-id` when labels are being collected so the workbench can preload the
manual's existing labels; when no saved labels exist, it seeds the workbench
from proposed matcher groups so reviewers correct visible buckets rather than
starting from an empty board. The workbench is image-first: it shows large part
crops, bag/page/step/color metadata, bag-sectioned ungrouped part pools,
same-part group buckets beside the pool, drag-and-drop assignment into buckets
or onto another card, collapsible bag sections, collapsible color sections
inside each bag, full-width collapsible group rows whose collapsed state shows
one representative crop and whose expanded state shows every source crop,
single-row removal from a bad group, bag-scoped group renaming, whole-group
drag/drop merging, bag-first then color-sorted group order, and exported label
JSON. The part pool and group buckets must stay independently scrollable on
desktop, and drag/drop rerenders must preserve scroll position so labels can be
formed by dragging between visible side-by-side columns. Existing labels are
authoritative and load unchanged; proposed matcher groups auto-seed only reports
without an existing label file or rows omitted from a partial existing label
file, while the explicit apply action may fill currently ungrouped rows for
review. It is private tooling only, not a
user-facing app surface. Large private reports may be generated as selected-bag
slices with `--bag-labels` or `--bag-ids`; filtered reports keep the source
manual id stable while writing a separate private output directory, so partial
label exports can be merged back into the manual-level label file.

When pair-level labels are fully recovered but group-level expected pairs still
miss, `analyze:part-match-rules -- --write-grouping-conflict-report <dir>`
writes a private report that shows the labeled rows, current groups, and
unlabeled lookalike rows competing for a group partition. Use it for targeted
annotation instead of broad manual relabeling.

Package matching rules:

- compare only rows inside the same bag
- never match rows from the same callout
- reject trusted color conflicts
- allow exact digest groups immediately when color, normalized mask digest, and
  optional detail digest match
- do not render near matches in app output for the current MVP; near matching is
  private/report-only until a future matcher is explicitly promoted
- near matches, when enabled for private evaluation, must compare normalized
  alpha, projections, edge signatures, top/lower/side silhouettes, normalized
  rendered luma detail when crop pixels are available, and stud/detail peak
  structure so scale drift can match but different plate lengths stay split
- visual feature extraction includes a 16x16 compatibility feature set plus
  v2 high-resolution private-scorer features: 32x32 alpha and luma grids,
  32x32 alpha edge grids, signed silhouette-boundary distance grids, and
  alpha/luma edge-orientation histograms. The private scorer also has
  alpha-bounds-normalized tight 32x32 alpha, alpha-edge, and luma grids so
  crop padding and scale drift can be tested separately from whole-crop visual
  grids. Pair scoring exposes shifted-distance ratios for alpha, luma,
  silhouette, and tight grids so label training can learn when a small crop
  translation explains the visual difference. It also exposes the generic
  near-feature confidence as a trainable scalar for private supplemental lanes.
  Pair scorers can also expose `baseMatched` and `baseProbability`, derived
  from the package default scorer, so a later fusion scorer can reuse the
  conservative baseline without importing private lab code. These features are
  pure data and stay inside `@bag-it/part-matching`.
  App-visible exact-digest grouping does not depend on scorer output.
- contour/chamfer pair features compare alpha boundary cells against signed
  boundary-distance grids and can be searched as private evidence lanes, but
  they are not sufficient on their own: any chamfer-backed scorer promotion
  must still pass the excluded-row hard-negative gate across all labeled manuals
  before it reaches app-visible near matching
- near-match feature scoring is shape/detail based and color-agnostic after
  candidate scoping; trusted color conflicts reject candidates before visual
  scoring, but LBG and DBG instances of the same shape use the same visual rule
  family once their own colors are internally compatible
- scorer-gated near groups require pairwise-compatible visual pair matches
  between every row in a merged group; this avoids transitive false groups where
  A matches B and B matches C but A does not match C. The final group must also
  contain at most one row from any source callout. A scorer-positive pair still
  needs one strong visual-evidence lane from luma detail, luma edge detail,
  alpha correlation, or near-identical silhouette/profile metrics before it can
  form a near group. When private near matching is enabled, larger
  scorer-backed cliques may supersede smaller exact-digest groups so exact
  duplicate rows can still join scaled or cropped variants of the same part.
- exported full-manual `role: "excluded"` label rows are hard singleton
  negatives for app promotion and private training. A near group containing an
  excluded labeled row is a false group even if no active expected-part keys
  conflict.
  Scorer configs may carry learned zero-negative visual evidence lanes and
  hard-negative veto lanes; when present, learned evidence lanes replace the
  no-config fallback lanes, and any matching veto lane rejects the pair.
  Supplemental lanes are independent by default for historical private scorer
  configs, while `modelGatedSupplementalRules` require both the learned model
  score and the supplemental evidence rule to match before recovering a pair. A
  scorer config may also carry supplemental zero-negative visual lanes that can
  recover raw scorer misses only when the lane matched no compatible negative
  training pairs. Private tools may use packaged or ignored scorer configs for
  candidate generation and experiments; the app does not use scorer configs for
  current same-part grouping.
- scorer training can require a minimum number of conditions per learned
  evidence lane. Per-manual holdout validation uses at least two conditions so
  a broad one-feature lane such as "both crops have luma detail" cannot pass as
  shape evidence on its own.
- v2 feature training keeps bounded evidence-search seed queues so adding more
  visual atoms does not make private scorer fitting exhaust memory.
- private scorer training fails on contradictory label and review-decision
  pairs by default. Pair-review decisions can be treated as fresher evidence
  with `--decision-conflict-policy prefer-decisions`; that policy drops only
  the conflicting older label pair from the training set and keeps the label
  file unchanged.
- private rendered-pixel near matches are conservative: current rules require
  a tight normalized luma-detail distance and higher aggregate confidence than
  alpha-only fallback matches, because current active labels show same-
  silhouette/different-detail false positives before this guard
- labels validate generic visual rule families, not one rule per LEGO part
  type; coverage should come from repeated feature patterns and hard negative
  examples such as similar-but-different lengths, colors, and silhouettes

Row fields:

- stable row id from bag id, callout id, item id, and multiplier
- bag label and bag number
- bag page numbers
- source page number
- callout page-local index
- step index
- item index
- quantity after multiplier
- quantity confidence and estimated flag
- quantity label crop
- part preview crop
- advisory detected color and color confidence/status
- manual-local color class id only affects prototype grouping when the row is
  marked `manualClassTrusted`
- source item ids
- completion anchor containing page number, callout source/crop coordinates, and
  part source/crop coordinates

## Bags UI Same-Part Toggle

The Bags tab keeps the existing outer grouping switch for `Bag` and `Color`.
It also exposes a separate `Group parts` toggle inside the Bags checklist. That
toggle applies only when the outer view is `Bag`; it is disabled or ignored for
the color view. In Bag view, it is also disabled while the Processing status
`Part grouping` precompute is waiting for masked part previews or running the
worker, and becomes active only after the worker finishes.

When enabled, each bag accordion remains the outer structure. Inside each bag,
accepted exact-digest groups render inside the same checklist table as
expandable group header rows. A collapsed header uses the regular table columns
plus a narrow leading expander column so Done checkboxes remain aligned. The
header vertically centers total quantity, the representative preview, color,
source-row count, and confidence. Expanded member rows keep the same group
background so the group reads as one table section. Near groups are intentionally
absent from app output in the current MVP. Raw row ids, checked state, progress
math, completion anchors, and session restore stay unchanged. Rows with no
accepted same-part group remain visible as normal checklist rows.

Row id must change when multiplier changes because the row quantity changed.
Session restoration should validate checked row ids against the active bagging
plan when the detector version is unchanged. When the detector version changed
and analysis is rerun, checked completion should transfer by matching the saved
completion anchor to newly detected rows.

## Completion Anchors

Every checklist row must have a coordinate anchor that can survive detector
version bumps better than generated row ids.

Anchor fields:

- manual fingerprint
- page number
- page render dimensions used for detection
- callout source region normalized to the page render dimensions
- part source region normalized to the callout or page render dimensions
- quantity-label source region, optional but recommended for disambiguation
- item index on callout, optional tie-breaker only

Transfer rules after a detector-version rerun:

- never render stale Bags directly
- rerun detection with the new detector
- build the new bag plan
- match saved checked anchors to new rows by same page plus overlapping callout
  and part regions
- require both callout and part overlap to exceed a documented tolerance
- use quantity-label overlap and item index only as tie-breakers
- transfer a checked state only when exactly one new row matches confidently
- otherwise drop that checked state and surface a compact session notice

## Bags UI Acceptance

- Shows a summary of bag count, callout count, detected quantity, scanned
  page count, and scan scope.
- Shows global quantity-weighted completion.
- Uses accordions, open by default for normal results.
- Keeps each group progress bar visible outside accordion content so collapsed
  groups still show packed quantity and percent.
- Supports a `Bag`/`Color` grouping switch. Off shows bag grouping; on shows
  advisory color grouping. Color grouping must keep uncertain/family-only rows
  visibly review-flavored rather than claiming catalogue certainty.
- Bag mode titles use contained pages, not fallback step ranges.
- Rows render a sortable table with `Done`, `Quantity`, `Part preview`,
  `Color`, `Page`, and `Step` columns.
- Page handle opens a full-page preview on hover/focus.
- Source step handle opens the callout crop on hover/focus.
- Part crop previews and hover previews show the detected part image over the
  source callout background color.
- Hover/focus previews render outside scrollable checklist containers so they
  are not clipped by table overflow.
- Quantity label crop remains visible next to quantity.
- Checked row progress is quantity-weighted globally and per group.
- Checked rows persist across tab remounts and session download/import.
- Checkbox interaction gives immediate checked-row feedback before lower
  priority progress/session persistence work completes.
- Zero-bag outputs show a pending/attention panel, not an empty checklist.
- Bags with unknown quantities or oversized page groups are visibly marked
  `review`.
- Same-part grouping is available only as a Bags-mode toggle. It renders
  exact-digest groups inside each bag; there is no separate `Grouped parts`
  tab, and deterministic/ML near-match experiments remain private-only until a
  future zero-false-positive promotion decision.

## Performance Acceptance

- Large checklist threshold starts at 250 raw part rows.
- Before heavy rows mount, render the panel shell and loading text.
- Delay heavy mount briefly so tab switching paints first.
- For large multi-bag lists, open only the first bag section initially.
- Memoize row/section derivation.
- Avoid re-rendering accordion sections whose checked state did not change.
- Use lazy accordion content and `content-visibility`.

## Tests To Preserve

- policy source chooses inventory when present and detected quantity when absent
- contiguous callouts group without splitting a step
- same-page callouts stay together even when oversized
- oversized bags are marked review
- undersized and tiny trailing bags merge correctly
- multipliers apply before balancing
- local image/color grouping stays internal and conservative
- bag and color grouping render expected rows/dividers
- quantity-weighted progress updates from row checks
- controlled checked state survives remounts
- checked completion transfers through coordinate anchors after detector-version
  reruns
- page and callout hover previews work
- large checklist deferred mounting works
