# Vendors and how to replace them

Each vendor sits behind ports (ADR 0003). To replace one: write an adapter folder that passes the existing contract suites in `src/app/core/ports/testing/`, then change its provider line in `src/app/app.config.ts`. No feature, store or domain code changes.

| Vendor                                                                                        | Ports it implements                                                                                                           | Adapter folder            | Status                                                             |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| Supabase                                                                                      | `AuthPort`, `SharedTournamentRepository`, `LocalLiveRepository`, `TournamentFeed`, `ArchiveRepository`, `DashboardRepository` | `core/adapters/supabase/` | Done (Phase 4, step 2)                                             |
| PostHog                                                                                       | `AnalyticsPort`, `ErrorReporter`, `SurveyPort`                                                                                | `core/adapters/posthog/`  | Done (Phase 4, step 2)                                             |
| SweetAlert2                                                                                   | `DialogService` (the app's own API, no port needed)                                                                           | removed                   | Replaced by `ui/dialog` on `@angular/cdk/dialog` (Phase 4, step 4) |
| driver.js                                                                                     | `GuidedTour` (not defined yet)                                                                                                | none yet                  | Still imported by `app.component.ts`                               |
| padel score engine                                                                            | `ScoringRules` (not defined yet)                                                                                              | none yet                  | Still imported by `final-live-score.ts`                            |
| Browser (`localStorage`, `sessionStorage`, time, `Math.random`/`crypto`, `runtime-config.js`) | `KeyValueStore` (`LOCAL_STORE`, `SESSION_STORE`), `Clock`, `Random`, `AppConfig`                                              | `core/adapters/browser/`  | Done (Phase 4, step 3)                                             |

## Lock-in and data export

- **Supabase.** Business rules are plain Postgres functions and RLS policies, so they run on any Postgres host. Tied to Supabase: anonymous and email-link auth (users are `auth.users` rows), the realtime broadcast channels used by `TournamentFeed`, and `auth.uid()` (new SQL uses `app.current_user_id()` instead). Export: `pg_dump` of the `public` schema; auth users need a separate export.
- **PostHog.** Events are enums, counts and flags only (`docs/analytics.md`), so history is low-risk to lose. Export: PostHog's event export. A second vendor can run in parallel by composing a second `AnalyticsPort` implementation.

Rough swap effort once the remaining ports exist: analytics about a day (one adapter, contract already written); backend several days (six adapters plus a data migration), mostly in re-implementing realtime and anonymous auth.
