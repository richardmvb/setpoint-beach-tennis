import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { CardComponent } from '@ui/card/card.component';
import {
  boardViewer,
  type BoardEntry,
  type BoardGroup,
  type RankingBoard,
} from '../../../../domain/tournament-view/ranking-board';
import { RankingCutListComponent } from './ranking-cut-list.component';
import { RankingGroupTableComponent } from './ranking-group-table.component';

/**
 * The summary view: how many go to the final, where the viewer stands (the live link), the groups as folding rows
 * (who goes on in a line, the table when opened) and the two lists folded away.
 */
@Component({
  selector: 'app-ranking-summary',
  imports: [TranslocoDirective, CardComponent, RankingCutListComponent, RankingGroupTableComponent],
  providers: [provideTranslocoScope('tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ranking-summary.component.html',
  styleUrl: './ranking-summary.component.css',
})
export class RankingSummaryComponent {
  readonly board = input.required<RankingBoard>();
  /** The viewer's own athlete (the live link); empty for the organizer, who gets no "Você" line. */
  readonly highlightId = input('');
  readonly playerSelected = output<string>();

  protected readonly viewer = computed(() => {
    const id = this.highlightId();
    return id ? boardViewer(this.board(), id) : null;
  });

  protected readonly percent = computed(() => {
    const { matchesDone, matchesTotal } = this.board();
    return matchesTotal ? Math.round((matchesDone / matchesTotal) * 100) : 0;
  });

  /** The viewer's group opens first; for the organizer, the first group. */
  protected readonly openGroupId = computed(() => {
    const { groups } = this.board();
    const mine = this.viewer()?.entry.playerId;
    return (mine ? groups.find((group) => group.entries.some((entry) => entry.playerIds.includes(mine))) : groups[0])
      ?.id;
  });

  protected readonly outCount = computed(() => this.board().list.length - this.board().slots);

  /** The athletes named in a closed group row: the three that can go on (20), or the two best placed (24). */
  protected lineOf(group: BoardGroup): BoardEntry[] {
    return group.entries.slice(0, this.board().kind === 'qualification' ? 3 : 2);
  }
}
