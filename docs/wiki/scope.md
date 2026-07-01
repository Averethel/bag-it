# Rebuild Scope

## Product Boundary

Bag It remains companion guidance for a builder who already has the original
MOC manual. The app must not alter, rewrite, or generate replacement
instructions. Page previews are allowed only as contextual validation for
detected source callouts, not as a PDF reader.

The fresh MVP should optimize for a hands-off step-to-bag workflow:

- detect build-step callouts from the PDF
- show where the app found each step callout
- expose compact controls for repeated printed steps
- divide detected parts into draft bags
- let the user check off physical bag prep
- keep private manual data transient unless the user explicitly downloads a
  session file

## Keep

- The main single-page application shape.
- Chakra UI v3 and a restrained workbench visual system.
- Upload card, processing status card, session download/import controls, and
  private-artifact purge behavior.
- Output tabs, specifically:
  - Build steps
  - Bags
  - optional lightweight diagnostics for step detection
- Build-step callout discovery logic.
- Build steps tab with page groups, page previews, callout rows, callout crop
  hovers, and per-callout multiplier controls.
- Draft bagging from detected callout items.
- Bags checklist UI with accordions, quantity-weighted completion, grouping by
  bag or color, page/source callout hovers, row sorting where appropriate, and
  large-result rendering protections.
- Session persistence for manual bytes, step analysis, multipliers, and checked
  bag rows when the user explicitly downloads a session file. This is
  user-owned file persistence, not hidden app storage.
- CircleCI plus Vercel CI/CD structure.

## Drop

- BOM page discovery as a required product path.
- Parts-list OCR and parsing.
- Parts list tab as a recognized BOM table.
- Rebrickable catalogue normalization as a required bagging dependency.
- Catalogue preview fetches and catalogue API routes unless a later scope adds
  an optional imported inventory feature.
- BOM coverage diagnostics as a default UI element.
- BOM/Rebrickable match debug cards and row-level BOM matching diagnostics.
- Local private manual validation scripts that exist only to tune BOM
  extraction.

## Adapt

The step detector should accept optional page exclusions and optional color
palette input, but neither can be required for the fresh MVP:

- `excludedPageNumbers` can be empty by default.
- A simple user-hidden automatic exclusion pass may be added later only if it is
  fast and measurable.
- Color detection must have a generic LEGO-like fallback palette when no
  inventory-derived palette is available.
- Set-size bagging must default to detected callout quantity instead of BOM
  quantity.
- Any comparison between expected inventory and detected step quantity must be
  optional and absent from the default MVP when no inventory source exists.

## Non-Goals For The Fresh MVP

- No user-facing PDF viewer.
- No manual page editing or generated replacement pages.
- No row-by-row correction workflow.
- No attempt to infer a perfect canonical LEGO inventory.
- No Rebrickable dependency in the core user path.
- No hidden long-lived storage of uploaded PDFs, page renders, crops, or debug
  artifacts.

## Privacy Rules

- Uploaded PDF bytes are private source material.
- Page renders, callout crops, part crops, source regions, and derived hashes
  are private derived artifacts.
- Private source or derived artifacts must not be committed as ordinary
  fixtures.
- Runtime analysis may use transient browser memory and job-scoped PDF bytes.
- Manual processing is browser-owned; server-side manual processing jobs are out
  of scope.
- A user-triggered session download is an explicit ownership boundary and may
  contain the manual plus derived step/bag data.
- Stale saved analysis must be invalidated by detector version before it renders
  Bags. Checked completion may still transfer across a rerun by matching saved
  page, callout-crop, and part-crop coordinate anchors.
- See [Privacy and sessions](privacy-session-spec.md) for the exact in-memory,
  session download/import, purge, and application-server boundary rules.

## Quality Gate Replacement

Dropping BOM/Rebrickable reconciliation removes the previous coverage backstop.
The fresh MVP must therefore use detector-specific gates before draft bags are
trusted enough to present as useful guidance:

- shared synthetic/public/approved fixtures for callout detection, quantity
  reads, crop ownership, and bagging
- measured callout recall and false-positive rates
- targeted quantity-label and crop ownership regression masks
- explicit no-callout and no-baggable-callout UI states
- large-checklist rendering tests

See [Quality gates](quality-gates.md) for the concrete thresholds and test
requirements.

## Readiness Criteria

The fresh MVP is ready when:

- A supported PDF can be uploaded and scanned without BOM extraction.
- The Build steps tab shows every scanned page and every detected callout row.
- The quality gates for detector recall, false positives, quantity reads, color
  estimates, and bagging behavior pass on the shared fixture set.
- Missed pages/callouts are visible enough for tuning without a large debug UI.
- Repeated-step multipliers update both Build steps totals and Bags.
- Bags are contiguous by detected callout order and do not split a manual page.
- The Bags checklist remains responsive for large manuals.
- CI runs lint, typecheck, unit tests, build, preview deploy, deployed e2e, and
  production deploy/e2e on `main`.
