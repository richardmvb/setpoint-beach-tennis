# Contributing

Thank you for helping with SETPOINT. The product UI is in Brazilian Portuguese; code, commits and docs in this file are in English. The project guide for AI agents and developers is [CLAUDE.md](CLAUDE.md).

## Setup

```bash
nvm use            # Node 24 (see .nvmrc)
npm ci
npm start          # http://localhost:4200
```

The local runtime config (`public/runtime-config.js`) holds development values. Production values come from GitHub Actions variables (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and the optional PostHog and lock-screen variables).

## Before you open a pull request

```bash
npm run check
```

This runs lint, styles, formatting, typecheck, unused-code detection, the unit and database tests, and the production build. Individual scripts are listed in `package.json` and in [CLAUDE.md](CLAUDE.md).

Git hooks are installed by `npm ci` (`husky`):

- **pre-commit** runs `lint-staged` on the files you staged.
- **commit-msg** runs `commitlint`, so the message must follow Conventional Commits, for example `feat(setup): add group size validation`.

## Pull requests

- One PR per logical change. Phases of the plan are split into several PRs, see `docs/professionalization-plan.md`.
- The PR title must be a Conventional Commit. CI checks it, because we squash-merge.
- Fill in the Definition of Done checklist in the PR template.
- Never silence a check to get it green (no `eslint-disable`, `@ts-ignore`, skipped tests, or baselines). If a check cannot pass yet, say so in the PR and follow the ratchet rule in the plan.
- Database changes: add a new migration in `supabase/migrations/`. Never edit a migration that is already on `main`. Keep the previous release working (expand, then contract).
- Changes to stored data (localStorage keys, offline queue, shared snapshots) need a migrator from the old version and a fixture for it under `tests/fixtures/` (from Phase 4).

## Performance

Bundle budgets (`angular.json`: initial, anyScript, and one per named lazy chunk) and the Lighthouse thresholds (`lighthouserc.cjs`) are a ratchet: they only get stricter. When a change makes a number better, lower the limit in the same PR. A `bundle` budget whose chunk no longer exists measures 0 and passes, so when you rename or merge a lazy component, rename its budget too.

- `npm run analyze` shows what is inside each chunk (`dist/bundle-report.html`).
- `npm run perf:lighthouse` runs after a build and writes reports to `.lighthouseci/reports`. CI uploads them as an artifact.

## Releases

Merges to `main` run the CI checks, then deploy to GitHub Pages. Deploy stops if the Supabase settings are missing. Release and rollback steps: `docs/releasing.md`.

## Reporting security issues

Do not open a public issue for a security problem. Contact the maintainer directly.
