# 2026-06-10 Manual-Local Part Color Calibration

Status: Active.

## Decision

Part color sampling and calibration lives in workspace package
`@bag-it/part-colors`.

The public entry point is:

```ts
samplePartColor(...)
calibrateManualPartColors(...)
detectPartColorClasses(...)
```

The package samples rendered manual pixels from accepted v2 part masks, groups
rows into manual-local color classes, and assigns advisory LEGO color names from
a conservative fallback palette.

The resolver starts as a conservative shell under focused `resolver` modules:
feature extraction, sample quality, label policy, family routing, prototype
training, family resolvers, evaluation, reporting, and one orchestration module.
Runtime resolver behavior must not branch on manual ids, row ids, crop hashes,
manual titles, authors, or source paths.

Manual-local class is the primary truth:

- `manualClassId` identifies one rendered color class within one manual/session
- `manualClassHex` and `manualClassRgb` are the sampled class centroid
- `manualClassTrusted` marks rows whose sample and class stability are strong
  enough to affect prototype same-part grouping
- `swatchHex` uses the class centroid
- LEGO `name`, `family`, `distance`, and `status` are advisory labels only

## Consequences

- The v2 browser adapter runs color calibration after final part extraction and
  before publishing the final result.
- `@bag-it/part-colors` exports `PART_COLOR_CALIBRATION_VERSION`; app results
  persist that version and rerun the part extraction/color calibration pass
  when restored sessions are missing or stale.
- Calibration inputs are sorted by stable part row id before clustering. Worker
  page completion order must not affect manual-local class assignment or
  app/report parity.
- The browser part-extraction worker reports its own part-extractor and
  part-color calibration versions. The app rejects mismatched worker output and
  retries once with a fresh worker pool before failing.
- `DetectedStepCalloutPartItem.detectedColor` now carries manual class metadata.
- Build steps and Bags keep their existing color UI; no tuning UI is added in
  this slice.
- Same-part visual grouping requires matching `manualClassId` only when both
  rows have `manualClassTrusted`. Missing or untrusted classes keep the
  conservative family/name fallback.
- Private tuning uses ignored reports under
  `.bag-it/private/part-color-reports/**`.
- Private tuning labels live under ignored
  `.bag-it/private/part-color-reports/labels/**`. Each label file names a
  manual, its accepted report, a compatibility top-level status, expected row
  display colors, and optional per-row roles. Labels may include an optional
  crop hash when the row preview has been accepted against the current report.
  Top-level `status: "gate"` defaults row roles to `gate`; top-level
  `status: "active"` defaults row roles to `active`. Row roles are `gate`,
  `train`, `holdout`, `active`, and `excluded`.
- `gate` and `train` labels may enter private trainable datasets only when
  current, conflict-free, and visually clear. `holdout` and `active` labels
  score only. `excluded` labels remain visible but are ignored by training and
  scoring totals.
- Private tuning reports must default to saved app `detectedColor` assignments
  so app and report color groups have parity. Optional renderer-recomputed
  reports may be generated only as drift diagnostics. Reports show visible
  part-mask previews, top color chips, sample/rejection counts, manual class
  summaries, rows assigned to each manual class, review rows, unknown rows, and
  saved vs current part/color version metadata. When a matching private label
  file exists, reports also show expected color, match/mismatch state, notes,
  row crop drift when a crop hash changes, label conflicts when identical crop
  evidence has contradictory expected colors, and an annotated mismatch section
  before class tables. Matched rows hide label notes so stale review comments
  are not presented as current tuning work.
- Each private tuning report writes a generated label workbench app at
  `.bag-it/private/part-color-reports/<manual>/index.html`. The app shell uses
  adjacent static assets (`workbench-data.js`, `workbench.js`, and
  `workbench.css`) and never recomputes colors for labeling. It uses the
  report's saved app `detectedColor` data only, exposes visual row controls,
  filters unknown/review/close-pair/conflict/mismatch rows, and exports label
  JSON by copy or download. Detailed audit tables live in `details.html`. Stale
  or non-app-parity reports display a warning and block training export.
- `npm run report:part-color-training` reads private reports and labels to
  summarize manual scores, family scores, close-pair confusions, dirty-label
  rejections, and trainable counts by manual/role. The command is training
  evidence only; it must not change runtime resolver behavior.
- Color tuning changes must be judged against label scores before threshold
  changes are accepted. Castle Ramp and Middle Wall now provide training
  evidence rather than strict `100%` gates until the aggregate resolver reaches
  that target. Bakery is the first external training source; Lower Courtyard
  and Farmhouse remain score-only holdouts. 4th Stage is the next unseen
  holdout and must stay score-only until later promotion is explicitly chosen.
- Color tuning must not use stale saved reports. A saved-app report with a
  stale part-color calibration version is rejected by the label evaluator unless
  the report is explicitly marked as a renderer-recomputed diagnostic from the
  current code. If an active label set contains un-hashed labels whose crop
  evidence no longer matches the expected color, tuning pauses until those
  labels are re-anchored or corrected.
- Calibration code is organized as small, focused modules. Runtime advisory
  naming may use committed aggregate prototype constants, but those constants
  may contain only centroid/support data and must be produced from current,
  conflict-free train labels. Row-level exemplar/KNN models, manual-specific
  branching, crop-hash overrides, and source metadata conditionals remain
  rejected for committed runtime.
- Near-black selected samples may use same-row neutral body-chip evidence before
  advisory naming when body coverage clearly exceeds black/dark support and the
  near-black chip is not strongly blue-biased. This is a feature-level
  correction for outline/shadow pollution, not a manual-specific override.
- Warm, medium-light, low-chroma neutral samples whose advisory name would
  otherwise be Light Bluish Gray may resolve to Flat Silver through a narrow
  feature-evidence rule. The rule uses only sampled LCh/body evidence and must
  preserve the no-manual-regression private label gate.
  The initial rule moved private runtime evaluation from `5918/6262` to
  `5929/6262` with no manual worsening.
- Near-black selected samples whose same-row chips contain strong low-luma
  green body evidence may resolve advisory Black to Green. The rule uses only
  sampled chip coverage/LCh evidence, not manual ids or row ids. The initial
  rule moved refreshed private runtime evaluation from `5922/6263` to
  `5925/6263`, improving Bakery, Fountain, and Hall Tower by one row each with
  no manual or row worsening.
- Edge-polluted dark-tan samples whose advisory name would otherwise be Dark
  Bluish Gray may resolve to Dark Tan only when the top sampled chips contain
  a close Dark Tan anchor chip plus broad low-chroma dark-tan body evidence,
  while saturated Tan/Yellow and olive-gray chip guards stay below their
  limits. The rule exists because private recheck showed many thin dark-tan
  rows were sampled from outlines or shadows at the part edge. It uses only
  same-row LCh/chip coverage evidence, not manual ids, row ids, crop hashes, or
  source metadata. The initial rule moved corrected private runtime/report
  parity to `5947/6263`, a `+31` improvement over the previous saved reports
  after recheck labels, with zero row worsening in the row-level comparison.
- Edge-shadowed light-neutral samples whose advisory name would otherwise be
  Dark Bluish Gray may resolve to Light Bluish Gray only when rejected edge
  chips contain strong light-neutral evidence, accepted top chips retain visible
  light-neutral support, and the accepted body is mostly medium neutral rather
  than dark or near-black. This targets thin/small rows where sampling still
  selected a darker edge or shadow, while avoiding broad Light Bluish Gray vs
  Dark Bluish Gray collapse. The initial rule moved refreshed private
  runtime/report parity to `5953/6263`, a `+6` improvement over alpha16, with
  zero row worsening in the row-level comparison.
- The alpha18 follow-up keeps the same Light Bluish Gray edge-evidence rule
  but restricts the widened path to tiny samples with at most `60` accepted
  pixels. For those rows, the rule may read all accepted sample chips rather
  than only the first five chips, because the useful light-neutral body evidence
  can be spread across small shadowed crops. The refreshed private
  runtime/report parity moved from `5953/6263` to `5961/6263`, a `+8`
  improvement with zero row worsening.
- Rejected bright-background evidence may resolve advisory Black, Dark Bluish
  Gray, or Flat Silver to White only when the current same-row sample shows the
  corresponding feature guard: Black requires bright neutral edge support, Dark
  Bluish Gray requires dark body coverage plus a bright edge, and Flat Silver
  requires high background rejection. Light Bluish Gray stays excluded from this
  rule because private labels show too many true LBG rows with similar
  high-background rejection. The alpha19 rule moved private runtime evaluation
  from `5961/6263` to `5970/6263`, a `+9` improvement with zero row worsening.
- The alpha20 follow-up adds two narrower Light Bluish Gray exits after private
  neutral recheck labels showed a small set of edge-dominated rows. Light
  Bluish Gray may resolve to White only with high rejected background, high edge
  rejection, bright edge support, bounded sample pixels, and dark sampled
  coverage. Light Bluish Gray may resolve to Black only when accepted chips are
  medium-dark neutral, bright accepted support is low, rejected-edge coverage is
  high, and near-black edge evidence is strong. The refreshed private runtime
  evaluation moved from `5974/6261` saved-report matches to `5978/6261`, with
  no scored manual worsening.
- The alpha21 follow-up keeps Light Bluish Gray to White narrow but admits
  tiny/high-background rows where accepted chips are mostly dark edge/shadow
  evidence and rejected-background pixels likely represent the white body. The
  guard still requires bounded sample pixels, high rejected-background ratio,
  dark accepted coverage, and either high edge rejection or bright neutral edge
  support. A real Light Bluish Gray high-background control remains protected
  by focused tests. Refreshed private runtime/report parity is `5993/6265`,
  improving alpha20 reports by `+6` with no scored manual worsening.
- The alpha22 follow-up narrows a missed warm-body representative-selection
  boundary: a near-black selected sample may use a single warm body chip at
  `36%` coverage instead of `40%`, while the total warm-coverage and
  near-black-margin guard stay unchanged. This targets edge-shadowed brown
  rows where the visible part body is warm but the selected sample pixel is a
  black shadow. Refreshed private runtime/report parity is `5995/6265`,
  improving alpha21 reports by `+2` with no scored manual worsening.
- The alpha23 follow-up handles saturated transparent primary colors where
  tiny parts are dominated by edge/background rejection. Red may resolve to
  Trans-Red, and Blue or Dark Purple may resolve to Trans-Dark Blue, only when
  the same-row accepted chips and retained edge chips both show high saturated
  color coverage, the crop is small, and background/edge rejection is high.
  This stays feature-only and rejects manual ids, row ids, crop hashes, and
  source metadata. Private runtime evaluation moves from `5995/6259` to
  `6004/6259`, improving Hall Tower by `+9` with no manual worsening.
- The alpha26 neutral follow-up keeps the same feature-only rule boundary but
  adds three narrow exits for edge-polluted neutral rows. Light Bluish Gray may
  resolve to White when high background and edge rejection are paired with
  bounded tiny samples and strong light-neutral edge evidence rather than
  bright-white edge evidence. Dark Bluish Gray may resolve to Light Bluish Gray
  for bounded tiny samples just below the regular light-neutral edge thresholds.
  Light Bluish Gray may resolve to Black through the black-edge module when
  accepted chips contain strong near-black support plus retained dark edge
  evidence; the near-black path has its own bright-neutral guard so the general
  black-edge rule stays narrower. Refreshed private runtime/report parity moves
  from `6004/6259` to `6012/6259`, with no scored manual worsening.
- The alpha27 neutral follow-up adds one more Light Bluish Gray to White path
  for confirmed white-body rows where background rejection is high and accepted
  pixels mostly represent dark outline/edge strokes rather than body fill. The
  path is bounded by accepted pixel count, dark accepted coverage, and a low
  bright-edge guard so it does not broaden general Light Bluish Gray handling.
  After corrected neutral labels and the bad Hall Tower white control fix,
  refreshed private runtime/report parity is `6017/6253`, reducing mismatches
  from `242` to `236`, with no scored manual worsening.
- The alpha28 warm-neutral follow-up adds a narrow Medium Nougat rescue for
  edge-heavy rows currently named Orange or Dark Orange. The rule requires
  high edge rejection, low background rejection, visible muted-warm body chips,
  bounded saturated-warm coverage, and bounded dark coverage. This targets
  small/shadowed Medium Nougat parts where the accepted sample skews orange,
  without creating broad Orange-to-Medium-Nougat remapping and without using
  manual ids, row ids, crop hashes, or source metadata. Refreshed private
  runtime/report parity is `6021/6253`, reducing mismatches from `236` to
  `232`, with no scored manual worsening.
- The alpha29 Dark Tan follow-up relaxes the Dark Tan body rule for thin
  shadowed parts that contain one close Dark Tan anchor chip plus broad muted
  dark-tan body coverage. It tightens saturated-warm and olive-gray guards at
  the same time, so the rule does not become generic Dark Bluish Gray-to-Dark
  Tan remapping. Refreshed private runtime/report parity is `6027/6253`,
  reducing mismatches from `232` to `226`, with no scored manual worsening.
- The alpha30 Pearl Gold follow-up adds an accepted-chip body evidence rule for
  rows currently named Dark Brown. It requires broad gold-hue coverage across
  all accepted chips, visible bright-gold support, bounded dark coverage, and
  bounded red coverage. This targets edge-heavy metallic gold rows where the
  dominant chip is dark brown shadow, without turning general dark-brown or
  reddish-brown rows into Pearl Gold. Refreshed private runtime/report parity
  is `6031/6253`, reducing mismatches from `226` to `222`, with no scored
  manual worsening.
- The alpha46 Medium Nougat follow-up widens only the Dark Orange-source edge
  path for diffuse samples with moderate background rejection. It keeps the
  existing Orange-source gate unchanged and adds a dominant-chip guard so true
  strong Dark Orange rows do not flip to Medium Nougat. Saved private runtime
  evaluation moves from `6070/6248` to `6073/6248`, reducing mismatches from
  `178` to `175`, with no row-level worsening.
- The alpha47 Tan follow-up adds a separate Tan body evidence module instead
  of broadening Dark Tan logic. It targets rows currently named Dark Bluish
  Gray only when high edge rejection is paired with broad tan-chip coverage,
  visible light-tan support, bounded background rejection, and low
  saturated-warm coverage. Saved private runtime evaluation moves from
  `6073/6248` to `6076/6248`, reducing mismatches from `175` to `172`, with
  no row-level worsening.
- The alpha48 neutral follow-up adds a high-edge top-chip path to the existing
  Light Bluish Gray edge-evidence module. It still targets only rows currently
  named Dark Bluish Gray, and it adds a background guard so high-background
  transparent-blue rows are not pulled into Light Bluish Gray. Saved private
  runtime evaluation moves from `6076/6248` to `6078/6248`, reducing
  mismatches from `172` to `170`, with no row-level worsening.
- The alpha49 weak-sample follow-up adds a `weak-classifiable` sample status.
  Rows with usable color pixels that are too tiny, edge-heavy, or unstable for
  trust can now keep an advisory color instead of becoming missing/unknown.
  Weak samples remain review/untrusted and are rejected from trainable
  datasets. Regenerated private report parity removes all `21` missing rows
  and moves saved runtime/report parity to `6094/6248`, with no row-level
  worsening.
- The alpha50 neutral follow-up adds a source-specific White rescue for rows
  currently named Light Bluish Gray when moderate background rejection,
  bounded light-edge evidence, bounded dominance, and enough dark-edge support
  indicate a small white body overwhelmed by outline/shadow pixels. It improves
  private parity to `6097/6248`, with no manual or row-level worsening.
- The alpha51 warm follow-up adds a narrow Trans-Orange-source path to the
  existing Medium Nougat edge-evidence module. The rule requires repeated
  Medium Nougat-like muted warm body coverage, enough orange edge support,
  bounded background/dark/saturated-warm coverage, and review-grade pixel
  counts. It improves private parity to `6102/6248`, reducing mismatches to
  `146`, while keeping runtime and regenerated saved-app reports at zero delta
  and preserving zero row-level worsening.
- The alpha52-alpha54 follow-ups add only source-specific feature evidence for
  repeated rows: undersampled White from Light Bluish Gray, tiny near-black
  Black from edge evidence, dark-neutral body correction from Light Bluish Gray
  to Dark Bluish Gray, tiny Pearl Gold-source Trans-Orange, and edge-heavy
  Pearl Dark Gray metal evidence. These rules are isolated modules, use only
  same-row sample/rejection features, and keep the no-manual-id/no-row-id
  runtime boundary. Refreshed private report parity reaches `6116/6248` with no
  runtime/report delta and zero row-level worsening.
- The alpha55 and alpha56 transparent-blue follow-ups add a dedicated
  Trans-Light Blue evidence module. Dark Bluish Gray-source rows require tiny
  high-background/high-edge samples with broad cyan-glass coverage and little
  dark core. Black-source rows use a separate guard requiring a tiny
  high-background/high-edge sample, strong near-black core, and visible
  cyan-glass fringe. Refreshed private report parity reaches `6122/6248`, and
  the remaining unsafe Trans-Clear and White-like glass rows stay unchanged.
- The alpha57 yellow follow-up adds an opaque Yellow body evidence module for
  tiny edge-heavy rows currently named Dark Bluish Gray or Dark Orange. It is
  intentionally separate from transparent-yellow evidence, so Trans-Yellow and
  Pearl Gold candidates are not rewritten to opaque Yellow. Refreshed private
  report parity reaches `6125/6248` (`98.03%`), reducing mismatches to `123`
  with zero runtime/report delta, no stale saved-app reports, no label
  conflicts, and zero row-level worsening.
- The alpha58 transparent follow-up adds source-specific glass evidence for
  repeated transparent misses only. Flat Silver may resolve to Trans-Brown
  when neutral accepted chips pair with cyan-glass edge rejection; Dark Blue
  and Sand Blue may resolve to Trans-Dark Blue under separate blue/dark/edge
  guards; Light Bluish Gray may resolve to Trans-Light Blue only in a
  high-background cyan-glass path; Tan may resolve to Trans-Yellow only with
  strong yellow body and edge evidence; Reddish Brown may resolve to
  Trans-Orange only with bounded dark/red coverage. Trans-Clear intentionally
  remains unforced because current rows overlap White and Light Bluish Gray
  evidence. Refreshed private report parity reaches `6133/6248` (`98.16%`),
  reducing mismatches to `115`, with zero runtime/report delta and zero
  row-level worsening.

## Non-Goals

- No BOM/parts-list detection in this slice.
- No BOM quantities, part ids, inventory reconciliation, Rebrickable matching,
  catalogue normalization, or BOM UI.
- No claim that advisory LEGO color names match real bricks. The calibration
  target is the manual render, not physical inventory.

## Future Work

BOM or parts-list pages may later provide calibration evidence for naming
manual-local classes when those pages exist in the uploaded manual. That future
work must stay behind a calibration-only boundary unless the wiki explicitly
reintroduces inventory scope.
