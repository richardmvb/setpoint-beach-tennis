# Metrics

Each phase PR updates this file. Baselines show where the project started; the phase rows show what each phase moved.

## Baseline (measured 2026-11-11, before Phase 0)

| Metric                                                     | Value                | How measured                       |
| ---------------------------------------------------------- | -------------------- | ---------------------------------- |
| `AppComponent` logic                                       | 3,042 lines          | `wc -l src/app/app.component.ts`   |
| `AppComponent` template                                    | 602 lines            | `wc -l src/app/app.component.html` |
| Global stylesheet                                          | 1,264 lines          | `wc -l src/styles.css`             |
| Direct `localStorage` calls in `AppComponent`              | 33                   | `grep -c localStorage`             |
| `Date.now()` / `new Date()` / `Math.random()` in `src/app` | 25                   | `grep`                             |
| Migrations with RLS or policy statements                   | 5 of 14              | `grep`                             |
| Unit tests (`node:test`)                                   | 83 passing, 12 files | `npm test`                         |
| Database tests (PGlite)                                    | 27 passing, 6 files  | `npm run test:db`                  |
| Production dependency audit                                | 0 vulnerabilities    | `npm audit --omit=dev`             |

## Phase 0 result (2026-11-11, not committed yet)

| Metric                                         | Value                                                    | Notes                                                                                                             |
| ---------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| ESLint (TypeScript and templates)              | 0 problems                                               | type-aware rules; template accessibility rules on                                                                 |
| Stylelint (`src/**/*.css` except `styles.css`) | 0 problems                                               | `styles.css` excluded until Phase 5 (19 structural findings, including cascade-order issues)                      |
| Prettier                                       | 0 files to format                                        | `src/**/*.html` and `src/styles.css` excluded (whitespace-sensitive templates; Phase 4 and 5)                     |
| Typecheck (`tsconfig.eslint.json`)             | 0 errors                                                 | covers all of `src/**/*.ts`                                                                                       |
| Knip                                           | 0 findings                                               | 4 `core/` files exempt from export checks because `tests/` load them through `loadCore`                           |
| Unit tests                                     | 83 passing                                               | unchanged count                                                                                                   |
| Database tests                                 | 27 passing                                               | unchanged count                                                                                                   |
| Coverage (`node --experimental-test-coverage`) | 100% of files the tests load                             | Not a whole-app number: Node counts only loaded files. Real coverage with thresholds comes with Vitest (Phase 2). |
| Initial bundle (production)                    | 1.45 MB raw, 340.30 kB transfer                          | measured after the Phase 0 code changes, which are behavior-neutral; budgets 1.5 MB warn, 2 MB error              |
| Build warning                                  | `sweetalert2` is CommonJS                                | Phase 7 (bundle work)                                                                                             |
| `no-unsafe-*` findings deferred                | 24 (18 assignment, 6 enum comparison)                    | Phase 3, from untyped Supabase results                                                                            |
| Lint ratchet scope                             | `src/app/features/**/*.ts` must be standalone and OnPush | widen as code moves                                                                                               |

## Phase 1 result (2026-11-12, local notes, not committed)

| Metric                                    | Value                                                                                         | Notes                                                                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E2E tests (Playwright, Chromium)          | 11 tests in 5 spec files                                                                      | landing and wizard, full tournament to podium, score validation, persistence, profile, theme, network isolation, stored-data compatibility, accessibility |
| E2E stability                             | 32 of 32 passed over 4 repeats                                                                | after handling the tie-break draw dialog and marking the long journey as slow                                                                             |
| Journey runtime                           | about 25 s alone for draw to podium                                                           | whole suite about 1 min with parallel workers                                                                                                             |
| Persisted-data fixtures                   | 1 (tournament v1)                                                                             | offline queue and shared snapshot fixtures are follow-ups                                                                                                 |
| Axe baseline (violations, nodes per page) | color-contrast 4 to 62, label-content-name-mismatch 1 per page, button-name 2 (profile panel) | 7 screens recorded in e2e/a11y-baseline.json; ratchet only allows it to go down                                                                           |
| External requests during tests            | blocked                                                                                       | all hosts except localhost; the app still tries Supabase anonymous sign-in at startup (auth/v1/signup) in local mode, which is aborted                    |
| New dev dependencies                      | @playwright/test 1.65.0, @axe-core/playwright 4.14.0, @types/node 24                          |                                                                                                                                                           |

Not covered yet (follow-ups): shared invite and live viewer (needs mocked Supabase), saved tournaments (library), offline reconnect score sync, and the dashboard.

## Phase 2 result (2026-11-12, local notes, not committed)

| Metric                      | Value                                                                               | Notes                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Angular / TypeScript        | Angular 22.2, TypeScript 6                                                          | PRs #16 and #17, e2e green after each                                                  |
| Migration schematics        | self-closing tags, `inject()`, signal inputs 48 of 56, outputs 14 of 14, no queries | PR #18                                                                                 |
| Unit tests                  | 84 Vitest tests (was 84 `node:test`), 12 spec files, plus 12 property tests         | PRs #19 and #21; `test:db` stays on `node:test` (6 files)                              |
| Coverage of `src/app/core/` | statements 56.7, branches 59.26, functions 62.84, lines 54.7                        | floors in `angular.json`: 56 / 59 / 62 / 54, enforced by `npm run test:coverage` in CI |
| Property tests              | `schedule-shuffle`, `scenario-engine`, `qualification` (`fast-check`)               | 15 to 40 runs each; schedule runs are slow (a CI timeout showed this)                  |
| Initial bundle              | 1.46 MB against a 1.5 MB warning budget                                             | unchanged                                                                              |

### Left over from Phase 2

- `@testing-library/angular` and `@testing-library/dom` are not installed: knip rejects an unused dependency and no component test exists yet. Add them with the first component test (Phase 4 extractions).
- 8 `@Input()`s are not signal inputs: final-live-score setter, number-range values, battle-card match, avatar-picker value, qualification-stats rows, path and shareError, player-avatar photoDataUrl. They need a manual change (setters or two-way patterns) that the schematic skipped.
- Zoneless change detection (`provideZonelessChangeDetection`, dropping zone.js): evaluated after Phase 4, as the plan says.
- Coverage floors only cover `core/` and are low (about 55%): raise them as code moves to `domain/` and as `AppComponent` is extracted (Phase 4).
- Three specs read source files through `process.cwd()` (`analytics-catalog`, `dialog.service`, `app.component`); they only work from the repo root. Replace them with real behavior tests when those files are extracted.
- Observed, unchanged: dev-mode NG0956 (`@for` track by identity re-creates a size-2 list) and the `sweetalert2` CommonJS build warning (Phase 7).

## Phase 3 result (2026-11-12, one PR)

| Metric                   | Value                                                                                                                   | Notes                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Content-Security-Policy  | meta CSP in `src/index.html`, no inline scripts, fonts self-hosted, every e2e test fails on a violation                 | headers and `frame-ancestors` wait for the hosting decision        |
| Migrations               | 15 (new: `202611120001_security_hardening`)                                                                             | apply from empty on the local Supabase CLI stack                   |
| DB security tests        | 32 pgTAP tests on the real stack; 27 PGlite tests (was 27) with one shared fake-auth helper                             | `npm run test:db:supabase`, `npm run test:db`                      |
| Audit findings           | 4 fixed (anon EXECUTE on 15 RPCs, default privileges, implicit deny, no per-owner quota), details in `docs/security.md` | splinter: 0 ERROR, WARNs only the two by-design lints              |
| Generated types          | `src/app/core/database.types.ts`, drift checked in CI                                                                   | RPC JSON payloads are parsed, not typed by hand                    |
| Valibot parsers          | RPC responses (11 parsers) with malformed-input tests                                                                   | URL, invite and import parsers arrive with the Phase 4 extractions |
| `no-unsafe-*` lint rules | on for all of `src/` (were off)                                                                                         | 8 errors fixed, no suppressions                                    |

### Left over from Phase 3

1. **Hosted Supabase Auth settings review (owner action, later).** In the Supabase dashboard check the anonymous sign-in and email rate limits, CAPTCHA, and that redirect URLs list only the app (see `docs/security.md`, Abuse review). It could not be checked from the repo.
2. **Independent review of the RLS and RPC audit.** The plan routes this to an Opus-class reviewer; it was done in the same Sonnet session that wrote it. Run it as a fresh-context `/security-review` before Phase 4.
3. Real security headers and `frame-ancestors` after the hosting decision; URL, invite and import parsers in the Phase 4 extractions.
4. Migrations deploy automatically on merge through the Supabase integration, so the CI `database` job is the only gate before production. Confirm in the dashboard that the integration points at the production project and note the branch it tracks.

## Dependency decisions

- `angular-eslint` is pinned to 20.7.0 to match Angular 20. Version 22 would not match the framework (Phase 2 moves both).
- `@eslint/js` is pinned to 9.x because ESLint is 9.x. Version 10 of `@eslint/js` requires ESLint 10.

## AI cost log

Rule 9 of the cost strategy: fill in each row when its phase is complete. Estimates come from the plan's cost table.

| Phase                                                                         | Dates               | Sessions                                          | Turns                                                                      | Input / cache-write / cache-read / output tokens                          | Model mix (% of cost per model)                                       | Actual $                                                                | Est. $                             | Variance                          | Main cause of variance                                                                                                                                                                                      | Lesson for next phases                                                                                                                                                                                   |
| ----------------------------------------------------------------------------- | ------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Foundations                                                                 | 2026-11-11 to 11-12 | 1 (shared with the plan review)                   | ~85 (of 125 API calls in the session)                                      | session total: 44k / 1.61M / 30.28M / 182k (Phase 0 share not separable)  | ~mostly Haiku; session total Opus 62%, Sonnet 34%, Haiku 4%           | ~2.3                                                                    | 10                                 | about -77%                        | cheap-model routing on mechanical work; plan review (about $4.9) is excluded                                                                                                                                | Do not switch models mid-session: 5 full cache misses cost about $2.67 (37% of the session). Start each phase in a fresh session.                                                                        |
| 1 + 2 (Phase 1 closed with gaps, Phase 2 complete except the leftovers below) | 2026-11-12          | 2 (the long session, then a fresh one for Vitest) | ~250 (long session) + 103 (fresh session, 46 of them Haiku subagent calls) | not separable; fresh session 12.5M tokens, 96% cache hit                  | long session Sonnet and Opus mix; fresh session Sonnet 87%, Haiku 13% | ~15.1 (~13.5 + ~1.6 for the Vitest, coverage and property-test session) | 15 + 13 (about 28 for both phases) | about -46% against both estimates | cheaper routing (Haiku did the 12-file conversion for about $0.21) and deterministic tools (schematics, ng update) kept the turns low; the e2e suite and flaky-test hunts took the most in the long session | A fresh session per step worked: no mid-session model switch, one cache miss. Run the coverage build (`npm run test:coverage`) before opening a PR: a 5 s timeout only showed up in CI with coverage on. |
| 3 Security hardening                                                          | 2026-11-12          | 1 (`f0e08629`, one fresh session, PR #22)         | 92 API calls, 4 prompts                                                    | session: 16.1M tokens, 97% cache hit (cache write about $1.1 of the cost) | Sonnet 100% (no Opus review, no subagents)                            | ~3.4                                                                    | 18                                 | -81%                              | One session of large batched tool calls (migrations, tests, docs written in single steps) and no retry loops; deterministic tools (Supabase CLI, splinter, `supabase gen types`) did the checking.          | Estimate was about 5x too high for tool-driven work. Cost stays low when the gates are scripted first. No Opus review was run, so the RLS audit had no independent read; see leftover 2.                 |

_Phase 3 actual is approximate: measured with the token-usage skill on 2026-11-12 (API list-price estimate, not a bill) from the one session that did the whole phase, including the merge and this close-out. Re-forecast: variance is above 25%, but later phases are different work (Phase 4 is dominated by reading the three large files), so their estimates are not scaled; the Phase 0 to 3 trend (-77%, -46%, -81%) suggests the total will land well under $251. Revisit after the Phase 4 pilot._

_Phase 2 actual is approximate: measured with the token-usage skill on 2026-11-12 (API list-price estimate, not a bill); the cost of writing this note is not included, and Phase 1 and Phase 2 are not separable because they shared the long session._

_Phase 0 actual is approximate: the 125 API calls and $7.21 session total (API list-price estimate, not a bill) cover the plan review (about $4.9) and Phase 0 work (about $2.3) in one session, split by time. Measured with the token-usage skill on 2026-11-12. The deploy wait and the cost of writing this note are not included._
