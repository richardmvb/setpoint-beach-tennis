# ADR 0001: UI components in `src/app/ui/` with a `/_ui` gallery, not a library

- Status: Accepted
- Date: 2026-11-11

## Context

The app needs a shared design system (tokens, buttons, cards, dialogs). A separate `projects/ui` library needs its own ng-packagr build, publishing setup and versioning. There is one consumer, and the app ships as a single GitHub Pages bundle.

Storybook was considered for living docs. Its official Angular builder (`@storybook/angular` 10.6) still uses webpack and `zone.js` peers, while this app uses `@angular/build` and will drop `zone.js` (Phase 2 and 4). Stories can run as Vitest tests only through the community `@analogjs/storybook-angular`.

## Decision

- UI components live in `src/app/ui/` with a path alias and an ESLint boundary (nothing outside `ui/` is imported by `ui/` except `shared/`).
- Documentation and visual tests use a dev-only `/_ui` route, excluded from production builds. It shows each component in every variant and theme, covered by Playwright screenshot and axe tests.
- Storybook is adopted only if a one-hour spike at the start of Phase 5 shows that stories run as Vitest tests with the app's builder and without forcing `zone.js` back in.

## Consequences

- No separate build or publishing step for the UI; changes ship with the app.
- One test stack (Playwright) covers visual regression and accessibility.
- If a second consumer appears, `ui/` can be promoted to a library; the boundary rule makes that move mechanical.
