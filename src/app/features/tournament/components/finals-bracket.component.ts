import { ChangeDetectionStrategy, Component, computed, ElementRef, input, signal, viewChild } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { scrollBehavior } from '../../../core/motion';
import type { Player } from '../../../core/models';
import { PlayerAvatarComponent } from '../../player-avatar.component';
import type { BracketMatch, BracketSlot, BracketView } from '../../../domain/tournament-view/bracket';

/**
 * The knockout tree, left to right: quartas, semifinal, final, with the 3rd-place match under the final. On a phone
 * the columns slide sideways under three tabs. Presentational: it shows the view the domain derived.
 */
@Component({
  selector: 'app-finals-bracket',
  imports: [TranslocoDirective, PlayerAvatarComponent],
  providers: [provideTranslocoScope('tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './finals-bracket.component.css',
  templateUrl: './finals-bracket.component.html',
})
export class FinalsBracketComponent {
  readonly view = input.required<BracketView>();
  readonly players = input<Player[]>([]);
  readonly highlightId = input('');

  protected readonly active = signal(0);
  private readonly track = viewChild<ElementRef<HTMLElement>>('track');

  /** The third place sits under the final, in the same column but not connected to the tree. */
  protected readonly columns = computed<BracketMatch[][]>(() => {
    const { columns, thirdPlace } = this.view();
    return [columns[0], columns[1], thirdPlace ? [...columns[2], thirdPlace] : columns[2]];
  });

  private readonly byId = computed(() => new Map(this.players().map((player) => [player.id, player])));

  protected player(id: string): Player | undefined {
    return this.byId().get(id);
  }

  protected pairName(ids: readonly string[]): string {
    return ids.map((id) => this.player(id)?.name ?? '—').join(' · ');
  }

  protected isMe(slot: BracketSlot): boolean {
    return slot.kind === 'pair' && !!this.highlightId() && slot.playerIds.includes(this.highlightId());
  }

  protected show(index: number): void {
    const track = this.track()?.nativeElement;
    const column = track?.children[index] as HTMLElement | undefined;
    if (!track || !column) return;
    this.active.set(index);
    track.scrollTo({ left: column.offsetLeft - track.offsetLeft, behavior: scrollBehavior() });
  }

  /** Marks the column nearest to the left edge as active; at the end of the track, the last one. */
  protected follow(): void {
    const track = this.track()?.nativeElement;
    if (!track) return;
    if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 2) {
      this.active.set(track.children.length - 1);
      return;
    }
    let nearest = 0;
    let best = Infinity;
    Array.from(track.children).forEach((child, index) => {
      const distance = Math.abs((child as HTMLElement).offsetLeft - track.offsetLeft - track.scrollLeft);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });
    this.active.set(nearest);
  }
}
