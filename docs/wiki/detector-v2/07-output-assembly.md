# Output Assembly

## Goal

Map v2 internal results to the existing `StepCalloutDetectionResult` contract so
Build steps and Bags can stay shared.

## Output Policy

- accepted callouts become Build steps callouts
- diagnostic callouts remain detector-internal review evidence and do not feed
  app-facing Build steps or part extraction
- rejected candidates stay in validation reports only
- `inferredBackground` is populated from the measured candidate fill and
  background evidence score; it must not use a fixed diagnostic placeholder
  when page pixels are available
- part extractor version changes independently from detector version
- v2 assembly emits callout rows from the current v2 part extractor when
  accepted callouts have raster label-owned parts

## Session Policy

- `/` reads detector and part-extractor versions from the v2 adapter
- legacy sessions restored on `/` become stale because production now emits
  detector version `2.0.0-alpha.20` and part extractor version
  `2.0.0-alpha.166`
- completion transfer uses page and crop anchors only after rerun

## Implementation

- `src/features/steps/v2/output-assembly.ts` maps accepted resolved callouts
  into the existing Build steps result shape with measured callout background
  data and accepts package `CalloutPartItem` rows from the browser adapter.
- `src/features/steps/v2/browser-step-detector-adapter.ts` wires the browser
  route through page input, candidates, evidence, resolver, and output assembly
  without importing the legacy detector.
- production part rows emit `partImage.region` and `partImage.alphaMask`. The v2
  path does not emit app-side `partCrop`.
- Preview hydration is a separate browser pass after detector geometry is
  ready. It rerenders pages through the pixel-only page reader, attaches page and
  callout runtime object URLs, applies stored part alpha masks without app-side
  background scrubbing, and must not run from the scan/detection critical path.
- Part extraction is wired in the v2 browser adapter and versioned separately
  from the callout detector.
- The v2 adapter passes package-owned candidate evidence background RGB into
  Build steps output and callout-part extraction. It does not keep app-local
  detector copies of page input normalization, region comparison, pixel color,
  candidate background, or stage-report helpers.
- The v2 adapter uses high-resolution PDF.js part extraction as the only
  semantic part-row pass. The lower-resolution detector render finds callout
  regions only; it does not provide fallback part rows.
- Output assembly may hand an accepted border/line-rectangle callout to an
  overlapping raster-quantity-backed fill-panel source region when that source
  has the measured manual-style background needed by part extraction. This
  keeps app output stable while extracting from the visual panel users see.

## Validation

- adapter output passes existing fixture gate once v2 reaches equivalent
  behavior
- stage reports are available for failures before the final mapped result
- no private report data enters saved user sessions unless explicitly approved
- committed output assembly tests verify accepted mapping, diagnostic and
  rejected omission, measured inferred backgrounds, page previews, detector
  version, and empty result status
- committed preview hydration tests verify v2 uses the separate text-free page
  pass, applies stored part masks, and does not call the detector page reader
  during preview hydration
