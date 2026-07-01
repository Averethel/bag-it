# Fresh Repository Rebuild Plan

## Increment 0: Project Shell

Status: complete.

Deliver:

- Next.js/React/Chakra app bootstrapped
- Bag It theme tokens
- page frame
- overview
- upload/status/session sidebar
- Build steps and Bags tabs with pending panels
- CI/CD pipeline wired before feature work grows
- semantic commit convention documented and used from the first commit

Acceptance:

- `pnpm run verify` passes locally
- upload action disabled until a PDF is selected
- selected PDF name, purge action, and retry/error messaging render correctly
- session controls have correct disabled/enabled state
- stale-session and no-callouts attention states have placeholders in the UI
- CircleCI install/lint/typecheck/unit/build jobs pass
- preview deploy and deployed e2e run on a non-main branch
- production deploy/e2e run on `main`
- new commits follow `<type>: <imperative summary>`

## Increment 1: Private PDF Intake

Status: complete.

Deliver:

- PDF file validation
- metadata extraction
- transient source-byte processing
- cancellation and purge
- page render helper
- session download/import skeleton

Acceptance:

- invalid, too-large, corrupt, encrypted, cancelled, expired, and purged states
  are represented
- active job byte buffers and parsed PDF objects are purged after processing or
  failure; the selected browser `File` may remain in memory after success only
  for user-triggered session download or rerun
- no private derived artifacts are persisted except in user-triggered session
  downloads
- session download/import follows
  [Privacy and sessions](privacy-session-spec.md)

## Increment 2: Minimum Step Fixture And Regression Harness

Status: complete.

Deliver:

- full minimum fixture set from [Quality gates](quality-gates.md):
  - one small simple-callout manual
  - one multi-page/multi-callout manual
  - one repeated-step fixture
  - one noisy false-positive fixture
  - targeted quantity/crop unit fixtures
- targeted unit image/canvas fixtures for quantity/crop edge cases
- baseline expected callouts, quantities, colors, and baggable rows
- CI-friendly fixture tests that do not commit private manual artifacts

Acceptance:

- every fixture source is documented as synthetic, public/licensed, or approved
- the detector gate in [Quality gates](quality-gates.md) can run locally and
  in CI
- detector work cannot drive Bags until this minimum gate exists

## Increment 3: Step Callout Detection

Status: complete.

Deliver:

- full-manual scan with optional exclusions
- callout rectangle detection
- border-first detection without assuming blue callout fill
- first-build-step-page style seeding instead of first-PDF-page seeding
- callout background inference from interior pixels
- callout crop output
- item row detection
- quantity-label crop
- part-only crop
- advisory detected part color with conservative review status
- progress events
- detector versioning

Acceptance:

- Build steps tab renders every scanned page
- zero-callout pages are visible
- detected rows show step index and callout crop
- quantity, quantity-label crop, part-only crop, and advisory color metadata
  exist for each detected item when a stable color sample is available
- stale detector sessions require rerun
- detector satisfies the minimum gate for the first shared fixture

## Increment 4: Build Steps Tuning UI

Status: complete.

Deliver:

- batched page preview loading
- callout hover enlargement
- per-callout multiplier controls
- step total summaries
- optional compact diagnostics for detector timing and rejected candidates

Acceptance:

- preview batches do not cancel each other
- multiplier changes update visible totals immediately
- zero-part callouts are visible but not bagged
- diagnostics do not become a replacement PDF viewer

## Increment 5: Draft Bagging

Status: complete.

Deliver:

- `step-callout-bagging-v6` policy implementation
- detected-quantity set-size fallback
- page-contained bag boundaries
- review reasons
- bag row ids

Acceptance:

- bags are contiguous in detected callout order
- no manual page splits across bags
- unknown quantities mark review
- multipliers rebalance bags before rendering
- zero-baggable-callout results produce no bag plan and an attention state

## Increment 6: Bags Checklist

Status: complete.

Deliver:

- bag grouping
- quantity-weighted progress
- checked row persistence
- part crop hover
- quantity-label crop
- page preview hover
- source callout hover
- large-list rendering protections

Acceptance:

- checklist remains responsive with large detected row counts
- color mode preserves bag switch dividers
- checked state survives tab remounts and session restore
- row sorting does not break bag grouping semantics

## Increment 7: Expanded Step Fixture And Regression Harness

Status: complete.

Deliver:

- additional synthetic or approved public step-callout PDF fixtures beyond the
  minimum set
- detector fixture snapshots without private manual pages
- additional unit-level image/canvas fixtures for hard quantity/crop cases
- optional local-only private validation scripts for developer machines

Acceptance:

- committed fixtures are synthetic, public, licensed, or explicitly approved
- private PDFs and private renders are not committed
- detector changes have broader measurable regressions beyond the minimum MVP
  gate

## Remaining Work

Increment 7 is closed. Remaining MVP work should be opened as a new scoped
increment before implementation:

- keep approved manual-derived fixture updates behind explicit user approval
- decide which private-only color, crop, timing, and same-part reports are
  required before each detector or extractor tuning merge
- extract the review-identified boundaries only as later focused patches:
  part-match precompute runtime, checklist table model, checklist accordion,
  runtime preview task controller, detector client boundary, analysis job state,
  bag-analysis fixture manifest validator, and alpha-mask comparison helper

Resolved by the current implementation:

- the shared minimum detector gate uses synthetic fixtures
- approved manual-derived e2e fixtures live under
  `tests/e2e/fixtures/bag-analysis/**`
- checklist-visible same-part grouping is exact only; near-match grouping stays
  private-label-gated

## Open Decisions

Still open:

- Whether the fresh MVP should expose a manual page exclusion control for rare
  inventory/cover pages, or rely fully on callout evidence.
- Whether an optional imported parts CSV should later provide set size and color
  palette without reviving BOM OCR.
- Whether the Build steps tab should be the default first tab after analysis, or
  Bags should become default once a bag plan exists.
