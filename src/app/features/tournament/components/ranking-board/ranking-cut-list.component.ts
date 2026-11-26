import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { CardComponent } from '@ui/card/card.component';
import type { BoardEntry, RankingBoard } from '../../../../domain/tournament-view/ranking-board';

/**
 * Everybody in one list, in the order of the race to the finals, with a dashed line after the last place that goes
 * on. The athletes after the line are folded behind "Ver todos", except the first one out: the one closest to the cut.
 */
@Component({
  selector: 'app-ranking-cut-list',
  imports: [TranslocoDirective, CardComponent],
  providers: [provideTranslocoScope('tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ranking-cut-list.component.html',
  styleUrl: './ranking-cut-list.component.css',
})
export class RankingCutListComponent {
  readonly entries = input.required<BoardEntry[]>();
  readonly slots = input.required<number>();
  readonly kind = input.required<RankingBoard['kind']>();
  readonly settled = input(false);
  readonly provisional = input(false);
  readonly highlightId = input('');
  readonly playerSelected = output<string>();

  protected readonly showAll = signal(false);

  /** Rows up to the cut and the first one out, or everybody when asked. */
  protected readonly visible = computed(() =>
    this.showAll() ? this.entries() : this.entries().slice(0, Math.min(this.entries().length, this.slots() + 1)),
  );
  protected readonly foldedCount = computed(() => this.entries().length - this.visible().length);
  /** There is something after the first row out, so "Ver todos" has a purpose. */
  protected readonly canFold = computed(() => this.entries().length > this.slots() + 1);

  protected isMine(entry: BoardEntry): boolean {
    return !!this.highlightId() && entry.playerId === this.highlightId();
  }

  protected signed(value: number): string {
    return value > 0 ? `+${value}` : `${value}`;
  }
}
