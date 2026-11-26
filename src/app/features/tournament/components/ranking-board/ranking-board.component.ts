import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { RankingHint } from '../../../../core/ranking-hint';
import type { RankingBoard } from '../../../../domain/tournament-view/ranking-board';
import { RankingCriteriaComponent } from '../ranking-criteria.component';
import { RankingCompactComponent } from './ranking-compact.component';
import { RankingCutListComponent } from './ranking-cut-list.component';

/**
 * The ranking of a group tournament of 20 or 24 players: the tie-break order, the groups as small cards and one list
 * with a cut line. Once the finals exist and the group stage is over, it folds into one row under the finals.
 */
@Component({
  selector: 'app-ranking-board',
  imports: [
    NgTemplateOutlet,
    TranslocoDirective,
    RankingCriteriaComponent,
    RankingCompactComponent,
    RankingCutListComponent,
  ],
  providers: [provideTranslocoScope('tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ranking-board.component.html',
  styleUrl: './ranking-board.component.css',
})
export class RankingBoardComponent {
  readonly board = input.required<RankingBoard>();
  /** The viewer's own athlete (the live link); empty for the organizer. */
  readonly highlightId = input('');
  readonly playerSelected = output<string>();
  /** "Como funciona" was asked for: the opener shows the help dialog with its tournament. */
  readonly helpRequested = output();

  protected readonly hint = inject(RankingHint);

  protected select(playerId: string): void {
    this.hint.markSeen();
    this.playerSelected.emit(playerId);
  }
}
