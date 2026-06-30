# Build Steps Discovery Specification

## Goal

Detect build-step callout rectangles and their visible part rows directly from
manual pages. This system is the fresh MVP's source for step discovery and bag
input data.

The detector should be callout-first and border-first. Printed step-number OCR
is optional diagnostic behavior, not a requirement for bagging.

Do not assume callouts are blue. Private manual sampling showed that callout
backgrounds vary by designer and sometimes match the page background. The
detector must identify callouts from the visible border first, then infer the
local callout background color from interior pixels.

## Detector Versioning

Keep explicit detector versioning. The current detector version is:

```ts
2.0.0-alpha.20
```

Part image and quantity-label extraction has its own version:

```ts
2.0.0-alpha.167
```

Part color calibration has its own version:

```ts
2.0.0-alpha.65
```

Saved step analysis is usable for rendering only when the saved result matches
the running detector version. Results whose callouts match the running detector
but whose part extractor or part color calibration version is missing or stale
keep their callout rectangles and rerun only the part extraction and color
calibration pass. Stale step analysis must be rerun before Bags are shown,
though saved completion anchors may be transferred after the rerun.

The app must read the running detector, part-extractor, and part-color
calibration versions from the production v2 detector adapter. The step detector
worker must report the detector version with candidate and evidence responses;
the app rejects mismatched worker output and reruns the page scan without
parallel page workers. The part extraction worker must also report its own
part-extractor and part-color calibration versions before page work starts; the
app rejects mismatched worker output, terminates the stale worker pool, and
retries once with a fresh worker.
The default `/` route uses the v2 browser adapter. The `/v2` route is only a
temporary compatibility alias for validation scripts and bookmarks while they
migrate to `/`.

The clean v2 detector rebuild is specified in
[Detector v2 spec](detector-v2/README.md). New v2 behavior must follow those
stage contracts and validation taxonomy instead of extending the legacy detector
patch history below.

Pure step-callout detection lives in private workspace package
`@bag-it/step-callouts`. The package owns normalized page pixels, callout
candidate generation, evidence scoring, conflict resolution, diagnostics, and
detector stage snapshots. It uses shared raster quantity-label detection from
`@bag-it/raster-quantity-labels`; it must not import app code, PDF.js, React,
Next, Chakra, sessions, previews, part extraction, bagging, native PDF text, or
the legacy detector monolith.

Raster quantity-label detection lives in private workspace package
`@bag-it/raster-quantity-labels`. It owns visible `Nx` glyph assembly, bounded
raster OCR, recovery, overlap suppression, and part-art rejection. Both
step-callout detection and callout-part extraction consume this package so
callout acceptance and part-row extraction share one raster-only quantity
contract.

The production app adapter owns browser PDF rendering, scan progress, page
streaming, part extraction, preview hydration, saved sessions, and mapping
package callouts into the existing Build steps result. Private manual
validation uses the mounted `/` app path through real Playwright browser
upload/download. Approved saved sessions may act as expected baselines, but
package-level manual replay runners and PPM baselines are not active validation
inputs.

The v2 browser adapter is orchestration only. Browser worker-pool scheduling,
part-extraction worker version checks, and stale-worker retry live in
`part-extraction-scheduler.ts`; color sampling/calibration assignment lives in
`part-color-calibration-runner.ts`; PDF preview hydration lives in
`preview-hydration-runner.ts`. If a part-extraction worker reports stale
part-extractor or part-color calibration versions during either the version
probe or the extraction response, the app terminates the worker pool and
retries the whole part-extraction pass once so partial stale output is not
rendered.

The production route currently emits detector version `2.0.0-alpha.20` from
the v2 page-input, candidate, evidence, resolver, and output assembly path. It
emits
part extractor version `2.0.0-alpha.167` from package
`@bag-it/callout-parts` and part color calibration version `2.0.0-alpha.65`
from `@bag-it/part-colors`. Callout evidence and part extraction both use
visible raster `/^\d+x$/i` quantity labels from
`@bag-it/raster-quantity-labels`; native PDF text and source text OCR are not
inputs. Page-scale raster text banners or paragraphs that only resemble `Nx`
labels after glyph assembly are rejected by raster glyph spacing plus
page-relative area and position checks, not by reading source text or manual
ids; strong border/background/quantity evidence can still accept a genuinely
wide callout panel without a predefined callout aspect-ratio contract.
Detector `2.0.0-alpha.20` scores non-dark raster edge
contrast against the inferred fill-panel background, capped as weak border
evidence, so Animals-style green outlines can support raster quantity anchored
fill panels without becoming the strong dark-border path. It estimates page
background from dominant edge samples instead of four-corner averaging, so
colored manual pages do not become one page-scale fill component. Strong
page-local panel contrast can satisfy background evidence only when the
manual-wide style cluster is still sparse enough to be unreliable and strong
raster quantity evidence is already present. Every raster-quantity fill-panel
acceptance path, including the strong border path, still requires a panel-sized
candidate region unless stable manual-style background evidence, raster
quantity, and visible border evidence agree on a smaller Animals-style
single-part panel. Page-local background fallback alone cannot use this
small-panel exception. Transparent callout boxes on colored page gradients can
be accepted without fill contrast only when a bounded panel has strong raster
border evidence, lower-row raster quantity, and measured foreground ink density
inside the candidate; dense build-art regions and empty bordered regions stay
out. Lower-contrast instruction panels without compatible manual-style
background stay diagnostic. The app-facing Build
steps result includes accepted callouts only; diagnostic candidates remain
internal review evidence and do not feed part extraction. The extractor scans only accepted
callout regions, accepts visible raster quantity labels as row anchors, and
creates one part row per accepted label. It emits stored `partImage.region`,
`partImage.alphaMask`, and `quantityLabel.region/text/value`; the app encodes
preview bytes mechanically from those extractor fields and does not compute
part geometry or mattes. BOM data, catalogue data, and page-wide part scans are
not inputs. Part extraction never
downgrades accepted callouts; an accepted callout with zero part rows is a part
detection failure that blocks validation. Alpha 5 keeps the label-owned row
model but lets the foreground flood fill see a wider callout-local band before
scoring ownership, so long parts are not clipped at neighboring label midpoints.
Part color resolver keeps the existing sampler, then builds conservative
manual-local classes and emits review-only/family-only advisory names until
training gates promote trusted prototypes. Private reports/labels are evidence
only, not runtime oracle code.
Alpha 17/18 extend the raster-only callout path for Animals-style manuals.
Manual-style inference now prefers repeated fill-panel candidates that already
carry raster quantity evidence, compact `1x` glyph assembly keeps small printed
labels out of the coarse part-art filter, and top/compact fill-panel acceptance
does not use a predetermined callout aspect-ratio guard. Accepted border or
line-rectangle candidates that are padded duplicates of strong quantity-backed
manual-style fill panels are assembled from the overlapping fill-panel source
region/background before part extraction, avoiding one-channel background
rounding drift in low-contrast part masks. Restored stale sessions and stale
step-detector workers rerun through the non-worker page scan path so old worker
bundles cannot silently return old callout candidates.
Alpha 6 filters dark bright-neutral aggregate prototypes unless a row has
neutral body evidence, with a narrow edge-highlight rescue for shadowed gray
or silver parts. This prevents near-black rows from inheriting Light Bluish
Gray or silver names from shadow prototypes while preserving small shadowed
neutral parts that still expose gray body or edge evidence.
Alpha 149 keeps lower-row crop top recovery from crossing a close upper-row
quantity owner after selected-envelope and tall-top recovery have run. This
prevents Lower Courtyard style stacked callouts from showing two visible parts
in one preview when the selected lower part sits below a nearby upper label.
Private lower-courtyard crop tuning accepts the current report crops as a
local crop regression snapshot before color tweaking continues; crop preview
stability is checked before color class accuracy.
Alpha 150 changes no geometry rules. It invalidates alpha149 saved part rows
after Hall Tower step 137 showed that a bad saved alpha149 session could be
restored without rerunning even though a fresh PDF/app analysis with current
code emitted the correct four `1x` rows. The app must rerun restored alpha149
part rows from preserved callout geometry before rendering Bags or color
workbench state.
Alpha 152 fixes the fresh-analysis Hall Tower step 137 regression without
pre-rejecting readable low-value labels. Low-value candidates now survive
quantity filtering; after part images are created, duplicate cleanup drops only
rows whose extracted crop is near-empty and reruns without using that dropped
label as a suppression mask. This removes the fake part-art `2x` row and
prevents it from masking the real fourth `1x` part, while preserving
Lower Courtyard dense/staggered real `1x` labels that alpha151 rejected too
early.
Alpha 153 targets the first real-Chrome bag-analysis fixture failures. Compact
lower-peer recovery restores a missing 2x2 lower-right quantity only when the
inferred box contains printed label ink and has part ink above it. Source-first
top-bar-seven OCR keeps printed `7x` labels out of the four classifier. Top-edge
alpha support is clamped when support escapes from the image edge into callout
border or step-number pixels, while compact and non-edge top support remain
eligible for small, long, or raised parts. These rules are callout-local and
raster-only; they do not use manual ids, page ids, source text, BOM data,
catalogue data, or saved-fixture coordinates.
Alpha 154 adds a scaled-output dense top-edge trim for cases where the browser
mask keeps a single opaque callout-border row above the real part. This restores
manual-008 page 5 / callout 12 / row 1 without broad generic crop-padding
changes.
Alpha 155 rejects post-extraction rows created by stud or part-detail glyphs
that split a larger printed-label-owned part. Dropped embedded labels are also
removed from rerun suppression so the real label can recover the full part
crop, and suppression-only readable labels inside a selected foreground region
no longer punch alpha holes into real parts.
Alpha 156 applies the same duplicate cleanup after scaled real-Chrome
extraction recovers compact rows, transfers the larger embedded part-art crop to
the retained printed label when the printed label was clipped, and clamps
right-side support alpha that escaped into a neighboring part while keeping
transparent crop breathing room. This removes the reviewed stud-as-quantity
regressions and Hall Tower page 118 / callout 212 / row 3 neighbor alpha bleed.
Lower Courtyard page 131 / callout 255 / row 1, page 157 / callout 304 /
row 5, and Middle Wall page 32 / callout 68 / row 2 remain open alpha/region
ownership blockers.
Alpha 157 targets the remaining Lower Courtyard white-part ownership blockers
without broad crop padding. For the rightmost part in a row with multiple
comparable quantity labels, a selected long shallow part can fill a small top or
left strip inside the selected owned envelope even when those pixels match the
local background color. The rule is gated by row position, foreground size, and
owned-envelope overlap instead of adding generic crop padding.
Alpha 163 keeps the raster-only part-row contract and targets the final reviewed
Animals part-row misses. A glyph-backed `4x` label with a same-row printed peer
is no longer rejected solely because part ink overlaps the label box when there
is no close lower-row conflict, preserving small left-hand parts in two-label
Animals panels. High-scale printed `5x` glyphs also win before the `6x`
classifier when their center shift is just below the old threshold, so browser
rendered extraction reports `5x` instead of `6x` for that row shape.
Alpha 164 targets Linux Chrome 149 fixture drift without changing approved
fixtures. Compact peer recovery now covers leading same-row labels, two-missing
upper peer rows with ownership rerun, suppressed same-row trailing peers, and a
narrow compact `8x/9x/2x` normalization. Scaled extraction runs the same
readable peer recovery after scaled readability filtering. The step resolver
also rejects weak fill-panel fragments that overlap a stronger accepted
quantity-backed fill panel, covering the Hall Tower page-46 duplicate while
keeping overlapping true callouts out of the rule.
Alpha 166 keeps the alpha164 compact peer contract and tightens the Linux
Chrome trailing-peer gap. When a compact callout has one high-value same-row
anchor and the inferred trailing `1x` glyph is unreadable, the recovery may
emit that inferred `1x` only when strong broad part foreground exists above the
inferred label region. This restores Chrome 149 renders where the right-hand
label ink disappears into a low-contrast part while keeping the rule gated by
callout size, anchor position, and measured part foreground.
Detector alpha 20 adds a narrow Linux Chrome 149 compact-top strong-border
acceptance path for border or line-rectangle candidates with real lower-row
raster quantity labels. It restores small blue top-row callouts whose fill
background scores slightly below the manual-style threshold on Linux, while
keeping too-narrow fragments rejected.
Alpha 83 keeps the alpha69 dense-callout behavior and adds row-spanning
lower-label ownership for Upper Courtyard style panels. When a lower label's
row band starts far below the label because the visual part spans multiple
rows, the part search can lift upward inside the callout interior. Stacked
same-column components are split only after component selection and only when
the selected subcomponent is large enough to be a real part, so upper-row
neighbors are not stolen. Wide high-value retry candidates that are size
outliers against an overlapping printed label row are rejected as part art.
Private validation uses a reduced Upper Courtyard real-browser sample from
source pages 44, 45, 47, 92, 93, and 97, followed by accepted saved-session
browser gates.
Alpha 98 starts 4th-stage tuning from a full `/` real-browser baseline and
keeps non-target callouts fixed by summary diff. Suppression-only readable
labels now exclude background learning even when they are not row-emitted, and
related-component ownership rejects row-separated components that a different
printed label owns more clearly. This prevents lower rows from absorbing
nearby upper-row label/part content without weakening same-row long-part
continuation.
Alpha 127 preserves the long-shallow support path while narrowing ownership
when two nearby same-row parts compete. A narrow vertical side fragment is no
longer treated as the selected part's tight continuation when a larger adjacent
component is better owned by another printed label. Detached top-support pixels
outside the owned horizontal span are pruned before alpha trimming, so recovered
weak end caps do not pull a neighbor into the crop. Accepted saved-session
drift reports no affected rows across the current callout-parts baselines.
Alpha 128 covers exploratory final-risky-step probes without promoting those
manuals into the accepted gate. OCR now prefers open-bottom `4` shapes over
closed-loop `8` fallback and can recover a same-baseline leading digit so a
clean adjacent `3` plus `5x` is emitted as `35x`. Compact stud/part-detail
candidates embedded in an owned component are rejected as false labels unless
same-row printed-label evidence protects them. Severe top clipping on
diagonal/tall selected components can expand the source region and alpha
support from the selected owned envelope; the expansion is limited to compact
printed labels and local component geometry so multi-digit rows and neighboring
parts are not borrowed.
Alpha 143 stabilizes the printed-label lifecycle after Hall Tower and 4th-stage
regression work. Readable labels can be used as suppression masks even when
they are not emitted as rows, so dropped or duplicate labels do not leak into
neighboring part crops. Sparse glyph-backed `4x` part art above close lower
rows is rejected, while bottom-row high-value printed labels with same-baseline
peers stay eligible even when the nearby part overlaps below the glyph. The
accepted bag-analysis Playwright fixture gate covers manuals 001 through 011
through the real `/` app flow; `manual-011` is the Animals-style raster fixture.
The alpha143 refactor also narrows package internals without changing the app
result contract. Quantity recovery is represented by source-specific plans with
target bands for lower-threshold retry, connected-top-cap recovery, and
attached-baseline recovery. Part-art rejection is ordered by named decisions
instead of blanket printed-row exemptions. Part image assembly delegates
foreground ownership, support masks, alpha-mask creation, alpha trimming, and
diagnostic assembly to focused modules. Public part-image diagnostics expose
stable geometry only: raw foreground bounds/count, owned region, excluded label
regions, alpha bounds, pre-trim image region, and final crop bounds. Tuning
internals such as support counts, support bounds, top-support flags, trim
padding, coordinate scale, alpha clamp details, and component scoring are not
part of the saved app/session contract.
The alpha143 cleanup pass keeps the same extractor version and result contract
while further splitting quantity internals. `assembleQuantityCandidates` is now
an orchestrator over separated-label assembly, connected-glyph assembly, and
debug reporting. Part-art rejection keeps one public filter entry point, while
row/layout facts, foreground probes, and ordered rejection decisions live in
separate modules. Alpha-mask ownership no longer carries diagnostic-only
excluded label regions; those remain on `CalloutPartImageDiagnostics`.
The cleanup pass completed with `npm run validate:saved-sessions:browser`
passing all 20 approved saved sessions; no baselines were refreshed and no
callout, quantity, part-region, or alpha-mask drift was reported.
Alpha 84 keeps alpha83 behavior but narrows the recovery and support contracts.
Quantity retry scans are represented as `QuantityRecoveryPlan` objects with a
named kind, target band, and assembly options; lower-threshold retry candidates
can enter the normal overlap, part-art, and outlier filters only when their
center falls inside the plan band. Part-art rejection uses named printed
context decisions instead of a blanket printed-row bypass, and the alpha mask
support code is split into owned/interior, top-face/top-gap, and bottom-edge
helpers. Top-gap bridge support rejects exact or background-like fill unless it
passes the explicit near-background distance and dark-luma support rule. Part
crop assembly now separates foreground ownership selection from crop padding
and tall-top recovery.
Alpha 85 fixes Hall Tower dense multirow part-art labels without broadening app
geometry. Recovered candidates with no glyph evidence are dropped before part
ownership, sparse high-value candidates near a close lower label row still lose
to printed baseline labels, and raised same-column part art can only support a
printed baseline label when that printed label has enough row peers. The rule
removes fake raised `4x`/`9x` rows from Hall Tower source pages 184, 187, and
189 while keeping the real printed rows. The reduced Hall Tower real-browser
sample under `.bag-it/private/hall-tower-problem-pages/` includes source pages
144, 171, 184, 187, and 189 for this check.
Alpha 86 keeps alpha85 ownership behavior and adds a targeted sparse tall-panel
quantity retry. If a tall callout has only lower printed rows accepted, the
extractor can rescan the empty top band with the named `tall-sparse-top`
recovery plan. Recovered candidates still pass normal part-art, overlap, and
ownership filters; the retry only lets Hall Tower source page 171 style top-row
tiny `2x`, `2x`, `1x` labels enter the existing label-owned extraction path.
Full Hall Tower `/v2` browser replay emits 612 callouts and 2240 part rows.
Compared with alpha85, drift is limited to the annotated source page 171
callouts plus source page 47 step 79, which has the same tall sparse shape and
now emits the four previously missed top-row `1x` parts.
Alpha 88 continues Hall Tower tuning on reduced real-browser samples generated
from the manual page map instead of ad hoc page selection. It protects sparse
high-value printed labels that sit in the same visual row as other real labels,
so Hall Tower source page 144 step 278 emits `4x`, `1x`, `4x`, `1x`, `1x`.
It also adds a named `connected-top-cap` quantity recovery for labels whose
lower glyph pixels are visually connected to nearby non-label ink at the
callout bottom; recovered labels still pass normal label-shape, part-art,
ownership, and crop filters, allowing Hall Tower source page 298 step 597 to
emit `1x`, `2x`, `1x`. Alpha 88 narrows the same-row printed-label protection
to sparse high-value multirow candidates only, preventing Lower Courtyard
part-art from reappearing as a fake `4x`. Full Hall Tower `/v2` browser replay
still emits 612 callouts and 2243 part rows, with zero drift against the
private alpha88 pre-tightening summary. The accepted saved-session browser gate
passes 18 sessions through the real `/v2` app flow.
Alpha 93 fixes the Hall Tower source step 294 sparse two-row failure where the
top-left printed `2x` label rendered as one connected low-confidence blob,
classified as `4x`, then was rejected as part art and absorbed into the lower
`1x` crop. The extractor can rescue only this connected one-glyph `4x` as `2x`
when it has exactly three accepted printed peers: two same upper-row labels to
the right and one lower printed label. Broad non-emitted label masking was
rejected because it regressed accepted Castle Ramp crops; suppression stays tied
to emitted labels. Visible `/v2` validation on the reduced Hall Tower sample
showed the target callout as four rows with total quantity seven, and accepted
saved-session browser gates for manuals 001, 002, 003, 005, 006, 007, 008, and
010 passed through the real app flow.
Alpha 97 fixes the Hall Tower full-manual regressions introduced while keeping
source step 294 and source step 597 correct. Attached-baseline quantity recovery
now stays a gap filler: it does not get overlap priority over normal printed
labels, and it is rejected when the recovered label would sit directly on top of
an already readable printed label in the same column. Duplicate-owner cleanup
also stops dropping an upper label that belongs to a printed same-row label
group, so source step 137 keeps all four `1x` rows while isolated upper part-art
duplicates are still removed. The cleanup also reruns after scaled readability
filtering and aligns dense crop masks with dropped duplicate labels, so Lower
Courtyard dense step 373 and MOC-169454 part-art duplicates stay within saved
session gates. Full Hall Tower `/v2` browser replay emits 612 callouts and
2243 part rows. Against the accepted alpha88 baseline, the only remaining true
quantity drift is source step 363, accepted by manual review as `8x`, `8x`,
`2x`. The user-approved Hall Tower session is committed as
`manual-004.bagit-session.json` in the callout-parts saved-session gate. The
accepted saved-session browser gate passes 19 sessions through the real `/v2`
app flow with all saved callout-parts rows checked where baselines include part
rows.
Alpha 99 fixes the 4th-stage Step 13 follow-up where alpha98 prevented the
merged crop but also dropped the entire printed top row. The root cause was a
scale-fragile `tall-sparse-top` recovery gate: at DPR 2 the first detected
lower-row label center landed just above one third of the tall callout, so the
top-band retry did not run. Alpha 99 keeps the same ownership and merge rules
and only lowers that generic tall-sparse threshold. Full 4th-stage real-browser
replay through the promoted `/` app path emits 72 callouts and 336 part rows;
against the alpha97 good-state summary, the only row/count drift is the target
Page 15 Step 13 callout, now emitted as `1x`, `1x`, `1x`, `2x`, `1x`, `2x`,
`1x`. The accepted saved-session browser gate still passes 19 sessions.
Alpha 127 keeps that 4th-stage output accepted after the Step 2 long-part crop
and Step 13 merged-row fixes, and `manual-009.bagit-session.json` is now the
user-approved 4th-stage callout-parts saved-session regression. The accepted
saved-session browser gate now passes 20 sessions through the real app flow
with all saved callout-parts rows checked where baselines include part rows.
Detector alpha 11 exposes package-owned candidate background RGB in
`StepCalloutCandidateEvidence`; the `/v2` adapter reuses that evidence for
Build steps backgrounds and part extraction instead of sampling app-local
duplicates.
Alpha 6 keeps that crop policy and tightens raster digit classification so a
dense antialiased open `4` with a strong crossbar is not classified as the
closed-loop digit `8`.
Alpha 7 keeps the raster-only rule and adds two quantity-label safeguards:
thick one-stem glyphs classify as `1`, and raised part-shaped glyphs that sit
above the dominant label baseline are rejected instead of becoming fake
quantities.
Alpha 8 keeps the raster-only behavior and fixes restored-session scale
handling. When current callouts are restored but parts are stale or missing,
the part-only rerun and preview hydration render pages at the saved page-preview
width by default, so saved callout coordinates and rendered pixels stay in the
same coordinate system. Private manual acceptance validates through a fresh
browser upload path; mixed-scale local validation is invalid.
Part color resolver resets the active color history at version
`2.0.0-alpha.0`. Future tuning must follow the private training workflow,
promote only accepted labels, and explain special behavior through row features
inside the relevant family resolver.
Alpha 9 fixes fresh-upload finalization. Provisional rows extracted during page
streaming remain progress-only; final output always reruns part extraction on
the final accepted callout regions so provisional rows from earlier page-local
resolution cannot survive into the Build steps table.
Alpha 10 fixes exact browser-rendered MOC-129110 step 21 and step 22 failures:
wide, low-confidence single-digit candidates raised above multiple compact
baseline labels are part art, not quantity labels, and slanted wide `1` glyphs
classify as `1` before the open-four rule can claim them. When any local
non-browser output disagrees with `/v2`, the Playwright browser upload path is
the acceptance source.
Alpha 11 changed the old app-side part preview hydration path. That path is now
superseded for `/v2`: package output owns `partImage.region` and
`partImage.alphaMask`, and app hydration applies those stored values only.
Alpha 12 upgrades preview matting from one flat callout-fill color to a
low-frequency local background model, so callout fill gradients do not remain
in part thumbnails after background removal.
Alpha 13 keeps the callout-only raster path and fixes a translucent-part
failure class. Oversized raised candidate rows are rejected only when a compact
lower quantity-label baseline exists, preventing light transparent part art from
becoming fake `Nx` labels. Browser-scale raster digit rules now classify
curved/diagonal `3`, cropped-top `5`, `6`, and `9` shapes before broad fallback
rules, while preserving existing dense `4` and closed `8` cases.
Alpha 14 keeps the same raster-only inputs and rejects close raised sparse or
vertically noisy candidate rows above a stronger compact lower baseline. It
also rejects label-like fragments shorter than the supported raster label
height, so light/white part outlines cannot become extra `Nx` rows. Part
anchors also use larger vertical than horizontal padding, preserving low-
contrast part tops without reintroducing left/right neighbor bleed.
Alpha 15 rejects label-like part slivers that sit just above a lower same-column
real label, while preventing lower low-confidence slivers from suppressing real
labels above them. It also gives preview-only transparent crops extra top
breathing room so tight white part thumbnails do not look clipped.
Alpha 17 keeps the same geometric guard but handles same-column raised marks
that nearly touch a compact lower baseline. The rule is still label-shape and
layout based, with no manual id, step id, expected count, color-specific
branch, source text OCR, BOM data, or catalogue data.
Alpha 19 adds browser-scale compact raster label guards: six-pixel-high `1`
stems, compact `2`/`3` curves, and three-pixel `x` glyphs classify before broad
fallback rules, while part-sized stud/top fragments are rejected by a maximum
label-height gate. The rule is still raster-shape and callout-local geometry
only.
Alpha 20 rejects compact part caps that are label-sized but have dense
horizontal fill bands across the candidate mask. This targets stud tops and
small curved part fragments that can otherwise split into fake `4x`, `6x`,
`9x`, or multi-digit quantities. The rule uses only the candidate raster shape;
it does not use manual ids, step ids, expected counts, color-specific branches,
source text OCR, BOM data, or catalogue data.
Alpha 21 changes quantity filtering from isolated digit tweaks to candidate
context. A raster label candidate is rejected when its local mask continues as
dense foreground immediately under the candidate, because that means the
candidate is embedded in part art rather than printed below a part. Alpha 21
also rejects an x-like digit as the `x` owner when another non-digit `x` follows
on the same baseline without an intervening digit, so labels such as `12x` keep
the real `x` as their anchor. These guards are callout-local and raster-only;
they do not use manual ids, step ids, expected counts, colors, source text OCR,
BOM data, or catalogue data.
Alpha 32 tunes raster-only quantity OCR against the first private manual browser
upload (`manual-001`, Castle Ramp). Compact antialiased printed `x` glyphs may be dense
when their diagonal and corner evidence is strong; larger dense shapes remain
rejected as part art. Glyph size gates tolerate the higher render scale used by
the mounted `/v2` final extraction path. Source-bitmap digit checks now run
before high-confidence template fallback for diagonal `2`, open-right `3`,
closed `6`, and slanted `1` glyphs, while broad fallback rules still run after
template matches so synthetic fixtures remain stable. The change uses only
glyph shape metrics from accepted callout pixels and does not use manual ids,
page ids, step ids, expected counts, source text OCR, BOM data, catalogue data,
or color-specific branches.
Alpha 33 expands stored part image regions slightly before alpha-mask creation
so faint right-side part edges are retained instead of clipped. The extra area is
still clamped to the part ownership zone, trimmed away from quantity labels, and
masked from callout-local background pixels. The change is a generic part image
region rule and does not use manual ids, page ids, step ids, expected counts,
source text OCR, BOM data, catalogue data, or color-specific branches.
Alpha 34 trims each stored part image region after alpha-mask creation to the
nonzero alpha bounds plus fixed preview padding, reducing empty whitespace while
preserving the already-masked part pixels. The app still renders only stored
`partImage.region` and `partImage.alphaMask`; it does not recompute part
geometry or matte data.
Alpha 35 adds source-bitmap `9` recognition before broad template fallback,
rejects too-small label-ink fragments, drops unreadable canonical-scale labels
after the high-resolution extraction pass is scaled back to `/v2` coordinates,
and widens label-owned foreground search plus alpha-mask padding symmetrically.
The part-image mask explicitly zeroes all quantity-label regions, allowing
transparent label-adjacent breathing room while preventing label glyph pixels
from entering previews. These rules retain faint left, top, and bottom part
pixels without app-side preview geometry or manual-specific rules.
Alpha 36 keeps the raster-only item model but makes the label ownership zone an
assignment hint instead of a crop clamp. Foreground search now spans a wider
callout-local row band around each accepted label, final crop clipping is
vertical-only inside the row band, and the alpha-bound trim remains the final
preview clamp. This preserves parts that extend left, right, or far above a
label, including lower-row tall parts, without manual ids, step ids, expected
counts, source text OCR, BOM data, catalogue data, or app-side preview
geometry.
Alpha 37 keeps the alpha 36 search and ownership behavior but stops the final
stored part image region at the quantity-label row. Alpha 38 replaces that hard
row-edge crop with expanded label alpha suppression: part regions may include
the label-row band for tall parts and light studs, while label glyph pixels stay
transparent in the alpha mask.
Alpha 41 keeps the same label-owned model and adds part-art quantity suppression
for high-value tiny outliers, dense non-glyph foreground inside candidate masks,
and close raised rows above compact real labels. The temporary app-side
base-render row fallback from this iteration was removed; lower-resolution page
renders are callout-detection inputs only, not part-row fallback inputs.
Alpha 42 removes the base-render row fallback after browser validation showed it
could reintroduce part art that the final render correctly rejected as fake
quantity rows. Final browser-rendered extraction owns all emitted rows. The
part-image foreground search also looks farther above each label before alpha
mask trimming, preserving tall same-row parts whose visible top sits well above
their printed quantity label. Saved regression examples are not refreshed for
crop growth; regression comparison allows added visual padding but still fails
when the stored part region shrinks or loses substantial opaque mask coverage.
Alpha 43 makes quantity rows tolerant of staggered labels from tall parts and
makes label ownership zones true row bands for part-image foreground search and
final crop clipping. A row owns vertical space from the previous row boundary to
the next row boundary, with first and last rows bounded by the callout interior,
so tall lower-row parts are not clipped by a fixed quantity-label bottom limit.
Labels remain suppressed in the alpha mask, nearest-label component scoring
still chooses the owned part, and tall-component ownership uses lower foreground
pixels only to avoid stealing same-row neighbors.
Alpha 44 fixes trailing staggered row labels. A lower label can still belong to
the same visual row when it continues the row left-to-right and its extra
vertical offset fits inside that row's own label span. This keeps tall trailing
parts in the row band up to the row above instead of starting their search at
their lowered label.
Alpha 45 aligns part ownership component discovery with alpha-mask weak
foreground handling. Pixels far enough from the callout fill to survive alpha
masking can seed owned part components, so small low-contrast upper-row parts
are not dropped before stored `partImage.region` and `partImage.alphaMask` are
built.
Alpha 46 bounds lower-row ownership at just below the previous label row
instead of the previous row top. This keeps lower-row tall-part search
non-fragile while preventing a lower label from borrowing upper-row parts and
quantity labels.
Alpha 47 makes selected foreground components the source of truth for part
alpha masks. The padded part-image region may still include breathing room, but
only pixels from components selected by label ownership can become opaque; other
foreground inside the padded rectangle stays transparent. This removes
neighboring part slivers and callout border pixels without app-side geometry,
manual ids, step ids, expected counts, source text OCR, BOM data, catalogue
data, or color-specific branches.
Alpha 48 extracts row-band/label ownership into a named part ownership module
and treats tight primary-adjacent fragments as part of the selected component
group even when the fragment center sits closer to the next printed label. This
keeps disconnected right-edge part fragments and compact upper-row parts from
being clipped while still leaving loose neighboring foreground transparent.
The rule is raster-only and uses only component adjacency, row label geometry,
and callout-local ownership scores; it does not use manual ids, page ids,
step ids, expected counts, source text OCR, BOM data, catalogue data, or
color-specific branches.
Alpha 49 keeps alpha-mask ownership unchanged and pads the stored part-image
region farther on the right after alpha-bound trimming. This gives compact
right-edge parts breathing room in the app thumbnail while unrelated foreground
inside the padded rectangle still stays transparent through the selected
component mask.
Alpha 50 keeps high-scale single-digit labels in narrow callouts by sizing the
label width gate against label height as well as callout width. This preserves
browser-rendered `4x` labels that are wider than the old callout-ratio cap.
Alpha 53 keeps stored part-image previews label-owned but adds more transparent
left and right breathing room around alpha-trimmed part masks, so small light
parts are not visually clipped while non-owned foreground remains transparent.
Alpha 54 keeps the same label-owned model and stabilizes MOC-129110 part rows:
callout-local background sampling removes fill gradients from alpha masks,
border and label-halo residue components are rejected before ownership scoring,
and a fused narrow `1` beside a readable `x` can be salvaged from the local
label band when adjacent part art prevents normal digit component discovery.
The browser saved-session guard now keeps Castle Ramp, Farm House, MOC-132385,
MOC-129110, and Middle Wall part rows checked through `/v2`.
Alpha 58 keeps those MOC rows and adds saturated-background ownership and
preview scrub handling. Near-fill pixels on saturated yellow/blue callout
backgrounds are treated as background-like during component selection, stored
mask creation, and `/v2` thumbnail hydration, so background gradients do not
visibly connect neighboring parts or survive in the rendered part thumbnails.
The scrub is a callout-local background rule; it does not use manual ids,
step ids, expected counts, source text OCR, BOM data, catalogue data, or
color-specific manual branches.
Alpha 59 keeps the same bounded raster OCR path and classifies connected,
closed-lower-loop `8x` labels before the source `9` fallback. The rule uses
source glyph loop-density and lower-left/lower-right closure, so browser
raster labels that visibly read `8x` do not inflate row quantity to `9x`
without adding manual ids, page ids, step ids, expected counts, source text
OCR, BOM data, catalogue data, or color-specific branches.
Alpha 60 adds per-callout background probing before part-mask cleanup. Each
callout background is classified as flat, gradient, or mixed from safe fill
bands and spatial bucket spread; extra gradient colors are accepted only when
they are broad fill evidence, while compact high-luma part faces are rejected
as mixed evidence and preserved. App hydration applies the stored extractor
mask instead of relearning or scrubbing part pixels.
The bag-analysis Playwright fixture gate compares alpha-mask content with
opaque coverage, extra opaque pixels, and masked visual equivalence, so
same-bounds but color-stripped part masks fail regression validation. The gate
resumes minimal PDF-only sessions through `/`, downloads a fresh browser
session after preview hydration, and compares against split callout and part
fixtures under `tests/e2e/fixtures/bag-analysis/**`.
Alpha 61 adds a source-feature `5` digit classifier before the closed-loop
fallback rules and increases bottom-only part image padding in both the
foreground source region and stored alpha-bound crop. Dense browser-rendered
`5x` labels are no longer over-read as `6x`/`9x`, and compact part thumbnails
keep lower breathing room without changing label ownership or adding
manual-specific rules.
Alpha 62 keeps the label-owned model and fixes Farm House 137856 failure
classes. Fresh-upload final part extraction now reports a visible
`part-extraction` phase after page scan; source OCR reads open-left `3` before
closed `8` and diagonal `7` before `2`; long part foreground search spans the
full owned row band while selected components still define opacity; far-from-
fill high-luma buckets are rejected as background, and owned/supported
near-background pixels stay fully opaque. `/v2` preview hydration applies only
stored package alpha masks, so it cannot strip tan/light part pixels.
Alpha 63 keeps the same package boundary and fixes MOC-169454 failure classes.
Top support preserves light white/gray top faces and studs inside the selected
owned component envelope before alpha trimming, source OCR reads a crossed
browser-raster `2` with a bottom-left tail before broad `4` fallback, high-
resolution multi-digit labels such as `12x` pass the quantity width gate, and
crowded wide labels stop borrowing neighboring same-row part components.
Alpha 64 keeps `/v2` package-only and fixes remaining MOC-169454 small-part
crop masks. Bottom support expands from the selected component envelope only
onto non-exact-background pixels, preserving low-contrast lower rims without
turning callout fill opaque. If a raised/embedded false quantity row is later
suppressed as a duplicate owner, the kept row is rebuilt with only kept labels
so studs and part details are not excluded from the alpha mask.
Alpha 65 keeps the same label-owned model and fixes remaining MOC-169454
thumbnail bottom clipping. Accepted quantity labels now carry their glyph
pixels into part ownership and alpha-mask creation, so label suppression removes
printed `Nx` strokes instead of the whole label rectangle. The change is
part-image label-suppression support only; it does not change OCR, expected
counts, source text OCR, BOM data, catalogue data, or manual-specific rules.
Alpha 66 keeps `/v2` package-only and starts Lower Courtyard part-row tuning.
The quantity candidate filter preserves the only readable label in a callout
when dense-glyph and close-foreground part-art checks lack competing label
context, and rejects raised high-value candidates that are oversized relative to
a nearby lower printed baseline. This keeps compact lone `Nx` callouts eligible
while suppressing small part art that was becoming fake quantity rows. Duplicate
row cleanup also drops same-owner same-row or near-row rows that survived
candidate filtering. The rules do not use manual ids, page ids, step ids,
expected counts, source text OCR, BOM data, or catalogue data.
Alpha 68 keeps `/v2` package-only and fixes Lower Courtyard compact lone
callouts that passed low-resolution crop extraction but were rejected during
high-resolution final extraction. Compact lower printed labels in narrow
callouts receive a scale-invariant area allowance, while raised/upper part-art
labels stay under the stricter cap. High-scale one-stem labels with a printed
base classify as `1` before the source `6` fallback, so lone `12x` callouts
remain readable. A reduced real-browser PDF made from the problematic pages
passes for steps 88, 224, 296, 328, and 373; full Lower Courtyard browser replay
keeps all non-target row counts and total quantities stable while changing only
the targeted steps.
Alpha 69 keeps `/v2` package-only and starts dense multirow callout extraction
for abnormal Lower Courtyard source page 193 / step 373 style panels. When a
callout already has a large dense grid of printed quantity labels, candidate
assembly retries with a lower top-label vertical coverage threshold. Large
dense label sets relax nearby-foreground part-art rejection because every valid
printed label sits close to part art, while large dense grids use local label-row
ownership and primary owned components so one printed label cannot borrow
separated neighbor parts. Smaller non-dense callouts still use close-baseline
part-art suppression to avoid raised part details becoming fake labels. Private
validation uses the project manual under `manuals/multipart/MOC-220614/`, a
gitignored clean one-page PDF sample under
`.bag-it/private/lower-courtyard-clean-step373/`, and the real `/v2` browser
upload runner; package replay or alternate PDF renderers are diagnostics only.
The user-approved Lower Courtyard saved session is now committed as
`manual-002.bagit-session.json` and included in the browser saved-session guard
with 373 callouts and 1459 checked part rows.
The user-approved Upper Courtyard saved session is committed as
`manual-003.bagit-session.json` and included in the same browser
saved-session guard with 205 callouts and 833 checked part rows.
The alpha88 accepted saved-session browser guard covers manuals 001, 002, 003,
005, 006, 007, 008, and 010 through real `/v2` upload/download with all saved
part rows checked.

Detector versions use SemVer. While the detector is still pre-MVP, the major
version remains `0`; heuristic iterations advance the minor version and
bug-only corrections advance the patch version.

Patch `0.134.1` keeps seeded light-fill callouts from being reduced to one inner
part fragment, rejects visual-only upper digit-sequence panels that represent
subassemblies rather than parts callouts, and rejects text-only step-number
fragments even when their fill color has been seen elsewhere in the manual.

Patch `0.134.2` tightens manual fill matching so page-white and warm off-style
panels do not match a seeded blue callout fill, accepts complete bordered
manual-fill callouts whose part image occupies most of the panel, and relaxes
the remaining page-relative cap for tall narrow bordered callouts. Medium
private regression `MOC-133471` is expected to detect 149 callouts with no
per-page count mismatches: one callout on annotated build pages through page
159, zero on annotated full-build/no-callout pages and inventory tail pages.

Version `0.136.0` adds three-point callout verification. A candidate must have
all three signals before it becomes a callout: at least one plausible `Nx`
quantity label, enclosing border evidence, and compatible callout background
evidence. Border evidence comes from the visible outer border first, with a
limited quantity-anchored partial-border fallback for small quantity groups.
Background evidence comes from the page-local/manual-local fill color and must
stay compatible with the accepted manual style; cover/title false positives and
unbordered inventory pages must not seed later background hints.

Version `0.137.0` adds bounded recovery for browser-rendered multi-callout
pages where manual-style panels are visibly bordered but raster quantity parsing
misses the `Nx` label. This path is diagnostic-only and produces zero-part Build
steps callouts: the panel must match an established manual-local callout
background, have strong outer border evidence, have another same-style callout
candidate on the page, and sit next to a raster step-number label. These
recovered panels do not create baggable part rows unless normal quantity and
part extraction later succeeds.

Version `0.138.0` adds same-page sibling recovery for multi-callout pages. After
one callout on a page is accepted, missed same-background bordered siblings can
be recovered from fill, border, and nearby step-number evidence. Recovery is
blocked on pages with no accepted callout, and nested fragments inside an
existing callout are suppressed so saved-good manuals do not gain duplicates.

Version `0.139.0` relaxes same-style visual recovery for browser-rendered
multi-callout pages whose printed step number sits below or below-left of the
bordered panel. This recovers missed same-background panels without admitting
off-style tan subassemblies or build-image fragments.

Version `0.140.0` keeps complete same-background sibling panels separate on
multi-callout pages. Quantity-backed fragments no longer expand when they
already have a complete border, enclosing-border expansion uses the nearest
bottom border, and same-background overlap cleanup suppresses nested fragments
without merging two complete adjacent callouts.

Patch `0.140.1` broadens sparse inventory cleanup so seeded manual-fill hints
do not keep a handful of tiny no-part quantity-label fragments on no-callout
inventory pages.

Version `0.141.0` expands seeded manual-fill quantity fragments across the
candidate row before snapping back to the visible border and trimming leading
step-number gutters only when the trimmed crop still contains quantity evidence.
It also suppresses same-origin contained duplicates so one full callout panel
wins over a narrower fragment. This keeps cropped previews from cutting away
the part image while preserving the saved-good small, medium, and farmhouse
manual counts.

Patch `0.141.1` makes leading step-number trim conservative. It no longer uses
the first matching background column as a trim edge, and it only trims a narrow
low-foreground gutter. Dark or gray parts at the left side of a callout must be
preserved even when they look like step-number ink.

Patch `0.141.2` adds a final border-pair expansion pass before emitting
callout regions. The expansion may exceed the generic page-area cap only when a
raster quantity label remains inside a bordered/background-backed panel, and
horizontal growth is clamped unless the new side edge has a continuous vertical
border. This preserves darker leftmost parts without absorbing nearby step
numbers or build-image foreground.

Patch `0.141.3` caps merged horizontal border runs to real border thickness.
This prevents build-image foreground rows from merging with a callout border and
masking a valid top/bottom border pair on pages where the callout touches dense
model art.

Patch `0.141.4` clamps loose quantity-backed candidates back to a proven
internal right border before final evidence verification. The clamp is only
accepted when the resulting region still has a quantity label, compatible
manual-local background, and complete top/right/bottom/left border evidence, so
dense build art cannot hide a real callout and valid callout crops keep the
full bordered panel.

Patch `0.141.5` tightens internal left-border trimming after MOC-77633 exposed
left-edge crop regressions on dark and gray parts. A trim to an internal border
now requires a continuous border-mask line, a dark-pixel line matching the
visible printed border, retained top/bottom/right border evidence, and retained
quantity evidence. This prevents step-number/build-image gutters from staying
in the crop while also preventing foreground part columns from being treated as
safe trim delimiters.

Patch `0.141.6` verifies manual-fill column expansion before accepting tall
panels, keeps complete border-pair regions when quantity, background, and border
checks all pass, requires raster quantity evidence before seeded fill expansion,
and merges overlapping same-band fragments. This keeps full callout panels from
being cropped while avoiding build-image spillover.

Patch `0.141.7` suppresses high-overlap duplicates with matching background and
adds a narrow contextual recovery for one standalone light visual callout only
after three same-page callouts already establish the page pattern. Light-fill
visual recovery ignores page-white pixels and snaps fill components back to the
nearest local border instead of padding into the page background. This recovers
the final annotated missed callout without allowing cover, inventory, or
subassembly panels to seed new manual styles.

Patch `0.141.8` adds a narrow stacked-sibling recovery for same-style pages
where one accepted manual-fill callout has an adjacent sibling that shares the
manual background but has segmented border evidence. The recovery uses the fill
component as the search seed, snaps back to nearby local borders, requires the
established manual background, and only runs from a page that already has one
accepted same-style callout. This recovers missed stacked callouts without
reopening broad visual-only recovery.

Patch `0.141.9` relaxes only the stacked-sibling recovery shape gate for
vertically aligned same-style panels. The normal visual-only recovery limits
remain tighter; the stacked path still requires an accepted same-page anchor,
manual-local background compatibility, local border evidence, and nearby step
or quantity evidence. Castle Ramp page 9 now keeps the lower valid callout
without changing saved-good private manual counts.

Patch `0.141.10` adds adjacent side-by-side same-style sibling recovery and a
final continuing-border crop expansion. Adjacent recovery is only allowed after
a same-page manual-style callout establishes the background and still requires
local border evidence plus nearby step or quantity evidence. The crop expansion
only runs for quantity-backed regions with a missing lower border, follows the
next compatible enclosing border, and rechecks quantity evidence so occluded
lower rows stay inside the callout without changing unrelated saved-good pages.

Patch `0.141.11` combines normal, visual-recovered, and standalone-recovered
callouts before sparse inventory pruning. Sparse inventory cleanup must retain
real manual-style quantity panels and remove only tiny contained duplicates
inside a larger quantity-backed bordered callout. Final output also trims
leading printed step-number gutters back to an inner bordered quantity panel
when that panel still carries quantity evidence, so build-image context is not
emitted as part of the callout crop.

Patch `0.141.12` rejects short, wide, off-style raster-only quantity strips
after manual-local callout style is known. This keeps warm/yellow build-image
or subassembly strips from surviving as extra callouts while preserving complete
manual-style bordered panels and sparse valid quantity callouts.

Patch `0.141.13` makes visual recovery quantity-backed again. Recovered
manual-style callouts must carry raster quantity evidence instead of nearby
step-number evidence alone, so build-image details, stained-glass fragments,
shields, model columns, and warm inset panels cannot survive as zero-part
callouts. Leading step-number gutter trimming is lossless: it keeps the
original callout when trimming would drop raster quantity labels or remove a
large left/top/bottom band from an otherwise usable bordered panel.

Patch `0.141.14` tightens final crop ownership for Hall Tower style pages. Tall
quantity-backed panels can extend to the continuing lower border when a lower
quantity row is otherwise cut off, loose crops can trim right-side build-image
spill to an internal bordered panel, and left-edge trims must retain all
original raster quantity labels when a reset icon or divider splits one real
callout panel.

Patch `0.141.15` keeps the Hall Tower crop fixes while restoring the saved-good
small-manual count for warm/yellow manuals. Off-style white subassembly panels
are recovered only when adjacent warm quantity callouts have already established
manual context, right-adjacent panels can use a shared quantity-panel top edge,
and page-bottom overrun is trimmed back to the lowest raster-visible callout
border so recovered panels do not include build-page background.

Patch `0.141.16` restores Hall Tower step 14 from the saved good session. Final
contained-panel trimming may not collapse a multi-quantity callout to an
internal one-label panel; every detected raster quantity label must be retained
before that trim is accepted.

Patch `0.141.17` applies the same lossless-label rule to all contained-panel
trims and left/right edge trims. Narrow right-edge trims also reject cuts through
foreground content on the same callout background, so the detector preserves the
full saved-good callout image instead of stopping at an internal part edge.

Patch `0.141.18` adds a bounded right-edge recovery for callouts whose top and
bottom borders continue past an internal part edge. The expansion is capped to
the local border pair and rechecks quantity labels, background, and all four
border edges so it restores the rightmost part without reopening page-wide
expansion.

Patch `0.141.19` adds the same local width cap to left/back shared-border
recovery. The detector now rejects same-row border lines that would merge
separate callouts into a page-wide crop, while retaining the Hall Tower page 162
and page 224 corrected crops.

Version `0.142.0` adds a hidden inventory-tail cutoff before heavy callout
detection in the browser scanner. It probes a bounded set of tail pages at low
render width, classifies only page-level inventory-likeness, and excludes a
confident contiguous inventory suffix from step-callout detection. It does not
parse BOM rows or expose inventory UI.

Patch `0.142.1` adds generic final crop recovery for quantity-backed panels
whose detected region sits inside the real printed border or cuts through a
rightmost quantity/part. The recovery searches only local border continuations,
requires compatible callout fill and retained quantity labels, and keeps the
smallest valid right expansion so adjacent build art is not absorbed.

Patch `0.142.2` rejects page-one decorative logo fragments as callouts when a
tiny near-white corner crop lacks top/right callout-border evidence and has
dense foreground logo content. Real blue or warm callout panels and complete
bordered quantity panels remain eligible.

Patch `0.142.3` rejects overlapping leak candidates whose top edge starts
inside another accepted callout panel and then extends far into the build image.
This keeps the real bordered callout and removes the duplicate build-art crop
without relying on manual, page, or step identifiers.

Patch `0.142.4` broadens generic recovery for right-cropped bordered quantity
panels and rejects top-aligned same-fill regions that duplicate an accepted
panel before leaking far downward into build art.

Patch `0.142.5` reruns peer-panel trimming until stable, bounded to three
passes. This lets a newly restored neighbor panel become trim evidence for a
larger same-row crop that swallowed multiple panels, without relying on manual,
page, or step identifiers.

Version `0.143.0` adds page-level possible-step-multiplier advisories. The
detector scans text items and a bounded raster glyph pass for `Nx` labels
outside accepted callout regions, emits only advisory `pageAttentionItems`, and
never applies those values to quantities or bagging automatically.

Patch `0.143.1` rejects raster quantity candidates where the `x` glyph is
immediately followed by another digit-like glyph. These `x digit` fragments are
not valid `Nx` labels and must not create part rows or page multiplier review
markers. Raster page-advisory candidates are also suppressed when a plausible
part foreground sits above the label on a blue callout-like background, which
treats leaked or missed callout quantity labels as part-callout evidence rather
than possible step multipliers.

Patch `0.143.2` invalidates same-version local saved results after the Hall
Tower issue-page replay proved the current detector recovers the full bordered
quantity panel for horizontally cropped fragments. Private regression now starts
with a reduced issue-pages manual containing the annotated Hall Tower, Upper
Courtyard, and Lower Courtyard pages, then compares those reduced pages against
saved-good counts and source regions before full manual validation.

Patch `0.143.3` makes outside-callout raster multiplier advisories more
conservative. It rejects `x digit` build-art traps on cluttered backgrounds,
removes long panel rules before page-level OCR, trusts lower-left-weighted
feature classification for dense `2` glyphs, and adds a narrow large-`2x`
fallback only around warm repeat-instruction panels. Lower Courtyard replay of
the annotated multiplier pages now flags pages 31 and 164 as `2x` while leaving
pages 21, 24, 26, and 27 unflagged.

Part extractor patch `0.4.5` pads the high-resolution preview crop around each
detected part while keeping the detector-owned `partRegion` stable. The added
source pixels are still background-masked in the preview, so tight left/right
part edges can be inspected without adding visible callout background.

Patch `0.143.4` classifies the current annotated detector failures as cropped
part previews, false quantity labels from part texture, and over-expanded
stacked callout recovery. It keeps pre-expanded sibling callouts when a border
expansion leaks upward into a peer panel, suppresses part-row quantity labels
that are not on plain callout background, and keeps page-level multiplier
advisories from treating part-callout labels as outside-step multipliers.

Part extractor patch `0.4.7` keeps high-resolution preview padding for row part
crops while masking transparent background and removing disconnected alpha
components that do not intersect the detected part box. This keeps edge context
for the owned part but hides neighboring part slivers and callout borders. The
cleanup is preview-only; detector geometry and session coordinate anchors remain
stable.

Part extractor patch `0.4.8` rejects raster quantity candidates whose label
background samples match a local part surface instead of the inferred callout
background. It also widens the quantity-owned foreground search and keeps the
raw connected component during expansion even when neighbor label ownership is
ambiguous, so tall or long connected parts are not cropped at the first
detected slice.

Part extractor version `0.5.0` adds advisory part color detection from the
part-only crop. It samples dominant non-background pixels, matches only against
a conservative common LEGO fallback palette, and emits low-confidence or
family-only review metadata instead of choosing rare colors by nearest RGB.

Part extractor patch `0.5.1` ports the legacy foreground-ratio quantity-label
guard into the current raster item path. Accepted labels must sit on clean
callout background, not on part texture or border fragments, and immediate
above-label traps are suppressed. Same-row part crops split by neighboring
part-region boundaries rather than hard quantity-label edges, which keeps
crowded connected parts from losing their right side while still separating
adjacent rows.

Part extractor patch `0.5.2` widens high-resolution part preview source crops
with size-aware transparent padding while retaining the connected-component
cleanup. This fixes Middle Wall steps 44, 87, 91, 92, and 95 where the owned
part pixels reached the top or right preview edge after `0.5.1`, without
changing detector-owned part geometry or allowing disconnected neighbor
fragments back into the visible preview.

Part extractor patch `0.5.3` keeps narrow/open raster `4x` quantity labels from
falling through to the skinny-`1` classifier, and makes high-resolution row
part previews keep only the best connected foreground component that intersects
the detected part box. The preview crop source can now use a larger transparent
padding window to avoid cut right/top edges, while disconnected neighboring
parts or border slivers stay hidden from the visible part image.

Part extractor patch `0.5.4` trims the retained alpha bounds after part-preview
background masking. The detector may still use a padded source window to avoid
cutting off long or edge-touching parts, but the emitted part crop image and
preview region shrink to the visible connected part pixels.

Part extractor patch `0.5.5` adds a small transparent frame around the retained
alpha bounds. This is preview-only: detector-owned `partRegion` geometry stays
stable, disconnected neighbor fragments remain hidden, and restored sessions
rerun only part extraction so top-edge part thumbnails are not visually shaved.

Version `0.143.7` keeps detector output geometry stable while shortening the
long-manual critical path. Browser scans return callout and part geometry
before page/crop preview images are rendered, then hydrate preview images in
small batches after the usable scan result is available. The detector also
caches pure per-glyph density, bitmap, segment, and border-mask derivatives
inside a scan. These caches do not change thresholds or candidate acceptance.
The browser inventory-tail cutoff tolerates one weakly classified page inside a
strong inventory suffix so dense appendix pages are skipped instead of scanned
with the heavy detector.

Version `0.144.0` adds seeded parallel page detection in the browser scan path.
The scanner runs serially until the first accepted callout yields stable
manual-local fill hints, then renders and detects later pages with a bounded
worker pool. Worker results are committed in original page order, so step
indices, scanned-page ordering, session anchors, and progress counters remain
deterministic. If preview images are requested eagerly or workers are
unavailable, the scanner falls back to the serial path.
It also adds generic recovery for leading printed step-number crops that leave
only the right edge of a real quantity panel. The recovery searches near the
cropped fragment for a compatible light-fill component, requires raster
quantity evidence and strong top/right/bottom/left border coverage, preserves
left strips that already contain quantity-label evidence, and keeps that
recovered bordered panel through final crop cleanup. It does not add
manual-specific page or step guards.

Patch `0.147.11` keeps smaller complete bordered quantity panels from being
removed by a larger same-fill candidate that already qualifies for contained
panel cleanup. This preserves separate manual-style callouts when an
intermediate recovery candidate spans multiple panels, without adding
manual-, page-, or step-specific guards.

## Inputs

Primary input:

- parsed PDF document with page count and `getPage(pageNumber)`

Options:

- `excludedPageNumbers`: optional set of pages to skip; default empty in the
  fresh MVP
- `maxPages`: optional page limit; default full manual
- `renderMaxWidth`: default around 1400 pixels for detection quality
- `colors`: optional color palette; fresh MVP should use a built-in fallback
  palette when absent
- `signal`: abort signal
- `onProgress`: progress callback
- `useNativeTextLayer`: optional, default false
- `useStepNumberLabels`: optional, default false

Do not require inventory rows or BOM rows in the fresh MVP.
The first shared step-callout fixture gate must exist before Bags depends on
detector output.

## Progress And Scheduling

Browser scans should process pages incrementally instead of rendering the whole
manual before detection starts. For each included page, render the page, run the
detector, publish progress, then release the page image before moving to the
next page. Preview images are not on the scan critical path: after geometry is
ready, the browser generates runtime page preview assets in bounded priority
queues.

For long manuals, the browser scanner may switch to seeded worker parallelism
after the first accepted callout establishes fill-color hints. Later pages are
independent work items, but their results must be committed in page order.
Parallel detection must stay bounded by a small worker count and must not run
when eager preview generation needs the rendered page pixels on the main thread.

Long manuals should publish progress at least once per scanned page, plus
lightweight render/detect phase messages when the browser path can emit them.
The browser path should yield between page-level phases so React can paint
status updates and a 400-page manual does not produce one long main-thread
stall.

During a full fresh scan, page evidence may stream, but Build steps rows and
callout totals are not provisional. The final conflict resolver runs after all
page evidence arrives, then the separate part-extraction pass processes
accepted callouts and publishes part progress. The page scan progress row must
not display raw candidate/evidence counts as detected callouts, and must not
include part extraction work or part-row progress. As each page streams through
detector workers, scan progress publishes the cumulative conservative
page-local resolved visible-callout count so users see the same numeric callout
progress style as part rows; final full-manual resolution remains authoritative.
The Build steps tab's live analysis panel keeps the completed page-scan summary
visible while part extraction runs, then adds the active part-extraction page,
processed/total callouts, and part-row count instead of reverting to generic
pending text.
When a restored session already has current callouts but lacks current part
extraction, the browser path should render only pages that contain restored
callouts, process those callouts page by page, emit part-extraction progress,
and leave the existing callout detection result otherwise intact.

The production browser scheduler uses bounded streaming queues:

- page scan rendering keeps one low-resolution page render in flight by default
- detector work runs in a small worker pool capped at four workers and
  `navigator.hardwareConcurrency - 1`
- page evidence is committed in page order, and final conflict resolution runs
  after all page evidence arrives
- part extraction renders only pages with accepted callouts and
  uses a small worker pool capped at two workers
- preview generation is a separate priority queue and emits independent
  progress based on total preview pages
- each needed page gets one sharp runtime page image at a default target width
  of `2200px`, encoded as `image/webp` quality `0.92` with PNG fallback
- page previews render directly from the page asset; callout and quantity-label
  previews render as CSS region crops over the page asset, so they do not
  allocate crop image blobs
- part previews render immediately as rectangular CSS region crops from the
  page asset, then visible or near-visible rows upgrade to transparent
  part-mask blobs from stored `partImage.region` and `partImage.alphaMask`
- the critical queue starts with the expanded or visible page plus pages 1-6 on
  first Build steps render; adjacent and remaining pages continue in a warm
  queue without scroll events
- large manuals do not run an immediate all-offscreen preview sweep after part
  extraction; their preview slots remain reserved while the low-priority
  background queue hydrates pages gradually without blocking the workbench

Runtime preview assets live in a runtime-only preview asset store, not inside
`StepCalloutDetectionResult`. Existing `imageDataUrl` fields remain
backward-compatible imported-session fallback fields only. Session export
strips `blob:` URLs and restore rehydrates missing previews from the embedded
manual. If a preview job reuses higher-resolution part-extraction pixels, it
scales base-coordinate regions into that high-resolution source instead of
normalizing the source down to saved page-preview bounds.

Use `scripts/benchmark-step-scan.mjs` through `npm run benchmark:steps` for a
small local detector progress benchmark. It must not require private manuals and
must report elapsed time, per-page timing, progress-event count, and maximum
progress gap.

Private manual performance replays may use ignored scripts under
`.bag-it/private`. They may report aggregate timing and page counts, but must
not commit source PDFs, rendered pages, crop images, row-level debug output, or
exact private coordinates.

## Output Contract

`StepCalloutDetectionResult`:

- `detectorVersion`
- optional `partExtractorVersion`
- `pageCount`
- `pageLimit`
- `scannedPageNumbers`
- `skippedPageNumbers` or equivalent, if exclusions are used
- `status`: `detected` or `empty`
- `pagePreviews`: per scanned page preview metadata and optional in-memory image
  data for UI validation context
- `pageAttentionItems`: advisory page-level findings such as possible
  outside-callout step multipliers; these are review markers only and must not
  change quantities automatically
- optional `sectionBoundaryHints`: detector-owned page-level signals that the
  bagger may use as preferred bag delimiters. The initial hint kind is
  `off-style-rejected-callout` with `position: "before-page"` for rejected
  off-manual-style panels near the first visible callout band on a page.
- `callouts`
- optional `stepLabels`
- optional `timing`: aggregate render/detect scheduling timings with no private
  image bytes or exact coordinates
- optional `previewTiming`: aggregate lazy preview hydration timings
- optional `qualitySummary` for fixture/dev validation runs, not normal user
  analysis

`DetectedStepCallout`:

- stable `id`
- `pageNumber`
- `indexOnPage`
- assigned `stepIndex`
- `confidence`
- `sourceImage`
- `sourceRegion`
- `crop`
- optional in-memory `crop.imageDataUrl` for the Build steps thumbnail/hover
  preview
- `partItems`
- optional `stepLabel`

`DetectedStepCalloutPartItem`:

- stable `id`
- `indexOnCallout`
- `confidence`
- optional `detectedColor`: manual-local color class plus advisory LEGO color
  name. `manualClassId`, `manualClassHex`, and `swatchHex` are authoritative
  only within the current uploaded manual/session, and `manualClassTrusted`
  controls whether the class may constrain prototype same-part grouping.
  `name`, `family`, and palette distance are hints for user scanning, not
  inventory identity.
- `sourceRegion`
- `partRegion`
- optional legacy `partCrop` from the default route
- optional `partImage`: v2 package extractor output containing
  `partImage.region`, `partImage.alphaMask`, and preview `imageDataUrl` after
  hydration
- `quantityLabel.crop`
- `quantityLabel.region`
- `quantity.value`
- `quantity.text`
- `quantity.confidence`
- optional `imageSignature`
- optional `localImageMatch`
- optional bounded rejected-match diagnostics

Fresh MVP output should not include BOM match fields in the default data model.

Per-part image and quantity-label extraction is detailed in
[Part image and quantity extraction plan](part-image-quantity-extraction-plan.md).
The key implementation constraint is that item extraction runs after callout
acceptance, with the accepted callout's inferred background already available.
Private known-good raster manuals do not expose reliable text items for visible
`Nx` labels, so the item extractor must include a raster path and cannot depend
on native PDF text.

Implemented v2 part extraction uses raster `Nx` label detection only. Native
PDF text items are not a fast path, fallback, or hint for part rows. Raster
quantity recognition uses connected glyph components and density-grid feature
classification for proportional browser glyphs. Raster items are sorted
row-major. Each quantity label gets a
legacy-style anchor zone for ownership, but part foreground search is widened
past the label-midpoint boundary and then constrained by neighboring quantity
label edges plus foreground ownership scoring. Disconnected foreground
components are merged only when they are tightly adjacent to the selected
quantity-owned component, so neighboring parts in the same search region do not
become one crop. The emitted `partRegion` must not overlap the emitted
`quantityLabel.region`.

## Part Color Calibration

Part color detection lives in workspace package `@bag-it/part-colors`. The app
runs calibration after final v2 part extraction and before publishing the final
Build steps result. The package samples only pixels inside each
`partImage.region` where `partImage.alphaMask` is filled, excluding callout
background-like pixels, quantity-label regions, crop borders, and tiny noise.
Background-like pixels inside the filled alpha mask are soft evidence: they
remain rejected for ordinary colored parts, but the sampler may keep them when
the masked part is otherwise neutral and neutral light pixels own the mask core.
This identifies actual white rendered parts rather than gray shadow/outline
pixels or pale blue callout fill.
Dark filled parts remain valid samples; dark outline-only pixels should not
pull a light part into a black class.

The primary output is a manual-local color class:

- `manualClassId`: deterministic within one analysis result
- `manualClassHex` and `manualClassRgb`: class centroid from sampled rows
- `manualClassTrusted`: true only for rows whose manual-local sample and class
  are stable enough to influence prototype same-part grouping
- `swatchHex`: current UI swatch, set to the manual class centroid
- `manualClassConfidence`: class stability signal

LEGO color names are advisory only. The package maps each manual-local class to
a conservative fallback LEGO palette by Lab/LCh distance and CIEDE2000, then
marks uncertain rows/classes as `review`, `family`, or `unknown`. This metadata
helps sorting and scanning but must not be treated as catalogue identity.

Runtime advisory names may also come from committed aggregate color prototypes.
Those prototypes are aggregate centroid/support data trained from current,
conflict-free private `train` labels only. They must not contain row ids,
manual ids, crop hashes, source titles, crop images, or per-row exemplars.
Prototype training clusters same expected-color examples with CIEDE2000
distance `5`, keeps only new candidate clusters with support `>= 4`, and runtime accepts a
prototype name only when the nearest prototype distance is `<= 8` and the
nearest different-name margin is `>= 1.5`. If no prototype passes, the resolver
uses the conservative fallback palette path. Prototype matches remain
review-grade advisory names and do not make `manualClassTrusted` true.
The runtime prototype updater is additive by default: it preserves the current
committed aggregate set and promotes only trained clusters that are not already
represented by the same expected color within the cluster distance. Full
replacement is an explicit `--replace` operation and must pass the same private
label gates before commit.
Before either prototype or fallback naming, calibration may replace a selected
near-black sample chip with stronger neutral body-chip evidence from the same
saved sample. This is limited to feature-based chip coverage and luma/chroma
signals, preserves blue-biased near-black body evidence as Black, and exists to
stop small light/dark bluish gray parts from collapsing into black outline or
shadow pixels.
Source-specific fallback evidence may also override a prototype match when the
same sample exposes a bounded, repeated body-color pattern. Current examples
include tiny shadowed yellow parts that otherwise land on a Trans-Yellow
aggregate prototype; the rule requires very small accepted-pixel counts, high
background/edge rejection, shadow-yellow chip support, low bright-yellow body
coverage, and dark shadow evidence.

Same-part visual grouping remains a comparison/prototype feature. When both
candidate rows have `manualClassTrusted`, visual grouping requires the same
`manualClassId`. If either row is missing or has an untrusted manual class,
grouping keeps the existing conservative family/name fallback. Grouped rows do
not aggregate canonical bag rows or completion anchors.

BOM or parts-list pages, when intentionally reintroduced later, may provide
calibration evidence for naming manual-local classes. They remain outside this
slice for quantities, part ids, inventory reconciliation, Rebrickable matching,
and user-facing BOM UI.

Private tuning uses:

```bash
npm run report:part-colors -- <session.bagit-session.json>
```

The script writes ignored JSON/HTML reports under
`.bag-it/private/part-color-reports/**`, including class swatches, app-matching
part quantity counts, row counts, visible part-mask previews, sampling overlays,
top color chips, sample/rejection counts, nearest palette names, distances,
confidence/status, and review/unknown rows. The default tuning report uses saved app
`detectedColor` assignments from the session so report groups match the app UI.
The optional `--recompute-colors` mode rerenders embedded manual bytes and
recomputes samples/classes only for renderer-drift research; that mode is not
the app-parity tuning view.
Each report also writes a generated private label workbench app at
`.bag-it/private/part-color-reports/<manual>/index.html`. That file is a small
static app shell backed by adjacent `workbench-data.js`, `workbench.js`, and
`workbench.css`. Expected-color inputs use a custom searchable suggestion menu
backed by a committed Rebrickable bulk color catalog generated from
`https://cdn.rebrickable.com/media/downloads/colors.csv.gz`, plus current
resolver legacy names needed for existing labels. The workbench does not call
the Rebrickable API at label time, so it works from local private report
folders without fetching or recomputing color data. Refresh the catalog with
`npm run update:rebrickable-colors` when Rebrickable updates the CSV. The app
reads only that report's saved app color data for labeling, shows row crops,
source-callout previews with the part region outlined, sample chips, current
advisory color, role dropdowns and expected-color inputs prefilled from
canonical saved app detected colors, conflict/drift badges, and filter
controls, then exports label JSON by copy or download. Workbenches with more
than 500 rows are split into linked chunk pages, with `index.html` as chunk one
and `part-002.html`, `part-003.html`, and so on for the remaining chunks. Each
chunk includes at most 500 rows and downloads a distinct partial label JSON
name; the final durable label file may still be one combined
`<manual>.json` under the private labels folder. Unknown or non-canonical
detected colors stay blank until the user chooses a label. Blank expected-color
rows are omitted unless they carry a note or are marked `excluded`; those rows
export as `excluded` so missing color notes and unusable crops remain visible
but ignored by scoring/training. Typed expected-color values must match a
catalog suggestion exactly before export; partial search text blocks export so
typo labels cannot enter training. The suggestion menu supports keyboard
navigation with Arrow Up, Arrow Down, Enter, and Escape. During labeling, Tab
and Shift+Tab move only between expected-color fields, skipping notes, role
selects, links, and action buttons so large manuals can be labeled as a fast
keyboard pass. The detailed audit tables live in `details.html`. If the report
was not generated from saved app color data, or its part-color or
part-extractor version metadata is stale, the workbench shows a stale warning
and blocks training export.
The class-summary `Parts` total matches the Bags tab color bucket quantity. The
`Rows` total remains the row-level audit count. The class-summary sample column
shows every assigned part crop; the row-by-class section is the detailed audit
view with per-row sampling overlays and chip coverage.

Private row labels may be stored under ignored
`.bag-it/private/part-color-reports/labels/**`:

```json
{
  "manualId": "02-middle-wall",
  "status": "gate",
  "reportPath": ".bag-it/private/part-color-reports/02-middle-wall/report.json",
  "labels": [
    {
      "itemId": "v2-p1-fill-panel-001-part-1",
      "expectedName": "Black",
      "role": "gate"
    }
  ]
}
```

Row `role` is optional for backward compatibility. A top-level `status:
"gate"` defaults unlabeled roles to `gate`; `status: "active"` defaults them to
`active`. Supported roles are `gate`, `train`, `holdout`, `active`, and
`excluded`. Only current, conflict-free, clear `gate` and `train` labels can
enter training datasets. `holdout` and `active` labels score only. `excluded`
labels stay visible but are ignored by training and scoring totals.

When a matching label file exists, the report shows expected color, label
match/mismatch state, label notes, and an annotated mismatch table above the
class summaries. Notes are hidden for rows whose current result matches the
label so stale review comments do not clutter tuning. If multiple labels point
to identical crop evidence but disagree on expected color, the evaluator reports
those rows as label conflicts, not detector mismatches. `gate` labels fail
detector regression validation on mismatch, missing rows, or label conflicts;
`active` labels report score and conflicts only while a manual is still under
tuning.

Private dataset evaluation uses:

```bash
npm run report:part-color-training
```

The command reads private reports plus labels and prints manual, family,
close-pair confusion, dirty-label rejection, and trainable-count summaries. It
is evidence for resolver tuning; promoting runtime prototypes still requires a
separate code change, version bump, app-parity saved-session refresh, report
regeneration, and label-score validation.

Runtime prototype evaluation uses:

```bash
npm run evaluate:part-color-runtime -- --manual-ids 01-castle-ramp,02-middle-wall,03-lower-courtyard
```

The command reads private labels, current reports, and each report's
`sourceSessionPath`, then reruns `calibrateManualPartColors` from the saved app
sample data. It compares runtime names to the saved report names so prototype
changes can be rejected before report regeneration. While detector fixes are
pending, safe additive prototype promotion may proceed only when no scored
manual worsens; full app-parity acceptance still requires regenerated saved app
sessions and reports after the detector version settles.

Part extractor `0.4.3` keeps strict standalone raster-label requirements for
callout evidence, but relaxes label recovery only after a callout has already
been accepted. In item extraction mode, the `x` glyph is treated as the anchor:
if adjacent left part noise makes a real label look like an oversized multi-
digit value, the extractor keeps the nearest plausible digit suffix. Loose
labels that remain implausibly wide are suppressed so part-edge glyphs do not
become extra rows.

Part extractor `0.4.4` keeps detector geometry at normal scan resolution but
generates part-row crop previews from a second, preview-only page render capped
around 2200 pixels wide. The emitted `partRegion` and `quantityLabel.region`
stay in detector coordinates for stable session anchors and row sizing; only the
PNG pixel data behind the part and quantity crop previews is sharper. This pass
runs only for pages that already have part rows.

V2 part extractor `2.0.0-alpha.31` is provided by
`@bag-it/callout-parts`. It emits `partImage.region` and
`partImage.alphaMask` as the authoritative part-image data. The app preview
path no longer computes a tighter `partCrop.region` or matte; it crops rendered
page pixels from `partImage.region` and applies `partImage.alphaMask`
mechanically. Alpha 31 keeps adjacent compact labels split, supports connected
digit+x blobs, and preserves the current label-owned foreground assignment.
Alpha 13 additionally rejects raised
translucent part fragments that mimic labels only when a stronger lower label
baseline is present, and it expands reusable raster digit shape rules for
browser-scale `3`, `5`, `6`, and `9` labels. Alpha 14 extends that baseline
guard to close raised sparse/noisy rows and drops too-short label-like
fragments from light part art. It also adds asymmetric crop padding so
low-contrast part fill above
a detected dark edge is retained without widening into adjacent parts.
Alpha 15 extends this to same-column part slivers above lower labels and adds
top-only visual crop padding for preview thumbnails.
Alpha 17 adds the same-column/touching-baseline variant of that guard for
part-art marks that sit just above lower real labels, still without
manual-specific tuning or source text OCR.
Alpha 20 adds a dense-cap rejection pass for quantity candidates whose raster
mask has consecutive near-solid horizontal bands. This keeps compact studs and
small curved part fragments from becoming fake quantity labels while preserving
real text-like raster labels.
Alpha 21 adds a local foreground-continuation check below each assembled
candidate, so part tops, studs, and edges that only resemble label glyphs are
filtered after the full `Nx` candidate is known. It also keeps overlapping
multi-digit labels over suffix-only candidates when both share the same real
`x` anchor, fixing `12x` labels that otherwise collapsed to `1x`.
Alpha 22 narrows x-like digit ownership to uninterrupted multi-digit labels,
trims one bridge column from connected digit+x blobs before split scoring, and
rejects connected split candidates whose mask still looks like a dense part cap
rather than isolated printed glyphs.
Alpha 25 adds a bounded raster OCR read layer for already-detected quantity
label crops. Candidate detection still finds likely labels and applies
label/stud rejection; OCR only reads the final `/^\d+x$/i` text/value from the
found crop.
Alpha 26 removes digit-value classification from candidate assembly and
suppression. Candidate detection now uses only glyph geometry, `x` ownership,
baseline, and local foreground checks; the OCR layer owns all digit-value reads.

## Algorithm Stages

### Page Selection

Scan all pages by default. If exclusions are supplied, use this ordering
behavior:

```ts
for page 1..pageCount:
  include page if not excluded and under maxPages
```

In browser scans, run a hidden tail preflight before page selection unless
disabled. The preflight renders at low width and may add a contiguous
inventory-like suffix to `excludedPageNumbers`. This is only a safety cutoff for
step detection; it must not read, normalize, or store BOM rows.

### Page Render

Render each page to a canvas suitable for image processing:

- preserve aspect ratio
- cap width to the configured max width
- support abort during render
- clean up page resources after processing

### Region Detection

Detect candidate callout rectangles from visual evidence:

- sample page background
- find bordered rectangle candidates
- infer each candidate's interior background color after removing border, text,
  quantity labels, and foreground part pixels
- detect high-contrast light fill panels on dark/illustrated pages when the
  border is weak, broken, or visually merged into the page background
- use the first page with build-step evidence as the optional style seed, not
  the first PDF page; covers, full-build renders, legal notices, and support
  pages must not define callout style
- after accepting a callout, retain its inferred fill/background as a
  manual-local hint for detecting later fill panels with the same style
- keep page-local background inference as a hint, not a hard color gate
- avoid absolute callout-size assumptions in acceptance; small manual-fill
  panels must be evaluated by border/background evidence, while residual
  geometry guards may only suppress obvious fragment noise before final evidence
  checks
- find callout fill components only as secondary evidence
- detect native-size candidates
- detect downscaled small candidates
- detect small bordered callouts
- assemble callout rectangles from separated horizontal/vertical border line
  segments when the printed border is broken at corners or rasterization gaps
- use raster quantity labels as callout acceptance anchors; native PDF text and
  source text OCR are not callout discovery inputs
- verify every accepted candidate with three independent signals: a plausible
  `Nx` quantity label, enclosing border evidence, and compatible callout
  background evidence
- for browser-rendered multi-callout pages, allow a bounded zero-part diagnostic
  recovery when a bordered manual-style panel has same-page callout context and
  nearby step-number evidence but no parseable raster quantity
- allow strong visual callout rectangles to fill gaps only when they align with
  an already-evidenced callout row or another multi-callout row
- complete bounded missing panels in an otherwise clear two-row/three-column
  build grid only by using the inferred grid slot as a search window; the
  accepted crop must snap to a bordered/background-backed panel inside that
  window rather than to the guessed slot size
- keep row-aligned tiny bordered callouts after normal same-page callouts have
  established a build grid, while keeping this path disabled on pages without a
  multi-callout build grid
- allow a sparse grid row to admit one background-backed missing panel when
  existing same-page callouts prove the row/column context, but continue to
  reject pale/tall subassembly strips
- accept single small bordered callouts whose fill matches an already accepted
  manual-local callout background only when raster quantity evidence remains
  inside the accepted panel; rejected text-fragment quantity is diagnostic only
  and must not unlock acceptance
- expand quantity-backed fragments to the enclosing visible border when a large
  callout was split into multiple same-background pieces; the final crop must
  use the outer border, not the foreground part bounds
- expand seeded fill fragments to the full bordered panel before final quantity
  validation when a weak bottom/right edge would otherwise crop out the quantity
  row or rightmost part
- merge overlapping same-background fragments only when their union still has
  top, bottom, left, and right border evidence and contains raster quantity
  evidence
- reject visual-only panels whose inferred background differs from
  quantity-backed callout backgrounds already found on the same page
- after a manual-local callout background is established, reject gray
  build-image fragments that only look quantity-backed but do not match that
  background style
- when a quantity-bearing off-style panel contains a bordered region matching
  the manual-local callout background, keep evaluating the inner region; the
  rejected outer panel must not suppress the real manual-style callout
- reject dark raster-only cover/logo panels when no compatible raster quantity
  hint is present
- reject inventory-style pages made of many page-background quantity/part pairs
  without callout panels; parts-list OCR remains out of MVP scope
- reject sparse leftovers on dense inventory pages when quantity-like raster
  labels are widespread but no real bordered callout panel is present
- page-background quantity-backed candidates are valid only when all outer
  border edges are visible enough to delimit a callout panel
- do not use near-white page-background detections as fill-style hints for
  later pages
- merge and suppress overlapping candidates
- reject bordered non-callout boxes unless quantity-anchored part evidence is
  present or the box's background matches a prior accepted manual-local callout
  fill
- reject numbered build-sequence panels when they have labels such as `1`, `2`,
  `3` but no lower part quantity label; raster `<number>x` evidence must be a
  plausible quantity label with nearby part pixels above it
- reject isolated lower panels and pale/tall subassembly strips as non-callout
  build-sequence panels
- sort candidates top-to-bottom, left-to-right

The accepted callout-first path should not depend on printed step labels.

### Optional Step Labels

When enabled for diagnostics:

- detect printed step number labels
- normalize labels into a sequence
- reject labels inside detected callout regions
- optionally use labels to anchor callout search
- store labels separately from callout data

Default MVP behavior assigns fallback step indexes by callout order.
Fallback indexes are ordering handles only. The UI should avoid presenting them
as verified printed step numbers unless an explicit step-label source exists.

### Callout Crops

For each accepted region:

- pad the region
- crop a callout image
- trim leading printed step-number pixels only when the detected region's left
  edge is not already the callout border and an internal bordered callout can be
  identified; never trim past a proven outer border
- create a stable callout id from page, page-local index, and source region
- detect part items from the callout crop
- discard zero-part callouts from bagging, but keep them visible in Build steps
  diagnostics if they are returned

### Part Item Detection

Part item detection should use the quantity-anchor approach:

- find visible `Nx` quantity labels
- parse the numeric run before the trailing `x`
- support multi-digit quantities
- use quantity labels as anchors for item rows
- find the nearest owned foreground part region
- reject broad model fragments and frame/rule components
- reject quantity-looking glyphs embedded in parts or immediately stacked above
  a real lower quantity label
- reject wide, low-confidence single-digit candidates raised above multiple
  compact baseline labels, because those are usually part-art strokes near an
  `x`-like component rather than printed quantity text
- keep quantity-label pixels out of part previews, color sampling, and image
  signatures
- output both the quantity-label crop and part-only crop

Unknown or untrusted quantity should stay represented with `value: null`; bagging
will count it as `1` and mark the bag for review.

### Color Detection

`@bag-it/part-colors` emits advisory part color metadata for each detected part
row when a usable non-background color sample exists inside `partImage.region`
and `partImage.alphaMask`. Color detection is not catalogue certainty. It may
affect prototype same-part grouping only when both rows have
`manualClassTrusted`; otherwise grouping falls back to conservative family/name
compatibility. The package:

- samples pixels inside the detected part-only mask, excluding callout
  background-like pixels, quantity-label pixels, crop borders, and low-alpha
  fringe pixels
- emits ranked local color chips rather than averaging the whole crop
- samples app-side part colors at the same base coordinate scale as returned
  part item regions, even when part extraction uses a higher render scale
- routes usable samples into coarse color families, then clusters manual-local
  row samples conservatively within those families
- emits extra manual-local classes rather than merging close families such as
  warm transparent variants, gold/nougat/tan, or silver/gray before training
  evidence supports it
- matches each row against a conservative common LEGO fallback palette only for
  advisory review names and near alternatives
- emits observed hex/RGB, manual class metadata, trust flag, sample chips,
  status, and near alternatives
- keeps shell classes untrusted and `review`/family-only until accepted
  training labels promote a family resolver prototype
- keeps visual labeling and dataset evaluation in ignored private reports, with
  runtime behavior unchanged until a later tuning slice explicitly promotes
  trained prototypes through the documented gates

Build steps row thumbnails display quantity-label crops and part crops at their
original crop pixel size, and their preview panels shrink-wrap the crop instead
of filling the table cell. The shared hover/focus preview for these row images
must not enlarge beyond 2.5x the original crop dimensions.
The browser scanner may render a second high-resolution page only after
callout and part geometry is known, then scale the crop source rectangle into
that render for image data. It must not run detection at this higher resolution.

### Local Image Grouping

Keep local visual grouping as structured evidence, not as a confident catalogue
identity:

- compare callout part crops inside a five-step window
- never group two items from the same step
- use preserved-aspect masks/signatures
- compare shape, structure, detail, aspect, coverage, compactness, embedding,
  and color
- require mutual strong pair matches
- store bounded rejected candidate diagnostics when useful

The fresh Bags checklist should still render one raw callout part item per row.
Any aggregation by local image group is internal/debug-only until proven.

## Progress Contract

Progress events should include:

- active page
- scanned page count
- target page count
- detected callout count
- detected part row count
- progress percentage
- message
- optional elapsed and estimated remaining time
- optional last-page timing

Throttle progress so UI updates are useful without excessive re-rendering. Use
minimum progress delta and interval guards.

## Build Steps Tab Acceptance

- The tab is always visible.
- Every scanned page appears, including pages with zero detected rows.
- Page groups are sorted by page number.
- Page groups render as open-by-default accordions and can be collapsed.
- Page previews sit above page rows on desktop so the preview remains the first
  inspection context for each page.
- Rows are sorted by step index then callout position.
- Page preview work starts as soon as scanned page pixels are available, before
  final callout resolution or part extraction finishes.
- Page preview sets load through a small bounded queue so preview work does not
  monopolize browser memory or the main thread.
- Page, callout, quantity-label, and part-image previews for offscreen pages
  keep their reserved slots until the page becomes near-viewport priority and
  their object URLs arrive.
- Existing page renders with no image data are retried through lazy render
  loading.
- Unavailable page previews show a placeholder.
- Callout crop thumbnails open an enlarged hover preview.
- Zero-part callouts show `Not bagged` and no multiplier controls.
- Callouts with detected part rows show a step multiplier control in the
  callout header. Multipliers are whole numbers from `1` to `99`, default to
  `1`, and update displayed row quantities plus callout total quantity
  immediately.
- Pages with possible outside-callout `Nx` labels show a compact review marker
  and list the advisory labels so the user can decide whether to adjust a step
  multiplier.
- Build steps shows step, multiplier, part types, total quantity, and
  background per callout header for detector debugging.
- Callout header metadata should stay compact: from tablet/desktop widths it
  fits in one horizontal row, falling back to wrapped rows only on narrow
  mobile screens, and the metadata row spans the full callout card width instead
  of sharing a narrow column with the callout preview.
- Empty detection result shows a no-callouts attention state instead of implying
  bagging is ready.
- A result with only zero-part callouts shows those rows in Build steps but
  leaves Bags in a no-baggable-callouts state.

## Minimum Correctness Gates

Before this detector can drive the Bags tab in the fresh MVP, it must satisfy
the [Fresh MVP quality gates](quality-gates.md), including:

- page coverage on the shared fixture set
- callout recall threshold
- false-positive baggable-callout cap
- visible quantity accuracy threshold
- targeted crop ownership regressions
- local private good-callout session checks for annotated manuals. These
  sessions may be used for regression validation, but private PDFs, crops,
  rendered pages, exact coordinates, and row-level debug output must stay
  outside git.

## Tests To Preserve

Port or rewrite focused tests for:

- initial page selection
- callout region detection
- quantity parsing and glyph edge cases
- part-only crop ownership and border suppression
- color estimation against fallback palette
- local grouping gates
- progress publication
- Build steps page grouping and preview batching
- multiplier controls and session serialization
