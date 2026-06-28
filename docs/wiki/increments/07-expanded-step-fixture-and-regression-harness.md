# Increment 7: Expanded Step Fixture And Regression Harness

## Status

Complete. The expanded harness exists in code and fixtures, including approved
manual-derived e2e cases, and the current full verification plus browser e2e
fixture gate passed on 2026-06-28.

## Scope

Deliver:

- approved manual-derived bag-analysis fixtures under
  `tests/e2e/fixtures/bag-analysis/**`
- split fixture artifacts for resumable input sessions, expected callouts, and
  expected parts
- browser upload/download validation through the production `/` app path
- structural comparison for versions, callout counts, row counts, quantities,
  part regions, quantity-label regions, and detected colors
- visual comparison for callout crops, part crops, alpha masks, and drift
  tolerances
- private-only diff reports for review, not acceptance
- private local color, crop, timing, and same-part match reports under ignored
  paths

## Out Of Scope

- committing private PDFs or private rendered pages outside approved fixtures
- refreshing, rebaselining, staging, or committing approved manual-derived
  fixture content without first showing the proposed fixture diff and receiving
  explicit user approval
- replacing browser app validation with package-level manual replay
- treating private reports as acceptance gates unless explicitly named by the
  current change

## Acceptance

- committed fixtures are synthetic, public/licensed, or explicitly approved
- private PDFs and private renders are not committed
- all approved bag-analysis fixtures pass the current browser e2e gate
- detector, extractor, and color version mismatches fail before comparison
- broader detector changes have measurable regression coverage beyond the
  minimum synthetic fixture gate

## Validation Notes

- The committed manifest currently covers eleven approved manual-derived cases.
- Detector `2.0.0-alpha.18` removes structured PDF text from the step-callout
  contract. Callout quantity evidence now comes from the shared raster quantity
  label package that also backs callout-part extraction.
- The browser fixture gate covers the manual-008 page 2 banner guard: page-scale
  raster paragraph panels must not be accepted as build-step callouts because
  their glyph fragments resemble `Nx` labels. Strong border/background/quantity
  evidence can still accept a genuine wide callout panel.
- Detector `2.0.0-alpha.18` invalidates alpha12 through alpha17
  results after adding capped non-dark raster edge-contrast evidence for
  thin/light fill-panel outlines, dominant edge-sampled page background
  estimation, page-local background fallback under sparse/misleading
  manual-wide style only when strong raster quantity evidence is present, a
  panel-size guard for every raster-quantity fill-panel acceptance path, stable
  quantity-backed manual-style recovery for smaller single-part Animals-style
  callouts without a predetermined callout aspect-ratio guard, bounded transparent-panel
  recovery for strong-bordered raster-quantity callouts on gradient pages,
  accepted-only app-facing Build steps output so review diagnostics cannot
  become part-extraction inputs, step-detector worker version checks, and
  output assembly that uses overlapping strong manual-style fill panels as the
  source for duplicate border/line candidates. The page-local fallback does not
  use the small-panel exception, and transparent panels require foreground
  density bounds, which keeps lower-contrast ramp instruction panels and dense
  build-art fragments out of accepted callouts.
- Part extractor `2.0.0-alpha.163` adds reviewed Animals row regressions:
  step 115 keeps the left `4x` row in a two-label panel even when part ink
  overlaps the printed label box, and step 219 reads the high-scale printed
  label as `5x` rather than `6x`. `manual-011` is the approved Animals
  bag-analysis e2e fixture and captures the current 275 callout / 464 part-row
  browser output.
- Fixture content under `tests/e2e/fixtures/bag-analysis/**` remains frozen
  unless the proposed visual/JSON differences are shown and explicitly approved
  by the user before any rebaseline, staging, or commit.
- `npm run test:e2e` runs the manifest-driven browser fixture gate.
- `npm run validate:detector-regressions` validates saved color/crop/matching
  report snapshots before the e2e fixture gate.
- `npm run verify` remains the full command before merge.
- 2026-06-28 close-out: `npm run verify` passed type generation, typecheck,
  lint, Vitest, and detector regression validation; the browser e2e fixture gate
  passed all eleven approved manuals, including `manual-011` Animals.
