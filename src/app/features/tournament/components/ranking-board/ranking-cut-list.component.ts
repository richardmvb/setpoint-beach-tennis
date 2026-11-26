import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { CardComponent } from '@ui/card/card.component';
import type { BoardEntry, CutTie, RankingBoard } from '../../../../domain/tournament-view/ranking-board';
import { GenderIconComponent } from '../../../gender-icon.component';

/**
 * Everybody in one list, in the order of the race to the finals, with a dashed line after the last place that goes
 * on. The athletes after the line are folded behind "Ver todos", except the first one out: the one closest to the cut.
 */
@Component({
  selector: 'app-ranking-cut-list',
  imports: [NgTemplateOutlet, TranslocoDirective, CardComponent, GenderIconComponent],
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
  /** Athletes tied across the cut line, still to be drawn: a note says so, and their rows carry a chip. */
  readonly ties = input<CutTie[]>([]);
  /** The group badge ("A1") next to each name: pointless when there is only one group. */
  readonly showGroup = input(true);
  /** Only the table and "Ver todos", with no card, title or note: for a folded section that already has its own title. */
  readonly bare = input(false);
  /** The table's accessible name when it is bare (there is no heading to name it). */
  readonly label = input('');
  readonly playerSelected = output<string>();

  protected readonly showAll = signal(false);

  /** Rows up to the cut and the first one out, or everybody when asked. */
  protected readonly visible = computed(() =>
    this.showAll() ? this.entries() : this.entries().slice(0, Math.min(this.entries().length, this.slots() + 1)),
  );
  /** Every athlete in a tie across the cut, for the note when there is more than one tie. */
  protected readonly tiedCount = computed(() => this.ties().reduce((sum, tie) => sum + tie.count, 0));
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
