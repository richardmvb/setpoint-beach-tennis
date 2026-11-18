import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoDirective } from '@jsverse/transloco';
import type { Player, Round, TournamentState } from '../../../core/models';
import { usesGroupQualification } from '../../../domain/tournament-view/format';
import { roundDone } from '../../../domain/tournament-view/progress';
import { BattleCardComponent } from '../../tournament/components/battle-card.component';

/** The round on court, then every other round folded. */
@Component({
  selector: 'app-guest-rounds',
  imports: [NgTemplateOutlet, TranslocoDirective, BattleCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  templateUrl: './guest-rounds.component.html',
})
export class GuestRoundsComponent {
  /** The whole tournament: a round is done when all its scheduled matches are, even the ones hidden here. */
  readonly state = input.required<TournamentState>();
  readonly spotlight = input<Round | null>(null);
  readonly history = input<Round[]>([]);
  readonly players = input<Player[]>([]);
  readonly highlightId = input('');

  /** Who sits out a round: shown for the 20-player format, where groups of 5 always leave one athlete resting. */
  protected resting(round: Round): string {
    if (!usesGroupQualification(this.state())) return '';
    const names = new Map(this.players().map((player) => [player.id, player.name]));
    return round.restingPlayerIds
      .map((id) => names.get(id) ?? '')
      .filter(Boolean)
      .join(', ');
  }

  protected done(round: Round): boolean {
    return roundDone(this.state(), round.number - 1);
  }
}
