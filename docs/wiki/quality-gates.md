# Fresh MVP Quality Gates

The fresh rebuild removes BOM/Rebrickable reconciliation from the core path, so
step-callout detection needs its own measurable gates. These gates prevent draft
bags from looking useful while silently omitting too much of the manual.

## Fixture Policy

Shared fixtures must be one of:

- synthetic
- public and licensed for this use
- explicitly approved for storage

Private manuals, page renders, callout crops, part crops, and row-level private
debug output must not be committed unless the user explicitly approves that
manual-derived fixture for storage. Private local manuals may be used only for
developer-side tuning under ignored paths.

Approved manual-derived correctness fixtures live under
`tests/e2e/fixtures/bag-analysis/**`, not package test fixture roots. Each case
declares `sourceKind: "user-approved-manual"` and `approvalStatus: "approved"`
in `manifest.json`, and stores three split artifacts: a minimal resumable
session containing only PDF bytes/metadata, `callouts.json` containing page/order
and full callout crop regions, and `parts.json` containing quantities, resolved
part colors, part regions, quantity-label regions, and compact alpha masks.
The minimal `input.bagit-session.json` files are the only committed session-file
exception and must remain explicitly unignored, present, and referenced by an
approved manifest case.

## Minimum Fixture Set

Before the detector drives Bags in the fresh app, create at least:

- one small synthetic/public manual with bordered callouts using varied
  backgrounds
- one multi-page manual with multiple callouts per page
- one manual with at least one repeated-step case requiring a multiplier
- one noisy page fixture with likely false positives outside callouts
- unit image/canvas fixtures for quantity-label and part-crop edge cases

## Detector Readiness Gate

Against the shared fixture set:

- scanned page coverage: 100% of expected step pages are represented in Build
  steps
- callout recall: at least 95% of expected baggable callouts are detected
- false-positive baggable callouts: no more than 2% of detected baggable
  callouts are non-callout manual regions
- zero-part candidates: may be shown in Build steps diagnostics, but must not
  enter Bags
- source reference accuracy: at least 95% of detected callouts point to the
  correct page and callout region

Architecture rule:

- new v2 detector modules stay single-concern and pass scoped SonarJS ESLint
  rules under `src/features/steps/v2/**`
- SonarJS complexity failures are fixed by simplifying flow or extracting a
  real concept, not by adding inline disables
- frozen legacy detector files do not grow; they may only shrink, be archived,
  or have behavior moved into focused modules
- non-v2 code is not part of the SonarJS rollout yet

For private, user-annotated tuning sessions, the browser-rendered Build steps
output is the only acceptance gate. Validate by uploading the actual manual
through `/` in a real Chrome-family browser session and inspecting the mounted
app DOM plus screenshots. Expected page counts, row quantities, part counts, and
annotated crop bounds must match before detector work is called complete.
Playwright's bundled Chromium is not an accepted detector gate because it may
rasterize PDF/canvas content differently from current Chrome/Brave releases.

For production part extraction tuning, validate the mounted app after a real
browser resume/upload to `/`, including row quantity text, hydrated quantity
previews, and hydrated part previews generated from stored `partImage.region`
plus `partImage.alphaMask`. The committed correctness gate is the manifest-driven
Playwright bag-analysis fixture gate. It resumes the minimal session, forces
fresh scan and part extraction from embedded manual bytes, waits for preview
hydration, downloads a fresh session, and compares that session against the
split expected JSON fixtures. Local renderers, package manual replay runners,
Playwright snapshot baselines, and PPM-based regression scripts are not accepted
validation paths.

Current bag-analysis e2e comparison rules:

- callout count must match exactly
- callouts match by page plus best region/visual match, never generated ids
- actual and expected callout bounds must contain each other within `2px` per
  edge
- callout visual comparison fails missing ink, changed full-callout content, or
  extra neighboring content outside the expected region expanded by `2px`
- part row count per matched callout must match exactly
- quantity text/value multisets must match exactly
- part rows match by quantity plus best masked visual match
- each matched part row must preserve the exported `detectedColor` compact
  contract: name, family, status, swatch, manual class id/trust flag, and raw
  manual class id; swatch-only drift is tolerated only when every semantic
  color field still matches and each RGB channel differs by at most `1`
- part crop drift fails when it exceeds `4px` per edge unless the expected and
  actual serialized alpha masks still pass the shared alpha-mask comparator;
  that comparator requires at least `0.95` expected opaque coverage and at
  most `0.025` actual extra opaque ratio in both Node report checks and the
  browser fixture gate
- failures attach expected, actual, and diff PNGs to Playwright output

Approved manual-derived fixture content is frozen until the user explicitly
approves a refresh. Agents must not rebaseline, regenerate, rewrite, stage, or
commit `tests/e2e/fixtures/bag-analysis/**` fixture content as part of detector,
extractor, UI, or validation work without first showing the proposed differences
and receiving explicit user approval for that fixture update.

When the gate exposes broad drift, run `npm run report:e2e-fixture-diffs` to
produce a review-only HTML report under
`.bag-it/private/e2e-fixture-diff-reports/**`. The report must include every
detected difference with manual source, page, callout/row location, failure
reason, browser project/version/user-agent, full-callout preview, and
saved/current/diff visual evidence when a region or mask comparison is
available. Use that report to decide which
differences are acceptable fixture updates and which are detector or extractor
bugs; the report itself is not an acceptance gate.

Performance gates:

- Middle Wall is the preview usability gate. Its approved e2e fixture is
  `manual-010`. The median of three real-browser uploads must keep counts
  unchanged, make pages 1-6 usable within 2 seconds after Build steps appears,
  expose page preview natural width of at least `1200px`, make page 20 usable
  within 2 seconds after scrolling to it, and keep a tab switch during
  background preview generation under 200ms.
- Hall Tower is the large-manual gate. Its approved baseline expects 612
  callouts and 2243 part rows unless the committed manifest states otherwise.
  The median of three real-browser uploads must improve total scan, part
  extraction, and blocking preview time by at least 20% against the
  pre-refactor baseline captured on the same machine/browser path. Because Hall
  is a large manual, Build steps becomes usable after parts are ready while
  preview pages 1-6 hydrate through the critical queue within 3 seconds and the
  remaining page assets continue in the background through bounded page jobs
  without blocking scrolling or tab changes.
- Castle Ramp is the small-manual runtime guard. Its approved baseline remains
  the correctness source, and the median of three real-browser uploads must not
  regress total pipeline time by more than 10% against the pre-refactor baseline
  captured on the same machine/browser path.

Run correctness with `npm run test:e2e` for all cases, or build once and run
`npm run validate:e2e-fixtures -- --grep manual-004` for a focused case.
Dedicated repeat/timing thresholds are measured from Playwright output and
downloaded session timing summaries until a separate timing-only gate is added.

Same-part rule promotion gate:

The old global "zero false positives" requirement is now scoped to silent auto
grouping only. MVP can also expose a reviewed suggestion lane when its measured
user correction burden is tiny and the UI makes lower confidence explicit.

- same-part promotion has two confidence lanes:
  - auto-safe lane: app may group rows without extra user review only when the
    scorer has `0` known false groups, crop drift, and hard-negative
    false-positive pairs on active labeled manuals and holdout/manual review
  - suggested lane: app may show below-threshold same-part suggestions only
    when measured correction burden is below `0.5%` of suggested groups or pair
    suggestions, the UI marks them as lower-confidence suggestions, and the UI
    gives a fast one-click way to split or reject the suggestion
- a candidate with auto-safe false positives is not promotable to silent
  grouping even if the suggested lane looks useful
- a candidate whose suggested lane exceeds the `0.5%` correction budget remains
  private tooling only
- suggested-lane groups must not look packed or confirmed by default; confidence
  copy and row styling must communicate "needs quick review" before the user
  treats the group as bag truth
- private evidence-rule mining must reject single-manual rules when
  cross-manual support is explicitly required for that training pass
- 2026-06-24 support-gated chamfer probe recovered core four-manual labels from
  `193/546` to `229/546` with zero false groups and zero hard-negative false
  positives, but failed Hall Tower holdout with `7` false groups and `7`
  hard-negative false positives; that candidate is rejected and not promotable
- 2026-06-24 singleton follow-up found only one globally safe supplemental rule
  from that chamfer probe; this improved the private deterministic scorer from
  `555/1320` to `558/1320` matched pairs with `0` false groups and `0`
  hard-negative false-positive pairs across current active labels, while all
  larger subsets regressed `05-farmhouse`, `06-4th-stage`, `07-fountain`,
  `08-upper-courtyard`, or `10-wolf-pack-renegade`. Later app review still
  rolled deterministic near matching out of MVP app output.
- `lab:part-match-embeddings` is private Day-1 image-embedding cache tooling.
  It reads one or more part-match `report.json` files and writes row metadata,
  four crop variants, unit-normalized frozen-model vectors, a summary, and an
  inspection page under
  `.bag-it/private/part-match-reports/embedding-experiments/**`. It does not
  train a matcher and does not change app grouping.
- 2026-06-25 embedding-cache smoke: `lab:part-match-embeddings` with
  `Xenova/clip-vit-base-patch32` on `07-fountain` generated 118 row caches,
  four variants per row, and 472 normalized 512-dimensional vectors under
  `.bag-it/private/part-match-reports/embedding-experiments/07-fountain-smoke/`.
  A repeat run reused all 472 vectors. This completes extraction/cache
  validation only; no pair scorer or app-visible matching is promoted.
- `lab:part-match-embedding-score` is private Day-2 embedding pair-scoring
  tooling. It reads existing embedding cache directories, builds same-bag and
  different-callout label/decision pairs, chooses a zero-training-false-positive
  threshold, and writes pair diagnostics plus leave-one-manual-out holdout
  results under `.bag-it/private/part-match-reports/embedding-experiments/**`.
  It does not write app or package scorer config.
- 2026-06-25 embedding score smoke: full active-label cache with
  `Xenova/clip-vit-base-patch32` generated 25,224 vectors. With current labels
  plus latest consolidated reviewed decisions and package color compatibility
  gating, the scorer evaluated 1,320 positive pairs, skipped one conflicting
  stale decision target, and produced `145/1320` positives with `0` false
  positives and `0` hard-negative false positives under the training threshold.
  Leave-one-manual-out still produced `1` false positive, blocking app/package
  promotion.
- 2026-06-25 embedding score sweep: `mean`, `rendered-tight-min`, `rendered`,
  `tight-rendered`, `neutral-mask`, `all-variants-min`, `min`, `max`, and
  `silhouette` all kept `0` training false positives but still produced at
  least `1` leave-one-manual-out false positive. Best recall among the
  one-false-positive modes was `mean` at `145/1320` training positives and
  `146/1320` holdout positives. Current frozen CLIP cache plus simple score
  selectors is not promotable.
- 2026-06-26 two-lane supervised CNN score: full MostWiedzy MobileNetV3 Large
  plus a trained pair head reached `0` auto-lane validation false positives on
  the external validation split. Its suggested lane accepted `7095/9439`
  positive validation pairs with `24/6508` false suggestions, a `0.369%`
  pair-level correction burden. This passes the external-dataset two-lane smoke
  gate but does not yet promote app matching; it must still pass local manual
  labels, excluded singleton rows, reviewed hard negatives, and real checklist
  UI review.
- 2026-06-26 local manual-crop gate: the external MostWiedzy pair-head
  checkpoint was scored against all active labeled manual crops and reviewed
  hard negatives. External thresholds did not transfer: validation over all
  local pairs produced `3192` auto-lane false positives and a `99.6%`
  suggested correction rate. Recalibrating thresholds on nine local manuals
  and holding out `01-castle-ramp` restored safety (`0` validation false
  positives) but accepted only `5/84` holdout positive pairs. Training a fresh
  pair head on the nine local manuals kept the same ramp holdout score
  (`5/84`, `0` false positives) and produced no valid suggested lane under the
  `0.5%` selector budget. Current CNN pair-head path remains private and is not
  useful enough for MVP grouping.
- 2026-06-26 pair-lane analysis: `lab:part-match-pair-lanes` now evaluates
  scored pair outputs as auto-safe and review-suggested lanes. It now reports
  both pair-level false positives and group-level correction burden; lane
  selection uses group-level correction because that is the user-visible cost.
  On `gpu-manual-pair-head-holdout-ramp-v1`, plain score thresholding kept
  train and ramp holdout false groups at `0` but matched only `5/84` ramp
  positive pairs. Mutual-top-1 plus a `0.005` score-margin lane kept train and
  holdout false groups at `0` and improved ramp holdout to `13/84`, but the
  suggested lane still could not spend the `0.5%` correction budget for useful
  recall. Lowering the plain score floor enough to recover meaningful ramp
  recall caused training group correction to exceed the gate (`0.974` floor:
  `1/104` false groups, `0.96%`; `0.965` floor: `9/210`, `4.29%`). This
  confirms the current pair-head output is safe only at too-low recall;
  promotion remains blocked.
- 2026-06-26 runtime group replay: `lab:part-match-runtime-group-score` now
  evaluates exported package scorer configs through actual
  `createPartMatchGroups`, using session-backed detector features rather than
  cached crop PNG alpha. Pair-lane metrics were optimistic because they score
  accepted pair unions, while package grouping selects cliques. The current
  package-compatible auto config matched `134/1322` expected active pairs with
  `0` active false groups and `0/201` wrong active grouped rows. The current
  package-compatible suggested config matched `374/1322` expected active pairs
  with `2` active false groups and `2/525` wrong active grouped rows
  (`0.381%` row correction burden). This suggested lane is below the relaxed
  `0.5%` row budget and is promotable only as review-suggested output with fast
  split/reject UI; it is not silent auto grouping.
- 2026-06-27 connected package scorer check: after connected-component
  suggested grouping plus focused vetoes, the current package-compatible
  suggested scorer recovers `1112/1322` expected active pairs with `4` false
  groups and `4/1117` wrong grouped rows (`0.358%` row correction burden).
  This is the best app/package-compatible lane so far, but it is still only
  `84.1%` real-pair coverage.
- 2026-06-27 hard-negative CNN replay: replaying previous high-scoring
  negative manual-crop pairs during GPU pair-head training produced a lab-only
  raw CNN score with enough pair signal to exceed the aspirational target:
  score-threshold suggestion analysis recovered `1336/1344` real pairs
  (`99.4%`) with `5/1330` false accepted pair edges (`0.376%`) and `4/1373`
  wrong grouped rows (`0.291%`). The same run's stricter auto lane recovered
  `1190/1344` with `0` false pairs and `0/1168` wrong grouped rows.
  `featureFusionProduct` also crossed `95%` (`1286/1344`) with `4/1271`
  false accepted pair edges. This is not app-promotable yet because the package
  cannot consume the raw PyTorch CNN score, and group-level false diagnostics
  remain above `0.5%`. The promotion blocker moved from "no model signal" to
  "runtime integration or distillation without losing safety."
- 2026-06-27 reviewed-pair truth reconciliation: `lab:part-match-runtime-group-score`
  now accepts `--truth-source pair-targets` so focused reviewed same/different
  decisions can be measured directly instead of only through legacy
  `expectedPartKey` labels. The current promoted package decision tree scores
  `1158/1347` reviewed positive pair targets with `2/1163` wrong grouped rows.
  A user review then confirmed the `7` closure false-pair diagnostics were all
  actually same-part pairs. With those corrections applied, replaying the v4
  hard-negative CNN score as a cached package pair feature at threshold
  `0.9961420893669128` recovers `1306/1354` reviewed positive pair targets
  (`96.5%`) through connected package grouping with `0` accepted negative pair
  targets, `0` false groups, `0` false-pair diagnostics, and `0/1304` wrong
  grouped rows. This reaches the lab row-burden and direct-negative
  interpretations of the `95%` coverage / `0.5%` correction target, but it is
  not app-promoted until the package has a runtime path for the CNN score or an
  equivalent distilled scorer.
- 2026-06-26 pair-head balancing probes: `train-part-match-lego-cnn.py` gained
  `--pair-head-max-train-pairs` so the pair head can train on a balanced
  positive/negative subset while scoring all pairs. Balanced pair-head training
  on the same ramp holdout reached only `7/84` under the best zero-false-group
  mutual-top-1 lane. Balanced metric fine-tuning of the CNN feature extractor
  before pair-head training degraded further to `4/84`. Both probes are
  rejected; training-set imbalance is not the main blocker.
- 2026-06-26 Hall Tower holdout check: a second local manual holdout was
  generated with `09-hall-tower` as validation (`233` positive validation
  pairs, `15956` negative validation pairs). The same local pair-head setup
  kept score-threshold auto grouping safe but matched only `6/233` positives.
  The train-selected mutual-top-1 lane improved holdout recall to `31/233` but
  produced `2/33` false holdout groups, far above the `0.5%` correction
  budget. A balanced pair-head variant was worse: `3/233` score-threshold
  positives, and `13/233` mutual-top-1 positives with `1/14` false holdout
  groups. This confirms the current pair-head family does not generalize well
  enough for MVP grouping.
- 2026-06-26 checkpoint-continuation fix: `train-part-match-lego-cnn.py` now
  initializes the local pair head from checkpoint state when available before
  continuing pair-head training. The corrected continuation improved the Hall
  Tower score-threshold holdout from `6/233` to `11/233` positives with `0`
  false groups, but the mutual-top-1 lane still failed the correction budget
  with `2/25` false holdout groups. Ramp continuation regressed from `13/84`
  to `6/84` under the best zero-false-group mutual-top-1 lane. The bug fix is
  retained, but the current pair-head path remains private and not promotable.
- 2026-06-26 CNN plus structural-gate diagnostic: `lab:part-match-hybrid-score`
  combines CNN pair-head scores with deterministic structural same-part
  features, scoring structure only for high-CNN candidates. On Ramp,
  `cnnIfStructuralMatch` improved raw CNN mutual-top-1 from `13/84` to an
  auto lane of `17/84` and a suggested lane of `22/84`, with `0` known false
  groups. On Hall Tower, the same mode removed raw CNN mutual-top-1 false
  groups (`31/233`, `2/33` false groups) and reached an auto lane of `36/233`
  plus suggested lane of `39/233`, both with `0` known false groups. This is
  the best current local-manual safety result, but recall remains too low for
  MVP promotion.
- 2026-06-26 lane analyzer group-closure fix: `lab:part-match-pair-lanes` now
  scores recovered positives by accepted group connectivity, not only direct
  accepted pair edges. It also evaluates mutual top-2/top-3 strategies for
  repeated same-part families. With the same `cnnIfStructuralMatch` score, the
  best safe suggested lane is now Ramp `23/84` and Hall Tower `45/233`, both
  with `0` known false groups. This is a more accurate UI-grouping metric but
  still below the recall needed for MVP.
- 2026-06-26 feature-fusion score: `lab:part-match-feature-fusion-score` trains
  a local logistic fusion over CNN pair-head scores plus deterministic
  structural pair features, then combines it with the structural-gated CNN
  score as `featureFusionProduct`. With group-closure lane scoring, Ramp
  reaches a best safe suggested lane of `39/84` and Hall Tower reaches
  `68/233`, both with `0` known false groups. This is the best current local
  manual result and a meaningful lift, but recall is still not proven MVP-ready
  across enough holdout manuals.
- 2026-06-26 row-membership suggestion budget: the suggestion gate now uses
  user-visible row correction burden
  (`wrong suggested row memberships / suggested grouped row memberships`) as
  the primary `0.5%` budget. Group-level and pair-level correction remain
  diagnostics. With this gate, the same feature-fusion scorer can spend a tiny
  training correction budget (`3/713` Ramp training grouped rows and `3/710`
  Hall Tower training grouped rows) while keeping current held-out validation
  wrong rows at `0`. Best current validation lanes are Ramp `46/84` positives
  with `0/45` wrong grouped rows, and Hall Tower `70/233` positives with
  `0/98` wrong grouped rows. This is stronger than the previous all-zero
  suggested gate but still needs broader heldout manual coverage before app
  promotion.
- 2026-06-26 Upper Courtyard holdout check: a third local holdout was generated
  with `08-upper-courtyard` as validation (`230` positive validation pairs).
  The best clean lane is not the reviewed-suggestion lane; it is the auto-safe
  `featureFusion`/score-threshold lane with `75/230` positive pairs and
  `0/79` wrong grouped rows. The reviewed-suggestion budget overfits on this
  holdout: the `0.5%` train-selected suggestion lane reaches `97/230` to
  `103/230` positives depending on score setup, but introduces `2` to `4`
  wrong grouped rows on validation. Verdict: auto-safe feature fusion has now
  passed three labeled manual holdouts with useful but incomplete recall;
  reviewed suggestions remain private until the lane selector generalizes
  without validation row errors.
- 2026-06-26 Middle Wall holdout check: a fourth local holdout was generated
  with `02-middle-wall` as validation (`198` positive validation pairs). This
  manual supports the reviewed-suggestion lane: best clean suggestion is
  `featureFusionProduct` score-threshold with `93/198` positive pairs and
  `0/72` wrong grouped rows; best clean auto is `featureFusion` score-threshold
  with `55/198` positive pairs and `0/46` wrong grouped rows. This keeps the
  auto-safe lane clean on four checked manuals and shows reviewed suggestions
  can be useful, but Upper Courtyard still blocks suggestion promotion.
- 2026-06-26 Lower Courtyard holdout check: a fifth local holdout was generated
  with `03-lower-courtyard` as validation (`155` positive validation pairs).
  The reviewed-suggestion lane is clean here: `featureFusionProduct`
  score-threshold reaches `64/155` positive pairs with `0/74` wrong grouped
  rows. The auto-safe lane is weaker; its best clean result is mutual-top-1 at
  `26/155` positive pairs with `0/52` wrong grouped rows. This adds another
  clean suggestion holdout, but suggestion promotion remains blocked by Upper
  Courtyard.
- 2026-06-26 Bakery holdout check: a sixth local holdout was generated with
  `04-bakery` as validation (`119` positive validation pairs). This is a weak
  holdout for recall, not safety. Best clean reviewed-suggestion result is
  `featureFusionProduct` score-threshold at `41/119` positive pairs with
  `0/53` wrong grouped rows. Best clean auto-safe result is mutual-top-1 at
  `21/119` positive pairs with `0/42` wrong grouped rows. No swept score mode
  recovered materially more recall without row errors.
- 2026-06-26 Upper Courtyard suggestion-failure inspection: the failed
  `featureFusionProduct` suggestion lane contains `4` false-positive pairs
  creating `3` false groups, all around high CNN and high structural scores.
  Complete-link grouping reduces transitive damage but still leaves direct
  false pairs and lower recall. Modes using `cnnNearMin`, `cnnNearProduct`, or
  luma/alpha products suppress those false positives but collapse useful
  validation recall. This points to a missing discriminative feature or learned
  hard-negative pattern, not a pure grouping-closure bug.
- 2026-06-26 color-gated feature-fusion holdout check: lane analysis now loads
  manual training metadata and skips candidates whose resolved color names
  differ. This matches the same-part product definition: same physical part
  includes color. With this gate, fixed `featureFusionProduct` score-threshold
  auto grouping matched `730/1333` positive holdout pairs across all 10 active
  labeled manuals with `0/764` wrong grouped rows and `0` false groups:
  `01-castle-ramp` `30/84`, `02-middle-wall` `118/197`,
  `03-lower-courtyard` `82/154`, `04-bakery` `76/119`,
  `05-farmhouse` `85/97`, `06-4th-stage` `84/109`,
  `07-fountain` `92/96`, `08-upper-courtyard` `129/230`,
  `09-hall-tower` `28/233`, and `10-wolf-pack-renegade` `6/14`. This is the
  first local-manual scorer candidate with broad zero-known-error auto safety
  and useful recall, but Hall Tower and Castle Ramp remain weak enough that app
  promotion still needs UI review on real sessions.
- `lab:part-match-lane-review` is private checklist-shaped scorer review
  tooling. It reads one or more `lab:part-match-pair-lanes` output directories,
  joins the selected lane back to manual crop metadata, writes proposed
  same-part groups with row images, and reports grouped-row correction burden
  in the same unit as the future Bags UI. It does not change app behavior.
- 2026-06-26 color-gated auto lane review:
  `lab:part-match-lane-review` over the 10 `featureFusionProduct`
  color-gated holdout lane directories wrote
  `.bag-it/private/part-match-reports/embedding-experiments/color-gated-auto-lane-review-v1/`.
  The checklist-shaped report confirmed `304` proposed groups, `764` grouped
  rows, `730/1333` matched positive holdout pairs, `0/764` wrong grouped rows,
  and `0/304` false groups. This confirms the pair-lane aggregate in
  app-review units; the remaining promotion gap is runtime integration and
  visual review of generated app/session groups, not another label-only metric.
- 2026-06-25 embedding score review: score reports now include private
  per-pair Same/Different/Not sure controls with local JSON download so
  dangerous negatives can be corrected without browser annotation markers.
  Explicit reviewed decisions override generated label or excluded-row
  candidates when their targets conflict; same-priority reviewed conflicts stay
  skipped. Importing the first 46 unique browser-reviewed dangerous negatives
  raised training recall to `189/1333` with `0` training false positives and
  `0` hard-negative false positives, but leave-one-manual-out still produced
  `4` false positives. Embedding scorer remains private and not promotable.
- 2026-06-25 button-review import: importing 160 downloaded score-review
  decisions (`89` same, `71` different) raised the active positive set to
  `1342` pairs. The default mean score stayed at `189/1342` training positives
  with `0` training false positives and `4` leave-one-manual-out false
  positives; all four holdout false positives are now explicitly reviewed
  `different` pairs. The `rendered-tight-min` score mode was safer at
  `186/1342` training positives with `0` training false positives and `1`
  reviewed holdout false positive, but still fails the zero-false-positive
  promotion gate.
- 2026-06-25 second button-review import: importing 164 downloaded
  score-review decisions (`89` same, `74` different, `1` not-sure`) raised the
  active positive set to `1351` pairs. The default mean score remains
  `189/1351` training positives with `0` training false positives and `4`
  leave-one-manual-out false positives. The safer `rendered-tight-min` score
  mode remains `186/1351` with `0` training false positives and `1` reviewed
  `06-4th-stage` hard-negative holdout false positive, so frozen CLIP
  embeddings plus threshold scoring remain private and not promotable.
- Score review reports hide already-reviewed decision-source pairs from active
  review queues. Reviewed holdout blockers remain visible only to explain why a
  scorer is blocked; they still show Same/Different/Not sure buttons with the
  existing decision preselected so corrections remain possible. The report UI
  defaults to a Needs review filter, lets reviewers filter by queue, and hides
  locally marked pairs immediately after a Same/Different/Not sure choice while
  preserving Reviewed and All filters for corrections.
- 2026-06-25 catalogue-retrieval spike: private
  `lab:part-match-catalogue-retrieval` can evaluate retrieval-style matching.
  In `label-exemplars` mode, labeled manual crops stand in for catalogue renders
  to test retrieval mechanics. On the full active embedding cache, frozen CLIP
  produced `1356/1745` top-1 correct rows with `rendered-tight-min` and
  `1414/1745` with `mean`, but both modes had high-confidence wrong top-1
  matches and `0/1745` safe recall under a zero-error threshold. This blocks
  catalogue retrieval promotion with the current frozen embeddings alone.
- `lab:part-match-ldraw-render` is a private render-path probe for real
  Studio/LDraw `.dat` catalogue geometry. It recursively resolves subfiles and
  primitives, projects neutral SVG views, and writes ignored inspection output
  under `.bag-it/private/part-match-reports/embedding-experiments/**`. It is
  only training-data infrastructure. It cannot promote matching behavior until
  those renders feed an embedding/reranker experiment that passes every
  zero-false-positive gate above.
- `lab:part-match-ldraw-three-render` is the preferred private catalogue render
  probe after the SVG projection output proved visually inaccurate. It uses
  Three.js `LDrawLoader`, local Studio LDraw files, and headless Chromium WebGL
  to write ignored PNG views and an inspection page. These renders may feed
  later catalogue embedding experiments, but still do not change app matching
  behavior or bypass the zero-false-positive gates.
- `lab:part-match-catalogue-poc` is the private catalogue-render PoC gate. It
  renders common real LDraw parts through the Three renderer, converts those
  rendered views into a synthetic private report and label set, embeds the
  crops with the current frozen model, and runs catalogue retrieval diagnostics.
  It is deliberately stricter than app use because it asks whether the model can
  recover the same LDraw part across held-out catalogue views before any manual
  crop bridge exists. On June 25, 2026, a 14-part smoke reached only `23/42`
  top-1, `29/42` top-K, and `6/42` zero-error safe rows. A broader 35-rendered
  part pass skipped local part `3665` due a missing Studio subfile and reached
  only `42/105` top-1, `68/105` top-K, and `0/105` safe rows. This validates the
  render/cache/scoring plumbing but blocks frozen-CLIP catalogue promotion; next
  useful work needs a LEGO-specific embedding or supervised reranker, not more
  threshold tuning on the current vectors.
- 2026-06-25 supervised LEGO reranker spike: the Three renderer now writes
  transparent-background PNGs so silhouette/tight crops carry actual part
  alpha instead of canvas rectangles. A transparent broader catalogue pass
  improved frozen retrieval to `54/105` top-1 and `72/105` top-K, but still
  produced `0/105` safe rows. A same-view augmentation pass with three
  synthetic perturbations per rendered view reached `225/315` top-1 and
  `314/315` top-K, proving candidate retrieval signal. The first linear
  supervised reranker is still not promotable: cross-view training is invalid
  for this scorer shape, and same-view training recovered only `5/315` holdout
  positives at zero false positives. Diagnostics show `13` negative pairs above
  the positive score ceiling, including `9` exact duplicate negative feature
  pairs. Conclusion: generated LDraw data is useful for candidate generation and
  future supervised work, but current frozen CLIP plus linear reranking cannot
  safely auto-group parts for MVP.
- `lab:part-match-attribute-spike` is a private LEGO semantic probe. It reads
  ignored LDraw catalogue embedding caches, derives category/footprint/height/
  modifier labels from local LDraw part titles, and evaluates held-out part ids.
  It does not change app or package matching. On June 25, 2026, the corrected
  numeric-footprint nearest-neighbor pass stayed blocked: rendered-only vectors
  recovered `37/315` full signatures and `166/315` categories, while combined
  rendered/tight/mask/silhouette vectors recovered `42/315` full signatures and
  `168/315` categories with `1504` predicted-signature collision pairs. This
  blocks generic-CLIP semantic matching; future work needs a stronger
  LEGO-specific feature/model objective, not more threshold tuning on the same
  frozen vectors.
- `lab:part-match-lego-training-data` is private training-data preparation for
  that stronger objective. It writes normalized transparent `96x96` LDraw
  example PNGs plus same-view positive and hard-negative pair manifests under
  ignored `.bag-it/private/part-match-reports/embedding-experiments/**`. The
  first dataset, `ldraw-lego-training-data-v1`, is focused on `iso-left` and
  `iso-right` views and contains `340` examples, `680` same-part positive
  pairs, and `1200` different-part hard negatives from the transparent broad
  render set. It is not a scorer and cannot promote matching behavior by
  itself.
- 2026-06-25 BOM-backed LEGO training-data result:
  `ldraw-lego-training-data-bom-v1` ingests the two user-provided Rebrickable
  CSVs and chooses the highest-quantity local LDraw-resolvable parts. The CSVs
  contain `655` unique parts and `18,478` total non-spare quantity; `592`
  unique parts resolve locally. The first capped run selected `180` parts
  covering `16,375` quantity, rendered `178/180`, and after current
  title-supported attribute filtering produced `1,140` iso-view examples,
  `2,280` same-part positives, and `4,150` hard negatives. The output lives
  under
  `.bag-it/private/part-match-reports/embedding-experiments/ldraw-lego-training-data-bom-v1/`.
  This is training input only; app grouping remains blocked until a scorer
  trained from it passes every zero-false-positive gate above.
- 2026-06-25 BOM-backed LEGO reranker result:
  `lab:part-match-lego-training-embeddings` converts generated LEGO training
  examples into a synthetic report/label cache for the existing embedding
  pipeline. On `ldraw-lego-training-data-bom-v1`, it embedded `1,140` rows into
  `4,560` CLIP vectors. The same-view linear reranker then scored `324,330`
  pairs. An `800` iteration run matched only `16/2280` part-id holdout
  positives with `0` false positives, and global zero-false-positive recall was
  only `5/2280`. This keeps the current frozen-CLIP linear reranker blocked;
  more training iterations on the same vectors are not a credible MVP path.
- 2026-06-25 supervised LEGO CNN baseline:
  `lab:part-match-lego-cnn` is private PyTorch/torchvision tooling that trains
  or evaluates a MobileNetV3-small classifier and scores same-part pairs from
  normalized penultimate CNN features. All Python venv, downloaded public LEGO
  data, models, and reports live under ignored `.bag-it/private/**`. The first
  external supervised pass uses an 80-class subset of the public MostWiedzy
  LEGO classification dataset. A 2-epoch external fine-tune reached `32/378`
  validation positives with `0` false positives on the external subset, but
  transferring the same model/threshold to the local BOM-backed LDraw pair set
  created `446` false positives. Retuning to zero false positives on that local
  pair set matched only `16/2280` positives. This blocks cosine-threshold CNN
  promotion; the next credible model step needs direct same/different
  metric-loss or hard-negative training, not app integration.
- 2026-06-25 supervised LEGO metric-loss follow-up:
  `lab:part-match-lego-cnn` now supports an optional contrastive metric phase
  over existing same/different pair manifests. Two serious runs failed to
  improve the safety gate. A balanced `3000`-pair local metric pass from the
  external LEGO checkpoint scored `50/500` validation positives with `13` false
  positives. An all-train-pair pass scored `43/500` validation positives with
  `11` false positives. Because false positives remain and recall did not
  improve meaningfully, this MobileNetV3 + cosine contrastive shape is blocked
  for MVP. More epochs in the same setup are not a promotion path.

## Quantity Gate

Against callout item fixtures:

- visible `Nx` quantity read accuracy: at least 95% exact on shared fixtures
- multi-digit quantity read accuracy: 100% on committed targeted masks
- unknown quantities are allowed only when represented as `value: null`
- any bag containing unknown quantities is marked `review`
- quantity-label glyph pixels must not appear in part-only preview crops

## Color Gate

Color detection is advisory in Build steps. Manual-local class precision is the
primary gate; LEGO palette-name accuracy is secondary because manuals render
colors consistently within a PDF but not necessarily against real bricks or
catalogue swatches.

Current minimum gate:

- detected color metadata is based on `@bag-it/part-colors` manual-local
  classes sampled from `partImage.region` plus `partImage.alphaMask`
- first tuning bias is conservative over-clustering; an extra manual class is
  acceptable, but merging obvious blue/green/gray/white families is a blocking
  bug
- same rendered color with small drift forms one deterministic class
- common confusion pairs such as blue/green/gray/white and gray/tan/brown/black
  remain separate manual classes before palette naming is considered
- black filled parts do not collapse into generic dark outlines
- light/dark neutral body chips do not collapse into shadow or outline classes
  when dark coverage is too small to represent a filled black part
- tiny black parts with clear near-black and dark-chip coverage do not snap to
  light highlight pixels
- small/thin parts sample mask-core body pixels before edge/outline pixels, and
  private report overlays/chips distinguish accepted body pixels from
  deprioritized edge pixels
- near-black selected samples may resolve from Black to Green only when
  same-row sampled chips contain strong low-luma green body evidence; this must
  preserve no-manual-regression and no-row-worsening private eval results
- small cool neutral classes whose nearest palette name is Flat Silver may be
  advisory-named Light Bluish Gray only when they are review-grade tiny samples
  with high edge pollution and visible LBG-like light chip evidence
- shadowed cool neutral rows may use retained edge/support chips as Light
  Bluish Gray evidence only when body evidence is non-black, review-grade, and
  edge rejection is high
- weak samples may produce advisory review names only when they contain usable
  color pixels; weak samples remain untrusted and are excluded from trainable
  color datasets
- small White rows currently named Light Bluish Gray may be rescued only by
  source-specific neutral evidence with bounded dominance, bounded light-edge
  pollution, and enough dark-edge support
- Medium Nougat rows currently named Trans-Orange may be rescued only by
  repeated warm edge/body evidence with strong orange-edge support and bounded
  dark, background, and saturated-warm coverage
- Trans-Orange rows currently named Medium Nougat may be rescued only when tiny
  high-background samples have enough orange body evidence but weak orange-edge
  support, preserving true Medium Nougat rows with strong orange edges
- shadowed cool neutral rows whose selected body chips are strongly
  medium-dark neutral and have no meaningful LBG body support must stay Dark
  Bluish Gray even when rejected edge pixels include light highlights
- raw manual color classes are diagnostic evidence; the app-facing canonical
  class can merge raw classes only when their resolved LEGO color name matches
  exactly within the same session
- broad family merging is excluded: LBG/DBG/Black, Tan/Dark Tan/Medium Nougat,
  and Blue/Bright Blue/Dark Azure remain separate unless their exact resolved
  names match
- app-side color sampling uses the same base page coordinate scale as returned
  part masks after high-resolution part extraction
- saved sessions must persist the part color calibration version; missing or
  stale color versions rerun the part extraction and color calibration pass
  before Build steps or Bags render color rows
- browser worker output must report current part extractor and part color
  calibration versions; stale worker output is rejected and retried once
- manual-local class assignment is deterministic when worker/page completion
  order changes
- small or thin edge-polluted rows can merge into a stronger same-hue class only
  when their chip evidence includes the stronger body color
- near-black selected rows may use a warm body chip before advisory naming only
  when same-row warm coverage is strong or one warm chip is near-dominant; this
  must not broaden into generic black-to-brown remapping
- edge-heavy Orange or Dark Orange rows may resolve to Medium Nougat only when
  same-row features show muted warm body evidence, low background rejection,
  high edge rejection, bounded saturated warm coverage, and bounded dark
  coverage; this must not broaden into generic Orange-to-Medium-Nougat remapping
- edge-heavy Pearl Gold rows may resolve away from Dark Brown only when
  accepted chips show broad gold-hue coverage, visible bright-gold support,
  bounded dark coverage, and bounded red coverage; this must not broaden into
  generic Dark Brown-to-Pearl-Gold remapping
- small shadowed Red rows may resolve away from Dark Red only when accepted
  pixels show repeated red body evidence, rejected edge pixels still support
  red, near-black body coverage is very low, and background rejection stays
  bounded; this must not broaden into generic Dark-Red-to-Red remapping
- transparent color rescues must be source-specific and feature-explainable:
  glass evidence can use accepted body chips, rejected-edge/background ratios,
  and bounded dark/red/cool-blue guards, but must not create a generic
  transparent fallback or force Trans-Clear when evidence overlaps White or
  Light Bluish Gray
- edge-polluted Dark Tan rows may resolve away from Dark Bluish Gray only when
  a close Dark Tan anchor chip exists, low-chroma dark-tan body coverage is
  broad, and saturated Tan/Yellow plus olive-gray guards stay below threshold
- edge-shadowed Light Bluish Gray rows may resolve away from Dark Bluish Gray
  only when rejected-edge light-neutral evidence is strong, accepted sample
  chips still contain light-neutral support, dark/near-black support is bounded,
  and any all-chip widened path is limited to tiny samples
- rows may resolve from Black, Dark Bluish Gray, Flat Silver, or narrowly
  guarded Light Bluish Gray to White only through rejected-background evidence
  with source-specific guards; Light Bluish Gray to White requires tiny or
  edge-polluted samples with high background rejection and either strong edge
  rejection or bright neutral edge support, while broad Light Bluish Gray to
  White rescue remains excluded
- shadowed Light Bluish Gray rows may resolve to Black only when accepted chips
  are medium-dark neutral, bright accepted support is bounded, rejected-edge
  coverage is high, and near-black edge evidence is strong
- one-row shadowed reddish-brown variants may merge into a stronger reddish
  brown class, but warm tiny transparent candidates stay separate and review
  named as Trans-Orange
- weak dark warm rows without strong transparent-orange evidence may merge into
  same-manual Reddish Brown, while stable small rows with enough trans-orange
  chip/body evidence remain separate Trans-Orange
- saturated tiny transparent primary rows may resolve from Red to Trans-Red,
  or from Blue/Dark Purple to Trans-Dark Blue, only when accepted body chips
  and rejected-edge chips both show high same-hue coverage and the crop has
  high background/edge rejection; this must not become a broad opaque-to-
  transparent remap
- tiny cyan-glass rows may resolve from Dark Bluish Gray to Trans-Light Blue
  only when background/edge rejection is high, cyan-glass coverage is broad,
  and dark core coverage is bounded; rows may resolve from Black to
  Trans-Light Blue only through the separate black-core guard with visible
  cyan-glass fringe, not through a broad Black-to-transparent rule
- tiny edge-heavy opaque Yellow rows may resolve from Dark Bluish Gray or
  Dark Orange to Yellow only when same-row chips show enough yellow body
  evidence, bounded dark coverage, and review-grade sample size; this rule is
  separate from Trans-Yellow evidence and must not rewrite transparent or
  metallic yellow candidates
- contextual Bright Green and Yellow tuning may only merge rows by exact
  resolved name; it must not merge broad green or warm families by parent color
- uncertain matches are marked `review` or family-only, not forced to rare
  catalog colors
- tiny, mixed, transparent, metallic, or unstable samples degrade to `review`,
  `family`, or `unknown`
- quantity-label pixels, callout background pixels, and crop borders stay out of
  the sampled color
- `swatchHex` in saved detector data uses the manual class centroid, not the
  nearest palette color. Production UI may render catalogue swatches from the
  resolved advisory color name while preserving saved `swatchHex` for detector
  regression data.
- advisory palette names include distance/confidence and are validated after
  class precision
- Build steps color sorting works independently from quantity sorting
- grouped-parts comparison requires the same canonical `manualClassId` only
  when both rows have `manualClassTrusted`; rows with missing or untrusted
  manual classes keep the existing conservative family/name fallback
- private tuning reports are written only under ignored
  `.bag-it/private/part-color-reports/**`
- private tuning reports default to saved app `detectedColor` assignments so
  report class groups match the app UI; renderer-recomputed reports are
  explicit drift diagnostics only
- private tuning report class summaries show app-matching part quantity totals
  as `Parts`, plus separate `Rows` totals for row-level audit
- private tuning reports show merged class summaries, raw diagnostic class
  summaries, one assigned-row table per merged class, review rows, unknown rows,
  visible part-mask previews, top color chips, and saved sample/rejection counts
  for the rows being judged
- private tuning reports show saved/current part extractor and part color
  calibration versions, with a stale-session warning when they differ
- Castle Ramp's committed e2e fixture acts as the small-manual color regression
  gate: the browser-produced session must reproduce the approved canonical color
  bucket summary before future color tuning is accepted; current expected
  buckets are Black, Reddish Brown, Trans-Orange, Green, Dark Bluish Gray, Dark
  Azure, and Light Bluish Gray
- Approved private tuning reports may also be accepted as local report-level
  regression snapshots under ignored
  `.bag-it/private/part-color-reports/regressions/**`. These snapshots store
  only class summaries and deterministic row-assignment hashes, not private
  crops or report images. They are used during local color tuning when the exact
  browser-rendered report state cannot be reproduced from committed package
  fixtures alone.
- Private color labels may be stored under ignored
  `.bag-it/private/part-color-reports/labels/**`. A label file declares
  `manualId`, `status`, `reportPath`, and row labels with `itemId`,
  `expectedName`, optional `note`, and optional `cropHash`. `gate` labels fail
  validation on mismatch, missing rows, stale saved-report input, or crop-hash
  drift; `active` labels only report score while the manual remains under
  tuning.
- Private color label workbench expected-color inputs must be searchable and
  backed by the committed Rebrickable bulk color catalog plus current resolver
  legacy names, not by only colors already seen in that manual. Report
  generation must not require a live Rebrickable API key. Search suggestions
  must render as workbench DOM, not only browser-native picker UI, and export
  must reject non-empty partial expected-color text that is not an exact catalog
  option. Large workbench pages must split into chunks of at most 500 rows so
  private labeling is not lost to giant local files, and the suggestion menu
  must keep keyboard navigation usable for chunked reports. Tab order in
  labeling mode must move between expected-color fields only. Copy export must
  work from `file://` workbenches by falling back from the Clipboard API to a
  selected textarea/legacy copy command when browser permissions block direct
  clipboard writes.
- Clean private tuning reports generated without a matching label set omit
  label summaries, annotated-mismatch sections, expected-color columns, and
  row-level label fields entirely.
- Color tuning reports with saved app results are rejected for label scoring
  when their saved part-color calibration version is stale. Renderer-recomputed
  reports may be used for fast tuning only when they are explicitly marked as
  recomputed from current code.
- Active labels without crop hashes are not enough for accepting fragile color
  resolver changes when the current row crop visibly conflicts with the
  expected color. Re-anchor those labels against the current report/app-parity
  crop before tuning against them.
- Aggregate color prototype changes must not worsen any scored private manual.
  Prototype constants must contain only aggregate color name, centroid, family,
  and support data. Additive prototype promotion may proceed while a detector
  fix is pending only when `npm run evaluate:part-color-runtime` shows no
  scored manual worsening from saved app sample data. The full promoted
  aggregate gate still requires refreshed saved app sessions and reports; that
  gate must improve Castle Ramp plus Middle Wall by at least `30` matches,
  Lower Courtyard by at least `50` matches, Bakery plus Farmhouse by at least
  `40` matches, and Farmhouse must improve or stay unchanged as the external
  holdout.
- Neutral representative-color tuning must be evaluated through refreshed
  saved-app reports, not renderer-only recompute. It must not worsen Castle
  Ramp, Middle Wall, Lower Courtyard, Bakery, Farmhouse, or 4th Stage active
  label scores, and 4th Stage remains score-only holdout evidence.
- `npm run validate:detector-regressions` validates every local color report
  snapshot, every local color label file, every local crop report snapshot, and
  the bag-analysis e2e fixture gate. Missing private report snapshot or label
  directories skip with a clear message so normal verification remains
  portable.
- `npm run validate:detector-tuning` is the strict local tuning gate. It fails
  when required private snapshots are absent; current required gates are Middle
  Wall color and Lower Courtyard crop snapshots.
- Castle Ramp remains the committed package-level small-manual color regression
  gate, and accepted Middle Wall private report snapshots remain local
  report-level regression gates while Lower Courtyard color tuning continues.
- Current Lower Courtyard color labels remain `active`, not `gate`. The full
  private active freeze anchors all 1459 current report rows with crop hashes,
  preserves existing user corrections, and scores `1427/1459` while Castle Ramp
  stays `152/152` and Middle Wall stays `438/438`. Future Lower tuning must
  improve this score without changing any currently matched Lower row unless
  that row is explicitly re-labeled. Remaining active Lower mismatches are
  classified by the local label evaluator as 16 neutral small-part ambiguities
  and 5 warm red/trans/brown ambiguities, plus 11 label conflicts that need
  re-review or stronger sampled evidence before becoming gate material.
  Reports must hide notes for matched labels and show notes only for mismatch,
  missing, or crop-drift rows so stale annotations do not clutter review.
  Remaining Lower failures need stronger sampled evidence, higher-resolution
  fallback proof, or explicit re-review before more resolver tuning is
  accepted.
- Approved private crop reports may be accepted as local crop-preview
  regression snapshots under ignored
  `.bag-it/private/part-crop-reports/regressions/**`. These snapshots hash
  report crop previews and stored part regions so detector crop regressions are
  blocked before color tuning. Lower Courtyard crop preview gates are accepted
  before any Lower Courtyard color-class tweaks continue.

BOM or parts-list pages may become future calibration evidence for naming
manual-local classes, but BOM quantities, part ids, inventory reconciliation,
Rebrickable matching, and BOM UI remain outside this gate.

## Part Matching Gate

Same-part matching is owned by the pure `@bag-it/part-matching` package and is
validated separately from app/session UI plumbing.

Package unit gates:

- exact digest groups form only across different callouts in the same bag
- rows from the same callout never group
- trusted color conflicts block grouping
- quantity differences do not block visual identity grouping
- scaled duplicates group only when the label-gated near-match family is
  explicitly enabled
- plate-like 1x3 and 1x4 synthetic masks stay separate because projections,
  lower silhouette, and stud/detail peak structure differ
- labels validate reusable visual rule families and hard negatives, not one
  custom rule per part type
- package source does not import React, Next.js, Chakra UI, PDF rendering,
  filesystem, or app/session modules

Private debug/training gate:

- private reports live only under
  `.bag-it/private/part-match-reports/**`
- `write-part-match-report.mjs` reads a saved session, builds row crops or mask
  previews, extracts visual features, runs the matcher, and writes `report.json`,
  `details.html`, static workbench pages, `workbench.js`, and `workbench.css`
- private reports should pass rendered crop pixels into
  `extractPartVisualFeatures` when a row crop data URL is available; rendered-
  pixel near matches use normalized luma/detail evidence plus a stricter
  confidence floor, while alpha-only features remain a fallback for synthetic
  and low-signal test cases
- part-match reports may be generated with a stable `--manual-id`; the visual
  workbench preloads existing labels for that manual, shows large part crops in
  bag-sectioned, color-sorted ungrouped pools beside bag-sectioned same-part
  group buckets, keeps the pool and buckets independently scrollable on desktop,
  preserves scroll position after drag/drop rerenders, supports collapsible bag
  sections, collapsible color sections inside each bag, and drag-and-drop
  grouping of selected cards, individual cards, or whole group rows, sorts
  groups by bag and representative color, supports single-row removal from a
  group, loads existing labels unchanged, auto-seeds proposed groups only when
  no existing label file is present or when rows are absent from a partial
  existing label file, can be filtered to selected bags with `--bag-labels` or
  `--bag-ids`, and exports or downloads the label JSON
- `report:part-match-review-queue` writes a private targeted pair-review
  workbench under `.bag-it/private/part-match-reports/review-queue/**`; it is
  seeded from current miss buckets and near hard-negative candidates, shows
  each pair side by side, stores quick `same`, `different`, `bad-crop`, or
  `ignore` decisions in browser storage, exports those decisions as JSON, and
  can exclude prior decision exports with `--exclude-decision-path` when
  preparing a follow-up queue. Use `--scorer-config` after private scorer
  training so follow-up queues target current misses instead of pairs the
  scorer already recovers.
- `train:part-match-scorer` is TypeScript private training tooling for a small
  exported visual pair scorer. Training may use active labels, exported
  `role: "excluded"` singleton rows as negative examples, plus review decision
  exports, writes ignored scorer JSON under
  `.bag-it/private/part-match-reports/**`, and remains app-hidden until gate
  labels prove zero false groups and zero hard-negative false-positive pairs.
  When a scorer config is supplied, the scorer gates all near matches; generic
  visual rules remain the no-scorer fallback and cannot bypass learned hard
  negatives. The same `--decision-path` input accepts targeted pair-review
  decisions and grouping-conflict decisions; grouping-conflict `same` and
  `different` choices expand into candidate-vs-reference training pairs, while
  `ignore` choices are skipped. Training defaults to failing on contradictory
  label/decision pairs; use `--decision-conflict-policy prefer-decisions` only
  for private pair-review passes where fresh pair decisions should override an
  older full-group label pair without mutating the private label file.
- `lab:part-match-verifier` is TypeScript private verifier-lab tooling for
  offline scorer experiments after targeted review queues plateau. It discovers
  reviewed decision exports under `.bag-it/private/part-match-reports/**`, runs
  the current scorer as the baseline, trains configured candidate scorer
  families into an ignored lab directory, evaluates every candidate through the
  same active-label group and hard-negative pair gates, and writes
  `lab-summary.json` plus `index.html`. A candidate is promotable only when it
  keeps 0 false groups, 0 crop drift, and 0 hard-negative false-positive pairs
  while improving same-bag group recall over the baseline. The lab is private
  tooling only; it does not change app-visible near matching.
- `analyze:part-match-rules -- --write-color-conflict-report <dir>` writes a
  private HTML/JSON diagnostic for same-label pairs blocked by color policy, so
  color-key fragmentation can be inspected before relaxing matcher rules.
- `analyze:part-match-rules -- --write-grouping-conflict-report <dir>` writes
  a private HTML/JSON diagnostic for remaining missed expected pairs after pair
  scoring succeeds, showing the labeled rows, missed pairs, current groups, and
  unlabeled rows competing for the same group partition. The report lets a
  reviewer mark each competing unlabeled row as `same`, `different`, or
  `ignore` relative to the shown `expectedPartKey`, stores choices locally, and
  downloads a `grouping-conflict-decisions.json` file for the next scorer/rule
  iteration.
- label files live under
  `.bag-it/private/part-match-reports/labels/**`
- label schema is `manualId`, `status: "active" | "gate"`, `reportPath`, and
  `labels[]` with `itemId`, `expectedPartKey`, optional `note`, `cropHash`, and
  optional `role`
- `expectedPartKey` is manual-local and arbitrary; equal keys mean exact same
  physical part, while different colors or different sizes such as 1x3 vs 1x4
  get different keys
- gate labels fail on false grouping, missed required grouping, missing rows,
  stale matcher or part-extractor versions, crop-hash drift, and duplicate
  labels
- same-callout label pairs are excluded from required pair counts because the
  matcher intentionally never groups rows from the same source callout
- active labels are score-only evidence and do not fail normal verification
- labels may reuse the same `expectedPartKey` across multiple bags in a manual;
  scoring and scorer training still derive expected same-part pairs only inside
  the same bag and across different source callouts
- current active-label score on June 23, 2026, after adding supplemental
  zero-negative lanes for raw scorer misses in `@bag-it/part-matching`
  `0.1.0-alpha.9` and evaluating the candidate ignored scorer JSON with the
  clean Hall Tower plateau review decisions: analyzer group score is 911/1296
  same-bag cross-callout expected pairs matched, 0 false groups, 385 missed
  pairs, and 0 crop drifts across the ten labeled manuals
  (`01-castle-ramp`, `02-middle-wall`, `03-lower-courtyard`, `04-bakery`,
  `05-farmhouse`, `06-4th-stage`, `07-fountain`, `08-upper-courtyard`,
  `09-hall-tower`, `10-wolf-pack-renegade`). Pair score is 1007 same-label
  pairs matched, 289 same-label pairs missed, 2 of them due to trusted color
  conflict, and 0 hard-negative false-positive pairs. The June 22 promoted
  scorer before supplemental lanes was 876/1296 group pairs and 980 same-label
  pairs, also with zero false groups and zero hard-negative false-positive
  pairs. This remains private training output, not app-visible near-match
  output, because labels are not `gate` status and scorer JSON is
  private/ignored.
- per-manual holdout validation runs with
  `npm run analyze:part-match-holdout -- --base-scorer-config .bag-it/private/part-match-reports/scorer-base-threshold-06.json`
  and writes ignored fold configs plus `holdout-analysis.json` under
  `.bag-it/private/part-match-reports/holdout/`. Current June 22, 2026
  holdout score is 855/1296 expected pairs matched, 12 false groups, 441
  missed pairs, 0 crop drifts, 954 same-label pairs matched, 342 same-label
  pairs missed, and 44 hard-negative false-positive pairs. All unsafe holdout
  cases occur when `09-hall-tower` is held out; every training fold remains at
  0 false groups and 0 hard-negative false-positive pairs. This blocks
  promoting more generalized near-match recall until more Hall-Tower-like hard
  negatives or stronger visual features exist.
- after the holdout plateau, the targeted review queue lives at
  `.bag-it/private/part-match-reports/review-queue-hall-tower-plateau/` with
  120 Hall Tower pairs: 80 remaining missed-same pairs and 40 high-risk
  near-hard-negative pairs.
- the June 23 Hall Tower plateau review export contains 119 clean decisions
  and 1 conflict against the older full-manual label graph. With the
  supplemental candidate scorer, the clean decisions score 13/79 newly marked
  same pairs recovered and 0/40 newly marked different pairs overmatched. A
  critical `09-hall-tower` holdout with those decisions withheld from that fold
  remains unsafe at 138/223 matched, 10 false groups, 85 missed, and 38
  hard-negative false-positive pairs, so the supplemental family remains
  private-only and needs targeted Hall-Tower-like hard negatives before any app
  gate promotion.
- the next targeted private review queue after promoting the supplemental
  scorer locally is
  `.bag-it/private/part-match-reports/review-queue-hall-tower-supplemental-next/`
  with 62 Hall Tower pairs: 22 remaining missed-same pairs and 40 high-risk
  near-hard-negative pairs, excluding the already reviewed plateau decisions.
- the June 23 Hall Tower supplemental-next review export contains 62 decisions:
  22 same and 40 different. Two decisions contradict the older Hall Tower
  full-group label graph. With the current promoted private scorer, the export
  scores 0/22 newly marked same pairs recovered and 0/40 newly marked different
  pairs overmatched. A `prefer-decisions` training probe remained safe on
  active labels but regressed recall to 866/1296 matched pairs, and scored only
  1/22 newly marked same pairs; it is rejected and not promoted. The export is
  retained as private conflict/guard data for the next model or feature-family
  pass.
- the June 23 v2 visual-feature scorer adds 32x32 alpha/luma grids, signed
  silhouette distance, and orientation-histogram metrics. The promoted private
  ignored scorer at `.bag-it/private/part-match-reports/scorer-config.json`
  improves active-label group recall to 975/1296 matched pairs with 0 false
  groups and 321 missed. Pair score is 1050 same-label pairs matched and 246
  missed. Active-label hard-negative score reports 1 false-positive pair, but
  that pair is one of the two known conflicts where the fresh Hall Tower
  supplemental-next review marked the pair `same` while the older full-group
  label file marks it different. With pair-review decisions preferred during
  training, the scorer has 0 false-positive training pairs.
- v2 remains private-only and not app-safe. Holding out `09-hall-tower` still
  fails: 137/223 group pairs matched, 9 false groups, 86 missed, and 38
  hard-negative false-positive pairs. The follow-up queue for the v2 scorer is
  `.bag-it/private/part-match-reports/review-queue-hall-tower-v2-next/` with
  44 pairs: 4 remaining missed-same pairs and 40 near-hard-negative pairs,
  excluding both already reviewed Hall Tower queue exports.
- the June 23 Hall Tower v2-next review export contains 44 decisions: 6 same
  and 38 different. Two same decisions contradict older full-group Hall Tower
  labels. With the pre-export v2 scorer, the export scored 0/6 same recovered
  and 0/38 different overmatched. Retraining with all three Hall Tower review
  exports and `prefer-decisions` promotes a private ignored round2 scorer at
  `.bag-it/private/part-match-reports/scorer-config.json`: active-label group
  recall is 984/1296 matched, 1 false group, 312 missed, and 0 crop drift.
  The 1 active-label false group and all 3 active-label hard-negative
  false-positive pairs are known fresh-review conflicts where pair-review
  decisions say `same` and older group labels say different. Across all three
  review exports, different decisions remain 0 false positive; the v2-next
  export scores 3/6 same recovered and 0/38 different overmatched. The next
  private queue is
  `.bag-it/private/part-match-reports/review-queue-hall-tower-v2-round2-next/`
  with 40 near-hard-negative pairs and no remaining missed-same pairs.
- the June 23 Hall Tower v2-round2-next review export contains 40 decisions:
  all are `different`, and none conflict with active labels. The current
  private round2 scorer scores those decisions as 40 safe and 0 false positive.
  A round3 training probe with all four Hall Tower review exports produces an
  equivalent scorer after behavior metadata is ignored, so it is not promoted.
  Aggregate active-label score remains 984/1296 matched, 1 false group, 312
  missed, and 0 crop drift; the 1 false group and all 3 active-label
  hard-negative false-positive pairs are still the known stale-label conflicts
  where fresh pair-review decisions say `same`. The next private review queue
  is
  `.bag-it/private/part-match-reports/review-queue-hall-tower-v2-round3-next/`
  with 40 near-hard-negative pairs and no remaining missed-same pairs.
- the June 23 Hall Tower v2-round3-next review export contains 40 decisions:
  1 `same` and 39 `different`. The `same` decision is another stale-label
  conflict against the older Hall Tower full-group label graph. The current
  private round2 scorer misses that `same` pair and keeps all 39 `different`
  decisions safe. A round4 training probe with all five Hall Tower review
  exports and `prefer-decisions` remains safe in training but does not improve
  aggregate active-label or latest-review recall, so it is not promoted.
  Aggregate active-label score remains 984/1296 matched, 1 false group, 312
  missed, and 0 crop drift. The next private review queue is
  `.bag-it/private/part-match-reports/review-queue-hall-tower-v2-round4-next/`
  with 40 near-hard-negative pairs and no remaining missed-same pairs.
- the June 23 Hall Tower v2-round4-next review export contains 40 decisions:
  all are `different`, and none conflict with active labels. The current
  private round2 scorer scores those decisions as 40 safe and 0 false positive.
  Because the batch contains no `same` decisions and no overmatched negatives,
  no scorer training probe is promoted for this round. Aggregate active-label
  score remains 984/1296 matched, 1 false group, 312 missed, and 0 crop drift.
  The next private review queue is
  `.bag-it/private/part-match-reports/review-queue-hall-tower-v2-round5-next/`
  with 40 near-hard-negative pairs and no remaining missed-same pairs.
- the June 23 Hall Tower v2-round5-next review export contains 40 decisions:
  all are `different`, and none conflict with active labels. The current
  private round2 scorer scores those decisions as 40 safe and 0 false positive.
  The batch is guard-only evidence, so no scorer training probe is promoted.
  Aggregate active-label score remains 984/1296 matched, 1 false group, 312
  missed, and 0 crop drift. The next private review queue is
  `.bag-it/private/part-match-reports/review-queue-hall-tower-v2-round6-next/`
  with 40 near-hard-negative pairs and no remaining missed-same pairs.
- the June 23 Hall Tower v2-round6-next review export contains 40 decisions:
  1 `same` and 39 `different`. The `same` decision is a stale-label conflict
  in the same Hall Tower `part-064`/`part-378` family where older group labels
  disagree with fresh pair review. The pre-export scorer misses that `same`
  pair and keeps all 39 `different` decisions safe. Retraining with all Hall
  Tower review exports and `prefer-decisions` promotes a private ignored
  round7 scorer at `.bag-it/private/part-match-reports/scorer-config.json`:
  active-label group recall improves to 991/1296 matched, 1 false group, 305
  missed, and 0 crop drift. Across the combined reviewed Hall Tower decision
  set through round6, the promoted scorer recovers 41/109 same decisions and
  has 0 false positives across 307 evaluable different decisions, with 9
  reviewed pairs missing from the current source report. Active-label
  hard-negative false positives rise from 3 to 4 only because this fresh
  reviewed `same` pair is still counted as different by the older full-group
  label file. The next private review queue is
  `.bag-it/private/part-match-reports/review-queue-hall-tower-v2-round7-next/`
  with 40 near-hard-negative pairs and no remaining missed-same pairs.
- the June 23 Hall Tower v2-round7-next review export contains 40 decisions:
  all are `different`, and the promoted private round7 scorer keeps all 40
  safe. Because repeated broad Hall Tower queues were only producing
  hard-negative guard evidence, broad hard-negative queue generation stops
  until a future scorer change increases recall. The stale Hall Tower
  `part-064`/`part-378` label split is merged in the private label file after
  pair-review evidence connected all five rows with no reviewed different
  decision inside that family. After the merge, active-label score is 993/1302
  matched, 0 false groups, 309 missed, and 0 crop drift; hard-negative
  false-positive pairs are 0. Hall Tower is 135/229 matched, 0 false groups,
  and 94 missed. The next private workbench is the recall-only queue
  `.bag-it/private/part-match-reports/review-queue-hall-tower-v2-targeted-recall-after-label-merge/`
  with 1 missed-same pair and no hard negatives.
- the June 23 targeted recall export for
  `review-queue-hall-tower-v2-targeted-recall-after-label-merge` marks that
  lone missed pair as `same`. A training probe with the merged Hall Tower
  labels and all reviewed Hall Tower decisions still misses this pair and keeps
  aggregate score unchanged at 993/1302 matched, 0 false groups, 309 missed,
  and 0 crop drift, so it is not promoted. This closes the current annotation
  loop: the next improvement requires feature or rule work for this low-alpha,
  high-luma-edge same-part pair, not more broad Hall Tower review.
- `@bag-it/part-matching` `0.1.0-alpha.11` adds shifted-distance ratio
  features for alpha, luma, and silhouette grids, with private scorer-config
  version `0.1.0-alpha.5`. Retraining with the same merged Hall Tower labels,
  the reviewed Hall Tower decisions through round7, and the targeted recall
  decision promotes the private ignored scorer at
  `.bag-it/private/part-match-reports/scorer-config.json`: active-label group
  recall improves to 1194/1302 matched, 0 false groups, 108 missed, and 0 crop
  drift. Pair score is 1249 same-label pairs matched, 53 missed, and 0
  hard-negative false-positive pairs. The targeted recall pair is now matched,
  and the reviewed Hall Tower decisions through round7 remain safe at 0/343
  evaluable different decisions overmatched. The next private recall queue is
  `.bag-it/private/part-match-reports/review-queue-hall-tower-v2-shift-ratio-next/`
  with one unreviewed Hall Tower missed-same pair and no generated hard
  negatives.
- the June 23 Hall Tower shift-ratio-next review export marks that remaining
  recall pair as `same`. A direct retrain does not change the scorer, but a
  validated supplemental flat-top/low-alpha/low-luma lane recovers the pair
  without matching any color-compatible active-label negative or reviewed Hall
  Tower `different` decision. The promoted private ignored scorer now scores
  1195/1302 active-label group pairs matched, 0 false groups, 107 missed, and
  0 crop drift; pair score is 1250 same-label pairs matched, 52 missed, and 0
  hard-negative false-positive pairs. Hall Tower is 170/229 matched, 0 false
  groups, and 59 missed. The follow-up recall-only queue
  `.bag-it/private/part-match-reports/review-queue-hall-tower-v2-flat-top-luma-next/`
  contains 0 pairs after excluding the reviewed Hall Tower decisions.
- `@bag-it/part-matching` `0.1.0-alpha.12` adds `nearConfidence` as a private
  pair-scorer feature so supplemental lanes can use the existing generic
  near-match confidence without bypassing color scoping. A validated
  near-confidence/lower-profile/luma32 supplemental lane improves pair-level
  recall to 1251 same-label pairs matched and 51 missed, while active-label
  group recall remains 1195/1302 matched with 0 false groups, 107 missed, and
  0 crop drift. Hard-negative false-positive pairs remain 0, and the reviewed
  Hall Tower decisions through round7 still have 0 overmatched `different`
  decisions. A post-promotion search finds no remaining zero-compatible-
  negative supplemental lane over current metrics, so the next private input is
  the hard-negative review queue
  `.bag-it/private/part-match-reports/review-queue-v2-near-confidence-hard-negatives/`
  with 60 near-hard-negative pairs and no repeated missed-same pairs.
- the June 23 priority hard-negative review export contains 20 decisions:
  2 `same` and 18 `different`. The two `same` decisions corrected stale
  active-label key splits in the private label files (`02-middle-wall`
  `part-017 -> part-016` and `03-lower-courtyard` `part-181 -> part-098`)
  without collapsing any reviewed `different` pair. A validated hybrid private
  scorer promotes the candidate tree/evidence plus the union of current safe
  supplemental lanes under
  `.bag-it/private/part-match-reports/scorer-config.json`: active-label group
  recall is 1211/1324 matched, 0 false groups, 113 missed, and 0 crop drift;
  pair score is 1267 same-label pairs matched, 57 missed, and 0 hard-negative
  false-positive pairs. The priority export scores 2/2 same recovered and
  18/18 different safe; the reviewed Hall Tower decision set through round7
  remains at 0 overmatched different decisions. A post-promotion search finds
  no remaining zero-compatible-negative supplemental lane. The next private
  queue is
  `.bag-it/private/part-match-reports/review-queue-v2-after-priority-hybrid-next/`
  with 30 pairs: 10 remaining `other` missed-same pairs and 20 high-risk
  near-hard-negative pairs.
- the June 23 after-priority-hybrid review export contains 30 decisions:
  3 `same` and 27 `different`. The decisions exposed more stale broad labels,
  so the private label files are reconciled by splitting over-broad
  `02-middle-wall` groups and merging one corrected `03-lower-courtyard`
  same-part family. A safe scorer refit with those labels and all reviewed
  decisions regresses recall, as expected, to 1103/1298 active-label group
  pairs matched, 0 false groups, 195 missed, and 0 crop drift; pair score is
  1195 same-label pairs matched, 103 missed, and 0 hard-negative false-positive
  pairs. A decision-aware supplemental lane gated by high near confidence,
  exact lower profile, and tight `luma32` distance is promoted only after it
  keeps active labels at 0 false groups, keeps the reviewed Hall Tower
  `different` decisions at 343 safe and 0 false positive, keeps the latest
  27 reviewed `different` decisions safe, and recovers one additional
  same-label pair. The current private scorer score is therefore 1103/1298
  group pairs matched, 0 false groups, 195 missed, and 0 crop drift; pair score
  is 1196 same-label pairs matched, 102 missed, and 0 hard-negative
  false-positive pairs. Decision-aware supplemental search finds no further
  zero-negative lane. The next private review queue is
  `.bag-it/private/part-match-reports/review-queue-v2-after-reconcile-lane-next/`
  with 30 pairs: 10 remaining `other` missed-same pairs and 20 high-risk
  near-hard-negative pairs across `01-castle-ramp`, `02-middle-wall`,
  `03-lower-courtyard`, `04-bakery`, `06-4th-stage`, and
  `08-upper-courtyard`.
- the June 23 after-reconcile-lane review export contains 30 decisions:
  12 `same` and 18 `different`. Ten `same` choices already agreed with active
  labels, while two choices safely merge `02-middle-wall` `part-016`,
  `part-016-split-005`, and `part-016-split-006` after checking that no
  reviewed `different` decision would collapse. A refit with all reviewed
  decisions improves active-label recall to 1136/1305 group pairs matched,
  0 false groups, 169 missed, and 0 crop drift; pair score is 1208
  same-label pairs matched, 97 missed, and 0 hard-negative false-positive
  pairs. Two decision-aware one-pair supplemental lanes are promoted only after
  keeping active labels at 0 false groups, keeping the latest 18 reviewed
  `different` decisions safe, keeping the reviewed Hall Tower `different`
  decisions at 343 safe and 0 false positive, and preserving earlier priority
  review negatives. The current private scorer score is 1136/1305 group pairs
  matched, 0 false groups, 169 missed, and 0 crop drift; pair score is 1210
  same-label pairs matched, 95 missed, and 0 hard-negative false-positive
  pairs. Decision-aware supplemental search finds no further zero-negative
  lane. The next private review queue is
  `.bag-it/private/part-match-reports/review-queue-v2-after-reconcile-round2-next/`
  with 30 pairs: 10 remaining `other` missed-same pairs and 20 high-risk
  near-hard-negative pairs across `02-middle-wall`, `03-lower-courtyard`,
  `06-4th-stage`, and `08-upper-courtyard`.
- the June 23 after-reconcile-round2 export contains 30 decisions:
  12 `same` and 18 `different`. The export uncovered active-label conflicts in
  `02-middle-wall` and `03-lower-courtyard`; after reconciling those labels, the
  previously promoted broad scorer produced 2 active-label false groups and
  6 hard-negative false-positive pairs, so it was replaced with a safer refit.
  The safe refit keeps active labels at 0 false groups and 0 hard-negative
  false-positive pairs, but drops recall to 1043/1310 group pairs matched.
  Two decision-aware supplemental lanes were then promoted only after keeping
  active labels at 0 false groups, keeping the latest 18 reviewed `different`
  decisions safe, and keeping reviewed Hall Tower `different` decisions at
  343 safe and 0 false positive. The current private scorer score is
  1052/1310 group pairs matched, 0 false groups, 258 missed, and 0 crop drift;
  pair score is 1171 same-label pairs matched, 139 missed, and 0 hard-negative
  false-positive pairs. This is still below the near-match MVP gate for
  app-visible matching; exact-digest grouping remains the only app-safe mode.
  The next private review queue is
  `.bag-it/private/part-match-reports/review-queue-v2-after-reconcile-round3-next/`
  with 30 pairs: 10 remaining `other` missed-same pairs and 20 high-risk
  near-hard-negative pairs across `01-castle-ramp`, `02-middle-wall`,
  `03-lower-courtyard`, `04-bakery`, `06-4th-stage`, and
  `08-upper-courtyard`.
- the June 23 after-reconcile-round3 export contains 30 decisions:
  15 `same` and 15 `different`. Ten `same` decisions already agreed with active
  labels; 5 required minimal row-level label reconciliation across
  `02-middle-wall`, `03-lower-courtyard`, and `08-upper-courtyard`. The
  reconciliation intentionally avoids broad key merges: one `03-lower-courtyard`
  row moves into `part-178-split-001` to satisfy fresh `same` decisions while
  preserving an earlier reviewed `different` constraint, and one
  `08-upper-courtyard` row moves from `part-087` into `part-003`. The old
  scorer became unsafe after these label corrections, with 2 active-label false
  groups and 3 hard-negative false-positive pairs, so it was replaced by a
  decision-aware safe refit. The current private scorer score is 1189/1318
  group pairs matched, 0 false groups, 129 missed, and 0 crop drift; pair score
  is 1247 same-label pairs matched, 71 missed, and 0 hard-negative
  false-positive pairs. The latest reviewed export now scores 13/15 `same`
  recovered and 15/15 `different` safe; reviewed Hall Tower decisions remain
  343 `different` safe and 0 false positive. Decision-aware supplemental search
  finds only one-pair zero-negative lanes, so no supplemental lane is promoted
  for this round. The next private review queue is
  `.bag-it/private/part-match-reports/review-queue-v2-after-reconcile-round4-next/`
  with 30 pairs: 10 remaining `other` missed-same pairs and 20 high-risk
  near-hard-negative pairs across `02-middle-wall`, `03-lower-courtyard`,
  `04-bakery`, `06-4th-stage`, and `08-upper-courtyard`.
- the June 23 after-reconcile-round4 export contains 30 decisions:
  11 `same` and 19 `different`. Ten `same` choices were compatible with active
  labels, while one `08-upper-courtyard` choice revealed that the old
  full-manual annotation flow had split one same-part family between
  `part-003` and `part-087`; after checking reviewed decisions, `part-087` is
  merged into `part-003` in the private label file. This confirms that labels
  may retain manual-wide key names for reviewer convenience, but gates and
  training must continue to score only same-bag, cross-callout pairs, so broad
  relabeling is not required. A wider decision-aware refit is safe but only
  improves recall modestly. The current private scorer score is 1194/1322
  group pairs matched, 0 false groups, 128 missed, and 0 crop drift; pair score
  is 1251 same-label pairs matched, 71 missed, and 0 hard-negative
  false-positive pairs. The latest reviewed export now scores 2/11 `same`
  recovered and 19/19 `different` safe; reviewed Hall Tower decisions remain
  343 `different` safe and 0 false positive. The next private review queue is
  `.bag-it/private/part-match-reports/review-queue-v2-after-reconcile-round5-next/`
  with 28 pairs: 8 remaining `other` missed-same pairs and 20 high-risk
  near-hard-negative pairs across `02-middle-wall`, `03-lower-courtyard`,
  `04-bakery`, `06-4th-stage`, and `08-upper-courtyard`.
- the June 23 after-reconcile-round5 export contains 28 decisions:
  8 `same` and 20 `different`. The batch introduces no new active-label
  conflict; only the older Hall Tower `part-364` label/review contradiction
  remains. The current scorer misses all 8 `same` pairs and keeps all 20
  `different` pairs safe. A decision-aware refit with all reviewed exports is
  behavior-equivalent to the current scorer, and a deeper 4-condition search
  also finds no new zero-negative lane. A generic rotation/flip-invariant grid
  feature probe and full-tree retrain were rejected because they reduced recall
  while preserving safety. The current private scorer therefore remains
  unchanged at 1194/1322 group pairs matched, 0 false groups, 128 missed, and
  0 crop drift; pair score remains 1251 same-label pairs matched, 71 missed,
  and 0 hard-negative false-positive pairs. The next private review queue is
  `.bag-it/private/part-match-reports/review-queue-v2-after-reconcile-round6-next/`
  with 20 high-risk near-hard-negative pairs and no remaining unreviewed
  `other` missed-same candidates from this generator. Further recall improvement
  now needs a stronger visual feature/model family, not more same/different
  labels from the current targeted queue shape.
- the June 23 after-reconcile-round6 export contains 20 decisions:
  all are `different`. The current scorer keeps all 20 safe, active-label score
  remains 1194/1322 group pairs matched with 0 false groups and 0 crop drift,
  and hard-negative false-positive pairs remain 0. The export introduces no new
  active-label conflict; only the older Hall Tower `part-364` label/review
  contradiction remains in the accumulated decision audit. Because this batch
  contains no `same` pairs, no scorer retrain is promoted. The next private
  review queue is
  `.bag-it/private/part-match-reports/review-queue-v2-after-reconcile-round7-next/`
  with 20 high-risk near-hard-negative pairs and no `other` missed-same
  candidates. More reviews from this queue shape are safety guard evidence
  only; recall work needs a new visual feature/model path or dev-only app
  preview with current exact-plus-private scorer behavior.
- the June 23 after-reconcile-round7 export contains 20 decisions:
  all are `different`. The current scorer keeps all 20 safe, active-label score
  remains 1194/1322 group pairs matched with 0 false groups, 128 missed, and
  0 crop drift; pair score remains 1251 same-label pairs matched, 71 missed,
  and 0 hard-negative false-positive pairs. The export introduces no new
  active-label conflict; only the older Hall Tower `part-364` label/review
  contradiction remains in the accumulated decision audit. Because this batch
  contains no `same` pairs, no scorer retrain is promoted. The next private
  review queue is
  `.bag-it/private/part-match-reports/review-queue-v2-after-reconcile-round8-next/`
  with 20 high-risk near-hard-negative pairs and no `other` missed-same
  candidates. This confirms the current targeted queue shape is guard-only;
  recall work should move to a stronger visual feature/model path before asking
  for more annotation.
- the June 23 after-reconcile-round8 export contains 20 decisions:
  all are `different`. The current scorer keeps all 20 safe, active-label score
  remains 1194/1322 group pairs matched with 0 false groups, 128 missed, and
  0 crop drift; pair score remains 1251 same-label pairs matched, 71 missed,
  and 0 hard-negative false-positive pairs. The accumulated decision audit now
  checks 900 pairs and still has only the older Hall Tower `part-364`
  label/review contradiction. Because the last three exports are all
  hard-negative guard batches and no `other` missed-same candidates remain in
  this queue shape, stop this annotation loop. The next improvement pass should
  be a stronger private visual feature/model path evaluated against the frozen
  labels and reviewed decisions before asking for more annotation.
- initial verifier-lab smoke on June 23 writes ignored reports under
  `.bag-it/private/part-match-reports/verifier-lab/**`. Baseline-only verifies
  the current scorer at 1194/1322 group pairs, 0 false groups, and 0
  hard-negative false-positive pairs. The first conservative tree candidate
  proves the train/evaluate loop but is not promotable: it remains safe with 0
  false groups and 0 hard-negative false positives, but regresses recall to
  1129/1322. Current scorer stays in place.
- the next verifier-lab pass adds baseline miss diagnostics to `lab-summary.json`
  and `index.html`. It shows the remaining 71 same-label missed pairs are
  concentrated in `09-hall-tower` (34), `03-lower-courtyard` (10), and
  `06-4th-stage` (10). Many top missed pairs have raw scorer confidence `1.0`
  but still fail the evidence gate, so the learned tree often recognizes the
  pair while the visual evidence lanes remain too narrow. A fast four-rule
  evidence refit with all reviewed decisions stays safe but regresses badly to
  920/1320 group pairs, confirming that more refit passes on the current
  feature/rule family are not enough. Next recall work should add new
  scale/detail/shape evidence features or a different verifier family, then
  test it through the same lab gate before asking for more labels.
- `@bag-it/part-matching` `0.1.0-alpha.13` adds alpha-bounds-normalized tight
  32x32 alpha, alpha-edge, and luma grids, plus model-gated supplemental
  evidence rules. The promoted private scorer keeps existing independent
  supplemental lanes but adds one model-gated tight-alpha-shift lane:
  `tightAlpha32ShiftDistance < 18.1787109376` and
  `alpha32Distance < 47.1982421876`. The full active-label gate improves from
  1194/1322 to 1211/1322 group pairs matched with 0 false groups, 111 missed,
  and 0 crop drift; pair score improves from 1251 to 1263 same-label pairs
  matched with 59 missed and 0 hard-negative false-positive pairs. The combined
  900 reviewed-decision guard scores 233 `same` matched, 56 `same` missed,
  598 `different` safe, and 0 reviewed `different` false positives, with 13
  missing historical pairs. The next queue
  `.bag-it/private/part-match-reports/review-queue-v2-after-tight-alpha-v1-next/`
  contains 20 high-risk near-hard-negative pairs and no missed-same candidates,
  so no broad user labeling is needed for this scorer pass.
- the reviewed tight-alpha queue export from June 23 marks all 20 pairs as
  `different`; the combined reviewed-decision guard grows from 900 to 920
  decisions and remains safe with 618 `different` pairs, 0 reviewed
  `different` false positives, and 13 missing historical pairs. Three
  additional private model-gated supplemental lanes were promoted only after
  full active-label and combined-reviewed validation:
  `(aspectRatio < 1.015668202864977, lumaShiftDistance < 8.8945312501,
  tightAlpha32ShiftDistance < 26.6455078126)`,
  `(leftProfileDistance < 0.0625000001, lumaShiftDistance < 9.2070312501,
  tightLuma32ShiftDistance < 20.5947265626)`, and
  `(alphaOrientationDistance < 0.019969980441978112,
  aspectRatio < 1.1059907835101384,
  lumaOrientationDistance < 0.0235670549454426,
  tightAlpha32ShiftDistance < 34.4882812501)`. The current private scorer
  improves the full active-label gate to 1217/1322 group pairs matched with 0
  false groups, 105 missed, and 0 crop drift; pair score is 1269 same-label
  pairs matched, 53 missed, and 0 hard-negative false-positive pairs. A fourth
  bounded search over the current feature family finds no remaining zero-negative
  model-gated lane, so further recall needs either new visual evidence features
  or new reviewed data, not more threshold tweaking on the same metrics.
- the freeze/skeleton helper preserves existing `expectedPartKey`, `note`, and
  `role` while refreshing crop hashes from the current report
- June 23, 2026 app-promotion correction: the previous near-match gate ignored
  exported `role: "excluded"` singleton rows. Re-scoring the packaged
  `0.1.0-alpha.13` config with excluded rows counted as hard singleton
  negatives gives 1217/1322 active expected pairs matched, 110 false groups,
  105 missed, and 0 crop drift. App-visible near groups were disabled until a
  replacement scorer reached 0 false groups under this stricter gate.
- June 24, 2026 app-visible scorer reset, superseded later the same day: the
  packaged default scorer is replaced with a fresh conservative decision tree
  plus one generic hard veto for low-luma-correlation, loose-left-profile pairs.
  The stricter gate gives 272/1322 active expected pairs matched, 0 false
  groups, 1050 missed, and 0 crop drift; pair score is 299 same-label pairs
  matched, 1023 missed, and 0 hard-negative false-positive pairs. This favors
  visible but sparse grouping over unsafe recall.
- June 24, 2026 Ramp relabel pass: broad `01-castle-ramp` relabeling showed the
  conservative app scorer was missing many same-part pairs because the packaged
  evidence lanes were much tighter than the labeled scale/crop drift. The
  analysis/training gate now treats `role: "excluded"` rows as singleton hard
  negatives against unlabeled same-bag rows as well as labeled rows, preventing
  a scorer from passing pair-level labels while grouping an excluded crop with
  an unlabeled row. The promoted packaged scorer adds zero-negative evidence and
  supplemental lanes from the Ramp relabel plus reviewed pair decisions:
  active-label group score is 526/1322 expected pairs matched, 0 false groups,
  796 missed, and 0 crop drift; pair score is 621 same-label pairs matched,
  701 missed, and 0 hard-negative false-positive pairs. Ramp itself improves
  from 12/84 to 28/84 expected pairs matched with 0 false groups, while all 20
  newly reviewed Ramp `different` decisions remain safe.
- June 24, 2026 Ramp miss-queue pass: a focused Ramp missed-same queue confirmed
  47 already-labeled same pairs, so the failure was not missing labels. The
  scorer needed more translation-tolerant evidence and the trainer needed to
  preserve existing supplemental rules when learning residual rules from a safe
  base scorer. The part matcher now exposes wide-shift pair features and the
  trainer merges base evidence/supplemental rules instead of replacing them.
  The promoted packaged scorer reaches 540/1322 active expected pairs matched,
  0 false groups, 782 missed, and 0 crop drift; pair score is 642 same-label
  pairs matched, 680 missed, and 0 hard-negative false-positive pairs. Ramp
  itself moves from 28/84 to 29/84 expected pairs with 0 false groups; this is
  a safe but small lift, so remaining Ramp misses likely need stronger
  scale/pose-normalized image features rather than more broad relabeling.
- June 24, 2026 alignment-feature pass: the part matcher adds low-resolution
  scale/translation alignment features (`aligned*` and `alignment*`) on top of
  the wide-shift features so rule training can compare shape after coarse crop
  drift correction. The promoted packaged scorer reaches 555/1322 active
  expected pairs matched, 0 false groups, 767 missed, and 0 crop drift; pair
  score is 661 same-label pairs matched, 661 missed, and 0 hard-negative
  false-positive pairs. Ramp remains 29/84 with 0 false groups and 2/47 focused
  missed-same decisions recovered, which means Ramp's remaining failures need a
  stronger matcher family or targeted hard-negative review, not broad relabeling.
- June 24, 2026 contour/chamfer feature probe: `@bag-it/part-matching`
  `0.1.0-alpha.15` adds boundary-weighted alpha chamfer pair features plus lazy
  scorer feature extraction, and `train:part-match-scorer` can restrict evidence
  search with `--evidence-feature-names`. A Ramp-only chamfer probe improves
  `01-castle-ramp` from 29/84 to 51/84 expected pairs with 0 Ramp false groups,
  but the same candidate creates false groups in `02-middle-wall`,
  `03-lower-courtyard`, and `04-bakery`. It is rejected and not packaged as an
  app-visible scorer. The next safe path is not another broad Ramp relabel; it
  is a full-negative verifier/rule search that keeps these cross-manual
  hard-negative failures in the training loop.
- June 24, 2026 app-visible near-match rollback: live app review found false
  positive same-part groups on labeled Ramp data after the deterministic scorer
  passed private pair gates. This invalidates deterministic near matching as an
  MVP app authority. The app reverts to exact-digest same-part groups only.
  Deterministic scorer configs remain private candidate-generation and analysis
  tooling. A future ML pair scorer may be tried privately, but no near matcher
  may return to app output without a new zero-false-positive promotion decision.
- June 24, 2026 private tabular-ML probe: a temporary TypeScript lab trained
  decision-tree pair scorers from existing labels and reviewed decisions. A
  weighted decision tree reached 463/1320 active expected pairs with 0 false
  groups on the training manuals, but failed leave-one-manual-out holdout with
  false positives. Support-guarded trees reduced overfit but still produced
  holdout false positives while dropping to 309/1320 training groups. The
  temporary lab code was removed after the result was recorded. Tabular
  visual-feature trees are rejected as an app-visible MVP path; next viable ML
  work needs an image-embedding prototype with explicit holdout safety, not
  more deterministic threshold tuning or broad relabeling.
- June 26, 2026 final all-label GPU pair-head probe: a MobileNetV3 Large pair
  head was trained from the calibrated full-447 MostWiedzy checkpoint on all
  active manual labels and reviewed decisions under
  `.bag-it/private/part-match-reports/embedding-experiments/gpu-manual-pair-head-all-labels-v1/`.
  Raw pair-head scoring remained too weak at `124/1335` positives and `0`
  false positives. Corrected feature fusion recovered an auto-safe lane of
  `220/1333` positives with `0` false pairs, `0` false groups, and `0/263`
  wrong grouped rows. Its reviewed-suggestion lane recovered `812/1333`
  positives with `4/847` wrong grouped rows (`0.472%` row correction burden),
  but also `5` false groups and pair/group correction diagnostics above the
  budget. This is not promotable to silent app grouping. It may justify a
  separate suggested-groups UI only after fast reject/split controls and scorer
  runtime/export are solved.
- June 26, 2026 runtime scorer export check: `@bag-it/part-matching`
  `0.1.0-alpha.10` adds derived `baseMatched` and `baseProbability` pair
  features so the feature-fusion model can be exported as a pure package
  scorer config without ONNX/CNN runtime. `lab:part-match-runtime-score`
  replays a package scorer config over labeled pair sets and writes
  package-runtime scores back to `pairs.json`, removing the previous ad-hoc
  replay script. Export tooling wrote configs under
  `.bag-it/private/part-match-reports/embedding-experiments/gpu-manual-pair-head-all-labels-runtime-export-v2/`.
  Runtime scoring exposed a gap in the lab result: the lab lane had assigned
  `0` to non-candidate pairs before fusion, while the package scorer scores
  every pair. Recalibrating lanes on runtime scorer output gives an auto-safe
  score-threshold lane of `179/1335` recovered positives, `0` false pairs,
  `0` false groups, and `0/211` wrong grouped rows. The reviewed-suggestion
  runtime lane recovers `220/1335` positives with `1` false group and `1/265`
  wrong grouped rows (`0.377%` row correction burden). This is safer and
  shippable as private scorer data, but recall is still too weak for the
  current MVP grouping need.
- June 26, 2026 focused-label GPU retry: a queue of `132` near-threshold
  reviewed decisions was added to the manual-crop manifest and retrained on
  `argonath` from the same calibrated full-447 MobileNetV3 Large checkpoint.
  Raw pair-head scoring improved only slightly to `129/1347` safe positives.
  Lab-only feature fusion looked stronger, but package grouping remained the
  gate. Runtime-calibrated auto grouping recovered `137/1322` active expected
  pairs with `0` false groups and `0/202` wrong rows. Runtime-calibrated
  suggested grouping recovered `495/1322` pairs but had `5/671` wrong rows,
  above the `<0.5%` budget. A stricter `0.98` threshold passed the row budget
  at `355/1322` with `2/495` wrong rows, but that was weaker than the existing
  package-compatible suggested baseline of `374/1322` with `2/525` wrong rows.
  Mining actual package false groups then found a package `vetoRules` clause
  over `baseProbability` and `projectionDistance`. The promoted source
  suggested config recovered `476/1322` active expected pairs with `0` false
  groups and `0/645` wrong rows, while auto grouping remains unchanged and
  zero-false-positive. This replaces the previous suggested scorer baseline.
- June 27, 2026 aggressive package calibration: a private package replay sweep
  lowered the promoted suggested threshold and mined extra package-level veto
  rules from actual grouped false memberships. Independent source-config replay
  recovered `788/1322` active expected pairs with `5` false groups and `5/1023`
  wrong grouped rows (`0.489%` row correction burden), while auto grouping
  remains unchanged at `134/1322` with `0/201` wrong rows. This replaces the
  previous suggested scorer baseline but still misses the requested `95%`
  real-pair coverage target by a wide margin.
- June 27, 2026 connected suggested grouping: the package scorer now supports
  an opt-in `connected-components` grouping strategy. The suggested scorer uses
  it with connected false-bridge vetoes, while auto grouping keeps the default
  pairwise-clique strategy. Source-config replay recovered `1112/1322` active
  expected pairs with `4` false groups and `4/1117` wrong grouped rows
  (`0.358%` row correction burden). Auto replay remains `134/1322` with
  `0/201` wrong rows. Private label-oracle ranked-union over the current
  scorer family reached only `1155/1322` under budget, so the remaining `95%`
  gap needs stronger model or feature signal.
- June 27, 2026 95% calibration push: package-only decision-tree replacement
  reached `1154/1322` active expected pairs with `5/1163` wrong grouped rows
  (`0.430%`) and is promoted as the current suggested scorer. Cached raw CNN
  scoring from the hard-negative pair head can recover near-target coverage,
  but actual package grouping exceeds the correction budget: the v1 CNN floor
  recovered `1314/1322` with `20/1367` wrong rows, and the milder v4 GPU
  continuation recovered `1297/1322` with `16/1336` wrong rows at its
  zero-direct-false-pair threshold. The best in-budget v4 connected replay was
  `977/1322`; mutual top-k and clique variants stayed above the `0.5%` row
  budget at useful recall. This confirms the next blocker is bridge-aware
  grouping/runtime model integration, not more labels or basic threshold
  tuning.
- June 27, 2026 corrected CNN runtime promotion: after the user confirmed the
  seven closure false-pair diagnostics were actually same-part manual crops,
  the focused reviewed-pair truth set moved to `1354` positive pair targets and
  `78984` negative pair targets. The v4 hard-negative CNN score at floor
  `0.9961420893669128` replayed through package connected grouping recovered
  `1306/1354` reviewed real pairs (`96.5%`) with `0` false groups, `0`
  false-pair diagnostics, and `0/1304` wrong grouped rows. The scorer is
  promoted by committing browser ONNX artifacts under
  `public/models/part-matching/manual-crop-cnn-hardneg-v4-closure-fixed-v1/`,
  wiring the Bags part-grouping worker to compute `cachedPairScore` from
  runtime masked part crops, and replacing the suggested scorer config with the
  cached-score gate. Buckets above the runtime CNN cap of `96` rows keep the
  previous static suggested scorer as a responsiveness fallback. The raw `.pt`
  checkpoint and source crops remain private.

App output gate:

- the Bags tab keeps Bag/Color as the outer grouping mode
- `Group parts` is a separate Bags-only toggle
- app-visible groups use the promoted package-compatible two-lane scorer:
  exact/auto-safe groups render as normal group rows, while below-threshold
  groups render as orange review suggestions
- silent auto grouping remains blocked by any known false group or hard-negative
  false-positive row; suggested grouping remains blocked when measured wrong row
  memberships exceed `0.5%` of suggested grouped row memberships
- expandable group header rows keep every raw row individually checkable and
  restorable by the same row ids and completion anchors, and expose a group
  checkbox that toggles all hidden or expanded source rows
- each same-part group header shows a representative preview, total quantity,
  row count, confidence, and expands to all source rows inside the same table
- suggested group rows expose fast correction controls to reject the whole group
  or remove one expanded row from the group; these corrections are display-local
  and never mutate saved raw row ids
- color grouping remains unaffected by the part grouping toggle

## Bagging Gate

For fixture detector outputs and synthetic detector-result objects:

- baggable callouts stay in detected order
- no detected callout is split across bags
- no manual page is split across bags
- section cues from no-baggable scanned pages, zero-part callout pages, and
  detector `sectionBoundaryHints` may override target size only near a useful
  bag boundary or to complete the current section; they must not force one bag
  per section or override page containment or `maxParts + overfillToleranceParts`
- abnormally small bags may merge across a chosen soft section boundary only
  when the merged bag stays within `maxParts + overfillToleranceParts`
- repeated-step multipliers apply before bag balancing
- zero-baggable-callout results produce no bag plan and show an attention state
- all-review output remains explicitly marked `review`
- row ids change when multiplier-adjusted quantities change
- checked completion transfers by coordinate anchor after a detector-version
  rerun when exactly one new row matches
- ambiguous coordinate-anchor matches are dropped and surfaced in a compact
  notice

## UI Readiness Gate

The retained UI is ready when tests cover:

- upload action disabled until a PDF is selected
- upload, purge, retry, and failed/expired states
- session download disabled while processing
- stale session shows a rerun/recalculate state
- no-callouts and no-baggable-callouts states
- Build steps page groups and preview batching
- Build steps part rows use a sortable table with `Quantity`, `Part image`, and
  `Color` columns; the quantity cell shows the parsed value/text with the
  quantity-label crop below it, and crop previews use the shared hover/focus
  zoom component
- restored sessions with current callouts but missing part extraction rerun only
  part extraction and show part-image progress
- the analysis progress card is always visible and contains exactly `Scanning
  pages`, `Extracting parts`, and `Generating previews`
- scanning progress excludes part extraction, and part extraction progress owns
  processed callouts plus detected part rows
- preview hydration remains bounded after the first visible/priority previews
  unblock the Build steps output; remaining pages continue through a gradual
  background queue rather than a blocking offscreen sweep
- preview generation creates one runtime page object URL per needed page,
  renders page, callout, and quantity previews from that page asset, upgrades
  visible part rows to transparent mask object URLs, and revokes object URLs on
  purge, replacement, restore, eviction, and unmount
- preview asset store updates affect subscribed preview rows rather than
  replacing the full detector result during normal analysis
- Bags checklist bag/color grouping, sortable rows, page/step hovers,
  completion, and large-list rendering
- Same-part grouping is a Bags-mode toggle that renders exact-digest
  subsections inside existing bag accordions; the active UI must not expose a
  separate `Grouped parts` tab or app-visible near-match groups.
- long step scans emit page-level progress and do not wait for every page render
  before publishing detector progress

## CI Gate

CI initially requires shell smoke coverage. Once the first shared step-callout
fixture exists, deployed e2e must also verify:

- upload fixture PDF
- run step scan
- Build steps shows expected page groups
- Bags shows at least one draft/review bag
- changing a multiplier updates visible quantity or bag totals

After this gate is active, detector or bagging changes must not remove it.
