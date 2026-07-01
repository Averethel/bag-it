# Bag It

Fresh rebuild of Bag It: companion bagging guidance for uploaded MOC manuals.
The original manual stays the source of truth.

Canonical project context lives in [docs/wiki](docs/wiki/README.md) and
[AGENTS.md](AGENTS.md).

## Development

```bash
pnpm install
pnpm run dev
pnpm run verify
```

The fresh MVP excludes BOM discovery, parts-list OCR, Rebrickable catalogue
matching, user-facing PDF viewer behavior, and replacement build instructions.
