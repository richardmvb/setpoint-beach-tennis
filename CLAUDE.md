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
npm run db:types        # regenerate src/app/core/database.types.ts (never edit it by hand)
npm run test:coverage   # unit tests with V8 coverage
npm run e2e             # Playwright end-to-end tests (set E2E_BROWSER_CHANNEL=chrome to use installed Chrome)
npm run build           # production build (run scripts/generate-runtime-config.cjs first)
npm run check           # lint, styles, format, typecheck, knip, tests, build
```

Local runtime config is `public/runtime-config.js` (tracked, development values). Do not overwrite it. CI and deploy regenerate it with `scripts/generate-runtime-config.cjs`.

## Architecture (current)

- `src/app/app.component.ts` and `.html`: monolith (about 3,000 lines of logic). Being decomposed in Phase 4. Do not add new features here; put new code in the target structure.
- `src/app/core/`: services and domain logic (`supabase.service.ts`, `storage.service.ts`, `state-machines.ts`, `offline-sync-queue.ts`, `scenario-engine.ts`, ...). Unit tests are colocated `*.spec.ts` files run by Vitest.
- `src/app/features/`: presentational components (flat for now).
- `src/styles.css`: one global stylesheet. Split into tokens and components in Phase 5.
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

## Known deferred items (not silenced; tracked in the plan)

| Item                                                                                                                      | Phase                                |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `src/styles.css` excluded from Stylelint and Prettier (structural issues, cascade order)                                  | 5 (split into tokens and components) |
| `src/**/*.html` excluded from Prettier (whitespace-sensitive templates)                                                   | 4 (per-feature templates)            |
| Modal focus trap and Escape handling are partial                                                                          | 5 (`@angular/cdk/dialog`)            |
| Axe baseline: color-contrast (up to 62 nodes per page), label-content-name-mismatch, unnamed buttons in the profile panel | 5 (design system and accessibility)  |
| E2E for shared invite and live viewer (mocked Supabase), saved tournaments, offline sync                                  | Phase 1 follow-ups                   |
| `sweetalert2` is CommonJS and bails out tree-shaking (build warning)                                                      | 7                                    |

## Unit tests (Vitest)

Specs are `src/**/*.spec.ts`, colocated with the code, run by `ng test` (Angular unit-test builder, Vitest, jsdom). Import `describe`, `it` and `expect` from `vitest` (no globals). Import the real modules and build services and components through `TestBed` (`TestBed.inject`, `runInInjectionContext`); never stub `@angular/core`. `src/app/testing/` holds shared test helpers. Property tests use `fast-check` in `*.property.spec.ts` next to the module (schedule shuffle, scenario engine, qualification); failures print a seed, so rerun with `fc.assert(..., { seed, path })` to reproduce. Use `seededRandom` for the code's own random source. The SQL tests in `tests/` stay on `node:test` (`npm run test:db`).

Coverage thresholds live in `angular.json` (`test.options.coverageThresholds`) and measure `src/app/core/` only; CI runs them through `npm run test:coverage`. They are a ratchet: raise them when coverage rises, never lower them. Measured on 2026-11-12 with the property tests: statements 56.7, branches 59.26, functions 62.84, lines 54.7 (the thresholds are the floors). New code must be covered.

## End-to-end tests (e2e/)

- Playwright runs the real app. `e2e/support/fixtures.ts` blocks every host except localhost, so tests never reach Supabase, PostHog or Google Fonts, and it starts like a returning user (landing, tour and profile prompt skipped). Use its `test`, never the raw Playwright one.
- Select elements by role and accessible name. The fixture seeds `Math.random`, so the draw is the same on every run; still prefer asserting structure (counts, headings, saved state) over player names. Ties are resolved by `generateFinals`. Use `test.use({ randomSeed: null })` only to test real randomness.
- Accessibility is a ratchet: `e2e/a11y-baseline.json` holds today's axe violations and a page fails when a rule appears or grows. Fix violations, then lower the baseline with `A11Y_RECORD=1`, which never raises a count. Do not edit the file by hand upward.
- Persisted-data fixtures live in `tests/fixtures/persisted/<kind>/v<N>.json` and are never edited. When a stored shape changes, add a new version and keep the old one.

## Where to look

- Plan, phases and standards: `docs/professionalization-plan.md`
- Decisions: `docs/adr/`
- Baselines and AI cost log: `docs/metrics.md`
- Security findings, CSP, abuse limits: `docs/security.md`
- Vendor inventory and swap effort: `docs/vendors.md` (Phase 4)
- Contributor guide (English): `CONTRIBUTING.md`
