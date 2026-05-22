# Bag It Wiki

This wiki captures the product plan for Bag It. It is intentionally split into small pages so the plan can be changed incrementally as the product direction sharpens.

## Core Pages

- [Active increment](active-increment.md)
- [Product principles](product-principles.md)
- [High-level plan](high-level-plan.md)
- [Quality gates](quality-gates.md)
- [Validation pattern](validation-pattern.md)
- [Codex guidance](codex-guidance.md)
- [Production catalogue contract](catalogue-production.md)

## Deliverable Increments

- [Increment 0: Bagging shell](increments/00-bagging-shell.md)
- [Increment 1: Upload and processing](increments/01-upload-and-processing.md)
- [Increment 2: Parts list extraction](increments/02-parts-list-extraction.md)
- [Increment 3: Rebrickable normalization](increments/03-rebrickable-normalization.md)
- [Increment 4: Step recognition](increments/04-step-recognition.md)
- [Increment 5: Per-step parts recognition](increments/05-per-step-parts-recognition.md)
- [Increment 6: Bagging algorithm](increments/06-bagging-algorithm.md)
- [Increment 7: Bag prep experience](increments/07-bag-prep-experience.md)
- [Increment 8: Hands-off confidence layer](increments/08-hands-off-confidence-layer.md)
- [Increment 9: Performance hardening](increments/09-performance-architecture.md)
- [Increment 10: Recognition tuning system](increments/10-recognition-tuning-system.md)

## How To Update This Plan

When product direction changes:

1. Branch from `main` for increment or feature-sized work unless the user
   explicitly chooses a different base.
2. Update [Active increment](active-increment.md) before implementation work starts.
3. Update [Product principles](product-principles.md) if the product boundary changes.
4. Update [High-level plan](high-level-plan.md) if sequencing or scope changes.
5. Update [Quality gates](quality-gates.md) if readiness, confidence, privacy, or performance criteria change.
6. Update the relevant increment page with new deliverables, acceptance criteria, and open questions.
7. Run the [validation pattern](validation-pattern.md) before considering the change complete.
8. Keep implementation details out of the high-level plan unless they affect sequencing.
