import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import { CardComponent } from '@ui/card/card.component';
import { RankingViewComponent } from '../components/ranking-view.component';
import { TournamentStore } from '../data/tournament.store';
import { FinalsCardComponent } from './finals-card.component';

/**
 * Ranking: the standings, the card that generates the finals once the schedule is over, the finals with their podium,
 * and the tie-break rules. The page is the `<section>` itself, so the DOM keeps its shape.
 */
@Component({
  selector: 'section[appRankingPage]',
  imports: [TranslocoDirective, ButtonComponent, CardComponent, RankingViewComponent, FinalsCardComponent],
  providers: [provideTranslocoScope('organizer')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'content-grid ranking-page' },
  templateUrl: './ranking-page.component.html',
  styleUrl: './ranking-page.component.css',
})
export class RankingPageComponent {
  protected readonly store = inject(TournamentStore);
}
