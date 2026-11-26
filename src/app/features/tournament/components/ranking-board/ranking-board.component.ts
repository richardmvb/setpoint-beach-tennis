import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { LOCAL_STORE } from '../../../../core/ports/key-value-store.port';
import { RankingHint } from '../../../../core/ranking-hint';
import type { RankingBoard } from '../../../../domain/tournament-view/ranking-board';
import { RankingCriteriaComponent } from '../ranking-criteria.component';
import { RankingCompactComponent } from './ranking-compact.component';
import { RankingCutListComponent } from './ranking-cut-list.component';
import { RankingSummaryComponent } from './ranking-summary.component';

type BoardView = 'summary' | 'compact';
/** One key per role: the organizer's choice does not follow them onto their own live link. */
const VIEW_KEY = 'setpoint.ranking.view';

/**
 * The ranking of a group tournament of 20 or 24 players: the tie-break order and two views the person picks: Resumo
 * (how many go on, where the viewer stands, folding groups) and Compacto (the groups as small cards and one list with
 * a cut line). Once the finals exist and the group stage is over, it folds into one row under the finals.
 */
@Component({
  selector: 'app-ranking-board',
  imports: [
    NgTemplateOutlet,
    TranslocoDirective,
    RankingCriteriaComponent,
    RankingCompactComponent,
    RankingCutListComponent,
    RankingSummaryComponent,
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
  /** Who looks: the guest starts on Resumo (it opens with their own line), the organizer on Compacto. */
  readonly role = input<'host' | 'guest'>('host');
  /** The board folds into one row under the finals once they exist and the group stage is over (the organizer page). */
  readonly fold = input(true);
  readonly playerSelected = output<string>();
  /** "Como funciona" was asked for: the opener shows the help dialog with its tournament. */
  readonly helpRequested = output();

  protected readonly hint = inject(RankingHint);
  private readonly local = inject(LOCAL_STORE);
  private readonly chosen = signal<BoardView | null>(null);
  /** What this device remembers for this role (read once; an unknown value or blocked storage means the default). */
  private readonly stored = computed<BoardView | null>(() => {
    try {
      const value = this.local.getItem(`${VIEW_KEY}.${this.role()}`);
      return value === 'summary' || value === 'compact' ? value : null;
    } catch {
      return null;
    }
  });
  protected readonly view = computed<BoardView>(
    () => this.chosen() ?? this.stored() ?? (this.role() === 'guest' ? 'summary' : 'compact'),
  );

  protected setView(view: BoardView): void {
    this.chosen.set(view);
    try {
      this.local.setItem(`${VIEW_KEY}.${this.role()}`, view);
    } catch {
      // Storage full or blocked: the choice still holds for this visit.
    }
  }

  protected select(playerId: string): void {
    this.hint.markSeen();
    this.playerSelected.emit(playerId);
  }
}
