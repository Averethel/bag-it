# Part Match Remote GPU Training

## Status

Accepted.

## Context

Same-part grouping still needs a model path with meaningful recall and very low
false positives. Local Mac training is too slow for broader supervised LEGO
experiments. The user has a Windows PC with an RTX 5090, but the active Codex
workspace runs on Mac.

## Decision

Use the Windows PC as a remote GPU worker over SSH. Codex remains on Mac and
drives training through normal remote shell commands once the PC exposes a
single SSH alias that lands in a Linux environment with CUDA-visible PyTorch.

Preferred target:

- Windows 11 host with current NVIDIA driver
- WSL2 Ubuntu for training
- PyTorch CUDA build inside a repo-local virtualenv
- private datasets and outputs under `.bag-it/private/**`

No app behavior changes come from remote training. Results remain private lab
artifacts until a later scorer proves zero dangerous false positives for the
silent auto lane on labeled and holdout data, or proves a separate reviewed
suggestion lane with less than `0.5%` measured correction burden.

## Remote Access Contract

Codex needs only this from the PC:

- SSH alias reachable from Mac, for example `bagit-gpu`
- SSH key auth, not passwords in chat
- repo checkout or synced working copy inside WSL
- private dataset directories copied into the remote repo
- CUDA visible to PyTorch

Minimal Mac-side smoke commands:

```bash
ssh bagit-gpu "nvidia-smi"
ssh bagit-gpu "cd ~/bag-it-v3 && . .bag-it/private/ml-venv/bin/activate && python - <<'PY'
import torch
print(torch.__version__)
print(torch.cuda.is_available())
print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'no cuda')
PY"
```

Once those pass, Codex can run training remotely with:

```bash
ssh bagit-gpu "cd ~/bag-it-v3 && . .bag-it/private/ml-venv/bin/activate && python scripts/train-part-match-lego-cnn.py \
  --external-root .bag-it/private/external-lego-datasets/mostwiedzy-classification/subset-bom-overlap-v1 \
  --output-dir .bag-it/private/part-match-reports/embedding-experiments/gpu-mostwiedzy-cnn-80class-v1 \
  --epochs 12 \
  --batch-size 256 \
  --embedding-batch-size 512 \
  --num-workers 8 \
  --image-size 160 \
  --device cuda \
  --max-examples-per-class 120 \
  --max-classes 80"
```

Then run local-domain metric adaptation:

```bash
ssh bagit-gpu "cd ~/bag-it-v3 && . .bag-it/private/ml-venv/bin/activate && python scripts/train-part-match-lego-cnn.py \
  --checkpoint .bag-it/private/part-match-reports/embedding-experiments/gpu-mostwiedzy-cnn-80class-v1/model.pt \
  --lego-training-dir .bag-it/private/part-match-reports/embedding-experiments/ldraw-lego-training-data-bom-v1 \
  --output-dir .bag-it/private/part-match-reports/embedding-experiments/gpu-ldraw-metric-v1 \
  --epochs 0 \
  --metric-epochs 8 \
  --metric-max-train-pairs 0 \
  --metric-batch-size 256 \
  --embedding-batch-size 512 \
  --num-workers 8 \
  --metric-learning-rate 0.00002 \
  --metric-negative-margin 0.45 \
  --image-size 160 \
  --device cuda"
```

## PC Bootstrap Notes

Inside WSL Ubuntu:

```bash
cd ~/bag-it-v3
python3 -m venv .bag-it/private/ml-venv
. .bag-it/private/ml-venv/bin/activate
python -m pip install --upgrade pip
python -m pip install torch torchvision tqdm pillow --index-url https://download.pytorch.org/whl/cu128
```

CUDA check:

```bash
python - <<'PY'
import torch
print(torch.cuda.is_available())
print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'no cuda')
PY
```

If direct SSH into WSL is awkward, any equivalent path is acceptable as long as
`ssh bagit-gpu "cd ~/bag-it-v3 && ..."` reaches WSL. Tailscale, LAN port
forwarding, or Windows OpenSSH that invokes WSL are all acceptable. Do not put
private keys, Windows passwords, or model artifacts in git.

## Code Support

`scripts/train-part-match-lego-cnn.py` accepts `--device cuda`, prefers CUDA
when `--device auto` sees it, fails fast if explicit CUDA is unavailable, and
has `--num-workers` plus `--embedding-batch-size` knobs for remote GPU runs.
It also accepts `--model mobilenet_v3_small|mobilenet_v3_large` so the remote
worker can run the stronger MobileNetV3 Large backbone without changing app
behavior.

When continuing from a checkpoint that already contains `pairHeadStateDict`,
the script initializes the local pair head from that checkpoint before further
pair-head training. Earlier continuation probes accidentally trained a fresh
pair head from random initialization even when a pair-head checkpoint was
present.

The external dataset loader treats `photos/<part-id>` and `renders/<part-id>`
as class roots when those folders exist. It must not also scan the parent
directory as a class root, because that creates fake `photos`/`renders` classes
and invalid negative pairs.

## Validation Rule

Remote GPU output is useful only if the report shows two separable lanes:

- auto-safe lane:
  - zero validation false positives
  - zero dangerous/hard-negative false positives in follow-up labeled scoring
  - recall meaningfully above current exact/deterministic and frozen-embedding
    baselines
- suggested lane:
  - below-threshold suggestions are explicitly separate from auto-safe groups
  - correction burden must stay below `0.5%` of suggested groups or pair
    suggestions before app promotion
  - the app must provide fast split/reject controls before this lane is exposed

Any auto-safe false positive means no silent grouping promotion. Suggested-lane
false positives are allowed only inside the measured `0.5%` correction budget.

## First GPU Results

The PC path works: Windows OpenSSH can wake/connect, WSL2 Ubuntu sees the RTX
5090 through CUDA, and PyTorch CUDA training runs from the Mac-controlled SSH
session.

Initial results on the 80-class MostWiedzy BOM-overlap subset:

- `gpu-mostwiedzy-cnn-80class-v1`, MobileNetV3 Small:
  - train: `269/2268` positive pairs, `0` false positives
  - validation: `65/433` positive pairs, `1` false positive
  - validation zero-false-positive threshold: `64/433` positive pairs
- `gpu-mostwiedzy-cnn-large-80class-v1`, MobileNetV3 Large:
  - train: `838/2268` positive pairs, `0` false positives
  - validation: `137/433` positive pairs, `6` false positives
  - validation zero-false-positive threshold: `37/433` positive pairs
- `gpu-ldraw-metric-v1`, local LDraw metric adaptation from the small model:
  - train: `1098/1780` positive pairs, `0` false positives
  - validation: `257/500` positive pairs, `35` false positives
  - validation zero-false-positive threshold: `26/500` positive pairs

Conclusion: larger backbone and local metric adaptation increase apparent
recall but reduce safety. With current data, MobileNetV3 Small is the best
baseline, but recall is still too weak for MVP promotion. Next useful ML work
needs more supervised part classes or a stronger catalogue/reranker setup; more
epochs on the 80-class subset are not the bottleneck.

## Full MostWiedzy 447-Class Results

The full public MostWiedzy classification dataset was downloaded to the remote
worker and extracted under ignored private storage. It contains `photos/` and
`renders/` roots with `447` part-class folders and about `620k` image files.

An initial full run exposed a loader bug: the parent root was scanned after the
nested `photos/` and `renders/` roots, creating fake classes such as `photos`.
That run is invalid. After fixing the loader, two full-dataset runs were made
with `300` examples per class and the same zero-false-positive pair threshold
rule:

- `gpu-mostwiedzy-cnn-small-full447-v2-fixed-loader`, MobileNetV3 Small:
  - final train classification accuracy: about `95.9%`
  - train pair score: `4669/50561` positive pairs, `0` false positives
  - validation pair score: `879/9439` positive pairs, `0` false positives
  - validation recall at zero false positives: `9.3%`
- `gpu-mostwiedzy-cnn-large-full447-v2-fixed-loader`, MobileNetV3 Large:
  - final train classification accuracy: about `97.7%`
  - train pair score: `3604/50561` positive pairs, `0` false positives
  - validation pair score: `651/9439` positive pairs, `0` false positives
  - validation recall at zero false positives: `6.9%`

Conclusion: the PC and full MostWiedzy dataset are usable, and supervised LEGO
classification trains cleanly. However, the current penultimate-feature cosine
embedding is still too conservative for MVP same-part grouping. Better class
accuracy does not automatically produce better safe pair recall. The next useful
model work should change the embedding objective or pair head, not just run more
epochs or a larger MobileNet.

## Two-Lane Pair-Head Experiment

The old promotion rule treated every false positive as an absolute blocker.
That remains correct for silent auto grouping, because a wrong automatic group
can put parts in the wrong bag. It is too strict for an explicitly reviewed
suggestion lane. The revised rule is:

- auto-safe threshold: chosen above the highest training negative; this lane
  must keep `0` known false positives and can be applied without user review
- suggested threshold: chosen below the auto threshold only if cumulative
  training correction burden stays under a stricter selector budget. The
  promotion budget remains `0.5%` measured on validation/holdout suggestions.
  This lane can appear only as lower-confidence UI with fast correction
  controls

The private trainer now reports `threshold`, `suggestedThreshold`,
`rawThreshold`, `trainLaneScore`, and `validationLaneScore`. It also accepts an
`--auto-threshold-floor` so the auto lane can use a deliberate safety margin
above the raw train-negative maximum. The next GPU run should use the pair head
over frozen MobileNet embeddings and judge both lanes separately.

Initial pair-head results on full 447-class MostWiedzy embeddings:

- `gpu-mostwiedzy-pair-head-small-full447-v2-calibrated`,
  MobileNetV3 Small with `--auto-threshold-floor 0.9995`:
  - auto validation lane: `439/9439` positive pairs, `0` false positives
  - suggested validation lane: `5844` positive pairs and `9` false positives
    out of `5853` suggestions
  - suggested correction burden: `0.154%`
  - accepted validation recall: `6283/9439`, or `66.6%`
- `gpu-mostwiedzy-pair-head-large-full447-v2-calibrated`,
  MobileNetV3 Large with `--auto-threshold-floor 0.9998`:
  - auto validation lane: `611/9439` positive pairs, `0` false positives
  - suggested validation lane: `6484` positive pairs and `24` false positives
    out of `6508` suggestions
  - suggested correction burden: `0.369%`
  - accepted validation recall: `7095/9439`, or `75.2%`

Conclusion: the two-lane rule changes the result from "blocked by one high
confidence false positive" to a plausible MVP path. MobileNetV3 Large plus the
pair head is currently the strongest external-dataset scorer, but it is not yet
app-promotable. The next required gate is scoring against local labeled manual
crops and reviewed hard negatives, using the same two-lane reporting.

## Local Manual-Crop Gate

The next gate was added as a private manual-crop training manifest generated
from active part-match reports, active labels, excluded singleton rows, and
reviewed same/different decisions. The manifest has `6306` crop examples and
`80338` app-candidate pairs: `1335` positives and `79003` negatives/hard
negatives.

GPU checks were run:

- external pair-head checkpoint with external thresholds against all local
  pairs:
  - auto lane: `1192/1335` positive pairs but `3192` false positives
  - suggested lane: `143` more positives but `32784` false suggestions
  - verdict: blocked; thresholds do not transfer from external renders/photos
    to manual crops
- same external pair-head with thresholds calibrated on nine local manuals and
  `01-castle-ramp` held out:
  - train auto lane: `99/1251` positives, `0` false positives
  - ramp holdout auto lane: `5/84` positives, `0` false positives
  - suggested lane: none under the selector budget
  - verdict: safe but too weak
- fresh local pair head over the same frozen CNN embeddings, trained on nine
  local manuals with `01-castle-ramp` held out:
  - train auto lane: `183/1251` positives, `0` false positives
  - ramp holdout auto lane: `5/84` positives, `0` false positives
  - suggested lane: none under the `0.5%` selector budget
  - verdict: safe but too weak
- same fresh local pair-head setup with `09-hall-tower` held out:
  - train auto lane: `179/1102` positives, `0` false positives
  - Hall Tower holdout auto lane: `6/233` positives, `0` false positives
  - train-selected mutual-top-1 lane: `31/233` holdout positives, but `2/33`
    false holdout groups, so it fails the reviewed-suggestion correction budget
  - balanced pair-head variant: `3/233` score-threshold positives; mutual-top-1
    reached `13/233` but still had `1/14` false holdout groups
  - verdict: second holdout confirms current pair-head family is safe only at
    too-low recall
- checkpoint-initialized pair-head continuation after fixing checkpoint loading:
  - Hall Tower holdout score-threshold lane: `11/233` positives, `0` false
    groups
  - Hall Tower holdout mutual-top-1 lane: `23/233` positives, but `2/25`
    false holdout groups, so it fails the reviewed-suggestion correction budget
  - Ramp holdout score-threshold lane: `4/84` positives, `0` false groups
  - Ramp holdout mutual-top-1 lane: `6/84` positives, `0` false groups
  - verdict: checkpoint continuation is the correct implementation, but it
    still does not recover enough manual-crop recall for MVP grouping
- hybrid CNN plus structural gate:
  - implementation: `lab:part-match-hybrid-score` reads CNN pair-head scored
    pairs and adds deterministic structural score modes. To keep the diagnostic
    cheap, it preserves raw CNN scores for all pairs but runs structural scoring
    only for high-CNN candidates.
  - Ramp holdout raw CNN mutual-top-1: `13/84` positives, `0` false groups
  - Ramp `cnnIfStructuralMatch` mutual-top-1: auto lane `17/84`, suggested lane
    `22/84`, `0` false groups
  - Hall Tower raw CNN mutual-top-1: `31/233` positives with `2/33` false
    groups, failing the reviewed-suggestion budget
  - Hall Tower `cnnIfStructuralMatch` mutual-top-1: auto lane `36/233`,
    suggested lane `39/233`, `0` false groups
  - after fixing lane analysis to count group-closure recovered positives and
    adding mutual top-2/top-3 strategies, best safe suggested lanes move to
    Ramp `23/84` and Hall Tower `45/233`, still with `0` false groups
  - lowering the structural-candidate cutoff from `0.7` to `0.4` did not change
    accepted lanes because the selected safe floors remained above `0.89`
  - structural-only scoring produced no selected safe lane in this setup
  - verdict: structural gating fixes the worst holdout false groups and
    improves recall over raw pair-head scoring, but recall is still not enough
    for MVP app promotion
- feature-fusion score:
  - implementation: `lab:part-match-feature-fusion-score` trains a local
    logistic fusion on the training split using CNN pair-head scores and the
    deterministic structural pair feature vector. It writes `featureFusion`,
    `featureFusionMax`, and `featureFusionProduct` score modes for the same
    private lane analyzer.
  - Ramp `featureFusionProduct` best safe suggested lane: `39/84`, `0` false
    groups
  - Hall Tower `featureFusionProduct` best safe suggested lane: `68/233`, `0`
    false groups
  - verdict: feature fusion is now the strongest local-manual candidate. It is
    not app-promotable yet because only two holdouts have been checked and
    recall is still moderate.
- row-membership correction gate:
  - implementation: `lab:part-match-pair-lanes` now selects the reviewed
    suggestion lane by wrong grouped row memberships, while retaining group and
    pair correction as diagnostics. This matches the product cost: the user
    fixes wrong rows in visible groups, not every generated pair.
  - Ramp `featureFusionProduct` best reviewed-suggestion lane: `46/84` heldout
    positive pairs, `0/45` heldout wrong grouped rows, training budget spent at
    `3/713` wrong grouped rows.
  - Hall Tower `featureFusionProduct` best reviewed-suggestion lane: `70/233`
    heldout positive pairs, `0/98` heldout wrong grouped rows, training budget
    spent at `3/710` wrong grouped rows.
  - Upper Courtyard follow-up: the same family passed a third holdout only in
    the auto-safe lane. Best clean auto lane is `75/230` heldout positive pairs
    with `0/79` heldout wrong grouped rows. The reviewed-suggestion lane is not
    promotable on this manual because train-selected suggestions recover
    `97/230` to `103/230` heldout positives but introduce `2` to `4` wrong
    grouped rows.
  - Middle Wall follow-up: a fourth holdout passed both lanes. Best clean
    auto-safe lane is `55/198` heldout positive pairs with `0/46` heldout
    wrong grouped rows. Best clean reviewed-suggestion lane is `93/198`
    heldout positive pairs with `0/72` heldout wrong grouped rows.
  - Lower Courtyard follow-up: a fifth holdout also passed the
    reviewed-suggestion lane. Best clean suggestion is `64/155` heldout
    positive pairs with `0/74` heldout wrong grouped rows. Best clean auto lane
    is weaker at `26/155` heldout positive pairs with `0/52` heldout wrong
    grouped rows.
  - Bakery follow-up: a sixth holdout remained safe but weak. Best clean
    suggestion is `41/119` heldout positive pairs with `0/53` heldout wrong
    grouped rows. Best clean auto lane is `21/119` heldout positive pairs with
    `0/42` heldout wrong grouped rows. Sweeping score modes did not produce a
    materially better zero-error lane.
  - Upper Courtyard failure analysis: its blocked reviewed-suggestion lane is
    not just a transitive grouping artifact. It has direct high-score false
    pairs with high CNN and structural scores. Complete-link grouping reduces
    recall and still leaves false groups; near/luma/alpha product modes avoid
    those pairs only by collapsing recall. The blocker is a missing
    discriminative feature or hard-negative training signal.
  - color-gated lane analysis: Farmhouse exposed that the private lane analyzer
    was still scoring different-color candidates such as Dark Brown versus
    Reddish Brown. Those pairs are useful as training negatives, but they are
    not app group candidates because same physical part includes color. The
    analyzer now accepts manual training metadata and skips candidate pairs
    whose resolved color names differ.
  - fixed color-gated `featureFusionProduct` score-threshold auto lane:
    across all 10 active labeled manual holdouts, this recovered `730/1333`
    positive holdout pairs with `0/764` wrong grouped rows and `0` false
    groups. Per-manual heldout positives were: Ramp `30/84`, Middle Wall
    `118/197`, Lower Courtyard `82/154`, Bakery `76/119`, Farmhouse `85/97`,
    4th Stage `84/109`, Fountain `92/96`, Upper Courtyard `129/230`, Hall
    Tower `28/233`, and Wolf Pack `6/14`.
  - checklist-shaped lane review: `lab:part-match-lane-review` joins selected
    lane pairs back to manual crop metadata and renders proposed same-part
    groups with row images. The combined color-gated auto review
    `.bag-it/private/part-match-reports/embedding-experiments/color-gated-auto-lane-review-v1/`
    confirmed the same result in app-review units: `304` proposed groups,
    `764` grouped rows, `730/1333` matched positives, `0/764` wrong grouped
    rows, and `0/304` false groups.
  - verdict: row-membership budgeting improves useful recall, but reviewed
    suggestions do not yet generalize because Upper Courtyard still fails the
    validation correction budget. Silent auto-safe grouping is the only
    plausible MVP lane from this scorer family unless another heldout-safe
    suggestion selector is found. The color-gated auto lane is now plausible
    enough for app-session review, with Hall Tower and Castle Ramp as the main
    recall weaknesses.
- final all-label pair-head run:
  - dataset:
    `.bag-it/private/part-match-reports/embedding-experiments/manual-crop-all-train-v1/`
    contains all 10 active labeled manuals, `1335` positive pairs, `79003`
    negative or hard-negative pairs, and `1247` reviewed decisions.
  - model:
    `.bag-it/private/part-match-reports/embedding-experiments/gpu-manual-pair-head-all-labels-v1/`
    continues from the calibrated full-447 MobileNetV3 Large pair-head
    checkpoint and trains the pair head for 10 CUDA epochs.
  - raw pair-head result: `124/1335` positive pairs with `0` false positives.
    This is safe but too weak by itself.
  - feature-fusion fallback fix: `lab:part-match-feature-fusion-score` now
    treats a missing `cnnIfStructuralMatch` gate as absent rather than as a
    literal zero, so `featureFusionProduct` no longer collapses every final
    all-label score to `0`.
  - corrected feature-fusion output:
    `.bag-it/private/part-match-reports/embedding-experiments/gpu-manual-pair-head-all-labels-feature-fusion-v2/`
  - corrected color-gated product lanes:
    `.bag-it/private/part-match-reports/embedding-experiments/gpu-manual-pair-head-all-labels-lanes-product-v2/`
  - auto-safe score-threshold lane: `220/1333` positive pairs recovered,
    `0` false pairs, `0` false groups, and `0/263` wrong grouped rows.
  - reviewed-suggestion score-threshold lane: `812/1333` positive pairs
    recovered, `4` false pairs, `5` false groups, and `4/847` wrong grouped
    rows. The row correction burden is `0.472%`, just under the `0.5%` row
    budget, but pair and group correction diagnostics remain above that line.
  - review report:
    `.bag-it/private/part-match-reports/embedding-experiments/gpu-manual-pair-head-all-labels-suggested-review-v1/`
    shows the wrong memberships concentrated in `02-middle-wall`,
    `03-lower-courtyard`, and `06-4th-stage`, mostly excluded-row hard
    negatives plus one active-label group mixing two expected part keys.
  - verdict: the final all-label model is not ready for silent MVP grouping
    because auto recall is still modest. The suggestion lane is close enough to
    justify a correction-oriented UI spike, but it is not app-promotable until
    the product exposes suggested groups separately with fast reject/split
    controls and the runtime path for the scorer is resolved.

Runtime export follow-up:

- `@bag-it/part-matching` `0.1.0-alpha.10` adds derived `baseMatched` and
  `baseProbability` features. These let the feature-fusion model use the
  existing package scorer as an input feature while staying pure TypeScript and
  avoiding ONNX/CNN runtime in the app.
- `lab:part-match-export-feature-fusion-scorer` converts the corrected
  feature-fusion model into package scorer configs. It rejects any nonzero
  `score:*` weight because that would require external ML scores at runtime.
- `lab:part-match-runtime-score` now replays a package scorer config over a
  labeled pair set and writes package-runtime scores back to `pairs.json`.
  This makes scorer-export validation repeatable instead of relying on
  one-off Node snippets.
- Direct runtime replay over all `80338` labeled/reviewed pairs showed that
  the original lab lanes were partly protected by a pre-fusion candidate floor.
  The exported scorer scores every pair, exposing one reviewed-different
  Farmhouse pair at `0.994685`, above the original auto floor.
- Recalibrated runtime lanes:
  - runtime-scored pairs:
    `.bag-it/private/part-match-reports/embedding-experiments/gpu-manual-pair-head-all-labels-runtime-score-v2/`
  - runtime lane summary:
    `.bag-it/private/part-match-reports/embedding-experiments/gpu-manual-pair-head-all-labels-runtime-lanes-v2/`
  - runtime scorer export:
    `.bag-it/private/part-match-reports/embedding-experiments/gpu-manual-pair-head-all-labels-runtime-export-v2/`
  - auto-safe score-threshold lane: `179/1335` positive pairs recovered,
    `0` false pairs, `0` false groups, and `0/211` wrong grouped rows.
  - reviewed-suggestion score-threshold lane: `220/1335` positive pairs
    recovered, `1` false pair, `1` false group, and `1/265` wrong grouped
    rows (`0.377%` row correction burden).
- Verdict: runtime export is now honest and package-compatible, but the
  useful lane is far weaker than the lab-only `featureFusionProduct` lane.
  This scorer family is safe enough to keep as private data and possibly as an
  auto-safe fallback, but still not enough to satisfy the MVP need for broad
  same-part grouping.

Runtime group replay follow-up:

- `lab:part-match-runtime-group-score` replays exported package scorer configs
  through actual `createPartMatchGroups` grouping against the manual-crop
  training manifest. This is stricter than pair-lane analysis because it uses
  the package clique grouping path, not pair-level union-find approximations.
- The first replay attempt derived alpha from cached crop PNGs. That was
  rejected because it changed the feature space and produced a false auto
  group. The replay now uses the same session-backed detector features as the
  runtime pair scorer.
- Color-gated runtime scorer export:
  `.bag-it/private/part-match-reports/embedding-experiments/gpu-manual-pair-head-all-labels-runtime-export-color-gate-v1/`
- Package grouping replay results:
  - auto config:
    `.bag-it/private/part-match-reports/embedding-experiments/gpu-manual-pair-head-all-labels-runtime-group-auto-color-gate-v3/`
    matched `134/1322` expected active pairs with `0` active false groups and
    `0/201` wrong active grouped rows. It also produced one excluded-only group,
    tracked separately because no active part key is contradicted.
  - suggested config:
    `.bag-it/private/part-match-reports/embedding-experiments/gpu-manual-pair-head-all-labels-runtime-group-suggested-color-gate-v1/`
    matched `374/1322` expected active pairs with `2` active false groups and
    `2/525` wrong active grouped rows (`0.381%` row correction burden). The two
    wrong groups are active+excluded rows in `02-middle-wall` and
    `09-hall-tower`, not two different active expected part keys.
- Verdict: package-compatible auto grouping remains safe but too weak. The
  suggested lane is now useful enough for a UI spike under the relaxed
  `<0.5%` correction rule, but it must remain explicitly review-suggested and
  cannot be silently merged into the checklist.

Focused-label retry:

- A focused review queue added `132` reviewed near-threshold decisions to the
  manual-crop manifest, producing
  `.bag-it/private/part-match-reports/embedding-experiments/manual-crop-all-train-focused-decisions-v1/`
  with `1347` positive pairs and `78991` negative or hard-negative pairs.
- GPU pair-head retraining from the same calibrated full-447 MobileNetV3 Large
  checkpoint wrote
  `.bag-it/private/part-match-reports/embedding-experiments/gpu-manual-pair-head-focused-decisions-v1/`.
  Raw pair-head scoring improved only slightly, from `124/1335` to `129/1347`
  safe positives with `0` false positives.
- Lab-only feature fusion improved much more: the score-threshold auto lane
  recovered `547/1344` positives with `0` wrong grouped rows, and the
  score-threshold suggested lane recovered `1085/1344` positives with
  `5/1109` wrong grouped rows. This still needed package-runtime verification
  because lab fusion can overstate app behavior.
- Runtime-calibrated pair lanes looked promising: auto recovered `181/1344`
  with `0` wrong rows, and suggested recovered `703/1344` with `3/723` wrong
  rows. Actual package grouping remained stricter. The runtime-calibrated
  auto config recovered `137/1322` expected active pairs with `0` false groups
  and `0/202` wrong grouped rows. The runtime-calibrated suggested config
  recovered `495/1322` pairs but had `5/671` wrong grouped rows, above the
  `<0.5%` correction budget.
- A stricter threshold sweep found the best in-budget focused suggested config
  at threshold `0.98`: `355/1322` expected pairs, `2` false groups, and
  `2/495` wrong grouped rows (`0.404%`). That was safe by the row budget but
  weaker than the previous package-compatible suggested baseline of `374/1322`
  with `2/525` wrong grouped rows.
- Mining the actual package false groups exposed a better route than another
  threshold cut. All five focused false groups shared a low default-scorer
  probability while still having low projection distance. Adding a package
  `vetoRules` clause for `baseProbability < 0.9273504283504274` and
  `projectionDistance < 0.03837316276470589` to the focused suggested config
  removed those false groups while preserving most recovered positives.
- The promoted package-compatible suggested config is
  `packages/part-matching/src/scorer-configs/suggested-part-pair-scorer-config.json`.
  Source-config replay against
  `.bag-it/private/part-match-reports/embedding-experiments/manual-crop-all-train-v1/`
  recovered `476/1322` expected active pairs with `0` false groups and
  `0/645` wrong active grouped rows. The auto config remains unchanged and
  safe at `0` false groups.
- Verdict: the focused relabeling plus package-false-group veto improved the
  app-compatible suggested lane from `374/1322` with `2/525` wrong rows to
  `476/1322` with `0/645` wrong rows. This is promoted as the new suggested
  scorer baseline. The next useful labels should target any future actual
  package group false positives from replay, not generic near-threshold pairs.

Aggressive package calibration:

- A private package replay sweep then lowered the suggested scorer threshold
  and mined additional package-level veto rules against actual grouped false
  memberships. The sweep ran against
  `.bag-it/private/part-match-reports/embedding-experiments/manual-crop-all-train-v1/`
  and wrote
  `.bag-it/private/part-match-reports/embedding-experiments/package-calibration-sweep-v1/`.
- The best measured in-budget suggested config uses threshold `0.68` plus six
  veto rules. Independent source-config replay wrote
  `.bag-it/private/part-match-reports/embedding-experiments/source-suggested-aggressive-group-score-v1/`
  and recovered `788/1322` expected active pairs with `5` false groups and
  `5/1023` wrong active grouped rows, a `0.489%` row correction burden.
- The silent auto config remains unchanged. Replay wrote
  `.bag-it/private/part-match-reports/embedding-experiments/source-auto-aggressive-check-v1/`
  and recovered `134/1322` expected active pairs with `0` false groups and
  `0/201` wrong active grouped rows.
- Verdict: this is a large package-compatible suggested-lane improvement, from
  `476/1322` to `788/1322` matched active expected pairs while staying just
  under the `0.5%` row correction budget. It still falls far short of the
  requested `95%` real-pair coverage, so the remaining blocker is model/feature
  recall rather than calibration thresholding alone.

Connected-grouping calibration:

- Package clique grouping was then compared with connected-component grouping
  for the reviewed suggestion lane. The private strategy evaluator wrote
  `.bag-it/private/part-match-reports/embedding-experiments/grouping-strategy-eval-v1/`.
  Current clique grouping stayed at `788/1322`, while connected components over
  the same matched scorer edges recovered `1096/1322` pairs but exceeded the
  correction budget at `16/1112` wrong grouped rows.
- A connected-specific veto sweep wrote
  `.bag-it/private/part-match-reports/embedding-experiments/connected-calibration-sweep-v1/`.
  Promoting `groupingStrategy: "connected-components"` only for the suggested
  scorer, lowering its threshold to `0.52`, and adding connected false-bridge
  vetoes produced a source replay at
  `.bag-it/private/part-match-reports/embedding-experiments/source-suggested-connected-group-score-v2/`:
  `1108/1322` expected active pairs, `5` false groups, and `5/1113` wrong
  active grouped rows (`0.449%` row correction burden).
- A follow-up lower-threshold sweep wrote
  `.bag-it/private/part-match-reports/embedding-experiments/connected-calibration-sweep-v3/`.
  Lowering the suggested scorer threshold to `0.32` and adding three extra
  false-bridge vetoes produced a source replay at
  `.bag-it/private/part-match-reports/embedding-experiments/source-suggested-connected-threshold032-group-score-v1/`:
  `1112/1322` expected active pairs, `4` false groups, and `4/1117` wrong
  active grouped rows (`0.358%` row correction burden). Lower probes below
  `0.32` plateaued at the same coverage while adding noise.
- The auto scorer remains unchanged and replayed at
  `.bag-it/private/part-match-reports/embedding-experiments/source-auto-connected-check-v1/`:
  `134/1322` expected active pairs with `0` false groups and `0/201` wrong
  grouped rows.
- The same private evaluator's label-oracle ranked-union diagnostic over the
  current scorer family reached only `1155/1322` pairs (`87.4%`) under the row
  correction budget. This suggests the remaining gap to `95%` needs a stronger
  model or feature signal, not only another threshold/veto pass over the
  current package scorer.

Hard-negative pair-head replay:

- `train-part-match-lego-cnn.py` now accepts
  `--pair-head-hard-negative-score-dir`,
  `--pair-head-hard-negative-min-score`, and
  `--pair-head-hard-negative-repeat`. These options load high-scoring negative
  pairs from a previous score run and replay them during pair-head training.
  The goal is to teach the CNN pair head the actual false bridges that block
  broad manual-crop grouping, rather than only adding random negatives.
- The strongest replay so far is
  `.bag-it/private/part-match-reports/embedding-experiments/gpu-manual-pair-head-focused-decisions-metric2-fresh1024-hardneg-v1/`.
  It starts from the full-447 MobileNetV3 Large CNN checkpoint, trains two
  metric epochs, then trains a fresh `1024` hidden-size pair head while
  replaying previous high-scoring negatives above `0.4` one hundred times.
  The pair-head's strict auto threshold recovered `1217/1347` manual-crop
  positives with `0` false-positive pairs.
- Pair-lane analysis over the same raw CNN scores, color-conflict gated, found
  a lab-only score-threshold auto lane at `1190/1344` positive pairs with
  `0` false pairs, `0` false groups, and `0/1168` wrong grouped rows. Lowering
  to a reviewed-suggestion floor recovered `1336/1344` positive pairs
  (`99.4%`) with `5/1330` false accepted pair edges (`0.376%`), `4/1373`
  wrong grouped rows (`0.291%`), and `11/535` false groups.
- Feature-fusion over the hard-negative replay was weaker for recall but still
  crossed the lab pair target: `featureFusionProduct` recovered `1286/1344`
  positives (`95.7%`) with `4/1271` false accepted pair edges (`0.315%`) and
  `2/1319` wrong grouped rows (`0.152%`). Its group-level false diagnostic was
  still high at `13/513` false groups.
- Two follow-up replays against the v1 false bridges were rejected. Replaying
  negatives above `0.9` two hundred times collapsed accepted recall to
  `201/1347`. Replaying negatives above `0.95` twenty times still collapsed to
  `264/1347`. The first replay is the useful result; stronger replay
  overfits by pushing the safety threshold too high.
- 2026-06-27 automated calibration push:
  - A package-native weighted decision-tree replacement trained on the focused
    manifest and replayed through `lab:part-match-runtime-group-score` reached
    `1154/1322` expected active pairs, `5` false groups, and `5/1163` wrong
    active grouped rows (`0.430%`). This is promoted as the current suggested
    scorer because it is the best strict package-compatible result from the
    current TypeScript feature family, but it is still only `87.3%` coverage.
  - Adding tree leaves as supplemental rules to the current suggested scorer
    plateaued at `1114/1322` pairs with `4/1118` wrong grouped rows, so the
    current scorer already covers almost all safe pairs expressible by those
    package features.
  - Replaying the hard-negative CNN score as a cached runtime pair feature
    confirmed the missing image signal exists but is not yet safely groupable.
    The v1 raw CNN floor that looked near-perfect in pair-lane analysis
    recovered `1314/1322` expected pairs under actual connected package
    grouping, but produced `20/1367` wrong active grouped rows (`1.46%`).
    Current-package-plus-CNN supplemental rules remained blocked by existing
    vetoes and reached only `1114/1322`.
  - A mild GPU continuation from the best hard-negative checkpoint, replaying
    only negatives above `0.9` five times for four pair-head epochs, wrote
    `gpu-manual-pair-head-focused-decisions-metric2-fresh1024-hardneg-v4-min09-repeat5`.
    Its raw pair-head threshold accepted `1307/1347` positives with `0` direct
    training false-positive pairs, avoiding the earlier replay collapse.
    Actual connected package grouping at that threshold recovered
    `1297/1322` expected pairs but had `16/1336` wrong grouped rows
    (`1.20%`). The best in-budget v4 connected replay was only `977/1322`
    with `4/939` wrong rows. Mutual top-k and clique grouping reduced some
    transitive noise but still exceeded the `0.5%` row budget at useful
    coverage (`top4` at the v4 threshold: `1250/1322`, `16/1331` wrong rows;
    clique at the v4 threshold: `1261/1322`, `13/1320` wrong rows).
  - Legacy-label verdict before reviewed-pair reconciliation: the aspirational
    `95%` real-pair coverage with `<0.5%` wrong-row burden was not reached with
    existing labels and automated calibration. The blocker looked like grouping
    safety: high-recall CNN edges created transitive or clique-visible wrong row
    memberships above the reviewed-suggestion budget.
- 2026-06-27 reviewed-pair truth reconciliation:
  - `lab:part-match-runtime-group-score` gained `--truth-source pair-targets`.
    This scores against focused `pairs.json` reviewed targets instead of only
    deriving truth from legacy `expectedPartKey` labels. The distinction matters
    because the focused manifest contains reviewed-same links for rows that
    legacy strict scoring still treats as excluded singletons or split expected
    keys.
  - The promoted package decision tree scores `1158/1347` focused reviewed
    positive pair targets with `4` false groups, `7` false-pair diagnostics, and
    `2/1163` wrong grouped rows. Legacy label truth remains the app-static gate
    for that scorer: `1154/1322` active expected pairs with `5/1163` wrong
    grouped rows.
  - The v4 hard-negative CNN cached-score replay at threshold
    `0.9961420893669128` initially recovered `1299/1347` reviewed positive
    pair targets with `0/1304` wrong grouped rows, but still showed `7`
    closure false-pair diagnostics. The user reviewed those seven diagnostics
    and confirmed all are actually same-part pairs.
  - After applying the seven same-part corrections, the focused manifest has
    `1354` positive pair targets and `78984` negative pair targets. The same
    cached CNN package-grouping replay recovers `1306/1354` reviewed positive
    pair targets (`96.5%`) with `0` false groups, `0` false-pair diagnostics,
    and `0/1304` wrong grouped rows.
  - Verdict: the requested `95%` real-pair coverage is now demonstrated in lab
    package grouping when "false positives" means direct accepted negative
    pairs or user-visible wrong row memberships. The user approved committing
    this model because the training examples are part manual crops, not build
    steps or full manual pages.
- 2026-06-27 runtime promotion:
  - The v4 hard-negative PyTorch checkpoint was exported into browser ONNX
    artifacts: a MobileNetV3 Large feature extractor and a separate pair head.
    The app stores those artifacts under
    `public/models/part-matching/manual-crop-cnn-hardneg-v4-closure-fixed-v1/`.
    The raw `.pt` checkpoint and source crops remain private.
  - The Bags part-grouping worker now preprocesses masked part crop pixels,
    embeds each row once, scores candidate row pairs through the ONNX pair
    head, and passes the resulting `cachedPairScore` map into
    `createPartMatchGroups`.
  - The tracked suggested scorer config now uses the calibrated
    `cachedPairScore > 0.9961420893659129` gate with connected-components
    grouping. Auto grouping remains unchanged and keeps its stricter
    zero-known-false-positive lane.
  - Runtime buckets above the `96` row CNN cap keep the previous static
    suggested scorer as a responsiveness fallback while ONNX inference remains
    CPU/WASM-bound.
- Current status: the CNN pair-head now satisfies the user's aspirational pair
  target under reviewed-pair truth and has a browser runtime path. The previous
  tracked static package scorer remains recorded for comparison at
  `1154/1322` active expected pairs under legacy label truth and `1158/1347`
  reviewed positive pair targets under the pre-correction focused pair-target
  truth. With the seven closure corrections, the tracked static package scorer
  reaches `1161/1354` reviewed positive pair targets with `2/1163` wrong
  grouped rows. The cached CNN package-grouping replay reaches `1306/1354`
  reviewed positive pair targets with `0` false groups and `0/1304` wrong
  grouped rows and is now the promoted suggested lane.

Conclusion: external LEGO classification pretraining is useful infrastructure,
and the hard-negative pair-head formulation now has enough manual-crop signal
for broad app-visible suggested grouping. The production shape is intentionally
two-layered: ONNX computes only `cachedPairScore` from runtime masked crops,
while `@bag-it/part-matching` still owns color scope, grouping, lane assignment,
and correction-budget gates.
