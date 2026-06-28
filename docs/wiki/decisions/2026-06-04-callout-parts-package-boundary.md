# 2026-06-04 Callout Parts Package Boundary

Status: Active. Private/manual validation execution is defined by
[Browser-only private detector validation](2026-06-05-browser-only-private-detector-validation.md).

## Decision

Part image and quantity-label extraction for `/v2` lives in workspace package
`@bag-it/callout-parts`.

The package public entry point is:

```ts
extractCalloutPartsForPage({
  page,
  callouts,
})
```

Input is rendered page pixels plus accepted callout regions. Output is
`CalloutPartItem[]` with canonical quantity labels, stored `partImage.region`,
and stored `partImage.alphaMask`.

## Consequences

- `/v2` imports `@bag-it/callout-parts` directly and no longer imports the old
  app-local v2 part extractor, quantity-label OCR, digit classifier, raster
  glyphs, or preview-matting modules.
- The v2 app path does not emit `partCrop`. Breaking this shape is allowed.
- Preview hydration crops page pixels from `partImage.region`, applies
  `partImage.alphaMask`, and encodes PNG bytes. The app must not duplicate
  extractor geometry or matte logic.
- Approved saved-session fixtures may contain expected callout-part data.
  Acceptance uses real Playwright browser upload/download to `/v2`; package
  replay fixtures and renderer scripts are not acceptance paths.

## Non-Goals

- Catalogue color/part identification remains out of scope.
- Native PDF text remains out of scope.
- Private manual names, source paths, previews, crops, and row debug output
  must not be committed.
