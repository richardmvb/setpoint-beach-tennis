# Releasing

This is the release and rollback procedure. The design (gates, order of deploy, compatibility rules) is in [professionalization-plan.md](professionalization-plan.md), section "Release and delivery".

## Normal release

1. Open a PR. Its title is a Conventional Commit. CI must be green (PR title, quality, build).
2. Merge to `main` (squash). The `Deploy Angular to GitHub Pages` workflow runs the CI checks again, then builds and deploys.
3. The build fails if `SUPABASE_URL` or `SUPABASE_PUBLISHABLE_KEY` is missing (`scripts/generate-runtime-config.cjs --require-values`).
4. Check the PostHog error rate for the new build against the previous one.

## Database changes

Apply migrations before the frontend that needs them. Keep the previous release working: add new columns and functions first, remove old ones only in a later release (expand, then contract). Migrations already on `main` are never edited.

Apply with the Supabase CLI: `npx supabase link --project-ref <ref>` once, then `npx supabase db push`. Run `npm run db:start` and `npm run db:reset` first to prove the migrations apply from empty. CI does this on every PR (job `database`): migration rules, squawk, splinter lints, pgTAP permission tests and the generated-types check. Migrations are applied automatically when a PR merges to `main` (Supabase GitHub integration), so the `database` job must be a required check. Apply by hand (`db push`) only if the integration is off.

## Rollback

1. Find the previous good commit on `main`.
2. Create a branch that points to that commit and run the `Deploy Angular to GitHub Pages` workflow on it with `workflow_dispatch`.
3. Do not roll back a migration that drops or renames things; the expand-first rule keeps the previous frontend working against the current database.

Rollback is rehearsed once on purpose before Phase 4 (see the plan, Verification).

## Router flag

The Angular Router handles the app's address only when the runtime flag `routerEnabled` is on (ADR 0005). It is off by default, and with it off the router is never downloaded, so production behaves exactly as before.

**Turn it on:** GitHub, Settings, Secrets and variables, Actions, Variables: add `NG_APP_ROUTER_ENABLED` with the value `true`, then run the deploy workflow (Actions, "Deploy Angular to GitHub Pages", Run workflow). The flag is written into `runtime-config.js` at build time, so a deploy is required.

**Turn it off (rollback):** delete the variable or set it to `false`, run the deploy workflow again. No code revert is needed.

**Check after turning it on** (the real e-mail sign-in cannot run in CI):

1. Open `<site>/dashboard` and `<site>/dashboard/` (with the trailing slash): both show the admin sign-in. Open an unknown path such as `<site>/nowhere`: it opens the app.
2. Open an invite link (`?invite=`), a live link (`?live=`) and an admin link (`?dashboardTournament=...&source=...`): each opens as before.
3. Sign in on the dashboard with your authorized e-mail and follow the link in the message. The address must end up as `<site>/dashboard` with **no `#access_token=` or `?code=`** in it, and the dashboard must open. Check the browser history too: pressing Back must not land on an address with a token in it.
4. In the browser network tab, confirm a separate router script (about 73 kB) is downloaded only when the flag is on.

If any step fails, turn the flag off as above and tell the team which step.

The follow-up that makes the router the default (and deletes the original URL code) should wait until these checks have passed in production for a while.
