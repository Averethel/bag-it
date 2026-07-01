# Step Fixture Set

These fixtures are synthetic. They are safe to commit and contain no private
manual pages, renders, crops, screenshots, or row-level private debug output.
Parts are drawn from repo-local synthetic LDraw-format mesh definitions. No
official LDraw part-library files are copied into this fixture set.

Regenerate PDFs and expected baselines with:

```sh
node scripts/generate-step-fixtures.mjs
```

Fixture source specs live in `tests/fixtures/steps/sources`. Generated PDFs live
in `tests/fixtures/steps/generated`, and expected detector baselines live in
`tests/fixtures/steps/expected`.
