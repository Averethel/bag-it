# Bag It

Bag It helps builders prepare fan-made LEGO MOC manuals into LEGO-like building bags.

The app does not alter, rewrite, or re-render the source manual. The manual remains the source of truth. Bag It analyzes the manual, normalizes detected parts against Rebrickable, recognizes step-level part usage, and produces companion bagging guidance so builders can prepare physical parts in roughly 40-60 piece stages.

## Current Repository Status

This repository is implementing [Increment 0: Bagging shell](docs/wiki/increments/00-bagging-shell.md).
The current app is a clickable shell with fake data only. It does not upload,
store, parse, render, or process PDFs yet.

Start here:

- [Wiki index](docs/wiki/README.md)
- [Product principles](docs/wiki/product-principles.md)
- [High-level plan](docs/wiki/high-level-plan.md)
- [Codex guidance](docs/wiki/codex-guidance.md)

## Planned Stack

- Next.js
- React
- Chakra UI
- Rebrickable catalogue integration
- Background processing for PDF analysis, OCR, recognition, and bag generation

## Local Development

Install dependencies and run the app:

```bash
npm install
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Main User Flow

1. User uploads a MOC PDF manual.
2. Bag It extracts and normalizes the parts list.
3. Bag It recognizes build steps and parts used per step.
4. Bag It groups contiguous steps into bags of roughly 40-60 parts.
5. User prepares physical bags and builds from the original manual.

## Non-Goals For The MVP

- No user-facing PDF reader.
- No manual rewriting.
- No re-rendered build instructions.
- No row-by-row spreadsheet cleanup experience.
