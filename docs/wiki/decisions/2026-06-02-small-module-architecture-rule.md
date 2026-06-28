# Small Module Architecture Rule

## Decision

New detector and step-processing code must be implemented as small,
single-concern, composable modules.

`src/features/steps/step-callout-detection.ts` was the frozen legacy
detector/extractor monolith. It was removed when v2 was promoted to production;
new detector, quantity OCR, part extraction, crop, color, or conflict-resolution
behavior must stay in focused modules under tests.

## Enforcement

Do not add a Vitest architecture-enforcement test for this rule. Enforce new
detector shape with scoped ESLint instead.

V2 detector lint enforcement:

- `eslint-plugin-sonarjs` applies only to `src/features/steps/v2/**/*.{ts,tsx}`
- `sonarjs.configs.recommended.rules` is the baseline rule set
- `sonarjs/cognitive-complexity` is tightened to `["error", 10]`
- duplicate branch/function, collapsible condition, nested control flow,
  identical expression, redundant boolean, and regex complexity rules stay
  explicitly enabled
- inline SonarJS disables require a durable wiki decision

## Rationale

The current detector file mixed callout detection, recovery, duplicate cleanup,
quantity parsing, part crop ownership, color sampling, and result assembly.
That made local fixes interact across unrelated responsibilities and encouraged
threshold tuning instead of principled changes.

Small modules are required so future detector work can isolate:

- callout candidate production
- callout evidence evaluation
- conflict resolution and crop ownership
- quantity-label parsing
- part extraction
- preview hydration
- result/session assembly

## Consequences

Any future detector split must preserve existing output contracts while moving
behavior behind focused module interfaces. Legacy behavior can be characterized
and compared, but legacy structure is not the design model for new work.
