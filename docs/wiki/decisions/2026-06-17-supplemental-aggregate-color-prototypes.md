# Supplemental Aggregate Color Prototypes

Date: 2026-06-17

## Decision

Runtime part-color tuning may promote supplemental aggregate color prototypes
when all of these are true:

- the prototype contains only color name, family, RGB/Lab centroid, support, and
  generated id;
- no row id, crop hash, manual id, crop image, or per-row exemplar enters
  committed runtime code;
- evaluation against the full annotated private report set shows no manual
  score regression;
- the change is covered by focused resolver tests and a part-color calibration
  version bump.

The first use of this policy adds two supplemental `Pearl Gold` aggregate
centroids. The private evaluation result was `5895/6262` to `5900/6262`, with
Lower Courtyard improving by `2`, Hall Tower improving by `3`, and no manual
worsening.

The second use adds three transparent aggregate centroids: `Trans-Green`,
shadowed `Trans-Orange`, and `Trans-Yellow`. The private evaluation result was
`5900/6262` to `5918/6262`, with Middle Wall improving by `1`, 4th Stage
improving by `1`, Upper Courtyard improving by `1`, Hall Tower improving by
`15`, and no manual worsening. Candidate `Trans-Red` and `Trans-Dark Blue`
centroids were rejected because they regressed other manuals.

## Rationale

The broader prototype retraining options improved some gold rows but regressed
holdout manuals. A subset search over aggregate `Pearl Gold` clusters found a
smaller no-regression set. This keeps runtime behavior feature-based and avoids
manual-specific or row-specific rules while still improving shadowed gold
samples.

Transparent colors followed the same subset rule. Only the aggregate centroids
that improved the full private set without any manual regression were promoted;
the unsafe transparent red and dark-blue clusters stay out until cleaner
training evidence exists.

## Constraints

Do not add manual-id logic, row-id logic, crop-hash overrides, or one-off
thresholds. If future prototype promotion needs those mechanisms to pass, reject
the promotion and collect better labels or features instead.
