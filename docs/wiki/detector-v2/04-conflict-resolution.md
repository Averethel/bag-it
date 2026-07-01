# Conflict Resolution

## Goal

Turn scored candidates into accepted, diagnostic, and rejected callouts through
bounded, explainable passes.

## Output

`StepDetectorV2ResolvedCallout`:

- `candidateId`
- `pageNumber`
- `region`
- `status`

Statuses:

- `accepted`: may proceed to quantity and part extraction
- `diagnostic`: visible in Build steps diagnostics, never baggable
- `rejected`: kept only in validation reports

## Rules

- Resolver owns merge, split, duplicate, and overlap decisions.
- Prefer the smallest complete bordered quantity-backed panel over a larger
  leaking region.
- Do not merge adjacent complete panels.
- Do not split one complete multi-quantity callout into part-sized fragments.
- Resolver passes must be explainable through reason codes. The leading-page
  filter may repeat only while each pass rejects the current first visible page;
  this is bounded by the number of drafts and prevents title/notice pages from
  becoming a new false first page after the first rejection.
- First resolver implementation classifies candidates from independent evidence
  only:
  - `accepted`: strong border, background, and quantity evidence
  - `diagnostic`: measured border and background evidence on a plausible-size
    visual region that is not yet baggable
  - `diagnostic`: large top-half fill panels with strong border evidence and
    moderate background evidence when foreground build art occludes much of the
    panel interior
  - `rejected`: weak false-positive evidence or duplicate overlap
- Page-local visual row refinement may adjust review-only diagnostics before
  duplicate cleanup:
  - recover a strong bordered candidate with shifted background evidence when it
    aligns with a same-page row established by at least two distinct strong
    visual callouts
  - recover a strong bordered candidate with shifted background evidence when it
    fits an orthogonal same-page grid: one established multi-callout row plus a
    row and column anchor from strong visual callouts
  - recover a zero-background grid member only when it has a panel-like shape;
    very narrow step-number or build-image strips are rejected even if they land
    in the grid
  - do not recover explicit off-manual-style border panels from grid alignment
    alone; this prevents subassembly images from replacing real callouts
  - reject weak border-only diagnostics outside established same-page rows
  - reject truly narrow visual fragments outside established same-page rows
    while preserving tall complete bordered panels for later layout filtering
  - never create baggable rows and never guess a missing cell without a real
    bordered/background-backed candidate
- Unsupported leading-page diagnostics are rejected when later pages have
  visible callout candidates but no nearby later candidate repeats the
  leading-page layout anchor. Support is limited to the next visible pages, so a
  distant accidental match cannot rescue cover/title artwork.
- A first visible page with at least two distinct substantial diagnostics is
  kept as a likely real build page. Duplicate producer views of the same region
  count as one support anchor.
- Single-callout leading pages may be kept in vertical-flow manuals when the
  next visible pages repeat the x position and size strongly enough, even if
  vertical placement changes between pages.
- Strong manual-style fill panels on the first visible page may be kept when
  later visible pages repeat the same column x position and width strongly
  enough. Manual-style evidence alone is not support; large notice/title panels
  without later column support must still be rejected.
- Raster-numbered layout filtering may reject extra review-only floating
  panels on pages that already prove a numbered callout layout through at least
  two nearby large dark step-number anchors. This is image-only evidence:
  PDF text items are not required and exact step numbers are not parsed.
- Raster-numbered filtering is not a global step-number requirement. A panel is
  kept when it has its own nearby left step-number anchor or aligns by left edge
  or center with a column established by anchored callouts on the same page.
  This preserves stacked callouts and wide lower-row panels while rejecting
  isolated unnumbered part/build panels.
- Raster-numbered filtering must not reject strong manual-style panels solely
  because the image-only step-number anchor is missing. Missing anchors are
  common when raster digits are split or blended with nearby build art; the
  manual-style evidence must still come from border/background scoring.
- Raster-numbered filtering must also preserve a same-page top row established
  by at least two strong large fill-panel candidates. This covers pages where
  callout boxes overlap build images and the printed step numbers are merged
  into foreground art, while still allowing duplicate cleanup to reject inner
  part fragments.
- Raster-numbered top-row size gates must be page-relative, not fixed pixel
  thresholds. The browser/PDF.js path renders native A4 manuals without
  upscaling, so fixed dimensions can reject real edge callouts that only appear
  small because the page itself is rendered smaller.
- On pages with a supported strong top row, raster-numbered filtering may keep
  other strong fill panels in the same top band even when their center is
  shifted by a tall callout or build-image overlap. This support still requires
  page-relative panel scale and does not preserve small inner fragments.
- Page-local style filtering may reject low-foreground no-quantity diagnostics
  whose measured panel background conflicts with a same-page non-white style
  cluster established by at least two strong visual callouts. This removes
  refresh or rotate icon panels without reading PDF text or assuming one
  manual-specific color, while preserving off-style panels that contain
  substantial dark part or quantity ink.
- Orthogonal grid recovery exists for repeated two-row manual layouts where the
  bottom-left callout background drifts into a page gradient. It is still
  candidate-only recovery: it requires the missing cell to have its own strong
  border evidence and an existing page-local row/column structure.
- Out-of-row narrow fragment rejection exists for skinny build-image slivers
  that carry enough fill and border evidence to look diagnostic after browser
  rendering. It is gated by an established same-page row and uses a strict
  width/height ratio so tall complete panels are not rejected as slivers.
- Diagnostics remain review-only until output assembly decides how to expose
  them.
- Duplicate suppression is page-local. Repeated manuals may reuse the same
  callout coordinates on many pages, and those same-position regions must not
  suppress each other across pages.
- Tiny no-quantity visual fragments are rejected as false positives. Small
  regions may still become accepted later when quantity evidence is strong.
- Standalone review-only diagnostics need a substantial visual area. Smaller
  real callouts can still be recovered by row or grid support.
- Page-scale raster text/banner shapes stay rejected when they have weak or no
  quantity-backed callout evidence. A wide panel can still be accepted when
  raster quantity, compatible background, and strong border evidence all agree.

## Implementation

- `src/features/steps/v2/conflict-resolution.ts` classifies scored candidates,
  rejects overlapping duplicates, emits resolved callouts, and records failure
  taxonomy counts. Large occluded panel diagnostics are page-relative and only
  apply to broad top fill-panel candidates below the page-scale cap.
- `src/features/steps/v2/visual-diagnostic-layout.ts` owns the page-local row
  refinement for image-only diagnostic callouts.
- `src/features/steps/v2/raster-step-number-layout.ts` owns image-only
  step-anchor support for rejecting floating no-quantity panels after a page
  proves a numbered layout, including the bounded top-row preservation rule for
  overlapping callout/build-image pages.
- `src/features/steps/v2/page-style-diagnostic-layout.ts` owns page-local
  measured-background consistency for no-quantity diagnostics after a page
  proves an unambiguous non-white callout style; it only rejects off-style
  diagnostics with low dark-ink density.
- Duplicate overlap is measured against the smaller region so larger leaking
  panels can yield to smaller complete panels without merging adjacent panels.
- Duplicate overlap is checked only against candidates from the same page.

## Validation

- `bad-merge`, `bad-split`, and `duplicate` failures are counted separately
- accepted callouts match expected page and region IoU thresholds
- diagnostic callouts never enter Bags
- committed synthetic tests cover accepted, diagnostic, unsupported leading-page
  visual rejection, first-visible-page leading rejection, distinct leading
  support, vertical-flow leading support, repeated leading-page diagnostic
  retention, manual-style column support, visual-row diagnostic recovery, large
  occluded panel diagnostics, raster-numbered floating panel rejection,
  raster-numbered top-row preservation, raster-numbered manual-style
  preservation, page-style off-style diagnostic rejection, off-style foreground
  preservation, visual grid off-style rejection, stacked/centered column
  preservation, zero-background narrow-strip rejection, out-of-row weak fragment
  rejection, tall complete panel preservation, tiny visual rejection, weak
  rejected, same-page duplicate overlap, and same-position different-page
  outcomes
