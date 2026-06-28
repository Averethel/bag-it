# Increment 1: Private PDF Intake

## Status

Complete. This increment turns selected browser PDF files into validated,
transient manual metadata without sending source bytes to application server
routes.

## Scope

Deliver:

- PDF file validation before analysis starts
- metadata extraction through browser-owned PDF.js parsing
- transient source-byte processing
- cancellation and purge behavior
- valid PDF selection starts intake immediately so upload has visible progress
- successful intake shows a compact read summary with page count and file size
- upload control uses a dashed drag/drop panel and a single `Bag it` CTA
- page render helper for later detector work
- user-triggered session download/import for manual PDF bytes and metadata
- optional local-only private manual verification script

## Out Of Scope

- step-callout detection
- page scanning beyond targeted render helper calls
- draft bagging
- detector result, multiplier, and bag completion serialization
- committed private manual fixtures
- BOM, Rebrickable, parts-list OCR, or PDF-reader surfaces

## Acceptance

- invalid, too-large, corrupt, encrypted, cancelled, expired, and purged states
  are represented in the intake model or UI copy
- `expired` is model/UI-copy only in this increment; no inactivity timer runs
  while source bytes remain non-persistent browser state
- active job byte buffers and parsed PDF objects are purged after processing,
  failure, cancellation, or purge
- selected browser `File` may remain after success for later session download or
  rerun
- valid PDF selection starts metadata intake without requiring a second click
- successful metadata intake is visible in the upload panel, status card, and
  Build steps pending panel
- no private derived artifacts are persisted except future user-triggered
  session downloads
- session download/import restores only manual bytes and PDF metadata in this
  increment
- private local manuals under `manuals/` are ignored by git and may be checked
  by aggregate local scripts only

## Validation Notes

- 2026-05-27: focused Vitest coverage passed for PDF intake validation and
  `BaggingApp` upload/intake state transitions.
- 2026-05-27: `npm run verify` passed: Chakra typegen, TypeScript, ESLint,
  Vitest, and Next production build.
- 2026-05-27: `npm run webwright:validate` passed the app-shell wrapper against
  `http://localhost:3000`.
- 2026-05-27: `npm run verify:private-manuals` parsed 26 ignored private PDFs
  with 4,937 total pages and no failures; no artifacts were written.
- 2026-05-27: In-app browser smoke passed against existing dev server at
  `http://127.0.0.1:3001`: title, upload input, Build steps tab, Bags tab, and
  initial `Bag it!` action rendered; console error count was zero.
- 2026-05-27: valid PDF selection now starts metadata intake immediately because
  waiting for the separate `Find steps` click made upload appear inert.
- 2026-05-27: upload panel now shows a read summary after metadata succeeds so
  users can see intake completed before detector work exists.
- 2026-05-27: upload panel restyled as drag/drop target with `Bag it` CTA; hero
  restyled around the MOC bag prep workflow.
- 2026-05-27: session controls are wired for explicit local download/import of
  manual PDF bytes plus metadata; detector-backed state remains future work.
- 2026-05-27: `expired` remains model-only because this increment does not
  retain source or derived artifacts beyond browser memory; server-side manual
  processing jobs are not planned.
- 2026-05-27: `npm run verify` and `npm run webwright:validate` passed after
  wiring session download/import.
- 2026-05-27: workbench sizing tightened for desktop/mobile references, tab
  panels gained explicit empty states, and Attention is hidden when there are no
  active issues.
- 2026-05-27: selected-manual status badge moved to the drop target corner so
  long PDF filenames do not resize the filename row.
- 2026-05-27: React `act` warning from session-restore test was fixed, and the
  Vitest harness now fails unexpected console warnings/errors.
- 2026-05-27: process-level npm/Vitest warnings were cleared by removing the
  unsupported npm `store-dir` config and loading package config as ESM.
- 2026-05-27: privacy docs clarified that PDF rendering, OCR-like analysis, and
  detector work stay browser-owned; server-side manual processing jobs are out
  of scope.
- 2026-06-11: browser PDF intake now accepts manuals up to 200 MB before
  rejecting them as too large.
