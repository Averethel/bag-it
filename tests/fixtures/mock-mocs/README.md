# Mock MOC Fixtures

These fixtures are synthetic and safe to commit. They are generated image-only
PDFs designed to exercise the same OCR-oriented workflow as private real MOC
manuals without copying copyrighted manual pages or build instructions.

The generated manuals mimic the relevant extraction surfaces:

- build-step pages have a light-blue top callout area with Rebrickable part
  thumbnails and quantities;
- trailing parts-list pages have part thumbnails, quantities, part ids, names,
  and color names.

Each fixture directory contains:

- `manual.pdf`: raster/image-only synthetic manual;
- `parts.csv`: matching validation CSV with real common Rebrickable part
  numbers and color IDs;
- `expected.json`: expected inventory, step callouts, page ranges, and bag split.

The scale mirrors the private fixture set:

| Fixture | Pages | Inventory rows | Pieces | Intended use |
| --- | ---: | ---: | ---: | --- |
| `small` | 8 | 21 | 58 | Fast OCR and one-bag workflow tests |
| `medium` | 33 | 146 | 786 | Realistic multi-bag workflow tests |
| `large` | 221 | 380 | 2842 | Performance and stress tests |

The generator used to create these PDFs is intentionally kept outside version
control. Generated image/cache data belongs in ignored local directories such as
`artefacts/` and `.mock-fixture-cache/`.

The generated content is not intended to describe a buildable LEGO model.
