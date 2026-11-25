import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { provideTranslocoScope } from '@jsverse/transloco';
import type { Page } from '../../core/models';
import { FinalizeBannerComponent } from './finalize-banner.component';
import { NO_SHELL_STATE, TournamentStore, type ShellRequest, type TournamentShellState } from './data/tournament.store';
import { OverviewPageComponent } from './overview/overview-page.component';
import { PlayersPageComponent } from './players/players-page.component';
import { ProjectionPageComponent } from './projection/projection-page.component';
import { RankingPageComponent } from './ranking/ranking-page.component';
import { RoundsPageComponent } from './rounds/rounds-page.component';
import { SettingsPageComponent } from './settings/settings-page.component';

/**
 * The organizer's tournament views: Visão geral, Jogadores, Partidas, Ranking, Projeção and Ajustes. It is one
 * component for all of them, so moving between pages keeps the store (half-typed scores, the share pick, the clock)
 * instead of building it again; each page is a `<section>` child that reads the store. `AppComponent` renders it
 * with `@defer`, tells it which page to show and what it knows (`shell`: the sync state, the theme); what only the
 * shell can do (navigate, sync, import, start over) comes back as `request`.
 */
@Component({
  selector: 'app-tournament',
  imports: [
    FinalizeBannerComponent,
    OverviewPageComponent,
    PlayersPageComponent,
    RoundsPageComponent,
    RankingPageComponent,
    ProjectionPageComponent,
    SettingsPageComponent,
  ],
  providers: [TournamentStore, provideTranslocoScope('organizer', 'tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (page() !== 'projection') {
      @defer (on idle) {
        <app-finalize-banner />
      }
    }
    @switch (page()) {
      @case ('overview') {
        <section appOverviewPage></section>
      }
      @case ('players') {
        <section appPlayersPage></section>
      }
      @case ('rounds') {
        <section appRoundsPage></section>
      }
      @case ('ranking') {
        <section appRankingPage></section>
      }
      @case ('projection') {
        <section appProjectionPage></section>
      }
      @case ('settings') {
        <section appSettingsPage></section>
      }
    }
  `,
})
export class TournamentComponent {
  /** The page to show. */
  readonly page = input.required<Page>();
  /** What the shell knows that the pages show. */
  readonly shell = input<TournamentShellState>(NO_SHELL_STATE);
  /** The shell is asked to navigate, sync, import a backup or react to the tournament being finished. */
  readonly request = output<ShellRequest>();

  constructor() {
    const store = inject(TournamentStore);
    effect(() => store.shell.set(this.shell()));
    store.requests.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((request) => this.request.emit(request));
  }
}
