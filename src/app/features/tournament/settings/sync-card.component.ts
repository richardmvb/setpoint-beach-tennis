import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import { SyncErrorText } from '../../../core/sync/sync-error-text';
import { TournamentStore } from '../data/tournament.store';

/** Online and offline: the sync status, the switch that pauses it and "Sincronizar agora". The shell does the work. */
@Component({
  selector: 'article[appSyncCard]',
  imports: [FormsModule, TranslocoDirective, ButtonComponent],
  providers: [provideTranslocoScope('organizer')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'surface-card full-card data-card' },
  templateUrl: './sync-card.component.html',
})
export class SyncCardComponent {
  protected readonly store = inject(TournamentStore);
  protected readonly syncErrors = inject(SyncErrorText);
}
