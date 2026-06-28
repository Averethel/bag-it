# Caveman Lite Always On

## Status

Superseded on 2026-05-27 by
[Caveman full default](2026-05-27-caveman-full-default.md).

## Decision

This superseded decision originally set caveman `lite` as the project default.
The current default is `full`.

The always-on rule lives in root `AGENTS.md`, which is loaded as canonical
project context. The repo-local skill remains installed at
`../../.agents/skills/caveman/SKILL.md` for explicit invocations and reference.

## Rationale

The project already requires concise status and final messages. `lite` removes
filler and repetition while preserving full technical meaning, file paths,
commands, decisions, risks, and validation results.

## Original Boundaries

- Use `lite` for ordinary project discussion, status updates, reviews, and final
  answers.
- Use clearer normal prose for irreversible-action warnings, security warnings,
  or multi-step instructions where compression risks ambiguity.
- Resume `lite` after the clear section.
- Stop only when the user says `stop caveman` or `normal mode`.
