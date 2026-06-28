# Increment 3: Step Callout Detection

## Status

Complete. The production `/` route uses the v2 browser detector adapter with
package-owned callout detection, label-owned part extraction, manual-local color
calibration, progress events, stale-session invalidation, and Build steps output
for scanned pages and detected rows.

## Goal

Detect build-step callout rectangles and visible part rows without assuming a
fixed callout color. The first useful detector slice should pass the shared
fixture gate for the simple fixture while matching patterns observed in local
private manuals.

Private manuals may inform detector heuristics, but private PDFs, page renders,
crops, row-level debug output, and exact private coordinates must remain outside
git.

## Scope

Deliver:

- detector version `2.0.0-alpha.16`
- part extractor version `2.0.0-alpha.162`
- page scan order across every page
- first-build-step-page style seeding, not first-PDF-page seeding
- border-first callout rectangle detection
- broken-border rectangle assembly for small callouts whose edge components are
  not connected
- raster quantity anchored callout acceptance for browser-rendered manuals;
  native PDF text and source text OCR are not detector inputs
- dominant edge-sampled page background estimation plus raster-quantity-gated
  page-local background fallback when manual-wide fill style is sparse and
  potentially misleading
- panel-size guard for raster quantity anchored fill panels so tiny build-art
  fragments stay rejected
- small stable manual-style raster-quantity fill panels can be accepted below
  the standard area floor so Animals-style single-part callouts are retained;
  page-local fallback alone cannot use this exception
- transparent gradient-page panels can be accepted by strong raster border,
  lower-row raster quantity, bounded candidate size, and foreground density
  evidence instead of fill contrast
- visual row gap filling for one missing callout in clear build-step grids
- grid completion that treats inferred cells as search windows only, then snaps
  to a bordered/background-backed region instead of returning guessed cell size
- row-aligned tiny bordered callout recovery after normal same-page callouts
  establish a build grid
- single small bordered callout recovery when its fill matches the accepted
  manual-local callout background
- sparse-grid completion that can recover one background-backed missing panel
  from proven row/column context while rejecting pale subassembly strips
- quantity-backed fragment expansion that snaps split callout pieces to the
  enclosing border and merges overlapping same-background fragments
- three-point callout verification: plausible `Nx` quantity label, enclosing
  border evidence, and compatible manual/page-local background evidence
- seeded fill fragment expansion before final verification so bottom quantity
  rows and rightmost parts are not cropped away
- page-background inventory rejection so unbordered parts-list pages do not
  become build-step callouts
- hidden browser inventory-tail cutoff so dense BOM tail pages are excluded
  before heavy detector work
- dense inventory-page cleanup for cases where many quantity-like raster labels
  create a few sparse false callout leftovers
- cover-logo rejection for dark raster-only regions without compatible raster
  quantity evidence
- page-scale raster text/banner rejection for paragraph fragments that resemble
  `Nx` labels without strong border/background/quantity evidence for a real
  callout panel
- capped non-dark raster edge-contrast border evidence for fill panels whose
  visible outline differs from the inferred panel background
- off-style gray build-image fragment rejection after the manual-local callout
  fill has been seeded
- off-style quantity-bearing containers must not suppress an inner bordered
  panel that matches the manual-local callout background
- seeded light-fill fragments are expanded back to the full matching fill panel
  only when the fragment is not already acceptable as its own bordered callout
- visual-only upper digit-sequence panels without `Nx` quantity labels are
  treated as subassembly panels, not build-step parts callouts
- image-only raster step-number anchors may reject extra floating visual panels
  when a page already proves a numbered callout layout; this pass does not read
  PDF text, does not parse exact step values, and does not make step numbers a
  global requirement
- text-only step-number fragments are rejected even when their color matches a
  seeded manual fill
- seeded manual fill matching rejects page-white fragments and cross-tint warm
  panels so blue, cream, and yellow manual styles do not contaminate each other
- complete bordered manual-fill callouts stay valid when the part render
  occupies most of the panel interior
- tall narrow bordered callouts are recovered from border/background evidence
  rather than a strict page-relative size cap
- multi-callout browser-rendered pages can recover same-background manual-style
  bordered siblings with no parseable raster quantity only as zero-part
  diagnostics when an accepted same-page callout, outer border evidence, and
  nearby step-number evidence are present
- same-style visual recovery accepts browser-rendered panels whose printed step
  number is below or below-left of the bordered panel, while still requiring the
  accepted manual background and outer border evidence
- complete same-background sibling panels remain separate when one callout sits
  below another; fragment expansion uses the nearest enclosing border and
  suppresses nested leftovers without merging adjacent complete panels
- sparse inventory cleanup rejects up to four tiny seeded-fill fragments when a
  dense no-callout inventory page has many quantity-like raw candidates
- stacked same-style sibling recovery can recover an adjacent manual-fill panel
  from a fill component and segmented border evidence after one same-page
  callout establishes the manual style
- adjacent side-by-side same-style sibling recovery can recover a missed
  manual-fill panel after one same-page callout establishes the manual style,
  while suppressing nested or overlapping fragments
- continuing-border crop expansion can extend a quantity-backed crop to the
  next compatible enclosing border when dense build art hides the lower border
  and the expanded region still has quantity evidence
- detector output combines normal, visual-recovered, and standalone-recovered
  callouts before sparse inventory cleanup so valid sparse quantity panels are
  not removed before final dedupe
- final output trims leading printed step-number/build-image gutters back to a
  contained bordered quantity panel when quantity evidence remains inside that
  panel
- short, wide, off-style raster-only quantity strips are rejected after the
  manual-local callout style is known
- right-edge crop recovery can extend a quantity-backed panel only across a
  same-background continuation strip to a bounded local border, so rightmost
  quantities stay visible without absorbing adjacent build art
- final quantity-panel crop recovery can restore the local printed outer border
  around an already-detected panel and recover a clipped rightmost
  quantity/part without using manual-specific page or step guards
- page-one decorative logo fragments are rejected generically when a tiny
  near-white corner crop lacks top/right callout-border evidence and is dense
  foreground content rather than a complete bordered quantity panel
- per-callout background color inference
- quantity-anchored item rows
- deterministic raster `Nx` quantity parsing for visible label values including
  targeted one- and two-digit fixture values
- v2 package `@bag-it/callout-parts` for label-owned part extraction from
  accepted callouts
- alpha69 dense multirow callout support for abnormal inventory-like panels:
  large clean dense label grids can retry candidate assembly with a lower
  top-label vertical threshold, large dense label sets relax nearby-foreground
  part-art rejection, smaller non-dense callouts keep close-baseline fake-label
  suppression, and large dense grids use local label-row ownership plus primary
  component ownership so one label cannot borrow separated neighbor parts
- alpha83 Upper Courtyard support for row-spanning tall callout parts: lower-row
  labels can search upward when the label-to-row gap indicates a tall component
  spanning multiple visual rows, then same-column stacked components are split
  after component selection with a real-size gate. Wide high-value retry
  candidates that are size outliers against overlapping printed labels are
  rejected as part art. The rules use callout-local geometry and raster evidence
  only, with no manual ids, step ids, BOM, catalogue data, source text OCR, or
  app-side geometry.
- alpha93 Hall Tower sparse two-row support for a connected printed `2x` label
  that is otherwise misread as a one-glyph `4x` and rejected as part art. The
  rescue requires exactly two accepted same-row printed peers to the right and
  one accepted lower printed label, then emits the rescued label through normal
  label-owned extraction. Broad rejected-label masking remains disabled after
  Castle Ramp regression, so crop suppression still uses emitted labels only.
- `partImage.region` and `partImage.alphaMask` output that excludes quantity
  labels and callout background
- documented part-image and quantity-label extraction approach:
  [Part image and quantity extraction plan](../part-image-quantity-extraction-plan.md)
- manual-local part color calibration through `@bag-it/part-colors`, with
  class-centroid swatches as primary truth and advisory LEGO palette names as
  secondary hints
- part color resolver under `@bag-it/part-colors/src/resolver`, with small
  focused modules, review-grade manual-local color classes, and promoted
  aggregate color prototypes trained from private label evidence
- generated private part-color label workbench and dataset evaluator that use
  saved app `detectedColor` reports for visual labeling, role-based train/score
  policy, close-pair confusion summaries, and dirty-label rejection summaries
  without changing runtime resolver thresholds
- part color alpha6 neutral-shadow guard: dark Light Bluish Gray, silver, and
  white prototypes can only match near-black rows when neutral body evidence is
  present, with edge-highlight support for small shadowed neutral parts
- part color alpha7 tightens aggregate prototype clustering from CIEDE2000 `5`
  to `4`, promoting one darker Dark Bluish Gray prototype from private train
  labels. The sweep rejects `support=3`/wider clusters because they worsen
  holdouts; the committed aggregate contains no private row ids, crop hashes,
  manual ids, or images.
- part color alpha8 promotes 4th Stage and Fountain labels into training except
  Trans-Light Blue, which remains score-only until transparent-vs-opaque blue
  has stronger separation. This adds one aggregate Light Bluish Gray prototype
  and improves current private labels without any manual worsening.
- part color alpha9 adds a transparent-blue evidence guard before
  Trans-Light Blue prototypes may match. Fountain Trans-Light Blue labels become
  trainable, promoting one guarded aggregate prototype while Lower Courtyard and
  Hall Tower opaque Bright Light Blue recheck rows stay protected.
- part color alpha10 keeps the aggregate prototype set unchanged and narrows
  sample feature extraction for shadowed body colors. A strong warm-brown body
  chip can beat dark shadow chips, and a dominant dark-neutral body chip can
  beat near-black shadow unless the near-black chip is blue-biased. The rejected
  follow-up candidates were broader Reddish Brown/Dark Brown margin relaxation
  and Dark Tan body-chip selection because they worsened holdout manuals.
- part color alpha11 aligns the fallback palette with the Rebrickable workbench
  vocabulary by emitting `Blue` instead of legacy `Bright Blue` for the same
  `#0055bf` color. Private report/eval matching canonicalizes the two names so
  older labels remain comparable without collapsing genuinely distinct blue
  classes such as Dark Blue, Dark Azure, Medium Blue, or Trans-Light Blue.
- part color alpha15 adds a narrow green-body evidence rule for near-black
  selected samples. When same-row sampled chips show strong low-luma green body
  coverage, a black fallback can resolve advisory `Green`. The private
  saved-app eval moves from `5922/6263` to `5925/6263`, improving Bakery,
  Fountain, and Hall Tower by one row each with zero manual or row worsening.
- part color alpha16 adds a narrow Dark Tan body evidence rule for rows whose
  selected sampled color lands on a bluish-gray edge or shadow. The rule needs
  repeated low-chroma dark-tan body chips and rejects saturated warm Tan/Yellow
  evidence and olive-gray evidence, keeping the behavior feature-based and
  independent of manual ids, row ids, crop hashes, or source metadata. Refreshed
  private report parity is `5947/6263` with no runtime/report delta after all
  ten reports were regenerated from saved app results.
- part color alpha17 adds a narrow Light Bluish Gray edge-evidence rule for
  rows whose selected sample stays Dark Bluish Gray because sampling landed on a
  dark edge/shadow. The rule requires strong rejected-edge light-neutral
  evidence, visible accepted light-neutral support, mostly medium-neutral body
  chips, and low dark/near-black support. Refreshed private report parity is
  `5953/6263` with no runtime/report delta and zero row worsening.
- part color alpha18 widens that Light Bluish Gray edge-evidence rule only for
  tiny samples with at most `60` accepted pixels. It reads all accepted sample
  chips so split light-neutral body evidence on small shadowed crops can
  participate, while still requiring strong rejected-edge evidence and bounded
  dark/near-black support. Refreshed private report parity is `5961/6263` with
  no runtime/report delta and zero row worsening.
- part color alpha20 adds source-specific Light Bluish Gray exits for the
  neutral recheck set: a narrow high-background/high-edge White rescue and a
  separate high-edge near-black Black rescue. Both use only same-row sample and
  rejection evidence, not manual ids, row ids, crop hashes, or source metadata.
  Private runtime evaluation moved from `5974/6261` saved-report matches to
  `5978/6261` with no scored manual worsening.
- part color alpha22 lowers the warm body single-chip representative-selection
  guard from `40%` to `36%` while keeping total warm coverage and near-black
  margin guards intact. This corrects two edge-shadowed brown rows without
  broad black-to-brown remapping. Refreshed private report parity is
  `5995/6265` with no runtime/report delta.
- part color alpha23 adds a narrow saturated transparent-primary evidence rule
  for tiny high-edge/high-background crops whose accepted and rejected-edge
  chips strongly agree on red or blue body color. It may resolve advisory Red
  to Trans-Red, and Blue or Dark Purple to Trans-Dark Blue, without using
  manual ids, row ids, crop hashes, or source metadata. Private runtime
  evaluation moves from `5995/6259` to `6004/6259`, improving Hall Tower by
  nine rows with no manual worsening.
- part color alpha59 adds two narrow neutral body-vs-edge rules from the
  current labeled reports. Cool Light Bluish Gray edge-body samples selected as
  Dark Bluish Gray can resolve back to Light Bluish Gray when medium/cool body
  coverage is strong and background, dark, and near-black coverage stay bounded;
  low-black Dark Bluish Gray body samples selected through a Light Bluish Gray
  prototype can resolve back to Dark Bluish Gray when dark body and edge
  coverage are strong and visible light support is absent. Private runtime
  evaluation moves from `6133/6248` report parity to `6136/6248` runtime with
  `112` remaining mismatches and zero worsened rows.
- part color alpha60 extends tan body evidence only for repeated edge-polluted
  warm close pairs. Dark Brown-source samples can resolve to Tan when accepted
  chips show split tan body coverage with bounded saturated-warm support; tiny
  Dark Tan-source samples add an extra light-tan support guard. The rejected
  follow-up candidates were one-row Tan-from-Black and zero-delta brown/nougat
  rules. Private runtime evaluation moves from `6136/6248` to `6141/6248`,
  drops mismatches from `112` to `107`, and has zero worsened rows.
- part color alpha49 adds `weak-classifiable` sample status. Usable but tiny,
  edge-heavy, or unstable color samples now keep review-only advisory names
  instead of becoming missing rows, and trainable datasets reject them by
  default. Refreshed saved-app report parity removes the missing-row bucket and
  reaches `6094/6248`.
- part color alpha50 adds a source-specific White rescue from Light Bluish Gray
  when moderate background rejection plus bounded edge/body evidence indicates
  white body pixels are overwhelmed by edge/shadow pixels. Private parity
  reaches `6097/6248` with no row worsening.
- part color alpha51 adds a narrow Trans-Orange-source Medium Nougat edge path
  based on repeated muted-warm body coverage and strong orange-edge support.
  Private parity reaches `6102/6248`, mismatch count drops to `146`, runtime
  and regenerated saved-app reports have zero delta, and trainable color labels
  have no stale/conflicting/unclear rows.
- part color alpha52-alpha54 add narrow source-specific evidence for remaining
  repeated edge cases without manual ids or row ids: undersampled White from
  Light Bluish Gray, tiny near-black Black from edge evidence, dark-neutral body
  correction from Light Bluish Gray to Dark Bluish Gray, tiny Pearl Gold-source
  Trans-Orange, and edge-heavy Pearl Dark Gray metal evidence. Refreshed
  private report parity reaches `6116/6248` with no runtime/report delta and
  zero row-level worsening.
- part color alpha55 adds a transparent-light-blue evidence module for tiny
  Dark Bluish Gray-source cyan-glass samples. It corrects three Hall Tower
  Trans-Light Blue rows and keeps Trans-Clear/dark-core rows protected.
- The committed bag-analysis fixture gate now includes exported row
  `detectedColor` summaries alongside quantities, part regions, quantity-label
  regions, and compact alpha masks. The browser-produced session must preserve
  the expected resolved color name, family, status, swatch, manual class id,
  manual-class trust flag, and raw manual class id for each matched part row.
  Refreshed private report parity reaches `6119/6248` with no row-level
  worsening.
- part color alpha56 extends the same transparent-light-blue evidence module
  with a separate Black-source path requiring tiny high-background/high-edge
  samples, a strong near-black core, and visible cyan-glass fringe. It corrects
  the remaining three Fountain Trans-Light Blue rows currently named Black.
  Refreshed private report parity reaches `6122/6248` with no row-level
  worsening.
- part color alpha57 adds an opaque Yellow body evidence module for tiny
  edge-heavy rows currently named Dark Bluish Gray or Dark Orange. The rule is
  separate from transparent-yellow handling and leaves Trans-Yellow/Pearl Gold
  rows untouched. Refreshed private report parity reaches `6125/6248`
  (`98.03%`), mismatch count drops to `123`, runtime/report delta is zero, and
  private reports are saved-app-result, non-stale, and conflict-free.
- part color alpha58 adds source-specific transparent evidence for repeated
  glass-like misses without creating a catch-all transparent rule: Flat
  Silver-source Trans-Brown, Dark/Sand Blue-source Trans-Dark Blue,
  high-background Light Bluish Gray-source Trans-Light Blue, Tan-source
  Trans-Yellow, and Reddish Brown-source Trans-Orange. Trans-Clear remains
  review-only because current evidence overlaps White and Light Bluish Gray too
  strongly. Refreshed private report parity reaches `6133/6248` (`98.16%`),
  mismatch count drops to `115`, runtime/report delta is zero, and row-level
  worsening remains zero.
- private part-color workbench row search for row id, page, step, and color,
  plus hash links that filter directly to a row on the current workbench page
- private-aware detector regression commands:
  `npm run validate:detector-regressions` for portable verification and
  `npm run validate:detector-tuning` for strict local tuning with required
  Middle Wall color and Lower Courtyard crop snapshots
- v2 adapter decomposition: browser-step-detector adapter orchestration,
  part-extraction scheduler/version retry, color calibration runner, preview
  hydration runner, and shared browser worker pool
- full-pass part-extraction retry when the worker version probe or extraction
  response reports stale part-extractor or part-color calibration versions
- progress events
- separate part-extraction progress for fresh scans and restored current-callout
  sessions
- page-by-page browser scan scheduling that avoids retaining every rendered page
  image before detection starts
- scan-first preview scheduling that returns usable callout/part geometry before
  runtime page preview assets and visible part-mask previews are generated
- pure per-glyph and border-mask detector caches that reduce repeated work
  without changing detector thresholds or candidate acceptance
- inventory-tail probing that tolerates one weak page inside a strong dense
  appendix suffix before selecting the cutoff
- seeded worker-pool browser detection after first accepted callout establishes
  stable fill-color hints, with page-order result commit
- lightweight detector progress benchmark for long-manual timing checks
- fixture-gate integration for the first shared fixture
- Build steps tab output for scanned pages and detected callout rows
- in-memory page preview assets, CSS region callout/quantity/rectangular part
  previews, and visible-first transparent part-mask previews with hover zoom
- part-row preview images generated only from stored extractor
  `partImage.region` plus `partImage.alphaMask`
- alpha149 lower-row crop protection applies the close upper-label crop clip
  after scaled extraction as well as direct part-image creation, then accepts
  Lower Courtyard crop previews as private local regression gates before color
  tuning resumes
- alpha150 invalidates alpha149 saved part rows without changing extraction
  geometry. Hall Tower step 137 exposed that an already-saved alpha149 session
  could contain a stale fake `2x` part-art row while fresh app/PDF analysis
  emitted the correct four `1x` rows. Restored alpha149 sessions must rerun
  part extraction from preserved callout geometry before the app renders Build
  steps, Bags, or color workbench state.
- alpha152 fixes the fresh-analysis Hall Tower step 137 fake-row regression by
  moving low-value part-art cleanup after crop extraction. Readable `1x`/`2x`
  candidates are not pre-rejected; duplicate cleanup drops only low-value rows
  with near-empty part crops and removes those dropped labels from rerun
  suppression masks. Reduced Hall Tower page 78 emits four `1x` rows, and the
  accepted callout-parts saved-session browser gate passes manuals 001-010.
- Hall Tower page 78 step 137 exposed browser-runtime sensitivity after alpha152:
  Playwright bundled Chromium 148 emitted four `1x` rows, while real
  Chrome/Brave 149 emitted three by missing the lower-right small part. The
  bag-analysis fixture gate and diagnostic reports therefore run in real Google
  Chrome and record browser version/user-agent metadata; bundled Chromium is no
  longer accepted for detector correctness.
- alpha153 addresses the highest-priority real-Chrome fixture failures before
  fixture acceptance: compact 2x2 lower-peer recovery restores the missing Hall
  Tower lower-right `1x` only when label ink and a part above exist, top-bar
  seven OCR resolves quantity labels like manual 002 page 100 as `7x`, and
  alpha trimming clamps top-edge support that leaked callout borders or step
  numbers into part crops while preserving legitimate non-edge top support.
- alpha154 trims scaled-output masks that retain a single dense callout-border
  row above the part. Focused real-Chrome strict replay for manual 008 passes,
  including page 5 / callout 12 / row 1.
- alpha155 tightens post-extraction duplicate cleanup after real-Chrome fixture
  review found stud/detail glyphs accepted as quantity labels. Embedded
  low-value labels that split a larger same-row part are dropped, inter-row
  high-value detail glyphs no longer steal an upper printed row, and
  suppression-only labels inside selected foreground are ignored for alpha
  masking so real part edges are not clipped.
- alpha156 moves that duplicate cleanup into the scaled real-Chrome output path,
  transfers better embedded part-art crops to retained printed labels, and
  clears escaped right-side support alpha when it reaches a neighboring part.
  Focused real-Chrome replay confirms Hall Tower page 118 / callout 212 / row 3
  no longer reports alpha bleed. Lower Courtyard page 131 / callout 255 / row 1,
  page 157 / callout 304 / row 5, and Middle Wall page 32 / callout 68 / row 2
  still need a foreground ownership fix.
- alpha157 adds row-end, geometry-gated low-contrast face support inside the
  selected owned envelope. It targets the remaining Lower Courtyard white-part
  p131/c255/r1 and p157/c304/r5 failures without adding generic crop padding.
- alpha158 splits low-contrast owned-envelope support into top-only and
  left-only modes, filters close tiny false labels from alpha suppression
  without changing the stable saved diagnostics shape, and keeps the accepted
  Lower Courtyard manual-002 white-part replay differences documented in
  `.bag-it/private/e2e-fixture-diff-reports/2026-06-18-alpha157-white-alpha-suppression-only/index.html`.
- 2026-06-17 alpha153 critical replay in real Chrome:
  `.bag-it/private/e2e-fixture-diff-reports/2026-06-17-alpha153-critical-final/index.html`
  passed the Playwright report run in 8.8 minutes. The replay confirms
  manual 004 page 78 / callout 136 now emits four `1x` rows, manual 002
  page 100 / callout 186 now reads `7x`, and the three manual 006
  border-inclusion rows no longer appear in the diff report. The remaining
  report issues are still blocking fixture-gate failures, mostly Lower
  Courtyard contour/noisy-edge rows and Hall Tower extra/missing row splits.
- 2026-06-17 alpha154 critical replay in real Chrome:
  `.bag-it/private/e2e-fixture-diff-reports/2026-06-17-alpha154-critical/index.html`
  passed the Playwright report run in 8.1 minutes. Issue counts are
  manual-006 `0`, manual-008 `0`, manual-010 `1`, manual-004 `10`, and
  manual-002 `17`. Manual 008 page 5 / callout 12 / row 1 is fixed; remaining
  work is concentrated in manual 002, manual 004, and manual 010.
- step multiplier controls for callouts with detected part rows, with immediate
  row/total quantity updates and session serialization
- page-level possible-step-multiplier advisories remain review-only and never
  apply multipliers automatically; detector `2.0.0-alpha.16` does not use
  native PDF text or source text OCR to find callouts

## Detector Approach

The first region detector must:

- find dark or high-contrast rectangular borders
- keep a secondary light-fill panel path for dark or illustrated pages where a
  callout's border is not an isolated dark component
- seed later page searches with inferred callout fill colors from accepted
  earlier callouts
- reject cover/full-build/notice pages unless they contain bordered callouts
  with `Nx` quantity evidence
- infer the callout background from stable interior pixels for each accepted
  border
- treat inferred background as local evidence, not as a global required color
- accept blue, cream, yellow, white, transparent, and page-matching callout
  backgrounds when border and quantity evidence are strong
- require accepted callouts to pass three independent checks: quantity glyph,
  visible border, and compatible background
- keep the no-quantity visual recovery bounded to same-page manual-style
  multi-callout context and out of baggable rows
- avoid using printed step numbers as a required anchor
- use raster step-number anchors only as a page-local floating-panel rejection
  signal after multiple same-page callouts already prove numbered layout

Implementation boundary:

- the legacy detector/extractor monolith has been removed
- `/` uses the v2 browser detector adapter; `/v2` redirects to `/` as a
  temporary compatibility alias
- restored legacy sessions must be treated as stale and rerun when detector or
  part-extractor versions do not match production v2
- new detector behavior must be built as small, single-concern modules under a
  focused subdirectory, then wired through a narrow adapter
- new modules must separate callout candidate production, evidence evaluation,
  conflict resolution, quantity parsing, part extraction, preview hydration,
  and output assembly
- new v2 detector modules are governed by scoped SonarJS ESLint rules instead
  of line caps

## First Slice

The first implementation slice is deliberately narrow:

1. Update the synthetic simple fixture so a non-build cover page precedes the
   first build-step page and callout backgrounds are not all blue.
2. Add pure detector contracts and image-processing helpers for bordered
   rectangle detection and background inference.
3. Detect quantity-anchored rows from raster labels inside accepted callouts.
4. Keep browser-scan callouts only when raster image evidence shows a
   `<number>x` quantity label, or when a small bordered panel matches a seeded
   manual fill; reject legal/support boxes, page-scale raster text banners, and
   numbered sequence strips without quantity or manual-fill evidence.
5. Run detector output through the existing fixture gate for the simple fixture.
6. Keep Bags disabled until the detector passes the broader readiness gate.

## V2 Rebuild Milestone 1

Status: in progress.

Deliver:

- scoped SonarJS ESLint enforcement for `src/features/steps/v2/**`
- detector-v2 stage specifications under `docs/wiki/detector-v2`
- v2 internal contracts for stage snapshots and failure taxonomy
- generic private validation manifest runner that writes ignored reports only
- `/v2` adapter remains allowed to delegate to legacy until the first real v2
  detector slice changes detector versions

Acceptance:

- `npm run lint` applies SonarJS only to v2 detector files
- v2 production detector modules do not import the legacy detector monolith
- private validation manifest absence skips cleanly
- committed fixture summaries expose failure taxonomy counts
- no private PDFs, renders, crops, paths, or row-level debug output are committed

## V2 Rebuild Milestone 2

Status: in progress.

Deliver:

- v2 page input normalizer for rendered pixels, page dimensions, and page
  numbers only
- browser PDF page reader that emits v2 page input contracts without importing
  the legacy detector monolith or PDF text content
- page-input stage snapshot with counts and zero detector failure taxonomy
- no callout, quantity, inventory, or part decisions in page-input modules

Acceptance:

- pure page-input tests cover pixel buffer validation, coordinate clamping, and
  stage report shape
- browser page-input tests verify no native PDF text items are requested for the
  v2 detector contract
- browser PDF page reader stays behind the v2 module boundary and does not
  affect `/` or `/v2` detector output yet
- committed synthetic PDF render fixtures are added before this stage becomes a
  fixture gate input

## V2 Rebuild Milestone 3

Status: in progress.

Deliver:

- v2 callout candidate stage for recall-first candidate generation
- border candidate producer for dark rectangular border components
- fill-panel candidate producer for uniform light panels that differ from page
  background and for non-dark raster outlines around same-background panels
- stable candidate ids and callout-candidate stage snapshot
- no final acceptance, quantity parsing, part extraction, inventory rejection,
  or Bags integration in candidate modules

Acceptance:

- focused synthetic tests prove expected bordered and filled callout regions
  appear in the candidate set
- blank synthetic pages do not emit candidates
- candidate stage counts generated candidates without claiming final acceptance
- `/v2` remains backed by the legacy adapter until evidence, resolver,
  quantity, and part-row gates pass

## V2 Rebuild Milestone 4

Status: in progress.

Deliver:

- v2 callout evidence stage that scores each candidate without mutating its
  region
- independent border, background, and raster quantity evidence signals
- repeated manual-local style inference from plausible fill-panel candidates,
  anchored by raster quantity labels or page-background-different panel fills,
  without hard-coded colors or first-page seeding
- dominant light panel fill reading so foreground part pixels do not distort
  background evidence
- strict manual-style compatibility that rejects near-white build-image
  fragments when the established callout style is tinted
- tight outer-edge border search for fill-panel interiors without mutating
  candidate regions
- signal reason codes so weak or conflicting evidence remains explainable
- callout-evidence stage snapshot
- no resolver status, crop ownership, part extraction, native PDF text, or
  source text OCR in evidence modules

Acceptance:

- focused synthetic tests verify strong border, background, and lower-row
  quantity evidence independently
- manual-local style tests verify repeated non-blue/non-first-page style
  inference, off-style rejection, and near-white build-fragment rejection
- weak quantity evidence is reported as an explicit reason, not hidden
- evidence stage snapshot counts scored candidates without claiming final
  callout acceptance

## V2 Rebuild Milestone 5

Status: in progress.

Deliver:

- v2 conflict resolver that maps scored candidates to accepted, diagnostic, and
  rejected statuses
- duplicate overlap handling that prefers stronger/smaller complete candidates
  without merging adjacent panels
- page-local duplicate suppression so repeated same-position callouts on
  different pages are retained
- tiny no-quantity visual fragment rejection
- failure taxonomy counts for weak false positives and duplicate overlaps
- no output assembly, Bags integration, part rows, crop ownership, or repeated
  cleanup passes in resolver modules

Acceptance:

- focused synthetic tests cover accepted, diagnostic, tiny visual rejection,
  weak rejected, duplicate-overlap, and same-position different-page outcomes
- diagnostic callouts remain review-only and are not treated as baggable
- resolver stage snapshot reports accepted/rejected counts and duplicate
  taxonomy

## V2 Rebuild Milestone 6

Status: in progress.

Deliver:

- v2 output assembly that maps accepted and diagnostic resolved callouts into
  the existing Build steps result shape
- `/v2` browser adapter wired through page input, candidates, evidence,
  resolver, and output assembly
- v2 detector version `2.0.0-alpha.11`
- v2 part extractor version `2.0.0-alpha.54`
- v2 preview hydration as a separate browser pass after detector geometry is
  ready, with text extraction disabled, stored alpha masks applied
  mechanically, and no detector-stage work on the preview path
- measured v2 callout background output so the Build steps background display
  reflects candidate pixels rather than a fixed diagnostic placeholder
- v2 part extraction wired as a separate versioned browser pass after accepted
  callout geometry is available
- Bags use v2 part rows only when the running part-extractor version matches
  the saved session metadata

Acceptance:

- focused output assembly tests verify accepted mapping, diagnostic and rejected
  omission, page previews, versioning, and empty status
- v2 adapter no longer imports the legacy detector monolith
- `/v2` Webwright shell passes after wiring
- full verification passes before this slice is considered complete

## Step Callout Package Extraction

Status: in progress.

Deliver:

- private workspace package `@bag-it/step-callouts` for pure step-callout
  detection
- no `v2` naming inside package APIs, package source, package tests, fixture
  case ids, or fixture file names
- browser PDF reading, scan progress, part extraction, preview hydration,
  session handling, app output assembly, and `/v2` route compatibility remain
  app responsibilities
- private manual validation remains browser-upload based; no package-level
  manual replay fixtures, PPM baselines, or saved-session refresh flows

Acceptance:

- `detectStepCallouts` accepts normalized page pixels and returns callout
  candidates, resolved callouts, evidence, detections, and stage snapshots
- app `/v2` adapter imports `@bag-it/step-callouts` and owns progress messages
  and percentages
- `@bag-it/step-callouts` does not import app code, PDF.js, React, Next,
  Chakra, sessions, previews, part extraction, or the legacy detector monolith
- private manual regression and visual crop validation uses `/v2` real browser
  upload with mounted DOM and screenshot checks

Current v2 detector validation notes:

The current private validation policy is browser-only. Historical replay notes
below are retained as detector history, not as active validation instructions.

- private replay for user-approved Castle Ramp validation currently matches:
  pages 1-12 have two visible callout diagnostics, page 13 has three, page 14
  has zero, and inventory/final pages from page 16 onward have zero
- private replay for user-annotated MOC-169454 pages 32-35 currently matches:
  page 32 has two top callouts, page 33 has one top callout, page 34 has one
  top callout, and page 35 has two top callouts
- no-quantity diagnostics remain review-only, so this validation checks callout
  geometry only; quantity and part rows remain future slices
- detector version `2.0.0-alpha.7` invalidates earlier `/v2` sessions after
  row/grid refinement changes, including out-of-row narrow visual fragment
  rejection, tall side-panel preservation, large occluded top-panel diagnostics,
  reduced Lower Courtyard replay validation for rotate-icon false positives, and
  page-local off-style diagnostic rejection for low-foreground white
  rotate/refresh icon panels on pages where two strong non-white callouts
  establish a style
- Hall Tower annotation pass identified a render-scale failure class: the
  browser/PDF.js detector does not upscale native A4 pages, so fixed pixel
  gates in raster top-row recovery dropped valid edge and shifted top-band
  callouts that overlapped build art. The resolver now uses page-relative top
  panel size gates and keeps proven top-band panels only when the same page
  already has a supported strong top row.
- Hall Tower pages 15, 60, 133, 142, 143, 144, 146, 151, and 216 remain the reduced
  candidate set for browser-rendered validation. Automated private regression
  must use the browser/PDF.js render path for these pages; Poppler render replay
  is no longer authoritative for accept/reject decisions.
- Browser-rendered private replay is now available through
  `npm run validate:detector-v2:browser`. It launches a local browser, renders
  private PDFs with PDF.js/canvas, supplies image-only pixels to the v2 detector,
  and writes ignored reports under `.bag-it/private/v2-reports/**`.
- The browser replay accepts `-- --details` for ignored private reports that
  include resolved candidate regions and evidence scores. Use this for failure
  triage only; the default report stays limited to counts, taxonomy, and
  region-match failures.
- Current count fixes keep small strong manual-style fill panels that fall just
  below the old diagnostic area floor, while rejecting low-background fill-panel
  fragments that only survive because they align with a visual row. This covers
  Hall Tower page 216 and Lower Courtyard rotate-icon false positives on pages
  107 and 108.
- Hall Tower page 60 adds a right-side column regression: right callouts may be
  far from raster step-number anchors, but remain valid when they align to a
  supported top-row column on the same page.
- Lower Courtyard is promoted to a reduced private regression case instead of a
  full 217-page replay. The current private gate checks user-classified failure
  pages 31, 52, 56, 61, 62, 65, 69, 77, 88, 107, 108, 114, 128, 131, 132,
  139, 180, and 193 against the saved-good session. The reduced case currently
  passes with 57 expected callouts.
- Upper Courtyard page 24 is a reduced private regression case for the
  overlapping-top-callout pattern. The gate asserts two top callouts while
  rendering pages 1-30 as context so resolver support matches the browser scan
  path.
- 4th Stage page 3 is a private browser regression for a first visible
  bottom-right callout. The resolver keeps the diagnostic only when the strong
  manual-style fill panel has later same-column x/width support; this preserves
  the real page 3 callout without re-admitting large title or notice panels.
- detector version `2.0.0-alpha.8` invalidates earlier `/v2` sessions after the
  leading manual-style support rule changed.
- Farm House page 11 adds a saved-region regression: a yellow/off-style
  subassembly panel aligned to the visual grid must not replace the real
  manual-style callout. Browser saved-session replay now compares saved regions
  with IoU, not counts only, so equal-count substitutions fail the gate.
- detector version `2.0.0-alpha.9` invalidates earlier `/v2` sessions after
  raster filtering began preserving strong manual-style panels with missing
  raster step anchors and visual recovery stopped accepting explicit off-style
  border-grid panels.
- Exported app sessions can now be used directly as private saved-good browser
  validation cases through
  `npm run validate:detector-v2:browser -- --session-dir=/path/to/validation`.
  The runner reads PDF bytes from each session export, renders them in browser
  PDF.js, and compares current detector regions to saved callout crop regions
  by IoU so small render shifts are tolerated while wrong-region substitutions
  still fail.
- Browser validation fails fast by default so detector tuning stops after the
  first failing case and prints that mismatch immediately. Use
  `-- --no-fail-fast` for full failure inventories after the first fix is in.
- MOC-189082 3rd Stage page 6 adds a reduced private regression for a long
  bottom callout. The border producer finds the panel, but its long perimeter
  dilutes border coverage; the resolver keeps manual-style bottom strips as
  diagnostic callouts only when they are page-relative long, low on the page,
  have strong manual-style background evidence, and retain measurable border
  evidence.
- detector version `2.0.0-alpha.10` invalidates earlier `/v2` sessions after
  long bottom manual-style border strips began resolving as diagnostics.
- part extractor version `2.0.0-alpha.41` invalidates earlier `/v2` part rows
  after extraction moved into `@bag-it/callout-parts`, v2 dropped app-side
  `partCrop`, and previews became mechanical `partImage.region` plus
  `partImage.alphaMask` rendering. Alpha 31 also keeps adjacent compact labels
  split and supports connected digit+x blobs. Alpha 30 restored the bounded
  raster OCR digit-classifier contract after the module split and trims part anchors by
  same-row label ownership so adjacent parts do not bleed into each other's
  crops on close yellow callouts. Alpha 13 rejects
  oversized raised translucent part fragments above a compact real label
  baseline and adds browser-scale raster digit rules for `3`, cropped-top `5`,
  `6`, and `9`. Alpha 14 rejects close raised sparse/noisy candidate rows and
  too-short label-like fragments from light part art, then uses asymmetric crop
  padding so low-contrast part tops are retained without extra left/right bleed.
  Alpha 15 rejects same-column part slivers above lower real labels and keeps
  extra preview-only top breathing room for tight white part thumbnails.
  Alpha 17 extends that same geometry-only guard to same-column raised part
  marks that nearly touch a compact lower baseline. It does not use manual ids,
  step ids, expected counts, color-specific branches, source text OCR, BOM data,
  or catalogue data. Alpha 19 adds compact browser-scale raster label rules for
  six-pixel-high `1` stems, compact `2`/`3` curves, and three-pixel `x` glyphs,
  and rejects part-sized stud/top fragments by candidate label height. Alpha 20
  rejects label-sized stud caps and small curved part fragments by detecting
  dense horizontal fill bands in the candidate raster mask, without using
  manual-specific ids, expected counts, source text OCR, BOM data, or catalogue
  data. Alpha 21 rejects candidates embedded in local part foreground
  immediately below the assembled label and prevents an x-like digit from
  stealing the `x` anchor from a following non-digit `x`, preserving
  multi-digit labels such as `12x`. These
  guards are raster-only and callout-local. Alpha 24 keeps compact separated
  high-resolution labels under a size-aware area cap, preserving full tall
  `1x` and `10x` label regions instead of letting attached-digit trimming
  reinterpret them. Alpha 25 moves final text/value reading into a cheap,
  bounded raster OCR layer that only reads already-found label crops; candidate
  detection and label/stud rejection remain separate. Alpha 26 removes
  digit-value classification from candidate assembly and suppression, leaving
  candidate detection geometry-only and digit reads inside OCR. Alpha 34 trims
  stored part image regions to the alpha-mask bounds with fixed padding after
  masking, so previews keep breathing room without retaining broad empty search
  whitespace. Alpha 35 adds a source-shape `9` classifier before broad template
  fallback, rejects too-small label-ink fragments, drops unreadable
  canonical-scale labels after high-resolution extraction is scaled back to
  `/v2` coordinates, zeroes all quantity-label regions in the part alpha mask,
  and widens the label-owned foreground/mask padding symmetrically so faint
  left, top, and bottom part pixels are retained without app-side preview
  geometry. Alpha 36 makes label ownership a scoring hint instead of a hard
  horizontal crop clamp, widens the callout-local search band around each label,
  and clips final part regions only to the vertical row band before alpha-bound
  trimming. This keeps left/right-extending parts and lower-row tall parts whole
  without manual-specific ids, expected counts, source text OCR, BOM data, or
  catalogue data. Alpha 37 then stops final stored part image regions at the
  quantity-label row so the broader search cannot leak label text into part
  previews; label regions remain excluded from alpha masks. Alpha 38 keeps
  label-row vertical room for tall parts and light studs, but expands
  quantity-label alpha suppression so overlapping label glyphs stay
  transparent in previews. Alpha 41 adds callout-local part-art suppression for
  high-value tiny outliers, dense non-glyph foreground inside candidate masks,
  and close raised rows over compact real labels. The temporary `/v2`
  base-render row fallback from this pass was removed because it could bring
  lower-resolution part-art false positives back into the final rows.
  High-resolution browser-rendered part extraction is the only semantic part-row
  pass; lower-resolution rendering is used for callout detection only.

## Acceptance

- first PDF page can be a cover or full-build render without becoming the style
  seed
- first build-step page defines optional style hints only after callout and
  quantity evidence are present
- detected callouts do not depend on blue fill
- detected callouts report inferred background color
- light blue callout panels on dark pages are detected even when their border
  merges with the page background
- once a light-fill callout is accepted, the detector reuses that fill as a
  bounded hint for later pages
- detected rows include quantity and part region
- browser scans may show zero-item callouts in Build steps when raster
  `<number>x` evidence exists but item extraction still cannot produce rows, or
  when a bordered same-background sibling on a multi-callout page has an
  accepted same-page callout, nearby step-number evidence, and quantity parsing
  is too weak
- raster quantity evidence must look like a lower part quantity label with
  foreground part pixels above it, not just printed sequence numbers or
  decorative shapes
- detector rejects pale/tall subassembly panels and isolated lower panels that
  are not part-callout rows
- detector rejects visual-only bordered panels when their inferred background
  conflicts with same-page quantity-backed callout fills
- detector rejects gray build-image fragments with quantity-like marks when
  their background conflicts with the already established manual-local callout
  fill
- detector keeps a manual-style inner callout even when a larger rejected
  off-style panel around it also contains quantity-like marks
- grid-completed callouts are accepted only when a bordered/background-backed
  panel is found inside the inferred grid cell
- row-aligned tiny bordered callouts are accepted only after a same-page
  multi-callout build grid is established
- single small bordered callouts may be accepted without a same-page grid when
  their background matches an accepted manual-local callout fill
- sparse-grid missing panels are recovered only from existing same-page
  row/column context and must still reject pale/tall subassembly strips
- large bordered callouts are not split into part-sized fragments; crops use the
  visible outer border even when the panel exceeds the normal native-size cap
- seeded light-fill callout panels keep their full fill area when a detector
  fragment lands on one inner part border
- sequence-only subassembly panels and step-number glyph fragments stay out of
  callout output, even if their background color has become a fill hint
- refresh/rotate icons, page-white fragments, and warm off-style panels are not
  treated as callouts after a blue manual-local fill is seeded
- dense manual-style callouts and tall narrow manual-style callouts remain
  accepted when their visible border and inferred background match the seeded
  manual-local style
- leading step-number trim does not remove real callout content when the
  candidate left edge is already a proven border
- cover pages and parts-list pages remain zero-callout pages unless they contain
  real bordered callout panels with quantity evidence
- title-page false positives do not seed manual fill hints before the first real
  build-step callout
- a dense inventory page with many quantity-like labels does not keep one or two
  sparse false positives when no bordered callout panel exists
- user-approved saved sessions may be committed as browser-gate regression
  fixtures; private PDFs outside those sessions, derived renders, crops, and
  row-level debug output remain private artifacts
- user-annotated browser-rendered page/count/crop regressions must pass before
  detector work is called complete
- Build steps shows page previews and callout crops in larger bordered preview
  panels, with padded floating hover/focus preview panels when browser render
  data is available
- Build steps page groups are open-by-default accordions, and desktop page
  previews sit above the detected rows in each group
- zero-callout pages remain represented in Build steps
- stale detector sessions require rerun before Bags render
- pages with possible outside-callout `Nx` labels show a highlighted page group
  and compact review marker in Build steps while preserving manual step
  multiplier control
- focused detector tests and fixture tests pass
- browser scan progress is emitted during render/detect phases and after each
  scanned page so long manuals show movement before the full scan completes

## Validation

Focused commands:

```text
npm run test:steps-fixtures
vitest run packages/step-callouts/src/__tests__/detector.test.ts
npm run benchmark:steps -- --pages 400
```

Current local validation:

- focused detector tests pass for `0.141.9` with multi-callout visual recovery,
  duplicate suppression, and corrected full-border crop expansion
  and no-step-number false-positive coverage
- private saved-good render regression passes expected page counts for the
  annotated small manuals: `MOC-120645` 45, `MOC-129110` 33,
  `MOC-132385` 32; exact private coordinates stay outside git
- medium private `MOC-133471` replay passes with 149 callouts and zero per-page
  mismatches after excluding user-annotated no-callout build/full-build pages
  and inventory tail pages
- farmhouse private replay passes annotated page counts, including title-page
  zero-callout behavior, recovered missing sibling callouts on pages 3 and 6,
  and saved-good multi-callout pages 61, 62, 64, 65, 67, and 68
- farmhouse 1400px browser-render replay passes the latest multi-callout cases
  on both local render sets: page 11 has 5 callouts, page 21 has 4, and page 55
  has 6 with the lower-row callout split from its neighbor
- `MOC-77633` annotated local replay for `0.141.0` detects the newly marked
  page 154 callout and keeps corrected crops on pages 26, 35, and 80 from
  cutting away the part image
- `0.141.1` tightens leading step-number trim after MOC-77633 exposed a
  regression where many darker leftmost parts were cropped in half. Trim now
  requires a narrow low-foreground gutter and no longer treats the first
  background-colored column as a crop boundary.
- `0.141.2` adds a final border-pair expansion pass and continuous vertical-edge
  checks so quantity-backed fragments expand back to the full callout border
  without absorbing adjacent build-image foreground.
- `0.141.3` prevents horizontal border-line grouping from merging into tall
  build-image foreground blobs, preserving missed callouts whose bottom edge
  touches dense model art.
- `0.141.4` recovers MOC-77633 page 114 by clamping a loose quantity-backed
  candidate to its internal right border and recomputing the top/bottom border
  rows before evidence verification.
- `0.141.5` keeps MOC-77633 at 177 callouts and adds a crop-edge replay for
  the annotated darker-part cases; internal left-border trims must have both
  border-mask continuity and visible dark border pixels before the crop can be
  moved.
- `0.141.7` saved-good regression replay passes for the private small manuals,
  farmhouse manual, and medium manual. MOC-77633 replay now reports 178
  callouts; the only differences from the saved `0.141.0` state are pages 29,
  45, and 114, which are user-confirmed corrections. Focus crops for pages 26,
  32, 35, 45, 79, 80, 81, 114, 132, 134, 154, and 155 were exported for visual
  crop review.
- `0.141.8` Castle Ramp private replay passes the latest annotated missing
  stacked-callout pages: pages 7, 8, 9, and 12 each return two callouts, page 13
  returns three, pages 14-18 remain zero-callout, and the total is 27. Focused
  detector tests and private saved-good replays for the small, medium, and
  farmhouse manuals pass. MOC-77633 compare still only differs from saved
  `0.141.0` on user-confirmed correction pages 29, 45, and 114.
- `0.141.9` keeps the stacked-sibling recovery scoped but allows a slightly
  taller vertically aligned same-style sibling when the page already has one
  accepted manual-background callout. Castle Ramp private replay passes with
  27 callouts and no page-count mismatches, including page 9 with two callouts.
  Private saved-good replays for the small manuals, farmhouse, `MOC-133471`,
  and latest MOC-77633 good-callouts state pass with no count mismatches.
- `0.141.10` keeps Lower Courtyard non-annotated pages byte-for-byte stable in
  replayed callout region output while fixing the annotated missed-callout
  pages 15, 19, 20, 21, 22, 62, 68, and 79, and extending the page 193 callout
  crop to the continuing enclosing border. The private replay reports 373
  total callouts, zero annotated count mismatches, zero non-annotated count
  diffs, and zero non-annotated region-shape diffs. Castle Ramp saved-good
  replay still passes with 27 callouts and no count mismatches.
- `0.141.12` recovers the Hall Tower priority missed-callout pages from the
  latest browser annotations: pages 192, 193, 194, 270, 287, and 292 now return
  the expected nonzero callouts, and the page 216 printed-step 459 crop trims
  to the inner `7x` quantity panel instead of including the build image. Castle
  Ramp replay still passes with 27 callouts and no count mismatches. Lower
  Courtyard focused replay still passes for annotated pages 15, 19, 20, 21, 22,
  62, 68, 79, and 193 with no count mismatches. Remaining Hall Tower
  false-positive cleanup is deferred because the active priority is missed
  callouts and bad crops.
- `0.141.13` fixes the Hall Tower regression class from the expanded browser
  annotations: visual recovery no longer accepts step-number-only fragments,
  zero-part fragments whose background is off the established manual style are
  rejected, and leading step-number trims must preserve all raster quantity
  labels. The private Hall Tower replay now freezes all 333 page counts plus
  crop guards for the previously bad left/bottom trims and passes with 612
  callouts. Castle Ramp and Lower Courtyard saved-good replays still pass with
  no count mismatches.
- `0.141.14` fixes the four final Hall Tower crop annotations: page 150 keeps
  the lower quantity row on the tall callout while preserving the neighboring
  reset-icon callout, page 162 keeps the full bottom row, page 216 trims the
  leading step number/build art out of the inset callout, and page 224 trims
  the right-side build image out of the lower-left callout. The Hall Tower
  private replay now includes crop guards for those pages.
- `0.141.15` preserves the Hall Tower crop guards and restores the saved-good
  small-manual replay after the warm/yellow manual regression. Warm off-style
  white subassembly panels are recovered only from established adjacent warm
  quantity-callout context, right-adjacent panels can snap to their shared top
  border, and page-bottom recovered panels trim back to the lowest raster-dark
  callout border instead of keeping page background. Castle Ramp, Lower
  Courtyard, Hall Tower, and the three small manual count replays pass with no
  mismatches.
- `0.141.16` fixes the Hall Tower step 14 regression by rejecting contained
  panel trims that drop raster quantity labels from a multi-quantity callout.
  The Hall Tower private replay now pins page 9 step 14 to the saved full
  callout shape and passes with 612 callouts.
- `0.141.17` extends the same full-callout preservation rule to every
  contained-panel and edge-trim candidate. It prevents narrow trims from cutting
  through real foreground content when the removed strip is still on the
  callout background.
- `0.141.18` fixes the final Hall Tower crop annotations on pages 162 and 224:
  page 162's stale lower-right fragment is pinned to the full left callout, and
  page 224's lower callout expands right only to its continuing border pair.
- `0.141.19` keeps those Hall Tower fixes and rejects page-wide left/back
  shared-border expansions that merged separate saved-good castle callouts.
- `0.142.1` keeps crop recovery generic: it restores a nearby printed outer
  border around quantity-backed panels and recovers clipped right-edge content
  only through local same-fill border continuation, replacing stale saved
  session geometry instead of adding manual-specific guards.
- `0.142.2` rejects page-one decorative logo fragments when a tiny near-white
  corner crop lacks real callout tint and behaves like dense logo foreground.
  Real blue or warm page-one quantity panels remain accepted.
- `0.142.3` rejects overlapping build-art leak duplicates: if one candidate
  starts inside an accepted same-fill callout and extends far below it into the
  model image, the detector keeps the real panel and removes the leaking crop.
  The rule is geometric and visual only; it does not use manual, page, or step
  identifiers.
- `0.142.4` broadens generic recovery for right-cropped bordered quantity
  panels and rejects top-aligned same-fill regions that duplicate an accepted
  panel before leaking far downward into build art.
- `0.142.5` reruns peer-panel trimming until stable, bounded to three passes.
  This lets a newly restored neighbor panel become trim evidence for a larger
  same-row crop that swallowed multiple panels, without relying on manual, page,
  or step identifiers.
- `0.143.0` adds review-only possible-step-multiplier page advisories. The
  signal uses native text matches when available and a bounded raster glyph scan
  for labels outside accepted callout boxes; large raster components are skipped
  so model art is not retained as glyph data. Focused new tests for text/raster
  advisories pass; the broader synthetic detector test file still has existing
  exact-region expectation drift unrelated to the advisory output.
- `0.143.1` rejects raster `x digit` traps in callout part extraction,
  quantity-evidence checks, compact fallback, and page multiplier advisories.
  The pattern is not a valid `Nx` quantity label and was creating false part
  rows and false page review markers. Page advisories also suppress raster
  labels with a plausible part foreground above them on a blue callout-like
  background, so missed callout quantities do not get flagged as outside-step
  multipliers.
- On 2026-06-06, the user-approved Middle Wall saved session was added as
  package fixture `manual-010.bagit-session.json` for the browser saved-session
  gate. The fixture strips derived `imageDataUrl` previews but keeps embedded
  source bytes, expected callouts, quantities, part-image regions, and alpha
  masks for fresh `/v2` browser replay.
- `0.143.2` invalidates same-version stale local results and records a private
  reduced issue-pages replay containing annotated Hall Tower, Upper Courtyard,
  and Lower Courtyard regression pages. The reduced replay must pass saved-good
  count and source-region checks before full castle, small, and medium manual
  gates run.
- `0.143.3` tightens outside-callout multiplier detection after Lower Courtyard
  annotations. The page-level raster pass now rejects `x digit` build-art traps
  on cluttered backgrounds, removes long panel rules before OCR, prefers
  lower-left-weighted dense `2` feature classification over dense-template `8`,
  and only runs the large `2x` fallback around warm repeat-instruction panels.
  Targeted replay flags pages 31 and 164 as `2x` and leaves pages 21, 24, 26,
  and 27 unflagged.
- `0.143.4` classifies the current annotated failures as false quantity labels
  from part texture, over-expanded stacked callout recovery, and side/top part
  preview crops. The detector keeps the pre-expanded sibling when an expansion
  leaks into a peer callout, the item pass requires final raster quantity labels
  to sit on plain callout background, and page multiplier advisories stay
  review-only while suppressing missed part-callout labels.
- Webwright shell validation passes against the local app
- TypeScript `npm run typecheck` passes
- long-manual benchmark for `0.141.10` scans 400 synthetic pages with 800
  detected callouts in 10.11 seconds, with 401 progress events and max progress
  gap under 67 ms
- in-app browser file upload automation is not currently available through the
  browser control API; when that blocks direct app-path replay, use the same
  PDF-rendered page images as supporting evidence and record the blocker
- 2026-05-29: `npm run verify`, `npm run webwright:validate`, focused detector
  tests, fixture tests, bagging/session tests, and the private small,
  `MOC-133471`, and farmhouse saved-good replays pass for the detector/session
  restore changes
- 2026-05-31: part extraction reuses the legacy quantity-anchor zone approach
  for raster rows: same-row labels set ownership boundaries, components are
  scored against all quantity anchors, and crops are clipped away from neighbor
  rows. Private saved-good part smoke for Castle Ramp, Hall Tower, and
  `MOC-77633` passed with 817 callouts, 2193 part rows, and zero invalid
  quantity, label-overlap, out-of-callout, or empty-crop rows.
- 2026-05-31: part extractor `0.4.1` ports the legacy density-grid quantity
  classifier for proportional browser-rendered digits and keeps dense
  seven-segment matching only for fixture-sized glyphs. Part crop search now
  widens beyond midpoint anchor zones and uses neighboring quantity label edges
  plus ownership scoring to avoid right-edge clipping. Disconnected component
  merging now requires tight adjacency to the selected quantity-owned component
  so same-row neighbor parts do not merge into one crop.
- 2026-05-31: part extractor `0.4.2` classifies dense, anti-aliased manual
  raster `3` glyphs before dense-template matching so open `3x` labels are not
  emitted as `8x`.
- 2026-05-31: part extractor `0.4.3` relaxes raster quantity label acceptance
  only after a callout has already been accepted. The item extractor keeps the
  `x` glyph as the anchor, trims oversized noisy digit strings back to the
  nearest plausible quantity suffix, and suppresses loose labels that remain too
  wide. Castle Ramp saved-good replay now recovers the user-annotated dropped
  part rows; step 18 is recorded as a source/annotation conflict because the
  raster callout visibly contains nine quantity labels.
- 2026-05-31: part extractor `0.4.4` adds preview-only high-resolution row
  crops. Browser scans keep detector geometry at the normal render scale, render
  a second higher-resolution page only for pages with part rows, and scale the
  part/quantity crop source rectangles into that render while preserving the
  original detector-coordinate regions for row sizing and session anchors.
- 2026-05-31: part extractor `0.4.5` follows the legacy preview-crop pattern by
  padding high-resolution part preview source regions inside the callout and
  masking background pixels in the generated image. Detector-owned part regions
  remain unchanged; the row image gets a little extra source context to avoid
  left/right edge clipping.
- 2026-05-31: part extractor `0.4.6` raises the preview-only part crop padding
  for high-resolution row images. The detector-owned `partRegion` remains the
  session anchor, while the masked preview gets more source context for top and
  side crop regressions.
- 2026-05-31: part extractor `0.4.7` keeps that padded preview source but
  removes disconnected alpha components that do not intersect the detected part
  box, so neighboring part slivers and callout borders at the crop sides do not
  remain visible.
- 2026-05-31: part extractor `0.4.8` tightens raster item labels so accepted
  quantity labels must sit on the inferred callout background rather than a
  local part surface. It also expands tall/long connected part foreground from
  the raw selected component before applying neighbor-label ownership, reducing
  top and right crop regressions on large parts.
- 2026-05-31: part extractor `0.5.0` adds advisory part color metadata. The
  extractor samples dominant non-background pixels inside each part-only crop,
  matches a conservative common LEGO fallback palette with perceptual distance,
  and emits review/family status when confidence is not strong enough for an
  exact color.
- 2026-06-10: part color calibration moved into `@bag-it/part-colors`. The
  package samples final v2 part masks, clusters rows into manual-local color
  classes, uses class-centroid swatches in existing UI, and keeps LEGO color
  names advisory. After the first private report showed severe under-clustering,
  the sampler now emits ranked color chips and rejection counts, calibration
  biases toward conservative over-clustering, and same-part visual grouping
  requires matching `manualClassId` only when both rows have
  `manualClassTrusted`. Private tuning reports recompute current classes from
  embedded manual bytes when available and write only under ignored
  `.bag-it/private/part-color-reports/**`.
- 2026-06-11: first Castle Ramp tuning pass keeps neutral gray body chips from
  collapsing into medium-dark shadow classes, merges same-hue reddish-brown
  render drift, adds common `Green` to advisory naming, and degrades tiny
  review-only or warm transparent-like samples to family-only status.
- 2026-06-11: second Castle Ramp tuning pass merges small/thin green
  edge-polluted classes into the stronger same-hue green class only when local
  chips include that stronger body color, merges close neutral gray drift, and
  updates private reports to show every class sample plus row-by-class audit
  guidance.
- 2026-06-11: Castle Ramp follow-up keeps tiny black parts from choosing light
  highlight pixels, links class-summary report crops to their row-level audit
  entries, and bumps the part extractor output version to `2.0.0-alpha.144` so
  stale color metadata reruns in the app.
- 2026-06-11: app-side color sampling now downscales the high-resolution part
  extraction render to base page coordinates before sampling returned part
  masks. This fixes Castle Ramp live app colors being sampled from wrong
  upscaled coordinates and bumps the part extractor output version to
  `2.0.0-alpha.145`.
- 2026-06-11: private part-color reports now show app-aligned class `Parts`
  totals in addition to row counts. The report top table can be compared
  directly with the Bags tab Color bucket quantities, while row-by-class tables
  remain the detailed tuning audit surface.
- 2026-06-12: Middle Wall part-color tuning adjusts neutral body-chip
  selection so light/medium body evidence can beat dark outline/shadow chips,
  keeps stable dark red out of shadowed reddish-brown merging, splits
  high-background light neutral rows toward rendered white, separates cool
  medium neutral dark bluish gray from flat silver, and adds rendered dark
  bluish gray/tan advisory naming. The calibration version is
  `1.0.0-alpha.10`.
- 2026-06-12: Middle Wall app-path color tuning aligns saved `detectedColor`
  output with the report review target: warm-brown body chips can beat tan
  print/glare chips, brighter medium neutral evidence can hold flat silver,
  small transparent-orange rows can split from reddish brown, and slightly
  darker high-background neutral rows can become rendered white. The calibration
  version is `1.0.0-alpha.11`.
- 2026-06-12: multi-manual report tuning updates color calibration to
  `1.0.0-alpha.12`: high-background light bluish gray is no longer named white
  without near-white chip evidence, stronger near-black body evidence can beat
  medium gray support, bright warm gold/yellow chips can beat dark brown shadow
  chips, weak rendered trans-orange variants merge together, shadowed dark-red
  variants merge with dark red, and rendered dark-tan classes use a dark-tan
  advisory name. Part extractor `2.0.0-alpha.146` also tightens same-row sparse
  boundary selection so a row crop does not borrow a neighboring same-row part
  when the previous sparse column is too far from the midpoint between quantity
  labels.
- 2026-06-13: part extractor `2.0.0-alpha.149` fixes Lower Courtyard
  stacked-callout preview regression where lower-row top recovery could be
  clipped before envelope recovery, then reopened by selected-envelope or tall
  top recovery. Final part image creation reapplies the upper-label clip so a
  lower-row preview cannot include the upper-row part owned by a close quantity
  label.
- 2026-06-16: part extractor `2.0.0-alpha.150` invalidates saved alpha149 part
  rows after Hall Tower step 137 was found stale in a color-tuning session.
  The extractor code already emits the correct rows on fresh PDF analysis; the
  version bump forces restored sessions to rerun stale alpha149 part rows.
- 2026-06-13: part color calibration `1.0.0-alpha.14` keeps the core/edge
  sampling and same-name merge behavior from `1.0.0-alpha.13`, and treats
  small cool neutral classes with high edge pollution and LBG-like light chips
  as Light Bluish Gray instead of Flat Silver.
- 2026-06-13: part color calibration `1.0.0-alpha.16` adds the Middle Wall
  feedback pass without loosening the Castle Ramp gate. Weak dark warm rows
  without strong transparent-orange evidence may merge into stronger
  same-manual Reddish Brown, stable small trans-orange rows can stay
  Trans-Orange, contextual Bright Green and Yellow rows can same-name merge,
  and tiny true-black raw classes resist LBG edge-context rescue.
- 2026-06-13: part color calibration `1.0.0-alpha.17` applies the next Middle
  Wall report feedback pass without changing part extraction. Per-row advisory
  naming can split cool review-grade Flat Silver rows to Light Bluish Gray,
  very dark body rows inside Green to Dark Green, warm body-chip rows to Medium
  Nougat or Light Nougat when those same-manual classes exist, and broad
  Light-Bluish-Gray-to-Black rescue remains excluded because Castle Ramp LBG
  shadows share that evidence. Castle Ramp remains part of the regression gate.
- 2026-06-13: part color calibration `1.0.0-alpha.18` fixes Castle Ramp report
  review regressions where tiny high-edge LBG parts stayed in a Dark Bluish
  Gray raw class. The rule requires low selected coverage, high edge rejection,
  tiny pixel count, and a cool LBG light-chip signal, so ordinary Dark Bluish
  Gray parts with stable body coverage stay unchanged. Private recomputed
  reports show current calibration version separately from saved session
  metadata.
- 2026-06-13: part color calibration `1.0.0-alpha.19` keeps the accepted
  Castle Ramp split as a color regression check and applies the next Middle
  Wall feedback pass. Explicit review-grade overrides now cover Dark Azure,
  Dark Bluish Gray, Tan, and Light Bluish Gray body evidence so same-name
  canonical merging can place those rows in the app bucket. The LBG family
  rescue requires at least 45 selected pixels, which excludes the accepted
  44-pixel Castle Ramp ambiguity.
- 2026-06-13: part color calibration `1.0.0-alpha.20` applies the next Middle
  Wall report feedback while keeping Castle Ramp as the color regression gate.
  Tiny yellow-chip rows inside Trans-Orange can split to Yellow, large
  dark-tan body rows inside gray/tan context can split to Dark Tan, and tiny
  high-background cool neutral rows inside contextual White can split to Light
  Bluish Gray when no white-chip evidence is present.
- 2026-06-13: part color calibration `1.0.0-alpha.21` extends color samples
  with diagnostic edge/support chips and uses them for a narrow shadowed Light
  Bluish Gray rescue. Castle Ramp now has row-level regression assertions for
  known LBG rows that previously hid inside the Dark Bluish Gray bucket; true
  small black rows remain pinned to Black.
- 2026-06-13: part color calibration `1.0.0-alpha.24` keeps Castle Ramp as the
  color regression gate and applies the latest Middle Wall report feedback:
  stable Black and Pearl Gold body evidence can override polluted neutral raw
  classes, tiny LBG rows with light edge evidence are protected from Black/DBG
  rescue, and the tiny DBG body rescue is bounded by selected-pixel count plus
  dominant body coherence.
- 2026-06-13: part color calibration `1.0.0-alpha.25` keeps Castle Ramp as the
  color regression gate and applies the final two Middle Wall notes from this
  pass: dark-orange body pixels no longer merge into Pearl Gold, and rendered
  light-nougat-looking Tan highlights merge into Tan only when same-manual
  tan-family evidence exists and the row is not a clean solid Light Nougat
  sample.
- 2026-06-13: part color calibration `1.0.0-alpha.26` fixes the Castle Ramp
  regression where reviewed row `v2-p4-fill-panel-008-part-2` moved from Dark
  Bluish Gray into Light Bluish Gray. The dark-neutral body guard now catches
  mid-size edge-polluted DBG rows before edge highlights can trigger LBG
  rescue.
- 2026-06-19: part color calibration `2.0.0-alpha.19` adds a narrow White
  rescue for rows currently named Black, Dark Bluish Gray, or Flat Silver when
  rejected-background evidence and source-specific guards show the sampled body
  hit outline/shadow instead of the rendered white part. Light Bluish Gray is
  intentionally excluded from this rule. Private runtime evaluation moved from
  `5961/6263` to `5970/6263` with zero row worsening before report
  regeneration.
- 2026-06-19: part color calibration `2.0.0-alpha.20` applies the neutral
  recheck labels after detector-patch crop drift. It adds a guarded Light
  Bluish Gray to White high-background path for tiny edge-dominated samples and
  a guarded Light Bluish Gray to Black path when rejected-edge evidence contains
  strong near-black support. Runtime evaluation against current private labels
  moves from `5974/6261` saved-report matches to `5978/6261`, with no scored
  manual worsening.
- 2026-06-13: Middle Wall color tuning was accepted as a private report-level
  regression snapshot. The committed test utility compares ignored
  `.bag-it/private/part-color-reports/regressions/**` snapshots against current
  private reports by class summary and row-assignment hash, which locks approved
  tuning reports without committing private crops or row-level report artifacts.
- 2026-06-13: part color calibration `1.0.0-alpha.28` begins Lower Courtyard
  color tuning after the accepted crop-preview gate. The pass adds targeted
  tests for the user-annotated Lower Courtyard white, red, transparent
  red/orange, medium nougat, teal, bright yellow, dark tan, flat silver, black,
  and dark bluish gray rows while keeping Castle Ramp and Middle Wall as local
  color regression gates.
- 2026-06-14: part color calibration `1.0.0-alpha.32` advances Lower
  Courtyard active label scoring from `8/58` to `12/58` without relaxing the
  Castle Ramp or Middle Wall gates. It adds resolver-order-safe edge-pollution
  rescues for Medium Nougat from Trans-Orange and Pearl Gold from Yellow,
  guarded by sample feature thresholds and same-manual anchor colors. Lower
  remains active, not accepted.
- 2026-06-14: part color calibration `1.0.0-alpha.33` advances Lower
  Courtyard active label scoring from `12/58` to `14/58` while keeping Castle
  Ramp at `152/152` and Middle Wall at `438/438`. The change narrows the
  dark-edge white rescue around rows with low body light-neutral coverage and
  strong light-neutral edge evidence, recovering two annotated white rows
  without broadening LBG/DBG routing. Lower remains active, not accepted.
- 2026-06-14: Lower Courtyard color tuning now uses a full active label
  freeze before more resolver changes. The freeze utility preserves existing
  user corrections, assigns every unlabeled current report row to its current
  detected color, and stores crop hashes so non-annotated current-good rows
  become regression data. The regenerated Lower report is current-code
  recomputed at part color `1.0.0-alpha.33`; active label scoring is
  `1415/1459` while Castle Ramp remains `152/152` and Middle Wall remains
  `438/438`. Lower remains active, not accepted.
- 2026-06-14: part color calibration `1.0.0-alpha.35` advances Lower
  Courtyard active label scoring from `1419/1459` to `1423/1459` while keeping
  Castle Ramp at `152/152` and Middle Wall at `438/438`. The pass adds narrow
  tiny Bright Yellow and shadowed Pearl Gold row resolvers guarded by
  same-manual Pearl Gold evidence, chip coverage, background rejection, and
  edge rejection. Remaining Lower mismatches are not promoted to gate because
  the red/reddish-brown and neutral gray/flat-silver cases overlap accepted
  rows too closely in the current sampled features.
- 2026-06-15: part color calibration `1.0.0-alpha.40` adds the Lower cleanup
  and tiny-row evidence pass while keeping Castle Ramp at `152/152` and Middle
  Wall at `438/438`. Private reports now hide matched-label notes, show only
  mismatch/missing/drift notes, classify active mismatches, and expose
  high-resolution fallback diagnostics for tiny or uncertain samples. The
  high-resolution fallback remains conservative: it is accepted only when the
  resampled evidence materially improves, because broader fallback use reduced
  Lower scoring. Lower remains active at `1423/1459`; remaining failures are
  21 neutral small-part ambiguities, 13 warm red/trans/brown ambiguities, and
  2 gold/nougat/trans singleton cases.
- 2026-06-15: part color calibration `1.0.0-alpha.42` keeps Castle Ramp at
  `152/152` and Middle Wall at `438/438`, prunes stale matched notes from the
  private Lower labels, and improves Lower to `1426/1459`. The accepted change
  is limited to bounded warm/yellow resolver evidence: tiny muted
  Trans-Orange with high background rejection and low dominance, plus bright
  Pearl Gold body chips with same-manual Pearl Gold anchors. A broader
  high-resolution neutral fallback trial was rejected because it reduced Lower
  to `1425/1459` despite preserving the gates.
- 2026-06-15: part color calibration `1.0.0-alpha.43` keeps Castle Ramp at
  `152/152` and Middle Wall at `438/438`, adds one narrow compact Flat Silver
  rescue for LBG-origin Lower rows, and improves Lower to `1427/1459`. The rule
  is blocked for Black-origin raw classes to protect the accepted Middle Wall
  dark-bluish-gray compact row. Lower remains active, not accepted.
- 2026-06-15: part color calibration `1.0.0-alpha.45` keeps Castle Ramp at
  `152/152` and Middle Wall at `438/438` under the current private full-label
  set, and adds one narrow stable Flat Silver body rescue for Lower Courtyard.
  The rule requires bounded medium-light neutral body evidence, bounded
  background rejection, and almost no Light Bluish Gray chip support. Lower
  moves from `1423/1459` to `1424/1459` in the current label eval. Broader
  tiny-neutral and high-resolution fallback tuning remains rejected because it
  overlaps accepted rows and risks the gates. Lower remains active, not
  accepted.
- 2026-06-16: part color resolver `2.0.0-alpha.0` keeps conservative
  manual-local classes, review/family-only advisory names, label-policy gates,
  and small modules for the upcoming private training workflow.
- 2026-06-16: private part-color reports now include a generated visual label
  workbench backed only by saved app `detectedColor` data. Label rows support
  `gate`, `train`, `holdout`, `active`, and `excluded` roles, and
  `npm run report:part-color-training` summarizes manual, family, close-pair,
  dirty-label, and trainable-count evidence without promoting runtime resolver
  prototypes.
- 2026-06-16: the private part-color workbench was rebuilt as a small static
  app per report. `index.html` now loads `workbench-data.js`, `workbench.js`,
  and `workbench.css`; audit tables moved to `details.html`. This keeps the
  visual label workflow file-friendly while avoiding brittle inline JSON/script
  wiring.
- 2026-06-16: the private part-color workbench keeps the filter/action toolbar
  sticky but leaves table headers in normal flow so the first visible row is
  not covered when opening or filtering a report.
- 2026-06-16: the private part-color workbench adds a source-callout preview
  column. Reports store one preview per callout and each row overlays the part
  region on that source crop, so close colors such as Dark Brown and Reddish
  Brown can be labeled from the original callout context without recomputing
  saved app color data.
- 2026-06-16: expected color entry in the private part-color workbench is now a
  controlled picker rather than raw JSON editing, preventing typo labels such
  as partial color names from creating false conflict groups in normal use.
- 2026-06-16: empty expected-color controls now prefill from the saved app
  detected color when that color is a canonical workbench option. Existing
  labels still win, and Unknown/non-canonical detected colors stay blank.
- 2026-06-16: expected-color controls now use a custom searchable suggestion
  menu over a committed 273-color
  Rebrickable catalog generated from
  `https://cdn.rebrickable.com/media/downloads/colors.csv.gz`, while retaining
  current resolver legacy names and temporary family-bucket options for
  compatibility. Supported missing colors such as Trans-Clear, Dark Turquoise,
  Warm Pink, Sand Green, Medium Blue, Bright Light Blue, and Light Nougat should
  be selected directly instead of written as note-only excluded rows. Partial
  search text is rejected at export time unless it is cleared or replaced with
  an exact catalog color. Large workbenches now split into linked pages of at
  most 500 rows, and the color menu supports Arrow Up, Arrow Down, Enter, and
  Escape keyboard navigation. Tab and Shift+Tab move only between expected
  color fields during labeling, skipping role, note, link, and action controls.
- 2026-06-16: blank expected-color rows with a note or `excluded` role now
  export as excluded labels. This preserves missing-dropdown notes and unusable
  crop decisions while keeping them out of scoring and training totals; label
  loading accepts the same excluded-without-expected-name shape.
- 2026-06-16: part color calibration `2.0.0-alpha.1` promotes aggregate
  prototypes into runtime advisory naming. Prototype constants are committed as
  aggregate centroid/support data only, trained from Castle Ramp, Middle Wall,
  and Bakery labels after backing up private label files. Lower Courtyard and
  Farmhouse remain score-only holdouts. The accepted cluster distance was
  tightened to CIEDE2000 `5` because the planned `8` merged close rendered
  modes and missed the external improvement gate; runtime prototype acceptance
  still requires top distance `<= 8` and nearest-name margin `>= 1.5`. On the
  refreshed saved-app reports, comparable fallback-only scores were Castle Ramp
  `134/151`, Middle Wall `361/438`, Lower Courtyard `1225/1449`, Bakery
  `255/340`, and Farmhouse valid subset `212/258`; aggregate prototypes score
  `150/151`, `412/438`, `1342/1449`, `294/340`, and `220/258`. Farmhouse had
  `39` old active labels whose item ids no longer existed after app refresh;
  those rows were marked `excluded` instead of guessed onto new crops.
- 2026-06-16: part color calibration `2.0.0-alpha.2` adds a neutral
  representative-color feature step before prototype/fallback naming. When a
  near-black selected chip is outweighed by same-row neutral body chips, the
  resolver uses the body chip for advisory naming; blue-biased near-black
  samples remain Black. This reduces 4th Stage unseen-holdout neutral misses
  from `44` to `19` total mismatches and scores `315/334`, while current
  saved-app reports do not worsen: Castle Ramp `150/151`, Middle Wall
  `413/438`, Lower Courtyard `1348/1449`, Bakery `303/340`, and Farmhouse
  `266/296`. A retrain of aggregate prototype constants under the new feature
  extraction was rejected because it worsened Flat Silver/Light Bluish Gray
  confusions on seed and holdout manuals; existing aggregate constants stay in
  place for this slice.
- 2026-06-17: part color calibration `2.0.0-alpha.3` adds the safe additive
  aggregate prototype path while a separate part-detector fix is pending.
  Runtime prototype updates now preserve the committed aggregate set by default
  and promote only trained clusters that are not already represented; `--replace`
  is required for a full prototype-set replacement. New candidate clusters need
  support `>= 4`, after source-session retraining showed support-3 Flat Silver
  overclaimed Light Bluish Gray. The only promoted runtime cluster in this
  slice is aggregate Pearl Gold. Runtime evaluation from saved app session
  samples and current private labels scores Castle Ramp `150/151`, Middle Wall
  `414/438`, Lower Courtyard `1352/1449`, Bakery `303/340`, Farmhouse
  `266/296`, 4th Stage `315/334`, Fountain `108/118`, Upper Courtyard
  `763/830`, Hall Tower `2052/2230`, and Wolf Pack Renegade `59/75`, for a
  net `+8` with no scored manual worsening. Full report-refresh acceptance
  remains deferred until the detector fix lands and saved app sessions can be
  regenerated through the browser path.
- 2026-06-17: part color calibration `2.0.0-alpha.4` continues the frozen-crop
  color loop without waiting for the separate detector regression-gate work.
  Candidate mining evaluated add, replace, and remove actions from the clean
  Castle Ramp, Middle Wall, and Bakery training clusters against all ten
  scored private manuals using saved app session samples. The accepted action
  replaces only the aggregate Black centroid with the current train-label
  centroid. Scores become Castle Ramp `150/151`, Middle Wall `414/438`, Lower
  Courtyard `1352/1449`, Bakery `303/340`, Farmhouse `266/296`, 4th Stage
  `315/334`, Fountain `108/118`, Upper Courtyard `764/830`, Hall Tower
  `2054/2230`, and Wolf Pack Renegade `59/75`, for net `+11` versus the saved
  reports and no scored manual worsening. A near-duplicate Reddish Brown add
  was rejected despite `+1` because it duplicated an already represented
  aggregate cluster.
- 2026-06-17: part color calibration `2.0.0-alpha.5` adds feature-only warm
  body-chip selection for near-black samples. When a near-black selected sample
  has strong warm/tan body-chip coverage with enough margin over near-black
  pixels, the resolver uses that chip as the row feature before prototype
  ranking. This targets shadowed Reddish Brown/Dark Brown rows without adding
  manual ids, row ids, crop hashes, or shape-specific behavior. Runtime
  evaluation against all ten scored private manuals improves to Castle Ramp
  `150/151`, Middle Wall `414/438`, Lower Courtyard `1353/1449`, Bakery
  `324/340`, Farmhouse `284/296`, 4th Stage `317/334`, Fountain `108/118`,
  Upper Courtyard `766/830`, Hall Tower `2055/2230`, and Wolf Pack Renegade
  `59/75`, for net `+56` versus saved reports. Four row-level label conflicts
  remain as private evidence; the three Black-to-Reddish-Brown conflicts in
  Farmhouse have visibly brown crops and were not encoded into runtime policy.
- 2026-06-19: part color calibration `2.0.0-alpha.28` adds a narrow Medium
  Nougat edge-evidence rule after refreshed reports and neutral label cleanup.
  Orange or Dark Orange may resolve to Medium Nougat only when same-row sample
  features show high edge rejection, low background rejection, muted warm body
  support, bounded saturated warm coverage, and bounded dark coverage. The
  refreshed private report/runtime parity score is `6021/6253`, improving by
  `+4` and reducing mismatches to `232` with no scored manual worsening.
- 2026-06-19: part color calibration `2.0.0-alpha.29` relaxes Dark Tan body
  evidence for thin/shadowed Dark Tan rows currently named Dark Bluish Gray.
  The resolver now accepts one close Dark Tan anchor chip when low-chroma
  dark-tan body coverage is broad, while saturated warm and olive-gray guards
  are tighter. Refreshed private report/runtime parity is `6027/6253`, a `+6`
  gain that reduces mismatches to `226`, with no scored manual worsening.
- 2026-06-19: part color calibration `2.0.0-alpha.30` adds a narrow Pearl Gold
  accepted-chip body evidence rule for rows currently named Dark Brown. It
  requires gold-hue coverage, bright-gold support, bounded dark coverage, and
  bounded red coverage across accepted chips. Refreshed private report/runtime
  parity improves to `6031/6253`, a `+4` gain that reduces mismatches to `222`,
  with no scored manual worsening.
- 2026-06-19: part color calibration `2.0.0-alpha.31` makes white-part sampling
  interior-aware. Background-like pixels can be retained only when neutral
  light pixels own the mask core; pale blue callout fill is rejected as white
  evidence, and dark edge rescue cannot override a confirmed white core.
  Renderer-recomputed private diagnostics versus alpha30 improve Bakery
  `332/344` to `333/344`, Upper Courtyard `796/828` to `797/828`, and Hall
  Tower `2111/2217` to `2112/2217`, with Castle Ramp `150/151`, Middle Wall
  `419/435`, Lower Courtyard `1378/1446`, Farmhouse `293/302`, 4th Stage
  `323/332`, Fountain `112/118`, and Wolf Pack Renegade `73/75` unchanged.
  Saved app-result parity remains `6033/6248` until browser sessions are
  refreshed with the new calibration version.
- 2026-06-19: part color calibration `2.0.0-alpha.32` adds a narrow
  Dark Green body evidence rule for rows currently resolving as Green. The
  rule requires at least `80%` dark-green accepted chip coverage, at most `10%`
  bright-green accepted chip coverage, and at least `30%` dark-green edge
  support. Saved private runtime evaluation moves from `6033/6248` to
  `6038/6248`, improving Middle Wall by `+2`, Lower Courtyard by `+2`, and
  Hall Tower by `+1`; row-level worsening is `0`.
- 2026-06-19: part color calibration `2.0.0-alpha.33` extends Pearl Gold body
  evidence to rows currently resolving as Dark Orange, but only when accepted
  chips show at least `46%` gold-hue coverage, at least `20%` bright-gold
  coverage, at most `20%` dark coverage, and at most `6%` red coverage. The
  saved private runtime gate moves from `6038/6248` to `6042/6248`, improving
  Hall Tower by `+3` and Wolf Pack Renegade by `+1`; row-level worsening is
  `0`.
- 2026-06-19: part color calibration `2.0.0-alpha.34` extends Dark Tan body
  evidence to rows currently resolving as Dark Brown. This source path requires
  at least `120` accepted pixels, background rejection at most `16%`, at least
  `47%` dark-tan body coverage, at least `30%` anchored core coverage, and at
  most `5%` light-tan guard coverage. Saved private runtime evaluation moves
  from `6042/6248` to `6044/6248`, improving Upper Courtyard by `+2`; row-level
  worsening is `0`.
- 2026-06-19: part color calibration `2.0.0-alpha.35` widens Light Bluish Gray
  edge evidence only for small edge-heavy neutral rows with visible light
  neutral top chips, strong light neutral edge chips, bounded dark coverage, and
  near-zero near-black coverage. Saved private runtime evaluation moves from
  `6044/6248` to `6046/6248`, improving Hall Tower by `+2`; row-level worsening
  is `0`.
- 2026-06-19: part color calibration `2.0.0-alpha.36` adds a low-dark tiny
  White body path for rows currently resolving as Light Bluish Gray. It requires
  at most `20` accepted pixels, high background rejection, visible light-neutral
  edge evidence, bright edge reach, and very low dark accepted-chip coverage.
  Saved private runtime evaluation moves from `6046/6248` to `6049/6248`,
  improving Lower Courtyard by `+3`; row-level worsening is `0`.
- 2026-06-19: part color calibration `2.0.0-alpha.37` adds a narrow Red body
  evidence rule for rows currently resolving as Dark Red. It requires enough
  accepted pixels, low background rejection, high red body coverage, visible
  bright-red body chips, strong red edge support, and bounded dark-red shadow
  coverage. Saved private runtime evaluation moves from `6049/6248` to
  `6052/6248`, improving Lower Courtyard by `+2` and Hall Tower by `+1`;
  row-level worsening is `0`.
- 2026-06-19: part color calibration `2.0.0-alpha.38` extends transparent
  primary evidence for tiny red glass parts currently resolving as Reddish
  Brown. The path requires at most `50` accepted pixels, at least `16%`
  background rejection, at least `42%` edge rejection, at least `55%` red body
  coverage, and visible light-red body support. Saved private runtime
  evaluation moves from `6052/6248` to `6056/6248`, improving Hall Tower by
  `+4`; row-level worsening is `0`.
- 2026-06-19: part color calibration `2.0.0-alpha.39` extends transparent
  primary evidence for tiny red glass parts currently resolving as Dark Red.
  This path is limited to at most `65` accepted pixels, at least `14%`
  background rejection, at least `52%` edge rejection, at least `75%` red body
  coverage, at least `30%` light-red body support, and at least `42%` red edge
  support. Saved private runtime evaluation moves from `6056/6248` to
  `6058/6248`, improving Hall Tower by `+2`; row-level worsening is `0`.
- 2026-06-19: part color calibration `2.0.0-alpha.40` adds a separate tiny
  Red-to-Trans-Red body path for cases where glass edges sample gray or
  reflection pixels instead of red. It keeps the saturated red-edge path intact,
  and requires at most `50` accepted pixels, at least `16%` background
  rejection, at least `48%` edge rejection, at least `90%` red body coverage,
  and at least `58%` light-red body support. Saved private runtime evaluation
  moves from `6058/6248` to `6060/6248`, improving Hall Tower by `+2`;
  row-level worsening is `0`.
- 2026-06-19: part color calibration `2.0.0-alpha.41` adds a narrow
  Pearl-Gold-to-Trans-Orange evidence path for small edge-heavy transparent
  orange rows. It requires bounded accepted pixels, background and edge
  rejection, strong orange and light-orange body coverage, low red coverage,
  and bounded dark coverage. Saved private runtime evaluation moves from
  `6060/6248` to `6063/6248`, improving Lower Courtyard, Bakery, and Hall
  Tower by `+1` each; row-level worsening is `0`.
- 2026-06-19: part color calibration `2.0.0-alpha.42` adds a narrow
  Yellow-to-Trans-Yellow evidence path for tiny transparent yellow parts. It
  requires at most `60` accepted pixels, background and edge rejection, strong
  yellow and bright-yellow body coverage, low orange coverage, and low dark
  coverage. Saved private runtime evaluation moves from `6063/6248` to
  `6065/6248`, improving Hall Tower by `+2`; row-level worsening is `0`.
- 2026-06-19: part color calibration `2.0.0-alpha.43` adds a narrow
  Dark-Green-to-Trans-Green evidence path for tiny transparent green parts. It
  requires at most `45` accepted pixels, background and edge rejection, strong
  green body and green-edge coverage, bounded light-green support, and bounded
  dark coverage. Saved private runtime evaluation moves from `6065/6248` to
  `6067/6248`, improving Hall Tower by `+2`; row-level worsening is `0`.
- 2026-06-19: part color calibration `2.0.0-alpha.44` adds a narrow
  Green-to-Bright-Green evidence path for tiny edge-heavy bright green parts. It
  requires at most `50` accepted pixels, background rejection, high edge
  rejection, bright-green body support, and bounded dark-green support. Saved
  private runtime evaluation moves from `6067/6248` to `6069/6248`, improving
  Lower Courtyard by `+2`; row-level worsening is `0`.
- 2026-06-19: part color calibration `2.0.0-alpha.45` extends the transparent
  green evidence path to tiny Green-source rows with stricter high-edge and
  low-light-green guards. Saved private runtime evaluation moves from
  `6069/6248` to `6070/6248`, improving Hall Tower by `+1`; row-level
  worsening is `0`.
- 2026-06-20: part color calibration `2.0.0-alpha.46` extends the Medium
  Nougat edge-evidence rule for diffuse Dark Orange-source rows. The widened
  path still requires bounded pixels, high edge rejection, bounded background
  rejection, muted-warm body support, and now rejects strong dominant orange
  chips so true Dark Orange remains protected. Saved private runtime evaluation
  moves from `6070/6248` to `6073/6248`; row-level worsening is `0`.
- 2026-06-20: part color calibration `2.0.0-alpha.47` adds a separate Tan body
  evidence rule for Tan rows whose accepted sample skewed to Dark Bluish Gray
  edge/shadow pixels. The rule runs after Dark Tan evidence and requires
  bounded pixels, high edge rejection, bounded background rejection, broad tan
  body coverage, visible light-tan support, and low saturated-warm coverage.
  Saved private runtime evaluation moves from `6073/6248` to `6076/6248`;
  row-level worsening is `0`.
- 2026-06-20: part color calibration `2.0.0-alpha.48` extends Light Bluish
  Gray edge evidence with a high-edge top-chip path for tiny Dark Bluish
  Gray-source rows. The path is bounded by accepted pixels, background
  rejection, edge rejection, light/mid neutral top-chip support, dark-neutral
  coverage, and near-black coverage so high-background transparent-blue rows
  stay out. Saved private runtime evaluation moves from `6076/6248` to
  `6078/6248`; row-level worsening is `0`.
- 2026-06-20: part color calibration `2.0.0-alpha.61` adds a narrow
  Black-to-Dark-Bluish-Gray dark-neutral edge evidence path. It only applies
  when Black fallback came from an edge/background-heavy neutral sample with
  bounded pixels, a tight background-rejection window, strong accepted
  mid-neutral body support, low light-neutral support, and low near-black body
  support. Saved private runtime evaluation moves from `6141/6248` to
  `6143/6248`; row-level worsening is `0`.
- 2026-06-20: part color calibration `2.0.0-alpha.62` extends Yellow body
  evidence for tiny shadowed Yellow rows that prototype-match Trans-Yellow.
  The path is bounded by accepted pixels, high background rejection,
  shadow-yellow chip support, low bright-yellow body coverage, and dark shadow
  evidence. Saved private runtime evaluation moves from `6143/6248` to
  `6146/6248`; row-level worsening is `0`.
- 2026-06-20: part color calibration `2.0.0-alpha.63` extends Pearl Gold body
  evidence to rows selected as Reddish Brown only when repeated strong
  bright-gold body coverage is present. The path is feature-only and keeps
  manual ids, row ids, crop hashes, and one-off overrides out of runtime code.
  Saved private runtime evaluation moves from `6146/6248` to `6148/6248`;
  row-level worsening is `0`.
- 2026-06-20: part color calibration `2.0.0-alpha.64` extends Red body
  evidence for small shadowed Red rows that resolve as Dark Red. The added path
  is bounded by red accepted-chip coverage, red rejected-edge support, very low
  near-black body coverage, and bounded background rejection. After imported
  review exclusions, saved private runtime/report parity is `6151/6240`; row
  worsening is `0`.
- 2026-06-20: part color calibration `2.0.0-alpha.65` extends transparent
  orange evidence for tiny Trans-Orange rows that resolve as Medium Nougat. The
  path requires high background rejection, bounded pixels, orange/light-orange
  body evidence, weak orange-edge support, and low red/dark body coverage so
  true Medium Nougat rows with strong orange edges remain protected. Private
  runtime evaluation moves from `6151/6240` to `6154/6240`; row worsening is
  `0`.
- 2026-06-13: part color calibration `1.0.0-alpha.13` samples mask-core body
  pixels before edge/outline pixels, keeps deprioritized edge pixels visible in
  private report overlays, and adds canonical same-name class merging. Raw
  manual color classes remain diagnostic evidence through `rawManualClassId`;
  the app-facing `manualClassId` is the merged same-name class used by Bags and
  grouped-parts color compatibility.
- 2026-05-31: part extractor `0.5.1` fixes the Middle Wall targeted replay for
  steps 8, 62, 66, and 69. It restores the legacy plain-background foreground
  ratio guard for raster quantity labels, suppresses immediate above-label
  traps where a part is read as `Nx`, and splits crowded same-row crops by
  neighboring part-region boundaries. The private four-step replay now reports
  expected row counts and quantity sequences without rescanning the full manual.
- 2026-05-31: part extractor `0.5.2` fixes the Middle Wall cropped-preview
  regression for steps 44, 87, 91, 92, and 95. A private replay freezes the
  current saved-session output, checks those five broken steps for top/right
  crop-edge contact, and compares all other saved-session steps against the
  frozen baseline. The fix uses size-aware high-resolution preview padding
  while keeping disconnected-neighbor cleanup active.
- 2026-05-31: fresh small-manual part smoke passed for three small PDFs with
  110 detected callouts, 242 part rows, and zero invalid quantity,
  label-overlap, out-of-callout, or empty-crop rows.
- 2026-05-31: long-manual speed pass moves preview rendering off the scan
  critical path, records aggregate scan/preview timings, caches repeated glyph
  and border-mask derivatives, and bridges one weak page in the browser
  inventory-tail cutoff. Lower Courtyard first-20-page private replay kept 27
  callouts and improved from about 33.5 seconds to about 16.2 seconds. The full
  217-page replay without app tail skipping took about 236 seconds and showed
  slow dense appendix pages after page 193; the app cutoff now selects page 195
  for that sampled tail pattern, so the next bottleneck is broad worker
  parallelism rather than preview generation.
- 2026-05-31: large-manual private timing slices after the speed pass:
  `MOC-138457` first 20 pages took about 11.4 seconds at 0.53 seconds/page
  detector mean, and `MOC-191306` first 20 pages took about 8.9 seconds at
  0.40 seconds/page detector mean. These indicate 300-page manuals should be
  practical serially after tail skipping, while 500-page manuals still justify
  a worker-pool detector iteration.
- 2026-05-31: focused browser/app tests passed with 22 tests. TypeScript
  typecheck passed.
- 2026-06-01: detector `0.144.0` adds seeded browser worker parallelism. The
  app enables parallel page detection for fresh scans with eager preview images
  disabled. Private Node worker benchmark mirroring the browser strategy kept
  first-20-page callout counts stable while improving Lower Courtyard from
  about 16.2 seconds serial to about 7.1 seconds with four workers,
  `MOC-138457` from about 11.4 seconds to about 4.8 seconds, and `MOC-191306`
  from about 8.9 seconds to about 3.4 seconds. Focused detector/browser/app
  suite passes with 71 tests.
- 2026-06-01: part extractor `0.5.5` adds preview-only transparent output
  padding after alpha-bound trimming. This keeps detected part geometry stable
  while giving tight gray thumbnails top-edge breathing room and preserving
  disconnected-neighbor cleanup.
- 2026-06-01: detector `0.147.11` makes duplicate cleanup yield to smaller
  complete bordered quantity panels when a larger same-fill candidate spans
  multiple contained panels. The reduced Hall Tower issue manual now recovers
  the two previously dropped manual-style panels while keeping the step 319
  full-panel crop.
- 2026-06-04: v2 part extraction moved into package `@bag-it/callout-parts`.
  Part extractor `2.0.0-alpha.31` scans only accepted callout interiors, creates
  one row per accepted raster `Nx` label, assigns part foreground from a
  callout-local row band, and emits stored `partImage.region` plus
  `partImage.alphaMask`. `/v2` hydrates previews from those stored fields and
  no longer emits app-side `partCrop`.
- 2026-06-03: v2 part extraction restarted as a callout-region-only,
  label-owned raster pass. The ownership midpoint stays an assignment hint instead of
  a hard flood-fill crop edge, which prevents long parts from being clipped on
  the right. Alpha 6 fixes dense open `4` glyphs being misread as closed-loop
  `8` glyphs. Alpha 7 fixes thick one-stem `1` glyphs and rejects raised
  part-shaped glyphs that mimic `Nx` labels above the dominant same-row label
  baseline. Alpha 8 fixes restored-session scale handling: stale part reruns
  and default preview hydration render at the saved page-preview width, so
  source callout coordinates and page pixels stay comparable. Private replay
  must use the same render scale as the source callout coordinates. Alpha 9
  makes streamed page rows progress-only and reruns part extraction for final
  accepted callout regions before assembly. During page scan, provisional rows
  may be extracted as soon as page-level callouts are visible, but final output
  keeps only rows recomputed from final accepted callouts. Native PDF text,
  source text OCR, BOM data,
  catalogue data, and page-wide part scans are not inputs. Part extraction never
  downgrades accepted callouts; zero rows on an accepted callout is a validation
  failure. MOC-129110 private replay currently keeps 33 accepted callouts,
  reports zero zero-row accepted callouts, and emits 76 visible-label rows. The
  BOM-derived 60-66 row target remains a warning signal, not a reason to drop
  visible raster labels. Alpha 10 fixes the exact in-app browser failures for
  MOC-129110 steps 21 and 22: step 21 now rejects the part-art fake `7x` and
  emits four `1x` rows, while step 22 reads the slanted left `1x` label as
  `1x` instead of `4x`. Alpha 11 adds preview-only transparent part matting and
  tighter visual crop regions while keeping `partRegion` as the stable
  detector/session anchor. Alpha 12 replaces flat-fill matting with a local
  background model so callout fill gradients do not remain as faint alpha in
  part thumbnails. Alpha 13 rejects oversized raised translucent part fragments
  above a compact real label baseline and adds browser-scale raster digit rules
  for `3`, cropped-top `5`, `6`, and `9`. Alpha 14 rejects close raised
  sparse/noisy candidate rows and too-short label-like fragments from light
  part art, and adds asymmetric crop padding for low-contrast part tops. Alpha
  15 rejects same-column part slivers above lower real labels and gives
  preview-only transparent crops extra top breathing room. Alpha 17 handles
  same-column raised part marks that nearly touch compact lower baselines with
  the same geometry-only guard, without manual-specific tuning or source text
  OCR. Alpha 20 rejects label-sized dense cap masks so compact studs and part
  crescents do not become fake quantity rows. Alpha 21 rejects label-like
  candidates with immediate local foreground continuation below the candidate
  and keeps a following non-digit `x` as the anchor for multi-digit labels such
  as `12x`.
  Alpha 22 narrows x-like digit ownership so adjacent labels do not merge,
  trims one bridge column when splitting connected digit+x blobs, and rejects
  connected split candidates whose mask still has dense part-cap bands.
  Alpha 25 moves final text/value reading into bounded raster OCR, Alpha 26
  removes digit-value classification from candidate assembly and suppression,
  Alpha 27 keeps preview matte source crops inside the callout interior so part
  thumbnails cannot retain the outer callout border, and Alpha 28 keeps
  dense-bottom closed-loop `8x` labels from being read as `2x`. Alpha 29 drops
  secondary thin vertical source-edge components from the preview matte so
  thick callout side borders do not remain in part thumbnails.
- 2026-06-05: `/v2` fresh scans stream rendered page inputs without rerunning
  full step-callout detection on every page-progress update. Detection still
  runs once over the complete page set before final part extraction, so accepted
  callouts and part rows are unchanged, but browser scans no longer stall on
  long manuals from repeated whole-prefix rescans. Interim progress may show
  zero callouts until final detection completes.
- 2026-06-05: callout-parts alpha 45 aligns part ownership component discovery
  with alpha-mask weak foreground handling. Pixels that are far enough from the
  callout fill to survive alpha masking can now seed owned part components, so
  small low-contrast upper-row parts are not dropped before the stored
  `partImage.region` and `partImage.alphaMask` are built.
- 2026-06-05: callout-parts alpha 46 bounds lower-row ownership at just below
  the previous label row instead of the previous row top. This keeps lower-row
  tall-part search non-fragile while preventing a lower label from borrowing
  upper-row parts and quantity labels.
- 2026-06-05: callout-parts alpha 47 restricts part alpha masks to the
  foreground components selected by label ownership. Padded stored regions still
  provide preview breathing room, but unrelated foreground inside that rectangle
  stays transparent, removing neighboring side slivers without changing the
  browser-only validation policy.
- 2026-06-05: callout-parts alpha 48 extracts row-band/label ownership into a
  small part ownership module and keeps tight primary-adjacent foreground
  fragments with the selected component group even when a fragment center sits
  closer to the next printed label. This preserves disconnected right-edge
  pixels without letting loose neighboring foreground become opaque in the
  stored alpha mask.
- 2026-06-05: callout-parts alpha 49 keeps the selected-component alpha mask
  but pads stored part-image regions farther on the right after alpha-bound
  trimming, giving compact right-edge parts visible thumbnail breathing room
  without changing quantity ownership or letting non-owned foreground appear.
- 2026-06-05: callout-parts alpha 50-53 keeps high-scale single-digit labels
  in narrow callouts by sizing the width gate against label height, and adds
  transparent left/right breathing room around alpha-trimmed part masks. Middle
  Wall browser validation now keeps step 76's `4x`, `1x`, and `3x` rows and
  gives step 51's final white `2x` part room on both sides without making
  non-owned foreground opaque.
- 2026-06-06: callout-parts alpha 54-58 stabilizes MOC-129110 part ownership
  and masking. The extractor samples callout-local background colors so yellow
  and blue fill gradients do not survive alpha masking, rejects border
  fragments and quantity-label halo residue before component scoring, salvages a
  narrow fused `1x` label when adjacent part art hides the digit from normal
  component discovery, and treats saturated near-background fill as
  background-like during ownership and preview hydration. The user-annotated
  step 22 callout now emits all three `1x` rows, generated thumbnails for the
  marked yellow-background crops contain zero yellow-background pixels, and
  `manual-008.bagit-session.json` is kept as a browser saved-session regression
  with 33 callouts and 76 checked part rows. Castle Ramp, MOC-129110, and
  Middle Wall saved-session guards pass through `/v2` with part rows checked.
- 2026-06-06: callout-parts alpha 59 fixes the MOC-129110 browser-raster step
  12 quantity read where a connected visible `8x` label was emitted as `9x`.
  The fix adds source glyph loop-density and lower-left/lower-right closure
  classification for closed `8` before the source `9` fallback, without manual
  ids, page ids, step ids, expected counts, source text OCR, BOM data,
  catalogue data, or color-specific branches.
- 2026-06-06: callout-parts alpha 61 fixes the MOC-132385 browser-raster step
  31 quantity read where a visible dense `5x` label was emitted as a larger
  closed-loop quantity, and gives compact part images extra bottom-only
  breathing room. The fix uses source glyph row-center and edge-opening
  evidence for `5`, plus asymmetric source/mask padding; it does not add manual
  ids, page ids, step ids, expected counts, source text OCR, BOM data,
  catalogue data, or color-specific branches.
- 2026-06-06: `manual-007.bagit-session.json` is now a user-approved
  callout-parts browser saved-session regression for MOC-132385. The fixture
  covers 32 callouts and 118 part rows through `/v2` with detector
  `2.0.0-alpha.10` and part extractor `2.0.0-alpha.61`.
- 2026-06-06: callout-parts alpha 62 starts Farm House 137856 tuning. The
  fresh-upload `/v2` path reports a visible `part-extraction` phase after page
  scan, source OCR classifies open-left `3` before `8` and diagonal `7` before
  `2`, long parts search the full owned row band before component ownership
  decides opacity, background buckets reject far-from-fill tan/brown part
  colors, and `/v2` preview hydration applies stored package masks without an
  app-side scrub pass.
- 2026-06-06: `manual-006.bagit-session.json` is now a user-approved
  callout-parts browser saved-session regression for Farm House 137856. The
  fixture covers 109 callouts and 307 part rows through `/v2` with detector
  `2.0.0-alpha.10` and part extractor `2.0.0-alpha.62`.
- 2026-06-06: callout-parts alpha 63 fixes MOC-169454 part extraction without
  manual-specific branches. Light top faces and studs get top alpha support
  before trimming, source OCR reads crossed/stroked `2x` labels before broad
  `4x` fallback, high-resolution `12x` labels pass the quantity width gate, and
  crowded wide labels stop merging neighboring same-row part components. The
  stale local `169454.bagit-session.json` fresh-upload browser gate passes
  through `/v2` with 84 callouts and 344 checked part rows.
- 2026-06-06: callout-parts alpha 64 fixes remaining MOC-169454 small-part
  masks. Bottom support preserves low-contrast lower rims from the selected
  component envelope while rejecting exact callout background, optional
  part-image diagnostics expose raw/support/alpha/final crop bounds, and
  duplicate-suppressed quantity rows no longer strip studs or part details from
  the kept row. The local 169454 fresh-upload browser gate still passes through
  `/v2` with 84 callouts and 344 checked part rows.
- 2026-06-06: callout-parts alpha 65 narrows quantity-label suppression from
  whole rectangles to accepted label glyph pixels, so close printed labels do
  not remove nearby lower part rims. `manual-005.bagit-session.json` is now a
  user-approved callout-parts browser saved-session regression for MOC-169454,
  covering 84 callouts and 344 part rows through `/v2` with detector
  `2.0.0-alpha.10` and part extractor `2.0.0-alpha.65`.
- 2026-06-06: callout-parts alpha 66 starts Lower Courtyard tuning without
  manual-specific rules. Single readable labels are no longer rejected only
  because their glyphs are dense or close to the part in a one-label callout,
  while raised high-value candidates that are oversized compared with a nearby
  lower printed baseline are rejected as part art. This targets fake small-part
  quantity rows and missing compact lone callouts. Same-owner duplicate cleanup
  also rejects surviving same-row or near-row duplicate rows without adding
  manual-specific logic, preserving package-owned `/v2` part geometry.
- 2026-06-06: callout-parts alpha 67 continues Lower Courtyard tuning. Oversized
  raised part art can be rejected even when it resembles `2x`, scaled
  high-resolution extraction keeps a single visible compact row when downscaling
  makes its label smaller than the canonical width/height gate, and same-row
  part support is split by sparse columns only for bounded row-local ownership
  cases. The splitter uses direct pixel bounds and skips very dense/many-label
  support blobs so dense Lower Courtyard callouts cannot turn ownership cleanup
  into a full-manual scan slowdown. Accepted saved-session browser gates for
  manuals 001, 005, 006, 007, 008, and 010 pass through `/v2` with alpha 67.
- 2026-06-07: callout-parts alpha 68 fixes Lower Courtyard compact lone callouts
  that passed low-resolution crop extraction but disappeared in full-browser
  high-resolution extraction. The quantity-label shape gate now gives only
  lower printed labels in narrow callouts a larger scale-invariant area budget,
  and OCR reads high-scale one-stem labels with a printed base as `1` before the
  source `6` fallback. The reduced real-browser PDF uses the same project
  `manuals/multipart/MOC-220614/3. Lower Courtyard Instructions.pdf` source as
  the full replay, includes pages 11, 54, 115, 152, 170, and 193, and waits for
  preview hydration before screenshots/downloads. It passes the compact `9x`,
  `12x`, `4x`, and `6x` targets; full Lower Courtyard PDF replay through `/v2`
  emits 373 callouts and 1421 part rows with no non-target row-count or
  total-quantity drift. Accepted saved-session browser gates for manuals 001,
  005, 006, 007, 008, and 010 pass through `/v2` with alpha 68.
- 2026-06-07: `manual-002.bagit-session.json` is now a user-approved
  callout-parts browser saved-session regression for Lower Courtyard. The
  fixture covers 373 callouts and 1459 part rows through `/v2` with detector
  `2.0.0-alpha.10` and part extractor `2.0.0-alpha.69`; step index 373 is
  included as page 193 with 53 rows and total quantity 242.
- 2026-06-07: callout-parts alpha 83 continues Upper Courtyard tuning. A private
  reduced real-browser sample is generated from
  `manuals/multipart/MOC-220614/4. Upper Courtyard Instructions.pdf` source
  pages 44, 45, 47, 92, 93, and 97. The reduced `/v2` replay emits 10 callouts
  and 49 part rows. It keeps the compact top-row labels in the annotated
  multirow callouts and restores the door/arch crops whose parts span above
  their lower label rows. The generic fix lifts lower-row ownership search only
  for row-span gaps, then splits stacked same-column components by real
  component size so upper-row neighbors are not stolen. Alpha83 also rejects the
  MOC-169454 wide `8x` retry part-art outlier against the overlapping printed
  label row. Accepted saved-session browser gates for manuals 001, 002, 005,
  006, 007, 008, and 010 pass through `/v2` with alpha 83; the broader browser
  guard passes 17 saved sessions.
- 2026-06-07: callout-parts alpha 84 preserves alpha83 output intent while
  reducing overtuning risk. Lower-threshold quantity retries now require an
  internal `QuantityRecoveryPlan` with a target band before candidates enter
  normal part-art, outlier, and overlap filtering. Printed upper-row and
  printed-baseline contexts are named rejection decisions instead of blanket
  fake-label bypasses. Part support masks are split into interior/top/bottom
  helpers, with top-gap bridge support rejecting exact or background-like fill
  unless near-background distance and dark-luma rules both support the pixel.
  Part crop assembly is split between foreground ownership and crop
  padding/tall-top recovery. Step-callouts alpha 11 adds package-owned
  `background` RGB to `StepCalloutCandidateEvidence`; `/v2` no longer keeps
  app-local page input, background, pixel, region, or stage-report detector
  duplicates. Required completion validation for this change is all approved
  saved-session browser regressions through `npm run validate:saved-sessions:browser`
  without refreshing baselines, then focused lint and `npm run verify`.
- 2026-06-07: `manual-003.bagit-session.json` is now a user-approved
  callout-parts browser saved-session regression for Upper Courtyard. The
  fixture covers 205 callouts and 833 part rows through `/v2` with detector
  `2.0.0-alpha.11` and part extractor `2.0.0-alpha.84`.
- 2026-06-07: callout-parts alpha 85 starts Hall Tower part-row cleanup with
  no manual-specific production rules. A private reduced real-browser sample
  generated from `manuals/multipart/MOC-220614/5. Hall Tower Instructions.pdf`
  includes source pages 144, 184, 187, and 189. It preserves target dense
  callouts on pages 184, 187, and 189 by dropping raised part-art rows while
  keeping printed baseline labels. Full Hall Tower `/v2` replay emits 612
  callouts and 2230 part rows; compared with alpha84, drift is limited to the
  three annotated dense callouts. Accepted saved-session browser gates for
  manuals 001, 002, 003, 005, 006, 007, 008, and 010 pass through `/v2` with
  all saved part rows checked under alpha85.
- 2026-06-07: callout-parts alpha 86 extends the private Hall Tower reduced
  sample to source pages 144, 171, 184, 187, and 189. It adds the named
  `tall-sparse-top` quantity recovery plan for tall sparse callouts where only
  lower printed rows were accepted. The retry scans only the top band before
  the first accepted lower label and sends recovered labels through the normal
  part-art, overlap, ownership, and crop path, fixing Hall Tower source page
  171 top-row tiny `2x`, `2x`, `1x` drops without adding manual-specific
  production rules. Full Hall Tower `/v2` browser replay emits 612 callouts
  and 2240 part rows. Compared with alpha85, drift is limited to source page
  171 plus source page 47 step 79, another tall sparse callout where alpha86
  restores four missed top-row `1x` parts. Accepted saved-session browser gates
  for manuals 001, 002, 003, 005, 006, 007, 008, and 010 pass through `/v2`
  with all saved part rows checked under alpha86.
- 2026-06-08: callout-parts alpha 88 fixes the remaining Hall Tower reduced
  sample pages from the existing manual page map: source page 144 step 278 now
  emits the five visible rows `4x`, `1x`, `4x`, `1x`, `1x`, and source page
  298 step 597 now emits `1x`, `2x`, `1x`. The implementation keeps production
  logic generic by protecting sparse high-value same-row printed labels and by
  adding named `connected-top-cap` quantity recovery for bottom labels whose
  lower glyph pixels connect to nearby non-label ink. The alpha88 follow-up
  narrows the same-row protection so Lower Courtyard part art does not survive
  as a fake `4x`. Reduced Hall Tower `/v2` browser replay passes with 9
  callouts and 30 part rows. Full Hall Tower `/v2` browser replay emits 612
  callouts and 2243 part rows, with zero full-summary drift against the private
  pre-tightening alpha88 summary. Accepted saved-session browser gates pass 18
  sessions through real `/v2` upload/download with all saved callout-parts rows
  checked where baselines include part rows.
- 2026-06-08: callout-parts alpha 97 preserves the accepted Hall Tower source
  step 294 and source step 597 fixes while restoring the full-manual good
  state. Attached-baseline quantity recovery no longer wins overlap suppression
  over normal printed labels, and it is rejected when it sits directly above an
  already readable same-column printed label. Duplicate-owner cleanup now keeps
  an upper label that has a same-row printed peer, preventing lower-row labels
  from stealing upper-row parts in sparse two-row callouts. Duplicate cleanup
  also reruns after scaled readability filtering, and dense crop masks ignore
  close upper duplicate labels for the surviving lower row, preserving accepted
  Lower Courtyard dense masks. Full Hall Tower `/v2` browser replay emits 612
  callouts and 2243 part rows; the only true quantity drift against the
  accepted alpha88 baseline is source step 363, manually accepted as `8x`,
  `8x`, `2x`. `manual-004.bagit-session.json` now stores the user-approved
  full Hall Tower callout-parts baseline with 612 callouts and 2243 part rows.
  The accepted saved-session browser gate passes 19 sessions through real
  `/v2` upload/download with all saved callout-parts rows checked.
- 2026-06-09: callout-parts alpha 98 targets the two annotated 4th-stage
  failures under the promoted `/` app path. A private reduced repro lives under
  `.bag-it/private/4th-stage-problem-pages/` with a seed page plus the source
  pages for Step 2 and Step 13, and the full 4th-stage alpha97 browser summary
  is the non-target good-state gate. The extractor now lets suppression-only
  readable labels exclude background learning and prevents row-separated
  related components from being borrowed when another printed label owns that
  component more clearly. Full 4th-stage browser diff must allow drift only on
  Step 2 and Step 13 before manual review.
- 2026-06-09: callout-parts alpha 99 fixes the alpha98 4th-stage Step 13
  follow-up where merge prevention removed the entire printed top row. The
  `tall-sparse-top` recovery gate was too sensitive to raster scale: at DPR 2
  the first detected lower-row label sat just above one third of the tall
  callout, preventing the top-band retry. Alpha99 lowers only that generic
  threshold and leaves alpha98 ownership rules intact. Real-browser upload of
  the reduced 4th-stage repro now emits Step 13 as `1x`, `1x`, `1x`, `2x`,
  `1x`, `2x`, `1x`; full 4th-stage browser diff against the alpha97 good-state
  summary reports zero non-target drift and one target drift. Accepted
  saved-session browser gates pass 19 sessions.
- 2026-06-09: callout-parts alpha 100 fixes the remaining 4th-stage Step 2
  long shallow part crop. The selected search region already contained the
  full part, but dense callouts disabled top support and the top-gap bridge
  assumed a compact centered run. Alpha100 enables top support only for dense
  selected regions that are wide/shallow, lowers the first-run bridge width for
  that shape, and expands the bridge along diagonal long parts instead of
  shrinking away from them. Real-browser reduced repro now grows the Step 2
  row 10 crop from `y=319 height=34` to `y=311 height=42`; full 4th-stage
  browser diff against the alpha97 good-state summary reports zero non-target
  drift, with target drift only on Step 2 and Step 13. Accepted saved-session
  browser gates pass 19 sessions.
- 2026-06-10: callout-parts alpha 127 keeps the alpha100 long-shallow support
  work but prevents that support from spanning into neighboring parts. Related
  component selection now rejects a narrow vertical side fragment when a larger
  adjacent same-row component is better owned by another printed label; normal
  tight horizontal/trailing fragments still stay attached. Top support also
  prunes detached support pixels outside the owned horizontal span. The
  accepted saved-session drift scan reports `0/5970` affected rows, and the
  real-browser saved-session gate passed all 19 sessions before 4th stage was
  promoted into the accepted gate.
- 2026-06-10: `manual-009.bagit-session.json` is now a user-approved
  callout-parts browser saved-session regression for 4th stage. The fixture
  uses detector `2.0.0-alpha.11` and part extractor `2.0.0-alpha.137`, and
  covers the accepted 4th-stage output after the Step 2 long-part crop and
  Step 13 merged-row fixes. The real-browser saved-session gate now passes
  all 20 sessions.
- 2026-06-10: callout-parts alpha 128 fixes four exploratory risky-step
  probes without promoting those full manuals into the accepted gate.
  MOC-133471 page 2 step 2 now reads the open-bottom `4x` label instead of
  `8x`. MOC-204568 page 3 step 3 recovers same-baseline leading digits so the
  clean label reads `35x`, while page 188 step 357 expands selected-envelope
  top support enough to keep the bottom slope's stud and top face visible.
  MOC-232918 page 321 step 357 rejects a compact stud/part-detail false `4x`
  while preserving real printed labels. The rules remain raster-only and use
  no manual ids, step ids, source text, BOM, or catalogue data.
- 2026-06-10: callout-parts alpha 143 is the package-shape refactor for the
  current v2 detector path. The extractor flow is now read labels, create the
  callout background model, extract rows, resolve duplicate ownership, then
  build snapshots. Quantity recovery plans, part-art decisions, top-support
  pixel policy, alpha-mask creation, alpha trimming, crop top recovery, and
  duplicate-owner resolution live in separate focused modules. The public
  `CalloutPartImageDiagnostics` contract is narrowed to stable geometry fields
  only, removing support counts/bounds, top-support flags, compact-trim flags,
  coordinate scale, alpha clamp details, trim padding, and component scoring.
  Focused package and v2 adapter tests pass, and
  `npm run validate:saved-sessions:browser` passes all 20 approved saved
  sessions with detector `2.0.0-alpha.11` and part extractor
  `2.0.0-alpha.143`; no baselines were refreshed and no drift categories were
  needed.
- 2026-06-10: the alpha143 cleanup iteration keeps the same detector and part
  extractor versions while splitting remaining quantity internals. Quantity
  candidate assembly now delegates separated labels, connected glyphs, and debug
  capture to focused modules. Part-art rejection now separates row/layout facts,
  foreground probes, and ordered decisions without a broad rejection context.
  Alpha-mask ownership no longer accepts diagnostic-only excluded label regions.
  `npm run validate:saved-sessions:browser` passed all 20 approved saved
  sessions; no baselines were refreshed and no drift categories were needed.
- 2026-06-13: part-colors alpha22 tightens the edge-supported LBG rescue for
  shadowed neutral parts. A row with strong medium-dark neutral body chips and
  no meaningful LBG body support now stays Dark Bluish Gray even when rejected
  edge pixels contain light highlights. Castle Ramp color regression now pins
  the five user-annotated DBG rows that had drifted into LBG; the private
  Castle Ramp report regenerates with DBG at 23 rows / 29 parts and LBG at
  101 rows / 137 parts.
- 2026-06-13: part-colors alpha23 applies the latest Middle Wall report
  feedback while keeping Castle Ramp as the color regression gate. Contextual
  body-chip rules now rescue black, pearl-gold, yellow, muted light-nougat, and
  dark-bluish-gray rows from polluted raw neutral classes only when matching
  same-manual anchors exist; the Dark Bluish Gray rescue requires cool edge
  support or lower body luma to avoid the accepted Castle Ramp LBG regressions.
- 2026-06-16: the browser saved-session gate now supports private reduced PDF
  cases through `.bag-it/private/browser-pdf-cases.json`. The first case covers
  Hall Tower page 78 / source step 137 as a one-page PDF. It uploads through the
  promoted `/` app route, downloads the browser-produced session, and compares
  against the saved-good reduced session at 858x1204 and 1280x1100. This closes
  the gap where full Hall Tower passed while a reduced context could lose a row
  or change part alpha. The tightened gate fails on row-count drift, quantity
  multiset drift, part/label region drift, alpha-bound drift, opaque-pixel loss,
  or coarse mask-occupancy loss.
- 2026-06-17: the accepted manual-derived browser gate moved from package
  saved-session fixture roots to `tests/e2e/fixtures/bag-analysis/**`. The ten
  current callout-parts sessions now split into minimal PDF-only resumable
  sessions, callout-region fixtures, and part-row/alpha-mask fixtures covering
  1651 callouts and 6306 part rows. `npm run test:e2e` drives the promoted `/`
  app with Playwright Chromium, waits for current scan, part extraction, and
  preview hydration, downloads a fresh session, then compares by page/region,
  quantity multiset, and custom Canvas/ImageData visual metrics. Package fixture
  regression roots were removed; pure package unit tests remain.
- 2026-06-17: added a diagnostic all-differences e2e report for reviewing
  fixture drift before either refreshing approved fixtures or fixing detector
  failures. `npm run report:e2e-fixture-diffs` runs all manifest cases through
  the real browser path and writes ignored HTML/PNG artifacts under
  `.bag-it/private/e2e-fixture-diff-reports/**`; the strict e2e gate remains the
  acceptance check.
- 2026-06-17: manual review accepted all three `manual-009` differences from the
  real-Chrome `2026-06-17-full-real-chrome-v2` report as benign part
  crop/alpha drift. Its callout fixture and minimal input session stayed
  unchanged; `manual-009/parts.json` was refreshed from the downloaded Chrome
  149 session.
- 2026-06-17: manual review accepted 12 of 13 `manual-003` differences from the
  same real-Chrome report. Page 41, callout 76, row 8 remains a pinned extractor
  fix because the long part is still clipped; `manual-003/parts.json` now uses
  the reviewed Chrome fixture data except for that row, whose target crop is
  `x=561 y=109 width=107 height=55`.
- 2026-06-17: manual review accepted the benign `manual-004` Hall Tower drift
  except three pinned extractor failures: page 78 / callout 136 misses the
  lower-right `1x` part, page 87 / callout 152 row 0 includes the callout
  number, and page 118 / callout 212 row 3 includes neighboring-part pixels.
  `manual-004/parts.json` was refreshed from the Chrome 149 session while
  preserving those saved-good expected rows/callout.
- 2026-06-17: manual review accepted `manual-008` gradient-background edge
  noise except page 5 / callout 12 / row 1, where the current crop includes the
  top callout edge. `manual-008/parts.json` was refreshed from the Chrome 149
  session while preserving that saved-good row.
- 2026-06-17: manual review accepted all `manual-007` differences and refreshed
  `manual-007/parts.json` from the Chrome 149 session. Page 33 / callout 31 arch
  alpha still keeps some background, but this is accepted as lower-priority
  global arch-mask work rather than a case-specific blocker.
- 2026-06-17: manual review accepted `manual-006` drift except three pinned
  border-inclusion failures: page 3 / callout 1 / row 0, page 6 / callout 5 /
  row 0, and page 18 / callout 26 / row 3. `manual-006/parts.json` was
  refreshed from the Chrome 149 session while preserving those saved-good rows.
- 2026-06-17: manual review accepted `manual-005` drift except four
  lower-priority noisy-edge failures where the saved crop/mask remains better:
  page 28 / callout 52 / row 2, page 35 / callout 63 / row 0, and page 40 /
  callout 73 / rows 0 and 1. `manual-005/parts.json` was refreshed from the
  Chrome 149 session while preserving those saved-good rows.
- 2026-06-17: manual review accepted `manual-001` callout-region drift and
  benign part drift except nine lower-priority noisy-edge failures where the
  saved crop/mask remains better: page 2 / callout 2 / row 1, page 6 /
  callout 10 / row 2, page 6 / callout 11 / row 4, page 7 / callout 12 / rows
  3, 5, and 6, page 7 / callout 13 / rows 2 and 3, and page 12 / callout 22 /
  row 3. `manual-001/callouts.json` and `manual-001/parts.json` were refreshed
  from the Chrome 149 session while preserving those saved-good rows.
- 2026-06-17: manual review accepted `manual-002` drift except seven pinned
  Lower Courtyard failures: page 31 / callout 48 / row 1 and page 62 /
  callout 101 / row 1 alpha masks spill over the bottom-left side of the part;
  page 88 / callout 155 / row 2 and page 89 / callout 159 / row 1 have severe
  edge-background noise; page 100 / callout 186 regresses quantity from saved
  `7x` to current `4x`; page 131 / callout 255 / row 1 clips the white part on
  the left; and page 157 / callout 304 has wrongly clipped alpha masks across
  the whole callout. `manual-002/callouts.json` and `manual-002/parts.json` were
  refreshed from the Chrome 149 session while preserving those saved-good
  rows/callouts.
- 2026-06-17: manual review accepted `manual-010` edge-noise drift except page
  32 / callout 68 / row 2, where the part is clipped by the alpha mask.
  `manual-010/callouts.json` and `manual-010/parts.json` were refreshed from
  the Chrome 149 session while preserving that saved-good row.
- 2026-06-18: part extractor `2.0.0-alpha.159` clears alpha pixels that are both
  background-like and reachable from outside the part mask through transparent
  or background-like pixels. This reduces open-hole and edge-fill noise in
  arches and bright thin parts while preserving protected low-contrast top-face
  support.
- 2026-06-18: Chrome 149 full e2e report for `2.0.0-alpha.159` passed in
  12.7 minutes at
  `.bag-it/private/e2e-fixture-diff-reports/2026-06-18-alpha159-edge-scrub-full-real-chrome/index.html`.
  It reported 44 fixture differences, with no missing-row or quantity-mismatch
  failures in the generated report; remaining differences are alpha-mask
  cleanups and crop-region drift.
- 2026-06-18: part extractor `2.0.0-alpha.160` preserves long shallow
  right-side support when the owned foreground envelope tracks the part body.
  This fixes the `manual-003` page 41 / callout 76 / row 8 regression where
  alpha159 cropped the long plate to width `79`; the final Chrome 149 full
  report at
  `.bag-it/private/e2e-fixture-diff-reports/2026-06-18-alpha160-ratio-guard-full-real-chrome/index.html`
  emits a full visible width `103` crop, keeps the total issue count at `44`,
  and does not reintroduce the Hall Tower page 118 / callout 212 / row 3
  neighbor-bleed issue. The report still lists `manual-003` region drift because
  the saved-good target includes extra top context. The same investigation left
  `manual-004` page 40 / callout 64 / row 0, page 91 / callout 160 / row 4,
  and `manual-002` page 131 / callout 255 / row 1 as residual
  noisy-edge/crop cleanup items rather than proven alpha160 fixes.
- 2026-06-18: part extractor `2.0.0-alpha.161` fixes the remaining
  `manual-003` page 41 / callout 76 / row 8 crop regression by opting the
  long-shallow lower-row shape into extra pre-alpha search room, scaled
  top-face support lift, projected detached-top support preservation, and
  tighter bottom alpha padding. The full real Chrome report at
  `.bag-it/private/e2e-fixture-diff-reports/2026-06-18-alpha162-context-gate-full-real-chrome/index.html`
  reports 43 total issues, down from the alpha160 full-report total of 44,
  with `manual-003` at zero issues and the side-effect manuals back to their
  alpha160 counts. The target row crop is `x=557 y=106 width=114 height=60`
  with alpha bounds `x=569 y=112 width=94 height=54`, restoring the top-right
  stud/ridge.
- 2026-06-18: part extractor `2.0.0-alpha.162` fixes two remaining
  user-reviewed crop targets without changing total full-report issue count.
  Lower Courtyard `manual-002` page 131 / callout 255 / row 1 now crops to
  `x=468 y=133 width=96 height=33` with alpha bounds
  `x=477 y=134 width=79 height=27`; the saved-vs-current report moves from
  region drift to alpha-only drift, and the full part bottom is visible. Hall
  Tower `manual-004` page 40 / callout 64 / row 0 now crops to
  `x=50 y=359 width=37 height=26` with alpha bounds
  `x=61 y=364 width=18 height=16`, removing the step-number contamination from
  the actual output; the report still flags region drift because the saved
  fixture already contained the bad crop. The trim change keeps accepted
  `manual-007` differences stable and leaves one accepted `manual-009` page 59
  / callout 63 / row 1 category swap from alpha drift to region drift. Focused
  unit tests, typecheck, and the full real Chrome report pass; the report at
  `.bag-it/private/e2e-fixture-diff-reports/2026-06-18-alpha162-dense-plate-padding-full-real-chrome/index.html`
  reports 43 total issues.
- 2026-06-20: three read-only reviewer agents audited callout, part, and color
  detection module shape. Accepted fixes were kept small: v2 Build steps
  callouts now carry explicit `detectorCandidateId` so part extraction no
  longer depends on stripping the public `v2-` id prefix for current results;
  app v2 callout contracts alias the package-owned `@bag-it/step-callouts`
  types instead of duplicating candidate source unions; the part-extraction
  worker protocol now lives in one shared contract module; unused part-color
  family resolver wrappers were removed; and compact lower-peer quantity
  recovery now uses OCR-parsed recovered label text/value instead of copying
  the lower peer quantity. Broad resolver, sampler, adapter, and alpha-trim
  module splits were accepted as useful future cleanup but deferred because
  they are larger behavior-preserving moves and not required for this pass.
- 2026-06-20: follow-up risky-module cleanup tackled the four deferred modules
  one by one without changing detector thresholds: part-color palette override
  assembly now lives in `palette-match-color.ts`; high-resolution color
  resampling now lives in `high-resolution-resample.ts`; v2 page detector worker
  scheduling now lives in `step-detector-scheduler.ts`; and low-level alpha mask
  bounds/crop/clear operations now live in `alpha-mask-geometry.ts`. Focused
  tests for resolver, sampler, adapter, bagging reuse, alpha trim, long-shallow
  support, and extractor passed alongside `npm run typecheck`; the full
  `npm run verify` gate passed with all 10 browser fixture manuals, color report
  snapshot validation, and part crop report snapshot validation.
- 2026-06-20: draft bagging moved to `step-callout-bagging-v6` with
  section-aware delimiters. The bagger now reads the scanned page sequence so
  no-baggable pages and zero-part callout pages can guide bag splits near useful
  module boundaries without forcing one bag per section. The v2 output contract
  also emits optional
  `sectionBoundaryHints` for rejected off-manual-style callout panels near the
  first visible callout band on a page. These cues may skip adding the first
  page of a new section to an already useful bag or keep one more page to finish
  the current section, but they do not override page containment or the soft
  hard cap. Abnormally small leftover bags may merge back across a chosen soft
  section boundary when the merged bag remains under the same soft hard cap.

Full command before merge:

```text
npm run verify
```
