# Gray Name Aliases In Color Evaluation

## Status

Accepted.

## Context

Private part-color labels may use legacy LEGO gray names while the runtime and
Rebrickable-backed workbench often emit the newer bluish gray names. The current
color tuning goal is to avoid meaningful family and close-color mistakes such as
tan versus neutral, brown versus reddish brown, and transparent versus opaque
variants. Perfectly separating legacy `Light Gray` from `Light Bluish Gray`, or
legacy `Dark Gray` from `Dark Bluish Gray`, is not a useful tuning target for
this dataset.

## Decision

Part-color label evaluation canonicalizes these names for scoring and same-crop
conflict detection:

- `Light Gray` matches `Light Bluish Gray`
- `Dark Gray` matches `Dark Bluish Gray`

Runtime advisory color names remain unchanged. Training data still keeps the
label's stored expected name; this decision only prevents evaluation reports
from treating old/new gray vocabulary as a detector failure.

## Consequences

Color tuning can focus on true visual mistakes instead of overfitting to legacy
catalog naming. Gray family failures still count when they cross a meaningful
boundary, such as `Black`, `White`, `Tan`, `Flat Silver`, or another non-alias
color.
