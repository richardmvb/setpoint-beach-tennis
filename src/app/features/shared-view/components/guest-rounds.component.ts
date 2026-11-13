import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoDirective } from '@jsverse/transloco';
import type { Player, Round, TournamentState } from '../../../core/models';
import { roundDone } from '../../../domain/tournament-view/progress';
import { BattleCardComponent } from '../../battle-card.component';

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

  protected done(round: Round): boolean {
    return roundDone(this.state(), round.number - 1);
  }
}
