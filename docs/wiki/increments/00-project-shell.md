# Increment 0: Project Shell

## Status

Complete. This increment established the repository shape, local agent skills,
Next.js/React/Chakra shell, initial UI placeholders, scripts, and CI wiring.

## Scope

Deliver:

- `docs/wiki` canonical documentation structure
- repo-local skills under `.agents/skills`
- Next.js 16, React 19, Chakra UI v3, and TypeScript setup
- Bag It theme tokens
- one-screen app frame
- upload/status/session sidebar
- Build steps and Bags tabs with pending and attention placeholders
- baseline unit/component tests
- Webwright validation wrapper placeholder for Increment 0 smoke coverage
- CircleCI and Vercel configuration

## Out Of Scope

- PDF parsing or page rendering
- step-callout detection
- real draft bagging
- session serialization
- detector fixtures
- BOM, Rebrickable, parts-list OCR, or PDF-reader surfaces

## Acceptance

- `pnpm run verify` passes locally
- upload action is disabled until a PDF is selected
- selected PDF name and purge action render after upload selection
- invalid non-PDF selection shows retry guidance without analysis
- session controls are disabled while analysis is running
- stale-session, no-callouts, and no-baggable-callouts attention placeholders are
  present in the UI
- CI config includes install, lint, typecheck, unit test, build, deployed
  Webwright validation, and Vercel deploy jobs

## Validation Notes

- 2026-05-27: `pnpm install` completed with pnpm 11.4.0 and
  `pnpm-lock.yaml`.
- 2026-05-27: `pnpm run verify` passed: Chakra typegen, TypeScript, ESLint,
  Vitest component tests, and Next production build.
- 2026-05-27: `pnpm run webwright:validate` passed the Increment 0 app-shell
  wrapper against the built app at `http://localhost:3000`.
- 2026-05-27: In-app browser smoke passed against the dev server at
  `http://localhost:3001`: heading renders and the initial `Bag it!` action is
  disabled before PDF selection.
