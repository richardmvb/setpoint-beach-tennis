# ADR 0003: Vendors (Supabase, PostHog, and others) behind ports and adapters

- Status: Accepted
- Date: 2026-11-11

## Context

The app depends directly on Supabase (auth, 23 RPCs, realtime channels), PostHog (events, identify, exceptions, surveys), SweetAlert2, driver.js and a padel score engine. `AppComponent` imports the Supabase `User` type. The team may need to replace any of these, and a direct dependency spreads the change across features.

## Decision

Each capability the app uses is a port: a small interface in `core/ports/`, written in the app's terms, with an Angular `InjectionToken`. Vendor code lives only in `core/adapters/<vendor>/`. Features, stores and domain code inject ports only. `app.config.ts` is the only place that binds ports to adapters.

Rules that make the boundary hold:

- Ports have business methods, never generic `rpc(name, args)` or `query(table)`.
- Vendor types, errors and handles stay inside the adapter. Adapters map to domain models through parsers and to a small app error type.
- Each port has one contract test suite that the fake and the real adapter both pass.
- New database migrations use an app helper (`app.current_user_id()`) instead of `auth.uid()` directly.
- A port exists only for a capability used today.

Phase 4 implements this (see the plan, Phase 4 step 2). Lint enforcement of the import boundary starts there, scoped to `core/adapters/**`.

## Consequences

- Swapping a vendor means one adapter folder, passing the existing contract suite, and one line in `app.config.ts`.
- Migrations can run old and new vendors side by side during a switch.
- Extra indirection in Phase 4. This cost is accepted and tracked in the cost log (about 120 extra turns).
- `docs/vendors.md` (Phase 4) records each vendor's data export path and swap effort.
