import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { provideTranslocoScope, TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import { CardComponent } from '@ui/card/card.component';
import { LocalLiveLink } from '../../../core/local-live-link';
import { TournamentReportComponent } from '../components/tournament-report.component';
import { TournamentStore } from '../data/tournament.store';
import { DataCardComponent } from './data-card.component';
import { LiveLinkCardComponent } from './live-link-card.component';
import { SyncCardComponent } from './sync-card.component';

/**
 * Ajustes: the rules of the competition (locked once the schedule exists), how the table is built, the final report,
 * the live link, the sync card, the backup and maintenance card and the way back to the landing page. The cards that
 * carry their own actions are children that are the `<article>` themselves.
 */
@Component({
  selector: 'section[appSettingsPage]',
  imports: [
    FormsModule,
    TranslocoDirective,
    TranslocoPipe,
    ButtonComponent,
    CardComponent,
    TournamentReportComponent,
    LiveLinkCardComponent,
    SyncCardComponent,
    DataCardComponent,
  ],
  providers: [provideTranslocoScope('organizer')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'content-grid settings-page' },
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.css',
})
export class SettingsPageComponent {
  protected readonly store = inject(TournamentStore);
  protected readonly liveLink = inject(LocalLiveLink);
}
