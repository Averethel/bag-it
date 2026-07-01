---
name: chakra-ui
description: >
  Use for Bag It UI work involving Chakra UI v3 setup, Provider wiring, theme
  tokens, semantic tokens, snippets, accessible layout primitives, controls,
  tabs, accordions, tooltips, badges, progress, or responsive workbench UI.
---

# Bag It Chakra UI Guidance

Use Chakra UI v3 patterns: `defineConfig`, `createSystem`, semantic tokens, and
`colorPalette`. Do not use Chakra v2 APIs such as `extendTheme` or
`colorScheme`.

## Theme

- Keep custom tokens in `src/components/ui/theme.ts`.
- Use a dedicated `bagging.*` semantic token namespace for product-specific
  surfaces, actions, warnings, progress, and preview backgrounds.
- Prefer semantic tokens such as `bagging.surface`, `bagging.border`, and
  `bagging.action` in app components.
- Keep cards and panels at small radii, normally `md` or below.

## Layout

- Use Chakra primitives directly: `Stack`, `HStack`, `Flex`, `Grid`,
  `Container`, `Tabs`, `Progress`, `Badge`, `Button`, and `IconButton`.
- Use a constrained `7xl` workbench, left sidebar, right output area, and mobile
  stacking.
- Avoid nested cards. Use panels for major areas and cards only for repeated
  items or framed controls.

## Accessibility

- File inputs need labels and visible selected filename state.
- Buttons need disabled states that match behavior.
- Icon-only controls need accessible labels and tooltips when the meaning is not
  obvious.
- Tabs must stay present before data exists and render pending panels.

## Validation

Run `npm run typegen` after token or recipe changes. Run component tests and
Webwright checks for UI, upload, Build steps, Bags, or session changes.
