# Persisted-data fixtures

Data that earlier releases stored, kept so every later release proves it can still read it. Files are never edited: when a stored shape changes, add `v<N+1>.json` and keep the old ones. They are read by `e2e/stored-data.spec.ts`.

| Folder             | What it is                                     | Where it comes from                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tournament/`      | `setpoint.tournament.v1` (active tournament)   | Captured from the app (2026-11-12).                                                                                                                                                                                                                     |
| `offline-queue/`   | `setpoint.sync.local.<id>` record              | Captured from the app (2026-11-13): a score entered while offline, so `pending` differs from `base`.                                                                                                                                                    |
| `shared-snapshot/` | `get_shared_tournament` response (server JSON) | **Built, not captured**: the `tournament/v1` state reshaped as a shared tournament, wrapped in the envelope returned by `supabase/migrations/202610310001_shared_tournaments.sql`. Replace it with a real capture when the local Supabase stack is run. |

`tournament/v2.json` and `shared-snapshot/v2.json` (2026-11-18) are the Grupos 20 shape: 20 athletes in 4 groups of 5 (`groupSize`, `finalsPairing`) and a bracket with byes in progress. Built from the app's own services (seeded), not captured; `v1` is kept and still read.
