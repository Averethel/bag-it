# Validation Pattern

Use this pattern after finishing each increment or any meaningful planning change.

## Purpose

Validation is a separate pass from implementation. Its job is to catch unclear scope, product drift, missing acceptance criteria, weak assumptions, and inconsistencies before the work is considered done.

## Required Sequence

1. Finish the increment or documentation change.
2. Update the relevant wiki pages.
3. Run local sanity checks that fit the change.
4. Ask a subagent to review the completed work.
5. Address every relevant finding.
6. Repeat review if the feedback changed the substance of the plan or implementation.
7. Record any intentionally deferred items as open questions or future work.

## Local Browser Validation

Run local app validation against `http://localhost:<port>`. Do not use
`http://127.0.0.1:<port>` for manual-validation flows; the validation scripts
normalize that loopback host to `localhost` so browser checks stay on the path
that avoids unnecessary elevated-permission prompts.

If Playwright's cached Chromium binary is blocked by macOS sandboxing, retry the
same localhost validation with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
before requesting elevated permissions.

## Subagent Review Prompt Shape

The review request should be narrow and evidence-based.

Ask the subagent to:

- review the relevant files, not just the summary
- prioritize product risks, unclear requirements, contradictions, and missing acceptance criteria
- cite exact files and lines where possible
- flag inferred implementation scope, especially new caching, persistence,
  storage, cross-session reuse, external-service, or background-worker behavior
  that is not explicitly present in the active increment
- separate actionable findings from optional polish
- avoid proposing implementation work outside the current increment unless it affects the plan

## What Counts As Relevant Feedback

Relevant feedback is anything that affects:

- product correctness
- user value
- increment boundaries
- inferred requirements that were accidentally promoted into implementation
  scope
- privacy, retention, deletion, stale-data, or invalidation behavior
- acceptance criteria
- sequencing
- consistency with the source-of-truth manual constraint
- the hands-off user experience constraint
- performance expectations
- future maintainability of recognition and bagging logic

Optional wording preferences, speculative implementation choices, and broad future ideas should not block validation unless they reveal a real ambiguity.

## Expected Outcome

At the end of validation:

- the reviewed increment has clear deliverables and acceptance criteria
- contradictions have been removed
- deferred questions are documented explicitly
- the final response names what was reviewed and what changed
