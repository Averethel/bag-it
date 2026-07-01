# 2026-06-09: V2 Production Promotion

## Decision

The v2 browser detector adapter is the production app path on `/`. The `/v2`
route remains only as a temporary redirect alias to `/`.

The legacy v1 browser adapter, worker, and detector/extractor monolith are
removed. Shared app, session, bagging, and Build steps code use neutral step
detection contracts instead of importing legacy detector types.

## Progress Presentation

The sidebar analysis card always reserves the same analysis rows from the start
of a run:

- `Scanning pages`
- `Extracting parts`
- `Generating previews`
- `Part grouping`

PDF intake state stays in the upload card. Bag-plan state stays in the Bags
tab.

## Preview Runtime Data

Preview hydration creates runtime `Blob` object URLs instead of data URLs.
Object URLs are revoked when analysis state is replaced, rerun, purged,
restored, or unmounted.

Session export strips runtime `blob:` preview URLs and remains backward
compatible with older sessions that contain `data:` preview URLs. Restored
sessions with missing preview URLs hydrate previews from the embedded PDF.

## Processing Shape

The production adapter streams page work through bounded queues:

- one low-resolution render in flight by default
- detector candidate/evidence work in a worker pool capped at four workers and
  `hardwareConcurrency - 1`
- page-preview generation starts from scan-stage page-input callbacks instead
  of waiting for final part extraction
- part extraction in a two-worker pool by default
- preview hydration as an independent progress stage with a small bounded page
  preview queue
- part-mask preview preparation after page previews are ready, using the
  proven page-preview canvas crop path until the `OffscreenCanvas` mask worker
  has visual parity coverage
- part grouping scoring as a worker-backed precompute before the `Group parts`
  toggle becomes active

Preview readiness blocks only until the first visible/priority preview page is
hydrated. Remaining page thumbnails, callout crops, quantity-label crops, and
part-image crops hydrate when those pages become near-viewport priority. Those
jobs are bounded and may show in the `Generating previews` row as background
progress, but they do not block scrolling, tab switches, or session controls.

Large manuals keep preview slots stable and hydrate runtime preview blobs
progressively instead of running a long offscreen main-thread render/encode
backlog.

Final Build steps rows remain authoritative only after conflict resolution.
