# Increment 10: Recognition Tuning System

## Goal

Expand the feedback loop for improving OCR, part recognition, and step recognition beyond the MVP fixture baseline.

## User Value

Recognition quality improves over time without regressions on manuals that already work.

## Deliverables

- Golden manual test set
- Expected BOM fixtures
- Expected step fixtures
- Expected per-step part fixtures
- Internal annotation workflow
- Recognition metrics
- Regression tests for extraction changes
- Debug views for raw OCR, candidates, confidence, and reconciliation
- Release gates for recognition changes

## Acceptance Criteria

- Recognition changes can be measured against known manuals.
- Quality improvements and regressions are visible.
- Debug artifacts help explain why a part or step was recognized incorrectly.
- The fixture set extends the MVP baseline in [../quality-gates.md](../quality-gates.md) instead of being the first time recognition is measured.

## Technical Notes

- Keep fixtures small enough for routine tests and broad enough for realistic coverage.
- Separate user-facing bag prep from internal recognition debug tools.
- Track metrics by stage: BOM extraction, normalization, step detection, per-step usage, bag reconciliation.

## Open Questions

- Which manuals are allowed to become fixtures?
- How should expected outputs be authored and reviewed?
- Which metrics should block release?
