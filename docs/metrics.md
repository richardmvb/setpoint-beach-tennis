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

## Dependency decisions

- `angular-eslint` is pinned to 20.7.0 to match Angular 20. Version 22 would not match the framework (Phase 2 moves both).
- `@eslint/js` is pinned to 9.x because ESLint is 9.x. Version 10 of `@eslint/js` requires ESLint 10.

## AI cost log

Rule 9 of the cost strategy: fill in each row when its phase is complete. Estimates come from the plan's cost table.

| Phase         | Dates      | Sessions | Turns   | Input / cache-write / cache-read / output tokens | Model mix (% of cost per model) | Actual $ | Est. $ | Variance | Main cause of variance | Lesson for next phases |
| ------------- | ---------- | -------- | ------- | ------------------------------------------------ | ------------------------------- | -------- | ------ | -------- | ---------------------- | ---------------------- |
| 0 Foundations | 2026-11-11 | pending  | pending | pending                                          | pending                         | pending  | 10     | pending  | pending                | pending                |
