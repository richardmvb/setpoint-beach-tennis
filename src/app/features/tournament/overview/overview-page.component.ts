import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import { CardComponent } from '@ui/card/card.component';
import { OwnedSharedTournament } from '../../../core/owned-shared-tournament';
import { TournamentStore } from '../data/tournament.store';

/**
 * Visão geral: the numbers of the tournament, its progress and elapsed time, and, for a shared tournament's
 * moderator, the invite card (copy it, renew it, or cancel and start over). The page is the `<section>` itself.
 */
@Component({
  selector: 'section[appOverviewPage]',
  imports: [DatePipe, TranslocoDirective, TranslocoPipe, ButtonComponent, CardComponent],
  providers: [provideTranslocoScope('organizer')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'content-grid' },
  templateUrl: './overview-page.component.html',
  styleUrl: './overview-page.component.css',
})
export class OverviewPageComponent {
  protected readonly store = inject(TournamentStore);
  protected readonly owned = inject(OwnedSharedTournament);
  /** The moderator of a shared tournament sees the invite card. */
  protected readonly showInvite = computed(
    () => this.store.isShared() && this.owned.moderator() && !!this.store.state().sharedTournamentId,
  );

  constructor() {
    // What the setup wizard left (a copied link, an error) is not news here.
    this.owned.clearMessages();
  }
}
