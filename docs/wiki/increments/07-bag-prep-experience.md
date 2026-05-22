# Increment 7: Bag Prep Experience

## Goal

Make the generated bag assignments practical for physically sorting parts.

## User Value

The user can prepare bags for themselves or as a gift without turning the app into a spreadsheet cleanup task.

## Deliverables

- Bag list view
- Per-bag checklist
- Part thumbnails
- Color and quantity display
- Grouping by part or color
- Printable bag prep sheets
- Exportable CSV
- Optional bag labels
- Compact unresolved or uncertain parts section
- Not-ready state for manuals that fail the bagging readiness gate

## Acceptance Criteria

- A user can prepare physical bags from the UI or export.
- Each bag clearly lists the manual step range it supports.
- Uncertain items are visible without dominating the workflow.
- If bagging is not ready, user-facing bag prep exports and labels are withheld.
- The experience does not ask the user to correct many rows to make progress.

## Technical Notes

- The UI should prioritize scanability.
- Use Rebrickable-normalized names and thumbnails where possible.
- Avoid making the user inspect raw OCR unless they choose to debug.
- This increment depends on the runtime readiness gate from Increment 6 for usable bag output.

## Open Questions

- What is the best default sort order inside a bag?
- Should printable output include thumbnails?
- What label format should be supported first?
