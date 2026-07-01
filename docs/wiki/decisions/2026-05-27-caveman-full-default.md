# Caveman Full Default

## Status

Accepted on 2026-05-27.

## Decision

All Bag It project work uses caveman `full` communication by default.

The always-on rule lives in root `AGENTS.md`, which is loaded as canonical
project context. The repo-local skill remains installed at
`../../.agents/skills/caveman/SKILL.md` for explicit invocations and reference.

## Rationale

`lite` stayed more verbose than needed for project work. `full` keeps concrete
file paths, commands, decisions, risks, and validation results, while allowing
compact fragments when meaning stays clear.

## Boundaries

- Use `full` for ordinary project discussion, status updates, reviews, and
  final answers.
- Use clearer normal prose for irreversible-action warnings, security warnings,
  or multi-step instructions where compression risks ambiguity.
- Resume `full` after the clear section.
- Stop only when the user says `stop caveman` or `normal mode`.
