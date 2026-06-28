# Implementation Blueprint

This document is self-contained. It assumes the fresh repository starts with no
source files, fixtures, screenshots, branch history, or private artifacts from
any earlier work, and that only these specifications survive.

The names below are recommended module and component boundaries for new code.

## Application Structure

Recommended top-level app areas:

- `app`: Next.js route shell, metadata, and global layout
- `components/ui`: Chakra provider, theme, and low-level shared UI helpers
- `components/bagging`: Bag It-specific panels, cards, tabs, and checklist UI
- `features/pdf`: browser PDF validation, parsing, rendering, and transient job
  lifecycle
- `features/steps`: step-callout detector, progress model, source-region types,
  fallback palette, and detector fixtures
- `features/bagging`: bagging heuristic, multiplier state, completion transfer,
  and session file logic
- `tests`: unit/component tests and Webwright validation tasks
- `scripts`: small local/CI wrappers, including Webwright validation launcher

## Core Components

### `BaggingApp`

Owns top-level orchestration state:

- selected manual file
- PDF metadata/job state
- step detection progress/result
- bagging plan
- callout multipliers
- checked bag completion
- session import/export notices
- active abort controller

Responsibilities:

- wire sidebar actions to analysis/session state
- start and cancel step analysis
- invalidate stale detector results
- derive current analysis and bagging data for child components

`BaggingApp` should stay a controller/container, not the UI surface itself.
Keep render composition in `BaggingAppLayout`, progress-row formatting in a
focused progress model, current/stale detector helpers in a focused analysis
result module, preview queue helpers in a focused preview runtime module, and
checked-row restore/prune state in a dedicated completion hook. UI refactors
must preserve the upload, analysis, session, Build steps, and Bags behavior
while moving responsibilities behind narrower interfaces.

### `BaggingAppLayout`

Renders the workbench interface from explicit props:

- upload/status/session/attention sidebar
- Build steps and Bags output tabs
- handler wiring from the app controller

It should not start jobs, parse sessions, own analysis state, derive bagging
plans, or mutate completion state.

### `AppFrame`

Provides:

- full-page muted background
- constrained content width
- responsive sidebar/work-area layout
- scroll behavior for dense work surfaces

### `UploadCard`

Provides:

- PDF drag/drop and file picker
- selected filename
- primary action button
- purge/remove action
- inline status/recovery text

### `ProcessingStatusCard`

Provides the three analysis progress rows:

- Scanning pages
- Extracting parts
- Generating previews

Reading manual belongs in `UploadCard`. Bags status belongs in the output tab.

### `SessionControls`

Provides:

- Download session
- Continue session

Disabled while analysis is running.

### `OutputTabs`

Fresh default tabs:

- Build steps
- Bags
- optional Diagnostics when developer diagnostics are enabled

Excluded tabs:

- Grouped parts until color-aware part grouping is rebuilt
- Part list
- BOM debug
- Rebrickable matching/debug

### `BuildStepsPanel`

Renders:

- one group per scanned page
- page preview column on large screens
- step/callout rows
- multiplier controls for baggable callouts
- callout crop hover enlargement
- zero-part callout rows as not bagged

### `BagsChecklistPanel`

Renders:

- draft/review bag summary
- bag grouping toggle
- quantity-weighted global progress
- accordion sections
- bag rows with quantity, quantity-label crop, part crop, page handle, and
  source callout handle
- large-list deferred rendering behavior

### `PartChecklistTable`

Reusable dense checklist table:

- checkbox-role rows
- keyboard toggle with Space/Enter
- sortable headers where allowed
- swatch/color cell
- image slot
- quantity detail slot
- source/location slot
- group dividers

## Core Feature Modules

### `pdf-intake`

Responsibilities:

- validate PDF file type and size
- read page count and metadata
- parse PDF in browser
- render pages to bounded canvases
- publish transient job state
- abort and purge active job resources

### `steps/v2`

Responsibilities:

- scan selected pages
- detect callout rectangles from visual evidence
- crop callouts
- detect quantity-anchored part items
- crop part-only and quantity-label images
- estimate color using fallback palette
- emit source regions and progress
- produce detector-versioned results

### `step-callout-bagging`

Responsibilities:

- sort baggable callouts
- preserve page containment
- apply multipliers
- choose set-size policy from detected quantity unless explicit inventory count
  exists
- create draft/review bag plan
- generate checklist row ids and coordinate anchors

### `completion-transfer`

Responsibilities:

- persist checked row ids plus coordinate anchors
- validate row ids when detector version is unchanged
- transfer checked completion after detector reruns by matching page and crop
  coordinates within tolerance

### `session-file`

Responsibilities:

- create user-owned session files
- restore valid session files
- reject malformed sessions
- invalidate stale detector results
- preserve completion anchors for detector-version migration

## Excluded Feature Areas

Do not build these in the fresh MVP:

- BOM page discovery
- parts-list OCR
- BOM table parsing
- Rebrickable catalogue normalization
- catalogue preview APIs
- OCR asset routes
- part-list correction spreadsheets
- user-facing PDF viewer
- replacement build instructions

## Test Boundaries

Unit and component tests:

- detector helpers and fixtures
- bagging policy
- multiplier logic
- completion coordinate transfer
- session validation
- UI state and checklist behavior

Webwright validation tasks:

- app shell upload smoke
- step-fixture scan
- Build steps page groups
- Bags checklist rendering
- multiplier-to-bag quantity update

## Recommended Fresh File Names

These are suggested fresh paths:

- `src/app/page.tsx`
- `src/app/layout.tsx`
- `src/components/ui/theme.ts`
- `src/components/ui/provider.tsx`
- `src/components/bagging/bagging-app.tsx`
- `src/components/bagging/app-frame.tsx`
- `src/components/bagging/upload-card.tsx`
- `src/components/bagging/processing-status-card.tsx`
- `src/components/bagging/session-controls.tsx`
- `src/components/bagging/output-tabs.tsx`
- `src/components/bagging/build-steps-panel.tsx`
- `src/components/bagging/bags-checklist-panel.tsx`
- `src/components/bagging/part-checklist-table.tsx`
- `src/features/pdf/pdf-intake.ts`
- `src/features/pdf/browser-pdf-parser.ts`
- `src/features/steps/v2/browser-step-detector-adapter.ts`
- `packages/step-callouts/src/index.ts`
- `packages/callout-parts/src/index.ts`
- `src/features/steps/fallback-lego-palette.ts`
- `src/features/bagging/step-callout-bagging.ts`
- `src/features/bagging/step-callout-multipliers.ts`
- `src/features/bagging/completion-transfer.ts`
- `src/features/bagging/session-file.ts`
- `scripts/run-webwright-validation.py`
