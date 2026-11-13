# ADR 0004: Transloco setup (pt-BR first, key naming, scoped files)

- Status: Accepted
- Date: 2026-11-13

## Context

ADR 0002 chose Transloco. Phase 4 extracts features out of `AppComponent`, and the plan says extracted code must be written with translation keys from the start so it is touched once. That needs the setup details fixed first. The app is pt-BR only today. English arrives in Phase 6.

## Decision

- Library: `@jsverse/transloco`, with `pt-BR` as both `defaultLang` and `fallbackLang`. `availableLangs` is `['pt-BR']` until Phase 6.
- Files: one JSON file per scope and language, loaded at runtime from `public/i18n/<scope>/<lang>.json` (for example `public/i18n/live/pt-BR.json`). A shared `common` scope holds words used by more than one feature. Each feature lazy route provides its own scope with `provideTranslocoScope`, so a feature's strings load with the feature.
- Key naming: `<scope>.<area>.<element>` in lowerCamelCase segments, for example `live.header.title`, `common.actions.save`. Keys describe the role of the text, never the text itself. No sentence is built by joining keys; use one key with `{{ param }}` placeholders. Plurals use one key per form (`.one`, `.other`).
- Templates use the `transloco` structural directive or pipe. Raw user-facing text in a template is a CI failure once the raw-text check exists (Phase 6). Until then, extracted features must have none.
- Language preference is stored through `core/storage` (not `localStorage` directly). Dates and numbers use `Intl` with the active locale.
- Tooling: `transloco-keys-manager` finds missing and unused keys. The raw-text template check stays a small custom script (plan, Phase 6).

## Consequences

- Phase 4 extractions create their scope file with pt-BR text as part of the same PR. Text that stays in `AppComponent` is migrated when its feature is extracted.
- Adding `en` in Phase 6 is a new file per scope, with no component changes.
- A runtime fetch per scope adds a request. Measured in Phase 7 against the bundle and LCP budgets; scope files are small and cacheable.

## Update 2026-11-13: setup in place

`@jsverse/transloco` 8 is set up by `provideI18n()` (`src/app/core/i18n/`), bound in `app.config.ts`. Three details the decision above left open:

- **Root file for the app shell.** Transloco always loads the root file of the active language before any scope, so `public/i18n/pt-BR.json` exists and holds the strings of the shell that stays in `AppComponent` (keys under `shell.`, for example `shell.footer.feedback`). Features keep their own scopes; `common` is created when a second feature needs the same word.
- **Loader.** `HttpTranslationLoader` fetches `i18n/<path>.json` with a relative URL, so it follows the base href on GitHub Pages, and adds `?v=<buildId>` so a deploy never pairs new code with a file cached from the previous release. It uses Angular's `HttpClient` (`provideHttpClient(withFetch())`).
- **Checks.** `npm run i18n:check` (`transloco-keys-manager find`) fails on a key used in `src/app` that is missing from the pt-BR files, and on a key in the files that nothing uses. It runs in CI and in `npm run check`. It also scans spec files, so a spec uses real keys. Specs get the real pt-BR files through `translocoTesting()` (`src/app/testing/transloco-testing.ts`).
