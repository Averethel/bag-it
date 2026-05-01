# Private Fixture Strategy

Manual fixtures may contain copyrighted MOC instructions. They must not be
committed to this repository.

Repo-safe synthetic fixtures live in `tests/fixtures/mock-mocs/`. Use those for
normal CI coverage. Use private real fixtures only for local or restricted CI
OCR/manual validation.

## Local Layout

When available locally, private fixtures should be placed under `fixtures/`.
That directory is ignored by Git.

Expected local shape:

```text
fixtures/
  small moc/
    manual.pdf
    parts.csv
  medium moc/
    manual.pdf
    parts.csv
  large moc/
    manual.pdf
    parts.csv
```

The canonical `parts.csv` files should remain unchanged. Validation-failure
fixtures can be fabricated at test time from a canonical CSV by changing one
quantity, removing one row, changing one color, and adding one CSV-only row.

## CircleCI Options

CircleCI does not provide a general project-level file upload feature for large
private job inputs. Artifacts are job outputs, not durable private inputs for
future jobs. Environment variables can be used for tiny base64-encoded files,
but the value-size limit makes them unsuitable for manual PDFs.

### Option 1: Private Archive Download

If private object storage becomes available, use a private fixture archive
downloaded during the job:

1. Store a compressed fixture archive outside the repository, for example in
   private S3, Google Cloud Storage, Cloudflare R2, or another access-controlled
   object store.
2. Store the download URL or access credentials in a restricted CircleCI
   context.
3. Download the archive only in jobs that need OCR/manual integration tests.
4. Verify the archive checksum before extracting it.
5. Extract into `fixtures/`.
6. Do not store manual PDFs, rendered pages, crops, OCR output, Playwright
   traces, screenshots, or videos as CircleCI artifacts.

Recommended environment variables:

```text
BAG_IT_PRIVATE_FIXTURES_URL
BAG_IT_PRIVATE_FIXTURES_SHA256
```

The test suite should treat private fixtures as optional:

- fast unit tests should not require them;
- OCR/manual integration tests should run when the fixture directory exists;
- CI should fail fast with a clear message only for jobs explicitly configured
  to require private fixtures.

### Option 2: Self-Hosted CircleCI Runner

A self-hosted CircleCI runner can mount private fixtures from local storage. This
avoids downloading the archive but requires maintaining runner infrastructure.

This is the best CircleCI option when the fixtures cannot be hosted anywhere.
The runner machine owns the private fixture directory, and CircleCI schedules the
job onto that runner.

### Option 3: Local-Only Real Fixture Tests

If neither private hosting nor a self-hosted runner is available, real manual
fixture tests should remain local-only. CircleCI can still run:

- unit tests over mocked OCR output;
- CSV parser and mismatch generation tests;
- privacy tests that do not require copyrighted manuals;
- OCR engine smoke tests against generated non-copyright images.

## Avoid

Do not commit encrypted fixture archives to the repository. Even encrypted, they
are still copies of copyrighted manuals in the repo history and make access
control harder to reason about.

Do not store manual PDFs as CircleCI environment variables. The fixtures are too
large, and environment variables are a poor fit for copyrighted binary files.
