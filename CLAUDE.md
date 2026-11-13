# CLAUDE.md

Guidance for AI agents and developers working in this repository. Keep it short; long-form decisions live in `docs/`.

## What this is

SETPOINT: a beach tennis tournament manager. Angular 20 standalone SPA (pt-BR UI), Supabase (SQL migrations, RPCs, realtime), PostHog analytics, hosted on GitHub Pages. The active work is the professionalization plan in [docs/professionalization-plan.md](docs/professionalization-plan.md); read its Engineering standards and Phase sections before changing structure.

## Commands

```bash
nvm use                 # Node 24, from .nvmrc
npm ci
npm start               # dev server (ng serve)
npm run lint            # ESLint: TypeScript + templates
npm run lint:styles     # Stylelint
npm run format:check    # Prettier (src/**/*.html and src/styles.css are excluded, see below)
npm run typecheck       # tsc over src/**/*.ts
npm run knip            # unused files, exports, dependencies
npm test                # unit tests (Vitest through the Angular unit-test builder, src/**/*.spec.ts)
npm run test:db         # SQL tests on PGlite (node:test, tests/), fast, no Docker
npm run db:start        # local Supabase in Docker (applies every migration from empty)
npm run db:reset        # re-apply all migrations
npm run test:db:supabase # pgTAP security and permission tests on the real local stack
npm run db:lint         # splinter + supabase db lint (fails on any ERROR or unexpected WARN)
npm run db:migrations   # forward-only and vendor-neutral migration rules
npm run db:types        # regenerate src/app/core/adapters/supabase/database.types.ts (never edit it by hand)
npm run test:coverage   # unit tests with V8 coverage
npm run e2e             # Playwright end-to-end tests (set E2E_BROWSER_CHANNEL=chrome to use installed Chrome)
npm run build           # production build (run scripts/generate-runtime-config.cjs first)
npm run check           # lint, styles, format, typecheck, knip, tests, build
```

Local runtime config is `public/runtime-config.js` (tracked, development values). Do not overwrite it. CI and deploy regenerate it with `scripts/generate-runtime-config.cjs`.

## Architecture (current)

- `src/app/app.component.ts` and `.html`: monolith (about 4,000 lines of logic, 1,050 template lines). Being decomposed in Phase 4. Do not add new features here; put new code in the target structure.
- `src/app/core/ports/`: vendor-neutral interfaces written in the app's terms, each with an `InjectionToken` (`AnalyticsPort`, `ErrorReporter`, `SurveyPort`, `AuthPort`, `SharedTournamentRepository`, `LocalLiveRepository`, `TournamentFeed`, `ArchiveRepository`, `DashboardRepository`, and the browser group `KeyValueStore` (`LOCAL_STORE`, `SESSION_STORE`), `Clock`, `Random`, `AppConfig`). Features and AppComponent inject ports only. `ports/testing/` holds in-memory fakes and the contract suites that both the fake and the real adapter pass.
- `src/app/core/adapters/<vendor>/`: the only place that imports `@supabase/*` or `posthog-js`, and `core/adapters/browser/` is the only place that touches `localStorage`, `sessionStorage`, the real time (`Date.now()`, `new Date()`), `Math.random`/`crypto` or `window.__SETPOINT_CONFIG__` (ESLint enforces both; specs are exempt). Inject `LOCAL_STORE`, `SESSION_STORE`, `CLOCK`, `RANDOM` and `APP_CONFIG` instead. The three schedule files keep a `Math.random` default on a documented ESLint exemption until they move into `domain/`. `src/app/app.config.ts` is the composition root that binds ports to adapters; swapping a vendor is a new adapter folder plus one line there. See ADR 0003 and `docs/vendors.md`. Adapter specs use a fake client (`fake-supabase-client.ts`) or an injected SDK; the Angular unit-test builder does not support `vi.mock` on relative imports, so inject what you need to fake.
- `src/app/core/`: domain logic and the remaining services (`storage.service.ts`, `state-machines.ts`, `offline-sync-queue.ts`, `scenario-engine.ts`, ...). Unit tests are colocated `*.spec.ts` files run by Vitest.
- `src/app/features/`: presentational components (flat for now).
- `src/styles/tokens.css`: the design tokens (colors, spacing, radius, elevation, motion; light and dark). Pinned by `e2e/design-tokens.spec.ts`: change a value there in the same commit. `src/styles/components/{button,card,dialog}.css` style the `ui/` components. `src/styles.css` is the remaining global stylesheet (still being split, Phase 5); read colors from tokens, never hard-code a text color (light-theme AA needs `--muted`, `--accent-text`, `--success-text`).
- `src/app/ui/`: the design system (`@ui/*` alias). `uiButton` and `uiCard` render the same `.button` and `.surface-card` classes templates still use; `ConfirmDialog` is opened through `DialogService` (core) on `@angular/cdk/dialog`. `ui/` imports only Angular, the CDK and itself (ESLint enforces it). New features use these instead of copying markup; migrate `class="button …"` and `class="surface-card"` as each feature is extracted.
- `supabase/`: `migrations/` (forward-only), `tests/` (pgTAP), `lint/` (splinter), `config.toml` (Supabase CLI). Security findings and rules: `docs/security.md`.
- `src/app/shared/parsers/`: Valibot parsers for everything that comes from outside (RPC responses today). Do not cast RPC data with `as`; add a parser.
- `src/index.html` holds the Content-Security-Policy. A new external host needs a CSP change and a test; fonts are self-hosted (`src/fonts/`).

Target structure, ports and adapters, and feature folders: Phase 4 and ADR 0003 in `docs/adr/`.

## Engineering rules (enforced)

- Conventional Commits. Enforced by commitlint on commits (husky hook) and on PR titles (CI).
- Never silence a gate: no `eslint-disable`, `@ts-ignore`, `stylelint-disable`, skipped tests, or baselines. Fix the code, or reduce scope and say so.
- Ratchet: rules that legacy code cannot pass are enabled only for the folders that comply (see `eslint.config.mjs`). Widen the glob as code is migrated.
- Persisted data (`setpoint.tournament.v1`, offline queue, shared snapshot) and database changes must stay backward compatible with the previous release.
- Migrations are forward-only. Never edit a migration already on `main`. New functions are private by default (`revoke` is the default privilege); grant `execute` on purpose and add the function to the allowlists in `supabase/tests/security.test.sql`. New SQL uses `app.current_user_id()`, not `auth.uid()`.
- Do not commit or push unless the user asks.
- `docs/metrics.md` is a local-only file. Never `git add` it, never include it in a commit or PR, and do not paste its numbers into committed docs as a substitute.

## Known deferred items (not silenced; tracked in the plan)

| Item                                                                                                                      | Phase                                |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `src/styles.css` excluded from Stylelint and Prettier (structural issues, cascade order)                                  | 5 (split into tokens and components) |
| `src/**/*.html` excluded from Prettier (whitespace-sensitive templates)                                                   | 4 (per-feature templates)            |
| Focus trap and Escape handling for the 6 hand-rolled modals (the confirmation dialogs already use the CDK dialog)         | 4 (one per feature extraction)       |
| Axe baseline: label-content-name-mismatch (1 per page) and unnamed buttons in the profile panel (color-contrast is fixed) | 5 (design system and accessibility)  |
| E2E for saved tournaments, offline sync, dashboard; fixtures for offline queue and shared snapshot                        | Phase 1 follow-ups                   |

## Unit tests (Vitest)

Specs are `src/**/*.spec.ts`, colocated with the code, run by `ng test` (Angular unit-test builder, Vitest, jsdom). Import `describe`, `it` and `expect` from `vitest` (no globals). Import the real modules and build services and components through `TestBed` (`TestBed.inject`, `runInInjectionContext`); never stub `@angular/core`. `src/app/testing/` holds shared test helpers. Property tests use `fast-check` in `*.property.spec.ts` next to the module (schedule shuffle, scenario engine, qualification); failures print a seed, so rerun with `fc.assert(..., { seed, path })` to reproduce. Use `seededRandom` for the code's own random source. The SQL tests in `tests/` stay on `node:test` (`npm run test:db`).

Coverage thresholds live in `angular.json` (`test.options.coverageThresholds`) and measure `src/app/core/` only; CI runs them through `npm run test:coverage`. They are a ratchet: raise them when coverage rises, never lower them. Measured on 2026-11-13 after the UI work: statements 73.31, branches 71.45, functions 82.13, lines 72.96 (the thresholds are the floors, rounded down). New code must be covered.

## End-to-end tests (e2e/)

- Playwright runs the real app. `e2e/support/fixtures.ts` blocks every host except localhost, so tests never reach Supabase, PostHog or Google Fonts, and it starts like a returning user (landing, tour and profile prompt skipped). Use its `test`, never the raw Playwright one.
- Select elements by role and accessible name. The fixture seeds `Math.random`, so the draw is the same on every run; still prefer asserting structure (counts, headings, saved state) over player names. Ties are resolved by `generateFinals`. Use `test.use({ randomSeed: null })` only to test real randomness.
- Accessibility is a ratchet: `e2e/a11y-baseline.json` holds today's axe violations and a page fails when a rule appears or grows. Fix violations, then lower the baseline with `A11Y_RECORD=1`, which never raises a count. Do not edit the file by hand upward.
- Persisted-data fixtures live in `tests/fixtures/persisted/<kind>/v<N>.json` and are never edited. When a stored shape changes, add a new version and keep the old one.

## Where to look

- Plan, phases and standards: `docs/professionalization-plan.md`
- Decisions: `docs/adr/`
- Baselines and AI cost log: `docs/metrics.md` (local file, listed in `.gitignore`; keep it updated but never commit or stage it)
- Security findings, CSP, abuse limits: `docs/security.md`
- Vendor inventory and swap effort: `docs/vendors.md` (Phase 4)
- Contributor guide (English): `CONTRIBUTING.md`
