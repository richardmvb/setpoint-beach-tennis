import { ChangeDetectionStrategy, Component, Input, inject, input } from '@angular/core';
import { provideTranslocoScope, TranslocoService } from '@jsverse/transloco';

import { Match, Player } from '../../../core/models';
import { shownScore } from '../../../domain/tournament-view/final-score';
import { PlayerAvatarComponent } from '../../player-avatar.component';

/** Versus card used when watching a tournament: two teams, a big scoreboard, a clear winner. */
@Component({
  selector: 'app-battle-card',
  standalone: true,
  imports: [PlayerAvatarComponent],
  providers: [provideTranslocoScope('tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:block;min-width:0}'],
  template: `
    <div class="battle" [class.is-live]="inPlay" [class.is-done]="done" [class.has-mine]="mine">
      <div class="battle-meta">
        <span class="battle-court">{{ label() }}</span>
        <span class="battle-status" [class.live]="inPlay" [class.done]="done">
          @if (inPlay) {
            <i></i>
          }
          {{ statusLabel }}</span
        >
      </div>
      <div class="battle-arena">
        <div class="battle-team team-a" [class.winner]="winner === 'A'" [class.loser]="winner === 'B'">
          @for (id of match.teamA; track id) {
            <div class="battle-player" [class.me]="id === highlightId()">
              <app-player-avatar [name]="nameOf(id)" [photoDataUrl]="photoOf(id)" variant="battle-avatar" />
              <span class="battle-name">{{ nameOf(id) }}</span>
            </div>
          }
          @if (winner === 'A') {
            <span class="battle-win">{{ wonLabel }}</span>
          }
        </div>
        <div
          class="battle-board"
          [class.win-a]="winner === 'A'"
          [class.win-b]="winner === 'B'"
          role="img"
          [attr.aria-label]="ariaScore"
        >
          @for (value of [shown.a]; track value) {
            <span class="battle-score score-a">{{ value ?? '–' }}</span>
          }
          <span class="battle-vs" aria-hidden="true">VS</span>
          @for (value of [shown.b]; track value) {
            <span class="battle-score score-b">{{ value ?? '–' }}</span>
          }
        </div>
        <div class="battle-team team-b" [class.winner]="winner === 'B'" [class.loser]="winner === 'A'">
          @for (id of match.teamB; track id) {
            <div class="battle-player" [class.me]="id === highlightId()">
              <app-player-avatar [name]="nameOf(id)" [photoDataUrl]="photoOf(id)" variant="battle-avatar" />
              <span class="battle-name">{{ nameOf(id) }}</span>
            </div>
          }
          @if (winner === 'B') {
            <span class="battle-win">{{ wonLabel }}</span>
          }
        </div>
      </div>
      @if (shown.tieBreakA !== null && shown.tieBreakB !== null) {
        <small class="battle-tie">{{ tieBreakLabel }} {{ shown.tieBreakA }}–{{ shown.tieBreakB }}</small>
      }
    </div>
  `,
})
export class BattleCardComponent {
  private readonly transloco = inject(TranslocoService);
  @Input({ required: true }) match!: Match;
  readonly players = input<Player[]>([]);
  readonly highlightId = input('');
  readonly label = input('');
  /** The round currently on court: unscored matches are shown as "em quadra". */
  readonly live = input(false);

  /** The games as people read them: a set won in the tie-break is 7–6, however it was typed. */
  get shown() {
    return shownScore(this.match);
  }
  get done(): boolean {
    return this.match.scoreA !== null && this.match.scoreB !== null;
  }
  get inPlay(): boolean {
    return this.live() && !this.done;
  }
  get winner(): 'A' | 'B' | null {
    const { a, b } = this.shown;
    if (a === null || b === null || a === b) return null;
    return a > b ? 'A' : 'B';
  }
  get mine(): boolean {
    const highlightId = this.highlightId();
    return !!highlightId && [...this.match.teamA, ...this.match.teamB].includes(highlightId);
  }
  get wonLabel(): string {
    return this.transloco.translate('battle.won', {}, 'tournament/pt-BR');
  }
  get tieBreakLabel(): string {
    return this.transloco.translate('battle.tieBreak', {}, 'tournament/pt-BR');
  }
  get statusLabel(): string {
    return this.done
      ? this.transloco.translate('battle.done', {}, 'tournament/pt-BR')
      : this.live()
        ? this.transloco.translate('battle.live', {}, 'tournament/pt-BR')
        : this.transloco.translate('battle.waiting', {}, 'tournament/pt-BR');
  }
  get ariaScore(): string {
    const a = this.teamName(this.match.teamA);
    const b = this.teamName(this.match.teamB);
    return this.done
      ? this.transloco.translate(
          'battle.ariaScore',
          { teamA: a, scoreA: this.shown.a, scoreB: this.shown.b, teamB: b },
          'tournament/pt-BR',
        )
      : this.transloco.translate('battle.ariaNoScore', { teamA: a, teamB: b }, 'tournament/pt-BR');
  }

  nameOf(id: string): string {
    return (
      this.players().find((player) => player.id === id)?.name ??
      this.transloco.translate('battle.tbd', {}, 'tournament/pt-BR')
    );
  }
  photoOf(id: string): string | undefined {
    return this.players().find((player) => player.id === id)?.photoDataUrl;
  }
  private teamName(ids: readonly string[]): string {
    return ids.map((id) => this.nameOf(id)).join(` ${this.transloco.translate('battle.and', {}, 'tournament/pt-BR')} `);
  }
}
