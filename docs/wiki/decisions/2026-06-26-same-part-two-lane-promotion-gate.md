# Same-Part Two-Lane Promotion Gate

## Status

Accepted.

## Context

The original same-part matcher requirement sounded like "zero false positives"
for every app-visible result. That is still the right bar for silent grouping,
because a wrong automatic group can put the wrong physical parts into a bag.

It is too strict for suggestions that are explicitly framed as lower-confidence
and quick to correct. MVP value may still be high if the app can surface many
useful same-part suggestions while making the small correction burden obvious
and cheap.

## Decision

Use two separate promotion lanes:

- Auto-safe lane: rows may be grouped as normal checklist groups only when the
  scorer has `0` known false groups and `0` known hard-negative false-positive
  pairs across active labels, reviewed decisions, excluded singleton rows, and
  holdout/manual review.
- Reviewed suggestion lane: below-threshold same-part candidates may be shown
  only when measured correction burden stays below `0.5%` of suggested grouped
  row memberships. This lane must be visually distinct from auto-safe groups,
  must show lower-confidence status, and must provide fast split/reject
  controls.

The `0.5%` budget is user-visible correction cost. The primary measurement is
`wrong suggested row memberships / total suggested grouped row memberships`.
Group-level and pair-level reporting are still kept for diagnostics because
they explain how a wrong row entered a group and whether a model is failing on
many independent pairs or one clustered mistake.

## Consequences

False positives no longer globally block every possible same-part UI. They
still block silent automatic grouping.

Scorer reports and model experiments must report auto-safe performance and
reviewed-suggestion correction burden separately. A model with high recall but
more than `0.5%` suggested row-membership corrections remains private tooling
only.

App UI cannot expose the suggestion lane until it has the correction controls
needed to keep mistakes cheap: clear low-confidence copy, expand-to-inspect,
split/remove row, and reject group/pair actions.
