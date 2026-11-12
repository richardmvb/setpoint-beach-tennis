import { ChangeDetectionStrategy, Component, Input, input } from '@angular/core';

import { Match, Player } from '../core/models';
import { PlayerAvatarComponent } from './player-avatar.component';

/** Versus card used when watching a tournament: two teams, a big scoreboard, a clear winner. */
@Component({
  selector: 'app-battle-card',
  standalone: true,
  imports: [PlayerAvatarComponent],
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
            <span class="battle-win">VENCEU</span>
          }
        </div>
        <div
          class="battle-board"
          [class.win-a]="winner === 'A'"
          [class.win-b]="winner === 'B'"
          role="img"
          [attr.aria-label]="ariaScore"
        >
          @for (value of [match.scoreA]; track value) {
            <span class="battle-score score-a">{{ value ?? '–' }}</span>
          }
          <span class="battle-vs" aria-hidden="true">VS</span>
          @for (value of [match.scoreB]; track value) {
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
            <span class="battle-win">VENCEU</span>
          }
        </div>
      </div>
      @if (match.tieBreakA != null && match.tieBreakB != null) {
        <small class="battle-tie">Tie-break {{ match.tieBreakA }}–{{ match.tieBreakB }}</small>
      }
    </div>
  `,
})
export class BattleCardComponent {
  @Input({ required: true }) match!: Match;
  readonly players = input<Player[]>([]);
  readonly highlightId = input('');
  readonly label = input('');
  /** The round currently on court: unscored matches are shown as "em quadra". */
  readonly live = input(false);

  get done(): boolean {
    return this.match.scoreA !== null && this.match.scoreB !== null;
  }
  get inPlay(): boolean {
    return this.live() && !this.done;
  }
  get winner(): 'A' | 'B' | null {
    if (!this.done || this.match.scoreA === this.match.scoreB) return null;
    return (this.match.scoreA as number) > (this.match.scoreB as number) ? 'A' : 'B';
  }
  get mine(): boolean {
    const highlightId = this.highlightId();
    return !!highlightId && [...this.match.teamA, ...this.match.teamB].includes(highlightId);
  }
  get statusLabel(): string {
    return this.done ? 'ENCERRADA' : this.live() ? 'EM QUADRA' : 'AGUARDANDO';
  }
  get ariaScore(): string {
    return this.done
      ? `${this.teamName(this.match.teamA)} ${this.match.scoreA} contra ${this.match.scoreB} ${this.teamName(this.match.teamB)}`
      : `${this.teamName(this.match.teamA)} contra ${this.teamName(this.match.teamB)}, sem placar`;
  }

  nameOf(id: string): string {
    return this.players().find((player) => player.id === id)?.name ?? 'A definir';
  }
  photoOf(id: string): string | undefined {
    return this.players().find((player) => player.id === id)?.photoDataUrl;
  }
  private teamName(ids: readonly string[]): string {
    return ids.map((id) => this.nameOf(id)).join(' e ');
  }
}
