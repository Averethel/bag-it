# Bag It Agent Instructions

These instructions are for the fresh Bag It repository. Treat this file and
`docs/wiki/**` as the only canonical project context.

Do not rely on source files, branch history, fixtures, screenshots, private
artifacts, or implementation notes from any earlier project state unless the
user explicitly provides them inside the fresh repository.

## Wiki Format

Keep project knowledge in `docs/wiki`.

Required wiki files:

- `docs/wiki/README.md`: index, current status, and links to every active spec
- `docs/wiki/scope.md`: product boundary, retained scope, excluded scope, and
  rebuild assumptions
- `docs/wiki/product-principles.md`: product constraints and user experience
  principles
- `docs/wiki/ui-spec.md`: app layout, tab behavior, states, and accessibility
  expectations
- `docs/wiki/build-steps-spec.md`: step-callout discovery inputs, outputs,
  algorithm stages, Build steps tab, and validation
- `docs/wiki/bagging-spec.md`: draft bagging policy, checklist behavior,
  multipliers, row identity, and completion transfer
- `docs/wiki/privacy-session-spec.md`: private source-byte lifecycle, session
  files, purge behavior, stale-analysis invalidation, and completion anchors
- `docs/wiki/engineering-ci-spec.md`: stack, scripts, test strategy, CI/CD,
  deployment, and commit discipline
- `docs/wiki/quality-gates.md`: measurable readiness gates
- `docs/wiki/rebuild-plan.md`: increment sequence and open decisions
- `docs/wiki/increments/<nn>-<slug>.md`: one file per active or completed
  increment
- `docs/wiki/decisions/<yyyy-mm-dd>-<slug>.md`: durable technical decisions

Every wiki page must be self-contained enough to survive without private
artifacts. Use relative links inside `docs/wiki`. If a screenshot, crop, or
diagram is added, store it under `docs/wiki/assets/`, mark whether it is
synthetic or user-approved, and explicitly mark excluded UI such as BOM,
Rebrickable, part-list, or debug surfaces.

Before product or implementation changes:

1. Read `docs/wiki/README.md`.
2. Read the relevant spec page.
3. Read the active increment page.
4. Update the relevant wiki page when behavior or scope changes.
5. Validate against `docs/wiki/quality-gates.md`.

## Product Boundary

Build companion bagging guidance for uploaded MOC manuals. The original manual
remains the source of truth for building.

Keep:

- app shell and most retained UI structure
- PDF upload and private session lifecycle
- Build steps discovery logic and Build steps tab
- division of detected step-callout parts into draft bags
- Bags checklist UI and progress
- CI/CD pipeline

Exclude from the fresh MVP:

- BOM discovery
- BOM debug UI
- parts-list OCR
- Rebrickable catalogue normalization
- catalogue preview or matching APIs
- user-facing PDF viewer
- replacement build instructions

## Stack Direction

Use:

- Next.js 16
- React 19
- Chakra UI v3
- TypeScript
- Vitest
- Webwright for browser-driven e2e validation
- CircleCI
- Vercel

Prefer server/client boundaries that match Next.js App Router conventions. Keep
browser-only PDF rendering, canvas work, session-file handling, and checklist
interactions behind explicit client boundaries.

## Project Skills

Install or define project skills for these areas during fresh-repo bootstrap.
Keep long references out of always-on context unless they materially change
most tasks.

Required project skills:

- `nextjs`: Next.js App Router, routing, metadata, async APIs, RSC boundaries,
  image/font optimization, and deployment conventions
- `chakra-ui`: Chakra UI v3 setup, provider, theme tokens, snippets,
  accessibility, and layout primitives
- `react-best-practices`: React and Next.js performance guidance, especially
  avoiding waterfalls, reducing bundle size, stable rendering, and client/server
  serialization discipline

Book-derived skills:

- Source repository: `https://github.com/ciembor/agent-rules-books`
- Usage guide: `https://github.com/ciembor/agent-rules-books/blob/main/docs/USAGE.md`
- Use the repository's `mini` files as the default skill body.
- Use `nano` only for tiny always-on reminders.
- Use `full` only as an on-demand reference, audit source, or derivation source.
- Prefer scoped, on-demand skills over global loading.
- Do not load multiple book rule sets globally.

Initial book-skill catalog:

- `a-philosophy-of-software-design`
- `clean-architecture`
- `clean-code`
- `code-complete`
- `designing-data-intensive-applications`
- `domain-driven-design`
- `domain-driven-design-distilled`
- `implementing-domain-driven-design`
- `patterns-of-enterprise-application-architecture`
- `refactoring`
- `refactoring-guru`
- `release-it`
- `the-pragmatic-programmer`
- `working-effectively-with-legacy-code`

Use book-derived skills only when the work matches the skill. Examples:
refactoring work uses `refactoring`; risky changes in difficult code use
`working-effectively-with-legacy-code`; reliability or deployment behavior uses
`release-it`; modeling-heavy work uses the DDD skills.

## Caveman Brevity

Use caveman `full` as the always-on communication layer for all work in this
repository. This is project behavior, not an optional per-turn skill trigger.
It remains active across turns and sessions through this `AGENTS.md` file.

- Source repository: `https://github.com/juliusbrussee/caveman`
- Install guide: `https://github.com/juliusbrussee/caveman/blob/main/INSTALL.md`
- Repo-local skill path: `.agents/skills/caveman/SKILL.md`.
- Keep `caveman-shrink` enabled unless it interferes with tool discovery.
- Use `full` as the project baseline: compact fragments are acceptable when
  technical meaning stays clear.
- Use `lite` only when `full` risks ambiguity for the task.
- Do not use `ultra` or `wenyan` for project work.
- Stop only when the user says `stop caveman` or `normal mode`; resume `full`
  when project context reloads unless the user repeats that override.

Expected communication style:

- concise status and final messages
- no filler, praise, or restating the obvious
- preserve concrete file paths, commands, decisions, risks, and validation
  results
- explain tradeoffs when they affect implementation choices

## Implementation Discipline

- Work one increment at a time.
- Keep behavior within the active increment unless the wiki changes first.
- Build small, single-concern, composable modules. Production modules should
  hide one clear responsibility behind a narrow interface; avoid catch-all
  files, grab-bag helpers, and mixed detector/extractor/UI/session logic.
- Enforce the new detector shape with scoped SonarJS ESLint rules for
  `src/features/steps/v2/**`. If SonarJS flags complexity, simplify the design
  or extract a real concept instead of adding inline disables; exceptions need
  a durable wiki decision.
- Treat `src/features/steps/step-callout-detection.ts` as a legacy frozen
  detector/extractor monolith. Do not add new detector, quantity OCR, part
  extraction, crop, color, or conflict-resolution behavior there except to
  archive, delete, or move behavior into smaller modules under tests.
- Preserve private manuals and derived crops as user-owned local data.
- Do not commit private PDFs, rendered pages, crops, or row-level debug output.
- Prefer progressive processing, cacheable intermediate results, and resumable
  jobs over blocking full-analysis flows.
- Private manual validation and scratch scripts must run inside the repository
  workspace or `/private/tmp`. Prefer repo-local `.bag-it/private/**` for
  reusable private replay/debug scripts because it is writable and gitignored.
  Do not use approval-gated edits or elevated filesystem permissions for these
  paths; rewrite the helper to use writable locations instead, especially when
  the user is AFK.
- Persist checked bag completion with row ids plus page, callout-crop, and
  part-crop coordinate anchors. If the detector version changes, rerun detection
  and transfer completion only when one confident coordinate match exists.
- Keep detector internals measurable with fixtures and regression tests.

## Commit Discipline

Use semantic Conventional Commit messages:

```text
<type>: <imperative summary>
```

Preferred types:

- `feat`
- `fix`
- `docs`
- `test`
- `refactor`
- `chore`
- `build`
- `ci`

Keep commits focused. Do not mix unrelated product, implementation, and
documentation changes.

After completing any code, documentation, or configuration change, stage and
commit the task-owned changes before the final response unless the user
explicitly asks not to commit or a concrete blocker prevents a clean commit. If
the worktree contains unrelated user changes, leave those unstaged and report
them instead of folding them into the commit.

## Validation

Before finishing meaningful work:

1. Update the relevant wiki page.
2. Run focused tests for the changed area.
3. Run Webwright validation when UI, upload, Build steps, Bags, or session
   behavior changes.
4. For detector or Build steps changes, validate the browser-rendered app path
   against every user-annotated expected page/count/crop in scope. Do not call
   the work done when those annotations fail; iterate until they pass or record
   a concrete blocker.
5. For detector tuning, validate every known-good saved session and private
   manual replay in scope before reporting completion; iterate on failures.
6. Run the full verification command before merge.
7. Document deferred items as open questions or future work in the wiki.
