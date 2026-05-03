# Repository Conventions

Use semantic commit messages:

```text
type: short imperative summary
```

Examples:

- `docs: describe manual processing workflow`
- `feat: add local PDF intake`
- `test: cover bag allocation validation`

Prefer common types such as `feat`, `fix`, `docs`, `test`, `refactor`,
`chore`, and `ci`.

## Branch Freshness

Before creating a feature branch or opening a PR, fetch the remote default
branch and base the work on the current `origin/main`.

Do not rely on a local `main` checkout being current. The expected starting
point is:

```bash
git fetch origin main
git switch -c codex/<description> origin/main
```

For an existing PR branch, verify that GitHub does not report the branch as
behind the base branch before pushing or opening the PR. If it is behind, rebase
onto `origin/main` and rerun the relevant checks.

## Pull Request Review Flow

Open Codex-authored PRs as drafts by default. Keep them draft until required CI
is green.

After CI is green, mark the PR ready for review so Copilot review can start.
Address Copilot feedback through the full review cycle. Notify the user only
after CI is green and there is no remaining Copilot feedback to address.

Use semantic PR titles too. This repository squash merges pull requests, so the
PR title should be ready to become the final merge commit message.

PR titles must use the same format as commit messages:

```text
type: short imperative summary
```

Do not add agent/tool prefixes such as `[codex]`, author tags, or branch names
to PR titles.

## Implementation Review Loop

After finishing an implementation, run a review subagent against the local diff
before the final response. Address substantial feedback, then repeat the
review-and-fix loop until the review returns no substantial findings.

Treat correctness issues, regressions, missing verification, security/privacy
risks, and maintainability problems as substantial. Treat typo-only, style-only,
or preference-only comments as non-substantial unless they point to a real repo
convention violation.
