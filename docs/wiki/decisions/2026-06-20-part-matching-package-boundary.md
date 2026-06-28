# Part Matching Package Boundary

## Status

Accepted.

## Context

Same-part grouping needs visual comparison across callout rows, private
annotation reports, and app checklist rendering. The work is heavier than a UI
helper and must not depend on React, Chakra UI, Next.js, browser PDF rendering,
session-file lifecycle code, or private report filesystem concerns.

Same physical part means same shape and color. Quantity is row metadata, not
part identity. Similar but different pieces such as 1x3 and 1x4 plates must
stay separate.

## Decision

Create `@bag-it/part-matching` as a pure package. It owns:

- `PART_MATCHER_VERSION`
- `extractPartVisualFeatures(input)`
- `createPartMatchGroups(input)`
- exact digest grouping
- label-gated near-match comparison rules

The app may render exact digest groups immediately inside the Bags tab when the
user enables `Group parts`. Near-match groups remain private/report-only
until a label-gated rule family passes private gate review. Once promoted, the
scorer config is packaged as pure `@bag-it/part-matching` data and the app uses
only that packaged config, not ignored private scorer JSON.

Private tooling writes same-part reports and labels under ignored
`.bag-it/private/part-match-reports/**`. Gate labels fail on false grouping,
missed grouping, missing rows, stale matcher/input versions, crop drift, or
duplicate labels. Active labels remain score-only evidence.

## Consequences

The app keeps raw checklist rows, row ids, completion anchors, checked state,
and session restore unchanged. Same-part groups are derived views.

The package boundary allows package-level tests for exact identity, color
conflicts, scale-gated near matching, and plate-length separation without
loading app UI or private PDF/session code.

## 2026-06-23 Amendment

The conservative v2 scorer family passed the private active-label and reviewed
hard-negative gate with 0 false groups and 0 reviewed `different` false
positives. It is promoted into the package as the default scorer config for the
Bags `Group parts` toggle. App near groups still keep all original row ids,
require same bag, cross-callout scope, color compatibility, and pairwise scorer
compatibility, and are derived at render time only.

## 2026-06-24 Amendment

The app-visible scorer promotion is superseded. Manual app review found false
positive same-part groups on labeled training data, so deterministic near
matching is not reliable enough for MVP checklist output. The app now uses
`@bag-it/part-matching` for exact-digest groups only. Deterministic near scoring
remains private/report tooling for candidate generation and analysis, not app
authority. A future near matcher requires a new promotion decision, likely after
a private ML pair-scorer experiment.
