---
name: sub-agent-feedback-loop
description: >
  Use when the user explicitly asks to use sub-agents, delegate to AI worker or explorer agents, run a sub-agent feedback loop, get independent agent review, parallelize agent work, forward-test a skill with sub-agents, or have worker/explorer agents validate code, plans, tests, or implementation slices before finalizing.
---

# Sub-Agent Feedback Loop

Use sub-agents to create fast independent feedback without losing ownership of the main task.

## Guardrails

- Spawn sub-agents only when the user explicitly asks for sub-agents, delegation, parallel agent work, independent agent review, or forward-testing.
- If no sub-agent or separate-thread mechanism is available, say so and continue locally. Do not imply an independent review happened.
- Keep the main agent on the critical path. Do the immediate blocking work locally.
- Delegate only concrete, bounded sidecar work that can run in parallel or provide independent feedback.
- Do not ask multiple agents the same vague question. Split by concern, file ownership, or risk.
- Do not leak the intended answer, suspected bug, or preferred fix when asking for independent validation.
- Tell worker agents they are not alone in the codebase, must preserve unrelated changes, and must not revert others' edits.
- Tell worker agents not to run git mutations, destructive commands, dependency installs, broad formatting, escalation requests, commits, or pushes unless that is explicitly assigned.
- Close sub-agents after their output is consumed: stop follow-ups, mark/archive them complete when the platform supports it, and do not leave pending decisions in worker threads.

## Loop

1. State the local plan and identify what remains local.
2. Run the delegation gate. Spawn only when there is a bounded, independent task with clear value. If not, keep the work local and say why.
3. Choose one or more delegate tasks. Map these conceptual roles to whatever sub-agent or thread types exist; if roles are unavailable, encode the role in the prompt:
   - `explorer`: read-only codebase questions, architecture checks, risk scans.
   - `worker`: bounded edits with explicit file ownership and non-overlapping write scope.
   - `default`: general independent review when no specialized role fits.
4. Write the prompt with:
   - exact objective
   - allowed files or read-only scope
   - expected output shape
   - what not to touch
   - validation command, if relevant
5. Continue local non-overlapping work while agents run.
6. Wait only when their result blocks the next local step.
7. Triage feedback:
   - accept and implement concrete findings
   - reject with a short reason when feedback is wrong, stale, or out of scope
   - ask one focused follow-up only when a result is useful but ambiguous
8. Review worker changes before accepting them:
   - inspect diffs
   - check scope compliance
   - resolve conflicts locally
   - run final validation in the main agent
9. Final response reports:
   - what sub-agents checked
   - which feedback was accepted
   - which feedback was rejected or deferred
   - validation run by main agent

## Prompt Patterns

Read-only review:

```text
Review the current implementation for <risk>. Read only <paths>. Do not edit files.
Inspect independently; do not assume any suspected issue is real. Report no findings if none are found.
Return findings with file paths, line references, severity, and a short fix suggestion.
Focus on actionable issues only.
```

Worker slice:

```text
Implement <bounded task>. You own only <paths>.
You are not alone in the codebase; do not revert unrelated changes, and adapt to nearby edits.
Do not run git mutations, destructive commands, dependency installs, broad formatting, escalation requests, commits, or pushes unless explicitly assigned.
Run <focused validation> if practical.
Final answer: changed files, validation, and any blockers.
```

Forward-test a skill:

```text
Use the skill at <path-to-skill> to perform this task: <realistic user request>.
Treat the skill as your only special workflow guidance.
Inspect independently; do not assume any suspected issue is real. Report no findings if none are found.
Return what you did, where the skill was clear, and where it failed or left ambiguity.
```

## Feedback Quality Bar

- Prefer one strong independent review over several shallow reviewers.
- Prefer concrete artifact review over opinions about process.
- Treat sub-agent output as evidence, not authority.
- Reproduce or inspect important findings before changing final code.
- Keep feedback loops short: one pass by default, second pass only for material unresolved risk.
