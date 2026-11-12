# State machines in SETPOINT

Most of the app's behaviour is a state machine that was never written down. This page lists
each one, where it lives, and whether it is **explicit** (a typed, tested module) or still
**implicit** (flags in `app.component.ts`). Read it before changing lifecycle code.

Rule of thumb: derive state from data (`TournamentState`) instead of storing a second flag that can drift.

## Explicit (pure, tested)

| Machine                         | Where                                                      | States → transitions                                                                                                                                                                                                                                                                            |
| ------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tournament phase                | `core/state-machines.ts` `tournamentPhase()`               | `setup → registration → ready → qualifying → finals → finished`. Local tournaments go `setup → qualifying`. `finished` is terminal. Derived from `rounds`, `finals`, `finishedAt`, `sharedStatus`; never stored.                                                                                |
| Sync status                     | `core/state-machines.ts` `syncStatus()`                    | First match wins: `device-only`, `error`, `offline`, `paused`, `syncing`, `pending`, `synced`. Labels in `SYNC_STATUS_LABEL`.                                                                                                                                                                   |
| Offline sync record             | `core/offline-sync-queue.ts`                               | `base` / `pending` / `revision`. `stage` bumps the revision; `acknowledge` clears `pending` only if the revision still matches (an edit made mid-upload is never lost).                                                                                                                         |
| Library entry (device history)  | `core/tournament-library.ts`                               | Saved on every change once a schedule exists. `archivePending` is true until the full state is uploaded; `markArchived(id, updatedAt)` is a no-op if the entry changed meanwhile; `requeue` forces a resend.                                                                                    |
| Scenario engine ("Seu caminho") | `core/scenario-engine.ts`, `core/qualification.service.ts` | Pure function of wins + open matches. Per goal: `alive → clinched` or `alive → eliminated` (never back). Exact up to 18 open matches (Gray-code walk of every future), seeded simulation beyond; clinched/eliminated then come from sound bounds only. Results are cached by the played scores. |
| Final live score                | `core/final-live-score.ts`                                 | Pure point-by-point reducer (deuce at 40–40, tie-break at 6–6).                                                                                                                                                                                                                                 |
| Shared tournament status        | `supabase/migrations/*`, type `SharedTournamentStatus`     | `registration → ready → active → completed`; any state may become `archived` (cancel or 24 h inactivity).                                                                                                                                                                                       |
| Local live link status          | `local_live_tournaments.status`                            | `active → completed`; `active/completed → archived` after 24 h without updates. Archived never reopens (trigger).                                                                                                                                                                               |

## Implicit (documented, intentionally not rewritten)

These work and are covered by manual use. Rewriting them has no user benefit and risks regressions.
If you touch one, make it explicit first and add a test.

| Machine                                | Where in `app.component.ts`                                                                                    | Notes                                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry mode                             | constructor: `isDashboardRoute`, `isDashboardViewer`, `isLiveViewer`, `isGuestView`, `isLocked`, `showLanding` | Derived once from the URL (`?invite`, `?live`, `?dashboardTournament`, `/dashboard`). Priority: dashboard viewer > live viewer > guest > moderator. |
| Page                                   | `page`, `setPage()`, `restorePageFromPath()`                                                                   | `setup` until a schedule exists; then `overview/players/rounds/ranking/settings`. `dashboard` is a route.                                           |
| Setup wizard                           | `setupStep` 1→2→3                                                                                              | Step 3 generates the schedule, which moves the tournament phase to `qualifying`.                                                                    |
| Moderator session                      | `isSharedModerator`, `sharedSnapshot`, `sharedInviteToken`                                                     | Restored in `restoreSharedFlow()` from the owned server copy.                                                                                       |
| Local live link                        | `localLive*` fields                                                                                            | Absent → published (tokens in `localStorage` under `setpoint.local.live.<analyticsId>`) → cleared on reset.                                         |
| Dashboard auth/loading                 | `dashboardAuthenticated`, `dashboardLoading`, `dashboardMagicLinkSent`                                         | Driven by Supabase `onAuthStateChange`.                                                                                                             |
| Tie draw / share preview / batch modal | `tieDrawModalOpen`, `sharePreviewOpen`, `batchModalOpen`, `libraryModalOpen`                                   | Independent open/closed flags.                                                                                                                      |

## Persistence map (who keeps what)

| Store                       | Key / table                                                       | Lifetime                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Active tournament           | `localStorage` `setpoint.tournament.v1`                           | Replaced by "new tournament"; a finished one is cleared on a new app version, **after** being copied to the library.                        |
| **Library (Meus torneios)** | `setpoint.library.v1` + `setpoint.library.v1.state.<id>`          | Up to 30 tournaments, oldest evicted first (also on a full browser quota). Photos are not kept. Opening one makes it the active tournament. |
| Cloud archive               | `local_tournament_archives` (RPC `save_local_tournament_archive`) | Full state of every started local tournament, no photos. Never expires. Admins read it from the dashboard.                                  |
| Shared tournaments          | `shared_tournaments`                                              | Server owned; archived after 24 h idle.                                                                                                     |
| Live link mirror            | `local_live_tournaments`                                          | Public read-only mirror; archived after 24 h idle.                                                                                          |
| Metrics                     | `local_tournament_metrics`                                        | Aggregate counters only.                                                                                                                    |

Upload rule: only `hosting === 'local'` library entries are queued for the cloud archive
(shared tournaments already live on the server). The queue is retried on launch, on reconnect and after each change.

## Testing

`npm test` runs `node --test tests/*.test.cjs`. Pure modules are loaded with `tests/helpers-ts.cjs`;
SQL is exercised against PGlite. Add a test next to any new transition.
