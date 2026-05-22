# Production Catalogue Contract

This page documents the catalogue snapshot required for production recognition
and normalization.

## Runtime Contract

The app reads catalogue CSV files from `BAG_IT_CATALOGUE_DIR`. When the
environment variable is unset, local development falls back to
`.bag-it/private/catalogue`.

Required files:

- `colors.csv`: Rebrickable colour data with `id`, `name`, `rgb`, and
  `is_trans`.
- `parts.csv`: Rebrickable part data with `part_num`.
- `snapshot.json`: Bag It snapshot metadata with snapshot id, schema version,
  downloaded timestamp when available, source URLs, required-column validation,
  row counts, content hashes, and HTTP validators when available. Existing
  development snapshots without this file get a deterministic fallback snapshot
  id from local file hashes; malformed snapshot metadata fails closed.

Optional but expected for hands-off quality:

- `elements.csv`: Rebrickable element data with `element_id`, `part_num`, and
  `color_id`, used for color-specific part thumbnails before falling back to
  bounded live part-color API lookup.
- `part_relationships.csv`: Rebrickable relationships with `rel_type`,
  `child_part_num`, and `parent_part_num`.
- `ldraw_part_aliases.csv`: derived alias map with `alias`, `canonical`, and
  `source`.
- `external_color_aliases.csv`: Rebrickable-derived external colour id map with
  `system`, `external_id`, `rebrickable_id`, `external_name`, and
  `rebrickable_name`.

If `external_color_aliases.csv` is missing or malformed and
`REBRICKABLE_API_KEY` is available, the server may fetch the small Rebrickable
colour API snapshot on demand and write it into `BAG_IT_CATALOGUE_DIR`. This
cache fill is allowed because it is bounded colour metadata, not per-manual or
per-row live catalogue normalization.

The current local development snapshot generated on May 17, 2026 has id
`2cf8e02c1ab5e9e4` and these sanity values:

| File | CSV lines | SHA-256 |
| --- | ---: | --- |
| `colors.csv` | 276 | `55a6ab0c6d765a7a364b59084ee81b1f8ea426d958d310ba0ad9e0794ef5337a` |
| `parts.csv` | 62,397 | `1be7faba49ce4c532c8524181dd5a76b7f49776a45af000d06daa978c746ea62` |
| `elements.csv` | 110,663 | `4a1004d7e5dfd715d0c756ef9af2d67ecef1c67781fd9f885cde8d08a1c79cf9` |
| `part_relationships.csv` | 36,104 | `f3396c8835821a35eecbd14efc06499f9535f6dbcedb252776dcf49e6ea88044` |
| `ldraw_part_aliases.csv` | 5,192 | `bb8a0b05e77c617dda6bbdbd08dc24157be196e90afa3c6599d31e046a0359cc` |
| `external_color_aliases.csv` | 849 | `739bda681fe548ef7d4eda02ef14cbbd01225f2d73d30cea3e375091b08922b2` |

These values are diagnostics from the local snapshot, not pinned product
requirements. Production should record equivalent snapshot metadata when a
refresh succeeds.

The first implemented refresh path writes `snapshot.json` during
`npm run catalogue:download`, stores the result under a versioned snapshot
directory, then promotes the downloaded directory only after required-column and
row-count validation succeeds. Once the configured active catalogue directory is
symlink-backed, later local promotions use an atomic active-pointer swap.
Refreshing to an already-active snapshot id leaves the current snapshot intact
instead of deleting and recreating it.

## Source Policy

- Rebrickable is the canonical part and colour source. Use Rebrickable
  downloadable CSVs for bulk data and avoid high-volume per-row API calls in
  the parsing path. Rebrickable's API documentation directs high-volume catalogue
  use to the Downloads page, and its terms allow API use for any purpose while
  asking for source attribution. Use the Rebrickable colour API at refresh or
  bounded cache-fill time for colour `external_ids`, because those fields are
  not present in the downloadable `colors.csv`.
- LDraw can be used as an offline enrichment source for BrickLink-to-Rebrickable
  part aliases. The LDraw library exposes `complete.zip`; its contributor
  agreement documents CC BY 4.0 or CC0 for new work, with older CC BY 2.0
  material still present. If generated LDraw-derived alias data is bundled or
  redistributed, ship explicit LDraw attribution and license notes.
- BrickLink data must not be scraped, redistributed, or treated as a general
  production data source without permission. Studio/BrickLink colour-code
  aliases should come from Rebrickable `external_ids`, not from BrickLink pages.

Reference links:

- Rebrickable API: https://rebrickable.com/api/
- Rebrickable Terms: https://rebrickable.com/terms/
- LDraw library update archive: https://library.ldraw.org/updates?latest=
- LDraw contributor agreement: https://library.ldraw.org/documentation/licenses-and-legal/ldraworg-contributor-agreement
- BrickLink Terms: https://www.bricklink.com/help.asp?helpID=1919%2C

## Production Refresh Requirements

Production needs a refresh job that:

1. Downloads into a temporary directory outside the active snapshot.
2. Validates required columns for every file.
3. Applies minimum row-count checks.
4. Regenerates `ldraw_part_aliases.csv` from LDraw and local Rebrickable
   `parts.csv`.
5. Downloads `elements.csv` for local color-specific preview metadata.
6. Regenerates `external_color_aliases.csv` from the Rebrickable colour API.
7. Writes snapshot metadata with source URLs, download timestamps, row counts,
   content hashes, schema version, and available HTTP validators.
8. Atomically promotes the new snapshot by changing the active directory or
   symlink.
9. Keeps the previous valid snapshot available for rollback.

The user-facing parse path should only read the active snapshot, with the
explicit exception of bounded `external_color_aliases.csv` cache creation when
that file is missing or malformed and `REBRICKABLE_API_KEY` is available. It
must not trigger bulk downloads, scrape third-party sites, or switch catalogue
versions mid-job.
Runtime catalogue endpoints resolve the active symlink target before reading
tables, and may read an explicit `snapshotId` from the versioned snapshot
directory when a job needs colours and parts from the same catalogue snapshot.
The browser may request colour aliases for OCR parsing, but part normalization
must stay server-side: `/api/catalogue/parts` accepts compact extracted rows by
`POST` and must not expose the full raw parts catalogue to the client.
Part preview metadata should also read the same pinned snapshot when a
normalization job provides a snapshot id, so display names and generic images do
not drift across catalogue refreshes during one analysis.

## Deployment Checklist

- Set `BAG_IT_CATALOGUE_DIR` to a readable directory or mounted volume in the
  runtime environment.
- Populate at least `colors.csv` and `parts.csv` before enabling ready
  extraction states.
- Populate `elements.csv` before relying on local color-specific part
  thumbnails. Without it, the preview endpoint may use bounded live part-color
  API lookups and then generic part images.
- Populate `part_relationships.csv` and `ldraw_part_aliases.csv` before using
  alias, print-family, mold-family, or assembly-family confidence as hands-off
  evidence.
- Set `REBRICKABLE_API_KEY` for refresh jobs and for bounded on-demand creation
  of `external_color_aliases.csv`.
- Populate `external_color_aliases.csv` before using Studio/BrickLink numeric
  colour codes as hands-off evidence.
- Add visible attribution for Rebrickable and any bundled LDraw-derived data
  before public deployment.
- Record the catalogue snapshot id on every extraction result once extraction
  results are persisted.
