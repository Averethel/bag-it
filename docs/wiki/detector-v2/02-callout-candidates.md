# Callout Candidates

## Goal

Find broad regions that may be build-step callouts. This stage optimizes recall,
not final precision.

## Producers

- `border`: rectangular dark or high-contrast border evidence
- `fill-panel`: uniform callout-like fill region with plausible shape, usually
  describing the panel interior rather than the printed border
- `quantity-anchor`: local region around plausible visible `Nx` labels

## Output

`StepDetectorV2CalloutCandidate`:

- `id`
- `pageNumber`
- `region`
- `source`

## Rules

- Candidate producers do not accept final callouts.
- Candidate ids must be stable for one page scan.
- Producers may emit overlapping candidates; resolver owns conflicts.
- Inventory, cover, logo, and subassembly traps should remain visible as
  candidates only when they are useful negative evidence.
- Border and fill-panel producers are recall sources only. They must not encode
  final callout acceptance, quantity requirements, manual-specific colors, page
  numbers, or step-number rules.
- Border and fill-panel producers reject page-scale regions, but allow broad
  top callouts up to the configured page-area cap. Fill-panel recall allows
  larger occluded panels than border recall because resolver evidence decides
  final visibility. This keeps wide manual styles and overlaid build-image
  callouts in the candidate set while still rejecting full-page backgrounds.
- Fill-panel candidates may use a lower density threshold when foreground build
  art occludes the panel fill. This is candidate recall only; resolver evidence
  still decides whether the panel is visible.

## Implementation

- `@bag-it/step-callouts` owns connected pixel components, low-level color,
  luma, alpha, page background helpers, and all candidate producer modules.
- Package `border-candidates.ts` emits dark rectangular component regions with
  plausible border density.
- Package `fill-panel-candidates.ts` emits filled light panel regions that
  differ from the page corner background, including partially occluded and
  large top fill panels that stay below the page-scale cap.
- Package `callout-candidates.ts` combines producers, sorts candidates, assigns
  stable ids, and emits the stage snapshot.
- Quantity-anchor candidates are specified but not implemented in the first
  candidate slice.

## Validation

- every expected baggable callout has at least one overlapping candidate
- false-positive traps are counted and carried forward with source reasons
- missing candidate failures use `missing-candidate`
- committed unit tests use synthetic page pixels to verify recall for bordered
  callouts, light fill panels, occluded fill panels, broad and large top
  callouts, stable ids, page-scale rejection, blank-page rejection, and snapshot
  counts
