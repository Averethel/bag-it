# Split E2E Bag Analysis Fixtures

## Status

Accepted.

## Context

Package-specific saved-session fixture gates let detector and part-extractor
regressions pass too easily. They compared package-owned outputs and stale
session state instead of proving that the promoted `/` app can resume a private
manual, run current analysis, hydrate previews, and save a correct fresh
session.

The old `step-callouts` and `callout-parts` fixture roots also duplicated large
manual-derived session/render artifacts. The current accepted set is ten
callout-parts sessions, all user-approved for committed regression use.

## Decision

Move committed manual-derived correctness fixtures to
`tests/e2e/fixtures/bag-analysis/**` and split each case into:

- `input.bagit-session.json`: minimal resumable session with only `kind`,
  `version`, `savedAt`, `manual`, and `metadata`
- `callouts.json`: expected callout page/order plus full callout crop regions
- `parts.json`: expected rows by callout ordinal with quantity text/value, part
  crop region, quantity-label region, and compact `uint8-base64` alpha masks

Run the correctness gate through Playwright against `/` in real Google Chrome,
not Playwright's bundled Chromium. The detector depends on browser PDF/canvas
rasterization; Hall Tower page 78 step 137 reproduced a missing small part in
Chrome/Brave 149 while bundled Chromium 148 passed. The test loads
`manifest.json`, loops cases with `test(fixture.id, ...)`, resumes the minimal
session, waits for current scan, part extraction, and preview hydration,
downloads a fresh session, then compares that downloaded result against the
split fixtures.

Use a custom Canvas/ImageData comparator. Do not use Playwright snapshot
baselines. Callouts tolerate only `2px` per edge, and parts tolerate only `4px`
per edge when masked visual coverage remains equivalent. Generated ids are not
fixture identity.

Expose test-only runtime state on `window.__bagItE2EState` for the current
analysis result, preview hydration status, and hydrated preview blob URLs. Saved
session files remain privacy-oriented and do not persist preview `blob:` URLs.

## Consequences

The package roots
`packages/step-callouts/src/__tests__/fixtures/callouts/**` and
`packages/callout-parts/src/__tests__/fixtures/callout-parts/**` are removed.
Pure package unit tests remain.

`npm run test:e2e` is now the full local browser fixture gate. `npm run
validate:e2e-fixtures` runs the Playwright spec against an already-built or
externally supplied app. `validate:saved-sessions:browser` remains only as a
compatibility alias.

Failure artifacts are Playwright attachments, not committed baselines. Review
reports record the browser project, browser version, user agent, and device
pixel ratio so accepted fixture decisions can be tied to the actual runtime.
Adding a new accepted manual case requires adding the three split fixture files
and one manifest entry.

Fixture refreshes from diagnostic reports are case-scoped. On 2026-06-17,
`manual-009` was reviewed against the real-Chrome
`2026-06-17-full-real-chrome-v2` report; all three differences were accepted as
benign part crop/alpha drift, so only `manual-009/parts.json` was refreshed from
the downloaded Chrome 149 session. `manual-003` was reviewed from the same
report; 12 differences were accepted, while page 41 / callout 76 / row 8 stayed
pinned as an extractor fix with target crop `x=561 y=109 width=107 height=55`.
`manual-004` was reviewed from the same report; benign drift was accepted while
three Hall Tower failures stayed pinned: page 78 / callout 136 missing the
lower-right part, page 87 / callout 152 row 0 including the callout number, and
page 118 / callout 212 row 3 including neighboring-part pixels.
`manual-008` was reviewed from the same report; gradient-background edge noise
was accepted while page 5 / callout 12 / row 1 stayed pinned because the current
crop includes the top callout edge.
`manual-007` was reviewed from the same report and all differences were
accepted; the page 33 / callout 31 arch alpha background chunk remains noted as
later global arch-mask work.
`manual-006` was reviewed from the same report; benign drift was accepted while
three border-inclusion failures stayed pinned: page 3 / callout 1 / row 0, page
6 / callout 5 / row 0, and page 18 / callout 26 / row 3.
`manual-005` was reviewed from the same report; benign edge drift was accepted
while four lower-priority noisy-edge failures stayed pinned because the saved
crop/mask is still better: page 28 / callout 52 / row 2, page 35 / callout 63 /
row 0, and page 40 / callout 73 / rows 0 and 1.
`manual-001` was reviewed from the same report; callout-region drift and benign
part drift were accepted while nine lower-priority noisy-edge failures stayed
pinned because the saved crop/mask is still better: page 2 / callout 2 / row 1,
page 6 / callout 10 / row 2, page 6 / callout 11 / row 4, page 7 / callout 12 /
rows 3, 5, and 6, page 7 / callout 13 / rows 2 and 3, and page 12 / callout 22
/ row 3.
`manual-002` was reviewed from the same report; drift was accepted while seven
Lower Courtyard failures stayed pinned: page 31 / callout 48 / row 1 and page
62 / callout 101 / row 1 alpha masks spill over the bottom-left side, page 88 /
callout 155 / row 2 and page 89 / callout 159 / row 1 have severe edge
background noise, page 100 / callout 186 regresses saved `7x` to current `4x`,
page 131 / callout 255 / row 1 clips the white part on the left, and page 157 /
callout 304 has wrongly clipped alpha masks across the whole callout.
`manual-010` was reviewed from the same report; edge-noise drift was accepted
while page 32 / callout 68 / row 2 stayed pinned because the part is clipped by
the alpha mask and the saved crop/mask remains correct.

On 2026-06-18, after part extractor `2.0.0-alpha.162`, `manual-001`,
`manual-002`, `manual-004`, `manual-005`, `manual-006`, `manual-007`,
`manual-009`, and `manual-010` were reviewed against the real-Chrome
`2026-06-18-alpha162-dense-plate-padding-full-real-chrome` report. All listed
remaining part crop/alpha differences were accepted as good current output, so
only those manuals' `parts.json` fixtures were refreshed from the downloaded
Chrome session. `manual-003` had no report issues and `manual-008` was not part
of this acceptance pass.

On 2026-06-28, `manual-011` was added as the approved Animals-style
bag-analysis e2e fixture after user review of the remaining Animals misses. On
2026-06-30, callout 39 row 0 and callout 171 row 1 were refreshed after visual
approval because the saved fixture cropped off visible top geometry. The
fixture captures detector `2.0.0-alpha.20`, part extractor `2.0.0-alpha.165`,
and part color calibration `2.0.0-alpha.65` output: 275 callouts and 464 part
rows from the real `/` app flow.
