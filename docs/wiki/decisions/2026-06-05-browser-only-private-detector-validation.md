# Browser-Only Private Detector Validation

Date: 2026-06-05

## Decision

Private manual detector and part-extractor tuning executes only through the app
path. A saved Bag It session fixture may be used as expected baseline data, but
the current result must be produced by uploading a temp copy of that session to
`/v2` in a real Playwright-controlled browser session and downloading the fresh
browser-produced session after analysis finishes.

The browser gate compares the downloaded result to the saved state in two
ordered phases:

1. Verify callout count and callout crop regions, ignoring parts.
2. Verify part rows, quantities, stored `partImage.region`, and alpha-mask
   opaque bounds, ignoring callout-region drift already accepted by phase 1.

Local validation defaults to `http://localhost:3000/v2`. Next.js development
mode blocks HMR for `127.0.0.1` unless it is listed in `allowedDevOrigins`, and
that can prevent the hydrated validation state from appearing before upload.

Small coordinate drift is allowed through IoU and expected-coverage thresholds,
so added visual buffer does not require refreshing saved examples. Shrinking
regions or alpha masks that lose expected part coverage still fails.

## Scope

This decision applies to private/manual acceptance and regression validation for:

- step-callout counts
- row quantities
- part counts
- part-image crop bounds
- alpha-mask preview output
- user-annotated manual feedback

Saved session fixtures are expected data only. PPM render baselines,
package-level renderer replay, fixture refresh flows, and Node-based manual
renderer relays are not acceptance paths for private manuals. Synthetic unit
tests may still exercise small pure functions and raster-shape edge cases, but
they are not acceptance for private manuals.

## Consequences

- `/v2` remains the source of truth for private manual behavior.
- Saved `.bagit-session.json` fixtures may remain committed as approved
  expected baselines.
- The repository may contain the browser gate that uploads saved sessions and
  downloads fresh browser results for comparison.
- The repository must not contain private PDF source files outside approved
  saved-session fixtures, private manual renderer replay scripts, refreshed
  baselines without user approval, derived crops, or row-level private debug
  output.
- When local non-browser output disagrees with the browser upload path, the
  browser upload path wins.
