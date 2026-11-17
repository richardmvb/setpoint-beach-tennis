import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import { CurrentTournament } from '../../../core/current-tournament';
import { CLOCK } from '../../../core/ports/clock.port';
import { RANDOM } from '../../../core/ports/random.port';
import {
  shuffledOrder,
  tiedPositions,
  unresolvedFinalTie,
  withTieDraw,
} from '../../../domain/tournament-play/tie-draw';
import { createStandingsMemo } from '../../../domain/tournament-view/standings';
import { PlayerAvatarComponent } from '../../player-avatar.component';

/** Id of the dialog's title, which names it (aria-labelledby). */
export const TIE_DRAW_TITLE_ID = 'tieDrawTitle';

/**
 * The draw that breaks a tie the ranking rules cannot split, asked for when the finals are generated. It walks the
 * ties one at a time: draw, then confirm (which moves to the next tie, or finishes). Every draw is stored in the
 * tournament as it happens, so cancelling keeps the draws that were made. It closes with `true` once no tie is
 * left and the finals can be generated, and with anything else when cancelled. Open it with `DialogService.open`.
 */
@Component({
  selector: 'app-tie-draw-dialog',
  imports: [TranslocoDirective, ButtonComponent, PlayerAvatarComponent],
  providers: [provideTranslocoScope('organizer')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tie-draw-modal' },
  templateUrl: './tie-draw-dialog.component.html',
  styleUrl: './tie-draw-dialog.component.css',
})
export class TieDrawDialogComponent {
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly tournament = inject(CurrentTournament);
  private readonly random = inject(RANDOM);
  private readonly clock = inject(CLOCK);
  private readonly transloco = inject(TranslocoService);
  private readonly standingsMemo = createStandingsMemo();
  private readonly standings = computed(() => this.standingsMemo(this.tournament.state()));

  protected readonly titleId = TIE_DRAW_TITLE_ID;
  protected readonly state = this.tournament.state;
  /** The players this step draws for. */
  protected readonly playerIds = signal(this.nextTie());
  /** Their order once drawn; empty until then. */
  protected readonly result = signal<string[]>([]);
  /** Another tie waits after the one on screen. */
  protected readonly moreTies = computed(() => unresolvedFinalTie(this.state(), this.standings()).length > 0);
  protected readonly positions = computed(() =>
    tiedPositions(this.playerIds(), this.standings().all)
      .map((position) => `${position}º`)
      .join(' e '),
  );

  protected nameOf(id: string): string {
    return this.state().players.find((player) => player.id === id)?.name ?? '';
  }

  protected photoOf(id: string): string {
    return this.state().players.find((player) => player.id === id)?.photoDataUrl ?? '';
  }

  protected draw(): void {
    const ids = this.playerIds();
    if (ids.length < 2 || this.result().length) return;
    const order = shuffledOrder(ids, (max) => this.random.int(max));
    this.tournament.update((state) => withTieDraw(state, ids, order, this.clock.iso()));
    this.tournament.save(this.transloco.translate('notices.tieDrawn', {}, 'organizer/pt-BR'));
    this.result.set(order);
  }

  protected confirm(): void {
    if (!this.result().length) return;
    const next = this.nextTie();
    if (next.length) {
      this.playerIds.set(next);
      this.result.set([]);
      return;
    }
    this.ref.close(true);
  }

  protected cancel(): void {
    this.ref.close(false);
  }

  private nextTie(): string[] {
    return unresolvedFinalTie(this.tournament.state(), this.standings()).map((player) => player.playerId);
  }
}
