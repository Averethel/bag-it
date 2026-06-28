---
name: nextjs
description: >
  Use for Bag It work involving Next.js App Router, route files, metadata,
  async APIs, React Server Component boundaries, client boundaries, bundling,
  fonts, images, deployment, or Vercel-oriented Next.js setup.
---

# Bag It Next.js Guidance

Use Next.js 16 App Router conventions. Keep route shell, metadata, and global
layout in `src/app`. Do not mark `layout.tsx` as a client component.

## Boundaries

- Keep PDF rendering, canvas work, file inputs, upload/session state, checklist
  interaction, and browser APIs behind explicit `"use client"` boundaries.
- Keep static metadata, server-safe configuration, and route composition in
  server components where possible.
- Pass only serializable props from server components to client components.
- Avoid server routes for private manual bytes during the MVP unless the wiki
  defines a new server-boundary decision first.

## App Router Rules

- Use `src/app/layout.tsx` for the Chakra provider wrapper.
- Use `src/app/page.tsx` for the first workbench route.
- Add loading/error/not-found route files only when the route needs real user
  states, not as boilerplate.
- Keep async request APIs (`params`, `searchParams`, cookies, headers) awaited
  if a future route uses them.

## Performance Bias

- Keep the first shell light. Dynamically load future PDF and detector-heavy code
  only when a user starts analysis.
- Avoid broad barrel imports for large browser-only modules.
- Keep long-list rendering inside client components with memoized derivations
  and `content-visibility` when the Bags checklist arrives.

## Validation

Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`
after route or boundary changes. Use Webwright validation for upload, Build
steps, Bags, and session behavior.
