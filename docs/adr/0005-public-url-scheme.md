# ADR 0005: Public URL scheme and legacy redirects

- Status: Accepted
- Date: 2026-11-13

## Context

Today the app reads the URL by hand in `AppComponent`: `?invite=<token>` (shared tournament guest), `?live=<token>` (local tournament live viewer), `/dashboard` (admin dashboard) and `?dashboardTournament=<id>&source=shared|local` (dashboard tournament viewer). Links with these shapes are already shared in WhatsApp messages and saved elsewhere, so they must keep working. Phase 4 introduces the Angular Router, and the router should be built once with the final paths.

## Decision

Final paths, relative to the app base:

| Path                                               | Purpose                                           |
| -------------------------------------------------- | ------------------------------------------------- |
| `/`                                                | Landing, setup and the user's own tournament      |
| `/t/:token`                                        | Shared tournament invite (guest joins or watches) |
| `/ao-vivo/:token`                                  | Live viewer of a local tournament                 |
| `/painel`                                          | Admin dashboard                                   |
| `/painel/torneio/:id` with `?source=shared\|local` | Dashboard view of one tournament                  |

Legacy URLs are redirected by the router, keeping the token: `?invite=X` to `/t/X`, `?live=X` to `/ao-vivo/X`, `/dashboard` to `/painel`, `?dashboardTournament=X&source=Y` to `/painel/torneio/X?source=Y`. The redirects stay for as long as links already shared may be in use, and are removed only by a later ADR.

The router cutover ships behind a feature flag, so the old parsing can be restored without a revert while the new routes are proven by e2e.

## Consequences

- The token moves from the query string to the path. PostHog masks the `invite` query property today; the path forms need the same masking (capture a templated path such as `/t/:token`, never the real one) and a test, in the same PR that adds the route.
- The `Referrer-Policy` is `strict-origin-when-cross-origin` (`src/index.html`), so a path token is sent only to the same origin, never to other sites. This is the same exposure the query-string token has today.
- Token format and length do not change here. Shorter share codes are a separate decision (branding section of the plan).
- The e2e suite uses both the legacy and the new forms, so the redirects are tested.
