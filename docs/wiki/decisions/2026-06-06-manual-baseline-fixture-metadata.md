# Manual Baseline Fixture Metadata

Date: 2026-06-06

Status: Superseded by
[Split E2E bag-analysis fixtures](2026-06-17-split-e2e-bag-analysis-fixtures.md).

## Decision

Committed manual-derived saved-session and render fixtures used to declare
explicit source and approval metadata in package manifest entries.

Each committed manual-derived case must include:

- `sourceKind: "user-approved-manual"`
- `approvalStatus: "approved"`
- `committedExpectedBaselines.session: true`
- `committedExpectedBaselines.renders: true`
- `committedExpectedBaselines.partBaseline: true` when a part baseline JSON is
  committed for the case

## Rationale

Manual-derived fixtures are useful regression baselines, but they must not look
like anonymous private artifacts. Explicit metadata records that the fixture is
approved expected data and makes future unapproved refreshes easier to catch.

## Consequences

- Manifest audit tests fail when a committed manual case lacks approval/source
  metadata or references missing committed artifacts.
- Existing tracked manual cases remain in place as approved expected baselines.
- New or refreshed manual-derived fixtures still require user approval before
  commit.
