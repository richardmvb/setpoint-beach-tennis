## What and why

<!-- One or two sentences. Link the phase in docs/professionalization-plan.md when this is part of the plan. -->

## Definition of Done

- [ ] All CI checks are green (PR title, quality, build)
- [ ] Tests added for new behavior
- [ ] `CLAUDE.md` and the relevant `docs/` updated if a pattern or command changed
- [ ] No new runtime dependency, or an ADR in `docs/adr/` explains it
- [ ] Persisted data and database changes are backward compatible (old clients and stored data still work)
- [ ] No `eslint-disable`, `@ts-ignore`, skipped tests or baselines added to pass a gate
- [ ] Phase cost recorded in `docs/metrics.md` if this PR completes a phase
