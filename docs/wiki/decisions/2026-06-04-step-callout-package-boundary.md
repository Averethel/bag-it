# Step Callout Package Boundary

Date: 2026-06-04

Status: Superseded for private/manual validation by
[Browser-only private detector validation](2026-06-05-browser-only-private-detector-validation.md).

## Decision

Step-callout detection is extracted into private workspace package
`@bag-it/step-callouts`. The package exposes neutral `StepCallout*` APIs and
does not use `v2` naming internally.

Shared package test helpers formerly lived in private workspace package
`@bag-it/test-support`. That replay/test-support package is removed.

## Responsibilities

`@bag-it/step-callouts` owns:

- page input normalization for already-rendered page pixels
- callout candidate generation
- evidence scoring
- conflict resolution, with classification, leading-page support, duplicate
  resolution, and diagnostic refiners kept as separate policy modules
- diagnostics and detector stage snapshots
- synthetic and pure package tests

The app owns:

- browser PDF reading and rendering
- scan progress messages, percentages, active page, and page counts
- `/v2` route compatibility
- part extraction
- preview hydration
- saved session lifecycle
- mapping package callouts into Build steps output

## Fixture Policy

Saved-session fixtures are approved expected baselines. They are not refreshed
without user approval and are not executed by package-level manual replay.
Private manual acceptance and regression validation uses the mounted `/v2` app
through a real Playwright browser upload/download gate that compares fresh
browser output against the saved state.

## Consequences

- The package API stays small and testable without app, React, Next, PDF.js,
  Chakra, session, preview, bagging, or legacy detector dependencies.
- The `/v2` app adapter remains the integration boundary for browser rendering
  and user-visible scan behavior.
- Private manual regressions are caught through browser upload validation
  instead of package replay fixtures.
