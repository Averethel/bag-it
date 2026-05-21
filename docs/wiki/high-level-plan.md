# High-Level Plan

## Product Boundary

Bag It analyzes a MOC PDF manual and produces companion bagging guidance. It does not replace the manual.

The first complete product slice is:

1. Upload a private PDF manual for analysis without retaining the original PDF as
   long-lived product data.
2. Extract the parts list.
3. Normalize parts against Rebrickable.
4. Detect build steps.
5. Recognize likely parts used per step.
6. Pass the MVP readiness gates for supported manuals.
7. Group contiguous steps into bags using set-size-aware part-count targets.
8. Show a bag prep checklist with standardized part thumbnails.

See [Quality gates](quality-gates.md) for the minimum confidence, fixture, no-BOM, and performance criteria that must be in place before generated bag assignments are considered ready.

## Increment Sequence

| Increment | Name | Outcome |
| --- | --- | --- |
| 0 | Bagging shell | Clickable bagging flow with mock data. |
| 1 | Upload and processing | Private PDF intake, validation, transient processing access, and background processing status. |
| 2 | Parts list extraction | Structured bill of materials from manual data. |
| 3 | Rebrickable normalization | Canonical parts, colors, aliases, and thumbnails. |
| 4 | Step recognition | Detected step sequence and page references. |
| 5 | Per-step parts recognition | Candidate parts and quantities per build step. |
| 6 | Bagging algorithm | Contiguous step ranges grouped into set-size-aware bags. |
| 7 | Bag prep experience | User-facing checklist, labels, and exportable prep data. |
| 8 | Hands-off confidence layer | Hardens automatic retry, reconciliation, and compact uncertainty handling beyond the MVP gate. |
| 9 | Performance hardening | Scales progressive, cached, resumable processing beyond the baseline guardrails introduced earlier. |
| 10 | Recognition tuning system | Expands fixtures, annotations, metrics, and regression checks beyond the MVP baseline. |

## MVP Definition

The MVP is useful when a builder can:

1. Upload a private MOC PDF for analysis.
2. Get a normalized parts list with recognizable thumbnails.
3. Get a bag list where each bag maps to a contiguous step range.
4. Prepare physical bags without correcting many rows.
5. Build from the original manual.

The MVP applies only to manuals with a detectable bill of materials. Manuals without a BOM are unsupported for the MVP and should not produce inferred bag assignments.

Bag prep is not complete until the runtime readiness gate in [Quality gates](quality-gates.md) passes. If the gate fails, the app should explain why reliable bagging is not ready instead of presenting uncertain bags as usable output.

Minimum asynchronous processing, status reporting, page render caching, and Rebrickable lookup caching are baseline requirements for the MVP. Increment 9 is a hardening pass, not the first performance work.

## Explicit Non-Goals

- No user-facing PDF viewer in the MVP.
- No manual editing.
- No generated replacement build images.
- No persistent storage of private manual PDFs as app data or repository
  fixtures.
- No row-by-row correction workflow as the primary experience.
