# Releasing

This is the release and rollback procedure. The design (gates, order of deploy, compatibility rules) is in [professionalization-plan.md](professionalization-plan.md), section "Release and delivery".

## Normal release

1. Open a PR. Its title is a Conventional Commit. CI must be green (PR title, quality, build).
2. Merge to `main` (squash). The `Deploy Angular to GitHub Pages` workflow runs the CI checks again, then builds and deploys.
3. The build fails if `SUPABASE_URL` or `SUPABASE_PUBLISHABLE_KEY` is missing (`scripts/generate-runtime-config.cjs --require-values`).
4. Check the PostHog error rate for the new build against the previous one.

## Database changes

Apply migrations before the frontend that needs them. Keep the previous release working: add new columns and functions first, remove old ones only in a later release (expand, then contract). Migrations already on `main` are never edited.

Apply with the Supabase CLI: `npx supabase link --project-ref <ref>` once, then `npx supabase db push`. Run `npm run db:start` and `npm run db:reset` first to prove the migrations apply from empty. CI does this on every PR (job `database`): migration rules, squawk, splinter lints, pgTAP permission tests and the generated-types check. Deploying migrations from CI needs a Supabase access token and the database password as repository secrets; until they are set, a maintainer runs `db push` before merging.

## Rollback

1. Find the previous good commit on `main`.
2. Create a branch that points to that commit and run the `Deploy Angular to GitHub Pages` workflow on it with `workflow_dispatch`.
3. Do not roll back a migration that drops or renames things; the expand-first rule keeps the previous frontend working against the current database.

Rollback is rehearsed once on purpose before Phase 4 (see the plan, Verification).
