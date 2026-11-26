import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import type { BoardEntry, BoardGroup, RankingBoard } from '../../../../domain/tournament-view/ranking-board';
import { GenderIconComponent } from '../../../gender-icon.component';

/** One group's table (place, athlete, wins, balance, matches); every row opens the athlete. */
@Component({
  selector: 'app-ranking-group-table',
  imports: [TranslocoDirective, GenderIconComponent],
  providers: [provideTranslocoScope('tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ranking-group-table.component.html',
  styleUrl: './ranking-group-table.component.css',
})
export class RankingGroupTableComponent {
  readonly group = input.required<BoardGroup>();
  readonly kind = input.required<RankingBoard['kind']>();
  readonly highlightId = input('');
  readonly playerSelected = output<string>();

  protected isMine(entry: BoardEntry): boolean {
    return !!this.highlightId() && entry.playerIds.includes(this.highlightId());
  }

  protected signed(value: number): string {
    return value > 0 ? `+${value}` : `${value}`;
  }
}
