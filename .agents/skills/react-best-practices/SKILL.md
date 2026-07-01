---
name: react-best-practices
description: >
  Use for Bag It React component work, state modeling, memoization, effects,
  client/server serialization, bundle-size control, rendering performance,
  upload/session interactions, long lists, or avoiding data waterfalls.
---

# Bag It React Best Practices

Optimize for clear state ownership, small client boundaries, stable rendering,
and fast feedback.

## State

- Keep top-level shell state in `BaggingApp` until a feature boundary justifies
  extracting it.
- Derive visible booleans during render instead of syncing derived state through
  effects.
- Use functional state updates for event handlers that depend on previous state.
- Keep transient browser resources such as selected `File`, object URLs, abort
  controllers, and future PDF job objects explicitly owned and purged.

## Rendering

- Memoize expensive bag/checklist derivations when those features arrive.
- Do not define child components inside render functions.
- Keep props primitive or stable where memoization matters.
- Use deferred mounting and `content-visibility` for large checklist sections.

## Effects

- Put interaction work in event handlers. Use effects for subscriptions,
  cleanup, and browser integration only.
- Clean up object URLs, timers, abort controllers, and event listeners.
- Avoid waterfalls by starting independent async work together when future PDF
  and detector code runs.

## Bundles

- Keep PDF parsing/rendering and detector-heavy code out of the initial bundle
  until analysis starts.
- Avoid broad imports from large libraries when direct imports exist.

## Validation

Cover state transitions with Vitest and React Testing Library. Use Webwright for
real browser upload/session/workbench flows.
