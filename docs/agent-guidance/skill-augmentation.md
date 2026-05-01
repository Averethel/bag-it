# Skill Augmentation

Use skills when the task enters a domain where specialized workflow guidance
would materially improve correctness, speed, or maintainability.

## When To Search

Search for new skills when work moves into a new territory, for example:

- advanced Next.js patterns, upgrades, caching, deployment, or performance;
- Chakra UI theming, component architecture, migration, or UI refactors;
- Playwright testing beyond simple smoke tests;
- PDF parsing, rendering, extraction, or visual validation;
- accessibility, security, deployment, document/spreadsheet/presentation, or API
  integration work not already covered by installed skills.

Use:

```sh
npx skills find <query>
```

For OpenAI/Codex-curated skills, use the installed `skill-installer` workflow.

## Selection Rules

- Prefer official or vendor-maintained skills first.
- Prefer narrow, task-relevant skills over broad marketplace bundles.
- Avoid installing overlapping skills unless they add distinct workflow value.
- Keep `AGENTS.md` small; document skill choices here or in focused guidance
  files.
- After installing a skill, tell the user that Codex must be restarted before
  the skill is auto-discovered.

## Currently Installed Useful Skills

Installed in `~/.codex/skills` for this project context:

- `next-best-practices`
- `next-cache-components`
- `vercel-react-best-practices`
- `vercel-composition-patterns`
- `web-design-guidelines`
- `chakra-ui-builder`
- `chakra-ui-refactor`
- `playwright-best-practices`
- `pdf`

Skipped for now:

- `chakra-ui-migrate`: only needed for v2 to v3 migration work.
- `next-upgrade`: only needed for framework upgrades.
- Vercel deploy/CLI skills: only needed when deployment work starts.
- Generic PWA, TypeScript, and accessibility skills: current installed skills
  cover the immediate needs well enough.
