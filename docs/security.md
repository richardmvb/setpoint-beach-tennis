# Security

Findings and rules from the Phase 3 hardening (2026-11-12). The checks run in CI on every PR (job `database` in `.github/workflows/ci.yml`, the e2e job for the CSP).

## Threat model in one paragraph

The browser holds only the Supabase publishable key. Everything is protected by Postgres: tables have RLS on and **no grants and no direct policies**, so all reads and writes go through `SECURITY DEFINER` RPCs that check `auth.uid()` and ownership. Anyone can get an anonymous session (that is how organizers and guests start without an account). Spectators and guests hold a secret token (invite, read or write token, 64 hex characters, stored hashed). The dashboard is limited to users listed in `setpoint_dashboard_admins`.

## Audit of the 14 migrations

Method: applied all migrations from empty on the local Supabase stack and queried the catalog (RLS, policies, grants, `search_path`), then ran Supabase's splinter lints and negative tests.

| #   | Finding                                                                                                                                                                                                                                                                                                                       | Severity | Status                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 15 RPCs meant for signed-in users were executable by the `anon` role. Earlier migrations ran `revoke ... from public`, but Supabase grants `EXECUTE` to `anon` and `authenticated` through default privileges. Each function stopped anon calls only with an `auth.uid()` check inside, one line away from being exploitable. | Medium   | Fixed in `202611120001`: explicit `revoke ... from anon`. Test pins the exact set of functions anon can run.                                     |
| 2   | Future functions would be public again by default.                                                                                                                                                                                                                                                                            | Medium   | Fixed: default privileges revoke `EXECUTE` from `public`, `anon`, `authenticated`; every grant is now a deliberate act.                          |
| 3   | 6 tables had RLS on but no policy (deny by omission). Correct, but invisible, and the "every table has a policy" invariant could not be checked.                                                                                                                                                                              | Low      | Fixed: restrictive `deny_direct_access` policy on every table. All access stays through RPCs.                                                    |
| 4   | No limit on how many rows one session can own. A single anonymous session could store unbounded 0.5 to 1 MB states.                                                                                                                                                                                                           | Medium   | Fixed: per-owner quota triggers (100 shared, 100 live, 200 archives, 500 metrics). Error `quota_exceeded`.                                       |
| 5   | All 31 `SECURITY DEFINER` functions set `search_path`; all inputs are length- and type-checked (state ≤ 500 KB, avatar ≤ 12 KB WebP data URL, names ≤ 40/60 chars, capacity in a fixed set).                                                                                                                                  | -        | No change. Now enforced by a pgTAP test.                                                                                                         |
| 6   | Owner-only RPCs check ownership (`moderator_only`); admin RPCs check the admin table (`dashboard_admin_required`); token RPCs reject malformed tokens before touching data.                                                                                                                                                   | -        | No change. Negative tests: user B cannot rotate, cancel, read, or add participants to user A's tournament; non-admins cannot read the dashboard. |
| 7   | splinter reports `*_security_definer_function_executable` WARNs (by design: this app is RPC-only) and INFO lints for unindexed owner foreign keys and one unused index.                                                                                                                                                       | Info     | WARN lints are allowed only for these two names; the exact callable set is pinned in pgTAP. Index lints are printed, not enforced.               |

Not found: tables readable by `anon`/`authenticated`, a `SECURITY DEFINER` function without `search_path`, `PUBLIC` execute on any function.

## What CI enforces (database job)

- Migrations apply from empty on a local Supabase stack.
- `scripts/check-migrations.cjs`: a migration already on the base branch is never changed; new migrations use `app.current_user_id()` instead of `auth.uid()`/`auth.jwt()`.
- `squawk` on added migrations (lock and timeout safety).
- `scripts/db-lint.cjs`: splinter (`supabase/lint/splinter.sql`, copied from the supabase/splinter repo; refresh it when upgrading the Supabase CLI) and `supabase db lint`. Any ERROR fails; a WARN fails unless it is one of the two design lints above.
- `supabase test db`: `supabase/tests/security.test.sql` (pgTAP) on the real roles, grants and JWT claims.
- Generated types (`src/app/core/database.types.ts`) match the schema.

## Content-Security-Policy

Set as a `<meta>` in `src/index.html` (GitHub Pages cannot send headers). Scripts: the app and `*.i.posthog.com` (PostHog loads surveys and recorder code from its asset host). Connections: the app, `*.supabase.co` (HTTPS and WSS), `*.i.posthog.com`. Fonts are self-hosted; no inline scripts (critical-CSS inlining is off because it injects one). `style-src` allows `'unsafe-inline'` because SweetAlert2 and driver.js set inline styles; this goes away with the Phase 5 dialog work. `scripts/generate-runtime-config.cjs` fails the build if `SUPABASE_URL` or `NG_APP_POSTHOG_HOST` is outside the allowed hosts, and every e2e test fails on a CSP violation.

Limits of a meta CSP: `frame-ancestors`, `report-to` and `Permissions-Policy` need real headers (clickjacking protection included). This depends on the hosting decision (Cloudflare Pages or Netlify) that the plan requires before Phase 4.

## Abuse review

- **Anonymous sign-ins:** limited per IP by Supabase Auth (`[auth.rate_limit]`, 30 per hour locally; verify the hosted value). Recommended in the hosted project: enable CAPTCHA for anonymous sign-ins if abuse appears.
- **Storage growth:** per-owner quotas (finding 4) plus the existing cleanup of expired and inactive tournaments.
- **Magic link:** the dashboard allowlist is `setpoint_dashboard_admins`; anyone can request a link, but without a row in that table every dashboard RPC raises `dashboard_admin_required`. Hosted settings to confirm: the email rate limit, and that redirect URLs only list the app.
- **PostHog privacy:** events carry enums and counts only (see `docs/analytics.md`); invite tokens are masked; URL hashes are not captured (they hold magic-link tokens).

## Input validation

`src/app/shared/parsers/` holds Valibot parsers for RPC responses (`rpc-responses.ts`) and JSON helpers (`json.ts`). `SupabaseService` no longer casts RPC results: a payload without the fields the app needs throws at the boundary. Parsers for URL parameters, invite codes and imported or shared payloads are wired in during each feature's Phase 4 extraction so that `AppComponent` is not edited only to be moved again.

## Follow-ups

- Real security headers and `frame-ancestors` after the hosting decision.
- Deploy migrations from CI (needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` secrets and a manual approval step).
- Hosted Auth settings review (rate limits, CAPTCHA, redirect URLs) in the Supabase dashboard (the hosted project was not checked from the repo).
- Index the `owner_id` foreign keys if the tables grow (splinter INFO).
