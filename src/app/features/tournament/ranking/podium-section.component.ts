import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import { PlayerAvatarComponent } from '../../player-avatar.component';
import { PodiumComponent } from '../components/podium.component';
import { TournamentStore } from '../data/tournament.store';

/**
 * Once the finals are complete: the podium, the button that finishes the tournament and the picker of the athlete the
 * results image is made for. It is part of the finals card, so it reads the page's store.
 */
@Component({
  selector: 'app-podium-section',
  imports: [TranslocoDirective, ButtonComponent, PlayerAvatarComponent, PodiumComponent],
  providers: [provideTranslocoScope('organizer')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './podium-section.component.html',
  styleUrl: './podium-section.component.css',
})
export class PodiumSectionComponent {
  protected readonly store = inject(TournamentStore);

  protected async finalize(): Promise<void> {
    if (!(await this.store.finalizeTournament())) return;
    this.store.finalized();
    this.store.request({ kind: 'finalized' });
  }
}
