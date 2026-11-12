# Plan: Make Setpoint Beach Tennis a professional, scalable, maintainable project

Status: approved, not started. Next step is Phase 0. Reviewed 2026-11-11: phases 1 and 2 swapped (safety net before upgrade), and two sections added: engineering standards enforced on every PR, and release and delivery.

## Context

Setpoint is an Angular 20 standalone SPA (pt-BR) with a Supabase backend (SQL migrations + RPCs), hosted on GitHub Pages, with PostHog analytics. It works, but it was built fast and is now hard to hand to other developers:

- `src/app/app.component.ts` (~3,000 lines) and `app.component.html` (~600 long lines) hold nearly all UI and state. There is no router and no lazy loading, and URL parsing is hand-rolled.
- State is mutable class fields. There are no signals, rxjs is unused, and the root uses default change detection.
- `AppComponent` bypasses the infrastructure services: 33 direct `localStorage` calls (despite `StorageService`), and 25 `Date.now()`/`new Date()`/`Math.random()` calls across `src/app` make behavior hard to test deterministically.
- One 1,264-line global `styles.css` with a token block redefined twice and hardcoded dark-mode hex values. ~60 repeated UI patterns are not components.
- No ESLint, Stylelint, Prettier, husky or commitlint. CI (`.github/workflows/deploy.yml`) deploys without running tests, lint or typecheck. There is no versioning, changelog or rollback procedure.
- Tests are `node:test` (18 test files + 1 helper) on pure logic plus PGlite SQL tests. There are no component or e2e tests and no coverage.
- No CSP or security hardening. Only 5 of 14 migrations contain RLS/policy statements (grep count, confirm in the audit), and migrations are applied by hand with no Supabase CLI. Supabase row types are hand-written interfaces in `supabase.service.ts`.
- Persisted data (`setpoint.tournament.v1`, the offline sync queue, shared snapshot JSON) carries `version: 1` but has no migration path to a v2 shape.
- Angular is two majors behind (latest is 22.x). There is no CLAUDE.md or AGENTS.md, no i18n, and only partial a11y.

Already in place and kept: `strict`, `strictTemplates`, `noImplicitReturns`, `noPropertyAccessFromIndexSignature`, `strictInjectionParameters`; production bundle budgets; PostHog source-map upload per build.

Goal: a codebase another developer or AI agent can navigate, extend and trust, with performance, security, tests and consistent patterns enforced by tooling rather than convention.

## Decisions

- Architecture: feature folders + Angular Router (lazy routes) + signal-based stores, OnPush everywhere, new control flow. No NgRx.
- Design system: CSS custom-property tokens + UI components in a `src/app/ui/` folder with a path alias and a lint boundary, documented by a dev-only `/_ui` gallery route (see below). Not a separate `projects/ui` library, because one app does not need ng-packagr builds; promote it to a library only if a second consumer appears.
- i18n: Transloco, so users can switch language at runtime without a separate deployment per locale. Angular built-in i18n (`@angular/localize`) was rejected because it needs one build per locale under GitHub Pages' single base-href.
- Vendors (Supabase, PostHog and the rest) sit behind ports and adapters, so each one can be replaced without touching features (see Vendor independence).
- Record the three decisions above as ADRs in Phase 0 (`docs/adr/0001-ui-folder.md`, `docs/adr/0002-i18n-transloco.md`, `docs/adr/0003-ports-and-adapters.md`).
- Testing: Vitest + Angular Testing Library + Playwright, with coverage thresholds in CI.
- Scope: foundations, security hardening, Angular upgrade, i18n (pt-BR + en).
- Must be decided before Phase 4 starts, each as an ADR, so extracted code is touched only once:
  - Transloco setup (pt-BR only, key naming convention, scoped translations per feature), so components are extracted with translation keys instead of raw strings.
  - Public URL scheme (`/t/:code`, `/ao-vivo/:code`, `/painel`), so the router is built once with the final paths and the legacy redirects.
  - Hosting (GitHub Pages vs Cloudflare Pages/Netlify). This decides real security headers, per-PR preview deploys, the base-href and the 404 fallback.
- UI docs (decided in review 2): a dev-only `/_ui` gallery route, excluded from production builds, showing every `ui/` component in each variant and theme, covered by Playwright screenshot and axe tests. This gives the visual-regression and a11y coverage of Storybook with one test stack instead of two, and no Storybook upgrades to maintain.
  - Storybook is adopted only if its stories can run as the component tests, so nothing is written twice. As of 2026-11-11 the official `@storybook/angular` (10.6) still uses the webpack builder (`@angular-devkit/build-angular`, `zone.js` peers), while this app uses `@angular/build`. Stories can run as Vitest tests only through the community Vite-based `@analogjs/storybook-angular`.
  - Re-check at the start of Phase 5 with a one-hour spike. Switch to Storybook only if stories run as Vitest tests with the app's builder and without forcing `zone.js` back in.
  - Recorded in `docs/adr/0001-ui-folder.md`.

## Working rules

- One PR per phase (or per extracted feature inside Phase 4), each leaving the app compiling, tested and deployable. Ship each green before starting the next. If time runs short, stop after the current step and list the rest as follow-ups.
- Never silence a gate to make it pass: no `eslint-disable`, `@ts-ignore`, `stylelint-disable`, skipped or `.only` tests, or baselines. Fix the code or reduce scope.
- Ratchet, do not suppress. A rule that legacy code cannot pass yet (OnPush, `max-lines`, `prefer-signals`, boundaries) is turned on as `error` through an ESLint `files` glob covering only code that complies (`src/app/core/**`, `src/app/features/**`, every new folder). The glob widens as code is migrated and `AppComponent` is never excluded by name. Coverage thresholds and bundle budgets only move in the stricter direction.
- Every decision gets an ADR in `docs/adr/` when it is made, not at the end.
- Definition of Done for every PR: all CI gates green; tests added for new behavior; `CLAUDE.md` and the relevant `docs/` updated when a pattern or command changes; no new runtime dependency without an ADR; persisted-data or DB changes are backward compatible (see Release and delivery).
- Conventional Commits, enforced by commitlint (on commits and on the PR title for squash merges).

## Engineering standards (enforced on every PR)

These are the patterns new code must follow. Each has an automated check, so they hold in every release, not only during this plan. The phase column is when the check is turned on; the ratchet rule above covers legacy code.

| #   | Pattern                                                                                                                                                                                                                                                                                                              | How it is verified                                                                                                                                                                                                                                                  | From           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | Features never import other features; `core/` and `shared/` never import `features/`; `ui/` imports only `shared/`.                                                                                                                                                                                                  | `eslint-plugin-boundaries` (or `no-restricted-imports` per folder)                                                                                                                                                                                                  | 0              |
| 2   | Vendors only behind ports (see Vendor independence): vendor SDKs and their types (`@supabase/*`, `posthog-js`, `sweetalert2`, `driver.js`, `@zhuravlev-biz/padel-score-engine`) and browser storage are imported only in `core/adapters/<vendor>/`. Everything else depends on the port interfaces in `core/ports/`. | `no-restricted-imports` (also blocks `import type`), `no-restricted-globals`, `no-restricted-properties`, boundaries rule for `core/adapters/**`                                                                                                                    | 0 (scoped) / 4 |
| 3   | Domain logic (state machines, schedule, qualification, scenario engine, offline queue) is framework-free: no `@angular/*`, no DOM, no vendor SDKs, no direct `Date`/`Math.random`; time and randomness come from injected `Clock`/`Random`.                                                                          | `no-restricted-imports` + `no-restricted-properties` scoped to the domain folder; coverage threshold ≥ 90% there                                                                                                                                                    | 0 / 4          |
| 4   | Components: standalone, OnPush, `input()`/`output()`/`model()`, `inject()`, `@if`/`@for` with `track`, `NgOptimizedImage`, derived values via `computed()` instead of template method calls.                                                                                                                         | angular-eslint: `prefer-standalone`, `prefer-on-push-component-change-detection`, `prefer-signals`, `prefer-output-emitter-ref`, `prefer-inject`, `no-uncalled-signals`, `template/prefer-control-flow`, `template/prefer-ngsrc`, `template/use-track-by-function`  | 0 (scoped)     |
| 5   | State lives in one signal store per feature: private writable signals, public readonly signals or `computed`, mutations only through store methods.                                                                                                                                                                  | `@typescript-eslint/prefer-readonly`, store unit tests, review checklist                                                                                                                                                                                            | 4              |
| 6   | No leaked async work: subscriptions use `takeUntilDestroyed`, realtime channels and timers are released in `DestroyRef.onDestroy`, promises are awaited or explicitly `void`ed.                                                                                                                                      | `no-implicit-take-until-destroyed`, `@typescript-eslint/no-floating-promises`, `no-misused-promises` (type-aware lint)                                                                                                                                              | 0              |
| 7   | All external data is parsed, not cast: URL params, invite codes, Supabase responses, `localStorage`, shared/imported payloads go through a schema (Valibot, for bundle size) into typed models.                                                                                                                      | `@typescript-eslint/consistent-type-assertions` (no `as` on object literals), `no-restricted-syntax` banning `JSON.parse` outside `parsers/`, malformed-input unit tests                                                                                            | 3              |
| 8   | DB types are generated, never hand-written.                                                                                                                                                                                                                                                                          | CI runs `supabase gen types` against the local DB and fails on `git diff --exit-code`                                                                                                                                                                               | 3              |
| 9   | Every persisted shape (localStorage keys, offline queue, shared snapshot JSON) is versioned and has a migrator from every older version. Fixtures of each old version stay in the repo forever.                                                                                                                      | Unit tests load `tests/fixtures/persisted/<kind>/v<N>.json` and assert they migrate to the current shape                                                                                                                                                            | 4              |
| 10  | Migrations are forward-only and immutable once merged, and follow expand/contract: never drop/rename a column or change an RPC signature in the same release that stops using it; add `fn_v2` next to `fn`.                                                                                                          | CI fails if a migration already on `main` changed; `squawk` lints migrations for locking/dangerous ops; PGlite tests call the previous release's RPCs against the new schema                                                                                        | 3              |
| 11  | DB security invariants: every `public` table has RLS enabled with at least one policy; every `SECURITY DEFINER` function sets `search_path` and `EXECUTE` is revoked from `public`/`anon` unless intended.                                                                                                           | Supabase's `splinter` lints (the queries behind the dashboard Security Advisor) and `supabase db lint` against the local DB, plus a pgTAP test for the project-specific `EXECUTE` grants; all fail CI on any violation, so new migrations are covered automatically | 3              |
| 12  | Errors are handled once: no empty `catch`, failures reach the PostHog error handler tagged with the release, and the user sees a message from one notification service.                                                                                                                                              | `no-empty` (`allowEmptyCatch: false`), `@typescript-eslint/only-throw-error`, `no-console` (except the bootstrap)                                                                                                                                                   | 0              |
| 13  | Analytics events come only from the typed event catalog and carry no PII (enums and counts only).                                                                                                                                                                                                                    | Restricted import of `posthog-js` (#2) + the existing `analytics-catalog` test                                                                                                                                                                                      | 0              |
| 14  | No raw user-facing strings in templates or TS; every key exists in pt-BR and en.                                                                                                                                                                                                                                     | CI script that checks for missing/unused keys + a template text check (angular-eslint 22 has no template i18n rule, so this is a small custom script)                                                                                                               | 6              |
| 15  | Accessibility: semantic elements, labelled controls, keyboard-reachable, tests query by role.                                                                                                                                                                                                                        | angular-eslint template accessibility rules; `@axe-core/playwright` on every route (zero violations); `eslint-plugin-testing-library`                                                                                                                               | 0 / 1          |
| 16  | Styling only through tokens: no hex/rgb colors, raw spacing or font sizes outside `tokens.css`; component styles stay in their component.                                                                                                                                                                            | Stylelint + `stylelint-declaration-strict-value` (color, spacing, font-size, z-index); `anyComponentStyle` budget                                                                                                                                                   | 0 (scoped) / 5 |
| 17  | Small units: ≤ 300 lines per file, bounded function size and complexity, kebab-case file names by type.                                                                                                                                                                                                              | `max-lines`, `max-lines-per-function`, `complexity`, `template/cyclomatic-complexity`, `unicorn/filename-case`                                                                                                                                                      | 0 (scoped)     |
| 18  | No dead code or unused dependencies.                                                                                                                                                                                                                                                                                 | `knip` in CI (unused files, exports, deps)                                                                                                                                                                                                                          | 0              |
| 19  | No `innerHTML`/`bypassSecurityTrust*`, no inline scripts; CSP stays strict.                                                                                                                                                                                                                                          | `no-restricted-syntax` + `template/no-inline-styles`; Playwright test fails on any CSP violation console event                                                                                                                                                      | 3              |
| 20  | Only stable Angular APIs (for example, Reactive Forms rather than experimental Signal Forms).                                                                                                                                                                                                                        | `no-experimental`, `no-developer-preview`                                                                                                                                                                                                                           | 2              |
| 21  | Performance stays within budget per release.                                                                                                                                                                                                                                                                         | Angular budgets (initial + lazy chunks), Lighthouse CI budgets (LCP, INP, CLS, JS size)                                                                                                                                                                             | 0 / 7          |
| 22  | Supply chain: lockfile installs, pinned Actions, no known vulnerable runtime deps, no committed secrets.                                                                                                                                                                                                             | `npm ci`, Actions pinned by SHA, `npm audit --omit=dev`, Dependabot, `gitleaks`, CodeQL                                                                                                                                                                             | 0              |
| 23  | Tournament rules are proven by invariants, not only examples: every pair plays the expected matches, no player is in two matches in the same round, rankings are a permutation, the same seed gives the same schedule. Tests must actually catch bugs, not just reach coverage.                                      | `fast-check` property tests on `domain/`; Stryker mutation testing on `domain/` in a nightly job with a minimum mutation score (no tokens, CI minutes only)                                                                                                         | 2 / 4          |
| 24  | Every port has one contract test suite that every implementation must pass: the in-memory fake and the real adapter (the Supabase adapters against the local Supabase in CI). A new vendor adapter is only wired in after it passes the same suite.                                                                  | Shared `describe<Port>Contract()` suites in `core/ports/testing/`; CI fails if a port has an implementation not covered by its suite                                                                                                                                | 4              |
| 25  | Vendor-specific SQL is isolated: new migrations call `app.current_user_id()` (and similar helpers) instead of `auth.uid()`/`auth.jwt()` directly, and keep business rules in standard Postgres.                                                                                                                      | CI script that fails on `auth.uid()`/`auth.jwt()` in migrations newer than the helper migration (older ones are immutable)                                                                                                                                          | 3              |

## Vendor independence (ports and adapters)

Supabase, PostHog, SweetAlert2, driver.js and the padel score engine are implementation choices, not architecture. Replacing one should mean writing one new adapter that passes the existing contract tests, then changing one provider line in `app.config.ts`. No feature, store, domain or UI code should change.

**Today's coupling (measured 2026-11-11):** `AppComponent` imports Supabase's `User` type. `SupabaseService` is one 20 KB service mixing auth, realtime and 23 RPC calls, and is injected directly into `AppComponent`, a feature component and the PostHog services. `posthog-js` covers events, identify/reset, exceptions and surveys. The domain module `final-live-score.ts` imports the third-party score engine directly.

Patterns:

1. **Ports and adapters (hexagonal).** Each capability the app needs is a small interface in `core/ports/`, written in the app's language, with an Angular `InjectionToken`. Adapters in `core/adapters/<vendor>/` implement them. Features, stores and domain code inject ports only (#2).
2. **Ports shaped by use, not by the SDK.** Ports have business methods (`TournamentRepository.saveSnapshot()`), never a generic `rpc(name, args)` or `query(table)`. A generic port leaks the vendor's data model, which defeats the purpose. Keep ports small (interface segregation): a feature that only reads does not get write methods.
3. **Anti-corruption layer inside each adapter.** Generated Supabase row types (#8), vendor error codes, realtime channel objects, auth sessions and SDK enums stay inside the adapter. Adapters map rows to domain models through the Valibot parsers (#7) and vendor errors to a small app error type (`NotFound`, `Forbidden`, `Conflict`, `Offline`, `Unexpected`). Ports return `Promise`/`Observable` of domain types; subscriptions are torn down through the returned `Observable` or function, never through vendor handles.
4. **Composition root.** Only `app.config.ts` binds ports to adapters, grouped per vendor (`provideSupabaseAdapters()`, `providePostHogAdapters()`, `provideBrowserAdapters()`). Swapping a vendor is a change to that one line plus the new adapter folder.
5. **Contract tests and fakes (#24).** Each port has one shared test suite. The in-memory fake passes it in unit tests; the real adapter passes it against the local Supabase in CI. The same fakes back the component tests and an offline Playwright mode, so tests are faster and the fakes cannot drift from real behavior.
6. **Fan-out during a migration.** Adapters can be composed: a `CompositeAnalytics` sends events to the old and new vendor at once, and a feature flag picks the read source for a repository. This makes a vendor swap a gradual strangler move instead of a big-bang cutover. The feature-flag port itself is vendor-neutral, so moving off PostHog does not break rollouts.
7. **Portable backend logic.** Business rules stay in standard Postgres functions and RLS policies (portable to any Postgres host). Supabase-specific pieces (`auth.uid()`, `auth.jwt()`, realtime publications, storage buckets) go through small helpers such as `app.current_user_id()` (#25), so leaving Supabase changes a few helper functions, not every policy.
8. **Own your identifiers and data.** Domain IDs (tournaments, players, invite codes) are app-generated, never vendor IDs. The auth user ID is mapped to an app `UserId` at the port. Each vendor has a documented export path (Postgres dump, PostHog event export) so data can leave with you.
9. **No over-abstraction.** A port exists only for a capability the app uses today. No plugin system, no generic repository, no abstraction over Angular itself. The test: could a second implementation be written from the interface alone, without reading vendor docs?

Ports to define (from the inventory above):

| Port                                                                                                          | Today's adapter                                   | Replaces direct use of                                                     |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| `AuthPort` (current user, anonymous sign-in, magic link, sign-out, auth-state stream)                         | Supabase Auth                                     | `supabase.auth.*`, the `User` type in `AppComponent`                       |
| `TournamentRepository`, `LiveTournamentFeed`, `ArchiveRepository`, `ProfileRepository`, `DashboardRepository` | Supabase (RPC + realtime)                         | the 23 `.rpc()` calls and 4 realtime channels in `SupabaseService`         |
| `AnalyticsPort` (typed event catalog, identify, reset), `ErrorReporter`, `FeatureFlags`, `SurveyPort`         | PostHog                                           | `posthog.capture/identify/reset/captureException/getSurveys/displaySurvey` |
| `KeyValueStore`                                                                                               | `localStorage`                                    | the 33 direct `localStorage` calls in `AppComponent`                       |
| `DialogPort`, `NotificationPort`                                                                              | SweetAlert2, then `@angular/cdk/dialog` (Phase 5) | `dialog.service.ts`                                                        |
| `GuidedTour`                                                                                                  | driver.js                                         | setup tour                                                                 |
| `ScoringRules` (domain interface)                                                                             | `@zhuravlev-biz/padel-score-engine`               | direct import in `final-live-score.ts`                                     |
| `Clock`, `Random`, `AppConfig`                                                                                | browser, `runtime-config.js`                      | `Date.now()`, `Math.random()`, `window.__SETPOINT_CONFIG__`                |

Record the pattern as an ADR (`docs/adr/0003-ports-and-adapters.md`) and keep `docs/vendors.md` with, for each vendor: the ports it implements, the lock-in risks (for example, users tied to Supabase Auth, the realtime protocol), its data export path and a rough swap effort.

## Release and delivery

How each new version ships, so every release goes through the same gates and stays compatible with what users already have open or stored.

1. **Pipeline (`ci.yml` on PRs, required by branch protection on `main`):** commitlint on the PR title → lint (ESLint type-aware + Stylelint) → format check → typecheck → unit/component tests with coverage thresholds → DB job (local Supabase via CLI in Docker, apply all migrations from empty, `squawk`, PGlite + security-invariant tests, generated-types drift check) → `knip` → production build with budgets → Playwright e2e + axe against the build. `deploy.yml` runs on `main` only after the same jobs pass.
2. **Versioning:** release-please reads conventional commits, opens a release PR with the `CHANGELOG.md` and semver bump, and tags on merge. The tag is the build ID shown in the app and sent to PostHog (events and error tracking), so every error report maps to a release and its source maps.
3. **Order of deploy:** DB migrations (expand) are applied before the frontend that needs them. Contract migrations (drops, old RPCs) ship in a later release, after old clients have aged out. This matters because open tabs and offline devices keep running the previous bundle.
4. **Compatibility contracts that every release must keep:** legacy URLs (`?invite=`, `?live=`, `/dashboard`) resolve; older persisted data migrates (#9); the previous release's RPC calls still work (#10).
5. **Previews and rollout:** per-PR preview deploys if hosting moves off GitHub Pages. Risky changes (each extracted feature in Phase 4, router cutover) go behind a PostHog feature flag so they can be turned off without a redeploy.
6. **After deploy:** a read-only Playwright smoke test runs against the production URL; check the PostHog error rate for the new release against the previous one.
7. **Rollback:** re-run the deploy workflow on the previous tag. Expand/contract makes this safe because the DB is always compatible with N-1. Document it in `docs/releasing.md`.
8. **Repo hygiene:** branch protection (required checks, no direct pushes), CODEOWNERS, PR template with the Definition of Done checklist, least-privilege `permissions:` per workflow job.

## Cost and execution strategy (AI-assisted)

High-level estimate with Sonnet-class pricing (assumed ~$3/M input, $15/M output, $0.30/M cache read; verify current rates). Cost is dominated by re-reading context on every turn, not by output, so the strategy is: let deterministic tools do mechanical work for free, keep context small, and route the rest to the cheapest model that passes the gates.

The first estimate was **~$300 (range $150 to $700), ~3,300 turns**. Review 2 cut work without lowering any gate: throwaway characterization tests dropped, Angular schematics and existing linters replace hand-written changes, a reviewed pilot feature becomes the template for the other six, and UI components are built once while extracting features. Revised: **~$250 (range $150 to $470), ~2,550 turns**, before model routing, including the vendor-independence layer. With routing (rule 3) the target is ~$160 to $190.

| Phase                      | Turns (est.) | Cost (est.) | Actual cost (after phase)  | What changed in review 2                                                                                                                                                                   |
| -------------------------- | ------------ | ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 Foundations              | 150          | $10         | ~$2.3 (-77%)               |                                                                                                                                                                                            |
| 1 Test safety net          | 200          | $15         | in Phase 1 + 2 total       | e2e is the characterization suite; no `AppComponent` unit tests that Phase 4 would delete                                                                                                  |
| 2 Angular upgrade + Vitest | 170          | $13         | ~$15.1 with Phase 1 (-46%) | Angular migration schematics do the signal/inject/control-flow rewrites; + property tests                                                                                                  |
| 3 Security hardening       | 230          | $18         | pending                    | `splinter`/`supabase db lint` replace hand-written catalog checks; + pgTAP permission tests                                                                                                |
| 4 Refactor (7 features)    | 1,120        | $145        | pending                    | pilot + template; includes building `ui/` components on first use, ~6 Opus review checkpoints, and ports/adapters with contract suites (+120 turns, offset later by faster tests on fakes) |
| 5 Design system            | 300          | $25         | pending                    | most components already built in Phase 4; gallery route instead of Storybook                                                                                                               |
| 6 i18n                     | 150          | $10         | pending                    | keys already exist; `transloco-keys-manager` finds missing keys; Haiku drafts `en`                                                                                                         |
| 7 Performance              | 150          | $10         | pending                    |                                                                                                                                                                                            |
| 8 DX + branding            | 80           | $5          | pending                    | feature template already made in Phase 4                                                                                                                                                   |
| **Total**                  | **2,550**    | **$251**    | pending                    |                                                                                                                                                                                            |

Phase 4 is still about half the cost because `app.component.ts`, `app.component.html` and `styles.css` total ~110k tokens and each extraction reads parts of them.

Rules to stay at the low end:

1. **One session per PR, and per extracted feature in Phase 4.** Start fresh after each merge. Never carry a long session across phases, because context size multiplies the cost of every later turn.
2. **Read narrowly.** Large files are read with line ranges or searched with grep, never loaded whole. Each Phase 4 extraction and the Phase 5 stylesheet split shrink the three big files, so later sessions load less. Keep each session's task to one stated goal with a written acceptance check.
3. **Route by model:**
   - Cheaper model (Haiku-class): mechanical, rule-bound work with a test or linter as judge: converting the 18 `node:test` files to Vitest, the `@if`/`@for` schematic follow-ups, extracting strings into i18n keys, boilerplate stories and component tests, lint-fix passes.
   - Standard model (Sonnet-class): feature extraction, store design, e2e tests, migrations, CI config, most of the plan.
   - Top model (Opus-class), sparingly: the RLS/RPC audit, the persisted-data migrators, the expand/contract migration review and the Phase 4 pilot feature, where a mistake is costly, hard to detect, or copied six times. Use it as a one-off reviewer of the diff, not as the working model.
   - Escalate, don't loop: if a cheaper model fails the same gate twice, hand the task to the next model up. The gates stay the judge for every model, so routing never lowers the quality bar.
   - Route per session or per subagent, never by switching `/model` mid-session: the prompt cache is per model, so a switch re-reads the whole context at full price.
4. **Use subagents for searches and bulk edits** so file dumps stay out of the main context. Run independent work in parallel only when it saves wall-clock time you need, since parallel runs add cost.
5. **Let tooling do the checking.** Run `npm run check` once per logical step rather than after every edit, and read only the failing lines of output. Fast local gates (`lint`, `typecheck`, a single test file) during the work, full `check` before the PR.
6. **Keep `CLAUDE.md` accurate and short** (commands, architecture map, standards table) so a new session does not re-explore the repo. This is part of the Definition of Done.
7. **Avoid retry loops.** If the same gate fails three times, stop, diagnose with a narrow read of the failure, and restate the goal in a fresh session instead of continuing a bloated one. Do not tune thresholds to pass (see Working rules).
8. **Budget per phase.** If a phase passes 1.5x its estimate while it is running, pause and split the remaining work before continuing. Check running spend with `/cost` at the end of each session. Cost not included: human review time. CI minutes are free for a public repo; the plan uses only free tiers (local Supabase, Lighthouse CI, Stryker).
9. **Record the actual cost when each phase is complete.** Recording it is part of the phase's Definition of Done, and the phase PR is not merged until it is filled in.
   - Measure it from the local Claude Code transcripts with the `token-usage` skill (or the sum of `/cost` per session), covering every session and subagent of the phase, including reviews and failed attempts.
   - Fill the "Actual cost" cell in the table above with the dollars, the variance against the estimate as a percentage, and the turns.
   - Add a full row to the cost log in `docs/metrics.md`:

     | Phase | Dates | Sessions | Turns | Input / cache-write / cache-read / output tokens | Model mix (% of cost per model) | Actual $ | Est. $ | Variance | Main cause of variance | Lesson for next phases |
     | ----- | ----- | -------- | ----- | ------------------------------------------------ | ------------------------------- | -------- | ------ | -------- | ---------------------- | ---------------------- |

   - Re-forecast the remaining phases. If the variance is above ±25%, apply the same ratio to the remaining estimates of similar work (for example, Phase 4 features after the pilot), update the table and the total, and note why in the log.
   - Save a recurring cause (a model routed too low, a retry loop, an oversized context) as a new rule in this section, so the next phase does not repeat it.
10. **Deterministic tools before the model.** Run the tool that already knows the answer before asking a model: Angular migration schematics, `eslint --fix`, `stylelint --fix`, `prettier --write`, `transloco-keys-manager`, `supabase gen types`, and small `ts-morph` codemods for repeated rewrites (for example, the 33 direct `localStorage` calls). The model only handles what is left.
11. **Pilot, then replicate.** The first extracted feature is reviewed in depth (Opus-class review plus a human pass) and becomes the template for the rest. Later extractions copy a reviewed pattern, which is cheaper and more consistent than designing each one.
12. **Review once per PR with a fresh context.** Run `/code-review` (and `/security-review` for Phase 3 and any SQL change) on the final diff instead of reviewing after every step. A reviewer that did not write the code catches more.

## Phase 0: Foundations and guardrails

1. Add `.nvmrc` (match CI's Node 24), `.editorconfig`, Prettier, Stylelint, `knip`, and `angular-eslint` with type-aware typescript-eslint. Turn on the rules from Engineering standards marked "0": globally where the code already complies, scoped to compliant folders where it does not (see the ratchet rule).
2. Add husky + lint-staged + commitlint (conventional commits).
3. Scripts in `package.json`: `lint`, `lint:styles`, `format:check`, `typecheck`, `test`, `test:coverage`, `test:db`, `e2e`, `knip`, `check` (runs all). Add coverage to the current `node:test` suite with `--experimental-test-coverage` until Vitest lands.
4. CI workflow `ci.yml` as described in Release and delivery (the DB job and e2e are added in Phases 1 and 3). Move the inline `runtime-config.js` generator in `deploy.yml` into `scripts/` and validate the config shape.
5. Dependabot (npm + GitHub Actions, grouped minor/patch), `npm audit --omit=dev`, `gitleaks`, CodeQL, Actions pinned by SHA, branch protection, CODEOWNERS, PR template, release-please.
6. Write `CLAUDE.md` (also usable as `AGENTS.md`): commands, architecture map, the Engineering standards table, a "do/don't" list, how to add a feature/component/migration. Keep `docs/` as the long-form source and link from it. Fix `README.md` structure (keep Portuguese content, add an English `CONTRIBUTING.md`).

## Phase 1: Test safety net (before upgrading or refactoring)

1. Playwright e2e for the critical journeys: create tournament (wizard), enter scores through to the finals and podium, share/invite link and live view, saved tournaments, profile, theme toggle, offline then reconnect score sync. Run against a local Supabase. Playwright does not depend on the Angular version, so it protects both the upgrade and the refactor. Set `forbidOnly` in CI and add axe checks per route.
2. The e2e suite is the characterization suite: it tests behavior through the UI, so it survives the refactor unchanged. Do not write unit tests against `AppComponent` internals, because Phase 4 would delete them. Add fixtures of today's persisted data (`setpoint.tournament.v1`, offline queue, shared snapshot) so the refactor proves it can still read them.
3. Record baselines in `docs/metrics.md`: coverage, `AppComponent` line count, bundle size, Lighthouse scores, files under the lint ratchet, and AI spend per phase (see Cost and execution strategy). Update the file in every phase PR.

## Phase 2: Upgrade Angular

**Status (2026-11-12): done except the leftovers below.** Angular 22 and TypeScript 6 (PRs #16, #17), schematics (#18), Vitest (#19), coverage thresholds and property tests (#20, #21). Leftovers, recorded in `docs/metrics.md` under "Phase 2 result": `@testing-library/angular` (add with the first component test), 8 `@Input()`s still not signals, zoneless evaluation (after Phase 4), coverage floors only on `core/` (about 55%, raise as code moves), three specs that read source files by path.

- Step through majors with `ng update` (20 to 21 to 22), one PR or commit per major, with e2e green after each. Update supabase-js and posthog-js.
- Move unit/component tests to Vitest with the Angular unit-test builder (the default runner from Angular 21) plus `@testing-library/angular`. Convert or wrap the 18 `tests/*.test.cjs` files; keep the PGlite SQL tests in `test:db`. Coverage thresholds start at the measured baseline for `core/`, then ratchet up; new code must be covered.
- Run the Angular migration schematics instead of rewriting by hand, one commit each, e2e green after each: `@angular/core:control-flow` (`@if`/`@for`), `@angular/core:inject`, `@angular/core:signal-input-migration`, `@angular/core:output-migration`, `@angular/core:signal-queries-migration`, `@angular/core:self-closing-tag`. A model only fixes what a schematic reports it could not migrate.
- Add `fast-check` property tests for the existing pure logic (schedule, shuffle, qualification, scenario engine) while converting it to Vitest (#23).
- Evaluate zoneless (`provideZonelessChangeDetection`) after Phase 4, once state is signal-based. Drop zone.js only if all tests and e2e pass.

## Phase 3: Security hardening

**Status (2026-11-12): done in one PR.** Steps 1 to 5 delivered; results in `docs/metrics.md` and `docs/security.md`. Left for later (listed in `docs/security.md`): real security headers after the hosting decision, deploying migrations from CI, hosted Auth settings review, URL/invite/import parsers wired in Phase 4.

1. CSP: as a `<meta http-equiv>` in `src/index.html` if the app stays on GitHub Pages, or as real headers if hosting moves (see Decisions). Restrict `script-src`, `connect-src` (Supabase, PostHog), `style-src`, `font-src`, `img-src`. Self-host Google Fonts (also a performance win). Add `referrer` and `permissions` policies.
2. Supabase: add the Supabase CLI and `supabase/config.toml`; keep migrations in `supabase/migrations/`. CI starts a local Supabase (free, no paid branching), applies all migrations from empty, and runs `squawk`, `splinter` + `supabase db lint` (#11), the PGlite tests, `supabase test db` (pgTAP) and the generated-types drift check (#8). Replace the hand-written row interfaces with generated types, used only inside the Supabase adapter (Vendor independence, pattern 3). Add the `app.current_user_id()` helper migration (#25). Stop manual SQL-Editor application.
3. RLS and RPC audit of all 14 migrations: every table has RLS enabled with explicit policies; every `SECURITY DEFINER` function sets `search_path` and validates its inputs and ownership; invite tokens and admin-only RPCs get negative tests (anonymous user cannot read or write other tournaments or dashboard data). Record findings in `docs/security.md`.
   - Write the permission and negative tests in pgTAP against the real local Supabase stack, not in PGlite. Each of the 6 PGlite test files hand-rolls its own fake `anon`/`authenticated` roles, `auth.uid()` and `auth.users`, which can pass while the real Supabase grants and JWT claims behave differently. All 14 migrations depend on `auth.uid()`.
   - Keep PGlite for fast SQL-logic tests without Docker, but move the duplicated fake-auth setup into one shared helper.
4. Review anonymous-auth abuse paths (rate limits, quotas on archives and avatars), the magic-link dashboard allowlist, and PostHog privacy (enums/counts only, already documented).
5. Input validation at system boundaries with Valibot parsers (#7): build the parsers in `shared/parsers` (query params, invite codes, imported/shared payloads, stored data) and use them in the core services (`storage`, `supabase`). Wiring them into each feature happens during its Phase 4 extraction, so `AppComponent` code is not edited only to be moved again.

## Phase 4: Architecture refactor (strangler approach)

Target structure:

```
src/app/
  core/
    ports/     # vendor-neutral interfaces + InjectionTokens; ports/testing/ holds fakes and contract suites
    adapters/  # supabase/  posthog/  browser/ (storage, clock, random)  dialog/  tour/  (only place vendor SDKs are imported)
               # plus error handling and config; app.config.ts binds ports to adapters
  domain/      # framework-free logic: state machines, schedule, qualification, scenario engine, offline queue
  shared/      # pure utils, models, parsers, pipes
  ui/          # design-system components (Phase 5)
  features/
    landing/  setup/  tournament/  live/  dashboard/  profile/  library/
      <feature>.routes.ts, pages/, components/, data/ (signal store + services), README.md
  app.routes.ts, app.config.ts, app.component.ts (shell only)
```

1. Add `provideRouter` with lazy `loadComponent`/`loadChildren` routes using the decided URL scheme, replacing the query-param/path checks (`invite`, `live`, `dashboardTournament`, `isDashboardPath`), with legacy-URL redirects so existing shared links still work. Handle the 404 fallback and base-href for the chosen host. Ship the router cutover behind a feature flag.
2. Before extracting features, add the minimal tokens file and the three most repeated components (Button, Card, Dialog on `@angular/cdk/dialog`) so extracted features use them from the start. In separate PRs before the pilot (one per vendor group), define the ports and their contract suites, split `SupabaseService` and the PostHog services into adapters behind them, and remove the Supabase `User` type from `AppComponent` (see Vendor independence). Features are then extracted onto ports from the first PR, so no extraction is redone.
3. Pilot first: extract the live viewer, because it is isolated but exercises every pattern (route with a legacy redirect, realtime subscription and cleanup, parser, signal store, translation keys, `ui/` components). Review it in depth (Opus-class review of the diff plus a human pass), then turn it into the "new feature" template and the reference in `features/README.md`. Moved forward from Phase 8 so the other six extractions copy a reviewed pattern.
4. Extract the rest from `AppComponent` one feature per PR, following the template (landing, setup wizard, tournament views, dashboard, profile, library). When an extraction meets a repeated UI pattern, build the `ui/` component then instead of copying markup, so no feature is restyled twice. Each feature gets a signal store (`signal`/`computed`/`effect`, `inject()`), translation keys instead of raw strings, and parsers at its boundaries. Move `state-machines.ts`, `offline-sync-queue.ts` and the pure services into `domain/`, with `Clock`/`Random` injected. Each extraction widens the lint ratchet glob.
5. Add persisted-data migrators (v1 to current) before any change to the stored shape (#9).
6. Replace template-driven `[(ngModel)]` forms with typed Reactive Forms and shared validators; replace `setTimeout`/`setInterval` with rxjs or `effect` cleanup (#6).
7. Use `@defer` for heavy views (dashboard, report/share-card), and `NgOptimizedImage` for images.
8. End state: `AppComponent` is a thin shell under ~100 lines, and every rule in Engineering standards applies to all of `src/app` with no scoped exceptions left.

## Phase 5: Design system

1. Tokens: color, spacing (4/8 grid), radius, typography, elevation, motion, as CSS custom properties in one `tokens.css` with light/dark themes. Remove the duplicate `:root` blocks and hardcoded hex; turn on the Stylelint strict-value rules (#16) for all files.
2. Complete the component set in `src/app/ui/` (standalone, OnPush, signal inputs/outputs). Most are already built during Phase 4; this step fills the gaps and makes the API consistent across: Button (variants/sizes), Card, CardKicker/SectionHeading, FormField, TextInput, Toggle, NumberRange, ChoiceCards, Badge/Chip, Alert, Modal/Dialog (replacing ad-hoc modals and all SweetAlert2 usage), Icon (one SVG registry), Avatar, Stepper, Tabs, EmptyState, Skeleton. Move the existing 13 `features/` presentational components into `ui/` or into their feature as appropriate.
3. Layout primitives: Stack, Cluster, Grid, PageContainer, using the responsive breakpoints.
4. Living docs for `ui/`: the dev-only `/_ui` gallery route (every component, variant, state and theme), with Playwright screenshot and axe tests run against it. Start with the one-hour Storybook spike from Decisions; switch only if its condition is met. Component tests in Vitest. Playwright screenshot tests for key pages in light and dark themes, to catch visual regressions from CSS changes. Split `styles.css` into tokens, base/reset and per-component styles; only global CSS stays global.
5. Accessibility baseline: visible `:focus-visible` rings, skip link, route-change focus management and title updates, landmark roles, contrast checks, `prefers-reduced-motion`, axe checks in Playwright.

## Phase 6: i18n (pt-BR + en)

- Library: Transloco (see Decisions), set up with pt-BR before Phase 4.
- Because Phase 4 already extracts strings into pt-BR keys, this phase adds `en`, a language switcher (persisted through `core/storage`), locale-aware date/number formatting, the missing-key CI check and the raw-text check (#14).
- Use `transloco-keys-manager` for key extraction and the missing/unused-key check instead of a custom script; only the raw-text template check stays custom.
- A cheaper model drafts the `en` file in one pass with a glossary of beach-tennis terms. A person reviews the user-facing flows (setup, scoring, share) before release.

## Phase 7: Performance and observability

- Measure first: Lighthouse CI budget in CI (LCP/INP/CLS, bundle size), `source-map-explorer`/`ng build --stats-json`. Track Web Vitals through the existing PostHog setup, tagged by release.
- Tighten the bundle budgets as lazy routes land (the current initial budget of 1.5 MB warning / 2 MB error is loose). Self-hosted, subsetted fonts with `font-display: swap`. Preload critical assets. Consider a service worker (`@angular/service-worker`) for offline support, given the existing offline sync queue; if added, it needs an update prompt so users do not stay on an old version.
- Post-deploy smoke test and per-release error-rate comparison (Release and delivery, step 6).

## Phase 8: AI and developer experience

- `CLAUDE.md`/`AGENTS.md` (Phase 0) kept current through the Definition of Done; per-area short READMEs (`features/*/README.md`, `ui/README.md`) describing the pattern and an example.
- Consistent naming and file layout, explicit types, barrel exports only at `ui/` and `domain/` boundaries. The ADRs already exist from the working rules.
- The "new feature" template already exists from the Phase 4 pilot. Add the same for "new UI component" and "new migration", so the pattern is copy-paste and passes every check in Engineering standards on first run.
- Put short `CLAUDE.md` files in `features/`, `ui/`, `domain/` and `supabase/` with that area's rules. They load only when an agent works in that folder, so the root `CLAUDE.md` stays small.
- Document the data model and the state machines (extend `docs/state-machines.md`), plus a diagram of the architecture.

## Branding: new app name and domain (decision pending)

The app starts in Brazil (pt-BR) but "Setpoint" is an English term, hard to spell for casual players and a common word. Candidates below are suggestions only. **Availability of every name and domain is unverified**: check Registro.br, the `.app` registry and INPI (trademark) before choosing.

| #   | Name           | Why it works                                                                                                                                                                          | Domain ideas                                            |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | **Bora Jogar** | "Bora" is everyday Brazilian slang for "let's go". Friendly, says what the app is for, easy to say out loud.                                                                          | `borajogar.com.br`, `borajogar.app`                     |
| 2   | **Rachão**     | Brazilian word for a casual pickup game with friends, which matches rotating-partner beach tennis. Strong local identity.                                                             | `rachao.app`, `rachao.com.br` (no accent in the domain) |
| 3   | **Saquei**     | Pun on _saque_ (the serve) and "saquei" ("got it"). Short, playful, 3 syllables.                                                                                                      | `saquei.app`, `saquei.com.br`                           |
| 4   | **Duplou**     | From _dupla_ (pair), as a verb, since the app is built around pairs and draws. Unusual, so easy to own.                                                                               | `duplou.app`, `duplou.com.br`                           |
| 5   | **Areia**      | "Sand": short, one word, evokes beach tennis, pronounced the same by every Brazilian. May be too generic to register, so a tagline helps (e.g. "Areia, seu torneio de beach tennis"). | `areia.app`, `jogaareia.com.br`                         |

Domain guidelines so people remember it:

- Pick a name that is spelled as it sounds, with no hyphens, numbers or accents, and that passes the "say it on the phone" test.
- Prefer `.com.br` for trust and local search in Brazil, plus `.app` (HTTPS enforced, short). Register both and redirect one to the other. A `.com` is optional, only if cheap.
- Short, memorable share links, for example `<domain>/t/ABC123` for invites and `<domain>/ao-vivo/ABC123` for the live view, so people can type them from a screen or a WhatsApp message. These paths are part of the URL-scheme decision before Phase 4, so the router does not change twice.
- A custom domain on GitHub Pages also removes the `/setpoint-beach-tennis/` base-href, and putting it behind Cloudflare would allow real security headers (see Phase 3 CSP).
- Keep legacy `github.io` links working with a redirect so existing shared invite and live links do not break.
- Renaming touches: `<title>` and meta tags, `README.md`, `docs/`, `CLAUDE.md`, i18n strings, PostHog project/app name, Supabase project display name, share-card and report text, and the repo name. Do it as one small PR after Phase 4, so the new name lives in one place (a `branding` config constant) instead of scattered strings.

## Critical files

- `src/app/app.component.ts`, `src/app/app.component.html`: decomposed in Phase 4.
- `src/styles.css`: split into tokens/base/component styles in Phase 5.
- `src/app/core/*` (`supabase.service.ts`, `storage.service.ts`, `state-machines.ts`, `offline-sync-queue.ts`, `models.ts`): kept as the domain/infrastructure layer, reused (pure logic moves to `domain/`).
- `src/main.ts`, `src/index.html`, `angular.json`, `tsconfig.json`, `package.json`.
- `.github/workflows/deploy.yml` (+ new `ci.yml`), `supabase/migrations/*.sql`, `tests/*.test.cjs`.

## Verification

- `npm run check` passes locally and in CI (lint, stylelint, format, typecheck, knip, unit/component tests with coverage thresholds, build within budgets).
- Every row in Engineering standards has its check running in CI, and by the end of Phase 4 none is scoped to a subset of `src/app`.
- No vendor SDK or vendor type is imported outside `core/adapters/`; every port's fake and real adapter pass the same contract suite; `docs/vendors.md` lists an export path and swap effort for each vendor.
- Playwright e2e covers the critical journeys and passes before and after each refactor phase, so behavior is unchanged.
- Legacy shared links (`?invite=`, `?live=`, `/dashboard`) still resolve after the router migration, and v1 persisted-data fixtures still load.
- Supabase: PGlite, security-invariant and negative-permission tests pass; migrations apply cleanly from empty via the CLI; generated types match the schema.
- A release can be rolled back by redeploying the previous tag, tested once on purpose.
- `docs/metrics.md` shows each phase moved the baselines in the right direction.
- Manual: run `ng serve`, check light/dark themes, keyboard-only navigation, a screen-reader pass on setup and tournament flows, offline then reconnect score sync, Lighthouse (performance, a11y, best practices) scores recorded as a baseline and not regressing.
