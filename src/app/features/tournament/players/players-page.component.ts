import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import { CardComponent } from '@ui/card/card.component';
import { PlayerAvatarComponent } from '../../player-avatar.component';
import { TournamentStore } from '../data/tournament.store';

/**
 * Jogadores: the roster. Once the organizer reaches this page the schedule exists, so the list is locked: the form
 * and the buttons are drawn disabled and have no handlers (the setup wizard is where athletes are added).
 */
@Component({
  selector: 'section[appPlayersPage]',
  imports: [TranslocoDirective, ButtonComponent, CardComponent, PlayerAvatarComponent],
  providers: [provideTranslocoScope('organizer')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'content-grid' },
  templateUrl: './players-page.component.html',
  styleUrl: './players-page.component.css',
})
export class PlayersPageComponent {
  protected readonly store = inject(TournamentStore);

  protected number(index: number): string {
    return (index + 1).toString().padStart(2, '0');
  }
}
