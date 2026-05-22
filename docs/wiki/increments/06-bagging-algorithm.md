# Increment 6: Bagging Algorithm

## Goal

Group contiguous build steps into physical bags using set-size-aware part-count
targets.

## User Value

The builder can recreate a LEGO-like staged building experience while still using the original manual.

## Deliverables

- Bag generation from step sequence
- Contiguous step range grouping
- Set-size-aware target part range per bag
- No splitting of a single step across bags
- Oversized step handling
- Bag summaries:
  - bag number
  - step range
  - total parts
  - confidence status
- Unassigned or uncertain parts handling
- Runtime readiness gate before marking bag output ready
- Separate readiness status for each bag and for the full manual export

## Acceptance Criteria

- Bag ranges map directly to original manual steps.
- Most bags stay within the configured set-size-aware target range.
- Steps are not split across bags.
- The output can drive the bag prep checklist.
- Bag assignments are marked ready only when the runtime gate in [../quality-gates.md](../quality-gates.md) passes.
- If the runtime gate fails, the app explains why reliable bagging is not ready instead of presenting uncertain bags as usable.
- Full-manual exports and labels are enabled only when every generated bag is ready.

## Technical Notes

- The algorithm should be deterministic for the same input.
- Large steps may exceed the target and should be marked clearly.
- Keep algorithm parameters configurable for later tuning.
- Initial heuristic targets should use the bill-of-materials total quantity
  when available, then fall back to detected step-callout quantity. Small sets
  should bias toward smaller physical prep bags; larger sets may use larger
  targets, while still keeping every bag as a contiguous step range.
- No generated bag should hide unresolved parts that affect its required quantity.
- Bags with unresolved required quantities are marked needs attention rather than ready.

## Open Questions

- Should the target range be user-configurable?
- How should uncertain per-step parts be allocated?
- Should the algorithm optimize for part count, step count, or both?
