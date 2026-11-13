# ADR 0005: Keep today's URL shapes until hosting moves

- Status: Accepted
- Date: 2026-11-13 (replaces the proposal of the same day for `/t/:token`, `/ao-vivo/:token` and `/painel`)

## Context

The app reads the URL by hand in `AppComponent`: `?invite=<token>` (shared tournament guest), `?live=<token>` (local tournament live viewer), `/dashboard` (admin dashboard) and `?dashboardTournament=<id>&source=shared|local` (dashboard tournament viewer). Links with these shapes are already shared in WhatsApp messages. Phase 4 introduces the Angular Router.

The first proposal moved the tokens into paths (`/t/:token`, `/ao-vivo/:token`, `/painel`). On GitHub Pages (ADR 0006) every unknown path is served through `404.html`, so those links would answer with HTTP 404 and the app in the body. Browsers render that, but link-preview fetchers (WhatsApp is the main sharing channel) may reject it. That was not tested.

## Decision

Keep the current shapes. The router is built around them: routes read `invite`, `live`, `dashboardTournament` and `source` from the query string, and `/dashboard` stays a path (it already relies on the 404 fallback and is not shared as a preview link). No legacy redirects are needed because nothing is renamed.

Moving to path-based URLs (`/t/:token`, `/ao-vivo/:token`, `/painel`) is deferred to the hosting re-evaluation in ADR 0006. At that point a new ADR supersedes this one and adds the legacy redirects (`?invite=X` to `/t/X`, and so on).

## Consequences

- No link already shared breaks, and there is nothing to test against WhatsApp previews now.
- The router must keep `?code=` and `#access_token=` (Supabase email login return) intact. A test covers this before the router cutover.
- The router cutover still ships behind a feature flag.
- Path tokens, and the PostHog masking they would need, are not introduced yet. The `invite` query property is masked today and stays so.
- Shorter, typeable share links remain a branding-step item.

## Update 2026-11-13: the router

The Angular Router now exists behind the `routerEnabled` runtime flag (default off; `docs/releasing.md`, "Router flag"). It reads exactly the shapes above: the route table is `/`, `/dashboard` (a custom matcher so a trailing slash still works, as before) and an unknown path that opens the root. There are no components on the routes yet: the page content still lives in `AppComponent`, and the router only keeps the address, so nothing changes for users. `UrlState` (`src/app/core/routing`) is the app's view of its address, implemented by the original code (`LegacyUrlState`) and by the router (`RouterUrlState`); the URL contract e2e runs against both.

Two facts found while doing it: nothing in the app navigates to `/dashboard` in-app (the dashboard is reached only by URL or the e-mail link), so the back and forward handling between `/` and `/dashboard` is effectively unused; and the router's blocking initial navigation resolves before it commits the URL, so `RouterUrlState` reads the address from the in-flight navigation at startup.

## Update 2026-11-13: the first feature renders with `@defer`, before routes

The shared view (`?live=`, `?invite=`, `?dashboardTournament=&source=`) moved out of `AppComponent` into `src/app/features/shared-view/`. It is rendered from `AppComponent`'s `@case ('shared')` inside `@defer (on immediate)`, in both router modes, and not from a route with `loadComponent`. The reasons: the router is still behind its flag (default off), so a route-only feature would need a second code path for the original URL handling; `@defer` already makes the feature its own lazy chunk; and the URL shapes above do not change, so nothing about the address depends on how the page is rendered. When the router becomes the default, the follow-up moves the page to a route and deletes the `@defer`; the feature itself does not change (`src/app/features/README.md`).
