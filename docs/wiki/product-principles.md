# Product Principles

## What Is A MOC?

In LEGO building, a MOC is a "My Own Creation": a custom fan-made model. MOC builders often distribute PDF manuals and parts lists, but these manuals are not always as standardized or builder-friendly as official LEGO instructions.

## Core Value Proposition

Bag It helps a builder turn a MOC manual into a LEGO-like bagging experience.

The builder still follows the original manual. Bag It provides companion data that makes preparation easier:

- normalized parts list
- standardized part thumbnails and catalogue references
- detected step ranges
- parts required by step
- bag assignments with contiguous step ranges and set-size-aware part-count
  targets
- printable or exportable bag prep lists

The MVP supports manuals with a detectable bill of materials. Manuals without a BOM should be reported as unsupported for bag generation until inventory-from-steps inference becomes an explicit future increment.

## Source Of Truth

The uploaded PDF manual is the private source of truth.

Bag It may analyze pages, run OCR, crop internal debug regions, and preserve page references. It must not alter, rewrite, replace, or re-render the manual for the user-facing build experience.

Manual PDFs must not be committed, bundled, used as ordinary repository
fixtures, or silently persisted as long-lived product data. Background
processing may use transient, job-scoped access to PDF bytes only when the
retention and deletion rules are explicit. User-triggered session downloads are
an explicit privacy boundary: they may package the manual and private derived
artifacts into a user-owned file so the user can continue later, but the app
must not create hidden manual-analysis storage. Page renders, crops, hashes,
filenames, and extracted metadata are private derived artifacts unless they are
synthetic, public, licensed for this use, explicitly anonymized, or stored only
inside a user-owned session bundle.

## User Experience Boundary

The MVP should not be a PDF reader.

Users already have PDF viewers. The product should focus on the parts and bagging workflow:

- What parts exist?
- Which parts are needed for each step?
- How should parts be grouped into physical bags?
- Which detected data is uncertain enough to affect bag correctness?

## Hands-Off Bias

The app should avoid asking users to correct many rows manually.

When recognition is uncertain, the system should:

- retry automatically with alternate extraction methods where practical
- reconcile against the full bill of materials
- isolate only meaningful ambiguities
- show a compact attention list instead of a spreadsheet cleanup flow

## Performance Bias

The app needs to feel responsive.

Prefer:

- progressive results
- page-level parallel processing
- transient private page renders during active recognition work
- cached Rebrickable lookups
- resumable jobs
- background processing

Avoid:

- blocking the user until full-manual analysis completes
- persisting private manual analysis or page-render data before that policy is
  explicitly designed
- synchronous external catalogue calls in critical UI paths

See [Quality gates](quality-gates.md) for the baseline performance expectations required before MVP bag output is considered ready.
