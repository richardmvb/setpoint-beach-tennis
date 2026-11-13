# ADR 0007: No service worker for now

- Status: Accepted
- Date: 2026-11-13

## Context

A service worker (`@angular/service-worker`, PWA caching) would allow an offline first load and faster repeat visits. The app is hosted on GitHub Pages (ADR 0006), where we cannot set cache headers or control how an update is rolled out. The app already resets a finished tournament when the build changes, and it has an offline sync queue (`src/app/core/offline-sync-queue.ts`) for a lost connection during a tournament. A reload brings the app back on a working connection.

## Decision

Do not add a service worker or PWA caching for now.

## Consequences

- A service worker on GitHub Pages risks users stuck on a stale cached app after a release, which would also confuse the reset on build change. Avoiding it keeps releases predictable.
- A lost connection during a tournament is covered by the offline sync queue, and the app can simply be reloaded.
- There is no offline first load. Repeat loads rely on the browser HTTP cache (hashed file names).
- Revisit when hosting changes (ADR 0006) or if an offline first load becomes a requirement.
