import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { PodiumPlace } from '../../../core/finals.service';
import type { FinalStage, Player } from '../../../core/models';
import { BattleCardComponent } from '../../battle-card.component';
import { FinalLiveScoreComponent } from '../../final-live-score.component';
import { PodiumComponent } from '../../podium.component';

/** The final phase: every final match, then the podium and the guest's own place once it is over. */
@Component({
  selector: 'app-guest-finals',
  imports: [TranslocoDirective, BattleCardComponent, FinalLiveScoreComponent, PodiumComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  templateUrl: './guest-finals.component.html',
})
export class GuestFinalsComponent {
  readonly finals = input.required<FinalStage>();
  readonly players = input<Player[]>([]);
  readonly podium = input<PodiumPlace[]>([]);
  readonly highlightId = input('');
  /** The guest's place; 0 when the viewer is not a player. */
  readonly place = input(0);
  /** The outcome of the last share, shown under the button. */
  readonly shareMessage = input('');
  readonly shareRequested = output<void>();
}
