# Page Input

## Goal

Create a stable page input contract for every later v2 detector stage.

## Input

- rendered page image in scan coordinates
- page number
- page width and height
- optional PDF text items normalized into the same coordinate space

## Output

`StepDetectorV2PageInput`:

- `pageNumber`
- `width`
- `height`
- `data`
- `textItems`

## Rules

- Coordinates are in detector scan pixels, not PDF points and not preview-scale
  pixels.
- Text item regions must be clamped to page bounds.
- Page input code must not classify callouts, quantities, or inventory pages.
- Preview rendering is separate from detection geometry.
- Page input normalization owns buffer length, page dimension, text trimming,
  and out-of-bounds text rejection.

## Implementation

- `@bag-it/step-callouts` provides pure page input normalization, region
  clamping, and page-input stage snapshots.
- `src/features/steps/v2/pdf-text-items.ts` converts PDFJS text content into
  scan-pixel text regions through a narrow transform API.
- `src/features/steps/v2/browser-page-input.ts` reads browser-rendered PDF pages
  into the v2 page input contract without importing legacy detector code.
- `/v2` uses the package page-input helpers and owns only browser PDF rendering
  plus app progress/session wiring.

## Validation

- pure unit tests verify pixel buffer validation, defensive pixel copying, text
  trimming, page-bound clamping, out-of-page text rejection, and stage snapshot
  shape
- pure PDF text conversion tests verify scan-pixel coordinate mapping and
  non-text/empty-text rejection
- synthetic fixture PDFs must render at expected page count and dimensions
  before this stage becomes the committed fixture gate
- text items and pixels share one coordinate space
- page-input stage report has total page count and no detector decisions
