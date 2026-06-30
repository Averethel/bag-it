# Bag It Wiki

This wiki is the source of truth for rebuilding Bag It in a fresh repository.

Assume no source files, branch history, fixtures, screenshots, or private
artifacts from any earlier work are available. The fresh project should recreate
the product shape described here, implement step-callout discovery and draft bag
allocation, and keep CI/CD discipline while excluding BOM discovery as a core
dependency.

## Current Status

Last completed increment:
[Increment 7: Expanded Step Fixture And Regression Harness](increments/07-expanded-step-fixture-and-regression-harness.md).

Active increment:
[Increment 8: Repeat Subassembly Advisories](increments/08-repeat-subassembly-advisories.md).

The repository is being bootstrapped around the retained MVP boundary: upload a
private MOC manual, discover build-step callouts with the production v2 browser
adapter, divide detected callout parts into draft bags, and show a checklist for
preparing those physical bags.
Current app behavior includes production v2 step-callout detection, detected
part rows with quantity and part crops, step multipliers, `step-callout-bagging-v6`
draft bag planning, manual-local part color classes with advisory LEGO names, a
bag/color checklist view, precomputed same-part grouping inside bag checklists
through `@bag-it/part-matching`, explicit session-file restoration for checked
bag rows, and private-aware detector regression gates for local color/crop tuning
snapshots, private row-label color evaluation, and private same-part match
reports/labels. Increment 8 adds raster-only repeat-subassembly page advisories
for off-style bordered panels with nearby outside `Nx` labels; alpha20 gates
those advisories by internal page role, suppresses BOM/table-like pages, keeps
repeat-only build pages eligible, and records conservative trailing BOM safe
skips through `skippedPageNumbers`. These advisories only mark Build steps
pages for review and never change bag quantities automatically. Same-part
grouping now uses a two-lane policy: silent auto
groups must remain zero-known-false-positive, while orange review-suggested
groups may appear only below the measured correction budget and include fast
reject/remove controls. The current suggested lane is backed by a committed
manual-crop CNN ONNX scorer that runs in the part-grouping worker and feeds
`cachedPairScore` into the pure package grouping API.

Status audit on 2026-06-28 found that the core functionality planned for
Increments 3 through 7 is implemented in code. Increment 7 is closed after fresh
full verification plus the eleven-manual browser e2e fixture gate.

## Documents

- [Root agent instructions](../../AGENTS.md): root agent instructions for the
  repository, including wiki format, skill setup, brevity, validation, and
  commit guidance.
- [Scope](scope.md): product boundary, retained scope, deleted scope, and rebuild
  assumptions.
- [Product principles](product-principles.md): product constraints and user
  experience principles.
- [Quality gates](quality-gates.md): measurable readiness gates that replace the
  removed BOM/Rebrickable reconciliation gate.
- [Privacy and sessions](privacy-session-spec.md): source-byte lifecycle,
  user-owned session files, purge behavior, and stale-analysis invalidation.
- [UI spec](ui-spec.md): retained app layout, controls, tabs, states, and
  interaction behavior.
- [Build steps spec](build-steps-spec.md): step-callout detection inputs,
  outputs, algorithm stages, Build steps tab, multipliers, and validation.
- [Detector v2 spec](detector-v2/README.md): clean rebuild pipeline, stage
  contracts, validation taxonomy, and browser-only private validation policy.
- [Part image and quantity extraction plan](part-image-quantity-extraction-plan.md):
  findings and implementation plan for tight part crops and exact `Nx`
  quantity labels inside detected callouts.
- [Bagging spec](bagging-spec.md): draft bag policy, checklist UI, grouping,
  progress, row identity, and review states.
- [Engineering and CI spec](engineering-ci-spec.md): stack, scripts, tests,
  deployment, environment variables, and pipeline requirements.
- [Implementation blueprint](implementation-blueprint.md): fresh module,
  component, and test boundaries to build from these docs.
- [Rebuild plan](rebuild-plan.md): recommended fresh-repo implementation
  sequence and open decisions.
- [Increment 0: Project Shell](increments/00-project-shell.md): completed
  bootstrap increment.
- [Increment 1: Private PDF Intake](increments/01-private-pdf-intake.md):
  completed PDF validation and metadata increment.
- [Increment 2: Minimum Step Fixture And Regression Harness](increments/02-minimum-step-fixture-and-regression-harness.md):
  completed shared fixture and regression increment.
- [Increment 3: Step Callout Detection](increments/03-step-callout-detection.md):
  completed production v2 detector, part extraction, and color calibration
  increment.
- [Increment 4: Build Steps Tuning UI](increments/04-build-steps-tuning-ui.md):
  completed review and multiplier UI increment.
- [Increment 5: Draft Bagging](increments/05-draft-bagging.md):
  completed draft bagging policy increment.
- [Increment 6: Bags Checklist](increments/06-bags-checklist.md):
  completed checklist and completion persistence increment.
- [Increment 7: Expanded Step Fixture And Regression Harness](increments/07-expanded-step-fixture-and-regression-harness.md):
  completed expanded fixture and regression gate increment.
- [Increment 8: Repeat Subassembly Advisories](increments/08-repeat-subassembly-advisories.md):
  active raster-only page-advisory increment for repeated subassembly panels.
- [Caveman full default](decisions/2026-05-27-caveman-full-default.md):
  project communication decision.
- [Browser-only manual processing](decisions/2026-05-27-browser-only-manual-processing.md):
  privacy and architecture decision for PDF/render/detector work.
- [Small module architecture rule](decisions/2026-06-02-small-module-architecture-rule.md):
  rule for single-concern modules and the legacy detector freeze.
- [Step callout package boundary](decisions/2026-06-04-step-callout-package-boundary.md):
  app/package responsibilities for callout detection and saved-session baseline
  policy.
- [Callout parts package boundary](decisions/2026-06-04-callout-parts-package-boundary.md):
  package-owned quantity labels, part-image regions, alpha masks, v2 app
  replacement, package responsibilities, and saved-session baseline policy.
- [Browser-only private detector validation](decisions/2026-06-05-browser-only-private-detector-validation.md):
  private manual tuning, regression checks, and visual crop validation through
  real Playwright browser upload only.
- [Manual baseline fixture metadata](decisions/2026-06-06-manual-baseline-fixture-metadata.md):
  superseded package-fixture metadata policy for manual-derived baselines.
- [V2 production promotion](decisions/2026-06-09-v2-production-promotion.md):
  production route, legacy removal, persistent analysis progress, blob preview
  runtime data, and bounded worker processing decision.
- [Manual-local part color calibration](decisions/2026-06-10-manual-local-part-color-calibration.md):
  package boundary, manual-local color class truth, advisory palette naming,
  and private tuning report decision.
- [Supplemental aggregate color prototypes](decisions/2026-06-17-supplemental-aggregate-color-prototypes.md):
  no-regression rule for promoting aggregate color centroids without private row
  identifiers or manual-specific runtime logic.
- [Split E2E bag-analysis fixtures](decisions/2026-06-17-split-e2e-bag-analysis-fixtures.md):
  manifest-driven Playwright gate, split manual-derived fixtures, custom visual
  comparison, and package fixture root removal.
- [Part matching package boundary](decisions/2026-06-20-part-matching-package-boundary.md):
  pure package boundary, exact app groups, and private label-gated near-match
  policy.
- [App exact-only part grouping](decisions/2026-06-24-app-exact-only-part-grouping.md):
  rollback of app-visible deterministic near matching and six-day MVP path
  toward a private ML pair-scorer spike.
- [Part match embedding spike](decisions/2026-06-25-part-match-embedding-spike.md):
  five-day private image-embedding plan for same-part matching after
  deterministic and tabular-ML matchers failed safety gates.
- [Part match remote GPU training](decisions/2026-06-26-part-match-remote-gpu-training.md):
  SSH-driven Windows/WSL CUDA worker path for private LEGO-specific model
  training from the Mac Codex workspace.
- [Same-part two-lane promotion gate](decisions/2026-06-26-same-part-two-lane-promotion-gate.md):
  replacement for a global zero-false-positive rule: silent auto groups remain
  zero-known-false-positive, while reviewed suggestions may ship below `0.5%`
  measured correction burden with explicit UI and fast correction controls.
- [Review extraction backlog](decisions/2026-06-27-review-extraction-backlog.md):
  future module boundaries identified by the 2026-06-27 focused review.

## Rebuild Principle

`AGENTS.md` and `docs/wiki/**` are the only canonical project context.

Build the new app around this independent pipeline:

1. User uploads a private PDF manual.
2. App scans manual pages for build-step callout rectangles.
3. App extracts visible callout part rows, quantities, crops, source
   references, and manual-local advisory color metadata.
4. User reviews/tunes discovered steps in the Build steps tab.
5. App groups detected callout items into draft physical bags.
6. User prepares bags from the Bags checklist and builds from the original
   manual.

BOM discovery, OCR inventory extraction, catalogue normalization, Rebrickable
preview reconciliation, and BOM-oriented debug UI are not part of the fresh MVP
unless a later requirement reintroduces them behind an explicit boundary.
