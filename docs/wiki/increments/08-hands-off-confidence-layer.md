# Increment 8: Hands-Off Confidence Layer

## Goal

Harden the MVP confidence gate by adding stronger automatic retries, scoring, and consistency checks.

## User Value

More manuals complete without asking the user to clean up many rows manually.

## Deliverables

- Confidence model across extraction stages
- Automatic retry for low-confidence OCR or recognition
- Alternate image preprocessing strategies
- BOM vs step usage reconciliation
- Color and quantity validation
- Duplicate and alias checks
- Compact attention summary
- Calibration of readiness thresholds against additional manuals

## Acceptance Criteria

- Common manuals complete with minimal user intervention.
- The user is only asked about ambiguity that materially affects bag correctness.
- Mismatches are explained in terms of parts, quantities, steps, and bags.
- Changes improve or preserve the MVP fixture thresholds in [../quality-gates.md](../quality-gates.md).

## Technical Notes

- Keep confidence local to each extraction stage and aggregate it for product decisions.
- Distinguish low confidence from hard conflicts.
- Store retry attempts and outcomes for later tuning.
- The MVP already has a minimal readiness gate; this increment improves coverage and reliability.

## Open Questions

- What confidence threshold should allow automatic bag generation?
- Which ambiguity types need user input?
- How should unresolved parts affect exports?
