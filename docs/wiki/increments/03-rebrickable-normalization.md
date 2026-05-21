# Increment 3: Rebrickable Normalization

## Goal

Normalize extracted parts and colors against the Rebrickable catalogue.

## Status

Closed on 2026-05-18.

## User Value

The user sees standardized parts, recognizable thumbnails, and consistent naming instead of raw OCR output.

## Deliverables

- Rebrickable catalogue snapshot download and refresh path
- Bounded Rebrickable API use for misses or metadata that is unavailable in
  downloads, never as the full-manual normalization path
- Local catalogue cache
- Part number lookup
- Alias handling
- Part name matching
- Color normalization
- Candidate ranking
- Standardized part thumbnails or renders
- Unresolved and ambiguous part list
- Cached lookups for repeated normalization and UI display

## Implementation Notes

- Parts-list extraction results now include a normalization summary with:
  - total, resolved, ambiguous, and unresolved quantity
  - per-row canonical part/color status
  - selected part candidate and alternate catalogue candidates
  - catalogue snapshot id when available
- The sidebar shows normalization coverage and an attention list for unresolved
  or ambiguous rows. Because it is outside the main row table, it can show every
  row that needs attention without turning the inventory into a manual cleanup
  workflow.
- Fresh analysis loads only catalogue colours in the browser so OCR parsing can
  recognize colour labels. The browser does not load or receive the full
  Rebrickable parts catalogue.
- The `/api/catalogue/parts` endpoint is a server-side normalization endpoint:
  the browser posts compact extracted rows, the server reads the pinned
  catalogue snapshot, and the response returns the normalization summary plus
  snapshot metadata. `GET` does not expose the raw catalogue.
- Server-side normalization accepts manual-visible single-letter mold suffixes
  when the local Rebrickable snapshot only contains the base part; for example,
  `2436b` resolves to canonical `2436` when `2436b` is absent from the snapshot
  and `2436` exists.
- `npm run catalogue:download` now downloads into a temporary catalogue
  directory, validates required columns and minimum row counts, writes
  `snapshot.json`, stores the result under a versioned snapshot directory, and
  promotes it through the active catalogue path. Once the local catalogue path
  is symlink-backed, later promotions swap the active pointer atomically.
- Bumping the extractor to `parts-list-extraction-v30` forces recalculation for
  pre-normalization results, but checked-row progress is transferred to the new
  analysis where rows can be matched by source anchor or part/color identity.
  Quantity, part-number, catalogue-part, or colour changes are reported to the
  user after recalculation.
- The manual validation harness records normalization resolved quantity and
  checks that unresolved or ambiguous rows are represented in the normalization
  attention list.
- Existing bounded, cache-backed part preview lookup remains display
  enrichment only; it does not change canonical normalization decisions. Local
  preview metadata is read from the same pinned catalogue snapshot as
  normalization when that snapshot id is available. Refreshed snapshots include
  Rebrickable `elements.csv`, allowing `(part, color)` inventory rows to use
  color-specific element thumbnails; older snapshots fall back to the bounded
  Rebrickable part-color API and then to the generic part image.
- Color-specific preview responses now carry the generic part image as fallback
  metadata when available, so a missing or stale element thumbnail can degrade
  to the generic part preview without blocking the row.
- The local development catalogue was refreshed on 2026-05-17 to snapshot
  `2cf8e02c1ab5e9e4`, including `elements.csv`. Runtime colour-alias loading
  now validates `external_color_aliases.csv` and can recover missing or
  malformed aliases in memory from the bounded Rebrickable colour API when
  `REBRICKABLE_API_KEY` is available; request-time recovery does not rewrite
  pinned snapshot files.
- During active OCR analysis, part preview calls are gated by page readiness:
  rows may stream into the UI before thumbnails are requested, but thumbnail
  lookup only starts for a source page after that page has finished full OCR and
  any focused retry pass. Requests are grouped by completed source page, so a
  four-page parts list produces four thumbnail batches instead of one
  full-analysis batch. Split OCR candidate processing now finalizes one
  candidate page at a time before moving to the next page so the user gets
  usable per-page catalogue output without later backtracking for preview data.
- Progressive page updates preserve user checked-row selections. When a later
  page publication changes row identity, quantity, part number, catalogue part,
  or color, checked rows are transferred to the best matching current row and
  the user is warned when a checked row changed or cannot be matched.
- The visible processing status uses two user-facing phases: finding inventory
  pages, then analysis per page. The page-analysis progress bar advances only
  as inventory pages finish.

## Acceptance Criteria

- Extracted part rows map to canonical Rebrickable-compatible records when possible.
- At least 90% of extracted BOM quantity resolves to canonical Rebrickable part/color records across the MVP fixture set.
- Standardized thumbnails are shown for resolved parts.
- Ambiguous records are isolated into the sidebar attention list.
- Displaying an already-normalized parts list does not depend on synchronous external Rebrickable calls.

## Closure Validation

- Full local verification passed in an isolated temp copy:
  - Chakra typegen
  - ESLint
  - Vitest: 31 files, 332 tests
  - Next production build
  - TypeScript `tsc --noEmit`
  - `git diff --check`
- Private Castle validation passed exactly for all multipart manuals:
  - Castle 01: 81/81 rows, 200/200 quantity, no diff
  - Castle 02: 231/231 rows, 608/608 quantity, no diff
  - Castle 03: 561/561 rows, 2571/2571 quantity, no diff
  - Castle 04: 354/354 rows, 1229/1229 quantity, no diff
  - Castle 05: 622/622 rows, 4284/4284 quantity, no diff

## Technical Notes

- Keep catalogue calls out of latency-sensitive UI paths.
- Cache lookups aggressively.
- Store the selected canonical part and alternate candidates for later review.
- This increment owns the first Rebrickable performance guardrail: cached catalogue data must be available before bag prep depends on it.

## Catalogue Update And Deployment Policy

Rebrickable catalogue data should be treated as an eventually fresh local
snapshot, not as a live dependency in the user-facing parsing path.

- Use Rebrickable downloadable CSVs for bulk catalogue data. Do not normalize
  full manuals through bursty per-part API calls.
- Store local development catalogue downloads under `.bag-it/private/catalogue/`
  and keep them outside version control.
- Store snapshot metadata next to the downloaded tables:
  - downloaded timestamp
  - source URLs
  - table names
  - required-column validation result
  - row counts
  - content hashes
  - catalogue schema version
  - HTTP `ETag` or `Last-Modified` values when available
- Refresh cadence:
  - local development: manual `npm run catalogue:download` or explicit refresh
  - deployed environments: scheduled background refresh, daily or weekly
  - user parsing jobs: never trigger high-volume live catalogue refreshes
- Refresh atomically:
  - download into a temporary catalogue directory
  - validate required columns and minimum row-count sanity checks
  - parse a small smoke sample
  - write snapshot metadata
  - swap the active snapshot only after validation succeeds
  - keep the previous valid snapshot available for rollback
- Pin each extraction or normalization job to the catalogue snapshot version it
  starts with. If a newer snapshot arrives while the job is running, the job
  should finish against its original snapshot.
- Re-running a job later may use a newer snapshot and can improve unresolved or
  ambiguous rows, but existing results should record which catalogue snapshot
  produced them.
- If no usable catalogue snapshot exists, the app may still show raw extracted
  rows, but canonical normalization and ready bagging must be marked unavailable
  or needs attention.
- Production runtime and source-policy requirements are tracked in the
  [production catalogue contract](../catalogue-production.md). That contract
  currently keeps raw local catalogue downloads out of git and requires a
  Rebrickable API key when `external_color_aliases.csv` must be generated from
  colour `external_ids`.

## Open Questions

- The first implementation is file-backed. A deployed database-backed catalogue
  cache remains a future scaling decision after the local snapshot contract is
  exercised by bag prep.
- Bag prep currently needs canonical part number, color id/name/RGB, quantity,
  part name, color-specific or generic image URL, selected candidate, alternate
  candidates, and catalogue snapshot id. Color-specific part availability beyond
  preview enrichment remains future work unless bagging needs it for correctness.
- How should unavailable or retired colors be surfaced?
- Should production fail closed when `external_color_aliases.csv` is missing or
  malformed and `REBRICKABLE_API_KEY` is unavailable, or is degraded colour
  alias coverage acceptable for first deploy?
