# Extraction And Validation

The workflow is PDF-first:

1. Detect where build instructions end and the parts list begins.
2. Extract inventory from the PDF parts-list section.
3. Match extracted parts against the Rebrickable catalog API.
4. Optionally compare against a Rebrickable CSV.
5. Extract per-step callouts from the build instruction section.
6. Allocate consecutive steps into bags of about 40 to 60 pieces.

Use Rebrickable catalog data to validate part numbers and colors, normalize
identifiers, fetch canonical names, and render part images.

Rebrickable bulk catalog data is generated server-side during the deployment
flow with:

```bash
npm run catalog:build
```

`npm run build` runs the catalog build first in optional mode and bundles the generated
`.cache/rebrickable-catalog/catalog-index.json` file into the catalog route
handler output. The generated cache may contain public Rebrickable color names,
catalog rows, and relationship aliases, but it must never contain manual PDF
content, rendered manual pages, image crops, or OCR output from user manuals.
Use `npm run catalog:build:required` when a deployment or maintenance job must
fail unless the catalog cache is generated successfully.

For now, keep this as a build/development cache so we can prove matching quality.
Once the approach is validated, move catalog generation to a scheduled job that
writes the same alias-index shape to durable server-side storage.

CSV validation must not create inventory rows. The PDF manual controls which
rows exist and their order. A CSV may confirm OCR rows, suggest unambiguous
part-number aliases or suffixes, and report unmatched/unused rows. Do not use
CSV totals to fill per-manual quantities because multipart MOCs may split one
global inventory across several manuals.

When a CSV is present, fetch Rebrickable catalog details for each distinct CSV
part number before running validation. Use catalog aliases such as canonical
IDs, print bases, external IDs, and relationship metadata to match OCR readings
like BrickLink IDs, alternate molds, and printed-part aliases back to the CSV
row. If catalog lookup fails, expose that state and continue to treat the CSV as
validation-only input.

Treat OCR as candidate extraction and reconciliation as the acceptance step. When
a CSV is present, the validated output row should use the matched CSV/catalog
part number and color. Preserve differing PDF/OCR values separately, for example
as `ocrPartNumber`, `ocrColorName`, or review notes. Do not silently overwrite a
manual reading without exposing what changed.

Use the Rebrickable color catalog and uploaded CSV colors as OCR vocabulary. The
extractor should recognize color variants such as hyphenated `Trans-Clear`,
space-separated `Trans Clear`, and Gray/Grey spelling differences. Use color
evidence to choose between multiple candidate CSV rows for the same part family.

When a parts-list thumbnail can be isolated from the manual, derive a transient
shape/color descriptor from that thumbnail and compare it with descriptors from
public Rebrickable part images. Use this only as a reranking signal for plausible
CSV/catalog candidates, not as a full-catalog visual search.

Part images in bag lists should come from Rebrickable, not cropped manual
imagery.

Expose uncertainty. Do not silently guess.

Important states:

- exact match;
- normalized alias or color match;
- ambiguous match requiring review;
- unresolved match;
- failed lookup;
- intentionally ignored with user reason.

Every extracted inventory quantity must be assigned to a bag, unresolved, or
intentionally ignored by the user.
