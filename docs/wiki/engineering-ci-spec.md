# Engineering And CI Specification

## Runtime Stack

Use this target stack unless the fresh repository has a strong reason to change:

- Node 24.x
- pnpm 11.x through Corepack
- package metadata uses ESM (`"type": "module"`) so Vite/Vitest config loads
  without CommonJS API warnings
- Next.js 16
- React 19
- Chakra UI v3
- lucide-react icons
- pdfjs-dist for browser PDF parsing/rendering
- TypeScript
- Vitest with jsdom
- Playwright for browser-driven e2e/manual validation
- CircleCI
- Vercel

Manual detector tuning may use direct Playwright-controlled browser sessions to
upload private manuals through `/` and inspect the mounted app. These sessions
must not be implemented as PDF renderer/replay harnesses and must not commit
private source bytes or derived images.

## Package Scripts

Fresh repository scripts should use this shape:

```json
{
  "dev": "WATCHPACK_POLLING=true next dev --webpack",
  "start": "next start",
  "build": "next build --webpack",
  "postinstall": "chakra typegen ./src/components/ui/theme.ts --strict --clean --tsconfig ./tsconfig.json",
  "typegen": "chakra typegen ./src/components/ui/theme.ts --strict --clean --tsconfig ./tsconfig.json",
  "lint": "eslint .",
  "test": "vitest run",
  "test:e2e": "next build --webpack && npm run validate:e2e-fixtures",
  "test:e2e:deployed": "PLAYWRIGHT_BASE_URL=${PLAYWRIGHT_BASE_URL:-${WEBWRIGHT_BASE_URL:-http://127.0.0.1:3000}} playwright test tests/e2e/bag-analysis.spec.ts --project=chrome",
  "webwright:validate": "npm run test:e2e",
  "benchmark:steps": "node --no-warnings --loader ./scripts/ts-extension-loader.mjs scripts/benchmark-step-scan.mjs",
  "report:part-colors": "node --no-warnings --loader ./scripts/ts-extension-loader.mjs scripts/write-part-color-report.mjs",
  "report:e2e-fixture-diffs": "next build --webpack && playwright test tests/e2e/bag-analysis-report.spec.ts --project=chrome --reporter=line",
  "validate:detector-regressions": "node scripts/validate-detector-regressions.mjs",
  "validate:detector-tuning": "node scripts/validate-detector-regressions.mjs --strict",
  "validate:e2e-fixtures": "playwright test tests/e2e/bag-analysis.spec.ts --project=chrome",
  "validate:saved-sessions:browser": "npm run test:e2e",
  "typecheck": "tsc --noEmit",
  "verify": "chakra typegen ./src/components/ui/theme.ts --strict --clean --tsconfig ./tsconfig.json && tsc --noEmit && eslint . && vitest run && npm run validate:detector-regressions"
}
```

Remove catalogue download/build scripts from the core path unless a future
feature reintroduces Rebrickable.

The `validate:e2e-fixtures` command runs the manifest-driven Playwright
bag-analysis fixture gate in real Google Chrome with one worker. It must not use
Playwright's bundled Chromium because PDF/canvas rasterization can differ from
current user browsers and hide detector regressions. CircleCI Playwright Docker
jobs install Google Chrome before running fixture and deployed e2e gates because
the official image ships bundled Chromium, not branded Google Chrome. CircleCI
may set `BAG_IT_E2E_ALLOW_UNTRUSTED_COLOR_DRIFT=1` for those browser fixture
gates to account for Linux Chrome manual-color raster drift; the exception is
limited to untrusted `review` color classes. For those same rows, CI also allows
Linux Chrome alpha-mask raster drift by keeping the normal actual-extra budget
(`<=0.025` actual-extra ratio) while relaxing expected opaque coverage to at
least `0.90`. Trusted colors, missing colors, quantities, callout regions, part
regions, and quantity-label regions stay strict. Fixture cases with input
sessions over `50 MiB` compare the in-page `window.__bagItE2EState.result`
instead of forcing a browser session download, because CI Chrome can crash while
serializing very large session files. Smaller fixture cases still exercise the
Download button and attach the downloaded session. The legacy
`webwright:validate` and `validate:saved-sessions:browser` entries remain
compatibility aliases; new work should call `test:e2e` or
`validate:e2e-fixtures`.

`report:e2e-fixture-diffs` is a diagnostic review command. It runs the same
browser resume/analyze/download workflow across every manifest case, but it does
not fail on fixture differences. Instead it writes an ignored HTML report under
`.bag-it/private/e2e-fixture-diff-reports/**` with manual source, page,
callout/row location, failure reason, full-callout previews, and saved/current
visual comparisons. The report supports human triage; it does not update or
approve fixtures.

Private detector and part-extractor tuning validation is browser-session based:
start the app, upload the actual private manual through `/`, wait for mounted
Build steps output and hydrated previews, then inspect DOM rows and screenshots.
Approved e2e fixture cases live under `tests/e2e/fixtures/bag-analysis/**` and
are split into a minimal PDF-only session, callout-region JSON, and part-row
JSON. The Playwright gate resumes the minimal session through `/`, forces fresh
analysis from the embedded manual bytes, waits for scan, part extraction, and
preview hydration, downloads the browser-produced session, and compares callouts
and parts with strict region/masked-visual tolerances. Replay runners, PPM
fixtures, Playwright snapshot baselines, package fixture roots, and
saved-session refresh flows are excluded from the active validation workflow.

Detector tuning also has a private-aware regression gate:
`npm run validate:detector-regressions` validates any local part-color report
snapshots, part-color row labels, part-crop report snapshots, and the
bag-analysis e2e fixture gate. If no private report snapshots or label files exist on a
machine, those gates skip with explicit messages. `gate` color labels fail on
mismatch or missing rows; `active` color labels score only. `npm run
validate:detector-tuning` is stricter and fails when the required local tuning
gates are absent, currently Middle Wall color and Lower Courtyard crop
snapshots. `npm run verify` includes the non-strict detector regression gate.

The app dev server must ignore generated local artifact roots such as
`.bag-it/**`, `.npm-cache/**`, and `.pnpm-store/**`; TypeScript must exclude
the same roots. Private tuning reports, replay crops, and local package/cache
stores can contain thousands of files; watching or type-scanning them can
exhaust local file descriptors and make `/` serve only the Next.js 404 page
during browser validation. The local `dev` script sets `WATCHPACK_POLLING=true`
so validation does not depend on macOS file watcher limits.

The initial bagging UI shell must keep PDF parsing, detector adapters, and
runtime preview asset generation behind lazy client dependency boundaries. The
shell may expose default dependency functions, but those defaults must import
browser PDF/detector modules only when a user starts analysis, restores a
session, or generates previews.

## Environment Variables

Required for deployed e2e:

- `VERCEL_AUTOMATION_BYPASS_SECRET`

Required for Vercel deploy in CircleCI:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Remove these from the fresh core app unless catalogue integration returns:

- `BAG_IT_CATALOGUE_DIR`
- `BAG_IT_CATALOGUE_PROMOTION`
- `REBRICKABLE_API_KEY`

## Vercel Config

Keep:

- framework: Next.js
- install command does not download browser binaries during the Vercel build
- deployment disabled through Vercel git integration so CircleCI owns deploys

Fresh target:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "corepack pnpm install --frozen-lockfile",
  "buildCommand": "corepack pnpm run build",
  "git": {
    "deploymentEnabled": false
  }
}
```

Use a custom `buildCommand` only if the fresh app adds a required build-time
asset step.

## CircleCI Pipeline

Use this workflow structure:

1. `install_dependencies`
2. `lint`
3. `typecheck`
4. `unit_tests`
5. `build`
6. bag-analysis Playwright fixture gate
7. preview deploy on non-`main`
8. deployed preview e2e on non-`main`
9. production deploy on `main`
10. deployed production e2e on `main`

Executors:

- Node executor: `cimg/node:24.14.1`
- Playwright browser executor with Chromium available, pinned to the repo's
  Playwright major/minor version.

Dependency install:

- invoke pnpm through Corepack directly, for example
  `corepack pnpm install --frozen-lockfile`, instead of running
  `corepack enable`; CircleCI's Node image can have an unwritable global pnpm
  shim at `/usr/local/bin/pnpm`
- restore/save pnpm store by lockfile checksum
- run `corepack pnpm install --frozen-lockfile --store-dir .pnpm-store`
- persist the project workspace for downstream jobs

Playwright dependency install:

- install Node dependencies with
  `corepack pnpm install --frozen-lockfile --store-dir .pnpm-store` in browser
  jobs when the persisted workspace is not enough
- install or use real Google Chrome for bag-analysis browser jobs; bundled
  Playwright Chromium is allowed only for non-detector smoke checks
- cache Playwright artifacts separately from the pnpm store when useful

Deploy command:

- set Vercel CLI version explicitly
- keep the CircleCI `vercel_cli_version` pipeline parameter as the single
  Renovate-managed Vercel CLI version source; initial replacement keeps the
  legacy repo's `53.0.1` value to avoid a deploy-tool downgrade
- disable update notifier and telemetry
- run `npx --yes "vercel@${VERCEL_CLI_VERSION}" deploy`
- use `--prod` only for production
- parse the deployment URL from CLI output
- persist `vercel-deployment-url`

E2E:

- read persisted deployment URL
- set `PLAYWRIGHT_BASE_URL`
- require Vercel automation bypass secret
- run `corepack pnpm run test:e2e:deployed`
- store `playwright-report` and `test-results`

Renovate:

- keep `renovate.json` at the repository root so the existing Renovate
  dashboard and bot installation continue to manage dependency updates
- use `pnpm-lock.yaml` as the lockfile source after replacement
- keep a regex manager for `.circleci/config.yml` that updates
  `vercel_cli_version`
- do not reintroduce catalogue or Rebrickable dependency groups unless that
  scope returns

## Playwright Config

Keep:

- real Google Chrome only for the heavy bag-analysis fixture gate
- one worker by default
- local `next start` web server when `PLAYWRIGHT_BASE_URL` is unset
- `PLAYWRIGHT_BASE_URL`, default `http://127.0.0.1:3000`
- Vercel protection bypass handling when deployed e2e needs protected preview
  access
- traces, screenshots, videos, downloaded sessions, and comparator diff PNGs on
  failure

## Unit Test Strategy

Use Vitest/jsdom for:

- pure detector helpers
- bagging policy
- multiplier normalization/serialization
- session file validation
- React component behavior
- upload/session/status state transitions

Do not commit private manual PDFs, newly refreshed saved sessions without user
approval, page renders, PPM baselines, crops, part rows, previews, or row-level
private debug output. Private manual acceptance and regression validation
happens through real browser upload to `/`, not package-level replay
fixtures.

Vitest treats unexpected `console.warn` and `console.error` output as blocking.
Tests may suppress only explicit, documented environment noise; React `act`
warnings and component runtime warnings must be fixed at the test or component
boundary before an increment is considered complete.
Package manager config must also avoid process-level warnings during normal
`npm run` validation commands.

## Architecture Rule

Fresh detector work must use small, single-concern modules. New detector shape
is enforced with `eslint-plugin-sonarjs` scoped to
`packages/**/*.{ts,tsx}` and `src/features/steps/v2/**/*.{ts,tsx}`.

SonarJS lint policy:

- apply `sonarjs.configs.recommended.rules` only to packages and v2 detector
  files
- set `sonarjs/cognitive-complexity` to `["error", 10]`
- explicitly keep duplicate branch/function, collapsible condition, nested
  control flow, identical expression, redundant boolean, and regex complexity
  rules enabled
- do not apply SonarJS to UI, bagging, scripts, or existing non-v2 app tests yet
- inline SonarJS disables in v2 detector files require a durable wiki decision
- the legacy `src/features/steps/step-callout-detection.ts` monolith has been
  removed; new detector, quantity OCR, part extraction, crop, color, or
  conflict-resolution behavior must stay in smaller modules

## E2E Strategy

Phase 1 keeps a small smoke test that verifies:

- app title and first screen
- PDF file selection
- disabled/enabled primary action
- purge button after upload

Phase 1 is enough for Increment 0 while detector fixtures do not exist yet.

Phase 2 becomes required as soon as the first shared step-callout fixture is
added:

- upload a synthetic or approved public PDF
- run step scan
- see Build steps page groups
- see Bags checklist
- change a multiplier and observe bag quantity update

After Phase 2 is active, CI must block detector, bagging, or session changes
that break this deployed step workflow.

## Repository Hygiene

- Keep `.bag-it/private/**` ignored for private local artifacts.
- Private manual validation baselines, if needed for discussion, stay outside
  committed code and are not replayed by repository scripts.
- Keep `manuals/**` ignored for private local manual corpora.
- Do not commit manual PDFs, rendered pages, crops, or row-level private debug
  output.
- Keep docs and fixtures explicit about whether they are synthetic, public,
  licensed, or user-approved.
- Private manual detector validation helpers must be temporary Playwright
  browser-upload scripts under `/private/tmp`. Do not commit replay/debug
  scripts, private renders, saved sessions, or row-level debug output.

## Commit Discipline

Use semantic Conventional Commit messages for all commits in the fresh
repository.

Commit shape:

```text
<type>: <imperative summary>
```

Preferred types:

- `feat`
- `fix`
- `docs`
- `test`
- `refactor`
- `chore`
- `build`
- `ci`

Examples:

- `feat: add step callout detector shell`
- `test: cover coordinate completion transfer`
- `ci: add Playwright deployed validation`

Commit summaries should be imperative, scoped to the actual change, and avoid
mixing unrelated work.
