# Privacy And Session Specification

## Data Classes

Private source data:

- uploaded PDF bytes
- original filename and local file metadata

Private derived data:

- page renders
- callout crops
- part crops
- quantity-label crops
- source regions
- detector timings tied to a private manual
- session files containing any of the above

Public or shared data:

- source code
- synthetic fixtures
- public/licensed fixtures
- aggregate metrics that do not expose private pages, crops, filenames, or row
  text

## Runtime Lifecycle

The fresh MVP is browser-first for manual analysis. The uploaded PDF should stay
in browser memory unless the user explicitly downloads a session file.
PDF rendering, step-callout detection, OCR-like image analysis, and bagging are
planned as browser-owned work. Server-side manual processing jobs are out of
scope for the fresh MVP and are not part of the roadmap unless a future decision
explicitly reverses this boundary.

During analysis:

- PDF bytes may be read into memory for the active job.
- Parsed PDF document objects may exist only for the active job.
- Page renders and crops may be held in React/browser state for the active UI.
- Abort, failure, browser-side expiry, or purge must clear active browser job
  objects and derived UI data.

After analysis:

- The app may keep the selected browser `File` object in memory so the user can
  download a session or rerun step analysis.
- This memory retention is not hidden persistent storage.
- Closing or refreshing the browser tab loses unsaved state.

## Session Download Boundary

`Download session` is an explicit user-owned persistence action.

A session file may contain:

- manual PDF bytes
- PDF metadata/job snapshot
- detector version
- step-callout detection result
- callout multipliers
- checked bag row ids
- checked bag completion anchors based on manual fingerprint, page number,
  callout-crop coordinates, and part-crop coordinates
- generated page/callout/part crops needed to resume the UI

A session file must not be created automatically. It is a local download chosen
by the user.

Current intake session files contain manual PDF bytes, PDF metadata, optional
latest step-callout detector result, optional callout multiplier map, checked
bag row ids, and coordinate completion anchors.

## Persistence Choice

The MVP uses explicit session-file download/import for bag completion
persistence. This keeps private manual bytes and derived crops user-owned and
visible as a local file action.

Browser storage was researched but not enabled as automatic persistence:

- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
  can store structured data and files/blobs asynchronously, so it is the likely
  future opt-in storage mechanism for large private sessions.
- [Web Storage](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
  persists small origin-keyed values through `localStorage`, but it is
  synchronous and better suited to small preferences than private session/crop
  payloads.
- Automatic local browser persistence would be hidden retention of private
  manual-derived data, so it remains out of scope unless a later decision adds
  explicit opt-in, purge, and stale-data controls.

## Session Import

Importing a session may restore manual bytes into browser memory and restore
derived step/bag data only when version checks pass.

Rules:

- detector result is renderable only when saved detector metadata and result
  detector version both equal the running detector version
- saved current detector results whose part extractor version is missing or
  stale restore callout rectangles first, then rerun only the browser-side part
  extraction pass over pages that contain restored callouts
- matching saved detector results restore directly into Build steps without
  rescanning the PDF pages; stale or missing detector results trigger a normal
  scan
- a session with no saved detector result may restore the manual and rescan, but
  a session whose `stepDetectionResult` key is present and malformed is rejected
  as unsupported instead of partially restoring manual data
- stale detector results are not rendered in Bags
- checked bag row ids are restored only if they are valid for the active bag plan
  and multiplier map
- when detector version changed, checked bag completion may transfer only after a
  rerun by matching saved page, callout-crop, and part-crop coordinate anchors
  to new rows
- ambiguous coordinate-anchor matches are not restored automatically
- unsupported or malformed sessions show an error and do not partially hydrate
  stale data

## Purge Behavior

The purge/remove action must clear:

- selected manual file
- PDF metadata and job snapshot
- step detection progress
- step detection result
- page renders and crops in UI state
- multipliers
- checked bag row ids
- checked bag completion anchors
- session recovery notices
- in-flight render/detection requests

After purge, the UI returns to the pre-analysis upload state.

## Application Server Boundary

The fresh MVP must not send uploaded PDF bytes, page renders, callout crops, part
crops, or private row-level debug output to application server routes.

No server-side manual processing jobs are planned. Session files are generated
client-side from browser-owned state after explicit user action.

If browser-side expiry is introduced later, it applies only to browser-owned
source or derived artifacts such as selected `File` objects, rendered pages,
crops, worker state, or local browser caches.

## Repository Boundary

Do not commit:

- private PDFs
- local `manuals/` corpus files
- private session files
- private page renders
- private callout/part crops
- private row-level debug output

Committed fixtures must state whether they are synthetic, public/licensed, or
explicitly approved.

Ignored local manuals may be used for aggregate developer verification. Scripts
must not write rendered pages, crops, row-level debug output, or private
filenames into committed artifacts.
