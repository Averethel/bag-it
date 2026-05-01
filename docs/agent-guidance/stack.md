# Stack

Use the project stack:

- Next.js with modern React.
- Chakra UI v3.
- Strict TypeScript.
- ESLint for code quality and formatting rules.
- Vitest for unit tests.
- Playwright for browser and integration tests.
- PWA support for installability and offline access to the app shell.

Prefer browser-native APIs and client-side processing where possible. Any
library choice must preserve the local-only PDF rules.

Use npm scripts as the canonical development workflow. Chakra UI's current
Next.js App Router guidance recommends running Next with Webpack to avoid
Emotion hydration issues, so keep `next dev --webpack` and
`next build --webpack` unless that upstream guidance changes.

Playwright E2E tests should run against the production server path. The
`test:e2e` script builds first, then Playwright starts `next start` through its
`webServer` config. Avoid using `next dev` for E2E because file watchers can be
fragile in constrained agent environments.

Keep the `package.json` PostCSS override until Next.js depends on a patched
PostCSS release directly. It exists to keep `npm audit` clean while staying on
the current Next.js release.
