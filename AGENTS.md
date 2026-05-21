# Codex Working Notes

Before making product or implementation changes, read:

- [docs/wiki/active-increment.md](docs/wiki/active-increment.md)
- [docs/wiki/README.md](docs/wiki/README.md)
- [docs/wiki/product-principles.md](docs/wiki/product-principles.md)
- [docs/wiki/quality-gates.md](docs/wiki/quality-gates.md)
- [docs/wiki/validation-pattern.md](docs/wiki/validation-pattern.md)
- The relevant increment page in [docs/wiki/increments](docs/wiki/increments)

## Product Constraints

- The uploaded MOC manual is the source of truth.
- Do not alter, rewrite, or re-render manual pages as part of the user experience.
- The app produces companion bagging guidance, not replacement instructions.
- The MVP should avoid a user-facing PDF viewer unless a later requirement explicitly adds it.
- Optimize for a hands-off experience. Do not design flows that require users to correct many rows manually.
- Performance matters. Prefer progressive processing, caching, and background jobs over blocking full analysis.

## Planned Technical Direction

- Use Next.js, React, and Chakra UI.
- Use Rebrickable as the catalogue normalization source.
- Keep recognition internals measurable with fixtures and regression tests.
- Preserve raw extraction data next to normalized data so recognition can be debugged later.
- Make each deliverable increment small enough to test and adjust independently.
- Treat the baseline readiness and performance criteria in [docs/wiki/quality-gates.md](docs/wiki/quality-gates.md) as MVP requirements.

## Increment Discipline

- Keep the active increment documented in [docs/wiki/active-increment.md](docs/wiki/active-increment.md).
- Work on one increment at a time.
- Do not implement behavior from later increments unless the active increment is explicitly changed first.
- If a request is ambiguous, confirm or document the active increment boundary before coding.

## Commit Discipline

- Use semantic commit messages for all commits created by Codex.
- Follow the Conventional Commits shape: `<type>: <imperative summary>`.
- Prefer common types such as `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, and `build`.
- Example: `feat: add increment 0 bagging shell`.

## Validation Pattern

After completing an increment or meaningful planning change, follow [docs/wiki/validation-pattern.md](docs/wiki/validation-pattern.md):

1. Update the relevant docs.
2. Run a focused subagent review.
3. Address every relevant finding.
4. Re-run review if changes materially alter the plan or implementation.
5. Document intentionally deferred items as open questions or future work.

## Local Browser Validation

- The user has explicitly pre-approved Playwright for local app testing and
  manual-validation flows in this repository. Use Playwright without asking the
  user again when validating `localhost` app behavior, uploading local example
  manuals, comparing against local expected CSVs, or capturing local debug
  screenshots.
- For local validation scripts, use `http://localhost:<port>` instead of
  `http://127.0.0.1:<port>`. The validation scripts normalize that loopback host
  to `localhost` so local browser checks stay on the path that avoids unnecessary
  elevated-permission requests.
- If Playwright's cached Chrome for Testing is blocked by macOS sandboxing, first
  retry the same localhost validation with
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
  so the signed local Chrome binary is used without escalation.
- If the command sandbox blocks Chromium launch on macOS, request the required
  tool escalation directly with a narrow Playwright/local-validation
  justification instead of asking a separate chat question first.
