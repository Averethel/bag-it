# Codex Guidance

This page is guidance for future Codex sessions working in this repository.

## Before Editing

1. Read [active-increment.md](active-increment.md).
2. Read [product-principles.md](product-principles.md).
3. Read [high-level-plan.md](high-level-plan.md).
4. Read [quality-gates.md](quality-gates.md).
5. Read [validation-pattern.md](validation-pattern.md).
6. Read the active increment page.
7. Keep changes scoped to the active increment unless the user explicitly changes it.
8. Start new increment and feature work from `main` on a short-lived branch,
   unless the user explicitly asks for a different base.

## Increment Discipline

- Keep the active increment documented in [active-increment.md](active-increment.md).
- Work on exactly one increment at a time.
- Do not implement later-increment behavior while working on an earlier shell or planning increment.
- If the requested work appears to cross increment boundaries, stop and update the active increment decision before coding.

## Requirement Discipline

- Treat user requests, active-increment deliverables, and acceptance criteria as
  the implementation source of truth.
- Do not promote inferred optimizations, architecture, persistence, caching,
  storage backends, background workers, or resumability into implementation
  scope just because they seem useful.
- If a change would introduce a new data-retention behavior, persisted derived
  artifact, cache, external service dependency, or cross-session reuse path, it
  needs an explicit deliverable, acceptance criterion, and retention/deletion
  policy before coding starts.
- General guidance such as "performance matters" or "prefer caching" is not
  authorization to persist private manual analysis. Translate broad guidance
  into the smallest active-increment behavior first, and ask or document a
  scope decision before adding infrastructure.
- When a proposed implementation adds behavior the user did not ask for, write
  it down as a future option or open question instead of implementing it.

## Product Assumptions

- The source manual is immutable and private.
- Uploaded manual PDFs must not be committed, bundled, stored as ordinary
  fixtures, or persisted as long-lived product data.
- Transient PDF access, derived page renders, crops, hashes, filenames, and
  extracted metadata need explicit retention and deletion rules.
- The app produces bagging support around the manual.
- User-facing work should prioritize parts, steps, bag assignments, and confidence.
- Internal debug tools may use page images and crops, but the MVP must not expose a user-facing PDF viewer unless the roadmap is explicitly changed.
- Manuals without a detectable bill of materials are unsupported for MVP bag generation.

## Implementation Biases

- Prefer a vertical slice before broad infrastructure.
- Preserve raw OCR and recognition outputs for later debugging only within the
  documented privacy, retention, and deletion boundary.
- Normalize extracted parts through Rebrickable before presenting them as canonical data.
- Design data models so uncertain extraction can coexist with normalized results.
- Treat recognition quality as measurable product behavior, not a one-off script.

## Commit Discipline

- Branch from `main` for each increment or feature-sized unit of work.
- Prefer smaller commits that each capture one coherent planning,
  implementation, test, or cleanup step.
- Use semantic commit messages for all commits created by Codex.
- Follow the Conventional Commits shape: `<type>: <imperative summary>`.
- Prefer common types such as `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, and `build`.
- Example: `feat: add increment 0 bagging shell`.

## UI Direction

- Use Next.js, React, and Chakra UI.
- Build the actual workflow, not a marketing landing page.
- Focus the first screen on upload and processing status.
- Use dense, practical views for parts, bags, confidence, and exports.
- Do not require users to inspect the original PDF inside the app for the MVP.

## Performance Direction

- Make analysis asynchronous.
- Show partial results as soon as they are useful.
- Cache expensive work only when the active increment explicitly allows that
  cache and defines what may be retained, for how long, where it is stored, and
  how stale data is invalidated.
- Keep Rebrickable catalogue data local or cached for critical paths.
- Avoid making users wait for full recognition before seeing any value.
- Treat the baseline performance expectations in [quality-gates.md](quality-gates.md) as part of MVP readiness.

## Documentation Rule

When a planned increment changes, update both:

- [active-increment.md](active-increment.md), if the active implementation scope changes
- [high-level-plan.md](high-level-plan.md), if sequencing or scope changed
- [quality-gates.md](quality-gates.md), if readiness thresholds or support boundaries changed
- the specific increment page in [increments](increments)

After an increment or meaningful planning change, follow [validation-pattern.md](validation-pattern.md) before calling the work complete.
