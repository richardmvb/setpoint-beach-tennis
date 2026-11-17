import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { provideTranslocoScope } from '@jsverse/transloco';
import type { Page } from '../../core/models';
import { TournamentStore, type ShellRequest } from './data/tournament.store';
import { RankingPageComponent } from './ranking/ranking-page.component';
import { RoundsPageComponent } from './rounds/rounds-page.component';

/**
 * The organizer's tournament views: Partidas and Ranking (the rest follow in B4b). It is one component for all of
 * them, so moving between two pages keeps the store (the share pick, the clock) instead of building it again; each
 * page is a `<section>` child that reads the store. `AppComponent` renders it with `@defer` and tells it which page
 * to show; what only the shell can do (navigate, react to a finished tournament) comes back as `request`.
 */
@Component({
  selector: 'app-tournament',
  imports: [RoundsPageComponent, RankingPageComponent],
  providers: [TournamentStore, provideTranslocoScope('organizer', 'tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @switch (page()) {
      @case ('rounds') {
        <section appRoundsPage></section>
      }
      @case ('ranking') {
        <section appRankingPage></section>
      }
    }
  `,
})
export class TournamentComponent {
  /** The page to show. */
  readonly page = input.required<Page>();
  /** The shell is asked to navigate or reacts to the tournament being finished. */
  readonly request = output<ShellRequest>();

  constructor() {
    inject(TournamentStore)
      .requests.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((request) => this.request.emit(request));
  }
}
