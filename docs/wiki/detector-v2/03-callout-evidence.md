# Callout Evidence

## Goal

Score each candidate with independent evidence so failures explain which signal
was weak or wrong.

## Signals

- `border`: visible enclosing border, broken-border support, local edge
  continuity
- `background`: candidate fill is compatible with page/manual-local callout
  style
- `quantity`: plausible visible `Nx` label in a lower part-row position

## Output

`StepDetectorV2EvidenceScore` records:

- signal name
- numeric value
- reason codes

`StepCalloutCandidateEvidence` also carries the package-owned dominant
candidate `background` RGB value used by the background score. App `/v2`
consumers must reuse that value instead of recomputing it from local duplicate
pixel helpers.

## Rules

- Evidence scoring never mutates candidate regions.
- Background evidence cannot be seeded by cover/title false positives.
- Quantity-like marks that look like step numbers or decorative text must score
  weakly unless they sit in a valid part-row context.
- Thresholds need names, units, defaults, and rationale in this spec before
  becoming production constants.
- Border evidence measures the candidate edge and a tight outer ring around the
  candidate. This lets a fill-panel interior candidate find its printed border
  without mutating the candidate region.
- Background evidence reads the dominant light fill cluster inside the
  candidate, not the average of all interior pixels. Foreground parts should not
  drag the panel background away from the manual style.
- Manual-local background style is inferred from repeated plausible
  `fill-panel` candidates across the manual. A single early false positive,
  cover image, or border-only region must not seed the style.
- Manual-style compatibility is strict enough to reject page-white or
  near-white build-image fragments when the established callout fill is a
  tinted blue, warm, gray, or other non-white style.
- When no repeated manual style is available, background evidence falls back to
  candidate fill versus page-corner background contrast.
- Candidate source is provenance and may appear in reason codes, but it must
  not raise an evidence score by itself.
- Raster quantity evidence remains a future slice.

## Implementation

- Package `evidence-border.ts` scores measured dark-edge coverage from the
  candidate edge and tight outer-ring search, and records source-border only as
  a reason.
- Package `candidate-background.ts` reads a dominant light panel fill color from
  a candidate.
- Package `manual-style.ts` infers a repeated manual-local callout fill style
  from plausible fill-panel candidates.
- Package `evidence-background.ts` scores light panel/background contrast or
  manual-style compatibility without using hard-coded colors.
- Package `evidence-quantity.ts` scores structured `Nx` text inside candidates,
  with stronger evidence when text is in the lower row.
- Package `callout-evidence.ts` combines signal scores into candidate evidence,
  records the measured background RGB, and emits the callout-evidence stage
  snapshot.

## Validation

- reports include per-signal accepted/rejected counts
- traps identify weak or conflicting evidence instead of disappearing silently
- tuning changes must improve at least one documented evidence reason
- committed synthetic tests verify independent border/background/quantity
  scoring, tight outer-edge search, dominant background fill, manual-style
  scoring, near-white off-style rejection, weak quantity reasons, and evidence
  snapshot shape
