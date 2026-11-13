# Features

A feature is one screen or flow of the app, in its own folder, with no code in `AppComponent`. `shared-view/` (the live link, the invite and the admin viewer) is the reference: copy its shape when you extract the next one. The plan is Phase 4 of `docs/professionalization-plan.md`; the boundaries are in ADR 0003.

## Layout

```
features/<name>/
  <name>.component.ts|html      the page: OnPush, provides its store and its Transloco scope
  data/<name>.store.ts          the page's state (signals), provided by the page component
  data/<name>-source.ts         where the data comes from: one small object per mode, each wrapping a port
  data/*.ts                     pure helpers of the feature (error codes to keys, ...), each with a spec
  components/                   presentational children: inputs and outputs only
  <name>.fakes.ts               every port the feature uses, bound to the in-memory fakes, for its specs
public/i18n/<name>/pt-BR.json   all of the feature's text
```

Code two features share lives in `features/<shared-folder>/` (today `features/tournament/`: the player-matches and share-results dialogs, and the projection), logic with no Angular in `domain/`, and capabilities in `core/` behind a port.

## The store

- `@Injectable()` without `providedIn`, listed in the page's `providers`. It lives and dies with the page, so nothing it starts outlives it: intervals use `takeUntilDestroyed`, and every function a port returns to stop something (a realtime watch) is called from `DestroyRef.onDestroy`.
- State is signals; what the template shows is `computed` from them, using `domain/` for anything derived from the tournament. A computed that must keep its identity when its data did not change (the podium, so it does not re-animate on every poll) depends on a key, not on the whole state.
- Inject ports (`SHARED_TOURNAMENTS`, `TOURNAMENT_FEED`, `CLOCK`, `LOCAL_STORE`, `URL_STATE`, ...), never vendor SDKs or browser globals (ESLint enforces it). Read the address once, from `URL_STATE.snapshot()`.
- Methods are the actions the page offers. DOM work (scrolling, focus) stays in the component; the store returns what the component needs to do it (`showMain()` says whether to scroll without animation).
- Errors are data: `{ key, detail? }`, where `key` is a typed union and the template switches on it with literal translation keys.

### A store that follows the session

`dashboard/` shows the other common shape: a page gated by sign-in. Its store subscribes to `AUTH.onAuthStateChange` (and stops through `DestroyRef`) and reads `AUTH.currentUser()` once at start; `AppComponent` still finishes a sign-in return in its startup, and the store hears the resulting `signed-in` change. A page that leaves for another route emits an output (`back`) and `AppComponent` navigates.

## Sources on ports

When one page has several modes (invite, live link, admin), each mode is a source object built from a port: `inviteSource(SHARED_TOURNAMENTS, TOURNAMENT_FEED, token)`. A source reads only what its own mode owns (its token comes from the URL and nowhere else) and says when its data can still change (`isOpen`), so the store stops polling and watching a finished tournament. The store picks one source at start and never branches on the mode for loading.

## Rendering it from AppComponent

Until the router is the default (the follow-up to ADR 0005), a feature page is rendered from `AppComponent`'s `@switch (page)` inside `@defer (on immediate)`, with a `@placeholder` that uses a `shell.*` key. That makes the feature its own lazy chunk in both router modes. `AppComponent` keeps only the shell for it (the `guest-view` class, the footer) and skips every bit of owner startup that the feature does not need; `isSharedView` is the example. When routes get components, the `@defer` becomes `loadComponent` and nothing inside the feature changes.

## Text

The feature's template has no raw text. Give the page `provideTranslocoScope('<name>')` (add other scopes it reuses, for example `'tournament'` for the final kinds) and read keys with `*transloco="let t; prefix: '<name>.<group>'"`. The keys manager (`npm run i18n:check`) cannot see a key built at runtime or one inside `@let`, so switch on typed values and write each key literally. Keep the pt-BR text identical to what the screen showed before: the e2e tests assert it.

## Tests

- `core/ports/testing/` has an in-memory fake for every port the feature uses and a contract suite (`*.contract.ts`) that both the fake and the real adapter pass, so a spec on the fake says something true about Supabase. A fake implements only the part of the port features use (`Pick<...>`); extend it and its contract together.
- The store spec builds the store with `TestBed`, the fakes from `<name>.fakes.ts`, `vi.useFakeTimers()` for the clock and poll, and covers every mode, every error key, refresh by realtime and by poll, and that destroy leaves nothing running (`FakeTournamentFeed.watching()` is empty).
- Component specs use `@testing-library/angular` with `translocoTesting({ '<name>/pt-BR': ... })`, query by role and accessible name, and use its `waitFor` (it runs change detection; `vi.waitFor` does not).
- E2e: the existing journeys stay unchanged; a fixed bug gets a regression test that fails on the code before the fix. A spec that depends on the address runs in both Playwright projects (add it to `chromium-router`'s `testMatch`), and a new page gets an axe scan in `accessibility.spec.ts`: fix what it finds rather than recording it in the baseline.
