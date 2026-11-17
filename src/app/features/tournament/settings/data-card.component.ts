import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import { SavedTournaments } from '../../../core/saved-tournaments';
import { TournamentStore } from '../data/tournament.store';

/**
 * Backup and maintenance: the saved tournaments, export, import (the file is handed to the shell, which confirms
 * and replaces the tournament) and "Iniciar novo torneio".
 */
@Component({
  selector: 'article[appDataCard]',
  imports: [TranslocoDirective, ButtonComponent],
  providers: [provideTranslocoScope('organizer')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'surface-card full-card data-card data-card-primary' },
  templateUrl: './data-card.component.html',
  styleUrl: './data-card.component.css',
})
export class DataCardComponent {
  protected readonly store = inject(TournamentStore);
  protected readonly saved = inject(SavedTournaments);

  protected pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // So the same file can be chosen again.
    input.value = '';
    if (file) this.store.request({ kind: 'importBackup', file });
  }
}
