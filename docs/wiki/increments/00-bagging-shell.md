# Increment 0: Bagging Shell

## Goal

Create a clickable bagging flow using mock data so the core experience can be evaluated before recognition work begins.

## User Value

The user can understand what Bag It will produce: normalized parts, step ranges, and physical bag assignments for the original manual.

## Deliverables

- PDF upload entry point
- Processing status screen using fake states
- Normalized parts list with fake Rebrickable-style thumbnails
- Step range summary
- Bag assignment summary
- Per-bag parts checklist

## Acceptance Criteria

- The full flow can be demoed without real OCR.
- The product does not imply that manuals are edited or replaced.
- Bag output clearly maps bags to original manual step ranges.

## Implementation Notes

- The current shell is a Next.js App Router page with Chakra UI.
- Bagging assembly lives at the page level; reusable components render the overview, manual CTA, status, tabs, inventory rows, and bag accordions.
- Mock data lives outside the presentation components so later increments can replace the data source without rewriting the bagging UI.
- Review follow-up keeps demo copy in the page/mock data, uses stable bag ids for checklist tracking, defines bagging colors as Chakra semantic tokens, and tests fake analysis timing without real waits.
- Chakra strict token typing is enabled; shell-specific colors, swatches, dimensions, and spacing tokens live in the Chakra theme and are regenerated with `npm run typegen`.
- The PDF entry point is demo-only and does not upload or store files.
- There is no bundled demo-manual shortcut in the shell; a manual must be selected before the CTA can run.
- Selecting a manual only stages it; the `Bag it!` CTA starts the fake demo run.
- Processing status auto-advances through fake states after the CTA is triggered.
- Output is split into `Part list` and `Bags` tabs so longer parts lists do not compete with bag summaries.
- Mock part rows use Rebrickable image URLs and inventory-style checkbox rows for tracking.
- Bag output is grouped into expandable bag lists with checkbox rows for packing progress.
- Fake output rows stay hidden until the demo analysis reaches its completed state.
- Vitest and Testing Library tests cover the assembled bagging page plus one focused suite per reusable component for overview, page frame, manual selection, status, tabs, pending output, inventory rows, part list, bag accordions, and checklist interactions.
- Normalized parts, step ranges, bag assignments, and bag checklists use fake data.
- Real upload, validation, private PDF intake, metadata extraction, page rendering, OCR, and recognition belong to later increments.

## Open Questions

- What should the first empty state say?
- Should fake data include uncertainty examples from the beginning?
- What exports are needed first: CSV, printable page, or both?
