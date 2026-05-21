# Increment 2: Parts List Extraction

## Goal

Extract a structured bill of materials from supported uploaded MOC manuals.

## Status

Closed on 2026-05-17.

Increment 2 remains closed only while the Castle hard gate stays green. Future
parts-list OCR, parser, catalogue-validation, or validation-harness changes that
reduce Castle suite accuracy reopen the increment or must be fixed before work
moves on.

## User Value

The user receives an initial inventory without manually typing the parts list.

## Deliverables

- Likely parts-list page detection
- Tail-page-first bill-of-materials search
- Native PDF text extraction where available
- OCR over detected parts-list regions only when native text is missing or unreliable
- Grammar-first row extraction for rows shaped like `<quantity> x <part number> <color>`
- Parsed fields:
  - quantity
  - part number
  - color
  - source page
  - source region
  - confidence
- Primary extracted rows show catalogue-backed color swatches and part preview
  images when local `colors.csv` and `parts.csv` provide the needed RGB and
  image URL data.
- Raw OCR and native text output retained for debugging
- Private bill-of-materials row and thumbnail crop references for later internal image matching
- Browser-first local review support for private example manuals
- Initial approved fixture set for parts-list extraction
- Explicit unsupported state when no bill of materials is detected
- User-triggered download and upload of a private Bag It session bundle that
  preserves the original manual, extraction result, OCR/debug data, page
  previews, checked-part state, and extractor version without adding hidden
  app-side persistence

## Acceptance Criteria

- The local private Increment 2 gate set covers at least three supported
  manuals as defined in [../quality-gates.md](../quality-gates.md), while the
  committed shared fixture set remains deferred until realistic public,
  licensed, synthetic, or explicitly approved manuals are available.
- The private Castle manual-print suite is a hard no-regression closeout gate:
  every Castle manual must remain supported with 100% exact row match, 100%
  exact quantity-weighted match, zero compatible-alias matches, zero missing
  rows, zero extra rows, zero extra quantity, and zero assertion failures.
- Supported local private CSV comparisons reach at least 95% accepted quantity,
  part number, and color row match. Accepted matches include exact rows plus
  documented compatible catalogue aliases or groups because Rebrickable CSVs
  are comparison aids, not the manual source of truth. Exact match remains a
  reported diagnostic until approved manual-derived fixtures exist.
- Supported local private CSV comparisons reach at least 99% accepted
  quantity-weighted bill-of-materials match before a parsed parts list is
  considered hands-off ready.
- Low-confidence rows are tracked.
- Extracted parts rows can be sorted by quantity, part number, color, source
  page, and confidence for local review and tuning.
- Part preview images prefer already-downloaded local catalogue metadata after
  the resolved part list is available. If that local metadata lacks image URLs
  for the resolved manual colors, the UI may request bounded, cache-backed
  parts-list lookups from Rebrickable grouped by resolved color for the resolved
  part set. It must not make bursty per-row live Rebrickable API calls for
  previews.
- The app exposes a separate debug tab for local review of candidate pages,
  raw parsed row text, source kind, source regions, inferred thumbnail regions,
  private manual page previews grouped with candidate-page scores and parsed
  rows in source-page order, red OCR-row overlays, blue inferred part-image
  candidate overlays above the OCR label stack, side-by-side row text and
  inferred part candidate cropouts with surrounding context, parser version,
  confidence, crop-reference counts, OCR tokens, and raw page OCR text.
  Candidate pages are collapsed by default so reviewers can jump to a page
  without scrolling through every preview. This keeps browser annotation
  feedback out of the primary parts-list UI while making row-level extraction
  internals selectable in the in-app browser.
- The primary user experience does not require row-by-row correction.
- Manuals without a detectable bill of materials are marked unsupported for MVP bag generation instead of being inferred from steps.
- During recognition tuning, the in-app parts-list OCR pass has no wall-clock
  cutoff. It remains bounded by the backward page-selection and stop rule, and
  can still be cancelled through the active job abort signal when the user
  removes or replaces the manual.
- Do not
  use source-byte retention as a short processing timeout; debug preview
  rendering can legitimately finish after OCR, and expiring the whole job makes
  local tuning impossible.
- Live Rebrickable calls are not used as the primary validation path or as a
  per-row preview path.
- Downloaded session bundles are user-owned files. They may contain private
  manual bytes and private derived artifacts, but the app must not write the
  same data to local storage, IndexedDB, server storage, or an automatic cache.
- Importing a session bundle produced with the current extractor version
  restores the last completed parts-list state and checked-part progress.
  Importing an older extractor version must keep the manual available and ask
  the user to recalculate before using the stale analysis result.

## Technical Notes

- Current implementation state:
  - PDF intake has no manual-analysis cache, derived artifact store,
    `cacheStatus`, IndexedDB, local storage, or filesystem persistence path.
    User-triggered session downloads are the only Increment 2 persistence
    exception.
  - Uploaded source bytes are held only for the active browser session and
    processing job, then are either cleared when the user removes/replaces the
    manual or serialized into a user-requested session download.
  - Debug page previews and row/crop metadata are in-memory job state only.
    Removing the upload clears the current manual, current extraction result,
    and current page previews.
  - Reuploading or reloading must rerun extraction with current code. Stale
    browser cache entries are not read, written, or cleaned up because the cache
    path has been removed.
  - Browser extraction and the in-app debug tab are the source of truth for
    recognition tuning. Node-only OCR benchmarks are not part of this increment
    because they do not exercise the browser PaddleOCR.js, ONNX Runtime, and
    canvas runtime used by the product.
  - Increment 2 closeout is satisfied by the local Castle hard gate. Broader
    recognition tuning for exploratory manuals remains future work and must not
    weaken the Castle gate.
- Preserve both raw and parsed data.
- Expect MOC manuals to vary widely in layout and terminology.
- Use confidence and reconciliation instead of treating first-pass OCR as authoritative.
- No-BOM manuals are future research, not part of the MVP path.
- Most supported manuals are expected to place the bill of materials on the last
  few pages. Search the tail first, then expand only if the candidate score is
  weak.
- Treat extraction as a constrained row grammar problem before treating it as a
  generic OCR/table problem. Quantity is numeric, part numbers are constrained by
  Rebrickable-style identifiers, and colors come from a finite catalogue list.
- Manual-facing parser candidates should require part numbers to start with at
  least three digits. Local private example rows overwhelmingly follow this
  shape, and the stricter rule prevents OCR fragments such as `1x`, `4x`, short
  color ids, and letter-prefixed words from being promoted into part numbers.
- Rebrickable-style part numbers are usually numeric, with known suffix forms
  such as mold variation letters, `c` assembly identifiers, `pr` print
  identifiers, and `pat` pattern identifiers. Do not reject unusual identifiers
  solely because they fall outside the common grammar; catalogue validation
  should decide whether a candidate is plausible.
- Printed assembly identifiers from different inventory systems can use the
  same assembly base with different print suffix conventions, such as
  `4493c01pb02` and `4493c01pr0002`. Printed parts can also use BrickLink-style
  `px` suffixes where Rebrickable uses `pr`. Catalogue print-family matching
  should group these by the full base before the print suffix.
- Use a local catalogue cache or downloaded catalogue data for validation. Avoid
  bursty per-row live API calls because the Rebrickable API is rate limited and
  high-volume catalogue work should use local downloads or cache-backed lookup.
- The finite color list should be used as a parser constraint. Candidate color
  strings should be normalized against catalogue names and aliases before a row
  is accepted as high confidence.
- Color parsing should accept both catalogue color names and catalogue color ids
  because some manuals use numeric color codes instead of names.
- The first local catalogue input for color parsing is Rebrickable
  `colors.csv`, using `id`, `name`, `rgb`, and `is_trans`. Row parsing depends
  on `id` and `name`; `rgb` and `is_trans` are retained for swatch display,
  transparency handling, and debug scoring.
- Studio visual inventory color ids should come from a local
  Rebrickable-derived external colour alias snapshot, currently
  `external_color_aliases.csv`, using Rebrickable colour API `external_ids`.
  This avoids scraping BrickLink or expanding a hand-built table for every
  observed Studio color while keeping Rebrickable as the normalized output
  catalogue.
- Local part-number validation uses a browser-safe transient snapshot built
  from Rebrickable `parts.csv` and `part_relationships.csv`. The parser keeps
  the manual part number as extracted, but row scoring can recognize exact
  catalogue parts, catalogue-derived external aliases, common missing mold
  suffixes, print families, print parent relationships, and related mold
  families.
- External part aliases must come from the local catalogue snapshot, such as
  generated LDraw aliases whose target exists in Rebrickable `parts.csv`.
  Recognition code should not accumulate hand-maintained BrickLink/Studio
  alias mappings.
- Local catalogue enrichment may derive additional BrickLink-to-Rebrickable
  part aliases from the public LDraw parts library, specifically from
  `!KEYWORDS BrickLink ...`, `!KEYWORDS Rebrickable ...`, and unambiguous
  `~Moved to` references. Rebrickable remains the canonical part-number source:
  generated aliases are accepted only when their target exists in the local
  Rebrickable `parts.csv`, and ambiguous aliases are dropped instead of guessed.
- Catalogue reads during extraction should use an already-available local
  snapshot for parser validation only. Increment 3 owns deployed catalogue
  refresh mechanics; see
  [Increment 3](03-rebrickable-normalization.md#catalogue-update-and-deployment-policy)
  and the [production catalogue contract](../catalogue-production.md).
- User-facing part previews may read `part_img_url` and part names from the
  same local `parts.csv` snapshot after extraction completes when no resolved
  manual color is available. When color-specific local image URLs are
  unavailable, the preview endpoint may use Rebrickable's parts list endpoint
  with bounded `part_nums` queries grouped by `color_id` and backed by an
  in-memory cache. This is display enrichment only: it must not change row
  recognition or normalization decisions.
- The app starts a transient PaddleOCR.js worker warm-up after browser page
  load so model and runtime startup can overlap with file selection. The OCR
  pass consumes the warmed engine when available and disposes it after
  extraction. Worker acquisition has its own bounded deadline, then the page OCR
  walk gets a fresh bounded deadline so a slow warm-up does not prevent earlier
  tail pages from being scanned. Manual page data is still not cached or
  persisted.
- The initial PaddleOCR.js integration uses PP-OCRv5 English detection and
  recognition with ONNX Runtime Web. The browser fetches pinned model archives
  through the app's same-origin OCR asset route because the upstream Paddle
  model host does not expose CORS headers for direct browser downloads. It
  still relies on remote model assets and a pinned ONNX Runtime WASM CDN path;
  before deployment, self-host those OCR assets or keep the runtime CDN/cache
  dependency documented explicitly.
- Visual bill-of-materials pages often OCR as separate positioned lines for
  quantity, part number, and color, not as ready-made row text. The fallback
  must request OCR layout data, reconstruct each same-column label stack, and
  then pass synthetic `<quantity> x <part number> <color>` rows through the
  same parser and catalogue color matching.
- Dense visual inventory pages may place the quantity, part label, and color
  label at noticeably different x positions inside one item cell. The OCR
  fallback should group nearby labels into visual grid cells before row
  reconstruction, and should only accept bare-number quantities when the cell
  also contains strong part and color evidence.
- Some Studio-style bill-of-materials pages OCR the part label as
  `<part number>, <color code>` with the quantity in a separate label above the
  part image. The OCR fallback should reconstruct these into the same parser
  grammar and tolerate common quantity OCR slips such as `4x` becoming `ax` or
  `ZF` when there is visual row evidence.
- When a Studio-style numeric color page still leaves regionless or conflicting
  quantity evidence, the browser OCR path may run one extra composite OCR sheet
  of small quantity crops for that page. The crop retry is constrained to
  already-recognized part/color anchors, accepts explicit `3x`-style quantities,
  and only accepts bare numeric crops when they reduce an existing quantity for
  the same part/color. This keeps the retry generic while avoiding row creation
  from neighboring part labels.
- OCR rendering should use a bounded page scale and remain tunable. The current
  browser default pass is 3200px page width because dense visual inventory pages
  lost rows at lower scales, including single-character misses in part numbers
  and fused color/part-number labels. Dark, dense pages with noisy OCR evidence,
  missing row regions, or partial color labels can take a capped 5000px
  high-resolution retry so long parts-list spans do not pay the highest render
  cost on every page. Light-background dense pages may use the same capped
  high-resolution retry only when the raw OCR contains more likely part labels
  than reconstructed rows and some row evidence is low quality. Selection should
  prefer region-backed rows over denser regionless aligned-text output.
- Dense light-background inventory pages can lose rows at the lower page edge
  even when the rest of the page OCRs cleanly. When a dense page's parsed row
  regions stop noticeably above the page bottom, the browser OCR path runs a
  padded bottom-strip retry, maps strip coordinates back to the original page,
  and lets the retry fill missing rows without overwriting conflicting primary
  rows.
- Some light-background inventory pages contain enough labels for the full-page
  OCR to see the parts but still miss rows because visual columns scramble the
  reading order. When the raw OCR text contains more likely part labels than the
  reconstructed rows, the browser OCR path can run overlapping column-tile
  retries, map tile coordinates back to the source page, and merge only the
  structured row evidence from those retries. Rows that come only from retry
  tiles must still carry resolvable color evidence, such as a known color name
  or supported Studio color code, before they are accepted. This prevents
  cropped part-number prefixes from becoming extra unresolved rows.
- Dense light-background inventory pages can have visually obvious part
  thumbnails while the adjacent labels OCR poorly. The browser OCR path can use
  rendered-page foreground segmentation to detect likely part-image anchors,
  crop only uncovered local label regions around those anchors, OCR the crop
  sheet, and append only region-backed, non-fragment rows that do not conflict
  with already accepted rows. This acts as a conservative gap-filler rather
  than a second full-page parser.
- Dense Studio label crop sheets may need different page segmentation from the
  primary full-page OCR. Context crops are laid out as regular text rows and can
  use block-oriented segmentation, while tighter label crops still benefit from
  sparse text segmentation. Catalogue-backed cleanup may repair OCR-only
  quantity prefixes and short suffix noise when the corrected part exists in the
  local Rebrickable snapshot, and same-page duplicate cleanup should prefer the
  cleaner exact row over correction-derived conflicts.
- Studio color-code pages should treat unresolved, regionless rows and
  unresolved three-digit fragments as weak OCR evidence. Catalogue-backed
  leading-digit cleanup may still recover rows such as a split leading digit
  before filtering, and duplicate exact rows should collapse only when their
  OCR evidence points to the same visual row so distinct repeated visual rows
  keep their source metadata.
- Dense Studio pages with many `<part>, <color-code>` labels can benefit from a
  two-phase label retry: first run below-anchor context crops, then run tighter
  below-anchor crops only when raw Studio label evidence still exceeds the
  merged row count. Retry-created rows should require explicit or
  context-specific glyph-slip quantity evidence before being admitted. This
  keeps MOC-77633-style dense pages close to the first-pass runtime while
  avoiding the extra rows produced by always combining every crop variant.
- Browser OCR must apply sparse text page segmentation per recognition request,
  not only through worker-level mutable state. Dense visual inventory pages can
  collapse from roughly page-complete extraction to single-digit row counts when
  the worker falls back to automatic page segmentation.
- Dense visual inventory OCR can fuse a color line with a neighboring or
  trailing part number, such as `Light Bluish Gray99207`. The row
  reconstruction path should recover trailing part numbers from these fused
  lines and treat the remaining text as the color evidence.
- Dense visual inventory OCR can also preserve the right color phrase while
  fusing a leading fragment from a neighboring label, such as
  `sh GrayDark Bluish Gray`, or can drop important modifiers if the normalizer
  recognizes only the generic trailing word. OCR color normalization should keep
  specific modifiers such as `Dark` and `Trans` before accepting generic
  `Blue`, `Green`, or `Red` matches.
- Dense visual inventory OCR can also split one quantity across a short cluster
  of nearby part labels where one color line carries a fused trailing part
  number, such as `Reddish Brown99207`. The aligned-text fallback may reuse the
  quantity across that bounded same-color cluster only when the cluster starts
  with a single isolated quantity, contains multiple part labels, and confirms
  the same catalogue color on the following lines.
- Dense visual inventory OCR can also fuse a color phrase to a one-digit
  variant of a real but unrelated part number, such as a row reading
  `Dark Bluish Gray47993` where the manual label is the related mold `47998`.
  The parser may correct this only when the row-source tokens prove the fused
  color/part shape, the observed exact catalogue part has no mold-family
  evidence, the replacement differs by a narrow OCR digit-confusion pair, and
  the replacement has Rebrickable mold-family evidence. This keeps catalogue
  normalization from becoming a broad part-number guessing step.
- Dense visual inventory OCR can also attach short junk suffixes to otherwise
  valid color names, such as `Reddish Browngy` or `Reddish BrownReddish`.
  Catalogue color phrase matching should accept those suffixes only after a
  specific color phrase has been recognized. When OCR retries return both a
  cropped part-number prefix and a full overlapping part number, duplicate
  collapse should require the same resolved color evidence, including matching
  Studio color ids, so adjacent differently colored rows are not merged.
- Numeric color codes in Studio-style visual inventories may be BrickLink/Studio
  color ids rather than Rebrickable ids. OCR-generated Studio codes should be
  tagged internally, such as `studio-86`, so they can map to Rebrickable `71`
  without overriding a manual row that genuinely uses raw Rebrickable color id
  `86`. Browser catalogue loading should prefer the Rebrickable external colour
  alias snapshot and retain only a small fallback alias table for missing
  catalogue data.
- Quantity glyph-slip handling must remain context-sensitive. For named-color
  visual rows, `we` is more likely to be a distorted `5x`; for Studio numeric
  color grids, the same OCR token is more often a distorted `4x` near a
  comma-separated part/color label. Keep these paths separate instead of using
  one global glyph substitution.
- Dense visual inventory pages can OCR as alternating quantity lines and
  `<part>, <color>` lines. The OCR fallback includes an aligned-text fallback
  for pages where block-based reconstruction finds no rows, but broad
  engine-specific retry modes and always-on aligned merging produced too many
  false positives in the current example set and should not be the default
  without a selective retry heuristic.
- OCR should run from the end of the manual backwards and continue across
  adjacent candidate pages without a fixed tail-page cap. Once a parts-list
  page has been found, the current pass stops on the first subsequent
  non-candidate OCR page while walking backwards. This keeps the scan aligned
  with the manual-visible parts-list span instead of paying for unrelated
  earlier instruction pages.
- If terminal pages are decorative non-inventory pages, the backward OCR scan
  can skip those pages before declaring there is no inventory span. Before a
  span has been anchored, a page must provide repeated row evidence to start
  the inventory span; weak step-like callouts are not parsed as a final bill of
  materials when no span is found.
- User-facing OCR progress should publish useful rows during backward span
  detection. As soon as an OCR page parses as inventory evidence, the app
  emits a partial parts-list result and keeps updating it while the backward
  walk looks for earlier inventory pages and later dense refinement improves
  confidence.
- Final row selection should not parse only the strongest scored pages. Strong
  pages anchor the bill-of-materials span, then contiguous neighboring
  candidate pages with parsed row anchors should be retained even when color OCR
  keeps their page score below the strong-page threshold. This protects recall
  for multi-page visual inventories where the first pages are dense or noisy.
- Preserve private thumbnail crop references from the bill of materials. Later
  step recognition should match manual step images against these manual-style
  bill-of-materials crops first, then use normalized catalogue data only for
  user-facing names and thumbnails.
- Store enough private layout data for later recognition:
  - source page
  - row bounding region
  - part thumbnail bounding region
  - raw text or OCR tokens
  - crop hash or private crop reference
  - parsed row fields
  - parser version
  - confidence and alternate candidates
- Local private examples can be used for browser-based tuning and catalogue/data
  analysis, but manuals, rendered pages, OCR text, and row-level private outputs
  must not be committed.
- Browser annotations are the primary qualitative tuning signal during this
  increment. Any automated regression harness for recognition must drive the
  same browser extraction path used by the app; Node-only OCR scripts are
  explicitly out of scope because they can produce different row counts,
  candidate pages, and runtime behavior.
- Browser annotations are useful as qualitative triage, especially when they
  identify bad rows or missed source pages. Algorithm tuning should convert
  those annotations into browser-path parser fixtures or focused in-app debug
  checks instead of relying on screenshots alone.
- In-app debug diagnostics are local review surfaces for the currently uploaded
  manual. They may expose private derived row text, source regions, and OCR
  tokens; they should not become exported product data or replace the
  hands-off confidence gates.
- Debug page previews use higher-resolution private page renders than the
  initial upload shell used so row evidence remains readable during local
  tuning. During recognition tuning these renders remain transient and must not
  be written to a persisted browser cache. The app has no manual-analysis or
  page-render cache path in this increment; reuploading or reloading must rerun
  extraction with the current code.
- The debug view should render only candidate pages and parsed source pages,
  not the whole manual. Full-manual rendering adds noticeable latency on larger
  PDFs and is outside this increment because the manual remains the source file,
  not an in-app viewer.

## Proposed Processing Strategy

1. Validate and fingerprint the uploaded PDF using the Increment 1 intake path.
2. Search native PDF text tail-first for bill-of-materials candidates.
3. If native-text confidence is weak, expand the native-text candidate search.
4. Extract positioned native text from candidate pages when available.
5. Render and OCR pages from the end of the manual backwards until the detected
   bill-of-materials span ends, requesting OCR layout data so positioned label
   stacks can be reconstructed.
6. For dark parts-list renders, run additional inverted and thresholded OCR
   passes so white inventory labels are presented as black text on a light
   background, then merge the OCR outputs before parsing.
7. If OCR still fails to identify a bill-of-materials span, return unsupported
   instead of inferring an inventory from earlier instruction pages.
8. Parse rows by anchoring on `<quantity> x <part number>`.
9. Match the following text segment to a finite catalogue color vocabulary.
10. Validate candidates against local catalogue data when available.
11. Merge wrapped rows and multi-column regions by layout order.
12. Score each row and the full bill of materials.
13. Return supported, needs-attention, or unsupported status.

## Initial Performance Boundary

During recognition tuning, the active parts-page OCR walk is bounded by page
selection rather than by a wall-clock timeout:

- preparatory OCR worker acquisition starts on page load and can be cancelled
  by the active job abort signal
- native text candidate search remains tail-first
- page rendering and OCR should continue backwards through the detected
  parts-list span instead of dropping earlier parts pages because of a fixed
  tail-page cap
- parsing, merge, scoring, and catalogue validation should produce partial,
  needs-attention, or unsupported results from whatever page data was actually
  scanned

Full-manual OCR is not part of the primary path.

## Measurement Targets

- Candidate-page recall: at least one true bill-of-materials page is selected
  for every supported fixture.
- Accepted row match: at least 95% of expected rows match quantity, part
  number, and color exactly or through a documented compatible alias/group in
  the local comparison harness.
- Accepted quantity-weighted match: at least 99% of expected total quantity
  matches before the result is considered hands-off ready.
- False positive quantity: unexpected parsed rows should not materially affect
  the total bill of materials.
- Unsupported detection: manuals without a detectable bill of materials should
  fail closed without producing inferred bagging input.
- Runtime: during recognition tuning, supported fixture extraction should
  report which pages were scanned and emit a clear needs-attention or
  unsupported state when parsing remains incomplete. A production wall-clock
  timeout is deferred until recognition recall is stable.

### Current Performance Notes

- Lowering full-page Paddle OCR width below 3200px was tested at 2400px and
  2800px on `MOC-169454`; both reduced OCR recognition time but lowered
  accepted quantity accuracy, so the default remains 3200px.
- Large visual BOM manuals now publish partial OCR inventory rows during
  backward span detection and before any dense refinement completes. Focused
  browser-path runs after first-miss stopping and selective refinement kept
  final accuracy unchanged on the large private checks: `MOC-169454` first
  showed rows in about 32s and completed in about 77s; `MOC-84176` first showed
  rows in about 52s and completed in about 100s; `MOC-51927` first showed rows
  in about 57s and completed in about 112s.
- Dense crop refinement reuses first-pass OCR text and the retained PaddleOCR
  worker where possible. It now runs only for a concentrated low-confidence
  page set, rather than every page with any low-confidence row, so the largest
  manuals stay near the 120s target without dropping the accepted row or
  quantity metrics.
- The final Castle closeout path splits OCR into a lightweight single-worker
  candidate-page pass and dense candidate-page processing only for detected BOM
  pages. Candidate dense OCR defaults to three workers; the same-code Hall
  Tower comparison showed `split3` completing in about `618s` versus about
  `692s` for the baseline and about `652s` for `split4`, while preserving
  100% row and quantity accuracy.
- Final verification still shows runtime variance in the browser path:
  `MOC-51927` produced usable rows at about 73s and completed in about 127s on
  the latest run, with recent browser-path runs ranging from about 88s to 139s
  end to end. The current UX benefits from progressive rows, but production
  hardening still needs tighter runtime predictability.

## Browser-Path Validation Harness

Increment 2 uses `npm run validate:manuals` for local private-manual regression
checks. The command drives the same browser UI path as the product, discovers
ignored local example directories with exactly one PDF and one CSV, excludes
known no-BOM local examples such as `MOC-138457`, waits for analysis completion
instead of partial streamed rows, and writes a redacted JSON report under
`.bag-it/private/validation/latest.json`.
The same harness can run explicit no-BOM checks with `--expect-unsupported`,
which passes only when every provided manual reports `unsupported` with zero
candidate pages and zero extracted rows.

The harness reports both exact matches and accepted compatible matches, because
Rebrickable CSV exports can contain alternate molds, print parents, or compatible
colour aliases that do not exactly match the manual text. Row-level missing,
extra, and raw debug OCR details are available only through explicit script
flags and remain private local tuning artifacts.

For Increment 2 closeout, local examples should be treated as explicit suites:

- `gate`: realistic private manuals used for the increment pass/fail decision;
  currently the Castle manual-print hard gate
- `performance`: large manuals used to guard runtime and progressive-result UX
- `exploratory`: outlier manuals that inform tuning but do not block closeout
- `no-bom`: manuals that should fail closed as unsupported

For formal Increment 2 closeout, the operational `gate` suite is the private
Castle manual-print split:

- `01-castle-ramp`
- `02-middle-wall`
- `03-lower-courtyard`
- `04-upper-courtyard`
- `05-hall-tower`

The Castle gate must be run through the browser-path harness, with no analysis
wall-clock timeout during recognition tuning:

```bash
node scripts/validate-manual-parts.mjs \
  --suite .bag-it/private/multipart/MOC-220614/manual-print-expected-examples \
  --redacted \
  --fail-on-diff \
  --fail-on-gates \
  --require-exact \
  --analysis-timeout-ms=0 \
  --output .bag-it/private/multipart/MOC-220614/manual-print-validation-castle-final-auto.json
```

The 2026-05-17 closeout report passed this hard gate:

- Combined Castle summary: actual rows `1849/1849`, matched quantity
  `8892/8892`, accepted row `1`, exact row `1`, accepted quantity `1`, exact
  quantity `1`, compatible alias matches `0`, missing rows `0`, extra rows
  `0`, assertion failures `0`.
- `01-castle-ramp`: rows `81/81`, quantity `200/200`, extras `0`, missing
  `0`.
- `02-middle-wall`: rows `231/231`, quantity `608/608`, extras `0`, missing
  `0`.
- `03-lower-courtyard`: rows `561/561`, quantity `2571/2571`, extras `0`,
  missing `0`.
- `04-upper-courtyard`: rows `354/354`, quantity `1229/1229`, extras `0`,
  missing `0`.
- `05-hall-tower`: rows `622/622`, quantity `4284/4284`, extras `0`,
  missing `0`.

Any future drop in those Castle metrics blocks the change, even if the broader
accepted-match thresholds still pass.

The earlier broader private gate set remains useful as additional regression
evidence:

- `MOC-129110`: small clear bill of materials; current browser-path comparison
  is clean and fast.
- `MOC-132385`: small-to-medium multi-page bill of materials; current
  browser-path comparison clears the accepted row and quantity gates.
- `MOC-84176`: larger visual/noisier bill of materials; current browser-path
  comparison clears the accepted row and quantity gates and gives useful
  runtime coverage.
- `MOC-169454`: dense visual bill of materials; promoted after local
  browser-path validation cleared the accepted row and quantity gates.
- `MOC-77633`: dense Studio-style visual bill of materials; promoted after
  local browser-path validation cleared the accepted row and quantity gates.

The recommended `performance` guard is `MOC-51927`, because it currently clears
the accepted row and quantity gates while exercising the large-manual path near
the 120s target.
Extra-large and unusually noisy manuals such as `MOC-191306`, `MOC-228536`,
`MOC-232918`, `MOC-148394`, and `MOC-204568` belong in `exploratory` until the
supported-manual boundary is widened deliberately.

The earlier broader local Increment 2 verification pass wrote the redacted
five-manual gate report to `.bag-it/private/validation/gate-final.json` and passed
`--fail-on-gates`:

- Combined gate summary: accepted row `0.985897`, accepted quantity
  `0.993138`.
- `MOC-129110`: accepted row `1`, accepted quantity `1`.
- `MOC-132385`: accepted row `0.984375`, accepted quantity `0.995455`.
- `MOC-84176`: accepted row `0.986607`, accepted quantity `0.993243`.
- `MOC-169454`: accepted row `0.978723`, accepted quantity `0.99359`.
- `MOC-77633`: accepted row `0.9875`, accepted quantity `0.990862`.

The explicit no-BOM check wrote the redacted report to
`.bag-it/private/validation/no-bom-MOC-138457.json` and passed
`--expect-unsupported`: `MOC-138457` reported `unsupported` with zero extracted
rows and zero candidate pages in `31489ms`.

The current performance guard wrote the redacted report to
`.bag-it/private/validation/performance-MOC-51927.json` and passed accuracy
gates:

- `MOC-51927`: accepted row `0.988235`, accepted quantity `0.999197`.
- Browser analysis completed in `127450ms`; the first usable parts result
  appeared at `73008ms`.
- Runtime remains variable across browser OCR runs. This is close enough for
  recognition-tuning evidence, but not a hard production performance closeout.

The latest local promotion-candidate gate run wrote the redacted report to
`.bag-it/private/validation/promotion-candidates-gate.json` and passed
`--fail-on-gates` for both promoted manuals:

- `MOC-169454`: accepted row `0.978723`, accepted quantity `0.99359`.
- `MOC-77633`: accepted row `0.9875`, accepted quantity `0.990862`.
- Combined promotion-candidate summary: accepted row `0.983645`, accepted
  quantity `0.992238`.

## Open Questions

- The committed shared fixture-set remains deferred. Local private examples are
  the operational Increment 2 gate for now, but an approved synthetic, public,
  licensed, or explicitly approved fixture set with at least three supported
  manuals is still required before the repository can carry shared recognition
  fixtures. Recognition regression checks must run through the browser extraction
  path, not a separate Node OCR benchmark.
- The parser now carries optional private OCR source metadata for reconstructed
  rows: raw OCR tokens, text ranges, row regions, inferred part-thumbnail
  candidate regions, source canvas dimensions, parser version, and
  crop-reference anchors. The debug tab can project those regions onto private
  transient page previews for local tuning. Native text rows still expose source
  page and text ranges but do not have PDF text geometry yet.
- This tuning pass does not persist crop images. The crop-reference anchors
  identify private page regions for later internal matching, but any durable
  crop storage and deletion policy must be designed in a later increment before
  step-image matching relies on bill-of-materials crops.
- Which approved, synthetic, public, licensed, or explicitly approved manuals
  eventually form the committed shared fixture set?
- The first part-validation fields are `parts.csv` `part_num` and
  `part_relationships.csv` `rel_type`, `child_part_num`, and
  `parent_part_num`. Which Rebrickable elements, inventories, and part-color
  availability download fields are required before Increment 3 normalization?
- If generated LDraw alias data is bundled or checked in later, what exact
  attribution and license notice should ship with it? The current generated
  alias snapshot stays in the ignored local private catalogue cache.
- How should private extraction crops be retained in production while preserving
  the Increment 1 privacy boundary?
- `MOC-169454` now clears the local accepted row and quantity gates after the
  validation comparator accepts split compatible mold rows such as manual
  `48729a`/`48729b` rows against a Rebrickable `3484` expectation. Remaining
  row-level diffs stay useful for tuning but no longer block the local gate.
- Current `MOC-84176` browser-path validation is 223/224 rows, improving from
  221/224 without increasing extras. The known remaining misses are still OCR
  or source-label issues rather than catalogue normalization misses.
- `MOC-77633` now clears the local accepted row and quantity gates after OCR
  cleanup recovers printed-part separator slips such as `97304q` to `973p4q`
  and the validation comparator accepts minifigure leg component rows against
  Rebrickable leg-assembly expectations. Remaining row-level diffs are mostly
  private CSV/manual catalogue disagreement and exploratory tuning material.
