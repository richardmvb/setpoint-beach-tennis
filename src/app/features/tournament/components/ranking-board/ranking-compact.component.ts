import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { CardComponent } from '@ui/card/card.component';
import type { BoardEntry, BoardGroup, RankingBoard } from '../../../../domain/tournament-view/ranking-board';
import { GenderIconComponent } from '../../../gender-icon.component';
import { RankingGroupTableComponent } from './ranking-group-table.component';

/**
 * The groups as small cards, two to a row on a phone: each athlete's name with the wins (20 players, with the mark
 * of who goes on once the group stage is over) or the place in the overall ranking (24 players). The header of a card
 * opens that group's table in place.
 */
@Component({
  selector: 'app-ranking-compact',
  imports: [TranslocoDirective, CardComponent, GenderIconComponent, RankingGroupTableComponent],
  providers: [provideTranslocoScope('tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ranking-compact.component.html',
  styleUrl: './ranking-compact.component.css',
})
export class RankingCompactComponent {
  readonly groups = input.required<BoardGroup[]>();
  readonly kind = input.required<RankingBoard['kind']>();
  readonly settled = input(false);
  readonly provisional = input(false);
  readonly highlightId = input('');
  readonly playerSelected = output<string>();

  /** The groups whose table is open. */
  protected readonly open = signal<ReadonlySet<string>>(new Set());

  protected isOpen(groupId: string): boolean {
    return this.open().has(groupId);
  }

  protected toggle(groupId: string): void {
    this.open.update((current) => {
      const next = new Set(current);
      if (!next.delete(groupId)) next.add(groupId);
      return next;
    });
  }

  protected isMine(entry: BoardEntry): boolean {
    return !!this.highlightId() && entry.playerIds.includes(this.highlightId());
  }
}
