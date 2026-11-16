# Features

A feature is one screen or flow of the app, in its own folder, with no code in `AppComponent`. `shared-view/` (the live link, the invite and the admin viewer) is the reference: copy its shape when you extract the next one. The plan is Phase 4 of `docs/professionalization-plan.md`; the boundaries are in ADR 0003.

## Layout

```
features/<name>/
  <name>.component.ts|html|css  the page: OnPush, provides its store and its Transloco scope
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

Until the router is the default (the follow-up to ADR 0005), a feature page is rendered from `AppComponent`'s `@switch (page)` inside `@defer (on immediate)`, with a `@placeholder` that uses a `shell.*` key. That makes the feature its own lazy chunk in both router modes. `AppComponent` keeps only the shell for it (the `guest-view` class, the footer) and skips every bit of owner startup that the feature does not need; `isSharedView` is the example. A page that shows nothing before its text loads may leave the placeholder empty (`<main></main>`, the landing) instead of showing a `shell.*` text that flashes. When `AppComponent` must decide at startup whether to show the page, it imports only that pure helper from the feature's `data/` (the landing's `landingSeen`), never the component. When routes get components, the `@defer` becomes `loadComponent` and nothing inside the feature changes.

## A feature that is a dialog

`profile/` and `library/` are dialogs, not pages. `AppComponent` opens them (`DialogService.open`, lazy `import()` like the player-matches dialog) and the component reads its data from `DIALOG_DATA` and closes through `DialogRef`; its store is still component-scoped and provided by the component. Things that differ from a page:

- **The shell keeps the gating.** When a dialog may open (the first-visit welcome, "nothing stacks on the welcome") stays in `AppComponent`; the dialog owns what it shows. What it hands back is the dialog's result (`ProfileDialogResult`), and the shell acts on it.
- **State both sides use is a root service in `core/`**, not part of either: `LocalProfileStore` and `SavedTournaments`. They hold signals that change only when something is saved, so a dialog's draft (the profile name) never leaks into the top bar.
- **Shell state the dialog shows** (the sync status and the theme) is passed as a `Signal` in the data. Until the shell is signal-based (B5), the shell refreshes that signal from `ngDoCheck` while the dialog is open.
- **The frame can stay global.** The library keeps the shared `.batch-modal` look on its host element; only its list rules moved to its own stylesheet. The backdrops are global classes (`ui-backdrop-light`, `ui-backdrop-plain` in `styles/components/dialog.css`), because the CDK renders them outside the component.
- **Focus.** The default `autoFocus` finds nothing when the content is behind `*transloco` and has not rendered yet. Ask for `'dialog'` and, where a field must take the cursor, focus it from a `viewChild` effect (the profile's welcome).
- **Text in TypeScript** (a confirmation's words) is read with `transloco.translate('key', params, '<scope>/pt-BR')` with literal keys: the keys manager does not see keys inside an event binding in a template, nor a scope-prefixed key without that last argument.
- **While a modal dialog is open the page behind it is out of the accessibility tree**, so an e2e finds the opener by CSS, not by role.

## Styles

A feature's CSS leaves `src/styles.css` for its components' stylesheets (`styleUrl`, the default emulated encapsulation), tokens only (Stylelint lints them, unlike `styles.css`). Move only the rules whose every selector names a class that nothing outside the feature uses, keep their order, and leave shared classes (`.button`, `.card-kicker`, ...) global. Moving is not free, because the cascade changes in two ways:

- Emulation adds an attribute to every compound selector, so each moved rule weighs more and loads after `styles.css`. A moved rule can then beat a global state rule it used to lose to (`.landing .button.primary` over `.button.primary:hover`). Wrap the context in `:where()` to keep the old weight.
- `:root[data-theme='dark'] .x` becomes a selector that matches nothing; write `:host-context([data-theme='dark']) .x`.

Each component stylesheet has a budget (`anyComponentStyle`: 8 kB warning, 12 kB error, minified, before encapsulation). A page whose CSS is bigger splits into presentational children by section. Make the child the section itself (`selector: 'section[appLandingHero]'`), so the DOM does not change and the page's layout rules (`.landing > *`, `.landing-section`) still reach it: rules on the `<section>` stay in the page's stylesheet, rules on what is inside move to the child, with the section written as `:host` (`.landing-hero p` becomes `:host p`).

The visual baselines do not see hover, focus or every width, so prove a move with a computed-style comparison of every element of the page, before and after, across themes, widths and forced `:hover`/`:focus-visible`/`:active` states (the landing PR, B1, describes the throwaway script). Keyframes are renamed per component; that is the only expected difference.

## Text

The feature's template has no raw text. Give the page `provideTranslocoScope('<name>')` (add other scopes it reuses, for example `'tournament'` for the final kinds) and read keys with `*transloco="let t; prefix: '<name>.<group>'"`. The keys manager (`npm run i18n:check`) cannot see a key built at runtime or one inside `@let`, so switch on typed values and write each key literally. Keep the pt-BR text identical to what the screen showed before: the e2e tests assert it. Words are keys, including made-up sample data in mock-ups ("Ana · Bia", "1º"); numbers, symbols, emoji and the `SP` logo mark stay in the template.

## Tests

- `core/ports/testing/` has an in-memory fake for every port the feature uses and a contract suite (`*.contract.ts`) that both the fake and the real adapter pass, so a spec on the fake says something true about Supabase. A fake implements only the part of the port features use (`Pick<...>`); extend it and its contract together.
- The store spec builds the store with `TestBed`, the fakes from `<name>.fakes.ts`, `vi.useFakeTimers()` for the clock and poll, and covers every mode, every error key, refresh by realtime and by poll, and that destroy leaves nothing running (`FakeTournamentFeed.watching()` is empty).
- Component specs use `@testing-library/angular` with `translocoTesting({ '<name>/pt-BR': ... })`, query by role and accessible name, and use its `waitFor` (it runs change detection; `vi.waitFor` does not).
- E2e: the existing journeys stay unchanged; a fixed bug gets a regression test that fails on the code before the fix. A spec that depends on the address runs in both Playwright projects (add it to `chromium-router`'s `testMatch`), and a new page gets an axe scan in `accessibility.spec.ts`: fix what it finds rather than recording it in the baseline.
