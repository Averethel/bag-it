# Bag It

Progressive web app for turning LEGO MOC instruction manuals into build-step
parts bags.

## Development

```sh
npm install
npm run dev
```

Part thumbnails use cached Rebrickable element images first. When that misses,
the server renders an LDraw fallback by fetching only the needed official LDraw
`.dat` files on demand. Set `BLOB_READ_WRITE_TOKEN` to persist rendered fallback
SVGs in Vercel Blob. Without Blob, rendered fallbacks are cached only for the
current server instance.

Production builds require a fresh generated Rebrickable catalog cache. If the
public Rebrickable bulk catalog CSVs cannot be downloaded and indexed,
`npm run build` fails instead of deploying degraded catalog matching.

`npm run ldraw:build` is optional for local offline fallback work. It downloads
the official LDraw `complete.zip` library into the OS temp directory. Set
`BAG_IT_LDRAW_CACHE_DIR` to override the cache location, or `LDRAW_LIBRARY_PATH`
to point the runtime at an existing extracted library. When `LDRAW_LIBRARY_PATH`
is set, `npm run ldraw:build` validates that library but does not modify it.

## Workflows

```sh
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run ldraw:build
npm run test:e2e
npm run verify
```

## CI/CD

Renovate is configured in `renovate.json` for npm dependencies, CI runtime
images, the pinned Vercel CLI version used by CircleCI, and weekly lockfile
maintenance.

CircleCI installs dependencies once, persists the checkout and `node_modules` to
the workflow workspace, then runs linting, type checking, unit tests, the
production build, and Playwright E2E as separate workflow jobs. Preview branches
deploy to Vercel Preview first, then E2E runs against that deployment URL. `main`
deploys to Vercel Production and then runs the same E2E suite against the
production deployment.

Set these environment variables in the CircleCI project or context:

```sh
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
VERCEL_AUTOMATION_BYPASS_SECRET
```

`VERCEL_AUTOMATION_BYPASS_SECRET` should match a Vercel Protection Bypass for
Automation secret so Playwright can test protected deployments.

The Vercel project config disables Git-triggered deployments so CircleCI owns
deployment ordering.
