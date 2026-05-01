# Manual-To-Bags Workflow

## Purpose

This document defines the target workflow for a progressive web app that turns a
LEGO MOC instruction manual PDF into builder-friendly parts bags.

The app's primary input is the PDF manual. A Rebrickable parts CSV is optional
and is used only for validation, not as the main source of truth.

The core value proposition is:

- read the parts inventory from the manual itself;
- read the build steps from the same manual;
- preserve the build order;
- split the build into bags of about 40 to 60 pieces;
- show every bag as a clear parts list with images;
- validate extracted parts through the Rebrickable catalog API;
- optionally compare the extracted inventory against a Rebrickable CSV;
- keep uncertain recognition visible for user review.

## Privacy And Copyright Constraint

Manual PDFs may be copyrighted. The app must process manuals locally in the
browser.

Required constraints:

- never upload the PDF to an application server;
- never store the PDF in application storage;
- never persist rendered manual pages or cropped manual images;
- keep PDF bytes and page renderings in memory for the active session only;
- allow derived structured data to be stored only if it does not contain manual
  page imagery or redistributed manual content;
- ensure the PWA service worker does not cache user-uploaded manuals;
- require the user to reselect the PDF when reopening a project.

Rebrickable catalog data, normalized part metadata, generated bag lists, and user
review decisions may be persisted locally because they are derived operational
data rather than copies of the manual.

## Inputs

### Required

- LEGO MOC instruction manual PDF.

### Optional

- Rebrickable parts CSV export for validation.

### External Data

- Rebrickable catalog API for part validation, color normalization, and part
  images.

## Target Stack

- Next.js with modern React.
- Chakra UI v3.
- Strict TypeScript.
- ESLint for code quality and formatting rules.
- Vitest for unit tests.
- Playwright for browser and integration tests.
- PWA support for installability and offline access to the app shell.

The app shell may be cached. User-uploaded PDF content must not be cached.

## High-Level Pipeline

```text
Upload PDF
    |
Analyze PDF locally
    |
Detect build instruction pages and parts-list pages
    |
Extract complete inventory from parts-list section
    |
Validate and enrich parts through Rebrickable catalog API
    |
Optionally compare against Rebrickable CSV
    |
Extract per-step part callouts from build instruction section
    |
Group consecutive steps into 40-60 piece bags
    |
Validate bag totals against extracted inventory
    |
Render interactive and printable bag lists
```

The central rule is:

```text
Every extracted inventory quantity must be assigned to a bag, unresolved, or
explicitly ignored by the user.
```

## Step 1: Local PDF Intake

The user uploads a PDF manual through the browser.

The app should:

- load the PDF using browser APIs;
- keep the file reference and decoded PDF data in memory only;
- render page previews only for active-session inspection;
- avoid storing original page images or PDF bytes;
- expose progress for local analysis because large manuals may take time.

The first implementation should support text-based/vector PDFs. OCR and
computer-vision fallbacks can be added after the core flow is working.

## Step 2: Automatic Section Detection

The app must automatically detect where build instructions end and the parts
list begins. This is not a normal user-configurable setting.

The implementation should classify pages into:

- `instruction`;
- `parts-list`;
- `cover-or-meta`;
- `unknown`.

Instruction page signals include:

- visible step numbers;
- build callout clusters;
- large assembly render areas;
- arrows or substep markers;
- relatively small numbers of parts per page;
- visual progression from one step to the next.

Parts-list page signals include:

- dense grids or tables of many small part thumbnails;
- repeated quantity markers;
- repeated part row/card layout;
- part numbers, color names, or descriptions;
- no step progression;
- high ratio of inventory entries to page area.

Boundary detection should:

- analyze the whole PDF locally;
- identify the first stable run of `parts-list` pages after instruction pages;
- mark earlier build pages as the instruction section;
- mark trailing inventory pages as the parts-list section;
- assign confidence to the detected boundary;
- show a review affordance only when confidence is low or later validation
  fails.

The normal happy path should not ask the user to configure page ranges.

## Step 3: Parts List Extraction

The parts-list section is the app's source of truth for the complete inventory.

The extractor should produce inventory rows with:

- quantity;
- part number, when present;
- color name, when present;
- description, when present;
- source page number;
- source region;
- extraction confidence;
- recognition notes.

Extraction should prefer embedded PDF text and vector layout data. If the manual
uses rasterized pages, later versions may add local OCR or computer-vision
recognition.

The app must not silently guess. Rows with uncertain quantity, part number,
color, or description should enter a review queue.

## Step 4: Rebrickable Catalog Matching

Extracted inventory rows should be matched against the Rebrickable catalog API.

The matcher should use available signals:

- part number;
- color;
- description;
- visual part image similarity later, if needed;
- aliases or known mold variants;
- quantity context.

The result for each row should be one of:

- exact catalog match;
- normalized match through alias or color mapping;
- ambiguous match requiring user review;
- unresolved match;
- failed API lookup.

Rebrickable data should provide:

- normalized part number;
- normalized color id;
- canonical part name;
- part image URL;
- known alternates or variants when available.

Part images shown in generated bag lists should come from Rebrickable catalog
data rather than cropped manual imagery.

## Step 5: Optional Rebrickable CSV Validation

If the user uploads a Rebrickable parts CSV, the app should compare it against
the inventory extracted from the PDF.

Validation should report:

- exact matches;
- quantity mismatches;
- PDF-only rows;
- CSV-only rows;
- likely alias matches;
- likely color-normalization matches;
- unresolved differences.

The CSV should improve confidence and catch extraction errors, but it should not
replace the PDF-derived inventory as the primary workflow.

## Step 6: Build Step Detection

The build instruction section should be parsed into ordered build steps.

Each detected step should include:

- step number;
- page number;
- source region;
- detected part callouts;
- extraction confidence.

The app should preserve manual order. If the manual contains submodels or
repeated assemblies, the parser should keep those steps grouped where possible.

When step boundaries are unclear, the app should expose a review screen rather
than generating misleading bags.

## Step 7: Per-Step Part Recognition

For every detected build step, the app should extract the required parts and
quantities from the step callout area.

Each step callout should include:

- quantity;
- matched inventory item;
- Rebrickable catalog match;
- confidence;
- source page;
- source region;
- extraction notes.

The step recognizer should validate itself against the extracted total
inventory. Across all steps, the summed quantities should reconcile with the
parts-list inventory, except for explicitly unresolved or ignored rows.

## Step 8: Bag Allocation

The allocation engine groups consecutive build steps into bags.

Default target:

```text
40 to 60 total pieces per bag
```

Bag allocation rules:

- preserve build order;
- never split a single build step across bags;
- prefer keeping repeated micro-assemblies together;
- allow a bag outside the target range when build logic requires it;
- avoid placing visually similar tiny parts from much later steps into early
  bags;
- carry unresolved step callouts into the generated bag warnings;
- keep enough source references for user review.

Each generated bag should include:

- bag sequence number;
- step range;
- page range;
- total piece count;
- unique part count;
- list of bag items;
- validation status;
- warnings, if any.

The user should be able to adjust bag boundaries after generation. Manual
adjustments should immediately rerun validation.

## Step 9: Validation

Validation is the app's main trust mechanism.

The app should validate:

- extracted parts-list inventory against Rebrickable catalog matches;
- extracted parts-list inventory against optional Rebrickable CSV;
- summed step callouts against extracted parts-list inventory;
- generated bag totals against summed step callouts;
- generated bag totals against extracted parts-list inventory.

Validation statuses:

- green: fully reconciled;
- yellow: unresolved or user-approved exceptions exist;
- red: missing quantities, overages, or unresolved critical mappings.

Every inventory quantity must be accounted for as one of:

- assigned to a bag;
- unresolved;
- intentionally ignored with a user-provided reason.

## Step 10: Bag Rendering

The final user-facing output is a clean set of bag lists.

The bag view should show:

- bag number;
- step range;
- page range;
- total pieces;
- unique parts;
- part image;
- part number;
- color;
- description;
- quantity;
- warnings for unresolved items.

Supported output modes:

- interactive checklist;
- printable HTML;
- browser-generated PDF;
- CSV export per bag;
- full reconciliation report.

Checklist states should include:

- not packed;
- packed;
- verified.

Later versions can add printable bag labels with bag number, step range, piece
count, and QR payload.

## Suggested Data Model

```text
Project
  id
  name
  created_at
  updated_at
  derived_data_only

PdfSession
  file_name
  page_count
  active_file_reference
  not_persisted

PageClassification
  page_number
  type
  confidence
  signals

InventoryItem
  id
  quantity
  extracted_part_number
  extracted_color_name
  extracted_description
  normalized_part_number
  normalized_color_id
  rebrickable_part_id
  rebrickable_image_url
  source_page
  source_region
  confidence
  status
  notes

InstructionStep
  id
  step_number
  page_number
  source_region
  confidence

StepCallout
  id
  step_id
  inventory_item_id
  quantity
  source_region
  confidence
  status

Bag
  id
  sequence
  label
  step_start
  step_end
  page_start
  page_end
  piece_count
  unique_part_count
  validation_status

BagItem
  id
  bag_id
  inventory_item_id
  quantity

ReviewDecision
  id
  type
  before_value
  after_value
  reason
  created_at
```

Persisted project data must exclude PDF bytes, rendered manual pages, and manual
image crops.

## MVP Scope

A practical MVP should implement:

1. PDF upload and local-only session handling.
2. Automatic page classification and instruction/parts boundary detection.
3. Parts-list extraction for text-based/vector PDFs.
4. Rebrickable catalog matching and image rendering.
5. Optional Rebrickable CSV validation.
6. Build step detection for supported PDFs.
7. Per-step callout extraction for supported PDFs.
8. Bag allocation targeting 40 to 60 pieces.
9. Bag validation against extracted inventory.
10. Interactive and printable bag lists.

The MVP can limit support to machine-readable PDFs. OCR and advanced computer
vision should be treated as follow-up work.

## Implementation Milestones

1. App foundation: Next.js, Chakra UI v3, strict TypeScript, ESLint, Vitest,
   Playwright, PWA shell.
2. Privacy foundation: local-only PDF handling, no manual persistence, no service
   worker caching of uploaded files.
3. PDF page preview and page classification.
4. Automatic build/parts section boundary detection.
5. Parts-list extraction and inventory review queue.
6. Rebrickable catalog API matching and image display.
7. Optional Rebrickable CSV comparison.
8. Build step detection.
9. Step callout extraction and inventory reconciliation.
10. Bag allocation engine.
11. Bag boundary editor.
12. Bag list rendering and exports.
13. End-to-end Playwright coverage for the main workflow.

## Testing Strategy

Unit tests should cover:

- page classification scoring;
- section boundary detection;
- parts-list row parsing;
- Rebrickable matching normalization;
- CSV comparison;
- step callout reconciliation;
- bag allocation;
- validation status calculation.

Playwright tests should cover:

- uploading a PDF;
- detecting sections;
- reviewing extracted inventory;
- matching catalog images;
- uploading optional CSV validation data;
- generating bags;
- adjusting bag boundaries;
- exporting bag lists.

Privacy tests should verify:

- PDF bytes are not written to IndexedDB or localStorage;
- manual page renderings are not persisted;
- service worker cache excludes uploaded PDFs;
- no network request sends PDF content.

## Later Product Features

- Local OCR for rasterized manuals.
- Computer-vision extraction of part callouts.
- Visual similarity checks against Rebrickable part images.
- Better submodel and repeated-assembly detection.
- Manual correction tools for step regions and callout regions.
- Printable bag labels.
- QR links for bag checklist views.
- BrickLink wanted-list export by bag.
- Missing-parts triage by bag impact.
- Mobile packing workflow.
- Project templates for common MOC manual formats.

## Risks And Guardrails

PDF variability is the largest technical risk. Manuals can be text-based,
vector-heavy, rasterized, Studio-generated, scanned, or laid out in custom
formats. The app should show extraction confidence and keep correction flows
fast.

Part identity is the second major risk. Part numbers, mold variants, color
names, and printed/decorated variants can differ between manuals and
Rebrickable. The app needs deterministic normalization and a visible review log.

Validation must stay central. A nice bag list is not useful unless every item can
be traced back to the extracted manual inventory and, when provided, checked
against the optional Rebrickable CSV.
