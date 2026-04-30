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
