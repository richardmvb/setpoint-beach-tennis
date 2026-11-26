import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { PlayerStanding } from '../../../core/models';
import type {
  PlaceExplanation,
  RankingNeighbour,
  Separation,
} from '../../../domain/tournament-view/ranking-explanation';

/** One line of the comparison table: the five tie-break criteria in order. */
interface CompareRow {
  criterion: 'wins' | 'balance' | 'gamesFor' | 'headToHead' | 'draw';
  /** Values in the order of the columns (the athlete, then the neighbour); null when there is no number to show. */
  values: [number, number] | null;
  /** `equal`: tied here; `decided`: this criterion separated them; `notNeeded`: an earlier one did; `pending`: the draw is still to be made. */
  state: 'equal' | 'decided' | 'notNeeded' | 'pending' | 'none';
}

/** A neighbour ready for the template: the separation is kept with upper first, as the domain gives it. */
interface NeighbourView {
  direction: 'behind' | 'ahead';
  neighbour: RankingNeighbour;
  /** The reason to show: for `sameGroup` it carries what decided inside the group. */
  separation: Separation;
  compare: CompareRow[] | null;
}

const CRITERIA = ['wins', 'balance', 'gamesFor'] as const;

/**
 * The "Posição" block at the top of the athlete's dialog: the place in the list that decides the finals, the four
 * numbers, and why the athlete is behind the one above and ahead of the one below. Built from `placeExplanation`.
 */
@Component({
  selector: 'app-player-position',
  imports: [TranslocoDirective, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './player-position.component.html',
  styleUrl: './player-position.component.css',
})
export class PlayerPositionComponent {
  readonly explanation = input.required<PlaceExplanation>();

  /** Which neighbour's comparison is open (closed by default). */
  protected readonly openCompare = signal<'behind' | 'ahead' | null>(null);

  protected readonly neighbours = computed<NeighbourView[]>(() => {
    const explanation = this.explanation();
    const views: NeighbourView[] = [];
    if (explanation.above) views.push(this.view('behind', explanation.above, explanation.standing));
    if (explanation.below) views.push(this.view('ahead', explanation.below, explanation.standing));
    return views;
  });

  protected toggleCompare(direction: 'behind' | 'ahead'): void {
    this.openCompare.update((open) => (open === direction ? null : direction));
  }

  /** A stored draw time that does not parse is hidden rather than shown as garbage. */
  protected validTime(iso: string): boolean {
    return !Number.isNaN(Date.parse(iso));
  }

  protected signed(value: number): string {
    return value > 0 ? `+${value}` : `${value}`;
  }

  private view(direction: 'behind' | 'ahead', neighbour: RankingNeighbour, me: PlayerStanding): NeighbourView {
    const separation = neighbour.separation;
    return { direction, neighbour, separation, compare: this.compare(separation, me, neighbour.standing, direction) };
  }

  /**
   * The table is only useful when the wins are equal and a tie-break rule decided (or nothing did yet). Columns are
   * the athlete first, then the neighbour; the domain gives the separation values upper first.
   */
  private compare(
    separation: Separation,
    me: PlayerStanding,
    other: PlayerStanding,
    direction: 'behind' | 'ahead',
  ): CompareRow[] | null {
    if (me.setsWon !== other.setsWon) return null;
    const decisive = separation.kind === 'sameGroup' ? separation.within : separation;
    let decidedAt: number;
    switch (decisive.kind) {
      case 'criterion':
        decidedAt = CRITERIA.indexOf(decisive.criterion);
        break;
      case 'headToHead':
        decidedAt = 3;
        break;
      case 'draw':
        decidedAt = 4;
        break;
      case 'tied':
        decidedAt = -1;
        break;
      default:
        return null;
    }
    const numbers = (row: PlayerStanding): number[] => [row.setsWon, row.gameBalance, row.gamesFor];
    const stateAt = (index: number): CompareRow['state'] =>
      decidedAt < 0 ? 'equal' : index < decidedAt ? 'equal' : index === decidedAt ? 'decided' : 'notNeeded';
    const rows: CompareRow[] = CRITERIA.map((criterion, index) => ({
      criterion,
      values: [numbers(me)[index], numbers(other)[index]],
      state: stateAt(index),
    }));
    const headToHead: [number, number] | null =
      decisive.kind === 'headToHead'
        ? direction === 'behind'
          ? [decisive.below, decisive.above]
          : [decisive.above, decisive.below]
        : null;
    rows.push({ criterion: 'headToHead', values: headToHead, state: stateAt(3) });
    const drawState: CompareRow['state'] =
      decisive.kind === 'tied' ? (decisive.needsDraw ? 'pending' : 'none') : stateAt(4);
    rows.push({ criterion: 'draw', values: null, state: drawState });
    return rows;
  }
}
