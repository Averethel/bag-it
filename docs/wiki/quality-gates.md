# Quality Gates

Quality gates define when Bag It is allowed to present generated bag assignments as ready for use.

These gates define minimum readiness, not research aspirations. They should be
revised as approved, synthetic, public, or licensed MOC-like manuals are added
to the fixture set, but bag generation should not be treated as complete
without measurable recognition and reconciliation criteria.

## MVP Fixture Set

Before bag generation depends on recognized data, create a small fixture set:

- one small manual with a clear bill of materials and simple step layout
- one medium manual with multiple steps per page
- one manual with a noisier or less standardized parts list

Private manual PDFs must not be committed to the repository or used as shared
fixtures. Fixture inputs must be synthetic, public, licensed for this use, or
explicitly approved for storage. If private local manuals are used during
development, they must stay outside version control and tests should record only
approved expected outputs or redacted derived artifacts.

While no realistic shared fixture set is available, Increment 2 uses a local
private fixture strategy for recognition tuning and closeout decisions:

- gate examples are real local manuals stored only under ignored paths
- expected CSVs are local comparison aids, not a replacement for the manual
- redacted aggregate validation metrics may be documented, but private PDFs,
  rendered pages, OCR text, cropouts, and row-level debug output must not be
  committed
- local comparisons against Rebrickable CSVs may report accepted compatible
  matches separately from exact matches because those CSVs can include
  alternate molds, print parents, or compatible colors that do not exactly
  match the manual-visible bill of materials
- gate examples should be separated from exploratory outliers so broad research
  coverage does not block a focused increment close
- a committed shared fixture set remains deferred until realistic public,
  licensed, synthetic, or explicitly approved manuals are available

### Increment 2 Castle Hard Gate

The private Castle manual-print suite is the formal Increment 2 closeout gate
while it remains the operational local fixture set. Parts-list OCR, parser,
catalogue-validation, or validation-harness changes must preserve all of these
results before Increment 2 can stay closed:

- every Castle manual reports `supported`
- actual row count equals expected row count for every Castle manual
- accepted and exact row match rates are `1`
- accepted and exact quantity-weighted match rates are `1`
- missing rows, extra rows, compatible alias matches, extra quantity, and
  assertion failures are all `0`
- recognition tuning runs the browser-path harness without a wall-clock
  analysis timeout
- the validation harness uses `--require-exact` so compatible-alias matches
  cannot silently pass the closeout gate

Any drop in Castle accuracy is a hard regression even when the broader MVP
thresholds below would still pass.

Each fixture should include expected outputs for:

- bill of materials rows
- normalized part and color records
- step sequence
- per-step part quantities where available
- expected bag ranges once bagging is introduced

## Initial Recognition Gates

For the MVP, generated bag assignments should be marked ready only when the fixture suite meets these starting thresholds:

- BOM row extraction: at least 95% exact quantity, part number, and color row
  match on supported manuals
- BOM quantity extraction: at least 99% quantity-weighted match on supported
  manuals before the parts list is considered hands-off ready
- part normalization: at least 90% of extracted BOM quantity resolves to canonical Rebrickable part/color records
  and unresolved or ambiguous normalized quantity is isolated into an attention
  list
- step detection: at least 95% of expected step numbers detected in sequence
- per-step quantity reconciliation: at least 90% of total BOM quantity is assigned to detected steps or explicitly classified as unresolved
- unresolved bag impact: no generated bag should hide unresolved parts that affect its required quantity

## Runtime Readiness Gate

For a user-uploaded manual, bag output can be presented as ready only when all of these measurable conditions pass:

- supported BOM: at least one bill-of-materials region is detected, parsed rows
  have numeric quantities, and the parser reports no blocking structural error
- BOM extraction confidence: the parser either meets the hands-off confidence
  threshold or marks the parts list needs attention before bagging depends on it
- normalization coverage: at least 90% of total extracted BOM quantity resolves to canonical Rebrickable part/color records
- unresolved normalization: any unresolved normalized quantity is listed separately and excluded from ready bags
- recalculation continuity: when a stale analysis must be recalculated, existing
  checked-row progress is transferred where rows still match, and any changed
  quantity, part number, catalogue part, or colour is surfaced to the user
- step sequence validity: detected steps can be sorted into one build sequence with no unresolved duplicate step numbers, no backwards step order, and unexplained numeric gaps no greater than 5% of detected steps
- step usage coverage: assigned step-part quantities plus explicitly unresolved step-part quantities cover at least 90% of normalized BOM quantity
- bag readiness: a bag can be marked ready only when every required quantity in its step range is resolved
- export readiness: full-manual bag prep exports and labels are enabled only when every generated bag is ready

If any gate fails, the app should show the normalized parts list and the specific reason bagging is not ready instead of asking the user to correct many rows. Bags or step ranges with unresolved quantities should be marked needs attention, not ready.

## No-BOM Policy

Manuals without a detectable bill of materials are unsupported for the MVP.

For these manuals, Bag It should:

- preserve the processing record without retaining the original PDF as long-lived
  product data
- report that a supported parts list was not found
- avoid generating bag assignments
- optionally keep private derived debug artifacts for future recognition
  research when retention rules allow it

Inferring the full inventory only from steps is future research, not part of the MVP.

## Performance Gates

The first usable product path should include minimum performance guardrails:

- upload completion must not wait for full OCR or recognition
- long-running work must run as a background job
- the UI must expose meaningful processing status
- catalogue lookups may use bounded cache-backed data, but uploaded manual
  analysis and page renders must not be persisted while recognition is still
  being tuned; each upload should run against current extractor code
- useful partial results should appear before full-manual analysis completes when data is available
- user-triggered resume files may restore completed local analysis only when
  the saved extractor version matches the current extractor version; stale
  saved analysis must require recalculation before it is used

Increment 9 hardens and scales these behaviors. It is not the first point where performance is considered.
