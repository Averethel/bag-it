# Manual-To-Bags Implementation Plan

## Purpose

This document breaks the manual-to-bags product workflow into small,
implementable pieces. It is a delivery plan, not a code design lock-in.

The app remains PDF-first:

- the manual PDF is the primary source of truth;
- Rebrickable CSV input is optional validation only;
- manual PDF bytes, rendered pages, image crops, and raw OCR page output are
  never uploaded or persisted;
- bag allocation preserves build order and targets 40 to 60 pieces per bag;
- every extracted inventory quantity must be assigned to a bag, unresolved, or
  intentionally ignored with a user-provided reason.

## Current Baseline

The repository currently has the application shell in place:

- Next.js App Router;
- Chakra UI v3 provider;
- strict TypeScript configuration;
- ESLint, Vitest, and Playwright scripts;
- a PWA service worker that caches only the app shell and Next static assets.

The domain workflow still needs to be implemented.

## Product Flow

The intended user flow is:

1. Select a LEGO MOC manual PDF.
2. Analyze the PDF locally in the browser.
3. Render pages in memory and run local OCR when embedded text is unavailable.
4. Detect instruction pages, parts-list pages, cover/meta pages, and unknown
   pages.
5. Extract the full inventory from the detected parts-list section.
6. Review uncertain inventory rows.
7. Match extracted inventory rows against Rebrickable catalog data.
8. Optionally upload a Rebrickable CSV and compare it against the PDF-derived
   inventory.
9. Detect ordered build steps from the instruction section.
10. Extract per-step part callouts.
11. Reconcile step totals against the extracted inventory.
12. Generate consecutive build-step bags targeting 40 to 60 pieces.
13. Adjust bag boundaries when needed.
14. Render per-bag HTML output.
15. Export the per-bag split to PDF.

## Implementation Increments

Each increment should leave the app in a testable state. Pure logic should be
implemented outside React components so it can be covered with Vitest before it
is wired into the UI.

### 1. Workflow Shell

Goal: Replace the placeholder home screen with the product workflow structure.

Specification:

- represent workflow states as intake, analysis, inventory review, catalog
  matching, optional CSV validation, step review, bag generation, bag review,
  and export;
- show a single primary path through the app;
- expose incomplete or blocked states without pretending the workflow succeeded;
- keep the first screen as the usable intake experience, not a marketing page.

Implementation plan:

- create a top-level client workflow component;
- model the workflow state explicitly with typed status values;
- add placeholder panels for downstream states before domain logic exists;
- keep visual density appropriate for an operational tool.

Acceptance checks:

- the app renders the intake state by default;
- mock state transitions can display each workflow panel;
- existing app-shell Playwright coverage is updated to the new first screen.

### 2. Local PDF Session And Local Project Data

Goal: Accept a PDF, keep all manual data local and session-only, and persist
allowed derived project data locally only.

Specification:

- accept one user-selected PDF file;
- keep the `File`, decoded bytes, and rendered page previews in memory only;
- store only non-sensitive PDF session metadata, such as file name and page
  count;
- persist derived project data locally in the browser;
- never save project data on an application server;
- require the user to reselect the PDF after reload or project reopening;
- never write PDF bytes, rendered pages, or manual image crops to IndexedDB,
  localStorage, Cache Storage, or server storage.

Implementation plan:

- introduce an in-memory `PdfSession` model;
- introduce a local project data store for derived data, such as inventory rows,
  catalog matches, validation results, bag splits, export settings, and review
  decisions;
- read the selected file through browser APIs;
- hold PDF parsing/rendering objects in React state or an in-memory client
  store;
- add explicit cleanup when the user removes or replaces a PDF.

Acceptance checks:

- selecting a PDF creates an active session;
- reloading the app clears the PDF session;
- reloading the app can restore allowed derived project data;
- browser storage does not contain PDF bytes or rendered pages;
- no network request sends PDF content.

### 3. PDF Rendering And OCR Adapter

Goal: Provide a narrow browser-only interface over PDF parsing, page rendering,
and local OCR.

Specification:

- support image-only/rasterized manuals through local OCR in the first
  implementation path;
- use embedded text/vector data when it is available, but do not depend on it;
- expose page count, OCR text items, embedded text items, page dimensions, and
  basic layout metadata;
- render page previews only for active-session inspection;
- keep rendered pages and raw OCR page output in memory only;
- avoid leaking parser-specific types throughout the app.

Implementation plan:

- define a `PdfDocumentAdapter` interface;
- define normalized page text, OCR text box, confidence, and page geometry
  types;
- implement one PDF rendering adapter and one local OCR adapter;
- discard rendered page bitmaps and raw OCR output after structured extraction
  and classification have finished;
- persist only structured derived data, not page images or raw page transcripts.

Acceptance checks:

- the small, medium, and large manual fixtures can exercise the adapter
  contract;
- parser failures produce actionable user-facing errors;
- OCR failures produce actionable user-facing errors;
- no adapter output contains persisted manual imagery or raw OCR page output.

### 4. Page Classification

Goal: Classify each page as `instruction`, `parts-list`, `cover-or-meta`, or
`unknown`.

Specification:

- assign a confidence score to every page classification;
- retain explainable signals used for the score;
- classify from local OCR text, embedded text when available, and page layout
  signals;
- instruction signals include step numbers, build progression, callout clusters,
  assembly render areas, and relatively low part density;
- parts-list signals include dense rows/grids, repeated quantities, part
  numbers, colors, descriptions, and no step progression.

Implementation plan:

- implement scoring as pure functions over normalized OCR/text/layout page data;
- preserve the signal breakdown for debugging and review UI;
- avoid user-configured page ranges in the happy path.

Acceptance checks:

- unit tests cover individual scoring signals;
- unit tests cover mixed page sets with covers, instructions, inventory, and
  unknown pages;
- low-confidence pages are visible to later review steps.

### 5. Section Boundary Detection

Goal: Automatically find where build instructions end and the parts list begins.

Specification:

- analyze the full PDF locally;
- identify the first stable run of `parts-list` pages after instruction pages;
- mark earlier build pages as the instruction section;
- mark trailing inventory pages as the parts-list section;
- return boundary confidence and reasons;
- request review only when confidence is low or later validation fails.

Implementation plan:

- implement a pure boundary detector over page classifications;
- define thresholds for stable parts-list runs and ambiguous transitions;
- return both selected ranges and alternate candidates for review.

Acceptance checks:

- unit tests cover normal manuals, cover pages, trailing parts lists, unknown
  pages, and ambiguous boundaries;
- detected ranges are available to extraction steps;
- low-confidence boundaries block automatic bag generation.

### 6. Parts-List Extraction

Goal: Extract the full inventory from the PDF parts-list section.

Specification:

- produce inventory rows with quantity, part number when present, color when
  present, description when present, source page, source region, confidence, and
  recognition notes;
- use local OCR text as the primary input for current real-world fixtures;
- prefer embedded text and vector layout data when available;
- route uncertain quantity, part number, color, or description values into the
  review queue;
- do not guess silently.

Implementation plan:

- build OCR text-row and grid extraction strategies;
- add embedded text-row and grid extraction strategies when embedded text is
  available;
- normalize quantities and basic part-number candidates;
- merge duplicate inventory rows only when the source evidence supports it;
- keep source references for every extracted row.

Acceptance checks:

- unit tests cover row parsing, grid parsing, missing fields, duplicate rows,
  malformed quantities, and confidence assignment;
- uncertain rows appear in inventory review;
- extracted inventory can be serialized without manual imagery.

### 7. Inventory Review

Goal: Let users resolve uncertain inventory rows before downstream allocation.

Specification:

- allow edits to extracted quantity, part number, color, and description;
- allow marking a row unresolved;
- allow intentionally ignoring a row only with a user-provided reason;
- retain before/after values in review decisions;
- update validation state immediately after review decisions.

Implementation plan:

- create review UI around the `InventoryItem` and `ReviewDecision` models;
- show confidence and extraction notes near each editable row;
- keep manual page imagery out of persisted review data.

Acceptance checks:

- component tests cover editing, unresolved state, and ignore-with-reason;
- validation status changes after review decisions;
- review decisions survive app state changes when persisted as derived data.

### 8. Rebrickable Catalog Matching

Goal: Normalize and enrich extracted inventory through Rebrickable catalog data.

Specification:

- match using part number, color, description, aliases, known variants, and
  quantity context where useful;
- use the Rebrickable API key from the application environment;
- produce exact match, normalized alias/color match, ambiguous match, unresolved
  match, or failed lookup states;
- use Rebrickable images for final bag lists;
- never use cropped manual imagery as part images.

Implementation plan:

- introduce a Rebrickable API client boundary;
- keep the API key server-side and expose only narrow lookup endpoints to the
  browser;
- add catalog result types independent of UI components;
- cache allowed catalog metadata locally;
- add matching logic as pure normalization functions plus API-backed lookup.

Acceptance checks:

- unit tests cover exact matches, aliases, color normalization, ambiguity,
  unresolved rows, and failed lookups;
- UI distinguishes normalized matches from exact matches;
- bag rendering can use Rebrickable image URLs.

### 9. Optional Rebrickable CSV Validation

Goal: Compare an optional Rebrickable CSV against the PDF-derived inventory.

Specification:

- CSV input is validation only and never replaces the PDF inventory;
- likely required CSV fields are quantity, Rebrickable part id or part number,
  and Rebrickable color id or color name;
- report exact matches, quantity mismatches, PDF-only rows, CSV-only rows,
  likely alias matches, likely color-normalization matches, and unresolved
  differences;
- keep CSV validation independent of page extraction.

Implementation plan:

- define accepted CSV columns once realistic Rebrickable exports are reviewed;
- parse CSV into normalized validation rows;
- compare normalized CSV rows against normalized inventory rows;
- surface differences in the validation UI.

Acceptance checks:

- unit tests cover exact matches, mismatches, PDF-only rows, CSV-only rows, and
  normalization cases;
- uploading CSV cannot create inventory rows as source-of-truth data;
- validation report can be exported as derived data.

### 10. Build Step Detection

Goal: Parse the instruction section into ordered build steps.

Specification:

- detect step number, page number, source region, and confidence;
- preserve manual order;
- keep submodels or repeated assemblies grouped where possible;
- block bag generation when step boundaries are unclear.

Implementation plan:

- implement step-number and region detection over instruction pages;
- represent substeps and grouped assemblies in the step model only when
  confidently detected;
- route ambiguous step regions to review.

Acceptance checks:

- unit tests cover sequential steps, missing step numbers, repeated assemblies,
  substeps, and ambiguous regions;
- every detected step has a stable ordering key;
- low-confidence step detection prevents automatic allocation.

### 11. Per-Step Callout Extraction

Goal: Extract the parts required by each detected build step.

Specification:

- each callout includes quantity, matched inventory item, Rebrickable catalog
  match, confidence, source page, source region, and extraction notes;
- unresolved callouts remain visible;
- summed step quantities must reconcile against the parts-list inventory, except
  for unresolved or intentionally ignored rows.

Implementation plan:

- parse callout clusters from normalized page data;
- match callout candidates against inventory items and catalog matches;
- keep ambiguous matches in a step-review queue.

Acceptance checks:

- unit tests cover callout quantity parsing, inventory matching, ambiguous
  matches, missing matches, and duplicate part use;
- unresolved callouts appear in validation warnings;
- step totals feed the reconciliation engine.

### 12. Reconciliation Engine

Goal: Provide the trust layer for inventory, steps, bags, CSV, and user
decisions.

Specification:

- validate parts-list inventory against Rebrickable matches;
- validate parts-list inventory against optional CSV rows;
- validate summed step callouts against extracted inventory;
- validate generated bag totals against step callouts;
- validate generated bag totals against extracted inventory;
- classify validation as green, yellow, or red.

Implementation plan:

- implement reconciliation as pure functions over typed derived data;
- centralize validation status and warning calculation;
- make the accounting invariant explicit: every inventory quantity is assigned
  to a bag, unresolved, or intentionally ignored with a reason.

Acceptance checks:

- unit tests cover green, yellow, and red validation states;
- overages, missing quantities, unresolved mappings, and ignored quantities are
  reported distinctly;
- bag generation cannot hide reconciliation failures.

### 13. Bag Allocation Engine

Goal: Group consecutive build steps into builder-friendly bags.

Specification:

- target 40 to 60 pieces per bag;
- preserve build order;
- never split a single build step across bags;
- prefer keeping repeated micro-assemblies together;
- allow out-of-range bags when build logic requires it;
- carry unresolved step callouts into bag warnings.

Implementation plan:

- implement allocation as a pure function over ordered steps and step callouts;
- make target range configurable internally but fixed to 40 to 60 for MVP;
- attach source step and page ranges to every bag;
- run reconciliation immediately after allocation.

Acceptance checks:

- unit tests cover normal allocation, oversized single steps, repeated
  assemblies, tiny final bags, unresolved callouts, and exact inventory totals;
- each bag reports sequence number, step range, page range, piece count, unique
  part count, items, validation status, and warnings.

### 14. Bag Boundary Editor

Goal: Let users adjust generated bag boundaries without breaking validation.

MVP status: Deferred until after automatic per-bag splitting works end to end.

Specification:

- allow moving boundaries only between complete build steps;
- immediately recalculate bag items, piece counts, warnings, and validation;
- preserve user edits as derived project data.

Implementation plan:

- expose bag boundaries as editable step ranges;
- prevent invalid overlaps, gaps, and reversed ranges;
- show validation feedback next to the edited bag list.

Acceptance checks:

- component tests cover moving a boundary earlier and later;
- invalid boundary moves are blocked;
- reconciliation updates after every accepted edit.

### 15. Bag Rendering And Exports

Goal: Render the final user-facing output.

Specification:

- show bag number, step range, page range, total pieces, unique parts, part
  image, part number, color, description, quantity, and warnings;
- render the split as per-bag HTML first;
- support PDF export of the generated per-bag split after the HTML output is
  correct;
- defer interactive checklist states, per-bag CSV export, full reconciliation
  report export, printable labels, and QR payloads until after the per-bag HTML
  and PDF flow is working.

Implementation plan:

- build a clear per-bag HTML view from derived bag data;
- add print-specific styles for the per-bag output;
- add browser-generated PDF export from the print-ready HTML;
- keep reconciliation warnings visible in the generated output.

Acceptance checks:

- E2E tests cover generated per-bag HTML rendering;
- export tests verify the PDF export path includes all generated bags;
- print view does not rely on manual PDF imagery.

### 16. End-To-End Workflow Coverage

Goal: Prove the main path works as an integrated browser workflow.

Specification:

- E2E tests should run against the production server path;
- repo-safe synthetic fixtures in `tests/fixtures/mock-mocs/` cover normal CI;
- private small, medium, and large manual fixtures cover the realistic OCR path;
- copyrighted or private manuals must not be committed;
- tests should cover the core happy path and privacy constraints.

Implementation plan:

- use the synthetic small fixture for a fast one-bag OCR workflow;
- use the synthetic medium fixture for realistic multi-bag workflow coverage;
- reserve the synthetic large fixture for performance and stress coverage;
- use private real fixtures locally or in restricted CI to validate real-world
  OCR behavior;
- use `docs/private-fixtures.md` as the fixture contract;
- generate CSV validation-failure variants at test time from the private
  canonical `parts.csv` or synthetic canonical `parts.csv`;
- keep local-only/private fixtures outside version control;
- download private fixture archives in CircleCI only for jobs that explicitly
  need OCR/manual integration coverage;
- use mocked Rebrickable responses for deterministic catalog matching;
- test upload, section detection, inventory review, catalog matching, optional
  CSV validation, bag generation, per-bag HTML rendering, and PDF export.

Acceptance checks:

- `npm run test:e2e` covers the main workflow;
- privacy tests prove PDF bytes and page renderings are not persisted;
- network assertions prove manual content is not uploaded.

## Suggested Delivery Order

1. Workflow shell.
2. Local PDF session and privacy tests.
3. PDF rendering and OCR adapter.
4. Page classification.
5. Section boundary detection.
6. Parts-list extraction.
7. Inventory review.
8. Rebrickable matching.
9. Optional CSV validation.
10. Build step detection.
11. Per-step callout extraction.
12. Reconciliation engine.
13. Bag allocation engine.
14. Per-bag HTML rendering.
15. Per-bag PDF export.
16. Full E2E workflow coverage.

## Product Decisions

Resolved:

- Derived project data may persist locally in the browser.
- Project data is never saved on an application server.
- Rebrickable API credentials are provided through the application environment.
- Manual boundary correction is deferred; the first stage uses automatic
  detection and blocks when confidence is too low.
- The primary output is the per-bag split.
- Per-bag HTML ships before PDF export.
- PDF export is generated from the per-bag HTML output.
- User-provided manual fixtures may be used locally and in restricted CI jobs,
  but must not be committed to the repository.
- The first extraction path must support local OCR because the available manual
  fixtures are image-only/rasterized PDFs.
- CSV mismatch fixtures can be fabricated from the existing parts CSVs, but
  should be generated at test time so the original CSVs remain canonical
  happy-path fixtures.
- Private fixtures are loaded from an ignored local `fixtures/` directory or a
  restricted CircleCI download step, as described in `docs/private-fixtures.md`.
- Repo-safe synthetic mock fixtures are committed under
  `tests/fixtures/mock-mocs/` for normal CI coverage.

Still open:

- the exact Rebrickable CSV columns accepted by the parser;
- the local OCR engine and performance strategy;
