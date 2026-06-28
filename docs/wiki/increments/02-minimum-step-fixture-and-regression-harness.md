# Increment 2: Minimum Step Fixture And Regression Harness

## Status

Complete. This increment created shared, non-private fixtures and regression
checks before detector output can drive Bags.

## Goal

Create the smallest shared fixture gate that lets future step-callout detector
work fail loudly without relying on private manuals. This increment does not
tune production detection; it defines committed fixture inputs, expected output
contracts, and scoring helpers that Increment 3 can run against the real
detector.

## Scope

Deliver:

- one small synthetic/public manual with bordered callouts using varied
  backgrounds
- one multi-page manual with multiple callouts per page
- one repeated-step fixture requiring a multiplier
- one noisy false-positive fixture
- targeted quantity-label and part-crop unit fixtures
- baseline expected callouts, quantities, colors, and baggable rows
- CI-friendly tests that avoid private manual artifacts

## Fixture Source Decision

Use synthetic fixtures only for the minimum gate. Synthetic source avoids
licensing ambiguity, keeps the fixture set tiny, and lets expected coordinates
be exact. Fixture parts are drawn from repo-local synthetic LDraw-format mesh
definitions rather than copied external part-library files.

All fixture metadata must mark:

- `sourceKind: synthetic`
- generator script or source spec path
- generated PDF path
- expected baseline path
- fixture purpose
- whether it may be used in browser/deployed e2e
- local LDraw-format part id for each expected part row

No private manual pages, crops, screenshots, or row-level debug data may be used
to create these fixtures.

## Planned Paths

- `tests/fixtures/steps/sources/*.ts`: typed synthetic fixture definitions
- `tests/fixtures/steps/generated/*.pdf`: committed generated fixture PDFs
- `tests/fixtures/steps/expected/*.json`: expected callouts, rows, colors, and
  baggable-row metadata
- `src/features/steps/fixtures/step-fixture-types.ts`: shared fixture and
  expected-result contracts
- `src/features/steps/fixtures/step-fixture-manifest.ts`: committed fixture
  manifest consumed by tests and Webwright
- `src/features/steps/fixtures/step-fixture-gate.ts`: scoring helpers and
  threshold checks from [Quality gates](../quality-gates.md)
- `src/features/steps/fixtures/step-fixture-gate.test.ts`: CI unit coverage for
  fixture integrity and scoring behavior
- `scripts/generate-step-fixtures.mjs`: deterministic PDF/baseline generation
  from synthetic source specs

If generated PDFs are committed, `.gitignore` must add a narrow allowlist for
`tests/fixtures/steps/generated/*.pdf` while keeping root/private `*.pdf`
ignores intact.

## Minimum Fixture Catalogue

| Fixture | Purpose | Required Contents |
| --- | --- | --- |
| `simple-blue-callouts` | legacy-named smoke fixture for upload and first detector gate | one non-build cover page followed by a build-step page with at least two bordered callouts, varied callout backgrounds, simple part rows, and obvious quantities |
| `multi-page-multi-callout` | page coverage and ordering | at least three pages, at least two pages with multiple callouts, one page with zero callouts |
| `repeated-step-multiplier` | multiplier baseline | repeated callout or repeated build segment where expected multiplier is greater than `1` |
| `noisy-false-positive` | rejection pressure | page decorations, frames, labels, or panels that resemble callouts but should not become baggable rows |
| `quantity-and-crop-units` | unit-level row extraction edge cases | multi-digit quantity labels, part-only crop excludes quantity glyphs, tight crop ownership cases |

## Baseline Contract

Each expected JSON file records:

- fixture id and source metadata
- page count and expected scanned pages
- expected callouts with page number, page-local index, source region, crop
  region, and `baggable` flag
- expected part rows with quantity text/value, quantity-label region,
  part-only region, local LDraw-format part id, color name/hex/RGB, and optional
  image signature fixture id
- expected multiplier where the fixture needs repeated-step handling
- expected baggable row count, zero-part callout count, and false-positive
  traps

Coordinates are expressed in rendered fixture pixels at the planned detector
test width so gate checks can compare regions without PDF-unit ambiguity.
Quantity-label regions are below their part regions in every synthetic fixture.

## Harness Behavior

The gate runner should accept a detected result and an expected baseline, then
return a structured quality summary:

- page coverage percentage
- callout recall
- false-positive baggable-callout rate
- source reference accuracy
- quantity exact-match rate
- multi-digit quantity exact-match result
- part-crop ownership failures
- part color gate reports targeted common-color fixture results when color
  detection is present
- failed thresholds with fixture ids and compact diagnostics

Increment 2 unit tests use controlled synthetic detection objects to verify the
scoring math and fixture integrity. Increment 3 replaces those controlled
objects with real detector output without changing threshold definitions.

## Implementation Sequence

1. Add shared fixture type contracts and threshold constants matching
   [Quality gates](../quality-gates.md).
2. Add synthetic source specs for the five minimum fixture purposes.
3. Add deterministic generator for PDF fixtures and expected JSON baselines.
4. Commit generated PDFs and baselines with explicit synthetic provenance.
5. Add manifest validation tests: all files exist, no private paths, fixture ids
   unique, expected pages/callouts/rows present.
6. Add gate scoring tests using controlled detections for pass and fail cases.
7. Wire a focused local command or document `pnpm test -- --run
   src/features/steps/fixtures/step-fixture-gate.test.ts`.
8. Update Webwright fixture selection to use `simple-blue-callouts` once the
   detector workflow exists.

## Out Of Scope

- private manual PDFs or renders in git
- production detector tuning from private manuals
- Bags driven by detector output
- BOM discovery, Rebrickable matching, or parts-list OCR

## Acceptance

- every committed fixture source is documented as synthetic, public/licensed, or
  explicitly approved
- detector gate from [Quality gates](../quality-gates.md) can run locally and in
  CI
- detector work cannot drive Bags until this minimum fixture gate exists
- generated fixtures are deterministic from committed source specs
- fixture and gate tests pass without network access or private local manuals

## Validation Notes

- Fixture source decision: use synthetic-only minimum fixture set.
- Fixture generation script: `npm run fixtures:steps`.
- Focused regression command: `npm run test:steps-fixtures`.
- Full local verification remains `npm run verify` before merge.
