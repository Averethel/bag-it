# Page Input

## Goal

Create a stable page input contract for every later v2 detector stage.

## Input

- rendered page image in scan coordinates
- page number
- page width and height

## Output

`StepDetectorV2PageInput`:

- `pageNumber`
- `width`
- `height`
- `data`

## Rules

- Coordinates are in detector scan pixels, not PDF points and not preview-scale
  pixels.
- Page input code must not classify callouts, quantities, or inventory pages.
- Preview rendering is separate from detection geometry.
- Page input normalization owns buffer length, page dimension, and defensive
  pixel copying.
- Native PDF text is not part of the detector input. Quantity, step, and repeat
  cues are raster evidence from rendered page pixels.

## Implementation

- `@bag-it/step-callouts` provides pure page input normalization, region
  clamping, and page-input stage snapshots.
- `src/features/steps/v2/browser-page-input.ts` reads browser-rendered PDF pages
  into the v2 page input contract without importing legacy detector code.
- `/v2` uses the package page-input helpers and owns only browser PDF rendering
  plus app progress/session wiring.

## Validation

- pure unit tests verify pixel buffer validation, defensive pixel copying, and
  stage snapshot shape
- synthetic fixture PDFs must render at expected page count and dimensions
  before this stage becomes the committed fixture gate
- page-input stage report has total page count and no detector decisions
