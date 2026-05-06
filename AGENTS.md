# AGENTS.md

This repo is a PDF-first PWA for turning LEGO MOC manuals into build-step
parts bags.

Keep this file small. Load only the guidance needed for the task:

- Product workflow and milestones:
  [docs/manual-to-bags-workflow.md](docs/manual-to-bags-workflow.md)
- Local-only PDF/privacy rules:
  [docs/agent-guidance/local-only-pdf.md](docs/agent-guidance/local-only-pdf.md)
- Stack and implementation defaults:
  [docs/agent-guidance/stack.md](docs/agent-guidance/stack.md)
- Extraction, Rebrickable, and validation:
  [docs/agent-guidance/extraction-validation.md](docs/agent-guidance/extraction-validation.md)
- Testing expectations:
  [docs/agent-guidance/testing.md](docs/agent-guidance/testing.md)
- Repository conventions:
  [docs/agent-guidance/repo-conventions.md](docs/agent-guidance/repo-conventions.md)
- Agent skill augmentation:
  [docs/agent-guidance/skill-augmentation.md](docs/agent-guidance/skill-augmentation.md)

Non-negotiables:

- The manual PDF is the primary source of truth.
- Rebrickable CSV is optional validation input only.
- Manual PDFs, rendered pages, and manual image crops must never be uploaded or
  persisted.
- Bag allocation preserves build order and targets 40 to 60 pieces per bag.

Local operations:

- Agents may start, stop, and kill local development/production servers and
  Playwright sessions without asking first.
