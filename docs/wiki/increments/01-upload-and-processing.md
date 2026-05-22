# Increment 1: Upload And Processing

## Goal

Allow users to submit a private MOC PDF and start background analysis while
preserving the original bytes unchanged and avoiding long-lived storage of the
manual PDF.

## User Value

The user can submit a manual and see that analysis is progressing without needing to preview or manage the PDF in the app.

## Deliverables

- PDF upload
- File validation
- Private PDF intake boundary
- Transient job-scoped access to source PDF bytes
- Processing job creation
- Processing status UI
- Page count and basic metadata extraction
- Private page reference primitives for later OCR and recognition
- Baseline asynchronous processing so upload completion does not wait for later full OCR or recognition
- Retention and deletion policy for transient PDF bytes and derived artifacts

## Acceptance Criteria

- Uploaded PDFs are validated against the file validation criteria below and
  processed without alteration.
- Original PDF bytes are not committed, bundled, used as shared fixtures, or
  persisted as long-lived app data.
- Any temporary PDF access needed by a background job follows the initial
  privacy and retention policy below.
- Page references or renders, source fingerprints, metadata, and debug
  artifacts are treated as private derived artifacts and follow the same
  policy.
- Processing can start after upload as a background job.
- Upload completion is not blocked by full-manual OCR, recognition, or Rebrickable normalization.
- The UI shows the minimum job states below, including failure and expiry.
- The product does not expose a full PDF viewer as part of the MVP flow.
- Re-running analysis uses the uploaded source PDF again. Increment 2 tuning
  intentionally does not persist or reuse manual analysis/page-render artifacts
  across reloads or uploads.

## Initial Privacy And Retention Policy

- Prefer in-memory access to PDF bytes. The first implementation processes the
  selected PDF in the browser job and does not persist the source PDF bytes. If
  a future server worker needs filesystem access in local development, write the
  temporary source file only under `.bag-it/private/jobs/<job-id>/`, which must
  stay ignored by git.
- Delete temporary source PDF bytes as soon as metadata extraction and derived
  page reference or render preparation finish, and always after failure,
  cancellation, or expiry.
- Treat one hour as the maximum retention window for orphaned source PDF bytes
  from crashed or interrupted jobs.
- Keep derived page references, page renders, and metadata in memory for the
  current processing boundary only. Do not write browser IndexedDB, local
  storage, filesystem cache entries, or any equivalent persisted manual-analysis
  cache until a later increment explicitly designs it.
- Do not sync, upload, or share source PDFs, page renders, source fingerprints,
  filenames, metadata, logs, or debug artifacts outside the local processing
  boundary during this increment.

## File Validation Criteria

- Accept only PDFs up to 100 MB for the first version.
- Check the PDF signature and extract page-count metadata; do not trust the
  filename extension or browser-provided MIME type alone.
- Reject corrupt, encrypted, password-protected, or zero-page PDFs.
- If rich parsing or page rendering is unavailable but fallback page metadata is
  available and the file is not encrypted or clearly corrupt, accept the intake
  with limited private page references. Later recognition work can retry richer
  rendering without forcing the user to fix a manual that opened elsewhere.
- Treat page-count extraction failure as a validation failure.
- Show safe user-facing errors that do not expose local paths, full filenames,
  PDF text, rendered page images, or extracted private content.

## Minimum Job States

- `queued`
- `validating`
- `extracting_metadata`
- `rendering_pages`
- `complete`
- `failed`
- `purged`
- `expired`

Terminal failure, cancellation, purge, and expiry paths must remove temporary
source PDF bytes before the job is considered settled.

## Technical Notes

- Page references are the default Increment 1 derived artifact. Page renders are
  allowed internally as primitives for later OCR and recognition, but the upload
  path should not bundle or run a full parser until that later analysis work
  needs it.
- Keep page references in the active job state so later extraction results can
  point back to source pages during the current browser session.
- Avoid coupling upload completion to full manual analysis.
- A source fingerprint can identify unchanged input, but it is still sensitive
  private metadata and must not be logged or exposed casually.
- Do not log full local filenames, PDF bytes, rendered page images, or extracted
  private content unless a debug path is explicitly gated and covered by
  retention rules.
- This increment owns the first performance guardrail: asynchronous job status exists before recognition work becomes expensive.

## Open Questions

- Should the 100 MB PDF size limit change after the first fixture and manual
  performance tests?
- Should production use in-memory workers, encrypted temporary object storage,
  browser-local processing, or another model to enforce the same privacy
  boundary?
- What user-visible purge controls are needed beyond automatic expiry?
