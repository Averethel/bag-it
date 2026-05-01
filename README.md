# Bag It

Progressive web app for turning LEGO MOC instruction manuals into build-step
parts bags.

## Development

```sh
npm install
npm run dev
```

## Workflows

```sh
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run test:e2e
npm run verify
```

## CI/CD

Renovate is configured in `renovate.json` for npm dependencies, CI runtime
images, the pinned Vercel CLI version used by CircleCI, and weekly lockfile
maintenance.

CircleCI runs linting, type checking, unit tests, the production build, and
Playwright E2E as separate workflow jobs. Preview branches deploy to Vercel
Preview first, then E2E runs against that deployment URL. `main` deploys to
Vercel Production and then runs the same E2E suite against the production
deployment.

Set these environment variables in the CircleCI project or context:

```sh
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

The Vercel project config disables Git-triggered deployments so CircleCI owns
deployment ordering.
