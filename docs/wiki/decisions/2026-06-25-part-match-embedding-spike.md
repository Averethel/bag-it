# Part Match Embedding Spike

## Status

Accepted.

## Context

Same-part near grouping still has five days before MVP wrap-up. Exact digest
groups are safe but sparse because manual rendering and crop extraction rarely
produce byte-identical part images.

Two prior matcher families are not app-safe:

- deterministic visual features reached high private-label recall but produced
  app-visible false positives after `role: "excluded"` singleton rows and real
  Ramp review were considered
- temporary tabular ML over handcrafted pair features overfit training manuals:
  weighted trees reached 463/1320 active expected pairs with 0 training false
  groups, but failed leave-one-manual-out holdout with false positives

False positives are more harmful than misses because they can put wrong parts
in a physical bag. Any remaining experiment must preserve that product rule.

## Decision

Run one private image-embedding spike. Do not tune more deterministic thresholds
or tabular feature trees.

The spike compares actual part crop pixels, not only handcrafted pair metrics.
It should start with a frozen pretrained vision embedding model and train only
small local calibration on existing labels. The first implementation is private
Node tooling, not app runtime. Browser/runtime integration is considered only
after holdout safety is proven.

Candidate runtime choices:

- `@huggingface/transformers` / Transformers.js for a fast private prototype
  with image-feature-extraction models and ONNX-backed execution
- direct ONNX Runtime Web/Node only if Transformers.js blocks required image
  embedding access or local caching

## Five-Day Plan

Day 1:

- build ignored embedding cache under
  `.bag-it/private/part-match-reports/embedding-experiments/**`
- extract normalized crop variants from existing private reports: original
  crop, alpha-masked crop on neutral background, tight alpha crop, and optional
  silhouette-only image
- run one frozen embedding model and write per-row vectors plus metadata

Day 1 result:

- implemented `lab:part-match-embeddings` as private TypeScript tooling with
  `@huggingface/transformers`
- smoke run on `07-fountain` produced 118 row caches and 472 normalized
  512-dimensional vectors, then reused all 472 vectors on a repeat run
- no app behavior changed and no pair scorer was promoted

Day 2:

- create pair scorer over embeddings: cosine distance, crop variant distances,
  same-bag/different-callout/color gates, and strict excluded-row negatives
- evaluate training labels, reviewed decisions, and leave-one-manual-out
  holdout
- use the current two-lane promotion rule: zero known false positives for
  silent auto grouping, and a separate reviewed suggestion lane only when
  measured correction burden stays below `0.5%`

Day 2 result:

- implemented `lab:part-match-embedding-score` as private TypeScript tooling
- full active-label cache produced 25,224 vectors; with labels, latest
  consolidated reviewed decisions, and package color compatibility gating, pair
  scorer matched `145/1320` positives with zero training false positives and
  zero hard-negative false positives, skipping one conflicting stale decision
  target
- leave-one-manual-out found `1` false positive, so raw frozen embeddings plus
  mean-cosine threshold are not app/package promotable
- score-mode sweep found no safe selector: all tested modes kept zero training
  false positives but still produced at least one leave-one-manual-out false
  positive
- score diagnostics gained per-pair Same/Different/Not sure buttons and JSON
  export because browser annotation markers were too slow for dangerous pair
  review
- after importing the first 46 unique reviewed dangerous negatives, explicit
  decisions overrode stale generated excluded-row negatives for 15 pairs and
  training recall rose to `189/1333` with zero training false positives, but
  holdout false positives rose to `4`; this confirms label cleanup helps the
  dataset but does not make the current CLIP threshold scorer promotable

Day 3:

- try minimal calibration only if raw embeddings have promising separation:
  threshold search, logistic calibration over embedding distances, and
  per-crop-variant voting
- generate review pages only for high-confidence false positives or ambiguous
  zones, not broad relabeling
- pivot to catalogue-retrieval architecture if pair thresholds stay flat:
  compare manual crops against rendered catalogue candidates, then group rows by
  high-confidence shared catalogue identity rather than direct crop-to-crop
  similarity

Day 3 catalogue-retrieval result:

- implemented private `lab:part-match-catalogue-retrieval` diagnostic tooling
  with a `label-exemplars` mode. This uses labeled manual crops as stand-ins for
  catalogue renders so retrieval mechanics can be tested before real
  LDraw/Studio render ingestion exists.
- `label-exemplars` with `rendered-tight-min` on the full active embedding
  cache reached `1356/1745` top-1 correct rows, but wrong top-1 matches reached
  score `1.0`, so a zero-error threshold accepted `0/1745`.
- `label-exemplars` with `mean` improved raw retrieval to `1414/1745` top-1
  correct rows, but still had high-scoring wrong matches and `0/1745` safe
  recall. Current frozen CLIP embeddings are not sufficient for catalogue
  identity either; real catalogue renders may still be useful only with stronger
  LEGO-specific embedding/features or supervised calibration.
- existing repository LDraw usage was only synthetic fixture geometry, not full
  LDraw ingestion. A private `lab:part-match-ldraw-render` probe now reads real
  Studio/LDraw `.dat` parts, recursively resolves subfiles/primitives, projects
  neutral SVG views, and writes an ignored contact sheet. This is a render-path
  probe for LEGO-specific catalogue training data; it is not app behavior and
  not yet an embedding source.
- The SVG projection probe is not visually faithful enough for catalogue
  embeddings because it lacks the real LDraw renderer's BFC handling, normal
  smoothing, material/edge treatment, and camera rasterization. A follow-up
  private `lab:part-match-ldraw-three-render` probe uses Three.js
  `LDrawLoader` with local Studio LDraw files and headless Chromium WebGL to
  produce PNGs. This is the viable render source for LEGO-specific embedding
  experiments.

Day 4:

- if holdout is 0 false positive, integrate as private report candidate
  generation behind an explicit `--embedding-scorer` option
- if holdout has any false positive, stop promotion and document miss/false
  buckets

Day 4 catalogue-render PoC result:

- implemented private `lab:part-match-catalogue-poc`. It renders common real
  LDraw parts with the Three/LDraw path, writes a synthetic private part-match
  report plus labels where `expectedPartKey` is the LDraw part id, embeds those
  rendered views with the existing frozen model, and evaluates catalogue
  retrieval with the existing retrieval scorer.
- the PoC is useful because it removes manual-crop noise. If frozen CLIP cannot
  recover same part ids across clean catalogue render views, it is not a viable
  app matcher by itself.
- a 14-part hard smoke reached `23/42` top-1, `29/42` top-K, and `6/42`
  zero-error safe rows. A broader pass rendered 35 parts, skipped local part
  `3665` because Studio's library referenced missing `3665a.dat`, and reached
  only `42/105` top-1, `68/105` top-K, and `0/105` safe rows.
- conclusion: the catalogue render/cache/scoring infrastructure works, but
  frozen CLIP embeddings remain too weak even on clean LDraw renders. This path
  still has a chance only if the next step uses LEGO-specific supervision, such
  as synthetic LDraw view pairs and hard-negative training/reranking. Current
  vectors should not be integrated into app or package matching.

Day 5:

- decide MVP path:
  - safe embedding scorer with meaningful recall: keep app exact-only but ship
    private scorer docs/report flow, then consider app promotion after visual
    review
  - unsafe or weak embedding scorer: same-part near grouping stays out of MVP;
    app ships exact-only grouping

Day 5 supervised catalogue result:

- transparent Three/LDraw rendering is now required for catalogue experiments.
  The earlier opaque renderer made alpha-derived variants degenerate because
  every silhouette was effectively the full canvas.
- same-view synthetic augmentations are the useful supervised setup for the
  first reranker. Cross-view pairs made top/iso renders of the same part into
  positives, which is too hard for this small linear scorer and not the same
  problem as catalogue lookup. Catalogue lookup can compare a manual crop
  against several rendered catalogue views and take the best view later.
- with transparent renders, frozen retrieval on 35 catalogue parts improved to
  `54/105` top-1 and `72/105` top-K, still `0/105` safe. With three same-view
  augmentations per rendered view, frozen retrieval reached `225/315` top-1 and
  `314/315` top-K, proving the catalogue render/cache path can generate useful
  candidates.
- the first supervised linear LEGO reranker is safe but too weak. Same-view
  fold holdout matched only `5/315` positives with `0` false positives. The
  global zero-false-positive threshold matched `0/315` positives because
  high-scoring different-part pairs exceeded every positive score; diagnostics
  found `13` blocking negatives and `9` exact duplicate negative feature pairs.
- conclusion: this is not ready for app or package promotion. Current best use
  of LDraw/catalogue data is candidate generation plus a future stronger
  model/objective, not direct same-part auto-grouping in the five-day MVP
  window.

Day 5 semantic attribute spike result:

- implemented private `lab:part-match-attribute-spike`. It reads the ignored
  LDraw catalogue embedding cache, derives LEGO-ish labels from local LDraw
  titles, and evaluates held-out part ids for category, footprint, height band,
  modifier, and combined signature. The command is a diagnostic only; it does
  not change app or package matching.
- a first closed-class centroid pass was invalid for the real objective because
  held-out parts may have unseen footprints. The corrected pass predicts
  category/height/modifier by nearest neighbors and footprint by numeric
  neighbor regression, with an optional combined feature vector across all four
  crop variants.
- best run so far is still blocked: rendered-only vectors reached `37/315`
  full signatures and `166/315` categories; combined rendered/tight/mask/
  silhouette vectors reached `42/315` full signatures and `168/315`
  categories, with more than one thousand predicted-signature collision pairs.
- this proves the current generic CLIP feature base is the bottleneck. It can
  produce catalogue candidates, but it is not learning LEGO semantics such as
  brick vs plate vs slope or exact footprint well enough for safe automatic
  grouping. More threshold tuning on these vectors is not a good use of the
  remaining MVP window.

Day 5 LEGO-specific training-data result:

- implemented private `lab:part-match-lego-training-data`. It consumes the
  Three/LDraw render summary or renders parts on demand, writes normalized
  transparent `96x96` PNG examples, and writes `examples.json`, `pairs.json`,
  `parts.json`, `summary.json`, and an inspection page under ignored
  `.bag-it/private/part-match-reports/embedding-experiments/**`.
- examples are keyed by part id, rendered view, and augmentation index. Pairs
  are same-view only for the first trainer: positives are the same LDraw part
  under different augmentations; negatives are same-view different parts chosen
  from hard buckets such as same category, same footprint, same
  category/footprint, and nearest remaining geometry. Each example carries a
  part-id fold so the later trainer can hold out entire part ids.
- first generated dataset:
  `ldraw-lego-training-data-v1` from the transparent broad render set, focused
  on `iso-left` and `iso-right` views because those are closest to current
  manual part crops. It contains `340` examples, `680` positive pairs, and
  `1200` negative pairs with `1540` train pairs and `340` validation pairs.
  Local part `3665` stayed skipped because Studio's library references missing
  `3665a.dat`; alias part `4073` was skipped because its LDraw title is
  `~Moved to 6141`.
- BOM-backed dataset:
  `ldraw-lego-training-data-bom-v1` reads the two user-provided Rebrickable
  BOM CSVs, resolves the highest-quantity parts against local Studio/LDraw,
  and renders only `iso-left`/`iso-right` views. The input has `655` unique
  Rebrickable parts and `18,478` total non-spare quantity; `592` unique parts
  resolve to local LDraw, and the first pass selects the top `180`, covering
  `16,375` quantity. After transparent Three/LDraw rendering plus current
  title-supported attribute filtering, the dataset contains `1,140` examples
  from `114` usable parts, `2,280` same-part positives, and `4,150`
  different-part hard negatives. `178/180` selected parts rendered; remaining
  loss is mostly unsupported semantic categories such as arches, windows,
  plants, cones, brackets, and minifig accessories. This is enough for the next
  trainer spike to stop overfitting the same few parts, but it still is not
  app-visible matching behavior.
- BOM-backed reranker test:
  `ldraw-lego-training-data-bom-v1-clip-embeddings` converts the BOM-backed
  examples into a synthetic part-match report/label cache and embeds `1,140`
  rows into `4,560` CLIP vectors. The same-view linear reranker over those
  vectors remains too weak: an `800` iteration pass on `324,330` same-view
  pairs matched only `16/2280` held-out positives at zero false positives.
  Global zero-false-positive recall was `5/2280`. This says the repeatable
  training-data and embedding bridge works, but the current frozen-CLIP +
  linear reranker is not a feasible MVP grouping model. Next useful work needs
  a stronger LEGO-specific objective/model, not just more optimizer iterations
  around these frozen vectors.

Day 5 supervised CNN baseline result:

- implemented private `lab:part-match-lego-cnn`. It trains or evaluates a
  torchvision MobileNetV3-small classifier, uses the penultimate CNN features
  as unit-normalized same-part embeddings, and applies the same
  zero-training-false-positive threshold policy. A local private Python venv
  under `.bag-it/private/ml-venv` supplies PyTorch/torchvision; generated
  models and reports stay ignored under `.bag-it/private/**`.
- downloaded the public MostWiedzy LEGO classification ZIP from DOI
  [`10.34808/rcza-jy08`](https://mostwiedzy.pl/en/open-research-data/lego-bricks-for-training-classification-network,151100694911211-0)
  into ignored private storage and extracted an 80-class subset overlapping
  local BOM/LDraw-resolvable parts.
- frozen ImageNet MobileNet features on the local BOM-backed LDraw set gave
  useful signal but not safety: `154/500` validation positives with `12`
  false positives at the train-derived threshold. A 3-epoch fine-tune on that
  small local set overfit and dropped to `49/500` validation positives with
  `11` false positives.
- frozen ImageNet features on the 80-class external LEGO subset were safe only
  at weak recall: `30/378` validation positives with `1` false positive. A
  2-epoch supervised fine-tune reached `32/378` validation positives with `0`
  false positives, so the external LEGO supervision is real but still too weak
  as a direct cosine-threshold scorer.
- transfer from that external fine-tuned model to the local BOM-backed LDraw
  pair set had high recall but unsafe thresholding: external threshold matched
  `2065/2280` positives but created `446` false positives. Retuning to a local
  zero-false-positive threshold matched only `16/2280` positives. Conclusion:
  the CNN feature path has more LEGO signal than frozen CLIP, but the next
  model must train directly on same/different pair distance with hard negatives
  before any app/package promotion can be considered.

Day 5 metric-loss follow-up result:

- extended `lab:part-match-lego-cnn` with an optional contrastive metric phase
  over same/different pair manifests. Positive pairs are pulled toward cosine
  similarity `1.0`; negative pairs are pushed below a configurable similarity
  margin. The scorer still chooses a train-negative zero-false-positive
  threshold, so promotion safety policy did not change.
- iteration 1 started from the external LEGO fine-tuned checkpoint and trained
  one metric epoch on a balanced local BOM/LDraw subset of `3000` train pairs.
  It scored `50/500` validation positives with `13` false positives. This did
  not improve safety or recall versus the plain CNN baseline.
- iteration 2 used every local BOM/LDraw train pair (`4980` scored train
  pairs) for one metric epoch. It scored `43/500` validation positives with
  `11` false positives. Training every available hard negative lowered train
  negative similarity but still did not generalize to held-out part ids.
- conclusion: this specific MobileNetV3 + cosine contrastive objective has now
  had two serious iterations without meaningful improvement. It should not be
  promoted to app/package matching, and more CPU epochs in the same shape are
  not a credible path to MVP safety. The remaining ML path would need a
  different objective or model family, such as supervised classification over a
  much larger external LEGO set plus held-out manual-crop calibration, or a
  candidate-retrieval system with a stronger learned verifier.

## Gates

Before any app-visible use:

- silent auto lane: 0 false groups across active labels
- silent auto lane: 0 false positives against exported `role: "excluded"`
  singleton rows
- silent auto lane: 0 false positives across reviewed `different` decisions
- silent auto lane: 0 false positives in leave-one-manual-out holdout
- reviewed suggestion lane: less than `0.5%` measured correction burden across
  suggested groups or pair suggestions, with explicit low-confidence UI and
  fast split/reject controls
- visual app review on labeled manuals

Recall target for continuing beyond the spike:

- meaningful improvement over exact-only grouping without violating the
  auto-safe or reviewed-suggestion gate
- preferably equal or better than the conservative deterministic scorer's
  recall; auto-lane safety blocks silent grouping regardless of recall

## Consequences

This keeps the MVP safe. The embedding path gets one bounded attempt to prove
it can generalize from crop pixels. If it cannot, same-part near grouping stops
for MVP instead of consuming the remaining schedule.
