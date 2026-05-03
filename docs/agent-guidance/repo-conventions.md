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
